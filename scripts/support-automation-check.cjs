#!/usr/bin/env node
'use strict'
// Real automation and native request callback, synthetic data only. No credentials/network.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const crypto = require('node:crypto')
const root = path.resolve(__dirname, '..')
const compile = code => ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText
const clone = value => JSON.parse(JSON.stringify(value))
function load(file, deps, globals = {}) {
  const module = { exports: {} }
  vm.runInNewContext(compile(fs.readFileSync(path.join(root, file), 'utf8')), {
    module, exports: module.exports, Date, URL, Buffer, ...globals,
    require: name => { if (Object.hasOwn(deps, name)) return deps[name]; throw new Error('Unexpected dependency: ' + name) },
  }, { filename: file })
  return module.exports
}
const state = load('native/src/lib/supportState.ts', {})
function fixture({ message = 'A food save returned an unexpected error', userId = 'owner', consent = true, status = 'OPEN', responses = [], failModel = false, malformed = false, failEmail = false, duringModel = () => {} } = {}) {
  const ticket = { id: 'synthetic-ticket', subject: 'Food save error', message, userId, user: userId ? { id: userId, email: 'owner@example.invalid' } : null, userEmail: 'owner@example.invalid', userName: 'Owner', status, category: 'GENERAL', priority: 'MEDIUM', createdAt: new Date(), responses: clone(responses) }
  const modelCalls = [], emails = [], logs = [], consentChecks = []
  const prisma = {
    supportTicket: { findUnique: async () => clone(ticket), update: async ({ data }) => { Object.assign(ticket, data); return clone(ticket) } },
    ticketResponse: { create: async ({ data }) => { const row = { id: 'response-' + ticket.responses.length, ...data }; ticket.responses.push(row); return clone(row) } },
    verificationToken: { findFirst: async () => null },
  }
  prisma.$transaction = async run => run(prisma)
  class EmailClient {
    emails = { send: async options => {
      emails.push(clone(options))
      if (failEmail) return { data: null, error: { name: 'SyntheticDeliveryFailure' } }
      return { data: { id: 'synthetic-delivery' }, error: null }
    } }
  }
  const automation = load('lib/support-automation.ts', {
    openai: class { constructor() {} }, crypto,
    '@/lib/prisma': { prisma }, '@prisma/client': {},
    '@/lib/email-client': { Resend: EmailClient, isEmailConfigured: () => true },
    '@/lib/ai-usage-logger': { runChatCompletionWithLogging: async (...args) => {
      modelCalls.push(args)
      duringModel(ticket)
      if (failModel) throw Object.assign(new Error('Synthetic provider error'), { code: 'synthetic_error' })
      return { choices: [{ message: { content: malformed ? 'invalid json' : JSON.stringify({ customerReply: 'Please reopen the Food Diary and tell us which save failed.', shouldEscalate: false, needsIdentityCheck: false, internalNotes: 'PRIVATE_INTERNAL_SENTINEL' }) } }] }
    } },
    '@/lib/email-footer': { getEmailFooter: () => '' },
    '@/lib/support-code-search': { buildSupportCodeContext: () => 'Synthetic verified code context' },
    '@/lib/support-agents': { getSupportAgentForTimestamp: () => ({ name: 'Priya', role: 'Helfi Support' }) },
    '@/lib/ai-consent': { hasAiSharingConsent: async id => { consentChecks.push(id); return consent } },
    '@/lib/support-state': state,
    '@/data/support-kb.json': { version: 'synthetic', topics: [] },
  }, {
    process: { env: { OPENAI_API_KEY: 'synthetic-stub-only' } },
    console: { log: (...args) => logs.push(args), error: (...args) => logs.push(args), warn: (...args) => logs.push(args) },
  })
  return { ticket, modelCalls, emails, logs, consentChecks, automation, reply: (source = 'app_reply') => automation.processSupportTicketAutoReply({ ticketId: ticket.id, latestUserMessage: message, source }) }
}
let count = 0
const failures = []
async function check(name, run) {
  try { await run(); count++; console.log('PASS ' + name) }
  catch (error) { failures.push({ name, error }); console.error('FAIL ' + name + ': ' + error.message) }
}
const publicReply = f => f.ticket.responses.filter(row => row.isAdminResponse && !row.message.startsWith('[SYSTEM]')).at(-1)?.message || ''
async function run() {
  await check('sup receives a greeting without AI', async () => { const f = fixture({ message: 'sup', userId: null, consent: false }); await f.reply(); assert.match(publicReply(f), /Hi!/); assert.equal(f.modelCalls.length, 0) })
  await check('a greeting before a reported fault does not swallow the fault', async () => { const f = fixture({ message: 'Hello, the support chat is broken on my iPhone' }); await f.reply(); assert.equal(f.ticket.status, 'IN_PROGRESS'); assert.doesNotMatch(publicReply(f), /Tell me what you need help with/); assert(f.ticket.responses.some(row => /Chat input UI issue reported/.test(row.message))) })
  await check('no-help follow-up apologizes and retains an investigation', async () => { const f = fixture({ message: 'so no help?', status: 'IN_PROGRESS' }); await f.reply(); assert.match(publicReply(f), /sorry/i); assert.doesNotMatch(publicReply(f), /Support page:/); assert.equal(f.ticket.status, 'IN_PROGRESS') })
  await check('missing account permission keeps normal support and does not call AI', async () => {
    for (const userId of [null, 'owner']) { const f = fixture({ userId, consent: false }); await f.reply(); assert.equal(f.modelCalls.length, 0); assert.match(publicReply(f), /support team|support.*saved/i); assert.doesNotMatch(publicReply(f), /unable to access|AI unavailable|parse failed/i); assert.equal(f.ticket.status, 'IN_PROGRESS'); if (userId) assert.deepEqual(f.consentChecks, [userId]) }
  })
  await check('saved permission uses the exact ticket account and logged support context', async () => { const f = fixture({ userId: 'exact-ticket-owner' }); await f.reply(); assert.deepEqual(f.consentChecks, ['exact-ticket-owner']); assert.equal(f.modelCalls.length, 1); assert.equal(f.modelCalls[0][2].userId, 'exact-ticket-owner'); assert.equal(f.modelCalls[0][2].feature, 'support:ai'); assert.equal(f.modelCalls[0][3].callDetail, 'source:app_reply'); assert.match(publicReply(f), /Food Diary/) })
  await check('provider failure and malformed response both require follow-up', async () => { for (const options of [{ failModel: true }, { malformed: true }]) { const f = fixture(options); await f.reply(); assert.equal(f.ticket.status, 'IN_PROGRESS'); assert.match(publicReply(f), /human|support team|flagged|investigat/i); assert(f.ticket.responses.some(row => row.message === '[SYSTEM] Follow-up required')) } })
  await check('static links cannot downgrade an existing investigation', async () => { const f = fixture({ message: 'where can I contact support?', status: 'IN_PROGRESS' }); await f.reply(); assert.equal(f.modelCalls.length, 0); assert.equal(f.ticket.status, 'IN_PROGRESS') })
  await check('ending copy does not claim a successful repair', async () => { const f = fixture(); const text = f.automation.buildSupportFeedbackPrompt('Owner'); assert.doesNotMatch(text, /glad we could help|resolved|fixed/i); assert.match(text, /ended|experience/i) })
  await check('customer emails omit private internal notes', async () => { const f = fixture(); await f.reply('email_ticket'); const customer = f.emails.filter(email => email.to === f.ticket.userEmail); assert.equal(customer.length, 1); assert.doesNotMatch(customer[0].html, /PRIVATE_INTERNAL_SENTINEL|Internal Notes/); assert(f.ticket.responses.some(row => row.message.includes('PRIVATE_INTERNAL_SENTINEL'))) })
  await check('provider-rejected email delivery cannot be logged as success', async () => { const f = fixture({ failEmail: true }); await assert.rejects(() => f.reply('email_ticket')); assert.equal(f.ticket.status, 'IN_PROGRESS'); assert(f.ticket.responses.some(row => /Follow-up required: email delivery/.test(row.message))); assert(!f.logs.some(args => args.some(value => typeof value === 'string' && /Reply processed/.test(value)))) })
  await check('a model reply arriving after ending does not append or email a closed conversation', async () => {
    const f = fixture({ duringModel: ticket => ticket.responses.push({ message: state.SUPPORT_CHAT_ENDED_MARKER, isAdminResponse: true }) })
    await f.reply('web_ticket')
    assert.equal(publicReply(f), '')
    assert.equal(f.emails.length, 0)
    assert.equal(f.ticket.status, 'OPEN')
    assert(state.isSupportChatClosed(f.ticket))
  })

  const source = fs.readFileSync(path.join(root, 'native/src/screens/SupportScreen.tsx'), 'utf8')
  const tree = ts.createSourceFile('SupportScreen.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let callback
  function visit(node) { if (ts.isVariableDeclaration(node) && node.name.getText(tree) === 'requestJson') callback = node.initializer.arguments[0].getText(tree); ts.forEachChild(node, visit) }
  visit(tree); assert(callback)
  function nativeFixture() {
    let current = { token: 'synthetic-token', user: { id: 'owner' } }, finish
    const calls = [], requests = []
    const box = { URL, JSON, Error, authHeaders: { authorization: 'Bearer synthetic-token' }, session: current,
      getCurrentNativeAuthSession: () => current,
      requestAiDataSharingPermission: () => { calls.push('prompt'); return new Promise(resolve => { finish = resolve }) },
      fetch: async (url, options) => { requests.push({ url, options }); return { ok: true, json: async () => ({ ticket: { id: 'synthetic-ticket' } }) } },
    }
    vm.createContext(box); vm.runInContext(compile('globalThis.requestJson = ' + callback), box)
    return { calls, requests, send: action => box.requestJson('https://helfi.invalid/api/support/tickets', { method: 'POST', body: JSON.stringify({ action, message: 'Exact support message' }) }), read: () => box.requestJson('https://helfi.invalid/api/support/tickets'), finish: allowed => finish(allowed), change: value => { current = value } }
  }
  const tick = async () => { for (let i = 0; i < 10; i++) await Promise.resolve() }
  await check('native support offers optional AI permission on create/reply; declining still sends support', async () => { for (const action of ['create', 'add_response']) { const f = nativeFixture(); const pending = f.send(action); await tick(); assert.equal(f.calls.length, 1); assert.equal(f.requests.length, 0); f.finish(false); await pending; assert.equal(f.requests.length, 1); assert.equal(f.requests[0].options.headers.authorization, 'Bearer synthetic-token') } })
  await check('native history, ending and feedback never request AI permission', async () => { const f = nativeFixture(); await f.read(); await f.send('end_chat'); await f.send('submit_feedback'); assert.equal(f.calls.length, 0); assert.equal(f.requests.length, 3) })
  await check('native account switch or logout while permission is open cannot send an old-account message', async () => { for (const replacement of [null, { token: 'other-token', user: { id: 'other' } }, { token: 'new-token', user: { id: 'owner' } }]) { const f = nativeFixture(); const pending = f.send('create'); await tick(); f.change(replacement); f.finish(false); await assert.rejects(() => pending, /account changed/); assert.equal(f.requests.length, 0) } })
  if (failures.length) throw new Error(`${failures.length} failed support checks: ${failures.map(failure => failure.name).join('; ')}`)
  console.log(`Support automation: ${count} actual-source offline groups passed; no real AI, emails, credentials or database.`)
}
run().catch(error => { console.error(error); process.exitCode = 1 })
