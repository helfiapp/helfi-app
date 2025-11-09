'use client'

import { useEffect, useState } from 'react'

interface InsightsProgressBarProps {
  isGenerating: boolean
  message?: string
}

export default function InsightsProgressBar({ isGenerating, message }: InsightsProgressBarProps) {
  const [progress, setProgress] = useState(0)
  
  useEffect(() => {
    if (!isGenerating) {
      setProgress(0)
      return
    }
    
    // Smooth animation: start at 0%, gradually increase to 100%
    // Use a more realistic curve that slows down as it approaches 100%
    let startTime: number | null = null
    const duration = 60000 // 60 seconds total animation (to match "up to a minute" message)
    const targetProgress = 100
    
    const animate = (timestamp: number) => {
      if (startTime === null) startTime = timestamp
      const elapsed = timestamp - startTime
      const progressRatio = Math.min(elapsed / duration, 1)
      
      // Ease-out curve: fast start, slow end
      const eased = 1 - Math.pow(1 - progressRatio, 3)
      const currentProgress = eased * targetProgress
      
      setProgress(currentProgress)
      
      if (progressRatio < 1 && isGenerating) {
        requestAnimationFrame(animate)
      } else {
        // Once at 100%, stay there (no pulsing)
        setProgress(100)
      }
    }
    
    requestAnimationFrame(animate)
    
    return () => {
      startTime = null
    }
  }, [isGenerating])
  
  if (!isGenerating && progress === 0) return null
  
  return (
    <div className="w-full space-y-2">
      <div className="flex items-center justify-between text-sm">
        <p className="text-gray-700 font-medium">
          {message || 'Generating insights...'}
        </p>
        <p className="text-gray-500 text-xs">
          This may take up to a minute
        </p>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
        <div 
          className="bg-helfi-green h-2 rounded-full transition-all duration-300 ease-out"
          style={{ width: `${Math.min(progress, 100)}%` }}
        ></div>
      </div>
    </div>
  )
}

