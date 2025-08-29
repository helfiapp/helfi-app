'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'

export default function SupplementDetail() {
  const { name } = useParams() as { name?: string }
  const [data, setData] = useState<any | null>(null)
  const [loading, setLoading] = useState<boolean>(true)

  useEffect(() => {
    async function load() {
      try {
        setLoading(true)
        const ud = await fetch('/api/user-data', { cache: 'no-cache' }).then(r=>r.json()).catch(()=>({}))
        const list = Array.isArray(ud?.data?.supplements) ? ud.data.supplements : []
        const found = list.find((s: any) => (s.name || '').toLowerCase() === String(name||'').toLowerCase())
        const detail = await fetch(`/api/insights/detail?supplement=${encodeURIComponent(String(name||''))}`, { cache: 'no-cache' }).then(r=>r.json()).catch(()=>({}))
        const d = detail?.data || {}
        setData({ ...found, name: found?.name || decodeURIComponent(String(name||'')), what: d.what, reason: d.reason, actions: d.actions, timing: d.timing, safety: d.safety })
      } finally { setLoading(false) }
    }
    load()
  }, [name])

  if (!data) return null

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <Link href="/insights/supplements" className="text-helfi-green">← Back</Link>
          <h1 className="text-lg font-semibold">{data.name}</h1>
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
              <div className="text-sm text-gray-700">{data.what || 'Recommendations for this supplement.'}</div>
              {data.reason && <div className="text-xs text-gray-500 mt-2">Why: {data.reason}</div>}
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="text-sm text-gray-700">Timing: {Array.isArray(data.timing) ? data.timing.join(', ') : (data.timing || 'not set')}</div>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="font-semibold mb-2">Actions</div>
              <ul className="list-disc pl-5 space-y-2 text-sm text-gray-800">
                {Array.isArray(data.actions) && data.actions.length ? data.actions.map((a:string,i:number)=>(<li key={i}>{a}</li>)) : <li>No actions yet.</li>}
              </ul>
              {data.safety && <div className="text-xs text-gray-500 mt-2">Safety: {data.safety}</div>}
            </div>
          </>
        )}
      </div>
    </div>
  )
}


