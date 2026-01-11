'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import PageHeader from '@/components/PageHeader'

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
type TodayCache = {
  issues: UserIssue[]
  ratings: Record<string, number | null>
  notes: Record<string, string>
  na: Record<string, boolean>
  fetchedAt: number
}

export default function CheckInPage() {
  const [ratings, setRatings] = useState<Record<string, number | null>>({})
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [na, setNa] = useState<Record<string, boolean>>({})
  const [issues, setIssues] = useState<UserIssue[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const CACHE_KEY = 'checkins:today:cache'
    const CACHE_TTL_MS = 5 * 60_000

    const readCache = (): TodayCache | null => {
      if (typeof window === 'undefined') return null
      try {
        const raw = window.sessionStorage.getItem(CACHE_KEY)
        if (!raw) return null
        const parsed = JSON.parse(raw) as TodayCache
        if (!parsed?.fetchedAt) return null
        return parsed
      } catch {
        return null
      }
    }

    const writeCache = (data: TodayCache) => {
      if (typeof window === 'undefined') return
      try {
        window.sessionStorage.setItem(CACHE_KEY, JSON.stringify(data))
      } catch {
        // ignore
      }
    }

    const cached = readCache()
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      setIssues(cached.issues || [])
      setRatings(cached.ratings || {})
      setNotes(cached.notes || {})
      setNa(cached.na || {})
      setLoading(false)
      return
    }

    // Load actual issues if API is available
    setLoading(true)
    fetch('/api/checkins/today', { cache: 'no-store' as any })
      .then(r => r.json())
      .then((data) => {
        let nextIssues: UserIssue[] = []
        let nextRatings: Record<string, number | null> = {}
        if (Array.isArray(data?.issues)) {
          const seen = new Set<string>()
          const unique = [] as UserIssue[]
          for (const it of data.issues as UserIssue[]) {
            const key = (it.name || '').toLowerCase().trim()
            if (!seen.has(key)) { seen.add(key); unique.push(it) }
          }
          if (unique.length > 0) {
            nextIssues = unique
            setIssues(unique)
          }
        }
        if (Array.isArray(data?.ratings)) {
          const map: Record<string, number | null> = {}
          for (const r of data.ratings) map[r.issueId] = r.value
          nextRatings = map
          setRatings(map)
        }
        writeCache({
          issues: nextIssues,
          ratings: nextRatings,
          notes: {},
          na: {},
          fetchedAt: Date.now(),
        })
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const setRating = (issueId: string, value: number) => {
    setRatings((r) => {
      const updated = { ...r, [issueId]: value }
      return updated
    })
    setNa((n) => {
      const updated = { ...n, [issueId]: false }
      return updated
    })
  }

  const handleSave = async () => {
    try {
      const pendingId =
        typeof window !== 'undefined' ? sessionStorage.getItem('helfi:pending-notification-id') : null
      const payload = issues.map((it) => ({
        issueId: it.id,
        value: na[it.id] ? null : (ratings[it.id] ?? null),
        note: notes[it.id] || '',
        isNa: !!na[it.id],
      }))
      const res = await fetch('/api/checkins/today', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ratings: payload, notificationId: pendingId || undefined }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.detail || data?.error || 'Failed to save')
      }
      try {
        const CACHE_KEY = 'checkins:today:cache'
        const payloadRatings: Record<string, number | null> = {}
        for (const item of payload) payloadRatings[item.issueId] = item.value
        sessionStorage.setItem(
          CACHE_KEY,
          JSON.stringify({
            issues,
            ratings: payloadRatings,
            notes,
            na,
            fetchedAt: Date.now(),
          }),
        )
      } catch {}
      if (pendingId) {
        try {
          sessionStorage.removeItem('helfi:pending-notification-id')
        } catch {}
      }
      // Navigate after save
      try {
        const search = typeof window !== 'undefined' ? window.location.search : ''
        const params = new URLSearchParams(search)
        const ret = params.get('return') || ''
        const ref = document.referrer || ''
        const isEditMode = !!params.get('new')
        const cameFromOnboarding = ret.includes('/onboarding') || ref.includes('/onboarding')
        if (isEditMode) {
          // When adding issues after onboarding, go straight to dashboard
          window.location.assign('/dashboard')
          return
        }
        if (cameFromOnboarding) {
          // First-time onboarding flow
          window.location.assign('/onboarding?step=5')
          return
        }
        // Default
        window.location.assign('/dashboard')
        return
      } catch {}
      alert('Saved today\'s ratings.')
    } catch (e: any) {
      alert(e?.message || 'Failed to save. Please try again.')
    }
  }

  const pathname = usePathname()
  const isHistoryPage = pathname === '/check-in/history'

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-24">
      <PageHeader title="Today's Check-In" backHref="/more" />
      
      {/* Tabs */}
      <div className="max-w-3xl mx-auto px-4 pt-4">
        <div className="bg-white dark:bg-gray-800 rounded-t-xl border-b border-gray-200 dark:border-gray-700">
          <div className="flex">
            <Link
              href="/check-in"
              className={`flex-1 px-4 py-3 text-center font-medium transition-colors ${
                !isHistoryPage
                  ? 'text-helfi-green border-b-2 border-helfi-green'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              Today's Check-in
            </Link>
            <Link
              href="/check-in/history"
              className={`flex-1 px-4 py-3 text-center font-medium transition-colors ${
                isHistoryPage
                  ? 'text-helfi-green border-b-2 border-helfi-green'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              Rating History
            </Link>
          </div>
        </div>
      </div>

      {!isHistoryPage ? (
        <main className="max-w-3xl mx-auto px-4 py-6">
          <div className="bg-white dark:bg-gray-800 rounded-b-2xl shadow-sm p-6">
            <div className="mb-2">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Today's check‑in</h1>
              <Link href="/notifications/health-reminders" className="inline-flex items-center text-sm text-helfi-green hover:underline font-medium mt-2">
                Set your notifications →
              </Link>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">Rate how you went today. One tap per item, then Save.</p>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-helfi-green"></div>
          </div>
        ) : (
          <div className="space-y-6">
            {issues.length === 0 && (
              <div className="border border-yellow-200 bg-yellow-50 text-yellow-800 rounded-xl p-4 text-sm">
                No issues selected yet. Go to <a className="underline" href="/onboarding?step=4">Health Setup</a> to choose what you want to track.
              </div>
            )}
          {issues
            // Filter only for ?new= parameter, otherwise show all issues so users can see and edit their ratings
            .filter((it) => {
              try {
                const params = new URLSearchParams(window.location.search || '')
                // If ?new= is present, show only those newly added issues
                const onlyNew = params.get('new')
                if (onlyNew) {
                  const set = new Set(onlyNew.split('|').map(s => s.toLowerCase()))
                  return set.has((it.name || '').toLowerCase())
                }
                // Always show all issues - users should see what they've rated
                return true
              } catch {}
              return true
            })
            .map((issue) => {
            const isPlural = () => {
              const n = (issue.name || '').trim()
              // Simple plural detection with common exceptions
              // Treat words like "Bowel Movements", "Movements", "Allergies" as plural
              if (/\b(movements|allergies|bowels|bowel movements)\b/i.test(n)) return true
              // Ends with 's' and not 'ss' → likely plural (e.g., "Headaches", "Rashes")
              return /[^s]s$/i.test(n)
            }
            const question = issue.polarity === 'negative'
              ? `How were your ${issue.name} levels today?`
              : (isPlural() ? `How were your ${issue.name} today?` : `How was your ${issue.name} today?`)
            const selectedRating = ratings[issue.id]
            const isNotApplicable = na[issue.id]
            return (
              <div key={issue.id} className="border border-gray-200 dark:border-gray-700 rounded-xl p-4 dark:bg-gray-800/50">
                <div className="font-medium mb-3 text-gray-900 dark:text-white">{question}</div>
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                  {LABELS.map((label, idx) => {
                    const isSelected = selectedRating === idx && !isNotApplicable
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          setRating(issue.id, idx)
                        }}
                        className={`text-xs px-2 py-2 rounded-lg border transition-all duration-200 font-medium ${
                          isSelected
                            ? 'bg-[#4CAF50] text-white border-[#4CAF50] shadow-md'
                            : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:border-[#4CAF50] hover:bg-gray-50 dark:hover:bg-gray-600'
                        }`}
                        style={isSelected ? { backgroundColor: '#4CAF50', color: 'white', borderColor: '#4CAF50' } : undefined}
                      >
                        {label}
                      </button>
                    )
                  })}
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
        )}

        {!loading && (
          <div className="mt-6 flex justify-end">
            <button onClick={handleSave} className="bg-helfi-green text-white px-4 py-2 rounded-lg hover:bg-helfi-green/90">Save today's ratings</button>
          </div>
        )}
          </div>
        </main>
      ) : null}
    </div>
  )
}
