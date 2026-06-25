'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'

type PractitionerRecommendation = {
  id: string
  displayName: string
  slug: string
  categoryName: string | null
  subcategoryName: string | null
  description: string | null
  phone: string | null
  websiteUrl: string | null
  emailPublic: string | null
  suburbCity: string | null
  stateRegion: string | null
  country: string | null
  distanceKm: number | null
  reason: string
  matchedIssue: string
  trackingToken?: string | null
}

type UserLocation = {
  lat: number
  lng: number
  country?: string | null
}

type Props = {
  issueText: string
  sourceArea: 'onboarding' | 'chat' | 'image' | 'symptom-notes'
  className?: string
  compact?: boolean
}

const LOCATION_KEY = 'helfi:practitionerLocation'

function readSavedLocation(): UserLocation | null {
  if (typeof window === 'undefined') return null
  try {
    const params = new URLSearchParams(window.location.search)
    const lat = Number(params.get('practitionerLat'))
    const lng = Number(params.get('practitionerLng'))
    const isLocalTest =
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      window.location.hostname === '::1'
    if (isLocalTest && Number.isFinite(lat) && Number.isFinite(lng)) {
      return {
        lat,
        lng,
        country: params.get('practitionerCountry') || null,
      }
    }
  } catch {
    // Continue to saved location below.
  }
  try {
    const raw = window.localStorage.getItem(LOCATION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    const lat = Number(parsed?.lat)
    const lng = Number(parsed?.lng)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
    return {
      lat,
      lng,
      country: typeof parsed?.country === 'string' ? parsed.country : null,
    }
  } catch {
    return null
  }
}

function getBrowserLocation(): Promise<UserLocation | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.resolve(null)
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        })
      },
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 1000 * 60 * 60 }
    )
  })
}

function formatPlace(item: PractitionerRecommendation) {
  return [item.suburbCity, item.stateRegion, item.country].filter(Boolean).join(', ')
}

function isNativeRecommendationBridge() {
  if (typeof window === 'undefined') return false
  try {
    const params = new URLSearchParams(window.location.search)
    return (
      params.get('helfiNative') === '1' ||
      document.documentElement.getAttribute('data-helfi-native-webview') === '1' ||
      Boolean((window as any).ReactNativeWebView?.postMessage)
    )
  } catch {
    return false
  }
}

function postNativeRecommendationRequest(issueText: string, sourceArea: Props['sourceArea']) {
  try {
    const bridge = (window as any).ReactNativeWebView
    if (!bridge || typeof bridge.postMessage !== 'function') return
    bridge.postMessage(
      JSON.stringify({
        type: 'helfi:practitionerRecommendationRequest',
        issueText,
        sourceArea,
      })
    )
  } catch {
    // Native bridge is optional; the website still renders normally.
  }
}

export default function PractitionerRecommendations({ issueText, sourceArea, className = '', compact = false }: Props) {
  const [results, setResults] = useState<PractitionerRecommendation[]>([])
  const [loaded, setLoaded] = useState(false)
  const trimmedIssueText = useMemo(() => String(issueText || '').trim(), [issueText])

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoaded(false)
      setResults([])
      if (isNativeRecommendationBridge()) {
        postNativeRecommendationRequest(trimmedIssueText, sourceArea)
        setLoaded(true)
        return
      }

      if (!trimmedIssueText) {
        setLoaded(true)
        return
      }

      const location = readSavedLocation() || (await getBrowserLocation())
      if (!location || cancelled) {
        setLoaded(true)
        return
      }

      try {
        const res = await fetch('/api/practitioners/recommendations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            issueText: trimmedIssueText,
            sourceArea,
            lat: location.lat,
            lng: location.lng,
            country: location.country || undefined,
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (!cancelled && res.ok && Array.isArray(data?.results)) {
          setResults(data.results)
        }
      } catch {
        if (!cancelled) setResults([])
      } finally {
        if (!cancelled) setLoaded(true)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [sourceArea, trimmedIssueText])

  if (!loaded || results.length === 0) return null

  return (
    <section className={`${compact ? 'mt-3' : 'mt-5'} ${className}`.trim()}>
      <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-3 md:p-4">
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-emerald-950">Practitioners near you</h3>
          <p className="mt-1 text-xs text-emerald-800">
            Based on what you shared, these nearby practitioners may be relevant.
          </p>
        </div>
        <div className="space-y-2">
          {results.map((item) => {
            const contactUrl = item.websiteUrl || `/practitioners/${item.slug}`
            const place = formatPlace(item)
            return (
              <div key={item.id} className="rounded-md border border-emerald-100 bg-white p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-gray-950">{item.displayName}</div>
                    <div className="mt-0.5 text-xs text-gray-600">
                      {[item.subcategoryName, item.categoryName].filter(Boolean).join(' - ')}
                    </div>
                  </div>
                  {typeof item.distanceKm === 'number' && (
                    <div className="shrink-0 rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800">
                      {item.distanceKm}km
                    </div>
                  )}
                </div>
                {place && <div className="mt-2 text-xs text-gray-600">{place}</div>}
                <div className="mt-2 text-xs text-gray-700">{item.reason}</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    href={`/practitioners/${item.slug}`}
                    className="rounded-md border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-50"
                  >
                    View profile
                  </Link>
                  {item.websiteUrl && (
                    <a
                      href={contactUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                    >
                      Website or booking
                    </a>
                  )}
                  {!item.websiteUrl && item.phone && (
                    <a
                      href={`tel:${item.phone}`}
                      className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                    >
                      Call
                    </a>
                  )}
                </div>
              </div>
            )
          })}
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-emerald-800">
          These are not diagnoses or referrals. You may want to consider speaking with a qualified practitioner if it feels relevant.
        </p>
      </div>
    </section>
  )
}
