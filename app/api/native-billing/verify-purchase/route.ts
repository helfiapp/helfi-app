import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { createSign } from 'crypto'

import { authOptions } from '@/lib/auth'
import { getUserIdFromNativeAuth } from '@/lib/native-auth'
import { prisma } from '@/lib/prisma'
import { getNativeBillingProductByCode, type NativeBillingProductCode } from '@/lib/native-billing/catalog'
import { ensureSubscriptionStoreColumns } from '@/lib/native-billing/subscription-store'

type BillingUser = {
  id: string
  email: string
}

type NativeAffiliateAttribution = {
  code?: string
  clickId?: string
  visitorId?: string
  clickedAtMs?: number
}

type AppleReceiptEntry = {
  product_id?: string
  transaction_id?: string
  original_transaction_id?: string
  purchase_date_ms?: string
  expires_date_ms?: string
  cancellation_date_ms?: string
  quantity?: string | number
}

type AppleTransactionInfo = {
  bundleId?: string
  productId?: string
  transactionId?: string
  originalTransactionId?: string
  purchaseDate?: number | string
  expiresDate?: number | string
  revocationDate?: number | string
  quantity?: number
}

type AppleApiCredentials = {
  issuerId: string
  keyId: string
  privateKey: string
  bundleId: string
}

type GoogleProductPurchase = {
  orderId?: string
  purchaseState?: number
  purchaseTimeMillis?: string
  quantity?: number
}

type GoogleSubscriptionPurchase = {
  orderId?: string
  expiryTimeMillis?: string
  startTimeMillis?: string
  paymentState?: number
  linkedPurchaseToken?: string
  cancelReason?: number
}

class NativePurchaseError extends Error {
  constructor(message: string, public status: number) { super(message) }
}

function verifiedCreditQuantity(value: unknown, creditsPerPack: number, pricePerPack: number): number {
  // Older store replies omit quantity; only the verified store response may
  // increase a pack count. Legacy Apple receipts encode this as a string.
  const quantity = value === undefined ? 1 : typeof value === 'number' ? value
    : typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN
  if (!Number.isSafeInteger(quantity) || quantity < 1 ||
      !Number.isSafeInteger(quantity * creditsPerPack) || quantity * creditsPerPack > 2147483647 ||
      !Number.isSafeInteger(quantity * pricePerPack)) {
    throw new NativePurchaseError('The store returned an invalid purchase quantity.', 400)
  }
  return quantity
}

async function claimNativePurchase(tx: any, platform: 'ios' | 'android', purchaseId: string, userId: string): Promise<boolean> {
  const claim = await tx.nativePurchaseClaim.findUnique({ where: { platform_purchaseId: { platform, purchaseId } } })
  if (claim && claim.userId !== userId) {
    throw new NativePurchaseError('This purchase is already linked to another Helfi account.', 409)
  }
  if (claim) return false
  await tx.nativePurchaseClaim.create({ data: { platform, purchaseId, userId } })
  return true
}

