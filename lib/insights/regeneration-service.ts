/**
 * Insights Regeneration Service
 * 
 * This service provides automatic background regeneration of insights when health data changes.
 * Unlike previous attempts that generated insights on-demand (causing 20-60s waits), this system:
 * 
 * 1. Tracks what data each insight was based on (data fingerprints)
 * 2. Detects when relevant health data actually changes
 * 3. Automatically regenerates affected sections in the background
 * 4. Allows instant display of cached insights while updates happen
 * 
 * Key Difference from Previous Agents:
 * - Previous: Generate on click → user waits 20-60s
 * - This: Generate on data change → user sees instant cached result (<2s)
 */

import { prisma } from '@/lib/prisma'
import { precomputeIssueSectionsForUser, precomputeQuickSectionsForUser } from './issue-engine'
import { withRunContext, type RunContext } from '../run-context'
import type { IssueSectionKey } from './issue-engine'

export interface InsightMetadata {
  userId: string
  issueSlug: string
  section: IssueSectionKey
  lastGeneratedAt: Date
  dataFingerprint: string // Hash of source data used for generation
  status: 'fresh' | 'stale' | 'generating'
}

export interface DataChangeEvent {
  userId: string
  changeType:
    | 'supplements'
    | 'medications'
    | 'food'
    | 'exercise'
    | 'health_goals'
    | 'health_situations'
    | 'profile'
    | 'blood_results'
  timestamp: Date
}

/**
 * Creates a fingerprint (hash) of the data to detect real changes
 */
function createDataFingerprint(data: any): string {
  const json = JSON.stringify(data)
  // Simple hash function (for production, consider using crypto.subtle or a library)
  let hash = 0
  for (let i = 0; i < json.length; i++) {
    const char = json.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash // Convert to 32bit integer
  }
  return hash.toString(36)
}

/**
 * Map change types to affected insight sections
 */
export function getAffectedSections(changeType: DataChangeEvent['changeType']): IssueSectionKey[] {
  const mapping: Record<DataChangeEvent['changeType'], IssueSectionKey[]> = {
    // Narrowed to just the sections a user expects to change, to keep runtime fast.
    supplements: ['supplements'], // show the new/changed supplement in Supplements analysis
    medications: ['medications', 'interactions'], // interactions are relevant to meds changes
    food: ['nutrition'],
    exercise: ['exercise'],
    // Goals/situations lightly touch overall plan; keep scope small
    health_goals: ['overview', 'nutrition', 'lifestyle'],
    health_situations: ['overview', 'nutrition', 'lifestyle'],
    // Profile (weight/height/goal/body type/birthdate) should only update the core targets
    profile: ['overview', 'nutrition'],
    // Labs stay isolated
    blood_results: ['labs'],
  }
  return mapping[changeType] || []
}

/**
 * Ensure the insights metadata tracking table exists
 */
async function ensureMetadataTable() {
  try {
    // await prisma.$executeRawUnsafe(`
    //   CREATE TABLE IF NOT EXISTS "InsightsMetadata" (
    //     "userId" TEXT NOT NULL,
    //     "issueSlug" TEXT NOT NULL,
    //     "section" TEXT NOT NULL,
    //     "lastGeneratedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    //     "dataFingerprint" TEXT NOT NULL,
    //     "status" TEXT NOT NULL DEFAULT 'fresh',
    //     "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    //     PRIMARY KEY ("userId", "issueSlug", "section")
    //   )
    // `)
  } catch (error) {
    console.warn('[regeneration-service] Failed to ensure metadata table', error)
  }
}

/**
 * Get current data fingerprint for a user
 */
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
            createdAt: {
              gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
            },
          },
          select: { name: true, nutrients: true },
        },
        exerciseLogs: {
          where: {
            createdAt: {
              gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
            },
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
  } catch (error) {
    console.warn('[regeneration-service] Error creating fingerprint', error)
    return ''
  }
}

/**
 * Check if insights are stale (need regeneration)
 */
