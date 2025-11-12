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
    
    // Compute fingerprint once
    const fingerprint = await getCurrentDataFingerprint(session.user.id)
    
    // Use precomputeQuickSectionsForUser which is designed for fast regeneration
    // But we need to hook into it to update status incrementally
    // Clear all caches first to force fresh generation
    try {
      for (const section of sections) {
        await prisma.$executeRawUnsafe(`
          DELETE FROM "InsightsCache" 
          WHERE "userId" = $1 AND "slug" = $2 AND "section" = $3
        `, session.user.id, context.params.slug, section)
      }
    } catch (error) {
      console.warn('[insights.api] Failed to clear cache', error)
    }
    
    // Start regeneration using precomputeQuickSectionsForUser
    // This runs in background - return immediately
    precomputeQuickSectionsForUser(session.user.id, {
      concurrency: 4,
      sections: sections,
      slugs: [context.params.slug],
      mode: 'latest',
    }).then(async () => {
      // After all sections complete, mark them all as fresh
      console.log(`[insights.api] Quick regeneration complete for ${sections.length} sections`)
      for (const section of sections) {
        try {
          await prisma.$executeRawUnsafe(`
            INSERT INTO "InsightsMetadata" ("userId", "issueSlug", "section", "status", "dataFingerprint", "lastGeneratedAt", "updatedAt")
            VALUES ($1, $2, $3, 'fresh', $4, NOW(), NOW())
            ON CONFLICT ("userId", "issueSlug", "section")
            DO UPDATE SET "status" = 'fresh', "dataFingerprint" = $4, "lastGeneratedAt" = NOW(), "updatedAt" = NOW()
          `, session.user.id, context.params.slug, section, fingerprint)
          console.log(`[insights.api] ✅ Marked ${section} as fresh`)
        } catch (error) {
          console.error(`[insights.api] Failed to mark ${section} as fresh:`, error)
        }
      }
    }).catch((error) => {
      console.error('[insights.api] Regeneration failed:', error)
      // Mark all as stale on error
      for (const section of sections) {
        prisma.$executeRawUnsafe(`
          UPDATE "InsightsMetadata" SET "status" = 'stale', "updatedAt" = NOW()
          WHERE "userId" = $1 AND "issueSlug" = $2 AND "section" = $3
        `, session.user.id, context.params.slug, section).catch(() => {})
      }
    })
    
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

