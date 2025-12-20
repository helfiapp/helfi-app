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
import { MOOD_LEVELS } from '@/components/mood/moodScale'

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
  const data: ChartData<'line', { x: string; y: number }[]> = useMemo(() => {
    return {
      labels: [],
      datasets: [
        {
          label: 'Mood',
          data: points.map((p) => ({ x: p.timestamp, y: p.mood })),
          borderColor: 'rgb(34, 197, 94)',
          backgroundColor: 'rgba(34, 197, 94, 0.12)',
          tension: 0.35,
          fill: true,
          pointRadius: 3,
          pointHoverRadius: 5,
          pointBackgroundColor: 'rgb(34, 197, 94)',
        },
      ],
    }
  }, [points])

  const options: ChartOptions<'line'> = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
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
      <Line data={data as any} options={options as any} />
    </div>
  )
}

