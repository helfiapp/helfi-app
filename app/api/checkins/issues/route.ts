import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createWriteGuard, hashPayload } from '@/lib/write-guard'
import { getCircuitState, openCircuit } from '@/lib/safety-circuit'
import { sendWriteSpikeAlertEmail } from '@/lib/admin-alerts'
import crypto from 'crypto'

let checkinIssuesReady = false

async function ensureCheckinIssuesTable() {
  if (checkinIssuesReady) return
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS CheckinIssues (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      name TEXT NOT NULL,
      polarity TEXT NOT NULL,
      UNIQUE (userId, name)
    )
  `)
  // Remove historical duplicates before creating unique index
  await prisma.$executeRawUnsafe(`
    DELETE FROM CheckinIssues a
    USING CheckinIssues b
    WHERE a.id > b.id AND a.userId = b.userId AND a.name = b.name
  `)
  // Ensure composite unique index exists even if table was created earlier without it
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS checkinissues_user_name_idx ON CheckinIssues (userId, name)
  `)
  checkinIssuesReady = true
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  try {
    await ensureCheckinIssuesTable()
    const rows: any[] = await prisma.$queryRawUnsafe(`SELECT id, name, polarity FROM CheckinIssues WHERE userId = $1`, user.id)
    return NextResponse.json({ issues: rows })
  } catch {
    return NextResponse.json({ issues: [] })
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const { issues } = (await req.json()) as { issues: Array<{ name: string; polarity?: 'positive' | 'negative' }> }
  const safeIssues = Array.isArray(issues) ? issues : []

  try {
    // If a runaway loop was detected elsewhere, pause only this specific save action.
    const circuit = await getCircuitState('health-setup-saves')
    if (circuit.open) {
      return NextResponse.json(
        {
          error:
            'Health setup saving is temporarily paused due to unusually high activity. Please try again in a few minutes.',
          paused: true,
          openUntil: circuit.openUntil?.toISOString() || null,
          reason: circuit.reason || null,
        },
        { status: 503 }
      )
    }

    await ensureCheckinIssuesTable()

    // Write guard: skip repeated identical saves (prevents runaway client loops).
    const normalizedNames = Array.isArray(issues)
      ? issues.map((i) => String(i?.name || '').trim()).filter(Boolean).sort()
      : []
    const payloadHash = hashPayload({ names: normalizedNames })
    const writeGuard = createWriteGuard(prisma)
    const guardResult = await writeGuard.readGuard({
      ownerKey: user.id,
      scope: 'checkins:issues',
      payloadHash,
      windowMs: 90 * 1000,
    })
    if (guardResult.skip) {
      if (guardResult.hitCount === 25) {
        const recipientEmail =
          ((process.env.OWNER_EMAIL || 'support@helfi.ai') as string).trim() || 'support@helfi.ai'
        openCircuit({
          scope: 'health-setup-saves',
          minutes: 10,
          reason: `Runaway checkins/issues saves detected (repeat payload x${guardResult.hitCount} within ~90s).`,
        }).catch(() => {})
        sendWriteSpikeAlertEmail({
          recipientEmail,
          subject: 'Helfi runaway protection activated',
          html: `
            <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
              <h2 style="margin: 0 0 12px 0;">Runaway protection activated</h2>
              <p style="margin: 0 0 12px 0;">
                We detected a burst of repeated health setup issue saves (same data sent many times quickly).
              </p>
              <p style="margin: 0 0 12px 0;">
                Action taken: health setup saves are paused for ~10 minutes to prevent a database spike.
              </p>
              <p style="margin: 0 0 12px 0;"><strong>User:</strong> ${String(session?.user?.email || '')}</p>
              <p style="margin: 0 0 12px 0;"><strong>Repeat count:</strong> ${guardResult.hitCount}</p>
            </div>
          `,
        }).catch((error) => {
          console.error('[runaway protection] alert email failed', error)
        })
      }

      return NextResponse.json({ success: true, skipped: true, reason: 'repeat_write_guard' })
    }

    // Replace saved list with exactly what client sent
    const names = safeIssues.map((i) => String(i?.name || '').trim()).filter(Boolean)
    if (names.length === 0) {
      await prisma.$executeRawUnsafe(`DELETE FROM CheckinIssues WHERE userId = $1`, user.id)
    } else {
      const placeholders = names.map((_, idx) => `$${idx + 2}`).join(',')
      await prisma.$executeRawUnsafe(
        `DELETE FROM CheckinIssues WHERE userId = $1 AND name NOT IN (${placeholders})`,
        user.id, ...names
      )
    }

    for (const item of issues) {
      const name = String(item.name || '').trim()
      if (!name) continue
      const polarity = (item.polarity === 'negative' || /pain|ache|anxiety|depress|fatigue|nausea|bloat|insomnia|brain fog|headache|migraine|cramp|stress|itch|rash|acne|diarrh|constipat|gas|heartburn/i.test(name)) ? 'negative' : 'positive'
      const id = crypto.randomUUID()
      // Use queryRawUnsafe for broad compatibility; ON CONFLICT upserts by (userId,name)
      await prisma.$queryRawUnsafe(
        `INSERT INTO CheckinIssues (id, userId, name, polarity) VALUES ($1,$2,$3,$4)
         ON CONFLICT (userId, name) DO UPDATE SET polarity=EXCLUDED.polarity`,
        id, user.id, name, polarity
      )
    }
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('checkins issues save error', e)
    return NextResponse.json({ error: (e as any)?.message || 'Failed to save issues' }, { status: 500 })
  }
}
