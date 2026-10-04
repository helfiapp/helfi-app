import assert from 'node:assert/strict'
import { isFoodPreparationCompatible } from '../native/src/lib/foodPreparation'
import { sortPlainFoodResults } from '../native/src/lib/plainFoodSearch'
const candidates = [{ name: 'Chicken breast raw' }, { name: 'Chicken breast cooked braised' }, { name: 'Chicken tenders breaded cooked' }, { name: 'Chicken breast grilled skinless' }]
const cooked = sortPlainFoodResults(candidates, 'chicken breast cooked')
assert.equal(cooked.length, 2)
assert.ok(cooked.every((item) => !/raw|breaded/.test(item.name)))
assert.deepEqual(sortPlainFoodResults(candidates, 'chicken breast raw').map((item) => item.name), ['Chicken breast raw'])
assert.equal(isFoodPreparationCompatible('Chicken breaded cooked', 'breaded chicken cooked'), true)
assert.equal(isFoodPreparationCompatible('Rice raw', 'rice cooked'), false)
assert.equal(isFoodPreparationCompatible('Rice boiled', 'rice cooked'), true)
assert.equal(isFoodPreparationCompatible('Chicken breast cooked with skin', 'chicken breast cooked skinless'), false)
assert.equal(isFoodPreparationCompatible('Chicken breast fried', 'chicken breast grilled'), false)
console.log('PASS: raw/cooked matching, explicit cooking methods, breaded identity and skinless requests.')
