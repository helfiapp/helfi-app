'use client'
import { Cog6ToothIcon, UserIcon } from '@heroicons/react/24/outline'
/**
 * ABSOLUTE GUARD RAIL – READ BEFORE EDITING
 *
 * This file contains the main Food Analyzer + Food Diary experience. The user
 * considers this flow “locked”. Do NOT change analysis logic, nutrition math,
 * diary loading, or credit/billing behaviour here unless:
 *   1) You have read `GUARD_RAILS.md` (Food Diary + Credits sections), and
 *   2) The user has explicitly asked for the specific change you are making.
 *
 * It is safe to adjust small UI copy or layout around the feature, but any
 * deeper logic changes require written approval.
 *
 * This page expects AI responses to include ONE nutrition line exactly like:
 *   Calories: N, Protein: Ng, Carbs: Ng, Fat: Ng
 * The API enforces this and also has a fallback extractor.
 * If you change regexes or presentation, TEST that all four values still render.
 */

import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useSession, signOut } from 'next-auth/react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useUserData } from '@/components/providers/UserDataProvider'
import MobileMoreMenu from '@/components/MobileMoreMenu'
import UsageMeter from '@/components/UsageMeter'
import FeatureUsageDisplay from '@/components/FeatureUsageDisplay'
import CreditPurchaseModal from '@/components/CreditPurchaseModal'
import { STARTER_FOODS } from '@/data/foods-starter'
import { COMMON_USDA_FOODS } from '@/data/usda-common'
import { calculateDailyTargets } from '@/lib/daily-targets'
import { SolidMacroRing } from '@/components/SolidMacroRing'

const NUTRIENT_DISPLAY_ORDER: Array<'calories' | 'protein' | 'carbs' | 'fat' | 'fiber' | 'sugar'> = ['calories', 'protein', 'carbs', 'fat', 'fiber', 'sugar']

const NUTRIENT_CARD_META: Record<typeof NUTRIENT_DISPLAY_ORDER[number], { label: string; unit?: string; gradient: string; accent: string }> = {
  calories: { label: 'Calories', unit: '', gradient: 'from-orange-50 to-orange-100', accent: 'text-orange-500' },
  protein: { label: 'Protein', unit: 'g', gradient: 'from-blue-50 to-blue-100', accent: 'text-blue-500' },
  carbs: { label: 'Carbs', unit: 'g', gradient: 'from-green-50 to-green-100', accent: 'text-green-500' },
  fat: { label: 'Fat', unit: 'g', gradient: 'from-purple-50 to-purple-100', accent: 'text-purple-500' },
  fiber: { label: 'Fiber', unit: 'g', gradient: 'from-amber-50 to-amber-100', accent: 'text-amber-500' },
  sugar: { label: 'Sugar', unit: 'g', gradient: 'from-pink-50 to-pink-100', accent: 'text-pink-500' },
}

const ITEM_NUTRIENT_META = [
  { key: 'calories', field: 'calories', label: 'Cal', unit: '', accent: 'text-orange-600' },
  { key: 'protein', field: 'protein_g', label: 'Protein', unit: 'g', accent: 'text-blue-600' },
  { key: 'carbs', field: 'carbs_g', label: 'Carbs', unit: 'g', accent: 'text-green-600' },
  { key: 'fat', field: 'fat_g', label: 'Fat', unit: 'g', accent: 'text-purple-600' },
  { key: 'fiber', field: 'fiber_g', label: 'Fiber', unit: 'g', accent: 'text-amber-600' },
  { key: 'sugar', field: 'sugar_g', label: 'Sugar', unit: 'g', accent: 'text-pink-600' },
] as const

type NutritionTotals = {
  calories: number | null
  protein: number | null
  carbs: number | null
  fat: number | null
  fiber: number | null
  sugar: number | null
}

const formatServingsDisplay = (value: number | null | undefined) => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return '1'
  const rounded = Math.round(numeric * 100) / 100
  if (Number.isInteger(rounded)) return String(rounded)
  return rounded.toFixed(2).replace(/\.0+$/, '').replace(/(\.[1-9])0$/, '$1')
}

const buildMealSummaryFromItems = (items: any[] | null | undefined) => {
  if (!Array.isArray(items) || items.length === 0) return ''

  // Strip any embedded nutrition text from the item name so the green
  // summary line stays clean (just names and portion sizes). Some LLM
  // prompts have historically included things like "(150 calories, 5g
  // protein, 28g carbs, 3g fat)" inside the name field – we never want
  // those repeated in the title area.
  const stripNutritionFromName = (raw: string) =>
    String(raw || '')
      // Remove parenthetical groups that look like nutrition info
      .replace(/\([^)]*(calories?|protein|carbs?|fat|fibre|fiber|sugar)[^)]*\)/gi, '')
      .replace(/\s+/g, ' ')
      .trim()

  const summaryParts = items.map((item) => {
    const pieces: string[] = []
    const servings = Number(item?.servings)
    if (Number.isFinite(servings) && Math.abs(servings - 1) > 0.001) {
      pieces.push(`${formatServingsDisplay(servings)}×`)
    }
    if (item?.brand) {
      pieces.push(String(item.brand))
    }
    const cleanName = stripNutritionFromName(item?.name ? String(item.name) : 'Food item')
    pieces.push(cleanName || 'Food item')
    if (item?.serving_size) {
      pieces.push(`(${item.serving_size})`)
    }
    return pieces.join(' ').replace(/\s+/g, ' ').trim()
  })

  return summaryParts.join(', ')
}

const normalizeFoodName = (name: string | null | undefined) =>
  String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

// Enrich items with starter DB values when fiber/sugar (or other macros) are missing or implausibly zero.
const enrichItemsFromStarter = (items: any[]) => {
  try {
    const map = new Map<string, any>()
    STARTER_FOODS.forEach((f) => map.set(normalizeFoodName(f.name), f))
    return items.map((it) => {
      const key = normalizeFoodName(it?.name)
      const db = map.get(key)
      if (!db) return it
      const next = { ...it }
      // If serving size is empty, adopt starter serving_size
      if (!next.serving_size || String(next.serving_size).trim().length === 0) {
        next.serving_size = db.serving_size
      } else {
        // Add common ounce equivalent for orange juice when missing
        if (/^1\s*cup\b/i.test(String(next.serving_size)) && /orange\s*juice/i.test(key) && !/\(8\s*oz\)/i.test(String(next.serving_size))) {
          next.serving_size = `${next.serving_size} (8 oz)`
        }
      }
      const maybeUse = (v: any, dbv: any) =>
        (v === null || v === undefined || (Number(v) === 0 && Number(dbv) > 0)) ? dbv : v
      next.calories = maybeUse(next.calories, db.calories)
      next.protein_g = maybeUse(next.protein_g, db.protein_g)
      next.carbs_g = maybeUse(next.carbs_g, db.carbs_g)
      next.fat_g = maybeUse(next.fat_g, db.fat_g)
      next.fiber_g = maybeUse(next.fiber_g, db.fiber_g ?? 0)
      next.sugar_g = maybeUse(next.sugar_g, db.sugar_g ?? 0)
      return next
    })
  } catch {
    return items
  }
}

// Enrich items using curated USDA-backed entries (common foods). Only fills missing/zero macros
// or replaces clearly-low estimates to keep accuracy high.
const enrichItemsFromCuratedUsda = (items: any[]) => {
  try {
    const map = new Map<string, any>()
    COMMON_USDA_FOODS.forEach((f) => {
      const key = normalizeFoodName(f.name)
      map.set(key, f)
      if (Array.isArray(f.aliases)) {
        f.aliases.forEach((a) => map.set(normalizeFoodName(a), f))
      }
    })
    const findMatch = (name: string) => {
      const key = normalizeFoodName(name)
      if (map.has(key)) return map.get(key)
      // Fallback: partial contains (avoid downlevel iteration issues)
      const entries = Array.from(map.entries())
      for (let i = 0; i < entries.length; i++) {
        const [k, v] = entries[i]
        if (key.includes(k) || k.includes(key)) return v
      }
      return null
    }
    const maybeUse = (v: any, dbv: any) =>
      v === null || v === undefined || (Number(v) === 0 && Number(dbv) > 0) ? dbv : v
    return items.map((it) => {
      const db = findMatch(it?.name || '')
      if (!db) return it
      const next = { ...it }
      // Normalize the label to the curated entry name (e.g., "Burger bun")
      next.name = db.name
      if (!next.serving_size || String(next.serving_size).trim().length === 0) {
        next.serving_size = db.serving_size
      }
      const enforceFloor = (value: any, floor: number) => {
        const num = Number(value)
        if (!Number.isFinite(num) || num <= 0) return floor
        return num < floor * 0.9 ? floor : num
      }
      next.calories = enforceFloor(maybeUse(next.calories, db.calories), db.calories)
      next.protein_g = enforceFloor(maybeUse(next.protein_g, db.protein_g), db.protein_g)
      next.carbs_g = enforceFloor(maybeUse(next.carbs_g, db.carbs_g), db.carbs_g)
      next.fat_g = enforceFloor(maybeUse(next.fat_g, db.fat_g), db.fat_g)
      next.fiber_g = maybeUse(next.fiber_g, db.fiber_g ?? 0)
      next.sugar_g = maybeUse(next.sugar_g, db.sugar_g ?? 0)
      return next
    })
  } catch {
    return items
  }
}

const formatMacroValue = (value: number | null | undefined, unit: string) => {
  if (value === null || value === undefined) {
    return '—'
  }
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) {
    return '—'
  }
  if (unit) {
    return `${Math.round(numeric * 10) / 10}${unit}`
  }
  return `${Math.round(numeric)}`
}

const KCAL_TO_KJ = 4.184
const OZ_TO_ML = 29.57

const formatEnergyValue = (value: number | null | undefined, unit: 'kcal' | 'kJ') => {
  if (value === null || value === undefined) return '—'
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return '—'
  const baseKcal = numeric
  const display = unit === 'kJ' ? baseKcal * KCAL_TO_KJ : baseKcal
  const rounded = unit === 'kJ' ? Math.round(display) : Math.round(display)
  return `${rounded} ${unit}`
}

const formatServingSizeDisplay = (label: string, item: any) => {
  const base = label && label.trim().length > 0 ? label.trim() : 'Not specified'
  const macros: string[] = []
  const kcal = Number(item?.calories)
  const protein = Number(item?.protein_g)
  const carbs = Number(item?.carbs_g)
  const fat = Number(item?.fat_g)
  if (Number.isFinite(kcal) && kcal > 0) macros.push(`${Math.round(kcal)} kcal`)
  if (Number.isFinite(protein) && protein > 0) macros.push(`${Math.round(protein * 10) / 10}g protein`)
  if (Number.isFinite(carbs) && carbs > 0) macros.push(`${Math.round(carbs * 10) / 10}g carbs`)
  if (Number.isFinite(fat) && fat > 0) macros.push(`${Math.round(fat * 10) / 10}g fat`)
  if (!macros.length) return base
  return `${base} (${macros.join(', ')})`
}

function convertKcalToUnit(value: number | null | undefined, unit: 'kcal' | 'kJ'): number | null {
  if (value === null || value === undefined) return null
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return null
  return unit === 'kJ' ? numeric * KCAL_TO_KJ : numeric
}

const formatNumberInputValue = (value: any) => {
  if (value === null || value === undefined || Number.isNaN(value)) return ''
  return value
}

const extractBaseMealDescription = (value: string | null | undefined) => {
  if (!value) return ''
  const withoutNutrition = value.replace(/Calories:[\s\S]*/i, '').trim()
  const firstLine = withoutNutrition.split('\n').map((line) => line.trim()).find(Boolean)
  return firstLine || value.trim()
}

type RingProps = {
  label: string
  valueLabel: string
  percent: number
  tone: 'primary' | 'target'
}

