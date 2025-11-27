import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

function clean(s?: string) { return (s || '').trim() }

export async function GET(request: Request) {
  const url = new URL(request.url)
  const issue = clean(url.searchParams.get('issue') || '')
  const supplement = clean(url.searchParams.get('supplement') || '')

  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })

    // Collect minimal context
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { supplements: true, medications: true, healthGoals: true }
    })

    // Build a lightweight recommendation object now (stub without OpenAI)
    const title = issue ? issue : (supplement ? supplement : 'Insight')
    const reason = issue
      ? `Based on your selected issue "${issue}" and your current profile.`
      : `Based on your supplement "${supplement}" and your current profile.`
    const actions: string[] = []
    if (issue) {
      actions.push('Review daily habits that impact this issue.')
      actions.push('Track changes for 7 days to see patterns.')
    }
    if (supplement) {
      actions.push('Take with appropriate meal timing if applicable.')
      actions.push('Check for interactions with current medications (confirm with your clinician).')
    }

    const payload = {
      title,
      what: issue ? `Recommendations for ${issue}.` : `Recommendations for ${supplement}.`,
      reason,
      actions,
      timing: supplement ? 'Common timing: morning with food or evening as tolerated.' : undefined,
      safety: 'This is general information. Always confirm with your clinician before changes.'
    }

    return NextResponse.json({ ok: true, data: payload }, { status: 200 })
  } catch (e) {
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}


