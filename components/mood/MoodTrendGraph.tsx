'use client'

import React, { useMemo } from 'react'
import { Line } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  TimeScale,
  PointElement,
  LineElement,
  Tooltip,
  Filler,
} from 'chart.js'
import type { ChartData, ChartOptions, TooltipItem } from 'chart.js'
import 'chartjs-adapter-date-fns'
import { MOOD_LEVELS, emojiForMoodValue } from '@/components/mood/moodScale'

ChartJS.register(
  CategoryScale,
  LinearScale,
  TimeScale,
  PointElement,
  LineElement,
  Tooltip,
  Filler,
)

export type MoodPoint = { timestamp: string; mood: number }

export default function MoodTrendGraph({ points }: { points: MoodPoint[] }) {
  const chartPoints = useMemo(() => {
    if (points.length !== 1) {
      return points.map((p) => ({ x: p.timestamp, y: p.mood }))
    }

    const base = points[0]
    const baseDate = new Date(base.timestamp)
    if (Number.isNaN(baseDate.getTime())) {
      return [{ x: new Date().toISOString(), y: base.mood }]
    }

    const start = new Date(baseDate)
    start.setHours(0, 0, 0, 0)
    const end = new Date(baseDate)
    end.setHours(23, 59, 59, 999)

    return [
      { x: start.toISOString(), y: base.mood, synthetic: true },
      { x: baseDate.toISOString(), y: base.mood },
      { x: end.toISOString(), y: base.mood, synthetic: true },
    ]
  }, [points])

  const emojiPlugin = useMemo(() => ({
    id: 'emojiPoints',
    afterDatasetsDraw: (chart: any) => {
      const meta = chart.getDatasetMeta(0)
      if (!meta?.data?.length) return
      const dataset = chart.data.datasets?.[0]
      if (!dataset) return
      const { ctx, chartArea } = chart
      const fontSize = 28
      ctx.save()
      ctx.font = `${fontSize}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      meta.data.forEach((point: any, index: number) => {
        const raw = (dataset.data as any[])?.[index]
        if (raw?.synthetic) return
        const moodValue = Number(raw?.y)
        if (!Number.isFinite(moodValue)) return
        const emoji = emojiForMoodValue(moodValue)
        const y = Math.max(point.y - (fontSize * 0.9), chartArea.top + fontSize * 0.6)
        ctx.fillText(emoji, point.x, y)
      })
      ctx.restore()
    },
  }), [])

  const data: ChartData<'line', { x: string; y: number }[]> = useMemo(() => {
    return {
      labels: [],
      datasets: [
        {
          label: 'Mood',
          data: chartPoints,
          borderColor: 'rgb(34, 197, 94)',
          backgroundColor: 'rgba(34, 197, 94, 0.12)',
          tension: 0.35,
          fill: true,
          pointRadius: (ctx) => ((ctx.raw as any)?.synthetic ? 0 : 3),
          pointHoverRadius: (ctx) => ((ctx.raw as any)?.synthetic ? 0 : 5),
          pointBackgroundColor: 'rgb(34, 197, 94)',
        },
      ],
    }
  }, [chartPoints])

  const options: ChartOptions<'line'> = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    events: ['click'],
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx: TooltipItem<'line'>) => {
            const v = Number(ctx.parsed.y)
            const label = MOOD_LEVELS.find((m) => m.value === v)?.label ?? `Mood ${v}`
            return label
          },
        },
      },
    },
    scales: {
      x: {
        type: 'time',
        time: { unit: 'day' },
        grid: { display: false },
        ticks: { maxRotation: 0, autoSkip: true },
      },
      y: {
        min: 1,
        max: 7,
        ticks: {
          stepSize: 1,
          callback: (v) => String(v),
        },
        grid: { color: 'rgba(148, 163, 184, 0.18)' },
      },
    },
  }), [])

  return (
    <div className="h-48 w-full">
      <Line data={data as any} options={options as any} plugins={[emojiPlugin]} />
    </div>
  )
}
