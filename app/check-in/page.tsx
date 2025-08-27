'use client'

import React, { useEffect, useMemo, useState } from 'react'

const LABELS = [
  'Really bad',
  'Bad',
  'Below average',
  'Average',
  'Above average',
  'Good',
  'Excellent',
] as const

type UserIssue = { id: string; name: string; polarity: 'positive' | 'negative' }

export default function CheckInPage() {
  const [ratings, setRatings] = useState<Record<string, number | null>>({})
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [na, setNa] = useState<Record<string, boolean>>({})
  const [issues, setIssues] = useState<UserIssue[]>([])

  useEffect(() => {
    // Load actual issues if API is available
    fetch('/api/checkins/today', { cache: 'no-store' as any }).then(r => r.json()).then((data) => {
      if (Array.isArray(data?.issues)) {
        const seen = new Set<string>()
        const unique = [] as UserIssue[]
        for (const it of data.issues as UserIssue[]) {
          const key = (it.name || '').toLowerCase().trim()
          if (!seen.has(key)) { seen.add(key); unique.push(it) }
        }
        if (unique.length > 0) setIssues(unique)
      }
      if (Array.isArray(data?.ratings)) {
        const map: Record<string, number> = {}
        for (const r of data.ratings) map[r.issueId] = r.value
        setRatings(map)
      }
    }).catch(() => {})
  }, [])

  const setRating = (issueId: string, value: number) => {
    setRatings((r) => ({ ...r, [issueId]: value }))
    setNa((n) => ({ ...n, [issueId]: false }))
  }

  const handleSave = async () => {
    try {
      const payload = issues.map((it) => ({
        issueId: it.id,
        value: na[it.id] ? null : (ratings[it.id] ?? null),
        note: notes[it.id] || '',
        isNa: !!na[it.id],
      }))
      const res = await fetch('/api/checkins/today', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ratings: payload }) })
      if (!res.ok) throw new Error('save failed')
      // Navigate after save
      try {
        const search = typeof window !== 'undefined' ? window.location.search : ''
        const params = new URLSearchParams(search)
        const ret = params.get('return') || ''
        const ref = document.referrer || ''
        const cameFromOnboarding = ret.includes('/onboarding') || ref.includes('/onboarding')
        if (cameFromOnboarding) {
          window.location.assign('/onboarding?step=5')
          return
        }
        // Default: go to dashboard after adding an entry from anywhere else
        window.location.assign('/dashboard')
        return
      } catch {}
      alert('Saved today\'s ratings.')
    } catch (e) {
      alert('Failed to save. Please try again.')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-sm p-6">
        <div className="flex items-center justify-between gap-4 mb-2">
          <h1 className="text-2xl font-bold">Today's check‑in</h1>
          <a href="/check-in/history" className="text-sm text-helfi-green hover:underline">View history</a>
        </div>
        <p className="text-sm text-gray-600 mb-6">Rate how you went today. One tap per item, then Save.</p>

        <div className="space-y-6">
          {issues.length === 0 && (
            <div className="border border-yellow-200 bg-yellow-50 text-yellow-800 rounded-xl p-4 text-sm">
              No issues selected yet. Go to <a className="underline" href="/onboarding?step=4">Health Setup</a> to choose what you want to track.
            </div>
          )}
          {issues.map((issue) => {
            const question = issue.polarity === 'negative'
              ? `How were your ${issue.name} levels today?`
              : `How was your ${issue.name} today?`
            const selected = ratings[issue.id]
            return (
              <div key={issue.id} className="border border-gray-200 rounded-xl p-4">
                <div className="font-medium mb-3">{question}</div>
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                  {LABELS.map((label, idx) => (
                    <button
                      key={idx}
                      onClick={() => setRating(issue.id, idx)}
                      className={`text-xs px-2 py-2 rounded-lg border transition-colors ${selected === idx && !na[issue.id] ? 'bg-helfi-green text-white border-helfi-green' : 'bg-white text-gray-700 border-gray-200 hover:border-helfi-green'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {/* Optional details accordion */}
                <details className="mt-3">
                  <summary className="text-sm text-gray-600 cursor-pointer select-none">Add details (optional)</summary>
                  <textarea
                    value={notes[issue.id] || ''}
                    onChange={(e)=>setNotes((m)=>({ ...m, [issue.id]: e.target.value }))}
                    rows={3}
                    placeholder="Anything notable today?"
                    className="mt-2 w-full border rounded-lg p-2 text-sm"
                  />
                </details>
                <div className="mt-3">
                  <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                    <input type="checkbox" checked={!!na[issue.id]} onChange={(e)=> setNa((m)=>({ ...m, [issue.id]: e.target.checked }))} />
                    Not applicable for this time
                  </label>
                </div>
              </div>
            )
          })}
        </div>

        <div className="mt-6 flex justify-end">
          <button onClick={handleSave} className="bg-helfi-green text-white px-4 py-2 rounded-lg hover:bg-helfi-green/90">Save today's ratings</button>
        </div>
      </div>
    </div>
  )
}


