'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'

export default function SupplementsInsights() {
  const [supps, setSupps] = useState<any[]>([])

  useEffect(() => {
    async function load() {
      const res = await fetch('/api/user-data', { cache: 'no-cache' })
      const data = await res.json().catch(() => ({}))
      const s = Array.isArray(data?.data?.supplements) ? data.data.supplements : []
      setSupps(s)
    }
    load()
  }, [])

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <Link href="/insights" className="text-helfi-green">‹ Back</Link>
          <h1 className="text-lg font-semibold">Supplements</h1>
        </div>
      </div>
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        <div className="flex items-center justify-between mb-2">
          <Link href="/insights" className="text-helfi-green text-lg">← Back</Link>
        </div>
        {supps.map((s, idx) => (
          <Link href={`/insights/supplements/${encodeURIComponent(s.name || 'supp_'+idx)}`} key={idx} className="bg-white border border-gray-200 rounded-lg p-4 block">
            <div className="font-semibold text-gray-900 mb-1">{s.name || 'Supplement'}</div>
            <div className="text-sm text-gray-700">{Array.isArray(s.timing) ? s.timing.join(', ') : (s.timing || 'timing not set')}</div>
          </Link>
        ))}
        {supps.length === 0 && (
          <div className="text-sm text-gray-600">No supplements saved yet.</div>
        )}
      </div>
    </div>
  )
}


