import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { v2 as cloudinary } from 'cloudinary'
import crypto from 'crypto'

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME?.trim(),
  api_key: process.env.CLOUDINARY_API_KEY?.trim(),
  api_secret: process.env.CLOUDINARY_API_SECRET?.trim(),
})

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const formData = await request.formData()
    const audioFile = formData.get('audio') as File

    if (!audioFile) {
      return NextResponse.json({ error: 'No audio file provided' }, { status: 400 })
    }

    if (!audioFile.type.startsWith('audio/')) {
      return NextResponse.json({ error: 'File must be audio' }, { status: 400 })
    }

    if (audioFile.size > 12 * 1024 * 1024) {
      return NextResponse.json({ error: 'File size must be less than 12MB' }, { status: 400 })
    }

    const buffer = Buffer.from(await audioFile.arrayBuffer())

    const uploadResult = await new Promise<any>((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        {
          resource_type: 'video',
          folder: 'helfi/mood-journal/audio',
          public_id: `journal_audio_${crypto.randomUUID()}`,
        },
        (error, result) => {
          if (error) return reject(error)
          resolve(result)
        },
      ).end(buffer)
    })

    return NextResponse.json({
      url: uploadResult.secure_url,
      duration: uploadResult.duration,
    })
  } catch (e) {
    console.error('mood journal audio upload error', e)
    return NextResponse.json({ error: 'Failed to upload audio' }, { status: 500 })
  }
}
