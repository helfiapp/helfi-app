'use client'

import React, { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'

const DirectoryMap = dynamic(() => import('@/components/practitioner/DirectoryMap'), { ssr: false })

export default function PractitionerProfilePage({ params }: { params: { slug: string } }) {
  const [listing, setListing] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const trackedRef = useRef(false)

  const isValidEmail = (value: string | null | undefined) => {
    if (!value) return false
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
  }

  const trackClick = (action: string) => {
    if (!listing?.id || !listing?.trackingToken) return
    const payload = JSON.stringify({
      listingId: listing.id,
      action,
      token: listing.trackingToken,
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

  useEffect(() => {
    const loadListing = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/practitioners/${params.slug}`, { cache: 'no-store' })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data?.error || 'Listing not found')
        setListing(data?.listing || null)
      } catch (err: any) {
        setError(err?.message || 'Listing not found')
      } finally {
        setLoading(false)
      }
    }

    loadListing()
  }, [params.slug])

  useEffect(() => {
    if (!listing?.id || !listing?.trackingToken || trackedRef.current) return
    trackedRef.current = true
    trackClick('profile_view')
  }, [listing])

  if (loading) {
    return (
      <div className="min-h-screen p-6">
        <div className="max-w-4xl mx-auto">
          <p className="text-gray-600">Loading listing…</p>
        </div>
      </div>
    )
  }

  if (error || !listing) {
    return (
      <div className="min-h-screen p-6">
        <div className="max-w-4xl mx-auto">
          <p className="text-gray-600">Listing not found.</p>
        </div>
      </div>
    )
  }

  const address = [listing.addressLine1, listing.addressLine2, listing.suburbCity, listing.stateRegion, listing.postcode, listing.country]
    .filter(Boolean)
    .join(', ')
  const logoUrl = listing?.images?.logoUrl || null
  const galleryUrls = Array.isArray(listing?.images?.gallery) ? listing.images.gallery : []
  const hoursNotes = listing?.hours?.notes || null
  const lightboxOpen = lightboxIndex !== null && galleryUrls[lightboxIndex]

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-2">
          {logoUrl && (
            <img
              src={logoUrl}
              alt={`${listing.displayName} logo`}
              className="w-20 h-20 rounded-xl object-contain border border-gray-100 bg-white"
            />
          )}
          <h1 className="text-2xl font-bold text-gray-900">{listing.displayName}</h1>
          <div className="text-sm text-gray-600">
            {listing.categoryName}
            {listing.subcategoryName ? ` · ${listing.subcategoryName}` : ''}
          </div>
          {listing.serviceType && (
            <div className="text-xs text-emerald-700 uppercase tracking-wide">{listing.serviceType.replace('_', ' ')}</div>
          )}
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
          {listing.description && <p className="text-sm text-gray-700">{listing.description}</p>}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-700">
            {listing.phone && (
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase">Phone</div>
                <a href={`tel:${listing.phone}`} className="text-emerald-700 hover:underline" onClick={() => trackClick('call')}>
                  {listing.phone}
                </a>
              </div>
            )}
            {listing.websiteUrl && (
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase">Website</div>
                <a
                  href={listing.websiteUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-emerald-700 hover:underline"
                  onClick={() => trackClick('website')}
                >
                  {listing.websiteUrl}
                </a>
              </div>
            )}
            {isValidEmail(listing.emailPublic) && (
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase">Email</div>
                <a
                  href={`mailto:${listing.emailPublic}`}
                  className="text-emerald-700 hover:underline"
                  onClick={() => trackClick('email')}
                >
                  {listing.emailPublic}
                </a>
              </div>
            )}
            {address && (
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase">Address</div>
                <div>{address}</div>
              </div>
            )}
          </div>

          {Array.isArray(listing.languages) && listing.languages.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase">Languages</div>
              <div className="text-sm text-gray-700">{listing.languages.join(', ')}</div>
            </div>
          )}

          {hoursNotes && (
            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase">Opening hours</div>
              <div className="text-sm text-gray-700 whitespace-pre-wrap">{hoursNotes}</div>
            </div>
          )}

          {Array.isArray(listing.tags) && listing.tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {listing.tags.map((tag: string) => (
                <span key={tag} className="px-2 py-1 text-xs bg-emerald-50 text-emerald-700 rounded-full">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {listing.lat && listing.lng && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <div className="text-sm font-semibold text-gray-700 mb-3">Map</div>
            <div className="h-[360px]">
              <DirectoryMap
                center={{ lat: listing.lat, lng: listing.lng }}
                markers={[{ id: listing.id, name: listing.displayName, lat: listing.lat, lng: listing.lng }]}
              />
            </div>
          </div>
        )}

        {galleryUrls.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <div className="text-sm font-semibold text-gray-700 mb-4">Photos</div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {galleryUrls.map((url: string, index: number) => (
                <button
                  key={url}
                  type="button"
                  onClick={() => setLightboxIndex(index)}
                  className="group relative"
                >
                  <img
                    src={url}
                    alt={`${listing.displayName} photo`}
                    className="w-full h-40 rounded-xl object-cover border border-gray-100 group-hover:opacity-90 transition-opacity"
                  />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {lightboxOpen && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center"
          onClick={() => setLightboxIndex(null)}
        >
          <div className="absolute top-4 right-4">
            <button
              type="button"
              onClick={() => setLightboxIndex(null)}
              className="px-3 py-2 rounded-full bg-white/90 text-gray-900 text-sm font-semibold"
            >
              Close
            </button>
          </div>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              setLightboxIndex((prev) => {
                if (prev === null) return prev
                return prev === 0 ? galleryUrls.length - 1 : prev - 1
              })
            }}
            className="absolute left-4 md:left-8 text-white text-3xl font-bold"
          >
            ‹
          </button>
          <img
            src={galleryUrls[lightboxIndex as number]}
            alt={`${listing.displayName} photo`}
            className="max-h-[80vh] max-w-[90vw] rounded-2xl shadow-xl"
            onClick={(event) => event.stopPropagation()}
          />
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              setLightboxIndex((prev) => {
                if (prev === null) return prev
                return prev === galleryUrls.length - 1 ? 0 : prev + 1
              })
            }}
            className="absolute right-4 md:right-8 text-white text-3xl font-bold"
          >
            ›
          </button>
        </div>
      )}
    </div>
  )
}
