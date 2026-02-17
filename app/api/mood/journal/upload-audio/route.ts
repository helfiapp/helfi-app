import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

const MAX_AUDIO_BYTES = 12 * 1024 * 1024

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // NextRequest.formData() returns a standard web FormData, but type
    // definitions can vary between runtimes and cause build-time TS errors.
    // Cast to `any` here to preserve runtime behavior without changing logic.
    const formData: any = await request.formData()
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

    return NextResponse.json({
      success: true,
      localOnly: true,
      message: 'For security, mood voice notes are kept on this device only and not stored on our servers.',
    })
  } catch (e) {
    console.error('mood journal audio upload error', e)
    return NextResponse.json({ error: 'Failed to upload audio' }, { status: 500 })
  }
}
