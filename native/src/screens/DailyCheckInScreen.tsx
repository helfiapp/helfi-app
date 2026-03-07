import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import Svg, { Circle, Line as SvgLine, Path, Text as SvgText } from 'react-native-svg'

import { API_BASE_URL } from '../config'
import { useAppMode } from '../state/AppModeContext'
import { Screen } from '../ui/Screen'
import { theme } from '../ui/theme'

type CheckInIssue = {
  id: string
  name: string
  polarity: 'positive' | 'negative'
}

type CheckInRating = {
  issueId: string
  value: number | null
  note?: string
  isNa?: boolean
}

type CheckInHistoryRow = {
  id?: string
  date: string
  timestamp?: string | null
  issueId: string
  name: string
  polarity: 'positive' | 'negative'
  value: number | null
  note?: string
  isNa?: boolean
}

type TabKey = 'today' | 'history'
type PeriodKey = '30d' | '12w' | '12m' | '5y' | 'all'

const LABELS = ['Really bad', 'Bad', 'Below average', 'Average', 'Above average', 'Good', 'Excellent']
const CHART_COLORS = ['#22C55E', '#3B82F6', '#A855F7', '#EC4899', '#F97316', '#EAB308']
const PERIOD_OPTIONS: Array<{ key: PeriodKey; label: string }> = [
  { key: '30d', label: '30 Days' },
  { key: '12w', label: '12 Weeks' },
  { key: '12m', label: '12 Months' },
  { key: '5y', label: '5 Years' },
  { key: 'all', label: 'All Time' },
]

