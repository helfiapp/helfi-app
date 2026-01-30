import fs from 'fs'
import path from 'path'

const ROOT = process.cwd()
const INPUT_DIR = path.join(ROOT, 'data', 'food-import')
const OVERRIDES_DIR = path.join(ROOT, 'data', 'food-overrides')
const OUTPUT_FILE = path.join(ROOT, 'data', 'food-overrides', 'master_foods_macros.csv')
const OUTPUT_MISSING = path.join(ROOT, 'data', 'food-overrides', 'master_foods_macros_missing.csv')

const STAGING_BASE_URL = process.env.MASTER_FOOD_BASE_URL || 'https://stg.helfi.ai'
const CONCURRENCY = Number.parseInt(process.env.MASTER_FOOD_CONCURRENCY || '8', 10)
const DELAY_MS = Number.parseInt(process.env.MASTER_FOOD_DELAY_MS || '0', 10)

const normalizeText = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')

const STOP_TOKENS = new Set([
  'and',
  'or',
  'with',
  'without',
  'of',
  'the',
  'a',
  'an',
  'raw',
  'fresh',
  'cooked',
  'uncooked',
  'frozen',
  'pasteurized',
  'pasteurised',
  'boiled',
  'baked',
  'roasted',
  'fried',
  'grilled',
  'steamed',
  'sauteed',
  'smoked',
  'dried',
  'dry',
  'salted',
  'unsalted',
  'ground',
  'chopped',
  'sliced',
  'grated',
  'halved',
  'cubed',
  'whole',
  'small',
  'medium',
  'large',
])

function getCoreTokens(value) {
  const tokens = normalizeText(value).split(' ').filter(Boolean)
  return tokens.filter((t) => t.length >= 3 && !STOP_TOKENS.has(t))
}

function stripParentheses(value) {
  return String(value || '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractParentheticalTerms(value) {
  const raw = String(value || '')
  const matches = Array.from(raw.matchAll(/\(([^)]*)\)/g)).map((m) => String(m[1] || '').trim()).filter(Boolean)
  const terms = []
  for (const m of matches) {
    m.split(/[\/,]/g)
      .map((v) => v.trim())
      .filter(Boolean)
      .forEach((v) => terms.push(v))
  }
  return terms
}

function extractSlashParts(value) {
  const raw = String(value || '')
  if (!raw.includes('/')) return []
  return raw
    .split('/')
    .map((v) => v.trim())
    .filter(Boolean)
}

function pickFallbackQuery(value) {
  const tokens = getCoreTokens(value)
  if (tokens.length === 0) return null
  // Longest token tends to be most specific.
  return tokens.sort((a, b) => b.length - a.length)[0] || null
}

function normalizeCommonSpelling(value) {
  return String(value || '')
    .replace(/\byoghurt\b/gi, 'yogurt')
    .replace(/\bchilli\b/gi, 'chili')
    .replace(/\bbeetroot\b/gi, 'beet')
    .trim()
}

function getExtraSynonymQueries(name) {
  const n = normalizeText(name)
  const list = []
  if (n.includes('aubergine')) list.push('eggplant')
  if (n.includes('bok choy')) list.push('pak choi', 'cabbage chinese pak choi')
  if (n.includes('choy sum')) list.push('choysum', 'chinese flowering cabbage')
  if (n.includes('broccolini')) list.push('broccoli raab', 'broccoli')
  if (n.includes('daikon')) list.push('radish daikon', 'radish')
  if (n.includes('sultanas')) list.push('raisins')
  if (n.includes('silverbeet')) list.push('swiss chard', 'chard')
  if (n.includes('skyr')) list.push('skyr', 'yogurt skyr')
  if (n.includes('greek yoghurt') || n.includes('greek yogurt')) list.push('yogurt greek', 'greek yogurt')
  if (n.includes('pitaya')) list.push('dragon fruit')
  if (n.includes('dragon fruit')) list.push('pitaya')
  if (n.includes('pomelo')) list.push('grapefruit')
  return list
}

