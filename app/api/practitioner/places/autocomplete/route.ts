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

  const query = request.nextUrl.searchParams.get('q')?.trim() || ''
  if (!query) {
    return NextResponse.json({ predictions: [] })
  }

  const apiKey = getMapsApiKey()
  if (!apiKey) {
    return NextResponse.json({ predictions: [] })
  }

  const url = new URL('https://maps.googleapis.com/maps/api/place/autocomplete/json')
  url.searchParams.set('input', query)
  url.searchParams.set('key', apiKey)
  url.searchParams.set('types', 'address')

  const res = await fetch(url.toString())
  if (!res.ok) {
    return NextResponse.json({ predictions: [] })
  }

  const data = await res.json().catch(() => ({}))
  if (data?.status !== 'OK' && data?.status !== 'ZERO_RESULTS') {
    return NextResponse.json({ predictions: [] })
  }

  const predictions = Array.isArray(data?.predictions)
    ? data.predictions.map((item: any) => ({
        placeId: String(item.place_id || ''),
        description: String(item.description || ''),
        mainText: String(item.structured_formatting?.main_text || item.description || ''),
        secondaryText: String(item.structured_formatting?.secondary_text || ''),
      }))
    : []

  return NextResponse.json({ predictions })
}
