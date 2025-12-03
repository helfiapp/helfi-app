#!/usr/bin/env node
/**
 * Backfill AI usage events from the legacy vision log into Postgres.
 * Usage: node scripts/backfill-ai-usage.js [pathToLog]
 */
const fs = require('fs')
const path = require('path')
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const logPath = process.argv[2] || path.join(process.cwd(), 'openai-usage', 'vision-usage.log')
  if (!fs.existsSync(logPath)) {
    console.log('No legacy log found at', logPath)
    return
  }
  const lines = fs.readFileSync(logPath, 'utf8').split('\n').filter(Boolean)
  let inserted = 0
  for (const line of lines) {
    try {
      const row = JSON.parse(line)
      await prisma.aIUsageEvent.create({
        data: {
          feature: row.feature || 'unknown',
          userId: row.userId || null,
          userLabel: row.userLabel || null,
          scanId: row.scanId || null,
          model: row.model || 'unknown',
          promptTokens: Number(row.promptTokens || 0),
          completionTokens: Number(row.completionTokens || 0),
          totalTokens: Number(row.promptTokens || 0) + Number(row.completionTokens || 0),
          costCents: Number(row.costCents || 0),
          imageWidth: row.imageWidth ?? null,
          imageHeight: row.imageHeight ?? null,
          imageBytes: row.imageBytes ?? null,
          imageMime: row.imageMime ?? null,
          endpoint: row.endpoint || null,
          success: true,
          detail: 'backfill:legacy-log',
          createdAt: row.timestamp ? new Date(row.timestamp) : undefined,
        },
      })
      inserted++
    } catch (err) {
      console.warn('skip malformed line', err?.message)
    }
  }
  console.log(`Backfill complete. Inserted ${inserted} rows from ${logPath}`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
