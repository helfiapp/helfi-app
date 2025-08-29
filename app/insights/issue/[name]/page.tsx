'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useSearchParams } from 'next/navigation'

export default function IssueDetail() {
  const { name } = useParams() as { name?: string }
  const search = useSearchParams()
  const tab = search.get('tab') || 'overview'
  const [item, setItem] = useState<any | null>(null)
  const [loading, setLoading] = useState<boolean>(true)

  useEffect(() => {
    async function load() {
      try {
        setLoading(true)
        const res = await fetch(`/api/insights/detail?issue=${encodeURIComponent(String(name||''))}`, { cache: 'no-cache' })
        const js = await res.json().catch(()=>({}))
        const d = js?.data || {}
        setItem({
          id: `issue:${name}`,
          title: d.title || String(name || '').replace(/%20/g,' '),
          summary: d.what || (tab === 'nutrition' ? 'Nutrition guidance for this issue.' : 'Recommendations for this issue.'),
          reason: d.reason,
          actions: Array.isArray(d.actions) ? d.actions : []
        })
      } finally { setLoading(false) }
    }
    load()
  }, [name, tab])

  if (!item) return null

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <Link href="/insights/goals" className="text-helfi-green">← Back</Link>
          <h1 className="text-lg font-semibold">{item.title}</h1>
        </div>
      </div>
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        {loading && (
          <div className="flex items-center gap-2 text-gray-500 text-sm">
            <span className="h-4 w-4 border-2 border-gray-300 border-t-transparent rounded-full animate-spin"></span>
            Loading…
          </div>
        )}
        {!loading && (
          <>
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="text-sm text-gray-700">{item.summary}</div>
              {item.reason && <div className="text-xs text-gray-500 mt-2">Why: {item.reason}</div>}
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="font-semibold mb-2">Actions</div>
              <ul className="list-disc pl-5 space-y-2 text-sm text-gray-800">
                {item.actions?.length ? item.actions.map((a:string, i:number)=>(<li key={i}>{a}</li>)) : <li>No actions yet.</li>}
              </ul>
            </div>
          </>
        )}
      </div>
    </div>
  )
}


