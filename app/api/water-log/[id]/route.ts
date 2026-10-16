import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getUserIdFromNativeAuth } from '@/lib/native-auth'
import { prisma } from '@/lib/prisma'
import { deleteSmartCoachNotificationsByCategories } from '@/lib/notification-inbox'
import { validateNativeVoiceResolvedFood } from '@/lib/native-voice-resolved-food'
import { resizeNativeVoiceDrinkLabel } from '@/lib/native-voice-drink-label'

export const dynamic = 'force-dynamic'

const UNIT_TO_ML: Record<string, number> = {
  ml: 1,
  l: 1000,
  oz: 29.5735,
}

function normalizeUnit(value: unknown): string | null {
  const raw = String(value ?? '').trim().toLowerCase()
  if (!raw) return null
  if (raw === 'liters' || raw === 'liter' || raw === 'l') return 'l'
  if (raw === 'milliliters' || raw === 'milliliter' || raw === 'ml') return 'ml'
  if (raw === 'ounces' || raw === 'ounce' || raw === 'oz') return 'oz'
  return null
}

function normalizeAmount(value: unknown): number | null {
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  if (n <= 0) return null
  if (n > 10000) return null
  return Math.round(n * 100) / 100
}

function normalizeLabel(value: unknown): string | null {
  const raw = String(value ?? '').trim()
  if (!raw) return null
  const trimmed = raw.slice(0, 48)
  return trimmed || null
}

function normalizeCategory(value: unknown): string | null {
  const raw = String(value ?? '').trim().toLowerCase()
  if (!raw) return null
  if (raw === 'snack') return 'snacks'
  if (raw === 'snacks') return 'snacks'
  if (raw === 'uncategorized') return 'uncategorized'
  if (raw === 'breakfast' || raw === 'lunch' || raw === 'dinner' || raw === 'other') return raw
  return null
}

function asLocalDate(value: unknown): string | null {
  const s = String(value ?? '').trim()
  if (!s) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  return s
}

function normalizeCreatedAt(value: unknown): string | null {
  const raw = String(value ?? '').trim()
  if (!raw) return null
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString()
}

function toMl(amount: number, unit: string): number {
  const factor = UNIT_TO_ML[unit] || 1
  return Math.round(amount * factor * 10) / 10
}

const DRINK_NUTRIENT_KEYS = new Set(['calories', 'calories_kcal', 'protein', 'protein_g', 'carbs', 'carbs_g', 'fat', 'fat_g', 'fiber', 'fiber_g', 'sugar', 'sugar_g', '__sweetenerAmount', '__sweetenerGrams', '__sweetenerCalories', '__sweetenerCarbs', '__sweetenerSugar'])
function scaleWholeDrink(value: any, ratio: number): any {
  if (typeof value === 'string' && /^\s*[\[{]/.test(value)) {
    try { return scaleWholeDrink(JSON.parse(value), ratio) } catch { throw new Error('The existing drink ingredients need review before resizing.') }
  }
  if (Array.isArray(value)) return value.map((item) => scaleWholeDrink(item, ratio))
  if (!value || typeof value !== 'object') return value
  const next: any = { ...value }
  for (const [key, current] of Object.entries(value)) {
    if (DRINK_NUTRIENT_KEYS.has(key)) {
      if (current === null || current === undefined) next[key] = null
      else {
        const n = typeof current === 'number' ? current : typeof current === 'string' && current.trim() ? Number(current) : NaN
        if (!Number.isFinite(n) || n < 0) throw new Error('The existing drink nutrition needs review before resizing.')
        next[key] = n * ratio
      }
    } else if (['quantity', 'grams', 'servingGrams', 'servingWeightGrams', '__portionAmount', '__portionBaseAmount'].includes(key) && typeof current === 'number') {
      next[key] = current * ratio
    } else if (['serving_size', 'serving', 'requestedAmount'].includes(key) && typeof current === 'string') {
      next[key] = current.replace(/^(\d+(?:\.\d+)?)\s*(g|grams?|ml|millilitres?|milliliters?|oz|ounces?|tsp|teaspoons?|tbsp|tablespoons?|cups?)\b/i,
        (_match, amount, unit) => `${Number((Number(amount) * ratio).toFixed(6))} ${unit}`)
    } else if (['items', 'ingredients', 'nutrition', 'nutrients', 'total', '__fullMealItems', '__fullMealNutrition'].includes(key) && current != null) next[key] = scaleWholeDrink(current, ratio)
  }
  for (const [primary, alias] of [['fiber_g', 'fiber'], ['sugar_g', 'sugar']]) {
    if (Object.prototype.hasOwnProperty.call(value, primary) && value[primary] === null) { next[primary] = null; if (alias in next) next[alias] = null }
  }
  return next
}

function waterRevision(row: any) {
  return JSON.stringify({ amount: row.amount, unit: row.unit, amountMl: row.amountMl, label: row.label ?? null, category: row.category ?? null, localDate: row.localDate,
    createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null })
}

function hasExactWaterLink(value: any, id: string): boolean {
  if (typeof value === 'string' && /^\s*[\[{]/.test(value)) {
    try { return hasExactWaterLink(JSON.parse(value), id) } catch { return false }
  }
  if (Array.isArray(value)) return value.some((item) => hasExactWaterLink(item, id))
  if (!value || typeof value !== 'object') return false
  return Object.entries(value).some(([key, item]) => (key === '__waterLogId' || key === 'waterLogId')
    ? item === id : hasExactWaterLink(item, id))
}

function drinkFoodRevision(row: any): string {
  const stable = (value: any): any => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' && !(value instanceof Date)
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])])) : value
  return JSON.stringify(stable(row ? { id: row.id, userId: row.userId, name: row.name, description: row.description, nutrients: row.nutrients, items: row.items,
    meal: row.meal, category: row.category, localDate: row.localDate, createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null } : null))
}

