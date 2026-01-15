'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import PublicHeader from '@/components/marketing/PublicHeader'

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

type ListingItem = {
  id: string
  name: string
  slug: string
  children: { id: string; name: string; slug: string }[]
}

export default function PractitionerAZPage() {
  const [listings, setListings] = useState<ListingItem[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')

  useEffect(() => {
    const loadListings = async () => {
      setLoading(true)
      try {
        const res = await fetch('/api/practitioners/a-z', { cache: 'no-store' })
        const data = await res.json().catch(() => ({}))
        if (res.ok) {
          setListings(data?.results || [])
        }
      } finally {
        setLoading(false)
      }
    }

    loadListings()
  }, [])

  const filtered = useMemo(() => {
    const trimmed = query.trim().toLowerCase()
    if (!trimmed) return listings
    return listings
      .map((item) => {
        const matchesParent = item.name.toLowerCase().includes(trimmed)
        const matchingChildren = item.children.filter((child) => child.name.toLowerCase().includes(trimmed))
        if (matchesParent) {
          return item
        }
        if (matchingChildren.length) {
          return { ...item, children: matchingChildren }
        }
        return null
      })
      .filter(Boolean) as ListingItem[]
  }, [listings, query])

  const grouped = useMemo(() => {
    const map = new Map<string, ListingItem[]>()
    filtered.forEach((item) => {
      const first = item.name.trim().charAt(0).toUpperCase()
      const key = /^[A-Z]$/.test(first) ? first : '#'
      const bucket = map.get(key) || []
      bucket.push(item)
      map.set(key, bucket)
    })
    return map
  }, [filtered])

  return (
    <div className="min-h-screen bg-white">
      <PublicHeader />
      <main className="px-6 pb-16">
        <div className="max-w-6xl mx-auto">
          <section className="pt-10 pb-8">
            <p className="text-xs uppercase tracking-[0.35em] text-slate-400">Browse A-Z</p>
            <h1 className="text-4xl md:text-5xl font-bold text-slate-900 mt-3">Categories A to Z</h1>
            <p className="text-slate-600 mt-3 max-w-2xl">
              Scroll or tap a letter to jump straight to a category. Use search if you want to filter quickly.
            </p>
            <div className="mt-6 flex flex-col md:flex-row md:items-center gap-4">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="w-full md:max-w-md px-4 py-3 rounded-2xl border border-slate-200 text-slate-800 font-medium"
                placeholder="Search categories"
              />
              <Link
                href="/practitioners"
                className="inline-flex items-center justify-center px-4 py-2 rounded-2xl border border-slate-200 text-slate-700 font-semibold hover:border-emerald-200 hover:text-emerald-700 transition-colors"
              >
                Back to search
              </Link>
            </div>
          </section>

          <div className="flex flex-wrap gap-2 text-sm font-semibold text-slate-500 mb-8">
            {LETTERS.map((letter) => (
              <a
                key={letter}
                href={`#letter-${letter}`}
                className="px-3 py-1 rounded-full border border-slate-200 hover:border-emerald-200 hover:text-emerald-700 transition-colors"
              >
                {letter}
              </a>
            ))}
            <a
              href="#letter-#"
              className="px-3 py-1 rounded-full border border-slate-200 hover:border-emerald-200 hover:text-emerald-700 transition-colors"
            >
              #
            </a>
          </div>

          {loading && (
            <div className="bg-white rounded-2xl border border-slate-100 p-6 text-slate-600">
              Loading categories…
            </div>
          )}

          {!loading && filtered.length === 0 && (
            <div className="bg-white rounded-2xl border border-slate-100 p-6 text-slate-600">
              No categories match your search.
            </div>
          )}

          {!loading && filtered.length > 0 && (
            <div className="space-y-10">
              {[...LETTERS, '#'].map((letter) => {
                const items = grouped.get(letter)
                if (!items || items.length === 0) return null
                return (
                  <section key={letter} id={`letter-${letter}`} className="scroll-mt-24">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
                        {letter}
                      </div>
                      <h2 className="text-xl font-semibold text-slate-900">{letter}</h2>
                    </div>
                    <div className="grid gap-3">
                      {items.map((item) => (
                        <div key={item.id} className="border border-slate-100 rounded-2xl p-4 bg-white shadow-sm">
                          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                            <div>
                              <div className="text-lg font-semibold text-slate-900">{item.name}</div>
                              {item.children.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {item.children.map((child) => (
                                    <Link
                                      key={child.id}
                                      href={`/practitioners?categoryId=${encodeURIComponent(item.id)}&subcategoryId=${encodeURIComponent(child.id)}`}
                                      className="px-3 py-1 rounded-full border border-slate-200 text-xs font-semibold text-slate-600 hover:border-emerald-200 hover:text-emerald-700 transition-colors"
                                    >
                                      {child.name}
                                    </Link>
                                  ))}
                                </div>
                              )}
                            </div>
                            <Link
                              href={`/practitioners?categoryId=${encodeURIComponent(item.id)}`}
                              className="inline-flex items-center justify-center px-4 py-2 rounded-2xl border border-emerald-200 text-emerald-700 font-semibold hover:border-emerald-300 hover:text-emerald-800 transition-colors"
                            >
                              View category
                            </Link>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
