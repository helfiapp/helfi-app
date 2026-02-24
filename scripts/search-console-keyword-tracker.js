#!/usr/bin/env node

const fs = require('fs')
const crypto = require('crypto')

const BASE_KEYWORDS = [
  'food calorie tracking',
  'calorie tracker',
  'ai calorie tracker',
  'ai food tracker',
  'ai food calorie tracker',
  'ai health report',
]

function base64UrlEncode(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

function buildJwt(clientEmail, privateKey) {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const payload = {
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/webmasters.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }

  const encodedHeader = base64UrlEncode(JSON.stringify(header))
  const encodedPayload = base64UrlEncode(JSON.stringify(payload))
  const signingInput = `${encodedHeader}.${encodedPayload}`

  const signer = crypto.createSign('RSA-SHA256')
  signer.update(signingInput)
  signer.end()
  const signature = signer.sign(privateKey, 'base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')

  return `${signingInput}.${signature}`
}

async function getAccessToken(credentials) {
  const assertion = buildJwt(credentials.client_email, credentials.private_key)
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  })

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Token request failed: ${response.status} ${errorText}`)
  }

  const data = await response.json()
  return data.access_token
}

function formatDate(date) {
  return date.toISOString().slice(0, 10)
}

function parseArgs() {
  const args = process.argv.slice(2)
  const options = {
    days: 28,
    site: 'sc-domain:helfi.ai',
  }

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    if (arg === '--days' && args[i + 1]) {
      options.days = Math.max(1, Number(args[i + 1]) || 28)
      i += 1
      continue
    }
    if (arg === '--site' && args[i + 1]) {
      options.site = args[i + 1]
      i += 1
    }
  }

  return options
}

function buildTargetKeywords() {
  const withApp = BASE_KEYWORDS.map((keyword) => `${keyword} app`)
  return Array.from(new Set([...BASE_KEYWORDS, ...withApp]))
}

function printRows(rows, rangeLabel) {
  console.log(`\nKeyword tracking for ${rangeLabel}`)
  console.log('-------------------------------------------------------------')
  console.log('Keyword | Clicks | Impressions | CTR | Avg position')
  console.log('-------------------------------------------------------------')

  rows.forEach((row) => {
    const position = row.position > 0 ? row.position.toFixed(2) : '-'
    console.log(
      `${row.keyword} | ${row.clicks} | ${row.impressions} | ${row.ctr.toFixed(2)}% | ${position}`
    )
  })

  const totals = rows.reduce(
    (acc, row) => {
      acc.clicks += row.clicks
      acc.impressions += row.impressions
      acc.ctrWeightedClicks += row.clicks
      return acc
    },
    { clicks: 0, impressions: 0, ctrWeightedClicks: 0 }
  )

  const overallCtr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0
  console.log('-------------------------------------------------------------')
  console.log(
    `TOTAL | ${totals.clicks} | ${totals.impressions} | ${overallCtr.toFixed(2)}% | -`
  )
}

async function main() {
  const { days, site } = parseArgs()
  const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS

  if (!keyPath) {
    console.error('Missing GOOGLE_APPLICATION_CREDENTIALS env var.')
    console.error('Example:')
    console.error('export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account.json"')
    process.exit(1)
  }

  if (!fs.existsSync(keyPath)) {
    console.error(`Credential file not found: ${keyPath}`)
    process.exit(1)
  }

  const credentials = JSON.parse(fs.readFileSync(keyPath, 'utf8'))
  const accessToken = await getAccessToken(credentials)

  const endDate = new Date()
  const startDate = new Date()
  startDate.setDate(endDate.getDate() - (days - 1))

  const response = await fetch(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        startDate: formatDate(startDate),
        endDate: formatDate(endDate),
        dimensions: ['query'],
        rowLimit: 25000,
      }),
    }
  )

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Search Console query failed: ${response.status} ${errorText}`)
  }

  const payload = await response.json()
  const rows = payload.rows || []
  const rowsByQuery = new Map()

  rows.forEach((row) => {
    const query = String(row.keys?.[0] || '').trim().toLowerCase()
    if (!query) return
    rowsByQuery.set(query, row)
  })

  const targets = buildTargetKeywords()
  const reportRows = targets.map((keyword) => {
    const raw = rowsByQuery.get(keyword.toLowerCase())
    const clicks = Number(raw?.clicks || 0)
    const impressions = Number(raw?.impressions || 0)
    const ctr = Number(raw?.ctr || 0) * 100
    const position = Number(raw?.position || 0)
    return { keyword, clicks, impressions, ctr, position }
  })

  printRows(
    reportRows,
    `${formatDate(startDate)} to ${formatDate(endDate)} (${days} days), property ${site}`
  )
}

main().catch((error) => {
  console.error(`\nFailed: ${error.message}`)
  process.exit(1)
})
