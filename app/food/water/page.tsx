'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useUserData } from '@/components/providers/UserDataProvider'
import MaterialSymbol from '@/components/MaterialSymbol'
import { computeHydrationGoal } from '@/lib/hydration-goal'

type WaterEntry = {
  id: string
  amount: number
  unit: string
  amountMl: number
  label?: string | null
  category?: string | null
  localDate: string
  createdAt: string
}

type GoalResponse = {
  targetMl: number
  recommendedMl: number
  source: 'auto' | 'custom'
  exerciseBonusMl?: number
  updatedAt?: string | null
}

const DRINK_TYPES = [
  { id: 'Water', icon: '/mobile-assets/MOBILE%20ICONS/WATER.png' },
  { id: 'Coffee', icon: '/mobile-assets/MOBILE%20ICONS/COFFEE.png' },
  { id: 'Tea', icon: '/mobile-assets/MOBILE%20ICONS/TEA.png' },
  { id: 'Juice', icon: '/mobile-assets/MOBILE%20ICONS/JUICE.png' },
  { id: 'Hot Chocolate', icon: '/mobile-assets/MOBILE%20ICONS/HOT%20CHOCOLATE.png' },
  { id: 'Soft Drink', icon: '/mobile-assets/MOBILE%20ICONS/SOFT%20DRINK.png' },
  { id: 'Alcohol', icon: '/mobile-assets/MOBILE%20ICONS/ALCOHOL.png' },
] as const

const QUICK_PRESETS = [
  { amount: 250, unit: 'ml' },
  { amount: 330, unit: 'ml' },
  { amount: 500, unit: 'ml' },
  { amount: 1, unit: 'l' },
] as const

const SUGAR_UNITS = ['g', 'tsp', 'tbsp'] as const
type SugarUnit = (typeof SUGAR_UNITS)[number]

const sugarToGrams = (amount: number, unit: SugarUnit): number => {
  if (!Number.isFinite(amount) || amount <= 0) return 0
  if (unit === 'g') return amount
  if (unit === 'tbsp') return amount * 12
  return amount * 4
}

const honeyToGrams = (amount: number, unit: SugarUnit): number => {
  if (!Number.isFinite(amount) || amount <= 0) return 0
  if (unit === 'g') return amount
  if (unit === 'tbsp') return amount * 21
  return amount * 7
}

const sweetenerToMacros = (grams: number, type: 'sugar' | 'honey') => {
  if (!Number.isFinite(grams) || grams <= 0) {
    return { calories: 0, carbs: 0, sugar: 0 }
  }
  if (type === 'honey') {
    const calories = Math.round(grams * 3.04 * 10) / 10
    const carbs = Math.round(grams * 0.82 * 10) / 10
    const sugar = carbs
    return { calories, carbs, sugar }
  }
  const calories = Math.round(grams * 4 * 10) / 10
  const carbs = Math.round(grams * 10) / 10
  const sugar = carbs
  return { calories, carbs, sugar }
}

function todayLocalDate() {
  return formatLocalDate(new Date())
}

