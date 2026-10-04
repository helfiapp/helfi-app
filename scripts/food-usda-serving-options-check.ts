import assert from 'node:assert/strict'
import { extractUsdaNutrients, usdaStandardServingOptions } from '../lib/food/usda-nutrition'
import { usdaLibraryServingSize } from '../lib/food/usda-library'
import unresolved from '../data/usda-unresolved-basis-2025-12-18.json'

const food = { dataType: 'Branded', servingSize: 30, servingSizeUnit: 'g', foodNutrients: [
  { nutrient: { id: 1008, unitName: 'KCAL' }, amount: 400 },
  { nutrient: { id: 1003, unitName: 'G' }, amount: 10 },
  { nutrient: { id: 1005, unitName: 'G' }, amount: 0 },
  { nutrient: { id: 1004, unitName: 'G' }, amount: null },
], foodPortions: [{ gramWeight: 12.5, portionDescription: 'Half bar' }] }
const options = usdaStandardServingOptions(food, 'fixture')
assert.equal(options[0].calories, 400)
assert.equal(options[1].grams, 30)
assert.equal(options[1].calories, 120)
assert.equal(options[1].protein_g, 3)
assert.equal(options[1].carbs_g, 0)
assert.equal(options[1].fat_g, null)
assert.equal(options[2].serving_size, 'Half bar — 12.5g')
assert.equal(options[2].calories, 50)
const liquid = usdaStandardServingOptions({ ...food, servingSizeUnit: 'ml' }, 'fixture')
assert.equal(liquid[0].serving_size, '100 ml')
assert.equal(liquid[0].grams, null)
assert.equal(liquid[1].serving_size, 'Serving — 30ml')
assert.equal(liquid[1].calories, 120)
assert.equal(liquid[1].grams, null)
assert.equal(liquid.length, 2)
assert.deepEqual(usdaStandardServingOptions({ foodNutrients: [{ nutrientId: 1008, unitName: 'KCAL', value: null }] }, 'missing'), [])
assert.equal(extractUsdaNutrients({ foodNutrients: [{ nutrientId: 1062, unitName: 'KJ', value: 0 }] }).energyKcal, 0)
assert.equal(extractUsdaNutrients({ foodNutrients: [{ nutrientId: 1008, unitName: 'KCAL', value: null, amount: 200 }] }).energyKcal, 200)
assert.equal(extractUsdaNutrients({ foodNutrients: [{ nutrientId: 1008, unitName: 'MG', value: 200 }] }).energyKcal, null)
assert.equal(extractUsdaNutrients({ foodNutrients: [{ nutrientId: 1008, value: 200 }] }).energyKcal, null)
assert.equal(extractUsdaNutrients({ foodNutrients: [{ nutrientId: 2047, unitName: 'KCAL', value: 300 }] }).energyKcal, 300)
assert.equal(extractUsdaNutrients({ foodNutrients: [{ nutrientId: 2000, unitName: 'G', value: 4 }] }).sugar, 4)
for (const servingSize of ['None', '', '2 Tbsp', '1 cup', '1 fl oz']) {
  assert.equal(usdaLibraryServingSize({ source: 'usda_branded', servingSize }), null)
}
assert.equal(usdaLibraryServingSize({ source: 'usda_branded', servingSize: '100 g' }), '100 g')
assert.equal(usdaLibraryServingSize({ source: 'usda_branded', servingSize: '100 ml' }), '100 ml')
assert.equal(usdaLibraryServingSize({ source: 'usda_branded', fdcId: unresolved.fdcIds[0], servingSize: '100 g' }), null)
assert.equal(usdaLibraryServingSize({ source: 'usda_branded', servingSize: '1 bar (30g)' }), '1 bar (30g)')
console.log('PASS: branded USDA 100g basis, label portions, precise portion weights, no guessed liquid mass, missing/zero nutrients and strict energy units.')