export function DailyCheckInScreen() {
  const { mode, session } = useAppMode()
  const { width: screenWidth } = useWindowDimensions()

  const authHeaders = useMemo(() => {
    if (mode !== 'signedIn' || !session?.token) return null
    return {
      Authorization: `Bearer ${session.token}`,
      'x-native-token': session.token,
      'cache-control': 'no-store',
    }
  }, [mode, session?.token])

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [issues, setIssues] = useState<CheckInIssue[]>([])
  const [ratings, setRatings] = useState<Record<string, number | null>>({})
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [na, setNa] = useState<Record<string, boolean>>({})
  const [detailsOpen, setDetailsOpen] = useState<Record<string, boolean>>({})
  const [activeTab, setActiveTab] = useState<TabKey>('today')

  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyRows, setHistoryRows] = useState<CheckInHistoryRow[]>([])
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const [historyPeriod, setHistoryPeriod] = useState<PeriodKey>('all')
  const [selectedIssues, setSelectedIssues] = useState<string[]>([])
  const [expandedGroupKey, setExpandedGroupKey] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [editingEntry, setEditingEntry] = useState<CheckInHistoryRow | null>(null)
  const [editValue, setEditValue] = useState<number | null>(null)
  const [editNote, setEditNote] = useState('')
  const [historyActionLoading, setHistoryActionLoading] = useState(false)

  const loadToday = useCallback(async () => {
    if (!authHeaders) {
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      const res = await fetch(`${API_BASE_URL}/api/native-checkins-today`, {
        headers: authHeaders,
      })
      const data: any = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String(data?.error || 'Could not load check-in'))

      const nextIssues: CheckInIssue[] = Array.isArray(data?.issues) ? data.issues : []
      const nextRatings: Record<string, number | null> = {}
      const nextNotes: Record<string, string> = {}
      const nextNa: Record<string, boolean> = {}

      const ratingRows: CheckInRating[] = Array.isArray(data?.ratings) ? data.ratings : []
      for (const row of ratingRows) {
        if (!row?.issueId) continue
        nextRatings[row.issueId] = typeof row.value === 'number' ? row.value : null
        nextNotes[row.issueId] = typeof row.note === 'string' ? row.note : ''
        nextNa[row.issueId] = row.isNa === true
      }

      setIssues(nextIssues)
      setRatings(nextRatings)
      setNotes(nextNotes)
      setNa(nextNa)
      const nextDetailsOpen: Record<string, boolean> = {}
      for (const row of ratingRows) {
        if (!row?.issueId) continue
        if (typeof row.note === 'string' && row.note.trim().length > 0) {
          nextDetailsOpen[row.issueId] = true
        }
      }
      setDetailsOpen(nextDetailsOpen)
    } catch (e: any) {
      Alert.alert('Could not load check-in', e?.message || 'Please try again.')
    } finally {
      setLoading(false)
    }
  }, [authHeaders])

  const loadHistory = useCallback(async () => {
    if (!authHeaders) {
      setHistoryLoading(false)
      return
    }

    try {
      setHistoryLoading(true)
      const res = await fetch(`${API_BASE_URL}/api/native-checkins-history`, {
        headers: authHeaders,
      })
      const data: any = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String(data?.error || 'Could not load history'))

      const rows: CheckInHistoryRow[] = Array.isArray(data?.history) ? data.history : []
      setHistoryRows(rows)
      setHistoryLoaded(true)
    } catch (e: any) {
      Alert.alert('Could not load history', e?.message || 'Please try again.')
    } finally {
      setHistoryLoading(false)
    }
  }, [authHeaders])

  useFocusEffect(
    useCallback(() => {
      if (activeTab === 'today') {
        void loadToday()
      } else if (!historyLoaded) {
        void loadHistory()
      }
      return () => {}
    }, [activeTab, historyLoaded, loadHistory, loadToday]),
  )

  const save = async () => {
    if (!authHeaders) return

    try {
      setSaving(true)
      const payload = issues.map((issue) => ({
        issueId: issue.id,
        value: na[issue.id] ? null : ratings[issue.id] ?? null,
        note: notes[issue.id] || '',
        isNa: !!na[issue.id],
      }))

      const res = await fetch(`${API_BASE_URL}/api/native-checkins-today`, {
        method: 'POST',
        headers: {
          ...authHeaders,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ ratings: payload }),
      })

      const data: any = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String(data?.error || 'Could not save check-in'))

      Alert.alert('Saved', 'Today\'s check-in is saved.')
    } catch (e: any) {
      Alert.alert('Save failed', e?.message || 'Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const getQuestion = (issue: CheckInIssue) => {
    const name = String(issue.name || '').trim()
    const isPlural =
      /\b(movements|allergies|bowels|bowel movements)\b/i.test(name) ||
      /[^s]s$/i.test(name)

    if (issue.polarity === 'negative') {
      return `How were your ${issue.name} levels today?`
    }
    return isPlural ? `How were your ${issue.name} today?` : `How was your ${issue.name} today?`
  }

  const getHistoryRatingLabel = (value: number | null) => {
    if (value === null || value === undefined) return 'N/A'
    return LABELS[Math.max(0, Math.min(6, value))]
  }

  const getPeriodStartDate = (period: PeriodKey): Date | null => {
    if (period === 'all') return null
    const now = new Date()
    const start = new Date(now)
    if (period === '30d') start.setDate(now.getDate() - 30)
    if (period === '12w') start.setDate(now.getDate() - 84)
    if (period === '12m') start.setMonth(now.getMonth() - 12)
    if (period === '5y') start.setFullYear(now.getFullYear() - 5)
    return start
  }

  const issueNames = useMemo(() => {
    const names = Array.from(new Set(historyRows.map((row) => row.name).filter(Boolean)))
    return names.sort((a, b) => a.localeCompare(b))
  }, [historyRows])

  useEffect(() => {
    if (issueNames.length === 0) {
      setSelectedIssues([])
      return
    }
    setSelectedIssues((prev) => {
      if (prev.length === 0) return [...issueNames]
      const next = prev.filter((name) => issueNames.includes(name))
      return next.length === 0 ? [...issueNames] : next
    })
  }, [issueNames])

  const filteredHistory = useMemo(() => {
    const periodStart = getPeriodStartDate(historyPeriod)
    const selectedSet = new Set(selectedIssues)
    const showAllIssues = selectedIssues.length === 0 || selectedIssues.length === issueNames.length
    return historyRows.filter((row) => {
      if (!showAllIssues && !selectedSet.has(row.name)) return false
      if (!periodStart) return true
      const timestamp = row.timestamp || `${row.date}T12:00:00Z`
      const rowDate = new Date(timestamp)
      if (Number.isNaN(rowDate.getTime())) return true
      return rowDate >= periodStart
    })
  }, [historyPeriod, historyRows, selectedIssues, issueNames.length])

  const groupedHistory = useMemo(() => {
    const groups: Array<{
      key: string
      dateLabel: string
      timeLabel: string
      entries: CheckInHistoryRow[]
    }> = []
    const indexByKey = new Map<string, number>()

    for (const row of filteredHistory) {
      const ts = row.timestamp ? new Date(row.timestamp) : null
      const hasTs = ts && !Number.isNaN(ts.getTime())
      const key = hasTs
        ? `${ts.getFullYear()}-${ts.getMonth()}-${ts.getDate()}-${ts.getHours()}-${ts.getMinutes()}`
        : row.date
      const dateLabel = hasTs
        ? ts.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
        : row.date
      const timeLabel = hasTs
        ? ts.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
        : ''

      const existingIndex = indexByKey.get(key)
      if (existingIndex === undefined) {
        groups.push({ key, dateLabel, timeLabel, entries: [row] })
        indexByKey.set(key, groups.length - 1)
      } else {
        groups[existingIndex].entries.push(row)
      }
    }

    return groups
  }, [filteredHistory])

  const visibleHistoryRangeLabel = useMemo(() => {
    if (filteredHistory.length === 0) return 'No data available for the selected time period.'

    const timestamps = filteredHistory
      .map((row) => {
        const parsed = row.timestamp ? new Date(row.timestamp) : new Date(`${row.date}T12:00:00`)
        return Number.isNaN(parsed.getTime()) ? null : parsed
      })
      .filter((value): value is Date => value !== null)
      .sort((a, b) => a.getTime() - b.getTime())

    if (timestamps.length === 0) return 'No data available for the selected time period.'

    const first = timestamps[0]
    const last = timestamps[timestamps.length - 1]
    const formatDate = (value: Date) =>
      value.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      })

    const firstLabel = formatDate(first)
    const lastLabel = formatDate(last)

    if (firstLabel === lastLabel) {
      return `Showing data for ${firstLabel}`
    }

    return `Showing data from ${firstLabel} to ${lastLabel}`
  }, [filteredHistory])

  useEffect(() => {
    setPage(1)
  }, [groupedHistory.length, historyPeriod, selectedIssues])

  const pageSize = 10
  const totalPages = Math.max(1, Math.ceil(groupedHistory.length / pageSize))
  const pageStart = groupedHistory.length === 0 ? 0 : (page - 1) * pageSize + 1
  const pageEnd = Math.min(page * pageSize, groupedHistory.length)
  const pagedGroups = groupedHistory.slice((page - 1) * pageSize, page * pageSize)

  const refreshHistory = async () => {
    await loadHistory()
  }

  const deleteEntry = async (entry: CheckInHistoryRow) => {
    if (!authHeaders) return
    try {
      setHistoryActionLoading(true)
      const params = new URLSearchParams({ date: entry.date, issueId: entry.issueId })
      const res = await fetch(`${API_BASE_URL}/api/native-checkins-ratings?${params.toString()}`, {
        method: 'DELETE',
        headers: authHeaders,
      })
      const data: any = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String(data?.error || 'Could not delete rating'))
      await refreshHistory()
    } catch (e: any) {
      Alert.alert('Delete failed', e?.message || 'Please try again.')
    } finally {
      setHistoryActionLoading(false)
    }
  }

  const openEditModal = (entry: CheckInHistoryRow) => {
    setEditingEntry(entry)
    setEditValue(entry.value)
    setEditNote(entry.note || '')
  }

  const saveEdit = async () => {
    if (!authHeaders || !editingEntry) return
    try {
      setHistoryActionLoading(true)
      const res = await fetch(`${API_BASE_URL}/api/native-checkins-ratings`, {
        method: 'PATCH',
        headers: {
          ...authHeaders,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          date: editingEntry.date,
          issueId: editingEntry.issueId,
          value: editValue,
          note: editNote,
        }),
      })
      const data: any = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String(data?.error || 'Could not update rating'))
      setEditingEntry(null)
      await refreshHistory()
    } catch (e: any) {
      Alert.alert('Save failed', e?.message || 'Please try again.')
    } finally {
      setHistoryActionLoading(false)
    }
  }

  const deleteSelectedIssues = async () => {
    if (!authHeaders) return
    if (selectedIssues.length === 0 || selectedIssues.length === issueNames.length) return
    const issueIds = Array.from(
      new Set(
        filteredHistory
          .filter((row) => selectedIssues.includes(row.name))
          .map((row) => row.issueId)
          .filter(Boolean),
      ),
    )
    if (issueIds.length === 0) return
    try {
      setHistoryActionLoading(true)
      const res = await fetch(`${API_BASE_URL}/api/native-checkins-ratings`, {
        method: 'POST',
        headers: {
          ...authHeaders,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ action: 'delete-by-issues', issueIds }),
      })
      const data: any = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String(data?.error || 'Could not delete selected ratings'))
      setSelectedIssues([...issueNames])
      await refreshHistory()
    } catch (e: any) {
      Alert.alert('Delete failed', e?.message || 'Please try again.')
    } finally {
      setHistoryActionLoading(false)
    }
  }

  const resetAllHistory = async () => {
    if (!authHeaders) return
    try {
      setHistoryActionLoading(true)
      const res = await fetch(`${API_BASE_URL}/api/native-checkins-ratings`, {
        method: 'POST',
        headers: {
          ...authHeaders,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ action: 'delete-all' }),
      })
      const data: any = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String(data?.error || 'Could not reset history'))
      await refreshHistory()
    } catch (e: any) {
      Alert.alert('Reset failed', e?.message || 'Please try again.')
    } finally {
      setHistoryActionLoading(false)
    }
  }

  const chartData = useMemo(() => {
    if (filteredHistory.length === 0) {
      return {
        dates: [] as string[],
        datasets: [] as Array<{ name: string; color: string; values: Array<number | null> }>,
      }
    }

    const dates = Array.from(new Set(filteredHistory.map((row) => row.date))).sort()
    const names = Array.from(new Set(filteredHistory.map((row) => row.name))).sort()
    const datasets = names.map((name, index) => {
      const valueByDate = new Map<string, number | null>()
      for (const row of filteredHistory) {
        if (row.name !== name) continue
        if (!valueByDate.has(row.date)) {
          valueByDate.set(row.date, row.value === null || row.value === undefined ? null : Number(row.value))
        }
      }
      return {
        name,
        color: CHART_COLORS[index % CHART_COLORS.length],
        values: dates.map((date) => valueByDate.get(date) ?? null),
      }
    })

    return { dates, datasets }
  }, [filteredHistory])

  const chartWidth = Math.max(280, Math.min(screenWidth - 56, 640))
  const chartHeight = 220
  const chartPadding = { top: 12, right: 12, bottom: 28, left: 24 }
  const plotWidth = chartWidth - chartPadding.left - chartPadding.right
  const plotHeight = chartHeight - chartPadding.top - chartPadding.bottom

  const xAt = (index: number) => {
    if (chartData.dates.length <= 1) return chartPadding.left
    return chartPadding.left + (index * plotWidth) / (chartData.dates.length - 1)
  }

  const yAt = (value: number) => {
    const clamped = Math.max(0, Math.min(6, value))
    return chartPadding.top + ((6 - clamped) / 6) * plotHeight
  }

  const formatShortDate = (date: string) => {
    const parsed = new Date(`${date}T12:00:00`)
    if (Number.isNaN(parsed.getTime())) return date
    return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }

  const toggleSelectAll = () => {
    setSelectedIssues((prev) => (prev.length === issueNames.length ? [] : [...issueNames]))
  }

  const toggleIssue = (name: string) => {
    setSelectedIssues((prev) => {
      if (prev.includes(name)) {
        return prev.filter((item) => item !== name)
      }
      return [...prev, name]
    })
  }

  const buildLinePath = (values: Array<number | null>) => {
    let path = ''
    values.forEach((value, index) => {
      if (value === null || value === undefined) return
      const x = xAt(index)
      const y = yAt(value)
      if (!path) {
        path += `M ${x} ${y}`
      } else {
        path += ` L ${x} ${y}`
      }
    })
    return path
  }

  const allIssuesSelected = issueNames.length > 0 && selectedIssues.length === issueNames.length
  const currentPeriodLabel = PERIOD_OPTIONS.find((option) => option.key === historyPeriod)?.label || 'All Time'

  const openPeriodPicker = () => {
    const buttons = PERIOD_OPTIONS.map((option) => ({
      text: option.label,
      onPress: () => setHistoryPeriod(option.key),
    }))
    Alert.alert('Select time period', 'Choose the range to view results for.', [
      ...buttons,
      { text: 'Cancel', style: 'cancel' },
    ])
  }

  const onOpenHistory = () => {
    setActiveTab('history')
    if (!historyLoaded && !historyLoading) {
      void loadHistory()
    }
  }

  const onOpenToday = () => {
    setActiveTab('today')
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 28 }}>
        <View style={styles.tabsWrap}>
          <Pressable
            onPress={onOpenToday}
            style={[styles.tabButton, activeTab === 'today' ? styles.tabButtonActive : styles.tabButtonInactive]}
          >
            <Text style={[styles.tabText, activeTab === 'today' ? styles.tabTextActive : styles.tabTextInactive]}>
              Today's Check-in
            </Text>
          </Pressable>
          <Pressable
            onPress={onOpenHistory}
            style={[styles.tabButton, activeTab === 'history' ? styles.tabButtonActive : styles.tabButtonInactive]}
          >
            <Text style={[styles.tabText, activeTab === 'history' ? styles.tabTextActive : styles.tabTextInactive]}>
              Rating History
            </Text>
          </Pressable>
        </View>

        {activeTab === 'today' ? (
          <>
        <View
          style={{
            backgroundColor: theme.colors.card,
            borderWidth: 1,
            borderColor: theme.colors.border,
            borderRadius: theme.radius.lg,
            padding: 14,
          }}
        >
          <Text style={{ fontSize: 30, fontWeight: '900', color: theme.colors.text }}>Today's Check-in</Text>
          <Text style={{ marginTop: 4, color: theme.colors.muted }}>
            Rate how you went today. One tap per item, then Save.
          </Text>
        </View>

        <View style={{ marginTop: 12 }}>
          {loading ? (
            <View style={{ paddingVertical: 40, alignItems: 'center' }}>
              <ActivityIndicator color={theme.colors.primary} />
            </View>
          ) : issues.length === 0 ? (
            <View
              style={{
                backgroundColor: theme.colors.card,
                borderWidth: 1,
                borderColor: theme.colors.border,
                borderRadius: theme.radius.lg,
                padding: 14,
              }}
            >
              <Text style={{ color: theme.colors.muted }}>
                No health issues found yet. Complete Health Setup first.
              </Text>
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              {issues.map((issue) => {
                const selected = ratings[issue.id]
                const question = getQuestion(issue)
                const showDetails = detailsOpen[issue.id] || false

                return (
                  <View
                    key={issue.id}
                    style={{
                      backgroundColor: theme.colors.card,
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                      borderRadius: theme.radius.lg,
                      padding: 12,
                    }}
                  >
                    <Text style={{ color: theme.colors.text, fontWeight: '800', marginBottom: 8 }}>{question}</Text>

                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                      {LABELS.map((label, idx) => {
                        const isSelected = selected === idx && !na[issue.id]
                        return (
                          <Pressable
                            key={`${issue.id}-${idx}`}
                            onPress={() => {
                              setRatings((prev) => {
                                const current = prev[issue.id]
                                const nextValue = current === idx ? null : idx
                                return { ...prev, [issue.id]: nextValue }
                              })
                              setNa((prev) => ({ ...prev, [issue.id]: false }))
                            }}
                            style={{
                              borderWidth: 1,
                              borderColor: isSelected ? '#4CAF50' : theme.colors.border,
                              backgroundColor: isSelected ? '#4CAF50' : theme.colors.card,
                              borderRadius: theme.radius.sm,
                              paddingHorizontal: 10,
                              paddingVertical: 8,
                            }}
                          >
                            <Text style={{ color: isSelected ? '#FFFFFF' : theme.colors.text, fontWeight: '700', fontSize: 12, textAlign: 'center' }}>
                              {label}
                            </Text>
                          </Pressable>
                        )
                      })}
                    </View>

                    <Pressable
                      onPress={() => {
                        setDetailsOpen((prev) => ({ ...prev, [issue.id]: !prev[issue.id] }))
                      }}
                      style={{ marginTop: 10, alignSelf: 'flex-start' }}
                    >
                      <Text style={{ color: theme.colors.muted, fontWeight: '600', fontSize: 14 }}>
                        {showDetails ? '▾ Add details (optional)' : '▸ Add details (optional)'}
                      </Text>
                    </Pressable>

                    {showDetails ? (
                      <TextInput
                        value={notes[issue.id] || ''}
                        onChangeText={(text) => setNotes((prev) => ({ ...prev, [issue.id]: text }))}
                        placeholder="Anything notable today?"
                        placeholderTextColor="#8AA39D"
                        multiline
                        style={{
                          marginTop: 8,
                          borderWidth: 1,
                          borderColor: theme.colors.border,
                          borderRadius: theme.radius.md,
                          backgroundColor: theme.colors.card,
                          color: theme.colors.text,
                          minHeight: 64,
                          paddingHorizontal: 10,
                          paddingVertical: 10,
                          textAlignVertical: 'top',
                        }}
                      />
                    ) : null}

                    <Pressable
                      onPress={() => {
                        const next = !na[issue.id]
                        setNa((prev) => ({ ...prev, [issue.id]: next }))
                        if (next) {
                          setRatings((prev) => ({ ...prev, [issue.id]: null }))
                        }
                      }}
                      style={styles.checkboxRow}
                    >
                      <View style={[styles.checkboxBox, na[issue.id] ? styles.checkboxBoxChecked : null]}>
                        {na[issue.id] ? <Text style={styles.checkboxTick}>✓</Text> : null}
                      </View>
                      <Text style={styles.checkboxLabel}>Not applicable for this time</Text>
                    </Pressable>
                  </View>
                )
              })}

              <Pressable
                onPress={save}
                disabled={saving}
                style={{
                  marginTop: 6,
                  backgroundColor: theme.colors.primary,
                  borderRadius: theme.radius.md,
                  paddingVertical: 13,
                  alignItems: 'center',
                  opacity: saving ? 0.6 : 1,
                }}
              >
                <Text style={{ color: theme.colors.primaryText, fontWeight: '900' }}>{saving ? 'Saving...' : "Save today's ratings"}</Text>
              </Pressable>
            </View>
          )}
        </View>
          </>
        ) : (
          <View
            style={{
              backgroundColor: theme.colors.card,
              borderWidth: 1,
              borderColor: theme.colors.border,
              borderRadius: theme.radius.lg,
              padding: 14,
            }}
          >
            <Text style={{ fontSize: 26, fontWeight: '900', color: theme.colors.text }}>Check-in History</Text>
            <Text style={{ marginTop: 6, color: theme.colors.muted, fontSize: 12 }}>
              Scale: 0 Really bad · 1 Bad · 2 Below average · 3 Average · 4 Above average · 5 Good · 6 Excellent
            </Text>

            {issueNames.length > 0 ? (
              <View style={{ marginTop: 14 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <Text style={{ color: theme.colors.muted, fontWeight: '800', fontSize: 12, textTransform: 'uppercase' }}>
                    Filter by Health Issue
                  </Text>
                  <Pressable onPress={toggleSelectAll}>
                    <Text style={{ color: theme.colors.primary, fontWeight: '700', fontSize: 12 }}>
                      {allIssuesSelected ? 'Deselect All' : 'Select All'}
                    </Text>
                  </Pressable>
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {issueNames.map((name) => {
                    const isActive = selectedIssues.includes(name)
                    return (
                      <Pressable
                        key={name}
                        onPress={() => toggleIssue(name)}
                        style={{
                          borderWidth: 1,
                          borderColor: isActive ? theme.colors.primary : theme.colors.border,
                          backgroundColor: isActive ? '#4CAF50' : theme.colors.card,
                          borderRadius: 999,
                          paddingHorizontal: 12,
                          paddingVertical: 8,
                        }}
                      >
                        <Text style={{ color: isActive ? '#FFFFFF' : theme.colors.text, fontWeight: '700', fontSize: 12 }}>
                          {name}
                        </Text>
                      </Pressable>
                    )
                  })}
                </View>
              </View>
            ) : null}

            <View style={{ marginTop: 24 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 21, flexShrink: 1, paddingRight: 10 }}>
                  Trends Over Time
                </Text>
                <Pressable
                  onPress={openPeriodPicker}
                  style={{
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    borderRadius: 10,
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    minWidth: 112,
                    maxWidth: '100%',
                    backgroundColor: theme.colors.card,
                  }}
                >
                  <Text style={{ color: theme.colors.text, fontWeight: '700', fontSize: 12 }}>
                    {currentPeriodLabel} ▾
                  </Text>
                </Pressable>
              </View>
              <Text style={{ marginTop: 6, color: theme.colors.muted, fontSize: 13 }}>
                Ratings are scored 0 (Really bad) to 6 (Excellent).
              </Text>
              <Text style={{ marginTop: 4, color: theme.colors.muted, fontSize: 12 }}>
                {visibleHistoryRangeLabel}
              </Text>

              {chartData.datasets.length > 0 ? (
                <View style={{ marginTop: 10, borderWidth: 1, borderColor: '#E5ECE9', borderRadius: 12, padding: 10, backgroundColor: '#FCFDFC' }}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <Svg width={chartWidth} height={chartHeight}>
                      {[0, 1, 2, 3, 4, 5, 6].map((tick) => (
                        <SvgLine
                          key={`grid-${tick}`}
                          x1={chartPadding.left}
                          x2={chartWidth - chartPadding.right}
                          y1={yAt(tick)}
                          y2={yAt(tick)}
                          stroke="#E6EEEB"
                          strokeWidth={1}
                        />
                      ))}
                      {chartData.datasets.map((dataset) => {
                        const path = buildLinePath(dataset.values)
                        return path ? (
                          <Path
                            key={`line-${dataset.name}`}
                            d={path}
                            fill="none"
                            stroke={dataset.color}
                            strokeWidth={2.5}
                          />
                        ) : null
                      })}
                      {chartData.datasets.map((dataset) =>
                        dataset.values.map((value, index) => {
                          if (value === null || value === undefined) return null
                          return (
                            <Circle
                              key={`point-${dataset.name}-${index}`}
                              cx={xAt(index)}
                              cy={yAt(value)}
                              r={3}
                              fill={dataset.color}
                            />
                          )
                        }),
                      )}
                      {[0, 2, 4, 6].map((tick) => (
                        <SvgText
                          key={`ytick-${tick}`}
                          x={6}
                          y={yAt(tick) + 3}
                          fontSize="10"
                          fill="#6B7F79"
                        >
                          {tick}
                        </SvgText>
                      ))}
                      {chartData.dates.map((date, index) => {
                        if (chartData.dates.length > 8 && index % 2 !== 0) return null
                        return (
                          <SvgText
                            key={`xtick-${date}`}
                            x={xAt(index)}
                            y={chartHeight - 8}
                            fontSize="9"
                            fill="#6B7F79"
                            textAnchor="middle"
                          >
                            {formatShortDate(date)}
                          </SvgText>
                        )
                      })}
                    </Svg>
                  </ScrollView>

                  <View style={{ marginTop: 8, flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
                    {chartData.datasets.map((dataset) => (
                      <View key={`legend-${dataset.name}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <View style={{ width: 8, height: 8, borderRadius: 99, backgroundColor: dataset.color }} />
                        <Text style={{ color: theme.colors.muted, fontSize: 11 }}>{dataset.name}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}
            </View>

            <Pressable
              onPress={() => void refreshHistory()}
              disabled={historyActionLoading}
              style={{
                marginTop: 14,
                alignSelf: 'flex-start',
                borderWidth: 1,
                borderColor: theme.colors.border,
                borderRadius: 999,
                paddingHorizontal: 12,
                paddingVertical: 8,
                opacity: historyActionLoading ? 0.6 : 1,
              }}
            >
              <Text style={{ color: theme.colors.muted, fontWeight: '700', fontSize: 12 }}>
                {historyLoading ? 'Refreshing...' : 'Refresh'}
              </Text>
            </Pressable>

            {selectedIssues.length > 0 && selectedIssues.length < issueNames.length ? (
              <Pressable
                onPress={() =>
                  Alert.alert(
                    'Delete selected',
                    `Delete all ratings for ${selectedIssues.length} selected issue(s)?`,
                    [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Delete', style: 'destructive', onPress: () => void deleteSelectedIssues() },
                    ],
                  )
                }
                disabled={historyActionLoading}
                style={{ marginTop: 8, alignSelf: 'flex-start' }}
              >
                <Text style={{ color: '#DC2626', fontSize: 12, fontWeight: '700' }}>
                  Delete Selected ({selectedIssues.length})
                </Text>
              </Pressable>
            ) : null}

            {historyLoading ? (
              <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                <ActivityIndicator color={theme.colors.primary} />
              </View>
            ) : groupedHistory.length === 0 ? (
              <View style={{ paddingVertical: 24 }}>
                <Text style={{ color: theme.colors.muted }}>
                  {historyRows.length === 0 ? 'No ratings yet.' : 'No ratings match your filters.'}
                </Text>
              </View>
            ) : (
              <View style={{ marginTop: 12, gap: 10 }}>
                <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 26 }}>Check-in History</Text>
                {pagedGroups.map((group) => {
                  const isOpen = expandedGroupKey === group.key
                  return (
                  <View
                    key={group.key}
                    style={{
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                      borderRadius: theme.radius.md,
                      padding: 12,
                      backgroundColor: '#FBFDFD',
                    }}
                  >
                    <Pressable
                      onPress={() => setExpandedGroupKey((current) => (current === group.key ? null : group.key))}
                      style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={{ color: theme.colors.text, fontWeight: '800' }}>{group.dateLabel}</Text>
                        {group.timeLabel ? (
                          <Text style={{ color: theme.colors.muted, fontSize: 12, fontWeight: '700' }}>{group.timeLabel}</Text>
                        ) : null}
                      </View>
                      <Text style={{ color: theme.colors.muted, fontWeight: '700' }}>{isOpen ? '▾' : '▸'}</Text>
                    </Pressable>

                    {isOpen ? (
                      <View style={{ marginTop: 10, gap: 8 }}>
                        {group.entries.map((entry) => (
                          <View
                            key={`${entry.issueId}-${entry.timestamp || entry.date}`}
                            style={{
                              borderWidth: 1,
                              borderColor: theme.colors.border,
                              borderRadius: theme.radius.sm,
                              padding: 10,
                              backgroundColor: theme.colors.card,
                            }}
                          >
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                              <Text style={{ color: theme.colors.text, fontWeight: '700', flex: 1, paddingRight: 8 }}>{entry.name}</Text>
                              <Text style={{ color: theme.colors.muted, fontWeight: '700' }}>
                                {getHistoryRatingLabel(entry.value)}
                                {entry.value !== null && entry.value !== undefined ? ` (${entry.value})` : ''}
                              </Text>
                            </View>
                            {entry.note && entry.note.trim().length > 0 ? (
                              <Text style={{ marginTop: 4, color: theme.colors.muted, fontSize: 12 }}>
                                Note: {entry.note}
                              </Text>
                            ) : null}
                            <View style={{ marginTop: 8, flexDirection: 'row', gap: 12 }}>
                              <Pressable onPress={() => openEditModal(entry)}>
                                <Text style={{ color: theme.colors.primary, fontWeight: '700', fontSize: 12 }}>Edit</Text>
                              </Pressable>
                              <Pressable
                                onPress={() =>
                                  Alert.alert('Delete rating', 'Delete this rating?', [
                                    { text: 'Cancel', style: 'cancel' },
                                    { text: 'Delete', style: 'destructive', onPress: () => void deleteEntry(entry) },
                                  ])
                                }
                              >
                                <Text style={{ color: '#DC2626', fontWeight: '700', fontSize: 12 }}>Delete</Text>
                              </Pressable>
                            </View>

                            {editingEntry &&
                            editingEntry.issueId === entry.issueId &&
                            editingEntry.date === entry.date &&
                            (editingEntry.timestamp || '') === (entry.timestamp || '') ? (
                              <View
                                style={{
                                  marginTop: 10,
                                  borderWidth: 1,
                                  borderColor: theme.colors.border,
                                  borderRadius: 10,
                                  padding: 10,
                                  backgroundColor: '#FCFDFD',
                                  gap: 8,
                                }}
                              >
                                <Text style={{ color: theme.colors.text, fontWeight: '700', fontSize: 12 }}>Edit Rating</Text>
                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                                  {LABELS.map((label, idx) => {
                                    const selectedEdit = editValue === idx
                                    return (
                                      <Pressable
                                        key={`edit-${entry.issueId}-${idx}`}
                                        onPress={() => setEditValue(idx)}
                                        style={{
                                          borderWidth: 1,
                                          borderColor: selectedEdit ? '#4CAF50' : theme.colors.border,
                                          backgroundColor: selectedEdit ? '#4CAF50' : theme.colors.card,
                                          borderRadius: 8,
                                          paddingHorizontal: 8,
                                          paddingVertical: 6,
                                        }}
                                      >
                                        <Text style={{ color: selectedEdit ? '#FFFFFF' : theme.colors.text, fontSize: 11, fontWeight: '700' }}>
                                          {label}
                                        </Text>
                                      </Pressable>
                                    )
                                  })}
                                  <Pressable
                                    onPress={() => setEditValue(null)}
                                    style={{
                                      borderWidth: 1,
                                      borderColor: theme.colors.border,
                                      borderRadius: 8,
                                      paddingHorizontal: 8,
                                      paddingVertical: 6,
                                    }}
                                  >
                                    <Text style={{ color: theme.colors.muted, fontSize: 11, fontWeight: '700' }}>Mark N/A</Text>
                                  </Pressable>
                                </View>
                                <TextInput
                                  value={editNote}
                                  onChangeText={setEditNote}
                                  multiline
                                  placeholder="Add a note..."
                                  placeholderTextColor="#8AA39D"
                                  style={{
                                    borderWidth: 1,
                                    borderColor: theme.colors.border,
                                    borderRadius: 8,
                                    minHeight: 56,
                                    paddingHorizontal: 10,
                                    paddingVertical: 8,
                                    color: theme.colors.text,
                                    textAlignVertical: 'top',
                                  }}
                                />
                                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
                                  <Pressable onPress={() => setEditingEntry(null)}>
                                    <Text style={{ color: theme.colors.muted, fontWeight: '700', fontSize: 12 }}>Cancel</Text>
                                  </Pressable>
                                  <Pressable onPress={() => void saveEdit()}>
                                    <Text style={{ color: theme.colors.primary, fontWeight: '800', fontSize: 12 }}>
                                      {historyActionLoading ? 'Saving...' : 'Save'}
                                    </Text>
                                  </Pressable>
                                </View>
                              </View>
                            ) : null}
                          </View>
                        ))}
                      </View>
                    ) : null}
                  </View>
                )})}

                <View style={{ marginTop: 6, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ color: theme.colors.muted, fontSize: 12, fontWeight: '600' }}>
                    Showing {pageStart}-{pageEnd} of {groupedHistory.length}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Pressable
                      onPress={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page <= 1}
                      style={{
                        borderWidth: 1,
                        borderColor: theme.colors.border,
                        borderRadius: 8,
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                        opacity: page <= 1 ? 0.4 : 1,
                      }}
                    >
                      <Text style={{ color: theme.colors.text, fontWeight: '700', fontSize: 12 }}>Previous</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page >= totalPages}
                      style={{
                        borderWidth: 1,
                        borderColor: theme.colors.border,
                        borderRadius: 8,
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                        opacity: page >= totalPages ? 0.4 : 1,
                      }}
                    >
                      <Text style={{ color: theme.colors.text, fontWeight: '700', fontSize: 12 }}>Next</Text>
                    </Pressable>
                  </View>
                </View>

                {historyRows.length > 0 ? (
                  <Pressable
                    onPress={() =>
                      Alert.alert(
                        'Reset all data',
                        'Delete all check-in history? This cannot be undone.',
                        [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Delete all', style: 'destructive', onPress: () => void resetAllHistory() },
                        ],
                      )
                    }
                    style={{
                      marginTop: 10,
                      borderWidth: 2,
                      borderColor: '#FECACA',
                      borderStyle: 'dashed',
                      borderRadius: 16,
                      paddingVertical: 14,
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ color: '#DC2626', fontWeight: '800' }}>Reset All Data</Text>
                  </Pressable>
                ) : null}
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  tabsWrap: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.card,
    marginBottom: 12,
    overflow: 'hidden',
  },
  tabButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  tabButtonActive: {
    borderBottomWidth: 2,
    borderBottomColor: theme.colors.primary,
    backgroundColor: '#F7FBF7',
  },
  tabButtonInactive: {
    backgroundColor: theme.colors.card,
  },
  tabText: {
    fontWeight: '700',
    fontSize: 14,
  },
  tabTextActive: {
    color: theme.colors.primary,
  },
  tabTextInactive: {
    color: theme.colors.muted,
  },
  checkboxRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  checkboxBox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#9FB7B1',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  checkboxBoxChecked: {
    borderColor: theme.colors.primary,
    backgroundColor: '#E8F5EB',
  },
  checkboxTick: {
    color: theme.colors.primary,
    fontWeight: '900',
    fontSize: 12,
    lineHeight: 14,
  },
  checkboxLabel: {
    color: '#425853',
    fontSize: 14,
  },
})
