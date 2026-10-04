// Keep in sync with native/src/lib/nutrientValues.ts. Missing nutrition is not zero.
export function optionalNutrient(value: unknown): number | null {
  if (value == null || typeof value === 'boolean' || (typeof value === 'string' && !value.trim())) return null
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : null
}

export function readOptionalNutrient(record: any, keys: string[]): number | null {
  for (const key of keys) {
    if (record?.[key] !== undefined) return optionalNutrient(record[key])
  }
  return null
}

export function scaleOptionalNutrient(value: unknown, factor: number): number | null {
  if (!Number.isFinite(factor) || factor < 0) return null
  if (factor === 0) return 0
  const number = optionalNutrient(value)
  return number == null ? null : number * factor
}

export function sumOptionalNutrients(left: unknown, right: unknown): number | null {
  const a = optionalNutrient(left)
  const b = optionalNutrient(right)
  return a == null || b == null ? null : a + b
}

export function roundOptionalNutrient(value: unknown, decimals = 1): number | null {
  const number = optionalNutrient(value)
  const factor = 10 ** decimals
  return number == null ? null : Math.round(number * factor) / factor
}
