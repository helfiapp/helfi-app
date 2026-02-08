type ReportItem = { name?: string; reason?: string }

type ReportSectionBucket = { working: ReportItem[]; suggested: ReportItem[]; avoid: ReportItem[] }

type ReportSections = Record<string, ReportSectionBucket>

export type WeeklyReportSanitizeContext = {
  supplements: Array<{ name?: string | null; dosage?: string | null; timing?: string[] | null }>
  medications: Array<{ name?: string | null; dosage?: string | null; timing?: string[] | null }>
}

const KNOWN_MEDICATION_NAME_BLOCKLIST = new Set<string>([
  // Owner-reported medication showing in Supplements.
  'tadalafil',
])

const SUPPLEMENT_FORM_WORDS = new Set<string>([
  'acetate',
  'bisglycinate',
  'carbonate',
  'citrate',
  'gluconate',
  'glycinate',
  'hcl',
  'hydrochloride',
  'malate',
  'methylated',
  'methyl',
  'oxide',
  'picolinate',
  'succinate',
  'sulfate',
  'taurate',
  'threonate',
  'chelate',
  'chelated',
])

function normalizeReportItem(item: ReportItem | null | undefined): { name: string; reason: string } {
  const name = String(item?.name || '').trim()
  const reason = String(item?.reason || '').trim()
  return { name, reason }
}

function tokenizeForMatch(input: string): string[] {
  const raw = String(input || '').trim().toLowerCase()
  if (!raw) return []
  const cleaned = raw
    .replace(/[^\da-z]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleaned) return []

  const drop = new Set([
    'mg',
    'mcg',
    'g',
    'kg',
    'ml',
    'iu',
    'tablet',
    'tablets',
    'tab',
    'tabs',
    'capsule',
    'capsules',
    'cap',
    'caps',
    'softgel',
    'softgels',
    'drop',
    'drops',
    'tsp',
    'tbsp',
    'morning',
    'afternoon',
    'evening',
    'night',
    'daily',
    'weekly',
    'once',
    'twice',
  ])

  return cleaned
    .split(' ')
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((t) => !drop.has(t))
    .filter((t) => !/^\d+(\.\d+)?$/.test(t))
    .filter((t) => !/^\d+(\.\d+)?(mg|mcg|g|kg|ml|iu)$/.test(t))
}

function canonicalizeStrict(input: string): string {
  return tokenizeForMatch(input).join(' ').trim()
}

function canonicalizeCore(input: string): string {
  const tokens = tokenizeForMatch(input).filter((t) => !SUPPLEMENT_FORM_WORDS.has(t))

  // Treat common vitamin formatting as the same (D-3 vs D3).
  const joined = tokens.join(' ').replace(/\b(d)\s*3\b/g, 'd3').trim()
  return joined
}

function buildKnownSets(rows: Array<{ name?: string | null }>) {
  const strict = new Set<string>()
  const core = new Set<string>()
  for (const row of rows || []) {
    const name = String(row?.name || '')
    const s = canonicalizeStrict(name)
    const c = canonicalizeCore(name)
    if (s) strict.add(s)
    if (c) core.add(c)
  }
  return { strict, core }
}

function buildDefaultBucket(): ReportSectionBucket {
  return { working: [], suggested: [], avoid: [] }
}

function isKnownMedicationName(input: string, knownStrict: Set<string>) {
  const strict = canonicalizeStrict(input)
  if (!strict) return false
  if (KNOWN_MEDICATION_NAME_BLOCKLIST.has(strict)) return true
  return knownStrict.has(strict)
}

function isKnownByCore(input: string, knownCore: Set<string>) {
  const core = canonicalizeCore(input)
  if (!core) return false
  if (knownCore.has(core)) return true

  // Extra tolerance: treat "vitamin d" and "vitamin d3" as the same.
  if (core === 'vitamin d3' && knownCore.has('vitamin d')) return true
  if (core === 'vitamin d' && knownCore.has('vitamin d3')) return true

  return false
}

