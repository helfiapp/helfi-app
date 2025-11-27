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
  const [range, setRange] = useState<'daily'|'weekly'|'custom'>('daily')
  const [from, setFrom] = useState<string>('')
  const [to, setTo] = useState<string>('')
  const [lastUpdated, setLastUpdated] = useState<string>('')
  const [items, setItems] = useState<any[]>([])
  const [generating, setGenerating] = useState<boolean>(false)

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
        setLastUpdated(new Date().toLocaleTimeString())
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
        {/* Report options */}
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="font-semibold mb-2">Generate report</div>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <button onClick={()=>setRange('daily')} className={`px-3 py-1.5 rounded-md text-sm border ${range==='daily'?'bg-helfi-green text-white border-helfi-green':'bg-white text-gray-800 border-gray-200'}`}>Daily</button>
            <button onClick={()=>setRange('weekly')} className={`px-3 py-1.5 rounded-md text-sm border ${range==='weekly'?'bg-helfi-green text-white border-helfi-green':'bg-white text-gray-800 border-gray-200'}`}>Weekly</button>
            <button onClick={()=>setRange('custom')} className={`px-3 py-1.5 rounded-md text-sm border ${range==='custom'?'bg-helfi-green text-white border-helfi-green':'bg-white text-gray-800 border-gray-200'}`}>Custom</button>
          </div>
          {range==='custom' && (
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <input type="date" value={from} onChange={(e)=>setFrom(e.target.value)} className="border border-gray-300 rounded-md px-2 py-1 text-sm"/>
              <span className="text-gray-500 text-sm">to</span>
              <input type="date" value={to} onChange={(e)=>setTo(e.target.value)} className="border border-gray-300 rounded-md px-2 py-1 text-sm"/>
            </div>
          )}
          <div className="flex items-center gap-2">
            <button onClick={async()=>{ 
              try {
                setGenerating(true)
                // Kick off generation (preview uses cached pipeline and avoids cost if disabled)
                await fetch('/api/insights/generate?preview=1', { method: 'POST' }).catch(()=>{})
                // Load the latest list immediately after
                const res = await fetch('/api/insights/list?preview=1', { cache: 'no-cache' })
                const js = await res.json().catch(()=>({}))
                const arr: any[] = Array.isArray(js?.items) ? js.items : []
                setItems(arr)
                setLastUpdated(new Date().toLocaleTimeString())
              } finally {
                setGenerating(false)
              }
            }} className="px-3 py-2 bg-helfi-green text-white rounded-md text-sm disabled:opacity-50" disabled={generating}>{generating ? 'Generating…' : 'Generate'}</button>
            {lastUpdated && <div className="text-xs text-gray-500">Last updated: {lastUpdated}</div>}
          </div>
        </div>

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

            {/* Render generated insights list */}
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="font-semibold mb-2">Report</div>
              {items.length === 0 ? (
                <div className="text-sm text-gray-600">No report yet. Tap Generate above.</div>
              ) : (
                <div className="space-y-4">
                  {items.map((it:any)=> (
                    <div key={it.id} className="border border-gray-200 rounded-lg p-3">
                      <div className="text-xs text-gray-500 mb-1">{Array.isArray(it.tags) ? it.tags.slice(0,3).join(' • ') : ''}</div>
                      <div className="font-semibold text-gray-900 mb-1">{it.title}</div>
                      <div className="text-sm text-gray-700 mb-2">{it.summary}</div>
                      {it.reason && <div className="text-xs text-gray-500 mb-2">Why: {it.reason}</div>}
                      {Array.isArray(it.actions) && it.actions.length > 0 && (
                        <ul className="list-disc pl-5 space-y-1 text-sm text-gray-800">
                          {it.actions.slice(0,5).map((a:string, idx:number)=>(<li key={idx}>{a}</li>))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}


