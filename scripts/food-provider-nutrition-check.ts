import assert from 'node:assert/strict'
import { foodNumberOrNull, normalizeOffNutrition } from '../lib/food/openfoodfacts'
import { normalizeBarcodeFood } from '../lib/food-normalization'

const close = (actual: number | null | undefined, expected: number) => assert.ok(actual != null && Math.abs(actual - expected) < 0.01, `${actual} != ${expected}`)
const fixture = (nutriments: any, serving_size = '30 g') => normalizeOffNutrition({ serving_size, nutriments })
const per100 = { 'energy-kcal_100g': 400, proteins_100g: 10, carbohydrates_100g: 60, fat_100g: 10 }
const perServing = fixture(per100)
close(perServing.calories, 120); close(perServing.protein_g, 3); close(perServing.carbs_g, 18)
assert.equal(perServing.serving_size, '30 g')
const mixed = fixture({ ...per100, 'energy-kcal_serving': 120 })
close(mixed.calories, 120); close(mixed.protein_g, 3)
const unknownWeight = fixture({ ...per100, 'energy-kcal_serving': 120 }, '1 bar')
close(unknownWeight.calories, 120); assert.equal(unknownWeight.protein_g, null)
const unknownServing = fixture(per100, '1 bar')
assert.equal(unknownServing.serving_size, '100 g'); close(unknownServing.calories, 400)
const liquid = fixture({ 'energy-kj_100g': 418.4, carbohydrates_100g: 20 }, '250 ml')
close(liquid.calories, 250); close(liquid.carbs_g, 50)
const kjOnly = fixture({ energy_serving: 418.4, proteins_serving: 0, carbohydrates_serving: 0, fat_serving: 0 })
close(kjOnly.calories, 100); close(normalizeBarcodeFood(kjOnly).food.calories, 100)
assert.deepEqual(normalizeBarcodeFood(normalizeBarcodeFood(kjOnly).food).food, normalizeBarcodeFood(kjOnly).food)
const zero = fixture({ 'energy-kcal_serving': 0, proteins_serving: 0, carbohydrates_serving: 0, fat_serving: 0 })
assert.equal(zero.calories, 0); assert.equal(zero.carbs_g, 0)
for (const missing of [null, undefined, '', '  ', false, {}, 'unknown', -1]) assert.equal(foodNumberOrNull(missing), null)
const absent = fixture({ 'energy-kcal_serving': null, proteins_serving: null })
assert.equal(absent.calories, null); assert.equal(normalizeBarcodeFood(absent).food.protein_g, null)
const scaled = normalizeBarcodeFood({ calories: 400, protein_g: null, serving_size: '30 g', quantity_g: 30, basis: 'per_100g', energyUnit: 'kcal' }).food
close(scaled.calories, 120); assert.equal(scaled.protein_g, null); close(normalizeBarcodeFood(scaled).food.calories, 120)
close(normalizeBarcodeFood({ calories: 5000, energyUnit: 'kcal' }).food.calories, 5000)
console.log('PASS: provider serving basis, mixed fields, true zeros, missing nutrients, liquid portions, kJ exactly once, repeat normalization and large meals.')
