import type { PractitionerRadiusTier } from '@prisma/client'

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

export function parseCommaList(input: string | string[] | null | undefined): string[] {
  if (!input) return []
  if (Array.isArray(input)) {
    return input.map((item) => String(item).trim()).filter(Boolean)
  }
  return String(input)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

export function normalizeUrl(url: string | null | undefined): string | null {
  if (!url) return null
  const trimmed = url.trim()
  if (!trimmed) return null
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  const apiKey =
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.GOOGLE_MAPS_SERVER_KEY ||
    process.env.MAPS_API_KEY
  if (!apiKey) return null
  const trimmed = address.trim()
  if (!trimmed) return null
  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json')
  url.searchParams.set('address', trimmed)
  url.searchParams.set('key', apiKey)
  const res = await fetch(url.toString())
  if (!res.ok) return null
  const data = await res.json().catch(() => ({}))
  if (data?.status !== 'OK') return null
  const location = data?.results?.[0]?.geometry?.location
  if (!location) return null
  return { lat: Number(location.lat), lng: Number(location.lng) }
}

export function buildGeoKey(input: {
  country?: string | null
  stateRegion?: string | null
  suburbCity?: string | null
}) {
  const country = String(input.country || '').trim().toLowerCase()
  return country ? country : ''
}

export function radiusTierToKm(tier: PractitionerRadiusTier): number {
  switch (tier) {
    case 'R5':
      return 5
    case 'R10':
      return 10
    case 'R25':
      return 25
    case 'R50':
      return 50
    default:
      return 10
  }
}

export function calculateDistanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (value: number) => (value * Math.PI) / 180
  const earthRadiusKm = 6371
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)

  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2)
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
  return earthRadiusKm * c
}
