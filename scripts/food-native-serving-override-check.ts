import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { extractUsdaNutrients, usdaNutrientBasis, usdaStandardServingOptions } from '../lib/food/usda-nutrition'
import { liquidDensity, convertFoodAmount, parseFoodServing, liquidHouseholdMl } from '../native/src/lib/foodUnits'
import { getFoodUnitGrams, formatUnitLabel } from '../lib/food/measurement-units'
import { PRODUCE_MEASUREMENTS } from '../native/src/data/produceMeasurements'
import { hasCoreFoodNutrition } from '../lib/food/openfoodfacts'

// Exercise real USDA detail -> serving options -> native override/cache ->
// open adjustment -> saved payload, without environment values or network.
const provider = ts.createSourceFile('food-data.ts', fs.readFileSync('lib/food-data.ts', 'utf8'), ts.ScriptTarget.Latest, true)
const screen = ts.createSourceFile('screen.tsx', fs.readFileSync('native/src/screens/AddIngredientScreen.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
assert.equal((screen as any).parseDiagnostics.length, 0, 'actual adjustment screen JSX must parse')
function bind(source: ts.SourceFile, ctx: any, name: string) {
  let expression = ''
  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) expression = `(${node.getText(source).replace(/^export\s+/, '')})`
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name && node.initializer) expression = `(${node.initializer.getText(source)})`
    ts.forEachChild(node, visit)
  }
  visit(source); assert.ok(expression, `actual ${name} exists`)
  ctx[name] = vm.runInContext(ts.transpile(expression, { target: ts.ScriptTarget.ES2020 }), ctx)
}
let detail: any
const server: any = vm.createContext({ hasCoreFoodNutrition, extractUsdaNutrients, usdaNutrientBasis, usdaStandardServingOptions, liquidDensity, getFoodUnitGrams, formatUnitLabel, USDA_API_KEY: 'fixture-only', console: { warn() {} }, fetchWithTimeout: async () => ({ ok: true, json: async () => detail }) })
for (const name of ['normalizeFoodText', 'isLikelyLiquidFoodName', 'liquidDensityGramsPerMl', 'buildScaledServingOption', 'appendOptionIfMissing', 'hasMeasuredHouseholdServing', 'appendLiquidServingOptions', 'appendCommonFoodServingOptions', 'fetchUsdaServingOptions']) bind(provider, server, name)
const ctx: any = vm.createContext({ PRODUCE_MEASUREMENTS, convertFoodAmount, parseFoodServing, liquidHouseholdMl, userCountry: '', console, URLSearchParams, authHeaders: { Fixture: 'no-real-token' }, API_BASE_URL: 'https://fixture.invalid', servingOverrideCacheRef: { current: new Map() }, servingOverridePendingRef: { current: new Set() }, Alert: { alert: (...args: any[]) => { throw new Error(`Unexpected food error: ${args[0]}`) } } })
const pure = screen.statements.filter(node => ts.isVariableStatement(node) || (ts.isFunctionDeclaration(node) && node.name?.text !== 'AddIngredientScreen')).map(node => node.getText(screen)).join('\n')
vm.runInContext(ts.transpileModule(pure, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.None } }).outputText, ctx)
for (const name of ['loadServingOverride', 'openAdjust', 'applyAdjustServingOption', 'addAdjustedItem']) bind(screen, ctx, name)
for (const key of ['AdjustOpeningId', 'AdjustBase', 'AdjustServingOptions', 'AdjustServingId', 'AdjustItem', 'AdjustUnit', 'AdjustAmountInput', 'AdjustPickerMode', 'AdjustDropdownLayout', 'Error', 'AdjustSaving']) ctx[`set${key}`] = (value: any) => { const field = key[0].toLowerCase() + key.slice(1); ctx[field] = typeof value === 'function' ? value(ctx[field]) : value }
ctx.loadDynamicSizeLookup = async () => null
let providerCalls = 0; let payload: any
ctx.fetch = async (url: string, init: any) => {
  if (url.includes('/api/food-data/servings?')) { providerCalls++; return { ok: true, json: async () => ({ options: await server.fetchUsdaServingOptions('original-id') }) } }
  assert.ok(url.endsWith('/api/food-log')); payload = JSON.parse(init.body); return { ok: true, json: async () => ({ id: 'fixture-saved' }) }
}
ctx.buildNativeAuthHeaders = () => ({ Fixture: 'no-real-token' }); ctx.session = { token: 'fixture-only' }; ctx.selectedDate = '2026-10-05'; ctx.targetMeal = 'breakfast'; ctx.DeviceEventEmitter = { emit() {} }; ctx.navigation = { goBack() {} }
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} must equal ${b}`)
const nutrients = (calories: number, fat: number, sugar?: number) => [{ nutrientId: 1008, unitName: 'KCAL', value: calories }, { nutrientId: 1003, unitName: 'G', value: 0 }, { nutrientId: 1005, unitName: 'G', value: 0 }, { nutrientId: 1004, unitName: 'G', value: fat }, ...(sugar === undefined ? [] : [{ nutrientId: 2000, unitName: 'G', value: sugar }])]
const original = (name: string, calories = 47) => ({ id: 'original-id', source: 'usda', name, serving_size: '100 g', calories, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: null, sugar_g: null })
async function open(item: any) {
  ctx.servingOverrideCacheRef.current.clear(); ctx.adjustItem = null; ctx.adjustSaving = false; ctx.adjustServingOptions = []
  await ctx.openAdjust(item); assert.ok(ctx.adjustItem, 'actual adjustment opens')
  assert.equal(ctx.adjustItem.id, item.id); assert.equal(ctx.adjustItem.source, item.source)
}
async function save(amount: number, unit: string) {
  payload = undefined
  ctx.adjustAmountInput = String(amount); ctx.safeAdjustUnit = unit; ctx.mergedAdjustUnitGrams = {}; ctx.selectedServingLabel = ctx.adjustItem.serving_size
  await ctx.addAdjustedItem(); assert.ok(payload); return payload
}
async function run() {
  // Actual native conversion and labels, with the saved account country.
  const auBase = { amount: 100, unit: 'ml', density: 1.03 }
  close(ctx.computeServings(1, 'tbsp', auBase, {}, 'AU'), .2)
  close(ctx.computeServings(1, 'cup', auBase, {}, 'AU'), 2.5)
  assert.equal(ctx.unitLabel('tbsp', 'Milk, whole', {}, 'AU'), 'tbsp — 20 ml')
  assert.equal(ctx.unitLabel('cup', 'Milk, whole', {}, 'AU'), 'cup — 250 ml')
  assert.equal(ctx.unitLabel('ml', 'Milk, whole', {}, 'AU'), 'ml')
  for (const name of ['Apple juice, frozen concentrate, diluted with 3 volume water', 'Mayonnaise, reduced fat, with olive oil', 'Egg, scrambled, with milk', 'Milk, canned, condensed, sweetened', 'Milk, dry, whole', 'Almond milk', 'Water chestnuts, chinese, raw']) {
    detail = { description: name, dataType: 'SR Legacy', foodNutrients: nutrients(47, 0), foodPortions: [{ gramWeight: 239, portionDescription: 'cup' }] }
    const options = await server.fetchUsdaServingOptions('original-id')
    assert.ok(!options.some((option: any) => option.unit === 'ml' || option.ml), `${name}: ingredient mention cannot create volume nutrition`)
    // Sized produce/egg overrides intentionally stay on their separate count path.
    if (ctx.hasSizedCountUnits(ctx.getFoodUnitGrams(name))) continue
    const item = original(name); await open(item)
    assert.equal(ctx.adjustBase.unit, 'g'); assert.equal(ctx.adjustBase.density, null)
    assert.ok(!ctx.defaultUnitOptions(ctx.adjustBase, name).includes('ml'))
    assert.equal(ctx.adjustServingOptions.length, options.length, 'real provider options must reach the adjustment')
    const before = providerCalls; await ctx.openAdjust(item)
    assert.equal(providerCalls, before, 'cached override avoids a duplicate lookup')
    assert.equal(ctx.adjustServingOptions.length, options.length, 'cache retains full provider choices')
    const saved = await save(100, 'g'); assert.equal(saved.total.calories, 47); assert.equal(saved.items[0].sugar_g, null); assert.equal(saved.items[0].fiber_g, null)
    assert.equal(saved.items[0].id, item.id); assert.equal(saved.items[0].servingOptions.length, options.length)
  }
  for (const [name, kcal, fat, density] of [['Milk, whole', 61, 3.3, 1.03], ['Oil, olive, salad or cooking', 884, 100, 0.92]] as const) {
    detail = { description: name, dataType: 'SR Legacy', foodNutrients: nutrients(kcal, fat, 0) }
    await open({ ...original(name, kcal), fat_g: fat, sugar_g: 0 })
    assert.equal(ctx.adjustBase.unit, 'ml'); close(ctx.adjustBase.density, density)
    const options = ctx.adjustServingOptions; assert.ok(options.some((x: any) => x.ml === 100))
    const saved = await save(name.startsWith('Milk') ? 100 : 15, name.startsWith('Milk') ? 'ml' : 'g')
    assert.equal(saved.total.calories, name.startsWith('Milk') ? 63 : 133)
    assert.equal(saved.items[0].sugar_g, 0); assert.equal(saved.items[0].fiber_g, null)
  }
  for (const [country, unit, amount, ml] of [['AU', 'tbsp', 2, 40], ['AU', 'cup', 1, 250], ['AU', 'quarter-cup', 1, 62.5], ['US', 'tbsp', 2, 30], ['US', 'cup', 1, 240]] as const) {
    detail = { description: 'Milk, whole', dataType: 'SR Legacy', foodNutrients: nutrients(61, 3.3, 0) }
    await open({ ...original(detail.description, 61), fat_g: 3.3 }); ctx.userCountry = country
    const saved = await save(amount, unit)
    assert.equal(saved.description, `Milk, whole, ${ml} ml`)
    close(saved.items[0].servings, ml / 100)
    assert.equal(saved.items[0].serving_size, '100 ml'); assert.equal(saved.items[0].id, 'original-id')
    close(saved.items[0].calories, 62.83); assert.equal(saved.items[0].fiber_g, null)
    assert.equal(saved.total.calories, Math.round(62.83 * ml / 100))
    close(ctx.convertAmountBetweenUnits(amount, unit, 'ml', ctx.adjustBase, {}, country), ml)
    close(ctx.convertAmountBetweenUnits(ml, 'ml', unit, ctx.adjustBase, {}, country), amount)
  }
  ctx.userCountry = ''
  detail = { description: 'Oat milk, unsweetened, plain, refrigerated', dataType: 'Foundation', foodNutrients: [
    { nutrientId: 2047, unitName: 'KCAL', value: 48.3298 },
    { nutrientId: 1003, unitName: 'G', value: .796875 },
    { nutrientId: 1005, unitName: 'G', value: 5.100325 },
    { nutrientId: 1004, unitName: 'G', value: 2.749 },
    { nutrientId: 1079, unitName: 'G', value: 0 },
    { nutrientId: 1063, unitName: 'G', value: 2.3216 },
  ] }
  await open(original(detail.description, 48.3298))
  const halfOat = await save(.5, 'serving')
  assert.equal(halfOat.description, `${detail.description}, 50 g`, 'saved caption must show amount eaten, not the provider denominator')
  assert.equal(halfOat.total.calories, 24)
  assert.equal(halfOat.items[0].servings, .5)
  assert.equal(halfOat.items[0].serving_size, '100 g', 'caption must not replace the original nutrient basis')
  assert.equal(halfOat.items[0].calories, 48.3298); assert.equal(halfOat.items[0].fat_g, 2.749)
  assert.equal(halfOat.items[0].selectedServingId, 'usda:original-id:100g')
  assert.equal(halfOat.items[0].servingOptions.length, 1)
  for (const [amount, unit, label] of [[50, 'g', '50 g'], [200, 'g', '200 g'], [1.25, 'oz', '1.25 oz'], [.0001, 'g', '0.0001 g']] as const) {
    await open(original(detail.description, 48.3298))
    const saved = await save(amount, unit)
    assert.equal(saved.description, `${detail.description}, ${label}`)
    assert.equal(saved.items[0].serving_size, '100 g')
  }
  for (const [amount, unit, label] of [[.5, 'serving', '50 ml'], [100, 'ml', '100 ml'], [15, 'g', '15 g'], [.5, 'fl oz', '0.5 fl oz'], [2, 'tbsp', '30 ml']] as const) {
    detail = { description: 'Milk, whole', dataType: 'SR Legacy', foodNutrients: nutrients(61, 3.3, 0) }
    await open({ ...original(detail.description, 61), fat_g: 3.3 })
    const saved = await save(amount, unit)
    assert.equal(saved.description, `Milk, whole, ${label}`, 'weight, volume and serving-count descriptions remain distinct')
    assert.equal(saved.items[0].serving_size, '100 ml')
    assert.equal(saved.items[0].fiber_g, null); assert.equal(saved.items[0].sugar_g, 0)
  }
  detail = { description: 'Diluted apple juice', dataType: 'SR Legacy', foodNutrients: nutrients(47, 0), foodPortions: [{ gramWeight: 239, portionDescription: 'cup' }] }
  await open(original(detail.description)); const halfCup = await save(.5, 'serving')
  assert.equal(halfCup.description, 'Diluted apple juice, 119.5 g')
  assert.equal(halfCup.items[0].serving_size, 'cup — 239g'); assert.equal(halfCup.items[0].servings, .5)
  await open(original(detail.description)); ctx.userCountry = 'AU'; const auRecordedCup = await save(.5, 'serving')
  assert.equal(auRecordedCup.description, halfCup.description); assert.equal(auRecordedCup.total.calories, halfCup.total.calories)
  assert.equal(auRecordedCup.items[0].serving_size, 'cup — 239g'); assert.equal(auRecordedCup.items[0].selectedServingId, halfCup.items[0].selectedServingId)
  ctx.userCountry = ''
  assert.equal(ctx.formatConsumedServing(.5, 'serving', .5, '1 fillet', 'Fish'), '0.5 × 1 fillet', 'unweighed original source must not acquire an invented metric quantity')
  for (const servingSize of ['1 fillet', '1 slice', '1 serving']) {
    const item = { ...original('Fish fillet', 200), id: 'fixture-no-weight', source: 'custom', serving_size: servingSize, protein_g: 25, fat_g: 8 }
    await open(item)
    assert.equal(ctx.adjustBase, null, 'unweighed original portion must not acquire a guessed100g base')
    assert.deepEqual(Array.from(ctx.defaultUnitOptions(ctx.adjustBase, item.name)), ['serving'])
    assert.equal(ctx.adjustUnit, 'serving'); assert.equal(ctx.adjustAmountInput, '1')
    const saved = await save(.5, 'serving')
    assert.equal(saved.total.calories, 100); assert.equal(saved.items[0].servings, .5)
    assert.equal(saved.items[0].serving_size, servingSize)
    assert.equal(saved.items[0].id, item.id); assert.equal(saved.items[0].fiber_g, null)
    assert.equal(saved.description, `Fish fillet, 0.5 × ${servingSize}`)
    for (const unit of ['g', 'ml', 'oz', 'fl oz', 'tsp', 'piece']) {
      assert.equal(ctx.computeServings(50, unit, null, {}), 0, 'unsupported units cannot become50 servings')
      assert.equal(ctx.convertAmountBetweenUnits(1, 'serving', unit, null, {}), 0)
    }
  }
  for (const servingSize of ['', ' ', null]) {
    const alerts: any[] = []; const oldAlert = ctx.Alert
    ctx.Alert = { alert: (...args: any[]) => alerts.push(args) }; ctx.adjustItem = null; payload = undefined
    await ctx.openAdjust({ ...original('Fish fillet', 200), source: 'custom', serving_size: servingSize })
    assert.equal(ctx.adjustItem, null, 'a missing source denominator cannot become an invented serving')
    await ctx.addAdjustedItem(); assert.equal(payload, undefined)
    assert.equal(alerts[0][0], 'Cannot add this item'); ctx.Alert = oldAlert
  }
  for (const value of ['', ' ', true, [], [100], {}, 0, -1, NaN, Infinity]) {
    const options = ctx.normalizeServingOptionsForAdjust([{ id: 'fixture-invalid-measure', serving_size: '1 fillet', grams: value, ml: value, calories: 200, protein_g: 25, carbs_g: 0, fat_g: 8 }])
    assert.equal(options[0].grams, null); assert.equal(options[0].ml, null)
    assert.equal(ctx.recordedServingBase('1 fillet', 'Fish', options[0]), null)
  }
  assert.equal(ctx.recordedServingBase('1 small shot', 'Unknown drink', { ml: 25, unit: 'ml' }).amount, 25)
  assert.equal(ctx.recordedServingBase('1 small shot', 'Unknown drink', { ml: 25, unit: 'ml' }).unit, 'ml')
  assert.equal(ctx.recordedServingBase('8 fl oz', 'Unknown drink').unit, 'fl oz')
  for (const [name, countUnit] of [['Bananas, raw', 'piece-medium'], ['Egg, whole, raw, fresh', 'egg-medium']] as const) {
    await open({ ...original(name, 100), source: 'custom' })
    assert.equal(ctx.adjustBase.amount, 100); assert.equal(ctx.adjustBase.unit, 'g')
    const units = ctx.getFoodUnitGrams(name)
    assert.ok(ctx.defaultUnitOptions(ctx.adjustBase, name, units).includes(countUnit), 'recorded100g sized produce/egg paths stay available')
    close(ctx.computeServings(1, countUnit, ctx.adjustBase, units), ctx.resolveUnitGrams(countUnit, units) / 100)
  }
  const portions = [
    { id: 'fixture-fillets:unknown', serving_size: '1 fillet', calories: 200, protein_g: 25, carbs_g: 0, fat_g: 8, fiber_g: null, sugar_g: 0 },
    { id: 'fixture-fillets:measured', serving_size: '1 large fillet', grams: 200, unit: 'g', calories: 400, protein_g: 50, carbs_g: 0, fat_g: 16, fiber_g: null, sugar_g: 0 },
  ]
  await open({ ...original('Fish fillet', 200), source: 'custom', serving_size: '1 fillet', servingOptions: portions, selectedServingId: portions[0].id })
  assert.equal(ctx.adjustBase, null)
  ctx.applyAdjustServingOption(ctx.adjustServingOptions[1])
  assert.equal(ctx.adjustBase.amount, 200, 'explicit provider weight remains usable even with a count-only label')
  assert.equal(ctx.adjustBase.unit, 'g')
  const measured = await save(100, 'g')
  assert.equal(measured.total.calories, 200); assert.equal(measured.items[0].servings, .5)
  assert.equal(measured.items[0].serving_size, '1 large fillet'); assert.equal(measured.items[0].selectedServingId, portions[1].id)
  await open({ ...original('Fish fillet', 200), source: 'custom', serving_size: '1 large fillet', servingOptions: portions, selectedServingId: portions[1].id })
  ctx.applyAdjustServingOption(ctx.adjustServingOptions[0])
  assert.equal(ctx.adjustBase, null, 'switching back to an unweighed choice cannot keep the previous mass')
  const alerts: any[] = []
  const oldAlert = ctx.Alert; ctx.Alert = { alert: (...args: any[]) => alerts.push(args) }
  ctx.adjustAmountInput = '50'; ctx.safeAdjustUnit = 'g'; payload = undefined
  await ctx.addAdjustedItem()
  assert.equal(payload, undefined, 'actual save handler blocks an unsupported weight')
  assert.ok(alerts.length); ctx.Alert = oldAlert
  assert.equal(ctx.unitLabel('three-quarter-cup', 'Milk, whole', {}), '3/4 cup — 180 ml')
  console.log('PASS: actual USDA detail/serving options, native override/cache/open/save preserve source basis/IDs/options, compatible milk/oil density, null/zero and fraction labels; no network or credentials.')
}

// Exercise the real adjustment expressions and rendered cards/button, not a second calculation.
const previewNames = ['adjustAmount', 'adjustServings', 'servingsForPreview', 'previewCalories', 'previewProtein', 'previewCarbs', 'previewFat', 'previewFiber', 'previewSugar']
const realJsx: ts.JsxElement[] = []
function collectPreviewJsx(node: ts.Node) {
  if (ts.isJsxElement(node)) realJsx.push(node)
  ts.forEachChild(node, collectPreviewJsx)
}
collectPreviewJsx(screen)
const labelJsx = realJsx.filter(node => node.openingElement.tagName.getText(screen) === 'Text' && node.getText(screen).includes('servingsForPreview')).sort((a,b) => a.getWidth(screen)-b.getWidth(screen))[0]
const addJsx = realJsx.find(node => node.openingElement.tagName.getText(screen) === 'Pressable' && node.openingElement.getText(screen).includes("'Adding to diary' : 'Add to diary'"))
assert.ok(labelJsx && addJsx, 'use the actual amount label and add button')
let cardsJsx: ts.JsxSelfClosingElement | undefined
function findCards(node: ts.Node) {
  if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(screen) === 'NutrientCards' && node.getText(screen).includes('previewCalories')) cardsJsx=node
  ts.forEachChild(node, findCards)
}
findCards(screen); assert.ok(cardsJsx, 'actual adjustment result cards remain')
const createElement = (type: any, props: any, ...children: any[]) => typeof type === 'function'
  ? type({ ...props, children }) : { type, props, children: children.flat(Infinity).filter(x => x != null && x !== false) }
ctx.React = { createElement }; ctx.useState=() => [320, () => {}]; ctx.Text='Text'; ctx.View='View'; ctx.Pressable='Pressable'; ctx.theme={colors:{text:'#111',card:'#fff'}}
const cardSource=ts.createSourceFile('cards.tsx',fs.readFileSync('native/src/components/NutrientCards.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX)
const cardCode=cardSource.statements.filter(n=>!ts.isImportDeclaration(n)).map(n=>n.getText(cardSource).replace(/^export /,'')).join('\n')
vm.runInContext(ts.transpileModule(cardCode,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.None,jsx:ts.JsxEmit.React}}).outputText,ctx)
function renderJsx(node: ts.Node) {
  return vm.runInContext(ts.transpileModule(`(${node.getText(screen)})`,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.None,jsx:ts.JsxEmit.React}}).outputText,ctx)
}
function texts(node: any): string[] {
  return typeof node==='string'||typeof node==='number' ? [String(node)] : (node?.children||[]).flatMap(texts)
}
function preview(amount: string, unit='g', base: any={amount:100,unit:'g',density:null}, zero=false) {
  ctx.adjustItem={name:'Fixture',calories:200,protein_g:24.6,carbs_g:44.9,fat_g:29.4,fiber_g:null,sugar_g:8.8}
  if(zero)Object.assign(ctx.adjustItem,{calories:0,protein_g:0,carbs_g:0,fat_g:0,fiber_g:0,sugar_g:0})
  ctx.adjustAmountInput=amount;ctx.safeAdjustUnit=unit;ctx.adjustBase=base;ctx.mergedAdjustUnitGrams={};ctx.adjustSaving=false
  for(const name of previewNames)bind(screen,ctx,name)
  return {cards:texts(renderJsx(cardsJsx!)),label:texts(renderJsx(labelJsx!)).join(''),button:renderJsx(addJsx!)}
}
for(const amount of ['0','',' ','-1','bad','Infinity']) {
  const result=preview(amount)
  assert.equal(ctx.previewCalories,null,`${JSON.stringify(amount)} is not genuine zero-calorie food`)
  assert.equal(result.cards.filter(t=>t==='—').length,6,'invalid quantity keeps all six unavailable cards')
  for(const label of ['Calories','Protein','Carbs','Fat','Fibre','Sugar'])assert.ok(result.cards.includes(label))
  assert.ok(result.label.includes('Enter an amount bigger than 0.'),'actual inline warning explains correction')
  assert.ok(!result.label.includes('Servings: 1'),'no fabricated serving count')
  assert.equal(result.button.props.disabled,true,'actual invalid Add button is disabled')
  assert.equal(result.button.props.accessibilityState.disabled,true)
}
const unsupported=preview('50','g',null)
assert.equal(unsupported.cards.filter(t=>t==='—').length,6)
assert.ok(unsupported.label.includes('Choose a measured amount'))
assert.equal(unsupported.button.props.disabled,true)
const validHalf=preview('50')
assert.equal(ctx.servingsForPreview,.5);assert.ok(validHalf.label.includes('0.5'));assert.ok(validHalf.cards.includes('100 kcal'))
assert.equal(validHalf.button.props.disabled,false)
const validZero=preview('100','g',{amount:100,unit:'g',density:null},true)
assert.ok(validZero.cards.includes('0 kcal'));assert.equal(validZero.cards.filter(t=>t==='0 g').length,5)
assert.equal(validZero.button.props.disabled,false,'valid zero food remains addable')
console.log('PASS: actual native invalid amount expressions and card/label/button JSX reject false servings/zero results, retain all six cards and preserve valid half/true-zero portions.')

void run().catch(error => { console.error(error); process.exitCode = 1 })
