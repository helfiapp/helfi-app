import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getIssueSection, ISSUE_SECTION_ORDER, type IssueSectionKey } from '@/lib/insights/issue-engine'
import { checkInsightsStatus, getStatusMessage } from '@/lib/insights/regeneration-service'

export async function GET(
  _request: Request,
  context: { params: { slug: string; section: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const sectionParam = context.params.section as IssueSectionKey
    if (!ISSUE_SECTION_ORDER.includes(sectionParam)) {
      return NextResponse.json({ error: 'Invalid section' }, { status: 400 })
    }

    // Check insights status for user-friendly messaging
    const statusInfo = await checkInsightsStatus(session.user.id, context.params.slug, sectionParam)
    const statusMessage = getStatusMessage(statusInfo.status, statusInfo.lastGenerated)

    const result = await getIssueSection(session.user.id, context.params.slug, sectionParam)
    if (!result) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    // Add status information to the response
    const enrichedResult = {
      ...result,
      _meta: {
        status: statusInfo.status,
        lastGenerated: statusInfo.lastGenerated,
        statusMessage: statusMessage.message,
        statusTone: statusMessage.tone,
        needsUpdate: statusInfo.needsUpdate,
      },
    }

    return NextResponse.json(enrichedResult, { status: 200 })
  } catch (error) {
    console.error('GET /api/insights/issues/[slug]/sections/[section] error', error)
    return NextResponse.json({ error: 'Failed to load section' }, { status: 500 })
  }
}

export async function POST(
  _request: Request,
  context: { params: { slug: string; section: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const sectionParam = context.params.section as IssueSectionKey
    if (!ISSUE_SECTION_ORDER.includes(sectionParam)) {
      return NextResponse.json({ error: 'Invalid section' }, { status: 400 })
    }

    let body: { mode?: string; range?: { from?: string; to?: string } } = {}
    try {
      body = await _request.json()
    } catch {}

    const mode = (body?.mode === 'weekly' || body?.mode === 'daily' || body?.mode === 'custom') ? body.mode : 'latest'
    const range = body?.range && (body.range.from || body.range.to) ? body.range : undefined

    const result = await getIssueSection(session.user.id, context.params.slug, sectionParam, {
      mode,
      range,
      force: true,
    })
    if (!result) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    return NextResponse.json({ result }, { status: 200 })
  } catch (error) {
    console.error('POST /api/insights/issues/[slug]/sections/[section] error', error)
    return NextResponse.json({ error: 'Failed to generate section' }, { status: 500 })
  }
}
