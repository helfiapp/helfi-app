'use client'

import React, { useMemo } from 'react'
import { Pie } from 'react-chartjs-2'
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js'
import type { ChartData, ChartOptions } from 'chart.js'
import { emojiForMoodValue, moodColorForValue, MOOD_FACE_OPTIONS } from '@/components/mood/moodScale'

ChartJS.register(ArcElement, Tooltip, Legend)

type MoodEntry = { mood: number }

export default function MoodPieChart({ entries }: { entries: MoodEntry[] }) {
  const slices = useMemo(() => {
    const counts = new Map<number, number>()
    for (const entry of entries) {
      const value = Number(entry.mood)
      if (!Number.isFinite(value)) continue
      counts.set(value, (counts.get(value) || 0) + 1)
    }
    return MOOD_FACE_OPTIONS
      .map((opt) => ({ value: opt.value, label: opt.label, count: counts.get(opt.value) || 0 }))
      .filter((slice) => slice.count > 0)
  }, [entries])

  const emojiPlugin = useMemo(() => ({
    id: 'emojiLabels',
    afterDatasetsDraw: (chart: any) => {
      const meta = chart.getDatasetMeta(0)
      if (!meta?.data?.length) return
      const { ctx } = chart
      const fontSize = 32
      ctx.save()
      ctx.font = `${fontSize}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      meta.data.forEach((arc: any, index: number) => {
        const slice = slices[index]
        if (!slice) return
        const center = arc.getCenterPoint()
        ctx.fillText(emojiForMoodValue(slice.value), center.x, center.y)
      })
      ctx.restore()
    },
  }), [slices])

  const data: ChartData<'pie', number[], string> = useMemo(() => {
    return {
      labels: slices.map((slice) => slice.label),
      datasets: [
        {
          data: slices.map((slice) => slice.count),
          backgroundColor: slices.map((slice) => moodColorForValue(slice.value)),
          borderWidth: 0,
        },
      ],
    }
  }, [slices])

  const options: ChartOptions<'pie'> = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const value = slices[ctx.dataIndex]?.value
            const label = slices[ctx.dataIndex]?.label || 'Mood'
            const count = ctx.parsed || 0
            const emoji = value ? emojiForMoodValue(value) : '🙂'
            return `${emoji} ${label}: ${count}`
          },
        },
      },
    },
  }), [slices])

  if (!slices.length) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-gray-500 dark:text-gray-400">
        No mood entries yet.
      </div>
    )
  }

  return (
    <div className="h-48 w-full">
      <Pie data={data} options={options} plugins={[emojiPlugin]} />
    </div>
  )
}
