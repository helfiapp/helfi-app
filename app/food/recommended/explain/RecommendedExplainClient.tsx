'use client'

import { useMemo } from 'react'
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

  const continueHref = useMemo(() => {
    const qs = new URLSearchParams()
    qs.set('date', date)
    qs.set('category', category)
    qs.set('generate', '1')
    return `/food/recommended?${qs.toString()}`
  }, [date, category])

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
        <div className="w-full max-w-3xl mx-auto space-y-5">
          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <div className="text-base font-semibold text-gray-900">What this does</div>
            <p className="mt-2 text-sm text-gray-700 leading-relaxed">
              This feature uses AI to analyze your health setup, goals, conditions, supplements, medications, daily calorie limits, and remaining macros to recommend the most suitable meal for you right now.
            </p>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <div className="text-base font-semibold text-gray-900">What’s considered</div>
            <ul className="mt-3 space-y-2 text-sm text-gray-700 list-disc pl-5">
              <li>Your weight, height, age, and activity level</li>
              <li>Your health goals and health concerns</li>
              <li>Any medical conditions, allergies, or intolerances you’ve logged</li>
              <li>Supplements and medications you’ve logged</li>
              <li>Your remaining calories and macro limits for today</li>
              <li>The meal type you selected (e.g. {categoryLabel.toLowerCase()})</li>
            </ul>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <div className="text-base font-semibold text-gray-900">What you’ll get</div>
            <ul className="mt-3 space-y-2 text-sm text-gray-700 list-disc pl-5">
              <li>A complete meal suggestion</li>
              <li>Full calorie and macro breakdown</li>
              <li>Clearly listed ingredients (you can adjust quantities before adding)</li>
              <li>A short explanation of why this meal was chosen for you</li>
            </ul>
          </div>

          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
            <div className="text-base font-semibold text-emerald-900">AI credit usage</div>
            <p className="mt-2 text-sm text-emerald-900">
              This recommendation will use <span className="font-semibold">{AI_MEAL_RECOMMENDATION_CREDITS}</span> AI credits.
            </p>
            <p className="mt-1 text-xs text-emerald-800">Credits are only spent when a recommendation is generated.</p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={() => router.push(continueHref)}
              className="flex-1 px-4 py-3 rounded-2xl bg-emerald-600 text-white font-semibold hover:bg-emerald-700"
            >
              Continue &amp; Generate Recommendation
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

