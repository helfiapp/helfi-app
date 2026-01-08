'use client'

import { useEffect, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { AI_MEAL_RECOMMENDATION_CREDITS, CATEGORY_LABELS, normalizeMealCategory } from '@/lib/ai-meal-recommendation'

const buildTodayIso = () => {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export default function RecommendedExplainClient() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const date = searchParams.get('date') || buildTodayIso()
  const category = normalizeMealCategory(searchParams.get('category'))
  const categoryLabel = CATEGORY_LABELS[category]
  const returnTo = searchParams.get('returnTo') || ''

  const continueHref = useMemo(() => {
    if (returnTo) return returnTo
    const qs = new URLSearchParams()
    qs.set('date', date)
    qs.set('category', category)
    return `/food/recommended?${qs.toString()}`
  }, [date, category, returnTo])

  // Mark as seen immediately so it never shows again for this user (server-persisted).
  useEffect(() => {
    try {
      fetch('/api/ai-meal-recommendation', { method: 'PUT' }).catch(() => {})
    } catch {}
  }, [])

  return (
    <div className="min-h-screen bg-white">
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200">
        <div className="flex items-center gap-3 px-4 py-3">
          <button
            type="button"
            onClick={() => router.push('/food')}
            className="p-2 rounded-full hover:bg-gray-100"
            aria-label="Back"
          >
            <span aria-hidden>←</span>
          </button>
          <div className="flex-1 min-w-0">
            <div className="text-lg font-semibold text-gray-900 truncate">AI Recommended {categoryLabel}</div>
            <div className="text-xs text-gray-500">{date}</div>
          </div>
        </div>
      </div>

      <div className="px-4 py-5">
        <div className="w-full max-w-3xl mx-auto space-y-4">
          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <p className="text-sm text-gray-700 leading-relaxed">
              Get a {categoryLabel.toLowerCase()} suggestion based on your health setup and today’s remaining calories/macros.
            </p>
            <p className="mt-2 text-sm text-gray-700 leading-relaxed">
              You’ll get a complete meal, ingredient cards you can adjust, and a short explanation.
            </p>
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
              <div className="text-sm font-semibold text-emerald-900">
                Cost: {AI_MEAL_RECOMMENDATION_CREDITS} credits per recommendation
              </div>
              <div className="text-xs text-emerald-800 mt-1">Credits are only spent when a recommendation is generated.</div>
              <div className="text-[11px] text-emerald-800 mt-2">You’ll only see this screen once.</div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={() => router.push(continueHref)}
              className="flex-1 px-4 py-3 rounded-2xl bg-emerald-600 text-white font-semibold hover:bg-emerald-700"
            >
              Continue
            </button>
            <button
              type="button"
              onClick={() => router.push('/food')}
              className="flex-1 px-4 py-3 rounded-2xl bg-gray-100 text-gray-900 font-semibold hover:bg-gray-200"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
