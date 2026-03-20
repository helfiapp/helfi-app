import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { del } from '@vercel/blob'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const report = await prisma.report.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        userId: true,
        status: true,
        s3Key: true,
        originalDeletedAt: true,
        consentRecordId: true,
      },
    })

    if (!report) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 })
    }

    if (report.userId !== session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    if (report.status === 'PROCESSING') {
      return NextResponse.json(
        { error: 'This report is still processing. Please wait and try again.' },
        { status: 409 }
      )
    }

    await prisma.$transaction(async (tx) => {
      await tx.auditEvent.updateMany({
        where: { reportId: report.id },
        data: { reportId: null },
      })

      await tx.labResult.deleteMany({
        where: { reportId: report.id },
      })

      await tx.report.delete({
        where: { id: report.id },
      })

      const remainingReports = await tx.report.count({
        where: { consentRecordId: report.consentRecordId },
      })

      if (remainingReports === 0) {
        await tx.consentRecord.deleteMany({
          where: { id: report.consentRecordId },
        })
      }
    })

    if (!report.originalDeletedAt && report.s3Key) {
      try {
        await del(report.s3Key)
      } catch (error) {
        console.error('Failed to delete lab report blob after report removal:', error)
      }
    }

    return NextResponse.json({
      success: true,
      deletedReportId: report.id,
    })
  } catch (error) {
    console.error('Failed to delete lab report:', error)
    return NextResponse.json(
      { error: 'Failed to delete report' },
      { status: 500 }
    )
  }
}
