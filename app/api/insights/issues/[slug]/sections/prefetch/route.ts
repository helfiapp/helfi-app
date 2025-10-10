'use server'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import {
  ISSUE_SECTION_ORDER,
  type IssueSectionKey,
  type ReportMode,
  precomputeIssueSectionsForUser,
} from '@/lib/insights/issue-engine'

interface PrefetchBody {
  sections?: IssueSectionKey[]
  mode?: ReportMode
  concurrency?: number
  range?: { from?: string; to?: string }
  forceAllIssues?: boolean
}

export async function POST(request: Request, context: { params: { slug: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: PrefetchBody = {}
  try {
    body = await request.json()
  } catch {
    body = {}
  }

  const requestedSections = Array.isArray(body.sections)
    ? body.sections.filter((section): section is IssueSectionKey => ISSUE_SECTION_ORDER.includes(section))
    : undefined

  const mode: ReportMode = body.mode === 'weekly' || body.mode === 'daily' || body.mode === 'custom' ? body.mode : 'latest'

  const startedAt = Date.now()
  const concurrency = body.concurrency ?? 4
  const forceAll = body.forceAllIssues === true
  console.time(`[insights.prefetch] ${forceAll ? 'ALL' : context.params.slug}`)
  await precomputeIssueSectionsForUser(session.user.id, {
    slugs: forceAll ? undefined : [context.params.slug],
    sections: requestedSections,
    mode,
    range: body.range,
    concurrency,
  })
  console.timeEnd(`[insights.prefetch] ${forceAll ? 'ALL' : context.params.slug}`)
  const durationMs = Date.now() - startedAt

  return NextResponse.json(
    {
      ok: true,
      sections: requestedSections ?? ISSUE_SECTION_ORDER.filter((section) => section !== 'overview'),
      durationMs,
      concurrency,
      scope: forceAll ? 'all-issues' : 'single-issue',
    },
    { status: 202 }
  )
}
