import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { prisma } from '@/lib/prisma'
import { Resend } from 'resend'

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

        // Set plan and trial flags
        const isTrial = !!sub.trial_end && (sub.trial_end * 1000) > Date.now()
        await prisma.user.update({
          where: { email: email.toLowerCase() },
          data: {
            subscription: { upsert: {
              create: { plan: 'PREMIUM' },
              update: { plan: 'PREMIUM' }
            }},
            trialActive: isTrial,
          }
        })
        break
      }
      case 'customer.subscription.trial_will_end': {
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
        if (email && resend) {
          await resend.emails.send({
            from: 'Helfi Team <support@helfi.ai>',
            to: email,
            subject: 'Your Helfi trial ends in 2 days',
            html: `<p>Your 7‑day trial ends in 2 days. To keep AI features, your plan will start automatically unless you cancel before then.</p><p><a href="https://helfi.ai/billing">Manage subscription</a></p>`
          })
        }
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
          await prisma.user.update({
            where: { email: email.toLowerCase() },
            data: {
              subscription: { upsert: {
                create: { plan: 'FREE' },
                update: { plan: 'FREE' }
              }},
              trialActive: false,
            }
          })
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

