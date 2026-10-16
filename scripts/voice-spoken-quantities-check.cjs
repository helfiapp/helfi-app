#!/usr/bin/env node
'use strict'
// Actual pure module, loaded offline. No app/provider/database/environment access.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const vm = require('node:vm')
const root = path.resolve(__dirname, '..')
const source = fs.readFileSync(path.join(root, 'lib/native-voice-spoken-quantities.ts'), 'utf8')
const moduleScope = { exports: {} }
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText,
  { module: moduleScope, exports: moduleScope.exports, require() { throw Error('Unexpected dependency') } })
const { parseSpokenQuantity: parse, normalizeSpokenMeasurementQuantities: normalize, hasUnsafeMeasurementQuantity: unsafe } = moduleScope.exports
let passed = 0
function check(label, run) { run(); passed++; console.log(`PASS ${label}`) }
check('complete English cardinal grammar through one hundred thousand', () => {
  for (const [text, amount] of Object.entries({ zero: 0, nineteen: 19, 'twenty one': 21, 'twenty-one': 21, 'ninety nine': 99, 'one hundred': 100, 'a hundred and fifty': 150, 'one hundred fifty': 150, 'nine hundred and ninety nine': 999, 'one thousand and five': 1005, 'twenty three thousand four hundred and fifty six': 23456, 'one hundred thousand': 100000 })) assert.equal(parse(text), amount, text)
})
check('mixed fractions, articles, spoken decimals and fraction forms preserve exact values', () => {
  for (const [text, amount] of Object.entries({ half: 0.5, 'half an': 0.5, 'half of a': 0.5, quarter: 0.25, 'three quarters': 0.75, 'one half': 0.5, 'one and a half': 1.5, 'two and three quarters': 2.75, '2 and a half': 2.5, 'one point five': 1.5, 'zero point zero five': 0.05, '1/2': 0.5, '½': 0.5, '¾': 0.75 })) assert.equal(parse(text), amount, text)
  assert(Math.abs(parse('one and two thirds') - 5 / 3) < 1e-12)
})
check('unsupported ranges, negative values, malformed series and out-of-range input are refused whole', () => {
  for (const text of ['minus five', 'negative five', '-5', '+5', 'not twenty', 'twenty or thirty', 'one two', 'twenty thirty', 'one and two', 'one-two', 'one hundred hundred', 'twenty hundred', 'one thousand thousand', 'one hundred and', 'one point twenty five', 'one point five point five', 'one hundred thousand and one', '100001', '1/0', 'one / two', 'about twenty', 'at least twenty', 'one, two']) assert.equal(parse(text), null, text)
})
check('food quantities change only immediately before allowed units', () => {
  assert.equal(normalize('one hundred and fifty millilitres milk with two teaspoons sugar and one and a half cups oats', 'food'), '150 millilitres milk with 2 teaspoons sugar and 1.5 cups oats')
  assert.equal(normalize('half a litre milk and three quarters cup oats', 'food'), '0.5 litre milk and 0.75 cup oats')
  assert.equal(normalize('one hundred grams chicken', 'food'), '100 grams chicken')
  assert.equal(normalize('one apple and twenty minutes yoga', 'food'), 'one apple and twenty minutes yoga')
})
check('exercise duration and wider exercise scopes remain separate', () => {
  assert.equal(normalize('Log twenty minutes yoga', 'exercise-duration'), 'Log 20 minutes yoga')
  assert.equal(normalize('walked half an hour and five thousand steps', 'exercise-duration'), 'walked 0.5 hour and five thousand steps')
  assert.equal(normalize('walked half an hour and five thousand steps over two miles', 'exercise'), 'walked 0.5 hour and 5000 steps over two miles')
  assert.equal(normalize('ran five kilometres at six kilometres per hour for thirty minutes', 'exercise'), 'ran 5 kilometres at 6 kilometres per hour for 30 minutes')
})
check('water scope leaves food weight, exercise, dates and unrelated written numbers untouched', () => {
  const input = 'Log one hundred and fifty ml water on twenty October; note twenty good things and thirty grams oats after twenty minutes'
  assert.equal(normalize(input, 'water'), 'Log 150 ml water on twenty October; note twenty good things and thirty grams oats after twenty minutes')
  for (const scope of ['food', 'water', 'exercise-duration', 'exercise']) assert.equal(normalize('My journal: twenty happy memories on twenty October 2026 at five thirty', scope), 'My journal: twenty happy memories on twenty October 2026 at five thirty')
})
check('ambiguous or signed measurement spans never yield a positive numeric suffix', () => {
  for (const text of ['one or two cups water', 'one two cups water', 'twenty thirty ml water', 'one, two cups water', 'one / two cups water', 'one-two cups water', 'minus five ml water', 'negative fifty ml water', '-five ml water', '-50ml water', 'not twenty ml water', 'no more than twenty ml water', 'between one and two cups water', 'about twenty ml water', '100001 ml water']) { assert.equal(normalize(text, 'water'), text, text); assert.equal(unsafe(text, 'water'), true, text) }
})
check('existing numeric and non-English measurements stay byte-for-byte unchanged', () => {
  for (const text of ['250ml water', '50 ml milk', '-50 ml water', '1,000 ml water', '1.5 cups water', 'два литра вода', 'дваесет минути јога']) for (const scope of ['food', 'water', 'exercise']) assert.equal(normalize(text, scope), text, `${scope}: ${text}`)
})
check('normalizing a parsing copy is repeatable without altering original user content', () => {
  const text = 'Log twenty minutes yoga; keep my note “twenty lessons”'
  const result = normalize(text, 'exercise')
  assert.equal(result, 'Log 20 minutes yoga; keep my note “twenty lessons”')
  assert.equal(normalize(result, 'exercise'), result)
  assert.equal(text, 'Log twenty minutes yoga; keep my note “twenty lessons”')
})
check('food list boundaries preserve compound and uncertain spoken quantities and numeric food names', () => {
  const split = moduleScope.exports.splitSpokenFoodMeasurementList
  assert.deepEqual(Array.from(split('one hundred and fifty g chicken and fifty g rice')).map(part => part.trim()), ['one hundred and fifty g chicken', 'fifty g rice'])
  assert.deepEqual(Array.from(split('one and two cups oats')), ['one and two cups oats'])
  assert.deepEqual(Array.from(split('one, two cups oats')), ['one, two cups oats'])
  assert.deepEqual(Array.from(split('10 g chicken part 1, 10 g rice')).map(part => part.trim()), ['10 g chicken part 1', '10 g rice'])
})

