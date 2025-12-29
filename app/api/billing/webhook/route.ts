import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { prisma } from '@/lib/prisma'
import { Resend } from 'resend'
import { notifyOwner } from '@/lib/owner-notifications'
import { getEmailFooter } from '@/lib/email-footer'
import { reportCriticalError } from '@/lib/error-reporter'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2024-06-20' })
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET || ''
const SUBSCRIBER_MILESTONE_INTERVAL = 20

async function getBalanceTransactionForPaymentIntent(paymentIntentId: string) {
  const pi = await stripe.paymentIntents.retrieve(paymentIntentId, {
    expand: ['charges.data.balance_transaction'],
  })
  const charge = (pi as any)?.charges?.data?.[0] as Stripe.Charge | undefined
  const balanceTx = (charge as any)?.balance_transaction as Stripe.BalanceTransaction | undefined
  return { charge, balanceTx }
}

function isStripeSubscriptionActive(subscription: Stripe.Subscription): boolean {
  return subscription.status === 'active' || subscription.status === 'trialing'
}

async function findCheckoutSessionForPaymentIntent(paymentIntentId: string): Promise<Stripe.Checkout.Session | null> {
  try {
    const sessions = await stripe.checkout.sessions.list({
      payment_intent: paymentIntentId,
      limit: 1,
    })
    return sessions.data[0] ?? null
  } catch {
    return null
  }
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setUTCDate(d.getUTCDate() + days)
  return d
}

async function ensureSubscriberMilestonesTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS SubscriberMilestones (
      id TEXT PRIMARY KEY,
      total_count INT NOT NULL DEFAULT 0,
      last_notified_count INT NOT NULL DEFAULT 0,
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `)

  await prisma.$executeRawUnsafe(`
    INSERT INTO SubscriberMilestones (id, total_count, last_notified_count)
    VALUES ('global', 0, 0)
    ON CONFLICT (id) DO NOTHING
  `)
}

async function incrementSubscriberMilestoneCounter(): Promise<{
  totalCount: number
  shouldNotify: boolean
}> {
  await ensureSubscriberMilestonesTable()

  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRawUnsafe<
      Array<{ total_count: number; last_notified_count: number }>
    >(`SELECT total_count, last_notified_count FROM SubscriberMilestones WHERE id = 'global' FOR UPDATE`)
    const currentCount = rows[0]?.total_count ?? 0
    const lastNotified = rows[0]?.last_notified_count ?? 0
    const totalCount = currentCount + 1
    const shouldNotify =
      totalCount % SUBSCRIBER_MILESTONE_INTERVAL === 0 && totalCount > lastNotified
    const nextNotified = shouldNotify ? totalCount : lastNotified

    await tx.$executeRawUnsafe(
      `UPDATE SubscriberMilestones
       SET total_count = $1, last_notified_count = $2, updated_at = NOW()
       WHERE id = 'global'`,
      totalCount,
      nextNotified
    )

    return { totalCount, shouldNotify }
  })
}

async function sendSubscriberMilestoneEmail(options: {
  recipientEmail: string
  totalCount: number
  latestSubscriberEmail: string
}) {
  if (!resend) {
    console.log('📧 Resend API not configured, skipping subscriber milestone email')
    return
  }

  const { recipientEmail, totalCount, latestSubscriberEmail } = options
  const subject = `Helfi milestone reached: ${totalCount} paid subscribers`
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
      <h2 style="margin: 0 0 16px 0;">Subscriber milestone reached</h2>
      <p style="margin: 0 0 8px 0;"><strong>Total paid subscribers:</strong> ${totalCount}</p>
      <p style="margin: 0 0 16px 0;"><strong>Latest subscriber:</strong> ${latestSubscriberEmail}</p>
      <p style="margin: 0 0 16px 0;">You asked to be notified every ${SUBSCRIBER_MILESTONE_INTERVAL} new subscribers.</p>
      ${getEmailFooter({
        recipientEmail,
        emailType: 'admin',
        reasonText: 'You received this email because you requested subscriber milestone alerts.'
      })}
    </div>
  `

  const emailResponse = await resend.emails.send({
    from: 'Helfi Alerts <support@helfi.ai>',
    to: recipientEmail,
    subject,
    html,
  })

  console.log(`✅ [SUBSCRIBER MILESTONE] Sent to ${recipientEmail} with ID: ${emailResponse.data?.id}`)
}