function dedupeWithinBucketByCore(bucket: ReportSectionBucket) {
  const seen = new Set<string>()
  const dedupeList = (items: ReportItem[]) => {
    const next: Array<{ name: string; reason: string }> = []
    for (const item of items || []) {
      const normalized = normalizeReportItem(item)
      const key = canonicalizeCore(normalized.name)
      if (!key) continue
      if (seen.has(key)) continue
      seen.add(key)
      next.push(normalized)
    }
    return next
  }

  // Priority order: working first, then suggested, then avoid.
  bucket.working = dedupeList(bucket.working || [])
  bucket.suggested = dedupeList(bucket.suggested || [])
  bucket.avoid = dedupeList(bucket.avoid || [])
}

function filterBucket(items: ReportItem[], keep: (item: { name: string; reason: string }) => boolean) {
  const next: Array<{ name: string; reason: string }> = []
  for (const item of items || []) {
    const normalized = normalizeReportItem(item)
    if (!normalized.name) continue
    if (!keep(normalized)) continue
    next.push(normalized)
  }
  return next
}

function formatTiming(value: any) {
  if (!value) return ''
  const arr = Array.isArray(value) ? value : []
  const cleaned = arr.map((v) => String(v || '').trim()).filter(Boolean)
  if (!cleaned.length) return ''
  return cleaned.join(', ')
}

function buildProfileLine(row: { dosage?: string | null; timing?: string[] | null }) {
  const dose = String(row?.dosage || '').trim()
  const timing = formatTiming(row?.timing)
  if (dose && timing) return `Dose: ${dose} • Timing: ${timing}`
  if (dose) return `Dose: ${dose}`
  if (timing) return `Timing: ${timing}`
  return ''
}

