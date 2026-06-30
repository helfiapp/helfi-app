import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getUserIdFromNativeAuth } from '@/lib/native-auth'
import { prisma } from '@/lib/prisma'
import { del } from '@vercel/blob'

async function getMedicalImageUser(request: NextRequest) {
  const nativeUserId = await getUserIdFromNativeAuth(request)
  if (nativeUserId) {
    return prisma.user.findUnique({ where: { id: nativeUserId } })
  }

  const session = await getServerSession(authOptions)
  const email = String(session?.user?.email || '').trim().toLowerCase()
  if (!email) return null
  return prisma.user.findUnique({ where: { email } })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getMedicalImageUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
        console.warn('Failed to delete health image note file:', deleteError)
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
    console.error('Error deleting health image notes history item:', error)
    return NextResponse.json(
      {
        error: 'Failed to delete history item',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
