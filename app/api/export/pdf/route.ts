export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
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
    let page = doc.addPage([595.28, 841.89]) // A4 in points
    const font = await doc.embedFont(StandardFonts.Helvetica)
    const fontBold = await doc.embedFont(StandardFonts.HelveticaBold)
    const margin = 40
    let cursorY = page.getHeight() - margin

    const newPage = () => {
      page = doc.addPage([595.28, 841.89])
      cursorY = page.getHeight() - margin
    }

    const drawText = (text: string, size = 12, bold = false, color = rgb(0.07, 0.09, 0.15)) => {
      const lines = wrapText(text, bold ? fontBold : font, size, page.getWidth() - margin * 2)
      lines.forEach((line) => {
        if (cursorY < margin + 20) { newPage() }
        page.drawText(line, { x: margin, y: cursorY, size, font: bold ? fontBold : font, color })
        cursorY -= size + 4
      })
    }

    const h1 = (t: string) => { drawText(t, 18, true, rgb(0.02, 0.59, 0.41)); cursorY -= 4 }
    const h2 = (t: string) => { cursorY -= 6; drawText(t, 14, true, rgb(0.04, 0.37, 0.28)); cursorY -= 2 }

    const wrapText = (text: string, f: any, size: number, maxWidth: number): string[] => {
      const words = String(text || '').split(/\s+/)
      const lines: string[] = []
      let line = ''
      words.forEach(w => {
        const test = line ? line + ' ' + w : w
        const width = f.widthOfTextAtSize(test, size)
        if (width > maxWidth && line) { lines.push(line); line = w } else { line = test }
      })
      if (line) lines.push(line)
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

    const pdfBuffer = await doc.save()

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="helfi-health-summary.pdf"`
      }
    })
  } catch (e: any) {
    console.error('PDF export failed:', e)
    return NextResponse.json({ error: 'Export failed' }, { status: 500 })
  }
}
