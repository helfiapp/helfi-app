import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons'
import { useFocusEffect } from '@react-navigation/native'

import { API_BASE_URL } from '../config'
import { buildNativeAuthHeaders } from '../lib/nativeAuthHeaders'
import { useAppMode } from '../state/AppModeContext'
import { Screen } from '../ui/Screen'
import { theme } from '../ui/theme'

type ReportStatus = 'RUNNING' | 'READY' | 'FAILED' | 'LOCKED'
type ReportNavKey = 'summary' | 'visuals' | 'insights' | 'sections'
type SectionKey =
  | 'overview'
  | 'supplements'
  | 'medications'
  | 'nutrition'
  | 'hydration'
  | 'exercise'
  | 'lifestyle'
  | 'labs'
  | 'mood'
  | 'symptoms'
type DetailBucket = 'working' | 'suggested' | 'avoid'

type IssueSummary = {
  id: string
  slug: string
  name: string
  severityLabel: string
  currentRating: number | null
  ratingScaleMax: number | null
  lastUpdated: string | null
  highlight: string
  blockers: string[]
  status: 'needs-data' | 'focus' | 'monitor' | 'on-track'
}

type WeeklyReportRecord = {
  id: string
  periodStart: string
  periodEnd: string
  status: ReportStatus
  summary: string | null
  dataSummary: any
  report: any
  readyAt: string | null
  createdAt: string
  viewedAt?: string | null
}

type ReportCountdown = {
  days: number
  hours: number
  minutes: number
  seconds: number
  percent: number
  dueNow: boolean
  dueAtMs: number
}

const REPORT_NAV_ITEMS: Array<{ key: ReportNavKey; label: string; icon: keyof typeof Feather.glyphMap }> = [
  { key: 'summary', label: 'Summary', icon: 'file-text' },
  { key: 'visuals', label: 'Charts', icon: 'bar-chart-2' },
  { key: 'insights', label: 'Insights', icon: 'zap' },
  { key: 'sections', label: 'Details', icon: 'list' },
]

const SECTIONS: Array<{ key: SectionKey; label: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'supplements', label: 'Supplements' },
  { key: 'medications', label: 'Medications' },
  { key: 'nutrition', label: 'Nutrition' },
  { key: 'hydration', label: 'Hydration' },
  { key: 'exercise', label: 'Exercise' },
  { key: 'lifestyle', label: 'Lifestyle' },
  { key: 'labs', label: 'Labs' },
  { key: 'mood', label: 'Mood' },
  { key: 'symptoms', label: 'Symptoms' },
]

const CHART_KEYS = [
  'snapshot',
  'macros',
  'hydration',
  'calories',
  'mood',
  'symptoms',
  'exercise',
  'foods',
  'scans',
  'journal',
] as const

type ChartKey = (typeof CHART_KEYS)[number]

function parseMaybeJson(value: any) {
  if (!value) return null
  if (typeof value === 'string') {
    try {
      return JSON.parse(value)
    } catch {
      return null
    }
  }
  if (typeof value === 'object') return value
  return null
}

function replaceIsoDates(text: string) {
  return String(text || '').replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (_match, y, m, d) => {
    const date = new Date(Number(y), Number(m) - 1, Number(d))
    if (Number.isNaN(date.getTime())) return `${y}-${m}-${d}`
    return formatDateForLocale(date)
  })
}

function splitIntoPoints(text: string) {
  const cleaned = replaceIsoDates(text).replace(/\r/g, '').trim()
  if (!cleaned) return []
  return cleaned
    .split(/\n+/)
    .flatMap((line) => line.replace(/([.!?])\s+(?=[A-Z0-9])/g, '$1|').split('|'))
    .map((line) => line.replace(/^[-•]\s*/, '').trim())
    .filter(Boolean)
}

function splitIntoLines(text: string) {
  return replaceIsoDates(text)
    .replace(/\r/g, '')
    .split(/\n+/)
    .map((line) => line.replace(/^[-•]\s*/, '').trim())
    .filter(Boolean)
}

function formatDateForLocale(value?: string | Date | number | null) {
  if (!value) return ''
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }).format(date)
}

function formatDateTimeForLocale(value?: string | Date | number | null) {
  if (!value) return ''
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat('en-AU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

function padTime(value: number) {
  return String(Math.max(0, value)).padStart(2, '0')
}

const WEEKLY_REPORT_PERIOD_MS = 7 * 24 * 60 * 60 * 1000

function getDisplayNextReportDueAt(status: any) {
  const raw = status?.nextReportDueAt
  if (!raw) return null
  const dueAt = new Date(raw)
  if (Number.isNaN(dueAt.getTime())) return raw

  const latestReportReady = status?.reportReady === true || status?.reportLocked === true
  if (!latestReportReady || dueAt.getTime() > Date.now()) return raw

  return new Date(Date.now() + WEEKLY_REPORT_PERIOD_MS).toISOString()
}

function formatDateRange(start?: string | null, end?: string | null) {
  const startText = formatDateForLocale(start)
  const endText = formatDateForLocale(end)
  if (startText && endText) return `${startText} to ${endText}`
  return startText || endText
}

function formatCompactNumber(value: unknown) {
  const amount = Number(value ?? 0)
  if (!Number.isFinite(amount)) return '0'
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(amount)
}

function formatMl(value: unknown) {
  const ml = Number(value ?? 0)
  if (!Number.isFinite(ml) || ml <= 0) return '0 ml'
  if (ml >= 1000) {
    const liters = Math.round((ml / 1000) * 100) / 100
    return `${String(liters).replace(/\.0+$/, '').replace(/(\.[1-9])0$/, '$1')} L`
  }
  return `${Math.round(ml)} ml`
}

function toDateKey(value?: string | null) {
  const raw = String(value || '').trim()
  if (!raw) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

function listReportDays(start?: string | null, end?: string | null) {
  const startKey = toDateKey(start)
  const endKey = toDateKey(end)
  if (!startKey || !endKey) return []
  const days: string[] = []
  const cursor = new Date(`${startKey}T00:00:00Z`)
  const last = new Date(`${endKey}T00:00:00Z`)
  if (Number.isNaN(cursor.getTime()) || Number.isNaN(last.getTime())) return []
  for (let index = 0; index < 10; index += 1) {
    const key = cursor.toISOString().slice(0, 10)
    days.push(key)
    if (key === endKey) break
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return days.slice(-7)
}

function shortDayName(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return dateKey
  return new Intl.DateTimeFormat('en-AU', { weekday: 'short' }).format(date).slice(0, 3)
}

function strengthLabel(percent: number) {
  if (percent >= 85) return 'Excellent'
  if (percent >= 65) return 'Strong'
  if (percent >= 40) return 'Building'
  return 'Early'
}

function extractSectionLabels(input: unknown): string[] {
  if (!input) return []
  if (typeof input === 'string') return input.trim() ? [input.trim()] : []
  if (Array.isArray(input)) return input.flatMap((item) => extractSectionLabels(item))
  if (typeof input === 'object') {
    const record = input as Record<string, unknown>
    const direct = ['name', 'title', 'label', 'goal', 'issue']
      .map((key) => String(record[key] || '').trim())
      .filter(Boolean)
    if (direct.length) return direct
  }
  return []
}

function formatDoseTiming(item: any) {
  const parts = [
    String(item?.dosage || '').trim() ? `dose: ${String(item.dosage).trim()}` : '',
    String(item?.timing || '').trim() ? `timing: ${String(item.timing).trim()}` : '',
  ].filter(Boolean)
  return parts.length ? ` (${parts.join(', ')})` : ''
}

function currentSupplementReason(item: any, labels: string[]) {
  const name = String(item?.name || 'Supplement').trim()
  const focusText = labels.join(' ').toLowerCase()
  const lower = name.toLowerCase()
  const focus = labels[0] || 'your current goals'
  if (/citrulline|arginine|beet|nitric/.test(lower)) {
    return `${name}${formatDoseTiming(item)} may fit erection, libido, or blood-flow goals.\nKeep it steady and compare it with erection quality, energy, recovery, and symptoms before adding similar products.`
  }
  if (/probiotic|psyllium|fiber|fibre|inulin|digest/.test(lower)) {
    return `${name}${formatDoseTiming(item)} may fit digestion or bowel-movement goals${/bowel|digestion|gut|bloat|constipation|diarrh/.test(focusText) ? ' already listed in this report' : ''}.\nKeep it steady and compare it with bloating, bowel movements, food, and hydration patterns.`
  }
  if (/magnesium|creatine|omega|fish oil|zinc|vitamin\s*d|b12|coq10|maca|tongkat/.test(lower)) {
    return `${name}${formatDoseTiming(item)} may fit ${focus}, energy, mood, libido, or recovery support depending on the reason you take it.\nKeep it consistent for the week so the report can compare it with symptoms, mood, exercise, and food/fluid patterns.`
  }
  return `${name}${formatDoseTiming(item)} is in your current supplement stack and should be judged against ${focus}.\nKeep it steady for the week so changes in energy, digestion, libido, recovery, mood, and symptoms are easier to read.`
}

function currentMedicationReason(item: any, labels: string[]) {
  const name = String(item?.name || 'Medication').trim()
  const lower = name.toLowerCase()
  const focus = labels[0] || 'your current goals'
  if (/tadalafil|sildenafil|vardenafil|avanafil/.test(lower)) {
    return `${name}${formatDoseTiming(item)} may matter for erection or libido goals because it is commonly used for erection blood-flow support.\nKeep dose and timing consistent, and do not change it without your prescriber.`
  }
  return `${name}${formatDoseTiming(item)} is in your current medication list and may matter for ${focus}.\nTrack timing, side effects, symptoms, mood, digestion, energy, and recovery before changing anything with your prescriber.`
}

function hasBucketItems(section: any) {
  return ['working', 'suggested', 'avoid'].some((bucket) => Array.isArray(section?.[bucket]) && section[bucket].length > 0)
}

function getInsightName(item: any, fallback: string) {
  return replaceIsoDates(String(item?.name || item?.label || fallback))
}

function getInsightReason(item: any, fallback: string) {
  return replaceIsoDates(String(item?.reason || item?.summary || fallback))
}

function Card({ children, tone = 'white', style }: { children: React.ReactNode; tone?: 'white' | 'mint' | 'sky' | 'amber' | 'rose' | 'dark'; style?: any }) {
  const colors =
    tone === 'mint'
      ? { backgroundColor: '#ECFDF3', borderColor: '#BFEAD0' }
      : tone === 'sky'
        ? { backgroundColor: '#EFF8FF', borderColor: '#BDE3FF' }
        : tone === 'amber'
          ? { backgroundColor: '#FFF7E8', borderColor: '#F5D79D' }
          : tone === 'rose'
            ? { backgroundColor: '#FFF1F2', borderColor: '#FECDD3' }
            : tone === 'dark'
              ? { backgroundColor: '#0F172A', borderColor: '#0F172A' }
              : { backgroundColor: theme.colors.card, borderColor: theme.colors.border }
  return (
    <View style={[{ borderWidth: 1, borderRadius: 18, padding: 14 }, colors, style]}>
      {children}
    </View>
  )
}

function PrimaryButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      style={({ pressed }) => ({
        opacity: disabled ? 0.55 : pressed ? 0.86 : 1,
        backgroundColor: theme.colors.primary,
        borderRadius: 12,
        paddingVertical: 12,
        paddingHorizontal: 14,
        alignItems: 'center',
      })}
    >
      <Text style={{ color: '#FFFFFF', fontWeight: '900' }}>{label}</Text>
    </Pressable>
  )
}

function SecondaryButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      style={({ pressed }) => ({
        opacity: disabled ? 0.55 : pressed ? 0.86 : 1,
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: 12,
        paddingVertical: 12,
        paddingHorizontal: 14,
        alignItems: 'center',
      })}
    >
      <Text style={{ color: theme.colors.text, fontWeight: '900' }}>{label}</Text>
    </Pressable>
  )
}