async function lockNativePurchaseIds(tx: any, platform: 'ios' | 'android', purchaseIds: string[]): Promise<void> {
  await tx.$executeRaw`SET LOCAL lock_timeout = '2000ms'`
  for (const id of [...new Set(purchaseIds)].sort()) {
    if (!id) throw new NativePurchaseError('The store did not identify this purchase.', 400)
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`native-purchase:${platform}:${id}`}))`
  }
}

// All native grants use the verified store identity as the lock/ownership key.
// The existing records remain intact; retries never create another credit row.
async function grantNativeTopUpOnce(data: {
  userId: string; amountCents: number; purchasedAt: Date; expiresAt: Date; source: string
}, platform: 'ios' | 'android', purchaseId: string, sourceAliases: string[] = []): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    await lockNativePurchaseIds(tx, platform, [purchaseId])
    const existing = await tx.creditTopUp.findMany({ where: { source: { in: [...new Set([data.source, ...sourceAliases])] } }, select: { userId: true } })
    if (existing.some(row => row.userId !== data.userId)) {
      throw new NativePurchaseError('This purchase is already linked to another Helfi account.', 409)
    }
    const newClaim = await claimNativePurchase(tx, platform, purchaseId, data.userId)
    if (existing.length || !newClaim) return false
    await tx.creditTopUp.create({ data: { ...data, usedCents: 0 } })
    return true
  }, { maxWait: 1000, timeout: 10000 })
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setUTCDate(d.getUTCDate() + days)
  return d
}

function normalizeStoreProductId(value: unknown): string {
  return String(value || '')
    .replace(/\\r/g, '')
    .replace(/\\n/g, '')
    .replace(/\\t/g, '')
    .replace(/[\r\n\t]/g, '')
    .trim()
}

async function createNativeAffiliateCommission(opts: {
  user: BillingUser
  attribution: NativeAffiliateAttribution | null
  type: 'SUBSCRIPTION_INITIAL' | 'TOPUP'
  platform: 'ios' | 'android'
  transactionId: string
  amountCents: number
  occurredAt: Date
}) {
  const code = String(opts.attribution?.code || '').trim().toLowerCase()
  const clickId = String(opts.attribution?.clickId || '').trim()
  const clickedAtMs = Number(opts.attribution?.clickedAtMs || 0)
  if (!code || !clickId || !Number.isFinite(clickedAtMs) || clickedAtMs <= 0) return
  if (!opts.transactionId || opts.amountCents <= 0) return

  const affiliate = await prisma.affiliate.findUnique({
    where: { code },
    select: { id: true, status: true, userId: true },
  })
  if (!affiliate || affiliate.status !== 'ACTIVE') return
  if (affiliate.userId === opts.user.id) return

  const click = await prisma.affiliateClick.findUnique({
    where: { id: clickId },
    select: { id: true, affiliateId: true, createdAt: true },
  })
  if (!click || click.affiliateId !== affiliate.id) return

  const ageMs = opts.occurredAt.getTime() - click.createdAt.getTime()
  if (ageMs < 0 || ageMs > 30 * 24 * 60 * 60 * 1000) return

  const conversion = await prisma.affiliateConversion
    .create({
      data: {
        affiliateId: affiliate.id,
        clickId: click.id,
        referredUserId: opts.user.id,
        type: opts.type,
        stripeEventId: `native:${opts.platform}:${opts.transactionId}:${opts.type}`,
        stripeCheckoutSessionId: null,
        stripePaymentIntentId: null,
        stripeChargeId: null,
        stripeInvoiceId: null,
        currency: 'usd',
        amountGrossCents: opts.amountCents,
        stripeFeeCents: 0,
        amountNetCents: opts.amountCents,
        occurredAt: opts.occurredAt,
      },
      select: { id: true },
    })
    .catch(() => null)

  if (!conversion) return

  await prisma.affiliateCommission.create({
    data: {
      affiliateId: affiliate.id,
      conversionId: conversion.id,
      status: 'PENDING',
      currency: 'usd',
      netRevenueCents: opts.amountCents,
      commissionCents: Math.floor(opts.amountCents / 2),
      payableAt: addDays(opts.occurredAt, 30),
    },
  }).catch(() => {})
}

async function upsertSubscriptionPreservingStartDate(opts: {
  userId: string
  monthlyPriceCents: number
  startDateHint?: Date | null
  endDate?: Date | null
  source: 'apple_iap' | 'google_iap'
  storeProductId: string
  storeTransactionId?: string | null
  storeOriginalTransactionId?: string | null
  storeOwnershipIds?: string[]
}) {
  await ensureSubscriptionStoreColumns()

  const canonicalId = opts.storeOriginalTransactionId || opts.storeTransactionId
  if (!canonicalId) throw new NativePurchaseError('The store did not identify this subscription.', 400)
  // Google renewal orders append ..N; the token is stable for the purchase.
  // Recognise old stored order IDs as well as the new canonical token, without
  // rewriting another account's historic subscription records.
  const googleOrderBase = opts.source === 'google_iap' && opts.storeTransactionId?.startsWith('GPA.')
    ? opts.storeTransactionId.split('..')[0] : null
  const identities = [...new Set([canonicalId, opts.storeTransactionId, googleOrderBase].filter(Boolean))] as string[]
  const platform = opts.source === 'apple_iap' ? 'ios' : 'android'
  const ownershipIds = [...new Set([canonicalId, ...(opts.storeOwnershipIds || [])].filter(Boolean))]
  await prisma.$transaction(async (tx) => {
    await lockNativePurchaseIds(tx, platform, ownershipIds)
    const owners = await tx.subscription.findMany({ where: {
      source: opts.source,
      OR: [
        { storeOriginalTransactionId: { in: identities } },
        { storeTransactionId: { in: identities } },
        ...(googleOrderBase ? [
          { storeOriginalTransactionId: { startsWith: googleOrderBase + '..' } },
          { storeTransactionId: { startsWith: googleOrderBase + '..' } },
        ] : []),
      ],
    }, select: { userId: true } })
    if (owners.some(row => row.userId !== opts.userId)) {
      throw new NativePurchaseError('This subscription is already linked to another Helfi account.', 409)
    }
    for (const purchaseId of ownershipIds) await claimNativePurchase(tx, platform, purchaseId, opts.userId)
    const existing = await tx.subscription.findUnique({
      where: { userId: opts.userId },
      select: { startDate: true },
    })

    const startDate = existing?.startDate || opts.startDateHint || new Date()

    await tx.subscription.upsert({
      where: { userId: opts.userId },
      update: {
        plan: 'PREMIUM',
        monthlyPriceCents: opts.monthlyPriceCents,
        startDate,
        endDate: opts.endDate || null,
        source: opts.source,
        storeProductId: opts.storeProductId || null,
        storeTransactionId: opts.storeTransactionId || null,
        storeOriginalTransactionId: opts.storeOriginalTransactionId || null,
      },
      create: {
        userId: opts.userId,
        plan: 'PREMIUM',
        monthlyPriceCents: opts.monthlyPriceCents,
        startDate,
        endDate: opts.endDate || null,
        source: opts.source,
        storeProductId: opts.storeProductId || null,
        storeTransactionId: opts.storeTransactionId || null,
        storeOriginalTransactionId: opts.storeOriginalTransactionId || null,
      },
    })
  }, { maxWait: 1000, timeout: 10000 })
}

async function getBillingUser(request: NextRequest): Promise<BillingUser | null> {
  const session = await getServerSession(authOptions)
  const sessionEmail = String(session?.user?.email || '').trim().toLowerCase()
  if (sessionEmail) {
    const user = await prisma.user.findUnique({
      where: { email: sessionEmail },
      select: { id: true, email: true },
    })
    if (user?.id && user?.email) return user
  }

  const nativeUserId = await getUserIdFromNativeAuth(request)
  if (!nativeUserId) return null

  const user = await prisma.user.findUnique({
    where: { id: nativeUserId },
    select: { id: true, email: true },
  })
  if (!user?.id || !user?.email) return null
  return user
}

async function verifyAppleReceipt(receiptData: string) {
  const sharedSecret = String(process.env.APPLE_IAP_SHARED_SECRET || '').trim()

  const payload: Record<string, any> = {
    'receipt-data': receiptData,
    'exclude-old-transactions': true,
  }
  if (sharedSecret) {
    payload.password = sharedSecret
  }

  const callApple = async (url: string) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
    return res.json().catch(() => ({}))
  }

  let data: any = await callApple('https://buy.itunes.apple.com/verifyReceipt')
  if (Number(data?.status) === 21007) {
    data = await callApple('https://sandbox.itunes.apple.com/verifyReceipt')
  }

  if (Number(data?.status) !== 0) {
    const status = Number(data?.status)
    if (status === 21004) {
      return {
        ok: false as const,
        error:
          'Apple receipt verification failed (status 21004). Add APPLE_IAP_SHARED_SECRET or configure APPLE_IAP_ISSUER_ID / APPLE_IAP_KEY_ID / APPLE_IAP_PRIVATE_KEY.',
      }
    }
    return { ok: false as const, error: `Apple receipt verification failed (status ${String(data?.status ?? 'unknown')}).` }
  }

  const expectedBundle = String(process.env.APPLE_IAP_BUNDLE_ID || '').trim()
  if (!expectedBundle || String(data?.receipt?.bundle_id || '').trim() !== expectedBundle) {
    return { ok: false as const, error: 'Apple receipt does not belong to Helfi.' }
  }

  const latest = Array.isArray(data?.latest_receipt_info) ? (data.latest_receipt_info as AppleReceiptEntry[]) : []
  const fallback = Array.isArray(data?.receipt?.in_app) ? (data.receipt.in_app as AppleReceiptEntry[]) : []
  // latest_receipt_info covers subscription history; receipt.in_app can hold
  // the consumable a subscribed user just bought. Keep both verified lists.
  const items = [...latest, ...fallback]

  return { ok: true as const, items }
}

async function verifyAppleTransactionById(transactionId: string) {
  const creds = getAppleApiCredentials()
  if (!creds) {
    return {
      ok: false as const,
      error:
        'Apple App Store API credentials are missing. Configure APPLE_IAP_ISSUER_ID, APPLE_IAP_KEY_ID, and APPLE_IAP_PRIVATE_KEY.',
    }
  }

  const token = createAppleAppStoreApiToken(creds)
  const encodedTransactionId = encodeURIComponent(transactionId)
  const urls = [
    `https://api.storekit.itunes.apple.com/inApps/v1/transactions/${encodedTransactionId}`,
    `https://api.storekit.apple.com/inApps/v1/transactions/${encodedTransactionId}`,
    `https://api.storekit-sandbox.itunes.apple.com/inApps/v1/transactions/${encodedTransactionId}`,
    `https://api.storekit-sandbox.apple.com/inApps/v1/transactions/${encodedTransactionId}`,
  ]

  let lastError = 'Apple transaction lookup failed.'
  for (const url of urls) {
    let res: Response
    let data: any
    try {
      res = await fetch(url, {
        headers: {
          authorization: `Bearer ${token}`,
        },
      })
      data = await res.json().catch(() => ({}))
    } catch (error: any) {
      lastError = error?.message || 'Apple transaction lookup request failed.'
      continue
    }
    if (!res.ok) {
      const detail = String(data?.errorMessage || data?.errorCode || '').trim()
      if (detail) lastError = detail
      continue
    }
    const signedInfo = String(data?.signedTransactionInfo || '').trim()
    if (!signedInfo) {
      lastError = 'Apple transaction response did not include signedTransactionInfo.'
      continue
    }

    try {
      const info = parseAppleSignedTransactionInfo(signedInfo)
      if (String(info.bundleId || '').trim() !== creds.bundleId) {
        lastError = 'Apple transaction does not belong to Helfi.'
        continue
      }
      return { ok: true as const, info }
    } catch (error: any) {
      lastError = String(error?.message || 'Apple signed transaction payload could not be parsed.')
    }
  }

  return { ok: false as const, error: lastError }
}

