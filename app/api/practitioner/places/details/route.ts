import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

function getMapsApiKey(): string | null {
  return (
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.GOOGLE_MAPS_SERVER_KEY ||
    process.env.MAPS_API_KEY ||
    null
  )
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const placeId = request.nextUrl.searchParams.get('placeId')?.trim() || ''
  if (!placeId) {
    return NextResponse.json({ error: 'Missing placeId' }, { status: 400 })
  }

  const apiKey = getMapsApiKey()
  if (!apiKey) {
    return NextResponse.json({ error: 'Google Places API is not configured.' }, { status: 500 })
  }

  const url = new URL('https://maps.googleapis.com/maps/api/place/details/json')
  url.searchParams.set('place_id', placeId)
  url.searchParams.set('key', apiKey)
  url.searchParams.set('fields', 'formatted_address,address_component,geometry')

  const res = await fetch(url.toString())
  if (!res.ok) {
    return NextResponse.json({ error: 'Place lookup failed.' }, { status: 502 })
  }

  const data = await res.json().catch(() => ({}))
  if (data?.status !== 'OK') {
    return NextResponse.json({ error: 'Place not found.' }, { status: 404 })
  }

  const result = data?.result || {}
  return NextResponse.json({
    place: {
      formattedAddress: result.formatted_address || '',
      addressComponents: result.address_components || [],
      geometry: result.geometry || null,
    },
  })
}
