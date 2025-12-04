import { prisma } from '@/lib/prisma'

export async function getRunCostCents(runId: string, userId: string) {
  if (!runId || !userId) return { costCents: 0, count: 0 }
  const aggregate = await prisma.aIUsageEvent.aggregate({
    _sum: { costCents: true },
    _count: { _all: true },
    where: {
      runId,
      userId,
      success: true,
    },
  })
  return {
    costCents: Number(aggregate._sum.costCents || 0),
    count: Number(aggregate._count?._all || 0),
  }
}
