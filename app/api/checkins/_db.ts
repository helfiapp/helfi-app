import { prisma } from '@/lib/prisma'

export async function ensureCheckinTables() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS CheckinSettings (
      userId TEXT PRIMARY KEY,
      enabled BOOLEAN NOT NULL DEFAULT true,
      time1 TEXT NOT NULL,
      time2 TEXT NOT NULL,
      time3 TEXT NOT NULL,
      time4 TEXT NOT NULL,
      timezone TEXT NOT NULL,
      frequency INTEGER NOT NULL DEFAULT 3
    )
  `)

  await prisma
    .$executeRawUnsafe(
      `ALTER TABLE CheckinSettings ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT true`
    )
    .catch(() => {})
  await prisma
    .$executeRawUnsafe(
      `ALTER TABLE CheckinSettings ADD COLUMN IF NOT EXISTS time2 TEXT NOT NULL DEFAULT '18:30'`
    )
    .catch(() => {})
  await prisma
    .$executeRawUnsafe(
      `ALTER TABLE CheckinSettings ADD COLUMN IF NOT EXISTS time3 TEXT NOT NULL DEFAULT '21:30'`
    )
    .catch(() => {})
  await prisma
    .$executeRawUnsafe(
      `ALTER TABLE CheckinSettings ADD COLUMN IF NOT EXISTS time4 TEXT NOT NULL DEFAULT '09:00'`
    )
    .catch(() => {})
  await prisma
    .$executeRawUnsafe(
      `ALTER TABLE CheckinSettings ADD COLUMN IF NOT EXISTS frequency INTEGER NOT NULL DEFAULT 3`
    )
    .catch(() => {})

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS ReminderDeliveryLog (
      userId TEXT NOT NULL,
      reminderTime TEXT NOT NULL,
      sentDate DATE NOT NULL,
      sentAt TIMESTAMP NOT NULL DEFAULT NOW(),
      PRIMARY KEY (userId, reminderTime, sentDate)
    )
  `)
}
