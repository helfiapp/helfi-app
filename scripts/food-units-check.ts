import assert from 'node:assert/strict'
import { convertFoodAmount, liquidDensity, parseFoodServing } from '../native/src/lib/foodUnits'
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 0.001, `${a} != ${b}`)
const oil = liquidDensity('olive oil')
close(convertFoodAmount(100, 'ml', 'g', oil), 92)
close(convertFoodAmount(92, 'g', 'ml', oil), 100)
close(convertFoodAmount(1, 'oz', 'g'), 28.349523125)
close(convertFoodAmount(1, 'fl oz', 'ml'), 29.5735295625)
assert.ok(Number.isNaN(convertFoodAmount(1, 'oz', 'ml')), 'unknown density must not silently be water')
assert.ok(Number.isNaN(convertFoodAmount(100, 'ml', 'g')), 'unknown liquid cannot be weighed from volume')
assert.equal(parseFoodServing('8 fl oz')?.unit, 'fl oz')
assert.equal(parseFoodServing('8 oz')?.unit, 'oz')
close(parseFoodServing('0.5 l')!.amount, 500)
console.log('PASS: oil density, inverse conversions, separate weight/fluid ounces, unknown-density refusal and litre parsing.')
