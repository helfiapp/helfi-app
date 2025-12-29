import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import crypto from 'crypto'
import { put } from '@vercel/blob'
import { prisma } from '@/lib/prisma'
import { buildSignedBlobUrl } from '@/lib/blob-access'

const MAX_IMAGE_BYTES = 6 * 1024 * 1024

const contentTypeToExt = (contentType: string) => {
  if (contentType === 'image/png') return 'png'
  if (contentType === 'image/webp') return 'webp'
  if (contentType === 'image/gif') return 'gif'
  return 'jpg'
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json({ error: 'Image storage is not configured' }, { status: 503 })
    }

    const formData = await request.formData()
    const imageFile = formData.get('image') as File

    if (!imageFile) {
      return NextResponse.json({ error: 'No image file provided' }, { status: 400 })
    }

    if (!imageFile.type.startsWith('image/')) {
      return NextResponse.json({ error: 'File must be an image' }, { status: 400 })
    }

    if (imageFile.size > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: 'File size must be less than 6MB' }, { status: 400 })
    }

    const imageBuffer = await imageFile.arrayBuffer()
    const buffer = Buffer.from(imageBuffer)
    const ext = contentTypeToExt(imageFile.type || 'image/jpeg')
    const filename = `${Date.now()}-${crypto.randomUUID()}.${ext}`
    const pathname = `mood-journal/${user.id}/images/${filename}`
    const blob = await put(pathname, buffer, {
      access: 'public',
      contentType: imageFile.type || 'image/jpeg',
      addRandomSuffix: true,
    })
    const signedUrl = buildSignedBlobUrl(blob.pathname, 'mood-journal', 60 * 60)
    if (!signedUrl) {
      return NextResponse.json({ error: 'Failed to create secure link' }, { status: 500 })
    }

    return NextResponse.json({
      url: signedUrl,
      path: blob.pathname,
    })
  } catch (e) {
    console.error('mood journal image upload error', e)
    return NextResponse.json({ error: 'Failed to upload image' }, { status: 500 })
  }
}
