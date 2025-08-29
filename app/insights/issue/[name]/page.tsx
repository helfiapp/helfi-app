'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useSearchParams } from 'next/navigation'

export default function IssueDetail() {
  const { name } = useParams() as { name?: string }
  const search = useSearchParams()
  const tab = search.get('tab') || 'overview'
  const [item, setItem] = useState<any | null>(null)

  useEffect(() => {
    async function load() {
      // Use the generic insights list as seed; later this can call a dedicated API
      const res = await fetch('/api/insights/list?preview=1', { cache: 'no-cache' })
      const data = await res.json().catch(() => ({}))
      const fallback = {
        id: `issue:${name}`,
        title: String(name || '').replace(/%20/g,' '),
        summary: tab === 'nutrition' ? 'Nutrition guidance for this issue.' : 'Recommendations for this issue.'
      }
      setItem(fallback)
    }
    load()
  }, [name, tab])

  if (!item) return null

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <Link href="/insights" className="text-helfi-green">‹ Back</Link>
          <h1 className="text-lg font-semibold">{item.title}</h1>
        </div>
      </div>
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-sm text-gray-700">{item.summary}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="font-semibold mb-2">Actions</div>
          <ul className="list-disc pl-5 space-y-2 text-sm text-gray-800">
            <li>Personalized actions will appear here based on your data.</li>
            <li>We’ll add timing and safety notes next.</li>
          </ul>
        </div>
      </div>
    </div>
  )
}


