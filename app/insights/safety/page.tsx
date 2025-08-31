'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'

export default function SafetyInsights() {
  const [items, setItems] = useState<any[]>([])
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState<string>('')
  const [asking, setAsking] = useState(false)

  async function load() {
    // Prefer real analyzer results; fall back to preview list
    try {
      const res = await fetch('/api/insights/safety/analyze', { cache: 'no-cache' })
      const data = await res.json().catch(() => ({}))
      if (Array.isArray(data?.items) && data.items.length) {
        setItems(data.items)
        return
      }
    } catch {}
    const res = await fetch('/api/insights/list?preview=1', { cache: 'no-cache' })
    const data = await res.json().catch(() => ({}))
    const all: any[] = data?.items || []
    const by = all.filter((it: any) => (it.tags || []).includes('safety') || (it.tags || []).includes('medication'))
    setItems(by.length ? by : all)
  }
  useEffect(() => { load() }, [])

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <Link href="/insights" className="text-helfi-green">‹ Back</Link>
          <h1 className="text-lg font-semibold">Safety</h1>
        </div>
      </div>
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        <div className="flex justify-end mb-2">
          <button onClick={async()=>{ fetch('/api/insights/generate?preview=1', { method: 'POST' }).catch(()=>{}); await load() }} className="px-3 py-2 bg-helfi-green text-white rounded-md text-sm">Refresh</button>
        </div>
        {items.map((it) => (
          <div key={it.id} className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="font-semibold text-gray-900 mb-1">{it.title}</div>
            <div className="text-sm text-gray-700 mb-2">{it.summary}</div>
            {it.reason && (<div className="text-xs text-gray-500 mb-2">Why: {it.reason}</div>)}
            {Array.isArray(it.actions) && it.actions.length > 0 && (
              <ul className="list-disc pl-5 text-sm text-gray-800 space-y-1">
                {it.actions.map((a: string, idx: number) => (<li key={idx}>{a}</li>))}
              </ul>
            )}
          </div>
        ))}
        {items.length === 0 && (
          <div className="text-sm text-gray-600">No safety insights yet.</div>
        )}

        {/* Ask AI about Safety */}
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="font-semibold text-gray-900 mb-2">Ask AI about Safety</div>
          <div className="text-xs text-gray-500 mb-3">We’ll use only your relevant recent data (medications, supplements, recent ratings) to answer.</div>
          <div className="flex gap-2">
            <input
              value={question}
              onChange={(e)=>setQuestion(e.target.value)}
              placeholder="e.g., How should I time my supplements for best absorption?"
              className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
            <button
              onClick={async()=>{
                if (!question.trim()) return
                setAsking(true)
                try {
                  const res = await fetch('/api/insights/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ section: 'safety', question }) })
                  const data = await res.json().catch(()=>({}))
                  setAnswer(data?.answer || 'No answer available right now.')
                } finally { setAsking(false) }
              }}
              disabled={asking || !question.trim()}
              className="px-3 py-2 bg-blue-600 text-white rounded-md text-sm disabled:opacity-50"
            >{asking ? 'Thinking…' : 'Ask'}</button>
          </div>
          {answer && (
            <div className="mt-3 text-sm text-gray-800 whitespace-pre-wrap">{answer}</div>
          )}
        </div>
      </div>
    </div>
  )
}


