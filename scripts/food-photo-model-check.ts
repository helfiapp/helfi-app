import assert from 'node:assert/strict'
import { DEFAULT_UNIT_GRAMS } from '../lib/food/measurement-units'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { HELFI_ANALYSIS_MODEL, isSpecialistOpenAIModel } from '../lib/ai-models'
import { HELFI_FOOD_PHOTO_MODEL, FOOD_PHOTO_MODEL_FEATURE, FOOD_PHOTO_COMPLETION_TOKENS, buildFoodPhotoPrompt, prepareFoodPhotoCompletion, selectFoodAnalysisModel } from '../lib/food-photo-model'

function load(file: string, adapters: Record<string, any>) {
  const ast = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
  const text = ast.statements.filter(node => !ts.isImportDeclaration(node)).map(node => node.getText(ast)).join('\n')
  const context: any = { exports: {}, console, Date, Set, JSON, Error, Number, ...adapters }
  vm.createContext(context)
  vm.runInContext(ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, context)
  return context.exports
}

async function main() {
  assert.equal(selectFoodAnalysisModel(true, false, false), HELFI_FOOD_PHOTO_MODEL)
  for (const args of [[false, false, false], [true, true, false], [true, false, true]]) {
    assert.equal(selectFoodAnalysisModel(...args as [boolean, boolean, boolean]), HELFI_ANALYSIS_MODEL)
  }
  const prompt = buildFoodPhotoPrompt('USER HINT: beef vs lamb', 'FEEDBACK: missing small sides')
  assert.ok(prompt.length < 3300, 'the primary meal-photo prompt must stay compact for6.1 latency/cost')
  for (const essential of ['every visible food', 'FULL count', 'exactly once', 'raw/cooked/fried/breaded', 'servings:1', 'Unknown fibre/sugar are null', 'isGuess:true', 'PER-SERVING', 'Components:', '<ITEMS_JSON>', '</ITEMS_JSON>', 'USER HINT: beef vs lamb', 'FEEDBACK: missing small sides']) assert.ok(prompt.includes(essential), essential)
  const calls: any[] = []
  let safetyChecks = 0
  const wrapper = load('lib/metered-openai.ts', { HELFI_ANALYSIS_MODEL, isSpecialistOpenAIModel,
    HELFI_FOOD_PHOTO_MODEL, FOOD_PHOTO_MODEL_FEATURE, getRunContext: () => null,
    costCentsForTokens: () => 1, estimateTokensFromText: () => 1,
    assertAiUsageAllowed: async () => { safetyChecks++ }, reportCriticalError: () => {} })
  const fakeProvider = { chat: { completions: { create: async (params: any) => {
    calls.push(params)
    return { model: params.model, choices: [{ message: { content: 'synthetic offline result' }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 10 } }
  } } } }
  // Execute the actual route adapter, rather than a copy of its routing logic.
  const routeText = fs.readFileSync('app/api/analyze-food/route.ts', 'utf8')
  const ast = ts.createSourceFile('route.ts', routeText, ts.ScriptTarget.Latest, true)
  let declaration: ts.VariableDeclaration | undefined
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'runOpenAICompletion') declaration = node
    ts.forEachChild(node, visit)
  }
  visit(ast)
  assert.ok(declaration)
  const context: any = { prepareFoodPhotoCompletion, useFoodPhotoModel: true, openai: fakeProvider, chatCompletionWithCost: wrapper.chatCompletionWithCost }
  vm.createContext(context)
  vm.runInContext(ts.transpileModule('this.run = ' + declaration.initializer!.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context)
  const photoMessages = [{ role: 'user', content: [{ type: 'text', text: 'Synthetic fixture' }, { type: 'image_url', image_url: { url: 'https://example.invalid/offline-only.jpg' } }] }]
  await context.run({ model: HELFI_ANALYSIS_MODEL, messages: photoMessages, max_tokens: 420, temperature: 0, top_p: 1 })
  assert.equal(calls[0].model, HELFI_FOOD_PHOTO_MODEL)
  assert.equal(calls[0].reasoning_effort, 'low')
  assert.equal(calls[0].max_completion_tokens, FOOD_PHOTO_COMPLETION_TOKENS, 'vision follow-up cannot exhaust its tiny old allowance on reasoning')
  for (const key of ['max_tokens', 'temperature', 'top_p']) assert.ok(!(key in calls[0]))
  await context.run({ model: HELFI_FOOD_PHOTO_MODEL, messages: photoMessages, max_completion_tokens: 2200 })
  assert.equal(calls[1].max_completion_tokens, 2200, 'never undo primary wallet cap')
  await context.run({ model: HELFI_ANALYSIS_MODEL, messages: [{ role: 'user', content: 'Text-only health alternatives' }], max_tokens: 220 })
  assert.equal(calls[2].model, HELFI_ANALYSIS_MODEL)
  assert.equal(calls[2].max_completion_tokens, 220)
  context.useFoodPhotoModel = false
  await context.run({ model: HELFI_ANALYSIS_MODEL, messages: photoMessages, max_tokens: 1200 })
  assert.equal(calls[3].model, HELFI_ANALYSIS_MODEL, 'packaged/label calls stay on existing model')
  await wrapper.chatCompletionWithCost(fakeProvider, { model: HELFI_FOOD_PHOTO_MODEL, messages: photoMessages, max_tokens: 900 }, { feature: 'health-image' })
  assert.equal(calls[4].model, HELFI_ANALYSIS_MODEL, 'other app features cannot inherit food upgrade')
  assert.equal(safetyChecks, calls.length, 'consent/usage safety still gates every provider call')
  const body = routeText.slice(routeText.indexOf('    let primaryUsageEvent: any = null;'))
  assert.ok(!body.includes('chatCompletionWithCost(openai,'), 'all in-route vision fallbacks must use the approved adapter')
  assert.ok(routeText.includes('isMealPhotoAnalysis(true, packagedMode, labelScan) ? buildFoodPhotoPrompt(hintBlock, feedbackBlock)'), 'only ordinary meal photos use the compact prompt; text/label instructions remain intact')
  assert.ok(routeText.includes('capMaxTokensToBudget(model, promptText, maxTokens, wallet.totalAvailableCents)'))
  // Execute the real web result filter and count normalizer against the
  // ten-component bowl that the live UI reduced from1093 to1087kcal.
  const pageAst = ts.createSourceFile('page.tsx', fs.readFileSync('app/food/page.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const pageHelpers = new Set(['DEFAULT_SERVING_GRAMS', 'WEIGHT_UNIT_TO_GRAMS', 'stripNutritionFromServingSize', 'replaceWordNumbers', 'parseServingQuantity', 'isFractionalServingQuantity', 'singularizeUnitLabel', 'isGenericSizeLabel', 'parseServingUnitMetadata', 'DISCRETE_UNIT_KEYWORDS', 'isDiscreteUnitLabel', 'stripWeightPhrasesFromLabel', 'replaceWordNumbersForLabel', 'hasExplicitPieceCountInLabel', 'getExplicitPieces', 'getPiecesPerServing', 'quickParseServingSize', 'normalizeDiscreteItem', 'isMacroOnlyName', 'stripGenericPlateItems'])
  const actualPageHelpers: string[] = []
  function collectPage(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && pageHelpers.has(node.name.text)) actualPageHelpers.push('const ' + node.getText(pageAst) + ';')
    ts.forEachChild(node, collectPage)
  }
  collectPage(pageAst); assert.equal(actualPageHelpers.length, pageHelpers.size)
  let renderedPieceExpression = ''
  function collectRenderedPieces(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'piecesPerServing' && node.initializer?.getText(pageAst).includes('getPiecesPerServing(item)')) renderedPieceExpression = node.initializer.getText(pageAst)
    ts.forEachChild(node, collectRenderedPieces)
  }
  collectRenderedPieces(pageAst); assert.ok(renderedPieceExpression, 'exercise the detected-food rendering expression, not only normalized data')
  const pageContext: any = { DEFAULT_UNIT_GRAMS, defaultGramsForItem: () => null }
  vm.createContext(pageContext)
  vm.runInContext(ts.transpileModule(actualPageHelpers.join('\n') + '\nthis.filter = stripGenericPlateItems; this.normalize = normalizeDiscreteItem; this.parseServing = parseServingUnitMetadata;', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, pageContext)
  pageContext.renderedPieces = (item: any) => {
    pageContext.item = item
    pageContext.servingUnitMeta = pageContext.parseServing(item.serving_size || item.name || '')
    return vm.runInContext(renderedPieceExpression, pageContext)
  }
  const bowl = [{"name":"Seared salmon","serving_size":"1 fillet, approximately 230 g cooked","servings":1,"calories":474,"protein_g":51,"carbs_g":0,"fat_g":29,"fiber_g":0,"sugar_g":0,"isGuess":true},{"name":"Cooked white rice","serving_size":"Approximately 300 g, about 1.9 cups cooked","servings":1,"calories":390,"protein_g":8.1,"carbs_g":84.6,"fat_g":0.9,"fiber_g":1.2,"sugar_g":0.3,"isGuess":true},{"name":"Raw avocado","serving_size":"Approximately 75 g sliced","servings":1,"calories":120,"protein_g":1.5,"carbs_g":6.4,"fat_g":11,"fiber_g":5,"sugar_g":0.5,"isGuess":true},{"name":"Raw cucumber","serving_size":"Approximately 60 g sliced","servings":1,"calories":6,"protein_g":0.4,"carbs_g":1.3,"fat_g":0.1,"fiber_g":0.4,"sugar_g":0.8,"isGuess":true},{"name":"Raw radish","serving_size":"Approximately 40 g sliced","servings":1,"calories":6,"protein_g":0.3,"carbs_g":1.4,"fat_g":0,"fiber_g":0.6,"sugar_g":0.8,"isGuess":true},{"name":"Kimchi","serving_size":"Approximately 60 g, about 1/3 cup","servings":1,"calories":18,"protein_g":1,"carbs_g":3,"fat_g":0.3,"fiber_g":1.5,"sugar_g":1,"isGuess":true},{"name":"Nori seaweed","serving_size":"2 overlapping pieces, approximately 5 g total","servings":1,"calories":17,"protein_g":1.5,"carbs_g":2,"fat_g":0.2,"fiber_g":1,"sugar_g":0,"isGuess":true},{"name":"Raw scallions","serving_size":"Approximately 15 g chopped","servings":1,"calories":5,"protein_g":0.3,"carbs_g":1.1,"fat_g":0,"fiber_g":0.4,"sugar_g":0.4,"isGuess":true},{"name":"Sesame seeds","serving_size":"Approximately 3 g, about 1 teaspoon","servings":1,"calories":17,"protein_g":0.5,"carbs_g":0.7,"fat_g":1.5,"fiber_g":0.4,"sugar_g":0,"isGuess":true},{"name":"Orange-brown sauce","serving_size":"Approximately 20 g coating and drizzle","servings":1,"calories":40,"protein_g":0,"carbs_g":8,"fat_g":1,"fiber_g":0,"sugar_g":0,"isGuess":true}]
  const untouchedBowl = JSON.stringify(bowl)
  const kept = pageContext.filter(bowl, 'Estimated salmon bowl with visible toppings.')
  assert.equal(kept.length, 10, 'radish must not disappear because its name contains dish')
  assert.equal(kept.reduce((sum: number, x: any) => sum + x.calories, 0), 1093, 'visible cards must retain the complete response calorie total')
  assert.ok(kept.some((x: any) => x.name === 'Raw radish'))
  const normalized = kept.map((x: any) => pageContext.normalize(x))
  for (const name of ['Raw avocado', 'Raw cucumber', 'Raw radish']) {
    const x = normalized.find((x: any) => x.name === name)
    assert.ok(x); assert.ok(!x.pieces && !x.piecesPerServing, name + ' measured grams must not become a piece count')
    for (const label of [x.serving_size, x.serving_size.replace(/ (g)\b/g, '$1')]) {
      assert.equal(pageContext.renderedPieces({ ...x, serving_size: label }), null, name + ' rendered count must reject both60g and60 g weights')
    }
  }
  assert.equal(normalized.reduce((sum: number, x: any) => sum + x.calories, 0), 1093)
  assert.equal(JSON.stringify(bowl), untouchedBowl)
  const egg = pageContext.normalize({ name: 'Fried eggs', serving_size: '3 eggs (150 g)', servings: 1, calories: 210, protein_g: 18, fiber_g: null })
  assert.equal(egg.piecesPerServing, 3); assert.equal(egg.calories, 210); assert.equal(egg.fiber_g, null)
  assert.equal(pageContext.renderedPieces(egg), 3)
  const crackers = pageContext.normalize({ name: 'Crackers', serving_size: '10 g (6 crackers)', servings: 1, calories: 40 })
  assert.equal(crackers.piecesPerServing, 6)
  assert.equal(pageContext.renderedPieces(crackers), 6)
  const withSummary = pageContext.filter([...bowl, { name: 'Whole salmon meal', calories: 1093 }], '')
  assert.equal(withSummary.length, 10, 'genuine duplicate summary still excluded')
  console.log('PASS: actual web result helpers keep ten bowl components/1093kcal, retain radish, do not turn measured sliced vegetables into piece counts, and preserve real egg/cracker counts.')
  console.log('PASS: actual production food adapter routes only meal photos to6.1, keeps low reasoning/full fallback output, respects primary budget and leaves text/labels/other AI and safety gates unchanged.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
