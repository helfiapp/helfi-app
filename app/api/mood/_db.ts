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

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS MoodJournalEntries (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      localDate TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      images JSONB NOT NULL DEFAULT '[]'::jsonb,
      createdAt TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updatedAt TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_moodjournal_user_created ON MoodJournalEntries(userId, createdAt DESC)`).catch(() => {})
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_moodjournal_user_localdate ON MoodJournalEntries(userId, localDate)`).catch(() => {})

  // Mood reminder preferences (push notifications) and delivery log.
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS MoodReminderSettings (
      userId TEXT PRIMARY KEY,
      enabled BOOLEAN NOT NULL DEFAULT FALSE,
      time1 TEXT NOT NULL DEFAULT '20:00',
      time2 TEXT NOT NULL DEFAULT '12:00',
      time3 TEXT NOT NULL DEFAULT '18:00',
      timezone TEXT NOT NULL DEFAULT 'UTC',
      frequency INTEGER NOT NULL DEFAULT 1
    )
  `)

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS MoodReminderDeliveryLog (
      userId TEXT NOT NULL,
      reminderTime TEXT NOT NULL,
      sentDate DATE NOT NULL,
      sentAt TIMESTAMP NOT NULL DEFAULT NOW(),
      PRIMARY KEY (userId, reminderTime, sentDate)
    )
  `)
}
