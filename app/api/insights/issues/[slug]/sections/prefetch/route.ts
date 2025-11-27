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
import { precomputeQuickSectionsForUser } from '@/lib/insights/issue-engine'

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

  const targetSections = (requestedSections ?? ISSUE_SECTION_ORDER.filter((s) => s !== 'overview'))
    .filter((s) => s !== 'interactions')

  // Write quick results to DB cache so section pages can read instantly
  if (forceAll) {
    const rows = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
      'SELECT name FROM "CheckinIssues" WHERE "userId" = $1',
      session.user.id
    ).catch(() => []) as Array<{ name: string }>
    const slugs = rows.map((r) => r.name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''))
    await precomputeQuickSectionsForUser(session.user.id, { slugs, sections: targetSections, concurrency })
  } else {
    await precomputeQuickSectionsForUser(session.user.id, { slugs: [context.params.slug], sections: targetSections, concurrency })
  }

  const durationMs = Date.now() - startedAt

  return NextResponse.json({ ok: true, sections: targetSections, durationMs, concurrency, scope: forceAll ? 'all-issues' : 'single-issue' }, { status: 202 })
}
