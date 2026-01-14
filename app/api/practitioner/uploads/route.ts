import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { v2 as cloudinary } from 'cloudinary'

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME?.trim(),
  api_key: process.env.CLOUDINARY_API_KEY?.trim(),
  api_secret: process.env.CLOUDINARY_API_SECRET?.trim(),
})

const MAX_BYTES = 8 * 1024 * 1024

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const formData = await request.formData()
    const imageFile = formData.get('image')
    const kind = String(formData.get('kind') || '').trim() || 'listing'

    if (!(imageFile instanceof File)) {
      return NextResponse.json({ error: 'No image file provided' }, { status: 400 })
    }

    if (!imageFile.type.startsWith('image/')) {
      return NextResponse.json({ error: 'File must be an image' }, { status: 400 })
    }

    if (imageFile.size > MAX_BYTES) {
      return NextResponse.json({ error: 'File size must be less than 8MB' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const imageBuffer = await imageFile.arrayBuffer()
    const buffer = Buffer.from(imageBuffer)

    const uploadResult = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        {
          resource_type: 'image',
          folder: `helfi/practitioner-listings/${kind}`,
          public_id: `listing_${user.id}_${Date.now()}`,
          transformation: [{ quality: 'auto', fetch_format: 'auto' }],
          invalidate: true,
        },
        (error, result) => {
          if (error) {
            reject(error)
          } else {
            resolve(result)
          }
        }
      ).end(buffer)
    })

    const cloudinaryResult = uploadResult as any

    const fileRecord = await prisma.file.create({
      data: {
        originalName: imageFile.name,
        fileName: cloudinaryResult.public_id,
        fileSize: cloudinaryResult.bytes,
        mimeType: imageFile.type,
        cloudinaryId: cloudinaryResult.public_id,
        cloudinaryUrl: cloudinaryResult.url,
        secureUrl: cloudinaryResult.secure_url,
        uploadedById: user.id,
        fileType: 'IMAGE',
        usage: 'OTHER',
        isPublic: true,
        metadata: {
          source: 'practitioner_listing',
          kind,
          width: cloudinaryResult.width,
          height: cloudinaryResult.height,
          format: cloudinaryResult.format,
        },
      },
    })

    return NextResponse.json({
      success: true,
      url: cloudinaryResult.secure_url,
      fileId: fileRecord.id,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload failed' },
      { status: 500 }
    )
  }
}
