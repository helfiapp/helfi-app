import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { costCentsForTokens } from '../lib/cost-meter'
import { HELFI_ANALYSIS_MODEL } from '../lib/ai-models'
import { HELFI_FOOD_PHOTO_MODEL, FOOD_PHOTO_MODEL_FEATURE, FOOD_PHOTO_COMPLETION_TOKENS } from '../lib/food-photo-model'

// Execute the actual adapter with an injected SDK and consent guard. This never
// constructs a provider client, reads a credential or makes a network request.
function loadAdapter(guard: (context: any) => Promise<void>) {
  const file = 'lib/food-photo-background.ts'
  const ast = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
  const text = ast.statements.filter(node => !ts.isImportDeclaration(node)).map(node => node.getText(ast)).join('\n')
  const scope: any = { exports: {}, Error, Number, Array,
    assertAiUsageAllowed: guard, costCentsForTokens,
    HELFI_ANALYSIS_MODEL, HELFI_FOOD_PHOTO_MODEL, FOOD_PHOTO_MODEL_FEATURE, FOOD_PHOTO_COMPLETION_TOKENS }
  vm.createContext(scope)
  vm.runInContext(ts.transpileModule(text, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText, scope)
  return scope.exports
}

function typeCheckAdapter() {
  const config = ts.readConfigFile('tsconfig.json', ts.sys.readFile)
  assert.equal(config.error, undefined)
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd())
  const program = ts.createProgram(['lib/food-photo-background.ts'], { ...parsed.options, incremental: false })
  const errors = ts.getPreEmitDiagnostics(program).filter(diagnostic =>
    !diagnostic.file || diagnostic.file.fileName.endsWith('/lib/food-photo-background.ts'))
  assert.equal(errors.length, 0, ts.formatDiagnosticsWithColorAndContext(errors, {
    getCanonicalFileName: file => file, getCurrentDirectory: () => process.cwd(), getNewLine: () => '\n',
  }))
}

function completed(model = HELFI_FOOD_PHOTO_MODEL): any {
  return {
    id: 'resp_offline_fixture', model, status: 'completed', created_at: 123,
    output: [
      { type: 'reasoning', summary: [] },
      { type: 'message', role: 'assistant', status: 'completed', content: [
        { type: 'output_text', text: '{"items":', annotations: [] },
        { type: 'output_text', text: '[]}', annotations: [] },
      ] },
    ],
    usage: { input_tokens: 1200, output_tokens: 500, total_tokens: 1700,
      input_tokens_details: { cached_tokens: 100 }, output_tokens_details: { reasoning_tokens: 300 } },
  }
}

function freeze(value: any): any {
  if (value && typeof value === 'object') {
    Object.freeze(value)
    for (const child of Object.values(value)) freeze(child)
  }
  return value
}

function equal(actual: any, expected: any) {
  // VM prototypes differ; compare the values sent to the actual SDK boundary.
  assert.deepEqual(JSON.parse(JSON.stringify(actual)), expected)
}

