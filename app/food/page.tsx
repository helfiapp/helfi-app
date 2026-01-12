'use client'
import { Cog6ToothIcon, HandThumbDownIcon, HandThumbUpIcon, UserIcon } from '@heroicons/react/24/outline'
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
 *
 * ⚠️ Additional lock (GUARD_RAILS.md §3.9):
 * - Do NOT change servings/pieces/weight sync or `piecesPerServing` defaults.
 * - Do NOT weaken patty/cheese/bacon/egg per-piece macros/weights.
 * - Keep the analyzed photo compact on desktop; keep category “+” visible.
 * Any change requires explicit written approval from the user.
 */

import React, { useState, useEffect, useMemo, useRef, useCallback, Component } from 'react'
import { useSession, signOut } from 'next-auth/react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { useUserData } from '@/components/providers/UserDataProvider'
import MobileMoreMenu from '@/components/MobileMoreMenu'
import UsageMeter from '@/components/UsageMeter'
import FeatureUsageDisplay from '@/components/FeatureUsageDisplay'
import CreditPurchaseModal from '@/components/CreditPurchaseModal'
import { STARTER_FOODS } from '@/data/foods-starter'
import { COMMON_USDA_FOODS } from '@/data/usda-common'
import { calculateDailyTargets } from '@/lib/daily-targets'
import { AI_MEAL_RECOMMENDATION_CREDITS, AI_MEAL_RECOMMENDATION_GOAL_NAME } from '@/lib/ai-meal-recommendation'
import { SolidMacroRing } from '@/components/SolidMacroRing'
import { checkMultipleDietCompatibility, normalizeDietTypes } from '@/lib/diets'
import { DEFAULT_HEALTH_CHECK_SETTINGS, normalizeHealthCheckSettings } from '@/lib/food-health-check-settings'
import { readAppHiddenAt } from '@/lib/app-visibility'

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
  { key: 'calories', field: 'calories', label: 'Calories', unit: '', valueClass: 'text-orange-600', labelClass: 'text-orange-400', bg: 'bg-orange-50 dark:bg-orange-900/10', border: 'border-orange-100 dark:border-orange-900/20' },
  { key: 'protein', field: 'protein_g', label: 'Protein', unit: 'g', valueClass: 'text-blue-600', labelClass: 'text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/10', border: 'border-blue-100 dark:border-blue-900/20' },
  { key: 'carbs', field: 'carbs_g', label: 'Carbs', unit: 'g', valueClass: 'text-purple-600', labelClass: 'text-purple-400', bg: 'bg-purple-50 dark:bg-purple-900/10', border: 'border-purple-100 dark:border-purple-900/20' },
  { key: 'fat', field: 'fat_g', label: 'Fat', unit: 'g', valueClass: 'text-yellow-600', labelClass: 'text-yellow-400', bg: 'bg-yellow-50 dark:bg-yellow-900/10', border: 'border-yellow-100 dark:border-yellow-900/20' },
  { key: 'fiber', field: 'fiber_g', label: 'Fiber', unit: 'g', valueClass: 'text-green-600', labelClass: 'text-green-400', bg: 'bg-green-50 dark:bg-green-900/10', border: 'border-green-100 dark:border-green-900/20' },
  { key: 'sugar', field: 'sugar_g', label: 'Sugar', unit: 'g', valueClass: 'text-rose-600', labelClass: 'text-rose-400', bg: 'bg-rose-50 dark:bg-rose-900/10', border: 'border-rose-100 dark:border-rose-900/20' },
] as const

type NutritionTotals = {
  calories: number | null
  protein: number | null
  carbs: number | null
  fat: number | null
  fiber: number | null
  sugar: number | null
}

type HealthCheckPromptPayload = {
  entryId: string
  description: string
  totals: NutritionTotals
  items: any[] | null
}

type HealthCheckResult = {
  summary: string
  issues: { issue: string; why: string }[]
  flags: string[]
  triggers: { key: string; label: string; value: number; limit: number; unit: string }[]
  alternative: string | null
}

type WaterLogEntry = {
  id: string
  amount: number
  unit: string
  amountMl: number
  label?: string | null
  category?: string | null
  localDate: string
  createdAt: string
}

const HEALTH_CHECK_THRESHOLDS = { sugar: 30, carbs: 90, fat: 35 } as const
const HEALTH_CHECK_COST_CREDITS = 2
const HEALTH_CHECK_PROMPT_STORAGE_KEY = 'food:healthCheckPrompted'
const HEALTH_CHECK_PROMPT_CACHE_LIMIT = 200
const HEALTH_CHECK_DAILY_CAP_KEY = 'food:healthCheckDailyCap'

const HEALTH_TRIGGER_META: Record<string, { color: string; accent: string }> = {
  sugar: { color: '#f97316', accent: 'text-orange-600' },
  carbs: { color: '#22c55e', accent: 'text-green-600' },
  fat: { color: '#6366f1', accent: 'text-indigo-600' },
}

const HEALTHY_FAT_KEYWORDS = [
  'salmon',
  'sardine',
  'tuna',
  'mackerel',
  'trout',
  'avocado',
  'olive oil',
  'olives',
  'nuts',
  'almond',
  'walnut',
  'pistachio',
  'macadamia',
  'hazelnut',
  'pecan',
  'chia',
  'flax',
  'linseed',
  'hemp',
  'seeds',
  'sunflower',
  'pumpkin',
  'peanut',
  'tahini',
] as const

const UNHEALTHY_FAT_KEYWORDS = [
  'fried',
  'deep fried',
  'deep-fried',
  'battered',
  'breaded',
  'tempura',
  'crispy',
  'fries',
] as const

const formatServingsDisplay = (value: number | null | undefined) => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return '1'
  // Normalize to 2dp but guard against floating drift (e.g. 1.249999 → 1.25)
  const normalized = Math.round(numeric * 1000) / 1000 // 3dp safety
  const rounded = Math.round(normalized * 100) / 100
  if (Number.isInteger(rounded)) return String(rounded)
  return rounded.toFixed(2).replace(/\.0+$/, '').replace(/(\.[1-9])0$/, '$1')
}

const formatWaterNumber = (value: number) => {
  if (Number.isInteger(value)) return String(value)
  return value.toFixed(2).replace(/\.0+$/, '').replace(/(\.[1-9])0$/, '$1')
}

const formatWaterMl = (ml: number | null | undefined) => {
  const value = Number(ml ?? 0)
  if (!Number.isFinite(value) || value <= 0) return '0 ml'
  if (value >= 1000) {
    const liters = Math.round((value / 1000) * 100) / 100
    return `${formatWaterNumber(liters)} L`
  }
  return `${Math.round(value)} ml`
}

const formatWaterEntryAmount = (entry: { amount?: number; unit?: string; amountMl?: number }) => {
  const amount = Number(entry?.amount ?? 0)
  const unitRaw = String(entry?.unit || '').trim().toLowerCase()
  if (Number.isFinite(amount) && amount > 0 && unitRaw) {
    const unit = unitRaw === 'l' ? 'L' : unitRaw
    return `${formatWaterNumber(amount)} ${unit}`
  }
  return formatWaterMl(Number(entry?.amountMl ?? 0))
}

type DrinkAmountOverride = {
  amount: number
  unit: 'ml' | 'l' | 'oz'
  amountMl: number
}

const normalizeDrinkUnit = (value: string | null | undefined): DrinkAmountOverride['unit'] | null => {
  const raw = String(value || '').trim().toLowerCase()
  if (raw === 'ml' || raw === 'milliliter' || raw === 'millilitre') return 'ml'
  if (raw === 'l' || raw === 'liter' || raw === 'litre') return 'l'
  if (raw === 'oz' || raw === 'ounce' || raw === 'ounces' || raw === 'fl oz' || raw === 'floz') return 'oz'
  return null
}

const parseDrinkOverrideFromParams = (params: URLSearchParams): DrinkAmountOverride | null => {
  const rawAmount = params.get('drinkAmount')
  const rawUnit = params.get('drinkUnit')
  const amount = Number(rawAmount)
  if (!Number.isFinite(amount) || amount <= 0) return null
  const unit = normalizeDrinkUnit(rawUnit)
  if (!unit) return null
  const amountMl = unit === 'l' ? amount * 1000 : unit === 'oz' ? amount * 29.5735 : amount
  if (!Number.isFinite(amountMl) || amountMl <= 0) return null
  return { amount, unit, amountMl }
}

const parseDrinkTypeFromParams = (params: URLSearchParams): string | null => {
  const raw = params.get('drinkType')
  if (!raw) return null
  const trimmed = raw.trim()
  return trimmed ? trimmed : null
}

const parseDrinkWaterLogIdFromParams = (params: URLSearchParams): string | null => {
  const raw = params.get('waterLogId')
  if (!raw) return null
  const trimmed = raw.trim()
  return trimmed ? trimmed : null
}

const formatDrinkOverrideLabel = (override: DrinkAmountOverride) => {
  const unitLabel = override.unit === 'l' ? 'L' : override.unit
  return `${formatWaterNumber(override.amount)} ${unitLabel}`
}

type DrinkEntryMeta = {
  type: string
  amount: number
  unit: DrinkAmountOverride['unit']
  amountMl: number
  waterLogId?: string | null
}

const buildDrinkEntryMeta = (
  override: DrinkAmountOverride | null,
  drinkType: string | null,
  waterLogId?: string | null,
): DrinkEntryMeta | null => {
  if (!override || !drinkType) return null
  const type = drinkType.trim()
  if (!type) return null
  const amount = Number(override.amount)
  if (!Number.isFinite(amount) || amount <= 0) return null
  const unit = override.unit
  const amountMl = Number.isFinite(override.amountMl)
    ? override.amountMl
    : unit === 'l'
    ? amount * 1000
    : unit === 'oz'
    ? amount * 29.5735
    : amount
  return {
    type,
    amount,
    unit,
    amountMl,
    waterLogId: waterLogId ? String(waterLogId) : null,
  }
}

const applyDrinkMetaToTotals = (totals: any, meta: DrinkEntryMeta | null) => {
  if (!meta) return totals
  const base = totals && typeof totals === 'object' ? { ...totals } : {}
  return {
    ...base,
    __drinkType: meta.type,
    __drinkAmount: meta.amount,
    __drinkUnit: meta.unit,
    __drinkAmountMl: Number.isFinite(meta.amountMl) ? meta.amountMl : undefined,
    ...(meta.waterLogId ? { __waterLogId: meta.waterLogId } : {}),
  }
}

const getDrinkMetaFromEntry = (entry: any): DrinkEntryMeta | null => {
  const source =
    entry?.nutrition && typeof entry.nutrition === 'object'
      ? entry.nutrition
      : entry?.total && typeof entry.total === 'object'
      ? entry.total
      : null
  if (!source) return null
  const type = typeof source.__drinkType === 'string' ? source.__drinkType.trim() : ''
  if (!type) return null
  const unit = normalizeDrinkUnit(source.__drinkUnit) || 'ml'
  const amount = Number(source.__drinkAmount)
  const amountMlRaw = Number(source.__drinkAmountMl)
  const amountMl = Number.isFinite(amountMlRaw)
    ? amountMlRaw
    : Number.isFinite(amount) && amount > 0
    ? unit === 'l'
      ? amount * 1000
      : unit === 'oz'
      ? amount * 29.5735
      : amount
    : NaN
  const waterLogId = source.__waterLogId ? String(source.__waterLogId) : null
  return {
    type,
    amount,
    unit,
    amountMl,
    waterLogId,
  }
}

const formatDrinkEntryAmount = (meta: DrinkEntryMeta | null) => {
  if (!meta) return ''
  if (Number.isFinite(meta.amount) && meta.amount > 0) {
    const unitLabel = meta.unit === 'l' ? 'L' : meta.unit
    return `${formatWaterNumber(meta.amount)} ${unitLabel}`
  }
  if (Number.isFinite(meta.amountMl) && meta.amountMl > 0) return formatWaterMl(meta.amountMl)
  return ''
}

const WATER_ICON_BY_LABEL: Record<string, string> = {
  water: '/mobile-assets/MOBILE ICONS/WATER.png',
  coffee: '/mobile-assets/MOBILE ICONS/COFFEE.png',
  tea: '/mobile-assets/MOBILE ICONS/TEA.png',
  juice: '/mobile-assets/MOBILE ICONS/JUICE.png',
  'hot chocolate': '/mobile-assets/MOBILE ICONS/HOT CHOCOLATE.png',
  'soft drink': '/mobile-assets/MOBILE ICONS/SOFT DRINK.png',
  alcohol: '/mobile-assets/MOBILE ICONS/ALCOHOL.png',
}

const normalizeWaterLabel = (label?: string | null) => {
  const raw = String(label || '').toLowerCase()
  const withoutParens = raw.replace(/\([^)]*\)/g, '')
  const withoutSugarHints = withoutParens
    .replace(/\bwith\s+sugar\b/g, '')
    .replace(/\bcontains\s+sugar\b/g, '')
    .replace(/\bsugar[-\s]?free\b/g, '')
    .replace(/\bno\s+sugar\b/g, '')
    .replace(/\bwith\s+no\s+sugar\b/g, '')
  return withoutSugarHints.replace(/\s+/g, ' ').trim()
}

const getWaterIconSrc = (label?: string | null) => {
  const key = normalizeWaterLabel(label)
  return WATER_ICON_BY_LABEL[key] ?? WATER_ICON_BY_LABEL.water
}

const isInlineImageSrc = (src: string | null | undefined) =>
  typeof src === 'string' && (src.startsWith('data:') || src.startsWith('blob:'))

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const containsHealthyFat = (text: string) => {
  const lower = text.toLowerCase()
  return HEALTHY_FAT_KEYWORDS.some((keyword) => {
    const needle = keyword.toLowerCase()
    if (needle.includes(' ')) return lower.includes(needle)
    try {
      return new RegExp(`\\b${escapeRegex(needle)}\\b`).test(lower)
    } catch {
      return lower.includes(needle)
    }
  })
}

const containsUnhealthyFat = (text: string) => {
  const lower = text.toLowerCase()
  return UNHEALTHY_FAT_KEYWORDS.some((keyword) => {
    const needle = keyword.toLowerCase()
    if (needle.includes(' ')) return lower.includes(needle)
    try {
      return new RegExp(`\\b${escapeRegex(needle)}\\b`).test(lower)
    } catch {
      return lower.includes(needle)
    }
  })
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
    const piecesCount = Number((item as any)?.piecesPerServing) || Number((item as any)?.pieces)
    if (Number.isFinite(piecesCount) && piecesCount > 1) {
      pieces.push(`${Math.round(piecesCount)}`)
    } else if (Number.isFinite(servings) && Math.abs(servings - 1) > 0.001) {
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

const stripNutritionFromServingSize = (raw: string) => {
  return String(raw || '')
    .replace(/\([^)]*(calories?|kcal|kilojoules?|kj|protein|carbs?|fat|fibre|fiber|sugar)[^)]*\)/gi, '')
    .replace(/\b\d+(?:\.\d+)?\s*(kcal|cal|kj)\b[^,)]*(?:protein|carb|fat|fiber|fibre|sugar)[^,)]*/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const buildTodayIso = () => {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const alignTimestampToLocalDate = (rawCreatedAt: any, localDate?: string | null) => {
  const base = rawCreatedAt ? new Date(rawCreatedAt) : new Date()
  const safeBase = Number.isFinite(base.getTime()) ? base : new Date()
  if (typeof localDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(localDate)) {
    const [y, m, d] = localDate.split('-').map((v) => parseInt(v, 10))
    if (Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d)) {
      const anchored = new Date(
        y,
        (m || 1) - 1,
        d || 1,
        safeBase.getHours(),
        safeBase.getMinutes(),
        safeBase.getSeconds(),
        safeBase.getMilliseconds(),
      )
      return anchored.toISOString()
    }
  }
  return safeBase.toISOString()
}

const BARCODE_REGION_ID = 'food-barcode-reader'
const EMPTY_TOTALS = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0 }

class DiaryErrorBoundary extends Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: any) {
    super(props)
    this.state = { hasError: false }
  }
  static getDerivedStateFromError() {
    return { hasError: true }
  }
  componentDidCatch(error: any, info: any) {
    console.error('Diary render error', error, info)
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 text-center text-sm text-red-700 bg-red-50 border border-red-200">
          Something went wrong loading this entry. Please reload. If it repeats, copy the console error and share it.
        </div>
      )
    }
    return this.props.children
  }
}

type WarmDiaryState = {
  selectedDate?: string
  todaysFoods?: any[]
  historyByDate?: Record<string, any[]>
  expandedCategories?: Record<string, boolean>
}

const readWarmDiaryState = (): WarmDiaryState | null => {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem('foodDiary:warmState')
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    return parsed as WarmDiaryState
  } catch (err) {
    console.warn('Unable to read warm diary cache', err)
    return null
  }
}

type DiarySnapshotDate = {
  entries: any[]
  expandedCategories?: Record<string, boolean>
  normalized?: boolean
}

type DiarySnapshot = {
  byDate: Record<string, DiarySnapshotDate>
}

type ExerciseSnapshot = {
  entries: any[]
  caloriesKcal: number
  savedAt: number
}

type ExerciseSnapshotStore = Record<string, ExerciseSnapshot>

type DeviceStatusSnapshot = {
  fitbitConnected: boolean
  garminConnected: boolean
  savedAt: number
}

type DeviceStatusSnapshotStore = Record<string, DeviceStatusSnapshot>

const DEVICE_STATUS_TTL_MS = 5 * 60 * 1000
const DEVICE_STATUS_SNAPSHOT_KEY = 'foodDiary:deviceStatus'

type FavoritesAllSnapshot = {
  entries: any[]
  savedAt: number
}

type FavoritesAllSnapshotStore = Record<string, FavoritesAllSnapshot>

const FAVORITES_ALL_SNAPSHOT_TTL_MS = 5 * 60 * 1000
const FAVORITES_ALL_SNAPSHOT_KEY = 'foodDiary:favoritesAllSnapshot'
const FOOD_RESUME_LAST_PREFIX = 'food:resume:last:'
const FOOD_DIARY_LAST_VISIT_KEY = 'food:diary:lastVisitDate'

const readPersistentDiarySnapshot = (): DiarySnapshot | null => {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem('foodDiary:persistentSnapshot')
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    return parsed as DiarySnapshot
  } catch {
    return null
  }
}

const readExerciseSnapshot = (dateKey: string): ExerciseSnapshot | null => {
  if (typeof window === 'undefined') return null
  if (!dateKey) return null
  try {
    const raw = sessionStorage.getItem('foodDiary:exerciseSnapshot')
    if (!raw) return null
    const parsed = JSON.parse(raw) as ExerciseSnapshotStore
    const entry = parsed?.[dateKey]
    if (!entry || !Array.isArray(entry.entries)) return null
    return entry
  } catch {
    return null
  }
}

const writeExerciseSnapshot = (dateKey: string, entries: any[], caloriesKcal: number) => {
  if (typeof window === 'undefined') return
  if (!dateKey) return
  try {
    const raw = sessionStorage.getItem('foodDiary:exerciseSnapshot')
    const parsed = raw ? (JSON.parse(raw) as ExerciseSnapshotStore) : {}
    parsed[dateKey] = {
      entries: Array.isArray(entries) ? entries : [],
      caloriesKcal: Number(caloriesKcal) || 0,
      savedAt: Date.now(),
    }
    sessionStorage.setItem('foodDiary:exerciseSnapshot', JSON.stringify(parsed))
  } catch {}
}

const readFavoritesAllSnapshot = (userKey?: string): any[] | null => {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(FAVORITES_ALL_SNAPSHOT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as FavoritesAllSnapshotStore
    const key = userKey || 'last'
    const entry = parsed?.[key] || parsed?.last
    if (!entry || !Array.isArray(entry.entries)) return null
    const savedAt = Number(entry.savedAt) || 0
    if (!savedAt || Date.now() - savedAt > FAVORITES_ALL_SNAPSHOT_TTL_MS) return null
    return entry.entries
  } catch {
    return null
  }
}

const readFoodResumeStamp = (scope: string): number => {
  if (typeof window === 'undefined') return 0
  if (!scope) return 0
  try {
    const raw = window.sessionStorage.getItem(`${FOOD_RESUME_LAST_PREFIX}${scope}`)
    const parsed = raw ? Number(raw) : 0
    return Number.isFinite(parsed) ? parsed : 0
  } catch {
    return 0
  }
}

const shouldRefreshOnResume = (scope: string): boolean => {
  if (typeof window === 'undefined') return false
  const hiddenAt = readAppHiddenAt()
  if (!hiddenAt) return false
  const lastHandled = readFoodResumeStamp(scope)
  return hiddenAt > lastHandled
}

const markResumeHandled = (scope: string) => {
  if (typeof window === 'undefined') return
  if (!scope) return
  try {
    window.sessionStorage.setItem(`${FOOD_RESUME_LAST_PREFIX}${scope}`, String(Date.now()))
  } catch {}
}

const writeFavoritesAllSnapshot = (userKey: string | null | undefined, entries: any[]) => {
  if (typeof window === 'undefined') return
  if (!Array.isArray(entries)) return
  try {
    const raw = sessionStorage.getItem(FAVORITES_ALL_SNAPSHOT_KEY)
    const parsed = raw ? (JSON.parse(raw) as FavoritesAllSnapshotStore) : {}
    const key = userKey || 'last'
    const payload: FavoritesAllSnapshot = { entries, savedAt: Date.now() }
    parsed[key] = payload
    parsed.last = payload
    sessionStorage.setItem(FAVORITES_ALL_SNAPSHOT_KEY, JSON.stringify(parsed))
  } catch {}
}

const readDeviceStatusSnapshot = (userKey?: string): DeviceStatusSnapshot | null => {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(DEVICE_STATUS_SNAPSHOT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as DeviceStatusSnapshotStore
    const key = userKey || 'last'
    const entry = parsed?.[key] || parsed?.last
    if (!entry) return null
    const savedAt = Number(entry.savedAt) || 0
    if (!savedAt || Date.now() - savedAt > DEVICE_STATUS_TTL_MS) return null
    return {
      fitbitConnected: Boolean(entry.fitbitConnected),
      garminConnected: Boolean(entry.garminConnected),
      savedAt,
    }
  } catch {
    return null
  }
}

const writeDeviceStatusSnapshot = (userKey: string | null | undefined, snapshot: DeviceStatusSnapshot) => {
  if (typeof window === 'undefined') return
  try {
    const raw = sessionStorage.getItem(DEVICE_STATUS_SNAPSHOT_KEY)
    const parsed = raw ? (JSON.parse(raw) as DeviceStatusSnapshotStore) : {}
    const key = userKey || 'last'
    parsed[key] = snapshot
    parsed.last = snapshot
    sessionStorage.setItem(DEVICE_STATUS_SNAPSHOT_KEY, JSON.stringify(parsed))
  } catch {}
}

const writePersistentDiarySnapshot = (snapshot: DiarySnapshot) => {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem('foodDiary:persistentSnapshot', JSON.stringify(snapshot))
  } catch {
    // Best effort; ignore quota errors
  }
}


  const normalizeFoodName = (name: string | null | undefined) =>
    String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

  const normalizeCategory = (raw: any) => {
    const value = String(raw || '').toLowerCase()
    if (/breakfast/.test(value)) return 'breakfast'
    if (/lunch/.test(value)) return 'lunch'
    if (/dinner/.test(value)) return 'dinner'
    if (/snack/.test(value)) return 'snacks'
    if (/other/.test(value)) return 'uncategorized'
    if (/uncat/.test(value)) return 'uncategorized'
    return 'uncategorized'
  }

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

const formatEnergyNumber = (value: number | null | undefined, unit: 'kcal' | 'kJ') => {
  if (value === null || value === undefined) return '—'
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return '—'
  const baseKcal = numeric
  const display = unit === 'kJ' ? baseKcal * KCAL_TO_KJ : baseKcal
  const rounded = unit === 'kJ' ? Math.round(display) : Math.round(display)
  return `${rounded}`
}

const formatServingSizeDisplay = (label: string, item: any) => {
  const base = label && label.trim().length > 0 ? label.trim() : 'Not specified'
  if (item?.labelNeedsReview) return base
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

const formatPieceDisplay = (value: number | null | undefined) => {
  if (value === null || value === undefined) return ''
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return ''
  const rounded = Math.round(numeric * 100) / 100
  if (Math.abs(rounded - Math.round(rounded)) <= 0.01) {
    return String(Math.round(rounded))
  }
  return String(rounded)
}

const normalizeAllCapsLabel = (value: string) => {
  const trimmed = value.trim()
  if (!trimmed) return trimmed
  const lettersOnly = trimmed.replace(/[^A-Za-z]+/g, '')
  if (!lettersOnly) return trimmed
  if (/[a-z]/.test(lettersOnly)) return trimmed
  const lowered = trimmed.toLowerCase()
  return lowered.replace(/^./, (c) => c.toUpperCase())
}

// Normalize meal descriptions to drop boilerplate like "This image shows..."
const sanitizeMealDescription = (text: string | null | undefined) => {
  if (!text) return ''
  const stripped = text
    .replace(/^(the\s+image\s+shows|this\s+image\s+shows|i\s+can\s+see|based\s+on\s+the\s+image|the\s+food\s+appears\s+to\s+be|this\s+appears\s+to\s+be)\s*/i, '')
    .trim()
  if (!stripped) return ''
  const normalized = normalizeAllCapsLabel(stripped)
  return normalized.replace(/^./, (c) => c.toUpperCase())
}

const extractBaseMealDescription = (value: string | null | undefined) => {
  if (!value) return ''
  const withoutNutrition = value.replace(/Calories:[\s\S]*/i, '').trim()
  const firstLine = withoutNutrition.split('\n').map((line) => line.trim()).find(Boolean)
  return sanitizeMealDescription(firstLine || value.trim())
}

type RingProps = {
  label: string
  valueLabel: string
  percent: number
  tone: 'primary' | 'target'
  color?: string
}

function TargetRing({ label, valueLabel, percent, tone, color }: RingProps) {
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
              stroke={color || '#22c55e'}
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
          <div className="text-xl font-bold text-gray-900 leading-[1.35] pt-0.5 tabular-nums">{mainValue}</div>
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

const isFractionalServingQuantity = (quantity: number | null | undefined) =>
  Number.isFinite(quantity) && (quantity as number) > 0 && (quantity as number) < 1

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

const isGenericSizeLabel = (label: string) => {
  const l = (label || '').toLowerCase().trim()
  if (!l) return false
  return [
    'small',
    'medium',
    'large',
    'extra large',
    'extra-large',
    'xl',
    'jumbo',
    'mini',
    'regular',
  ].includes(l)
}

const parseServingUnitMetadata = (servingSize: string | number | null | undefined) => {
  if (servingSize === null || servingSize === undefined) return null
  const normalized = typeof servingSize === 'string' ? servingSize : String(servingSize)
  if (!normalized.trim()) return null
  // Base parse (may pick up grams first)
  let quantity = parseServingQuantity(normalized)
  let unitLabel = ''
  const numberToken = normalized.match(/(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)/)
  unitLabel = numberToken ? normalized.replace(numberToken[0], '').trim().replace(/^of\s+/i, '').trim() : normalized.trim()

  // If parentheses contain a discrete count (e.g., "(6 crackers)"), prefer that for step sizing.
  const parenSegments = normalized.match(/\(([^)]*)\)/g) || []
  for (const seg of parenSegments) {
    const cleaned = seg.replace(/[()]/g, '').trim()
    const altQty = parseServingQuantity(cleaned)
    const altNumberToken = cleaned.match(/(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)/)
    const altUnit = altNumberToken ? cleaned.replace(altNumberToken[0], '').trim().replace(/^of\s+/i, '').trim() : cleaned
    if (altQty && altQty > 0 && isDiscreteUnitLabel(altUnit)) {
      quantity = altQty
      unitLabel = altUnit
      break
    }
  }

  if (!quantity || quantity <= 0) return null
  return {
    quantity,
    unitLabel: unitLabel || 'unit',
    unitLabelSingular: singularizeUnitLabel(unitLabel || 'unit'),
  }
}

const DISCRETE_UNIT_KEYWORDS = [
  'egg','slice','cookie','piece','patty','pattie','wing','nugget','meatball','stick','bar','biscuit','pancake','scoop',
  'cracker','crackers','chip','chips',
  'bacon','rasher','rashers','strip','strips',
  'sausage','sausages','link','links',
  'hashbrown','hashbrowns','hash brown','hash browns',
  // whole-vegetable / whole-fruit pieces
  'zucchini','zucchinis','courgette','courgettes',
  'carrot','carrots','cucumber','cucumbers',
  'banana','bananas','apple','apples','tomato','tomatoes'
]

// Heuristics: treat eggs, slices, cookies, pieces, patties, wings, nuggets, meatballs, sticks, bars as discrete items
// and DO NOT treat weight/volume units as discrete
const isDiscreteUnitLabel = (label: string) => {
  const l = (label || '').toLowerCase().trim()
  const nonDiscreteUnits = [
    'g','gram','grams','kg','kilogram','ml','milliliter','millilitre','l','liter','litre',
    'cup','cups','tbsp','tablespoon','tsp','teaspoon','oz','ounce','lb','pound'
  ]
  if (nonDiscreteUnits.some(u => l === u || l.endsWith(' ' + u))) return false
  // Sliced produce should be treated as a portion (weight/servings), not a discrete "piece count".
  // e.g. "avocado slices" should not behave like "6 pieces".
  if (l.includes('slice') && (l.includes('avocado') || l.includes('cucumber') || l.includes('tomato') || l.includes('zucchini') || l.includes('courgette'))) {
    return false
  }
  return DISCRETE_UNIT_KEYWORDS.some(k => l.includes(k))
}

const stripWeightPhrasesFromLabel = (value: string) =>
  value.replace(
    /\b\d+(?:\.\d+)?\s*(g|gram|grams|kg|kilogram|ml|milliliter|millilitre|l|liter|litre|oz|ounce|ounces|lb|pound|pounds)\b/gi,
    ' ',
  )

const replaceWordNumbersForLabel = (value: string) => {
  const map: Record<string, string> = {
    one: '1',
    two: '2',
    three: '3',
    four: '4',
    five: '5',
    six: '6',
    seven: '7',
    eight: '8',
    nine: '9',
    ten: '10',
    eleven: '11',
    twelve: '12',
  }
  return String(value || '').replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/gi, (m) =>
    map[m.toLowerCase()] || m,
  )
}

const hasExplicitPieceCountInLabel = (value: string) => {
  const normalized = replaceWordNumbersForLabel(String(value || ''))
    .toLowerCase()
    .replace(/\b(a|an)\b/g, '1')
  const cleaned = stripWeightPhrasesFromLabel(normalized)
  const keywordPattern = DISCRETE_UNIT_KEYWORDS.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
  return new RegExp(`\\b(\\d+(?:\\.\\d+)?)\\s*(?:x\\s*)?(?:[a-z-]+\\s+){0,2}(?:${keywordPattern})\\b`).test(
    cleaned,
  )
}

const getExplicitPieces = (item: any): number | null => {
  const candidates = [
    (item as any)?.piecesPerServing,
    (item as any)?.pieces_per_serving,
    (item as any)?.pieces,
    (item as any)?.pieceCount,
    (item as any)?.piece_count,
  ]
  for (const candidate of candidates) {
    const n = Number(candidate)
    if (Number.isFinite(n) && n > 0) return n
  }
  return null
}

// Extract pieces-per-serving only when an explicit count is present.
const getPiecesPerServing = (item: any): number | null => {
  const explicitPieces = getExplicitPieces(item)
  if (explicitPieces && explicitPieces > 0) return explicitPieces

  const servingLabel = replaceWordNumbersForLabel(String(item?.serving_size || '').trim())
  const nameLabel = replaceWordNumbersForLabel(String(item?.name || '').trim())
  const servingHasExplicitCount = hasExplicitPieceCountInLabel(servingLabel)
  const nameHasExplicitCount = hasExplicitPieceCountInLabel(nameLabel)

  const fromServing = servingLabel ? parseServingUnitMetadata(servingLabel) : null
  if (
    fromServing &&
    isDiscreteUnitLabel(fromServing.unitLabel) &&
    fromServing.quantity >= 1 &&
    !isFractionalServingQuantity(fromServing.quantity) &&
    servingHasExplicitCount
  ) {
    return fromServing.quantity
  }

  if (
    fromServing &&
    isGenericSizeLabel(fromServing.unitLabel) &&
    fromServing.quantity >= 1 &&
    !isFractionalServingQuantity(fromServing.quantity) &&
    isDiscreteUnitLabel(nameLabel) &&
    servingHasExplicitCount
  ) {
    return fromServing.quantity
  }

  const fromName = nameLabel ? parseServingUnitMetadata(nameLabel) : null
  if (
    fromName &&
    isDiscreteUnitLabel(fromName.unitLabel) &&
    fromName.quantity >= 1 &&
    !isFractionalServingQuantity(fromName.quantity) &&
    nameHasExplicitCount
  ) {
    return fromName.quantity
  }

  return null
}

const replaceWordNumbers = (text: string) => {
  const map: Record<string, string> = {
    one: '1',
    two: '2',
    three: '3',
    four: '4',
    five: '5',
    six: '6',
    seven: '7',
    eight: '8',
    nine: '9',
    ten: '10',
    eleven: '11',
    twelve: '12',
  }
  return text.replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/gi, (m) =>
    map[m.toLowerCase()] || m,
  )
}

const inferPiecesFromAnalysisForItem = (analysisText: string | null | undefined, item: any): number | null => {
  if (!analysisText) return null
  const label = `${String(item?.name || '')} ${String(item?.serving_size || '')}`.toLowerCase()
  if (!label.trim() || !isDiscreteUnitLabel(label)) return null

  const text = replaceWordNumbers(String(analysisText).toLowerCase()).replace(/\b(a|an)\b/g, '1')
  const rules = [
    {
      keywords: ['egg', 'eggs'],
      patterns: [/\b(\d+(?:\.\d+)?)\s*(?:x\s*)?eggs?\b/, /\b(?:a|an|one)\s+egg\b/],
    },
    {
      keywords: ['bacon', 'rasher', 'rashers', 'strip', 'strips'],
      patterns: [
        /\b(\d+(?:\.\d+)?)\s*(?:slices?|strips?|rashers?)\s*(?:of\s+)?bacon\b/,
        /\b(\d+(?:\.\d+)?)\s*bacon\b/,
        /\b(?:a|an|one)\s+(?:slice|strip|rasher)\s+of\s+bacon\b/,
      ],
    },
    {
      keywords: ['sausage', 'sausages', 'link', 'links'],
      patterns: [/\b(\d+(?:\.\d+)?)\s*(?:sausages?|links?)\b/, /\b(?:a|an|one)\s+(?:sausage|link)\b/],
    },
    {
      keywords: ['patty', 'pattie', 'patties'],
      patterns: [/\b(\d+(?:\.\d+)?)\s*patt(?:y|ies)\b/, /\b(?:a|an|one)\s+patty\b/],
    },
    {
      keywords: ['nugget', 'nuggets'],
      patterns: [/\b(\d+(?:\.\d+)?)\s*nuggets?\b/, /\b(?:a|an|one)\s+nugget\b/],
    },
    {
      keywords: ['wing', 'wings'],
      patterns: [/\b(\d+(?:\.\d+)?)\s*wings?\b/, /\b(?:a|an|one)\s+wing\b/],
    },
    {
      keywords: ['slice', 'slices'],
      patterns: [/\b(\d+(?:\.\d+)?)\s*slices?\b/, /\b(?:a|an|one)\s+slice\b/],
    },
    {
      keywords: ['cookie', 'cookies'],
      patterns: [/\b(\d+(?:\.\d+)?)\s*cookies?\b/, /\b(?:a|an|one)\s+cookie\b/],
    },
    {
      keywords: ['cracker', 'crackers'],
      patterns: [/\b(\d+(?:\.\d+)?)\s*crackers?\b/, /\b(?:a|an|one)\s+cracker\b/],
    },
    {
      keywords: ['piece', 'pieces'],
      patterns: [/\b(\d+(?:\.\d+)?)\s*pieces?\b/, /\b(?:a|an|one)\s+piece\b/],
    },
    {
      keywords: ['zucchini', 'zucchinis', 'courgette', 'courgettes'],
      patterns: [
        /\b(\d+(?:\.\d+)?)\s*(?:x\s*)?(?:small|medium|large)?\s*(?:zucchinis?|courgettes?)\b/,
        /\b(?:a|an|one)\s+(?:small|medium|large)?\s*(?:zucchini|courgette)\b/,
      ],
    },
    {
      keywords: ['carrot', 'carrots'],
      patterns: [
        /\b(\d+(?:\.\d+)?)\s*(?:x\s*)?(?:whole|small|medium|large)?\s*carrots?\b/,
        /\b(?:a|an|one)\s+(?:whole|small|medium|large)?\s*carrot\b/,
      ],
    },
    {
      keywords: ['hashbrown', 'hashbrowns', 'hash brown', 'hash browns'],
      patterns: [
        /\b(\d+(?:\.\d+)?)\s*(?:hash\s*browns?)\b/,
        /\b(?:a|an|one)\s+(?:hash\s*brown)\b/,
      ],
    },
  ]

  for (const rule of rules) {
    if (!rule.keywords.some((k) => label.includes(k))) continue
    for (const pattern of rule.patterns) {
      const match = text.match(pattern)
      if (!match) continue
      if (match[1]) {
        const n = parseFloat(match[1])
        if (Number.isFinite(n) && n > 0) return n
      } else {
        return 1
      }
    }
  }

  const normalizeTokens = (value: string) =>
    value
      .replace(/\([^)]*\)/g, ' ')
      .replace(/[^a-z\s-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

  const stopwords = new Set([
    'fried','grilled','roasted','baked','steamed','sauteed','sautéed','raw','cooked','whole',
    'small','medium','large','extra','extra-large','xl','mini','fresh','plain','sliced','slice',
  ])
  const nameTokens = normalizeTokens(String(item?.name || ''))
    .split(' ')
    .filter((token) => token && !stopwords.has(token))
  if (!nameTokens.length) return null

  const pluralPhrase = nameTokens.join(' ')
  const singularLast = singularizeUnitLabel(nameTokens[nameTokens.length - 1])
  const singularPhrase =
    nameTokens.length > 1 ? `${nameTokens.slice(0, -1).join(' ')} ${singularLast}`.trim() : singularLast
  const nounPattern = [pluralPhrase, singularPhrase]
    .filter((p, idx, arr) => p && arr.indexOf(p) === idx)
    .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')
  if (!nounPattern) return null

  const genericMatch = text.match(
    new RegExp(`\\b(\\d+(?:\\.\\d+)?)\\s*(?:x\\s*)?((?:[a-z-]+\\s+){0,3})(${nounPattern})\\b`),
  )
  if (genericMatch) {
    const between = genericMatch[2] || ''
    if (!/\b(g|gram|grams|kg|ml|oz|ounce|ounces|lb|pound|pounds)\b/.test(between)) {
      const n = parseFloat(genericMatch[1])
      if (Number.isFinite(n) && n > 0) return n
    }
  }

  return null
}

// Detect bogus macro-only item names like "6g of protein" or "3g carbs" with no food keyword.
const isMacroOnlyName = (nameRaw: string) => {
  const name = (nameRaw || '').trim().toLowerCase()
  if (!name) return false
  const macroPattern = /(^|\s)(\d+(?:\.\d+)?\s*g\s*(of\s*)?)?(protein|carb|carbs|fat|fats|fiber|fibre|sugar)s?($|\s)/
  if (!macroPattern.test(name)) return false
  const foodHints = ['egg', 'chicken', 'beef', 'pork', 'lamb', 'fish', 'salmon', 'tuna', 'potato', 'rice', 'bread', 'bun', 'bar', 'shake', 'yogurt', 'milk', 'cheese', 'bacon', 'sausage']
  return !foodHints.some((k) => name.includes(k))
}

// Lightweight serving size parser for early normalization (uses only local regex; avoids forward-reference issues)
const quickParseServingSize = (servingSize: string | null | undefined) => {
  const raw = (servingSize && String(servingSize)) || ''
  const gramsMatch = raw.match(/(\d+(?:\.\d+)?)\s*g\b/i)
  const mlMatch = raw.match(/(\d+(?:\.\d+)?)\s*ml\b/i)
  const ozMatch = raw.match(/(\d+(?:\.\d+)?)\s*(oz|ounce|ounces)\b/i)
  const gramsPerServing = gramsMatch ? parseFloat(gramsMatch[1]) : null
  const mlPerServing = mlMatch ? parseFloat(mlMatch[1]) : null
  const ozPerServing = ozMatch ? parseFloat(ozMatch[1]) : null
  const gramsFromOz = ozPerServing ? ozPerServing * 28.3495 : null
  return {
    gramsPerServing:
      gramsPerServing && gramsPerServing > 0
        ? gramsPerServing
        : gramsFromOz && gramsFromOz > 0
        ? gramsFromOz
        : null,
    mlPerServing: mlPerServing && mlPerServing > 0 ? mlPerServing : null,
    ozPerServing: ozPerServing && ozPerServing > 0 ? ozPerServing : null,
  }
}

// When a serving label says "1 medium (200g)" but piecesPerServing is 6, scale per-serving
// weight to cover all pieces unless the label already declares multiple units.
const piecesMultiplierForServing = (item: any) => {
  const pieces = Number((item as any)?.piecesPerServing)
  if (!Number.isFinite(pieces) || pieces <= 1) return 1
  const servingMeta = parseServingUnitMetadata(String(item?.serving_size || ''))
  const declaredQty =
    servingMeta && isDiscreteUnitLabel(servingMeta.unitLabel) && Number.isFinite(servingMeta.quantity)
      ? Number(servingMeta.quantity)
      : 1
  return declaredQty <= 1 ? pieces : 1
}

// Macro totals should reflect combined pieces when the serving label doesn't already
// describe the full multi-piece portion.
const macroMultiplierForItem = (item: any) => {
  const multiplier = piecesMultiplierForServing(item)
  return Number.isFinite(multiplier) && multiplier > 1 ? multiplier : 1
}

const normalizeDiscreteItem = (item: any) => {
  const normalizedName = replaceWordNumbers(String(item?.name || ''))
  const normalizedServingSize = stripNutritionFromServingSize(
    replaceWordNumbers(String(item?.serving_size || '')),
  )
  const working: any = { ...item, name: normalizedName, serving_size: normalizedServingSize }
  let piecesPerServing = getPiecesPerServing(working)
  const servingMeta = parseServingUnitMetadata(working?.serving_size || '')
  const servingPieces =
    servingMeta &&
    isDiscreteUnitLabel(servingMeta.unitLabel) &&
    servingMeta.quantity >= 1 &&
    !isFractionalServingQuantity(servingMeta.quantity)
      ? servingMeta.quantity
      : null
  if (servingPieces && servingPieces > 0) {
    piecesPerServing = servingPieces
  }
  if (piecesPerServing && piecesPerServing > 0) {
    working.piecesPerServing = piecesPerServing
    if (servingPieces && servingPieces > 0) {
      working.pieces = servingPieces
    }
  }

  // For discrete items, keep base servings at 1 so the input matches the label; pieces captures the count.
  const isDiscrete =
    (piecesPerServing && piecesPerServing > 0) ||
    isDiscreteUnitLabel(normalizedServingSize) ||
    isDiscreteUnitLabel(normalizedName)
  if (isDiscrete) {
    const incomingServings =
      Number.isFinite(Number(working?.servings)) && Number(working.servings) > 0
        ? Number(working.servings)
        : 1
    const fallbackPieces =
      getExplicitPieces(working) ??
      (Number.isFinite(Number(working?.pieces)) && Number(working.pieces) > 0 ? Number(working.pieces) : null)
    if ((!working.piecesPerServing || working.piecesPerServing <= 0) && incomingServings > 1) {
      working.piecesPerServing = incomingServings
    }
    if (!working.piecesPerServing && fallbackPieces) {
      working.piecesPerServing = fallbackPieces
    }
    // Clamp base servings to 1; pieces capture the count
    working.servings = 1
    // Keep pieces aligned with piecesPerServing
    if (working.piecesPerServing && (!working.pieces || working.pieces <= 0)) {
      working.pieces = working.piecesPerServing
    }
  }

  const { gramsPerServing, mlPerServing } = quickParseServingSize(working?.serving_size)
  const hasWeightInfo = (gramsPerServing && gramsPerServing > 0) || (mlPerServing && mlPerServing > 0)
  const defaultWeight = defaultGramsForItem(working)
  if (!hasWeightInfo && defaultWeight && !working.customGramsPerServing && working.weightUnit !== 'ml') {
    // Per-serving weight should reflect the described serving (which may already include multiple pieces)
    const multiplier = piecesPerServing && piecesPerServing > 0 ? piecesPerServing : 1
    working.customGramsPerServing = defaultWeight * multiplier
  }
  return working
}

// Fallback estimated grams per single serving when no weight info exists
const defaultGramsForItem = (item: any): number | null => {
  const nameRaw = String(item?.name || '')
  const servingRaw = String(item?.serving_size || '')
  const name = nameRaw.toLowerCase()
  if (!name) return null
  const dessertLabel = `${nameRaw} ${servingRaw}`.toLowerCase()
  const dessertHints = [
    'fruitcake',
    'christmas pudding',
    'pudding',
    'cake',
    'brownie',
    'cheesecake',
    'banana bread',
    'carrot cake',
    'mud cake',
    'fudge',
    'tart',
    'pie',
  ]
  const portionHints = ['slice', 'piece', 'portion', 'wedge', 'square', 'bar']
  if (
    dessertHints.some((term) => dessertLabel.includes(term)) &&
    (portionHints.some((term) => dessertLabel.includes(term)) || /(\d+)\s*\/\s*(\d+)/.test(dessertLabel))
  ) {
    return null
  }
  if (/\bcheese\s*-?\s*cake\b/.test(name) || name.includes('cheesecake')) return null
  const normalizedName = name.replace(/[^a-z0-9]+/g, ' ').trim()
  const hasWord = (word: string) => new RegExp(`\\b${escapeRegex(word)}\\b`).test(normalizedName)
  const hasPhrase = (phrase: string) => normalizedName.includes(phrase)
  const curated: Array<{ keywords: string[]; grams: number }> = [
    { keywords: ['egg', 'eggs'], grams: 50 },
    { keywords: ['bacon', 'rasher', 'rashers', 'strip', 'strips'], grams: 15 },
    { keywords: ['sausage', 'sausages', 'link', 'links'], grams: 80 },
    { keywords: ['carrot', 'carrots'], grams: 61 },
    { keywords: ['zucchini', 'zucchinis', 'courgette', 'courgettes'], grams: 200 },
    { keywords: ['banana', 'bananas'], grams: 118 },
    { keywords: ['apple', 'apples'], grams: 182 },
    { keywords: ['tomato', 'tomatoes'], grams: 123 },
    { keywords: ['pancake', 'pancakes'], grams: 40 },
    { keywords: ['hash brown', 'hashbrown'], grams: 70 },
    { keywords: ['battered fish', 'fried fish', 'fish fillet', 'fish fingers', 'fish sticks'], grams: 90 },
    { keywords: ['fried shrimp', 'shrimp', 'prawn', 'prawns'], grams: 30 },
    { keywords: ['sausage', 'sausages', 'link', 'links'], grams: 75 },
    { keywords: ['wing', 'wings'], grams: 30 },
    { keywords: ['nugget', 'nuggets'], grams: 20 },
    { keywords: ['meatball', 'meatballs'], grams: 20 },
  ]
  for (const entry of curated) {
    if (
      entry.keywords.some((k) => (k.includes(' ') ? hasPhrase(k) : hasWord(k)))
    ) {
      return entry.grams
    }
  }
  if (hasWord('patty')) return 115 // ~4 oz patty
  if (hasWord('bacon')) return 15 // one slice cooked
  if (hasWord('cheese') && /\bslice\b|\bslices\b|\bpiece\b/.test(dessertLabel)) return 25 // one slice
  if (hasWord('tomato')) return 50 // a couple slices
  if (hasWord('lettuce')) return 10
  if (hasWord('bun')) return 75
  return null
}

const isDessertPortionItem = (item: any) => {
  const label = `${String(item?.name || '')} ${String(item?.serving_size || '')}`.toLowerCase()
  if (!label.trim()) return false

  const excluded = ['crab cake', 'fish cake', 'salmon cake', 'rice cake', 'black pudding', 'blood pudding']
  if (excluded.some((term) => label.includes(term))) return false

  const dessertHints = [
    'fruitcake',
    'christmas pudding',
    'pudding',
    'cake',
    'brownie',
    'cheesecake',
    'banana bread',
    'carrot cake',
    'mud cake',
    'fudge',
    'tart',
    'pie',
  ]
  if (!dessertHints.some((term) => label.includes(term))) return false

  const portionHints = ['slice', 'piece', 'portion', 'wedge', 'square', 'bar']
  const hasPortionHint = portionHints.some((term) => label.includes(term))
  const hasFraction = /(\d+)\s*\/\s*(\d+)/.test(label)

  return hasPortionHint || hasFraction
}

const clampDessertPortionWeight = (estimated: number) => {
  const min = 100
  const max = 140
  return Math.min(Math.max(estimated, min), max)
}

const isVolumeBasedUnitLabel = (label: string) => {
  const l = (label || '').toLowerCase().trim()
  if (!l) return false
  const volumeKeywords = ['oz', 'ounce', 'ounces', 'ml', 'milliliter', 'millilitre', 'cup', 'cups']
  return volumeKeywords.some((u) => l.includes(u))
}

const isLikelyLiquidFood = (nameRaw: string, servingSizeRaw: string | null | undefined) => {
  const name = String(nameRaw || '').toLowerCase()
  const serving = String(servingSizeRaw || '').toLowerCase()
  const label = `${name} ${serving}`.trim()
  if (!label) return false

  if (label.includes('milk chocolate')) return false
  const chocolateLiquid = /\bchocolate\s+(milk|shake|drink|smoothie|syrup)\b/.test(label)
  if (label.includes('chocolate') && !chocolateLiquid) return false

  const solidHints = [
    'bread',
    'cookie',
    'biscuit',
    'cracker',
    'granola',
    'cereal',
    'chips',
    'crisps',
    'popcorn',
    'trail mix',
    'candy',
    'brownie',
    'cake',
    'powder',
    'mix',
    'protein bar',
    'energy bar',
    'candy bar',
    'chocolate bar',
    'granola bar',
  ]
  if (solidHints.some((hint) => label.includes(hint))) return false

  const liquidKeywords = [
    'oil',
    'vinegar',
    'milk',
    'juice',
    'water',
    'soda',
    'soft drink',
    'drink',
    'beverage',
    'tea',
    'coffee',
    'kombucha',
    'broth',
    'stock',
    'soup',
    'wine',
    'beer',
    'spirit',
    'liqueur',
    'smoothie',
    'shake',
    'milkshake',
    'syrup',
  ]
  return liquidKeywords.some((keyword) => label.includes(keyword))
}

const normalizeServingSizeForLiquid = (
  servingSizeRaw: string | null | undefined,
  liquidItem: boolean,
) => {
  const raw = String(servingSizeRaw || '')
  if (!raw || liquidItem) return raw
  if (/\b\d+(?:\.\d+)?\s*g\b/i.test(raw)) return raw
  if (/\bml\b/i.test(raw) || /\bmilliliters?\b/i.test(raw) || /\bmillilitres?\b/i.test(raw)) {
    let next = raw
    next = next.replace(/\bmilliliters?\b/gi, 'g')
    next = next.replace(/\bmillilitres?\b/gi, 'g')
    next = next.replace(/\bml\b/gi, 'g')
    return next
  }
  return raw
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
  {
    key: 'drumstick',
    keywords: ['drumstick', 'drumsticks', 'chicken drumstick', 'chicken leg', 'chicken legs'],
    caloriesPerUnitFloor: 120,
    proteinPerUnitFloor: 8,
  },
  {
    key: 'carrot',
    keywords: ['carrot', 'carrots'],
    caloriesPerUnitFloor: 20,
  },
]

const normalizeDiscreteServingsWithLabel = (items: any[]) => {
  if (!Array.isArray(items)) return []
  return items.map((item) => {
    const next = { ...item }
    const labelSource = `${item?.name || ''} ${item?.serving_size || ''}`.toLowerCase()
    if (!labelSource.trim()) return next
    if (!hasExplicitPieceCountInLabel(labelSource)) return next

    const rule = DISCRETE_SERVING_RULES.find((r) =>
      r.keywords.some((kw) => labelSource.includes(kw)),
    )
    if (!rule) return next

    const meta = parseServingUnitMetadata(item?.serving_size || item?.name || '')
    const qty = meta?.quantity
    const unitLabel = meta?.unitLabel || meta?.unitLabelSingular || ''
    const unitIsDiscrete =
      isDiscreteUnitLabel(unitLabel) ||
      (isGenericSizeLabel(unitLabel) && isDiscreteUnitLabel(String(item?.name || '')))
    const currentServings = Number.isFinite(Number(next.servings)) ? Number(next.servings) : 1

    if (!qty || qty <= 1.001) return next
    if (!unitIsDiscrete) return next

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
      // represent the whole labeled portion (pieces captured separately).
      next.servings = 1
    }
    // Even when macros are already realistic, keep servings at 1 for discrete items; pieces capture the count.
    if (qty > 1 && isDiscreteUnitLabel(unitLabel)) {
      next.servings = 1
      if ((!next.piecesPerServing || next.piecesPerServing <= 0) && Number.isFinite(qty) && qty > 1) {
        next.piecesPerServing = qty
      }
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
      const multiplier = macroMultiplierForItem(it)
      totals.calories += (Number(it?.calories) || 0) * servings * multiplier
      totals.protein += (Number(it?.protein_g) || 0) * servings * multiplier
      totals.carbs += (Number(it?.carbs_g) || 0) * servings * multiplier
      totals.fat += (Number(it?.fat_g) || 0) * servings * multiplier
      totals.fiber += (Number(it?.fiber_g) || 0) * servings * multiplier
      totals.sugar += (Number(it?.sugar_g) || 0) * servings * multiplier
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
  const router = useRouter()
  const isAnalysisRoute = pathname === '/food/analysis'
  const userCacheKey = (session as any)?.user?.id || (session as any)?.user?.email || ''
  const { userData, profileImage, updateUserData } = useUserData()
  const warmDiaryState = useMemo(() => readWarmDiaryState(), [])
  const initialDeviceStatus = useMemo(() => readDeviceStatusSnapshot(userCacheKey), [userCacheKey])
  const initialFavoritesAllSnapshot = useMemo(() => readFavoritesAllSnapshot(userCacheKey), [userCacheKey])
  const [persistentDiarySnapshotVersion, setPersistentDiarySnapshotVersion] = useState(0)
  const refreshPersistentDiarySnapshot = useCallback(() => {
    setPersistentDiarySnapshotVersion((prev) => prev + 1)
  }, [])
  const persistentDiarySnapshot = useMemo(() => readPersistentDiarySnapshot(), [persistentDiarySnapshotVersion])
  const initialSelectedDate = (() => {
    const today = buildTodayIso()
    const warmSelected =
      warmDiaryState?.selectedDate && warmDiaryState.selectedDate.length >= 8
        ? warmDiaryState.selectedDate
        : today
    if (typeof window === 'undefined') return warmSelected
    try {
      const lastPath = localStorage.getItem('helfi:lastPath') || ''
      const lastPathBase = lastPath.split('?')[0]
      const lastVisitDate = localStorage.getItem(FOOD_DIARY_LAST_VISIT_KEY) || ''
      const lastWasFoodDiary = lastPathBase === '/food'
      if (lastWasFoodDiary && lastVisitDate && lastVisitDate !== today) {
        return today
      }
    } catch {}
    return warmSelected
  })()
  const formatDateFromMs = (ms: number) => {
    const d = new Date(ms)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }
  const extractEntryTimestampMs = (entry: any) => {
    const ts =
      typeof entry?.createdAt === 'string' || entry?.createdAt instanceof Date
        ? new Date(entry.createdAt).getTime()
        : typeof entry?.id === 'number'
        ? entry.id
        : Number(entry?.time) || Number(entry?.id)
    if (!Number.isFinite(ts)) return NaN
    // Guard against small non-timestamp numbers producing bogus 1970 dates.
    if (ts < 946684800000) return NaN
    return ts
  }

  const goToDevices = () => {
    router.push('/devices')
  }
  const deriveDateFromEntryTimestamp = (entry: any) => {
    const ts = extractEntryTimestampMs(entry)
    if (!Number.isFinite(ts)) return ''
    return formatDateFromMs(ts)
  }
  const safePhotoForSnapshot = (raw: any) => {
    if (typeof raw !== 'string') return null
    const trimmed = raw.trim()
    // Only keep lightweight remote URLs; drop data URLs/base64 blobs that trigger 413s.
    if (/^https?:\/\//i.test(trimmed)) return trimmed.slice(0, 500)
    return null
  }

  // Client-side entries use a numeric `id` that is used as a React key and for delete operations.
  // IMPORTANT: Copies/pastes can legitimately share the same `createdAt` timestamp (same time-of-day),
  // so `id = createdAtMs` can collide across categories. Collisions cause deletes to remove the wrong items.
  const hashToOffset = (input: string) => {
    // Simple FNV-1a 32-bit hash -> small positive offset.
    let hash = 2166136261
    for (let i = 0; i < input.length; i++) {
      hash ^= input.charCodeAt(i)
      hash = Math.imul(hash, 16777619)
    }
    // 1..997 (small enough to not meaningfully change sort order, but breaks collisions)
    return (Math.abs(hash) % 997) + 1
  }

  const makeUniqueLocalEntryId = (baseMs: number, salt: string) => {
    const safeBase = Number.isFinite(baseMs) ? baseMs : Date.now()
    return safeBase + hashToOffset(salt || String(safeBase))
  }
  const normalizeClientId = (value: any) => {
    if (value === null || value === undefined) return ''
    const raw = String(value).trim()
    return raw.length > 0 ? raw : ''
  }
  const buildClientId = (seed?: string) => {
    const base = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    return seed ? `${seed}-${base}` : base
  }
  const getEntryClientId = (entry: any) => {
    if (!entry) return ''
    const direct =
      normalizeClientId((entry as any)?.clientId) ||
      normalizeClientId((entry as any)?.client_id) ||
      normalizeClientId((entry as any)?.clientID)
    if (direct) return direct
    const fromNutrition =
      normalizeClientId((entry as any)?.nutrition?.__clientId) ||
      normalizeClientId((entry as any)?.total?.__clientId)
    if (fromNutrition) return fromNutrition
    return ''
  }
  const parseClientIdTimestampMs = (clientId: string) => {
    if (!clientId) return NaN
    const parts = clientId.split('-')
    if (parts.length < 2) return NaN
    const base36 = parts[parts.length - 2]
    if (!base36) return NaN
    const ms = parseInt(base36, 36)
    return Number.isFinite(ms) ? ms : NaN
  }
  const getEntryClientIdTimestampMs = (entry: any) => {
    const clientId = getEntryClientId(entry)
    return clientId ? parseClientIdTimestampMs(clientId) : NaN
  }
  const attachClientIdToTotals = (totals: any, clientId: string) => {
    if (!clientId) return totals
    if (!totals || typeof totals !== 'object') return totals
    if ((totals as any).__clientId === clientId) return totals
    return { ...(totals as any), __clientId: clientId }
  }
  const getEntryLoggedAtRaw = (entry: any) => {
    if (!entry || typeof entry !== 'object') return ''
    const direct = (entry as any)?.__sourceCreatedAt
    if (direct) return direct
    const fromNutrition = (entry as any)?.nutrition?.__loggedAt
    if (fromNutrition) return fromNutrition
    const fromTotal = (entry as any)?.total?.__loggedAt
    if (fromTotal) return fromTotal
    return ''
  }
  const attachLoggedAtToTotals = (totals: any, loggedAt: string | number) => {
    if (!totals || typeof totals !== 'object') return totals
    if ((totals as any).__loggedAt) return totals
    return { ...(totals as any), __loggedAt: loggedAt }
  }
  const getEntryAddedOrderRaw = (entry: any) => {
    if (!entry || typeof entry !== 'object') return NaN
    const direct = (entry as any)?.__addedOrder
    if (Number.isFinite(Number(direct))) return Number(direct)
    const fromNutrition = (entry as any)?.nutrition?.__addedOrder
    if (Number.isFinite(Number(fromNutrition))) return Number(fromNutrition)
    const fromTotal = (entry as any)?.total?.__addedOrder
    if (Number.isFinite(Number(fromTotal))) return Number(fromTotal)
    return NaN
  }
  const attachAddedOrderToTotals = (totals: any, orderStamp: number) => {
    if (!totals || typeof totals !== 'object') return totals
    if ((totals as any).__addedOrder) return totals
    return { ...(totals as any), __addedOrder: orderStamp }
  }
  const ensureEntryLoggedAt = (entry: any, loggedAt: string | number, addedOrder?: number) => {
    if (!entry || typeof entry !== 'object') return entry
    const existingLogged = getEntryLoggedAtRaw(entry)
    const loggedStamp = existingLogged || loggedAt
    const existingOrder = getEntryAddedOrderRaw(entry)
    const derivedOrder =
      Number.isFinite(existingOrder)
        ? existingOrder
        : Number.isFinite(Number(addedOrder))
        ? Number(addedOrder)
        : (() => {
            const fromLogged =
              typeof loggedStamp === 'number' && Number.isFinite(loggedStamp)
                ? loggedStamp
                : loggedStamp
                ? new Date(loggedStamp).getTime()
                : NaN
            return Number.isFinite(fromLogged) ? fromLogged : NaN
          })()
    if (!loggedStamp && !Number.isFinite(derivedOrder)) return entry
    const next: any = { ...(entry as any) }
    if (loggedStamp) next.__sourceCreatedAt = loggedStamp
    if (Number.isFinite(derivedOrder)) next.__addedOrder = derivedOrder
    const withNutrition = loggedStamp ? attachLoggedAtToTotals((entry as any)?.nutrition, loggedStamp) : (entry as any)?.nutrition
    const withTotal = loggedStamp ? attachLoggedAtToTotals((entry as any)?.total, loggedStamp) : (entry as any)?.total
    const withNutritionOrder = Number.isFinite(derivedOrder) ? attachAddedOrderToTotals(withNutrition, derivedOrder) : withNutrition
    const withTotalOrder = Number.isFinite(derivedOrder) ? attachAddedOrderToTotals(withTotal, derivedOrder) : withTotal
    if (withNutritionOrder !== (entry as any)?.nutrition) next.nutrition = withNutritionOrder
    if (withTotalOrder !== (entry as any)?.total) next.total = withTotalOrder
    return next
  }
  const entryAllowsDuplicate = (entry: any) =>
    Boolean((entry as any)?.nutrition?.__allowDuplicate || (entry as any)?.total?.__allowDuplicate)
  const markEntryAllowDuplicate = (entry: any) => {
    if (!entry || typeof entry !== 'object') return entry
    const next: any = { ...(entry as any) }
    if (next.total && typeof next.total === 'object') {
      if (!(next.total as any).__allowDuplicate) {
        next.total = { ...(next.total as any), __allowDuplicate: true }
      }
    } else if (next.nutrition && typeof next.nutrition === 'object') {
      if (!(next.nutrition as any).__allowDuplicate) {
        next.nutrition = { ...(next.nutrition as any), __allowDuplicate: true }
      }
    } else {
      next.nutrition = { __allowDuplicate: true }
    }
    return next
  }
  const applyEntryClientId = (entry: any, seed?: string, options?: { forceNew?: boolean }) => {
    if (!entry || typeof entry !== 'object') return entry
    const clientId = options?.forceNew ? buildClientId(seed) : getEntryClientId(entry) || buildClientId(seed)
    return {
      ...(entry as any),
      clientId,
      nutrition: attachClientIdToTotals((entry as any)?.nutrition, clientId),
      total: attachClientIdToTotals((entry as any)?.total, clientId),
    }
  }
  const buildPayloadNutrition = (entry: any) => {
    const clientId = getEntryClientId(entry)
    const base = (entry as any)?.nutrition || (entry as any)?.total || null
    if (!clientId) return base
    if (!base || typeof base !== 'object') return { __clientId: clientId }
    return attachClientIdToTotals(base, clientId)
  }
  const ensureEntryClientId = (entry: any, clientId: string) => {
    if (!entry || !clientId) return entry
    const existing = getEntryClientId(entry)
    if (existing) return entry
    return {
      ...(entry as any),
      clientId,
      nutrition: attachClientIdToTotals((entry as any)?.nutrition, clientId),
      total: attachClientIdToTotals((entry as any)?.total, clientId),
    }
  }
  const compactItemForSnapshot = (item: any) => {
    if (!item || typeof item !== 'object') return item
    return {
      name: item?.name,
      brand: item?.brand,
      calories: item?.calories,
      protein_g: item?.protein_g,
      carbs_g: item?.carbs_g,
      fat_g: item?.fat_g,
      fiber_g: item?.fiber_g,
      sugar_g: item?.sugar_g,
      servings: item?.servings,
      serving_size: item?.serving_size,
      pieces: (item as any)?.pieces,
      piecesPerServing: (item as any)?.piecesPerServing,
      unit: (item as any)?.unit,
      weight_g: (item as any)?.weight_g,
      barcode: (item as any)?.barcode,
      barcodeSource: (item as any)?.barcodeSource,
      detectionMethod: (item as any)?.detectionMethod,
      isGuess: (item as any)?.isGuess,
    }
  }
  const compactEntryForSnapshot = (entry: any, fallbackDate: string) => {
    if (!entry || typeof entry !== 'object') return entry
    const explicitLocalDate =
      typeof entry?.localDate === 'string' && entry.localDate.length >= 8 ? entry.localDate : ''
    const derivedDate = deriveDateFromEntryTimestamp(entry)
    const localDate = derivedDate || explicitLocalDate || fallbackDate
    const description =
      typeof entry?.description === 'string'
        ? entry.description.slice(0, 2000)
        : entry?.description
    const items =
      Array.isArray(entry?.items) && entry.items.length > 0
        ? entry.items.map(compactItemForSnapshot)
        : entry?.items || null
    return {
      id: entry?.id,
      dbId: (entry as any)?.dbId,
      clientId: getEntryClientId(entry) || undefined,
      localDate,
      description,
      time: entry?.time,
      method: entry?.method,
      photo: safePhotoForSnapshot(entry?.photo),
      nutrition: entry?.nutrition || null,
      total: (entry as any)?.total || null,
      items,
      meal: entry?.meal,
      category: entry?.category,
      persistedCategory: (entry as any)?.persistedCategory,
      createdAt: entry?.createdAt,
    }
  }
  const compactTodaysFoodsForSnapshot = (entries: any[], fallbackDate: string) =>
    Array.isArray(entries) ? entries.map((e) => compactEntryForSnapshot(e, fallbackDate)) : []
  const SNAPSHOT_MAX_ENTRIES = 300
  const limitSnapshotFoods = (entries: any[], fallbackDate: string) => {
    const compacted = compactTodaysFoodsForSnapshot(entries, fallbackDate)
    const filtered = compacted.filter((entry: any) => {
      const localDate =
        typeof entry?.localDate === 'string' && entry.localDate.length >= 8 ? entry.localDate : ''
      if (!localDate) return false
      // Server snapshot is a fast-cache for the currently viewed date only.
      // Keeping it scoped prevents oversized payloads (413) that resurrect stale entries.
      return localDate === fallbackDate
    })
    filtered.sort((a: any, b: any) => {
      const aTs = extractEntryTimestampMs(a)
      const bTs = extractEntryTimestampMs(b)
      if (!Number.isFinite(aTs) && !Number.isFinite(bTs)) return 0
      if (!Number.isFinite(aTs)) return 1
      if (!Number.isFinite(bTs)) return -1
      return bTs - aTs
    })
    return filtered.slice(0, SNAPSHOT_MAX_ENTRIES)
  }
  const minimalSnapshotFoods = (entries: any[], fallbackDate: string) =>
    limitSnapshotFoods(
      entries.map((entry) => ({
        id: entry?.id,
        dbId: (entry as any)?.dbId,
        clientId: getEntryClientId(entry) || undefined,
        localDate:
          (typeof entry?.localDate === 'string' && entry.localDate.length >= 8
            ? entry.localDate
            : fallbackDate) || fallbackDate,
        description: typeof entry?.description === 'string' ? entry.description.slice(0, 200) : '',
        meal: entry?.meal,
        category: entry?.category,
        persistedCategory: (entry as any)?.persistedCategory,
        time: entry?.time,
        createdAt: entry?.createdAt,
        nutrition: entry?.nutrition || null,
        total: (entry as any)?.total || null,
      })),
      fallbackDate,
    )
	  const syncSnapshotToServer = async (entries: any[], fallbackDate: string) => {
	    const snapshotFoods = limitSnapshotFoods(entries, fallbackDate)
	    if (!snapshotFoods || snapshotFoods.length === 0) {
	      try {
	        await fetch('/api/user-data/clear-todays-foods', { method: 'POST' })
	      } catch (err) {
	        console.warn('Failed to clear todaysFoods snapshot', err)
      }
      return
	    }
	    try {
	      const payloadStr = JSON.stringify({
	        todaysFoods: snapshotFoods,
	        appendHistory: false,
	      })
	      // `keepalive` improves reliability on mobile/PWA when the user backgrounds the app,
	      // but browsers cap keepalive payload size (roughly ~64KB). Only enable it for small bodies.
	      const keepalive = payloadStr.length < 60_000
	      const res = await fetch('/api/user-data', {
	        method: 'POST',
	        headers: {
	          'Content-Type': 'application/json',
	        },
	        body: payloadStr,
	        keepalive,
	      })
      if (res.status === 413) {
        console.warn('Snapshot write hit 413, retrying with minimal payload')
        try {
          await fetch('/api/user-data/clear-todays-foods', { method: 'POST' })
        } catch (clearErr) {
          console.warn('Failed to clear oversized snapshot before retry', clearErr)
        }
        await fetch('/api/user-data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            todaysFoods: minimalSnapshotFoods(entries, fallbackDate),
            appendHistory: false,
          }),
        }).catch((retryErr) => console.warn('Minimal snapshot retry failed', retryErr))
      } else if (!res.ok) {
        const errorText = await res.text().catch(() => '')
        console.error('Failed to save todaysFoods snapshot', {
          status: res.status,
          statusText: res.statusText,
          error: errorText,
        })
      }
    } catch (userDataError) {
      console.error('Error saving todaysFoods snapshot', userDataError)
    }
  }
  const entryMatchesDate = (entry: any, targetDate: string) => {
    if (!entry) return false
    const localDate =
      typeof entry?.localDate === 'string' && entry.localDate.length >= 8 ? entry.localDate : ''
    const derivedDate = deriveDateFromEntryTimestamp(entry)

    if (derivedDate) {
      // If we have a trustworthy timestamp date and it conflicts with localDate, trust the timestamp
      // to prevent cached prior-day rows leaking into a new day.
      if (localDate && localDate !== derivedDate) {
        return derivedDate === targetDate
      }
      if (derivedDate === targetDate) return true
    }

    if (localDate) return localDate === targetDate
    return false
  }
  const filterEntriesForDate = (entries: any[] | null | undefined, targetDate: string) =>
    Array.isArray(entries) ? entries.filter((entry) => entryMatchesDate(entry, targetDate)) : []
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [todaysFoods, setTodaysFoods] = useState<any[]>(() => {
    const warm = Array.isArray(warmDiaryState?.todaysFoods) ? warmDiaryState.todaysFoods : null
    if (warm) return warm
    const persisted = persistentDiarySnapshot?.byDate?.[initialSelectedDate]
    if (persisted?.entries && Array.isArray(persisted.entries)) return persisted.entries
    return filterEntriesForDate((userData as any)?.todaysFoods, initialSelectedDate)
  })
  const [newFoodText, setNewFoodText] = useState('')
  const [showAddFood, setShowAddFood] = useState(false)
  const [showPhotoOptions, setShowPhotoOptions] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysisPhase, setAnalysisPhase] = useState<'idle' | 'preparing' | 'analyzing' | 'building'>('idle')
  const [isSavingEntry, setIsSavingEntry] = useState(false)
  const [isDiaryMutating, setIsDiaryMutating] = useState(false)
  const [analysisMode, setAnalysisMode] = useState<'auto' | 'packaged' | 'meal'>('auto')
  const [analysisHint, setAnalysisHint] = useState('')
  const [analysisId, setAnalysisId] = useState<string | null>(null)
  const [analysisFeedbackOverall, setAnalysisFeedbackOverall] = useState<'up' | 'down' | null>(null)
  const [analysisFeedbackItems, setAnalysisFeedbackItems] = useState<Record<number, 'up' | 'down'>>({})
  const [feedbackPrompt, setFeedbackPrompt] = useState<{
    scope: 'overall' | 'item'
    itemIndex?: number | null
  } | null>(null)
  const [feedbackReasons, setFeedbackReasons] = useState<string[]>([])
  const [feedbackComment, setFeedbackComment] = useState('')
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false)
  const [feedbackError, setFeedbackError] = useState<string | null>(null)
  const [feedbackRescanState, setFeedbackRescanState] = useState<{
    scope: 'overall' | 'item'
    itemIndex?: number | null
  } | null>(null)
  const [feedbackRescanMessage, setFeedbackRescanMessage] = useState<string | null>(null)
  const [showAnalysisModeModal, setShowAnalysisModeModal] = useState(false)
  const [showAnalysisExitConfirm, setShowAnalysisExitConfirm] = useState(false)
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
  // Numeric input drafts (so tapping clears the box without mutating values until the user types)
  const [numericInputDrafts, setNumericInputDrafts] = useState<Record<string, string>>({})
  const [healthWarning, setHealthWarning] = useState<string | null>(null)
  const [healthAlternatives, setHealthAlternatives] = useState<string | null>(null)
  const [dietWarning, setDietWarning] = useState<string | null>(null)
  const [dietAlternatives, setDietAlternatives] = useState<string | null>(null)
  const [healthCheckPrompt, setHealthCheckPrompt] = useState<HealthCheckPromptPayload | null>(null)
  const [healthCheckResult, setHealthCheckResult] = useState<HealthCheckResult | null>(null)
  const [healthCheckLoading, setHealthCheckLoading] = useState(false)
  const [healthCheckError, setHealthCheckError] = useState<string | null>(null)
  const [healthCheckPageOpen, setHealthCheckPageOpen] = useState(false)
  const [historySaveError, setHistorySaveError] = useState<string | null>(null)
  const [lastHistoryPayload, setLastHistoryPayload] = useState<any>(null)
  const [historyRetrying, setHistoryRetrying] = useState(false)
  const [pendingQueue, setPendingQueue] = useState<any[]>([])
  const [isFlushingQueue, setIsFlushingQueue] = useState(false)
  // Persist pending queue across reloads to avoid losing unsaved items
  useEffect(() => {
    try {
      const stored = typeof window !== 'undefined' ? localStorage.getItem('foodlog:pendingQueue') : null
      if (stored) {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed) && parsed.length > 0) {
          setPendingQueue(parsed)
          setHistorySaveError('Unsaved meals detected. We\'re retrying now.')
        }
      }
    } catch (e) {
      console.warn('Could not load pending queue', e)
    }
  }, [])
  useEffect(() => {
    try {
      if (typeof window === 'undefined') return
      if (pendingQueue.length > 0) {
        localStorage.setItem('foodlog:pendingQueue', JSON.stringify(pendingQueue))
        setHistorySaveError((msg) => msg || 'Saving your meal to history failed. We\'re retrying now.')
      } else {
        localStorage.removeItem('foodlog:pendingQueue')
      }
    } catch (e) {
      console.warn('Could not persist pending queue', e)
    }
  }, [pendingQueue])
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>(() => {
    const base = {
      uncategorized: false,
      breakfast: false,
      lunch: false,
      dinner: false,
      snacks: false,
    }
    if (warmDiaryState?.expandedCategories && typeof warmDiaryState.expandedCategories === 'object') {
      return { ...base, ...warmDiaryState.expandedCategories }
    }
    return base
  })
  const MEAL_CATEGORY_ORDER: Array<'breakfast' | 'lunch' | 'dinner' | 'snacks' | 'uncategorized'> = [
    'breakfast',
    'lunch',
    'dinner',
    'snacks',
    'uncategorized',
  ]
  const CATEGORY_LABELS: Record<typeof MEAL_CATEGORY_ORDER[number], string> = {
    breakfast: 'Breakfast',
    lunch: 'Lunch',
    dinner: 'Dinner',
    snacks: 'Snacks',
    uncategorized: 'Other',
  }
  const categoryLabel = (key: typeof MEAL_CATEGORY_ORDER[number]) => CATEGORY_LABELS[key] || 'Other'
  const collapseEmptyCategories = (expanded: Record<string, boolean>, entries: any[]) => {
    const counts: Record<string, number> = {}
    entries.forEach((entry) => {
      const cat = normalizeCategory(entry?.meal || entry?.category || entry?.mealType)
      counts[cat] = (counts[cat] || 0) + 1
    })
    const next = { ...expanded }
    let changed = false
    MEAL_CATEGORY_ORDER.forEach((cat) => {
      const hasEntries = (counts[cat] || 0) > 0
      if (!hasEntries && next[cat]) {
        next[cat] = false
        changed = true
      }
    })
    return { map: next, changed }
  }
  const [selectedAddCategory, setSelectedAddCategory] = useState<typeof MEAL_CATEGORY_ORDER[number]>('uncategorized')
  const [showCategoryPicker, setShowCategoryPicker] = useState(false)
  const [showAddIngredientModal, setShowAddIngredientModal] = useState<boolean>(false)
  const [officialSearchQuery, setOfficialSearchQuery] = useState<string>('')
  const [officialResults, setOfficialResults] = useState<any[]>([])
  const [officialResultsSource, setOfficialResultsSource] = useState<string>('usda')
  const [officialSource, setOfficialSource] = useState<'packaged' | 'single'>('packaged')
  const [officialLoading, setOfficialLoading] = useState<boolean>(false)
  const [officialError, setOfficialError] = useState<string | null>(null)
  const officialSearchAbortRef = useRef<AbortController | null>(null)
  const officialSearchSeqRef = useRef(0)
  const officialSearchDebounceRef = useRef<any>(null)
  const analysisSequenceRef = useRef(0)
  const analysisHealthCheckKeyRef = useRef<string | null>(null)
  const pendingAnalysisHealthCheckRef = useRef<{
    entryKey: string
    entry: any
    totalsOverride: NutritionTotals | null
  } | null>(null)
  const autoDbMatchAbortRef = useRef<AbortController | null>(null)
  const [officialLastRequest, setOfficialLastRequest] = useState<{
    query: string
    mode: 'packaged' | 'single'
    url: string
    status: number | null
    itemCount: number | null
    source: string | null
    errorText: string | null
    at: number
  } | null>(null)
  const [manualMealBuildMode, setManualMealBuildMode] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [summarySlideIndex, setSummarySlideIndex] = useState(0)
  const [summaryRenderNonce, setSummaryRenderNonce] = useState(0)
  const [resumeTick, setResumeTick] = useState(0)
  
  // Manual food entry states
  const [manualFoodName, setManualFoodName] = useState('')
  const [manualFoodType, setManualFoodType] = useState('single')
  const [manualIngredients, setManualIngredients] = useState([{ name: '', weight: '', unit: 'g' }])
  const showManualEntry = false
  const [showEntryOptions, setShowEntryOptions] = useState<string | null>(null)
  const [showIngredientOptions, setShowIngredientOptions] = useState<string | null>(null)
  const [photoOptionsAnchor, setPhotoOptionsAnchor] = useState<'global' | string | null>(null)
  const [photoOptionsPosition, setPhotoOptionsPosition] = useState<{
    top?: number
    left?: number
    width?: number
    maxHeight?: number
  } | null>(null)
  const [editingEntry, setEditingEntry] = useState<any>(null)
  const [aiEntryTab, setAiEntryTab] = useState<'ingredients' | 'recipe' | 'reason'>('ingredients')
  const [aiMealHistory, setAiMealHistory] = useState<any[]>([])
  const [aiMealHistoryCategory, setAiMealHistoryCategory] = useState<string>('')
  const [isDeletingEditingEntry, setIsDeletingEditingEntry] = useState(false)
  const [originalEditingEntry, setOriginalEditingEntry] = useState<any>(null)
  const [showEditActionsMenu, setShowEditActionsMenu] = useState(false)
  const usdaFallbackAttemptedRef = useRef(false)
  const usdaCacheRef = useRef<Map<string, any>>(new Map())
  
  const [entryTime, setEntryTime] = useState<string>('')

  // New loading state
  const [foodDiaryLoaded, setFoodDiaryLoaded] = useState(() => {
    if (warmDiaryState) return true
    return Array.isArray((userData as any)?.todaysFoods)
  })
  const [diaryHydrated, setDiaryHydrated] = useState<boolean>(() => {
    if (warmDiaryState) return true
    return false
  })
  const [expandedItemIndex, setExpandedItemIndex] = useState<number | null>(null)
 
  const descriptionTextareaRef = useRef<HTMLTextAreaElement | null>(null)
  const editPhotoInputRef = useRef<HTMLInputElement | null>(null)
  const selectPhotoInputRef = useRef<HTMLInputElement | null>(null)
  const summaryCarouselRef = useRef<HTMLDivElement | null>(null)
  const pageTopRef = useRef<HTMLDivElement | null>(null)
  const desktopAddMenuRef = useRef<HTMLDivElement | null>(null)
  const barcodeLabelTimeoutRef = useRef<number | null>(null)
  const photoPreviewRef = useRef<string | null>(null)
  const photoRefreshAttemptedRef = useRef<Record<string, boolean>>({})
  const healthCheckPromptedRef = useRef<Set<string>>(new Set())
  const healthCheckPromptedLoadedRef = useRef(false)

  const [foodImagesLoading, setFoodImagesLoading] = useState<{[key: string]: boolean}>({})
  const [expandedEntries, setExpandedEntries] = useState<{[key: string]: boolean}>({})
  const [entrySwipeOffsets, setEntrySwipeOffsets] = useState<{ [key: string]: number }>({})
  const [entryMenuPositions, setEntryMenuPositions] = useState<
    Record<string, { top?: number; bottom?: number; right: number; maxHeight: number }>
  >({})
  const [swipeMenuEntry, setSwipeMenuEntry] = useState<string | null>(null)
  const [duplicateModalContext, setDuplicateModalContext] = useState<{
    entry: any
    targetDate: string
    mode: 'duplicate' | 'copyToToday'
  } | null>(null)
  const duplicateInFlightRef = useRef(false)
  const duplicateActionDebounceRef = useRef<Record<string, number>>({})
  const favoriteInsertDebounceRef = useRef<Record<string, number>>({})
  const mealInsertDebounceRef = useRef<Record<string, number>>({})
  const pendingServerIdRef = useRef<Map<string, { localId: number; savedAt: number }>>(new Map())
  const foodLibraryRefreshRef = useRef<{ last: number; inFlight: boolean }>({ last: 0, inFlight: false })
  const renameSaveRef = useRef<((value: string) => void) | null>(null)
  const [showFavoritesPicker, setShowFavoritesPicker] = useState(false)
  const favoritesReplaceTargetRef = useRef<number | null>(null)
  const favoritesActionRef = useRef<'analysis' | 'diary' | null>(null)
  const pendingDrinkOverrideRef = useRef<DrinkAmountOverride | null>(null)
  const pendingDrinkTypeRef = useRef<string | null>(null)
  const pendingDrinkWaterLogIdRef = useRef<string | null>(null)
  const editingDrinkMetaRef = useRef<DrinkEntryMeta | null>(null)
  const [favoriteSwipeOffsets, setFavoriteSwipeOffsets] = useState<Record<string, number>>({})
  const swipeMetaRef = useRef<Record<string, { startX: number; startY: number; swiping: boolean; hasMoved: boolean }>>({})
  const swipeClickBlockRef = useRef<Record<string, boolean>>({})
  const favoriteSwipeMetaRef = useRef<Record<string, { startX: number; startY: number; swiping: boolean; hasMoved: boolean }>>({})
  const favoriteClickBlockRef = useRef<Record<string, boolean>>({})
  const [favoritesActiveTab, setFavoritesActiveTab] = useState<'all' | 'favorites' | 'custom'>('all')
  const [favoritesSearch, setFavoritesSearch] = useState('')
  const [favoritesAllServerEntries, setFavoritesAllServerEntries] = useState<any[] | null>(
    () => (initialFavoritesAllSnapshot && initialFavoritesAllSnapshot.length > 0 ? initialFavoritesAllSnapshot : null),
  )
  const [favoritesAllServerLoading, setFavoritesAllServerLoading] = useState<boolean>(
    () => !(initialFavoritesAllSnapshot && initialFavoritesAllSnapshot.length > 0),
  )
  const [showRenameModal, setShowRenameModal] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [renameOriginal, setRenameOriginal] = useState('')
  const [renameCleared, setRenameCleared] = useState(false)
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false)
  const [barcodeError, setBarcodeError] = useState<string | null>(null)
  const [barcodeValue, setBarcodeValue] = useState('')
  const [barcodeStatus, setBarcodeStatus] = useState<'idle' | 'scanning' | 'loading'>('idle')
  const [barcodeStatusHint, setBarcodeStatusHint] = useState<string>('')
  const barcodeReplaceTargetRef = useRef<number | null>(null)
  const barcodeActionRef = useRef<'analysis' | 'diary' | null>(null)
  const [barcodeLabelFlow, setBarcodeLabelFlow] = useState<{
    barcode: string
    reason: 'missing' | 'report'
    productName?: string | null
    brand?: string | null
  } | null>(null)
  const [showBarcodeLabelPrompt, setShowBarcodeLabelPrompt] = useState(false)
  const [autoAnalyzeLabelPhoto, setAutoAnalyzeLabelPhoto] = useState(false)
  const [torchEnabled, setTorchEnabled] = useState(false)
  const [torchAvailable, setTorchAvailable] = useState(false)
  const [showManualBarcodeInput, setShowManualBarcodeInput] = useState(false)
  const barcodeScannerRef = useRef<any>(null)
  const barcodeLookupInFlightRef = useRef(false)
  const barcodeTorchTrackRef = useRef<MediaStreamTrack | null>(null)
  const nativeBarcodeStreamRef = useRef<MediaStream | null>(null)
  const nativeBarcodeVideoRef = useRef<HTMLVideoElement | null>(null)
  const nativeBarcodeFrameRef = useRef<number | null>(null)
  const hybridBarcodeFrameRef = useRef<number | null>(null)
  const [cameraFacing, setCameraFacing] = useState<'front' | 'back'>('back')
  const manualBarcodeInputRef = useRef<HTMLInputElement | null>(null)
  const replacePhotoInputRef = useRef<HTMLInputElement | null>(null)
  const photoReplaceTargetRef = useRef<number | null>(null)
  const [replacePhotoLoading, setReplacePhotoLoading] = useState(false)
  const [replacePhotoError, setReplacePhotoError] = useState<string | null>(null)
  const SWIPE_MENU_WIDTH = 88
  const SWIPE_DELETE_WIDTH = 96
  const [insightsNotification, setInsightsNotification] = useState<{show: boolean, message: string, type: 'updating' | 'updated'} | null>(null)
  const [fullSizeImage, setFullSizeImage] = useState<string | null>(null)
  const [showSavedToast, setShowSavedToast] = useState<boolean>(false)
  const [selectedDate, setSelectedDate] = useState<string>(() => initialSelectedDate)
  const openMenuKeyRef = useRef<string | null>(null)
  const consumePendingDrinkMeta = (override: DrinkAmountOverride | null) => {
    const drinkType = pendingDrinkTypeRef.current
    if (!drinkType) return null
    if (!override) {
      pendingDrinkTypeRef.current = null
      pendingDrinkWaterLogIdRef.current = null
      return null
    }
    const meta = buildDrinkEntryMeta(override, drinkType, pendingDrinkWaterLogIdRef.current)
    pendingDrinkTypeRef.current = null
    pendingDrinkWaterLogIdRef.current = null
    return meta
  }
  useEffect(() => {
    if (!isAnalysisRoute) return
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const routeDate = params.get('date') || ''
      const routeCategory = params.get('category') || ''
      const drinkOverride = parseDrinkOverrideFromParams(params)
      const drinkType = parseDrinkTypeFromParams(params)
      const waterLogId = parseDrinkWaterLogIdFromParams(params)
      if (routeDate && /^\d{4}-\d{2}-\d{2}$/.test(routeDate)) {
        setSelectedDate(routeDate)
      }
      if (routeCategory) {
        setSelectedAddCategory(normalizeCategory(routeCategory) as any)
      }
      if (drinkOverride) {
        pendingDrinkOverrideRef.current = drinkOverride
      }
      pendingDrinkTypeRef.current = drinkType
      pendingDrinkWaterLogIdRef.current = waterLogId
    }
    setShowAddFood(true)
    setShowCategoryPicker(false)
    setShowPhotoOptions(false)
    setPhotoOptionsAnchor(null)
    setShowAnalysisModeModal(false)
  }, [isAnalysisRoute])
  useEffect(() => {
    if (isAnalysisRoute) return
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const open = params.get('open')
    if (!open) {
      pendingDrinkOverrideRef.current = null
      pendingDrinkTypeRef.current = null
      pendingDrinkWaterLogIdRef.current = null
      return
    }
    const routeDate = params.get('date') || ''
    const routeCategory = params.get('category') || ''
    const drinkOverride = parseDrinkOverrideFromParams(params)
    const drinkType = parseDrinkTypeFromParams(params)
    const waterLogId = parseDrinkWaterLogIdFromParams(params)
    const key = `${open}|${routeDate}|${routeCategory}`
    if (openMenuKeyRef.current === key) return
    openMenuKeyRef.current = key

    if (routeDate && /^\d{4}-\d{2}-\d{2}$/.test(routeDate)) {
      setSelectedDate(routeDate)
    }
    if (routeCategory) {
      setSelectedAddCategory(normalizeCategory(routeCategory) as any)
    }
    if (drinkOverride) {
      pendingDrinkOverrideRef.current = drinkOverride
    }
    pendingDrinkTypeRef.current = drinkType
    pendingDrinkWaterLogIdRef.current = waterLogId

    setShowCategoryPicker(false)
    setShowPhotoOptions(false)
    setPhotoOptionsAnchor(null)
    setPhotoOptionsPosition(null)
    setPendingPhotoPicker(false)

    if (open === 'barcode') {
      barcodeReplaceTargetRef.current = null
      barcodeActionRef.current = 'diary'
      setShowBarcodeScanner(true)
      setBarcodeError(null)
      setBarcodeValue('')
    }
    if (open === 'favorites') {
      favoritesReplaceTargetRef.current = null
      favoritesActionRef.current = 'diary'
      setShowFavoritesPicker(true)
    }
  }, [isAnalysisRoute, pathname])
  const categoryRowRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const verifyMergeHoldRef = useRef<Record<string, number>>({})
  const verifyMergeTimerRef = useRef<Record<string, { id: number; fireAt: number }>>({})
  const latestTodaysFoodsRef = useRef<any[]>([])
  const latestHistoryFoodsRef = useRef<any[] | null>(null)
  const diaryHydrationRef = useRef<Record<string, { hydrated: boolean; verified: boolean }>>({})
  const diaryMergeInFlightRef = useRef<Record<string, boolean>>({})
  const pendingFoodLogSaveRef = useRef<Map<string, { key: string; targetDate: string; attempts: number; nextAttemptAt: number; lastAttemptAt: number }>>(new Map())
  const pendingFoodLogTimerRef = useRef<number | null>(null)
  const pendingFoodLogFlushRef = useRef(false)
  const PENDING_SAVE_RETRY_BASE_MS = 2500
  const PENDING_SAVE_RETRY_MAX_MS = 60000
  const PENDING_SAVE_STALE_MS = 5 * 60 * 1000
  const DUPLICATE_CLEANUP_WINDOW_MS = 2 * 60 * 1000
  const VERIFY_MERGE_HOLD_MS = 4000
  const holdVerifyMergeForDate = (date: string, durationMs: number = VERIFY_MERGE_HOLD_MS) => {
    if (!date) return
    verifyMergeHoldRef.current[date] = Date.now() + Math.max(0, durationMs)
  }
  const getVerifyMergeHoldRemaining = (date: string) => {
    const until = verifyMergeHoldRef.current[date]
    if (!until) return 0
    const remaining = until - Date.now()
    if (remaining <= 0) {
      delete verifyMergeHoldRef.current[date]
      return 0
    }
    return remaining
  }
  const scheduleVerifyMergeForDate = (date: string, delayMs: number, run: () => void) => {
    if (!date || delayMs <= 0 || typeof window === 'undefined') return false
    const fireAt = Date.now() + delayMs
    const existing = verifyMergeTimerRef.current[date]
    if (existing) {
      if (existing.fireAt >= fireAt) return true
      window.clearTimeout(existing.id)
    }
    const id = window.setTimeout(() => {
      const current = verifyMergeTimerRef.current[date]
      if (current && current.id === id) {
        delete verifyMergeTimerRef.current[date]
      }
      run()
    }, delayMs)
    verifyMergeTimerRef.current[date] = { id, fireAt }
    return true
  }
  const [historyFoods, setHistoryFoods] = useState<any[] | null>(() => {
    const warmHistory = warmDiaryState?.historyByDate?.[initialSelectedDate]
    if (Array.isArray(warmHistory)) return warmHistory
    const persisted = persistentDiarySnapshot?.byDate?.[initialSelectedDate]
    if (persisted?.entries && Array.isArray(persisted.entries)) return persisted.entries
    return null
  })
  const [waterEntries, setWaterEntries] = useState<WaterLogEntry[]>([])
  const [waterLoading, setWaterLoading] = useState(false)
  const [waterDeletingId, setWaterDeletingId] = useState<string | null>(null)
  useEffect(() => {
    latestTodaysFoodsRef.current = Array.isArray(todaysFoods) ? todaysFoods : []
  }, [todaysFoods])
  useEffect(() => {
    latestHistoryFoodsRef.current = Array.isArray(historyFoods) ? historyFoods : null
  }, [historyFoods])
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
  const [creditRefreshTick, setCreditRefreshTick] = useState<number>(0)
  const [isDiaryRefreshing, setIsDiaryRefreshing] = useState<boolean>(false)
  const diaryRefreshingRef = useRef<boolean>(false)
  const [pullOffset, setPullOffset] = useState<number>(0)
  const pullStartYRef = useRef<number | null>(null)
  const pullOffsetRef = useRef<number>(0)
  const pullScrollParentRef = useRef<HTMLElement | null>(null)
  const [hasPaidAccess, setHasPaidAccess] = useState<boolean>(false)
  const [energyUnit, setEnergyUnit] = useState<'kcal' | 'kJ'>('kcal')
  const [volumeUnit, setVolumeUnit] = useState<'oz' | 'ml'>('oz')
  const [exerciseEntries, setExerciseEntries] = useState<any[]>([])
  const [exerciseCaloriesKcal, setExerciseCaloriesKcal] = useState<number>(0)
  const [exerciseLoading, setExerciseLoading] = useState<boolean>(false)
  const [exerciseError, setExerciseError] = useState<string | null>(null)
  const [exerciseSyncing, setExerciseSyncing] = useState<boolean>(false)
  const [fitbitConnected, setFitbitConnected] = useState<boolean>(() => Boolean(initialDeviceStatus?.fitbitConnected))
  const [garminConnected, setGarminConnected] = useState<boolean>(() => Boolean(initialDeviceStatus?.garminConnected))
  const deviceStatusHydratedRef = useRef(false)
  const [showAddExerciseModal, setShowAddExerciseModal] = useState<boolean>(false)
  const [exerciseTypeSearch, setExerciseTypeSearch] = useState<string>('')
  const [exerciseTypeResults, setExerciseTypeResults] = useState<any[]>([])
  const [exerciseTypeLoading, setExerciseTypeLoading] = useState<boolean>(false)
  const [exerciseTypeError, setExerciseTypeError] = useState<string | null>(null)
  const [exercisePickerCategory, setExercisePickerCategory] = useState<string | null>(null)
  const [selectedExerciseType, setSelectedExerciseType] = useState<any>(null)
  const [exerciseDurationHours, setExerciseDurationHours] = useState<number>(0)
  const [exerciseDurationMins, setExerciseDurationMins] = useState<number>(30)
  const [exerciseDistanceKm, setExerciseDistanceKm] = useState<string>('')
  const [exerciseDistanceUnit, setExerciseDistanceUnit] = useState<'km' | 'mi'>('km')
  const [exerciseTimeOfDay, setExerciseTimeOfDay] = useState<string>('')
  const [exerciseCaloriesOverride, setExerciseCaloriesOverride] = useState<string>('')
  const [exerciseSaveError, setExerciseSaveError] = useState<string | null>(null)
  const [exercisePreviewKcal, setExercisePreviewKcal] = useState<number | null>(null)
  const [exercisePreviewLoading, setExercisePreviewLoading] = useState<boolean>(false)
  const [exercisePreviewError, setExercisePreviewError] = useState<string | null>(null)
  const [editingExerciseEntry, setEditingExerciseEntry] = useState<any>(null)
  const exerciseDraftRef = useRef<{
    selectedExerciseType: any
    exerciseDurationHours: number
    exerciseDurationMins: number
    exerciseDistanceKm: string
    exerciseDistanceUnit: 'km' | 'mi'
    exerciseTimeOfDay: string
    exerciseCaloriesOverride: string
    exercisePickerCategory: string | null
    exerciseTypeSearch: string
    exerciseTypeResults: any[]
  } | null>(null)
  const exerciseModalInitRef = useRef(false)
  const autoExerciseSyncRef = useRef<Record<string, boolean>>({})
  const [macroPopup, setMacroPopup] = useState<{
    title: string
    energyLabel?: string
    macros: MacroSegment[]
  } | null>(null)
  const [quickToast, setQuickToast] = useState<string | null>(null)
  const MULTI_COPY_CLIPBOARD_KEY = 'foodDiary:multiCopyClipboard'
  const [multiCopyClipboardCount, setMultiCopyClipboardCount] = useState<number>(0)
  const [showMultiCopyModal, setShowMultiCopyModal] = useState(false)
  const [multiCopyCategory, setMultiCopyCategory] = useState<typeof MEAL_CATEGORY_ORDER[number] | null>(null)
  const [multiCopySelectedKeys, setMultiCopySelectedKeys] = useState<Record<string, boolean>>({})
  const [showCombineModal, setShowCombineModal] = useState(false)
  const [combineCategory, setCombineCategory] = useState<typeof MEAL_CATEGORY_ORDER[number] | null>(null)
  const [combineSelectedKeys, setCombineSelectedKeys] = useState<Record<string, boolean>>({})
  const [combineMealName, setCombineMealName] = useState<string>('')
  const [combineSaving, setCombineSaving] = useState(false)
  const deletedEntryKeysRef = useRef<Set<string>>(new Set())
  const [deletedEntryNonce, setDeletedEntryNonce] = useState(0) // bump to force dedupe refresh after deletes
  const [favorites, setFavorites] = useState<any[]>([])
  const [foodLibrary, setFoodLibrary] = useState<any[]>([])
  const [foodNameOverrides, setFoodNameOverrides] = useState<any[]>([])
  const isAddMenuOpen = showCategoryPicker || showPhotoOptions

  type MultiCopyClipboardItem = {
    description: string
    nutrition?: any
    total?: any
    items?: any[] | null
    photo?: string | null
    time?: string | null
    createdAt?: string | null
    method?: string | null
  }
  type MultiCopyClipboard = {
    v: 1
    createdAt: number
    items: MultiCopyClipboardItem[]
  }

  const readMultiCopyClipboard = (): MultiCopyClipboard | null => {
    if (typeof window === 'undefined') return null
    try {
      const raw = localStorage.getItem(MULTI_COPY_CLIPBOARD_KEY)
      const parsed = raw ? JSON.parse(raw) : null
      if (!parsed || typeof parsed !== 'object') return null
      if (parsed.v !== 1) return null
      const items = Array.isArray(parsed.items) ? parsed.items : []
      return {
        v: 1,
        createdAt: Number(parsed.createdAt) || Date.now(),
        items: items
          .map((it: any) => ({
            description: (it?.description || '').toString(),
            nutrition: it?.nutrition ?? null,
            total: it?.total ?? null,
            items: Array.isArray(it?.items) ? it.items : null,
            photo: typeof it?.photo === 'string' ? it.photo : null,
            time: typeof it?.time === 'string' ? it.time : null,
            createdAt: typeof it?.createdAt === 'string' ? it.createdAt : null,
            method: typeof it?.method === 'string' ? it.method : null,
          }))
          .filter((it: MultiCopyClipboardItem) => Boolean(it.description)),
      }
    } catch {
      return null
    }
  }

  const writeMultiCopyClipboard = (items: MultiCopyClipboardItem[]) => {
    if (typeof window === 'undefined') return
    try {
      const payload: MultiCopyClipboard = { v: 1, createdAt: Date.now(), items }
      localStorage.setItem(MULTI_COPY_CLIPBOARD_KEY, JSON.stringify(payload))
      setMultiCopyClipboardCount(items.length)
    } catch {}
  }

  const clearMultiCopyClipboard = () => {
    if (typeof window === 'undefined') return
    try {
      localStorage.removeItem(MULTI_COPY_CLIPBOARD_KEY)
    } catch {}
    setMultiCopyClipboardCount(0)
  }

  useEffect(() => {
    const initial = readMultiCopyClipboard()
    setMultiCopyClipboardCount(initial?.items?.length || 0)
    if (typeof window === 'undefined') return
    const onStorage = (e: StorageEvent) => {
      if (e.key !== MULTI_COPY_CLIPBOARD_KEY) return
      const next = readMultiCopyClipboard()
      setMultiCopyClipboardCount(next?.items?.length || 0)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  // Always scope "today" entries to the currently selected calendar date so cached prior-day rows
  // (e.g., from warm session storage) can't leak into the visible day.
  const todaysFoodsForSelectedDate = useMemo(
    () => filterEntriesForDate(todaysFoods, selectedDate),
    [todaysFoods, selectedDate],
  )

  const triggerHaptic = (duration: number = 12) => {
    try {
      const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
      const pref = typeof localStorage !== 'undefined' ? localStorage.getItem('hapticsEnabled') : null
      const enabled = pref === null ? true : pref === 'true'
      if (!reduced && enabled && 'vibrate' in navigator) navigator.vibrate(duration)
    } catch {}
  }

  useEffect(() => {
    const updateIsMobile = () => {
      if (typeof window === 'undefined') return
      setIsMobile(window.innerWidth < 768)
    }
    updateIsMobile()
    window.addEventListener('resize', updateIsMobile)
    return () => window.removeEventListener('resize', updateIsMobile)
  }, [])

  useEffect(() => {
    setSummarySlideIndex(0)
    setSummaryRenderNonce((prev) => prev + 1)
    if (!summaryCarouselRef.current) return
    summaryCarouselRef.current.scrollTo({ left: 0, behavior: 'auto' })
  }, [selectedDate, isMobile])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      localStorage.setItem(FOOD_DIARY_LAST_VISIT_KEY, buildTodayIso())
    } catch {}
  }, [])

  useEffect(() => {
    if (typeof document === 'undefined') return
    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') return
      if (!readAppHiddenAt()) return
      setResumeTick((prev) => prev + 1)
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [])

  useEffect(() => {
    if (deviceStatusHydratedRef.current) return
    const snapshot = readDeviceStatusSnapshot(userCacheKey)
    if (!snapshot) return
    setFitbitConnected(Boolean(snapshot.fitbitConnected))
    setGarminConnected(Boolean(snapshot.garminConnected))
  }, [userCacheKey])

  const loadExerciseEntriesForDate = async (dateKey: string, options?: { silent?: boolean; force?: boolean }) => {
    if (!dateKey) return
    const cached = readExerciseSnapshot(dateKey)
    const shouldRefresh = options?.force ? true : shouldRefreshOnResume('exercise')
    if (cached && Array.isArray(cached.entries)) {
      setExerciseEntries(cached.entries)
      setExerciseCaloriesKcal(Number(cached.caloriesKcal) || 0)
    }
    if (!options?.silent) {
      if (!cached) {
        setExerciseLoading(true)
      } else {
        setExerciseLoading(false)
      }
      setExerciseError(null)
    }
    if (!shouldRefresh && cached && Array.isArray(cached.entries)) {
      return
    }
    try {
      const res = await fetch(`/api/exercise-entries?date=${encodeURIComponent(dateKey)}`, {
        method: 'GET',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to load exercise')
      }
      const entries = Array.isArray(data?.entries) ? data.entries : []
      const calories = Number(data?.exerciseCalories) || 0
      setExerciseEntries(entries)
      setExerciseCaloriesKcal(calories)
      writeExerciseSnapshot(dateKey, entries, calories)
      setExerciseError(null)
      if (shouldRefresh) {
        markResumeHandled('exercise')
      }
    } catch (err: any) {
      if (!options?.silent) {
        setExerciseError(err?.message || 'Failed to load exercise')
      }
    } finally {
      if (!options?.silent) setExerciseLoading(false)
    }
  }

  const refreshDeviceStatus = async () => {
    const shouldRefresh = shouldRefreshOnResume('deviceStatus')
    if (!shouldRefresh && initialDeviceStatus) {
      setFitbitConnected(Boolean(initialDeviceStatus.fitbitConnected))
      setGarminConnected(Boolean(initialDeviceStatus.garminConnected))
      deviceStatusHydratedRef.current = true
      return
    }
    try {
      const [fitbitRes, garminRes] = await Promise.all([
        fetch('/api/fitbit/status', { method: 'GET' }).catch(() => null),
        fetch('/api/garmin/status', { method: 'GET' }).catch(() => null),
      ])
      const fitbit = fitbitRes ? await fitbitRes.json().catch(() => ({})) : {}
      const garmin = garminRes ? await garminRes.json().catch(() => ({})) : {}
      const fitbitConnectedNext = Boolean(fitbit?.connected)
      const garminConnectedNext = Boolean(garmin?.connected)
      setFitbitConnected(fitbitConnectedNext)
      setGarminConnected(garminConnectedNext)
      deviceStatusHydratedRef.current = true
      writeDeviceStatusSnapshot(userCacheKey, {
        fitbitConnected: fitbitConnectedNext,
        garminConnected: garminConnectedNext,
        savedAt: Date.now(),
      })
      if (shouldRefresh) {
        markResumeHandled('deviceStatus')
      }
    } catch {
      // best-effort
    }
  }

  const syncExerciseFromDevices = async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setExerciseSyncing(true)
      setExerciseError(null)
    }
    try {
      const res = await fetch('/api/exercise/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: selectedDate }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to sync exercise')
      }
      const entries = Array.isArray(data?.entries) ? data.entries : []
      const calories = Number(data?.exerciseCalories) || 0
      setExerciseEntries(entries)
      setExerciseCaloriesKcal(calories)
      writeExerciseSnapshot(selectedDate, entries, calories)
    } catch (err: any) {
      if (!options?.silent) {
        setExerciseError(err?.message || 'Failed to sync exercise')
      }
    } finally {
      if (!options?.silent) setExerciseSyncing(false)
    }
  }

  const deleteExerciseEntry = async (entryId: string) => {
    if (!entryId) return
    let shouldReload = true
    try {
      setExerciseError(null)
      const res = await fetch(`/api/exercise-entries/${encodeURIComponent(entryId)}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to delete exercise')
      }
    } catch (err: any) {
      setExerciseError(err?.message || 'Failed to delete exercise')
    } finally {
      if (shouldReload) {
        await loadExerciseEntriesForDate(selectedDate, { silent: true, force: true })
      }
    }
  }

  const openCreateExercise = () => {
    setEditingExerciseEntry(null)
    setShowAddExerciseModal(true)
  }

  const resetExerciseDraft = () => {
    exerciseDraftRef.current = null
    setExerciseSaveError(null)
    setExerciseTypeError(null)
    setExercisePreviewKcal(null)
    setExercisePreviewError(null)
    setExercisePreviewLoading(false)
    setExerciseTypeSearch('')
    setExerciseTypeResults([])
    setSelectedExerciseType(null)
    setExercisePickerCategory(null)
    setExerciseDurationHours(0)
    setExerciseDurationMins(30)
    setExerciseDistanceKm('')
    setExerciseDistanceUnit('km')
    setExerciseTimeOfDay('')
    setExerciseCaloriesOverride('')
  }

  const openEditExercise = (entry: any) => {
    if (!entry?.id) return
    if (String(entry?.source || '').toUpperCase() !== 'MANUAL') {
      showQuickToast("Synced exercise entries can't be edited here.")
      return
    }
    setEditingExerciseEntry(entry)
    setShowAddExerciseModal(true)
  }

  useEffect(() => {
    refreshDeviceStatus()
  }, [session?.user?.id])

  useEffect(() => {
    loadExerciseEntriesForDate(selectedDate)
    // Keep device pills updated when switching dates (low-cost, cached by browser).
    refreshDeviceStatus()
  }, [selectedDate, resumeTick])

  useEffect(() => {
    const today = buildTodayIso()
    if (selectedDate !== today) return
    if (!fitbitConnected && !garminConnected) return
    if (autoExerciseSyncRef.current[selectedDate]) return
    autoExerciseSyncRef.current[selectedDate] = true
    syncExerciseFromDevices({ silent: true })
  }, [selectedDate, fitbitConnected, garminConnected])

  const loadExerciseTypes = async (params: { search?: string; category?: string | null }) => {
    setExerciseTypeLoading(true)
    setExerciseTypeError(null)
    try {
      const qs = new URLSearchParams()
      if (params.search) qs.set('search', params.search)
      if (params.category) qs.set('category', params.category)
      qs.set('limit', '30')
      const res = await fetch(`/api/exercise-types?${qs.toString()}`, {
        method: 'GET',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to load exercise types')
      }
      setExerciseTypeResults(Array.isArray(data?.items) ? data.items : [])
    } catch (err: any) {
      setExerciseTypeError(err?.message || 'Failed to load exercise types')
      setExerciseTypeResults([])
    } finally {
      setExerciseTypeLoading(false)
    }
  }

  useEffect(() => {
    if (!showAddExerciseModal) {
      exerciseModalInitRef.current = false
      return
    }
    if (exerciseModalInitRef.current) return
    exerciseModalInitRef.current = true

    setExerciseSaveError(null)
    setExerciseTypeError(null)
    setExercisePreviewKcal(null)
    setExercisePreviewError(null)

    if (editingExerciseEntry?.id) {
      setExerciseTypeSearch('')
      setExerciseTypeResults([])
      const mins = Number(editingExerciseEntry?.durationMinutes) || 0
      const hours = Math.max(0, Math.min(23, Math.floor(mins / 60)))
      const minutes = Math.max(0, Math.min(59, mins % 60))
      setExerciseDurationHours(hours)
      setExerciseDurationMins(minutes)

      const distanceKm = editingExerciseEntry?.distanceKm
      if (typeof distanceKm === 'number' && Number.isFinite(distanceKm) && distanceKm > 0) {
        setExerciseDistanceUnit('km')
        setExerciseDistanceKm(formatDistanceForInput(distanceKm))
      } else {
        setExerciseDistanceKm('')
        setExerciseDistanceUnit('km')
      }

      const startTimeRaw = editingExerciseEntry?.startTime
      if (startTimeRaw) {
        const dt = new Date(startTimeRaw)
        if (!Number.isNaN(dt.getTime())) {
          const hh = String(dt.getHours()).padStart(2, '0')
          const mm = String(dt.getMinutes()).padStart(2, '0')
          setExerciseTimeOfDay(`${hh}:${mm}`)
        } else {
          setExerciseTimeOfDay('')
        }
      } else {
        setExerciseTimeOfDay('')
      }

      const overrideRaw = (editingExerciseEntry as any)?.rawPayload?.caloriesOverride
      const overrideValue = Number(overrideRaw)
      if (Number.isFinite(overrideValue) && overrideValue > 0) {
        const display = convertKcalToUnit(overrideValue, energyUnit)
        setExerciseCaloriesOverride(display !== null ? String(Math.round(display)) : '')
      } else {
        setExerciseCaloriesOverride('')
      }

      const type = editingExerciseEntry?.exerciseType
      if (type?.id) {
        setSelectedExerciseType(type)
      } else if (editingExerciseEntry?.exerciseTypeId) {
        setSelectedExerciseType({
          id: editingExerciseEntry.exerciseTypeId,
          name: editingExerciseEntry?.label || 'Exercise',
          category: 'Cardio',
          met: Number(editingExerciseEntry?.met) || 0,
        })
      } else {
        setSelectedExerciseType(null)
      }

      setExercisePickerCategory(null)
      return
    }

    if (exerciseDraftRef.current) {
      const draft = exerciseDraftRef.current
      setSelectedExerciseType(draft.selectedExerciseType)
      setExercisePickerCategory(draft.exercisePickerCategory)
      setExerciseTypeSearch(draft.exerciseTypeSearch)
      setExerciseTypeResults(draft.exerciseTypeResults)
      setExerciseDurationHours(draft.exerciseDurationHours)
      setExerciseDurationMins(draft.exerciseDurationMins)
      setExerciseDistanceKm(draft.exerciseDistanceKm)
      setExerciseDistanceUnit(draft.exerciseDistanceUnit)
      setExerciseTimeOfDay(draft.exerciseTimeOfDay)
      setExerciseCaloriesOverride(draft.exerciseCaloriesOverride)
      return
    }

    setExerciseTypeSearch('')
    setExerciseTypeResults([])
    setSelectedExerciseType(null)
    setExercisePickerCategory(null)
    setExerciseDurationHours(0)
    setExerciseDurationMins(30)
    setExerciseDistanceKm('')
    setExerciseDistanceUnit('km')
    setExerciseTimeOfDay('')
    setExerciseCaloriesOverride('')
  }, [showAddExerciseModal, editingExerciseEntry?.id, energyUnit])

  useEffect(() => {
    if (!showAddExerciseModal) return
    if (editingExerciseEntry?.id) return
    exerciseDraftRef.current = {
      selectedExerciseType,
      exerciseDurationHours,
      exerciseDurationMins,
      exerciseDistanceKm,
      exerciseDistanceUnit,
      exerciseTimeOfDay,
      exerciseCaloriesOverride,
      exercisePickerCategory,
      exerciseTypeSearch,
      exerciseTypeResults,
    }
  }, [
    showAddExerciseModal,
    editingExerciseEntry?.id,
    selectedExerciseType,
    exerciseDurationHours,
    exerciseDurationMins,
    exerciseDistanceKm,
    exerciseDistanceUnit,
    exerciseTimeOfDay,
    exerciseCaloriesOverride,
    exercisePickerCategory,
    exerciseTypeSearch,
    exerciseTypeResults,
  ])

  useEffect(() => {
    if (!showAddExerciseModal) return
    try {
      const prevOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = prevOverflow
      }
    } catch {
      // ignore
    }
  }, [showAddExerciseModal])

  useEffect(() => {
    if (!showAddExerciseModal) return
    const handle = window.setTimeout(() => {
      const search = exerciseTypeSearch.trim()
      if (search.length > 0) {
        loadExerciseTypes({ search })
        return
      }
      if (exercisePickerCategory) {
        loadExerciseTypes({ category: exercisePickerCategory })
      } else {
        setExerciseTypeResults([])
      }
    }, 200)
    return () => window.clearTimeout(handle)
  }, [exerciseTypeSearch, showAddExerciseModal, exercisePickerCategory])

  const pickQuickExercise = async (query: string) => {
    setExerciseTypeError(null)
    setExerciseSaveError(null)
    try {
      const qs = new URLSearchParams()
      qs.set('search', query)
      qs.set('limit', '1')
      const res = await fetch(`/api/exercise-types?${qs.toString()}`, { method: 'GET' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Failed to load exercise')
      const first = Array.isArray(data?.items) ? data.items[0] : null
      if (first) {
        setSelectedExerciseType(first)
        return
      }
      setExerciseTypeError('No matches. Try searching.')
    } catch (err: any) {
      setExerciseTypeError(err?.message || 'Failed to load exercise')
    }
  }

  const computeExerciseDurationMinutes = () => {
    const hours = Number(exerciseDurationHours)
    const mins = Number(exerciseDurationMins)
    const clampedHours = Number.isFinite(hours) ? Math.max(0, Math.min(23, Math.floor(hours))) : 0
    const clampedMins = Number.isFinite(mins) ? Math.max(0, Math.min(59, Math.floor(mins))) : 0
    return clampedHours * 60 + clampedMins
  }

  const roundTo = (value: number, decimals: number) => {
    const factor = Math.pow(10, decimals)
    return Math.round(value * factor) / factor
  }

  const formatDistanceForInput = (distanceKm: number) => {
    const rounded = roundTo(distanceKm, 2)
    if (!Number.isFinite(rounded)) return ''
    const asString = String(rounded)
    return asString.replace(/\.0+$/, '')
  }

  const computeDistanceKmForRequest = () => {
    const distanceValue = exerciseDistanceKm.trim().length > 0 ? Number(exerciseDistanceKm) : null
    if (distanceValue === null) return null
    if (!Number.isFinite(distanceValue) || distanceValue <= 0) return NaN
    return exerciseDistanceUnit === 'mi' ? distanceValue * 1.60934 : distanceValue
  }

  useEffect(() => {
    if (!showAddExerciseModal) return
    if (!selectedExerciseType?.id) {
      setExercisePreviewKcal(null)
      setExercisePreviewError(null)
      return
    }

    const durationMinutes = computeExerciseDurationMinutes()
    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
      setExercisePreviewKcal(null)
      setExercisePreviewError(null)
      return
    }

    const distanceKm = computeDistanceKmForRequest()
    if (Number.isNaN(distanceKm)) {
      setExercisePreviewKcal(null)
      setExercisePreviewError(null)
      return
    }

    setExercisePreviewLoading(true)
    setExercisePreviewError(null)
    const handle = window.setTimeout(async () => {
      try {
        const res = await fetch('/api/exercise-preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            exerciseTypeId: selectedExerciseType.id,
            durationMinutes,
            distanceKm: distanceKm !== null ? distanceKm : null,
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data?.error || 'Failed to estimate calories')
        const kcal = Number(data?.calories)
        setExercisePreviewKcal(Number.isFinite(kcal) ? kcal : null)
      } catch (err: any) {
        setExercisePreviewKcal(null)
        setExercisePreviewError(err?.message || 'Failed to estimate calories')
      } finally {
        setExercisePreviewLoading(false)
      }
    }, 250)

    return () => window.clearTimeout(handle)
  }, [showAddExerciseModal, selectedExerciseType?.id, exerciseDistanceKm, exerciseDistanceUnit, exerciseDurationHours, exerciseDurationMins])

  const saveManualExercise = async () => {
    setExerciseSaveError(null)
    if (!selectedExerciseType?.id) {
      setExerciseSaveError('Please select an exercise.')
      return
    }
    const minutes = computeExerciseDurationMinutes()
    if (!Number.isFinite(minutes) || minutes <= 0) {
      setExerciseSaveError('Please enter a valid duration.')
      return
    }
    const distanceKmNum = computeDistanceKmForRequest()
    if (Number.isNaN(distanceKmNum)) {
      setExerciseSaveError('Please enter a valid distance.')
      return
    }
    let startTime: string | undefined
    if (exerciseTimeOfDay && /^\d{2}:\d{2}$/.test(exerciseTimeOfDay)) {
      try {
        const dt = new Date(`${selectedDate}T${exerciseTimeOfDay}:00`)
        if (!Number.isNaN(dt.getTime())) startTime = dt.toISOString()
      } catch {
        // ignore
      }
    }

    const caloriesOverrideRaw = exerciseCaloriesOverride.trim()
    let caloriesOverride: number | null = null
    if (caloriesOverrideRaw.length > 0) {
      const parsed = Number(caloriesOverrideRaw)
      if (!Number.isFinite(parsed) || parsed <= 0) {
        setExerciseSaveError('Please enter a valid calorie value.')
        return
      }
      const inKcal = energyUnit === 'kJ' ? parsed / KCAL_TO_KJ : parsed
      const rounded = Math.round(inKcal)
      if (!Number.isFinite(rounded) || rounded <= 0 || rounded > 50_000) {
        setExerciseSaveError('Please enter a valid calorie value.')
        return
      }
      caloriesOverride = rounded
    }
    const existingOverrideRaw = (editingExerciseEntry as any)?.rawPayload?.caloriesOverride
    const existingOverride = Number(existingOverrideRaw)
    const hasExistingOverride = Number.isFinite(existingOverride) && existingOverride > 0
    try {
      const isEditing = Boolean(editingExerciseEntry?.id)
      const endpoint = isEditing ? `/api/exercise-entries/${encodeURIComponent(editingExerciseEntry.id)}` : '/api/exercise-entries'
      const payload: any = {
        exerciseTypeId: selectedExerciseType.id,
        durationMinutes: Math.floor(minutes),
        distanceKm: distanceKmNum,
        startTime: startTime || null,
      }
      if (!isEditing) payload.date = selectedDate
      if (caloriesOverrideRaw.length > 0 || hasExistingOverride) {
        payload.caloriesOverride = caloriesOverride
      }

      const res = await fetch(endpoint, {
        method: isEditing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to save exercise')
      }
      setShowAddExerciseModal(false)
      setEditingExerciseEntry(null)
      await loadExerciseEntriesForDate(selectedDate, { silent: true, force: true })
    } catch (err: any) {
      setExerciseSaveError(err?.message || 'Failed to save exercise')
    }
  }

  useEffect(() => {
    try {
      if (Array.isArray((userData as any)?.favorites)) {
        const raw = (userData as any).favorites as any[]
        const repaired = repairAndDedupeFavorites(raw)
        setFavorites(repaired.next)
        return
      }
      if (typeof window !== 'undefined') {
        const cached = localStorage.getItem('food:favorites')
        if (cached) {
          const parsed = JSON.parse(cached)
          if (Array.isArray(parsed)) {
            const repaired = repairAndDedupeFavorites(parsed)
            setFavorites(repaired.next)
          }
        }
      }
    } catch (error) {
      console.warn('Could not load favorites', error)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userData?.favorites])

  useEffect(() => {
    try {
      const raw = (userData as any)?.foodLibrary
      if (Array.isArray(raw)) {
        setFoodLibrary(raw)
        return
      }
      if (typeof window !== 'undefined') {
        const cached = localStorage.getItem('food:library')
        if (cached) {
          const parsed = JSON.parse(cached)
          if (Array.isArray(parsed)) setFoodLibrary(parsed)
        }
      }
    } catch (error) {
      console.warn('Could not load food library', error)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [(userData as any)?.foodLibrary])

  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem('food:favorites', JSON.stringify(favorites))
      }
    } catch {
      // Best-effort only
    }
  }, [favorites])

  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem('food:library', JSON.stringify(foodLibrary))
      }
    } catch {}
  }, [foodLibrary])

  useEffect(() => {
    try {
      const raw = (userData as any)?.foodNameOverrides
      if (Array.isArray(raw)) {
        setFoodNameOverrides(raw)
        return
      }
      if (typeof window !== 'undefined') {
        const cached = localStorage.getItem('food:nameOverrides')
        if (cached) {
          const parsed = JSON.parse(cached)
          if (Array.isArray(parsed)) setFoodNameOverrides(parsed)
        }
      }
    } catch (error) {
      console.warn('Could not load food name overrides', error)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [(userData as any)?.foodNameOverrides])

  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem('food:nameOverrides', JSON.stringify(foodNameOverrides))
      }
    } catch {}
  }, [foodNameOverrides])

  useEffect(() => {
    if (healthCheckPromptedLoadedRef.current) return
    healthCheckPromptedLoadedRef.current = true
    if (typeof window === 'undefined') return
    try {
      const raw = localStorage.getItem(HEALTH_CHECK_PROMPT_STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        const cleaned = parsed
          .map((id) => String(id || '').trim())
          .filter((id) => id.length > 0 && !id.startsWith('analysis:'))
        cleaned.forEach((id) => healthCheckPromptedRef.current.add(id))
        if (cleaned.length !== parsed.length) {
          localStorage.setItem(HEALTH_CHECK_PROMPT_STORAGE_KEY, JSON.stringify(cleaned))
        }
      }
    } catch {}
  }, [])

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

    const goalChoiceValue =
      typeof (userData as any).goalChoice === 'string' ? (userData as any).goalChoice.toLowerCase() : '';
    const useManualTargets = goalChoiceValue.includes('lose') || goalChoiceValue.includes('gain');

    return calculateDailyTargets({
      gender: userData.gender,
      birthdate: (userData as any).birthdate || userData.profileInfo?.dateOfBirth,
      weightKg: Number.isFinite(weightKg || NaN) ? (weightKg as number) : null,
      heightCm: Number.isFinite(heightCm || NaN) ? (heightCm as number) : null,
      dietTypes: (userData as any).dietTypes ?? (userData as any).dietType,
      exerciseFrequency: (userData as any).exerciseFrequency,
      goals: goalsArray,
      goalChoice: (userData as any).goalChoice,
      goalIntensity: (userData as any).goalIntensity,
      calorieTarget: useManualTargets ? (userData as any).goalCalorieTarget : null,
      macroSplit: useManualTargets ? (userData as any).goalMacroSplit : null,
      fiberTarget: useManualTargets ? (userData as any).goalFiberTarget : null,
      sugarMax: useManualTargets ? (userData as any).goalSugarMax : null,
      exerciseDurations: (userData as any).exerciseDurations,
      bodyType: (userData as any).bodyType,
      healthSituations: (userData as any).healthSituations,
      allergies: (userData as any).allergies,
      diabetesType: (userData as any).diabetesType,
    })
  }, [userData])

  const healthCheckSettings = useMemo(() => {
    const raw = (userData as any)?.healthCheckSettings
    return normalizeHealthCheckSettings(raw || DEFAULT_HEALTH_CHECK_SETTINGS)
  }, [userData])

  const hasHealthCheckContext = useMemo(() => {
    const goals = Array.isArray(userData?.goals) ? userData.goals.filter(Boolean) : []
    const diets = Array.isArray((userData as any)?.dietTypes)
      ? (userData as any).dietTypes
      : Array.isArray((userData as any)?.dietType)
      ? (userData as any).dietType
      : []
    return goals.length > 0 || (Array.isArray(diets) && diets.length > 0)
  }, [userData])

  useEffect(() => {
    if (!healthCheckSettings.enabled || healthCheckSettings.frequency === 'never') {
      if (healthCheckPrompt) setHealthCheckPrompt(null)
    }
  }, [healthCheckSettings.enabled, healthCheckSettings.frequency, healthCheckPrompt])

  useEffect(() => {
    if (!userData) return
    const pending = pendingAnalysisHealthCheckRef.current
    if (!pending) return
    pendingAnalysisHealthCheckRef.current = null
    maybeShowHealthCheckPrompt(pending.entry, {
      entryKey: pending.entryKey,
      source: 'analysis',
      totalsOverride: pending.totalsOverride,
    })
  }, [userData, hasHealthCheckContext, healthCheckSettings.enabled, healthCheckSettings.frequency])

  const getHealthCheckThresholds = () => {
    const sugarTarget = Number((dailyTargets as any)?.sugarMax)
    const carbsTarget = Number(dailyTargets?.carbs)
    const fatTarget = Number(dailyTargets?.fat)
    const pick = (target: number, base: number) =>
      Number.isFinite(target) && target > 0 ? Math.max(base, target * 0.55) : base
    const recommended = {
      sugar: pick(sugarTarget, HEALTH_CHECK_THRESHOLDS.sugar),
      carbs: pick(carbsTarget, HEALTH_CHECK_THRESHOLDS.carbs),
      fat: pick(fatTarget, HEALTH_CHECK_THRESHOLDS.fat),
    }
    const resolve = (value: number | null | undefined, fallback: number) =>
      Number.isFinite(value as number) && (value as number) > 0 ? (value as number) : fallback
    return {
      sugar: resolve(healthCheckSettings.thresholds.sugar, recommended.sugar),
      carbs: resolve(healthCheckSettings.thresholds.carbs, recommended.carbs),
      fat: resolve(healthCheckSettings.thresholds.fat, recommended.fat),
    }
  }
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

  const normalizeDbQuery = (value: string) =>
    String(value || '')
      .toLowerCase()
      .replace(/^\s*\d+(?:\.\d+)?\s+/, '')
      .replace(/[^a-z0-9\s]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

  const scoreDbMatch = (query: string, candidateName: string) => {
    const q = normalizeDbQuery(query)
    const name = normalizeDbQuery(candidateName)
    if (!q || !name) return 0
    let score = 0
    if (name === q) score += 100
    if (name.startsWith(q)) score += 60
    if (name.includes(q)) score += 40
    const qTokens = q.split(' ').filter(Boolean)
    if (qTokens.length) {
      const hitCount = qTokens.filter((t) => name.includes(t)).length
      score += hitCount * 8
    }
    if (q.includes('whole') && name.includes('whole')) score += 20
    if (q.includes('roast') && name.includes('roast')) score += 15
    if (q.includes('roasted') && name.includes('roasted')) score += 15
    if (q.includes('chicken') && name.includes('chicken')) score += 10
    if (!q.includes('skin') && name.includes('meat only')) score += 18
    if (!q.includes('skin') && name.includes('meat and skin')) score -= 12
    if (!q.includes('dark') && name.includes('dark meat')) score -= 6
    if (!q.includes('light') && name.includes('light meat')) score -= 4
    if (!q.includes('dried') && !q.includes('powder')) {
      if (name.includes('dried')) score -= 30
      if (name.includes('powder')) score -= 30
    }
    if (!q.includes('pickled') && name.includes('pickled')) score -= 30
    if (!q.includes('white') && !q.includes('whites') && (name.includes('white') || name.includes('whites'))) score -= 20
    if (!q.includes('yolk') && !q.includes('yolks') && (name.includes('yolk') || name.includes('yolks'))) score -= 20
    return score
  }

  const buildEggSizeOptions = (item: any) => {
    const baseCalories = Number(item?.calories)
    const baseProtein = Number(item?.protein_g)
    const baseCarbs = Number(item?.carbs_g)
    const baseFat = Number(item?.fat_g)
    const baseFiber = Number(item?.fiber_g)
    const baseSugar = Number(item?.sugar_g)
    const hasBase =
      (Number.isFinite(baseCalories) && baseCalories > 0) ||
      (Number.isFinite(baseProtein) && baseProtein > 0) ||
      (Number.isFinite(baseCarbs) && baseCarbs > 0) ||
      (Number.isFinite(baseFat) && baseFat > 0)
    if (!hasBase) return []

    const sizes = [
      { id: 'egg:small', label: '1 egg (small) — 38g', grams: 38 },
      { id: 'egg:medium', label: '1 egg (medium) — 44g', grams: 44 },
      { id: 'egg:large', label: '1 egg (large) — 50g', grams: 50 },
      { id: 'egg:extra-large', label: '1 egg (extra large) — 56g', grams: 56 },
      { id: 'egg:jumbo', label: '1 egg (jumbo) — 63g', grams: 63 },
    ]

    const roundMacro = (value: number, factor: number, decimals: number) => {
      const num = value * factor
      const precision = Math.pow(10, decimals)
      return Math.round(num * precision) / precision
    }

    return sizes.map((size) => {
      const factor = size.grams / 100
      return {
        id: size.id,
        label: size.label,
        serving_size: size.label,
        grams: size.grams,
        unit: 'g',
        calories: Number.isFinite(baseCalories) ? Math.round(baseCalories * factor) : null,
        protein_g: Number.isFinite(baseProtein) ? roundMacro(baseProtein, factor, 1) : null,
        carbs_g: Number.isFinite(baseCarbs) ? roundMacro(baseCarbs, factor, 1) : null,
        fat_g: Number.isFinite(baseFat) ? roundMacro(baseFat, factor, 1) : null,
        fiber_g: Number.isFinite(baseFiber) ? roundMacro(baseFiber, factor, 1) : null,
        sugar_g: Number.isFinite(baseSugar) ? roundMacro(baseSugar, factor, 1) : null,
        source: 'usda',
      }
    })
  }

  const getEdibleYieldFactor = (query: string) => {
    const q = normalizeDbQuery(query)
    if (!q.includes('whole')) return 1
    if (/(chicken|turkey|duck|goose|hen|cornish)/i.test(q)) return 0.55
    if (/(fish|salmon|trout|snapper|mackerel|sardine)/i.test(q)) return 0.7
    if (/(lamb|goat|pork|beef)/i.test(q)) return 0.65
    return 1
  }

  const applyServingOptionToItem = (item: any, option: any) => {
    const next = { ...item }
    const baseWeight = getBaseWeightPerServing(item)
    const optionGrams =
      option?.grams && Number.isFinite(Number(option.grams)) ? Number(option.grams) : null
    const optionMl = option?.ml && Number.isFinite(Number(option.ml)) ? Number(option.ml) : null
    const optionWeight = optionGrams ?? optionMl
    const optionLabel = String(option?.serving_size || option?.label || '').trim()
    const optionMeta = optionLabel ? parseServingUnitMetadata(optionLabel) : null
    const optionIsDiscrete =
      optionMeta && isDiscreteUnitLabel(optionMeta.unitLabel) ? true : false
    const optionPieces = optionIsDiscrete && optionMeta?.quantity && optionMeta.quantity > 0 ? optionMeta.quantity : 1
    const piecesPerServing =
      Number.isFinite(Number(item?.piecesPerServing)) && Number(item.piecesPerServing) > 0
        ? Number(item.piecesPerServing)
        : 1
    const pieceScale =
      optionIsDiscrete && piecesPerServing > 1 ? Math.max(piecesPerServing / optionPieces, 1) : 1
    next.serving_size = option?.serving_size || option?.label || next.serving_size
    if (option?.calories != null) next.calories = option.calories
    if (option?.protein_g != null) next.protein_g = option.protein_g
    if (option?.carbs_g != null) next.carbs_g = option.carbs_g
    if (option?.fat_g != null) next.fat_g = option.fat_g
    if (option?.fiber_g != null) next.fiber_g = option.fiber_g
    if (option?.sugar_g != null) next.sugar_g = option.sugar_g
    if (baseWeight && optionWeight && baseWeight > 0 && optionWeight > 0) {
      const ratio = optionWeight / baseWeight
      const scale = (value: any, decimals: number) => {
        if (!Number.isFinite(Number(value))) return null
        const num = Number(value) * ratio
        const factor = Math.pow(10, decimals)
        return Math.round(num * factor) / factor
      }
      if (option?.calories == null && Number.isFinite(Number(item?.calories))) {
        next.calories = Math.round(Number(item.calories) * ratio)
      }
      if (option?.protein_g == null && Number.isFinite(Number(item?.protein_g))) {
        next.protein_g = scale(item.protein_g, 1)
      }
      if (option?.carbs_g == null && Number.isFinite(Number(item?.carbs_g))) {
        next.carbs_g = scale(item.carbs_g, 1)
      }
      if (option?.fat_g == null && Number.isFinite(Number(item?.fat_g))) {
        next.fat_g = scale(item.fat_g, 1)
      }
      if (option?.fiber_g == null && Number.isFinite(Number(item?.fiber_g))) {
        next.fiber_g = scale(item.fiber_g, 1)
      }
      if (option?.sugar_g == null && Number.isFinite(Number(item?.sugar_g))) {
        next.sugar_g = scale(item.sugar_g, 1)
      }
    }
    if (pieceScale > 1) {
      const scaleMacro = (value: any, decimals: number, isCalories = false) => {
        if (!Number.isFinite(Number(value))) return null
        const num = Number(value) * pieceScale
        if (isCalories) return Math.round(num)
        const factor = Math.pow(10, decimals)
        return Math.round(num * factor) / factor
      }
      if (Number.isFinite(Number(next.calories))) next.calories = scaleMacro(next.calories, 0, true)
      if (Number.isFinite(Number(next.protein_g))) next.protein_g = scaleMacro(next.protein_g, 1)
      if (Number.isFinite(Number(next.carbs_g))) next.carbs_g = scaleMacro(next.carbs_g, 1)
      if (Number.isFinite(Number(next.fat_g))) next.fat_g = scaleMacro(next.fat_g, 1)
      if (Number.isFinite(Number(next.fiber_g))) next.fiber_g = scaleMacro(next.fiber_g, 1)
      if (Number.isFinite(Number(next.sugar_g))) next.sugar_g = scaleMacro(next.sugar_g, 1)
    }
    if (optionGrams) {
      next.customGramsPerServing = pieceScale > 1 ? optionGrams * pieceScale : optionGrams
      next.customMlPerServing = null
      next.weightUnit = 'g'
    } else if (optionMl) {
      next.customMlPerServing = pieceScale > 1 ? optionMl * pieceScale : optionMl
      next.customGramsPerServing = null
      next.weightUnit = 'ml'
    }
    next.selectedServingId = option?.id || next.selectedServingId
    const updatedBaseWeight = getBaseWeightPerServing(next)
    if (updatedBaseWeight && updatedBaseWeight > 0) {
      const unit = next?.weightUnit === 'ml' ? 'ml' : next?.weightUnit === 'oz' ? 'oz' : 'g'
      const computed = updatedBaseWeight * (next.servings || 1)
      const precision = unit === 'oz' ? 100 : 1000
      next.weightAmount = Math.round(computed * precision) / precision
    }
    return next
  }

  const handleServingOptionSelect = (index: number, optionId: string) => {
    const itemsCopy = [...analyzedItems]
    const item = itemsCopy[index]
    if (!item) return
    const options = Array.isArray(item?.servingOptions) ? item.servingOptions : []
    const selected = options.find((opt: any) => opt?.id === optionId)
    if (!selected) return
    const next = applyServingOptionToItem(item, selected)
    next.selectedServingId = selected.id
    next.dbLocked = true
    itemsCopy[index] = next
    setAnalyzedItems(itemsCopy)
    applyRecalculatedNutrition(itemsCopy)
  }

  const autoMatchItemsToDatabase = async (
    items: any[],
    seq: number,
    analysisText?: string | null,
  ) => {
    if (!Array.isArray(items) || items.length === 0) return
    if (analysisMode === 'packaged') return

    try {
      autoDbMatchAbortRef.current?.abort()
    } catch {}
    const controller = new AbortController()
    autoDbMatchAbortRef.current = controller

    const updated = [...items]
    const analysisNormalized = normalizeDbQuery(analysisText || '')
    const analysisHas = (word: string) => analysisNormalized.includes(word)
    const eggDishKeywords = ['benedict', 'omelet', 'scrambled', 'burrito', 'salad', 'deviled']
    for (let idx = 0; idx < items.length; idx += 1) {
      const item = updated[idx]
      if (!item || item.dbLocked) continue
      if (item?.barcode || item?.detectionMethod === 'barcode') continue
      const baseQuery = normalizeDbQuery(item?.name || '')
      const itemLabel = `${String(item?.name || '')} ${String(item?.serving_size || '')}`.toLowerCase()
      const isDiscreteItem =
        (Number.isFinite(Number(item?.piecesPerServing)) && Number(item.piecesPerServing) > 1) ||
        (Number.isFinite(Number(item?.pieces)) && Number(item.pieces) > 1) ||
        isDiscreteUnitLabel(itemLabel)
      const hasEgg = baseQuery.includes('egg')
      const analysisHasEggDish = eggDishKeywords.some((kw) => analysisHas(kw))
      const query =
        hasEgg && !analysisHasEggDish && (analysisHas('egg') || baseQuery.includes('egg'))
          ? 'egg whole'
          : baseQuery
      if (!query || query.length < 2) continue

      const candidateQueries = [query]
      if (hasEgg && !analysisHasEggDish) {
        candidateQueries.unshift('egg whole raw')
        candidateQueries.unshift('egg whole')
      }
      if (query.includes('whole ')) {
        candidateQueries.push(query.replace(/\bwhole\s+/g, '').trim())
      }
      if (query.includes('roasted')) {
        candidateQueries.push(query.replace(/\broasted\b/g, 'roast').trim())
      }
      candidateQueries.push(query.replace(/\b(roasted|roast|whole|cooked)\b/g, '').trim())
      const uniqueQueries = Array.from(new Set(candidateQueries.filter((q) => q.length >= 3)))

      let results: any[] = []
      for (const q of uniqueQueries) {
        try {
          const params = new URLSearchParams({
            source: 'auto',
            q,
            kind: 'single',
            limit: '10',
          })
          const res = await fetch(`/api/food-data?${params.toString()}`, { signal: controller.signal })
          if (!res.ok) continue
          const data = await res.json()
          const items = Array.isArray(data.items) ? data.items : []
          if (items.length > 0) {
            results = items
            break
          }
        } catch (err: any) {
          if (err?.name === 'AbortError') return
        }
      }

      if (!results.length) continue
      if (hasEgg && !analysisHasEggDish) {
        const avoidEggTerms: string[] = []
        if (!analysisHas('dried') && !analysisHas('powder')) {
          avoidEggTerms.push('dried', 'powder', 'powdered')
        }
        if (!analysisHas('pickled')) avoidEggTerms.push('pickled')
        if (!analysisHas('white') && !analysisHas('whites')) avoidEggTerms.push('white', 'whites')
        if (!analysisHas('yolk') && !analysisHas('yolks')) avoidEggTerms.push('yolk', 'yolks')
        if (!analysisHas('liquid')) avoidEggTerms.push('liquid')
        const filtered = results.filter((r: any) => {
          const name = normalizeDbQuery(r?.name || '')
          if (!name.includes('egg')) return false
          if (eggDishKeywords.some((kw) => name.includes(kw))) return false
          if (avoidEggTerms.some((kw) => name.includes(kw))) return false
          return true
        })
        if (filtered.length > 0) {
          results = filtered
        }
      }
      const ranked = [...results].sort((a, b) => scoreDbMatch(query, b?.name || '') - scoreDbMatch(query, a?.name || ''))
      const best = ranked[0]
      if (!best) continue

      const nextItem = { ...item }
      const currentWeight = getBaseWeightPerServing(nextItem)
      const candidateServingInfo = parseServingSizeInfo({ serving_size: best.serving_size || '' })
      const candidateGrams = candidateServingInfo.gramsPerServing

      if (best.name) nextItem.name = best.name
      if (best.brand) nextItem.brand = best.brand
      if (best.serving_size) nextItem.serving_size = best.serving_size
      if (best.calories != null) nextItem.calories = best.calories
      if (best.protein_g != null) nextItem.protein_g = best.protein_g
      if (best.carbs_g != null) nextItem.carbs_g = best.carbs_g
      if (best.fat_g != null) nextItem.fat_g = best.fat_g
      if (best.fiber_g != null) nextItem.fiber_g = best.fiber_g
      if (best.sugar_g != null) nextItem.sugar_g = best.sugar_g
      nextItem.dbSource = best.source
      nextItem.dbId = best.id

      if (candidateGrams && candidateGrams > 0) {
        nextItem.customGramsPerServing = candidateGrams
        nextItem.weightUnit = 'g'
        if (!isDiscreteItem && currentWeight && currentWeight > 0) {
          const edibleFactor = getEdibleYieldFactor(query)
          const effectiveWeight = edibleFactor > 0 ? currentWeight * edibleFactor : currentWeight
          const servings = Math.max(effectiveWeight / candidateGrams, 0.01)
          nextItem.servings = Math.round(servings * 100) / 100
        }
      }
      if (isDiscreteItem) {
        nextItem.servings = 1
      }

      let options: any[] = []
      try {
        const optParams = new URLSearchParams({
          source: best.source,
          id: best.id,
        })
        const optRes = await fetch(`/api/food-data/servings?${optParams.toString()}`, { signal: controller.signal })
        if (optRes.ok) {
          const optData = await optRes.json()
          options = Array.isArray(optData.options) ? optData.options : []
        }
      } catch (err: any) {
        if (err?.name === 'AbortError') return
      }

      if (options.length > 0) {
        const useEggSizes = hasEgg && !analysisHasEggDish
        const eggOptions = useEggSizes ? buildEggSizeOptions(nextItem) : []
        const finalOptions = eggOptions.length > 0 ? eggOptions : options
        nextItem.servingOptions = finalOptions
        const isDiscreteItem =
          (Number.isFinite(Number(nextItem?.piecesPerServing)) && Number(nextItem.piecesPerServing) > 1) ||
          (Number.isFinite(Number(nextItem?.pieces)) && Number(nextItem.pieces) > 1) ||
          isDiscreteUnitLabel(
            `${String(nextItem?.name || '')} ${String(nextItem?.serving_size || '')}`.toLowerCase(),
          )
        const discreteOptions = isDiscreteItem
          ? finalOptions.filter((opt: any) => {
              const meta = parseServingUnitMetadata(String(opt?.label || opt?.serving_size || ''))
              return meta && isDiscreteUnitLabel(meta.unitLabel)
            })
          : []
        const singleDiscrete =
          discreteOptions.length > 0
            ? discreteOptions.find((opt: any) => {
                const meta = parseServingUnitMetadata(String(opt?.label || opt?.serving_size || ''))
                return meta && Number(meta.quantity || 0) <= 1
              })
            : null
        const queryHasWhole = query.includes('whole')
        const wholeMatch = queryHasWhole
          ? finalOptions.find((opt: any) => /\bwhole\b/i.test(opt?.label || opt?.serving_size || ''))
          : null
        const match = finalOptions.find((opt: any) =>
          (opt.serving_size || opt.label || '').toLowerCase().includes(String(best.serving_size || '').toLowerCase()),
        )
        let selected =
          singleDiscrete ||
          (useEggSizes ? finalOptions.find((opt: any) => Number(opt?.grams) === 50) : null) ||
          (discreteOptions.length > 0 ? discreteOptions[0] : null) ||
          wholeMatch ||
          match ||
          null
        if (!selected && currentWeight && Number.isFinite(Number(currentWeight))) {
          const withGrams = finalOptions.filter((opt: any) => Number.isFinite(Number(opt?.grams)) && Number(opt?.grams) > 0)
          if (withGrams.length > 0) {
            withGrams.sort((a: any, b: any) => Math.abs(Number(a.grams) - currentWeight) - Math.abs(Number(b.grams) - currentWeight))
            selected = withGrams[0]
          }
        }
        if (!selected) selected = options[0]
        nextItem.selectedServingId = selected?.id || null
        if (selected) {
          const merged = applyServingOptionToItem(nextItem, selected)
          updated[idx] = merged
        } else {
          updated[idx] = nextItem
        }
      } else {
        updated[idx] = nextItem
      }
    }

    if (analysisSequenceRef.current !== seq) return
    setAnalyzedItems(updated)
    applyRecalculatedNutrition(updated)
  }

  const buildDeleteKey = (entry: any) => {
    if (!entry) return ''
    if ((entry as any)?.dbId) return `db:${(entry as any).dbId}`
    if (entry?.id !== null && entry?.id !== undefined) return `id:${entry.id}`
    const cat = normalizeCategory(entry?.meal || entry?.category || entry?.mealType)
    const desc = (entry?.description || '').toString().toLowerCase().trim()
    const loc =
      typeof entry?.localDate === 'string' && entry.localDate.length >= 8
        ? entry.localDate
        : dateKeyForEntry(entry) || ''
    const ts =
      typeof entry?.createdAt === 'string'
        ? entry.createdAt
        : entry?.createdAt instanceof Date
        ? entry.createdAt.toISOString()
        : ''
    return `desc:${cat}|${desc}|${loc}|${ts}`
  }

  const normalizedDescription = (desc: string | null | undefined) => {
    const raw = (desc || '').toString()
    // UI shows only the first line; treat hidden meta lines as non-semantic.
    const firstLine = raw.split('\n')[0] || raw
    let cleaned = firstLine
    try {
      cleaned = cleaned.normalize('NFKC')
    } catch {}
    return cleaned
      // Normalize common unicode variants so delete/de-dupe matching stays stable.
      .replace(/[\u00A0\u2007\u202F]/g, ' ') // NBSP-ish spaces
      .replace(/[×✕✖]/g, 'x')
      .replace(/[’‘]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/[‐‑‒–—]/g, '-')
      .replace(/\(favorite-copy-\d+\)/gi, '')
      .replace(/\(duplicate-[^)]+\)/gi, '')
      .replace(/\(copy-category-to-today-[^)]+\)/gi, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()
  }

  // Stable delete keys so resurrected entries (or entries missing a category) can still be suppressed.
  // We always include a category-specific key, and also an "uncategorized" variant because server rows
  // can intermittently miss the meal/category field.
  type StableDeleteKeyMode = 'time' | 'legacy' | 'both'
  const stableDeleteKeysForEntry = (entry: any, mode: StableDeleteKeyMode = 'time') => {
    if (!entry) return [] as string[]
    const cat = normalizeCategory(entry?.meal || entry?.category || entry?.mealType)
    const descCanonical = normalizedDescription(entry?.description || entry?.name || '')
    const date = dateKeyForEntry(entry)
    const timeKey = entryTimestampKey(entry)
    const includeTime = mode !== 'legacy'
    const includeLegacy = mode === 'both' || mode === 'legacy' || (!timeKey && mode === 'time')
    const clientId = getEntryClientId(entry)

    // Back-compat: older tombstones may have used the multiplication sign `×` instead of `x`.
    // Include both variants for numeric multipliers (e.g., "0.55× avocado").
    const descVariants = new Set<string>([descCanonical])
    const multiplierVariant = descCanonical.replace(/(\d(?:[\d.,]*))x(?=\s)/g, '$1×')
    if (multiplierVariant && multiplierVariant !== descCanonical) descVariants.add(multiplierVariant)

    const keys: string[] = []
    if (clientId) {
      const baseClient = `stable:client:${clientId}`
      if (includeTime && timeKey) {
        keys.push(`${baseClient}|${timeKey}`)
      }
      keys.push(baseClient)
    }
    if (!descCanonical || !date) return keys
    for (const desc of Array.from(descVariants)) {
      const base = `stable:${cat}|${desc}|${date}`
      const baseUncategorized = `stable:uncategorized|${desc}|${date}`
      if (includeTime && timeKey) {
        keys.push(`${base}|${timeKey}`)
        if (cat !== 'uncategorized') keys.push(`${baseUncategorized}|${timeKey}`)
      }
      if (includeLegacy) {
        keys.push(base)
        if (cat !== 'uncategorized') keys.push(baseUncategorized)
      }
    }
    return keys
  }

  // Stable delete key so resurrected entries with new db ids can still be suppressed.
  const stableDeleteKeyForEntry = (entry: any) => {
    return stableDeleteKeysForEntry(entry)[0] || ''
  }

  const tombstonesHydratedRef = useRef(false)
  const hydrateDeletedTombstones = () => {
    if (tombstonesHydratedRef.current) return
    if (typeof window === 'undefined') return
    tombstonesHydratedRef.current = true
    try {
      const raw = localStorage.getItem('foodDiary:deletedEntries')
      const parsed = raw ? JSON.parse(raw) : []
      const cutoff = Date.now() - 45 * 24 * 60 * 60 * 1000 // 45 days
      const fresh = Array.isArray(parsed)
        ? parsed.filter((t) => t && typeof t.key === 'string' && Number(t.ts) > cutoff)
        : []
      fresh.forEach((t) => deletedEntryKeysRef.current.add(String(t.key)))
      localStorage.setItem('foodDiary:deletedEntries', JSON.stringify(fresh))
    } catch (err) {
      console.warn('Could not hydrate deleted entry tombstones', err)
    }
  }
  hydrateDeletedTombstones()

  const persistDeletedKeys = (keys: string[]) => {
    const filtered = keys.filter(Boolean)
    if (filtered.length === 0) return
    filtered.forEach((k) => deletedEntryKeysRef.current.add(k))
    if (typeof window === 'undefined') return
    try {
      const raw = localStorage.getItem('foodDiary:deletedEntries')
      const parsed = raw ? JSON.parse(raw) : []
      const cutoff = Date.now() - 45 * 24 * 60 * 60 * 1000
      const current = Array.isArray(parsed)
        ? parsed.filter((t) => t && typeof t.key === 'string' && Number(t.ts) > cutoff)
        : []
      const merged = [...current, ...filtered.map((k) => ({ key: k, ts: Date.now() }))]
      const dedupedMap = new Map<string, { key: string; ts: number }>()
      merged.forEach((item) => {
        dedupedMap.set(item.key, item)
      })
      const deduped = Array.from(dedupedMap.values())
      // keep the most recent 200 tombstones to avoid unbounded growth
      const trimmed = deduped.slice(-200)
      localStorage.setItem('foodDiary:deletedEntries', JSON.stringify(trimmed))
    } catch (err) {
      console.warn('Could not persist deleted entry tombstones', err)
    }
  }

  const removeDeletedTombstonesForEntries = (entries: any[]) => {
    if (!Array.isArray(entries) || entries.length === 0) return
    const keysToRemove = new Set<string>()
    entries.forEach((entry) => {
      stableDeleteKeysForEntry(entry, 'both').forEach((k) => {
        if (k) keysToRemove.add(k)
      })
      const dbKey = (entry as any)?.dbId ? `db:${(entry as any).dbId}` : ''
      if (dbKey) keysToRemove.add(dbKey)
      const idKey =
        entry?.id !== null && entry?.id !== undefined ? `id:${entry.id}` : ''
      if (idKey) keysToRemove.add(idKey)
    })
    if (keysToRemove.size === 0) return
    keysToRemove.forEach((k) => deletedEntryKeysRef.current.delete(k))
    if (typeof window === 'undefined') return
    try {
      const raw = localStorage.getItem('foodDiary:deletedEntries')
      const parsed = raw ? JSON.parse(raw) : []
      const filtered = Array.isArray(parsed)
        ? parsed.filter((t) => t && !keysToRemove.has(String(t.key)))
        : []
      localStorage.setItem('foodDiary:deletedEntries', JSON.stringify(filtered))
    } catch {}
  }

  const isEntryDeleted = (entry: any) => {
    if (!entry) return false
    if ((entry as any)?.__library) return false
    const candidates = [
      buildDeleteKey(entry),
      ...stableDeleteKeysForEntry(entry, 'both'),
    ].filter(Boolean)
    for (const key of candidates) {
      if (deletedEntryKeysRef.current.has(key)) return true
    }
    return false
  }

  // Normalized calendar date for de-dupe; falls back to timestamp so copies with missing localDate
  // collapse instead of rendering twice.
  const dateKeyForEntry = (entry: any) => {
    if (!entry) return ''
    if (typeof entry?.localDate === 'string' && entry.localDate.length >= 8) return entry.localDate
    const ts =
      typeof entry?.id === 'number'
        ? entry.id
        : entry?.createdAt
        ? new Date(entry.createdAt).getTime()
        : Number(entry?.time) || NaN
    if (!Number.isFinite(ts)) return ''
    const d = new Date(ts)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }

  const entryTimestampKey = (entry: any) => {
    if (!entry) return ''
    const ts = extractEntryTimestampMs(entry)
    if (Number.isFinite(ts)) return String(Math.round(ts))
    const raw = entry?.time
    if (raw === null || raw === undefined) return ''
    return raw.toString().trim().toLowerCase()
  }

  const buildPendingSaveKey = (entry: any, fallbackDate?: string) => {
    if (!entry) return ''
    const clientId = getEntryClientId(entry)
    if (clientId) return `client:${clientId}`
    const date = dateKeyForEntry(entry) || fallbackDate || ''
    const cat = normalizeCategory(entry?.meal || entry?.category || entry?.mealType)
    const desc = normalizedDescription(entry?.description || entry?.name || '')
    const timeKey = entryTimestampKey(entry)
    if (!date || !desc || !timeKey) return ''
    return `fallback:${date}|${cat}|${desc}|${timeKey}`
  }

  const markEntryPendingSave = (entry: any, pendingKey?: string) => {
    if (!entry || typeof entry !== 'object') return entry
    const key = pendingKey || buildPendingSaveKey(entry, entry?.localDate || selectedDate)
    if (!key) return entry
    return {
      ...(entry as any),
      __pendingSave: true,
      __pendingSince: (entry as any).__pendingSince || Date.now(),
      __pendingKey: key,
    }
  }

  const clearEntryPendingSave = (entry: any, dbId?: string | number | null) => {
    if (!entry || typeof entry !== 'object') return entry
    const next: any = { ...(entry as any) }
    if (dbId && !next.dbId) next.dbId = dbId
    delete next.__pendingSave
    delete next.__pendingSince
    delete next.__pendingKey
    return next
  }

  const isEntryPendingSave = (entry: any, fallbackDate?: string) => {
    if (!entry) return false
    if ((entry as any)?.__pendingSave) return true
    const pendingKey =
      (entry as any)?.__pendingKey ||
      buildPendingSaveKey(entry, entry?.localDate || fallbackDate || selectedDate)
    if (!pendingKey) return false
    return pendingFoodLogSaveRef.current.has(pendingKey)
  }

  const isFreshPendingEntry = (entry: any, fallbackDate?: string) => {
    if (!isEntryPendingSave(entry, fallbackDate)) return false
    const sinceRaw = (entry as any)?.__pendingSince
    const since =
      typeof sinceRaw === 'number' && Number.isFinite(sinceRaw) && sinceRaw > 0 ? sinceRaw : null
    if (since !== null) {
      return Date.now() - since <= PENDING_SAVE_STALE_MS
    }
    const pendingKey =
      (entry as any)?.__pendingKey ||
      buildPendingSaveKey(entry, entry?.localDate || fallbackDate || selectedDate)
    const meta = pendingKey ? pendingFoodLogSaveRef.current.get(pendingKey) : null
    if (meta && Number.isFinite(meta.lastAttemptAt) && meta.lastAttemptAt > 0) {
      return Date.now() - meta.lastAttemptAt <= PENDING_SAVE_STALE_MS
    }
    return true
  }

  const isFreshUnsyncedEntry = (entry: any) => {
    if (!entry || (entry as any)?.dbId) return false
    const ts = extractEntryTimestampMs(entry)
    if (!Number.isFinite(ts)) return false
    return Date.now() - ts <= PENDING_SAVE_STALE_MS
  }

  const updateEntriesForPendingKey = (pendingKey: string, updater: (entry: any) => any) => {
    if (!pendingKey) return
    const apply = (list: any[] | null | undefined) => {
      if (!Array.isArray(list)) return { list, changed: false }
      let changed = false
      const next = list.map((entry) => {
        const entryKey =
          (entry as any)?.__pendingKey ||
          buildPendingSaveKey(entry, entry?.localDate || selectedDate)
        if (entryKey !== pendingKey) return entry
        const updated = updater(entry)
        if (updated !== entry) changed = true
        return updated
      })
      return { list: changed ? next : list, changed }
    }

    setTodaysFoods((prev) => {
      const { list } = apply(prev as any[])
      return list as any[]
    })
    setHistoryFoods((prev) => {
      if (!Array.isArray(prev)) return prev
      const { list } = apply(prev)
      return list as any[]
    })
    const userSnapshot = Array.isArray((userData as any)?.todaysFoods)
      ? ((userData as any).todaysFoods as any[])
      : null
    if (userSnapshot) {
      const { list, changed } = apply(userSnapshot)
      if (changed) {
        updateUserData({ todaysFoods: list as any[] })
      }
    }
  }

  const enqueuePendingFoodLogSave = (entry: any, targetDate: string) => {
    if (!entry) return
    const key = buildPendingSaveKey(entry, targetDate)
    if (!key) return
    if (!pendingFoodLogSaveRef.current.has(key)) {
      pendingFoodLogSaveRef.current.set(key, {
        key,
        targetDate: targetDate || selectedDate,
        attempts: 0,
        nextAttemptAt: Date.now() + 800,
        lastAttemptAt: 0,
      })
    }
    schedulePendingFoodLogFlush()
  }

  const schedulePendingFoodLogFlush = (overrideDelay?: number) => {
    if (typeof window === 'undefined') return
    if (pendingFoodLogTimerRef.current) {
      window.clearTimeout(pendingFoodLogTimerRef.current)
      pendingFoodLogTimerRef.current = null
    }
    const entries = Array.from(pendingFoodLogSaveRef.current.values())
    if (entries.length === 0) return
    const now = Date.now()
    let nextAt = Infinity
    entries.forEach((item) => {
      if (item.nextAttemptAt < nextAt) nextAt = item.nextAttemptAt
    })
    const delay =
      typeof overrideDelay === 'number'
        ? Math.max(300, overrideDelay)
        : Math.max(300, nextAt - now)
    pendingFoodLogTimerRef.current = window.setTimeout(() => {
      pendingFoodLogTimerRef.current = null
      flushPendingFoodLogSaves()
    }, delay)
  }

  const flushPendingFoodLogSaves = async () => {
    if (pendingFoodLogFlushRef.current) return
    pendingFoodLogFlushRef.current = true
    try {
      const now = Date.now()
      const entries = Array.from(pendingFoodLogSaveRef.current.values())
      for (const item of entries) {
        if (now < item.nextAttemptAt) continue
        const pendingKey = item.key
        const combined = [
          ...(Array.isArray(latestTodaysFoodsRef.current) ? latestTodaysFoodsRef.current : []),
          ...(Array.isArray(latestHistoryFoodsRef.current) ? (latestHistoryFoodsRef.current as any[]) : []),
        ]
        const entry = combined.find((e) => {
          const key =
            (e as any)?.__pendingKey ||
            buildPendingSaveKey(e, (e as any)?.localDate || item.targetDate)
          return key === pendingKey
        })
        if (!entry || isEntryDeleted(entry)) {
          pendingFoodLogSaveRef.current.delete(pendingKey)
          continue
        }
        const entryDbId = (entry as any)?.dbId
        if (entryDbId) {
          pendingFoodLogSaveRef.current.delete(pendingKey)
          updateEntriesForPendingKey(pendingKey, (e) => clearEntryPendingSave(e, entryDbId))
          continue
        }

        const targetDate =
          typeof entry?.localDate === 'string' && entry.localDate.length >= 8
            ? entry.localDate
            : item.targetDate || selectedDate
        const payload = {
          description: (entry?.description || '').toString(),
          nutrition: buildPayloadNutrition(entry),
          imageUrl: entry?.photo || null,
          items: Array.isArray(entry?.items) && entry.items.length > 0 ? entry.items : null,
          meal: normalizeCategory(entry?.meal || entry?.category || entry?.mealType),
          category: normalizeCategory(entry?.category || entry?.meal || entry?.mealType),
          localDate: targetDate,
          createdAt: alignTimestampToLocalDate(
            entry?.createdAt || entry?.id || new Date().toISOString(),
            targetDate,
          ),
          allowDuplicate: true,
        }

        item.attempts += 1
        item.lastAttemptAt = now
        const backoff = Math.min(
          PENDING_SAVE_RETRY_MAX_MS,
          PENDING_SAVE_RETRY_BASE_MS * Math.pow(2, Math.min(item.attempts, 4)),
        )
        item.nextAttemptAt = now + backoff

        try {
          const res = await fetch('/api/food-log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
          if (res.ok) {
            const json = await res.json().catch(() => ({} as any))
            const createdId = typeof json?.id === 'string' && json.id ? json.id : null
            if (createdId && entry?.id && Number.isFinite(Number(entry.id))) {
              pendingServerIdRef.current.set(String(createdId), {
                localId: Number(entry.id),
                savedAt: Date.now(),
              })
            }
            pendingFoodLogSaveRef.current.delete(pendingKey)
            updateEntriesForPendingKey(pendingKey, (e) => clearEntryPendingSave(e, createdId || undefined))
          }
        } catch (err) {
          console.warn('Pending FoodLog save failed', err)
        }
      }
    } finally {
      pendingFoodLogFlushRef.current = false
      if (pendingFoodLogSaveRef.current.size > 0) {
        schedulePendingFoodLogFlush()
      }
    }
  }

  // Prevent duplicate rows from ever rendering (e.g., double writes or cached copies).
  const dedupeEntries = (list: any[], options?: { fallbackDate?: string }) => {
    if (!Array.isArray(list)) return []
    // Prefer entries that have a real meal/category over uncategorized copies.
    const hasRealCategory = (entry: any) => {
      const cat = normalizeCategory(entry?.meal || entry?.category || entry?.mealType)
      return cat !== 'uncategorized'
    }
    const descKey = (desc: any) => normalizedDescription(desc)
    const timeBucketKey = (entry: any) => entryTimestampKey(entry)
    const fallbackDate = options?.fallbackDate || ''
    const buildFallbackKey = (entry: any) => {
      const cat = normalizeCategory(entry?.meal || entry?.category || entry?.mealType)
      return [
        dateKeyForEntry(entry) || fallbackDate,
        cat,
        descKey(entry?.description),
        timeBucketKey(entry),
      ].join('|')
    }
    const buildClientKey = (entry: any) => {
      const clientId = getEntryClientId(entry)
      return clientId ? `client:${clientId}` : ''
    }
    const buildDbKey = (entry: any) => {
      const dbId = (entry as any)?.dbId
      return dbId ? `db:${dbId}` : ''
    }
    const mergePreferredEntry = (primary: any, secondary: any) => {
      if (!primary || !secondary) return primary
      let next = primary
      const primaryCat = normalizeCategory(primary?.meal || primary?.category || primary?.mealType)
      const secondaryCat = normalizeCategory(secondary?.meal || secondary?.category || secondary?.mealType)
      if (primaryCat === 'uncategorized' && secondaryCat && secondaryCat !== 'uncategorized') {
        next = { ...next, meal: secondaryCat, category: secondaryCat, persistedCategory: secondaryCat }
      }
      const secondaryClientId = getEntryClientId(secondary)
      if (secondaryClientId && !getEntryClientId(next)) {
        next = ensureEntryClientId(next, secondaryClientId)
      }
      return next
    }
    const pickPreferred = (existing: any, entry: any) => {
      if (!existing) return entry
      if (!entry) return existing
      const existingDb = Boolean(existing?.dbId)
      const entryDb = Boolean(entry?.dbId)
      if (existingDb !== entryDb) return entryDb ? entry : existing
      const existingHasCat = hasRealCategory(existing)
      const entryHasCat = hasRealCategory(entry)
      if (existingHasCat !== entryHasCat) return entryHasCat ? entry : existing
      const existingClientId = Boolean(getEntryClientId(existing))
      const entryClientId = Boolean(getEntryClientId(entry))
      if (existingClientId !== entryClientId) return entryClientId ? entry : existing
      const existingHasItems = Array.isArray(existing?.items) && existing.items.length > 0
      const entryHasItems = Array.isArray(entry?.items) && entry.items.length > 0
      if (existingHasItems !== entryHasItems) return entryHasItems ? entry : existing
      const existingHasTotals = Boolean(existing?.nutrition || existing?.total)
      const entryHasTotals = Boolean(entry?.nutrition || entry?.total)
      if (existingHasTotals !== entryHasTotals) return entryHasTotals ? entry : existing
      const existingTs = extractEntryTimestampMs(existing)
      const entryTs = extractEntryTimestampMs(entry)
      if (Number.isFinite(existingTs) && Number.isFinite(entryTs) && entryTs !== existingTs) {
        return entryTs > existingTs ? entry : existing
      }
      return entry
    }
    const keyAliases = new Map<string, string>()
    const preferred = new Map<string, any>()
    const registerAlias = (canonical: string, key: string) => {
      if (key) keyAliases.set(key, canonical)
    }
    for (const entry of list) {
      if (isEntryDeleted(entry)) continue
      const fallbackKey = buildFallbackKey(entry)
      const clientKey = buildClientKey(entry)
      const dbKey = buildDbKey(entry)
      let canonical = ''
      if (clientKey) {
        canonical = clientKey
      } else if (dbKey) {
        const fallbackAlias = fallbackKey ? keyAliases.get(fallbackKey) : ''
        const aliasEntry = fallbackAlias ? preferred.get(fallbackAlias) : null
        if (fallbackAlias && aliasEntry && getEntryClientId(aliasEntry)) {
          // Merge DB rows into the optimistic entry when the server row lacks a clientId.
          canonical = fallbackAlias
        } else {
          canonical = dbKey
        }
      } else if (fallbackKey) {
        canonical = keyAliases.get(fallbackKey) || fallbackKey
      }
      if (!canonical) continue
      const existing = preferred.get(canonical)
      const chosen = pickPreferred(existing, entry)
      const merged = mergePreferredEntry(chosen, existing && chosen === existing ? entry : existing)
      preferred.set(canonical, merged)
      registerAlias(canonical, clientKey)
      registerAlias(canonical, dbKey)
      registerAlias(canonical, fallbackKey)
    }
    return Array.from(preferred.values())
  }

  const mergeSnapshotForDate = (snapshotList: any[], entriesForDate: any[], targetDate: string) => {
    const base = Array.isArray(snapshotList) ? snapshotList : []
    const others = base.filter((entry) => !entryMatchesDate(entry, targetDate))
    return dedupeEntries([...entriesForDate, ...others], { fallbackDate: targetDate })
  }

  const updateTodaysFoodsForDate = (entriesForDate: any[], targetDate: string) => {
    setTodaysFoods((prev) => mergeSnapshotForDate(prev as any[], entriesForDate, targetDate))
  }

  const updateUserSnapshotForDate = (entriesForDate: any[], targetDate: string) => {
    const currentSnapshot = Array.isArray((userData as any)?.todaysFoods)
      ? ((userData as any).todaysFoods as any[])
      : []
    const mergedSnapshot = mergeSnapshotForDate(currentSnapshot, entriesForDate, targetDate)
    updateUserData({ todaysFoods: mergedSnapshot })
  }

  const markDiaryHydrated = (date: string) => {
    if (!date) return
    const current = diaryHydrationRef.current[date] || { hydrated: false, verified: false }
    if (current.hydrated) return
    diaryHydrationRef.current[date] = { ...current, hydrated: true }
  }

  const markDiaryVerified = (date: string) => {
    if (!date) return
    const current = diaryHydrationRef.current[date] || { hydrated: false, verified: false }
    if (current.verified) return
    diaryHydrationRef.current[date] = { ...current, verified: true }
  }

  const isDiaryHydrated = (date: string) => Boolean(diaryHydrationRef.current[date]?.hydrated)
  const isDiaryVerified = (date: string) => Boolean(diaryHydrationRef.current[date]?.verified)

  const getEntryTotals = (entry: any) => {
    try {
      if (Array.isArray(entry?.items) && entry.items.length > 0) {
        const recalculated = recalculateNutritionFromItems(entry.items)
        if (recalculated) return recalculated
      }
      return (
        sanitizeNutritionTotals((entry as any).total) ||
        sanitizeNutritionTotals(entry?.nutrition) || {
          calories: 0,
          protein: 0,
          carbs: 0,
          fat: 0,
          fiber: 0,
          sugar: 0,
        }
      )
    } catch {
      return {
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
        fiber: 0,
        sugar: 0,
      }
    }
  }

  const buildDuplicateItemSignature = (items: any[]) => {
    if (!Array.isArray(items) || items.length === 0) return ''
    const parts = items
      .map((item) => {
        const name = normalizedDescription(item?.name || item?.label || '')
        if (!name) return ''
        const cals = Number(item?.calories ?? item?.calories_g ?? item?.caloriesPerServing ?? item?.calories_per_serving ?? 0)
        const protein = Number(item?.protein_g ?? item?.protein ?? 0)
        const carbs = Number(item?.carbs_g ?? item?.carbs ?? 0)
        const fat = Number(item?.fat_g ?? item?.fat ?? 0)
        const servings = Number.isFinite(Number(item?.servings)) ? Number(item.servings) : null
        return [
          name,
          Math.round(cals || 0),
          Math.round((protein || 0) * 10) / 10,
          Math.round((carbs || 0) * 10) / 10,
          Math.round((fat || 0) * 10) / 10,
          servings === null ? '' : Math.round(servings * 100) / 100,
        ].join(':')
      })
      .filter(Boolean)
    if (parts.length === 0) return ''
    parts.sort()
    return parts.join('|')
  }

  const buildDuplicateMacroSignature = (totals: any) => {
    const calories = Number(totals?.calories || 0)
    const protein = Number(totals?.protein || 0)
    const carbs = Number(totals?.carbs || 0)
    const fat = Number(totals?.fat || 0)
    return [
      Math.round(calories || 0),
      Math.round((protein || 0) * 10) / 10,
      Math.round((carbs || 0) * 10) / 10,
      Math.round((fat || 0) * 10) / 10,
    ].join('|')
  }

  const buildDuplicateEntryKey = (entry: any, targetDate: string) => {
    const desc = normalizedDescription(entry?.description || entry?.name || '')
    if (!desc) return ''
    const cat = normalizeCategory(entry?.meal || entry?.category || entry?.mealType)
    const itemsSig = buildDuplicateItemSignature(entry?.items)
    const totals = getEntryTotals(entry)
    const macroSig = buildDuplicateMacroSignature(totals)
    const base = itemsSig || macroSig
    if (!base) return ''
    const dateKey = dateKeyForEntry(entry) || targetDate || ''
    return [dateKey, cat, desc, base].join('|')
  }

  const collapseNearDuplicates = (entries: any[], targetDate: string) => {
    const groups = new Map<string, any[]>()
    entries.forEach((entry) => {
      const key = buildDuplicateEntryKey(entry, targetDate)
      if (!key) return
      const list = groups.get(key) || []
      list.push(entry)
      groups.set(key, list)
    })
    const duplicates: any[] = []
    groups.forEach((list) => {
      if (!Array.isArray(list) || list.length < 2) return
      const sorted = list
        .slice()
        .sort((a, b) => (extractEntryTimestampMs(b) || 0) - (extractEntryTimestampMs(a) || 0))
      let keeper = sorted[0]
      for (let i = 1; i < sorted.length; i += 1) {
        const entry = sorted[i]
        const keeperTs = extractEntryTimestampMs(keeper)
        const entryTs = extractEntryTimestampMs(entry)
        if (!Number.isFinite(keeperTs) || !Number.isFinite(entryTs)) {
          keeper = entry
          continue
        }
        if (entryAllowsDuplicate(entry) || entryAllowsDuplicate(keeper)) {
          keeper = entry
          continue
        }
        if (Math.abs(keeperTs - entryTs) <= DUPLICATE_CLEANUP_WINDOW_MS) {
          duplicates.push(entry)
          continue
        }
        keeper = entry
      }
    })
    if (duplicates.length === 0) return { filtered: entries, duplicates }
    const dropIds = new Set<string>(
      duplicates
        .map((entry) => (entry as any)?.dbId)
        .filter((id) => id !== null && id !== undefined)
        .map((id) => String(id)),
    )
    const filtered = entries.filter((entry) => {
      const dbId = (entry as any)?.dbId
      if (!dbId) return true
      return !dropIds.has(String(dbId))
    })
    return { filtered, duplicates }
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

  const addIngredientFromOfficial = async (item: any) => {
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

    // If the modal was opened from the Today’s Meals (+) dropdown, add this as a new diary entry
    // in that meal category instead of adding to the analysis ingredient cards.
    if (addIngredientContextRef.current?.mode === 'diary') {
      const targetCategory =
        addIngredientContextRef.current?.targetCategory || selectedAddCategory || 'uncategorized'
      const label = `${newItem.name}${newItem.brand ? ` – ${newItem.brand}` : ''}`.trim()
      const totals = sanitizeNutritionTotals({
        calories: newItem.calories ?? null,
        protein: newItem.protein_g ?? null,
        carbs: newItem.carbs_g ?? null,
        fat: newItem.fat_g ?? null,
        fiber: newItem.fiber_g ?? null,
        sugar: newItem.sugar_g ?? null,
      } as any)

      setShowAddIngredientModal(false)
      setOfficialSearchQuery('')
      setOfficialResults([])
      setOfficialError(null)

      // Insert a new entry into the selected meal section
      try {
        await insertMealIntoDiary(
          {
            description: label,
            nutrition: totals,
            total: totals,
            items: [newItem],
            method: 'official',
          },
          targetCategory,
        )
      } catch (err) {
        console.warn('Add ingredient insert failed', err)
        showQuickToast('Could not add that ingredient. Please try again.')
      }
      return
    }

    triggerHaptic(10)
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
    // When building a meal, keep the search modal open so the user can add multiple ingredients.
    const shouldKeepModalOpen = Boolean(manualMealBuildMode)
    if (!shouldKeepModalOpen) {
      setShowAddIngredientModal(false)
      setOfficialSearchQuery('')
      setOfficialResults([])
      setOfficialError(null)
    } else {
      setOfficialError(null)
      showQuickToast(`Added ${newItem.name}`)
    }

    // Scroll to the newly added ingredient card so the user sees it immediately.
    try {
      if (typeof window !== 'undefined') {
        const start = Date.now()
        const tick = () => {
          const cards = document.querySelectorAll('[data-analysis-ingredient-card=\"1\"]')
          const last = cards && cards.length ? (cards[cards.length - 1] as HTMLElement) : null
          if (last) {
            last.scrollIntoView({ behavior: 'smooth', block: 'start' })
            return
          }
          if (Date.now() - start < 1200) window.requestAnimationFrame(tick)
        }
        window.requestAnimationFrame(tick)
      }
    } catch {}
  }

  const finalizeIngredientItem = (input: any) => {
    let next = normalizeDiscreteItem({ ...input })

    const liquidItem = isLikelyLiquidFood(next?.name, next?.serving_size)
    const normalizedServingSize = normalizeServingSizeForLiquid(next?.serving_size, liquidItem)
    if (normalizedServingSize && normalizedServingSize !== next.serving_size) {
      next.serving_size = normalizedServingSize
    }

    const { gramsPerServing, mlPerServing, ozPerServing } = quickParseServingSize(next?.serving_size)
    if (!next.weightUnit) {
      if (mlPerServing && mlPerServing > 0 && liquidItem) next.weightUnit = 'ml'
      else if (ozPerServing && ozPerServing > 0) next.weightUnit = 'oz'
      else next.weightUnit = 'g'
    }

    const hasCustom =
      Number.isFinite((next as any)?.customGramsPerServing) ||
      Number.isFinite((next as any)?.customMlPerServing)
    if (!hasCustom && !gramsPerServing && !mlPerServing) {
      const estimate = estimateGramsPerServing(next)
      if (estimate && estimate > 0) {
        next.customGramsPerServing = estimate
      }
    }

    const baseWeight = getBaseWeightPerServing(next)
    if (baseWeight && baseWeight > 0) {
      const unit = next?.weightUnit === 'ml' ? 'ml' : next?.weightUnit === 'oz' ? 'oz' : 'g'
      const computed = baseWeight * (next.servings || 1)
      const precision = unit === 'oz' ? 100 : 1000
      next.weightAmount = Math.round(computed * precision) / precision
    }

    return next
  }

  const buildOfficialItem = (item: any, servingsOverride?: number | null) => {
    const base = {
      name: item.name || 'Unknown food',
      brand: item.brand ?? null,
      serving_size: item.serving_size || '',
      servings:
        Number.isFinite(Number(servingsOverride)) && Number(servingsOverride) > 0
          ? Number(servingsOverride)
          : 1,
      calories: item.calories ?? null,
      protein_g: item.protein_g ?? null,
      carbs_g: item.carbs_g ?? null,
      fat_g: item.fat_g ?? null,
      fiber_g: item.fiber_g ?? null,
      sugar_g: item.sugar_g ?? null,
    }

    return finalizeIngredientItem(base)
  }

  const getItemServings = (item: any) =>
    Number.isFinite(Number(item?.servings)) && Number(item?.servings) > 0 ? Number(item.servings) : 1

  const buildItemFromFavoriteSource = (source: any, servingsOverride?: number | null) => {
    if (!source) return null
    const rawItems = (() => {
      if (Array.isArray(source?.items)) return source.items
      if (typeof source?.items === 'string') {
        try {
          const parsed = JSON.parse(String(source.items))
          return Array.isArray(parsed) ? parsed : null
        } catch {
          return null
        }
      }
      return null
    })()

    const servings = Number.isFinite(Number(servingsOverride)) && Number(servingsOverride) > 0 ? Number(servingsOverride) : 1

    if (Array.isArray(rawItems) && rawItems.length === 1) {
      const cloned = JSON.parse(JSON.stringify(rawItems[0]))
      const base = { ...cloned, servings }
      return finalizeIngredientItem(base)
    }

    const totals = getEntryTotals(source)
    const label =
      favoriteDisplayLabel(source) ||
      applyFoodNameOverride(source?.label || source?.description || source?.favorite?.label || 'Favorite', source) ||
      'Favorite'
    const base = {
      name: label,
      brand: null,
      serving_size: '1 serving',
      servings,
      calories: totals?.calories ?? null,
      protein_g: totals?.protein ?? null,
      carbs_g: totals?.carbs ?? null,
      fat_g: totals?.fat ?? null,
      fiber_g: totals?.fiber ?? null,
      sugar_g: totals?.sugar ?? null,
    }
    return finalizeIngredientItem(base)
  }

  const buildItemFromBarcodeFood = (food: any, code?: string, servingsOverride?: number | null) => {
    if (!food) return null
    const base = buildBarcodeIngredientItem(food, code)
    const servings = Number.isFinite(Number(servingsOverride)) && Number(servingsOverride) > 0 ? Number(servingsOverride) : 1
    return finalizeIngredientItem({ ...base, servings })
  }

  const replaceIngredientAtIndex = (index: number, nextItem: any, toastLabel?: string) => {
    if (!nextItem || index === null || index === undefined) return
    const itemsCopy = [...analyzedItems]
    if (!itemsCopy[index]) return
    itemsCopy[index] = nextItem
    setAnalyzedItems(itemsCopy)
    applyRecalculatedNutrition(itemsCopy)
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
        setTodaysFoods((prev) => prev.map((food) => (food.id === editingEntry.id ? updatedEntry : food)))
      } catch {}
    }
    if (toastLabel) showQuickToast(toastLabel)
  }

  const replaceIngredientFromFavoriteSource = (source: any, index: number) => {
    if (!source || index === null || index === undefined) return
    const currentServings = getItemServings(analyzedItems?.[index])
    const nextItem = buildItemFromFavoriteSource(source, currentServings)
    if (!nextItem) {
      showQuickToast('Could not use that favorite')
      return
    }
    nextItem.dbLocked = true
    replaceIngredientAtIndex(index, nextItem, `Updated to ${nextItem.name}`)
  }

  const replaceIngredientFromBarcodeFood = (food: any, code: string, index: number) => {
    if (!food || index === null || index === undefined) return
    const currentServings = getItemServings(analyzedItems?.[index])
    const nextItem = buildItemFromBarcodeFood(food, code, currentServings)
    if (!nextItem) {
      showQuickToast('Could not use that barcode')
      return
    }
    nextItem.dbLocked = true
    replaceIngredientAtIndex(index, nextItem, `Updated to ${nextItem.name}`)
  }

  const addFavoriteIngredientToAnalysis = (source: any) => {
    if (!source) return
    const nextItem = buildItemFromFavoriteSource(source, 1)
    if (!nextItem) {
      showQuickToast('Could not use that favorite')
      return
    }
    const next = [...analyzedItems, nextItem]
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
        setTodaysFoods((prev) => prev.map((food) => (food.id === editingEntry.id ? updatedEntry : food)))
      } catch {}
    }
  }

  const addBarcodeIngredientToAnalysis = (food: any, code: string) => {
    if (!food) return
    const nextItem = buildItemFromBarcodeFood(food, code, 1)
    if (!nextItem) {
      showQuickToast('Could not use that barcode')
      return
    }
    const next = [...analyzedItems, nextItem]
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
        setTodaysFoods((prev) => prev.map((food) => (food.id === editingEntry.id ? updatedEntry : food)))
      } catch {}
    }
  }

  const replaceIngredientFromOfficial = async (item: any, index: number) => {
    if (!item || index === null || index === undefined) return
    const itemsCopy = [...analyzedItems]
    if (!itemsCopy[index]) return
    const currentServings =
      Number.isFinite(Number(itemsCopy[index]?.servings)) && Number(itemsCopy[index]?.servings) > 0
        ? Number(itemsCopy[index]?.servings)
        : 1
    const nextItem = buildOfficialItem(item, currentServings)
    nextItem.dbLocked = true
    if (item?.source) {
      nextItem.dbSource = item.source
    }
    if (item?.id) {
      nextItem.dbId = item.id
    }
    if (item?.source && item?.id) {
      try {
        const params = new URLSearchParams({ source: item.source, id: String(item.id) })
        const res = await fetch(`/api/food-data/servings?${params.toString()}`)
        if (res.ok) {
          const data = await res.json()
          const options = Array.isArray(data.options) ? data.options : []
          if (options.length > 0) {
            nextItem.servingOptions = options
            const selected = options[0]
            nextItem.selectedServingId = selected?.id || null
            const merged = applyServingOptionToItem(nextItem, selected)
            itemsCopy[index] = merged
          } else {
            itemsCopy[index] = nextItem
          }
        } else {
          itemsCopy[index] = nextItem
        }
      } catch {
        itemsCopy[index] = nextItem
      }
    } else {
      itemsCopy[index] = nextItem
    }
    setAnalyzedItems(itemsCopy)
    applyRecalculatedNutrition(itemsCopy)
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
        setTodaysFoods(prev => prev.map(food => (food.id === editingEntry.id ? updatedEntry : food)))
      } catch {}
    }
    showQuickToast(`Updated to ${nextItem.name}`)
  }

  const cleanSingleFoodQuery = (value: string) =>
    value
      .replace(/[^\w\s-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

  const singularizeToken = (value: string) => {
    const lower = value.toLowerCase()
    if (lower.endsWith('ies') && value.length > 4) return `${value.slice(0, -3)}y`
    if (
      lower.endsWith('es') &&
      value.length > 3 &&
      !lower.endsWith('ses') &&
      !lower.endsWith('xes') &&
      !lower.endsWith('zes') &&
      !lower.endsWith('ches') &&
      !lower.endsWith('shes')
    ) {
      return value.slice(0, -2)
    }
    if (lower.endsWith('s') && value.length > 3 && !lower.endsWith('ss')) return value.slice(0, -1)
    return value
  }

  const buildSingleFoodFallback = (value: string) => {
    const cleaned = cleanSingleFoodQuery(value)
    if (!cleaned) return null
    const parts = cleaned.split(' ').filter(Boolean)
    if (parts.length === 0) return null
    const last = parts[parts.length - 1]
    const singular = singularizeToken(last)
    if (singular === last) return null
    parts[parts.length - 1] = singular
    const candidate = parts.join(' ')
    if (candidate.toLowerCase() === cleaned.toLowerCase()) return null
    return candidate
  }

  const normalizeBrandToken = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '')
      .trim()

  const buildOfficialSearchDisplay = (item: any, searchQuery: string) => {
    const name = String(item?.name || 'Food').trim()
    const brand = String(item?.brand || '').trim()
    if (!brand) return { title: name, showBrandSuffix: false }
    const queryFirst = String(searchQuery || '').trim().split(/\s+/)[0] || ''
    const normalizedQuery = normalizeBrandToken(queryFirst)
    const normalizedBrand = normalizeBrandToken(brand)
    const normalizedName = normalizeBrandToken(name)
    if (normalizedQuery && normalizedBrand && normalizedQuery === normalizedBrand && !normalizedName.startsWith(normalizedBrand)) {
      return { title: `${brand} ${name}`.trim(), showBrandSuffix: false }
    }
    return { title: name, showBrandSuffix: true }
  }

  const handleOfficialSearch = async (mode: 'packaged' | 'single', queryOverride?: string) => {
    const query = (queryOverride ?? officialSearchQuery).trim()
    if (!query) {
      setOfficialError('Please enter a product name or barcode to search.')
      return
    }

    // Cancel any in-flight request so stale results can't appear after Reset.
    try {
      officialSearchAbortRef.current?.abort()
    } catch {}
    const controller = new AbortController()
    officialSearchAbortRef.current = controller
    const seq = ++officialSearchSeqRef.current

    setOfficialError(null)
    setOfficialLoading(true)
    setOfficialResults([])
    setOfficialSource(mode)

    try {
      const sourceParam = mode === 'single' ? 'usda' : 'auto'
      const fetchItems = async (searchQuery: string) => {
        const params = new URLSearchParams({
          source: sourceParam,
          q: searchQuery,
          kind: mode,
          limit: '20',
        })
        const url = `/api/food-data?${params.toString()}`
        const res = await fetch(url, {
          method: 'GET',
          signal: controller.signal,
        })
        return { res, url }
      }

      const { res, url } = await fetchItems(query)
      setOfficialLastRequest({
        query,
        mode,
        url,
        status: null,
        itemCount: null,
        source: null,
        errorText: null,
        at: Date.now(),
      })

      if (!res.ok) {
        const text = await res.text()
        console.error('Food data search failed:', text)
        setOfficialError('Unable to fetch official data right now. Please try again.')
        if (officialSearchSeqRef.current === seq) {
          setOfficialLastRequest((prev) =>
            prev
              ? {
                  ...prev,
                  status: res.status,
                  errorText: String(text || '').slice(0, 400),
                }
              : prev,
          )
        }
        return
      }

      let data = await res.json()
      // Ignore late responses from older searches.
      if (officialSearchSeqRef.current !== seq) return

      let nextItems = Array.isArray(data.items) ? data.items : []
      if (mode === 'single') {
        nextItems = nextItems.filter((item: any) => item?.source === 'usda')
        if (nextItems.length === 0) {
          const fallback = buildSingleFoodFallback(query)
          if (fallback) {
            const retry = await fetchItems(fallback)
            if (retry.res.ok) {
              data = await retry.res.json()
              nextItems = Array.isArray(data.items) ? data.items : []
              nextItems = nextItems.filter((item: any) => item?.source === 'usda')
            }
          }
        }
      }

      setOfficialResults(nextItems)
      setOfficialResultsSource(data?.source || 'auto')
      setOfficialLastRequest((prev) =>
        prev
          ? {
              ...prev,
              status: res.status,
              source: data?.source || 'auto',
              itemCount: nextItems.length,
            }
          : prev,
      )
    } catch (err: any) {
      if (err?.name === 'AbortError') return
      console.error('Food data search error:', err)
      setOfficialError('Something went wrong while searching. Please try again.')
      if (officialSearchSeqRef.current === seq) {
        setOfficialLastRequest((prev) =>
          prev
            ? {
                ...prev,
                errorText: String(err?.message || err?.name || 'Unknown error'),
              }
            : prev,
        )
      }
    } finally {
      if (officialSearchSeqRef.current === seq) {
        setOfficialLoading(false)
      }
    }
  }

const applyStructuredItems = (
  itemsFromApi: any[] | null | undefined,
  totalFromApi: any,
  analysisText: string | null | undefined,
  options?: {
    allowTextFallback?: boolean
    barcodeTag?: { barcode: string; source?: string }
    analysisSeq?: number
    autoMatchEnabled?: boolean
    preserveExplicitCountsFrom?: any[]
  },
) => {
  let finalItems = Array.isArray(itemsFromApi) ? itemsFromApi : []
  let finalTotal = sanitizeNutritionTotals(totalFromApi)
  const allowTextFallback = options?.allowTextFallback ?? true
  const isPackagedAnalysis = analysisMode === 'packaged'
  const barcodeTag = options?.barcodeTag
  const analysisSeq = options?.analysisSeq ?? null
  const autoMatchEnabled = options?.autoMatchEnabled ?? false
  const preserveExplicitCountsFrom = options?.preserveExplicitCountsFrom ?? null

  console.log('🔍 applyStructuredItems called:', {
    itemsFromApiCount: Array.isArray(itemsFromApi) ? itemsFromApi.length : 0,
    hasTotalFromApi: !!totalFromApi,
    totalFromApiPreview: totalFromApi ? JSON.stringify(totalFromApi).substring(0, 100) : 'null',
    finalTotalAfterSanitize: finalTotal ? JSON.stringify(finalTotal) : 'null',
    hasAnalysisText: !!analysisText,
  })

  if (allowTextFallback && !finalItems.length && analysisText) {
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
    finalItems.length > 0
      ? (isPackagedAnalysis ? finalItems : enrichItemsFromCuratedUsda(finalItems))
      : []
  const enrichedItems = curatedEnriched.length > 0
    ? (isPackagedAnalysis ? curatedEnriched : enrichItemsFromStarter(curatedEnriched))
    : []
  // The backend *tries* to return correct discrete counts and totals, but we still apply a
  // conservative client-side safety pass for discrete items where the label clearly says
  // multiple pieces (e.g., "6 drumsticks") but the macros look like a single piece.
  // This does not change pieces/weight syncing; it only scales obviously-too-low macros.
  const normalizedItems = isPackagedAnalysis ? enrichedItems : normalizeDiscreteServingsWithLabel(enrichedItems)

  const addEstimatedServingWeights = (items: any[]) =>
    items.map((it) => {
      const { gramsPerServing, mlPerServing } = parseServingSizeInfo(it)
      const hasCustom =
        Number.isFinite((it as any)?.customGramsPerServing) ||
        Number.isFinite((it as any)?.customMlPerServing)
      if (gramsPerServing || mlPerServing || hasCustom) return it
      const estimate = estimateGramsPerServing(it)
      if (!estimate) return it
      const next = { ...it, customGramsPerServing: estimate }
      // Seed weight input so the user sees a default value immediately.
      const hasWeightAmount =
        Number.isFinite((next as any)?.weightAmount) && Number(next.weightAmount) > 0
      if (!hasWeightAmount) {
        next.weightAmount = Math.round(estimate * 100) / 100
        if (!next.weightUnit) next.weightUnit = 'g'
      }
      return next
    })

  const estimatedItems = normalizedItems.length > 0 ? addEstimatedServingWeights(normalizedItems) : []

  const stripGenericPlateItems = (items: any[], analysis: string | null | undefined) => {
    if (!Array.isArray(items)) return []
    const filteredMacroOnly = items.filter((item) => !isMacroOnlyName(String(item?.name || '')))
    if (filteredMacroOnly.length === 0) return items
    if (filteredMacroOnly.length <= 1) return filteredMacroOnly
    const analysisTrimmed = (analysis || '').trim().toLowerCase()
    const looksSummary = (name: string) => {
      const n = name.trim().toLowerCase()
      if (!n) return false
      if (n.startsWith('the image shows')) return true
      if (n.startsWith('this image shows')) return true
      if (n.includes('image shows')) return true
      if (analysisTrimmed && n === analysisTrimmed) return true
      const summaryKeywords = ['plate', 'platter', 'dish', 'bowl', 'meal']
      const hasSummaryKeyword = summaryKeywords.some((k) => n.includes(k))
      const hasListDelimiters = n.includes(',') || n.includes(' and ') || n.includes(' with ')
      const longPhrase = n.split(/\s+/).length >= 7
      const mentionsBurgerWith = n.includes('burger with')
      return hasSummaryKeyword || (hasListDelimiters && longPhrase) || mentionsBurgerWith
    }
    return filteredMacroOnly.filter((item) => {
      const name = String(item?.name || '').trim().toLowerCase()
      if (!name) return true
      if (looksSummary(name)) return false
      return true
    })
  }

  // Guard rail: never wipe existing cards if a new analysis yields nothing.
  // Prefer, in order:
  // 1) Fresh normalized items from the latest analysis
  // 2) Existing in-memory analyzedItems
  // 3) Items stored on the current editingEntry (if any)
  const existingItemsFromState =
    Array.isArray(analyzedItems) && analyzedItems.length > 0 ? analyzedItems : []
  const existingItemsFromEditingEntry =
    editingEntry && Array.isArray((editingEntry as any).items) && (editingEntry as any).items.length > 0
      ? (editingEntry as any).items
      : []
  const fallbackExistingItems =
    existingItemsFromState.length > 0 ? existingItemsFromState : existingItemsFromEditingEntry

  const filteredItems = stripGenericPlateItems(estimatedItems, analysisText)
  const fallbackItemName = analysisText ? extractBaseMealDescription(analysisText) : ''
  const fallbackItem = {
    name: fallbackItemName || 'Meal',
    brand: null,
    serving_size: '1 serving',
    servings: 1,
    calories: null,
    protein_g: null,
    carbs_g: null,
    fat_g: null,
    fiber_g: null,
    sugar_g: null,
    isGuess: true,
  }
  const itemsToUseRaw = (() => {
    if (filteredItems.length > 0) return filteredItems
    if (estimatedItems.length > 0) return estimatedItems
    if (fallbackExistingItems.length > 0) return fallbackExistingItems
    if (analysisText && allowTextFallback) return [fallbackItem]
    return []
  })()
  const itemsToUse = itemsToUseRaw.map((it: any) => {
    const next = normalizeDiscreteItem(it)
    const liquidItem = isLikelyLiquidFood(next?.name, next?.serving_size)
    const normalizedServingSize = normalizeServingSizeForLiquid(next?.serving_size, liquidItem)
    if (normalizedServingSize && normalizedServingSize !== next.serving_size) {
      next.serving_size = normalizedServingSize
    }
    const itemLabel = `${String(next?.name || '')} ${String(next?.serving_size || '')}`.toLowerCase()
    const isDiscrete = isDiscreteUnitLabel(itemLabel)
    const inferredPieces = inferPiecesFromAnalysisForItem(analysisText, next)
    const explicitPieces = getPiecesPerServing(next)
    const preferredPieces =
      inferredPieces && inferredPieces > 0
        ? inferredPieces
        : explicitPieces && explicitPieces > 0
        ? explicitPieces
        : null
    if (isDiscrete && preferredPieces && preferredPieces > 0) {
      next.piecesPerServing = preferredPieces
      next.pieces = preferredPieces
      next.servings = 1
    }
    // If we have multiple pieces, re-seed weight using the combined estimate (previous seed may have been per-piece).
    if (next.piecesPerServing && next.piecesPerServing > 1) {
      const inferredWeight =
        estimateGramsPerServing({
          ...next,
          customGramsPerServing: null,
          customMlPerServing: null,
          weightUnit: 'g',
        }) || null
      if (inferredWeight && inferredWeight > 0) {
        next.customGramsPerServing = inferredWeight
        if (!next.weightAmount || next.weightAmount < inferredWeight) {
          next.weightAmount = Math.round(inferredWeight * 100) / 100
          if (!next.weightUnit) next.weightUnit = 'g'
        }
      }
    }
    
    // Initialize weightAmount from serving size if not set
    if (!next.weightAmount || next.weightAmount === 0) {
      const { gramsPerServing, mlPerServing, ozPerServing } = quickParseServingSize(next?.serving_size)
      const currentUnit = next?.weightUnit === 'ml' ? 'ml' : next?.weightUnit === 'oz' ? 'oz' : 'g'
      const hasWeightUnit = !!next?.weightUnit
      const servings = Number.isFinite(Number(next?.servings)) && Number(next.servings) > 0 ? Number(next.servings) : 1
      
      let initialWeight: number | null = null
      let targetUnit = currentUnit
      
      // Determine which unit to use based on what's available in serving size
      if (ozPerServing && ozPerServing > 0) {
        targetUnit = 'oz'
        initialWeight = ozPerServing * servings
      } else if (mlPerServing && mlPerServing > 0) {
        targetUnit = liquidItem ? 'ml' : 'g'
        initialWeight = mlPerServing * servings
      } else if (gramsPerServing && gramsPerServing > 0) {
        targetUnit = 'g'
        initialWeight = gramsPerServing * servings
      }
      
      // Convert to current unit if needed (only when the item already has a weight unit)
      if (initialWeight && initialWeight > 0 && hasWeightUnit && targetUnit !== currentUnit) {
        const toGrams = (value: number, unit: string) => {
          if (unit === 'oz') return value * 28.3495
          return value // g or ml (assume ~1g/mL)
        }
        const fromGrams = (value: number, unit: string) => {
          if (unit === 'oz') return value / 28.3495
          return value // g or ml
        }
        const gramsValue = toGrams(initialWeight, targetUnit)
        initialWeight = fromGrams(gramsValue, currentUnit)
      }
      
      if (initialWeight && initialWeight > 0) {
        const finalUnit = hasWeightUnit ? currentUnit : targetUnit
        const precision = finalUnit === 'oz' ? 100 : 1000
        next.weightAmount = Math.round(initialWeight * precision) / precision
        if (!next.weightUnit) {
          next.weightUnit = finalUnit
        }
      }
    }
    
    return next
  })

  const taggedItems =
    barcodeTag && barcodeTag.barcode
      ? itemsToUse.map((item: any, index: number) =>
          index === 0
            ? {
                ...item,
                barcode: barcodeTag.barcode,
                barcodeSource: barcodeTag.source || 'label-photo',
                detectionMethod: 'barcode',
              }
            : item,
        )
      : itemsToUse

  const scrubbedItems = taggedItems.map((item: any) => {
    if (!item?.labelNeedsReview) return item
    return {
      ...item,
      calories: null,
      protein_g: null,
      carbs_g: null,
      fat_g: null,
      fiber_g: null,
      sugar_g: null,
    }
  })

  const stabilizeExplicitCounts = (items: any[], priorItems: any[] | null | undefined) => {
    if (!Array.isArray(items) || items.length === 0) return items
    if (!Array.isArray(priorItems) || priorItems.length === 0) return items
    const normalizeCountKey = (value: string) =>
      normalizeFoodName(String(value || ''))
        .replace(/\b\d+(?:\.\d+)?\b/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    const candidates = priorItems
      .map((item, index) => {
        const label = `${item?.name || ''} ${item?.serving_size || ''}`.trim()
        if (!hasExplicitPieceCountInLabel(label)) return null
        const key = normalizeCountKey(item?.name || '')
        if (!key) return null
        const pieces = getPiecesPerServing(item)
        if (!pieces || pieces <= 1) return null
        return { index, key, pieces }
      })
      .filter(Boolean) as Array<{ index: number; key: string; pieces: number }>
    if (candidates.length === 0) return items
    const used = new Set<number>()
    return items.map((item) => {
      const label = `${item?.name || ''} ${item?.serving_size || ''}`.trim()
      if (hasExplicitPieceCountInLabel(label)) return item
      const key = normalizeCountKey(item?.name || '')
      if (!key) return item
      const match = candidates.find((candidate) => candidate.key === key && !used.has(candidate.index))
      if (!match) return item
      used.add(match.index)
      return {
        ...item,
        piecesPerServing: match.pieces,
        pieces: match.pieces,
        servings: 1,
      }
    })
  }

  const stabilizedItems =
    Array.isArray(preserveExplicitCountsFrom) && preserveExplicitCountsFrom.length > 0
      ? stabilizeExplicitCounts(scrubbedItems, preserveExplicitCountsFrom)
      : scrubbedItems

  const hasLabelReviewFlag = stabilizedItems.some((item: any) => item?.labelNeedsReview)
  if (hasLabelReviewFlag) {
    finalTotal = null
  }

  setAnalyzedItems(stabilizedItems)
  if (analysisSeq && autoMatchEnabled) {
    autoMatchItemsToDatabase(stabilizedItems, analysisSeq, analysisText)
  }

  console.log('📊 Processing totals:', {
    enrichedItemsCount: taggedItems.length,
    hasFinalTotal: !!finalTotal,
    finalTotalValue: finalTotal ? JSON.stringify(finalTotal) : 'null',
  })

  // Priority order for totals (updated):
  // 1. Recalculated from enriched items (so the circle always matches the cards the user sees)
  // 2. API-provided total (if item-based recalculation is missing or clearly zero)
  // 3. Extracted from analysis text (fallback)
  let totalsToUse: NutritionTotals | null = null

  if (stabilizedItems.length > 0) {
    const fromItems = recalculateNutritionFromItems(stabilizedItems)
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
  } else if (stabilizedItems.length > 0) {
    // If we have items but no totals, recalculate one more time as a last resort
    const lastResortTotals = recalculateNutritionFromItems(stabilizedItems)
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

  return { items: taggedItems, total: totalsToUse }
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
      | 'portionMode'
      | 'weightAmount'
      | 'weightUnit'
      | 'customGramsPerServing'
      | 'customMlPerServing'
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
    const clearLabelReviewFlag = () => {
      if (itemsCopy[index]?.labelNeedsReview) {
        itemsCopy[index].labelNeedsReview = false
        delete itemsCopy[index].labelNeedsReviewMessage
      }
    }

    // Normalize and clamp values by field
    if (field === 'name') {
      itemsCopy[index].name = String(value || '').trim()
    } else if (field === 'brand') {
      const v = String(value || '').trim()
      itemsCopy[index].brand = v.length > 0 ? v : null
    } else if (field === 'serving_size') {
      const previousLabel = String(itemsCopy[index].serving_size || '')
      const nextLabel = stripNutritionFromServingSize(String(value || '').trim())
      const pickAmount = (info: any) => {
        if (!info) return null
        if (Number.isFinite(info.gramsPerServing) && info.gramsPerServing > 0) return info.gramsPerServing
        if (Number.isFinite(info.mlPerServing) && info.mlPerServing > 0) return info.mlPerServing
        return null
      }
      const oldInfo = parseServingSizeInfo({ serving_size: previousLabel })
      const newInfo = parseServingSizeInfo({ serving_size: nextLabel })
      const oldAmount = pickAmount(oldInfo)
      const newAmount = pickAmount(newInfo)
      const ratio =
        oldAmount && newAmount && Number.isFinite(oldAmount) && Number.isFinite(newAmount) && oldAmount > 0 && newAmount > 0
          ? newAmount / oldAmount
          : null

      itemsCopy[index].serving_size = nextLabel
      clearLabelReviewFlag()
      if (ratio && Number.isFinite(ratio) && ratio > 0) {
        const scaleMacro = (fieldName: string, decimals: number) => {
          const raw = Number((itemsCopy[index] as any)[fieldName])
          if (!Number.isFinite(raw)) return
          const scaled = raw * ratio
          const factor = decimals > 0 ? Math.pow(10, decimals) : 1
          const rounded = decimals > 0 ? Math.round(scaled * factor) / factor : Math.round(scaled)
          ;(itemsCopy[index] as any)[fieldName] = rounded
        }
        scaleMacro('calories', 0)
        scaleMacro('protein_g', 1)
        scaleMacro('carbs_g', 1)
        scaleMacro('fat_g', 1)
        scaleMacro('fiber_g', 1)
        scaleMacro('sugar_g', 1)
        const baseWeight = getBaseWeightPerServing(itemsCopy[index])
        const servings = Number.isFinite(itemsCopy[index].servings) ? Number(itemsCopy[index].servings) : 1
        if (baseWeight && baseWeight > 0) {
          const unit =
            itemsCopy[index]?.weightUnit === 'ml' ? 'ml' : itemsCopy[index]?.weightUnit === 'oz' ? 'oz' : 'g'
          const precision = unit === 'oz' ? 100 : 1000
          itemsCopy[index].weightAmount = Math.round(baseWeight * Math.max(0, servings || 1) * precision) / precision
        }
      }
    } else if (field === 'servings') {
      // Keep servings stable to 2 decimals to avoid 1.24 vs 1.25 drift when stepping.
      const clamped = clampNumber(value, 0, 20)
      const rounded = Math.round(clamped * 100) / 100
      itemsCopy[index].servings = rounded
      // Keep weight in sync if we know per-serving weight
      const baseWeight = getBaseWeightPerServing(itemsCopy[index])
      if (baseWeight && baseWeight > 0) {
        const unit = itemsCopy[index]?.weightUnit === 'ml' ? 'ml' : itemsCopy[index]?.weightUnit === 'oz' ? 'oz' : 'g'
        const computed = baseWeight * rounded
        const precision = unit === 'oz' ? 100 : 1000
        itemsCopy[index].weightAmount = Math.round(computed * precision) / precision
      }
    } else if (field === 'portionMode') {
      itemsCopy[index].portionMode = value === 'weight' ? 'weight' : 'servings'
      if (itemsCopy[index].portionMode === 'weight') {
        const base = getBaseWeightPerServing(itemsCopy[index])
        const servings = Number.isFinite(itemsCopy[index].servings) ? Number(itemsCopy[index].servings) : 1
        if (base && base > 0) {
          const computed = base * Math.max(0, servings || 1)
          itemsCopy[index].weightAmount = Math.round(computed * 100) / 100
        } else {
          const info = parseServingSizeInfo(itemsCopy[index])
          const customSeed =
            itemsCopy[index].weightUnit === 'ml'
              ? itemsCopy[index].customMlPerServing
              : itemsCopy[index].customGramsPerServing
          const seed =
            (itemsCopy[index].weightUnit === 'ml' ? info.mlPerServing : info.gramsPerServing) ||
            info.gramsPerServing ||
            info.mlPerServing ||
            customSeed ||
            null
          if (seed) {
            itemsCopy[index].weightAmount = Math.round(seed * 100) / 100
          }
        }
      }
    } else if (field === 'weightAmount') {
      if (value === '' || value === null) {
        itemsCopy[index].weightAmount = null
      } else {
        const clamped = clampNumber(value, 0, 5000)
        const rounded = Math.round(clamped * 100) / 100
        itemsCopy[index].weightAmount = rounded
      // If we know per-serving weight, keep servings in sync when weight changes.
      const baseWeight = getBaseWeightPerServing(itemsCopy[index])
      if (baseWeight && baseWeight > 0) {
        const derivedServings = Math.max(0, rounded / baseWeight)
        itemsCopy[index].servings = Math.round(derivedServings * 100) / 100
      }
      }
      clearLabelReviewFlag()
    } else if (field === 'weightUnit') {
      const previousUnit = itemsCopy[index].weightUnit === 'ml' ? 'ml' : itemsCopy[index].weightUnit === 'oz' ? 'oz' : 'g'
      const normalized = value === 'ml' ? 'ml' : value === 'oz' ? 'oz' : 'g'
      // Convert weightAmount to preserve the same actual quantity when switching units
      const currentWeight = Number.isFinite(itemsCopy[index].weightAmount) ? Number(itemsCopy[index].weightAmount) : null
      if (currentWeight && currentWeight > 0 && normalized !== previousUnit) {
        let gramsValue: number | null = null
        if (previousUnit === 'g') gramsValue = currentWeight
        else if (previousUnit === 'ml') gramsValue = currentWeight // assume density ~1g/mL when unknown
        else if (previousUnit === 'oz') gramsValue = currentWeight * 28.3495

        if (gramsValue !== null) {
          let converted = gramsValue
          if (normalized === 'g') converted = gramsValue
          else if (normalized === 'ml') converted = gramsValue // assume ~1g per mL
          else if (normalized === 'oz') converted = gramsValue / 28.3495

          // Round sensibly
          if (normalized === 'oz') {
            itemsCopy[index].weightAmount = Math.round(converted * 100) / 100
          } else {
            itemsCopy[index].weightAmount = Math.round(converted * 1000) / 1000
          }
        }
      }
      itemsCopy[index].weightUnit = normalized
      clearLabelReviewFlag()
    } else if (field === 'customGramsPerServing') {
      const clamped = clampNumber(value, 0, 5000)
      const rounded = Math.round(clamped * 100) / 100
      itemsCopy[index].customGramsPerServing = rounded
      clearLabelReviewFlag()
    } else if (field === 'customMlPerServing') {
      const clamped = clampNumber(value, 0, 5000)
      const rounded = Math.round(clamped * 100) / 100
      itemsCopy[index].customMlPerServing = rounded
      clearLabelReviewFlag()
    } else if (field === 'calories') {
      // Calories as integer, reasonable upper bound per serving
      const clamped = clampNumber(value, 0, 3000)
      itemsCopy[index].calories = Math.round(clamped)
      clearLabelReviewFlag()
    } else {
      // Macros in grams with 1 decimal place, reasonable upper bound per serving
      const clamped = clampNumber(value, 0, 500)
      const rounded = Math.round(clamped * 10) / 10
      itemsCopy[index][field] = rounded
      clearLabelReviewFlag()
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

  // Ensure numeric inputs behave like "type to replace" and surface the numeric keypad on mobile.
  const primeNumericOverwrite = (input: HTMLInputElement | null) => {
    if (!input) return
    input.dataset.replaceOnInput = 'true'
    requestAnimationFrame(() => {
      try {
        input.select()
      } catch {
        // Mobile Safari can throw if selection isn't ready yet.
      }
    })
    // Fallback to ensure selection after any delayed focus.
    setTimeout(() => {
      if (document.activeElement === input) {
        try {
          input.select()
        } catch {
          // no-op
        }
      }
    }, 0)
  }

  const handleNumericFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    primeNumericOverwrite(e.currentTarget)
  }

  const handleNumericBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.dataset.replaceOnInput = ''
  }

  const handleNumericKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const target = e.currentTarget
    if (target.dataset.replaceOnInput === 'true') {
      const metaPressed = e.metaKey || e.ctrlKey || e.altKey
      const navigationKeys = ['Tab', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', 'Escape', 'Shift']
      if (!metaPressed && !navigationKeys.includes(e.key) && !e.repeat) {
        target.value = ''
      }
    }
  }

  const normalizeNumericInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    const target = event.currentTarget
    if (target.dataset.replaceOnInput === 'true') {
      const native = event.nativeEvent as InputEvent
      const data = native?.data
      const nextValue = data !== null && data !== undefined ? data : target.value
      target.dataset.replaceOnInput = 'false'
      target.value = nextValue
      return nextValue
    }
    return target.value
  }

  // Profile data - prefer real photos; fall back to professional icon
  const hasProfileImage = !!(profileImage || session?.user?.image)
  const userImage = (profileImage || session?.user?.image || '') as string
  const userName = session?.user?.name || 'User';

  const todayIso = buildTodayIso();

  // Today's date
  const today = new Date().toLocaleDateString('en-US', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });

  const isViewingToday = selectedDate === todayIso;

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

  const formatShortDayLabel = (iso: string) => {
    try {
      const [y, m, d] = iso.split('-').map((v) => parseInt(v, 10))
      const local = new Date(y, (m || 1) - 1, d || 1)
      return local.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    } catch {
      return iso
    }
  }

  // Mobile date header label: "Today" when on today's date; otherwise "Fri, Dec 12"
  const mobileDateLabel = isViewingToday ? 'Today' : formatShortDayLabel(selectedDate)
  const desktopDateLabel = isViewingToday ? 'Today' : formatShortDayLabel(selectedDate)

  const shiftSelectedDateByDays = (deltaDays: number) => {
    try {
      const [y, m, d] = selectedDate.split('-').map((v) => parseInt(v, 10))
      const base = new Date(y, (m || 1) - 1, d || 1, 12, 0, 0, 0) // midday to avoid DST edge weirdness
      base.setDate(base.getDate() + deltaDays)
      const yy = base.getFullYear()
      const mm = String(base.getMonth() + 1).padStart(2, '0')
      const dd = String(base.getDate()).padStart(2, '0')
      setSelectedDate(`${yy}-${mm}-${dd}`)
    } catch {
      // fallback: do nothing
    }
  }

  const [showDateSheet, setShowDateSheet] = useState(false)
  const [dateSheetMonth, setDateSheetMonth] = useState<string>(() => (selectedDate || todayIso).slice(0, 7))
  useEffect(() => {
    if (showDateSheet) {
      setDateSheetMonth((selectedDate || todayIso).slice(0, 7))
    }
  }, [showDateSheet, selectedDate, todayIso])

  const monthMeta = useMemo(() => {
    const [yy, mm] = (dateSheetMonth || '').split('-').map((v) => parseInt(v, 10))
    const safeY = Number.isFinite(yy) ? yy : new Date().getFullYear()
    const safeM = Number.isFinite(mm) ? mm : new Date().getMonth() + 1
    const first = new Date(safeY, Math.max(0, safeM - 1), 1)
    const daysInMonth = new Date(safeY, Math.max(0, safeM - 1) + 1, 0).getDate()
    const startDow = first.getDay() // 0 = Sun
    const label = first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    return { year: safeY, month: safeM, daysInMonth, startDow, label }
  }, [dateSheetMonth])

  const shiftDateSheetMonth = (delta: number) => {
    const y = monthMeta.year
    const m = monthMeta.month
    const next = new Date(y, (m - 1) + delta, 1)
    const yy = next.getFullYear()
    const mm = String(next.getMonth() + 1).padStart(2, '0')
    setDateSheetMonth(`${yy}-${mm}`)
  }

  const selectCalendarDay = (dayNum: number) => {
    const yy = monthMeta.year
    const mm = String(monthMeta.month).padStart(2, '0')
    const dd = String(dayNum).padStart(2, '0')
    setSelectedDate(`${yy}-${mm}-${dd}`)
    setShowDateSheet(false)
  }

  const normalizeDiaryEntry = (entry: any, fallbackDate: string) => {
    if (!entry) return entry
    const rawCat = entry.meal ?? entry.category ?? (entry as any)?.mealType ?? (entry as any)?.persistedCategory
    const normalizedCategory = normalizeCategory(rawCat)
    const rawCreatedAtIso =
      entry?.createdAt ||
      (typeof entry?.id === 'number' ? new Date(entry.id).toISOString() : undefined) ||
      new Date().toISOString()
    const explicitLocalDate =
      typeof entry?.localDate === 'string' && entry.localDate.length >= 8 ? entry.localDate : ''
    const derivedDate = deriveDateFromEntryTimestamp(entry)
    const localDate = derivedDate || explicitLocalDate || fallbackDate
    const createdAtIso = alignTimestampToLocalDate(rawCreatedAtIso, localDate)
    const displayTime = new Date(createdAtIso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    return {
      ...entry,
      meal: normalizedCategory,
      category: normalizedCategory,
      persistedCategory: normalizedCategory,
      createdAt: createdAtIso,
      localDate,
      time: displayTime,
    }
  }

  const normalizeDiaryList = (list: any[], fallbackDate: string) =>
    Array.isArray(list) ? list.map((entry) => normalizeDiaryEntry(entry, fallbackDate)) : []

  const updatePersistentDiarySnapshotForDate = (
    entriesForDate: any[],
    targetDate: string,
    expandedOverride?: Record<string, boolean>,
  ) => {
    if (typeof window === 'undefined') return
    if (!targetDate) return
    try {
      const snapshot = readPersistentDiarySnapshot() || { byDate: {} }
      const filtered = filterEntriesForDate(entriesForDate, targetDate)
      const normalized = dedupeEntries(normalizeDiaryList(filtered, targetDate), { fallbackDate: targetDate })
      const existing = snapshot.byDate[targetDate] || {}
      snapshot.byDate[targetDate] = {
        entries: normalized,
        expandedCategories: expandedOverride || existing.expandedCategories,
        normalized: true,
      }
      writePersistentDiarySnapshot(snapshot)
      refreshPersistentDiarySnapshot()
    } catch (err) {
      console.warn('Could not persist diary snapshot for date', err)
    }
  }

  const sourceEntries = useMemo(
    () =>
      dedupeEntries(
        normalizeDiaryList(isViewingToday ? todaysFoodsForSelectedDate : (historyFoods || []), selectedDate),
        { fallbackDate: selectedDate },
      ),
    [todaysFoodsForSelectedDate, historyFoods, isViewingToday, deletedEntryNonce, selectedDate],
  )
  const entriesByCategory = useMemo(() => {
    const grouped: Record<string, any[]> = {}
    sourceEntries.forEach((entry) => {
      const cat = normalizeCategory(entry?.meal || entry?.category || entry?.mealType)
      grouped[cat] = grouped[cat] || []
      grouped[cat].push(entry)
    })
    return grouped
  }, [sourceEntries])
  const linkedWaterLogIds = useMemo(() => {
    const set = new Set<string>()
    sourceEntries.forEach((entry) => {
      if (isEntryDeleted(entry)) return
      const meta = getDrinkMetaFromEntry(entry)
      if (meta?.waterLogId) set.add(String(meta.waterLogId))
    })
    return set
  }, [sourceEntries])
  const waterEntriesByCategory = useMemo(() => {
    const grouped: Record<string, any[]> = {}
    if (!Array.isArray(waterEntries) || waterEntries.length === 0) return grouped
    waterEntries.forEach((entry) => {
      if (linkedWaterLogIds.has(String(entry?.id ?? ''))) return
      const cat = normalizeCategory(entry?.category || 'uncategorized')
      const createdAtMs = entry?.createdAt ? new Date(entry.createdAt).getTime() : NaN
      const createdAtIso = Number.isFinite(createdAtMs) ? new Date(createdAtMs).toISOString() : new Date().toISOString()
      const time = new Date(createdAtIso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      const localDate = entry?.localDate || selectedDate
      const normalized = {
        id: `water:${entry.id}`,
        waterId: entry.id,
        amount: entry.amount,
        unit: entry.unit,
        amountMl: entry.amountMl,
        label: entry.label ?? 'Water',
        description: entry.label ?? 'Water',
        meal: cat,
        category: cat,
        persistedCategory: cat,
        localDate,
        createdAt: createdAtIso,
        time,
        __water: true,
      }
      grouped[cat] = grouped[cat] || []
      grouped[cat].push(normalized)
    })
    return grouped
  }, [linkedWaterLogIds, selectedDate, waterEntries])

  const multiCopyEntries = useMemo(() => {
    if (!multiCopyCategory) return []
    const list = entriesByCategory[multiCopyCategory] || []
    return Array.isArray(list) ? list.slice().sort((a: any, b: any) => (b?.id || 0) - (a?.id || 0)) : []
  }, [entriesByCategory, multiCopyCategory])

  const multiCopySelectedCount = useMemo(() => {
    return Object.values(multiCopySelectedKeys || {}).filter(Boolean).length
  }, [multiCopySelectedKeys])

  const combineEntries = useMemo(() => {
    if (!combineCategory) return []
    const list = entriesByCategory[combineCategory] || []
    return Array.isArray(list) ? list.slice().sort((a: any, b: any) => (b?.id || 0) - (a?.id || 0)) : []
  }, [entriesByCategory, combineCategory])

  const combineSelectedCount = useMemo(() => {
    return Object.values(combineSelectedKeys || {}).filter(Boolean).length
  }, [combineSelectedKeys])

  // Calendar highlight: keep Today green; show orange background for other days that have entries.
  // This is best-effort and uses the durable local snapshot (no extra server requests).
  const entryDatesInVisibleMonth = useMemo(() => {
    const set = new Set<string>()
    const monthPrefix = `${monthMeta.year}-${String(monthMeta.month).padStart(2, '0')}-`

    // Always include current selected day if it has entries.
    if (selectedDate.startsWith(monthPrefix) && Array.isArray(sourceEntries) && sourceEntries.length > 0) {
      set.add(selectedDate)
    }

    // Pull from the durable per-date snapshot in localStorage.
    const snapshot = readPersistentDiarySnapshot()
    const byDate = snapshot?.byDate || {}
    Object.keys(byDate).forEach((iso) => {
      if (!iso || !iso.startsWith(monthPrefix)) return
      const rawEntries = (byDate as any)?.[iso]?.entries
      if (!Array.isArray(rawEntries) || rawEntries.length === 0) return
      const normalized = dedupeEntries(normalizeDiaryList(rawEntries, iso), { fallbackDate: iso })
      if (normalized.length > 0) set.add(iso)
    })

    return set
  }, [monthMeta.year, monthMeta.month, selectedDate, sourceEntries, deletedEntryNonce])

  // NOTE: Do NOT clear delete tombstones on date switches.
  // Tombstones already include a stable YYYY-MM-DD date key, so they won't hide other days.
  // Clearing them causes "ghost" entries to reappear after navigating away and back.
  useEffect(() => {
    setDeletedEntryNonce((n) => n + 1)
  }, [selectedDate])

  // Close dropdowns on outside click (exclude add-food menu to avoid accidental closes)
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as EventTarget | null;
      if (!(target instanceof Element)) return;

      // Check if the click is inside any dropdown
      if (!target.closest('.dropdown-container')) {
        setDropdownOpen(false);
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
      if ((showPhotoOptions || showCategoryPicker) && !target.closest('.food-options-dropdown')) {
        if (!target.closest('.category-add-button') && !target.closest('.add-food-entry-container')) {
          closeAddMenus()
        }
      }
    }
    if (dropdownOpen || showEntryOptions || showIngredientOptions || showEditActionsMenu || showPhotoOptions || showCategoryPicker) {
      document.addEventListener('mousedown', handleClick);
      return () => document.removeEventListener('mousedown', handleClick);
    }
  }, [dropdownOpen, showEntryOptions, showIngredientOptions, showEditActionsMenu, showPhotoOptions, showCategoryPicker, closeAddMenus]);

  // Reset which ingredient card is expanded whenever we switch which entry is being edited.
  // Multi-ingredient meals will start with all cards collapsed; single-ingredient meals
  // remain fully open by default via the rendering logic. This effect keys off the entry id
  // so it does NOT fire on every minor edit (which would collapse the open card).
  useEffect(() => {
    setExpandedItemIndex(null)
  }, [editingEntry?.id])

  // Keep the add-menu dropdown fully visible on mobile by scrolling the tapped category into view.
  useEffect(() => {
    if (!isMobile) return
    if (!showPhotoOptions || !photoOptionsAnchor) return
    requestAnimationFrame(() => {
      try {
        const row = categoryRowRefs.current[photoOptionsAnchor]
        if (!row) return
        const top = row.getBoundingClientRect().top + window.scrollY - 12
        window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
      } catch {
        // best effort only
      }
    })
  }, [showPhotoOptions, photoOptionsAnchor, isMobile])

  // Auto-collapse empty categories when loading a date (do not persist empty sections as open).
  const appliedEmptyCollapseRef = useRef<Record<string, boolean>>({})
  useEffect(() => {
    if (!diaryHydrated) return
    if (appliedEmptyCollapseRef.current[selectedDate]) return
    const { map, changed } = collapseEmptyCategories(expandedCategories, sourceEntries)
    if (changed) {
      setExpandedCategories(map)
    }
    appliedEmptyCollapseRef.current[selectedDate] = true
  }, [diaryHydrated, selectedDate, sourceEntries, expandedCategories])

  // Auto-expand categories that have entries
  useEffect(() => {
    const source = dedupeEntries(isViewingToday ? todaysFoodsForSelectedDate : (historyFoods || []), { fallbackDate: selectedDate })
    setExpandedCategories((prev) => {
      const next = { ...prev }
      let changed = false
      source.forEach((entry) => {
        const cat = normalizeCategory(entry?.meal || entry?.category || entry?.mealType)
        if (next[cat] === undefined) {
          next[cat] = true
          changed = true
        }
      })
      return changed ? next : prev
    })
  }, [todaysFoods, historyFoods, isViewingToday, selectedDate])

  // Hydrate from persistent snapshot immediately when switching dates to avoid empty flicker
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const snapshot = readPersistentDiarySnapshot()
      const byDate = snapshot?.byDate?.[selectedDate]
      if (!byDate || !byDate.normalized || !Array.isArray(byDate.entries)) return
      const normalized = dedupeEntries(normalizeDiaryList(byDate.entries, selectedDate), {
        fallbackDate: selectedDate,
      })
      if (isViewingToday) {
        setTodaysFoods(normalized)
      } else {
        setHistoryFoods(normalized)
      }
      setExpandedCategories((prev) => {
        const merged = { ...prev, ...(byDate.expandedCategories || {}) }
        const { map } = collapseEmptyCategories(merged, normalized)
        return map
      })
      setFoodDiaryLoaded(true)
      setDiaryHydrated(true)
    } catch (err) {
      console.warn('Snapshot hydration failed', err)
    }
  }, [selectedDate, isViewingToday])

  // Persist a warm snapshot so returning to the diary avoids a cold reload spinner
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const payload: WarmDiaryState = {
        selectedDate,
        todaysFoods,
        expandedCategories: collapseEmptyCategories(expandedCategories, sourceEntries).map,
      }
      if (Array.isArray(historyFoods)) {
        payload.historyByDate = { [selectedDate]: historyFoods }
      }
      sessionStorage.setItem('foodDiary:warmState', JSON.stringify(payload))
    } catch (err) {
      console.warn('Could not cache warm diary state', err)
    }
  }, [selectedDate, todaysFoods, historyFoods, expandedCategories])

  // Persist a durable snapshot per date to avoid reload flicker across navigations
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const snapshot = readPersistentDiarySnapshot() || { byDate: {} }
      const sourceEntriesForDate = normalizeDiaryList(
        isViewingToday ? todaysFoodsForSelectedDate : (historyFoods || []),
        selectedDate,
      )
      const normalized = dedupeEntries(sourceEntriesForDate, { fallbackDate: selectedDate })
      snapshot.byDate[selectedDate] = {
        entries: normalized,
        expandedCategories: collapseEmptyCategories(expandedCategories, normalized).map,
        normalized: true,
      }
      writePersistentDiarySnapshot(snapshot)
      refreshPersistentDiarySnapshot()
    } catch (err) {
      console.warn('Could not persist diary snapshot', err)
    }
  }, [selectedDate, isViewingToday, todaysFoods, historyFoods, expandedCategories, refreshPersistentDiarySnapshot])

  useEffect(() => {
    if (typeof document === 'undefined') return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = showFavoritesPicker ? 'hidden' : previousOverflow
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [showFavoritesPicker])

  useEffect(() => {
    if (!feedbackPrompt) return
    if (typeof document === 'undefined') return
    const { body, documentElement } = document
    const previous = {
      bodyOverflow: body.style.overflow,
      bodyPosition: body.style.position,
      bodyTop: body.style.top,
      bodyWidth: body.style.width,
      htmlOverflow: documentElement.style.overflow,
    }
    const scrollY = typeof window !== 'undefined' ? window.scrollY || 0 : 0
    body.style.overflow = 'hidden'
    documentElement.style.overflow = 'hidden'
    body.style.position = 'fixed'
    body.style.top = `-${scrollY}px`
    body.style.width = '100%'
    return () => {
      body.style.overflow = previous.bodyOverflow
      body.style.position = previous.bodyPosition
      body.style.top = previous.bodyTop
      body.style.width = previous.bodyWidth
      documentElement.style.overflow = previous.htmlOverflow
      if (typeof window !== 'undefined') {
        window.scrollTo(0, scrollY)
      }
    }
  }, [feedbackPrompt])

  // Ensure diary is considered hydrated once data is loaded through any path
  useEffect(() => {
    if (foodDiaryLoaded) {
      setDiaryHydrated(true)
    }
  }, [foodDiaryLoaded])



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
  // Load today's foods from cache first, then verify against the database.
  useEffect(() => {
    if (!isViewingToday) return
    const targetDate = selectedDate
    if (!targetDate) return

    const localBaseline = dedupeEntries(
      filterEntriesForDate(latestTodaysFoodsRef.current, targetDate),
      { fallbackDate: targetDate },
    )
    const hasLocal = localBaseline.length > 0

    const applyBaseline = (entries: any[]) => {
      if (!entries || entries.length === 0) return false
      updateTodaysFoodsForDate(entries, targetDate)
      setFoodDiaryLoaded(true)
      return true
    }

    const hydrateFromCache = () => {
      if (!userData?.todaysFoods) return false
      const onlySelectedDate = userData.todaysFoods.flatMap((item: any) => {
        try {
          const explicitLocalDate =
            typeof item?.localDate === 'string' && item.localDate.length >= 8 ? item.localDate : ''
          const derivedDate = deriveDateFromEntryTimestamp(item)
          const effectiveDate = derivedDate || explicitLocalDate

          if (!effectiveDate || effectiveDate !== targetDate) return []

          if (derivedDate && explicitLocalDate && derivedDate !== explicitLocalDate) {
            return [{ ...item, localDate: derivedDate }]
          }

          if (!explicitLocalDate && derivedDate) {
            return [{ ...item, localDate: derivedDate }]
          }

          return [item]
        } catch (err) {
          console.warn('Cache entry filter failed', err)
          return []
        }
      })
      const deduped = dedupeEntries(onlySelectedDate, { fallbackDate: targetDate })
      return applyBaseline(deduped)
    }

    if (!isDiaryHydrated(targetDate)) {
      if (hasLocal) {
        setFoodDiaryLoaded(true)
      } else {
        const loadedFromCache = hydrateFromCache()
        if (!loadedFromCache) {
          refreshEntriesFromServer()
        }
      }
      markDiaryHydrated(targetDate)
    } else if (hasLocal && !foodDiaryLoaded) {
      setFoodDiaryLoaded(true)
    }

    if (!isDiaryVerified(targetDate)) {
      const holdRemaining = getVerifyMergeHoldRemaining(targetDate)
      if (holdRemaining > 0) {
        scheduleVerifyMergeForDate(targetDate, holdRemaining + 50, () => {
          refreshEntriesFromServer()
        })
        return
      }
      refreshEntriesFromServer()
    }
  }, [userData, isViewingToday, selectedDate, resumeTick]);

  // Auto-rebuild ingredient cards from aiDescription when needed
  useEffect(() => {
    if (!aiDescription) return
    if (analyzedItems && analyzedItems.length > 0) return
    const allowTextFallback = editingEntry ? !editingEntry?.nutrition : true
    const analysisSeq = ++analysisSequenceRef.current
    applyStructuredItems(null, null, aiDescription, { allowTextFallback, analysisSeq, autoMatchEnabled: false })
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
        const snapshot = readPersistentDiarySnapshot()
        const cached = snapshot?.byDate?.[selectedDate]?.entries
        if (cached && Array.isArray(cached) && cached.length > 0) {
          const normalizedCached = dedupeEntries(normalizeDiaryList(cached, selectedDate), { fallbackDate: selectedDate })
          setHistoryFoods(normalizedCached)
          setFoodDiaryLoaded(true)
        }
        setIsLoadingHistory(true);
        const hasCachedHistory = Array.isArray(historyFoods) && historyFoods.length > 0
        setFoodDiaryLoaded(hasCachedHistory); // Show cached state instantly when available
        const tz = new Date().getTimezoneOffset();
        const apiUrl = `/api/food-log?date=${selectedDate}&tz=${tz}`;
        console.log(`📡 Fetching from API: ${apiUrl}`);
        const res = await fetch(`${apiUrl}&t=${Date.now()}`, { cache: 'no-store' });
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

          const mapped = mapLogsToEntries(logs, selectedDate)
          // Guard rail: route all loads through dedupeEntries + normalization.
          const deduped = dedupeEntries(mapped, { fallbackDate: selectedDate })

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
  }, [selectedDate, isViewingToday, resumeTick]);

  useEffect(() => {
    if (!session?.user?.email) {
      setWaterEntries([])
      return
    }
    let cancelled = false
    const loadWater = async () => {
      setWaterLoading(true)
      try {
        const res = await fetch(`/api/water-log?localDate=${encodeURIComponent(selectedDate)}`, {
          cache: 'no-store' as any,
          credentials: 'include',
        })
        if (!res.ok) throw new Error('water load failed')
        const data = await res.json()
        if (!cancelled) {
          setWaterEntries(Array.isArray(data?.entries) ? data.entries : [])
        }
      } catch {
        if (!cancelled) setWaterEntries([])
      } finally {
        if (!cancelled) setWaterLoading(false)
      }
    }
    loadWater()
    return () => {
      cancelled = true
    }
  }, [selectedDate, session?.user?.email])

  const mapLogsToEntries = (
    logs: any[],
    fallbackDate: string,
    options?: { preferCreatedAtDate?: boolean },
  ) =>
    logs.map((l: any) => {
      const rawCat = (l as any)?.meal || (l as any)?.category || (l as any)?.mealType
      const category = normalizeCategory(rawCat)
      let resolvedLocalDate =
        typeof (l as any)?.localDate === 'string' && (l as any).localDate.length >= 8
          ? String((l as any).localDate).slice(0, 10)
          : ''
      if (!resolvedLocalDate && options?.preferCreatedAtDate) {
        const createdAtMs = l?.createdAt ? new Date(l.createdAt).getTime() : NaN
        if (Number.isFinite(createdAtMs)) {
          resolvedLocalDate = formatDateFromMs(createdAtMs)
        }
      }
      if (!resolvedLocalDate) {
        resolvedLocalDate = fallbackDate
      }
      const sourceCreatedAtIso = l.createdAt ? new Date(l.createdAt).toISOString() : new Date().toISOString()
      const loggedAtRaw = (l as any)?.nutrients?.__loggedAt
      const loggedAtIso =
        typeof loggedAtRaw === 'string' && loggedAtRaw.trim().length > 0
          ? loggedAtRaw
          : typeof loggedAtRaw === 'number' && Number.isFinite(loggedAtRaw)
          ? new Date(loggedAtRaw).toISOString()
          : ''
      const createdAtIso = alignTimestampToLocalDate(sourceCreatedAtIso, resolvedLocalDate)
      const storedClientId = normalizeClientId((l as any)?.nutrients?.__clientId)
      const storedOrigin = (() => {
        const n = (l as any)?.nutrients
        if (n && typeof n === 'object') {
          const raw = (n as any).__origin
          return typeof raw === 'string' ? raw.toLowerCase() : ''
        }
        return ''
      })()
      const addedOrderRaw = (l as any)?.nutrients?.__addedOrder
      const addedOrderFromNutrients = Number.isFinite(Number(addedOrderRaw)) ? Number(addedOrderRaw) : NaN
      const loggedOrder = loggedAtIso ? new Date(loggedAtIso).getTime() : NaN
      const clientOrder = storedClientId ? parseClientIdTimestampMs(storedClientId) : NaN
      const addedOrder =
        Number.isFinite(addedOrderFromNutrients)
          ? addedOrderFromNutrients
          : Number.isFinite(loggedOrder)
          ? loggedOrder
          : Number.isFinite(clientOrder)
          ? clientOrder
          : NaN
      const method =
        storedOrigin === 'meal-builder'
          ? 'meal-builder'
          : storedOrigin === 'combined'
          ? 'combined'
          : l.imageUrl
          ? 'photo'
          : 'text'
      return {
        id: new Date(createdAtIso).getTime(), // UI key and sorting by timestamp
        dbId: l.id, // actual database id for delete operations
        clientId: storedClientId || undefined,
        description: l.description || l.name,
        time: new Date(createdAtIso).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        }),
        method,
        photo: l.imageUrl || null,
        nutrition: l.nutrients || null,
        items: (l as any).items || (l.nutrients as any)?.items || null,
        meal: category,
        category,
        persistedCategory: category,
        createdAt: createdAtIso,
        __sourceCreatedAt: loggedAtIso || sourceCreatedAtIso,
        __addedOrder: Number.isFinite(addedOrder) ? addedOrder : undefined,
        localDate: resolvedLocalDate,
      }
    })

  const PENDING_SERVER_ID_TTL_MS = 2 * 60 * 1000
  const prunePendingServerIds = () => {
    const now = Date.now()
    pendingServerIdRef.current.forEach((value, key) => {
      if (!value || now - value.savedAt > PENDING_SERVER_ID_TTL_MS) {
        pendingServerIdRef.current.delete(key)
      }
    })
  }

  const isLikelyUnsyncedEntry = (entry: any, targetDate: string) => {
    if (!entry) return false
    if (!entryMatchesDate(entry, targetDate)) return false
    if (isEntryDeleted(entry)) return false
    if (isEntryPendingSave(entry, targetDate)) return true
    const descKey = normalizedDescription(entry?.description || entry?.name || '')
    if (!descKey) return false
    const entryDbId = (entry as any)?.dbId ? String((entry as any).dbId) : ''
    if (entryDbId) {
      const pending = pendingServerIdRef.current.get(entryDbId)
      if (pending && Date.now() - pending.savedAt < PENDING_SERVER_ID_TTL_MS) return true
      return false
    }
    return true
  }

  const mergeServerEntries = (
    serverEntries: any[],
    localEntries: any[],
    targetDate: string,
    options?: { mode?: 'verify' | 'manual' },
  ) => {
    const serverList = dedupeEntries(serverEntries || [], { fallbackDate: targetDate })
    const localList = Array.isArray(localEntries) ? localEntries : []
    const mode = options?.mode || 'verify'
    const keepLocal = localList.filter((entry) => {
      if (mode === 'manual') {
        return isFreshPendingEntry(entry, targetDate) || isFreshUnsyncedEntry(entry)
      }
      return isLikelyUnsyncedEntry(entry, targetDate)
    })
    return dedupeEntries([...serverList, ...keepLocal], { fallbackDate: targetDate })
  }

  const entryIdentityKey = (entry: any) => {
    const clientId = getEntryClientId(entry)
    if (clientId) return `client:${clientId}`
    const dbId = (entry as any)?.dbId
    if (dbId) return `db:${dbId}`
    if (entry?.id !== null && entry?.id !== undefined) return `id:${entry.id}`
    return ''
  }
  const hasSameEntryMembers = (a: any[], b: any[]) => {
    if (!Array.isArray(a) || !Array.isArray(b)) return false
    if (a.length !== b.length) return false
    const aKeys = a.map(entryIdentityKey).filter(Boolean)
    if (aKeys.length !== a.length) return false
    const aSet = new Set(aKeys)
    if (aSet.size !== a.length) return false
    const localDbByKey = new Map<string, string>()
    a.forEach((entry) => {
      const key = entryIdentityKey(entry)
      if (!key) return
      const dbId = (entry as any)?.dbId
      if (dbId) localDbByKey.set(key, String(dbId))
    })
    for (const entry of b) {
      const key = entryIdentityKey(entry)
      if (!key || !aSet.has(key)) return false
      const mergedDbId = (entry as any)?.dbId
      const localDbId = localDbByKey.get(key) || ''
      if (mergedDbId && !localDbId) return false
    }
    return true
  }

  const mapServerEntriesWithLocalIds = (mappedEntries: any[], localList: any[], targetDate: string) => {
    const descKey = (desc: any) => normalizedDescription(desc)
    const timeBucketKey = (entry: any) => {
      const ts = extractEntryTimestampMs(entry)
      if (Number.isFinite(ts)) return String(Math.round(ts))
      const raw = entry?.time
      if (raw === null || raw === undefined) return ''
      return raw.toString().trim().toLowerCase()
    }
    const clientKey = (entry: any) => {
      const clientId = getEntryClientId(entry)
      return clientId ? `client:${clientId}` : ''
    }
    const buildMergeKey = (entry: any) => {
      const client = clientKey(entry)
      if (client) return client
      const cat = normalizeCategory(entry?.meal || entry?.category || entry?.mealType)
      return [dateKeyForEntry(entry) || targetDate, cat, descKey(entry?.description), timeBucketKey(entry)].join('|')
    }
    const buildLooseMergeKey = (entry: any) =>
      clientKey(entry) ||
      [dateKeyForEntry(entry) || targetDate, descKey(entry?.description), timeBucketKey(entry)].join('|')
    const localByKey = new Map<string, any>()
    const localByLooseKey = new Map<string, any>()
    if (Array.isArray(localList)) {
      for (const entry of localList) {
        if (!entry) continue
        if (isEntryDeleted(entry)) continue
        localByKey.set(buildMergeKey(entry), entry)
        localByLooseKey.set(buildLooseMergeKey(entry), entry)
      }
    }
    return mappedEntries.map((entry: any) => {
      let next = entry
      const pending = pendingServerIdRef.current.get(String((entry as any)?.dbId || ''))
      if (pending && Number.isFinite(pending.localId)) {
        next = { ...next, id: pending.localId }
        pendingServerIdRef.current.delete(String((entry as any)?.dbId || ''))
      }
      let existing = localByKey.get(buildMergeKey(entry))
      if (!existing) {
        const cat = normalizeCategory(entry?.meal || entry?.category || entry?.mealType)
        if (cat === 'uncategorized') {
          const loose = localByLooseKey.get(buildLooseMergeKey(entry))
          if (loose) {
            const looseCat = normalizeCategory(loose?.meal || loose?.category || loose?.mealType)
            if (looseCat && looseCat !== 'uncategorized') {
              next = { ...next, meal: looseCat, category: looseCat, persistedCategory: looseCat }
            }
            existing = loose
          }
        }
      }
      if (existing && typeof existing?.id === 'number' && Number.isFinite(existing.id)) {
        return existing.id === next.id ? next : { ...next, id: existing.id }
      }
      return next
    })
  }

  // Best-effort reload to keep UI in sync with the authoritative DB rows right after saving.
  const refreshEntriesFromServer = async (options?: { mode?: 'verify' | 'manual' }) => {
    const targetDate = selectedDate
    if (!targetDate) return
    if (diaryMergeInFlightRef.current[targetDate]) return
    diaryMergeInFlightRef.current[targetDate] = true
    try {
      prunePendingServerIds()
      const tz = new Date().getTimezoneOffset();
      const res = await fetch(`/api/food-log?date=${targetDate}&tz=${tz}&t=${Date.now()}`, {
        cache: 'no-store',
      });
      if (!res.ok) return;

      const json = await res.json();
      const logs = Array.isArray(json.logs) ? json.logs : [];
      const mapped = mapLogsToEntries(logs, targetDate);
      const localList = isViewingToday
        ? dedupeEntries(todaysFoodsForSelectedDate, { fallbackDate: targetDate })
        : Array.isArray(historyFoods)
        ? historyFoods
        : []
      const mappedWithStableIds = mapServerEntriesWithLocalIds(mapped, localList, targetDate)
      const { filtered: cleanedServerEntries, duplicates: duplicateCandidates } = collapseNearDuplicates(
        mappedWithStableIds,
        targetDate,
      )
      if (options?.mode === 'manual' && duplicateCandidates.length > 0) {
        ;(async () => {
          const ids = duplicateCandidates
            .map((entry) => (entry as any)?.dbId)
            .filter((id) => id !== null && id !== undefined)
            .map((id) => String(id))
          const unique = Array.from(new Set(ids)).slice(0, 12)
          if (unique.length === 0) return
          await Promise.all(
            unique.map((id) =>
              fetch('/api/food-log/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id }),
              }).catch((err) => console.warn('Duplicate cleanup delete failed', err)),
            ),
          )
        })().catch(() => {})
      }
      const merged = mergeServerEntries(cleanedServerEntries, localList, targetDate, options)
      markDiaryVerified(targetDate)
      setFoodDiaryLoaded(true)
      if (hasSameEntryMembers(localList, merged)) {
        return
      }

      if (isViewingToday) {
        updateTodaysFoodsForDate(merged, targetDate)
        updateUserSnapshotForDate(merged, targetDate)
      } else {
        setHistoryFoods(merged)
      }
    } catch (error) {
      console.error('Error refreshing food diary after save:', error);
    } finally {
      diaryMergeInFlightRef.current[targetDate] = false
    }
  };

  // Cross-device sync:
  // - Refresh on focus or manual action (keeps desktop + mobile aligned without constant polling)
  const syncInFlightRef = useRef(false)
  const syncPausedRef = useRef(false)
  const diaryMutationCountRef = useRef(0)
  const beginDiaryMutation = () => {
    diaryMutationCountRef.current += 1
    setIsDiaryMutating(true)
  }
  const endDiaryMutation = () => {
    diaryMutationCountRef.current = Math.max(0, diaryMutationCountRef.current - 1)
    if (diaryMutationCountRef.current === 0) {
      setIsDiaryMutating(false)
    }
  }
  useEffect(() => {
    syncPausedRef.current = Boolean(isSavingEntry || isAnalyzing || isDiaryMutating)
  }, [isSavingEntry, isAnalyzing, isDiaryMutating])
  const refreshDiaryNow = async () => {
    if (diaryRefreshingRef.current) return
    if (syncInFlightRef.current || syncPausedRef.current) return
    syncInFlightRef.current = true
    diaryRefreshingRef.current = true
    setIsDiaryRefreshing(true)
    try {
      await flushPendingFoodLogSaves()
      await refreshEntriesFromServer({ mode: 'manual' })
    } finally {
      syncInFlightRef.current = false
      diaryRefreshingRef.current = false
      setIsDiaryRefreshing(false)
    }
  }
  const PULL_REFRESH_ACTIVATE = 80
  const PULL_REFRESH_THRESHOLD = 320
  const PULL_REFRESH_MAX = 420
  const PULL_REFRESH_START_ZONE = 140
  const getScrollTop = () => {
    if (typeof window === 'undefined') return 0
    const scroller = document.scrollingElement
    if (scroller && Number.isFinite(scroller.scrollTop)) return scroller.scrollTop
    return window.scrollY || 0
  }
  const getScrollParent = (target: EventTarget | null) => {
    if (typeof window === 'undefined') return null
    if (!(target instanceof Element)) return null
    let el: Element | null = target
    while (el && el !== document.body) {
      const style = window.getComputedStyle(el)
      const overflowY = style?.overflowY
      if ((overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 1) {
        return el as HTMLElement
      }
      el = el.parentElement
    }
    return null
  }
  const isEditableElement = (target: EventTarget | null) => {
    if (typeof document === 'undefined') return false
    if (!(target instanceof Element)) return false
    return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'))
  }
  const handlePullStart = (e: React.TouchEvent) => {
    if (typeof window === 'undefined') return
    if (getScrollTop() > 0) return
    if (syncPausedRef.current || diaryRefreshingRef.current) return
    if (isEditableElement(e.target) || isEditableElement(document.activeElement)) return
    const scrollParent = getScrollParent(e.target)
    if (scrollParent && scrollParent.scrollTop > 0) return
    pullOffsetRef.current = 0
    setPullOffset(0)
    const startY = e.touches[0]?.clientY ?? null
    if (startY === null || startY > PULL_REFRESH_START_ZONE) return
    pullScrollParentRef.current = scrollParent
    pullStartYRef.current = startY
  }
  const handlePullMove = (e: React.TouchEvent) => {
    if (pullStartYRef.current === null) return
    if (isEditableElement(e.target) || isEditableElement(document.activeElement)) {
      pullStartYRef.current = null
      pullOffsetRef.current = 0
      pullScrollParentRef.current = null
      setPullOffset(0)
      return
    }
    if (pullScrollParentRef.current && pullScrollParentRef.current.scrollTop > 0) {
      pullStartYRef.current = null
      pullOffsetRef.current = 0
      pullScrollParentRef.current = null
      setPullOffset(0)
      return
    }
    if (typeof window !== 'undefined' && getScrollTop() > 0) {
      pullStartYRef.current = null
      pullOffsetRef.current = 0
      pullScrollParentRef.current = null
      setPullOffset(0)
      return
    }
    const currentY = e.touches[0]?.clientY ?? 0
    const delta = currentY - (pullStartYRef.current || 0)
    if (delta <= PULL_REFRESH_ACTIVATE) {
      pullOffsetRef.current = 0
      setPullOffset(0)
      return
    }
    const nextOffset = Math.min(PULL_REFRESH_MAX, delta - PULL_REFRESH_ACTIVATE)
    pullOffsetRef.current = nextOffset
    setPullOffset(nextOffset)
  }
  const handlePullEnd = async () => {
    if (pullStartYRef.current === null) return
    const shouldRefresh = pullOffsetRef.current >= PULL_REFRESH_THRESHOLD
    pullStartYRef.current = null
    pullOffsetRef.current = 0
    pullScrollParentRef.current = null
    setPullOffset(0)
    if (shouldRefresh) {
      await refreshDiaryNow()
    }
  }
  const autoDiaryRefreshEnabled = false
  useEffect(() => {
    if (!autoDiaryRefreshEnabled) return
    if (typeof window === 'undefined') return
    if (!diaryHydrated) return
    if (editingEntry) return

    const onFocus = () => refreshDiaryNow()
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refreshDiaryNow()
    }

    // Initial sync shortly after mount/date switch
    const initial = window.setTimeout(refreshDiaryNow, 600)
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      window.clearTimeout(initial)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [autoDiaryRefreshEnabled, selectedDate, isViewingToday, diaryHydrated, editingEntry?.id])

  // Save food entries to database and update context (OPTIMIZED + RELIABLE HISTORY)
  const saveFoodEntries = async (
    updatedFoods: any[],
    options?: {
      appendHistory?: boolean
      suppressToast?: boolean
      snapshotDateOverride?: string
      allowDuplicate?: boolean
      // When deletes use the atomic server delete endpoint, we already updated the server
      // snapshot as part of that request. Keep local caching behavior but skip duplicate POSTs.
      skipServerSnapshot?: boolean
    },
  ) => {
	    try {
      // When the user intentionally saves, clear any tombstones for matching entries so
      // re-adding the same meal on purpose is allowed.
      removeDeletedTombstonesForEntries(updatedFoods)
      // 1) Deduplicate before updating context to prevent duplicates
      const seenIds = new Set<string>()
      const uniqueById = updatedFoods.filter((food: any) => {
        const idKey = String(food?.id ?? '')
        if (!idKey) return true
        if (seenIds.has(idKey)) {
          console.log('⚠️ Duplicate entry detected in saveFoodEntries, removing:', idKey)
          return false
        }
        seenIds.add(idKey)
        return true
      })
      const initialLatest =
        Array.isArray(uniqueById) && uniqueById.length > 0 ? uniqueById[0] : null
      const dedupeTargetDate =
        (initialLatest?.localDate && typeof initialLatest.localDate === 'string' && initialLatest.localDate.length >= 8
          ? initialLatest.localDate
          : selectedDate) || ''
	      const dedupedFoods = dedupeEntries(uniqueById, { fallbackDate: dedupeTargetDate })
	      
	      // IMPORTANT: `todaysFoods` is used as a cross-day cache (filtered by `localDate`).
	      // Never replace it with only the entries from the current operation, or other days can
	      // "disappear" (especially if they haven't been persisted to FoodLog yet).
	      const existingSnapshotFoods = Array.isArray((userData as any)?.todaysFoods)
	        ? ((userData as any).todaysFoods as any[])
	        : []
	      const mergedSnapshotFoods = dedupeEntries(
	        [...dedupedFoods, ...existingSnapshotFoods],
	        { fallbackDate: dedupeTargetDate },
	      )
	      
	      // 2) Update context immediately for instant UI updates (with merged cache)
	      updateUserData({ todaysFoods: mergedSnapshotFoods })
	      console.log('🚀 PERFORMANCE: Food updated in cache instantly - UI responsive!', {
	        originalCount: updatedFoods.length,
	        dedupedCount: dedupedFoods.length
	      })

      // We only want to create a new history row when this save represents
      // a *new* entry (not edits or deletes). Callers pass appendHistory: false
      // for edits/deletes.
      const appendHistory = options?.appendHistory !== false

	      // Determine which entry is "new" for FoodLog writes (avoid saving an older entry when the list order changes).
	      const previousIds = new Set<string>(
	        existingSnapshotFoods.map((food: any) => String(food?.id ?? '')).filter((v: string) => Boolean(v)),
	      )
	      const addedCandidates = dedupedFoods.filter((food: any) => {
	        const idKey = String(food?.id ?? '')
	        return Boolean(idKey) && !previousIds.has(idKey)
	      })
	      const pickMostRecent = (list: any[]) => {
	        let best: any = null
	        let bestTs = -Infinity
	        for (const item of list) {
	          const ts = extractEntryTimestampMs(item)
	          if (Number.isFinite(ts) && ts > bestTs) {
	            bestTs = ts
	            best = item
	          }
	        }
	        return best
	      }
	      // Prefer a newly-added entry for the currently selected calendar day; fall back to most-recent add.
	      const latestAddedForSelectedDate = pickMostRecent(
	        addedCandidates.filter((it: any) => entryMatchesDate(it, selectedDate)),
	      )
	      const latest = latestAddedForSelectedDate || pickMostRecent(addedCandidates) || (dedupedFoods[0] ?? initialLatest)
	      const targetLocalDate =
	        latest && typeof latest?.localDate === 'string' && latest.localDate.length >= 8
	          ? latest.localDate
	          : selectedDate
      // Anchor createdAt to the selected/target local date to avoid drift across adjacent days.
      const anchoredCreatedAt = alignTimestampToLocalDate(
        latest?.createdAt || new Date().toISOString(),
        targetLocalDate,
      )

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

	      const snapshotFoods = mergedSnapshotFoods

      // 2) Persist today's foods snapshot (fast "today" view) via /api/user-data.
      // Some flows (atomic delete) already updated the server snapshot in the same request.
      if (options?.skipServerSnapshot !== true) {
        await syncSnapshotToServer(snapshotFoods, options?.snapshotDateOverride ?? selectedDate)
      }

      // 3) For brand new entries, write directly into the permanent FoodLog history table.
      //    If the write fails, enqueue the payload locally and surface a retry button.
      if (appendHistory && latest) {
        try {
          setHistorySaveError(null)
          const payload = {
            description: (latest?.description || '').toString(),
            nutrition: buildPayloadNutrition(latest),
            imageUrl: latest?.photo || null,
            items: Array.isArray(latest?.items) && latest.items.length > 0 ? latest.items : null,
            meal: normalizeCategory(latest?.meal || latest?.category || latest?.mealType),
            category: normalizeCategory(latest?.meal || latest?.category || latest?.mealType),
            // Always pin to the calendar date the user was viewing when they saved
            localDate: targetLocalDate,
            createdAt: anchoredCreatedAt,
            allowDuplicate: options?.allowDuplicate === true,
          }
          setLastHistoryPayload(payload)

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
            setHistorySaveError('Saving your meal to history failed. Keep this tab open; trying fallback now.')
            console.error('❌ Failed to save entry to FoodLog:', {
              status: res.status,
              statusText: res.statusText,
              error: errorText,
              payload: {
                localDate: payload.localDate,
                descriptionPreview: payload.description.substring(0, 50),
              },
            })
            // Queue the payload for retry
            setPendingQueue((q) => [...q, payload])
            throw new Error('History save failed')
          } else {
            const result = await res.json().catch(() => ({}))
            console.log('✅ Successfully saved entry to FoodLog:', {
              localDate: payload.localDate,
              foodLogId: result.id,
              descriptionPreview: payload.description.substring(0, 50),
            })
            // Attach the real DB id to the newest entry so deletes always work (even for favorites).
          if (result?.id) {
            const localId = Number(latest?.id)
            if (Number.isFinite(localId)) {
              pendingServerIdRef.current.set(String(result.id), {
                localId,
                savedAt: Date.now(),
              })
            }
            const matchesLatest = (food: any) => {
              if (!food) return false
              const latestClientId = getEntryClientId(latest)
              if (latestClientId) {
                return getEntryClientId(food) === latestClientId
              }
              if (food?.id === latest?.id) return true
              const latestDate = dateKeyForEntry(latest) || targetLocalDate
              const foodDate = dateKeyForEntry(food) || ''
              if (latestDate && foodDate && latestDate !== foodDate) return false
              const latestCat = normalizeCategory(latest?.meal || latest?.category || latest?.mealType)
              const foodCat = normalizeCategory(food?.meal || food?.category || food?.mealType)
              if (latestCat !== foodCat) return false
              const latestDesc = normalizedDescription(latest?.description || latest?.name || '')
              const foodDesc = normalizedDescription(food?.description || food?.name || '')
              if (!latestDesc || latestDesc !== foodDesc) return false
              const latestTimeKey = entryTimestampKey(latest)
              const foodTimeKey = entryTimestampKey(food)
              if (latestTimeKey && foodTimeKey && latestTimeKey !== foodTimeKey) return false
              return true
            }
            const withDbId = snapshotFoods.map((food) =>
              food?.dbId || !matchesLatest(food) ? food : { ...food, dbId: result.id },
            )
              if (isViewingToday) {
                setTodaysFoods(withDbId)
                updateUserData({ todaysFoods: withDbId })
              } else {
                setHistoryFoods((prev) => {
                  const base = Array.isArray(prev) ? prev : []
                  return base.map((food) =>
                    food?.dbId || !matchesLatest(food) ? food : { ...food, dbId: result.id },
                  )
                })
              }
            }
            setHistorySaveError(null)
            setLastHistoryPayload(null)
            setPendingQueue([])
            setHistorySaveError(null)
          }
        } catch (historyError) {
          console.error('❌ Exception while saving to FoodLog:', {
            error: historyError,
            message: historyError instanceof Error ? historyError.message : String(historyError),
            stack: historyError instanceof Error ? historyError.stack : undefined,
            targetLocalDate,
          })
          setHistorySaveError('Saving your meal to history failed. We\'ll keep retrying until it sticks.')
          // Queue the payload for retry if it exists
          if (lastHistoryPayload) {
            setPendingQueue((q) => [...q, lastHistoryPayload])
          }
        }
      } else {
        console.log('ℹ️ Skipping FoodLog save (appendHistory=false or no latest entry)')
      }

      // 4) Show a brief visual confirmation (skip when callers opt out, e.g., deletes)
      try {
        if (!options?.suppressToast) {
          setShowSavedToast(true)
          setTimeout(() => setShowSavedToast(false), 1500)
        }
      } catch {}
    } catch (error) {
      console.error('❌ Fatal error in saveFoodEntries:', {
        error,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })
      setHistorySaveError('Saving your meal to history failed. Please stay on this page and retry saving.')
    }
  }

  const syncSnapshotOnly = async (entries: any[], snapshotDate: string) => {
    try {
      const dedupeTargetDate = snapshotDate || selectedDate
      const existingSnapshotFoods = Array.isArray((userData as any)?.todaysFoods)
        ? ((userData as any).todaysFoods as any[])
        : []
      const mergedSnapshotFoods = mergeSnapshotForDate(existingSnapshotFoods, entries, dedupeTargetDate)
      updateUserData({ todaysFoods: mergedSnapshotFoods })
      await syncSnapshotToServer(mergedSnapshotFoods, dedupeTargetDate)
    } catch (err) {
      console.warn('Snapshot-only sync failed', err)
    }
  }

  const retryHistorySave = async () => {
    const payload = lastHistoryPayload || pendingQueue[0]
    if (!payload || historyRetrying) return
    try {
      setHistoryRetrying(true)
      const res = await fetch('/api/food-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const errorText = await res.text()
        console.error('❌ Retry history save failed:', { status: res.status, statusText: res.statusText, error: errorText })
        setHistorySaveError('Retry failed. Keep this tab open and try again.')
        return
      }
      setHistorySaveError(null)
      setLastHistoryPayload(null)
       setPendingQueue((q) => q.filter((p) => p !== payload))
      console.log('✅ Retry history save succeeded')
    } catch (e) {
      console.error('❌ Retry history save exception:', e)
      setHistorySaveError('Retry failed. Keep this tab open and try again.')
    } finally {
      setHistoryRetrying(false)
    }
  }

  // Background flush for any queued payloads (best-effort)
  useEffect(() => {
    if (pendingQueue.length === 0 || isFlushingQueue) return
    let isCancelled = false
    const flush = async () => {
      try {
        setIsFlushingQueue(true)
        const next = [...pendingQueue]
        for (const payload of next) {
          try {
            const res = await fetch('/api/food-log', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            })
            if (res.ok) {
              console.log('✅ Flushed pending FoodLog payload', { localDate: payload.localDate })
              setPendingQueue((q) => q.filter((p) => p !== payload))
              setHistorySaveError(null)
              setLastHistoryPayload(null)
            } else {
              const text = await res.text()
              console.warn('⚠️ Flush failed, keeping in queue', { status: res.status, text })
              setHistorySaveError('Saving your meal to history failed. We\'ll keep retrying until it sticks.')
            }
          } catch (e) {
            console.warn('⚠️ Flush threw, keeping in queue', e)
            setHistorySaveError('Saving your meal to history failed. We\'ll keep retrying until it sticks.')
          }
          if (isCancelled) break
        }
      } finally {
        setIsFlushingQueue(false)
      }
    }
    flush()
    return () => {
      isCancelled = true
    }
  }, [pendingQueue, isFlushingQueue])

  useEffect(() => {
    photoPreviewRef.current = photoPreview
  }, [photoPreview])

  useEffect(() => {
    if (!photoPreview) return
    setFoodImagesLoading((prev) => {
      if (prev[photoPreview]) return prev
      return { ...prev, [photoPreview]: true }
    })
  }, [photoPreview])

  const refreshEditingEntryPhoto = async () => {
    if (!editingEntry) return
    const dbId = (editingEntry as any)?.dbId
    const key = dbId !== null && dbId !== undefined ? String(dbId) : ''
    if (!key) return
    if (photoRefreshAttemptedRef.current[key]) return
    photoRefreshAttemptedRef.current[key] = true
    try {
      const tz = new Date().getTimezoneOffset()
      const dateValue =
        typeof (editingEntry as any)?.localDate === 'string' && (editingEntry as any).localDate
          ? (editingEntry as any).localDate
          : selectedDate
      if (!dateValue) return
      const res = await fetch(
        `/api/food-log?date=${encodeURIComponent(dateValue)}&tz=${tz}&t=${Date.now()}`,
        { cache: 'no-store' },
      )
      if (!res.ok) return
      const json = await res.json()
      const logs = Array.isArray(json.logs) ? json.logs : []
      const match = logs.find((log: any) => String(log?.id ?? '') === key)
      const nextPhoto = typeof match?.imageUrl === 'string' ? match.imageUrl : ''
      if (!nextPhoto) return
      setPhotoPreview(nextPhoto)
      setEditingEntry((prev: any) => (prev ? { ...prev, photo: nextPhoto } : prev))
      setOriginalEditingEntry((prev: any) =>
        prev && String((prev as any)?.dbId ?? '') === key ? { ...prev, photo: nextPhoto } : prev,
      )
      setTodaysFoods((prev: any[]) =>
        prev.map((entry: any) => (String(entry?.dbId ?? '') === key ? { ...entry, photo: nextPhoto } : entry)),
      )
      setHistoryFoods((prev: any) =>
        Array.isArray(prev)
          ? prev.map((entry: any) => (String(entry?.dbId ?? '') === key ? { ...entry, photo: nextPhoto } : entry))
          : prev,
      )
    } catch {}
  }

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const shouldAutoAnalyze = autoAnalyzeLabelPhoto && Boolean(barcodeLabelFlow?.barcode);
      const preserveLabelDetail = shouldAutoAnalyze || analysisMode === 'packaged';
      try {
        // Compress the uploaded file to balance quality and cost (higher quality for better detection)
        const compressedFile = preserveLabelDetail ? file : await compressImage(file, 1024, 0.85);
        setPhotoFile(compressedFile);
        setAnalysisHint('');
        resetAnalysisFeedbackState();
        const reader = new FileReader();
        reader.onload = (e) => {
          setPhotoPreview(e.target?.result as string);
          setShowAddFood(true);
          setShowAiResult(false);
          setIsEditingDescription(false);
          setPhotoOptionsAnchor(null);
          // Keep the analysis mode modal visible so the 🤖 Analyze button stays in view after picking
          setShowAnalysisModeModal(!shouldAutoAnalyze && !isAnalysisRoute);
          if (shouldAutoAnalyze) {
            setAutoAnalyzeLabelPhoto(false);
            if (barcodeLabelTimeoutRef.current) {
              clearTimeout(barcodeLabelTimeoutRef.current);
              barcodeLabelTimeoutRef.current = null;
            }
            setTimeout(() => {
              analyzePhoto(compressedFile);
            }, 0);
          }
        };
        reader.readAsDataURL(compressedFile);
      } catch (error) {
        console.error('Error compressing image:', error);
        // Fallback to original file if compression fails
        setPhotoFile(file);
        setAnalysisHint('');
        resetAnalysisFeedbackState();
        const reader = new FileReader();
        reader.onload = (e) => {
          setPhotoPreview(e.target?.result as string);
          setShowAddFood(true);
          setShowAiResult(false);
          setIsEditingDescription(false);
          setPhotoOptionsAnchor(null);
          setShowAnalysisModeModal(!shouldAutoAnalyze && !isAnalysisRoute);
          if (shouldAutoAnalyze) {
            setAutoAnalyzeLabelPhoto(false);
            if (barcodeLabelTimeoutRef.current) {
              clearTimeout(barcodeLabelTimeoutRef.current);
              barcodeLabelTimeoutRef.current = null;
            }
            setTimeout(() => {
              analyzePhoto(file);
            }, 0);
          }
        };
        reader.readAsDataURL(file);
      }
      setPendingPhotoPicker(false);
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

  const handleReplacePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    const targetIndex = photoReplaceTargetRef.current
    if (!file || targetIndex === null || targetIndex === undefined) return
    setReplacePhotoLoading(true)
    setReplacePhotoError(null)
    try {
      const preserveLabelDetail = officialSource === 'packaged'
      const compressedFile = preserveLabelDetail ? file : await compressImage(file, 1024, 0.85)
      const formData = new FormData()
      formData.append('image', compressedFile)
      formData.append('analysisMode', preserveLabelDetail ? 'packaged' : 'meal')
      formData.append('forceFresh', '1')
      const response = await fetch('/api/analyze-food', {
        method: 'POST',
        body: formData,
      })
      if (response.status === 402) {
        const errorData = await response.json().catch(() => null)
        const msg = errorData?.message || errorData?.error || 'Not enough credits to analyze that photo.'
        setReplacePhotoError(msg)
        return
      }
      if (response.status === 401) {
        setReplacePhotoError('Please sign in to analyze a photo.')
        return
      }
      if (!response.ok) {
        const text = await response.text().catch(() => '')
        throw new Error(text || 'Photo analysis failed')
      }
      const result = await response.json()
      const items = Array.isArray(result?.items) ? result.items : []
      if (items.length === 0) {
        setReplacePhotoError('No food detected in that photo. Try a clearer photo or use search.')
        return
      }
      const currentServings = getItemServings(analyzedItems?.[targetIndex])
      const base = { ...items[0], servings: currentServings }
      const nextItem = finalizeIngredientItem(base)
      nextItem.dbLocked = true
      replaceIngredientAtIndex(targetIndex, nextItem, `Updated to ${nextItem.name}`)
    } catch (err) {
      console.error('Replace photo analysis failed', err)
      setReplacePhotoError('Photo analysis failed. Please try again.')
    } finally {
      setReplacePhotoLoading(false)
      photoReplaceTargetRef.current = null
      if (replacePhotoInputRef.current) replacePhotoInputRef.current.value = ''
    }
  }

  const parseServingSizeInfo = (item: any) => {
    const raw = (item?.serving_size && String(item.serving_size)) || ''
    const parseRange = (pattern: RegExp, factor = 1) => {
      const rangeMatch = raw.match(pattern)
      if (!rangeMatch) return null
      const start = parseFloat(rangeMatch[1])
      const end = parseFloat(rangeMatch[2])
      if (!Number.isFinite(start) || !Number.isFinite(end)) return null
      return ((start + end) / 2) * factor
    }
    const parseSingle = (pattern: RegExp, factor = 1) => {
      const match = raw.match(pattern)
      if (!match) return null
      const value = parseFloat(match[1])
      return Number.isFinite(value) ? value * factor : null
    }

    const gramsRange = parseRange(/(\d+(?:\.\d+)?)\s*(?:-|to)\s*(\d+(?:\.\d+)?)\s*g\b/i)
    const gramsMatch = parseSingle(/(\d+(?:\.\d+)?)\s*g\b/i)
    const mlRange = parseRange(/(\d+(?:\.\d+)?)\s*(?:-|to)\s*(\d+(?:\.\d+)?)\s*ml\b/i)
    const mlMatch = parseSingle(/(\d+(?:\.\d+)?)\s*ml\b/i)
    const ozRange = parseRange(/(\d+(?:\.\d+)?)\s*(?:-|to)\s*(\d+(?:\.\d+)?)\s*(?:oz|ounce|ounces)\b/i)
    const ozMatch = parseSingle(/(\d+(?:\.\d+)?)\s*(oz|ounce|ounces)\b/i)
    const lbRange = parseRange(/(\d+(?:\.\d+)?)\s*(?:-|to)\s*(\d+(?:\.\d+)?)\s*(?:lb|lbs|pound|pounds)\b/i, 453.592)
    const lbMatch = parseSingle(/(\d+(?:\.\d+)?)\s*(lb|lbs|pound|pounds)\b/i, 453.592)

    const gramsFromOzRange = Number.isFinite(ozRange as number) ? (ozRange as number) * 28.3495 : null
    const gramsFromOzMatch = Number.isFinite(ozMatch as number) ? (ozMatch as number) * 28.3495 : null
    const gramsPerServing =
      gramsRange ??
      gramsMatch ??
      lbRange ??
      lbMatch ??
      gramsFromOzRange ??
      gramsFromOzMatch ??
      null
    const mlPerServing = mlRange ?? mlMatch ?? null
    const ozPerServing = ozRange ?? ozMatch ?? null
    const gramsFromOz = ozPerServing ? ozPerServing * 28.3495 : null
    return {
      label: raw,
      gramsPerServing:
        gramsPerServing && gramsPerServing > 0
          ? gramsPerServing
          : gramsFromOz && gramsFromOz > 0
          ? gramsFromOz
          : null,
      mlPerServing: mlPerServing && mlPerServing > 0 ? mlPerServing : null,
      ozPerServing: ozPerServing && ozPerServing > 0 ? ozPerServing : null,
    }
  }

  const getDiscreteWeightFloor = (item: any) => {
    if (analysisMode === 'packaged') return null
    const pieces = getPiecesPerServing(item)
    if (!pieces || pieces <= 1) return null
    const perPiece = defaultGramsForItem(item)
    if (!perPiece || perPiece <= 0) return null
    return perPiece * pieces
  }

  // Get base weight per 1 serving in the item's current weightUnit (defaults to grams)
  const getBaseWeightPerServing = (item: any): number | null => {
    const info = parseServingSizeInfo(item)
    const unit = item?.weightUnit === 'ml' ? 'ml' : item?.weightUnit === 'oz' ? 'oz' : 'g'
    const estimatedGrams = estimateGramsPerServing(item)
    const piecesMultiplier = piecesMultiplierForServing(item)
    const fallbackDefault = defaultGramsForItem(item)
    const discreteFloor = getDiscreteWeightFloor(item)
    if (unit === 'ml') {
      if (Number.isFinite(item?.customMlPerServing)) return Number(item.customMlPerServing)
      if (info.mlPerServing && info.mlPerServing > 0) return info.mlPerServing * piecesMultiplier
      if (info.gramsPerServing && info.gramsPerServing > 0) return info.gramsPerServing * piecesMultiplier // assume ~1g/mL fallback
      if (fallbackDefault && fallbackDefault > 0) return fallbackDefault * Math.max(1, piecesMultiplier)
      if (estimatedGrams && estimatedGrams > 0) return estimatedGrams * Math.max(1, piecesMultiplier)
    } else if (unit === 'oz') {
      if (Number.isFinite(item?.customGramsPerServing)) return Number(item.customGramsPerServing) / 28.3495
      if (info.gramsPerServing && info.gramsPerServing > 0) return (info.gramsPerServing * piecesMultiplier) / 28.3495
      if (info.mlPerServing && info.mlPerServing > 0) return (info.mlPerServing * piecesMultiplier) / 28.3495
      if (fallbackDefault && fallbackDefault > 0) return (fallbackDefault * Math.max(1, piecesMultiplier)) / 28.3495
      if (estimatedGrams && estimatedGrams > 0) return (estimatedGrams * Math.max(1, piecesMultiplier)) / 28.3495
    } else {
      // grams
      if (Number.isFinite(item?.customGramsPerServing)) return Number(item.customGramsPerServing)
      if (discreteFloor && discreteFloor > 0) {
        if (info.gramsPerServing && info.gramsPerServing > 0) {
          if (info.gramsPerServing < discreteFloor) return discreteFloor
        } else {
          return discreteFloor
        }
      }
      if (info.gramsPerServing && info.gramsPerServing > 0) return info.gramsPerServing * piecesMultiplier
      if (fallbackDefault && fallbackDefault > 0) return fallbackDefault * Math.max(1, piecesMultiplier)
      if (info.mlPerServing && info.mlPerServing > 0) return info.mlPerServing * piecesMultiplier // assume ~1g/mL fallback
      if (estimatedGrams && estimatedGrams > 0) return estimatedGrams * Math.max(1, piecesMultiplier)
    }
    // Fallback: infer from current weightAmount and servings if present
    const servings = Number.isFinite(Number(item?.servings)) ? Number(item.servings) : null
    const weightAmount = Number.isFinite(Number(item?.weightAmount)) ? Number(item.weightAmount) : null
    if (servings && servings > 0 && weightAmount && weightAmount > 0) {
      const per = weightAmount / servings
      if (per > 0) return per
    }
    return null
  }

  // Estimate grams per serving when no explicit weight/volume is available.
  const estimateGramsPerServing = (item: any): number | null => {
    const { gramsPerServing, mlPerServing } = parseServingSizeInfo(item)
    const hasKnownWeight = (gramsPerServing && gramsPerServing > 0) || (mlPerServing && mlPerServing > 0)
    const discreteFloor = getDiscreteWeightFloor(item)
    if (hasKnownWeight) {
      const base = gramsPerServing ?? mlPerServing ?? null
      const multiplier = piecesMultiplierForServing(item)
      const known = base && base > 0 ? base * multiplier : base
      if (discreteFloor && Number.isFinite(known) && known && known < discreteFloor) {
        return discreteFloor
      }
      return known
    }

    const calories = Number(item?.calories)
    const protein = Number(item?.protein_g)
    const carbs = Number(item?.carbs_g)
    const fat = Number(item?.fat_g)
    const fiber = Number(item?.fiber_g)

    const safe = (v: number) => (Number.isFinite(v) && v > 0 ? v : 0)
    const macroGrams = safe(protein) + safe(carbs) + safe(fat) + safe(fiber)
    const fatEnergy = safe(fat) * 9
    const otherEnergy = (safe(protein) + safe(carbs)) * 4
    const macroEnergy = fatEnergy + otherEnergy
    const fatRatio = macroEnergy > 0 ? fatEnergy / macroEnergy : 0

    let estimated: number | null = null

    if (Number.isFinite(calories) && calories > 0) {
      // Typical foods cluster around 1.8–2.5 kcal/g depending on fat content.
      let energyDensity = 2.1
      if (fatRatio > 0.6) energyDensity = 2.5
      else if (fatRatio > 0.4) energyDensity = 2.3
      else energyDensity = 2.0
      estimated = calories / energyDensity
    }

    if (estimated !== null && macroGrams > 0) {
      // Do not let estimate drop below macro mass (with a small buffer for water/other mass).
      estimated = Math.max(estimated, macroGrams * 1.1)
    } else if (estimated === null && macroGrams > 0) {
      // If calories missing but macros exist, assume moderate density to avoid zero weight.
      estimated = macroGrams * 1.8
    }

    if (!estimated || !Number.isFinite(estimated)) return null

    if (isDessertPortionItem(item)) {
      estimated = clampDessertPortionWeight(estimated)
    }

    // If we know there are multiple pieces in this "one serving", scale the weight to cover all pieces.
    const piecesMultiplier = piecesMultiplierForServing(item)
    if (piecesMultiplier > 1) estimated = estimated * piecesMultiplier
    if (discreteFloor && estimated < discreteFloor) {
      estimated = discreteFloor
    }

    const clamped = Math.min(Math.max(estimated, 5), 1200) // 5g–1200g sane bounds
    return Math.round(clamped * 100) / 100
  }

  const effectiveServings = (item: any) => {
    const mode = item?.portionMode === 'weight' ? 'weight' : 'servings'
    const baseServings = item?.servings && Number.isFinite(item.servings) && item.servings > 0 ? item.servings : 1

    if (mode !== 'weight') return baseServings

    const { gramsPerServing, mlPerServing } = parseServingSizeInfo(item)
    const customGrams = Number.isFinite(item?.customGramsPerServing) ? Number(item.customGramsPerServing) : null
    const customMl = Number.isFinite(item?.customMlPerServing) ? Number(item.customMlPerServing) : null
    const weight = Number.isFinite(item?.weightAmount) ? Number(item.weightAmount) : null
    const unit = item?.weightUnit === 'ml' ? 'ml' : item?.weightUnit === 'oz' ? 'oz' : 'g'

    if (!weight || weight <= 0) return baseServings

    if (unit === 'g') {
      const denominator = customGrams && customGrams > 0 ? customGrams : gramsPerServing
      if (denominator && denominator > 0) return Math.max(0, weight / denominator)
    } else if (unit === 'ml') {
      const denominator = customMl && customMl > 0 ? customMl : mlPerServing
      if (denominator && denominator > 0) return Math.max(0, weight / denominator)
    } else if (unit === 'oz') {
      const denominator =
        customGrams && customGrams > 0
          ? customGrams
          : gramsPerServing
          ? gramsPerServing
          : null
      if (denominator && denominator > 0) {
        const gramsWeight = weight * 28.3495
        return Math.max(0, gramsWeight / denominator)
      }
    }

    // Fallback to base servings if we lack conversion data
    return baseServings
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
      const servings = effectiveServings(item)
      const multiplier = macroMultiplierForItem(item)
      totals.calories += (item.calories || 0) * servings * multiplier
      totals.protein += (item.protein_g || 0) * servings * multiplier
      totals.carbs += (item.carbs_g || 0) * servings * multiplier
      totals.fat += (item.fat_g || 0) * servings * multiplier
      totals.fiber += (item.fiber_g || 0) * servings * multiplier
      totals.sugar += (item.sugar_g || 0) * servings * multiplier
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

  const applyDrinkOverrideToItems = (
    items: any[] | null | undefined,
    override: DrinkAmountOverride | null,
  ): { items: any[] | null; totals: NutritionTotals | null; used: boolean } => {
    if (!override || !Array.isArray(items) || items.length !== 1) {
      return { items: Array.isArray(items) ? items : null, totals: null, used: false }
    }
    const baseItem = items[0]
    if (!baseItem) return { items, totals: null, used: false }
    const info = parseServingSizeInfo(baseItem)
    const isLiquid = isLikelyLiquidFood(String(baseItem?.name || ''), String(baseItem?.serving_size || ''))
    const customMl =
      Number.isFinite(Number(baseItem?.customMlPerServing)) && Number(baseItem.customMlPerServing) > 0
        ? Number(baseItem.customMlPerServing)
        : null
    const customGrams =
      Number.isFinite(Number(baseItem?.customGramsPerServing)) && Number(baseItem.customGramsPerServing) > 0
        ? Number(baseItem.customGramsPerServing)
        : null
    let baseMl =
      customMl ||
      info.mlPerServing ||
      (info.ozPerServing ? info.ozPerServing * 29.5735 : null)
    if (!baseMl && isLiquid) {
      const grams = customGrams || info.gramsPerServing
      if (grams && grams > 0) baseMl = grams
    }
    if (!baseMl || !Number.isFinite(baseMl) || baseMl <= 0) {
      return { items, totals: null, used: false }
    }
    const factor = override.amountMl / baseMl
    if (!Number.isFinite(factor) || factor <= 0) {
      return { items, totals: null, used: false }
    }

    const scaleMacro = (value: any, decimals: number) => {
      const numeric = Number(value)
      if (!Number.isFinite(numeric)) return null
      const scaled = numeric * factor
      if (!Number.isFinite(scaled)) return null
      const precision = Math.pow(10, decimals)
      return Math.round(scaled * precision) / precision
    }

    const next = {
      ...baseItem,
      serving_size: formatDrinkOverrideLabel(override),
      calories: scaleMacro(baseItem?.calories, 0),
      protein_g: scaleMacro(baseItem?.protein_g, 1),
      carbs_g: scaleMacro(baseItem?.carbs_g, 1),
      fat_g: scaleMacro(baseItem?.fat_g, 1),
      fiber_g: scaleMacro(baseItem?.fiber_g, 1),
      sugar_g: scaleMacro(baseItem?.sugar_g, 1),
      servings: 1,
    }

    if (override.unit === 'oz') {
      next.weightUnit = 'oz'
      next.weightAmount = Math.round(override.amount * 100) / 100
      next.customMlPerServing = null
      next.customGramsPerServing = null
    } else {
      next.weightUnit = 'ml'
      next.weightAmount = Math.round(override.amountMl * 10) / 10
      next.customMlPerServing = Math.round(override.amountMl * 10) / 10
      next.customGramsPerServing = null
    }

    const updatedItems = [next]
    const totals = recalculateNutritionFromItems(updatedItems)
    return { items: updatedItems, totals, used: true }
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

  const buildFeedbackHint = (baseHint: string, comment: string) => {
    const trimmedBase = String(baseHint || '').trim()
    const trimmedComment = String(comment || '').trim()
    if (!trimmedComment) return trimmedBase
    if (!trimmedBase) return `User feedback: ${trimmedComment}`
    if (trimmedBase.toLowerCase().includes(trimmedComment.toLowerCase())) return trimmedBase
    return `${trimmedBase}\nUser feedback: ${trimmedComment}`
  }

  const analyzePhoto = async (
    fileOverride?: File,
    options?: {
      feedbackRescan?: boolean
      feedbackReasons?: string[]
      feedbackFocusItem?: string | null
      feedbackComment?: string | null
    },
  ) => {
    const isFeedbackRescan = Boolean(options?.feedbackRescan)
    const fileToAnalyze = fileOverride || photoFile
    if (!fileToAnalyze) return;

    const previousSnapshot = isFeedbackRescan
      ? {
          items: Array.isArray(analyzedItems) ? analyzedItems.map((item) => ({ ...item })) : [],
          totals: analyzedNutrition ? { ...analyzedNutrition } : null,
          description: aiDescription,
        }
      : null
    
    setShowAnalysisModeModal(false);
    setIsAnalyzing(true);
    setAnalysisPhase('preparing');

    // Desktop UX: auto-scroll to the top so the user can see the analysis UI/progress immediately.
    try {
      if (typeof window !== 'undefined') {
        const isDesktop = window.matchMedia ? window.matchMedia('(min-width: 768px)').matches : true
        if (isDesktop) {
          window.requestAnimationFrame(() => {
            window.scrollTo({ top: 0, behavior: 'smooth' })
          })
        }
      }
    } catch {}
    
    try {
      console.log('🔍 AGENT #6 DEBUG: Starting photo analysis...');
      console.log('📊 Original file:', { 
        name: fileToAnalyze.name, 
        size: fileToAnalyze.size, 
        type: fileToAnalyze.type 
      });
      
      // Step 1: Compress image (with better error handling)
      let compressedFile;
      const wantsLabelAccuracy = analysisMode === 'packaged' || Boolean(barcodeLabelFlow?.barcode)
      try {
        if (wantsLabelAccuracy) {
          compressedFile = fileToAnalyze
        } else {
          const targetWidth = 800
          const targetQuality = 0.8
          compressedFile = await compressImage(fileToAnalyze, targetWidth, targetQuality); // Less aggressive compression
        }
        console.log('✅ Image compression successful:', {
          originalSize: fileToAnalyze.size,
          compressedSize: compressedFile.size,
          reduction: Math.round((1 - compressedFile.size/fileToAnalyze.size) * 100) + '%'
        });
      } catch (compressionError) {
        console.warn('⚠️ Image compression failed, using original:', compressionError);
        compressedFile = fileToAnalyze; // Fallback to original file
      }
      
      // Step 2: Create FormData
      console.log('📤 Creating FormData for upload...');
      const formData = new FormData();
      formData.append('image', compressedFile);
      formData.append('analysisMode', analysisMode);
      formData.append('forceFresh', '1');
      if (wantsLabelAccuracy) {
        formData.append('labelScan', '1');
      }
      const feedbackComment = String(options?.feedbackComment || '').trim()
      const combinedHint = buildFeedbackHint(analysisHint, feedbackComment)
      if (combinedHint && analysisMode !== 'packaged') {
        formData.append('analysisHint', combinedHint)
      }
      const feedbackRescan = Boolean(options?.feedbackRescan)
      const feedbackReasons = Array.isArray(options?.feedbackReasons)
        ? options?.feedbackReasons.filter(Boolean)
        : []
      const feedbackFocusItem = String(options?.feedbackFocusItem || '').trim()
      if (feedbackRescan) {
        formData.append('feedbackDown', '1')
        if (feedbackReasons.length > 0) {
          formData.append('feedbackReasons', JSON.stringify(feedbackReasons))
          const isMissing = feedbackReasons.some((reason) => /missing ingredients/i.test(String(reason)))
          if (isMissing) {
            formData.append('feedbackMissing', '1')
          }
        }
        const feedbackItems = Array.from(
          new Set(
            [
              ...(analyzedItems || [])
                .map((item: any) => String(item?.name || '').trim())
                .filter(Boolean),
              feedbackFocusItem,
            ].filter(Boolean),
          ),
        )
        if (feedbackItems.length > 0) {
          formData.append('feedbackItems', JSON.stringify(feedbackItems))
        }
        if (analysisId) {
          formData.append('feedbackScanId', String(analysisId))
        }
      }
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
        setAnalysisId(result.analysisId ?? null);
        setAnalysisFeedbackOverall(null);
        setAnalysisFeedbackItems({});
        setFeedbackPrompt(null);
        setFeedbackReasons([]);
        setFeedbackComment('');
        setFeedbackError(null);
        const barcodeTag = barcodeLabelFlow?.barcode
          ? { barcode: barcodeLabelFlow.barcode, source: 'label-photo' }
          : undefined
        const analysisSeq = ++analysisSequenceRef.current
        const applied = applyStructuredItems(result.items, result.total, result.analysis, {
          barcodeTag,
          allowTextFallback: false,
          analysisSeq,
          autoMatchEnabled: false,
          preserveExplicitCountsFrom: previousSnapshot?.items,
        });
        if (isFeedbackRescan && previousSnapshot?.totals && applied?.total) {
          const prevCalories = Number(previousSnapshot.totals.calories ?? 0)
          const nextCalories = Number(applied.total.calories ?? 0)
          if (prevCalories > 0 && nextCalories > 0) {
            const ratio = nextCalories / prevCalories
            const isOutsideBand = ratio < 0.6 || ratio > 1.6
            if (isOutsideBand) {
              setAnalyzedItems(previousSnapshot.items)
              setAnalyzedNutrition(previousSnapshot.totals)
              setAnalyzedTotal(convertTotalsForStorage(previousSnapshot.totals))
              if (previousSnapshot.description) {
                setAiDescription(previousSnapshot.description)
              }
              showQuickToast('Re-check result looked very different. Keeping your previous result.')
            }
          }
        }
        // Set warnings and alternatives if present
        setHealthWarning(result.healthWarning || null);
        setHealthAlternatives(result.alternatives || null);
        setDietWarning(result.dietWarning || null);
        setDietAlternatives(result.dietAlternatives || null);
        setShowAiResult(true);
        if (!isFeedbackRescan) {
          const analysisPromptKey = buildAnalysisHealthCheckKey(result.analysisId ?? null, analysisSeq)
          maybeShowHealthCheckPromptFromAnalysis({
            analysisKey: analysisPromptKey,
            analysisText: result.analysis,
            items: Array.isArray(result.items) ? result.items : null,
            total: result.total ?? null,
          })
        }
        // Trigger usage meter refresh after successful analysis
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
      
      if (!isFeedbackRescan) {
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
      } else {
        showQuickToast('Rescan failed. Keeping your current results.')
      }
    } finally {
      setIsAnalyzing(false);
      setAnalysisPhase('idle');
    }
  };

  const analyzeManualFood = async () => {
    // Validation for single food
    if (manualFoodType === 'single' && !manualFoodName.trim()) return;

    // Validation for multiple ingredients
    if (manualFoodType === 'multiple' && manualIngredients.every((ing) => !ing.name.trim())) return;
    
    setIsAnalyzing(true);
    setAnalysisPhase('analyzing');

    // Desktop UX: keep the analysis results/progress in view.
    try {
      if (typeof window !== 'undefined') {
        const isDesktop = window.matchMedia ? window.matchMedia('(min-width: 768px)').matches : true
        if (isDesktop) {
          window.requestAnimationFrame(() => {
            window.scrollTo({ top: 0, behavior: 'smooth' })
          })
        }
      }
    } catch {}
    
    try {
      console.log('🚀 PERFORMANCE: Starting fast text-based food analysis...');
      
      let foodDescription = '';
      
      if (manualFoodType === 'single') {
        foodDescription = manualFoodName.trim();
      } else {
        // Build description from multiple ingredients
        const validIngredients = manualIngredients.filter((ing) => ing.name.trim());
        foodDescription = validIngredients
          .map((ing) => {
            const name = (ing.name || '').toString().trim()
            const weight = (ing.weight || '').toString().trim()
            const unit = (ing.unit || '').toString().trim()
            return weight ? `${name}, ${weight} ${unit || 'g'}` : name
          })
          .join('; ');
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
        const analysisSeq = ++analysisSequenceRef.current
        applyStructuredItems(result.items, result.total, result.analysis, {
          allowTextFallback: false,
          analysisSeq,
          autoMatchEnabled: false,
        });
        // Set warnings and alternatives if present
        setHealthWarning(result.healthWarning || null);
        setHealthAlternatives(result.alternatives || null);
        setDietWarning(result.dietWarning || null);
        setDietAlternatives(result.dietAlternatives || null);
        setShowAiResult(true);
        const analysisPromptKey = buildAnalysisHealthCheckKey(null, analysisSeq)
        maybeShowHealthCheckPromptFromAnalysis({
          analysisKey: analysisPromptKey,
          analysisText: result.analysis,
          items: Array.isArray(result.items) ? result.items : null,
          total: result.total ?? null,
        })
        
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
    if (labelBlocked) {
      showQuickToast('Please fix the label values before saving.')
      return
    }
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
    
    const category = normalizeCategory(selectedAddCategory)
    const opStamp = Date.now()
    const loggedAtIso = new Date().toISOString()
    const addedOrder = Date.now()
    const createdAtIso = alignTimestampToLocalDate(loggedAtIso, selectedDate)
    const displayTime = new Date(createdAtIso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    const drinkOverride = pendingDrinkOverrideRef.current
    const adjusted = applyDrinkOverrideToItems(analyzedItems, drinkOverride)
    const finalItems = adjusted.items || (analyzedItems && analyzedItems.length > 0 ? analyzedItems : null)
    const overrideTotals = adjusted.used ? adjusted.totals || null : null
    if (adjusted.used) pendingDrinkOverrideRef.current = null
    const drinkMeta = consumePendingDrinkMeta(drinkOverride)
    const finalNutritionBase = overrideTotals || nutrition || analyzedNutrition
    const finalTotalBase = overrideTotals ? convertTotalsForStorage(overrideTotals) : analyzedTotal || null
    const finalNutrition = applyDrinkMetaToTotals(finalNutritionBase, drinkMeta)
    const finalTotal = applyDrinkMetaToTotals(finalTotalBase, drinkMeta)
    const newEntry = ensureEntryLoggedAt(
      applyEntryClientId(
        {
          id: makeUniqueLocalEntryId(
            new Date(createdAtIso).getTime(),
            `entry:${opStamp}|${selectedDate}|${category}|${normalizedDescription(finalDescription)}`,
          ),
          localDate: selectedDate, // pin to the date the user is viewing when saving
          description: finalDescription,
          time: displayTime,
          method,
          photo: method === 'photo' ? photoPreview : null,
          nutrition: finalNutrition,
          items: finalItems, // Store structured items
          total: finalTotal, // Store total nutrition
          meal: category,
          category,
          persistedCategory: category,
          createdAt: createdAtIso,
        },
        `entry:${opStamp}|${selectedDate}|${category}|${normalizedDescription(finalDescription)}`,
      ),
      loggedAtIso,
      addedOrder,
    );
    
    // Prevent duplicates: check if entry with same ID already exists
    const existingById = todaysFoods.find(food => food.id === newEntry.id);
    if (existingById) {
      console.log('⚠️ Entry with same ID already exists, skipping duplicate');
      return;
    }
    
    const updatedFoods = [newEntry, ...todaysFoods]
    setTodaysFoods(updatedFoods)
    if (method !== 'photo') {
      maybeShowHealthCheckPrompt(newEntry)
    }

    // If the user is viewing a non‑today date (e.g. yesterday), keep the
    // visible history list in sync so the new entry doesn't "disappear"
    // immediately after saving.
    if (!isViewingToday) {
      setHistoryFoods((prev: any[] | null) => {
        const base = Array.isArray(prev) ? prev : []
        const mapped = {
          id: newEntry.id,
          dbId: undefined,
          clientId: newEntry.clientId,
          description: newEntry.description,
          time: newEntry.time,
          createdAt: newEntry.createdAt,
          method: newEntry.method,
          photo: newEntry.photo,
          nutrition: newEntry.nutrition,
          items: newEntry.items,
          localDate: newEntry.localDate,
          total: newEntry.total || null,
          meal: newEntry.meal,
          category: newEntry.category,
          persistedCategory: newEntry.persistedCategory,
        }
        return [mapped, ...base]
      })
    }

    // Save to database (this triggers background insight regeneration)
    setIsSavingEntry(true)
    try {
      await saveFoodEntries(updatedFoods)
      await refreshEntriesFromServer()
      await saveBarcodeLabelIfNeeded(newEntry.items)
      
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
      if (isAnalysisRoute) {
        router.push('/food')
      }
    } finally {
      setIsSavingEntry(false)
    }
  };

  // New function to update existing entries with AI re-analysis
  const updateFoodEntry = async () => {
    if (!editingEntry) return;
    if (labelBlocked) {
      showQuickToast('Please fix the label values before saving.')
      return
    }

    // Never override a user-provided title with an auto-generated ingredient summary.
    const manualDescription = (editedDescription?.trim?.() || '').trim()
    const fallbackDescription = (manualDescription || aiDescription || editingEntry.description || '').trim()
    const generatedSummary = buildMealSummaryFromItems(analyzedItems)
    const finalDescription = fallbackDescription || generatedSummary || ''

    // Calculate new createdAt from entryTime + selectedDate
    let newCreatedAt = editingEntry.createdAt;
    if (entryTime) {
      const [h, m] = entryTime.split(':').map(Number);
      const [y, mon, d] = (editingEntry.localDate || selectedDate).split('-').map(Number);
      // Create date in local timezone (browser's)
      const date = new Date(y, mon - 1, d, h, m, 0, 0);
      newCreatedAt = date.toISOString();
    }

    const meta = (() => {
      const n = editingEntry?.nutrition
      const clientId = getEntryClientId(editingEntry)
      if (!n || typeof n !== 'object') return { favoriteId: '', origin: '', clientId, drinkMeta: null }
      const favoriteId = typeof (n as any).__favoriteId === 'string' ? String((n as any).__favoriteId).trim() : ''
      const origin = typeof (n as any).__origin === 'string' ? String((n as any).__origin).trim() : ''
      const drinkType = typeof (n as any).__drinkType === 'string' ? String((n as any).__drinkType).trim() : ''
      const drinkUnit = normalizeDrinkUnit((n as any).__drinkUnit) || null
      const drinkAmount = Number((n as any).__drinkAmount)
      const drinkAmountMl = Number((n as any).__drinkAmountMl)
      const waterLogId = (n as any).__waterLogId ? String((n as any).__waterLogId).trim() : ''
      const drinkMeta =
        drinkType && drinkUnit && Number.isFinite(drinkAmount) && drinkAmount > 0
          ? {
              __drinkType: drinkType,
              __drinkUnit: drinkUnit,
              __drinkAmount: drinkAmount,
              __drinkAmountMl: Number.isFinite(drinkAmountMl) ? drinkAmountMl : undefined,
              ...(waterLogId ? { __waterLogId: waterLogId } : {}),
            }
          : null
      return { favoriteId, origin, clientId, drinkMeta }
    })()

    const drinkMeta = editingDrinkMetaRef.current || getDrinkMetaFromEntry(editingEntry)

    const mergedNutrition = (() => {
      const base = (analyzedNutrition || editingEntry.nutrition) as any
      if (!base || typeof base !== 'object') return base
      const next: any = { ...(base as any) }
      if (meta.favoriteId) next.__favoriteId = meta.favoriteId
      if (meta.origin) next.__origin = meta.origin
      if (meta.clientId) next.__clientId = meta.clientId
      if (meta.drinkMeta) {
        Object.assign(next, meta.drinkMeta)
      }
      if (drinkMeta) {
        Object.assign(next, applyDrinkMetaToTotals({}, drinkMeta))
      }
      return next
    })()
    const mergedTotal = applyDrinkMetaToTotals(analyzedTotal || (editingEntry.total || null), drinkMeta)

    const resolveDbId = () => {
      if (editingEntry.dbId) return editingEntry.dbId
      const clientId = getEntryClientId(editingEntry)
      if (!clientId) return null
      const match = (entry: any) => Boolean(entry?.dbId) && getEntryClientId(entry) === clientId
      const sources = [
        ...(Array.isArray(todaysFoodsForSelectedDate) ? todaysFoodsForSelectedDate : []),
        ...(Array.isArray(historyFoods) ? historyFoods : []),
        ...(Array.isArray((userData as any)?.todaysFoods) ? ((userData as any).todaysFoods as any[]) : []),
      ]
      const found = sources.find(match)
      return found?.dbId || null
    }
    const resolvedDbId = resolveDbId()

    const updatedEntry = {
      ...editingEntry,
      ...(resolvedDbId ? { dbId: resolvedDbId } : {}),
      localDate: editingEntry.localDate || selectedDate,
      createdAt: newCreatedAt,
      description: finalDescription,
      photo: photoPreview || editingEntry.photo,
      nutrition: mergedNutrition,
      items: analyzedItems && analyzedItems.length > 0 ? analyzedItems : (editingEntry.items || null),
      total: mergedTotal || (editingEntry.total || null)
    };

    const sourceFoods = isViewingToday ? todaysFoodsForSelectedDate : (historyFoods || [])
    const updatedFoods = sourceFoods.map(food => 
      food.id === editingEntry.id ? updatedEntry : food
    );
    
    setIsSavingEntry(true)
    try {
      if (isViewingToday) {
        setTodaysFoods(updatedFoods);
      } else {
        setHistoryFoods(updatedFoods);
      }

      // Persist edit to FoodLog when we have a database id
      const dbId = resolvedDbId || editingEntry.dbId || editingEntry.id
      let serverUpdated = false
      if (resolvedDbId || editingEntry.dbId) {
        const res = await fetch('/api/food-log', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: dbId,
            description: updatedEntry.description,
            nutrition: updatedEntry.nutrition,
            imageUrl: updatedEntry.photo,
            items: updatedEntry.items,
            localDate: updatedEntry.localDate || selectedDate,
            createdAt: updatedEntry.createdAt,
            meal: updatedEntry.meal || updatedEntry.category,
            category: updatedEntry.category || updatedEntry.meal,
          }),
        })
        if (!res.ok) {
          const text = await res.text()
          console.error('❌ Failed to update FoodLog entry', { status: res.status, text })
          setHistorySaveError('Updating your entry failed. Please retry.')
        } else {
          serverUpdated = true
        }
      } else {
        console.warn('⚠️ Editing entry without dbId; skipping FoodLog update')
      }

      // If this diary entry came from a saved meal, keep the saved meal name in sync (forward-looking).
      try {
        if (meta.favoriteId) {
          const nextLabel = normalizeMealLabel(updatedEntry.description || '') || (updatedEntry.description || 'Meal')
          setFavorites((prev) => {
            const base = Array.isArray(prev) ? prev : []
            const idx = base.findIndex((f: any) => String(f?.id || '') === meta.favoriteId)
            if (idx < 0) return prev
            const existing = base[idx]
            const existingLabel = favoriteDisplayLabel(existing) || ''
            const aliases = Array.isArray((existing as any)?.aliases) ? ([...(existing as any).aliases] as string[]) : []
            const normalizedExisting = normalizeMealLabel(existingLabel) || existingLabel
            if (normalizedExisting && normalizedExisting !== nextLabel && !aliases.includes(normalizedExisting)) {
              aliases.push(normalizedExisting)
            }
            const updated = { ...(existing as any), label: nextLabel, description: nextLabel, ...(aliases.length > 0 ? { aliases } : {}) }
            const next = base.map((f: any, i: number) => (i === idx ? updated : f))
            persistFavorites(next)
            return next
          })
        }
      } catch {}

      // Keep local snapshot in sync (but do not create a new history row)
      await saveFoodEntries(updatedFoods, { appendHistory: false });
      if (serverUpdated) {
        await refreshEntriesFromServer();
      }
      await saveBarcodeLabelIfNeeded(updatedEntry.items)
      
      // Reset all form states
      resetAnalyzerPanel()
      setEditingEntry(null)
      if (isAnalysisRoute) {
        router.push('/food')
      }
    } finally {
      editingDrinkMetaRef.current = null
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
          const analysisSeq = ++analysisSequenceRef.current
          applyStructuredItems(result.items, result.total, result.analysis, { analysisSeq, autoMatchEnabled: false });
          setHealthWarning(result.healthWarning || null);
          setHealthAlternatives(result.alternatives || null);
          setDietWarning(result.dietWarning || null);
          setDietAlternatives(result.dietAlternatives || null);
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
	    setDietWarning(null)
	    setDietAlternatives(null)
	    setShowAiResult(false)
    setShowAddFood(false)
    setShowPhotoOptions(false)
    setPhotoOptionsAnchor(null)
    setEntryTime('')
    setManualMealBuildMode(false)
    setBarcodeLabelFlow(null)
    setShowBarcodeLabelPrompt(false)
    setAutoAnalyzeLabelPhoto(false)
    analysisHealthCheckKeyRef.current = null
    pendingAnalysisHealthCheckRef.current = null
    if (barcodeLabelTimeoutRef.current) {
      clearTimeout(barcodeLabelTimeoutRef.current)
      barcodeLabelTimeoutRef.current = null
    }
  }

  function closeAddMenus() {
    setShowPhotoOptions(false)
    setShowCategoryPicker(false)
    setPhotoOptionsAnchor(null)
    setPhotoOptionsPosition(null)
    setPendingPhotoPicker(false)
    setShowAddFood(false)
  }

  const addIngredientContextRef = useRef<{
    mode: 'analysis' | 'diary'
    targetCategory?: typeof MEAL_CATEGORY_ORDER[number]
  }>({ mode: 'analysis' })

  const openAddIngredientModalFromMenu = (
    e?: any,
    context?: { mode?: 'analysis' | 'diary'; targetCategory?: typeof MEAL_CATEGORY_ORDER[number] },
  ) => {
    try {
      e?.stopPropagation?.()
    } catch {}
    const desiredMode = context?.mode || 'analysis'
    const desiredCategory = context?.targetCategory || selectedAddCategory
    addIngredientContextRef.current = {
      mode: desiredMode,
      targetCategory: desiredCategory,
    }
    // Close any add menus/dropdowns first, then open the modal.
    setShowPhotoOptions(false)
    setShowCategoryPicker(false)
    setPhotoOptionsAnchor(null)
    setPhotoOptionsPosition(null)
    setPendingPhotoPicker(false)

    // User request: Add Ingredient should be a dedicated page (not a pop-up) when adding to the diary.
    if (desiredMode === 'diary') {
      try {
        officialSearchAbortRef.current?.abort()
      } catch {}
      try {
        if (officialSearchDebounceRef.current) clearTimeout(officialSearchDebounceRef.current)
      } catch {}
      officialSearchDebounceRef.current = null
      officialSearchAbortRef.current = null
      officialSearchSeqRef.current += 1
      setOfficialLoading(false)
      setOfficialError(null)
      setOfficialResults([])
      setOfficialSearchQuery('')
      setShowAddIngredientModal(false)
      router.push(
        `/food/add-ingredient?date=${encodeURIComponent(selectedDate)}&category=${encodeURIComponent(desiredCategory)}`,
      )
      return
    }
    // Reset search state every time this modal is opened so it can't get stuck in "loading".
    try {
      officialSearchAbortRef.current?.abort()
    } catch {}
    try {
      if (officialSearchDebounceRef.current) clearTimeout(officialSearchDebounceRef.current)
    } catch {}
    officialSearchDebounceRef.current = null
    officialSearchAbortRef.current = null
    officialSearchSeqRef.current += 1
    setOfficialLoading(false)
    setOfficialError(null)
    setOfficialResults([])
    setOfficialSearchQuery('')
    setTimeout(() => {
      setShowAddIngredientModal(true)
    }, 0)
  }

  const resetOfficialSearchState = () => {
    try {
      officialSearchAbortRef.current?.abort()
    } catch {}
    try {
      if (officialSearchDebounceRef.current) clearTimeout(officialSearchDebounceRef.current)
    } catch {}
    officialSearchDebounceRef.current = null
    officialSearchAbortRef.current = null
    officialSearchSeqRef.current += 1
    setOfficialLoading(false)
    setOfficialError(null)
    setOfficialResults([])
    setOfficialSearchQuery('')
    setOfficialResultsSource('usda')
    setOfficialSource('packaged')
  }

  const startManualMealBuilder = (targetCategory: typeof MEAL_CATEGORY_ORDER[number]) => {
    try {
      setShowPhotoOptions(false)
      setShowCategoryPicker(false)
      setPhotoOptionsAnchor(null)
      setPhotoOptionsPosition(null)
      setPendingPhotoPicker(false)
    } catch {}

    // Build a multi-ingredient meal using the same ingredient cards UI as photo analysis,
    // but without requiring a photo.
    setSelectedAddCategory(targetCategory)
    setManualMealBuildMode(true)
    setIsEditingDescription(true)
    setEditedDescription('')
    setPhotoFile(null)
    setPhotoPreview(null)
    setAiDescription('')
    setAnalyzedItems([])
    setAnalyzedNutrition(null)
    setAnalyzedTotal(null)
    setHealthWarning(null)
    setHealthAlternatives(null)
    setShowAiResult(true)
    setShowAddFood(true)
    closeFavoritesPicker()
    setEntryTime('')

    // Prompt the official search modal immediately so the user can start adding ingredients.
    addIngredientContextRef.current = { mode: 'analysis' }
    resetOfficialSearchState()
    setTimeout(() => setShowAddIngredientModal(true), 0)
  }

  const computeDesktopAddMenuPosition = (key: typeof MEAL_CATEGORY_ORDER[number]) => {
    const row = categoryRowRefs.current[key]
    if (!row || typeof window === 'undefined') {
      setPhotoOptionsPosition(null)
      return
    }
    const rect = row.getBoundingClientRect()
    const addButton = row.querySelector?.('.category-add-button') as HTMLElement | null
    const anchorRect = addButton ? addButton.getBoundingClientRect() : rect
    const viewportHeight = window.innerHeight || 0
    const viewportWidth = window.innerWidth || 0

    // Desktop UX: keep the menu visually attached to the "+" button (not centered in the row).
    // Only use an internal scrollbar when the viewport is genuinely too short to show the menu.
    const width = Math.min(360, Math.max(260, viewportWidth - 24))
    const left = Math.max(12, Math.min(anchorRect.left, viewportWidth - width - 12))

    // Initial placement (below button). We'll refine after render using the real menu height.
    const top = Math.max(12, anchorRect.bottom + 8)
    const maxHeight = Math.max(260, viewportHeight - top - 12)
    setPhotoOptionsPosition({ top, left, width, maxHeight })
  }

  // Desktop add-menu must remain fully reachable: if the menu would be cut off,
  // reposition it above/below based on the *actual* rendered height.
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (isMobile) return
    if (!showPhotoOptions) return
    if (!photoOptionsAnchor) return

    const key = photoOptionsAnchor as any
    const row = categoryRowRefs.current[key]
    const menuEl = desktopAddMenuRef.current
    if (!row || !menuEl) return

    const addButton = row.querySelector?.('.category-add-button') as HTMLElement | null
    if (!addButton) return

    const raf = window.requestAnimationFrame(() => {
      try {
        const anchorRect = addButton.getBoundingClientRect()
        const viewportHeight = window.innerHeight || 0
        const margin = 12
        // Use the full content height (not the currently constrained height),
        // so we can decide whether we can fully display without an internal scroll.
        const fullHeight = Math.max(0, Number(menuEl.scrollHeight || 0))
        if (!fullHeight || !Number.isFinite(fullHeight)) return

        const availableFull = Math.max(0, viewportHeight - margin * 2)
        const maxHeight = Math.min(fullHeight, availableFull)

        let top = anchorRect.bottom + 8
        if (top + maxHeight > viewportHeight - margin) {
          top = anchorRect.top - 8 - maxHeight
        }
        if (top < margin) {
          top = margin
        }

        setPhotoOptionsPosition((prev) => (prev ? { ...prev, top, maxHeight } : prev))
      } catch {}
    })

    return () => {
      window.cancelAnimationFrame(raf)
    }
  }, [showPhotoOptions, photoOptionsAnchor, isMobile])

  // Initialize entry time when editing starts
  useEffect(() => {
    if (editingEntry) {
      // Try to determine the time from the entry
      // Use createdAt if available, otherwise try to extract from localDate + default time
      const ts = editingEntry.createdAt || editingEntry.time || (typeof editingEntry.id === 'number' ? editingEntry.id : null)
      
      if (ts) {
        const date = new Date(ts)
        if (!isNaN(date.getTime())) {
          // Format as HH:mm for input type="time"
          const hours = date.getHours().toString().padStart(2, '0')
          const minutes = date.getMinutes().toString().padStart(2, '0')
          setEntryTime(`${hours}:${minutes}`)
        } else {
          setEntryTime('')
        }
      } else {
        // Default to current time if no timestamp
        const now = new Date()
        const hours = now.getHours().toString().padStart(2, '0')
        const minutes = now.getMinutes().toString().padStart(2, '0')
        setEntryTime(`${hours}:${minutes}`)
      }
    }
  }, [editingEntry])

  // Guard rail: category "+" must act as a true toggle (tap to open, tap same "+" to close). Do not change to tap-outside-to-close.
  const handleCategoryPlusClick = (key: typeof MEAL_CATEGORY_ORDER[number]) => {
    if (showPhotoOptions && photoOptionsAnchor === key) {
      closeAddMenus()
      return
    }
    if (!isMobile) {
      computeDesktopAddMenuPosition(key)
    } else {
      setPhotoOptionsPosition(null)
    }
    setSelectedAddCategory(key)
    setShowCategoryPicker(false)
    setPhotoOptionsAnchor(key)
    setShowPhotoOptions(true)
    setShowAddFood(false)
    setIsEditingDescription(false)
    setShowAiResult(false)
  }

  const toggleCategoryAddMenu = (key: typeof MEAL_CATEGORY_ORDER[number]) => {
    // If this category's add menu is open, close everything
    if (showPhotoOptions && photoOptionsAnchor === key) {
      closeAddMenus()
      return
    }
    if (!isMobile) {
      computeDesktopAddMenuPosition(key)
    } else {
      setPhotoOptionsPosition(null)
    }
    // Otherwise open this category's add menu
    setSelectedAddCategory(key)
    setShowCategoryPicker(false)
    setPhotoOptionsAnchor(key)
    setShowPhotoOptions(true)
    setShowAddFood(false)
    setIsEditingDescription(false)
    setShowAiResult(false)
  }

  const handleDeletePhoto = () => {
    // For new AI analyses, deleting the photo should behave like cancelling:
    // clear the analyzer state and return to the main Food Diary view.
    resetAnalyzerPanel()
    if (isAnalysisRoute) {
      router.push('/food')
    }
  }

  const showQuickToast = (message: string) => {
    setQuickToast(message)
    setTimeout(() => setQuickToast(null), 1400)
  }

  const blurActiveElement = () => {
    if (typeof document === 'undefined') return
    try {
      const active = document.activeElement as HTMLElement | null
      active?.blur?.()
    } catch {}
  }

  const FEEDBACK_REASONS = [
    'Wrong food detected',
    'Missing ingredients',
    'Portion size wrong',
    'Macros wrong',
    'Other',
  ]

  const submitFoodAnalysisFeedback = async (payload: {
    scope: 'overall' | 'item'
    rating: 'up' | 'down'
    itemIndex?: number | null
    reasons?: string[]
    comment?: string | null
  }) => {
    try {
      const item =
        payload.scope === 'item' && payload.itemIndex !== null && payload.itemIndex !== undefined
          ? analyzedItems[payload.itemIndex]
          : null
      await fetch('/api/food-analysis-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          analysisId,
          analysisMode,
          analysisHint,
          scope: payload.scope,
          rating: payload.rating === 'up' ? 1 : -1,
          reasons: payload.reasons || [],
          comment: payload.comment || null,
          itemIndex: payload.itemIndex ?? null,
          itemName: item?.name ?? null,
          itemServingSize: item?.serving_size ?? null,
          itemBrand: item?.brand ?? null,
        }),
      })
    } catch (err) {
      console.warn('Feedback submission failed', err)
      showQuickToast('Could not send feedback. Please try again.')
    }
  }

  const clearOverallFeedback = () => {
    setAnalysisFeedbackOverall(null)
  }

  const clearItemFeedback = (index: number) => {
    setAnalysisFeedbackItems((prev) => {
      if (!Object.prototype.hasOwnProperty.call(prev, index)) return prev
      const next = { ...prev }
      delete next[index]
      return next
    })
  }

  const handleOverallThumb = (next: 'up' | 'down') => {
    if (analysisFeedbackOverall === next) {
      clearOverallFeedback()
      showQuickToast('Feedback removed.')
      return
    }
    if (next === 'up') {
      setAnalysisFeedbackOverall('up')
      submitFoodAnalysisFeedback({ scope: 'overall', rating: 'up' })
      showQuickToast('Thanks for the feedback!')
      return
    }
    setFeedbackPrompt({ scope: 'overall' })
    setFeedbackReasons([])
    setFeedbackComment('')
    setFeedbackError(null)
  }

  const handleItemThumb = (index: number, next: 'up' | 'down') => {
    const current = analysisFeedbackItems[index]
    if (current === next) {
      clearItemFeedback(index)
      showQuickToast('Feedback removed.')
      return
    }
    if (next === 'up') {
      setAnalysisFeedbackItems((prev) => ({ ...prev, [index]: 'up' }))
      submitFoodAnalysisFeedback({ scope: 'item', rating: 'up', itemIndex: index })
      showQuickToast('Thanks for the feedback!')
      return
    }
    setFeedbackPrompt({ scope: 'item', itemIndex: index })
    setFeedbackReasons([])
    setFeedbackComment('')
    setFeedbackError(null)
  }

  const buildFeedbackItemDescription = (item: any) => {
    if (!item) return ''
    const name = String(item?.name || '').trim()
    if (!name) return ''
    const detailParts: string[] = []
    const servingSize = String(item?.serving_size || '').trim()
    if (servingSize) detailParts.push(`serving size ${servingSize}`)
    const servings = Number(item?.servings)
    if (Number.isFinite(servings) && servings > 0 && Math.abs(servings - 1) > 0.01) {
      detailParts.push(`servings ${formatNumberInputValue(servings)}`)
    }
    const piecesPerServing = getPiecesPerServing(item)
    const piecesPerServingValue =
      typeof piecesPerServing === 'number' && Number.isFinite(piecesPerServing) && piecesPerServing > 0
        ? piecesPerServing
        : null
    const piecesValue =
      Number.isFinite(Number(item?.pieces)) && Number(item.pieces) > 0
        ? Number(item.pieces)
        : piecesPerServingValue !== null && Number.isFinite(servings)
        ? piecesPerServingValue * servings
        : null
    if (Number.isFinite(piecesValue as number) && (piecesValue as number) > 0) {
      const roundedPieces = Math.round((piecesValue as number) * 100) / 100
      detailParts.push(`${formatNumberInputValue(roundedPieces)} piece${roundedPieces === 1 ? '' : 's'}`)
    }
    const weightAmount = Number(item?.weightAmount)
    const weightUnit = item?.weightUnit === 'ml' ? 'ml' : item?.weightUnit === 'oz' ? 'oz' : 'g'
    if (Number.isFinite(weightAmount) && weightAmount > 0) {
      detailParts.push(`total weight ${formatNumberInputValue(weightAmount)} ${weightUnit}`)
    }
    const detail = detailParts.length > 0 ? ` (${detailParts.join(', ')})` : ''
    return `${name}${detail}`
  }

  const pickBestFeedbackItem = (items: any[], targetName: string) => {
    if (!Array.isArray(items) || items.length === 0) return null
    const targetKey = normalizeFoodName(targetName || '')
    if (!targetKey) return items[0]
    let best = items[0]
    let bestScore = -1
    items.forEach((candidate) => {
      const key = normalizeFoodName(candidate?.name || '')
      if (!key) return
      let score = 0
      if (key === targetKey) score += 6
      if (key.includes(targetKey) || targetKey.includes(key)) score += 3
      const tokens = targetKey.split(' ').filter(Boolean)
      tokens.forEach((t) => {
        if (key.includes(t)) score += 1
      })
      if (score > bestScore) {
        bestScore = score
        best = candidate
      }
    })
    return best
  }

  const mergeRescannedItem = (existing: any, incoming: any) => {
    const merged: any = { ...incoming }
    const keepNumber = (value: any, fallback: any, min = 0) => {
      const numeric = Number(value)
      if (Number.isFinite(numeric) && numeric > min) return numeric
      return fallback
    }
    const keepValue = (value: any, fallback: any) => (value !== null && value !== undefined ? value : fallback)
    merged.servings = keepNumber(existing?.servings, merged.servings, 0)
    merged.portionMode = keepValue(existing?.portionMode, merged.portionMode)
    merged.weightAmount = keepNumber(existing?.weightAmount, merged.weightAmount, 0)
    merged.weightUnit = keepValue(existing?.weightUnit, merged.weightUnit)
    merged.customGramsPerServing = keepNumber(existing?.customGramsPerServing, merged.customGramsPerServing, 0)
    merged.customMlPerServing = keepNumber(existing?.customMlPerServing, merged.customMlPerServing, 0)
    merged.pieces = keepNumber(existing?.pieces, merged.pieces, 0)
    merged.piecesPerServing = keepNumber(existing?.piecesPerServing, merged.piecesPerServing, 0)
    merged.servingOptions = Array.isArray(existing?.servingOptions) && existing.servingOptions.length > 0 ? existing.servingOptions : merged.servingOptions
    merged.selectedServingId = keepValue(existing?.selectedServingId, merged.selectedServingId)
    return merged
  }

  const triggerOverallFeedbackRescan = async (reasons: string[], comment?: string) => {
    if (isAnalyzing) return
    if (!photoFile) return
    if (analysisMode === 'packaged' || Boolean(barcodeLabelFlow?.barcode)) return
    const message = 'Re-analyzing... Please keep this page open.'
    setFeedbackRescanState({ scope: 'overall', itemIndex: null })
    setFeedbackRescanMessage(message)
    showQuickToast(message)
    try {
      await analyzePhoto(photoFile, {
        feedbackRescan: true,
        feedbackReasons: reasons,
        feedbackFocusItem: null,
        feedbackComment: comment,
      })
    } finally {
      setFeedbackRescanState(null)
      setFeedbackRescanMessage(null)
    }
  }

  const triggerItemFeedbackRescan = async (itemIndex: number, reasons: string[], comment?: string) => {
    if (analysisMode === 'packaged' || Boolean(barcodeLabelFlow?.barcode)) {
      showQuickToast('Item re-analysis is unavailable for label scans.')
      return false
    }
    const item = analyzedItems[itemIndex]
    if (!item) return false
    const description = buildFeedbackItemDescription(item)
    if (!description) return false
    const mergedHint = buildFeedbackHint(analysisHint, comment || '')
    setFeedbackRescanState({ scope: 'item', itemIndex })
    try {
      const response = await fetch('/api/analyze-food', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          textDescription: description,
          foodType: 'single',
          isReanalysis: true,
          multi: false,
          returnItems: true,
          analysisMode: 'meal',
          analysisHint: mergedHint,
          feedbackDown: true,
          feedbackReasons: reasons,
          feedbackItems: [String(item?.name || '').trim()].filter(Boolean),
        }),
      })
      const result = await response.json()
      if (!response.ok) {
        console.error('Item re-analysis failed:', result?.error || response.statusText)
        return false
      }
      const returnedItems = Array.isArray(result?.items) ? result.items : []
      if (returnedItems.length === 0) return false
      const best = pickBestFeedbackItem(returnedItems, String(item?.name || ''))
      if (!best) return false
      const normalized = normalizeDiscreteItem(best)
      setAnalyzedItems((prev) => {
        const next = prev.map((current, idx) =>
          idx === itemIndex ? mergeRescannedItem(current, normalized) : current,
        )
        applyRecalculatedNutrition(next)
        return next
      })
      return true
    } catch (err) {
      console.error('Item re-analysis error:', err)
      return false
    } finally {
      setFeedbackRescanState(null)
    }
  }

  const resetAnalysisFeedbackState = () => {
    setAnalysisId(null)
    setAnalysisFeedbackOverall(null)
    setAnalysisFeedbackItems({})
    setFeedbackPrompt(null)
    setFeedbackReasons([])
    setFeedbackComment('')
    setFeedbackError(null)
    analysisHealthCheckKeyRef.current = null
    pendingAnalysisHealthCheckRef.current = null
  }

  const isFeedbackRescanning =
    feedbackRescanState?.scope === 'item' &&
    feedbackPrompt?.scope === 'item' &&
    feedbackRescanState?.itemIndex === feedbackPrompt?.itemIndex
  const isFeedbackModalLocked = feedbackSubmitting || isFeedbackRescanning

  const buildDietTotalsForCheck = (entry: any) => {
    const rawTotal = entry?.total
    if (rawTotal && typeof rawTotal === 'object') {
      // Prefer the canonical shape used across the app.
      if ((rawTotal as any).carbs_g !== undefined || (rawTotal as any).sugar_g !== undefined) return rawTotal
      // Fallback: some stored totals use non-suffixed keys.
      if ((rawTotal as any).carbs !== undefined || (rawTotal as any).sugar !== undefined) {
        return {
          calories: (rawTotal as any).calories,
          protein_g: (rawTotal as any).protein_g ?? (rawTotal as any).protein,
          carbs_g: (rawTotal as any).carbs_g ?? (rawTotal as any).carbs,
          fat_g: (rawTotal as any).fat_g ?? (rawTotal as any).fat,
          fiber_g: (rawTotal as any).fiber_g ?? (rawTotal as any).fiber,
          sugar_g: (rawTotal as any).sugar_g ?? (rawTotal as any).sugar,
        }
      }
      return rawTotal
    }
    const n = entry?.nutrition
    if (!n || typeof n !== 'object') return null
    return {
      calories: (n as any).calories,
      protein_g: (n as any).protein,
      carbs_g: (n as any).carbs,
      fat_g: (n as any).fat,
      fiber_g: (n as any).fiber,
      sugar_g: (n as any).sugar,
    }
  }

  const getHealthCheckEntryKey = (entry: any) => {
    if (!entry) return ''
    const dbId = entry?.dbId ? String(entry.dbId) : ''
    const id = entry?.id ? String(entry.id) : ''
    const clientId = getEntryClientId(entry) || ''
    return dbId || id || clientId
  }

  const persistHealthCheckPrompted = () => {
    if (typeof window === 'undefined') return
    try {
      localStorage.setItem(
        HEALTH_CHECK_PROMPT_STORAGE_KEY,
        JSON.stringify(Array.from(healthCheckPromptedRef.current)),
      )
    } catch {}
  }

  const markHealthCheckPrompted = (entryKey: string, options?: { persist?: boolean }) => {
    if (!entryKey) return
    const set = healthCheckPromptedRef.current
    if (set.has(entryKey)) return
    set.add(entryKey)
    if (set.size > HEALTH_CHECK_PROMPT_CACHE_LIMIT) {
      const overflow = set.size - HEALTH_CHECK_PROMPT_CACHE_LIMIT
      let removed = 0
      for (const key of set) {
        set.delete(key)
        removed += 1
        if (removed >= overflow) break
      }
    }
    if (options?.persist !== false) {
      persistHealthCheckPrompted()
    }
  }

  const getLocalDateKey = () => {
    const d = new Date()
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }

  const readHealthCheckDailyCapState = () => {
    if (typeof window === 'undefined') return { date: getLocalDateKey(), count: 0 }
    try {
      const raw = localStorage.getItem(HEALTH_CHECK_DAILY_CAP_KEY)
      if (!raw) return { date: getLocalDateKey(), count: 0 }
      const parsed = JSON.parse(raw)
      const date = typeof parsed?.date === 'string' ? parsed.date : getLocalDateKey()
      const count = Number(parsed?.count)
      if (date !== getLocalDateKey()) {
        return { date: getLocalDateKey(), count: 0 }
      }
      return { date, count: Number.isFinite(count) ? Math.max(0, Math.round(count)) : 0 }
    } catch {
      return { date: getLocalDateKey(), count: 0 }
    }
  }

  const writeHealthCheckDailyCapState = (next: { date: string; count: number }) => {
    if (typeof window === 'undefined') return
    try {
      localStorage.setItem(HEALTH_CHECK_DAILY_CAP_KEY, JSON.stringify(next))
    } catch {}
  }

  const getHealthCheckDailyCap = () => {
    const cap = Number(healthCheckSettings.dailyCap)
    return Number.isFinite(cap) && cap > 0 ? Math.round(cap) : null
  }

  const isHealthCheckCapReached = () => {
    const cap = getHealthCheckDailyCap()
    if (!cap) return false
    const state = readHealthCheckDailyCapState()
    return state.count >= cap
  }

  const incrementHealthCheckCapCount = () => {
    const cap = getHealthCheckDailyCap()
    if (!cap) return
    const state = readHealthCheckDailyCapState()
    const next = { date: state.date, count: state.count + 1 }
    writeHealthCheckDailyCapState(next)
  }

  const buildHealthCheckTotals = (entry: any, totalsOverride?: NutritionTotals | null) => {
    const overrideTotals = totalsOverride ? sanitizeNutritionTotals(totalsOverride) || totalsOverride : null
    const baseTotals = overrideTotals || sanitizeNutritionTotals(entry?.total || entry?.nutrition || null) || null
    const itemTotals =
      Array.isArray(entry?.items) && entry.items.length > 0 ? recalculateNutritionFromItems(entry.items) : null

    if (!itemTotals) return baseTotals
    if (!baseTotals) return itemTotals

    const merged: NutritionTotals = { ...itemTotals }
    ;(['calories', 'protein', 'carbs', 'fat', 'fiber', 'sugar'] as const).forEach((key) => {
      const itemValue = itemTotals[key]
      const baseValue = baseTotals[key]
      if ((itemValue === null || itemValue === 0) && typeof baseValue === 'number' && baseValue > 0) {
        merged[key] = baseValue
      }
    })
    return merged
  }

  const buildHealthCheckTriggerPreview = (
    entry: any,
    totals: NutritionTotals | null,
  ): Array<{ key: 'sugar' | 'carbs' | 'fat'; label: string; value: number; limit: number; unit: string }> => {
    if (!totals) return []
    const thresholds = getHealthCheckThresholds()
    const sugar = typeof totals.sugar === 'number' ? totals.sugar : 0
    const carbs = typeof totals.carbs === 'number' ? totals.carbs : 0
    const fat = typeof totals.fat === 'number' ? totals.fat : 0

    const sugarHigh = sugar >= thresholds.sugar
    const carbsHigh = carbs >= thresholds.carbs
    let fatHigh = fat >= thresholds.fat

    if (fatHigh && !sugarHigh && !carbsHigh) {
      const entryText = [
        entry?.description,
        ...(Array.isArray(entry?.items) ? entry.items.map((item: any) => item?.name || item?.label || '') : []),
      ]
        .join(' ')
        .trim()
      const hasHealthyFat = entryText ? containsHealthyFat(entryText) : false
      const hasUnhealthyFat = entryText ? containsUnhealthyFat(entryText) : false
      if (hasHealthyFat && !hasUnhealthyFat) {
        const margin = 20
        if (fat < thresholds.fat + margin) fatHigh = false
      }
    }

    const triggers: Array<{ key: 'sugar' | 'carbs' | 'fat'; label: string; value: number; limit: number; unit: string }> = []
    if (sugarHigh) {
      triggers.push({ key: 'sugar', label: 'Sugar', value: sugar, limit: thresholds.sugar, unit: 'g' })
    }
    if (carbsHigh) {
      triggers.push({ key: 'carbs', label: 'Carbs', value: carbs, limit: thresholds.carbs, unit: 'g' })
    }
    if (fatHigh) {
      triggers.push({ key: 'fat', label: 'Fat', value: fat, limit: thresholds.fat, unit: 'g' })
    }
    return triggers
  }

  const shouldTriggerHealthCheck = (entry: any, totals: NutritionTotals | null) => {
    if (!healthCheckSettings.enabled) return false
    if (healthCheckSettings.frequency === 'never') return false
    if (!totals) return false
    if (healthCheckSettings.frequency === 'always') return true
    const triggers = buildHealthCheckTriggerPreview(entry, totals)
    return triggers.length > 0
  }

  const buildAnalysisHealthCheckKey = (analysisIdValue?: string | null, analysisSeqValue?: number | null) => {
    const seq = typeof analysisSeqValue === 'number' ? analysisSeqValue : analysisSequenceRef.current
    const resolvedId = analysisIdValue ?? analysisId ?? null
    if (resolvedId && seq) return `analysis:${resolvedId}:${seq}`
    if (resolvedId) return `analysis:${resolvedId}`
    if (seq) return `analysis:seq:${seq}`
    return ''
  }

  const maybeShowHealthCheckPrompt = (
    entry: any,
    options?: { entryKey?: string; source?: 'analysis' | 'entry'; totalsOverride?: NutritionTotals | null },
  ) => {
    try {
      if (healthCheckPrompt) return false

      const entryKey = options?.entryKey || getHealthCheckEntryKey(entry)
      if (!entryKey) return false
      if (healthCheckPromptedRef.current.has(entryKey)) return false

      const totals = buildHealthCheckTotals(entry, options?.totalsOverride) || null
      if (!totals) return false
      if (!shouldTriggerHealthCheck(entry, totals)) return false
      if (isHealthCheckCapReached()) return false

      const description = String(entry?.description || entry?.label || '').trim()
      const items = Array.isArray(entry?.items) ? entry.items : null

      markHealthCheckPrompted(entryKey, { persist: options?.source !== 'analysis' })
      incrementHealthCheckCapCount()
      setHealthCheckError(null)
      setHealthCheckResult(null)
      setHealthCheckPrompt({
        entryId: entryKey,
        description: description || 'Meal',
        totals,
        items,
      })
      if (options?.source === 'analysis') {
        analysisHealthCheckKeyRef.current = entryKey
      }
      return true
    } catch {
      // non-blocking
      return false
    }
  }

  const maybeShowHealthCheckPromptFromAnalysis = (payload: {
    analysisKey: string
    analysisText?: string | null
    items?: any[] | null
    total?: any | null
    nutrition?: any | null
  }) => {
    if (!payload.analysisKey) return
    if (analysisHealthCheckKeyRef.current === payload.analysisKey) return
    const baseFromAi = extractBaseMealDescription(payload.analysisText || '')
    const baseFromItems =
      Array.isArray(payload.items) && payload.items.length > 0 ? buildMealSummaryFromItems(payload.items) : ''
    const description = (baseFromAi || baseFromItems || 'Meal').trim()
    const totalsOverride = sanitizeNutritionTotals(payload.total ?? payload.nutrition ?? null)
    const entry = {
      id: payload.analysisKey,
      description,
      items: Array.isArray(payload.items) ? payload.items : null,
      total: payload.total ?? null,
      nutrition: payload.nutrition ?? null,
    }
    if (!userData) {
      pendingAnalysisHealthCheckRef.current = {
        entryKey: payload.analysisKey,
        entry,
        totalsOverride,
      }
      return
    }
    maybeShowHealthCheckPrompt(entry, {
      entryKey: payload.analysisKey,
      source: 'analysis',
      totalsOverride,
    })
  }

  const runHealthCheck = async (payload: HealthCheckPromptPayload) => {
    if (!payload || healthCheckLoading) return
    setHealthCheckLoading(true)
    setHealthCheckError(null)
    setHealthCheckResult(null)
    try {
      const res = await fetch('/api/food-health-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: payload.description,
          totals: payload.totals,
          items: payload.items,
          thresholds: getHealthCheckThresholds(),
        }),
      })
      if (res.status === 402) {
        setHealthCheckError('Not enough credits to run the health check.')
        showQuickToast('Insufficient credits for health check.')
        return
      }
      if (!res.ok) {
        setHealthCheckError('Health check failed. Please try again.')
        showQuickToast('Health check failed. Please try again.')
        return
      }
      const data = await res.json()
      const summary = typeof data?.summary === 'string' ? data.summary.trim() : ''
      const alternative = typeof data?.alternative === 'string' ? data.alternative.trim() : ''
      const flags = Array.isArray(data?.flags)
        ? data.flags.map((flag: any) => String(flag || '').trim()).filter(Boolean)
        : []
      const issues = Array.isArray(data?.issues)
        ? data.issues
            .map((item: any) => ({
              issue: typeof item?.issue === 'string' ? item.issue.trim() : '',
              why: typeof item?.why === 'string' ? item.why.trim() : '',
            }))
            .filter((item: any) => item.issue && item.why)
        : []
      const triggers = Array.isArray(data?.triggers)
        ? data.triggers
            .map((item: any) => ({
              key: typeof item?.key === 'string' ? item.key.trim() : '',
              label: typeof item?.label === 'string' ? item.label.trim() : '',
              value: Number(item?.value),
              limit: Number(item?.limit),
              unit: typeof item?.unit === 'string' ? item.unit.trim() : 'g',
            }))
            .filter((item: any) => item.key && item.label && Number.isFinite(item.value) && Number.isFinite(item.limit))
        : []
      setHealthCheckPrompt(null)
      setHealthCheckResult({
        summary: summary || 'This meal may not fully support your current goals.',
        alternative: alternative || null,
        issues,
        flags,
        triggers,
      })
      setHealthCheckPageOpen(true)
      showQuickToast('Health check complete')
      try {
        window.dispatchEvent(new Event('credits:refresh'))
      } catch {}
    } catch (err) {
      console.error('Health check error', err)
      setHealthCheckError('Health check failed. Please try again.')
      showQuickToast('Health check failed. Please try again.')
    } finally {
      setHealthCheckLoading(false)
    }
  }

  // Diet warnings (no extra AI / no extra credits):
  // If a user has selected diets in Health Setup, warn when they add meals via
  // favorites or copying, even if they didn't run the Food Analyzer again.
  const maybeShowDietWarningToast = (entry: any) => {
    try {
      const dietIds = normalizeDietTypes((userData as any)?.dietTypes ?? (userData as any)?.dietType)
      if (!dietIds.length) return

      const itemNames = Array.isArray(entry?.items)
        ? entry.items
            .map((it: any) => (it?.name || it?.label || '').toString().trim())
            .filter((v: string) => v.length > 0)
        : []

      const totals = buildDietTotalsForCheck(entry)

      const result = checkMultipleDietCompatibility({
        dietIds,
        itemNames,
        analysisText: (entry?.description || '').toString(),
        totals,
      })

      if (!result.warningsByDiet.length) return
      const names = result.warningsByDiet
        .map((w) => w.dietLabel)
        .filter(Boolean)
        .slice(0, 3)
        .join(', ')
      const suggestion = result.suggestions?.[0] ? ` ${result.suggestions[0]}` : ''

      // Delay slightly so it doesn't instantly replace the "Added/Copied" toast.
      setTimeout(() => {
        showQuickToast(`Heads up: this may not match your diet${result.warningsByDiet.length > 1 ? 's' : ''} (${names}).${suggestion}`)
      }, 1600)
    } catch {
      // non-blocking
    }
  }

  const pendingEntryScrollRef = useRef<{
    startedAt: number
    entryKey?: string | null
    dbId?: string | null
    category?: typeof MEAL_CATEGORY_ORDER[number] | null
    expanded?: boolean
  } | null>(null)
  const pendingEntryScrollRafRef = useRef<number | null>(null)

  const queueScrollToDiaryEntry = (opts: { entryKey?: any; dbId?: any; category?: any }) => {
    if (typeof window === 'undefined') return
    const entryKey = opts.entryKey !== null && opts.entryKey !== undefined ? String(opts.entryKey) : null
    const dbId = opts.dbId !== null && opts.dbId !== undefined ? String(opts.dbId) : null
    const category = normalizeCategory(opts.category)
    pendingEntryScrollRef.current = { startedAt: Date.now(), entryKey, dbId, category, expanded: false }

    try {
      if (pendingEntryScrollRafRef.current) cancelAnimationFrame(pendingEntryScrollRafRef.current)
    } catch {}
    pendingEntryScrollRafRef.current = null

    const tick = () => {
      const pending = pendingEntryScrollRef.current
      if (!pending) return
      if (Date.now() - pending.startedAt > 8000) {
        pendingEntryScrollRef.current = null
        return
      }

      try {
        if (!pending.expanded && pending.category) {
          setExpandedCategories((prev) => ({ ...prev, [pending.category as any]: true }))
          pending.expanded = true
        }
      } catch {}

      const escape = (v: string) => {
        try {
          return (window as any).CSS?.escape ? (window as any).CSS.escape(v) : v.replace(/["\\]/g, '\\$&')
        } catch {
          return v.replace(/["\\]/g, '\\$&')
        }
      }

      const selector = pending.dbId
        ? `[data-food-entry-db-id="${escape(pending.dbId)}"]`
        : pending.entryKey
          ? `[data-food-entry-key="${escape(pending.entryKey)}"]`
          : null

      const el = selector ? (document.querySelector(selector) as HTMLElement | null) : null
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' })
        try {
          const prevOutline = el.style.outline
          const prevBoxShadow = el.style.boxShadow
          el.style.outline = 'none'
          el.style.boxShadow = '0 0 0 2px rgba(16, 185, 129, 0.35)'
          setTimeout(() => {
            try {
              el.style.outline = prevOutline
              el.style.boxShadow = prevBoxShadow
            } catch {}
          }, 900)
        } catch {}
        pendingEntryScrollRef.current = null
        try {
          sessionStorage.removeItem('foodDiary:scrollToEntry')
        } catch {}
        return
      }

      pendingEntryScrollRafRef.current = requestAnimationFrame(tick)
    }

    pendingEntryScrollRafRef.current = requestAnimationFrame(tick)
  }

  useEffect(() => {
    // If another page (e.g. /food/add-ingredient) added a meal, scroll to it when returning.
    try {
      const raw = sessionStorage.getItem('foodDiary:scrollToEntry')
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') {
        queueScrollToDiaryEntry({ dbId: parsed.dbId, category: parsed.category })
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const showCameraSettingsHelp = () => {
    if (typeof window === 'undefined') return
    const ua = navigator.userAgent || ''
    const isIOS = /iP(hone|od|ad)/i.test(ua)
    const steps = isIOS
      ? 'Open Settings → Safari → Camera → Allow. Then return and tap “Restart camera”.'
      : 'In your browser, open Settings → Site settings → Camera → Allow for this site. Then return and tap “Restart camera”.'
    alert(`Camera access is blocked.\n\n${steps}`)
  }

  const normalizeMealLabel = (raw: any) =>
    sanitizeMealDescription(
      extractBaseMealDescription((raw || '').toString().split('Calories:')[0]) || (raw || '').toString(),
    )

  const favoriteDisplayLabel = (fav: any) => {
    const raw = (fav?.label || fav?.description || '').toString()
    return normalizeMealLabel(raw)
  }

  const FOOD_LIBRARY_MAX_ENTRIES = 5000
  const foodLibraryUpdateRef = useRef<{ source: 'server' | 'user' | 'local'; updatedAt: number } | null>(
    null,
  )
  const buildFoodLibraryEntry = (entry: any, fallbackDate: string) => {
    const compacted = compactEntryForSnapshot(entry, fallbackDate)
    if (!compacted || typeof compacted !== 'object') return null
    const description = (compacted as any)?.description || (compacted as any)?.label || ''
    if (!description || !String(description).trim()) return null
    const localDate =
      typeof (compacted as any)?.localDate === 'string' && (compacted as any).localDate.length >= 8
        ? String((compacted as any).localDate).slice(0, 10)
        : fallbackDate
    const createdAt = (compacted as any)?.createdAt || new Date().toISOString()
    const category = normalizeCategory((compacted as any)?.meal || (compacted as any)?.category || (compacted as any)?.persistedCategory)
    return {
      ...(compacted as any),
      __library: true,
      description,
      localDate,
      createdAt,
      meal: category,
      category,
      persistedCategory: category,
    }
  }

  const mergeFoodLibraryEntries = (current: any[], additions: any[], fallbackDate: string) => {
    const pool = []
    const base = Array.isArray(current) ? current : []
    const next = Array.isArray(additions) ? additions : []
    for (const entry of [...next, ...base]) {
      const normalized = buildFoodLibraryEntry(entry, fallbackDate)
      if (normalized) pool.push(normalized)
    }
    const deduped = dedupeEntries(pool, { fallbackDate })
    const sorted = deduped.sort((a, b) => {
      const aTs = extractEntryTimestampMs(a)
      const bTs = extractEntryTimestampMs(b)
      if (!Number.isFinite(aTs) && !Number.isFinite(bTs)) return 0
      if (!Number.isFinite(aTs)) return 1
      if (!Number.isFinite(bTs)) return -1
      return bTs - aTs
    })
    return sorted.slice(0, FOOD_LIBRARY_MAX_ENTRIES)
  }

  const refreshFoodLibraryFromServer = useCallback(
    async (options?: { force?: boolean; replace?: boolean }) => {
    if (typeof window === 'undefined') return
    const now = Date.now()
    if (foodLibraryRefreshRef.current.inFlight) return
    const shouldRefresh = shouldRefreshOnResume('library')
    const hasLocal = Array.isArray(foodLibrary) && foodLibrary.length > 0
    if (!options?.force && !shouldRefresh && hasLocal) return
    if (!options?.force && !shouldRefresh && now - foodLibraryRefreshRef.current.last < 5 * 60 * 1000) return
    foodLibraryRefreshRef.current.inFlight = true
    try {
      const res = await fetch('/api/food-log/library?limit=5000', { cache: 'no-store' })
      if (!res.ok) return
      const json = await res.json().catch(() => ({} as any))
      const logs = Array.isArray(json.logs) ? json.logs : []
      if (!logs.length) return
      const mapped = mapLogsToEntries(logs, selectedDate, { preferCreatedAtDate: true }).map((entry: any) => {
        const derived = deriveDateFromEntryTimestamp(entry)
        if (!derived) return entry
        return { ...entry, localDate: derived }
      })
      if (options?.replace) {
        setFoodLibrary(mergeFoodLibraryEntries([], mapped, selectedDate))
      } else {
        setFoodLibrary((prev) => mergeFoodLibraryEntries(prev, mapped, selectedDate))
      }
      if (shouldRefresh) {
        markResumeHandled('library')
      }
    } catch (err) {
      console.warn('Food library refresh failed', err)
    } finally {
      foodLibraryRefreshRef.current.last = now
      foodLibraryRefreshRef.current.inFlight = false
    }
  },
  [mapLogsToEntries, mergeFoodLibraryEntries, selectedDate, foodLibrary],
  )

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!diaryHydrated) return
    const handle = window.setTimeout(() => {
      refreshFoodLibraryFromServer()
    }, 900)
    return () => window.clearTimeout(handle)
  }, [diaryHydrated, refreshFoodLibraryFromServer, resumeTick])

  useEffect(() => {
    if (!showFavoritesPicker) return
    refreshFoodLibraryFromServer({ force: true, replace: true })
  }, [showFavoritesPicker, refreshFoodLibraryFromServer])

  useEffect(() => {
    if (!showFavoritesPicker) {
      const cached = readFavoritesAllSnapshot(userCacheKey)
      setFavoritesAllServerEntries(cached && cached.length > 0 ? cached : null)
      setFavoritesAllServerLoading(false)
      return
    }
    let cancelled = false
    const cached = readFavoritesAllSnapshot(userCacheKey)
    const shouldRefresh = shouldRefreshOnResume('favoritesAll')
    const hasCached = Boolean(cached && cached.length > 0)
    if (hasCached) {
      setFavoritesAllServerEntries(cached)
      setFavoritesAllServerLoading(false)
      if (!shouldRefresh) {
        return () => {
          cancelled = true
        }
      }
    } else {
      setFavoritesAllServerLoading(true)
    }
    ;(async () => {
      try {
        const res = await fetch('/api/food-log/library?limit=5000', { cache: 'no-store' })
        if (!res.ok) return
        const json = await res.json().catch(() => ({} as any))
        const logs = Array.isArray(json.logs) ? json.logs : []
        if (!logs.length) return
        const mapped = mapLogsToEntries(logs, selectedDate, { preferCreatedAtDate: true })
        const deduped = dedupeEntries(mapped, { fallbackDate: selectedDate })
        const normalized = deduped.map((entry: any) => {
          const derived = deriveDateFromEntryTimestamp(entry)
          if (!derived) return entry
          return { ...entry, localDate: derived }
        })
        if (!cancelled) {
          setFavoritesAllServerEntries(normalized)
          writeFavoritesAllSnapshot(userCacheKey, normalized)
          markResumeHandled('favoritesAll')
        }
      } catch (err) {
        console.warn('Favorites list refresh failed', err)
      } finally {
        if (!cancelled) setFavoritesAllServerLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [showFavoritesPicker, selectedDate, userCacheKey, resumeTick])

  const foodNameOverrideMap = useMemo(() => {
    const map = new Map<string, string>()
    const byItemId = new Map<string, string>()
    const byFavoriteId = new Map<string, string>()
    const bySourceId = new Map<string, string>()
    const list = Array.isArray(foodNameOverrides) ? foodNameOverrides : []
    for (const row of list) {
      const fromRaw = typeof (row as any)?.from === 'string' ? String((row as any).from) : ''
      const toRaw = typeof (row as any)?.to === 'string' ? String((row as any).to) : ''
      const itemIdRaw = typeof (row as any)?.itemId === 'string' ? String((row as any).itemId).trim() : ''
      const favIdRaw = typeof (row as any)?.favoriteId === 'string' ? String((row as any).favoriteId).trim() : ''
      const srcIdRaw = typeof (row as any)?.sourceId === 'string' ? String((row as any).sourceId).trim() : ''
      const from = normalizeMealLabel(fromRaw || '')
      const to = normalizeMealLabel(toRaw || '').trim()
      if (!from || !to) continue
      if (itemIdRaw) byItemId.set(itemIdRaw, to)
      if (favIdRaw) byFavoriteId.set(favIdRaw, to)
      if (srcIdRaw) bySourceId.set(srcIdRaw, to)
      const key = normalizeFoodName(from)
      if (key) map.set(key, to)
      try {
        const withoutQty = from.replace(/^\s*\d+(?:\.\d+)?\s*(?:×|x)?\s*/i, '').trim()
        const head = (withoutQty.split(',')[0] || withoutQty).split('(')[0] || withoutQty
        const simpleKey = normalizeFoodName(normalizeMealLabel(head))
        if (simpleKey) map.set(simpleKey, to)
      } catch {}
    }
    ;(map as any).__byItemId = byItemId
    ;(map as any).__byFavoriteId = byFavoriteId
    ;(map as any).__bySourceId = bySourceId
    return map
  }, [foodNameOverrides])

  const applyFoodNameOverride = (raw: any, entry?: any) => {
    try {
      const items = Array.isArray(entry?.items) ? entry.items : null
      const single = Array.isArray(items) && items.length === 1 ? items[0] : null
      const itemId = single && typeof single?.id === 'string' ? String(single.id).trim() : ''
      const byItemId = (foodNameOverrideMap as any)?.__byItemId
      if (itemId && byItemId && typeof byItemId.get === 'function') {
        const hit = byItemId.get(itemId)
        if (hit) return hit
      }
      const favId =
        (entry?.favorite && entry.favorite.id && String(entry.favorite.id)) ||
        (entry?.nutrition && (entry.nutrition as any).__favoriteId) ||
        (entry?.total && (entry.total as any).__favoriteId) ||
        (entry?.id && String(entry.id).startsWith('fav-') ? String(entry.id) : '')
      const byFavoriteId = (foodNameOverrideMap as any)?.__byFavoriteId
      if (favId && byFavoriteId && typeof byFavoriteId.get === 'function') {
        const hit = byFavoriteId.get(String(favId).trim())
        if (hit) return hit
      }
      const srcId =
        (entry?.favorite && entry.favorite.sourceId) ||
        entry?.sourceId ||
        entry?.dbId ||
        (entry?.nutrition && (entry.nutrition as any).__sourceId) ||
        (entry?.total && (entry.total as any).__sourceId)
      const bySourceId = (foodNameOverrideMap as any)?.__bySourceId
      if (srcId && bySourceId && typeof bySourceId.get === 'function') {
        const hit = bySourceId.get(String(srcId).trim())
        if (hit) return hit
      }
    } catch {}
    const base = normalizeMealLabel(raw || '').trim()
    if (!base) return ''
    const key = normalizeFoodName(base)
    const hit = key ? foodNameOverrideMap.get(key) : ''
    if (hit) return hit
    try {
      const withoutQty = base.replace(/^\s*\d+(?:\.\d+)?\s*(?:×|x)?\s*/i, '').trim()
      const head = (withoutQty.split(',')[0] || withoutQty).split('(')[0] || withoutQty
      const simpleKey = normalizeFoodName(normalizeMealLabel(head))
      const simpleHit = simpleKey ? foodNameOverrideMap.get(simpleKey) : ''
      if (simpleHit) return simpleHit
    } catch {}
    return base
  }

  const parseFavoriteItems = (fav: any): any[] | null => {
    const candidate = fav?.items
    if (Array.isArray(candidate)) return candidate
    if (typeof candidate === 'string') {
      try {
        const parsed = JSON.parse(candidate)
        return Array.isArray(parsed) ? parsed : null
      } catch {
        return null
      }
    }
    return null
  }

  // Build-a-meal generates ingredient ids that include a trailing timestamp segment.
  // This is more specific than general "source:id" formats used elsewhere.
  const looksLikeMealBuilderCreatedItemId = (rawId: any) => {
    const id = typeof rawId === 'string' ? rawId : ''
    if (!id) return false
    // Examples:
    // - usda:12345:1734567890123
    // - openfoodfacts:0123456789:1734567890123
    // - ai:1734567890123:deadbeef
    if (/^(openfoodfacts|usda|fatsecret):[^:]+:\d{9,}$/i.test(id)) return true
    if (/^ai:\d{9,}:[0-9a-f]+$/i.test(id)) return true
    // Build-a-meal editor assigns local ids like: edit:1734567890123:deadbeef
    if (/^edit:\d{9,}:[0-9a-f]+$/i.test(id)) return true
    return false
  }

  // Backfill helper: legacy Build-a-meal favorites were saved as method "text".
  // Builder ingredients emit stable `id` prefixes (openfoodfacts/usda/fatsecret/ai) that
  // normal analyzer meals and single-ingredient favorites do not.
  const isLegacyMealBuilderFavorite = (fav: any) => {
    if (!fav) return false
    const items = parseFavoriteItems(fav)
    if (!items || items.length === 0) return false
    return items.some((it: any) => looksLikeMealBuilderCreatedItemId(it?.id))
  }

  const isMealBuilderDiaryEntry = (entry: any) => {
    if (!entry) return false
    const items = Array.isArray(entry?.items) ? entry.items : null
    if (!items || items.length === 0) return false
    return items.some((it: any) => looksLikeMealBuilderCreatedItemId(it?.id))
  }

  const normalizeFavoriteId = (raw: any) => {
    const s = typeof raw === 'string' ? raw.trim() : ''
    return s ? s : null
  }

  const generateFavoriteId = () => `fav-${Date.now()}-${Math.random().toString(16).slice(2)}`

  const stableItemsSignature = (items: any[] | null) => {
    if (!Array.isArray(items) || items.length === 0) return ''
    const parts = items.map((it: any) => {
      const id = typeof it?.id === 'string' ? it.id : ''
      const name = String(it?.name || '').trim().toLowerCase()
      const serving = String(it?.serving_size || '').trim().toLowerCase()
      const cals = Number.isFinite(Number(it?.calories)) ? Math.round(Number(it.calories)) : ''
      return [id, name, serving, cals].filter(Boolean).join('~')
    })
    return parts.filter(Boolean).sort().join('|')
  }

  const buildMealBuilderFavoriteFromEntry = (entry: any, opts?: { idOverride?: string }) => {
    const dbId = entry?.dbId ? String(entry.dbId) : ''
    const label = normalizeMealLabel(entry?.description || entry?.label || 'Meal') || 'Meal'
    const totals = sanitizeNutritionTotals(entry?.total || entry?.nutrition || null) || null
    const items = Array.isArray(entry?.items) ? entry.items : null
    const meal = normalizeCategory(entry?.meal || entry?.category || entry?.mealType)
    return {
      id: (opts?.idOverride || generateFavoriteId()) as string,
      sourceId: dbId || null,
      label,
      description: label,
      nutrition: totals,
      total: totals,
      items,
      photo: null,
      method: 'meal-builder',
      customMeal: true,
      meal,
      createdAt: Date.now(),
    }
  }

  const ensureMealBuilderFavoriteForEntry = (entry: any) => {
    const base = Array.isArray(favorites) ? favorites : []
    const dbId = entry?.dbId ? String(entry.dbId) : ''
    const entryItemsSig = stableItemsSignature(Array.isArray(entry?.items) ? entry.items : null)
    const existing = base.find((fav: any) => {
      if (!fav) return false
      if (dbId && fav?.sourceId && String(fav.sourceId) === dbId) return true
      if (!entryItemsSig) return false
      const favItems = parseFavoriteItems(fav)
      return stableItemsSignature(favItems) === entryItemsSig
    })
    if (existing) {
      const updated = {
        ...(existing as any),
        id: normalizeFavoriteId((existing as any)?.id) || (existing as any)?.id || generateFavoriteId(),
        ...(dbId ? { sourceId: dbId } : {}),
        customMeal: true,
        method: String((existing as any)?.method || 'meal-builder') || 'meal-builder',
      }
      const nextFavorites = base.map((f: any) => (String(f?.id || '') === String(existing?.id || '') ? updated : f))
      const changed = JSON.stringify(existing) !== JSON.stringify(updated)
      return { favorite: updated, nextFavorites, changed }
    }
    const created = buildMealBuilderFavoriteFromEntry(entry)
    const nextFavorites = [...base, created]
    return { favorite: created, nextFavorites, changed: true }
  }

  const isCustomMealFavorite = (fav: any) => {
    if (!fav) return false
    if ((fav as any)?.customMeal === true) return true
    const method = String((fav as any)?.method || '').toLowerCase()
    if (method === 'meal-builder' || method === 'combined') return true
    const origin =
      typeof (fav as any)?.nutrition === 'object' && (fav as any)?.nutrition
        ? String((fav as any).nutrition?.__origin || '').toLowerCase()
        : typeof (fav as any)?.total === 'object' && (fav as any)?.total
        ? String((fav as any).total?.__origin || '').toLowerCase()
        : ''
    if (origin === 'meal-builder' || origin === 'combined') return true
    return false
  }

  const repairAndDedupeFavorites = (list: any[]) => {
    const input = Array.isArray(list) ? list : []
    let changed = false

    // Only normalize basics here. Do NOT auto-migrate or re-classify favorites in the background.
    // (Background rewrites were the root cause of favorites being overwritten on the server.)
    const normalized = input
      .filter((fav) => fav && typeof fav === 'object')
      .map((fav: any) => {
        const next: any = { ...fav }
        const id = normalizeFavoriteId(next.id) || generateFavoriteId()
        if (id !== next.id) {
          next.id = id
          changed = true
        }
        return next
      })

    // Dedupe only on exact id collisions (safest).
    const byId = new Map<string, any>()
    for (const fav of normalized) {
      const id = String(fav?.id || '')
      if (!id) continue
      const existing = byId.get(id)
      if (!existing) {
        byId.set(id, fav)
        continue
      }
      // Keep the most recently created record (best-effort).
      const aTs = Number(existing?.createdAt) || 0
      const bTs = Number(fav?.createdAt) || 0
      if (bTs >= aTs) byId.set(id, fav)
      changed = true
    }

    return { next: Array.from(byId.values()), changed }
  }

  const buildSourceTag = (entry: any) => {
    if (entry?.sourceTag) return entry.sourceTag
    if ((entry as any)?.source) {
      const src = (entry as any).source.toString().toUpperCase()
      if (['CRDB', 'NCCDB', 'CUSTOM FOOD', 'CUSTOM'].includes(src)) return src
      return src
    }
    if ((entry as any)?.method === 'photo') return 'CRDB'
    if ((entry as any)?.method === 'text') return 'Manual'
    return 'CRDB'
  }

  const collectHistoryMeals = (options?: { baseEntries?: any[] }) => {
    const pool: any[] = []
    const tagEntry = (entry: any, source: 'today' | 'history' | 'library' | 'snapshot' | 'server') => {
      if (!entry || typeof entry !== 'object') return entry
      return { ...entry, __favoritesSource: source }
    }
    if (Array.isArray(options?.baseEntries)) {
      pool.push(...options!.baseEntries.map((e: any) => tagEntry(e, 'server')))
    }
    if (Array.isArray(todaysFoods)) pool.push(...todaysFoods.map((e) => tagEntry(e, 'today')))
    if (Array.isArray(historyFoods)) pool.push(...historyFoods.map((e) => tagEntry(e, 'history')))
    if (!Array.isArray(options?.baseEntries)) {
      if (Array.isArray(foodLibrary)) pool.push(...foodLibrary.map((e) => tagEntry(e, 'library')))
      if (persistentDiarySnapshot?.byDate) {
        Object.values(persistentDiarySnapshot.byDate).forEach((snap: any) => {
          if (Array.isArray((snap as any)?.entries)) {
            pool.push(...(snap as any).entries.map((e: any) => tagEntry(e, 'snapshot')))
          }
        })
      }
    }
    const isValidEntry = (entry: any) => {
      if (!entry) return false
      const desc = (entry?.description || entry?.label || '').toString().trim()
      return desc.length > 0
    }
    const dedupeFavoritesHistoryEntries = (entries: any[]) => {
      if (!Array.isArray(entries)) return []
      const preferred = new Map<string, any>()
      const unkeyed: any[] = []
      const sourceRank = (entry: any) => {
        const source = String(entry?.__favoritesSource || '')
        if (source === 'today') return 4
        if (source === 'history') return 3
        if (source === 'server') return 2
        if (source === 'snapshot') return 1
        return 0
      }
      const pickPreferredEntry = (existing: any, entry: any) => {
        if (!existing) return entry
        if (!entry) return existing
        const existingRank = sourceRank(existing)
        const entryRank = sourceRank(entry)
        if (existingRank !== entryRank) return entryRank > existingRank ? entry : existing
        const existingDb = Boolean(existing?.dbId)
        const entryDb = Boolean(entry?.dbId)
        if (existingDb !== entryDb) return entryDb ? entry : existing
        const existingClient = Boolean(getEntryClientId(existing))
        const entryClient = Boolean(getEntryClientId(entry))
        if (existingClient !== entryClient) return entryClient ? entry : existing
        const existingHasItems = Array.isArray(existing?.items) && existing.items.length > 0
        const entryHasItems = Array.isArray(entry?.items) && entry.items.length > 0
        if (existingHasItems !== entryHasItems) return entryHasItems ? entry : existing
        const existingHasTotals = Boolean(existing?.nutrition || existing?.total)
        const entryHasTotals = Boolean(entry?.nutrition || entry?.total)
        if (existingHasTotals !== entryHasTotals) return entryHasTotals ? entry : existing
        const existingTs = extractEntryTimestampMs(existing)
        const entryTs = extractEntryTimestampMs(entry)
        if (Number.isFinite(existingTs) && Number.isFinite(entryTs) && entryTs !== existingTs) {
          return entryTs > existingTs ? entry : existing
        }
        return existing
      }
      const buildKey = (entry: any) => {
        const dbId = (entry as any)?.dbId
        if (dbId) return `db:${dbId}`
        const clientId = getEntryClientId(entry)
        if (clientId) return `client:${clientId}`
        if (entry?.id !== null && entry?.id !== undefined) return `id:${entry.id}`
        return ''
      }
      entries.forEach((entry) => {
        if (isEntryDeleted(entry)) return
        const key = buildKey(entry)
        if (!key) {
          unkeyed.push(entry)
          return
        }
        const existing = preferred.get(key)
        preferred.set(key, pickPreferredEntry(existing, entry))
      })
      return [...preferred.values(), ...unkeyed]
    }
    return dedupeFavoritesHistoryEntries(pool.filter(isValidEntry))
  }

  const buildFavoritesDatasets = () => {
    const serverEntries =
      Array.isArray(favoritesAllServerEntries) && favoritesAllServerEntries.length > 0 ? favoritesAllServerEntries : null
    const history = collectHistoryMeals(serverEntries ? { baseEntries: serverEntries } : undefined)
    const parseEntryTimeToMs = (entry: any) => {
      const dateKey = dateKeyForEntry(entry)
      if (!dateKey) return NaN
      const rawValue = typeof entry?.time === 'string' ? entry.time : ''
      if (!rawValue) return NaN
      let cleaned = rawValue
        .toString()
        .trim()
        .replace(/[\u00A0\u2007\u202F]/g, ' ')
        .replace(/\s+/g, ' ')
        .toLowerCase()
      cleaned = cleaned.replace(/\b([ap])\s*\.?\s*m\.?\b/g, '$1m')
      cleaned = cleaned.replace(/(\d)\.(\d{2})/g, '$1:$2')
      cleaned = cleaned.replace(/\s+/g, ' ').trim()
      let match = cleaned.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?$/)
      let hours = NaN
      let minutes = NaN
      let meridiem = ''
      if (match) {
        hours = Number(match[1])
        minutes = Number(match[2])
        meridiem = match[4] || ''
      } else {
        match = cleaned.match(/^(\d{1,2})\s*(am|pm)$/)
        if (!match) return NaN
        hours = Number(match[1])
        minutes = 0
        meridiem = match[2] || ''
      }
      if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return NaN
      if (meridiem) {
        if (hours === 12) hours = meridiem === 'am' ? 0 : 12
        else if (meridiem === 'pm') hours += 12
      }
      const iso = `${dateKey}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`
      const ms = new Date(iso).getTime()
      return Number.isFinite(ms) ? ms : NaN
    }
    const resolveEntryCreatedAtMs = (entry: any) => {
      const addedRaw =
        entry?.__addedOrder ||
        entry?.nutrition?.__addedOrder ||
        entry?.total?.__addedOrder
      const addedTs = Number.isFinite(Number(addedRaw)) ? Number(addedRaw) : NaN
      if (Number.isFinite(addedTs)) return addedTs
      const loggedRaw =
        entry?.__sourceCreatedAt ||
        entry?.nutrition?.__loggedAt ||
        entry?.total?.__loggedAt ||
        ''
      const loggedTs =
        typeof loggedRaw === 'number' && Number.isFinite(loggedRaw)
          ? loggedRaw
          : loggedRaw
          ? new Date(loggedRaw).getTime()
          : NaN
      if (Number.isFinite(loggedTs)) return loggedTs
      const clientTs = getEntryClientIdTimestampMs(entry)
      if (Number.isFinite(clientTs)) return clientTs
      const entryTs = extractEntryTimestampMs(entry)
      if (Number.isFinite(entryTs)) return entryTs
      const timeBased = parseEntryTimeToMs(entry)
      if (Number.isFinite(timeBased)) return timeBased
      const idCandidate = typeof entry?.id === 'number' ? entry.id : Number(entry?.id)
      const idTs = Number.isFinite(idCandidate) && idCandidate > 946684800000 ? idCandidate : NaN
      if (Number.isFinite(idTs)) return idTs
      const dateKey = dateKeyForEntry(entry)
      if (dateKey) {
        const fallback = new Date(`${dateKey}T12:00:00`).getTime()
        if (Number.isFinite(fallback)) return fallback
      }
      return 0
    }
    const resolveFavoriteCreatedAtMs = (fav: any) => {
      const rawCreatedAt = fav?.createdAt
      const createdAtValue =
        typeof rawCreatedAt === 'string' || rawCreatedAt instanceof Date
          ? new Date(rawCreatedAt).getTime()
          : typeof rawCreatedAt === 'number'
          ? rawCreatedAt
          : Number(rawCreatedAt)
      if (Number.isFinite(createdAtValue) && createdAtValue > 946684800000) return createdAtValue
      const idRaw = fav?.id
      if (typeof idRaw === 'number' && idRaw > 946684800000) return idRaw
      const idStr = typeof idRaw === 'string' ? idRaw : ''
      if (idStr) {
        const match = idStr.match(/(\d{9,})/)
        if (match) {
          const ts = Number(match[1])
          if (Number.isFinite(ts) && ts > 946684800000) return ts
        }
      }
      return 0
    }
    const linkedFavoriteIdForEntry = (entry: any) => {
      try {
        const fromNutrition =
          entry?.nutrition && typeof entry.nutrition === 'object' && typeof (entry.nutrition as any).__favoriteId === 'string'
            ? String((entry.nutrition as any).__favoriteId).trim()
            : ''
        if (fromNutrition) return fromNutrition
        const fromTotal =
          entry?.total && typeof entry.total === 'object' && typeof (entry.total as any).__favoriteId === 'string'
            ? String((entry.total as any).__favoriteId).trim()
            : ''
        return fromTotal
      } catch {
        return ''
      }
    }
    // Use the same normalization we use for food names so things like "Bürgen" and "Burgen"
    // (and various punctuation/spacing differences) still match reliably.
    const normalizeKey = (raw: any, entry?: any) => normalizeFoodName(applyFoodNameOverride(raw || '', entry))
    const simplifyKey = (raw: any) => {
      const s = applyFoodNameOverride(raw || '').trim()
      if (!s) return ''
      const withoutQty = s.replace(/^\s*\d+(?:\.\d+)?\s*(?:×|x)?\s*/i, '').trim()
      const head = (withoutQty.split(',')[0] || withoutQty).split('(')[0] || withoutQty
      return normalizeFoodName(normalizeMealLabel(head))
    }

    // Allow "All" to treat renamed favorites as the same item, without rewriting history.
    const favoriteIdByAlias = new Map<string, string>()
    ;(favorites || []).forEach((fav: any) => {
      const favId = fav?.id ? String(fav.id).trim() : ''
      if (!favId) return
      const labelKey = normalizeKey(fav?.label || fav?.description || '')
      if (labelKey) favoriteIdByAlias.set(labelKey, favId)
      const labelSimple = simplifyKey(fav?.label || fav?.description || '')
      if (labelSimple) favoriteIdByAlias.set(labelSimple, favId)
      const aliases = Array.isArray((fav as any)?.aliases) ? (fav as any).aliases : []
      for (const a of Array.isArray(aliases) ? aliases : []) {
        const k = normalizeKey(a)
        if (k) favoriteIdByAlias.set(k, favId)
        const ks = simplifyKey(a)
        if (ks) favoriteIdByAlias.set(ks, favId)
      }
    })

    // Track favorites by label so "All" can still show edit/delete actions
    // even when a matching history entry exists (same name).
    const favoritesByKey = new Map<string, any>()
    const favoritesById = new Map<string, any>()
    ;(favorites || []).forEach((fav: any) => {
      const key = normalizeKey(fav?.label || fav?.description || favoriteDisplayLabel(fav) || '', fav)
      if (!key) return
      favoritesByKey.set(key, fav)
      if (fav?.id) favoritesById.set(String(fav.id), fav)
    })

    const usedFavoriteIds = new Set<string>()
    const usedLabels = new Set<string>()

    const allMealsRaw = history.map((entry, idx) => {
      const label = (() => {
        const linkedId = linkedFavoriteIdForEntry(entry)
        if (linkedId && favoritesById.has(linkedId)) {
          const fav = favoritesById.get(linkedId)
          return applyFoodNameOverride(favoriteDisplayLabel(fav) || entry?.description || entry?.label || 'Meal', entry)
        }
        // If this entry matches a renamed favorite alias, show the latest favorite label.
        try {
          const labelKey = normalizeKey(entry?.description || entry?.label || '', entry)
          const aliasId =
            (labelKey ? favoriteIdByAlias.get(labelKey) : '') ||
            (() => {
              const s = simplifyKey(entry?.description || entry?.label || '')
              return s ? favoriteIdByAlias.get(s) : ''
            })()
          if (aliasId && favoritesById.has(aliasId)) {
            const fav = favoritesById.get(aliasId)
            return applyFoodNameOverride(favoriteDisplayLabel(fav) || entry?.description || entry?.label || 'Meal', entry)
          }
        } catch {}
        return applyFoodNameOverride(entry?.description || entry?.label || 'Meal', entry)
      })()

      const favorite =
        (entry as any)?.sourceTag === 'Favorite'
          ? entry
          : (() => {
              const linkedId = linkedFavoriteIdForEntry(entry) || ''
              if (linkedId && favoritesById.has(linkedId)) return favoritesById.get(linkedId)
              try {
                const labelKey = normalizeKey(entry?.description || entry?.label || '')
                const aliasId =
                  (labelKey ? favoriteIdByAlias.get(labelKey) : '') ||
                  (() => {
                    const s = simplifyKey(entry?.description || entry?.label || '')
                    return s ? favoriteIdByAlias.get(s) : ''
                  })()
                if (aliasId && favoritesById.has(aliasId)) return favoritesById.get(aliasId)
              } catch {}
              return favoritesByKey.get(normalizeKey(entry?.description || entry?.label || '', entry)) || null
            })()

      if (favorite?.id) usedFavoriteIds.add(String(favorite.id))
      const labelKey = normalizeFoodName(String(label || '').trim())
      if (labelKey) usedLabels.add(labelKey)

      const createdAtValue = resolveEntryCreatedAtMs(entry)

      return {
        id: entry?.dbId ? `log-${entry.dbId}` : entry?.id || `all-${idx}`,
        label,
        entry,
        favorite,
        createdAt: createdAtValue,
        sortPriority: 2,
        sourceTag: (entry as any)?.sourceTag === 'Favorite' ? 'Favorite' : buildSourceTag(entry),
        calories: sanitizeNutritionTotals(entry?.total || entry?.nutrition || null)?.calories ?? null,
        serving: entry?.items?.[0]?.serving_size || entry?.serving || entry?.items?.[0]?.servings || '',
      }
    })

    const allMealsUnique = allMealsRaw

    // "All" should show every meal, including favorites that aren't in history yet.
    const allMealsWithFavorites = [...allMealsUnique]
    ;(favorites || []).forEach((fav: any) => {
      const favId = fav?.id ? String(fav.id).trim() : ''
      const label =
        applyFoodNameOverride(fav?.label || fav?.description || 'Favorite meal') ||
        favoriteDisplayLabel(fav) ||
        normalizeMealLabel(fav?.description || fav?.label || 'Favorite meal')
      const labelKey = normalizeFoodName(String(label || '').trim())
      if (favId && usedFavoriteIds.has(favId)) return
      if (labelKey && usedLabels.has(labelKey)) return
      allMealsWithFavorites.push({
        id: favId || `fav-${Math.random()}`,
        label,
        entry: null,
        favorite: fav,
        createdAt: resolveFavoriteCreatedAtMs(fav),
        sortPriority: 1,
        sourceTag: 'Favorite',
        calories: sanitizeNutritionTotals(fav?.total || fav?.nutrition || null)?.calories ?? null,
        serving: fav?.items?.[0]?.serving_size || fav?.serving || '',
      })
    })

    const favoriteMeals = (favorites || []).map((fav: any) => ({
      id: fav?.id || `fav-${Math.random()}`,
      label: applyFoodNameOverride(fav?.label || fav?.description || 'Favorite meal') || favoriteDisplayLabel(fav) || normalizeMealLabel(fav?.description || fav?.label || 'Favorite meal'),
      favorite: fav,
      createdAt: resolveFavoriteCreatedAtMs(fav),
      sortPriority: 1,
      sourceTag: 'Favorite',
      calories: sanitizeNutritionTotals(fav?.total || fav?.nutrition || null)?.calories ?? null,
      serving: fav?.items?.[0]?.serving_size || fav?.serving || '',
    }))

    // Product request: "Custom" only shows meals the user created (Build-a-meal / Combined).
    const customMeals = favoriteMeals.filter((m: any) => isCustomMealFavorite(m?.favorite))

    return { allMeals: allMealsWithFavorites, favoriteMeals, customMeals }
  }

  // IMPORTANT: Do not auto-create or auto-persist favorites based on diary history.
  // Favorites should only be changed when the user explicitly takes an action.

  const resetTorchState = () => {
    barcodeTorchTrackRef.current = null
    setTorchEnabled(false)
    setTorchAvailable(false)
  }

  const disableTorch = () => {
    const track = barcodeTorchTrackRef.current
    if (track && typeof track.applyConstraints === 'function') {
      try {
        const constraints: MediaTrackConstraints & { advanced?: Array<{ torch?: boolean }> } = {
          advanced: [{ torch: false }],
        }
        ;(track as any).applyConstraints(constraints).catch(() => {})
      } catch {}
    }
    resetTorchState()
  }

  const attachTorchTrack = (stream: MediaStream | null) => {
    if (!stream) {
      resetTorchState()
      return
    }
    const track = stream.getVideoTracks?.()[0]
    barcodeTorchTrackRef.current = track || null
    const capabilities = (track?.getCapabilities?.() as any) || {}
    const canTorch = !!capabilities.torch
    setTorchAvailable(canTorch)
    if (!canTorch) setTorchEnabled(false)
  }

  const attachTorchTrackFromDom = (retry: boolean = true) => {
    if (typeof document === 'undefined') return
    const region = document.getElementById(BARCODE_REGION_ID)
    const videoEl = region?.querySelector('video') as HTMLVideoElement | null
    const stream = (videoEl?.srcObject as MediaStream) || null
    if (!stream && retry) {
      setTimeout(() => attachTorchTrackFromDom(false), 250)
      return
    }
    attachTorchTrack(stream)
  }

  const stopNativeBarcodeDetector = () => {
    disableTorch()
    const hadNativeVideo = !!nativeBarcodeVideoRef.current
    if (nativeBarcodeFrameRef.current) {
      cancelAnimationFrame(nativeBarcodeFrameRef.current)
      nativeBarcodeFrameRef.current = null
    }
    if (hybridBarcodeFrameRef.current) {
      cancelAnimationFrame(hybridBarcodeFrameRef.current)
      hybridBarcodeFrameRef.current = null
    }
    if (nativeBarcodeVideoRef.current) {
      try {
        nativeBarcodeVideoRef.current.pause()
      } catch {}
      nativeBarcodeVideoRef.current.srcObject = null
      nativeBarcodeVideoRef.current.remove()
      nativeBarcodeVideoRef.current = null
    }
    if (nativeBarcodeStreamRef.current) {
      nativeBarcodeStreamRef.current.getTracks().forEach((t) => {
        try {
          t.stop()
        } catch {}
      })
      nativeBarcodeStreamRef.current = null
    }
    if (hadNativeVideo && typeof document !== 'undefined') {
      const region = document.getElementById(BARCODE_REGION_ID)
      if (region) region.innerHTML = ''
    }
  }

  const stopBarcodeScanner = () => {
    setBarcodeStatusHint('')
    disableTorch()
    const scanner = barcodeScannerRef.current as any
    if (scanner?.controls?.stop) {
      try {
        scanner.controls.stop()
      } catch {}
    }
    if (scanner?.reader?.reset) {
      try {
        scanner.reader.reset()
      } catch {}
    }
    if (scanner?.videoEl) {
      try {
        scanner.videoEl.pause()
      } catch {}
      try {
        scanner.videoEl.srcObject = null
      } catch {}
      try {
        scanner.videoEl.remove()
      } catch {}
    }
    if (scanner?.stream) {
      try {
        ;(scanner.stream as MediaStream).getTracks().forEach((t) => t.stop())
      } catch {}
    }
    barcodeScannerRef.current = null
    if (typeof document !== 'undefined') {
      const region = document.getElementById(BARCODE_REGION_ID)
      if (region) region.innerHTML = ''
    }
  }

  const resetBarcodeState = () => {
    setBarcodeStatus('idle')
    setBarcodeError(null)
    setBarcodeValue('')
    setShowManualBarcodeInput(false)
    barcodeReplaceTargetRef.current = null
    barcodeActionRef.current = null
    resetTorchState()
  }

  const startBarcodeLabelCapture = (payload: {
    barcode: string
    reason: 'missing' | 'report'
    productName?: string | null
    brand?: string | null
  }) => {
    setBarcodeLabelFlow(payload)
    setShowBarcodeLabelPrompt(false)
    setShowBarcodeScanner(false)
    setBarcodeError(null)
    setAnalysisMode('packaged')
    setShowAddFood(true)
    setShowAiResult(false)
    setIsEditingDescription(false)
    setPhotoOptionsAnchor(null)
    setPendingPhotoPicker(false)
    setShowAnalysisModeModal(false)
    setAutoAnalyzeLabelPhoto(true)
    if (typeof window !== 'undefined') {
      if (barcodeLabelTimeoutRef.current) {
        clearTimeout(barcodeLabelTimeoutRef.current)
      }
      barcodeLabelTimeoutRef.current = window.setTimeout(() => {
        if (!photoPreviewRef.current) {
          setAutoAnalyzeLabelPhoto(false)
          setBarcodeLabelFlow(null)
        }
      }, 20000)
    }
    try {
      selectPhotoInputRef.current?.click()
    } catch {}
  }

  const buildBarcodeIngredientItem = (food: any, code?: string) => {
    const toNumber = (value: any) => {
      const num = Number(value)
      return Number.isFinite(num) ? num : null
    }
    const piecesPerServingRaw =
      Number.isFinite(Number(food?.piecesPerServing)) && Number(food?.piecesPerServing) > 0
        ? Number(food?.piecesPerServing)
        : Number.isFinite(Number(food?.pieces_per_serving)) && Number(food?.pieces_per_serving) > 0
        ? Number(food?.pieces_per_serving)
        : Number.isFinite(Number(food?.pieces)) && Number(food?.pieces) > 0
        ? Number(food?.pieces)
        : null
    const piecesRaw =
      Number.isFinite(Number(food?.pieces)) && Number(food?.pieces) > 0
        ? Number(food?.pieces)
        : piecesPerServingRaw && piecesPerServingRaw > 0
        ? piecesPerServingRaw
        : null
    const servingSizeRaw =
      food?.serving_size ||
      (Number.isFinite(Number(food?.quantity_g)) && Number(food?.quantity_g) > 0 ? `${Number(food.quantity_g)} g` : null)
    let serving_size = servingSizeRaw || '1 serving'
    const liquidItem = isLikelyLiquidFood(String(food?.name || ''), serving_size)
    if (liquidItem && /\b(\d+(?:\.\d+)?)\s*g\b/i.test(serving_size) && !/\bml\b/i.test(serving_size)) {
      serving_size = serving_size.replace(/\b(\d+(?:\.\d+)?)\s*g\b/i, '$1 ml')
    }
    if (!liquidItem) {
      const normalizedServing = normalizeServingSizeForLiquid(serving_size, liquidItem)
      if (normalizedServing) serving_size = normalizedServing
    }
    const servingInfo = parseServingSizeInfo({ serving_size })
    const quantityG =
      Number.isFinite(Number(food?.quantity_g)) && Number(food?.quantity_g) > 0
        ? Number(food?.quantity_g)
        : servingInfo?.gramsPerServing && servingInfo.gramsPerServing > 0
        ? Number(servingInfo.gramsPerServing)
        : null
    const quantityMl =
      !quantityG && servingInfo?.mlPerServing && servingInfo.mlPerServing > 0
        ? Number(servingInfo.mlPerServing)
        : null
    const useMl = liquidItem && ((quantityMl && quantityMl > 0) || (quantityG && quantityG > 0))
    const mlValue = useMl ? (quantityMl && quantityMl > 0 ? quantityMl : quantityG) : null
    const gramValue = useMl ? null : (quantityG && quantityG > 0 ? quantityG : quantityMl)
    const customGramsPerServing = gramValue ? gramValue : null
    const customMlPerServing = mlValue ? mlValue : null
    const weightUnit = useMl ? 'ml' : 'g'
    const weightAmount = useMl ? mlValue : gramValue
    return {
      name: food?.name || 'Scanned food',
      brand: food?.brand || null,
      serving_size,
      servings: 1,
      portionMode: 'servings',
      weightAmount,
      weightUnit,
      customGramsPerServing,
      customMlPerServing,
      calories: toNumber(food?.calories),
      protein_g: toNumber(food?.protein_g),
      carbs_g: toNumber(food?.carbs_g),
      fat_g: toNumber(food?.fat_g),
      fiber_g: toNumber(food?.fiber_g),
      sugar_g: toNumber(food?.sugar_g),
      piecesPerServing: piecesPerServingRaw,
      pieces: piecesRaw,
      source: food?.source || 'barcode',
      barcode: code || food?.barcode || null,
      barcodeSource: food?.source || null,
      detectionMethod: 'barcode',
    }
  }

  const isBarcodeEntry = (entry: any) =>
    Array.isArray(entry?.items) &&
    entry.items.some(
      (it: any) => it?.barcode || it?.detectionMethod === 'barcode' || it?.barcodeSource,
    )

  const insertBarcodeFoodIntoDiary = async (food: any, code?: string) => {
    const category = normalizeCategory(selectedAddCategory)
    const opStamp = Date.now()
    const loggedAtIso = new Date().toISOString()
    const addedOrder = Date.now()
    const createdAtIso = alignTimestampToLocalDate(loggedAtIso, selectedDate)
    const displayTime = new Date(createdAtIso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    const item = buildBarcodeIngredientItem(food, code)
    const normalizedItems = normalizeDiscreteServingsWithLabel([item])
    const items = normalizedItems.length > 0 ? normalizedItems : [item]
    const drinkOverride = pendingDrinkOverrideRef.current
    const drinkMeta = consumePendingDrinkMeta(drinkOverride)
    const adjusted = applyDrinkOverrideToItems(items, drinkOverride)
    const finalItems = adjusted.items || items
    if (adjusted.used) pendingDrinkOverrideRef.current = null
    const recalculatedTotals = recalculateNutritionFromItems(finalItems)
    const totals =
      recalculatedTotals ||
      sanitizeNutritionTotals({
        calories: food?.calories,
        protein: food?.protein_g,
        carbs: food?.carbs_g,
        fat: food?.fat_g,
        fiber: food?.fiber_g,
        sugar: food?.sugar_g,
      })
    const totalsWithMeta = applyDrinkMetaToTotals(totals, drinkMeta)
    const totalsForStorage = applyDrinkMetaToTotals(convertTotalsForStorage(totalsWithMeta || totals), drinkMeta)
    const description =
      buildMealSummaryFromItems(finalItems) ||
      [food?.name, food?.brand].filter(Boolean).join(' – ') ||
      'Scanned food'
    const entry = ensureEntryLoggedAt(
      applyEntryClientId(
        {
          id: makeUniqueLocalEntryId(
            new Date(createdAtIso).getTime(),
            `barcode:${opStamp}|${selectedDate}|${category}|${normalizedDescription(description)}`,
          ),
          localDate: selectedDate,
          description,
          time: displayTime,
          method: 'text',
          photo: null,
          nutrition: totalsWithMeta,
          total: totalsForStorage,
          items: finalItems,
          meal: category,
          category,
          persistedCategory: category,
          createdAt: createdAtIso,
        },
        `barcode:${opStamp}|${selectedDate}|${category}|${normalizedDescription(description)}`,
      ),
      loggedAtIso,
      addedOrder,
    )
    const updated = dedupeEntries([entry, ...todaysFoods], { fallbackDate: selectedDate })
    setTodaysFoods(updated)
    if (!isViewingToday) {
      setHistoryFoods((prev: any[] | null) => {
        const base = Array.isArray(prev) ? prev : []
        return dedupeEntries([entry, ...base], { fallbackDate: selectedDate })
      })
    }
    setExpandedCategories((prev) => ({
      ...prev,
      [category]: true,
    }))
    triggerHaptic(10)
    queueScrollToDiaryEntry({ entryKey: entry.id, category })
    try {
      await saveFoodEntries(updated)
      await refreshEntriesFromServer()
      showQuickToast(`Added to ${categoryLabel(category)}`)
    } catch (err) {
      console.warn('Barcode add sync failed', err)
    } finally {
      setPhotoOptionsAnchor(null)
      setShowAddFood(false)
      setShowPhotoOptions(false)
    }
  }

  const saveBarcodeLabelIfNeeded = async (items: any[] | null | undefined) => {
    if (!barcodeLabelFlow?.barcode) return
    const primary = Array.isArray(items) && items.length > 0 ? items[0] : null
    if (!primary) return

    const servingSize = stripNutritionFromServingSize(primary?.serving_size || '')
    const servingInfo = parseServingSizeInfo({ serving_size: servingSize })
    const quantityG =
      Number.isFinite(Number(primary?.customGramsPerServing)) && Number(primary.customGramsPerServing) > 0
        ? Number(primary.customGramsPerServing)
        : servingInfo?.gramsPerServing && servingInfo.gramsPerServing > 0
        ? Number(servingInfo.gramsPerServing)
        : null
    const piecesPerServing = getPiecesPerServing(primary)
    try {
      const res = await fetch('/api/barcode/label', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          barcode: barcodeLabelFlow.barcode,
          report: barcodeLabelFlow.reason === 'report',
          item: {
            name: primary?.name || barcodeLabelFlow.productName || 'Packaged item',
            brand: primary?.brand || barcodeLabelFlow.brand || null,
            serving_size: servingSize,
            calories: primary?.calories,
            protein_g: primary?.protein_g,
            carbs_g: primary?.carbs_g,
            fat_g: primary?.fat_g,
            fiber_g: primary?.fiber_g,
            sugar_g: primary?.sugar_g,
            quantity_g: quantityG,
            piecesPerServing,
          },
        }),
      })
      if (res.ok) {
        showQuickToast('Saved for future barcode scans')
      } else {
        showQuickToast('Saved to your diary, but the barcode label did not save')
      }
    } catch (err) {
      console.warn('Barcode label save failed', err)
      showQuickToast('Saved to your diary, but the barcode label did not save')
    } finally {
      setBarcodeLabelFlow(null)
      setShowBarcodeLabelPrompt(false)
      if (barcodeLabelTimeoutRef.current) {
        clearTimeout(barcodeLabelTimeoutRef.current)
        barcodeLabelTimeoutRef.current = null
      }
    }
  }

  const validateLabelItems = (
    items: any[] | null | undefined,
    options: { enforce: boolean; preferBarcodeTarget: boolean },
  ) => {
    if (!options.enforce) return { ok: true, message: '' }
    const list = Array.isArray(items) ? items : []
    if (list.length === 0) return { ok: true, message: '' }
    const target = options.preferBarcodeTarget
      ? list.find((it) => it?.barcode || it?.barcodeSource || it?.detectionMethod === 'barcode') || list[0]
      : list[0]
    if (!target) return { ok: true, message: '' }
    if (target?.labelNeedsReview) {
      return {
        ok: false,
        message:
          target?.labelNeedsReviewMessage ||
          'We could not read the per serve column clearly. Please retake the label photo.',
      }
    }
    const servingSize = stripNutritionFromServingSize(String(target?.serving_size || ''))
    const servingInfo = parseServingSizeInfo({ serving_size: servingSize })
    const customWeight =
      Number.isFinite(Number(target?.customGramsPerServing)) && Number(target.customGramsPerServing) > 0
        ? Number(target.customGramsPerServing)
        : Number.isFinite(Number(target?.customMlPerServing)) && Number(target.customMlPerServing) > 0
        ? Number(target.customMlPerServing)
        : null
    const weight = customWeight ?? servingInfo.gramsPerServing ?? servingInfo.mlPerServing ?? null
    if (!weight || weight <= 0) return { ok: true, message: '' }

    const safe = (value: any) => (Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : 0)
    const protein = safe(target?.protein_g)
    const carbs = safe(target?.carbs_g)
    const fat = safe(target?.fat_g)
    const fiber = safe(target?.fiber_g)
    const calories = safe(target?.calories)

    const macroSum = protein + carbs + fat + fiber
    const macroLimit = weight * 1.3 + 2
    if (macroSum > macroLimit) {
      return {
        ok: false,
        message:
          "These numbers don't fit the serving size. It looks like the per-100g column was used. Please retake the label photo or edit the macros to match the label.",
      }
    }

    const calorieLimit = weight * 9.5 + 10
    if (calories > calorieLimit) {
      return {
        ok: false,
        message:
          'Calories are far too high for that serving size. Please retake the label photo or edit the macros to match the label.',
      }
    }

    return { ok: true, message: '' }
  }

  const labelStrictMode = Boolean(barcodeLabelFlow?.barcode) || (analysisMode === 'packaged' && !!photoPreview)
  const labelValidation = useMemo(
    () =>
      validateLabelItems(analyzedItems, {
        enforce: labelStrictMode,
        preferBarcodeTarget: Boolean(barcodeLabelFlow?.barcode),
      }),
    [analyzedItems, barcodeLabelFlow, analysisMode, photoPreview, labelStrictMode],
  )
  const labelBlocked = labelStrictMode && !labelValidation.ok
  const openLabelEdit = () => {
    const list = Array.isArray(analyzedItems) ? analyzedItems : []
    if (list.length === 0) return
    const targetIndex = barcodeLabelFlow?.barcode
      ? list.findIndex((it) => it?.barcode || it?.barcodeSource || it?.detectionMethod === 'barcode')
      : 0
    const index = targetIndex >= 0 ? targetIndex : 0
    setEditingItemIndex(index)
    setShowItemEditModal(true)
  }

  const lookupBarcodeAndAdd = async (code: string) => {
    const normalized = (code || '').replace(/[^0-9A-Za-z]/g, '')
    if (!normalized) {
      setBarcodeError('Enter a valid barcode to search.')
      setBarcodeStatus('scanning')
      return
    }
    if (barcodeLookupInFlightRef.current) return
    const replaceIndex = barcodeReplaceTargetRef.current
    const actionMode = barcodeActionRef.current
    barcodeLookupInFlightRef.current = true
    setBarcodeStatus('loading')
    setBarcodeError(null)
    try {
      const res = await fetch(`/api/barcode/lookup?code=${encodeURIComponent(normalized)}`)
      if (res.status === 404) {
        const data = await res.json().catch(() => null)
        setBarcodeStatus('idle')
        setBarcodeError(null)
        if (replaceIndex !== null && replaceIndex !== undefined) {
          setBarcodeError('No food found for this barcode. Try again or use photo.')
          setBarcodeStatus('scanning')
          startBarcodeScanner()
        } else {
          setShowBarcodeScanner(false)
          setBarcodeLabelFlow({
            barcode: normalized,
            reason: 'missing',
            productName: data?.product?.name || null,
            brand: data?.product?.brand || null,
          })
          setShowBarcodeLabelPrompt(true)
        }
        return
      }
      if (res.status === 402) {
        const data = await res.json().catch(() => null)
        const msg =
          data?.message ||
          data?.error ||
          'Not enough credits to scan. Each barcode scan costs 3 credits.'
        setBarcodeError(msg)
        setBarcodeStatus('idle')
        return
      }
      if (res.status === 422) {
        const data = await res.json().catch(() => null)
        setBarcodeStatus('idle')
        setBarcodeError(null)
        if (replaceIndex !== null && replaceIndex !== undefined) {
          setBarcodeError('No food found for this barcode. Try again or use photo.')
          setBarcodeStatus('scanning')
          startBarcodeScanner()
        } else {
          setShowBarcodeScanner(false)
          setBarcodeLabelFlow({
            barcode: normalized,
            reason: 'missing',
            productName: data?.product?.name || null,
            brand: data?.product?.brand || null,
          })
          setShowBarcodeLabelPrompt(true)
        }
        return
      }
      if (res.status === 401) {
        setBarcodeError('Please sign in to scan barcodes.')
        setBarcodeStatus('idle')
        return
      }
      if (!res.ok) {
        const txt = await res.text()
        throw new Error(txt || 'Lookup failed')
      }
      const data = await res.json()
      if (!data?.food) {
        setBarcodeError('No food found for this barcode. Try again or enter it manually.')
        setBarcodeStatus('scanning')
        startBarcodeScanner()
        return
      }
      if (replaceIndex !== null && replaceIndex !== undefined) {
        replaceIngredientFromBarcodeFood(data.food, normalized, replaceIndex)
        barcodeReplaceTargetRef.current = null
      } else if (actionMode === 'analysis') {
        addBarcodeIngredientToAnalysis(data.food, normalized)
      } else {
        await insertBarcodeFoodIntoDiary(data.food, normalized)
      }
      setShowBarcodeScanner(false)
      setBarcodeValue('')
      setShowManualBarcodeInput(false)
      barcodeActionRef.current = null
    } catch (err) {
      console.error('Barcode lookup failed', err)
      setBarcodeError('Could not find a match. Please rescan or type the code.')
      setBarcodeStatus('scanning')
      startBarcodeScanner()
    } finally {
      barcodeLookupInFlightRef.current = false
    }
  }

  const handleBarcodeDetected = (rawCode: string) => {
    if (!rawCode || barcodeLookupInFlightRef.current) return
    const cleaned = rawCode.replace(/[^0-9A-Za-z]/g, '')
    if (!cleaned) return
    if (hybridBarcodeFrameRef.current) {
      cancelAnimationFrame(hybridBarcodeFrameRef.current)
      hybridBarcodeFrameRef.current = null
    }
    stopBarcodeScanner()
    lookupBarcodeAndAdd(cleaned)
  }

  const toggleTorch = async () => {
    const track = barcodeTorchTrackRef.current
    if (!track) {
      setTorchAvailable(false)
      setTorchEnabled(false)
      setBarcodeError('Flash is not available for this camera.')
      return
    }
    const capabilities = typeof track.getCapabilities === 'function' ? (track.getCapabilities() as any) : null
    if (!capabilities?.torch) {
      setTorchAvailable(false)
      setTorchEnabled(false)
      setBarcodeError('Flash is not available for this camera.')
      return
    }
    try {
      const next = !torchEnabled
      const constraints: MediaTrackConstraints & { advanced?: Array<{ torch?: boolean }> } = {
        advanced: [{ torch: next }],
      }
      await (track as any).applyConstraints(constraints)
      setTorchEnabled(next)
      setBarcodeError(null)
    } catch (err) {
      console.warn('Torch toggle failed', err)
      setBarcodeError('Could not control the flash on this device.')
      resetTorchState()
    }
  }

  const startHybridDetector = () => {
    if (typeof window === 'undefined' || typeof (window as any).BarcodeDetector === 'undefined') return
    const region = document.getElementById(BARCODE_REGION_ID)
    const videoEl = region?.querySelector('video') as HTMLVideoElement | null
    if (!videoEl) return
    const detector = new (window as any).BarcodeDetector({
      formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'code_93', 'codabar'],
    })
    const scanFrame = async () => {
      try {
        const detections = await detector.detect(videoEl)
        const first = detections?.[0]
        const detectedValue =
          first?.rawValue ||
          (first?.rawData ? new TextDecoder().decode(first.rawData) : null)
        if (detectedValue) {
          handleBarcodeDetected(detectedValue)
          return
        }
      } catch {
        // ignore and continue
      }
      hybridBarcodeFrameRef.current = requestAnimationFrame(scanFrame)
    }
    hybridBarcodeFrameRef.current = requestAnimationFrame(scanFrame)
  }

  const startNativeBarcodeDetector = async (desiredFacing: 'front' | 'back') => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return false
    const BarcodeDetectorCtor = (window as any).BarcodeDetector
    if (!BarcodeDetectorCtor) return false
    const region = document.getElementById(BARCODE_REGION_ID)
    if (!region) return false

    stopNativeBarcodeDetector()

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: desiredFacing === 'front' ? 'user' : { ideal: 'environment' },
        },
      })
      const videoEl = document.createElement('video')
      videoEl.setAttribute('playsinline', 'true')
      videoEl.setAttribute('autoplay', 'true')
      videoEl.muted = true
      videoEl.style.width = '100%'
      videoEl.style.height = '100%'
      videoEl.style.objectFit = 'cover'
      region.innerHTML = ''
      region.appendChild(videoEl)
      videoEl.srcObject = stream

      nativeBarcodeStreamRef.current = stream
      nativeBarcodeVideoRef.current = videoEl
      attachTorchTrack(stream)

      await videoEl.play().catch(() => {})

      const detector = new BarcodeDetectorCtor({
        formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'code_93', 'codabar'],
      })

      const scanFrame = async () => {
        if (!nativeBarcodeVideoRef.current) return
        try {
          const detections = await detector.detect(nativeBarcodeVideoRef.current)
          const first = detections?.[0]
          const detectedValue =
            first?.rawValue ||
            (first?.rawData ? new TextDecoder().decode(first.rawData) : null)
          if (detectedValue) {
            handleBarcodeDetected(detectedValue)
            return
          }
        } catch (err) {
          console.error('Native barcode detect error', err)
        }
        nativeBarcodeFrameRef.current = requestAnimationFrame(scanFrame)
      }

      nativeBarcodeFrameRef.current = requestAnimationFrame(scanFrame)
      return true
    } catch (err) {
      console.error('Native barcode start failed', err)
      stopNativeBarcodeDetector()
      return false
    }
  }

  // GUARD RAIL: Barcode scanner is locked. Do not change decoder/library/flow without explicit user approval.
  // ZXing decodeFromConstraints with rear camera + autofocus + try-harder; no photo flow or alternate decoders.
  const startBarcodeScanner = async (options?: { forceFacing?: 'front' | 'back' }) => {
    if (!showBarcodeScanner) return
    resetTorchState()
    setShowManualBarcodeInput(false)
    const desiredFacing: 'front' | 'back' = options?.forceFacing || cameraFacing || 'back'
    setBarcodeStatus('loading')
    setBarcodeStatusHint('Starting camera…')
    try {
      setBarcodeError(null)
      barcodeLookupInFlightRef.current = false
      stopBarcodeScanner()
      if (typeof window === 'undefined' || typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        setBarcodeError('Camera is only available in the browser.')
        setBarcodeStatusHint('Camera unavailable in this browser')
        setBarcodeStatus('idle')
        return
      }
      const region = document.getElementById(BARCODE_REGION_ID)
      if (!region) {
        setBarcodeError('Camera area missing. Close and reopen the scanner.')
        setBarcodeStatusHint('Camera area missing')
        setBarcodeStatus('idle')
        return
      }

      region.innerHTML = ''
      const videoEl = document.createElement('video')
      videoEl.setAttribute('playsinline', 'true')
      videoEl.setAttribute('autoplay', 'true')
      videoEl.muted = true
      videoEl.playsInline = true
      videoEl.autoplay = true
      videoEl.style.width = '100%'
      videoEl.style.height = '100%'
      videoEl.style.objectFit = 'cover'
      region.appendChild(videoEl)

      const { BrowserMultiFormatReader, BarcodeFormat } = await import('@zxing/browser')
      const { DecodeHintType } = await import('@zxing/library')

      const hints = new Map()
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
        BarcodeFormat.UPC_A,
        BarcodeFormat.UPC_E,
        BarcodeFormat.CODE_128,
        BarcodeFormat.CODE_39,
        BarcodeFormat.CODE_93,
        BarcodeFormat.ITF,
      ])
      hints.set(DecodeHintType.TRY_HARDER, true)

      const reader = new BrowserMultiFormatReader()
      reader.setHints(hints)

      const constraints: any = {
        video: {
          facingMode: desiredFacing === 'front' ? 'user' : { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
          advanced: [{ focusMode: 'continuous' }],
        },
      }

      const controls = await reader.decodeFromConstraints(constraints, videoEl, (result: any) => {
        const text = result?.getText ? result.getText() : result?.text
        if (text) handleBarcodeDetected(text)
      })

      barcodeScannerRef.current = { reader, controls, videoEl }
      setCameraFacing(desiredFacing)
      setBarcodeStatus('scanning')
      setBarcodeStatusHint('Scanning…')
      setTimeout(() => attachTorchTrackFromDom(), 150)
    } catch (err) {
      console.error('Barcode scanner start error', err)
      setBarcodeError('Could not start the camera. Please allow camera access, then tap Restart.')
      setBarcodeStatusHint('Camera start failed')
      setBarcodeStatus('idle')
      stopBarcodeScanner()
    }
  }

  useEffect(() => {
    if (showBarcodeScanner) {
      startBarcodeScanner()
    } else {
      stopBarcodeScanner()
      resetBarcodeState()
    }
    return () => {
      stopBarcodeScanner()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showBarcodeScanner])

  useEffect(() => {
    if (showManualBarcodeInput && manualBarcodeInputRef.current) {
      manualBarcodeInputRef.current.focus()
    }
  }, [showManualBarcodeInput])

  const handleDeleteEditingEntry = async () => {
    if (!editingEntry || isDeletingEditingEntry) return
    try {
      setIsDeletingEditingEntry(true)
      triggerHaptic(16)
      if (isViewingToday) {
        await deleteFood(editingEntry)
      } else if ((editingEntry as any)?.dbId) {
        await deleteHistoryFood((editingEntry as any).dbId)
      } else {
        await deleteFood(editingEntry)
      }
    } finally {
      setIsDeletingEditingEntry(false)
      exitEditingSession()
    }
  }

  const persistFavorites = (nextFavorites: any[]) => {
    updateUserData({ favorites: nextFavorites })
    try {
      fetch('/api/user-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ favorites: nextFavorites }),
      }).catch(() => {})
    } catch (error) {
      console.error('Failed to persist favorites', error)
    }
  }

  const persistFoodLibrary = (nextLibrary: any[]) => {
    setFoodLibrary(nextLibrary)
    updateUserData({ foodLibrary: nextLibrary } as any)
    try {
      fetch('/api/user-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ foodLibrary: nextLibrary }),
      }).catch(() => {})
    } catch (error) {
      console.error('Failed to persist food library', error)
    }
  }

  const addEntriesToFoodLibrary = (entries: any[]) => {
    const fallbackDate = selectedDate || todayIso
    const merged = mergeFoodLibraryEntries(foodLibrary, entries, fallbackDate)
    persistFoodLibrary(merged)
  }

  const persistFoodNameOverrides = (nextOverrides: any[]) => {
    updateUserData({ foodNameOverrides: nextOverrides } as any)
    try {
      fetch('/api/user-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ foodNameOverrides: nextOverrides }),
      }).catch(() => {})
    } catch (error) {
      console.error('Failed to persist food name overrides', error)
    }
  }

  const renamePersistentDiaryEntries = useCallback(
    (mapper: (entry: any) => any) => {
      if (typeof window === 'undefined') return
      try {
        const snapshot = readPersistentDiarySnapshot()
        if (!snapshot || !snapshot.byDate) return
        let changed = false
        const nextSnapshot: DiarySnapshot = { byDate: {} }
        Object.entries(snapshot.byDate).forEach(([iso, data]) => {
          if (!data || !Array.isArray(data.entries)) {
            nextSnapshot.byDate[iso] = data
            return
          }
          const updatedEntries = (data.entries || []).map((entry) => {
            const mapped = mapper(entry)
            if (mapped !== entry) changed = true
            return mapped
          })
          nextSnapshot.byDate[iso] = { ...(data || {}), entries: updatedEntries }
        })
        if (changed) {
          writePersistentDiarySnapshot(nextSnapshot)
          refreshPersistentDiarySnapshot()
        }
      } catch (error) {
        console.warn('Failed to rename persistent diary entries', error)
      }
    },
    [refreshPersistentDiarySnapshot],
  )

  const renameEntriesWithLabel = (fromKey: string, toLabel: string) => {
    const updateEntry = (entry: any) => {
      if (!entry) return entry
      const labelKey = normalizeFoodName(normalizeMealLabel(entry?.description || entry?.label || ''))
      if (!labelKey || labelKey !== fromKey) return entry
      return {
        ...entry,
        description: toLabel,
        label: toLabel,
      }
    }

    setTodaysFoods((prev) => (Array.isArray(prev) ? prev.map(updateEntry) : prev))
    setHistoryFoods((prev) => (Array.isArray(prev) ? prev.map(updateEntry) : prev))
    renamePersistentDiaryEntries(updateEntry)
  }

  const saveFoodNameOverride = (fromLabel: any, toLabel: any, entry?: any) => {
    const from = normalizeMealLabel(fromLabel || '').trim()
    const to = normalizeMealLabel(toLabel || '').trim()
    if (!from || !to || from === to) return
    const fromKey = normalizeFoodName(from)
    if (!fromKey) return
    let itemId = ''
    let favoriteId = ''
    let sourceId = ''
    try {
      const items = Array.isArray(entry?.items) ? entry.items : null
      const single = Array.isArray(items) && items.length === 1 ? items[0] : null
      itemId = single && typeof single?.id === 'string' ? String(single.id).trim() : ''
      favoriteId =
        (entry?.favorite && entry.favorite.id && String(entry.favorite.id)) ||
        (entry?.nutrition && (entry.nutrition as any).__favoriteId) ||
        (entry?.total && (entry.total as any).__favoriteId) ||
        (entry?.id && String(entry.id).startsWith('fav-') ? String(entry.id) : '') ||
        ''
      sourceId =
        (entry?.favorite && entry.favorite.sourceId) ||
        entry?.sourceId ||
        entry?.dbId ||
        (entry?.nutrition && (entry.nutrition as any).__sourceId) ||
        (entry?.total && (entry.total as any).__sourceId) ||
        ''
    } catch {}
    setFoodNameOverrides((prev) => {
      const base = Array.isArray(prev) ? prev : []
      const next = base.filter((row: any) => {
        const rowItemId = typeof row?.itemId === 'string' ? String(row.itemId).trim() : ''
        const rowFavId = typeof row?.favoriteId === 'string' ? String(row.favoriteId).trim() : ''
        const rowSrcId = typeof row?.sourceId === 'string' ? String(row.sourceId).trim() : ''
        if (itemId && rowItemId && rowItemId === itemId) return false
        if (favoriteId && rowFavId && rowFavId === favoriteId) return false
        if (sourceId && rowSrcId && rowSrcId === sourceId) return false
        return normalizeFoodName(normalizeMealLabel(row?.from || '')) !== fromKey
      })
      next.unshift({
        from,
        to,
        ...(itemId ? { itemId } : {}),
        ...(favoriteId ? { favoriteId } : {}),
        ...(sourceId ? { sourceId } : {}),
        createdAt: Date.now(),
      })
      persistFoodNameOverrides(next)
      return next
    })
    renameEntriesWithLabel(fromKey, to)
  }

  const saveFavoriteFromEntry = (
    source: any,
    opts?: { labelOverride?: string; forceCustomMeal?: boolean },
  ): { favorite: any; nextFavorites: any[] } | null => {
    if (!source) return null
    const sourceLabelForAlias = (() => {
      const raw = source?.description || source?.label || ''
      const cleaned = normalizeMealLabel(raw) || String(raw || '').trim()
      return cleaned
    })()
    const cleanLabel = (() => {
      const raw =
        typeof opts?.labelOverride === 'string' && opts.labelOverride.trim().length > 0
          ? opts.labelOverride
          : extractBaseMealDescription(source.description || '') ||
            (source.description || 'Favorite meal').split('\n')[0].split('Calories:')[0].trim()
      return normalizeMealLabel(raw) || raw || 'Favorite meal'
    })()

    const clonedItems =
      source.items && Array.isArray(source.items) && source.items.length > 0
        ? JSON.parse(JSON.stringify(source.items))
        : null
    const sourceMethod = String(source?.method || 'text').toLowerCase()
    const inferredCustomMeal =
      opts?.forceCustomMeal === true ||
      source?.customMeal === true ||
      sourceMethod === 'combined' ||
      sourceMethod === 'meal-builder' ||
      isMealBuilderDiaryEntry(source)

    const id = `fav-${Date.now()}`
    const favoritePayload = {
      id,
      // Prefer the real DB id when present; mapped history entries use `id` as a timestamp UI key.
      sourceId: (source as any)?.dbId || (source as any)?.id || null,
      label: cleanLabel || 'Favorite meal',
      description: cleanLabel || 'Favorite meal',
      nutrition: source.nutrition || source.total || null,
      total: source.total || source.nutrition || null,
      items: clonedItems,
      photo: source.photo || null,
      method:
        inferredCustomMeal && sourceMethod !== 'meal-builder' && sourceMethod !== 'combined'
          ? 'meal-builder'
          : (source.method || 'text'),
      ...(inferredCustomMeal ? { customMeal: true } : {}),
      meal: normalizeCategory(source.meal || source.category || source.mealType),
      createdAt: Date.now(),
    }

    const base = Array.isArray(favorites) ? favorites : []
    const existingIndex = base.findIndex(
      (fav: any) =>
        (fav.sourceId && favoritePayload.sourceId && fav.sourceId === favoritePayload.sourceId) ||
        (fav.label && favoritePayload.label && fav.label === favoritePayload.label),
    )
    const payloadWithStableId =
      existingIndex >= 0 ? { ...favoritePayload, id: base[existingIndex]?.id || favoritePayload.id } : favoritePayload

    // If the user saved with a new name, remember the old name as an alias so "All" doesn't show duplicates.
    const withAliases = (() => {
      const shouldAlias = sourceLabelForAlias && sourceLabelForAlias !== cleanLabel
      if (!shouldAlias) return payloadWithStableId
      const existingAliases = Array.isArray((payloadWithStableId as any)?.aliases) ? (payloadWithStableId as any).aliases : []
      const aliases = Array.from(new Set([...(Array.isArray(existingAliases) ? existingAliases : []), sourceLabelForAlias]))
      return { ...(payloadWithStableId as any), aliases }
    })()

    const next =
      existingIndex >= 0
        ? base.map((fav: any, idx: number) => (idx === existingIndex ? withAliases : fav))
        : [...base, withAliases]
    setFavorites(next)
    persistFavorites(next)
    return { favorite: withAliases, nextFavorites: next }
  }

  const insertMealIntoDiary = async (source: any, targetCategory?: typeof MEAL_CATEGORY_ORDER[number]) => {
    if (!source) return
    const category = normalizeCategory(targetCategory || selectedAddCategory)
    const now = Date.now()
    const loggedAtIso = new Date(now).toISOString()
    const addedOrder = now
    triggerHaptic(10)
    setQuickToast(`Adding to ${categoryLabel(category)}...`)
    const createdAtIso = alignTimestampToLocalDate(loggedAtIso, selectedDate)
    const displayTime = new Date(createdAtIso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    const description = applyFoodNameOverride(source?.description || source?.label || source?.favorite?.label || 'Meal', source)
    const debounceKey = `${normalizedDescription(description)}|${selectedDate}|${category}`
    const lastInsert = mealInsertDebounceRef.current[debounceKey] || 0
    if (now - lastInsert < 800) return
    mealInsertDebounceRef.current[debounceKey] = now
    beginDiaryMutation()
    const totals =
      sanitizeNutritionTotals(source?.nutrition || source?.total || source?.entry?.total || source?.entry?.nutrition) ||
      null
    const items = (() => {
      const candidate =
        source?.items ||
        source?.entry?.items ||
        (Array.isArray(source?.favorite?.items) ? JSON.parse(JSON.stringify(source.favorite.items)) : null)
      if (Array.isArray(candidate)) return candidate
      if (typeof candidate === 'string') {
        try {
          const parsed = JSON.parse(candidate)
          return Array.isArray(parsed) ? parsed : null
        } catch {
          return null
        }
      }
      return null
    })()
    const drinkOverride = pendingDrinkOverrideRef.current
    const adjusted = applyDrinkOverrideToItems(items, drinkOverride)
    const finalItems = adjusted.items || items
    const finalTotals = adjusted.used ? adjusted.totals || totals : totals
    if (adjusted.used) pendingDrinkOverrideRef.current = null
    const drinkMeta = consumePendingDrinkMeta(drinkOverride)
    const totalsWithMeta = applyDrinkMetaToTotals(finalTotals, drinkMeta)
    const newEntry = ensureEntryLoggedAt(
      applyEntryClientId(
        {
          id: makeUniqueLocalEntryId(
            new Date(createdAtIso).getTime(),
            `insert:${now}|${selectedDate}|${category}|${normalizedDescription(description)}`,
          ),
          localDate: selectedDate,
          description,
          time: displayTime,
          method: source?.method || 'text',
          photo: source?.photo || source?.entry?.photo || null,
          nutrition: totalsWithMeta,
          total: totalsWithMeta,
          items: finalItems,
          meal: category,
          category,
          persistedCategory: category,
          createdAt: createdAtIso,
        },
        `insert:${now}|${selectedDate}|${category}|${normalizedDescription(description)}`,
      ),
      loggedAtIso,
      addedOrder,
    )
    const pendingKey = buildPendingSaveKey(newEntry, selectedDate)
    const pendingEntry = markEntryPendingSave(newEntry, pendingKey)
    // If the user previously deleted this same item (same day + category + description),
    // we keep a tombstone to prevent server "resurrections". But if the user is *intentionally*
    // re-adding it now, we must clear that tombstone so it can appear again.
    removeDeletedTombstonesForEntries([pendingEntry])
    const baseForDate = dedupeEntries(
      filterEntriesForDate(todaysFoods, selectedDate),
      { fallbackDate: selectedDate },
    )
    const updated = dedupeEntries([pendingEntry, ...baseForDate], { fallbackDate: selectedDate })
    updateTodaysFoodsForDate(updated, selectedDate)
    maybeShowHealthCheckPrompt(pendingEntry)
    if (!isViewingToday) {
      setHistoryFoods((prev: any[] | null) => {
        const base = Array.isArray(prev) ? prev : []
        return dedupeEntries([pendingEntry, ...base], { fallbackDate: selectedDate })
      })
    }
    setExpandedCategories((prev) => ({ ...prev, [category]: true }))
    queueScrollToDiaryEntry({ entryKey: pendingEntry.id, category })
    enqueuePendingFoodLogSave(pendingEntry, selectedDate)
    try {
      await syncSnapshotOnly(updated, selectedDate)
      showQuickToast(`Added to ${categoryLabel(category)}`)
    } catch (err) {
      console.warn('Meal insert sync failed', err)
    } finally {
      setPhotoOptionsAnchor(null)
      setShowAddFood(false)
      setShowPhotoOptions(false)
      closeFavoritesPicker()
      endDiaryMutation()
    }
  }

  const isEntryAlreadyFavorite = (entry?: any) => {
    if (!entry) return false
    const favoriteId =
      (entry?.favorite && entry.favorite.id && String(entry.favorite.id)) ||
      (entry?.nutrition &&
      typeof entry.nutrition === 'object' &&
      typeof (entry.nutrition as any).__favoriteId === 'string'
        ? String((entry.nutrition as any).__favoriteId)
        : '') ||
      (entry?.total &&
      typeof entry.total === 'object' &&
      typeof (entry.total as any).__favoriteId === 'string'
        ? String((entry.total as any).__favoriteId)
        : '') ||
      (entry?.id && String(entry.id).startsWith('fav-') ? String(entry.id) : '') ||
      ''
    if (favoriteId) return true

    const sourceId =
      (entry?.favorite && entry.favorite.sourceId) ||
      entry?.sourceId ||
      entry?.dbId ||
      entry?.id ||
      ''
    const nameKey = normalizeFoodName(normalizeMealLabel(entry?.description || entry?.label || ''))
    const list = Array.isArray(favorites) ? favorites : []
    return list.some((fav: any) => {
      const favSourceId = fav?.sourceId ? String(fav.sourceId) : ''
      if (sourceId && favSourceId && String(sourceId) === favSourceId) return true
      const favLabel = normalizeFoodName(
        normalizeMealLabel(favoriteDisplayLabel(fav) || fav?.label || fav?.description || ''),
      )
      if (nameKey && favLabel && nameKey === favLabel) return true
      return false
    })
  }

  const handleAddToFavorites = (entry?: any) => {
    const source = entry || editingEntry
    if (!source) {
      showQuickToast('Could not add to favorites')
      return
    }
    const saved = saveFavoriteFromEntry(source)
    // If this came from the diary history (FoodLog), persist a link so future edits can keep the name in sync.
    try {
      const dbId = (source as any)?.dbId ? String((source as any).dbId) : ''
      const favId = String(saved?.favorite?.id || '').trim()
      if (dbId && favId) {
        const baseNutrition = source?.nutrition || source?.total || null
        const origin = (() => {
          const m = String(saved?.favorite?.method || '').toLowerCase()
          return m === 'meal-builder' || m === 'combined' ? m : ''
        })()
        const linkedNutrition =
          baseNutrition && typeof baseNutrition === 'object'
            ? { ...(baseNutrition as any), __favoriteId: favId, ...(origin ? { __origin: origin } : {}) }
            : baseNutrition
        fetch('/api/food-log', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: dbId,
            description: source?.description || null,
            nutrition: linkedNutrition,
            imageUrl: source?.photo || null,
            items: Array.isArray(source?.items) ? source.items : null,
            localDate: source?.localDate || selectedDate,
            meal: source?.meal || source?.category,
            category: source?.category || source?.meal,
          }),
        }).catch(() => {})
      }
    } catch {}
    showQuickToast('Added to favorites')
  }

  const closeFavoritesPicker = () => {
    setShowFavoritesPicker(false)
    favoritesReplaceTargetRef.current = null
    favoritesActionRef.current = null
  }

  const insertFavoriteIntoDiary = async (favorite: any, targetCategory?: typeof MEAL_CATEGORY_ORDER[number]) => {
    if (!favorite) return
    const category = normalizeCategory(targetCategory || selectedAddCategory)
    const now = Date.now()
    const loggedAtIso = new Date(now).toISOString()
    const addedOrder = now
    const debounceKey = `${favorite?.id || favorite?.label || 'favorite'}|${selectedDate}|${category}`
    const last = favoriteInsertDebounceRef.current[debounceKey] || 0
    // Mobile browsers can fire multiple taps/clicks; guard to avoid triple inserts.
    if (now - last < 1200) return
    favoriteInsertDebounceRef.current[debounceKey] = now
    beginDiaryMutation()

    const createdAtIso = alignTimestampToLocalDate(loggedAtIso, selectedDate)
    const clonedItems =
      favorite.items && Array.isArray(favorite.items) && favorite.items.length > 0
        ? JSON.parse(JSON.stringify(favorite.items))
        : null
    const baseDescription = favorite.label || favorite.description || 'Favorite meal'
    const favoriteId = typeof favorite?.id === 'string' ? favorite.id.trim() : ''
    const origin = (() => {
      const m = String(favorite?.method || '').toLowerCase()
      return m === 'meal-builder' || m === 'combined' ? m : ''
    })()
    const attachMeta = (raw: any) => {
      if (!raw || typeof raw !== 'object') return raw
      const next: any = { ...(raw as any) }
      if (favoriteId) next.__favoriteId = favoriteId
      if (origin) next.__origin = origin
      return next
    }
    const drinkOverride = pendingDrinkOverrideRef.current
    const adjusted = applyDrinkOverrideToItems(clonedItems, drinkOverride)
    const finalItems = adjusted.items || clonedItems
    const adjustedTotals = adjusted.used ? adjusted.totals || null : null
    if (adjusted.used) pendingDrinkOverrideRef.current = null
    const drinkMeta = consumePendingDrinkMeta(drinkOverride)
    const baseTotals = attachMeta(adjustedTotals || favorite.nutrition || favorite.total || null)
    const totalsWithMeta = applyDrinkMetaToTotals(baseTotals, drinkMeta)
    const totalWithMeta = applyDrinkMetaToTotals(adjustedTotals || favorite.total || favorite.nutrition || null, drinkMeta)

    const entry = ensureEntryLoggedAt(
      applyEntryClientId(
        {
          id: makeUniqueLocalEntryId(
            new Date(createdAtIso).getTime(),
            `favorite:${now}|${selectedDate}|${category}|${normalizedDescription(baseDescription)}`,
          ),
          localDate: selectedDate,
          description: baseDescription,
          time: new Date(createdAtIso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          method: favorite.method || 'text',
          photo: favorite.photo || null,
          nutrition: totalsWithMeta,
          items: Array.isArray(finalItems)
            ? finalItems
            : typeof (favorite as any)?.items === 'string'
            ? (() => {
                try {
                  const parsed = JSON.parse(String((favorite as any).items))
                  return Array.isArray(parsed) ? parsed : null
                } catch {
                  return null
                }
              })()
            : null,
          total: totalWithMeta,
          meal: category,
          category,
          persistedCategory: category,
          createdAt: createdAtIso,
        },
        `favorite:${now}|${selectedDate}|${category}|${normalizedDescription(baseDescription)}`,
      ),
      loggedAtIso,
      addedOrder,
    )
    const pendingKey = buildPendingSaveKey(entry, selectedDate)
    const pendingEntry = markEntryPendingSave(entry, pendingKey)
    removeDeletedTombstonesForEntries([pendingEntry])
    setSelectedAddCategory(category as typeof MEAL_CATEGORY_ORDER[number])
    setExpandedCategories((prev) => ({
      ...prev,
      [category]: true,
    }))
    const baseForDate = dedupeEntries(
      filterEntriesForDate(todaysFoods, selectedDate),
      { fallbackDate: selectedDate },
    )
    const updatedFoods = dedupeEntries([pendingEntry, ...baseForDate], { fallbackDate: selectedDate })
    updateTodaysFoodsForDate(updatedFoods, selectedDate)
    triggerHaptic(10)
    queueScrollToDiaryEntry({ entryKey: pendingEntry.id, category })
    closeFavoritesPicker()
    setShowPhotoOptions(false)
    setShowAddFood(false)
    setQuickToast(`Adding to ${categoryLabel(category)}...`)
    maybeShowDietWarningToast(pendingEntry)
    maybeShowHealthCheckPrompt(pendingEntry)
    if (!isViewingToday) {
      setHistoryFoods((prev: any[] | null) => {
        const base = Array.isArray(prev) ? prev : []
        return dedupeEntries([{ ...pendingEntry, dbId: undefined }, ...base], { fallbackDate: selectedDate })
      })
    }
    enqueuePendingFoodLogSave(pendingEntry, selectedDate)
    try {
      await syncSnapshotOnly(updatedFoods, selectedDate)
      showQuickToast(`Added to ${categoryLabel(category)}`)
    } catch (err) {
      console.warn('Favorite add sync failed', err)
    } finally {
      setPhotoOptionsAnchor(null)
      endDiaryMutation()
    }
  }

  const handleDeleteFavorite = (id: string) => {
    setFavoriteSwipeOffsets((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    setFavorites((prev) => {
      const next = prev.filter((fav: any) => fav.id !== id)
      persistFavorites(next)
      return next
    })
    showQuickToast('Favorite removed')
  }

  const openRenameModal = (current: string, onSave: (value: string) => void) => {
    const safeCurrent = (current || '').toString()
    setRenameOriginal(safeCurrent)
    setRenameValue(safeCurrent)
    setRenameCleared(false)
    renameSaveRef.current = onSave
    setShowRenameModal(true)
  }

  const closeRenameModal = () => {
    setShowRenameModal(false)
    setRenameValue(renameOriginal)
    setRenameCleared(false)
  }

  const handleRenameConfirm = () => {
    const nextName = (renameValue || '').toString().trim()
    setShowRenameModal(false)
    setRenameCleared(false)
    if (!nextName) return
    const save = renameSaveRef.current
    if (save) {
      save(nextName)
    }
  }

  const handleRenameFavorite = (id: string) => {
    const favId = String(id || '').trim()
    if (!favId) return
    const existing = (Array.isArray(favorites) ? favorites : []).find((f: any) => String(f?.id || '') === favId) || null
    if (!existing) return
    const current = applyFoodNameOverride(favoriteDisplayLabel(existing) || 'Favorite') || 'Favorite'
    openRenameModal(current, (nextName) => {
      const cleaned = normalizeMealLabel(nextName) || nextName
      try {
        saveFoodNameOverride(favoriteDisplayLabel(existing) || current, cleaned, existing)
      } catch {}
      setFavorites((prev) => {
        const next = (Array.isArray(prev) ? prev : []).map((fav: any) => {
          if (String(fav?.id || '') !== favId) return fav
          const existingLabel = favoriteDisplayLabel(fav) || ''
          const aliases = Array.isArray((fav as any)?.aliases) ? ([...(fav as any).aliases] as string[]) : []
          const normalizedExisting = normalizeMealLabel(existingLabel) || existingLabel
          if (normalizedExisting && normalizedExisting !== cleaned && !aliases.includes(normalizedExisting)) {
            aliases.push(normalizedExisting)
          }
          return { ...fav, label: cleaned, description: cleaned, ...(aliases.length > 0 ? { aliases } : {}) }
        })
        persistFavorites(next)
        return next
      })
      showQuickToast('Renamed')
    })
  }

  const duplicateEntryToCategory = async (targetCategory: typeof MEAL_CATEGORY_ORDER[number]) => {
    if (!duplicateModalContext || duplicateInFlightRef.current) return
    duplicateInFlightRef.current = true
    beginDiaryMutation()
    const { entry: source, targetDate, mode } = duplicateModalContext
    setSwipeMenuEntry(null)
    setEntrySwipeOffsets({})
    setShowEntryOptions(null)
    const category = normalizeCategory(targetCategory)
    const baseDescription = source.description || source.label || 'Duplicated meal'
    const opStamp = Date.now()
    const actionKey = [
      getEntryClientId(source) || (source as any)?.dbId || source?.id || '',
      targetDate,
      category,
      mode,
    ].join('|')
    const lastAction = duplicateActionDebounceRef.current[actionKey] || 0
    if (opStamp - lastAction < 900) {
      duplicateInFlightRef.current = false
      setDuplicateModalContext(null)
      endDiaryMutation()
      return
    }
    duplicateActionDebounceRef.current[actionKey] = opStamp
    const sourceTs = extractEntryTimestampMs(source)
    const nowTs = Date.now()
    const sourceBucket = Number.isFinite(sourceTs) ? Math.floor(sourceTs / 60000) : null
    const nowBucket = Math.floor(nowTs / 60000)
    const baseTs = sourceBucket !== null && sourceBucket === nowBucket ? nowTs + 60000 : nowTs
    const loggedAtIso = new Date(baseTs).toISOString()
    const addedOrder = baseTs
    const createdAtIso = alignTimestampToLocalDate(loggedAtIso, targetDate)
    const displayTime = new Date(createdAtIso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    const clonedItems =
      source.items && Array.isArray(source.items) && source.items.length > 0
        ? JSON.parse(JSON.stringify(source.items))
        : null
    const copiedEntry = markEntryAllowDuplicate(
      ensureEntryLoggedAt(
        applyEntryClientId(
          {
            ...source,
            clientId: undefined,
            id: makeUniqueLocalEntryId(
              new Date(createdAtIso).getTime(),
              `duplicate:${opStamp}|${targetDate}|${category}|${normalizedDescription(baseDescription)}`,
            ),
            dbId: undefined,
            localDate: targetDate,
            time: displayTime,
            meal: category,
            category,
            persistedCategory: category,
            items: clonedItems,
            description: baseDescription,
            createdAt: createdAtIso,
          },
          `duplicate:${opStamp}|${targetDate}|${category}|${normalizedDescription(baseDescription)}`,
          { forceNew: true },
        ),
        loggedAtIso,
        addedOrder,
      ),
    )
    const pendingKey = buildPendingSaveKey(copiedEntry, targetDate)
    const pendingEntry = markEntryPendingSave(copiedEntry, pendingKey)
    removeDeletedTombstonesForEntries([pendingEntry])
    setSelectedAddCategory(category as typeof MEAL_CATEGORY_ORDER[number])
    const normalizedHistory = Array.isArray(historyFoods) ? historyFoods : []
    const isTargetToday = targetDate === todayIso
    const isTargetSelected = targetDate === selectedDate
    const dedupeTargetDate = targetDate || selectedDate

    const dedupeList = (entries: any[]) => dedupeEntries(entries, { fallbackDate: dedupeTargetDate })

    let updatedTodaysFoods = todaysFoods
    let updatedHistoryFoods = normalizedHistory
    let foodsForSave = todaysFoods

    if (isTargetToday || (isTargetSelected && isViewingToday)) {
      const baseForDate = dedupeEntries(
        filterEntriesForDate(todaysFoods, dedupeTargetDate),
        { fallbackDate: dedupeTargetDate },
      )
      updatedTodaysFoods = dedupeList([pendingEntry, ...baseForDate])
      updateTodaysFoodsForDate(updatedTodaysFoods, dedupeTargetDate)
      updatePersistentDiarySnapshotForDate(updatedTodaysFoods, dedupeTargetDate)
      foodsForSave = updatedTodaysFoods
    } else if (isTargetSelected && !isViewingToday) {
      updatedHistoryFoods = dedupeList([pendingEntry, ...normalizedHistory])
      setHistoryFoods(updatedHistoryFoods)
      updatePersistentDiarySnapshotForDate(updatedHistoryFoods, dedupeTargetDate)
      foodsForSave = updatedHistoryFoods
    } else {
      const baseForDate = dedupeEntries(
        filterEntriesForDate(todaysFoods, dedupeTargetDate),
        { fallbackDate: dedupeTargetDate },
      )
      updatedTodaysFoods = dedupeList([pendingEntry, ...baseForDate])
      updateTodaysFoodsForDate(updatedTodaysFoods, dedupeTargetDate)
      updatePersistentDiarySnapshotForDate(updatedTodaysFoods, dedupeTargetDate)
      foodsForSave = updatedTodaysFoods
    }
    holdVerifyMergeForDate(dedupeTargetDate)
    enqueuePendingFoodLogSave(pendingEntry, dedupeTargetDate)

    const toastMessage =
      mode === 'copyToToday'
        ? `Copied to ${categoryLabel(category)} today`
        : `Duplicated to ${categoryLabel(category)}`
    setExpandedCategories((prev) => ({
      ...prev,
      [category]: true,
    }))
    showQuickToast(toastMessage)
    maybeShowDietWarningToast(pendingEntry)
    maybeShowHealthCheckPrompt(pendingEntry)
    setDuplicateModalContext(null)
    triggerHaptic(10)

    try {
      await syncSnapshotOnly(foodsForSave, dedupeTargetDate)
    } catch (err) {
      console.warn('Duplicate/copy sync failed', err)
    } finally {
      duplicateInFlightRef.current = false
      endDiaryMutation()
    }
  }

  // Copy all entries for a given meal/category to today in one tap (used from the category add menu)
  const copyCategoryEntriesToToday = async (categoryKey: typeof MEAL_CATEGORY_ORDER[number], entries: any[]) => {
    if (!entries || entries.length === 0) {
      showQuickToast(`No ${categoryLabel(categoryKey)} entries to copy`)
      return
    }
    beginDiaryMutation()
    try {
    const category = normalizeCategory(categoryKey)
    const targetDate = todayIso
    const metaStamp = Date.now()
    const clones = entries.map((entry: any, idx: number) => {
      // Use the copy action time as the base so repeat copy actions remain distinct.
      const baseTs = Date.now()
      // Offset each entry slightly to avoid de-dupe collapsing them (description/time collisions).
      const adjusted = Number.isFinite(baseTs) ? new Date(baseTs + idx * 60000).toISOString() : new Date().toISOString()
      const addedOrder = Number.isFinite(baseTs) ? baseTs + idx * 60000 : Date.now()
      const anchored = alignTimestampToLocalDate(adjusted, targetDate)
      const time = new Date(anchored).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      const baseDescription = entry.description || entry.label || 'Duplicated meal'
      const baseMs = new Date(anchored).getTime()
      const clonedItems =
        entry.items && Array.isArray(entry.items) && entry.items.length > 0
          ? JSON.parse(JSON.stringify(entry.items))
          : null
      const baseEntry = markEntryAllowDuplicate(
        ensureEntryLoggedAt(
          applyEntryClientId(
            {
              ...entry,
              clientId: undefined,
              id: makeUniqueLocalEntryId(
                baseMs,
                `copycat:${metaStamp}|${targetDate}|${category}|${normalizedDescription(baseDescription)}|${idx}`,
              ),
              dbId: undefined,
              localDate: targetDate,
              createdAt: anchored,
              time,
              meal: category,
              category,
              persistedCategory: category,
              items: clonedItems,
              description: baseDescription,
            },
            `copycat:${metaStamp}|${targetDate}|${category}|${normalizedDescription(baseDescription)}|${idx}`,
            { forceNew: true },
          ),
          adjusted,
          addedOrder,
        ),
      )
      const pendingKey = buildPendingSaveKey(baseEntry, targetDate)
      return markEntryPendingSave(baseEntry, pendingKey)
    })
    removeDeletedTombstonesForEntries(clones)
    setSelectedAddCategory(categoryKey)
    const baseForDate = dedupeEntries(
      filterEntriesForDate(todaysFoods, targetDate),
      { fallbackDate: targetDate },
    )
    const deduped = dedupeEntries([...clones, ...baseForDate], { fallbackDate: targetDate })
    updateTodaysFoodsForDate(deduped, targetDate)
    updatePersistentDiarySnapshotForDate(deduped, targetDate)
    clones.forEach((clone) => enqueuePendingFoodLogSave(clone, targetDate))
    holdVerifyMergeForDate(targetDate)
    setExpandedCategories((prev) => ({ ...prev, [categoryKey]: true }))
    showQuickToast(`Copied ${categoryLabel(categoryKey)} to today`)
    // Warn once if any copied meals don't match the selected diets.
    try {
      const dietIds = normalizeDietTypes((userData as any)?.dietTypes ?? (userData as any)?.dietType)
      if (dietIds.length) {
        const anyMismatch = clones.some((clone: any) => {
          const itemNames = Array.isArray(clone?.items)
            ? clone.items
                .map((it: any) => (it?.name || it?.label || '').toString().trim())
                .filter((v: string) => v.length > 0)
            : []
          const totals = buildDietTotalsForCheck(clone)
          const res = checkMultipleDietCompatibility({
            dietIds,
            itemNames,
            analysisText: (clone?.description || '').toString(),
            totals,
          })
          return res.warningsByDiet.length > 0
        })
        if (anyMismatch) {
          setTimeout(() => {
            showQuickToast('Heads up: some copied meals may not match your selected diets.')
          }, 1600)
        }
      }
    } catch {}
    try {
      // Persist to user-data snapshot (without history append to avoid single-entry overwrite)
      await syncSnapshotOnly(deduped, targetDate)
    } catch (err) {
      console.warn('Copy category to today failed', err)
    }
    } finally {
      endDiaryMutation()
    }
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
      setBarcodeLabelFlow(null)
      setShowBarcodeLabelPrompt(false)
      setAutoAnalyzeLabelPhoto(false)
      if (barcodeLabelTimeoutRef.current) {
        clearTimeout(barcodeLabelTimeoutRef.current)
        barcodeLabelTimeoutRef.current = null
      }
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
    try {
      if (!food) {
        showQuickToast('Could not open this entry')
        return
      }
      const safeDescription = (food.description ?? '').toString()
      const safeItems = (() => {
        if (Array.isArray(food.items)) return food.items
        if (typeof food.items === 'string') {
          try {
            const parsed = JSON.parse(food.items)
            return Array.isArray(parsed) ? parsed : null
          } catch {
            return null
          }
        }
        return null
      })()
      const safePhoto = typeof food.photo === 'string' ? food.photo : null
      const rawTotals = food.nutrition || food.total || null
      const safeNutrition = sanitizeNutritionTotals(rawTotals) || EMPTY_TOTALS
      const mergedNutrition = (() => {
        const base: any = { ...(safeNutrition as any) }
        if (rawTotals && typeof rawTotals === 'object') {
          Object.keys(rawTotals).forEach((key) => {
            if (key.startsWith('__')) {
              base[key] = (rawTotals as any)[key]
            }
          })
        }
        return base
      })()
      const safeFood = {
        ...food,
        description: safeDescription,
        items: safeItems,
        photo: safePhoto,
        nutrition: mergedNutrition,
        total: mergedNutrition || null,
      }
      editingDrinkMetaRef.current = getDrinkMetaFromEntry(food)

      // Custom meals should be edited in the Build-a-meal editor (not the analyzer-style editor).
      try {
        const dbId = (safeFood as any)?.dbId ? String((safeFood as any).dbId) : ''
        const key = normalizeMealLabel(safeFood.description || '').toLowerCase()
        const explicitMethod = String((safeFood as any)?.method || '').toLowerCase()
        const originMethod = String(
          (safeFood as any)?.nutrition?.__origin ||
            (safeFood as any)?.total?.__origin ||
            (safeFood as any)?.favorite?.method ||
            '',
        ).toLowerCase()
        const method = explicitMethod || originMethod
        const builderLogId =
          dbId ||
          (typeof (safeFood as any)?.sourceId === 'string'
            ? (safeFood as any).sourceId
            : typeof (safeFood as any)?.sourceId === 'number'
            ? String((safeFood as any).sourceId)
            : '') ||
          (typeof (safeFood as any)?.favorite?.sourceId === 'string'
            ? safeFood.favorite.sourceId
            : typeof (safeFood as any)?.favorite?.sourceId === 'number'
            ? String((safeFood as any).favorite.sourceId)
            : '')

        // If this entry is known to be a Build-a-meal / Combined entry (durable marker),
        // always open it in the Build-a-meal editor for edits.
        if ((method === 'meal-builder' || method === 'combined') && builderLogId) {
          const favCategory = normalizeCategory(safeFood?.meal || safeFood?.category || safeFood?.mealType)
          const qs = new URLSearchParams()
          qs.set('date', selectedDate)
          qs.set('category', String(favCategory))
          qs.set('sourceLogId', builderLogId)
          router.push(`/food/build-meal?${qs.toString()}`)
          return
        }

        // Back-compat: if this looks like a Build-a-meal entry (based on item ids),
        // open it in the Build-a-meal editor, but do NOT auto-save anything.
        if (builderLogId && isMealBuilderDiaryEntry(safeFood)) {
          const favCategory = normalizeCategory(safeFood?.meal || safeFood?.category || safeFood?.mealType)
          const qs = new URLSearchParams()
          qs.set('date', selectedDate)
          qs.set('category', String(favCategory))
          qs.set('sourceLogId', builderLogId)
          router.push(`/food/build-meal?${qs.toString()}`)
          return
        }

        const match = (favorites || []).find((fav: any) => {
          if (!isCustomMealFavorite(fav)) return false
          if (dbId && fav?.sourceId && String(fav.sourceId) === dbId) return true
          return favoriteDisplayLabel(fav).toLowerCase() === key
        })
        if (match?.id) {
          const favCategory =
            (match?.meal && String(match.meal)) ||
            normalizeCategory(safeFood?.meal || safeFood?.category || safeFood?.mealType)
          const qs = new URLSearchParams()
          qs.set('date', selectedDate)
          qs.set('category', String(favCategory))
          qs.set('editFavoriteId', String(match.id))
          if (dbId) qs.set('sourceLogId', dbId)
          router.push(`/food/build-meal?${qs.toString()}`)
          return
        }
      } catch {}

      setEditingEntry(safeFood);
      setEnergyUnit('kcal')
      setSelectedAddCategory(normalizeCategory(safeFood?.meal || safeFood?.category || safeFood?.mealType) as any);
      try {
        // Keep an immutable copy to enable "Cancel changes"
        setOriginalEditingEntry(JSON.parse(JSON.stringify(safeFood)))
      } catch {
        setOriginalEditingEntry(safeFood)
      }
      // Populate the form with existing data and go directly to editing
      const useIngredientCards =
        safeFood.method === 'photo' ||
        Boolean(safeFood.photo) ||
        isBarcodeEntry(safeFood) ||
        (Array.isArray(safeFood.items) && safeFood.items.length > 0)
      if (useIngredientCards) {
        // Clear all state first to ensure clean rebuild
        setAnalyzedItems([]);
        setAnalyzedNutrition(null);
        setAnalyzedTotal(null);
        setPhotoPreview(safeFood.photo || null);
        // Set aiDescription AFTER clearing items so useEffect can rebuild
        setAiDescription(safeFood.description || '');
        setAnalyzedNutrition(safeFood.nutrition);
        
        // Try to restore items immediately (synchronous extraction)
        let itemsRestored = false;
        
        // First priority: use saved items if they exist and are valid
        if (safeFood.items && Array.isArray(safeFood.items) && safeFood.items.length > 0) {
          const baseItems = isBarcodeEntry(safeFood)
            ? normalizeDiscreteServingsWithLabel(safeFood.items)
            : safeFood.items
          const enriched = enrichItemsFromStarter(baseItems)
          setAnalyzedItems(enriched);
          applyRecalculatedNutrition(enriched);
          itemsRestored = true;
        }
        
        // Second priority: extract from description text (try both JSON and prose)
        if (!itemsRestored && safeFood.description) {
          // Try structured JSON extraction first
          const extracted = extractStructuredItemsFromAnalysis(safeFood.description);
          if (extracted && Array.isArray(extracted.items) && extracted.items.length > 0) {
            const enriched = enrichItemsFromStarter(extracted.items)
            setAnalyzedItems(enriched);
            applyRecalculatedNutrition(enriched);
            itemsRestored = true;
          } else {
            // Try prose extraction as fallback
            const proseExtracted = extractItemsFromTextEstimates(safeFood.description);
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
        const cleanDescription = extractBaseMealDescription(safeFood.description);
        setEditedDescription(cleanDescription);
      } else {
        // For manual entries, populate the manual form
        setManualFoodName(safeFood.description);
        setManualFoodType('single');
        setShowAddFood(true);
      }
      setShowEntryOptions(null);
      requestAnimationFrame(() => {
        if (pageTopRef.current) {
          pageTopRef.current.scrollIntoView({ behavior: 'auto', block: 'start' })
        } else if (typeof window !== 'undefined') {
          window.scrollTo({ top: 0, behavior: 'auto' })
        }
      })
    } catch (err) {
      console.error('Failed to open entry for edit', err, food)
      showQuickToast('Could not open this entry')
      setEditingEntry(null)
      setShowAddFood(false)
      setShowAiResult(false)
    }
  };



	  const deleteFood = async (entry: any) => {
	    if (!entry) return
	    beginDiaryMutation()
	    const dbId = (entry as any)?.dbId
	    const entryCategory = normalizeCategory(entry?.meal || entry?.category || entry?.mealType)
	    const entryId = entry.id
	    const entryKey = entryId !== null && entryId !== undefined ? entryId.toString() : ''
    const deletionKeys = new Set<string>()
    const builtKey = buildDeleteKey(entry)
    if (builtKey) deletionKeys.add(builtKey)
    stableDeleteKeysForEntry(entry).forEach((k) => {
      if (k) deletionKeys.add(k)
    })
    if (dbId) deletionKeys.add(`db:${dbId}`)
    if (entryId !== null && entryId !== undefined) deletionKeys.add(`id:${entryId}`)
    const autoDates = Array.from(
      new Set(
        [
          dateKeyForEntry(entry),
          entry?.localDate,
          selectedDate,
          todayIso,
        ]
          .filter(Boolean)
          .map(String),
      ),
	    )
	
	    const targetDescKey = normalizedDescription(entry?.description || entry?.name || '')
	    const targetDateKey = dateKeyForEntry(entry) || selectedDate
      const targetTimeBucket = entryTimestampKey(entry)
	    const updatedFoods = todaysFoods.filter((food: any) => {
      const sameId =
        entryId !== null &&
        entryId !== undefined &&
        String(food?.id ?? '') === String(entryId)
      const sameDb = dbId && String((food as any)?.dbId ?? '') === String(dbId)
      if (sameId || sameDb) return false

      // Also remove any duplicate rows representing the same visible entry.
      // This prevents "delete -> comes back" when there are multiple copies
      // (e.g., copy-to-today creates a local row and a DB-backed row).
      const foodDescKey = normalizedDescription(food?.description || food?.name || '')
      const foodDateKey = dateKeyForEntry(food) || selectedDate
      if (!foodDescKey || !foodDateKey) return true
      if (foodDescKey !== targetDescKey) return true
      if (foodDateKey !== targetDateKey) return true
      const foodTimeBucket = entryTimestampKey(food)
      if (targetTimeBucket && foodTimeBucket && foodTimeBucket !== targetTimeBucket) return true

      const foodCat = normalizeCategory(food?.meal || food?.category || food?.mealType)
      // If either side is uncategorized, treat it as a duplicate anyway (server rows sometimes miss meal).
      const catMatches =
        foodCat === entryCategory || foodCat === 'uncategorized' || entryCategory === 'uncategorized'
      return !catMatches
    })
    setTodaysFoods(updatedFoods)
    triggerHaptic(10)
    setEntrySwipeOffsets((prev) => {
      if (!entryKey) return prev
      const next = { ...prev }
      delete next[entryKey]
      return next
    })
    setSwipeMenuEntry((prev) => (prev === entryKey ? null : prev))
    persistDeletedKeys(Array.from(deletionKeys))
    setDeletedEntryNonce((n) => n + 1)
    // Prevent resurrecting from oversized/stale warm cache
    try {
      localStorage?.removeItem('foodDiary:warmState')
      sessionStorage?.removeItem('foodDiary:warmState')
    } catch {}

    const stillHasCategory = updatedFoods.some(
      (f) => normalizeCategory(f.meal || f.category || f.mealType) === entryCategory,
    )
    if (!stillHasCategory) {
      setExpandedCategories((prev) => ({ ...prev, [entryCategory]: false }))
    }
    setShowEntryOptions(null)

	    const tryDeleteById = async (id: string | number | null | undefined) => {
	      if (!id) return false
	      try {
	        const body = JSON.stringify({ id })
	        const res = await fetch('/api/food-log/delete', {
	          method: 'POST',
	          headers: { 'Content-Type': 'application/json' },
	          body,
	          keepalive: true,
	        })
	        if (!res.ok) {
	          console.error('Delete API failed', { status: res.status, statusText: res.statusText })
	          // Legacy fallback (DELETE verb) to catch older server paths
          try {
            const legacy = await fetch('/api/food-log', {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body,
            })
            if (!legacy.ok) {
              console.error('Legacy DELETE failed', { status: legacy.status, statusText: legacy.statusText })
              return false
            }
            return true
          } catch (legacyErr) {
            console.error('Legacy DELETE error', legacyErr)
            return false
          }
        }
        return true
      } catch (err) {
        console.error('Delete API error', err)
        return false
      }
    }

    const ensureRemoteDelete = async () => {
      // IMPORTANT: Many users have duplicate FoodLog rows for the same visible entry.
      // We must delete *all* matching rows, not stop after the first successful delete,
      // otherwise the entry will "resurrect" after refresh.
      let deletedAny = false
      const sweepDates: string[] = []
      const entryTs = extractEntryTimestampMs(entry)
      const timeWindowMs = 2 * 60 * 1000
      const isSameEntryTime = (log: any) => {
        const logTs = log?.createdAt ? new Date(log.createdAt).getTime() : NaN
        if (!Number.isFinite(entryTs) || !Number.isFinite(logTs)) return false
        return Math.abs(logTs - entryTs) <= timeWindowMs
      }

      // 1) Try direct id deletes first (fast path), but do NOT stop here: duplicates may remain.
      if (dbId) {
        deletedAny = (await tryDeleteById(dbId)) || deletedAny
      }
      if (entryId) {
        deletedAny = (await tryDeleteById(entryId)) || deletedAny
      }

      // 2) Always sweep dates to remove duplicates matching the visible entry.
      try {
        const tz = new Date().getTimezoneOffset()
        autoDates.forEach((d) => sweepDates.push(d))
        const base = autoDates[0] ? new Date(autoDates[0]) : new Date()
        ;[1, -1, 2, -2].forEach((delta) => {
          const d = new Date(base)
          d.setDate(d.getDate() + delta)
          sweepDates.push(d.toISOString().slice(0, 10))
        })

        for (const day of Array.from(new Set(sweepDates)).slice(0, 12)) {
          try {
            const res = await fetch(`/api/food-log?date=${day}&tz=${tz}`)
            if (!res.ok) continue
            const json = await res.json()
            const logs = Array.isArray(json.logs) ? json.logs : []
            const matches = logs.filter((l: any) => {
              const cat = normalizeCategory(l?.meal || l?.category || l?.mealType)
              const descMatch =
                normalizedDescription(l?.description || l?.name) ===
                normalizedDescription(entry?.description || entry?.name || '')
              if (!descMatch) return false

              // SAFETY: never let `uncategorized` match *any* category across days, otherwise
              // deleting a pasted item can wipe an older entry that was saved without a meal.
              if (cat === entryCategory) {
                if (Number.isFinite(entryTs)) return isSameEntryTime(l)
                return day === (targetDateKey || selectedDate)
              }
              if (entryCategory === 'uncategorized') {
                if (cat !== 'uncategorized') return false
                if (Number.isFinite(entryTs)) return isSameEntryTime(l)
                return day === (targetDateKey || selectedDate)
              }

              // Only treat missing-category rows as the same entry when timestamps are very close
              // (same save/copy operation), not a different day’s breakfast/lunch copy.
              if (cat === 'uncategorized') {
                return isSameEntryTime(l)
              }
              return false
            })

            const ids = Array.from(
              new Set<string>(matches.map((m: any) => String(m?.id || '')).filter((v: string) => v.length > 0)),
            ).slice(0, 25)
            for (const id of ids) {
              deletedAny = (await tryDeleteById(id)) || deletedAny
            }
          } catch (errAlt) {
            console.warn('Delete sweep lookup failed', { day, err: errAlt })
          }
        }
      } catch (err) {
        console.warn('Best-effort server delete sweep failed', err)
      }

      // 3) Final fallback: delete by description/category across dates.
      // Use a raw (non-normalized) prefix so the server `contains` matcher can find rows even if
      // punctuation/whitespace differs.
      try {
        const rawDesc = (entry?.description || entry?.name || '').toString().trim()
        const descForServer = rawDesc.length > 0 ? rawDesc.slice(0, 220) : ''
        if (descForServer && !deletedAny) {
          const categories = [entryCategory]
          // SAFETY: only attempt category-agnostic deletes on the exact target day.
          // Otherwise a missing-category row can cause deletes to wipe other days’ items.
          const dates = Array.from(new Set(sweepDates)).slice(0, 12)
          if (entryCategory !== 'uncategorized') {
            const targetDay = targetDateKey || selectedDate
            categories.push('uncategorized')
            for (const cat of categories) {
              const payload = {
                description: descForServer,
                category: cat,
                dates: cat === 'uncategorized' ? [targetDay] : dates,
                clientId: getEntryClientId(entry) || undefined,
                createdAt: entry?.createdAt || undefined,
              }
              const res = await fetch('/api/food-log/delete-by-description', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
              })
              if (res.ok) {
                const json = await res.json().catch(() => ({} as any))
                deletedAny = (Boolean(json?.deleted) && Number(json.deleted) > 0) || deletedAny
              } else {
                console.warn('Description delete failed', res.status, res.statusText)
              }
            }
          } else {
            const payload = {
              description: descForServer,
              category: 'uncategorized',
              dates,
              clientId: getEntryClientId(entry) || undefined,
              createdAt: entry?.createdAt || undefined,
            }
            const res = await fetch('/api/food-log/delete-by-description', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            })
            if (res.ok) {
              const json = await res.json().catch(() => ({} as any))
              deletedAny = (Boolean(json?.deleted) && Number(json.deleted) > 0) || deletedAny
            } else {
              console.warn('Description delete failed', res.status, res.statusText)
            }
          }
        }
      } catch (err) {
        console.warn('Description-based delete failed', err)
      }

      if (!deletedAny) {
        console.warn('Delete did not confirm; entry may reappear after refresh.')
      }
    }

    try {
      // Single request: delete (with server sweep) + update server snapshot in one go
      try {
        const sweepDates = Array.from(new Set([targetDateKey || selectedDate].filter(Boolean)))

        const snapshotFoods = limitSnapshotFoods(updatedFoods, selectedDate)
        const createdAtForDelete = (() => {
          if (entry?.createdAt) {
            const dt = new Date(entry.createdAt)
            if (!Number.isNaN(dt.getTime())) return dt.toISOString()
          }
          const ts = extractEntryTimestampMs(entry)
          if (Number.isFinite(ts)) return new Date(ts).toISOString()
          return null
        })()
        const payloadStr = JSON.stringify({
          id: dbId || null,
          description: (entry?.description || entry?.name || '').toString().trim().slice(0, 220),
          category: entryCategory,
          dates: sweepDates.slice(0, 1),
          snapshotDate: selectedDate,
          snapshotFoods,
          clientId: getEntryClientId(entry) || undefined,
          createdAt: createdAtForDelete || undefined,
        })
        const keepalive = payloadStr.length < 60_000
        await fetch('/api/food-log/delete-atomic', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payloadStr,
          keepalive,
        }).catch((err) => console.warn('Atomic delete request failed (best-effort)', err))
      } catch (err) {
        console.warn('Atomic delete failed (best-effort)', err)
      }

      try {
        await syncSnapshotOnly(updatedFoods, selectedDate)
      } catch (err) {
        console.warn('Delete snapshot sync failed', err)
      }
    } finally {
      endDiaryMutation()
    }
  }

  const deleteWaterEntry = async (entry: any) => {
    const waterId = entry?.waterId || entry?.id
    if (!waterId) return
    if (waterDeletingId === String(waterId)) return
    setWaterDeletingId(String(waterId))
    try {
      const res = await fetch(`/api/water-log/${encodeURIComponent(String(waterId))}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) throw new Error('delete failed')
      setWaterEntries((prev) => prev.filter((item) => item.id !== waterId))
      showQuickToast('Water entry removed.')
    } catch {
      showQuickToast('Could not remove water entry.')
    } finally {
      setWaterDeletingId(null)
    }
  }

		  const deleteHistoryFood = async (dbId: string) => {
		    beginDiaryMutation()
		    try {
		      let deletedEntry: any = null
		      let nextList: any[] = []
		      // Optimistic UI update
	      setHistoryFoods((prev) => {
	        const base = (prev || [])
	        deletedEntry = base.find((f: any) => f.dbId === dbId)
	        const entry = deletedEntry
	        const entryCategory = normalizeCategory(entry?.meal || entry?.category || entry?.mealType)
	        const next = base.filter((f: any) => f.dbId !== dbId)
	        nextList = next
	        const stillHasCategory = next.some((f: any) => normalizeCategory(f.meal || f.category || f.mealType) === entryCategory)
	        if (!stillHasCategory) {
	          setExpandedCategories((prevExp) => ({ ...prevExp, [entryCategory]: false }))
	        }
	        return next
	      });
	      persistDeletedKeys([`db:${dbId}`, ...stableDeleteKeysForEntry(deletedEntry)].filter(Boolean))
	      setDeletedEntryNonce((n) => n + 1)
	      try {
	        localStorage?.removeItem('foodDiary:warmState')
	        sessionStorage?.removeItem('foodDiary:warmState')
	      } catch {}
	      // Call API to delete from DB
	      triggerHaptic(10)
	      try {
          const entryCategory = normalizeCategory(deletedEntry?.meal || deletedEntry?.category || deletedEntry?.mealType)
          const payloadStr = JSON.stringify({
            id: dbId,
            description: (deletedEntry?.description || deletedEntry?.name || '').toString().trim().slice(0, 220),
            category: entryCategory,
            dates: [selectedDate].filter(Boolean),
            snapshotDate: selectedDate,
            snapshotFoods: limitSnapshotFoods(nextList, selectedDate),
            clientId: getEntryClientId(deletedEntry) || undefined,
            createdAt: deletedEntry?.createdAt || undefined,
          })
          const keepalive = payloadStr.length < 60_000
	        const res = await fetch('/api/food-log/delete-atomic', {
	          method: 'POST',
	          headers: { 'Content-Type': 'application/json' },
	          body: payloadStr,
	          keepalive,
	        })
	        if (!res.ok) {
	          console.error('Failed to atomic-delete history entry from database:', { status: res.status, statusText: res.statusText })
	        }
	      } catch (error) {
	        console.error('Failed to atomic-delete history entry from database:', error);
	      }
	      try {
	        await syncSnapshotOnly(nextList, selectedDate)
	      } catch (err) {
	        console.warn('Failed to update snapshot after history delete', err)
	      }
	    } catch {
	      // On error, reload history for the selected date
	      try {
	        const tz = new Date().getTimezoneOffset();
        const res = await fetch(`/api/food-log?date=${selectedDate}&tz=${tz}`);
        if (res.ok) {
          const json = await res.json();
          const logs = Array.isArray(json.logs) ? json.logs : [];
          const mapped = mapLogsToEntries(logs, selectedDate);
          const deduped = dedupeEntries(mapped, { fallbackDate: selectedDate });
          setHistoryFoods(deduped);
        }
      } catch {}
		    } finally {
		      endDiaryMutation()
		      setShowEntryOptions(null);
		    }
		  };

  const entrySelectionKey = (entry: any) => {
    if (!entry) return ''
    if ((entry as any)?.dbId) return `db:${(entry as any).dbId}`
    if (entry?.id !== null && entry?.id !== undefined) return `id:${entry.id}`
    const built = buildDeleteKey(entry)
    return built || ''
  }

  const openMultiCopyPicker = (categoryKey: typeof MEAL_CATEGORY_ORDER[number]) => {
    setMultiCopyCategory(categoryKey)
    setMultiCopySelectedKeys({})
    setShowMultiCopyModal(true)
  }

  const closeMultiCopyPicker = () => {
    setShowMultiCopyModal(false)
    setMultiCopyCategory(null)
    setMultiCopySelectedKeys({})
  }

  const openCombinePicker = (categoryKey: typeof MEAL_CATEGORY_ORDER[number]) => {
    setCombineCategory(categoryKey)
    setCombineSelectedKeys({})
    setCombineMealName('')
    setShowCombineModal(true)
  }

  const closeCombinePicker = () => {
    setShowCombineModal(false)
    setCombineCategory(null)
    setCombineSelectedKeys({})
    setCombineMealName('')
    setCombineSaving(false)
  }

  const combineSelectedEntries = async () => {
    if (!combineCategory) return
    const selected = combineEntries.filter((entry: any) => {
      const key = entrySelectionKey(entry)
      return key && Boolean(combineSelectedKeys[key])
    })
    if (selected.length === 0) return
    beginDiaryMutation()

    const name = (combineMealName || '').trim() || `Combined ${categoryLabel(combineCategory)}`

    // Merge ingredient cards; if an entry has no cards, create a single fallback card from its totals.
    const mergedItems: any[] = []
    for (const entry of selected) {
      if (Array.isArray(entry?.items) && entry.items.length > 0) {
        try {
          const cloned = JSON.parse(JSON.stringify(entry.items))
          if (Array.isArray(cloned)) mergedItems.push(...cloned)
        } catch {
          mergedItems.push(...entry.items)
        }
        continue
      }

      const totals = getEntryTotals(entry)
      const fallbackName =
        extractBaseMealDescription(entry?.description || '') ||
        sanitizeMealDescription((entry?.description || '').toString().split('\n')[0]) ||
        'Food item'
      mergedItems.push({
        name: fallbackName,
        brand: null,
        serving_size: '1 serving',
        servings: 1,
        calories: typeof totals?.calories === 'number' ? totals.calories : null,
        protein_g: typeof totals?.protein === 'number' ? totals.protein : null,
        carbs_g: typeof totals?.carbs === 'number' ? totals.carbs : null,
        fat_g: typeof totals?.fat === 'number' ? totals.fat : null,
        fiber_g: typeof totals?.fiber === 'number' ? totals.fiber : null,
        sugar_g: typeof totals?.sugar === 'number' ? totals.sugar : null,
      })
    }

    let mergedTotals: any = null
    try {
      mergedTotals = sanitizeNutritionTotals(recalculateNutritionFromItems(mergedItems)) || null
    } catch {
      mergedTotals = null
    }
    if (!mergedTotals) {
      // Fallback sum
      mergedTotals = mergedItems.reduce(
        (acc: any, it: any) => {
          const servings = Number.isFinite(Number(it?.servings)) ? Number(it.servings) : 1
          const multiplier = macroMultiplierForItem(it)
          acc.calories += Number(it?.calories || 0) * servings * multiplier
          acc.protein += Number(it?.protein_g || 0) * servings * multiplier
          acc.carbs += Number(it?.carbs_g || 0) * servings * multiplier
          acc.fat += Number(it?.fat_g || 0) * servings * multiplier
          acc.fiber += Number(it?.fiber_g || 0) * servings * multiplier
          acc.sugar += Number(it?.sugar_g || 0) * servings * multiplier
          return acc
        },
        { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0 },
      )
      mergedTotals = sanitizeNutritionTotals(mergedTotals) || mergedTotals
    }

    setCombineSaving(true)
    try {
      const combineFavoriteId = (() => {
        const base = Array.isArray(favorites) ? favorites : []
        const existing = base.find((fav: any) => {
          const label = String(fav?.label || fav?.description || '').trim()
          return label && label === name
        })
        return existing?.id ? String(existing.id) : `fav-${Date.now()}`
      })()

      // 1) Add the combined entry
      await insertMealIntoDiary(
        {
          description: name,
          nutrition:
            mergedTotals && typeof mergedTotals === 'object'
              ? { ...(mergedTotals as any), __origin: 'combined', __favoriteId: combineFavoriteId }
              : mergedTotals,
          total:
            mergedTotals && typeof mergedTotals === 'object'
              ? { ...(mergedTotals as any), __origin: 'combined', __favoriteId: combineFavoriteId }
              : mergedTotals,
          items: mergedItems,
          method: 'combined',
        },
        combineCategory,
      )

      // 1b) Save this combined meal into Favorites → Custom (so it is editable/reusable).
      try {
        const favoritePayload = {
          id: combineFavoriteId,
          sourceId: null,
          label: name,
          description: name,
          nutrition:
            mergedTotals && typeof mergedTotals === 'object'
              ? { ...(mergedTotals as any), __origin: 'combined', __favoriteId: combineFavoriteId }
              : mergedTotals,
          total:
            mergedTotals && typeof mergedTotals === 'object'
              ? { ...(mergedTotals as any), __origin: 'combined', __favoriteId: combineFavoriteId }
              : mergedTotals,
          items: mergedItems,
          photo: null,
          method: 'combined',
          customMeal: true,
          meal: normalizeCategory(combineCategory),
          createdAt: Date.now(),
        }
        setFavorites((prev) => {
          const base = Array.isArray(prev) ? prev : []
          const existingIndex = base.findIndex(
            (fav: any) =>
              (fav.label && favoritePayload.label && String(fav.label).trim() === String(favoritePayload.label).trim()) ||
              (fav.description && favoritePayload.description && String(fav.description).trim() === String(favoritePayload.description).trim()),
          )
          const next =
            existingIndex >= 0
              ? base.map((fav: any, idx: number) => (idx === existingIndex ? { ...favoritePayload, id: fav.id || favoritePayload.id } : fav))
              : [...base, favoritePayload]
          persistFavorites(next)
          return next
        })
      } catch {}

      // 1c) Keep original ingredients available in "All" even after combining.
      try {
        addEntriesToFoodLibrary(selected)
      } catch {}

      // 2) Delete the originals so they don't double count.
      // If any delete fails, tombstones will still suppress resurrection.
      for (const entry of selected) {
        try {
          if (isViewingToday) {
            await deleteFood(entry)
          } else if ((entry as any)?.dbId) {
            await deleteHistoryFood(String((entry as any).dbId))
          } else {
            await deleteFood(entry)
          }
        } catch {}
      }

      showQuickToast('Combined into one meal')
      closeCombinePicker()
    } catch (err) {
      console.warn('Combine ingredients failed', err)
      showQuickToast('Could not combine these items. Please try again.')
      setCombineSaving(false)
    } finally {
      endDiaryMutation()
    }
  }

  const pasteMultipleFromClipboard = async (
    targetCategoryKey: typeof MEAL_CATEGORY_ORDER[number],
    targetDate: string,
  ) => {
    const clipboard = readMultiCopyClipboard()
    const items = clipboard?.items || []
    if (!items.length) {
      showQuickToast('No copied items to paste')
      return
    }
    const category = normalizeCategory(targetCategoryKey)
    const pasteStamp = Date.now()
    const clones = items.map((item, idx) => {
      const createdSource = item?.createdAt || new Date().toISOString()
      const baseTs = new Date(createdSource).getTime()
      const adjusted = Number.isFinite(baseTs) ? new Date(baseTs + idx * 60000).toISOString() : new Date().toISOString()
      const anchored = alignTimestampToLocalDate(adjusted, targetDate)
      const loggedAtIso = new Date(pasteStamp + idx * 60000).toISOString()
      const addedOrder = pasteStamp + idx * 60000
      const baseMs = new Date(anchored).getTime()
      const time =
        item?.time ||
        new Date(anchored).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      const description = (item?.description || '').toString() || 'Copied meal'
      const baseEntry = markEntryAllowDuplicate(
        ensureEntryLoggedAt(
          applyEntryClientId(
            {
              id: makeUniqueLocalEntryId(
                baseMs,
                `paste:${pasteStamp}|${targetDate}|${category}|${normalizedDescription(description)}|${idx}`,
              ),
              dbId: undefined,
              localDate: targetDate,
              createdAt: anchored,
              time,
              meal: category,
              category,
              persistedCategory: category,
              description,
              nutrition: item?.nutrition ?? null,
              total: item?.total ?? null,
              items: Array.isArray(item?.items) && item.items.length > 0 ? item.items : null,
              photo: item?.photo ?? null,
              method: item?.method ?? 'copied',
            },
            `paste:${pasteStamp}|${targetDate}|${category}|${normalizedDescription(description)}|${idx}`,
            { forceNew: true },
          ),
          loggedAtIso,
          addedOrder,
        ),
      )
      const pendingKey = buildPendingSaveKey(baseEntry, targetDate)
      return markEntryPendingSave(baseEntry, pendingKey)
    })
    removeDeletedTombstonesForEntries(clones)

    const dedupeTargetDate = targetDate || selectedDate
    const dedupeList = (entries: any[]) => dedupeEntries(entries, { fallbackDate: dedupeTargetDate })

    const isTargetToday = targetDate === todayIso
    const isTargetSelected = targetDate === selectedDate
    let foodsForSave: any[] = []

    if (isTargetToday || (isTargetSelected && isViewingToday)) {
      const baseForDate = dedupeEntries(
        filterEntriesForDate(todaysFoods, dedupeTargetDate),
        { fallbackDate: dedupeTargetDate },
      )
      const updated = dedupeList([...clones, ...baseForDate])
      updateTodaysFoodsForDate(updated, dedupeTargetDate)
      foodsForSave = updated
    } else if (isTargetSelected && !isViewingToday) {
      const updated = dedupeList([...clones, ...(historyFoods || [])])
      setHistoryFoods(updated)
      foodsForSave = updated
    } else {
      const baseForDate = dedupeEntries(
        filterEntriesForDate(todaysFoods, dedupeTargetDate),
        { fallbackDate: dedupeTargetDate },
      )
      const updated = dedupeList([...clones, ...baseForDate])
      updateTodaysFoodsForDate(updated, dedupeTargetDate)
      foodsForSave = updated
    }

    setExpandedCategories((prev) => ({ ...prev, [targetCategoryKey]: true }))
    showQuickToast(`Pasted ${clones.length} item${clones.length === 1 ? '' : 's'} into ${categoryLabel(targetCategoryKey)}`)
    // UX: clipboard is single-use by default. After a paste, hide "Paste items" until the user copies again.
    clearMultiCopyClipboard()

    try {
      clones.forEach((clone) => enqueuePendingFoodLogSave(clone, targetDate))
      await syncSnapshotOnly(foodsForSave, targetDate)
    } catch (err) {
      console.warn('Paste multiple items failed', err)
    }
  }

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
    if (!timeString) return ''
    const trimmed = timeString.trim()
    const match = trimmed.match(/(\d{1,2})(?::(\d{2}))?\s*([ap]m)?/i)
    if (match) {
      const hourRaw = parseInt(match[1], 10)
      const minutes = (match[2] || '00').padStart(2, '0')
      const suffix = match[3] ? match[3].toUpperCase() : ''

      if (suffix) {
        const hour12 = Number.isFinite(hourRaw) ? (hourRaw % 12 || 12) : 12
        return `${hour12}:${minutes} ${suffix}`
      }

      const safeHour = Number.isFinite(hourRaw) ? hourRaw : 0
      const ampm = safeHour >= 12 ? 'PM' : 'AM'
      const hour12 = safeHour % 12 || 12
      return `${hour12}:${minutes} ${ampm}`
    }

    const parsed = new Date(`1970-01-01T${trimmed}`)
    if (!Number.isNaN(parsed.getTime())) {
      const hours = parsed.getHours()
      const minutes = parsed.getMinutes()
      const ampm = hours >= 12 ? 'PM' : 'AM'
      const hour12 = hours % 12 || 12
      return `${hour12}:${String(minutes).padStart(2, '0')} ${ampm}`
    }

    return trimmed
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

  const aiSavedMealMeta = useMemo(() => {
    const nutrition = editingEntry?.nutrition
    if (nutrition && typeof nutrition === 'object') {
      const origin = typeof (nutrition as any).__origin === 'string' ? String((nutrition as any).__origin).toLowerCase() : ''
      const whyRaw = typeof (nutrition as any).__aiWhy === 'string' ? String((nutrition as any).__aiWhy).trim() : ''
      const recipeRaw = (nutrition as any).__aiRecipe
      const recipe =
        recipeRaw && typeof recipeRaw === 'object'
          ? {
              prepMinutes: Number.isFinite(Number((recipeRaw as any).prepMinutes)) ? Number((recipeRaw as any).prepMinutes) : null,
              cookMinutes: Number.isFinite(Number((recipeRaw as any).cookMinutes)) ? Number((recipeRaw as any).cookMinutes) : null,
              servings: Number.isFinite(Number((recipeRaw as any).servings)) ? Number((recipeRaw as any).servings) : null,
              steps: Array.isArray((recipeRaw as any).steps)
                ? (recipeRaw as any).steps.map((step: any) => String(step || '').trim()).filter(Boolean)
                : [],
            }
          : null
      const hasRecipe = Boolean(recipe && recipe.steps && recipe.steps.length > 0)
      const hasWhy = Boolean(whyRaw)
      if (origin === 'ai-recommended' && (hasRecipe || hasWhy)) {
        return { recipe: hasRecipe ? recipe : null, why: whyRaw }
      }
    }

    const storedGoals = Array.isArray((userData as any)?.healthGoals) ? (userData as any).healthGoals : []
    const stored = storedGoals.find((goal: any) => goal?.name === AI_MEAL_RECOMMENDATION_GOAL_NAME)
    let parsed: any = null
    if (stored?.category) {
      try {
        parsed = JSON.parse(stored.category)
      } catch {
        parsed = null
      }
    }
    const historyFromGoals = Array.isArray(parsed?.history) ? parsed.history : Array.isArray(parsed) ? parsed : []
    const historyFromState = Array.isArray(aiMealHistory) ? aiMealHistory : []
    const history = historyFromGoals.length > 0 ? historyFromGoals : historyFromState
    if (!history.length) return null

    const normalize = (value: string) =>
      String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()

    const entryNameRaw = String(editingEntry?.description || editingEntry?.name || '')
    const entryName = normalize(entryNameRaw)
    const entryCategory = String(editingEntry?.meal || editingEntry?.category || '').toLowerCase()
    const entryItems = Array.isArray(editingEntry?.items) ? editingEntry.items : []
    const entryItemNames = entryItems
      .map((item: any) => normalize(String(item?.name || '')))
      .filter(Boolean)
    const entryItemSet = new Set(entryItemNames)

    const aiMealId = nutrition && typeof nutrition === 'object' ? String((nutrition as any).__aiMealId || '').trim() : ''

    const pickMatch = (rec: any) => {
      const recCategory = String(rec?.category || '').toLowerCase()
      if (entryCategory && recCategory && recCategory !== entryCategory) return false
      if (aiMealId && String(rec?.id || '') === aiMealId) return true
      const recName = normalize(String(rec?.mealName || ''))
      const recItems = Array.isArray(rec?.items) ? rec.items : []
      const recItemNames = recItems.map((item: any) => normalize(String(item?.name || ''))).filter(Boolean)
      const overlap = recItemNames.filter((name: string) => entryItemSet.has(name)).length
      const strongNameMatch = entryName && recName && recName === entryName
      if (strongNameMatch && entryItemSet.size === 0) return true
      const overlapNeeded = entryItemSet.size <= 1 ? 1 : 2
      return (strongNameMatch && overlap >= overlapNeeded) || overlap >= Math.max(2, overlapNeeded)
    }

    const match = history.find((rec: any) => pickMatch(rec))
    if (!match) return null

    const whyRaw = typeof match?.why === 'string' ? String(match.why).trim() : ''
    const recipeRaw = match?.recipe
    const recipe =
      recipeRaw && typeof recipeRaw === 'object'
        ? {
            prepMinutes: Number.isFinite(Number((recipeRaw as any).prepMinutes)) ? Number((recipeRaw as any).prepMinutes) : null,
            cookMinutes: Number.isFinite(Number((recipeRaw as any).cookMinutes)) ? Number((recipeRaw as any).cookMinutes) : null,
            servings: Number.isFinite(Number((recipeRaw as any).servings)) ? Number((recipeRaw as any).servings) : null,
            steps: Array.isArray((recipeRaw as any).steps)
              ? (recipeRaw as any).steps.map((step: any) => String(step || '').trim()).filter(Boolean)
              : [],
          }
        : null
    const hasRecipe = Boolean(recipe && recipe.steps && recipe.steps.length > 0)
    const hasWhy = Boolean(whyRaw)
    if (!hasRecipe && !hasWhy) return null
    return { recipe: hasRecipe ? recipe : null, why: whyRaw }
  }, [
    editingEntry?.nutrition,
    editingEntry?.items,
    editingEntry?.description,
    editingEntry?.meal,
    userData?.healthGoals,
    aiMealHistory,
  ])

  const hasAiSavedMealMeta = Boolean(aiSavedMealMeta)

  useEffect(() => {
    if (!editingEntry) return
    if (hasAiSavedMealMeta) return
    const cat = normalizeCategory(editingEntry?.meal || editingEntry?.category)
    if (!cat) return
    if (aiMealHistoryCategory === cat && aiMealHistory.length > 0) return
    const qs = new URLSearchParams()
    qs.set('date', selectedDate)
    qs.set('category', cat)
    fetch(`/api/ai-meal-recommendation?${qs.toString()}`, { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data || !Array.isArray(data.history)) return
        setAiMealHistory(data.history)
        setAiMealHistoryCategory(cat)
      })
      .catch(() => {})
  }, [
    editingEntry?.id,
    editingEntry?.meal,
    editingEntry?.category,
    selectedDate,
    hasAiSavedMealMeta,
    aiMealHistoryCategory,
    aiMealHistory.length,
  ])

  useEffect(() => {
    setAiEntryTab('ingredients')
  }, [editingEntry?.id])
  const shouldShowAddPanel = showAddFood && !isAddMenuOpen

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
    const handler = () => setCreditRefreshTick((v) => v + 1)
    try {
      window.addEventListener('credits:refresh', handler)
      return () => window.removeEventListener('credits:refresh', handler)
    } catch {
      return () => {}
    }
  }, [])

  useEffect(() => {
    const fetchCreditStatus = async () => {
      try {
        const res = await fetch(`/api/credit/status`, { cache: 'no-store' })
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
  }, [creditRefreshTick])

  useEffect(() => {
    if (!isEditingDescription) return;
    const textarea = descriptionTextareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  }, [isEditingDescription, editedDescription]);

  return (
    <DiaryErrorBoundary>
      <div
        ref={pageTopRef}
        className="flex-1 flex flex-col overflow-hidden bg-gray-50"
        onTouchStart={handlePullStart}
        onTouchMove={handlePullMove}
        onTouchEnd={handlePullEnd}
        onTouchCancel={handlePullEnd}
      >
        <div className="w-full max-w-6xl mx-auto flex-1 flex flex-col px-3 sm:px-4 lg:px-6">
      {(isDiaryRefreshing || pullOffset > 0) && (
        <div
          className="flex items-center justify-center text-sm text-gray-500 transition-all duration-150"
          style={{ height: isDiaryRefreshing ? 48 : Math.min(pullOffset, 80) }}
        >
          {isDiaryRefreshing ? (
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refreshing...
            </span>
          ) : (
            <span>{pullOffset >= PULL_REFRESH_THRESHOLD ? 'Release to refresh' : 'Pull to refresh'}</span>
          )}
        </div>
      )}
      {/* Saved Toast (brief confirmation) */}
      {showSavedToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[10000]">
          <div className="px-4 py-2 bg-emerald-600 text-white rounded-full shadow-lg text-sm">
            Saved
          </div>
        </div>
      )}
      {quickToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[10000]">
          <div className="px-4 py-2 bg-gray-900 text-white rounded-full shadow-lg text-sm">
            {quickToast}
          </div>
        </div>
      )}
      {healthCheckPrompt && (() => {
        const promptEntry = {
          description: healthCheckPrompt.description,
          items: healthCheckPrompt.items,
        }
        const triggerPreview = buildHealthCheckTriggerPreview(promptEntry, healthCheckPrompt.totals)
        const hasTriggers = triggerPreview.length > 0
        return (
          <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[10000] w-[94%] max-w-2xl">
            <div className="relative overflow-hidden rounded-3xl border border-amber-200/70 bg-white/95 shadow-2xl backdrop-blur">
              <div className="absolute inset-0 bg-gradient-to-r from-amber-50 via-white to-emerald-50 opacity-80" />
              <div className="relative flex items-start gap-4 p-4 sm:p-5">
                <div className="h-11 w-11 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center shadow-sm">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v4m0 4h.01M5.07 19h13.86c1.2 0 1.96-1.3 1.35-2.32L13.4 4.64c-.6-1.04-2.08-1.04-2.68 0L3.72 16.68c-.6 1.02.15 2.32 1.35 2.32z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm sm:text-base font-semibold text-gray-900">Health check recommended</div>
                  <p className="mt-1 text-sm text-gray-700">
                    {hasTriggers
                      ? 'High-risk meal detected (sugar/carbs/fat). Run a quick check aligned to your settings?'
                      : 'Health check is enabled for this meal. Run a quick check aligned to your settings?'}
                  </p>
                  {hasTriggers && (
                    <div className="mt-3 space-y-2">
                      {triggerPreview.map((trigger) => {
                        const meta = HEALTH_TRIGGER_META[trigger.key] || { color: '#9ca3af', accent: 'text-gray-600' }
                        const ratio = trigger.limit > 0 ? Math.min(1, trigger.value / trigger.limit) : 1
                        return (
                          <div key={`${trigger.key}-${trigger.label}`} className="space-y-1">
                            <div className="flex items-center justify-between text-xs text-gray-700">
                              <span className="font-semibold text-gray-900">{trigger.label}</span>
                              <span className={meta.accent}>
                                {Math.round(trigger.value)}{trigger.unit} &gt; {Math.round(trigger.limit)}{trigger.unit}
                              </span>
                            </div>
                            <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
                              <div
                                className="h-full"
                                style={{ width: `${Math.round(ratio * 100)}%`, backgroundColor: meta.color }}
                              />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                  {healthCheckError && (
                    <div className="mt-2 text-xs text-amber-700">{healthCheckError}</div>
                  )}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => runHealthCheck(healthCheckPrompt)}
                      disabled={healthCheckLoading}
                      className="px-4 py-2 rounded-full bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-60"
                    >
                      {healthCheckLoading ? 'Checking...' : `Review (${HEALTH_CHECK_COST_CREDITS})`}
                    </button>
                    <button
                      type="button"
                      onClick={() => setHealthCheckPrompt(null)}
                      className="px-4 py-2 rounded-full border border-gray-200 text-gray-700 text-sm font-semibold hover:bg-gray-50"
                    >
                      Not now
                    </button>
                    <span className="text-xs text-gray-500">{HEALTH_CHECK_COST_CREDITS} credits</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setHealthCheckPrompt(null)}
                  className="text-gray-400 hover:text-gray-600"
                  aria-label="Dismiss"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        )
      })()}
      {healthCheckResult && healthCheckPageOpen && (
        <div className="fixed inset-0 z-[10001] bg-white flex flex-col">
          <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setHealthCheckPageOpen(false)
                setHealthCheckResult(null)
              }}
              className="p-2 -ml-1 rounded-xl hover:bg-gray-100 text-gray-700"
              aria-label="Back"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="text-base font-semibold text-gray-900">Health check</div>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
            <div className="text-lg font-semibold text-gray-900">Summary</div>
            <div className="text-base text-gray-800 whitespace-pre-line">{healthCheckResult.summary}</div>
            {(healthCheckResult.triggers.length > 0 || healthCheckResult.flags.length > 0) && (
              <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4 space-y-3">
                <div className="text-base font-semibold text-gray-900">Triggered by</div>
                {(healthCheckResult.triggers.length > 0
                  ? healthCheckResult.triggers
                  : healthCheckResult.flags.map((flag, idx) => ({
                      key: `flag-${idx}`,
                      label: flag,
                      value: null,
                      limit: null,
                      unit: '',
                    }))
                ).map((trigger: any) => {
                  const meta = HEALTH_TRIGGER_META[trigger.key] || { color: '#9ca3af', accent: 'text-gray-600' }
                  const safeValue = Number.isFinite(trigger.value) ? trigger.value : null
                  const safeLimit = Number.isFinite(trigger.limit) ? trigger.limit : null
                  const ratio =
                    safeValue !== null && safeLimit !== null && safeLimit > 0
                      ? Math.min(1, safeValue / safeLimit)
                      : 1
                  return (
                    <div key={`${trigger.key}-${trigger.label}`} className="space-y-2">
                      <div className="flex items-center justify-between text-sm text-gray-700">
                        <span className="font-semibold text-gray-900">
                          {trigger.label}
                        </span>
                        {safeValue !== null && safeLimit !== null ? (
                          <span className={meta.accent}>
                            {Math.round(safeValue)}{trigger.unit} &gt; {Math.round(safeLimit)}{trigger.unit}
                          </span>
                        ) : (
                          <span className="text-gray-600">{trigger.label}</span>
                        )}
                      </div>
                      {safeValue !== null && safeLimit !== null && (
                        <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${Math.max(12, ratio * 100)}%`, backgroundColor: meta.color }}
                          />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
            {healthCheckResult.issues.length > 0 && (
              <div className="space-y-3">
                <div className="text-lg font-semibold text-gray-900">Why this matters for your goals</div>
                {healthCheckResult.issues.map((issue, idx) => (
                  <div key={`${issue.issue}-${idx}`} className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                    <div className="text-base font-semibold text-gray-900">{issue.issue}</div>
                    <div className="text-base text-gray-700 mt-1">{issue.why}</div>
                  </div>
                ))}
              </div>
            )}
            {healthCheckResult.alternative && (
              <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-base text-blue-900">
                <span className="font-semibold">Swap idea:</span> {healthCheckResult.alternative}
              </div>
            )}
            <div className="text-xs text-gray-500">{HEALTH_CHECK_COST_CREDITS} credits used.</div>
          </div>
        </div>
      )}
      
      {/* Backdrop to block clicks on entries while dropdown menus are open */}
	      {(showPhotoOptions || showCategoryPicker) && (
	        <div
	          className="fixed inset-0 z-30 bg-transparent pointer-events-none"
	        />
	      )}

	      {showAddExerciseModal && (
	        <div className="fixed inset-0 z-50 bg-white">
	          <div className="h-[100dvh] flex flex-col">
	            <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between">
	              <div className="flex items-center gap-2">
	                {(exercisePickerCategory || selectedExerciseType) && (
	                  <button
	                    type="button"
	                    onClick={() => {
	                      if (selectedExerciseType) {
	                        setSelectedExerciseType(null)
	                        setExerciseSaveError(null)
	                        return
	                      }
	                      setExercisePickerCategory(null)
	                      setExerciseTypeResults([])
	                      setExerciseTypeError(null)
	                    }}
	                    className="p-2 -ml-2 rounded-xl hover:bg-gray-100 text-gray-700"
	                    aria-label="Back"
	                    title="Back"
	                  >
	                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
	                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
	                    </svg>
	                  </button>
	                )}
	                <div className="font-semibold text-gray-900 text-lg">
	                  {editingExerciseEntry?.id ? 'Edit exercise' : 'Add exercise'}
	                </div>
	              </div>
                <div className="flex items-center gap-2">
                  {!editingExerciseEntry?.id && (
                    <button
                      type="button"
                      onClick={resetExerciseDraft}
                      className="px-2 py-1 text-xs font-semibold text-gray-500 hover:text-gray-700"
                    >
                      Reset
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setShowAddExerciseModal(false)
                      setEditingExerciseEntry(null)
                    }}
                    className="p-2 rounded-xl hover:bg-gray-100"
                    aria-label="Close"
                  >
                    <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
	            </div>

	            <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-5 pb-10">
	              {!selectedExerciseType ? (
	                <>
	                  <div className="mb-4">
	                    {!fitbitConnected && !garminConnected ? (
	                      <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 flex items-center justify-between gap-3">
	                        <div className="min-w-0">
	                          <div className="text-sm font-semibold text-gray-900">Connect a device</div>
	                          <div className="text-xs text-gray-500 mt-0.5">
                            Connect Fitbit or Garmin Connect to automatically log workouts here.
	                          </div>
	                        </div>
	                        <button
	                          type="button"
	                          onClick={() => {
	                            setShowAddExerciseModal(false)
	                            setEditingExerciseEntry(null)
	                            goToDevices()
	                          }}
	                          className="px-3 py-2 rounded-xl bg-white border border-gray-200 hover:bg-gray-50 text-xs font-semibold text-gray-700 flex-shrink-0"
	                        >
	                          Connect
	                        </button>
	                      </div>
	                    ) : (
	                      <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 flex items-center justify-between gap-3">
	                        <div className="min-w-0">
	                          <div className="text-sm font-semibold text-gray-900">Device connected</div>
	                          <div className="text-xs text-gray-600 mt-0.5">
                            {fitbitConnected && garminConnected ? 'Fitbit and Garmin Connect' : fitbitConnected ? 'Fitbit' : 'Garmin Connect'} connected. Workouts can be imported.
	                          </div>
	                        </div>
	                        <div className="flex items-center gap-2 flex-shrink-0">
	                          <button
	                            type="button"
	                            onClick={() => syncExerciseFromDevices()}
	                            disabled={exerciseSyncing}
	                            className="px-3 py-2 rounded-xl bg-white border border-gray-200 hover:bg-gray-50 text-xs font-semibold text-gray-700 disabled:opacity-60"
	                          >
	                            Sync now
	                          </button>
	                          <button
	                            type="button"
	                            onClick={() => {
	                              setShowAddExerciseModal(false)
	                              setEditingExerciseEntry(null)
	                              goToDevices()
	                            }}
	                            className="px-3 py-2 rounded-xl bg-white border border-gray-200 hover:bg-gray-50 text-xs font-semibold text-gray-700"
	                          >
	                            Devices
	                          </button>
	                        </div>
	                      </div>
	                    )}
	                  </div>
	                  <div className="space-y-3">
	                    <div className="relative">
	                      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
	                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
	                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M10.5 18a7.5 7.5 0 110-15 7.5 7.5 0 010 15z" />
	                        </svg>
	                      </div>
	                      <input
	                        type="text"
	                        value={exerciseTypeSearch}
	                        onChange={(e) => {
	                          setExercisePickerCategory(null)
	                          setExerciseTypeSearch(e.target.value)
	                        }}
	                        placeholder="Search exercise (e.g., walking)"
	                        className="w-full pl-10 pr-3 py-3 border border-gray-300 rounded-2xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-base"
	                      />
	                    </div>

	                    <div className="flex items-center gap-2 flex-wrap">
	                      {[
	                        { label: 'Walking', query: 'walking' },
	                        { label: 'Run', query: 'running' },
	                        { label: 'Cycling', query: 'cycling' },
	                        { label: 'Weights', query: 'weight training' },
	                        { label: 'Yoga', query: 'yoga' },
	                      ].map((chip) => (
	                        <button
	                          key={chip.label}
	                          type="button"
	                          onClick={() => pickQuickExercise(chip.query)}
	                          className="px-3 py-2 rounded-full border border-gray-200 bg-white hover:bg-gray-50 text-sm font-semibold text-gray-900"
	                        >
	                          {chip.label}
	                        </button>
	                      ))}
	                    </div>

	                    {exerciseTypeError && <div className="text-sm text-red-600">{exerciseTypeError}</div>}
	                    {exerciseTypeLoading && <div className="text-sm text-gray-500">Loading…</div>}
	                  </div>

	                  {exerciseTypeSearch.trim().length === 0 && !exercisePickerCategory ? (
	                    <div className="mt-5">
	                      <div className="text-sm font-semibold text-gray-900 mb-3">All categories</div>
	                      <div className="grid grid-cols-2 gap-3">
	                        {[
	                          { key: 'Cardio', icon: 'M3 12h4l3 8 4-16 3 8h4' },
	                          { key: 'Gym', icon: 'M7 7h10M7 17h10M9 5v14M15 5v14' },
	                          { key: 'Household Activity', icon: 'M3 10l9-7 9 7v10a2 2 0 01-2 2H5a2 2 0 01-2-2V10z' },
	                          { key: 'Individual Sport', icon: 'M16 14a4 4 0 10-8 0' },
	                          { key: 'Occupational Activity', icon: 'M9 6h6a2 2 0 012 2v1H7V8a2 2 0 012-2z' },
	                          { key: 'Outdoor Activity', icon: 'M12 2l2 7h7l-5.5 4 2.5 7-6-4.5L6 20l2.5-7L3 9h7l2-7z' },
	                          { key: 'Strength And Mobility', icon: 'M6 8h12M6 16h12M4 10h2v4H4zM18 10h2v4h-2z' },
	                          { key: 'Team Sport', icon: 'M12 12a4 4 0 100-8 4 4 0 000 8z' },
	                          { key: 'Transportation', icon: 'M5 16l1-5a2 2 0 012-2h8a2 2 0 012 2l1 5M7 16a2 2 0 104 0M13 16a2 2 0 104 0' },
	                        ].map((c) => (
	                          <button
	                            key={c.key}
	                            type="button"
	                            onClick={() => {
	                              setExercisePickerCategory(c.key)
	                              setExerciseTypeSearch('')
	                              setExerciseSaveError(null)
	                              loadExerciseTypes({ category: c.key })
	                            }}
	                            className="rounded-2xl border border-gray-200 bg-white hover:bg-gray-50 shadow-sm px-4 py-4 flex flex-col items-center gap-3"
	                          >
	                            <div className="w-10 h-10 rounded-2xl bg-gray-100 flex items-center justify-center text-gray-500">
	                              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
	                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={c.icon} />
	                              </svg>
	                            </div>
	                            <div className="text-sm font-semibold text-gray-900 text-center leading-tight">{c.key}</div>
	                          </button>
	                        ))}
	                      </div>
	                    </div>
	                  ) : (
	                    <div className="mt-5 space-y-2">
	                      {exercisePickerCategory && (
	                        <div className="flex items-center justify-between">
	                          <div className="text-sm font-semibold text-gray-900">{exercisePickerCategory}</div>
	                          <button
	                            type="button"
	                            onClick={() => {
	                              setExercisePickerCategory(null)
	                              setExerciseTypeResults([])
	                              setExerciseTypeError(null)
	                            }}
	                            className="text-sm text-gray-500 hover:text-gray-700"
	                          >
	                            Clear
	                          </button>
	                        </div>
	                      )}

	                      {!exerciseTypeLoading && exerciseTypeResults.length > 0 && (
	                        <div className="space-y-2">
	                          {exerciseTypeResults.map((t: any) => (
	                            <button
	                              key={`${t.id}`}
	                              type="button"
	                              onClick={() => setSelectedExerciseType(t)}
	                              className="w-full text-left rounded-2xl border border-gray-200 px-4 py-3 hover:bg-gray-50 flex items-center justify-between gap-3"
	                            >
	                              <div className="min-w-0">
	                                <div className="text-sm font-semibold text-gray-900 truncate">{t.name}</div>
	                                <div className="text-xs text-gray-500">
	                                  {t.category}
	                                  {t.intensity ? ` • ${t.intensity}` : ''}
	                                </div>
	                              </div>
	                              <div className="text-xs text-gray-400 flex items-center gap-2 flex-shrink-0">
	                                <span>MET {Number(t.met).toFixed(1)}</span>
	                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
	                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
	                                </svg>
	                              </div>
	                            </button>
	                          ))}
	                        </div>
	                      )}

	                      {!exerciseTypeLoading && exerciseTypeResults.length === 0 && exerciseTypeSearch.trim().length > 0 && !exerciseTypeError && (
	                        <div className="text-sm text-gray-500">No matches. Try a different search.</div>
	                      )}
	                    </div>
	                  )}
	                </>
	              ) : (
	                <>
	                  <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
	                    <div className="text-xs text-gray-500">Selected exercise</div>
	                    <div className="text-base font-semibold text-gray-900">{selectedExerciseType.name}</div>
	                    <div className="text-xs text-gray-500">
	                      {selectedExerciseType.category} • MET {Number(selectedExerciseType.met).toFixed(1)}
	                    </div>
	                    <button
	                      type="button"
	                      onClick={() => setSelectedExerciseType(null)}
	                      className="mt-2 text-sm font-semibold text-emerald-700 hover:text-emerald-800"
	                    >
	                      Change exercise
	                    </button>
	                  </div>

	                  <div className="mt-5 space-y-4">
	                    {(() => {
	                      const name = String(selectedExerciseType?.name || '').toLowerCase()
	                      const distanceBased = /walk|run|jog|cycl|bike/.test(name)
	                      if (!distanceBased) return null
	                      const mins = computeExerciseDurationMinutes()
	                      const distRaw = exerciseDistanceKm.trim().length > 0 ? Number(exerciseDistanceKm) : null
	                      const dist =
	                        distRaw && Number.isFinite(distRaw) && distRaw > 0
	                          ? exerciseDistanceUnit === 'mi'
	                            ? distRaw
	                            : distRaw
	                          : null
	                      const speed =
	                        dist && Number.isFinite(dist) && dist > 0 && mins && Number.isFinite(mins) && mins > 0
	                          ? dist / (mins / 60)
	                          : null
	                      const pace =
	                        dist && Number.isFinite(dist) && dist > 0 && mins && Number.isFinite(mins) && mins > 0
	                          ? mins / dist
	                          : null
	                      const paceLabel =
	                        pace && Number.isFinite(pace)
	                          ? `${Math.floor(pace)}:${String(Math.round((pace - Math.floor(pace)) * 60)).padStart(2, '0')} min/${exerciseDistanceUnit === 'mi' ? 'mi' : 'km'}`
	                          : null
	                      return (
	                        <div className="space-y-1">
	                          <div className="flex items-center justify-between">
	                            <label className="block text-sm font-semibold text-gray-900">
	                              Distance ({exerciseDistanceUnit})
	                            </label>
	                            <div className="inline-flex items-center text-xs bg-gray-100 rounded-full p-0.5 border border-gray-200">
	                              <button
	                                type="button"
	                                onClick={() => {
	                                  if (exerciseDistanceUnit === 'km') return
	                                  const current = exerciseDistanceKm.trim().length > 0 ? Number(exerciseDistanceKm) : null
	                                  if (current && Number.isFinite(current)) {
	                                    const next = roundTo(current * 1.60934, 2)
	                                    setExerciseDistanceKm(String(next).replace(/\.0+$/, ''))
	                                  }
	                                  setExerciseDistanceUnit('km')
	                                }}
	                                className={`px-2 py-0.5 rounded-full ${
	                                  exerciseDistanceUnit === 'km'
	                                    ? 'bg-white text-gray-900 shadow-sm'
	                                    : 'text-gray-500'
	                                }`}
	                              >
	                                km
	                              </button>
	                              <button
	                                type="button"
	                                onClick={() => {
	                                  if (exerciseDistanceUnit === 'mi') return
	                                  const current = exerciseDistanceKm.trim().length > 0 ? Number(exerciseDistanceKm) : null
	                                  if (current && Number.isFinite(current)) {
	                                    const next = roundTo(current / 1.60934, 2)
	                                    setExerciseDistanceKm(String(next).replace(/\.0+$/, ''))
	                                  }
	                                  setExerciseDistanceUnit('mi')
	                                }}
	                                className={`px-2 py-0.5 rounded-full ${
	                                  exerciseDistanceUnit === 'mi'
	                                    ? 'bg-white text-gray-900 shadow-sm'
	                                    : 'text-gray-500'
	                                }`}
	                              >
	                                miles
	                              </button>
	                            </div>
	                          </div>
	                          <div className="relative">
	                            <input
	                              type="text"
	                              inputMode="decimal"
	                              pattern="[0-9]*"
	                              value={exerciseDistanceKm}
	                              onChange={(e) => setExerciseDistanceKm(e.target.value)}
	                              onFocus={() => setExerciseDistanceKm('')}
	                              placeholder="e.g., 3.2"
	                              className="w-full pr-14 px-4 py-3 border border-gray-300 rounded-2xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-base"
	                            />
	                            <div className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 text-sm font-semibold">
	                              {exerciseDistanceUnit === 'mi' ? 'miles' : 'km'}
	                            </div>
	                          </div>
	                          {(speed || paceLabel) && (
	                            <div className="text-xs text-gray-500 mt-1">
	                              {speed ? `${Math.round(speed * 10) / 10} ${exerciseDistanceUnit === 'mi' ? 'mph' : 'km/h'}` : null}
	                              {speed && paceLabel ? ' • ' : null}
	                              {paceLabel}
	                            </div>
	                          )}
	                        </div>
	                      )
	                    })()}
	                    <div className="space-y-2">
	                      <label className="block text-sm font-semibold text-gray-900">Duration</label>
	                      <div className="grid grid-cols-2 gap-3">
	                        <div className="space-y-1">
	                          <div className="text-xs font-semibold text-gray-500">Hours</div>
	                          <select
	                            value={exerciseDurationHours}
	                            onChange={(e) => setExerciseDurationHours(Number(e.target.value))}
	                            className="w-full px-4 py-3 border-2 border-emerald-500 rounded-2xl bg-white text-base font-semibold"
	                          >
	                            {Array.from({ length: 24 }).map((_, i) => (
	                              <option key={i} value={i}>
	                                {i}
	                              </option>
	                            ))}
	                          </select>
	                        </div>
	                        <div className="space-y-1">
	                          <div className="text-xs font-semibold text-gray-500">Minutes</div>
	                          <select
	                            value={exerciseDurationMins}
	                            onChange={(e) => setExerciseDurationMins(Number(e.target.value))}
	                            className="w-full px-4 py-3 border-2 border-emerald-500 rounded-2xl bg-white text-base font-semibold"
	                          >
	                            {Array.from({ length: 60 }).map((_, i) => (
	                              <option key={i} value={i}>
	                                {i}
	                              </option>
	                            ))}
	                          </select>
	                        </div>
	                      </div>
	                    </div>

	                    <div className="space-y-1">
	                      <label className="block text-sm font-semibold text-gray-900">Time (optional)</label>
	                      <input
	                        type="time"
	                        value={exerciseTimeOfDay}
	                        onChange={(e) => setExerciseTimeOfDay(e.target.value)}
	                        className="w-full px-4 py-3 border border-gray-300 rounded-2xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-base"
	                      />
	                    </div>

                    {(exercisePreviewLoading || exercisePreviewKcal !== null || exercisePreviewError) && (
                      <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3">
                        <div className="text-xs text-gray-500">Estimated calories</div>
                        {exercisePreviewLoading ? (
                          <div className="text-sm font-semibold text-gray-700">Calculating…</div>
                        ) : exercisePreviewError ? (
                          <div className="text-sm font-semibold text-red-600">{exercisePreviewError}</div>
                        ) : (
                          <div className="text-lg font-semibold text-gray-900">
                            {Math.round(convertKcalToUnit(exercisePreviewKcal || 0, energyUnit) || 0)} {energyUnit}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="space-y-1">
                      <label className="block text-sm font-semibold text-gray-900">Calories burned (optional)</label>
                      <div className="relative">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={exerciseCaloriesOverride}
                          onChange={(e) => setExerciseCaloriesOverride(e.target.value)}
                          placeholder={`e.g., ${energyUnit === 'kJ' ? '500' : '150'}`}
                          className="w-full pr-14 px-4 py-3 border border-gray-300 rounded-2xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-base"
                        />
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 text-sm font-semibold">
                          {energyUnit}
                        </div>
                      </div>
                      <div className="text-xs text-gray-500">Leave blank to use the estimate.</div>
                    </div>

                    {exerciseSaveError && <div className="text-sm text-red-600">{exerciseSaveError}</div>}

	                    <div className="grid grid-cols-2 gap-3 pt-1">
	                      <button
	                        type="button"
	                        onClick={() => {
	                          setShowAddExerciseModal(false)
	                          setEditingExerciseEntry(null)
	                        }}
	                        className="py-3 px-4 bg-gray-100 hover:bg-gray-200 text-gray-900 font-semibold rounded-2xl transition-colors duration-200"
	                      >
	                        Cancel
	                      </button>
	                      <button
	                        type="button"
	                        onClick={saveManualExercise}
	                        className="py-3 px-4 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold rounded-2xl transition-colors duration-200 disabled:bg-gray-300 disabled:cursor-not-allowed"
	                      >
	                        {editingExerciseEntry?.id ? 'Save changes' : 'Save'}
	                      </button>
	                    </div>
	                  </div>
	                </>
	              )}
	            </div>
	          </div>
	        </div>
	      )}

		      {/* Add Ingredient Modal (available from both Food Analysis and Today’s Meals dropdowns) */}
		      {showAddIngredientModal && (
		        <div className="fixed inset-0 z-50">
	          <div
	            className="absolute inset-0 bg-black/30"
	            onClick={() => {
	              setShowAddIngredientModal(false)
	              resetOfficialSearchState()
	            }}
	          ></div>
	          <div className="absolute inset-0 flex items-start sm:items-center justify-center mt-10 sm:mt-0">
	            <div className="w-[92%] max-w-lg bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
	              <div className="p-4 border-b border-gray-100 flex items-center justify-between">
	                <div className="font-semibold text-gray-900">Add ingredient</div>
	                <div className="flex items-center gap-2">
	                  <button
	                    type="button"
	                    onClick={() => resetOfficialSearchState()}
	                    className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-medium text-gray-700 hover:bg-gray-50"
	                  >
	                    Reset
	                  </button>
	                  <button
	                    type="button"
	                    onClick={() => {
	                      setShowAddIngredientModal(false)
	                      resetOfficialSearchState()
	                    }}
	                    className="p-2 rounded-md hover:bg-gray-100"
	                  >
	                  <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
	                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
	                  </svg>
	                  </button>
	                </div>
	              </div>
	              <div className="p-4">
                  {/* PROTECTED: ADD_INGREDIENT_MODAL_SEARCH START */}
	                <div className="space-y-2">
	                  <label className="block text-sm font-medium text-gray-900">
	                    Search foods (USDA for single foods, FatSecret + OpenFoodFacts for packaged)
	                  </label>
                  <div className="flex flex-col gap-2">
                    <div className="relative">
                      <input
                        type="text"
                        value={officialSearchQuery}
                        onChange={(e) => {
                          const next = e.target.value
                          setOfficialSearchQuery(next)
                          setOfficialError(null)
                          try {
                            if (officialSearchDebounceRef.current) clearTimeout(officialSearchDebounceRef.current)
                          } catch {}
                          officialSearchDebounceRef.current = null
                          if (next.trim().length >= 2) {
                            officialSearchDebounceRef.current = setTimeout(() => {
                              handleOfficialSearch(officialSource, next)
                            }, 350)
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            try {
                              if (officialSearchDebounceRef.current) clearTimeout(officialSearchDebounceRef.current)
                            } catch {}
                            officialSearchDebounceRef.current = null
                            handleOfficialSearch(officialSource, officialSearchQuery)
                          }
                        }}
                        placeholder={'e.g., pizza'}
                        className="w-full px-3 py-2 pr-12 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-base"
                      />
                      <button
                        type="button"
                        aria-label="Search"
                        disabled={officialLoading || officialSearchQuery.trim().length === 0}
                        onClick={() => handleOfficialSearch(officialSource)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-slate-900 text-white flex items-center justify-center disabled:opacity-60"
                      >
                        {officialLoading ? (
                          <span className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="11" cy="11" r="7" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M20 20l-3.5-3.5" />
                          </svg>
                        )}
                      </button>
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={officialLoading}
                        onClick={() => {
                          setOfficialSource('packaged')
                          if (officialSearchQuery.trim().length >= 2) handleOfficialSearch('packaged', officialSearchQuery)
                        }}
                        className={`flex-1 px-3 py-2 text-xs font-medium rounded-lg border ${
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
                        onClick={() => {
                          setOfficialSource('single')
                          if (officialSearchQuery.trim().length >= 2) handleOfficialSearch('single', officialSearchQuery)
                        }}
                        className={`flex-1 px-3 py-2 text-xs font-medium rounded-lg border ${
                          officialSource === 'single'
                            ? 'bg-slate-800 text-white border-slate-800'
                            : 'bg-white text-gray-700 border-gray-300'
                        } disabled:opacity-60`}
                      >
                        Single food
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setShowAddIngredientModal(false)
                          barcodeReplaceTargetRef.current = null
                          barcodeActionRef.current = addIngredientContextRef.current?.mode === 'analysis' ? 'analysis' : 'diary'
                          setShowBarcodeScanner(true)
                          setBarcodeError(null)
                          setBarcodeValue('')
                        }}
                        className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-xs font-semibold text-gray-800 hover:bg-gray-50"
                      >
                        Scan barcode
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowAddIngredientModal(false)
                          favoritesReplaceTargetRef.current = null
                          favoritesActionRef.current = addIngredientContextRef.current?.mode === 'analysis' ? 'analysis' : 'diary'
                          setShowFavoritesPicker(true)
                        }}
                        className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-xs font-semibold text-gray-800 hover:bg-gray-50"
                      >
                        Add from favorites
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowAddIngredientModal(false)
                          try {
                            selectPhotoInputRef.current?.click()
                          } catch {}
                        }}
                        className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-xs font-semibold text-gray-800 hover:bg-gray-50"
                      >
                        Add by photo
                      </button>
                    </div>
                  </div>
	                  <p className="text-xs text-gray-500">
	                    Single food searches use USDA. Packaged searches use FatSecret + OpenFoodFacts. Plurals are OK — we auto-try the single word.
	                  </p>
	                </div>
                {officialError && <div className="mt-3 text-xs text-red-600">{officialError}</div>}
	                {officialLoading && <div className="mt-3 text-xs text-gray-500">Searching…</div>}
                {!officialLoading && !officialError && officialResults.length > 0 && (
                  <div className="mt-3 max-h-80 overflow-y-auto space-y-2">
                    {officialResults.map((r, idx) => {
                      const display = buildOfficialSearchDisplay(r, officialSearchQuery)
                      return (
                      <div
                        key={`${r.source}-${r.id}-${idx}`}
                        className="flex items-start justify-between rounded-lg border border-gray-200 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-gray-900 truncate">
                            {display.title}
                            {display.showBrandSuffix && r.brand ? ` – ${r.brand}` : ''}
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
                            Source:{' '}
                            {r.source === 'usda'
                              ? 'USDA FoodData Central'
                              : r.source === 'fatsecret'
                              ? 'FatSecret'
                              : r.source === 'openfoodfacts'
                              ? 'OpenFoodFacts'
                              : officialResultsSource || 'Unknown'}
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
                    )})}
                  </div>
                )}
                {!officialLoading && !officialError && officialResults.length === 0 && officialSearchQuery.trim() && (
                  <div className="mt-4 text-xs text-gray-500">
                    {(() => {
                      const last = officialLastRequest
                      const hasLast =
                        last &&
                        last.query?.trim().toLowerCase() === officialSearchQuery.trim().toLowerCase() &&
                        last.mode === officialSource
                      const hint = hasLast
                        ? `Last search: ${last.status ?? '—'} • ${last.itemCount ?? 0} results • ${last.source || '—'}`
                        : null
                      const err = hasLast && last?.errorText ? ` (${String(last.errorText).slice(0, 140)})` : ''
                      return (
                        <div className="space-y-1">
                          <div>No results yet. Plurals are OK — we auto-try the single word.</div>
                          {hint && <div className="text-[11px] text-gray-400">{hint}{err}</div>}
                          <div>Can't find your food? You can use AI photo analysis instead.</div>
                        </div>
                      )
                    })()}
                  </div>
                )}
                  {/* PROTECTED: ADD_INGREDIENT_MODAL_SEARCH END */}
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
      <div className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="max-w-7xl mx-auto">
          {/* Mobile: modern Huawei-style header */}
          <div className="md:hidden flex items-center justify-center">
            <div className="w-full max-w-md flex items-center justify-between">
              <button
                type="button"
                onClick={() => shiftSelectedDateByDays(-1)}
                className="w-11 h-11 rounded-full bg-gray-100 active:bg-gray-200 flex items-center justify-center text-gray-800"
                aria-label="Previous day"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>

              <button
                type="button"
                onClick={() => setShowDateSheet(true)}
                className="flex-1 mx-3 h-11 rounded-2xl bg-white border border-gray-200 shadow-sm px-4 flex items-center justify-center gap-2 active:bg-gray-50"
                aria-label="Open calendar"
              >
                <span className="text-base font-semibold text-gray-900">{mobileDateLabel}</span>
                {!isViewingToday && (
                  <span className="text-xs text-gray-500">{selectedDate.slice(0, 4)}</span>
                )}
                <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              <button
                type="button"
                onClick={() => shiftSelectedDateByDays(1)}
                className="w-11 h-11 rounded-full bg-gray-100 active:bg-gray-200 flex items-center justify-center text-gray-800"
                aria-label="Next day"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>

          {/* Desktop: keep simple date input */}
          <div className="hidden md:flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => shiftSelectedDateByDays(-1)}
              className="px-3 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm"
            >
              ◀︎ Previous
            </button>
            <div className="relative">
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-1 text-transparent caret-transparent"
              />
              <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm font-medium text-gray-700">
                {desktopDateLabel}
              </span>
            </div>
            <button
              type="button"
              onClick={() => shiftSelectedDateByDays(1)}
              className="px-3 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm"
            >
              Next ▶︎
            </button>
            <button
              type="button"
              onClick={() => refreshDiaryNow()}
              disabled={isDiaryRefreshing}
              className={`px-3 py-1 rounded-lg border text-sm flex items-center gap-2 ${
                isDiaryRefreshing
                  ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                  : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
              }`}
              aria-label="Refresh diary"
            >
              {isDiaryRefreshing ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Refreshing
                </>
              ) : (
                'Refresh'
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile calendar sheet */}
      {showDateSheet && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setShowDateSheet(false)}
          />
          <div className="absolute left-0 right-0 bottom-0 bg-white rounded-t-3xl shadow-2xl border-t border-gray-200 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <button
                type="button"
                onClick={() => shiftDateSheetMonth(-1)}
                className="w-10 h-10 rounded-full bg-gray-100 active:bg-gray-200 flex items-center justify-center"
                aria-label="Previous month"
              >
                <svg className="w-5 h-5 text-gray-800" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>

              <div className="flex-1 text-center">
                <div className="text-lg font-semibold text-gray-900">{monthMeta.label}</div>
              </div>

              <button
                type="button"
                onClick={() => shiftDateSheetMonth(1)}
                className="w-10 h-10 rounded-full bg-gray-100 active:bg-gray-200 flex items-center justify-center"
                aria-label="Next month"
              >
                <svg className="w-5 h-5 text-gray-800" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>

            <div className="px-5 pt-4 pb-6">
              <div className="grid grid-cols-7 text-center text-xs font-semibold text-gray-400 mb-2">
                {['SUN','MON','TUE','WED','THU','FRI','SAT'].map((d) => (
                  <div key={d} className="py-1">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-y-2 text-center">
                {Array.from({ length: monthMeta.startDow }).map((_, idx) => (
                  <div key={`pad-${idx}`} />
                ))}
                {Array.from({ length: monthMeta.daysInMonth }).map((_, idx) => {
                  const dayNum = idx + 1
                  const iso = `${monthMeta.year}-${String(monthMeta.month).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`
                  const isSelected = iso === selectedDate
                  const isToday = iso === todayIso
                  const hasEntries = entryDatesInVisibleMonth.has(iso)
                  return (
                    <button
                      key={iso}
                      type="button"
                      onClick={() => selectCalendarDay(dayNum)}
                      className={[
                        'mx-auto w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold',
                        isSelected
                          ? 'bg-emerald-600 text-white'
                          : isToday
                          ? 'bg-white text-gray-900'
                          : hasEntries
                          ? 'bg-orange-500 text-white'
                          : 'bg-white text-gray-900',
                        !isSelected
                          ? isToday
                            ? 'active:bg-gray-100'
                            : hasEntries
                            ? 'active:bg-orange-600'
                            : 'active:bg-gray-100'
                          : 'active:bg-emerald-700',
                        isToday && !isSelected ? 'ring-2 ring-emerald-300' : '',
                      ].join(' ')}
                      aria-label={`Select ${iso}`}
                    >
                      {dayNum}
                    </button>
                  )
                })}
              </div>
              <div className="mt-5 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedDate(todayIso)
                    setShowDateSheet(false)
                  }}
                  className="px-4 py-2 rounded-xl bg-gray-100 text-gray-900 font-semibold active:bg-gray-200"
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => setShowDateSheet(false)}
                  className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-semibold active:bg-emerald-700"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1">
        <div
          className={
            isAnalysisRoute
              ? 'w-full px-3 sm:px-8 py-6 sm:py-8 pb-24 md:pb-8'
              : 'max-w-4xl mx-auto px-3 sm:px-6 py-6 sm:py-8 pb-24 md:pb-8'
          }
        >
        
        {/* Instruction Text - Hidden during edit mode */}
        {!isAnalysisRoute && !isEditingDescription && !editingEntry && (
        <div className="mb-6 text-center">
          <p className="text-lg text-gray-600 font-normal">
            📸 Take a photo of your meal or snack and let AI analyze it!
          </p>
        </div>
        )}

        {historySaveError && (
          <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 text-amber-800 px-4 py-3 text-sm flex items-center justify-between gap-3">
            <span className="flex-1">{historySaveError}</span>
            {(lastHistoryPayload || pendingQueue.length > 0) && (
              <button
                onClick={retryHistorySave}
                disabled={historyRetrying}
                className="px-3 py-1 rounded-md bg-amber-600 text-white text-xs font-semibold disabled:opacity-60"
              >
                {historyRetrying ? 'Retrying…' : 'Retry save'}
              </button>
            )}
          </div>
        )}

        {/* Add Food Button - Hidden during edit mode */}
        {!isAnalysisRoute && !isEditingDescription && !editingEntry && (
        <div className="mb-6 relative add-food-entry-container">
          <button
            onClick={() => {
              // Toggle the global picker; if open, close everything
              if (showCategoryPicker || (showPhotoOptions && photoOptionsAnchor === 'global')) {
                closeAddMenus()
                return
              }
              setShowCategoryPicker(true)
              setShowPhotoOptions(false)
              setPhotoOptionsAnchor('global')
            }}
            className="w-full bg-helfi-green text-white px-4 py-3 rounded-lg hover:bg-helfi-green/90 transition-colors font-medium flex items-center justify-between shadow-lg"
          >
            <div className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
              </span>
              <div className="text-left">
                <div className="text-base sm:text-lg font-semibold">Add Food Entry</div>
              </div>
            </div>
            <svg className={`w-4 h-4 transition-transform ${showCategoryPicker || (showPhotoOptions && photoOptionsAnchor === 'global') ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* Credits usage meter for Food Analysis (visible on initial load) */}
          <div className="mt-2">
            <UsageMeter inline={true} refreshTrigger={usageMeterRefresh} feature="foodAnalysis" />
            <FeatureUsageDisplay featureName="foodAnalysis" featureLabel="Food Analysis" refreshTrigger={usageMeterRefresh} />
            <p className="text-xs text-gray-600 mt-1">Cost: 10 credits per food analysis.</p>
          </div>

          {/* Category picker first */}
          {showCategoryPicker && (
            <div
              className="food-options-dropdown absolute top-full left-0 w-full sm:w-80 sm:left-auto sm:right-0 mt-2 z-50 max-h-[75vh] overflow-y-auto overscroll-contain"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="rounded-2xl shadow-2xl border border-gray-200 bg-white/95 backdrop-blur-xl overflow-hidden divide-y divide-gray-100">
                {MEAL_CATEGORY_ORDER.map((key) => {
                  const label = categoryLabel(key)
                  return (
                  <button
                    key={key}
                    type="button"
                    className="w-full text-left flex items-center px-4 py-3 hover:bg-gray-50 transition-colors"
                    onClick={() => {
                      setSelectedAddCategory(key)
                      setShowCategoryPicker(false)
                      setPhotoOptionsAnchor('global')
                      setShowPhotoOptions(true)
                      setShowAddFood(false)
                    }}
                  >
                    <div className="flex-1">
                      <div className="text-base font-semibold text-gray-900">{label}</div>
                    </div>
                    {selectedAddCategory === key && (
                      <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Simplified Dropdown Options */}
          {showPhotoOptions && photoOptionsAnchor === 'global' && !showCategoryPicker && (
            <div
              className="food-options-dropdown absolute top-full left-0 w-full sm:w-80 sm:left-auto sm:right-0 mt-2 z-50 max-h-[75vh] overflow-y-auto overscroll-contain"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="rounded-2xl shadow-2xl border border-gray-200 bg-white/90 backdrop-blur-xl overflow-hidden">
                <div className="divide-y divide-gray-100">
                  {/* Take Photo Option - Modern card */}
                  <button
                    type="button"
                    className="w-full text-left flex items-center px-4 py-3 hover:bg-gray-50 transition-colors"
                    onClick={() => {
                      setShowPhotoOptions(false)
                      setPhotoOptionsAnchor(null)
                      const qs = new URLSearchParams()
                      qs.set('date', selectedDate)
                      qs.set('category', selectedAddCategory)
                      router.push(`/food/analysis?${qs.toString()}`)
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

	                  <button
	                    type="button"
	                    onClick={() => {
	                      setShowPhotoOptions(false)
	                      setPhotoOptionsAnchor(null)
                        const fresh = Date.now()
	                      router.push(
	                        `/food/recommended?date=${encodeURIComponent(selectedDate)}&category=${encodeURIComponent(
	                          selectedAddCategory,
	                        )}&generate=1&fresh=${fresh}`,
	                      )
	                    }}
	                    className="w-full text-left flex items-center px-4 py-3 hover:bg-gray-50 transition-colors"
	                  >
	                    <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center mr-3 text-purple-700">
	                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
	                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 19.5L6 21l1.5-3.75m7.5 2.25H5.25A2.25 2.25 0 013 17.25V6.75A2.25 2.25 0 015.25 4.5h9.75A2.25 2.25 0 0117.25 6.75v5.25" />
	                      </svg>
	                    </div>
	                    <div className="flex-1">
	                      <div className="text-base font-semibold text-gray-900">Recommended</div>
	                      <div className="text-xs text-gray-500">AI meal suggestion • {AI_MEAL_RECOMMENDATION_CREDITS} credits</div>
	                    </div>
	                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
	                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
	                    </svg>
	                  </button>

	                  <button
	                    type="button"
	                    onClick={() => {
	                      setShowPhotoOptions(false);
                      setPhotoOptionsAnchor(null);
                      favoritesReplaceTargetRef.current = null;
                      favoritesActionRef.current = 'diary';
                      setShowFavoritesPicker(true);
                    }}
                    className="w-full text-left flex items-center px-4 py-3 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center mr-3 text-amber-600">
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <div className="text-base font-semibold text-gray-900">Favorites</div>
                      <div className="text-xs text-gray-500">Reuse a saved meal in {categoryLabel(selectedAddCategory)}</div>
                    </div>
                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowPhotoOptions(false);
                      setPhotoOptionsAnchor(null);
                      barcodeReplaceTargetRef.current = null;
                      barcodeActionRef.current = 'diary';
                      setShowBarcodeScanner(true);
                      setBarcodeError(null);
                      setBarcodeValue('');
                    }}
                    className="w-full text-left flex items-center px-4 py-3 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center mr-3 text-indigo-600">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h2m2 0h2m2 0h2m2 0h2M4 18h2m2 0h2m2 0h2m2 0h2M7 6v12m4-12v12m4-12v12" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <div className="text-base font-semibold text-gray-900">Barcode Scanner</div>
                      <div className="text-xs text-gray-500">
                        Scan packaged foods • 3 credits per scan (FatSecret lookup)
                      </div>
                    </div>
                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>

                  {/* Manual Entry Option */}
                  <button
                    type="button"
                    onClick={(e) =>
                      openAddIngredientModalFromMenu(e, {
                        mode: 'diary',
                        targetCategory: selectedAddCategory,
                      })
                    }
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

        {isAnalysisRoute && (
          <div className="mb-6 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => {
                  if (isAnalyzing) {
                    setShowAnalysisExitConfirm(true)
                    return
                  }
                  resetAnalyzerPanel()
                  router.push('/food')
                }}
                className="inline-flex items-center gap-2 text-sm font-semibold text-gray-700 hover:text-gray-900"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back
              </button>
              <div className="text-base sm:text-lg font-semibold text-gray-900">Food Analysis</div>
              <div className="w-10" />
            </div>
            <div>
              <UsageMeter inline={true} refreshTrigger={usageMeterRefresh} feature="foodAnalysis" />
              <FeatureUsageDisplay featureName="foodAnalysis" featureLabel="Food Analysis" refreshTrigger={usageMeterRefresh} />
              <p className="text-xs text-gray-600 mt-1">Cost: 10 credits per food analysis.</p>
            </div>
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
        <input
          ref={replacePhotoInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleReplacePhotoUpload}
        />

        {/* Mode chooser modal immediately after photo selection */}
        {showAnalysisModeModal && !isAnalysisRoute && (
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
              {analysisMode !== 'packaged' && (
                <div className="rounded-lg border border-gray-200 p-3 bg-gray-50">
                  <label className="block text-sm font-medium text-gray-900">
                    Optional hint (only for tricky items)
                  </label>
                  <p className="text-xs text-gray-500 mt-1">
                    If one item could be confused (e.g., beef vs lamb, banana bread vs carrot cake), mention just that item. You don't need to describe the entire plate.
                  </p>
                  <input
                    type="text"
                    value={analysisHint}
                    onChange={(e) => setAnalysisHint(e.target.value)}
                    placeholder="e.g., Christmas pudding"
                    className="mt-2 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm"
                  />
                </div>
              )}
              <div className="text-xs text-gray-600">
                Product nutrition image: take a clear photo of the nutrition facts panel. We’ll read the per-serving numbers.
              </div>
              {pendingPhotoPicker && (
                <button
                  onClick={() => {
                    setShowAnalysisModeModal(false);
                    try { selectPhotoInputRef.current?.click(); } catch {}
                  }}
                  className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 font-semibold"
                >
                  Choose photo / camera
                </button>
              )}
              {photoPreview && (
                <>
                  <div className="rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs text-yellow-800">
                    ⏱️ <strong>Heads up:</strong> Complex meals can take longer to analyze (sometimes 1+ minute). We prioritize accuracy and will keep working until it finishes.
                  </div>
                  <button
                    onClick={() => analyzePhoto()}
                    className="w-full bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 font-semibold"
                  >
                    🤖 Analyze with AI
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {showAnalysisExitConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <div className="absolute inset-0 bg-black/50" onClick={() => setShowAnalysisExitConfirm(false)} />
            <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-gray-200 p-5 space-y-4">
              <div className="text-base font-semibold text-gray-900">Analysis in progress</div>
              <p className="text-sm text-gray-600">
                A food analysis is running. Are you sure you want to cancel and go back?
              </p>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAnalysisExitConfirm(false)}
                  className="px-3 py-2 rounded-lg border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                >
                  No, stay here
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAnalysisExitConfirm(false)
                    resetAnalyzerPanel()
                    router.push('/food')
                  }}
                  className="px-3 py-2 rounded-lg bg-red-600 text-sm font-semibold text-white hover:bg-red-700"
                >
                  Yes, cancel
                </button>
              </div>
            </div>
          </div>
        )}

                {/* Food Processing Area */}
        {shouldShowAddPanel && (
          // Outer wrapper now has no extra background so the inner Food Analysis
          // card can stretch closer to the screen edges on mobile.
          <div className="mb-6">

            {/* Analysis start (dedicated page) */}
            {isAnalysisRoute && !photoPreview && !showAiResult && !isEditingDescription && (
              <div className="text-center space-y-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Choose a photo to analyze</h3>
                  <p className="text-sm text-gray-600">
                    We’ll tailor the AI before analyzing your food.
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-left">
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
                {analysisMode !== 'packaged' && (
                  <div className="rounded-lg border border-gray-200 p-3 bg-gray-50 text-left">
                    <label className="block text-sm font-medium text-gray-900">
                      Optional hint (only for tricky items)
                    </label>
                    <p className="text-xs text-gray-500 mt-1">
                      If one item could be confused (e.g., beef vs lamb, banana bread vs carrot cake), mention just that item.
                    </p>
                    <input
                      type="text"
                      value={analysisHint}
                      onChange={(e) => setAnalysisHint(e.target.value)}
                      placeholder="e.g., Christmas pudding"
                      className="mt-2 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm"
                    />
                  </div>
                )}
                <p className="text-xs text-gray-600">
                  Product nutrition image: take a clear photo of the nutrition facts panel. We’ll read the per-serving numbers.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    try {
                      selectPhotoInputRef.current?.click()
                    } catch {}
                  }}
                  className="w-full sm:w-auto mx-auto px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold"
                >
                  Choose photo / camera
                </button>
              </div>
            )}
            
            {/* Photo Analysis Flow */}
            {photoPreview && !showAiResult && !isEditingDescription && (
              <div className="text-center">
                <h3 className="text-lg font-semibold mb-4">📸 Your Photo</h3>
                <div className="relative w-full max-w-sm mx-auto mb-6">
                  {foodImagesLoading[photoPreview] && (
                    <div className="absolute inset-0 bg-gray-100 rounded-lg flex items-center justify-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
                    </div>
                  )}
                  {isInlineImageSrc(photoPreview) ? (
                    <img
                      src={photoPreview}
                      alt="Food preview"
                      className={`w-full aspect-square object-cover rounded-lg shadow-lg transition-opacity duration-300 ${
                        foodImagesLoading[photoPreview] ? 'opacity-0' : 'opacity-100'
                      }`}
                      onLoad={() =>
                        setFoodImagesLoading((prev: Record<string, boolean>) => ({
                          ...prev,
                          [photoPreview]: false,
                        }))
                      }
                      onError={() =>
                        setFoodImagesLoading((prev: Record<string, boolean>) => ({
                          ...prev,
                          [photoPreview]: false,
                        }))
                      }
                    />
                  ) : (
                    <Image
                      src={photoPreview}
                      alt="Food preview"
                      width={300}
                      height={300}
                      className={`w-full aspect-square object-cover rounded-lg shadow-lg transition-opacity duration-300 ${
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
                      onError={() =>
                        setFoodImagesLoading((prev: Record<string, boolean>) => ({
                          ...prev,
                          [photoPreview]: false,
                        }))
                      }
                    />
                  )}
                </div>
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
                  <div className="rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs text-yellow-800 text-left">
                    ⏱️ <strong>Heads up:</strong> Complex meals can take longer to analyze (sometimes 1+ minute). We prioritize accuracy and will keep working until it finishes.
                  </div>
                  <button
                    onClick={() => analyzePhoto()}
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
                  {analysisMode !== 'packaged' && (
                    <div className="rounded-lg border border-gray-200 p-3 bg-gray-50">
                      <label className="block text-sm font-medium text-gray-900">
                        Optional hint (only for tricky items)
                      </label>
                      <p className="text-xs text-gray-500 mt-1">
                        If one item could be confused (e.g., beef vs lamb, banana bread vs carrot cake), mention just that item. You don't need to describe the entire plate.
                      </p>
                      <input
                        type="text"
                        value={analysisHint}
                        onChange={(e) => setAnalysisHint(e.target.value)}
                        placeholder="e.g., Christmas pudding"
                        className="mt-2 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm"
                      />
                    </div>
                  )}
                  <div className="text-xs text-gray-600">
                    Product nutrition image reads the per-serving column exactly (ignores per-100g).
                  </div>
                  {!isAnalysisRoute && (
                    <div className="mt-2">
                      <p className="text-xs text-gray-500 text-center mb-2">Cost: 10 credits per food analysis</p>
                      {!hasPaidAccess && (
                        <div className="text-[11px] text-blue-800 bg-blue-50 border border-blue-200 rounded px-2 py-1 mb-2 text-center">
                          Free accounts can try this AI feature once. After your free analysis, upgrade or buy credits to continue.
                        </div>
                      )}
                      <UsageMeter inline={true} refreshTrigger={usageMeterRefresh} feature="foodAnalysis" />
                      <FeatureUsageDisplay featureName="foodAnalysis" featureLabel="Food Analysis" refreshTrigger={usageMeterRefresh} />
                    </div>
                  )}
                  
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
                        setShowAnalysisModeModal(false);
                        setPendingPhotoPicker(false);
                        setIsAnalyzing(false);
                        setAnalysisPhase('idle');
                        // Keep the edit panel visible when removing a photo during edit flows (e.g., Add Ingredient path)
                        if (editingEntry) {
                          setShowAddFood(true);
                          setShowAiResult(true);
                          setIsEditingDescription(false);
                        } else {
                          setShowAddFood(false);
                          setShowAiResult(false);
                        }
                      }}
                      className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors text-sm font-medium"
                    >
                      🗑️ Delete Photo
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* AI Analysis Result - Premium Cronometer-style UI */}
            {showAiResult && (
              <div
                className="w-full bg-transparent border-0 shadow-none rounded-none"
              >
                {editingEntry && (
                  <div className="flex items-center justify-end gap-3 px-4 pt-4">
                    <button
                      type="button"
                      onClick={handleCancelEditing}
                      className="px-3 py-1.5 rounded-full border border-gray-200 text-sm font-semibold text-gray-800 hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleDeleteEditingEntry}
                      disabled={isDeletingEditingEntry}
                      aria-busy={isDeletingEditingEntry}
                      className="px-3 py-1.5 rounded-full bg-red-600 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-80 disabled:cursor-not-allowed"
                    >
                      {isDeletingEditingEntry ? (
                        <span className="inline-flex items-center gap-2">
                          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/70 border-t-transparent" />
                          Deleting...
                        </span>
                      ) : (
                        'Delete'
                      )}
                    </button>
                  </div>
                )}
                {/* Photo Section - full width image for mobile / non-editing.
                    When editing an entry, clicking the image lets you change the photo. */}
                {photoPreview && (
                  <div
                    className={`p-4 border-b border-gray-100 flex justify-center ${
                      editingEntry ? 'lg:hidden' : ''
                    }`}
                  >
                    <div
                      className={`relative w-full max-w-sm mx-auto ${editingEntry ? 'cursor-pointer group' : ''}`}
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
                      {isInlineImageSrc(photoPreview) ? (
                        <img
                          src={photoPreview}
                          alt="Analyzed food"
                          className={`w-full max-w-sm aspect-square object-cover rounded-xl transition-opacity duration-300 ${
                            foodImagesLoading[photoPreview] ? 'opacity-0' : 'opacity-100'
                          }`}
                          onLoad={() =>
                            setFoodImagesLoading((prev: Record<string, boolean>) => ({
                              ...prev,
                              [photoPreview]: false,
                            }))
                          }
                          onError={() => {
                            if (!photoPreview) return
                            setFoodImagesLoading((prev: Record<string, boolean>) => ({
                              ...prev,
                              [photoPreview]: false,
                            }))
                            if (editingEntry) {
                              refreshEditingEntryPhoto()
                            }
                          }}
                        />
                      ) : (
                        <Image
                          src={photoPreview}
                          alt="Analyzed food"
                          width={300}
                          height={300}
                          className={`w-full max-w-sm aspect-square object-cover rounded-xl transition-opacity duration-300 ${
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
                          onError={() => {
                            if (!photoPreview) return
                            setFoodImagesLoading((prev: Record<string, boolean>) => ({
                              ...prev,
                              [photoPreview]: false,
                            }))
                            if (editingEntry) {
                              refreshEditingEntryPhoto()
                            }
                          }}
                        />
                      )}
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

                {editingEntry && !isEntryAlreadyFavorite(editingEntry) && (
                  <div className="px-4 mt-3 flex justify-center">
                    <button
                      type="button"
                      onClick={() => handleAddToFavorites(editingEntry)}
                      className="w-full max-w-sm px-4 py-2 rounded-full bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700"
                    >
                      Add to Favorites
                    </button>
                  </div>
                )}
                
                {/* Premium Nutrition Display */}
                <div className="p-4 sm:p-6">
                  {feedbackRescanMessage && (
                    <div className="sticky top-3 z-20 mb-4">
                      <div className="mx-auto w-full max-w-xl rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 shadow-sm">
                        <div className="flex items-center gap-2 font-semibold">
                          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                          {feedbackRescanMessage}
                        </div>
                      </div>
                    </div>
                  )}

                  {barcodeLabelFlow && (
                    <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                      <div className="font-semibold">
                        {barcodeLabelFlow.reason === 'report' ? 'Barcode update' : 'Barcode label scan'}
                      </div>
                      <div className="text-xs text-emerald-800 mt-1">
                        {barcodeLabelFlow.reason === 'report'
                          ? 'This will refresh the barcode nutrition for everyone after you save.'
                          : 'We’ll save this nutrition to the barcode so future scans are correct.'}
                      </div>
                    </div>
                  )}

                  {labelBlocked && (
                    <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
                      <div className="font-semibold">Label numbers look wrong</div>
                      <div className="text-xs text-red-800 mt-1">{labelValidation.message}</div>
                      <div className="text-xs text-red-800 mt-1">
                        Fix the macros with the pencil icon or retake the label photo to continue.
                      </div>
                      <button
                        type="button"
                        onClick={openLabelEdit}
                        className="mt-3 inline-flex items-center gap-2 rounded-full border border-red-300 bg-white px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-100"
                      >
                        Edit label numbers
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
                            {isInlineImageSrc(photoPreview) ? (
                              <img
                                src={photoPreview}
                                alt="Analyzed food"
                                className="w-full max-w-sm aspect-square object-cover transition-transform duration-200 group-hover:scale-[1.01]"
                                onError={() => {
                                  if (editingEntry) {
                                    refreshEditingEntryPhoto()
                                  }
                                }}
                              />
                            ) : (
                              <Image
                                src={photoPreview}
                                alt="Analyzed food"
                                width={300}
                                height={300}
                                className="w-full max-w-sm aspect-square object-cover transition-transform duration-200 group-hover:scale-[1.01]"
                                onError={() => {
                                  if (editingEntry) {
                                    refreshEditingEntryPhoto()
                                  }
                                }}
                              />
                            )}
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
                      <div className={`mb-6 mt-3 p-4 sm:p-6 ${editingEntry ? 'lg:hidden' : ''}`}>
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

                  {editingEntry && aiSavedMealMeta && (
                    <div className="mb-4">
                      <div className="flex items-center justify-center flex-wrap gap-2">
                        {[
                          { key: 'ingredients' as const, label: 'Ingredients' },
                          { key: 'recipe' as const, label: 'Recipe' },
                          { key: 'reason' as const, label: 'Reason' },
                        ].map((tab) => {
                          const isActive = aiEntryTab === tab.key
                          return (
                            <button
                              key={tab.key}
                              type="button"
                              onClick={() => setAiEntryTab(tab.key)}
                              className={`px-3 py-2 text-sm font-semibold rounded-xl ${
                                isActive ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                              }`}
                              aria-pressed={isActive}
                            >
                              {tab.label}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {editingEntry && aiSavedMealMeta && aiEntryTab !== 'ingredients' && (
                    <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-4">
                      {aiEntryTab === 'recipe' ? (
                        <>
                          {(() => {
                            const recipe = aiSavedMealMeta.recipe
                            if (!recipe) return null
                            const parts: string[] = []
                            if (typeof recipe.prepMinutes === 'number' && Number.isFinite(recipe.prepMinutes)) {
                              parts.push(`Prep ${Math.round(recipe.prepMinutes)} min`)
                            }
                            if (typeof recipe.cookMinutes === 'number' && Number.isFinite(recipe.cookMinutes)) {
                              parts.push(`Cook ${Math.round(recipe.cookMinutes)} min`)
                            }
                            if (typeof recipe.servings === 'number' && Number.isFinite(recipe.servings)) {
                              parts.push(`${Math.round(recipe.servings)} serving${Math.round(recipe.servings) === 1 ? '' : 's'}`)
                            }
                            return parts.length > 0 ? <div className="text-xs text-gray-500 mb-2">{parts.join(' • ')}</div> : null
                          })()}
                          {aiSavedMealMeta.recipe?.steps?.length ? (
                            <ol className="space-y-2 text-sm text-gray-700 list-decimal pl-5">
                              {aiSavedMealMeta.recipe.steps.slice(0, 12).map((step: string, i: number) => (
                                <li key={i} className="leading-relaxed">
                                  {step}
                                </li>
                              ))}
                            </ol>
                          ) : (
                            <div className="text-sm text-gray-600">No recipe steps saved.</div>
                          )}
                        </>
                      ) : (
                        <>
                          <div className="text-sm font-semibold text-gray-900">Why this meal was chosen</div>
                          <div className="mt-2 text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                            {aiSavedMealMeta.why || 'No reason saved.'}
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {(!editingEntry || !aiSavedMealMeta || aiEntryTab === 'ingredients') && (
                    <>
                  {/* Detected Items with Brand, Serving Size, and Edit Controls */}
                  {analyzedItems && analyzedItems.length > 0 && !isEditingDescription ? (
                    <div
                      className="mb-6 -mx-4 sm:-mx-6"
                      style={isMobile ? { marginLeft: 'calc(50% - 50vw)', marginRight: 'calc(50% - 50vw)' } : undefined}
                    >
                      <div className="mb-1 px-4 sm:px-6 flex flex-col items-center gap-2">
                        <div className="flex flex-wrap items-center justify-center gap-3 text-center">
                          <div className="text-sm sm:text-base font-medium text-gray-600">Detected Foods:</div>
                          <div className="flex items-center gap-2 text-sm sm:text-base text-gray-500">
                            <span className="whitespace-nowrap">Rate this result</span>
                            <button
                              type="button"
                              onClick={() => handleOverallThumb('up')}
                              className={`p-1.5 rounded-md transition-colors ${
                                analysisFeedbackOverall === 'up'
                                  ? 'bg-emerald-600 text-white'
                                  : 'text-gray-400 hover:text-emerald-600 hover:bg-emerald-50'
                              }`}
                              title="Thumbs up"
                            >
                              <HandThumbUpIcon className="w-6 h-6" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOverallThumb('down')}
                              className={`p-1.5 rounded-md transition-colors ${
                                analysisFeedbackOverall === 'down'
                                  ? 'bg-red-600 text-white'
                                  : 'text-gray-400 hover:text-red-600 hover:bg-red-50'
                              }`}
                              title="Thumbs down"
                            >
                              <HandThumbDownIcon className="w-6 h-6" />
                            </button>
                          </div>
                        </div>
                        <button
                          onClick={(e) =>
                            openAddIngredientModalFromMenu(e, {
                              mode: 'analysis',
                            })
                          }
                          className="w-full max-w-sm px-4 py-2 rounded-full bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors"
                          title="Add a missing ingredient"
                        >
                          + Add ingredient
                        </button>
                      </div>
                      <div
                        className={`mt-3 ${
                          analyzedItems.length > 1 && expandedItemIndex === null
                            ? 'rounded-2xl border border-gray-200 bg-white overflow-hidden'
                            : ''
                        }`}
                      >
                      {analyzedItems.map((item: any, index: number) => {
                        const servingsCount = effectiveServings(item)
                        const macroMultiplier = macroMultiplierForItem(item)
                        const totalCalories = Math.round((item.calories || 0) * servingsCount * macroMultiplier)
                        const totalProtein = Math.round(((item.protein_g || 0) * servingsCount * macroMultiplier) * 10) / 10
                        const totalCarbs = Math.round(((item.carbs_g || 0) * servingsCount * macroMultiplier) * 10) / 10
                        const totalFat = Math.round(((item.fat_g || 0) * servingsCount * macroMultiplier) * 10) / 10
                        const totalFiber = Math.round(((item.fiber_g ?? 0) * servingsCount * macroMultiplier) * 10) / 10
                        const totalSugar = Math.round(((item.sugar_g ?? 0) * servingsCount * macroMultiplier) * 10) / 10
                        const formattedServings = `${formatServingsDisplay(servingsCount)} serving${Math.abs(servingsCount - 1) < 0.001 ? '' : 's'}`
                        const baseWeightPerServing = getBaseWeightPerServing(item)
                        
                        // Function to focus weight input (for mobile serving size click)
                        const focusWeightInput = () => {
                          const weightInput = document.querySelector(`input[data-weight-input-id="weight-input-${index}"]`) as HTMLInputElement
                          if (weightInput) {
                            weightInput.focus()
                            // On mobile, select all text when focusing to allow easy replacement
                            if (window.innerWidth < 768) {
                              weightInput.select()
                            }
                          }
                        }

                        const totalsByField: Record<string, number | null> = {
                          calories: totalCalories,
                          protein_g: totalProtein,
                          carbs_g: totalCarbs,
                          fat_g: totalFat,
                          fiber_g: totalFiber,
                          sugar_g: totalSugar,
                        }
                        // Prefer an explicit serving_size from the item; if missing, try to
                        // derive one from the name in parentheses, e.g. "Grilled Salmon (6 oz)"
                        const servingSizeLabel = (() => {
                          const direct = (item.serving_size && String(item.serving_size).trim()) || ''
                          if (direct) return direct
                          const name = String(item.name || '')
                          const m = name.match(/\(([^)]+)\)/)
                          return m && m[1] ? m[1].trim() : ''
                        })()
                        const servingUnitMeta = parseServingUnitMetadata(servingSizeLabel || item?.name || '')
                        const servingInfo = parseServingSizeInfo({ serving_size: servingSizeLabel })
                        const gramsPerServing = servingInfo.gramsPerServing
                        const mlPerServing = servingInfo.mlPerServing
                        const declaredQty =
                          servingUnitMeta && Number.isFinite(servingUnitMeta.quantity) && servingUnitMeta.quantity > 0
                            ? Number(servingUnitMeta.quantity)
                            : 1
                        const totalsLabel = formattedServings

                        const piecesPerServing =
                          getPiecesPerServing(item) ||
                          (servingUnitMeta &&
                            isDiscreteUnitLabel(servingUnitMeta.unitLabel) &&
                            servingUnitMeta.quantity >= 1 &&
                            !isFractionalServingQuantity(servingUnitMeta.quantity)
                            ? servingUnitMeta.quantity
                            : null)
                        const piecesDisplayMultiplier =
                          piecesPerServing && piecesPerServing > 1 && declaredQty <= 1 ? piecesPerServing : null
                        const servingsStep =
                          piecesPerServing && piecesPerServing > 0 ? 1 / piecesPerServing : 0.25
                        const pieceCount =
                          piecesPerServing && piecesPerServing > 0
                            ? Math.max(0, Math.round(servingsCount * piecesPerServing * 1000) / 1000)
                            : null
                        const piecesPerServingValue =
                          piecesPerServing && piecesPerServing > 1 ? piecesPerServing : null
                        const showPiecesControl = Boolean(piecesPerServingValue)
                        const pieceCountDisplay =
                          showPiecesControl && pieceCount !== null ? formatPieceDisplay(pieceCount) : ''

                        const cleanBaseName = (() => {
                          const raw = String(item.name || 'Unknown Food')
                          const strippedNumeric = raw.replace(/^\s*\d+(\.\d+)?\s+/, '')
                          const strippedWord = strippedNumeric.replace(
                            /^\s*(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+/i,
                            '',
                          )
                          const withoutGenericPrefixes = strippedWord
                            // Drop noisy summary prefixes that shouldn't appear as ingredient names
                            .replace(/^\s*(several components|multiple components)\s*:\s*/i, '')
                            .replace(/^\s*(components?)\s*:\s*/i, '')
                            .replace(/^\s*(a\s+)?(bowl|plate|meal)\s+with\s+several\s+components\s*:?\s*/i, '')
                          const trimmed = withoutGenericPrefixes.trim()
                          return trimmed || 'Unknown Food'
                        })()
                        const displayName = (() => {
                          const base =
                            showPiecesControl && pieceCountDisplay
                              ? `${pieceCountDisplay} ${cleanBaseName}`.trim()
                              : cleanBaseName
                          if (!base) return base
                          for (let i = 0; i < base.length; i += 1) {
                            const ch = base[i]
                            if (ch >= 'a' && ch <= 'z') {
                              return `${base.slice(0, i)}${ch.toUpperCase()}${base.slice(i + 1)}`
                            }
                            if (ch >= 'A' && ch <= 'Z') {
                              return base
                            }
                          }
                          return base
                        })()
                        const servingSizeDisplayLabel = (() => {
                          if (piecesDisplayMultiplier && servingSizeLabel) {
                            const withoutLeadingOne = servingSizeLabel.replace(/^\s*1\s+/, '').trim()
                            const baseLabel = withoutLeadingOne || servingSizeLabel
                            const suffix = servingSizeLabel.includes('(') ? ' each' : ''
                            return `${formatNumberInputValue(piecesDisplayMultiplier)} ${baseLabel}${suffix}`.trim()
                          }
                          return servingSizeLabel
                        })()
                        const servingOptions = Array.isArray(item?.servingOptions) ? item.servingOptions : []
                        const selectedServingId = item?.selectedServingId || ''

                        const isBarcodeItem = Boolean(
                          item?.barcode || item?.barcodeSource || item?.detectionMethod === 'barcode',
                        )
                        const barcodeCode = item?.barcode ? String(item.barcode) : ''
                        const isMultiIngredient = analyzedItems.length > 1
                        const isExpanded = !isMultiIngredient || expandedItemIndex === index
                        const isCollapsed = isMultiIngredient && !isExpanded
                        const toggleExpand = () => {
                          if (!isMultiIngredient) return
                          setExpandedItemIndex(expandedItemIndex === index ? null : index)
                        }
                        
                        const cardPaddingClass =
                          isCollapsed ? 'py-2 px-5' : 'p-5'
                        const isGroupedCollapsed = isCollapsed && analyzedItems.length > 1 && expandedItemIndex === null

                        return (
                          <div
                            key={index}
                            data-analysis-ingredient-card="1"
                            className={`${
                              isCollapsed
                                ? isGroupedCollapsed
                                  ? `bg-white ${cardPaddingClass} ${
                                      index < analyzedItems.length - 1 ? 'border-b border-gray-200' : ''
                                    } cursor-pointer`
                                  : `bg-white border-gray-200 ${cardPaddingClass} border-b ${index === 0 ? 'border-t' : ''} rounded-none cursor-pointer`
                                : `bg-white border border-slate-100 shadow-sm ${cardPaddingClass} rounded-2xl`
                            } overflow-hidden min-w-0`}
                            role={isCollapsed ? 'button' : undefined}
                            tabIndex={isCollapsed ? 0 : undefined}
                            onClick={isCollapsed ? toggleExpand : undefined}
                            onKeyDown={
                              isCollapsed
                                ? (event) => {
                                    if (event.key === 'Enter' || event.key === ' ') {
                                      event.preventDefault()
                                      toggleExpand()
                                    }
                                  }
                                : undefined
                            }
                          >
                            {/* Header row with actions, title, and description */}
                            {isCollapsed ? (
                              <div className="flex items-center justify-between gap-2">
                                <div className="font-semibold text-slate-900 text-base leading-tight break-words">
                                  {displayName}
                                </div>
                                <button
                                  onClick={() => {
                                    toggleExpand()
                                  }}
                                  className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                                  title="Expand"
                                >
                                  <span className="material-symbols-outlined text-[20px]">expand_more</span>
                                </button>
                              </div>
                            ) : (
                              <div className="flex flex-col mb-3">
                                <div className="flex items-center justify-end">
                                  <div className="flex items-center gap-1 bg-white border border-slate-200 px-3 py-1.5 rounded-full shadow-sm">
                                    <button
                                      type="button"
                                      onClick={() => handleItemThumb(index, 'up')}
                                      className={`p-1.5 rounded-full transition-colors ${
                                        analysisFeedbackItems[index] === 'up'
                                          ? 'bg-emerald-600 text-white'
                                          : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'
                                      }`}
                                      title="Thumbs up"
                                    >
                                      <span className="material-symbols-outlined text-[20px]">thumb_up</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleItemThumb(index, 'down')}
                                      className={`p-1.5 rounded-full transition-colors ${
                                        analysisFeedbackItems[index] === 'down'
                                          ? 'bg-red-600 text-white'
                                          : 'text-slate-400 hover:text-red-600 hover:bg-red-50'
                                      }`}
                                      title="Thumbs down"
                                    >
                                      <span className="material-symbols-outlined text-[20px]">thumb_down</span>
                                    </button>
                                    <div className="w-px h-4 bg-slate-200 mx-1" />
                                    <button
                                      onClick={() => {
                                        setEditingItemIndex(index);
                                        setShowItemEditModal(true);
                                      }}
                                      className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-full transition-colors"
                                      title="Adjust details"
                                    >
                                      <span className="material-symbols-outlined text-[20px]">edit</span>
                                    </button>
                                    <button
                                      onClick={() => handleDeleteItem(index)}
                                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors"
                                      title="Delete ingredient"
                                    >
                                      <span className="material-symbols-outlined text-[20px]">delete</span>
                                    </button>
                                    <div className="w-px h-4 bg-slate-200 mx-1" />
                                    {isMultiIngredient && (
                                      <button
                                        onClick={() => {
                                          toggleExpand()
                                        }}
                                        className="p-1.5 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-full transition-colors"
                                        title={isExpanded ? 'Collapse' : 'Expand'}
                                      >
                                        <span className="material-symbols-outlined text-[20px]">unfold_less</span>
                                      </button>
                                    )}
                                  </div>
                                </div>
                                <div className="font-semibold text-slate-900 text-lg mt-2 break-words">
                                  {displayName}
                                </div>
                                {item.brand && (
                                  <div className="text-xs font-semibold text-slate-400 uppercase tracking-widest mt-1">
                                    {item.brand}
                                  </div>
                                )}
                                <div 
                                  className="text-sm text-slate-500 mt-1 md:cursor-default cursor-pointer active:opacity-70 break-words"
                                  onClick={() => {
                                    // On mobile, clicking serving size focuses weight input
                                    if (window.innerWidth < 768) {
                                      focusWeightInput()
                                    }
                                  }}
                                >
                                  Serving size: {formatServingSizeDisplay(servingSizeDisplayLabel || '', item)}
                                </div>
                                {servingOptions.length > 0 && (
                                  <div className="mt-2">
                                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1">
                                      Serving size
                                    </label>
                                    <select
                                      value={selectedServingId || servingOptions[0]?.id || ''}
                                      onChange={(e) => handleServingOptionSelect(index, e.target.value)}
                                      className="w-full max-w-xs px-3 py-2 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 bg-slate-50 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                                    >
                                      {servingOptions.map((option: any) => (
                                        <option key={option.id} value={option.id}>
                                          {option.label || option.serving_size}
                                        </option>
                                      ))}
                                    </select>
                                    {item?.dbSource && (
                                      <div className="mt-1 text-[11px] text-slate-400">
                                        Data source: {item.dbSource === 'usda' ? 'USDA' : item.dbSource === 'fatsecret' ? 'FatSecret' : 'Database'}
                                      </div>
                                    )}
                                  </div>
                                )}
                                {isBarcodeItem && barcodeCode && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setBarcodeLabelFlow({
                                        barcode: barcodeCode,
                                        reason: 'report',
                                        productName: item?.name || null,
                                        brand: item?.brand || null,
                                      })
                                      setShowBarcodeLabelPrompt(true)
                                    }}
                                    className="mt-3 text-xs font-semibold uppercase tracking-wider text-emerald-700 hover:text-emerald-800"
                                  >
                                    Report incorrect nutrition
                                  </button>
                                )}
                              </div>
                            )}
                            
                            {/* Portion controls: servings + optional weight editor (keeps servings/pieces/weight in sync). */}
                            {isExpanded && (
                              <div className="flex flex-col gap-3 mb-4 pb-4 border-b border-slate-100">
                                <div className="flex items-center justify-between gap-3">
                                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Servings</span>
                                  <div className="flex items-center bg-slate-100 p-1 rounded-xl">
                                    <button
                                      onClick={() => {
                                        const current = analyzedItems[index]?.servings || 1
                                        const step = servingsStep
                                        const snapToStep = (val: number) => {
                                          if (!step || step <= 0) return val
                                          const snapped = Math.round(val / step)
                                          return Math.max(0, Math.round(snapped * step * 10000) / 10000)
                                        }
                                        const next = snapToStep(current - step)
                                        updateItemField(index, 'servings', next)
                                      }}
                                      className="w-10 h-10 flex items-center justify-center rounded-lg bg-white shadow-sm active:scale-95 transition-transform text-emerald-600"
                                    >
                                      -
                                    </button>
                                    <input
                                      type="number"
                                      inputMode="decimal"
                                      min={0}
                                      step={servingsStep > 0 ? Math.max(servingsStep, 0.01) : 0.25}
                                      value={(() => {
                                        const key = `ai:card:${index}:servings`
                                        return Object.prototype.hasOwnProperty.call(numericInputDrafts, key)
                                          ? numericInputDrafts[key]
                                          : formatNumberInputValue(item.servings ?? 1)
                                      })()}
                                      onFocus={() => {
                                        const key = `ai:card:${index}:servings`
                                        setNumericInputDrafts((prev) => ({ ...prev, [key]: '' }))
                                      }}
                                      onChange={(e) => {
                                        const key = `ai:card:${index}:servings`
                                        const v = e.target.value
                                        setNumericInputDrafts((prev) => ({ ...prev, [key]: v }))
                                        if (String(v).trim() !== '') {
                                          updateItemField(index, 'servings', v)
                                        }
                                      }}
                                      onBlur={() => {
                                        const key = `ai:card:${index}:servings`
                                        setNumericInputDrafts((prev) => {
                                          const next = { ...prev }
                                          delete next[key]
                                          return next
                                        })
                                      }}
                                      className="w-16 bg-transparent border-none text-center font-bold text-lg text-slate-900 outline-none focus:outline-none focus:ring-0 focus:shadow-none focus-visible:outline-none focus-visible:ring-0 appearance-none p-0"
                                      style={{ outline: 'none', boxShadow: 'none' }}
                                    />
                                    <button
                                      onClick={() => {
                                        const current = analyzedItems[index]?.servings || 1
                                        const step = servingsStep
                                        const snapToStep = (val: number) => {
                                          if (!step || step <= 0) return val
                                          const snapped = Math.round(val / step)
                                          return Math.max(0, Math.round(snapped * step * 10000) / 10000)
                                        }
                                        const next = snapToStep(current + step)
                                        updateItemField(index, 'servings', next)
                                      }}
                                      className="w-10 h-10 flex items-center justify-center rounded-lg bg-white shadow-sm active:scale-95 transition-transform text-emerald-600"
                                    >
                                      +
                                    </button>
                                  </div>
                                </div>
                                <div className="text-xs text-slate-400">
                                  {servingSizeDisplayLabel ? `1 serving = ${servingSizeDisplayLabel}` : 'Serving size not specified'}
                                </div>
                                {/* Pieces control for discrete items */}
                                {/* Only show pieces when we have multiple items, not for a single slice/piece. */}
                                {showPiecesControl && piecesPerServingValue && (
                                  <div className="flex items-center justify-between gap-3 mt-2">
                                    <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                                      {(() => {
                                        const labelSource = String(servingSizeDisplayLabel || item?.serving_size || item?.name || '')
                                        const meta = parseServingUnitMetadata(labelSource)
                                        const unit = (meta?.unitLabelSingular || '').toLowerCase()
                                        if (unit.includes('egg')) return 'Eggs:'
                                        if (unit.includes('slice')) return 'Slices:'
                                        if (unit.includes('patty')) return 'Patties:'
                                        return 'Pieces:'
                                      })()}
                                    </span>
                                  <div className="flex items-center bg-slate-100 p-1 rounded-xl">
                                    <button
                                      onClick={() => {
                                        const current = analyzedItems[index]?.servings || 1
                                        const currentPieces = pieceCount ?? current * piecesPerServingValue
                                        const newPieces = Math.max(0, currentPieces - 1)
                                        const newServings = newPieces / piecesPerServingValue
                                        updateItemField(index, 'servings', newServings)
                                      }}
                                      className="w-10 h-10 flex items-center justify-center rounded-lg bg-white shadow-sm active:scale-95 transition-transform text-emerald-600"
                                    >
                                      -
                                    </button>
                                      <input
                                        type="number"
                                        inputMode="decimal"
                                        min={0}
                                        step={0.01}
                                        value={(() => {
                                          const key = `ai:card:${index}:pieces`
                                          return Object.prototype.hasOwnProperty.call(numericInputDrafts, key)
                                            ? numericInputDrafts[key]
                                            : pieceCountDisplay
                                        })()}
                                        onFocus={() => {
                                          const key = `ai:card:${index}:pieces`
                                          setNumericInputDrafts((prev) => ({ ...prev, [key]: '' }))
                                        }}
                                        onChange={(e) => {
                                          const key = `ai:card:${index}:pieces`
                                          const v = e.target.value
                                          setNumericInputDrafts((prev) => ({ ...prev, [key]: v }))
                                        if (String(v).trim() !== '') {
                                          const parsed = Number(v)
                                          if (Number.isFinite(parsed)) {
                                              const newServings = parsed / piecesPerServingValue
                                              updateItemField(index, 'servings', newServings)
                                          }
                                        }
                                      }}
                                        onBlur={() => {
                                          const key = `ai:card:${index}:pieces`
                                          setNumericInputDrafts((prev) => {
                                            const next = { ...prev }
                                            delete next[key]
                                            return next
                                          })
                                        }}
                                        className="w-16 bg-transparent border-none text-center font-bold text-lg text-slate-900 outline-none focus:outline-none focus:ring-0 focus:shadow-none focus-visible:outline-none focus-visible:ring-0 appearance-none p-0"
                                        style={{ outline: 'none', boxShadow: 'none' }}
                                      />
                                      <button
                                        onClick={() => {
                                          const current = analyzedItems[index]?.servings || 1
                                          const currentPieces = pieceCount ?? current * piecesPerServingValue
                                          const newPieces = currentPieces + 1
                                          const newServings = newPieces / piecesPerServingValue
                                          updateItemField(index, 'servings', newServings)
                                        }}
                                        className="w-10 h-10 flex items-center justify-center rounded-lg bg-white shadow-sm active:scale-95 transition-transform text-emerald-600"
                                    >
                                        +
                                      </button>
                                    </div>
                                  </div>
                                )}
                                {/* Weight editor: changing weight back-calculates servings (and pieces) when possible */}
                                <div className="flex items-center justify-between gap-3 mt-2">
                                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Weight</span>
                                  <div className="flex items-center bg-slate-100 rounded-xl px-4 py-2 border border-transparent">
                                    <input
                                      type="number"
                                      inputMode="decimal"
                                      min={0}
                                      step={(item?.weightUnit === 'oz' ? 0.1 : 1) as any}
                                      data-weight-input-id={`weight-input-${index}`}
                                      value={(() => {
                                        const key = `ai:card:${index}:weightAmount`
                                        if (Object.prototype.hasOwnProperty.call(numericInputDrafts, key)) {
                                          return numericInputDrafts[key]
                                        }
                                        return Number.isFinite(Number(item?.weightAmount)) && Number(item.weightAmount) > 0
                                          ? String(Number(item.weightAmount))
                                          : ''
                                      })()}
                                      onFocus={() => {
                                        const key = `ai:card:${index}:weightAmount`
                                        setNumericInputDrafts((prev) => ({ ...prev, [key]: '' }))
                                      }}
                                      onChange={(e) => {
                                        const key = `ai:card:${index}:weightAmount`
                                        const v = e.target.value
                                        setNumericInputDrafts((prev) => ({ ...prev, [key]: v }))
                                      }}
                                      onKeyDown={(e) => {
                                        if (e.key !== 'Enter') return
                                        const key = `ai:card:${index}:weightAmount`
                                        const v = numericInputDrafts[key]
                                        if (String(v || '').trim() !== '') {
                                          updateItemField(index, 'weightAmount', v)
                                        }
                                        setNumericInputDrafts((prev) => {
                                          const next = { ...prev }
                                          delete next[key]
                                          return next
                                        })
                                        ;(e.currentTarget as HTMLInputElement).blur()
                                      }}
                                      onBlur={() => {
                                        const key = `ai:card:${index}:weightAmount`
                                        const v = numericInputDrafts[key]
                                        if (String(v || '').trim() !== '') {
                                          updateItemField(index, 'weightAmount', v)
                                        }
                                        setNumericInputDrafts((prev) => {
                                          const next = { ...prev }
                                          delete next[key]
                                          return next
                                        })
                                      }}
                                      placeholder={
                                        Object.prototype.hasOwnProperty.call(numericInputDrafts, `ai:card:${index}:weightAmount`)
                                          ? ''
                                          : baseWeightPerServing
                                          ? String(
                                              item?.weightUnit === 'oz'
                                                ? Math.round(baseWeightPerServing * servingsCount * 100) / 100
                                                : Math.round(baseWeightPerServing * servingsCount),
                                            )
                                          : 'e.g., 250'
                                      }
                                      className="w-14 bg-transparent border-none font-bold text-lg text-slate-900 text-right outline-none focus:outline-none focus:ring-0 focus:shadow-none focus-visible:outline-none focus-visible:ring-0 appearance-none p-0"
                                      style={{ outline: 'none', boxShadow: 'none' }}
                                    />
                                    <div className="w-px h-6 bg-slate-300 mx-3" />
                                    <select
                                      value={item?.weightUnit === 'ml' ? 'ml' : item?.weightUnit === 'oz' ? 'oz' : 'g'}
                                      onChange={(e) => updateItemField(index, 'weightUnit', e.target.value)}
                                      className="bg-transparent border-none text-sm font-semibold text-slate-700 cursor-pointer pr-0 appearance-none"
                                      style={{ backgroundImage: 'none', WebkitAppearance: 'none', MozAppearance: 'none', appearance: 'none' }}
                                    >
                                      <option value="g">g</option>
                                      <option value="ml">ml</option>
                                      <option value="oz">oz</option>
                                    </select>
                                  </div>
                                </div>
                                {baseWeightPerServing && (
                                  <div className="text-xs text-slate-400">
                                    Total amount ≈{' '}
                                    {(() => {
                                      const unit =
                                        item?.weightUnit === 'ml' ? 'ml' : item?.weightUnit === 'oz' ? 'oz' : 'g'
                                      const raw = baseWeightPerServing * servingsCount
                                      const amount = unit === 'oz' ? Math.round(raw * 100) / 100 : Math.round(raw)
                                      return `${amount} ${unit}`
                                    })()}
                                  </div>
                                )}
                              </div>
                            )}
                            
                            {/* Macro totals for this ingredient – updates as servings change */}
                            {isExpanded && (
                            <div className="space-y-3">
                              <div className="flex items-center justify-between gap-2">
                                <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                                  Nutritional breakdown
                                </div>
                                <div className="text-xs text-slate-400">Total for {totalsLabel}</div>
                              </div>
                              <div className="grid grid-cols-3 gap-3">
                                {ITEM_NUTRIENT_META.map((meta) => {
                                  const totalValue = totalsByField[meta.field as keyof typeof totalsByField]
                                  const displayValue =
                                    meta.key === 'calories'
                                      ? formatEnergyNumber(totalValue, energyUnit)
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
                                      className={`p-3 rounded-2xl border ${meta.bg} ${meta.border} flex flex-col items-start gap-1`}
                                    >
                                      <div className="flex items-center">
                                        <span className={`text-lg font-bold ${meta.valueClass}`}>{displayValue}</span>
                                      </div>
                                      <span className={`text-[10px] font-bold uppercase ${meta.labelClass}`}>{labelText}</span>
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                            )}
                          </div>
                        );
                      })}
                      {feedbackRescanState?.scope === 'overall' && isAnalyzing && (
                        <div className="px-4 sm:px-6 py-3">
                          <div className="w-full max-w-sm mx-auto rounded-xl bg-emerald-50 text-emerald-700 text-sm font-semibold px-4 py-2 flex items-center justify-center gap-2">
                            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                            Re-analyzing full meal…
                          </div>
                        </div>
                      )}
                      </div>
                    </div>
                  ) : (
                    <div className="mb-6 -mx-4 sm:-mx-6">
                      <div className="px-4 sm:px-6">
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
                            const normalized = sanitizeMealDescription(merged);
                            const finalText = normalized || 'Description not available yet.';

                            return finalText;
                          })()}
                        </div>
                      </div>
                    </div>
                  )}
                    </>
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

                    {/* Diet Warning */}
                    {dietWarning && (
                      <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                        <div className="flex items-start">
                          <svg className="w-5 h-5 text-amber-700 mr-2 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 2l2.2 6.6H21l-5.4 3.9L17.8 20 12 16.3 6.2 20l2.2-7.5L3 8.6h6.8L12 2z" />
                          </svg>
                          <div className="flex-1">
                            <div className="font-semibold text-amber-900 mb-1">Diet Warning</div>
                            <div className="text-sm text-amber-900 whitespace-pre-line">
                              {dietWarning
                                .replace(/^⚠️\s*diet warning[^:]*:/i, '')
                                .trim()}
                            </div>
                          </div>
                        </div>
                        {dietAlternatives && (
                          <div className="mt-3 text-sm text-amber-900 whitespace-pre-line">
                            <div className="font-semibold mb-1">Swap idea</div>
                            {dietAlternatives}
                          </div>
                        )}
                        <div className="mt-2 text-xs text-amber-800">No extra credits were used for this diet check.</div>
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
                  
                {/* Add Ingredient Modal is rendered near the top of the page so it can open from anywhere */}
                {/* Action Buttons */}
                <div className="space-y-3 px-1 pb-6">
                  <div className="mb-6 mx-auto max-w-[95%]">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Change time entry
                    </label>
                    <input
                      type="time"
                      value={entryTime}
                      onChange={(e) => setEntryTime(e.target.value)}
                      className="w-full px-3 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-base"
                    />
                  </div>
                  {manualMealBuildMode && (
                    <button
                      type="button"
                      onClick={() =>
                        openAddIngredientModalFromMenu(undefined, {
                          mode: 'analysis',
                        })
                      }
                      className="w-full py-3 px-4 mx-auto max-w-[95%] bg-white border border-emerald-300 hover:bg-emerald-50 text-emerald-800 font-medium rounded-xl transition-colors duration-200 flex items-center justify-center"
                    >
                      <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v12m6-6H6" />
                      </svg>
                      Add another ingredient
                    </button>
                  )}
	                  <button
	                    onClick={() =>
	                      editingEntry ? updateFoodEntry() : addFoodEntry(aiDescription, manualMealBuildMode ? 'text' : 'photo')
	                    }
	                    disabled={isAnalyzing || isSavingEntry || labelBlocked}
	                    className="w-full py-3 px-4 mx-auto max-w-[95%] bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-300 text-white font-medium rounded-xl transition-colors duration-200 flex items-center justify-center shadow-lg"
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
                        {editingEntry ? 'Update Entry' : manualMealBuildMode ? 'Save meal to Food Diary' : 'Save to Food Diary'}
                      </>
                    )}
                  </button>
	                  {!editingEntry && !manualMealBuildMode && (
	                    <button
	                      onClick={handleDeletePhoto}
	                      className="w-full py-3 px-4 mx-auto max-w-[95%] bg-gray-500 hover:bg-gray-600 text-white font-medium rounded-xl transition-colors duration-200 flex items-center justify-center"
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
                      className="w-full py-3 px-4 mx-auto max-w-[95%] bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-medium rounded-xl transition-colors duration-200 flex items-center justify-center"
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
              <div className="fixed inset-0 z-50 bg-white">
                <div className="h-[100dvh] flex flex-col">
                  <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-5 py-4 flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-gray-900">Adjust Food Details</h3>
                    <button
                      onClick={() => {
                        setShowItemEditModal(false);
                        setEditingItemIndex(null);
                      }}
                      className="p-2 rounded-full hover:bg-gray-100 text-gray-500"
                    >
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 pb-10">
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
                      
                      {(() => {
                        const item = analyzedItems[editingItemIndex]
                        const servingsCount = Number.isFinite(item?.servings) ? Number(item.servings) : 1
                        const baseWeightPerServing = getBaseWeightPerServing(item)
                        const unit =
                          item?.weightUnit === 'ml' ? 'ml' : item?.weightUnit === 'oz' ? 'oz' : 'g'
                        const amountKey = `ai:modal:${editingItemIndex}:weightAmount`
                        const amountValue = Object.prototype.hasOwnProperty.call(numericInputDrafts, amountKey)
                          ? numericInputDrafts[amountKey]
                          : Number.isFinite(Number(item?.weightAmount)) && Number(item.weightAmount) > 0
                          ? String(Number(item.weightAmount))
                          : ''
                        return (
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Weight
                            </label>
                            <div className="flex gap-2">
                              <input
                                type="number"
                                inputMode="decimal"
                                min={0}
                                step={(unit === 'oz' ? 0.1 : 1) as any}
                                value={amountValue}
                                onFocus={() => {
                                  setNumericInputDrafts((prev) => ({ ...prev, [amountKey]: '' }))
                                }}
                                onChange={(e) => {
                                  const v = e.target.value
                                  setNumericInputDrafts((prev) => ({ ...prev, [amountKey]: v }))
                                  if (String(v).trim() !== '') {
                                    updateItemField(editingItemIndex, 'weightAmount', v)
                                  }
                                }}
                                onBlur={() => {
                                  setNumericInputDrafts((prev) => {
                                    const next = { ...prev }
                                    delete next[amountKey]
                                    return next
                                  })
                                }}
                                placeholder={
                                  baseWeightPerServing
                                    ? String(
                                        unit === 'oz'
                                          ? Math.round(baseWeightPerServing * servingsCount * 100) / 100
                                          : Math.round(baseWeightPerServing * servingsCount),
                                      )
                                    : 'e.g., 250'
                                }
                                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                              />
                              <select
                                value={unit}
                                onChange={(e) => updateItemField(editingItemIndex, 'weightUnit', e.target.value)}
                                className="w-24 px-2 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                              >
                                <option value="g">g</option>
                                <option value="ml">ml</option>
                                <option value="oz">oz</option>
                              </select>
                            </div>
                            {baseWeightPerServing && (
                              <p className="text-xs text-gray-500 mt-1">
                                Total amount ≈{' '}
                                {(() => {
                                  const raw = baseWeightPerServing * servingsCount
                                  const amount = unit === 'oz' ? Math.round(raw * 100) / 100 : Math.round(raw)
                                  return `${amount} ${unit}`
                                })()}
                              </p>
                            )}
                            {!baseWeightPerServing && (
                              <p className="text-xs text-gray-500 mt-1">
                                This is the weight shown on the package or your estimate
                              </p>
                            )}
                          </div>
                        )
                      })()}

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Servings
                        </label>
                        <input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          step={(() => {
                            const meta = parseServingUnitMetadata(analyzedItems[editingItemIndex]?.serving_size || '')
                            if (!meta || !isDiscreteUnitLabel(meta.unitLabel)) return 0.25
                            if (isFractionalServingQuantity(meta.quantity)) return 0.25
                            if (!meta.quantity || meta.quantity <= 0) return 0.25
                            return 1 / meta.quantity
                          })()}
                          value={(() => {
                            const key = `ai:modal:${editingItemIndex}:servings`
                            return Object.prototype.hasOwnProperty.call(numericInputDrafts, key)
                              ? numericInputDrafts[key]
                              : String(analyzedItems[editingItemIndex]?.servings ?? 1)
                          })()}
                          onFocus={() => {
                            const key = `ai:modal:${editingItemIndex}:servings`
                            setNumericInputDrafts((prev) => ({ ...prev, [key]: '' }))
                          }}
                          onChange={(e) => {
                            const key = `ai:modal:${editingItemIndex}:servings`
                            const v = e.target.value
                            setNumericInputDrafts((prev) => ({ ...prev, [key]: v }))
                            if (String(v).trim() !== '') {
                              updateItemField(editingItemIndex, 'servings', v)
                            }
                          }}
                          onBlur={() => {
                            const key = `ai:modal:${editingItemIndex}:servings`
                            setNumericInputDrafts((prev) => {
                              const next = { ...prev }
                              delete next[key]
                              return next
                            })
                          }}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                          placeholder="e.g., 1"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          Adjust servings to multiply nutrients accordingly
                        </p>
                      </div>

                      <div className="pt-2 border-t border-gray-200">
                      <div className="text-sm font-medium text-gray-900">
                          Find a better match (USDA for single foods, FatSecret + OpenFoodFacts for packaged)
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          Selecting a result replaces the item name, serving size, and macros.
                        </p>
                        <div className="mt-3 flex flex-col gap-2">
                          <div className="relative">
                            <input
                              type="text"
                              value={officialSearchQuery}
                              onChange={(e) => {
                                const next = e.target.value
                                setOfficialSearchQuery(next)
                                setOfficialError(null)
                                try {
                                  if (officialSearchDebounceRef.current) clearTimeout(officialSearchDebounceRef.current)
                                } catch {}
                                officialSearchDebounceRef.current = null
                                if (next.trim().length >= 2) {
                                  officialSearchDebounceRef.current = setTimeout(() => {
                                    handleOfficialSearch(officialSource, next)
                                  }, 350)
                                }
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault()
                                  try {
                                    if (officialSearchDebounceRef.current) clearTimeout(officialSearchDebounceRef.current)
                                  } catch {}
                                  officialSearchDebounceRef.current = null
                                  handleOfficialSearch(officialSource, officialSearchQuery)
                                }
                              }}
                              placeholder="e.g., Christmas pudding"
                              className="w-full px-3 py-2 pr-12 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-base"
                            />
                            <button
                              type="button"
                              aria-label="Search"
                              disabled={officialLoading || officialSearchQuery.trim().length === 0}
                              onClick={() => handleOfficialSearch(officialSource)}
                              className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-slate-900 text-white flex items-center justify-center disabled:opacity-60"
                            >
                              {officialLoading ? (
                                <span className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              ) : (
                                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <circle cx="11" cy="11" r="7" />
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M20 20l-3.5-3.5" />
                                </svg>
                              )}
                            </button>
                          </div>

                          <div className="flex gap-2">
                            <button
                              type="button"
                              disabled={officialLoading}
                              onClick={() => {
                                setOfficialSource('packaged')
                                if (officialSearchQuery.trim().length >= 2) handleOfficialSearch('packaged', officialSearchQuery)
                              }}
                              className={`flex-1 px-3 py-2 text-xs font-medium rounded-lg border ${
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
                              onClick={() => {
                                setOfficialSource('single')
                                if (officialSearchQuery.trim().length >= 2) handleOfficialSearch('single', officialSearchQuery)
                              }}
                              className={`flex-1 px-3 py-2 text-xs font-medium rounded-lg border ${
                                officialSource === 'single'
                                  ? 'bg-slate-800 text-white border-slate-800'
                                  : 'bg-white text-gray-700 border-gray-300'
                              } disabled:opacity-60`}
                            >
                              Single food
                            </button>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <button
                              type="button"
                              disabled={replacePhotoLoading || editingItemIndex === null || editingItemIndex === undefined}
                              onClick={() => {
                                if (editingItemIndex === null || editingItemIndex === undefined) return
                                setReplacePhotoError(null)
                                photoReplaceTargetRef.current = editingItemIndex
                                replacePhotoInputRef.current?.click()
                              }}
                              className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-xs font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-60"
                            >
                              {replacePhotoLoading ? 'Analyzing…' : 'Add by photo'}
                            </button>
                            <button
                              type="button"
                              disabled={editingItemIndex === null || editingItemIndex === undefined}
                              onClick={() => {
                                if (editingItemIndex === null || editingItemIndex === undefined) return
                                barcodeReplaceTargetRef.current = editingItemIndex
                                barcodeActionRef.current = null
                                setShowBarcodeScanner(true)
                                setBarcodeError(null)
                                setBarcodeValue('')
                              }}
                              className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-xs font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-60"
                            >
                              Scan barcode
                            </button>
                            <button
                              type="button"
                              disabled={editingItemIndex === null || editingItemIndex === undefined}
                              onClick={() => {
                                if (editingItemIndex === null || editingItemIndex === undefined) return
                                favoritesReplaceTargetRef.current = editingItemIndex
                                favoritesActionRef.current = null
                                setShowFavoritesPicker(true)
                              }}
                              className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-xs font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-60"
                            >
                              Add from favorites
                            </button>
                          </div>
                        </div>
                        {replacePhotoError && <div className="mt-2 text-xs text-red-600">{replacePhotoError}</div>}
                        {officialError && <div className="mt-3 text-xs text-red-600">{officialError}</div>}
                        {officialLoading && <div className="mt-3 text-xs text-gray-500">Searching…</div>}
                        {!officialLoading && !officialError && officialResults.length > 0 && (
                          <div className="mt-3 max-h-64 overflow-y-auto space-y-2">
                            {officialResults.map((r, idx) => {
                              const display = buildOfficialSearchDisplay(r, officialSearchQuery)
                              return (
                                <div
                                  key={`${r.source}-${r.id}-${idx}`}
                                  className="flex items-start justify-between rounded-lg border border-gray-200 px-3 py-2"
                                >
                                  <div className="min-w-0">
                                    <div className="text-sm font-semibold text-gray-900 truncate">
                                      {display.title}
                                      {display.showBrandSuffix && r.brand ? ` – ${r.brand}` : ''}
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
                                      Source:{' '}
                                      {r.source === 'usda'
                                        ? 'USDA FoodData Central'
                                        : r.source === 'fatsecret'
                                        ? 'FatSecret'
                                        : r.source === 'openfoodfacts'
                                        ? 'OpenFoodFacts'
                                        : officialResultsSource || 'Unknown'}
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => replaceIngredientFromOfficial(r, editingItemIndex)}
                                    className="ml-3 px-3 py-1.5 rounded-md bg-emerald-600 text-white text-xs hover:bg-emerald-700"
                                  >
                                    Use match
                                  </button>
                                </div>
                              )
                            })}
                          </div>
                        )}
                        {!officialLoading && !officialError && officialResults.length === 0 && officialSearchQuery.trim() && (
                          <div className="mt-4 text-xs text-gray-500">
                            {(() => {
                              const last = officialLastRequest
                              const hasLast =
                                last &&
                                last.query?.trim().toLowerCase() === officialSearchQuery.trim().toLowerCase() &&
                                last.mode === officialSource
                              const hint = hasLast
                                ? `Last search: ${last.status ?? '—'} • ${last.itemCount ?? 0} results • ${last.source || '—'}`
                                : null
                              const err = hasLast && last?.errorText ? ` (${String(last.errorText).slice(0, 140)})` : ''
                              return (
                                <div className="space-y-1">
                                  <div>No results yet.</div>
                                  {hint && <div className="text-[11px] text-gray-400">{hint}{err}</div>}
                                  <div>Try a shorter name or switch between Packaged and Single food.</div>
                                </div>
                              )
                            })()}
                          </div>
                        )}
                      </div>

                      {(() => {
                        const item = analyzedItems[editingItemIndex]
                        const servingsCount = Number.isFinite(item?.servings) ? Number(item.servings) : 1
                        const macroMultiplier = macroMultiplierForItem(item) || 1
                        const totalMultiplier = Math.max(0, servingsCount * macroMultiplier)
                        const divider = totalMultiplier > 0 ? totalMultiplier : 1
                        const formatTotal = (value: any, decimals: number) => {
                          const num = Number(value)
                          if (!Number.isFinite(num)) return ''
                          const scaled = totalMultiplier > 0 ? num * totalMultiplier : 0
                          if (decimals <= 0) return String(Math.round(scaled))
                          const factor = Math.pow(10, decimals)
                          return String(Math.round(scaled * factor) / factor)
                        }
                        const computeServingsFromTotal = (value: any, perServingValue: any) => {
                          const total = Number(value)
                          const per = Number(perServingValue)
                          const multiplier = macroMultiplier > 0 ? macroMultiplier : 1
                          if (!Number.isFinite(total) || !Number.isFinite(per) || per <= 0) return null
                          const next = total / (per * multiplier)
                          return Number.isFinite(next) ? next : null
                        }
                        const updateServingsFromMacroTotal = (value: any, fieldName: string) => {
                          const perServingValue = (item as any)?.[fieldName]
                          const nextServings = computeServingsFromTotal(value, perServingValue)
                          if (nextServings !== null) {
                            updateItemField(editingItemIndex, 'servings', nextServings)
                            return
                          }
                          updateItemField(editingItemIndex, fieldName as any, value)
                        }
                        const totalLabel = `${formatServingsDisplay(servingsCount)} serving${Math.abs(servingsCount - 1) < 0.001 ? '' : 's'}`
                        return (
                          <div>
                            <div className="block text-sm font-medium text-gray-700 mb-2">
                              Totals for {totalLabel}
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-xs text-gray-600 mb-1">Calories</label>
                                <input
                                  type="number"
                                  inputMode="decimal"
                                  min={0}
                                  step={1}
                                  value={(() => {
                                    const key = `ai:modal:${editingItemIndex}:calories`
                                    return Object.prototype.hasOwnProperty.call(numericInputDrafts, key)
                                      ? numericInputDrafts[key]
                                      : formatTotal(item?.calories ?? '', 0)
                                  })()}
                                  onFocus={() => {
                                    const key = `ai:modal:${editingItemIndex}:calories`
                                    setNumericInputDrafts((prev) => ({ ...prev, [key]: '' }))
                                  }}
                                  onChange={(e) => {
                                    const key = `ai:modal:${editingItemIndex}:calories`
                                    const v = e.target.value
                                    setNumericInputDrafts((prev) => ({ ...prev, [key]: v }))
                                    if (String(v).trim() !== '') updateServingsFromMacroTotal(v, 'calories')
                                  }}
                                  onBlur={() => {
                                    const key = `ai:modal:${editingItemIndex}:calories`
                                    setNumericInputDrafts((prev) => {
                                      const next = { ...prev }
                                      delete next[key]
                                      return next
                                    })
                                  }}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                                  placeholder="kcal"
                                />
                              </div>
                          <div>
                            <label className="block text-xs text-gray-600 mb-1">Protein (g)</label>
                            <input
                              type="number"
                              inputMode="decimal"
                              min={0}
                              step={0.1}
                              value={(() => {
                                const key = `ai:modal:${editingItemIndex}:protein_g`
                                return Object.prototype.hasOwnProperty.call(numericInputDrafts, key)
                                  ? numericInputDrafts[key]
                                  : formatTotal(item?.protein_g ?? '', 1)
                              })()}
                              onFocus={() => {
                                const key = `ai:modal:${editingItemIndex}:protein_g`
                                setNumericInputDrafts((prev) => ({ ...prev, [key]: '' }))
                              }}
                                  onChange={(e) => {
                                    const key = `ai:modal:${editingItemIndex}:protein_g`
                                    const v = e.target.value
                                    setNumericInputDrafts((prev) => ({ ...prev, [key]: v }))
                                    if (String(v).trim() !== '') updateServingsFromMacroTotal(v, 'protein_g')
                                  }}
                              onBlur={() => {
                                const key = `ai:modal:${editingItemIndex}:protein_g`
                                setNumericInputDrafts((prev) => {
                                  const next = { ...prev }
                                  delete next[key]
                                  return next
                                })
                              }}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                              placeholder="g"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-600 mb-1">Carbs (g)</label>
                            <input
                              type="number"
                              inputMode="decimal"
                              min={0}
                              step={0.1}
                              value={(() => {
                                const key = `ai:modal:${editingItemIndex}:carbs_g`
                                return Object.prototype.hasOwnProperty.call(numericInputDrafts, key)
                                  ? numericInputDrafts[key]
                                  : formatTotal(item?.carbs_g ?? '', 1)
                              })()}
                              onFocus={() => {
                                const key = `ai:modal:${editingItemIndex}:carbs_g`
                                setNumericInputDrafts((prev) => ({ ...prev, [key]: '' }))
                              }}
                                  onChange={(e) => {
                                    const key = `ai:modal:${editingItemIndex}:carbs_g`
                                    const v = e.target.value
                                    setNumericInputDrafts((prev) => ({ ...prev, [key]: v }))
                                    if (String(v).trim() !== '') updateServingsFromMacroTotal(v, 'carbs_g')
                                  }}
                              onBlur={() => {
                                const key = `ai:modal:${editingItemIndex}:carbs_g`
                                setNumericInputDrafts((prev) => {
                                  const next = { ...prev }
                                  delete next[key]
                                  return next
                                })
                              }}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                              placeholder="g"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-600 mb-1">Fat (g)</label>
                            <input
                              type="number"
                              inputMode="decimal"
                              min={0}
                              step={0.1}
                              value={(() => {
                                const key = `ai:modal:${editingItemIndex}:fat_g`
                                return Object.prototype.hasOwnProperty.call(numericInputDrafts, key)
                                  ? numericInputDrafts[key]
                                  : formatTotal(item?.fat_g ?? '', 1)
                              })()}
                              onFocus={() => {
                                const key = `ai:modal:${editingItemIndex}:fat_g`
                                setNumericInputDrafts((prev) => ({ ...prev, [key]: '' }))
                              }}
                                  onChange={(e) => {
                                    const key = `ai:modal:${editingItemIndex}:fat_g`
                                    const v = e.target.value
                                    setNumericInputDrafts((prev) => ({ ...prev, [key]: v }))
                                    if (String(v).trim() !== '') updateServingsFromMacroTotal(v, 'fat_g')
                                  }}
                              onBlur={() => {
                                const key = `ai:modal:${editingItemIndex}:fat_g`
                                setNumericInputDrafts((prev) => {
                                  const next = { ...prev }
                                  delete next[key]
                                  return next
                                })
                              }}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                              placeholder="g"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-600 mb-1">Fiber (g)</label>
                            <input
                              type="number"
                              inputMode="decimal"
                              min={0}
                              step={0.1}
                              value={(() => {
                                const key = `ai:modal:${editingItemIndex}:fiber_g`
                                return Object.prototype.hasOwnProperty.call(numericInputDrafts, key)
                                  ? numericInputDrafts[key]
                                  : formatTotal(item?.fiber_g ?? '', 1)
                              })()}
                              onFocus={() => {
                                const key = `ai:modal:${editingItemIndex}:fiber_g`
                                setNumericInputDrafts((prev) => ({ ...prev, [key]: '' }))
                              }}
                                  onChange={(e) => {
                                    const key = `ai:modal:${editingItemIndex}:fiber_g`
                                    const v = e.target.value
                                    setNumericInputDrafts((prev) => ({ ...prev, [key]: v }))
                                    if (String(v).trim() !== '') updateServingsFromMacroTotal(v, 'fiber_g')
                                  }}
                              onBlur={() => {
                                const key = `ai:modal:${editingItemIndex}:fiber_g`
                                setNumericInputDrafts((prev) => {
                                  const next = { ...prev }
                                  delete next[key]
                                  return next
                                })
                              }}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                              placeholder="g"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-600 mb-1">Sugar (g)</label>
                            <input
                              type="number"
                              inputMode="decimal"
                              min={0}
                              step={0.1}
                              value={(() => {
                                const key = `ai:modal:${editingItemIndex}:sugar_g`
                                return Object.prototype.hasOwnProperty.call(numericInputDrafts, key)
                                  ? numericInputDrafts[key]
                                  : formatTotal(item?.sugar_g ?? '', 1)
                              })()}
                              onFocus={() => {
                                const key = `ai:modal:${editingItemIndex}:sugar_g`
                                setNumericInputDrafts((prev) => ({ ...prev, [key]: '' }))
                              }}
                                  onChange={(e) => {
                                    const key = `ai:modal:${editingItemIndex}:sugar_g`
                                    const v = e.target.value
                                    setNumericInputDrafts((prev) => ({ ...prev, [key]: v }))
                                    if (String(v).trim() !== '') updateServingsFromMacroTotal(v, 'sugar_g')
                                  }}
                              onBlur={() => {
                                const key = `ai:modal:${editingItemIndex}:sugar_g`
                                setNumericInputDrafts((prev) => {
                                  const next = { ...prev }
                                  delete next[key]
                                  return next
                                })
                              }}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                              placeholder="g"
                            />
                          </div>
                            </div>
                          </div>
                        )
                      })()}
                      
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

            {/* Feedback Modal */}
            {feedbackPrompt && (
              <div className="fixed inset-0 z-50 bg-black bg-opacity-50 overflow-y-auto">
                <div className="min-h-[100dvh] flex items-start justify-center p-4 sm:items-center">
                  <div className="bg-white rounded-2xl shadow-xl max-w-md w-full max-h-[85dvh] overflow-hidden flex flex-col">
                  <div className="p-5 border-b border-gray-100 flex items-start justify-between">
                    <div>
                      <div className="text-lg font-semibold text-gray-900">What was the problem?</div>
                      {feedbackPrompt.scope === 'item' && analyzedItems[feedbackPrompt.itemIndex ?? -1] && (
                        <div className="text-xs text-gray-500 mt-1">
                          {String(analyzedItems[feedbackPrompt.itemIndex ?? -1]?.name || 'This item')}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => {
                        if (isFeedbackModalLocked) return
                        blurActiveElement()
                        setFeedbackPrompt(null)
                        setFeedbackReasons([])
                        setFeedbackComment('')
                        setFeedbackError(null)
                      }}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                    <div className="p-5 space-y-4 overflow-y-auto overscroll-contain min-h-0">
                    <div className="space-y-2">
                      {FEEDBACK_REASONS.map((reason) => (
                        <label key={reason} className="flex items-center gap-2 text-sm text-gray-700">
                          <input
                            type="checkbox"
                            className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                            checked={feedbackReasons.includes(reason)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setFeedbackReasons((prev) => [...prev, reason])
                              } else {
                                setFeedbackReasons((prev) => prev.filter((r) => r !== reason))
                              }
                            }}
                          />
                          <span>{reason}</span>
                        </label>
                      ))}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Optional details
                      </label>
                      <textarea
                        value={feedbackComment}
                        onChange={(e) => setFeedbackComment(e.target.value)}
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-base focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                        placeholder="Tell us what went wrong (optional)"
                      />
                    </div>
                    {feedbackError && <div className="text-xs text-red-600">{feedbackError}</div>}
                    <div className="flex items-center justify-end gap-2 pt-2">
                      <button
                        onClick={() => {
                          if (isFeedbackModalLocked) return
                          blurActiveElement()
                          setFeedbackPrompt(null)
                          setFeedbackReasons([])
                          setFeedbackComment('')
                          setFeedbackError(null)
                        }}
                        className="px-4 py-2 rounded-lg border border-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={async () => {
                          if (feedbackSubmitting || isFeedbackRescanning) return
                          if (feedbackReasons.length === 0) {
                            setFeedbackError('Please select at least one reason.')
                            return
                          }
                          const reasonsSnapshot = [...feedbackReasons]
                          const commentSnapshot = feedbackComment.trim()
                          const scope = feedbackPrompt.scope
                          const itemIndex = feedbackPrompt.itemIndex ?? null
                          setFeedbackSubmitting(true)
                          await submitFoodAnalysisFeedback({
                            scope: feedbackPrompt.scope,
                            rating: 'down',
                            itemIndex: feedbackPrompt.itemIndex ?? null,
                            reasons: feedbackReasons,
                            comment: feedbackComment,
                          })
                          if (scope === 'overall') {
                            setAnalysisFeedbackOverall('down')
                          } else if (itemIndex !== null && itemIndex !== undefined) {
                            setAnalysisFeedbackItems((prev) => ({ ...prev, [itemIndex as number]: 'down' }))
                          }
                          setFeedbackSubmitting(false)
                          showQuickToast('Thanks for the feedback!')
                          if (scope === 'overall') {
                            blurActiveElement()
                            setFeedbackPrompt(null)
                            setFeedbackReasons([])
                            setFeedbackComment('')
                            setFeedbackError(null)
                            await triggerOverallFeedbackRescan(reasonsSnapshot, commentSnapshot)
                          } else if (scope === 'item') {
                            if (itemIndex === null || itemIndex === undefined) return
                            const success = await triggerItemFeedbackRescan(itemIndex, reasonsSnapshot, commentSnapshot)
                            if (success) {
                              blurActiveElement()
                              setFeedbackPrompt(null)
                              setFeedbackReasons([])
                              setFeedbackComment('')
                              setFeedbackError(null)
                            } else {
                              setFeedbackError('Could not re-analyze that item. Please try again.')
                            }
                          }
                        }}
                        className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-60"
                        disabled={feedbackSubmitting || isFeedbackRescanning}
                      >
                        {feedbackSubmitting ? 'Sending…' : isFeedbackRescanning ? 'Re-analyzing…' : 'Submit'}
                      </button>
                    </div>
                  </div>
                  </div>
                </div>
              </div>
            )}

            {/* Manual Food Entry - Improved Structure */}
            {showManualEntry && !photoPreview && !editingEntry && (
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
                  </>
                )}

                {/* Multiple Ingredients Entry */}
                {/* PROTECTED: INGREDIENTS_CARD START */}

                {manualFoodType === 'multiple' && (
                  <div className="mb-6 max-h-[60vh] overflow-y-auto overscroll-contain pr-1">
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
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
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
                  </div>
                )}
                {/* PROTECTED: INGREDIENTS_CARD END */}

                {/* Action Buttons */}
                <div className="flex gap-3">
                  <button
                    onClick={analyzeManualFood}
                    disabled={
                      (manualFoodType === 'single' && !manualFoodName.trim()) ||
                      (manualFoodType === 'multiple' && manualIngredients.every((ing) => !ing.name.trim())) ||
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

        {!isAnalysisRoute && (
          <>
            {/* Loading State - Prevent Empty Flash */}
            {!diaryHydrated ? (
              <div className="bg-white rounded-lg shadow-sm p-12 flex flex-col items-center justify-center">
                <div className="w-10 h-10 border-4 border-emerald-100 border-t-emerald-500 rounded-full animate-spin mb-4"></div>
                <div className="text-gray-500 font-medium">Loading your food diary...</div>
              </div>
            ) : (
            <div className="overflow-visible space-y-6">
	          {/* Daily Totals Row - only show on main diary view, not while editing an entry */}
	          {!editingEntry && (
	            <div className="mb-4">
	              {(() => {
	                const historyFiltered = isViewingToday
                    ? []
                    : filterEntriesForDate(historyFoods, selectedDate)
                  const snapshotEntries =
                    !isViewingToday && persistentDiarySnapshot?.byDate?.[selectedDate]?.entries
                      ? persistentDiarySnapshot.byDate[selectedDate]?.entries
                      : []
                  const baseEntries = isViewingToday
                    ? todaysFoodsForSelectedDate
                    : historyFiltered.length > 0
                    ? historyFiltered
                    : snapshotEntries || []
                  const source = dedupeEntries(baseEntries, { fallbackDate: selectedDate })

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
                const baseTargetCalories = dailyTargets.calories
                const exerciseKcal =
                  Number.isFinite(Number(exerciseCaloriesKcal)) && Number(exerciseCaloriesKcal) > 0
                    ? Number(exerciseCaloriesKcal)
                    : 0
                const allowanceCalories = baseTargetCalories && baseTargetCalories > 0 ? baseTargetCalories : null
                const allowanceWithExercise =
                  allowanceCalories !== null ? allowanceCalories + exerciseKcal : null

                const consumedInUnit = convertKcalToUnit(consumedKcal, energyUnit)
                const allowanceInUnit = convertKcalToUnit(allowanceWithExercise, energyUnit)
                const baseAllowanceInUnit = convertKcalToUnit(allowanceCalories, energyUnit)
                const remainingInUnit =
                  allowanceInUnit !== null && consumedInUnit !== null
                    ? Math.max(0, allowanceInUnit - consumedInUnit)
                    : null

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

                // If exercise increases calorie "room", also increase macro targets using the user's existing macro split.
                // Fiber and sugar max remain unchanged.
                const macroTargetsWithExercise = (() => {
                  const protein = Number(macroTargets.protein)
                  const carbs = Number(macroTargets.carbs)
                  const fat = Number(macroTargets.fat)
                  if (!Number.isFinite(protein) || !Number.isFinite(carbs) || !Number.isFinite(fat)) return macroTargets
                  if (protein <= 0 || carbs <= 0 || fat <= 0) return macroTargets
                  if (!Number.isFinite(exerciseKcal) || exerciseKcal <= 0) return macroTargets

                  const proteinCals = protein * 4
                  const carbCals = carbs * 4
                  const fatCals = fat * 9
                  const totalMacroCals = proteinCals + carbCals + fatCals
                  if (!Number.isFinite(totalMacroCals) || totalMacroCals <= 0) return macroTargets

                  const pShare = proteinCals / totalMacroCals
                  const cShare = carbCals / totalMacroCals
                  const fShare = fatCals / totalMacroCals

                  const extraProteinG = (exerciseKcal * pShare) / 4
                  const extraCarbsG = (exerciseKcal * cShare) / 4
                  const extraFatG = (exerciseKcal * fShare) / 9

                  return {
                    ...macroTargets,
                    protein: protein + extraProteinG,
                    carbs: carbs + extraCarbsG,
                    fat: fat + extraFatG,
                  }
                })()

                const macroViewOptions: Array<'targets' | 'consumed'> = ['targets', 'consumed']

                const macroRows = [
                  { key: 'protein', label: 'Protein', consumed: totals.protein || 0, target: macroTargetsWithExercise.protein || 0, unit: 'g', color: '#ef4444' },
                  { key: 'carbs', label: 'Carbs', consumed: carbGrams, target: macroTargetsWithExercise.carbs || 0, unit: 'g', color: '#22c55e' },
                  { key: 'fat', label: 'Fat', consumed: totals.fat || 0, target: macroTargetsWithExercise.fat || 0, unit: 'g', color: '#6366f1' },
                  { key: 'fibre', label: 'Fibre', consumed: fibreGrams, target: macroTargetsWithExercise.fiber || 0, unit: 'g', color: '#12adc9' },
                  { key: 'sugar', label: 'Sugar (max)', consumed: sugarGrams, target: macroTargetsWithExercise.sugar || 0, unit: 'g', color: '#f97316' },
                ].filter((row) => row.target > 0)

                return (
                  <div className="space-y-4">
                    {/* Daily rings header */}
                    <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4 mb-2" key={selectedDate}>
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
                      {source.length === 0 && (
                        <p className="text-xs text-gray-500 mb-3">
                          No meals yet today. Here are your daily targets to start the day.
                        </p>
                      )}
                      {(() => {
                          const slides: JSX.Element[] = []

                          // Slide 1: Separate used vs remaining rings
                          slides.push(
                            <div className="flex flex-col items-center order-1 md:order-2 w-full">
                              <div className="grid grid-cols-2 gap-4 sm:gap-6 w-full items-stretch">
                                <TargetRing
                                  key={`remaining-${selectedDate}-${summaryRenderNonce}`}
                                  label="Remaining"
                                  valueLabel={
                                    remainingInUnit !== null
                                      ? `${Math.round(remainingInUnit)} ${energyUnit}`
                                      : '—'
                                  }
                                  percent={1}
                                  tone="primary"
                                  color="#22c55e"
                                />
                                <TargetRing
                                  key={`used-${selectedDate}-${summaryRenderNonce}`}
                                  label="Used"
                                  valueLabel={
                                    consumedInUnit !== null
                                      ? `${Math.max(0, Math.round(consumedInUnit))} ${energyUnit}`
                                      : '—'
                                  }
                                  percent={1}
                                  tone="primary"
                                  color="#ef4444"
                                />
                              </div>
                              {baseAllowanceInUnit !== null && (
                                <div className="mt-3 text-[11px] text-gray-500 text-center col-span-2">
                                  Daily allowance:{' '}
                                  <span className="font-semibold">
                                    {Math.round(baseAllowanceInUnit)} {energyUnit}
                                  </span>
                                </div>
                              )}
                            </div>
                          )

                          // Slide 2: macro bars
                          if (macroRows.length > 0) {
                            slides.push(
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
                            )
                          }

                          const handleSummaryScroll = () => {
                            if (!isMobile || !summaryCarouselRef.current || slides.length <= 1) return
                            const { scrollLeft, clientWidth } = summaryCarouselRef.current
                            if (!clientWidth) return
                            const idx = Math.round(scrollLeft / clientWidth)
                            const clamped = Math.max(0, Math.min(slides.length - 1, idx))
                            setSummarySlideIndex(clamped)
                          }

                          return (
                            <>
                              <div
                                ref={summaryCarouselRef}
                                onScroll={handleSummaryScroll}
                                className="flex gap-4 overflow-x-auto snap-x snap-mandatory pb-3 scrollbar-hide md:grid md:grid-cols-[minmax(0,1fr)_300px] md:items-start md:gap-4 md:overflow-visible md:snap-none md:pb-0"
                              >
                                {slides.map((slide, idx) => (
                                  <div
                                    key={idx}
                                    className="flex-shrink-0 w-full snap-center md:w-auto"
                                  >
                                    {slide}
                                  </div>
                                ))}
                              </div>
                              {isMobile && slides.length > 1 && (
                                <div className="flex justify-center gap-2 -mt-1">
                                  {slides.map((_, idx) => (
                                    <span
                                      key={idx}
                                      className={`w-2 h-2 rounded-full ${summarySlideIndex === idx ? 'bg-emerald-500' : 'bg-gray-300'}`}
                                    />
                                  ))}
                                </div>
                              )}
                            </>
                          )
                        })()}
                    </div>
                  </div>
                )
              })()}
            </div>
          )}

	          {/* Hide energy summary + meals while editing an entry to keep the user focused on editing */}
		          {!editingEntry && (
		            <>
		              <div className="flex items-center justify-between mb-4">
		                <h3 className="text-lg font-semibold">{isViewingToday ? "Today's Meals" : 'Meals'}</h3>
		              </div>

		              <div className="bg-white border border-gray-200 rounded-3xl shadow-sm overflow-hidden mb-4">
		                <div className="px-4 py-4 flex items-start justify-between gap-3">
		                  <div className="flex items-start gap-3 min-w-0">
		                    <div className="w-11 h-11 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 flex-shrink-0">
		                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
		                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
		                      </svg>
		                    </div>
		                    <div className="min-w-0">
		                      <div className="text-sm font-semibold text-gray-900">Exercise</div>
		                      <div className="text-xs text-gray-500 mt-0.5">
		                        Burned:{' '}
		                        <span className="font-semibold text-emerald-600">
		                          +{Math.round(convertKcalToUnit(exerciseCaloriesKcal, energyUnit) || 0)} {energyUnit}
		                        </span>
		                      </div>
		                    </div>
		                  </div>
		                  <div className="flex items-center gap-2 flex-wrap justify-end">
		                    {fitbitConnected && (
		                      <span className="text-[11px] sm:text-xs bg-gray-100 rounded-full px-2 py-1 border border-gray-200">
		                        Fitbit
		                      </span>
		                    )}
		                    {garminConnected && (
		                      <span className="text-[11px] sm:text-xs bg-gray-100 rounded-full px-2 py-1 border border-gray-200">
		                        Garmin Connect
		                      </span>
		                    )}
		                    {!fitbitConnected && !garminConnected && (
		                      <button
		                        type="button"
		                        onClick={goToDevices}
		                        className="px-3 py-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-xs font-semibold text-gray-700"
		                      >
		                        Connect device
		                      </button>
		                    )}
                    {(fitbitConnected || garminConnected) && (
                      <button
                        type="button"
                        onClick={() => syncExerciseFromDevices()}
                        disabled={exerciseSyncing}
                        className="p-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-60"
                        title="Refresh from device"
                        aria-label="Refresh from device"
                      >
                        <svg className="w-4 h-4 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M4.5 12a7.5 7.5 0 0 1 13.5-4.5m0 0V4.5m0 3h-3M19.5 12a7.5 7.5 0 0 1-13.5 4.5m0 0v3m0-3h3"
                          />
                        </svg>
                      </button>
                    )}
                    {exerciseEntries.length > 0 && (
                      <button
                        type="button"
                        onClick={openCreateExercise}
                        className="p-2 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                        title="Add exercise"
                        aria-label="Add exercise"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                      </button>
                    )}
		                  </div>
		                </div>

		                <div className="border-t border-gray-100">
		                  {exerciseError && (
		                    <div className="px-4 py-3 text-sm text-red-600">{exerciseError}</div>
		                  )}
		                  {exerciseLoading ? (
		                    <div className="px-4 py-3 text-sm text-gray-500">Loading…</div>
		                  ) : (
		                    <div className="divide-y divide-gray-100">
                      {exerciseEntries.length === 0 ? (
                        <div className="px-4 py-3 text-sm text-gray-500 flex items-center justify-between gap-3">
                          <span>No exercise logged for this date.</span>
                          <button
                            type="button"
                            onClick={openCreateExercise}
                            className="p-2 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                            title="Add exercise"
                            aria-label="Add exercise"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                            </svg>
                          </button>
                        </div>
                      ) : (
		                        exerciseEntries.map((entry: any) => {
		                          const calories = convertKcalToUnit(Number(entry?.calories) || 0, energyUnit)
		                          const duration = Number(entry?.durationMinutes) || 0
		                          const isManual = String(entry?.source || '').toUpperCase() === 'MANUAL'
		                          const distanceKm =
		                            typeof entry?.distanceKm === 'number' && Number.isFinite(entry.distanceKm) && entry.distanceKm > 0
		                              ? Number(entry.distanceKm)
		                              : null
		                          const sourceLabel =
		                            entry?.source === 'FITBIT' ? 'Fitbit' : entry?.source === 'GARMIN' ? 'Garmin Connect' : 'Manual'
		                          const title = (() => {
		                            const typeName = String(entry?.exerciseType?.name || '').trim()
		                            const label = String(entry?.label || '').trim()
		                            if (distanceKm) {
		                              if (typeName) return typeName.split(',')[0].trim() || typeName
		                              return (label || 'Exercise').replace(/\s*\([^)]*km\/h[^)]*\)\s*$/i, '').trim() || 'Exercise'
		                            }
		                            return label || typeName || 'Exercise'
		                          })()
		                          const subtitleParts: string[] = []
		                          if (distanceKm) subtitleParts.push(`${formatDistanceForInput(distanceKm)} km`)
		                          subtitleParts.push(`${Math.round(duration)} min`)
		                          subtitleParts.push(sourceLabel)
		                          return (
		                            <div
		                              key={entry.id}
		                              className={`px-4 py-3 flex items-center justify-between gap-3 ${isManual ? 'cursor-pointer hover:bg-gray-50' : ''}`}
		                              role={isManual ? 'button' : undefined}
		                              tabIndex={isManual ? 0 : undefined}
		                              onClick={isManual ? () => openEditExercise(entry) : undefined}
		                              onKeyDown={
		                                isManual
		                                  ? (e) => {
		                                      if (e.key === 'Enter' || e.key === ' ') {
		                                        e.preventDefault()
		                                        openEditExercise(entry)
		                                      }
		                                    }
		                                  : undefined
		                              }
		                            >
		                              <div className="min-w-0">
		                                <div className="text-sm font-semibold text-gray-900 truncate">
		                                  {title}
		                                </div>
		                                <div className="text-xs text-gray-500">
		                                  {subtitleParts.join(' • ')}
		                                </div>
		                              </div>
		                              <div className="flex items-center gap-2">
		                                <div className="text-sm font-semibold text-gray-900">
		                                  {Math.round(calories || 0)} {energyUnit}
		                                </div>
		                                {isManual && (
		                                  <button
		                                    type="button"
		                                    onClick={(e) => {
		                                      e.stopPropagation()
		                                      deleteExerciseEntry(entry.id)
		                                    }}
		                                    className="p-2 rounded-xl hover:bg-gray-100 text-gray-500"
		                                    title="Delete"
		                                    aria-label="Delete exercise"
		                                  >
		                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
		                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22m-5-3H6a1 1 0 00-1 1v2h14V5a1 1 0 00-1-1z" />
		                                    </svg>
		                                  </button>
		                                )}
		                              </div>
		                            </div>
		                          )
		                        })
		                      )}
		                    </div>
		                  )}
		                </div>
		              </div>

	              <div
	                className="space-y-3 -mx-4 sm:-mx-6 overflow-visible"
	                style={isMobile ? { marginLeft: 'calc(50% - 50vw)', marginRight: 'calc(50% - 50vw)' } : undefined}
	              >
                {sourceEntries.length === 0 && waterEntries.length === 0 && !waterLoading && (
                  <div className="text-sm text-gray-500 px-4 sm:px-6 pb-2">
                    No food entries yet {isViewingToday ? 'today' : 'for this date'}. Add a meal to get started.
                  </div>
                )}
                  {(() => {
                    const mealCategories = MEAL_CATEGORY_ORDER.map((key) => ({
                      key,
                      label: categoryLabel(key),
                    }))

                    const renderEntryCard = (food: any) => {
                      const entryKey = food.id.toString()
                      const entryRenderKey = entryIdentityKey(food) || entryKey
                      const swipeOffset = entrySwipeOffsets[entryKey] || 0
                      const isMenuOpen = swipeMenuEntry === entryKey
                      const isWaterEntry = Boolean(food?.__water)
                      const drinkMeta = !isWaterEntry ? getDrinkMetaFromEntry(food) : null
                      const isDrinkEntry = !isWaterEntry && Boolean(drinkMeta?.type)
                      const entryTotals = isWaterEntry ? null : getEntryTotals(food)
                      const entryCalories = !isWaterEntry && Number.isFinite(Number(entryTotals?.calories)) ? Math.round(Number(entryTotals?.calories)) : null
                      const waterLabel = isWaterEntry ? String(food?.label || 'Water') : null
                      const waterIconSrc = isWaterEntry ? getWaterIconSrc(waterLabel) : null
                      const drinkIconSrc = isDrinkEntry ? getWaterIconSrc(drinkMeta?.type) : null
                      const drinkAmountLabel = isDrinkEntry ? formatDrinkEntryAmount(drinkMeta) : ''

                      const closeSwipeMenus = () => {
                        setSwipeMenuEntry(null)
                        setEntrySwipeOffsets((prev) => ({ ...prev, [entryKey]: 0 }))
                      }

                      const handleDeleteAction = () => {
                        closeSwipeMenus()
                        setShowEntryOptions(null)
                        if (isWaterEntry) {
                          deleteWaterEntry(food)
                          return
                        }
                        if (drinkMeta?.waterLogId) {
                          deleteWaterEntry({ id: drinkMeta.waterLogId })
                        }
                        if (isViewingToday) {
                          deleteFood(food)
                        } else if ((food as any)?.dbId) {
                          deleteHistoryFood((food as any).dbId)
                        } else {
                          deleteFood(food)
                        }
                      }

                      const startEditEntry = () => {
                        if (isWaterEntry) return
                        const runEdit = () => editFood(food)
                        if (isAddMenuOpen) {
                          closeAddMenus()
                          if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
                            window.requestAnimationFrame(runEdit)
                          } else {
                            setTimeout(runEdit, 0)
                          }
                          return
                        }
                        runEdit()
                      }

                      const actions = isWaterEntry
                        ? [
                            {
                              label: 'Delete',
                              onClick: handleDeleteAction,
                              destructive: true,
                            },
                          ]
                        : [
                            ...(isEntryAlreadyFavorite(food)
                              ? []
                              : [{ label: 'Add to Favorites', onClick: () => handleAddToFavorites(food) }]),
                            {
                              label: 'Duplicate Meal',
                              onClick: () =>
                                setDuplicateModalContext({
                                  entry: food,
                                  targetDate: selectedDate,
                                  mode: 'duplicate',
                                }),
                            },
                            {
                              label: 'Copy to Today',
                              onClick: () =>
                                setDuplicateModalContext({
                                  entry: food,
                                  targetDate: todayIso,
                                  mode: 'copyToToday',
                                }),
                            },
                            { label: 'Edit Entry', onClick: startEditEntry },
                            {
                              label: 'Delete',
                              onClick: handleDeleteAction,
                              destructive: true,
                            },
                          ]

                      const actionIcons: Record<string, JSX.Element> = {
                        'Add to Favorites': (
                          <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v12m6-6H6" />
                          </svg>
                        ),
                        'Duplicate Meal': (
                          <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5h10a2 2 0 012 2v10a2 2 0 01-2 2H9a2 2 0 01-2-2V7a2 2 0 012-2z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 9H5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-2" />
                          </svg>
                        ),
                        'Copy to Today': (
                          <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-3-3v6" />
                            <rect x="5" y="5" width="14" height="14" rx="2" ry="2" />
                          </svg>
                        ),
                        'Edit Entry': (
                          <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 20h9" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4L16.5 3.5z" />
                          </svg>
                        ),
                        Delete: (
                          <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        ),
                      }

                      const handleOptionsToggle = (e?: React.MouseEvent<HTMLButtonElement>) => {
                        if (e) {
                          e.preventDefault()
                          e.stopPropagation()
                        }
                        const willOpen = showEntryOptions !== entryKey
                        if (willOpen && e && typeof window !== 'undefined') {
                          const rect = e.currentTarget.getBoundingClientRect()
                          const viewportHeight = window.innerHeight || 0
                          const viewportWidth = window.innerWidth || 0
                          const spaceBelow = viewportHeight - rect.bottom
                          const spaceAbove = rect.top
                          const estimatedHeight = actions.length * 52
                          const openUp = spaceBelow < estimatedHeight && spaceAbove > spaceBelow
                          const availableSpace = openUp ? spaceAbove - 12 : spaceBelow - 12
                          const maxHeight = Math.max(160, Math.min(availableSpace, 420))

                          setEntryMenuPositions((prev) => ({
                            ...prev,
                            [entryKey]: {
                              top: openUp ? undefined : rect.bottom + 8,
                              bottom: openUp ? viewportHeight - rect.top + 8 : undefined,
                              right: Math.max(12, viewportWidth - rect.right),
                              maxHeight: Number.isFinite(maxHeight) ? maxHeight : 320,
                            },
                          }))
                        }
                        setShowEntryOptions(willOpen ? entryKey : null)
                        closeSwipeMenus()
                      }

                      const handleTouchStart = (e: React.TouchEvent) => {
                        if (!isMobile || e.touches.length === 0) return
                        const touch = e.touches[0]
                        swipeMetaRef.current[entryKey] = {
                          startX: touch.clientX,
                          startY: touch.clientY,
                          swiping: false,
                          hasMoved: false,
                        }
                        swipeClickBlockRef.current[entryKey] = false
                      }

                      const handleTouchMove = (e: React.TouchEvent) => {
                        if (!isMobile || e.touches.length === 0) return
                        const meta = swipeMetaRef.current[entryKey]
                        if (!meta) return
                        const touch = e.touches[0]
                        const dx = touch.clientX - meta.startX
                        const dy = touch.clientY - meta.startY
                        if (!meta.swiping) {
                          if (Math.abs(dx) < 6 || Math.abs(dx) < Math.abs(dy)) return
                          meta.swiping = true
                        }
                        meta.hasMoved = true
                        const clamped = Math.max(-SWIPE_DELETE_WIDTH, Math.min(SWIPE_MENU_WIDTH, dx))
                        setEntrySwipeOffsets((prev) => ({ ...prev, [entryKey]: clamped }))
                      }

                      const handleTouchEnd = () => {
                        if (!isMobile) return
                        const meta = swipeMetaRef.current[entryKey]
                        const offset = entrySwipeOffsets[entryKey] || 0
                        if (meta?.hasMoved) {
                          swipeClickBlockRef.current[entryKey] = true
                          setTimeout(() => {
                            swipeClickBlockRef.current[entryKey] = false
                          }, 160)
                        }
                        delete swipeMetaRef.current[entryKey]

                        if (offset > 70) {
                          setEntrySwipeOffsets((prev) => ({ ...prev, [entryKey]: SWIPE_MENU_WIDTH }))
                          return
                        }
                        if (offset < -70) {
                          setSwipeMenuEntry((prev) => (prev === entryKey ? null : prev))
                          setEntrySwipeOffsets((prev) => ({ ...prev, [entryKey]: -SWIPE_DELETE_WIDTH }))
                          return
                        }
                        setSwipeMenuEntry((prev) => (prev === entryKey ? null : prev))
                        setEntrySwipeOffsets((prev) => ({ ...prev, [entryKey]: 0 }))
                      }

                      const handleRowPress = () => {
                        if (isAddMenuOpen) return
                        if (isMobile && swipeClickBlockRef.current[entryKey]) return
                        closeSwipeMenus()
                        setShowEntryOptions(null)
                        if (isWaterEntry) {
                          const qs = new URLSearchParams()
                          qs.set('date', food?.localDate || selectedDate)
                          if (food?.category) qs.set('category', food.category)
                          router.push(`/food/water?${qs.toString()}`)
                          return
                        }
                        setEnergyUnit('kcal')
                        editFood(food)
                      }

                      const openSwipeMenu = (e?: React.SyntheticEvent) => {
                        if (e) {
                          e.preventDefault()
                          e.stopPropagation()
                        }
                        setSwipeMenuEntry((prevOpen) => {
                          const closingCurrent = prevOpen === entryKey
                          const nextEntry = closingCurrent ? null : entryKey
                          setEntrySwipeOffsets((prev) => {
                            const nextOffsets = { ...prev }
                            if (prevOpen && prevOpen !== entryKey) nextOffsets[prevOpen] = 0
                            nextOffsets[entryKey] = nextEntry ? SWIPE_MENU_WIDTH : 0
                            return nextOffsets
                          })
                          return nextEntry
                        })
                      }

                      const isDesktopMenuOpen = !isMobile && showEntryOptions === entryKey
                      const entryMenuPosition = entryMenuPositions[entryKey]
                      const entryCardClass = isMobile
                        ? 'relative bg-white border border-gray-200 rounded-none shadow-sm transition-transform duration-150 ease-out z-10 w-full overflow-visible'
                        : `relative bg-white border border-gray-200 rounded-none shadow-none transition-transform duration-150 ease-out w-full overflow-visible ${isDesktopMenuOpen ? 'z-30' : 'z-10'}`

                      return (
                        <div
                          key={entryRenderKey}
                          data-food-entry-key={entryKey}
                          data-food-entry-db-id={(food as any)?.dbId || (typeof (food as any)?.id === 'string' ? (food as any).id : '')}
                          className="relative w-full overflow-visible"
                        >
                          {isMobile && (
                            <div className="absolute inset-0 flex items-stretch pointer-events-none">
                              <div className="flex items-center">
                                <button
                                  type="button"
                                  onClick={openSwipeMenu}
                                  // Guard rail: keep z-index bump so second tap closes the sheet; do not remove or the tap will be blocked by the open menu.
                                  className={`pointer-events-auto h-full min-w-[88px] px-3 bg-[#4DAF50] text-white flex items-center justify-center ${isMenuOpen ? 'relative z-[10001]' : ''}`}
                                  aria-label="Open meal actions"
                                >
                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                                  </svg>
                                </button>
                              </div>
                              <div className={`flex-1 ${swipeOffset < 0 ? 'bg-red-500' : 'bg-[#4DAF50]'}`} />
                              <div className="flex items-center">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault()
                                    e.stopPropagation()
                                    handleDeleteAction()
                                  }}
                                  className="pointer-events-auto h-full min-w-[88px] px-3 bg-red-500 text-white flex items-center justify-center"
                                  aria-label="Delete entry"
                                >
                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                              </div>
                            </div>
                          )}
                          <div
                            className={entryCardClass}
                            style={
                              isMobile
                                ? { transform: `translateX(${swipeOffset}px)`, touchAction: 'pan-y' }
                                : { borderRadius: 0 }
                            }
                            onTouchStart={handleTouchStart}
                            onTouchMove={handleTouchMove}
                            onTouchEnd={handleTouchEnd}
                            onTouchCancel={handleTouchEnd}
                            >
                            <div
                              className="p-4 hover:bg-gray-50 transition-colors overflow-visible"
                              onClick={isMobile ? handleRowPress : undefined}
                            >
                              <div className="flex items-center gap-3">
                                <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center">
                                  <Image
                                    src={
                                      isWaterEntry
                                        ? (waterIconSrc || "/mobile-assets/MOBILE ICONS/WATER.png")
                                        : isDrinkEntry
                                        ? (drinkIconSrc || "/mobile-assets/MOBILE ICONS/WATER.png")
                                        : "/mobile-assets/MOBILE%20ICONS/FOOD%20ICON.png"
                                    }
                                    alt={isWaterEntry ? `${waterLabel || 'Water'} log` : isDrinkEntry ? `${drinkMeta?.type || 'Drink'} log` : "Food item"}
                                    width={32}
                                    height={32}
                                    className="w-8 h-8"
                                    priority={false}
                                  />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm sm:text-base text-gray-900 truncate">
                                    {isWaterEntry
                                      ? waterLabel || 'Water'
                                      : sanitizeMealDescription(food.description.split('\n')[0].split('Calories:')[0])}
                                  </p>
                                  {(() => {
                                    const amountLabel = isWaterEntry
                                      ? formatWaterEntryAmount(food)
                                      : isDrinkEntry
                                      ? drinkAmountLabel
                                      : ''
                                    if (!amountLabel) return null
                                    return <p className="text-xs text-gray-500 truncate">{amountLabel}</p>
                                  })()}
                                </div>
                                <div className="flex flex-col items-end gap-1 flex-shrink-0 text-xs sm:text-sm text-gray-600">
                                  {entryCalories !== null && <span className="font-semibold text-gray-900">{entryCalories} kcal</span>}
                                  <span className="text-gray-500">
                                    {formatTimeWithAMPM(food.time)}
                                    {(food as any)?.__pendingSave ? ' • Saving...' : ''}
                                  </span>
                                </div>
                                {!isMobile && (
                                  <div className="relative entry-options-dropdown overflow-visible">
                                    <button
                                      onMouseDown={handleOptionsToggle}
                                      className="p-1.5 sm:p-2 rounded-lg hover:bg-gray-200 transition-colors"
                                    >
                                      <svg className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
                                      </svg>
                                    </button>
                                    {showEntryOptions === food.id.toString() && (
                                      <>
                                        {/* Guard rail: desktop dropdown must stay fixed/edge-aware with scrollable overflow; do not revert to clipped absolute menus. */}
                                        <div
                                          className="fixed entry-options-dropdown w-56 bg-white rounded-lg shadow-xl border border-gray-200 z-[9999] overflow-y-auto"
                                          style={{
                                            top: entryMenuPosition?.top,
                                            bottom: entryMenuPosition?.bottom,
                                            right: entryMenuPosition?.right ?? 16,
                                            maxHeight: entryMenuPosition?.maxHeight ?? 360,
                                            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                                            overscrollBehavior: 'contain',
                                          }}
                                        >
                                          {actions.map((item, idx) => (
                                            <button
                                              key={item.label}
                                              onClick={() => {
                                                item.onClick()
                                                setShowEntryOptions(null)
                                              }}
                                              className={`w-full px-4 py-3 text-left text-sm flex items-center justify-between ${item.destructive ? 'text-red-600 hover:bg-red-50 border-t border-gray-100' : 'text-gray-800 hover:bg-gray-50'} ${idx === 0 ? '' : !item.destructive ? 'border-t border-gray-100' : ''}`}
                                            >
                                              <span>{item.label}</span>
                                              {item.destructive && (
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                </svg>
                                              )}
                                            </button>
                                          ))}
                                        </div>
                                      </>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                          {isMobile && isMenuOpen && (
                            <>
                              <div className="fixed inset-0 z-30" onClick={closeSwipeMenus} />
                              <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+72px)] z-40 flex justify-end">
                                <div
                                  className="relative w-full px-4"
                                  style={{
                                    marginLeft: '96px',
                                    width: 'calc(100% - 96px)',
                                    maxWidth: 'calc(100% - 96px)',
                                  }}
                                >
                                  <div
                                    className="relative z-10 rounded-3xl bg-[#f6f7f9] border border-gray-200 shadow-2xl overflow-hidden w-full max-h-[65vh] overflow-y-auto"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {actions.map((item, idx) => (
                                      <button
                                        key={item.label}
                                        className={`w-full text-left px-5 py-3.5 text-base flex items-center gap-3 ${item.destructive ? 'text-red-600' : 'text-gray-900'} ${idx > 0 ? 'border-t border-gray-200' : ''}`}
                                        onClick={() => {
                                          item.onClick()
                                          closeSwipeMenus()
                                        }}
                                      >
                                        <span className="flex-shrink-0">
                                          {actionIcons[item.label] || (
                                            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                                            </svg>
                                          )}
                                        </span>
                                        <span className="flex-1">{item.label}</span>
                                        {item.destructive && (
                                          <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                          </svg>
                                        )}
                                      </button>
                                    ))}
                                    <button
                                      type="button"
                                      className="w-full text-left px-5 py-3.5 text-base text-gray-700 border-t border-gray-200 bg-white"
                                      onClick={closeSwipeMenus}
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      )
                    }

                    return mealCategories.map((cat) => {
                      const entries = entriesByCategory[cat.key] || []
                      const waterInCategory = waterEntriesByCategory[cat.key] || []
                      const visibleFoodEntries = Array.isArray(entries)
                        ? entries.filter((entry) => !isEntryDeleted(entry))
                        : []
                      const visibleWaterEntries = Array.isArray(waterInCategory) ? waterInCategory : []
                      const visibleEntries = [...visibleFoodEntries, ...visibleWaterEntries]
                      let summaryText = 'No entries yet'
                      if (visibleEntries.length > 0) {
                        const totals = visibleFoodEntries.reduce(
                          (acc, entry) => {
                            const t = getEntryTotals(entry)
                            acc.calories += Number(t.calories || 0)
                            acc.protein += Number(t.protein || 0)
                            acc.carbs += Number(t.carbs || 0)
                            acc.fat += Number(t.fat || 0)
                            return acc
                          },
                          { calories: 0, protein: 0, carbs: 0, fat: 0 },
                        )
                        const drinkTotalMl = visibleFoodEntries.reduce((sum, entry) => {
                          const meta = getDrinkMetaFromEntry(entry)
                          if (!meta?.type) return sum
                          const ml = Number(meta.amountMl)
                          return sum + (Number.isFinite(ml) ? ml : 0)
                        }, 0)
                        const waterTotalMl = visibleWaterEntries.reduce(
                          (sum, entry) => sum + (Number(entry?.amountMl) || 0),
                          0,
                        ) + drinkTotalMl
                        const summaryParts: string[] = []
                        if (totals.calories > 0) summaryParts.push(`${Math.round(totals.calories)} kcal`)
                        if (totals.protein > 0) summaryParts.push(`${Math.round(totals.protein)}g Protein`)
                        if (totals.carbs > 0) summaryParts.push(`${Math.round(totals.carbs)}g Carbs`)
                        if (totals.fat > 0) summaryParts.push(`${Math.round(totals.fat)}g Fat`)
                        if (waterTotalMl > 0) summaryParts.push(`Water ${formatWaterMl(waterTotalMl)}`)
                        summaryText = summaryParts.length > 0 ? summaryParts.join(', ') : 'No entries yet'
                      }

                      const toggleCategory = () => {
                        const isOpening = !expandedCategories[cat.key]
                        setExpandedCategories((prev) => ({
                          ...prev,
                          [cat.key]: !prev[cat.key],
                        }))
                        if (!isOpening) return
                        const isLastCategory =
                          cat.key === 'uncategorized' || cat.key === MEAL_CATEGORY_ORDER[MEAL_CATEGORY_ORDER.length - 1]
                        if (!isLastCategory || visibleEntries.length === 0) return
                        const sorted = visibleEntries
                          .slice()
                          .sort((a: any, b: any) => (extractEntryTimestampMs(b) || 0) - (extractEntryTimestampMs(a) || 0))
                        const lastEntry = sorted[sorted.length - 1] || sorted[0]
                        if (lastEntry?.id !== undefined && lastEntry?.id !== null) {
                          queueScrollToDiaryEntry({ entryKey: lastEntry.id, category: cat.key })
                        }
                      }

                      return (
                        <div
                          key={cat.key}
                          className="overflow-visible"
                          ref={(el) => {
                            categoryRowRefs.current[cat.key] = el
                          }}
                        >
                          <div className="relative">
                            <div
                              className={`flex items-center gap-3 px-4 sm:px-6 py-3 ${expandedCategories[cat.key] ? 'bg-white' : 'bg-white'}`}
                            >
                              <button
                                type="button"
                                className="category-add-button flex-shrink-0 h-9 w-9 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-600 flex items-center justify-center hover:bg-emerald-100 transition-colors"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleCategoryPlusClick(cat.key as any)
                                }}
                                aria-label={`Add to ${cat.label}`}
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v12m6-6H6" />
                                </svg>
                              </button>
                              <button
                                type="button"
                                onClick={toggleCategory}
                                className="flex-1 min-w-0 text-left"
                                aria-expanded={expandedCategories[cat.key]}
                              >
                                <div className="font-semibold text-gray-900">{cat.label}</div>
                                <div className="text-xs text-gray-500 truncate">{summaryText}</div>
                              </button>
                              <button
                                type="button"
                                onClick={toggleCategory}
                                className="flex-shrink-0 p-2 rounded-lg hover:bg-gray-100 transition-colors"
                                aria-label={expandedCategories[cat.key] ? 'Collapse category' : 'Expand category'}
                              >
                                <svg
                                  className={`w-4 h-4 text-gray-500 transition-transform ${expandedCategories[cat.key] ? 'rotate-180' : ''}`}
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                  aria-hidden
                                >
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                              </button>
                            </div>

                            {showPhotoOptions && photoOptionsAnchor === cat.key && !showCategoryPicker && (
                              isMobile ? (
                                <div
                                  className="food-options-dropdown px-4 sm:px-6 mt-2 z-40"
                                  onPointerDown={(e) => e.stopPropagation()}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <div className="rounded-2xl shadow-2xl border border-gray-200 bg-white/95 backdrop-blur-xl overflow-hidden max-h-[70vh] overflow-y-auto overscroll-contain">
                                    <div className="divide-y divide-gray-100">
                                      <button
                                        type="button"
                                        className="w-full text-left flex items-center px-4 py-3 hover:bg-gray-50 transition-colors"
                                        onClick={() => {
                                          setShowPhotoOptions(false)
                                          setPhotoOptionsAnchor(null)
                                          const qs = new URLSearchParams()
                                          qs.set('date', selectedDate)
                                          qs.set('category', cat.key)
                                          router.push(`/food/analysis?${qs.toString()}`)
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

                                      <button
                                        type="button"
                                        onClick={() => {
                                          setShowPhotoOptions(false);
                                          setPhotoOptionsAnchor(null);
                                          favoritesReplaceTargetRef.current = null;
                                          favoritesActionRef.current = 'diary';
                                          setShowFavoritesPicker(true);
                                        }}
                                        className="w-full text-left flex items-center px-4 py-3 hover:bg-gray-50 transition-colors"
                                      >
                                        <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center mr-3 text-amber-600">
                                          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                            <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                                          </svg>
                                        </div>
                                        <div className="flex-1">
                                          <div className="text-base font-semibold text-gray-900">Favorites</div>
                                          <div className="text-xs text-gray-500">Insert a saved meal in {categoryLabel(selectedAddCategory)}</div>
                                        </div>
                                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                        </svg>
	                                      </button>

	                                      <button
	                                        type="button"
	                                        onClick={() => {
	                                          setShowPhotoOptions(false)
	                                          setPhotoOptionsAnchor(null)
                                            const fresh = Date.now()
	                                          router.push(
	                                            `/food/recommended?date=${encodeURIComponent(
	                                              selectedDate,
	                                            )}&category=${encodeURIComponent(cat.key)}&generate=1&fresh=${fresh}`,
	                                          )
	                                        }}
	                                        className="w-full text-left flex items-center px-4 py-3 hover:bg-gray-50 transition-colors"
	                                      >
	                                        <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center mr-3 text-purple-700">
	                                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
	                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 19.5L6 21l1.5-3.75m7.5 2.25H5.25A2.25 2.25 0 013 17.25V6.75A2.25 2.25 0 015.25 4.5h9.75A2.25 2.25 0 0117.25 6.75v5.25" />
	                                          </svg>
	                                        </div>
	                                        <div className="flex-1">
	                                          <div className="text-base font-semibold text-gray-900">Recommended</div>
	                                          <div className="text-xs text-gray-500">AI meal suggestion • {AI_MEAL_RECOMMENDATION_CREDITS} credits</div>
	                                        </div>
	                                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
	                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
	                                        </svg>
	                                      </button>

		                                      {(() => {
		                                        const entriesForCopy = entriesByCategory[cat.key] || []
		                                        return selectedDate !== todayIso && entriesForCopy.length > 0 ? (
		                                          <button
                                            type="button"
                                            onClick={() => {
                                              setShowPhotoOptions(false);
                                              setPhotoOptionsAnchor(null);
                                              copyCategoryEntriesToToday(cat.key, entriesForCopy);
                                            }}
                                            className="w-full text-left flex items-center px-4 py-3 hover:bg-gray-50 transition-colors"
                                          >
                                            <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center mr-3 text-emerald-600">
                                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m-6-6h12" />
                                              </svg>
                                            </div>
                                            <div className="flex-1">
                                              <div className="text-base font-semibold text-gray-900">Copy {categoryLabel(cat.key)} to Today</div>
                                              <div className="text-xs text-gray-500">Duplicate all {categoryLabel(cat.key)} entries onto today</div>
                                            </div>
                                            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                            </svg>
                                          </button>
                                        ) : null
                                      })()}

                                      {(() => {
                                        const entriesForCopy = entriesByCategory[cat.key] || []
                                        return entriesForCopy.length > 1 ? (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setShowPhotoOptions(false)
                                              setPhotoOptionsAnchor(null)
                                              openMultiCopyPicker(cat.key)
                                            }}
                                            className="w-full text-left flex items-center px-4 py-3 hover:bg-gray-50 transition-colors"
                                          >
                                            <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center mr-3 text-teal-700">
                                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 8h3m-3 4h3m-7-8h.01m-.01 4h.01" />
                                              </svg>
                                            </div>
                                            <div className="flex-1">
                                              <div className="text-base font-semibold text-gray-900">Copy multiple items</div>
                                              <div className="text-xs text-gray-500">Choose which {categoryLabel(cat.key)} items to copy</div>
                                            </div>
                                            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                            </svg>
                                          </button>
                                        ) : null
                                      })()}

                                      {multiCopyClipboardCount > 0 && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setShowPhotoOptions(false)
                                            setPhotoOptionsAnchor(null)
                                            pasteMultipleFromClipboard(cat.key, selectedDate)
                                          }}
                                          className="w-full text-left flex items-center px-4 py-3 hover:bg-gray-50 transition-colors"
                                        >
                                          <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center mr-3 text-purple-700">
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 4v4a2 2 0 002 2h4a2 2 0 002-2V4m-2 12h2a2 2 0 002-2V8a2 2 0 00-2-2h-2M8 20h8a2 2 0 002-2v-4a2 2 0 00-2-2H8a2 2 0 00-2 2v4a2 2 0 002 2z" />
                                            </svg>
                                          </div>
                                          <div className="flex-1">
                                            <div className="text-base font-semibold text-gray-900">Paste items</div>
                                            <div className="text-xs text-gray-500">Paste {multiCopyClipboardCount} copied item{multiCopyClipboardCount === 1 ? '' : 's'} into {categoryLabel(cat.key)}</div>
                                          </div>
                                          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                          </svg>
                                        </button>
                                      )}

                                      {multiCopyClipboardCount > 0 && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setShowPhotoOptions(false)
                                            setPhotoOptionsAnchor(null)
                                            clearMultiCopyClipboard()
                                            showQuickToast('Cleared copied items')
                                          }}
                                          className="w-full text-left flex items-center px-4 py-3 hover:bg-gray-50 transition-colors"
                                        >
                                          <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center mr-3 text-gray-700">
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 12H6" />
                                            </svg>
                                          </div>
                                          <div className="flex-1">
                                            <div className="text-base font-semibold text-gray-900">Clear copied items</div>
                                            <div className="text-xs text-gray-500">Remove items from the clipboard</div>
                                          </div>
                                        </button>
                                      )}

                                      <button
                                        type="button"
                                        onClick={() => {
                                          setShowPhotoOptions(false);
                                          setPhotoOptionsAnchor(null);
                                          setSelectedAddCategory(cat.key)
                                          barcodeReplaceTargetRef.current = null;
                                          barcodeActionRef.current = 'diary';
                                          setShowBarcodeScanner(true);
                                          setBarcodeError(null);
                                          setBarcodeValue('');
                                        }}
                                        className="w-full text-left flex items-center px-4 py-3 hover:bg-gray-50 transition-colors"
                                      >
                                        <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center mr-3 text-indigo-600">
                                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h2m2 0h2m2 0h2m2 0h2M4 18h2m2 0h2m2 0h2m2 0h2M7 6v12m4-12v12m4-12v12" />
                                          </svg>
                                        </div>
                                          <div className="flex-1">
                                            <div className="text-base font-semibold text-gray-900">Barcode Scanner</div>
                                            <div className="text-xs text-gray-500">Scan packaged foods • 3 credits per scan (FatSecret lookup)</div>
                                          </div>
                                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                        </svg>
                                      </button>

	                                      <button
	                                        type="button"
	                                        onClick={(e) =>
	                                          openAddIngredientModalFromMenu(e, {
	                                            mode: 'diary',
	                                            targetCategory: cat.key,
	                                          })
	                                        }
	                                        className="w-full text-left flex items-center px-4 py-3 hover:bg-gray-50 transition-colors"
	                                      >
	                                        <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center mr-3 text-green-600">
	                                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
	                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v12m6-6H6" />
	                                          </svg>
	                                        </div>
	                                      <div className="flex-1">
	                                        <div className="text-base font-semibold text-gray-900">Add ingredient</div>
	                                        <div className="text-xs text-gray-500">Search a database and add one item</div>
	                                      </div>
	                                      <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
	                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
	                                      </svg>
	                                    </button>

                                      <button
                                        type="button"
                                        onClick={() => {
                                          setShowPhotoOptions(false)
                                          setPhotoOptionsAnchor(null)
                                          router.push(`/food/build-meal?date=${encodeURIComponent(selectedDate)}&category=${encodeURIComponent(cat.key)}`)
                                        }}
                                        className="w-full text-left flex items-center px-4 py-3 hover:bg-gray-50 transition-colors"
                                      >
                                        <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center mr-3 text-emerald-700">
                                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                                          </svg>
                                        </div>
                                        <div className="flex-1">
                                          <div className="text-base font-semibold text-gray-900">Build a meal</div>
                                          <div className="text-xs text-gray-500">Combine multiple ingredients into one entry</div>
                                        </div>
                                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                        </svg>
                                      </button>

                                      <button
                                        type="button"
                                        onClick={() => {
                                          setShowPhotoOptions(false)
                                          setPhotoOptionsAnchor(null)
                                          const qs = new URLSearchParams()
                                          qs.set('date', selectedDate)
                                          qs.set('category', cat.key)
                                          router.push(`/food/water?${qs.toString()}`)
                                        }}
                                        className="w-full text-left flex items-center px-4 py-3 hover:bg-gray-50 transition-colors"
                                      >
                                        <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-sky-100 flex items-center justify-center mr-3 text-sky-600">
                                          <span className="material-symbols-outlined text-xl">water_drop</span>
                                        </div>
                                        <div className="flex-1">
                                          <div className="text-base font-semibold text-gray-900">Log Water Intake</div>
                                          <div className="text-xs text-gray-500">Add water, tea, coffee, or bottle sizes</div>
                                        </div>
                                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                        </svg>
                                      </button>

                                      {(() => {
                                        const entriesForCombine = entriesByCategory[cat.key] || []
                                        return Array.isArray(entriesForCombine) && entriesForCombine.length > 1 ? (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setShowPhotoOptions(false)
                                              setPhotoOptionsAnchor(null)
                                              openCombinePicker(cat.key)
                                            }}
                                            className="w-full text-left flex items-center px-4 py-3 hover:bg-gray-50 transition-colors"
                                          >
                                            <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center mr-3 text-emerald-700">
                                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h8M8 12h8M8 17h8" />
                                              </svg>
                                            </div>
                                            <div className="flex-1">
                                              <div className="text-base font-semibold text-gray-900">Combine ingredients</div>
                                              <div className="text-xs text-gray-500">Pick existing foods and combine into one meal</div>
                                            </div>
                                            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                            </svg>
                                          </button>
                                        ) : null
                                      })()}

                                    <button
                                      type="button"
                                      onClick={() => {
                                        setShowPhotoOptions(false);
                                          setPhotoOptionsAnchor(null);
                                        }}
                                        className="w-full text-center px-4 py-3 text-sm text-gray-500 hover:bg-gray-50"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </div>
                                </div>
                                ) : (
                                <div
                                  ref={desktopAddMenuRef}
                                  className="food-options-dropdown fixed z-50 px-4 sm:px-6 max-h-[75vh] overflow-y-auto overscroll-contain"
                                  onPointerDown={(e) => e.stopPropagation()}
                                  onClick={(e) => e.stopPropagation()}
                                  style={{
                                    top: photoOptionsPosition?.top,
                                    left: photoOptionsPosition?.left,
                                    width: photoOptionsPosition?.width,
                                    maxHeight: photoOptionsPosition?.maxHeight,
                                  }}
                                >
                                  <div className="rounded-2xl shadow-2xl border border-gray-200 bg-white/95 backdrop-blur-xl overflow-hidden">
                                    <div className="divide-y divide-gray-100">
                                      <button
                                        type="button"
                                        className="w-full text-left flex items-center px-4 py-3 hover:bg-gray-50 transition-colors"
                                        onClick={() => {
                                          setShowPhotoOptions(false)
                                          setPhotoOptionsAnchor(null)
                                          const qs = new URLSearchParams()
                                          qs.set('date', selectedDate)
                                          qs.set('category', cat.key)
                                          router.push(`/food/analysis?${qs.toString()}`)
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

                                      <button
                                        type="button"
                                        onClick={() => {
                                          setShowPhotoOptions(false);
                                          setPhotoOptionsAnchor(null);
                                          favoritesReplaceTargetRef.current = null;
                                          favoritesActionRef.current = 'diary';
                                          setShowFavoritesPicker(true);
                                        }}
                                        className="w-full text-left flex items-center px-4 py-3 hover:bg-gray-50 transition-colors"
                                      >
                                        <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center mr-3 text-amber-600">
                                          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                            <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                                          </svg>
                                        </div>
	                                        <div className="flex-1">
	                                          <div className="text-base font-semibold text-gray-900">Favorites</div>
	                                          <div className="text-xs text-gray-500">Insert a saved meal in {categoryLabel(cat.key)}</div>
	                                        </div>
	                                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
	                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
	                                        </svg>
	                                      </button>

		                                      <button
		                                        type="button"
		                                            onClick={() => {
		                                              setShowPhotoOptions(false)
		                                              setPhotoOptionsAnchor(null)
                                                const fresh = Date.now()
		                                              router.push(
		                                                `/food/recommended?date=${encodeURIComponent(
		                                                  selectedDate,
		                                                )}&category=${encodeURIComponent(cat.key)}&generate=1&fresh=${fresh}`,
		                                              )
		                                            }}
		                                        className="w-full text-left flex items-center px-4 py-3 hover:bg-gray-50 transition-colors"
		                                      >
	                                        <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center mr-3 text-purple-700">
	                                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
	                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 19.5L6 21l1.5-3.75m7.5 2.25H5.25A2.25 2.25 0 013 17.25V6.75A2.25 2.25 0 015.25 4.5h9.75A2.25 2.25 0 0117.25 6.75v5.25" />
	                                          </svg>
	                                        </div>
	                                        <div className="flex-1">
	                                          <div className="text-base font-semibold text-gray-900">Recommended</div>
	                                          <div className="text-xs text-gray-500">AI meal suggestion • {AI_MEAL_RECOMMENDATION_CREDITS} credits</div>
	                                        </div>
	                                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
	                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
	                                        </svg>
	                                      </button>

	                                      {(() => {
	                                        const entriesForCopy = entriesByCategory[cat.key] || []
	                                        return selectedDate !== todayIso && entriesForCopy.length > 0 ? (
	                                          <button
                                            type="button"
                                            onClick={() => {
                                              setShowPhotoOptions(false);
                                              setPhotoOptionsAnchor(null);
                                              copyCategoryEntriesToToday(cat.key, entriesForCopy);
                                            }}
                                            className="w-full text-left flex items-center px-4 py-3 hover:bg-gray-50 transition-colors"
                                          >
                                            <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center mr-3 text-emerald-600">
                                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m-6-6h12" />
                                              </svg>
                                            </div>
                                            <div className="flex-1">
                                              <div className="text-base font-semibold text-gray-900">Copy {categoryLabel(cat.key)} to Today</div>
                                              <div className="text-xs text-gray-500">Duplicate all {categoryLabel(cat.key)} entries onto today</div>
                                            </div>
                                            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                            </svg>
                                          </button>
                                        ) : null
                                      })()}

                                      {(() => {
                                        const entriesForCopy = entriesByCategory[cat.key] || []
                                        return entriesForCopy.length > 1 ? (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setShowPhotoOptions(false)
                                              setPhotoOptionsAnchor(null)
                                              openMultiCopyPicker(cat.key)
                                            }}
                                            className="w-full text-left flex items-center px-4 py-3 hover:bg-gray-50 transition-colors"
                                          >
                                            <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center mr-3 text-teal-700">
                                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 8h3m-3 4h3m-7-8h.01m-.01 4h.01" />
                                              </svg>
                                            </div>
                                            <div className="flex-1">
                                              <div className="text-base font-semibold text-gray-900">Copy multiple items</div>
                                              <div className="text-xs text-gray-500">Choose which {categoryLabel(cat.key)} items to copy</div>
                                            </div>
                                            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                            </svg>
                                          </button>
                                        ) : null
                                      })()}

                                      {multiCopyClipboardCount > 0 && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setShowPhotoOptions(false)
                                            setPhotoOptionsAnchor(null)
                                            pasteMultipleFromClipboard(cat.key, selectedDate)
                                          }}
                                          className="w-full text-left flex items-center px-4 py-3 hover:bg-gray-50 transition-colors"
                                        >
                                          <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center mr-3 text-purple-700">
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 4v4a2 2 0 002 2h4a2 2 0 002-2V4m-2 12h2a2 2 0 002-2V8a2 2 0 00-2-2h-2M8 20h8a2 2 0 002-2v-4a2 2 0 00-2-2H8a2 2 0 00-2 2v4a2 2 0 002 2z" />
                                            </svg>
                                          </div>
                                          <div className="flex-1">
                                            <div className="text-base font-semibold text-gray-900">Paste items</div>
                                            <div className="text-xs text-gray-500">Paste {multiCopyClipboardCount} copied item{multiCopyClipboardCount === 1 ? '' : 's'} into {categoryLabel(cat.key)}</div>
                                          </div>
                                          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                          </svg>
                                        </button>
                                      )}

                                      {multiCopyClipboardCount > 0 && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setShowPhotoOptions(false)
                                            setPhotoOptionsAnchor(null)
                                            clearMultiCopyClipboard()
                                            showQuickToast('Cleared copied items')
                                          }}
                                          className="w-full text-left flex items-center px-4 py-3 hover:bg-gray-50 transition-colors"
                                        >
                                          <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center mr-3 text-gray-700">
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 12H6" />
                                            </svg>
                                          </div>
                                          <div className="flex-1">
                                            <div className="text-base font-semibold text-gray-900">Clear copied items</div>
                                            <div className="text-xs text-gray-500">Remove items from the clipboard</div>
                                          </div>
                                        </button>
                                      )}

                                      <button
                                        type="button"
                                        onClick={() => {
                                          setShowPhotoOptions(false);
                                          setPhotoOptionsAnchor(null);
                                          setSelectedAddCategory(cat.key);
                                          barcodeReplaceTargetRef.current = null;
                                          barcodeActionRef.current = 'diary';
                                          setShowBarcodeScanner(true);
                                          setBarcodeError(null);
                                          setBarcodeValue('');
                                        }}
                                        className="w-full text-left flex items-center px-4 py-3 hover:bg-gray-50 transition-colors"
                                      >
                                        <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center mr-3 text-indigo-600">
                                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h2m2 0h2m2 0h2m2 0h2M4 18h2m2 0h2m2 0h2m2 0h2M7 6v12m4-12v12m4-12v12" />
                                          </svg>
                                        </div>
                                        <div className="flex-1">
                                          <div className="text-base font-semibold text-gray-900">Barcode Scanner</div>
                                          <div className="text-xs text-gray-500">Scan packaged foods</div>
                                        </div>
                                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                        </svg>
                                      </button>

	                                      <button
	                                        type="button"
	                                        onClick={(e) =>
	                                          openAddIngredientModalFromMenu(e, {
	                                            mode: 'diary',
	                                            targetCategory: cat.key,
	                                          })
	                                        }
	                                        className="w-full text-left flex items-center px-4 py-3 hover:bg-gray-50 transition-colors"
	                                      >
	                                        <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center mr-3 text-green-600">
	                                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
	                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v12m6-6H6" />
	                                          </svg>
	                                        </div>
	                                        <div className="flex-1">
	                                          <div className="text-base font-semibold text-gray-900">Add ingredient</div>
	                                          <div className="text-xs text-gray-500">Search a database and add one item</div>
	                                        </div>
	                                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
	                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
	                                        </svg>
	                                      </button>

	                                      <button
	                                        type="button"
	                                        onClick={() => {
	                                          setShowPhotoOptions(false)
	                                          setPhotoOptionsAnchor(null)
	                                          router.push(`/food/build-meal?date=${encodeURIComponent(selectedDate)}&category=${encodeURIComponent(cat.key)}`)
	                                        }}
	                                        className="w-full text-left flex items-center px-4 py-3 hover:bg-gray-50 transition-colors"
	                                      >
	                                        <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center mr-3 text-emerald-700">
	                                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
	                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
	                                          </svg>
	                                        </div>
	                                        <div className="flex-1">
	                                          <div className="text-base font-semibold text-gray-900">Build a meal</div>
	                                          <div className="text-xs text-gray-500">Combine multiple ingredients into one entry</div>
	                                        </div>
	                                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
	                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
	                                        </svg>
	                                      </button>

                                        {(() => {
                                          const entriesForCombine = entriesByCategory[cat.key] || []
                                          return Array.isArray(entriesForCombine) && entriesForCombine.length > 1 ? (
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setShowPhotoOptions(false)
                                                setPhotoOptionsAnchor(null)
                                                openCombinePicker(cat.key)
                                              }}
                                              className="w-full text-left flex items-center px-4 py-3 hover:bg-gray-50 transition-colors"
                                            >
                                              <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center mr-3 text-emerald-700">
                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h8M8 12h8M8 17h8" />
                                                </svg>
                                              </div>
                                              <div className="flex-1">
                                                <div className="text-base font-semibold text-gray-900">Combine ingredients</div>
                                                <div className="text-xs text-gray-500">Pick existing foods and combine into one meal</div>
                                              </div>
                                              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                              </svg>
                                            </button>
                                          ) : null
                                        })()}
                                    </div>
                                  </div>
                                </div>
                              )
                            )}
                          </div>
                          {expandedCategories[cat.key] && (
                            <div className="border-t border-gray-100 bg-white space-y-0 divide-y divide-gray-100 px-0 sm:px-6 pb-0 overflow-visible">
                              {visibleEntries.length === 0 ? (
                                <div className="text-sm text-gray-500 px-1 py-3 text-center">No entries in this category yet.</div>
                              ) : (
                                visibleEntries
                                  .slice()
                                  .sort((a: any, b: any) => (extractEntryTimestampMs(b) || 0) - (extractEntryTimestampMs(a) || 0))
                                  .map((food) => renderEntryCard(food))
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })
                  })()}
              </div>
            </>
          )}
        </div>
            )}
          </>
        )}

      {showFavoritesPicker && (
        /* GUARD RAIL: Favorites picker UI is locked per user request. Do not change without approval. */
        <div className="fixed inset-0 z-[50] bg-white overflow-y-auto">
          <div className="mx-auto w-full max-w-5xl px-3 sm:px-4 py-4">
            <div className="w-full overflow-hidden border border-gray-200 rounded-2xl shadow-xl bg-white">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
                <div>
                  <div className="text-lg font-semibold text-gray-900">Add from favorites</div>
                  <div className="text-sm text-gray-600">
                    {(() => {
                      const replaceIndex = favoritesReplaceTargetRef.current
                      if (replaceIndex !== null && replaceIndex !== undefined) return 'Replace this ingredient'
                      if (favoritesActionRef.current === 'analysis') return 'Add to this meal'
                      return `Insert into ${categoryLabel(selectedAddCategory)}`
                    })()}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeFavoritesPicker}
                  className="p-2 rounded-full hover:bg-gray-100"
                >
                  <span aria-hidden>✕</span>
                </button>
              </div>

              <div className="px-4 pt-3 space-y-3 border-b border-gray-200">
                <div className="flex items-center gap-2">
                  <div className="flex-1 relative">
                    <input
                      value={favoritesSearch}
                      onChange={(e) => setFavoritesSearch(e.target.value)}
                      placeholder="Search all foods..."
                      className="w-full pl-10 pr-16 py-3 border border-gray-300 bg-white text-base focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                      style={{ borderRadius: 0 }}
                    />
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M10 18a8 8 0 100-16 8 8 0 000 16z" />
                    </svg>
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2">
                      {favoritesSearch && (
                        <button
                          type="button"
                          onClick={() => setFavoritesSearch('')}
                          className="p-2 text-gray-500 hover:text-gray-700"
                        >
                          ✕
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          const replaceIndex = favoritesReplaceTargetRef.current
                          if (replaceIndex !== null && replaceIndex !== undefined) {
                            barcodeReplaceTargetRef.current = replaceIndex
                            barcodeActionRef.current = null
                          } else {
                            barcodeReplaceTargetRef.current = null
                            barcodeActionRef.current = 'diary'
                          }
                          closeFavoritesPicker()
                          setShowBarcodeScanner(true)
                          setBarcodeError(null)
                          setBarcodeValue('')
                        }}
                        className="p-2 text-gray-700 hover:text-gray-900"
                        aria-label="Open barcode scanner"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4h4v2H6v2H4V4zm12 0h4v4h-2V6h-2V4zm0 16h2v-2h2v4h-4v-2zM4 16h2v2h2v2H4v-4z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9h6v6H9z" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {(['all', 'favorites', 'custom'] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setFavoritesActiveTab(tab)}
                      className={`flex-1 py-2 text-sm font-semibold border ${
                        favoritesActiveTab === tab ? 'bg-gray-200 text-gray-900 border-gray-300' : 'bg-white text-gray-700 border-gray-300'
                      }`}
                      style={{ borderRadius: 0 }}
                    >
                      {tab === 'all' ? 'All' : tab === 'favorites' ? 'Favorites' : 'Custom'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="py-6">
                {(() => {
                  const { allMeals, favoriteMeals, customMeals } = buildFavoritesDatasets()
                  const search = favoritesSearch.trim().toLowerCase()
                  const filterBySearch = (item: any) => {
                    if (!search) return true
                    return (
                      item?.label?.toLowerCase().includes(search) ||
                      (item?.serving || '').toString().toLowerCase().includes(search) ||
                      (item?.sourceTag || '').toString().toLowerCase().includes(search)
                    )
                  }
                  const sortList = (list: any[]) =>
                    [...list].sort((a, b) => {
                      const aPriority = Number(a?.sortPriority) || 0
                      const bPriority = Number(b?.sortPriority) || 0
                      if (aPriority !== bPriority) return bPriority - aPriority
                      return (Number(b?.createdAt) || 0) - (Number(a?.createdAt) || 0)
                    })
                  let data: any[] = []
                  if (favoritesActiveTab === 'all') data = sortList(allMeals.filter(filterBySearch))
                  if (favoritesActiveTab === 'favorites')
                    data = sortList(favoriteMeals.filter((m: any) => !isCustomMealFavorite(m?.favorite)).filter(filterBySearch))
                  if (favoritesActiveTab === 'custom') data = sortList(customMeals.filter(filterBySearch))

                  const favoriteKeySet = new Set<string>()
                  ;(favorites || []).forEach((fav: any) => {
                    const key = favoriteDisplayLabel(fav).toLowerCase()
                    if (key) favoriteKeySet.add(key)
                  })

                  if (data.length === 0) {
                    return (
                      <div className="px-4 py-8 text-center text-sm text-gray-500 border border-gray-200 rounded-xl mx-4">
                        {favoritesActiveTab === 'all'
                          ? 'No meals yet. Add some entries to see them here.'
                          : favoritesActiveTab === 'favorites'
                          ? 'Save a meal using “Add to Favorites” to see it here.'
                          : 'Create custom meals and they will appear here.'}
                      </div>
                    )
                  }

                  return (
                    <div className="px-0 divide-y divide-gray-200 border border-gray-200 rounded-xl bg-white">
                      {data.map((item) => {
                        const calories = item?.calories
                        const tag = item?.sourceTag || (favoritesActiveTab === 'favorites' ? 'Favorite' : 'Custom')
                        const serving = item?.serving || '1 serving'
                        const handleSelect = () => {
                          const source = item.favorite || item.entry || item
                          const replaceIndex = favoritesReplaceTargetRef.current
                          if (replaceIndex !== null && replaceIndex !== undefined) {
                            replaceIngredientFromFavoriteSource(source, replaceIndex)
                            closeFavoritesPicker()
                            return
                          }
                          if (favoritesActionRef.current === 'analysis') {
                            addFavoriteIngredientToAnalysis(source)
                            closeFavoritesPicker()
                            return
                          }
                          if (item.favorite) {
                            insertFavoriteIntoDiary(item.favorite, selectedAddCategory)
                          } else if (item.entry) {
                            insertMealIntoDiary(item.entry, selectedAddCategory)
                          } else {
                            insertMealIntoDiary(item, selectedAddCategory)
                          }
                        }
                        const favoriteId =
                          item?.favorite?.id || (typeof item?.id === 'string' && item.id.startsWith('fav-') ? item.id : null)
                        const canDeleteFavorite = Boolean(favoriteId && item.favorite)
                        const canEditFavorite = Boolean((favoriteId && item.favorite) || (favoritesActiveTab === 'all' && Boolean(item.entry)))
                        const key = normalizeMealLabel(item?.label || '').toLowerCase()
                        const isSaved = Boolean(item.favorite) || (key ? favoriteKeySet.has(key) : false)
                        const canSaveFromAll = favoritesActiveTab === 'all' && !isSaved && Boolean(item.entry)
                        return (
                          <div
                            key={item.id}
                            className="w-full bg-white flex items-stretch min-w-0 overflow-hidden"
                            style={{ borderRadius: 0 }}
                          >
                            <button
                              onClick={handleSelect}
                              className="flex-1 min-w-0 w-full overflow-hidden text-left px-4 py-3 hover:bg-gray-50"
                              style={{ borderRadius: 0 }}
                            >
                              <div className="flex items-center justify-between gap-3 min-w-0">
                                <div className="min-w-0">
                                  <div className="text-sm font-semibold text-gray-900 truncate">{item.label}</div>
                                  <div className="text-xs text-gray-600 truncate">{serving}</div>
                                </div>
                                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                                  {calories != null && (
                                    <span className="text-sm font-semibold text-gray-900">{calories} kcal</span>
                                  )}
                                  <span className="text-xs text-gray-500">{tag}</span>
                                </div>
                              </div>
                            </button>
                            {favoritesActiveTab === 'all' && (
                              <button
                                type="button"
                                disabled={!canSaveFromAll}
                                onClick={() => {
                                  if (!item?.entry) return
                                  handleAddToFavorites(item.entry)
                                  setFavoritesActiveTab('favorites')
                                  showQuickToast('Saved to Favorites')
                                }}
                                className="px-3 flex items-center justify-center hover:bg-emerald-50 text-helfi-green disabled:opacity-50"
                                title={isSaved ? 'Already in favorites' : 'Save to favorites'}
                                aria-label="Save to favorites"
                              >
                                <svg
                                  className="w-5 h-5"
                                  fill={isSaved ? 'currentColor' : 'none'}
                                  stroke={isSaved ? 'none' : 'currentColor'}
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.618 4.98a1 1 0 00.95.69h5.236c.969 0 1.371 1.24.588 1.81l-4.236 3.078a1 1 0 00-.364 1.118l1.618 4.98c.3.921-.755 1.688-1.539 1.118l-4.236-3.078a1 1 0 00-1.176 0l-4.236 3.078c-.783.57-1.838-.197-1.539-1.118l1.618-4.98a1 1 0 00-.364-1.118L2.98 10.407c-.783-.57-.38-1.81.588-1.81h5.236a1 1 0 00.95-.69l1.618-4.98z"
                                  />
                                </svg>
                              </button>
                            )}
                            {canDeleteFavorite && (
                              <button
                                type="button"
                                onClick={() => handleDeleteFavorite(String(favoriteId))}
                                className="px-3 flex items-center justify-center hover:bg-red-50 text-red-600"
                                title="Remove from favorites"
                                aria-label="Remove from favorites"
                              >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                  />
                                </svg>
                              </button>
                            )}
                            {canEditFavorite && (
                              <button
                                type="button"
                                onClick={() => {
                                  try {
                                    const fav = item.favorite
                                    const favId = favoriteId ? String(favoriteId) : ''
                                    if (fav && favId) {
                                      if (isCustomMealFavorite(fav)) {
                                        const favCategory =
                                          (fav?.meal && String(fav.meal)) || (fav?.category && String(fav.category)) || selectedAddCategory
                                        closeFavoritesPicker()
                                        router.push(
                                          `/food/build-meal?date=${encodeURIComponent(selectedDate)}&category=${encodeURIComponent(
                                            favCategory,
                                          )}&editFavoriteId=${encodeURIComponent(favId)}`,
                                        )
                                      } else {
                                        handleRenameFavorite(favId)
                                      }
                                      return
                                    }

                                    // In "All", allow editing any entry by saving it first as a favorite template.
                                    if (favoritesActiveTab === 'all' && item?.entry) {
                                      const entry = item.entry
                                      const entryMethod = String(entry?.method || '').toLowerCase()
                                      const shouldBeCustom =
                                        entryMethod === 'combined' || entryMethod === 'meal-builder' || isMealBuilderDiaryEntry(entry)
                                      if (shouldBeCustom) {
                                        const saved = saveFavoriteFromEntry(entry, { forceCustomMeal: true })
                                        const newFavId = String(saved?.favorite?.id || '').trim()
                                        if (!newFavId) return
                                        const favCategory =
                                          normalizeCategory(entry?.meal || entry?.category || entry?.mealType || selectedAddCategory)
                                        closeFavoritesPicker()
                                        router.push(
                                          `/food/build-meal?date=${encodeURIComponent(selectedDate)}&category=${encodeURIComponent(
                                            favCategory,
                                          )}&editFavoriteId=${encodeURIComponent(newFavId)}`,
                                        )
                                        return
                                      }

                                      const current = applyFoodNameOverride(entry?.description || entry?.label || 'Meal', entry) || 'Meal'
                                      openRenameModal(current, (nextName) => {
                                        saveFoodNameOverride(entry?.description || entry?.label || current, nextName, entry)
                                        showQuickToast('Renamed')
                                      })
                                      return
                                    }
                                  } catch {}
                                }}
                                className="px-3 flex items-center justify-center hover:bg-gray-50 text-gray-700"
                                title={item.favorite && isCustomMealFavorite(item.favorite) ? 'Edit meal' : 'Edit'}
                                aria-label={item.favorite && isCustomMealFavorite(item.favorite) ? 'Edit meal' : 'Edit'}
                              >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4L16.5 3.5z"
                                  />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 20h9" />
                                </svg>
                              </button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )
                })()}
              </div>
            </div>
          </div>
        </div>
      )}

      {showRenameModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/30" onClick={closeRenameModal} />
          <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-gray-200 p-5">
            <div className="text-lg font-semibold text-gray-900 mb-3">Rename to:</div>
            <input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onFocus={() => {
                if (!renameCleared) {
                  setRenameValue('')
                  setRenameCleared(true)
                }
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-base focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            />
            <div className="mt-4 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={closeRenameModal}
                className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRenameConfirm}
                className="px-4 py-2 rounded-lg bg-emerald-600 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {showMultiCopyModal && (
        <div className="fixed inset-0 z-50 bg-white flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
            <button
              type="button"
              onClick={closeMultiCopyPicker}
              className="p-2 rounded-full hover:bg-gray-100"
              aria-label="Back"
            >
              <span aria-hidden>←</span>
            </button>
            <div className="flex-1 text-center">
              <div className="text-lg font-semibold text-gray-900">Copy multiple items</div>
              <div className="text-xs text-gray-500">
                {multiCopyCategory ? categoryLabel(multiCopyCategory) : 'Meals'}
              </div>
            </div>
            <button
              type="button"
              onClick={closeMultiCopyPicker}
              className="p-2 rounded-full hover:bg-gray-100"
              aria-label="Close"
            >
              <span aria-hidden>✕</span>
            </button>
          </div>

          <div className="px-4 py-3 text-sm text-gray-600">
            Select the items you want to copy, then tap Copy.
          </div>

          <div className="flex-1 overflow-y-auto px-4 pb-24">
            {multiCopyEntries.length === 0 ? (
              <div className="text-sm text-gray-500 py-6 text-center">No items to copy.</div>
            ) : (
              <div className="divide-y divide-gray-100 border border-gray-200 rounded-xl overflow-hidden">
                {multiCopyEntries.map((entry: any, idx: number) => {
                  const key = entrySelectionKey(entry)
                  const checked = Boolean(multiCopySelectedKeys[key])
                  const totals = getEntryTotals(entry)
                  const calories =
                    typeof totals?.calories === 'number' && Number.isFinite(totals.calories)
                      ? Math.round(totals.calories)
                      : null
                  const label = sanitizeMealDescription(
                    (entry?.description || '').toString().split('\n')[0].split('Calories:')[0],
                  )
                  return (
                    <button
                      key={key || String(entry?.id ?? '') || `multi-copy-${idx}`}
                      type="button"
                      onClick={() => {
                        if (!key) return
                        setMultiCopySelectedKeys((prev) => ({
                          ...(prev || {}),
                          [key]: !Boolean(prev?.[key]),
                        }))
                      }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {}}
                        className="h-5 w-5 accent-emerald-600"
                        aria-label={`Select ${label}`}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900 truncate">{label || 'Food item'}</div>
                        <div className="text-xs text-gray-500 truncate">
                          {formatTimeWithAMPM(entry?.time || '')}
                        </div>
                      </div>
                      {calories !== null && (
                        <div className="text-sm font-semibold text-gray-900">{calories} kcal</div>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          <div className="fixed inset-x-0 bottom-0 z-10 border-t border-gray-200 bg-white p-4 pb-[calc(env(safe-area-inset-bottom)+16px)]">
            <button
              type="button"
              disabled={multiCopySelectedCount === 0}
              onClick={() => {
                if (!multiCopyCategory) return
                const selected = multiCopyEntries.filter((entry: any) => {
                  const key = entrySelectionKey(entry)
                  return key && Boolean(multiCopySelectedKeys[key])
                })
                const items: MultiCopyClipboardItem[] = selected.map((entry: any) => ({
                  description: (entry?.description || '').toString(),
                  nutrition: entry?.nutrition ?? null,
                  total: (entry as any)?.total ?? null,
                  items: Array.isArray(entry?.items) && entry.items.length > 0 ? entry.items : null,
                  photo: typeof entry?.photo === 'string' ? entry.photo : null,
                  time: typeof entry?.time === 'string' ? entry.time : null,
                  createdAt: typeof entry?.createdAt === 'string' ? entry.createdAt : null,
                  method: typeof entry?.method === 'string' ? entry.method : null,
                }))
                writeMultiCopyClipboard(items)
                closeMultiCopyPicker()
                showQuickToast(`Copied ${items.length} item${items.length === 1 ? '' : 's'}`)
              }}
              className={`w-full py-3 rounded-xl font-semibold transition-colors ${
                multiCopySelectedCount === 0
                  ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                  : 'bg-helfi-green text-white hover:bg-green-600'
              }`}
            >
              Copy{multiCopySelectedCount > 0 ? ` (${multiCopySelectedCount})` : ''}
            </button>
          </div>
        </div>
      )}

      {showCombineModal && (
        <div className="fixed inset-0 z-50 bg-white flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
            <button
              type="button"
              onClick={closeCombinePicker}
              className="p-2 rounded-full hover:bg-gray-100"
              aria-label="Back"
            >
              <span aria-hidden>←</span>
            </button>
            <div className="flex-1 text-center">
              <div className="text-lg font-semibold text-gray-900">Combine ingredients</div>
              <div className="text-xs text-gray-500">
                {combineCategory ? categoryLabel(combineCategory) : 'Meals'}
              </div>
            </div>
            <button
              type="button"
              onClick={closeCombinePicker}
              className="p-2 rounded-full hover:bg-gray-100"
              aria-label="Close"
            >
              <span aria-hidden>✕</span>
            </button>
          </div>

          <div className="px-4 py-3 border-b border-gray-200 space-y-2">
            <div className="text-sm text-gray-700">Pick the foods you want to combine.</div>
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-gray-700">New meal name</label>
              <input
                value={combineMealName}
                onChange={(e) => setCombineMealName(e.target.value)}
                placeholder={combineCategory ? `Louie's ${categoryLabel(combineCategory).toLowerCase()}` : "Louie's meal"}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 pb-28">
            {combineEntries.length === 0 ? (
              <div className="text-sm text-gray-500 py-6 text-center">No items to combine.</div>
            ) : (
              <div className="divide-y divide-gray-100 border border-gray-200 rounded-xl overflow-hidden">
                {combineEntries.map((entry: any, idx: number) => {
                  const key = entrySelectionKey(entry)
                  const checked = Boolean(combineSelectedKeys[key])
                  const totals = getEntryTotals(entry)
                  const calories =
                    typeof totals?.calories === 'number' && Number.isFinite(totals.calories)
                      ? Math.round(totals.calories)
                      : null
                  const label = sanitizeMealDescription(
                    (entry?.description || '').toString().split('\n')[0].split('Calories:')[0],
                  )
                  return (
                    <button
                      key={key || String(entry?.id ?? '') || `combine-${idx}`}
                      type="button"
                      onClick={() => {
                        if (!key) return
                        setCombineSelectedKeys((prev) => ({
                          ...(prev || {}),
                          [key]: !Boolean(prev?.[key]),
                        }))
                      }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {}}
                        className="h-5 w-5 accent-emerald-600"
                        aria-label={`Select ${label}`}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900 truncate">{label || 'Food item'}</div>
                        <div className="text-xs text-gray-500 truncate">{formatTimeWithAMPM(entry?.time || '')}</div>
                      </div>
                      {calories !== null && (
                        <div className="text-sm font-semibold text-gray-900">{calories} kcal</div>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          <div className="fixed inset-x-0 bottom-0 z-10 border-t border-gray-200 bg-white p-4 pb-[calc(env(safe-area-inset-bottom)+16px)] space-y-2">
            <button
              type="button"
              disabled={combineSelectedCount === 0 || combineSaving}
              onClick={combineSelectedEntries}
              className={`w-full py-3 rounded-xl font-semibold transition-colors ${
                combineSelectedCount === 0 || combineSaving
                  ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                  : 'bg-helfi-green text-white hover:bg-green-600'
              }`}
            >
              {combineSaving ? 'Saving…' : `Combine${combineSelectedCount > 0 ? ` (${combineSelectedCount})` : ''}`}
            </button>
            <div className="text-xs text-gray-500 text-center">
              This will save one combined meal and remove the selected items.
            </div>
          </div>
        </div>
      )}

      {showBarcodeScanner && (
      <div className="fixed inset-0 z-50 bg-black flex flex-col">
          {/* Hidden elements for barcode processing */}
          <div id="native-barcode-decoder" style={{ display: 'none' }} aria-hidden="true" />

          {/* Header */}
          <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200">
            <button
              type="button"
              onClick={() => setShowBarcodeScanner(false)}
              className="w-10 h-10 flex items-center justify-center"
              aria-label="Close scanner"
            >
              <svg className="w-6 h-6 text-gray-800" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <div className="text-lg font-semibold text-gray-900">Scan Barcode</div>
            <div className="w-10" />
          </div>

          {/* Camera area */}
            <div className="flex-1 relative bg-black overflow-hidden">
            <div id={BARCODE_REGION_ID} className="absolute inset-0" />

            {/* Overlay with scanning frame */}
            <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center px-6">
              <div className="text-center mb-6">
                <div className="text-white text-xl font-semibold drop-shadow-lg">Scan Barcode</div>
                <div className="text-white/80 text-sm mt-1 drop-shadow">Place barcode in the frame to scan</div>
              </div>
              
              <div 
                className="w-72 h-[220px] rounded-[22px] border-[4px] border-white/95 shadow-[0_0_30px_rgba(0,0,0,0.35)]"
              />

              {barcodeStatusHint && (
                <div className="absolute bottom-6 left-0 right-0 text-center">
                  <div className="inline-flex items-center px-3 py-1 rounded-full bg-black/55 text-white text-xs font-semibold shadow-lg">
                    {barcodeStatusHint}
                  </div>
                </div>
              )}
            </div>

            {showManualBarcodeInput && (
              <div
                className="pointer-events-auto absolute left-4 right-4 bg-white/95 rounded-2xl shadow-2xl border border-gray-200 p-4 space-y-3"
                style={{ bottom: '110px' }}
              >
                <div className="text-sm font-semibold text-gray-900">Type the barcode</div>
                <div className="flex items-center gap-2">
                  <input
                    ref={manualBarcodeInputRef}
                    value={barcodeValue}
                    onChange={(e) => setBarcodeValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        lookupBarcodeAndAdd(barcodeValue)
                      }
                    }}
                    placeholder="Enter barcode number"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-base focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={() => lookupBarcodeAndAdd(barcodeValue)}
                    className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold shadow-sm hover:bg-emerald-700"
                  >
                    Search
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowManualBarcodeInput(false)
                    setBarcodeValue('')
                  }}
                  className="text-xs text-gray-500 underline font-medium"
                >
                  Cancel
                </button>
              </div>
            )}

            {/* Loading overlay */}
            {barcodeStatus === 'loading' && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                <div className="flex flex-col items-center gap-3">
                  <svg className="animate-spin h-10 w-10 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span className="text-white text-sm font-medium">Starting camera...</span>
                </div>
              </div>
            )}
          </div>

          {/* Error message if any */}
          {barcodeError && (
            <div className="flex-shrink-0 px-4 py-3 bg-red-500 text-white text-center text-sm">
              {barcodeError}
            </div>
          )}

          {/* Bottom bar */}
          <div className="flex-shrink-0 bg-stone-100 border-t border-gray-200" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
            <div className="flex items-center justify-evenly px-6 py-4 gap-6">
              <button
                type="button"
                onClick={toggleTorch}
                disabled={!torchAvailable}
                className={`flex items-center gap-2 font-semibold ${torchAvailable ? 'text-gray-800' : 'text-gray-400'}`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <span className="text-sm uppercase tracking-wide">{torchEnabled ? 'Flash On' : 'Flash'}</span>
              </button>

              {/* Type Barcode button */}
              <button
                type="button"
                onClick={() => {
                  setShowManualBarcodeInput((prev) => !prev)
                  setBarcodeError(null)
                  setTimeout(() => {
                    manualBarcodeInputRef.current?.focus()
                  }, 50)
                }}
                className="flex items-center gap-2 text-gray-800 font-semibold"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h2m2 0h2m2 0h2m2 0h2M4 18h2m2 0h2m2 0h2m2 0h2M7 6v12m4-12v12m4-12v12" />
                </svg>
                <span className="text-sm uppercase tracking-wide">{showManualBarcodeInput ? 'Hide Input' : 'Type Barcode'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {showBarcodeLabelPrompt && barcodeLabelFlow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-gray-200 p-5">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-lg font-semibold text-gray-900">
                  {barcodeLabelFlow.reason === 'report'
                    ? 'Update nutrition label'
                    : 'Nutrition label needed'}
                </div>
                <div className="text-sm text-gray-600 mt-1">
                  {barcodeLabelFlow.reason === 'report'
                    ? 'Take a clear photo of the nutrition panel so we can refresh this barcode.'
                    : "We don't have reliable nutrition for this barcode yet. Take a clear photo of the nutrition panel and we'll save it for future scans."}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowBarcodeLabelPrompt(false)
                  setBarcodeLabelFlow(null)
                  setAutoAnalyzeLabelPhoto(false)
                  if (barcodeLabelTimeoutRef.current) {
                    clearTimeout(barcodeLabelTimeoutRef.current)
                    barcodeLabelTimeoutRef.current = null
                  }
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <span aria-hidden>✕</span>
              </button>
            </div>

            {(barcodeLabelFlow.productName || barcodeLabelFlow.brand) && (
              <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
                {barcodeLabelFlow.productName || 'Packaged item'}
                {barcodeLabelFlow.brand ? ` • ${barcodeLabelFlow.brand}` : ''}
              </div>
            )}

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => startBarcodeLabelCapture(barcodeLabelFlow)}
                className="flex-1 bg-emerald-600 text-white py-2.5 rounded-xl font-semibold hover:bg-emerald-700 transition-colors"
              >
                Take label photo
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowBarcodeLabelPrompt(false)
                  setBarcodeLabelFlow(null)
                  setAutoAnalyzeLabelPhoto(false)
                  if (barcodeLabelTimeoutRef.current) {
                    clearTimeout(barcodeLabelTimeoutRef.current)
                    barcodeLabelTimeoutRef.current = null
                  }
                }}
                className="flex-1 bg-white border border-gray-200 text-gray-700 py-2.5 rounded-xl font-semibold hover:bg-gray-50 transition-colors"
              >
                Not now
              </button>
            </div>
          </div>
        </div>
      )}

      {duplicateModalContext && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={() => setDuplicateModalContext(null)}
        >
          <div
            className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-gray-200 p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="text-lg font-semibold text-gray-900">
                  {duplicateModalContext.mode === 'copyToToday' ? 'Copy to Today' : 'Duplicate Meal'}
                </div>
                <p className="text-sm text-gray-600 mt-1">
                  {duplicateModalContext.mode === 'copyToToday'
                    ? 'Choose the category to add this copy to today.'
                    : 'Which category would you like to place your duplicated meal?'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDuplicateModalContext(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <span aria-hidden>✕</span>
              </button>
            </div>
            <div className="grid grid-cols-1 gap-2">
              {MEAL_CATEGORY_ORDER.map((key) => (
                <button
                  key={key}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-gray-200 hover:border-emerald-400 hover:bg-emerald-50 transition-colors"
                  onClick={() => duplicateEntryToCategory(key)}
                >
                  <span className="text-sm font-semibold text-gray-900">{categoryLabel(key)}</span>
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              ))}
            </div>
          </div>
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
              {isInlineImageSrc(fullSizeImage) ? (
                <img
                  src={fullSizeImage}
                  alt="Full size food image"
                  className="max-w-full max-h-full object-contain rounded-lg"
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <Image
                  src={fullSizeImage}
                  alt="Full size food image"
                  width={800}
                  height={600}
                  className="max-w-full max-h-full object-contain rounded-lg"
                  onClick={(e) => e.stopPropagation()}
                />
              )}
            </div>
          </div>
        )}
        </div>
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
    </DiaryErrorBoundary>
  )
}
