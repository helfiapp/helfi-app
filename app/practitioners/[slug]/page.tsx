'use client'

import React, { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'

const DirectoryMap = dynamic(() => import('@/components/practitioner/DirectoryMap'), { ssr: false })

export default function PractitionerProfilePage({ params }: { params: { slug: string } }) {
  const [listing, setListing] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
                <a href={`tel:${listing.phone}`} className="text-emerald-700 hover:underline">{listing.phone}</a>
              </div>
            )}
            {listing.websiteUrl && (
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase">Website</div>
                <a href={listing.websiteUrl} target="_blank" rel="noreferrer" className="text-emerald-700 hover:underline">
                  {listing.websiteUrl}
                </a>
              </div>
            )}
            {listing.emailPublic && (
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase">Email</div>
                <a href={`mailto:${listing.emailPublic}`} className="text-emerald-700 hover:underline">{listing.emailPublic}</a>
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
              {galleryUrls.map((url: string) => (
                <img
                  key={url}
                  src={url}
                  alt={`${listing.displayName} photo`}
                  className="w-full h-40 rounded-xl object-cover border border-gray-100"
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
