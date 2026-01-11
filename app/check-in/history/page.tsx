'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import PageHeader from '@/components/PageHeader'
import { Line } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  TimeScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js'
import type { ChartData, ChartOptions, TooltipItem } from 'chart.js'
import 'chartjs-adapter-date-fns'
import { format } from 'date-fns'

ChartJS.register(
  CategoryScale,
  LinearScale,
  TimeScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
)

export const dynamic = 'force-dynamic'

type Row = { date: string; issueId: string; name: string; polarity: 'positive'|'negative'; value: number | null; note?: string }
type HistoryCache = { rows: Row[]; fetchedAt: number }

export default function CheckinHistoryPage() {
  const router = useRouter()
  const pathname = usePathname()
  const [rows, setRows] = useState<Row[]>([])
  const [allIssues, setAllIssues] = useState<string[]>([])
  const [selectedIssues, setSelectedIssues] = useState<Set<string>>(new Set())
  const [start, setStart] = useState<string>('')
  const [end, setEnd] = useState<string>('')
  const [timePeriod, setTimePeriod] = useState<'daily' | 'weekly' | 'monthly' | 'yearly' | 'all' | 'custom'>('all')
  const [pageSize] = useState(10)
  const [page, setPage] = useState(1)
  const [expandedRow, setExpandedRow] = useState<string | null>(null)
  const [editingEntry, setEditingEntry] = useState<Row | null>(null)
  const [editValue, setEditValue] = useState<number | null>(null)
  const [editNote, setEditNote] = useState<string>('')
  const [loading, setLoading] = useState(false)

  const LABELS = ['Really bad', 'Bad', 'Below average', 'Average', 'Above average', 'Good', 'Excellent'] as const
  const COLOR_PALETTE = [
    'rgb(34, 197, 94)',
    'rgb(59, 130, 246)',
    'rgb(168, 85, 247)',
    'rgb(236, 72, 153)',
    'rgb(251, 146, 60)',
    'rgb(234, 179, 8)',
    'rgb(14, 165, 233)',
  ]

  const HISTORY_CACHE_TTL_MS = 5 * 60_000
  const buildHistoryCacheKey = (startValue: string, endValue: string) =>
    `checkin-history:${startValue || 'all'}:${endValue || 'all'}`
  const readHistoryCache = (key: string): HistoryCache | null => {
    if (typeof window === 'undefined') return null
    try {
      const raw = window.sessionStorage.getItem(key)
      if (!raw) return null
      const parsed = JSON.parse(raw)
      if (!parsed?.rows || !Array.isArray(parsed.rows)) return null
      return parsed
    } catch {
      return null
    }
  }
  const writeHistoryCache = (key: string, history: Row[]) => {
    if (typeof window === 'undefined') return
    try {
      window.sessionStorage.setItem(key, JSON.stringify({ rows: history, fetchedAt: Date.now() }))
    } catch {
      // ignore cache write errors
    }
  }

  const getRatingLabel = (value: number | null) => {
    if (value === null || value === undefined) return 'N/A'
    const clamped = Math.max(0, Math.min(6, value))
    return LABELS[clamped]
  }

  const toRGBA = (color: string, alpha: number) =>
    color.startsWith('rgb(')
      ? color.replace('rgb(', 'rgba(').replace(')', `, ${alpha})`)
      : color

  const load = async (overrides?: { start?: string; end?: string }, options?: { force?: boolean }) => {
    setLoading(true)
    try {
      const startValue = overrides?.start ?? start
      const endValue = overrides?.end ?? end
      const cacheKey = buildHistoryCacheKey(startValue, endValue)
      if (!options?.force) {
        const cached = readHistoryCache(cacheKey)
        if (cached && Date.now() - cached.fetchedAt < HISTORY_CACHE_TTL_MS) {
          const history = cached.rows
          setRows(history)
          const issues = Array.from(new Set(history.map((r: Row) => r.name))).sort() as string[]
          setAllIssues(issues)
          if (selectedIssues.size === 0) {
            setSelectedIssues(new Set(issues))
          }
          return
        }
      }
      const params = new URLSearchParams()
      if (startValue) params.set('start', startValue)
      if (endValue) params.set('end', endValue)
      const res = await fetch(`/api/checkins/history?${params.toString()}`)
      const data = await res.json()
      const history = Array.isArray(data?.history) ? data.history : []
      setRows(history)
      
      // Extract unique issue names
      const issues = Array.from(new Set(history.map((r: Row) => r.name))).sort() as string[]
      setAllIssues(issues)
      if (selectedIssues.size === 0) {
        setSelectedIssues(new Set(issues))
      }
      writeHistoryCache(cacheKey, history)
    } catch (e) {
      console.error('Failed to load history', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])
  useEffect(() => {
    if (timePeriod !== 'custom' && (start || end)) {
      setStart('')
      setEnd('')
      load({ start: '', end: '' })
    }
  }, [timePeriod])

  // Filter rows by selected issues and time period
  const filteredRows = useMemo(() => {
    let filtered = rows
    
    // Filter by selected issues
    if (selectedIssues.size > 0 && selectedIssues.size < allIssues.length) {
      filtered = filtered.filter(r => selectedIssues.has(r.name))
    }
    
    // Filter by time period
    if (timePeriod !== 'all' && timePeriod !== 'custom' && filtered.length > 0) {
      const now = new Date()
      const cutoffDate = new Date()
      
      switch (timePeriod) {
        case 'daily':
          cutoffDate.setDate(now.getDate() - 30) // Last 30 days
          break
        case 'weekly':
          cutoffDate.setDate(now.getDate() - 84) // Last 12 weeks
          break
        case 'monthly':
          cutoffDate.setMonth(now.getMonth() - 12) // Last 12 months
          break
        case 'yearly':
          cutoffDate.setFullYear(now.getFullYear() - 5) // Last 5 years
          break
      }
      
      const cutoffStr = cutoffDate.toISOString().slice(0, 10)
      filtered = filtered.filter(r => r.date >= cutoffStr)
    }
    
    return filtered
  }, [rows, selectedIssues, allIssues.length, timePeriod])

  useEffect(() => {
    setPage(1)
  }, [filteredRows.length, pageSize])

  const handleDelete = async (date: string, issueId: string) => {
    if (!confirm('Delete this rating?')) return
    try {
      const res = await fetch(`/api/checkins/ratings?date=${date}&issueId=${issueId}`, { method: 'DELETE' })
      if (res.ok) {
        await load(undefined, { force: true })
        // setShowDeleteMenu(null) // This state was removed
      } else {
        alert('Failed to delete rating')
      }
    } catch (e) {
      alert('Error deleting rating')
    }
  }

  const handleEdit = (entry: Row) => {
    setEditingEntry(entry)
    setEditValue(entry.value)
    setEditNote(entry.note || '')
    // setShowDeleteMenu(null) // This state was removed
  }

  const handleSaveEdit = async () => {
    if (!editingEntry) return
    try {
      const res = await fetch('/api/checkins/ratings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: editingEntry.date,
          issueId: editingEntry.issueId,
          value: editValue,
          note: editNote
        })
      })
      if (res.ok) {
        await load(undefined, { force: true })
        setEditingEntry(null)
      } else {
        alert('Failed to update rating')
      }
    } catch (e) {
      alert('Error updating rating')
    }
  }

  const handleDeleteSelected = async () => {
    if (selectedIssues.size === 0) return
    const issueIds = filteredRows
      .filter(r => selectedIssues.has(r.name))
      .map(r => r.issueId)
      .filter((v, i, a) => a.indexOf(v) === i)
    
    if (!confirm(`Delete all ratings for ${selectedIssues.size} selected issue(s)?`)) return
    
    try {
      const res = await fetch('/api/checkins/ratings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete-by-issues', issueIds })
      })
      if (res.ok) {
        await load(undefined, { force: true })
        setSelectedIssues(new Set())
      } else {
        alert('Failed to delete ratings')
      }
    } catch (e) {
      alert('Error deleting ratings')
    }
  }

  const handleResetAll = async () => {
    if (!confirm('Delete ALL rating data? This cannot be undone.')) return
    try {
      const res = await fetch('/api/checkins/ratings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete-all' })
      })
      if (res.ok) {
        await load(undefined, { force: true })
        setSelectedIssues(new Set())
      } else {
        alert('Failed to reset data')
      }
    } catch (e) {
      alert('Error resetting data')
    }
  }

  const toggleSelectAll = () => {
    if (selectedIssues.size === allIssues.length) {
      setSelectedIssues(new Set())
    } else {
      setSelectedIssues(new Set(allIssues))
    }
  }

  const toggleIssue = (issue: string) => {
    const newSet = new Set(selectedIssues)
    if (newSet.has(issue)) {
      newSet.delete(issue)
    } else {
      newSet.add(issue)
    }
    setSelectedIssues(newSet)
  }

  // Prepare chart data
  const chartData: ChartData<'line', { x: string; y: number | null }[]> = useMemo(() => {
    if (filteredRows.length === 0) return { labels: [], datasets: [] }

    const allDates = Array.from(new Set(filteredRows.map(r => r.date))).sort()
    const allIssueNames = Array.from(new Set(filteredRows.map(r => r.name))).sort()
    
    const colors = [
      'rgb(34, 197, 94)', // green
      'rgb(59, 130, 246)', // blue
      'rgb(168, 85, 247)', // purple
      'rgb(236, 72, 153)', // pink
      'rgb(251, 146, 60)', // orange
      'rgb(234, 179, 8)', // yellow
      'rgb(14, 165, 233)', // sky
    ]

    const datasets = allIssueNames.map((name, index) => {
      // Create a map of date -> value for this issue
      const valueMap = new Map<string, number | null>()
      filteredRows
        .filter(r => r.name === name)
        .forEach(r => {
          valueMap.set(r.date, r.value)
        })

      // Build data array aligned with allDates
      const data = allDates.map(date => {
        const value = valueMap.get(date)
        return {
          x: date,
          y: value === undefined ? null : value,
        }
      })

      const color = COLOR_PALETTE[index % COLOR_PALETTE.length]

      return {
        label: name,
        data,
        borderColor: color,
        backgroundColor: toRGBA(color, 0.15),
        tension: 0.35,
        fill: true,
        spanGaps: true,
        pointRadius: 3,
        pointHoverRadius: 5,
      }
    })
    
    return {
      labels: allDates,
      datasets
    }
  }, [filteredRows])

  const chartOptions: ChartOptions<'line'> = useMemo(() => {
    // Determine time unit and format based on selected period
    let timeUnit: 'day' | 'week' | 'month' | 'year' = 'day'
    let displayFormat = 'MMM d'
    let maxTicks = 7
    
    switch (timePeriod) {
      case 'daily':
        timeUnit = 'day'
        displayFormat = 'MMM d'
        maxTicks = 10
        break
      case 'weekly':
        timeUnit = 'week'
        displayFormat = 'MMM d'
        maxTicks = 12
        break
      case 'monthly':
        timeUnit = 'month'
        displayFormat = 'MMM yyyy'
        maxTicks = 12
        break
      case 'yearly':
        timeUnit = 'year'
        displayFormat = 'yyyy'
        maxTicks = 5
        break
      case 'all':
        timeUnit = 'day'
        displayFormat = 'MMM d, yyyy'
        maxTicks = 15
        break
    }
    
    return {
      responsive: true,
      maintainAspectRatio: false,
      resizeDelay: 150,
      animation: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            usePointStyle: true,
            padding: 15,
          }
        },
        tooltip: {
          mode: 'index',
          intersect: false,
          title: (items: TooltipItem<'line'>[]) => {
            if (!items?.length) return ''
            const parsedX = items[0].parsed.x
            const dateValue = typeof parsedX === 'string' ? parsedX : Number(parsedX)
            return format(new Date(dateValue), displayFormat === 'MMM d' ? 'MMM d, yyyy' : displayFormat)
          },
          label: (context: TooltipItem<'line'>) => {
            const datasetLabel = context.dataset.label || ''
            const value = context.parsed.y
            if (value === null) return `${datasetLabel}: N/A`
            return `${datasetLabel}: ${value} • ${getRatingLabel(value)}`
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          max: 6,
          ticks: {
            stepSize: 1,
          }
        },
        x: {
          type: 'time',
          time: {
            unit: timeUnit,
            displayFormats: {
              [timeUnit]: displayFormat
            }
          },
          ticks: {
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: maxTicks,
          },
        }
      }
    }
  }, [timePeriod])
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize))
  const pageStart = filteredRows.length === 0 ? 0 : (page - 1) * pageSize + 1
  const pageEnd = Math.min(page * pageSize, filteredRows.length)
  const pagedRows = filteredRows.slice((page - 1) * pageSize, page * pageSize)

  return (
    <div className="min-h-screen min-h-[100svh] bg-gray-50 dark:bg-gray-900 pb-24 overscroll-y-none overflow-x-hidden">
      <PageHeader title="Today's Check-In" backHref="/more" />
      
      {/* Tabs */}
      <div className="max-w-5xl mx-auto px-4 pt-4">
        <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
          <Link
            href="/check-in"
            className={`flex-1 py-2 text-sm font-medium rounded-lg text-center transition-colors ${
              pathname !== '/check-in/history'
                ? 'bg-white dark:bg-slate-700 shadow-sm text-helfi-green'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            Today's Check-in
          </Link>
          <Link
            href="/check-in/history"
            className={`flex-1 py-2 text-sm font-medium rounded-lg text-center transition-colors ${
              pathname === '/check-in/history'
                ? 'bg-white dark:bg-slate-700 shadow-sm text-helfi-green'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            Rating History
          </Link>
        </div>
      </div>
      
      <main className="max-w-5xl mx-auto px-4 pb-24">
        <div className="space-y-8 pt-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-2">Check-in History</h1>
            <p className="text-xs md:text-sm text-gray-500 dark:text-gray-400 mb-4">
              Scale: 0 Really bad · 1 Bad · 2 Below average · 3 Average · 4 Above average · 5 Good · 6 Excellent
            </p>
          </div>

          {timePeriod === 'custom' && (
            <div className="space-y-3 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Start Date</label>
              <input
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2.5 dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-helfi-green focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">End Date</label>
              <input
                type="date"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2.5 dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-helfi-green focus:border-transparent"
              />
            </div>
            <button
              onClick={() => load(undefined, { force: true })}
              disabled={loading}
              className="w-full bg-helfi-green text-white px-4 py-2.5 rounded-lg hover:bg-helfi-green/90 disabled:opacity-60 font-medium transition-colors"
            >
              {loading ? 'Loading...' : 'Apply Filter'}
            </button>
          </div>
          )}

          {/* Filtering Section */}
          {allIssues.length > 0 && (
            <section>
              <div className="flex items-end justify-between mb-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Filter by Health Issue
                </h3>
                <button
                  onClick={toggleSelectAll}
                  className="text-helfi-green text-xs font-semibold"
                >
                  {selectedIssues.size === allIssues.length ? 'Deselect All' : 'Select All'}
                </button>
              </div>
              <div className="flex gap-2 overflow-x-auto scrollbar-none pb-2">
                {allIssues.map(issue => (
                  <button
                    key={issue}
                    onClick={() => toggleIssue(issue)}
                    className={`whitespace-nowrap px-4 py-2 rounded-full text-sm font-medium shadow-sm transition-transform active:scale-95 ${
                      selectedIssues.has(issue)
                        ? 'bg-helfi-green text-white'
                        : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    {issue}
                  </button>
                ))}
              </div>
              {selectedIssues.size > 0 && selectedIssues.size < allIssues.length && (
                <button
                  onClick={handleDeleteSelected}
                  className="mt-3 text-xs text-red-600 hover:underline"
                >
                  Delete Selected ({selectedIssues.size})
                </button>
              )}
            </section>
          )}


          {/* Chart */}
          {filteredRows.length > 0 && chartData.datasets.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Trends Over Time</h2>
                <div className="relative">
                  <select
                    value={timePeriod}
                    onChange={(e) => setTimePeriod(e.target.value as 'daily' | 'weekly' | 'monthly' | 'yearly' | 'all' | 'custom')}
                    className="appearance-none bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg pl-3 pr-8 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-helfi-green focus:border-transparent cursor-pointer"
                  >
                    <option value="daily">30 Days</option>
                    <option value="weekly">12 Weeks</option>
                    <option value="monthly">12 Months</option>
                    <option value="yearly">5 Years</option>
                    <option value="all">All Time</option>
                    <option value="custom">Custom Date</option>
                  </select>
                  <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400">
                    <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.25a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z" clipRule="evenodd" />
                    </svg>
                  </span>
                </div>
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                Ratings are scored 0 (Really bad) to 6 (Excellent). Hover the chart to see exact values.
              </p>

              <div className="h-56 md:h-72">
                <Line data={chartData} options={chartOptions} />
              </div>
              <div className="flex flex-wrap gap-4 mt-4 justify-center">
                {chartData.datasets.map((dataset) => (
                  <div key={dataset.label} className="flex items-center gap-1.5">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: dataset.borderColor as string }}
                      aria-hidden="true"
                    />
                    <span className="text-[10px] text-slate-500 font-medium">{dataset.label}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section>
            <h2 className="text-lg font-bold mb-4 text-gray-900 dark:text-white">Check-in History</h2>
            {filteredRows.length === 0 ? (
              <div className="py-8 text-center text-gray-500 dark:text-gray-400">
                {rows.length === 0 ? 'No ratings yet.' : 'No ratings match your filters.'}
              </div>
            ) : (
              <>
                <div className="grid gap-3 md:grid-cols-2">
                  {pagedRows.map((r, i) => {
                    const label = getRatingLabel(r.value)
                    const color = r.value === null || r.value === undefined ? 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-700 dark:text-gray-400' :
                      r.value <= 1 ? 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400' :
                      r.value <= 3 ? 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400' :
                      'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400'
                    const rowKey = `${r.date}:${r.issueId}`
                  
                    return (
                      <div
                        key={i}
                        className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-100 dark:border-slate-800"
                      >
                        <button
                          type="button"
                          onClick={() => setExpandedRow((current) => (current === rowKey ? null : rowKey))}
                          className="w-full text-left"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase whitespace-nowrap">
                                {r.date}
                              </span>
                              <span className="text-base font-semibold text-gray-900 dark:text-white truncate">
                                {r.name}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className={`px-3 py-1 rounded-full text-xs font-bold border ${color}`}>
                                {label}
                                {r.value !== null && r.value !== undefined && (
                                  <span className="ml-1 opacity-70">({r.value})</span>
                                )}
                              </span>
                              <span
                                className={`text-slate-400 transition-transform ${
                                  expandedRow === rowKey ? 'rotate-180' : ''
                                }`}
                                aria-hidden="true"
                              >
                                <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                                  <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.25a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z" clipRule="evenodd" />
                                </svg>
                              </span>
                            </div>
                          </div>
                        </button>
                        {expandedRow === rowKey && (
                          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between gap-3">
                            <div className="text-xs text-slate-500">
                              {r.note ? `Note: ${r.note}` : 'No notes'}
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleEdit(r)}
                                className="px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleDelete(r.date, r.issueId)}
                                className="px-3 py-1.5 text-xs font-semibold text-red-600 border border-red-200 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
                <div className="flex justify-between items-center mt-6">
                  <p className="text-xs text-slate-500 font-medium">
                    Showing {pageStart}-{pageEnd} of {filteredRows.length}
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page <= 1}
                      className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-semibold disabled:opacity-50"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page >= totalPages}
                      className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-semibold disabled:opacity-50"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </>
            )}
          </section>

          {/* Reset Button */}
          {rows.length > 0 && (
            <footer className="mt-10 text-center">
              <button
                onClick={handleResetAll}
                className="w-full py-4 border-2 border-dashed border-red-200 dark:border-red-900/30 text-red-500 dark:text-red-400 font-bold rounded-2xl hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors"
              >
                Reset All Data
              </button>
              <p className="mt-4 text-[10px] text-slate-400 leading-relaxed max-w-xs mx-auto">
                Resetting your data will permanently delete your check-in history. This action cannot be undone.
              </p>
            </footer>
          )}
        </div>
      </main>

      {/* Edit Modal */}
      {editingEntry && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Edit Rating</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Rating</label>
                <div className="grid grid-cols-4 gap-2">
                  {LABELS.map((label, idx) => (
                    <button
                      key={idx}
                      onClick={() => setEditValue(idx)}
                      className={`px-3 py-2 rounded-lg text-xs border transition-colors ${
                        editValue === idx
                          ? 'bg-helfi-green text-white border-helfi-green'
                          : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:border-helfi-green'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setEditValue(null)}
                  className="mt-2 text-xs text-gray-600 dark:text-gray-400 hover:underline"
                >
                  Mark as N/A
                </button>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Note (optional)</label>
                <textarea
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                  rows={3}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 dark:bg-gray-700 dark:text-white"
                  placeholder="Add a note..."
                />
              </div>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setEditingEntry(null)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEdit}
                  className="px-4 py-2 text-sm font-medium text-white bg-helfi-green rounded-lg hover:bg-helfi-green/90"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
