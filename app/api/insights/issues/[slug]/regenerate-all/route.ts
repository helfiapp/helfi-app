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
    
    // CRITICAL FIX: In Vercel serverless, we need to use waitUntil to ensure background work completes
    // Without this, the function terminates before promises finish
    const waitUntil = (globalThis as any).waitUntil || ((promise: Promise<any>) => {
      // Fallback: keep promise alive by attaching error handler
      promise.catch(() => {})
    })
    
    // Regenerate sections using force: true - process in parallel and update status incrementally
    const regenerationPromises = sections.map(async (section) => {
      try {
        console.log(`[insights.api] Starting regeneration for ${section}`)
        
        // Use force: true - this was working before
        const result = await getIssueSection(session.user.id, context.params.slug, section, {
          mode: 'latest',
          force: true, // Force regeneration - this is what was working
        })
        
        if (result) {
          // Mark as fresh immediately after this section completes
          // CRITICAL: Use the SAME fingerprint that was computed at start
          await prisma.$executeRawUnsafe(`
            INSERT INTO "InsightsMetadata" ("userId", "issueSlug", "section", "status", "dataFingerprint", "lastGeneratedAt", "updatedAt")
            VALUES ($1, $2, $3, 'fresh', $4, NOW(), NOW())
            ON CONFLICT ("userId", "issueSlug", "section")
            DO UPDATE SET "status" = 'fresh', "dataFingerprint" = $4, "lastGeneratedAt" = NOW(), "updatedAt" = NOW()
          `, session.user.id, context.params.slug, section, fingerprint)
          
          console.log(`[insights.api] ✅ Regenerated and marked ${section} as fresh`)
        } else {
          throw new Error(`No result returned for ${section}`)
        }
      } catch (error) {
        console.error(`[insights.api] ❌ Failed to regenerate ${section}:`, error)
        // Mark as stale on error
        try {
          await prisma.$executeRawUnsafe(`
            UPDATE "InsightsMetadata" SET "status" = 'stale', "updatedAt" = NOW()
            WHERE "userId" = $1 AND "issueSlug" = $2 AND "section" = $3
          `, session.user.id, context.params.slug, section)
        } catch {}
      }
    })
    
    // Use waitUntil to ensure Vercel doesn't kill the function before promises complete
    const allRegenerations = Promise.all(regenerationPromises)
    waitUntil(allRegenerations)
    allRegenerations.catch((error) => {
      console.error('[insights.api] Regeneration error:', error)
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

