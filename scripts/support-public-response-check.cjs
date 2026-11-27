#!/usr/bin/env node
'use strict'
// Actual public hydration and customer handlers; synthetic records, no providers.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript'), crypto = require('node:crypto')
const root = path.resolve(__dirname, '..'), copy = value => JSON.parse(JSON.stringify(value))
function load(file, deps) {
  const module = { exports: {} }
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText,
    { module, exports: module.exports, Date, URL, Buffer, console, require: name => { if (Object.hasOwn(deps, name)) return deps[name]; throw Error('Unexpected dependency: ' + name) } }, { filename: file })
  return module.exports
}
const state = load('native/src/lib/supportState.ts', {})
const signedPaths = []
const hydration = load('lib/support-attachments.ts', {
  '@/lib/support-state': state,
  '@/lib/blob-access': { extractScopedBlobPath: () => null, buildSignedBlobUrl: (value, scope, expiry) => { signedPaths.push(value); return 'https://signed.example.invalid/' + value + '?ttl=' + expiry } },
})
const attachment = value => '\n\n[[ATTACHMENTS]]\n' + JSON.stringify([{ name: 'image.jpg', url: 'https://old.example.invalid/image', path: value, type: 'image/jpeg', size: 20 }])
const rows = () => [
  { id: 'customer', message: 'Customer reply' + attachment('support/customer-image'), isAdminResponse: false },
  { id: 'answer', message: 'Normal support answer', isAdminResponse: true },
  { id: 'notes', message: '[SYSTEM] Internal notes PRIVATE_NOTES_SENTINEL' + attachment('support/internal-image'), isAdminResponse: true },
  { id: 'follow-up', message: '[SYSTEM] Follow-up required', isAdminResponse: true },
  { id: 'receipt', message: '[SYSTEM] Email receipt PRIVATE_RECEIPT_SENTINEL', isAdminResponse: true },
  { id: 'identity', message: '[SYSTEM] Identity verified PRIVATE_IDENTITY_SENTINEL', isAdminResponse: true },
  { id: 'not-exact-ended', message: state.SUPPORT_CHAT_ENDED_MARKER + ' PRIVATE_SUFFIX_SENTINEL', isAdminResponse: true },
  { id: 'customer-literal', message: '[SYSTEM] Customer typed this literal text', isAdminResponse: false },
  { id: 'feedback', message: '[FEEDBACK] Rating: 1/5\nComment: Please help.', isAdminResponse: false },
]
function clean(ticket) {
  assert(ticket)
  const json = JSON.stringify(ticket)
  for (const value of ['PRIVATE_NOTES_SENTINEL', 'PRIVATE_RECEIPT_SENTINEL', 'PRIVATE_IDENTITY_SENTINEL', 'PRIVATE_SUFFIX_SENTINEL']) assert(!json.includes(value), value + ' must remain private')
  assert(ticket.responses.some(row => row.id === 'customer-literal'))
  assert(ticket.responses.some(row => row.id === 'feedback'))
  assert(ticket.responses.some(row => row.id === 'answer'))
  assert(ticket.responses.find(row => row.id === 'customer').message.includes('https://signed.example.invalid/support/customer-image'))
}
let count = 0
async function check(name, run) { await run(); count++; console.log('PASS ' + name) }
async function run() {
  await check('public helper filters before attachment signing and preserves ordinary messages, feedback and exact ended marker', async () => {
    const ticket = { id: 'owned', externalMessageId: 'guest:synthetic-token', message: 'Original message' + attachment('support/original-image'), responses: [...rows(), { id: 'ended', message: state.SUPPORT_CHAT_ENDED_MARKER, isAdminResponse: true }] }
    const before = copy(ticket); signedPaths.length = 0
    const result = hydration.rehydratePublicSupportTicket(ticket, 123)
    clean(result); assert(state.isSupportChatClosed(result)); assert.equal(result.externalMessageId, ticket.externalMessageId)
    assert(result.message.includes('ttl=123')); assert(!signedPaths.includes('support/internal-image'))
    assert.deepEqual(ticket, before)
    const missing = hydration.rehydratePublicSupportTicket({ message: 'No replies yet' }); assert.equal(missing.responses, undefined)
  })
  await check('existing administrator hydration still includes private notes and receipts', async () => {
    const ticket = { message: 'Original', responses: rows() }
    const result = hydration.rehydrateSupportTicket(ticket)
    assert.equal(result.responses.length, ticket.responses.length)
    assert(JSON.stringify(result).includes('PRIVATE_NOTES_SENTINEL'))
    assert(JSON.stringify(result).includes('PRIVATE_RECEIPT_SENTINEL'))
    assert(fs.readFileSync(path.join(root, 'app/api/admin/tickets/route.ts'), 'utf8').includes("import { rehydrateSupportTicket } from '@/lib/support-attachments'"))
  })
  for (const guest of [false, true]) {
    let ticket, serial = 0
    function reset() { ticket = { id: 'owned', userId: 'owner', userEmail: 'owner@example.invalid', userName: 'Owner', externalMessageId: 'guest:synthetic-token', subject: 'Support request', message: 'Original' + attachment('support/original-image'), status: 'IN_PROGRESS', createdAt: new Date(), responses: rows() } }
    reset()
    const matches = where => Object.entries(where).every(([key, value]) => key === 'OR' ? value.some(matches) : key === 'status' && value?.notIn ? !value.notIn.includes(ticket.status) : key === 'responses' && value?.none ? !ticket.responses.some(row => Object.entries(value.none).every(([field, expected]) => row[field] === expected)) : ticket[key] === value)
    const prisma = { user: { findUnique: async () => ({ id: 'owner', email: 'owner@example.invalid' }) },
      supportTicket: {
        findFirst: async ({ where }) => matches(where) ? copy(ticket) : null,
        findUnique: async () => copy(ticket),
        findMany: async ({ select }) => [Object.fromEntries(Object.keys(select).map(key => [key, ticket[key]]))],
        create: async ({ data }) => { ticket = { ...ticket, ...data, responses: rows() }; return copy(ticket) },
        update: async ({ data }) => { Object.assign(ticket, data); return copy(ticket) },
      },
      ticketResponse: { create: async ({ data }) => { const row = { id: 'new-' + ++serial, ...data }; ticket.responses.push(row); return copy(row) } },
    }
    prisma.$transaction = callback => callback(prisma)
    const route = load(guest ? 'app/api/support/inquiry/route.ts' : 'app/api/support/tickets/route.ts', {
      'next/server': { NextResponse: { json: (data, options) => ({ status: options?.status || 200, json: async () => data }) } }, crypto,
      'next-auth': { getServerSession: async () => ({ user: { id: 'owner', email: 'owner@example.invalid' } }) },
      '@/lib/auth': { authOptions: {} }, '@/lib/native-auth': { getUserIdFromNativeAuth: async () => null },
      '@/lib/prisma': { prisma }, '@prisma/client': {}, '@/lib/support-state': state,
      '@/lib/support-agents': { getSupportAgentForTimestamp: () => ({ name: 'Support', role: 'Helfi' }) },
      '@/lib/support-attachments': hydration,
      '@/lib/support-automation': {
        buildSupportFeedbackPrompt: () => 'Please rate your support experience.',
        processSupportTicketAutoReply: async () => { ticket.responses.push({ id: 'generated-private', message: '[SYSTEM] Internal notes PRIVATE_NOTES_SENTINEL', isAdminResponse: true }) },
        sendSupportFeedbackEmail: async () => {}, sendSupportTranscriptEmail: async () => {},
      },
    })
    const label = guest ? 'guest' : 'signed-in'
    await check(label + ': full actual GET filters internal rows and preserves ownership', async () => {
      reset()
      const suffix = guest ? '?ticketId=owned&token=synthetic-token' : '?ticketId=owned&activeOnly=0'
      const response = await route.GET({ url: 'https://helfi.invalid/api/support/' + (guest ? 'inquiry' : 'tickets') + suffix })
      clean((await response.json()).ticket)
      const wrong = await route.GET({ url: 'https://helfi.invalid/api/support/' + (guest ? 'inquiry?ticketId=owned&token=wrong' : 'tickets?ticketId=foreign&activeOnly=0') })
      const wrongBody = await wrong.json(); assert(!wrongBody.ticket)
      if (!guest) {
        clean((await (await route.GET({ url: 'https://helfi.invalid/api/support/tickets?activeOnly=0' })).json()).ticket)
        const list = await (await route.GET({ url: 'https://helfi.invalid/api/support/tickets?list=1&activeOnly=0' })).json()
        assert.equal(list.tickets[0].responses, undefined)
      }
    })
    for (const action of ['create', 'add_response', 'end_chat', 'submit_feedback']) await check(label + ': actual ' + action + ' return contains no internal rows', async () => {
      reset()
      const response = await route.POST({ json: async () => ({ action, ticketId: 'owned', token: 'synthetic-token', name: 'Owner', email: 'owner@example.invalid', subject: 'Support request', message: 'Exact customer message', rating: 1, comment: 'Still needs help.' }) })
      assert.equal(response.status, 200); const result = await response.json(); clean(result.ticket)
      if (action === 'end_chat') assert(state.isSupportChatClosed(result.ticket))
      assert(ticket.responses.some(row => row.id === 'notes'), 'Stored internal notes must not be removed')
    })
  }
  console.log(`Support public responses: ${count} actual-source offline groups passed; no real records, messages or providers.`)
}
run().catch(error => { console.error(error); process.exitCode = 1 })
