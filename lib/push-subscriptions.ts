export type PushSubscriptionRecord = Record<string, any>

export function getSubscriptionEndpoint(subscription: PushSubscriptionRecord | null | undefined): string | null {
  if (!subscription || typeof subscription !== 'object') return null
  const endpoint = subscription.endpoint
  return typeof endpoint === 'string' && endpoint.length > 0 ? endpoint : null
}

export function normalizeSubscriptionList(raw: unknown): PushSubscriptionRecord[] {
  const list = Array.isArray(raw) ? raw : raw ? [raw] : []
  return list.filter((item) => item && typeof item === 'object') as PushSubscriptionRecord[]
}

export function dedupeSubscriptions(list: PushSubscriptionRecord[]): PushSubscriptionRecord[] {
  const seen = new Set<string>()
  const out: PushSubscriptionRecord[] = []

  for (const sub of list) {
    const endpoint = getSubscriptionEndpoint(sub)
    const key = endpoint || JSON.stringify(sub)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(sub)
  }

  return out
}

export function mergeSubscriptionList(existingRaw: unknown, incoming: unknown): PushSubscriptionRecord[] {
  const existing = normalizeSubscriptionList(existingRaw)
  const next = [...existing]
  if (incoming && typeof incoming === 'object') {
    next.push(incoming as PushSubscriptionRecord)
  }
  return dedupeSubscriptions(next)
}

export function removeSubscriptionsByEndpoint(
  list: PushSubscriptionRecord[],
  endpointsToRemove: string[],
): PushSubscriptionRecord[] {
  if (!endpointsToRemove.length) return list
  const removeSet = new Set(endpointsToRemove)
  return list.filter((sub) => {
    const endpoint = getSubscriptionEndpoint(sub)
    return !endpoint || !removeSet.has(endpoint)
  })
}

export type PushSendResult = {
  sent: number
  errors: Array<{ endpoint: string | null; message: string; statusCode?: number }>
  goneEndpoints: string[]
}

export async function sendToSubscriptions(
  subscriptions: PushSubscriptionRecord[],
  sendFn: (subscription: PushSubscriptionRecord) => Promise<unknown>,
): Promise<PushSendResult> {
  const results = await Promise.allSettled(subscriptions.map((sub) => sendFn(sub)))
  const errors: Array<{ endpoint: string | null; message: string; statusCode?: number }> = []
  const goneEndpoints: string[] = []
  let sent = 0

  results.forEach((result, index) => {
    const subscription = subscriptions[index]
    if (result.status === 'fulfilled') {
      sent += 1
      return
    }
    const error: any = result.reason
    const statusCode = error?.statusCode || error?.status
    const message = String(error?.body || error?.message || error || 'push_error')
    const endpoint = getSubscriptionEndpoint(subscription)
    errors.push({ endpoint, message, statusCode })
    if (statusCode === 404 || statusCode === 410) {
      if (endpoint) goneEndpoints.push(endpoint)
    }
  })

  return { sent, errors, goneEndpoints }
}