function base64Url(input: string | Buffer): string {
  const raw = Buffer.isBuffer(input) ? input : Buffer.from(input)
  return raw
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

function normalizeApplePrivateKey(rawValue: string): string {
  return rawValue.replace(/\\n/g, '\n').trim()
}

function getAppleApiCredentials(): AppleApiCredentials | null {
  const issuerId = String(process.env.APPLE_IAP_ISSUER_ID || '').trim()
  const keyId = String(process.env.APPLE_IAP_KEY_ID || '').trim()
  const privateKeyRaw = String(process.env.APPLE_IAP_PRIVATE_KEY || '').trim()
  const privateKey = normalizeApplePrivateKey(privateKeyRaw)
  const bundleId = String(process.env.APPLE_IAP_BUNDLE_ID || '').trim()
  if (!issuerId || !keyId || !privateKey || !bundleId) return null
  return { issuerId, keyId, privateKey, bundleId }
}

function createAppleAppStoreApiToken(credentials: AppleApiCredentials): string {
  const now = Math.floor(Date.now() / 1000)
  const header = {
    alg: 'ES256',
    kid: credentials.keyId,
    typ: 'JWT',
  }
  const payload = {
    iss: credentials.issuerId,
    iat: now,
    exp: now + 60 * 5,
    aud: 'appstoreconnect-v1',
    bid: credentials.bundleId,
  }

  const unsignedToken = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(payload))}`
  const signer = createSign('SHA256')
  signer.update(unsignedToken)
  signer.end()
  const signature = signer.sign({ key: credentials.privateKey, dsaEncoding: 'ieee-p1363' })
  return `${unsignedToken}.${base64Url(signature)}`
}

function decodeBase64UrlJSON(value: string): any {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  const decoded = Buffer.from(padded, 'base64').toString('utf8')
  return JSON.parse(decoded)
}

function parseAppleSignedTransactionInfo(signedTransactionInfo: string): AppleTransactionInfo {
  const parts = String(signedTransactionInfo || '').split('.')
  if (parts.length < 2) throw new Error('Apple signed transaction payload is invalid.')
  return decodeBase64UrlJSON(parts[1]) as AppleTransactionInfo
}

async function getGoogleAccessToken(): Promise<string> {
  const raw = String(process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON || '').trim()
  if (!raw) {
    throw new Error('Google Play service account JSON is not configured.')
  }

  let serviceAccount: any
  try {
    serviceAccount = JSON.parse(raw)
  } catch {
    throw new Error('Google Play service account JSON is invalid.')
  }

  const clientEmail = String(serviceAccount?.client_email || '').trim()
  const privateKey = String(serviceAccount?.private_key || '').trim()
  if (!clientEmail || !privateKey) {
    throw new Error('Google Play service account JSON is missing client_email/private_key.')
  }

  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const payload = {
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }

  const unsignedToken = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(payload))}`
  const signer = createSign('RSA-SHA256')
  signer.update(unsignedToken)
  signer.end()
  const signature = signer.sign(privateKey)
  const assertion = `${unsignedToken}.${base64Url(signature)}`

  const body = new URLSearchParams()
  body.set('grant_type', 'urn:ietf:params:oauth:grant-type:jwt-bearer')
  body.set('assertion', assertion)

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  const tokenData: any = await tokenRes.json().catch(() => ({}))
  if (!tokenRes.ok || !tokenData?.access_token) {
    throw new Error(tokenData?.error_description || tokenData?.error || 'Could not get Google access token.')
  }

  return String(tokenData.access_token)
}

