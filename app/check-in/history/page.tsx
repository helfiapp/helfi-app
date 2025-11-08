'use client'

import React, { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import PageHeader from '@/components/PageHeader'
import { Line } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
)

type Row = { date: string; issueId: string; name: string; polarity: 'positive'|'negative'; value: number | null; note?: string }

export default function CheckinHistoryPage() {
  const router = useRouter()
  const [rows, setRows] = useState<Row[]>([])
  const [allIssues, setAllIssues] = useState<string[]>([])
  const [selectedIssues, setSelectedIssues] = useState<Set<string>>(new Set())
  const [start, setStart] = useState<string>('')
  const [end, setEnd] = useState<string>('')
  const [editingEntry, setEditingEntry] = useState<Row | null>(null)
  const [editValue, setEditValue] = useState<number | null>(null)
  const [editNote, setEditNote] = useState<string>('')
  const [showDeleteMenu, setShowDeleteMenu] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const LABELS = ['Really bad', 'Bad', 'Below average', 'Average', 'Above average', 'Good', 'Excellent'] as const

  const load = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (start) params.set('start', start)
      if (end) params.set('end', end)
      const res = await fetch(`/api/checkins/history?${params.toString()}`)
      const data = await res.json()
      const history = Array.isArray(data?.history) ? data.history : []
      setRows(history)
      
      // Extract unique issue names
      const issues = Array.from(new Set(history.map((r: Row) => r.name))).sort()
      setAllIssues(issues)
      if (selectedIssues.size === 0) {
        setSelectedIssues(new Set(issues))
      }
    } catch (e) {
      console.error('Failed to load history', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const filteredRows = useMemo(() => {
    if (selectedIssues.size === 0 || selectedIssues.size === allIssues.length) {
      return rows
    }
    return rows.filter(r => selectedIssues.has(r.name))
  }, [rows, selectedIssues, allIssues.length])

  const handleDelete = async (date: string, issueId: string) => {
    if (!confirm('Delete this rating?')) return
    try {
      const res = await fetch(`/api/checkins/ratings?date=${date}&issueId=${issueId}`, { method: 'DELETE' })
      if (res.ok) {
        await load()
        setShowDeleteMenu(null)
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
    setShowDeleteMenu(null)
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
        await load()
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
        await load()
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
        await load()
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
  const chartData = useMemo(() => {
    const issueData: Record<string, { dates: string[], values: (number | null)[] }> = {}
    
    filteredRows.forEach(row => {
      if (!issueData[row.name]) {
        issueData[row.name] = { dates: [], values: [] }
      }
      issueData[row.name].dates.push(row.date)
      issueData[row.name].values.push(row.value)
    })

    const datasets = Object.entries(issueData).map(([name, data], index) => {
      const colors = [
        'rgb(34, 197, 94)', // green
        'rgb(59, 130, 246)', // blue
        'rgb(168, 85, 247)', // purple
        'rgb(236, 72, 153)', // pink
        'rgb(251, 146, 60)', // orange
        'rgb(234, 179, 8)', // yellow
        'rgb(14, 165, 233)', // sky
      ]
      return {
        label: name,
        data: data.values,
        borderColor: colors[index % colors.length],
        backgroundColor: colors[index % colors.length] + '20',
        tension: 0.4,
        fill: true,
      }
    })

    const allDates = Array.from(new Set(filteredRows.map(r => r.date))).sort()
    
    return {
      labels: allDates,
      datasets
    }
  }, [filteredRows])

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-24">
      <PageHeader title="Daily Health Ratings" backHref="/check-in" />
      
      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-6">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Check-in History</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
              Scale: 0 Really bad · 1 Bad · 2 Below average · 3 Average · 4 Above average · 5 Good · 6 Excellent
            </p>
          </div>

          {/* Date Picker - Vertical Layout */}
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
              onClick={load}
              disabled={loading}
              className="w-full bg-helfi-green text-white px-4 py-2.5 rounded-lg hover:bg-helfi-green/90 disabled:opacity-60 font-medium transition-colors"
            >
              {loading ? 'Loading...' : 'Apply Filter'}
            </button>
          </div>

          {/* Filtering Section */}
          {allIssues.length > 0 && (
            <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Filter by Health Issue</h3>
                <button
                  onClick={toggleSelectAll}
                  className="text-sm text-helfi-green hover:underline"
                >
                  {selectedIssues.size === allIssues.length ? 'Deselect All' : 'Select All'}
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {allIssues.map(issue => (
                  <button
                    key={issue}
                    onClick={() => toggleIssue(issue)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                      selectedIssues.has(issue)
                        ? 'bg-helfi-green text-white'
                        : 'bg-white dark:bg-gray-600 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-500'
                    }`}
                  >
                    {issue}
                  </button>
                ))}
              </div>
              {selectedIssues.size > 0 && selectedIssues.size < allIssues.length && (
                <button
                  onClick={handleDeleteSelected}
                  className="mt-3 text-sm text-red-600 hover:underline"
                >
                  Delete Selected ({selectedIssues.size})
                </button>
              )}
            </div>
          )}

          {/* Reset Button */}
          {rows.length > 0 && (
            <div className="mb-6 flex justify-end">
              <button
                onClick={handleResetAll}
                className="px-4 py-2 text-sm font-medium text-red-600 hover:text-red-700 border border-red-300 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              >
                Reset All Data
              </button>
            </div>
          )}

          {/* Chart */}
          {filteredRows.length > 0 && chartData.datasets.length > 0 && (
            <div className="mb-6 p-4 bg-white dark:bg-gray-700/30 rounded-lg">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Trends Over Time</h3>
              <div className="h-64">
                <Line
                  data={chartData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
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
                      }
                    },
                    scales: {
                      y: {
                        beginAtZero: true,
                        max: 6,
                        ticks: {
                          stepSize: 1,
                        }
                      }
                    }
                  }}
                />
              </div>
            </div>
          )}

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left border-b border-gray-200 dark:border-gray-700">
                  <th className="py-3 pr-4 font-semibold text-gray-900 dark:text-white">Date</th>
                  <th className="py-3 pr-4 font-semibold text-gray-900 dark:text-white">Issue</th>
                  <th className="py-3 pr-4 font-semibold text-gray-900 dark:text-white">Rating</th>
                  <th className="py-3 pr-4 font-semibold text-gray-900 dark:text-white">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((r, i) => {
                  const label = (r.value === null || r.value === undefined) ? 'N/A' : LABELS[Math.max(0, Math.min(6, r.value))]
                  const color = r.value === null || r.value === undefined ? 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-700 dark:text-gray-400' :
                    r.value <= 1 ? 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400' :
                    r.value <= 3 ? 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400' :
                    'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400'
                  
                  return (
                    <tr key={i} className="border-b border-gray-100 dark:border-gray-700 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="py-3 pr-4 whitespace-nowrap text-gray-900 dark:text-gray-100">{r.date}</td>
                      <td className="py-3 pr-4 text-gray-900 dark:text-gray-100">{r.name}</td>
                      <td className="py-3 pr-4">
                        <span className={`inline-flex items-center gap-2 px-2 py-1 rounded-lg text-xs border ${color}`}>
                          <span>{label}</span>
                          {r.value !== null && r.value !== undefined && (
                            <span className="text-[10px] opacity-70">({r.value})</span>
                          )}
                        </span>
                      </td>
                      <td className="py-3 pr-4">
                        <div className="relative">
                          <button
                            onClick={() => setShowDeleteMenu(showDeleteMenu === `${r.date}-${r.issueId}` ? null : `${r.date}-${r.issueId}`)}
                            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                          >
                            <svg className="w-5 h-5 text-gray-600 dark:text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                            </svg>
                          </button>
                          {showDeleteMenu === `${r.date}-${r.issueId}` && (
                            <div className="absolute right-0 mt-1 w-32 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-10">
                              <button
                                onClick={() => handleEdit(r)}
                                className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-t-lg"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleDelete(r.date, r.issueId)}
                                className="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-b-lg"
                              >
                                Delete
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {filteredRows.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-gray-500 dark:text-gray-400">
                      {rows.length === 0 ? 'No ratings yet.' : 'No ratings match your filters.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
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
