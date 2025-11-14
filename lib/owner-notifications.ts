import { prisma } from '@/lib/prisma'
import webpush from 'web-push'

/**
 * Owner Notification System
 * Sends push notifications to the app owner when important events occur:
 * - New user signups
 * - Subscription purchases
 * - Credit purchases
 * 
 * Uses the same web-push system as check-in reminders.
 * Owner must subscribe to push notifications first via their account.
 */

interface NotificationOptions {
  event: 'signup' | 'subscription' | 'credit_purchase'
  userEmail: string
  userName?: string
  amount?: number // in cents
  currency?: string
  planName?: string
  creditAmount?: number
  additionalInfo?: string
}

/**
 * Get owner's user ID from email (checks both User and AdminUser tables)
 */
async function getOwnerUserId(): Promise<string | null> {
  const ownerEmail = process.env.OWNER_EMAIL
  if (!ownerEmail) {
    console.log('📱 Owner email not configured (set OWNER_EMAIL environment variable)')
    return null
  }

  try {
    // First check AdminUser table (for admin panel users)
    const adminUser = await prisma.adminUser.findUnique({
      where: { email: ownerEmail.toLowerCase() },
      select: { id: true }
    })
    
    if (adminUser) {
      // For admin users, we need to find their corresponding User account
      // or create a mapping. For now, let's check if there's a User with same email
      const regularUser = await prisma.user.findUnique({
        where: { email: ownerEmail.toLowerCase() },
        select: { id: true }
      })
      return regularUser?.id || null
    }

    // Fallback to regular User table
    const owner = await prisma.user.findUnique({
      where: { email: ownerEmail.toLowerCase() },
      select: { id: true }
    })
    return owner?.id || null
  } catch (error) {
    console.error('❌ Failed to find owner user:', error)
    return null
  }
}

/**
 * Get owner's push subscription from database
 */
async function getOwnerSubscription(): Promise<any | null> {
  const ownerUserId = await getOwnerUserId()
  if (!ownerUserId) {
    return null
  }

  try {
    // Ensure table exists
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS PushSubscriptions (
        userId TEXT PRIMARY KEY,
        subscription JSONB NOT NULL
      )
    `)

    const rows: Array<{ subscription: any }> = await prisma.$queryRawUnsafe(
      `SELECT subscription FROM PushSubscriptions WHERE userId = $1`,
      ownerUserId
    )

    if (!rows.length) {
      console.log('📱 Owner has not subscribed to push notifications yet')
      return null
    }

    return rows[0].subscription
  } catch (error) {
    console.error('❌ Failed to get owner subscription:', error)
    return null
  }
}

/**
 * Format amount in cents to currency string
 */
function formatAmount(cents: number, currency: string = 'USD'): string {
  const amount = cents / 100
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
  }).format(amount)
}

/**
 * Generate notification payload based on event type
 */
function generateNotificationPayload(options: NotificationOptions): { title: string; body: string; url: string } {
  const { event, userEmail, userName, amount, currency, planName, creditAmount } = options
  const displayName = userName || userEmail.split('@')[0]

  switch (event) {
    case 'signup': {
      return {
        title: '🎉 New User Signup',
        body: `${displayName} just signed up!`,
        url: '/admin-panel'
      }
    }

    case 'subscription': {
      const amountStr = amount ? formatAmount(amount, currency) : 'N/A'
      const planStr = planName || 'Premium'
      return {
        title: '💰 New Subscription',
        body: `${displayName} purchased ${planStr} (${amountStr})`,
        url: '/admin-panel'
      }
    }

    case 'credit_purchase': {
      const amountStr = amount ? formatAmount(amount, currency) : 'N/A'
      const creditsStr = creditAmount ? `${creditAmount} credits` : 'credits'
      return {
        title: '💳 Credit Purchase',
        body: `${displayName} bought ${creditsStr} (${amountStr})`,
        url: '/admin-panel'
      }
    }
  }
}

/**
 * Send push notification to owner
 * This function is non-blocking and won't throw errors
 */
export async function notifyOwner(options: NotificationOptions): Promise<void> {
  try {
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''
    const privateKey = process.env.VAPID_PRIVATE_KEY || ''
    
    if (!publicKey || !privateKey) {
      console.log('📱 VAPID keys not configured - push notifications disabled')
      return
    }

    const subscription = await getOwnerSubscription()
    if (!subscription) {
      // Silently fail - owner hasn't subscribed yet
      return
    }

    webpush.setVapidDetails('mailto:support@helfi.ai', publicKey, privateKey)

    const payload = generateNotificationPayload(options)
    const payloadJson = JSON.stringify(payload)

    // Send notification (don't await to avoid blocking)
    webpush.sendNotification(subscription, payloadJson).catch((error: any) => {
      console.error('❌ [OWNER PUSH] Failed to send:', error?.body || error?.message || error)
      // If subscription is invalid, we could optionally remove it here
      // But for now, just log the error
    })

    console.log(`📢 [OWNER NOTIFICATION] Queued ${options.event} push notification`)
  } catch (error) {
    // Never throw - notifications are non-critical
    console.error('❌ [OWNER NOTIFICATION] Failed to queue notification:', error)
  }
}

