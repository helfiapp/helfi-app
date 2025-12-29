import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import crypto from 'crypto'
import { put } from '@vercel/blob'
import { prisma } from '@/lib/prisma'
import { buildSignedBlobUrl } from '@/lib/blob-access'

const MAX_AUDIO_BYTES = 12 * 1024 * 1024

const contentTypeToExt = (contentType: string) => {
  if (contentType === 'audio/webm') return 'webm'
  if (contentType === 'audio/mpeg') return 'mp3'
  if (contentType === 'audio/mp4') return 'm4a'
  if (contentType === 'audio/wav') return 'wav'
  return 'webm'
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
      return NextResponse.json({ error: 'Audio storage is not configured' }, { status: 503 })
    }

    const formData = await request.formData()
    const audioFile = formData.get('audio') as File

    if (!audioFile) {
      return NextResponse.json({ error: 'No audio file provided' }, { status: 400 })
    }

    if (!audioFile.type.startsWith('audio/')) {
      return NextResponse.json({ error: 'File must be audio' }, { status: 400 })
    }

    if (audioFile.size > MAX_AUDIO_BYTES) {
      return NextResponse.json({ error: 'File size must be less than 12MB' }, { status: 400 })
    }

    const buffer = Buffer.from(await audioFile.arrayBuffer())
    const ext = contentTypeToExt(audioFile.type || 'audio/webm')
    const filename = `${Date.now()}-${crypto.randomUUID()}.${ext}`
    const pathname = `mood-journal/${user.id}/audio/${filename}`
    const blob = await put(pathname, buffer, {
      access: 'private',
      contentType: audioFile.type || 'audio/webm',
      addRandomSuffix: true,
    })
    const signedUrl = buildSignedBlobUrl(blob.pathname, 'mood-journal', 60 * 60)

    return NextResponse.json({
      url: signedUrl || blob.url,
      path: blob.pathname,
    })
  } catch (e) {
    console.error('mood journal audio upload error', e)
    return NextResponse.json({ error: 'Failed to upload audio' }, { status: 500 })
  }
}
