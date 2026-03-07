import React, { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native'
import Slider from '@react-native-community/slider'

import { API_BASE_URL } from '../config'
import { useAppMode } from '../state/AppModeContext'
import { Screen } from '../ui/Screen'
import { theme } from '../ui/theme'

type HealthCheckFrequency = 'always' | 'high' | 'never'

type HealthCheckSettings = {
  enabled: boolean
  frequency: HealthCheckFrequency
  dailyCap: number | null
  thresholds: {
    sugar: number | null
    carbs: number | null
    fat: number | null
  }
}

const DEFAULT_SETTINGS: HealthCheckSettings = {
  enabled: true,
  frequency: 'high',
  dailyCap: null,
  thresholds: {
    sugar: null,
    carbs: null,
    fat: null,
  },
}

const toOptionalNumber = (value: any) => {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null
}

const normalizeFrequency = (value: any): HealthCheckFrequency => {
  const raw = typeof value === 'string' ? value.toLowerCase().trim() : ''
  if (raw === 'always' || raw === 'high' || raw === 'never') return raw
  return 'high'
}

const normalizeSettings = (raw: any): HealthCheckSettings => {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SETTINGS }
  const thresholds = raw?.thresholds && typeof raw.thresholds === 'object' ? raw.thresholds : {}
  return {
    enabled: raw?.enabled !== false,
    frequency: normalizeFrequency(raw?.frequency),
    dailyCap: toOptionalNumber(raw?.dailyCap),
    thresholds: {
      sugar: toOptionalNumber(thresholds?.sugar),
      carbs: toOptionalNumber(thresholds?.carbs),
      fat: toOptionalNumber(thresholds?.fat),
    },
  }
}

type ThresholdKey = 'sugar' | 'carbs' | 'fat'

const THRESHOLD_CONFIG: Array<{
  key: ThresholdKey
  label: string
  min: number
  max: number
  defaultValue: number
}> = [
  { key: 'sugar', label: 'Sugar', min: 10, max: 120, defaultValue: 30 },
  { key: 'carbs', label: 'Carbs', min: 40, max: 260, defaultValue: 90 },
  { key: 'fat', label: 'Fat', min: 20, max: 140, defaultValue: 35 },
]

