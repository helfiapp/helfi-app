import { prisma } from '@/lib/prisma'

export async function ensureMoodTables() {
  // Keep Mood Tracker storage isolated to avoid touching Prisma migrations.
  // Uses JSONB for flexible optional context and tags.
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS MoodEntries (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      localDate TEXT NOT NULL,
      timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      mood INTEGER NOT NULL,
      tags JSONB NOT NULL DEFAULT '[]'::jsonb,
      note TEXT NOT NULL DEFAULT '',
      context JSONB NOT NULL DEFAULT '{}'::jsonb
    )
  `)

  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_moodentries_user_timestamp ON MoodEntries(userId, timestamp DESC)`).catch(() => {})
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_moodentries_user_localdate ON MoodEntries(userId, localDate)`).catch(() => {})
}

