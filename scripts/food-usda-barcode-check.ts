import assert from 'node:assert/strict'
import { normalizeExactUsdaBarcode, sameProductBarcode } from '../lib/food/usda-barcode'
const barcode = '012345678905'
assert.equal(sameProductBarcode(barcode, '0012345678905'), true)
const record = { gtinUpc: barcode, fdcId: 1, description: 'Exact branded bar', servingSize: 30, foodNutrients: [
  { nutrientId: 1008, unitName: 'KJ', value: 999 },
  { nutrientId: 1008, unitName: 'KCAL', value: 400 },
  { nutrientId: 1003, unitName: 'G', value: 10 },
] }
const food = normalizeExactUsdaBarcode(record, barcode)!
assert.equal(food.calories, 400); assert.equal(food.serving_size, '100 g'); assert.equal(food.protein_g, 10)
assert.equal(food.carbs_g, null)
assert.equal(normalizeExactUsdaBarcode({ ...record, gtinUpc: '999999999999' }, barcode), null)
assert.equal(normalizeExactUsdaBarcode({ ...record, gtinUpc: undefined }, barcode), null)
const drink = normalizeExactUsdaBarcode({ ...record, dataType: 'Branded', servingSizeUnit: 'ml' }, barcode)!
assert.equal(drink.serving_size, '100 ml'); assert.equal(drink.quantity_g, null); assert.equal(drink.calories, 400)
console.log('PASS: exact product barcode, leading-zero equivalence, nutrient units, missing fields and explicit USDA 100g basis.')
