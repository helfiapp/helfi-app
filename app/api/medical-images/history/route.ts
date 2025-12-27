import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { del } from '@vercel/blob'

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
