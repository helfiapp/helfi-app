export const normalizeMealCategory = (raw: any): string | null => {
  const value = typeof raw === 'string' ? raw.toLowerCase() : ''
  if (/breakfast/.test(value)) return 'breakfast'
  if (/lunch/.test(value)) return 'lunch'
  if (/dinner/.test(value)) return 'dinner'
  if (/snack/.test(value)) return 'snacks'
  if (/uncat/.test(value) || /other/.test(value)) return 'uncategorized'
  if (typeof raw === 'string' && raw.trim()) return raw.trim()
  return null
}
