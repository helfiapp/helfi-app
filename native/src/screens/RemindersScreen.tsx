import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Feather } from '@expo/vector-icons'
import { useFocusEffect, useRoute } from '@react-navigation/native'
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker'

import { API_BASE_URL } from '../config'
import { useAppMode } from '../state/AppModeContext'
import { Screen } from '../ui/Screen'
import { theme } from '../ui/theme'

const PUSH_NOTIFICATIONS_KEY = 'helfi_push_notifications_v1'
const MOOD_REMINDERS_KEY = 'helfi_reminders_mood_v1'
const MOOD_REMINDER_PROMPT_DONE_KEY = 'helfi_mood_reminder_prompt_done_v1'

const baseTimezones = [
  'UTC','Europe/London','Europe/Paris','Europe/Berlin','Europe/Madrid','Europe/Rome','Europe/Amsterdam','Europe/Zurich','Europe/Stockholm','Europe/Athens',
  'Africa/Johannesburg','Asia/Dubai','Asia/Kolkata','Asia/Bangkok','Asia/Singapore','Asia/Kuala_Lumpur','Asia/Hong_Kong','Asia/Tokyo','Asia/Seoul','Asia/Shanghai',
  'Australia/Perth','Australia/Adelaide','Australia/Melbourne','Australia/Sydney','Pacific/Auckland',
  'America/New_York','America/Chicago','America/Denver','America/Los_Angeles','America/Toronto','America/Vancouver','America/Mexico_City','America/Bogota','America/Sao_Paulo',
]

type ReminderSettings = {
  enabled: boolean
  frequency: number
  time1: string
  time2: string
  time3: string
  time4: string
  timezone: string
  maxFrequency: number
}

type ReminderTimeKey = 'time1' | 'time2' | 'time3' | 'time4'
type TimePickerTarget = { section: 'checkin' | 'mood'; key: ReminderTimeKey } | null

const defaultCheckins: ReminderSettings = {
  enabled: true,
  frequency: 1,
  time1: '12:30',
  time2: '18:30',
  time3: '21:30',
  time4: '09:00',
  timezone: 'Australia/Melbourne',
  maxFrequency: 1,
}

const defaultMood: ReminderSettings = {
  enabled: false,
  frequency: 1,
  time1: '20:00',
  time2: '12:00',
  time3: '18:00',
  time4: '09:00',
  timezone: 'UTC',
  maxFrequency: 1,
}

function getDeviceTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

