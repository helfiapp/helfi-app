#!/usr/bin/env node
'use strict'
// Actual POST/timing and confirm functions with synthetic auth/storage only.
// No live app/provider calls, environment files, keys or real database access.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path')
function fixture(file, exports) {
  const source = fs.readFileSync(path.join(__dirname, file), 'utf8').replace(/^#!.*\n/, '')
  const at = source.indexOf('async function run() {'); assert(at > 0)
  return new Function('require', '__dirname', `${source.slice(0, at)}\nreturn {${exports}}`)(require, __dirname)
}
const main = fixture('voice-action-matrix-check.cjs', 'ctx,send')
const save = fixture('voice-save-integrity-check.cjs', 'harness,signed,AuditDate')
const plain = value => JSON.parse(JSON.stringify(value))
let passed = 0
async function check(name, run) { await run(); passed++; console.log(`PASS ${name}`) }
const current = main.ctx.localDateFromRequest(null, -660)
function timing(draft, text, today = '2026-10-17') { return main.ctx.applyDraftTiming(draft, text, -660, undefined, 'Australia/Melbourne', today) }
const health = { action: 'journal', localDate: '2026-10-17', canConfirm: true, journal: { journalType: 'health', title: 'Preview only title', tags: ['calm'], content: 'Exact reviewed text' } }
async function run() {
  await check('health journal review contains exactly the normal persisted content/type/date fields', async () => {
    const review = timing(health, 'Write in my health journal that Exact reviewed text')
    assert.equal(review.canConfirm, true); assert.equal(review.summary, 'Health journal note')
    assert.deepEqual(plain(review.journal), { content: 'Exact reviewed text', journalType: 'health' })
    const response = await main.send('Write in my health journal that I slept well', { localDate: current })
    assert.equal(response.status, 200); assert.equal(response.body.draft.canConfirm, true)
    assert.equal(response.body.draft.journal.title, undefined); assert.equal(response.body.draft.journal.tags, undefined)
  })
  await check('health and mood journals clarify explicit clock times before any confirmation authority', async () => {
    for (const journalType of ['health', 'mood']) {
      const review = timing({ ...health, journal: { ...health.journal, journalType } }, `Write in my ${journalType} journal at 08:30`)
      assert.equal(review.canConfirm, false); assert.equal(review.timingNeedsClarification, true); assert.match(review.confirmationMessage, /does not support a chosen clock time/)
    }
    const response = await main.send('Write in my health journal at 08:30 that I slept well', { localDate: current })
    assert.equal(response.body.draft.canConfirm, false); assert.match(response.body.draft.confirmationMessage, /clock time/)
    const previous = { ...health, localTime: '08:30', timeZone: 'Australia/Melbourne' }
    const corrected = main.ctx.applyDraftTiming(health, 'Save it without a clock time', -660, previous, 'Australia/Melbourne', '2026-10-17')
    assert.equal(corrected.canConfirm, true); assert.equal(corrected.localTime, undefined)
  })
  await check('symptom backdating/future dating and chosen clock times clarify; ordinary today note remains reviewable', async () => {
    const symptom = { action: 'symptom_note', canConfirm: true, symptom: { symptoms: ['headache'], notes: 'Exact note' } }
    for (const localDate of ['2026-10-16', '2026-10-18']) {
      const review = timing({ ...symptom, localDate }, 'Record a symptom note')
      assert.equal(review.canConfirm, false); assert.match(review.confirmationMessage, /cannot save it under another date/)
    }
    const clock = timing({ ...symptom, localDate: '2026-10-17' }, 'Record a headache at 08:30')
    assert.equal(clock.canConfirm, false); assert.match(clock.confirmationMessage, /clock time/)
    const response = await main.send('Record a symptom note: headache for two hours', { localDate: current })
    assert.equal(response.body.draft.action, 'symptom_note'); assert.equal(response.body.draft.canConfirm, true)
  })
  await check('confirm refuses old signed unsupported journal fields/time and symptom date/time before writing', async () => {
    for (const patch of [
      { action: 'journal', journal: { journalType: 'health', title: 'Unsupported title', content: 'Exact text' } },
      { action: 'journal', journal: { journalType: 'health', tags: ['unsupported'], content: 'Exact text' } },
      { action: 'journal', journal: { journalType: 'mood', title: 'Title', content: 'Exact text' }, localTime: '08:30', tzOffsetMin: -660 },
      { action: 'symptom_note', localDate: '2026-10-14', symptom: { symptoms: ['headache'], notes: 'Exact note' } },
      { action: 'symptom_note', symptom: { symptoms: ['headache'], notes: 'Exact note' }, localTime: '08:30', tzOffsetMin: -660 },
    ]) {
      const h = save.harness(); let journalWrites = 0
      h.route.ensureHealthJournalSchema = async () => {}
      h.route.prisma.healthJournalEntry = { create: async () => { journalWrites++; return { id: 'synthetic' } } }
      const response = await h.send(save.signed(patch))
      assert.equal(response.status, 500); assert.equal(journalWrites, 0); assert.equal(h.state().symptoms.length, 0)
    }
  })
  await check('valid health note saves exactly content/date and normal mood note retains title/tags/date', async () => {
    const h = save.harness(), writes = []
    h.route.ensureHealthJournalSchema = async () => {}; h.route.ensureMoodTables = async () => {}
    h.route.prisma.healthJournalEntry = { create: async ({ data }) => { writes.push(data); return { id: 'health-note' } } }
    h.route.prisma.$queryRawUnsafe = async (...args) => { writes.push(args); return [] }
    const journal = { journalType: 'health', content: 'Exact reviewed text' }
    assert.equal((await h.send(save.signed({ action: 'journal', journal }))).status, 200)
    assert.deepEqual(plain(writes[0]), { userId: 'synthetic-user', content: journal.content, localDate: '2026-10-15' })
    const mood = { journalType: 'mood', title: 'Exact title', content: 'Exact mood text', tags: ['calm'] }
    assert.equal((await h.send(save.signed({ action: 'journal', journal: mood }))).status, 200)
    assert.equal(writes[1][3], '2026-10-15'); assert.equal(writes[1][4], mood.title); assert.equal(writes[1][5], mood.content); assert.equal(writes[1][7], '["calm"]')
  })
  await check('today symptom blank note stays blank and Australian local day is checked rather than UTC day', async () => {
    const initial = save.AuditDate.now()
    try {
      save.AuditDate.setNow(Date.parse('2026-10-16T15:00:00Z'))
      for (const note of ['', 'Exact factual note']) {
        const h = save.harness(), response = await h.send(save.signed({ action: 'symptom_note', localDate: '2026-10-17', timeZone: 'Australia/Melbourne', tzOffsetMin: -660,
          transcript: 'Command text must never fill a blank note', symptom: { symptoms: ['headache'], notes: note } }))
        assert.equal(response.status, 200); assert.equal(h.state().symptoms[0].notes, note || null)
      }
    } finally { save.AuditDate.setNow(initial) }
  })
  await check('explicit journal destination wins over the other journal mentioned inside the note', async () => {
    const text = 'Write in my mood journal that my health journal helped me sleep'
    const response = await main.send(text, { localDate: current, launchContext: { section: 'journal', title: 'Health Journal' } })
    assert.equal(response.status, 200); const draft = response.body.draft
    assert.equal(draft.canConfirm, true); assert.equal(draft.journal.journalType, 'mood'); assert.equal(draft.journal.content, 'my health journal helped me sleep')
    const h = save.harness(), writes = []
    h.route.ensureMoodTables = async () => {}; h.route.prisma.$queryRawUnsafe = async (...args) => { writes.push(args); return [] }
    const saved = await h.send(save.signed({ action: 'journal', transcript: text, journal: draft.journal }))
    assert.equal(saved.status, 200); assert.equal(saved.body.result.kind, 'journal'); assert.equal(writes[0][5], draft.journal.content)
    const health = await main.send('Write in my health journal that my mood journal helped me sleep', { localDate: current })
    assert.equal(health.body.draft.journal.journalType, 'health'); assert.equal(health.body.draft.journal.title, undefined)
  })
  console.log(`Voice journal/symptom truthfulness: ${passed} actual-source offline groups passed; no real notes or live calls.`)
}
run().catch(error => { console.error(error); process.exitCode = 1 })
