'use client'

import { useEffect, useMemo, useState } from 'react'

type MissingFoodReportProps = {
  defaultQuery?: string
  kind?: 'single' | 'packaged'
  country?: string
  source?: string
  className?: string
}

const toCountryLabel = (value: string) => {
  const v = String(value || '').trim().toUpperCase()
  if (!v) return 'Unknown'
  return v
}

export default function MissingFoodReport({
  defaultQuery,
  kind = 'single',
  country,
  source,
  className,
}: MissingFoodReportProps) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [brand, setBrand] = useState('')
  const [size, setSize] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const resolvedCountry = useMemo(() => toCountryLabel(country || ''), [country])

  useEffect(() => {
    if (!open) return
    setError(null)
    setDone(false)
    const next = String(defaultQuery || '').trim()
    if (next) setName(next)
  }, [open, defaultQuery])

  const submit = async () => {
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Please enter the item name.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const payload = {
        name: trimmed,
        brand: brand.trim() || null,
        chain: brand.trim() || null,
        size: size.trim() || null,
        notes: notes.trim() || null,
        kind,
        query: String(defaultQuery || '').trim() || null,
        country: resolvedCountry === 'Unknown' ? null : resolvedCountry,
        source: source || null,
      }
      const res = await fetch('/api/food-missing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        setError('Something went wrong. Please try again.')
        return
      }
      setDone(true)
      setBrand('')
      setSize('')
      setNotes('')
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-semibold text-emerald-700 hover:text-emerald-800"
      >
        Missing item? Tell us
      </button>

      {open && (
        <div className="fixed inset-0 z-[10000]">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute inset-0 flex items-center justify-center px-4">
            <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-4 shadow-xl">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-gray-900">Report missing item</div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="p-2 rounded-md hover:bg-gray-100"
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>

              <div className="mt-3 space-y-3">
                <div className="text-xs text-gray-500">Country: {resolvedCountry}</div>

                <div>
                  <label className="text-xs font-semibold text-gray-700">Item name *</label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    placeholder="e.g. Strawberry sundae"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-700">Brand or chain</label>
                  <input
                    value={brand}
                    onChange={(e) => setBrand(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    placeholder="e.g. McDonald's"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-700">Size (optional)</label>
                  <input
                    value={size}
                    onChange={(e) => setSize(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    placeholder="e.g. Small / Medium / Large"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-700">Extra notes</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    rows={3}
                    placeholder="Anything else that helps"
                  />
                </div>

                {error && <div className="text-xs text-red-600">{error}</div>}
                {done && <div className="text-xs text-emerald-700">Thanks. We have it.</div>}

                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="px-3 py-2 text-xs font-semibold text-gray-600"
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={submit}
                    className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {busy ? 'Sending…' : 'Send'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
