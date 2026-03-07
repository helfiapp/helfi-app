import AsyncStorage from '@react-native-async-storage/async-storage'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'

import { API_BASE_URL } from '../config'
import { NATIVE_WEB_PAGES } from '../config/nativePageRoutes'
import { useAppMode } from '../state/AppModeContext'
import { Screen } from '../ui/Screen'
import { theme } from '../ui/theme'

type TipItem = {
  id: string
  tipDate: string
  sentAt: string
  title: string
  body: string
  category: string
  safetyNote?: string
  suggestedQuestions?: string[]
}

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
}

type TipBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'label'; label: string; text: string }
  | { type: 'list'; items: string[] }

const CLEARED_TIPS_KEY = 'helfi:health-tips:cleared'

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

function TabButton({
  label,
  active,
  onPress,
}: {
  label: string
  active: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        paddingVertical: 11,
        borderBottomWidth: 2,
        borderBottomColor: active ? theme.colors.primary : 'transparent',
        alignItems: 'center',
      }}
    >
      <Text style={{ color: active ? theme.colors.primary : theme.colors.muted, fontWeight: '800' }}>
        {label}
      </Text>
    </Pressable>
  )
}

const splitSentences = (value: string) => {
  const matches = value.match(/[^.!?]+[.!?]+|[^.!?]+$/g)
  if (!matches) return [value]
  return matches.map((part) => part.trim()).filter(Boolean)
}

const buildTipBlocks = (body: string): TipBlock[] => {
  const cleaned = String(body || '').replace(/\r\n/g, '\n').trim()
  if (!cleaned) return []

  const rawLines = cleaned
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  const lines = rawLines.length > 1 ? rawLines : splitSentences(cleaned)

  const blocks: TipBlock[] = []
  let listItems: string[] = []

  const flushList = () => {
    if (listItems.length) {
      blocks.push({ type: 'list', items: listItems })
      listItems = []
    }
  }

  for (const line of lines) {
    const bulletMatch = line.match(/^[-*]\s+(.*)$/)
    if (bulletMatch) {
      listItems.push(bulletMatch[1].trim())
      continue
    }

    flushList()

    const labelMatch = line.match(/^([A-Za-z][A-Za-z ]{0,18}):\s+(.*)$/)
    if (labelMatch) {
      blocks.push({ type: 'label', label: labelMatch[1], text: labelMatch[2].trim() })
      continue
    }

    blocks.push({ type: 'paragraph', text: line })
  }

  flushList()
  return blocks
}

const normalizeTipTitle = (title: string) =>
  String(title || '').replace(/^Smart Health Coach:\s*/i, 'Health Coach: ')

