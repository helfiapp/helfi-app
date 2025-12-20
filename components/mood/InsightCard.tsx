'use client'

import React from 'react'

export type InsightCardData = {
  title: string
  detail: string
  confidence: 'low' | 'medium' | 'high'
}

function confidenceLabel(confidence: InsightCardData['confidence']) {
  if (confidence === 'high') return 'High confidence'
  if (confidence === 'medium') return 'Medium confidence'
  return 'Low confidence'
}

function confidenceClasses(confidence: InsightCardData['confidence']) {
  if (confidence === 'high') return 'bg-helfi-green/10 text-helfi-green-dark border-helfi-green/20'
  if (confidence === 'medium') return 'bg-yellow-50 text-yellow-800 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-200 dark:border-yellow-800/40'
  return 'bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-800/60 dark:text-gray-300 dark:border-gray-700'
}

export default function InsightCard({ title, detail, confidence }: InsightCardData) {
  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="text-base font-semibold text-gray-900 dark:text-white">{title}</div>
        <div className={`shrink-0 rounded-full border px-2 py-1 text-xs ${confidenceClasses(confidence)}`}>
          {confidenceLabel(confidence)}
        </div>
      </div>
      <div className="mt-2 text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
        {detail}
      </div>
    </div>
  )
}

