import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { extractAdminFromHeaders } from '@/lib/admin-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const REQUIRED_EVENTS = [
  'checkout.session.completed',
  'invoice.paid',
  'charge.refunded',
  'charge.dispute.created',
  'account.updated',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
] as const

function getBaseUrl(): string | null {
  const base =
    process.env.PUBLIC_BASE_URL ||
    process.env.NEXTAUTH_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '') ||
    process.env.NEXT_PUBLIC_APP_URL ||
    ''

  const normalized = base.trim().replace(/\/+$/, '')
  if (!normalized) return null
  if (!/^https?:\/\//i.test(normalized)) return `https://${normalized}`
  return normalized
}

function unionEvents(
  existing: Stripe.WebhookEndpointUpdateParams.EnabledEvent[] | string[],
  required: readonly string[]
): Stripe.WebhookEndpointUpdateParams.EnabledEvent[] {
  const set = new Set<string>(existing || [])
  for (const e of required) set.add(e)
  return Array.from(set).sort() as Stripe.WebhookEndpointUpdateParams.EnabledEvent[]
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const admin = extractAdminFromHeaders(authHeader)
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey) return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 })

  const stripe = new Stripe(secretKey, { apiVersion: '2024-06-20' })

  const body = await request.json().catch(() => ({}))
  const baseUrl = getBaseUrl()
  const defaultWebhookUrl = baseUrl ? `${baseUrl}/api/billing/webhook` : null
  const webhookUrl = (String(body?.webhookUrl || '').trim() || defaultWebhookUrl || '').trim()

  if (!webhookUrl) {
    return NextResponse.json(
      { error: 'Missing webhookUrl and could not infer base URL (set NEXTAUTH_URL or PUBLIC_BASE_URL)' },
      { status: 400 }
    )
  }

  const endpoints = await stripe.webhookEndpoints.list({ limit: 100 })
  const matches = endpoints.data.filter(e => e.url === webhookUrl)

  if (!matches.length) {
    return NextResponse.json(
      {
        ok: false,
        error: 'No Stripe webhook endpoint found for this URL',
        webhookUrl,
        requiredEvents: REQUIRED_EVENTS,
        note: 'Create the webhook endpoint in Stripe for this URL, then re-run.',
      },
      { status: 404 }
    )
  }

  const updated: Array<{ id: string; url: string; beforeCount: number; afterCount: number }> = []

  for (const endpoint of matches) {
    const before = endpoint.enabled_events || []
    const after = unionEvents(before, REQUIRED_EVENTS)
    if (after.length === before.length) {
      updated.push({ id: endpoint.id, url: endpoint.url, beforeCount: before.length, afterCount: after.length })
      continue
    }
    const res = await stripe.webhookEndpoints.update(endpoint.id, { enabled_events: after })
    updated.push({
      id: res.id,
      url: res.url,
      beforeCount: before.length,
      afterCount: res.enabled_events?.length || after.length,
    })
  }

  return NextResponse.json({ ok: true, webhookUrl, requiredEvents: REQUIRED_EVENTS, updated })
}
