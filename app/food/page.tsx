'use client'
import { Cog6ToothIcon } from '@heroicons/react/24/outline'
/**
 * WARNING FOR FUTURE EDITS
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
import { STARTER_FOODS, StarterFood } from '@/data/foods-starter'

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

const formatServingsDisplay = (value: number | null | undefined) => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return '1'
  const rounded = Math.round(numeric * 100) / 100
  if (Number.isInteger(rounded)) return String(rounded)
  return rounded.toFixed(2).replace(/\.0+$/, '').replace(/(\.[1-9])0$/, '$1')
}

const buildMealSummaryFromItems = (items: any[] | null | undefined) => {
  if (!Array.isArray(items) || items.length === 0) return ''

  const summaryParts = items.map((item) => {
    const pieces: string[] = []
    const servings = Number(item?.servings)
    if (Number.isFinite(servings) && Math.abs(servings - 1) > 0.001) {
      pieces.push(`${formatServingsDisplay(servings)}×`)
    }
    if (item?.brand) {
      pieces.push(String(item.brand))
    }
    pieces.push(item?.name ? String(item.name) : 'Food item')
    if (item?.serving_size) {
      pieces.push(`(${item.serving_size})`)
    }
    return pieces.join(' ').replace(/\s+/g, ' ').trim()
  })

  return summaryParts.join(', ')
}

const formatMacroValue = (value: number | null | undefined, unit: string) => {
  if (value === null || value === undefined) {
    return unit ? `0${unit}` : '0'
  }
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) {
    return unit ? `0${unit}` : '0'
  }
  if (unit) {
    return `${Math.round(numeric * 10) / 10}${unit}`
  }
  return `${Math.round(numeric)}`
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
    'egg','slice','cookie','piece','patty','wing','nugget','meatball','stick','bar','biscuit','pancake','scoop'
  ]
  return discreteKeywords.some(k => l.includes(k))
}

const extractStructuredItemsFromAnalysis = (analysis: string | null | undefined) => {
  if (!analysis) return null
  // Strategy:
  // 1) Try tagged block <ITEMS_JSON>...</ITEMS_JSON>
  // 2) If not found, try to locate a JSON object containing "items":[...]
  // 3) Use relaxed parsing where necessary
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
        items: payload.items,
        total: payload.total || null,
      }
    }
    return null
  }
  // 1) Tagged block
  const tagged = analysis.match(/<ITEMS_JSON>([\s\S]+?)<\/ITEMS_JSON>/i)
  if (tagged && tagged[1]) {
    const res = tryParse(tagged[1].trim())
    if (res) return res
  }
  // 2) Untagged JSON containing "items":[...]
  const jsonBlock = analysis.match(/\{[\s\S]*?"items"\s*:\s*\[[\s\S]*?\][\s\S]*?\}/)
  if (jsonBlock && jsonBlock[0]) {
    const res = tryParse(jsonBlock[0].trim())
    if (res) return res
  }
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
  const [ingredientSearchQuery, setIngredientSearchQuery] = useState<string>('') 
  
  // Manual food entry states
  const [manualFoodName, setManualFoodName] = useState('')
  const [manualFoodType, setManualFoodType] = useState('single')
  const [manualIngredients, setManualIngredients] = useState([{ name: '', weight: '', unit: 'g' }])
  const [showEntryOptions, setShowEntryOptions] = useState<string | null>(null)
  const [showIngredientOptions, setShowIngredientOptions] = useState<string | null>(null)
  const [editingEntry, setEditingEntry] = useState<any>(null)
  const [originalEditingEntry, setOriginalEditingEntry] = useState<any>(null)

  const descriptionTextareaRef = useRef<HTMLTextAreaElement | null>(null)

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

  const applyRecalculatedNutrition = (items: any[]) => {
    const recalculated = recalculateNutritionFromItems(items)
    setAnalyzedNutrition(recalculated)
    setAnalyzedTotal(convertTotalsForStorage(recalculated))
  }

  const filteredStarterFoods = useMemo(() => {
    const q = ingredientSearchQuery.trim().toLowerCase()
    if (!q) return STARTER_FOODS
    return STARTER_FOODS.filter(f =>
      f.name.toLowerCase().includes(q) ||
      (f.brand || '').toLowerCase().includes(q)
    )
  }, [ingredientSearchQuery])

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

  const addIngredientFromStarter = (food: StarterFood) => {
    const newItem = {
      name: food.name,
      brand: food.brand ?? null,
      serving_size: food.serving_size,
      servings: 1,
      calories: food.calories,
      protein_g: food.protein_g,
      carbs_g: food.carbs_g,
      fat_g: food.fat_g,
      fiber_g: food.fiber_g ?? 0,
      sugar_g: food.sugar_g ?? 0,
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
    setIngredientSearchQuery('')
  }

  const applyStructuredItems = (itemsFromApi: any[] | null | undefined, totalFromApi: any, analysisText: string | null | undefined) => {
    let finalItems = Array.isArray(itemsFromApi) ? itemsFromApi : []
    let finalTotal = totalFromApi || null
    if (!finalItems.length) {
      const fallback = extractStructuredItemsFromAnalysis(analysisText)
      if (fallback?.items?.length) {
        finalItems = fallback.items
        finalTotal = fallback.total || finalTotal
      }
    }
    if (finalItems.length > 0) {
      setAnalyzedItems(finalItems)
      applyRecalculatedNutrition(finalItems)
    } else {
      setAnalyzedItems([])
      setAnalyzedTotal(finalTotal)
    }
  }

  const clampNumber = (value: any, min: number, max: number) => {
    const num = Number(value)
    if (!Number.isFinite(num)) return min
    if (num < min) return min
    if (num > max) return max
    return num
  }

  const updateItemField = (index: number, field: 'name' | 'brand' | 'serving_size' | 'servings' | 'calories' | 'protein_g' | 'carbs_g' | 'fat_g' | 'fiber_g' | 'sugar_g', value: any) => {
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
      // Snap servings to appropriate step:
      // - Discrete units (eggs/slices) => step = 1 / quantity-per-serving
      // - Otherwise => 0.25
      const meta = parseServingUnitMetadata(itemsCopy[index].serving_size || '')
      const step = meta && isDiscreteUnitLabel(meta.unitLabel) ? (1 / meta.quantity) : 0.25
      const clamped = clampNumber(value, 0, 20)
      const snapped = step > 0 ? Math.round(clamped / step) * step : clamped
      itemsCopy[index].servings = snapped
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

  // Profile data - using consistent green avatar
  const defaultAvatar = 'data:image/svg+xml;base64,' + btoa(`
    <svg width="128" height="128" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg">
      <circle cx="64" cy="64" r="64" fill="#10B981"/>
      <circle cx="64" cy="48" r="20" fill="white"/>
      <path d="M64 76c-13.33 0-24 5.34-24 12v16c0 8.84 7.16 16 16 16h16c8.84 0 16-7.16 16-16V88c0-6.66-10.67-12-24-12z" fill="white"/>
    </svg>
  `);
  const userImage = profileImage || session?.user?.image || defaultAvatar;
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
    }
    if (dropdownOpen || showPhotoOptions || showEntryOptions || showIngredientOptions) {
      document.addEventListener('mousedown', handleClick);
      return () => document.removeEventListener('mousedown', handleClick);
    }
  }, [dropdownOpen, showPhotoOptions, showEntryOptions, showIngredientOptions]);



  // Load today's foods from context data (no API calls needed!)
  useEffect(() => {
    if (isViewingToday && userData?.todaysFoods) {
      console.log('🚀 PERFORMANCE: Using cached foods from context - instant load!');
      // Filter to only entries created on the selected (today) date using the entry timestamp id
      const onlySelectedDate = userData.todaysFoods.filter((item: any) => {
        try {
          const d = new Date(typeof item.id === 'number' ? item.id : Number(item.id));
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          const itemDate = `${y}-${m}-${day}`;
          return itemDate === selectedDate;
        } catch {
          return false;
        }
      });
      setTodaysFoods(onlySelectedDate);
    }
  }, [userData, isViewingToday, selectedDate]);

  // Load history for non-today dates
  useEffect(() => {
    const loadHistory = async () => {
      if (isViewingToday) {
        setHistoryFoods(null);
        return;
      }
      try {
        setIsLoadingHistory(true);
        const tz = new Date().getTimezoneOffset();
        const res = await fetch(`/api/food-log?date=${selectedDate}&tz=${tz}`);
        if (res.ok) {
          const json = await res.json();
          const logs = Array.isArray(json.logs) ? json.logs : [];
          const mapped = logs.map((l: any) => ({
            id: new Date(l.createdAt).getTime(), // UI key and sorting by timestamp
            dbId: l.id, // actual database id for delete operations
            description: l.description || l.name,
            time: new Date(l.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            method: l.imageUrl ? 'photo' : 'text',
            photo: l.imageUrl || null,
            nutrition: l.nutrients || null,
          }));
          setHistoryFoods(mapped);
        } else {
          setHistoryFoods([]);
        }
      } catch (e) {
        setHistoryFoods([]);
      } finally {
        setIsLoadingHistory(false);
      }
    };
    loadHistory();
  }, [selectedDate, isViewingToday]);

  // Save food entries to database and update context (OPTIMIZED)
  const saveFoodEntries = async (updatedFoods: any[], options?: { appendHistory?: boolean }) => {
    try {
      // Update context immediately for instant UI updates
      updateUserData({ todaysFoods: updatedFoods });
      console.log('🚀 PERFORMANCE: Food updated in cache instantly - UI responsive!');
      
      // Background save to database (don't wait for response)
      fetch('/api/user-data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          todaysFoods: updatedFoods
        }),
      }).then(response => {
        if (!response.ok) {
          console.error('Background save failed - but UI already updated');
        } else {
          console.log('🚀 PERFORMANCE: Food saved to database in background');
        }
      }).catch(error => {
        console.error('Background save error:', error);
      });
      // Show a brief visual confirmation
      try {
        setShowSavedToast(true);
        setTimeout(() => setShowSavedToast(false), 1500);
      } catch {}
      // Fire-and-forget history append (skip for edits/deletes)
      if (options?.appendHistory !== false) {
        try {
          const last = updatedFoods[0];
          if (last) {
            fetch('/api/food-log', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ description: last.description, nutrition: last.nutrition, imageUrl: last.photo || null })
            }).catch(() => {});
          }
        } catch {}
      }
    } catch (error) {
      console.error('Error in saveFoodEntries:', error);
    }
  };

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

  const extractNutritionData = (description: string) => {
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
  const recalculateNutritionFromItems = (items: any[]) => {
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

const convertTotalsForStorage = (totals: ReturnType<typeof recalculateNutritionFromItems>) => {
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

  const formatNutrientValue = (key: typeof NUTRIENT_DISPLAY_ORDER[number], value: number) => {
    const safeValue = Number.isFinite(value) ? value : 0
    if (key === 'calories') {
      return `${Math.round(safeValue)}`
    }
    const rounded = Math.round(safeValue * 10) / 10
    const unit = NUTRIENT_CARD_META[key]?.unit || ''
    return `${rounded}${unit}`
  }

  const analyzePhoto = async () => {
    if (!photoFile) return;
    
    setIsAnalyzing(true);
    
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
      console.log('✅ FormData created successfully');

      // Step 3: API call with detailed logging
      console.log('🌐 Calling API endpoint...');
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
        setAiDescription(result.analysis);
        setAnalyzedNutrition(extractNutritionData(result.analysis));
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
    }
  };

  const analyzeManualFood = async () => {
    // Validation for single food
    if (manualFoodType === 'single' && (!manualFoodName.trim() || !manualIngredients[0]?.weight?.trim())) return;
    
    // Validation for multiple ingredients
    if (manualFoodType === 'multiple' && manualIngredients.every(ing => !ing.name.trim() || !ing.weight.trim())) return;
    
    setIsAnalyzing(true);
    
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
          foodType: manualFoodType
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to analyze food');
      }

      const result = await response.json();
      
      if (result.analysis) {
        setAiDescription(result.analysis);
        setAnalyzedNutrition(extractNutritionData(result.analysis));
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

    // Build description from items if available, otherwise use provided description
    let finalDescription = description;
    if (analyzedItems && analyzedItems.length > 0) {
      // Create a clean description from items
      const itemDescriptions = analyzedItems.map((item: any) => {
        const servings = item.servings || 1;
        const servingText = servings !== 1 ? `${servings}x ` : '';
        const brandText = item.brand ? `${item.brand} ` : '';
        const servingSizeText = item.serving_size ? `(${item.serving_size})` : '';
        return `${servingText}${brandText}${item.name}${servingSizeText ? ' ' + servingSizeText : ''}`;
      });
      finalDescription = itemDescriptions.join(', ');
    }
    
    const newEntry = {
      id: Date.now(),
      description: finalDescription,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      method,
      photo: method === 'photo' ? photoPreview : null,
      nutrition: nutrition || analyzedNutrition,
      items: analyzedItems && analyzedItems.length > 0 ? analyzedItems : null, // Store structured items
      total: analyzedTotal || null // Store total nutrition
    };
    
    const updatedFoods = [newEntry, ...todaysFoods];
    setTodaysFoods(updatedFoods);
    
    // Save to database (this triggers background insight regeneration)
    await saveFoodEntries(updatedFoods);
    
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
    setNewFoodText('');
    setPhotoFile(null);
    setPhotoPreview(null);
    setAiDescription('');
    setShowAiResult(false);
    setIsEditingDescription(false);
    setEditedDescription('');
    setShowAddFood(false);
    setShowPhotoOptions(false);
    setAnalyzedNutrition(null);
    setAnalyzedItems([]);
    setAnalyzedTotal(null);
    setHealthWarning(null);
    setHealthAlternatives(null);
    setEditingEntry(null);
  };

  // New function to update existing entries with AI re-analysis
  const updateFoodEntry = async () => {
    if (!editingEntry) return;

    const generatedSummary = buildMealSummaryFromItems(analyzedItems);
    const fallbackDescription = (editedDescription?.trim?.() || aiDescription || editingEntry.description || '').trim();
    const finalDescription = generatedSummary || fallbackDescription;

    const updatedEntry = {
      ...editingEntry,
      description: finalDescription,
      photo: photoPreview || editingEntry.photo,
      nutrition: analyzedNutrition || editingEntry.nutrition,
      items: analyzedItems && analyzedItems.length > 0 ? analyzedItems : (editingEntry.items || null),
      total: analyzedTotal || (editingEntry.total || null)
    };

    const updatedFoods = todaysFoods.map(food => 
      food.id === editingEntry.id ? updatedEntry : food
    );
    
    setTodaysFoods(updatedFoods);
    await saveFoodEntries(updatedFoods, { appendHistory: false });
    
    // Reset all form states
    setNewFoodText('');
    setPhotoFile(null);
    setPhotoPreview(null);
    setAiDescription('');
    setShowAiResult(false);
    setIsEditingDescription(false);
    setEditedDescription('');
    setShowAddFood(false);
    setShowPhotoOptions(false);
    setAnalyzedNutrition(null);
    setAnalyzedItems([]);
    setAnalyzedTotal(null);
    setHealthWarning(null);
    setHealthAlternatives(null);
    setEditingEntry(null);
  };

  const reanalyzeCurrentEntry = async () => {
    const descriptionToAnalyze = (editedDescription?.trim?.() || aiDescription || editingEntry?.description || '').trim();
    if (!descriptionToAnalyze) return;

    setIsAnalyzing(true);
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
          setAiDescription(result.analysis);
          setAnalyzedNutrition(extractNutritionData(result.analysis));
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
      exitEditingSession()
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
      setPhotoPreview(food.photo);
      setAiDescription(food.description);
      setAnalyzedNutrition(food.nutrition);
      // Restore items if available
      if (food.items && Array.isArray(food.items)) {
        setAnalyzedItems(food.items);
        if (food.items.length > 0) {
          applyRecalculatedNutrition(food.items);
        } else {
          setAnalyzedTotal(food.total || null);
        }
      } else {
        setAnalyzedItems([]);
        setAnalyzedTotal(null);
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
    const updatedFoods = todaysFoods.filter(food => food.id !== foodId);
    setTodaysFoods(updatedFoods);
    await saveFoodEntries(updatedFoods);
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
          setHasPaidAccess(Boolean(data?.hasAccess))
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
    <div className="flex-1 flex flex-col bg-gray-50">
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
                <Image
                  src={userImage}
                  alt="Profile"
                  width={40}
                  height={40}
                  className="w-10 h-10 rounded-full border-2 border-helfi-green shadow-sm object-cover"
                />
              </button>
              {dropdownOpen && (
                <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-lg py-2 z-50 border border-gray-100 animate-fade-in">
                  <div className="flex items-center px-4 py-3 border-b border-gray-100">
                    <Image
                      src={userImage}
                      alt="Profile"
                      width={40}
                      height={40}
                      className="w-10 h-10 rounded-full object-cover mr-3"
                    />
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
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-2 sm:px-6 py-6 sm:py-8 pb-24 md:pb-8">
        
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
            <div className="food-options-dropdown absolute top-full left-0 right-0 mt-2 bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden z-50">
              {/* Take Photo Option - Native Mobile Experience */}
              <label className="flex items-center p-4 hover:bg-gray-50 cursor-pointer transition-colors border-b border-gray-100">
                <div className="flex-shrink-0 w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mr-4">
                  <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-medium text-gray-900">📱 Select Photo</h3>
                  <p className="text-sm text-gray-500">Camera, Photo Library, or Choose File</p>
                </div>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    handlePhotoUpload(e);
                    setShowPhotoOptions(false);
                    setShowAddFood(true); // 🔥 FIX: Show photo processing UI
                  }}
                  className="hidden"
                />
              </label>

              {/* Manual Entry Option */}
              <button
                onClick={() => {
                  setShowPhotoOptions(false);
                  setShowAddFood(true);
                }}
                className="flex items-center p-4 hover:bg-gray-50 cursor-pointer transition-colors w-full text-left"
              >
                <div className="flex-shrink-0 w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mr-4">
                  <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-medium text-gray-900">✍️ Manual Entry</h3>
                  <p className="text-sm text-gray-500">Type your food description</p>
                </div>
              </button>
            </div>
          )}
        </div>
        )}

                {/* Food Processing Area */}
        {showAddFood && (
          <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
            
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
                <div className="space-y-3">
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
                        AI is analyzing your food...
                      </div>
                    ) : (
                      '🤖 Analyze with AI'
                    )}
                  </button>
                  <div className="mt-2">
                    <p className="text-xs text-gray-500 text-center mb-2">Typical cost: 1–2 credits</p>
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
                {/* Photo Section */}
                {photoPreview && (
                  <div className="p-4 border-b border-gray-100 flex justify-center">
                    <div className="relative w-full">
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
                        onLoad={() => setFoodImagesLoading((prev: Record<string, boolean>) => ({ ...prev, [photoPreview]: false }))}
                        onLoadStart={() => setFoodImagesLoading((prev: Record<string, boolean>) => ({ ...prev, [photoPreview]: true }))}
                      />
                    </div>
                  </div>
                )}
                
                {/* Premium Nutrition Display */}
                <div className="p-4 sm:p-6">
                  {/* Food Title */}
                  <div className="mb-4">
                    <h3 className="text-xl font-semibold text-gray-900 mb-2">Food Analysis</h3>
                  </div>

                  {/* Meal Summary - Single sentence at top */}
                  {mealSummary && (
                    <div className="mb-4 px-4 py-3 bg-emerald-50 border border-emerald-100 rounded-xl text-sm sm:text-base text-emerald-900 leading-relaxed">
                      {mealSummary}
                    </div>
                  )}

                  {analyzedNutrition && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-4 mb-6 mt-3 sticky top-0 sm:top-2 z-20 bg-white/90 supports-[backdrop-filter]:bg-white/60 backdrop-blur rounded-lg p-1 sm:p-2">
                      {NUTRIENT_DISPLAY_ORDER.map((key) => {
                        const meta = NUTRIENT_CARD_META[key]
                        const rawValue = (analyzedNutrition as any)?.[key] ?? 0
                        const displayValue = formatNutrientValue(key, Number(rawValue))
                        return (
                          <div key={key} className={`bg-gradient-to-br ${meta.gradient} border border-white/60 rounded-xl p-2 sm:p-4 text-center shadow-sm`}>
                            <div className={`text-xs font-medium uppercase tracking-wide ${meta.accent} mb-1`}>{meta.label}</div>
                            <div className="text-xl sm:text-2xl font-bold text-gray-900">{displayValue}</div>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Detected Items with Brand, Serving Size, and Edit Controls */}
                  {analyzedItems && analyzedItems.length > 0 ? (
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
                        const servingUnitMeta = parseServingUnitMetadata(item.serving_size || '')
                        const quickAddDelta = servingUnitMeta ? 1 / servingUnitMeta.quantity : null
                        const quickAddHalfDelta = quickAddDelta ? quickAddDelta / 2 : null
                        
                        return (
                          <div key={index} className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex-1">
                                <div className="font-semibold text-gray-900 text-base">
                                  {item.name || 'Unknown Food'}
                                </div>
                                {item.brand && (
                                  <div className="text-sm text-gray-600 mt-0.5">Brand: {item.brand}</div>
                                )}
                                <div className="text-sm text-gray-500 mt-1">
                                  Serving size: {item.serving_size || 'Not specified'}
                                </div>
                              </div>
                              <div className="ml-3 flex items-center gap-1">
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
                              </div>
                            </div>
                            
                            {/* Serving Controls */}
                            <div className="flex flex-col gap-3 mb-3 pb-3 border-b border-gray-100">
                              <div className="flex items-center gap-3">
                              <span className="text-sm text-gray-600">Servings:</span>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => {
                                    const current = analyzedItems[index]?.servings || 1
                                    const step = (servingUnitMeta && isDiscreteUnitLabel(servingUnitMeta.unitLabel)) 
                                      ? (1 / servingUnitMeta.quantity) 
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
                                  step={(servingUnitMeta && isDiscreteUnitLabel(servingUnitMeta.unitLabel)) ? (1 / servingUnitMeta.quantity) : 0.25}
                                  value={formatNumberInputValue(item.servings ?? 1)}
                                  onChange={(e) => updateItemField(index, 'servings', e.target.value)}
                                  className="w-20 px-2 py-1 border border-gray-300 rounded-lg text-base font-semibold text-gray-900 text-center focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                                />
                                <button
                                  onClick={() => {
                                    const current = analyzedItems[index]?.servings || 1
                                    const step = (servingUnitMeta && isDiscreteUnitLabel(servingUnitMeta.unitLabel)) 
                                      ? (1 / servingUnitMeta.quantity) 
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
                              {servingUnitMeta && (
                                <div className="flex flex-col gap-1">
                                  <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
                                    <span>Units{servingUnitMeta.unitLabelSingular ? ` (${servingUnitMeta.unitLabelSingular})` : ''}:</span>
                                    <div className="flex items-center gap-2">
                                      <button
                                        onClick={() => {
                                          const currentUnits = ((item.servings ?? 1) * servingUnitMeta.quantity)
                                          const step = isDiscreteUnitLabel(servingUnitMeta.unitLabel) ? 1 : 1
                                          const nextUnits = Math.max(0, (currentUnits - step))
                                          const servingsFromUnits = nextUnits / servingUnitMeta.quantity
                                          updateItemField(index, 'servings', Math.max(0, servingsFromUnits))
                                        }}
                                        className="w-7 h-7 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded-md text-gray-700"
                                      >
                                        -
                                      </button>
                                    <input
                                      type="number"
                                      min={0}
                                      step={isDiscreteUnitLabel(servingUnitMeta.unitLabel) ? 1 : 0.1}
                                      value={formatNumberInputValue(((item.servings ?? 1) * servingUnitMeta.quantity))}
                                      onChange={(e) => {
                                        const units = Number(e.target.value)
                                        if (Number.isFinite(units) && units >= 0) {
                                          const rawServings = units / servingUnitMeta.quantity
                                          const step = isDiscreteUnitLabel(servingUnitMeta.unitLabel) ? (1 / servingUnitMeta.quantity) : 0.25
                                          const snapped = Math.round(rawServings / step) * step
                                          updateItemField(index, 'servings', Math.max(0, snapped))
                                        }
                                      }}
                                      className="w-24 px-2 py-1 border border-gray-300 rounded-lg text-base font-semibold text-gray-900 text-center focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                                    />
                                      <button
                                        onClick={() => {
                                          const currentUnits = ((item.servings ?? 1) * servingUnitMeta.quantity)
                                          const step = isDiscreteUnitLabel(servingUnitMeta.unitLabel) ? 1 : 1
                                          const nextUnits = currentUnits + step
                                          const servingsFromUnits = nextUnits / servingUnitMeta.quantity
                                          updateItemField(index, 'servings', servingsFromUnits)
                                        }}
                                        className="w-7 h-7 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded-md text-gray-700"
                                      >
                                        +
                                      </button>
                                    </div>
                                    <span className="text-xs text-gray-500 w-full sm:w-auto">
                                      1 serving = {item.serving_size || 'N/A'}
                                    </span>
                                  </div>
                                </div>
                              )}
                            </div>
                            
                            {/* Per-serving nutrition */}
                            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                              {item.serving_size ? `Per 1 serving (= ${item.serving_size})` : 'Per serving'}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {ITEM_NUTRIENT_META.map((meta) => {
                                const rawValue = item?.[meta.field as keyof typeof item]
                                const displayUnit = meta.key === 'calories' ? ' kcal' : 'g'
                                const displayValue = formatMacroValue(
                                  typeof rawValue === 'number' ? rawValue : Number(rawValue),
                                  displayUnit
                                )
                                return (
                                  <div
                                    key={`${meta.field}-${index}`}
                                    className="px-3 py-1 rounded-full bg-gray-100 border border-gray-200 text-[11px] font-medium text-gray-700 flex items-center gap-1"
                                  >
                                    <span className={`font-semibold ${meta.accent}`}>{displayValue}</span>
                                    <span className="uppercase text-gray-500">{meta.label}</span>
                                  </div>
                                )
                              })}
                            </div>

                            <div className="mt-3 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 text-xs text-gray-600">
                              <div className="font-medium text-gray-700">Totals for {formattedServings}</div>
                              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                                {ITEM_NUTRIENT_META.map((meta) => {
                                  const displayUnit = meta.key === 'calories' ? ' cal' : 'g'
                                  return (
                                    <span key={`${meta.field}-total-${index}`} className="text-gray-700">
                                      {formatMacroValue(
                                        totalsByField[meta.field as keyof typeof totalsByField],
                                        displayUnit
                                      )}{' '}
                                      {meta.label.toLowerCase()}
                                    </span>
                                  )
                                })}
                              </div>
                            </div>
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
                              .replace(/<ITEMS_JSON>[\s\S]*?<\/ITEMS_JSON>/gi, '')
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
                    <div className="absolute inset-0 bg-black/30" onClick={() => setShowAddIngredientModal(false)}></div>
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
                          <input
                            type="text"
                            value={ingredientSearchQuery}
                            onChange={(e) => setIngredientSearchQuery(e.target.value)}
                            placeholder="Search starter foods (e.g., egg, bacon, rice)"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                          />
                          <div className="mt-3 max-h-80 overflow-y-auto divide-y divide-gray-100">
                            {filteredStarterFoods.map((f, i) => (
                              <div key={`${f.name}-${i}`} className="py-3 flex items-center justify-between">
                                <div className="min-w-0">
                                  <div className="font-medium text-gray-900 truncate">{f.name}{f.brand ? ` – ${f.brand}` : ''}</div>
                                  <div className="text-xs text-gray-600 mt-0.5">
                                    {f.serving_size} • {Math.round(f.calories)} cal, {f.protein_g}g protein, {f.carbs_g}g carbs, {f.fat_g}g fat
                                  </div>
                                </div>
                                <button
                                  onClick={() => addIngredientFromStarter(f)}
                                  className="ml-3 whitespace-nowrap px-3 py-1.5 rounded-md bg-emerald-600 text-white text-sm hover:bg-emerald-700"
                                >
                                  Add
                                </button>
                              </div>
                            ))}
                          </div>
                          <div className="mt-3 text-xs text-gray-500">
                            This is a starter list. We can connect USDA FoodData Central next.
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
                    disabled={isAnalyzing}
                    className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-300 text-white font-medium rounded-xl transition-colors duration-200 flex items-center justify-center shadow-lg"
                  >
                    {isAnalyzing ? (
                      <>
                        <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Re-analyzing...
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
                  <button
                    onClick={handleEditDescriptionClick}
                    className="w-full py-3 px-4 bg-amber-500 hover:bg-amber-600 text-white font-medium rounded-xl transition-colors duration-200 flex items-center justify-center"
                  >
                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    Edit Description
                  </button>
                  <button
                    onClick={() => {
                      setPhotoFile(null)
                      setPhotoPreview(null)
                      setAiDescription('')
                      setShowAiResult(false)
                      setIsEditingDescription(false)
                      setEditedDescription('')
                      setAnalyzedItems([])
                      setAnalyzedTotal(null)
                      setHealthWarning(null)
                      setHealthAlternatives(null)
                    }}
                    className="w-full py-3 px-4 bg-gray-500 hover:bg-gray-600 text-white font-medium rounded-xl transition-colors duration-200 flex items-center justify-center"
                  >
                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Delete Photo
                  </button>
                  {editingEntry && (
                    <>
                      <button
                        onClick={reanalyzeCurrentEntry}
                        disabled={isAnalyzing}
                        className="w-full py-3 px-4 bg-blue-100 hover:bg-blue-200 text-blue-800 font-medium rounded-xl transition-colors duration-200 flex items-center justify-center border border-blue-200 disabled:opacity-60"
                      >
                        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Re-Analyze
                      </button>
                      <button
                        onClick={handleDoneEditing}
                        className="w-full py-3 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-xl transition-colors duration-200 flex items-center justify-center"
                      >
                        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Done
                      </button>
                      <button
                        onClick={handleCancelEditing}
                        className="w-full py-3 px-4 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-medium rounded-xl transition-colors duration-200 flex items-center justify-center"
                      >
                        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        Cancel changes
                      </button>
                    </>
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

            {/* Clean Edit Interface - Improved UX Design */}
            {isEditingDescription && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-4 sm:p-6 space-y-6">
                  {/* Simple Food Title Only */}
                  <div className="border-b border-gray-100 pb-4">
                    <h1 className="text-xl sm:text-2xl font-medium text-gray-900">
                      {(() => {
                        const title = editedDescription.split('\n')[0].split('Calories:')[0].trim().split(',')[0].split('.')[0] || 'Food Item';
                        return title.replace(/^./, (match: string) => match.toUpperCase());
                      })()}
                    </h1>
                  </div>

                  {/* Nutrition Cards - Match Main Page Style */}
                  {analyzedNutrition && (
                    <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 sm:gap-4">
                      {/* Calories */}
                      {analyzedNutrition.calories !== null && analyzedNutrition.calories !== undefined && (
                        <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-xl p-3 sm:p-4 border border-orange-200">
                          <div className="text-center">
                            <div className="text-xl sm:text-2xl font-bold text-orange-600">{analyzedNutrition.calories}</div>
                            <div className="text-xs font-medium text-orange-500 uppercase tracking-wide">Calories</div>
                          </div>
                        </div>
                      )}
                      
                      {/* Protein */}
                      {analyzedNutrition.protein !== null && analyzedNutrition.protein !== undefined && (
                        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-3 sm:p-4 border border-blue-200">
                          <div className="text-center">
                            <div className="text-xl sm:text-2xl font-bold text-blue-600">{analyzedNutrition.protein}g</div>
                            <div className="text-xs font-medium text-blue-500 uppercase tracking-wide">Protein</div>
                          </div>
                        </div>
                      )}
                      
                      {/* Carbs */}
                      {analyzedNutrition.carbs !== null && analyzedNutrition.carbs !== undefined && (
                        <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-3 sm:p-4 border border-green-200">
                          <div className="text-center">
                            <div className="text-xl sm:text-2xl font-bold text-green-600">{analyzedNutrition.carbs}g</div>
                            <div className="text-xs font-medium text-green-500 uppercase tracking-wide">Carbs</div>
                          </div>
                        </div>
                      )}
                      
                      {/* Fat */}
                      {analyzedNutrition.fat !== null && analyzedNutrition.fat !== undefined && (
                        <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-3 sm:p-4 border border-purple-200">
                          <div className="text-center">
                            <div className="text-xl sm:text-2xl font-bold text-purple-600">{analyzedNutrition.fat}g</div>
                            <div className="text-xs font-medium text-purple-500 uppercase tracking-wide">Fat</div>
                          </div>
                        </div>
                      )}
                      
                      {/* Fiber */}
                      {(analyzedNutrition as any)?.fiber !== null && (analyzedNutrition as any)?.fiber !== undefined && (
                        <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-xl p-3 sm:p-4 border border-amber-200">
                          <div className="text-center">
                            <div className="text-xl sm:text-2xl font-bold text-amber-600">{(analyzedNutrition as any).fiber}g</div>
                            <div className="text-xs font-medium text-amber-500 uppercase tracking-wide">Fiber</div>
                          </div>
                        </div>
                      )}
                      
                      {/* Sugar */}
                      {(analyzedNutrition as any)?.sugar !== null && (analyzedNutrition as any)?.sugar !== undefined && (
                        <div className="bg-gradient-to-br from-pink-50 to-pink-100 rounded-xl p-3 sm:p-4 border border-pink-200">
                          <div className="text-center">
                            <div className="text-xl sm:text-2xl font-bold text-pink-600">{(analyzedNutrition as any).sugar}g</div>
                            <div className="text-xs font-medium text-pink-500 uppercase tracking-wide">Sugar</div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Enhanced Description Section */}
                  <div className="space-y-4">
                    <label className="block text-lg font-medium text-gray-900">
                      Food Description
                    </label>
                    <textarea
                      ref={descriptionTextareaRef}
                      value={editedDescription}
                      onChange={(e) => {
                        setEditedDescription(e.target.value);
                        e.target.style.height = 'auto';
                        e.target.style.height = `${e.target.scrollHeight}px`;
                      }}
                      onFocus={(e) => {
                        e.target.style.height = 'auto';
                        e.target.style.height = `${e.target.scrollHeight}px`;
                      }}
                      className="w-full min-h-[8rem] px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 text-base resize-none bg-white shadow-sm font-normal leading-relaxed whitespace-pre-wrap"
                      style={{ overflow: 'hidden' }}
                      placeholder="Enter a detailed description of the food item..."
                    />
                    <p className="text-sm text-gray-600 font-normal">
                      Change the food description and click on the 'Re-Analyze' button.
                    </p>
                  </div>
                  
                  {/* Full-Width Action Buttons (new entries) */}
                  {!editingEntry && (
                    <div className="space-y-3">
                      <button
                        onClick={reanalyzeCurrentEntry}
                        disabled={isAnalyzing}
                        className="w-full py-4 px-6 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-all duration-300 flex items-center justify-center shadow-sm hover:shadow-md disabled:shadow-none"
                      >
                        {isAnalyzing ? (
                          <>
                            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            <span className="font-normal">Re-Analyzing...</span>
                          </>
                        ) : (
                          <>
                            <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            <span className="font-normal">Re-Analyze with AI (uses 1 credit)</span>
                          </>
                        )}
                      </button>
                      <button
                        onClick={resetAnalyzerPanel}
                        className="w-full py-3 px-4 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-medium rounded-xl transition-all duration-300 flex items-center justify-center"
                      >
                        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        Cancel
                      </button>
                      <button
                        onClick={() => {
                          // For new (unsaved) analyses, Done should simply close
                          // the description editor and return to the analysis view
                          setIsEditingDescription(false)
                          setShowAiResult(true)
                          setShowAddFood(true)
                        }}
                        className="w-full py-3 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-xl transition-all duration-300 flex items-center justify-center"
                      >
                        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Done
                      </button>
                    </div>
                  )}
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
                        Analyzing Food...
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

        {/* Today's Food Entries - Hide during editing */}
        {!editingEntry && !isEditingDescription && (
        <div className="bg-white rounded-lg shadow-sm p-4 sm:p-6 overflow-visible">
          {/* Daily Totals Row */}
          {(isViewingToday ? todaysFoods : (historyFoods || [])).length > 0 && (
            <div className="mb-4">
              {(() => {
                const source = isViewingToday ? todaysFoods : (historyFoods || [])
                const totals = source.reduce((acc: Record<typeof NUTRIENT_DISPLAY_ORDER[number], number>, item: any) => {
                  const n = item?.nutrition || {}
                  const safeNumber = (value: any) => {
                    const num = Number(value)
                    return Number.isFinite(num) ? num : 0
                  }

                  acc.calories += safeNumber(n.calories ?? n.kcal)
                  acc.protein += safeNumber(n.protein ?? n.protein_g)
                  acc.carbs += safeNumber(n.carbs ?? n.carbohydrates ?? n.carbs_g ?? n.carbohydrates_g)
                  acc.fat += safeNumber(n.fat ?? n.total_fat ?? n.fat_g)
                  acc.fiber += safeNumber(n.fiber ?? n.fiber_g ?? n.dietary_fiber_g)
                  acc.sugar += safeNumber(n.sugar ?? n.sugar_g ?? n.sugars_g)
                  return acc
                }, { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0 })

                return (
                  <div>
                    <div className="text-lg font-semibold text-gray-800 mb-2">{isViewingToday ? "Today's Totals" : 'Totals'}</div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                      {NUTRIENT_DISPLAY_ORDER.map((key) => {
                        const meta = NUTRIENT_CARD_META[key]
                        const displayValue = formatNutrientValue(key, totals[key])
                        return (
                          <div key={key} className={`bg-gradient-to-br ${meta.gradient} border border-white/60 rounded-lg p-3 shadow-sm`}>
                            <div className={`text-xs ${meta.accent} mb-1 font-medium uppercase tracking-wide`}>{meta.label}</div>
                            <div className="text-lg font-semibold text-gray-900">{displayValue}</div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })()}
            </div>
          )}
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
                  {/* Mobile-Optimized Layout */}
                  <div className="p-4 hover:bg-gray-50 transition-colors">
                    {/* Title (up to 2 lines) */}
                    <div className="mb-1">
                      <div className="flex items-start gap-3 flex-1">
                        <h3 className="font-medium text-gray-900 text-sm sm:text-base leading-snug line-clamp-2">
                          {food.description.split('\n')[0].split('Calories:')[0]
                            .replace(/^(I'm unable to see.*?but I can provide a general estimate for|Based on.*?,|This image shows|I can see|The food appears to be|This appears to be)/i, '')
                            .split('.')[0]
                            .trim()
                            .replace(/^./, (match: string) => match.toUpperCase())}
                        </h3>
                      </div>
                    </div>
                    
                    {/* Utility Row: time (left) + actions (right) */}
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs sm:text-sm text-gray-500">
                        {formatTimeWithAMPM(food.time)}
                      </p>
                      <div className="flex items-center gap-2">
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
                            <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-xl border border-gray-200 z-[9999]" style={{boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'}}>
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
                    
                    {/* Nutrition Row removed in collapsed view (still shown in expanded view) */}
                  </div>

                  {/* Expandable Content */}
                  {expandedEntries[food.id.toString()] && (
                    <div className="border-t border-gray-100 p-4 bg-gray-50">
                      <div className="flex flex-col sm:flex-row gap-4">
                        {/* Food Image - Perfectly Sized to Match Nutrition Cards */}
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

                        {/* Nutrition Cards - Adjusted Width for Perfect Height Match */}
                        <div className="flex-1 sm:max-w-xs">
                          {food.nutrition && (
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                              {NUTRIENT_DISPLAY_ORDER.map((key) => {
                                const meta = NUTRIENT_CARD_META[key]
                                const rawValue = (food.nutrition as any)?.[key] ?? 0
                                return (
                                  <div key={`${food.id}-${key}`} className={`bg-gradient-to-br ${meta.gradient} rounded-lg p-2 border border-white/60 flex items-center justify-center`}>
                                    <div className="text-center">
                                      <div className={`text-lg font-bold ${meta.accent}`}>{formatNutrientValue(key, Number(rawValue))}</div>
                                      <div className={`text-xs font-medium ${meta.accent} uppercase tracking-wide`}>{meta.label}</div>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
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
