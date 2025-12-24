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
    events: ['click'],
    plugins: {
      legend: { display: false },
      tooltip: {
        enabled: false,
        external: (context) => {
          const { chart, tooltip } = context
          const parent = chart.canvas.parentNode as HTMLElement | null
          if (!parent) return

          let tooltipEl = parent.querySelector<HTMLDivElement>('#mood-pie-tooltip')
          if (!tooltipEl) {
            tooltipEl = document.createElement('div')
            tooltipEl.id = 'mood-pie-tooltip'
            tooltipEl.style.position = 'absolute'
            tooltipEl.style.pointerEvents = 'none'
            tooltipEl.style.opacity = '0'
            tooltipEl.style.transform = 'translate(-50%, -110%)'
            tooltipEl.style.transition = 'opacity 0.1s ease'
            tooltipEl.style.background = 'rgba(17, 24, 39, 0.9)'
            tooltipEl.style.borderRadius = '12px'
            tooltipEl.style.padding = '12px 14px'
            tooltipEl.style.color = '#fff'
            tooltipEl.style.textAlign = 'center'
            tooltipEl.style.fontFamily = 'inherit'
            tooltipEl.style.minWidth = '140px'
            tooltipEl.style.maxWidth = '220px'
            tooltipEl.style.boxShadow = '0 8px 20px rgba(0,0,0,0.2)'
            parent.appendChild(tooltipEl)
          }

          if (tooltip.opacity === 0) {
            tooltipEl.style.opacity = '0'
            return
          }

          const dataIndex = tooltip.dataPoints?.[0]?.dataIndex ?? 0
          const slice = slices[dataIndex]
          const label = slice?.label || 'Mood'
          const count = slice?.count ?? 0
          const color = slice ? moodColorForValue(slice.value) : '#bbf7d0'
          const times = slice ? (timeMap.get(slice.value) ?? []) : []
          const maxItems = 4
          const shown = times.slice(0, maxItems)
          const suffix = times.length > maxItems ? ` +${times.length - maxItems} more` : ''
          const timeLabel = times.length
            ? `${times.length > 1 ? 'Times' : 'Time'}: ${shown.join(', ')}${suffix}`
            : 'Time: —'

          tooltipEl.innerHTML = ''

          const titleEl = document.createElement('div')
          titleEl.style.fontSize = '16px'
          titleEl.style.fontWeight = '600'
          titleEl.style.marginBottom = '6px'
          titleEl.textContent = label

          const lineEl = document.createElement('div')
          lineEl.style.display = 'flex'
          lineEl.style.alignItems = 'center'
          lineEl.style.justifyContent = 'center'
          lineEl.style.gap = '8px'
          lineEl.style.fontSize = '14px'
          lineEl.style.fontWeight = '500'
          lineEl.style.marginBottom = '4px'
          lineEl.style.width = '100%'

          const swatch = document.createElement('span')
          swatch.style.width = '12px'
          swatch.style.height = '12px'
          swatch.style.borderRadius = '3px'
          swatch.style.background = color
          swatch.style.display = 'inline-block'

          const text = document.createElement('span')
          text.textContent = `${label}: ${count}`

          lineEl.appendChild(swatch)
          lineEl.appendChild(text)

          const timeEl = document.createElement('div')
          timeEl.style.fontSize = '14px'
          timeEl.style.fontWeight = '500'
          timeEl.style.textAlign = 'center'
          timeEl.style.width = '100%'
          timeEl.textContent = timeLabel

          tooltipEl.appendChild(titleEl)
          tooltipEl.appendChild(lineEl)
          tooltipEl.appendChild(timeEl)

          const { offsetLeft, offsetTop } = chart.canvas
          tooltipEl.style.left = `${offsetLeft + tooltip.caretX}px`
          tooltipEl.style.top = `${offsetTop + tooltip.caretY}px`
          const aboveTop = tooltip.caretY - tooltipEl.offsetHeight - 12
          tooltipEl.style.transform = aboveTop < 0 ? 'translate(-50%, 12px)' : 'translate(-50%, -110%)'
          tooltipEl.style.opacity = '1'
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
    <div className="relative h-48 w-full">
      <Pie data={data} options={options} plugins={[emojiPlugin]} />
    </div>
  )
}
