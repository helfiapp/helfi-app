import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'

import { API_BASE_URL } from '../config'
import { NATIVE_WEB_PAGES } from '../config/nativePageRoutes'
import { buildNativeAuthHeaders } from '../lib/nativeAuthHeaders'
import { useAppMode } from '../state/AppModeContext'
import { Screen } from '../ui/Screen'
import { theme } from '../ui/theme'

type Nutrients = {
  calories?: number | null
  calories_kcal?: number | null
  protein?: number | null
  protein_g?: number | null
  carbs?: number | null
  carbs_g?: number | null
  fat?: number | null
  fat_g?: number | null
  fiber?: number | null
  fiber_g?: number | null
  sugar?: number | null
  sugar_g?: number | null
  saturatedFat?: number | null
  saturated_fat_g?: number | null
}

type FoodEntry = {
  id: string
  name: string
  meal: string | null
  category?: string | null
  description?: string | null
  localDate?: string | null
  nutrients?: Nutrients | null
  items?: any[] | null
  createdAt: string
}

type WaterEntry = {
  id: string
  amount: number
  unit: string
  amountMl: number
  label?: string | null
  category?: string | null
  localDate?: string | null
  createdAt: string
}

type ExerciseType = {
  id: number
  name: string
  category: string
  intensity?: string | null
}

type ExerciseEntry = {
  id: string
  label: string
  durationMinutes: number
  distanceKm: number | null
  calories: number
  startTime?: string | null
  exerciseType?: ExerciseType | null
}

type FavoriteMeal = {
  id: string
  name: string
  meal: string
  nutrients: {
    calories: number
    protein: number
    carbs: number
    fat: number
    fiber: number
    sugar: number
  }
  description?: string
  ingredients?: Array<{ name: string; amount: number; unit: string }>
  custom?: boolean
}

type SearchFoodSource = 'openfoodfacts' | 'usda' | 'fatsecret' | 'custom' | string

type SearchFoodServingOption = {
  id?: string | number
  label?: string | null
  serving_size?: string | null
  calories?: number | null
  protein_g?: number | null
  carbs_g?: number | null
  fat_g?: number | null
  fiber_g?: number | null
  sugar_g?: number | null
}

type SearchFoodItem = {
  id: string | number
  source?: SearchFoodSource | null
  name: string
  brand?: string | null
  serving_size?: string | null
  servings?: number | null
  servingOptions?: SearchFoodServingOption[] | null
  selectedServingId?: string | null
  __custom?: boolean
  quantity_g?: number | null
  calories?: number | null
  calories_kcal?: number | null
  protein_g?: number | null
  carbs_g?: number | null
  fat_g?: number | null
  fiber_g?: number | null
  sugar_g?: number | null
}

type RecommendedMeal = {
  id: string
  mealName: string
  why: string
  category: string
  items: Array<{
    id?: string
    name: string
    serving_size?: string | null
    calories?: number | null
    protein_g?: number | null
    carbs_g?: number | null
    fat_g?: number | null
    fiber_g?: number | null
    sugar_g?: number | null
    servings: number
  }>
  recipe?: {
    prepMinutes?: number | null
    cookMinutes?: number | null
    steps: string[]
  } | null
}

const FAVORITES_KEY = 'helfi_native_food_favorites_v2'
const RECOMMENDED_EXPLAIN_KEY = 'helfi_native_recommended_explain_seen_v1'

const MEALS = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'dinner', label: 'Dinner' },
  { key: 'snacks', label: 'Snacks' },
  { key: 'uncategorized', label: 'Uncategorized' },
] as const

const DEFAULT_TARGETS = {
  calories: 2200,
  protein: 130,
  carbs: 250,
  fat: 75,
  fiber: 30,
  sugar: 35,
}

type DailyTargets = typeof DEFAULT_TARGETS

const DEFAULT_FOOD_ICON_URI = `${API_BASE_URL}/mobile-assets/MOBILE%20ICONS/FOOD%20ICON.png`
const SWIPE_MENU_WIDTH = 96
const SWIPE_DELETE_WIDTH = 96
const DRINK_ICON_BY_LABEL: Record<string, string> = {
  water: `${API_BASE_URL}/mobile-assets/MOBILE%20ICONS/WATER.png`,
  coffee: `${API_BASE_URL}/mobile-assets/MOBILE%20ICONS/COFFEE.png`,
  tea: `${API_BASE_URL}/mobile-assets/MOBILE%20ICONS/TEA.png`,
  juice: `${API_BASE_URL}/mobile-assets/MOBILE%20ICONS/JUICE.png`,
  'hot chocolate': `${API_BASE_URL}/mobile-assets/MOBILE%20ICONS/HOT%20CHOCOLATE.png`,
  'soft drink': `${API_BASE_URL}/mobile-assets/MOBILE%20ICONS/SOFT%20DRINK.png`,
  alcohol: `${API_BASE_URL}/mobile-assets/MOBILE%20ICONS/ALCOHOL.png`,
}

function formatLocalDate(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function parseLocalDate(raw: string) {
  const [y, m, d] = String(raw || '').split('-').map((v) => Number(v))
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return new Date()
  return new Date(y, m - 1, d)
}

function shiftDate(raw: string, deltaDays: number) {
  const date = parseLocalDate(raw)
  date.setDate(date.getDate() + deltaDays)
  return formatLocalDate(date)
}

function isToday(raw: string) {
  return raw === formatLocalDate()
}

function formatDateLabel(raw: string) {
  if (isToday(raw)) return 'Today'
  const d = parseLocalDate(raw)
  if (Number.isNaN(d.getTime())) return raw
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

function normalizeWaterLabel(label?: string | null) {
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

function getFoodEntryIconUri(entry: FoodEntry) {
  const nutrients: any = entry?.nutrients || {}
  const drinkType = normalizeWaterLabel(typeof nutrients?.__drinkType === 'string' ? nutrients.__drinkType : '')
  if (drinkType && DRINK_ICON_BY_LABEL[drinkType]) {
    return DRINK_ICON_BY_LABEL[drinkType]
  }

  const nameKey = normalizeWaterLabel(entry?.name || entry?.description || '')
  if (nameKey && DRINK_ICON_BY_LABEL[nameKey]) {
    return DRINK_ICON_BY_LABEL[nameKey]
  }

  return DEFAULT_FOOD_ICON_URI
}

function ingredientSourceLabel(item: SearchFoodItem) {
  if (item?.__custom || String(item?.id || '').startsWith('custom:')) return 'Custom list'
  if (item?.source === 'usda') return 'USDA FoodData Central'
  if (item?.source === 'openfoodfacts') return 'OpenFoodFacts'
  if (item?.source === 'fatsecret') return 'FatSecret'
  return 'Best match'
}

function round1(n: number) {
  return Math.round(n * 10) / 10
}

function numberOrZero(value: any) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return n
}

function readNutrient(n: Nutrients | null | undefined, keys: Array<keyof Nutrients>) {
  for (const key of keys) {
    const value = Number((n || {})[key])
    if (Number.isFinite(value)) return value
  }
  return 0
}

function compareLabelAz(a: string, b: string) {
  return String(a || '').trim().toLowerCase().localeCompare(String(b || '').trim().toLowerCase())
}

function isCustomSearchItem(item: SearchFoodItem) {
  return Boolean(item?.__custom) || String(item?.id || '').startsWith('custom:') || item?.source === 'custom'
}

function sortSearchResultsAz(
  items: SearchFoodItem[],
  options?: { kind?: 'single' | 'packaged'; query?: string },
) {
  let filtered = Array.isArray(items) ? items : []
  if (options?.kind === 'single') {
    const token = String(options?.query || '').trim().toLowerCase().split(/\s+/).filter(Boolean)[0] || ''
    if (token) {
      const firstWordMatches = filtered.filter((item) => {
        const firstWord = String(item?.name || '').trim().toLowerCase().split(/\s+/).filter(Boolean)[0] || ''
        return firstWord.startsWith(token)
      })
      if (firstWordMatches.length > 0) filtered = firstWordMatches
    }
  }

  return [...filtered].sort((a, b) => {
    if (options?.kind === 'single') {
      const sourcePriority = (item: SearchFoodItem) => {
        if (isCustomSearchItem(item)) return 0
        if (item?.source === 'usda') return 1
        if (item?.source === 'fatsecret') return 2
        if (item?.source === 'openfoodfacts') return 3
        return 4
      }
      const bySource = sourcePriority(a) - sourcePriority(b)
      if (bySource !== 0) return bySource
    }
    const byName = compareLabelAz(a?.name || '', b?.name || '')
    if (byName !== 0) return byName
    return compareLabelAz(a?.brand || '', b?.brand || '')
  })
}

type EntryTotals = {
  calories: number
  protein: number
  carbs: number
  fat: number
  fiber: number
  sugar: number
  satFat: number
}

function roundTo(value: number, decimals = 1) {
  const factor = Math.pow(10, decimals)
  return Math.round(value * factor) / factor
}

function sanitizeEntryTotals(raw: any): EntryTotals | null {
  if (!raw || typeof raw !== 'object') return null
  const pick = (...values: any[]) => {
    for (const value of values) {
      const n = Number(value)
      if (Number.isFinite(n)) return n
    }
    return null
  }

  const calories = pick(raw?.calories, raw?.calories_kcal, raw?.kcal, raw?.energy, raw?.cal)
  const protein = pick(raw?.protein, raw?.protein_g)
  const carbs = pick(raw?.carbs, raw?.carbs_g)
  const fat = pick(raw?.fat, raw?.fat_g)
  const fiber = pick(raw?.fiber, raw?.fiber_g)
  const sugar = pick(raw?.sugar, raw?.sugar_g)
  const satFat = pick(raw?.saturatedFat, raw?.saturated_fat_g, raw?.satFat)

  const hasValue = [calories, protein, carbs, fat, fiber, sugar, satFat].some((v) => v != null)
  if (!hasValue) return null

  const safe = (value: number | null, decimals = 1) => {
    if (value == null || !Number.isFinite(value)) return 0
    return Math.max(0, roundTo(value, decimals))
  }

  return {
    calories: Math.max(0, Math.round(calories || 0)),
    protein: safe(protein),
    carbs: safe(carbs),
    fat: safe(fat),
    fiber: safe(fiber),
    sugar: safe(sugar),
    satFat: safe(satFat),
  }
}

function hasNonZeroEntryTotals(totals: EntryTotals | null | undefined) {
  if (!totals) return false
  return Object.values(totals).some((value) => Number.isFinite(Number(value)) && Number(value) > 0)
}

function extractTotalsFromDescriptionText(value: any): EntryTotals | null {
  const text = String(value || '').trim()
  if (!text) return null
  const matchNumber = (regex: RegExp) => {
    const match = text.match(regex)
    if (!match) return null
    const parsed = parseFloat(match[1])
    return Number.isFinite(parsed) ? parsed : null
  }

  const calories =
    matchNumber(/calories?[:\s]*([0-9]+(?:\.[0-9]+)?)/i) ??
    matchNumber(/([0-9]+(?:\.[0-9]+)?)\s*kcal/i)
  const protein = matchNumber(/protein[:\s]*([0-9]+(?:\.[0-9]+)?)\s*g/i)
  const carbs = matchNumber(/carb(?:ohydrate)?s?[:\s]*([0-9]+(?:\.[0-9]+)?)\s*g/i)
  const fat = matchNumber(/fat[:\s]*([0-9]+(?:\.[0-9]+)?)\s*g/i)
  const fiber = matchNumber(/fib(?:er|re)[:\s]*([0-9]+(?:\.[0-9]+)?)\s*g/i)
  const sugar = matchNumber(/sugar[:\s]*([0-9]+(?:\.[0-9]+)?)\s*g/i)

  const hasValue = [calories, protein, carbs, fat, fiber, sugar].some((v) => v != null)
  if (!hasValue) return null

  return {
    calories: Math.max(0, Math.round(calories || 0)),
    protein: Math.max(0, roundTo(protein || 0)),
    carbs: Math.max(0, roundTo(carbs || 0)),
    fat: Math.max(0, roundTo(fat || 0)),
    fiber: Math.max(0, roundTo(fiber || 0)),
    sugar: Math.max(0, roundTo(sugar || 0)),
    satFat: 0,
  }
}

function recalculateTotalsFromItems(items: any[] | null | undefined): EntryTotals | null {
  if (!Array.isArray(items) || items.length === 0) return null

  const totals = {
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    fiber: 0,
    sugar: 0,
    satFat: 0,
  }

  for (const item of items) {
    const servingsRaw = Number(item?.servings)
    const servings = Number.isFinite(servingsRaw) && servingsRaw > 0 ? servingsRaw : 1
    const multRaw = Number(item?.macroMultiplier ?? item?.multiplier)
    const multiplier = Number.isFinite(multRaw) && multRaw > 0 ? multRaw : 1
    const factor = servings * multiplier

    const protein = Math.max(0, Number(item?.protein_g ?? item?.protein) || 0)
    const carbs = Math.max(0, Number(item?.carbs_g ?? item?.carbs) || 0)
    const fat = Math.max(0, Number(item?.fat_g ?? item?.fat) || 0)
    const fiber = Math.max(0, Number(item?.fiber_g ?? item?.fiber) || 0)
    const sugar = Math.max(0, Number(item?.sugar_g ?? item?.sugar) || 0)
    const satFat = Math.max(0, Number(item?.saturated_fat_g ?? item?.saturatedFat) || 0)

    const macroCalories = protein * 4 + carbs * 4 + fat * 9
    const rawCalories = Number(item?.calories ?? item?.calories_kcal)
    const calories = Number.isFinite(rawCalories) && rawCalories > 0 ? rawCalories : macroCalories

    totals.calories += calories * factor
    totals.protein += protein * factor
    totals.carbs += carbs * factor
    totals.fat += fat * factor
    totals.fiber += fiber * factor
    totals.sugar += sugar * factor
    totals.satFat += satFat * factor
  }

  return {
    calories: Math.max(0, Math.round(totals.calories)),
    protein: Math.max(0, roundTo(totals.protein)),
    carbs: Math.max(0, roundTo(totals.carbs)),
    fat: Math.max(0, roundTo(totals.fat)),
    fiber: Math.max(0, roundTo(totals.fiber)),
    sugar: Math.max(0, roundTo(totals.sugar)),
    satFat: Math.max(0, roundTo(totals.satFat)),
  }
}

function normalizeFoodApiEntry(raw: any): FoodEntry {
  const itemsTotals = recalculateTotalsFromItems(raw?.items)
  const storedTotals = sanitizeEntryTotals(raw?.nutrients || raw?.nutrition || raw?.total)
  const parsedTotals = extractTotalsFromDescriptionText(raw?.description || raw?.name || '')

  let pickedTotals: EntryTotals | null = null
  if (hasNonZeroEntryTotals(itemsTotals)) pickedTotals = itemsTotals
  else if (storedTotals && hasNonZeroEntryTotals(storedTotals)) pickedTotals = storedTotals
  else pickedTotals = parsedTotals || storedTotals || itemsTotals

  const normalized = pickedTotals || {
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    fiber: 0,
    sugar: 0,
    satFat: 0,
  }

  const macroCalories = normalized.protein * 4 + normalized.carbs * 4 + normalized.fat * 9
  if (normalized.calories <= 0 && macroCalories > 0) {
    normalized.calories = Math.round(macroCalories)
  }

  const rawName = String(raw?.name || '').trim()
  const descName = String(raw?.description || '')
    .split('\n')[0]
    .split(',')[0]
    .trim()
  const cleanName =
    rawName && rawName.toLowerCase() !== 'food item'
      ? rawName
      : descName || rawName || 'Food item'

  return {
    id: String(raw?.id || `food-${Date.now()}-${Math.random().toString(16).slice(2)}`),
    name: cleanName,
    meal: String(raw?.meal || raw?.category || 'uncategorized').toLowerCase(),
    category: raw?.category ? String(raw.category) : null,
    description: raw?.description ? String(raw.description) : null,
    localDate: raw?.localDate ? String(raw.localDate) : null,
    nutrients: {
      calories: normalized.calories,
      protein: normalized.protein,
      carbs: normalized.carbs,
      fat: normalized.fat,
      fiber: normalized.fiber,
      sugar: normalized.sugar,
      saturatedFat: normalized.satFat,
    },
    items: Array.isArray(raw?.items) ? raw.items : null,
    createdAt: String(raw?.createdAt || new Date().toISOString()),
  }
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

function toOptionalPositive(value: any) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return null
  return n
}

function normalizeMacroSplit(raw: any) {
  if (!raw || typeof raw !== 'object') return null

  let proteinPct = Number(raw?.proteinPct)
  let carbPct = Number(raw?.carbPct)
  let fatPct = Number(raw?.fatPct)

  if (!Number.isFinite(proteinPct) && !Number.isFinite(carbPct) && !Number.isFinite(fatPct)) {
    return null
  }

  proteinPct = Number.isFinite(proteinPct) ? proteinPct : 0
  carbPct = Number.isFinite(carbPct) ? carbPct : 0
  fatPct = Number.isFinite(fatPct) ? fatPct : 0

  if (proteinPct > 1 || carbPct > 1 || fatPct > 1) {
    proteinPct /= 100
    carbPct /= 100
    fatPct /= 100
  }

  const total = proteinPct + carbPct + fatPct
  if (!Number.isFinite(total) || total <= 0) return null

  return {
    proteinPct: proteinPct / total,
    carbPct: carbPct / total,
    fatPct: fatPct / total,
  }
}

function buildDailyTargetsFromUserData(raw: any): DailyTargets {
  const source = raw?.data || raw || {}

  const defaultProteinCal = DEFAULT_TARGETS.protein * 4
  const defaultCarbCal = DEFAULT_TARGETS.carbs * 4
  const defaultFatCal = DEFAULT_TARGETS.fat * 9
  const defaultTotalMacroCal = defaultProteinCal + defaultCarbCal + defaultFatCal
  const defaultSplit = {
    proteinPct: defaultProteinCal / defaultTotalMacroCal,
    carbPct: defaultCarbCal / defaultTotalMacroCal,
    fatPct: defaultFatCal / defaultTotalMacroCal,
  }

  const calories = toOptionalPositive(source?.goalCalorieTarget) || DEFAULT_TARGETS.calories
  const split = normalizeMacroSplit(source?.goalMacroSplit) || defaultSplit

  const protein = Math.max(0, Math.round((calories * split.proteinPct) / 4))
  const carbs = Math.max(0, Math.round((calories * split.carbPct) / 4))
  const fat = Math.max(0, Math.round((calories * split.fatPct) / 9))

  const fiber = Math.max(0, Math.round(toOptionalPositive(source?.goalFiberTarget) || DEFAULT_TARGETS.fiber))
  const sugar = Math.max(0, Math.round(toOptionalPositive(source?.goalSugarMax) || DEFAULT_TARGETS.sugar))

  return {
    calories,
    protein,
    carbs,
    fat,
    fiber,
    sugar,
  }
}

function formatMacroAmount(value: number) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || Math.abs(numeric) < 0.0001) return '0'
  const abs = Math.abs(numeric)
  const decimals = abs < 0.1 ? 2 : abs < 1 ? 1 : abs < 10 ? 1 : 0
  const fixed = numeric.toFixed(decimals)
  return fixed.replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1')
}

function mealLabel(meal: string) {
  const found = MEALS.find((m) => m.key === meal)
  return found ? found.label : 'Uncategorized'
}

function formatCalories(value: number, unit: 'kcal' | 'kj') {
  if (unit === 'kj') {
    return `${Math.round(value * 4.184)} kJ`
  }
  return `${Math.round(value)} kcal`
}

