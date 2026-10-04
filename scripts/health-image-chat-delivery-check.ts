import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const route = ts.createSourceFile('medical-chat.ts', fs.readFileSync('app/api/medical-images/chat/route.ts', 'utf8'), ts.ScriptTarget.Latest, true)
const names = new Set(['buildTitle', 'extractAssistantText', 'formatForNativePlainText', 'buildFallbackAssistantText', 'POST'])
const functions = route.statements.filter(node => ts.isFunctionDeclaration(node) && node.name && names.has(node.name.text)).map(node => node.getText(route)).join('\n')
const compiled = ts.transpileModule(functions, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const fullReply = ('**Short answer**\n\nNo. These notes do not replace an in-person examination.\n\n**Why this matters**\n\n- A photograph cannot establish a diagnosis.\n\n**When to seek care**\n\n- Arrange a medical review.\n- Seek urgent help for severe symptoms.\n\n**Tracking notes**\n\n- Record visible changes and questions for a doctor. ' + 'Paragraph breaks and safety wording must remain complete. '.repeat(8)).trim()

async function run(outcome: 'success' | 'failure' | 'empty' | 'denied', native = false) {
  const calls: any[] = []
  const context: any = {
    exports: {}, Date, console: { error() {} },
    NextResponse: { json: (body: any, options?: any) => Response.json(body, options) },
    aiConsentRequiredResponse: async () => outcome === 'denied' ? Response.json({ error: 'Permission required' }, { status: 403 }) : null,
    resolveMedicalChatUser: async () => ({ id: 'fixture-user' }), getOpenAIClient: () => ({}),
    prisma: { user: { findUnique: async () => ({ id: 'fixture-user', subscription: {}, creditTopUps: [] }) } },
    isSubscriptionActive: () => true, hasFreeCredits: async () => false,
    getThread: async () => ({ id: 'fixture-thread', title: 'Fixture', context: {} }),
    createThread: async () => ({ id: 'fixture-thread' }), listMessages: async () => [],
    updateThreadContext: async () => {}, updateThreadTitle: async () => {}, updateThreadCost: async () => {},
    appendMessage: async (_id: string, role: string, content: string) => calls.push({ saved: role, content }),
    logAIUsage: async () => {},
    CreditManager: class { async chargeCents(cents: number) { calls.push({ charged: cents }); return true } },
    chatCompletionWithCost: async () => {
      calls.push({ provider: true })
      if (outcome === 'failure') throw new Error('Synthetic provider failure')
      return { completion: { choices: [{ message: { content: outcome === 'empty' ? '' : fullReply } }] }, costCents: 3, promptTokens: 100, completionTokens: 200 }
    },
  }
  vm.runInNewContext(compiled, context)
  const req = { headers: new Headers({ 'content-type': 'application/json', accept: 'text/event-stream', ...(native ? { 'x-native-token': 'fixture-token' } : {}) }), json: async () => ({ message: 'Can I skip a doctor?', threadId: 'fixture-thread', analysisResult: { summary: 'Public fixture notes.' } }) }
  const response: Response = await context.exports.POST(req)
  return { response, body: await response.json(), calls }
}

async function main() {
  const success = await run('success')
  assert.match(success.response.headers.get('content-type') || '', /application\/json/)
  assert.equal(success.body.assistant, fullReply)
  assert.equal(success.body.costCents, 3)
  assert.equal(success.calls.filter(call => call.charged).length, 1)
  assert.equal(success.calls.find(call => call.saved === 'assistant').content, fullReply)
  const native = await run('success', true)
  assert.match(native.body.assistant, /No\. These notes/)
  assert.match(native.body.assistant, /\n\nWhy this matters\n•/)
  for (const outcome of ['failure', 'empty'] as const) {
    const fallback = await run(outcome)
    assert.match(fallback.body.assistant, /doctor/i)
    assert.equal(fallback.body.costCents, 0)
    assert.equal(fallback.calls.filter(call => call.charged).length, 0)
  }
  const denied = await run('denied')
  assert.equal(denied.response.status, 403)
  assert.equal(denied.calls.length, 0)

  const clientText = fs.readFileSync('app/medical-images/MedicalImageChat.tsx', 'utf8')
  const client = ts.createSourceFile('chat.tsx', clientText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let loader = ''
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'loadThreads') loader = 'var ' + node.getText(client)
    ts.forEachChild(node, visit)
  }
  visit(client)
  assert.ok(loader)
  for (const test of [{ current: null, preferred: null, expected: null }, { current: 'older', preferred: null, expected: 'older' }, { current: 'older', preferred: 'new', expected: 'new' }, { current: 'removed', preferred: null, expected: null }]) {
    let selected = test.current
    const ctx: any = { useCallback: (fn: any) => fn, fetch: async () => ({ ok: true, json: async () => ({ threads: [{ id: 'older' }, { id: 'new' }] }) }), setThreads() {}, setCurrentThreadId: (next: any) => { selected = typeof next === 'function' ? next(selected) : next } }
    vm.runInNewContext(ts.transpileModule(loader, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, ctx)
    await ctx.loadThreads(test.preferred)
    assert.equal(selected, test.expected)
  }
  console.log('PASS: actual health-image chat route preserves full safety paragraphs and cost receipts, free fallbacks/permission gates, native formatting and explicit historical-chat selection.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
