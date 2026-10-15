import assert from 'node:assert/strict'
import { usdaStandardServingOptions } from '../lib/food/usda-nutrition'

export function checkUsdaServingLabels() {
  // Original USDA skin-only nutrient values from the reported chicken result.
  // Fixing the serving caption must not turn skin nutrition into meat nutrition.
  const food = {
    dataType: 'SR Legacy', description: 'Chicken, skin only, cooked, roasted',
    foodNutrients: [
      { nutrientId: 1008, unitName: 'KCAL', value: 403 },
      { nutrientId: 1003, unitName: 'G', value: 12.26 },
      { nutrientId: 1005, unitName: 'G', value: 1 },
      { nutrientId: 1004, unitName: 'G', value: 38.94 },
      { nutrientId: 2000, unitName: 'G', value: 0 },
    ],
  }
  const portions = [
    { amount: 3, measureUnit: { name: 'oz' }, gramWeight: 85 },
    { amount: 1, measureUnit: { name: 'oz' }, gramWeight: 28.35 },
    { amount: 3, measureUnit: { name: 'oz' }, portionDescription: '3 oz', gramWeight: 85 },
    { amount: 3, measureUnit: { name: 'oz' }, portionDescription: '3oz', gramWeight: 85 },
    { measureUnit: { name: 'oz' }, gramWeight: 85 },
    { amount: 1, modifier: 'cup, chopped', measureUnit: { name: 'cup' }, gramWeight: 140 },
    { amount: 2, modifier: 'pieces', gramWeight: 120 },
    { amount: .5, portionDescription: 'Half bar', gramWeight: 12.5 },
    { amount: 1, portionDescription: '1 cup, chopped', gramWeight: 140 },
    { modifier: 'Large fillet', gramWeight: 200 },
    { measureUnit: { name: 'undetermined' }, gramWeight: 85 },
  ]
  const options = usdaStandardServingOptions({ ...food, foodPortions: portions }, 'original-chicken-skin')
  assert.deepEqual(options.slice(1).map(value => value.label), [
    '3 oz — 85g', '1 oz — 28.35g', '3 oz — 85g', '3oz — 85g', '85 g',
    '1 cup, chopped — 140g', '2 pieces — 120g', 'Half bar — 12.5g',
    '1 cup, chopped — 140g', 'Large fillet — 200g', '85 g',
  ])
  for (let index = 0; index < portions.length; index++) {
    const option = options[index + 1]
    const grams = portions[index].gramWeight
    assert.equal(option.id, `usda:original-chicken-skin:${index}`)
    assert.equal(option.grams, grams)
    assert.equal(option.ml, null)
    assert.equal(option.unit, 'g')
    assert.ok(Math.abs(option.calories - 403 * grams / 100) < 1e-12)
    assert.ok(Math.abs(option.protein_g! - 12.26 * grams / 100) < 1e-12)
    assert.ok(Math.abs(option.fat_g! - 38.94 * grams / 100) < 1e-12)
    assert.equal(option.carbs_g, grams / 100)
    assert.equal(option.fiber_g, null, 'unreported fibre stays unknown')
    assert.equal(option.sugar_g, 0, 'declared zero stays zero')
    assert.equal(option.serving_size, option.label)
  }
  assert.equal(options[0].calories, 403)
  assert.equal(options[1].calories, 342.55, '3oz retains the provider85g, without substituting a calculated mass')
  for (const amount of [null, undefined, '', 0, -1, 'unknown']) {
    const option = usdaStandardServingOptions({ ...food, foodPortions: [{ amount, measureUnit: { name: 'oz' }, gramWeight: 85 }] }, 'invalid-count')[1]
    assert.equal(option.label, '85 g', 'unknown/invalid portion count cannot claim one ounce')
    assert.equal(option.grams, 85)
  }
  assert.equal(usdaStandardServingOptions({ ...food, foodPortions: [{ amount: 3, portionDescription: 'oz', gramWeight: 85 }] }, 'description-unit')[1].label, '3 oz — 85g')
  assert.equal(usdaStandardServingOptions({ ...food, foodPortions: [{ amount: .5, portionDescription: '½ cup', gramWeight: 70 }] }, 'fraction')[1].label, '½ cup — 70g')
  assert.equal(usdaStandardServingOptions({ ...food, foodPortions: [{ amount: 1, portionDescription: 'one fillet', gramWeight: 200 }] }, 'written-count')[1].label, 'one fillet — 200g')
  assert.equal(usdaStandardServingOptions({ ...food, foodPortions: [{ portionDescription: 'cup', gramWeight: 239 }] }, 'recorded-household')[1].label, 'cup — 239g', 'existing explicit household description stays stable')

  const branded = { ...food, dataType: 'Branded', servingSize: 30, servingSizeUnit: 'g', foodPortions: [{ amount: .5, portionDescription: 'Half bar', gramWeight: 12.5 }] }
  const brandedOptions = usdaStandardServingOptions(branded, 'branded')
  assert.equal(brandedOptions[0].label, '100 g')
  assert.equal(brandedOptions[1].label, 'Serving — 30g')
  assert.ok(Math.abs(brandedOptions[1].calories - 120.9) < 1e-12)
  assert.equal(brandedOptions[2].label, 'Half bar — 12.5g')
  const liquid = usdaStandardServingOptions({ ...branded, servingSizeUnit: 'ml' }, 'branded-liquid')
  assert.equal(liquid.length, 2, 'mass portions cannot become invented liquid measurements')
  assert.equal(liquid[0].label, '100 ml')
  assert.equal(liquid[1].label, 'Serving — 30ml')
  assert.equal(liquid[1].grams, null)
  assert.equal(liquid[1].ml, 30)
  assert.deepEqual(usdaStandardServingOptions({ ...food, foodNutrients: [] }, 'unknown-nutrients'), [])
  console.log('PASS: real USDA serving generation retains explicit3oz/1oz quantities, measured grams, original chicken nutrients/IDs, custom portions, branded bases and unknown/zero values.')
}

if (require.main === module) checkUsdaServingLabels()
