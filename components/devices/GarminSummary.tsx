'use client'

import React, { useEffect, useMemo, useState } from 'react'

type SeriesResponse = {
  success: boolean
  range: { start: string; end: string }
  series: {
    steps: Array<{ date: string; steps?: number; calories?: number; distanceKm?: number }>
    heartrate: Array<{ date: string; restingHeartRate?: number }>
    sleep: Array<{ date: string; minutes?: number }>
    weight: Array<{ date: string; weightKg?: number }>
  }
}

export default function GarminSummary({ rangeDays = 7 }: { rangeDays?: number }) {
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
        const res = await fetch(`/api/garmin/data?start=${startStr}&end=${endStr}`)
        if (!res.ok) throw new Error('Failed to load Garmin data')
        const json = (await res.json()) as SeriesResponse
        setData(json)
      } catch (e: any) {
        setError(e?.message || 'Failed to load data')
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [rangeDays])

  const today = useMemo(() => {
    if (!data) return null
    const lastIdx = data.series.steps.length - 1
    return {
      steps: data.series.steps[lastIdx]?.steps,
      calories: data.series.steps[lastIdx]?.calories,
      distanceKm: data.series.steps[lastIdx]?.distanceKm,
      rhr: data.series.heartrate[data.series.heartrate.length - 1]?.restingHeartRate,
      sleepMin: data.series.sleep[data.series.sleep.length - 1]?.minutes,
      weightKg: data.series.weight[data.series.weight.length - 1]?.weightKg,
    }
  }, [data])

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl border bg-white">
          <div className="animate-pulse h-6 w-24 bg-gray-200 rounded mb-2" />
          <div className="animate-pulse h-8 w-32 bg-gray-200 rounded" />
        </div>
        <div className="p-4 rounded-xl border bg-white">
          <div className="animate-pulse h-6 w-24 bg-gray-200 rounded mb-2" />
          <div className="animate-pulse h-8 w-32 bg-gray-200 rounded" />
        </div>
        <div className="p-4 rounded-xl border bg-white">
          <div className="animate-pulse h-6 w-24 bg-gray-200 rounded mb-2" />
          <div className="animate-pulse h-8 w-32 bg-gray-200 rounded" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 rounded-xl border bg-red-50 border-red-200 text-red-700 text-sm">
        {error}
      </div>
    )
  }

  if (!data) return null

  const hasData =
    data.series.steps.some((s) => s.steps != null) ||
    data.series.heartrate.some((h) => h.restingHeartRate != null) ||
    data.series.sleep.some((s) => s.minutes != null) ||
    data.series.weight.some((w) => w.weightKg != null)

  if (!hasData) {
    return (
      <div className="p-4 rounded-xl border bg-gray-50 border-gray-200 text-gray-600 text-sm">
        No Garmin data has arrived yet. Open the Garmin Connect app on the phone and sync the watch, then refresh.
      </div>
    )
  }

  const km = today?.distanceKm != null ? today.distanceKm.toFixed(2) : '—'
  const steps = today?.steps != null ? today.steps.toLocaleString() : '—'
  const rhr = today?.rhr != null ? `${today.rhr} bpm` : '—'
  const sleepHrs = today?.sleepMin != null ? (today.sleepMin / 60).toFixed(1) + ' h' : '—'
  const weight = today?.weightKg != null ? `${today.weightKg.toFixed(1)} kg` : '—'

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <div className="p-4 rounded-xl border bg-white">
        <div className="text-sm text-gray-500">Steps Today</div>
        <div className="text-2xl font-semibold mt-1">{steps}</div>
        <div className="text-xs text-gray-500 mt-1">Distance: {km}</div>
      </div>
      <div className="p-4 rounded-xl border bg-white">
        <div className="text-sm text-gray-500">Resting Heart Rate</div>
        <div className="text-2xl font-semibold mt-1">{rhr}</div>
      </div>
      <div className="p-4 rounded-xl border bg-white">
        <div className="text-sm text-gray-500">Sleep (last night)</div>
        <div className="text-2xl font-semibold mt-1">{sleepHrs}</div>
      </div>
      <div className="p-4 rounded-xl border bg-white">
        <div className="text-sm text-gray-500">Weight (latest)</div>
        <div className="text-2xl font-semibold mt-1">{weight}</div>
      </div>
    </div>
  )
}