function TargetRing({ label, valueLabel, percent, tone }: RingProps) {
  const radius = typeof window !== 'undefined' && window.innerWidth < 640 ? 56 : 50
  const circumference = 2 * Math.PI * radius
  const clamped = Math.max(0, Math.min(percent, 1))

  // For Remaining/target we draw a two-tone ring where:
  // - red represents what has already been used (consumed)
  // - green represents the remaining allowance
  // For primary we currently don't use this component, but we keep support
  // for a simple single-colour ring.
  const isTarget = tone === 'target'
  const strokeWidth = 8
  const svgSize = typeof window !== 'undefined' && window.innerWidth < 640 ? 144 : 132

  const parts = (valueLabel || '').split(' ')
  const mainValue = parts[0] || valueLabel
  const unitPart = parts.slice(1).join(' ')

  // For target rings, `percent` is the *used* fraction (0–1)
  const usedFraction = clamped
  const usedLength = usedFraction * circumference

  return (
    <div className="flex flex-col items-center">
      <div className="relative inline-block">
        <svg width={svgSize} height={svgSize}>
          {isTarget ? (
            <>
              {/* Remaining allowance (green) – full circle */}
              <circle
                cx={svgSize / 2}
                cy={svgSize / 2}
                r={radius}
                strokeWidth={strokeWidth}
                stroke="#22c55e"
                fill="none"
                strokeDasharray={circumference}
                strokeDashoffset={0}
                strokeLinecap="butt"
                transform={`rotate(-90 ${svgSize / 2} ${svgSize / 2})`}
              />
              {/* Used (red) overlay */}
              {usedFraction > 0 && (
                <circle
                  cx={svgSize / 2}
                  cy={svgSize / 2}
                  r={radius}
                  strokeWidth={strokeWidth}
                  stroke="#ef4444"
                  fill="none"
                  strokeDasharray={`${usedLength} ${circumference}`}
                  strokeDashoffset={0}
                  strokeLinecap="butt"
                  transform={`rotate(-90 ${svgSize / 2} ${svgSize / 2})`}
                />
              )}
            </>
          ) : (
            // Primary/consumed ring – single green circle showing `percent`
            <circle
              cx={svgSize / 2}
              cy={svgSize / 2}
              r={radius}
              strokeWidth={strokeWidth}
              stroke="#22c55e"
              fill="none"
              strokeDasharray={`${clamped * circumference} ${circumference}`}
              strokeDashoffset={0}
              strokeLinecap="butt"
              transform={`rotate(-90 ${svgSize / 2} ${svgSize / 2})`}
            />
          )}
        </svg>
        {/* Center value */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-xl font-bold text-gray-900">{mainValue}</div>
          {unitPart && (
            <div className="text-xs text-gray-500 mt-0.5">
              {unitPart}
            </div>
          )}
        </div>
      </div>
      <div className="mt-2 text-xs font-semibold text-gray-700 uppercase tracking-wide">
        {label}
      </div>
    </div>
  )
}

type MacroSegment = {
  key: string
  label: string
  grams: number
  color: string
}

function MacroRing({
  macros,
  showLegend = true,
  size = 'large',
}: {
  macros: MacroSegment[]
  showLegend?: boolean
  size?: 'large' | 'small' | 'xlarge'
}) {
  const positive = macros.filter((m) => m.grams && m.grams > 0)
  const total = positive.reduce((sum, m) => sum + m.grams, 0)
  const radius = size === 'small' ? 26 : size === 'xlarge' ? 56 : 44
  const circumference = 2 * Math.PI * radius
  const svgSize = size === 'small' ? 80 : size === 'xlarge' ? 150 : 120

  let currentAngle = -90
  const circles =
    total > 0
      ? positive.map((m) => {
          const fraction = m.grams / total
          const length = fraction * circumference
          const dashArray = `${length} ${circumference}`
          const rotation = currentAngle
          currentAngle += fraction * 360
          return (
            <circle
              key={m.key}
              cx={svgSize / 2}
              cy={svgSize / 2}
              r={radius}
              strokeWidth={size === 'small' ? 7 : size === 'xlarge' ? 10 : 8}
              stroke={m.color}
              fill="none"
              strokeDasharray={dashArray}
              strokeDashoffset={0}
              strokeLinecap="butt"
              transform={`rotate(${rotation} ${svgSize / 2} ${svgSize / 2})`}
            />
          )
        })
      : null

  return (
    <div className="flex flex-col items-center">
      <svg width={svgSize} height={svgSize} className="mb-1">
        <circle
          cx={svgSize / 2}
          cy={svgSize / 2}
          r={radius}
          strokeWidth={size === 'small' ? 7 : size === 'xlarge' ? 10 : 8}
          stroke="#e5e7eb"
          fill="none"
        />
        {circles}
      </svg>
      {showLegend && (
        <>
          <div className="text-sm text-gray-600 mb-2 font-medium">Macro breakdown</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm text-gray-700">
            {macros.map((m) => (
              <div key={m.key} className="flex items-center gap-1">
                <span
                  className="inline-block w-3 h-3 rounded-full"
                  style={{ backgroundColor: m.color }}
                />
                <span>
                  {m.label}{' '}
                  {m.grams > 0 ? `${Math.round(m.grams)}g` : '0g'}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

const parseServingQuantity = (input: string) => {
  if (!input) return null
  const mixedMatch = input.match(/(\d+)\s+(\d+)\/(\d+)/)
  if (mixedMatch) {
    const whole = Number(mixedMatch[1])
    const numerator = Number(mixedMatch[2])
    const denominator = Number(mixedMatch[3])
    if (Number.isFinite(whole) && Number.isFinite(numerator) && Number.isFinite(denominator) && denominator !== 0) {
      return whole + numerator / denominator
    }
  }
  const fractionMatch = input.match(/(\d+)\/(\d+)/)
  if (fractionMatch) {
    const numerator = Number(fractionMatch[1])
    const denominator = Number(fractionMatch[2])
    if (Number.isFinite(numerator) && Number.isFinite(denominator) && denominator !== 0) {
      return numerator / denominator
    }
  }
  const decimalMatch = input.match(/(\d+(?:\.\d+)?)/)
  if (decimalMatch) {
    const value = Number(decimalMatch[1])
    return Number.isFinite(value) ? value : null
  }
  return null
}

const singularizeUnitLabel = (label: string) => {
  const trimmed = label.trim()
  if (!trimmed) return 'unit'
  if (trimmed.toLowerCase().endsWith('ies')) {
    return trimmed.slice(0, -3) + 'y'
  }
  if (trimmed.length > 3 && trimmed.toLowerCase().endsWith('es')) {
    return trimmed.slice(0, -2)
  }
  if (trimmed.length > 3 && trimmed.toLowerCase().endsWith('s')) {
    return trimmed.slice(0, -1)
  }
  return trimmed
}

const parseServingUnitMetadata = (servingSize: string | number | null | undefined) => {
  if (servingSize === null || servingSize === undefined) return null
  const normalized = typeof servingSize === 'string' ? servingSize : String(servingSize)
  if (!normalized.trim()) return null
  const quantity = parseServingQuantity(normalized)
  if (!quantity || quantity <= 0) return null
  const numberToken = normalized.match(/(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)/)
  const unitLabel = numberToken ? normalized.replace(numberToken[0], '').trim().replace(/^of\s+/i, '').trim() : normalized.trim()
  return {
    quantity,
    unitLabel: unitLabel || 'unit',
    unitLabelSingular: singularizeUnitLabel(unitLabel || 'unit'),
  }
}

// Heuristics: treat eggs, slices, cookies, pieces, patties, wings, nuggets, meatballs, sticks, bars as discrete items
// and DO NOT treat weight/volume units as discrete
const isDiscreteUnitLabel = (label: string) => {
  const l = (label || '').toLowerCase().trim()
  const nonDiscreteUnits = [
    'g','gram','grams','kg','kilogram','ml','milliliter','millilitre','l','liter','litre',
    'cup','cups','tbsp','tablespoon','tsp','teaspoon','oz','ounce','lb','pound'
  ]
  if (nonDiscreteUnits.some(u => l === u || l.endsWith(' ' + u))) return false
  const discreteKeywords = [
    'egg','slice','cookie','piece','patty','wing','nugget','meatball','stick','bar','biscuit','pancake','scoop',
    'cracker','crackers','chip','chips'
  ]
  return discreteKeywords.some(k => l.includes(k))
}

const isVolumeBasedUnitLabel = (label: string) => {
  const l = (label || '').toLowerCase().trim()
  if (!l) return false
  const volumeKeywords = ['oz', 'ounce', 'ounces', 'ml', 'milliliter', 'millilitre', 'cup', 'cups']
  return volumeKeywords.some((u) => l.includes(u))
}

// Align servings for discrete items (eggs, bacon slices) when the label clearly
// states multiple pieces but macros look like a single piece.
const DISCRETE_SERVING_RULES = [
  {
    key: 'eggs',
    keywords: ['egg', 'eggs', 'omelet', 'omelette', 'scrambled egg'],
    caloriesPerUnitFloor: 60,
    proteinPerUnitFloor: 5,
  },
  {
    key: 'bacon',
    keywords: ['bacon', 'rasher', 'rashers', 'strip', 'strips'],
    caloriesPerUnitFloor: 35,
    proteinPerUnitFloor: 2,
  },
]

const normalizeDiscreteServingsWithLabel = (items: any[]) => {
  if (!Array.isArray(items)) return []
  return items.map((item) => {
    const next = { ...item }
    const labelSource = `${item?.name || ''} ${item?.serving_size || ''}`.toLowerCase()
    if (!labelSource.trim()) return next

    const rule = DISCRETE_SERVING_RULES.find((r) =>
      r.keywords.some((kw) => labelSource.includes(kw)),
    )
    if (!rule) return next

    const meta = parseServingUnitMetadata(item?.serving_size || item?.name || '')
    const qty = meta?.quantity
    const unitLabel = meta?.unitLabel || meta?.unitLabelSingular || ''
    const currentServings = Number.isFinite(Number(next.servings)) ? Number(next.servings) : 1

    if (!qty || qty <= 1.001) return next
    if (currentServings > 1.05) return next
    if (!isDiscreteUnitLabel(unitLabel)) return next

    const calories = Number(next.calories)
    const protein = Number(next.protein_g)
    const caloriesLow = !Number.isFinite(calories) || calories <= rule.caloriesPerUnitFloor * qty
    const proteinLow =
      rule.proteinPerUnitFloor === undefined
        ? true
        : !Number.isFinite(protein) || protein <= rule.proteinPerUnitFloor * qty

    if (caloriesLow && proteinLow) {
      const fields: Array<keyof typeof next> = [
        'calories',
        'protein_g',
        'carbs_g',
        'fat_g',
        'fiber_g',
        'sugar_g',
      ]
      fields.forEach((f) => {
        const v = next[f] as any
        if (Number.isFinite(v)) {
          next[f] = (Number(v) || 0) * qty
        }
      })
      // Keep servings at 1 to avoid “3 servings of 3 eggs” confusion; macros now
      // represent the whole labeled portion.
      next.servings = Number.isFinite(currentServings) ? currentServings : 1
    }

    return next
  })
}

const extractStructuredItemsFromAnalysis = (analysis: string | null | undefined) => {
  if (!analysis) return null
  // Strategy:
  // 1) Try tagged block <ITEMS_JSON>...</ITEMS_JSON>
  // 2) If not found, try to locate a JSON object containing "items":[...]
  // 2b) Handle OPEN TAG ONLY (model forgot </ITEMS_JSON>) by extracting the first balanced { ... } after the tag
  // 3) Last resort: scan for the nearest balanced JSON object that contains "items"
  // 3) Use relaxed parsing where necessary
  //    Handle HTML-encoded brackets (&lt; &gt;) and code fences
  const source = analysis
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/```json/gi, '```')
    .replace(/```/g, '')
  const tryParse = (raw: string) => {
    let payload: any = null
    try {
      payload = JSON.parse(raw)
    } catch {
      try {
        const keysQuoted = raw.replace(/([{,]\s*)([A-Za-z0-9_]+)\s*:/g, '$1"$2":')
        const doubleQuoted = keysQuoted.replace(/'/g, '"')
        const noTrailingCommas = doubleQuoted.replace(/,\s*([}\]])/g, '$1')
        payload = JSON.parse(noTrailingCommas)
      } catch {
        payload = null
      }
    }
    if (payload && Array.isArray(payload.items)) {
      return {
        items: normalizeDiscreteServingsWithLabel(payload.items),
        total: payload.total || null,
      }
    }
    return null
  }
  const findBalancedJsonFrom = (text: string, startIdx: number) => {
    const n = text.length
    let i = text.indexOf('{', startIdx)
    if (i < 0) return null
    let depth = 0
    for (; i < n; i++) {
      const ch = text[i]
      if (ch === '{') depth++
      if (ch === '}') {
        depth--
        if (depth === 0) {
          const jsonStr = text.slice(startIdx, i + 1)
          return jsonStr
        }
      }
    }
    return null
  }
  // 1) Tagged block
  const tagged = source.match(/<ITEMS_JSON>([\s\S]+?)<\/ITEMS_JSON>/i)
  if (tagged && tagged[1]) {
    const res = tryParse(tagged[1].trim())
    if (res) return res
  }
  // 1b) Open tag without close — extract the first balanced JSON object after the tag
  const openTagIdx = source.indexOf('<ITEMS_JSON>')
  if (openTagIdx >= 0) {
    const after = openTagIdx + '<ITEMS_JSON>'.length
    const balanced = findBalancedJsonFrom(source, after)
    if (balanced) {
      const res = tryParse(balanced.trim())
      if (res) return res
    }
  }
  // 2) Untagged JSON containing "items":[...]
  const jsonBlock = source.match(/\{[\s\S]*?"items"\s*:\s*\[[\s\S]*?\][\s\S]*?\}/)
  if (jsonBlock && jsonBlock[0]) {
    const res = tryParse(jsonBlock[0].trim())
    if (res) return res
  }
  // 3) Last resort: locate "items" then walk backward to a '{' and forward to matching '}'
  const itemsIdx = source.toLowerCase().indexOf('"items"')
  if (itemsIdx >= 0) {
    let openIdx = source.lastIndexOf('{', itemsIdx)
    if (openIdx >= 0) {
      const balanced = findBalancedJsonFrom(source, openIdx)
      if (balanced) {
        const res = tryParse(balanced.trim())
        if (res) return res
      }
    }
  }
  // 4) Prose fallback parsing (Nutrition Estimates bullets)
  const textParsed = extractItemsFromTextEstimates(source)
  if (textParsed) return textParsed
  return null
}

// Simple description-to-items synchronizer
// Detect items that are no longer mentioned in the edited description and offer to remove them.
const normalizeForMatch = (s: string) =>
  String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const isItemMentionedInText = (item: any, textNorm: string) => {
  const candidates: string[] = []
  if (item?.name) candidates.push(String(item.name))
  if (item?.brand) candidates.push(String(item.brand))
  // Serving size sometimes contains the noun (e.g., "1 slice"), include as weak signal
  if (item?.serving_size) candidates.push(String(item.serving_size))

  // Build a few normalized tokens and check that at least the name tokens all appear
  const nameTokens = normalizeForMatch(item?.name || '').split(' ').filter(Boolean)
  if (nameTokens.length > 0) {
    const allTokensPresent = nameTokens.every((t) => textNorm.includes(t))
    if (allTokensPresent) return true
  }
  // Fallback: direct includes for common strings (brand or serving label)
  for (const c of candidates) {
    const cNorm = normalizeForMatch(c)
    if (cNorm && textNorm.includes(cNorm)) return true
  }
  return false
}

const computeItemsToRemoveFromDescription = (items: any[], description: string) => {
  const textNorm = normalizeForMatch(description || '')
  const toRemove: number[] = []
  items.forEach((it, idx) => {
    if (!isItemMentionedInText(it, textNorm)) {
      toRemove.push(idx)
    }
  })
  return toRemove
}

// Fallback parser for prose sections like:
// "**Scrambled Eggs**: Calories: 210, Protein: 18g, Carbs: 2g, Fat: 15g"
// and two-line formats like:
// "1. **Bun**: 1 bun (3 oz)"
// "- Calories: 150, Protein: 5g, Carbs: 28g, Fat: 3g"
const extractItemsFromTextEstimates = (analysis: string) => {
  if (!analysis) return null
  const lines = analysis
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  // Build a map of name -> serving_size from the enumerated detected foods before "Nutrition Estimates"
  const servingMap: Record<string, string> = {}
  for (const l of lines) {
    if (/^\*\*nutrition estimates/i.test(l) || /^\*\*nutrition/i.test(l)) break
    const m = l.match(/^\d+\.\s*\**([A-Za-z0-9 ,()\/\-]+?)\**\s*:\s*(.+)$/i)
    if (m) {
      const name = m[1].replace(/\*+/g, '').trim()
      const desc = m[2].replace(/\*+/g, '').trim().replace(/\.$/, '')
      if (name && desc) {
        servingMap[name.toLowerCase()] = desc
      }
    }
  }
  const items: any[] = []

  // Inline macro formats like:
  // "- **Scrambled Eggs**: Calories: 210, Protein: 18g, Carbs: 2g, Fat: 15g, Fiber: 0g, Sugar: 1g"
  // or "**Scrambled Eggs**: 210 calories, 18g protein, 2g carbs, 15g fat"
  const inlineMacroRegex1 =
    /(?:^|[*\-\u2022]\s*)\**([A-Za-z0-9 ,()\/\-]+?)\**\s*:\s*Calories:\s*[~≈]?\s*([\d\.]+)[^,\n]*,\s*Protein:\s*[~≈]?\s*([\d\.]+)\s*g[^,\n]*,\s*Carbs:\s*[~≈]?\s*([\d\.]+)\s*g[^,\n]*,\s*Fat:\s*[~≈]?\s*([\d\.]+)\s*g(?:[^,\n]*,\s*Fiber:\s*[~≈]?\s*([\d\.]+)\s*g)?(?:[^,\n]*,\s*Sugar:\s*[~≈]?\s*([\d\.]+)\s*g)?/i
  const inlineMacroRegex2 =
    /(?:^|[*\-\u2022]\s*)\**([A-Za-z0-9 ,()\/\-]+?)\**\s*:\s*[~≈]?\s*([\d\.]+)\s*calories?\s*,\s*[~≈]?\s*([\d\.]+)\s*g\s*protein\s*,\s*[~≈]?\s*([\d\.]+)\s*g\s*carbs?\s*,\s*[~≈]?\s*([\d\.]+)\s*g\s*fat\s*(?:,\s*[~≈]?\s*([\d\.]+)\s*g\s*fiber\s*)?(?:,\s*[~≈]?\s*([\d\.]+)\s*g\s*sugar\s*)?/i

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    let m = l.match(inlineMacroRegex1)
    if (!m) m = l.match(inlineMacroRegex2)

    // Two-line variant: numbered header, then "- Calories: ..." on next line
    if (!m) {
      const header = l.match(/^\d+\.\s*\**([A-Za-z0-9 ,()\/\-]+?)\**\s*:\s*(.+)$/i)
      const next = lines[i + 1]
      if (header && next && /^-\s*calories:/i.test(next)) {
        const macroLineMatch =
          next.match(
            /^-\s*Calories:\s*([\d\.]+)[^,\n]*,\s*Protein:\s*([\d\.]+)\s*g[^,\n]*,\s*Carbs:\s*([\d\.]+)\s*g[^,\n]*,\s*Fat:\s*([\d\.]+)\s*g(?:[^,\n]*,\s*Fiber:\s*([\d\.]+)\s*g)?(?:[^,\n]*,\s*Sugar:\s*([\d\.]+)\s*g)?/i,
          ) || null
        if (macroLineMatch) {
          m = [
            header[0],
            header[1],
            macroLineMatch[1],
            macroLineMatch[2],
            macroLineMatch[3],
            macroLineMatch[4],
            macroLineMatch[5],
            macroLineMatch[6],
          ] as any
        }
      }
    }

    if (m) {
      const name = m[1].replace(/\*+/g, '').trim()
      const calories = Number(m[2])
      const protein_g = Number(m[3])
      const carbs_g = Number(m[4])
      const fat_g = Number(m[5])
      const fiber_g = m[6] !== undefined ? Number(m[6]) : null
      const sugar_g = m[7] !== undefined ? Number(m[7]) : null
      if (name && [calories, protein_g, carbs_g, fat_g].every((n) => Number.isFinite(n))) {
        items.push({
          name,
          brand: null,
          serving_size: servingMap[name.toLowerCase()] || '',
          servings: 1,
          calories,
          protein_g,
          carbs_g,
          fat_g,
          fiber_g: Number.isFinite(fiber_g as any) ? (fiber_g as number) : null,
          sugar_g: Number.isFinite(sugar_g as any) ? (sugar_g as number) : null,
        })
      }
    }
  }

  // If we still have no macros but we *do* have a serving map, at least
  // build items with names + serving sizes so cards can render.
  if (!items.length && Object.keys(servingMap).length > 0) {
    for (const [nameKey, serving_size] of Object.entries(servingMap)) {
      const displayName = nameKey.replace(/\b\w/g, (c) => c.toUpperCase())
      items.push({
        name: displayName,
        brand: null,
        serving_size,
        servings: 1,
        calories: null,
        protein_g: null,
        carbs_g: null,
        fat_g: null,
        fiber_g: null,
        sugar_g: null,
      })
    }
    const normalizedFallback = normalizeDiscreteServingsWithLabel(items)
    return { items: normalizedFallback, total: null }
  }

  if (!items.length) return null

  const normalizedItems = normalizeDiscreteServingsWithLabel(items)

  const total = normalizedItems.reduce(
    (acc, it) => {
      acc.calories += it.calories
      acc.protein_g += it.protein_g
      acc.carbs_g += it.carbs_g
      acc.fat_g += it.fat_g
      acc.fiber_g += Number.isFinite(it.fiber_g) ? it.fiber_g : 0
      acc.sugar_g += Number.isFinite(it.sugar_g) ? it.sugar_g : 0
      return acc
    },
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, sugar_g: 0 }
  )
  return { items: normalizedItems, total }
}

// Hook to remove items and recalc, optionally updating editingEntry
const removeItemsByIndex = (
  items: any[],
  indexes: number[],
  applyRecalc: (next: any[]) => void,
  setItems: (next: any[]) => void,
  editingEntry: any | null,
  setEditingEntry: (next: any | null) => void,
  setTodaysFoods: (updater: any) => void,
) => {
  if (!Array.isArray(items) || items.length === 0 || indexes.length === 0) return
  const setToRemove = new Set(indexes)
  const nextItems = items.filter((_, i) => !setToRemove.has(i))
  setItems(nextItems)
  applyRecalc(nextItems)
  if (editingEntry) {
    // Lightweight inline totals calculator (avoid referencing later-scoped functions)
    const totals = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0 }
    nextItems.forEach((it: any) => {
      const servings = it?.servings && Number.isFinite(it.servings) ? Number(it.servings) : 1
      totals.calories += (Number(it?.calories) || 0) * servings
      totals.protein += (Number(it?.protein_g) || 0) * servings
      totals.carbs += (Number(it?.carbs_g) || 0) * servings
      totals.fat += (Number(it?.fat_g) || 0) * servings
      totals.fiber += (Number(it?.fiber_g) || 0) * servings
      totals.sugar += (Number(it?.sugar_g) || 0) * servings
    })
    const updatedNutrition = {
      calories: Math.round(totals.calories),
      protein: Math.round(totals.protein * 10) / 10,
      carbs: Math.round(totals.carbs * 10) / 10,
      fat: Math.round(totals.fat * 10) / 10,
      fiber: Math.round(totals.fiber * 10) / 10,
      sugar: Math.round(totals.sugar * 10) / 10,
    }
    const updatedEntry = {
      ...editingEntry,
      items: nextItems,
      nutrition: updatedNutrition,
      total: {
        calories: updatedNutrition.calories ?? null,
        protein_g: updatedNutrition.protein ?? null,
        carbs_g: updatedNutrition.carbs ?? null,
        fat_g: updatedNutrition.fat ?? null,
        fiber_g: updatedNutrition.fiber ?? null,
        sugar_g: updatedNutrition.sugar ?? null,
      },
    }
    setEditingEntry(updatedEntry)
    setTodaysFoods((prev: any[]) => prev.map((f: any) => (f.id === editingEntry.id ? updatedEntry : f)))
  }
}

export default function FoodDiary() {
  const { data: session } = useSession()
  const pathname = usePathname()
  const { userData, profileImage, updateUserData } = useUserData()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [todaysFoods, setTodaysFoods] = useState<any[]>([])
  const [newFoodText, setNewFoodText] = useState('')
  const [showAddFood, setShowAddFood] = useState(false)
  const [showPhotoOptions, setShowPhotoOptions] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysisPhase, setAnalysisPhase] = useState<'idle' | 'preparing' | 'analyzing' | 'building'>('idle')
  const [isSavingEntry, setIsSavingEntry] = useState(false)
  const [analysisMode, setAnalysisMode] = useState<'auto' | 'packaged' | 'meal'>('auto')
  const [showAnalysisModeModal, setShowAnalysisModeModal] = useState(false)
  const [pendingPhotoPicker, setPendingPhotoPicker] = useState(false)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [aiDescription, setAiDescription] = useState('')
  const [showAiResult, setShowAiResult] = useState(false)
  const [isEditingDescription, setIsEditingDescription] = useState(false)
  const [editedDescription, setEditedDescription] = useState('')
  const [analyzedNutrition, setAnalyzedNutrition] = useState<any>(null)
  const [analyzedItems, setAnalyzedItems] = useState<any[]>([]) // Structured items array from API
  const [analyzedTotal, setAnalyzedTotal] = useState<any>(null) // Total nutrition from API
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null) // Which item is being edited
  const [showItemEditModal, setShowItemEditModal] = useState<boolean>(false) // Show edit modal for item
  const [healthWarning, setHealthWarning] = useState<string | null>(null)
  const [healthAlternatives, setHealthAlternatives] = useState<string | null>(null)
  const [showAddIngredientModal, setShowAddIngredientModal] = useState<boolean>(false)
  const [officialSearchQuery, setOfficialSearchQuery] = useState<string>('')
  const [officialResults, setOfficialResults] = useState<any[]>([])
  const [officialSource, setOfficialSource] = useState<'packaged' | 'single'>('packaged')
  const [officialLoading, setOfficialLoading] = useState<boolean>(false)
  const [officialError, setOfficialError] = useState<string | null>(null)
  
  // Manual food entry states
  const [manualFoodName, setManualFoodName] = useState('')
  const [manualFoodType, setManualFoodType] = useState('single')
  const [manualIngredients, setManualIngredients] = useState([{ name: '', weight: '', unit: 'g' }])
  const [showEntryOptions, setShowEntryOptions] = useState<string | null>(null)
  const [showIngredientOptions, setShowIngredientOptions] = useState<string | null>(null)
  const [editingEntry, setEditingEntry] = useState<any>(null)
  const [originalEditingEntry, setOriginalEditingEntry] = useState<any>(null)
  const [showEditActionsMenu, setShowEditActionsMenu] = useState(false)
  const usdaFallbackAttemptedRef = useRef(false)
  const usdaCacheRef = useRef<Map<string, any>>(new Map())
  
  // New loading state
  const [foodDiaryLoaded, setFoodDiaryLoaded] = useState(false)
  const [expandedItemIndex, setExpandedItemIndex] = useState<number | null>(null)
 
  const descriptionTextareaRef = useRef<HTMLTextAreaElement | null>(null)
  const editPhotoInputRef = useRef<HTMLInputElement | null>(null)
  const selectPhotoInputRef = useRef<HTMLInputElement | null>(null)

  const [foodImagesLoading, setFoodImagesLoading] = useState<{[key: string]: boolean}>({})
  const [expandedEntries, setExpandedEntries] = useState<{[key: string]: boolean}>({})
  const [insightsNotification, setInsightsNotification] = useState<{show: boolean, message: string, type: 'updating' | 'updated'} | null>(null)
  const [fullSizeImage, setFullSizeImage] = useState<string | null>(null)
  const [showSavedToast, setShowSavedToast] = useState<boolean>(false)
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  })
  const [historyFoods, setHistoryFoods] = useState<any[] | null>(null)
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false)
  const [showCreditsModal, setShowCreditsModal] = useState<boolean>(false)
  const [creditInfo, setCreditInfo] = useState<any>({
    dailyUsed: 0,
    dailyLimit: 0,
    additionalCredits: 0,
    plan: 'FREE',
    creditCost: 1,
    featureUsageToday: { foodAnalysis: 0, interactionAnalysis: 0 }
  })
  const [usageMeterRefresh, setUsageMeterRefresh] = useState<number>(0) // Trigger for UsageMeter refresh
  const [hasPaidAccess, setHasPaidAccess] = useState<boolean>(false)
  const [energyUnit, setEnergyUnit] = useState<'kcal' | 'kJ'>('kcal')
  const [volumeUnit, setVolumeUnit] = useState<'oz' | 'ml'>('oz')
  const [macroPopup, setMacroPopup] = useState<{
    title: string
    energyLabel?: string
    macros: MacroSegment[]
  } | null>(null)

  const dailyTargets = useMemo(() => {
    if (!userData) return { calories: null, protein: null, carbs: null, fat: null }
    const weightKg =
      typeof userData.weight === 'string'
        ? parseFloat(userData.weight)
        : typeof userData.weight === 'number'
        ? userData.weight
        : null
    const heightCm =
      typeof userData.height === 'string'
        ? parseFloat(userData.height)
        : typeof userData.height === 'number'
        ? userData.height
        : null
    const goalsArray = Array.isArray(userData.goals) ? userData.goals : []

    return calculateDailyTargets({
      gender: userData.gender,
      birthdate: (userData as any).birthdate || userData.profileInfo?.dateOfBirth,
      weightKg: Number.isFinite(weightKg || NaN) ? (weightKg as number) : null,
      heightCm: Number.isFinite(heightCm || NaN) ? (heightCm as number) : null,
      exerciseFrequency: (userData as any).exerciseFrequency,
      goals: goalsArray,
      goalChoice: (userData as any).goalChoice,
      goalIntensity: (userData as any).goalIntensity,
      exerciseDurations: (userData as any).exerciseDurations,
      healthSituations: (userData as any).healthSituations,
    })
  }, [userData])

  const applyRecalculatedNutrition = (items: any[]) => {
    const recalculated = recalculateNutritionFromItems(items)
    // Guard rail: only overwrite the original AI totals when we have a
    // meaningful recalculation (non‑zero calories). This prevents cases where
    // partial or missing per‑item macros would cause all headline numbers to
    // drop to 0 as soon as the user tweaks a serving value.
    if (!recalculated || (recalculated.calories ?? 0) <= 0) {
      return
    }
    setAnalyzedNutrition(recalculated)
    setAnalyzedTotal(convertTotalsForStorage(recalculated))
  }

  const handleDeleteItem = (index: number) => {
    const item = analyzedItems[index]
    const name = item?.name || 'this ingredient'
    if (typeof window !== 'undefined') {
      const ok = window.confirm(`Remove "${name}" from this meal?`)
      if (!ok) return
    }
    const next = analyzedItems.filter((_, i) => i !== index)
    setAnalyzedItems(next)
    applyRecalculatedNutrition(next)
    if (editingEntry) {
      try {
        const updatedNutrition = recalculateNutritionFromItems(next)
        const updatedEntry = {
          ...editingEntry,
          items: next,
          nutrition: updatedNutrition,
          total: convertTotalsForStorage(updatedNutrition),
        }
        setEditingEntry(updatedEntry)
        setTodaysFoods(prev => prev.map(food => (food.id === editingEntry.id ? updatedEntry : food)))
      } catch {}
    }
  }

  const addIngredientFromOfficial = (item: any) => {
    if (!item) return
    const newItem = {
      name: item.name || 'Unknown food',
      brand: item.brand ?? null,
      serving_size: item.serving_size || '',
      servings: 1,
      calories: item.calories ?? null,
      protein_g: item.protein_g ?? null,
      carbs_g: item.carbs_g ?? null,
      fat_g: item.fat_g ?? null,
      fiber_g: item.fiber_g ?? null,
      sugar_g: item.sugar_g ?? null,
    }
    const next = [...analyzedItems, newItem]
    setAnalyzedItems(next)
    applyRecalculatedNutrition(next)
    if (editingEntry) {
      try {
        const updatedNutrition = recalculateNutritionFromItems(next)
        const updatedEntry = {
          ...editingEntry,
          items: next,
          nutrition: updatedNutrition,
          total: convertTotalsForStorage(updatedNutrition),
        }
        setEditingEntry(updatedEntry)
        setTodaysFoods(prev => prev.map(food => (food.id === editingEntry.id ? updatedEntry : food)))
      } catch {}
    }
    setShowAddIngredientModal(false)
    setOfficialSearchQuery('')
    setOfficialResults([])
    setOfficialError(null)
  }

  const handleOfficialSearch = async (mode: 'packaged' | 'single') => {
    if (!officialSearchQuery.trim()) {
      setOfficialError('Please enter a product name or barcode to search.')
      return
    }
    setOfficialError(null)
    setOfficialLoading(true)
    setOfficialResults([])
    setOfficialSource(mode)
    try {
      const params = new URLSearchParams({
        source: 'usda',
        q: officialSearchQuery.trim(),
        kind: mode,
      })
      const res = await fetch(`/api/food-data?${params.toString()}`, {
        method: 'GET',
      })
      if (!res.ok) {
        const text = await res.text()
        console.error('Food data search failed:', text)
        setOfficialError('Unable to fetch official data right now. Please try again.')
        return
      }
      const data = await res.json()
      setOfficialResults(Array.isArray(data.items) ? data.items : [])
    } catch (err) {
      console.error('Food data search error:', err)
      setOfficialError('Something went wrong while searching. Please try again.')
    } finally {
      setOfficialLoading(false)
    }
  }

const applyStructuredItems = (
  itemsFromApi: any[] | null | undefined,
  totalFromApi: any,
  analysisText: string | null | undefined,
  options?: { allowTextFallback?: boolean },
) => {
  let finalItems = Array.isArray(itemsFromApi) ? itemsFromApi : []
  let finalTotal = sanitizeNutritionTotals(totalFromApi)
  const allowTextFallback = options?.allowTextFallback ?? true

  console.log('🔍 applyStructuredItems called:', {
    itemsFromApiCount: Array.isArray(itemsFromApi) ? itemsFromApi.length : 0,
    hasTotalFromApi: !!totalFromApi,
    totalFromApiPreview: totalFromApi ? JSON.stringify(totalFromApi).substring(0, 100) : 'null',
    finalTotalAfterSanitize: finalTotal ? JSON.stringify(finalTotal) : 'null',
    hasAnalysisText: !!analysisText,
  })

  if (!finalItems.length && analysisText) {
    const fallback = extractStructuredItemsFromAnalysis(analysisText)
    if (fallback?.items?.length) {
      finalItems = fallback.items
      finalTotal = sanitizeNutritionTotals(fallback.total) || finalTotal
      console.log('✅ Extracted items from structured analysis:', finalItems.length)
    } else {
      const prose = extractItemsFromTextEstimates(analysisText)
      if (prose?.items?.length) {
        finalItems = prose.items
        finalTotal = sanitizeNutritionTotals(prose.total) || finalTotal
        console.log('✅ Extracted items from text estimates:', finalItems.length)
      }
    }
  }

  const curatedEnriched =
    finalItems.length > 0 ? enrichItemsFromCuratedUsda(finalItems) : []
  const enrichedItems = curatedEnriched.length > 0 ? enrichItemsFromStarter(curatedEnriched) : []
  const normalizedItems =
    enrichedItems.length > 0 ? normalizeDiscreteServingsWithLabel(enrichedItems) : []

  // Guard rail: never wipe existing cards if a new analysis yields nothing.
  const itemsToUse =
    normalizedItems.length > 0
      ? normalizedItems
      : Array.isArray(analyzedItems) && analyzedItems.length > 0
      ? analyzedItems
      : []

  setAnalyzedItems(itemsToUse)

  console.log('📊 Processing totals:', {
    enrichedItemsCount: itemsToUse.length,
    hasFinalTotal: !!finalTotal,
    finalTotalValue: finalTotal ? JSON.stringify(finalTotal) : 'null',
  })

  // Priority order for totals (updated):
  // 1. Recalculated from enriched items (so the circle always matches the cards the user sees)
  // 2. API-provided total (if item-based recalculation is missing or clearly zero)
  // 3. Extracted from analysis text (fallback)
  let totalsToUse: NutritionTotals | null = null

  if (itemsToUse.length > 0) {
    const fromItems = recalculateNutritionFromItems(itemsToUse)
    console.log(
      '📊 Recalculated totals from enriched items:',
      fromItems ? JSON.stringify(fromItems) : 'null',
    )
    // Prefer totals from items when they have real calories; otherwise fall back to API total.
    if (fromItems && (fromItems.calories ?? 0) > 0) {
      totalsToUse = fromItems
    } else if (finalTotal) {
      totalsToUse = finalTotal
      console.log('📊 Using API-provided totals as fallback:', JSON.stringify(finalTotal))
    }
  } else if (finalTotal) {
    totalsToUse = finalTotal
    console.log('📊 Using API-provided totals (no items available):', JSON.stringify(finalTotal))
  }

  if (!totalsToUse && analysisText && allowTextFallback) {
    totalsToUse = sanitizeNutritionTotals(extractNutritionData(analysisText))
    console.log('📊 Extracted totals from text:', totalsToUse ? JSON.stringify(totalsToUse) : 'null')
  }

  // CRITICAL FIX: Always set totals if we have items, even if totals are zero
  // This prevents the UI from showing all zeros when items exist but totals weren't calculated
  if (totalsToUse) {
    setAnalyzedNutrition(totalsToUse)
    setAnalyzedTotal(convertTotalsForStorage(totalsToUse))
    console.log('✅ Set nutrition totals:', JSON.stringify(totalsToUse))
  } else if (itemsToUse.length > 0) {
    // If we have items but no totals, recalculate one more time as a last resort
    const lastResortTotals = recalculateNutritionFromItems(itemsToUse)
    if (lastResortTotals) {
      setAnalyzedNutrition(lastResortTotals)
      setAnalyzedTotal(convertTotalsForStorage(lastResortTotals))
      console.log('⚠️ Using last-resort recalculated totals:', JSON.stringify(lastResortTotals))
    } else {
      console.warn('⚠️ No totals available despite having items - setting to null')
      setAnalyzedNutrition(null)
      setAnalyzedTotal(null)
    }
  } else {
    console.log('ℹ️ No items and no totals - setting to null')
    setAnalyzedNutrition(null)
    setAnalyzedTotal(null)
  }

  return { items: normalizedItems, total: totalsToUse }
}

  const clampNumber = (value: any, min: number, max: number) => {
    const num = Number(value)
    if (!Number.isFinite(num)) return min
    if (num < min) return min
    if (num > max) return max
    return num
  }

  const updateItemField = (
    index: number,
    field:
      | 'name'
      | 'brand'
      | 'serving_size'
      | 'servings'
      | 'calories'
      | 'protein_g'
      | 'carbs_g'
      | 'fat_g'
      | 'fiber_g'
      | 'sugar_g',
    value: any,
  ) => {
    const itemsCopy = [...analyzedItems]
    if (!itemsCopy[index]) return

    // Normalize and clamp values by field
    if (field === 'name') {
      itemsCopy[index].name = String(value || '').trim()
    } else if (field === 'brand') {
      const v = String(value || '').trim()
      itemsCopy[index].brand = v.length > 0 ? v : null
    } else if (field === 'serving_size') {
      itemsCopy[index].serving_size = String(value || '').trim()
    } else if (field === 'servings') {
      // Keep servings as a smooth fractional value under the hood:
      // - Units controls (oz / ml / pieces) handle the "nice" whole-number steps
      // - Servings simply tracks the precise underlying quantity
      const clamped = clampNumber(value, 0, 20)
      const rounded = Math.round(clamped * 1000) / 1000
      itemsCopy[index].servings = rounded
    } else if (field === 'calories') {
      // Calories as integer, reasonable upper bound per serving
      const clamped = clampNumber(value, 0, 3000)
      itemsCopy[index].calories = Math.round(clamped)
    } else {
      // Macros in grams with 1 decimal place, reasonable upper bound per serving
      const clamped = clampNumber(value, 0, 500)
      const rounded = Math.round(clamped * 10) / 10
      itemsCopy[index][field] = rounded
    }

    setAnalyzedItems(itemsCopy)
    applyRecalculatedNutrition(itemsCopy)

    // Live-update Today's Totals while editing an existing entry (no persistence)
    if (editingEntry) {
      try {
        const updatedNutrition = recalculateNutritionFromItems(itemsCopy)
        const updatedEntry = {
          ...editingEntry,
          items: itemsCopy,
          nutrition: updatedNutrition,
          total: convertTotalsForStorage(updatedNutrition),
        }
        setEditingEntry(updatedEntry)
        setTodaysFoods(prev =>
          prev.map(food => (food.id === editingEntry.id ? updatedEntry : food))
        )
      } catch {
        // no-op: do not block UI on totals calc errors
      }
    }
  }

  // Profile data - prefer real photos; fall back to professional icon
  const hasProfileImage = !!(profileImage || session?.user?.image)
  const userImage = (profileImage || session?.user?.image || '') as string
  const userName = session?.user?.name || 'User';

  // Today's date
  const today = new Date().toLocaleDateString('en-US', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });

  const isViewingToday = (() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return selectedDate === `${y}-${m}-${day}`;
  })();

  // Friendly label for selected date (local time)
  const selectedFriendly = (() => {
    const [y, m, d] = selectedDate.split('-').map((v) => parseInt(v, 10));
    const local = new Date(y, (m || 1) - 1, d || 1);
    return local.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  })();

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      
      // Check if the click is inside any dropdown
      if (!target.closest('.dropdown-container')) {
        setDropdownOpen(false);
      }
      if (!target.closest('.food-options-dropdown') && !target.closest('.add-food-entry-container')) {
        setShowPhotoOptions(false);
      }
      if (!target.closest('.entry-options-dropdown')) {
        setShowEntryOptions(null);
      }
      if (!target.closest('.ingredient-options-dropdown')) {
        setShowIngredientOptions(null);
      }
      if (!target.closest('.edit-actions-menu')) {
        setShowEditActionsMenu(false);
      }
    }
    if (dropdownOpen || showPhotoOptions || showEntryOptions || showIngredientOptions || showEditActionsMenu) {
      document.addEventListener('mousedown', handleClick);
      return () => document.removeEventListener('mousedown', handleClick);
    }
  }, [dropdownOpen, showPhotoOptions, showEntryOptions, showIngredientOptions, showEditActionsMenu]);

  // Reset which ingredient card is expanded whenever we switch which entry is being edited.
  // Multi-ingredient meals will start with all cards collapsed; single-ingredient meals
  // remain fully open by default via the rendering logic. This effect keys off the entry id
  // so it does NOT fire on every minor edit (which would collapse the open card).
  useEffect(() => {
    setExpandedItemIndex(null)
  }, [editingEntry?.id])



  // 🛡️ GUARD RAIL: Food Diary Entry Loading
  // CRITICAL: This section prevents entries from disappearing due to date filtering issues.
  // See GUARD_RAILS.md section 3 for full documentation.
  // 
  // DO NOT:
  // - Remove the database verification step below
  // - Make date filtering stricter
  // - Skip the fallback to /api/food-log
  // - Assume cached data is always complete
  //
  // DO:
  // - Always verify cached entries against database
  // - Merge missing entries back into cache
  // - Handle missing/incorrect localDate gracefully
  //
  // Load today's foods from context data (no API calls needed!)
  useEffect(() => {
    // Try to load from cache first (works for both today and past dates)
    if (userData?.todaysFoods) {
      console.log(`🚀 PERFORMANCE: Checking cache for date ${selectedDate}, isViewingToday: ${isViewingToday}`);
      console.log(`📦 Cache contains ${userData.todaysFoods.length} total entries`);
      // Filter to only entries created on the selected date using the entry timestamp id
      const onlySelectedDate = userData.todaysFoods.filter((item: any) => {
        try {
          // Prefer explicit localDate stamp if present
          if (typeof item.localDate === 'string' && item.localDate.length >= 8) {
            const matches = item.localDate === selectedDate;
            if (matches) {
              console.log(`✅ Cache match by localDate: ${item.localDate} === ${selectedDate}`);
            }
            return matches;
          }
          const d = new Date(typeof item.id === 'number' ? item.id : Number(item.id));
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          const itemDate = `${y}-${m}-${day}`;
          const matches = itemDate === selectedDate;
          if (matches) {
            console.log(`✅ Cache match by timestamp: ${itemDate} === ${selectedDate}`);
          }
          return matches;
        } catch (e) {
          console.log(`❌ Error filtering cache entry:`, e);
          return false;
        }
      });
      console.log(`📊 Found ${onlySelectedDate.length} entries in cache for date ${selectedDate}`);
      
      // Deduplicate entries by ID to prevent duplicates from context updates
      const seenIds = new Set<number>();
      const deduped = onlySelectedDate.filter((item: any) => {
        const id = typeof item.id === 'number' ? item.id : Number(item.id);
        if (seenIds.has(id)) {
          return false;
        }
        seenIds.add(id);
        return true;
      });
      
      if (Array.isArray(deduped) && deduped.length > 0) {
        // Update the appropriate state based on whether we're viewing today or a past date
        if (isViewingToday) {
          // Only update if the data actually changed to prevent unnecessary re-renders
          setTodaysFoods(prev => {
            const prevIds = new Set(prev.map((f: any) => typeof f.id === 'number' ? f.id : Number(f.id)));
            const newIds = new Set(deduped.map((f: any) => typeof f.id === 'number' ? f.id : Number(f.id)));
            const prevIdsArray = Array.from(prevIds);
            const idsMatch = prevIds.size === newIds.size && prevIdsArray.every(id => newIds.has(id));
            return idsMatch ? prev : deduped;
          });
        } else {
          // For past dates, set historyFoods
          setHistoryFoods(deduped);
        }
        // Mark as loaded once data is set from context
        setFoodDiaryLoaded(true);
        
        // 🛡️ GUARD RAIL: Database Verification (REQUIRED - DO NOT REMOVE)
        // CRITICAL: Always verify cached entries against database to catch entries that might have been
        // saved but filtered out due to missing/incorrect localDate. This ensures we don't lose entries
        // that exist in FoodLog but not in cache. This verification step prevents the "missing entries"
        // bug that occurred on Jan 19, 2025. See GUARD_RAILS.md section 3 for details.
        (async () => {
          try {
            const tz = new Date().getTimezoneOffset();
            const res = await fetch(`/api/food-log?date=${selectedDate}&tz=${tz}`);
            if (res.ok) {
              const json = await res.json();
              const logs = Array.isArray(json.logs) ? json.logs : [];
              
              // Check if database has entries that aren't in our cached list
              const cachedIds = new Set(deduped.map((f: any) => {
                const id = typeof f.id === 'number' ? f.id : Number(f.id);
                return id;
              }));
              
              // Also enrich existing cached entries with dbId from database
              // This ensures delete functionality works even for cached entries
              const enrichedCached = deduped.map((cachedEntry: any) => {
                const cachedId = typeof cachedEntry.id === 'number' ? cachedEntry.id : Number(cachedEntry.id);
                // Find matching database entry by timestamp
                const dbEntry = logs.find((l: any) => {
                  const logId = new Date(l.createdAt).getTime();
                  return logId === cachedId;
                });
                // If we found a match and cached entry doesn't have dbId, add it
                if (dbEntry && !cachedEntry.dbId) {
                  return { ...cachedEntry, dbId: dbEntry.id };
                }
                return cachedEntry;
              });
              
              const missingEntries = logs.filter((l: any) => {
                const logId = new Date(l.createdAt).getTime();
                return !cachedIds.has(logId);
              });
              
              if (missingEntries.length > 0 || enrichedCached.some((e: any, i: number) => e.dbId !== deduped[i]?.dbId)) {
                console.log('⚠️ Found entries in database that were missing from cache:', missingEntries.length);
                const mappedMissing = missingEntries.map((l: any) => ({
                  id: new Date(l.createdAt).getTime(),
                  dbId: l.id,
                  description: l.description || l.name,
                  time: new Date(l.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                  method: l.imageUrl ? 'photo' : 'text',
                  photo: l.imageUrl || null,
                  nutrition: l.nutrients || null,
                  items: (l as any).items || (l.nutrients as any)?.items || null,
                  localDate: (l as any).localDate || selectedDate,
                }));
                
                // Merge missing entries with enriched cached entries
                const merged = [...mappedMissing, ...enrichedCached];
                // Update the appropriate state based on whether we're viewing today or a past date
                if (isViewingToday) {
                  setTodaysFoods(merged);
                } else {
                  setHistoryFoods(merged);
                }
                
                // Update cache with merged data (including dbId for future loads)
                try {
                  fetch('/api/user-data', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ todaysFoods: merged, appendHistory: false })
                  }).catch(() => {})
                } catch {}
              } else if (enrichedCached.length > 0) {
                // Even if no missing entries, update with enriched dbIds
                if (isViewingToday) {
                  setTodaysFoods(enrichedCached);
                } else {
                  setHistoryFoods(enrichedCached);
                }
              }
            }
          } catch (error) {
            console.error('Error verifying entries from database:', error);
          }
        })();
      } else {
        // Fallback: if provider cache is empty or filtered out, load from food-log API for the selected date
        (async () => {
          try {
            const tz = new Date().getTimezoneOffset();
            const res = await fetch(`/api/food-log?date=${selectedDate}&tz=${tz}`);
            if (res.ok) {
              const json = await res.json();
              const logs = Array.isArray(json.logs) ? json.logs : [];
              const mapped = logs.map((l: any) => ({
                id: new Date(l.createdAt).getTime(),
                dbId: l.id,
                description: l.description || l.name,
                time: new Date(l.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                method: l.imageUrl ? 'photo' : 'text',
                photo: l.imageUrl || null,
                nutrition: l.nutrients || null,
                items: (l as any).items || (l.nutrients as any)?.items || null,
                // Prefer explicit localDate from the server when present
                localDate: (l as any).localDate || selectedDate,
              }));
              if (mapped.length > 0) {
                // Update the appropriate state based on whether we're viewing today or a past date
                if (isViewingToday) {
                  setTodaysFoods(mapped);
                } else {
                  setHistoryFoods(mapped);
                }
                // Persist localDate back to user data for stability
                try {
                  fetch('/api/user-data', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ todaysFoods: mapped, appendHistory: false })
                  }).catch(() => {})
                } catch {}
              } else {
                // Secondary fallback: load from /api/user-data directly and pull todaysFoods
                try {
                  const ud = await fetch('/api/user-data', { cache: 'no-store' }).then(r => r.ok ? r.json() : null);
                  const tf = Array.isArray(ud?.todaysFoods) ? ud.todaysFoods : [];
                  const byDate = tf.filter((item: any) => {
                    if (typeof item?.localDate === 'string') return item.localDate === selectedDate
                    try {
                      const d = new Date(typeof item.id === 'number' ? item.id : Number(item.id))
                      const y = d.getFullYear()
                      const m = String(d.getMonth() + 1).padStart(2, '0')
                      const day = String(d.getDate()).padStart(2, '0')
                      return `${y}-${m}-${day}` === selectedDate
                    } catch {
                      return false
                    }
                  })
                  if (byDate.length > 0) {
                    // Update the appropriate state based on whether we're viewing today or a past date
                    if (isViewingToday) {
                      setTodaysFoods(byDate);
                    } else {
                      setHistoryFoods(byDate);
                    }
                    // Persist localDate back to user data so future loads are stable
                    try {
                      fetch('/api/user-data', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ todaysFoods: byDate, appendHistory: false })
                      }).catch(() => {})
                    } catch {}
                  }
                } catch {}
              }
              // Mark as loaded after fallback attempts complete
              setFoodDiaryLoaded(true);
            } else {
              // Mark as loaded even if API call fails
              setFoodDiaryLoaded(true);
            }
          } catch {
            // Mark as loaded even on error to prevent infinite loading state
            setFoodDiaryLoaded(true);
          }
        })();
      }
    } else if (isViewingToday) {
      // If no cached data, load directly from database
      (async () => {
        try {
          const tz = new Date().getTimezoneOffset();
          const res = await fetch(`/api/food-log?date=${selectedDate}&tz=${tz}`);
          if (res.ok) {
            const json = await res.json();
            const logs = Array.isArray(json.logs) ? json.logs : [];
            const mapped = logs.map((l: any) => ({
              id: new Date(l.createdAt).getTime(),
              dbId: l.id,
              description: l.description || l.name,
              time: new Date(l.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              method: l.imageUrl ? 'photo' : 'text',
              photo: l.imageUrl || null,
              nutrition: l.nutrients || null,
              items: (l as any).items || (l.nutrients as any)?.items || null,
              localDate: (l as any).localDate || selectedDate,
            }));
            if (mapped.length > 0) {
              // Update the appropriate state based on whether we're viewing today or a past date
              if (isViewingToday) {
                setTodaysFoods(mapped);
              } else {
                setHistoryFoods(mapped);
              }
              // Persist localDate back to user data for stability
              try {
                fetch('/api/user-data', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ todaysFoods: mapped, appendHistory: false })
                }).catch(() => {})
              } catch {}
            }
            // Mark as loaded after database load completes (even if no entries)
            setFoodDiaryLoaded(true);
          } else {
            // Mark as loaded even if API call fails
            setFoodDiaryLoaded(true);
          }
        } catch (error) {
          console.error('Error loading food entries:', error);
          // Mark as loaded even on error to prevent infinite loading state
          setFoodDiaryLoaded(true);
        }
      })();
    }
    // Note: For non-today dates, history loading is handled by the separate useEffect below
    // Don't set foodDiaryLoaded here - let the history useEffect handle it
  }, [userData, isViewingToday, selectedDate]);

  // Auto-rebuild ingredient cards from aiDescription when needed
  useEffect(() => {
    if (!aiDescription) return
    if (analyzedItems && analyzedItems.length > 0) return
    const allowTextFallback = editingEntry ? !editingEntry?.nutrition : true
    applyStructuredItems(null, null, aiDescription, { allowTextFallback })
  }, [aiDescription, analyzedItems, editingEntry])

  // Reset USDA fallback attempt when starting a fresh analysis session
  useEffect(() => {
    usdaFallbackAttemptedRef.current = false
  }, [aiDescription, analysisPhase])

  // USDA fallback: if an item has no meaningful macros, try a one-shot USDA lookup to fill them.
  useEffect(() => {
    if (usdaFallbackAttemptedRef.current) return
    if (!analyzedItems || analyzedItems.length === 0) return

    const needsMacros = (it: any) => {
      const cals = Number(it?.calories)
      const protein = Number(it?.protein_g)
      const carbs = Number(it?.carbs_g)
      const fat = Number(it?.fat_g)
      const hasAny =
        (Number.isFinite(cals) && cals > 0) ||
        (Number.isFinite(protein) && protein > 0) ||
        (Number.isFinite(carbs) && carbs > 0) ||
        (Number.isFinite(fat) && fat > 0)
      return !hasAny
    }

    const indexesNeeding = analyzedItems
      .map((it, idx) => (needsMacros(it) && (it?.name || '').trim().length >= 3 ? idx : -1))
      .filter((idx) => idx >= 0)
    if (!indexesNeeding.length) return

    usdaFallbackAttemptedRef.current = true

    ;(async () => {
      try {
        const updated = [...analyzedItems]
        let changed = false
        for (const idx of indexesNeeding) {
          const name = (updated[idx]?.name || '').trim()
          if (!name) continue
          const cacheKey = normalizeFoodName(name)
          if (usdaCacheRef.current.has(cacheKey)) {
            const cached = usdaCacheRef.current.get(cacheKey)
            if (cached) {
              const next = { ...updated[idx] }
              const macros = ['calories', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'sugar_g'] as const
              macros.forEach((m) => {
                if (Number.isFinite(Number(cached[m]))) {
                  next[m] = Number(cached[m])
                }
              })
              if (!next.serving_size && cached.serving_size) {
                next.serving_size = cached.serving_size
              }
              updated[idx] = next
              changed = true
              continue
            }
          }
          const params = new URLSearchParams({
            source: 'usda',
            q: name,
            kind: 'single',
          })
          const res = await fetch(`/api/food-data?${params.toString()}`, { method: 'GET' })
          if (!res.ok) continue
          const data = await res.json()
          const hit = Array.isArray(data.items) && data.items.length > 0 ? data.items[0] : null
          if (!hit) continue
          const macros = ['calories', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'sugar_g'] as const
          const hasHitMacros = macros.some((m) => Number(hit[m]) > 0)
          if (!hasHitMacros) continue
          const next = { ...updated[idx] }
          macros.forEach((m) => {
            if (Number.isFinite(Number(hit[m]))) {
              next[m] = Number(hit[m])
            }
          })
          if (!next.serving_size && hit.serving_size) {
            next.serving_size = hit.serving_size
          }
          usdaCacheRef.current.set(cacheKey, hit)
          updated[idx] = next
          changed = true
        }
        if (changed) {
          setAnalyzedItems(updated)
          applyRecalculatedNutrition(updated)
          if (editingEntry) {
            try {
              const updatedNutrition = recalculateNutritionFromItems(updated)
              const refreshed = {
                ...editingEntry,
                items: updated,
                nutrition: updatedNutrition,
                total: convertTotalsForStorage(updatedNutrition),
              }
              setEditingEntry(refreshed)
              setTodaysFoods((prev: any[]) =>
                prev.map((f: any) => (f.id === editingEntry.id ? refreshed : f)),
              )
            } catch {}
          }
        }
      } catch (err) {
        console.warn('USDA fallback lookup failed:', err)
      }
    })()
  }, [analyzedItems, editingEntry, analysisPhase])

  // Load history for non-today dates
  useEffect(() => {
    const loadHistory = async () => {
      if (isViewingToday) {
        setHistoryFoods(null);
        setFoodDiaryLoaded(true); // Already loaded via today's foods
        return;
      }
      try {
        console.log(`🔍 Loading history for date: ${selectedDate}, isViewingToday: ${isViewingToday}`);
        setIsLoadingHistory(true);
        setFoodDiaryLoaded(false); // Reset loading state when switching dates
        const tz = new Date().getTimezoneOffset();
        const apiUrl = `/api/food-log?date=${selectedDate}&tz=${tz}`;
        console.log(`📡 Fetching from API: ${apiUrl}`);
        const res = await fetch(apiUrl);
        console.log(`📡 API response status: ${res.status}, ok: ${res.ok}`);
        if (res.ok) {
          const json = await res.json()
          console.log(`📦 API response data:`, { 
            success: json.success, 
            logsCount: Array.isArray(json.logs) ? json.logs.length : 0,
            logs: Array.isArray(json.logs) ? json.logs.map((l: any) => ({
              id: l.id,
              name: l.name?.substring(0, 30),
              localDate: l.localDate,
              createdAt: l.createdAt
            })) : []
          });
          const logs = Array.isArray(json.logs) ? json.logs : []

          const mapped = logs.map((l: any) => ({
            id: new Date(l.createdAt).getTime(), // UI key and sorting by timestamp
            dbId: l.id, // actual database id for delete operations
            description: l.description || l.name,
            time: new Date(l.createdAt).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            }),
            method: l.imageUrl ? 'photo' : 'text',
            photo: l.imageUrl || null,
            nutrition: l.nutrients || null,
            items: (l as any).items || (l.nutrients as any)?.items || null,
            localDate: (l as any).localDate || selectedDate,
          }))

          // De‑duplicate any accidental duplicate rows (e.g. from multiple
          // history append paths) so the user only sees one copy of each meal.
          const seen = new Set<string>()
          const deduped: any[] = []
          for (const entry of mapped) {
            const key = [
              entry.localDate,
              entry.description,
              entry.time,
              entry.photo || '',
            ]
              .join('|')
              .toLowerCase()
            if (!seen.has(key)) {
              seen.add(key)
              deduped.push(entry)
            }
          }

          console.log(`✅ Setting historyFoods with ${deduped.length} entries for date ${selectedDate}`);
          setHistoryFoods(deduped)
          // Mark as loaded after history load completes
          setFoodDiaryLoaded(true);
        } else {
          console.log(`⚠️ API call failed or returned no entries for date ${selectedDate}, status: ${res.status}`);
          setHistoryFoods([]);
          // Mark as loaded even if API call fails or returns no entries
          setFoodDiaryLoaded(true);
        }
      } catch (e) {
        console.error(`❌ Error loading history for date ${selectedDate}:`, e);
        setHistoryFoods([]);
        // Mark as loaded even on error to prevent infinite loading state
        setFoodDiaryLoaded(true);
      } finally {
        setIsLoadingHistory(false);
      }
    };
    loadHistory();
  }, [selectedDate, isViewingToday]);

  // Save food entries to database and update context (OPTIMIZED + RELIABLE HISTORY)
  const saveFoodEntries = async (updatedFoods: any[], options?: { appendHistory?: boolean }) => {
    try {
      // 1) Deduplicate before updating context to prevent duplicates
      const seenIds = new Set<number>();
      const dedupedFoods = updatedFoods.filter((food: any) => {
        const id = typeof food.id === 'number' ? food.id : Number(food.id);
        if (seenIds.has(id)) {
          console.log('⚠️ Duplicate entry detected in saveFoodEntries, removing:', id);
          return false;
        }
        seenIds.add(id);
        return true;
      });
      
      // 2) Update context immediately for instant UI updates (with deduplicated array)
      updateUserData({ todaysFoods: dedupedFoods })
      console.log('🚀 PERFORMANCE: Food updated in cache instantly - UI responsive!', {
        originalCount: updatedFoods.length,
        dedupedCount: dedupedFoods.length
      })

      // We only want to create a new history row when this save represents
      // a *new* entry (not edits or deletes). Callers pass appendHistory: false
      // for edits/deletes.
      const appendHistory = options?.appendHistory !== false

      // Determine the localDate for logging and saving
      const latest = Array.isArray(updatedFoods) && updatedFoods.length > 0 ? updatedFoods[0] : null
      const targetLocalDate = latest && typeof latest?.localDate === 'string' && latest.localDate.length >= 8
        ? latest.localDate
        : selectedDate

      console.log('📝 saveFoodEntries called:', {
        entryCount: dedupedFoods.length,
        originalCount: updatedFoods.length,
        appendHistory,
        selectedDate,
        latestLocalDate: latest?.localDate,
        targetLocalDate,
        hasDescription: !!latest?.description,
        hasNutrition: !!latest?.nutrition,
        hasItems: Array.isArray(latest?.items) && latest.items.length > 0,
      })

      // 2) Persist today's foods snapshot (fast "today" view) via /api/user-data.
      //    We send appendHistory: false here so this endpoint does NOT try to create
      //    FoodLog rows itself. History writes are handled exclusively by the
      //    dedicated /api/food-log endpoint below to avoid conflicts.
      try {
        const userDataResponse = await fetch('/api/user-data', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            todaysFoods: dedupedFoods, // Use deduplicated array
            appendHistory: false, // Always false - we handle FoodLog separately
          }),
        })

        if (!userDataResponse.ok) {
          const errorText = await userDataResponse.text()
          console.error('❌ Failed to save todaysFoods snapshot:', {
            status: userDataResponse.status,
            statusText: userDataResponse.statusText,
            error: errorText,
          })
        } else {
          console.log('✅ Saved todaysFoods snapshot successfully')
        }
      } catch (userDataError) {
        console.error('❌ Error saving todaysFoods snapshot:', userDataError)
      }

      // 3) For brand new entries, write directly into the permanent FoodLog
      //    history table via /api/food-log. This is the SINGLE SOURCE OF TRUTH
      //    for history view (and "yesterday" after midnight).
      if (appendHistory && latest) {
        try {
          const payload = {
            description: (latest?.description || '').toString(),
            nutrition: latest?.nutrition || null,
            imageUrl: latest?.photo || null,
            items: Array.isArray(latest?.items) && latest.items.length > 0 ? latest.items : null,
            // Always pin to the calendar date the user was viewing when they saved
            localDate: targetLocalDate,
          }

          console.log('📤 Sending FoodLog POST request:', {
            localDate: payload.localDate,
            descriptionLength: payload.description.length,
            hasNutrition: !!payload.nutrition,
            hasImageUrl: !!payload.imageUrl,
            itemCount: Array.isArray(payload.items) ? payload.items.length : 0,
          })

          const res = await fetch('/api/food-log', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
          })

          if (!res.ok) {
            const errorText = await res.text()
            console.error('❌ Failed to save entry to FoodLog:', {
              status: res.status,
              statusText: res.statusText,
              error: errorText,
              payload: {
                localDate: payload.localDate,
                descriptionPreview: payload.description.substring(0, 50),
              },
            })
          } else {
            const result = await res.json().catch(() => ({}))
            console.log('✅ Successfully saved entry to FoodLog:', {
              localDate: payload.localDate,
              foodLogId: result.id,
              descriptionPreview: payload.description.substring(0, 50),
            })
          }
        } catch (historyError) {
          console.error('❌ Exception while saving to FoodLog:', {
            error: historyError,
            message: historyError instanceof Error ? historyError.message : String(historyError),
            stack: historyError instanceof Error ? historyError.stack : undefined,
            targetLocalDate,
          })
        }
      } else {
        console.log('ℹ️ Skipping FoodLog save (appendHistory=false or no latest entry)')
      }

      // 4) Show a brief visual confirmation
      try {
        setShowSavedToast(true)
        setTimeout(() => setShowSavedToast(false), 1500)
      } catch {}
    } catch (error) {
      console.error('❌ Fatal error in saveFoodEntries:', {
        error,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })
    }
  }

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        // Compress the uploaded file to balance quality and cost (higher quality for better detection)
        const compressedFile = await compressImage(file, 1024, 0.85);
        setPhotoFile(compressedFile);
        const reader = new FileReader();
        reader.onload = (e) => setPhotoPreview(e.target?.result as string);
        reader.readAsDataURL(compressedFile);
      } catch (error) {
        console.error('Error compressing image:', error);
        // Fallback to original file if compression fails
        setPhotoFile(file);
        const reader = new FileReader();
        reader.onload = (e) => setPhotoPreview(e.target?.result as string);
        reader.readAsDataURL(file);
      }
      setShowAddFood(true);
      setShowAiResult(false);
    }
  };



  // OPTIMIZED: Ultra-aggressive compression for speed
  const compressImage = (file: File, maxWidth: number = 300, quality: number = 0.5): Promise<File> => {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = document.createElement('img');
      
      if (!ctx) {
        reject(new Error('Cannot get canvas context'));
        return;
      }
      
      img.onload = () => {
        // Calculate new dimensions - smaller for faster loading
        const ratio = Math.min(maxWidth / img.width, maxWidth / img.height);
        const newWidth = img.width * ratio;
        const newHeight = img.height * ratio;
        
        // Set canvas size
        canvas.width = newWidth;
        canvas.height = newHeight;
        
        // Draw and compress
        ctx.drawImage(img, 0, 0, newWidth, newHeight);
        
        canvas.toBlob((blob) => {
          if (blob) {
            const compressedFile = new File([blob], file.name, {
              type: 'image/jpeg',
              lastModified: Date.now(),
            });
            console.log(`Image compressed: ${file.size} → ${blob.size} bytes (${Math.round((1 - blob.size/file.size) * 100)}% reduction)`);
            resolve(compressedFile);
          } else {
            reject(new Error('Failed to compress image'));
          }
        }, 'image/jpeg', quality);
        
        // Clean up
        URL.revokeObjectURL(img.src);
      };
      
      img.onerror = () => {
        URL.revokeObjectURL(img.src);
        reject(new Error('Failed to load image'));
      };
      img.src = URL.createObjectURL(file);
    });
  };

  const extractNutritionData = (description: string): NutritionTotals => {
    const caloriesMatch = description.match(/calories?[:\s]*(\d+(?:\.\d+)?)/i)
    const proteinMatch = description.match(/protein[:\s]*(\d+(?:\.\d+)?)\s*g/i)
    const carbsMatch = description.match(/carb(?:ohydrate)?s?[:\s]*(\d+(?:\.\d+)?)\s*g/i)
    const fatMatch = description.match(/fat[:\s]*(\d+(?:\.\d+)?)\s*g/i)
    const fiberMatch = description.match(/fiber[:\s]*(\d+(?:\.\d+)?)\s*g/i)
    const sugarMatch = description.match(/sugar[:\s]*(\d+(?:\.\d+)?)\s*g/i)

    const toNumber = (match: RegExpMatchArray | null, fallback: number | null = null) => {
      if (!match) return fallback
      const value = parseFloat(match[1])
      return Number.isFinite(value) ? value : fallback
    }

    return {
      calories: toNumber(caloriesMatch),
      protein: toNumber(proteinMatch),
      carbs: toNumber(carbsMatch),
      fat: toNumber(fatMatch),
      fiber: toNumber(fiberMatch),
      sugar: toNumber(sugarMatch),
    }
  }

  // Recalculate nutrition totals from items array (multiplying by servings)
  const recalculateNutritionFromItems = (items: any[]): NutritionTotals | null => {
    if (!items || items.length === 0) return null

    const totals = {
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      fiber: 0,
      sugar: 0,
    }

    items.forEach((item: any) => {
      const servings = item?.servings && Number.isFinite(item.servings) ? item.servings : 1
      totals.calories += (item.calories || 0) * servings
      totals.protein += (item.protein_g || 0) * servings
      totals.carbs += (item.carbs_g || 0) * servings
      totals.fat += (item.fat_g || 0) * servings
      totals.fiber += (item.fiber_g || 0) * servings
      totals.sugar += (item.sugar_g || 0) * servings
    })

    const round = (value: number, decimals = 1) => {
      const factor = Math.pow(10, decimals)
      return Math.round(value * factor) / factor
    }

    return {
      calories: Math.round(totals.calories),
      protein: round(totals.protein),
      carbs: round(totals.carbs),
      fat: round(totals.fat),
      fiber: totals.fiber > 0 ? round(totals.fiber) : null,
      sugar: totals.sugar > 0 ? round(totals.sugar) : null,
    }
  }

const convertTotalsForStorage = (totals: NutritionTotals | null | undefined) => {
  if (!totals) return null
  return {
    calories: totals.calories ?? null,
    protein_g: totals.protein ?? null,
    carbs_g: totals.carbs ?? null,
    fat_g: totals.fat ?? null,
    fiber_g: totals.fiber ?? null,
    sugar_g: totals.sugar ?? null,
  }
}

function sanitizeNutritionTotals(raw: any): NutritionTotals | null {
  if (!raw || typeof raw !== 'object') return null
  const toNumber = (value: any) => {
    if (value === null || value === undefined) return null
    const parsed = typeof value === 'string' ? parseFloat(value) : Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  const round = (value: number | null, decimals = 1, zeroAsNull = false) => {
    if (value === null) return null
    if (zeroAsNull && value <= 0) return null
    const factor = Math.pow(10, decimals)
    return Math.round(value * factor) / factor
  }

  const calories = toNumber(raw.calories ?? raw.kcal ?? raw.energy ?? raw.cal)
  const protein = toNumber(raw.protein ?? raw.protein_g)
  const carbs = toNumber(raw.carbs ?? raw.carbs_g)
  const fat = toNumber(raw.fat ?? raw.fat_g)
  const fiber = toNumber(raw.fiber ?? raw.fiber_g)
  const sugar = toNumber(raw.sugar ?? raw.sugar_g)

  const normalized: NutritionTotals = {
    calories: calories === null ? null : Math.round(calories),
    protein: round(protein, 1),
    carbs: round(carbs, 1),
    fat: round(fat, 1),
    fiber: round(fiber, 1, true),
    sugar: round(sugar, 1, true),
  }

  const hasValues = Object.values(normalized).some((value) => value !== null)
  return hasValues ? normalized : null
}

  const formatNutrientValue = (key: typeof NUTRIENT_DISPLAY_ORDER[number], value: number) => {
    const safeValue = Number.isFinite(value) ? value : 0
    if (key === 'calories') {
      return energyUnit === 'kJ'
        ? `${Math.round(safeValue * KCAL_TO_KJ)} kJ`
        : `${Math.round(safeValue)}`
    }
    const rounded = Math.round(safeValue * 10) / 10
    const unit = NUTRIENT_CARD_META[key]?.unit || ''
    return `${rounded}${unit}`
  }

  const analyzePhoto = async () => {
    if (!photoFile) return;
    
    setShowAnalysisModeModal(false);
    setIsAnalyzing(true);
    setAnalysisPhase('preparing');
    
    try {
      console.log('🔍 AGENT #6 DEBUG: Starting photo analysis...');
      console.log('📊 Original file:', { 
        name: photoFile.name, 
        size: photoFile.size, 
        type: photoFile.type 
      });
      
      // Step 1: Compress image (with better error handling)
      let compressedFile;
      try {
        compressedFile = await compressImage(photoFile, 800, 0.8); // Less aggressive compression
        console.log('✅ Image compression successful:', {
          originalSize: photoFile.size,
          compressedSize: compressedFile.size,
          reduction: Math.round((1 - compressedFile.size/photoFile.size) * 100) + '%'
        });
      } catch (compressionError) {
        console.warn('⚠️ Image compression failed, using original:', compressionError);
        compressedFile = photoFile; // Fallback to original file
      }
      
      // Step 2: Create FormData
      console.log('📤 Creating FormData for upload...');
      const formData = new FormData();
      formData.append('image', compressedFile);
      formData.append('analysisMode', analysisMode);
      console.log('✅ FormData created successfully');

      // Step 3: API call with detailed logging
      console.log('🌐 Calling API endpoint...');
      setAnalysisPhase('analyzing');
      const response = await fetch('/api/analyze-food', {
        method: 'POST',
        body: formData,
      });

      console.log('📥 API Response received:', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok
      });

      if (!response.ok) {
        // Handle payment required (402) with modal
        if (response.status === 402) {
          try {
            const errorData = await response.json();
            setCreditInfo({
              dailyUsed: 0,
              dailyLimit: 0,
              additionalCredits: errorData.additionalCredits ?? 0,
              plan: errorData.plan ?? 'FREE',
              creditCost: 1, // Food analysis costs 1 credit
              featureUsageToday: { foodAnalysis: 0, interactionAnalysis: 0 }
            });
            setShowCreditsModal(true);
            setAnalysisPhase('idle');
            setIsAnalyzing(false);
            return;
          } catch (parseError) {
            console.error('❌ Could not parse error response:', parseError);
          }
        }
        
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
          console.error('❌ API Error Details:', errorData);
        } catch (parseError) {
          console.error('❌ Could not parse error response:', parseError);
        }
        throw new Error(errorMessage);
      }

      // Step 4: Parse response
      const result = await response.json();
      console.log('📋 API Response Data:', {
        success: result.success,
        hasAnalysis: !!result.analysis,
        analysisPreview: result.analysis?.substring(0, 100) + '...'
      });
      
      if (result.success && result.analysis) {
        console.log('🎉 SUCCESS: Real AI analysis received!');
        setAnalysisPhase('building');
        setAiDescription(result.analysis);
        applyStructuredItems(result.items, result.total, result.analysis);
        // Set health warning and alternatives if present
        setHealthWarning(result.healthWarning || null);
        setHealthAlternatives(result.alternatives || null);
        setShowAiResult(true);
        // Trigger usage meter refresh after successful analysis
        setUsageMeterRefresh(prev => prev + 1);
        try { window.dispatchEvent(new Event('credits:refresh')); } catch {}
      } else {
        console.error('❌ Invalid API response format:', result);
        throw new Error('Invalid response format from AI service');
      }
    } catch (error) {
      console.error('💥 PHOTO ANALYSIS FAILED:', error);
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      console.error('🔍 Error details:', {
        message: errorMessage,
        name: error instanceof Error ? error.name : 'Unknown',
        stack: error instanceof Error ? error.stack?.substring(0, 200) : 'No stack trace'
      });
      
      // More specific error messages based on error type
      let fallbackMessage = `🤖 Photo analysis failed: ${errorMessage}`;
      
      if (errorMessage.includes('fetch')) {
        fallbackMessage = `🌐 Network error occurred while analyzing photo. Please check your connection and try again.`;
      } else if (errorMessage.includes('HTTP 401')) {
        fallbackMessage = `🔑 Authentication error. The AI service is temporarily unavailable.`;
      } else if (errorMessage.includes('HTTP 429')) {
        fallbackMessage = `⏰ AI service is busy. Please wait a moment and try again.`;
      } else if (errorMessage.includes('HTTP 5')) {
        fallbackMessage = `🛠️ Server error occurred. Please try again in a moment.`;
      }
      
      setAiDescription(fallbackMessage + `
      
Meanwhile, you can describe your food manually:
- What foods do you see?
- How was it prepared?
- Approximate portion size`);
      setAnalyzedNutrition(null);
      setShowAiResult(true);
    } finally {
      setIsAnalyzing(false);
      setAnalysisPhase('idle');
    }
  };

  const analyzeManualFood = async () => {
    // Validation for single food
    if (manualFoodType === 'single' && (!manualFoodName.trim() || !manualIngredients[0]?.weight?.trim())) return;
    
    // Validation for multiple ingredients
    if (manualFoodType === 'multiple' && manualIngredients.every(ing => !ing.name.trim() || !ing.weight.trim())) return;
    
    setIsAnalyzing(true);
    setAnalysisPhase('analyzing');
    
    try {
      console.log('🚀 PERFORMANCE: Starting fast text-based food analysis...');
      
      let foodDescription = '';
      
      if (manualFoodType === 'single') {
        const weight = manualIngredients[0]?.weight || '';
        const unit = manualIngredients[0]?.unit || 'g';
        foodDescription = `${manualFoodName}, ${weight} ${unit}`;
      } else {
        // Build description from multiple ingredients
        const validIngredients = manualIngredients.filter(ing => ing.name.trim() && ing.weight.trim());
        foodDescription = validIngredients.map(ing => `${ing.name}, ${ing.weight} ${ing.unit}`).join('; ');
      }
      
      console.log('🚀 PERFORMANCE: Analyzing text (faster than photo analysis)...');
      
      // Call OpenAI to analyze the manual food entry
      const response = await fetch('/api/analyze-food', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          textDescription: foodDescription,
          foodType: manualFoodType,
          analysisMode,
          // Strongly request structured items and multi-detect for best accuracy
          returnItems: true,
          multi: true,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to analyze food');
      }

      const result = await response.json();
      
      if (result.analysis) {
        setAnalysisPhase('building');
        setAiDescription(result.analysis);
        applyStructuredItems(result.items, result.total, result.analysis);
        // Set health warning and alternatives if present
        setHealthWarning(result.healthWarning || null);
        setHealthAlternatives(result.alternatives || null);
        setShowAiResult(true);
        
        // Clear manual form
        setManualFoodName('');
        setManualIngredients([{ name: '', weight: '', unit: 'g' }]);
        setManualFoodType('single');
        try { window.dispatchEvent(new Event('credits:refresh')); } catch {}
      } else {
        throw new Error('Invalid response from AI service');
      }
    } catch (error) {
      console.error('Error analyzing manual food:', error);
      
      // Fallback message
      setAiDescription(`🤖 AI analysis temporarily unavailable. 
      
${manualFoodType === 'single' ? manualFoodName : 'Multiple ingredients'}
Please add nutritional information manually if needed.`);
      setAnalyzedNutrition(null);
      setShowAiResult(true);
      
      // Clear manual form on fallback too
      setManualFoodName('');
      setManualIngredients([{ name: '', weight: '', unit: 'g' }]);
      setManualFoodType('single');
    } finally {
      setIsAnalyzing(false);
      setAnalysisPhase('idle');
    }
  };



  const addFoodEntry = async (description: string, method: 'text' | 'photo', nutrition?: any) => {
    // Prevent duplicate entries - check if this exact entry already exists
    const existingEntry = todaysFoods.find(food => 
      food.description === description && 
      food.method === method && 
      Math.abs(new Date().getTime() - food.id) < 5000 // Within 5 seconds
    );
    
    if (existingEntry) {
      console.log('Duplicate entry prevented');
      return;
    }

    // Prefer a clean natural-language summary from the AI analysis, falling
    // back to a structured summary from items only when needed.
    const baseFromAi = extractBaseMealDescription(description);
    const baseFromItems =
      analyzedItems && analyzedItems.length > 0 ? buildMealSummaryFromItems(analyzedItems) : '';
    const finalDescription = (baseFromAi || baseFromItems || description || '').trim();
    
    const newEntry = {
      id: Date.now(),
      localDate: selectedDate, // pin to the date the user is viewing when saving
      description: finalDescription,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      method,
      photo: method === 'photo' ? photoPreview : null,
      nutrition: nutrition || analyzedNutrition,
      items: analyzedItems && analyzedItems.length > 0 ? analyzedItems : null, // Store structured items
      total: analyzedTotal || null // Store total nutrition
    };
    
    // Prevent duplicates: check if entry with same ID already exists
    const existingById = todaysFoods.find(food => food.id === newEntry.id);
    if (existingById) {
      console.log('⚠️ Entry with same ID already exists, skipping duplicate');
      return;
    }
    
    const updatedFoods = [newEntry, ...todaysFoods]
    setTodaysFoods(updatedFoods)

    // If the user is viewing a non‑today date (e.g. yesterday), keep the
    // visible history list in sync so the new entry doesn't "disappear"
    // immediately after saving.
    if (!isViewingToday) {
      setHistoryFoods((prev: any[] | null) => {
        const base = Array.isArray(prev) ? prev : []
        const mapped = {
          id: newEntry.id,
          dbId: undefined,
          description: newEntry.description,
          time: newEntry.time,
          method: newEntry.method,
          photo: newEntry.photo,
          nutrition: newEntry.nutrition,
          items: newEntry.items,
          localDate: newEntry.localDate,
          total: newEntry.total || null,
        }
        return [mapped, ...base]
      })
    }

    // Save to database (this triggers background insight regeneration)
    setIsSavingEntry(true)
    try {
      await saveFoodEntries(updatedFoods)
      
      // Show subtle notification that insights are updating
      setInsightsNotification({
        show: true,
        message: 'Updating insights...',
        type: 'updating'
      });
      
      // After a delay, show that insights have been updated
      setTimeout(() => {
        setInsightsNotification({
          show: true,
          message: 'Insights updated',
          type: 'updated'
        });
        
        // Auto-hide after 3 seconds
        setTimeout(() => {
          setInsightsNotification(null);
        }, 3000);
      }, 2000);
      
      // Reset all form states
      resetAnalyzerPanel()
      setEditingEntry(null)
    } finally {
      setIsSavingEntry(false)
    }
  };

  // New function to update existing entries with AI re-analysis
  const updateFoodEntry = async () => {
    if (!editingEntry) return;

    const generatedSummary = buildMealSummaryFromItems(analyzedItems);
    const fallbackDescription = (editedDescription?.trim?.() || aiDescription || editingEntry.description || '').trim();
    const finalDescription = generatedSummary || fallbackDescription;

    const updatedEntry = {
      ...editingEntry,
      localDate: editingEntry.localDate || selectedDate,
      description: finalDescription,
      photo: photoPreview || editingEntry.photo,
      nutrition: analyzedNutrition || editingEntry.nutrition,
      items: analyzedItems && analyzedItems.length > 0 ? analyzedItems : (editingEntry.items || null),
      total: analyzedTotal || (editingEntry.total || null)
    };

    const updatedFoods = todaysFoods.map(food => 
      food.id === editingEntry.id ? updatedEntry : food
    );
    
    setIsSavingEntry(true)
    try {
      setTodaysFoods(updatedFoods);
      await saveFoodEntries(updatedFoods, { appendHistory: false });
      
      // Reset all form states
      resetAnalyzerPanel()
      setEditingEntry(null)
    } finally {
      setIsSavingEntry(false)
    }
  };

  const reanalyzeCurrentEntry = async () => {
    const descriptionToAnalyze = (editedDescription?.trim?.() || aiDescription || editingEntry?.description || '').trim();
    if (!descriptionToAnalyze) return;

    setIsAnalyzing(true);
    setAnalysisPhase('analyzing');
    try {
      const response = await fetch('/api/analyze-food', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          textDescription: descriptionToAnalyze,
          foodType: 'meal',
          isReanalysis: true,
          multi: true,
          returnItems: true
        }),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success && result.analysis) {
          setAnalysisPhase('building');
          setAiDescription(result.analysis);
          applyStructuredItems(result.items, result.total, result.analysis);
          setHealthWarning(result.healthWarning || null);
          setHealthAlternatives(result.alternatives || null);
          setUsageMeterRefresh(prev => prev + 1);
          try { window.dispatchEvent(new Event('credits:refresh')); } catch {}
        } else {
          console.error('Re-analysis failed:', result.error || 'Unknown error');
        }
      } else {
        console.error('API Error:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('Error re-analyzing food:', error);
    } finally {
      setIsAnalyzing(false);
      setAnalysisPhase('idle');
    }
  };

  const resetAnalyzerPanel = () => {
    setIsEditingDescription(false)
    setEditedDescription('')
    setPhotoFile(null)
    setPhotoPreview(null)
    setAiDescription('')
    setAnalyzedItems([])
    setAnalyzedNutrition(null)
    setAnalyzedTotal(null)
    setHealthWarning(null)
    setHealthAlternatives(null)
    setShowAiResult(false)
    setShowAddFood(false)
    setShowPhotoOptions(false)
  }

  const handleDeletePhoto = () => {
    // For new AI analyses, deleting the photo should behave like cancelling:
    // clear the analyzer state and return to the main Food Diary view.
    resetAnalyzerPanel()
  }

  const exitEditingSession = () => {
    resetAnalyzerPanel()
    setEditingEntry(null)
    setOriginalEditingEntry(null)
  }

  const revertEditingChanges = () => {
    if (!editingEntry || !originalEditingEntry) return null
    const restoredEntry = JSON.parse(JSON.stringify(originalEditingEntry))
    setAiDescription(restoredEntry.description || '')
    setPhotoPreview(restoredEntry.photo || null)
    const originalItems = Array.isArray(restoredEntry.items) ? restoredEntry.items : []
    setAnalyzedItems(originalItems)
    if (originalItems.length > 0) {
      applyRecalculatedNutrition(originalItems)
    } else {
      setAnalyzedNutrition(restoredEntry.nutrition || null)
      setAnalyzedTotal(restoredEntry.total || null)
    }
    setEditedDescription(extractBaseMealDescription(restoredEntry.description || ''))
    setEditingEntry(restoredEntry)
    setTodaysFoods(prev =>
      prev.map(food => (food.id === restoredEntry.id ? restoredEntry : food))
    )
    return restoredEntry
  }

  const handleCancelEditing = () => {
    const restored = revertEditingChanges()
    if (restored) {
      // Just exit session, don't toggle isEditingDescription manually
      // revertEditingChanges already manages state restoration
      setEditingEntry(null)
      setOriginalEditingEntry(null)
      
      // CRITICAL FIX: Ensure we return to main view properly
      // Don't call resetAnalyzerPanel() as it clears showAddFood which hides entries
      setIsEditingDescription(false)
      setShowAiResult(false)
      // Keep showAddFood as is - don't reset it to prevent entries from disappearing
      // Only reset analyzer-specific states
      setPhotoFile(null)
      setPhotoPreview(null)
      setAiDescription('')
      setAnalyzedItems([])
      setAnalyzedNutrition(null)
      setAnalyzedTotal(null)
      setHealthWarning(null)
      setHealthAlternatives(null)
      setShowPhotoOptions(false)
      // When cancelling an edit, close the add/edit panel so we return to the main diary view
      setShowAddFood(false)
    } else {
      // If no entry was being edited, just exit edit mode
      setIsEditingDescription(false)
      setEditingEntry(null)
      setOriginalEditingEntry(null)
      setShowAddFood(false)
    }
  }

  const handleDoneEditing = () => {
    try {
      // Try description-to-items sync before exiting edit mode
      if ((editedDescription || '').trim() && analyzedItems && analyzedItems.length > 0) {
        const indexes = computeItemsToRemoveFromDescription(analyzedItems, editedDescription)
        // Only prompt if we are clearly removing at least one full item
        if (indexes.length > 0) {
          const names = indexes
            .map((i) => analyzedItems[i]?.name)
            .filter(Boolean)
            .join(', ')
          const ok = typeof window !== 'undefined'
            ? window.confirm(`Remove ${indexes.length} item(s) that are no longer mentioned in the description?\n${names}`)
            : true
          if (ok) {
            removeItemsByIndex(
              analyzedItems,
              indexes,
              applyRecalculatedNutrition,
              setAnalyzedItems,
              editingEntry,
              setEditingEntry,
              setTodaysFoods,
            )
          }
        }
      }
    } catch {
      // non-blocking
    }
    // Exit edit session for existing entries; for new analyses, just return to analysis panel
    if (editingEntry) {
      exitEditingSession()
    } else {
      setIsEditingDescription(false)
      setShowAiResult(true)
      setShowAddFood(true)
    }
  }

  const handleEditDescriptionClick = () => {
    if (isEditingDescription) {
      setIsEditingDescription(false)
      return
    }
    if (editingEntry) {
      setEditedDescription((current) => current || extractBaseMealDescription(editingEntry.description || ''))
    } else {
      setEditedDescription(aiDescription || '')
    }
    setIsEditingDescription(true)
  }

  const editFood = (food: any) => {
    setEditingEntry(food);
    try {
      // Keep an immutable copy to enable "Cancel changes"
      setOriginalEditingEntry(JSON.parse(JSON.stringify(food)))
    } catch {
      setOriginalEditingEntry(food)
    }
    // Populate the form with existing data and go directly to editing
    if (food.method === 'photo') {
      // Clear all state first to ensure clean rebuild
      setAnalyzedItems([]);
      setAnalyzedNutrition(null);
      setAnalyzedTotal(null);
      setPhotoPreview(food.photo);
      // Set aiDescription AFTER clearing items so useEffect can rebuild
      setAiDescription(food.description || '');
      setAnalyzedNutrition(food.nutrition);
      
      // Try to restore items immediately (synchronous extraction)
      let itemsRestored = false;
      
      // First priority: use saved items if they exist and are valid
      if (food.items && Array.isArray(food.items) && food.items.length > 0) {
        const enriched = enrichItemsFromStarter(food.items)
        setAnalyzedItems(enriched);
        applyRecalculatedNutrition(enriched);
        itemsRestored = true;
      }
      
      // Second priority: extract from description text (try both JSON and prose)
      if (!itemsRestored && food.description) {
        // Try structured JSON extraction first
        const extracted = extractStructuredItemsFromAnalysis(food.description);
        if (extracted && Array.isArray(extracted.items) && extracted.items.length > 0) {
          const enriched = enrichItemsFromStarter(extracted.items)
          setAnalyzedItems(enriched);
          applyRecalculatedNutrition(enriched);
          itemsRestored = true;
        } else {
          // Try prose extraction as fallback
          const proseExtracted = extractItemsFromTextEstimates(food.description);
          if (proseExtracted && Array.isArray(proseExtracted.items) && proseExtracted.items.length > 0) {
            const enriched = enrichItemsFromStarter(proseExtracted.items);
            setAnalyzedItems(enriched);
            applyRecalculatedNutrition(enriched);
            itemsRestored = true;
          }
        }
      }
      
      // If nothing worked, set total nutrition at least
      if (!itemsRestored) {
        setAnalyzedTotal(food.total || null);
      }
      
      setShowAiResult(true);
      setShowAddFood(true);
      setIsEditingDescription(false);
      // Prefill description editor with a clean summary
      const cleanDescription = extractBaseMealDescription(food.description);
      setEditedDescription(cleanDescription);
    } else {
      // For manual entries, populate the manual form
      setManualFoodName(food.description);
      setManualFoodType('single');
      setShowAddFood(true);
    }
    setShowEntryOptions(null);
  };



  const deleteFood = async (foodId: number) => {
    // Find the entry being deleted to check if it has a database ID
    const entryToDelete = todaysFoods.find(food => food.id === foodId);
    const dbId = (entryToDelete as any)?.dbId;
    
    // If entry has a database ID, delete it from the database first
    if (dbId) {
      try {
        await fetch('/api/food-log/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: dbId }),
        }).then(async (r) => {
          if (!r.ok) {
            throw new Error('delete_failed')
          }
        });
      } catch (error) {
        console.error('Failed to delete entry from database:', error);
        // Continue with local deletion even if DB delete fails
      }
    }
    
    // Remove from local state and update cache
    const updatedFoods = todaysFoods.filter(food => food.id !== foodId);
    setTodaysFoods(updatedFoods);
    await saveFoodEntries(updatedFoods, { appendHistory: false });
    setShowEntryOptions(null);
  };

  const deleteHistoryFood = async (dbId: string) => {
    try {
      // Optimistic UI update
      setHistoryFoods((prev) => (prev || []).filter((f: any) => f.dbId !== dbId));
      // Call API to delete from DB
      await fetch('/api/food-log/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: dbId }),
      }).then(async (r) => {
        if (!r.ok) {
          throw new Error('delete_failed')
        }
      });
    } catch {
      // On error, reload history for the selected date
      try {
        const tz = new Date().getTimezoneOffset();
        const res = await fetch(`/api/food-log?date=${selectedDate}&tz=${tz}`);
        if (res.ok) {
          const json = await res.json();
          const logs = Array.isArray(json.logs) ? json.logs : [];
          const mapped = logs.map((l: any) => ({
            id: new Date(l.createdAt).getTime(),
            dbId: l.id,
            description: l.description || l.name,
            time: new Date(l.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            method: l.imageUrl ? 'photo' : 'text',
            photo: l.imageUrl || null,
            nutrition: l.nutrients || null,
            items: (l as any).items || (l.nutrients as any)?.items || null,
          }));
          setHistoryFoods(mapped);
        }
      } catch {}
    } finally {
      setShowEntryOptions(null);
    }
  };

  const addIngredient = () => {
    setManualIngredients([...manualIngredients, { name: '', weight: '', unit: 'g' }]);
  };

  const removeIngredient = (index: number) => {
    if (manualIngredients.length > 1) {
      setManualIngredients(manualIngredients.filter((_, i) => i !== index));
    }
  };

  const updateIngredient = (index: number, field: string, value: string) => {
    const updated = [...manualIngredients];
    updated[index] = { ...updated[index], [field]: value };
    setManualIngredients(updated);
  };

  const cancelManualEntry = () => {
    setShowAddFood(false);
    setManualFoodName('');
    setManualFoodType('single');
    setManualIngredients([{ name: '', weight: '', unit: 'g' }]);
    setEditingEntry(null);
  };

  // Toggle expanded state for food entries
  const toggleExpanded = (foodId: string) => {
    setExpandedEntries(prev => ({
      ...prev,
      [foodId]: !prev[foodId]
    }));
  };

  // Format time with AM/PM
  const formatTimeWithAMPM = (timeString: string) => {
    const [hours, minutes] = timeString.split(':');
    const hour24 = parseInt(hours);
    const hour12 = hour24 === 0 ? 12 : hour24 > 12 ? hour24 - 12 : hour24;
    const ampm = hour24 >= 12 ? 'PM' : 'AM';
    return `${hour12}:${minutes} ${ampm}`;
  };

  const mealSummary = useMemo(() => buildMealSummaryFromItems(analyzedItems), [analyzedItems])

  // Read-only Food Description content used for both desktop and mobile layouts.
  // IMPORTANT:
  // - `foodTitle` and `foodDescriptionText` MUST stay de-coupled from the raw AI string shape.
  // - Many agents have changed the OpenAI prompt over time; we intentionally *sanitize*
  //   the AI response so the user only sees a short, friendly description rather than
  //   the full technical breakdown, nutrition line, or ITEMS_JSON block.
  // - Do NOT switch this back to rendering the raw `aiDescription` string or you will
  //   expose internal formatting and confuse users.
  const foodTitle = useMemo(() => {
    if (mealSummary) return mealSummary;
    if (editingEntry?.description) return extractBaseMealDescription(editingEntry.description || '');
    if (aiDescription) return extractBaseMealDescription(aiDescription);
    return '';
  }, [mealSummary, editingEntry, aiDescription]);

  const foodDescriptionText = useMemo(() => {
    if (aiDescription && aiDescription.trim()) {
      const trimmed = aiDescription.trim();
      // If this looks like a successful AI analysis (contains nutrition/structured markers),
      // show only the base human-friendly description line. This prevents long technical
      // blocks from appearing in the UI while keeping the underlying `aiDescription`
      // intact for parsing and history.
      const looksLikeAnalysis =
        /Calories\s*:/i.test(trimmed) || /<ITEMS_JSON>/i.test(trimmed);
      if (looksLikeAnalysis) {
        const base = extractBaseMealDescription(trimmed);
        return base || trimmed;
      }
      // For non-analysis text (fallback or manual notes), show the full message.
      return trimmed;
    }
    if (editingEntry?.description) return editingEntry.description;
    return '';
  }, [aiDescription, editingEntry]);

  // Debug logging to track state changes
  useEffect(() => {
    console.log('🔍 State Debug:', {
      showAddFood,
      showAiResult,
      isEditingDescription,
      editingEntry: editingEntry ? 'exists' : 'null',
      todaysFoodsCount: todaysFoods.length
    });
  }, [showAddFood, showAiResult, isEditingDescription, editingEntry, todaysFoods.length]);

  useEffect(() => {
    const fetchCreditStatus = async () => {
      try {
        const res = await fetch(`/api/credit/status?t=${Date.now()}`, { cache: 'no-store' })
        if (res.ok) {
          const data = await res.json()
          const isPremium = data?.plan === 'PREMIUM'
          const hasWalletCredits =
            typeof data?.totalAvailableCents === 'number' && data.totalAvailableCents > 0
          const hasLegacyCredits =
            typeof data?.credits?.total === 'number' && data.credits.total > 0

          setHasPaidAccess(Boolean(isPremium || hasWalletCredits || hasLegacyCredits))
        }
      } catch {
        // ignore failures
      }
    }
    fetchCreditStatus()
  }, [usageMeterRefresh])

  useEffect(() => {
    if (!isEditingDescription) return;
    const textarea = descriptionTextareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  }, [isEditingDescription, editedDescription]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-gray-50">
      {/* Saved Toast (brief confirmation) */}
      {showSavedToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[10000]">
          <div className="px-4 py-2 bg-emerald-600 text-white rounded-full shadow-lg text-sm">
            Saved
          </div>
        </div>
      )}
      
      {/* Insights Update Notification - Subtle and non-intrusive */}
      {insightsNotification && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[10000] transition-opacity duration-300">
          <div className={`px-4 py-2 rounded-full shadow-lg text-sm flex items-center gap-2 ${
            insightsNotification.type === 'updating' 
              ? 'bg-blue-500 text-white' 
              : 'bg-green-500 text-white'
          }`}>
            {insightsNotification.type === 'updating' && (
              <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            )}
            {insightsNotification.type === 'updated' && (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            )}
            <span>{insightsNotification.message}</span>
          </div>
        </div>
      )}
      {/* Header - No back button (main nav item) */}
      <nav className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          {/* Page Title - Mobile only */}
          <h1 className="md:hidden flex-1 text-center text-lg font-semibold text-gray-900">Food Diary</h1>
          <div className="hidden md:block"></div>

          <div className="flex items-center gap-4">
            {/* Profile Avatar & Dropdown */}
            <div className="relative dropdown-container" id="profile-dropdown">
              <button
                onClick={() => setDropdownOpen((v) => !v)}
                className="focus:outline-none"
                aria-label="Open profile menu"
              >
                {hasProfileImage ? (
                  <Image
                    src={userImage}
                    alt="Profile"
                    width={40}
                    height={40}
                    className="w-10 h-10 rounded-full border-2 border-helfi-green shadow-sm object-cover"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-helfi-green shadow-sm flex items-center justify-center">
                    <UserIcon className="w-5 h-5 text-white" aria-hidden="true" />
                  </div>
                )}
              </button>
              {dropdownOpen && (
                <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-lg py-2 z-50 border border-gray-100 animate-fade-in">
                  <div className="flex items-center px-4 py-3 border-b border-gray-100">
                    {hasProfileImage ? (
                      <Image
                        src={userImage}
                        alt="Profile"
                        width={40}
                        height={40}
                        className="w-10 h-10 rounded-full object-cover mr-3"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-helfi-green flex items-center justify-center mr-3">
                        <UserIcon className="w-5 h-5 text-white" aria-hidden="true" />
                      </div>
                    )}
                    <div>
                      <div className="font-semibold text-gray-900">{userName}</div>
                      <div className="text-xs text-gray-500">{session?.user?.email || 'user@email.com'}</div>
                    </div>
                  </div>
                  <Link href="/profile" className="block px-4 py-2 text-gray-700 hover:bg-gray-50">Profile</Link>
                  <Link href="/account" className="block px-4 py-2 text-gray-700 hover:bg-gray-50">Account Settings</Link>
                  <Link href="/profile/image" className="block px-4 py-2 text-gray-700 hover:bg-gray-50">Upload/Change Profile Photo</Link>
                  <Link href="/billing" className="block px-4 py-2 text-gray-700 hover:bg-gray-50">Subscription & Billing</Link>
                  <Link href="/notifications" className="block px-4 py-2 text-gray-700 hover:bg-gray-50">Notifications</Link>
                  <Link href="/privacy" className="block px-4 py-2 text-gray-700 hover:bg-gray-50">Privacy Settings</Link>
                  <Link href="/support" className="block px-4 py-2 text-gray-700 hover:bg-gray-50">Help & Support</Link>
                  <div className="border-t border-gray-100 my-2"></div>
                  <Link href="/reports" className="block px-4 py-2 text-gray-700 hover:bg-gray-50">Reports</Link>
                  <button 
                    onClick={() => signOut({ callbackUrl: '/auth/signin' })}
                    className="block w-full text-left px-4 py-2 text-red-600 hover:bg-gray-50 font-semibold"
                  >
                    Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </nav>
      
      {/* Date selector */}
      <div className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => {
                const d = new Date(selectedDate);
                d.setDate(d.getDate() - 1);
                const y = d.getFullYear();
                const m = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                setSelectedDate(`${y}-${m}-${day}`);
              }}
              className="px-3 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm"
            >
              ◀︎ Previous
            </button>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1"
            />
            <button
              onClick={() => {
                const d = new Date(selectedDate);
                d.setDate(d.getDate() + 1);
                const y = d.getFullYear();
                const m = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                setSelectedDate(`${y}-${m}-${day}`);
              }}
              className="px-3 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm"
            >
              Next ▶︎
            </button>
            {/* Removed Today button to avoid mixed date cues */}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1">
        <div className="max-w-4xl mx-auto px-3 sm:px-6 py-6 sm:py-8 pb-24 md:pb-8">
        
        {/* Instruction Text - Hidden during edit mode */}
        {!isEditingDescription && (
        <div className="mb-6 text-center">
          <p className="text-lg text-gray-600 font-normal">
            📸 Take a photo of your meal or snack and let AI analyze it!
          </p>
        </div>
        )}

        {/* Add Food Button - Hidden during edit mode */}
        {!isEditingDescription && (
        <div className="mb-6 relative add-food-entry-container">
          <button
            onClick={() => setShowPhotoOptions(!showPhotoOptions)}
            className="w-full bg-helfi-green text-white px-6 py-3 rounded-lg hover:bg-helfi-green/90 transition-colors font-medium flex items-center justify-center shadow-lg"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            Add Food Entry
            <svg className={`w-4 h-4 ml-2 transition-transform ${showPhotoOptions ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* Credits usage meter for Food Analysis (visible on initial load) */}
          <div className="mt-2">
            <UsageMeter inline={true} refreshTrigger={usageMeterRefresh} />
            <FeatureUsageDisplay featureName="foodAnalysis" featureLabel="Food Analysis" refreshTrigger={usageMeterRefresh} />
          </div>

          {/* Simplified Dropdown Options */}
          {showPhotoOptions && (
            <div className="food-options-dropdown absolute top-full left-0 right-0 mt-2 z-50">
              <div className="rounded-2xl shadow-2xl border border-gray-200 bg-white/90 backdrop-blur-xl overflow-hidden">
                <div className="divide-y divide-gray-100">
                  {/* Take Photo Option - Modern card */}
                  <button
                    className="w-full text-left flex items-center px-4 py-3 hover:bg-gray-50 transition-colors"
                    onClick={() => {
                      setPendingPhotoPicker(true);
                      setShowPhotoOptions(false);
                      setShowAnalysisModeModal(true);
                    }}
                  >
                    <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center mr-3 text-blue-600">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <div className="text-base font-semibold text-gray-900">Photo Library / Camera</div>
                      <div className="text-xs text-gray-500">Capture or pick a photo of your food</div>
                    </div>
                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>

                  {/* Manual Entry Option */}
                  <button
                    onClick={() => {
                      setShowPhotoOptions(false);
                      setShowAddFood(true);
                    }}
                    className="w-full text-left flex items-center px-4 py-3 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center mr-3 text-green-600">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <div className="text-base font-semibold text-gray-900">Manual Entry</div>
                      <div className="text-xs text-gray-500">Type your food description</div>
                    </div>
                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
        )}

        {/* Hidden photo input for controlled picker */}
        <input
          ref={selectPhotoInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            handlePhotoUpload(e);
            setPendingPhotoPicker(false);
          }}
        />

        {/* Mode chooser modal immediately after photo selection */}
        {showAnalysisModeModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <div className="absolute inset-0 bg-black/50" onClick={() => setShowAnalysisModeModal(false)} />
            <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-gray-200 p-5 space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-lg font-semibold text-gray-900">Choose analysis mode</div>
                  <div className="text-sm text-gray-600">We’ll tailor the AI for this photo before analyzing.</div>
                </div>
                <button
                  onClick={() => setShowAnalysisModeModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <span aria-hidden>✕</span>
                </button>
              </div>
              <div className="grid grid-cols-1 gap-2">
                {[
                  { key: 'auto', label: 'Auto detect', helper: 'Best guess for meals and snacks' },
                  { key: 'packaged', label: 'Product nutrition image', helper: 'Photo of the nutrition facts panel' },
                  { key: 'meal', label: 'Homemade/restaurant', helper: 'Plated/restaurant foods' },
                ].map((mode) => {
                  const active = analysisMode === mode.key
                  return (
                    <button
                      key={mode.key}
                      type="button"
                      onClick={() => setAnalysisMode(mode.key as 'auto' | 'packaged' | 'meal')}
                      className={`flex flex-col items-start px-3 py-2 rounded-lg border text-left ${
                        active
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                          : 'border-gray-200 text-gray-700 hover:border-gray-300'
                      }`}
                    >
                      <span className="text-sm font-semibold">{mode.label}</span>
                      <span className="text-[11px] text-gray-500">{mode.helper}</span>
                    </button>
                  )
                })}
              </div>
              <div className="text-xs text-gray-600">
                Product nutrition image: take a clear photo of the nutrition facts panel. We’ll read the per-serving numbers.
              </div>
              {pendingPhotoPicker && (
                <button
                  onClick={() => {
                    setShowAnalysisModeModal(false);
                    setShowAddFood(true);
                    try { selectPhotoInputRef.current?.click(); } catch {}
                  }}
                  className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 font-semibold"
                >
                  Choose photo / camera
                </button>
              )}
              {photoPreview && (
                <button
                  onClick={analyzePhoto}
                  className="w-full bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 font-semibold"
                >
                  🤖 Analyze with AI
                </button>
              )}
            </div>
          </div>
        )}

                {/* Food Processing Area */}
        {showAddFood && (
          // Outer wrapper now has no extra background so the inner Food Analysis
          // card can stretch closer to the screen edges on mobile.
          <div className="mb-6">
            
            {/* Photo Analysis Flow */}
            {photoPreview && !showAiResult && !isEditingDescription && (
              <div className="text-center">
                <h3 className="text-lg font-semibold mb-4">📸 Your Photo</h3>
                <Image
                  src={photoPreview}
                  alt="Food preview"
                  width={300}
                  height={300}
                  className="w-full max-w-sm aspect-square object-cover rounded-lg mx-auto shadow-lg mb-6"
                />
                {/* Always-visible 3-step tracker so progress feels clear even when AI is slow */}
                <div className="mb-4">
                  <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4 text-[11px] sm:text-xs">
                    {[
                      { key: 'preparing' as const, label: 'Step 1 · Preparing photo' },
                      { key: 'analyzing' as const, label: 'Step 2 · AI analyzing' },
                      { key: 'building' as const, label: 'Step 3 · Building cards' },
                    ].map((step, index) => {
                      const isActive = isAnalyzing && analysisPhase === step.key
                      const isCompleted =
                        isAnalyzing &&
                        ((analysisPhase === 'analyzing' && index === 0) ||
                          (analysisPhase === 'building' && index < 2))
                      const dotClass = isActive
                        ? 'bg-purple-600'
                        : isCompleted
                        ? 'bg-purple-300'
                        : 'bg-gray-300'
                      const textClass = isActive
                        ? 'text-purple-700 font-medium'
                        : 'text-gray-500'
                      
                      return (
                        <div key={step.key} className="flex items-center gap-1.5">
                          <span className={`h-2.5 w-2.5 rounded-full ${dotClass}`} />
                          <span className={textClass}>{step.label}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {[
                      { key: 'auto', label: 'Auto detect', helper: 'Use visual cues' },
                      { key: 'packaged', label: 'Product nutrition image', helper: 'Photo of nutrition facts panel' },
                      { key: 'meal', label: 'Homemade/restaurant', helper: 'Plate/meal focus' },
                    ].map((mode) => {
                      const active = analysisMode === mode.key
                      return (
                        <button
                          key={mode.key}
                          type="button"
                          onClick={() => setAnalysisMode(mode.key as 'auto' | 'packaged' | 'meal')}
                          className={`flex flex-col items-start px-3 py-2 rounded-lg border text-left ${
                            active
                              ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                              : 'border-gray-200 text-gray-700 hover:border-gray-300'
                          }`}
                        >
                          <span className="text-sm font-semibold">{mode.label}</span>
                          <span className="text-[11px] text-gray-500">{mode.helper}</span>
                        </button>
                      )
                    })}
                  </div>
                  <div className="text-xs text-gray-600">
                    Packaged label mode reads the per-serving column exactly (ignores per-100g). Barcode mode will try barcode APIs first, then fall back to the label.
                  </div>
                  <button
                    onClick={analyzePhoto}
                    disabled={isAnalyzing}
                    className="w-full px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 font-semibold"
                  >
                    {isAnalyzing ? (
                      <div className="flex items-center justify-center">
                        <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        {analysisPhase === 'preparing'
                          ? 'Step 1 of 3: Preparing your photo...'
                          : analysisPhase === 'analyzing'
                            ? 'Step 2 of 3: AI is analyzing your food...'
                            : 'Step 3 of 3: Building ingredient cards...'}
                      </div>
                    ) : (
                      '🤖 Analyze with AI'
                    )}
                  </button>
                  <div className="mt-2">
                    <p className="text-xs text-gray-500 text-center mb-2">Typical cost: 6–8 credits (varies by photo + health checks)</p>
                    {!hasPaidAccess && (
                      <div className="text-[11px] text-blue-800 bg-blue-50 border border-blue-200 rounded px-2 py-1 mb-2 text-center">
                        Free accounts can try this AI feature once. After your free analysis, upgrade or buy credits to continue.
                      </div>
                    )}
                    <UsageMeter inline={true} refreshTrigger={usageMeterRefresh} />
                    <FeatureUsageDisplay featureName="foodAnalysis" featureLabel="Food Analysis" refreshTrigger={usageMeterRefresh} />
                  </div>
                  
                  {/* Photo Management Options */}
                  <div className="flex gap-3">
                    <label className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-center cursor-pointer text-sm font-medium">
                      📷 Change Photo
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          handlePhotoUpload(e);
                          setShowAddFood(true); // 🔥 FIX: Ensure photo processing UI stays visible
                        }}
                        className="hidden"
                      />
                    </label>
                    <button
                      onClick={() => {
                        setPhotoFile(null);
                        setPhotoPreview(null);
                        setShowAddFood(false);
                      }}
                      className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors text-sm font-medium"
                    >
                      🗑️ Delete Photo
                    </button>
                  </div>
                </div>
                <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <p className="text-yellow-800 text-sm">
                    💡 <strong>Tip:</strong> Our AI will identify the food and provide nutritional information!
                  </p>
                </div>
              </div>
            )}

            {/* AI Analysis Result - Premium Cronometer-style UI */}
            {showAiResult && (
              <div className="bg-white rounded-2xl shadow-lg border border-gray-100">
                {/* Photo Section - full width image for mobile / non-editing.
                    When editing an entry, clicking the image lets you change the photo. */}
                {photoPreview && (
                  <div
                    className={`p-4 border-b border-gray-100 flex justify-center ${
                      editingEntry ? 'lg:hidden' : ''
                    }`}
                  >
                    <div
                      className={`relative w-full ${editingEntry ? 'cursor-pointer group' : ''}`}
                      onClick={() => {
                        if (editingEntry && editPhotoInputRef.current) {
                          editPhotoInputRef.current.click()
                        }
                      }}
                    >
                      {foodImagesLoading[photoPreview] && (
                        <div className="absolute inset-0 bg-gray-100 rounded-xl flex items-center justify-center">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
                        </div>
                      )}
                      <Image
                        src={photoPreview}
                        alt="Analyzed food"
                        width={300}
                        height={200}
                        className={`w-full aspect-[4/3] object-cover rounded-xl transition-opacity duration-300 ${
                          foodImagesLoading[photoPreview] ? 'opacity-0' : 'opacity-100'
                        }`}
                        loading="eager"
                        priority
                        onLoad={() =>
                          setFoodImagesLoading((prev: Record<string, boolean>) => ({
                            ...prev,
                            [photoPreview]: false,
                          }))
                        }
                        onLoadStart={() =>
                          setFoodImagesLoading((prev: Record<string, boolean>) => ({
                            ...prev,
                            [photoPreview]: true,
                          }))
                        }
                      />
                      {editingEntry && (
                        <>
                          <div className="hidden lg:flex absolute inset-0 rounded-xl bg-black/20 items-center justify-center group-hover:bg-black/30 transition-colors pointer-events-none" />
                          <div className="hidden lg:flex absolute inset-0 items-center justify-center pointer-events-none">
                            <span className="px-3 py-1.5 rounded-full bg-white/90 text-xs font-medium text-gray-800 shadow-sm">
                              Click to change photo
                            </span>
                          </div>
                          <input
                            ref={editPhotoInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={async (e) => {
                              await handlePhotoUpload(e)
                              setShowAiResult(false)
                              setIsEditingDescription(false)
                            }}
                          />
                        </>
                      )}
                    </div>
                  </div>
                )}
                
                {/* Premium Nutrition Display */}
                <div className="p-4 sm:p-6">
                  {/* Title row with hard-right editing label */}
                  <div className="mb-2 flex items-baseline justify-between gap-2">
                    <h3 className="text-xl font-semibold text-gray-900">Food Analysis</h3>
                    {editingEntry && (
                      <span className="text-xs sm:text-sm text-gray-500 text-right">
                        Editing a saved entry
                      </span>
                    )}
                  </div>
                  {/* Compact controls row (aligned hard right) */}
                  {editingEntry && (
                    <div className="mb-4 flex items-center gap-2 justify-end">
                      <button
                        type="button"
                        onClick={() => updateFoodEntry()}
                        disabled={isAnalyzing || isSavingEntry}
                        className="px-3 py-1.5 rounded-full bg-emerald-500 text-white text-xs sm:text-sm font-medium shadow-sm hover:bg-emerald-600 disabled:opacity-60"
                      >
                        {isSavingEntry ? (
                          <span className="flex items-center gap-1.5">
                            <svg className="animate-spin h-3.5 w-3.5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Saving…
                          </span>
                        ) : (
                          'Save changes'
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={handleCancelEditing}
                        className="px-3 py-1.5 rounded-full bg-white text-gray-700 text-xs sm:text-sm font-medium border border-gray-300 hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                    </div>
                  )}

                  {/* Food Description - read-only summary (desktop & mobile) */}
                  {(foodTitle || foodDescriptionText) && (
                    <div className="mb-4 space-y-2">
                      <div className="block text-lg font-medium text-gray-900">
                        Food Description
                      </div>
                      {foodDescriptionText && (
                        <p className="text-sm sm:text-base text-gray-700 leading-relaxed whitespace-pre-wrap">
                          {foodDescriptionText}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Desktop-only compact photo + macro layout when editing an entry */}
                  {editingEntry && photoPreview && analyzedNutrition && (
                    <div className="hidden lg:block mb-6">
                      <div className="flex gap-6 items-start">
                        <div className="w-1/2 max-w-md">
                          {/* Clickable image area when editing – lets user change the photo */}
                          <div
                            className="relative rounded-2xl overflow-hidden border border-gray-100 bg-gray-50 cursor-pointer group"
                            onClick={() => {
                              if (editPhotoInputRef.current) {
                                editPhotoInputRef.current.click()
                              }
                            }}
                          >
                            <Image
                              src={photoPreview}
                              alt="Analyzed food"
                              width={420}
                              height={315}
                              className="w-full aspect-[4/3] object-cover transition-transform duration-200 group-hover:scale-[1.01]"
                            />
                            {/* Subtle dark overlay on hover */}
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                            {/* Change image pill button */}
                            <div className="absolute bottom-3 right-3">
                              <button
                                type="button"
                                className="inline-flex items-center gap-1 rounded-full bg-black/70 text-white text-xs px-3 py-1 shadow-sm"
                              >
                                <svg
                                  className="w-3.5 h-3.5"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v7a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                                  />
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                                  />
                                </svg>
                                <span>Change photo</span>
                              </button>
                            </div>
                          </div>
                        </div>
                        <div className="flex-1">
                          <div className="flex justify-end mb-3">
                            <div className="inline-flex items-center text-[11px] sm:text-xs bg-gray-100 rounded-full p-0.5 border border-gray-200">
                              <button
                                type="button"
                                onClick={() => setEnergyUnit('kcal')}
                                className={`px-2 py-0.5 rounded-full ${
                                  energyUnit === 'kcal'
                                    ? 'bg-white text-gray-900 shadow-sm'
                                    : 'text-gray-500'
                                }`}
                              >
                                kcal
                              </button>
                              <button
                                type="button"
                                onClick={() => setEnergyUnit('kJ')}
                                className={`px-2 py-0.5 rounded-full ${
                                  energyUnit === 'kJ'
                                    ? 'bg-white text-gray-900 shadow-sm'
                                    : 'text-gray-500'
                                }`}
                              >
                                kJ
                              </button>
                            </div>
                          </div>
                          {(() => {
                            const macroSegments: MacroSegment[] = [
                              {
                                key: 'protein',
                                label: 'Protein',
                                grams: (analyzedNutrition as any)?.protein || 0,
                                color: '#ef4444',
                              },
                              {
                                key: 'fibre',
                                label: 'Fibre',
                                grams: (analyzedNutrition as any)?.fiber || 0,
                                color: '#93c5fd',
                              },
                              {
                                key: 'carbs',
                                label: 'Carbs',
                                grams: (analyzedNutrition as any)?.carbs || 0,
                                color: '#22c55e',
                              },
                              {
                                key: 'sugar',
                                label: 'Sugar',
                                grams: (analyzedNutrition as any)?.sugar || 0,
                                color: '#f97316',
                              },
                              {
                                key: 'fat',
                                label: 'Fat',
                                grams: (analyzedNutrition as any)?.fat || 0,
                                color: '#6366f1',
                              },
                            ]

                            const caloriesValue = (analyzedNutrition as any)?.calories || 0
                            const caloriesInUnit =
                              energyUnit === 'kJ'
                                ? Math.round(caloriesValue * 4.184)
                                : Math.round(caloriesValue)

                            return (
                              <div className="flex flex-col">
                                <div className="flex items-center gap-5">
                                  <div className="flex flex-col items-center flex-shrink-0">
                                    <div className="relative inline-block">
                                      <MacroRing
                                        macros={macroSegments}
                                        showLegend={false}
                                        size="xlarge"
                                      />
                                      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                                        <div className="text-2xl sm:text-3xl font-bold text-gray-900">
                                          {caloriesInUnit}
                                        </div>
                                        <div className="text-xs text-gray-500 mt-0.5">
                                          {energyUnit}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                                {/* Horizontal macro chips under the photo+circle row */}
                                <div className="mt-4 flex flex-wrap gap-3">
                                  {macroSegments.map((macro) => {
                                    const displayValue = formatMacroValue(macro.grams, 'g')
                                    return (
                                      <div
                                        key={macro.key}
                                        className="inline-flex items-center gap-2 rounded-full bg-gray-100 border border-gray-200 px-3 py-1 text-sm text-gray-800"
                                      >
                                        <span
                                          className="inline-block w-3 h-3 rounded-full"
                                          style={{ backgroundColor: macro.color }}
                                        />
                                        <span>
                                          {macro.label} {displayValue}
                                        </span>
                                      </div>
                                    )
                                  })}
                                </div>
                              </div>
                            )
                          })()}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Mobile + non-editing macro layout (photo on top, circle + vertical labels beneath) */}
                  {analyzedNutrition && (() => {
                    // Create macro segments for the circle chart
                    const macroSegments: MacroSegment[] = [
                      { key: 'protein', label: 'Protein', grams: (analyzedNutrition as any)?.protein || 0, color: '#ef4444' }, // red
                      { key: 'fibre', label: 'Fibre', grams: (analyzedNutrition as any)?.fiber || 0, color: '#93c5fd' }, // light blue
                      { key: 'carbs', label: 'Carbs', grams: (analyzedNutrition as any)?.carbs || 0, color: '#22c55e' }, // green
                      { key: 'sugar', label: 'Sugar', grams: (analyzedNutrition as any)?.sugar || 0, color: '#f97316' }, // orange
                      { key: 'fat', label: 'Fat', grams: (analyzedNutrition as any)?.fat || 0, color: '#6366f1' }, // purple
                    ]
                    
                    // Organize macros for 2-column layout: Left column (Protein, Carbs, Fat), Right column (Fibre, Sugar)
                    const leftColumnMacros = [
                      macroSegments.find(m => m.key === 'protein'),
                      macroSegments.find(m => m.key === 'carbs'),
                      macroSegments.find(m => m.key === 'fat'),
                    ].filter(Boolean) as MacroSegment[]
                    
                    const rightColumnMacros = [
                      macroSegments.find(m => m.key === 'fibre'),
                      macroSegments.find(m => m.key === 'sugar'),
                    ].filter(Boolean) as MacroSegment[]
                    
                    const caloriesValue = (analyzedNutrition as any)?.calories || 0
                    const caloriesInUnit =
                      energyUnit === 'kJ' ? Math.round(caloriesValue * 4.184) : Math.round(caloriesValue)
                    
                    return (
                      <div className={`mb-6 mt-3 rounded-lg p-4 sm:p-6 bg-white/90 supports-[backdrop-filter]:bg-white/60 backdrop-blur ${editingEntry ? 'lg:hidden' : ''}`}>
                        <div className="flex justify-end mb-4">
                          <div className="inline-flex items-center text-[11px] sm:text-xs bg-gray-100 rounded-full p-0.5 border border-gray-200">
                            <button
                              type="button"
                              onClick={() => setEnergyUnit('kcal')}
                              className={`px-2 py-0.5 rounded-full ${
                                energyUnit === 'kcal'
                                  ? 'bg-white text-gray-900 shadow-sm'
                                  : 'text-gray-500'
                              }`}
                            >
                              kcal
                            </button>
                            <button
                              type="button"
                              onClick={() => setEnergyUnit('kJ')}
                              className={`px-2 py-0.5 rounded-full ${
                                energyUnit === 'kJ'
                                  ? 'bg-white text-gray-900 shadow-sm'
                                  : 'text-gray-500'
                              }`}
                            >
                              kJ
                            </button>
                          </div>
                        </div>
                        <div className="flex flex-row items-start gap-4">
                          {/* Circle chart with calories in center */}
                          <div className="flex flex-col items-center flex-shrink-0">
                            <div className="relative inline-block">
                              <MacroRing macros={macroSegments} showLegend={false} size="xlarge" />
                              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                                <div className="text-2xl sm:text-3xl font-bold text-gray-900">
                                  {caloriesInUnit}
                                </div>
                                <div className="text-xs text-gray-500 mt-0.5">
                                  {energyUnit}
                                </div>
                              </div>
                            </div>
                            <div className="text-sm text-gray-600 mt-2 font-medium">Macro breakdown</div>
                          </div>
                          
                          {/* Macro breakdown list - single column vertical list */}
                          <div className="flex-1 flex flex-col justify-center py-2">
                            <div className="space-y-1 text-sm text-gray-700">
                              {macroSegments.map((macro) => {
                                const displayValue = formatMacroValue(macro.grams, 'g')
                                return (
                                  <div key={macro.key} className="flex items-center gap-2">
                                    <span
                                      className="inline-block w-3 h-3 rounded-full shrink-0"
                                      style={{ backgroundColor: macro.color }}
                                    />
                                    <span>
                                      {macro.label} {displayValue}
                                    </span>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })()}

                  {/* Detected Items with Brand, Serving Size, and Edit Controls */}
                  {analyzedItems && analyzedItems.length > 0 && !isEditingDescription ? (
                    <div className="mb-6 space-y-3">
                      <div className="mb-2 flex items-center justify-between">
                        <div className="text-sm font-medium text-gray-600">Detected Foods:</div>
                        <button
                          onClick={() => setShowAddIngredientModal(true)}
                          className="text-sm px-3 py-1.5 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
                          title="Add a missing ingredient"
                        >
                          + Add ingredient
                        </button>
                      </div>
                      {analyzedItems.map((item: any, index: number) => {
                        const servingsCount = item?.servings && item.servings > 0 ? item.servings : 1;
                        const totalCalories = Math.round((item.calories || 0) * servingsCount);
                        const totalProtein = Math.round(((item.protein_g || 0) * servingsCount) * 10) / 10;
                        const totalCarbs = Math.round(((item.carbs_g || 0) * servingsCount) * 10) / 10;
                        const totalFat = Math.round(((item.fat_g || 0) * servingsCount) * 10) / 10;
                        const totalFiber = Math.round(((item.fiber_g ?? 0) * servingsCount) * 10) / 10;
                        const totalSugar = Math.round(((item.sugar_g ?? 0) * servingsCount) * 10) / 10;
                        const formattedServings = `${formatServingsDisplay(servingsCount)} serving${Math.abs(servingsCount - 1) < 0.001 ? '' : 's'}`;

                        const totalsByField: Record<string, number | null> = {
                          calories: totalCalories,
                          protein_g: totalProtein,
                          carbs_g: totalCarbs,
                          fat_g: totalFat,
                          fiber_g: totalFiber,
                          sugar_g: totalSugar,
                        };
                        // Prefer an explicit serving_size from the item; if missing, try to
                        // derive one from the name in parentheses, e.g. "Grilled Salmon (6 oz)"
                        const servingSizeLabel = (() => {
                          const direct = (item.serving_size && String(item.serving_size).trim()) || ''
                          if (direct) return direct
                          const name = String(item.name || '')
                          const m = name.match(/\(([^)]+)\)/)
                          return m && m[1] ? m[1].trim() : ''
                        })()
                        const servingUnitMeta = parseServingUnitMetadata(servingSizeLabel || '')
                        const gramsPerServing = (() => {
                          if (!servingSizeLabel) return null
                          const m = servingSizeLabel.match(/(\d+(?:\.\d+)?)\s*g\b/i)
                          if (!m) return null
                          const v = parseFloat(m[1])
                          return Number.isFinite(v) && v > 0 ? v : null
                        })()

                        const isMultiIngredient = analyzedItems.length > 1
                        const isExpanded = !isMultiIngredient || expandedItemIndex === index
                        
                        const cardPaddingClass =
                          isMultiIngredient && !isExpanded ? 'py-2.5 px-4' : 'p-4'

                        return (
                          <div
                            key={index}
                            className={`bg-white rounded-xl border border-gray-200 shadow-sm ${cardPaddingClass}`}
                          >
                            {/* Header row with basic info and actions */}
                            <div className={`flex items-start justify-between ${isMultiIngredient && !isExpanded ? 'mb-1' : 'mb-2'}`}>
                              <div className="flex-1">
                                <div className="font-semibold text-gray-900 text-base">
                                  {item.name || 'Unknown Food'}
                                </div>
                                {(!isMultiIngredient || isExpanded) && (
                                  <>
                                    {item.brand && (
                                      <div className="text-sm text-gray-600 mt-0.5">Brand: {item.brand}</div>
                                    )}
                                    <div className="text-sm text-gray-500 mt-1">
                                      Serving size: {formatServingSizeDisplay(servingSizeLabel || '', item)}
                                    </div>
                                  </>
                                )}
                              </div>
                              <div className="ml-3 flex items-center gap-1">
                                {(!isMultiIngredient || isExpanded) && (
                                  <>
                                    <button
                                      onClick={() => {
                                        setEditingItemIndex(index);
                                        setShowItemEditModal(true);
                                      }}
                                      className="p-2 text-gray-600 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                                      title="Adjust details"
                                    >
                                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                      </svg>
                                    </button>
                                    <button
                                      onClick={() => handleDeleteItem(index)}
                                      className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                      title="Delete ingredient"
                                    >
                                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 7h12M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2m-7 0l1 12a2 2 0 002 2h2a2 2 0 002-2l1-12" />
                                      </svg>
                                    </button>
                                  </>
                                )}
                                {isMultiIngredient && (
                                  <button
                                    onClick={() => {
                                      setExpandedItemIndex(expandedItemIndex === index ? null : index)
                                    }}
                                    className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                                    title={isExpanded ? 'Collapse' : 'Expand'}
                                  >
                                    <svg
                                      className={`w-4 h-4 transform transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                    >
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                  </button>
                                )}
                              </div>
                            </div>
                            
                            {/* Serving Controls
                                GUARD RAIL SUMMARY:
                                - This UI intentionally exposes ONE editable number: Servings.
                                - 1 serving is defined by `servingSizeLabel` (e.g. "1/2 cup (45 g)").
                                - When gramsPerServing is known, we also show a read-only "Total ≈ X g" line.
                                - Do NOT re-introduce a second editable "Units" field or change the meaning of
                                  "1 serving" without explicit written approval from the user. */}
                            {isExpanded && (
                              <div className="flex flex-col gap-2 mb-3 pb-3 border-b border-gray-100">
                                <div className="flex items-center gap-3">
                                  <span className="text-sm text-gray-600">Servings:</span>
                                  <div className="flex items-center gap-2">
                                    <button
                                      onClick={() => {
                                        const current = analyzedItems[index]?.servings || 1
                                        const step =
                                          servingUnitMeta && isDiscreteUnitLabel(servingUnitMeta.unitLabel)
                                            ? Math.max(1 / servingUnitMeta.quantity, 0.25)
                                            : 0.25
                                        const next = Math.max(0, current - step)
                                        updateItemField(index, 'servings', next)
                                      }}
                                      className="w-8 h-8 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700 font-medium transition-colors"
                                    >
                                      -
                                    </button>
                                    <input
                                      type="number"
                                      min={0}
                                      step={
                                        servingUnitMeta && isDiscreteUnitLabel(servingUnitMeta.unitLabel)
                                          ? Math.max(1 / servingUnitMeta.quantity, 0.25)
                                          : 0.25
                                      }
                                      value={formatNumberInputValue(item.servings ?? 1)}
                                      onChange={(e) => updateItemField(index, 'servings', e.target.value)}
                                      className="w-20 px-2 py-1 border border-gray-300 rounded-lg text-base font-semibold text-gray-900 text-center focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                                    />
                                    <button
                                      onClick={() => {
                                        const current = analyzedItems[index]?.servings || 1
                                        const step =
                                          servingUnitMeta && isDiscreteUnitLabel(servingUnitMeta.unitLabel)
                                            ? Math.max(1 / servingUnitMeta.quantity, 0.25)
                                            : 0.25
                                        const next = current + step
                                        updateItemField(index, 'servings', next)
                                      }}
                                      className="w-8 h-8 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700 font-medium transition-colors"
                                    >
                                      +
                                    </button>
                                  </div>
                                </div>
                                <div className="text-xs text-gray-500">
                                  {servingSizeLabel
                                    ? `1 serving = ${servingSizeLabel}`
                                    : 'Serving size not specified'}
                                </div>
                                {gramsPerServing && (
                                  <div className="text-xs text-gray-500">
                                    Total amount ≈ {Math.round(gramsPerServing * servingsCount)} g
                                  </div>
                                )}
                              </div>
                            )}
                            
                            {/* Macro totals for this ingredient – updates as servings change */}
                            {isExpanded && (
                            <div className="space-y-2">
                              <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                                Totals for {formattedServings}
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {ITEM_NUTRIENT_META.map((meta) => {
                                  const totalValue = totalsByField[meta.field as keyof typeof totalsByField]
                                  const displayValue =
                                    meta.key === 'calories'
                                      ? formatEnergyValue(totalValue, energyUnit)
                                      : formatMacroValue(totalValue, 'g')
                                  const labelText =
                                    meta.key === 'calories'
                                      ? energyUnit === 'kJ'
                                        ? 'Kilojoules'
                                        : 'Calories'
                                      : meta.label
                                  return (
                                    <div
                                      key={`${meta.field}-${index}`}
                                      className="px-3 py-1 rounded-full bg-gray-100 border border-gray-200 text-[11px] font-medium text-gray-700 flex items-center gap-1"
                                    >
                                      <span className={`font-semibold ${meta.accent}`}>{displayValue}</span>
                                      <span className="uppercase text-gray-500">{labelText}</span>
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="mb-6">
                      <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                        <div className="text-sm font-medium text-gray-600 mb-2">Detected Foods:</div>
                        <div className="text-gray-900 text-sm leading-relaxed whitespace-pre-wrap break-words">

                  {(() => {
                            // Hide any embedded ITEMS_JSON blocks and any untagged JSON that looks like items[]
                            const cleanedText = aiDescription
                              // Remove tagged block (with or without closing tag) - literal and HTML-encoded
                              .replace(/<ITEMS_JSON>[\s\S]*?(<\/ITEMS_JSON>|$)/gi, '')
                              .replace(/&lt;ITEMS_JSON&gt;[\s\S]*?(&lt;\/ITEMS_JSON&gt;|$)/gi, '')
                              // Remove any untagged inline JSON that looks like items[]
                              .replace(/\{[\s\S]*?"items"\s*:\s*\[[\s\S]*?\][\s\S]*?\}/g, '')
                              .trim()
                            const filteredLines = cleanedText
                              .split('\n')
                              .map((line) => line.trim())
                              .filter(line =>
                                line.length > 0 &&
                                !/^calories?\b/i.test(line) &&
                                !/^protein\b/i.test(line) &&
                                !/^carb(?:ohydrate)?s?\b/i.test(line) &&
                                !/^fat\b/i.test(line) &&
                                !/^fiber\b/i.test(line) &&
                                !/^sugar\b/i.test(line) &&
                                !/insufficient credits/i.test(line) &&
                                !/trial limit/i.test(line) &&
                                !/^i'?m unable to see/i.test(line) &&
                                !/^unable to see/i.test(line)
                              );

                            const cleaned = filteredLines.join('\n\n').trim();
                            const fallback = aiDescription.replace(/calories\s*:[^\n]+/gi, '').trim();
                            const merged = (cleaned || fallback || aiDescription || '').trim();
                            const normalized = merged.replace(/^(This image shows|I can see|The food appears to be|This appears to be|I'm unable to see|Based on the image)/i, '').trim();
                            const finalText = normalized || 'Description not available yet.';

                            return finalText.replace(/^./, (match: string) => match.toUpperCase());
                          })()}
                        </div>
                      </div>
                    </div>
                  )}
                    {aiDescription && /(Insufficient credits|trial limit)/i.test(aiDescription) && (
                      <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                        <div className="flex flex-col gap-3">
                          <div>
                            <div className="font-semibold text-amber-800">Payment required</div>
                            <div className="text-sm text-amber-700">Subscribe to Premium or purchase credits to unlock AI food analysis, medical image analysis, and interaction checks.</div>
                          </div>
                          <Link href="/billing" className="inline-flex items-center justify-center px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium w-full sm:w-auto">Upgrade to Premium</Link>
                        </div>
                      </div>
                    )}
                    {aiDescription && /(Failed to analyze|describe your food manually)/i.test(aiDescription) && (
                      <div className="mt-2 text-xs text-gray-600">Calorie modals are not available when you manually input the information.</div>
                    )}
                    
                    {/* Health Warning */}
                    {healthWarning && (
                      <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                        <div className="flex items-start">
                          <svg className="w-5 h-5 text-red-600 mr-2 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                          </svg>
                          <div className="flex-1">
                            <div className="font-semibold text-red-800 mb-1">Health Warning</div>
                            <div className="text-sm text-red-700 whitespace-pre-line">{healthWarning.replace('⚠️ HEALTH WARNING:', '').trim()}</div>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {/* Health Alternatives */}
                    {healthAlternatives && (
                      <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                        <div className="flex items-start">
                          <svg className="w-5 h-5 text-blue-600 mr-2 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                          </svg>
                          <div className="flex-1">
                            <div className="font-semibold text-blue-800 mb-2">Would you like me to recommend something more suitable?</div>
                            <div className="text-sm text-blue-700 whitespace-pre-line">{healthAlternatives}</div>
                          </div>
                        </div>
                      </div>
                    )}
                </div>
                  
                {/* Add Ingredient Modal */}
                {showAddIngredientModal && (
                  <div className="fixed inset-0 z-50">
                    <div
                      className="absolute inset-0 bg-black/30"
                      onClick={() => {
                        setShowAddIngredientModal(false)
                        setOfficialSearchQuery('')
                        setOfficialResults([])
                        setOfficialError(null)
                      }}
                    ></div>
                    <div className="absolute inset-0 flex items-start sm:items-center justify-center mt-10 sm:mt-0">
                      <div className="w-[92%] max-w-lg bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
                        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                          <div className="font-semibold text-gray-900">Add ingredient</div>
                          <button onClick={() => setShowAddIngredientModal(false)} className="p-2 rounded-md hover:bg-gray-100">
                            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                        <div className="p-4">
                          <div className="space-y-2">
                            <label className="block text-sm font-medium text-gray-900">
                              Search foods (USDA)
                            </label>
                            <div className="flex flex-col sm:flex-row gap-2">
                              <input
                                type="text"
                                value={officialSearchQuery}
                                onChange={(e) => setOfficialSearchQuery(e.target.value)}
                                placeholder={'e.g., Carman\'s toasted muesli or \"oatmeal\"'}
                                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm"
                              />
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  disabled={officialLoading}
                                  onClick={() => handleOfficialSearch('packaged')}
                                  className={`px-3 py-2 text-xs font-medium rounded-lg border ${
                                    officialSource === 'packaged'
                                      ? 'bg-emerald-600 text-white border-emerald-600'
                                      : 'bg-white text-gray-700 border-gray-300'
                                  } disabled:opacity-60`}
                                >
                                  Packaged
                                </button>
                                <button
                                  type="button"
                                  disabled={officialLoading}
                                  onClick={() => handleOfficialSearch('single')}
                                  className={`px-3 py-2 text-xs font-medium rounded-lg border ${
                                    officialSource === 'single'
                                      ? 'bg-slate-800 text-white border-slate-800'
                                      : 'bg-white text-gray-700 border-gray-300'
                                  } disabled:opacity-60`}
                                >
                                  Single food
                                </button>
                              </div>
                            </div>
                            <p className="text-xs text-gray-500">
                              Results are powered by USDA FoodData Central. Use the toggles to focus on packaged
                              products or generic single foods.
                            </p>
                          </div>
                          {officialError && <div className="mt-3 text-xs text-red-600">{officialError}</div>}
                          {officialLoading && (
                            <div className="mt-3 text-xs text-gray-500">Searching USDA…</div>
                          )}
                          {!officialLoading && !officialError && officialResults.length > 0 && (
                            <div className="mt-3 max-h-80 overflow-y-auto space-y-2">
                              {officialResults.map((r, idx) => (
                                <div
                                  key={`${r.source}-${r.id}-${idx}`}
                                  className="flex items-start justify-between rounded-lg border border-gray-200 px-3 py-2"
                                >
                                  <div className="min-w-0">
                                    <div className="text-sm font-semibold text-gray-900 truncate">
                                      {r.name}
                                      {r.brand ? ` – ${r.brand}` : ''}
                                    </div>
                                    <div className="mt-0.5 text-xs text-gray-600">
                                      {r.serving_size ? `Serving: ${r.serving_size} • ` : ''}
                                      {r.calories != null && !Number.isNaN(Number(r.calories)) && (
                                        <span>{Math.round(Number(r.calories))} kcal</span>
                                      )}
                                      {r.protein_g != null && (
                                        <span className="ml-2">{`${r.protein_g} g protein`}</span>
                                      )}
                                      {r.carbs_g != null && (
                                        <span className="ml-2">{`${r.carbs_g} g carbs`}</span>
                                      )}
                                      {r.fat_g != null && <span className="ml-2">{`${r.fat_g} g fat`}</span>}
                                    </div>
                                    <div className="mt-1 text-[11px] text-gray-400">
                                      Source: USDA FoodData Central
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => addIngredientFromOfficial(r)}
                                    className="ml-3 px-3 py-1.5 rounded-md bg-emerald-600 text-white text-xs hover:bg-emerald-700"
                                  >
                                    Add
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                          {!officialLoading && !officialError && officialResults.length === 0 && officialSearchQuery.trim() && (
                            <div className="mt-4 text-xs text-gray-500">
                              Can't find your food? You can use AI photo analysis instead.
                            </div>
                          )}
                          <div className="mt-4 pt-3 border-t border-gray-100 space-y-2">
                            <div className="text-sm font-medium text-gray-900">
                              Or use AI photo analysis
                            </div>
                            <p className="text-xs text-gray-500">
                              Take a clear photo of the food or package and let Helfi estimate the nutrition using AI.
                            </p>
                            <label className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium cursor-pointer hover:bg-emerald-700">
                              Add Image
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => {
                                  handlePhotoUpload(e)
                                  setShowAddIngredientModal(false)
                                  setShowAddFood(true)
                                  setShowPhotoOptions(false)
                                }}
                              />
                            </label>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                {/* Action Buttons */}
                <div className="space-y-3">
                  <button
                    onClick={() =>
                      editingEntry ? updateFoodEntry() : addFoodEntry(aiDescription, 'photo')
                    }
                    disabled={isAnalyzing || isSavingEntry}
                    className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-300 text-white font-medium rounded-xl transition-colors duration-200 flex items-center justify-center shadow-lg"
                  >
                    {isAnalyzing || isSavingEntry ? (
                      <>
                        <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        {isAnalyzing
                          ? 'Re-analyzing...'
                          : editingEntry
                            ? 'Saving changes...'
                            : 'Saving to Food Diary...'}
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        {editingEntry ? 'Update Entry' : 'Save to Food Diary'}
                      </>
                    )}
                  </button>
                  {!editingEntry && (
                    <button
                      onClick={handleDeletePhoto}
                      className="w-full py-3 px-4 bg-gray-500 hover:bg-gray-600 text-white font-medium rounded-xl transition-colors duration-200 flex items-center justify-center"
                    >
                      <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      Delete Photo
                    </button>
                  )}
                  {editingEntry && (
                    <button
                      onClick={handleCancelEditing}
                      className="w-full py-3 px-4 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-medium rounded-xl transition-colors duration-200 flex items-center justify-center"
                    >
                      <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      Cancel changes
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Item Edit Modal */}
            {showItemEditModal && editingItemIndex !== null && analyzedItems[editingItemIndex] && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-2xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
                  <div className="p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-xl font-semibold text-gray-900">Adjust Food Details</h3>
                      <button
                        onClick={() => {
                          setShowItemEditModal(false);
                          setEditingItemIndex(null);
                        }}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                    
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Food Name
                        </label>
                        <input
                          type="text"
                          value={analyzedItems[editingItemIndex]?.name || ''}
                          onChange={(e) => updateItemField(editingItemIndex, 'name', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                          placeholder="e.g., Bread, Sausage, etc."
                        />
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Brand (optional)
                        </label>
                        <input
                          type="text"
                          value={analyzedItems[editingItemIndex]?.brand || ''}
                          onChange={(e) => updateItemField(editingItemIndex, 'brand', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                          placeholder="e.g., Burgen, Heinz, etc."
                        />
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Serving Size
                        </label>
                        <input
                          type="text"
                          value={analyzedItems[editingItemIndex]?.serving_size || ''}
                          onChange={(e) => updateItemField(editingItemIndex, 'serving_size', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                          placeholder="e.g., 1 slice, 40g, 1 cup"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          This is the serving size shown on the package or your estimate
                        </p>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Servings
                        </label>
                        <input
                          type="number"
                          min={0}
                          step={(() => {
                            const meta = parseServingUnitMetadata(analyzedItems[editingItemIndex]?.serving_size || '')
                            return meta && isDiscreteUnitLabel(meta.unitLabel) ? (1 / meta.quantity) : 0.25
                          })()}
                          value={analyzedItems[editingItemIndex]?.servings ?? 1}
                          onChange={(e) => updateItemField(editingItemIndex, 'servings', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                          placeholder="e.g., 1"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          Adjust servings to multiply nutrients accordingly
                        </p>
                      </div>

                      <div>
                        <div className="block text-sm font-medium text-gray-700 mb-2">
                          Macros per serving
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs text-gray-600 mb-1">Calories</label>
                            <input
                              type="number"
                              min={0}
                              step={1}
                              value={analyzedItems[editingItemIndex]?.calories ?? ''}
                              onChange={(e) => updateItemField(editingItemIndex, 'calories', e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                              placeholder="kcal"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-600 mb-1">Protein (g)</label>
                            <input
                              type="number"
                              min={0}
                              step={0.1}
                              value={analyzedItems[editingItemIndex]?.protein_g ?? ''}
                              onChange={(e) => updateItemField(editingItemIndex, 'protein_g', e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                              placeholder="g"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-600 mb-1">Carbs (g)</label>
                            <input
                              type="number"
                              min={0}
                              step={0.1}
                              value={analyzedItems[editingItemIndex]?.carbs_g ?? ''}
                              onChange={(e) => updateItemField(editingItemIndex, 'carbs_g', e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                              placeholder="g"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-600 mb-1">Fat (g)</label>
                            <input
                              type="number"
                              min={0}
                              step={0.1}
                              value={analyzedItems[editingItemIndex]?.fat_g ?? ''}
                              onChange={(e) => updateItemField(editingItemIndex, 'fat_g', e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                              placeholder="g"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-600 mb-1">Fiber (g)</label>
                            <input
                              type="number"
                              min={0}
                              step={0.1}
                              value={analyzedItems[editingItemIndex]?.fiber_g ?? ''}
                              onChange={(e) => updateItemField(editingItemIndex, 'fiber_g', e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                              placeholder="g"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-600 mb-1">Sugar (g)</label>
                            <input
                              type="number"
                              min={0}
                              step={0.1}
                              value={analyzedItems[editingItemIndex]?.sugar_g ?? ''}
                              onChange={(e) => updateItemField(editingItemIndex, 'sugar_g', e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                              placeholder="g"
                            />
                          </div>
                        </div>
                      </div>
                      
                      <div className="pt-4 border-t border-gray-200">
                        <button
                          onClick={() => {
                            // Recalculate nutrition after edits
                            applyRecalculatedNutrition(analyzedItems);
                            setShowItemEditModal(false);
                            setEditingItemIndex(null);
                          }}
                          className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-600 text-white font-medium rounded-xl transition-colors duration-200"
                        >
                          Save Changes
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Manual Food Entry - Improved Structure */}
            {!photoPreview && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-6">Manual Food Entry</h3>
                
                {/* Type Dropdown First */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Type
                  </label>
                  <select
                    value={manualFoodType}
                    onChange={(e) => {
                      setManualFoodType(e.target.value);
                      setManualFoodName('');
                      setManualIngredients([{ name: '', weight: '', unit: 'g' }]);
                    }}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-white transition-colors"
                  >
                    <option value="single">Single Food</option>
                    <option value="multiple">Multiple Ingredients</option>
                  </select>
                </div>

                {/* Single Food Entry */}
                {manualFoodType === 'single' && (
                  <>
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Food Name
                      </label>
                      <input
                        type="text"
                        value={manualFoodName}
                        onChange={(e) => setManualFoodName(e.target.value)}
                        placeholder="e.g., Grilled chicken breast, Medium banana"
                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors"
                      />
                    </div>

                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Weight/Portion
                      </label>
                      <input
                        type="text"
                        value={manualIngredients[0]?.weight || ''}
                        onChange={(e) => updateIngredient(0, 'weight', e.target.value)}
                        placeholder="e.g., 100, 6, 1"
                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors"
                      />
                    </div>

                    <div className="mb-6">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Unit
                      </label>
                      <select
                        value={manualIngredients[0]?.unit || 'g'}
                        onChange={(e) => updateIngredient(0, 'unit', e.target.value)}
                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-white transition-colors"
                      >
                        <option value="g">Grams</option>
                        <option value="oz">Ounces</option>
                        <option value="cup">Cups</option>
                        <option value="tbsp">Tablespoon</option>
                        <option value="tsp">Teaspoon</option>
                        <option value="ml">Milliliters</option>
                        <option value="piece">Piece</option>
                        <option value="slice">Slice</option>
                        <option value="medium">Medium</option>
                        <option value="large">Large</option>
                        <option value="small">Small</option>
                      </select>
                    </div>
                  </>
                )}

                {/* Multiple Ingredients Entry */}
                {/* PROTECTED: INGREDIENTS_CARD START */}
                {manualFoodType === 'multiple' && (
                  <div className="mb-6">
                    <div className="space-y-4">
                      {manualIngredients.map((ing, index) => (
                        <div key={index} className="border border-gray-200 rounded-xl p-4">
                          <div className="flex justify-between items-center mb-3">
                            <h4 className="text-sm font-medium text-gray-700">Ingredient {index + 1}</h4>
                            {manualIngredients.length > 1 && (
                              <div className="relative ingredient-options-dropdown">
                                <button
                                  onClick={() => setShowIngredientOptions(showIngredientOptions === `${index}` ? null : `${index}`)}
                                  className="p-1 rounded-lg hover:bg-gray-100 transition-colors"
                                >
                                  <svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
                                  </svg>
                                </button>
                                
                                {showIngredientOptions === `${index}` && (
                                  <div className="absolute right-0 mt-2 w-32 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                                    <button
                                      onClick={() => {
                                        removeIngredient(index);
                                        setShowIngredientOptions(null);
                                      }}
                                      className="w-full px-3 py-2 text-left text-red-600 hover:bg-red-50 flex items-center text-sm"
                                    >
                                      <svg className="w-3 h-3 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          strokeWidth={2}
                                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                        />
                                      </svg>
                                      Delete
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                          
                          <div className="mb-3">
                            <input
                              type="text"
                              value={ing.name}
                              onChange={(e) => updateIngredient(index, 'name', e.target.value)}
                              placeholder="Ingredient name"
                              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm"
                            />
                          </div>
                          
                          <div className="mb-3">
                            <input
                              type="text"
                              value={ing.weight}
                              onChange={(e) => updateIngredient(index, 'weight', e.target.value)}
                              placeholder="Weight/Portion"
                              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm"
                            />
                          </div>
                          
                          <div>
                            <select
                              value={ing.unit}
                              onChange={(e) => updateIngredient(index, 'unit', e.target.value)}
                              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-white text-sm"
                            >
                              <option value="g">Grams</option>
                              <option value="oz">Ounces</option>
                              <option value="cup">Cups</option>
                              <option value="tbsp">Tablespoon</option>
                              <option value="tsp">Teaspoon</option>
                              <option value="ml">Milliliters</option>
                              <option value="piece">Piece</option>
                              <option value="slice">Slice</option>
                            </select>
                          </div>
                        </div>
                      ))}
                      
                      <button
                        onClick={addIngredient}
                        className="w-full px-4 py-3 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-100 transition-colors flex items-center justify-center border border-emerald-200"
                      >
                        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                        Add Ingredient
                      </button>
                    </div>
                  </div>
                )}
                {/* PROTECTED: INGREDIENTS_CARD END */}

                {/* Action Buttons */}
                <div className="flex gap-3">
                  <button
                    onClick={analyzeManualFood}
                    disabled={
                      (manualFoodType === 'single' && (!manualFoodName.trim() || !manualIngredients[0]?.weight?.trim())) ||
                      (manualFoodType === 'multiple' && manualIngredients.every(ing => !ing.name.trim() || !ing.weight.trim())) ||
                      isAnalyzing
                    }
                    className="flex-1 py-3 px-4 bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-colors duration-200 flex items-center justify-center"
                  >
                    {isAnalyzing ? (
                      <>
                        <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        {analysisPhase === 'building'
                          ? 'Step 2 of 2: Building ingredient cards...'
                          : 'Step 1 of 2: Analyzing food...'}
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                        </svg>
                        Analyze Food
                      </>
                    )}
                  </button>
                  
                  <button
                    onClick={cancelManualEntry}
                    className="p-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg transition-colors duration-200 flex items-center justify-center"
                    title="Cancel"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Loading State - Prevent Empty Flash */}
        {!foodDiaryLoaded ? (
          <div className="bg-white rounded-lg shadow-sm p-12 flex flex-col items-center justify-center">
            <div className="w-10 h-10 border-4 border-emerald-100 border-t-emerald-500 rounded-full animate-spin mb-4"></div>
            <div className="text-gray-500 font-medium">Loading your food diary...</div>
          </div>
        ) : (
        <div className="bg-white rounded-lg shadow-sm p-4 sm:p-6 overflow-visible">
          {/* Daily Totals Row - only show on main diary view, not while editing an entry */}
          {!editingEntry && (isViewingToday ? todaysFoods : (historyFoods || [])).length > 0 && (
            <div className="mb-4">
              {(() => {
                const source = isViewingToday ? todaysFoods : (historyFoods || [])

                const safeNumber = (value: any) => {
                  const num = Number(value)
                  return Number.isFinite(num) ? num : 0
                }

                // ⚠️ GUARD RAIL: Today’s Totals must always be rebuilt from ingredient cards.
                // Fiber/sugar accuracy depends on this. Stored totals are used only as a fallback.
                const deriveItemsForEntry = (entry: any) => {
                  if (entry?.items && Array.isArray(entry.items) && entry.items.length > 0) {
                    return entry.items
                  }
                  if (entry?.description) {
                    const structured = extractStructuredItemsFromAnalysis(entry.description)
                    if (structured?.items?.length) {
                      return enrichItemsFromStarter(structured.items)
                    }
                    const prose = extractItemsFromTextEstimates(entry.description)
                    if (prose?.items?.length) {
                      return enrichItemsFromStarter(prose.items)
                    }
                  }
                  return null
                }

                const convertStoredTotals = (input: any) => {
                  if (!input) return null
                  return {
                    calories: safeNumber(input.calories ?? input.calories_g ?? input.kcal),
                    protein: safeNumber(input.protein ?? input.protein_g),
                    carbs: safeNumber(input.carbs ?? input.carbs_g ?? input.carbohydrates),
                    fat: safeNumber(input.fat ?? input.fat_g ?? input.total_fat),
                    fiber: safeNumber(input.fiber ?? input.fiber_g ?? input.dietary_fiber_g),
                    sugar: safeNumber(input.sugar ?? input.sugar_g ?? input.sugars_g),
                  }
                }

                const totals = source.reduce((acc: Record<typeof NUTRIENT_DISPLAY_ORDER[number], number>, item: any) => {
                  const derivedItems = deriveItemsForEntry(item)
                  const recalculated = derivedItems ? recalculateNutritionFromItems(derivedItems) : null
                  if (recalculated) {
                    acc.calories += recalculated.calories || 0
                    acc.protein += recalculated.protein || 0
                    acc.carbs += recalculated.carbs || 0
                    acc.fat += recalculated.fat || 0
                    acc.fiber += recalculated.fiber || 0
                    acc.sugar += recalculated.sugar || 0
                    return acc
                  }

                  const storedTotals =
                    convertStoredTotals(item?.total) ||
                    convertStoredTotals(item?.nutrition) || {
                      calories: 0,
                      protein: 0,
                      carbs: 0,
                      fat: 0,
                      fiber: 0,
                      sugar: 0,
                    }

                  acc.calories += storedTotals.calories
                  acc.protein += storedTotals.protein
                  acc.carbs += storedTotals.carbs
                  acc.fat += storedTotals.fat
                  acc.fiber += storedTotals.fiber
                  acc.sugar += storedTotals.sugar
                  return acc
                }, { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0 })

                // Keep rings and macro bars in sync: prefer macros → kcal conversion when available.
                const macroCalories =
                  (totals.protein || 0) * 4 +
                  (totals.carbs || 0) * 4 +
                  (totals.fat || 0) * 9

                const consumedKcal =
                  (macroCalories && Number.isFinite(macroCalories) ? macroCalories : 0) ||
                  totals.calories ||
                  0
                const targetCalories = dailyTargets.calories
                const remainingKcal =
                  targetCalories && targetCalories > 0
                    ? Math.max(0, targetCalories - consumedKcal)
                    : 0
                const consumedInUnit = convertKcalToUnit(consumedKcal, energyUnit)
                const targetInUnit = convertKcalToUnit(targetCalories, energyUnit)
                const percentUsed =
                  targetCalories && targetCalories > 0
                    ? Math.min(1, consumedKcal / targetCalories)
                    : 0

                const sugarGrams = totals.sugar || 0
                const carbGrams = totals.carbs || 0
                const carbNonSugar = Math.max(0, carbGrams - sugarGrams)
                const fibreGrams = totals.fiber || 0

                const macroTargets = {
                  protein: dailyTargets.protein ?? null,
                  carbs: dailyTargets.carbs ?? null,
                  fat: dailyTargets.fat ?? null,
                  fiber: (dailyTargets as any).fiber ?? null,
                  sugar: (dailyTargets as any).sugarMax ?? null,
                }

                const macroViewOptions: Array<'targets' | 'consumed'> = ['targets', 'consumed']

                const macroRows = [
                  { key: 'protein', label: 'Protein', consumed: totals.protein || 0, target: macroTargets.protein || 0, unit: 'g', color: '#ef4444' },
                  { key: 'carbs', label: 'Carbs', consumed: carbGrams, target: macroTargets.carbs || 0, unit: 'g', color: '#22c55e' },
                  { key: 'fat', label: 'Fat', consumed: totals.fat || 0, target: macroTargets.fat || 0, unit: 'g', color: '#6366f1' },
                  { key: 'fibre', label: 'Fibre', consumed: fibreGrams, target: macroTargets.fiber || 0, unit: 'g', color: '#12adc9' },
                  { key: 'sugar', label: 'Sugar (max)', consumed: sugarGrams, target: macroTargets.sugar || 0, unit: 'g', color: '#f97316' },
                ].filter((row) => row.target > 0)

                return (
                  <div className="space-y-4">
                    {/* Daily rings header */}
                    <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4 mb-2">
                      <div className="flex items-center justify-between mb-3">
                        <div className="text-sm font-semibold text-gray-800">
                          {isViewingToday ? 'Today\u2019s energy summary' : 'Energy summary'}
                        </div>
                        <div className="inline-flex items-center text-[11px] sm:text-xs bg-gray-100 rounded-full p-0.5 border border-gray-200">
                          <button
                            type="button"
                            onClick={() => setEnergyUnit('kcal')}
                            className={`px-2 py-0.5 rounded-full ${
                              energyUnit === 'kcal'
                                ? 'bg-white text-gray-900 shadow-sm'
                                : 'text-gray-500'
                            }`}
                          >
                            kcal
                          </button>
                          <button
                            type="button"
                            onClick={() => setEnergyUnit('kJ')}
                            className={`px-2 py-0.5 rounded-full ${
                              energyUnit === 'kJ'
                                ? 'bg-white text-gray-900 shadow-sm'
                                : 'text-gray-500'
                            }`}
                          >
                            kJ
                          </button>
                        </div>
                      </div>
                      {source.length === 0 ? (
                        <p className="text-xs text-gray-500">
                          Add a meal to see how today compares to your daily targets.
                        </p>
                      ) : (
                        <div className="flex flex-col gap-4 md:grid md:grid-cols-[minmax(0,1fr)_300px] md:items-start">
                          {/* Macro progress list - left on desktop, below on mobile */}
                          {macroRows.length > 0 && (
                            <div className="order-2 md:order-1 space-y-2 mt-6 md:mt-0">
                              {macroRows.map((row) => {
                                const pctRaw = row.target > 0 ? row.consumed / row.target : 0
                                const pct = Math.max(0, pctRaw)
                                const percentDisplay = row.target > 0 ? Math.round(pctRaw * 100) : 0
                                const over = percentDisplay > 100
                                const percentColor = over ? 'text-red-600' : 'text-gray-900'
                                const remaining = Math.max(0, row.target - row.consumed)
                                return (
                                  <div key={row.key} className="space-y-1">
                                    <div className="flex items-center justify-between text-sm">
                                      <div className="text-gray-900 font-semibold flex items-center gap-2">
                                        <span>{row.label}</span>
                                        <span className="text-gray-700 font-normal">
                                          {Math.round(row.consumed)} / {Math.round(row.target)} {row.unit}{row.key === 'sugar' ? ' cap' : ''}
                                        </span>
                                        <span className="font-semibold" style={{ color: over ? '#ef4444' : row.color }}>
                                          {Math.round(remaining)} {row.unit} left
                                        </span>
                                      </div>
                                      <div className={`text-xs font-semibold ${percentColor}`}>
                                        {percentDisplay > 0 ? `${percentDisplay}%` : '0%'}
                                      </div>
                                    </div>
                                    <div className="h-2 w-full bg-gray-200 rounded-full overflow-hidden">
                                      <div
                                        className="h-2 rounded-full transition-all"
                                        style={{ width: `${Math.min(100, pct * 100)}%`, backgroundColor: over ? '#ef4444' : row.color }}
                                      />
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          )}

                          {/* Remaining allowance ring - right on desktop, top on mobile */}
                          <div className="flex flex-col items-center order-1 md:order-2">
                            <TargetRing
                              label="Remaining"
                              valueLabel={
                                targetInUnit !== null && consumedInUnit !== null
                                  ? `${Math.max(
                                      0,
                                      Math.round(targetInUnit - consumedInUnit),
                                    )} ${energyUnit}`
                                  : '—'
                              }
                              percent={percentUsed || 0}
                              tone="target"
                            />
                            {targetInUnit !== null && (
                              <div className="mt-1 text-[11px] text-gray-500">
                                Daily allowance:{' '}
                                <span className="font-semibold">
                                  {Math.round(targetInUnit)} {energyUnit}
                                </span>
                              </div>
                            )}
                            <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-gray-600">
                              <div className="flex items-center gap-1">
                                <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500 shrink-0" />
                                <span>Used</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                                <span>Remaining</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })()}
            </div>
          )}

          {/* Hide energy summary + meals while editing an entry to keep the user focused on editing */}
          {!editingEntry && (
            <>
          <h3 className="text-lg font-semibold mb-4">{isViewingToday ? "Today's Meals" : 'Meals'}</h3>
          
          {(isViewingToday ? todaysFoods : (historyFoods || [])).length === 0 ? (
            <div className="text-center py-8">
              <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              <p className="text-gray-500">No food entries yet {isViewingToday ? 'today' : 'for this date'}</p>
              <p className="text-gray-400 text-sm">{isViewingToday ? 'Add your first meal to start tracking!' : 'Pick another day or return to Today.'}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {(isViewingToday ? todaysFoods : (historyFoods || []))
                .slice()
                .sort((a: any, b: any) => (b?.id || 0) - (a?.id || 0))
                .map((food) => (
                <div key={food.id} className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-visible">
                  {/* Collapsed header row */}
                  <div className="p-4 hover:bg-gray-50 transition-colors">
                    <div className="flex items-center gap-3">
                      <p className="flex-1 text-sm sm:text-base text-gray-900 truncate">
                        {food.description.split('\n')[0].split('Calories:')[0]
                          .replace(/^(I'm unable to see.*?but I can provide a general estimate for|Based on.*?,|This image shows|I can see|The food appears to be|This appears to be)/i, '')
                          .trim()
                          .replace(/^./, (match: string) => match.toUpperCase())}
                      </p>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <p className="text-xs sm:text-sm text-gray-500">
                          {formatTimeWithAMPM(food.time)}
                        </p>
                        {/* 3-Dot Options Menu */}
                        <div className="relative entry-options-dropdown">
                          <button
                            onMouseDown={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setShowEntryOptions(showEntryOptions === food.id.toString() ? null : food.id.toString());
                            }}
                            className="p-1.5 sm:p-2 rounded-lg hover:bg-gray-200 transition-colors"
                          >
                            <svg className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
                            </svg>
                          </button>
                          {showEntryOptions === food.id.toString() && (
                            <div className="absolute right-0 bottom-full mb-2 w-48 bg-white rounded-lg shadow-xl border border-gray-200 z-[9999]" style={{boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'}}>
                              <button
                                onClick={() => editFood(food)}
                                className="w-full px-4 py-3 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center transition-colors"
                              >
                                <svg className="w-4 h-4 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                                <div>
                                  <div className="font-medium">Edit Entry</div>
                                  <div className="text-xs text-gray-500">Modify description & re-analyze</div>
                                </div>
                              </button>
                              <button
                                onClick={() => {
                                  if (isViewingToday) {
                                    deleteFood(food.id)
                                  } else {
                                    // For history view, use the database id
                                    deleteHistoryFood((food as any).dbId)
                                  }
                                }}
                                className="w-full px-4 py-3 text-left text-sm text-red-600 hover:bg-red-50 flex items-center border-t border-gray-100 transition-colors"
                              >
                                <svg className="w-4 h-4 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                                <div>
                                  <div className="font-medium">Delete Entry</div>
                                  <div className="text-xs text-gray-500">Remove from food diary</div>
                                </div>
                              </button>
                            </div>
                          )}
                        </div>
                        {/* Expand/Collapse Toggle */}
                        <button
                          onClick={() => toggleExpanded(food.id.toString())}
                          className="p-1.5 sm:p-2 rounded-lg hover:bg-gray-200 transition-colors"
                        >
                          <svg 
                            className={`w-4 h-4 sm:w-5 sm:h-5 text-gray-400 transition-transform duration-200 ${
                              expandedEntries[food.id.toString()] ? 'rotate-180' : ''
                            }`} 
                            fill="none" 
                            stroke="currentColor" 
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                      </div>
                      </div>
                  </div>

                  {/* Expandable Content */}
                  {expandedEntries[food.id.toString()] && (
                    <div className="border-t border-gray-100 p-4 bg-gray-50">
                      {/* Full description when expanded */}
                      <p className="mb-3 text-sm text-gray-800 whitespace-pre-line">
                        {food.description.split('Calories:')[0].trim()}
                      </p>
                      <div className="flex flex-col sm:flex-row gap-4">
                        {/* Food Image */}
                        {food.photo && (
                          <div className="w-full sm:w-32 sm:flex-shrink-0 mb-4 sm:mb-0">
                            <div className="relative">
                              {foodImagesLoading[food.id] && (
                                <div className="absolute inset-0 bg-gray-100 rounded-lg animate-pulse flex items-center justify-center">
                                  <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                  </svg>
                                </div>
                              )}
                              <Image
                                src={food.photo}
                                alt="Food"
                                width={128}
                                height={128}
                                className={`w-full sm:w-32 aspect-square object-cover rounded-lg cursor-pointer hover:opacity-80 transition-opacity ${foodImagesLoading[food.id] ? 'opacity-0' : 'opacity-100'}`}
                                onLoadStart={() => setFoodImagesLoading(prev => ({...prev, [food.id]: true}))}
                                onLoad={() => setFoodImagesLoading(prev => ({...prev, [food.id]: false}))}
                                onError={() => setFoodImagesLoading(prev => ({...prev, [food.id]: false}))}
                                onClick={() => setFullSizeImage(food.photo)}
                                loading="lazy"
                              />
                            </div>
                          </div>
                        )}

                        {/* Per-meal macro ring */}
                        <div className="flex-1 sm:max-w-md lg:max-w-lg">
                          {(() => {
                            // Use ingredient cards as the single source of truth for per-meal totals.
                            // Fall back to stored totals only when items are missing (older entries).
                            const summaryTotals = (() => {
                              if (Array.isArray(food.items) && food.items.length > 0) {
                                const recalculated = recalculateNutritionFromItems(food.items)
                                if (recalculated) return recalculated
                              }
                              return (
                                sanitizeNutritionTotals((food as any).total) ||
                                sanitizeNutritionTotals(food.nutrition) || {
                                  calories: 0,
                                  protein: 0,
                                  carbs: 0,
                                  fat: 0,
                                  fiber: 0,
                                  sugar: 0,
                                }
                              )
                            })()

                            const mealMacros: MacroSegment[] = [
                              {
                                key: 'protein',
                                label: 'Protein',
                                grams: (summaryTotals as any)?.protein ?? 0,
                                color: '#ef4444',
                              },
                              {
                                key: 'fibre',
                                label: 'Fibre',
                                grams: (summaryTotals as any)?.fiber ?? 0,
                                color: '#93c5fd',
                              },
                              {
                                key: 'carbs',
                                label: 'Carbs',
                                grams: (summaryTotals as any)?.carbs ?? 0,
                                color: '#22c55e',
                              },
                              {
                                key: 'sugar',
                                label: 'Sugar',
                                grams: (summaryTotals as any)?.sugar ?? 0,
                                color: '#f97316',
                              },
                              {
                                key: 'fat',
                                label: 'Fat',
                                grams: (summaryTotals as any)?.fat ?? 0,
                                color: '#6366f1',
                              },
                            ]

                            const mealEnergyKcal = Number(
                              (summaryTotals as any)?.calories ?? 0,
                            )
                            
                            const mealEnergyInUnit = energyUnit === 'kJ' 
                              ? Math.round(mealEnergyKcal * 4.184) 
                              : Math.round(mealEnergyKcal)

                            return (
                              <div className="flex flex-row gap-4 items-start">
                                <button
                                  type="button"
                                  className="flex flex-col items-center flex-shrink-0 focus:outline-none"
                                  onClick={() =>
                                    setMacroPopup({
                                      title: 'Meal macro breakdown',
                                      energyLabel:
                                        Number.isFinite(mealEnergyKcal) && mealEnergyKcal > 0
                                          ? `${Math.round(mealEnergyKcal)} kcal`
                                          : undefined,
                                      macros: mealMacros,
                                    })
                                  }
                                >
                                  <div className="relative inline-block">
                                    <MacroRing macros={mealMacros} showLegend={false} size="large" />
                                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                                      <div className="text-xl font-bold text-gray-900">
                                        {Number.isFinite(mealEnergyKcal) && mealEnergyKcal > 0
                                          ? mealEnergyInUnit
                                          : '—'}
                                      </div>
                                      <div className="text-xs text-gray-500 mt-0.5">
                                        {energyUnit}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="mt-2 text-sm font-semibold text-gray-700">
                                    Macro breakdown
                                  </div>
                                </button>
                                <div className="flex-1">
                                  <div className="space-y-2 text-sm text-gray-700">
                                    <div className="flex items-center gap-2">
                                      <span className="inline-block w-3 h-3 rounded-full bg-red-500" />
                                      <span>
                                        Protein{' '}
                                        {Number.isFinite((summaryTotals as any)?.protein)
                                          ? `${Math.round(
                                              (summaryTotals as any)?.protein as number,
                                            )} g`
                                          : '—'}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="inline-block w-3 h-3 rounded-full bg-blue-300" />
                                      <span>
                                        Fibre{' '}
                                        {Number.isFinite((summaryTotals as any)?.fiber)
                                          ? `${Math.round(
                                              (summaryTotals as any)?.fiber as number,
                                            )} g`
                                          : '—'}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="inline-block w-3 h-3 rounded-full bg-emerald-500" />
                                      <span>
                                        Carbs{' '}
                                        {Number.isFinite((summaryTotals as any)?.carbs)
                                          ? `${Math.round(
                                              (summaryTotals as any)?.carbs as number,
                                            )} g`
                                          : '—'}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="inline-block w-3 h-3 rounded-full bg-amber-500" />
                                      <span>
                                        Sugar{' '}
                                        {Number.isFinite((summaryTotals as any)?.sugar)
                                          ? `${Math.round(
                                              (summaryTotals as any)?.sugar as number,
                                            )} g`
                                          : '—'}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="inline-block w-3 h-3 rounded-full bg-indigo-500" />
                                      <span>
                                        Fat{' '}
                                        {Number.isFinite((summaryTotals as any)?.fat)
                                          ? `${Math.round(
                                              (summaryTotals as any)?.fat as number,
                                            )} g`
                                          : '—'}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )
                          })()}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
            </>
          )}
        </div>
        )}

      {/* Macro breakdown popup */}
      {macroPopup && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={() => setMacroPopup(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <h2 className="text-base sm:text-lg font-semibold text-gray-900">
                  {macroPopup.title}
                </h2>
                {macroPopup.energyLabel && (
                  <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
                    Total energy: {macroPopup.energyLabel}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setMacroPopup(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <span className="sr-only">Close</span>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex flex-col items-center">
              <MacroRing macros={macroPopup.macros} showLegend size="large" />
              <button
                type="button"
                onClick={() => setMacroPopup(null)}
                className="mt-4 inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-full bg-gray-900 text-white hover:bg-gray-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

        {/* Full Size Image Modal */}
        {fullSizeImage && (
          <div 
            className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"
            onClick={() => setFullSizeImage(null)}
          >
            <div className="relative max-w-4xl max-h-full">
              <button
                onClick={() => setFullSizeImage(null)}
                className="absolute -top-12 right-0 text-white hover:text-gray-300 transition-colors"
              >
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <Image
                src={fullSizeImage}
                alt="Full size food image"
                width={800}
                height={600}
                className="max-w-full max-h-full object-contain rounded-lg"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          </div>
        )}
      </div>

      {/* Credit Purchase Modal */}
      <CreditPurchaseModal
        isOpen={showCreditsModal}
        onClose={() => setShowCreditsModal(false)}
        creditInfo={creditInfo}
      />

      {/* Mobile Bottom Navigation - with pressed, ripple and active states */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-2 z-40">
        <div className="flex items-center justify-around">
          <Link href="/dashboard" className="pressable ripple flex flex-col items-center py-2 px-1 min-w-0 flex-1" onClick={() => { try { const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')?.matches; const pref = localStorage.getItem('hapticsEnabled'); const enabled = pref === null ? true : pref === 'true'; if (enabled && !reduced && 'vibrate' in navigator) navigator.vibrate(10) } catch {} }}>
            <div className={`icon ${pathname === '/dashboard' ? 'text-helfi-green' : 'text-gray-400'}`}>
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/>
              </svg>
            </div>
            <span className={`label text-xs mt-1 truncate ${pathname === '/dashboard' ? 'text-helfi-green font-bold' : 'text-gray-400 font-medium'}`}>Dashboard</span>
          </Link>

          <Link href="/insights" className="pressable ripple flex flex-col items-center py-2 px-1 min-w-0 flex-1" onClick={() => { try { const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')?.matches; const pref = localStorage.getItem('hapticsEnabled'); const enabled = pref === null ? true : pref === 'true'; if (enabled && !reduced && 'vibrate' in navigator) navigator.vibrate(10) } catch {} }}>
            <div className={`icon ${pathname === '/insights' ? 'text-helfi-green' : 'text-gray-400'}`}>
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <span className={`label text-xs mt-1 truncate ${pathname === '/insights' ? 'text-helfi-green font-bold' : 'text-gray-400 font-medium'}`}>Insights</span>
          </Link>

          <Link href="/food" className="pressable ripple flex flex-col items-center py-2 px-1 min-w-0 flex-1" onClick={() => { try { const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')?.matches; const pref = localStorage.getItem('hapticsEnabled'); const enabled = pref === null ? true : pref === 'true'; if (enabled && !reduced && 'vibrate' in navigator) navigator.vibrate(10) } catch {} }}>
            <div className={`icon ${pathname === '/food' ? 'text-helfi-green' : 'text-gray-400'}`}>
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <span className={`label text-xs mt-1 truncate ${pathname === '/food' ? 'text-helfi-green font-bold' : 'text-gray-400 font-medium'}`}>Food</span>
          </Link>

          <MobileMoreMenu />

          <Link href="/settings" className="pressable ripple flex flex-col items-center py-2 px-1 min-w-0 flex-1" onClick={() => { try { const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')?.matches; const pref = localStorage.getItem('hapticsEnabled'); const enabled = pref === null ? true : pref === 'true'; if (enabled && !reduced && 'vibrate' in navigator) navigator.vibrate(10) } catch {} }}>
            <div className={`icon ${pathname === '/settings' ? 'text-helfi-green' : 'text-gray-400'}`}>
              <Cog6ToothIcon className="w-6 h-6 flex-shrink-0" style={{ minWidth: '24px', minHeight: '24px' }} />
            </div>
            <span className={`label text-xs mt-1 truncate ${pathname === '/settings' ? 'text-helfi-green font-bold' : 'text-gray-400 font-medium'}`}>Settings</span>
          </Link>
        </div>
      </nav>
      </div>
    </div>
  )
}
