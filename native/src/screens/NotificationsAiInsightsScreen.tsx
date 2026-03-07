import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { useFocusEffect } from '@react-navigation/native'

import { API_BASE_URL } from '../config'
import { useAppMode } from '../state/AppModeContext'
import { Screen } from '../ui/Screen'
import { theme } from '../ui/theme'

type HealthTipSettings = {
  enabled: boolean
  time1: string
  time2: string
  time3: string
  timezone: string
  frequency: number
  focusFood: boolean
  focusSupplements: boolean
  focusLifestyle: boolean
  pricingAcceptedAt?: string | null
}

const fallbackTimezones = [
  'UTC',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Madrid',
  'Europe/Rome',
  'Europe/Amsterdam',
  'Europe/Zurich',
  'Europe/Stockholm',
  'Europe/Athens',
  'Africa/Johannesburg',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Bangkok',
  'Asia/Singapore',
  'Asia/Kuala_Lumpur',
  'Asia/Hong_Kong',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Asia/Shanghai',
  'Australia/Perth',
  'Australia/Adelaide',
  'Australia/Melbourne',
  'Australia/Sydney',
  'Pacific/Auckland',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Toronto',
  'America/Vancouver',
  'America/Mexico_City',
  'America/Bogota',
  'America/Sao_Paulo',
]

function SelectRow({
  label,
  value,
  onPress,
}: {
  label: string
  value: string
  onPress: () => void
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: theme.colors.text, fontWeight: '800' }}>{label}</Text>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => ({
          opacity: pressed ? 0.9 : 1,
          borderWidth: 1,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.md,
          backgroundColor: theme.colors.card,
          paddingHorizontal: 12,
          paddingVertical: 11,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        })}
      >
        <Text style={{ color: theme.colors.text, fontWeight: '800', flex: 1 }}>
          {value}
        </Text>
        <Feather name="chevron-down" size={18} color={theme.colors.muted} />
      </Pressable>
    </View>
  )
}

function ActionButton({
  label,
  loading,
  onPress,
}: {
  label: string
  loading?: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      style={({ pressed }) => ({
        opacity: loading ? 0.6 : pressed ? 0.9 : 1,
        backgroundColor: theme.colors.primary,
        borderRadius: theme.radius.md,
        paddingVertical: 12,
        alignItems: 'center',
      })}
    >
      <Text style={{ color: theme.colors.primaryText, fontWeight: '900' }}>
        {loading ? 'Saving...' : label}
      </Text>
    </Pressable>
  )
}

