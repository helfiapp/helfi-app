import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Stripe from 'stripe'
import { Prisma } from '@prisma/client'
import { del, list } from '@vercel/blob'
import { v2 as cloudinary } from 'cloudinary'

const stripe = process.env.STRIPE_SECRET_KEY 
  ? new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2024-06-20',
    })
  : null

const BLOB_HOST = 'blob.vercel-storage.com'
const CLOUDINARY_HOST = 'res.cloudinary.com'
const BLOB_PATH_PREFIXES = [
  'reports/',
  'medical-images/',
  'support/',
  'support/inquiry/',
  'food-photos/',
  'test-vision/',
]

const hasBlobToken = Boolean(
  process.env.BLOB_READ_WRITE_TOKEN || process.env.VERCEL_BLOB_READ_WRITE_TOKEN
)

const hasCloudinaryConfig = Boolean(
  process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
)

if (hasCloudinaryConfig) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME?.trim(),
    api_key: process.env.CLOUDINARY_API_KEY?.trim(),
    api_secret: process.env.CLOUDINARY_API_SECRET?.trim(),
  })
}

type CloudinaryResourceType = 'image' | 'video' | 'raw'
type CloudinaryAsset = { publicId: string; resourceType: CloudinaryResourceType }

const isBlobUrl = (value: string) => value.includes(BLOB_HOST)
const isCloudinaryUrl = (value: string) => value.includes('cloudinary.com')

const isLikelyBlobPath = (value: string) =>
  BLOB_PATH_PREFIXES.some((prefix) => value.startsWith(prefix))

const asMetadata = (value: Prisma.JsonValue | null | undefined) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {} as Record<string, any>
  return value as Record<string, any>
}

const addBlobTarget = (targets: Set<string>, value?: string | null) => {
  if (!value) return
  const trimmed = value.trim()
  if (!trimmed) return
  if (isBlobUrl(trimmed) || isLikelyBlobPath(trimmed)) {
    targets.add(trimmed)
  }
}

const addCloudinaryAsset = (targets: Map<string, CloudinaryAsset>, asset: CloudinaryAsset | null) => {
  if (!asset?.publicId) return
  const key = `${asset.resourceType}:${asset.publicId}`
  if (!targets.has(key)) {
    targets.set(key, asset)
  }
}

const parseCloudinaryAsset = (url: string): CloudinaryAsset | null => {
  try {
    const parsed = new URL(url)
    if (!parsed.hostname.includes('cloudinary.com')) return null
    const parts = parsed.pathname.split('/').filter(Boolean)
    const uploadIndex = parts.findIndex((part) => part === 'upload')
    if (uploadIndex <= 0) return null
    const resourceType = parts[uploadIndex - 1] as CloudinaryResourceType
    const afterUpload = parts.slice(uploadIndex + 1)
    const versionIndex = afterUpload.findIndex((part) => /^v\d+$/.test(part))
    const publicParts = versionIndex >= 0 ? afterUpload.slice(versionIndex + 1) : afterUpload
    if (!publicParts.length) return null
    const publicIdWithExt = publicParts.join('/')
    const publicId = publicIdWithExt.replace(/\.[^/.]+$/, '')
    if (!publicId) return null
    const normalized: CloudinaryResourceType =
      resourceType === 'video' || resourceType === 'raw' ? resourceType : 'image'
    return { publicId, resourceType: normalized }
  } catch {
    return null
  }
}

const toUrlList = (value: unknown): string[] => {
  if (!value) return []
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry || '').trim()).filter(Boolean)
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return []
    try {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed)) {
        return parsed.map((entry) => String(entry || '').trim()).filter(Boolean)
      }
    } catch {
      return [trimmed]
    }
  }
  return []
}

const chunk = <T,>(items: T[], size: number) => {
  const result: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size))
  }
  return result
}

const deleteBlobTargets = async (targets: string[]) => {
  if (!targets.length) return 0
  const batches = chunk(targets, 100)
  let deleted = 0
  for (const batch of batches) {
    if (!batch.length) continue
    await del(batch)
    deleted += batch.length
  }
  return deleted
}

