export type SubscriptionLike = {
  plan?: string | null
  endDate?: Date | string | null
}

export function isSubscriptionActive(subscription: SubscriptionLike | null | undefined, now = new Date()): boolean {
  if (!subscription?.plan) return false
  const endDate = subscription.endDate ? new Date(subscription.endDate) : null
  if (!endDate || Number.isNaN(endDate.getTime())) return true
  return endDate.getTime() > now.getTime()
}
