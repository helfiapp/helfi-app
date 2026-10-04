import assert from 'node:assert/strict'
import { materializeMealPortion } from '../native/src/lib/mealPortions'

for (const scale of [0.5, 1, 2]) {
  const raw = { items: [{ calories: 200, protein_g: 10, carbs_g: 30, fat_g: 4, servings: 1, __amount: 100, __unit: 'g' }], nutrients: { __portionScale: scale, calories: 200 * scale } }
  const before = JSON.stringify(raw)
  const result = materializeMealPortion(raw)
  assert.equal(result.items[0].calories * result.items[0].servings, 200 * scale)
  assert.equal(result.items[0].protein_g * result.items[0].servings, 10 * scale)
  assert.equal(result.items[0].__amount, 100 * scale)
  assert.equal(JSON.stringify(raw), before, 'original saved entry remains untouched')
  assert.deepEqual(materializeMealPortion(result), result, 'reload must not scale again')
  // Editor persists the materialized servings and cleared scale; both clients use the same totals.
  assert.equal(result.nutrients.__portionScale, 1)
}
assert.equal(materializeMealPortion({ total: { calories: 200, __portionScale: 2 } }).total.calories, 400)
assert.equal(materializeMealPortion({ items: [{ calories: 200, servings: 2 }], total: {} }).items[0].servings, 2)
console.log('PASS: half/full/double meal portions, editor amounts, historical metadata, repeat reload and pre-scaled native meals.')