async function main() {
  typeCheckAdapter()
  const guards: any[] = []
  let denied = false
  const adapter = loadAdapter(async context => {
    guards.push(context)
    if (denied) throw Object.assign(new Error('consent needed'), { code: 'ai_consent_required' })
  })
  const calls: any[] = []
  let next: any = completed()
  let providerError: any = null
  const sdk: any = { responses: {
    create: async (...args: any[]) => { calls.push(['create', ...args]); if (providerError) throw providerError; return { id: 'resp_offline_fixture', status: 'queued' } },
    retrieve: async (...args: any[]) => { calls.push(['retrieve', ...args]); if (providerError) throw providerError; return next },
    cancel: async (...args: any[]) => { calls.push(['cancel', ...args]); if (providerError) throw providerError; return { id: 'resp_offline_fixture', status: 'cancelled' } },
  } }
  const context = freeze({ userId: 'offline-user', runId: 'offline-job-stage', feature: FOOD_PHOTO_MODEL_FEATURE })
  const messages = freeze([
    { role: 'system', content: 'Retain unknown sugar as null.' },
    { role: 'developer', content: 'Use the food database.' },
    { role: 'user', content: [
      { type: 'text', text: 'A difficult mixed meal.' },
      { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,OFFLINE', detail: 'high' } },
      { type: 'image_url', image_url: { url: 'https://example.invalid/offline.jpg', detail: 'low' } },
    ] },
    { role: 'assistant', content: 'Earlier ingredient list.' },
    { role: 'user', content: 'Correct the omitted side.' },
  ])
  const params = freeze({ model: HELFI_FOOD_PHOTO_MODEL, messages, max_completion_tokens: 2400,
    max_tokens: 6144, temperature: 0, top_p: 1, reasoning_effort: 'high', response_format: { type: 'json_object' } })
  equal(await adapter.startFoodBackgroundCompletion(sdk, params, context), { responseId: 'resp_offline_fixture' })
  const request = calls[0][1]
  assert.equal(request.model, HELFI_FOOD_PHOTO_MODEL)
  assert.equal(request.reasoning.effort, 'low')
  assert.equal(request.max_output_tokens, 2400, 'preserve the wallet cap rather than the larger fallback')
  assert.equal(request.background, true)
  assert.equal(request.store, false, 'do not opt photos into 30-day stored Responses')
  assert.equal(request.stream, false)
  equal(calls[0][2], { timeout: 8000, maxRetries: 0, headers: { 'Idempotency-Key': context.runId } })
  equal(request.text, { format: { type: 'json_object' } })
  equal(request.input, [
    { role: 'system', content: 'Retain unknown sugar as null.' },
    { role: 'developer', content: 'Use the food database.' },
    { role: 'user', content: [
      { type: 'input_text', text: 'A difficult mixed meal.' },
      { type: 'input_image', image_url: 'data:image/jpeg;base64,OFFLINE', detail: 'high' },
      { type: 'input_image', image_url: 'https://example.invalid/offline.jpg', detail: 'low' },
    ] },
    { role: 'assistant', content: 'Earlier ingredient list.' },
    { role: 'user', content: 'Correct the omitted side.' },
  ])
  for (const key of ['max_tokens', 'max_completion_tokens', 'temperature', 'top_p', 'reasoning_effort', 'metadata']) {
    assert.ok(!(key in request), 'avoid unsupported controls or personal metadata: ' + key)
  }
  assert.equal(params.max_completion_tokens, 2400)
  const schema = freeze({ name: 'meal_components', strict: true, schema: {
    type: 'object', properties: { items: { type: 'array', items: { type: 'string' } } }, required: ['items'], additionalProperties: false,
  } })
  await adapter.startFoodBackgroundCompletion(sdk, {
    model: HELFI_ANALYSIS_MODEL, messages: [{ role: 'user', content: 'Repair JSON only.' }],
    max_tokens: 900, response_format: { type: 'json_schema', json_schema: schema },
  }, context)
  assert.equal(calls[1][1].model, HELFI_ANALYSIS_MODEL)
  assert.equal(calls[1][1].reasoning.effort, 'none', 'text-only repairs retain the existing 5.6 behavior')
  assert.equal(calls[1][1].max_output_tokens, 900)
  equal(calls[1][1].text, { format: { type: 'json_schema', ...schema } })
  await adapter.startFoodBackgroundCompletion(sdk, { model: HELFI_FOOD_PHOTO_MODEL, messages }, { ...context, feature: 'food:text' })
  assert.equal(calls[2][1].model, HELFI_ANALYSIS_MODEL, '6.1 feature gate matches the existing metered adapter')
  assert.equal(calls[2][1].max_output_tokens, FOOD_PHOTO_COMPLETION_TOKENS)

  const beforeInvalid = calls.length
  for (const invalid of [
    { ...params, max_completion_tokens: 0 }, { ...params, max_completion_tokens: NaN },
    { ...params, tools: [{}] }, { ...params, n: 2 }, { ...params, model: 'unapproved-model' },
    { ...params, response_format: { type: 'unknown' } },
    { ...params, messages: [{ role: 'user', content: [{ type: 'input_audio', data: 'offline' }] }] },
    { ...params, messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'offline', detail: 'bad' } }] }] },
    { ...params, messages: [{ role: 'tool', content: 'offline' }] },
  ]) await assert.rejects(adapter.startFoodBackgroundCompletion(sdk, invalid, context), error => String((error as any).code).startsWith('food_background_'))
  await assert.rejects(adapter.startFoodBackgroundCompletion(sdk, params, { userId: '', runId: 'job' }), { code: 'food_background_missing_context' })
  await assert.rejects(adapter.startFoodBackgroundCompletion(sdk, params, { ...context, runId: 'not an opaque ID' }), { code: 'food_background_missing_context' })
  await assert.rejects(adapter.startFoodBackgroundCompletion(sdk, params, { ...context, timeoutMs: 9000 }), { code: 'food_background_invalid_timeout' })
  assert.equal(calls.length, beforeInvalid, 'invalid content must not silently drop information or call the provider')
  denied = true
  await assert.rejects(adapter.startFoodBackgroundCompletion(sdk, params, context), { code: 'ai_consent_required' })
  assert.equal(calls.length, beforeInvalid, 'denied sharing consent cannot create a job')
  denied = false

  const paid = adapter.foodBackgroundResponseToCompletion(completed())
  assert.equal(paid.completion.choices[0].message.content, '{"items":\n[]}')
  assert.equal(paid.promptTokens, 1200)
  assert.equal(paid.completionTokens, 500, 'reasoning tokens are already included, not charged twice')
  assert.equal(paid.costCents, costCentsForTokens(HELFI_FOOD_PHOTO_MODEL, { promptTokens: 1200, completionTokens: 500 }))
  const previous = adapter.foodBackgroundResponseToCompletion(completed(HELFI_ANALYSIS_MODEL + '-2026-01-01'))
  assert.equal(previous.costCents, costCentsForTokens(HELFI_ANALYSIS_MODEL, { promptTokens: 1200, completionTokens: 500 }))
  equal(await adapter.retrieveFoodBackgroundCompletion(sdk, 'resp_offline_fixture'), { status: 'completed', result: JSON.parse(JSON.stringify(paid)) })
  const poll = calls[calls.length - 1]
  equal(poll.slice(1), ['resp_offline_fixture', { stream: false }, { timeout: 8000, maxRetries: 0 }])
  for (const status of ['queued', 'in_progress']) {
    next = { ...completed(), status }
    equal(await adapter.retrieveFoodBackgroundCompletion(sdk, next.id), { status: 'pending' })
  }
  for (const status of ['failed', 'cancelled', 'incomplete', undefined]) {
    next = { ...completed(), status, error: { message: 'private image URL and prompt' } }
    const result = await adapter.retrieveFoodBackgroundCompletion(sdk, next.id)
    assert.equal(result.status, 'failed')
    assert.ok(!JSON.stringify(result).includes('private'))
    assert.ok(!('result' in result), 'partial results cannot become billable completions')
  }
  for (const [mutate, code] of [
    [(r: any) => { r.usage = null }, 'food_background_invalid_usage'],
    [(r: any) => { r.usage.output_tokens = -1 }, 'food_background_invalid_usage'],
    [(r: any) => { r.usage.total_tokens = 900 }, 'food_background_invalid_usage'],
    [(r: any) => { r.output = [] }, 'food_background_empty_output'],
    [(r: any) => { r.output[1].content = [{ type: 'refusal', refusal: 'private prompt' }] }, 'food_background_refused'],
    [(r: any) => { r.output[1].status = 'incomplete' }, 'food_background_invalid_output'],
    [(r: any) => { r.model = 'unknown' }, 'food_background_invalid_model'],
  ] as Array<[(r: any) => void, string]>) {
    next = completed(); mutate(next)
    equal(await adapter.retrieveFoodBackgroundCompletion(sdk, next.id), { status: 'failed', error: code })
  }
  const beforeCancelGuards = guards.length
  denied = true
  await adapter.cancelFoodBackgroundCompletion(sdk, 'resp_offline_fixture')
  assert.equal(guards.length, beforeCancelGuards, 'withdrawal must not prevent cancellation or re-charge polling')
  assert.equal(calls[calls.length - 1][0], 'cancel')
  await adapter.cancelFoodBackgroundCompletion(sdk, 'resp_offline_fixture', { timeoutMs: 3000 })
  equal(calls[calls.length - 1][2], { timeout: 3000, maxRetries: 0 })
  await assert.rejects(adapter.retrieveFoodBackgroundCompletion(sdk, 'resp_offline_fixture', { timeoutMs: 9000 }), { code: 'food_background_invalid_timeout' })
  providerError = { status: 404, message: 'private provider details' }
  equal(await adapter.retrieveFoodBackgroundCompletion(sdk, 'resp_offline_fixture'), { status: 'failed', error: 'food_background_expired' })
  providerError = { status: 500, message: 'private prompt URL' }
  await assert.rejects(adapter.retrieveFoodBackgroundCompletion(sdk, 'resp_offline_fixture'), { code: 'food_background_retrieve_uncertain', message: 'food_background_retrieve_uncertain' })
  denied = false
  await assert.rejects(adapter.startFoodBackgroundCompletion(sdk, params, context), { code: 'food_background_start_uncertain' })
  assert.equal(calls[calls.length - 1][2].maxRetries, 0, 'ambiguous creation must not automatically duplicate paid work')
  providerError = null
  next = { ...completed(), id: 'resp_another_job' }
  await assert.rejects(adapter.retrieveFoodBackgroundCompletion(sdk, 'resp_offline_fixture'), { code: 'food_background_response_mismatch' })
  const beforeInvalidId = calls.length
  await assert.rejects(adapter.retrieveFoodBackgroundCompletion(sdk, 'private-invalid-id'), { code: 'food_background_invalid_response_id' })
  assert.equal(calls.length, beforeInvalidId)
  assert.equal(guards[0], context, 'the real consent and usage guard receives the explicit account and run')
  console.log('PASS: background adapter types, image/instruction/schema conversion, model gate, token caps, consent, pending/terminal states, usage/pricing, safe errors and cancellation (offline).')
}

main().catch(error => { console.error(error); process.exitCode = 1 })
