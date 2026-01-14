import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const q = url.searchParams.get('q')
  if (!q) {
    return NextResponse.json({ error: 'Missing query.' }, { status: 400 })
  }

  const endpoint = new URL('https://nominatim.openstreetmap.org/search')
  endpoint.searchParams.set('format', 'json')
  endpoint.searchParams.set('addressdetails', '1')
  endpoint.searchParams.set('limit', '5')
  endpoint.searchParams.set('q', q)

  const response = await fetch(endpoint.toString(), {
    headers: {
      'User-Agent': 'Helfi Practitioner Directory',
    },
  })

  if (!response.ok) {
    return NextResponse.json({ error: 'Location lookup failed.' }, { status: 500 })
  }

  const data = await response.json().catch(() => [])
  return NextResponse.json({ results: data })
}
