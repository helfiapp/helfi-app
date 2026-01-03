import { prisma } from '@/lib/prisma'
import { randomUUID } from 'crypto'

export type InboxNotification = {
  id: string
  userId: string
  title: string
  body: string | null
  url: string | null
  type: string | null
  status: 'unread' | 'read'
  source: string | null
  eventKey: string | null
  metadata: Record<string, unknown> | null
  createdAt: string
  readAt: string | null
}

let inboxTablesEnsured = false

export async function ensureNotificationInboxTable() {
  if (inboxTablesEnsured) return
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS NotificationInbox (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT,
        url TEXT,
        type TEXT,
        status TEXT NOT NULL DEFAULT 'unread',
        source TEXT,
        eventKey TEXT,
        metadata JSONB,
        createdAt TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        readAt TIMESTAMPTZ
      )
    `)
    await prisma.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS idx_notification_inbox_user_created ON NotificationInbox(userId, createdAt DESC)'
    ).catch(() => {})
    await prisma.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS idx_notification_inbox_user_status ON NotificationInbox(userId, status)'
    ).catch(() => {})
    await prisma.$executeRawUnsafe(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_inbox_user_event ON NotificationInbox(userId, eventKey) WHERE eventKey IS NOT NULL"
    ).catch(() => {})
    inboxTablesEnsured = true
  } catch (error) {
    console.error('[notifications] Failed to ensure inbox table', error)
  }
}

function normalizeInboxRow(row: any): InboxNotification | null {
  if (!row) return null
  return {
    id: row.id,
    userId: row.userId,
    title: row.title,
    body: row.body ?? null,
    url: row.url ?? null,
    type: row.type ?? null,
    status: row.status === 'read' ? 'read' : 'unread',
    source: row.source ?? null,
    eventKey: row.eventKey ?? null,
    metadata: row.metadata ?? null,
    createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : new Date().toISOString(),
    readAt: row.readAt ? new Date(row.readAt).toISOString() : null,
  }
}

export async function createInboxNotification(params: {
  userId: string
  title: string
  body?: string | null
  url?: string | null
  type?: string | null
  source?: string | null
  eventKey?: string | null
  metadata?: Record<string, unknown> | null
}) {
  await ensureNotificationInboxTable()
  if (!params.userId || !params.title) return null
  const id = randomUUID()
  const body = params.body ?? null
  const url = params.url ?? null
  const type = params.type ?? null
  const source = params.source ?? null
  const eventKey = params.eventKey ?? null
  const metadata = params.metadata ?? null
  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO NotificationInbox (id, userId, title, body, url, type, status, source, eventKey, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,'unread',$7,$8,$9::jsonb)
       ON CONFLICT DO NOTHING`,
      id,
      params.userId,
      params.title,
      body,
      url,
      type,
      source,
      eventKey,
      JSON.stringify(metadata)
    )
  } catch (error) {
    console.warn('[notifications] Failed to create inbox item', error)
    return null
  }
  return id
}

export async function consumePendingNotificationOpen(
  userId: string,
  options?: { withinMinutes?: number; types?: string[]; sources?: string[] }
): Promise<{ id: string; url: string } | null> {
  await ensureNotificationInboxTable()
  const withinMinutes = Math.min(Math.max(Number(options?.withinMinutes ?? 10), 1), 180)
  const types = Array.isArray(options?.types) && options.types.length > 0 ? options.types : null
  const sources = Array.isArray(options?.sources) && options.sources.length > 0 ? options.sources : null

  try {
    const rows: Array<{ id: string; url: string | null }> = await prisma.$queryRawUnsafe(
      `SELECT id, url
       FROM NotificationInbox
       WHERE userId = $1
         AND url IS NOT NULL
         AND ($2::text[] IS NULL OR type = ANY($2))
         AND ($3::text[] IS NULL OR source = ANY($3))
         AND (metadata->>'launchConsumedAt' IS NULL OR metadata->>'launchConsumedAt' = '')
         AND createdAt >= NOW() - ($4 * INTERVAL '1 minute')
       ORDER BY createdAt DESC
       LIMIT 1`,
      userId,
      types,
      sources,
      withinMinutes
    )

    const row = rows?.[0]
    if (!row?.id || !row?.url) return null

    await prisma.$executeRawUnsafe(
      `UPDATE NotificationInbox
       SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{launchConsumedAt}', to_jsonb(NOW()::text), true)
       WHERE id = $1 AND userId = $2`,
      row.id,
      userId
    )

    return { id: row.id, url: row.url }
  } catch (error) {
    console.warn('[notifications] Failed to consume pending open', error)
    return null
  }
}

export async function listInboxNotifications(
  userId: string,
  options?: { limit?: number; offset?: number; status?: 'unread' | 'read' | 'all' }
): Promise<InboxNotification[]> {
  await ensureNotificationInboxTable()
  const limit = Math.min(Math.max(Number(options?.limit || 30), 1), 100)
  const offset = Math.max(Number(options?.offset || 0), 0)
  const status = options?.status && options.status !== 'all' ? options.status : null
  try {
    const rows: any[] = status
      ? await prisma.$queryRawUnsafe(
          `SELECT * FROM NotificationInbox WHERE userId = $1 AND status = $2 ORDER BY createdAt DESC LIMIT $3 OFFSET $4`,
          userId,
          status,
          limit,
          offset
        )
      : await prisma.$queryRawUnsafe(
          `SELECT * FROM NotificationInbox WHERE userId = $1 ORDER BY createdAt DESC LIMIT $2 OFFSET $3`,
          userId,
          limit,
          offset
        )
    return rows.map(normalizeInboxRow).filter(Boolean) as InboxNotification[]
  } catch (error) {
    console.warn('[notifications] Failed to list inbox items', error)
    return []
  }
}

export async function countUnreadNotifications(userId: string): Promise<number> {
  await ensureNotificationInboxTable()
  try {
    const rows: Array<{ count: string }> = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::text AS count FROM NotificationInbox WHERE userId = $1 AND status = 'unread'`,
      userId
    )
    const count = rows?.[0]?.count ? parseInt(rows[0].count, 10) : 0
    return Number.isFinite(count) ? count : 0
  } catch (error) {
    console.warn('[notifications] Failed to count unread', error)
    return 0
  }
}

export async function markNotificationRead(userId: string, id: string) {
  await ensureNotificationInboxTable()
  try {
    await prisma.$executeRawUnsafe(
      `UPDATE NotificationInbox SET status = 'read', readAt = NOW() WHERE id = $1 AND userId = $2`,
      id,
      userId
    )
    return true
  } catch (error) {
    console.warn('[notifications] Failed to mark read', error)
    return false
  }
}

export async function markAllNotificationsRead(userId: string) {
  await ensureNotificationInboxTable()
  try {
    await prisma.$executeRawUnsafe(
      `UPDATE NotificationInbox SET status = 'read', readAt = NOW() WHERE userId = $1 AND status = 'unread'`,
      userId
    )
    return true
  } catch (error) {
    console.warn('[notifications] Failed to mark all read', error)
    return false
  }
}
