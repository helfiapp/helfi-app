import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { del } from '@vercel/blob'

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({ where: { email: session.user.email } })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const analysisId = params.id
    if (!analysisId) {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    }

    const analysis = await prisma.medicalImageAnalysis.findFirst({
      where: { id: analysisId, userId: user.id },
      include: { imageFile: true },
    })

    if (!analysis) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const blobTarget = analysis.imageFile?.cloudinaryId || analysis.imageFile?.secureUrl || null
    if (blobTarget && process.env.BLOB_READ_WRITE_TOKEN) {
      try {
        await del(blobTarget)
      } catch (deleteError) {
        console.warn('Failed to delete medical image blob:', deleteError)
      }
    }

    await prisma.$transaction([
      prisma.medicalImageAnalysis.delete({ where: { id: analysis.id } }),
      analysis.imageFileId
        ? prisma.file.deleteMany({ where: { id: analysis.imageFileId } })
        : prisma.file.deleteMany({ where: { id: { in: [] } } }),
    ])

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting medical image history item:', error)
    return NextResponse.json(
      {
        error: 'Failed to delete history item',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
