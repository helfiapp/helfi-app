'use client'

import React from 'react'

interface InsightsProgressBarProps {
  isGenerating: boolean
  message?: string
}

// Indeterminate shimmer bar to avoid misleading “stuck” percentages
export default function InsightsProgressBar({ isGenerating, message }: InsightsProgressBarProps) {
  if (!isGenerating) return null

  return (
    <div className="w-full space-y-2">
      <div className="flex items-center justify-between text-sm">
        <p className="text-gray-700 font-medium">
          {message || 'Generating insights…'}
        </p>
        <p className="text-gray-500 text-xs">
          This may take up to a minute
        </p>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden relative">
        <div className="absolute inset-0 bg-gradient-to-r from-helfi-green/30 via-helfi-green to-helfi-green/30 animate-pulse" />
      </div>
    </div>
  )
}
