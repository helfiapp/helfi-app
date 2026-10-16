#!/usr/bin/env node
'use strict'
// Real preparation route and native spoken-reply functions, with the existing
// synthetic offline fixture only. No app imports, credentials, network or saves.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const fixture = fs.readFileSync(path.join(__dirname, 'voice-action-matrix-check.cjs'), 'utf8')
const boundary = fixture.indexOf('async function run() {')
assert(boundary > 0, 'Use only the offline fixture declarations')
const harness = new Function('require', '__dirname', fixture.slice(0, boundary).replace(/^#!.*\n/, '') + '\nreturn {send,ctx}')
const { send, ctx } = harness(require, __dirname)
const date = '2026-10-17'
const results = []
async function check(name, run) { await run(); results.push(name) }
function review(draft) {
  assert.equal(draft.canConfirm, true)
  assert.equal(draft.autoSave, false)
  assert.match(draft.confirmationMessage, /Would you like me to save that(?: for you)?\?/)
  assert.doesNotMatch(draft.confirmationMessage, /\b(?:tap|click|press|button)\b|^Checking/i)
  return draft
}
function prepared(response) {
  assert.equal(response.status, 200, JSON.stringify(response.body))
  assert.equal(response.body.confirmNow, undefined)
  assert.equal(response.body.rejectNow, undefined)
  assert.equal(response.body.draft.localDate, date)
  assert(response.body.draft.reviewToken)
  return review(response.body.draft)
}
async function run() {
  let water
  await check('plain water gives its verified amount and spoken save question', async () => {
    water = prepared(await send('Log 300 ml water'))
    assert.equal(water.water.amountMl, 300)
    assert.equal(water.food, undefined)
    assert.equal(water.confirmationMessage, 'I can log 300 ml Water. Would you like me to save that?')
  })
  let corrected
  await check('final water correction speaks450ml rather than a checking placeholder', async () => {
    const response = await send('Make that 450 millilitres instead.', { confirmationDraft: water })
    corrected = prepared(response)
    assert.equal(corrected.water.amountMl, 450)
    assert.equal(corrected.food, undefined)
    assert.equal(corrected.confirmationMessage, 'I can log 450 ml Water. Would you like me to save that?')
    assert.equal(response.body.chargedCredits, 0)
    assert.deepEqual(response.charges, [])
  })
  await check('resolved coffee keeps milk sugar and verified calorie review', async () => {
    const drink = prepared(await send('Log 250 ml coffee with 50 ml whole milk and 2 teaspoons sugar'))
    assert.equal(drink.water.amountMl, 250)
    assert.equal(drink.food.items.length, 3)
    assert.match(drink.confirmationMessage, /with 66 kcal\./)
    assert.match(drink.confirmationMessage, /Nothing has been saved yet\./)
    const unresolved = await send('Log 250 ml coffee with milk and no sugar')
    assert.equal(unresolved.body.draft.canConfirm, false)
    assert.doesNotMatch(unresolved.body.draft.confirmationMessage, /Would you like me to save that/)
  })
  await check('single and multiple food reviews preserve exact foods and estimates', async () => {
    for (const [text, count, kcal] of [['Log 100 g chicken for lunch', 1, 200], ['Log 100 g chicken and 50 g rice for lunch', 2, 265]]) {
      const food = prepared(await send(text))
      assert.equal(food.food.meal, 'lunch')
      assert.equal(food.food.items.length, count)
      assert.equal(food.food.nutrition.calories, kcal)
      assert.match(food.confirmationMessage, /chicken/)
      if (count === 2) assert.match(food.confirmationMessage, /rice/)
    }
  })
  await check('quick model-normalized and corrected journals keep exact notes', async () => {
    const note = 'I slept well'
    const quick = review(ctx.buildQuickJournalDraft({ action: 'journal', journal: { content: note, journalType: 'health' } }, 'Write in my health journal that I slept well', date))
    const normalized = review((await ctx.normalizeDraft({ action: 'journal', journal: { content: note, journalType: 'health' } }, 'Write in my health journal that I slept well', date, 'synthetic-user', null, -660, [])).draft)
    assert.equal(quick.journal.content, note)
    assert.equal(normalized.journal.content, note)
    const updated = review(ctx.buildReviewedJournalCorrection(quick, 'Change the note to I slept better', date))
    assert.equal(updated.journal.content, 'I slept better')
  })
  await check('exercise correction preserves duration and asks a spoken question', async () => {
    const exercise = prepared(await send('I ran for 30 minutes'))
    const revised = review(ctx.buildReviewedExerciseCorrection(exercise, 'Change the duration to 45 minutes', date))
    assert.equal(revised.exercise.durationMinutes, 45)
    assert.match(revised.confirmationMessage, /45 minutes/)
  })
  await check('spoken confirmation and discard still use normal reviewed decisions', async () => {
    const confirmation = await send('Yes', { confirmationDraft: corrected })
    assert.equal(confirmation.status, 200)
    assert.equal(confirmation.body.confirmNow, true)
    assert.equal(confirmation.body.draft.water.amountMl, 450)
    const discard = await send('No', { confirmationDraft: corrected })
    assert.equal(discard.status, 200)
    assert.equal(discard.body.rejectNow, true)
    assert.equal(discard.body.confirmNow, undefined)
  })
  await check('native direct spoken reply receives final server wording unchanged', () => {
    const source = fs.readFileSync(path.join(__dirname, '../native/src/voice/VoiceAssistant.tsx'), 'utf8')
    const ast = ts.createSourceFile('VoiceAssistant.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    const fn = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'spokenReplyTextForDraft')
    assert(fn)
    const code = ts.transpileModule(ts.createPrinter().printNode(ts.EmitHint.Unspecified, fn, ast), { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText
    const native = vm.createContext({})
    vm.runInContext(code, native)
    assert.equal(native.spokenReplyTextForDraft(corrected), corrected.confirmationMessage)
    assert.doesNotMatch(native.spokenReplyTextForDraft(corrected), /tap|Checking/)
  })
  console.log(JSON.stringify({ pass: true, groups: results.length, results }, null, 2))
}
run().catch(error => { console.error(error); process.exitCode = 1 })
