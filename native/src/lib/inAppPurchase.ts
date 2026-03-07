import { Platform } from 'react-native'
import * as IAP from 'react-native-iap'

import { API_BASE_URL } from '../config'

export type NativePurchaseCode =
  | 'plan_10_monthly'
  | 'plan_20_monthly'
  | 'plan_30_monthly'
  | 'plan_50_monthly'
  | 'credits_250'
  | 'credits_500'
  | 'credits_1000'

type NativePurchaseKind = 'subscription' | 'topup'

type PurchaseResult = {
  message: string
}

export type NativeBillingCatalogProduct = {
  code: NativePurchaseCode
  kind: NativePurchaseKind
  iosProductId?: string
  androidProductId?: string
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function isPurchaseCancelled(message: string, code: string): boolean {
  return /cancel/i.test(message) || /USER_CANCELLED|E_USER_CANCELLED|purchase_cancelled/i.test(code)
}

function createPurchaseWaiter(storeProductId: string, timeoutMs = 30000): {
  promise: Promise<any>
  dispose: () => void
} {
  let settled = false
  let timeout: any = null
  let updatedSub: any = null
  let errorSub: any = null

  const cleanup = () => {
    if (timeout) {
      clearTimeout(timeout)
      timeout = null
    }
    try {
      updatedSub?.remove?.()
    } catch {}
    try {
      errorSub?.remove?.()
    } catch {}
  }

  const promise = new Promise<any>((resolve, reject) => {
    timeout = setTimeout(() => {
      if (settled) return
      settled = true
      cleanup()
      resolve(null)
    }, timeoutMs)

    updatedSub = (IAP as any).purchaseUpdatedListener?.((purchase: any) => {
      if (settled) return
      if (String(purchase?.productId || '') !== storeProductId) return
      settled = true
      cleanup()
      resolve(purchase)
    })

    errorSub = (IAP as any).purchaseErrorListener?.((error: any) => {
      if (settled) return
      const message = String(error?.message || '')
      const code = String(error?.code || '')
      settled = true
      cleanup()
      if (isPurchaseCancelled(message, code)) {
        reject(new Error('Purchase canceled.'))
        return
      }
      reject(new Error(message || 'The store reported a purchase error.'))
    })
  })

  return {
    promise,
    dispose: () => {
      if (settled) return
      settled = true
      cleanup()
    },
  }
}

function getPurchaseTimestampMs(purchase: any): number {
  const raw = Number(
    purchase?.transactionDate ||
      purchase?.purchaseTime ||
      purchase?.purchaseTimeMillis ||
      purchase?.purchaseDate ||
      0,
  )
  return Number.isFinite(raw) ? raw : 0
}

function isMatchingRecentPurchase(purchase: any, storeProductId: string, startedAtMs: number): boolean {
  if (!purchase) return false
  if (String(purchase?.productId || '') !== storeProductId) return false
  const ts = getPurchaseTimestampMs(purchase)
  if (ts <= 0) return true
  return ts >= startedAtMs - 120000
}

async function findRecentPurchaseFromStore(opts: {
  platform: 'ios' | 'android'
  storeProductId: string
  startedAtMs: number
  timeoutMs?: number
}): Promise<any | null> {
  const timeoutMs = Number(opts.timeoutMs || 25000)
  const startedPollingAt = Date.now()
  while (Date.now() - startedPollingAt < timeoutMs) {
    if (opts.platform === 'ios') {
      const latest = await (IAP as any).latestTransactionIOS?.(opts.storeProductId).catch(() => null)
      if (isMatchingRecentPurchase(latest, opts.storeProductId, opts.startedAtMs)) return latest

      const pending = await (IAP as any).getPendingTransactionsIOS?.().catch(() => [])
      if (Array.isArray(pending)) {
        const pendingMatch =
          pending.find((p: any) => isMatchingRecentPurchase(p, opts.storeProductId, opts.startedAtMs)) || null
        if (pendingMatch) return pendingMatch
      }
    }

    const available = await IAP.getAvailablePurchases().catch(() => [])
    if (Array.isArray(available)) {
      const availableMatch =
        available.find((p: any) => isMatchingRecentPurchase(p, opts.storeProductId, opts.startedAtMs)) || null
      if (availableMatch) return availableMatch
    }

    await wait(1000)
  }
  return null
}

function getPlatform(): 'ios' | 'android' {
  return Platform.OS === 'android' ? 'android' : 'ios'
}

async function parseJsonSafe(res: Response) {
  return res.json().catch(() => ({}))
}

function buildAuthHeaders(token: string) {
  const cookieHeader = [
    `next-auth.session-token=${token}`,
    `__Secure-next-auth.session-token=${token}`,
    `authjs.session-token=${token}`,
    `__Secure-authjs.session-token=${token}`,
  ].join('; ')

  return {
    authorization: `Bearer ${token}`,
    'x-native-token': token,
    cookie: cookieHeader,
    'content-type': 'application/json',
  }
}

export async function runNativePurchase(opts: {
  code: NativePurchaseCode
  kind: NativePurchaseKind
  token: string
}): Promise<PurchaseResult> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    throw new Error('In-app purchases are only available on iPhone and Android.')
  }

  const platform = getPlatform()
  const headers = buildAuthHeaders(opts.token)

  const prepareRes = await fetch(`${API_BASE_URL}/api/native-billing/prepare-purchase`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      platform,
      code: opts.code,
    }),
  })
  const prepareData: any = await parseJsonSafe(prepareRes)
  if (!prepareRes.ok || !prepareData?.storeProductId) {
    throw new Error(prepareData?.message || prepareData?.error || 'Store product is not ready yet.')
  }

  const storeProductId = String(prepareData.storeProductId)

  await IAP.initConnection()
  try {
    const purchaseWaiter = createPurchaseWaiter(storeProductId, 30000)
    const fetchedProducts = await IAP
      .fetchProducts({
        skus: [storeProductId],
        type: opts.kind === 'subscription' ? 'subs' : 'in-app',
      } as any)
      .catch(() => [])
    const hasStoreProduct = Array.isArray(fetchedProducts)
      ? fetchedProducts.some((p: any) => String(p?.id || p?.productId || '') === storeProductId)
      : false
    if (!hasStoreProduct && platform === 'ios') {
      throw new Error(
        'This product is not available from Apple yet. Wait a few minutes and try again.',
      )
    }

    const requestPayload: any =
      platform === 'ios'
        ? {
            request: { ios: { sku: storeProductId } },
            type: opts.kind === 'subscription' ? 'subs' : 'in-app',
          }
        : {
            request: { android: { skus: [storeProductId] } },
            type: opts.kind === 'subscription' ? 'subs' : 'in-app',
          }

    const purchaseStartedAtMs = Date.now()
    let requested: any
    try {
      requested = await IAP.requestPurchase(requestPayload as any)
    } catch (error: any) {
      purchaseWaiter.dispose()
      const message = String(error?.message || '')
      const code = String(error?.code || '')
      if (isPurchaseCancelled(message, code)) {
        throw new Error('Purchase canceled.')
      }
      throw new Error(message || 'The store could not start this purchase.')
    }

    let purchase: any = Array.isArray(requested) ? requested[0] : requested
    if (!isMatchingRecentPurchase(purchase, storeProductId, purchaseStartedAtMs)) {
      purchase = null
    }

    if (!purchase) {
      purchase = await purchaseWaiter.promise
    } else {
      purchaseWaiter.dispose()
    }

    if (!purchase) {
      purchase = await findRecentPurchaseFromStore({
        platform,
        storeProductId,
        startedAtMs: purchaseStartedAtMs,
        timeoutMs: 25000,
      })
    }

    if (!purchase) {
      if (platform === 'ios') {
        throw new Error(
          'Purchase did not finish in time. Check Simulator Settings > Developer > Sandbox Apple Account, then try again.',
        )
      }
      throw new Error('Purchase was not returned by the store. Please try again.')
    }

    let verifyBody: any
    if (platform === 'ios') {
      let receiptData = await IAP.getReceiptDataIOS().catch(async () => {
        return IAP.requestReceiptRefreshIOS().catch(() => '')
      })
      if (!receiptData) {
        receiptData = await IAP.requestReceiptRefreshIOS().catch(() => '')
      }
      if (!receiptData) {
        throw new Error('Could not read Apple receipt from this purchase.')
      }
      verifyBody = {
        platform,
        code: opts.code,
        receiptData,
        transactionId: String(purchase?.transactionId || purchase?.id || ''),
      }
    } else {
      const purchaseToken = String(purchase?.purchaseToken || '')
      if (!purchaseToken) {
        throw new Error('Google purchase token was missing.')
      }
      verifyBody = {
        platform,
        code: opts.code,
        purchaseToken,
        transactionId: String(purchase?.transactionId || purchase?.id || ''),
      }
    }

    const verifyRes = await fetch(`${API_BASE_URL}/api/native-billing/verify-purchase`, {
      method: 'POST',
      headers,
      body: JSON.stringify(verifyBody),
    })
    const verifyData: any = await parseJsonSafe(verifyRes)
    if (!verifyRes.ok || !verifyData?.ok) {
      throw new Error(verifyData?.message || verifyData?.error || 'Purchase verification failed.')
    }

    await IAP.finishTransaction({
      purchase,
      isConsumable: opts.kind === 'topup',
    } as any).catch(() => {})

    return {
      message: String(verifyData?.message || 'Purchase completed.'),
    }
  } finally {
    await IAP.endConnection().catch(() => {})
  }
}

