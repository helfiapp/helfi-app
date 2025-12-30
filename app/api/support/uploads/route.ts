import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
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

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const userId = session?.user?.id
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: 'Upload system not configured' }, { status: 503 })
  }

  const formData = await request.formData().catch(() => null)
  if (!formData) {
    return NextResponse.json({ error: 'Invalid upload data' }, { status: 400 })
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
  const pathname = `support/${userId}/${Date.now()}-${safeName}`

  const blob = await put(pathname, buffer, {
    access: 'private',
    contentType: file.type || 'application/octet-stream',
  })

  const signedUrl = buildSignedBlobUrl(blob.pathname, 'support', 60 * 60)
  if (!signedUrl) {
    return NextResponse.json({ error: 'Failed to create secure link' }, { status: 500 })
  }

  const fileType = file.type.startsWith('image/') ? 'IMAGE' : 'DOCUMENT'
  const usage = file.type.startsWith('image/') ? 'OTHER' : 'DOCUMENT'

  const fileRecord = await prisma.file.create({
    data: {
      originalName: file.name || safeName,
      fileName: blob.pathname,
      fileSize: file.size,
      mimeType: file.type || 'application/octet-stream',
      cloudinaryId: blob.pathname,
      cloudinaryUrl: blob.url,
      secureUrl: blob.url,
      uploadedById: userId,
      fileType,
      usage,
      metadata: {
        storage: 'vercel-blob',
        blobUrl: blob.url,
        blobPathname: blob.pathname,
        access: 'private',
      },
    },
  })

  return NextResponse.json({
    fileId: fileRecord.id,
    name: fileRecord.originalName,
    url: signedUrl,
    path: blob.pathname,
    type: fileRecord.mimeType,
    size: fileRecord.fileSize,
    fileType,
  })
}