function ProgressBar({ percent, color = theme.colors.primary }: { percent: number; color?: string }) {
  const safe = Math.max(0, Math.min(100, Math.round(percent)))
  return (
    <View style={{ height: 8, backgroundColor: '#E5E7EB', borderRadius: 99, overflow: 'hidden' }}>
      <View style={{ width: `${safe}%`, height: '100%', backgroundColor: color, borderRadius: 99 }} />
    </View>
  )
}

function StatCard({ label, value, note, tone = 'white' }: { label: string; value: string; note: string; tone?: 'white' | 'mint' | 'sky' | 'amber' }) {
  return (
    <Card tone={tone} style={{ paddingVertical: 13, paddingHorizontal: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.colors.muted, fontSize: 11, fontWeight: '900', textTransform: 'uppercase' }}>{label}</Text>
          <Text style={{ color: theme.colors.muted, fontSize: 13, marginTop: 4, lineHeight: 18 }}>{note}</Text>
        </View>
        <Text style={{ color: theme.colors.text, fontSize: 29, fontWeight: '900', textAlign: 'right' }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
          {value}
        </Text>
      </View>
    </Card>
  )
}

function EmptyBox({ message }: { message: string }) {
  return (
    <View style={{ borderWidth: 1, borderColor: '#CBD5E1', borderStyle: 'dashed', borderRadius: 14, padding: 14, backgroundColor: '#F8FAFC' }}>
      <Text style={{ color: theme.colors.muted, lineHeight: 20, textAlign: 'center' }}>{message}</Text>
    </View>
  )
}

function InfoItem({ title, body, tone = 'white' }: { title: string; body?: string; tone?: 'white' | 'mint' | 'sky' | 'amber' | 'rose' }) {
  return (
    <Card tone={tone} style={{ padding: 12 }}>
      <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 15 }}>{replaceIsoDates(title)}</Text>
      {body ? (
        <View style={{ marginTop: 5, gap: 3 }}>
          {splitIntoLines(body).map((line, idx) => (
            <Text key={`${title}-${idx}`} style={{ color: theme.colors.muted, lineHeight: 19, fontSize: 13 }}>
              {line}
            </Text>
          ))}
        </View>
      ) : null}
    </Card>
  )
}

function issueStatusColors(status?: IssueSummary['status']) {
  if (status === 'focus') return { backgroundColor: '#FEF3C7', borderColor: '#FCD34D', color: '#92400E' }
  if (status === 'monitor') return { backgroundColor: '#EFF8FF', borderColor: '#BDE3FF', color: '#075985' }
  if (status === 'on-track') return { backgroundColor: '#ECFDF3', borderColor: '#BFEAD0', color: '#047857' }
  return { backgroundColor: '#F3F4F6', borderColor: '#E5E7EB', color: '#4B5563' }
}

function SectionBucketPanel({
  title,
  bucket,
  items,
  open,
  onToggle,
}: {
  title: string
  bucket: DetailBucket
  items: Array<{ name?: string; reason?: string }>
  open: boolean
  onToggle: () => void
}) {
  const count = items?.length || 0
  return (
    <Card tone="white" style={{ padding: 0, overflow: 'hidden' }}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={({ pressed }) => ({
          padding: 14,
          opacity: pressed ? 0.86 : 1,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        })}
      >
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 15 }}>{title}</Text>
          <Text style={{ color: theme.colors.muted, fontSize: 12, marginTop: 3 }}>{count === 1 ? '1 item' : `${count} items`}</Text>
        </View>
        <View style={{ width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center', justifyContent: 'center' }}>
          <Feather name={open ? 'chevron-up' : 'chevron-down'} size={18} color={theme.colors.text} />
        </View>
      </Pressable>
      {open ? (
        <View style={{ borderTopWidth: 1, borderTopColor: theme.colors.border, padding: 12, gap: 10, backgroundColor: '#FFFFFF' }}>
          {count > 0 ? (
            items.map((item, idx) => (
              <InfoItem key={`${bucket}-${idx}`} title={item.name || 'Insight'} body={item.reason || 'Keep logging for more detail.'} />
            ))
          ) : (
            <EmptyBox message="No data yet for this area." />
          )}
        </View>
      ) : null}
    </Card>
  )
}

function ChartDisclosure({
  id,
  title,
  eyebrow,
  summary,
  open,
  onToggle,
  children,
}: {
  id: string
  title: string
  eyebrow: string
  summary: string
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <Card tone="white" style={{ padding: 0, overflow: 'hidden' }}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={({ pressed }) => ({
          opacity: pressed ? 0.86 : 1,
          padding: 14,
          flexDirection: 'row',
          gap: 12,
          alignItems: 'center',
        })}
      >
        <View style={{ width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: theme.colors.primary, fontWeight: '900', fontSize: 20 }}>{open ? '-' : '+'}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.colors.muted, fontSize: 11, fontWeight: '900', textTransform: 'uppercase' }}>{eyebrow}</Text>
          <Text style={{ color: theme.colors.text, fontSize: 17, fontWeight: '900', marginTop: 3 }}>{title}</Text>
          <Text style={{ color: theme.colors.muted, fontSize: 13, lineHeight: 19, marginTop: 3 }}>{summary}</Text>
        </View>
      </Pressable>
      {open ? <View style={{ padding: 14, borderTopWidth: 1, borderTopColor: theme.colors.border, gap: 12 }}>{children}</View> : null}
    </Card>
  )
}

function SimpleBarChart({ labels, values, color }: { labels: string[]; values: number[]; color: string }) {
  const max = Math.max(1, ...values.map((v) => Number(v) || 0))
  return (
    <View style={{ gap: 8 }}>
      {labels.map((label, idx) => {
        const value = Number(values[idx] ?? 0) || 0
        return (
          <View key={`${label}-${idx}`} style={{ gap: 4 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
              <Text style={{ color: theme.colors.text, fontWeight: '800', fontSize: 12 }}>{label}</Text>
              <Text style={{ color: theme.colors.muted, fontSize: 12 }}>{formatCompactNumber(value)}</Text>
            </View>
            <ProgressBar percent={(value / max) * 100} color={color} />
          </View>
        )
      })}
    </View>
  )
}

function Pill({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        opacity: pressed ? 0.84 : 1,
        backgroundColor: active ? theme.colors.primary : '#FFFFFF',
        borderColor: active ? theme.colors.primary : theme.colors.border,
        borderWidth: 1,
        borderRadius: 999,
        paddingVertical: 9,
        paddingHorizontal: 13,
      })}
    >
      <Text style={{ color: active ? '#FFFFFF' : theme.colors.text, fontWeight: '900', fontSize: 13 }}>{label}</Text>
    </Pressable>
  )
}

