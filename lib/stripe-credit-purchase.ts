import Stripe from 'stripe'
import { prisma } from '@/lib/prisma'

export function purchasedCredits(checkout: Stripe.Checkout.Session): number {
  const lines = checkout.line_items
  if (!lines || lines.has_more || lines.data.length !== 1) return 0
  const line = lines.data[0]
  const quantity = line.quantity
  if (!quantity || !Number.isSafeInteger(quantity) || quantity < 1) return 0

  const packs = [
    { credits: 250, priceId: process.env.STRIPE_PRICE_CREDITS_250, cents: 500, title: 'Helfi Credit Top-up (250 credits)' },
    { credits: 500, priceId: process.env.STRIPE_PRICE_CREDITS_500, cents: 1000, title: 'Helfi Credit Top-up (500 credits)' },
    { credits: 1000, priceId: process.env.STRIPE_PRICE_CREDITS_1000, cents: 2000, title: 'Helfi Credit Top-up (1,000 credits)' },
    { credits: 100, priceId: process.env.STRIPE_PRICE_CREDITS_100, cents: 200, title: 'Helfi Credit Top-up (100 credits)' },
  ]
  const pack = packs.find(pack =>
    (pack.priceId && line.price?.id === pack.priceId) ||
    (line.description === pack.title && line.price?.currency === 'usd' && line.price.unit_amount === pack.cents),
  )
  const metadata = checkout.metadata
  if (metadata?.helfi_credit_plan &&
    (metadata.helfi_credit_plan !== `credits_${pack?.credits}` || metadata.helfi_credit_quantity !== String(quantity))) return 0
  const credits = (pack?.credits || 0) * quantity
  return Number.isSafeInteger(credits) && credits <= 2147483647 ? credits : 0
}

export async function grantStripeCreditPurchase(stripe: Stripe, checkout: Stripe.Checkout.Session, ownerId: string) {
  const walletCredits = purchasedCredits(checkout)
  if (checkout.mode !== 'payment' || checkout.status !== 'complete' || checkout.payment_status !== 'paid' ||
    !walletCredits || !checkout.amount_total || checkout.amount_total <= 0) return 'payment_unavailable' as const
  const purchasedAt = new Date()
  const expiresAt = new Date(purchasedAt)
  expiresAt.setUTCMonth(expiresAt.getUTCMonth() + 12)

  const source = `stripe:${checkout.id}`
  return prisma.$transaction(async tx => {
    // Serialize retries across server processes before checking the same purchase.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${source}))`
    if (await tx.creditTopUp.findFirst({ where: { source } })) return false
    const paymentIntentId = typeof checkout.payment_intent === 'string'
      ? checkout.payment_intent : checkout.payment_intent?.id
    if (!paymentIntentId) return 'payment_unavailable' as const
    // Re-read inside the refund lock so an earlier refund cannot become a new grant.
    const payment = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ['latest_charge'] }, { timeout: 5000, maxNetworkRetries: 0 })
    const charge = typeof payment.latest_charge === 'string'
      ? await stripe.charges.retrieve(payment.latest_charge, { timeout: 5000, maxNetworkRetries: 0 }) : payment.latest_charge
    const chargePaymentId = typeof charge?.payment_intent === 'string' ? charge.payment_intent : charge?.payment_intent?.id
    if (payment.id !== paymentIntentId || payment.status !== 'succeeded' || !charge || chargePaymentId !== paymentIntentId) return 'payment_unavailable' as const
    if (charge.refunded === true || charge.amount_refunded > 0 || charge.disputed === true) return 'payment_refunded' as const
    if (charge.paid !== true || charge.refunded !== false || charge.amount_refunded !== 0 || charge.disputed !== false) return 'payment_unavailable' as const
    await tx.creditTopUp.create({
      data: { userId: ownerId, amountCents: walletCredits, usedCents: 0, purchasedAt, expiresAt, source },
    })
    return true
  }, { maxWait: 5000, timeout: 20000 })
}
