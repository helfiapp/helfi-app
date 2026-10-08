import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { HELFI_ANALYSIS_MODEL, isSpecialistOpenAIModel } from '../lib/ai-models'
import { HELFI_FOOD_PHOTO_MODEL, FOOD_PHOTO_MODEL_FEATURE, FOOD_PHOTO_COMPLETION_TOKENS, prepareFoodPhotoCompletion, selectFoodAnalysisModel } from '../lib/food-photo-model'

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
  assert.ok(routeText.includes('capMaxTokensToBudget(model, promptText, maxTokens, wallet.totalAvailableCents)'))
  console.log('PASS: actual production food adapter routes only meal photos to6.1, keeps low reasoning/full fallback output, respects primary budget and leaves text/labels/other AI and safety gates unchanged.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
