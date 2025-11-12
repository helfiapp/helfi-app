import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { ISSUE_SECTION_ORDER, type IssueSectionKey } from '@/lib/insights/issue-engine'
import { getIssueSection } from '@/lib/insights/issue-engine'
import { prisma } from '@/lib/prisma'

export async function POST(
  _request: Request,
  context: { params: { slug: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const sections = ISSUE_SECTION_ORDER.filter((s) => s !== 'overview') as IssueSectionKey[]
    
    // Mark all sections as generating
    try {
      for (const section of sections) {
        await prisma.$executeRawUnsafe(`
          INSERT INTO "InsightsMetadata" ("userId", "issueSlug", "section", "status", "updatedAt")
          VALUES ($1, $2, $3, 'generating', NOW())
          ON CONFLICT ("userId", "issueSlug", "section")
          DO UPDATE SET "status" = 'generating', "updatedAt" = NOW()
        `, session.user.id, context.params.slug, section)
      }
    } catch (error) {
      console.warn('[insights.api] Failed to mark sections as generating', error)
    }
    
    // Start regeneration for all sections in background (non-blocking)
    setTimeout(async () => {
      try {
        for (const section of sections) {
          try {
            const result = await getIssueSection(session.user.id, context.params.slug, section, {
              mode: 'latest',
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
                `, session.user.id, context.params.slug, section)
              } catch (error) {
                console.warn(`[insights.api] Failed to mark ${section} as fresh`, error)
              }
            }
          } catch (error) {
            console.error(`[insights.api] Failed to regenerate ${section}`, error)
            // Mark as stale on error so it can retry
            try {
              await prisma.$executeRawUnsafe(`
                UPDATE "InsightsMetadata" SET "status" = 'stale', "updatedAt" = NOW()
                WHERE "userId" = $1 AND "issueSlug" = $2 AND "section" = $3
              `, session.user.id, context.params.slug, section)
            } catch {}
          }
        }
      } catch (error) {
        console.error('[insights.api] Background regeneration failed', error)
      }
    }, 0)
    
    return NextResponse.json({ 
      success: true,
      sections: sections.length,
      message: 'Regeneration started for all sections'
    }, { status: 200 })
  } catch (error) {
    console.error('POST /api/insights/issues/[slug]/regenerate-all error', error)
    return NextResponse.json({ error: 'Failed to start regeneration' }, { status: 500 })
  }
}

