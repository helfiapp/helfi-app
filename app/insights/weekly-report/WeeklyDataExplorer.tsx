'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, type ComponentType } from 'react'
import {
  BeakerIcon,
  BoltIcon,
  BookOpenIcon,
  ChartBarIcon,
  ChatBubbleLeftRightIcon,
  CheckCircleIcon,
  ClipboardDocumentCheckIcon,
  FaceSmileIcon,
  FireIcon,
  PhotoIcon,
  ShieldExclamationIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'

export type WeeklyDataKey =
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

type ExplorerProps = {
  periodStart: string
  periodEnd: string
  coverage?: any
  summary?: any
  sections?: any
  talkToAiSummary?: any
  chatHistoryUnavailable?: boolean
}

type Tile = {
  key: WeeklyDataKey
  label: string
  value: number | string
  note: string
  icon: ComponentType<any>
  tone: string
}

function formatDate(value?: string | null) {
  if (!value) return ''
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }).format(date)
}

function formatNumber(value: unknown, maximumFractionDigits = 0) {
  const number = Number(value ?? 0)
  if (!Number.isFinite(number)) return '0'
  return new Intl.NumberFormat('en-AU', { maximumFractionDigits }).format(number)
}

function formatOptionalNumber(value: unknown, maximumFractionDigits = 0) {
  if (value === null || value === undefined || value === '') return 'Not available'
  const number = Number(value)
  if (!Number.isFinite(number)) return 'Not available'
  return new Intl.NumberFormat('en-AU', { maximumFractionDigits }).format(number)
}

function formatMl(value: unknown) {
  const ml = Number(value ?? 0)
  if (!Number.isFinite(ml) || ml <= 0) return '0 ml'
  if (ml >= 1000) return `${formatNumber(ml / 1000, 2)} L`
  return `${formatNumber(ml)} ml`
}

function dayLabel(value?: string | null) {
  if (!value) return ''
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat('en-AU', { weekday: 'short', day: 'numeric' }).format(date)
}

function Metric({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-bold text-slate-950">{value}</div>
      {note ? <div className="mt-1 text-xs leading-5 text-slate-500">{note}</div> : null}
    </div>
  )
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center">
      <div className="text-base font-semibold text-slate-800">No {label} this week</div>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        Nothing was saved for this area during the selected report dates. Helfi has not guessed or filled in missing data.
      </p>
    </div>
  )
}

