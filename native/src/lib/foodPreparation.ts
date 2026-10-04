const words = (value: unknown) => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ')
const raw = /\b(raw|uncooked)\b/
const cooked = /\b(cooked|grilled|roasted|roast|rotisserie|braised|baked|boiled|steamed|fried|poached|stewed|scrambled|sauteed)\b/

export function isFoodPreparationCompatible(name: unknown, query: unknown): boolean {
  const candidate = words(name)
  const requested = words(query)
  if (raw.test(requested) && (!raw.test(candidate) || cooked.test(candidate))) return false
  if (cooked.test(requested) && (!cooked.test(candidate) || raw.test(candidate))) return false
  // Breaded/coated food and skin-on meat have different nutrition from plain food.
  if (/\b(breaded|battered|crumbed|tempura)\b/.test(candidate) && !/\b(breaded|battered|crumbed|tempura)\b/.test(requested)) return false
  if (/\b(skinless|without skin)\b/.test(requested) && /\b(with skin|skin on|meat and skin)\b/.test(candidate)) return false
  for (const method of ['grilled', 'roasted', 'braised', 'baked', 'boiled', 'steamed', 'fried', 'poached', 'scrambled']) {
    const match = new RegExp(`\\b${method}\\b`)
    if (match.test(requested) && !match.test(candidate)) return false
  }
  return true
}
