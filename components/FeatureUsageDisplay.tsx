'use client'
import { useEffect, useState } from 'react'

interface FeatureUsage {
  count: number
  costPerUse: number
}

interface FeatureUsageData {
  featureUsage: {
    symptomAnalysis: FeatureUsage
    foodAnalysis: FeatureUsage
    interactionAnalysis: FeatureUsage
    medicalImageAnalysis: FeatureUsage
  }
  hasSubscription: boolean
  actualCreditsUsed: number
}

interface FeatureUsageDisplayProps {
  featureName: 'symptomAnalysis' | 'foodAnalysis' | 'interactionAnalysis' | 'medicalImageAnalysis'
  featureLabel: string
}

export default function FeatureUsageDisplay({ featureName, featureLabel }: FeatureUsageDisplayProps) {
  const [usage, setUsage] = useState<FeatureUsage | null>(null)
  const [hasSubscription, setHasSubscription] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchUsage = async () => {
      try {
        const res = await fetch('/api/credit/feature-usage')
        if (res.ok) {
          const data: FeatureUsageData = await res.json()
          setUsage(data.featureUsage[featureName])
          setHasSubscription(data.hasSubscription)
        }
      } catch (err) {
        console.error('Failed to fetch feature usage:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchUsage()
  }, [featureName])

  if (loading || !usage) {
    return null
  }

  if (usage.count === 0) {
    return null
  }

  // Show usage for all users (subscription or credits)
  // For subscription users, show "This month"; for credit-only users, show lifetime
  const timeLabel = hasSubscription ? 'This month' : 'Total'

  return (
    <div className="mt-2 text-xs text-gray-600">
      <span className="text-gray-500">{timeLabel}: </span>
      <span className="font-medium">You have used this feature {usage.count} {usage.count === 1 ? 'time' : 'times'}</span>
    </div>
  )
}

