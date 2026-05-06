'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { WeeklyReportRecord } from '@/lib/weekly-health-report'
import ReportVisuals from './ReportVisuals'

const SECTIONS = [
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
] as const

type SectionKey = (typeof SECTIONS)[number]['key']

const REPORT_NAV_ITEMS = [
  { key: 'summary', label: 'Summary', target: 'summary' },
  { key: 'visuals', label: 'Charts', target: 'visuals' },
  { key: 'insights', label: 'Insights', target: 'insights' },
  { key: 'sections', label: 'Details', target: 'sections' },
] as const

type ReportNavKey = (typeof REPORT_NAV_ITEMS)[number]['key']

type WeeklyReportClientProps = {
  report: WeeklyReportRecord | null
  reports: WeeklyReportRecord[]
  nextReportDueAt: string | null
  canManualReport: boolean
  reportsEnabled?: boolean
}

function SectionBucket({ title, items }: { title: string; items: Array<{ name?: string; reason?: string }> }) {
  if (!items?.length) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">
        No data yet for this area.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {items.map((item, idx) => (
        <div key={`${title}-${idx}`} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="font-semibold text-gray-900">{replaceIsoDates(item.name || 'Insight')}</div>
          <div className="mt-1 space-y-1 text-sm text-gray-600">
            {(splitIntoLines(item.reason || 'Keep logging for more detail.') || []).map((line, lineIdx) => (
              <p key={`${title}-${idx}-line-${lineIdx}`}>{line}</p>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function formatMl(value: number | null | undefined) {
  const ml = Number(value ?? 0)
  if (!Number.isFinite(ml) || ml <= 0) return '0 ml'
  if (ml >= 1000) {
    const liters = Math.round((ml / 1000) * 100) / 100
    return `${liters.toString().replace(/\.0+$/, '').replace(/(\.[1-9])0$/, '$1')} L`
  }
  return `${Math.round(ml)} ml`
}

function formatDateForLocale(value?: string | Date | null) {
  if (!value) return ''
  const date = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }).format(date)
}

function formatDateRange(start?: string | null, end?: string | null) {
  const startText = start ? formatDateForLocale(start) : ''
  const endText = end ? formatDateForLocale(end) : ''
  if (startText && endText) return `${startText} to ${endText}`
  return startText || endText || ''
}

function replaceIsoDates(text: string) {
  if (!text) return ''
  return text.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (_match, y, m, d) => {
    const date = new Date(Number(y), Number(m) - 1, Number(d))
    if (Number.isNaN(date.getTime())) return `${y}-${m}-${d}`
    return formatDateForLocale(date)
  })
}

function splitIntoPoints(text: string) {
  const cleaned = replaceIsoDates(text).replace(/\r/g, '').trim()
  if (!cleaned) return []
  const lines = cleaned.split(/\n+/)
  const points = lines.flatMap((line) => {
    const normalized = line.replace(/([.!?])\s+(?=[A-Z0-9])/g, '$1|')
    return normalized.split('|')
  })
  return points.map((line) => line.replace(/^[-•]\s*/, '').trim()).filter(Boolean)
}

function splitIntoLines(text: string) {
  const cleaned = replaceIsoDates(text).replace(/\r/g, '').trim()
  if (!cleaned) return []
  const lines = cleaned.split(/\n+/)
  return lines.map((line) => line.replace(/^[-•]\s*/, '').trim()).filter(Boolean)
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

function formatCompactNumber(value: number | null | undefined) {
  const amount = Number(value ?? 0)
  if (!Number.isFinite(amount)) return '0'
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(amount)
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

function getInsightName(item: any, fallback: string) {
  return replaceIsoDates(String(item?.name || item?.label || fallback))
}

function getInsightReason(item: any, fallback: string) {
  return replaceIsoDates(String(item?.reason || item?.summary || fallback))
}

function hasBucketItems(section: any) {
  return ['working', 'suggested', 'avoid'].some((bucket) => Array.isArray(section?.[bucket]) && section[bucket].length > 0)
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

function isReportNavKey(value: string | null): value is ReportNavKey {
  return REPORT_NAV_ITEMS.some((item) => item.key === value)
}

export default function WeeklyReportClient({ report, reports, nextReportDueAt, canManualReport, reportsEnabled = true }: WeeklyReportClientProps) {
  const [activeTab, setActiveTab] = useState<SectionKey>('overview')
  const [activeReportNav, setActiveReportNav] = useState<ReportNavKey>('summary')
  const router = useRouter()
  const [manualStatus, setManualStatus] = useState<'idle' | 'running' | 'error'>('idle')
  const [manualMessage, setManualMessage] = useState<string | null>(null)
  const [progressPercent, setProgressPercent] = useState(0)
  const [progressStage, setProgressStage] = useState('Getting your data')
  const [progressActive, setProgressActive] = useState(false)
  const progressTimerRef = useRef<number | null>(null)

  const scrollTo = useCallback((id: string) => {
    try {
      const el = document.getElementById(id)
      if (!el) return
      if (el instanceof HTMLDetailsElement) {
        el.open = true
      }
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    try {
      const tab = new URLSearchParams(window.location.search).get('tab')
      if (isReportNavKey(tab)) {
        setActiveReportNav(tab)
      }
    } catch {
      // ignore
    }
  }, [])

  const payload = useMemo(() => {
    if (!report || !report.report) return null
    if (typeof report.report === 'string') {
      try {
        return JSON.parse(report.report)
      } catch {
        return null
      }
    }
    if (typeof report.report !== 'object') return null
    return report.report as any
  }, [report])

  const sections = useMemo(() => payload?.sections || {}, [payload])
  const wins = Array.isArray(payload?.wins) ? payload.wins : []
  const gaps = Array.isArray(payload?.gaps) ? payload.gaps : []
  const keyInsights = useMemo(() => {
    const picks: Array<{ label: string; name?: string; reason?: string }> = []
    const tryPick = (sectionKey: SectionKey, label: string, bucket: 'suggested' | 'avoid' | 'working') => {
      const item = sections?.[sectionKey]?.[bucket]?.[0]
      if (item?.name || item?.reason) {
        picks.push({ label, name: item.name, reason: item.reason })
      }
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
  }, [sections])
  const parsedSummary = useMemo(() => {
    if (!report?.dataSummary) return null
    if (typeof report.dataSummary === 'string') {
      try {
        return JSON.parse(report.dataSummary)
      } catch {
        return null
      }
    }
    if (typeof report.dataSummary !== 'object') return null
    return report.dataSummary as any
  }, [report])

  const previousReport = useMemo(() => {
    return reports.find((item) => item.id !== report?.id && item.status === 'READY' && item.dataSummary) || null
  }, [report?.id, reports])

  const previousParsedSummary = useMemo(() => {
    if (!previousReport?.dataSummary) return null
    if (typeof previousReport.dataSummary === 'string') {
      try {
        return JSON.parse(previousReport.dataSummary)
      } catch {
        return null
      }
    }
    if (typeof previousReport.dataSummary !== 'object') return null
    return previousReport.dataSummary as any
  }, [previousReport])

  const dataWarning = (parsedSummary as any)?.dataWarning as string | null
  const talkToAiSummary = (parsedSummary as any)?.talkToAiSummary as
    | {
        messageCount?: number
        userMessageCount?: number
        assistantMessageCount?: number
        activeDays?: number
        topics?: Array<{ topic?: string; section?: string; count?: number }>
        highlights?: Array<{ content?: string; createdAt?: string }>
      }
    | undefined
  const coverage = (parsedSummary as any)?.coverage as
    | {
        daysActive?: number
        totalEvents?: number
        foodCount?: number
        waterCount?: number
        moodCount?: number
        checkinCount?: number
        symptomCount?: number
        exerciseCount?: number
        labCount?: number
        talkToAiCount?: number
        journalCount?: number
        medicalImageCount?: number
      }
    | undefined
  const hydrationSummary = (parsedSummary as any)?.hydrationSummary as
    | {
        entries?: number
        totalMl?: number
        dailyAverageMl?: number
        daysWithLogs?: number
        topDrinks?: Array<{ label?: string; count?: number }>
        dailyTotals?: Array<{ date?: string; entries?: number; totalMl?: number }>
      }
    | undefined
  const nutritionSummary = (parsedSummary as any)?.nutritionSummary as
    | {
        entriesWithNutrients?: number
        totals?: any
        dailyAverages?: any
        daysWithLogs?: number
        dailyTotals?: Array<{ date?: string; calories?: number; protein_g?: number; carbs_g?: number; fat_g?: number }>
        topFoods?: Array<{ name?: string; count?: number }>
      }
    | undefined
  const dailyStats = (parsedSummary as any)?.dailyStats as Array<any> | undefined
  const symptomSummary = (parsedSummary as any)?.symptomSummary as any
  const exerciseSummary = (parsedSummary as any)?.exerciseSummary as any
  const supplementsList = (parsedSummary as any)?.supplements as
    | Array<{ name?: string; dosage?: string; timing?: string }>
    | undefined
  const medicationsList = (parsedSummary as any)?.medications as
    | Array<{ name?: string; dosage?: string; timing?: string }>
    | undefined
  const medicalImageSummary = (parsedSummary as any)?.medicalImageSummary as
    | {
        entries?: number
        daysWithScans?: number
        highlights?: Array<{
          date?: string
          time?: string
          summary?: string
          possibleCauses?: string[]
          redFlags?: string[]
          nextSteps?: string[]
        }>
      }
    | undefined

  const displaySections = useMemo(() => {
    const labels = [
      ...extractSectionLabels((parsedSummary as any)?.goals),
      ...extractSectionLabels((parsedSummary as any)?.issues),
    ]
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

    if (Array.isArray(supplementsList) && supplementsList.length > 0 && next.supplements.working.length === 0) {
      next.supplements.working = supplementsList.slice(0, 10).map((item) => ({
        name: item?.name || 'Supplement',
        reason: currentSupplementReason(item, labels),
      }))
    }

    if (Array.isArray(medicationsList) && medicationsList.length > 0 && next.medications.working.length === 0) {
      next.medications.working = medicationsList.slice(0, 10).map((item) => ({
        name: item?.name || 'Medication',
        reason: currentMedicationReason(item, labels),
      }))
    }

    return next
  }, [medicationsList, parsedSummary, sections, supplementsList])

  const availableSections = useMemo(() => {
    const signals = (parsedSummary as any)?.sectionSignals || {}
    return SECTIONS.filter((section) => {
      if (section.key === 'overview') return true
      if (hasBucketItems(displaySections?.[section.key])) return true
      if (section.key === 'supplements') return Array.isArray(supplementsList) && supplementsList.length > 0
      if (section.key === 'medications') return Array.isArray(medicationsList) && medicationsList.length > 0
      if (section.key === 'nutrition') {
        return Boolean(nutritionSummary?.daysWithLogs || nutritionSummary?.entriesWithNutrients || nutritionSummary?.dailyTotals?.length)
      }
      if (section.key === 'hydration') {
        return Boolean(hydrationSummary?.daysWithLogs || hydrationSummary?.entries || hydrationSummary?.dailyTotals?.length)
      }
      if (section.key === 'exercise') {
        return Boolean(exerciseSummary?.sessions || exerciseSummary?.daysActive || coverage?.exerciseCount)
      }
      if (section.key === 'mood') {
        return Boolean((parsedSummary as any)?.moodSummary?.entries || coverage?.moodCount)
      }
      if (section.key === 'symptoms') {
        return Boolean(symptomSummary?.entries || symptomSummary?.uniqueSymptoms || coverage?.symptomCount)
      }
      if (section.key === 'labs') {
        const labs = signals?.labs || {}
        return Boolean(coverage?.labCount || labs?.reports || labs?.trends || labs?.highlights)
      }
      if (section.key === 'lifestyle') {
        return hasBucketItems(displaySections?.lifestyle)
      }
      return false
    })
  }, [
    coverage?.exerciseCount,
    coverage?.labCount,
    coverage?.moodCount,
    coverage?.symptomCount,
    exerciseSummary?.daysActive,
    exerciseSummary?.sessions,
    hydrationSummary?.dailyTotals?.length,
    hydrationSummary?.daysWithLogs,
    hydrationSummary?.entries,
    medicationsList,
    nutritionSummary?.dailyTotals?.length,
    nutritionSummary?.daysWithLogs,
    nutritionSummary?.entriesWithNutrients,
    parsedSummary,
    displaySections,
    supplementsList,
    symptomSummary?.entries,
    symptomSummary?.uniqueSymptoms,
  ])

  useEffect(() => {
    if (!availableSections.some((section) => section.key === activeTab)) {
      setActiveTab(availableSections[0]?.key || 'overview')
    }
  }, [activeTab, availableSections])

  const detailComparisons = useMemo(() => {
    const previous = previousParsedSummary as any
    if (!previous) return []
    const rows: Array<{ label: string; text: string }> = []
    const addChange = (label: string, currentRaw: unknown, previousRaw: unknown, unit: string, minChange = 1) => {
      const current = Number(currentRaw ?? 0)
      const prior = Number(previousRaw ?? 0)
      if (!Number.isFinite(current) || !Number.isFinite(prior) || current <= 0 || prior <= 0) return
      const diff = current - prior
      if (Math.abs(diff) < minChange) return
      const rounded = Math.round(Math.abs(diff) * 10) / 10
      rows.push({
        label,
        text: `${rounded.toLocaleString()}${unit ? ` ${unit}` : ''} ${diff > 0 ? 'higher' : 'lower'} than the previous report`,
      })
    }
    addChange('Calories', nutritionSummary?.dailyAverages?.calories, previous?.nutritionSummary?.dailyAverages?.calories, 'kcal/day', 50)
    addChange('Protein', nutritionSummary?.dailyAverages?.protein_g, previous?.nutritionSummary?.dailyAverages?.protein_g, 'g/day', 5)
    addChange('Water', hydrationSummary?.dailyAverageMl, previous?.hydrationSummary?.dailyAverageMl, 'ml/day', 150)
    addChange('Movement', exerciseSummary?.totalMinutes, previous?.exerciseSummary?.totalMinutes, 'min/week', 10)
    addChange('Mood', (parsedSummary as any)?.moodSummary?.averageMood, previous?.moodSummary?.averageMood, 'points', 0.3)
    return rows.slice(0, 5)
  }, [exerciseSummary?.totalMinutes, hydrationSummary?.dailyAverageMl, nutritionSummary?.dailyAverages?.calories, nutritionSummary?.dailyAverages?.protein_g, parsedSummary, previousParsedSummary])
  const journalSummary = (parsedSummary as any)?.journalSummary as
    | {
        entries?: number
        daysWithNotes?: number
        highlights?: Array<{ date?: string; time?: string; note?: string }>
      }
    | undefined
  const labTrends = (parsedSummary as any)?.labTrends as
    | Array<{
        name?: string
        latestValue?: number
        previousValue?: number
        unit?: string | null
        change?: number
        direction?: 'up' | 'down' | 'flat'
        latestDate?: string
        previousDate?: string
      }>
    | undefined
  const pdfHref = useMemo(() => {
    if (!report?.id) return null
    return `/insights/weekly-report/print?id=${encodeURIComponent(report.id)}`
  }, [report])

  const updateProgressStage = (percent: number) => {
    if (percent < 25) return 'Getting your data'
    if (percent < 55) return 'Finding patterns'
    if (percent < 80) return 'Writing your report'
    return 'Final checks'
  }

  const startProgress = () => {
    setProgressActive(true)
    setProgressPercent(10)
    setProgressStage('Getting your data')
    if (progressTimerRef.current) {
      window.clearInterval(progressTimerRef.current)
    }
    progressTimerRef.current = window.setInterval(() => {
      setProgressPercent((prev) => {
        const next = Math.min(prev + 4, 95)
        setProgressStage(updateProgressStage(next))
        return next
      })
    }, 900)
  }

  const stopProgress = (success: boolean) => {
    if (progressTimerRef.current) {
      window.clearInterval(progressTimerRef.current)
      progressTimerRef.current = null
    }
    if (success) {
      setProgressPercent(100)
      setProgressStage('Done')
      window.setTimeout(() => {
        setProgressActive(false)
      }, 1200)
    } else {
      setProgressActive(false)
      setProgressPercent(0)
    }
  }

  const runManualReport = async () => {
    if (manualStatus === 'running') return
    setManualStatus('running')
    setManualMessage('Creating your report now. This can take a minute.')
    startProgress()
    let navigated = false
    let success = false
    try {
      const res = await fetch('/api/reports/weekly/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ triggerSource: 'manual' }),
      })
      success = res.ok
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const raw = String(data?.error || data?.reason || data?.status || '').toLowerCase()
        const friendly =
          raw.includes('reports_disabled') || raw.includes('disabled')
            ? 'Turn on weekly reports first.'
            : raw.includes('unauthorized') || raw.includes('auth')
              ? 'Please sign in again and try.'
              : raw.includes('insufficient_credits')
                ? 'Weekly reports need a subscription or credits before creating a report.'
                : 'Could not start the report. Please try again in a moment.'
        setManualStatus('error')
        setManualMessage(friendly)
        return
      }
      if (data?.reportId) {
        navigated = true
        window.location.href = `/insights/weekly-report?id=${encodeURIComponent(data.reportId)}`
        return
      }
      router.refresh()
    } catch {
      setManualStatus('error')
      setManualMessage('Could not start the report. Please try again in a moment.')
      return
    } finally {
      stopProgress(success && !navigated)
      if (!navigated) {
        setManualStatus('idle')
      }
    }
  }

  useEffect(() => {
    if (!report?.id) return
    const storageKey = `helfi-weekly-report-viewed:${report.id}`
    if (typeof window !== 'undefined' && window.sessionStorage?.getItem(storageKey)) return
    try {
      window.sessionStorage.setItem(storageKey, '1')
    } catch {
      // ignore
    }
    fetch('/api/reports/weekly/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reportId: report.id, action: 'viewed' }),
    }).catch(() => {})
  }, [report?.id])

  useEffect(() => {
    return () => {
      if (progressTimerRef.current) {
        window.clearInterval(progressTimerRef.current)
        progressTimerRef.current = null
      }
    }
  }, [])

  if (!reportsEnabled) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 py-10">
          <h1 className="text-3xl font-bold text-gray-900">7-day health report</h1>
          <p className="text-sm text-gray-600 mt-2">
            Weekly reports are turned off for this account. Turn them on to get your weekly insights and PDF.
          </p>
          <div className="mt-4 flex flex-col gap-3">
            <Link
              href="/settings"
              className="inline-flex items-center rounded-lg bg-helfi-green px-4 py-2 text-sm font-medium text-white hover:bg-helfi-green/90"
            >
              Go to settings
            </Link>
            <Link
              href="/billing"
              className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Upgrade to enable reports
            </Link>
          </div>
          <Link
            href="/insights"
            className="inline-flex mt-6 items-center rounded-lg bg-helfi-green px-4 py-2 text-sm font-medium text-white hover:bg-helfi-green/90"
          >
            Back to Insights
          </Link>
        </div>
      </div>
    )
  }

  if (!report) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 py-10">
          <h1 className="text-3xl font-bold text-gray-900">7-day health report</h1>
          <p className="text-sm text-gray-600 mt-2">
            Your weekly report will appear here once your first 7 days of data are complete.
          </p>
          {nextReportDueAt && (
            <p className="text-sm text-gray-500 mt-4">
              Next report due: {formatDateForLocale(nextReportDueAt)}
            </p>
          )}
          <a
            href="/api/export/pdf"
            target="_blank"
            rel="noreferrer"
            className="inline-flex mt-4 items-center rounded-lg border border-helfi-green px-4 py-2 text-sm font-medium text-helfi-green hover:bg-helfi-green/10"
          >
            Download PDF (current data)
          </a>
          {canManualReport && (
            <div className="mt-4 flex flex-col gap-2">
              <button
                onClick={runManualReport}
                disabled={manualStatus === 'running'}
                className="inline-flex items-center rounded-lg bg-helfi-green px-4 py-2 text-sm font-medium text-white hover:bg-helfi-green/90 disabled:opacity-60"
              >
                {manualStatus === 'running' ? 'Creating report...' : 'Create report now'}
              </button>
              {progressActive && (
                <div className="w-full max-w-xs">
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>{progressStage}</span>
                    <span>{progressPercent}%</span>
                  </div>
                  <div className="mt-1 h-2 w-full rounded-full bg-gray-200">
                    <div
                      className="h-2 rounded-full bg-emerald-500"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
          {manualMessage && (
            <p className="text-sm text-red-600 mt-3">{manualMessage}</p>
          )}
          <Link
            href="/insights"
            className="inline-flex mt-6 items-center rounded-lg bg-helfi-green px-4 py-2 text-sm font-medium text-white hover:bg-helfi-green/90"
          >
            Back to Insights
          </Link>
        </div>
      </div>
    )
  }

  if (report.status === 'LOCKED') {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 py-10">
          <h1 className="text-3xl font-bold text-gray-900">7-day health report</h1>
          <p className="text-sm text-gray-600 mt-2">
            Your weekly report is ready, but it requires an active subscription or top-up credits.
          </p>
          <div className="mt-6 rounded-2xl border border-blue-200 bg-blue-50 p-5">
            <p className="text-sm text-blue-900">
              Upgrade to unlock your full 7-day report and keep receiving weekly updates.
            </p>
            <Link
              href="/billing"
              className="inline-flex mt-4 items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              View plans
            </Link>
          </div>
          <Link
            href="/insights"
            className="inline-flex mt-6 items-center rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
          >
            Back to Insights
          </Link>
        </div>
      </div>
    )
  }

  if (report.status === 'RUNNING') {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 py-10">
          <h1 className="text-3xl font-bold text-gray-900">7-day health report</h1>
          <p className="text-sm text-gray-600 mt-2">
            Your report is being generated in the background. Check back in a few minutes.
          </p>
          <Link
            href="/insights"
            className="inline-flex mt-6 items-center rounded-lg bg-helfi-green px-4 py-2 text-sm font-medium text-white hover:bg-helfi-green/90"
          >
            Back to Insights
          </Link>
        </div>
      </div>
    )
  }

  if (report.status === 'FAILED') {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 py-10">
          <h1 className="text-3xl font-bold text-gray-900">7-day health report</h1>
          <p className="text-sm text-gray-600 mt-2">
            We could not generate this report. Please try again later.
          </p>
          {canManualReport && (
            <div className="mt-4 flex flex-col gap-2">
              <button
                onClick={runManualReport}
                disabled={manualStatus === 'running'}
                className="inline-flex items-center rounded-lg bg-helfi-green px-4 py-2 text-sm font-medium text-white hover:bg-helfi-green/90 disabled:opacity-60"
              >
                {manualStatus === 'running' ? 'Creating report...' : 'Create report now'}
              </button>
              {progressActive && (
                <div className="w-full max-w-xs">
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>{progressStage}</span>
                    <span>{progressPercent}%</span>
                  </div>
                  <div className="mt-1 h-2 w-full rounded-full bg-gray-200">
                    <div
                      className="h-2 rounded-full bg-emerald-500"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
          {manualMessage && (
            <p className="text-sm text-red-600 mt-3">{manualMessage}</p>
          )}
          <Link
            href="/insights"
            className="inline-flex mt-6 items-center rounded-lg bg-helfi-green px-4 py-2 text-sm font-medium text-white hover:bg-helfi-green/90"
          >
            Back to Insights
          </Link>
        </div>
      </div>
    )
  }

  const coverageItems = [
    { label: 'Food logs', value: coverage?.foodCount ?? 0 },
    { label: 'Water logs', value: coverage?.waterCount ?? 0 },
    { label: 'Check-ins', value: coverage?.checkinCount ?? 0 },
    { label: 'Mood entries', value: coverage?.moodCount ?? 0 },
    { label: 'Symptoms', value: coverage?.symptomCount ?? 0 },
    { label: 'Exercise', value: coverage?.exerciseCount ?? 0 },
    { label: 'Journal notes', value: coverage?.journalCount ?? 0 },
    { label: 'Medical scans', value: coverage?.medicalImageCount ?? 0 },
    { label: 'Lab uploads', value: coverage?.labCount ?? 0 },
    { label: 'AI chats', value: coverage?.talkToAiCount ?? 0 },
  ]
  const maxCoverage = Math.max(1, ...coverageItems.map((item) => item.value))
  const daysActive = Math.min(7, Math.max(0, coverage?.daysActive ?? 0))
  const activityPercent = Math.round((daysActive / 7) * 100)
  const hydrationEntries = hydrationSummary?.entries ?? 0
  const hydrationDays = hydrationSummary?.daysWithLogs ?? 0
  const hydrationTotal = hydrationSummary?.totalMl ?? 0
  const hydrationAverage = hydrationSummary?.dailyAverageMl ?? 0
  const hydrationTop = Array.isArray(hydrationSummary?.topDrinks) ? hydrationSummary?.topDrinks : []
  const summaryText = report.summary || payload?.summary || 'Summary coming soon.'
  const summaryPoints = splitIntoPoints(summaryText)
  const periodRangeLabel = formatDateRange(report.periodStart, report.periodEnd)
  const reportDays = listReportDays(report.periodStart, report.periodEnd)
  const activeDayKeys = new Set<string>()
  ;(dailyStats || []).forEach((row) => {
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
  ;(nutritionSummary?.dailyTotals || []).forEach((row) => {
    const key = toDateKey(row?.date)
    if (key && Number(row?.calories ?? 0) > 0) activeDayKeys.add(key)
  })
  ;(hydrationSummary?.dailyTotals || []).forEach((row) => {
    const key = toDateKey(row?.date)
    if (key && Number(row?.totalMl ?? 0) > 0) activeDayKeys.add(key)
  })
  const fallbackActiveDays = activeDayKeys.size === 0 ? daysActive : 0
  const rhythmDays = reportDays.map((day, idx) => ({
    key: day,
    label: shortDayName(day),
    active: activeDayKeys.has(day) || (fallbackActiveDays > 0 && idx >= reportDays.length - fallbackActiveDays),
  }))
  const reportStrength = clampNumber(activityPercent, 0, 100)
  const reportStrengthLabel = strengthLabel(reportStrength)
  const strongestPattern = wins?.[0]
  const focusPattern = gaps?.[0] || keyInsights.find((item) => item.label.toLowerCase().includes('avoid'))
  const suggestedPattern = keyInsights.find((item) => item.label.toLowerCase().includes('suggestion')) || keyInsights[0]
  const topCoverage = coverageItems
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 6)
  const heroCards = [
    {
      label: 'Strongest pattern',
      title: getInsightName(strongestPattern, topCoverage[0]?.label || 'Keep logging'),
      body: getInsightReason(
        strongestPattern,
        topCoverage[0]
          ? `${topCoverage[0].label} gave this report the clearest signal this week.`
          : 'The report becomes more useful as the week fills with food, water, mood, movement, and symptom logs.'
      ),
      tone: 'emerald',
    },
    {
      label: 'Best next step',
      title: getInsightName(suggestedPattern, 'Choose one small action'),
      body: getInsightReason(
        suggestedPattern,
        summaryPoints[0] || 'Pick one simple habit from the report and repeat it for the next 7 days.'
      ),
      tone: 'sky',
    },
    {
      label: 'Needs attention',
      title: getInsightName(focusPattern, dataWarning ? 'Data needs care' : 'Watch the gaps'),
      body: getInsightReason(
        focusPattern,
        dataWarning || 'Any missing logs or repeated symptoms will stand out here as the report gets more history.'
      ),
      tone: 'amber',
    },
  ]
  const reportPageClass = (key: ReportNavKey) => (activeReportNav === key ? 'block' : 'hidden md:block')
  const showReportPage = (key: ReportNavKey) => {
    setActiveReportNav(key)
    try {
      const url = new URL(window.location.href)
      url.searchParams.set('tab', key)
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
      window.sessionStorage.setItem('weekly-report-last-tab', key)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch {
      // ignore
    }
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-[linear-gradient(180deg,#f8fafc_0%,#ffffff_34%,#eef8f4_100%)]">
      {/* Mobile app-style header */}
      <div className="md:hidden sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <button
            onClick={() => router.push('/insights')}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700"
          >
            <span aria-hidden="true">←</span>
            Back
          </button>
          <div className="text-sm font-semibold text-slate-900">7-day report</div>
          {pdfHref ? (
            <a
              href={pdfHref}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-800"
            >
              PDF
            </a>
          ) : (
            <div className="w-[68px]" />
          )}
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-3 py-6 pb-28 sm:px-4 md:py-10">
        {manualMessage && (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {manualMessage}
          </div>
        )}

        {dataWarning && (
          <div className="mt-6 rounded-2xl border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
            {dataWarning}
          </div>
        )}

        <section className="w-full max-w-full overflow-hidden rounded-3xl border border-emerald-100 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.08)] sm:rounded-[2rem]">
          <div className="grid w-full max-w-full gap-0 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="min-w-0 p-5 sm:p-8 lg:p-10">
              <div className="hidden items-center justify-between md:flex">
                <button
                  onClick={() => router.push('/insights')}
                  className="inline-flex items-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Back to Insights
                </button>
                {pdfHref && (
                  <a
                    href={pdfHref}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100"
                  >
                    Save as PDF
                  </a>
                )}
              </div>

              <div className="mt-2 md:mt-10">
                <p className="text-sm font-semibold text-emerald-700">{periodRangeLabel}</p>
                <h1 className="mt-3 max-w-[21rem] text-3xl font-bold tracking-tight text-slate-950 sm:max-w-2xl sm:text-5xl">
                  7-day health report
                </h1>
                <p className="mt-4 max-w-[21rem] break-words text-base leading-7 text-slate-600 sm:max-w-2xl">
                  {summaryPoints[0] || replaceIsoDates(summaryText)}
                </p>
              </div>

              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Active days</div>
                  <div className="mt-2 text-3xl font-bold text-slate-950">{daysActive}/7</div>
                  <div className="mt-1 text-sm text-slate-600">Days with useful data</div>
                </div>
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Report strength</div>
                  <div className="mt-2 text-3xl font-bold text-emerald-950">{reportStrengthLabel}</div>
                  <div className="mt-1 text-sm text-emerald-800">{reportStrength}% data signal</div>
                </div>
                <div className="rounded-2xl border border-sky-100 bg-sky-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-sky-700">Entries used</div>
                  <div className="mt-2 text-3xl font-bold text-sky-950">{formatCompactNumber(coverage?.totalEvents ?? 0)}</div>
                  <div className="mt-1 text-sm text-sky-800">Across your week</div>
                </div>
              </div>
            </div>

            <div id="data" className="min-w-0 bg-slate-950 p-5 text-white sm:p-8 lg:p-10">
              <div className="max-w-[21rem] sm:max-w-none">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold">Weekly snapshot</h2>
                  <p className="mt-2 text-sm leading-6 text-emerald-50/80">
                    A simple view of how much useful information Helfi had to work with.
                  </p>
                </div>
                <div className="rounded-full bg-white/10 px-3 py-1 text-sm font-semibold text-emerald-100">
                  {daysActive} days
                </div>
              </div>

              <div className="mt-8 flex justify-center">
                <div
                  className="relative grid h-48 w-48 place-items-center rounded-full bg-[conic-gradient(#10b981_var(--report-strength),rgba(255,255,255,0.12)_0)] shadow-[0_30px_80px_rgba(16,185,129,0.25)] sm:h-56 sm:w-56"
                  style={{ ['--report-strength' as any]: `${reportStrength}%` }}
                >
                  <div className="absolute inset-5 rounded-full bg-slate-950" />
                  <div className="relative text-center">
                    <div className="text-4xl font-bold tracking-tight sm:text-5xl">{reportStrength}</div>
                    <div className="mt-1 text-sm font-semibold text-emerald-100">out of 100</div>
                    <div className="mt-2 text-xs text-slate-300">report strength</div>
                  </div>
                </div>
              </div>

              <div className="mt-8 grid grid-cols-7 gap-1 sm:gap-2">
                {rhythmDays.map((day) => (
                  <div
                    key={day.key}
                    className={`rounded-xl border px-1 py-2 text-center sm:rounded-2xl sm:px-2 sm:py-3 ${
                      day.active
                        ? 'border-emerald-300/40 bg-emerald-300/20 text-emerald-50'
                        : 'border-white/10 bg-white/5 text-slate-400'
                    }`}
                  >
                    <div className="text-[10px] font-semibold sm:text-xs">{day.label}</div>
                    <div className={`mx-auto mt-2 h-2 w-2 rounded-full sm:h-2.5 sm:w-2.5 ${day.active ? 'bg-emerald-300' : 'bg-white/20'}`} />
                  </div>
                ))}
              </div>

              <div className="mt-8 space-y-3">
                {topCoverage.length ? (
                  topCoverage.map((item) => (
                    <div key={item.label} className="rounded-2xl border border-white/10 bg-white/[0.07] p-4">
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="font-semibold text-slate-100">{item.label}</span>
                        <span className="text-emerald-100">{formatCompactNumber(item.value)}</span>
                      </div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full rounded-full bg-emerald-300"
                          style={{ width: `${Math.round((item.value / maxCoverage) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-white/10 bg-white/[0.07] p-4 text-sm text-slate-300">
                    Start logging during the week and this snapshot will fill with your strongest data sources.
                  </div>
                )}
              </div>
              </div>
            </div>
          </div>
        </section>

        <div id="summary" className={`mt-6 ${reportPageClass('summary')}`}>
        <section className="grid gap-4 lg:grid-cols-3">
          {heroCards.map((card) => (
            <div
              key={card.label}
              className={`rounded-2xl border p-5 shadow-sm ${
                card.tone === 'emerald'
                  ? 'border-emerald-100 bg-emerald-50'
                  : card.tone === 'sky'
                    ? 'border-sky-100 bg-sky-50'
                    : 'border-amber-100 bg-amber-50'
              }`}
            >
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{card.label}</div>
              <div className="mt-2 text-lg font-bold text-slate-950">{card.title}</div>
              <p className="mt-2 text-sm leading-6 text-slate-700">{card.body}</p>
            </div>
          ))}
        </section>

        {summaryPoints.length > 1 && (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">What changed this week</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {summaryPoints.slice(1, 4).map((point, idx) => (
                <div key={`summary-point-${idx}`} className="rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
                  {point}
                </div>
              ))}
            </div>
          </div>
        )}
        </div>

        <div id="visuals" className={`mt-6 ${reportPageClass('visuals')}`}>
          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
            <div>
              <h2 className="text-2xl font-bold text-slate-950">Charts</h2>
              <p className="mt-1 max-w-[21rem] text-sm leading-6 text-slate-600 sm:max-w-none">Open each chart section to compare this week and find what changed.</p>
            </div>
          {hydrationEntries > 0 && (
            <div className="mt-4 inline-flex rounded-full border border-sky-100 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-900">
              Hydration: {formatMl(hydrationAverage)} average per day
            </div>
          )}
          <div className="mt-4">
            <ReportVisuals
              periodStart={report.periodStart}
              periodEnd={report.periodEnd}
              coverage={coverage}
              nutritionSummary={nutritionSummary as any}
              hydrationSummary={hydrationSummary as any}
              dailyStats={dailyStats as any}
              symptomSummary={symptomSummary as any}
              exerciseSummary={exerciseSummary as any}
              medicalImageSummary={medicalImageSummary as any}
              journalSummary={journalSummary as any}
              previousSummary={
                previousParsedSummary
                  ? {
                      periodLabel: formatDateRange(previousReport?.periodStart, previousReport?.periodEnd),
                      nutritionSummary: previousParsedSummary?.nutritionSummary,
                      hydrationSummary: previousParsedSummary?.hydrationSummary,
                      dailyStats: previousParsedSummary?.dailyStats,
                    }
                  : null
              }
            />
          </div>
          </div>
        </div>

        <div id="insights" className={`mt-6 ${reportPageClass('insights')}`}>
          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
            <div>
              <h2 className="text-2xl font-bold text-slate-950">Insights</h2>
              <p className="mt-1 text-sm text-slate-600">The main takeaways and coaching notes from this report.</p>
            </div>

        {keyInsights.length > 0 && (
          <div className="mt-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">Key insights this week</h2>
            <p className="text-sm text-gray-600 mt-2">
              These are the most important signals from your last 7 days.
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {keyInsights.map((insight, idx) => (
                <div key={`${insight.label}-${idx}`} className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    {insight.label}
                  </div>
                  <div className="mt-2 font-semibold text-gray-900">{replaceIsoDates(insight.name || 'Insight')}</div>
                  <div className="mt-1 space-y-1 text-sm text-gray-600">
                    {splitIntoLines(insight.reason || '').map((line, lineIdx) => (
                      <p key={`key-insight-${idx}-line-${lineIdx}`}>{line}</p>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {talkToAiSummary?.userMessageCount ? (
          <div className="mt-6 rounded-2xl border border-blue-100 bg-blue-50/40 p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-blue-900">Talk to Helfi highlights</h2>
            <p className="text-sm text-blue-800 mt-2">
              {talkToAiSummary.userMessageCount} chat {talkToAiSummary.userMessageCount === 1 ? 'prompt' : 'prompts'}
              {talkToAiSummary.activeDays ? ` across ${talkToAiSummary.activeDays} days` : ''}.
            </p>
            <div className="mt-3">
              <Link
                href="/chat-log"
                className="inline-flex items-center rounded-full border border-blue-200 bg-white px-4 py-1.5 text-xs font-semibold text-blue-800 hover:bg-blue-100"
              >
                Open chat log
              </Link>
            </div>
            {talkToAiSummary.topics && talkToAiSummary.topics.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {talkToAiSummary.topics.map((topic, idx) => (
                  <span key={`${topic.topic}-${idx}`} className="rounded-full border border-blue-100 bg-white px-3 py-1 text-xs text-blue-900">
                    {topic.topic}
                    {topic.count ? ` • ${topic.count}` : ''}
                  </span>
                ))}
              </div>
            )}
            {talkToAiSummary.highlights && talkToAiSummary.highlights.length > 0 && (
              <div className="mt-4 space-y-2">
                {talkToAiSummary.highlights.slice(-3).map((item, idx) => (
                  <div key={`talk-${idx}`} className="rounded-xl border border-blue-100 bg-white p-3 text-sm text-blue-900">
                    {item.content}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {medicalImageSummary?.entries ? (
          <div className="mt-6 rounded-2xl border border-sky-100 bg-sky-50/40 p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-sky-900">Medical image analyser</h2>
            <p className="text-sm text-sky-800 mt-2">
              {medicalImageSummary.entries} saved scan{medicalImageSummary.entries === 1 ? '' : 's'}
              {medicalImageSummary.daysWithScans ? ` across ${medicalImageSummary.daysWithScans} days` : ''}.
            </p>
            {Array.isArray(medicalImageSummary.highlights) && medicalImageSummary.highlights.length > 0 ? (
              <div className="mt-4 space-y-3">
                {medicalImageSummary.highlights.slice(0, 3).map((item, idx) => (
                  <div key={`medical-image-${idx}`} className="rounded-xl border border-sky-100 bg-white p-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-sky-700">
                      {[item.date, item.time].filter(Boolean).join(' • ') || 'Saved scan'}
                    </div>
                    <div className="mt-2 text-sm font-semibold text-slate-900">
                      {replaceIsoDates(item.summary || 'Saved medical image scan')}
                    </div>
                    {Array.isArray(item.possibleCauses) && item.possibleCauses.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {item.possibleCauses.slice(0, 3).map((cause, causeIdx) => (
                          <span
                            key={`${cause}-${causeIdx}`}
                            className="rounded-full border border-sky-100 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-900"
                          >
                            {cause}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {Array.isArray(item.nextSteps) && item.nextSteps.length > 0 ? (
                      <div className="mt-3 space-y-1 text-sm text-slate-700">
                        {item.nextSteps.slice(0, 2).map((step, stepIdx) => (
                          <p key={`medical-step-${idx}-${stepIdx}`}>{step}</p>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {labTrends && labTrends.length > 0 && (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Lab results movement</h2>
            <p className="text-sm text-slate-600 mt-2">
              Changes are shown without judging good or bad. Share with your clinician if needed.
            </p>
            <div className="mt-4 space-y-3">
              {labTrends.slice(0, 6).map((trend, idx) => (
                <div key={`lab-${idx}`} className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="font-semibold text-slate-900">{trend.name || 'Lab value'}</div>
                  <div className="text-sm text-slate-700 mt-1">
                    {trend.previousValue ?? '-'} → {trend.latestValue ?? '-'}
                    {trend.unit ? ` ${trend.unit}` : ''} (
                    {trend.direction === 'up' ? 'up' : trend.direction === 'down' ? 'down' : 'flat'})
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {(wins.length > 0 || gaps.length > 0) && (
          <div id="wins-gaps" className="mt-6 grid gap-6 md:grid-cols-2">
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-emerald-900">Areas improving</h3>
              <p className="text-xs text-emerald-700 mt-1">What moved in the right direction this week.</p>
              <div className="mt-4 space-y-3">
                {wins.length === 0 && (
                  <div className="text-sm text-emerald-700">Keep logging to highlight real wins here.</div>
                )}
                {wins.map((item: any, idx: number) => (
                  <div key={`win-${idx}`} className="rounded-xl border border-emerald-100 bg-white p-4">
                    <div className="font-semibold text-emerald-900">{replaceIsoDates(item.name || 'Win')}</div>
                    <div className="mt-1 space-y-1 text-sm text-emerald-800">
                      {splitIntoLines(item.reason || '').map((line, lineIdx) => (
                        <p key={`win-${idx}-line-${lineIdx}`}>{line}</p>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-amber-100 bg-amber-50/40 p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-amber-900">Areas to work on</h3>
              <p className="text-xs text-amber-700 mt-1">The biggest gaps holding back the report.</p>
              <div className="mt-4 space-y-3">
                {gaps.length === 0 && (
                  <div className="text-sm text-amber-700">No big gaps flagged this week.</div>
                )}
                {gaps.map((item: any, idx: number) => (
                  <div key={`gap-${idx}`} className="rounded-xl border border-amber-100 bg-white p-4">
                    <div className="font-semibold text-amber-900">{replaceIsoDates(item.name || 'Gap')}</div>
                    <div className="mt-1 space-y-1 text-sm text-amber-800">
                      {splitIntoLines(item.reason || '').map((line, lineIdx) => (
                        <p key={`gap-${idx}-line-${lineIdx}`}>{line}</p>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

          </div>
        </div>

        <div id="sections" className={`mt-6 ${reportPageClass('sections')}`}>
          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
            <div>
              <h2 className="text-2xl font-bold text-slate-950">Details</h2>
              <p className="mt-1 text-sm text-slate-600">Deeper notes by health area.</p>
            </div>

            {detailComparisons.length > 0 ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {detailComparisons.map((item) => (
                  <div key={item.label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{item.label}</div>
                    <div className="mt-1 text-sm font-semibold text-slate-900">{item.text}</div>
                  </div>
                ))}
              </div>
            ) : null}

        <div className="mt-5 flex flex-wrap gap-2">
          {availableSections.map((section) => (
            <button
              key={section.key}
              onClick={() => setActiveTab(section.key)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === section.key
                  ? 'bg-helfi-green text-white'
                  : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
              }`}
            >
              {section.label}
            </button>
          ))}
        </div>

        {activeTab === 'supplements' && Array.isArray(supplementsList) && supplementsList.length > 0 ? (
          <div className="mt-6 rounded-2xl border border-emerald-100 bg-emerald-50/40 p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-emerald-900">Your supplements</h2>
            <p className="mt-2 text-sm text-emerald-800">
              This is your current supplement list. The report text below should explain what looks helpful for your goals.
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {supplementsList.map((s, idx) => (
                <div key={`${s?.name || 'supplement'}-${idx}`} className="rounded-xl border border-emerald-100 bg-white p-4">
                  <div className="font-semibold text-emerald-950">{replaceIsoDates(String(s?.name || 'Supplement'))}</div>
                  {(s?.dosage || s?.timing) ? (
                    <div className="mt-1 text-sm text-emerald-900/80">
                      {s?.dosage ? `Dose: ${s.dosage}` : 'Dose: -'}
                      {' • '}
                      {s?.timing ? `Timing: ${s.timing}` : 'Timing: -'}
                    </div>
                  ) : (
                    <div className="mt-1 text-sm text-emerald-900/80">Dose/timing not set</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {activeTab === 'medications' && Array.isArray(medicationsList) && medicationsList.length > 0 ? (
          <div className="mt-6 rounded-2xl border border-sky-100 bg-sky-50/40 p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-sky-900">Your medications</h2>
            <p className="mt-2 text-sm text-sky-800">
              This is your current medication list. The report text below should connect it to your goals and safety notes.
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {medicationsList.map((m, idx) => (
                <div key={`${m?.name || 'medication'}-${idx}`} className="rounded-xl border border-sky-100 bg-white p-4">
                  <div className="font-semibold text-sky-950">{replaceIsoDates(String(m?.name || 'Medication'))}</div>
                  {(m?.dosage || m?.timing) ? (
                    <div className="mt-1 text-sm text-sky-900/80">
                      {m?.dosage ? `Dose: ${m.dosage}` : 'Dose: -'}
                      {' • '}
                      {m?.timing ? `Timing: ${m.timing}` : 'Timing: -'}
                    </div>
                  ) : (
                    <div className="mt-1 text-sm text-sky-900/80">Dose/timing not set</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-1 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">What's working</h3>
              <SectionBucket title="working" items={displaySections?.[activeTab]?.working || []} />
            </div>
          </div>
          <div className="lg:col-span-1 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Suggestions</h3>
              <SectionBucket title="suggested" items={displaySections?.[activeTab]?.suggested || []} />
            </div>
          </div>
          <div className="lg:col-span-1 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Things to avoid</h3>
              <SectionBucket title="avoid" items={displaySections?.[activeTab]?.avoid || []} />
            </div>
          </div>
        </div>

          </div>
        </div>

        {reports.length > 1 && (
          <div id="archive" className={`mt-10 ${reportPageClass('summary')}`}>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Previous reports</h3>
            <div className="grid gap-3 md:grid-cols-2">
              {reports.map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-700"
                >
                  <Link
                    href={`/insights/weekly-report?id=${encodeURIComponent(item.id)}`}
                    className="block hover:text-helfi-green"
                  >
                    <div className="font-semibold">{formatDateRange(item.periodStart, item.periodEnd)}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      Generated {formatDateForLocale(item.createdAt)}
                    </div>
                  </Link>
                  <div className="mt-3 flex items-center gap-3">
                    <a
                      href={`/insights/weekly-report/print?id=${encodeURIComponent(item.id)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center rounded-lg border border-helfi-green px-3 py-1.5 text-xs font-semibold text-helfi-green hover:bg-helfi-green/10"
                    >
                      Save as PDF
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Mobile app-style bottom nav for the report */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white shadow-[0_-12px_32px_rgba(15,23,42,0.10)]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-3 py-2">
          {REPORT_NAV_ITEMS.map((item) => {
            const isActive = activeReportNav === item.key
            return (
              <button
                key={item.key}
                onClick={() => {
                  showReportPage(item.key)
                }}
                aria-current={isActive ? 'page' : undefined}
                className={`flex flex-1 items-center justify-center px-2 py-3 text-xs font-semibold transition-colors focus-visible:outline-none ${
                  isActive ? 'text-helfi-green' : 'text-slate-700 hover:text-helfi-green'
                }`}
              >
                {item.label}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
