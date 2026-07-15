import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  AccessibilityInfo,
  Animated,
  Easing,
  findNodeHandle,
  Pressable,
  Text,
  View,
} from 'react-native'
import { Feather } from '@expo/vector-icons'

import { theme } from '../ui/theme'

type DataKey =
  | 'food'
  | 'water'
  | 'mood'
  | 'checkins'
  | 'symptoms'
  | 'exercise'
  | 'journal'
  | 'images'
  | 'labs'
  | 'chats'
  | 'hydration'

type Props = {
  periodStart: string
  periodEnd: string
  coverage?: any
  summary?: any
  sections?: any
  talkToAiSummary?: any
  chatState: 'loading' | 'verified' | 'unavailable'
  onOpenChat: (context?: 'general' | 'food') => void
  onRequestScroll?: (y: number, animated: boolean) => void
}

type Tile = {
  key: DataKey
  label: string
  value: string
  note: string
  icon: keyof typeof Feather.glyphMap
  background: string
  border: string
  accent: string
  wide?: boolean
}

const LABELS: Record<DataKey, string> = {
  food: 'Food logs',
  water: 'Water logs',
  mood: 'Mood entries',
  checkins: 'Check-ins',
  symptoms: 'Symptoms',
  exercise: 'Exercise',
  journal: 'Journal notes',
  images: 'Health image notes',
  labs: 'Lab uploads',
  chats: 'AI chats',
  hydration: 'Hydration summary',
}