function Bars({
  title,
  rows,
  valueLabel,
}: {
  title: string
  rows: Array<{ label: string; value: number }>
  valueLabel?: (value: number) => string
}) {
  const max = Math.max(1, ...rows.map((row) => Number(row.value || 0)))
  if (!rows.some((row) => row.value > 0)) return null
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h4 className="text-sm font-semibold text-slate-900">{title}</h4>
      <div className="mt-4 space-y-4">
        {rows.map((row) => (
          <div key={`${title}-${row.label}`}>
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="font-semibold text-slate-600">{row.label}</span>
              <span className="text-slate-500">{valueLabel ? valueLabel(row.value) : formatNumber(row.value, 1)}</span>
            </div>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className="weekly-data-grow h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-300"
                style={{ width: `${row.value > 0 ? Math.max(4, Math.round((row.value / max) * 100)) : 0}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function RankedList({ title, items }: { title: string; items: Array<{ name: string; value?: string }> }) {
  if (!items.length) return null
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h4 className="text-sm font-semibold text-slate-900">{title}</h4>
      <div className="mt-3 divide-y divide-slate-100">
        {items.map((item, index) => (
          <div key={`${title}-${item.name}-${index}`} className="flex items-start justify-between gap-4 py-3 text-sm">
            <div className="flex min-w-0 items-start gap-3">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-emerald-50 text-xs font-bold text-emerald-700">{index + 1}</span>
              <span className="break-words font-medium text-slate-800">{item.name}</span>
            </div>
            {item.value ? <span className="shrink-0 text-slate-500">{item.value}</span> : null}
          </div>
        ))}
      </div>
    </section>
  )
}

function Notes({ title, items }: { title: string; items: Array<{ heading?: string; body: string; meta?: string }> }) {
  if (!items.length) return null
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h4 className="text-sm font-semibold text-slate-900">{title}</h4>
      <div className="mt-4 space-y-3">
        {items.map((item, index) => (
          <div key={`${title}-${index}`} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
            {item.meta ? <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">{item.meta}</div> : null}
            {item.heading ? <div className="mt-1 font-semibold text-slate-900">{item.heading}</div> : null}
            <p className="mt-1 whitespace-pre-line text-sm leading-6 text-slate-700">{item.body}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function Guidance({ section }: { section?: any }) {
  const groups = [
    { key: 'working', title: "What's working", tone: 'border-emerald-100 bg-emerald-50' },
    { key: 'suggested', title: 'Suggestions', tone: 'border-sky-100 bg-sky-50' },
    { key: 'avoid', title: 'Things to avoid', tone: 'border-amber-100 bg-amber-50' },
  ]
  const populated = groups.filter((group) => Array.isArray(section?.[group.key]) && section[group.key].length > 0)
  if (!populated.length) return null
  return (
    <section>
      <h4 className="text-sm font-semibold text-slate-900">What this means</h4>
      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        {populated.map((group) => (
          <div key={group.key} className={`rounded-2xl border p-4 ${group.tone}`}>
            <div className="text-sm font-semibold text-slate-900">{group.title}</div>
            <div className="mt-3 space-y-3">
              {section[group.key].map((item: any, index: number) => (
                <div key={`${group.key}-${index}`}>
                  <div className="text-sm font-semibold text-slate-800">{item?.name || 'Insight'}</div>
                  {item?.reason ? <p className="mt-1 whitespace-pre-line text-xs leading-5 text-slate-600">{item.reason}</p> : null}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function DetailContent({ selected, summary, coverage, sections, talkToAiSummary, chatHistoryUnavailable }: ExplorerProps & { selected: WeeklyDataKey }) {
  const nutrition = summary?.nutritionSummary || {}
  const hydration = summary?.hydrationSummary || {}
  const mood = summary?.moodSummary || {}
  const checkins = summary?.checkinSummary || {}
  const symptoms = summary?.symptomSummary || {}
  const exercise = summary?.exerciseSummary || {}
  const journal = summary?.journalSummary || {}
  const images = summary?.medicalImageSummary || {}
  const dailyStats = Array.isArray(summary?.dailyStats) ? summary.dailyStats : []
  const labs = Array.isArray(summary?.labHighlights) ? summary.labHighlights : []
  const labTrends = Array.isArray(summary?.labTrends) ? summary.labTrends : []

  if (selected === 'food') {
    if (!Number(coverage?.foodCount || 0)) return <EmptyState label="food logs" />
    return <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Food logs" value={formatNumber(coverage?.foodCount)} />
        <Metric label="Days logged" value={`${formatNumber(nutrition?.daysWithLogs)}/7`} />
        <Metric label="Daily energy" value={`${formatNumber(nutrition?.dailyAverages?.calories)} kcal`} />
        <Metric label="Daily protein" value={`${formatNumber(nutrition?.dailyAverages?.protein_g, 1)} g`} />
      </div>
      <Bars title="Daily energy" rows={(nutrition?.dailyTotals || []).map((row: any) => ({ label: dayLabel(row.date), value: Number(row.calories || 0) }))} valueLabel={(value) => `${formatNumber(value)} kcal`} />
      <RankedList title="Most logged foods" items={(nutrition?.topFoods || []).map((item: any) => ({ name: item.name || 'Food', value: `${formatNumber(item.count)} logs` }))} />
      <Guidance section={sections?.nutrition} />
    </div>
  }

  if (selected === 'water' || selected === 'hydration') {
    if (!Number(hydration?.entries || coverage?.waterCount || 0)) return <EmptyState label="water logs" />
    return <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Water logs" value={formatNumber(hydration?.entries ?? coverage?.waterCount)} />
        <Metric label="Days logged" value={`${formatNumber(hydration?.daysWithLogs)}/7`} />
        <Metric label="Total" value={formatMl(hydration?.totalMl)} />
        <Metric label="Daily average" value={formatMl(hydration?.dailyAverageMl)} />
      </div>
      <Bars title="Daily hydration" rows={(hydration?.dailyTotals || []).map((row: any) => ({ label: dayLabel(row.date), value: Number(row.totalMl || 0) }))} valueLabel={formatMl} />
      <RankedList title="Most logged drinks" items={(hydration?.topDrinks || []).map((item: any) => ({ name: item.label || 'Drink', value: `${formatNumber(item.count)} logs` }))} />
      <Guidance section={sections?.hydration} />
    </div>
  }

  if (selected === 'mood') {
    if (!Number(mood?.entries || coverage?.moodCount || 0)) return <EmptyState label="mood entries" />
    const trend = mood?.trend?.direction ? `${mood.trend.direction}${mood.trend.change ? ` (${mood.trend.change > 0 ? '+' : ''}${mood.trend.change})` : ''}` : 'Not enough data'
    return <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Mood entries" value={formatNumber(mood?.entries ?? coverage?.moodCount)} />
        <Metric label="Days logged" value={`${formatNumber(mood?.daysWithLogs)}/7`} />
        <Metric label="Average mood" value={formatNumber(mood?.averageMood, 1)} />
        <Metric label="Weekly trend" value={trend} />
      </div>
      <Bars title="Daily mood" rows={(mood?.dailyAverages || []).map((row: any) => ({ label: dayLabel(row.date), value: Number(row.avgMood || 0) }))} />
      <RankedList title="Common mood tags" items={(mood?.topTags || []).map((item: any) => ({ name: item.name || 'Mood', value: `${formatNumber(item.count)} times` }))} />
      <Notes title="Saved mood notes" items={(mood?.notes || []).map((item: any) => ({ body: item.content || '', meta: formatDate(item.createdAt) }))} />
      <Guidance section={sections?.mood} />
    </div>
  }

  if (selected === 'checkins') {
    if (!Number(checkins?.totalEntries || coverage?.checkinCount || 0)) return <EmptyState label="check-ins" />
    const checkinCount = Number(coverage?.checkinCount ?? checkins?.totalEntries ?? 0)
    const hasDetailedRatings = Number.isFinite(Number(checkins?.overallAvg)) && Array.isArray(checkins?.goals) && checkins.goals.length > 0
    return <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="Ratings saved" value={formatNumber(checkinCount)} />
        <Metric label="Overall average" value={hasDetailedRatings ? formatNumber(checkins?.overallAvg, 1) : 'Not available'} note={hasDetailedRatings ? undefined : 'This older saved report did not include detailed goal scores.'} />
        <Metric label="Goals checked" value={hasDetailedRatings ? formatNumber(checkins?.goals?.length) : 'Not available'} />
      </div>
      <Bars title="Daily check-ins" rows={dailyStats.map((row: any) => ({ label: dayLabel(row.date), value: Number(row.checkinCount || 0) }))} valueLabel={(value) => `${formatNumber(value)} ratings`} />
      <RankedList title="Goal check-ins" items={(checkins?.goals || []).map((item: any) => ({ name: item.goal || 'Goal', value: `${formatNumber(item.avgRating, 1)} avg${item.trend == null ? '' : ` • ${item.trend > 0 ? '+' : ''}${item.trend} change`}` }))} />
      <Notes title="Check-in notes" items={(checkins?.notes || []).map((item: any) => ({ heading: item.goal, body: item.content || '', meta: formatDate(item.createdAt) }))} />
      <Guidance section={sections?.overview} />
    </div>
  }

  if (selected === 'symptoms') {
    if (!Number(symptoms?.entries || coverage?.symptomCount || 0)) return <EmptyState label="symptoms" />
    return <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="Symptom entries" value={formatNumber(coverage?.symptomCount ?? symptoms?.entries)} />
        <Metric label="Days logged" value={`${formatNumber(symptoms?.daysWithLogs)}/7`} />
        <Metric label="Unique symptoms" value={formatNumber(symptoms?.uniqueSymptoms)} />
      </div>
      <Bars title="Daily symptom activity" rows={dailyStats.map((row: any) => ({ label: dayLabel(row.date), value: Number(row.symptomCount || 0) }))} />
      <RankedList title="Most noted symptoms" items={(symptoms?.topSymptoms || []).map((item: any) => ({ name: item.name || 'Symptom', value: `${formatNumber(item.count)} times` }))} />
      <Guidance section={sections?.symptoms} />
    </div>
  }

  if (selected === 'exercise') {
    if (!Number(exercise?.sessions || coverage?.exerciseCount || 0)) return <EmptyState label="exercise" />
    return <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Sessions" value={formatNumber(exercise?.sessions ?? coverage?.exerciseCount)} />
        <Metric label="Active days" value={`${formatNumber(exercise?.daysActive)}/7`} />
        <Metric label="Total movement" value={`${formatNumber(exercise?.totalMinutes)} min`} />
        <Metric label="Distance" value={`${formatNumber(exercise?.totalDistanceKm, 1)} km`} />
      </div>
      <Bars title="Daily movement" rows={dailyStats.map((row: any) => ({ label: dayLabel(row.date), value: Number(row.exerciseMinutes || 0) }))} valueLabel={(value) => `${formatNumber(value)} min`} />
      <RankedList title="Most logged activities" items={(exercise?.topActivities || []).map((item: any) => ({ name: item.name || 'Activity', value: `${formatNumber(item.count)} sessions` }))} />
      <Guidance section={sections?.exercise} />
    </div>
  }

  if (selected === 'journal') {
    if (!Number(journal?.entries || coverage?.journalCount || 0)) return <EmptyState label="journal notes" />
    return <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Metric label="Journal notes" value={formatNumber(journal?.entries ?? coverage?.journalCount)} />
        <Metric label="Days with notes" value={`${formatNumber(journal?.daysWithNotes)}/7`} />
      </div>
      <Notes title="Highlights from this week" items={(journal?.highlights || []).map((item: any) => ({ body: item.note || '', meta: [formatDate(item.date), item.time].filter(Boolean).join(' • ') }))} />
      <Guidance section={sections?.lifestyle} />
    </div>
  }

  if (selected === 'images') {
    if (!Number(images?.entries || coverage?.medicalImageCount || 0)) return <EmptyState label="health image notes" />
    return <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Metric label="Health image notes" value={formatNumber(images?.entries ?? coverage?.medicalImageCount)} />
        <Metric label="Days with notes" value={`${formatNumber(images?.daysWithScans)}/7`} />
      </div>
      <Notes title="Saved image-note highlights" items={(images?.highlights || []).map((item: any) => ({ heading: item.summary || 'Saved health image note', body: [...(item.possibleCauses || []).map((value: string) => `Possible cause: ${value}`), ...(item.nextSteps || []).map((value: string) => `Next step: ${value}`)].join('\n') || 'No extra notes were saved.', meta: [formatDate(item.date), item.time].filter(Boolean).join(' • ') }))} />
      <Guidance section={sections?.symptoms} />
    </div>
  }

  if (selected === 'labs') {
    if (!Number(coverage?.labCount || 0)) return <EmptyState label="lab uploads" />
    return <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="Lab uploads" value={formatNumber(coverage?.labCount)} />
        <Metric label="Markers shown" value={formatNumber(labs.length)} />
        <Metric label="Trends available" value={formatNumber(labTrends.length)} />
      </div>
      <RankedList title="Latest saved markers" items={labs.map((item: any) => ({ name: item.name || 'Lab marker', value: `${formatOptionalNumber(item.value, 2)}${item.unit ? ` ${item.unit}` : ''}${item.status ? ` • ${item.status}` : ''}` }))} />
      <Notes title="Marker movement" items={labTrends.map((item: any) => ({ heading: item.name || 'Lab marker', body: `${formatOptionalNumber(item.previousValue, 2)} → ${formatOptionalNumber(item.latestValue, 2)}${item.unit ? ` ${item.unit}` : ''} (${item.direction || 'flat'})`, meta: `${formatDate(item.previousDate)} to ${formatDate(item.latestDate)}` }))} />
      <Guidance section={sections?.labs} />
    </div>
  }

  if (selected === 'chats') {
    if (chatHistoryUnavailable) {
      return <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6"><h4 className="font-semibold text-amber-950">Saved chats could not be checked</h4><p className="mt-2 text-sm leading-6 text-amber-800">Helfi is not showing the older generated count as fact. Please try opening this report again later.</p></div>
    }
    if (!Number(talkToAiSummary?.userMessageCount || coverage?.talkToAiCount || 0)) return <EmptyState label="saved AI chats" />
    const general = Number(talkToAiSummary?.sourceBreakdown?.general?.userMessageCount || 0)
    const food = Number(talkToAiSummary?.sourceBreakdown?.food?.userMessageCount || 0)
    return <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Saved prompts" value={formatNumber(talkToAiSummary?.userMessageCount)} />
        <Metric label="Active days" value={`${formatNumber(talkToAiSummary?.activeDays)}/7`} />
        <Metric label="General chat" value={formatNumber(general)} />
        <Metric label="Food chat" value={formatNumber(food)} />
      </div>
      <div className="flex flex-wrap gap-2">
        {general > 0 ? <Link href="/chat?history=1" className="rounded-full border border-blue-200 bg-white px-4 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-50">Open General chat history</Link> : null}
        {food > 0 ? <Link href="/chat?context=food&history=1" className="rounded-full border border-blue-200 bg-white px-4 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-50">Open Food chat history</Link> : null}
      </div>
    </div>
  }

  return null
}

const LABELS: Record<WeeklyDataKey, string> = {
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

export default function WeeklyDataExplorer(props: ExplorerProps) {
  const [selected, setSelected] = useState<WeeklyDataKey | null>(null)
  const detailRef = useRef<HTMLDivElement | null>(null)
  const tileRefs = useRef<Partial<Record<WeeklyDataKey, HTMLButtonElement | null>>>({})
  const coverage = props.coverage || {}
  const hydration = props.summary?.hydrationSummary || {}
  const mood = props.summary?.moodSummary || {}
  const checkins = props.summary?.checkinSummary || {}
  const exercise = props.summary?.exerciseSummary || {}

  const tiles: Tile[] = [
    { key: 'food', label: LABELS.food, value: Number(coverage.foodCount || 0), note: 'Meals, energy, macros and top foods', icon: FireIcon, tone: 'from-orange-50 to-white text-orange-700 border-orange-100' },
    { key: 'water', label: LABELS.water, value: Number(coverage.waterCount || 0), note: 'Daily water logs and drink types', icon: BeakerIcon, tone: 'from-cyan-50 to-white text-cyan-700 border-cyan-100' },
    { key: 'mood', label: LABELS.mood, value: Number(coverage.moodCount || 0), note: 'Mood level, trend, tags and notes', icon: FaceSmileIcon, tone: 'from-amber-50 to-white text-amber-700 border-amber-100' },
    { key: 'checkins', label: LABELS.checkins, value: Number(checkins.totalEntries ?? coverage.checkinCount ?? 0), note: 'Goal ratings, movement and notes', icon: ClipboardDocumentCheckIcon, tone: 'from-emerald-50 to-white text-emerald-700 border-emerald-100' },
    { key: 'symptoms', label: LABELS.symptoms, value: Number(coverage.symptomCount || 0), note: 'Frequency, unique symptoms and guidance', icon: ShieldExclamationIcon, tone: 'from-rose-50 to-white text-rose-700 border-rose-100' },
    { key: 'exercise', label: LABELS.exercise, value: Number(exercise.sessions ?? coverage.exerciseCount ?? 0), note: 'Sessions, minutes, distance and activities', icon: BoltIcon, tone: 'from-violet-50 to-white text-violet-700 border-violet-100' },
    { key: 'journal', label: LABELS.journal, value: Number(coverage.journalCount || 0), note: 'Saved notes and weekly highlights', icon: BookOpenIcon, tone: 'from-teal-50 to-white text-teal-700 border-teal-100' },
    { key: 'images', label: LABELS.images, value: Number(coverage.medicalImageCount || 0), note: 'Saved image-note findings and next steps', icon: PhotoIcon, tone: 'from-sky-50 to-white text-sky-700 border-sky-100' },
    { key: 'labs', label: LABELS.labs, value: Number(coverage.labCount || 0), note: 'Latest markers and movement over time', icon: ChartBarIcon, tone: 'from-indigo-50 to-white text-indigo-700 border-indigo-100' },
    { key: 'chats', label: LABELS.chats, value: props.chatHistoryUnavailable ? '—' : Number(coverage.talkToAiCount || 0), note: props.chatHistoryUnavailable ? 'Saved chat history is temporarily unavailable' : 'Verified saved prompt counts and chat sources', icon: ChatBubbleLeftRightIcon, tone: 'from-blue-50 to-white text-blue-700 border-blue-100' },
    { key: 'hydration', label: LABELS.hydration, value: Number(hydration.entries || 0), note: `${formatMl(hydration.totalMl)} total • ${formatMl(hydration.dailyAverageMl)} per day`, icon: CheckCircleIcon, tone: 'from-cyan-50 via-sky-50 to-white text-sky-800 border-sky-100' },
  ]

  useEffect(() => {
    if (!selected) return
    const id = window.setTimeout(() => {
      const detail = detailRef.current
      if (!detail) return
      detail.focus({ preventScroll: true })
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      detail.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })
    }, 40)
    return () => window.clearTimeout(id)
  }, [selected])

  const open = (key: WeeklyDataKey) => setSelected(key)
  const close = () => {
    const previous = selected
    setSelected(null)
    if (previous) window.setTimeout(() => tileRefs.current[previous]?.focus(), 0)
  }

  return (
    <section data-testid="weekly-data-explorer" className="weekly-data-interactive rounded-3xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Selected week</p>
          <h2 className="mt-1 text-2xl font-bold text-slate-950">Data used this week</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">Tap any area to open its full report for {formatDate(props.periodStart)} to {formatDate(props.periodEnd)}.</p>
        </div>
        <div className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">All 11 areas</div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((tile) => {
          const Icon = tile.icon
          const active = selected === tile.key
          return (
            <button
              key={tile.key}
              ref={(node) => { tileRefs.current[tile.key] = node }}
              type="button"
              data-testid={`weekly-data-tile-${tile.key}`}
              onClick={() => open(tile.key)}
              aria-expanded={active}
              aria-controls="weekly-data-detail"
              className={`group rounded-2xl border bg-gradient-to-br p-4 text-left shadow-sm outline-none motion-safe:transition motion-safe:duration-300 hover:-translate-y-1 hover:shadow-lg focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 ${tile.tone} ${tile.key === 'hydration' ? 'sm:col-span-2 lg:col-span-3' : ''} ${active ? 'ring-2 ring-emerald-500 ring-offset-2' : ''}`}
            >
              <div className="flex items-start justify-between gap-4">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/90 shadow-sm">
                  <Icon className="h-6 w-6" aria-hidden={true} />
                </span>
                <span className="text-2xl font-bold text-slate-950">{typeof tile.value === 'number' ? formatNumber(tile.value) : tile.value}</span>
              </div>
              <div className="mt-4 font-semibold text-slate-950">{tile.label}</div>
              <div className="mt-1 text-xs leading-5 text-slate-600">{tile.note}</div>
              <div className="mt-4 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-emerald-700">
                Open report <span aria-hidden="true" className="motion-safe:transition-transform group-hover:translate-x-1">→</span>
              </div>
            </button>
          )
        })}
      </div>

      {selected ? (
        <div id="weekly-data-detail" data-testid={`weekly-data-detail-${selected}`} ref={detailRef} tabIndex={-1} className="weekly-data-enter mt-6 scroll-mt-24 rounded-3xl border border-emerald-100 bg-[linear-gradient(180deg,#f0fdf8_0%,#f8fafc_28%,#ffffff_100%)] p-4 shadow-[0_24px_70px_rgba(15,23,42,0.10)] outline-none sm:p-6">
          <div className="flex items-start justify-between gap-4 border-b border-emerald-100 pb-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">{formatDate(props.periodStart)} to {formatDate(props.periodEnd)}</p>
              <h3 className="mt-2 text-2xl font-bold text-slate-950">{LABELS[selected]}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">The report dates stay fixed. Saved chat counts are the only item checked live for accuracy.</p>
            </div>
            <button type="button" onClick={close} className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-emerald-500" aria-label={`Close ${LABELS[selected]} report`}>
              <XMarkIcon className="h-5 w-5" aria-hidden={true} />
            </button>
          </div>
          <div className="mt-5">
            <DetailContent {...props} selected={selected} />
          </div>
        </div>
      ) : null}

      <style jsx global>{`
        @keyframes weekly-data-enter {
          from { opacity: 0; transform: translateY(16px) scale(0.99); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes weekly-data-grow {
          from { transform: scaleX(0); }
          to { transform: scaleX(1); }
        }
        .weekly-data-enter { animation: weekly-data-enter 420ms cubic-bezier(0.22, 1, 0.36, 1); }
        .weekly-data-grow { transform-origin: left center; animation: weekly-data-grow 700ms cubic-bezier(0.22, 1, 0.36, 1); }
        @media (prefers-reduced-motion: reduce) {
          .weekly-data-enter, .weekly-data-grow { animation: none !important; }
          .weekly-data-interactive *, .weekly-data-interactive *::before, .weekly-data-interactive *::after {
            scroll-behavior: auto !important;
            transition-duration: 0.01ms !important;
          }
        }
        @media print { .weekly-data-interactive { display: none !important; } }
      `}</style>
    </section>
  )
}
