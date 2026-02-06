export const normalizeText = (value: string) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')

export const buildCustomFoodKey = (params: {
  name: string
  brand?: string | null
  kind: string
  country?: string | null
}) => {
  const base = `${params.brand ? `${params.brand} ` : ''}${params.name}`.trim()
  const country = params.country ? normalizeText(params.country) : ''
  const suffix = country ? `|${country}` : ''
  return `${normalizeText(base)}|${params.kind}${suffix}`.trim()
}

const normalizeBrandAlias = (brand: string) => {
  const compact = brand.replace(/[^a-z0-9]+/gi, ' ').trim()
  const noPunct = brand.replace(/[^a-z0-9]+/gi, '').trim()
  const variants = new Set<string>()
  if (compact && compact !== brand) variants.add(compact)
  if (noPunct && noPunct !== brand && noPunct !== compact) variants.add(noPunct)
  if (brand.toLowerCase().includes('&')) {
    const replaced = brand.replace(/&/g, 'and')
    variants.add(replaced)
    const replacedCompact = replaced.replace(/[^a-z0-9]+/gi, ' ').trim()
    if (replacedCompact) variants.add(replacedCompact)
  }
  return Array.from(variants)
}

export const buildCustomFoodAliases = (name: string, brand?: string | null) => {
  const aliases: string[] = []
  if (brand) {
    aliases.push(`${name} (${brand})`)
    aliases.push(`${brand} ${name}`)
    normalizeBrandAlias(brand).forEach((variant) => {
      aliases.push(`${name} (${variant})`)
      aliases.push(`${variant} ${name}`)
    })
  }
  return Array.from(new Set(aliases.filter(Boolean)))
}
