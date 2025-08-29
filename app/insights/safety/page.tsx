'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'

export default function SafetyInsights() {
  const [items, setItems] = useState<any[]>([])

  useEffect(() => {
    async function load() {
      const res = await fetch('/api/insights/list?preview=1', { cache: 'no-cache' })
      const data = await res.json().catch(() => ({}))
      const by = (data?.items || []).filter((it: any) => (it.tags || []).includes('safety') || (it.tags || []).includes('medication'))
      setItems(by)
    }
    load()
  }, [])

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <Link href="/insights" className="text-helfi-green">‹ Back</Link>
          <h1 className="text-lg font-semibold">Safety</h1>
        </div>
      </div>
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        {items.map((it) => (
          <div key={it.id} className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="font-semibold text-gray-900 mb-1">{it.title}</div>
            <div className="text-sm text-gray-700">{it.summary}</div>
          </div>
        ))}
        {items.length === 0 && (
          <div className="text-sm text-gray-600">No safety insights yet.</div>
        )}
      </div>
    </div>
  )
}