const deleteFoodPhotoBlobs = async (userId: string) => {
  const prefix = `food-photos/${userId}/`
  let cursor: string | undefined
  let deleted = 0
  do {
    const result = await list({ prefix, limit: 1000, cursor })
    cursor = result.cursor
    const paths = result.blobs.map((blob) => blob.pathname)
    const batches = chunk(paths, 100)
    for (const batch of batches) {
      if (!batch.length) continue
      await del(batch)
      deleted += batch.length
    }
  } while (cursor)
  return deleted
}

const deleteCloudinaryAssets = async (assets: CloudinaryAsset[]) => {
  if (!assets.length) return 0
  let deleted = 0
  for (const asset of assets) {
    const result = await cloudinary.uploader.destroy(asset.publicId, {
      resource_type: asset.resourceType,
      invalidate: true,
    })
    if (result?.result === 'ok' || result?.result === 'not found') {
      deleted += 1
    } else {
      throw new Error(`Cloudinary delete failed for ${asset.publicId}: ${result?.result || 'unknown'}`)
    }
  }
  return deleted
}

function isMissingDbObjectError(err: unknown): boolean {
  const anyErr = err as any
  const code = anyErr?.code as string | undefined
  const msg = String(anyErr?.message || '')

  // Prisma known request errors:
  // - P2021: table does not exist
  // - P2022: column does not exist
  if (code === 'P2021' || code === 'P2022') return true

  // Fallback string checks (covers some prisma engines / postgres phrasing)
  return (
    /does not exist/i.test(msg) ||
    /Unknown column/i.test(msg) ||
    /column .* does not exist/i.test(msg) ||
    /relation .* does not exist/i.test(msg)
  )
}

