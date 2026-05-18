import { prisma } from '@/lib/prisma'

let ensuredSubscriptionStoreColumns = false

export async function ensureSubscriptionStoreColumns() {
  if (ensuredSubscriptionStoreColumns) return
  await prisma.$executeRawUnsafe('ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "source" TEXT')
  await prisma.$executeRawUnsafe('ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "storeProductId" TEXT')
  await prisma.$executeRawUnsafe('ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "storeTransactionId" TEXT')
  await prisma.$executeRawUnsafe('ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "storeOriginalTransactionId" TEXT')
  ensuredSubscriptionStoreColumns = true
}

export function normalizeSubscriptionSource(value: unknown): string | null {
  const raw = String(value || '').trim().toLowerCase()
  if (raw === 'apple_iap' || raw === 'google_iap' || raw === 'stripe' || raw === 'admin') return raw
  return null
}

export function subscriptionSourceLabel(value: unknown): string {
  const source = normalizeSubscriptionSource(value)
  if (source === 'apple_iap') return 'Apple App Store'
  if (source === 'google_iap') return 'Google Play'
  if (source === 'stripe') return 'Stripe'
  if (source === 'admin') return 'Admin'
  return 'Unknown'
}