export function SmartHealthCoachScreen({ route, navigation }: { route: any; navigation: any }) {
  const { mode, session } = useAppMode()
  const initialTab: 'today' | 'history' = route?.params?.tab === 'history' ? 'history' : 'today'

  const [activeTab, setActiveTab] = useState<'today' | 'history'>(initialTab)
  const [expandedHistoryTipId, setExpandedHistoryTipId] = useState<string | null>(null)
  const [historySelectMode, setHistorySelectMode] = useState(false)
  const [selectedHistoryTipIds, setSelectedHistoryTipIds] = useState<string[]>([])
  const [deletingHistory, setDeletingHistory] = useState(false)

  const [tipsToday, setTipsToday] = useState<TipItem[]>([])
  const [tipsHistory, setTipsHistory] = useState<TipItem[]>([])
  const [loadingTips, setLoadingTips] = useState(true)
  const [loadingHistory, setLoadingHistory] = useState(false)

  const [loadingSettings, setLoadingSettings] = useState(true)
  const [savingSettings, setSavingSettings] = useState(false)
  const [showEnableModal, setShowEnableModal] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)

  const [enabled, setEnabled] = useState(false)
  const [timezone, setTimezone] = useState('UTC')
  const [frequency, setFrequency] = useState(1)
  const [time1, setTime1] = useState('11:30')
  const [time2, setTime2] = useState('15:30')
  const [time3, setTime3] = useState('20:30')
  const [focusFood, setFocusFood] = useState(true)
  const [focusSupplements, setFocusSupplements] = useState(true)
  const [focusLifestyle, setFocusLifestyle] = useState(true)

  const [creditsRemaining, setCreditsRemaining] = useState(0)
  const [usageFillPct, setUsageFillPct] = useState(0)

  const [timezoneOptions, setTimezoneOptions] = useState<string[]>(fallbackTimezones)
  const [timezoneQuery, setTimezoneQuery] = useState('')
  const [showTimezoneDropdown, setShowTimezoneDropdown] = useState(false)

  const [clearedTipIds, setClearedTipIds] = useState<string[]>([])

  const snapshotRef = useRef('')
  const dirtyRef = useRef(false)
  const settingsRef = useRef<HealthTipSettings>({
    enabled: false,
    time1: '11:30',
    time2: '15:30',
    time3: '20:30',
    timezone: 'UTC',
    frequency: 1,
    focusFood: true,
    focusSupplements: true,
    focusLifestyle: true,
  })

  const authHeaders = useMemo(() => {
    if (!session?.token) return null
    return {
      Authorization: `Bearer ${session.token}`,
      'x-native-token': session.token,
      'cache-control': 'no-store',
    }
  }, [session?.token])

  const clearedTipIdsSet = useMemo(() => new Set(clearedTipIds), [clearedTipIds])

  const filteredTimezones = useMemo(() => {
    const query = timezoneQuery.trim().toLowerCase()
    if (!query) return timezoneOptions.slice(0, 50)
    return timezoneOptions.filter((tz) => tz.toLowerCase().includes(query)).slice(0, 50)
  }, [timezoneOptions, timezoneQuery])

  const sortedTodayTips = useMemo(
    () => [...tipsToday].sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime()),
    [tipsToday]
  )

  const filteredTodayTips = useMemo(
    () => sortedTodayTips.filter((tip) => !clearedTipIdsSet.has(tip.id)),
    [sortedTodayTips, clearedTipIdsSet]
  )

  const visibleTodayTips = filteredTodayTips.slice(0, 2)
  const hasMoreTodayTips = filteredTodayTips.length > 2

  const visibleHistoryTips = useMemo(
    () => [...tipsHistory].sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime()),
    [tipsHistory]
  )
  const selectedHistorySet = useMemo(() => new Set(selectedHistoryTipIds), [selectedHistoryTipIds])

  const loadTimezones = useCallback(() => {
    try {
      const anyIntl = Intl as any
      if (anyIntl && typeof anyIntl.supportedValuesOf === 'function') {
        const supported = anyIntl.supportedValuesOf('timeZone') as string[]
        if (Array.isArray(supported) && supported.length > 0) {
          setTimezoneOptions([...supported].sort((a, b) => a.localeCompare(b)))
          return
        }
      }
    } catch {
      // Use fallback list below
    }
    setTimezoneOptions(fallbackTimezones)
  }, [])

  const applySettings = useCallback(
    (data: Partial<HealthTipSettings>, options?: { setSnapshot?: boolean }) => {
      const next: HealthTipSettings = {
        enabled: !!data.enabled,
        time1: String(data.time1 || '11:30'),
        time2: String(data.time2 || '15:30'),
        time3: String(data.time3 || '20:30'),
        timezone: String(data.timezone || 'UTC'),
        frequency: Math.max(1, Math.min(3, Number(data.frequency) || 1)),
        focusFood: data.focusFood !== false,
        focusSupplements: data.focusSupplements !== false,
        focusLifestyle: data.focusLifestyle !== false,
      }

      setEnabled(next.enabled)
      setTime1(next.time1)
      setTime2(next.time2)
      setTime3(next.time3)
      setTimezone(next.timezone)
      setTimezoneQuery(next.timezone)
      setFrequency(next.frequency)
      setFocusFood(next.focusFood)
      setFocusSupplements(next.focusSupplements)
      setFocusLifestyle(next.focusLifestyle)

      settingsRef.current = next

      if (options?.setSnapshot) {
        snapshotRef.current = JSON.stringify(next)
        dirtyRef.current = false
        setHasUnsavedChanges(false)
      }
    },
    []
  )

  const loadTodayTips = useCallback(async () => {
    if (!authHeaders) return
    try {
      setLoadingTips(true)
      const res = await fetch(`${API_BASE_URL}/api/health-tips/today`, { headers: authHeaders })
      const data: any = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || data?.detail || 'Could not load today alerts')
      setTipsToday(Array.isArray(data?.tips) ? data.tips : [])
    } catch (e: any) {
      Alert.alert('Could not load today alerts', e?.message || 'Please try again.')
      setTipsToday([])
    } finally {
      setLoadingTips(false)
    }
  }, [authHeaders])

  const loadHistoryTips = useCallback(async () => {
    if (!authHeaders) return
    try {
      setLoadingHistory(true)
      const res = await fetch(`${API_BASE_URL}/api/health-tips/history`, { headers: authHeaders })
      const data: any = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || data?.detail || 'Could not load tip history')
      setTipsHistory(Array.isArray(data?.tips) ? data.tips : [])
    } catch (e: any) {
      Alert.alert('Could not load history', e?.message || 'Please try again.')
      setTipsHistory([])
    } finally {
      setLoadingHistory(false)
    }
  }, [authHeaders])

  const loadSettings = useCallback(async () => {
    if (!authHeaders) return
    try {
      setLoadingSettings(true)
      const res = await fetch(`${API_BASE_URL}/api/health-tips/settings`, { headers: authHeaders })
      const data: any = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data?.error || data?.detail || 'Could not load Health Coach settings')
      }
      applySettings(data, { setSnapshot: true })
    } catch (e: any) {
      Alert.alert('Could not load settings', e?.message || 'Please try again.')
    } finally {
      setLoadingSettings(false)
    }
  }, [authHeaders, applySettings])

  const loadCredits = useCallback(async () => {
    if (!authHeaders) return
    try {
      const res = await fetch(`${API_BASE_URL}/api/credit/status`, { headers: authHeaders })
      const data: any = await res.json().catch(() => ({}))
      if (!res.ok) return

      const totalRaw = Number(data?.credits?.total)
      const total = Number.isFinite(totalRaw) ? Math.max(0, Math.round(totalRaw)) : 0
      const percentUsedRaw = Number(data?.percentUsed)
      const percentUsed = Number.isFinite(percentUsedRaw)
        ? Math.max(0, Math.min(100, percentUsedRaw))
        : 0

      setCreditsRemaining(total)
      setUsageFillPct(Math.max(0, Math.min(1, 1 - percentUsed / 100)))
    } catch {
      // Keep existing values if request fails.
    }
  }, [authHeaders])

  const saveSettings = useCallback(
    async (options?: { silent?: boolean; payload?: HealthTipSettings; acceptPricingTerms?: boolean }) => {
      if (!authHeaders) return false
      const payload = options?.payload || settingsRef.current

      if (!options?.silent) setSavingSettings(true)

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
          throw new Error(data?.error || data?.detail || 'Failed to save Health Coach settings')
        }

        snapshotRef.current = JSON.stringify(payload)
        dirtyRef.current = false
        setHasUnsavedChanges(false)

        if (!options?.silent) {
          Alert.alert('Saved', 'Health Coach settings saved.')
        }

        return true
      } catch (e: any) {
        if (!options?.silent) {
          Alert.alert('Save failed', e?.message || 'Please try again.')
        }
        return false
      } finally {
        if (!options?.silent) setSavingSettings(false)
      }
    },
    [authHeaders]
  )

  const loadClearedTips = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(CLEARED_TIPS_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        setClearedTipIds(parsed.filter((id) => typeof id === 'string' && id.trim().length > 0))
      }
    } catch {
      // Ignore storage read failures.
    }
  }, [])

  const handleClearTip = useCallback(async (tipId: string) => {
    if (!tipId) return
    const next = Array.from(new Set([...clearedTipIds, tipId]))
    setClearedTipIds(next)
    try {
      await AsyncStorage.setItem(CLEARED_TIPS_KEY, JSON.stringify(next))
    } catch {
      // Ignore storage write failures.
    }
  }, [clearedTipIds])

  const handleToggleHistorySelection = useCallback((tipId: string) => {
    setSelectedHistoryTipIds((prev) => {
      if (prev.includes(tipId)) {
        return prev.filter((id) => id !== tipId)
      }
      return [...prev, tipId]
    })
  }, [])

  const handleDeleteSelectedHistory = useCallback(async () => {
    if (!selectedHistoryTipIds.length || deletingHistory || !authHeaders) return

    const confirmed = await new Promise<boolean>((resolve) => {
      Alert.alert(
        'Delete selected history?',
        `Delete ${selectedHistoryTipIds.length} selected history item(s)?`,
        [
          { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Delete', style: 'destructive', onPress: () => resolve(true) },
        ]
      )
    })
    if (!confirmed) return

    setDeletingHistory(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/health-tips/history`, {
        method: 'DELETE',
        headers: {
          ...authHeaders,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ ids: selectedHistoryTipIds }),
      })
      const data: any = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data?.error || data?.detail || 'Could not delete selected history')
      }

      const deletedIds = Array.isArray(data?.deletedIds)
        ? data.deletedIds.filter((value: unknown): value is string => typeof value === 'string')
        : selectedHistoryTipIds

      setTipsHistory((prev) => prev.filter((tip) => !deletedIds.includes(tip.id)))
      if (expandedHistoryTipId && deletedIds.includes(expandedHistoryTipId)) {
        setExpandedHistoryTipId(null)
      }
      setSelectedHistoryTipIds([])
      setHistorySelectMode(false)
    } catch (e: any) {
      Alert.alert('Delete failed', e?.message || 'Please try again.')
    } finally {
      setDeletingHistory(false)
    }
  }, [authHeaders, deletingHistory, expandedHistoryTipId, selectedHistoryTipIds])

  const openAskAi = useCallback((_tip: TipItem) => {
    const chatRoute = NATIVE_WEB_PAGES.talkToHelfi
    const parent = navigation.getParent?.()
    if (parent?.navigate) {
      parent.navigate('NativeWebTool', {
        title: chatRoute.title,
        path: chatRoute.path,
      })
      return
    }
    navigation.navigate?.('NativeWebTool', {
      title: chatRoute.title,
      path: chatRoute.path,
    })
  }, [navigation])

  const onToggleEnabled = useCallback(
    (next: boolean) => {
      if (next && !enabled) {
        setShowEnableModal(true)
        return
      }
      setEnabled(next)
    },
    [enabled]
  )

  const confirmEnableSmartCoach = useCallback(async () => {
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
      Alert.alert('Health Coach enabled.')
    } else {
      setEnabled(false)
    }
  }, [saveSettings])

  const onSavePress = useCallback(async () => {
    await saveSettings()
    await loadCredits()
  }, [saveSettings, loadCredits])

  const renderTipBody = useCallback((tip: TipItem) => {
    const blocks = buildTipBlocks(tip.body || '')
    if (blocks.length === 0) {
      return <Text style={{ color: theme.colors.text, lineHeight: 20 }}>{tip.body}</Text>
    }

    return (
      <View style={{ gap: 8 }}>
        {blocks.map((block, index) => {
          if (block.type === 'list') {
            return (
              <View key={`list-${tip.id}-${index}`} style={{ gap: 6, paddingLeft: 10 }}>
                {block.items.map((item, itemIndex) => (
                  <View
                    key={`item-${tip.id}-${index}-${itemIndex}`}
                    style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}
                  >
                    <Text style={{ color: theme.colors.text }}>{'•'}</Text>
                    <Text style={{ flex: 1, color: theme.colors.text, lineHeight: 20 }}>{item}</Text>
                  </View>
                ))}
              </View>
            )
          }

          if (block.type === 'label') {
            return (
              <Text key={`label-${tip.id}-${index}`} style={{ color: theme.colors.text, lineHeight: 20 }}>
                <Text style={{ fontWeight: '900' }}>{block.label}: </Text>
                {block.text}
              </Text>
            )
          }

          return (
            <Text key={`para-${tip.id}-${index}`} style={{ color: theme.colors.text, lineHeight: 20 }}>
              {block.text}
            </Text>
          )
        })}
      </View>
    )
  }, [])

  useEffect(() => {
    const nextTab: 'today' | 'history' = route?.params?.tab === 'history' ? 'history' : 'today'
    setActiveTab(nextTab)
    if (nextTab !== 'history') {
      setHistorySelectMode(false)
      setSelectedHistoryTipIds([])
    }
  }, [route?.params?.tab])

  useEffect(() => {
    const nextSettings = {
      enabled,
      time1,
      time2,
      time3,
      timezone,
      frequency,
      focusFood,
      focusSupplements,
      focusLifestyle,
    }

    settingsRef.current = nextSettings

    if (loadingSettings || !snapshotRef.current) return

    const snapshot = JSON.stringify(nextSettings)
    const dirty = snapshot !== snapshotRef.current
    dirtyRef.current = dirty
    setHasUnsavedChanges(dirty)
  }, [
    enabled,
    time1,
    time2,
    time3,
    timezone,
    frequency,
    focusFood,
    focusSupplements,
    focusLifestyle,
    loadingSettings,
  ])

  useFocusEffect(
    useCallback(() => {
      if (mode !== 'signedIn' || !authHeaders) return

      loadTimezones()
      void loadTodayTips()
      void loadSettings()
      void loadCredits()
      void loadClearedTips()

      if (activeTab === 'history') {
        void loadHistoryTips()
      }

      return () => {
        if (!dirtyRef.current) return
        void saveSettings({ silent: true, payload: settingsRef.current })
      }
    }, [
      mode,
      authHeaders,
      activeTab,
      loadTimezones,
      loadTodayTips,
      loadSettings,
      loadCredits,
      loadClearedTips,
      loadHistoryTips,
      saveSettings,
    ])
  )

  useFocusEffect(
    useCallback(() => {
      if (mode !== 'signedIn' || !authHeaders) return
      if (activeTab !== 'history') return
      void loadHistoryTips()
    }, [mode, authHeaders, activeTab, loadHistoryTips])
  )

  if (mode !== 'signedIn') {
    return (
      <Screen style={{ alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ color: theme.colors.muted }}>Please log in again to open Health Coach.</Text>
      </Screen>
    )
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: theme.spacing.xl }}>
        <View
          style={{
            borderWidth: 1,
            borderColor: theme.colors.border,
            borderRadius: theme.radius.lg,
            backgroundColor: theme.colors.card,
          }}
        >
          <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
            <TabButton
              label="Today's Tips"
              active={activeTab === 'today'}
              onPress={() => {
                setActiveTab('today')
                setExpandedHistoryTipId(null)
                setHistorySelectMode(false)
                setSelectedHistoryTipIds([])
              }}
            />
            <TabButton
              label="Tip History"
              active={activeTab === 'history'}
              onPress={() => {
                setActiveTab('history')
                setHistorySelectMode(false)
                setSelectedHistoryTipIds([])
              }}
            />
          </View>

          <View style={{ padding: 16 }}>
            {activeTab === 'today' ? (
              <>
                <Text style={{ fontSize: 22, fontWeight: '900', color: theme.colors.text, lineHeight: 28 }}>
                  Today's Health Coach alerts
                </Text>
                <Text style={{ marginTop: 8, color: theme.colors.muted, lineHeight: 19 }}>
                  When you receive a Health Coach alert and tap it, you'll land here to see the
                  full message and any others sent today.
                </Text>

                {loadingTips ? (
                  <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 18 }}>
                    <ActivityIndicator color={theme.colors.primary} />
                  </View>
                ) : filteredTodayTips.length === 0 ? (
                  <View
                    style={{
                      marginTop: 14,
                      borderWidth: 1,
                      borderColor: '#CBD5E1',
                      borderStyle: 'dashed',
                      borderRadius: 12,
                      padding: 12,
                    }}
                  >
                    <Text style={{ color: theme.colors.muted, lineHeight: 19 }}>
                      {tipsToday.length === 0
                        ? "No Health Coach alerts have been sent yet today. Once enabled, alerts that match your logs will show here."
                        : "You cleared today’s tips. They’re still saved in your tip history."}
                    </Text>
                  </View>
                ) : (
                  <View style={{ marginTop: 14, gap: 12 }}>
                    {visibleTodayTips.map((tip) => (
                      <View
                        key={tip.id}
                        style={{
                          borderWidth: 1,
                          borderColor: theme.colors.border,
                          borderRadius: 12,
                          padding: 12,
                          gap: 10,
                        }}
                      >
                        <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 16 }}>
                          {normalizeTipTitle(tip.title)}
                        </Text>

                        <View>{renderTipBody(tip)}</View>

                        {tip.safetyNote && tip.safetyNote.trim().length > 0 ? (
                          <View
                            style={{
                              borderRadius: 8,
                              borderWidth: 1,
                              borderColor: '#FCD38D',
                              backgroundColor: '#FFFBEB',
                              paddingHorizontal: 10,
                              paddingVertical: 8,
                            }}
                          >
                            <Text style={{ color: '#92400E', fontSize: 12, lineHeight: 18 }}>
                              <Text style={{ fontWeight: '900' }}>Safety note: </Text>
                              {tip.safetyNote}
                            </Text>
                          </View>
                        ) : null}

                        <View
                          style={{
                            borderTopWidth: 1,
                            borderTopColor: theme.colors.border,
                            paddingTop: 10,
                            gap: 10,
                          }}
                        >
                          <Text style={{ color: theme.colors.muted, fontSize: 12 }}>
                            Do you have any questions about this tip?
                          </Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                            <Pressable
                              onPress={() => openAskAi(tip)}
                              style={({ pressed }) => ({
                                opacity: pressed ? 0.9 : 1,
                                backgroundColor: theme.colors.primary,
                                borderRadius: theme.radius.md,
                                paddingHorizontal: 14,
                                paddingVertical: 9,
                              })}
                            >
                              <Text style={{ color: theme.colors.primaryText, fontWeight: '900' }}>Ask AI</Text>
                            </Pressable>

                            <Pressable onPress={() => void handleClearTip(tip.id)}>
                              <Text style={{ color: theme.colors.muted, fontSize: 12 }}>Clear from today</Text>
                            </Pressable>
                          </View>
                        </View>
                      </View>
                    ))}

                    {hasMoreTodayTips ? (
                      <Pressable
                        onPress={() => setActiveTab('history')}
                        style={({ pressed }) => ({
                          opacity: pressed ? 0.92 : 1,
                          borderWidth: 1,
                          borderColor: '#86EFAC',
                          borderRadius: 10,
                          paddingVertical: 10,
                          alignItems: 'center',
                          backgroundColor: '#ECFDF5',
                        })}
                      >
                        <Text style={{ color: theme.colors.primary, fontWeight: '700' }}>View more tips</Text>
                      </Pressable>
                    ) : null}
                  </View>
                )}
              </>
            ) : (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 22, fontWeight: '900', color: theme.colors.text, lineHeight: 28 }}>
                      Past Health Coach alerts
                    </Text>
                    <Text style={{ marginTop: 8, color: theme.colors.muted, lineHeight: 19 }}>
                      Scroll back through previous days to revisit useful Health Coach alerts.
                    </Text>
                  </View>
                  {visibleHistoryTips.length > 0 ? (
                    <Pressable
                      onPress={() => {
                        setHistorySelectMode((prev) => !prev)
                        setSelectedHistoryTipIds([])
                      }}
                      style={({ pressed }) => ({
                        opacity: pressed ? 0.9 : 1,
                        borderWidth: 1,
                        borderColor: theme.colors.border,
                        borderRadius: 8,
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                      })}
                    >
                      <Text style={{ color: theme.colors.text, fontWeight: '700', fontSize: 12 }}>
                        {historySelectMode ? 'Done' : 'Select'}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>

                {historySelectMode && selectedHistoryTipIds.length > 0 ? (
                  <View style={{ marginTop: 12, flexDirection: 'row', gap: 8 }}>
                    <Pressable
                      onPress={() => void handleDeleteSelectedHistory()}
                      disabled={deletingHistory}
                      style={({ pressed }) => ({
                        opacity: deletingHistory ? 0.6 : pressed ? 0.9 : 1,
                        backgroundColor: '#DC2626',
                        borderRadius: 8,
                        paddingHorizontal: 10,
                        paddingVertical: 7,
                      })}
                    >
                      <Text style={{ color: '#fff', fontSize: 12, fontWeight: '900' }}>
                        {deletingHistory
                          ? 'Deleting...'
                          : `Delete selected (${selectedHistoryTipIds.length})`}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setSelectedHistoryTipIds([])}
                      style={({ pressed }) => ({
                        opacity: pressed ? 0.9 : 1,
                        borderWidth: 1,
                        borderColor: theme.colors.border,
                        borderRadius: 8,
                        paddingHorizontal: 10,
                        paddingVertical: 7,
                      })}
                    >
                      <Text style={{ color: theme.colors.text, fontSize: 12, fontWeight: '700' }}>
                        Clear selection
                      </Text>
                    </Pressable>
                  </View>
                ) : null}

                {loadingHistory ? (
                  <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 18 }}>
                    <ActivityIndicator color={theme.colors.primary} />
                  </View>
                ) : visibleHistoryTips.length === 0 ? (
                  <View
                    style={{
                      marginTop: 14,
                      borderWidth: 1,
                      borderColor: '#CBD5E1',
                      borderStyle: 'dashed',
                      borderRadius: 12,
                      padding: 12,
                    }}
                  >
                    <Text style={{ color: theme.colors.muted, lineHeight: 19 }}>
                      No Health Coach alerts have been recorded yet. Once alerts are sent, they will
                      appear here.
                    </Text>
                  </View>
                ) : (
                  <View style={{ marginTop: 14, gap: 12 }}>
                    {visibleHistoryTips.map((tip) => {
                      const isExpanded = expandedHistoryTipId === tip.id
                      const isSelected = selectedHistorySet.has(tip.id)
                      return (
                        <View
                          key={tip.id}
                          style={{
                            borderWidth: 1,
                            borderColor: theme.colors.border,
                            borderRadius: 12,
                            overflow: 'hidden',
                          }}
                        >
                          <Pressable
                            onPress={() => {
                              if (historySelectMode) {
                                handleToggleHistorySelection(tip.id)
                                return
                              }
                              setExpandedHistoryTipId(isExpanded ? null : tip.id)
                            }}
                            style={({ pressed }) => ({
                              opacity: pressed ? 0.95 : 1,
                              paddingHorizontal: 12,
                              paddingVertical: 11,
                            })}
                          >
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                                {historySelectMode ? (
                                  <View
                                    style={{
                                      width: 16,
                                      height: 16,
                                      borderRadius: 4,
                                      borderWidth: 1,
                                      borderColor: isSelected ? theme.colors.primary : '#94A3B8',
                                      backgroundColor: isSelected ? theme.colors.primary : 'transparent',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                    }}
                                  >
                                    {isSelected ? (
                                      <Text style={{ color: '#fff', fontSize: 10, fontWeight: '900' }}>✓</Text>
                                    ) : null}
                                  </View>
                                ) : null}
                                <Text
                                  style={{ flex: 1, color: theme.colors.text, fontWeight: '800' }}
                                  numberOfLines={1}
                                >
                                  {normalizeTipTitle(tip.title)}
                                </Text>
                              </View>
                              <Text style={{ color: theme.colors.muted, fontSize: 12 }}>
                                {tip.tipDate ? String(tip.tipDate).slice(0, 10) : 'Unknown date'}
                              </Text>
                            </View>
                          </Pressable>

                          {isExpanded && !historySelectMode ? (
                            <View
                              style={{
                                borderTopWidth: 1,
                                borderTopColor: theme.colors.border,
                                paddingHorizontal: 12,
                                paddingVertical: 10,
                                gap: 10,
                              }}
                            >
                              <View>{renderTipBody(tip)}</View>

                              {tip.safetyNote && tip.safetyNote.trim().length > 0 ? (
                                <View
                                  style={{
                                    borderRadius: 8,
                                    borderWidth: 1,
                                    borderColor: '#FCD38D',
                                    backgroundColor: '#FFFBEB',
                                    paddingHorizontal: 10,
                                    paddingVertical: 8,
                                  }}
                                >
                                  <Text style={{ color: '#92400E', fontSize: 12, lineHeight: 18 }}>
                                    <Text style={{ fontWeight: '900' }}>Safety note: </Text>
                                    {tip.safetyNote}
                                  </Text>
                                </View>
                              ) : null}

                              <View
                                style={{
                                  borderTopWidth: 1,
                                  borderTopColor: theme.colors.border,
                                  paddingTop: 10,
                                  gap: 10,
                                }}
                              >
                                <Text style={{ color: theme.colors.muted, fontSize: 12 }}>
                                  Do you have any questions about this tip?
                                </Text>
                                <View style={{ alignItems: 'flex-end' }}>
                                  <Pressable
                                    onPress={() => openAskAi(tip)}
                                    style={({ pressed }) => ({
                                      opacity: pressed ? 0.9 : 1,
                                      backgroundColor: theme.colors.primary,
                                      borderRadius: theme.radius.md,
                                      paddingHorizontal: 14,
                                      paddingVertical: 9,
                                    })}
                                  >
                                    <Text style={{ color: theme.colors.primaryText, fontWeight: '900' }}>
                                      Ask AI
                                    </Text>
                                  </Pressable>
                                </View>
                              </View>
                            </View>
                          ) : null}
                        </View>
                      )
                    })}
                  </View>
                )}
              </>
            )}
          </View>
        </View>

        <View
          style={{
            marginTop: 12,
            backgroundColor: theme.colors.card,
            borderWidth: 1,
            borderColor: theme.colors.border,
            borderRadius: theme.radius.lg,
            padding: 16,
            gap: 12,
          }}
        >
          <Text style={{ fontSize: 22, fontWeight: '900', color: theme.colors.text, lineHeight: 28 }}>
            Health Coach settings
          </Text>
          <Text style={{ color: theme.colors.muted, lineHeight: 19 }}>
            Health Coach checks your logs and can send proactive alerts. Charges only apply when
            an alert is actually sent.
          </Text>
          <Text style={{ color: theme.colors.muted }}>
            Cost: 10 credits per alert. Daily cap: 50 credits (max 5 charged alerts).
          </Text>

          <View style={{ gap: 6 }}>
            <Text style={{ color: theme.colors.muted, fontWeight: '700', fontSize: 12 }}>Credits remaining</Text>
            <View
              style={{
                height: 10,
                borderRadius: 999,
                backgroundColor: '#E5E7EB',
                overflow: 'hidden',
              }}
            >
              <View
                style={{
                  width: `${Math.round(usageFillPct * 100)}%`,
                  height: '100%',
                  backgroundColor: theme.colors.primary,
                }}
              />
            </View>
            <Text style={{ color: theme.colors.text, fontWeight: '900', textAlign: 'right' }}>
              {creditsRemaining.toLocaleString()}
            </Text>
          </View>

          {loadingSettings ? (
            <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 18 }}>
              <ActivityIndicator color={theme.colors.primary} />
            </View>
          ) : (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.colors.text, fontWeight: '800', fontSize: 18 }}>
                    Enable Health Coach
                  </Text>
                  <Text style={{ marginTop: 3, color: theme.colors.muted }}>
                    Get proactive guidance based on your daily logs and habits.
                  </Text>
                </View>
                <Switch value={enabled} onValueChange={onToggleEnabled} />
              </View>

              <Text style={{ color: theme.colors.muted, lineHeight: 20 }}>
                We check your food, water, activity, and mood logs. If we spot patterns like low hydration, poor food balance,
                low activity, or missed check-ins, we may send up to 5 alerts in your local timezone.
              </Text>

              <View style={{ gap: 6 }}>
                <Text style={{ color: theme.colors.text, fontWeight: '800' }}>Timezone</Text>
                <TextInput
                  value={timezoneQuery}
                  onChangeText={(value) => {
                    setTimezoneQuery(value)
                    if (enabled) setShowTimezoneDropdown(true)
                  }}
                  onFocus={() => {
                    if (enabled) setShowTimezoneDropdown(true)
                  }}
                  editable={enabled}
                  autoCapitalize="none"
                  placeholder="Start typing e.g. Australia/Melbourne"
                  placeholderTextColor="#8AA39D"
                  style={{
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    borderRadius: theme.radius.md,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    backgroundColor: theme.colors.card,
                    color: theme.colors.text,
                    opacity: enabled ? 1 : 0.6,
                  }}
                />

                {enabled && showTimezoneDropdown && filteredTimezones.length > 0 ? (
                  <View
                    style={{
                      maxHeight: 220,
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                      borderRadius: 10,
                      overflow: 'hidden',
                    }}
                  >
                    <ScrollView nestedScrollEnabled>
                      {filteredTimezones.map((tzValue) => (
                        <Pressable
                          key={tzValue}
                          onPress={() => {
                            setTimezone(tzValue)
                            setTimezoneQuery(tzValue)
                            setShowTimezoneDropdown(false)
                          }}
                          style={({ pressed }) => ({
                            opacity: pressed ? 0.92 : 1,
                            paddingHorizontal: 12,
                            paddingVertical: 10,
                            borderBottomWidth: 1,
                            borderBottomColor: '#E5E7EB',
                            backgroundColor: theme.colors.card,
                          })}
                        >
                          <Text style={{ color: theme.colors.text, fontSize: 12 }}>{tzValue}</Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  </View>
                ) : null}

                <Text style={{ color: theme.colors.muted, fontSize: 12 }}>
                  Auto-detected from your device. You can still change it here (for example: Australia/Melbourne or America/New_York).
                </Text>
              </View>

              <Pressable
                onPress={() => void onSavePress()}
                disabled={savingSettings}
                style={({ pressed }) => ({
                  opacity: savingSettings ? 0.6 : pressed ? 0.9 : 1,
                  backgroundColor: theme.colors.primary,
                  borderRadius: theme.radius.md,
                  paddingVertical: 12,
                  alignItems: 'center',
                  marginTop: 4,
                })}
              >
                <Text style={{ color: theme.colors.primaryText, fontWeight: '900' }}>
                  {savingSettings ? 'Saving...' : 'Save Health Coach settings'}
                </Text>
              </Pressable>

              {hasUnsavedChanges ? (
                <Text style={{ color: theme.colors.muted, fontSize: 12 }}>
                  Changes save automatically when you leave this page.
                </Text>
              ) : null}

              <Text style={{ color: theme.colors.muted, fontSize: 12, lineHeight: 18 }}>
                Health Coach alerts are educational and do not replace medical advice. Always
                consider your medications, allergies, and personal circumstances, and talk to your
                clinician before making big changes or starting new supplements.
              </Text>
            </>
          )}
        </View>
      </ScrollView>

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
              Enable Health Coach?
            </Text>

            <View style={{ gap: 4 }}>
              <Text style={{ color: theme.colors.muted }}>
                Get proactive health guidance based on your daily logs and habits.
              </Text>
              <Text style={{ color: theme.colors.muted }}>10 credits per alert.</Text>
              <Text style={{ color: theme.colors.muted }}>Up to 50 credits per day.</Text>
              <Text style={{ color: theme.colors.muted }}>
                Charges only apply when an alert is actually sent.
              </Text>
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
                <Text style={{ color: theme.colors.primaryText, fontWeight: '900' }}>
                  Enable Health Coach
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  )
}
