'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'

export default function InsightDetail() {
  const params = useParams() as { id?: string }
  const router = useRouter()
  const [item, setItem] = useState<any | null>(null)

  useEffect(() => {
    async function load() {
      const res = await fetch('/api/insights/list?preview=1', { cache: 'no-cache' })
      const data = await res.json().catch(() => ({}))
      const it = (data?.items || []).find((x: any) => String(x.id) === String(params?.id))
      setItem(it || null)
    }
    load()
  }, [params?.id])

  if (!item) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-white border-b border-gray-200 px-4 py-4">
          <div className="max-w-4xl mx-auto flex items-center gap-3">
            <button onClick={() => router.back()} className="text-helfi-green">‹ Back</button>
            <h1 className="text-lg font-semibold">Insight</h1>
          </div>
        </div>
        <div className="max-w-4xl mx-auto px-4 py-6 text-sm text-gray-600">Loading…</div>
      </div>
    )
  }

  const actions: string[] = Array.isArray(item.actions) ? item.actions : []
  const reason: string = item.reason || ''

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <button onClick={() => router.back()} className="text-helfi-green">‹ Back</button>
          <h1 className="text-lg font-semibold">{item.title}</h1>
        </div>
      </div>
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-sm text-gray-700">{item.summary}</div>
          {reason && (
            <div className="text-xs text-gray-500 mt-2">Why: {reason}</div>
          )}
        </div>

        {actions.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="font-semibold mb-2">Actions</div>
            <ul className="list-disc pl-5 space-y-2 text-sm text-gray-800">
              {actions.map((a, i) => (<li key={i}>{a}</li>))}
            </ul>
          </div>
        )}

        <div className="flex gap-3">
          <button onClick={async () => {
            await fetch('/api/insights/state', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'pin', id: item.id }) })
          }} className="flex-1 py-2 rounded-md bg-helfi-green text-white font-medium">Pin</button>
          <button onClick={async () => {
            await fetch('/api/insights/state', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'dismiss', id: item.id }) })
            router.back()
          }} className="flex-1 py-2 rounded-md bg-gray-100 text-gray-800 font-medium">Dismiss</button>
        </div>

        <div className="text-xs text-gray-500">
          Related: <Link className="text-helfi-green" href="/food">Log food</Link> · <Link className="text-helfi-green" href="/settings">Set reminder</Link>
        </div>
      </div>
    </div>
  )
}


