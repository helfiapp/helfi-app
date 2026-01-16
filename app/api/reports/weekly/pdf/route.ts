import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getWeeklyReportById } from '@/lib/weekly-health-report'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type SeriesPoint = { date: string; value: number }

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

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    let userId = session?.user?.id || ''
    if (!userId && session?.user?.email) {
      const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } })
      userId = user?.id || ''
    }
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const reportId = searchParams.get('reportId')
    if (!reportId) {
      return NextResponse.json({ error: 'Missing reportId' }, { status: 400 })
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

    const [foodLogs, waterLogs, healthLogs, exerciseLogs, exerciseEntries, moodRows, symptomAnalyses] = await Promise.all([
      prisma.foodLog.findMany({
        where: { userId, createdAt: { gte: periodStart, lte: periodEnd } },
        select: { createdAt: true, nutrients: true },
      }),
      prisma.waterLog.findMany({
        where: { userId, createdAt: { gte: periodStart, lte: periodEnd } },
        select: { createdAt: true, amountMl: true },
      }),
      prisma.healthLog.findMany({
        where: { userId, createdAt: { gte: periodStart, lte: periodEnd } },
        select: { createdAt: true, rating: true },
      }),
      prisma.exerciseLog.findMany({
        where: { userId, createdAt: { gte: periodStart, lte: periodEnd } },
        select: { createdAt: true, duration: true },
      }),
      prisma.exerciseEntry.findMany({
        where: { userId, createdAt: { gte: periodStart, lte: periodEnd } },
        select: { createdAt: true, durationMinutes: true },
      }),
      prisma.$queryRawUnsafe<Array<{ mood: number; timestamp: Date }>>(
        'SELECT mood, timestamp FROM MoodEntries WHERE userId = $1 AND timestamp >= $2 AND timestamp <= $3',
        userId,
        periodStart,
        periodEnd
      ),
      prisma.symptomAnalysis.findMany({
        where: { userId, createdAt: { gte: periodStart, lte: periodEnd } },
        select: { createdAt: true },
      }),
    ])

    const moodSeriesRaw: Array<{ date: string; value: number }> = []
    const moodBuckets = new Map<string, { total: number; count: number }>()
    moodRows.forEach((row) => {
      const key = normalizeDateKey(row.timestamp)
      const bucket = moodBuckets.get(key) || { total: 0, count: 0 }
      bucket.total += Number(row.mood || 0)
      bucket.count += 1
      moodBuckets.set(key, bucket)
    })
    moodBuckets.forEach((bucket, key) => {
      moodSeriesRaw.push({ date: key, value: bucket.count ? +(bucket.total / bucket.count).toFixed(1) : 0 })
    })

    const checkinSeriesRaw: Array<{ date: string; value: number }> = []
    const checkinBuckets = new Map<string, { total: number; count: number }>()
    healthLogs.forEach((log) => {
      const key = normalizeDateKey(log.createdAt)
      const bucket = checkinBuckets.get(key) || { total: 0, count: 0 }
      bucket.total += Number(log.rating || 0)
      bucket.count += 1
      checkinBuckets.set(key, bucket)
    })
    checkinBuckets.forEach((bucket, key) => {
      checkinSeriesRaw.push({ date: key, value: bucket.count ? +(bucket.total / bucket.count).toFixed(1) : 0 })
    })

    const foodSeriesRaw = foodLogs.map((log) => {
      const nutrients = (log.nutrients as any) || {}
      const calories = Number(nutrients.calories ?? nutrients.kcal ?? 0) || 0
      return { date: normalizeDateKey(log.createdAt), value: calories }
    })

    const waterSeriesRaw = waterLogs.map((log) => ({
      date: normalizeDateKey(log.createdAt),
      value: Number(log.amountMl ?? 0) || 0,
    }))

    const exerciseSeriesRaw = [
      ...exerciseLogs.map((log) => ({
        date: normalizeDateKey(log.createdAt),
        value: Number(log.duration ?? 0) || 0,
      })),
      ...exerciseEntries.map((entry) => ({
        date: normalizeDateKey(entry.createdAt),
        value: Number(entry.durationMinutes ?? 0) || 0,
      })),
    ]

    const symptomSeriesRaw = symptomAnalyses.map((row) => ({
      date: normalizeDateKey(row.createdAt),
      value: 1,
    }))

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
    const parsedSummary = typeof report.dataSummary === 'string'
      ? parseReportPayload(report.dataSummary)
      : report.dataSummary
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
      const words = String(text || '').split(/\s+/)
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
      const lines = wrapText(text, bold ? fontBold : font, size, page.getWidth() - margin * 2)
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

    const drawCard = (title: string, body: string, accent: { r: number; g: number; b: number }) => {
      const cardHeight = 70
      if (cursorY - cardHeight < margin) newPage()
      page.drawRectangle({
        x: margin,
        y: cursorY - cardHeight,
        width: page.getWidth() - margin * 2,
        height: cardHeight,
        color: rgb(accent.r, accent.g, accent.b),
        opacity: 0.12,
        borderColor: rgb(accent.r, accent.g, accent.b),
        borderWidth: 1,
      })
      page.drawText(title, {
        x: margin + 12,
        y: cursorY - 22,
        size: 12,
        font: fontBold,
        color: rgb(0.1, 0.12, 0.18),
      })
      const lines = wrapText(body, font, 10, page.getWidth() - margin * 2 - 24)
      let lineY = cursorY - 38
      lines.slice(0, 3).forEach((line) => {
        page.drawText(line, { x: margin + 12, y: lineY, size: 10, font, color: rgb(0.2, 0.22, 0.28) })
        lineY -= 12
      })
      cursorY -= cardHeight + 12
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
        chartY: y + 10,
        chartWidth: width - 16,
        chartHeight: height - 28,
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
      for (let i = 1; i < values.length; i += 1) {
        const xPos = frame.chartX + stepX * i
        const yPos = frame.chartY + ((values[i] - min) / range) * frame.chartHeight
        page.drawLine({
          start: { x: prevX, y: prevY },
          end: { x: xPos, y: yPos },
          thickness: 1.5,
          color: rgb(color.r, color.g, color.b),
        })
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
        page.drawRectangle({
          x: frame.chartX + idx * barWidth + 1,
          y: frame.chartY,
          width: Math.max(2, barWidth - 2),
          height: barHeight,
          color: rgb(color.r, color.g, color.b),
        })
      })
    }

    drawHeading('Helfi 7-day Health Report')
    drawText(`Report period: ${formatRange(report.periodStart, report.periodEnd)}`, 10, false, rgb(0.35, 0.38, 0.42))
    cursorY -= 6

    if (summaryText) {
      drawCard('Weekly summary', summaryText, { r: 0.08, g: 0.72, b: 0.55 })
    }

    if (wins.length || gaps.length) {
      drawSubheading('Highlights')
      const winText = wins.length ? wins.slice(0, 3).map((w: any) => w.name || 'Win').join(', ') : 'No clear wins this week.'
      const gapText = gaps.length ? gaps.slice(0, 3).map((g: any) => g.name || 'Gap').join(', ') : 'No major gaps flagged.'
      drawCard('What is working', winText, { r: 0.1, g: 0.6, b: 0.3 })
      drawCard('Needs more attention', gapText, { r: 0.9, g: 0.65, b: 0.2 })
    }

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

    const sectionOrder = ['overview', 'nutrition', 'hydration', 'exercise', 'mood', 'symptoms']
    const sectionLabels: Record<string, string> = {
      overview: 'Overview',
      nutrition: 'Nutrition',
      hydration: 'Hydration',
      exercise: 'Exercise',
      mood: 'Mood',
      symptoms: 'Symptoms',
    }
    const sectionBlocks = sectionOrder
      .map((key) => ({ key, label: sectionLabels[key], data: sections?.[key] }))
      .filter((section) => section.data)

    if (sectionBlocks.length) {
      drawSubheading('Focus areas')
      sectionBlocks.forEach((section) => {
        const working = Array.isArray(section.data?.working) ? section.data.working.slice(0, 2) : []
        const suggested = Array.isArray(section.data?.suggested) ? section.data.suggested.slice(0, 2) : []
        const avoid = Array.isArray(section.data?.avoid) ? section.data.avoid.slice(0, 2) : []
        const summary = [
          working.length ? `Working: ${working.map((item: any) => item.name || 'Item').join(', ')}` : '',
          suggested.length ? `Next: ${suggested.map((item: any) => item.name || 'Item').join(', ')}` : '',
          avoid.length ? `Avoid: ${avoid.map((item: any) => item.name || 'Item').join(', ')}` : '',
        ].filter(Boolean).join(' • ')
        if (summary) {
          drawCard(section.label, summary, { r: 0.1, g: 0.45, b: 0.32 })
        }
      })
    }

    if (labTrendSummary && labTrendSummary.length > 0) {
      drawSubheading('Lab result changes')
      labTrendSummary.slice(0, 6).forEach((trend) => {
        const name = trend?.name || 'Lab value'
        const unit = trend?.unit ? ` ${trend.unit}` : ''
        const latest = trend?.latestValue ?? '-'
        const previous = trend?.previousValue ?? '-'
        const direction = trend?.direction || 'flat'
        drawText(`${name}: ${previous} → ${latest}${unit} (${direction})`, 11, false, rgb(0.2, 0.22, 0.28))
      })
    }

    const pdfBytes = await doc.save()

    return new NextResponse(pdfBytes, {
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