export async function restoreNativePurchases(opts: {
  token: string
  products: NativeBillingCatalogProduct[]
}): Promise<PurchaseResult> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    throw new Error('Restore purchases is only available on iPhone and Android.')
  }

  const platform = getPlatform()
  const headers = buildAuthHeaders(opts.token)

  await IAP.initConnection()
  try {
    const purchases = (await IAP.getAvailablePurchases().catch(() => [])) as any[]
    if (!Array.isArray(purchases) || purchases.length === 0) {
      return { message: 'No previous purchases were found on this device/account.' }
    }

    const products = Array.isArray(opts.products) ? opts.products : []
    const productByStoreId = new Map<string, NativeBillingCatalogProduct>()
    for (const p of products) {
      const storeId = platform === 'ios' ? String(p.iosProductId || '') : String(p.androidProductId || '')
      if (storeId) productByStoreId.set(storeId, p)
    }

    let receiptData = ''
    if (platform === 'ios') {
      const receipt = await IAP.getReceiptDataIOS().catch(async () => {
        return IAP.requestReceiptRefreshIOS().catch(() => '')
      })
      receiptData = receipt || ''
      if (!receiptData) {
        receiptData = (await IAP.requestReceiptRefreshIOS().catch(() => '')) || ''
      }
    }

    let restoredCount = 0
    const attempted = new Set<string>()

    for (const purchase of purchases) {
      const storeId = String(purchase?.productId || '')
      const product = productByStoreId.get(storeId)
      if (!product) continue

      const attemptKey = `${product.code}:${String(purchase?.transactionId || purchase?.purchaseToken || '')}`
      if (attempted.has(attemptKey)) continue
      attempted.add(attemptKey)

      let body: any = {
        platform,
        code: product.code,
        transactionId: String(purchase?.transactionId || purchase?.id || ''),
      }
      if (platform === 'ios') {
        if (!receiptData) continue
        body = {
          ...body,
          receiptData,
        }
      } else {
        const purchaseToken = String(purchase?.purchaseToken || '')
        if (!purchaseToken) continue
        body = {
          ...body,
          purchaseToken,
        }
      }

      const verifyRes = await fetch(`${API_BASE_URL}/api/native-billing/verify-purchase`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      })
      const verifyData: any = await parseJsonSafe(verifyRes)
      if (verifyRes.ok && verifyData?.ok) {
        restoredCount += 1
      }
    }

    if (restoredCount === 0) {
      return { message: 'No matching Helfi purchases were restored.' }
    }
    return {
      message: restoredCount === 1 ? '1 purchase restored successfully.' : `${restoredCount} purchases restored successfully.`,
    }
  } finally {
    await IAP.endConnection().catch(() => {})
  }
}
