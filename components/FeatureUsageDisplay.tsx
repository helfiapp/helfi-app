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

export default function FeatureUsageDisplay({ featureName, featureLabel, refreshTrigger }: FeatureUsageDisplayProps) {
  const [usage, setUsage] = useState<FeatureUsage | null>(null)
  const [hasSubscription, setHasSubscription] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchUsage = async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/credit/feature-usage?feature=${encodeURIComponent(featureName)}`, { cache: 'no-store' })
        if (res.ok) {
          const data: FeatureUsageData = await res.json()
          const value = data.featureUsage[featureName]
          setUsage(value ?? null)
          setHasSubscription(data.hasSubscription)
        }
      } catch (err) {
        console.error('Failed to fetch feature usage:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchUsage()
  }, [featureName, refreshTrigger])

  if (loading || !usage) {
    return null
  }

  if (usage.count === 0) {
    return null
  }

  // Calculate total credits used for this feature
  const creditsUsed =
    typeof usage.totalCredits === 'number'
      ? usage.totalCredits
      : usage.count * usage.costPerUse
  
  // Determine label and suffix based on API-provided label (monthly vs total)
  const isMonthly = usage.label === 'monthly'
  const timeLabel = isMonthly ? 'This month' : 'Total'
  const suffix = isMonthly ? ' for this month' : ''

  return (
    <div className="mt-2 text-xs text-gray-600">
      <span className="text-gray-500">{timeLabel}: </span>
      <span className="font-medium">
        This AI feature has been used {usage.count} {usage.count === 1 ? 'time' : 'times'} at a cost of {creditsUsed} {creditsUsed === 1 ? 'credit' : 'credits'}{suffix}
      </span>
    </div>
  )
}
