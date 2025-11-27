import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getIssueSection, ISSUE_SECTION_ORDER, type IssueSectionKey, getCachedIssueSection } from '@/lib/insights/issue-engine'
import { checkInsightsStatus, getStatusMessage } from '@/lib/insights/regeneration-service'
import { prisma } from '@/lib/prisma'

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
    
    // Debug headers when INSIGHTS_DEBUG=1
    const headers: Record<string, string> = {}
    if (process.env.INSIGHTS_DEBUG === '1') {
      try {
        const extras = (result as any)?.extras ?? {}
        const pipelineVersion = extras.pipelineVersion ?? 'unknown'
        const responseType = extras.quickUsed ? 'quick' : extras.cacheHit ? 'cached' : 'validated'
        
        headers['X-Debug-ResponseType'] = responseType
        headers['X-Debug-PipelineVersion'] = String(pipelineVersion)
        
        if (sectionParam === 'supplements') {
          const supplements = extras.supportiveDetails ?? []
          const supplementNames = supplements.map((s: any) => s?.name).filter(Boolean)
          headers['X-Debug-Supplements'] = supplementNames.slice(0, 10).join(',')
          headers['X-Debug-WorkingCount'] = String(supplements.length)
        } else if (sectionParam === 'exercise') {
          const wa = Array.isArray(extras.workingActivities) ? extras.workingActivities : []
          headers['X-Debug-WorkingCount'] = String(wa.length)
          headers['X-Debug-WorkingTitles'] = wa.map((x: any) => x?.title).filter(Boolean).slice(0, 10).join(',')
          // eslint-disable-next-line no-console
          console.log('[insights.api] GET exercise section', {
            slug: context.params.slug,
            workingCount: wa.length,
            workingTitles: wa.map((x: any) => x?.title).filter(Boolean),
          })
        }
      } catch {}
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

    return NextResponse.json(enrichedResult, { status: 200, headers })
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

    let body: { mode?: string; range?: { from?: string; to?: string }; force?: boolean } = {}
    try {
      body = await _request.json()
    } catch {}

    const mode = (body?.mode === 'weekly' || body?.mode === 'daily' || body?.mode === 'custom') ? body.mode : 'latest'
    const range = body?.range && (body.range.from || body.range.to) ? body.range : undefined
    const forceRefresh = body?.force === true

    // If force refresh requested, skip cache and regenerate
    if (forceRefresh) {
      // Mark as generating in background (non-blocking)
      try {
        await prisma.$executeRawUnsafe(`
          INSERT INTO "InsightsMetadata" ("userId", "issueSlug", "section", "status", "updatedAt")
          VALUES ($1, $2, $3, 'generating', NOW())
          ON CONFLICT ("userId", "issueSlug", "section")
          DO UPDATE SET "status" = 'generating', "updatedAt" = NOW()
        `, session.user.id, context.params.slug, sectionParam)
      } catch (error) {
        // Non-blocking - continue even if metadata update fails
        console.warn('[insights.api] Failed to mark as generating', error)
      }
      
      // Start regeneration in background (non-blocking)
      // Return immediately so user sees progress bar
      setTimeout(async () => {
        try {
          const result = await getIssueSection(session.user.id, context.params.slug, sectionParam, {
            mode,
            range,
            force: true,
          })
          // Mark as fresh after completion
          if (result) {
            try {
              await prisma.$executeRawUnsafe(`
                INSERT INTO "InsightsMetadata" ("userId", "issueSlug", "section", "status", "dataFingerprint", "lastGeneratedAt", "updatedAt")
                VALUES ($1, $2, $3, 'fresh', '', NOW(), NOW())
                ON CONFLICT ("userId", "issueSlug", "section")
                DO UPDATE SET "status" = 'fresh', "lastGeneratedAt" = NOW(), "updatedAt" = NOW()
              `, session.user.id, context.params.slug, sectionParam)
            } catch (error) {
              console.warn('[insights.api] Failed to mark as fresh', error)
            }
          }
        } catch (error) {
          console.error('[insights.api] Background regeneration failed', error)
          // Mark as stale on error so it can retry
          try {
            await prisma.$executeRawUnsafe(`
              UPDATE "InsightsMetadata" SET "status" = 'stale', "updatedAt" = NOW()
              WHERE "userId" = $1 AND "issueSlug" = $2 AND "section" = $3
            `, session.user.id, context.params.slug, sectionParam)
          } catch {}
        }
      })
      
      // Return immediately with current cached result (if available) or empty response
      const quickResult = await getIssueSection(session.user.id, context.params.slug, sectionParam, {
        mode,
        range,
        force: false, // Try to get cached/quick result for immediate display
      })
      
      return NextResponse.json({ 
        result: quickResult || null, 
        upgraded: false, 
        forceRefreshed: true,
        generating: true 
      }, { status: 200 })
    }

    // Fast path: Return quick result immediately, then upgrade in background
    // This prevents users from waiting a minute for generation
    const quickResult = await getIssueSection(session.user.id, context.params.slug, sectionParam, {
      mode,
      range,
      force: false, // Don't force - use quick if available
    })
    
    if (quickResult) {
      // Return quick result immediately
      // Background upgrade will happen automatically via computeIssueSection
      return NextResponse.json({ result: quickResult, upgraded: false }, { status: 200 })
    }

    // Fallback: If no quick result available, do full build (but this should be rare)
    const result = await getIssueSection(session.user.id, context.params.slug, sectionParam, {
      mode,
      range,
      force: true,
    })
    if (!result) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    return NextResponse.json({ result, upgraded: true }, { status: 200 })
  } catch (error) {
    console.error('POST /api/insights/issues/[slug]/sections/[section] error', error)
    return NextResponse.json({ error: 'Failed to generate section' }, { status: 500 })
  }
}
