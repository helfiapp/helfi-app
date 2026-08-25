import { PrismaClient } from '@prisma/client'

async function main() {

const prisma = new PrismaClient()
const bucket = process.env.AWS_S3_BUCKET
const region = process.env.AWS_S3_REGION || process.env.AWS_REGION
const applyChanges = process.env.APPLY_CHANGES === '1'

if (!bucket || !region) throw new Error('AWS_S3_BUCKET and AWS_S3_REGION are required.')

const baseUrl = `https://${bucket}.s3.${region}.amazonaws.com`
const isVercelBlobUrl = (value: string) => value.includes('blob.vercel-storage.com')

const toS3Url = (value: string) => {
  if (!isVercelBlobUrl(value)) return value
  const parsed = new URL(value)
  const pathname = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''))
  const encoded = pathname.split('/').map((part) => encodeURIComponent(part)).join('/')
  return `${baseUrl}/${encoded}`
}

const replaceJson = (value: unknown): { value: unknown; changed: boolean } => {
  if (typeof value === 'string') {
    const next = isVercelBlobUrl(value) ? toS3Url(value) : value
    return { value: next, changed: next !== value }
  }
  if (Array.isArray(value)) {
    let changed = false
    const next = value.map((item) => {
      const result = replaceJson(item)
      changed ||= result.changed
      return result.value
    })
    return { value: next, changed }
  }
  if (value && typeof value === 'object') {
    let changed = false
    const next: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) {
      const result = replaceJson(item)
      changed ||= result.changed
      next[key] = result.value
    }
    return { value: next, changed }
  }
  return { value, changed: false }
}

const replaceStoredString = (value: string) => {
  if (!isVercelBlobUrl(value)) return value
  try {
    const parsed = JSON.parse(value)
    const replaced = replaceJson(parsed)
    if (replaced.changed) return JSON.stringify(replaced.value)
  } catch {
    // Plain URLs are handled below.
  }
  return toS3Url(value)
}

const counts: Record<string, number> = {
  users: 0,
  supplements: 0,
  medications: 0,
  foodLogs: 0,
  files: 0,
  reports: 0,
  moodJournalEntries: 0,
}

const users = await prisma.user.findMany({
  where: { image: { contains: 'blob.vercel-storage.com' } },
  select: { id: true, image: true },
})
counts.users = users.length
if (applyChanges) {
  for (const row of users) {
    await prisma.user.update({ where: { id: row.id }, data: { image: replaceStoredString(row.image || '') } })
  }
}

const supplements = await prisma.supplement.findMany({
  where: { imageUrl: { contains: 'blob.vercel-storage.com' } },
  select: { id: true, imageUrl: true },
})
counts.supplements = supplements.length
if (applyChanges) {
  for (const row of supplements) {
    await prisma.supplement.update({ where: { id: row.id }, data: { imageUrl: replaceStoredString(row.imageUrl || '') } })
  }
}

const medications = await prisma.medication.findMany({
  where: { imageUrl: { contains: 'blob.vercel-storage.com' } },
  select: { id: true, imageUrl: true },
})
counts.medications = medications.length
if (applyChanges) {
  for (const row of medications) {
    await prisma.medication.update({ where: { id: row.id }, data: { imageUrl: replaceStoredString(row.imageUrl || '') } })
  }
}

const foodLogs = await prisma.foodLog.findMany({
  where: { imageUrl: { contains: 'blob.vercel-storage.com' } },
  select: { id: true, imageUrl: true },
})
counts.foodLogs = foodLogs.length
if (applyChanges) {
  for (const row of foodLogs) {
    await prisma.foodLog.update({ where: { id: row.id }, data: { imageUrl: replaceStoredString(row.imageUrl || '') } })
  }
}

const allFiles = await prisma.file.findMany({
  select: { id: true, cloudinaryUrl: true, secureUrl: true, metadata: true },
})
const files = allFiles.filter((row) =>
  isVercelBlobUrl(row.cloudinaryUrl) ||
  isVercelBlobUrl(row.secureUrl) ||
  replaceJson(row.metadata).changed,
)
counts.files = files.length
if (applyChanges) {
  for (const row of files) {
    const metadata = replaceJson(row.metadata)
    await prisma.file.update({
      where: { id: row.id },
      data: {
        cloudinaryUrl: toS3Url(row.cloudinaryUrl),
        secureUrl: toS3Url(row.secureUrl),
        ...(metadata.changed ? { metadata: metadata.value as any } : {}),
      },
    })
  }
}

const reports = await prisma.report.findMany({
  select: { id: true, metadata: true },
})
const changedReports = reports
  .map((row) => ({ ...row, replaced: replaceJson(row.metadata) }))
  .filter((row) => row.replaced.changed)
counts.reports = changedReports.length
if (applyChanges) {
  for (const row of changedReports) {
    await prisma.report.update({ where: { id: row.id }, data: { metadata: row.replaced.value as any } })
  }
}

const moodRows = await prisma.$queryRawUnsafe<Array<{ id: string; images: unknown; audio: unknown }>>(
  'SELECT id, images, audio FROM MoodJournalEntries',
).catch(() => [])
for (const row of moodRows) {
  const images = replaceJson(row.images)
  const audio = replaceJson(row.audio)
  if (!images.changed && !audio.changed) continue
  counts.moodJournalEntries += 1
  if (applyChanges) {
    await prisma.$executeRawUnsafe(
      `UPDATE MoodJournalEntries SET images = $1::jsonb, audio = $2::jsonb, updatedAt = NOW() WHERE id = $3`,
      JSON.stringify(images.value),
      JSON.stringify(audio.value),
      row.id,
    )
  }
}

console.log(JSON.stringify({ mode: applyChanges ? 'applied' : 'dry-run', counts }, null, 2))
await prisma.$disconnect()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
