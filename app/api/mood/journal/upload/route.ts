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
    const imageFile = formData.get('image') as File

    if (!imageFile) {
      return NextResponse.json({ error: 'No image file provided' }, { status: 400 })
    }

    if (!imageFile.type.startsWith('image/')) {
      return NextResponse.json({ error: 'File must be an image' }, { status: 400 })
    }

    if (imageFile.size > 6 * 1024 * 1024) {
      return NextResponse.json({ error: 'File size must be less than 6MB' }, { status: 400 })
    }

    const imageBuffer = await imageFile.arrayBuffer()
    const buffer = Buffer.from(imageBuffer)

    const uploadResult = await new Promise<any>((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        {
          resource_type: 'image',
          folder: 'helfi/mood-journal',
          public_id: `journal_${crypto.randomUUID()}`,
          transformation: [
            { width: 1600, height: 1600, crop: 'limit' },
            { quality: 'auto', fetch_format: 'auto' },
          ],
        },
        (error, result) => {
          if (error) return reject(error)
          resolve(result)
        },
      ).end(buffer)
    })

    return NextResponse.json({
      url: uploadResult.secure_url,
      width: uploadResult.width,
      height: uploadResult.height,
    })
  } catch (e) {
    console.error('mood journal image upload error', e)
    return NextResponse.json({ error: 'Failed to upload image' }, { status: 500 })
  }
}
