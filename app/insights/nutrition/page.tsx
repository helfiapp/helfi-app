'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'

export default function NutritionInsights() {
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState<boolean>(true)

  async function load() {
    try {
      setLoading(true)
      const issuesRes = await fetch('/api/checkins/issues', { cache: 'no-cache' })
      const issuesData = await issuesRes.json().catch(()=>({}))
      const issueNames: string[] = Array.isArray(issuesData?.issues) ? issuesData.issues.map((i:any)=>i.name).filter(Boolean) : []
      if (issueNames.length) {
        setItems(issueNames.map((g) => ({ id: `nutrition:${g}`, title: g, summary: 'Open nutrition details', tags: ['nutrition'] })))
      } else {
        const ud = await fetch('/api/user-data', { cache: 'no-cache' }).then(r=>r.json())
        const goals: string[] = Array.isArray(ud?.data?.goals) ? ud.data.goals : []
        setItems(goals.map((g) => ({ id: `nutrition:${g}`, title: g, summary: 'Open nutrition details', tags: ['nutrition'] })))
      }
    } catch { setItems([]) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <Link href="/insights" className="text-helfi-green">‹ Back</Link>
          <h1 className="text-lg font-semibold">Nutrition</h1>
        </div>
      </div>
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        <div className="flex items-center justify-between mb-2">
          <Link href="/insights" className="text-helfi-green text-lg">← Back</Link>
          <button onClick={async()=>{ fetch('/api/insights/generate?preview=1', { method: 'POST' }).catch(()=>{}); await load() }} className="px-3 py-2 bg-helfi-green text-white rounded-md text-sm">Refresh</button>
        </div>
        {loading && (
          <div className="flex items-center gap-2 text-gray-500 text-sm">
            <span className="h-4 w-4 border-2 border-gray-300 border-t-transparent rounded-full animate-spin"></span>
            Loading…
          </div>
        )}
        {!loading && items.map((it) => (
          <Link href={String(it.id).startsWith('nutrition:') ? `/insights/issue/${encodeURIComponent(it.title)}?tab=nutrition` : `/insights/${encodeURIComponent(it.id)}`} key={it.id} className="bg-white border border-gray-200 rounded-lg p-4 block">
            <div className="font-semibold text-gray-900 mb-1">{it.title}</div>
            <div className="text-sm text-gray-700">{it.summary}</div>
          </Link>
        ))}
        {!loading && items.length === 0 && (
          <div className="text-sm text-gray-600">No goals found in your profile yet.</div>
        )}
      </div>
    </div>
  )
}


