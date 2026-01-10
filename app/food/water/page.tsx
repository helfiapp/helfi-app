'use client'

import React, { useEffect, useMemo, useState } from 'react'
import PageHeader from '@/components/PageHeader'
import Link from 'next/link'

type WaterEntry = {
  id: string
  amount: number
  unit: string
  amountMl: number
  label?: string | null
  localDate: string
  createdAt: string
}

const DRINK_TYPES = ['Water', 'Tea', 'Coffee', 'Juice', 'Smoothie', 'Other'] as const

const QUICK_PRESETS = [
  { label: 'Cup', amount: 250, unit: 'ml' },
  { label: 'Glass', amount: 300, unit: 'ml' },
  { label: 'Mug', amount: 350, unit: 'ml' },
  { label: 'Bottle', amount: 500, unit: 'ml' },
  { label: 'Large bottle', amount: 750, unit: 'ml' },
  { label: '1 L bottle', amount: 1, unit: 'l' },
  { label: '1.5 L bottle', amount: 1.5, unit: 'l' },
  { label: '2 L bottle', amount: 2, unit: 'l' },
  { label: '3 L bottle', amount: 3, unit: 'l' },
]

function todayLocalDate() {
  return new Date().toISOString().slice(0, 10)
}

function formatNumber(value: number) {
  if (Number.isInteger(value)) return String(value)
  return value.toFixed(2).replace(/\.0+$/, '').replace(/(\.[1-9])0$/, '$1')
}

function formatAmount(entry: WaterEntry) {
  const unit = entry.unit === 'l' ? 'L' : entry.unit
  return `${formatNumber(entry.amount)} ${unit}`
}

function formatMl(ml: number) {
  if (!Number.isFinite(ml)) return '0 ml'
  if (ml >= 1000) {
    const liters = ml / 1000
    return `${formatNumber(Math.round(liters * 100) / 100)} L`
  }
  return `${Math.round(ml)} ml`
}

