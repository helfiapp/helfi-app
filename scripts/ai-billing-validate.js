#!/usr/bin/env node
/**
 * Compare total AI cost from Postgres vs OpenAI billing API.
 * Usage: node scripts/ai-billing-validate.js [days]
 * Defaults to last 30 days. Requires OPENAI_API_KEY and DATABASE_URL.
 */
const { PrismaClient } = require('@prisma/client')
const fetcher = global.fetch || require('node-fetch')
const prisma = new PrismaClient()

async function main() {
  const days = Number(process.argv[2] || 30)
  const end = new Date()
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000)
  const startStr = start.toISOString().split('T')[0]
  const endStr = end.toISOString().split('T')[0]

  const dbAgg = await prisma.aIUsageEvent.aggregate({
    where: { createdAt: { gte: start } },
    _sum: { costCents: true, promptTokens: true, completionTokens: true, totalTokens: true },
    _count: { _all: true },
  })

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    console.log('OPENAI_API_KEY not set; cannot compare to billing API.')
    return
  }

  // OpenAI billing usage endpoint (v1)
  const resp = await fetcher(`https://api.openai.com/v1/usage?start_date=${startStr}&end_date=${endStr}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  })
  const body = await resp.json()
  if (!resp.ok) {
    console.error('Failed to fetch OpenAI usage:', body)
    return
  }

  const apiCostUsd = Number(body.total_usage || 0) / 100 // OpenAI returns cents of USD by default

  const dbCostUsd = Number(dbAgg._sum?.costCents || 0) / 100
  const diff = dbCostUsd - apiCostUsd
  const diffPct = apiCostUsd > 0 ? (diff / apiCostUsd) * 100 : 0

  console.log(`Range: ${startStr} to ${endStr}`)
  console.log(`DB cost: $${dbCostUsd.toFixed(4)} from ${dbAgg._count?._all || 0} calls`)
  console.log(`OpenAI billed: $${apiCostUsd.toFixed(4)}`)
  console.log(`Difference: $${diff.toFixed(4)} (${diffPct.toFixed(2)}%)`)

  if (Math.abs(diffPct) > 5) {
    console.log('⚠️  Significant mismatch detected (>5%)')
  } else {
    console.log('✅ Costs are within 5% tolerance')
  }
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
