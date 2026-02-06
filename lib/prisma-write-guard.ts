import type { PrismaClient } from '@prisma/client'
import { createWriteGuard, hashPayload } from '@/lib/write-guard'

const WRITE_GUARD_WINDOW_MS = 30 * 1000
const WRITE_ACTIONS = new Set(['create', 'createMany', 'update', 'updateMany', 'upsert', 'delete', 'deleteMany'])

export const attachWriteGuard = (prisma: PrismaClient) => {
  const guard = createWriteGuard(prisma)

  prisma.$use(async (params, next) => {
    if (!WRITE_ACTIONS.has(params.action)) return next(params)
    if (!params.model) return next(params)

    const args = params.args || {}
    const data = args.data || {}
    const where = args.where || {}

    const ownerKey =
      (data && typeof data === 'object' && (data.userId || data.id)) ||
      (where && typeof where === 'object' && (where.userId || where.id))

    if (!ownerKey) return next(params)

    const scope = `${params.model}:${params.action}:${String(ownerKey)}`
    const payloadHash = hashPayload({ data, where, action: params.action })
    if (!payloadHash) return next(params)

    const guardResult = await guard.readGuard({
      ownerKey: String(ownerKey),
      scope,
      payloadHash,
      windowMs: WRITE_GUARD_WINDOW_MS,
    })

    if (guardResult.skip) {
      const modelClient: any = (prisma as any)[params.model]
      if (modelClient && typeof modelClient.findFirst === 'function' && Object.keys(where || {}).length > 0) {
        return modelClient.findFirst({ where })
      }
      if (guardResult.lastRecordId && modelClient && typeof modelClient.findUnique === 'function') {
        return modelClient.findUnique({ where: { id: guardResult.lastRecordId } })
      }
      if (params.action.endsWith('Many')) {
        return { count: 0 }
      }
      return next(params)
    }

    const result = await next(params)

    if (params.action === 'create' || params.action === 'update' || params.action === 'upsert') {
      const recordId =
        (result && typeof result === 'object' && (result as any).id) ||
        (data && typeof data === 'object' && (data as any).id) ||
        (where && typeof where === 'object' && (where as any).id) ||
        null
      await guard.recordWrite({
        ownerKey: String(ownerKey),
        scope,
        payloadHash,
        recordId,
      })
    }

    return result
  })
}