export function FoodDiarySettingsScreen() {
  const { mode, session } = useAppMode()

  const [loading, setLoading] = useState(true)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [settings, setSettings] = useState<HealthCheckSettings>(DEFAULT_SETTINGS)
  const [error, setError] = useState('')

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let cancelled = false

    const loadSettings = async () => {
      if (mode !== 'signedIn' || !session?.token) {
        setError('Please sign in to edit food diary settings.')
        setLoading(false)
        return
      }

      setLoading(true)
      try {
        const res = await fetch(`${API_BASE_URL}/api/user-data`, {
          headers: {
            authorization: `Bearer ${session.token}`,
          },
        })
        const data = await res.json().catch(() => ({} as any))
        if (!res.ok) throw new Error(data?.error || 'Could not load settings')

        if (!cancelled) {
          setSettings(normalizeSettings(data?.healthCheckSettings))
          setError('')
        }
      } catch {
        if (!cancelled) setError('Could not load food diary settings.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadSettings()
    return () => {
      cancelled = true
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [mode, session?.token])

  const queueSave = (next: HealthCheckSettings) => {
    setSettings(next)
    setSaveState('saving')
    setError('')

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
    }

    saveTimerRef.current = setTimeout(async () => {
      if (mode !== 'signedIn' || !session?.token) {
        setSaveState('error')
        setError('Please sign in to save settings.')
        return
      }

      try {
        const res = await fetch(`${API_BASE_URL}/api/user-data`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${session.token}`,
          },
          body: JSON.stringify({ healthCheckSettings: next }),
        })
        if (!res.ok) throw new Error('save failed')
        setSaveState('saved')
        setTimeout(() => setSaveState('idle'), 1200)
      } catch {
        setSaveState('error')
        setError('Could not save settings.')
      }
    }, 320)
  }

  const setThreshold = (key: ThresholdKey, value: number) => {
    const rounded = Math.round(value)
    queueSave({
      ...settings,
      thresholds: {
        ...settings.thresholds,
        [key]: rounded,
      },
    })
  }

  const capEnabled = settings.dailyCap !== null && Number.isFinite(settings.dailyCap)
  const capValue = capEnabled ? Math.max(1, Math.round(settings.dailyCap || 0)) : 2

  if (loading) {
    return (
      <Screen style={{ alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={theme.colors.primary} />
        <Text style={{ marginTop: 10, color: theme.colors.muted }}>Loading food diary settings...</Text>
      </Screen>
    )
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: theme.spacing.xl, gap: 14 }}>
        <View
          style={{
            backgroundColor: theme.colors.card,
            borderWidth: 1,
            borderColor: theme.colors.border,
            borderRadius: theme.radius.lg,
            padding: 14,
            gap: 12,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.colors.text, fontSize: 22, fontWeight: '900' }}>Health check prompts</Text>
              <Text style={{ color: theme.colors.muted, marginTop: 4 }}>
                Control when the food diary suggests a paid health check.
              </Text>
            </View>
            <Text
              style={{
                color:
                  saveState === 'saved'
                    ? '#15803D'
                    : saveState === 'saving'
                    ? '#2563EB'
                    : saveState === 'error'
                    ? '#B91C1C'
                    : theme.colors.muted,
                fontWeight: '700',
                fontSize: 12,
              }}
            >
              {saveState === 'saving'
                ? 'Saving...'
                : saveState === 'saved'
                ? 'Saved'
                : saveState === 'error'
                ? 'Save failed'
                : 'Up to date'}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.colors.text, fontWeight: '800', fontSize: 16 }}>Enable health check prompts</Text>
              <Text style={{ color: theme.colors.muted, marginTop: 4 }}>Show prompts before a check runs.</Text>
            </View>
            <Switch
              value={settings.enabled}
              onValueChange={(value) => queueSave({ ...settings, enabled: value })}
              trackColor={{ false: '#D1D5DB', true: '#86D2A2' }}
              thumbColor="#FFFFFF"
            />
          </View>

          <View style={{ gap: 8 }}>
            <Text style={{ color: theme.colors.text, fontWeight: '800', fontSize: 16 }}>Prompt frequency</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {([
                { key: 'always', label: 'Always' },
                { key: 'high', label: 'High risk' },
                { key: 'never', label: 'Never' },
              ] as const).map((option) => {
                const selected = settings.frequency === option.key
                return (
                  <Pressable
                    key={option.key}
                    onPress={() => queueSave({ ...settings, frequency: option.key })}
                    style={({ pressed }) => ({
                      flex: 1,
                      opacity: pressed ? 0.92 : 1,
                      borderWidth: 1,
                      borderColor: selected ? theme.colors.primary : theme.colors.border,
                      backgroundColor: selected ? theme.colors.primary : theme.colors.card,
                      borderRadius: 10,
                      paddingVertical: 10,
                      alignItems: 'center',
                    })}
                  >
                    <Text style={{ color: selected ? '#FFFFFF' : theme.colors.text, fontWeight: '800', fontSize: 13 }}>
                      {option.label}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
          </View>

          <View style={{ gap: 8 }}>
            <Text style={{ color: theme.colors.text, fontWeight: '800', fontSize: 16 }}>Daily cap</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable
                onPress={() => queueSave({ ...settings, dailyCap: null })}
                style={({ pressed }) => ({
                  flex: 1,
                  opacity: pressed ? 0.92 : 1,
                  borderWidth: 1,
                  borderColor: !capEnabled ? theme.colors.primary : theme.colors.border,
                  backgroundColor: !capEnabled ? theme.colors.primary : theme.colors.card,
                  borderRadius: 10,
                  paddingVertical: 10,
                  alignItems: 'center',
                })}
              >
                <Text style={{ color: !capEnabled ? '#FFFFFF' : theme.colors.text, fontWeight: '800' }}>No cap</Text>
              </Pressable>
              <Pressable
                onPress={() => queueSave({ ...settings, dailyCap: capValue })}
                style={({ pressed }) => ({
                  flex: 1,
                  opacity: pressed ? 0.92 : 1,
                  borderWidth: 1,
                  borderColor: capEnabled ? theme.colors.primary : theme.colors.border,
                  backgroundColor: capEnabled ? theme.colors.primary : theme.colors.card,
                  borderRadius: 10,
                  paddingVertical: 10,
                  alignItems: 'center',
                })}
              >
                <Text style={{ color: capEnabled ? '#FFFFFF' : theme.colors.text, fontWeight: '800' }}>Set a cap</Text>
              </Pressable>
            </View>

            {capEnabled ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <TextInput
                  value={String(capValue)}
                  onChangeText={(value) => {
                    const next = Math.max(1, Math.round(Number(value || 1)))
                    queueSave({ ...settings, dailyCap: next })
                  }}
                  keyboardType="number-pad"
                  style={{
                    width: 90,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    borderRadius: 10,
                    paddingHorizontal: 12,
                    paddingVertical: 9,
                    color: theme.colors.text,
                    backgroundColor: theme.colors.card,
                  }}
                />
                <Text style={{ color: theme.colors.muted }}>prompts per day</Text>
              </View>
            ) : null}
          </View>

          <View style={{ gap: 12 }}>
            <Text style={{ color: theme.colors.text, fontWeight: '800', fontSize: 16 }}>High-risk trigger levels</Text>

            {THRESHOLD_CONFIG.map((item) => {
              const value = settings.thresholds[item.key] ?? item.defaultValue
              return (
                <View key={item.key}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <Text style={{ color: theme.colors.text, fontWeight: '700' }}>{item.label}</Text>
                    <Text style={{ color: theme.colors.muted, fontWeight: '700' }}>{Math.round(value)} g</Text>
                  </View>
                  <Slider
                    minimumValue={item.min}
                    maximumValue={item.max}
                    step={1}
                    minimumTrackTintColor={theme.colors.primary}
                    maximumTrackTintColor="#D1D5DB"
                    value={value}
                    onSlidingComplete={(next) => setThreshold(item.key, next)}
                  />
                </View>
              )
            })}
          </View>

          {error ? <Text style={{ color: '#B91C1C', fontSize: 13 }}>{error}</Text> : null}
        </View>
      </ScrollView>
    </Screen>
  )
}
