import { NextRequest, NextResponse } from 'next/server'
import { head } from '@vercel/blob'
import { verifySignedBlobToken } from '@/lib/signed-blob'
import { isPathAllowedForScope, normalizeBlobPath } from '@/lib/blob-access'

const getBlobToken = () =>
  process.env.BLOB_READ_WRITE_TOKEN || process.env.VERCEL_BLOB_READ_WRITE_TOKEN || ''

export async function GET(request: NextRequest) {
  try {
    const blobToken = getBlobToken()
    if (!blobToken) {
      return NextResponse.json({ error: 'Storage not configured' }, { status: 503 })
    }

    const { searchParams } = new URL(request.url)
    const token = String(searchParams.get('token') || '').trim()
    const pathParam = String(searchParams.get('path') || '').trim()

    if (!token || !pathParam) {
      return NextResponse.json({ error: 'Missing token or path' }, { status: 400 })
    }

    const payload = verifySignedBlobToken(token)
    if (!payload) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const normalizedPath = normalizeBlobPath(pathParam)
    if (payload.path !== normalizedPath) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    if (!isPathAllowedForScope(normalizedPath, payload.scope)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const blobInfo = await head(normalizedPath, { token: blobToken })
    if (!blobInfo?.url) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }

    const blobResponse = await fetch(blobInfo.url, {
      headers: { Authorization: `Bearer ${blobToken}` },
    })

    if (!blobResponse.ok || !blobResponse.body) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }

    const headers = new Headers()
    headers.set(
      'Content-Type',
      blobResponse.headers.get('content-type') || 'application/octet-stream',
    )
    const contentLength = blobResponse.headers.get('content-length')
    if (contentLength) {
      headers.set('Content-Length', contentLength)
    }
    headers.set('Cache-Control', 'private, max-age=300')

    return new NextResponse(blobResponse.body, { status: 200, headers })
  } catch (error) {
    console.error('Secure blob fetch failed:', error)
    return NextResponse.json({ error: 'Failed to load file' }, { status: 500 })
  }
}

export const runtime = 'nodejs'
