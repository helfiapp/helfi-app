import React, { useEffect, useState } from 'react'
import { Modal, Platform, Pressable, ScrollView, Switch, Text, View } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Feather } from '@expo/vector-icons'
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker'

import { Screen } from '../ui/Screen'
import { theme } from '../ui/theme'

const QUIET_ENABLED_KEY = 'quietHoursEnabled'
const QUIET_START_KEY = 'quietHoursStart'
const QUIET_END_KEY = 'quietHoursEnd'

type QuietTimeKey = 'start' | 'end'

function normalizeTime(input: string, fallback: string) {
  const s = String(input || '').trim()
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
  const normalized = normalizeTime(value, '12:00')
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
      <Text style={{ color: theme.colors.text, fontWeight: '800' }}>{label}</Text>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        style={({ pressed }) => ({
          opacity: disabled ? 0.5 : pressed ? 0.9 : 1,
          borderWidth: 1,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.md,
          backgroundColor: disabled ? '#F3F4F6' : theme.colors.card,
          paddingHorizontal: 12,
          paddingVertical: 11,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        })}
      >
        <Text style={{ color: disabled ? '#9CA3AF' : theme.colors.text, fontWeight: '800', flex: 1 }}>
          {value}
        </Text>
        <Feather name="clock" size={18} color={theme.colors.muted} />
      </Pressable>
    </View>
  )
}

export function NotificationsQuietHoursScreen() {
  const [enabled, setEnabled] = useState(false)
  const [startTime, setStartTime] = useState('22:00')
  const [endTime, setEndTime] = useState('07:00')
  const [loaded, setLoaded] = useState(false)
  const [timePickerVisible, setTimePickerVisible] = useState(false)
  const [timePickerTarget, setTimePickerTarget] = useState<QuietTimeKey | null>(null)
  const [timePickerValue, setTimePickerValue] = useState(new Date())

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const [savedEnabled, savedStart, savedEnd] = await Promise.all([
          AsyncStorage.getItem(QUIET_ENABLED_KEY),
          AsyncStorage.getItem(QUIET_START_KEY),
          AsyncStorage.getItem(QUIET_END_KEY),
        ])

        if (cancelled) return

        if (savedEnabled !== null) setEnabled(savedEnabled === 'true')
        if (savedStart) setStartTime(normalizeTime(savedStart, '22:00'))
        if (savedEnd) setEndTime(normalizeTime(savedEnd, '07:00'))
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoaded(true)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!loaded) return

    void AsyncStorage.multiSet([
      [QUIET_ENABLED_KEY, enabled ? 'true' : 'false'],
      [QUIET_START_KEY, startTime],
      [QUIET_END_KEY, endTime],
    ])
  }, [enabled, startTime, endTime, loaded])

  const openTimePicker = (target: QuietTimeKey) => {
    if (!enabled) return
    setTimePickerTarget(target)
    setTimePickerValue(parseHHMMToDate(target === 'start' ? startTime : endTime))
    setTimePickerVisible(true)
  }

  const closeTimePicker = () => {
    setTimePickerVisible(false)
    setTimePickerTarget(null)
  }

  const applyPickedTime = (pickedDate: Date) => {
    if (!timePickerTarget) return
    const next = formatDateToHHMM(pickedDate)
    if (timePickerTarget === 'start') {
      setStartTime(next)
      return
    }
    setEndTime(next)
  }

  const onPickerChange = (_event: DateTimePickerEvent, pickedDate?: Date) => {
    if (!pickedDate) return
    setTimePickerValue(pickedDate)
    if (Platform.OS === 'android') {
      applyPickedTime(pickedDate)
      closeTimePicker()
    }
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
          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 22, fontWeight: '900', color: theme.colors.text }}>Quiet hours</Text>
            <Text style={{ color: theme.colors.muted, lineHeight: 19 }}>
              Pause reminders during set hours. Stored on this device for now.
            </Text>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={{ color: theme.colors.text, fontWeight: '800' }}>Enable quiet hours</Text>
              <Text style={{ marginTop: 3, color: theme.colors.muted, fontSize: 12 }}>
                Pause notifications overnight.
              </Text>
            </View>
            <Switch value={enabled} onValueChange={setEnabled} />
          </View>

          <View style={{ gap: 12, opacity: enabled ? 1 : 0.5 }}>
            <TimeRow
              label="Quiet hours start"
              value={startTime}
              disabled={!enabled}
              onPress={() => openTimePicker('start')}
            />

            <TimeRow
              label="Quiet hours end"
              value={endTime}
              disabled={!enabled}
              onPress={() => openTimePicker('end')}
            />
          </View>
        </View>
      </ScrollView>

      {timePickerVisible && Platform.OS === 'android' ? (
        <DateTimePicker value={timePickerValue} mode="time" display="default" onChange={onPickerChange} />
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
    </Screen>
  )
}
