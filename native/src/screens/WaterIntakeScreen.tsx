import React, { useCallback, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker'
import { useFocusEffect } from '@react-navigation/native'

import { API_BASE_URL } from '../config'
import { buildNativeAuthHeaders } from '../lib/nativeAuthHeaders'
import { useAppMode } from '../state/AppModeContext'
import { Screen } from '../ui/Screen'
import { theme } from '../ui/theme'

type WaterEntry = {
  id: string
  amount: number
  unit: string
  amountMl: number
  label: string | null
  category?: string | null
  localDate?: string | null
  createdAt: string
}

type GoalResponse = {
  targetMl: number
  recommendedMl: number
  source: 'auto' | 'custom'
  exerciseBonusMl?: number
}

type SugarUnit = 'g' | 'tsp' | 'tbsp'

type SugarChoice = 'free' | 'sugar' | 'honey' | null

const DRINK_TYPES = ['Water', 'Coffee', 'Tea', 'Juice', 'Hot Chocolate', 'Soft Drink', 'Alcohol'] as const

const QUICK_PRESETS: Array<{ amount: number; unit: 'ml' | 'l' | 'oz' }> = [
  { amount: 250, unit: 'ml' },
  { amount: 330, unit: 'ml' },
  { amount: 500, unit: 'ml' },
  { amount: 1, unit: 'l' },
]

const HONEY_TBSP_GRAMS = 21
const HONEY_TSP_GRAMS = 7
const HONEY_CAL_PER_GRAM = 64 / HONEY_TBSP_GRAMS
const HONEY_CARBS_PER_GRAM = 17.3 / HONEY_TBSP_GRAMS
const HONEY_SUGAR_PER_GRAM = 17.2 / HONEY_TBSP_GRAMS

function formatLocalDate(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function parseLocalDate(raw: string) {
  const [y, m, d] = String(raw || '').split('-').map((value) => Number(value))
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return new Date()
  return new Date(y, m - 1, d)
}

function shiftDate(raw: string, deltaDays: number) {
  const base = parseLocalDate(raw)
  base.setDate(base.getDate() + deltaDays)
  return formatLocalDate(base)
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

function toNumber(value: any) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return n
}

function normalizeAmount(text: string) {
  const n = Number(text)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.round(n * 100) / 100
}

function formatNumber(value: number) {
  if (!Number.isFinite(value)) return '0'
  if (Math.abs(value - Math.round(value)) < 0.0001) return String(Math.round(value))
  return value.toFixed(2).replace(/\.0+$/, '').replace(/(\.[1-9])0$/, '$1')
}

function formatAmount(amount: number, unit: string) {
  const label = String(unit || '').toLowerCase() === 'l' ? 'L' : unit
  return `${formatNumber(amount)} ${label}`
}

function formatMl(ml: number | null | undefined) {
  const value = toNumber(ml)
  if (value <= 0) return '0 ml'
  if (value >= 1000) {
    return `${formatNumber(Math.round((value / 1000) * 100) / 100)} L`
  }
  return `${Math.round(value)} ml`
}

function sugarToGrams(amount: number, unit: SugarUnit) {
  if (!Number.isFinite(amount) || amount <= 0) return 0
  if (unit === 'g') return amount
  if (unit === 'tbsp') return amount * 12
  return amount * 4
}

function honeyToGrams(amount: number, unit: SugarUnit) {
  if (!Number.isFinite(amount) || amount <= 0) return 0
  if (unit === 'g') return amount
  if (unit === 'tbsp') return amount * HONEY_TBSP_GRAMS
  return amount * HONEY_TSP_GRAMS
}

function sweetenerToMacros(grams: number, type: 'sugar' | 'honey') {
  if (!Number.isFinite(grams) || grams <= 0) {
    return { calories: 0, carbs: 0, sugar: 0 }
  }
  if (type === 'honey') {
    return {
      calories: Math.round(grams * HONEY_CAL_PER_GRAM * 10) / 10,
      carbs: Math.round(grams * HONEY_CARBS_PER_GRAM * 10) / 10,
      sugar: Math.round(grams * HONEY_SUGAR_PER_GRAM * 10) / 10,
    }
  }
  const carbs = Math.round(grams * 10) / 10
  return {
    calories: Math.round(grams * 4 * 10) / 10,
    carbs,
    sugar: carbs,
  }
}

function goalToInput(targetMl: number) {
  if (targetMl >= 1000) {
    return { amount: formatNumber(Math.round((targetMl / 1000) * 100) / 100), unit: 'l' as const }
  }
  return { amount: formatNumber(Math.round(targetMl)), unit: 'ml' as const }
}

function normalizeUnit(raw: string): 'ml' | 'l' | 'oz' {
  const unit = String(raw || '').toLowerCase().trim()
  if (unit === 'l' || unit === 'oz') return unit
  return 'ml'
}

function formatTime(value: string) {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

export function WaterIntakeScreen() {
  const { mode, session } = useAppMode()

  const authHeaders = useMemo(() => {
    if (mode !== 'signedIn' || !session?.token) return null
    return buildNativeAuthHeaders(session.token, { includeCookie: true })
  }, [mode, session?.token])

  const [selectedDate, setSelectedDate] = useState(formatLocalDate())
  const [showDatePicker, setShowDatePicker] = useState(false)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [entries, setEntries] = useState<WaterEntry[]>([])
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const [goalLoading, setGoalLoading] = useState(false)
  const [goalSaving, setGoalSaving] = useState(false)
  const [goalTargetMl, setGoalTargetMl] = useState<number | null>(null)
  const [goalRecommendedMl, setGoalRecommendedMl] = useState<number | null>(null)
  const [goalSource, setGoalSource] = useState<'auto' | 'custom'>('auto')
  const [goalExerciseBonusMl, setGoalExerciseBonusMl] = useState(0)

  const [activeDrink, setActiveDrink] = useState<(typeof DRINK_TYPES)[number]>('Water')
  const [lastPresetKey, setLastPresetKey] = useState<string | null>(null)
  const [customAmountInput, setCustomAmountInput] = useState('')
  const [customUnit, setCustomUnit] = useState<'ml' | 'l' | 'oz'>('ml')

  const [drinkDetailOpen, setDrinkDetailOpen] = useState(false)
  const [drinkAmount, setDrinkAmount] = useState(0)
  const [drinkUnit, setDrinkUnit] = useState<'ml' | 'l' | 'oz'>('ml')
  const [drinkSugarChoice, setDrinkSugarChoice] = useState<SugarChoice>(null)
  const [drinkSugarAmount, setDrinkSugarAmount] = useState('')
  const [drinkSugarUnit, setDrinkSugarUnit] = useState<SugarUnit>('tsp')

  const [goalEditorOpen, setGoalEditorOpen] = useState(false)
  const [goalAmountInput, setGoalAmountInput] = useState('')
  const [goalUnit, setGoalUnit] = useState<'ml' | 'l' | 'oz'>('ml')

  const totalMl = useMemo(() => {
    return entries.reduce((sum, item) => sum + toNumber(item.amountMl), 0)
  }, [entries])

  const effectiveGoalMl = useMemo(() => {
    if (goalTargetMl && goalTargetMl > 0) return goalTargetMl
    if (goalRecommendedMl && goalRecommendedMl > 0) return goalRecommendedMl
    return null
  }, [goalRecommendedMl, goalTargetMl])

  const progressPercent = useMemo(() => {
    if (!effectiveGoalMl || effectiveGoalMl <= 0) return 0
    return Math.min(100, Math.round((totalMl / effectiveGoalMl) * 100))
  }, [effectiveGoalMl, totalMl])

  const loadEntries = useCallback(async () => {
    if (!authHeaders) {
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      const res = await fetch(`${API_BASE_URL}/api/native-water-log?localDate=${selectedDate}`, {
        headers: authHeaders,
      })
      const data: any = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String(data?.error || 'Could not load water logs.'))
      setEntries(Array.isArray(data?.entries) ? data.entries : [])
    } catch (error: any) {
      setEntries([])
      Alert.alert('Could not load water logs', error?.message || 'Please try again.')
    } finally {
      setLoading(false)
    }
  }, [authHeaders, selectedDate])

  const loadGoal = useCallback(async () => {
    if (!session?.token) return

    try {
      setGoalLoading(true)
      const res = await fetch(`${API_BASE_URL}/api/hydration-goal?date=${selectedDate}`, {
        headers: buildNativeAuthHeaders(session.token, { includeCookie: true }),
      })
      const data: GoalResponse = await res.json().catch(() => ({} as any))
      if (!res.ok) return

      const target = toNumber((data as any)?.targetMl)
      const recommended = toNumber((data as any)?.recommendedMl)
      setGoalTargetMl(target > 0 ? Math.round(target) : null)
      setGoalRecommendedMl(recommended > 0 ? Math.round(recommended) : null)
      setGoalSource((data as any)?.source === 'custom' ? 'custom' : 'auto')
      setGoalExerciseBonusMl(Math.max(0, Math.round(toNumber((data as any)?.exerciseBonusMl))))
    } catch {
      // Keep prior goal values if load fails.
    } finally {
      setGoalLoading(false)
    }
  }, [selectedDate, session?.token])

  const loadAll = useCallback(async () => {
    await Promise.all([loadEntries(), loadGoal()])
  }, [loadEntries, loadGoal])

  useFocusEffect(
    useCallback(() => {
      void loadAll()
      return () => {}
    }, [loadAll]),
  )

  const addFoodDiaryDrink = async (params: {
    label: string
    calories: number
    carbs: number
    sugar: number
    waterLogId?: string
  }) => {
    if (!session?.token) return

    await fetch(`${API_BASE_URL}/api/native-food-log`, {
      method: 'POST',
      headers: buildNativeAuthHeaders(session.token, { json: true }),
      body: JSON.stringify({
        localDate: selectedDate,
        meal: 'uncategorized',
        name: params.label,
        calories: Math.max(0, params.calories),
        protein: 0,
        carbs: Math.max(0, params.carbs),
        fat: 0,
        description: params.waterLogId ? `Water log ${params.waterLogId}` : 'Water page drink',
        nutrients: {
          calories: Math.max(0, params.calories),
          protein: 0,
          carbs: Math.max(0, params.carbs),
          fat: 0,
          fiber: 0,
          sugar: Math.max(0, params.sugar),
        },
      }),
    })
  }

  const addEntry = async (amount: number, unit: 'ml' | 'l' | 'oz', label?: string) => {
    if (!session?.token) return null

    const res = await fetch(`${API_BASE_URL}/api/native-water-log`, {
      method: 'POST',
      headers: buildNativeAuthHeaders(session.token, { json: true, includeCookie: true }),
      body: JSON.stringify({
        amount,
        unit,
        localDate: selectedDate,
        label: label || `${formatNumber(amount)} ${unit === 'l' ? 'L' : unit}`,
        category: 'other',
      }),
    })

    const data: any = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(String(data?.error || 'Could not save water entry.'))

    const created = data?.entry || null
    await loadEntries()
    return created
  }

  const handleQuickAdd = async (amount: number, unit: 'ml' | 'l' | 'oz') => {
    setLastPresetKey(`${amount}-${unit}`)

    if (activeDrink === 'Water') {
      try {
        await addEntry(amount, unit)
      } catch (error: any) {
        Alert.alert('Save failed', error?.message || 'Please try again.')
      }
      return
    }

    setDrinkAmount(amount)
    setDrinkUnit(unit)
    setDrinkSugarChoice(null)
    setDrinkSugarAmount('')
    setDrinkSugarUnit('tsp')
    setDrinkDetailOpen(true)
  }

  const handleCustomAdd = async () => {
    const amount = normalizeAmount(customAmountInput)
    if (!amount) {
      Alert.alert('Invalid amount', 'Please enter a valid amount first.')
      return
    }

    if (activeDrink === 'Water') {
      try {
        await addEntry(amount, customUnit)
        setCustomAmountInput('')
      } catch (error: any) {
        Alert.alert('Save failed', error?.message || 'Please try again.')
      }
      return
    }

    setDrinkAmount(amount)
    setDrinkUnit(customUnit)
    setDrinkSugarChoice(null)
    setDrinkSugarAmount('')
    setDrinkSugarUnit('tsp')
    setDrinkDetailOpen(true)
    setCustomAmountInput('')
  }

  const handleSugarFreeDrink = async () => {
    setSaving(true)
    try {
      const label = `${activeDrink}`
      const created = await addEntry(drinkAmount, drinkUnit, label)
      await addFoodDiaryDrink({ label, calories: 0, carbs: 0, sugar: 0, waterLogId: created?.id })
      setDrinkDetailOpen(false)
    } catch (error: any) {
      Alert.alert('Save failed', error?.message || 'Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleSweetenedDrink = async () => {
    if (drinkSugarChoice !== 'sugar' && drinkSugarChoice !== 'honey') return

    const rawAmount = toNumber(drinkSugarAmount)
    if (rawAmount <= 0) {
      Alert.alert('Invalid amount', 'Please enter a valid sweetener amount.')
      return
    }

    const grams =
      drinkSugarChoice === 'honey' ? honeyToGrams(rawAmount, drinkSugarUnit) : sugarToGrams(rawAmount, drinkSugarUnit)
    if (grams <= 0) {
      Alert.alert('Invalid amount', 'Please enter a valid sweetener amount.')
      return
    }

    const macros = sweetenerToMacros(grams, drinkSugarChoice)

    setSaving(true)
    try {
      const label = `${activeDrink} (${drinkSugarChoice} ${formatNumber(rawAmount)} ${drinkSugarUnit})`
      const created = await addEntry(drinkAmount, drinkUnit, label)
      await addFoodDiaryDrink({
        label,
        calories: macros.calories,
        carbs: macros.carbs,
        sugar: macros.sugar,
        waterLogId: created?.id,
      })
      setDrinkDetailOpen(false)
    } catch (error: any) {
      Alert.alert('Save failed', error?.message || 'Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const deleteEntry = async (id: string) => {
    if (!session?.token) return
    setDeletingId(id)
    try {
      const res = await fetch(`${API_BASE_URL}/api/water-log/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: buildNativeAuthHeaders(session.token, { includeCookie: true }),
      })
      if (!res.ok) throw new Error('Could not delete this entry.')
      await loadEntries()
    } catch (error: any) {
      Alert.alert('Delete failed', error?.message || 'Please try again.')
    } finally {
      setDeletingId(null)
    }
  }

  const openGoalEditor = () => {
    if (effectiveGoalMl && effectiveGoalMl > 0) {
      const next = goalToInput(effectiveGoalMl)
      setGoalAmountInput(next.amount)
      setGoalUnit(next.unit)
    } else {
      setGoalAmountInput('')
      setGoalUnit('ml')
    }
    setGoalEditorOpen(true)
  }

  const saveGoal = async () => {
    if (!session?.token) return
    const amount = normalizeAmount(goalAmountInput)
    if (!amount) {
      Alert.alert('Invalid amount', 'Please enter a valid goal amount.')
      return
    }

    setGoalSaving(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/hydration-goal`, {
        method: 'POST',
        headers: buildNativeAuthHeaders(session.token, { json: true, includeCookie: true }),
        body: JSON.stringify({ amount, unit: goalUnit }),
      })
      if (!res.ok) throw new Error('Could not update goal.')
      await loadGoal()
      setGoalEditorOpen(false)
    } catch (error: any) {
      Alert.alert('Save failed', error?.message || 'Please try again.')
    } finally {
      setGoalSaving(false)
    }
  }

  const resetGoal = async () => {
    if (!session?.token) return
    setGoalSaving(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/hydration-goal`, {
        method: 'DELETE',
        headers: buildNativeAuthHeaders(session.token, { includeCookie: true }),
      })
      if (!res.ok) throw new Error('Could not reset goal.')
      await loadGoal()
      setGoalEditorOpen(false)
    } catch (error: any) {
      Alert.alert('Reset failed', error?.message || 'Please try again.')
    } finally {
      setGoalSaving(false)
    }
  }

  const onDateChange = (_event: DateTimePickerEvent, pickedDate?: Date) => {
    setShowDatePicker(false)
    if (!pickedDate) return
    setSelectedDate(formatLocalDate(pickedDate))
  }

  if (mode !== 'signedIn' || !session?.token) {
    return (
      <Screen style={{ alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <Text style={{ color: theme.colors.text, fontWeight: '800', fontSize: 18 }}>Please sign in</Text>
        <Text style={{ color: theme.colors.muted, marginTop: 6, textAlign: 'center' }}>
          Water Intake is available after sign-in.
        </Text>
      </Screen>
    )
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 28 }}>
        <View style={cardStyle}>
          <Text style={{ fontSize: 30, fontWeight: '900', color: theme.colors.text }}>Water Intake</Text>

          <View style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Pressable onPress={() => setSelectedDate((prev) => shiftDate(prev, -1))} style={pillButton}>
              <Text style={pillButtonText}>◀</Text>
            </Pressable>

            <Pressable onPress={() => setShowDatePicker(true)} style={[pillButton, { flex: 1, marginHorizontal: 8 }]}> 
              <Text style={pillButtonText}>{formatDateLabel(selectedDate)}</Text>
            </Pressable>

            <Pressable onPress={() => setSelectedDate((prev) => shiftDate(prev, 1))} style={pillButton}>
              <Text style={pillButtonText}>▶</Text>
            </Pressable>
          </View>
        </View>

        <View style={[cardStyle, { marginTop: 12 }]}> 
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ fontSize: 18, fontWeight: '900', color: theme.colors.text, flex: 1 }}>
              Daily hydration summary
            </Text>
            <Pressable onPress={openGoalEditor} style={miniPrimaryButton}>
              <Text style={miniPrimaryText}>Edit goal</Text>
            </Pressable>
          </View>

          <Text style={{ marginTop: 8, color: theme.colors.text, fontSize: 28, fontWeight: '900' }}>
            {formatMl(totalMl)}
            {effectiveGoalMl ? <Text style={{ fontSize: 16, color: theme.colors.muted }}> / {formatMl(effectiveGoalMl)}</Text> : null}
          </Text>

          <Text style={{ marginTop: 4, color: theme.colors.muted, fontWeight: '700' }}>
            {effectiveGoalMl ? `${progressPercent}% of daily goal` : 'Set a daily goal'}
            {goalLoading ? ' • loading goal' : ''}
          </Text>

          <View style={{ marginTop: 10, height: 8, borderRadius: 999, backgroundColor: '#E6EFEC', overflow: 'hidden' }}>
            <View style={{ width: `${progressPercent}%`, height: '100%', backgroundColor: theme.colors.primary }} />
          </View>

          <Text style={{ marginTop: 8, color: theme.colors.muted, fontSize: 12 }}>
            {entries.length} {entries.length === 1 ? 'entry' : 'entries'} logged on this day
          </Text>

          {goalExerciseBonusMl > 0 && goalSource === 'auto' ? (
            <Text style={{ marginTop: 4, color: theme.colors.muted, fontSize: 12 }}>
              Activity bonus: +{formatMl(goalExerciseBonusMl)}
            </Text>
          ) : null}

          {goalSource === 'custom' ? (
            <Text style={{ marginTop: 4, color: theme.colors.primary, fontSize: 12, fontWeight: '700' }}>Custom goal active</Text>
          ) : null}
        </View>

        <View style={[cardStyle, { marginTop: 12 }]}> 
          <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 18 }}>Quick add</Text>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginTop: 8 }}>
            {DRINK_TYPES.map((drink) => (
              <Pressable
                key={drink}
                onPress={() => setActiveDrink(drink)}
                style={[chip, activeDrink === drink && chipActive]}
              >
                <Text style={[chipText, activeDrink === drink && chipTextActive]}>{drink}</Text>
              </Pressable>
            ))}
          </ScrollView>

          <View style={{ marginTop: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {QUICK_PRESETS.map((preset) => {
              const key = `${preset.amount}-${preset.unit}`
              const selected = lastPresetKey === key
              return (
                <Pressable
                  key={key}
                  onPress={() => void handleQuickAdd(preset.amount, preset.unit)}
                  style={[
                    {
                      borderWidth: 1,
                      borderColor: selected ? theme.colors.primary : theme.colors.border,
                      borderRadius: 10,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      backgroundColor: selected ? '#E8F5EB' : '#FBFDFC',
                      minWidth: 78,
                      alignItems: 'center',
                    },
                  ]}
                >
                  <Text style={{ color: selected ? theme.colors.primary : theme.colors.text, fontWeight: '900' }}>
                    {formatNumber(preset.amount)}
                  </Text>
                  <Text style={{ color: selected ? theme.colors.primary : theme.colors.muted, fontSize: 11 }}>
                    {preset.unit === 'l' ? 'L' : preset.unit}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        </View>

        <View style={[cardStyle, { marginTop: 12 }]}> 
          <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 18 }}>Custom drink</Text>

          <View style={{ marginTop: 10, flexDirection: 'row', gap: 8 }}>
            <TextInput
              value={customAmountInput}
              onChangeText={setCustomAmountInput}
              keyboardType="decimal-pad"
              placeholder="Amount"
              placeholderTextColor="#8AA39D"
              style={[inputStyle, { flex: 1 }]}
            />

            <View style={{ flexDirection: 'row', gap: 6 }}>
              {(['ml', 'l', 'oz'] as const).map((unit) => (
                <Pressable key={unit} onPress={() => setCustomUnit(unit)} style={[chip, customUnit === unit && chipActive]}>
                  <Text style={[chipText, customUnit === unit && chipTextActive]}>{unit === 'l' ? 'L' : unit}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          <Pressable onPress={() => void handleCustomAdd()} style={[primaryButton, { marginTop: 10 }]}> 
            <Text style={primaryButtonText}>Add Entry</Text>
          </Pressable>
        </View>

        <View style={[cardStyle, { marginTop: 12 }]}> 
          <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 18 }}>Water history</Text>

          {loading ? (
            <View style={{ paddingVertical: 16, alignItems: 'center' }}>
              <ActivityIndicator color={theme.colors.primary} />
              <Text style={{ color: theme.colors.muted, marginTop: 8 }}>Loading entries...</Text>
            </View>
          ) : entries.length === 0 ? (
            <Text style={{ color: theme.colors.muted, marginTop: 8 }}>No water entries yet for this day.</Text>
          ) : (
            <View style={{ marginTop: 10, gap: 8 }}>
              {entries.map((entry) => (
                <View
                  key={entry.id}
                  style={{
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    borderRadius: 10,
                    padding: 10,
                    backgroundColor: '#FBFDFC',
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: theme.colors.text, fontWeight: '800' }}>{entry.label || 'Drink'}</Text>
                      <Text style={{ color: theme.colors.muted, marginTop: 2, fontSize: 12 }}>
                        {formatTime(entry.createdAt)} • {formatAmount(entry.amount, normalizeUnit(entry.unit))}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => void deleteEntry(entry.id)}
                      disabled={deletingId === entry.id}
                      style={[miniDangerButton, deletingId === entry.id && { opacity: 0.5 }]}
                    >
                      <Text style={miniDangerText}>{deletingId === entry.id ? 'Deleting...' : 'Delete'}</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      {showDatePicker ? (
        <DateTimePicker
          value={parseLocalDate(selectedDate)}
          mode="date"
          display="default"
          onChange={onDateChange}
        />
      ) : null}

      <Modal transparent visible={drinkDetailOpen} animationType="fade" onRequestClose={() => setDrinkDetailOpen(false)}>
        <View style={modalBackdrop}>
          <View style={modalCardLarge}>
            <Text style={modalTitle}>Drink details</Text>
            <Text style={{ color: theme.colors.muted, marginTop: 4 }}>
              {activeDrink} • {formatAmount(drinkAmount, drinkUnit)}
            </Text>

            <View style={{ marginTop: 10, flexDirection: 'row', gap: 8 }}>
              <Pressable onPress={() => setDrinkSugarChoice('free')} style={[chip, drinkSugarChoice === 'free' && chipActive]}>
                <Text style={[chipText, drinkSugarChoice === 'free' && chipTextActive]}>Sugar-free</Text>
              </Pressable>
              <Pressable onPress={() => setDrinkSugarChoice('sugar')} style={[chip, drinkSugarChoice === 'sugar' && chipActive]}>
                <Text style={[chipText, drinkSugarChoice === 'sugar' && chipTextActive]}>Sugar</Text>
              </Pressable>
              <Pressable onPress={() => setDrinkSugarChoice('honey')} style={[chip, drinkSugarChoice === 'honey' && chipActive]}>
                <Text style={[chipText, drinkSugarChoice === 'honey' && chipTextActive]}>Honey</Text>
              </Pressable>
            </View>

            {(drinkSugarChoice === 'sugar' || drinkSugarChoice === 'honey') ? (
              <View style={{ marginTop: 10, gap: 8 }}>
                <TextInput
                  value={drinkSugarAmount}
                  onChangeText={setDrinkSugarAmount}
                  keyboardType="decimal-pad"
                  placeholder={drinkSugarChoice === 'honey' ? 'Honey amount' : 'Sugar amount'}
                  placeholderTextColor="#8AA39D"
                  style={inputStyle}
                />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {(['g', 'tsp', 'tbsp'] as const).map((unit) => (
                    <Pressable key={unit} onPress={() => setDrinkSugarUnit(unit)} style={[chip, drinkSugarUnit === unit && chipActive]}>
                      <Text style={[chipText, drinkSugarUnit === unit && chipTextActive]}>{unit}</Text>
                    </Pressable>
                  ))}
                </View>

                <View style={{ borderWidth: 1, borderColor: theme.colors.border, borderRadius: 10, padding: 10 }}>
                  {(() => {
                    const amount = toNumber(drinkSugarAmount)
                    const grams =
                      drinkSugarChoice === 'honey'
                        ? honeyToGrams(amount, drinkSugarUnit)
                        : sugarToGrams(amount, drinkSugarUnit)
                    const macros = sweetenerToMacros(grams, drinkSugarChoice)
                    return (
                      <Text style={{ color: theme.colors.muted }}>
                        Auto nutrition: {Math.round(macros.calories)} kcal • Carbs {formatNumber(macros.carbs)}g • Sugar {formatNumber(macros.sugar)}g
                      </Text>
                    )
                  })()}
                </View>
              </View>
            ) : null}

            <View style={{ marginTop: 12, flexDirection: 'row', gap: 8 }}>
              <Pressable
                onPress={() => {
                  if (drinkSugarChoice === 'free') {
                    void handleSugarFreeDrink()
                    return
                  }
                  if (drinkSugarChoice === 'sugar' || drinkSugarChoice === 'honey') {
                    void handleSweetenedDrink()
                    return
                  }
                  Alert.alert('Choose an option', 'Please choose Sugar-free, Sugar, or Honey.')
                }}
                style={primaryButton}
                disabled={saving}
              >
                <Text style={primaryButtonText}>{saving ? 'Saving...' : 'Save drink'}</Text>
              </Pressable>
              <Pressable onPress={() => setDrinkDetailOpen(false)} style={secondaryButton}>
                <Text style={secondaryButtonText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal transparent visible={goalEditorOpen} animationType="fade" onRequestClose={() => setGoalEditorOpen(false)}>
        <View style={modalBackdrop}>
          <View style={modalCard}>
            <Text style={modalTitle}>Edit daily goal</Text>

            <TextInput
              value={goalAmountInput}
              onChangeText={setGoalAmountInput}
              keyboardType="decimal-pad"
              placeholder="Goal amount"
              placeholderTextColor="#8AA39D"
              style={[inputStyle, { marginTop: 10 }]}
            />

            <View style={{ marginTop: 8, flexDirection: 'row', gap: 8 }}>
              {(['ml', 'l', 'oz'] as const).map((unit) => (
                <Pressable key={unit} onPress={() => setGoalUnit(unit)} style={[chip, goalUnit === unit && chipActive]}>
                  <Text style={[chipText, goalUnit === unit && chipTextActive]}>{unit === 'l' ? 'L' : unit}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={{ marginTop: 10, color: theme.colors.muted, fontSize: 12 }}>
              Auto goal uses your profile and includes activity bonus from exercise.
            </Text>

            <Pressable onPress={() => void resetGoal()} style={[miniSecondaryButton, { marginTop: 10, alignSelf: 'flex-start' }]}>
              <Text style={miniSecondaryText}>Reset to recommended</Text>
            </Pressable>

            <View style={{ marginTop: 12, flexDirection: 'row', gap: 8 }}>
              <Pressable onPress={() => void saveGoal()} style={primaryButton} disabled={goalSaving}>
                <Text style={primaryButtonText}>{goalSaving ? 'Saving...' : 'Save Goal'}</Text>
              </Pressable>
              <Pressable onPress={() => setGoalEditorOpen(false)} style={secondaryButton}>
                <Text style={secondaryButtonText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  )
}

const cardStyle = {
  backgroundColor: theme.colors.card,
  borderWidth: 1,
  borderColor: theme.colors.border,
  borderRadius: theme.radius.lg,
  padding: 14,
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
