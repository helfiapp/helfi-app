'use client'

import { useEffect, useMemo, useState } from 'react'
import PageHeader from '@/components/PageHeader'

export const dynamic = 'force-dynamic'

type JournalEntry = {
  id: string
  content: string
  localDate: string
  createdAt: string
  updatedAt: string
}

function buildTodayIso() {
  const now = new Date()
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function formatShortDayLabel(iso: string) {
  try {
    const [y, m, d] = iso.split('-').map((v) => parseInt(v, 10))
    const local = new Date(y, (m || 1) - 1, d || 1)
    return local.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  } catch {
    return iso
  }
}

function formatTimeLabel(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function HealthJournalPage() {
  const todayIso = buildTodayIso()
  const [activeTab, setActiveTab] = useState<'entry' | 'history'>('entry')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [selectedDate, setSelectedDate] = useState<string>(todayIso)
  const [showDateSheet, setShowDateSheet] = useState(false)
  const [dateSheetMonth, setDateSheetMonth] = useState<string>(() => (selectedDate || todayIso).slice(0, 7))
  const [historyEntries, setHistoryEntries] = useState<JournalEntry[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [monthDates, setMonthDates] = useState<string[]>([])

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingText, setEditingText] = useState('')
  const [editingSaving, setEditingSaving] = useState(false)

  const isViewingToday = selectedDate === todayIso
  const mobileDateLabel = isViewingToday ? 'Today' : formatShortDayLabel(selectedDate)
  const desktopDateLabel = isViewingToday ? 'Today' : formatShortDayLabel(selectedDate)

  const shiftSelectedDateByDays = (deltaDays: number) => {
    try {
      const [y, m, d] = selectedDate.split('-').map((v) => parseInt(v, 10))
      const base = new Date(y, (m || 1) - 1, d || 1, 12, 0, 0, 0)
      base.setDate(base.getDate() + deltaDays)
      const yy = base.getFullYear()
      const mm = String(base.getMonth() + 1).padStart(2, '0')
      const dd = String(base.getDate()).padStart(2, '0')
      setSelectedDate(`${yy}-${mm}-${dd}`)
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    if (showDateSheet) {
      setDateSheetMonth((selectedDate || todayIso).slice(0, 7))
    }
  }, [showDateSheet, selectedDate, todayIso])

  const monthMeta = useMemo(() => {
    const [yy, mm] = (dateSheetMonth || '').split('-').map((v) => parseInt(v, 10))
    const safeY = Number.isFinite(yy) ? yy : new Date().getFullYear()
    const safeM = Number.isFinite(mm) ? mm : new Date().getMonth() + 1
    const first = new Date(safeY, Math.max(0, safeM - 1), 1)
    const daysInMonth = new Date(safeY, Math.max(0, safeM - 1) + 1, 0).getDate()
    const startDow = first.getDay()
    const label = first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    return { year: safeY, month: safeM, daysInMonth, startDow, label }
  }, [dateSheetMonth])

  const shiftDateSheetMonth = (delta: number) => {
    const y = monthMeta.year
    const m = monthMeta.month
    const next = new Date(y, (m - 1) + delta, 1)
    const yy = next.getFullYear()
    const mm = String(next.getMonth() + 1).padStart(2, '0')
    setDateSheetMonth(`${yy}-${mm}`)
  }

  const selectCalendarDay = (dayNum: number) => {
    const yy = monthMeta.year
    const mm = String(monthMeta.month).padStart(2, '0')
    const dd = String(dayNum).padStart(2, '0')
    setSelectedDate(`${yy}-${mm}-${dd}`)
    setShowDateSheet(false)
  }

  const entryDatesInVisibleMonth = useMemo(() => new Set(monthDates), [monthDates])

  const loadMonthDates = async (monthKey: string) => {
    try {
      const res = await fetch(`/api/health-journal?month=${encodeURIComponent(monthKey)}`, { cache: 'no-store' as any })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) return
      const dates = Array.isArray(data?.dates) ? data.dates.filter((d: any) => typeof d === 'string') : []
      setMonthDates(dates)
    } catch {
      // ignore
    }
  }

  const loadHistory = async (dateKey: string) => {
    setHistoryLoading(true)
    setHistoryError(null)
    try {
      const res = await fetch(`/api/health-journal?date=${encodeURIComponent(dateKey)}`, { cache: 'no-store' as any })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data?.error || 'Could not load notes')
      }
      const entries = Array.isArray(data?.entries) ? data.entries : []
      setHistoryEntries(entries)
    } catch (err: any) {
      setHistoryError(err?.message || 'Could not load notes')
      setHistoryEntries([])
    } finally {
      setHistoryLoading(false)
    }
  }

  const refreshHistory = async () => {
    if (activeTab !== 'history') return
    await loadHistory(selectedDate)
    await loadMonthDates(dateSheetMonth)
  }

  useEffect(() => {
    if (activeTab !== 'history') return
    loadHistory(selectedDate)
  }, [activeTab, selectedDate])

  useEffect(() => {
    if (activeTab !== 'history') return
    loadMonthDates(dateSheetMonth)
  }, [activeTab, dateSheetMonth])

  const handleSubmit = async () => {
    if (!note.trim()) {
      setError('Please write a short note first.')
      return
    }
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      const res = await fetch('/api/health-journal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: note, localDate: buildTodayIso() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data?.error || 'Could not save note')
      }
      setNote('')
      setNotice('Saved. This will be used in your next health report.')
      if (activeTab === 'history' && selectedDate === todayIso) {
        loadHistory(selectedDate)
        loadMonthDates(dateSheetMonth)
      }
    } catch (err: any) {
      setError(err?.message || 'Could not save note')
    } finally {
      setSaving(false)
    }
  }

  const startEdit = (entry: JournalEntry) => {
    setEditingId(entry.id)
    setEditingText(entry.content)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditingText('')
  }

  const saveEdit = async () => {
    if (!editingId) return
    if (!editingText.trim()) {
      setHistoryError('Please enter a note before saving.')
      return
    }
    setEditingSaving(true)
    setHistoryError(null)
    try {
      const res = await fetch(`/api/health-journal/${encodeURIComponent(editingId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editingText }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data?.error || 'Could not update note')
      }
      setHistoryEntries((prev) => prev.map((item) => (item.id === editingId ? data.entry : item)))
      cancelEdit()
    } catch (err: any) {
      setHistoryError(err?.message || 'Could not update note')
    } finally {
      setEditingSaving(false)
    }
  }

  const deleteEntry = async (entryId: string) => {
    const confirmed = window.confirm('Delete this note?')
    if (!confirmed) return
    try {
      const res = await fetch(`/api/health-journal/${encodeURIComponent(entryId)}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || 'Could not delete note')
      }
      setHistoryEntries((prev) => prev.filter((item) => item.id !== entryId))
      loadMonthDates(dateSheetMonth)
    } catch (err: any) {
      setHistoryError(err?.message || 'Could not delete note')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <PageHeader title="Health Journal" />

      <div className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="max-w-4xl mx-auto flex gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('entry')}
            className={`flex-1 rounded-full px-4 py-2 text-sm font-semibold ${
              activeTab === 'entry'
                ? 'bg-emerald-600 text-white'
                : 'bg-gray-100 text-gray-700'
            }`}
          >
            New entry
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`flex-1 rounded-full px-4 py-2 text-sm font-semibold ${
              activeTab === 'history'
                ? 'bg-emerald-600 text-white'
                : 'bg-gray-100 text-gray-700'
            }`}
          >
            History
          </button>
        </div>
      </div>

      {activeTab === 'history' && (
        <>
          <div className="bg-white border-b border-gray-200 px-4 py-3">
            <div className="max-w-4xl mx-auto">
              <div className="md:hidden flex items-center justify-center">
                <div className="w-full max-w-md flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => shiftSelectedDateByDays(-1)}
                    className="w-11 h-11 rounded-full bg-gray-100 active:bg-gray-200 flex items-center justify-center text-gray-800"
                    aria-label="Previous day"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowDateSheet(true)}
                    className="flex-1 mx-3 h-11 rounded-2xl bg-white border border-gray-200 shadow-sm px-4 flex items-center justify-center gap-2 active:bg-gray-50"
                    aria-label="Open calendar"
                  >
                    <span className="text-base font-semibold text-gray-900">{mobileDateLabel}</span>
                    {!isViewingToday && (
                      <span className="text-xs text-gray-500">{selectedDate.slice(0, 4)}</span>
                    )}
                    <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  <button
                    type="button"
                    onClick={() => shiftSelectedDateByDays(1)}
                    className="w-11 h-11 rounded-full bg-gray-100 active:bg-gray-200 flex items-center justify-center text-gray-800"
                    aria-label="Next day"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="hidden md:flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => shiftSelectedDateByDays(-1)}
                  className="px-3 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm"
                >
                  {\`\u2039 Previous\`}
                </button>
                <div className="relative">
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="text-sm border border-gray-200 rounded-lg px-3 py-1 text-transparent caret-transparent"
                  />
                  <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm font-medium text-gray-700">
                    {desktopDateLabel}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => shiftSelectedDateByDays(1)}
                  className="px-3 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm"
                >
                  {\`Next \u203A\`}
                </button>
                <button
                  type="button"
                  onClick={() => refreshHistory()}
                  disabled={historyLoading}
                  className={`px-3 py-1 rounded-lg border text-sm flex items-center gap-2 ${
                    historyLoading
                      ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                      : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                  }`}
                  aria-label="Refresh journal"
                >
                  {historyLoading ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Refreshing
                    </>
                  ) : (
                    'Refresh'
                  )}
                </button>
              </div>
            </div>
          </div>

          {showDateSheet && (
            <div className="fixed inset-0 z-50 md:hidden">
              <div
                className="absolute inset-0 bg-black/30"
                onClick={() => setShowDateSheet(false)}
              />
              <div className="absolute left-0 right-0 bottom-0 bg-white rounded-t-3xl shadow-2xl border-t border-gray-200 overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                  <button
                    type="button"
                    onClick={() => shiftDateSheetMonth(-1)}
                    className="w-10 h-10 rounded-full bg-gray-100 active:bg-gray-200 flex items-center justify-center"
                    aria-label="Previous month"
                  >
                    <svg className="w-5 h-5 text-gray-800" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>

                  <div className="flex-1 text-center">
                    <div className="text-lg font-semibold text-gray-900">{monthMeta.label}</div>
                  </div>

                  <button
                    type="button"
                    onClick={() => shiftDateSheetMonth(1)}
                    className="w-10 h-10 rounded-full bg-gray-100 active:bg-gray-200 flex items-center justify-center"
                    aria-label="Next month"
                  >
                    <svg className="w-5 h-5 text-gray-800" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>

                <div className="px-5 pt-4 pb-6">
                  <div className="grid grid-cols-7 text-center text-xs font-semibold text-gray-400 mb-2">
                    {['SUN','MON','TUE','WED','THU','FRI','SAT'].map((d) => (
                      <div key={d} className="py-1">{d}</div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-y-2 text-center">
                    {Array.from({ length: monthMeta.startDow }).map((_, idx) => (
                      <div key={`pad-${idx}`} />
                    ))}
                    {Array.from({ length: monthMeta.daysInMonth }).map((_, idx) => {
                      const dayNum = idx + 1
                      const iso = `${monthMeta.year}-${String(monthMeta.month).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`
                      const isSelected = iso === selectedDate
                      const isToday = iso === todayIso
                      const hasEntries = entryDatesInVisibleMonth.has(iso)
                      return (
                        <button
                          key={iso}
                          type="button"
                          onClick={() => selectCalendarDay(dayNum)}
                          className={[
                            'mx-auto w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold',
                            isSelected
                              ? 'bg-emerald-600 text-white'
                              : isToday
                              ? 'bg-white text-gray-900'
                              : hasEntries
                              ? 'bg-orange-500 text-white'
                              : 'bg-white text-gray-900',
                            !isSelected
                              ? isToday
                                ? 'active:bg-gray-100'
                                : hasEntries
                                ? 'active:bg-orange-600'
                                : 'active:bg-gray-100'
                              : 'active:bg-emerald-700',
                            isToday && !isSelected ? 'ring-2 ring-emerald-300' : '',
                          ].join(' ')}
                          aria-label={`Select ${iso}`}
                        >
                          {dayNum}
                        </button>
                      )
                    })}
                  </div>
                  <div className="mt-5 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedDate(todayIso)
                        setShowDateSheet(false)
                      }}
                      className="px-4 py-2 rounded-xl bg-gray-100 text-gray-900 font-semibold active:bg-gray-200"
                    >
                      Today
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowDateSheet(false)}
                      className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-semibold active:bg-emerald-700"
                    >
                      Done
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      <div className="max-w-4xl mx-auto px-4 py-6">
        {activeTab === 'entry' ? (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900">How are you feeling right now?</h2>
            <p className="text-sm text-gray-600 mt-1">
              Write a quick note about pain, symptoms, supplements, food, or anything health-related.
            </p>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={6}
              className="mt-4 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-200"
              placeholder="Example: 3:30pm - really tired after lunch. Took magnesium an hour ago and feel dizzy."
            />
            {error && <div className="mt-3 text-sm text-red-600">{error}</div>}
            {notice && <div className="mt-3 text-sm text-emerald-700">{notice}</div>}
            <div className="mt-4 flex items-center justify-between">
              <span className="text-xs text-gray-400">Saved with today's date and time.</span>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={saving}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {saving ? 'Saving...' : 'Submit note'}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {historyLoading && (
              <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-500">
                Loading notes...
              </div>
            )}
            {historyError && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                {historyError}
              </div>
            )}
            {!historyLoading && historyEntries.length === 0 && !historyError && (
              <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">
                No notes for this day.
              </div>
            )}
            {historyEntries.map((entry) => (
              <div key={entry.id} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-gray-900">
                    {formatShortDayLabel(entry.localDate)} - {formatTimeLabel(entry.createdAt)}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => startEdit(entry)}
                      className="text-xs font-semibold text-emerald-700 hover:text-emerald-800"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteEntry(entry.id)}
                      className="text-xs font-semibold text-red-600 hover:text-red-700"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {editingId === entry.id ? (
                  <div className="mt-3 space-y-3">
                    <textarea
                      value={editingText}
                      onChange={(e) => setEditingText(e.target.value)}
                      rows={4}
                      className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                    />
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={saveEdit}
                        disabled={editingSaving}
                        className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                      >
                        {editingSaving ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        type="button"
                        onClick={cancelEdit}
                        className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-gray-700 whitespace-pre-wrap">{entry.content}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
