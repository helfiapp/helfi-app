import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

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
        healthGoals: true,
        supplements: true,
        medications: true,
        healthLogs: hasRange ? { where: { createdAt: dateFilter } } : true,
        foodLogs: hasRange ? { where: { createdAt: dateFilter } } : true,
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
    const page = doc.addPage([595.28, 841.89]) // A4 in points
    const font = await doc.embedFont(StandardFonts.Helvetica)
    const fontBold = await doc.embedFont(StandardFonts.HelveticaBold)
    const margin = 40
    let cursorY = page.getHeight() - margin

    const drawText = (text: string, size = 12, bold = false, color = rgb(0.07, 0.09, 0.15)) => {
      const lines = wrapText(text, bold ? fontBold : font, size, page.getWidth() - margin * 2)
      lines.forEach((line) => {
        if (cursorY < margin + 20) { cursorY = page.getHeight() - margin; doc.addPage(page); }
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

    h1('Helfi — Your Health Summary')
    drawText(`Generated for ${user.email} • Range: ${dateRangeText}`, 10, false, rgb(0.45,0.47,0.50))

    h2('Profile')
    drawText(`Name: ${user.name || ''}`)
    drawText(`Gender: ${user.gender || ''}`)
    drawText(`Height: ${user.height ?? ''}`)
    drawText(`Weight: ${user.weight ?? ''}`)
    drawText(`Body Type: ${user.bodyType || ''}`)

    h2('Goals')
    ;(user.healthGoals || []).forEach((g:any)=> drawText(`• ${g.name} (${g.category}) — rating ${g.currentRating}`))

    h2('Medications & Supplements')
    ;(user.medications || []).forEach((m:any)=> drawText(`• Medication: ${m.name} — ${m.dosage||''} — ${(m.timing||[]).join(', ')}`))
    ;(user.supplements || []).forEach((s:any)=> drawText(`• Supplement: ${s.name} — ${s.dosage||''} — ${(s.timing||[]).join(', ')}`))

    h2('Daily Metrics (Health Logs)')
    ;(user.healthLogs || []).forEach((h:any)=> drawText(`${fmt(h.createdAt)} — rating ${h.rating}${h.notes?` — ${h.notes}`:''}`))

    h2('Food Diary (Highlights)')
    ;(user.foodLogs || []).forEach((f:any)=> drawText(`${fmt(f.createdAt)} — ${f.name || ''}${f.nutrients && f.nutrients.calories?` — ${f.nutrients.calories} kcal`:''}`))

    h2('Activity')
    ;(user.exerciseLogs || []).forEach((e:any)=> drawText(`${fmt(e.createdAt)} — ${e.type} — ${e.duration} min`))

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


