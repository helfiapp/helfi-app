'use client'

import React, { useMemo, useState } from 'react'

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

// Placeholder issues until backend wiring; will be replaced by API data
const exampleIssues: UserIssue[] = [
  { id: '1', name: 'Energy', polarity: 'positive' },
  { id: '2', name: 'Anxiety', polarity: 'negative' },
]

export default function CheckInPage() {
  const [ratings, setRatings] = useState<Record<string, number>>({})
  const issues = useMemo(() => exampleIssues, [])

  const setRating = (issueId: string, value: number) => {
    setRatings((r) => ({ ...r, [issueId]: value }))
  }

  const handleSave = async () => {
    try {
      // TODO: POST to /api/checkins/today with ratings
      alert('Saved today\'s ratings. (Scaffold)')
    } catch (e) {
      alert('Failed to save. Please try again.')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-sm p-6">
        <h1 className="text-2xl font-bold mb-2">Today\'s check‑in</h1>
        <p className="text-sm text-gray-600 mb-6">Rate how you went today. One tap per item, then Save.</p>

        <div className="space-y-6">
          {issues.map((issue) => {
            const question = issue.polarity === 'negative'
              ? `How were your ${issue.name} levels today?`
              : `How were your ${issue.name} today?`
            const selected = ratings[issue.id]
            return (
              <div key={issue.id} className="border border-gray-200 rounded-xl p-4">
                <div className="font-medium mb-3">{question}</div>
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                  {LABELS.map((label, idx) => (
                    <button
                      key={idx}
                      onClick={() => setRating(issue.id, idx)}
                      className={`text-xs px-2 py-2 rounded-lg border transition-colors ${selected === idx ? 'bg-helfi-green text-white border-helfi-green' : 'bg-white text-gray-700 border-gray-200 hover:border-helfi-green'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        <div className="mt-6 flex justify-end">
          <button onClick={handleSave} className="bg-helfi-green text-white px-4 py-2 rounded-lg hover:bg-helfi-green/90">Save today\'s ratings</button>
        </div>
      </div>
    </div>
  )
}


