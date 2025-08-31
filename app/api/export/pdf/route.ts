import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Lazy import puppeteer only when needed to keep cold starts smaller
async function getPuppeteer() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const puppeteer = require('puppeteer') as typeof import('puppeteer')
  return puppeteer
}

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

    // Build simple branded HTML for PDF
    const fmt = (d?: Date | string | null) => (d ? new Date(d).toLocaleString() : '')
    const dateRangeText = hasRange
      ? `${dateFilter.gte ? fmt(dateFilter.gte) : '…'} → ${dateFilter.lte ? fmt(dateFilter.lte) : '…'}`
      : 'All time'

    const dailyMetrics = (user.healthLogs || []).map((h: any) => `
      <tr>
        <td>${fmt(h.createdAt)}</td>
        <td>${h.rating}</td>
        <td>${h.notes || ''}</td>
      </tr>
    `).join('')

    const foodRows = (user.foodLogs || []).map((f: any) => `
      <tr>
        <td>${fmt(f.createdAt)}</td>
        <td>${f.name || ''}</td>
        <td>${(f.nutrients && (f.nutrients.calories ?? '')) || ''}</td>
      </tr>
    `).join('')

    const exerciseRows = (user.exerciseLogs || []).map((e: any) => `
      <tr>
        <td>${fmt(e.createdAt)}</td>
        <td>${e.type}</td>
        <td>${e.duration} min</td>
      </tr>
    `).join('')

    const html = `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Helfi Health Summary</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; margin: 24px; color: #111827; }
      h1 { color: #059669; margin: 0 0 4px; }
      h2 { color: #065f46; margin-top: 24px; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; }
      table { width: 100%; border-collapse: collapse; margin-top: 8px; }
      th, td { border: 1px solid #e5e7eb; padding: 6px 8px; font-size: 12px; }
      th { background: #f0fdf4; text-align: left; }
      .meta { color: #6b7280; font-size: 12px; margin-bottom: 16px; }
      .grid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 8px; }
      .box { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px; font-size: 12px; }
    </style>
  </head>
  <body>
    <h1>Helfi — Your Health Summary</h1>
    <div class="meta">Generated for ${user.email} • Range: ${dateRangeText}</div>

    <h2>Profile</h2>
    <div class="grid">
      <div class="box"><strong>Name</strong><br/>${user.name || ''}</div>
      <div class="box"><strong>Gender</strong><br/>${user.gender || ''}</div>
      <div class="box"><strong>Height</strong><br/>${user.height ?? ''}</div>
      <div class="box"><strong>Weight</strong><br/>${user.weight ?? ''}</div>
      <div class="box"><strong>Body Type</strong><br/>${user.bodyType || ''}</div>
    </div>

    <h2>Goals</h2>
    <table>
      <thead><tr><th>Name</th><th>Category</th><th>Current Rating</th></tr></thead>
      <tbody>
        ${(user.healthGoals || []).map((g:any)=>`<tr><td>${g.name}</td><td>${g.category}</td><td>${g.currentRating}</td></tr>`).join('')}
      </tbody>
    </table>

    <h2>Medications & Supplements</h2>
    <table>
      <thead><tr><th>Type</th><th>Name</th><th>Dosage</th><th>Timing</th></tr></thead>
      <tbody>
        ${(user.medications || []).map((m:any)=>`<tr><td>Medication</td><td>${m.name}</td><td>${m.dosage||''}</td><td>${(m.timing||[]).join(', ')}</td></tr>`).join('')}
        ${(user.supplements || []).map((s:any)=>`<tr><td>Supplement</td><td>${s.name}</td><td>${s.dosage||''}</td><td>${(s.timing||[]).join(', ')}</td></tr>`).join('')}
      </tbody>
    </table>

    <h2>Daily Metrics (Health Logs)</h2>
    <table>
      <thead><tr><th>Date</th><th>Rating</th><th>Notes</th></tr></thead>
      <tbody>${dailyMetrics}</tbody>
    </table>

    <h2>Food Diary (Highlights)</h2>
    <table>
      <thead><tr><th>Date</th><th>Item</th><th>Calories</th></tr></thead>
      <tbody>${foodRows}</tbody>
    </table>

    <h2>Activity</h2>
    <table>
      <thead><tr><th>Date</th><th>Type</th><th>Duration</th></tr></thead>
      <tbody>${exerciseRows}</tbody>
    </table>
  </body>
 </html>
    `

    const puppeteer = await getPuppeteer()
    const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] })
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'networkidle0' })
    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '12mm', bottom: '16mm', left: '12mm', right: '12mm' } })
    await browser.close()

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