function normalizeTimeHHMM(input: string, fallback: string) {
  const s = (input || '').trim()
  const m24 = s.match(/^([01]\d|2[0-3]):([0-5]\d)$/)
  if (m24) return `${m24[1]}:${m24[2]}`
  const digits = s.replace(/[^0-9]/g, '')
  if (digits.length >= 3) {
    const h = digits.slice(0, digits.length - 2)
    const mm = digits.slice(-2)
    const hh = Math.max(0, Math.min(23, parseInt(h, 10)))
    const m = Math.max(0, Math.min(59, parseInt(mm, 10)))
    return `${String(hh).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  }
  return fallback
}

function parseHHMMToDate(value: string) {
  const normalized = normalizeTimeHHMM(value, '12:00')
  const [hour, minute] = normalized.split(':').map((part) => parseInt(part, 10))
  const next = new Date()
  next.setHours(Number.isFinite(hour) ? hour : 12, Number.isFinite(minute) ? minute : 0, 0, 0)
  return next
}

function formatDateToHHMM(value: Date) {
  const hour = String(value.getHours()).padStart(2, '0')
  const minute = String(value.getMinutes()).padStart(2, '0')
  return `${hour}:${minute}`
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <View
      style={{
        backgroundColor: theme.colors.card,
        borderRadius: theme.radius.lg,
        borderWidth: 1,
        borderColor: theme.colors.border,
        padding: 16,
      }}
    >
      {children}
    </View>
  )
}

function SectionHeader({
  title,
  subtitle,
  right,
}: {
  title: string
  subtitle: string
  right: React.ReactNode
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 22, fontWeight: '900', color: theme.colors.text }}>{title}</Text>
        <Text style={{ marginTop: 4, fontSize: 13, color: theme.colors.muted, lineHeight: 18 }}>{subtitle}</Text>
      </View>
      {right}
    </View>
  )
}

function SelectRow({
  label,
  value,
  disabled,
  onPress,
}: {
  label: string
  value: string
  disabled: boolean
  onPress: () => void
}) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ fontSize: 14, fontWeight: '800', color: theme.colors.text }}>{label}</Text>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        style={({ pressed }) => ({
          opacity: disabled ? 0.5 : pressed ? 0.9 : 1,
          borderWidth: 1,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.md,
          paddingHorizontal: 12,
          paddingVertical: 12,
          backgroundColor: theme.colors.card,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        })}
      >
        <Text style={{ fontWeight: '800', color: theme.colors.text }}>{value}</Text>
        <Feather name="chevron-down" size={18} color={theme.colors.muted} />
      </Pressable>
    </View>
  )
}

function TimeRow({
  label,
  value,
  disabled,
  onPress,
}: {
  label: string
  value: string
  disabled: boolean
  onPress: () => void
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 14, fontWeight: '800', color: theme.colors.text }}>{label}</Text>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        style={({ pressed }) => ({
          opacity: disabled ? 0.5 : pressed ? 0.9 : 1,
          borderWidth: 1,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.md,
          backgroundColor: disabled ? '#F3F4F6' : theme.colors.card,
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 12,
          paddingVertical: 12,
        })}
      >
        <Text
          style={{
            flex: 1,
            fontWeight: '800',
            color: disabled ? '#9CA3AF' : theme.colors.text,
          }}
        >
          {value}
        </Text>
        <Feather name="clock" size={18} color={theme.colors.muted} />
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
        marginTop: 14,
        backgroundColor: theme.colors.primary,
        borderRadius: theme.radius.md,
        paddingVertical: 12,
        alignItems: 'center',
        opacity: loading ? 0.6 : pressed ? 0.9 : 1,
      })}
    >
      <Text style={{ color: theme.colors.primaryText, fontWeight: '900' }}>{loading ? 'Saving...' : label}</Text>
    </Pressable>
  )
}

function toSnapshot(settings: ReminderSettings) {
  return JSON.stringify({
    enabled: settings.enabled,
    frequency: settings.frequency,
    time1: settings.time1,
    time2: settings.time2,
    time3: settings.time3,
    time4: settings.time4,
    timezone: settings.timezone,
  })
}

export function RemindersScreen({ navigation }: { navigation: any }) {
  const route = useRoute<any>()
  const { mode, session } = useAppMode()
  const scrollRef = useRef<ScrollView | null>(null)
  const sectionYRef = useRef<{ checkin?: number; mood?: number }>({})

  const authHeaders = useMemo(() => {
    if (!session?.token) return null
    return {
      Authorization: `Bearer ${session.token}`,
      'x-native-token': session.token,
      'cache-control': 'no-store',
    }
  }, [session?.token])

  const deviceTz = useMemo(() => getDeviceTimezone(), [])
  const focus: 'checkin' | 'mood' | undefined = route?.params?.focus
  const returnToMoodTracker = route?.params?.returnToMoodTracker === true

  const [loading, setLoading] = useState(true)
  const [checkinsSaving, setCheckinsSaving] = useState(false)
  const [moodSaving, setMoodSaving] = useState(false)

  const [pushNotifications, setPushNotifications] = useState(false)

  const [checkins, setCheckins] = useState<ReminderSettings>(defaultCheckins)
  const [mood, setMood] = useState<ReminderSettings>(defaultMood)
  const checkinsRef = useRef<ReminderSettings>(defaultCheckins)
  const moodRef = useRef<ReminderSettings>(defaultMood)

  const [checkinsUnsaved, setCheckinsUnsaved] = useState(false)
  const [moodUnsaved, setMoodUnsaved] = useState(false)

  const checkinsSnapshotRef = useRef('')
  const moodSnapshotRef = useRef('')
  const checkinsDirtyRef = useRef(false)
  const moodDirtyRef = useRef(false)

  const [tzPickerVisible, setTzPickerVisible] = useState(false)
  const [tzPickerTarget, setTzPickerTarget] = useState<'checkin' | 'mood'>('checkin')
  const [tzQuery, setTzQuery] = useState('')
  const [timePickerVisible, setTimePickerVisible] = useState(false)
  const [timePickerTarget, setTimePickerTarget] = useState<TimePickerTarget>(null)
  const [timePickerValue, setTimePickerValue] = useState(new Date())

  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false)
  const [upgradeModalMessage, setUpgradeModalMessage] = useState('')

  const persistLocalMoodReminders = useCallback(async (value: ReminderSettings) => {
    try {
      await AsyncStorage.setItem(
        MOOD_REMINDERS_KEY,
        JSON.stringify({
          enabled: value.enabled,
          frequency: value.frequency,
          time1: value.time1,
          time2: value.time2,
          time3: value.time3,
          time4: value.time4,
          timezone: value.timezone,
          updatedAt: new Date().toISOString(),
        }),
      )
    } catch {
      // Keep app flow stable if local cache write fails.
    }
  }, [])

  const availableTimezones = useMemo(() => {
    const set = new Set<string>(baseTimezones)
    set.add(deviceTz)
    const list = Array.from(set)
    list.sort((a, b) => a.localeCompare(b))
    return list
  }, [deviceTz])

  const filteredTimezones = useMemo(() => {
    const q = tzQuery.trim().toLowerCase()
    if (!q) return availableTimezones
    return availableTimezones.filter((tz) => tz.toLowerCase().includes(q))
  }, [availableTimezones, tzQuery])

  const loadPushPreference = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(PUSH_NOTIFICATIONS_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (typeof parsed?.enabled === 'boolean') {
        setPushNotifications(parsed.enabled)
      }
    } catch {
      // ignore
    }
  }, [])

  const loadSettings = useCallback(async () => {
    if (mode !== 'signedIn' || !authHeaders) {
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      const [checkinsRes, moodRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/checkins/settings`, { headers: authHeaders }),
        fetch(`${API_BASE_URL}/api/mood/reminders`, { headers: authHeaders }),
      ])

      const checkinsData: any = await checkinsRes.json().catch(() => ({}))
      const moodData: any = await moodRes.json().catch(() => ({}))

      if (!checkinsRes.ok) {
        throw new Error(checkinsData?.error || 'Could not load check-in reminders')
      }
      if (!moodRes.ok) {
        throw new Error(moodData?.error || 'Could not load mood reminders')
      }

      const nextCheckins: ReminderSettings = {
        enabled: typeof checkinsData?.enabled === 'boolean' ? checkinsData.enabled : true,
        frequency: Math.max(1, Math.min(4, Number(checkinsData?.frequency) || 1)),
        time1: normalizeTimeHHMM(String(checkinsData?.time1 || '12:30'), '12:30'),
        time2: normalizeTimeHHMM(String(checkinsData?.time2 || '18:30'), '18:30'),
        time3: normalizeTimeHHMM(String(checkinsData?.time3 || '21:30'), '21:30'),
        time4: normalizeTimeHHMM(String(checkinsData?.time4 || '09:00'), '09:00'),
        timezone: String(checkinsData?.timezone || 'Australia/Melbourne'),
        maxFrequency: Math.max(1, Math.min(4, Number(checkinsData?.maxFrequency) || 1)),
      }

      const nextMood: ReminderSettings = {
        enabled: typeof moodData?.enabled === 'boolean' ? moodData.enabled : false,
        frequency: Math.max(1, Math.min(4, Number(moodData?.frequency) || 1)),
        time1: normalizeTimeHHMM(String(moodData?.time1 || '20:00'), '20:00'),
        time2: normalizeTimeHHMM(String(moodData?.time2 || '12:00'), '12:00'),
        time3: normalizeTimeHHMM(String(moodData?.time3 || '18:00'), '18:00'),
        time4: normalizeTimeHHMM(String(moodData?.time4 || '09:00'), '09:00'),
        timezone: String(moodData?.timezone || deviceTz || 'UTC'),
        maxFrequency: Math.max(1, Math.min(4, Number(moodData?.maxFrequency) || 1)),
      }

      setCheckins(nextCheckins)
      setMood(nextMood)
      await persistLocalMoodReminders(nextMood)
      if (nextMood.enabled) {
        try {
          await AsyncStorage.setItem(MOOD_REMINDER_PROMPT_DONE_KEY, '1')
        } catch {
          // ignore
        }
      }

      checkinsSnapshotRef.current = toSnapshot(nextCheckins)
      moodSnapshotRef.current = toSnapshot(nextMood)
      checkinsDirtyRef.current = false
      moodDirtyRef.current = false
      setCheckinsUnsaved(false)
      setMoodUnsaved(false)
    } catch (e: any) {
      Alert.alert('Could not load reminder settings', e?.message || 'Please try again.')
    } finally {
      setLoading(false)
    }
  }, [authHeaders, deviceTz, mode, persistLocalMoodReminders])

  const saveCheckins = useCallback(
    async (options?: { silent?: boolean; payload?: ReminderSettings }) => {
      if (!authHeaders) return false
      const payload = options?.payload || checkinsRef.current
      if (!options?.silent) setCheckinsSaving(true)

      try {
        const res = await fetch(`${API_BASE_URL}/api/checkins/settings`, {
          method: 'POST',
          headers: {
            ...authHeaders,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            enabled: payload.enabled,
            time1: payload.time1,
            time2: payload.time2,
            time3: payload.time3,
            time4: payload.time4,
            timezone: payload.timezone,
            frequency: payload.frequency,
          }),
        })
        const data: any = await res.json().catch(() => ({}))
        if (!res.ok) {
          throw new Error(data?.error || data?.detail || 'Could not save check-in reminders')
        }

        checkinsSnapshotRef.current = toSnapshot(payload)
        checkinsDirtyRef.current = false
        setCheckinsUnsaved(false)

        if (!options?.silent) {
          Alert.alert('Saved', 'Check-in reminders saved.')
        }
        return true
      } catch (e: any) {
        if (!options?.silent) {
          Alert.alert('Save failed', e?.message || 'Please try again.')
        }
        return false
      } finally {
        if (!options?.silent) setCheckinsSaving(false)
      }
    },
    [authHeaders],
  )

  const saveMood = useCallback(
    async (options?: { silent?: boolean; payload?: ReminderSettings; navigateToMoodTracker?: boolean }) => {
      if (!authHeaders) return false
      const payload = options?.payload || moodRef.current
      if (!options?.silent) setMoodSaving(true)

      try {
        const res = await fetch(`${API_BASE_URL}/api/mood/reminders`, {
          method: 'POST',
          headers: {
            ...authHeaders,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            enabled: payload.enabled,
            frequency: payload.frequency,
            time1: payload.time1,
            time2: payload.time2,
            time3: payload.time3,
            time4: payload.time4,
            timezone: payload.timezone,
          }),
        })
        const data: any = await res.json().catch(() => ({}))
        if (!res.ok) {
          throw new Error(data?.error || data?.detail || 'Could not save mood reminders')
        }

        moodSnapshotRef.current = toSnapshot(payload)
        moodDirtyRef.current = false
        setMoodUnsaved(false)
        await persistLocalMoodReminders(payload)
        if (payload.enabled) {
          try {
            await AsyncStorage.setItem(MOOD_REMINDER_PROMPT_DONE_KEY, '1')
          } catch {
            // ignore
          }
        }

        if (!options?.silent && !options?.navigateToMoodTracker) {
          Alert.alert('Saved', 'Mood reminders saved.')
        }

        if (options?.navigateToMoodTracker) {
          navigation.getParent()?.navigate('MoodTracker')
        }
        return true
      } catch (e: any) {
        if (!options?.silent) {
          Alert.alert('Save failed', e?.message || 'Please try again.')
        }
        return false
      } finally {
        if (!options?.silent) setMoodSaving(false)
      }
    },
    [authHeaders, navigation, persistLocalMoodReminders],
  )

  useFocusEffect(
    useCallback(() => {
      void loadPushPreference()
      void loadSettings()

      return () => {
        if (checkinsDirtyRef.current) {
          void saveCheckins({ silent: true, payload: checkinsRef.current })
        }
        if (moodDirtyRef.current) {
          void saveMood({ silent: true, payload: moodRef.current })
        }
      }
    }, [loadPushPreference, loadSettings, saveCheckins, saveMood]),
  )

  useEffect(() => {
    checkinsRef.current = checkins
  }, [checkins])

  useEffect(() => {
    moodRef.current = mood
  }, [mood])

  useEffect(() => {
    if (loading) return
    const dirty = toSnapshot(checkins) !== checkinsSnapshotRef.current
    checkinsDirtyRef.current = dirty
    setCheckinsUnsaved(dirty)
  }, [checkins, loading])

  useEffect(() => {
    if (loading) return
    const dirty = toSnapshot(mood) !== moodSnapshotRef.current
    moodDirtyRef.current = dirty
    setMoodUnsaved(dirty)
  }, [mood, loading])

  useEffect(() => {
    if (!focus) return
    const y = sectionYRef.current?.[focus]
    if (typeof y !== 'number') return

    const id = setTimeout(() => {
      scrollRef.current?.scrollTo({ y: Math.max(0, y - 10), animated: true })
    }, 250)

    return () => clearTimeout(id)
  }, [focus, loading])

  const onTogglePush = async (enabled: boolean) => {
    setPushNotifications(enabled)
    try {
      await AsyncStorage.setItem(
        PUSH_NOTIFICATIONS_KEY,
        JSON.stringify({ enabled, updatedAt: new Date().toISOString() }),
      )
    } catch {
      // ignore
    }
  }

  const openUpgradeModal = (message: string) => {
    setUpgradeModalMessage(message)
    setUpgradeModalOpen(true)
  }

  const chooseFrequency = (
    settings: ReminderSettings,
    setSettings: (next: ReminderSettings) => void,
  ) => {
    const pick = (value: number) => {
      if (value > settings.maxFrequency) {
        openUpgradeModal(
          'Free members can set 1 reminder per day. Subscribe or buy credits to unlock up to 4 reminders per day.',
        )
        return
      }
      setSettings({ ...settings, frequency: value })
    }

    Alert.alert('Number of reminders per day', '', [
      { text: '1 reminder', onPress: () => pick(1) },
      { text: '2 reminders', onPress: () => pick(2) },
      { text: '3 reminders', onPress: () => pick(3) },
      { text: '4 reminders', onPress: () => pick(4) },
      { text: 'Cancel', style: 'cancel' },
    ])
  }

  const openTimezonePicker = (target: 'checkin' | 'mood') => {
    setTzPickerTarget(target)
    setTzQuery('')
    setTzPickerVisible(true)
  }

  const onPickTimezone = (tz: string) => {
    if (tzPickerTarget === 'checkin') {
      setCheckins((prev) => ({ ...prev, timezone: tz }))
    } else {
      setMood((prev) => ({ ...prev, timezone: tz }))
    }
    setTzPickerVisible(false)
  }

  const openTimePicker = (section: 'checkin' | 'mood', key: ReminderTimeKey, currentValue: string) => {
    setTimePickerTarget({ section, key })
    setTimePickerValue(parseHHMMToDate(currentValue))
    setTimePickerVisible(true)
  }

  const closeTimePicker = () => {
    setTimePickerVisible(false)
    setTimePickerTarget(null)
  }

  const applyPickedTime = (pickedDate: Date) => {
    if (!timePickerTarget) return
    const next = formatDateToHHMM(pickedDate)
    if (timePickerTarget.section === 'checkin') {
      setCheckins((prev) => ({ ...prev, [timePickerTarget.key]: next }))
      return
    }
    setMood((prev) => ({ ...prev, [timePickerTarget.key]: next }))
  }

  const onPickerChange = (_event: DateTimePickerEvent, pickedDate?: Date) => {
    if (!pickedDate) return
    setTimePickerValue(pickedDate)
    if (Platform.OS === 'android') {
      applyPickedTime(pickedDate)
      closeTimePicker()
    }
  }

  const checkinsMaxReminderLabel =
    checkins.maxFrequency >= 4
      ? 'You can set up to 4 reminders per day.'
      : 'Free members can set 1 reminder per day.'

  const moodMaxReminderLabel =
    mood.maxFrequency >= 4
      ? 'You can set up to 4 reminders per day.'
      : 'Free members can set 1 reminder per day.'

  if (mode !== 'signedIn') {
    return (
      <Screen style={{ alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ color: theme.colors.muted }}>Please log in again to manage reminders.</Text>
      </Screen>
    )
  }

  return (
    <Screen>
      <ScrollView
        ref={(r) => {
          scrollRef.current = r
        }}
        contentContainerStyle={{ padding: 14, paddingBottom: theme.spacing.xl, gap: 12 }}
      >
        <Card>
          <SectionHeader
            title="Push notifications"
            subtitle="Turn these on to receive reminders on this device."
            right={<Switch value={pushNotifications} onValueChange={onTogglePush} />}
          />
          <Text style={{ marginTop: 12, color: theme.colors.muted, fontSize: 12, lineHeight: 16 }}>
            Step 1: turn on push notifications. Step 2: turn on the check-in and mood reminders below and pick times.
          </Text>
        </Card>

        {!pushNotifications ? (
          <View style={{ backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A', borderRadius: 12, padding: 12 }}>
            <Text style={{ color: '#92400E', fontWeight: '800' }}>Push notifications are off on this device.</Text>
            <Text style={{ marginTop: 4, color: '#92400E' }}>
              Turn them on above so reminders can actually appear.
            </Text>
          </View>
        ) : null}

        <View
          onLayout={(e) => {
            sectionYRef.current.checkin = e.nativeEvent.layout.y
          }}
        >
          <Card>
            <SectionHeader
              title="Daily check-in reminders"
              subtitle="These reminders help you build your 7-day health report. The full report is for paid members or people who bought credits."
              right={
                <Switch
                  value={checkins.enabled}
                  onValueChange={(enabled) => setCheckins((prev) => ({ ...prev, enabled }))}
                />
              }
            />

            <Text style={{ marginTop: 12, color: theme.colors.muted, fontSize: 12 }}>{checkinsMaxReminderLabel}</Text>

            {checkins.maxFrequency < 4 ? (
              <View style={{ marginTop: 8, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' }}>
                <Text style={{ color: theme.colors.muted, fontSize: 12 }}>Want more reminders? </Text>
                <Pressable onPress={() => navigation.navigate('Billing')}>
                  <Text style={{ color: theme.colors.primary, fontWeight: '900', fontSize: 12 }}>
                    Subscribe or buy credits
                  </Text>
                </Pressable>
                <Text style={{ color: theme.colors.muted, fontSize: 12 }}> to unlock up to 4 per day.</Text>
              </View>
            ) : null}

            <View style={{ marginTop: 14, gap: 12, opacity: checkins.enabled ? 1 : 0.5 }}>
              <SelectRow
                label="Number of reminders per day"
                value={`${checkins.frequency} ${checkins.frequency === 1 ? 'reminder' : 'reminders'}`}
                disabled={!checkins.enabled || loading}
                onPress={() => chooseFrequency(checkins, (next) => setCheckins(next))}
              />

              {checkins.frequency >= 1 ? (
                <TimeRow
                  label="Reminder 1"
                  value={checkins.time1}
                  disabled={!checkins.enabled}
                  onPress={() => openTimePicker('checkin', 'time1', checkins.time1)}
                />
              ) : null}
              {checkins.frequency >= 2 ? (
                <TimeRow
                  label="Reminder 2"
                  value={checkins.time2}
                  disabled={!checkins.enabled}
                  onPress={() => openTimePicker('checkin', 'time2', checkins.time2)}
                />
              ) : null}
              {checkins.frequency >= 3 ? (
                <TimeRow
                  label="Reminder 3"
                  value={checkins.time3}
                  disabled={!checkins.enabled}
                  onPress={() => openTimePicker('checkin', 'time3', checkins.time3)}
                />
              ) : null}
              {checkins.frequency >= 4 ? (
                <TimeRow
                  label="Reminder 4"
                  value={checkins.time4}
                  disabled={!checkins.enabled}
                  onPress={() => openTimePicker('checkin', 'time4', checkins.time4)}
                />
              ) : null}

              <SelectRow
                label="Timezone"
                value={checkins.timezone}
                disabled={!checkins.enabled}
                onPress={() => openTimezonePicker('checkin')}
              />
              <Text style={{ color: theme.colors.muted, fontSize: 12 }}>Detected on this device: {deviceTz}</Text>
            </View>

            {loading ? (
              <View style={{ marginTop: 14, alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator color={theme.colors.primary} />
              </View>
            ) : (
              <ActionButton
                label="Save check-in reminders"
                loading={checkinsSaving}
                onPress={() => void saveCheckins()}
              />
            )}

            {checkinsUnsaved ? (
              <Text style={{ marginTop: 8, color: theme.colors.muted, fontSize: 12 }}>
                Changes save automatically when you leave this page.
              </Text>
            ) : null}
          </Card>
        </View>

        <View
          onLayout={(e) => {
            sectionYRef.current.mood = e.nativeEvent.layout.y
          }}
        >
          <Card>
            <SectionHeader
              title="Mood reminders"
              subtitle="These reminders help you build your 7-day health report. The full report is for paid members or people who bought credits."
              right={
                <Switch
                  value={mood.enabled}
                  onValueChange={(enabled) => setMood((prev) => ({ ...prev, enabled }))}
                />
              }
            />

            <Text style={{ marginTop: 12, color: theme.colors.muted, fontSize: 12 }}>{moodMaxReminderLabel}</Text>

            {mood.maxFrequency < 4 ? (
              <View style={{ marginTop: 8, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' }}>
                <Text style={{ color: theme.colors.muted, fontSize: 12 }}>Want more reminders? </Text>
                <Pressable onPress={() => navigation.navigate('Billing')}>
                  <Text style={{ color: theme.colors.primary, fontWeight: '900', fontSize: 12 }}>
                    Subscribe or buy credits
                  </Text>
                </Pressable>
                <Text style={{ color: theme.colors.muted, fontSize: 12 }}> to unlock up to 4 per day.</Text>
              </View>
            ) : null}

            <View style={{ marginTop: 14, gap: 12, opacity: mood.enabled ? 1 : 0.5 }}>
              <SelectRow
                label="Number of reminders per day"
                value={`${mood.frequency} ${mood.frequency === 1 ? 'reminder' : 'reminders'}`}
                disabled={!mood.enabled || loading}
                onPress={() => chooseFrequency(mood, (next) => setMood(next))}
              />

              {mood.frequency >= 1 ? (
                <TimeRow
                  label="Reminder 1"
                  value={mood.time1}
                  disabled={!mood.enabled}
                  onPress={() => openTimePicker('mood', 'time1', mood.time1)}
                />
              ) : null}
              {mood.frequency >= 2 ? (
                <TimeRow
                  label="Reminder 2"
                  value={mood.time2}
                  disabled={!mood.enabled}
                  onPress={() => openTimePicker('mood', 'time2', mood.time2)}
                />
              ) : null}
              {mood.frequency >= 3 ? (
                <TimeRow
                  label="Reminder 3"
                  value={mood.time3}
                  disabled={!mood.enabled}
                  onPress={() => openTimePicker('mood', 'time3', mood.time3)}
                />
              ) : null}
              {mood.frequency >= 4 ? (
                <TimeRow
                  label="Reminder 4"
                  value={mood.time4}
                  disabled={!mood.enabled}
                  onPress={() => openTimePicker('mood', 'time4', mood.time4)}
                />
              ) : null}

              <SelectRow
                label="Timezone"
                value={mood.timezone}
                disabled={!mood.enabled}
                onPress={() => openTimezonePicker('mood')}
              />
              <Text style={{ color: theme.colors.muted, fontSize: 12 }}>Detected on this device: {deviceTz}</Text>
            </View>

            {loading ? (
              <View style={{ marginTop: 14, alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator color={theme.colors.primary} />
              </View>
            ) : (
              <ActionButton
                label="Save mood reminders"
                loading={moodSaving}
                onPress={() => void saveMood({ navigateToMoodTracker: returnToMoodTracker })}
              />
            )}

            {moodUnsaved ? (
              <Text style={{ marginTop: 8, color: theme.colors.muted, fontSize: 12 }}>
                Changes save automatically when you leave this page.
              </Text>
            ) : null}
          </Card>
        </View>
      </ScrollView>

      {timePickerVisible && Platform.OS === 'android' ? (
        <DateTimePicker
          value={timePickerValue}
          mode="time"
          display="default"
          onChange={onPickerChange}
        />
      ) : null}

      <Modal
        visible={timePickerVisible && Platform.OS === 'ios'}
        animationType="slide"
        transparent
        onRequestClose={closeTimePicker}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.35)',
            justifyContent: 'flex-end',
          }}
        >
          <View
            style={{
              backgroundColor: theme.colors.card,
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              borderTopWidth: 1,
              borderColor: theme.colors.border,
              paddingBottom: 20,
            }}
          >
            <View
              style={{
                paddingHorizontal: 14,
                paddingVertical: 12,
                borderBottomWidth: 1,
                borderBottomColor: theme.colors.border,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <Pressable onPress={closeTimePicker}>
                <Text style={{ color: theme.colors.muted, fontWeight: '800' }}>Cancel</Text>
              </Pressable>
              <Text style={{ color: theme.colors.text, fontWeight: '900' }}>Pick time</Text>
              <Pressable
                onPress={() => {
                  applyPickedTime(timePickerValue)
                  closeTimePicker()
                }}
              >
                <Text style={{ color: theme.colors.primary, fontWeight: '900' }}>Done</Text>
              </Pressable>
            </View>

            <DateTimePicker
              value={timePickerValue}
              mode="time"
              display="spinner"
              onChange={onPickerChange}
              style={{ alignSelf: 'center' }}
            />
          </View>
        </View>
      </Modal>

      <Modal visible={tzPickerVisible} animationType="slide" onRequestClose={() => setTzPickerVisible(false)}>
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
            <Pressable onPress={() => setTzPickerVisible(false)}>
              <Text style={{ fontWeight: '900', color: theme.colors.primary }}>Done</Text>
            </Pressable>
          </View>

          <View style={{ padding: 14 }}>
            <TextInput
              value={tzQuery}
              onChangeText={setTzQuery}
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
            renderItem={({ item }) => (
              <Pressable
                onPress={() => onPickTimezone(item)}
                style={({ pressed }) => ({
                  paddingHorizontal: 14,
                  paddingVertical: 14,
                  borderBottomWidth: 1,
                  borderBottomColor: theme.colors.border,
                  backgroundColor: pressed ? '#EEF6F1' : theme.colors.bg,
                })}
              >
                <Text style={{ fontWeight: '900', color: theme.colors.text }}>{item}</Text>
              </Pressable>
            )}
          />
        </View>
      </Modal>

      <Modal visible={upgradeModalOpen} transparent animationType="fade" onRequestClose={() => setUpgradeModalOpen(false)}>
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.4)',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <View
            style={{
              width: '100%',
              maxWidth: 420,
              backgroundColor: theme.colors.card,
              borderRadius: 14,
              padding: 16,
              borderWidth: 1,
              borderColor: theme.colors.border,
            }}
          >
            <Text style={{ fontSize: 20, fontWeight: '900', color: theme.colors.text }}>Upgrade for more reminders</Text>
            <Text style={{ marginTop: 8, color: theme.colors.muted, lineHeight: 20 }}>{upgradeModalMessage}</Text>

            <View style={{ marginTop: 16, flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
              <Pressable
                onPress={() => setUpgradeModalOpen(false)}
                style={({ pressed }) => ({
                  opacity: pressed ? 0.9 : 1,
                  borderWidth: 1,
                  borderColor: theme.colors.primary,
                  borderRadius: 10,
                  paddingVertical: 10,
                  paddingHorizontal: 16,
                })}
              >
                <Text style={{ color: theme.colors.primary, fontWeight: '900' }}>OK</Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  setUpgradeModalOpen(false)
                  navigation.navigate('Billing')
                }}
                style={({ pressed }) => ({
                  opacity: pressed ? 0.9 : 1,
                  borderRadius: 10,
                  backgroundColor: theme.colors.primary,
                  paddingVertical: 10,
                  paddingHorizontal: 16,
                })}
              >
                <Text style={{ color: theme.colors.primaryText, fontWeight: '900' }}>Upgrade</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  )
}