function parseCsvLine(line) {
  const cells = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    if (ch === '"') {
      const next = line[i + 1]
      if (inQuotes && next === '"') {
        current += '"'
        i += 1
        continue
      }
      inQuotes = !inQuotes
      continue
    }
    if (ch === ',' && !inQuotes) {
      cells.push(current)
      current = ''
      continue
    }
    current += ch
  }
  cells.push(current)
  return cells.map((c) => c.trim())
}

function parseCsv(text) {
  const rows = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
  if (rows.length === 0) return { headers: [], records: [] }
  const headers = parseCsvLine(rows[0]).map((h) => h.toLowerCase())
  const records = rows.slice(1).map((row) => parseCsvLine(row))
  return { headers, records }
}

function toNumber(value) {
  if (value == null) return null
  const n = Number(String(value).trim())
  return Number.isFinite(n) ? n : null
}

function safeCsv(value) {
  const raw = String(value ?? '')
  if (raw.includes('"') || raw.includes(',') || raw.includes('\n')) return `"${raw.replace(/"/g, '""')}"`
  return raw
}

function readCsvFile(filePath) {
  if (!fs.existsSync(filePath)) return null
  return fs.readFileSync(filePath, 'utf8')
}

function loadFoodNamesFromCsv(filePath, foodColumnName = 'food') {
  const content = readCsvFile(filePath)
  if (!content) return []
  const parsed = parseCsv(content)
  const idx = parsed.headers.indexOf(String(foodColumnName).toLowerCase())
  if (idx === -1) return []
  const names = []
  for (const row of parsed.records) {
    const name = String(row[idx] ?? '').trim()
    if (!name) continue
    names.push(name)
  }
  return names
}

function loadMacroOverrides() {
  const overrides = new Map()
  if (!fs.existsSync(OVERRIDES_DIR)) return overrides
  const files = fs.readdirSync(OVERRIDES_DIR).filter((f) => f.toLowerCase().endsWith('.csv'))
  for (const file of files) {
    const filePath = path.join(OVERRIDES_DIR, file)
    const content = readCsvFile(filePath)
    if (!content) continue
    const parsed = parseCsv(content)
    const headerIndex = new Map()
    parsed.headers.forEach((h, i) => headerIndex.set(h, i))

    const get = (row, key) => {
      const idx = headerIndex.get(key)
      if (idx == null) return ''
      return row[idx] ?? ''
    }

    const fiberKey = headerIndex.has('fiber_g') ? 'fiber_g' : headerIndex.has('fibre_g') ? 'fibre_g' : null

    for (const row of parsed.records) {
      const name = String(get(row, 'food') || '').trim()
      if (!name) continue
      if (!headerIndex.has('per_100g_kcal')) continue
      if (!headerIndex.has('protein_g')) continue
      if (!headerIndex.has('carbs_g')) continue
      if (!headerIndex.has('fat_g')) continue

      const calories = toNumber(get(row, 'per_100g_kcal'))
      const protein = toNumber(get(row, 'protein_g'))
      const carbs = toNumber(get(row, 'carbs_g'))
      const fat = toNumber(get(row, 'fat_g'))
      const fiber = fiberKey ? toNumber(get(row, fiberKey)) : null
      const sugar = headerIndex.has('sugar_g') ? toNumber(get(row, 'sugar_g')) : null

      if (calories == null || protein == null || carbs == null || fat == null) continue
      overrides.set(normalizeText(name), {
        name,
        calories,
        protein_g: protein,
        carbs_g: carbs,
        fat_g: fat,
        fiber_g: fiber,
        sugar_g: sugar,
        source: 'override',
      })
    }
  }
  return overrides
}

