#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs')
const path = require('path')

const routePath = path.join(__dirname, '..', 'app', 'api', 'food-log', 'route.ts')
const guardRailsPath = path.join(__dirname, '..', 'GUARD_RAILS.md')

const fail = (message) => {
  console.error(`\n❌ Food-log date guard failed: ${message}\n`)
  process.exit(1)
}

const routeSource = fs.readFileSync(routePath, 'utf8')
const guardRailsSource = fs.readFileSync(guardRailsPath, 'utf8')

const getStart = routeSource.indexOf('export async function GET(request: NextRequest)')
const getEnd = routeSource.indexOf('// Append a log entry (non-blocking usage recommended)')
if (getStart === -1 || getEnd === -1 || getEnd <= getStart) {
  fail('Could not locate GET /api/food-log block boundaries.')
}

const getBlock = routeSource.slice(getStart, getEnd)

const requireInGetBlock = (pattern, label) => {
  if (!pattern.test(getBlock)) fail(`${label} is missing in GET /api/food-log.`)
}

// Must keep: localDate is source of truth when present.
requireInGetBlock(
  /const\s+hasLocalDate\s*=\s*typeof\s+log\.localDate\s*===\s*'string'\s*&&\s*log\.localDate\.trim\(\)\.length\s*>\s*0/,
  'hasLocalDate source-of-truth check',
)
requireInGetBlock(
  /if\s*\(\s*hasLocalDate\s*\)\s*{\s*return\s+log\.localDate\s*===\s*validatedDateStr\s*}/s,
  'localDate exact-match return branch',
)

// Must keep: createdAt fallback only for missing localDate rows.
requireInGetBlock(
  /{\s*localDate:\s*validatedDateStr\s*},/,
  'query includes exact localDate match clause',
)
requireInGetBlock(
  /OR:\s*\[\s*{\s*localDate:\s*null\s*},\s*{\s*localDate:\s*''\s*}\s*],/,
  'query includes missing-localDate fallback clause',
)
requireInGetBlock(
  /createdAt:\s*{\s*gte:\s*queryStart,\s*lte:\s*queryEnd\s*},/,
  'query includes createdAt window for fallback clause',
)

// Must keep: auto-heal only missing localDate.
requireInGetBlock(
  /filter\(\(l\)\s*=>\s*!\(typeof\s+l\.localDate\s*===\s*'string'\s*&&\s*l\.localDate\.trim\(\)\.length\s*>\s*0\)\)/,
  'auto-heal restricted to missing localDate',
)

// Must not come back: old boundary override logic that leaked entries across days.
if (/shouldInclude\s*=\s*matchesDate\s*\|\|\s*isInWindow/.test(getBlock)) {
  fail('Found old matchesDate || isInWindow logic (day-leak risk).')
}
if (/if\s*\(\s*log\.localDate\s*===\s*validatedDateStr\s*\)\s*return\s+true;/.test(getBlock)) {
  fail('Found old localDate short-circuit that bypasses source-of-truth branch.')
}
if (/Include entries created within the wider query window/.test(getBlock)) {
  fail('Found old broad createdAt query clause comment (day-leak risk).')
}

// Guard rails doc must keep lock note.
if (
  !guardRailsSource.includes('Build guard `scripts/assert-food-log-date-guard.js`') ||
  !guardRailsSource.includes('localDate source-of-truth')
) {
  fail('Guard rails lock note for food-log date guard is missing.')
}

console.log('✅ Food-log date guard check passed.')
