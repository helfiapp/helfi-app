'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import PageHeader from '@/components/PageHeader'
import { useUserData } from '@/components/providers/UserDataProvider'
import { calculateDailyTargets } from '@/lib/daily-targets'
import {
  DEFAULT_HEALTH_CHECK_SETTINGS,
  HealthCheckSettings,
  normalizeHealthCheckSettings,
} from '@/lib/food-health-check-settings'

const MACRO_COLORS = {
  protein: '#ef4444',
  carbs: '#22c55e',
  fat: '#6366f1',
  fiber: '#12adc9',
  sugar: '#f97316',
} as const

const MACRO_GLOW = {
  protein: 'rgba(239, 68, 68, 0.25)',
  carbs: 'rgba(34, 197, 94, 0.25)',
  fat: 'rgba(99, 102, 241, 0.25)',
  fiber: 'rgba(18, 173, 201, 0.25)',
  sugar: 'rgba(249, 115, 22, 0.25)',
} as const

const BASE_THRESHOLDS = {
  sugar: 30,
  carbs: 90,
  fat: 35,
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)
const roundToStep = (value: number, step: number) => Math.round(value / step) * step

export default function FoodDiarySettingsPage() {
  const { userData, updateUserData } = useUserData()
  const [settings, setSettings] = useState<HealthCheckSettings>(DEFAULT_HEALTH_CHECK_SETTINGS)
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const sliderHapticRef = useRef<Record<string, number | null>>({})

  const dailyTargets = useMemo(() => {
    if (!userData) return { calories: null, protein: null, carbs: null, fat: null, sugarMax: null }
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
      typeof (userData as any).goalChoice === 'string' ? (userData as any).goalChoice.toLowerCase() : ''
    const useManualTargets = goalChoiceValue.includes('lose') || goalChoiceValue.includes('gain')

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

  const recommendedThresholds = useMemo(() => {
    const sugarTarget = Number((dailyTargets as any)?.sugarMax)
    const carbsTarget = Number(dailyTargets?.carbs)
    const fatTarget = Number(dailyTargets?.fat)
    const pick = (target: number, base: number) =>
      Number.isFinite(target) && target > 0 ? Math.max(base, target * 0.55) : base
    return {
      sugar: pick(sugarTarget, BASE_THRESHOLDS.sugar),
      carbs: pick(carbsTarget, BASE_THRESHOLDS.carbs),
      fat: pick(fatTarget, BASE_THRESHOLDS.fat),
    }
  }, [dailyTargets])

  useEffect(() => {
    if (!userData) return
    const normalized = normalizeHealthCheckSettings((userData as any).healthCheckSettings)
    const seeded: HealthCheckSettings = {
      ...normalized,
      thresholds: {
        sugar: normalized.thresholds.sugar ?? Math.round(recommendedThresholds.sugar),
        carbs: normalized.thresholds.carbs ?? Math.round(recommendedThresholds.carbs),
        fat: normalized.thresholds.fat ?? Math.round(recommendedThresholds.fat),
      },
    }
    setSettings(seeded)
    setSettingsLoaded(true)
  }, [userData, recommendedThresholds])

  const scheduleSave = useCallback(
    (next: HealthCheckSettings) => {
      setSettings(next)
      updateUserData({ healthCheckSettings: next })
      if (!settingsLoaded) return
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
      setSaveStatus('saving')
      saveTimeoutRef.current = setTimeout(async () => {
        try {
          const response = await fetch('/api/user-data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ healthCheckSettings: next }),
          })
          if (!response.ok) throw new Error('save failed')
          setSaveStatus('saved')
          setTimeout(() => setSaveStatus('idle'), 1500)
        } catch (error) {
          console.error('Failed to save health check settings', error)
          setSaveStatus('error')
          setTimeout(() => setSaveStatus('idle'), 2000)
        }
      }, 350)
    },
    [settingsLoaded, updateUserData],
  )

  const triggerSliderHaptic = (key: string, value: number) => {
    const normalized = Number(value.toFixed(3))
    if (sliderHapticRef.current[key] === normalized) return
    sliderHapticRef.current[key] = normalized
    try {
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')?.matches
      const pref = typeof window !== 'undefined' ? localStorage.getItem('hapticsEnabled') : null
      const enabled = pref === null ? true : pref === 'true'
      if (!reduced && enabled && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate(40)
      }
    } catch {}
  }

  const sliderBounds = useMemo(() => {
    const build = (recommended: number, min: number, max: number, step: number) => {
      const safe = Number.isFinite(recommended) ? recommended : max
      const clampedMax = Math.max(max, Math.ceil(safe / step) * step)
      return { min, max: clampedMax, step }
    }
    return {
      sugar: build(recommendedThresholds.sugar, 10, 120, 5),
      carbs: build(recommendedThresholds.carbs, 40, 260, 5),
      fat: build(recommendedThresholds.fat, 20, 140, 5),
    }
  }, [recommendedThresholds])

  const handleThresholdChange = (key: 'sugar' | 'carbs' | 'fat', value: number) => {
    const bounds = sliderBounds[key]
    const nextValue = clamp(roundToStep(value, bounds.step), bounds.min, bounds.max)
    triggerSliderHaptic(key, nextValue)
    scheduleSave({
      ...settings,
      thresholds: {
        ...settings.thresholds,
        [key]: nextValue,
      },
    })
  }

  const tickStyle = (min: number, max: number, step: number) => {
    const count = Math.max(1, Math.round((max - min) / step))
    return {
      backgroundImage: 'linear-gradient(to right, rgba(148,163,184,0.55) 1px, transparent 1px)',
      backgroundSize: `${100 / count}% 100%`,
      backgroundRepeat: 'repeat',
    } as CSSProperties
  }

  const capEnabled = settings.dailyCap !== null && Number.isFinite(settings.dailyCap)
  const capValue = capEnabled ? Math.max(1, Math.round(settings.dailyCap || 0)) : 2

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <PageHeader title="Food Diary" backHref="/settings" />

      <main className="max-w-3xl mx-auto px-4 py-6 pb-24">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 space-y-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Health check prompts</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Control when the food diary suggests a paid health check based on your goals and diet.
              </p>
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {saveStatus === 'saving' && 'Saving...'}
              {saveStatus === 'saved' && 'Saved'}
              {saveStatus === 'error' && 'Save failed'}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium text-gray-900 dark:text-white">Enable health check prompts</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">Show the prompt before running a check.</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={settings.enabled}
                onChange={(e) =>
                  scheduleSave({
                    ...settings,
                    enabled: e.target.checked,
                  })
                }
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-helfi-green/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-helfi-green"></div>
            </label>
          </div>

          <div className="space-y-3">
            <div>
              <h3 className="font-medium text-gray-900 dark:text-white">Prompt frequency</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">Only high risk is recommended.</p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { key: 'always', label: 'Always' },
                { key: 'high', label: 'Only high risk' },
                { key: 'never', label: 'Never' },
              ].map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() =>
                    scheduleSave({
                      ...settings,
                      frequency: option.key as HealthCheckSettings['frequency'],
                    })
                  }
                  className={`w-full py-2 rounded-xl border text-sm font-semibold ${
                    settings.frequency === option.key
                      ? 'bg-helfi-green text-white border-helfi-green'
                      : 'border-gray-300 text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-700'
                  } transition-colors`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <h3 className="font-medium text-gray-900 dark:text-white">Daily cap</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">Limit how many prompts you see per day.</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[
                { key: 'none', label: 'No cap' },
                { key: 'cap', label: 'Set a cap' },
              ].map((option) => {
                const active = option.key === 'cap' ? capEnabled : !capEnabled
                return (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => {
                      if (option.key === 'none') {
                        scheduleSave({ ...settings, dailyCap: null })
                      } else {
                        scheduleSave({ ...settings, dailyCap: capValue })
                      }
                    }}
                    className={`w-full py-2 rounded-xl border text-sm font-semibold ${
                      active
                        ? 'bg-helfi-green text-white border-helfi-green'
                        : 'border-gray-300 text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-700'
                    } transition-colors`}
                  >
                    {option.label}
                  </button>
                )
              })}
            </div>
            {capEnabled && (
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min={1}
                  max={10}
                  className="w-24 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-helfi-green focus:ring-1 focus:ring-helfi-green dark:bg-gray-800 dark:border-gray-600 dark:text-white"
                  value={capValue}
                  onChange={(e) =>
                    scheduleSave({
                      ...settings,
                      dailyCap: Math.max(1, Math.round(Number(e.target.value || 1))),
                    })
                  }
                />
                <span className="text-sm text-gray-600 dark:text-gray-400">prompts per day</span>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div>
              <h3 className="font-medium text-gray-900 dark:text-white">High-risk trigger levels</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Adjust the thresholds that decide when a prompt appears.
              </p>
            </div>

            {([
              {
                key: 'sugar',
                label: 'Sugar',
                color: MACRO_COLORS.sugar,
                glow: MACRO_GLOW.sugar,
              },
              {
                key: 'carbs',
                label: 'Carbs',
                color: MACRO_COLORS.carbs,
                glow: MACRO_GLOW.carbs,
              },
              {
                key: 'fat',
                label: 'Fat',
                color: MACRO_COLORS.fat,
                glow: MACRO_GLOW.fat,
              },
            ] as const).map((item) => {
              const bounds = sliderBounds[item.key]
              const value = clamp(settings.thresholds[item.key] ?? bounds.min, bounds.min, bounds.max)
              const progress =
                bounds.max > bounds.min ? ((value - bounds.min) / (bounds.max - bounds.min)) * 100 : 0
              return (
                <div key={item.key} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="size-2 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="text-sm font-semibold text-gray-900 dark:text-white">{item.label}</span>
                    </div>
                    <span className="text-sm font-semibold" style={{ color: item.color }}>
                      {Math.round(value)} g
                    </span>
                  </div>
                  <input
                    type="range"
                    min={bounds.min}
                    max={bounds.max}
                    step={bounds.step}
                    value={value}
                    onInput={(e) => handleThresholdChange(item.key, Number(e.currentTarget.value))}
                    className="w-full cursor-pointer goal-pace-slider"
                    style={
                      {
                        '--progress': `${Math.min(100, Math.max(0, progress))}%`,
                        '--slider-color': item.color,
                        '--slider-glow': item.glow,
                      } as React.CSSProperties
                    }
                  />
                  <div className="h-2 w-full rounded-full" style={tickStyle(bounds.min, bounds.max, bounds.step)} />
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Prompt when {item.label.toLowerCase()} exceeds {Math.round(value)} g.
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      </main>
    </div>
  )
}
