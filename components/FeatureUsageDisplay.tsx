'use client'
import { useEffect, useState } from 'react'

interface FeatureUsage {
  count: number
  costPerUse: number
  label?: 'monthly' | 'total'
  // Optional explicit total credits used for this feature (for dynamic-cost features like Health Tips)
  totalCredits?: number
}

interface FeatureUsageData {
  featureUsage: {
    symptomAnalysis: FeatureUsage
    foodAnalysis: FeatureUsage
    interactionAnalysis: FeatureUsage
    medicalImageAnalysis: FeatureUsage
    insightsGeneration: FeatureUsage
    healthTips?: FeatureUsage
  }
  hasSubscription: boolean
  actualCreditsUsed: number
}

type FeatureKey = keyof FeatureUsageData['featureUsage']

interface FeatureUsageDisplayProps {
  featureName: FeatureKey
  featureLabel: string
  refreshTrigger?: number // Trigger refresh when this changes
}

type UsageCacheEntry = {
  data?: FeatureUsageData
  inFlight?: Promise<FeatureUsageData | null>
  fetchedAt?: number
}

const usageCache: Record<string, UsageCacheEntry> = {}
const USAGE_CACHE_TTL_MS = 30 * 1000
const USAGE_SNAPSHOT_TTL_MS = 5 * 60 * 1000
const USAGE_EVENT_MIN_MS = 5 * 1000

type FeatureUsageSnapshot = {
  usage: FeatureUsage
  hasSubscription: boolean
  fetchedAt: number
}

const buildSnapshotKey = (featureName: FeatureKey) => `featureUsageSnapshot:${featureName}`

const readFeatureUsageSnapshot = (featureName: FeatureKey): FeatureUsageSnapshot | null => {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(buildSnapshotKey(featureName))
    if (!raw) return null
    const parsed = JSON.parse(raw) as FeatureUsageSnapshot
    if (!parsed || typeof parsed !== 'object') return null
    if (!parsed.usage || typeof parsed.fetchedAt !== 'number') return null
    if (Date.now() - parsed.fetchedAt > USAGE_SNAPSHOT_TTL_MS) return null
    return parsed
  } catch {
    return null
  }
}

const writeFeatureUsageSnapshot = (featureName: FeatureKey, usage: FeatureUsage, hasSubscription: boolean) => {
  if (typeof window === 'undefined') return
  try {
    const payload: FeatureUsageSnapshot = {
      usage,
      hasSubscription,
      fetchedAt: Date.now(),
    }
    sessionStorage.setItem(buildSnapshotKey(featureName), JSON.stringify(payload))
  } catch {}
}

const getLastUsageFetchAt = (featureName: FeatureKey) => {
  const key = String(featureName)
  const cached = usageCache[key]?.fetchedAt
  if (cached) return cached
  const snapshot = readFeatureUsageSnapshot(featureName)
  return snapshot?.fetchedAt || 0
}

async function fetchFeatureUsage(featureName: FeatureKey, forceRefresh: boolean): Promise<FeatureUsageData | null> {
  const key = String(featureName)
  const now = Date.now()
  const cached = usageCache[key]
  if (!forceRefresh && cached?.data && cached.fetchedAt && now - cached.fetchedAt < USAGE_CACHE_TTL_MS) {
    return cached.data
  }
  if (cached?.inFlight) {
    return cached.inFlight
  }

  const request = fetch(`/api/credit/feature-usage?feature=${encodeURIComponent(featureName)}`, { cache: 'no-store' })
    .then(async (res) => {
      if (!res.ok) return null
      return (await res.json()) as FeatureUsageData
    })
    .catch(() => null)

  usageCache[key] = { ...cached, inFlight: request }
  const data = await request
  usageCache[key] = { data: data ?? cached?.data, fetchedAt: Date.now() }
  return data
}

export default function FeatureUsageDisplay({ featureName, featureLabel, refreshTrigger }: FeatureUsageDisplayProps) {
  const cachedSnapshot = readFeatureUsageSnapshot(featureName)
  const [usage, setUsage] = useState<FeatureUsage | null>(() => cachedSnapshot?.usage ?? null)
  const [hasSubscription, setHasSubscription] = useState(() => cachedSnapshot?.hasSubscription ?? false)
  const [loading, setLoading] = useState(() => !cachedSnapshot?.usage)
  const [eventTick, setEventTick] = useState(0)

  useEffect(() => {
    const handler = () => setEventTick((v) => v + 1)
    try {
      window.addEventListener('credits:refresh', handler)
      return () => window.removeEventListener('credits:refresh', handler)
    } catch {
      return () => {}
    }
  }, [])

  useEffect(() => {
    const fetchUsage = async () => {
      if (!usage) setLoading(true)
      try {
        const now = Date.now()
        const lastFetchedAt = getLastUsageFetchAt(featureName)
        const allowForceRefresh = now - lastFetchedAt >= USAGE_EVENT_MIN_MS
        const forceRefresh = Boolean((refreshTrigger || 0) > 0 || eventTick > 0) && allowForceRefresh
        const data = await fetchFeatureUsage(featureName, forceRefresh)
        if (data) {
          const value = data.featureUsage[featureName]
          if (value) {
            setUsage(value)
            setHasSubscription(data.hasSubscription)
            writeFeatureUsageSnapshot(featureName, value, data.hasSubscription)
          } else {
            setUsage(null)
          }
        }
      } catch (err) {
        console.error('Failed to fetch feature usage:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchUsage()
  }, [featureName, refreshTrigger, eventTick])

  if (loading || !usage) {
    return null
  }

  if (usage.count === 0) {
    return null
  }

  // Determine label and suffix based on API-provided label (monthly vs total)
  const isMonthly = usage.label === 'monthly'
  const timeLabel = isMonthly ? 'This month' : 'Total'

  return (
    <div className="mt-2 text-xs text-gray-600">
      <span className="text-gray-500">{timeLabel}: </span>
      <span className="font-medium">
        This AI feature has been used {usage.count} {usage.count === 1 ? 'time' : 'times'}.
      </span>
    </div>
  )
}