export function NotificationsAiInsightsScreen({ navigation }: { navigation: any }) {
  const { mode, session } = useAppMode()

  const authHeaders = useMemo(() => {
    if (!session?.token) return null
    return {
      Authorization: `Bearer ${session.token}`,
      'x-native-token': session.token,
      'cache-control': 'no-store',
    }
  }, [session?.token])

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [showEnableModal, setShowEnableModal] = useState(false)

  const [enabled, setEnabled] = useState(false)
  const [timezone, setTimezone] = useState('UTC')
  const [frequency, setFrequency] = useState(1)
  const [time1, setTime1] = useState('11:30')
  const [time2, setTime2] = useState('15:30')
  const [time3, setTime3] = useState('20:30')
  const [focusFood, setFocusFood] = useState(true)
  const [focusSupplements, setFocusSupplements] = useState(true)
  const [focusLifestyle, setFocusLifestyle] = useState(true)
  const [pricingAcceptedAt, setPricingAcceptedAt] = useState<string | null>(null)

  const [timezoneOptions, setTimezoneOptions] = useState<string[]>(fallbackTimezones)
  const [timezoneQuery, setTimezoneQuery] = useState('')
  const [timezonePickerOpen, setTimezonePickerOpen] = useState(false)

  const snapshotRef = useRef('')
  const settingsRef = useRef<HealthTipSettings>({
    enabled: false,
    timezone: 'UTC',
    frequency: 1,
    time1: '11:30',
    time2: '15:30',
    time3: '20:30',
    focusFood: true,
    focusSupplements: true,
    focusLifestyle: true,
    pricingAcceptedAt: null,
  })
  const dirtyRef = useRef(false)

  useEffect(() => {
    try {
      const anyIntl = Intl as any
      if (anyIntl && typeof anyIntl.supportedValuesOf === 'function') {
        const supported = anyIntl.supportedValuesOf('timeZone') as string[]
        if (Array.isArray(supported) && supported.length > 0) {
          const sorted = [...supported].sort((a, b) => a.localeCompare(b))
          setTimezoneOptions(sorted)
          return
        }
      }
    } catch {
      // Keep fallback list.
    }
    setTimezoneOptions(fallbackTimezones)
  }, [])

  const filteredTimezones = useMemo(() => {
    const q = timezoneQuery.trim().toLowerCase()
    if (!q) return timezoneOptions
    return timezoneOptions.filter((tz) => tz.toLowerCase().includes(q))
  }, [timezoneOptions, timezoneQuery])

  const applySettings = (data: Partial<HealthTipSettings>, options?: { setSnapshot?: boolean }) => {
    const next: HealthTipSettings = {
      enabled: !!data.enabled,
      timezone: String(data.timezone || 'UTC'),
      frequency: Math.max(1, Math.min(3, Number(data.frequency) || 1)),
      time1: String(data.time1 || '11:30'),
      time2: String(data.time2 || '15:30'),
      time3: String(data.time3 || '20:30'),
      focusFood: data.focusFood !== false,
      focusSupplements: data.focusSupplements !== false,
      focusLifestyle: data.focusLifestyle !== false,
      pricingAcceptedAt: data.pricingAcceptedAt || null,
    }

    setEnabled(next.enabled)
    setTimezone(next.timezone)
    setFrequency(next.frequency)
    setTime1(next.time1)
    setTime2(next.time2)
    setTime3(next.time3)
    setFocusFood(next.focusFood)
    setFocusSupplements(next.focusSupplements)
    setFocusLifestyle(next.focusLifestyle)
    setPricingAcceptedAt(next.pricingAcceptedAt || null)

    settingsRef.current = next

    if (options?.setSnapshot) {
      const snapshot = JSON.stringify({
        enabled: next.enabled,
        timezone: next.timezone,
        frequency: next.frequency,
        time1: next.time1,
        time2: next.time2,
        time3: next.time3,
        focusFood: next.focusFood,
        focusSupplements: next.focusSupplements,
        focusLifestyle: next.focusLifestyle,
      })
      snapshotRef.current = snapshot
      dirtyRef.current = false
      setHasUnsavedChanges(false)
    }
  }

  const loadSettings = useCallback(async () => {
    if (mode !== 'signedIn' || !authHeaders) {
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      const res = await fetch(`${API_BASE_URL}/api/health-tips/settings`, {
        headers: authHeaders,
      })
      const data: any = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data?.error || data?.detail || 'Could not load Smart Health Coach settings')
      }
      applySettings(data, { setSnapshot: true })
    } catch (e: any) {
      Alert.alert('Could not load settings', e?.message || 'Please try again.')
    } finally {
      setLoading(false)
    }
  }, [authHeaders, mode])

  const saveSettings = useCallback(
    async (options?: { silent?: boolean; payload?: HealthTipSettings; acceptPricingTerms?: boolean }) => {
      if (!authHeaders) return false
      const payload = options?.payload || settingsRef.current

      if (!options?.silent) setSaving(true)
      try {
        const res = await fetch(`${API_BASE_URL}/api/health-tips/settings`, {
          method: 'POST',
          headers: {
            ...authHeaders,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            ...payload,
            acceptPricingTerms: !!options?.acceptPricingTerms,
          }),
        })
        const data: any = await res.json().catch(() => ({}))
        if (!res.ok) {
          throw new Error(data?.error || data?.detail || 'Failed to save settings')
        }

        if (options?.acceptPricingTerms) {
          setPricingAcceptedAt(new Date().toISOString())
        }

        const snapshot = JSON.stringify({
          enabled: payload.enabled,
          timezone: payload.timezone,
          frequency: payload.frequency,
          time1: payload.time1,
          time2: payload.time2,
          time3: payload.time3,
          focusFood: payload.focusFood,
          focusSupplements: payload.focusSupplements,
          focusLifestyle: payload.focusLifestyle,
        })
        snapshotRef.current = snapshot
        dirtyRef.current = false
        setHasUnsavedChanges(false)

        if (!options?.silent) {
          Alert.alert('Saved', 'Smart Health Coach settings saved.')
        }
        return true
      } catch (e: any) {
        if (!options?.silent) {
          Alert.alert('Save failed', e?.message || 'Please try again.')
        }
        return false
      } finally {
        if (!options?.silent) setSaving(false)
      }
    },
    [authHeaders],
  )

  useFocusEffect(
    useCallback(() => {
      void loadSettings()

      return () => {
        if (!dirtyRef.current) return
        void saveSettings({ silent: true, payload: settingsRef.current })
      }
    }, [loadSettings, saveSettings]),
  )

  useEffect(() => {
    if (loading) return

    const next: HealthTipSettings = {
      enabled,
      timezone,
      frequency,
      time1,
      time2,
      time3,
      focusFood,
      focusSupplements,
      focusLifestyle,
      pricingAcceptedAt,
    }
    settingsRef.current = next

    const snapshot = JSON.stringify({
      enabled,
      timezone,
      frequency,
      time1,
      time2,
      time3,
      focusFood,
      focusSupplements,
      focusLifestyle,
    })
    if (!snapshotRef.current) {
      snapshotRef.current = snapshot
      setHasUnsavedChanges(false)
      dirtyRef.current = false
      return
    }

    const dirty = snapshot !== snapshotRef.current
    dirtyRef.current = dirty
    setHasUnsavedChanges(dirty)
  }, [
    enabled,
    timezone,
    frequency,
    time1,
    time2,
    time3,
    focusFood,
    focusSupplements,
    focusLifestyle,
    pricingAcceptedAt,
    loading,
  ])

  const openSmartCoach = () => {
    navigation.navigate('SmartHealthCoach')
  }

  const onToggleEnabled = (next: boolean) => {
    if (next && !enabled && !pricingAcceptedAt) {
      setShowEnableModal(true)
      return
    }
    setEnabled(next)
  }

  const confirmEnableSmartCoach = async () => {
    setShowEnableModal(false)
    const nextPayload: HealthTipSettings = {
      ...settingsRef.current,
      enabled: true,
    }
    setEnabled(true)
    const saved = await saveSettings({
      silent: true,
      payload: nextPayload,
      acceptPricingTerms: true,
    })
    if (saved) {
      Alert.alert('Smart Health Coach enabled.')
    } else {
      setEnabled(false)
    }
  }

  if (mode !== 'signedIn') {
    return (
      <Screen style={{ alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ color: theme.colors.muted }}>Please log in again to manage Smart Health Coach settings.</Text>
      </Screen>
    )
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: theme.spacing.xl }}>
        <View
          style={{
            backgroundColor: theme.colors.card,
            borderWidth: 1,
            borderColor: theme.colors.border,
            borderRadius: theme.radius.lg,
            padding: 16,
            gap: 14,
          }}
        >
          <View style={{ gap: 8 }}>
            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 22, fontWeight: '900', color: theme.colors.text }}>Smart Health Coach settings</Text>
              <Text style={{ color: theme.colors.muted, lineHeight: 19 }}>
                Get proactive guidance based on your daily logs and habits.
              </Text>
            </View>
            <Pressable onPress={() => void openSmartCoach()} style={{ alignSelf: 'flex-end', paddingTop: 2 }}>
              <Text style={{ color: theme.colors.primary, fontWeight: '900' }}>Open Smart Health Coach</Text>
            </Pressable>
          </View>

          {loading ? (
            <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 18 }}>
              <ActivityIndicator color={theme.colors.primary} />
            </View>
          ) : (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.colors.text, fontWeight: '800' }}>Enable Smart Health Coach</Text>
                  <Text style={{ marginTop: 3, color: theme.colors.muted, fontSize: 12 }}>
                    10 credits per alert. Up to 50 credits per day. Charges only apply when an alert is sent.
                  </Text>
                </View>
                <Switch value={enabled} onValueChange={onToggleEnabled} />
              </View>

              <Text style={{ color: theme.colors.muted, lineHeight: 20 }}>
                We check your food, water, activity, and mood logs. If we spot patterns like low hydration, poor food
                balance, low activity, or missed check-ins, we may send up to 5 alerts in your local timezone.
              </Text>

              <View style={{ gap: 6 }}>
                <SelectRow label="Timezone" value={timezone} onPress={() => {
                  setTimezoneQuery('')
                  setTimezonePickerOpen(true)
                }} />
                <Text style={{ color: theme.colors.muted, fontSize: 12 }}>
                  Auto-detected from your device. You can change it any time.
                </Text>
              </View>

              <ActionButton label="Save Smart Health Coach settings" loading={saving} onPress={() => void saveSettings()} />

              {hasUnsavedChanges ? (
                <Text style={{ color: theme.colors.muted, fontSize: 12 }}>
                  Changes save automatically when you leave this page.
                </Text>
              ) : null}
            </>
          )}
        </View>
      </ScrollView>

      <Modal visible={timezonePickerOpen} animationType="slide" onRequestClose={() => setTimezonePickerOpen(false)}>
        <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
          <View
            style={{
              padding: 14,
              borderBottomWidth: 1,
              borderBottomColor: theme.colors.border,
              backgroundColor: theme.colors.card,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <Text style={{ fontSize: 18, fontWeight: '900', color: theme.colors.text }}>Timezone</Text>
            <Pressable onPress={() => setTimezonePickerOpen(false)}>
              <Text style={{ fontWeight: '900', color: theme.colors.primary }}>Done</Text>
            </Pressable>
          </View>

          <View style={{ padding: 14 }}>
            <TextInput
              value={timezoneQuery}
              onChangeText={setTimezoneQuery}
              placeholder="Search timezone"
              placeholderTextColor="#8AA39D"
              autoCapitalize="none"
              style={{
                borderWidth: 1,
                borderColor: theme.colors.border,
                borderRadius: theme.radius.md,
                paddingHorizontal: 12,
                paddingVertical: 12,
                backgroundColor: theme.colors.card,
                fontWeight: '800',
                color: theme.colors.text,
              }}
            />
          </View>

          <FlatList
            data={filteredTimezones}
            keyExtractor={(item) => item}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const selected = item === timezone
              return (
                <Pressable
                  onPress={() => {
                    setTimezone(item)
                    setTimezonePickerOpen(false)
                  }}
                  style={({ pressed }) => ({
                    opacity: pressed ? 0.9 : 1,
                    paddingHorizontal: 14,
                    paddingVertical: 14,
                    borderBottomWidth: 1,
                    borderBottomColor: theme.colors.border,
                    backgroundColor: selected ? '#EAF5EF' : theme.colors.card,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  })}
                >
                  <Text style={{ color: theme.colors.text, fontWeight: selected ? '900' : '700', flex: 1 }}>
                    {item}
                  </Text>
                  {selected ? <Text style={{ color: theme.colors.primary, fontWeight: '900' }}>Selected</Text> : null}
                </Pressable>
              )
            }}
            ListEmptyComponent={
              <View style={{ alignItems: 'center', padding: 24 }}>
                <Text style={{ color: theme.colors.muted }}>No timezone found.</Text>
              </View>
            }
          />
        </View>
      </Modal>

      <Modal visible={showEnableModal} animationType="fade" transparent onRequestClose={() => setShowEnableModal(false)}>
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.38)',
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 18,
          }}
        >
          <View
            style={{
              width: '100%',
              maxWidth: 360,
              backgroundColor: theme.colors.card,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: theme.colors.border,
              padding: 16,
              gap: 12,
            }}
          >
            <Text style={{ fontSize: 18, fontWeight: '900', color: theme.colors.text }}>
              Enable Smart Health Coach?
            </Text>

            <View style={{ gap: 4 }}>
              <Text style={{ color: theme.colors.muted }}>Get proactive health guidance based on your daily logs and habits.</Text>
              <Text style={{ color: theme.colors.muted }}>10 credits per alert.</Text>
              <Text style={{ color: theme.colors.muted }}>Up to 50 credits per day.</Text>
              <Text style={{ color: theme.colors.muted }}>Charges only apply when an alert is actually sent.</Text>
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
              <Pressable
                onPress={() => setShowEnableModal(false)}
                style={({ pressed }) => ({
                  opacity: pressed ? 0.9 : 1,
                  paddingHorizontal: 12,
                  paddingVertical: 9,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                })}
              >
                <Text style={{ color: theme.colors.text, fontWeight: '800' }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => void confirmEnableSmartCoach()}
                style={({ pressed }) => ({
                  opacity: pressed ? 0.9 : 1,
                  paddingHorizontal: 12,
                  paddingVertical: 9,
                  borderRadius: 8,
                  backgroundColor: theme.colors.primary,
                })}
              >
                <Text style={{ color: theme.colors.primaryText, fontWeight: '900' }}>Enable Smart Coach</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  )
}
