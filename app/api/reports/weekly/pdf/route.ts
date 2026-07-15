import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { getWeeklyReportById, getWeeklyReportChatActivity } from '@/lib/weekly-health-report'
import { getWeeklyReportRequestUser } from '@/lib/weekly-report-request-auth'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type SeriesPoint = { date: string; value: number }

const PDF_LINK_TTL_MS = 60 * 1000

function getPdfLinkSecret() {
  return process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || process.env.JWT_SECRET || ''
}

function base64UrlEncode(value: string | Buffer) {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value)
  return buffer
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

function base64UrlDecode(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  return Buffer.from(padded, 'base64').toString('utf8')
}

function signPdfPayload(payload: string) {
  const secret = getPdfLinkSecret()
  if (!secret) return ''
  return base64UrlEncode(createHmac('sha256', secret).update(payload).digest())
}

function createPdfAccessToken(userId: string, reportId: string) {
  const payload = base64UrlEncode(JSON.stringify({
    userId,
    reportId,
    expiresAt: Date.now() + PDF_LINK_TTL_MS,
  }))
  const signature = signPdfPayload(payload)
  if (!signature) return ''
  return `${payload}.${signature}`
}

function getUserIdFromPdfAccessToken(token: string, reportId: string) {
  const [payload, signature] = String(token || '').split('.')
  if (!payload || !signature) return ''

  const expected = signPdfPayload(payload)
  if (!expected) return ''

  const actualBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expected)
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
    return ''
  }

  try {
    const parsed = JSON.parse(base64UrlDecode(payload))
    if (String(parsed?.reportId || '') !== reportId) return ''
    if (Number(parsed?.expiresAt || 0) < Date.now()) return ''
    return String(parsed?.userId || '')
  } catch {
    return ''
  }
}

function parseReportPayload(payload: any) {
  if (!payload) return null
  if (typeof payload === 'string') {
    try {
      return JSON.parse(payload)
    } catch {
      return null
    }
  }
  if (typeof payload !== 'object') return null
  return payload
}

function normalizeDateKey(value: Date) {
  return value.toISOString().slice(0, 10)
}

function toRangeDates(start: Date, end: Date) {
  const days: string[] = []
  const cursor = new Date(start.getTime())
  const endKey = normalizeDateKey(end)
  while (true) {
    const key = normalizeDateKey(cursor)
    days.push(key)
    if (key === endKey) break
    cursor.setUTCDate(cursor.getUTCDate() + 1)
    if (days.length > 10) break
  }
  return days
}

function buildSeries(days: string[], raw: Array<{ date: string; value: number }>): SeriesPoint[] {
  const map = new Map<string, number>()
  raw.forEach((row) => {
    map.set(row.date, (map.get(row.date) || 0) + row.value)
  })
  return days.map((day) => ({ date: day, value: map.get(day) || 0 }))
}

function hasChartData(series: SeriesPoint[]) {
  const nonZero = series.filter((point) => Number.isFinite(point.value) && point.value > 0)
  return nonZero.length >= 2
}

function formatRange(start: string, end: string) {
  if (!start || !end) return ''
  return `${start} to ${end}`
}

function asArray(value: unknown): any[] {
  return Array.isArray(value) ? value : []
}

function safeNumber(value: unknown, digits = 0) {
  const number = Number(value)
  if (!Number.isFinite(number)) return '0'
  return number.toLocaleString('en-AU', { maximumFractionDigits: digits, minimumFractionDigits: digits })
}

function safeOptionalNumber(value: unknown, digits = 0) {
  if (value === null || value === undefined || value === '') return 'Not available'
  const number = Number(value)
  if (!Number.isFinite(number)) return 'Not available'
  return number.toLocaleString('en-AU', { maximumFractionDigits: digits, minimumFractionDigits: digits })
}

function formatMl(value: unknown) {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return '0 ml'
  return amount >= 1000 ? `${safeNumber(amount / 1000, 2)} L` : `${safeNumber(amount)} ml`
}

function savedDateKey(value: unknown) {
  return String(value || '').slice(0, 10)
}

function pdfSafeText(value: unknown) {
  return String(value ?? '')
    .replace(/[–—]/g, '-')
    .replace(/→/g, '->')
    .replace(/•/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .normalize('NFKD')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '')
}

