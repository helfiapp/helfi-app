import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { ISSUE_SECTION_ORDER, type IssueSectionKey, precomputeQuickSectionsForUser } from '@/lib/insights/issue-engine'
import { getIssueSection } from '@/lib/insights/issue-engine'
import { prisma } from '@/lib/prisma'

// Lightweight fingerprint generator (mirrors logic in regeneration-service)
function createDataFingerprint(data: any): string {
  const json = JSON.stringify(data)
  let hash = 0
  for (let i = 0; i < json.length; i += 1) {
    const char = json.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash
  }
  return hash.toString(36)
}

async function getCurrentDataFingerprint(userId: string): Promise<string> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        healthGoals: { select: { name: true, currentRating: true } },
        supplements: { select: { name: true, dosage: true, timing: true } },
        medications: { select: { name: true, dosage: true, timing: true } },
        foodLogs: {
          where: {
            createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
          },
          select: { name: true, nutrients: true },
        },
        exerciseLogs: {
          where: {
            createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
          },
          select: { type: true, duration: true },
        },
      },
    })
    if (!user) return ''
    const relevantData = {
      profile: {
        gender: user.gender,
        weight: user.weight,
        height: user.height,
        bodyType: user.bodyType,
        exerciseFrequency: user.exerciseFrequency,
      },
      goals: user.healthGoals.map((g) => ({ name: g.name, rating: g.currentRating })),
      supplements: user.supplements.map((s) => ({ name: s.name, dosage: s.dosage, timing: s.timing })),
      medications: user.medications.map((m) => ({ name: m.name, dosage: m.dosage, timing: m.timing })),
      recentFoods: user.foodLogs.length,
      recentExercise: user.exerciseLogs.length,
    }
    return createDataFingerprint(relevantData)
  } catch {
    return ''
  }
}

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
    
    // Start regeneration for all sections in parallel (non-blocking, much faster!)
    setTimeout(async () => {
      try {
        // Use the fast quick path which generates insights much faster
        // This uses degraded/quick generation instead of full LLM calls
        await precomputeQuickSectionsForUser(session.user.id, {
          concurrency: 4, // Process 4 sections in parallel
          sections: sections, // Filter to only regenerate requested sections
          slugs: [context.params.slug], // Only regenerate for this specific issue
        })
        // Compute the latest fingerprint so status does not show as "stale"
        const fingerprint = await getCurrentDataFingerprint(session.user.id)
        
        // Mark all sections as fresh after quick generation completes
        for (const section of sections) {
          try {
            await prisma.$executeRawUnsafe(`
              INSERT INTO "InsightsMetadata" ("userId", "issueSlug", "section", "status", "dataFingerprint", "lastGeneratedAt", "updatedAt")
              VALUES ($1, $2, $3, 'fresh', $4, NOW(), NOW())
              ON CONFLICT ("userId", "issueSlug", "section")
              DO UPDATE SET "status" = 'fresh', "dataFingerprint" = $4, "lastGeneratedAt" = NOW(), "updatedAt" = NOW()
            `, session.user.id, context.params.slug, section, fingerprint)
          } catch (error) {
            console.warn(`[insights.api] Failed to mark ${section} as fresh`, error)
          }
        }
        
        console.log(`[insights.api] Quick regeneration complete for ${sections.length} sections`)
      } catch (error) {
        console.error('[insights.api] Background regeneration failed', error)
        // Mark as stale on error so it can retry
        for (const section of sections) {
          try {
            await prisma.$executeRawUnsafe(`
              UPDATE "InsightsMetadata" SET "status" = 'stale', "updatedAt" = NOW()
              WHERE "userId" = $1 AND "issueSlug" = $2 AND "section" = $3
            `, session.user.id, context.params.slug, section)
          } catch {}
        }
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

