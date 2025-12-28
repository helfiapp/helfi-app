import { prisma } from '@/lib/prisma'

let ensured = false

async function ensureSessionRevocationTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "UserSessionRevocation" (
      "userId" TEXT PRIMARY KEY,
      "revokedAt" TIMESTAMP NOT NULL,
      "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `)
}

export async function getSessionRevokedAt(userId: string): Promise<Date | null> {
  if (!userId) return null
  try {
    if (!ensured) {
      await ensureSessionRevocationTable()
      ensured = true
    }
    const rows = await prisma.$queryRawUnsafe<Array<{ revokedAt: Date }>>(
      `SELECT "revokedAt" FROM "UserSessionRevocation" WHERE "userId" = $1`,
      userId
    )
    return rows[0]?.revokedAt ? new Date(rows[0].revokedAt) : null
  } catch (error) {
    console.error('❌ Failed to load session revocation:', error)
    return null
  }
}

export async function revokeUserSessions(userId: string): Promise<Date | null> {
  if (!userId) return null
  const now = new Date()
  try {
    if (!ensured) {
      await ensureSessionRevocationTable()
      ensured = true
    }
    await prisma.$executeRawUnsafe(
      `INSERT INTO "UserSessionRevocation" ("userId", "revokedAt")
       VALUES ($1, $2)
       ON CONFLICT ("userId") DO UPDATE SET "revokedAt" = EXCLUDED."revokedAt", "updatedAt" = NOW()`,
      userId,
      now
    )
    return now
  } catch (error) {
    console.error('❌ Failed to revoke user sessions:', error)
    return null
  }
}
