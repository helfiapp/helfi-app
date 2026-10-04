import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

// Run the actual classifiers, without importing React, server code or credentials.
function loadSymbols(file: string, names: string[], supplied: Record<string, any> = {}) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const declarations = new Map<string, string>()
  for (const node of source.statements) {
    if (ts.isFunctionDeclaration(node) && node.name) declarations.set(node.name.text, node.getText(source))
    if (ts.isVariableStatement(node)) {
      for (const declaration of node.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.initializer) {
          declarations.set(declaration.name.text, `const ${declaration.name.text} = ${declaration.initializer.getText(source)}`)
        }
      }
    }
  }
  const code = names.map(name => {
    assert.ok(declarations.has(name), `${file}: actual ${name} exists`)
    return declarations.get(name)
  }).join('\n')
  const context = vm.createContext(supplied)
  vm.runInContext(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText, context)
  return { context, evaluate: (expression: string) => vm.runInContext(expression, context) }
}

const native = loadSymbols('native/src/screens/AddIngredientScreen.tsx', [
  'FOOD_VARIANT_REPLACEMENTS', 'normalizeFoodValue', 'singularizeToken', 'foodTokens',
  'EGG_BLOCKLIST', 'isEggFood', 'isLikelyLiquidFood', 'getFoodUnitGrams', 'defaultUnitOptions',
])
const shared = loadSymbols('lib/food/measurement-units.ts', [
  'FOOD_VARIANT_REPLACEMENTS', 'normalizeFoodValue', 'isLiquidFood',
])
const backend = loadSymbols('lib/food-data.ts', ['normalizeFoodText', 'isLikelyLiquidFoodName'])
const page = loadSymbols('app/food/page.tsx', ['isLikelyLiquidFood'])
const builder = loadSymbols('app/food/build-meal/MealBuilderClient.tsx', ['isLikelyLiquidItem'])
const recommended = loadSymbols('components/food/RecommendedIngredientCard.tsx', ['isLikelyLiquidItem'])

const classifiers: Array<[string, (name: string, serving?: string) => boolean]> = [
  ['native Add Ingredient', native.context.isLikelyLiquidFood],
  ['shared web measurements', shared.evaluate('isLiquidFood')],
  ['provider serving mapper', backend.evaluate('isLikelyLiquidFoodName')],
  ['web diary', page.evaluate('isLikelyLiquidFood')],
  ['web meal builder', builder.evaluate('isLikelyLiquidItem')],
  ['recommended ingredient', recommended.evaluate('isLikelyLiquidItem')],
]
for (const [label, classify] of classifiers) {
  for (const name of ['Egg, whole, cooked, hard-boiled', 'Beef steak, grilled', 'Rice, cooked, boiled', 'Broiled chicken', 'Watermelon', 'Milk chocolate bar']) {
    assert.equal(classify(name, '100 g'), false, `${label}: ${name} is a solid`)
  }
  assert.equal(classify('Egg, whole, cooked, hard-boiled', '1 teaspoon (8.5 g)'), false, `${label}: teaspoon is a measure, not tea`)
  for (const name of ['Milk, whole', 'Olive oil', 'Black tea', 'Apple juice', 'Soft drinks', 'Vegetable broth', 'Milkshake']) {
    assert.equal(classify(name, '100 ml'), true, `${label}: ${name} keeps liquid options`)
  }
  assert.equal(classify('Milk powder', '100 g'), false, `${label}: powder stays solid`)
}

assert.equal(native.context.isEggFood('Egg, whole, cooked, hard-boiled'), true)
const eggGrams = native.context.getFoodUnitGrams('Egg, whole, cooked, hard-boiled')
assert.equal(eggGrams['egg-large'], 50, 'large whole egg uses 50 g edible weight')
const options = Array.from(native.context.defaultUnitOptions({ amount: 100, unit: 'g' }, 'Egg, whole, cooked, hard-boiled', eggGrams))
assert.ok(options.includes('egg-large'), 'actual unit picker offers individual eggs')
assert.ok(options.includes('g'), 'measured grams remain available')
assert.equal(native.context.isEggFood('Egg white'), false, 'whole-egg weights do not apply to separated whites')
console.log('PASS: all six actual food liquid classifiers reject boiled/steak/teaspoon substring matches; liquids keep volume options and whole eggs keep size units.')
