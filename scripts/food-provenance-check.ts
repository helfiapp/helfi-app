import assert from 'node:assert/strict'
import { fillMissingNutrition } from '../lib/food/nutrition-provenance'
const item = { name: 'Chicken breast cooked', serving_size: '200 g', calories: null, protein_g: null, carbs_g: 0, fat_g: 0 }
const candidate = { source: 'usda', id: '123', name: 'Chicken breast cooked', serving_size: '100 g', calories: 165, protein_g: 31, carbs_g: 1, fat_g: 3 }
const filled = fillMissingNutrition(item, candidate)
assert.equal(filled.calories, 330); assert.equal(filled.protein_g, 62)
assert.equal(filled.carbs_g, 0); assert.equal(filled.fat_g, 0)
assert.equal(filled.nutritionProvenance.recordId, '123')
assert.equal(filled.nutritionProvenance.portionEstimated, true)
assert.deepEqual(fillMissingNutrition(item, { ...candidate, name: 'Chicken breast raw' }), item)
assert.deepEqual(fillMissingNutrition(item, { ...candidate, brand: 'Different brand' }), item)
assert.deepEqual(fillMissingNutrition({ ...item, serving_size: 'one plate' }, candidate), { ...item, serving_size: 'one plate' })
assert.deepEqual(fillMissingNutrition(item, { ...candidate, serving_size: '100 ml' }), item)
console.log('PASS: scaled database nutrition, preparation/brand compatibility, retained true zeros, unknown portions and field provenance.')