function scoreUsdaCandidate(candidateName, queryName) {
  const n = normalizeText(candidateName)
  const q = normalizeText(queryName)
  if (!n) return -9999

  let score = 0

  const coreTokens = getCoreTokens(queryName)
  const nameTokens = normalizeText(candidateName).split(' ').filter(Boolean)

  // Prefer plain raw foods unless the query explicitly says cooked/dry/etc.
  const wantsCooked = /\bcooked\b/i.test(queryName) || /\bboiled\b/i.test(queryName) || /\broasted\b/i.test(queryName)
  const wantsDry = /\bdry\b/i.test(queryName)
  const wantsRaw = /\braw\b/i.test(queryName) || (!wantsCooked && !wantsDry)

  if (wantsRaw && (n.includes(' raw') || n.includes(', raw'))) score += 40
  if (wantsCooked && (n.includes(' cooked') || n.includes(', cooked') || n.includes(' boiled'))) score += 30
  if (wantsDry && n.includes(' dry')) score += 15

  // Avoid obviously wrong “processed” results when searching for a basic ingredient.
  const badWords = ['juice', 'nectar', 'babyfood', 'baby food', 'formula', 'candy', 'cookie', 'bread', 'cake']
  if (badWords.some((w) => n.includes(w))) score -= 25

  // Closeness to the query.
  if (n === q) score += 60
  if (n.startsWith(q)) score += 45
  if (n.includes(` ${q}`) || n.includes(`, ${q}`)) score += 35

  // Reward candidates that contain more of the “core” words.
  if (coreTokens.length > 0 && nameTokens.length > 0) {
    let matched = 0
    for (const t of coreTokens) {
      if (nameTokens.some((w) => w.startsWith(t))) matched += 1
    }
    score += matched * 12
    if (matched >= Math.min(2, coreTokens.length)) score += 8
  }

  return score
}

async function fetchBestUsdaMacros(searchQuery, displayName) {
  const url = new URL('/api/food-data', STAGING_BASE_URL)
  url.searchParams.set('source', 'usda')
  url.searchParams.set('kind', 'single')
  url.searchParams.set('q', searchQuery)
  url.searchParams.set('limit', '50')
  url.searchParams.set('localOnly', '1')

  let lastErr = null
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const res = await fetch(url.toString(), { method: 'GET' })
      if (!res.ok) {
        lastErr = new Error(`HTTP ${res.status}`)
      } else {
        const data = await res.json().catch(() => null)
        const items = Array.isArray(data?.items) ? data.items : []
        const candidates = items
          .filter((it) => it && it.source === 'usda')
          .filter((it) => !it.__custom)
          .filter((it) => it.calories != null && it.protein_g != null && it.carbs_g != null && it.fat_g != null)
          .filter((it) => !it.brand)

        if (candidates.length === 0) return null

        let best = candidates[0]
        let bestScore = scoreUsdaCandidate(best.name, displayName)
        for (const it of candidates.slice(1)) {
          const s = scoreUsdaCandidate(it.name, displayName)
          if (s > bestScore) {
            best = it
            bestScore = s
          }
        }

        return {
          name: displayName,
          calories: toNumber(best.calories),
          protein_g: toNumber(best.protein_g),
          carbs_g: toNumber(best.carbs_g),
          fat_g: toNumber(best.fat_g),
          fiber_g: toNumber(best.fiber_g),
          sugar_g: toNumber(best.sugar_g),
          source: 'usda',
          usda_name: best.name,
        }
      }
    } catch (err) {
      lastErr = err
    }
    const wait = 200 * (attempt + 1)
    await new Promise((r) => setTimeout(r, wait))
  }
  if (lastErr) return null
  return null
}

