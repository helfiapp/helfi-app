/** Pure boundary for source-resolved food edits. trustedSources must come from
 * the app's food lookup/builder, never the model's proposed JSON. */
const RESOLVED_FIELDS = [['calories', 'calories_kcal'], ['protein_g', 'protein'], ['carbs_g', 'carbs'], ['fat_g', 'fat'], ['fiber_g', 'fiber'], ['sugar_g', 'sugar']] as const
function resolvedValue(value: any, names: readonly string[], optional: boolean, source = false): number | null {
  const key = names.find((name) => Object.prototype.hasOwnProperty.call(value || {}, name))
  const raw = key ? value[key] : undefined
  if (optional && (raw === null || raw === undefined)) return null
  const n = source && typeof raw === 'string' && raw.trim() ? Number(raw) : raw
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) throw new Error('Please resolve all food nutrition from its source first.')
  return n
}
function sourceIdentity(value: any) { return String(value?.id ?? value?.foodId ?? '').trim() }
function canonical(value: any): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
  return JSON.stringify(value)
}
export function validateNativeVoiceResolvedFood(food: any, trustedSources: any[]) {
  if (!food || !Array.isArray(food.items) || !food.items.length || food.items.length > 30 || !food.nutrition || !Array.isArray(trustedSources) || !trustedSources.length) throw new Error('Please resolve every food ingredient before saving this change.')
  const scale = food.nutrition.__portionScale === undefined ? 1 : food.nutrition.__portionScale
  if (typeof scale !== 'number' || !Number.isFinite(scale) || scale <= 0 || scale > 1000) throw new Error('Please review the selected food portion.')
  for (const item of food.items) {
    const source = item?.__voiceSourceFood
    if (!sourceIdentity(source) || !source.name || item.nutritionCoversServing !== true || !trustedSources.some((trusted) => sourceIdentity(trusted) === sourceIdentity(source) && canonical(trusted) === canonical(source))) throw new Error('This ingredient does not match a trusted food lookup. Please resolve it again.')
    const measured = RESOLVED_FIELDS.map((names, index) => resolvedValue(item, names, index >= 4))
    const basis = RESOLVED_FIELDS.map((names, index) => resolvedValue(source, names, index >= 4, true))
    const nonzero = basis.findIndex((value, index) => index < 4 && value !== null && value > 0)
    const ratio = nonzero >= 0 ? Number(measured[nonzero]) / Number(basis[nonzero]) : 1
    if (!Number.isFinite(ratio) || ratio <= 0) throw new Error('Please use a positive source-resolved ingredient amount.')
    for (let index = 0; index < basis.length; index++) {
      if ((basis[index] === null) !== (measured[index] === null) || (basis[index] !== null && measured[index] !== null && Math.abs(Number(measured[index]) - Number(basis[index]) * ratio) > 0.002)) throw new Error('The ingredient nutrition does not match its resolved food source.')
    }
  }
  const nutrition = { ...food.nutrition }
  RESOLVED_FIELDS.forEach((names, index) => {
    const optional = index >= 4
    const values = food.items.map((item: any) => resolvedValue(item, names, optional))
    const sum = values.some((value: number | null) => value === null) ? null : values.reduce((total: number, value: number) => total + value, 0) * scale
    const declared = resolvedValue(nutrition, names, optional)
    if ((sum === null) !== (declared === null) || (sum !== null && declared !== null && Math.abs(sum - declared) > (index === 0 ? 0.51 : 0.00001))) throw new Error('The reviewed food totals do not match every resolved ingredient.')
    for (const name of names) nutrition[name] = declared
  })
  return { ...food, items: food.items.map((item: any) => ({ ...item })), nutrition }
}
