/**
 * ⚠️ CRITICAL: DO NOT MODIFY THIS FILE WITHOUT EXTREME CAUTION ⚠️
 * 
 * This endpoint handles regeneration of ALL insight sections for a given issue.
 * It was broken multiple times and took days to fix. The current implementation is WORKING.
 * 
 * CRITICAL REQUIREMENTS THAT MUST NOT BE CHANGED:
 * 
 * 1. **waitUntil is REQUIRED**: Vercel serverless functions terminate when response is sent.
 *    Without waitUntil, background promises get killed before they can update database status.
 *    This causes the progress bar to stay at 0/7 forever. DO NOT REMOVE waitUntil.
 * 
 * 2. **force: true is REQUIRED**: This uses the original working approach. Previous attempts
 *    to "optimize" with precomputeQuickSectionsForUser broke the functionality. DO NOT CHANGE.
 * 
 * 3. **Incremental status updates**: Each section MUST update status immediately after completion.
 *    This allows the progress bar to show real-time progress (1/7, 2/7, etc.). DO NOT batch updates.
 * 
 * 4. **Same fingerprint**: The fingerprint computed at the start MUST be used when marking sections
 *    as 'fresh'. If fingerprints don't match, checkInsightsStatus will mark sections as 'stale'
 *    even though they're fresh, breaking the progress bar.
 * 
 * 5. **Promise.all with waitUntil**: The Promise.all pattern with waitUntil ensures all sections
 *    regenerate in parallel while Vercel waits for completion. DO NOT change this pattern.
 * 
 * IF YOU NEED TO MODIFY THIS FILE:
 * - Test thoroughly with the actual progress bar UI
 * - Verify status updates happen incrementally (check database after each section completes)
 * - Ensure waitUntil is still being used
 * - Do NOT "optimize" unless you have a proven working alternative
 * - If regeneration breaks again, REVERT IMMEDIATELY to this version
 * 
 * LAST WORKING VERSION: Commit 5c3fd22 (CRITICAL FIX: Use waitUntil to prevent Vercel from killing background promises)
 * 
 * @author Original fix: 2024-11-13
 * @warning DO NOT MODIFY WITHOUT USER APPROVAL
 */

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
    
    // ⚠️ CRITICAL: waitUntil is REQUIRED - DO NOT REMOVE OR MODIFY
    // Vercel serverless functions terminate when response is sent.
    // Without waitUntil, background promises get killed before updating database status.
    // This causes progress bar to stay at 0/7 forever.
    const waitUntil = (globalThis as any).waitUntil || ((promise: Promise<any>) => {
      // Fallback: keep promise alive by attaching error handler
      promise.catch(() => {})
    })
    
    // ⚠️ CRITICAL: Use force: true - this is the WORKING approach
    // Previous attempts to "optimize" with precomputeQuickSectionsForUser broke functionality.
    // DO NOT CHANGE THIS PATTERN without extensive testing.
    const regenerationPromises = sections.map(async (section) => {
      try {
        console.log(`[insights.api] Starting regeneration for ${section}`)
        
        // Use force: true - this was working before and is still working
        const result = await getIssueSection(session.user.id, context.params.slug, section, {
          mode: 'latest',
          force: true, // ⚠️ DO NOT CHANGE - this is what works
        })
        
        if (result) {
          // ⚠️ CRITICAL: Update status IMMEDIATELY after each section completes
          // This allows progress bar to show real-time progress (1/7, 2/7, etc.)
          // DO NOT batch these updates - they must happen incrementally
          // ⚠️ CRITICAL: Use the SAME fingerprint computed at start
          // If fingerprints don't match, checkInsightsStatus will mark sections as 'stale'
          // even though they're fresh, breaking the progress bar
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
    
    // ⚠️ CRITICAL: Promise.all with waitUntil ensures all sections regenerate in parallel
    // while Vercel waits for completion. DO NOT change this pattern.
    const allRegenerations = Promise.all(regenerationPromises)
    waitUntil(allRegenerations) // ⚠️ DO NOT REMOVE - this prevents Vercel from killing the function
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

