import { prisma } from '@/lib/prisma'

export async function getRunCostCents(runId: string, userId: string) {
  if (!runId || !userId) return { costCents: 0, count: 0, promptTokens: 0, completionTokens: 0 }
  const aggregate = await prisma.aIUsageEvent.aggregate({
    _sum: { costCents: true, promptTokens: true, completionTokens: true },
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
    promptTokens: Number(aggregate._sum.promptTokens || 0),
    completionTokens: Number(aggregate._sum.completionTokens || 0),
  }
}