function formatClockTime(raw?: string | null) {
  if (!raw) return ''
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

function makeFavoriteFromEntry(entry: FoodEntry): FavoriteMeal {
  const nutrients = entry.nutrients || {}
  return {
    id: `fav-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: String(entry.name || 'Saved meal').trim(),
    meal: String(entry.meal || 'uncategorized'),
    description: String(entry.description || ''),
    nutrients: {
      calories: readNutrient(nutrients, ['calories', 'calories_kcal']),
      protein: readNutrient(nutrients, ['protein', 'protein_g']),
      carbs: readNutrient(nutrients, ['carbs', 'carbs_g']),
      fat: readNutrient(nutrients, ['fat', 'fat_g']),
      fiber: readNutrient(nutrients, ['fiber', 'fiber_g']),
      sugar: readNutrient(nutrients, ['sugar', 'sugar_g']),
    },
    custom: false,
  }
}

export function TrackCaloriesScreen() {
  const navigation = useNavigation<any>()
  const { mode, session, signOut } = useAppMode()

  const authHeaders = useMemo(() => {
    if (mode !== 'signedIn' || !session?.token) return null
    return buildNativeAuthHeaders(session.token, { includeCookie: true })
  }, [mode, session?.token])

  const [selectedDate, setSelectedDate] = useState(formatLocalDate())
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [energyUnit, setEnergyUnit] = useState<'kcal' | 'kj'>('kcal')
  const [dailyTargets, setDailyTargets] = useState<DailyTargets>(DEFAULT_TARGETS)
  const [summarySlideIndex, setSummarySlideIndex] = useState(0)
  const summarySwipeStartRef = useRef<{ x: number; y: number } | null>(null)
  const entrySwipeMetaRef = useRef<Record<string, { startX: number; startY: number; swiping: boolean; hasMoved: boolean }>>({})
  const entrySwipeBlockPressRef = useRef<Record<string, boolean>>({})
  const loadRequestIdRef = useRef(0)
  const ingredientSearchRequestIdRef = useRef(0)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [entries, setEntries] = useState<FoodEntry[]>([])
  const [waterEntries, setWaterEntries] = useState<WaterEntry[]>([])
  const [exerciseEntries, setExerciseEntries] = useState<ExerciseEntry[]>([])
  const [exerciseCalories, setExerciseCalories] = useState(0)
  const [creditsRemaining, setCreditsRemaining] = useState<number | null>(null)
  const [creditsPercentUsed, setCreditsPercentUsed] = useState(0)
  const [foodAnalysisUsageCount, setFoodAnalysisUsageCount] = useState(0)
  const [foodAnalysisUsageLabel, setFoodAnalysisUsageLabel] = useState<'monthly' | 'total'>('monthly')
  const [foodAnalysisCostPerUse, setFoodAnalysisCostPerUse] = useState(10)

  const [entryMenu, setEntryMenu] = useState<FoodEntry | null>(null)
  const [entrySwipeOffsets, setEntrySwipeOffsets] = useState<Record<string, number>>({})
  const [swipeMenuEntryId, setSwipeMenuEntryId] = useState<string | null>(null)
  const [moveEntryTarget, setMoveEntryTarget] = useState<FoodEntry | null>(null)
  const [moveEntryMeal, setMoveEntryMeal] = useState('breakfast')
  const [sectionMenuMeal, setSectionMenuMeal] = useState<string | null>(null)
  const [topAddCategoryOpen, setTopAddCategoryOpen] = useState(false)
  const [topAddOptionsOpen, setTopAddOptionsOpen] = useState(false)
  const [topAddMeal, setTopAddMeal] = useState('breakfast')
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const [accountName, setAccountName] = useState('User')
  const [accountEmail, setAccountEmail] = useState('')
  const [accountImage, setAccountImage] = useState<string | null>(null)
  const [expandedMeals, setExpandedMeals] = useState<Record<string, boolean>>({
    breakfast: true,
    lunch: true,
    dinner: false,
    snacks: false,
    uncategorized: false,
  })

  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<FoodEntry | null>(null)
  const [editName, setEditName] = useState('')
  const [editMeal, setEditMeal] = useState('breakfast')
  const [editCalories, setEditCalories] = useState('')
  const [editProtein, setEditProtein] = useState('')
  const [editCarbs, setEditCarbs] = useState('')
  const [editFat, setEditFat] = useState('')
  const [editFiber, setEditFiber] = useState('')
  const [editSugar, setEditSugar] = useState('')

  const [favorites, setFavorites] = useState<FavoriteMeal[]>([])
  const [favoritesOpen, setFavoritesOpen] = useState(false)
  const [favoritesTab, setFavoritesTab] = useState<'all' | 'favorites' | 'custom'>('all')
  const [favoritesSearch, setFavoritesSearch] = useState('')
  const [favoritesTargetMeal, setFavoritesTargetMeal] = useState('breakfast')

  const [ingredientOpen, setIngredientOpen] = useState(false)
  const [ingredientTargetMeal, setIngredientTargetMeal] = useState('breakfast')
  const [ingredientKind, setIngredientKind] = useState<'single' | 'packaged'>('packaged')
  const [ingredientQuery, setIngredientQuery] = useState('')
  const [ingredientLoading, setIngredientLoading] = useState(false)
  const [ingredientError, setIngredientError] = useState('')
  const [ingredientResults, setIngredientResults] = useState<SearchFoodItem[]>([])

  const [barcodeOpen, setBarcodeOpen] = useState(false)
  const [barcodeTargetMeal, setBarcodeTargetMeal] = useState('breakfast')
  const [barcodeCode, setBarcodeCode] = useState('')
  const [barcodeLoading, setBarcodeLoading] = useState(false)
  const [barcodeFood, setBarcodeFood] = useState<SearchFoodItem | null>(null)
  const [barcodeFlashOn, setBarcodeFlashOn] = useState(false)
  const [barcodeLabelOpen, setBarcodeLabelOpen] = useState(false)
  const [barcodeLabelName, setBarcodeLabelName] = useState('')
  const [barcodeLabelBrand, setBarcodeLabelBrand] = useState('')
  const [barcodeLabelServing, setBarcodeLabelServing] = useState('')
  const [barcodeLabelCalories, setBarcodeLabelCalories] = useState('')
  const [barcodeLabelProtein, setBarcodeLabelProtein] = useState('')
  const [barcodeLabelCarbs, setBarcodeLabelCarbs] = useState('')
  const [barcodeLabelFat, setBarcodeLabelFat] = useState('')
  const [barcodeLabelFiber, setBarcodeLabelFiber] = useState('')
  const [barcodeLabelSugar, setBarcodeLabelSugar] = useState('')

  const [recommendedOpen, setRecommendedOpen] = useState(false)
  const [recommendedLoading, setRecommendedLoading] = useState(false)
  const [recommendedTab, setRecommendedTab] = useState<'ingredients' | 'recipe' | 'reason'>('ingredients')
  const [recommendedTargetMeal, setRecommendedTargetMeal] = useState('lunch')
  const [recommendedMeal, setRecommendedMeal] = useState<RecommendedMeal | null>(null)
  const [recommendedHistory, setRecommendedHistory] = useState<RecommendedMeal[]>([])
  const [recommendedCostCredits, setRecommendedCostCredits] = useState(0)
  const [recommendedExplainOpen, setRecommendedExplainOpen] = useState(false)
  const [recommendedExplainSeen, setRecommendedExplainSeen] = useState(false)

  const [copyMode, setCopyMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [copiedEntries, setCopiedEntries] = useState<FoodEntry[]>([])

  const [combineOpen, setCombineOpen] = useState(false)
  const [combineTargetMeal, setCombineTargetMeal] = useState('lunch')
  const [combineName, setCombineName] = useState('')
  const [combineIds, setCombineIds] = useState<string[]>([])

  const [waterEditOpen, setWaterEditOpen] = useState(false)
  const [waterEditId, setWaterEditId] = useState('')
  const [waterEditAmount, setWaterEditAmount] = useState('')
  const [waterEditUnit, setWaterEditUnit] = useState<'ml' | 'l' | 'oz'>('ml')

  const [exerciseOpen, setExerciseOpen] = useState(false)
  const [exerciseEditId, setExerciseEditId] = useState<string | null>(null)
  const [exerciseTypes, setExerciseTypes] = useState<ExerciseType[]>([])
  const [exerciseTypeSearch, setExerciseTypeSearch] = useState('')
  const [exerciseCategoryFilter, setExerciseCategoryFilter] = useState('')
  const [exerciseTypeId, setExerciseTypeId] = useState<number | null>(null)
  const [exerciseDuration, setExerciseDuration] = useState('30')
  const [exerciseDistance, setExerciseDistance] = useState('')
  const [exerciseDistanceUnit, setExerciseDistanceUnit] = useState<'km' | 'mi'>('km')
  const [exerciseStartTime, setExerciseStartTime] = useState('')
  const [exerciseCaloriesPreview, setExerciseCaloriesPreview] = useState<number | null>(null)
  const [exerciseCaloriesOverride, setExerciseCaloriesOverride] = useState('')

  const profileInitial = useMemo(() => {
    const source = String(accountName || accountEmail || session?.user?.name || session?.user?.email || 'U').trim()
    return source ? source.charAt(0).toUpperCase() : 'U'
  }, [accountEmail, accountName, session?.user?.email, session?.user?.name])

  const groupedByMeal = useMemo(() => {
    const map: Record<string, FoodEntry[]> = {
      breakfast: [],
      lunch: [],
      dinner: [],
      snacks: [],
      uncategorized: [],
    }
    for (const entry of entries) {
      const key = String(entry.meal || entry.category || 'uncategorized').toLowerCase()
      if (!map[key]) map.uncategorized.push(entry)
      else map[key].push(entry)
    }
    return map
  }, [entries])

  const totals = useMemo(() => {
    const all = entries.reduce(
      (acc, entry) => {
        const n = entry.nutrients || {}
        acc.calories += readNutrient(n, ['calories', 'calories_kcal'])
        acc.protein += readNutrient(n, ['protein', 'protein_g'])
        acc.carbs += readNutrient(n, ['carbs', 'carbs_g'])
        acc.fat += readNutrient(n, ['fat', 'fat_g'])
        acc.fiber += readNutrient(n, ['fiber', 'fiber_g'])
        acc.sugar += readNutrient(n, ['sugar', 'sugar_g'])
        acc.satFat += readNutrient(n, ['saturatedFat', 'saturated_fat_g'])
        return acc
      },
      { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0, satFat: 0 },
    )

    const healthyFat = Math.max(0, all.fat - all.satFat)

    return {
      calories: Math.round(all.calories),
      protein: round1(all.protein),
      carbs: round1(all.carbs),
      fat: round1(all.fat),
      fiber: round1(all.fiber),
      sugar: round1(all.sugar),
      satFat: round1(all.satFat),
      healthyFat: round1(healthyFat),
    }
  }, [entries])

  const sectionMacroTotals = useMemo(() => {
    const next: Record<
      string,
      { calories: number; protein: number; carbs: number; fat: number }
    > = {}
    for (const meal of MEALS) {
      const base = { calories: 0, protein: 0, carbs: 0, fat: 0 }
      for (const entry of groupedByMeal[meal.key]) {
        const nutrients = entry.nutrients || {}
        base.calories += readNutrient(nutrients, ['calories', 'calories_kcal'])
        base.protein += readNutrient(nutrients, ['protein', 'protein_g'])
        base.carbs += readNutrient(nutrients, ['carbs', 'carbs_g'])
        base.fat += readNutrient(nutrients, ['fat', 'fat_g'])
      }
      next[meal.key] = {
        calories: Math.round(base.calories),
        protein: round1(base.protein),
        carbs: round1(base.carbs),
        fat: round1(base.fat),
      }
    }
    return next
  }, [groupedByMeal])

  const macroTargetsWithExercise = useMemo(() => {
    const base = {
      protein: Math.max(0, dailyTargets.protein),
      carbs: Math.max(0, dailyTargets.carbs),
      fat: Math.max(0, dailyTargets.fat),
      fiber: Math.max(0, dailyTargets.fiber),
      sugar: Math.max(0, dailyTargets.sugar),
    }

    const extraCalories = Math.max(0, Number(exerciseCalories) || 0)
    if (extraCalories <= 0) return base

    const proteinCals = base.protein * 4
    const carbCals = base.carbs * 4
    const fatCals = base.fat * 9
    const totalMacroCals = proteinCals + carbCals + fatCals
    if (totalMacroCals <= 0) return base

    const proteinShare = proteinCals / totalMacroCals
    const carbShare = carbCals / totalMacroCals
    const fatShare = fatCals / totalMacroCals

    return {
      ...base,
      protein: round1(base.protein + (extraCalories * proteinShare) / 4),
      carbs: round1(base.carbs + (extraCalories * carbShare) / 4),
      fat: round1(base.fat + (extraCalories * fatShare) / 9),
    }
  }, [dailyTargets, exerciseCalories])

  const fatSplit = useMemo(() => {
    const totalFat = Math.max(0, totals.fat)
    const bad = clamp(Math.max(0, totals.satFat), 0, totalFat)
    const good = clamp(Math.max(0, totals.healthyFat), 0, totalFat - bad)
    const unclear = Math.max(0, round1(totalFat - good - bad))
    return {
      good: round1(good),
      bad: round1(bad),
      unclear,
    }
  }, [totals.fat, totals.healthyFat, totals.satFat])

  const usedKcal = useMemo(() => {
    const macroCalories = totals.protein * 4 + totals.carbs * 4 + totals.fat * 9
    if (Number.isFinite(macroCalories) && macroCalories > 0) {
      return Math.max(0, Math.round(macroCalories))
    }
    return Math.max(0, Math.round(totals.calories))
  }, [totals.calories, totals.carbs, totals.fat, totals.protein])

  const dailyAllowanceKcal = useMemo(() => {
    return Math.max(0, Math.round(dailyTargets.calories + Math.max(0, exerciseCalories)))
  }, [dailyTargets.calories, exerciseCalories])

  const remainingKcal = useMemo(() => {
    return Math.max(0, Math.round(dailyAllowanceKcal - usedKcal))
  }, [dailyAllowanceKcal, usedKcal])

  const macroRows = useMemo(
    () => [
      {
        key: 'protein',
        label: 'Protein',
        consumed: totals.protein,
        target: macroTargetsWithExercise.protein,
        unit: 'g',
        color: '#EF4444',
      },
      {
        key: 'carbs',
        label: 'Carbs',
        consumed: totals.carbs,
        target: macroTargetsWithExercise.carbs,
        unit: 'g',
        color: '#22C55E',
      },
      {
        key: 'fat',
        label: 'Fat',
        consumed: totals.fat,
        target: macroTargetsWithExercise.fat,
        unit: 'g',
        color: '#6366F1',
      },
      {
        key: 'fiber',
        label: 'Fibre',
        consumed: totals.fiber,
        target: macroTargetsWithExercise.fiber,
        unit: 'g',
        color: '#12ADC9',
      },
      {
        key: 'sugar',
        label: 'Sugar',
        consumed: totals.sugar,
        target: macroTargetsWithExercise.sugar,
        unit: 'g',
        color: '#F97316',
      },
    ],
    [macroTargetsWithExercise, totals.carbs, totals.fat, totals.fiber, totals.protein, totals.sugar],
  )

  const creditsBarPercent = useMemo(() => {
    return clamp(100 - creditsPercentUsed, 0, 100)
  }, [creditsPercentUsed])

  const favoritesForList = useMemo(() => {
    const byNameMap = new Map<string, FavoriteMeal>()

    favorites.forEach((item) => {
      byNameMap.set(`${item.name.toLowerCase()}::${item.meal}`, item)
    })

    entries.forEach((entry) => {
      const fav = makeFavoriteFromEntry(entry)
      const key = `${fav.name.toLowerCase()}::${fav.meal}`
      if (!byNameMap.has(key)) byNameMap.set(key, fav)
    })

    let list = Array.from(byNameMap.values())

    if (favoritesTab === 'favorites') {
      list = list.filter((item) => favorites.some((f) => f.id === item.id))
    }
    if (favoritesTab === 'custom') {
      list = list.filter((item) => item.custom || (Array.isArray(item.ingredients) && item.ingredients.length > 1))
    }

    const query = favoritesSearch.trim().toLowerCase()
    if (query) {
      list = list.filter((item) => item.name.toLowerCase().includes(query))
    }

    return [...list].sort((a, b) => {
      const byName = compareLabelAz(a.name, b.name)
      if (byName !== 0) return byName
      return compareLabelAz(a.meal, b.meal)
    })
  }, [entries, favorites, favoritesSearch, favoritesTab])

  const buildAddMenuActions = useCallback(
    (meal: string) => {
      const entriesForMeal = groupedByMeal[meal] || []
      const actions: Array<{
        id: string
        action: string
        title: string
        subtitle: string
        icon: string
        iconBg: string
        iconColor: string
      }> = [
        {
          id: 'photo',
          action: 'Photo Library',
          title: 'Photo Library / Camera',
          subtitle: 'Capture or pick a photo of your food',
          icon: '📷',
          iconBg: '#DBEAFE',
          iconColor: '#2563EB',
        },
        {
          id: 'favorites',
          action: 'Favorites',
          title: 'Favorites',
          subtitle: `Insert a saved meal in ${mealLabel(meal).toLowerCase()}`,
          icon: '★',
          iconBg: '#FEF3C7',
          iconColor: '#D97706',
        },
        {
          id: 'recommended',
          action: 'Recommended',
          title: 'Recommended',
          subtitle: `AI meal suggestion • ${foodAnalysisCostPerUse} credits`,
          icon: '◔',
          iconBg: '#F3E8FF',
          iconColor: '#7C3AED',
        },
      ]

      if (!isToday(selectedDate) && entriesForMeal.length > 0) {
        actions.push({
          id: 'copy-to-today',
          action: 'Copy category to Today',
          title: `Copy ${mealLabel(meal)} to Today`,
          subtitle: `Duplicate all ${mealLabel(meal)} entries onto today`,
          icon: '+',
          iconBg: '#ECFDF5',
          iconColor: '#059669',
        })
      }

      if (entriesForMeal.length > 1) {
        actions.push({
          id: 'copy-multi',
          action: 'Copy multiple items',
          title: 'Copy multiple items',
          subtitle: `Choose which ${mealLabel(meal)} items to copy`,
          icon: 'Ⅲ',
          iconBg: '#DDE4FF',
          iconColor: '#4F46E5',
        })
      }

      if (copiedEntries.length > 0) {
        actions.push({
          id: 'paste',
          action: 'Paste items',
          title: 'Paste items',
          subtitle: `Paste ${copiedEntries.length} copied item${copiedEntries.length === 1 ? '' : 's'}`,
          icon: '⎘',
          iconBg: '#EDE9FE',
          iconColor: '#6D28D9',
        })
        actions.push({
          id: 'clear-paste',
          action: 'Clear copied items',
          title: 'Clear copied items',
          subtitle: 'Remove items from the clipboard',
          icon: '−',
          iconBg: '#F3F4F6',
          iconColor: '#374151',
        })
      }

      actions.push(
        {
          id: 'barcode',
          action: 'Barcode Scanner',
          title: 'Barcode Scanner',
          subtitle: 'Scan packaged foods',
          icon: 'Ⅲ',
          iconBg: '#E0E7FF',
          iconColor: '#4F46E5',
        },
        {
          id: 'ingredient',
          action: 'Add ingredient',
          title: 'Add ingredient',
          subtitle: 'Search a database and add one item',
          icon: '+',
          iconBg: '#DCFCE7',
          iconColor: '#16A34A',
        },
        {
          id: 'build',
          action: 'Build a meal',
          title: 'Build a meal',
          subtitle: 'Combine multiple ingredients into one entry',
          icon: '≡',
          iconBg: '#D1FAE5',
          iconColor: '#047857',
        },
        {
          id: 'import',
          action: 'Import Recipe',
          title: 'Import Recipe',
          subtitle: 'Import by URL (10 credits) or photo (15 credits)',
          icon: '⇵',
          iconBg: '#D1FAE5',
          iconColor: '#047857',
        },
        {
          id: 'water',
          action: 'Log Water Intake',
          title: 'Log Water Intake',
          subtitle: 'Add water, tea, coffee, or bottle sizes',
          icon: '◍',
          iconBg: '#DBEAFE',
          iconColor: '#0284C7',
        },
      )

      if (entriesForMeal.length > 1) {
        actions.push({
          id: 'combine',
          action: 'Combine ingredients',
          title: 'Combine ingredients',
          subtitle: 'Pick existing foods and combine into one meal',
          icon: '≡',
          iconBg: '#D1FAE5',
          iconColor: '#047857',
        })
      }

      return actions
    },
    [copiedEntries.length, foodAnalysisCostPerUse, groupedByMeal, selectedDate],
  )

  const sectionMenuActions = useMemo(
    () => buildAddMenuActions(sectionMenuMeal || 'breakfast'),
    [buildAddMenuActions, sectionMenuMeal],
  )

  const topAddMenuActions = useMemo(
    () => buildAddMenuActions(topAddMeal || 'breakfast'),
    [buildAddMenuActions, topAddMeal],
  )

  const loadFavorites = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(FAVORITES_KEY)
      if (!raw) {
        setFavorites([])
        return
      }
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) setFavorites(parsed)
      else setFavorites([])
    } catch {
      setFavorites([])
    }
  }, [])

  const saveFavorites = useCallback(async (next: FavoriteMeal[]) => {
    setFavorites(next)
    try {
      await AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(next))
    } catch {}
  }, [])

  const loadRecommendedExplainSeen = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(RECOMMENDED_EXPLAIN_KEY)
      setRecommendedExplainSeen(raw === '1')
    } catch {
      setRecommendedExplainSeen(false)
    }
  }, [])

  const markRecommendedExplainSeen = useCallback(async () => {
    setRecommendedExplainSeen(true)
    try {
      await AsyncStorage.setItem(RECOMMENDED_EXPLAIN_KEY, '1')
    } catch {}
  }, [])

  const loadExerciseTypes = useCallback(async () => {
    if (!authHeaders) return
    try {
      const params = new URLSearchParams()
      if (exerciseTypeSearch.trim()) params.set('search', exerciseTypeSearch.trim())
      if (exerciseCategoryFilter.trim()) params.set('category', exerciseCategoryFilter.trim())
      params.set('limit', '50')

      const res = await fetch(`${API_BASE_URL}/api/exercise-types?${params.toString()}`, {
        headers: authHeaders,
      })
      if (!res.ok) return
      const data: any = await res.json().catch(() => ({}))
      const items = Array.isArray(data?.items) ? data.items : []
      setExerciseTypes(items)
    } catch {}
  }, [authHeaders, exerciseCategoryFilter, exerciseTypeSearch])

  const loadAll = useCallback(async () => {
    if (!authHeaders || !session?.token) {
      setLoading(false)
      return
    }

    const requestId = ++loadRequestIdRef.current
    const isCurrentRequest = () => requestId === loadRequestIdRef.current

    setLoading(true)
    try {
      const tzOffsetMin = new Date().getTimezoneOffset()
      const foodPromise = fetch(
        `${API_BASE_URL}/api/food-log?date=${encodeURIComponent(selectedDate)}&tz=${encodeURIComponent(String(tzOffsetMin))}&t=${Date.now()}`,
        {
        headers: authHeaders,
        },
      )
      const waterPromise = fetch(`${API_BASE_URL}/api/native-water-log?localDate=${selectedDate}`, {
        headers: authHeaders,
      })
      const exercisePromise = fetch(`${API_BASE_URL}/api/exercise-entries?date=${selectedDate}`, {
        headers: authHeaders,
      })
      const creditPromise = fetch(`${API_BASE_URL}/api/credit/status`, {
        headers: buildNativeAuthHeaders(session.token),
      })
      const featureUsagePromise = fetch(`${API_BASE_URL}/api/credit/feature-usage?feature=foodAnalysis`, {
        headers: buildNativeAuthHeaders(session.token, { includeCookie: true }),
      })
      const userDataPromise = fetch(`${API_BASE_URL}/api/user-data`, {
        headers: buildNativeAuthHeaders(session.token, { includeCookie: true }),
      })

      const [foodRes, waterRes, exerciseRes] = await Promise.all([foodPromise, waterPromise, exercisePromise])

      const foodData: any = await foodRes.json().catch(() => ({}))
      if (!isCurrentRequest()) return
      if (foodRes.ok) {
        const logs = Array.isArray(foodData?.logs)
          ? foodData.logs
          : Array.isArray(foodData?.entries)
            ? foodData.entries
            : []
        setEntries(logs.map((entry: any) => normalizeFoodApiEntry(entry)))
      } else {
        setEntries([])
      }

      const waterData: any = await waterRes.json().catch(() => ({}))
      if (!isCurrentRequest()) return
      if (waterRes.ok) {
        setWaterEntries(Array.isArray(waterData?.entries) ? waterData.entries : [])
      } else {
        setWaterEntries([])
      }

      const exerciseData: any = await exerciseRes.json().catch(() => ({}))
      if (!isCurrentRequest()) return
      if (exerciseRes.ok) {
        setExerciseEntries(Array.isArray(exerciseData?.entries) ? exerciseData.entries : [])
        setExerciseCalories(Math.round(numberOrZero(exerciseData?.exerciseCalories)))
      } else {
        setExerciseEntries([])
        setExerciseCalories(0)
      }

      if (isCurrentRequest()) {
        setLoading(false)
      }

      const [creditRes, featureUsageRes, userDataRes] = await Promise.all([
        creditPromise,
        featureUsagePromise,
        userDataPromise,
      ])

      const creditData: any = await creditRes.json().catch(() => ({}))
      if (!isCurrentRequest()) return
      if (creditRes.ok) {
        const total = Number(creditData?.credits?.total)
        setCreditsRemaining(Number.isFinite(total) ? Math.max(0, Math.round(total)) : null)
        const percent = Number(creditData?.percentUsed)
        setCreditsPercentUsed(Number.isFinite(percent) ? clamp(percent, 0, 100) : 0)
      } else {
        setCreditsRemaining(null)
        setCreditsPercentUsed(0)
      }

      const featureUsageData: any = await featureUsageRes.json().catch(() => ({}))
      if (!isCurrentRequest()) return
      const foodUsage = featureUsageData?.featureUsage?.foodAnalysis || {}
      const usageCount = Number(foodUsage?.count)
      const usageCost = Number(foodUsage?.costPerUse)
      const usageLabel = String(foodUsage?.label || '').toLowerCase() === 'total' ? 'total' : 'monthly'
      setFoodAnalysisUsageCount(Number.isFinite(usageCount) ? Math.max(0, Math.round(usageCount)) : 0)
      setFoodAnalysisCostPerUse(Number.isFinite(usageCost) ? Math.max(0, Math.round(usageCost)) : 10)
      setFoodAnalysisUsageLabel(usageLabel)
      if (!featureUsageRes.ok) {
        setFoodAnalysisUsageCount(0)
        setFoodAnalysisCostPerUse(10)
        setFoodAnalysisUsageLabel('monthly')
      }

      const userData: any = await userDataRes.json().catch(() => ({}))
      if (!isCurrentRequest()) return
      if (userDataRes.ok) {
        setDailyTargets(buildDailyTargetsFromUserData(userData))
      } else {
        setDailyTargets(DEFAULT_TARGETS)
      }
    } catch (error: any) {
      Alert.alert('Could not load Food Diary', error?.message || 'Please try again.')
    } finally {
      if (requestId === loadRequestIdRef.current) {
        setLoading(false)
      }
    }
  }, [authHeaders, selectedDate, session?.token])

  useEffect(() => {
    void loadFavorites()
    void loadRecommendedExplainSeen()
  }, [loadFavorites, loadRecommendedExplainSeen])

  useEffect(() => {
    setAccountName(String(session?.user?.name || session?.user?.email?.split('@')[0] || 'User'))
    setAccountEmail(String(session?.user?.email || ''))
    setAccountImage(typeof session?.user?.image === 'string' && session.user.image ? session.user.image : null)
  }, [session?.user?.email, session?.user?.image, session?.user?.name])

  useFocusEffect(
    useCallback(() => {
      setEntryMenu(null)
      setSwipeMenuEntryId(null)
      setSectionMenuMeal(null)
      setTopAddCategoryOpen(false)
      setTopAddOptionsOpen(false)
      setProfileMenuOpen(false)
      setEditModalOpen(false)
      setFavoritesOpen(false)
      setIngredientOpen(false)
      setBarcodeOpen(false)
      setBarcodeLabelOpen(false)
      setRecommendedOpen(false)
      setRecommendedExplainOpen(false)
      setCombineOpen(false)
      setWaterEditOpen(false)
      setExerciseOpen(false)
      void loadAll()
      return () => {}
    }, [loadAll]),
  )

  useEffect(() => {
    if (mode !== 'signedIn' || !session?.token) return
    void loadAll()
  }, [loadAll, mode, selectedDate, session?.token])

  useEffect(() => {
    if (!exerciseOpen) return
    void loadExerciseTypes()
  }, [exerciseOpen, loadExerciseTypes])

  useEffect(() => {
    const next: Record<string, boolean> = {}
    for (const meal of MEALS) {
      next[meal.key] = (groupedByMeal[meal.key] || []).length > 0
    }
    setExpandedMeals(next)
  }, [groupedByMeal, selectedDate])

  const onDateChange = (_event: DateTimePickerEvent, pickedDate?: Date) => {
    setShowDatePicker(false)
    if (!pickedDate) return
    setSelectedDate(formatLocalDate(pickedDate))
  }

  const createFoodEntry = useCallback(
    async (payload: {
      name: string
      meal: string
      calories: number
      protein: number
      carbs: number
      fat: number
      fiber?: number
      sugar?: number
      description?: string
      localDate?: string
    }) => {
      if (!authHeaders) return false
      const name = String(payload.name || '').trim()
      if (!name) return false

      const totals = {
        calories: Math.max(0, Math.round(payload.calories)),
        protein: Math.max(0, roundTo(payload.protein)),
        carbs: Math.max(0, roundTo(payload.carbs)),
        fat: Math.max(0, roundTo(payload.fat)),
        fiber: Math.max(0, roundTo(payload.fiber || 0)),
        sugar: Math.max(0, roundTo(payload.sugar || 0)),
      }
      const descriptionRaw = String(payload.description || '').trim()
      const description = descriptionRaw ? `${name}, ${descriptionRaw}` : name

      const res = await fetch(`${API_BASE_URL}/api/food-log`, {
        method: 'POST',
        headers: buildNativeAuthHeaders(session?.token || '', { json: true, includeCookie: true }),
        body: JSON.stringify({
          localDate: payload.localDate || selectedDate,
          meal: payload.meal,
          category: payload.meal,
          description,
          nutrition: totals,
          total: totals,
        }),
      })
      return res.ok
    },
    [authHeaders, selectedDate, session?.token],
  )

  const deleteFoodEntry = useCallback(
    async (entryId: string) => {
      if (!authHeaders) return false

      const tryDelete = async (path: string, body: any) => {
        const res = await fetch(`${API_BASE_URL}${path}`, {
          method: 'POST',
          headers: buildNativeAuthHeaders(session?.token || '', { json: true, includeCookie: true }),
          body: JSON.stringify(body),
        })
        return res.ok
      }

      const okSimple = await tryDelete('/api/food-log/delete', { id: entryId })
      if (okSimple) return true

      const okAtomic = await tryDelete('/api/food-log/delete-atomic', {
        id: entryId,
        snapshotDate: selectedDate,
        dates: [selectedDate],
      })
      return okAtomic
    },
    [authHeaders, selectedDate, session?.token],
  )

  const closeEntrySwipeMenus = useCallback(() => {
    setSwipeMenuEntryId(null)
    setEntrySwipeOffsets({})
  }, [])

  const handleEntryDelete = async (entry: FoodEntry) => {
    setEntryMenu(null)
    closeEntrySwipeMenus()
    const ok = await deleteFoodEntry(entry.id)
    if (!ok) {
      Alert.alert('Delete failed', 'Could not delete this entry.')
      return
    }
    await loadAll()
  }

  const openEditModal = (entry: FoodEntry) => {
    const n = entry.nutrients || {}
    setEditTarget(entry)
    setEditName(String(entry.name || ''))
    setEditMeal(String(entry.meal || 'uncategorized'))
    setEditCalories(String(Math.round(readNutrient(n, ['calories', 'calories_kcal']))))
    setEditProtein(String(round1(readNutrient(n, ['protein', 'protein_g']))))
    setEditCarbs(String(round1(readNutrient(n, ['carbs', 'carbs_g']))))
    setEditFat(String(round1(readNutrient(n, ['fat', 'fat_g']))))
    setEditFiber(String(round1(readNutrient(n, ['fiber', 'fiber_g']))))
    setEditSugar(String(round1(readNutrient(n, ['sugar', 'sugar_g']))))
    setEditModalOpen(true)
    setEntryMenu(null)
    closeEntrySwipeMenus()
  }

  const saveEditedEntry = async () => {
    if (!editTarget) return
    const created = await createFoodEntry({
      name: editName,
      meal: editMeal,
      calories: numberOrZero(editCalories),
      protein: numberOrZero(editProtein),
      carbs: numberOrZero(editCarbs),
      fat: numberOrZero(editFat),
      fiber: numberOrZero(editFiber),
      sugar: numberOrZero(editSugar),
      description: editTarget.description || '',
    })
    if (!created) {
      Alert.alert('Save failed', 'Could not save edits.')
      return
    }

    await deleteFoodEntry(editTarget.id)
    setEditModalOpen(false)
    setEditTarget(null)
    await loadAll()
  }

  const duplicateEntry = async (entry: FoodEntry, targetDate: string) => {
    const nutrients = entry.nutrients || {}
    const ok = await createFoodEntry({
      name: entry.name,
      meal: String(entry.meal || entry.category || 'uncategorized'),
      calories: readNutrient(nutrients, ['calories', 'calories_kcal']),
      protein: readNutrient(nutrients, ['protein', 'protein_g']),
      carbs: readNutrient(nutrients, ['carbs', 'carbs_g']),
      fat: readNutrient(nutrients, ['fat', 'fat_g']),
      fiber: readNutrient(nutrients, ['fiber', 'fiber_g']),
      sugar: readNutrient(nutrients, ['sugar', 'sugar_g']),
      description: entry.description || '',
      localDate: targetDate,
    })

    if (!ok) {
      Alert.alert('Could not copy', 'Please try again.')
      return
    }

    if (targetDate === selectedDate) {
      await loadAll()
      Alert.alert('Done', 'Meal duplicated.')
      return
    }

    Alert.alert('Done', 'Meal copied to today.')
  }

  const copyEntryFor7Days = async (entry: FoodEntry) => {
    setEntryMenu(null)
    closeEntrySwipeMenus()
    setSaving(true)
    const nutrients = entry.nutrients || {}
    let count = 0
    for (let i = 0; i < 7; i += 1) {
      const ok = await createFoodEntry({
        name: entry.name,
        meal: String(entry.meal || entry.category || 'uncategorized'),
        calories: readNutrient(nutrients, ['calories', 'calories_kcal']),
        protein: readNutrient(nutrients, ['protein', 'protein_g']),
        carbs: readNutrient(nutrients, ['carbs', 'carbs_g']),
        fat: readNutrient(nutrients, ['fat', 'fat_g']),
        fiber: readNutrient(nutrients, ['fiber', 'fiber_g']),
        sugar: readNutrient(nutrients, ['sugar', 'sugar_g']),
        description: entry.description || '',
        localDate: shiftDate(selectedDate, i),
      })
      if (ok) count += 1
    }
    setSaving(false)
    await loadAll()
    Alert.alert('Done', `${count} item${count === 1 ? '' : 's'} copied for 7 days.`)
  }

  const moveEntryToMeal = async () => {
    if (!moveEntryTarget) return
    const entry = moveEntryTarget
    const nutrients = entry.nutrients || {}
    const nextMeal = moveEntryMeal || String(entry.meal || entry.category || 'uncategorized')

    const created = await createFoodEntry({
      name: entry.name,
      meal: nextMeal,
      calories: readNutrient(nutrients, ['calories', 'calories_kcal']),
      protein: readNutrient(nutrients, ['protein', 'protein_g']),
      carbs: readNutrient(nutrients, ['carbs', 'carbs_g']),
      fat: readNutrient(nutrients, ['fat', 'fat_g']),
      fiber: readNutrient(nutrients, ['fiber', 'fiber_g']),
      sugar: readNutrient(nutrients, ['sugar', 'sugar_g']),
      description: entry.description || '',
      localDate: selectedDate,
    })

    if (!created) {
      Alert.alert('Move failed', 'Could not move this entry.')
      return
    }

    const deleted = await deleteFoodEntry(entry.id)
    if (!deleted) {
      Alert.alert('Move partial', 'Copied the entry but could not remove the old one.')
      return
    }

    setMoveEntryTarget(null)
    setEntryMenu(null)
    closeEntrySwipeMenus()
    await loadAll()
    Alert.alert('Done', 'Entry moved.')
  }

  const pasteCopiedItems = async (meal: string) => {
    if (copiedEntries.length === 0) {
      Alert.alert('Nothing copied', 'Copy some items first.')
      return
    }

    setSaving(true)
    let count = 0
    for (const entry of copiedEntries) {
      const n = entry.nutrients || {}
      const ok = await createFoodEntry({
        name: entry.name,
        meal,
        calories: readNutrient(n, ['calories', 'calories_kcal']),
        protein: readNutrient(n, ['protein', 'protein_g']),
        carbs: readNutrient(n, ['carbs', 'carbs_g']),
        fat: readNutrient(n, ['fat', 'fat_g']),
        fiber: readNutrient(n, ['fiber', 'fiber_g']),
        sugar: readNutrient(n, ['sugar', 'sugar_g']),
        description: entry.description || 'Pasted item',
      })
      if (ok) count += 1
    }
    setSaving(false)

    setSectionMenuMeal(null)
    await loadAll()
    Alert.alert('Pasted', `${count} item${count === 1 ? '' : 's'} added.`)
  }

  const copySelected = () => {
    if (selectedIds.length === 0) {
      Alert.alert('No items selected', 'Choose items first.')
      return
    }
    const chosen = entries.filter((entry) => selectedIds.includes(entry.id))
    setCopiedEntries(chosen)
    setCopyMode(false)
    setSelectedIds([])
    Alert.alert('Copied', `${chosen.length} item${chosen.length === 1 ? '' : 's'} copied.`)
  }

  const copyCategoryToToday = async (meal: string) => {
    if (isToday(selectedDate)) return
    const sectionItems = groupedByMeal[meal] || []
    if (sectionItems.length === 0) {
      Alert.alert('Nothing to copy', 'This section has no items on this day.')
      return
    }

    setSaving(true)
    let count = 0
    const today = formatLocalDate()
    for (const entry of sectionItems) {
      const n = entry.nutrients || {}
      const ok = await createFoodEntry({
        localDate: today,
        name: entry.name,
        meal,
        calories: readNutrient(n, ['calories', 'calories_kcal']),
        protein: readNutrient(n, ['protein', 'protein_g']),
        carbs: readNutrient(n, ['carbs', 'carbs_g']),
        fat: readNutrient(n, ['fat', 'fat_g']),
        fiber: readNutrient(n, ['fiber', 'fiber_g']),
        sugar: readNutrient(n, ['sugar', 'sugar_g']),
        description: entry.description || 'Copied from past date',
      })
      if (ok) count += 1
    }
    setSaving(false)
    setSectionMenuMeal(null)

    Alert.alert('Copied', `${count} item${count === 1 ? '' : 's'} copied to today.`)
  }

  const openFavorites = (meal: string) => {
    setFavoritesTargetMeal(meal)
    setFavoritesOpen(true)
    setSectionMenuMeal(null)
  }

  const addFavoriteToDiary = async (item: FavoriteMeal) => {
    const ok = await createFoodEntry({
      name: item.name,
      meal: favoritesTargetMeal,
      calories: item.nutrients.calories,
      protein: item.nutrients.protein,
      carbs: item.nutrients.carbs,
      fat: item.nutrients.fat,
      fiber: item.nutrients.fiber,
      sugar: item.nutrients.sugar,
      description: item.description || '',
    })
    if (!ok) {
      Alert.alert('Failed', 'Could not add favorite to diary.')
      return
    }
    setFavoritesOpen(false)
    await loadAll()
  }

  const deleteFavorite = async (item: FavoriteMeal) => {
    const next = favorites.filter((f) => f.id !== item.id)
    await saveFavorites(next)
  }

  const openIngredientSearch = (meal: string) => {
    navigation.getParent()?.navigate('AddIngredient', {
      meal,
      date: selectedDate,
    })
    setSectionMenuMeal(null)
  }

  const runIngredientSearch = async (
    kindOverride?: 'single' | 'packaged',
    queryOverride?: string,
  ) => {
    const kind = kindOverride || ingredientKind
    const query = String(queryOverride ?? ingredientQuery).trim()
    if (!query) {
      setIngredientResults([])
      setIngredientError('Please enter a food name to search.')
      return
    }
    if (!authHeaders) return

    const requestId = ++ingredientSearchRequestIdRef.current
    const sourceParam = kind === 'single' ? 'usda' : 'auto'

    try {
      setIngredientLoading(true)
      setIngredientError('')
      const res = await fetch(
        `${API_BASE_URL}/api/food-data?source=${sourceParam}&kind=${kind}&q=${encodeURIComponent(query)}&limit=20`,
        { headers: authHeaders },
      )
      const data: any = await res.json().catch(() => ({}))
      if (requestId !== ingredientSearchRequestIdRef.current) return
      if (!res.ok) {
        setIngredientResults([])
        setIngredientError('Search failed. Please try again.')
        return
      }
      let items: SearchFoodItem[] = Array.isArray(data?.items) ? data.items : []
      if (kind === 'single') {
        items = items.filter((entry) => entry?.source === 'usda' || entry?.__custom === true)
      }
      setIngredientResults(sortSearchResultsAz(items, { kind, query }))
      if (items.length === 0) {
        setIngredientError('No results yet. Try a different search.')
      }
    } catch {
      if (requestId !== ingredientSearchRequestIdRef.current) return
      setIngredientResults([])
      setIngredientError('Search failed. Please try again.')
    } finally {
      if (requestId === ingredientSearchRequestIdRef.current) {
        setIngredientLoading(false)
      }
    }
  }

  const addIngredientItem = async (item: SearchFoodItem) => {
    const caloriesRaw = Number(item.calories ?? item.calories_kcal)
    const proteinRaw = Number(item.protein_g)
    const carbsRaw = Number(item.carbs_g)
    const fatRaw = Number(item.fat_g)
    const hasCoreNutrition =
      Number.isFinite(caloriesRaw) &&
      Number.isFinite(proteinRaw) &&
      Number.isFinite(carbsRaw) &&
      Number.isFinite(fatRaw)
    if (!hasCoreNutrition) {
      Alert.alert('Cannot add this item', 'This result has missing nutrition data. Please pick another one.')
      return
    }

    const caloriesBase = numberOrZero(caloriesRaw)
    const proteinBase = numberOrZero(proteinRaw)
    const carbsBase = numberOrZero(carbsRaw)
    const fatBase = numberOrZero(fatRaw)
    const fiberBase = numberOrZero(item.fiber_g)
    const sugarBase = numberOrZero(item.sugar_g)
    const title = String(item.name || '').trim()
    const servingText = String(item.serving_size || '1 serving').trim()
    const detail = `${servingText}${item.brand ? ` • ${item.brand}` : ''}`

    const ok = await createFoodEntry({
      name: title,
      meal: ingredientTargetMeal,
      calories: caloriesBase,
      protein: proteinBase,
      carbs: carbsBase,
      fat: fatBase,
      fiber: fiberBase,
      sugar: sugarBase,
      description: detail,
    })

    if (!ok) {
      Alert.alert('Add failed', 'Could not add this ingredient.')
      return
    }

    setIngredientOpen(false)
    setIngredientQuery('')
    setIngredientResults([])
    setIngredientError('')
    await loadAll()
  }

  const openBarcode = (meal: string) => {
    setBarcodeTargetMeal(meal)
    setBarcodeCode('')
    setBarcodeFood(null)
    setBarcodeLabelOpen(false)
    setBarcodeOpen(true)
    setSectionMenuMeal(null)
  }

  const lookupBarcode = async () => {
    const code = barcodeCode.trim().replace(/[^0-9A-Za-z]/g, '')
    if (!code) {
      Alert.alert('Missing barcode', 'Type a barcode first.')
      return
    }
    if (!authHeaders) return

    try {
      setBarcodeLoading(true)
      const res = await fetch(`${API_BASE_URL}/api/barcode/lookup?code=${encodeURIComponent(code)}`, {
        headers: authHeaders,
      })
      const data: any = await res.json().catch(() => ({}))
      if (!res.ok || !data?.food) {
        Alert.alert('Not found', String(data?.message || 'No product found for this barcode.'))
        setBarcodeFood(null)
        setBarcodeLabelOpen(true)
        setBarcodeLabelName('')
        setBarcodeLabelBrand('')
        setBarcodeLabelServing('')
        setBarcodeLabelCalories('')
        setBarcodeLabelProtein('')
        setBarcodeLabelCarbs('')
        setBarcodeLabelFat('')
        setBarcodeLabelFiber('')
        setBarcodeLabelSugar('')
        return
      }

      setBarcodeFood(data.food)
    } catch {
      setBarcodeFood(null)
      Alert.alert('Lookup failed', 'Could not look up this barcode.')
    } finally {
      setBarcodeLoading(false)
    }
  }

  const addBarcodeFood = async () => {
    if (!barcodeFood) return

    const ok = await createFoodEntry({
      name: String(barcodeFood.name || 'Scanned item'),
      meal: barcodeTargetMeal,
      calories: numberOrZero(barcodeFood.calories ?? barcodeFood.calories_kcal),
      protein: numberOrZero(barcodeFood.protein_g),
      carbs: numberOrZero(barcodeFood.carbs_g),
      fat: numberOrZero(barcodeFood.fat_g),
      fiber: numberOrZero(barcodeFood.fiber_g),
      sugar: numberOrZero(barcodeFood.sugar_g),
      description: `${barcodeFood.serving_size || '1 serving'}${barcodeFood.brand ? ` • ${barcodeFood.brand}` : ''}`,
    })

    if (!ok) {
      Alert.alert('Add failed', 'Could not add scanned product.')
      return
    }

    setBarcodeOpen(false)
    await loadAll()
  }

  const captureBarcodePhoto = async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync()
      if (!permission.granted) {
        Alert.alert('Permission needed', 'Please allow camera access to continue.')
        return
      }
      const picked = await ImagePicker.launchCameraAsync({ quality: 0.7 })
      if (picked.canceled) return
      Alert.alert(
        'Photo captured',
        'Now type the barcode number below and tap Lookup barcode. Flash toggle is saved for your next scan.',
      )
    } catch {
      Alert.alert('Camera unavailable', 'Could not open camera right now.')
    }
  }

  const saveBarcodeLabel = async () => {
    if (!session?.token) return
    const code = barcodeCode.trim().replace(/[^0-9A-Za-z]/g, '')
    if (!code) {
      Alert.alert('Missing barcode', 'Please type the barcode number first.')
      return
    }

    const payload = {
      barcode: code,
      item: {
        name: barcodeLabelName.trim() || 'Packaged item',
        brand: barcodeLabelBrand.trim() || undefined,
        serving_size: barcodeLabelServing.trim() || undefined,
        calories: numberOrZero(barcodeLabelCalories) || undefined,
        protein_g: numberOrZero(barcodeLabelProtein) || undefined,
        carbs_g: numberOrZero(barcodeLabelCarbs) || undefined,
        fat_g: numberOrZero(barcodeLabelFat) || undefined,
        fiber_g: numberOrZero(barcodeLabelFiber) || undefined,
        sugar_g: numberOrZero(barcodeLabelSugar) || undefined,
      },
      report: true,
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/barcode/label`, {
        method: 'POST',
        headers: buildNativeAuthHeaders(session.token, { json: true, includeCookie: true }),
        body: JSON.stringify(payload),
      })
      const data: any = await res.json().catch(() => ({}))
      if (!res.ok) {
        Alert.alert('Save failed', String(data?.message || data?.error || 'Could not save this barcode label.'))
        return
      }
      Alert.alert('Saved', 'Barcode label details were captured.')
      setBarcodeLabelOpen(false)
      await lookupBarcode()
    } catch {
      Alert.alert('Save failed', 'Could not save this barcode label.')
    }
  }

  const createFromImage = async (modeValue: 'camera' | 'library', meal: string) => {
    if (!session?.token) return

    try {
      const permission =
        modeValue === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (!permission.granted) {
        Alert.alert('Permission needed', 'Please allow access to continue.')
        return
      }

      const picked =
        modeValue === 'camera'
          ? await ImagePicker.launchCameraAsync({ quality: 0.7 })
          : await ImagePicker.launchImageLibraryAsync({ quality: 0.7 })

      if (picked.canceled || !picked.assets?.[0]?.uri) return

      const asset = picked.assets[0]
      const form = new FormData()
      form.append('mealType', meal)
      form.append('image', {
        uri: asset.uri,
        type: asset.mimeType || 'image/jpeg',
        name: asset.fileName || 'food.jpg',
      } as any)

      setSaving(true)
      const res = await fetch(`${API_BASE_URL}/api/analyze-food`, {
        method: 'POST',
        headers: buildNativeAuthHeaders(session.token, { includeCookie: true }),
        body: form,
      })
      const data: any = await res.json().catch(() => ({}))
      setSaving(false)

      if (!res.ok) {
        Alert.alert('Analysis failed', String(data?.error || 'Could not analyze this image.'))
        return
      }

      const items = Array.isArray(data?.items) ? data.items : []
      if (items.length > 0) {
        let added = 0
        for (const item of items) {
          const ok = await createFoodEntry({
            name: String(item?.name || 'Analyzed item'),
            meal,
            calories: numberOrZero(item?.calories || item?.calories_kcal),
            protein: numberOrZero(item?.protein_g || item?.protein),
            carbs: numberOrZero(item?.carbs_g || item?.carbs),
            fat: numberOrZero(item?.fat_g || item?.fat),
            fiber: numberOrZero(item?.fiber_g || item?.fiber),
            sugar: numberOrZero(item?.sugar_g || item?.sugar),
            description: String(item?.serving_size || 'Photo analyzed'),
          })
          if (ok) added += 1
        }
        await loadAll()
        Alert.alert('Done', `${added} item${added === 1 ? '' : 's'} added from photo.`)
        return
      }

      const summary = data?.food || data || {}
      const ok = await createFoodEntry({
        name: String(summary?.name || 'Photo analyzed meal'),
        meal,
        calories: numberOrZero(summary?.calories || summary?.calories_kcal),
        protein: numberOrZero(summary?.protein || summary?.protein_g),
        carbs: numberOrZero(summary?.carbs || summary?.carbs_g),
        fat: numberOrZero(summary?.fat || summary?.fat_g),
        fiber: numberOrZero(summary?.fiber || summary?.fiber_g),
        sugar: numberOrZero(summary?.sugar || summary?.sugar_g),
        description: String(summary?.description || 'Photo analyzed'),
      })
      if (ok) {
        await loadAll()
      }
    } catch {
      setSaving(false)
      Alert.alert('Analysis failed', 'Could not analyze this image.')
    }
  }

  const openRecommended = async (meal: string) => {
    if (!authHeaders) return
    setRecommendedTargetMeal(meal)
    setRecommendedOpen(true)
    setRecommendedTab('ingredients')
    setSectionMenuMeal(null)

    try {
      const res = await fetch(
        `${API_BASE_URL}/api/ai-meal-recommendation?date=${encodeURIComponent(selectedDate)}&category=${encodeURIComponent(meal)}`,
        { headers: authHeaders },
      )
      const data: any = await res.json().catch(() => ({}))
      if (!res.ok) return
      const history = Array.isArray(data?.history) ? data.history : []
      setRecommendedHistory(history)
      const cost = Number(data?.costCredits)
      setRecommendedCostCredits(Number.isFinite(cost) && cost >= 0 ? Math.round(cost) : 0)
      if (!recommendedExplainSeen) {
        setRecommendedExplainOpen(true)
      }
    } catch {}
  }

  const generateRecommended = async () => {
    if (!authHeaders) return
    if (!recommendedExplainSeen) {
      setRecommendedExplainOpen(true)
      return
    }

    try {
      setRecommendedLoading(true)
      const res = await fetch(`${API_BASE_URL}/api/ai-meal-recommendation`, {
        method: 'POST',
        headers: buildNativeAuthHeaders(session?.token || '', { json: true, includeCookie: true }),
        body: JSON.stringify({
          date: selectedDate,
          category: recommendedTargetMeal,
          tz: new Date().getTimezoneOffset(),
        }),
      })
      const data: any = await res.json().catch(() => ({}))
      if (!res.ok) {
        Alert.alert('Could not generate', String(data?.error || 'Please try again.'))
        return
      }
      const cost = Number(data?.costCredits)
      setRecommendedCostCredits(Number.isFinite(cost) && cost >= 0 ? Math.round(cost) : recommendedCostCredits)

      const recommendation = data?.recommendation || null
      if (recommendation) {
        setRecommendedMeal(recommendation)
        setRecommendedHistory((prev) => [recommendation, ...prev.filter((p) => p.id !== recommendation.id)].slice(0, 20))
      }
    } finally {
      setRecommendedLoading(false)
    }
  }

  const addRecommendedToDiary = async () => {
    if (!recommendedMeal) return
    const name = String(recommendedMeal.mealName || 'AI Recommended Meal')

    const nutrients = (recommendedMeal.items || []).reduce(
      (acc, item) => {
        const servings = numberOrZero(item.servings) || 1
        acc.calories += numberOrZero(item.calories) * servings
        acc.protein += numberOrZero(item.protein_g) * servings
        acc.carbs += numberOrZero(item.carbs_g) * servings
        acc.fat += numberOrZero(item.fat_g) * servings
        acc.fiber += numberOrZero(item.fiber_g) * servings
        acc.sugar += numberOrZero(item.sugar_g) * servings
        return acc
      },
      { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0 },
    )

    const ok = await createFoodEntry({
      name,
      meal: recommendedTargetMeal,
      calories: nutrients.calories,
      protein: nutrients.protein,
      carbs: nutrients.carbs,
      fat: nutrients.fat,
      fiber: nutrients.fiber,
      sugar: nutrients.sugar,
      description: recommendedMeal.why || 'AI meal recommendation',
    })

    if (!ok) {
      Alert.alert('Add failed', 'Could not add recommendation.')
      return
    }

    setRecommendedOpen(false)
    await loadAll()
  }

  const updateRecommendedServing = (index: number, nextValue: number) => {
    const safe = clamp(nextValue, 0, 20)
    setRecommendedMeal((prev) => {
      if (!prev) return prev
      const nextItems = [...prev.items]
      if (!nextItems[index]) return prev
      nextItems[index] = { ...nextItems[index], servings: round1(safe) }
      return { ...prev, items: nextItems }
    })
  }

  const openAskAIChat = () => {
    const parent = navigation.getParent?.()
    parent?.navigate?.('NativeWebTool', {
      title: NATIVE_WEB_PAGES.talkToHelfi.title,
      path: `/chat?context=food&date=${encodeURIComponent(selectedDate)}`,
    })
  }

  const openCombine = (meal: string) => {
    setCombineTargetMeal(meal)
    setCombineIds([])
    setCombineName('')
    setCombineOpen(true)
    setSectionMenuMeal(null)
  }

  const saveCombinedMeal = async () => {
    const chosen = entries.filter((entry) => combineIds.includes(entry.id))
    if (chosen.length < 2) {
      Alert.alert('Pick items', 'Select at least 2 items to combine.')
      return
    }
    const combinedName = combineName.trim() || 'Combined meal'

    const sum = chosen.reduce(
      (acc, entry) => {
        const n = entry.nutrients || {}
        acc.calories += readNutrient(n, ['calories', 'calories_kcal'])
        acc.protein += readNutrient(n, ['protein', 'protein_g'])
        acc.carbs += readNutrient(n, ['carbs', 'carbs_g'])
        acc.fat += readNutrient(n, ['fat', 'fat_g'])
        acc.fiber += readNutrient(n, ['fiber', 'fiber_g'])
        acc.sugar += readNutrient(n, ['sugar', 'sugar_g'])
        return acc
      },
      { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0 },
    )

    const ok = await createFoodEntry({
      name: combinedName,
      meal: combineTargetMeal,
      calories: sum.calories,
      protein: sum.protein,
      carbs: sum.carbs,
      fat: sum.fat,
      fiber: sum.fiber,
      sugar: sum.sugar,
      description: `Combined from: ${chosen.map((entry) => entry.name).join(', ')}`,
    })

    if (!ok) {
      Alert.alert('Combine failed', 'Could not create combined meal.')
      return
    }

    for (const entry of chosen) {
      await deleteFoodEntry(entry.id)
    }

    const customFavorite: FavoriteMeal = {
      id: `fav-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name: combinedName,
      meal: combineTargetMeal,
      custom: true,
      description: `Combined from ${chosen.length} items`,
      nutrients: {
        calories: sum.calories,
        protein: sum.protein,
        carbs: sum.carbs,
        fat: sum.fat,
        fiber: sum.fiber,
        sugar: sum.sugar,
      },
      ingredients: chosen.map((entry) => ({ name: entry.name, amount: 1, unit: 'serve' })),
    }
    await saveFavorites([customFavorite, ...favorites].slice(0, 300))

    setCombineOpen(false)
    await loadAll()
  }

  const openWaterEdit = (entry: WaterEntry) => {
    setWaterEditId(entry.id)
    setWaterEditAmount(String(entry.amount || 0))
    const unit = String(entry.unit || 'ml').toLowerCase()
    if (unit === 'l' || unit === 'oz') setWaterEditUnit(unit)
    else setWaterEditUnit('ml')
    setWaterEditOpen(true)
  }

  const saveWaterEdit = async () => {
    if (!waterEditId || !authHeaders) return

    const amount = numberOrZero(waterEditAmount)
    if (amount <= 0) {
      Alert.alert('Invalid amount', 'Please enter a valid amount.')
      return
    }

    const res = await fetch(`${API_BASE_URL}/api/water-log/${encodeURIComponent(waterEditId)}`, {
      method: 'PATCH',
      headers: buildNativeAuthHeaders(session?.token || '', { json: true, includeCookie: true }),
      body: JSON.stringify({
        amount,
        unit: waterEditUnit,
        localDate: selectedDate,
      }),
    })

    if (!res.ok) {
      Alert.alert('Save failed', 'Could not update water entry.')
      return
    }

    setWaterEditOpen(false)
    await loadAll()
  }

  const openExerciseAdd = () => {
    setExerciseEditId(null)
    setExerciseTypeId(null)
    setExerciseDuration('30')
    setExerciseDistance('')
    setExerciseDistanceUnit('km')
    setExerciseStartTime('')
    setExerciseCaloriesOverride('')
    setExerciseCaloriesPreview(null)
    setExerciseOpen(true)
  }

  const openExerciseEdit = (entry: ExerciseEntry) => {
    setExerciseEditId(entry.id)
    setExerciseTypeId(entry.exerciseType?.id || null)
    setExerciseDuration(String(entry.durationMinutes || 30))
    if (Number.isFinite(numberOrZero(entry.distanceKm)) && numberOrZero(entry.distanceKm) > 0) {
      setExerciseDistance(String(round1(numberOrZero(entry.distanceKm))))
    } else {
      setExerciseDistance('')
    }
    setExerciseDistanceUnit('km')
    setExerciseStartTime(entry.startTime ? String(entry.startTime).slice(11, 16) : '')
    setExerciseCaloriesPreview(Math.round(numberOrZero(entry.calories)))
    setExerciseCaloriesOverride(String(Math.round(numberOrZero(entry.calories))))
    setExerciseOpen(true)
  }

  const exerciseCategories = useMemo(() => {
    const cats = Array.from(new Set(exerciseTypes.map((item) => String(item.category || '').trim()).filter(Boolean)))
    return cats.sort((a, b) => a.localeCompare(b))
  }, [exerciseTypes])

  const exerciseTypeName = useMemo(() => {
    const found = exerciseTypes.find((item) => item.id === exerciseTypeId)
    return found?.name || ''
  }, [exerciseTypeId, exerciseTypes])

  const refreshExercisePreview = useCallback(async () => {
    if (!authHeaders || !exerciseTypeId) {
      setExerciseCaloriesPreview(null)
      return
    }

    const duration = numberOrZero(exerciseDuration)
    if (duration <= 0) {
      setExerciseCaloriesPreview(null)
      return
    }

    let distanceKm: number | null = null
    if (exerciseDistance.trim()) {
      const value = numberOrZero(exerciseDistance)
      if (value > 0) {
        distanceKm = exerciseDistanceUnit === 'mi' ? value * 1.60934 : value
      }
    }

    const res = await fetch(`${API_BASE_URL}/api/exercise-preview`, {
      method: 'POST',
      headers: buildNativeAuthHeaders(session?.token || '', { json: true, includeCookie: true }),
      body: JSON.stringify({
        exerciseTypeId,
        durationMinutes: duration,
        distanceKm,
      }),
    })
    const data: any = await res.json().catch(() => ({}))
    if (!res.ok) {
      setExerciseCaloriesPreview(null)
      return
    }
    const cals = numberOrZero(data?.calories)
    setExerciseCaloriesPreview(Number.isFinite(cals) ? Math.round(cals) : null)
  }, [authHeaders, exerciseDistance, exerciseDistanceUnit, exerciseDuration, exerciseTypeId, session?.token])

  useEffect(() => {
    if (!exerciseOpen) return
    const timer = setTimeout(() => {
      void refreshExercisePreview()
    }, 220)
    return () => clearTimeout(timer)
  }, [exerciseOpen, refreshExercisePreview])

  const saveExercise = async () => {
    if (!authHeaders || !exerciseTypeId) {
      Alert.alert('Missing data', 'Choose an exercise type first.')
      return
    }

    const duration = numberOrZero(exerciseDuration)
    if (duration <= 0) {
      Alert.alert('Invalid duration', 'Please enter a valid duration.')
      return
    }

    let distanceKm: number | null = null
    if (exerciseDistance.trim()) {
      const value = numberOrZero(exerciseDistance)
      if (value > 0) {
        distanceKm = exerciseDistanceUnit === 'mi' ? value * 1.60934 : value
      }
    }

    const body: any = {
      exerciseTypeId,
      durationMinutes: duration,
      distanceKm,
      date: selectedDate,
    }

    if (exerciseStartTime.trim()) {
      body.startTime = `${selectedDate}T${exerciseStartTime}:00`
    }

    const override = numberOrZero(exerciseCaloriesOverride)
    if (override > 0) body.caloriesOverride = override

    const url =
      exerciseEditId == null
        ? `${API_BASE_URL}/api/exercise-entries`
        : `${API_BASE_URL}/api/exercise-entries/${encodeURIComponent(exerciseEditId)}`

    const method = exerciseEditId == null ? 'POST' : 'PATCH'

    const res = await fetch(url, {
      method,
      headers: buildNativeAuthHeaders(session?.token || '', { json: true, includeCookie: true }),
      body: JSON.stringify(body),
    })

    const data: any = await res.json().catch(() => ({}))
    if (!res.ok) {
      Alert.alert('Could not save exercise', String(data?.error || 'Please try again.'))
      return
    }

    setExerciseOpen(false)
    await loadAll()
  }

  const deleteExercise = async (entry: ExerciseEntry) => {
    if (!authHeaders) return

    const res = await fetch(`${API_BASE_URL}/api/exercise-entries/${encodeURIComponent(entry.id)}`, {
      method: 'DELETE',
      headers: buildNativeAuthHeaders(session?.token || '', { includeCookie: true }),
    })

    if (!res.ok) {
      Alert.alert('Delete failed', 'Could not delete exercise entry.')
      return
    }

    await loadAll()
  }

  const syncExerciseDevices = async () => {
    if (!authHeaders) return

    const res = await fetch(`${API_BASE_URL}/api/exercise/sync`, {
      method: 'POST',
      headers: buildNativeAuthHeaders(session?.token || '', { includeCookie: true }),
    })

    if (!res.ok) {
      Alert.alert('Sync failed', 'Could not sync device exercise data right now.')
      return
    }

    await loadAll()
    Alert.alert('Synced', 'Device exercise data was synced.')
  }

  const closeAllAddMenus = () => {
    setSectionMenuMeal(null)
    setTopAddCategoryOpen(false)
    setTopAddOptionsOpen(false)
  }

  const runSectionAction = async (action: string, mealOverride?: string) => {
    const meal = mealOverride || sectionMenuMeal || topAddMeal || 'uncategorized'

    if (action === 'Photo Library') {
      closeAllAddMenus()
      await createFromImage('library', meal)
      return
    }
    if (action === 'Camera') {
      closeAllAddMenus()
      await createFromImage('camera', meal)
      return
    }
    if (action === 'Favorites') {
      closeAllAddMenus()
      openFavorites(meal)
      return
    }
    if (action === 'Import Recipe') {
      closeAllAddMenus()
      setIngredientTargetMeal(meal)
      setCombineName('Imported Recipe')
      setCombineIds([])
      setCombineOpen(true)
      return
    }
    if (action === 'Recommended') {
      closeAllAddMenus()
      await openRecommended(meal)
      return
    }
    if (action === 'Barcode Scanner') {
      closeAllAddMenus()
      openBarcode(meal)
      return
    }
    if (action === 'Add ingredient') {
      closeAllAddMenus()
      openIngredientSearch(meal)
      return
    }
    if (action === 'Build a meal') {
      closeAllAddMenus()
      openCombine(meal)
      return
    }
    if (action === 'Log Water Intake') {
      closeAllAddMenus()
      navigation.getParent()?.navigate('WaterIntake')
      return
    }
    if (action === 'Combine ingredients') {
      closeAllAddMenus()
      openCombine(meal)
      return
    }
    if (action === 'Copy multiple items') {
      closeAllAddMenus()
      setCopyMode(true)
      setSelectedIds([])
      return
    }
    if (action.startsWith('Paste items')) {
      closeAllAddMenus()
      await pasteCopiedItems(meal)
      return
    }
    if (action.startsWith('Clear copied items')) {
      closeAllAddMenus()
      setCopiedEntries([])
      return
    }
    if (action === 'Copy category to Today') {
      closeAllAddMenus()
      await copyCategoryToToday(meal)
      return
    }
  }

  const onSummaryTouchStart = (event: any) => {
    const touch = event?.nativeEvent?.touches?.[0]
    if (!touch) return
    summarySwipeStartRef.current = { x: touch.pageX, y: touch.pageY }
  }

  const onSummaryTouchEnd = (event: any) => {
    const start = summarySwipeStartRef.current
    summarySwipeStartRef.current = null
    if (!start) return
    const touch = event?.nativeEvent?.changedTouches?.[0]
    if (!touch) return

    const dx = touch.pageX - start.x
    const dy = touch.pageY - start.y
    if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return

    const direction = dx < 0 ? 1 : -1
    setSummarySlideIndex((prev) => clamp(prev + direction, 0, 2))
  }

  const goToProfile = () => navigation.getParent()?.navigate('Profile')
  const goToAccountSettings = () => navigation.getParent()?.navigate('AccountSettings')
  const goToProfilePhoto = () => navigation.getParent()?.navigate('ProfilePhoto')
  const goToBilling = () => navigation.getParent()?.navigate('Billing')
  const goToNotifications = () => navigation.getParent()?.navigate('Notifications')
  const goToPrivacySettings = () => navigation.getParent()?.navigate('PrivacySettings')
  const goToSupport = () => navigation.getParent()?.navigate('Support')

  const onPressProfileMenuLogout = () => {
    setProfileMenuOpen(false)
    Alert.alert('Log out?', 'This will take you back to the login screen.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: () => void signOut() },
    ])
  }

  if (mode !== 'signedIn' || !session?.token) {
    return (
      <Screen style={{ alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <Text style={{ color: theme.colors.text, fontWeight: '800', fontSize: 18 }}>Please sign in</Text>
        <Text style={{ color: theme.colors.muted, marginTop: 6, textAlign: 'center' }}>
          Food Diary is available after sign-in.
        </Text>
      </Screen>
    )
  }

  return (
    <Screen style={{ backgroundColor: '#F2F4F6' }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 28 }}>
        <View style={{ backgroundColor: '#F2F4F6', borderBottomWidth: 1, borderBottomColor: '#DFE3EA', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ width: 42 }} />
            <Text style={{ flex: 1, textAlign: 'center', color: '#111827', fontSize: 46/2, fontWeight: '900' }}>Food Diary</Text>
            <Pressable
              onPress={() => setProfileMenuOpen((v) => !v)}
              style={{
                width: 42,
                height: 42,
                borderRadius: 21,
                overflow: 'hidden',
                borderWidth: 3,
                borderColor: '#50B848',
                backgroundColor: '#E5E7EB',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {accountImage ? (
                <Image source={{ uri: accountImage }} style={{ width: '100%', height: '100%' }} />
              ) : (
                <Text style={{ color: '#6B7280', fontWeight: '900' }}>{profileInitial}</Text>
              )}
            </Pressable>
          </View>
        </View>

        <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: '#DFE3EA', backgroundColor: '#F2F4F6' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Pressable onPress={() => setSelectedDate((prev) => shiftDate(prev, -1))} style={dateArrowCircle}>
              <Text style={{ color: '#111827', fontSize: 24, fontWeight: '700' }}>‹</Text>
            </Pressable>
            <Pressable onPress={() => setShowDatePicker(true)} style={dateCenterPill}>
              <Text style={{ color: '#111827', fontSize: 16, fontWeight: '900' }}>
                {formatDateLabel(selectedDate)} <Text style={{ color: '#6B7280', fontWeight: '500' }}>{parseLocalDate(selectedDate).getFullYear()}</Text>
              </Text>
            </Pressable>
            <Pressable onPress={() => setSelectedDate((prev) => shiftDate(prev, 1))} style={dateArrowCircle}>
              <Text style={{ color: '#111827', fontSize: 24, fontWeight: '700' }}>›</Text>
            </Pressable>
          </View>
        </View>

        <View style={{ paddingHorizontal: 16, paddingTop: 18 }}>
          <Pressable
            onPress={() => {
              if (topAddCategoryOpen || topAddOptionsOpen) {
                setTopAddCategoryOpen(false)
                setTopAddOptionsOpen(false)
                return
              }
              setTopAddCategoryOpen(true)
            }}
            style={{
              borderRadius: 16,
              backgroundColor: '#50B848',
              paddingVertical: 14,
              paddingHorizontal: 16,
              flexDirection: 'row',
              alignItems: 'center',
            }}
          >
            <View
              style={{
                width: 46,
                height: 46,
                borderRadius: 23,
                backgroundColor: 'rgba(255,255,255,0.2)',
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 12,
              }}
            >
              <Text style={{ color: '#fff', fontSize: 35/1.6, fontWeight: '500' }}>＋</Text>
            </View>
            <Text style={{ color: '#fff', fontSize: 41/2, fontWeight: '900', flex: 1 }}>Add Food Entry</Text>
            <Text style={{ color: '#fff', fontSize: 29/2, fontWeight: '900' }}>
              {topAddCategoryOpen || topAddOptionsOpen ? '⌃' : '⌄'}
            </Text>
          </Pressable>

          {topAddCategoryOpen ? (
            <View
              style={{
                marginTop: 8,
                borderRadius: 16,
                backgroundColor: '#FFFFFF',
                borderWidth: 1,
                borderColor: '#E5E7EB',
                overflow: 'hidden',
              }}
            >
              {MEALS.map((meal, idx) => (
                <Pressable
                  key={meal.key}
                  onPress={() => {
                    setTopAddMeal(meal.key)
                    setTopAddCategoryOpen(false)
                    setTopAddOptionsOpen(true)
                  }}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    borderTopWidth: idx === 0 ? 0 : 1,
                    borderTopColor: '#F3F4F6',
                  }}
                >
                  <Text style={{ color: '#1F2937', fontWeight: '800', fontSize: 16 }}>{meal.label}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          {topAddOptionsOpen ? (
            <View
              style={{
                marginTop: 8,
                borderRadius: 16,
                backgroundColor: '#FFFFFF',
                borderWidth: 1,
                borderColor: '#E5E7EB',
                overflow: 'hidden',
              }}
            >
              <View style={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: 8 }}>
                <Text style={{ color: '#1F2937', fontWeight: '900', fontSize: 18 }}>{mealLabel(topAddMeal)}</Text>
              </View>
              {topAddMenuActions.map((item, idx) => (
                <Pressable
                  key={item.id}
                  onPress={() => void runSectionAction(item.action, topAddMeal)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingHorizontal: 14,
                    paddingVertical: 11,
                    borderTopWidth: idx === 0 ? 0 : 1,
                    borderTopColor: '#F3F4F6',
                    backgroundColor: '#FFFFFF',
                  }}
                >
                  <View
                    style={{
                      width: 42,
                      height: 42,
                      borderRadius: 12,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: item.iconBg,
                      marginRight: 10,
                    }}
                  >
                    <Text style={{ color: item.iconColor, fontSize: 20, fontWeight: '900' }}>{item.icon}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#1F2937', fontWeight: '800', fontSize: 16 }}>{item.title}</Text>
                    <Text style={{ color: '#6B7280', fontSize: 13 }}>{item.subtitle}</Text>
                  </View>
                  <Text style={{ color: '#9CA3AF', fontSize: 18, fontWeight: '800' }}>›</Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          <View style={{ marginTop: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ color: '#6B7280', fontSize: 16 }}>Credits remaining</Text>
              <Text style={{ marginLeft: 'auto', color: '#374151', fontSize: 18, fontWeight: '900' }}>
                {creditsRemaining == null ? '—' : creditsRemaining.toLocaleString()}
              </Text>
            </View>
            <View style={{ marginTop: 8, height: 12, borderRadius: 999, backgroundColor: '#D1D5DB', overflow: 'hidden' }}>
              <View style={{ width: `${creditsBarPercent}%`, height: '100%', backgroundColor: '#41AD49' }} />
            </View>
            <Text style={{ marginTop: 10, color: '#4B5563', fontSize: 14 }}>
              This {foodAnalysisUsageLabel === 'monthly' ? 'month' : 'total'}:{' '}
              <Text style={{ fontWeight: '800' }}>This AI feature has been used {foodAnalysisUsageCount} times.</Text>
            </Text>
            <Text style={{ marginTop: 2, color: '#4B5563', fontSize: 14 }}>
              Cost: {foodAnalysisCostPerUse} credits per food analysis.
            </Text>
          </View>
        </View>

        <View style={{ marginTop: 20, paddingHorizontal: 16 }}>
          <View
            onTouchStart={onSummaryTouchStart}
            onTouchEnd={onSummaryTouchEnd}
            style={{ borderRadius: 24, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#fff', padding: 14 }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ color: '#1F2937', fontSize: 20/1.4, fontWeight: '900' }}>Energy summary</Text>
              <View style={{ marginLeft: 'auto', flexDirection: 'row', backgroundColor: '#F3F4F6', borderRadius: 999, borderWidth: 1, borderColor: '#E5E7EB', padding: 4 }}>
                <Pressable onPress={() => setEnergyUnit('kcal')} style={[energyTogglePill, energyUnit === 'kcal' && energyTogglePillActive]}>
                  <Text style={[energyToggleText, energyUnit === 'kcal' && energyToggleTextActive]}>kcal</Text>
                </Pressable>
                <Pressable onPress={() => setEnergyUnit('kj')} style={[energyTogglePill, energyUnit === 'kj' && energyTogglePillActive]}>
                  <Text style={[energyToggleText, energyUnit === 'kj' && energyToggleTextActive]}>kJ</Text>
                </Pressable>
              </View>
            </View>

            {summarySlideIndex === 0 ? (
              <>
                <View style={{ marginTop: 14, flexDirection: 'row', justifyContent: 'space-around' }}>
                  <CircleMetric value={remainingKcal} label="REMAINING" color="#22C55E" unit={energyUnit} />
                  <CircleMetric value={usedKcal} label="USED" color="#EF4444" unit={energyUnit} />
                </View>

                <Text style={{ marginTop: 10, textAlign: 'center', color: '#6B7280', fontSize: 13 }}>
                  Daily allowance: <Text style={{ fontWeight: '900', color: '#374151' }}>{Math.round(energyUnit === 'kj' ? dailyAllowanceKcal * 4.184 : dailyAllowanceKcal)} {energyUnit}</Text>
                </Text>
              </>
            ) : null}

            {summarySlideIndex === 1 ? (
              <View style={{ marginTop: 12 }}>
                {macroRows.map((row) => {
                  const safeTarget = Math.max(0, Number(row.target) || 0)
                  const safeConsumed = Math.max(0, Number(row.consumed) || 0)
                  const rawPct = safeTarget > 0 ? safeConsumed / safeTarget : 0
                  const over = rawPct > 1
                  const percentLabel = safeTarget > 0 ? (rawPct > 0 && rawPct < 0.01 ? '<1%' : `${Math.round(rawPct * 100)}%`) : '0%'
                  const remaining = Math.max(0, safeTarget - safeConsumed)
                  const usedWidth = clamp(rawPct * 100, 0, 100)
                  const fatTotal = Math.max(0, fatSplit.good + fatSplit.bad + fatSplit.unclear)
                  const fatGoodPct = fatTotal > 0 ? (fatSplit.good / fatTotal) * 100 : 0
                  const fatBadPct = fatTotal > 0 ? (fatSplit.bad / fatTotal) * 100 : 0
                  const fatUnclearPct = fatTotal > 0 ? (fatSplit.unclear / fatTotal) * 100 : 0

                  return (
                    <View key={row.key} style={{ marginTop: row.key === 'protein' ? 0 : 8 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Text style={{ color: '#111827', fontSize: 25/2, fontWeight: '800', flex: 1 }}>
                          {row.label}{' '}
                          <Text style={{ color: '#4B5563', fontWeight: '500' }}>
                            {formatMacroAmount(safeConsumed)} / {formatMacroAmount(safeTarget)} {row.unit}
                            {row.key === 'sugar' ? ' cap' : ''}
                          </Text>{' '}
                          <Text style={{ color: over ? '#EF4444' : row.color, fontWeight: '800' }}>
                            {formatMacroAmount(remaining)} {row.unit} left
                          </Text>
                        </Text>
                        <Text style={{ color: over ? '#EF4444' : '#111827', fontSize: 12, fontWeight: '700' }}>
                          {percentLabel}
                        </Text>
                      </View>

                      <View style={{ marginTop: 5, height: 9, borderRadius: 999, backgroundColor: '#D1D5DB', overflow: 'hidden' }}>
                        {row.key === 'fat' && fatTotal > 0 ? (
                          <View style={{ width: `${usedWidth}%`, height: '100%', flexDirection: 'row' }}>
                            {fatGoodPct > 0 ? <View style={{ width: `${fatGoodPct}%`, height: '100%', backgroundColor: '#22C55E' }} /> : null}
                            {fatBadPct > 0 ? <View style={{ width: `${fatBadPct}%`, height: '100%', backgroundColor: '#EF4444' }} /> : null}
                            {fatUnclearPct > 0 ? <View style={{ width: `${fatUnclearPct}%`, height: '100%', backgroundColor: '#60A5FA' }} /> : null}
                          </View>
                        ) : (
                          <View style={{ width: `${usedWidth}%`, height: '100%', backgroundColor: over ? '#EF4444' : row.color }} />
                        )}
                      </View>
                    </View>
                  )
                })}

                <Text style={{ marginTop: 10, color: '#4B5563', fontSize: 14, lineHeight: 21 }}>
                  Fat is split into healthy (green), unhealthy (red), and unclear (blue) based on the food name.
                </Text>
              </View>
            ) : null}

            {summarySlideIndex === 2 ? (
              <View style={{ marginTop: 10 }}>
                <Text style={{ color: '#1F2937', fontSize: 17, fontWeight: '800', marginBottom: 8 }}>Fat quality</Text>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <CircleMetric value={fatSplit.good} label="GOOD FAT" color="#22C55E" unit="g" size="compact" />
                  <CircleMetric value={fatSplit.bad} label="BAD FAT" color="#EF4444" unit="g" size="compact" />
                  <CircleMetric value={fatSplit.unclear} label="UNCLEAR" color="#60A5FA" unit="g" size="compact" />
                </View>
              </View>
            ) : null}

            <View style={{ marginTop: 10, flexDirection: 'row', justifyContent: 'center', gap: 10 }}>
              {[0, 1, 2].map((idx) => (
                <Pressable key={idx} onPress={() => setSummarySlideIndex(idx)}>
                  <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: summarySlideIndex === idx ? '#10B981' : '#D1D5DB' }} />
                </Pressable>
              ))}
            </View>
          </View>
        </View>

        <View style={{ marginTop: 18, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ color: '#111827', fontSize: 44 / 2, fontWeight: '900' }}>Meals</Text>
          <View style={{ marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ flexDirection: 'row', backgroundColor: '#F3F4F6', borderRadius: 999, borderWidth: 1, borderColor: '#E5E7EB', padding: 4 }}>
              <Pressable onPress={() => setEnergyUnit('kcal')} style={[energyTogglePill, energyUnit === 'kcal' && energyTogglePillActive]}>
                <Text style={[energyToggleText, energyUnit === 'kcal' && energyToggleTextActive]}>kcal</Text>
              </Pressable>
              <Pressable onPress={() => setEnergyUnit('kj')} style={[energyTogglePill, energyUnit === 'kj' && energyTogglePillActive]}>
                <Text style={[energyToggleText, energyUnit === 'kj' && energyToggleTextActive]}>kJ</Text>
              </Pressable>
            </View>
            <Pressable onPress={openAskAIChat} style={{ backgroundColor: '#10B981', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8 }}>
              <Text style={{ color: '#fff', fontWeight: '900' }}>Ask AI</Text>
            </Pressable>
          </View>
        </View>

        {loading ? (
          <View style={[cardStyle, { marginTop: 12, alignItems: 'center', paddingVertical: 26, marginHorizontal: 16 }]}>
            <ActivityIndicator color={theme.colors.primary} />
            <Text style={{ color: theme.colors.muted, marginTop: 8 }}>Loading...</Text>
          </View>
        ) : (
          <>
            <View style={[cardStyle, { marginTop: 12, marginHorizontal: 16, borderRadius: 20, padding: 12 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View
                  style={{
                    width: 54,
                    height: 54,
                    borderRadius: 18,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: '#DCFCE7',
                  }}
                >
                  <Text style={{ color: '#059669', fontSize: 26, fontWeight: '900' }}>⚡</Text>
                </View>
                <View style={{ marginLeft: 10, flex: 1 }}>
                  <Text style={{ color: '#1F2937', fontSize: 32 / 2, fontWeight: '900' }}>Exercise</Text>
                  <Text style={{ color: '#6B7280', fontSize: 14 }}>
                    Burned: <Text style={{ color: '#10B981', fontWeight: '800' }}>{formatCalories(exerciseCalories, energyUnit)}</Text>
                  </Text>
                </View>
                <Pressable
                  onPress={syncExerciseDevices}
                  style={{
                    borderWidth: 1,
                    borderColor: '#E5E7EB',
                    borderRadius: 14,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    backgroundColor: '#FFFFFF',
                  }}
                >
                  <Text style={{ color: '#6B7280', fontSize: 14, fontWeight: '700' }}>Connect device</Text>
                </Pressable>
              </View>

              <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: '#EEF2F7', paddingTop: 12, flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ color: '#6B7280', flex: 1 }}>
                  {exerciseEntries.length === 0
                    ? 'No exercise logged for this date.'
                    : `${exerciseEntries.length} exercise entr${exerciseEntries.length === 1 ? 'y' : 'ies'} logged.`}
                </Text>
                <Pressable
                  onPress={openExerciseAdd}
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 21,
                    borderWidth: 1,
                    borderColor: '#A7F3D0',
                    backgroundColor: '#DCFCE7',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ color: '#059669', fontSize: 24, fontWeight: '900' }}>＋</Text>
                </Pressable>
              </View>
            </View>

            {MEALS.map((meal) => {
              const section = groupedByMeal[meal.key]
              const summary = sectionMacroTotals[meal.key]
              const isExpanded = Boolean(expandedMeals[meal.key])
              const sectionSummary =
                section.length === 0
                  ? 'No entries yet'
                  : `${summary.calories} kcal, ${summary.protein}g Protein, ${summary.carbs}g Carbs, ${summary.fat}g Fat`
              const sortedSection = [...section].sort(
                (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
              )

              return (
                <View
                  key={meal.key}
                  style={{
                    marginTop: 12,
                    marginHorizontal: 16,
                    backgroundColor: '#FFFFFF',
                    borderWidth: 1,
                    borderColor: '#E5E7EB',
                    borderRadius: 20,
                    overflow: 'hidden',
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 11 }}>
                    <Pressable
                      onPress={() => setSectionMenuMeal(meal.key)}
                      style={{
                        width: 42,
                        height: 42,
                        borderRadius: 21,
                        borderWidth: 1,
                        borderColor: '#A7F3D0',
                        backgroundColor: '#DCFCE7',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Text style={{ color: '#059669', fontSize: 23, fontWeight: '900' }}>＋</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setExpandedMeals((prev) => ({ ...prev, [meal.key]: !prev[meal.key] }))}
                      style={{ flex: 1, marginLeft: 10 }}
                    >
                      <Text style={{ color: '#1F2937', fontSize: 34 / 2, fontWeight: '900' }}>{meal.label}</Text>
                      <Text style={{ color: '#6B7280', fontSize: 14 }} numberOfLines={1}>
                        {sectionSummary}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setExpandedMeals((prev) => ({ ...prev, [meal.key]: !prev[meal.key] }))}
                      style={{ paddingHorizontal: 8, paddingVertical: 6 }}
                    >
                      <Text style={{ color: '#6B7280', fontSize: 20, fontWeight: '900' }}>{isExpanded ? '⌃' : '⌄'}</Text>
                    </Pressable>
                  </View>

                  {isExpanded ? (
                    <View style={{ borderTopWidth: 1, borderTopColor: '#F3F4F6' }}>
                      {sortedSection.length === 0 ? (
                        <Text style={{ color: '#6B7280', paddingHorizontal: 12, paddingVertical: 12, textAlign: 'center' }}>
                          No entries in this category yet.
                        </Text>
                      ) : (
		                        sortedSection.map((entry) => {
		                          const nutrients = entry.nutrients || {}
		                          const selected = selectedIds.includes(entry.id)
                          const entryId = String(entry.id || '')
                          const swipeOffset = entrySwipeOffsets[entryId] || 0
                          const closeSwipeForEntry = () => {
                            setSwipeMenuEntryId((prev) => (prev === entryId ? null : prev))
                            setEntrySwipeOffsets((prev) => ({ ...prev, [entryId]: 0 }))
                          }
		                          return (
                            <View key={entry.id} style={{ position: 'relative', overflow: 'hidden', borderTopWidth: 1, borderTopColor: '#F3F4F6' }}>
                              {!copyMode ? (
                                <View
                                  pointerEvents="box-none"
                                  style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, flexDirection: 'row', zIndex: 1 }}
                                >
                                  <Pressable
                                    onPress={() => {
                                      setEntryMenu(entry)
                                      setSwipeMenuEntryId(entryId)
                                      setEntrySwipeOffsets((prev) => ({ ...prev, [entryId]: SWIPE_MENU_WIDTH }))
                                    }}
                                    style={{
                                      width: SWIPE_MENU_WIDTH,
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      backgroundColor: '#4DAF50',
                                    }}
                                  >
                                    <MaterialCommunityIcons name="menu" size={30} color="#FFFFFF" />
                                  </Pressable>
                                  <View style={{ flex: 1, backgroundColor: swipeOffset < 0 ? '#EF4444' : '#4DAF50' }} />
                                  <Pressable
                                    onPress={() => void handleEntryDelete(entry)}
                                    style={{
                                      width: SWIPE_DELETE_WIDTH,
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      backgroundColor: '#EF4444',
                                    }}
                                  >
                                    <MaterialCommunityIcons name="trash-can-outline" size={28} color="#FFFFFF" />
                                  </Pressable>
                                </View>
                              ) : null}
                              <Pressable
                                onTouchStart={(event) => {
                                  if (copyMode || !entryId) return
                                  const touch = event.nativeEvent.touches?.[0]
                                  if (!touch) return
                                  if (swipeMenuEntryId && swipeMenuEntryId !== entryId) {
                                    setEntrySwipeOffsets((prev) => ({ ...prev, [swipeMenuEntryId]: 0 }))
                                    setSwipeMenuEntryId(null)
                                  }
                                  entrySwipeMetaRef.current[entryId] = {
                                    startX: touch.pageX,
                                    startY: touch.pageY,
                                    swiping: false,
                                    hasMoved: false,
                                  }
                                  entrySwipeBlockPressRef.current[entryId] = false
                                }}
                                onTouchMove={(event) => {
                                  if (copyMode || !entryId) return
                                  const meta = entrySwipeMetaRef.current[entryId]
                                  const touch = event.nativeEvent.touches?.[0]
                                  if (!meta || !touch) return
                                  const dx = touch.pageX - meta.startX
                                  const dy = touch.pageY - meta.startY
                                  if (!meta.swiping) {
                                    if (Math.abs(dx) < 6 || Math.abs(dx) < Math.abs(dy)) return
                                    meta.swiping = true
                                  }
                                  meta.hasMoved = true
                                  const clamped = Math.max(-SWIPE_DELETE_WIDTH, Math.min(SWIPE_MENU_WIDTH, dx))
                                  setEntrySwipeOffsets((prev) => ({ ...prev, [entryId]: clamped }))
                                }}
                                onTouchEnd={() => {
                                  if (copyMode || !entryId) return
                                  const meta = entrySwipeMetaRef.current[entryId]
                                  const offset = entrySwipeOffsets[entryId] || 0
                                  if (meta?.hasMoved) {
                                    entrySwipeBlockPressRef.current[entryId] = true
                                    setTimeout(() => {
                                      delete entrySwipeBlockPressRef.current[entryId]
                                    }, 160)
                                  }
                                  delete entrySwipeMetaRef.current[entryId]

                                  if (offset > 70) {
                                    setSwipeMenuEntryId(entryId)
                                    setEntrySwipeOffsets((prev) => ({ ...prev, [entryId]: SWIPE_MENU_WIDTH }))
                                    return
                                  }
                                  if (offset < -70) {
                                    setSwipeMenuEntryId(null)
                                    setEntrySwipeOffsets((prev) => ({ ...prev, [entryId]: -SWIPE_DELETE_WIDTH }))
                                    return
                                  }
                                  closeSwipeForEntry()
                                }}
                                onTouchCancel={() => {
                                  if (!entryId) return
                                  delete entrySwipeMetaRef.current[entryId]
                                  closeSwipeForEntry()
                                }}
		                                onPress={() => {
                                  if (!entryId) return
                                  if (entrySwipeBlockPressRef.current[entryId]) {
                                    delete entrySwipeBlockPressRef.current[entryId]
                                    return
                                  }
		                                  if (copyMode) {
		                                    setSelectedIds((prev) =>
		                                      prev.includes(entry.id) ? prev.filter((id) => id !== entry.id) : [...prev, entry.id],
		                                    )
                                    return
                                  }
                                  if (Math.abs(swipeOffset) > 0) {
                                    closeSwipeForEntry()
                                    return
                                  }
                                  openEditModal(entry)
                                }}
                                style={{
                                  paddingHorizontal: 12,
                                  paddingVertical: 10,
                                  backgroundColor: selected ? '#E8F5EB' : '#FFFFFF',
                                  transform: [{ translateX: swipeOffset }],
                                  zIndex: 2,
                                }}
                              >
                                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                  <View
                                    style={{
                                      width: 34,
                                      height: 34,
                                      borderRadius: 17,
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      backgroundColor: '#FFFFFF',
                                      marginRight: 10,
                                    }}
                                  >
                                    <Image
                                      source={{ uri: getFoodEntryIconUri(entry) }}
                                      style={{ width: 30, height: 30 }}
                                      resizeMode="contain"
                                    />
                                  </View>
                                  <View style={{ flex: 1, minWidth: 0 }}>
                                    <Text style={{ color: '#1F2937', fontSize: 18 / 1.2, fontWeight: '700' }} numberOfLines={1}>
                                      {entry.name || 'Meal entry'}
                                    </Text>
                                  </View>
                                  <View style={{ marginLeft: 10, alignItems: 'flex-end' }}>
                                    <Text style={{ color: '#1F2937', fontWeight: '800' }}>
                                      {formatCalories(readNutrient(nutrients, ['calories', 'calories_kcal']), energyUnit)}
                                    </Text>
                                    <Text style={{ color: '#6B7280', marginTop: 2, fontSize: 13 }}>
                                      {formatClockTime(entry.createdAt)}
                                    </Text>
                                  </View>
                                  {copyMode ? (
                                    <Text style={{ marginLeft: 8, color: selected ? '#059669' : '#9CA3AF', fontWeight: '900' }}>
                                      {selected ? '✓' : '○'}
                                    </Text>
                                  ) : null}
                                </View>
                              </Pressable>
                            </View>
                          )
                        })
                      )}
                    </View>
                  ) : null}
                </View>
              )
            })}
          </>
        )}

        {copyMode ? (
          <View style={[cardStyle, { marginTop: 12, marginHorizontal: 16, borderColor: '#95D5A7' }]}>
            <Text style={{ color: theme.colors.text, fontWeight: '800' }}>Copy mode</Text>
            <Text style={{ color: theme.colors.muted, marginTop: 4 }}>
              Select items, then copy them for paste into another section.
            </Text>
            <View style={{ marginTop: 10, flexDirection: 'row', gap: 8 }}>
              <Pressable onPress={copySelected} style={{ backgroundColor: theme.colors.primary, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 }}>
                <Text style={{ color: theme.colors.primaryText, fontWeight: '800' }}>Copy selected ({selectedIds.length})</Text>
              </Pressable>
              <Pressable onPress={() => { setCopyMode(false); setSelectedIds([]) }} style={{ borderWidth: 1, borderColor: theme.colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 }}>
                <Text style={{ color: theme.colors.text, fontWeight: '800' }}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </ScrollView>

      {showDatePicker ? (
        <DateTimePicker
          value={parseLocalDate(selectedDate)}
          mode="date"
          display="default"
          onChange={onDateChange}
        />
      ) : null}

      <Modal transparent visible={profileMenuOpen} animationType="fade" onRequestClose={() => setProfileMenuOpen(false)}>
        <View style={{ flex: 1 }}>
          <Pressable
            onPress={() => setProfileMenuOpen(false)}
            style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(6, 17, 14, 0.1)' }}
          />
          <View pointerEvents="box-none" style={{ flex: 1, paddingTop: 86, paddingHorizontal: 16, alignItems: 'flex-end' }}>
            <View
              style={{
                width: 242,
                backgroundColor: '#fff',
                borderRadius: 12,
                borderWidth: 1,
                borderColor: '#E5E7EB',
                overflow: 'hidden',
              }}
            >
              <View style={{ paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' }}>
                <Text style={{ color: '#111827', fontWeight: '800' }} numberOfLines={1}>
                  {accountName}
                </Text>
                {!!accountEmail ? (
                  <Text style={{ color: '#6B7280', fontSize: 12 }} numberOfLines={1}>
                    {accountEmail}
                  </Text>
                ) : null}
              </View>

              <ProfileMenuAction label="Profile" onPress={() => { setProfileMenuOpen(false); goToProfile() }} />
              <ProfileMenuAction label="Account Settings" onPress={() => { setProfileMenuOpen(false); goToAccountSettings() }} />
              <ProfileMenuAction label="Upload/Change Profile Photo" onPress={() => { setProfileMenuOpen(false); goToProfilePhoto() }} />
              <ProfileMenuAction label="Subscription & Billing" onPress={() => { setProfileMenuOpen(false); goToBilling() }} />
              <ProfileMenuAction label="Notifications" onPress={() => { setProfileMenuOpen(false); goToNotifications() }} />
              <ProfileMenuAction label="Privacy Settings" onPress={() => { setProfileMenuOpen(false); goToPrivacySettings() }} />
              <ProfileMenuAction label="Help & Support" onPress={() => { setProfileMenuOpen(false); goToSupport() }} />
              <View style={{ height: 1, backgroundColor: '#E5E7EB' }} />
              <ProfileMenuAction label="Log out" danger onPress={onPressProfileMenuLogout} />
            </View>
          </View>
        </View>
      </Modal>

      <Modal transparent visible={sectionMenuMeal != null} animationType="fade" onRequestClose={() => setSectionMenuMeal(null)}>
        <View style={modalBackdrop}>
          <View style={[modalCardLarge, { borderRadius: 20, padding: 0, overflow: 'hidden' }]}>
            <View style={{ paddingHorizontal: 14, paddingTop: 14, paddingBottom: 10 }}>
              <Text style={modalTitle}>{mealLabel(sectionMenuMeal || 'uncategorized')}</Text>
            </View>
            <ScrollView style={{ maxHeight: 420, borderTopWidth: 1, borderTopColor: '#F3F4F6' }}>
              {sectionMenuActions.map((item) => (
                <Pressable
                  key={item.id}
                  onPress={() => void runSectionAction(item.action)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingHorizontal: 14,
                    paddingVertical: 11,
                    borderTopWidth: 1,
                    borderTopColor: '#F3F4F6',
                    backgroundColor: '#FFFFFF',
                  }}
                >
                  <View
                    style={{
                      width: 42,
                      height: 42,
                      borderRadius: 12,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: item.iconBg,
                      marginRight: 10,
                    }}
                  >
                    <Text style={{ color: item.iconColor, fontSize: 20, fontWeight: '900' }}>{item.icon}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#1F2937', fontWeight: '800', fontSize: 16 }}>{item.title}</Text>
                    <Text style={{ color: '#6B7280', fontSize: 13 }}>{item.subtitle}</Text>
                  </View>
                  <Text style={{ color: '#9CA3AF', fontSize: 18, fontWeight: '800' }}>›</Text>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable onPress={() => setSectionMenuMeal(null)} style={modalCancelButton}>
              <Text style={modalCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        transparent
        visible={entryMenu != null}
        animationType="fade"
        onRequestClose={() => {
          setEntryMenu(null)
          closeEntrySwipeMenus()
        }}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(6, 17, 14, 0.18)', justifyContent: 'flex-end', padding: 12, paddingBottom: 84 }}>
          <Pressable
            onPress={() => {
              setEntryMenu(null)
              closeEntrySwipeMenus()
            }}
            style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
          />
          <View style={entryActionsSheetCard}>
            <Pressable
              onPress={() => {
                if (!entryMenu) return
                void duplicateEntry(entryMenu, selectedDate)
                setEntryMenu(null)
                closeEntrySwipeMenus()
              }}
              style={entryActionRow}
            >
              <MaterialCommunityIcons name="content-copy" size={28} color="#10B981" />
              <Text style={entryActionText}>Duplicate Meal</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                if (!entryMenu) return
                void duplicateEntry(entryMenu, formatLocalDate())
                setEntryMenu(null)
                closeEntrySwipeMenus()
              }}
              style={[entryActionRow, entryActionRowDivider]}
            >
              <MaterialCommunityIcons name="calendar-plus" size={28} color="#10B981" />
              <Text style={entryActionText}>Copy to Today</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                if (!entryMenu) return
                void copyEntryFor7Days(entryMenu)
              }}
              style={[entryActionRow, entryActionRowDivider]}
            >
              <MaterialCommunityIcons name="calendar-arrow-right" size={28} color="#10B981" />
              <Text style={entryActionText}>Copy for 7 days</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                if (!entryMenu) return
                setMoveEntryTarget(entryMenu)
                setMoveEntryMeal(String(entryMenu.meal || entryMenu.category || 'uncategorized'))
                setEntryMenu(null)
              }}
              style={[entryActionRow, entryActionRowDivider]}
            >
              <MaterialCommunityIcons name="arrow-left-right" size={28} color="#10B981" />
              <Text style={entryActionText}>Move entry</Text>
            </Pressable>
            <Pressable onPress={() => entryMenu && openEditModal(entryMenu)} style={[entryActionRow, entryActionRowDivider]}>
              <MaterialCommunityIcons name="pencil-outline" size={28} color="#10B981" />
              <Text style={entryActionText}>Edit Entry</Text>
            </Pressable>
            <Pressable onPress={() => entryMenu && void handleEntryDelete(entryMenu)} style={[entryActionRow, entryActionRowDivider]}>
              <MaterialCommunityIcons name="trash-can-outline" size={28} color="#DC2626" />
              <Text style={[entryActionText, { color: '#DC2626' }]}>Delete</Text>
              <MaterialCommunityIcons name="trash-can-outline" size={26} color="#DC2626" />
            </Pressable>
            <Pressable
              onPress={() => {
                setEntryMenu(null)
                closeEntrySwipeMenus()
              }}
              style={[entryActionRow, entryActionRowDivider, { backgroundColor: '#FFFFFF' }]}
            >
              <Text style={entryActionText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        transparent
        visible={moveEntryTarget != null}
        animationType="fade"
        onRequestClose={() => setMoveEntryTarget(null)}
      >
        <View style={modalBackdrop}>
          <View style={modalCard}>
            <Text style={modalTitle}>Move entry</Text>
            <Text style={{ color: '#6B7280', marginTop: 4 }}>Pick a meal section.</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginTop: 12 }}>
              {MEALS.map((meal) => (
                <Pressable key={meal.key} onPress={() => setMoveEntryMeal(meal.key)} style={[chip, moveEntryMeal === meal.key && chipActive]}>
                  <Text style={[chipText, moveEntryMeal === meal.key && chipTextActive]}>{meal.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <View style={{ marginTop: 12, flexDirection: 'row', gap: 8 }}>
              <Pressable onPress={() => void moveEntryToMeal()} style={primaryButton}>
                <Text style={primaryButtonText}>Move</Text>
              </Pressable>
              <Pressable onPress={() => setMoveEntryTarget(null)} style={secondaryButton}>
                <Text style={secondaryButtonText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal transparent visible={editModalOpen} animationType="fade" onRequestClose={() => setEditModalOpen(false)}>
        <View style={modalBackdrop}>
          <View style={modalCard}>
            <Text style={modalTitle}>Edit food entry</Text>
            <TextInput value={editName} onChangeText={setEditName} placeholder="Name" placeholderTextColor="#8AA39D" style={inputStyle} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginTop: 8 }}>
              {MEALS.map((meal) => (
                <Pressable key={meal.key} onPress={() => setEditMeal(meal.key)} style={[chip, editMeal === meal.key && chipActive]}>
                  <Text style={[chipText, editMeal === meal.key && chipTextActive]}>{meal.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <View style={{ marginTop: 10, gap: 8 }}>
              <LabeledNumberInput label="Calories" value={editCalories} onChange={setEditCalories} />
              <LabeledNumberInput label="Protein (g)" value={editProtein} onChange={setEditProtein} />
              <LabeledNumberInput label="Carbs (g)" value={editCarbs} onChange={setEditCarbs} />
              <LabeledNumberInput label="Fat (g)" value={editFat} onChange={setEditFat} />
              <LabeledNumberInput label="Fiber (g)" value={editFiber} onChange={setEditFiber} />
              <LabeledNumberInput label="Sugar (g)" value={editSugar} onChange={setEditSugar} />
            </View>
            <View style={{ marginTop: 12, flexDirection: 'row', gap: 8 }}>
              <Pressable onPress={() => void saveEditedEntry()} style={primaryButton}>
                <Text style={primaryButtonText}>Save</Text>
              </Pressable>
              <Pressable onPress={() => setEditModalOpen(false)} style={secondaryButton}>
                <Text style={secondaryButtonText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal transparent visible={favoritesOpen} animationType="fade" onRequestClose={() => setFavoritesOpen(false)}>
        <View style={modalBackdrop}>
          <View style={modalCardLarge}>
            <Text style={modalTitle}>Favorites picker</Text>
            <Text style={{ color: theme.colors.muted }}>Adding to: {mealLabel(favoritesTargetMeal)}</Text>

            <View style={{ marginTop: 8, flexDirection: 'row', gap: 8 }}>
              {(['all', 'favorites', 'custom'] as const).map((tab) => (
                <Pressable key={tab} onPress={() => setFavoritesTab(tab)} style={[chip, favoritesTab === tab && chipActive]}>
                  <Text style={[chipText, favoritesTab === tab && chipTextActive]}>{tab === 'all' ? 'All' : tab === 'favorites' ? 'Favorites' : 'Custom'}</Text>
                </Pressable>
              ))}
            </View>

            <TextInput
              value={favoritesSearch}
              onChangeText={setFavoritesSearch}
              placeholder="Search saved meals"
              placeholderTextColor="#8AA39D"
              style={[inputStyle, { marginTop: 8 }]}
            />

            <ScrollView style={{ marginTop: 10, maxHeight: 320 }}>
              {favoritesForList.length === 0 ? (
                <Text style={{ color: theme.colors.muted }}>No items found.</Text>
              ) : (
                favoritesForList.map((item) => (
                  <View key={item.id} style={{ borderWidth: 1, borderColor: theme.colors.border, borderRadius: 10, padding: 10, marginBottom: 8, backgroundColor: '#FBFDFC' }}>
                    <Text style={{ color: theme.colors.text, fontWeight: '800' }}>{item.name}</Text>
                    <Text style={{ color: theme.colors.muted, marginTop: 3 }}>
                      {formatCalories(item.nutrients.calories, energyUnit)} • P {round1(item.nutrients.protein)}g • C {round1(item.nutrients.carbs)}g • F {round1(item.nutrients.fat)}g
                    </Text>
                    <View style={{ marginTop: 8, flexDirection: 'row', gap: 8 }}>
                      <Pressable onPress={() => void addFavoriteToDiary(item)} style={miniPrimaryButton}>
                        <Text style={miniPrimaryText}>Add</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => {
                          const nextMeal = item.meal === 'breakfast' ? 'lunch' : item.meal === 'lunch' ? 'dinner' : 'breakfast'
                          const next = favorites.map((fav) => (fav.id === item.id ? { ...fav, meal: nextMeal } : fav))
                          void saveFavorites(next)
                        }}
                        style={miniSecondaryButton}
                      >
                        <Text style={miniSecondaryText}>Edit meal</Text>
                      </Pressable>
                      <Pressable onPress={() => void deleteFavorite(item)} style={miniDangerButton}>
                        <Text style={miniDangerText}>Delete</Text>
                      </Pressable>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>

            <Pressable onPress={() => setFavoritesOpen(false)} style={modalCancelButton}>
              <Text style={modalCancelText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal transparent visible={ingredientOpen} animationType="fade" onRequestClose={() => setIngredientOpen(false)}>
        <View style={modalBackdrop}>
          <View style={modalCardLarge}>
            <Text style={modalTitle}>Add ingredient</Text>
            <Text style={{ color: theme.colors.muted }}>Adding to: {mealLabel(ingredientTargetMeal)}</Text>
            <Text style={{ color: theme.colors.muted, marginTop: 8 }}>
              Search foods (USDA for single foods, OpenFoodFacts for packaged)
            </Text>

            <View style={{ marginTop: 8, flexDirection: 'row', gap: 8 }}>
              <Pressable
                onPress={() => {
                  setIngredientKind('packaged')
                  if (ingredientQuery.trim()) void runIngredientSearch('packaged', ingredientQuery)
                }}
                style={[chip, { flex: 1, alignItems: 'center', justifyContent: 'center' }, ingredientKind === 'packaged' && chipActive]}
              >
                <Text style={[chipText, ingredientKind === 'packaged' && chipTextActive]}>Packaged/Fast-foods</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setIngredientKind('single')
                  if (ingredientQuery.trim()) void runIngredientSearch('single', ingredientQuery)
                }}
                style={[chip, { flex: 1, alignItems: 'center', justifyContent: 'center' }, ingredientKind === 'single' && chipActive]}
              >
                <Text style={[chipText, ingredientKind === 'single' && chipTextActive]}>Single food</Text>
              </Pressable>
            </View>

            <View style={{ marginTop: 8, position: 'relative' }}>
              <TextInput
                value={ingredientQuery}
                onChangeText={(text) => {
                  setIngredientQuery(text)
                  setIngredientError('')
                }}
                onSubmitEditing={() => void runIngredientSearch()}
                returnKeyType="search"
                placeholder="e.g. pizza"
                placeholderTextColor="#8AA39D"
                style={[inputStyle, { paddingRight: 48 }]}
              />
              <Pressable
                onPress={() => void runIngredientSearch()}
                disabled={ingredientLoading || !ingredientQuery.trim()}
                style={{
                  position: 'absolute',
                  right: 8,
                  top: '50%',
                  marginTop: -16,
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: '#0F172A',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: ingredientLoading || !ingredientQuery.trim() ? 0.5 : 1,
                }}
              >
                {ingredientLoading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={{ color: '#FFFFFF', fontWeight: '900' }}>⌕</Text>
                )}
              </Pressable>
            </View>

            <View style={{ marginTop: 8, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <Pressable
                onPress={() => {
                  setIngredientOpen(false)
                  openBarcode(ingredientTargetMeal)
                }}
                style={[miniSecondaryButton, { flexBasis: '31%', alignItems: 'center' }]}
              >
                <Text style={miniSecondaryText}>Scan barcode</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setIngredientOpen(false)
                  openFavorites(ingredientTargetMeal)
                }}
                style={[miniSecondaryButton, { flexBasis: '31%', alignItems: 'center' }]}
              >
                <Text style={miniSecondaryText}>Add from favorites</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setIngredientOpen(false)
                  void createFromImage('library', ingredientTargetMeal)
                }}
                style={[miniSecondaryButton, { flexBasis: '31%', alignItems: 'center' }]}
              >
                <Text style={miniSecondaryText}>Add by photo</Text>
              </Pressable>
            </View>

            {ingredientError ? <Text style={{ color: '#DC2626', marginTop: 8 }}>{ingredientError}</Text> : null}

            <ScrollView style={{ marginTop: 10, maxHeight: 300 }}>
              {!ingredientLoading && ingredientResults.length === 0 && ingredientQuery.trim() ? (
                <Text style={{ color: theme.colors.muted }}>No results yet. Try a different search.</Text>
              ) : ingredientResults.length === 0 ? (
                <Text style={{ color: theme.colors.muted }}>Search to see results.</Text>
              ) : (
                ingredientResults.map((item) => (
                  <View key={String(item.id)} style={{ borderWidth: 1, borderColor: theme.colors.border, borderRadius: 10, padding: 10, marginBottom: 8, backgroundColor: '#FBFDFC' }}>
                    <Text style={{ color: theme.colors.text, fontWeight: '800' }}>{item.name}</Text>
                    <Text style={{ color: theme.colors.muted, marginTop: 3 }}>
                      {item.serving_size ? `Serving: ${item.serving_size} • ` : ''}
                      {Math.round(numberOrZero(item.calories ?? item.calories_kcal))} kcal
                    </Text>
                    <Text style={{ color: '#9CA3AF', marginTop: 2, fontSize: 12 }}>Source: {ingredientSourceLabel(item)}</Text>
                    <View style={{ marginTop: 8, flexDirection: 'row' }}>
                      <Pressable onPress={() => void addIngredientItem(item)} style={miniPrimaryButton}>
                        <Text style={miniPrimaryText}>Add</Text>
                      </Pressable>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>

            <Pressable onPress={() => setIngredientOpen(false)} style={modalCancelButton}>
              <Text style={modalCancelText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal transparent visible={barcodeOpen} animationType="fade" onRequestClose={() => setBarcodeOpen(false)}>
        <View style={modalBackdrop}>
          <View style={modalCard}>
            <Text style={modalTitle}>Barcode scanner</Text>
            <Text style={{ color: theme.colors.muted }}>Adding to: {mealLabel(barcodeTargetMeal)}</Text>
            <TextInput
              value={barcodeCode}
              onChangeText={setBarcodeCode}
              placeholder="Type barcode number"
              placeholderTextColor="#8AA39D"
              style={[inputStyle, { marginTop: 10 }]}
            />
            <View style={{ marginTop: 8, flexDirection: 'row', gap: 8 }}>
              <Pressable onPress={() => void captureBarcodePhoto()} style={miniSecondaryButton}>
                <Text style={miniSecondaryText}>Camera scan</Text>
              </Pressable>
              <Pressable onPress={() => setBarcodeFlashOn((prev) => !prev)} style={miniSecondaryButton}>
                <Text style={miniSecondaryText}>Flash: {barcodeFlashOn ? 'On' : 'Off'}</Text>
              </Pressable>
            </View>
            <Pressable onPress={() => void lookupBarcode()} style={[primaryButton, { marginTop: 8 }]}>
              <Text style={primaryButtonText}>{barcodeLoading ? 'Searching...' : 'Lookup barcode'}</Text>
            </Pressable>
            <Pressable onPress={() => setBarcodeLabelOpen(true)} style={[secondaryButton, { marginTop: 8 }]}>
              <Text style={secondaryButtonText}>Missing label? Capture details</Text>
            </Pressable>

            {barcodeFood ? (
              <View style={{ marginTop: 10, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 10, padding: 10 }}>
                <Text style={{ color: theme.colors.text, fontWeight: '800' }}>{barcodeFood.name}</Text>
                <Text style={{ color: theme.colors.muted, marginTop: 4 }}>
                  {formatCalories(numberOrZero(barcodeFood.calories ?? barcodeFood.calories_kcal), energyUnit)} • P {round1(numberOrZero(barcodeFood.protein_g))}g • C {round1(numberOrZero(barcodeFood.carbs_g))}g • F {round1(numberOrZero(barcodeFood.fat_g))}g
                </Text>
                <Pressable onPress={() => void addBarcodeFood()} style={[primaryButton, { marginTop: 8 }]}> 
                  <Text style={primaryButtonText}>Add to diary</Text>
                </Pressable>
              </View>
            ) : null}

            <Pressable onPress={() => setBarcodeOpen(false)} style={modalCancelButton}>
              <Text style={modalCancelText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal transparent visible={barcodeLabelOpen} animationType="fade" onRequestClose={() => setBarcodeLabelOpen(false)}>
        <View style={modalBackdrop}>
          <View style={modalCardLarge}>
            <Text style={modalTitle}>Missing label capture</Text>
            <Text style={{ color: theme.colors.muted, marginTop: 4 }}>
              Save product details so this barcode can work next time.
            </Text>

            <View style={{ marginTop: 10, gap: 8 }}>
              <TextInput
                value={barcodeLabelName}
                onChangeText={setBarcodeLabelName}
                placeholder="Product name"
                placeholderTextColor="#8AA39D"
                style={inputStyle}
              />
              <TextInput
                value={barcodeLabelBrand}
                onChangeText={setBarcodeLabelBrand}
                placeholder="Brand (optional)"
                placeholderTextColor="#8AA39D"
                style={inputStyle}
              />
              <TextInput
                value={barcodeLabelServing}
                onChangeText={setBarcodeLabelServing}
                placeholder="Serving size (example: 100 g)"
                placeholderTextColor="#8AA39D"
                style={inputStyle}
              />
              <LabeledNumberInput label="Calories" value={barcodeLabelCalories} onChange={setBarcodeLabelCalories} />
              <LabeledNumberInput label="Protein (g)" value={barcodeLabelProtein} onChange={setBarcodeLabelProtein} />
              <LabeledNumberInput label="Carbs (g)" value={barcodeLabelCarbs} onChange={setBarcodeLabelCarbs} />
              <LabeledNumberInput label="Fat (g)" value={barcodeLabelFat} onChange={setBarcodeLabelFat} />
              <LabeledNumberInput label="Fiber (g)" value={barcodeLabelFiber} onChange={setBarcodeLabelFiber} />
              <LabeledNumberInput label="Sugar (g)" value={barcodeLabelSugar} onChange={setBarcodeLabelSugar} />
            </View>

            <View style={{ marginTop: 12, flexDirection: 'row', gap: 8 }}>
              <Pressable onPress={() => void saveBarcodeLabel()} style={primaryButton}>
                <Text style={primaryButtonText}>Save label</Text>
              </Pressable>
              <Pressable onPress={() => setBarcodeLabelOpen(false)} style={secondaryButton}>
                <Text style={secondaryButtonText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal transparent visible={recommendedOpen} animationType="fade" onRequestClose={() => setRecommendedOpen(false)}>
        <View style={modalBackdrop}>
          <View style={modalCardLarge}>
            <Text style={modalTitle}>Recommended meal</Text>
            <Text style={{ color: theme.colors.muted }}>Category: {mealLabel(recommendedTargetMeal)}</Text>
            <Text style={{ color: theme.colors.muted, marginTop: 2 }}>
              Cost: {recommendedCostCredits} credit{recommendedCostCredits === 1 ? '' : 's'} per recommendation
            </Text>

            <View style={{ marginTop: 8, flexDirection: 'row', gap: 8 }}>
              <Pressable onPress={() => setRecommendedTab('ingredients')} style={[chip, recommendedTab === 'ingredients' && chipActive]}>
                <Text style={[chipText, recommendedTab === 'ingredients' && chipTextActive]}>Ingredients</Text>
              </Pressable>
              <Pressable onPress={() => setRecommendedTab('recipe')} style={[chip, recommendedTab === 'recipe' && chipActive]}>
                <Text style={[chipText, recommendedTab === 'recipe' && chipTextActive]}>Recipe</Text>
              </Pressable>
              <Pressable onPress={() => setRecommendedTab('reason')} style={[chip, recommendedTab === 'reason' && chipActive]}>
                <Text style={[chipText, recommendedTab === 'reason' && chipTextActive]}>Reason</Text>
              </Pressable>
            </View>

            <View style={{ marginTop: 10, flexDirection: 'row', gap: 8 }}>
              <Pressable onPress={() => void generateRecommended()} style={primaryButton}>
                <Text style={primaryButtonText}>{recommendedLoading ? 'Generating...' : 'Generate / Regenerate'}</Text>
              </Pressable>
              <Pressable onPress={() => void addRecommendedToDiary()} disabled={!recommendedMeal} style={[secondaryButton, !recommendedMeal && { opacity: 0.5 }]}>
                <Text style={secondaryButtonText}>Add to diary</Text>
              </Pressable>
            </View>

            <ScrollView style={{ marginTop: 10, maxHeight: 300 }}>
              {!recommendedMeal ? (
                <Text style={{ color: theme.colors.muted }}>No recommendation generated yet.</Text>
              ) : recommendedTab === 'ingredients' ? (
                <View style={{ gap: 8 }}>
                  {recommendedMeal.items.map((item, idx) => (
                    <View key={`${item.name}-${idx}`} style={{ borderWidth: 1, borderColor: theme.colors.border, borderRadius: 10, padding: 10, backgroundColor: '#FBFDFC' }}>
                      <Text style={{ color: theme.colors.text, fontWeight: '800' }}>{item.name}</Text>
                      <Text style={{ color: theme.colors.muted, marginTop: 3 }}>
                        {formatCalories(numberOrZero(item.calories), energyUnit)} each serving
                      </Text>
                      <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Pressable
                          onPress={() => updateRecommendedServing(idx, numberOrZero(item.servings) - 0.25)}
                          style={miniSecondaryButton}
                        >
                          <Text style={miniSecondaryText}>-</Text>
                        </Pressable>
                        <TextInput
                          value={String(round1(numberOrZero(item.servings) || 1))}
                          onChangeText={(next) => updateRecommendedServing(idx, numberOrZero(next))}
                          keyboardType="decimal-pad"
                          style={[inputStyle, { flex: 1, textAlign: 'center' }]}
                        />
                        <Pressable
                          onPress={() => updateRecommendedServing(idx, numberOrZero(item.servings) + 0.25)}
                          style={miniSecondaryButton}
                        >
                          <Text style={miniSecondaryText}>+</Text>
                        </Pressable>
                      </View>
                    </View>
                  ))}
                </View>
              ) : recommendedTab === 'recipe' ? (
                <View style={{ gap: 8 }}>
                  {(recommendedMeal.recipe?.steps || []).map((step, idx) => (
                    <Text key={`${idx}`} style={{ color: theme.colors.text }}>
                      {idx + 1}. {step}
                    </Text>
                  ))}
                  {(!recommendedMeal.recipe?.steps || recommendedMeal.recipe.steps.length === 0) ? (
                    <Text style={{ color: theme.colors.muted }}>No recipe steps yet.</Text>
                  ) : null}
                </View>
              ) : (
                <Text style={{ color: theme.colors.text }}>{recommendedMeal.why || 'No reason text available.'}</Text>
              )}
            </ScrollView>

            <View style={{ marginTop: 10 }}>
              <Text style={{ color: theme.colors.muted, fontWeight: '700' }}>History</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginTop: 6 }}>
                {recommendedHistory.map((item) => (
                  <Pressable
                    key={item.id}
                    onPress={() => setRecommendedMeal(item)}
                    style={{ borderWidth: 1, borderColor: theme.colors.border, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#FBFDFC' }}
                  >
                    <Text style={{ color: theme.colors.text, fontWeight: '700' }}>{item.mealName}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            <Pressable onPress={() => setRecommendedOpen(false)} style={modalCancelButton}>
              <Text style={modalCancelText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        transparent
        visible={recommendedExplainOpen}
        animationType="fade"
        onRequestClose={() => setRecommendedExplainOpen(false)}
      >
        <View style={modalBackdrop}>
          <View style={modalCard}>
            <Text style={modalTitle}>Recommended meal explainer</Text>
            <Text style={{ color: theme.colors.muted, marginTop: 8 }}>
              You will get a suggested meal based on your targets and what you have already eaten today.
            </Text>
            <View style={{ marginTop: 10, borderWidth: 1, borderColor: '#A7F3D0', borderRadius: 10, backgroundColor: '#ECFDF5', padding: 10 }}>
              <Text style={{ color: '#065F46', fontWeight: '800' }}>
                Cost: {recommendedCostCredits} credit{recommendedCostCredits === 1 ? '' : 's'} per recommendation
              </Text>
            </View>
            <View style={{ marginTop: 12, flexDirection: 'row', gap: 8 }}>
              <Pressable
                onPress={() => {
                  void markRecommendedExplainSeen()
                  setRecommendedExplainOpen(false)
                }}
                style={primaryButton}
              >
                <Text style={primaryButtonText}>Continue</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setRecommendedExplainOpen(false)
                  setRecommendedOpen(false)
                }}
                style={secondaryButton}
              >
                <Text style={secondaryButtonText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal transparent visible={combineOpen} animationType="fade" onRequestClose={() => setCombineOpen(false)}>
        <View style={modalBackdrop}>
          <View style={modalCardLarge}>
            <Text style={modalTitle}>Combine ingredients / Build meal</Text>
            <Text style={{ color: theme.colors.muted }}>Target section: {mealLabel(combineTargetMeal)}</Text>

            <TextInput
              value={combineName}
              onChangeText={setCombineName}
              placeholder="New meal name"
              placeholderTextColor="#8AA39D"
              style={[inputStyle, { marginTop: 8 }]}
            />

            <ScrollView style={{ marginTop: 10, maxHeight: 280 }}>
              {entries.length === 0 ? (
                <Text style={{ color: theme.colors.muted }}>No entries available.</Text>
              ) : (
                entries.map((entry) => {
                  const selected = combineIds.includes(entry.id)
                  return (
                    <Pressable
                      key={entry.id}
                      onPress={() => {
                        setCombineIds((prev) =>
                          prev.includes(entry.id) ? prev.filter((id) => id !== entry.id) : [...prev, entry.id],
                        )
                      }}
                      style={{
                        borderWidth: 1,
                        borderColor: selected ? theme.colors.primary : theme.colors.border,
                        borderRadius: 10,
                        padding: 10,
                        marginBottom: 8,
                        backgroundColor: selected ? '#E8F5EB' : '#FBFDFC',
                      }}
                    >
                      <Text style={{ color: theme.colors.text, fontWeight: '800' }}>{entry.name}</Text>
                      <Text style={{ color: theme.colors.muted, marginTop: 2 }}>{mealLabel(String(entry.meal || 'uncategorized'))}</Text>
                    </Pressable>
                  )
                })
              )}
            </ScrollView>

            <View style={{ marginTop: 10, flexDirection: 'row', gap: 8 }}>
              <Pressable onPress={() => void saveCombinedMeal()} style={primaryButton}>
                <Text style={primaryButtonText}>Save combined meal</Text>
              </Pressable>
              <Pressable onPress={() => setCombineOpen(false)} style={secondaryButton}>
                <Text style={secondaryButtonText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal transparent visible={waterEditOpen} animationType="fade" onRequestClose={() => setWaterEditOpen(false)}>
        <View style={modalBackdrop}>
          <View style={modalCard}>
            <Text style={modalTitle}>Edit water entry</Text>
            <TextInput
              value={waterEditAmount}
              onChangeText={setWaterEditAmount}
              keyboardType="decimal-pad"
              placeholder="Amount"
              placeholderTextColor="#8AA39D"
              style={[inputStyle, { marginTop: 8 }]}
            />
            <View style={{ marginTop: 8, flexDirection: 'row', gap: 8 }}>
              {(['ml', 'l', 'oz'] as const).map((unit) => (
                <Pressable key={unit} onPress={() => setWaterEditUnit(unit)} style={[chip, waterEditUnit === unit && chipActive]}>
                  <Text style={[chipText, waterEditUnit === unit && chipTextActive]}>{unit}</Text>
                </Pressable>
              ))}
            </View>
            <View style={{ marginTop: 12, flexDirection: 'row', gap: 8 }}>
              <Pressable onPress={() => void saveWaterEdit()} style={primaryButton}>
                <Text style={primaryButtonText}>Save</Text>
              </Pressable>
              <Pressable onPress={() => setWaterEditOpen(false)} style={secondaryButton}>
                <Text style={secondaryButtonText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal transparent visible={exerciseOpen} animationType="fade" onRequestClose={() => setExerciseOpen(false)}>
        <View style={modalBackdrop}>
          <View style={modalCardLarge}>
            <Text style={modalTitle}>{exerciseEditId ? 'Edit exercise' : 'Add exercise'}</Text>

            <TextInput
              value={exerciseTypeSearch}
              onChangeText={setExerciseTypeSearch}
              placeholder="Search exercise type"
              placeholderTextColor="#8AA39D"
              style={[inputStyle, { marginTop: 8 }]}
            />

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginTop: 8 }}>
              <Pressable onPress={() => setExerciseCategoryFilter('')} style={[chip, !exerciseCategoryFilter && chipActive]}>
                <Text style={[chipText, !exerciseCategoryFilter && chipTextActive]}>All categories</Text>
              </Pressable>
              {exerciseCategories.map((category) => (
                <Pressable key={category} onPress={() => setExerciseCategoryFilter(category)} style={[chip, exerciseCategoryFilter === category && chipActive]}>
                  <Text style={[chipText, exerciseCategoryFilter === category && chipTextActive]}>{category}</Text>
                </Pressable>
              ))}
            </ScrollView>

            <ScrollView style={{ marginTop: 8, maxHeight: 130 }}>
              {exerciseTypes.map((item) => {
                const selected = exerciseTypeId === item.id
                return (
                  <Pressable
                    key={item.id}
                    onPress={() => setExerciseTypeId(item.id)}
                    style={{
                      borderWidth: 1,
                      borderColor: selected ? theme.colors.primary : theme.colors.border,
                      borderRadius: 10,
                      padding: 8,
                      marginBottom: 6,
                      backgroundColor: selected ? '#E8F5EB' : '#FBFDFC',
                    }}
                  >
                    <Text style={{ color: theme.colors.text, fontWeight: '800' }}>{item.name}</Text>
                    <Text style={{ color: theme.colors.muted }}>{item.category}</Text>
                  </Pressable>
                )
              })}
            </ScrollView>

            <View style={{ marginTop: 8, gap: 8 }}>
              <LabeledNumberInput label="Duration (minutes)" value={exerciseDuration} onChange={setExerciseDuration} />
              <LabeledNumberInput label={`Distance (${exerciseDistanceUnit})`} value={exerciseDistance} onChange={setExerciseDistance} />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Pressable onPress={() => setExerciseDistanceUnit('km')} style={[chip, exerciseDistanceUnit === 'km' && chipActive]}>
                  <Text style={[chipText, exerciseDistanceUnit === 'km' && chipTextActive]}>km</Text>
                </Pressable>
                <Pressable onPress={() => setExerciseDistanceUnit('mi')} style={[chip, exerciseDistanceUnit === 'mi' && chipActive]}>
                  <Text style={[chipText, exerciseDistanceUnit === 'mi' && chipTextActive]}>mi</Text>
                </Pressable>
              </View>
              <TextInput
                value={exerciseStartTime}
                onChangeText={setExerciseStartTime}
                placeholder="Start time (HH:MM)"
                placeholderTextColor="#8AA39D"
                style={inputStyle}
              />
              <TextInput
                value={exerciseCaloriesOverride}
                onChangeText={setExerciseCaloriesOverride}
                keyboardType="decimal-pad"
                placeholder="Optional calories override"
                placeholderTextColor="#8AA39D"
                style={inputStyle}
              />
              <Text style={{ color: theme.colors.muted }}>
                Type: {exerciseTypeName || 'None'} • Preview: {exerciseCaloriesPreview == null ? '—' : formatCalories(exerciseCaloriesPreview, energyUnit)}
              </Text>
            </View>

            <View style={{ marginTop: 12, flexDirection: 'row', gap: 8 }}>
              <Pressable onPress={() => void saveExercise()} style={primaryButton}>
                <Text style={primaryButtonText}>{exerciseEditId ? 'Save changes' : 'Add exercise'}</Text>
              </Pressable>
              <Pressable onPress={() => setExerciseOpen(false)} style={secondaryButton}>
                <Text style={secondaryButtonText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {saving ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
            backgroundColor: 'rgba(255,255,255,0.35)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <View style={{ backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, borderWidth: 1, borderColor: theme.colors.border }}>
            <Text style={{ color: theme.colors.text, fontWeight: '800' }}>Saving...</Text>
          </View>
        </View>
      ) : null}
    </Screen>
  )
}

function CircleMetric({
  value,
  label,
  color,
  unit,
  size = 'normal',
}: {
  value: number
  label: string
  color: string
  unit: 'kcal' | 'kj' | 'g'
  size?: 'normal' | 'compact'
}) {
  const compact = size === 'compact'
  const ringSize = compact ? 92 : 110
  const ringBorder = compact ? 6 : 7
  const valueFontSize = compact ? 16 : 18
  const labelFontSize = compact ? 13 : 14
  const display = unit === 'kj' ? Math.round(value * 4.184) : unit === 'kcal' ? Math.round(value) : formatMacroAmount(value)

  return (
    <View style={{ alignItems: 'center' }}>
      <View
        style={{
          width: ringSize,
          height: ringSize,
          borderRadius: ringSize / 2,
          borderWidth: ringBorder,
          borderColor: color,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#fff',
        }}
      >
        <Text style={{ color: '#111827', fontSize: valueFontSize, fontWeight: '700' }}>{display}</Text>
        <Text style={{ color: '#6B7280', marginTop: 1, fontSize: 14 / 1.4 }}>{unit}</Text>
      </View>
      <Text style={{ marginTop: compact ? 6 : 8, color: '#374151', fontWeight: '700', fontSize: labelFontSize, textTransform: 'uppercase' }}>
        {label}
      </Text>
    </View>
  )
}

function ProgressRow({
  label,
  value,
  target,
  unit,
}: {
  label: string
  value: number
  target: number
  unit: 'kcal' | 'kj' | 'g'
}) {
  const ratio = target > 0 ? clamp(value / target, 0, 1) : 0
  const displayValue = unit === 'kj' ? Math.round(value * 4.184) : Math.round(value)
  const displayTarget = unit === 'kj' ? Math.round(target * 4.184) : Math.round(target)

  return (
    <View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ color: theme.colors.text, fontWeight: '700' }}>{label}</Text>
        <Text style={{ color: theme.colors.muted, fontWeight: '700' }}>
          {displayValue}/{displayTarget} {unit}
        </Text>
      </View>
      <View style={{ marginTop: 5, height: 7, borderRadius: 999, backgroundColor: '#E6EFEC', overflow: 'hidden' }}>
        <View style={{ width: `${Math.round(ratio * 100)}%`, height: '100%', backgroundColor: theme.colors.primary }} />
      </View>
    </View>
  )
}

function LabeledNumberInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (next: string) => void
}) {
  return (
    <View>
      <Text style={{ color: theme.colors.text, fontWeight: '700', marginBottom: 4 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType="decimal-pad"
        placeholder="0"
        placeholderTextColor="#8AA39D"
        style={inputStyle}
      />
    </View>
  )
}

function ProfileMenuAction({
  label,
  onPress,
  danger,
}: {
  label: string
  onPress: () => void
  danger?: boolean
}) {
  return (
    <Pressable onPress={onPress} style={{ paddingHorizontal: 12, paddingVertical: 10 }}>
      <Text style={{ color: danger ? '#DC2626' : '#111827', fontWeight: '700' }}>{label}</Text>
    </Pressable>
  )
}

const cardStyle = {
  backgroundColor: theme.colors.card,
  borderWidth: 1,
  borderColor: theme.colors.border,
  borderRadius: theme.radius.lg,
  padding: 14,
}

const dateArrowCircle = {
  width: 64,
  height: 64,
  borderRadius: 32,
  backgroundColor: '#E5E7EB',
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
}

const dateCenterPill = {
  flex: 1,
  marginHorizontal: 10,
  borderRadius: 28,
  borderWidth: 1,
  borderColor: '#D1D5DB',
  backgroundColor: '#FFFFFF',
  paddingVertical: 16,
  paddingHorizontal: 14,
  alignItems: 'center' as const,
}

const energyTogglePill = {
  borderRadius: 999,
  paddingHorizontal: 12,
  paddingVertical: 6,
}

const energyTogglePillActive = {
  backgroundColor: '#FFFFFF',
}

const energyToggleText = {
  color: '#6B7280',
  fontWeight: '700' as const,
}

const energyToggleTextActive = {
  color: '#111827',
}

const chip = {
  borderWidth: 1,
  borderColor: theme.colors.border,
  borderRadius: 999,
  paddingHorizontal: 12,
  paddingVertical: 7,
  backgroundColor: theme.colors.card,
}

const chipActive = {
  borderColor: theme.colors.primary,
  backgroundColor: '#E8F5EB',
}

const chipText = {
  color: theme.colors.text,
  fontWeight: '700' as const,
}

const chipTextActive = {
  color: theme.colors.primary,
}

const inputStyle = {
  borderWidth: 1,
  borderColor: theme.colors.border,
  borderRadius: theme.radius.md,
  backgroundColor: theme.colors.card,
  color: theme.colors.text,
  paddingHorizontal: 12,
  paddingVertical: 10,
  fontWeight: '700' as const,
}

const pillButton = {
  borderWidth: 1,
  borderColor: theme.colors.border,
  borderRadius: 999,
  paddingHorizontal: 12,
  paddingVertical: 8,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  backgroundColor: theme.colors.card,
}

const pillButtonText = {
  color: theme.colors.text,
  fontWeight: '800' as const,
}

const modalBackdrop = {
  flex: 1,
  backgroundColor: 'rgba(6, 17, 14, 0.35)',
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  padding: 16,
}

const modalCard = {
  width: '100%' as const,
  backgroundColor: '#fff',
  borderRadius: 14,
  borderWidth: 1,
  borderColor: theme.colors.border,
  padding: 14,
}

const modalCardLarge = {
  width: '100%' as const,
  backgroundColor: '#fff',
  borderRadius: 14,
  borderWidth: 1,
  borderColor: theme.colors.border,
  padding: 14,
  maxHeight: '90%' as const,
}

const modalTitle = {
  color: theme.colors.text,
  fontSize: 20,
  fontWeight: '900' as const,
}

const entryActionsSheetCard = {
  borderRadius: 26,
  overflow: 'hidden' as const,
  backgroundColor: '#F5F7F9',
  borderWidth: 1,
  borderColor: '#E5E7EB',
}

const entryActionRow = {
  minHeight: 74,
  paddingHorizontal: 16,
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  gap: 14,
}

const entryActionRowDivider = {
  borderTopWidth: 1,
  borderTopColor: '#D9DEE5',
}

const entryActionText = {
  color: '#111827',
  fontSize: 18,
  fontWeight: '500' as const,
  flex: 1,
}

const modalCancelButton = {
  marginTop: 12,
  alignSelf: 'center' as const,
  paddingHorizontal: 14,
  paddingVertical: 8,
}

const modalCancelText = {
  color: theme.colors.muted,
  fontWeight: '800' as const,
}

const primaryButton = {
  flex: 1,
  borderRadius: 10,
  backgroundColor: theme.colors.primary,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  paddingVertical: 10,
}

const primaryButtonText = {
  color: theme.colors.primaryText,
  fontWeight: '900' as const,
}

const secondaryButton = {
  flex: 1,
  borderRadius: 10,
  borderWidth: 1,
  borderColor: theme.colors.border,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  paddingVertical: 10,
  backgroundColor: theme.colors.card,
}

const secondaryButtonText = {
  color: theme.colors.text,
  fontWeight: '800' as const,
}

const miniPrimaryButton = {
  borderRadius: 10,
  backgroundColor: theme.colors.primary,
  paddingHorizontal: 10,
  paddingVertical: 8,
}

const miniPrimaryText = {
  color: theme.colors.primaryText,
  fontWeight: '800' as const,
}

const miniSecondaryButton = {
  borderRadius: 10,
  borderWidth: 1,
  borderColor: theme.colors.border,
  paddingHorizontal: 10,
  paddingVertical: 8,
}

const miniSecondaryText = {
  color: theme.colors.text,
  fontWeight: '700' as const,
}

const miniDangerButton = {
  borderRadius: 10,
  borderWidth: 1,
  borderColor: '#FCA5A5',
  backgroundColor: '#FEF2F2',
  paddingHorizontal: 10,
  paddingVertical: 8,
}

const miniDangerText = {
  color: '#B91C1C',
  fontWeight: '700' as const,
}