function classifyDrinkFoodReadback(actual: any, expected: any): { fieldPath: string; kind: string } | null {
  const known = new Set(['id', 'userId', 'name', 'description', 'nutrients', 'nutrition', 'items', 'meal', 'category', 'localDate', 'createdAt',
    'calories', 'calories_kcal', 'protein', 'protein_g', 'carbs', 'carbs_g', 'fat', 'fat_g', 'fiber', 'fiber_g', 'sugar', 'sugar_g',
    'source', 'foodId', 'fdcId', 'sourceId', 'foodName', 'label', 'unit', 'amount', 'quantity', 'grams', 'ml', 'servings', 'serving_size',
    'servingOptions', 'selectedServingId', 'requestedName', 'requestedAmount', 'estimatedPortion', 'nutritionCoversServing', 'method', 'customMeal',
    '__voiceSourceFood', '__voiceSourceServingLabel', '__voicePlainIngredient', '__sourcePortion', '__voiceBuiltMeal', '__voiceSingleIngredient',
    '__waterLogId', '__drinkType', '__drinkUnit', '__drinkAmount', '__drinkAmountMl', '__sweetenerChoice', '__sweetenerType', '__sweetenerAmount',
    '__sweetenerUnit', '__sweetenerGrams', '__sweetenerCalories', '__sweetenerCarbs', '__sweetenerSugar', '__portionScale', '__portionAmount',
    '__portionUnit', '__portionBaseAmount', '__portionTotalWeightG', '__portionControlEnabled', '__fullMealItems', '__fullMealNutrition'])
  const safePath = (path: string[]) => ['record', ...path.map(part => known.has(part) ? part : /^(0|[1-9]\d?)$/.test(part) ? 'item' : 'field')].join('.')
  let precision: { fieldPath: string; kind: string } | null = null
  const visit = (a: any, b: any, path: string[]): { fieldPath: string; kind: string } | null => {
    if (a === b) return null
    const mismatch = (kind: string) => ({ fieldPath: safePath(path), kind })
    if (a === null || b === null) return mismatch('null_change')
    if (typeof a === 'number' && typeof b === 'number') {
      const identity = path.some(part => /(?:^|_)(?:id|ids)$|Id(?:s)?$/.test(part))
      if (!identity && Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 8 * Number.EPSILON * Math.max(1, Math.abs(a), Math.abs(b))) {
        precision ||= mismatch('numeric_precision')
        return null
      }
      return mismatch('numeric_change')
    }
    if (typeof a !== typeof b) return mismatch('type_change')
    if (Array.isArray(a) || Array.isArray(b)) {
      if (!Array.isArray(a) || !Array.isArray(b)) return mismatch('type_change')
      if (a.length !== b.length) return mismatch('array_length')
      for (let index = 0; index < a.length; index++) { const found = visit(a[index], b[index], [...path, String(index)]); if (found) return found }
      return null
    }
    if (typeof a === 'object') {
      const names = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()
      for (const name of names) {
        if (!Object.prototype.hasOwnProperty.call(a, name) || !Object.prototype.hasOwnProperty.call(b, name)) return { fieldPath: safePath([...path, name]), kind: 'missing_key' }
        const found = visit(a[name], b[name], [...path, name]); if (found) return found
      }
      return null
    }
    return mismatch(typeof a === 'string' ? 'string_change' : typeof a === 'boolean' ? 'boolean_change' : 'value_change')
  }
  const material = visit(JSON.parse(drinkFoodRevision(actual)), JSON.parse(drinkFoodRevision(expected)), [])
  return material || precision
}

