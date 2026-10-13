export type AppleHealthSource = { sourceId: string; sourceName: string }

export function validateAppleHealthSource(value: unknown): AppleHealthSource | null {
  if (value === null) return null
  if (!value || typeof value !== 'object') throw new Error('Choose a source shown in Apple Health.')
  const { sourceId, sourceName } = value as Record<string, unknown>
  if (typeof sourceId !== 'string' || !sourceId || sourceId.length > 255 || !/^[A-Za-z0-9._-]+$/.test(sourceId) || typeof sourceName !== 'string' || !sourceName.trim() || sourceName.length > 128 || sourceName !== sourceName.trim()) throw new Error('Choose a valid source shown in Apple Health.')
  if (/[\x00-\x1F\x7F]/.test(sourceId) || /[\x00-\x1F\x7F]/.test(sourceName)) throw new Error('Choose a valid source shown in Apple Health.')
  return { sourceId, sourceName }
}

// The installed library emits per-app source quantities inside each bucket.
// Its combined `value` must never be a fallback for a selected source.
export function discoverAppleHealthSources(groups: unknown[]): AppleHealthSource[] {
  const found = new Map<string, AppleHealthSource>()
  for (const group of groups) {
    if (!Array.isArray(group)) continue
    for (const bucket of group) {
      if (!Array.isArray(bucket?.metadata)) continue
      for (const metadata of bucket.metadata) {
        try {
          const source = validateAppleHealthSource(metadata)
          if (source && !found.has(source.sourceId)) found.set(source.sourceId, source)
        } catch { /* Unknown metadata is not a selectable source. */ }
      }
    }
  }
  return [...found.values()].sort((a, b) => a.sourceName.localeCompare(b.sourceName) || a.sourceId.localeCompare(b.sourceId))
}

export function sumAppleHealthSourceQuantity(buckets: unknown, sourceId: string): number | null {
  if (!Array.isArray(buckets)) return null
  let total = 0, found = false
  for (const bucket of buckets) {
    if (!Array.isArray(bucket?.metadata)) continue
    const matches = bucket.metadata.filter((entry: any) => entry?.sourceId === sourceId)
    if (matches.length > 1) return null // Ambiguous duplicate metadata cannot be double-counted.
    if (!matches.length) continue
    try { validateAppleHealthSource(matches[0]) } catch { return null }
    const quantity = matches[0].quantity
    if (typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity < 0) return null
    found = true
    total += quantity
  }
  return found && Number.isFinite(total) ? total : null
}
