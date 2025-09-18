import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getIssueSection, ISSUE_SECTION_ORDER, type IssueSectionKey } from '@/lib/insights/issue-engine'

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

    const result = await getIssueSection(session.user.id, context.params.slug, sectionParam)
    if (!result) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    return NextResponse.json(result, { status: 200 })
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

    let body: any = {}
    try {
      body = await _request.json()
    } catch {}
    const result = await getIssueSection(session.user.id, context.params.slug, sectionParam)
    if (!result) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    return NextResponse.json({ ...result, request: { mode: body?.mode ?? 'latest', range: body?.range ?? null } }, { status: 200 })
  } catch (error) {
    console.error('POST /api/insights/issues/[slug]/sections/[section] error', error)
    return NextResponse.json({ error: 'Failed to generate section' }, { status: 500 })
  }
}