export async function POST(request: NextRequest) {
  const sig = request.headers.get('stripe-signature') || ''
  const rawBody = await request.text()

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, endpointSecret)
  } catch (err) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription
        const currentPeriodStart = sub.current_period_start
          ? new Date(sub.current_period_start * 1000)
          : new Date()
        const currentPeriodEnd = sub.current_period_end
          ? new Date(sub.current_period_end * 1000)
          : null
        // Get customer email via customer ID
        const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id
        let email: string | undefined
        if (customerId) {
          try {
            const customer = await stripe.customers.retrieve(customerId)
            if ((customer as Stripe.Customer).email) {
              email = (customer as Stripe.Customer).email as string
            }
          } catch {
            // ignore customer fetch errors
          }
        }
        if (!email) break

        // Determine monthly price from subscription
        const amountCents = sub.items.data[0]?.price?.unit_amount || 0
        
        // Check if subscription already exists and if tier is changing
        const existingUser = await prisma.user.findUnique({
          where: { email: email.toLowerCase() },
          include: { subscription: true }
        })

        const isActive = isStripeSubscriptionActive(sub)
        if (!isActive) {
          if (existingUser?.subscription) {
            await prisma.subscription.update({
              where: { userId: existingUser.id },
              data: {
                stripeSubscriptionId: sub.id,
                monthlyPriceCents: amountCents,
                endDate: new Date(),
              },
            })
          }
          console.log(`[Webhook] Subscription ${sub.id} for ${email} is ${sub.status}. Access paused.`)
          break
        }
        
        const existingSub = existingUser?.subscription
        const isNewSubscription = !existingSub
        const isTierChange = existingSub && existingSub.monthlyPriceCents !== amountCents
        // Also reset if switching from admin-granted (no stripeSubscriptionId) to Stripe-managed subscription
        // This is critical: if subscription exists but doesn't have stripeSubscriptionId, and we're adding one, reset everything
        const isSwitchingToStripe = existingSub && !existingSub.stripeSubscriptionId
        const hasNewStripeId = !existingSub?.stripeSubscriptionId || existingSub.stripeSubscriptionId !== sub.id
        
        // If tier is changing, new subscription, or switching to Stripe, reset startDate to start new billing cycle
        const shouldResetCredits = isNewSubscription || isTierChange || isSwitchingToStripe || hasNewStripeId
        // Always align startDate/reset to Stripe period start when switching to Stripe or creating new subscription
        const newStartDate = shouldResetCredits ? currentPeriodStart : (existingSub?.startDate || currentPeriodStart)
        
        // Log for debugging
        console.log(`[Webhook] Subscription ${sub.id} for ${email}:`, {
          isNewSubscription,
          isTierChange,
          isSwitchingToStripe,
          hasNewStripeId,
          shouldResetCredits,
          existingStripeId: existingSub?.stripeSubscriptionId,
          newStripeId: sub.id,
          existingStartDate: existingSub?.startDate,
          newStartDate,
          currentPeriodStart,
          currentPeriodEnd
        })
        
        // Set plan to PREMIUM and store Stripe subscription ID
        // IMPORTANT: Always update startDate when switching to Stripe, even if using upsert
        // Use direct update if subscription exists to ensure startDate is always updated when switching to Stripe
        let user
        if (existingSub) {
          // Subscription exists - update it directly to ensure startDate is always set correctly
          await prisma.subscription.update({
            where: { userId: existingUser.id },
            data: {
              plan: 'PREMIUM',
              monthlyPriceCents: amountCents,
              stripeSubscriptionId: sub.id,
              startDate: newStartDate, // Always update startDate when switching to Stripe
              endDate: currentPeriodEnd
            }
          })
          // Fetch updated user with subscription
          user = await prisma.user.findUnique({
            where: { email: email.toLowerCase() },
            include: { subscription: true }
          })
        } else {
          // New subscription - use upsert create
          user = await prisma.user.update({
            where: { email: email.toLowerCase() },
            data: {
              subscription: { 
                create: { 
                  plan: 'PREMIUM',
                  monthlyPriceCents: amountCents,
                  stripeSubscriptionId: sub.id,
                  startDate: newStartDate,
                  endDate: currentPeriodEnd
                }
              },
            },
            include: { subscription: true }
          })
        }
        
        if (!user) {
          console.error(`[Webhook] Failed to update user ${email} after subscription update`)
          break
        }
        
        // Reset monthly counters and wallet when starting new subscription cycle or changing tier
        if (shouldResetCredits) {
          console.log(`[Webhook] Resetting credits for user ${user.id} - switching to Stripe or new subscription`, {
            walletResetAt: newStartDate
          })
          await prisma.user.update({
            where: { id: user.id },
            data: {
              dailyAnalysisCredits: 30,
              walletMonthlyUsedCents: 0,
              walletMonthlyResetAt: newStartDate,
              monthlySymptomAnalysisUsed: 0,
              monthlyFoodAnalysisUsed: 0,
              monthlyMedicalImageAnalysisUsed: 0,
              monthlyInteractionAnalysisUsed: 0,
              monthlyInsightsGenerationUsed: 0,
            } as any
          })
        }

        if (isNewSubscription) {
          let milestoneResult: { totalCount: number; shouldNotify: boolean } | null = null
          try {
            milestoneResult = await incrementSubscriberMilestoneCounter()
          } catch (error) {
            console.error('❌ Subscriber milestone counter failed:', error)
          }
          if (milestoneResult?.shouldNotify) {
            const milestoneRecipient =
              (process.env.OWNER_EMAIL || 'louie@helfi.ai').trim() || 'louie@helfi.ai'
            sendSubscriberMilestoneEmail({
              recipientEmail: milestoneRecipient,
              totalCount: milestoneResult.totalCount,
              latestSubscriberEmail: email,
            }).catch((error) => {
              console.error('❌ Subscriber milestone email failed (non-blocking):', error)
            })
          }
        }

        // Notify owner of subscription purchase (don't await to avoid blocking webhook)
        const currency = sub.currency?.toUpperCase() || 'USD'
        const planName = `Premium (${currency === 'USD' ? '$' : ''}${(amountCents / 100).toFixed(0)}/month)`
        
        notifyOwner({
          event: 'subscription',
          userEmail: email,
          userName: user.name || undefined,
          amount: amountCents,
          currency: currency,
          planName: planName,
        }).catch(error => {
          console.error('❌ Owner notification failed (non-blocking):', error)
        })

        break
      }
      case 'customer.subscription.trial_will_end': {
        // Trial periods removed - this event can be ignored
        break
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription
        const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id
        let email: string | undefined
        if (customerId) {
          try {
            const customer = await stripe.customers.retrieve(customerId)
            if ((customer as Stripe.Customer).email) {
              email = (customer as Stripe.Customer).email as string
            }
          } catch {}
        }
        if (email) {
          // Delete subscription instead of setting to FREE
          // First find the user by email to get userId
          const user = await prisma.user.findUnique({
            where: { email: email.toLowerCase() },
            select: { id: true }
          })
          
          if (user) {
            await prisma.subscription.delete({
              where: { userId: user.id }
            }).catch(() => {
              // Ignore if subscription doesn't exist
            })
          }
        }
        break
      }
      case 'account.updated': {
        const acct = event.data.object as Stripe.Account
        const accountId = acct.id
        await prisma.affiliate
          .update({
            where: { stripeConnectAccountId: accountId },
            data: {
              stripeConnectDetailsSubmitted: !!acct.details_submitted,
              stripeConnectChargesEnabled: !!acct.charges_enabled,
              stripeConnectPayoutsEnabled: !!acct.payouts_enabled,
              stripeConnectOnboardedAt: acct.details_submitted ? new Date() : undefined,
            },
          })
          .catch(() => {})
        break
      }
      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice

        // Only pay commission on the initial subscription payment (first invoice)
        if (invoice.billing_reason !== 'subscription_create') break

        const subscriptionId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id
        if (!subscriptionId) break

        const subscription = await stripe.subscriptions.retrieve(subscriptionId)
        const affCode = (subscription.metadata as any)?.helfi_aff_code || (invoice.metadata as any)?.helfi_aff_code
        const affClickId = (subscription.metadata as any)?.helfi_aff_click || (invoice.metadata as any)?.helfi_aff_click

        if (!affCode || !affClickId) break

        const affiliate = await prisma.affiliate.findUnique({
          where: { code: String(affCode).toLowerCase() },
          select: { id: true, status: true },
        })
        if (!affiliate || affiliate.status !== 'ACTIVE') break

        const click = await prisma.affiliateClick.findUnique({
          where: { id: String(affClickId) },
          select: { id: true, affiliateId: true, createdAt: true },
        })
        if (!click || click.affiliateId !== affiliate.id) break

        const occurredAt = invoice.status_transitions?.paid_at
          ? new Date(invoice.status_transitions.paid_at * 1000)
          : new Date()
        // Enforce 30-day attribution window from click to conversion
        if (occurredAt.getTime() - click.createdAt.getTime() > 30 * 24 * 60 * 60 * 1000) break

        const paymentIntentId = typeof invoice.payment_intent === 'string' ? invoice.payment_intent : invoice.payment_intent?.id
        if (!paymentIntentId) break

        const { charge, balanceTx } = await getBalanceTransactionForPaymentIntent(paymentIntentId)
        if (!charge || !balanceTx) break

        const currency = String(balanceTx.currency || charge.currency || invoice.currency || 'aud').toLowerCase()
        const gross = Number(balanceTx.amount || 0)
        const fee = Number(balanceTx.fee || 0)
        const net = Number(balanceTx.net || 0)
        const chargeId = charge.id

        const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id
        let customerEmail: string | null = null
        if (customerId) {
          try {
            const customer = await stripe.customers.retrieve(customerId)
            customerEmail = (customer as Stripe.Customer)?.email?.toLowerCase() || null
          } catch {}
        }
        const referredUser = customerEmail
          ? await prisma.user.findUnique({ where: { email: customerEmail }, select: { id: true } }).catch(() => null)
          : null

        const conversion = await prisma.affiliateConversion
          .create({
            data: {
              affiliateId: affiliate.id,
              clickId: click.id,
              referredUserId: referredUser?.id || null,
              type: 'SUBSCRIPTION_INITIAL',
              stripeEventId: event.id,
              stripeCheckoutSessionId: null,
              stripePaymentIntentId: paymentIntentId,
              stripeChargeId: chargeId,
              stripeInvoiceId: invoice.id,
              currency,
              amountGrossCents: gross,
              stripeFeeCents: fee,
              amountNetCents: net,
              occurredAt,
            },
            select: { id: true },
          })
          .catch(() => null)

        if (!conversion) break

        const commissionCents = Math.floor(net / 2)
        await prisma.affiliateCommission.create({
          data: {
            affiliateId: affiliate.id,
            conversionId: conversion.id,
            status: 'PENDING',
            currency,
            netRevenueCents: net,
            commissionCents,
            payableAt: addDays(occurredAt, 30),
          },
        })

        break
      }
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        
        // Only handle credit purchases (one-time payments), not subscriptions
        if (session.mode === 'payment' && session.payment_status === 'paid') {
          const customerEmail = session.customer_details?.email || session.customer_email
          if (!customerEmail) break

          const user = await prisma.user.findUnique({
            where: { email: customerEmail.toLowerCase() },
            select: { id: true, email: true, name: true }
          })

          if (user) {
            // Get amount and credit details from line items
            const amountCents = session.amount_total || 0
            const currency = (session.currency || 'usd').toUpperCase()
            
            // Determine credit amount based on price (common credit packages)
            // This is approximate - actual credits are handled in /api/billing/confirm
            let creditAmount = 0
            if (amountCents >= 1000) creditAmount = 1000 // $10 = 1000 credits
            else if (amountCents >= 500) creditAmount = 500 // $5 = 500 credits
            else if (amountCents >= 250) creditAmount = 250 // $2.50 = 250 credits

            // Notify owner of credit purchase (don't await to avoid blocking webhook)
            notifyOwner({
              event: 'credit_purchase',
              userEmail: user.email,
              userName: user.name || undefined,
              amount: amountCents,
              currency: currency,
              creditAmount: creditAmount || undefined,
            }).catch(error => {
              console.error('❌ Owner notification failed (non-blocking):', error)
            })
          }
        }

        // Affiliate attribution for top-ups (one-time payments)
        if (session.mode === 'payment' && session.payment_status === 'paid') {
          const affCode = (session.metadata as any)?.helfi_aff_code
          const affClickId = (session.metadata as any)?.helfi_aff_click
          if (!affCode || !affClickId) break

          const affiliate = await prisma.affiliate.findUnique({
            where: { code: String(affCode).toLowerCase() },
            select: { id: true, status: true },
          })
          if (!affiliate || affiliate.status !== 'ACTIVE') break

          const click = await prisma.affiliateClick.findUnique({
            where: { id: String(affClickId) },
            select: { id: true, affiliateId: true, createdAt: true },
          })
          if (!click || click.affiliateId !== affiliate.id) break

          const occurredAt = session.created ? new Date(session.created * 1000) : new Date()
          if (occurredAt.getTime() - click.createdAt.getTime() > 30 * 24 * 60 * 60 * 1000) break

          const paymentIntentId =
            typeof session.payment_intent === 'string' ? session.payment_intent : (session.payment_intent as any)?.id
          if (!paymentIntentId) break

          const { charge, balanceTx } = await getBalanceTransactionForPaymentIntent(paymentIntentId)
          if (!charge || !balanceTx) break

          const currency = String(balanceTx.currency || charge.currency || session.currency || 'aud').toLowerCase()
          const gross = Number(balanceTx.amount || 0)
          const fee = Number(balanceTx.fee || 0)
          const net = Number(balanceTx.net || 0)
          const chargeId = charge.id

          const customerEmail = (session.customer_details?.email || session.customer_email || '').toLowerCase()
          const referredUser = customerEmail
            ? await prisma.user.findUnique({ where: { email: customerEmail }, select: { id: true } }).catch(() => null)
            : null

          const conversion = await prisma.affiliateConversion
            .create({
              data: {
                affiliateId: affiliate.id,
                clickId: click.id,
                referredUserId: referredUser?.id || null,
                type: 'TOPUP',
                stripeEventId: event.id,
                stripeCheckoutSessionId: session.id,
                stripePaymentIntentId: paymentIntentId,
                stripeChargeId: chargeId,
                stripeInvoiceId: null,
                currency,
                amountGrossCents: gross,
                stripeFeeCents: fee,
                amountNetCents: net,
                occurredAt,
              },
              select: { id: true },
            })
            .catch(() => null)

          if (!conversion) break

          const commissionCents = Math.floor(net / 2)
          await prisma.affiliateCommission.create({
            data: {
              affiliateId: affiliate.id,
              conversionId: conversion.id,
              status: 'PENDING',
              currency,
              netRevenueCents: net,
              commissionCents,
              payableAt: addDays(occurredAt, 30),
            },
          })
        }
        break
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id
        const subscriptionId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id
        let email: string | undefined
        if (customerId) {
          try {
            const customer = await stripe.customers.retrieve(customerId)
            if ((customer as Stripe.Customer).email) {
              email = (customer as Stripe.Customer).email as string
            }
          } catch {}
        }
        if (!email) break

        const user = await prisma.user.findUnique({
          where: { email: email.toLowerCase() },
          include: { subscription: true },
        })
        if (!user?.subscription) break

        await prisma.subscription.update({
          where: { userId: user.id },
          data: {
            stripeSubscriptionId: subscriptionId || user.subscription.stripeSubscriptionId,
            endDate: new Date(),
          },
        })
        console.log(`[Webhook] Payment failed for ${email}. Access paused.`)
        break
      }
      case 'charge.refunded':
      case 'charge.dispute.created': {
        const charge = event.data.object as Stripe.Charge
        const conversion = await prisma.affiliateConversion.findFirst({
          where: { stripeChargeId: charge.id },
          select: { id: true, commission: { select: { id: true, status: true, payableAt: true } } },
        })
        if (conversion?.commission && conversion.commission.status === 'PENDING') {
          await prisma.affiliateCommission.update({
            where: { id: conversion.commission.id },
            data: { status: 'VOIDED' },
          })
        }

        const now = new Date()

        // Revoke subscription access for refunded/charged-back invoices.
        const invoiceId = typeof charge.invoice === 'string' ? charge.invoice : charge.invoice?.id
        if (invoiceId) {
          try {
            const invoice = await stripe.invoices.retrieve(invoiceId)
            const subscriptionId =
              typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id
            if (subscriptionId) {
              const updated = await prisma.subscription.updateMany({
                where: { stripeSubscriptionId: subscriptionId },
                data: { endDate: now },
              })
              if (!updated.count) {
                const customerId = typeof charge.customer === 'string' ? charge.customer : charge.customer?.id
                let email: string | undefined
                if (customerId) {
                  try {
                    const customer = await stripe.customers.retrieve(customerId)
                    if ((customer as Stripe.Customer).email) {
                      email = (customer as Stripe.Customer).email as string
                    }
                  } catch {}
                }
                if (email) {
                  const user = await prisma.user.findUnique({
                    where: { email: email.toLowerCase() },
                    select: { id: true },
                  })
                  if (user) {
                    await prisma.subscription.updateMany({
                      where: { userId: user.id },
                      data: { endDate: now },
                    })
                  }
                }
              }
            }
          } catch {}
        }

        // Revoke top-up credits linked to the refunded/charged-back payment.
        const paymentIntentId =
          typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id
        if (paymentIntentId) {
          const session = await findCheckoutSessionForPaymentIntent(paymentIntentId)
          if (session?.id) {
            const source = `stripe:${session.id}`
            const topUps = await prisma.creditTopUp.findMany({ where: { source } })
            if (topUps.length) {
              for (const topUp of topUps) {
                const nextUsed = Math.max(topUp.usedCents, topUp.amountCents)
                await prisma.creditTopUp.update({
                  where: { id: topUp.id },
                  data: { usedCents: nextUsed },
                })
              }
            }
          }
        }
        break
      }

      default:
        break
    }

    return NextResponse.json({ received: true })
  } catch (e) {
    reportCriticalError({
      source: 'billing.webhook',
      error: e,
      details: {
        eventType: event?.type,
        eventId: event?.id,
      },
    })
    console.error('Stripe webhook error', e)
    return NextResponse.json({ error: 'Webhook handler failure' }, { status: 500 })
  }
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