function describeSavedItem(item: any, fallback: string) {
  if (typeof item === 'string') return item
  const title = item?.name || item?.label || item?.topic || item?.goal || item?.summary || fallback
  const detail = item?.why || item?.reason || item?.description || item?.body || item?.note || item?.content || ''
  return detail && detail !== title ? `${title}: ${detail}` : String(title || fallback)
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const reportId = searchParams.get('reportId')
    if (!reportId) {
      return NextResponse.json({ error: 'Missing reportId' }, { status: 400 })
    }

    const requestUser = await getWeeklyReportRequestUser(request)
    const userId = requestUser?.id || getUserIdFromPdfAccessToken(String(searchParams.get('accessToken') || ''), reportId)
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const report = await getWeeklyReportById(userId, reportId)
    if (!report) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 })
    }

    if (report.status !== 'READY') {
      return NextResponse.json({ error: 'Report not ready' }, { status: 403 })
    }

    const periodStart = report.periodStart ? new Date(`${report.periodStart}T00:00:00Z`) : new Date(Date.now() - 6 * 86400000)
    const periodEnd = report.periodEnd ? new Date(`${report.periodEnd}T23:59:59Z`) : new Date()
    const days = toRangeDates(periodStart, periodEnd)

    const parsedSummary = typeof report.dataSummary === 'string'
      ? parseReportPayload(report.dataSummary)
      : report.dataSummary
    const nutritionSummary = (parsedSummary as any)?.nutritionSummary || {}
    const hydrationSummary = (parsedSummary as any)?.hydrationSummary || {}
    const moodSummary = (parsedSummary as any)?.moodSummary || {}
    const exerciseSummary = (parsedSummary as any)?.exerciseSummary || {}
    const dailyStats = asArray((parsedSummary as any)?.dailyStats)

    const moodSeriesRaw = asArray(moodSummary.dailyAverages).map((row) => ({ date: savedDateKey(row.date), value: Number(row.avgMood || 0) }))
    const checkinSeriesRaw = dailyStats.map((row) => ({ date: savedDateKey(row.date), value: Number(row.checkinCount || 0) }))
    const foodSeriesRaw = asArray(nutritionSummary.dailyTotals).map((row) => ({ date: savedDateKey(row.date), value: Number(row.calories || 0) }))
    const waterSeriesRaw = asArray(hydrationSummary.dailyTotals).map((row) => ({ date: savedDateKey(row.date), value: Number(row.totalMl || 0) }))
    const exerciseSeriesRaw = dailyStats.map((row) => ({ date: savedDateKey(row.date), value: Number(row.exerciseMinutes || 0) }))
    const symptomSeriesRaw = dailyStats.map((row) => ({ date: savedDateKey(row.date), value: Number(row.symptomCount || 0) }))

    const moodSeries = buildSeries(days, moodSeriesRaw)
    const checkinSeries = buildSeries(days, checkinSeriesRaw)
    const foodSeries = buildSeries(days, foodSeriesRaw)
    const waterSeries = buildSeries(days, waterSeriesRaw)
    const exerciseSeries = buildSeries(days, exerciseSeriesRaw)
    const symptomSeries = buildSeries(days, symptomSeriesRaw)

    const payload = parseReportPayload(report.report)
    const summaryText = report.summary || payload?.summary || ''
    const wins = Array.isArray(payload?.wins) ? payload.wins : []
    const gaps = Array.isArray(payload?.gaps) ? payload.gaps : []
    const sections = payload?.sections || {}
    const coverage = (parsedSummary as any)?.coverage || {}
    const checkinSummary = (parsedSummary as any)?.checkinSummary || {}
    const symptomSummary = (parsedSummary as any)?.symptomSummary || {}
    const journalSummary = (parsedSummary as any)?.journalSummary || {}
    const medicalImageSummary = (parsedSummary as any)?.medicalImageSummary || {}
    const labHighlights = asArray((parsedSummary as any)?.labHighlights)
    const verifiedChatActivity = await getWeeklyReportChatActivity(userId, report.periodStart, report.periodEnd)
    const talkToAiSummary = verifiedChatActivity.verified
      ? {
          userMessageCount: verifiedChatActivity.userMessageCount,
          activeDays: verifiedChatActivity.activeDays,
          sourceBreakdown: verifiedChatActivity.sourceBreakdown,
        }
      : null
    const labTrendSummary = (parsedSummary as any)?.labTrends as
      | Array<{ name?: string; latestValue?: number; previousValue?: number; unit?: string | null; direction?: string }>
      | undefined

    const doc = await PDFDocument.create()
    const pageSize: [number, number] = [595.28, 841.89]
    let page = doc.addPage(pageSize)
    const font = await doc.embedFont(StandardFonts.Helvetica)
    const fontBold = await doc.embedFont(StandardFonts.HelveticaBold)
    const margin = 40
    let cursorY = page.getHeight() - margin

    const wrapText = (text: string, f: any, size: number, maxWidth: number): string[] => {
      const words = pdfSafeText(text).split(/\s+/)
      const lines: string[] = []
      let line = ''
      words.forEach((w) => {
        const test = line ? `${line} ${w}` : w
        const width = f.widthOfTextAtSize(test, size)
        if (width > maxWidth && line) {
          lines.push(line)
          line = w
        } else {
          line = test
        }
      })
      if (line) lines.push(line)
      return lines
    }

    const newPage = () => {
      page = doc.addPage(pageSize)
      cursorY = page.getHeight() - margin
    }

    const drawText = (text: string, size = 12, bold = false, color = rgb(0.1, 0.12, 0.18)) => {
      const lines = wrapText(pdfSafeText(text), bold ? fontBold : font, size, page.getWidth() - margin * 2)
      lines.forEach((line) => {
        if (cursorY < margin + 20) newPage()
        page.drawText(line, { x: margin, y: cursorY, size, font: bold ? fontBold : font, color })
        cursorY -= size + 4
      })
    }

    const drawHeading = (text: string) => {
      drawText(text, 18, true, rgb(0.02, 0.45, 0.31))
      cursorY -= 4
    }

    const drawSubheading = (text: string) => {
      cursorY -= 6
      drawText(text, 13, true, rgb(0.05, 0.3, 0.2))
      cursorY -= 2
    }

    const drawDetailSection = (title: string, lines: Array<string | null | undefined>, emptyMessage: string) => {
      drawSubheading(title)
      const completeLines = lines.map((line) => pdfSafeText(line)).filter(Boolean)
      if (!completeLines.length) {
        drawText(emptyMessage, 10, false, rgb(0.4, 0.42, 0.46))
      } else {
        completeLines.forEach((line) => drawText(`- ${line}`, 10, false, rgb(0.2, 0.22, 0.28)))
      }
      cursorY -= 4
    }

    const drawChartFrame = (x: number, y: number, width: number, height: number, title: string) => {
      page.drawRectangle({
        x,
        y,
        width,
        height,
        color: rgb(0.97, 0.98, 0.98),
        borderColor: rgb(0.86, 0.89, 0.9),
        borderWidth: 1,
      })
      page.drawText(title, { x: x + 8, y: y + height - 16, size: 10, font: fontBold, color: rgb(0.12, 0.14, 0.2) })
      return {
        chartX: x + 8,
        chartY: y + 20,
        chartWidth: width - 16,
        chartHeight: height - 40,
      }
    }

    const drawLineChart = (x: number, y: number, width: number, height: number, title: string, series: SeriesPoint[], color: { r: number; g: number; b: number }) => {
      const frame = drawChartFrame(x, y, width, height, title)
      const values = series.map((p) => p.value)
      if (values.length < 2) return
      const max = Math.max(...values)
      const min = Math.min(...values)
      const range = max - min || 1
      const stepX = frame.chartWidth / Math.max(1, values.length - 1)
      let prevX = frame.chartX
      let prevY = frame.chartY + ((values[0] - min) / range) * frame.chartHeight
      series.forEach((point, index) => {
        const labelX = frame.chartX + stepX * index
        page.drawText(pdfSafeText(point.date).slice(5), { x: Math.max(frame.chartX, labelX - 9), y: y + 6, size: 5.5, font, color: rgb(0.35, 0.38, 0.42) })
      })
      for (let i = 1; i < values.length; i += 1) {
        const xPos = frame.chartX + stepX * i
        const yPos = frame.chartY + ((values[i] - min) / range) * frame.chartHeight
        page.drawLine({
          start: { x: prevX, y: prevY },
          end: { x: xPos, y: yPos },
          thickness: 1.5,
          color: rgb(color.r, color.g, color.b),
        })
        page.drawText(safeNumber(values[i], 1), { x: Math.max(frame.chartX, xPos - 6), y: Math.min(y + height - 27, yPos + 3), size: 5.5, font, color: rgb(0.25, 0.28, 0.32) })
        prevX = xPos
        prevY = yPos
      }
    }

    const drawBarChart = (x: number, y: number, width: number, height: number, title: string, series: SeriesPoint[], color: { r: number; g: number; b: number }) => {
      const frame = drawChartFrame(x, y, width, height, title)
      const values = series.map((p) => p.value)
      if (values.length === 0) return
      const max = Math.max(...values, 1)
      const barWidth = frame.chartWidth / Math.max(1, values.length)
      values.forEach((value, idx) => {
        const barHeight = (value / max) * frame.chartHeight
        const barX = frame.chartX + idx * barWidth + 1
        page.drawRectangle({
          x: barX,
          y: frame.chartY,
          width: Math.max(2, barWidth - 2),
          height: barHeight,
          color: rgb(color.r, color.g, color.b),
        })
        page.drawText(safeNumber(value, value % 1 ? 1 : 0), { x: barX, y: Math.min(y + height - 27, frame.chartY + barHeight + 2), size: 5.5, font, color: rgb(0.25, 0.28, 0.32) })
        page.drawText(pdfSafeText(series[idx]?.date).slice(5), { x: barX, y: y + 6, size: 5.5, font, color: rgb(0.35, 0.38, 0.42) })
      })
    }

    drawHeading('Helfi 7-day Health Report')
    drawText(`Report period: ${formatRange(report.periodStart, report.periodEnd)}`, 10, false, rgb(0.35, 0.38, 0.42))
    cursorY -= 6

    if (summaryText) {
      drawDetailSection('Weekly summary', [summaryText], 'No weekly summary was saved.')
    }

    if (wins.length || gaps.length) {
      drawSubheading('Highlights')
      const winText = wins.length ? wins.map((item: any) => describeSavedItem(item, 'Win')).join(' | ') : 'No clear wins this week.'
      const gapText = gaps.length ? gaps.map((item: any) => describeSavedItem(item, 'Gap')).join(' | ') : 'No major gaps flagged.'
      drawDetailSection('What is working', [winText], 'No clear wins were saved for this week.')
      drawDetailSection('Needs more attention', [gapText], 'No major gaps were saved for this week.')
    }

    drawHeading('Data used this week')
    drawText('These figures come from the selected saved report. AI chats are checked against saved chat history when the PDF is created.', 10, false, rgb(0.35, 0.38, 0.42))
    drawDetailSection('Weekly data coverage', [
      `Food logs: ${safeNumber(coverage.foodCount)}`,
      `Water logs: ${safeNumber(coverage.waterCount)}`,
      `Mood entries: ${safeNumber(coverage.moodCount)}`,
      `Check-ins: ${safeNumber(coverage.checkinCount)}`,
      `Symptoms: ${safeNumber(coverage.symptomCount)}`,
      `Exercise: ${safeNumber(coverage.exerciseCount)}`,
      `Journal notes: ${safeNumber(coverage.journalCount)}`,
      `Health image notes: ${safeNumber(coverage.medicalImageCount)}`,
      `Lab uploads: ${safeNumber(coverage.labCount)}`,
      verifiedChatActivity.verified ? `AI chats: ${safeNumber(verifiedChatActivity.userMessageCount)} verified saved prompts` : 'AI chats: saved chat history could not be verified',
      `Hydration summary: ${safeNumber(hydrationSummary.entries ?? coverage.waterCount)} logs, ${formatMl(hydrationSummary.totalMl)} total, ${formatMl(hydrationSummary.dailyAverageMl)} daily average`,
    ], 'No weekly data was saved.')

    drawHeading('Complete saved report details')
    drawDetailSection('Food logs', [
      `Logs: ${safeNumber(coverage.foodCount)}; days logged: ${safeNumber(nutritionSummary.daysWithLogs)}/7; daily average: ${safeNumber(nutritionSummary?.dailyAverages?.calories)} kcal, ${safeNumber(nutritionSummary?.dailyAverages?.protein_g, 1)} g protein, ${safeNumber(nutritionSummary?.dailyAverages?.carbs_g, 1)} g carbs, ${safeNumber(nutritionSummary?.dailyAverages?.fat_g, 1)} g fat`,
      ...asArray(nutritionSummary.dailyTotals).map((row) => `${row.date || 'Day'}: ${safeNumber(row.calories)} kcal, ${safeNumber(row.protein_g, 1)} g protein, ${safeNumber(row.carbs_g, 1)} g carbs, ${safeNumber(row.fat_g, 1)} g fat`),
      ...asArray(nutritionSummary.topFoods).map((item) => `Most logged food - ${item.name || 'Food'}: ${safeNumber(item.count)} logs`),
    ], 'No food logs were saved for this week.')

    drawDetailSection('Water logs and hydration summary', [
      `Logs: ${safeNumber(coverage.waterCount ?? hydrationSummary.entries)}; days logged: ${safeNumber(hydrationSummary.daysWithLogs)}/7; total: ${formatMl(hydrationSummary.totalMl)}; daily average: ${formatMl(hydrationSummary.dailyAverageMl)}`,
      ...asArray(hydrationSummary.dailyTotals).map((row) => `${row.date || 'Day'}: ${formatMl(row.totalMl)}`),
      ...asArray(hydrationSummary.topDrinks).map((item) => `Most logged drink - ${item.label || item.name || 'Drink'}: ${safeNumber(item.count)} logs`),
    ], 'No water logs were saved for this week.')

    drawDetailSection('Mood entries', [
      `Entries: ${safeNumber(coverage.moodCount ?? moodSummary.entries)}; days logged: ${safeNumber(moodSummary.daysWithLogs)}/7; average mood: ${safeNumber(moodSummary.averageMood, 1)}`,
      ...asArray(moodSummary.dailyAverages).map((row) => `${row.date || 'Day'}: ${safeNumber(row.avgMood, 1)} average mood`),
      ...asArray(moodSummary.topTags).map((item) => `Common tag - ${item.name || 'Mood'}: ${safeNumber(item.count)} times`),
      ...asArray(moodSummary.notes).map((item) => `Saved note ${item.createdAt || ''}: ${item.content || item.note || ''}`),
    ], 'No mood entries were saved for this week.')

    drawDetailSection('Check-ins', [
      `Ratings saved: ${safeNumber(coverage.checkinCount ?? checkinSummary.totalEntries)}${Number.isFinite(Number(checkinSummary.overallAvg)) ? `; overall average: ${safeNumber(checkinSummary.overallAvg, 1)}` : '; detailed goal scores were not included in this saved report'}`,
      ...dailyStats.map((row) => `${row.date || 'Day'}: ${safeNumber(row.checkinCount)} ratings`),
      ...asArray(checkinSummary.goals).map((item) => `${item.goal || 'Goal'}: ${safeNumber(item.avgRating, 1)} average${item.trend == null ? '' : `, ${safeNumber(item.trend, 1)} change`}`),
      ...asArray(checkinSummary.notes).map((item) => `Check-in note ${item.createdAt || ''}: ${item.content || item.note || ''}`),
    ], 'No check-ins were saved for this week.')

    drawDetailSection('Symptoms', [
      `Entries: ${safeNumber(coverage.symptomCount ?? symptomSummary.entries)}; days logged: ${safeNumber(symptomSummary.daysWithLogs)}/7; unique symptoms: ${safeNumber(symptomSummary.uniqueSymptoms)}`,
      ...dailyStats.map((row) => `${row.date || 'Day'}: ${safeNumber(row.symptomCount)} symptom entries`),
      ...asArray(symptomSummary.topSymptoms).map((item) => `${item.name || 'Symptom'}: ${safeNumber(item.count)} times`),
    ], 'No symptoms were saved for this week.')

    drawDetailSection('Exercise', [
      `Sessions: ${safeNumber(coverage.exerciseCount ?? exerciseSummary.sessions)}; active days: ${safeNumber(exerciseSummary.daysActive)}/7; total movement: ${safeNumber(exerciseSummary.totalMinutes)} min; distance: ${safeNumber(exerciseSummary.totalDistanceKm, 1)} km`,
      ...dailyStats.map((row) => `${row.date || 'Day'}: ${safeNumber(row.exerciseMinutes)} min`),
      ...asArray(exerciseSummary.topActivities).map((item) => `${item.name || 'Activity'}: ${safeNumber(item.count)} sessions`),
    ], 'No exercise was saved for this week.')

    drawDetailSection('Journal notes', [
      `Notes: ${safeNumber(coverage.journalCount ?? journalSummary.entries)}; days with notes: ${safeNumber(journalSummary.daysWithNotes)}/7`,
      ...asArray(journalSummary.highlights).map((item) => `${item.date || item.createdAt || 'Saved note'}${item.time ? ` ${item.time}` : ''}: ${item.note || item.content || ''}`),
    ], 'No journal notes were saved for this week.')

    drawDetailSection('Health image notes', [
      `Notes: ${safeNumber(coverage.medicalImageCount ?? medicalImageSummary.entries)}; days with notes: ${safeNumber(medicalImageSummary.daysWithScans)}/7`,
      ...asArray(medicalImageSummary.highlights).map((item) => [
        item.summary || 'Saved health image note',
        ...asArray(item.possibleCauses).map((value) => `possible cause: ${value}`),
        ...asArray(item.nextSteps).map((value) => `next step: ${value}`),
      ].join('; ')),
    ], 'No health image notes were saved for this week.')

    drawDetailSection('Lab uploads', [
      `Uploads: ${safeNumber(coverage.labCount)}; markers shown: ${safeNumber(labHighlights.length)}; trends available: ${safeNumber(labTrendSummary?.length || 0)}`,
      ...labHighlights.map((item) => `${item.name || 'Lab marker'}: ${safeOptionalNumber(item.value, 2)}${item.unit ? ` ${item.unit}` : ''}${item.status ? `, ${item.status}` : ''}`),
      ...asArray(labTrendSummary).map((item) => `${item.name || 'Lab marker'}: ${safeOptionalNumber(item.previousValue, 2)} -> ${safeOptionalNumber(item.latestValue, 2)}${item.unit ? ` ${item.unit}` : ''} (${item.direction || 'flat'})`),
    ], 'No lab uploads were saved for this week.')

    drawDetailSection('AI chats', verifiedChatActivity.verified ? [
      `Verified saved prompts: ${safeNumber(talkToAiSummary?.userMessageCount)}; active days: ${safeNumber(talkToAiSummary?.activeDays)}/7; General chat: ${safeNumber(talkToAiSummary?.sourceBreakdown?.general?.userMessageCount)}; Food chat: ${safeNumber(talkToAiSummary?.sourceBreakdown?.food?.userMessageCount)}`,
      ...(verifiedChatActivity.userMessageCount > 0 ? [] : ['No saved AI chats were found for this week.']),
    ] : ['Saved chat history could not be verified. Helfi has not shown the older generated count as fact.'], 'No saved AI chats were found for this week.')

    drawSubheading('Progress charts')
    const charts: Array<{ type: 'line' | 'bar'; title: string; series: SeriesPoint[]; color: { r: number; g: number; b: number } }> = []
    if (hasChartData(moodSeries)) charts.push({ type: 'line', title: 'Mood trend', series: moodSeries, color: { r: 0.2, g: 0.5, b: 0.8 } })
    if (hasChartData(checkinSeries)) charts.push({ type: 'line', title: 'Check-in scores', series: checkinSeries, color: { r: 0.15, g: 0.6, b: 0.4 } })
    if (hasChartData(foodSeries)) charts.push({ type: 'bar', title: 'Food calories', series: foodSeries, color: { r: 0.9, g: 0.55, b: 0.25 } })
    if (hasChartData(waterSeries)) charts.push({ type: 'bar', title: 'Hydration total (ml)', series: waterSeries, color: { r: 0.2, g: 0.6, b: 0.85 } })
    if (hasChartData(exerciseSeries)) charts.push({ type: 'bar', title: 'Exercise minutes', series: exerciseSeries, color: { r: 0.55, g: 0.4, b: 0.8 } })
    if (hasChartData(symptomSeries)) charts.push({ type: 'bar', title: 'Symptom check-ins', series: symptomSeries, color: { r: 0.85, g: 0.35, b: 0.35 } })

    if (charts.length === 0) {
      drawText('Not enough logged data this week to chart progress. Keep tracking daily to unlock charts.', 10, false, rgb(0.4, 0.42, 0.46))
    } else {
      const gap = 12
      const chartWidth = (page.getWidth() - margin * 2 - gap) / 2
      const chartHeight = 120
      let rowY = cursorY - chartHeight
      let col = 0
      charts.forEach((chart, idx) => {
        if (rowY < margin + chartHeight) {
          newPage()
          rowY = cursorY - chartHeight
        }
        const x = margin + col * (chartWidth + gap)
        const y = rowY
        if (chart.type === 'line') {
          drawLineChart(x, y, chartWidth, chartHeight, chart.title, chart.series, chart.color)
        } else {
          drawBarChart(x, y, chartWidth, chartHeight, chart.title, chart.series, chart.color)
        }
        col += 1
        if (col > 1 || idx === charts.length - 1) {
          col = 0
          rowY -= chartHeight + 16
        }
      })
      cursorY = rowY - 8
    }

    const sectionOrder = ['overview', 'supplements', 'medications', 'nutrition', 'hydration', 'exercise', 'lifestyle', 'labs', 'mood', 'symptoms']
    const sectionLabels: Record<string, string> = {
      overview: 'Overview',
      supplements: 'Supplements',
      medications: 'Medications',
      nutrition: 'Nutrition',
      hydration: 'Hydration',
      exercise: 'Exercise',
      lifestyle: 'Lifestyle',
      labs: 'Labs',
      mood: 'Mood',
      symptoms: 'Symptoms',
    }
    const sectionBlocks = sectionOrder
      .map((key) => ({ key, label: sectionLabels[key], data: sections?.[key] }))
      .filter((section) => section.data)

    if (sectionBlocks.length) {
      drawSubheading('Focus areas')
      sectionBlocks.forEach((section) => {
        const working = asArray(section.data?.working)
        const suggested = asArray(section.data?.suggested)
        const avoid = asArray(section.data?.avoid)
        drawDetailSection(section.label, [
          ...working.map((item: any) => `Working - ${describeSavedItem(item, 'Item')}`),
          ...suggested.map((item: any) => `Suggested - ${describeSavedItem(item, 'Item')}`),
          ...avoid.map((item: any) => `Avoid - ${describeSavedItem(item, 'Item')}`),
        ], 'No guidance was saved for this area.')
      })
    }

    doc.getPages().forEach((pdfPage, index, allPages) => {
      pdfPage.drawText(`Helfi weekly health report - page ${index + 1} of ${allPages.length}`, {
        x: margin,
        y: 16,
        size: 8,
        font,
        color: rgb(0.45, 0.48, 0.52),
      })
    })

    const pdfBytes = await doc.save()

    return new Response(pdfBytes as any, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="helfi-7-day-report-${report.periodStart || 'latest'}.pdf"`,
      },
    })
  } catch (error) {
    console.error('Weekly report PDF export failed:', error)
    return NextResponse.json({ error: 'Export failed' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const requestUser = await getWeeklyReportRequestUser(request)
    if (!requestUser?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const reportId = String(body?.reportId || '').trim()
    if (!reportId) {
      return NextResponse.json({ error: 'Missing reportId' }, { status: 400 })
    }

    const report = await getWeeklyReportById(requestUser.id, reportId)
    if (!report) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 })
    }

    if (report.status !== 'READY') {
      return NextResponse.json({ error: 'Report not ready' }, { status: 403 })
    }

    const accessToken = createPdfAccessToken(requestUser.id, reportId)
    if (!accessToken) {
      return NextResponse.json({ error: 'PDF link is not configured' }, { status: 500 })
    }

    const url = new URL('/api/reports/weekly/pdf', request.url)
    url.searchParams.set('reportId', reportId)
    url.searchParams.set('accessToken', accessToken)

    return NextResponse.json({ url: url.toString() })
  } catch (error) {
    console.error('Weekly report PDF link failed:', error)
    return NextResponse.json({ error: 'PDF link failed' }, { status: 500 })
  }
}
