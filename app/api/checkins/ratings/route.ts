import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Delete a single rating entry
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date')
  const issueId = searchParams.get('issueId')

  if (!date || !issueId) {
    return NextResponse.json({ error: 'Missing date or issueId' }, { status: 400 })
  }

  try {
    await prisma.$executeRawUnsafe(
      `DELETE FROM CheckinRatings WHERE userId = $1 AND date = $2 AND issueId = $3`,
      user.id, date, issueId
    )
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('delete rating error', e)
    return NextResponse.json({ error: 'Failed to delete rating' }, { status: 500 })
  }
}

// Update a rating entry
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const { date, issueId, value, note } = body

  if (!date || !issueId) {
    return NextResponse.json({ error: 'Missing date or issueId' }, { status: 400 })
  }

  try {
    const clamped = (value === null || value === undefined) ? null : Math.max(0, Math.min(6, Number(value)))
    // Use INSERT ... ON CONFLICT to handle both update and insert
    await prisma.$executeRawUnsafe(
      `INSERT INTO CheckinRatings (userId, issueId, date, value, note)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (userId, issueId, date) DO UPDATE SET value = EXCLUDED.value, note = EXCLUDED.note`,
      user.id, issueId, date, clamped, String(note || '')
    )
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('update rating error', e)
    return NextResponse.json({ error: 'Failed to update rating' }, { status: 500 })
  }
}

// Delete multiple ratings (by issue or all)
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const { action, issueIds } = body

  if (action === 'delete-all') {
    try {
      await prisma.$executeRawUnsafe(`DELETE FROM CheckinRatings WHERE userId = $1`, user.id)
      return NextResponse.json({ success: true })
    } catch (e) {
      console.error('delete all ratings error', e)
      return NextResponse.json({ error: 'Failed to delete all ratings' }, { status: 500 })
    }
  }

  if (action === 'delete-by-issues' && Array.isArray(issueIds) && issueIds.length > 0) {
    try {
      const placeholders = issueIds.map((_, i) => `$${i + 2}`).join(',')
      await prisma.$executeRawUnsafe(
        `DELETE FROM CheckinRatings WHERE userId = $1 AND issueId IN (${placeholders})`,
        user.id, ...issueIds
      )
      return NextResponse.json({ success: true })
    } catch (e) {
      console.error('delete by issues error', e)
      return NextResponse.json({ error: 'Failed to delete ratings' }, { status: 500 })
    }
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}

