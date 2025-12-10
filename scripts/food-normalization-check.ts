import { normalizeBarcodeFood, normalizeDiscreteItems } from '../lib/food-normalization'

type TestCase = { name: string; run: () => void }

const assert = (condition: boolean, message: string) => {
  if (!condition) {
    throw new Error(message)
  }
}

const tests: TestCase[] = [
  {
    name: 'discrete servings >1 are converted to piecesPerServing with servings clamped',
    run: () => {
      const sample = {
        name: 'Eggs',
        serving_size: '',
        servings: 2,
        calories: 140,
        protein_g: 12,
        carbs_g: 0,
        fat_g: 10,
      }
      const normalized = normalizeDiscreteItems([sample])
      const item = normalized.items[0]
      assert(item.servings === 1, 'servings should be clamped to 1')
      assert(item.piecesPerServing === 2, 'piecesPerServing should match original servings')
      assert(item.pieces === 2, 'pieces should seed from piecesPerServing')
    },
  },
  {
    name: 'analysis text count seeds pieces when label is singular',
    run: () => {
      const normalized = normalizeDiscreteItems(
        [
          {
            name: 'Fried egg',
            serving_size: '1 egg',
            servings: 1,
            calories: 140,
            protein_g: 12,
            carbs_g: 0.5,
            fat_g: 10,
          },
        ],
        { analysisText: 'Two fried eggs on a plate' },
      )
      const item = normalized.items[0]
      console.log('DEBUG item (analysis count test):', item)
      assert(item.piecesPerServing === 2, `piecesPerServing should follow analysis text (2 eggs); got ${item.piecesPerServing}`)
      assert(item.servings === 1, 'servings should stay at 1')
      assert(item.pieces === 2, `pieces should seed from analysis count; got ${item.pieces}`)
    },
  },
  {
    name: 'per-100g barcode entries scale by serving weight',
    run: () => {
      const { food } = normalizeBarcodeFood({
        source: 'test',
        id: '123',
        name: 'Test bar',
        serving_size: '30 g',
        calories: 500,
        protein_g: 10,
        carbs_g: 50,
        fat_g: 20,
        fiber_g: 5,
        sugar_g: 10,
        basis: 'per_100g',
        quantity_g: 30,
      })
      assert(Math.abs((food.calories || 0) - 150) < 0.01, 'calories should scale from per 100g to serving')
      assert(Math.abs((food.protein_g || 0) - 3) < 0.01, 'protein should scale with weight')
    },
  },
  {
    name: 'kJ values are converted to kcal',
    run: () => {
      const { food } = normalizeBarcodeFood({
        source: 'test',
        id: 'kj-case',
        name: 'Energy drink',
        serving_size: '1 can (250 ml)',
        calories: 840,
        protein_g: 0,
        carbs_g: 50,
        fat_g: 0,
        fiber_g: 0,
        sugar_g: 50,
        basis: 'per_serving',
        quantity_g: 250,
        energyUnit: 'kJ',
      })
      assert(
        food.calories !== null && food.calories !== undefined && food.calories < 300,
        'kJ should be converted to kcal',
      )
    },
  },
  {
    name: 'pieces are inferred from label text',
    run: () => {
      const { food } = normalizeBarcodeFood({
        source: 'test',
        id: 'pieces',
        name: 'Crackers',
        serving_size: '10 g (6 crackers)',
        calories: 40,
        protein_g: 1,
        carbs_g: 8,
        fat_g: 1,
        fiber_g: 0,
        sugar_g: 0,
        basis: 'per_serving',
        quantity_g: 10,
      })
      assert(food.piecesPerServing === 6, 'piecesPerServing should be parsed from label')
      assert(food.pieces === 6, 'pieces should seed from piecesPerServing')
    },
  },
]

const failures: string[] = []

for (const t of tests) {
  try {
    t.run()
  } catch (err: any) {
    failures.push(`${t.name}: ${err?.message || err}`)
  }
}

if (failures.length > 0) {
  console.error('❌ food-normalization-check failed:\n' + failures.join('\n'))
  process.exit(1)
}

console.log('✅ food-normalization-check passed')
