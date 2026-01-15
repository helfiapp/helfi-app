'use client'

import React, { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import PublicHeader from '@/components/marketing/PublicHeader'

const DirectoryMap = dynamic(() => import('@/components/practitioner/DirectoryMap'), { ssr: false })

type CategoryNode = {
  id: string
  name: string
  slug: string
  children?: CategoryNode[]
}

type SearchResult = {
  id: string
  displayName: string
  slug: string
  categoryName: string | null
  subcategoryName: string | null
  description: string | null
  phone: string | null
  websiteUrl: string | null
  emailPublic: string | null
  lat: number | null
  lng: number | null
  serviceType: string
  distanceKm: number | null
  isBoosted: boolean
  isTopBoost: boolean
}

type LocationResult = {
  lat: number
  lng: number
  displayName: string
  city?: string
  state?: string
  country?: string
  postcode?: string
}

type QuickAccess = {
  label: string
  category: string
  subcategory?: string
}

const QUICK_ACCESS: QuickAccess[] = [
  { label: 'Chiropractic', category: 'Allied Health', subcategory: 'Chiropractor' },
  { label: 'Mental Health', category: 'Mental Health' },
  { label: 'Dental Care', category: 'Dental & Oral Health', subcategory: 'Dentist' },
  { label: 'Cardiology', category: 'GPs & Doctors', subcategory: 'Cardiologist' },
  { label: 'Pediatrics', category: 'GPs & Doctors', subcategory: 'Paediatrician' },
  { label: 'Physiotherapy', category: 'Allied Health', subcategory: 'Physiotherapist' },
  { label: 'Dermatology', category: 'GPs & Doctors', subcategory: 'Dermatologist' },
  { label: 'Optometry', category: 'Eye & Hearing', subcategory: 'Optometrist' },
  { label: 'Podiatry', category: 'Allied Health', subcategory: 'Podiatrist' },
  { label: 'Nutritionist', category: 'Nutrition & Metabolic Health', subcategory: 'Clinical Nutritionist' },
  { label: 'Acupuncture', category: 'Holistic & Integrative', subcategory: 'Acupuncturist' },
  { label: 'Occupational Therapy', category: 'Allied Health', subcategory: 'Occupational Therapist (OT)' },
  { label: 'Speech Pathology', category: 'Allied Health', subcategory: 'Speech Pathologist' },
  { label: 'ENT Specialist', category: 'GPs & Doctors', subcategory: 'ENT Specialist' },
  { label: 'Orthopedics', category: 'Musculoskeletal & Pain' },
  { label: 'Psychology', category: 'Mental Health', subcategory: 'Psychologist' },
  { label: 'General Practitioner', category: 'GPs & Doctors', subcategory: 'General Practitioner (GP)' },
  { label: 'Urology', category: 'GPs & Doctors', subcategory: 'Urologist' },
]

export default function PractitionerDirectoryPage() {
  const [categories, setCategories] = useState<CategoryNode[]>([])
  const [categoryId, setCategoryId] = useState('')
  const [subcategoryId, setSubcategoryId] = useState('')
  const [query, setQuery] = useState('')
  const [locationQuery, setLocationQuery] = useState('')
  const [locationResults, setLocationResults] = useState<LocationResult[]>([])
  const [selectedLocation, setSelectedLocation] = useState<LocationResult | null>(null)
  const [radiusKm, setRadiusKm] = useState(10)
  const [telehealthOnly, setTelehealthOnly] = useState(false)
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const subcategoryRef = useRef<HTMLSelectElement | null>(null)

  const persistLocation = (location: LocationResult) => {
    try {
      localStorage.setItem('helfi:practitionerLocation', JSON.stringify(location))
    } catch {
      // Ignore storage errors
    }
  }

  const geoKey = useMemo(() => {
    if (!selectedLocation) return ''
    const country = String(selectedLocation.country || '').trim().toLowerCase()
    return country ? country : ''
  }, [selectedLocation])

  const subcategories = useMemo(() => {
    const parent = categories.find((cat) => cat.id === categoryId)
    return parent?.children || []
  }, [categories, categoryId])

  const loadCategories = async () => {
    try {
      const res = await fetch('/api/practitioners/categories', { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Failed to load categories')
      setCategories(data?.categories || [])
    } catch (err: any) {
      console.error(err)
    }
  }

  React.useEffect(() => {
    loadCategories()
  }, [])

  React.useEffect(() => {
    try {
      const saved = localStorage.getItem('helfi:practitionerLocation')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed?.lat && parsed?.lng) {
          setSelectedLocation(parsed)
          setLocationQuery(parsed.displayName || '')
        }
      }
    } catch {
      // Ignore storage errors
    }
  }, [])

  const handleLocationSearch = async () => {
    if (!locationQuery.trim()) return
    setError(null)
    try {
      const res = await fetch(`/api/practitioners/geocode?q=${encodeURIComponent(locationQuery.trim())}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Location lookup failed')
      const mapped = (data?.results || []).map((item: any) => {
        const address = item.address || {}
        return {
          lat: Number(item.lat),
          lng: Number(item.lon),
          displayName: item.display_name,
          city: address.city || address.town || address.village || address.suburb,
          state: address.state,
          country: address.country,
          postcode: address.postcode,
        }
      })
      setLocationResults(mapped)
    } catch (err: any) {
      setError(err?.message || 'Location lookup failed')
    }
  }

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      alert('Location is not available in this browser.')
      return
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude
        const lng = pos.coords.longitude
        try {
          const res = await fetch(`/api/practitioners/reverse-geocode?lat=${lat}&lng=${lng}`)
          const data = await res.json().catch(() => ({}))
          const address = data?.result?.address || {}
          const location: LocationResult = {
            lat,
            lng,
            displayName: data?.result?.display_name || 'Current location',
            city: address.city || address.town || address.village || address.suburb,
            state: address.state,
            country: address.country,
            postcode: address.postcode,
          }
          setSelectedLocation(location)
          setLocationQuery(location.displayName)
          setLocationResults([])
          persistLocation(location)
        } catch {
          const location: LocationResult = {
            lat,
            lng,
            displayName: 'Current location',
          }
          setSelectedLocation(location)
          setLocationQuery(location.displayName)
          setLocationResults([])
          persistLocation(location)
        }
      },
      () => alert('We could not access your location. Please enter it manually.')
    )
  }

  const handleSearch = async (overrides?: { categoryId?: string; subcategoryId?: string; query?: string }) => {
    setLoading(true)
    setError(null)
    try {
      const effectiveCategoryId = overrides?.categoryId ?? categoryId
      const effectiveSubcategoryId = overrides?.subcategoryId ?? subcategoryId
      const effectiveQuery = overrides?.query ?? query
      const params = new URLSearchParams()
      if (effectiveCategoryId) params.set('categoryId', effectiveCategoryId)
      if (effectiveSubcategoryId) params.set('subcategoryId', effectiveSubcategoryId)
      if (effectiveQuery.trim()) params.set('q', effectiveQuery.trim())
      if (selectedLocation) {
        params.set('lat', String(selectedLocation.lat))
        params.set('lng', String(selectedLocation.lng))
      }
      params.set('radiusKm', String(radiusKm))
      params.set('telehealth', telehealthOnly ? 'true' : 'false')
      if (geoKey) params.set('geoKey', geoKey)

      const res = await fetch(`/api/practitioners/search?${params.toString()}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Search failed')
      setResults(data?.results || [])
    } catch (err: any) {
      setError(err?.message || 'Search failed')
    } finally {
      setLoading(false)
    }
  }

  const handleQuickAccess = (item: QuickAccess) => {
    const category = categories.find((cat) => cat.name === item.category)
    if (!category) {
      setQuery(item.label)
      handleSearch({ query: item.label })
      return
    }
    setCategoryId(category.id)
    if (item.subcategory) {
      const subcategory = category.children?.find((child) => child.name === item.subcategory)
      setSubcategoryId(subcategory?.id || '')
      handleSearch({ categoryId: category.id, subcategoryId: subcategory?.id || '' })
    } else {
      setSubcategoryId('')
      handleSearch({ categoryId: category.id, subcategoryId: '' })
    }
  }

  const markers = useMemo(() => {
    return results
      .filter((item) => item.lat != null && item.lng != null)
      .map((item) => ({
        id: item.id,
        name: item.displayName,
        lat: item.lat as number,
        lng: item.lng as number,
        isBoosted: item.isBoosted,
      }))
  }, [results])

  const center = selectedLocation
    ? { lat: selectedLocation.lat, lng: selectedLocation.lng }
    : markers.length
      ? { lat: markers[0].lat, lng: markers[0].lng }
      : { lat: -37.8136, lng: 144.9631 }

  const quickRows = [QUICK_ACCESS.slice(0, 6), QUICK_ACCESS.slice(6, 12), QUICK_ACCESS.slice(12, 18)]

  return (
    <div className="min-h-screen bg-white">
      <PublicHeader />
      <section className="relative bg-white pt-20 pb-20 overflow-hidden">
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-emerald-100/50 rounded-full blur-3xl -z-10" />
        <div className="absolute top-1/2 -right-24 w-80 h-80 bg-blue-50/70 rounded-full blur-3xl -z-10" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="text-center max-w-4xl mx-auto mb-12">
            <h1 className="text-4xl md:text-6xl font-bold text-slate-900 mb-6 leading-tight">
              Your health, <span className="text-emerald-600">simplified</span> and within reach.
            </h1>
            <p className="text-lg md:text-xl text-slate-600 mb-8 px-4 leading-relaxed">
              Discover trusted healthcare practitioners. Search by name, location, or category to find the right care.
            </p>
            <div className="flex justify-center mb-6">
              <Link
                className="flex items-center gap-2 text-emerald-700 font-semibold hover:underline text-base"
                href="/practitioners/a-z"
              >
                Browse Practitioners A-Z
                <span className="text-sm">→</span>
              </Link>
            </div>
          </div>

          <div className="max-w-6xl mx-auto relative z-30">
            <div className="bg-white p-2 rounded-3xl shadow-[0_30px_100px_-20px_rgba(0,0,0,0.12)] border border-slate-100">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                <div className="flex items-center px-5 py-4 bg-slate-50/60 rounded-2xl">
                  <div className="flex flex-col text-left w-full relative">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Practitioner</span>
                    <select
                      value={categoryId}
                      onChange={(event) => {
                        setCategoryId(event.target.value)
                        setSubcategoryId('')
                        setTimeout(() => {
                          subcategoryRef.current?.focus()
                        }, 0)
                      }}
                      className="bg-transparent border-none p-0 text-base font-semibold focus:ring-0 w-full cursor-pointer appearance-none pr-6 text-slate-900"
                    >
                      <option value="">All categories</option>
                      {categories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className={`flex items-center px-5 py-4 rounded-2xl ${categoryId ? 'bg-slate-50/60' : 'bg-slate-50/30 text-slate-400'}`}>
                  <div className="flex flex-col text-left w-full relative">
                    <span className="text-[10px] font-bold uppercase tracking-widest mb-1">Subcategory</span>
                    <select
                      value={subcategoryId}
                      onChange={(event) => setSubcategoryId(event.target.value)}
                      ref={subcategoryRef}
                      className="bg-transparent border-none p-0 text-base font-semibold focus:ring-0 w-full cursor-pointer appearance-none pr-6"
                      disabled={!categoryId}
                    >
                      <option value="">Select a specialty</option>
                      {subcategories.map((subcategory) => (
                        <option key={subcategory.id} value={subcategory.id}>
                          {subcategory.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex items-center px-5 py-4 bg-slate-50/60 rounded-2xl">
                  <div className="flex flex-col text-left w-full">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Search</span>
                    <input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      className="bg-transparent border-none p-0 text-base font-semibold focus:ring-0 w-full placeholder-slate-400"
                      placeholder="Name, symptom, or service"
                    />
                  </div>
                </div>

                <div className="flex items-center px-5 py-4 bg-slate-50/60 rounded-2xl">
                  <div className="flex flex-col text-left w-full">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Location</span>
                    <div className="flex items-center gap-2">
                      <input
                        value={locationQuery}
                        onChange={(event) => setLocationQuery(event.target.value)}
                        className="bg-transparent border-none p-0 text-base font-semibold focus:ring-0 w-full placeholder-slate-400"
                        placeholder="City or suburb"
                      />
                      <button
                        onClick={handleLocationSearch}
                        className="text-xs font-semibold text-slate-600 hover:text-emerald-700"
                      >
                        Find
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {locationResults.length > 0 && (
                <div className="mt-3 border border-slate-200 rounded-2xl bg-white shadow-sm max-h-56 overflow-y-auto text-sm">
                  {locationResults.map((item) => (
                    <button
                      key={item.displayName}
                      onClick={() => {
                        setSelectedLocation(item)
                        setLocationQuery(item.displayName)
                        setLocationResults([])
                        persistLocation(item)
                      }}
                      className="w-full text-left px-4 py-2 hover:bg-slate-50"
                    >
                      {item.displayName}
                    </button>
                  ))}
                </div>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-4 px-2">
                <button
                  onClick={handleUseMyLocation}
                  className="text-xs font-semibold text-emerald-700 hover:underline"
                >
                  Use my current location
                </button>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Radius</span>
                  <select
                    value={radiusKm}
                    onChange={(event) => setRadiusKm(Number(event.target.value))}
                    className="border border-slate-200 rounded-xl px-3 py-2 text-sm font-semibold"
                  >
                    <option value={5}>5 km</option>
                    <option value={10}>10 km</option>
                    <option value={25}>25 km</option>
                    <option value={50}>50 km</option>
                  </select>
                </div>
                <label className="flex items-center gap-2 text-sm text-slate-700 font-medium">
                  <input
                    type="checkbox"
                    checked={telehealthOnly}
                    onChange={(event) => setTelehealthOnly(event.target.checked)}
                    className="h-4 w-4 text-emerald-600 border-slate-300 rounded"
                  />
                  Telehealth only
                </label>
                <button
                  onClick={() => handleSearch()}
                  className="ml-auto bg-emerald-600 text-white px-6 py-3 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 hover:brightness-105 active:scale-[0.98] transition-all"
                >
                  {loading ? 'Searching…' : 'Search now'}
                </button>
              </div>
            </div>
          </div>

          <div className="mt-12">
            <div className="flex items-center justify-between mb-4 px-2">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em]">Quick Access Categories</span>
            </div>
            <div className="space-y-3">
              {quickRows.map((row, index) => (
                <div key={`row-${index}`} className="flex overflow-x-auto gap-3 pb-1 px-2">
                  {row.map((item) => (
                    <button
                      key={item.label}
                      onClick={() => handleQuickAccess(item)}
                      className="flex-none bg-white py-2.5 px-5 rounded-2xl text-center shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all border border-slate-100 font-semibold text-sm text-slate-700"
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 pb-16">
        <div className="max-w-6xl mx-auto">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-2xl mb-6">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-6">
            <div className="space-y-4">
              {loading && (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 text-sm text-slate-600">
                  Loading results…
                </div>
              )}
              {!loading && results.length === 0 && (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 text-sm text-slate-600">
                  No results yet. Try a different search, category, or radius.
                </div>
              )}
              {!loading && results.map((item) => (
                <div key={item.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-lg font-semibold text-slate-900">{item.displayName}</h3>
                    {item.isTopBoost && (
                      <span className="px-2 py-1 text-xs font-semibold bg-emerald-100 text-emerald-700 rounded-full">Top boost</span>
                    )}
                    {item.isBoosted && !item.isTopBoost && (
                      <span className="px-2 py-1 text-xs font-semibold bg-emerald-50 text-emerald-700 rounded-full">Boosted</span>
                    )}
                  </div>
                  <div className="text-sm text-slate-600">
                    {item.categoryName}
                    {item.subcategoryName ? ` · ${item.subcategoryName}` : ''}
                  </div>
                  {item.distanceKm !== null && (
                    <div className="text-sm text-slate-500">{item.distanceKm.toFixed(1)} km away</div>
                  )}
                  {item.description && <p className="text-sm text-slate-600">{item.description}</p>}
                  <div className="flex flex-wrap gap-3 text-sm text-emerald-700">
                    <Link href={`/practitioners/${item.slug}`} className="hover:underline">View profile</Link>
                    {item.phone && <a href={`tel:${item.phone}`} className="hover:underline">Call</a>}
                    {item.websiteUrl && (
                      <a href={item.websiteUrl} target="_blank" rel="noreferrer" className="hover:underline">
                        Website
                      </a>
                    )}
                    {item.emailPublic && <a href={`mailto:${item.emailPublic}`} className="hover:underline">Email</a>}
                  </div>
                </div>
              ))}
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 min-h-[420px]">
              <div className="text-sm font-semibold text-slate-700 mb-3">Map view</div>
              <div className="h-[520px]">
                <DirectoryMap center={center} radiusKm={radiusKm} markers={markers} />
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
