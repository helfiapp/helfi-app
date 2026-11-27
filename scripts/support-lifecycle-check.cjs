#!/usr/bin/env node
'use strict'
// Exercise the real handlers with synthetic owned tickets; no database, AI or email.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const path = require('node:path')
const root = path.resolve(__dirname, '..')
const copy = value => JSON.parse(JSON.stringify(value))
function load(file, deps) {
  const module = { exports: {} }
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText, { module, exports: module.exports, Date, URL, console, require: name => {
    if (Object.hasOwn(deps, name)) return deps[name]
    throw new Error('Unexpected dependency: ' + name)
  } }, { filename: file })
  return module.exports
}
const state = load('native/src/lib/supportState.ts', {})
const webState = load('lib/support-state.ts', { '../native/src/lib/supportState': state })
assert.equal(webState.isSupportChatClosed, state.isSupportChatClosed)
assert.equal(state.isSupportChatClosed(null), false)
assert.equal(state.isSupportChatClosed({ status: 'IN_PROGRESS' }), false)
assert.equal(state.isSupportChatClosed({ status: 'CLOSED' }), true)
assert.equal(state.isSupportChatClosed({ status: 'RESOLVED' }), true)
assert.equal(state.isSupportChatClosed({ responses: [{ message: state.SUPPORT_CHAT_ENDED_MARKER, isAdminResponse: false }] }), false)
let count = 1
async function check(name, run) { await run(); count++; console.log('PASS ' + name) }
async function run() {
  for (const guest of [false, true]) {
    let ticket, writes, emailCalls, tail
    function reset(status = 'IN_PROGRESS') {
      ticket = { id: 'owned', userId: 'owner', userEmail: 'owner@example.invalid', userName: 'Owner', externalMessageId: 'guest:owner-token', status, createdAt: new Date(), responses: [] }
      writes = []; emailCalls = []; tail = Promise.resolve()
    }
    reset()
    const matches = where => Object.entries(where).every(([key, value]) => key === 'OR' ? value.some(matches) : key === 'status' && value?.notIn ? !value.notIn.includes(ticket.status) : key === 'responses' && value?.none ? !ticket.responses.some(row => Object.entries(value.none).every(([field, expected]) => row[field] === expected)) : ticket[key] === value)
    const prisma = {
      user: { findUnique: async () => ({ id: 'owner', email: 'owner@example.invalid' }) },
      supportTicket: {
        findFirst: async ({ where }) => matches(where) ? copy(ticket) : null,
        findUnique: async () => copy(ticket),
        update: async ({ data }) => { writes.push(copy(data)); Object.assign(ticket, data); return copy(ticket) },
      },
      ticketResponse: { create: async ({ data }) => { const row = { ...data, id: 'response-' + ticket.responses.length }; ticket.responses.push(row); writes.push(copy(row)); return copy(row) } },
    }
    prisma.$transaction = callback => {
      const next = tail.then(() => callback(prisma)); tail = next.catch(() => {}); return next
    }
    const routes = load(guest ? 'app/api/support/inquiry/route.ts' : 'app/api/support/tickets/route.ts', {
      'next/server': { NextResponse: { json: (data, options) => ({ status: options?.status || 200, json: async () => data }) } },
      crypto: {}, 'next-auth': { getServerSession: async () => ({ user: { id: 'owner', email: 'owner@example.invalid' } }) },
      '@/lib/auth': { authOptions: {} }, '@/lib/native-auth': { getUserIdFromNativeAuth: async () => null },
      '@/lib/prisma': { prisma }, '@prisma/client': {}, '@/lib/support-state': webState,
      '@/lib/support-agents': { getSupportAgentForTimestamp: () => ({ name: 'Support', role: 'Helfi' }) },
      '@/lib/support-attachments': { rehydratePublicSupportTicket: value => value },
      '@/lib/support-automation': {
        buildSupportFeedbackPrompt: () => 'Please rate your support experience.',
        processSupportTicketAutoReply: async () => { throw new Error('No AI permitted') },
        sendSupportFeedbackEmail: async () => { emailCalls.push('feedback') },
        sendSupportTranscriptEmail: async () => { emailCalls.push('transcript') },
      },
    })
    const post = (action, extra = {}) => routes.POST({ json: async () => ({ action, ticketId: 'owned', ...(guest ? { token: 'owner-token' } : {}), ...extra }) })
    const label = guest ? 'guest' : 'signed-in'
    await check(label + ': ending preserves pending fault and closes only the conversation', async () => {
      reset(); assert.equal((await post('end_chat')).status, 200)
      assert.equal(ticket.status, 'IN_PROGRESS'); assert(state.isSupportChatClosed(ticket))
      assert.equal(ticket.responses.filter(row => row.message === state.SUPPORT_CHAT_ENDED_MARKER).length, 1)
      assert.equal(ticket.responses.filter(row => row.message.includes('rate your support experience')).length, 1)
      assert(emailCalls.includes('transcript'))
    })
    await check(label + ': repeated and concurrent endings create one prompt and marker', async () => {
      reset(); await Promise.all([post('end_chat'), post('end_chat')]); await post('end_chat')
      assert.equal(ticket.responses.length, 2); assert.equal(ticket.status, 'IN_PROGRESS')
      assert.equal(emailCalls.filter(call => call === 'transcript').length, 1)
    })
    await check(label + ': feedback keeps the exact rating and pending fault', async () => {
      reset(); await post('end_chat'); await post('submit_feedback', { rating: 1, comment: 'No help received.' })
      assert.equal(ticket.status, 'IN_PROGRESS')
      assert(ticket.responses.some(row => !row.isAdminResponse && row.message === '[FEEDBACK] Rating: 1/5\nComment: No help received.'))
      assert(emailCalls.includes('feedback'))
    })
    await check(label + ': wrong ticket or guest token cannot end or rate another conversation', async () => {
      reset()
      for (const action of ['end_chat', 'submit_feedback']) {
        const response = await post(action, { rating: 1, ...(guest ? { token: 'other-token' } : { ticketId: 'foreign' }) })
        assert.equal(response.status, 404)
      }
      assert.equal(writes.length, 0); assert.equal(emailCalls.length, 0)
    })
    await check(label + ': app messages cannot reopen an ended conversation', async () => {
      reset(); await post('end_chat'); const before = copy(ticket.responses)
      const response = await post('add_response', { message: 'Another message' })
      assert.equal(response.status, 409); assert.deepEqual(copy(ticket.responses), before)
      assert.equal(ticket.status, 'IN_PROGRESS')
    })
    await check(label + ': an ending wins before an already-started reply can append', async () => {
      reset()
      const ending = post('end_chat')
      const reply = post('add_response', { message: 'Late reply' })
      await ending; assert.equal((await reply).status, 409)
      assert.equal(ticket.status, 'IN_PROGRESS')
      assert(!ticket.responses.some(row => row.message === 'Late reply'))
    })
    if (!guest) await check('signed-in: ended conversations remain in history but not active lookup', async () => {
      reset(); await post('end_chat')
      const active = await routes.GET({ url: 'https://helfi.invalid/api/support/tickets?activeOnly=1' })
      assert.equal((await active.json()).ticket, null)
      const history = await routes.GET({ url: 'https://helfi.invalid/api/support/tickets?ticketId=owned&activeOnly=0' })
      assert.equal((await history.json()).ticket.id, 'owned')
    })
    await check(label + ': feedback cannot change an existing resolved status', async () => {
      reset('RESOLVED'); await post('submit_feedback', { rating: 5 }); assert.equal(ticket.status, 'RESOLVED')
    })
  }
  console.log(`Support lifecycle: ${count} actual-source offline groups passed; shared web/native helper and normal ticket handlers.`)
}
run().catch(error => { console.error(error); process.exitCode = 1 })
