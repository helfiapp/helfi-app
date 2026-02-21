import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { createSign } from 'crypto'

import { authOptions } from '@/lib/auth'
import { getUserIdFromNativeAuth } from '@/lib/native-auth'
import { prisma } from '@/lib/prisma'
import { getNativeBillingProductByCode, type NativeBillingProductCode } from '@/lib/native-billing/catalog'

type BillingUser = {
  id: string
  email: string
}

type AppleReceiptEntry = {
  product_id?: string
  transaction_id?: string
  original_transaction_id?: string
  purchase_date_ms?: string
  expires_date_ms?: string
}

type AppleTransactionInfo = {
  productId?: string
  transactionId?: string
  originalTransactionId?: string
  purchaseDate?: number | string
  expiresDate?: number | string
}

type AppleApiCredentials = {
  issuerId: string
  keyId: string
  privateKey: string
}

type GoogleProductPurchase = {
  orderId?: string
  purchaseState?: number
  purchaseTimeMillis?: string
}

type GoogleSubscriptionPurchase = {
  orderId?: string
  expiryTimeMillis?: string
  startTimeMillis?: string
  paymentState?: number
}

async function upsertSubscriptionPreservingStartDate(opts: {
  userId: string
  monthlyPriceCents: number
  startDateHint?: Date | null
  endDate?: Date | null
}) {
  const existing = await prisma.subscription.findUnique({
    where: { userId: opts.userId },
    select: { startDate: true },
  })

  const startDate = existing?.startDate || opts.startDateHint || new Date()

  await prisma.subscription.upsert({
    where: { userId: opts.userId },
    update: {
      monthlyPriceCents: opts.monthlyPriceCents,
      startDate,
      endDate: opts.endDate || null,
    },
    create: {
      userId: opts.userId,
      monthlyPriceCents: opts.monthlyPriceCents,
      startDate,
      endDate: opts.endDate || null,
    },
  })
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

  const latest = Array.isArray(data?.latest_receipt_info) ? (data.latest_receipt_info as AppleReceiptEntry[]) : []
  const fallback = Array.isArray(data?.receipt?.in_app) ? (data.receipt.in_app as AppleReceiptEntry[]) : []
  const items = latest.length > 0 ? latest : fallback

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
    `https://api.storekit-sandbox.itunes.apple.com/inApps/v1/transactions/${encodedTransactionId}`,
  ]

  let lastError = 'Apple transaction lookup failed.'
  for (const url of urls) {
    const res = await fetch(url, {
      headers: {
        authorization: `Bearer ${token}`,
      },
    })
    const data: any = await res.json().catch(() => ({}))
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
  if (!issuerId || !keyId || !privateKey) return null
  return { issuerId, keyId, privateKey }
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
        if (Number(purchase.purchaseState) !== 0) {
          return NextResponse.json({ error: 'Google purchase is not completed yet.' }, { status: 400 })
        }

        const source = `google_iap:${String(purchase.orderId || purchaseToken)}`
        const existingTopUp = await prisma.creditTopUp.findFirst({
          where: { userId: user.id, source },
          select: { id: true },
        })
        if (existingTopUp) {
          return NextResponse.json({ ok: true, message: 'Purchase already processed.' })
        }

        const purchasedAtMs = Number(purchase.purchaseTimeMillis || Date.now())
        const purchasedAt = new Date(Number.isFinite(purchasedAtMs) ? purchasedAtMs : Date.now())
        const expiresAt = new Date(purchasedAt)
        expiresAt.setFullYear(expiresAt.getFullYear() + 1)

        await prisma.creditTopUp.create({
          data: {
            userId: user.id,
            amountCents: product.credits * 100,
            usedCents: 0,
            purchasedAt,
            expiresAt,
            source,
          },
        })

        return NextResponse.json({
          ok: true,
          type: 'topup',
          message: 'Credits added successfully.',
          creditsAdded: product.credits,
        })
      }

      const sub = await verifyGoogleSubscriptionPurchase(expectedProductId, purchaseToken)
      const endDateMs = Number(sub.expiryTimeMillis || 0)
      const endDate = endDateMs > 0 ? new Date(endDateMs) : null
      const startDateMs = Number(sub.startTimeMillis || 0)
      const startDateHint = startDateMs > 0 ? new Date(startDateMs) : null

      await upsertSubscriptionPreservingStartDate({
        userId: user.id,
        monthlyPriceCents: product.priceCents,
        startDateHint,
        endDate,
      })

      return NextResponse.json({
        ok: true,
        type: 'subscription',
        message: 'Subscription updated successfully.',
        monthlyPriceCents: product.priceCents,
        endDate: endDate ? endDate.toISOString() : null,
      })
    }

    const expectedProductId = product.iosProductId
    if (!expectedProductId) {
      return NextResponse.json({ error: `iOS product ID is not configured for ${code}.` }, { status: 400 })
    }

    let finalTransactionId = ''
    let purchaseDateMs = 0
    let expiresDateMs = 0

    // Preferred path: App Store transaction lookup by transaction ID (works without shared secret).
    if (transactionId) {
      const lookup = await verifyAppleTransactionById(transactionId)
      if (lookup.ok) {
        const info = lookup.info
        const actualProductId = String(info?.productId || '').trim()
        if (actualProductId !== expectedProductId) {
          return NextResponse.json(
            { error: `Apple transaction product mismatch. Expected ${expectedProductId}, got ${actualProductId || '(empty)'}.` },
            { status: 400 },
          )
        }
        finalTransactionId = String(info?.transactionId || info?.originalTransactionId || transactionId).trim()
        purchaseDateMs = Number(info?.purchaseDate || 0)
        expiresDateMs = Number(info?.expiresDate || 0)
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
        .filter((item) => String(item?.product_id || '') === expectedProductId)
        .sort((a, b) => Number(b?.purchase_date_ms || 0) - Number(a?.purchase_date_ms || 0))
      const purchase = matching[0]

      if (!purchase) {
        return NextResponse.json(
          {
            error: `Apple receipt did not include expected product: ${expectedProductId}`,
          },
          { status: 400 },
        )
      }

      finalTransactionId = String(
        transactionId || purchase.transaction_id || purchase.original_transaction_id || '',
      ).trim()
      purchaseDateMs = Number(purchase.purchase_date_ms || 0)
      expiresDateMs = Number(purchase.expires_date_ms || 0)
    }

    if (!finalTransactionId) {
      return NextResponse.json({ error: 'Could not read transaction ID from Apple receipt.' }, { status: 400 })
    }

    if (product.kind === 'topup') {
      const source = `apple_iap:${finalTransactionId}`
      const existingTopUp = await prisma.creditTopUp.findFirst({
        where: { userId: user.id, source },
        select: { id: true },
      })
      if (existingTopUp) {
        return NextResponse.json({ ok: true, message: 'Purchase already processed.' })
      }

      const purchasedAtMs = purchaseDateMs > 0 ? purchaseDateMs : Date.now()
      const purchasedAt = new Date(Number.isFinite(purchasedAtMs) ? purchasedAtMs : Date.now())
      const expiresAt = new Date(purchasedAt)
      expiresAt.setFullYear(expiresAt.getFullYear() + 1)

      await prisma.creditTopUp.create({
        data: {
          userId: user.id,
          amountCents: product.credits * 100,
          usedCents: 0,
          purchasedAt,
          expiresAt,
          source,
        },
      })

      return NextResponse.json({
        ok: true,
        type: 'topup',
        message: 'Credits added successfully.',
        creditsAdded: product.credits,
      })
    }

    const endDateMs = Number(expiresDateMs || 0)
    const endDate = endDateMs > 0 ? new Date(endDateMs) : null
    const startDateMs = Number(purchaseDateMs || 0)
    const startDateHint = startDateMs > 0 ? new Date(startDateMs) : null

    await upsertSubscriptionPreservingStartDate({
      userId: user.id,
      monthlyPriceCents: product.priceCents,
      startDateHint,
      endDate,
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
      { status: 500 },
    )
  }
}