async function main() {
  const overrideMap = loadMacroOverrides()

  const inputFiles = [
    path.join(INPUT_DIR, 'produce_global_canonical_v1.csv'),
    path.join(INPUT_DIR, 'fruit_veg_measurements.csv'),
    path.join(INPUT_DIR, 'dry_food_measurements.csv'),
    path.join(INPUT_DIR, 'dairy_semi_solid_measurements.csv'),
    path.join(INPUT_DIR, 'nuts_legumes_macros.csv'),
    path.join(INPUT_DIR, 'roasted_nut_variants_macros.csv'),
  ]

  const names = new Set()
  for (const filePath of inputFiles) {
    loadFoodNamesFromCsv(filePath, 'food').forEach((n) => names.add(n))
  }

  const allNames = Array.from(names).map((n) => String(n || '').trim()).filter(Boolean)
  allNames.sort((a, b) => normalizeText(a).localeCompare(normalizeText(b)))

  const results = []
  const missing = []

  console.log(`Building master macros list from ${allNames.length} foods…`)
  console.log(`Using USDA from: ${STAGING_BASE_URL}`)
  console.log(`Concurrency: ${Number.isFinite(CONCURRENCY) && CONCURRENCY > 0 ? CONCURRENCY : 8}`)

  const total = allNames.length
  let cursor = 0
  let completed = 0

  const pause = async (ms) => {
    if (!Number.isFinite(ms) || ms <= 0) return
    await new Promise((r) => setTimeout(r, ms))
  }

  const worker = async () => {
    while (true) {
      const idx = cursor
      cursor += 1
      if (idx >= total) return

      const name = allNames[idx]
      const key = normalizeText(name)
      if (!key) continue

      const override = overrideMap.get(key) || null
      if (override) {
        results.push(override)
      } else {
        const attempts = []
        const rawName = String(name || '').trim()
        attempts.push(rawName)
        const normalizedSpelling = normalizeCommonSpelling(rawName)
        if (normalizedSpelling && normalizedSpelling.toLowerCase() !== rawName.toLowerCase()) attempts.push(normalizedSpelling)

        extractSlashParts(rawName).forEach((part) => attempts.push(part))

        const stripped = stripParentheses(rawName)
        if (stripped && stripped.toLowerCase() !== rawName.toLowerCase()) attempts.push(stripped)
        extractParentheticalTerms(rawName).forEach((term) => attempts.push(term))

        const fallback = pickFallbackQuery(name)
        if (fallback) attempts.push(fallback)
        getExtraSynonymQueries(rawName).forEach((q) => attempts.push(q))

        const uniqueAttempts = Array.from(new Set(attempts.map((v) => String(v || '').trim()).filter(Boolean)))

        let found = null
        for (const q of uniqueAttempts) {
          found = await fetchBestUsdaMacros(q, name)
          if (found) break
        }

        if (!found || found.calories == null || found.protein_g == null || found.carbs_g == null || found.fat_g == null) {
          missing.push({ name })
        } else {
          results.push(found)
        }
        await pause(DELAY_MS)
      }

      completed += 1
      if (completed % 25 === 0 || completed === total) {
        console.log(`…${completed}/${total}`)
      }
    }
  }

  const workerCount = Number.isFinite(CONCURRENCY) && CONCURRENCY > 0 ? CONCURRENCY : 8
  await Promise.all(Array.from({ length: Math.min(workerCount, total) }, () => worker()))

  // De-dupe by name (last wins)
  const byName = new Map()
  for (const r of results) byName.set(normalizeText(r.name), r)
  const finalList = Array.from(byName.values()).sort((a, b) => normalizeText(a.name).localeCompare(normalizeText(b.name)))

  const header = [
    'food',
    'per_100g_kcal',
    'protein_g',
    'carbs_g',
    'fat_g',
    'fibre_g',
    'sugar_g',
    'auto_source',
    'auto_usda_name',
  ]

  const lines = [header.join(',')]
  for (const r of finalList) {
    lines.push(
      [
        safeCsv(r.name),
        safeCsv(r.calories ?? ''),
        safeCsv(r.protein_g ?? ''),
        safeCsv(r.carbs_g ?? ''),
        safeCsv(r.fat_g ?? ''),
        safeCsv(r.fiber_g ?? ''),
        safeCsv(r.sugar_g ?? ''),
        safeCsv(r.source ?? ''),
        safeCsv(r.usda_name ?? ''),
      ].join(','),
    )
  }
  fs.writeFileSync(OUTPUT_FILE, lines.join('\n') + '\n', 'utf8')

  const missingLines = ['food', ...missing.map((m) => safeCsv(m.name)).filter(Boolean)].join('\n') + '\n'
  fs.writeFileSync(OUTPUT_MISSING, missingLines, 'utf8')

  console.log(`✅ Wrote: ${path.relative(ROOT, OUTPUT_FILE)} (${finalList.length} foods)`)
  console.log(`⚠️  Missing macros: ${missing.length} foods → ${path.relative(ROOT, OUTPUT_MISSING)}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