function parseDate(value?: string | null) {
  if (!value) return null
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function formatDate(value?: string | null) {
  const date = parseDate(value)
  if (!date) return String(value || '')
  return new Intl.DateTimeFormat('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }).format(date)
}

function dayLabel(value?: string | null) {
  const date = parseDate(String(value || '').slice(0, 10))
  if (!date) return String(value || '')
  return new Intl.DateTimeFormat('en-AU', { weekday: 'short', day: 'numeric' }).format(date)
}

function numberText(value: unknown, digits = 0) {
  const number = Number(value ?? 0)
  if (!Number.isFinite(number)) return '0'
  return new Intl.NumberFormat('en-AU', { maximumFractionDigits: digits }).format(number)
}

function optionalNumberText(value: unknown, digits = 0) {
  if (value === null || value === undefined || value === '') return 'Not available'
  const number = Number(value)
  if (!Number.isFinite(number)) return 'Not available'
  return new Intl.NumberFormat('en-AU', { maximumFractionDigits: digits }).format(number)
}

function formatMl(value: unknown) {
  const ml = Number(value ?? 0)
  if (!Number.isFinite(ml) || ml <= 0) return '0 ml'
  if (ml >= 1000) return `${numberText(ml / 1000, 2)} L`
  return `${numberText(ml)} ml`
}

function Panel({ children, tone = '#FFFFFF' }: { children: React.ReactNode; tone?: string }) {
  return (
    <View style={{ backgroundColor: tone, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 18, padding: 14 }}>
      {children}
    </View>
  )
}

function Metric({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <View style={{ flexGrow: 1, flexBasis: '46%', minHeight: 92, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 16, padding: 13 }}>
      <Text style={{ color: '#64748B', fontSize: 11, fontWeight: '700', textTransform: 'uppercase' }}>{label}</Text>
      <Text style={{ color: '#0F172A', fontSize: 21, fontWeight: '800', marginTop: 7 }}>{value}</Text>
      {note ? <Text style={{ color: '#64748B', fontSize: 11, lineHeight: 16, marginTop: 4 }}>{note}</Text> : null}
    </View>
  )
}

function Metrics({ children }: { children: React.ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9 }}>{children}</View>
}

function EmptyState({ label }: { label: string }) {
  return (
    <View style={{ borderWidth: 1, borderStyle: 'dashed', borderColor: '#CBD5E1', borderRadius: 18, padding: 20, backgroundColor: '#FFFFFF', alignItems: 'center' }}>
      <Text style={{ color: '#1E293B', fontSize: 16, fontWeight: '800', textAlign: 'center' }}>No {label} this week</Text>
      <Text style={{ color: '#64748B', lineHeight: 20, marginTop: 7, textAlign: 'center' }}>
        Nothing was saved for this area during the selected report dates. Helfi has not guessed or filled in missing data.
      </Text>
    </View>
  )
}

function Bars({ title, rows, valueLabel }: { title: string; rows: Array<{ label: string; value: number }>; valueLabel?: (value: number) => string }) {
  const usable = rows.filter((row) => Number(row.value) > 0)
  if (!usable.length) return null
  const max = Math.max(1, ...usable.map((row) => Number(row.value) || 0))
  return (
    <Panel>
      <Text style={{ color: '#0F172A', fontSize: 15, fontWeight: '800' }}>{title}</Text>
      <View style={{ gap: 12, marginTop: 13 }}>
        {rows.map((row, index) => {
          const value = Math.max(0, Number(row.value) || 0)
          return (
            <View key={`${title}-${row.label}-${index}`}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
                <Text style={{ color: '#475569', fontSize: 12, fontWeight: '700' }}>{row.label}</Text>
                <Text style={{ color: '#64748B', fontSize: 12 }}>{valueLabel ? valueLabel(value) : numberText(value, 1)}</Text>
              </View>
              <View style={{ height: 8, borderRadius: 999, backgroundColor: '#E2E8F0', overflow: 'hidden', marginTop: 6 }}>
                <View style={{ height: 8, width: `${Math.max(value > 0 ? 4 : 0, Math.round((value / max) * 100))}%`, borderRadius: 999, backgroundColor: '#34D399' }} />
              </View>
            </View>
          )
        })}
      </View>
    </Panel>
  )
}

function List({ title, items }: { title: string; items: Array<{ title: string; body?: string }> }) {
  const usable = items.filter((item) => item.title || item.body)
  if (!usable.length) return null
  return (
    <Panel>
      <Text style={{ color: '#0F172A', fontSize: 15, fontWeight: '800' }}>{title}</Text>
      <View style={{ gap: 9, marginTop: 12 }}>
        {usable.map((item, index) => (
          <View key={`${title}-${index}`} style={{ backgroundColor: '#F8FAFC', borderRadius: 14, padding: 12 }}>
            <Text style={{ color: '#1E293B', fontWeight: '700', lineHeight: 19 }}>{item.title}</Text>
            {item.body ? <Text style={{ color: '#64748B', lineHeight: 19, marginTop: 4 }}>{item.body}</Text> : null}
          </View>
        ))}
      </View>
    </Panel>
  )
}

function Guidance({ section }: { section?: any }) {
  const groups = [
    { key: 'working', title: "What's working" },
    { key: 'suggested', title: 'Suggestions' },
    { key: 'avoid', title: 'Things to avoid' },
  ]
  const items = groups.flatMap((group) => (Array.isArray(section?.[group.key]) ? section[group.key].map((item: any) => ({ title: `${group.title}: ${item?.name || 'Insight'}`, body: item?.reason || '' })) : []))
  return <List title="What this means" items={items} />
}

function DetailContent(props: Props & { selected: DataKey }) {
  const { selected, coverage = {}, summary = {}, sections = {}, talkToAiSummary = {}, chatState, onOpenChat } = props
  const nutrition = summary?.nutritionSummary || {}
  const hydration = summary?.hydrationSummary || {}
  const mood = summary?.moodSummary || {}
  const checkins = summary?.checkinSummary || {}
  const symptoms = summary?.symptomSummary || {}
  const exercise = summary?.exerciseSummary || {}
  const journal = summary?.journalSummary || {}
  const images = summary?.medicalImageSummary || {}
  const daily = Array.isArray(summary?.dailyStats) ? summary.dailyStats : []

  if (selected === 'food') {
    if (!Number(coverage?.foodCount || 0)) return <EmptyState label="food logs" />
    return <View style={{ gap: 10 }}><Metrics>
      <Metric label="Food logs" value={numberText(coverage.foodCount)} /><Metric label="Days logged" value={`${numberText(nutrition.daysWithLogs)}/7`} />
      <Metric label="Daily energy" value={`${numberText(nutrition?.dailyAverages?.calories)} kcal`} /><Metric label="Daily protein" value={`${numberText(nutrition?.dailyAverages?.protein_g, 1)} g`} />
    </Metrics><Bars title="Daily energy" rows={(nutrition.dailyTotals || []).map((row: any) => ({ label: dayLabel(row.date), value: Number(row.calories || 0) }))} valueLabel={(value) => `${numberText(value)} kcal`} />
      <List title="Most logged foods" items={(nutrition.topFoods || []).map((item: any) => ({ title: item.name || 'Food', body: `${numberText(item.count)} logs` }))} /><Guidance section={sections?.nutrition} /></View>
  }

  if (selected === 'water' || selected === 'hydration') {
    if (!Number(hydration?.entries || coverage?.waterCount || 0)) return <EmptyState label="water logs" />
    return <View style={{ gap: 10 }}><Metrics>
      <Metric label="Water logs" value={numberText(coverage.waterCount ?? hydration.entries)} /><Metric label="Days logged" value={`${numberText(hydration.daysWithLogs)}/7`} />
      <Metric label="Total" value={formatMl(hydration.totalMl)} /><Metric label="Daily average" value={formatMl(hydration.dailyAverageMl)} />
    </Metrics><Bars title="Daily hydration" rows={(hydration.dailyTotals || []).map((row: any) => ({ label: dayLabel(row.date), value: Number(row.totalMl || 0) }))} valueLabel={formatMl} />
      <List title="Most logged drinks" items={(hydration.topDrinks || []).map((item: any) => ({ title: item.label || 'Drink', body: `${numberText(item.count)} logs` }))} /><Guidance section={sections?.hydration} /></View>
  }

  if (selected === 'mood') {
    if (!Number(mood?.entries || coverage?.moodCount || 0)) return <EmptyState label="mood entries" />
    const trend = mood?.trend?.direction ? `${mood.trend.direction}${mood.trend.change ? ` (${mood.trend.change > 0 ? '+' : ''}${mood.trend.change})` : ''}` : 'Not enough data'
    return <View style={{ gap: 10 }}><Metrics>
      <Metric label="Mood entries" value={numberText(coverage.moodCount ?? mood.entries)} /><Metric label="Days logged" value={`${numberText(mood.daysWithLogs)}/7`} />
      <Metric label="Average mood" value={numberText(mood.averageMood, 1)} /><Metric label="Weekly trend" value={trend} />
    </Metrics><Bars title="Daily mood" rows={(mood.dailyAverages || []).map((row: any) => ({ label: dayLabel(row.date), value: Number(row.avgMood || 0) }))} />
      <List title="Common mood tags" items={(mood.topTags || []).map((item: any) => ({ title: item.name || 'Mood', body: `${numberText(item.count)} times` }))} />
      <List title="Saved mood notes" items={(mood.notes || []).map((item: any) => ({ title: formatDate(item.createdAt), body: item.content || '' }))} /><Guidance section={sections?.mood} /></View>
  }

  if (selected === 'checkins') {
    if (!Number(checkins?.totalEntries || coverage?.checkinCount || 0)) return <EmptyState label="check-ins" />
    const detailed = Number.isFinite(Number(checkins?.overallAvg)) && Array.isArray(checkins?.goals) && checkins.goals.length > 0
    return <View style={{ gap: 10 }}><Metrics>
      <Metric label="Ratings saved" value={numberText(coverage.checkinCount ?? checkins.totalEntries)} />
      <Metric label="Overall average" value={detailed ? numberText(checkins.overallAvg, 1) : 'Not available'} note={detailed ? undefined : 'This older saved report did not include detailed goal scores.'} />
      <Metric label="Goals checked" value={detailed ? numberText(checkins.goals.length) : 'Not available'} />
    </Metrics><Bars title="Daily check-ins" rows={daily.map((row: any) => ({ label: dayLabel(row.date), value: Number(row.checkinCount || 0) }))} valueLabel={(value) => `${numberText(value)} ratings`} />
      <List title="Goal check-ins" items={(checkins.goals || []).map((item: any) => ({ title: item.goal || 'Goal', body: `${numberText(item.avgRating, 1)} average${item.trend == null ? '' : ` • ${item.trend > 0 ? '+' : ''}${item.trend} change`}` }))} />
      <List title="Check-in notes" items={(checkins.notes || []).map((item: any) => ({ title: item.goal || formatDate(item.createdAt), body: item.content || '' }))} /><Guidance section={sections?.overview} /></View>
  }

  if (selected === 'symptoms') {
    if (!Number(symptoms?.entries || coverage?.symptomCount || 0)) return <EmptyState label="symptoms" />
    return <View style={{ gap: 10 }}><Metrics>
      <Metric label="Symptom entries" value={numberText(coverage.symptomCount ?? symptoms.entries)} /><Metric label="Days logged" value={`${numberText(symptoms.daysWithLogs)}/7`} /><Metric label="Unique symptoms" value={numberText(symptoms.uniqueSymptoms)} />
    </Metrics><Bars title="Daily symptom activity" rows={daily.map((row: any) => ({ label: dayLabel(row.date), value: Number(row.symptomCount || 0) }))} />
      <List title="Most noted symptoms" items={(symptoms.topSymptoms || []).map((item: any) => ({ title: item.name || 'Symptom', body: `${numberText(item.count)} times` }))} /><Guidance section={sections?.symptoms} /></View>
  }

  if (selected === 'exercise') {
    if (!Number(exercise?.sessions || coverage?.exerciseCount || 0)) return <EmptyState label="exercise" />
    return <View style={{ gap: 10 }}><Metrics>
      <Metric label="Sessions" value={numberText(coverage.exerciseCount ?? exercise.sessions)} /><Metric label="Active days" value={`${numberText(exercise.daysActive)}/7`} />
      <Metric label="Total movement" value={`${numberText(exercise.totalMinutes)} min`} /><Metric label="Distance" value={`${numberText(exercise.totalDistanceKm, 1)} km`} />
    </Metrics><Bars title="Daily movement" rows={daily.map((row: any) => ({ label: dayLabel(row.date), value: Number(row.exerciseMinutes || 0) }))} valueLabel={(value) => `${numberText(value)} min`} />
      <List title="Most logged activities" items={(exercise.topActivities || []).map((item: any) => ({ title: item.name || 'Activity', body: `${numberText(item.count)} sessions` }))} /><Guidance section={sections?.exercise} /></View>
  }

  if (selected === 'journal') {
    if (!Number(journal?.entries || coverage?.journalCount || 0)) return <EmptyState label="journal notes" />
    return <View style={{ gap: 10 }}><Metrics><Metric label="Journal notes" value={numberText(coverage.journalCount ?? journal.entries)} /><Metric label="Days with notes" value={`${numberText(journal.daysWithNotes)}/7`} /></Metrics>
      <List title="Highlights from this week" items={(journal.highlights || []).map((item: any) => ({ title: [formatDate(item.date), item.time].filter(Boolean).join(' • ') || 'Journal note', body: item.note || '' }))} /><Guidance section={sections?.lifestyle} /></View>
  }

  if (selected === 'images') {
    if (!Number(images?.entries || coverage?.medicalImageCount || 0)) return <EmptyState label="health image notes" />
    return <View style={{ gap: 10 }}><Metrics><Metric label="Health image notes" value={numberText(coverage.medicalImageCount ?? images.entries)} /><Metric label="Days with notes" value={`${numberText(images.daysWithScans)}/7`} /></Metrics>
      <List title="Saved image-note highlights" items={(images.highlights || []).map((item: any) => ({ title: item.summary || 'Saved health image note', body: [...(item.possibleCauses || []).map((value: string) => `Possible cause: ${value}`), ...(item.nextSteps || []).map((value: string) => `Next step: ${value}`)].join('\n') }))} /></View>
  }

  if (selected === 'labs') {
    const highlights = Array.isArray(summary?.labHighlights) ? summary.labHighlights : []
    const trends = Array.isArray(summary?.labTrends) ? summary.labTrends : []
    if (!Number(coverage?.labCount || 0)) return <EmptyState label="lab uploads" />
    return <View style={{ gap: 10 }}><Metrics><Metric label="Lab uploads" value={numberText(coverage.labCount)} /><Metric label="Markers shown" value={numberText(highlights.length)} /><Metric label="Trends available" value={numberText(trends.length)} /></Metrics>
      <List title="Latest saved markers" items={highlights.map((item: any) => ({ title: item.name || 'Lab marker', body: `${optionalNumberText(item.value, 2)}${item.unit ? ` ${item.unit}` : ''}${item.status ? ` • ${item.status}` : ''}` }))} />
      <List title="Marker movement" items={trends.map((item: any) => ({ title: item.name || 'Lab marker', body: `${optionalNumberText(item.previousValue, 2)} → ${optionalNumberText(item.latestValue, 2)}${item.unit ? ` ${item.unit}` : ''} (${item.direction || 'flat'})` }))} /><Guidance section={sections?.labs} /></View>
  }

  if (selected === 'chats') {
    if (chatState === 'loading') return <Panel tone="#EFF6FF"><Text style={{ color: '#1E3A8A', fontWeight: '800' }}>Checking saved chats…</Text><Text style={{ color: '#1D4ED8', lineHeight: 20, marginTop: 6 }}>Helfi is checking the real saved chat history for this report week.</Text></Panel>
    if (chatState === 'unavailable') return <Panel tone="#FFFBEB"><Text style={{ color: '#78350F', fontWeight: '800' }}>Saved chats could not be checked</Text><Text style={{ color: '#92400E', lineHeight: 20, marginTop: 6 }}>Helfi is not showing the older generated count as fact. Please try opening this report again later.</Text></Panel>
    if (!Number(talkToAiSummary?.userMessageCount || 0)) return <EmptyState label="saved AI chats" />
    const general = Number(talkToAiSummary?.sourceBreakdown?.general?.userMessageCount || 0)
    const food = Number(talkToAiSummary?.sourceBreakdown?.food?.userMessageCount || 0)
    return <View style={{ gap: 10 }}><Metrics>
      <Metric label="Saved prompts" value={numberText(talkToAiSummary.userMessageCount)} /><Metric label="Active days" value={`${numberText(talkToAiSummary.activeDays)}/7`} /><Metric label="General chat" value={numberText(general)} /><Metric label="Food chat" value={numberText(food)} />
    </Metrics><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {general > 0 ? <Pressable accessibilityRole="button" accessibilityLabel="Open General chat history" onPress={() => onOpenChat('general')} style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1, backgroundColor: '#DBEAFE', borderRadius: 999, paddingVertical: 11, paddingHorizontal: 16 })}><Text style={{ color: '#1E40AF', fontWeight: '800' }}>Open General chat history</Text></Pressable> : null}
      {food > 0 ? <Pressable accessibilityRole="button" accessibilityLabel="Open Food chat history" onPress={() => onOpenChat('food')} style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1, backgroundColor: '#DBEAFE', borderRadius: 999, paddingVertical: 11, paddingHorizontal: 16 })}><Text style={{ color: '#1E40AF', fontWeight: '800' }}>Open Food chat history</Text></Pressable> : null}
    </View></View>
  }

  return null
}