export function sanitizeWeeklyReportSections<T extends ReportSections>(sections: T, ctx: WeeklyReportSanitizeContext): T {
  const out: ReportSections = { ...(sections || ({} as any)) }

  const knownSupplements = buildKnownSets(ctx?.supplements || [])
  const knownMedications = buildKnownSets(ctx?.medications || [])

  const supplements: ReportSectionBucket = out.supplements || buildDefaultBucket()
  const medications: ReportSectionBucket = out.medications || buildDefaultBucket()

  const movedToMedications: Array<{ name: string; reason: string }> = []
  const movedToSupplements: Array<{ name: string; reason: string }> = []

  // 1) Move known medications out of Supplements.
  const moveMedsOut = (items: ReportItem[]) =>
    filterBucket(items, (it) => {
      const strict = canonicalizeStrict(it.name)
      const isBlocklistedMed = strict ? KNOWN_MEDICATION_NAME_BLOCKLIST.has(strict) : false
      const medLike = isBlocklistedMed || isKnownMedicationName(it.name, knownMedications.strict)
      const suppLike = isKnownByCore(it.name, knownSupplements.core)
      if ((isBlocklistedMed && medLike) || (medLike && !suppLike)) {
        movedToMedications.push(it)
        return false
      }
      return true
    })
  supplements.working = moveMedsOut(supplements.working || [])
  supplements.suggested = moveMedsOut(supplements.suggested || [])
  supplements.avoid = moveMedsOut(supplements.avoid || [])

  // 2) Move known supplements out of Medications.
  const moveSuppsOut = (items: ReportItem[]) =>
    filterBucket(items, (it) => {
      const suppLike = isKnownByCore(it.name, knownSupplements.core)
      const medLike = isKnownMedicationName(it.name, knownMedications.strict)
      if (suppLike && !medLike) {
        movedToSupplements.push(it)
        return false
      }
      return true
    })
  medications.working = moveSuppsOut(medications.working || [])
  medications.suggested = moveSuppsOut(medications.suggested || [])
  medications.avoid = moveSuppsOut(medications.avoid || [])

  // If it was in the user's known list, it should land in "working".
  if (movedToMedications.length) {
    medications.working = [...(medications.working || []), ...movedToMedications]
  }
  if (movedToSupplements.length) {
    supplements.working = [...(supplements.working || []), ...movedToSupplements]
  }

  // 3) If an item is already in the user's list, it should be treated as part of their current plan.
  //    Move it into "working" rather than leaving "suggested/avoid" empty and confusing.
  const moveKnownFromSuggestedAvoidIntoWorking = (bucket: ReportSectionBucket, knownCore: Set<string>) => {
    const move = (items: ReportItem[], prefix: string) => {
      const kept: Array<{ name: string; reason: string }> = []
      for (const item of items || []) {
        const normalized = normalizeReportItem(item)
        if (!normalized.name) continue
        if (isKnownByCore(normalized.name, knownCore)) {
          bucket.working = [
            ...(bucket.working || []),
            {
              name: normalized.name,
              reason: prefix ? `${prefix}${normalized.reason ? ` ${normalized.reason}` : ''}`.trim() : normalized.reason,
            },
          ]
        } else {
          kept.push(normalized)
        }
      }
      return kept
    }
    bucket.suggested = move(bucket.suggested || [], '')
    bucket.avoid = move(bucket.avoid || [], 'Review with a clinician:')
  }
  moveKnownFromSuggestedAvoidIntoWorking(supplements, knownSupplements.core)
  moveKnownFromSuggestedAvoidIntoWorking(medications, knownMedications.core)

  // 4) Deduplicate within each section bucket (by core name).
  dedupeWithinBucketByCore(supplements)
  dedupeWithinBucketByCore(medications)

  // 5) Final safety: if an item looks like a known medication, it must not be in Supplements.
  const medCoreKeys = new Set<string>()
  for (const item of [...(medications.working || []), ...(medications.suggested || []), ...(medications.avoid || [])]) {
    const key = canonicalizeCore(String((item as any)?.name || ''))
    if (key) medCoreKeys.add(key)
  }
  const stripIfInMedications = (items: ReportItem[]) =>
    filterBucket(items, (it) => {
      const key = canonicalizeCore(it.name)
      if (!key) return false
      if (medCoreKeys.has(key) && !isKnownByCore(it.name, knownSupplements.core)) return false
      if (isKnownMedicationName(it.name, knownMedications.strict) && !isKnownByCore(it.name, knownSupplements.core)) return false
      return true
    })
  supplements.working = stripIfInMedications(supplements.working || [])
  supplements.suggested = stripIfInMedications(supplements.suggested || [])
  supplements.avoid = stripIfInMedications(supplements.avoid || [])

  // 6) Doctor-ready: ensure every current supplement/medication appears at least once in the report content.
  const ensureCoverage = (
    bucket: ReportSectionBucket,
    list: Array<{ name?: string | null; dosage?: string | null; timing?: string[] | null }>,
    label: string
  ) => {
    const present = new Set<string>()
    for (const item of [...(bucket.working || []), ...(bucket.suggested || []), ...(bucket.avoid || [])]) {
      const key = canonicalizeCore(String((item as any)?.name || ''))
      if (key) present.add(key)
    }

    for (const row of list || []) {
      const name = String(row?.name || '').trim()
      if (!name) continue
      const key = canonicalizeCore(name)
      if (!key) continue
      if (present.has(key)) continue
      present.add(key)
      const profileLine = buildProfileLine(row)
      bucket.working = [
        ...(bucket.working || []),
        {
          name,
          reason: profileLine
            ? `${profileLine}\nNext step: Confirm with your clinician what this is for and whether the dose/timing fits your goals.`
            : `${label} (in your saved list).\nNext step: Confirm with your clinician what this is for and whether it fits your goals.`,
        },
      ]
    }
  }
  ensureCoverage(supplements, ctx?.supplements || [], 'Current supplement')
  ensureCoverage(medications, ctx?.medications || [], 'Current medication')

  out.supplements = supplements
  out.medications = medications
  return out as T
}

export function sanitizeWeeklyReportPayload(
  payload: any,
  ctx: WeeklyReportSanitizeContext
) {
  if (!payload || typeof payload !== 'object') return payload
  const sections = payload.sections && typeof payload.sections === 'object' ? payload.sections : {}
  return {
    ...payload,
    sections: sanitizeWeeklyReportSections(sections as ReportSections, ctx),
  }
}
