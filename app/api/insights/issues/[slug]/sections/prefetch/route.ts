'use server'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import {
  ISSUE_SECTION_ORDER,
  type IssueSectionKey,
  type ReportMode,
} from '@/lib/insights/issue-engine'
import { prisma } from '@/lib/prisma'
import { generateDegradedSectionQuick } from '@/lib/insights/llm'

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

  // Warm degraded cache quickly for the requested slug (or all issues) without heavy context.
  const targetSections = (requestedSections ?? ISSUE_SECTION_ORDER.filter((s) => s !== 'overview'))
    .filter((s) => s !== 'interactions')

  const warmFor = async (slug: string, section: IssueSectionKey) => {
    const minimalIssueName = slug.replace(/[-_]+/g, ' ').replace(/^\s+|\s+$/g, '').split(' ').map(p=>p.charAt(0).toUpperCase()+p.slice(1)).join(' ') || 'Issue'
    const quick = await generateDegradedSectionQuick({
      issueName: minimalIssueName,
      issueSummary: null,
      items: [],
      otherItems: [],
      profile: {},
      mode: section as any,
    }, { minSuggested: 4, minAvoid: 4 })
    // We do not write DB cache here; computeIssueSection will write on read path.
    return !!quick
  }

  if (forceAll) {
    // Find all issue slugs quickly for the user
    const rows = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
      'SELECT name FROM "CheckinIssues" WHERE "userId" = $1',
      session.user.id
    ).catch(() => []) as Array<{ name: string }>
    const slugs = rows.map((r) => r.name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''))
    const tasks = slugs.flatMap((slug) => targetSections.map((s) => ({ slug, s })))
    let active = 0
    const queue = [...tasks]
    const workers: Promise<void>[] = []
    while (queue.length) {
      if (active >= concurrency) {
        await Promise.race(workers)
      }
      const { slug, s } = queue.shift() as { slug: string; s: IssueSectionKey }
      const p = warmFor(slug, s).catch(() => {}).finally(() => { active -= 1 })
      active += 1
      workers.push(p as unknown as Promise<void>)
    }
    await Promise.allSettled(workers)
  } else {
    await Promise.allSettled(targetSections.map((s) => warmFor(context.params.slug, s)))
  }

  const durationMs = Date.now() - startedAt

  return NextResponse.json(
    {
      ok: true,
      sections: targetSections,
      durationMs,
      concurrency,
      scope: forceAll ? 'all-issues' : 'single-issue',
    },
    { status: 202 }
  )
}
