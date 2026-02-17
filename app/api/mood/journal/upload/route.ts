import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

const MAX_IMAGE_BYTES = 6 * 1024 * 1024

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

    return NextResponse.json({
      success: true,
      localOnly: true,
      message: 'For security, mood photos are kept on this device only and not stored on our servers.',
    })
  } catch (e) {
    console.error('mood journal image upload error', e)
    return NextResponse.json({ error: 'Failed to upload image' }, { status: 500 })
  }
}