// Exercise the actual four route helpers with their real pure dependencies.
// Strip imports instead of loading any server/client/provider/credential code.
function pure(relative) {
  const module = { exports: {} }
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root, relative), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText,
    { module, exports: module.exports, require() { throw Error('Unexpected pure dependency') } })
  return module.exports
}
const routeSource = ts.createSourceFile('route.ts', fs.readFileSync(path.join(root, 'app/api/native/voice-assistant/route.ts'), 'utf8'), ts.ScriptTarget.Latest, true)
const printer = ts.createPrinter()
const route = routeSource.statements.filter(node => !ts.isImportDeclaration(node)).map(node => printer.printNode(ts.EmitHint.Unspecified, node, routeSource)).join('\n').replace(/^export\s+/gm, '')
const ctx = vm.createContext({ process: { env: Object.freeze({}) }, Date, URL, console, resolveHelfiTtsVoice: () => 'synthetic', ...moduleScope.exports, ...pure('native/src/lib/foodUnits.ts'),
  fetch() { throw Error('Network forbidden') }, OpenAI: class { constructor() { throw Error('Provider forbidden') } } })
vm.runInContext(ts.transpileModule(route, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, ctx)
check('actual water reader understands spoken liquid quantities with existing country cup sizes', () => {
  assert.equal(ctx.parseWaterAmount('Log one hundred and fifty millilitres water', 'AU').amountMl, 150)
  assert.equal(ctx.parseWaterAmount('Log one and a half cups water', 'AU').amountMl, 375)
  assert.equal(ctx.parseWaterAmount('Log half a litre water', 'AU').amountMl, 500)
  for (const text of ['one or two cups water', 'one, two cups water', 'minus fifty ml water', '-50ml water']) assert.equal(ctx.parseWaterAmount(text, 'AU'), null, text)
})
check('actual ingredient reader retains original display and resolves exact requested units', () => {
  const text = 'one hundred and fifty millilitres milk'
  const item = ctx.parseIngredientPhrase(text)
  assert.equal(Number(item.quantity), 150); assert.equal(item.name, 'milk'); assert.equal(item.unit, 'millilitres'); assert.equal(item.display, text)
  assert.equal(Number(ctx.parseIngredientPhrase('one and a half cups oats').quantity), 1.5)
  for (const text of ['one or two cups milk', 'one, two cups milk', '-50ml milk']) assert.equal(ctx.ingredientNeedsAmountClarification(ctx.parseIngredientPhrase(text)), true, text)
})
check('actual exercise request keeps raw summary and supports spoken duration, distance, speed and steps', () => {
  const text = 'Log twenty minutes yoga'
  const yoga = ctx.tryParseExerciseRequest(text)
  assert.equal(yoga.exercise.durationMinutes, 20); assert.equal(yoga.exercise.name, 'yoga'); assert.equal(yoga.summary, text)
  assert.equal(ctx.tryParseExerciseRequest('Log half an hour yoga').exercise.durationMinutes, 30)
  const walk = ctx.tryParseExerciseRequest('I walked five kilometres for forty minutes at six kilometres per hour and five thousand steps')
  assert.equal(walk.exercise.durationMinutes, 40); assert.equal(walk.exercise.distanceKm, 5); assert.equal(walk.exercise.speedKph, 6); assert.equal(walk.exercise.steps, 5000)
  for (const text of ['Log twenty or thirty minutes yoga', 'Log minus twenty minutes yoga', 'Log -20 minutes yoga']) assert.equal(ctx.tryParseExerciseRequest(text), null, text)
})
check('actual correction duration reader supports spoken units and refuses ambiguous suffixes', () => {
  assert.equal(ctx.extractExerciseDurationMinutes('Make it half an hour'), 30)
  assert.equal(ctx.extractExerciseDurationMinutes('Change it to twenty minutes'), 20)
  for (const text of ['twenty or thirty minutes', 'negative twenty minutes', '-20minutes']) assert.equal(ctx.extractExerciseDurationMinutes(text), null, text)
})
console.log(`${passed} spoken-quantity groups passed (actual source, offline).`)