export function WeeklyReportDataExplorer(props: Props) {
  const [selected, setSelected] = useState<DataKey | null>(null)
  const [reduceMotion, setReduceMotion] = useState(false)
  const reveal = useRef(new Animated.Value(1)).current
  const containerRef = useRef<View | null>(null)
  const tileRefs = useRef<Partial<Record<DataKey, any>>>({})
  const { coverage = {}, summary = {}, chatState } = props
  const hydration = summary?.hydrationSummary || {}
  const checkins = summary?.checkinSummary || {}
  const exercise = summary?.exerciseSummary || {}

  useEffect(() => {
    let active = true
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => { if (active) setReduceMotion(Boolean(enabled)) })
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => setReduceMotion(Boolean(enabled)))
    return () => { active = false; subscription.remove() }
  }, [])

  useEffect(() => {
    if (!selected || reduceMotion) {
      reveal.setValue(1)
      return
    }
    reveal.setValue(0)
    Animated.timing(reveal, { toValue: 1, duration: 360, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start()
  }, [reduceMotion, reveal, selected])

  const chatValue = chatState === 'verified' ? numberText(coverage.talkToAiCount || 0) : '—'
  const chatNote = chatState === 'loading' ? 'Checking saved chat history' : chatState === 'unavailable' ? 'Saved chat history is temporarily unavailable' : 'Verified saved prompt counts and chat sources'
  const tiles = useMemo<Tile[]>(() => [
    { key: 'food', label: LABELS.food, value: numberText(coverage.foodCount), note: 'Meals, energy, macros and top foods', icon: 'pie-chart', background: '#FFF7ED', border: '#FED7AA', accent: '#C2410C' },
    { key: 'water', label: LABELS.water, value: numberText(coverage.waterCount), note: 'Daily water logs and drink types', icon: 'droplet', background: '#ECFEFF', border: '#A5F3FC', accent: '#0E7490' },
    { key: 'mood', label: LABELS.mood, value: numberText(coverage.moodCount), note: 'Mood level, trend, tags and notes', icon: 'smile', background: '#FFFBEB', border: '#FDE68A', accent: '#B45309' },
    { key: 'checkins', label: LABELS.checkins, value: numberText(coverage.checkinCount ?? checkins.totalEntries), note: 'Goal ratings, movement and notes', icon: 'check-square', background: '#ECFDF5', border: '#A7F3D0', accent: '#047857' },
    { key: 'symptoms', label: LABELS.symptoms, value: numberText(coverage.symptomCount), note: 'Frequency, unique symptoms and guidance', icon: 'alert-circle', background: '#FFF1F2', border: '#FECDD3', accent: '#BE123C' },
    { key: 'exercise', label: LABELS.exercise, value: numberText(coverage.exerciseCount ?? exercise.sessions), note: 'Sessions, minutes, distance and activities', icon: 'activity', background: '#F5F3FF', border: '#DDD6FE', accent: '#6D28D9' },
    { key: 'journal', label: LABELS.journal, value: numberText(coverage.journalCount), note: 'Saved notes and weekly highlights', icon: 'book-open', background: '#F0FDFA', border: '#99F6E4', accent: '#0F766E' },
    { key: 'images', label: LABELS.images, value: numberText(coverage.medicalImageCount), note: 'Saved image-note findings and next steps', icon: 'image', background: '#F0F9FF', border: '#BAE6FD', accent: '#0369A1' },
    { key: 'labs', label: LABELS.labs, value: numberText(coverage.labCount), note: 'Latest markers and movement over time', icon: 'bar-chart-2', background: '#EEF2FF', border: '#C7D2FE', accent: '#4338CA' },
    { key: 'chats', label: LABELS.chats, value: chatValue, note: chatNote, icon: 'message-circle', background: '#EFF6FF', border: '#BFDBFE', accent: '#1D4ED8' },
    { key: 'hydration', label: LABELS.hydration, value: numberText(hydration.entries || coverage.waterCount), note: `${formatMl(hydration.totalMl)} total • ${formatMl(hydration.dailyAverageMl)} per day`, icon: 'check-circle', background: '#E0F2FE', border: '#7DD3FC', accent: '#0369A1', wide: true },
  ], [chatNote, chatValue, checkins.totalEntries, coverage, exercise.sessions, hydration.dailyAverageMl, hydration.entries, hydration.totalMl])

  const open = (key: DataKey) => {
    setSelected(key)
    AccessibilityInfo.announceForAccessibility(`${LABELS[key]} report opened for ${formatDate(props.periodStart)} to ${formatDate(props.periodEnd)}`)
    setTimeout(() => containerRef.current?.measureInWindow((_x, y) => props.onRequestScroll?.(y, !reduceMotion)), 80)
  }

  const close = () => {
    const previous = selected
    setSelected(null)
    if (previous) {
      setTimeout(() => {
        const handle = findNodeHandle(tileRefs.current[previous])
        if (handle) AccessibilityInfo.setAccessibilityFocus(handle)
      }, 80)
    }
    setTimeout(() => containerRef.current?.measureInWindow((_x, y) => props.onRequestScroll?.(y, !reduceMotion)), 80)
  }

  return (
    <View ref={containerRef} testID="weekly-data-explorer-native" style={{ backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 22, padding: 14 }}>
      <Text style={{ color: '#047857', fontSize: 11, fontWeight: '800', letterSpacing: 1.3, textTransform: 'uppercase' }}>Selected week</Text>
      <Text style={{ color: '#0F172A', fontSize: 22, fontWeight: '800', marginTop: 5 }}>Data used this week</Text>
      <Text style={{ color: '#64748B', lineHeight: 20, marginTop: 6 }}>Tap any area to open its full report for {formatDate(props.periodStart)} to {formatDate(props.periodEnd)}.</Text>
      {!selected ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: 15 }}>
        {tiles.map((tile) => {
          const active = selected === tile.key
          return (
            <Pressable
              key={tile.key}
              ref={(node) => { tileRefs.current[tile.key] = node }}
              testID={`weekly-data-tile-${tile.key}`}
              accessibilityRole="button"
              accessibilityLabel={`${tile.label}, ${tile.value}`}
              accessibilityHint={`Opens the ${tile.label} report for the selected week`}
              accessibilityState={{ expanded: active }}
              onPress={() => open(tile.key)}
              style={({ pressed }) => ({
                opacity: pressed ? 0.82 : 1,
                transform: [{ scale: pressed && !reduceMotion ? 0.985 : 1 }],
                flexGrow: 1,
                flexBasis: tile.wide ? '100%' : '47%',
                minHeight: 166,
                backgroundColor: tile.background,
                borderColor: active ? '#10B981' : tile.border,
                borderWidth: active ? 2 : 1,
                borderRadius: 18,
                padding: 13,
              })}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <View style={{ width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' }}><Feather name={tile.icon} size={20} color={tile.accent} /></View>
                <Text style={{ color: '#0F172A', fontSize: 23, fontWeight: '800' }}>{tile.value}</Text>
              </View>
              <Text style={{ color: '#0F172A', fontSize: 15, fontWeight: '800', marginTop: 13 }}>{tile.label}</Text>
              <Text style={{ color: '#64748B', fontSize: 12, lineHeight: 17, marginTop: 4 }}>{tile.note}</Text>
              <Text style={{ color: '#047857', fontSize: 11, fontWeight: '800', letterSpacing: 0.5, marginTop: 11 }}>OPEN REPORT →</Text>
            </Pressable>
          )
        })}
      </View> : null}

      {selected ? (
        <Animated.View
          testID={`weekly-data-detail-${selected}`}
          style={{ opacity: reveal, transform: [{ translateY: reveal.interpolate({ inputRange: [0, 1], outputRange: reduceMotion ? [0, 0] : [14, 0] }) }], marginTop: 16, borderRadius: 22, borderWidth: 1, borderColor: '#A7F3D0', backgroundColor: '#F0FDF4', padding: 14 }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, borderBottomWidth: 1, borderBottomColor: '#D1FAE5', paddingBottom: 13 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#047857', fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' }}>{formatDate(props.periodStart)} to {formatDate(props.periodEnd)}</Text>
              <Text style={{ color: '#0F172A', fontSize: 22, fontWeight: '800', marginTop: 5 }}>{LABELS[selected]}</Text>
              <Text style={{ color: '#64748B', lineHeight: 19, marginTop: 6 }}>The report dates stay fixed. Saved chat counts are the only item checked live for accuracy.</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={`Close ${LABELS[selected]} report`} onPress={close} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1, width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#CBD5E1' })}><Feather name="x" size={20} color="#334155" /></Pressable>
          </View>
          <View style={{ gap: 10, marginTop: 13 }}><DetailContent {...props} selected={selected} /></View>
        </Animated.View>
      ) : null}
    </View>
  )
}
