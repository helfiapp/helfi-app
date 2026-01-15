'use client'

import React, { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import PublicHeader from '@/components/marketing/PublicHeader'
import MaterialSymbol from '@/components/MaterialSymbol'
import { PRACTITIONER_SYMPTOM_HINTS } from '@/data/practitioner-symptoms'

const DirectoryMap = dynamic(() => import('@/components/practitioner/DirectoryMap'), { ssr: false })

type CategoryNode = {
  id: string
  name: string
  slug: string
  synonyms?: string[]
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
  addressLine1: string | null
  suburbCity: string | null
  stateRegion: string | null
  country: string | null
  lat: number | null
  lng: number | null
  serviceType: string
  distanceKm: number | null
  isBoosted: boolean
  isTopBoost: boolean
  trackingToken?: string | null
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
  icon: string
  tone: string
}

type CategoryMatch = {
  id: string
  label: string
  categoryId: string
  subcategoryId?: string
  parentLabel?: string
}

const QUICK_ACCESS: QuickAccess[] = [
  { label: 'Chiropractic', category: 'Allied Health', subcategory: 'Chiropractor', icon: 'self_improvement', tone: 'text-blue-500' },
  { label: 'Mental Health', category: 'Mental Health', icon: 'psychology', tone: 'text-teal-500' },
  { label: 'Dental Care', category: 'Dental & Oral Health', subcategory: 'Dentist', icon: 'dentistry', tone: 'text-orange-500' },
  { label: 'Cardiology', category: 'GPs & Doctors', subcategory: 'Cardiologist', icon: 'favorite', tone: 'text-red-500' },
  { label: 'Pediatrics', category: 'GPs & Doctors', subcategory: 'Paediatrician', icon: 'child_care', tone: 'text-indigo-500' },
  { label: 'Physiotherapy', category: 'Allied Health', subcategory: 'Physiotherapist', icon: 'fitness_center', tone: 'text-emerald-600' },
  { label: 'Dermatology', category: 'GPs & Doctors', subcategory: 'Dermatologist', icon: 'clear_all', tone: 'text-pink-500' },
  { label: 'Optometry', category: 'Eye & Hearing', subcategory: 'Optometrist', icon: 'visibility', tone: 'text-cyan-500' },
  { label: 'Podiatry', category: 'Allied Health', subcategory: 'Podiatrist', icon: 'footprint', tone: 'text-amber-700' },
  { label: 'Nutritionist', category: 'Nutrition & Metabolic Health', subcategory: 'Clinical Nutritionist', icon: 'nutrition', tone: 'text-green-600' },
  { label: 'Acupuncture', category: 'Holistic & Integrative', subcategory: 'Acupuncturist', icon: 'medical_services', tone: 'text-purple-500' },
  { label: 'Occupational Therapy', category: 'Allied Health', subcategory: 'Occupational Therapist (OT)', icon: 'work', tone: 'text-blue-400' },
  { label: 'Speech Pathology', category: 'Allied Health', subcategory: 'Speech Pathologist', icon: 'record_voice_over', tone: 'text-rose-400' },
  { label: 'ENT Specialist', category: 'GPs & Doctors', subcategory: 'ENT Specialist', icon: 'hearing', tone: 'text-yellow-600' },
  { label: 'Orthopedics', category: 'Musculoskeletal & Pain', icon: 'accessibility_new', tone: 'text-slate-500' },
  { label: 'Psychology', category: 'Mental Health', subcategory: 'Psychologist', icon: 'psychology_alt', tone: 'text-violet-500' },
  { label: 'General Practitioner', category: 'GPs & Doctors', subcategory: 'General Practitioner (GP)', icon: 'stethoscope', tone: 'text-emerald-700' },
  { label: 'Urology', category: 'GPs & Doctors', subcategory: 'Urologist', icon: 'water_drop', tone: 'text-blue-700' },
]

const SYMPTOM_CATEGORY_HINTS = PRACTITIONER_SYMPTOM_HINTS

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
  const [pendingScroll, setPendingScroll] = useState(false)
  const subcategoryRef = useRef<HTMLSelectElement | null>(null)
  const resultsRef = useRef<HTMLDivElement | null>(null)

  const isValidEmail = (value: string | null | undefined) => {
    if (!value) return false
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
  }

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

  const categoryMatches = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return []
    const matches: CategoryMatch[] = []
    categories.forEach((category) => {
      const categoryName = category.name.toLowerCase()
      const categorySynonyms = category.synonyms || []
      const categoryMatch = categoryName.includes(normalizedQuery) || categorySynonyms.some((syn) => syn.toLowerCase().includes(normalizedQuery))
      if (categoryMatch) {
        matches.push({
          id: `category-${category.id}`,
          label: category.name,
          categoryId: category.id,
        })
      }
      category.children?.forEach((child) => {
        const childName = child.name.toLowerCase()
        const childSynonyms = child.synonyms || []
        const childMatch = childName.includes(normalizedQuery) || childSynonyms.some((syn) => syn.toLowerCase().includes(normalizedQuery))
        if (childMatch) {
          matches.push({
            id: `subcategory-${child.id}`,
            label: child.name,
            categoryId: category.id,
            subcategoryId: child.id,
            parentLabel: category.name,
          })
        }
      })
    })
    return matches.slice(0, 10)
  }, [categories, query])

  const symptomMatches = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery || normalizedQuery.length < 3) return []
    const matches: CategoryMatch[] = []
    const categoryLookup = new Map<string, CategoryNode>()
    categories.forEach((category) => {
      categoryLookup.set(category.name.toLowerCase(), category)
    })

    SYMPTOM_CATEGORY_HINTS.forEach((hint) => {
      const matched = hint.terms.some((term) => {
        const normalizedTerm = term.toLowerCase()
        return normalizedTerm.includes(normalizedQuery) || normalizedQuery.includes(normalizedTerm)
      })
      if (!matched) return
      const category = categoryLookup.get(hint.category.toLowerCase())
      if (!category) return
      let subcategoryId: string | undefined
      let parentLabel: string | undefined
      if (hint.subcategory) {
        const child = category.children?.find((item) => item.name.toLowerCase() === hint.subcategory?.toLowerCase())
        if (child) {
          subcategoryId = child.id
          parentLabel = category.name
        }
      }
      matches.push({
        id: `symptom-${category.id}-${subcategoryId || 'all'}`,
        label: hint.subcategory || category.name,
        categoryId: category.id,
        subcategoryId,
        parentLabel,
      })
    })

    return matches
  }, [categories, query])

  const suggestedMatches = useMemo(() => {
    const merged: CategoryMatch[] = []
    const seen = new Set<string>()
    const addMatch = (match: CategoryMatch) => {
      const key = `${match.categoryId}:${match.subcategoryId || ''}`
      if (seen.has(key)) return
      seen.add(key)
      merged.push(match)
    }
    categoryMatches.forEach(addMatch)
    symptomMatches.forEach(addMatch)
    return merged.slice(0, 10)
  }, [categoryMatches, symptomMatches])

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

  React.useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const categoryParam = params.get('categoryId') || ''
    const subcategoryParam = params.get('subcategoryId') || ''
    const queryParam = params.get('q') || ''

    if (categoryParam || subcategoryParam || queryParam) {
      setCategoryId(categoryParam)
      setSubcategoryId(subcategoryParam)
      setQuery(queryParam)
      setResults([])
      setError(null)
      return
    }

    let isReload = false
    try {
      const navigationEntry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
      isReload = navigationEntry?.type === 'reload' || (performance as any)?.navigation?.type === 1
    } catch {
      isReload = false
    }

    if (isReload) {
      try {
        sessionStorage.removeItem('helfi:practitionerSearchState')
      } catch {
        // Ignore storage errors
      }
      return
    }

    try {
      const saved = sessionStorage.getItem('helfi:practitionerSearchState')
      if (!saved) return
      const parsed = JSON.parse(saved)
      if (!parsed || !parsed.results) return
      setCategoryId(parsed.categoryId || '')
      setSubcategoryId(parsed.subcategoryId || '')
      setQuery(parsed.query || '')
      setLocationQuery(parsed.locationQuery || '')
      setSelectedLocation(parsed.selectedLocation || null)
      setRadiusKm(typeof parsed.radiusKm === 'number' ? parsed.radiusKm : 10)
      setTelehealthOnly(Boolean(parsed.telehealthOnly))
      setResults(Array.isArray(parsed.results) ? parsed.results : [])
    } catch {
      // Ignore bad state
    }
  }, [])

  React.useEffect(() => {
    if (!pendingScroll || loading) return
    if (resultsRef.current) {
      resultsRef.current.scrollIntoView({ behavior: 'smooth' })
    }
    setPendingScroll(false)
  }, [pendingScroll, loading, results])

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

  const persistSearchState = (payload: {
    categoryId: string
    subcategoryId: string
    query: string
    locationQuery: string
    selectedLocation: LocationResult | null
    radiusKm: number
    telehealthOnly: boolean
    results: SearchResult[]
  }) => {
    try {
      sessionStorage.setItem('helfi:practitionerSearchState', JSON.stringify(payload))
    } catch {
      // Ignore storage errors
    }
  }

  const handleSearch = async (overrides?: { categoryId?: string; subcategoryId?: string; query?: string }) => {
    setLoading(true)
    setError(null)
    setPendingScroll(true)
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
      const nextResults = data?.results || []
      setResults(nextResults)
      persistSearchState({
        categoryId: effectiveCategoryId,
        subcategoryId: effectiveSubcategoryId,
        query: effectiveQuery,
        locationQuery,
        selectedLocation,
        radiusKm,
        telehealthOnly,
        results: nextResults,
      })
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

  const applyCategoryMatch = (match: CategoryMatch) => {
    setCategoryId(match.categoryId)
    setSubcategoryId(match.subcategoryId || '')
    setQuery('')
    setTimeout(() => {
      subcategoryRef.current?.focus()
    }, 0)
    handleSearch({
      categoryId: match.categoryId,
      subcategoryId: match.subcategoryId || '',
      query: '',
    })
  }

  const markers = useMemo(() => {
    return results
      .filter((item) => item.lat != null && item.lng != null)
      .map((item) => ({
        id: item.id,
        name: item.displayName,
        lat: item.lat as number,
        lng: item.lng as number,
        address: [item.addressLine1, item.suburbCity, item.stateRegion, item.country].filter(Boolean).join(', '),
        isBoosted: item.isBoosted,
      }))
  }, [results])

  const trackClick = (item: SearchResult, action: string) => {
    if (!item?.trackingToken) return
    const payload = JSON.stringify({
      listingId: item.id,
      action,
      token: item.trackingToken,
    })
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/practitioners/contact-click', new Blob([payload], { type: 'application/json' }))
      return
    }
    fetch('/api/practitioners/contact-click', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true,
    }).catch(() => undefined)
  }

  const center = selectedLocation
    ? { lat: selectedLocation.lat, lng: selectedLocation.lng }
    : markers.length
      ? { lat: markers[0].lat, lng: markers[0].lng }
      : { lat: -37.8136, lng: 144.9631 }

  const quickRows = [QUICK_ACCESS.slice(0, 6), QUICK_ACCESS.slice(6, 12), QUICK_ACCESS.slice(12, 18)]

  return (
    <div className="min-h-screen bg-white">
      <PublicHeader />
      <section className="relative bg-gradient-to-b from-emerald-50/60 via-white to-white pt-20 pb-20 overflow-hidden border-b border-emerald-100/70">
        <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-emerald-100/40 to-transparent -z-10" />
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
                Browse Categories A-Z
                <span className="text-sm">→</span>
              </Link>
            </div>
            <div className="flex justify-center">
              <Link
                href="/list-your-practice"
                className="inline-flex items-center justify-center px-6 py-3 rounded-full bg-emerald-600 text-white font-semibold text-base hover:bg-emerald-700 transition-colors"
              >
                List your practice
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
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          handleSearch()
                        }
                      }}
                      className="bg-transparent border-none p-0 text-base font-semibold focus:ring-0 w-full placeholder-slate-400"
                      placeholder="Name, symptom, or category"
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

              {suggestedMatches.length > 0 && (
                <div className="mt-3 px-2">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Suggested categories</div>
                  <div className="flex flex-wrap gap-2">
                    {suggestedMatches.map((match) => (
                      <button
                        key={match.id}
                        onClick={() => applyCategoryMatch(match)}
                        className="px-3 py-1 rounded-full border border-emerald-100 bg-emerald-50/60 text-xs font-semibold text-emerald-800 hover:border-emerald-200 hover:text-emerald-900 transition-colors"
                      >
                        {match.label}
                        {match.parentLabel ? ` · ${match.parentLabel}` : ''}
                      </button>
                    ))}
                  </div>
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
                    className="border border-slate-200 rounded-xl px-3 py-2 pr-8 text-sm font-semibold min-w-[80px]"
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
                      className="flex-none bg-white py-3 px-5 rounded-2xl text-center shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all border border-slate-100 font-semibold text-sm text-slate-700 flex items-center gap-3"
                    >
                      <MaterialSymbol name={item.icon} className={`text-2xl ${item.tone}`} />
                      <span className="whitespace-nowrap">{item.label}</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 pb-16">
        <div ref={resultsRef} className="max-w-6xl mx-auto scroll-mt-20">
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-slate-900">Search Results</h2>
            <p className="text-sm text-slate-500">Results stay here until you run a new search.</p>
          </div>
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
                    <Link
                      href={`/practitioners/${item.slug}`}
                      className="hover:underline"
                    >
                      View profile
                    </Link>
                    {item.phone && (
                      <a href={`tel:${item.phone}`} className="hover:underline" onClick={() => trackClick(item, 'call')}>
                        Call
                      </a>
                    )}
                    {item.websiteUrl && (
                      <a
                        href={item.websiteUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:underline"
                        onClick={() => trackClick(item, 'website')}
                      >
                        Website
                      </a>
                    )}
                    {isValidEmail(item.emailPublic) && (
                      <a href={`mailto:${item.emailPublic}`} className="hover:underline" onClick={() => trackClick(item, 'email')}>
                        Email
                      </a>
                    )}
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
