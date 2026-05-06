'use client'

import { useMemo, type ReactNode } from 'react'
import { Bar, Doughnut, Line } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
  Filler,
  type ChartOptions,
} from 'chart.js'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Tooltip, Legend, Filler)

type DailyStat = {
  date: string
  calories?: number
  waterMl?: number
  exerciseMinutes?: number
  moodAvg?: number | null
  symptomCount?: number
}

type NutritionSummary = {
  dailyAverages?: {
    calories?: number
    protein_g?: number
    carbs_g?: number
    fat_g?: number
    fiber_g?: number
    sugar_g?: number
    sodium_mg?: number
  }
  daysWithLogs?: number
  topFoods?: Array<{ name?: string; count?: number }>
  dailyTotals?: Array<{ date: string; calories?: number; protein_g?: number; carbs_g?: number; fat_g?: number }>
}

type HydrationSummary = {
  dailyAverageMl?: number
  daysWithLogs?: number
  dailyTotals?: Array<{ date: string; totalMl?: number }>
  topDrinks?: Array<{ label?: string; count?: number }>
}

type Coverage = {
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

type MedicalImageSummary = {
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

type JournalSummary = {
  entries?: number
  daysWithNotes?: number
  highlights?: Array<{
    date?: string
    time?: string
    note?: string
  }>
}

type PreviousSummary = {
  periodLabel?: string
  nutritionSummary?: NutritionSummary
  hydrationSummary?: HydrationSummary
  dailyStats?: DailyStat[]
}

function toDateKey(value?: string | null) {
  const raw = String(value || '').trim()
  if (!raw) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

function listDaysInclusive(startKey: string, endKey: string) {
  const days: string[] = []
  const start = new Date(`${startKey}T00:00:00Z`)
  const end = new Date(`${endKey}T00:00:00Z`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return days
  const cursor = new Date(start.getTime())
  for (let i = 0; i < 10; i += 1) {
    const key = cursor.toISOString().slice(0, 10)
    days.push(key)
    if (key === endKey) break
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return days
}

function shortDayLabel(dateKey: string) {
  const d = new Date(`${dateKey}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return dateKey
  return new Intl.DateTimeFormat('en-AU', { weekday: 'short' }).format(d)
}

function niceDateLabel(dateKey: string) {
  const d = new Date(`${dateKey}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return dateKey
  return new Intl.DateTimeFormat('en-AU', { weekday: 'short', day: '2-digit', month: 'short' }).format(d)
}

function compactDateLabel(dateKey: string) {
  const d = new Date(`${dateKey}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return dateKey
  return new Intl.DateTimeFormat('en-AU', { day: '2-digit', month: 'short' }).format(d)
}

function cardClassName(variant: 'neutral' | 'mint' | 'sky' | 'amber' | 'rose' = 'neutral') {
  if (variant === 'mint') return 'min-w-0 rounded-3xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white p-5 shadow-sm'
  if (variant === 'sky') return 'min-w-0 rounded-3xl border border-sky-100 bg-gradient-to-br from-sky-50 to-white p-5 shadow-sm'
  if (variant === 'amber') return 'min-w-0 rounded-3xl border border-amber-100 bg-gradient-to-br from-amber-50 to-white p-5 shadow-sm'
  if (variant === 'rose') return 'min-w-0 rounded-3xl border border-rose-100 bg-gradient-to-br from-rose-50 to-white p-5 shadow-sm'
  return 'min-w-0 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm'
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex h-[180px] items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white/80 p-4 text-center text-sm leading-6 text-slate-600">
      {message}
    </div>
  )
}

function ChartDisclosure({
  title,
  eyebrow,
  summary,
  children,
}: {
  title: string
  eyebrow: string
  summary: string
  children: ReactNode
}) {
  return (
    <details className="group min-w-0 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <summary className="flex cursor-pointer list-none items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-slate-200 text-xl font-semibold text-helfi-green group-open:hidden">+</span>
        <span className="hidden h-10 w-10 shrink-0 place-items-center rounded-full border border-slate-200 text-xl font-semibold text-slate-600 group-open:grid">-</span>
        <div className="min-w-0 pr-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{eyebrow}</div>
          <div className="mt-1 text-lg font-semibold text-slate-900">{title}</div>
          <div className="mt-1 text-sm leading-6 text-slate-600">{summary}</div>
        </div>
      </summary>
      <div className="mt-4">{children}</div>
    </details>
  )
}

export default function ReportVisuals(props: {
  periodStart: string
  periodEnd: string
  coverage?: Coverage
  nutritionSummary?: NutritionSummary
  hydrationSummary?: HydrationSummary
  dailyStats?: DailyStat[]
  symptomSummary?: { topSymptoms?: Array<{ name?: string; count?: number }> }
  exerciseSummary?: { topActivities?: Array<{ name?: string; count?: number }> }
  medicalImageSummary?: MedicalImageSummary
  journalSummary?: JournalSummary
  previousSummary?: PreviousSummary | null
}) {
  const periodStartKey = toDateKey(props.periodStart) || ''
  const periodEndKey = toDateKey(props.periodEnd) || ''

  const days = useMemo(() => {
    if (!periodStartKey || !periodEndKey) return []
    const listed = listDaysInclusive(periodStartKey, periodEndKey)
    return listed.length ? listed.slice(-7) : []
  }, [periodStartKey, periodEndKey])

  const dailyByKey = useMemo(() => {
    const map = new Map<string, DailyStat>()
    ;(props.dailyStats || []).forEach((row) => {
      const key = toDateKey(row?.date)
      if (!key) return
      map.set(key, row)
    })
    return map
  }, [props.dailyStats])

  const nutritionDailyByKey = useMemo(() => {
    const map = new Map<string, number>()
    ;(props.nutritionSummary?.dailyTotals || []).forEach((row) => {
      const key = toDateKey(row?.date)
      if (!key) return
      const calories = Number((row as any)?.calories ?? 0) || 0
      map.set(key, calories)
    })
    return map
  }, [props.nutritionSummary?.dailyTotals])

  const hydrationDailyByKey = useMemo(() => {
    const map = new Map<string, number>()
    ;(props.hydrationSummary?.dailyTotals || []).forEach((row) => {
      const key = toDateKey((row as any)?.date)
      if (!key) return
      const ml = Number((row as any)?.totalMl ?? 0) || 0
      map.set(key, ml)
    })
    return map
  }, [props.hydrationSummary?.dailyTotals])

  const caloriesSeries = useMemo(() => {
    return days.map((d) => {
      if (nutritionDailyByKey.has(d)) return Number(nutritionDailyByKey.get(d) ?? 0) || 0
      return Number(dailyByKey.get(d)?.calories ?? 0) || 0
    })
  }, [days, dailyByKey, nutritionDailyByKey])

  const waterSeries = useMemo(() => {
    return days.map((d) => {
      if (hydrationDailyByKey.has(d)) return Number(hydrationDailyByKey.get(d) ?? 0) || 0
      return Number(dailyByKey.get(d)?.waterMl ?? 0) || 0
    })
  }, [days, dailyByKey, hydrationDailyByKey])

  const moodSeries = useMemo(() => {
    return days.map((d) => {
      const v = dailyByKey.get(d)?.moodAvg
      return typeof v === 'number' && Number.isFinite(v) ? v : null
    })
  }, [days, dailyByKey])

  const symptomSeries = useMemo(() => {
    return days.map((d) => Number(dailyByKey.get(d)?.symptomCount ?? 0) || 0)
  }, [days, dailyByKey])

  const exerciseSeries = useMemo(() => {
    return days.map((d) => Number(dailyByKey.get(d)?.exerciseMinutes ?? 0) || 0)
  }, [days, dailyByKey])

  const calorieStats = useMemo(() => {
    const values = caloriesSeries
      .map((value, index) => ({ value, day: days[index] || '' }))
      .filter((row) => row.value > 0)

    if (!values.length) {
      return { average: 0, highest: null as null | { value: number; day: string }, lowest: null as null | { value: number; day: string }, swing: 0 }
    }

    const total = values.reduce((sum, row) => sum + row.value, 0)
    const highest = values.reduce((best, row) => (row.value > best.value ? row : best), values[0])
    const lowest = values.reduce((best, row) => (row.value < best.value ? row : best), values[0])

    return {
      average: Math.round(total / values.length),
      highest,
      lowest,
      swing: Math.round(highest.value - lowest.value),
    }
  }, [caloriesSeries, days])

  const previousCaloriesAverage = Number(props.previousSummary?.nutritionSummary?.dailyAverages?.calories ?? 0) || 0
  const calorieAverageChange = calorieStats.average && previousCaloriesAverage ? calorieStats.average - previousCaloriesAverage : 0
  const calorieAverageChangeLabel =
    calorieAverageChange === 0
      ? 'No change from previous report'
      : `${Math.abs(calorieAverageChange).toLocaleString()} cal ${calorieAverageChange > 0 ? 'higher' : 'lower'} than previous report`

  const calorieRhythm = useMemo(() => {
    const values = caloriesSeries.filter((value) => value > 0)
    const max = Math.max(1, ...values)
    const min = Math.min(...values, max)
    const spread = Math.max(1, max - min)

    return days.map((day, index) => {
      const value = Number(caloriesSeries[index] ?? 0) || 0
      const lift = value > 0 ? 34 + Math.round(((value - min) / spread) * 58) : 0
      return {
        day,
        label: shortDayLabel(day).slice(0, 3),
        value,
        height: lift,
        isHighest: calorieStats.highest?.day === day,
        isLowest: calorieStats.lowest?.day === day,
      }
    })
  }, [calorieStats.highest?.day, calorieStats.lowest?.day, caloriesSeries, days])

  const macroDonut = useMemo(() => {
    const avg = props.nutritionSummary?.dailyAverages || {}
    const proteinG = Number(avg.protein_g ?? 0) || 0
    const carbsG = Number(avg.carbs_g ?? 0) || 0
    const fatG = Number(avg.fat_g ?? 0) || 0
    const proteinKcal = proteinG * 4
    const carbsKcal = carbsG * 4
    const fatKcal = fatG * 9
    const total = proteinKcal + carbsKcal + fatKcal
    return {
      total,
      labels: ['Protein', 'Carbs', 'Fat'],
      values: [proteinKcal, carbsKcal, fatKcal],
      grams: [proteinG, carbsG, fatG],
    }
  }, [props.nutritionSummary])

  const coverageDonut = useMemo(() => {
    const c = props.coverage || {}
    const buckets = [
      { label: 'Food', value: Number(c.foodCount ?? 0) || 0 },
      { label: 'Water', value: Number(c.waterCount ?? 0) || 0 },
      { label: 'Mood', value: Number(c.moodCount ?? 0) || 0 },
      { label: 'Symptoms', value: Number(c.symptomCount ?? 0) || 0 },
      { label: 'Exercise', value: Number(c.exerciseCount ?? 0) || 0 },
      { label: 'Labs', value: Number(c.labCount ?? 0) || 0 },
      { label: 'Chat', value: Number(c.talkToAiCount ?? 0) || 0 },
      { label: 'Journal', value: Number(c.journalCount ?? 0) || 0 },
      { label: 'Scans', value: Number(c.medicalImageCount ?? 0) || 0 },
    ].filter((b) => b.value > 0)
    const total = buckets.reduce((sum, b) => sum + b.value, 0)
    return {
      total,
      labels: buckets.map((b) => b.label),
      values: buckets.map((b) => b.value),
    }
  }, [props.coverage])

  const baseLineOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          title: (items) => {
            const idx = items?.[0]?.dataIndex ?? 0
            const key = days[idx] || ''
            return key ? niceDateLabel(key) : ''
          },
        },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: '#64748b', font: { size: 11 } } },
      y: { grid: { color: 'rgba(148, 163, 184, 0.25)' }, ticks: { color: '#64748b', font: { size: 11 } } },
    },
    elements: {
      point: { radius: 2.5, hoverRadius: 4 },
      line: { tension: 0.35 },
    },
  }

  const baseBarOptions: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          title: (items) => {
            const idx = items?.[0]?.dataIndex ?? 0
            const key = days[idx] || ''
            return key ? niceDateLabel(key) : ''
          },
        },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: '#64748b', font: { size: 11 } } },
      y: { grid: { color: 'rgba(148, 163, 184, 0.25)' }, ticks: { color: '#64748b', font: { size: 11 } } },
    },
  }

  const donutOptions: ChartOptions<'doughnut'> = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '68%',
    plugins: {
      legend: {
        position: 'bottom',
        labels: { boxWidth: 10, boxHeight: 10, color: '#334155', font: { size: 11 } },
      },
      tooltip: {
        callbacks: {
          label: (item) => {
            const raw = Number(item.raw ?? 0) || 0
            if (!coverageDonut.total && !macroDonut.total) return `${item.label}: ${raw}`
            return `${item.label}: ${raw}`
          },
        },
      },
    },
  }

  const hasAnyCalories = caloriesSeries.some((v) => v > 0)
  const hasAnyWater = waterSeries.some((v) => v > 0)
  const hasAnyMood = moodSeries.filter((v): v is number => typeof v === 'number').length >= 2
  const hasAnySymptoms = symptomSeries.some((v) => v > 0)
  const hasAnyExercise = exerciseSeries.some((v) => v > 0)

  const topSymptoms = Array.isArray(props.symptomSummary?.topSymptoms) ? props.symptomSummary?.topSymptoms : []
  const topActivities = Array.isArray(props.exerciseSummary?.topActivities) ? props.exerciseSummary?.topActivities : []
  const topFoods = Array.isArray(props.nutritionSummary?.topFoods) ? props.nutritionSummary?.topFoods : []
  const medicalHighlights = Array.isArray(props.medicalImageSummary?.highlights) ? props.medicalImageSummary?.highlights : []
  const journalHighlights = Array.isArray(props.journalSummary?.highlights) ? props.journalSummary?.highlights : []

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-3 print:grid-cols-2">
        <ChartDisclosure
          eyebrow="Your week"
          title="Quick snapshot"
          summary={`${props.coverage?.daysActive ?? 0} active days and ${props.coverage?.totalEvents ?? 0} total entries.`}
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Your week</div>
              <div className="mt-1 text-lg font-semibold text-slate-900">Quick snapshot</div>
              <div className="mt-1 text-sm text-slate-600">
                {props.coverage?.daysActive ?? 0} active days • {props.coverage?.totalEvents ?? 0} total entries
              </div>
            </div>
            <div className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-left sm:w-auto sm:text-right">
              <div className="text-xs text-slate-500">Period</div>
              <div className="text-sm font-semibold text-slate-900 sm:whitespace-nowrap">
                {compactDateLabel(periodStartKey)} to {compactDateLabel(periodEndKey)}
              </div>
            </div>
          </div>

          {coverageDonut.total > 0 ? (
            <div className="mt-4 h-[220px] min-w-0">
              <Doughnut
                data={{
                  labels: coverageDonut.labels,
                  datasets: [
                    {
                      data: coverageDonut.values,
                      backgroundColor: ['#10b981', '#38bdf8', '#60a5fa', '#f472b6', '#f59e0b', '#a78bfa', '#94a3b8', '#34d399', '#0ea5e9'],
                      borderColor: 'rgba(255,255,255,0.95)',
                      borderWidth: 2,
                    },
                  ],
                }}
                options={donutOptions}
              />
            </div>
          ) : (
            <div className="mt-4">
              <EmptyChart message="Not enough activity yet to show a breakdown. As soon as you log a few things, this will light up." />
            </div>
          )}
        </ChartDisclosure>

        <ChartDisclosure
          eyebrow="Nutrition"
          title="Macro split"
          summary="Protein, carbs, and fat balance for the week."
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700/80">Nutrition</div>
              <div className="mt-1 text-lg font-semibold text-emerald-950">Macro split</div>
              <div className="mt-1 text-sm text-emerald-900/80">
                Average per day (last 7 days of logs)
              </div>
            </div>
          </div>

          {macroDonut.total > 0 ? (
            <div className="mt-4 grid gap-4 sm:grid-cols-2 sm:items-center">
              <div className="h-[220px] min-w-0">
                <Doughnut
                  data={{
                    labels: macroDonut.labels,
                    datasets: [
                      {
                        data: macroDonut.values,
                        backgroundColor: ['#059669', '#34d399', '#0ea5e9'],
                        borderColor: 'rgba(255,255,255,0.95)',
                        borderWidth: 2,
                      },
                    ],
                  }}
                  options={{
                    ...donutOptions,
                    plugins: {
                      ...donutOptions.plugins,
                      legend: { ...donutOptions.plugins?.legend, labels: { ...donutOptions.plugins?.legend?.labels, color: '#064e3b' } },
                    },
                  }}
                />
              </div>
              <div className="space-y-3">
                {macroDonut.labels.map((label, idx) => (
                  <div key={label} className="rounded-xl border border-emerald-100 bg-white/70 p-3">
                    <div className="text-xs font-semibold text-emerald-900">{label}</div>
                    <div className="mt-1 text-sm text-emerald-800">
                      {Math.round(macroDonut.grams[idx])}g per day
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-4">
              <EmptyChart message="Not enough nutrition data to calculate macros yet. This will appear once your food logs include nutrition details." />
            </div>
          )}
        </ChartDisclosure>

        <ChartDisclosure
          eyebrow="Hydration"
          title="Water per day"
          summary={`Average: ${Math.round(Number(props.hydrationSummary?.dailyAverageMl ?? 0) || 0)} ml per day.`}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-sky-700/80">Hydration</div>
              <div className="mt-1 text-lg font-semibold text-sky-950">Water per day</div>
              <div className="mt-1 text-sm text-sky-900/80">
                Average: {Math.round(Number(props.hydrationSummary?.dailyAverageMl ?? 0) || 0)} ml / day
              </div>
            </div>
          </div>

          {days.length && hasAnyWater ? (
            <div className="mt-4 h-[220px] min-w-0">
              <Bar
                data={{
                  labels: days.map(shortDayLabel),
                  datasets: [
                    {
                      data: waterSeries,
                      backgroundColor: 'rgba(56, 189, 248, 0.85)',
                      borderRadius: 10,
                    },
                  ],
                }}
                options={baseBarOptions}
              />
            </div>
          ) : (
            <div className="mt-4">
              <EmptyChart message="No water logs this week yet. Add a water entry and this chart will appear." />
            </div>
          )}

          {props.hydrationSummary?.topDrinks && props.hydrationSummary.topDrinks.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {props.hydrationSummary.topDrinks.slice(0, 4).map((drink, idx) => (
                <span
                  key={`${drink.label || 'drink'}-${idx}`}
                  className="rounded-full border border-sky-100 bg-white px-3 py-1 text-xs font-semibold text-sky-900"
                >
                  {(drink.label || 'Drink').toString()}
                  {drink.count ? ` • ${drink.count}` : ''}
                </span>
              ))}
            </div>
          )}
        </ChartDisclosure>
      </div>

      <div className="grid gap-4 lg:grid-cols-3 print:grid-cols-2">
        <ChartDisclosure
          eyebrow="Calories"
          title="Food energy"
          summary={previousCaloriesAverage > 0 ? calorieAverageChangeLabel : 'Daily calories, with the biggest changes highlighted.'}
        >
          <div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-amber-700/80">Calories</div>
              <div className="mt-1 text-lg font-semibold text-amber-950">Food energy</div>
              <div className="mt-1 text-sm text-amber-900/80">Daily calories, with the biggest changes highlighted.</div>
            </div>
          </div>

          {calorieStats.average > 0 && (
            <div className="mt-4 grid grid-cols-3 gap-2">
              <div className="rounded-2xl border border-amber-100 bg-white/75 p-3 shadow-sm">
                <div className="text-[10px] font-bold uppercase tracking-wide text-amber-700">Average</div>
                <div className="mt-1 text-lg font-bold leading-tight text-amber-950">{calorieStats.average.toLocaleString()}</div>
                <div className="text-[10px] font-semibold text-amber-800">cal / day</div>
              </div>
              <div className="rounded-2xl border border-emerald-100 bg-white/75 p-3 shadow-sm">
                <div className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">Highest</div>
                <div className="mt-1 text-lg font-bold leading-tight text-emerald-950">{Math.round(calorieStats.highest?.value ?? 0).toLocaleString()}</div>
                <div className="text-[10px] font-semibold text-emerald-800">{calorieStats.highest?.day ? shortDayLabel(calorieStats.highest.day).slice(0, 3) : 'No day'}</div>
              </div>
              <div className="rounded-2xl border border-rose-100 bg-white/75 p-3 shadow-sm">
                <div className="text-[10px] font-bold uppercase tracking-wide text-rose-700">Lowest</div>
                <div className="mt-1 text-lg font-bold leading-tight text-rose-950">{Math.round(calorieStats.lowest?.value ?? 0).toLocaleString()}</div>
                <div className="text-[10px] font-semibold text-rose-800">{calorieStats.lowest?.day ? shortDayLabel(calorieStats.lowest.day).slice(0, 3) : 'No day'}</div>
              </div>
            </div>
          )}

          {previousCaloriesAverage > 0 && (
            <div className="mt-3 grid grid-cols-3 gap-2 rounded-2xl border border-amber-100 bg-amber-50/70 p-3">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wide text-amber-700">This report</div>
                <div className="mt-1 text-lg font-bold text-amber-950">{calorieStats.average.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wide text-amber-700">Previous</div>
                <div className="mt-1 text-lg font-bold text-amber-950">{previousCaloriesAverage.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wide text-amber-700">Change</div>
                <div className={`mt-1 text-lg font-bold ${calorieAverageChange > 0 ? 'text-amber-950' : 'text-emerald-800'}`}>
                  {calorieAverageChange > 0 ? '+' : calorieAverageChange < 0 ? '-' : ''}
                  {Math.abs(calorieAverageChange).toLocaleString()}
                </div>
              </div>
            </div>
          )}

          {days.length && hasAnyCalories ? (
            <div className="mt-4 min-w-0 rounded-3xl border border-amber-100 bg-white p-4 shadow-sm">
              <div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">Energy rhythm</div>
                  <div className="mt-1 text-sm leading-5 text-amber-900/80">
                    A simpler view of which days were heavier or lighter.
                  </div>
                </div>
              </div>

              <div className="mt-5 grid h-52 grid-cols-7 items-end gap-2 rounded-2xl bg-gradient-to-b from-amber-50 to-white px-3 pb-3 pt-5">
                {calorieRhythm.map((day) => (
                  <div key={day.day} className="flex h-full min-w-0 flex-col items-center justify-end gap-2">
                    <div className="flex h-32 w-full items-end justify-center">
                      <div
                        className={`relative w-full max-w-8 rounded-full ${
                          day.isHighest
                            ? 'bg-emerald-500 shadow-[0_10px_22px_rgba(16,185,129,0.28)]'
                            : day.isLowest
                              ? 'bg-rose-400 shadow-[0_10px_22px_rgba(251,113,133,0.24)]'
                              : 'bg-amber-400 shadow-[0_10px_22px_rgba(245,158,11,0.20)]'
                        }`}
                        style={{ height: `${day.height}%` }}
                      >
                        {(day.isHighest || day.isLowest) && (
                          <span className="absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-slate-800 shadow-sm">
                            {day.isHighest ? 'High' : 'Low'}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-[11px] font-bold text-amber-950">{day.label}</div>
                    <div className="text-[10px] font-semibold text-amber-700">{day.value ? Math.round(day.value).toLocaleString() : '-'}</div>
                  </div>
                ))}
              </div>

              <div className="mt-3 rounded-2xl border border-amber-100 bg-amber-50/70 p-3 text-sm leading-6 text-amber-950">
                The biggest change was from {calorieStats.lowest?.day ? niceDateLabel(calorieStats.lowest.day) : 'the lowest day'} to{' '}
                {calorieStats.highest?.day ? niceDateLabel(calorieStats.highest.day) : 'the highest day'}.
              </div>
            </div>
          ) : (
            <div className="mt-4">
              <EmptyChart message="No calorie data to chart yet. This appears when food logs include calories." />
            </div>
          )}
        </ChartDisclosure>

        <ChartDisclosure
          eyebrow="Mood"
          title="Mood trend"
          summary="Average mood per day."
        >
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Mood</div>
          <div className="mt-1 text-lg font-semibold text-slate-900">Mood trend</div>
          <div className="mt-1 text-sm text-slate-600">Average mood per day</div>
          {days.length && hasAnyMood ? (
            <div className="mt-4 h-[220px] min-w-0">
              <Line
                data={{
                  labels: days.map(shortDayLabel),
                  datasets: [
                    {
                      data: moodSeries as any,
                      borderColor: 'rgba(59, 130, 246, 0.9)',
                      backgroundColor: 'rgba(59, 130, 246, 0.15)',
                      fill: true,
                      spanGaps: true,
                    },
                  ],
                }}
                options={{
                  ...baseLineOptions,
                  scales: {
                    ...baseLineOptions.scales,
                    y: { ...baseLineOptions.scales?.y, suggestedMin: 0, suggestedMax: 10 },
                  },
                }}
              />
            </div>
          ) : (
            <div className="mt-4">
              <EmptyChart message="Not enough mood entries to chart a trend yet. Add a few mood check-ins this week." />
            </div>
          )}
        </ChartDisclosure>

        <ChartDisclosure
          eyebrow="Symptoms"
          title="Symptom load"
          summary="How many symptoms showed up each day."
        >
          <div className="text-xs font-semibold uppercase tracking-wide text-rose-700/80">Symptoms</div>
          <div className="mt-1 text-lg font-semibold text-rose-950">Symptom load</div>
          <div className="mt-1 text-sm text-rose-900/80">How many symptoms showed up each day</div>
          {days.length && hasAnySymptoms ? (
            <div className="mt-4 h-[220px] min-w-0">
              <Bar
                data={{
                  labels: days.map(shortDayLabel),
                  datasets: [
                    {
                      data: symptomSeries,
                      backgroundColor: 'rgba(244, 114, 182, 0.75)',
                      borderRadius: 10,
                    },
                  ],
                }}
                options={baseBarOptions}
              />
            </div>
          ) : (
            <div className="mt-4">
              <EmptyChart message="No symptom entries to chart yet. If you run symptom analysis, this will appear." />
            </div>
          )}
        </ChartDisclosure>
      </div>

      <div className="grid gap-4 lg:grid-cols-3 print:grid-cols-2">
        <ChartDisclosure
          eyebrow="Exercise"
          title="Minutes per day"
          summary="Total minutes logged."
        >
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Exercise</div>
          <div className="mt-1 text-lg font-semibold text-slate-900">Minutes per day</div>
          <div className="mt-1 text-sm text-slate-600">Total minutes logged</div>
          {days.length && hasAnyExercise ? (
            <div className="mt-4 h-[220px] min-w-0">
              <Bar
                data={{
                  labels: days.map(shortDayLabel),
                  datasets: [
                    {
                      data: exerciseSeries,
                      backgroundColor: 'rgba(99, 102, 241, 0.75)',
                      borderRadius: 10,
                    },
                  ],
                }}
                options={baseBarOptions}
              />
            </div>
          ) : (
            <div className="mt-4">
              <EmptyChart message="No exercise entries this week yet. Add a workout to see this chart." />
            </div>
          )}
        </ChartDisclosure>

        <ChartDisclosure
          eyebrow="Top foods"
          title="Most common picks"
          summary="Based on your logged foods."
        >
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Top foods</div>
          <div className="mt-1 text-lg font-semibold text-slate-900">Most common picks</div>
          <div className="mt-1 text-sm text-slate-600">Based on your logged foods</div>
          {topFoods.length ? (
            <div className="mt-4 space-y-2">
              {topFoods.slice(0, 6).map((row, idx) => (
                <div key={`${row.name || 'food'}-${idx}`} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <div className="flex items-center justify-between text-sm">
                    <div className="font-semibold text-slate-900">{row.name || 'Food'}</div>
                    <div className="text-slate-600">{row.count ?? 0}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4">
              <EmptyChart message="No food patterns to show yet. Once you log a few meals, your top foods will appear here." />
            </div>
          )}
        </ChartDisclosure>

        <ChartDisclosure
          eyebrow="Symptoms"
          title="What showed up most"
          summary="Based on symptom analysis."
        >
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Top symptoms</div>
          <div className="mt-1 text-lg font-semibold text-slate-900">What showed up most</div>
          <div className="mt-1 text-sm text-slate-600">Based on symptom analysis</div>
          {topSymptoms.length ? (
            <div className="mt-4 space-y-2">
              {topSymptoms.slice(0, 6).map((row, idx) => (
                <div key={`${row.name || 'symptom'}-${idx}`} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <div className="flex items-center justify-between text-sm">
                    <div className="font-semibold text-slate-900">{row.name || 'Symptom'}</div>
                    <div className="text-slate-600">{row.count ?? 0}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : topActivities.length ? (
            <div className="mt-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Top activities</div>
              <div className="mt-2 space-y-2">
                {topActivities.slice(0, 6).map((row, idx) => (
                  <div key={`${row.name || 'activity'}-${idx}`} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                    <div className="flex items-center justify-between text-sm">
                      <div className="font-semibold text-slate-900">{row.name || 'Activity'}</div>
                      <div className="text-slate-600">{row.count ?? 0}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-4">
              <EmptyChart message="No symptom highlights yet. This fills in once symptom analysis has been used a few times." />
            </div>
          )}
        </ChartDisclosure>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 print:grid-cols-2">
        <ChartDisclosure
          eyebrow="Medical image analyser"
          title="Saved scan highlights"
          summary={`${Number(props.medicalImageSummary?.entries ?? 0) || 0} scans across ${Number(props.medicalImageSummary?.daysWithScans ?? 0) || 0} days.`}
        >
          <div className="text-xs font-semibold uppercase tracking-wide text-sky-700/80">Medical image analyser</div>
          <div className="mt-1 text-lg font-semibold text-sky-950">Saved scan highlights</div>
          <div className="mt-1 text-sm text-sky-900/80">
            {Number(props.medicalImageSummary?.entries ?? 0) || 0} scans • {Number(props.medicalImageSummary?.daysWithScans ?? 0) || 0} days
          </div>
          {medicalHighlights.length ? (
            <div className="mt-4 space-y-3">
              {medicalHighlights.slice(0, 3).map((item, idx) => (
                <div key={`medical-highlight-${idx}`} className="rounded-xl border border-sky-100 bg-white p-3">
                  <div className="text-xs font-semibold text-sky-800">
                    {[item.date, item.time].filter(Boolean).join(' • ') || 'Saved scan'}
                  </div>
                  <div className="mt-1 text-sm font-semibold text-slate-900">{item.summary || 'Saved medical image scan'}</div>
                  {Array.isArray(item.possibleCauses) && item.possibleCauses.length ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {item.possibleCauses.slice(0, 3).map((cause, causeIdx) => (
                        <span
                          key={`${cause}-${causeIdx}`}
                          className="rounded-full border border-sky-100 bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-900"
                        >
                          {cause}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4">
              <EmptyChart message="No saved medical image scans this week yet. If you save a scan, a summary will show here." />
            </div>
          )}
        </ChartDisclosure>

        <ChartDisclosure
          eyebrow="Health journal"
          title="Recent notes"
          summary={`${Number(props.journalSummary?.entries ?? 0) || 0} notes across ${Number(props.journalSummary?.daysWithNotes ?? 0) || 0} days.`}
        >
          <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700/80">Health journal</div>
          <div className="mt-1 text-lg font-semibold text-emerald-950">Recent notes</div>
          <div className="mt-1 text-sm text-emerald-900/80">
            {Number(props.journalSummary?.entries ?? 0) || 0} notes • {Number(props.journalSummary?.daysWithNotes ?? 0) || 0} days
          </div>
          {journalHighlights.length ? (
            <div className="mt-4 space-y-3">
              {journalHighlights.slice(0, 3).map((item, idx) => (
                <div key={`journal-highlight-${idx}`} className="rounded-xl border border-emerald-100 bg-white p-3">
                  <div className="text-xs font-semibold text-emerald-800">
                    {[item.date, item.time].filter(Boolean).join(' • ') || 'Journal note'}
                  </div>
                  <div className="mt-1 text-sm text-slate-900">{item.note || 'Saved note'}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4">
              <EmptyChart message="No health journal notes this week yet. If you add notes, they will show up here." />
            </div>
          )}
        </ChartDisclosure>
      </div>
    </div>
  )
}
