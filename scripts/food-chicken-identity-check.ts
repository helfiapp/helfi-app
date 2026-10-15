import assert from 'node:assert/strict'
import { isFoodIdentityCompatible, suggestMealName } from '../native/src/lib/foodIdentity'
import { fillMissingNutrition, isFoodPhotoCandidateIdentity, nutritionCandidateScale } from '../lib/food/nutrition-provenance'

export function checkChickenFoodIdentity() {
  // USDA SR28 NDB05684: skin only; rounded values observed on the real phone.
  const skin = { id: '174501', source: 'usda', name: 'Chicken, skin (drumsticks and thighs), with added solution, cooked, braised', serving_size: '100 g', calories: 403, protein_g: 12.26, carbs_g: 1, fat_g: 38.94, fiber_g: 0, sugar_g: 0 }
  // USDA SR28 NDB05009: whole chicken meat and skin, roasted.
  const meat = { ...skin, id: '171450', name: 'Chicken, broilers or fryers, meat and skin, cooked, roasted', calories: 239, protein_g: 27.3, carbs_g: 0, fat_g: 13.6 }
  const photo = { name: 'Cooked chicken with skin', serving_size: '150 g', calories: null, protein_g: null, carbs_g: null, fat_g: null, fiber_g: null, sugar_g: null }
  for (const candidate of [skin, { ...skin, name: 'Cooked chicken skin with seasoning' }, { ...meat, name: 'Cooked chicken with skin, meat only' }, { ...meat, name: 'Chicken, liver, cooked' }]) {
    assert.equal(isFoodIdentityCompatible(photo.name, candidate.name), false, candidate.name)
    assert.equal(isFoodPhotoCandidateIdentity(photo, candidate), false)
    assert.equal(nutritionCandidateScale(photo, candidate), null)
    assert.equal(fillMissingNutrition(photo, candidate), photo, 'incompatible sources cannot fill even missing values')
  }
  assert.equal(isFoodIdentityCompatible(photo.name, meat.name), true)
  assert.equal(nutritionCandidateScale(photo, meat), 1.5)
  const result = fillMissingNutrition(photo, meat)
  assert.equal(result.calories, 358.5)
  assert.equal(result.protein_g, 40.95)
  assert.equal(result.nutritionProvenance.recordId, meat.id)
  assert.equal(result.nutritionProvenance.portionEstimated, true)
  assert.equal(photo.calories, null, 'original source is immutable')
  assert.equal(nutritionCandidateScale({ ...photo, name: skin.name }, skin), 1.5, 'deliberately requested skin stays available')
  for (const name of ['Chicken breast cooked', 'Cooked chicken', 'Chicken thigh cooked']) {
    assert.equal(isFoodIdentityCompatible(name, skin.name), false, name)
  }
  assert.equal(isFoodIdentityCompatible('Chicken breast cooked', 'Chicken thigh cooked'), false)
  assert.equal(isFoodIdentityCompatible(photo.name, 'Chicken, back, meat and skin, cooked, roasted'), false, 'unspecified whole chicken cannot silently become a different cut')
  assert.equal(isFoodIdentityCompatible('Chicken breast cooked', 'Chicken breast raw'), false)
  assert.equal(isFoodIdentityCompatible('Whole milk', 'Milk, skim'), false)
  for (const requested of ['Whole milk', 'Milk whole']) {
    assert.equal(isFoodIdentityCompatible(requested, 'Milk, whole, 3.25% milkfat, with added vitamin D'), true, 'USDA milk word order keeps whole milk compatible')
    for (const actual of ['Milk, skim', 'Milk, nonfat', 'Milk, reduced fat, fluid, 2% milkfat']) {
      assert.equal(isFoodIdentityCompatible(requested, actual), false, 'whole milk cannot become a lower-fat milk through word order')
      assert.equal(nutritionCandidateScale({ ...photo, name: requested }, { ...meat, name: actual }), null)
    }
  }
  assert.equal(isFoodIdentityCompatible('Chicken with skin cooked', 'Chicken breast skinless cooked'), false)
  assert.equal(isFoodIdentityCompatible('Chicken breast with skin cooked', 'Chicken breast lean flesh skin and fat cooked'), true)
  for (const [requested, actual] of [
    ['Chicken cooked', 'Chicken with rice, cooked'],
    ['Chicken cooked', 'Chicken and rice, cooked'],
    ['Chicken with rice cooked', 'Chicken with rice and corn, cooked'],
    ['Chicken cooked', 'Chicken patties, cooked'],
    ['Chicken cooked', 'Chicken nuggets, cooked'],
    ['Chicken cooked', 'Chicken sausage, cooked'],
    ['Chicken', 'Chicken, meatless'],
    ['Milk', 'Milk, chocolate, whole'],
    ['Milk', 'Milk, vanilla flavoured'],
  ]) {
    const requestedFood = { ...photo, name: requested }
    const supplier = { ...meat, name: actual }
    assert.equal(isFoodIdentityCompatible(requested, actual), false, `${actual} cannot supply ${requested}`)
    assert.equal(nutritionCandidateScale(requestedFood, supplier), null)
    assert.equal(fillMissingNutrition(requestedFood, supplier), requestedFood)
    assert.equal(isFoodIdentityCompatible(actual, actual), true, 'explicitly requested mixed/flavoured/product foods remain available')
    assert.equal(nutritionCandidateScale({ ...requestedFood, name: actual }, supplier), 1.5)
  }
  for (const [requested, actual] of [
    ['Milk', 'Milk, whole, 3.25% milkfat, with added vitamin D'],
    ['Milk', 'Milk, reduced fat, fluid, 2% milkfat, with added vitamin A and vitamin D'],
    ['Chicken cooked', meat.name],
    ['Chicken with rice cooked', 'Chicken with rice, cooked'],
    ['Milk chocolate whole', 'Milk, chocolate, whole'],
  ]) assert.equal(isFoodIdentityCompatible(requested, actual), true, `${actual} remains compatible with ${requested}`)
  const unknown = fillMissingNutrition(photo, { ...meat, fiber_g: null, sugar_g: 0 })
  assert.equal(unknown.fiber_g, null); assert.equal(unknown.sugar_g, 0)
  const foods = [{ name: 'Cooked chicken with skin' }, { name: 'Cooked rice' }, { name: 'Steamed broccoli' }]
  assert.equal(suggestMealName(foods, 'Photo analyzed meal'), 'Chicken with skin, rice and broccoli')
  assert.equal(suggestMealName(foods, 'My roast dinner'), 'My roast dinner')
  assert.equal(suggestMealName([], ''), '')
  console.log('PASS: real chicken meat/skin records, source identity, preparation/cut/whole-milk guards, once-only mass scaling, null/zero, immutable inputs and suggested names.')
}

if (require.main === module) checkChickenFoodIdentity()
