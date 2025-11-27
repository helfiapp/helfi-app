'use client'

import React, { useEffect, useMemo, useState } from 'react'

type FitbitSeries = {
  success: boolean
  range: { start: string; end: string }
  series: {
    steps: Array<{ date: string; steps?: number }>
    sleep: Array<{ date: string; minutes?: number }>
  }
}

type CheckinRow = { date: string; issueId: string; name: string; polarity: 'positive' | 'negative'; value: number | null; note?: string }
type CheckinHistory = { history: CheckinRow[] }

function pearson(x: number[], y: number[]): number | null {
  const n = Math.min(x.length, y.length)
  if (n < 3) return null
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0, sumYY = 0, k = 0
  for (let i = 0; i < n; i++) {
    const xi = x[i]
    const yi = y[i]
    if (xi == null || yi == null || isNaN(xi) || isNaN(yi)) continue
    k++
    sumX += xi
    sumY += yi
    sumXY += xi * yi
    sumXX += xi * xi
    sumYY += yi * yi
  }
  if (k < 3) return null
  const cov = sumXY - (sumX * sumY) / k
  const varX = sumXX - (sumX * sumX) / k
  const varY = sumYY - (sumY * sumY) / k
  if (varX <= 0 || varY <= 0) return null
  return cov / Math.sqrt(varX * varY)
}

function strengthLabel(r: number | null): string {
  if (r == null) return 'No correlation'
  const a = Math.abs(r)
  if (a >= 0.7) return `Strong (${r.toFixed(2)})`
  if (a >= 0.4) return `Moderate (${r.toFixed(2)})`
  if (a >= 0.2) return `Weak (${r.toFixed(2)})`
  return `Very weak (${r.toFixed(2)})`
}

export default function FitbitCorrelations({ rangeDays = 30 }: { rangeDays?: number }) {
  const [fitbit, setFitbit] = useState<FitbitSeries | null>(null)
  const [checkins, setCheckins] = useState<CheckinHistory | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        // Fitbit
        const end = new Date()
        const start = new Date()
        start.setDate(end.getDate() - (rangeDays - 1))
        const startStr = start.toISOString().slice(0, 10)
        const endStr = end.toISOString().slice(0, 10)
        const fbRes = await fetch(`/api/fitbit/data?start=${startStr}&end=${endStr}&dataTypes=steps,sleep`)
        if (!fbRes.ok) throw new Error('Failed to load Fitbit data')
        setFitbit((await fbRes.json()) as FitbitSeries)
        // Checkins
        const ciRes = await fetch(`/api/checkins/history?start=${startStr}&end=${endStr}`)
        if (!ciRes.ok) throw new Error('Failed to load check-ins')
        setCheckins((await ciRes.json()) as CheckinHistory)
      } catch (e: any) {
        setError(e?.message || 'Failed to load correlations')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [rangeDays])

  const dailyMood = useMemo(() => {
    const map = new Map<string, number[]>()
    if (checkins?.history) {
      for (const row of checkins.history) {
        const d = row.date.slice(0, 10)
        const v = row.value ?? 0
        if (!map.has(d)) map.set(d, [])
        map.get(d)!.push(v)
      }
    }
    const avg = new Map<string, number>()
    map.forEach((arr, d) => {
      const mean = arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0
      avg.set(d, mean)
    })
    return avg
  }, [checkins])

  const series = useMemo(() => {
    if (!fitbit) return null
    const steps = fitbit.series.steps.map((s) => s.steps ?? 0)
    const sleepHrs = fitbit.series.sleep.map((s) => (s.minutes ?? 0) / 60)
    const xs = fitbit.series.steps.map((s) => s.date)
    const mood = xs.map((d) => dailyMood.get(d) ?? null)
    const stepsMood = pearson(steps, mood.map((v) => (v == null ? NaN : v)) as number[])
    const sleepMood = pearson(sleepHrs, mood.map((v) => (v == null ? NaN : v)) as number[])

    // Find low-sleep + low-mood days
    const flagged: Array<{ date: string; sleepHrs: number; mood: number | null }> = []
    xs.forEach((d, i) => {
      const sh = sleepHrs[i]
      const m = mood[i]
      if (sh > 0 && sh < 6 && (m == null || m < 3)) {
        flagged.push({ date: d, sleepHrs: sh, mood: m })
      }
    })

    return {
      stepsMood,
      sleepMood,
      flagged: flagged.slice(0, 5),
    }
  }, [fitbit, dailyMood])

  if (loading) {
    return <div className="rounded-xl border bg-white p-4 animate-pulse h-40" />
  }
  if (error) {
    return (
      <div className="p-4 rounded-xl border bg-red-50 border-red-200 text-red-700 text-sm">
        {error}
      </div>
    )
  }
  if (!fitbit || !series) return null

  // Check if we have any Fitbit data
  const hasFitbitData = fitbit.series.steps.some(s => s.steps != null) ||
                        fitbit.series.sleep.some(s => s.minutes != null)
  
  if (!hasFitbitData) {
    return (
      <div className="p-4 rounded-xl border bg-gray-50 border-gray-200 text-gray-600 text-sm">
        No Fitbit data available yet. Connect your Fitbit and sync data, or load demo data to see correlations.
      </div>
    )
  }

  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <div className="text-sm text-gray-500">Correlations (last {rangeDays} days)</div>
          <div className="text-lg font-semibold text-gray-900">How your activity and sleep relate to mood</div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
        <div className="p-4 rounded-lg border">
          <div className="text-sm text-gray-500">Steps ↔︎ Mood</div>
          <div className="text-xl font-semibold mt-1">{strengthLabel(series.stepsMood)}</div>
          <p className="text-xs text-gray-500 mt-1">Correlation uses daily steps and average daily check-in ratings.</p>
        </div>
        <div className="p-4 rounded-lg border">
          <div className="text-sm text-gray-500">Sleep ↔︎ Mood</div>
          <div className="text-xl font-semibold mt-1">{strengthLabel(series.sleepMood)}</div>
          <p className="text-xs text-gray-500 mt-1">Correlation uses total sleep hours per night vs. daily ratings.</p>
        </div>
      </div>

      {series.flagged.length > 0 && (
        <div className="mt-4">
          <div className="text-sm text-gray-600 mb-2">Recent low sleep + low mood days</div>
          <div className="rounded-lg border overflow-hidden">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-gray-600 font-medium">Date</th>
                  <th className="px-3 py-2 text-left text-gray-600 font-medium">Sleep</th>
                  <th className="px-3 py-2 text-left text-gray-600 font-medium">Avg Mood</th>
                </tr>
              </thead>
              <tbody>
                {series.flagged.map((row) => (
                  <tr key={row.date} className="border-t">
                    <td className="px-3 py-2">{row.date}</td>
                    <td className="px-3 py-2">{row.sleepHrs.toFixed(1)} h</td>
                    <td className="px-3 py-2">{row.mood == null ? 'N/A' : row.mood.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}