async function verifyGoogleProductPurchase(productId: string, purchaseToken: string): Promise<GoogleProductPurchase> {
  const packageName = String(process.env.GOOGLE_PLAY_PACKAGE_NAME || '').trim()
  if (!packageName) {
    throw new Error('Google Play package name is not configured.')
  }
  const accessToken = await getGoogleAccessToken()
  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(
    packageName,
  )}/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}`

  const res = await fetch(url, {
    headers: { authorization: `Bearer ${accessToken}` },
  })
  const data: any = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data?.error?.message || 'Google product purchase verification failed.')
  }
  return data as GoogleProductPurchase
}

async function verifyGoogleSubscriptionPurchase(
  subscriptionProductId: string,
  purchaseToken: string,
): Promise<GoogleSubscriptionPurchase> {
  const packageName = String(process.env.GOOGLE_PLAY_PACKAGE_NAME || '').trim()
  if (!packageName) {
    throw new Error('Google Play package name is not configured.')
  }
  const accessToken = await getGoogleAccessToken()
  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(
    packageName,
  )}/purchases/subscriptions/${encodeURIComponent(subscriptionProductId)}/tokens/${encodeURIComponent(
    purchaseToken,
  )}`

  const res = await fetch(url, {
    headers: { authorization: `Bearer ${accessToken}` },
  })
  const data: any = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data?.error?.message || 'Google subscription verification failed.')
  }
  return data as GoogleSubscriptionPurchase
}