function formatDateLabel(value: string) {
  const today = todayLocalDate()
  if (value === today) return 'Today'
  const d = new Date(`${value}T00:00:00`)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

function formatTime(value: string) {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

export default function WaterIntakePage() {
  const [selectedDate, setSelectedDate] = useState(todayLocalDate)
  const [entries, setEntries] = useState<WaterEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [selectedType, setSelectedType] = useState<(typeof DRINK_TYPES)[number]>('Water')
  const [customAmount, setCustomAmount] = useState('')
  const [customUnit, setCustomUnit] = useState<'ml' | 'l' | 'oz'>('ml')
  const [customLabel, setCustomLabel] = useState('')
  const [goalMl, setGoalMl] = useState<number | null>(null)
  const [goalLoading, setGoalLoading] = useState(false)

  const totalMl = useMemo(
    () => entries.reduce((sum, entry) => sum + (Number(entry.amountMl) || 0), 0),
    [entries]
  )

  const entryCount = entries.length
  const goalProgress = goalMl ? Math.min(100, Math.round((totalMl / goalMl) * 100)) : null

  const loadEntries = async (localDate: string) => {
    setLoading(true)
    setBanner(null)
    try {
      const res = await fetch(`/api/water-log?localDate=${encodeURIComponent(localDate)}`, { cache: 'no-store' as any })
      if (!res.ok) throw new Error('load failed')
      const data = await res.json()
      setEntries(Array.isArray(data?.entries) ? data.entries : [])
    } catch {
      setBanner({ type: 'error', message: 'Could not load water entries. Please try again.' })
      setEntries([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadEntries(selectedDate)
  }, [selectedDate])

  useEffect(() => {
    let ignore = false
    const loadGoal = async () => {
      setGoalLoading(true)
      try {
        const res = await fetch('/api/user-data', { cache: 'no-store' as any })
        if (!res.ok) return
        const data = await res.json()
        const target = data?.data?.hydrationGoal?.targetMl
        if (!ignore) {
          setGoalMl(typeof target === 'number' ? target : null)
        }
      } catch {
        if (!ignore) setGoalMl(null)
      } finally {
        if (!ignore) setGoalLoading(false)
      }
    }
    loadGoal()
    return () => { ignore = true }
  }, [])

  const addEntry = async (amount: number, unit: string, label: string | null) => {
    setSaving(true)
    setBanner(null)
    try {
      const res = await fetch('/api/water-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          unit,
          label: label || undefined,
          localDate: selectedDate,
        }),
      })
      if (!res.ok) throw new Error('save failed')
      const data = await res.json()
      const entry = data?.entry as WaterEntry | undefined
      if (entry) {
        setEntries((prev) => [entry, ...prev])
      } else {
        await loadEntries(selectedDate)
      }
      setBanner({ type: 'success', message: 'Water entry saved.' })
    } catch {
      setBanner({ type: 'error', message: 'Could not save. Please try again.' })
    } finally {
      setSaving(false)
    }
  }

  const deleteEntry = async (id: string) => {
    setDeletingId(id)
    setBanner(null)
    try {
      const res = await fetch(`/api/water-log/${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('delete failed')
      setEntries((prev) => prev.filter((entry) => entry.id !== id))
      setBanner({ type: 'success', message: 'Entry removed.' })
    } catch {
      setBanner({ type: 'error', message: 'Could not remove entry.' })
    } finally {
      setDeletingId(null)
    }
  }

  const handleQuickAdd = (amount: number, unit: string) => {
    const label = selectedType === 'Other' ? null : selectedType
    addEntry(amount, unit, label)
  }

  const handleCustomAdd = () => {
    const amount = Number(customAmount)
    if (!Number.isFinite(amount) || amount <= 0) {
      setBanner({ type: 'error', message: 'Enter a valid amount first.' })
      return
    }
    const label = customLabel.trim() || (selectedType === 'Other' ? '' : selectedType)
    addEntry(amount, customUnit, label || null)
    setCustomAmount('')
    setCustomLabel('')
  }

  const shiftDate = (delta: number) => {
    const d = new Date(`${selectedDate}T00:00:00`)
    d.setDate(d.getDate() + delta)
    setSelectedDate(d.toISOString().slice(0, 10))
  }

  return (
    <div className="min-h-screen bg-[#f6f8fb] pb-24">
      <PageHeader title="Water Intake" backHref="/food" />

      <main className="max-w-5xl mx-auto px-4 py-6">
        {banner && (
          <div
            className={[
              'mb-4 rounded-xl border px-4 py-3 text-sm',
              banner.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-red-50 border-red-200 text-red-700',
            ].join(' ')}
          >
            {banner.message}
          </div>
        )}

        <div className="rounded-3xl border border-sky-100 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Daily hydration log</h2>
              <p className="text-sm text-gray-500 mt-1">Add water, tea, coffee, or any drink as many times as you want.</p>
            </div>
            <Link
              href="/food"
              className="inline-flex items-center justify-center rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              Back to Food Diary
            </Link>
          </div>

          <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <button
              type="button"
              onClick={() => shiftDate(-1)}
              className="px-3 py-2 rounded-xl bg-gray-100 text-gray-700 text-sm font-semibold hover:bg-gray-200"
            >
              Previous
            </button>
            <div className="relative">
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-2 text-transparent caret-transparent"
                aria-label="Select date"
              />
              <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm font-semibold text-gray-700">
                {formatDateLabel(selectedDate)}
              </span>
            </div>
            <button
              type="button"
              onClick={() => shiftDate(1)}
              className="px-3 py-2 rounded-xl bg-gray-100 text-gray-700 text-sm font-semibold hover:bg-gray-200"
            >
              Next &gt;
            </button>
            <button
              type="button"
              onClick={() => setSelectedDate(todayLocalDate())}
              className="px-3 py-2 rounded-xl border border-sky-200 text-sky-700 text-sm font-semibold hover:bg-sky-50"
            >
              Today
            </button>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-[1.2fr_1fr]">
            <div className="rounded-2xl border border-sky-100 bg-gradient-to-br from-sky-50 to-white p-5">
              <div className="text-xs font-semibold uppercase tracking-wide text-sky-700">Total for {formatDateLabel(selectedDate)}</div>
              <div className="mt-2 text-3xl font-bold text-slate-900">{formatMl(totalMl)}</div>
              <div className="mt-1 text-sm text-slate-500">
                {entryCount} {entryCount === 1 ? 'entry' : 'entries'}
                {loading ? ' - updating...' : ''}
              </div>
              {goalMl && (
                <div className="mt-3 text-sm text-slate-700">
                  Goal: {formatMl(goalMl)} daily
                  {goalProgress != null ? ` (${goalProgress}%)` : ''}
                </div>
              )}
              {goalLoading && !goalMl && (
                <div className="mt-3 text-sm text-slate-500">Loading hydration goal...</div>
              )}
              {goalMl && (
                <div className="mt-3 h-2 w-full rounded-full bg-white">
                  <div
                    className="h-full rounded-full bg-sky-400"
                    style={{ width: `${goalProgress ?? 0}%` }}
                  ></div>
                </div>
              )}
            </div>
            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-5">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Quick context</div>
              <div className="mt-3 text-sm text-gray-700">
                Pick a drink type and tap a size to log instantly. Use custom below for bottle sizes like 1 L, 2 L, or 3 L.
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-gray-900">Quick add</h3>
            <p className="text-sm text-gray-500 mt-1">Choose a drink type, then tap a size.</p>

            <div className="mt-4 flex flex-wrap gap-2">
              {DRINK_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setSelectedType(type)}
                  className={`px-3 py-1.5 rounded-full text-sm font-semibold border transition-colors ${
                    selectedType === type
                      ? 'bg-sky-600 text-white border-sky-600'
                      : 'bg-white text-gray-700 border-gray-200 hover:border-sky-300'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {QUICK_PRESETS.map((preset) => (
                <button
                  key={`${preset.label}-${preset.amount}-${preset.unit}`}
                  type="button"
                  onClick={() => handleQuickAdd(preset.amount, preset.unit)}
                  disabled={saving}
                  className="rounded-2xl border border-sky-100 bg-sky-50 px-3 py-4 text-left shadow-sm transition hover:bg-sky-100 disabled:opacity-60"
                >
                  <div className="text-sm font-semibold text-gray-900">{preset.label}</div>
                  <div className="text-xs text-gray-500 mt-1">{formatNumber(preset.amount)} {preset.unit === 'l' ? 'L' : preset.unit}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-gray-900">Custom entry</h3>
            <p className="text-sm text-gray-500 mt-1">Use this for specific bottle sizes or drinks.</p>

            <div className="mt-4 grid gap-4">
              <div>
                <label className="text-sm font-semibold text-gray-700">Amount</label>
                <div className="mt-2 flex gap-2">
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={customAmount}
                    onChange={(e) => setCustomAmount(e.target.value)}
                    className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-sky-300 focus:outline-none"
                    placeholder="e.g. 1.5"
                  />
                  <select
                    value={customUnit}
                    onChange={(e) => setCustomUnit(e.target.value as 'ml' | 'l' | 'oz')}
                    className="rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-sky-300 focus:outline-none"
                  >
                    <option value="ml">ml</option>
                    <option value="l">L</option>
                    <option value="oz">oz</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-sm font-semibold text-gray-700">Drink label (optional)</label>
                <input
                  type="text"
                  value={customLabel}
                  onChange={(e) => setCustomLabel(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-sky-300 focus:outline-none"
                  placeholder="e.g. Herbal tea, Sparkling water"
                />
              </div>

              <button
                type="button"
                onClick={handleCustomAdd}
                disabled={saving}
                className="w-full rounded-2xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-sky-700 disabled:opacity-60"
              >
                {saving ? 'Saving...' : 'Add entry'}
              </button>
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-lg font-semibold text-gray-900">Entries for {formatDateLabel(selectedDate)}</h3>
            <div className="text-sm text-gray-500">{entryCount} {entryCount === 1 ? 'entry' : 'entries'}</div>
          </div>

          <div className="mt-4 space-y-3">
            {loading && (
              <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 text-sm text-gray-500">
                Loading entries...
              </div>
            )}
            {!loading && entries.length === 0 && (
              <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 text-sm text-gray-500">
                No water entries yet. Add your first drink above.
              </div>
            )}
            {!loading && entries.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                <div>
                  <div className="text-sm font-semibold text-gray-900">{entry.label || 'Drink'}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    {formatAmount(entry)} - {formatTime(entry.createdAt)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => deleteEntry(entry.id)}
                  disabled={deletingId === entry.id}
                  className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-60"
                >
                  {deletingId === entry.id ? 'Removing...' : 'Remove'}
                </button>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}
