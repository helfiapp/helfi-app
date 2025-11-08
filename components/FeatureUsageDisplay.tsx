'use client'
import { useEffect, useState } from 'react'

interface FeatureUsage {
  count: number
  creditsUsed: number
  costPerUse: number
}

interface FeatureUsageData {
  featureUsage: {
    symptomAnalysis: FeatureUsage
    foodAnalysis: FeatureUsage
    interactionAnalysis: FeatureUsage
    medicalImageAnalysis: FeatureUsage
  }
  totalEstimatedCredits: number
  actualCreditsUsed: number
}

interface FeatureUsageDisplayProps {
  featureName: 'symptomAnalysis' | 'foodAnalysis' | 'interactionAnalysis' | 'medicalImageAnalysis'
  featureLabel: string
}

export default function FeatureUsageDisplay({ featureName, featureLabel }: FeatureUsageDisplayProps) {
  const [usage, setUsage] = useState<FeatureUsage | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchUsage = async () => {
      try {
        const res = await fetch('/api/credit/feature-usage')
        if (res.ok) {
          const data: FeatureUsageData = await res.json()
          setUsage(data.featureUsage[featureName])
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

  return (
    <div className="mt-2 text-xs text-gray-600">
      <span className="text-gray-500">This month: </span>
      <span className="font-medium">{usage.count} {usage.count === 1 ? 'use' : 'uses'}</span>
      <span className="text-gray-500"> • </span>
      <span className="font-medium">~{usage.creditsUsed} credits</span>
    </div>
  )
}

