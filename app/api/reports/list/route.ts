import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const reports = await prisma.report.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: {
      id: true,
      originalFileName: true,
      status: true,
      createdAt: true,
      processingError: true,
    },
  })

  return NextResponse.json({
    reports: reports.map((report) => ({
      id: report.id,
      originalFileName: report.originalFileName,
      status: report.status,
      createdAt: report.createdAt.toISOString(),
      processingError: report.processingError,
    })),
  })
}
