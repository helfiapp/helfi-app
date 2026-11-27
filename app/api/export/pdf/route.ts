export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { PDFDocument, PDFFont, StandardFonts, rgb } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { computeHydrationGoal } from '@/lib/hydration-goal'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const dateFilter: { gte?: Date; lte?: Date } = {}
    if (from) dateFilter.gte = new Date(from)
    if (to) dateFilter.lte = new Date(to)

    const hasRange = !!dateFilter.gte || !!dateFilter.lte

    // Load user and related data (limited for MVP)
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: {
        healthGoals: { orderBy: { updatedAt: 'desc' } },
        supplements: true,
        medications: true,
        healthLogs: hasRange ? { where: { createdAt: dateFilter } } : true,
        foodLogs: hasRange ? { where: { createdAt: dateFilter } } : true,
        waterLogs: hasRange ? { where: { createdAt: dateFilter } } : true,
        exerciseLogs: hasRange ? { where: { createdAt: dateFilter } } : true,
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Build PDF in-memory using pdf-lib (serverless friendly)
    const fmt = (d?: Date | string | null) => (d ? new Date(d).toLocaleString() : '')
    const dateRangeText = hasRange
      ? `${dateFilter.gte ? fmt(dateFilter.gte) : '…'} → ${dateFilter.lte ? fmt(dateFilter.lte) : '…'}`
      : 'All time'

    const doc = await PDFDocument.create()
    doc.registerFontkit(fontkit)
    let page = doc.addPage([595.28, 841.89]) // A4 in points
    const font = await doc.embedFont(StandardFonts.Helvetica)
    const fontBold = await doc.embedFont(StandardFonts.HelveticaBold)
    const unicodeFont = await doc.embedFont(await readFile(path.join(process.cwd(), 'assets/pdf-fonts/NotoSans-Regular.ttf')), { subset: true })
    const symbolFont = await doc.embedFont(StandardFonts.Symbol)
    const cjkBytes = await readFile(path.join(process.cwd(), 'assets/pdf-fonts/DroidSansFallback.ttf'))
    const cjkCharacters = new Set(fontkit.create(cjkBytes).characterSet)
    const regularCharacters = new Set([...font.getCharacterSet(), ...unicodeFont.getCharacterSet(), ...symbolFont.getCharacterSet()])
    const needsCjk = Array.from(JSON.stringify(user)).some(character => !regularCharacters.has(character.codePointAt(0)!) && cjkCharacters.has(character.codePointAt(0)!))
    // shortcut: this font needs full embedding; subset only after glyph-render checks pass.
    const cjkFont = needsCjk ? await doc.embedFont(cjkBytes) : null
    const regularFonts = [font, unicodeFont, ...(cjkFont ? [cjkFont] : []), symbolFont]
    const boldFonts = [fontBold, ...regularFonts.slice(1)]
    const characterSets = new Map([fontBold, ...regularFonts].map(font => [font, new Set(font.getCharacterSet())]))
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    const margin = 40
    let cursorY = page.getHeight() - margin

    const textRuns = (text: string, bold: boolean) => {
      const runs: Array<{ text: string; font: PDFFont }> = []
      for (const { segment } of segmenter.segment(text)) {
        const selected = (bold ? boldFonts : regularFonts).find(candidate =>
          Array.from(segment).every(character => characterSets.get(candidate)!.has(character.codePointAt(0)!)),
        )
        if (!selected) throw new Error('unsupported_pdf_text')
        const last = runs[runs.length - 1]
        if (last?.font === selected) last.text += segment
        else runs.push({ text: segment, font: selected })
      }
      return runs
    }
    const textWidth = (text: string, size: number, bold: boolean) =>
      textRuns(text, bold).reduce((width, run) => width + run.font.widthOfTextAtSize(run.text, size), 0)

    const newPage = () => {
      page = doc.addPage([595.28, 841.89])
      cursorY = page.getHeight() - margin
    }

    const drawText = (text: string, size = 12, bold = false, color = rgb(0.07, 0.09, 0.15)) => {
      const lines = wrapText(text, size, bold, page.getWidth() - margin * 2)
      lines.forEach((line) => {
        if (cursorY < margin + 20) { newPage() }
        let x = margin
        for (const run of textRuns(line, bold)) {
          page.drawText(run.text, { x, y: cursorY, size, font: run.font, color })
          x += run.font.widthOfTextAtSize(run.text, size)
        }
        cursorY -= size + 4
      })
    }

    const h1 = (t: string) => { drawText(t, 18, true, rgb(0.02, 0.59, 0.41)); cursorY -= 4 }
    const h2 = (t: string) => { cursorY -= 6; drawText(t, 14, true, rgb(0.04, 0.37, 0.28)); cursorY -= 2 }

    const wrapText = (text: string, size: number, bold: boolean, maxWidth: number): string[] => {
      const lines: string[] = []
      for (const rawParagraph of String(text || '').split(/\r\n|[\r\n\u2028\u2029]/)) {
        const paragraph = rawParagraph.replace(/\s/g, ' ')
        let line = ''
        for (const word of paragraph.split(/(\s+)/)) {
          if (!word) continue
          if (line && textWidth(line + word, size, bold) > maxWidth && textWidth(word, size, bold) <= maxWidth) {
            lines.push(line.trimEnd())
            line = ''
          }
          if (!line && !word.trim()) continue
          for (const { segment } of segmenter.segment(word)) {
            if (line && textWidth(line + segment, size, bold) > maxWidth) {
              lines.push(line)
              line = ''
            }
            line += segment
          }
        }
        lines.push(line.trimEnd())
      }
      return lines
    }

    const formatMl = (value: number | null | undefined) => {
      const ml = Number(value ?? 0)
      if (!Number.isFinite(ml) || ml <= 0) return '0 ml'
      if (ml >= 1000) {
        const liters = Math.round((ml / 1000) * 100) / 100
        const str = liters.toString().replace(/\.0+$/, '').replace(/(\.[1-9])0$/, '$1')
        return `${str} L`
      }
      return `${Math.round(ml)} ml`
    }

    const formatAmount = (amount: number | null | undefined, unit: string | null | undefined) => {
      const raw = Number(amount ?? 0)
      if (!Number.isFinite(raw) || raw <= 0) return ''
      const rounded = Math.round(raw * 100) / 100
      const unitLabel = (unit || '').toLowerCase() === 'l' ? 'L' : (unit || '')
      return `${rounded.toString().replace(/\.0+$/, '').replace(/(\.[1-9])0$/, '$1')} ${unitLabel}`
    }

    const readGoalCategory = (name: string) => {
      const goal = (user.healthGoals || []).find((g: any) => g?.name === name)
      if (!goal?.category) return null
      try {
        return JSON.parse(goal.category)
      } catch {
        return null
      }
    }

    const parseDietTypes = () => {
      const parsed = readGoalCategory('__DIET_PREFERENCE__')
      const raw = Array.isArray(parsed?.dietTypes) ? parsed.dietTypes : parsed?.dietType
      if (Array.isArray(raw)) return raw.filter((v: any) => typeof v === 'string' && v.trim())
      if (typeof raw === 'string' && raw.trim()) return [raw.trim()]
      return []
    }

    const parseDiabetesType = () => {
      const parsed = readGoalCategory('__ALLERGIES_DATA__')
      return typeof parsed?.diabetesType === 'string' ? parsed.diabetesType : ''
    }

    const parseBirthdate = () => {
      const parsed = readGoalCategory('__PROFILE_INFO_DATA__')
      return typeof parsed?.dateOfBirth === 'string' ? parsed.dateOfBirth : ''
    }

    const parsePrimaryGoal = () => {
      const parsed = readGoalCategory('__PRIMARY_GOAL__')
      return {
        goalChoice: typeof parsed?.goalChoice === 'string' ? parsed.goalChoice : '',
        goalIntensity: typeof parsed?.goalIntensity === 'string' ? parsed.goalIntensity : '',
      }
    }

    h1('Helfi — Your Health Summary')
    drawText(`Generated for ${user.email} • Range: ${dateRangeText}`, 10, false, rgb(0.45,0.47,0.50))

    h2('Profile')
    drawText(`Name: ${user.name || ''}`)
    drawText(`Gender: ${user.gender || ''}`)
    drawText(`Height: ${user.height ?? ''}`)
    drawText(`Weight: ${user.weight ?? ''}`)
    drawText(`Body Type: ${user.bodyType || ''}`)

    h2('Goals')
    ;(user.healthGoals || [])
      .filter((g:any)=> typeof g.name === 'string' && !g.name.startsWith('__'))
      .slice(0, 12)
      .forEach((g:any)=> drawText(`• ${g.name}${g.category?` (${g.category})`:''}${Number.isFinite(g.currentRating)?` — rating ${g.currentRating}`:''}`))

    h2('Medications & Supplements')
    ;(user.medications || []).slice(0, 12).forEach((m:any)=> drawText(`• Medication: ${m.name || ''}${m.dosage?` — ${m.dosage}`:''}${(m.timing&&m.timing.length)?` — ${(m.timing||[]).join(', ')}`:''}`))
    ;(user.supplements || []).slice(0, 12).forEach((s:any)=> drawText(`• Supplement: ${s.name || ''}${s.dosage?` — ${s.dosage}`:''}${(s.timing&&s.timing.length)?` — ${(s.timing||[]).join(', ')}`:''}`))

    h2('Daily Metrics (Health Logs)')
    ;(user.healthLogs || [])
      .sort((a:any,b:any)=> new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime())
      .slice(0, 15)
      .forEach((h:any)=> drawText(`${fmt(h.createdAt)} — rating ${h.rating}${(h.notes && typeof h.notes==='string' && h.notes.length<120)?` — ${h.notes}`:''}`))

    h2('Food Diary (Highlights)')
    ;(user.foodLogs || [])
      .sort((a:any,b:any)=> new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime())
      .slice(0, 15)
      .forEach((f:any)=> {
        const cal = f?.nutrients && (f.nutrients as any).calories
        drawText(`${fmt(f.createdAt)} — ${f.name || 'Food'}${Number.isFinite(cal)?` — ${cal} kcal`:''}`)
      })

    const dietTypes = parseDietTypes()
    const diabetesType = parseDiabetesType()
    const birthdate = parseBirthdate()
    const primaryGoal = parsePrimaryGoal()
    const hydrationGoal = computeHydrationGoal({
      weightKg: typeof user.weight === 'number' ? user.weight : null,
      heightCm: typeof user.height === 'number' ? user.height : null,
      gender: (user as any)?.gender ?? null,
      bodyType: (user as any)?.bodyType ?? null,
      exerciseFrequency: user.exerciseFrequency || '',
      exerciseTypes: user.exerciseTypes || [],
      dietTypes,
      diabetesType,
      goalChoice: primaryGoal.goalChoice,
      goalIntensity: primaryGoal.goalIntensity,
      birthdate,
    })
    const customHydration = readGoalCategory('__HYDRATION_GOAL__')
    const customTarget = Number(customHydration?.targetMl)
    const hydrationTarget =
      Number.isFinite(customTarget) && customTarget > 0 ? Math.round(customTarget) : hydrationGoal.targetMl

    h2('Hydration')
    drawText(`Daily hydration target: ${formatMl(hydrationTarget)}`)
    const waterLogs = (user as any).waterLogs || []
    if (!waterLogs.length) {
      drawText('No water entries logged in this period.')
    } else {
      const totalWaterMl = waterLogs.reduce((sum: number, w: any) => sum + (Number(w?.amountMl ?? 0) || 0), 0)
      drawText(`Total logged: ${formatMl(totalWaterMl)} (${waterLogs.length} entries)`)
      waterLogs
        .sort((a:any,b:any)=> new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime())
        .slice(0, 15)
        .forEach((w:any)=> {
          const label = w?.label || 'Drink'
          const amount = formatAmount(w?.amount, w?.unit)
          drawText(`${fmt(w.createdAt)} — ${label}${amount ? ` — ${amount}` : ''}`)
        })
    }

    h2('Activity')
    const ex = (user.exerciseLogs || [])
      .sort((a:any,b:any)=> new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime())
      .slice(0, 15)
    if (ex.length === 0) {
      drawText('No activity logged in this period.')
    } else {
      ex.forEach((e:any)=> drawText(`${fmt(e.createdAt)} — ${e.type || 'Activity'}${Number.isFinite(e.duration)?` — ${e.duration} min`:''}${e.intensity?` — ${e.intensity}`:''}`))
    }

    const pdfBytes = await doc.save()
    const pdfBuffer = Buffer.from(pdfBytes)

    return new Response(pdfBuffer as any, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="helfi-health-summary.pdf"`
      }
    })
  } catch (e: any) {
    if (e?.message === 'unsupported_pdf_text') {
      return NextResponse.json({ error: 'Some characters cannot be shown in this PDF yet. Your saved data has not changed. Please contact support for help.' }, { status: 422 })
    }
    console.error('PDF export failed:', e)
    return NextResponse.json({ error: 'Export failed' }, { status: 500 })
  }
}
