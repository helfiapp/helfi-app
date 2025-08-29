'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'

export default function SupplementDetail() {
  const { name } = useParams() as { name?: string }
  const [data, setData] = useState<any | null>(null)

  useEffect(() => {
    async function load() {
      const ud = await fetch('/api/user-data', { cache: 'no-cache' }).then(r=>r.json()).catch(()=>({}))
      const list = Array.isArray(ud?.data?.supplements) ? ud.data.supplements : []
      const found = list.find((s: any) => (s.name || '').toLowerCase() === String(name||'').toLowerCase())
      setData(found || { name: decodeURIComponent(String(name||'')) })
    }
    load()
  }, [name])

  if (!data) return null

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <Link href="/insights/supplements" className="text-helfi-green">‹ Back</Link>
          <h1 className="text-lg font-semibold">{data.name}</h1>
        </div>
      </div>
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-sm text-gray-700">Timing: {Array.isArray(data.timing) ? data.timing.join(', ') : (data.timing || 'not set')}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="font-semibold mb-2">Fit for your goals</div>
          <ul className="list-disc pl-5 space-y-2 text-sm text-gray-800">
            <li>We will generate guidance here (take/avoid, best timing, dosage hints).</li>
          </ul>
        </div>
      </div>
    </div>
  )
}


