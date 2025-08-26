'use client'

import React, { useEffect, useState } from 'react'

type Row = { date: string; name: string; polarity: 'positive'|'negative'; value: number }

export default function CheckinHistoryPage() {
  const [rows, setRows] = useState<Row[]>([])

  useEffect(() => {
    fetch('/api/checkins/history').then(r => r.json()).then((data) => {
      setRows(Array.isArray(data?.history) ? data.history : [])
    }).catch(() => {})
  }, [])

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-sm p-6">
        <h1 className="text-2xl font-bold mb-4">Check‑in history</h1>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2 pr-4">Date</th>
                <th className="py-2 pr-4">Issue</th>
                <th className="py-2 pr-4">Rating (0–6)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="py-2 pr-4 whitespace-nowrap">{r.date}</td>
                  <td className="py-2 pr-4">{r.name}</td>
                  <td className="py-2 pr-4">{r.value}</td>
                </tr>
              ))}
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