export async function POST(request: NextRequest) {
  try {
    const user = await getBillingUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const platform = body?.platform === 'android' ? 'android' : body?.platform === 'ios' ? 'ios' : null
    const code = String(body?.code || '') as NativeBillingProductCode
    const receiptData = String(body?.receiptData || '')
    const transactionId = String(body?.transactionId || '')
    const purchaseToken = String(body?.purchaseToken || '')
    const affiliateAttribution = (body?.affiliateAttribution || null) as NativeAffiliateAttribution | null

    if (!platform) {
      return NextResponse.json({ error: 'Invalid platform. Use ios or android.' }, { status: 400 })
    }
    if (!code) {
      return NextResponse.json({ error: 'Missing product code.' }, { status: 400 })
    }

    const product = getNativeBillingProductByCode(code)
    if (!product) {
      return NextResponse.json({ error: `Unknown product code: ${code}` }, { status: 400 })
    }

    if (platform === 'android') {
      if (!purchaseToken) {
        return NextResponse.json({ error: 'Missing Google purchaseToken.' }, { status: 400 })
      }

      const expectedProductId = product.androidProductId
      if (!expectedProductId) {
        return NextResponse.json({ error: `Android product ID is not configured for ${code}.` }, { status: 400 })
      }

      if (product.kind === 'topup') {
        const purchase = await verifyGoogleProductPurchase(expectedProductId, purchaseToken)
        if (purchase.purchaseState !== 0) {
          return NextResponse.json({ error: 'Google purchase is not completed yet.' }, { status: 400 })
        }
        const quantity = verifiedCreditQuantity(purchase.quantity, product.credits, product.priceCents)
        const creditsAdded = product.credits * quantity

        const source = `google_iap:${String(purchase.orderId || purchaseToken)}`
        const purchasedAtMs = Number(purchase.purchaseTimeMillis || Date.now())
        const purchasedAt = new Date(Number.isFinite(purchasedAtMs) ? purchasedAtMs : Date.now())
        const expiresAt = new Date(purchasedAt)
        expiresAt.setFullYear(expiresAt.getFullYear() + 1)

        const added = await grantNativeTopUpOnce({
          userId: user.id,
          amountCents: creditsAdded,
          purchasedAt,
          expiresAt,
          source,
        }, 'android', purchaseToken, [`google_iap:${purchaseToken}`])
        if (!added) return NextResponse.json({ ok: true, message: 'Purchase already processed.' })

        await createNativeAffiliateCommission({
          user,
          attribution: affiliateAttribution,
          type: 'TOPUP',
          platform,
          transactionId: String(purchase.orderId || purchaseToken),
          amountCents: product.priceCents * quantity,
          occurredAt: purchasedAt,
        })

        return NextResponse.json({
          ok: true,
          type: 'topup',
          message: 'Credits added successfully.',
          creditsAdded,
        })
      }

      const sub = await verifyGoogleSubscriptionPurchase(expectedProductId, purchaseToken)
      const endDateMs = Number(sub.expiryTimeMillis || 0)
      // A missing expiry must never turn a store subscription into permanent
      // premium. User cancellation keeps access until the paid expiry; pending
      // payments, replacement and developer/system revocation do not.
      if (!Number.isFinite(endDateMs) || endDateMs <= Date.now() || endDateMs > 8640000000000000 ||
          sub.paymentState === 0 || sub.paymentState === 3 ||
          (sub.cancelReason != null && sub.cancelReason !== 0)) {
        return NextResponse.json({ error: 'Google subscription is not currently active.' }, { status: 400 })
      }
      const endDate = new Date(endDateMs)
      const startDateMs = Number(sub.startTimeMillis || 0)
      const startDateHint = startDateMs > 0 ? new Date(startDateMs) : null

      await upsertSubscriptionPreservingStartDate({
        userId: user.id,
        monthlyPriceCents: product.priceCents,
        startDateHint,
        endDate,
        source: 'google_iap',
        storeProductId: expectedProductId,
        storeTransactionId: String(sub.orderId || purchaseToken),
        storeOriginalTransactionId: purchaseToken,
        storeOwnershipIds: sub.linkedPurchaseToken ? [purchaseToken, sub.linkedPurchaseToken] : [purchaseToken],
      })

      await createNativeAffiliateCommission({
        user,
        attribution: affiliateAttribution,
        type: 'SUBSCRIPTION_INITIAL',
        platform,
        transactionId: String(sub.orderId || purchaseToken),
        amountCents: product.priceCents,
        occurredAt: startDateHint || new Date(),
      })

      return NextResponse.json({
        ok: true,
        type: 'subscription',
        message: 'Subscription updated successfully.',
        monthlyPriceCents: product.priceCents,
        endDate: endDate ? endDate.toISOString() : null,
      })
    }

    const expectedProductId = normalizeStoreProductId(product.iosProductId)
    if (!expectedProductId) {
      return NextResponse.json({ error: `iOS product ID is not configured for ${code}.` }, { status: 400 })
    }

    let finalTransactionId = ''
    let finalOriginalTransactionId = ''
    let purchaseDateMs = 0
    let expiresDateMs = 0
    let verifiedQuantity: unknown

    // Preferred path: App Store transaction lookup by transaction ID (works without shared secret).
    if (transactionId) {
      const lookup = await verifyAppleTransactionById(transactionId)
      if (lookup.ok) {
        const info = lookup.info
        if (info.revocationDate != null) {
          return NextResponse.json({ error: 'Apple revoked this purchase.' }, { status: 400 })
        }
        const actualProductId = normalizeStoreProductId(info?.productId)
        if (actualProductId !== expectedProductId) {
          return NextResponse.json(
            { error: `Apple transaction product mismatch. Expected ${expectedProductId}, got ${actualProductId || '(empty)'}.` },
            { status: 400 },
          )
        }
        finalTransactionId = String(info?.transactionId || '').trim()
        if (!finalTransactionId || finalTransactionId !== transactionId) {
          return NextResponse.json({ error: 'Apple did not verify the requested transaction.' }, { status: 400 })
        }
        finalOriginalTransactionId = String(info?.originalTransactionId || finalTransactionId || '').trim()
        purchaseDateMs = Number(info?.purchaseDate || 0)
        expiresDateMs = Number(info?.expiresDate || 0)
        verifiedQuantity = info.quantity
      } else if (!receiptData) {
        return NextResponse.json(
          {
            error: lookup.error || 'Apple transaction lookup failed.',
            message: 'Provide receiptData or configure Apple App Store API credentials.',
          },
          { status: 400 },
        )
      }
    }

    // Fallback path: verify entire receipt (for flows where transaction lookup is unavailable).
    if (!finalTransactionId) {
      if (!receiptData) {
        return NextResponse.json({ error: 'Missing Apple receiptData and transactionId.' }, { status: 400 })
      }

      const apple = await verifyAppleReceipt(receiptData)
      if (!apple.ok) {
        return NextResponse.json({ error: apple.error }, { status: 400 })
      }

      const matching = apple.items
        .filter((item) => normalizeStoreProductId(item?.product_id) === expectedProductId)
        .sort((a, b) => Number(b?.purchase_date_ms || 0) - Number(a?.purchase_date_ms || 0))
      // A supplied transaction ID must identify a transaction Apple actually
      // verified, never become a caller-selected key for granting credits.
      const purchase = transactionId
        ? matching.find(item => String(item.transaction_id || '').trim() === transactionId)
        : matching[0]

      if (!purchase) {
        return NextResponse.json(
          {
            error: `Apple receipt did not include expected product: ${expectedProductId}`,
          },
          { status: 400 },
        )
      }
      if (purchase.cancellation_date_ms != null && String(purchase.cancellation_date_ms).trim()) {
        return NextResponse.json({ error: 'Apple revoked this purchase.' }, { status: 400 })
      }

      finalTransactionId = String(purchase.transaction_id || '').trim()
      finalOriginalTransactionId = String(purchase.original_transaction_id || finalTransactionId || '').trim()
      purchaseDateMs = Number(purchase.purchase_date_ms || 0)
      expiresDateMs = Number(purchase.expires_date_ms || 0)
      verifiedQuantity = purchase.quantity
    }

    if (!finalTransactionId) {
      return NextResponse.json({ error: 'Could not read transaction ID from Apple receipt.' }, { status: 400 })
    }

    if (product.kind === 'topup') {
      const quantity = verifiedCreditQuantity(verifiedQuantity, product.credits, product.priceCents)
      const creditsAdded = product.credits * quantity
      const source = `apple_iap:${finalTransactionId}`
      const purchasedAtMs = purchaseDateMs > 0 ? purchaseDateMs : Date.now()
      const purchasedAt = new Date(Number.isFinite(purchasedAtMs) ? purchasedAtMs : Date.now())
      const expiresAt = new Date(purchasedAt)
      expiresAt.setFullYear(expiresAt.getFullYear() + 1)

      const added = await grantNativeTopUpOnce({
        userId: user.id,
        amountCents: creditsAdded,
        purchasedAt,
        expiresAt,
        source,
      }, 'ios', finalTransactionId)
      if (!added) return NextResponse.json({ ok: true, message: 'Purchase already processed.' })

      await createNativeAffiliateCommission({
        user,
        attribution: affiliateAttribution,
        type: 'TOPUP',
        platform,
        transactionId: finalTransactionId,
        amountCents: product.priceCents * quantity,
        occurredAt: purchasedAt,
      })

      return NextResponse.json({
        ok: true,
        type: 'topup',
        message: 'Credits added successfully.',
        creditsAdded,
      })
    }

    const endDateMs = Number(expiresDateMs || 0)
    if (!Number.isFinite(endDateMs) || endDateMs <= Date.now() || endDateMs > 8640000000000000) {
      return NextResponse.json({ error: 'Apple subscription is not currently active.' }, { status: 400 })
    }
    const endDate = new Date(endDateMs)
    const startDateMs = Number(purchaseDateMs || 0)
    const startDateHint = startDateMs > 0 ? new Date(startDateMs) : null

    await upsertSubscriptionPreservingStartDate({
      userId: user.id,
      monthlyPriceCents: product.priceCents,
      startDateHint,
      endDate,
      source: 'apple_iap',
      storeProductId: expectedProductId,
      storeTransactionId: finalTransactionId,
      storeOriginalTransactionId: finalOriginalTransactionId || finalTransactionId,
    })

    await createNativeAffiliateCommission({
      user,
      attribution: affiliateAttribution,
      type: 'SUBSCRIPTION_INITIAL',
      platform,
      transactionId: finalTransactionId,
      amountCents: product.priceCents,
      occurredAt: startDateHint || new Date(),
    })

    return NextResponse.json({
      ok: true,
      type: 'subscription',
      message: 'Subscription updated successfully.',
      monthlyPriceCents: product.priceCents,
      endDate: endDate ? endDate.toISOString() : null,
    })
  } catch (error: any) {
    return NextResponse.json(
      {
        error: 'Failed to verify purchase',
        message: error?.message || 'Unknown error',
      },
      { status: error instanceof NativePurchaseError ? error.status : 500 },
    )
  }
}
