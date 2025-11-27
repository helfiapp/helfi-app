'use client'

import React, { useEffect, useMemo, useState } from 'react'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  TimeScale,
} from 'chart.js'
import 'chartjs-adapter-date-fns'
import { Line } from 'react-chartjs-2'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, TimeScale)

type SeriesResponse = {
  success: boolean
  range: { start: string; end: string }
  series: {
    steps: Array<{ date: string; steps?: number }>
    heartrate: Array<{ date: string; restingHeartRate?: number }>
    sleep: Array<{ date: string; minutes?: number }>
    weight: Array<{ date: string; weightKg?: number }>
  }
}

function toDataset(
  xs: string[],
  ys: (number | undefined)[],
  color: string,
  label: string
) {
  return {
    labels: xs,
    datasets: [
      {
        label,
        data: ys.map((v) => (typeof v === 'number' ? v : null)),
        fill: false,
        borderColor: color,
        backgroundColor: color,
        tension: 0.25,
        spanGaps: true,
      },
    ],
  }
}

const baseOptions = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index' as const, intersect: false },
  plugins: { legend: { display: false } },
  scales: {
    x: { type: 'time' as const, time: { unit: 'day' as const } },
    y: { beginAtZero: true },
  },
}

export default function FitbitCharts({ rangeDays = 30 }: { rangeDays?: number }) {
  const [data, setData] = useState<SeriesResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      setError(null)
      try {
        const end = new Date()
        const start = new Date()
        start.setDate(end.getDate() - (rangeDays - 1))
        const startStr = start.toISOString().slice(0, 10)
        const endStr = end.toISOString().slice(0, 10)
        const res = await fetch(`/api/fitbit/data?start=${startStr}&end=${endStr}`)
        if (!res.ok) throw new Error('Failed to load Fitbit data')
        setData((await res.json()) as SeriesResponse)
      } catch (e: any) {
        setError(e?.message || 'Failed to load data')
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [rangeDays])

  const xs = useMemo(() => (data ? data.series.steps.map((s) => s.date) : []), [data])
  const steps = useMemo(() => (data ? data.series.steps.map((s) => s.steps ?? undefined) : []), [data])
  const rhr = useMemo(
    () => (data ? data.series.heartrate.map((s) => s.restingHeartRate ?? undefined) : []),
    [data]
  )
  const sleepMin = useMemo(
    () => (data ? data.series.sleep.map((s) => s.minutes ?? undefined) : []),
    [data]
  )
  const weightKg = useMemo(
    () => (data ? data.series.weight.map((s) => s.weightKg ?? undefined) : []),
    [data]
  )

  if (loading) {
    return <div className="h-64 rounded-xl border bg-white animate-pulse" />
  }
  if (error) {
    return (
      <div className="p-4 rounded-xl border bg-red-50 border-red-200 text-red-700 text-sm">
        {error}
      </div>
    )
  }
  if (!data) return null

  // Check if we have any data at all
  const hasData = data.series.steps.some(s => s.steps != null) ||
                  data.series.heartrate.some(h => h.restingHeartRate != null) ||
                  data.series.sleep.some(s => s.minutes != null) ||
                  data.series.weight.some(w => w.weightKg != null)

  if (!hasData) {
    return (
      <div className="p-4 rounded-xl border bg-gray-50 border-gray-200 text-gray-600 text-sm">
        No Fitbit data available yet. Connect your Fitbit and sync data, or load demo data to see charts.
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="p-4 rounded-xl border bg-white h-72">
        <div className="text-sm text-gray-600 mb-2">Steps per day</div>
        <Line data={toDataset(xs, steps, '#10b981', 'Steps')} options={baseOptions as any} />
      </div>

      <div className="p-4 rounded-xl border bg-white h-72">
        <div className="text-sm text-gray-600 mb-2">Resting heart rate</div>
        <Line data={toDataset(xs, rhr, '#3b82f6', 'Resting HR')} options={baseOptions as any} />
      </div>

      <div className="p-4 rounded-xl border bg-white h-72">
        <div className="text-sm text-gray-600 mb-2">Sleep minutes</div>
        <Line data={toDataset(xs, sleepMin, '#a855f7', 'Sleep (min)')} options={baseOptions as any} />
      </div>

      <div className="p-4 rounded-xl border bg-white h-72">
        <div className="text-sm text-gray-600 mb-2">Weight (kg)</div>
        <Line data={toDataset(xs, weightKg, '#f59e0b', 'Weight')} options={baseOptions as any} />
      </div>
    </div>
  )
}


