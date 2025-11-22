import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { prisma } from '@/lib/prisma'
import { Resend } from 'resend'
import { notifyOwner } from '@/lib/owner-notifications'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2024-06-20' })
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET || ''

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
        
        // Set plan to PREMIUM and store Stripe subscription ID
        const user = await prisma.user.update({
          where: { email: email.toLowerCase() },
          data: {
            subscription: { upsert: {
              create: { 
                plan: 'PREMIUM',
                monthlyPriceCents: amountCents,
                stripeSubscriptionId: sub.id
              },
              update: { 
                plan: 'PREMIUM',
                monthlyPriceCents: amountCents,
                stripeSubscriptionId: sub.id
              }
            }},
          },
          include: { subscription: true }
        })

        // Notify owner of subscription purchase (don't await to avoid blocking webhook)
        const amountCents = sub.items.data[0]?.price?.unit_amount || 0
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
        break
      }

      default:
        break
    }

    return NextResponse.json({ received: true })
  } catch (e) {
    console.error('Stripe webhook error', e)
    return NextResponse.json({ error: 'Webhook handler failure' }, { status: 500 })
  }
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

