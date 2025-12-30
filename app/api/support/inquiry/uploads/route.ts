import { NextRequest, NextResponse } from 'next/server'
import { put } from '@vercel/blob'
import { prisma } from '@/lib/prisma'
import { buildSignedBlobUrl } from '@/lib/blob-access'

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024
const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])

function sanitizeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_')
}

function guestTokenPrefix(token: string) {
  return `guest:${token}`
}

export async function POST(request: NextRequest) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: 'Upload system not configured' }, { status: 503 })
  }

  const formData = await request.formData().catch(() => null)
  if (!formData) {
    return NextResponse.json({ error: 'Invalid upload data' }, { status: 400 })
  }

  const ticketId = String(formData.get('ticketId') || '').trim()
  const token = String(formData.get('token') || '').trim()
  if (!ticketId || !token) {
    return NextResponse.json({ error: 'Missing ticketId or token' }, { status: 400 })
  }

  const ticket = await prisma.supportTicket.findFirst({
    where: { id: ticketId, externalMessageId: guestTokenPrefix(token) },
  })
  if (!ticket) {
    return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
  }

  const file = formData.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 })
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: 'File is too large (max 15MB)' }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const safeName = sanitizeFilename(file.name || 'upload')
  const pathname = `support/inquiry/${ticketId}/${Date.now()}-${safeName}`

  const blob = await put(pathname, buffer, {
    access: 'private',
    contentType: file.type || 'application/octet-stream',
  })

  const signedUrl = buildSignedBlobUrl(blob.pathname, 'support', 60 * 60)
  if (!signedUrl) {
    return NextResponse.json({ error: 'Failed to create secure link' }, { status: 500 })
  }

  return NextResponse.json({
    name: file.name || safeName,
    url: signedUrl,
    path: blob.pathname,
    type: file.type,
    size: file.size,
  })
}