export async function checkInsightsStatus(
  userId: string,
  issueSlug: string,
  section: IssueSectionKey
): Promise<{ status: 'fresh' | 'stale' | 'missing' | 'generating'; lastGenerated: Date | null; needsUpdate: boolean }> {
  try {
    await ensureMetadataTable()

    const rows: any[] = await prisma.$queryRawUnsafe(
      'SELECT "lastGeneratedAt", "dataFingerprint", "status" FROM "InsightsMetadata" WHERE "userId" = $1 AND "issueSlug" = $2 AND "section" = $3',
      userId,
      issueSlug,
      section
    )

    if (!rows || !rows[0]) {
      return { status: 'missing', lastGenerated: null, needsUpdate: true }
    }

    const metadata = rows[0]
    const currentFingerprint = await getCurrentDataFingerprint(userId)

    // If fingerprints don't match, data has changed
    const needsUpdate = metadata.dataFingerprint !== currentFingerprint

    return {
      status: needsUpdate ? 'stale' : (metadata.status as 'fresh' | 'stale' | 'generating'),
      lastGenerated: metadata.lastGeneratedAt ? new Date(metadata.lastGeneratedAt) : null,
      needsUpdate,
    }
  } catch (error) {
    console.warn('[regeneration-service] Error checking status', error)
    return { status: 'missing', lastGenerated: null, needsUpdate: true }
  }
}

/**
 * Mark sections as stale when data changes
 */