export function InsightsScreen({ navigation }: { navigation: any }) {
  const { mode, session } = useAppMode()
  const scrollRef = useRef<ScrollView | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [healthSetupComplete, setHealthSetupComplete] = useState<boolean | null>(null)
  const [weeklyStatus, setWeeklyStatus] = useState<any>(null)
  const [issues, setIssues] = useState<IssueSummary[]>([])
  const [reports, setReports] = useState<WeeklyReportRecord[]>([])
  const [lastLoadedAt, setLastLoadedAt] = useState<string | null>(null)
  const [countdown, setCountdown] = useState<ReportCountdown | null>(null)
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null)
  const [reportNav, setReportNav] = useState<ReportNavKey>('summary')
  const [activeSection, setActiveSection] = useState<SectionKey>('overview')
  const [openDetailBucket, setOpenDetailBucket] = useState<DetailBucket | null>(null)
  const [openCharts, setOpenCharts] = useState<Record<ChartKey, boolean>>({
    snapshot: false,
    macros: false,
    hydration: false,
    calories: false,
    mood: false,
    symptoms: false,
    exercise: false,
    foods: false,
    scans: false,
    journal: false,
  })
  const [busyMessage, setBusyMessage] = useState('')
  const [progressActive, setProgressActive] = useState(false)
  const [progressPercent, setProgressPercent] = useState(0)
  const [progressStage, setProgressStage] = useState('Getting your data')
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const authHeaders = useMemo(() => {
    if (mode !== 'signedIn' || !session?.token) return null
    return buildNativeAuthHeaders(session.token, { includeCookie: true })
  }, [mode, session?.token])

  const selectedReport = useMemo(() => {
    if (!selectedReportId) return null
    if (!reports.length) return null
    return reports.find((item) => item.id === selectedReportId) || null
  }, [reports, selectedReportId])

  const loadData = useCallback(
    async (quiet = false) => {
      if (!authHeaders) {
        setLoading(false)
        setHealthSetupComplete(false)
        setWeeklyStatus(null)
        setIssues([])
        setReports([])
        setLastLoadedAt(null)
        return
      }
      if (!quiet) setLoading(true)
      setError('')
      try {
        const healthStatusRes = await fetch(`${API_BASE_URL}/api/health-setup-status`, { headers: authHeaders })
        const healthStatusData = await healthStatusRes.json().catch(() => ({}))
        if (!healthStatusRes.ok) throw new Error(healthStatusData?.error || 'Could not check Health Setup.')

        const complete = healthStatusData?.complete === true
        setHealthSetupComplete(complete)
        if (!complete) {
          setWeeklyStatus(null)
          setIssues([])
          setReports([])
          setSelectedReportId(null)
          setLastLoadedAt(null)
          return
        }

        const [statusRes, listRes, issuesRes] = await Promise.all([
          fetch(`${API_BASE_URL}/api/reports/weekly/status`, { headers: authHeaders }),
          fetch(`${API_BASE_URL}/api/reports/weekly/list?preview=1`, { headers: authHeaders }),
          fetch(`${API_BASE_URL}/api/insights/issues`, { headers: authHeaders }),
        ])
        const statusData = await statusRes.json().catch(() => ({}))
        const listData = await listRes.json().catch(() => ({}))
        const issuesData = await issuesRes.json().catch(() => ({}))
        if (!statusRes.ok) throw new Error(statusData?.error || 'Could not load weekly report status.')
        if (!listRes.ok) throw new Error(listData?.error || 'Could not load weekly reports.')
        if (!issuesRes.ok) throw new Error(issuesData?.error || 'Could not load tracked issues.')
        const nextReports = Array.isArray(listData?.reports) ? listData.reports : []
        const nextIssues = Array.isArray(issuesData?.issues) ? issuesData.issues : []
        setWeeklyStatus(statusData)
        setReports(nextReports)
        setIssues(nextIssues)
        setLastLoadedAt(new Date().toISOString())
      } catch (err: any) {
        setError(String(err?.message || 'Could not load Insights. Please try again.'))
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [authHeaders, selectedReportId],
  )

  useEffect(() => {
    const dueRaw = weeklyStatus?.nextReportDueAt
    const enabledRaw = weeklyStatus?.reportsEnabledAt

    let dueAt = Number.NaN
    if (dueRaw) {
      dueAt = new Date(dueRaw).getTime()
    } else if (enabledRaw) {
      const enabledAt = new Date(enabledRaw).getTime()
      if (!Number.isNaN(enabledAt)) {
        dueAt = enabledAt + WEEKLY_REPORT_PERIOD_MS
      }
    }

    if (Number.isNaN(dueAt)) {
      setCountdown(null)
      return
    }

    const now = Date.now()
    if (dueAt <= now) {
      dueAt = now + WEEKLY_REPORT_PERIOD_MS
    }
    const startAt = dueAt - WEEKLY_REPORT_PERIOD_MS

    const tick = () => {
      const now = Date.now()
      const remaining = dueAt - now
      const clampedRemaining = Math.max(0, remaining)
      const totalSeconds = Math.floor(clampedRemaining / 1000)
      const days = Math.floor(totalSeconds / 86400)
      const hours = Math.floor((totalSeconds % 86400) / 3600)
      const minutes = Math.floor((totalSeconds % 3600) / 60)
      const seconds = totalSeconds % 60
      const progressRaw = (now - startAt) / WEEKLY_REPORT_PERIOD_MS
      const percent = Math.min(100, Math.max(0, Math.round(progressRaw * 100)))
      setCountdown({
        days,
        hours,
        minutes,
        seconds,
        percent,
        dueNow: remaining <= 0,
        dueAtMs: dueAt,
      })
    }

    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [weeklyStatus?.nextReportDueAt, weeklyStatus?.reportsEnabledAt])

  useEffect(() => {
    void loadData()
  }, [loadData])

  useFocusEffect(
    useCallback(() => {
      void loadData(true)
    }, [loadData]),
  )

  useEffect(() => {
    return () => {
      if (progressTimerRef.current) clearInterval(progressTimerRef.current)
    }
  }, [])

  const startProgress = () => {
    setProgressActive(true)
    setProgressPercent(10)
    setProgressStage('Getting your data')
    if (progressTimerRef.current) clearInterval(progressTimerRef.current)
    progressTimerRef.current = setInterval(() => {
      setProgressPercent((prev) => {
        const next = Math.min(prev + 4, 95)
        if (next < 25) setProgressStage('Getting your data')
        else if (next < 55) setProgressStage('Finding patterns')
        else if (next < 80) setProgressStage('Writing your report')
        else setProgressStage('Final checks')
        return next
      })
    }, 900)
  }

  const stopProgress = (success: boolean) => {
    if (progressTimerRef.current) clearInterval(progressTimerRef.current)
    progressTimerRef.current = null
    if (success) {
      setProgressPercent(100)
      setProgressStage('Done')
      setTimeout(() => setProgressActive(false), 1000)
    } else {
      setProgressActive(false)
      setProgressPercent(0)
    }
  }

  const enableWeeklyReports = async () => {
    if (!authHeaders) return
    setBusyMessage('Turning on weekly reports...')
    try {
      const res = await fetch(`${API_BASE_URL}/api/reports/weekly/preferences`, {
        method: 'POST',
        headers: { ...authHeaders, 'content-type': 'application/json' },
        body: JSON.stringify({ enabled: true }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const message = res.status === 402 ? 'Weekly reports need a plan or credits. Please use Billing.' : 'Could not turn on weekly reports.'
        throw new Error(data?.error || message)
      }
      setWeeklyStatus((prev: any) => ({ ...(prev || {}), ...data }))
      setBusyMessage('Weekly reports are on. Your first report can now be created.')
    } catch (err: any) {
      setBusyMessage('')
      Alert.alert('Weekly reports', String(err?.message || 'Could not turn on weekly reports.'))
    }
  }

  const createReportNow = async () => {
    if (!authHeaders) return
    setBusyMessage('Creating your report now. This can take a minute.')
    startProgress()
    try {
      const res = await fetch(`${API_BASE_URL}/api/reports/weekly/run`, {
        method: 'POST',
        headers: { ...authHeaders, 'content-type': 'application/json' },
        body: JSON.stringify({ triggerSource: 'manual' }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const raw = String(data?.error || data?.reason || data?.status || '').toLowerCase()
        const message = raw.includes('insufficient_credits')
          ? 'Weekly reports need a subscription or credits before creating a report.'
          : raw.includes('disabled')
            ? 'Turn on weekly reports first.'
            : 'Could not create the report right now.'
        throw new Error(message)
      }
      stopProgress(true)
      setBusyMessage('Your report is ready or being prepared. Refreshing now.')
      await loadData(true)
      if (data?.reportId) {
        setSelectedReportId(String(data.reportId))
        setReportNav('summary')
      }
    } catch (err: any) {
      stopProgress(false)
      setBusyMessage('')
      Alert.alert('Create report', String(err?.message || 'Could not create the report right now.'))
    }
  }

  const onRefresh = () => {
    setRefreshing(true)
    void loadData(true)
  }

  const openReport = (reportId?: string | null) => {
    const id = reportId || weeklyStatus?.reportId || reports[0]?.id
    if (!id) return
    setSelectedReportId(String(id))
    setReportNav('summary')
    setOpenDetailBucket(null)
    setTimeout(() => scrollRef.current?.scrollTo({ y: 0, animated: true }), 10)
    if (authHeaders) {
      fetch(`${API_BASE_URL}/api/reports/weekly/notify`, {
        method: 'POST',
        headers: { ...authHeaders, 'content-type': 'application/json' },
        body: JSON.stringify({ reportId: id, action: 'viewed' }),
      }).catch(() => {})
    }
  }

  const openIssue = (issue: IssueSummary) => {
    if (!issue?.slug) return
    goToStackScreen('NativeWebTool', {
      title: issue.name || 'Insight',
      path: `/insights/issues/${issue.slug}`,
    })
  }

  const openPdf = async () => {
    if (!selectedReport?.id) return
    if (!authHeaders) {
      Alert.alert('PDF', 'Please log in again to open this report.')
      return
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/reports/weekly/pdf`, {
        method: 'POST',
        headers: { ...authHeaders, 'content-type': 'application/json' },
        body: JSON.stringify({ reportId: selectedReport.id }),
      })
      const data: any = await res.json().catch(() => ({}))
      if (!res.ok || !data?.url) {
        throw new Error(data?.error || 'Could not open PDF.')
      }
      await Linking.openURL(String(data.url))
    } catch (err: any) {
      Alert.alert('PDF', String(err?.message || 'Could not open PDF.'))
    }
  }

  const goToStackScreen = (screen: string, params?: any) => {
    const parent = navigation.getParent?.()
    if (parent?.navigate) parent.navigate(screen, params)
    else navigation.navigate(screen, params)
  }

  const openChatLog = () => {
    goToStackScreen('NativeWebTool', {
      title: 'Chat History',
      path: '/chat?history=1',
    })
  }

  const payload = useMemo(() => parseMaybeJson(selectedReport?.report), [selectedReport?.report])
  const parsedSummary = useMemo(() => parseMaybeJson(selectedReport?.dataSummary), [selectedReport?.dataSummary])
  const sections = useMemo(() => payload?.sections || {}, [payload])
  const previousReport = useMemo(() => reports.find((item) => item.id !== selectedReport?.id && item.status === 'READY' && item.dataSummary) || null, [reports, selectedReport?.id])
  const previousParsedSummary = useMemo(() => parseMaybeJson(previousReport?.dataSummary), [previousReport?.dataSummary])

  const coverage = parsedSummary?.coverage || {}
  const nutritionSummary = parsedSummary?.nutritionSummary || {}
  const hydrationSummary = parsedSummary?.hydrationSummary || {}
  const symptomSummary = parsedSummary?.symptomSummary || {}
  const exerciseSummary = parsedSummary?.exerciseSummary || {}
  const medicalImageSummary = parsedSummary?.medicalImageSummary || {}
  const journalSummary = parsedSummary?.journalSummary || {}
  const talkToAiSummary = parsedSummary?.talkToAiSummary || {}
  const dailyStats = Array.isArray(parsedSummary?.dailyStats) ? parsedSummary.dailyStats : []
  const supplementsList = Array.isArray(parsedSummary?.supplements) ? parsedSummary.supplements : []
  const medicationsList = Array.isArray(parsedSummary?.medications) ? parsedSummary.medications : []
  const wins = Array.isArray(payload?.wins) ? payload.wins : []
  const gaps = Array.isArray(payload?.gaps) ? payload.gaps : []

  const displaySections = useMemo(() => {
    const labels = [...extractSectionLabels(parsedSummary?.goals), ...extractSectionLabels(parsedSummary?.issues)]
    const next: any = { ...sections }
    next.supplements = {
      working: Array.isArray(sections?.supplements?.working) ? [...sections.supplements.working] : [],
      suggested: Array.isArray(sections?.supplements?.suggested) ? [...sections.supplements.suggested] : [],
      avoid: Array.isArray(sections?.supplements?.avoid) ? [...sections.supplements.avoid] : [],
    }
    next.medications = {
      working: Array.isArray(sections?.medications?.working) ? [...sections.medications.working] : [],
      suggested: Array.isArray(sections?.medications?.suggested) ? [...sections.medications.suggested] : [],
      avoid: Array.isArray(sections?.medications?.avoid) ? [...sections.medications.avoid] : [],
    }
    if (supplementsList.length > 0 && next.supplements.working.length === 0) {
      next.supplements.working = supplementsList.slice(0, 10).map((item: any) => ({ name: item?.name || 'Supplement', reason: currentSupplementReason(item, labels) }))
    }
    if (medicationsList.length > 0 && next.medications.working.length === 0) {
      next.medications.working = medicationsList.slice(0, 10).map((item: any) => ({ name: item?.name || 'Medication', reason: currentMedicationReason(item, labels) }))
    }
    return next
  }, [medicationsList, parsedSummary, sections, supplementsList])

  const availableSections = useMemo(() => {
    const signals = parsedSummary?.sectionSignals || {}
    return SECTIONS.filter((section) => {
      if (section.key === 'overview') return true
      if (hasBucketItems(displaySections?.[section.key])) return true
      if (section.key === 'supplements') return supplementsList.length > 0
      if (section.key === 'medications') return medicationsList.length > 0
      if (section.key === 'nutrition') return Boolean(nutritionSummary?.daysWithLogs || nutritionSummary?.entriesWithNutrients || nutritionSummary?.dailyTotals?.length)
      if (section.key === 'hydration') return Boolean(hydrationSummary?.daysWithLogs || hydrationSummary?.entries || hydrationSummary?.dailyTotals?.length)
      if (section.key === 'exercise') return Boolean(exerciseSummary?.sessions || exerciseSummary?.daysActive || coverage?.exerciseCount)
      if (section.key === 'mood') return Boolean(parsedSummary?.moodSummary?.entries || coverage?.moodCount)
      if (section.key === 'symptoms') return Boolean(symptomSummary?.entries || symptomSummary?.uniqueSymptoms || coverage?.symptomCount)
      if (section.key === 'labs') {
        const labs = signals?.labs || {}
        return Boolean(coverage?.labCount || labs?.reports || labs?.trends || labs?.highlights)
      }
      if (section.key === 'lifestyle') return hasBucketItems(displaySections?.lifestyle)
      return false
    })
  }, [coverage, displaySections, exerciseSummary, hydrationSummary, medicationsList.length, nutritionSummary, parsedSummary, supplementsList.length, symptomSummary])

  useEffect(() => {
    if (!availableSections.some((section) => section.key === activeSection)) {
      setActiveSection(availableSections[0]?.key || 'overview')
    }
  }, [activeSection, availableSections])

  useEffect(() => {
    setOpenDetailBucket(null)
  }, [activeSection])

  const keyInsights = useMemo(() => {
    const picks: Array<{ label: string; name?: string; reason?: string }> = []
    const tryPick = (sectionKey: SectionKey, label: string, bucket: DetailBucket) => {
      const item = displaySections?.[sectionKey]?.[bucket]?.[0]
      if (item?.name || item?.reason) picks.push({ label, name: item.name, reason: item.reason })
    }
    const priority: Array<{ key: SectionKey; label: string }> = [
      { key: 'overview', label: 'Overview' },
      { key: 'nutrition', label: 'Nutrition' },
      { key: 'hydration', label: 'Hydration' },
      { key: 'exercise', label: 'Exercise' },
      { key: 'mood', label: 'Mood' },
      { key: 'symptoms', label: 'Symptoms' },
      { key: 'labs', label: 'Labs' },
      { key: 'lifestyle', label: 'Lifestyle' },
      { key: 'supplements', label: 'Supplements' },
      { key: 'medications', label: 'Medications' },
    ]
    priority.forEach((section) => {
      if (picks.length >= 6) return
      tryPick(section.key, `${section.label} - Suggestion`, 'suggested')
      if (picks.length >= 6) return
      tryPick(section.key, `${section.label} - Avoid`, 'avoid')
      if (picks.length >= 6) return
      tryPick(section.key, `${section.label} - Working`, 'working')
    })
    return picks.slice(0, 6)
  }, [displaySections])

  const detailComparisons = useMemo(() => {
    if (!previousParsedSummary) return []
    const rows: Array<{ label: string; text: string }> = []
    const addChange = (label: string, currentRaw: unknown, previousRaw: unknown, unit: string, minChange = 1) => {
      const current = Number(currentRaw ?? 0)
      const prior = Number(previousRaw ?? 0)
      if (!Number.isFinite(current) || !Number.isFinite(prior) || current <= 0 || prior <= 0) return
      const diff = current - prior
      if (Math.abs(diff) < minChange) return
      const rounded = Math.round(Math.abs(diff) * 10) / 10
      rows.push({ label, text: `${rounded.toLocaleString()}${unit ? ` ${unit}` : ''} ${diff > 0 ? 'higher' : 'lower'} than the previous report` })
    }
    addChange('Calories', nutritionSummary?.dailyAverages?.calories, previousParsedSummary?.nutritionSummary?.dailyAverages?.calories, 'kcal/day', 50)
    addChange('Protein', nutritionSummary?.dailyAverages?.protein_g, previousParsedSummary?.nutritionSummary?.dailyAverages?.protein_g, 'g/day', 5)
    addChange('Water', hydrationSummary?.dailyAverageMl, previousParsedSummary?.hydrationSummary?.dailyAverageMl, 'ml/day', 150)
    addChange('Movement', exerciseSummary?.totalMinutes, previousParsedSummary?.exerciseSummary?.totalMinutes, 'min/week', 10)
    addChange('Mood', parsedSummary?.moodSummary?.averageMood, previousParsedSummary?.moodSummary?.averageMood, 'points', 0.3)
    return rows.slice(0, 5)
  }, [exerciseSummary, hydrationSummary, nutritionSummary, parsedSummary, previousParsedSummary])

  const summaryText = selectedReport?.summary || payload?.summary || 'Summary coming soon.'
  const summaryPoints = splitIntoPoints(summaryText)
  const reportDays = listReportDays(selectedReport?.periodStart, selectedReport?.periodEnd)
  const activeDayKeys = new Set<string>()
  dailyStats.forEach((row: any) => {
    const key = toDateKey(row?.date)
    if (!key) return
    const hasActivity =
      Number(row?.calories ?? 0) > 0 ||
      Number(row?.waterMl ?? 0) > 0 ||
      Number(row?.exerciseMinutes ?? 0) > 0 ||
      Number(row?.symptomCount ?? 0) > 0 ||
      typeof row?.moodAvg === 'number'
    if (hasActivity) activeDayKeys.add(key)
  })
  const daysActive = Math.min(7, Math.max(0, Number(coverage?.daysActive ?? activeDayKeys.size) || 0))
  const reportStrength = Math.round((daysActive / 7) * 100)
  const topCoverage = [
    { label: 'Food logs', value: Number(coverage?.foodCount ?? 0) || 0 },
    { label: 'Water logs', value: Number(coverage?.waterCount ?? 0) || 0 },
    { label: 'Check-ins', value: Number(coverage?.checkinCount ?? 0) || 0 },
    { label: 'Mood entries', value: Number(coverage?.moodCount ?? 0) || 0 },
    { label: 'Symptoms', value: Number(coverage?.symptomCount ?? 0) || 0 },
    { label: 'Exercise', value: Number(coverage?.exerciseCount ?? 0) || 0 },
    { label: 'Journal notes', value: Number(coverage?.journalCount ?? 0) || 0 },
    { label: 'Health image notes', value: Number(coverage?.medicalImageCount ?? 0) || 0 },
    { label: 'Lab uploads', value: Number(coverage?.labCount ?? 0) || 0 },
    { label: 'AI chats', value: Number(coverage?.talkToAiCount ?? 0) || 0 },
  ]
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 6)
  const maxCoverage = Math.max(1, ...topCoverage.map((item) => item.value))
  const strongestPattern = wins?.[0]
  const focusPattern = gaps?.[0] || keyInsights.find((item) => item.label.toLowerCase().includes('avoid'))
  const suggestedPattern = keyInsights.find((item) => item.label.toLowerCase().includes('suggestion')) || keyInsights[0]
  const heroCards = [
    {
      label: 'Strongest pattern',
      title: getInsightName(strongestPattern, topCoverage[0]?.label || 'Keep logging'),
      body: getInsightReason(strongestPattern, topCoverage[0] ? `${topCoverage[0].label} gave this report the clearest signal this week.` : 'The report becomes more useful as your week fills with logs.'),
      tone: 'mint' as const,
    },
    {
      label: 'Best next step',
      title: getInsightName(suggestedPattern, 'Choose one small action'),
      body: getInsightReason(suggestedPattern, summaryPoints[0] || 'Pick one simple habit from the report and repeat it for the next 7 days.'),
      tone: 'sky' as const,
    },
    {
      label: 'Needs attention',
      title: getInsightName(focusPattern, parsedSummary?.dataWarning ? 'Data needs care' : 'Watch the gaps'),
      body: getInsightReason(focusPattern, parsedSummary?.dataWarning || 'Any missing logs or repeated symptoms will stand out here as the report gets more history.'),
      tone: 'amber' as const,
    },
  ]

  const days = reportDays
  const dailyByKey = new Map<string, any>()
  dailyStats.forEach((row: any) => {
    const key = toDateKey(row?.date)
    if (key) dailyByKey.set(key, row)
  })
  const labels = days.map(shortDayName)
  const waterSeries = days.map((day) => Number((hydrationSummary?.dailyTotals || []).find((row: any) => toDateKey(row?.date) === day)?.totalMl ?? dailyByKey.get(day)?.waterMl ?? 0) || 0)
  const calorieSeries = days.map((day) => Number((nutritionSummary?.dailyTotals || []).find((row: any) => toDateKey(row?.date) === day)?.calories ?? dailyByKey.get(day)?.calories ?? 0) || 0)
  const moodSeries = days.map((day) => Number(dailyByKey.get(day)?.moodAvg ?? 0) || 0)
  const symptomSeries = days.map((day) => Number(dailyByKey.get(day)?.symptomCount ?? 0) || 0)
  const exerciseSeries = days.map((day) => Number(dailyByKey.get(day)?.exerciseMinutes ?? 0) || 0)
  const topFoods = Array.isArray(nutritionSummary?.topFoods) ? nutritionSummary.topFoods : []
  const topSymptoms = Array.isArray(symptomSummary?.topSymptoms) ? symptomSummary.topSymptoms : []
  const topActivities = Array.isArray(exerciseSummary?.topActivities) ? exerciseSummary.topActivities : []
  const medicalHighlights = Array.isArray(medicalImageSummary?.highlights) ? medicalImageSummary.highlights : []
  const journalHighlights = Array.isArray(journalSummary?.highlights) ? journalSummary.highlights : []
  const hasSnapshotChart = topCoverage.length > 0
  const hasMacroChart = Number(nutritionSummary?.dailyAverages?.protein_g ?? 0) + Number(nutritionSummary?.dailyAverages?.carbs_g ?? 0) + Number(nutritionSummary?.dailyAverages?.fat_g ?? 0) > 0
  const hasWaterChart = waterSeries.some((v) => v > 0)
  const hasCalorieChart = calorieSeries.some((v) => v > 0)
  const hasMoodChart = moodSeries.filter((v) => v > 0).length >= 2
  const hasSymptomChart = symptomSeries.some((v) => v > 0)
  const hasExerciseChart = exerciseSeries.some((v) => v > 0)
  const hasFoodChart = topFoods.length > 0
  const hasMedicalChart = Number(medicalImageSummary?.entries ?? 0) > 0 || medicalHighlights.length > 0
  const hasJournalChart = Number(journalSummary?.entries ?? 0) > 0 || journalHighlights.length > 0

  if (mode !== 'signedIn') {
    return (
      <Screen style={{ padding: 14 }}>
        <Card>
          <Text style={{ color: theme.colors.text, fontSize: theme.fontSize.pageTitle, fontWeight: '900' }}>Insights</Text>
          <Text style={{ color: theme.colors.muted, marginTop: 8, lineHeight: 20 }}>Please sign in to see your health insights and weekly reports.</Text>
        </Card>
      </Screen>
    )
  }

  if (loading) {
    return (
      <Screen style={{ padding: 14, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={{ color: theme.colors.muted, marginTop: 12, fontWeight: '700' }}>Loading your Insights...</Text>
      </Screen>
    )
  }

  const displayNextReportDueAt = getDisplayNextReportDueAt(weeklyStatus)
  const reportAccessActive = Boolean(weeklyStatus?.reportsEnabled || weeklyStatus?.reportReady || weeklyStatus?.reportLocked || displayNextReportDueAt || reports.length)
  const canManualReport = String(session?.user?.email || '').toLowerCase() === 'info@sonicweb.com.au'

  if (healthSetupComplete === false) {
    return (
      <Screen>
        <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: theme.spacing.xl, gap: 14 }}>
          <Card tone="amber">
            <Text style={{ color: theme.colors.text, fontSize: theme.fontSize.pageTitle, fontWeight: '900' }}>Complete Health Setup first</Text>
            <Text style={{ color: theme.colors.muted, marginTop: 8, lineHeight: 20 }}>
              Insights unlock after your basic profile and at least one real health goal are finished.
            </Text>
            <View style={{ marginTop: 14, gap: 10 }}>
              <PrimaryButton label="Complete Health Setup" onPress={() => goToStackScreen('HealthSetup')} />
              <SecondaryButton label="Back to Dashboard" onPress={() => navigation.navigate('Dashboard')} />
            </View>
          </Card>
        </ScrollView>
      </Screen>
    )
  }

  const renderLanding = () => (
    <View style={{ gap: 14 }}>
      <View>
        <Text style={{ color: theme.colors.text, fontSize: theme.fontSize.pageTitle, fontWeight: '900' }}>Your health focus areas</Text>
        <Text style={{ color: theme.colors.muted, marginTop: 5, lineHeight: 20 }}>Start with your tracked issues, then open your deeper weekly report.</Text>
        {lastLoadedAt ? (
          <Text style={{ color: theme.colors.muted, marginTop: 4, fontSize: 12 }}>Updated {formatDateTimeForLocale(lastLoadedAt)}</Text>
        ) : null}
      </View>

      {error ? (
        <Card tone="rose">
          <Text style={{ color: theme.colors.danger, fontWeight: '900' }}>Could not load Insights</Text>
          <Text style={{ color: theme.colors.muted, marginTop: 5 }}>{error}</Text>
          <View style={{ marginTop: 10 }}>
            <SecondaryButton label="Try again" onPress={() => void loadData()} />
          </View>
        </Card>
      ) : null}

      <Card>
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
          <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: '#ECFDF3', alignItems: 'center', justifyContent: 'center' }}>
            <MaterialCommunityIcons name="chart-line" size={23} color={theme.colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.colors.text, fontSize: theme.fontSize.sectionTitle, fontWeight: '900' }}>7-day health report</Text>
            <Text style={{ color: theme.colors.muted, marginTop: 5, lineHeight: 20 }}>We build this report automatically every 7 days based on how you use Helfi.</Text>
          </View>
        </View>

        {!reportAccessActive ? (
          <Card tone="amber" style={{ marginTop: 14 }}>
            <Text style={{ color: '#92400E', lineHeight: 20 }}>Weekly reports are off by default. Turn them on to get a full, data-driven report each week.</Text>
          </Card>
        ) : null}

        {reportAccessActive && weeklyStatus?.reportReady ? (
          <Text style={{ color: '#047857', fontWeight: '800', marginTop: 12 }}>Your latest report is ready to view.</Text>
        ) : null}
        {reportAccessActive && weeklyStatus?.reportLocked ? (
          <Text style={{ color: '#B45309', fontWeight: '800', marginTop: 12 }}>Your latest report is ready, but needs a subscription or top-up credits to unlock.</Text>
        ) : null}
        {reportAccessActive && countdown ? (
          <View style={{ marginTop: 14, gap: 10 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
              <Text style={{ color: theme.colors.muted, fontSize: 12, fontWeight: '900', textTransform: 'uppercase' }}>Current cycle progress</Text>
              <Text style={{ color: theme.colors.primary, fontSize: 13, fontWeight: '900' }}>{countdown.percent}%</Text>
            </View>
            <ProgressBar percent={countdown.percent} />
            {(weeklyStatus?.status === 'RUNNING' || countdown.dueNow) ? (
              <Card tone="mint" style={{ padding: 10 }}>
                <Text style={{ color: '#047857', lineHeight: 18 }}>Your report is being prepared now. Check back soon.</Text>
              </Card>
            ) : null}
            <Text style={{ color: theme.colors.muted }}>
              Next report due <Text style={{ color: theme.colors.text, fontWeight: '900' }}>{formatDateForLocale(countdown.dueAtMs)}</Text>
            </Text>
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                gap: 8,
                borderWidth: 1,
                borderColor: theme.colors.border,
                borderRadius: 14,
                backgroundColor: '#F9FAFB',
                padding: 10,
              }}
            >
              {[
                { label: 'Days', value: countdown.days },
                { label: 'Hours', value: countdown.hours },
                { label: 'Mins', value: countdown.minutes },
                { label: 'Secs', value: countdown.seconds },
              ].map((item) => (
                <View key={item.label} style={{ flex: 1, minWidth: 64, alignItems: 'center' }}>
                  <Text style={{ color: theme.colors.text, fontSize: 20, fontWeight: '900' }}>{padTime(item.value)}</Text>
                  <Text style={{ color: theme.colors.muted, fontSize: 10, fontWeight: '900', textTransform: 'uppercase' }}>{item.label}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : reportAccessActive && displayNextReportDueAt ? (
          <View style={{ marginTop: 14, gap: 7 }}>
            <Text style={{ color: theme.colors.muted, fontSize: 12, fontWeight: '900', textTransform: 'uppercase' }}>Current cycle progress</Text>
            <ProgressBar percent={weeklyStatus?.reportReady ? 100 : 60} />
            <Text style={{ color: theme.colors.muted }}>Next report due {formatDateForLocale(displayNextReportDueAt)}</Text>
          </View>
        ) : null}

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16 }}>
          {reportAccessActive ? (
            weeklyStatus?.reportReady || reports.length ? (
              <View style={{ flexGrow: 1 }}>
                <PrimaryButton label="View report" onPress={() => openReport()} />
              </View>
            ) : weeklyStatus?.reportLocked ? (
              <View style={{ flexGrow: 1 }}>
                <PrimaryButton label="Unlock report" onPress={() => goToStackScreen('Billing')} />
              </View>
            ) : (
              <View style={{ flexGrow: 1 }}>
                <SecondaryButton label="Edit Health Setup" onPress={() => goToStackScreen('HealthSetup')} />
              </View>
            )
          ) : (
            <>
              <View style={{ flexGrow: 1 }}>
                <PrimaryButton label="Turn on weekly reports" onPress={enableWeeklyReports} />
              </View>
              <View style={{ flexGrow: 1 }}>
                <SecondaryButton label="Upgrade for reports" onPress={() => goToStackScreen('Billing')} />
              </View>
            </>
          )}
        </View>

        {canManualReport && reportAccessActive ? (
          <View style={{ marginTop: 12, gap: 8 }}>
            <SecondaryButton label="Create report now" onPress={createReportNow} disabled={progressActive || weeklyStatus?.status === 'RUNNING'} />
            <Text style={{ color: theme.colors.muted, fontSize: 12 }}>Makes a fresh report from your last 7 days.</Text>
          </View>
        ) : null}

        {progressActive ? (
          <View style={{ marginTop: 12, gap: 5 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ color: theme.colors.muted, fontSize: 12 }}>{progressStage}</Text>
              <Text style={{ color: theme.colors.muted, fontSize: 12 }}>{progressPercent}%</Text>
            </View>
            <ProgressBar percent={progressPercent} />
          </View>
        ) : null}
        {busyMessage ? <Text style={{ color: theme.colors.primary, fontWeight: '800', marginTop: 10 }}>{busyMessage}</Text> : null}
      </Card>

      {issues.length === 0 ? (
        <Card>
          <Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: '900' }}>No health issues tracked yet</Text>
          <Text style={{ color: theme.colors.muted, marginTop: 6, lineHeight: 20 }}>Add issues through Health Intake or Health Tracking so Helfi can generate focused insights for you.</Text>
        </Card>
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <View style={{ padding: 14, borderBottomWidth: 1, borderBottomColor: theme.colors.border, flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
            <Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: '900' }}>Tracked issues</Text>
            <Text style={{ color: theme.colors.muted, fontSize: 11, fontWeight: '900', textTransform: 'uppercase' }}>Tap to open workspace</Text>
          </View>
          {issues.map((issue, index) => {
            const colors = issueStatusColors(issue.status)
            const ratingText = issue.currentRating !== null ? `${issue.currentRating}/${issue.ratingScaleMax ?? 6}` : null
            return (
              <Pressable
                key={issue.id || issue.slug}
                onPress={() => openIssue(issue)}
                accessibilityRole="button"
                accessibilityLabel={`Open ${issue.name} workspace`}
                style={({ pressed }) => ({
                  opacity: pressed ? 0.86 : 1,
                  padding: 14,
                  borderTopWidth: index === 0 ? 0 : 1,
                  borderTopColor: theme.colors.border,
                  backgroundColor: '#FFFFFF',
                })}
              >
                <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
                  <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#ECFDF3', alignItems: 'center', justifyContent: 'center' }}>
                    <Feather name="zap" size={17} color={theme.colors.primary} />
                  </View>
                  <View style={{ flex: 1, gap: 6 }}>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, alignItems: 'center' }}>
                      <View style={{ borderWidth: 1, borderColor: colors.borderColor, backgroundColor: colors.backgroundColor, borderRadius: 999, paddingVertical: 3, paddingHorizontal: 8 }}>
                        <Text style={{ color: colors.color, fontSize: 11, fontWeight: '900' }}>{issue.severityLabel || 'Needs data'}</Text>
                      </View>
                      {ratingText ? <Text style={{ color: theme.colors.muted, fontSize: 12, fontWeight: '800' }}>{ratingText}</Text> : null}
                    </View>
                    <Text style={{ color: theme.colors.text, fontSize: 16, fontWeight: '900' }}>{issue.name}</Text>
                    <Text style={{ color: theme.colors.muted, lineHeight: 19, fontSize: 13 }}>{issue.highlight || 'Open the workspace to see personalised guidance.'}</Text>
                    {issue.lastUpdated ? <Text style={{ color: '#9CA3AF', fontSize: 12 }}>Last updated {formatDateForLocale(issue.lastUpdated)}</Text> : null}
                    {issue.blockers?.length ? <Text style={{ color: '#B45309', fontSize: 12, lineHeight: 17 }}>Next step: {issue.blockers[0]}</Text> : null}
                  </View>
                  <Feather name="chevron-right" size={21} color={theme.colors.muted} />
                </View>
              </Pressable>
            )
          })}
        </Card>
      )}

      {reports.length ? (
        <Card>
          <Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: '900' }}>Previous reports</Text>
          <View style={{ gap: 10, marginTop: 12 }}>
            {reports.slice(0, 6).map((item) => (
              <Pressable
                key={item.id}
                onPress={() => openReport(item.id)}
                accessibilityRole="button"
                accessibilityLabel={`Open report ${formatDateRange(item.periodStart, item.periodEnd)}`}
                style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
              >
                <Card tone="white" style={{ padding: 12 }}>
                  <Text style={{ color: theme.colors.text, fontWeight: '900' }}>{formatDateRange(item.periodStart, item.periodEnd)}</Text>
                  <Text style={{ color: theme.colors.muted, fontSize: 12, marginTop: 3 }}>Generated {formatDateForLocale(item.createdAt)}</Text>
                </Card>
              </Pressable>
            ))}
          </View>
        </Card>
      ) : (
        <Card>
          <Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: '900' }}>No report yet</Text>
          <Text style={{ color: theme.colors.muted, marginTop: 6, lineHeight: 20 }}>Your weekly report will appear here once your first 7 days of data are complete.</Text>
          {displayNextReportDueAt ? <Text style={{ color: theme.colors.muted, marginTop: 10 }}>Next report due: {formatDateForLocale(displayNextReportDueAt)}</Text> : null}
        </Card>
      )}
    </View>
  )

  const renderSummary = () => (
    <View style={{ gap: 14 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {heroCards.map((card) => (
          <View key={card.label} style={{ flexBasis: '100%' }}>
            <Card tone={card.tone}>
              <Text style={{ color: theme.colors.muted, fontSize: 11, fontWeight: '900', textTransform: 'uppercase' }}>{card.label}</Text>
              <Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: '900', marginTop: 5 }}>{card.title}</Text>
              <Text style={{ color: theme.colors.muted, lineHeight: 20, marginTop: 5 }}>{card.body}</Text>
            </Card>
          </View>
        ))}
      </View>
      {summaryPoints.length > 1 ? (
        <Card>
          <Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: '900' }}>What changed this week</Text>
          <View style={{ gap: 10, marginTop: 12 }}>
            {summaryPoints.slice(1, 4).map((point, idx) => (
              <InfoItem key={`summary-point-${idx}`} title={point} />
            ))}
          </View>
        </Card>
      ) : null}
      {reports.length > 1 ? (
        <Card>
          <Text style={{ color: theme.colors.text, fontSize: 16, fontWeight: '900' }}>Previous reports</Text>
          <View style={{ gap: 10, marginTop: 12 }}>
            {reports.slice(0, 5).map((item) => (
              <Pressable key={item.id} onPress={() => openReport(item.id)} style={({ pressed }) => ({ opacity: pressed ? 0.86 : 1 })}>
                <InfoItem title={formatDateRange(item.periodStart, item.periodEnd)} body={`Generated ${formatDateForLocale(item.createdAt)}`} />
              </Pressable>
            ))}
          </View>
        </Card>
      ) : null}
    </View>
  )

  const renderCharts = () => (
    <View style={{ gap: 12 }}>
      <Card>
        <Text style={{ color: theme.colors.text, fontSize: 22, fontWeight: '900' }}>Charts</Text>
        <Text style={{ color: theme.colors.muted, marginTop: 5, lineHeight: 20 }}>Open each chart section to compare this week and find what changed.</Text>
        {Number(hydrationSummary?.entries ?? 0) > 0 ? (
          <View style={{ alignSelf: 'flex-start', marginTop: 10, borderRadius: 999, backgroundColor: '#EFF8FF', borderWidth: 1, borderColor: '#BDE3FF', paddingVertical: 7, paddingHorizontal: 10 }}>
            <Text style={{ color: '#075985', fontWeight: '900' }}>Hydration: {formatMl(hydrationSummary?.dailyAverageMl)} average per day</Text>
          </View>
        ) : null}
      </Card>
      {hasSnapshotChart ? <ChartDisclosure
        id="snapshot"
        eyebrow="Your week"
        title="Quick snapshot"
        summary={`${coverage?.daysActive ?? 0} active days and ${coverage?.totalEvents ?? 0} total entries.`}
        open={openCharts.snapshot}
        onToggle={() => setOpenCharts((prev) => ({ ...prev, snapshot: !prev.snapshot }))}
      >
        {topCoverage.length ? (
          <View style={{ gap: 10 }}>
            {topCoverage.map((item) => (
              <View key={item.label} style={{ gap: 5 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ color: theme.colors.text, fontWeight: '800' }}>{item.label}</Text>
                  <Text style={{ color: theme.colors.muted }}>{formatCompactNumber(item.value)}</Text>
                </View>
                <ProgressBar percent={(item.value / maxCoverage) * 100} />
              </View>
            ))}
          </View>
        ) : (
          <EmptyBox message="Start logging during the week and this snapshot will fill with your strongest data sources." />
        )}
      </ChartDisclosure> : null}
      {hasMacroChart ? <ChartDisclosure
        id="macros"
        eyebrow="Nutrition"
        title="Macro split"
        summary="Protein, carbs, and fat balance for the week."
        open={openCharts.macros}
        onToggle={() => setOpenCharts((prev) => ({ ...prev, macros: !prev.macros }))}
      >
        {Number(nutritionSummary?.dailyAverages?.protein_g ?? 0) + Number(nutritionSummary?.dailyAverages?.carbs_g ?? 0) + Number(nutritionSummary?.dailyAverages?.fat_g ?? 0) > 0 ? (
          <View style={{ gap: 10 }}>
            {[
              ['Protein', nutritionSummary?.dailyAverages?.protein_g, '#059669'],
              ['Carbs', nutritionSummary?.dailyAverages?.carbs_g, '#34D399'],
              ['Fat', nutritionSummary?.dailyAverages?.fat_g, '#0EA5E9'],
            ].map(([label, value, color]) => (
              <View key={String(label)} style={{ gap: 5 }}>
                <Text style={{ color: theme.colors.text, fontWeight: '900' }}>{String(label)}: {Math.round(Number(value) || 0)}g per day</Text>
                <ProgressBar percent={Math.min(100, (Number(value) || 0) * 2)} color={String(color)} />
              </View>
            ))}
          </View>
        ) : (
          <EmptyBox message="Not enough nutrition data to calculate macros yet. This will appear once your food logs include nutrition details." />
        )}
      </ChartDisclosure> : null}
      {hasWaterChart ? <ChartDisclosure id="hydration" eyebrow="Hydration" title="Water per day" summary={`Average: ${formatMl(hydrationSummary?.dailyAverageMl)} per day.`} open={openCharts.hydration} onToggle={() => setOpenCharts((prev) => ({ ...prev, hydration: !prev.hydration }))}>
        {waterSeries.some((v) => v > 0) ? <SimpleBarChart labels={labels} values={waterSeries} color="#38BDF8" /> : <EmptyBox message="No water logs this week yet. Add a water entry and this chart will appear." />}
      </ChartDisclosure> : null}
      {hasCalorieChart ? <ChartDisclosure id="calories" eyebrow="Calories" title="Food energy" summary="Daily calories, with the biggest changes highlighted." open={openCharts.calories} onToggle={() => setOpenCharts((prev) => ({ ...prev, calories: !prev.calories }))}>
        {calorieSeries.some((v) => v > 0) ? <SimpleBarChart labels={labels} values={calorieSeries} color="#F59E0B" /> : <EmptyBox message="No calorie data to chart yet. This appears when food logs include calories." />}
      </ChartDisclosure> : null}
      {hasMoodChart ? <ChartDisclosure id="mood" eyebrow="Mood" title="Mood trend" summary="Average mood per day." open={openCharts.mood} onToggle={() => setOpenCharts((prev) => ({ ...prev, mood: !prev.mood }))}>
        {moodSeries.filter((v) => v > 0).length >= 2 ? <SimpleBarChart labels={labels} values={moodSeries} color="#3B82F6" /> : <EmptyBox message="Not enough mood entries to chart a trend yet. Add a few mood check-ins this week." />}
      </ChartDisclosure> : null}
      {hasSymptomChart ? <ChartDisclosure id="symptoms" eyebrow="Symptoms" title="Symptom load" summary="How many symptoms showed up each day." open={openCharts.symptoms} onToggle={() => setOpenCharts((prev) => ({ ...prev, symptoms: !prev.symptoms }))}>
        {symptomSeries.some((v) => v > 0) ? <SimpleBarChart labels={labels} values={symptomSeries} color="#F472B6" /> : <EmptyBox message="No symptom entries to chart yet. If you create symptom notes, this will appear." />}
      </ChartDisclosure> : null}
      {hasExerciseChart ? <ChartDisclosure id="exercise" eyebrow="Exercise" title="Minutes per day" summary="Total minutes logged." open={openCharts.exercise} onToggle={() => setOpenCharts((prev) => ({ ...prev, exercise: !prev.exercise }))}>
        {exerciseSeries.some((v) => v > 0) ? <SimpleBarChart labels={labels} values={exerciseSeries} color="#6366F1" /> : <EmptyBox message="No exercise entries this week yet. Add a workout to see this chart." />}
      </ChartDisclosure> : null}
      {hasFoodChart ? <ChartDisclosure id="foods" eyebrow="Top foods" title="Most common picks" summary="Based on your logged foods." open={openCharts.foods} onToggle={() => setOpenCharts((prev) => ({ ...prev, foods: !prev.foods }))}>
        {topFoods.length ? topFoods.slice(0, 6).map((row: any, idx: number) => <InfoItem key={`food-${idx}`} title={row.name || 'Food'} body={`${row.count ?? 0}`} />) : <EmptyBox message="No food patterns to show yet. Once you log a few meals, your top foods will appear here." />}
      </ChartDisclosure> : null}
      {hasMedicalChart ? <ChartDisclosure id="scans" eyebrow="Health image notes" title="Saved image-note highlights" summary={`${Number(medicalImageSummary?.entries ?? 0) || 0} scans across ${Number(medicalImageSummary?.daysWithScans ?? 0) || 0} days.`} open={openCharts.scans} onToggle={() => setOpenCharts((prev) => ({ ...prev, scans: !prev.scans }))}>
        {medicalHighlights.length ? medicalHighlights.slice(0, 3).map((item: any, idx: number) => <InfoItem key={`scan-${idx}`} title={item.summary || 'Saved health image note'} body={[item.date, item.time].filter(Boolean).join(' - ')} />) : <EmptyBox message="No saved health image notes this week yet. If you save notes, a summary will show here." />}
      </ChartDisclosure> : null}
      {hasJournalChart ? <ChartDisclosure id="journal" eyebrow="Health journal" title="Recent notes" summary={`${Number(journalSummary?.entries ?? 0) || 0} notes across ${Number(journalSummary?.daysWithNotes ?? 0) || 0} days.`} open={openCharts.journal} onToggle={() => setOpenCharts((prev) => ({ ...prev, journal: !prev.journal }))}>
        {journalHighlights.length ? journalHighlights.slice(0, 3).map((item: any, idx: number) => <InfoItem key={`journal-${idx}`} title={[item.date, item.time].filter(Boolean).join(' - ') || 'Journal note'} body={item.note || 'Saved note'} />) : <EmptyBox message="No health journal notes this week yet. If you add notes, they will show up here." />}
      </ChartDisclosure> : null}
      {!hasSnapshotChart && !hasMacroChart && !hasWaterChart && !hasCalorieChart && !hasMoodChart && !hasSymptomChart && !hasExerciseChart && !hasFoodChart && !hasMedicalChart && !hasJournalChart ? (
        <EmptyBox message="Charts will appear here once this report has enough real data to show." />
      ) : null}
    </View>
  )

  const renderInsights = () => (
    <View style={{ gap: 14 }}>
      <Card>
        <Text style={{ color: theme.colors.text, fontSize: 22, fontWeight: '900' }}>Insights</Text>
        <Text style={{ color: theme.colors.muted, marginTop: 5 }}>The main takeaways and coaching notes from this report.</Text>
      </Card>
      {keyInsights.length ? (
        <Card>
          <Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: '900' }}>Key insights this week</Text>
          <Text style={{ color: theme.colors.muted, marginTop: 5 }}>These are the most important signals from your last 7 days.</Text>
          <View style={{ gap: 10, marginTop: 12 }}>
            {keyInsights.map((insight, idx) => (
              <InfoItem key={`${insight.label}-${idx}`} title={`${insight.label}: ${insight.name || 'Insight'}`} body={insight.reason || ''} />
            ))}
          </View>
        </Card>
      ) : null}
      {talkToAiSummary?.userMessageCount ? (
        <Card tone="sky">
          <Text style={{ color: '#075985', fontSize: 18, fontWeight: '900' }}>Talk to Helfi highlights</Text>
          <Text style={{ color: '#075985', marginTop: 5 }}>{talkToAiSummary.userMessageCount} chat {talkToAiSummary.userMessageCount === 1 ? 'prompt' : 'prompts'}{talkToAiSummary.activeDays ? ` across ${talkToAiSummary.activeDays} days` : ''}.</Text>
          <View style={{ alignSelf: 'flex-start', marginTop: 10 }}>
            <SecondaryButton label="Open chat log" onPress={openChatLog} />
          </View>
          <View style={{ gap: 8, marginTop: 10 }}>
            {(talkToAiSummary.highlights || []).slice(-3).map((item: any, idx: number) => <InfoItem key={`talk-${idx}`} title={item.content || 'Chat highlight'} />)}
          </View>
        </Card>
      ) : null}
      {medicalImageSummary?.entries ? (
        <Card tone="sky">
          <Text style={{ color: '#075985', fontSize: 18, fontWeight: '900' }}>Health image notes</Text>
          <Text style={{ color: '#075985', marginTop: 5 }}>{medicalImageSummary.entries} saved image note{medicalImageSummary.entries === 1 ? '' : 's'}{medicalImageSummary.daysWithScans ? ` across ${medicalImageSummary.daysWithScans} days` : ''}.</Text>
          <View style={{ gap: 8, marginTop: 10 }}>
            {medicalHighlights.slice(0, 3).map((item: any, idx: number) => <InfoItem key={`medical-${idx}`} title={item.summary || 'Saved health image note'} body={(item.nextSteps || []).slice(0, 2).join('\n')} />)}
          </View>
        </Card>
      ) : null}
      {(wins.length > 0 || gaps.length > 0) ? (
        <View style={{ gap: 12 }}>
          <Card tone="mint">
            <Text style={{ color: '#065F46', fontSize: 18, fontWeight: '900' }}>Areas improving</Text>
            <View style={{ gap: 8, marginTop: 10 }}>
              {wins.length ? wins.map((item: any, idx: number) => <InfoItem key={`win-${idx}`} title={item.name || 'Win'} body={item.reason || ''} />) : <Text style={{ color: '#047857' }}>Keep logging to highlight real wins here.</Text>}
            </View>
          </Card>
          <Card tone="amber">
            <Text style={{ color: '#92400E', fontSize: 18, fontWeight: '900' }}>Areas to work on</Text>
            <View style={{ gap: 8, marginTop: 10 }}>
              {gaps.length ? gaps.map((item: any, idx: number) => <InfoItem key={`gap-${idx}`} title={item.name || 'Gap'} body={item.reason || ''} />) : <Text style={{ color: '#92400E' }}>No big gaps flagged this week.</Text>}
            </View>
          </Card>
        </View>
      ) : null}
    </View>
  )

  const renderDetails = () => (
    <View style={{ gap: 14 }}>
      <Card>
        <Text style={{ color: theme.colors.text, fontSize: 22, fontWeight: '900' }}>Details</Text>
        <Text style={{ color: theme.colors.muted, marginTop: 5 }}>Deeper notes by health area.</Text>
      </Card>
      {detailComparisons.length ? (
        <View style={{ gap: 10 }}>
          {detailComparisons.map((item) => (
            <Card key={item.label} tone="white">
              <Text style={{ color: theme.colors.muted, fontSize: 11, fontWeight: '900', textTransform: 'uppercase' }}>{item.label}</Text>
              <Text style={{ color: theme.colors.text, fontWeight: '900', marginTop: 5 }}>{item.text}</Text>
            </Card>
          ))}
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {availableSections.map((section) => (
          <Pill key={section.key} label={section.label} active={activeSection === section.key} onPress={() => setActiveSection(section.key)} />
        ))}
      </View>
      {activeSection === 'supplements' && supplementsList.length ? (
        <Card tone="mint">
          <Text style={{ color: '#065F46', fontSize: 18, fontWeight: '900' }}>Your supplements</Text>
          <Text style={{ color: '#047857', marginTop: 5 }}>This is your current supplement list. The report text below should explain what looks helpful for your goals.</Text>
          <View style={{ gap: 8, marginTop: 10 }}>
            {supplementsList.map((s: any, idx: number) => (
              <InfoItem key={`${s?.name || 'supplement'}-${idx}`} title={s?.name || 'Supplement'} body={(s?.dosage || s?.timing) ? `${s?.dosage ? `Dose: ${s.dosage}` : 'Dose: -'} - ${s?.timing ? `Timing: ${s.timing}` : 'Timing: -'}` : 'Dose/timing not set'} />
            ))}
          </View>
        </Card>
      ) : null}
      {activeSection === 'medications' && medicationsList.length ? (
        <Card tone="sky">
          <Text style={{ color: '#075985', fontSize: 18, fontWeight: '900' }}>Your medications</Text>
          <Text style={{ color: '#075985', marginTop: 5 }}>This is your current medication list. The report text below should connect it to your goals and safety notes.</Text>
          <View style={{ gap: 8, marginTop: 10 }}>
            {medicationsList.map((m: any, idx: number) => (
              <InfoItem key={`${m?.name || 'medication'}-${idx}`} title={m?.name || 'Medication'} body={(m?.dosage || m?.timing) ? `${m?.dosage ? `Dose: ${m.dosage}` : 'Dose: -'} - ${m?.timing ? `Timing: ${m.timing}` : 'Timing: -'}` : 'Dose/timing not set'} />
            ))}
          </View>
        </Card>
      ) : null}
      <SectionBucketPanel title="What's working" bucket="working" items={displaySections?.[activeSection]?.working || []} open={openDetailBucket === 'working'} onToggle={() => setOpenDetailBucket((current) => (current === 'working' ? null : 'working'))} />
      <SectionBucketPanel title="Suggestions" bucket="suggested" items={displaySections?.[activeSection]?.suggested || []} open={openDetailBucket === 'suggested'} onToggle={() => setOpenDetailBucket((current) => (current === 'suggested' ? null : 'suggested'))} />
      <SectionBucketPanel title="Things to avoid" bucket="avoid" items={displaySections?.[activeSection]?.avoid || []} open={openDetailBucket === 'avoid'} onToggle={() => setOpenDetailBucket((current) => (current === 'avoid' ? null : 'avoid'))} />
    </View>
  )

  const renderReport = () => {
    if (!selectedReport) return renderLanding()
    if (selectedReport.status === 'LOCKED') {
      return (
        <Card tone="sky">
          <Text style={{ color: theme.colors.text, fontSize: 24, fontWeight: '900' }}>7-day health report</Text>
          <Text style={{ color: theme.colors.muted, marginTop: 8 }}>Your weekly report is ready, but it requires an active subscription or top-up credits.</Text>
          <View style={{ marginTop: 14, gap: 10 }}>
            <PrimaryButton label="View plans" onPress={() => goToStackScreen('Billing')} />
            <SecondaryButton label="Back to Insights" onPress={() => setSelectedReportId(null)} />
          </View>
        </Card>
      )
    }
    if (selectedReport.status === 'RUNNING') {
      return (
        <Card>
          <Text style={{ color: theme.colors.text, fontSize: 24, fontWeight: '900' }}>7-day health report</Text>
          <Text style={{ color: theme.colors.muted, marginTop: 8 }}>Your report is being generated in the background. Check back in a few minutes.</Text>
          <View style={{ marginTop: 14 }}>
            <SecondaryButton label="Back to Insights" onPress={() => setSelectedReportId(null)} />
          </View>
        </Card>
      )
    }
    if (selectedReport.status === 'FAILED') {
      return (
        <Card tone="rose">
          <Text style={{ color: theme.colors.text, fontSize: 24, fontWeight: '900' }}>7-day health report</Text>
          <Text style={{ color: theme.colors.muted, marginTop: 8 }}>We could not generate this report. Please try again later.</Text>
          <View style={{ marginTop: 14, gap: 10 }}>
            {canManualReport ? <PrimaryButton label="Create report now" onPress={createReportNow} /> : null}
            <SecondaryButton label="Back to Insights" onPress={() => setSelectedReportId(null)} />
          </View>
        </Card>
      )
    }

    return (
      <View style={{ gap: 14 }}>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <SecondaryButton label="Back to Insights" onPress={() => setSelectedReportId(null)} />
          </View>
          <View style={{ flex: 1 }}>
            <SecondaryButton label="Save as PDF" onPress={openPdf} />
          </View>
        </View>
        {parsedSummary?.dataWarning ? (
          <Card tone="amber">
            <Text style={{ color: '#92400E', lineHeight: 20 }}>{parsedSummary.dataWarning}</Text>
          </Card>
        ) : null}
        <Card>
          <Text style={{ color: theme.colors.primary, fontWeight: '900' }}>{formatDateRange(selectedReport.periodStart, selectedReport.periodEnd)}</Text>
          <Text style={{ color: theme.colors.text, fontSize: theme.fontSize.pageTitle, lineHeight: 29, fontWeight: '900', marginTop: 8 }}>7-day health report</Text>
          <Text style={{ color: theme.colors.muted, lineHeight: 23, marginTop: 8 }}>{summaryPoints[0] || replaceIsoDates(summaryText)}</Text>
          <View style={{ gap: 10, marginTop: 16 }}>
            <StatCard label="Active days" value={`${daysActive}/7`} note="Days with useful data" />
            <StatCard label="Report strength" value={strengthLabel(reportStrength)} note={`${reportStrength}% data signal`} tone="mint" />
            <StatCard label="Entries used" value={formatCompactNumber(coverage?.totalEvents ?? 0)} note="Across your week" tone="sky" />
          </View>
        </Card>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {REPORT_NAV_ITEMS.map((item) => (
            <Pressable
              key={item.key}
              accessibilityRole="button"
              accessibilityLabel={item.label}
              accessibilityState={{ selected: reportNav === item.key }}
              hitSlop={6}
              onPress={() => setReportNav(item.key)}
              style={({ pressed }) => ({
                opacity: pressed ? 0.84 : 1,
                flexGrow: 1,
                flexBasis: '47%',
                backgroundColor: reportNav === item.key ? theme.colors.primary : '#FFFFFF',
                borderColor: reportNav === item.key ? theme.colors.primary : theme.colors.border,
                borderWidth: 1,
                borderRadius: 14,
                padding: 12,
                flexDirection: 'row',
                justifyContent: 'center',
                alignItems: 'center',
                gap: 7,
              })}
            >
              <Feather name={item.icon} size={16} color={reportNav === item.key ? '#FFFFFF' : theme.colors.text} />
              <Text style={{ color: reportNav === item.key ? '#FFFFFF' : theme.colors.text, fontWeight: '900' }}>{item.label}</Text>
            </Pressable>
          ))}
        </View>
        {reportNav === 'summary' ? (
          <Card tone="dark">
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#FFFFFF', fontSize: 20, fontWeight: '900' }}>Weekly snapshot</Text>
                <Text style={{ color: '#CFFAEA', marginTop: 5, lineHeight: 20 }}>A simple view of how much useful information Helfi had to work with.</Text>
              </View>
              <Text style={{ color: '#A7F3D0', fontWeight: '900' }}>{daysActive} days</Text>
            </View>
            <View style={{ marginTop: 18, gap: 10 }}>
              <Text style={{ color: '#FFFFFF', fontSize: 38, fontWeight: '900', textAlign: 'center' }}>{reportStrength}</Text>
              <Text style={{ color: '#CFFAEA', fontWeight: '800', textAlign: 'center' }}>out of 100 report strength</Text>
              <ProgressBar percent={reportStrength} color="#10B981" />
            </View>
            <View style={{ flexDirection: 'row', gap: 5, marginTop: 18 }}>
              {days.map((day) => {
                const active = activeDayKeys.has(day)
                return (
                  <View key={day} style={{ flex: 1, borderWidth: 1, borderColor: active ? '#6EE7B7' : '#334155', backgroundColor: active ? 'rgba(16,185,129,0.25)' : 'rgba(255,255,255,0.06)', borderRadius: 10, paddingVertical: 8, alignItems: 'center' }}>
                    <Text style={{ color: active ? '#D1FAE5' : '#94A3B8', fontSize: 10, fontWeight: '900' }}>{shortDayName(day)}</Text>
                    <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: active ? '#6EE7B7' : '#475569', marginTop: 6 }} />
                  </View>
                )
              })}
            </View>
            <View style={{ gap: 9, marginTop: 18 }}>
              {topCoverage.length ? topCoverage.map((item) => (
                <View key={item.label}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ color: '#F8FAFC', fontWeight: '800' }}>{item.label}</Text>
                    <Text style={{ color: '#A7F3D0' }}>{formatCompactNumber(item.value)}</Text>
                  </View>
                  <View style={{ marginTop: 5 }}>
                    <ProgressBar percent={(item.value / maxCoverage) * 100} color="#6EE7B7" />
                  </View>
                </View>
              )) : <Text style={{ color: '#CBD5E1' }}>Start logging during the week and this snapshot will fill with your strongest data sources.</Text>}
            </View>
          </Card>
        ) : null}
        {reportNav === 'summary' ? renderSummary() : null}
        {reportNav === 'visuals' ? renderCharts() : null}
        {reportNav === 'insights' ? renderInsights() : null}
        {reportNav === 'sections' ? renderDetails() : null}
      </View>
    )
  }

  return (
    <Screen>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ padding: 14, paddingBottom: theme.spacing.xl, gap: 14 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
      >
        {selectedReport ? renderReport() : renderLanding()}
      </ScrollView>
    </Screen>
  )
}
