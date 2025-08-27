'use client'

import React, { useEffect, useState } from 'react'

type Row = { date: string; name: string; polarity: 'positive'|'negative'; value: number }

export default function CheckinHistoryPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [start, setStart] = useState<string>('')
  const [end, setEnd] = useState<string>('')

  const load = () => {
    const params = new URLSearchParams()
    if (start) params.set('start', start)
    if (end) params.set('end', end)
    fetch(`/api/checkins/history?${params.toString()}`)
      .then(r => r.json())
      .then((data) => setRows(Array.isArray(data?.history) ? data.history : []))
      .catch(() => {})
  }

  useEffect(() => { load() }, [])

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-sm p-6">
        <h1 className="text-2xl font-bold mb-4">Check‑in history</h1>
        <div className="text-xs text-gray-500 mb-3">Scale: 0 Really bad · 1 Bad · 2 Below average · 3 Average · 4 Above average · 5 Good · 6 Excellent</div>
        <div className="flex items-center gap-3 mb-4">
          <div>
            <label className="text-sm text-gray-600 mr-2">Start</label>
            <input type="date" value={start} onChange={(e)=>setStart(e.target.value)} className="border rounded px-2 py-1" />
          </div>
          <div>
            <label className="text-sm text-gray-600 mr-2">End</label>
            <input type="date" value={end} onChange={(e)=>setEnd(e.target.value)} className="border rounded px-2 py-1" />
          </div>
          <button onClick={load} className="bg-helfi-green text-white px-3 py-2 rounded">Apply</button>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2 pr-4">Date</th>
                <th className="py-2 pr-4">Issue</th>
                <th className="py-2 pr-4">Rating</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const labels = ['Really bad','Bad','Below average','Average','Above average','Good','Excellent'] as const
                const label = (r.value === null || r.value === undefined) ? 'N/A' : labels[Math.max(0, Math.min(6, r.value))]
                const color = r.value === null || r.value === undefined ? 'bg-gray-100 text-gray-600 border-gray-200' :
                  r.value <= 1 ? 'bg-red-100 text-red-700 border-red-200' :
                  r.value <= 3 ? 'bg-yellow-100 text-yellow-800 border-yellow-200' :
                  'bg-green-100 text-green-700 border-green-200'
                return (
                <tr key={i} className="border-b last:border-0">
                  <td className="py-2 pr-4 whitespace-nowrap">{r.date}</td>
                  <td className="py-2 pr-4">{r.name}</td>
                  <td className="py-2 pr-4">
                    <span className={`inline-flex items-center gap-2 px-2 py-1 rounded-lg text-xs border ${color}`}>
                      <span>{label}</span>
                      {r.value !== null && r.value !== undefined && (
                        <span className="text-[10px] text-gray-500">({r.value})</span>
                      )}
                    </span>
                  </td>
                </tr>
              )})}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-6 text-center text-gray-500">No ratings yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}


