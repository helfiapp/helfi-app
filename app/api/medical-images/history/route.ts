import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { del, put } from '@vercel/blob'

const contentTypeToExt = (contentType: string) => {
  if (contentType === 'image/png') return 'png'
  if (contentType === 'image/webp') return 'webp'
  if (contentType === 'image/gif') return 'gif'
  return 'jpg'
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const analyses = await prisma.medicalImageAnalysis.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        summary: true,
        analysisText: true,
        analysisData: true,
        createdAt: true,
        imageFile: {
          select: {
            secureUrl: true,
          },
        },
      },
    })

    const history = analyses.map((item) => ({
      id: item.id,
      summary: item.summary,
      analysisText: item.analysisText,
      analysisData: item.analysisData,
      createdAt: item.createdAt,
      imageUrl: item.imageFile?.secureUrl || null,
    }))

    return NextResponse.json({ success: true, history })
  } catch (error) {
    console.error('Error fetching medical image history:', error)
    return NextResponse.json(
      {
        error: 'Failed to fetch medical image history',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json({ error: 'Image storage is not configured' }, { status: 500 })
    }

    const formData = await request.formData()
    const imageFile = formData.get('image')
    const analysisRaw = formData.get('analysis')

    if (!imageFile || typeof imageFile === 'string') {
      return NextResponse.json({ error: 'No image provided' }, { status: 400 })
    }
    if (!analysisRaw || typeof analysisRaw !== 'string') {
      return NextResponse.json({ error: 'No analysis provided' }, { status: 400 })
    }

    let analysisPayload: any
    try {
      analysisPayload = JSON.parse(analysisRaw)
    } catch {
      return NextResponse.json({ error: 'Invalid analysis payload' }, { status: 400 })
    }

    const ext = contentTypeToExt(imageFile.type || 'image/jpeg')
    const filename = `${Date.now()}.${ext}`
    const pathname = `medical-images/${user.id}/${filename}`
    const buffer = Buffer.from(await imageFile.arrayBuffer())

    const blob = await put(pathname, buffer, {
      access: 'public',
      contentType: imageFile.type || 'image/jpeg',
      addRandomSuffix: true,
    })

    const fileRecord = await prisma.file.create({
      data: {
        originalName: imageFile.name || filename,
        fileName: blob.pathname,
        fileSize: imageFile.size || buffer.length,
        mimeType: imageFile.type || 'image/jpeg',
        cloudinaryId: blob.pathname,
        cloudinaryUrl: blob.url,
        secureUrl: blob.url,
        uploadedById: user.id,
        fileType: 'IMAGE',
        usage: 'MEDICAL_IMAGE',
        isPublic: true,
        metadata: {
          storage: 'vercel-blob',
          blobPathname: blob.pathname,
          blobUrl: blob.url,
          format: ext,
          originalSize: imageFile.size || buffer.length,
        },
      },
    })

    const analysisData = {
      summary: analysisPayload?.summary ?? null,
      possibleCauses: Array.isArray(analysisPayload?.possibleCauses)
        ? analysisPayload.possibleCauses
        : [],
      redFlags: Array.isArray(analysisPayload?.redFlags) ? analysisPayload.redFlags : [],
      nextSteps: Array.isArray(analysisPayload?.nextSteps) ? analysisPayload.nextSteps : [],
      disclaimer: analysisPayload?.disclaimer ?? null,
    }

    const saved = await prisma.medicalImageAnalysis.create({
      data: {
        userId: user.id,
        imageFileId: fileRecord.id,
        summary: analysisPayload?.summary ?? null,
        analysisText: analysisPayload?.analysisText ?? null,
        analysisData,
      },
    })

    return NextResponse.json({
      success: true,
      historyItem: {
        id: saved.id,
        summary: saved.summary,
        analysisText: saved.analysisText,
        analysisData: saved.analysisData,
        createdAt: saved.createdAt,
        imageUrl: fileRecord.secureUrl,
      },
    })
  } catch (error) {
    console.error('Error saving medical image history:', error)
    return NextResponse.json(
      {
        error: 'Failed to save medical image history',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const analyses = await prisma.medicalImageAnalysis.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        imageFileId: true,
        imageFile: {
          select: {
            cloudinaryId: true,
            secureUrl: true,
          },
        },
      },
    })

    const blobTargets = analyses
      .map((item) => item.imageFile?.cloudinaryId || item.imageFile?.secureUrl)
      .filter((value): value is string => typeof value === 'string' && value.length > 0)

    if (process.env.BLOB_READ_WRITE_TOKEN && blobTargets.length > 0) {
      try {
        await del(blobTargets)
      } catch (deleteError) {
        console.warn('Failed to delete medical image blobs:', deleteError)
      }
    }

    const fileIds = analyses
      .map((item) => item.imageFileId)
      .filter((value): value is string => typeof value === 'string' && value.length > 0)

    const deletedCount = await prisma.$transaction([
      prisma.medicalImageAnalysis.deleteMany({ where: { userId: user.id } }),
      fileIds.length > 0
        ? prisma.file.deleteMany({ where: { id: { in: fileIds } } })
        : prisma.file.deleteMany({ where: { id: { in: [] } } }),
    ])

    return NextResponse.json({
      success: true,
      message: `Deleted ${deletedCount[0].count} analyses`,
      deletedCount: deletedCount[0].count,
    })
  } catch (error) {
    console.error('Error deleting medical image history:', error)
    return NextResponse.json(
      {
        error: 'Failed to delete medical image history',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