async function bestEffort(label: string, fn: () => Promise<unknown>) {
  try {
    await fn()
  } catch (err: any) {
    // If production DB is behind schema, ignore missing table/column errors so deletion can proceed.
    if (isMissingDbObjectError(err) || err instanceof Prisma.PrismaClientKnownRequestError) {
      if (isMissingDbObjectError(err)) {
        console.warn(`⚠️ Account deletion cleanup skipped (${label}):`, err?.message || err)
        return
      }
    }
    throw err
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userEmail = session.user.email
    console.log('🗑️ Account deletion requested for:', userEmail)

    // IMPORTANT:
    // Do NOT use `include` here because Prisma will select all scalar User columns by default.
    // If the DB hasn't been migrated yet for newly added fields (e.g., free credits counters),
    // selecting the full User row will throw "column does not exist". We only select what we need.
    const user = await prisma.user.findUnique({
      where: { email: userEmail },
      select: {
        id: true,
        email: true,
        image: true,
        subscription: {
          select: {
            stripeSubscriptionId: true,
          },
        },
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const blobTargets = new Set<string>()
    const cloudinaryAssets = new Map<string, CloudinaryAsset>()

    const files = await prisma.file.findMany({
      where: { uploadedById: user.id },
      select: {
        id: true,
        fileName: true,
        cloudinaryId: true,
        cloudinaryUrl: true,
        secureUrl: true,
        metadata: true,
        fileType: true,
        usage: true,
      },
    })

    for (const file of files) {
      const metadata = asMetadata(file.metadata)
      addBlobTarget(blobTargets, metadata?.blobPathname)
      addBlobTarget(blobTargets, metadata?.blobUrl)
      addBlobTarget(blobTargets, file.fileName)
      addBlobTarget(blobTargets, file.cloudinaryId)
      addBlobTarget(blobTargets, file.cloudinaryUrl)
      addBlobTarget(blobTargets, file.secureUrl)

      const cloudinaryUrl = [file.secureUrl, file.cloudinaryUrl]
        .filter((value): value is string => typeof value === 'string' && value.length > 0)
        .find((value) => isCloudinaryUrl(value))

      const parsed = cloudinaryUrl ? parseCloudinaryAsset(cloudinaryUrl) : null
      const publicId = file.cloudinaryId || parsed?.publicId
      const fileType = String(file.fileType || '').toUpperCase()
      const resourceType: CloudinaryResourceType =
        parsed?.resourceType || (fileType === 'VIDEO' || fileType === 'AUDIO' ? 'video' : fileType === 'DOCUMENT' ? 'raw' : 'image')

      if (publicId && (cloudinaryUrl || String(file.usage) === 'PROFILE_IMAGE')) {
        addCloudinaryAsset(cloudinaryAssets, { publicId, resourceType })
      }
    }

    if (user.image && isCloudinaryUrl(user.image)) {
      addCloudinaryAsset(cloudinaryAssets, parseCloudinaryAsset(user.image))
    }

    const reports = await prisma.report.findMany({
      where: { userId: user.id },
      select: {
        s3Key: true,
        metadata: true,
      },
    })

    for (const report of reports) {
      const metadata = asMetadata(report.metadata)
      addBlobTarget(blobTargets, metadata?.blobPathname || report.s3Key)
      addBlobTarget(blobTargets, metadata?.blobUrl)
    }

    const foodPhotos = await prisma.foodLog.findMany({
      where: { userId: user.id, imageUrl: { not: null } },
      select: { imageUrl: true },
    })
    const foodPhotoCount = foodPhotos.filter(
      (entry) =>
        entry.imageUrl &&
        (isBlobUrl(entry.imageUrl) || isLikelyBlobPath(entry.imageUrl)),
    ).length

    try {
      const moodRows = await prisma.$queryRawUnsafe<Array<{ images: any; audio: any }>>(
        `SELECT images, audio FROM MoodJournalEntries WHERE userId = $1`,
        user.id
      )
      for (const row of moodRows) {
        for (const url of [...toUrlList(row.images), ...toUrlList(row.audio)]) {
          if (isCloudinaryUrl(url)) {
            addCloudinaryAsset(cloudinaryAssets, parseCloudinaryAsset(url))
          }
        }
      }
    } catch (error) {
      if (isMissingDbObjectError(error)) {
        console.warn('⚠️ Mood journal table missing; skipping mood file cleanup.')
      } else {
        throw error
      }
    }

    const needsBlobDeletion = blobTargets.size > 0 || foodPhotoCount > 0
    const needsCloudinaryDeletion = cloudinaryAssets.size > 0

    if (needsBlobDeletion && !hasBlobToken) {
      return NextResponse.json(
        { error: 'File deletion is not configured. Please contact support.' },
        { status: 503 }
      )
    }
    if (needsCloudinaryDeletion && !hasCloudinaryConfig) {
      return NextResponse.json(
        { error: 'File deletion is not configured. Please contact support.' },
        { status: 503 }
      )
    }

    if (blobTargets.size > 0) {
      await deleteBlobTargets(Array.from(blobTargets))
    }

    if (foodPhotoCount > 0) {
      await deleteFoodPhotoBlobs(user.id)
    }

    if (cloudinaryAssets.size > 0) {
      await deleteCloudinaryAssets(Array.from(cloudinaryAssets.values()))
    }

    // Cancel Stripe subscription (and derive customer id from subscription, since we don't store it in DB)
    let stripeCustomerId: string | null = null
    if (stripe && user.subscription?.stripeSubscriptionId) {
      const subId = user.subscription.stripeSubscriptionId
      try {
        const sub = await stripe.subscriptions.retrieve(subId)
        const customer = (sub as any)?.customer
        stripeCustomerId = typeof customer === 'string' ? customer : (customer?.id ?? null)
      } catch (error: any) {
        console.warn('⚠️ Failed to retrieve Stripe subscription (non-blocking):', error?.message || error)
      }

      try {
        await stripe.subscriptions.cancel(subId)
        console.log('✅ Cancelled Stripe subscription:', subId)
      } catch (error: any) {
        // Log but don't fail - subscription might already be cancelled
        console.warn('⚠️ Failed to cancel Stripe subscription (may already be cancelled):', error.message)
      }
    }

    // Delete Stripe customer if we could resolve it from the subscription
    if (stripe && stripeCustomerId) {
      try {
        await stripe.customers.del(stripeCustomerId)
        console.log('✅ Deleted Stripe customer:', stripeCustomerId)
      } catch (error: any) {
        // Log but don't fail - customer might already be deleted
        console.warn('⚠️ Failed to delete Stripe customer (may already be deleted):', error.message)
      }
    }

    // Delete all user-related data (cascading deletes will handle most relationships)
    // But we'll explicitly delete some to be safe and clear
    
    // Delete OAuth accounts (Fitbit, Garmin, etc.)
    await bestEffort('account.deleteMany', () =>
      prisma.account.deleteMany({
        where: { userId: user.id },
      })
    )

    // Delete sessions
    await bestEffort('session.deleteMany', () =>
      prisma.session.deleteMany({
        where: { userId: user.id },
      })
    )

    // Delete verification tokens
    await bestEffort('verificationToken.deleteMany', () =>
      prisma.verificationToken.deleteMany({
        where: { identifier: user.email },
      })
    )

    // Delete credit top-ups
    await bestEffort('creditTopUp.deleteMany', () =>
      prisma.creditTopUp.deleteMany({
        where: { userId: user.id },
      })
    )

    // Delete subscription (if not already deleted)
    await bestEffort('subscription.deleteMany', () =>
      prisma.subscription.deleteMany({
        where: { userId: user.id },
      })
    )

    // Delete all health-related data
    await bestEffort('healthGoal.deleteMany', () => prisma.healthGoal.deleteMany({ where: { userId: user.id } }))
    await bestEffort('supplement.deleteMany', () => prisma.supplement.deleteMany({ where: { userId: user.id } }))
    await bestEffort('medication.deleteMany', () => prisma.medication.deleteMany({ where: { userId: user.id } }))
    await bestEffort('healthLog.deleteMany', () => prisma.healthLog.deleteMany({ where: { userId: user.id } }))
    await bestEffort('foodLog.deleteMany', () => prisma.foodLog.deleteMany({ where: { userId: user.id } }))
    await bestEffort('exerciseLog.deleteMany', () => prisma.exerciseLog.deleteMany({ where: { userId: user.id } }))
    await bestEffort('exerciseEntry.deleteMany', () => prisma.exerciseEntry.deleteMany({ where: { userId: user.id } }))
    
    // Delete AI analysis data
    await bestEffort('interactionAnalysis.deleteMany', () => prisma.interactionAnalysis.deleteMany({ where: { userId: user.id } }))
    await bestEffort('symptomAnalysis.deleteMany', () => prisma.symptomAnalysis.deleteMany({ where: { userId: user.id } }))
    await bestEffort('medicalImageAnalysis.deleteMany', () => prisma.medicalImageAnalysis.deleteMany({ where: { userId: user.id } }))
    await bestEffort('foodAnalysisFeedback.deleteMany', () => prisma.foodAnalysisFeedback.deleteMany({ where: { userId: user.id } }))
    
    // Delete device data
    await bestEffort('fitbitData.deleteMany', () => prisma.fitbitData.deleteMany({ where: { userId: user.id } }))
    await bestEffort('garminRequestToken.deleteMany', () => prisma.garminRequestToken.deleteMany({ where: { userId: user.id } }))
    await bestEffort('garminWebhookLog.deleteMany', () => prisma.garminWebhookLog.deleteMany({ where: { userId: user.id } }))
    
    // Delete files (File model uses uploadedById, not userId)
    await bestEffort('file.deleteMany', () => prisma.file.deleteMany({ where: { uploadedById: user.id } }))
    
    // Delete reports
    await bestEffort('report.deleteMany', () => prisma.report.deleteMany({ where: { userId: user.id } }))
    await bestEffort('consentRecord.deleteMany', () => prisma.consentRecord.deleteMany({ where: { userId: user.id } }))
    
    // Delete affiliate data
    await bestEffort('affiliateReferral.deleteMany', () => prisma.affiliateReferral.deleteMany({ where: { referredUserId: user.id } }))
    await bestEffort('affiliateConversion.deleteMany', () => prisma.affiliateConversion.deleteMany({ where: { referredUserId: user.id } }))
    await bestEffort('affiliateApplication.deleteMany', () => prisma.affiliateApplication.deleteMany({ where: { userId: user.id } }))
    await bestEffort('affiliate.deleteMany', () => prisma.affiliate.deleteMany({ where: { userId: user.id } }))
    
    // Delete support tickets
    await bestEffort('supportTicket.deleteMany', () => prisma.supportTicket.deleteMany({ where: { userId: user.id } }))

    // Clean up records stored in raw SQL tables outside Prisma.
    await bestEffort('MoodEntries.deleteMany', () =>
      prisma.$executeRawUnsafe(`DELETE FROM MoodEntries WHERE userId = $1`, user.id)
    )
    await bestEffort('MoodJournalEntries.deleteMany', () =>
      prisma.$executeRawUnsafe(`DELETE FROM MoodJournalEntries WHERE userId = $1`, user.id)
    )
    await bestEffort('MoodReminderSettings.deleteMany', () =>
      prisma.$executeRawUnsafe(`DELETE FROM MoodReminderSettings WHERE userId = $1`, user.id)
    )
    await bestEffort('MoodReminderDeliveryLog.deleteMany', () =>
      prisma.$executeRawUnsafe(`DELETE FROM MoodReminderDeliveryLog WHERE userId = $1`, user.id)
    )
    await bestEffort('CheckinSettings.deleteMany', () =>
      prisma.$executeRawUnsafe(`DELETE FROM CheckinSettings WHERE userId = $1`, user.id)
    )
    await bestEffort('CheckinIssues.deleteMany', () =>
      prisma.$executeRawUnsafe(`DELETE FROM CheckinIssues WHERE userId = $1`, user.id)
    )
    await bestEffort('CheckinRatings.deleteMany', () =>
      prisma.$executeRawUnsafe(`DELETE FROM CheckinRatings WHERE userId = $1`, user.id)
    )
    await bestEffort('HealthTipSettings.deleteMany', () =>
      prisma.$executeRawUnsafe(`DELETE FROM HealthTipSettings WHERE userId = $1`, user.id)
    )
    await bestEffort('HealthTips.deleteMany', () =>
      prisma.$executeRawUnsafe(`DELETE FROM HealthTips WHERE userId = $1`, user.id)
    )
    await bestEffort('HealthTipDeliveryLog.deleteMany', () =>
      prisma.$executeRawUnsafe(`DELETE FROM HealthTipDeliveryLog WHERE userId = $1`, user.id)
    )
    await bestEffort('PushSubscriptions.deleteMany', () =>
      prisma.$executeRawUnsafe(`DELETE FROM PushSubscriptions WHERE userId = $1`, user.id)
    )
    await bestEffort('ReminderDeliveryLog.deleteMany', () =>
      prisma.$executeRawUnsafe(`DELETE FROM ReminderDeliveryLog WHERE userId = $1`, user.id)
    )
    await bestEffort('InsightsCache.deleteMany', () =>
      prisma.$executeRawUnsafe(`DELETE FROM "InsightsCache" WHERE "userId" = $1`, user.id)
    )
    await bestEffort('InsightsUserState.deleteMany', () =>
      prisma.$executeRawUnsafe(`DELETE FROM "InsightsUserState" WHERE "userId" = $1`, user.id)
    )
    await bestEffort('AnalyticsEvent.deleteMany', () =>
      prisma.$executeRawUnsafe(
        `DELETE FROM "AnalyticsEvent" WHERE "userId" = $1 OR "userId" = $2`,
        user.id,
        user.email
      )
    )
    await bestEffort('TalkToAIChatThread.deleteMany', () =>
      prisma.$executeRawUnsafe(`DELETE FROM "TalkToAIChatThread" WHERE "userId" = $1`, user.id)
    )
    await bestEffort('UserSessionRevocation.deleteMany', () =>
      prisma.$executeRawUnsafe(`DELETE FROM "UserSessionRevocation" WHERE "userId" = $1`, user.id)
    )

    // Finally, delete the user.
    // IMPORTANT: Use deleteMany() instead of delete() because delete() returns the deleted User record.
    // When the DB is behind the Prisma schema (missing columns), returning the full record will throw.
    const deleted = await prisma.user.deleteMany({
      where: { id: user.id },
    })
    if (!deleted?.count) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    console.log('✅ Successfully deleted account and all related data for:', userEmail)

    return NextResponse.json({ 
      success: true, 
      message: 'Account deleted successfully' 
    })
  } catch (error: any) {
    console.error('❌ Error deleting account:', error)
    return NextResponse.json({ 
      error: 'Failed to delete account',
      message: error.message || 'An unexpected error occurred'
    }, { status: 500 })
  }
}