async function markSectionsStale(userId: string, sections: IssueSectionKey[]): Promise<void> {
  try {
    await ensureMetadataTable()

    // Get all issues for this user
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { healthGoals: true },
    })

    if (!user) return

    // Extract issue slugs from health goals (simplified - in real system would be more robust)
    let issueNames = user.healthGoals
      .filter((g) => !g.name.startsWith('__'))
      .map((g) => g.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'))

    // Fallback: if no healthGoals on the user record, try CheckinIssues (selected issues)
    if (!issueNames.length) {
      try {
        const rows: Array<{ name: string }> = await prisma.$queryRawUnsafe(
          'SELECT name FROM "CheckinIssues" WHERE "userId" = $1',
          userId
        )
        issueNames = rows
          .map((r) => r.name || '')
          .filter((name) => name && !name.startsWith('__'))
          .map((name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-'))
      } catch (e) {
        console.warn('[manual-regeneration] fallback issues lookup failed', { userId, error: e })
      }
    }

    // If still no issues, bail early to avoid a no-op regen that never charges
    if (!issueNames.length) {
      console.warn('[manual-regeneration] no issues/goals to regenerate for user', { userId })
      return
    }

    // Mark each section for each issue as stale
    for (const issueSlug of issueNames) {
      for (const section of sections) {
        await prisma.$queryRawUnsafe(
          `INSERT INTO "InsightsMetadata" ("userId", "issueSlug", "section", "status", "dataFingerprint", "updatedAt") 
           VALUES ($1, $2, $3, 'stale', '', NOW())
           ON CONFLICT ("userId", "issueSlug", "section") 
           DO UPDATE SET "status" = 'stale', "updatedAt" = NOW()`,
          userId,
          issueSlug,
          section
        )
      }
    }

    console.log(`[regeneration-service] Marked ${sections.length} sections as stale for user ${userId}`)
  } catch (error) {
    console.warn('[regeneration-service] Error marking sections stale', error)
  }
}

/**
 * Update metadata after successful generation
 */
async function updateMetadataAfterGeneration(
  userId: string,
  issueSlug: string,
  section: IssueSectionKey
): Promise<void> {
  try {
    await ensureMetadataTable()
    const fingerprint = await getCurrentDataFingerprint(userId)

    await prisma.$queryRawUnsafe(
      `INSERT INTO "InsightsMetadata" ("userId", "issueSlug", "section", "lastGeneratedAt", "dataFingerprint", "status", "updatedAt")
       VALUES ($1, $2, $3, NOW(), $4, 'fresh', NOW())
       ON CONFLICT ("userId", "issueSlug", "section")
       DO UPDATE SET "lastGeneratedAt" = NOW(), "dataFingerprint" = $4, "status" = 'fresh', "updatedAt" = NOW()`,
      userId,
      issueSlug,
      section,
      fingerprint
    )
  } catch (error) {
    console.warn('[regeneration-service] Error updating metadata', error)
  }
}

/**
 * Trigger background regeneration for affected sections.
 * Temporarily paused unless explicitly enabled to stop runaway background calls.
 */
const BACKGROUND_REGEN_ENABLED = process.env.ENABLE_INSIGHTS_BACKGROUND_REGEN === 'true'

export async function triggerBackgroundRegeneration(event: DataChangeEvent): Promise<void> {
  if (!BACKGROUND_REGEN_ENABLED) {
    console.log('[regeneration-service] Background regeneration is disabled; skipping trigger.', event)
    return
  }

  const { userId, changeType } = event

  try {
    console.log(`[regeneration-service] Data change detected: ${changeType} for user ${userId}`)

    // 1. Determine which sections are affected by this change
    const affectedSections = getAffectedSections(changeType)

    if (affectedSections.length === 0) {
      console.log('[regeneration-service] No affected sections for this change type')
      return
    }

    // 2. Mark affected sections as stale
    await markSectionsStale(userId, affectedSections)

    // 3. Kick off background regeneration (non-blocking!)
    // This runs asynchronously - the user doesn't wait for it
    setImmediate(async () => {
      try {
        console.log(`[regeneration-service] Starting background regeneration for sections: ${affectedSections.join(', ')}`)

        // Mark as generating
        await ensureMetadataTable()
        const user = await prisma.user.findUnique({
          where: { id: userId },
          include: { healthGoals: true },
        })

        if (!user) return

        const issueNames = user.healthGoals
          .filter((g) => !g.name.startsWith('__'))
          .map((g) => g.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'))

        for (const issueSlug of issueNames) {
          for (const section of affectedSections) {
            await prisma.$queryRawUnsafe(
              `UPDATE "InsightsMetadata" SET "status" = 'generating', "updatedAt" = NOW() 
               WHERE "userId" = $1 AND "issueSlug" = $2 AND "section" = $3`,
              userId,
              issueSlug,
              section
            )
          }
        }

        // Run precomputation with concurrency control
        await precomputeIssueSectionsForUser(userId, { concurrency: 4, sectionsFilter: affectedSections })

        // Update metadata to mark as fresh
        for (const issueSlug of issueNames) {
          for (const section of affectedSections) {
            await updateMetadataAfterGeneration(userId, issueSlug, section)
          }
        }

        console.log(`[regeneration-service] Background regeneration complete for user ${userId}`)
      } catch (error) {
        console.error('[regeneration-service] Background regeneration failed', error)

        // Mark as stale again so it can retry later
        await markSectionsStale(userId, affectedSections)
      }
    })

    console.log('[regeneration-service] Background regeneration triggered (non-blocking)')
  } catch (error) {
    console.error('[regeneration-service] Error triggering regeneration', error)
  }
}

/**
 * Manually trigger regeneration for selected change types, even when background
 * regeneration is disabled. This is used for explicit "Update Insights" clicks
 * so we only regenerate the affected sections.
 */
export async function triggerManualSectionRegeneration(
  userId: string,
  changeTypes: DataChangeEvent['changeType'][],
  options: { inline?: boolean; runContext?: RunContext | null; preferQuick?: boolean } = {}
): Promise<IssueSectionKey[]> {
  const requestedTypes = Array.isArray(changeTypes) ? changeTypes : []
  const changeTypesForLog = requestedTypes
  const affectedSections = Array.from(
    new Set(
      requestedTypes.flatMap((type) => getAffectedSections(type)).filter(Boolean)
    )
  )

  if (!userId || affectedSections.length === 0) {
    return []
  }

  const runTask = async () => {
    await markSectionsStale(userId, affectedSections)
    try {
      await ensureMetadataTable()
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { healthGoals: true },
      })

      if (!user) return

      const issueNames = user.healthGoals
        .filter((g) => !g.name.startsWith('__'))
        .map((g) => g.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'))

      console.log('[manual-regeneration] start', {
        userId,
        changeTypes: requestedTypes,
        affectedSections,
        issues: issueNames,
        inline: options.inline === true,
        preferQuick: options.preferQuick === true,
        runContext: options.runContext,
      })

      const targetSlugs = issueNames.length ? issueNames : ['general-health']

      const buildContextForPhase = (phase: 'quick' | 'full'): RunContext | null => {
        if (!options.runContext) return null
        return {
          ...options.runContext,
          meta: {
            ...(options.runContext.meta || {}),
            userId,
            changeTypes: requestedTypes,
            sections: affectedSections,
            phase,
          },
        }
      }

      const runWithScopedContext = async (phase: 'quick' | 'full', runner: () => Promise<void>) => {
        const ctx = buildContextForPhase(phase)
        if (ctx) {
          await withRunContext(ctx, runner)
        } else {
          await runner()
        }
      }

      // Mark as generating (best-effort; fallback slug may not exist in DB)
      for (const issueSlug of targetSlugs) {
        for (const section of affectedSections) {
          await prisma.$queryRawUnsafe(
            `UPDATE "InsightsMetadata" SET "status" = 'generating', "updatedAt" = NOW() 
             WHERE "userId" = $1 AND "issueSlug" = $2 AND "section" = $3`,
            userId,
            issueSlug,
            section
          )
        }
      }

      if (options.preferQuick) {
        console.log('[manual-regeneration] quick precompute start', {
          userId,
          changeTypes: requestedTypes,
          sections: affectedSections,
          issues: targetSlugs,
        })
        await runWithScopedContext('quick', () =>
          precomputeQuickSectionsForUser(userId, {
            concurrency: 4,
            sectionsFilter: affectedSections,
            slugs: targetSlugs,
          })
        )
        console.log('[manual-regeneration] quick precompute complete', {
          userId,
          changeTypes: requestedTypes,
          sections: affectedSections,
          issues: targetSlugs,
        })
      }

      console.log('[manual-regeneration] full precompute start', {
        userId,
        changeTypes: requestedTypes,
        sections: affectedSections,
        issues: targetSlugs,
      })
      await runWithScopedContext('full', () =>
        precomputeIssueSectionsForUser(userId, {
          concurrency: 4,
          sectionsFilter: affectedSections,
          slugs: targetSlugs,
        })
      )
      console.log('[manual-regeneration] full precompute complete', {
        userId,
        changeTypes: requestedTypes,
        sections: affectedSections,
        issues: targetSlugs,
      })

      for (const issueSlug of targetSlugs) {
        for (const section of affectedSections) {
          await updateMetadataAfterGeneration(userId, issueSlug, section)
        }
      }
      console.log('[manual-regeneration] complete', {
        userId,
        changeTypes: requestedTypes,
        affectedSections,
        issues: issueNames,
        inline: options.inline === true,
        preferQuick: options.preferQuick === true,
        runContext: options.runContext,
      })
    } catch (error) {
      console.error('[manual-regeneration] Failed to regenerate sections', {
        userId,
        changeTypes: requestedTypes,
        affectedSections,
        inline: options.inline === true,
        preferQuick: options.preferQuick === true,
        runContext: options.runContext,
        error,
      })
      try {
        await markSectionsStale(userId, affectedSections)
      } catch {}
      throw error
    }
  }

  try {
    if (options.inline) {
      if (options.runContext) {
        await withRunContext(options.runContext, runTask)
      } else {
        await runTask()
      }
    } else {
      // When inline is false, return a promise that resolves when the background run finishes
      return await new Promise<IssueSectionKey[]>((resolve, reject) => {
        setImmediate(() => {
          const runner = async () => {
            try {
              if (options.runContext) {
                await withRunContext(options.runContext, runTask)
              } else {
                await runTask()
              }
              resolve(affectedSections)
            } catch (error) {
              reject(error)
            }
          }
          runner().catch((error) => {
            console.error('[manual-regeneration] Background regeneration failed', error)
            reject(error)
          })
        })
      })
    }
  } catch (error) {
    console.error('[manual-regeneration] Failed to start regeneration', error)
  }

  return affectedSections
}

/**
 * Get user-friendly status message based on insight status
 */
export function getStatusMessage(status: 'fresh' | 'stale' | 'missing' | 'generating', lastGenerated: Date | null): {
  message: string
  tone: 'positive' | 'neutral' | 'info'
} {
  switch (status) {
    case 'fresh':
      if (lastGenerated) {
        const hoursAgo = Math.floor((Date.now() - lastGenerated.getTime()) / (1000 * 60 * 60))
        if (hoursAgo < 1) {
          return { message: 'Fresh insights based on your latest data', tone: 'positive' }
        } else if (hoursAgo < 24) {
          return { message: `No changes detected since ${hoursAgo}h ago`, tone: 'neutral' }
        } else {
          const daysAgo = Math.floor(hoursAgo / 24)
          return { message: `No changes detected since ${daysAgo}d ago`, tone: 'neutral' }
        }
      }
      return { message: 'Current insights ready', tone: 'positive' }

    case 'generating':
      return { message: 'Updating based on your recent changes...', tone: 'info' }

    case 'stale':
      return { message: 'Updating insights based on your recent changes...', tone: 'info' }

    case 'missing':
      return { message: 'Generating your personalized insights...', tone: 'info' }

    default:
      return { message: 'Insights available', tone: 'neutral' }
  }
}