function formatLocalDate(value: Date) {
  const y = value.getFullYear()
  const m = String(value.getMonth() + 1).padStart(2, '0')
  const d = String(value.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function isValidDate(value: string | null | undefined) {
  if (!value) return false
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function formatNumber(value: number) {
  if (Number.isInteger(value)) return String(value)
  return value.toFixed(2).replace(/\.0+$/, '').replace(/(\.[1-9])0$/, '$1')
}

function formatAmount(entry: WaterEntry) {
  const unit = entry.unit === 'l' ? 'L' : entry.unit
  return `${formatNumber(entry.amount)} ${unit}`
}

function formatMl(ml: number | null | undefined) {
  const value = Number(ml ?? 0)
  if (!Number.isFinite(value) || value <= 0) return '0 ml'
  if (value >= 1000) {
    const liters = Math.round((value / 1000) * 100) / 100
    return `${formatNumber(liters)} L`
  }
  return `${Math.round(value)} ml`
}

function formatTime(value: string) {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function formatDateLabel(value: string) {
  const today = todayLocalDate()
  if (value === today) return 'Today'
  const d = new Date(`${value}T00:00:00`)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

function goalToInput(targetMl: number) {
  if (targetMl >= 1000) {
    return { amount: formatNumber(Math.round((targetMl / 1000) * 100) / 100), unit: 'l' as const }
  }
  return { amount: formatNumber(Math.round(targetMl)), unit: 'ml' as const }
}

function normalizeLabel(value: string | null | undefined) {
  const cleaned = String(value || '').trim()
  return cleaned || 'Water'
}

export default function WaterIntakePage() {
  const router = useRouter()
  const { data: session, status } = useSession()
  const { profileImage, userData, refreshData } = useUserData()

  const [selectedDate, setSelectedDate] = useState(todayLocalDate())
  const [entries, setEntries] = useState<WaterEntry[]>([])
  const [sourceCategory, setSourceCategory] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [drinkDetail, setDrinkDetail] = useState<{ amount: number; unit: string } | null>(null)
  const [drinkSugarChoice, setDrinkSugarChoice] = useState<'free' | 'sugar' | 'honey' | null>(null)
  const [drinkSugarAmount, setDrinkSugarAmount] = useState('')
  const [drinkSugarUnit, setDrinkSugarUnit] = useState<SugarUnit>('tsp')
  const [drinkDetailError, setDrinkDetailError] = useState<string | null>(null)
  const [drinkDetailSaving, setDrinkDetailSaving] = useState(false)
  const [activeDrink, setActiveDrink] = useState<(typeof DRINK_TYPES)[number]['id']>('Water')
  const [lastPresetKey, setLastPresetKey] = useState<string | null>(null)

  const [goalLoading, setGoalLoading] = useState(false)
  const [goalTargetMl, setGoalTargetMl] = useState<number | null>(null)
  const [goalRecommendedMl, setGoalRecommendedMl] = useState<number | null>(null)
  const [goalSource, setGoalSource] = useState<'auto' | 'custom'>('auto')
  const [goalExerciseBonusMl, setGoalExerciseBonusMl] = useState<number>(0)
  const [showGoalEditor, setShowGoalEditor] = useState(false)
  const [goalAmountInput, setGoalAmountInput] = useState('')
  const [goalUnit, setGoalUnit] = useState<'ml' | 'l' | 'oz'>('ml')
  const [goalAutoClear, setGoalAutoClear] = useState(false)
  const [goalSaving, setGoalSaving] = useState(false)
  const [customAmountInput, setCustomAmountInput] = useState('')
  const [customUnit, setCustomUnit] = useState<'ml' | 'l' | 'oz'>('ml')
  const [showCustomUnitPicker, setShowCustomUnitPicker] = useState(false)

  const customUnitRef = useRef<HTMLDivElement | null>(null)
  const goalInputRef = useRef<HTMLInputElement | null>(null)

  const userImage = (profileImage || session?.user?.image || '') as string
  const hasProfileImage = !!userImage

  const totalMl = useMemo(
    () => entries.reduce((sum, entry) => sum + (Number(entry.amountMl) || 0), 0),
    [entries]
  )
  const entryCount = entries.length
  const effectiveGoalMl = goalTargetMl ?? goalRecommendedMl ?? null
  const progressPercent = effectiveGoalMl ? Math.min(100, Math.round((totalMl / effectiveGoalMl) * 100)) : 0

  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const fromQuery = params.get('date')
    const category = params.get('category')
    if (isValidDate(fromQuery)) {
      setSelectedDate(String(fromQuery))
    }
    if (category) {
      setSourceCategory(String(category))
    }
  }, [])

  useEffect(() => {
    if (status !== 'authenticated') return
    refreshData().catch(() => {})
  }, [refreshData, status])

  const loadEntries = async (localDate: string) => {
    setLoading(true)
    setBanner(null)
    try {
      const res = await fetch(`/api/water-log?localDate=${encodeURIComponent(localDate)}`, {
        cache: 'no-store' as any,
        credentials: 'include',
      })
      if (res.status === 401) {
        setEntries([])
        return
      }
      if (!res.ok) throw new Error('load failed')
      const data = await res.json()
      setEntries(Array.isArray(data?.entries) ? data.entries : [])
      setLoadError(false)
    } catch {
      setEntries([])
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }

  const loadGoal = async (localDate?: string) => {
    setGoalLoading(true)
    try {
      const qs = localDate ? `?date=${encodeURIComponent(localDate)}` : ''
      const res = await fetch(`/api/hydration-goal${qs}`, { cache: 'no-store' as any, credentials: 'include' })
      if (!res.ok) throw new Error('goal failed')
      const data = (await res.json()) as GoalResponse
      setGoalTargetMl(typeof data?.targetMl === 'number' ? data.targetMl : null)
      setGoalRecommendedMl(typeof data?.recommendedMl === 'number' ? data.recommendedMl : null)
      setGoalSource(data?.source === 'custom' ? 'custom' : 'auto')
      setGoalExerciseBonusMl(typeof data?.exerciseBonusMl === 'number' ? data.exerciseBonusMl : 0)
    } catch {
      // Keep any goal already loaded from cached user data.
    } finally {
      setGoalLoading(false)
    }
  }

  useEffect(() => {
    if (status !== 'authenticated') return
    loadEntries(selectedDate)
  }, [selectedDate, status])

  useEffect(() => {
    if (status !== 'authenticated') return
    loadGoal(selectedDate)
  }, [selectedDate, status])

  useEffect(() => {
    const hydrated = userData?.hydrationGoal
    if (!hydrated) return
    const target = Number(hydrated?.targetMl)
    const recommended = Number(hydrated?.recommendedMl ?? hydrated?.targetMl)
    if (!goalTargetMl && Number.isFinite(target)) {
      setGoalTargetMl(target)
    }
    if (!goalRecommendedMl && Number.isFinite(recommended)) {
      setGoalRecommendedMl(recommended)
    }
    if (hydrated?.source === 'custom') {
      setGoalSource('custom')
    }
  }, [userData, goalRecommendedMl, goalTargetMl])

  useEffect(() => {
    if (!userData) return
    if (goalTargetMl || goalRecommendedMl) return
    const weightKg = Number(userData.weight)
    const heightCm = Number(userData.height)
    const result = computeHydrationGoal({
      weightKg: Number.isFinite(weightKg) ? weightKg : null,
      heightCm: Number.isFinite(heightCm) ? heightCm : null,
      gender: userData.gender || null,
      bodyType: userData.bodyType || null,
      exerciseFrequency: userData.exerciseFrequency || '',
      exerciseTypes: Array.isArray(userData.exerciseTypes) ? userData.exerciseTypes : [],
      dietTypes: Array.isArray(userData.dietTypes) ? userData.dietTypes : [],
      diabetesType: userData.diabetesType || '',
      goalChoice: userData.goalChoice || '',
      goalIntensity: userData.goalIntensity || '',
      birthdate: userData.birthdate || userData?.profileInfo?.dateOfBirth || '',
    })
    setGoalTargetMl(result.targetMl)
    setGoalRecommendedMl(result.targetMl)
    setGoalSource('auto')
  }, [goalRecommendedMl, goalTargetMl, userData])

  useEffect(() => {
    if (!showCustomUnitPicker) return
    const handlePointer = (event: PointerEvent) => {
      const target = event.target as Node
      if (customUnitRef.current && !customUnitRef.current.contains(target)) {
        setShowCustomUnitPicker(false)
      }
    }
    window.addEventListener('pointerdown', handlePointer)
    return () => window.removeEventListener('pointerdown', handlePointer)
  }, [showCustomUnitPicker])

  const addEntry = async (amount: number, unit: string, labelOverride?: string) => {
    setSaving(true)
    setBanner(null)
    try {
      const label = labelOverride || activeDrink
      const category =
        sourceCategory ||
        (() => {
          if (typeof window === 'undefined') return null
          const params = new URLSearchParams(window.location.search)
          return params.get('category')
        })()
      const res = await fetch('/api/water-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          amount,
          unit,
          label,
          category,
          localDate: selectedDate,
        }),
      })
      if (!res.ok) throw new Error('save failed')
      const data = await res.json()
      const entry = data?.entry as WaterEntry | undefined
      if (entry) {
        setEntries((prev) => [entry, ...prev])
      } else {
        await loadEntries(selectedDate)
      }
      setBanner({ type: 'success', message: 'Water entry saved.' })
      return entry || null
    } catch {
      setBanner({ type: 'error', message: 'Could not save. Please try again.' })
      return null
    } finally {
      setSaving(false)
    }
  }

  const deleteEntry = async (id: string) => {
    setDeletingId(id)
    setBanner(null)
    try {
      const res = await fetch(`/api/water-log/${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'include' })
      if (!res.ok) throw new Error('delete failed')
      setEntries((prev) => prev.filter((entry) => entry.id !== id))
      setBanner({ type: 'success', message: 'Entry removed.' })
    } catch {
      setBanner({ type: 'error', message: 'Could not remove entry.' })
    } finally {
      setDeletingId(null)
    }
  }

  const openDrinkDetail = (amount: number, unit: string) => {
    setDrinkDetail({ amount, unit })
    setDrinkSugarChoice(null)
    setDrinkSugarAmount('')
    setDrinkSugarUnit('tsp')
    setDrinkDetailError(null)
  }

  const closeDrinkDetail = () => {
    if (drinkDetailSaving) return
    setDrinkDetail(null)
    setDrinkSugarChoice(null)
    setDrinkSugarAmount('')
    setDrinkDetailError(null)
  }

  const addDrinkFoodLog = async ({
    label,
    sweetenerType,
    sweetenerGrams = 0,
    displayAmount,
    displayUnit,
    drinkAmount,
    drinkUnit,
    waterLogId,
  }: {
    label: string
    sweetenerType?: 'sugar' | 'honey'
    sweetenerGrams?: number
    displayAmount?: number
    displayUnit?: SugarUnit
    drinkAmount: number
    drinkUnit: string
    waterLogId?: string | null
  }) => {
    const drinkAmountMl =
      drinkUnit === 'l' ? drinkAmount * 1000 : drinkUnit === 'oz' ? drinkAmount * 29.5735 : drinkAmount
    const safeSweetener = Number.isFinite(sweetenerGrams) && sweetenerGrams > 0 ? sweetenerGrams : 0
    const macros =
      safeSweetener > 0 && sweetenerType
        ? sweetenerToMacros(safeSweetener, sweetenerType)
        : { calories: 0, carbs: 0, sugar: 0 }
    const calories = macros.calories
    const carbs = macros.carbs
    const sugar = macros.sugar
    const description =
      safeSweetener > 0 && sweetenerType && displayAmount && displayUnit
        ? `${label} with ${sweetenerType} (${formatNumber(displayAmount)} ${displayUnit})`
        : label
    const item = {
      name: label,
      brand: null,
      serving_size: '1 serving',
      servings: 1,
      calories,
      protein_g: 0,
      carbs_g: carbs,
      fat_g: 0,
      fiber_g: 0,
      sugar_g: sugar,
    }
    const category =
      sourceCategory ||
      (() => {
        if (typeof window === 'undefined') return null
        const params = new URLSearchParams(window.location.search)
        return params.get('category')
      })()
    const nutrition = {
      calories,
      protein: 0,
      carbs,
      fat: 0,
      fiber: 0,
      sugar,
      __drinkType: activeDrink,
      __drinkAmount: drinkAmount,
      __drinkUnit: drinkUnit,
      __drinkAmountMl: Number.isFinite(drinkAmountMl) ? drinkAmountMl : undefined,
      ...(waterLogId ? { __waterLogId: waterLogId } : {}),
    }
    const res = await fetch('/api/food-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        description,
        nutrition,
        items: [item],
        localDate: selectedDate,
        meal: category,
        category,
        allowDuplicate: true,
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error('food log failed')
    if (data?.deduped && data?.id) {
      await fetch('/api/food-log', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          id: data.id,
          description,
          nutrition,
          items: [item],
          localDate: selectedDate,
          meal: category,
          category,
        }),
      })
    }
  }

  const handleSugarFreeDrink = async () => {
    if (!drinkDetail) return
    setDrinkDetailSaving(true)
    setDrinkDetailError(null)
    try {
      const waterEntry = await addEntry(drinkDetail.amount, drinkDetail.unit, activeDrink)
      if (!waterEntry?.id) throw new Error('missing water log')
      await addDrinkFoodLog({
        label: activeDrink,
        drinkAmount: drinkDetail.amount,
        drinkUnit: drinkDetail.unit,
        waterLogId: waterEntry.id,
      })
      closeDrinkDetail()
    } catch {
      setDrinkDetailError('Saved water intake, but could not create the drink entry. Please try again.')
    } finally {
      setDrinkDetailSaving(false)
    }
  }

  const handleSweetenedDrink = async () => {
    if (!drinkDetail) return
    if (drinkSugarChoice !== 'sugar' && drinkSugarChoice !== 'honey') return
    const rawAmount = Number(drinkSugarAmount)
    if (!Number.isFinite(rawAmount) || rawAmount <= 0) {
      setDrinkDetailError('Enter a valid sweetener amount.')
      return
    }
    const sweetenerGrams =
      drinkSugarChoice === 'honey'
        ? honeyToGrams(rawAmount, drinkSugarUnit)
        : sugarToGrams(rawAmount, drinkSugarUnit)
    if (sweetenerGrams <= 0) {
      setDrinkDetailError('Enter a valid sweetener amount.')
      return
    }
    setDrinkDetailSaving(true)
    setDrinkDetailError(null)
    try {
      const sweetenerLabel = `${activeDrink} (${drinkSugarChoice} ${formatNumber(rawAmount)} ${drinkSugarUnit})`
      const waterEntry = await addEntry(drinkDetail.amount, drinkDetail.unit, sweetenerLabel)
      await addDrinkFoodLog({
        label: activeDrink,
        sweetenerType: drinkSugarChoice,
        sweetenerGrams,
        displayAmount: rawAmount,
        displayUnit: drinkSugarUnit,
        drinkAmount: drinkDetail.amount,
        drinkUnit: drinkDetail.unit,
        waterLogId: waterEntry?.id,
      })
      closeDrinkDetail()
    } catch {
      setDrinkDetailError('Could not save this drink. Please try again.')
    } finally {
      setDrinkDetailSaving(false)
    }
  }

  const navigateDrinkNutrition = async (mode: 'barcode' | 'favorites' | 'photo' | 'search') => {
    if (!drinkDetail) return
    setDrinkDetailSaving(true)
    setDrinkDetailError(null)
    try {
      const waterEntry = await addEntry(drinkDetail.amount, drinkDetail.unit, activeDrink)
      closeDrinkDetail()
      const category = sourceCategory || 'uncategorized'
      const amountParam = String(drinkDetail.amount)
      const unitParam = String(drinkDetail.unit || '')
      const drinkTypeParam = activeDrink
      const waterLogIdParam = waterEntry?.id ? String(waterEntry.id) : ''
      if (mode === 'photo') {
        const qs = new URLSearchParams({
          date: selectedDate,
          category,
          drinkAmount: amountParam,
          drinkUnit: unitParam,
          drinkType: drinkTypeParam,
          ...(waterLogIdParam ? { waterLogId: waterLogIdParam } : {}),
        })
        router.push(`/food/analysis?${qs.toString()}`)
        return
      }
      if (mode === 'search') {
        const qs = new URLSearchParams({
          date: selectedDate,
          category,
          q: activeDrink.toLowerCase(),
          drinkAmount: amountParam,
          drinkUnit: unitParam,
          drinkType: drinkTypeParam,
          ...(waterLogIdParam ? { waterLogId: waterLogIdParam } : {}),
        })
        router.push(`/food/add-ingredient?${qs.toString()}`)
        return
      }
      const qs = new URLSearchParams({
        open: mode,
        date: selectedDate,
        category,
        drinkAmount: amountParam,
        drinkUnit: unitParam,
        drinkType: drinkTypeParam,
        ...(waterLogIdParam ? { waterLogId: waterLogIdParam } : {}),
      })
      router.push(`/food?${qs.toString()}`)
    } catch {
      setDrinkDetailError('Could not save this drink. Please try again.')
    } finally {
      setDrinkDetailSaving(false)
    }
  }

  const handleQuickAdd = (amount: number, unit: string) => {
    setLastPresetKey(`${amount}-${unit}`)
    if (activeDrink === 'Water') {
      addEntry(amount, unit)
      return
    }
    openDrinkDetail(amount, unit)
  }

  const handleCustomAdd = () => {
    const amount = Number(customAmountInput)
    if (!Number.isFinite(amount) || amount <= 0) {
      setBanner({ type: 'error', message: 'Enter a valid amount first.' })
      return
    }
    if (activeDrink === 'Water') {
      addEntry(amount, customUnit)
      setCustomAmountInput('')
      return
    }
    openDrinkDetail(amount, customUnit)
    setCustomAmountInput('')
  }

  const shiftDate = (delta: number) => {
    const parts = String(selectedDate).split('-').map(Number)
    const [yy, mm, dd] = parts
    const base = Number.isFinite(yy) && Number.isFinite(mm) && Number.isFinite(dd)
      ? new Date(yy, mm - 1, dd)
      : new Date()
    base.setDate(base.getDate() + delta)
    setSelectedDate(formatLocalDate(base))
  }

  const openGoalEditor = () => {
    if (effectiveGoalMl) {
      const next = goalToInput(effectiveGoalMl)
      setGoalAmountInput(next.amount)
      setGoalUnit(next.unit)
    }
    setGoalAutoClear(true)
    setShowGoalEditor(true)
  }

  const saveGoal = async () => {
    const amount = Number(goalAmountInput)
    if (!Number.isFinite(amount) || amount <= 0) {
      setBanner({ type: 'error', message: 'Enter a valid goal amount.' })
      return
    }
    setGoalSaving(true)
    try {
      const res = await fetch('/api/hydration-goal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, unit: goalUnit }),
      })
      if (!res.ok) throw new Error('goal save failed')
      await loadGoal(selectedDate)
      setShowGoalEditor(false)
    } catch {
      setBanner({ type: 'error', message: 'Could not update goal.' })
    } finally {
      setGoalSaving(false)
    }
  }

  const resetGoal = async () => {
    setGoalSaving(true)
    try {
      const res = await fetch('/api/hydration-goal', { method: 'DELETE' })
      if (!res.ok) throw new Error('goal reset failed')
      await loadGoal(selectedDate)
      setShowGoalEditor(false)
    } catch {
      setBanner({ type: 'error', message: 'Could not reset goal.' })
    } finally {
      setGoalSaving(false)
    }
  }

  const handleBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back()
      return
    }
    router.push('/food')
  }

  return (
    <div className="min-h-[100dvh] bg-[#f6f7f6] dark:bg-[#151d15] overflow-x-hidden">
      <div className="max-w-md lg:max-w-6xl w-full mx-auto min-h-[100dvh] flex flex-col shadow-xl lg:shadow-none bg-[#f6f7f6] dark:bg-[#151d15] lg:bg-transparent overflow-x-hidden">
        <div className="flex items-center p-4 pb-2 lg:px-8 lg:pt-6 lg:pb-4 justify-between sticky top-0 z-10 bg-[#f6f7f6] dark:bg-[#151d15]">
          <button
            type="button"
            onClick={handleBack}
            className="text-[#111711] dark:text-white flex size-12 shrink-0 items-center"
            aria-label="Go back"
          >
            <MaterialSymbol name="arrow_back_ios" className="text-2xl" />
          </button>
          <h2 className="text-[#111711] dark:text-white text-lg font-bold leading-tight tracking-[-0.015em] flex-1 text-center">
            Water Intake
          </h2>
          <div className="size-12 flex items-center justify-end">
            <div className="w-8 h-8 rounded-full bg-[#62b763]/20 flex items-center justify-center overflow-hidden border border-[#62b763]/30">
              {hasProfileImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img alt="User profile avatar" src={userImage} className="w-full h-full object-cover" />
              ) : (
                <MaterialSymbol name="person" className="text-[#62b763]" />
              )}
            </div>
          </div>
        </div>

        {banner && (
          <div className="px-4">
            <div
              className={[
                'mb-2 rounded-xl border px-4 py-3 text-sm',
                banner.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-red-50 border-red-200 text-red-700',
              ].join(' ')}
            >
              {banner.message}
            </div>
          </div>
        )}

        <div className="flex px-4 py-3 lg:px-8 lg:pt-0 lg:pb-6">
          <div className="flex h-10 flex-1 items-center justify-center rounded-lg bg-gray-200 dark:bg-gray-800 p-1">
            <button
              type="button"
              onClick={() => shiftDate(-1)}
              className="flex h-full grow items-center justify-center overflow-hidden rounded-lg px-2 text-gray-500 text-sm font-medium leading-normal hover:text-[#111711] dark:hover:text-white"
            >
              Previous
            </button>
            <label className="relative flex h-full grow cursor-pointer items-center justify-center overflow-hidden rounded-lg px-2 text-sm font-medium leading-normal bg-white dark:bg-gray-700 shadow-[0_0_4px_rgba(0,0,0,0.1)] text-[#111711] dark:text-white">
              <span className="truncate">{formatDateLabel(selectedDate)}</span>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="absolute inset-0 opacity-0 cursor-pointer"
                aria-label="Select date"
              />
            </label>
            <button
              type="button"
              onClick={() => shiftDate(1)}
              className="flex h-full grow items-center justify-center overflow-hidden rounded-lg px-2 text-gray-500 text-sm font-medium leading-normal hover:text-[#111711] dark:hover:text-white"
            >
              Next
            </button>
          </div>
        </div>

        <div className="px-4 lg:px-10">
          <div className="lg:grid lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] lg:gap-8 lg:items-start">
            <div className="space-y-6">
              <div className="pt-4 lg:pt-2">
                <div className="flex flex-col items-stretch justify-start rounded-xl shadow-[0_4px_12px_rgba(0,0,0,0.05)] bg-white dark:bg-gray-900 overflow-hidden border border-gray-100 dark:border-gray-800">
                  <div className="flex w-full flex-col items-stretch justify-center gap-1 py-4 px-4">
                    <p className="text-gray-500 dark:text-gray-400 text-sm font-normal leading-normal">Daily Hydration Summary</p>
                    <div className="flex items-baseline gap-2">
                      <p className="text-[#111711] dark:text-white text-4xl font-bold leading-tight tracking-[-0.015em]">
                        {formatMl(totalMl)}
                      </p>
                      <p className="text-gray-400 text-lg font-medium">
                        {effectiveGoalMl ? `/ ${formatMl(effectiveGoalMl)}` : ''}
                      </p>
                    </div>
                    <div className="flex flex-col gap-2 mt-4">
                      <div className="flex gap-6 justify-between items-center">
                        <p className="text-[#111711] dark:text-white text-sm font-medium leading-normal">
                          {effectiveGoalMl ? `${progressPercent}% of daily goal` : 'Set a daily goal'}
                        </p>
                        <button
                          type="button"
                          onClick={openGoalEditor}
                          className="text-[#62b763] text-sm font-semibold hover:underline"
                        >
                          Edit Goal
                        </button>
                      </div>
                      <div className="rounded-full bg-gray-200 dark:bg-gray-800 h-2.5 overflow-hidden">
                        <div className="h-full rounded-full bg-[#62b763]" style={{ width: `${progressPercent}%` }}></div>
                      </div>
                    </div>
                    {goalExerciseBonusMl > 0 && goalSource === 'auto' && (
                      <p className="text-xs text-gray-500">Activity bonus: +{formatMl(goalExerciseBonusMl)} today</p>
                    )}
                    <p className="text-gray-500 dark:text-gray-400 text-xs mt-3">
                      {entryCount} {entryCount === 1 ? 'entry' : 'entries'} logged today
                      {goalLoading ? ' - loading goal' : ''}
                    </p>
                    {goalSource === 'custom' && (
                      <p className="text-xs text-[#62b763] mt-1">Custom goal active</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <h3 className="text-[#111711] dark:text-white text-lg font-bold leading-tight tracking-[-0.015em] pb-3">
                  Quick Add
                </h3>
                <div className="flex gap-2 overflow-x-auto pb-4 scrollbar-hide lg:flex-wrap lg:overflow-visible">
                  {DRINK_TYPES.map((drink) => (
                    <button
                      key={drink.id}
                      type="button"
                      onClick={() => setActiveDrink(drink.id)}
                      className={`flex items-center px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap ${
                        activeDrink === drink.id
                          ? 'bg-[#62b763] text-white'
                          : 'bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                      }`}
                    >
                      {drink.id}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-4 gap-3">
                  {QUICK_PRESETS.map((preset) => {
                    const key = `${preset.amount}-${preset.unit}`
                    const isActive = lastPresetKey === key
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => handleQuickAdd(preset.amount, preset.unit)}
                        disabled={saving}
                        className={`flex flex-col items-center justify-center p-3 rounded-xl border ${
                          isActive
                            ? 'border-[#62b763] bg-[#62b763]/5'
                            : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:border-[#62b763]/50'
                        }`}
                      >
                        <span
                          className={`text-sm font-bold ${isActive ? 'text-[#62b763]' : 'text-[#111711] dark:text-white'}`}
                        >
                          {formatNumber(preset.amount)}
                        </span>
                        <span className={`text-[10px] ${isActive ? 'text-[#62b763]' : 'text-gray-500'}`}>
                          {preset.unit === 'l' ? 'L' : preset.unit}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="pt-4">
                <h3 className="text-[#111711] dark:text-white text-lg font-bold leading-tight tracking-[-0.015em] pb-3">
                  Custom Entry
                </h3>
                <div className="flex gap-3">
                  <div className="flex-1 relative">
                    <input
                      className="w-full h-12 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg px-4 text-base focus:ring-[#62b763] focus:border-[#62b763] dark:text-white"
                      placeholder="0"
                      type="number"
                      inputMode="decimal"
                      enterKeyHint="done"
                      min="0"
                      step="0.1"
                      value={customAmountInput}
                      onChange={(e) => setCustomAmountInput(e.target.value)}
                      onFocus={(e) => {
                        setCustomAmountInput('')
                        e.currentTarget.select()
                      }}
                    />
                    <div ref={customUnitRef} className="absolute right-2 top-2">
                      <button
                        type="button"
                        onClick={() => setShowCustomUnitPicker((prev) => !prev)}
                        className="h-8 px-2 rounded-md text-xs text-gray-500 hover:text-gray-700 focus:outline-none"
                        aria-expanded={showCustomUnitPicker}
                        aria-haspopup="listbox"
                      >
                        {customUnit === 'ml' ? 'ml' : customUnit === 'l' ? 'L' : 'oz'}
                      </button>
                      {showCustomUnitPicker && (
                        <div className="absolute right-0 mt-1 w-16 rounded-md border border-gray-200 bg-white shadow-lg text-xs text-gray-600 z-10">
                          {(['ml', 'l', 'oz'] as const).map((unit) => (
                            <button
                              key={unit}
                              type="button"
                              onClick={() => {
                                setCustomUnit(unit)
                                setShowCustomUnitPicker(false)
                              }}
                              className="block w-full px-2 py-1 text-left hover:bg-gray-50"
                            >
                              {unit === 'l' ? 'L' : unit}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleCustomAdd}
                    disabled={saving}
                    className="h-12 px-6 bg-[#62b763] text-white font-bold rounded-lg text-sm flex items-center justify-center disabled:opacity-60"
                  >
                    Add Entry
                  </button>
                </div>
              </div>
            </div>

            <div className="pt-4 pb-10 lg:pt-2">
              <div className="flex justify-between items-end pb-3">
                <h3 className="text-[#111711] dark:text-white text-lg font-bold leading-tight tracking-[-0.015em]">
                  Recent Logs
                </h3>
                <span className="text-xs text-gray-500 font-medium">History</span>
              </div>
              <div className="space-y-3">
                {loading && (
                  <div className="p-4 bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 text-sm text-gray-500">
                    Loading entries...
                  </div>
                )}
                {!loading && loadError && (
                  <button
                    type="button"
                    onClick={() => loadEntries(selectedDate)}
                    className="w-full p-4 bg-white dark:bg-gray-900 rounded-xl border border-red-100 dark:border-red-900 text-sm text-red-600 text-left"
                  >
                    Could not load water entries. Tap to retry.
                  </button>
                )}
                {!loading && entries.length === 0 && (
                  <div className="p-4 bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 text-sm text-gray-500">
                    No water entries yet. Add your first drink above.
                  </div>
                )}
                {!loading &&
                  entries.map((entry) => {
                    const label = normalizeLabel(entry.label)
                    const baseLabel = label.replace(/\s*\(.*\)\s*$/, '').trim()
                    const drinkConfig = DRINK_TYPES.find((drink) => drink.id.toLowerCase() === baseLabel.toLowerCase())
                    const icon = drinkConfig?.icon || '/mobile-assets/MOBILE%20ICONS/WATER.png'
                    const accent =
                      label.toLowerCase() === 'coffee'
                        ? 'bg-orange-50 text-orange-500 dark:bg-orange-900/20'
                        : 'bg-blue-50 text-blue-500 dark:bg-blue-900/20'
                    return (
                      <div
                        key={entry.id}
                        className="flex items-center justify-between p-4 bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800"
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${accent}`}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={icon} alt={`${label} icon`} className="h-5 w-5" />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-[#111711] dark:text-white">{label}</p>
                            <p className="text-xs text-gray-500">{formatTime(entry.createdAt)}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <p className="text-sm font-bold text-[#111711] dark:text-white">{formatAmount(entry)}</p>
                          <button
                            type="button"
                            onClick={() => deleteEntry(entry.id)}
                            disabled={deletingId === entry.id}
                            className="text-gray-300 hover:text-red-500 disabled:opacity-60"
                            aria-label="Delete entry"
                          >
                            <MaterialSymbol name="delete" className="text-xl" />
                          </button>
                        </div>
                      </div>
                    )
                  })}
              </div>
            </div>
          </div>
        </div>

        <div className="h-20 bg-[#f6f7f6] dark:bg-[#151d15]"></div>
      </div>
      {drinkDetail && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40">
          <div className="w-full max-w-md bg-[#f6f7f6] dark:bg-[#151d15] rounded-t-[32px] shadow-2xl max-h-[85vh] overflow-hidden">
            <div className="flex flex-col items-center pt-3 pb-2">
              <div className="h-1.5 w-10 rounded-full bg-slate-300 dark:bg-slate-700"></div>
            </div>
            <div className="px-6 pb-[calc(env(safe-area-inset-bottom)+24px)] space-y-4 overflow-y-auto overscroll-contain">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-base font-semibold text-[#111711] dark:text-white">Drink details</div>
                  <div className="text-xs text-gray-500">Select a sweetener option.</div>
                </div>
                <button
                  type="button"
                  onClick={closeDrinkDetail}
                  className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"
                  aria-label="Close"
                >
                  <MaterialSymbol name="close" />
                </button>
              </div>
              <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 space-y-2">
                <div className="text-sm font-semibold text-gray-900 dark:text-white">{activeDrink}</div>
                <div className="text-xs text-gray-500">
                  Amount: {formatNumber(drinkDetail.amount)} {drinkDetail.unit === 'l' ? 'L' : drinkDetail.unit}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setDrinkSugarChoice('free')}
                  className={`px-3 py-2 rounded-lg text-sm font-semibold border ${
                    drinkSugarChoice === 'free'
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-white text-gray-700 border-gray-200'
                  }`}
                >
                  Sugar-free
                </button>
                <button
                  type="button"
                  onClick={() => setDrinkSugarChoice('sugar')}
                  className={`px-3 py-2 rounded-lg text-sm font-semibold border ${
                    drinkSugarChoice === 'sugar'
                      ? 'bg-slate-800 text-white border-slate-800'
                      : 'bg-white text-gray-700 border-gray-200'
                  }`}
                >
                  Sugar
                </button>
                <button
                  type="button"
                  onClick={() => setDrinkSugarChoice('honey')}
                  className={`px-3 py-2 rounded-lg text-sm font-semibold border ${
                    drinkSugarChoice === 'honey'
                      ? 'bg-amber-600 text-white border-amber-600'
                      : 'bg-white text-gray-700 border-gray-200'
                  }`}
                >
                  Honey
                </button>
              </div>

              {(drinkSugarChoice === 'sugar' || drinkSugarChoice === 'honey') && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">
                      {drinkSugarChoice === 'honey' ? 'Honey amount' : 'Sugar amount'}
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.1"
                        value={drinkSugarAmount}
                        onChange={(e) => setDrinkSugarAmount(e.target.value)}
                        onFocus={(e) => {
                          setDrinkSugarAmount('')
                          e.currentTarget.select()
                        }}
                        className="flex-1 min-w-0 h-11 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-3 text-[16px] text-gray-900 dark:text-white"
                        placeholder="Enter amount"
                      />
                      <select
                        value={drinkSugarUnit}
                        onChange={(e) => setDrinkSugarUnit(e.target.value as SugarUnit)}
                        className="h-11 min-w-[84px] rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-3 text-[16px] text-gray-700 dark:text-gray-200"
                      >
                        {SUGAR_UNITS.map((unit) => (
                          <option key={unit} value={unit}>
                            {unit}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={handleSweetenedDrink}
                      disabled={drinkDetailSaving}
                      className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-60"
                    >
                      Add with {drinkSugarChoice === 'honey' ? 'honey' : 'sugar'}
                    </button>
                    <button
                      type="button"
                      onClick={() => navigateDrinkNutrition('search')}
                      disabled={drinkDetailSaving}
                      className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-60"
                    >
                      Search food
                    </button>
                    <button
                      type="button"
                      onClick={() => navigateDrinkNutrition('barcode')}
                      disabled={drinkDetailSaving}
                      className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-60"
                    >
                      Scan barcode
                    </button>
                    <button
                      type="button"
                      onClick={() => navigateDrinkNutrition('photo')}
                      disabled={drinkDetailSaving}
                      className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-60"
                    >
                      Add by photo
                    </button>
                    <button
                      type="button"
                      onClick={() => navigateDrinkNutrition('favorites')}
                      disabled={drinkDetailSaving}
                      className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-60 col-span-2"
                    >
                      Add from favorites
                    </button>
                  </div>
                </div>
              )}

              {drinkSugarChoice === 'free' && (
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={handleSugarFreeDrink}
                    disabled={drinkDetailSaving}
                    className="w-full px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-60"
                  >
                    Add drink
                  </button>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => navigateDrinkNutrition('search')}
                      disabled={drinkDetailSaving}
                      className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-60"
                    >
                      Search food
                    </button>
                    <button
                      type="button"
                      onClick={() => navigateDrinkNutrition('barcode')}
                      disabled={drinkDetailSaving}
                      className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-60"
                    >
                      Scan barcode
                    </button>
                    <button
                      type="button"
                      onClick={() => navigateDrinkNutrition('photo')}
                      disabled={drinkDetailSaving}
                      className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-60"
                    >
                      Add by photo
                    </button>
                    <button
                      type="button"
                      onClick={() => navigateDrinkNutrition('favorites')}
                      disabled={drinkDetailSaving}
                      className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-60 col-span-2"
                    >
                      Add from favorites
                    </button>
                  </div>
                </div>
              )}

              {drinkDetailError && <div className="text-xs text-red-600">{drinkDetailError}</div>}
            </div>
          </div>
        </div>
      )}
      {showGoalEditor && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40">
          <div className="w-full max-w-md bg-[#f6f7f6] dark:bg-[#151d15] rounded-t-[32px] shadow-2xl">
            <div className="flex flex-col items-center pt-3 pb-2">
              <div className="h-1.5 w-10 rounded-full bg-slate-300 dark:bg-slate-700"></div>
            </div>
            <div className="relative flex items-center justify-between px-6 py-2">
              <button
                type="button"
                onClick={() => setShowGoalEditor(false)}
                className="text-slate-500 hover:text-slate-700 dark:text-slate-400"
                aria-label="Close goal editor"
              >
                <MaterialSymbol name="close" className="text-2xl" />
              </button>
              <h4 className="text-slate-900 dark:text-white text-lg font-semibold leading-normal">Edit Daily Goal</h4>
              <div className="w-6"></div>
            </div>
            <div className="px-6 py-4 flex flex-col gap-6">
              <div className="flex flex-col items-center gap-2">
                <label className="w-full">
                  <p className="text-slate-600 dark:text-slate-400 text-sm font-medium leading-normal pb-3 text-center">
                    Set your daily intake goal
                  </p>
                  <div className="flex w-full items-center justify-center bg-white dark:bg-slate-800 rounded-2xl border-2 border-[#62b763]/20 focus-within:border-[#62b763] px-4 py-6 transition-colors">
                    <input
                      ref={goalInputRef}
                      className="form-input text-center w-full bg-transparent border-none focus:ring-0 text-5xl font-bold text-slate-900 dark:text-white placeholder:text-slate-300"
                      placeholder="0"
                      type="number"
                      inputMode="decimal"
                      enterKeyHint="done"
                      min="0"
                      step="0.1"
                      value={goalAmountInput}
                      onChange={(e) => setGoalAmountInput(e.target.value)}
                      onFocus={(e) => {
                        if (goalAutoClear) {
                          setGoalAmountInput('')
                          setGoalAutoClear(false)
                        } else {
                          e.currentTarget.select()
                        }
                      }}
                    />
                  </div>
                </label>
              </div>
              <div className="flex">
                <div className="flex h-12 flex-1 items-center justify-center rounded-xl bg-slate-200/50 dark:bg-slate-800 p-1.5">
                  {(['ml', 'l', 'oz'] as const).map((unit) => (
                    <button
                      key={unit}
                      type="button"
                      onClick={() => setGoalUnit(unit)}
                      className={`flex h-full grow items-center justify-center overflow-hidden rounded-lg px-2 text-sm font-semibold transition-all ${
                        goalUnit === unit
                          ? 'bg-white dark:bg-slate-700 shadow-sm text-[#62b763]'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {unit === 'l' ? 'L' : unit}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex flex-col items-center gap-1">
                <p className="text-slate-500 dark:text-slate-400 text-sm font-normal leading-relaxed text-center max-w-[280px]">
                  Based on your profile. Exercise adds a daily bonus from logged calories.
                </p>
                <button type="button" onClick={resetGoal} className="text-[#62b763] text-sm font-semibold mt-2 hover:underline">
                  Reset to recommended
                </button>
              </div>
              <div className="flex flex-col gap-3 mt-4 mb-8">
                <button
                  type="button"
                  onClick={saveGoal}
                  disabled={goalSaving}
                  className="w-full bg-[#62b763] hover:bg-[#62b763]/90 text-white font-bold py-4 rounded-2xl shadow-lg shadow-[#62b763]/20 transition-all active:scale-[0.98] disabled:opacity-60"
                >
                  {goalSaving ? 'Saving...' : 'Save Goal'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowGoalEditor(false)}
                  className="w-full bg-transparent text-slate-500 dark:text-slate-400 font-semibold py-2 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
            <div className="h-8 w-full"></div>
          </div>
        </div>
      )}
    </div>
  )
}
