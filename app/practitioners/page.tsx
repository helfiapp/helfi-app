'use client'

import React, { useMemo, useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'

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

export default function PractitionerDirectoryPage() {
  const [categories, setCategories] = useState<CategoryNode[]>([])
  const [categoryId, setCategoryId] = useState('')
  const [query, setQuery] = useState('')
  const [locationQuery, setLocationQuery] = useState('')
  const [locationResults, setLocationResults] = useState<LocationResult[]>([])
  const [selectedLocation, setSelectedLocation] = useState<LocationResult | null>(null)
  const [radiusKm, setRadiusKm] = useState(10)
  const [telehealthOnly, setTelehealthOnly] = useState(false)
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const geoKey = useMemo(() => {
    if (!selectedLocation) return ''
    const country = String(selectedLocation.country || '').trim().toLowerCase()
    return country ? country : ''
  }, [selectedLocation])

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
        } catch {
          const location: LocationResult = {
            lat,
            lng,
            displayName: 'Current location',
          }
          setSelectedLocation(location)
          setLocationQuery(location.displayName)
          setLocationResults([])
        }
      },
      () => alert('We could not access your location. Please enter it manually.')
    )
  }

  const handleSearch = async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (categoryId) params.set('categoryId', categoryId)
      if (query.trim()) params.set('q', query.trim())
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
      : { lat: 40.7128, lng: -74.006 }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h1 className="text-2xl font-bold text-gray-900">Find a practitioner</h1>
          <p className="text-gray-600 mt-2">Browse trusted practitioners by category and location.</p>
          <div className="mt-5 flex flex-col sm:flex-row gap-3">
            <a
              href="#directory-search"
              className="px-5 py-2.5 rounded-full bg-helfi-green text-white font-semibold text-sm text-center hover:bg-helfi-green/90 transition-colors"
            >
              Find a practitioner
            </a>
            <Link
              href="/list-your-practice"
              className="px-5 py-2.5 rounded-full border border-emerald-200 text-emerald-800 font-semibold text-sm text-center hover:border-emerald-300 hover:text-emerald-900 transition-colors"
            >
              List your practice
            </Link>
          </div>

          <div id="directory-search" className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">All categories</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Search</label>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                placeholder="Physio, chiro, anxiety..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Location</label>
              <div className="flex gap-2">
                <input
                  value={locationQuery}
                  onChange={(e) => setLocationQuery(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="City or suburb"
                />
                <button
                  onClick={handleLocationSearch}
                  className="px-3 py-2 bg-gray-100 text-gray-800 rounded-lg text-sm hover:bg-gray-200"
                >
                  Find
                </button>
              </div>
              {locationResults.length > 0 && (
                <div className="mt-2 border border-gray-200 rounded-lg bg-white shadow-sm max-h-56 overflow-y-auto text-sm">
                  {locationResults.map((item) => (
                    <button
                      key={item.displayName}
                      onClick={() => {
                        setSelectedLocation(item)
                        setLocationQuery(item.displayName)
                        setLocationResults([])
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-gray-50"
                    >
                      {item.displayName}
                    </button>
                  ))}
                </div>
              )}
              <button
                onClick={handleUseMyLocation}
                className="mt-2 text-xs text-emerald-700 hover:underline"
              >
                Use my current location
              </button>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Radius</label>
              <select
                value={radiusKm}
                onChange={(e) => setRadiusKm(Number(e.target.value))}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value={5}>5 km</option>
                <option value={10}>10 km</option>
                <option value={25}>25 km</option>
                <option value={50}>50 km</option>
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={telehealthOnly}
                onChange={(e) => setTelehealthOnly(e.target.checked)}
                className="h-4 w-4 text-emerald-600 border-gray-300 rounded"
              />
              Telehealth only
            </label>
            <button
              onClick={handleSearch}
              className="px-5 py-2.5 rounded-full bg-helfi-green text-white font-semibold hover:bg-helfi-green/90 transition-colors"
            >
              {loading ? 'Searching…' : 'Search'}
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-6">
          <div className="space-y-4">
            {loading && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 text-sm text-gray-600">
                Loading results…
              </div>
            )}
            {!loading && results.length === 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 text-sm text-gray-600">
                No results yet. Try a different category or radius.
              </div>
            )}
            {!loading && results.map((item) => (
              <div key={item.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-semibold text-gray-900">{item.displayName}</h3>
                  {item.isTopBoost && (
                    <span className="px-2 py-1 text-xs font-semibold bg-emerald-100 text-emerald-700 rounded-full">Top boost</span>
                  )}
                  {item.isBoosted && !item.isTopBoost && (
                    <span className="px-2 py-1 text-xs font-semibold bg-emerald-50 text-emerald-700 rounded-full">Boosted</span>
                  )}
                </div>
                <div className="text-sm text-gray-600">
                  {item.categoryName}
                  {item.subcategoryName ? ` · ${item.subcategoryName}` : ''}
                </div>
                {item.distanceKm !== null && (
                  <div className="text-sm text-gray-500">{item.distanceKm.toFixed(1)} km away</div>
                )}
                {item.description && <p className="text-sm text-gray-600">{item.description}</p>}
                <div className="flex flex-wrap gap-3 text-sm text-emerald-700">
                  <a href={`/practitioners/${item.slug}`} className="hover:underline">View profile</a>
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
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 min-h-[420px]">
            <div className="text-sm font-semibold text-gray-700 mb-3">Map view</div>
            <div className="h-[520px]">
              <DirectoryMap
                center={center}
                radiusKm={radiusKm}
                markers={markers}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
