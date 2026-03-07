import React, { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import DateTimePicker from '@react-native-community/datetimepicker'
import { Audio } from 'expo-av'
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons'
import Svg, { Circle, Path } from 'react-native-svg'
import { LinearGradient } from 'expo-linear-gradient'

import { API_BASE_URL } from '../config'
import { useAppMode } from '../state/AppModeContext'
import { Screen } from '../ui/Screen'

type SleepSummary = {
  days: number
  lastNightHours: number | null
  average7Hours: number | null
  average14Hours: number | null
  consistency: 'stable' | 'moderate' | 'variable' | 'unknown'
  lastSleepDate?: string | null
  dataSources: { fitbit: boolean; garmin: boolean }
}

type DailySleep = {
  date: string
  minutes: number | null
  provider: 'fitbit' | 'garmin' | null
  bedtime: string | null
  wake: string | null
  efficiency: number | null
  deepMinutes: number | null
  remMinutes: number | null
  lightMinutes: number | null
  awakeMinutes: number | null
  restingHeartRate: number | null
}

type CoachAlert = {
  title: string
  message: string
  severity: 'good' | 'watch' | 'high'
}

type SleepReportResponse = {
  success: boolean
  summary: SleepSummary
  daily: DailySleep[]
  coachAlerts: CoachAlert[]
}

type ViewTab = 'dashboard' | 'summary' | 'coach'

const SLEEP_LISTENING_SETTINGS_KEY = 'helfi_sleep_listening_settings_v1'
const SLEEP_ROUTINE_KEY = 'helfi_sleep_routine_v1'

type SleepListeningSettings = {
  enabled: boolean
  startTime: string
  endTime: string
  timezone: string
}

type RoutineState = {
  blueLight: boolean
  roomTemp: boolean
  hydrate: boolean
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

function formatHours(hours: number | null) {
  if (hours == null) return '—'
  return `${hours.toFixed(1)} h`
}

function minutesToHhMm(value: number | null) {
  if (!value || value <= 0) return '—'
  const h = Math.floor(value / 60)
  const m = value % 60
  return `${h}h ${String(m).padStart(2, '0')}m`
}

function parseTimeToDate(value: string) {
  const [h, m] = value.split(':').map((n) => Number(n))
  const d = new Date()
  d.setHours(Number.isFinite(h) ? h : 22, Number.isFinite(m) ? m : 30, 0, 0)
  return d
}

function toTimeString(value: Date) {
  const h = String(value.getHours()).padStart(2, '0')
  const m = String(value.getMinutes()).padStart(2, '0')
  return `${h}:${m}`
}

function consistencyLabel(value: SleepSummary['consistency']) {
  if (value === 'stable') return 'Stable'
  if (value === 'moderate') return 'Moderate'
  if (value === 'variable') return 'Variable'
  return 'Unknown'
}

function toFriendlyDate(yyyyMmDd: string) {
  const d = new Date(`${yyyyMmDd}T00:00:00`)
  if (Number.isNaN(d.getTime())) return yyyyMmDd
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function weekdayLabel(yyyyMmDd: string) {
  const d = new Date(`${yyyyMmDd}T00:00:00`)
  if (Number.isNaN(d.getTime())) return '--'
  return d.toLocaleDateString(undefined, { weekday: 'short' })
}

function sleepScoreFromMinutes(minutes: number | null) {
  if (!minutes || minutes <= 0) return 0
  const hours = minutes / 60
  return clamp(Math.round((hours / 8) * 100), 0, 100)
}

function scoreText(score: number) {
  if (score >= 85) return 'Restorative Sleep'
  if (score >= 70) return 'Good Sleep'
  if (score >= 55) return 'Moderate Sleep'
  return score > 0 ? 'Recovery Needed' : 'No Data'
}

function scoreSubText(score: number) {
  if (score >= 85) return 'Excellent recovery detected'
  if (score >= 70) return 'Healthy overnight recovery'
  if (score >= 55) return 'Room to improve your sleep quality'
  if (score > 0) return 'Your body needs a better recovery window'
  return 'Sync wearable sleep data to generate your score'
}

function scoreRingOffset(score: number) {
  const radius = 88
  const circumference = 2 * Math.PI * radius
  return circumference - (score / 100) * circumference
}

function consistencyPct(value: SleepSummary['consistency']) {
  if (value === 'stable') return 88
  if (value === 'moderate') return 76
  if (value === 'variable') return 62
  return 0
}

function trendBarsFromDays(days: DailySleep[]) {
  const window = days.slice(-7)
  const max = Math.max(...window.map((d) => d.minutes || 300), 420)
  return window.map((d, i) => {
    const mins = d.minutes || 0
    const height = mins > 0 ? Math.max(14, Math.round((mins / max) * 120)) : 12
    return {
      key: `${d.date}-${i}`,
      date: d.date,
      label: weekdayLabel(d.date).toUpperCase(),
      height,
      active: i === window.length - 1,
      hasData: mins > 0,
    }
  })
}

function linePath(values: number[], width: number, height: number) {
  if (!values.length) return ''
  const max = Math.max(...values, 1)
  const min = Math.min(...values, 0)
  const span = Math.max(max - min, 1)
  const stepX = values.length > 1 ? width / (values.length - 1) : width
  return values
    .map((v, i) => {
      const x = i * stepX
      const y = height - ((v - min) / span) * height
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')
}

function lineAreaPath(values: number[], width: number, height: number) {
  if (!values.length) return ''
  const main = linePath(values, width, height)
  return `${main} L${width},${height} L0,${height} Z`
}

function sleepInsightText(summary: SleepSummary | null) {
  if (!summary || summary.average7Hours == null || summary.average14Hours == null) {
    return 'We are still collecting enough nights to calculate trend insights.'
  }
  const diff = Math.round((summary.average7Hours - summary.average14Hours) * 60)
  if (diff >= 10) return `Your weekly sleep is up by ${diff} minutes compared with your 14-day baseline. Great momentum.`
  if (diff <= -10) return `Your weekly sleep is down by ${Math.abs(diff)} minutes compared with your 14-day baseline. A small earlier bedtime can help.`
  return 'Your sleep trend is steady week over week. Keep your current routine.'
}

function aiCoachMessage(summary: SleepSummary | null, alerts: CoachAlert[]) {
  if (!summary) {
    return 'I am waiting for more sleep data from your connected devices. Keep your trackers connected and I will coach you automatically.'
  }
  const keyAlert = alerts.find((a) => a.severity === 'high') || alerts.find((a) => a.severity === 'watch')
  if (keyAlert) {
    return `I noticed: ${keyAlert.title}. Tonight, start your wind-down 15 minutes earlier and avoid late caffeine.`
  }
  return `Your current consistency is ${consistencyLabel(summary.consistency)}. Keep your bedtime routine steady to protect recovery.`
}

function normalizeBars(values: Array<number | null>, fallback = [7, 11, 15, 12, 9]) {
  const clean = values.filter((v): v is number => typeof v === 'number' && v > 0)
  if (!clean.length) return fallback
  const max = Math.max(...clean)
  return values.map((v, i) => {
    if (!v || v <= 0) return Math.max(6, fallback[i % fallback.length])
    return Math.max(6, Math.round((v / max) * 18))
  })
}

export function SleepCoachScreen() {
  const { mode, session } = useAppMode()
  const [loading, setLoading] = useState(true)
  const [report, setReport] = useState<SleepReportResponse | null>(null)
  const [errorText, setErrorText] = useState('')
  const [tab, setTab] = useState<ViewTab>('dashboard')
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const [settings, setSettings] = useState<SleepListeningSettings>({
    enabled: false,
    startTime: '22:30',
    endTime: '07:00',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  })

  const [routineItems, setRoutineItems] = useState<RoutineState>({
    blueLight: true,
    roomTemp: false,
    hydrate: false,
  })

  const [showStartPicker, setShowStartPicker] = useState(false)
  const [showEndPicker, setShowEndPicker] = useState(false)
  const [savingSettings, setSavingSettings] = useState(false)
  const [micBusy, setMicBusy] = useState(false)

  const authHeaders = useMemo(() => {
    if (mode !== 'signedIn' || !session?.token) return null
    return {
      authorization: `Bearer ${session.token}`,
      'cache-control': 'no-store',
    }
  }, [mode, session?.token])

  const loadReport = async () => {
    if (!authHeaders) {
      setErrorText('Please sign in again.')
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setErrorText('')
      const res = await fetch(`${API_BASE_URL}/api/native-sleep-report?days=14`, {
        headers: authHeaders,
      })
      const data: any = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErrorText(String(data?.error || 'Could not load sleep report'))
        setReport(null)
        return
      }
      setReport(data as SleepReportResponse)
    } catch {
      setErrorText('Could not load sleep report')
      setReport(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadReport()
  }, [authHeaders])

  useEffect(() => {
    let cancelled = false

    const loadSaved = async () => {
      try {
        const [rawSettings, rawRoutine] = await Promise.all([
          AsyncStorage.getItem(SLEEP_LISTENING_SETTINGS_KEY),
          AsyncStorage.getItem(SLEEP_ROUTINE_KEY),
        ])

        if (!cancelled && rawSettings) {
          const parsed = JSON.parse(rawSettings)
          if (parsed && typeof parsed === 'object') {
            setSettings({
              enabled: parsed.enabled === true,
              startTime: typeof parsed.startTime === 'string' ? parsed.startTime : '22:30',
              endTime: typeof parsed.endTime === 'string' ? parsed.endTime : '07:00',
              timezone:
                typeof parsed.timezone === 'string' && parsed.timezone
                  ? parsed.timezone
                  : Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
            })
          }
        }

        if (!cancelled && rawRoutine) {
          const parsedRoutine = JSON.parse(rawRoutine)
          if (parsedRoutine && typeof parsedRoutine === 'object') {
            setRoutineItems({
              blueLight: parsedRoutine.blueLight === true,
              roomTemp: parsedRoutine.roomTemp === true,
              hydrate: parsedRoutine.hydrate === true,
            })
          }
        }
      } catch {
        // keep defaults
      }
    }

    void loadSaved()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    void AsyncStorage.setItem(SLEEP_ROUTINE_KEY, JSON.stringify(routineItems)).catch(() => undefined)
  }, [routineItems])

  const saveSettings = async () => {
    try {
      setSavingSettings(true)
      await AsyncStorage.setItem(SLEEP_LISTENING_SETTINGS_KEY, JSON.stringify(settings))
      Alert.alert('Saved', 'Sleep settings are saved.')
    } catch {
      Alert.alert('Save failed', 'Could not save settings. Please try again.')
    } finally {
      setSavingSettings(false)
    }
  }

  const runMicrophoneCheck = async () => {
    try {
      setMicBusy(true)
      const permission = await Audio.requestPermissionsAsync()
      if (!permission.granted) {
        Alert.alert('Microphone permission needed', 'Please allow microphone access to run sleep listening.')
        return
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      })

      const recording = new Audio.Recording()
      await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY)
      await recording.startAsync()
      await new Promise((resolve) => setTimeout(resolve, 3000))
      await recording.stopAndUnloadAsync()

      Alert.alert('Microphone ready', 'Microphone check passed.')
    } catch {
      Alert.alert('Microphone check failed', 'Could not run microphone test on this device.')
    } finally {
      setMicBusy(false)
    }
  }

  const summary = report?.summary || null
  const alerts = report?.coachAlerts || []
  const daily = report?.daily || []

  useEffect(() => {
    if (!daily.length) {
      setSelectedDate(null)
      return
    }

    setSelectedDate((prev) => {
      if (prev && daily.some((d) => d.date === prev)) return prev
      const lastWithSleep = [...daily].reverse().find((d) => (d.minutes || 0) > 0)
      return lastWithSleep?.date || daily[daily.length - 1].date
    })
  }, [daily])

  const selectedDay = useMemo(() => {
    if (!selectedDate) return null
    return daily.find((d) => d.date === selectedDate) || null
  }, [daily, selectedDate])

  const selectedMinutes = selectedDay?.minutes ?? null
  const sleepScore = sleepScoreFromMinutes(selectedMinutes)
  const deepMinutes = selectedDay?.deepMinutes ?? (selectedMinutes ? Math.round(selectedMinutes * 0.22) : null)
  const remMinutes = selectedDay?.remMinutes ?? (selectedMinutes ? Math.round(selectedMinutes * 0.26) : null)
  const awakeMinutes = selectedDay?.awakeMinutes ?? (selectedMinutes ? Math.round(selectedMinutes * 0.05) : null)
  const lightMinutes = selectedDay?.lightMinutes ?? (selectedMinutes ? Math.max(selectedMinutes - (deepMinutes || 0) - (remMinutes || 0) - (awakeMinutes || 0), 0) : null)
  const efficiency = selectedDay?.efficiency ?? null
  const restingHr = selectedDay?.restingHeartRate ?? null

  const dateStrip = daily.slice(-6)
  const trendWindow = daily.slice(-7)
  const trendValues = trendWindow.map((d) => d.minutes || 0)
  const trendPath = linePath(trendValues, 320, 108)
  const trendAreaPath = lineAreaPath(trendValues, 320, 108)

  const weeklyBars = trendBarsFromDays(daily)
  const consistencyScore = consistencyPct(summary?.consistency || 'unknown')
  const deepPct = selectedMinutes && deepMinutes ? Math.round((deepMinutes / selectedMinutes) * 100) : 0
  const efficiencyPct = efficiency ?? 0

  const criticalAlerts = alerts.filter((a) => a.severity === 'high' || a.severity === 'watch').slice(0, 3)

  const heartTrendBars = normalizeBars(trendWindow.map((d) => d.restingHeartRate))
  const sleepTrendBars = normalizeBars(trendWindow.map((d) => d.minutes ? Math.round(d.minutes / 30) : null))

  const routineDone = [routineItems.blueLight, routineItems.roomTemp, routineItems.hydrate].filter(Boolean).length
  const routineProgress = Math.round((routineDone / 3) * 100)

  const sourceText = summary
    ? [summary.dataSources.fitbit ? 'Fitbit' : null, summary.dataSources.garmin ? 'Garmin' : null].filter(Boolean).join(' + ') || 'No wearable data yet'
    : '—'

  return (
    <Screen style={{ backgroundColor: '#102122' }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 38 }}>
        <LinearGradient colors={['#102122', '#0F1E20']} style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 18 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View>
              <Text style={{ color: '#0DDEF2', fontSize: 11, fontWeight: '800', letterSpacing: 1.1 }}>SLEEP COACH</Text>
              <Text style={{ color: '#F8FCFB', fontSize: 26, fontWeight: '900', marginTop: 4 }}>Good morning</Text>
            </View>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#1B3237', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(13,223,242,0.25)' }}>
              <Feather name="moon" size={18} color="#0DDEF2" />
            </View>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 14 }} contentContainerStyle={{ gap: 8 }}>
            {dateStrip.length ? (
              dateStrip.map((item) => {
                const active = selectedDate === item.date
                return (
                  <Pressable
                    key={item.date}
                    onPress={() => setSelectedDate(item.date)}
                    style={{
                      width: 56,
                      height: 76,
                      borderRadius: 12,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: active ? '#0DDEF2' : '#163037',
                      borderWidth: active ? 0 : 1,
                      borderColor: 'rgba(255,255,255,0.08)',
                    }}
                  >
                    <Text style={{ color: active ? '#102122' : '#A7B6BA', fontSize: 12, fontWeight: '700' }}>{weekdayLabel(item.date)}</Text>
                    <Text style={{ color: active ? '#102122' : '#F8FCFB', fontSize: 20, fontWeight: '900', marginTop: 4 }}>
                      {toFriendlyDate(item.date).split(' ')[1] || '--'}
                    </Text>
                  </Pressable>
                )
              })
            ) : (
              <Text style={{ color: '#A3B6BB' }}>No dates yet</Text>
            )}
          </ScrollView>

          <View style={{ flexDirection: 'row', backgroundColor: '#173136', borderRadius: 999, padding: 4, marginTop: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }}>
            <TabButton label="Dashboard" active={tab === 'dashboard'} onPress={() => setTab('dashboard')} />
            <TabButton label="Summary" active={tab === 'summary'} onPress={() => setTab('summary')} />
            <TabButton label="Coach" active={tab === 'coach'} onPress={() => setTab('coach')} />
          </View>
        </LinearGradient>

        <View style={{ paddingHorizontal: 16, marginTop: 12 }}>
          {loading ? (
            <View style={{ paddingVertical: 50, alignItems: 'center' }}>
              <ActivityIndicator color="#0DDEF2" />
              <Text style={{ marginTop: 10, color: '#9EB2B6' }}>Loading sleep data...</Text>
            </View>
          ) : null}

          {!loading && errorText ? (
            <View style={{ borderRadius: 14, borderWidth: 1, borderColor: '#EF4444', backgroundColor: 'rgba(239,68,68,0.15)', padding: 12, marginBottom: 10 }}>
              <Text style={{ color: '#FECACA', fontWeight: '800' }}>{errorText}</Text>
            </View>
          ) : null}

          {!loading && !errorText && tab === 'dashboard' ? (
            <>
              <View style={{ backgroundColor: '#13292D', borderRadius: 24, padding: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' }}>
                <View style={{ alignItems: 'center' }}>
                  <View style={{ width: 210, height: 210, alignItems: 'center', justifyContent: 'center' }}>
                    <Svg width={210} height={210} viewBox="0 0 210 210">
                      <Circle cx={105} cy={105} r={88} stroke="#1D353A" strokeWidth={8} fill="none" />
                      <Circle
                        cx={105}
                        cy={105}
                        r={88}
                        stroke="#0DDEF2"
                        strokeWidth={10}
                        strokeLinecap="round"
                        fill="none"
                        strokeDasharray={`${2 * Math.PI * 88} ${2 * Math.PI * 88}`}
                        strokeDashoffset={scoreRingOffset(sleepScore)}
                        transform="rotate(-90 105 105)"
                      />
                    </Svg>
                    <View style={{ position: 'absolute', alignItems: 'center' }}>
                      <Text style={{ color: '#F8FCFB', fontSize: 48, fontWeight: '900' }}>{sleepScore}</Text>
                      <Text style={{ color: '#96AAB0', fontWeight: '700' }}>/100</Text>
                    </View>
                  </View>
                  <Text style={{ color: '#F8FCFB', fontSize: 22, fontWeight: '900' }}>{scoreText(sleepScore)}</Text>
                  <Text style={{ color: '#96AAB0', marginTop: 6 }}>{scoreSubText(sleepScore)}</Text>
                </View>
              </View>

              <View style={{ marginTop: 14, flexDirection: 'row', gap: 10 }}>
                <MetricCard title="Total Sleep" value={minutesToHhMm(selectedMinutes)} icon="clock" />
                <MetricCard title="Efficiency" value={efficiency != null ? `${efficiency}%` : '—'} icon="activity" />
                <MetricCard title="Resting HR" value={restingHr != null ? `${restingHr} bpm` : '—'} icon="heart" />
              </View>

              <View style={{ marginTop: 14, backgroundColor: '#13292D', borderRadius: 20, padding: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' }}>
                <Text style={{ color: '#F8FCFB', fontSize: 18, fontWeight: '900' }}>Sleep Stages</Text>
                <Text style={{ color: '#98AEB3', marginTop: 4 }}>Overnight depth and REM pattern</Text>

                <View style={{ marginTop: 14 }}>
                  <Svg width="100%" height={132} viewBox="0 0 320 132">
                    <Path d={trendAreaPath} fill="rgba(13,223,242,0.16)" />
                    <Path d={trendPath} fill="none" stroke="#0DDEF2" strokeWidth={3} />
                  </Svg>
                </View>

                <View style={{ marginTop: 8, flexDirection: 'row', gap: 10 }}>
                  <MiniStageBox label="Deep Sleep" value={minutesToHhMm(deepMinutes)} icon="moon-waning-crescent" />
                  <MiniStageBox label="REM Sleep" value={minutesToHhMm(remMinutes)} icon="brain" />
                </View>
              </View>
            </>
          ) : null}

          {!loading && !errorText && tab === 'summary' ? (
            <>
              <View style={{ backgroundColor: '#13292D', borderRadius: 20, padding: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' }}>
                <Text style={{ color: '#0DDEF2', fontSize: 11, fontWeight: '800', letterSpacing: 1 }}>WEEKLY OVERVIEW</Text>
                <Text style={{ color: '#F8FCFB', fontSize: 34, fontWeight: '900', marginTop: 4 }}>{formatHours(summary?.average7Hours ?? null)}</Text>
                <Text style={{ color: '#96AAB0', marginTop: 4 }}>Consistency: {consistencyLabel(summary?.consistency || 'unknown')}</Text>

                <View style={{ marginTop: 16, height: 170, borderRadius: 12, backgroundColor: '#0F2125', paddingHorizontal: 10, paddingTop: 16, paddingBottom: 10, flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
                  {weeklyBars.map((b) => (
                    <View key={b.key} style={{ flex: 1, alignItems: 'center' }}>
                      <View style={{ height: 120, justifyContent: 'flex-end', width: '100%' }}>
                        <View
                          style={{
                            height: b.height,
                            borderTopLeftRadius: 5,
                            borderTopRightRadius: 5,
                            backgroundColor: b.active ? '#0DDEF2' : 'rgba(13,223,242,0.28)',
                          }}
                        />
                      </View>
                      <Text style={{ color: b.active ? '#0DDEF2' : '#8CA3A8', fontSize: 10, fontWeight: '800', marginTop: 8 }}>{b.label}</Text>
                    </View>
                  ))}
                </View>
              </View>

              <View style={{ marginTop: 12, backgroundColor: '#0DDEF2', borderRadius: 14, padding: 12 }}>
                <Text style={{ color: '#082025', fontWeight: '900', fontSize: 16 }}>Sleep Insight</Text>
                <Text style={{ color: '#0A2A31', marginTop: 6, lineHeight: 20 }}>{sleepInsightText(summary)}</Text>
              </View>

              <View style={{ marginTop: 14, backgroundColor: '#13292D', borderRadius: 20, padding: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' }}>
                <Text style={{ color: '#F8FCFB', fontSize: 18, fontWeight: '900' }}>Sleep Quality Breakdown</Text>
                <View style={{ marginTop: 14, flexDirection: 'row', gap: 8 }}>
                  <QualityCard label="Deep" value={deepPct || 0} />
                  <QualityCard label="Efficiency" value={efficiencyPct || 0} />
                  <QualityCard label="Consistency" value={consistencyScore || 0} />
                </View>

                <Text style={{ marginTop: 18, color: '#F8FCFB', fontWeight: '900', fontSize: 16 }}>Sleep Cycles Breakdown</Text>
                <Text style={{ color: '#8CA3A8', marginTop: 4 }}>Based on selected night</Text>

                <View style={{ marginTop: 12, flexDirection: 'row', height: 14, borderRadius: 999, overflow: 'hidden' }}>
                  <View style={{ width: `${selectedMinutes && awakeMinutes ? Math.max(3, Math.round((awakeMinutes / selectedMinutes) * 100)) : 5}%`, backgroundColor: 'rgba(148,163,184,0.45)' }} />
                  <View style={{ width: `${selectedMinutes && remMinutes ? Math.max(6, Math.round((remMinutes / selectedMinutes) * 100)) : 25}%`, backgroundColor: 'rgba(13,223,242,0.4)' }} />
                  <View style={{ width: `${selectedMinutes && lightMinutes ? Math.max(10, Math.round((lightMinutes / selectedMinutes) * 100)) : 48}%`, backgroundColor: 'rgba(13,223,242,0.7)' }} />
                  <View style={{ width: `${selectedMinutes && deepMinutes ? Math.max(6, Math.round((deepMinutes / selectedMinutes) * 100)) : 22}%`, backgroundColor: '#0DDEF2' }} />
                </View>

                <View style={{ marginTop: 12, gap: 8 }}>
                  <LegendRow color="rgba(148,163,184,0.6)" label="Awake" value={minutesToHhMm(awakeMinutes)} />
                  <LegendRow color="rgba(13,223,242,0.4)" label="REM" value={minutesToHhMm(remMinutes)} />
                  <LegendRow color="rgba(13,223,242,0.7)" label="Light" value={minutesToHhMm(lightMinutes)} />
                  <LegendRow color="#0DDEF2" label="Deep" value={minutesToHhMm(deepMinutes)} />
                </View>
              </View>
            </>
          ) : null}

          {!loading && !errorText && tab === 'coach' ? (
            <>
              <View>
                <Text style={{ color: '#8FB1B8', fontWeight: '700', fontSize: 11, letterSpacing: 1 }}>CRITICAL HEALTH FLAGS</Text>
                <View style={{ marginTop: 8, gap: 10 }}>
                  {criticalAlerts.length ? (
                    criticalAlerts.map((alert, idx) => (
                      <View key={`${alert.title}-${idx}`} style={{ backgroundColor: '#13292D', borderRadius: 14, borderWidth: 1, borderColor: alert.severity === 'high' ? '#EF4444' : '#F59E0B', padding: 12 }}>
                        <Text style={{ color: '#F8FCFB', fontWeight: '900' }}>{alert.title}</Text>
                        <Text style={{ color: '#9BB1B7', marginTop: 6, lineHeight: 20 }}>{alert.message}</Text>
                      </View>
                    ))
                  ) : (
                    <View style={{ backgroundColor: '#13292D', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(13,223,242,0.2)', padding: 12 }}>
                      <Text style={{ color: '#C6E5EA', fontWeight: '700' }}>No critical alerts right now.</Text>
                    </View>
                  )}
                </View>
              </View>

              <View style={{ marginTop: 14, backgroundColor: '#13292D', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(13,223,242,0.25)', overflow: 'hidden' }}>
                <View style={{ padding: 12, backgroundColor: 'rgba(13,223,242,0.12)', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View>
                    <Text style={{ color: '#F8FCFB', fontWeight: '900', fontSize: 17 }}>Wind-Down Routine</Text>
                    <Text style={{ color: '#A8C3C8', marginTop: 2, fontSize: 12 }}>Optimized for better recovery</Text>
                  </View>
                  <Text style={{ color: '#0DDEF2', fontWeight: '900' }}>{routineProgress}%</Text>
                </View>

                <View style={{ padding: 12, gap: 8 }}>
                  <ChecklistRow checked={routineItems.blueLight} onToggle={() => setRoutineItems((s) => ({ ...s, blueLight: !s.blueLight }))} label="Activate blue light filters" subtitle="All devices dimmed" />
                  <ChecklistRow checked={routineItems.roomTemp} onToggle={() => setRoutineItems((s) => ({ ...s, roomTemp: !s.roomTemp }))} label="Room temperature adjustment" subtitle="Target 20°C" />
                  <ChecklistRow checked={routineItems.hydrate} onToggle={() => setRoutineItems((s) => ({ ...s, hydrate: !s.hydrate }))} label="Hydration check" subtitle="Last glass of water now" />
                </View>
              </View>

              <View style={{ marginTop: 14, backgroundColor: '#13292D', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', padding: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                  <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: '#0DDEF2', alignItems: 'center', justifyContent: 'center' }}>
                    <MaterialCommunityIcons name="brain" size={18} color="#102122" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#F8FCFB', fontWeight: '900', fontSize: 16 }}>AI Coach Insight</Text>
                    <Text style={{ color: '#9CB2B8', marginTop: 6, lineHeight: 20 }}>{aiCoachMessage(summary, alerts)}</Text>
                  </View>
                </View>
              </View>

              <View style={{ marginTop: 14, flexDirection: 'row', gap: 10 }}>
                <MicroGraphCard title="Sleep Trend" value={formatHours(summary?.average7Hours ?? null)} bars={sleepTrendBars} />
                <MicroGraphCard title="Resting HR Trend" value={restingHr != null ? `${restingHr} bpm` : '—'} bars={heartTrendBars} />
              </View>

              <View style={{ marginTop: 14, backgroundColor: '#13292D', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', padding: 12 }}>
                <Text style={{ color: '#F8FCFB', fontWeight: '900', fontSize: 18 }}>Listening Controls</Text>
                <Text style={{ color: '#98ADB3', marginTop: 6 }}>Optional phone listening and microphone test.</Text>

                <View style={{ marginTop: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ flex: 1, paddingRight: 10 }}>
                    <Text style={{ color: '#F8FCFB', fontWeight: '800' }}>Enable phone listening</Text>
                    <Text style={{ color: '#9CB2B8', marginTop: 2, fontSize: 12 }}>Only runs when turned on.</Text>
                  </View>
                  <Switch
                    value={settings.enabled}
                    onValueChange={(value) => setSettings((prev) => ({ ...prev, enabled: value }))}
                    trackColor={{ true: '#0DDEF2', false: '#30474D' }}
                    thumbColor={settings.enabled ? '#EAFBFD' : '#D4E6EA'}
                  />
                </View>

                <View style={{ marginTop: 12, gap: 10 }}>
                  <DarkTimeRow label="Start time" value={settings.startTime} onPress={() => setShowStartPicker(true)} />
                  <DarkTimeRow label="End time" value={settings.endTime} onPress={() => setShowEndPicker(true)} />
                  <StaticDarkRow label="Timezone" value={settings.timezone} />
                  <StaticDarkRow label="Data source" value={sourceText} />
                </View>

                {showStartPicker ? (
                  <DateTimePicker
                    mode="time"
                    value={parseTimeToDate(settings.startTime)}
                    display="spinner"
                    onChange={(_, date) => {
                      setShowStartPicker(false)
                      if (!date) return
                      setSettings((prev) => ({ ...prev, startTime: toTimeString(date) }))
                    }}
                  />
                ) : null}

                {showEndPicker ? (
                  <DateTimePicker
                    mode="time"
                    value={parseTimeToDate(settings.endTime)}
                    display="spinner"
                    onChange={(_, date) => {
                      setShowEndPicker(false)
                      if (!date) return
                      setSettings((prev) => ({ ...prev, endTime: toTimeString(date) }))
                    }}
                  />
                ) : null}

                <Pressable
                  onPress={saveSettings}
                  disabled={savingSettings}
                  style={({ pressed }) => ({
                    marginTop: 12,
                    height: 44,
                    borderRadius: 12,
                    backgroundColor: '#0DDEF2',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: savingSettings ? 0.6 : pressed ? 0.9 : 1,
                  })}
                >
                  <Text style={{ color: '#0D1E22', fontWeight: '900' }}>{savingSettings ? 'Saving...' : 'Save sleep settings'}</Text>
                </Pressable>

                <Pressable
                  onPress={runMicrophoneCheck}
                  disabled={micBusy}
                  style={({ pressed }) => ({
                    marginTop: 10,
                    height: 44,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: 'rgba(13,223,242,0.4)',
                    backgroundColor: '#143037',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: micBusy ? 0.6 : pressed ? 0.9 : 1,
                  })}
                >
                  <Text style={{ color: '#D7F6FA', fontWeight: '900' }}>{micBusy ? 'Checking microphone...' : 'Run microphone check'}</Text>
                </Pressable>
              </View>
            </>
          ) : null}
        </View>
      </ScrollView>
    </Screen>
  )
}

function TabButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        height: 36,
        borderRadius: 999,
        backgroundColor: active ? '#0DDEF2' : 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: active ? '#102122' : '#9DB4BA', fontWeight: '900', fontSize: 13 }}>{label}</Text>
    </Pressable>
  )
}

function MetricCard({ title, value, icon }: { title: string; value: string; icon: 'clock' | 'activity' | 'heart' }) {
  return (
    <View style={{ flex: 1, backgroundColor: '#13292D', borderRadius: 14, padding: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', alignItems: 'center' }}>
      <Feather name={icon} size={18} color="#0DDEF2" />
      <Text style={{ color: '#8EA6AB', marginTop: 6, fontSize: 11, fontWeight: '700' }}>{title}</Text>
      <Text style={{ color: '#F8FCFB', marginTop: 4, fontSize: 14, fontWeight: '900' }}>{value}</Text>
    </View>
  )
}

function MiniStageBox({ label, value, icon }: { label: string; value: string; icon: 'moon-waning-crescent' | 'brain' }) {
  return (
    <View style={{ flex: 1, backgroundColor: '#102428', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <MaterialCommunityIcons name={icon} size={18} color="#0DDEF2" />
      <View>
        <Text style={{ color: '#8EA8AD', fontSize: 11, fontWeight: '700' }}>{label}</Text>
        <Text style={{ color: '#F8FCFB', fontWeight: '900', marginTop: 2 }}>{value}</Text>
      </View>
    </View>
  )
}

function MiniProgressRing({ value }: { value: number }) {
  const radius = 34
  const circumference = 2 * Math.PI * radius
  const safeValue = clamp(value, 0, 100)
  const offset = circumference - (safeValue / 100) * circumference

  return (
    <View style={{ width: 82, height: 82, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={82} height={82} viewBox="0 0 82 82">
        <Circle cx={41} cy={41} r={radius} stroke="#1E3338" strokeWidth={8} fill="none" />
        <Circle
          cx={41}
          cy={41}
          r={radius}
          stroke="#0DDEF2"
          strokeWidth={8}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={offset}
          transform="rotate(-90 41 41)"
        />
      </Svg>
      <Text style={{ position: 'absolute', color: '#F8FCFB', fontWeight: '900', fontSize: 14 }}>{safeValue}%</Text>
    </View>
  )
}

function QualityCard({ label, value }: { label: string; value: number }) {
  return (
    <View style={{ flex: 1, backgroundColor: '#0F2226', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', padding: 10, alignItems: 'center' }}>
      <MiniProgressRing value={value} />
      <Text style={{ color: '#9BB0B6', fontSize: 11, fontWeight: '800', marginTop: 8 }}>{label}</Text>
    </View>
  )
}

function LegendRow({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
        <Text style={{ color: '#9BB0B6', fontSize: 12 }}>{label}</Text>
      </View>
      <Text style={{ color: '#F8FCFB', fontWeight: '800' }}>{value}</Text>
    </View>
  )
}

function ChecklistRow({
  checked,
  onToggle,
  label,
  subtitle,
}: {
  checked: boolean
  onToggle: () => void
  label: string
  subtitle: string
}) {
  return (
    <Pressable onPress={onToggle} style={{ borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', backgroundColor: '#102428', padding: 10, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: '#0DDEF2', backgroundColor: checked ? '#0DDEF2' : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
        {checked ? <Feather name="check" size={14} color="#102122" /> : null}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: '#F8FCFB', fontWeight: '800' }}>{label}</Text>
        <Text style={{ color: '#98ADB3', marginTop: 2, fontSize: 12 }}>{subtitle}</Text>
      </View>
    </Pressable>
  )
}

function MicroGraphCard({ title, value, bars }: { title: string; value: string; bars: number[] }) {
  return (
    <View style={{ flex: 1, backgroundColor: '#13292D', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', padding: 10 }}>
      <Text style={{ color: '#8FA6AC', fontSize: 11, fontWeight: '700' }}>{title}</Text>
      <Text style={{ color: '#F8FCFB', fontWeight: '900', marginTop: 5 }}>{value}</Text>
      <View style={{ marginTop: 10, height: 36, flexDirection: 'row', alignItems: 'flex-end', gap: 4 }}>
        {bars.map((b, i) => (
          <View key={`${title}-${i}`} style={{ flex: 1, height: b, borderRadius: 3, backgroundColor: i === 2 ? '#0DDEF2' : 'rgba(13,223,242,0.28)' }} />
        ))}
      </View>
    </View>
  )
}

function DarkTimeRow({ label, value, onPress }: { label: string; value: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        borderRadius: 10,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        backgroundColor: '#102428',
        paddingHorizontal: 12,
        paddingVertical: 12,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}
    >
      <Text style={{ color: '#9CB2B8', fontWeight: '700' }}>{label}</Text>
      <Text style={{ color: '#F8FCFB', fontWeight: '900' }}>{value}</Text>
    </Pressable>
  )
}

function StaticDarkRow({ label, value }: { label: string; value: string }) {
  return (
    <View
      style={{
        borderRadius: 10,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        backgroundColor: '#102428',
        paddingHorizontal: 12,
        paddingVertical: 12,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}
    >
      <Text style={{ color: '#9CB2B8', fontWeight: '700' }}>{label}</Text>
      <Text style={{ color: '#F8FCFB', fontWeight: '900', marginLeft: 8, flexShrink: 1, textAlign: 'right' }}>{value}</Text>
    </View>
  )
}
