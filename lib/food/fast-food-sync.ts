import { prisma } from '../prisma'
import { buildCustomFoodAliases, buildCustomFoodKey, normalizeText } from './custom-food-import'
import { loadFastFoodMenuItems } from './fast-food-menus'

const normalizeChain = (value: string | null | undefined) =>
  normalizeText(String(value || '')).replace(/\s+/g, ' ').trim()

const stripSizeTokens = (value: string) => {
  if (!value) return ''
  const lower = value.toLowerCase()
  const tokensToStrip = [
    'small',
    'medium',
    'large',
    'regular',
    'size',
    'kids',
    'kid',
    'tall',
    'grande',
    'venti',
    'short',
    'single',
    'double',
    'triple',
  ]
  const cleaned = lower
    .split(/\s+/g)
    .filter((token) => token && !tokensToStrip.includes(token))
    .join(' ')
  return cleaned.trim()
}

const normalizeItemName = (value: string) => normalizeText(stripSizeTokens(value))

const removeChainFromName = (name: string, chain: string | null | undefined) => {
  if (!chain) return name
  const chainNorm = normalizeChain(chain)
  if (!chainNorm) return name
  const nameNorm = normalizeChain(name)
  if (!nameNorm) return name
  if (nameNorm.startsWith(chainNorm)) {
    return nameNorm.slice(chainNorm.length).trim()
  }
  return nameNorm
}

export type FastFoodSyncResult = {
  added: number
  updated: number
  total: number
  errors: number
  addedKeys: string[]
}

export const syncFastFoodMenus = async (params?: {
  country?: string | null
  chain?: string | null
}): Promise<FastFoodSyncResult> => {
  const requestedCountry = String(params?.country || '').trim().toUpperCase()
  const requestedChain = normalizeChain(params?.chain || '')

  const menuItems = loadFastFoodMenuItems().filter((item) => {
    if (requestedCountry && item.country && String(item.country).toUpperCase() !== requestedCountry) return false
    if (requestedCountry && !item.country) return false
    if (requestedChain) {
      const itemChain = normalizeChain(item.chain)
      if (!itemChain) return false
      if (itemChain !== requestedChain) return false
    }
    return true
  })
  let added = 0
  let updated = 0
  let errors = 0
  const addedKeys: string[] = []

  for (const item of menuItems) {
    try {
      const aliases = buildCustomFoodAliases(item.name, item.chain)
      const key = buildCustomFoodKey({
        name: item.name,
        brand: item.chain,
        kind: 'FAST_FOOD',
        country: item.country ?? null,
      })

      const existing = await prisma.customFoodItem.findUnique({ where: { key } })

      await prisma.customFoodItem.upsert({
        where: { key },
        create: {
          key,
          name: item.name,
          brand: item.chain,
          country: item.country ?? null,
          kind: 'FAST_FOOD',
          group: 'fast_food',
          caloriesPer100g: null,
          proteinPer100g: null,
          carbsPer100g: null,
          fatPer100g: null,
          fiberPer100g: null,
          sugarPer100g: null,
          aliases,
          servingOptions: item.servingOptions,
        },
        update: {
          name: item.name,
          brand: item.chain,
          country: item.country ?? null,
          kind: 'FAST_FOOD',
          group: 'fast_food',
          caloriesPer100g: null,
          proteinPer100g: null,
          carbsPer100g: null,
          fatPer100g: null,
          fiberPer100g: null,
          sugarPer100g: null,
          aliases,
          servingOptions: item.servingOptions,
        },
      })

      if (existing) {
        updated += 1
      } else {
        added += 1
        addedKeys.push(key)
      }
    } catch (error) {
      errors += 1
      console.error('Fast food menu sync failed for item:', item.name, error)
    }
  }

  return { added, updated, total: menuItems.length, errors, addedKeys }
}

const menuMatchScore = (reportName: string, menuName: string) => {
  const reportNorm = normalizeItemName(reportName)
  const menuNorm = normalizeItemName(menuName)
  if (!reportNorm || !menuNorm) return 0
  if (reportNorm === menuNorm) return 3
  if (reportNorm.includes(menuNorm) || menuNorm.includes(reportNorm)) return 2
  return 0
}

export const findMenuMatchForReport = (params: {
  name: string
  brand?: string | null
  country?: string | null
}) => {
  const menuItems = loadFastFoodMenuItems()
  const reportCountry = String(params.country || '').trim().toUpperCase()
  const reportBrand = normalizeChain(params.brand || '')
  const reportName = String(params.name || '').trim()
  const cleanedName = removeChainFromName(reportName, params.brand)

  let best: (typeof menuItems)[number] | null = null
  let bestScore = 0

  for (const item of menuItems) {
    if (reportCountry && item.country && reportCountry !== String(item.country).toUpperCase()) continue
    if (reportBrand) {
      const itemBrand = normalizeChain(item.chain)
      if (!itemBrand) continue
      if (itemBrand !== reportBrand && !itemBrand.includes(reportBrand) && !reportBrand.includes(itemBrand)) continue
    }

    const score = menuMatchScore(cleanedName || reportName, item.name)
    if (score > bestScore) {
      bestScore = score
      best = item
    }
  }

  return best
}