async function getWaterLogUser(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const sessionEmail = String(session?.user?.email || '').trim().toLowerCase()
  if (sessionEmail) {
    return prisma.user.findUnique({ where: { email: sessionEmail } })
  }

  const nativeUserId = await getUserIdFromNativeAuth(req)
  if (!nativeUserId) return undefined
  return prisma.user.findUnique({ where: { id: nativeUserId } })
}

export async function DELETE(_req: NextRequest, context: { params: { id?: string } }) {
  const user = await getWaterLogUser(_req)
  if (user === undefined) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const id = String(context?.params?.id || '').trim()
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  try {
    const body = await _req.json().catch(() => ({} as any))
    const found = await prisma.$transaction(async (tx) => {
      const existing = await tx.waterLog.findFirst({ where: { id, userId: user.id } })
      if (!existing) return false
      if (body.expectedWaterState && waterRevision(body.expectedWaterState) !== waterRevision(existing)) throw new Error('This drink changed after review. Please review it again.')
      const candidates = await tx.foodLog.findMany({ where: { userId: user.id, OR: [
        { localDate: existing.localDate },
        { nutrients: { path: ['__waterLogId'], equals: id } },
        { nutrients: { path: ['waterLogId'], equals: id } },
      ] }, select: { id: true, nutrients: true, items: true } })
      const linkedIds = candidates.filter((entry) => hasExactWaterLink([entry.nutrients, entry.items], id)).map((entry) => entry.id)
      if (linkedIds.length) {
        const removed = await tx.foodLog.deleteMany({ where: { userId: user.id, id: { in: linkedIds } } })
        if (removed.count !== linkedIds.length) throw new Error('The linked drink changed while deleting. Please review it again.')
      }
      const removed = await tx.waterLog.deleteMany({ where: { id, userId: user.id, amount: existing.amount, unit: existing.unit, amountMl: existing.amountMl, label: existing.label, category: existing.category, localDate: existing.localDate, createdAt: existing.createdAt } })
      if (removed.count !== 1) throw new Error('This drink changed while deleting. Please review it again.')
      return true
    })
    if (!found) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[water-log] DELETE failed', { reasonCode: (error as any)?.code === 'P2028' ? 'drink_transaction_timeout' : 'drink_delete_failed' })
    return NextResponse.json({ error: 'Failed to delete water log' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, context: { params: { id?: string } }) {
  const user = await getWaterLogUser(req)
  if (user === undefined) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const id = String(context?.params?.id || '').trim()
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const body = await req.json().catch(() => ({} as any))
  const amount = normalizeAmount(body?.amount)
  const unit = normalizeUnit(body?.unit)
  if (amount == null || !unit) {
    return NextResponse.json({ error: 'Amount and unit are required' }, { status: 400 })
  }

  const label = Object.prototype.hasOwnProperty.call(body || {}, 'label') ? normalizeLabel(body?.label) : undefined
  const category = Object.prototype.hasOwnProperty.call(body || {}, 'category')
    ? normalizeCategory(body?.category)
    : undefined
  const localDate = Object.prototype.hasOwnProperty.call(body || {}, 'localDate') ? asLocalDate(body?.localDate) : null
  const createdAtProvided = Object.prototype.hasOwnProperty.call(body || {}, 'createdAt')
  const createdAt = createdAtProvided ? normalizeCreatedAt(body?.createdAt) : null
  if (createdAtProvided && !createdAt) {
    return NextResponse.json({ error: 'Invalid createdAt value' }, { status: 400 })
  }
  const amountMl = toMl(amount, unit)
  if (!Number.isFinite(amountMl) || amountMl > 10000) return NextResponse.json({ error: 'Drink amount is outside the safe logging range.' }, { status: 400 })

  const data: any = {
    amount,
    unit,
    amountMl,
  }
  if (label !== undefined) data.label = label
  if (category !== undefined) data.category = category
  if (localDate) data.localDate = localDate
  if (createdAt) data.createdAt = createdAt

  let stage = 'validate_source'
  try {
    const resolvedPayload = body.resolvedDrinkFood
    const resolvedFood = resolvedPayload ? validateNativeVoiceResolvedFood(resolvedPayload.food, resolvedPayload.trustedSources) : null
    const entry = await prisma.$transaction(async (tx) => {
      stage = 'load_drink'
      const existing = await tx.waterLog.findFirst({ where: { id, userId: user.id } })
      if (!existing) throw new Error('Drink entry not found.')
      if (body.expectedWaterState && waterRevision(body.expectedWaterState) !== waterRevision(existing)) throw new Error('This drink changed after review. Please review it again.')
      const previousMl = Number(existing.amountMl)
      if (!Number.isFinite(previousMl) || previousMl <= 0) throw new Error('The original drink volume needs review.')
      const resized = Math.abs(amountMl - previousMl) > 0.000001
      stage = 'load_linked_food'
      const linkedCandidates = await tx.foodLog.findMany({ where: { userId: user.id, OR: [
        { localDate: existing.localDate },
        { nutrients: { path: ['__waterLogId'], equals: id } },
        { nutrients: { path: ['waterLogId'], equals: id } },
      ] } })
      stage = 'check_review'
      const linked = linkedCandidates.filter((food) => hasExactWaterLink([food.nutrients, food.items], id))
      if (body.wholeDrinkFoodState && (linked.length !== 1 || drinkFoodRevision(linked[0]) !== drinkFoodRevision(body.wholeDrinkFoodState))) throw new Error('The drink ingredients changed after review. Please review them again.')
      if (resolvedFood && (linked.length > 1 || drinkFoodRevision(linked[0] || null) !== drinkFoodRevision(resolvedPayload.expectedFoodState))) throw new Error('The drink ingredients changed after review. Please review them again.')
      if (!resolvedFood && resized && linked.length && body.wholeDrinkVolume !== true) throw new Error('Please confirm that the volume change applies to the whole drink, including its ingredients.')
      if (!resolvedFood && resized && !linked.length && existing.label && !/^(?:(?:plain|tap|mineral|sparkling|still|filtered|bottled)\s+)?water$/i.test(existing.label)) throw new Error('The linked food nutrition is missing. Please review this drink before resizing.')
      if (!resolvedFood && resized && linked.length === 1) {
        const automaticLabel = resizeNativeVoiceDrinkLabel(existing.label, linked[0].nutrients, amountMl / previousMl)
        if (automaticLabel !== undefined) {
          if (body.expectedWaterState && label === undefined) throw new Error('Please review the resized ingredient amounts and drink name before saving.')
          // An explicitly reviewed custom name wins. An unchanged automatic
          // name is updated only for ordinary manual requests without review.
          if (label === undefined) data.label = automaticLabel
        }
      }
      stage = 'update_drink'
      const updated = await tx.waterLog.updateMany({ where: { id, userId: user.id, amount: existing.amount, unit: existing.unit, amountMl: existing.amountMl, label: existing.label, category: existing.category, localDate: existing.localDate, createdAt: existing.createdAt }, data })
      if (updated.count !== 1) throw new Error('This drink changed while saving. Please review it again.')
      const resolvedExpectedRows: any[] = []
      for (const food of linked) {
        const nutrients: any = resolvedFood ? { ...(food.nutrients as any), ...resolvedFood.nutrition } : resized ? scaleWholeDrink(food.nutrients, amountMl / previousMl) : { ...(food.nutrients as any) }
        const items = resolvedFood ? resolvedFood.items : resized ? scaleWholeDrink(food.items, amountMl / previousMl) : food.items
        Object.assign(nutrients, { __drinkType: nutrients.__drinkType || label || existing.label || 'Water', __drinkAmount: amount, __drinkUnit: unit, __drinkAmountMl: amountMl, __waterLogId: id })
        const foodData = {
          nutrients, ...(items !== null && items !== undefined ? { items } : {}),
          ...(localDate ? { localDate } : {}), ...(createdAt ? { createdAt } : {}),
          ...(data.label !== undefined ? { name: data.label || food.name } : {}),
          ...(category ? { meal: category === 'other' ? 'uncategorized' : category, category: category === 'other' ? 'uncategorized' : category } : {}),
        }
        stage = 'update_linked_food'
        const changed = await tx.foodLog.updateMany({ where: { id: food.id, userId: user.id, name: food.name, description: food.description,
          nutrients: { equals: food.nutrients as any }, ...(food.items != null ? { items: { equals: food.items as any } } : {}) }, data: foodData })
        if (changed.count !== 1) throw new Error('The drink nutrition changed while saving. Please review it again.')
        if (resolvedFood) resolvedExpectedRows.push({ ...food, ...foodData })
      }
      if (resolvedFood && !linked.length) {
        const nutrients: any = { ...resolvedFood.nutrition, __waterLogId: id, __drinkType: resolvedFood.nutrition.__drinkType || label || existing.label || 'Water', __drinkAmount: amount, __drinkUnit: unit, __drinkAmountMl: amountMl }
        const created = await tx.foodLog.create({ data: { userId: user.id, name: normalizeLabel(resolvedPayload.title) || label || existing.label || 'Drink',
          description: normalizeLabel(resolvedPayload.title) || label || existing.label || 'Drink', nutrients, items: resolvedFood.items,
          meal: category || existing.category || 'uncategorized', category: category || existing.category || 'uncategorized',
          localDate: localDate || existing.localDate, createdAt: createdAt ? new Date(createdAt) : existing.createdAt } })
        resolvedExpectedRows.push(created)
      }
      if (resolvedExpectedRows.length) {
        stage = 'verify_linked_food'
        const readback = await tx.foodLog.findMany({ where: { userId: user.id, id: { in: resolvedExpectedRows.map((row) => row.id) } } })
        for (const expected of resolvedExpectedRows) {
          const actual = readback.find(row => row.id === expected.id)
          if (!actual || drinkFoodRevision(actual) !== drinkFoodRevision(expected)) {
            // Actual stored readback confirmed a last-bit numeric difference.
            // Accept only representation drift after writing; reviewed source
            // versions above and all material/schema/identity changes stay exact.
            const mismatch = actual ? classifyDrinkFoodReadback(actual, expected) : { fieldPath: 'record', kind: 'missing_record' }
            if (mismatch?.kind === 'numeric_precision') continue
            console.error('[water-log] linked readback mismatch', mismatch || { fieldPath: 'record', kind: 'unknown_shape' })
            throw new Error('The app could not verify the resolved drink ingredients after saving.')
          }
        }
      }
      stage = 'read_drink'
      return tx.waterLog.findFirst({ where: { id, userId: user.id } })
    }, { maxWait: 5000, timeout: 15000 })
    await deleteSmartCoachNotificationsByCategories(user.id, ['hydration']).catch(() => {})
    return NextResponse.json({ entry })
  } catch (error) {
    const knownFailures: Record<string, string> = {
      'The app could not verify the resolved drink ingredients after saving.': 'drink_readback_mismatch',
      'The drink nutrition changed while saving. Please review it again.': 'drink_food_conflict',
      'The drink ingredients changed after review. Please review them again.': 'drink_source_stale',
      'This drink changed after review. Please review it again.': 'drink_stale',
      'This drink changed while saving. Please review it again.': 'drink_conflict',
    }
    const reasonCode = knownFailures[String((error as any)?.message || '')] || ((error as any)?.code === 'P2028' ? 'drink_transaction_timeout' : 'drink_update_failed')
    const databaseCode = /^P\d{4}$/.test(String((error as any)?.code || '')) ? String((error as any).code) : null
    const errorType = error instanceof Error && ['Error', 'TypeError', 'PrismaClientKnownRequestError', 'PrismaClientValidationError'].includes(error.name) ? error.name : 'Error'
    console.error('[water-log] PATCH failed', { reasonCode, stage, databaseCode, errorType })
    return NextResponse.json({ error: 'The drink update could not be completed. Please check the entry before trying again.', code: reasonCode }, { status: 500 })
  }
}
