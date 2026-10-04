import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { FOOD_BENCHMARK_MODELS, isFoodBenchmarkImageUrl, inspectFoodBenchmarkOutput, estimateFoodBenchmarkVendorCents } from '../lib/food-benchmark'
import { getModelPrices, costCentsForTokens } from '../lib/cost-meter'

function load(file: string, adapters: Record<string, any>) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const code = source.statements.filter(node => !ts.isImportDeclaration(node)).map(node => node.getText(source)).join('\n')
  const context: any = { exports: {}, console, Date, Set, JSON, Error, Number, ...adapters }
  vm.createContext(context)
  vm.runInContext(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, context)
  return context.exports
}
const imageUrl = 'https://helfi.ai/FOOD%20TEST%20IMAGES/public-fixture.jpg'
const item = { name: 'Cooked salmon fillet, skinless, pan-seared', serving_size: '200 g', servings: 1, calories: 412, protein_g: 44, carbs_g: 0, fat_g: 25, fiber_g: null, sugar_g: null, isGuess: true }
const output = JSON.stringify({ items: Array(7).fill(item), total: { calories: 2884, protein_g: 308, carbs_g: 0, fat_g: 175 } })
async function main() {
  assert.ok(isFoodBenchmarkImageUrl(imageUrl))
  for (const url of ['https://helfi.ai/api/medical-images/file?token=private', 'http://helfi.ai/FOOD%20TEST%20IMAGES/a.jpg', 'https://127.0.0.1/a.jpg', 'https://user:pass@helfi.ai/FOOD%20TEST%20IMAGES/a.jpg', 'https://helfi.ai/FOOD%20TEST%20IMAGES/a.jpg?token=private']) assert.ok(!isFoodBenchmarkImageUrl(url))
  assert.ok(inspectFoodBenchmarkOutput(output, 'stop').ingredientCardsReady)
  assert.ok(!inspectFoodBenchmarkOutput(output, 'length').ingredientCardsReady)
  assert.ok(!inspectFoodBenchmarkOutput(output.slice(0, 1200), 'stop').ingredientCardsReady)
  const wrong = JSON.parse(output); wrong.total.calories = 412
  assert.ok(!inspectFoodBenchmarkOutput(JSON.stringify(wrong), 'stop').ingredientCardsReady)
  assert.equal(estimateFoodBenchmarkVendorCents('gpt-6.1-sol', 1000, 1000), 1.2)
  assert.deepEqual(getModelPrices('gpt-6.1-sol-2026-09-30'), { inputCentsPer1k: 0.2, outputCentsPer1k: 1 })
  const calls: any[] = []
  let safetyChecks = 0
  const wrapper = load('lib/metered-openai.ts', { HELFI_ANALYSIS_MODEL: 'gpt-5.6-sol', isSpecialistOpenAIModel: () => false,
    costCentsForTokens, estimateTokensFromText: () => 1, getRunContext: () => null,
    assertAiUsageAllowed: async () => { safetyChecks++ }, reportCriticalError: () => {} })
  const fakeProvider = { chat: { completions: { create: async (params: any) => { calls.push(params); return { model: params.model, choices: [{ message: { content: output }, finish_reason: 'stop' }], usage: { prompt_tokens: 1000, completion_tokens: 1000 } } } } } }
  await wrapper.chatCompletionWithCost(fakeProvider, { model: 'gpt-6.1-sol', messages: [], max_tokens: 6144, temperature: 0, top_p: 1, logprobs: true, top_logprobs: 2, reasoning_effort: 'none' }, { feature: 'admin:food-benchmark' })
  assert.equal(calls[0].model, 'gpt-6.1-sol'); assert.equal(calls[0].reasoning_effort, 'low'); assert.equal(calls[0].max_completion_tokens, 6144)
  for (const key of ['max_tokens', 'temperature', 'top_p', 'logprobs', 'top_logprobs']) assert.ok(!(key in calls[0]))
  const before = calls.length
  await assert.rejects(wrapper.chatCompletionWithCost(fakeProvider, { model: 'gpt-6.1-sol', messages: [], tools: [{}] }, { feature: 'admin:food-benchmark' }), /Responses API/)
  assert.equal(calls.length, before)
  await wrapper.chatCompletionWithCost(fakeProvider, { model: 'gpt-6.1-sol', messages: [], max_tokens: 900 }, { feature: 'food-analysis' })
  assert.equal(calls[1].model, 'gpt-5.6-sol', 'ordinary app model remains unchanged before comparison')
  assert.equal(calls[1].reasoning_effort, 'none')
  let admin = true
  const route = load('app/api/admin/food-benchmark/route.ts', {
    process: { env: { OPENAI_API_KEY: 'synthetic-fixture-only' } }, OpenAI: class {},
    NextResponse: { json: (body: any, options: any = {}) => ({ body, status: options.status || 200 }) },
    extractAdminFromHeaders: () => admin ? { id: 'fixture-admin' } : null,
    FOOD_BENCHMARK_MODELS, isFoodBenchmarkImageUrl, inspectFoodBenchmarkOutput, estimateFoodBenchmarkVendorCents, costCentsForTokens,
    chatCompletionWithCost: async (_provider: any, params: any) => {
      if (params.model === 'gpt-4o') throw { code: 'fixture_failure' }
      return wrapper.chatCompletionWithCost(fakeProvider, params, { feature: 'admin:food-benchmark' })
    },
  })
  const request = (body: any) => ({ headers: new Headers(), json: async () => body })
  admin = false; assert.equal((await route.POST(request({ imageUrl }))).status, 401)
  admin = true; assert.equal((await route.POST(request({ imageUrl: 'https://private.invalid/a.jpg' }))).status, 400)
  assert.equal((await route.POST(request({ imageUrl, models: ['unapproved-model'] }))).status, 400)
  const result = await route.POST(request({ imageUrl, models: ['gpt-4o', 'gpt-6.1-sol'] }))
  assert.equal(result.status, 200); assert.equal(result.body.results[0].ingredientCardsReady, false)
  assert.equal(result.body.results[1].ingredientCardsReady, true)
  assert.equal(result.body.results[1].outputPreview, output, 'full output retained for complete ingredient review')
  assert.equal(result.body.results[1].vendorCostCents, 1.2)
  assert.equal(safetyChecks, 3)
  console.log('PASS: actual model wrapper and admin route; supported candidate parameters, no ordinary-model change, public fixtures only, full ingredient totals and isolated errors.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
