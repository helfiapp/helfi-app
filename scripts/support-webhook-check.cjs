#!/usr/bin/env node
'use strict'
// Execute the actual webhook with synthetic storage, credentials and delivery only.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const crypto = require('node:crypto')
const ts = require('typescript')
const source = fs.readFileSync(path.join(__dirname, '../app/api/tickets/webhook/route.ts'), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText
const copy = value => value == null ? value : JSON.parse(JSON.stringify(value))
const secret = 'synthetic-webhook-secret'
const rawError = 'PRIVATE_SYNTHETIC_PROVIDER_ERROR'
const incoming = extra => ({ from: 'Customer <owner@example.invalid>', to: 'support@helfi.ai', subject: 'Food save problem', text: 'The save did not work.', messageId: '<new@example.invalid>', ...extra })
const prior = extra => ({ id: 'ticket-original', userEmail: 'owner@example.invalid', externalMessageId: '<original@example.invalid>', subject: 'Original question', message: 'Original body', status: 'IN_PROGRESS', ...extra })

function fixture({ tickets = [], responses = [], failReply = false, configuredSecret = secret, failDatabase = false } = {}) {
  const state = { tickets: copy(tickets), responses: copy(responses), dbCalls: [], replies: [], emails: [], logs: [], bodyReads: 0, locks: [] }
  const lockTails = new Map()
  function matches(row, where) {
    return Object.entries(where).every(([field, value]) => {
      if (value && typeof value === 'object') {
        if (Object.hasOwn(value, 'equals')) {
          assert.equal(value.mode, 'insensitive')
          return String(row[field]).toLowerCase() === String(value.equals).toLowerCase()
        }
        if (Object.hasOwn(value, 'in')) return value.in.includes(row[field])
        throw new Error('Unhandled synthetic query operator')
      }
      return row[field] === value
    })
  }
  function storage(locked) {
    const record = (operation, data) => {
      state.dbCalls.push({ operation, data: copy(data) })
      if (locked) assert(locked(), 'Transaction must acquire the actual receipt lock before storage')
      if (failDatabase) throw new Error(rawError)
    }
    return {
      supportTicket: {
        findFirst: async ({ where }) => { record('ticket.find', where); return copy(state.tickets.find(row => matches(row, where)) || null) },
        create: async ({ data }) => { record('ticket.create', data); const row = { id: 'ticket-new-' + (state.tickets.length + 1), ...copy(data) }; state.tickets.push(row); return copy(row) },
        update: async ({ where, data }) => { record('ticket.update', data); const row = state.tickets.find(row => matches(row, where)); assert(row); Object.assign(row, copy(data)); return copy(row) },
      },
      ticketResponse: {
        findFirst: async ({ where }) => { record('response.find', where); return copy(state.responses.find(row => matches(row, where)) || null) },
        create: async ({ data }) => { record('response.create', data); const row = { id: 'response-' + (state.responses.length + 1), ...copy(data) }; state.responses.push(row); return copy(row) },
      },
    }
  }
  const prisma = storage()
  prisma.$transaction = async callback => {
    state.dbCalls.push({ operation: 'transaction' })
    let release, acquired = false
    const tx = storage(() => acquired)
    tx.$queryRaw = async (strings, receipt) => {
      assert.match(strings.join('?'), /SELECT pg_advisory_xact_lock\(hashtext\(\?\)\)/)
      assert.match(receipt, /^\[SYSTEM\] Email received [a-f0-9]{64}$/)
      assert.equal(acquired, false)
      const previous = lockTails.get(receipt) || Promise.resolve()
      const hold = new Promise(resolve => { release = resolve })
      lockTails.set(receipt, previous.then(() => hold))
      await previous
      acquired = true
      state.locks.push(receipt)
      return []
    }
    try { return await callback(tx) } finally { if (release) release() }
  }
  const deps = {
    'next/server': { NextResponse: { json: (data, options) => ({ status: options?.status || 200, data: copy(data) }) } },
    crypto,
    '@/lib/prisma': { prisma },
    '@/lib/support-automation': { processSupportTicketAutoReply: async input => {
      assert(state.tickets.some(row => row.id === input.ticketId), 'Enquiry must be durable before auto-reply')
      assert(state.responses.some(row => row.ticketId === input.ticketId && row.isAdminResponse && row.message.startsWith('[SYSTEM] Email received ')), 'Receipt must be durable before auto-reply')
      state.replies.push(copy(input))
      state.emails.push({ ticketId: input.ticketId })
      if (failReply) throw new Error(rawError)
    } },
  }
  const module = { exports: {} }
  vm.runInNewContext(compiled, {
    module, exports: module.exports, Buffer, Date,
    process: { env: { SUPPORT_INBOUND_WEBHOOK_SECRET: configuredSecret } },
    console: { error: (...args) => state.logs.push(copy(args)) },
    require: name => { if (Object.hasOwn(deps, name)) return deps[name]; throw new Error('Unexpected dependency: ' + name) },
  }, { filename: 'app/api/tickets/webhook/route.ts' })
  return { state, post: (payload = incoming(), authorization = 'Bearer ' + secret) => module.exports.POST({
    headers: { get: name => name === 'authorization' ? authorization : null },
    text: async () => { state.bodyReads++; return typeof payload === 'string' ? payload : JSON.stringify(payload) },
  }) }
}
function untouched(f) {
  assert.equal(f.state.dbCalls.length, 0)
  assert.equal(f.state.replies.length, 0)
  assert.equal(f.state.emails.length, 0)
}
const receiptRows = f => f.state.responses.filter(row => row.isAdminResponse && row.message.startsWith('[SYSTEM] Email received '))
let passed = 0
async function check(name, run) { await run(); passed++; console.log('PASS ' + name) }
async function run() {
  await check('missing, wrong and unconfigured authentication never reads payload or touches storage/delivery', async () => {
    for (const authorization of [null, '', 'Bearer incorrect', 'Bearer ' + 'x'.repeat(secret.length), 'Basic ' + secret]) {
      const f = fixture(); assert.equal((await f.post('{invalid', authorization)).status, 401); untouched(f); assert.equal(f.state.bodyReads, 0)
    }
    const f = fixture({ configuredSecret: '' }); assert.equal((await f.post()).status, 401); untouched(f); assert.equal(f.state.bodyReads, 0)
  })
  await check('invalid sender, recipient, message and message ID are rejected before storage', async () => {
    for (const changes of [
      { from: '' }, { from: 'doe' }, { from: 'owner@example.invalid\r\nBcc: other@example.invalid' },
      { to: 'other@example.invalid' }, { to: null }, { to: ['not-support@example.invalid'] }, { to: 'support@helfi.ai\r\nBcc: other@example.invalid' },
      { messageId: '' }, { messageId: null }, { messageId: 'x'.repeat(501) }, { messageId: '<a>\r\nInjected: true' },
      { text: '' }, { text: 'x'.repeat(20001) }, { subject: 'x'.repeat(201) },
    ]) { const f = fixture(); assert.equal((await f.post(incoming(changes))).status, 400); untouched(f) }
  })
  await check('support self-copies are ignored without storage, AI or email', async () => {
    const f = fixture(); const result = await f.post(incoming({ from: 'Helfi Support <SUPPORT@HELFI.AI>' })); assert.equal(result.status, 200); assert.equal(result.data.ignored, true); untouched(f)
  })
  await check('a new message stores the literal enquiry and one durable receipt before its reply', async () => {
    const f = fixture(); const result = await f.post(incoming({ to: [{ email: 'other@example.invalid' }, { address: 'SUPPORT@HELFI.AI' }] }))
    assert.equal(result.status, 200); assert.equal(result.data.duplicate, false); assert.equal(f.state.tickets.length, 1)
    const ticket = f.state.tickets[0]; assert.equal(ticket.userEmail, 'owner@example.invalid'); assert.equal(ticket.message, 'The save did not work.'); assert.equal(ticket.externalMessageId, '<new@example.invalid>')
    assert.equal(receiptRows(f).length, 1); assert.equal(receiptRows(f)[0].ticketId, ticket.id)
    assert.deepEqual(f.state.replies, [{ ticketId: ticket.id, latestUserMessage: ticket.message, source: 'email_ticket' }]); assert.equal(f.state.emails.length, 1)
  })
  await check('matching ticket reference and sender append only to that ticket', async () => {
    const original = prior(); const other = prior({ id: 'ticket-later', externalMessageId: '<later@example.invalid>' })
    const f = fixture({ tickets: [other, original] }); const result = await f.post(incoming({ from: 'OWNER@EXAMPLE.INVALID', subject: 'Re: [Helfi:ticket-original] Original question' }))
    assert.equal(result.data.ticketId, original.id); assert.equal(f.state.tickets.length, 2)
    assert.equal(f.state.responses.filter(row => !row.isAdminResponse).length, 1); assert.equal(f.state.responses[0].ticketId, original.id)
    assert.deepEqual(f.state.tickets.find(row => row.id === other.id), other); assert.equal(f.state.replies[0].source, 'email_reply')
  })
  await check('normal reply headers match the original external message for the same sender', async () => {
    for (const headers of [{ inReplyTo: '<original@example.invalid>' }, { references: ['<unrelated@example.invalid>', '<original@example.invalid>'] }]) {
      const f = fixture({ tickets: [prior()] }); const result = await f.post(incoming(headers)); assert.equal(result.data.ticketId, 'ticket-original'); assert.equal(f.state.tickets.length, 1); assert.equal(f.state.replies[0].source, 'email_reply')
    }
  })
  await check('unrelated Re subject never attaches to the newest same-email ticket', async () => {
    const originals = [prior({ id: 'ticket-later' }), prior({ id: 'ticket-earlier', externalMessageId: '<earlier@example.invalid>' })]
    const f = fixture({ tickets: originals }); const result = await f.post(incoming({ subject: 'Re: A completely different question' }))
    assert.equal(f.state.tickets.length, 3); assert(!originals.some(row => row.id === result.data.ticketId)); assert.deepEqual(f.state.tickets.slice(0, 2), originals); assert.equal(f.state.replies[0].source, 'email_ticket')
  })
  await check('unknown references and mismatched senders cannot append to an existing ticket', async () => {
    for (const changes of [
      { subject: 'Re: [Helfi:unknown-ticket] question' },
      { subject: 'Re: [Helfi:ticket-original] question', from: 'stranger@example.invalid' },
      { inReplyTo: '<original@example.invalid>', from: 'stranger@example.invalid' },
      { references: ['<original@example.invalid>'], from: 'stranger@example.invalid' },
      { inReplyTo: 'guest:private-token' },
    ]) {
      const original = prior({ externalMessageId: changes.inReplyTo?.startsWith('guest:') ? changes.inReplyTo : '<original@example.invalid>' })
      const f = fixture({ tickets: [original] }); const result = await f.post(incoming(changes)); assert.equal(result.status, 200); assert.notEqual(result.data.ticketId, original.id)
      assert.deepEqual(f.state.tickets[0], original); assert(!f.state.responses.some(row => row.ticketId === original.id)); assert.equal(f.state.replies[0].source, 'email_ticket')
    }
  })
  for (const reply of [false, true]) await check((reply ? 'reply' : 'new') + ' duplicate deliveries serialize the receipt lock and perform one delivery', async () => {
    const f = fixture({ tickets: reply ? [prior()] : [] }); const payload = incoming(reply ? { subject: 'Re: [Helfi:ticket-original] question' } : {})
    const results = await Promise.all([f.post(payload), f.post(payload), f.post(payload)])
    results.push(await f.post(payload))
    assert(results.every(row => row.status === 200)); assert.equal(new Set(results.map(row => row.data.ticketId)).size, 1)
    assert.equal(results.filter(row => !row.data.duplicate).length, 1); assert.equal(f.state.tickets.length, 1); assert.equal(receiptRows(f).length, 1)
    assert.equal(f.state.responses.filter(row => !row.isAdminResponse).length, reply ? 1 : 0); assert.equal(f.state.replies.length, 1); assert.equal(f.state.emails.length, 1)
    assert.equal(f.state.locks.length, 4); assert.equal(new Set(f.state.locks).size, 1)
  })
  await check('an already recorded original message is not delivered again without a receipt row', async () => {
    const f = fixture({ tickets: [prior({ externalMessageId: '<new@example.invalid>' })] }); const result = await f.post()
    assert.equal(result.data.duplicate, true); assert.equal(result.data.ticketId, 'ticket-original'); assert.equal(f.state.responses.length, 0); assert.equal(f.state.replies.length, 0); assert.equal(f.state.emails.length, 0)
  })
  await check('uncertain auto-reply failure retains the enquiry and follow-up status without replaying delivery', async () => {
    for (const reply of [false, true]) {
      const f = fixture({ tickets: reply ? [prior()] : [], failReply: true }); const payload = incoming(reply ? { subject: 'Re: [Helfi:ticket-original] question' } : {})
      const results = await Promise.all([f.post(payload), f.post(payload)]); results.push(await f.post(payload))
      assert(results.every(row => row.status === 200)); assert.equal(f.state.tickets[0].status, 'IN_PROGRESS'); assert.equal(receiptRows(f).length, 1)
      assert.equal(f.state.replies.length, 1); assert.equal(f.state.emails.length, 1); assert.equal(f.state.tickets.length, 1)
      assert(!JSON.stringify({ results, logs: f.state.logs }).includes(rawError))
      assert.equal(reply ? f.state.responses.find(row => !row.isAdminResponse).message : f.state.tickets[0].message, payload.text)
    }
  })
  await check('malformed and oversized payloads fail safely without raw content or side effects', async () => {
    for (const payload of ['{"' + rawError, 'null', '[]', '42', JSON.stringify(incoming({ text: rawError.repeat(10000) }))]) {
      const f = fixture(); const result = await f.post(payload); assert(result.status >= 400); assert(!JSON.stringify(result).includes(rawError)); untouched(f)
    }
    const f = fixture(); assert.equal((await f.post('x'.repeat(128001))).status, 413); untouched(f)
    const unicode = fixture(); assert.equal((await unicode.post('é'.repeat(64001))).status, 413); untouched(unicode)
    const db = fixture({ failDatabase: true }); const result = await db.post(); assert.equal(result.status, 500); assert(!JSON.stringify({ result, logs: db.state.logs }).includes(rawError)); assert.equal(db.state.replies.length, 0); assert.equal(db.state.emails.length, 0)
  })
  console.log(`Support webhook: ${passed} actual-source offline groups passed; no real database, network, AI, keys or emails.`)
}
run().catch(error => { console.error(error); process.exitCode = 1 })
