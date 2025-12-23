'use client'

import React, { useMemo } from 'react'
import { Pie } from 'react-chartjs-2'
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js'
import type { ChartData, ChartOptions } from 'chart.js'
import { emojiForMoodValue, moodColorForValue, MOOD_FACE_OPTIONS } from '@/components/mood/moodScale'

ChartJS.register(ArcElement, Tooltip, Legend)

type MoodEntry = {
  mood: number
  timestamp?: string | null
}

export default function MoodPieChart({ entries }: { entries: MoodEntry[] }) {
  const { slices, timeMap } = useMemo(() => {
    const counts = new Map<number, number>()
    const times = new Map<number, string[]>()

    for (const entry of entries) {
      const value = Number(entry.mood)
      if (!Number.isFinite(value)) continue
      counts.set(value, (counts.get(value) || 0) + 1)

      if (entry.timestamp) {
        const d = new Date(entry.timestamp)
        if (!Number.isNaN(d.getTime())) {
          const label = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
          const list = times.get(value) ?? []
          list.push(label)
          times.set(value, list)
        }
      }
    }

    const result = MOOD_FACE_OPTIONS
      .map((opt) => ({ value: opt.value, label: opt.label, count: counts.get(opt.value) || 0 }))
      .filter((slice) => slice.count > 0)

    return { slices: result, timeMap: times }
  }, [entries])

  const emojiSize = useMemo(() => {
    const totalEntries = slices.reduce((sum, slice) => sum + slice.count, 0)
    const weight = Math.max(slices.length, Math.ceil(totalEntries / 2))
    const size = 72 - weight * 8
    return Math.max(22, Math.min(64, size))
  }, [slices])

  const emojiPlugin = useMemo(() => ({
    id: 'emojiLabels',
    afterDatasetsDraw: (chart: any) => {
      const meta = chart.getDatasetMeta(0)
      if (!meta?.data?.length) return
      const { ctx } = chart
      const fontSize = emojiSize
      ctx.save()
      ctx.font = `${fontSize}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      if (slices.length === 1) {
        const { left, right, top, bottom } = chart.chartArea
        const centerX = (left + right) / 2
        const centerY = (top + bottom) / 2
        ctx.fillText(emojiForMoodValue(slices[0].value), centerX, centerY)
      } else {
        meta.data.forEach((arc: any, index: number) => {
          const slice = slices[index]
          if (!slice) return
          const center = arc.getCenterPoint()
          ctx.fillText(emojiForMoodValue(slice.value), center.x, center.y)
        })
      }
      ctx.restore()
    },
  }), [slices, emojiSize])

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
        padding: 12,
        bodySpacing: 6,
        boxPadding: 6,
        caretPadding: 6,
        caretSize: 8,
        cornerRadius: 12,
        titleFont: { size: 16, weight: 600 },
        bodyFont: { size: 14, weight: 500 },
        boxWidth: 14,
        boxHeight: 14,
        callbacks: {
          title: (items) => slices[items[0]?.dataIndex ?? 0]?.label || 'Mood',
          label: (ctx) => {
            const label = slices[ctx.dataIndex]?.label || 'Mood'
            const count = ctx.parsed || 0
            return `${label}: ${count}`
          },
          afterLabel: (ctx) => {
            const value = slices[ctx.dataIndex]?.value
            if (!value) return ''
            const times = timeMap.get(value) ?? []
            if (!times.length) return ''
            const maxItems = 4
            const shown = times.slice(0, maxItems)
            const suffix = times.length > maxItems ? ` +${times.length - maxItems} more` : ''
            const prefix = times.length > 1 ? 'Times' : 'Time'
            return `${prefix}: ${shown.join(', ')}${suffix}`
          },
        },
      },
    },
  }), [slices, timeMap])

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
