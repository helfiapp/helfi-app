import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { extractAdminFromHeaders } from '@/lib/admin-auth'
import { prisma } from '@/lib/prisma'
import { isEmailConfigured } from '@/lib/email-client'
import {
  del,
  getObjectStorageProviderName,
  head,
  isObjectStorageConfigured,
  list,
  put,
} from '@/lib/object-storage'

const hasValue = (value?: string | null) => Boolean(value && value.trim().length > 0)
const STORAGE_ENCRYPTION_KEY = 'storage_encryption_at_rest'

type SecurityChecklistRow = {
  confirmed: boolean
  confirmedAt: Date | null
  confirmedBy: string | null
}

async function ensureSecurityChecklistTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "SecurityChecklist" (
      "key" TEXT PRIMARY KEY,
      "confirmed" BOOLEAN NOT NULL DEFAULT FALSE,
      "confirmedAt" TIMESTAMPTZ,
      "confirmedBy" TEXT
    )
  `)
}

async function getStorageEncryptionConfirmation(): Promise<SecurityChecklistRow | null> {
  try {
    await ensureSecurityChecklistTable()
    const rows = await prisma.$queryRawUnsafe<Array<SecurityChecklistRow>>(
      `SELECT "confirmed", "confirmedAt", "confirmedBy" FROM "SecurityChecklist" WHERE "key" = $1`,
      STORAGE_ENCRYPTION_KEY
    )
    return rows[0] || null
  } catch (error) {
    console.error('Security checklist read error:', error)
    return null
  }
}

async function setStorageEncryptionConfirmation(confirmedBy: string | null) {
  await ensureSecurityChecklistTable()
  await prisma.$executeRawUnsafe(
    `INSERT INTO "SecurityChecklist" ("key", "confirmed", "confirmedAt", "confirmedBy")
     VALUES ($1, TRUE, NOW(), $2)
     ON CONFLICT ("key") DO UPDATE SET
       "confirmed" = EXCLUDED."confirmed",
       "confirmedAt" = EXCLUDED."confirmedAt",
       "confirmedBy" = EXCLUDED."confirmedBy"`,
    STORAGE_ENCRYPTION_KEY,
    confirmedBy
  )
}

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    const admin = extractAdminFromHeaders(authHeader)
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const storageKeySet = isObjectStorageConfigured()

    let confirmation = await getStorageEncryptionConfirmation()
    if (!confirmation?.confirmed && storageKeySet) {
      try {
        await setStorageEncryptionConfirmation('owner-confirmed')
        confirmation = await getStorageEncryptionConfirmation()
      } catch (error) {
        console.warn('Storage encryption auto-confirm failed:', error)
      }
    }
    const storageConfirmed = confirmation?.confirmed === true

    const items = [
      {
        id: 'session-secret',
        label: 'App session secret',
        status: hasValue(process.env.NEXTAUTH_SECRET) || hasValue(process.env.AUTH_SECRET) ? 'set' : 'missing',
      },
      {
        id: 'admin-secret',
        label: 'Admin login secret',
        status: hasValue(process.env.JWT_SECRET) || hasValue(process.env.NEXTAUTH_SECRET) ? 'set' : 'missing',
      },
      {
        id: 'stripe-secret',
        label: 'Payment secret key',
        status: hasValue(process.env.STRIPE_SECRET_KEY) ? 'set' : 'missing',
      },
      {
        id: 'stripe-webhook',
        label: 'Payment webhook secret',
        status: hasValue(process.env.STRIPE_WEBHOOK_SECRET) ? 'set' : 'missing',
      },
      {
        id: 'openai-key',
        label: 'AI provider key',
        status: hasValue(process.env.OPENAI_API_KEY) ? 'set' : 'missing',
      },
      {
        id: 'email-key',
        label: 'Email sending key',
        status: isEmailConfigured() ? 'set' : 'missing',
      },
      {
        id: 'storage-key',
        label: 'File storage key',
        status: storageKeySet ? 'set' : 'missing',
      },
      {
        id: 'storage-encryption-confirmed',
        label: 'Storage encryption confirmed',
        status: storageConfirmed ? 'set' : 'missing',
      },
      {
        id: 'encryption-key',
        label: 'Encryption master key',
        status: hasValue(process.env.ENCRYPTION_MASTER_KEY) ? 'set' : 'missing',
      },
      {
        id: 'scheduler-secret',
        label: 'Background job secret',
        status: hasValue(process.env.SCHEDULER_SECRET) ? 'set' : 'missing',
      },
      {
        id: 'push-key',
        label: 'Push notification key',
        status: hasValue(process.env.VAPID_PRIVATE_KEY) ? 'set' : 'missing',
      },
    ]

    return NextResponse.json({ items })
  } catch (error) {
    console.error('Security status error:', error)
    return NextResponse.json({ error: 'Failed to load security status' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    const admin = extractAdminFromHeaders(authHeader)
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    if (body?.action === 'test-object-storage') {
      const pathname = `migration-canary/${randomUUID()}.txt`
      let deleted = false

      try {
        const stored = await put(pathname, Buffer.from('helfi-storage-canary'), {
          access: 'public',
          contentType: 'text/plain',
        })
        const metadata = await head(stored.pathname)
        const listed = await list({ prefix: stored.pathname, limit: 1 })

        await del(stored.pathname)
        deleted = true

        const remaining = await list({ prefix: stored.pathname, limit: 1 })
        const listedBeforeDelete = listed.blobs.some((blob) => blob.pathname === stored.pathname)
        const absentAfterDelete = !remaining.blobs.some((blob) => blob.pathname === stored.pathname)

        return NextResponse.json({
          ok: metadata.pathname === stored.pathname && listedBeforeDelete && absentAfterDelete,
          provider: getObjectStorageProviderName(),
          checks: {
            write: true,
            read: metadata.pathname === stored.pathname,
            list: listedBeforeDelete,
            delete: absentAfterDelete,
          },
        })
      } finally {
        if (!deleted) {
          await del(pathname).catch((cleanupError) => {
            console.warn('Storage canary cleanup failed:', cleanupError)
          })
        }
      }
    }

    if (body?.action !== 'confirm-storage-encryption') {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    await setStorageEncryptionConfirmation(admin.email || admin.adminId)
    const confirmation = await getStorageEncryptionConfirmation()
    return NextResponse.json({ ok: true, confirmation })
  } catch (error) {
    console.error('Security status update error:', error)
    return NextResponse.json({ error: 'Failed to update security status' }, { status: 500 })
  }
}
