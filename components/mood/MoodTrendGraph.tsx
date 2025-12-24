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
import type { ChartData, ChartOptions } from 'chart.js'
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

export type MoodPoint = { timestamp: string; mood: number | null; label?: string }

export default function MoodTrendGraph({
  points,
  showTimeAxis = false,
}: {
  points: MoodPoint[]
  showTimeAxis?: boolean
}) {
  const chartPoints = useMemo(() => {
    if (points.length !== 1) {
      return points.map((p, index) => ({ x: p.timestamp, y: p.mood, sourceIndex: index }))
    }

    const base = points[0]
    if (!Number.isFinite(Number(base?.mood))) {
      return []
    }
    const baseDate = new Date(base.timestamp)
    if (Number.isNaN(baseDate.getTime())) {
      return [{ x: new Date().toISOString(), y: base.mood }]
    }

    const start = new Date(baseDate)
    start.setHours(0, 0, 0, 0)
    const end = new Date(baseDate)
    end.setHours(23, 59, 59, 999)

    return [
      { x: start.toISOString(), y: base.mood, synthetic: true, sourceIndex: -1 },
      { x: baseDate.toISOString(), y: base.mood, sourceIndex: 0 },
      { x: end.toISOString(), y: base.mood, synthetic: true, sourceIndex: -1 },
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

  const formatTime = (ts: string) => {
    try {
      const d = new Date(ts)
      if (Number.isNaN(d.getTime())) return ''
      return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    } catch {
      return ''
    }
  }

  const formatDay = (ts: string) => {
    try {
      const d = new Date(ts)
      if (Number.isNaN(d.getTime())) return ''
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    } catch {
      return ''
    }
  }

  const data: ChartData<'line', { x: string; y: number | null }[]> = useMemo(() => {
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
          pointHitRadius: (ctx) => ((ctx.raw as any)?.synthetic ? 0 : 18),
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
        enabled: false,
        external: (context) => {
          const { chart, tooltip } = context
          const parent = chart.canvas.parentNode as HTMLElement | null
          if (!parent) return

          let tooltipEl = parent.querySelector<HTMLDivElement>('#mood-line-tooltip')
          if (!tooltipEl) {
            tooltipEl = document.createElement('div')
            tooltipEl.id = 'mood-line-tooltip'
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
          const raw = (chart.data.datasets?.[0]?.data as any[])?.[dataIndex]
          const sourceIndex = typeof raw?.sourceIndex === 'number' ? raw.sourceIndex : dataIndex
          const point = sourceIndex >= 0 ? points[sourceIndex] : null
          const moodValue = Number(point?.mood ?? tooltip.dataPoints?.[0]?.parsed?.y)
          if (!Number.isFinite(moodValue)) {
            tooltipEl.style.opacity = '0'
            return
          }

          const moodLabel = MOOD_LEVELS.find((m) => m.value === moodValue)?.label ?? `Mood ${moodValue}`
          const detail = showTimeAxis
            ? `Time: ${formatTime(point?.timestamp || '') || '—'}`
            : point?.label
              ? point.label
              : `Day: ${formatDay(point?.timestamp || '') || '—'}`

          tooltipEl.innerHTML = ''

          const titleEl = document.createElement('div')
          titleEl.style.fontSize = '16px'
          titleEl.style.fontWeight = '600'
          titleEl.style.marginBottom = '6px'
          titleEl.style.textAlign = 'center'
          titleEl.textContent = moodLabel

          const detailEl = document.createElement('div')
          detailEl.style.fontSize = '14px'
          detailEl.style.fontWeight = '500'
          detailEl.style.textAlign = 'center'
          detailEl.style.width = '100%'
          detailEl.textContent = detail

          tooltipEl.appendChild(titleEl)
          tooltipEl.appendChild(detailEl)

          const { offsetLeft, offsetTop } = chart.canvas
          tooltipEl.style.left = `${offsetLeft + tooltip.caretX}px`
          tooltipEl.style.top = `${offsetTop + tooltip.caretY}px`
          const aboveTop = tooltip.caretY - tooltipEl.offsetHeight - 12
          tooltipEl.style.transform = aboveTop < 0 ? 'translate(-50%, 12px)' : 'translate(-50%, -110%)'
          tooltipEl.style.opacity = '1'
        },
      },
    },
    interaction: { mode: 'nearest', intersect: true },
    onClick: (event, elements, chart) => {
      if (!elements?.length) return
      const first = elements[0] as any
      chart.setActiveElements([{ datasetIndex: first.datasetIndex, index: first.index }])
      chart.update()
    },
    scales: {
      x: {
        type: 'time',
        time: {
          unit: showTimeAxis ? 'hour' : 'day',
          displayFormats: { hour: 'h a', day: 'MMM d' },
        },
        grid: { display: false },
        ticks: {
          maxRotation: 0,
          autoSkip: true,
          maxTicksLimit: showTimeAxis ? 6 : 7,
        },
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
