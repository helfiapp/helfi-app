#!/usr/bin/env node
'use strict'
// Independent actual-source state-machine checks. All handlers, users and
// storage are synthetic; no app startup, environment, provider or network.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const crypto = require('node:crypto')
const root = path.resolve(__dirname, '..')
const loaded = new Map()
function load(name) {
  if (loaded.has(name)) return loaded.get(name)
  assert(['native-assistant-registry', 'native-assistant-runtime', 'native-assistant-tool-bridge'].includes(name))
  const source = fs.readFileSync(path.join(root, 'lib', name + '.ts'), 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
  const exports = {}
  new Function('exports', 'require', code)(exports, id => {
    if (id === 'crypto') return crypto
    if (id === './native-assistant-registry') return load('native-assistant-registry')
    if (id === './native-assistant-runtime') return load('native-assistant-runtime')
    throw Error('Forbidden dependency: ' + id)
  })
  loaded.set(name, exports)
  return exports
}
const { createAssistantRegistry } = load('native-assistant-registry')
const { createAssistantRuntime } = load('native-assistant-runtime')
const { createAssistantToolBridge } = load('native-assistant-tool-bridge')
const clone = value => JSON.parse(JSON.stringify(value))
const context = () => ({ actorId: 'synthetic-owner', localDate: '2026-10-17', capabilities: [] })
const fields = { type: 'object', properties: { text: { type: 'string', maxLength: 100 } }, required: ['text'] }
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b }); return { promise, resolve, reject } }
function harness(extra = {}) {
  let stored = null, tail = Promise.resolve(), mode = 'ok', recoverMode = 'found'
  const calls = { prepare: 0, execute: 0, verify: 0, recover: 0, read: 0 }
  const receipts = new Map(), writes = [], snapshots = []
  const write = {
    id: 'journal.create', description: 'Synthetic normal journal action', input: fields, kind: 'write', normalHandler: 'synthetic-only',
    prepare: async (_ctx, values) => { calls.prepare++; return { data: clone(values), summary: values.text, sourceVersion: 'synthetic-version', cost: { kind: 'free', maximumCredits: 0 } } },
    execute: async (_ctx, prepared, receipt) => { calls.execute++; writes.push(prepared.data.text); const result = { actionId: receipt.actionId, text: prepared.data.text, owned: true }; receipts.set(receipt.actionId, result); if (mode === 'other-owned') { const other={...result,actionId:'different-valid-action'};receipts.set(other.actionId,other);return clone(other) } if (mode === 'throw-after-write') throw Error('Synthetic lost response'); if (mode === 'unbounded-after-write') return { text: 'x'.repeat(100001) }; return clone(result) },
    verify: async (_ctx, result) => { calls.verify++; return result?.owned === true && receipts.has(result.actionId) },
    recover: async (_ctx, id) => { calls.recover++; if (recoverMode === 'throw') throw Error('Synthetic read failure'); if (recoverMode === 'other-owned') { const other={actionId:'different-valid-action',text:'Different valid owned record',owned:true};receipts.set(other.actionId,other);return clone(other) } return recoverMode === 'found' ? clone(receipts.get(id) || null) : null },
  }
  const read = { id: 'journal.read', description: 'Synthetic owned read', input: { type: 'object', properties: {}, required: [] }, kind: 'read', normalHandler: 'synthetic-only', read: async () => { calls.read++; return clone(extra.readResult || { text: 'Verified actual-source-shaped value', owned: true }) }, verify: async (_ctx, value) => value?.owned === true }
  const person = { ...write, id: 'photo.choose', kind: 'person', execute: async (_ctx, prepared, receipt) => { calls.execute++; const result = { actionId: receipt.actionId, text: prepared.data.text, owned: false }; receipts.set(receipt.actionId, result); return clone(result) } }
  const store = { async runExclusive(actorId, sessionId, work) { const previous = tail; const release = deferred(); tail = release.promise; await previous; try { return await work(stored ? clone(stored) : null, async value => { assert.equal(actorId, value.actorId); assert.equal(sessionId, value.id); if (extra.beforePersist) await extra.beforePersist(value); stored = clone(value); snapshots.push(clone(value)) }) } finally { release.resolve() } } }
  const nested = { ...write, id:'journal.bundle', input:{type:'object',properties:{entries:{type:'array',minItems:1,maxItems:5,items:{type:'object',properties:{label:{type:'string',maxLength:100}},required:['label']}}},required:['entries']}, prepare:async(_ctx,values)=>{calls.prepare++;return {data:{text:values.entries.map(item=>item.label).join(' / ')},summary:'Synthetic exact bundle',cost:{kind:'free',maximumCredits:0}}} }
  const literal = { ...write, id:'journal.literal', input:{type:'object',properties:{payload:{type:'object',properties:{$from:{type:'string',maxLength:100},path:{type:'array',minItems:0,maxItems:10,items:{type:'string',maxLength:100}}},required:['$from','path']}},required:['payload']}, prepare:async(_ctx,values)=>{calls.prepare++;return {data:{text:JSON.stringify(values.payload)},summary:'Literal source data',cost:{kind:'free',maximumCredits:0}}} }
  const registry = createAssistantRegistry([write, read, person, nested, literal])
  const runtime = createAssistantRuntime({ registry, store, authorize: async () => {}, ...extra })
  const handle = (command, ctx = context()) => runtime.handle(ctx, 'synthetic-session', command)
  const plan = (steps = [{ id: 'save', operation: 'journal.create', values: { text: 'Original literal note' } }]) => handle({ type: 'plan', steps })
  return { runtime, handle, plan, calls, writes, receipts, snapshots, stored: () => clone(stored), seed: value => { stored=clone(value) }, mode: value => { mode=value }, recoverMode: value => { recoverMode=value } }
}
let groups = 0
async function check(name, run) { await run(); groups++; console.log('PASS ' + name) }
async function run() {
  await check('unsupported correction is rejected without poisoning durable reviewed state', async () => {
    const f=harness(), before=await f.plan(), reviewId=before.steps[0].reviewId
    await assert.rejects(() => f.handle({ type:'correct', stepId:'save', values:{ ownerId:'foreign' } }), error => error.code==='unknown_field')
    assert.equal(f.stored().steps[0].reviewId, reviewId)
    assert.deepEqual(f.stored().steps[0].values, { text:'Original literal note' })
    const result=await f.handle({ type:'confirm', reviewId }); assert.equal(result.steps[0].status,'completed'); assert.deepEqual(f.writes,['Original literal note'])
  })
  await check('concurrent repeated confirmation claims one normal effect exactly once', async () => {
    const f=harness(), reviewId=(await f.plan()).steps[0].reviewId
    await Promise.allSettled([f.handle({type:'confirm',reviewId}),f.handle({type:'confirm',reviewId}),f.handle({type:'confirm',reviewId})])
    assert.equal(f.calls.execute,1); assert.equal(f.writes.length,1); assert.equal(f.stored().steps[0].status,'completed')
    assert(f.snapshots.some(value=>value.steps[0].status==='executing' && value.steps[0].actionId))
  })
  await check('lost submission response requires read-only recovery and cannot resubmit', async () => {
    const f=harness(); f.mode('throw-after-write'); const reviewId=(await f.plan()).steps[0].reviewId
    const uncertain=await f.handle({type:'confirm',reviewId}), actionId=uncertain.steps[0].actionId
    assert.equal(uncertain.steps[0].status,'uncertain'); await assert.rejects(()=>f.handle({type:'confirm',reviewId}), error=>error.code==='stale_review')
    f.recoverMode('none'); assert.equal((await f.handle({type:'recover',actionId})).steps[0].status,'uncertain')
    f.recoverMode('throw'); await assert.rejects(()=>f.handle({type:'recover',actionId}))
    f.recoverMode('found'); assert.equal((await f.handle({type:'recover',actionId})).steps[0].status,'completed')
    assert.equal(f.calls.execute,1); assert.equal(f.calls.recover,3)
  })
  await check('invalid output after a real effect remains uncertain and recovers the exact receipt', async () => {
    const f=harness(); f.mode('unbounded-after-write'); const reviewId=(await f.plan()).steps[0].reviewId
    const result=await f.handle({type:'confirm',reviewId}); assert.equal(result.steps[0].status,'uncertain')
    assert.equal((await f.handle({type:'recover',actionId:result.steps[0].actionId})).steps[0].status,'completed'); assert.equal(f.calls.execute,1)
  })
  await check('stop preserves submitted receipt and cancels later steps during read-only recovery', async () => {
    const f=harness(); f.mode('throw-after-write'); const reviewId=(await f.plan([{id:'save',operation:'journal.create',values:{text:'First'}},{id:'later',operation:'journal.create',values:{text:'Second'}}])).steps[0].reviewId
    const actionId=(await f.handle({type:'confirm',reviewId})).steps[0].actionId
    const stopped=await f.handle({type:'stop'}); assert.equal(stopped.steps[0].status,'uncertain'); assert.equal(stopped.steps[1].status,'cancelled')
    const recovered=await f.handle({type:'recover',actionId}); assert.equal(recovered.steps[0].status,'completed'); assert.equal(recovered.status,'stopped'); assert.deepEqual(f.writes,['First'])
    await assert.rejects(()=>f.handle({type:'advance'}),error=>error.code==='stopped')
  })
  await check('stopping an expired unsubmitted proposal allows a new request with a fresh review and no stale confirmation', async () => {
    let tick=Date.UTC(2026,9,17)
    const f=harness({now:()=>tick}),old=(await f.plan()).steps[0].reviewId
    tick+=31*60*1000
    const stopped=await f.handle({type:'stop'});assert.equal(stopped.status,'stopped');assert.equal(stopped.steps[0].status,'cancelled');assert.equal(stopped.steps[0].prepared,undefined)
    const fresh=await f.plan([{id:'save',operation:'journal.create',values:{text:'Fresh exact note'}}])
    assert.equal(fresh.status,'active');assert.equal(fresh.steps.length,1);assert.equal(fresh.steps[0].status,'review');assert.notEqual(fresh.steps[0].reviewId,old);assert.equal(f.calls.execute,0)
    await assert.rejects(()=>f.handle({type:'confirm',reviewId:old}),error=>error.code==='stale_review')
    await f.handle({type:'confirm',reviewId:fresh.steps[0].reviewId});assert.deepEqual(f.writes,['Fresh exact note'])
  })
  await check('stopped cancelled proposals cannot become references while completed receipt identity is retained', async () => {
    const f=harness(),first=(await f.plan([{id:'first',operation:'journal.create',values:{text:'Earlier exact note'}},{id:'discarded',operation:'journal.create',values:{text:'Never submitted'}}])).steps[0].reviewId
    await f.handle({type:'confirm',reviewId:first});await f.handle({type:'advance'});await f.handle({type:'stop'})
    const before=f.stored(),receipt=before.steps[0].actionId
    await assert.rejects(()=>f.plan([{id:'invalid',operation:'journal.create',values:{text:{$from:'discarded',path:['text']}}}]),error=>error.code==='invalid_reference')
    assert.deepEqual(f.stored(),before)
    const next=await f.plan([{id:'next',operation:'journal.create',values:{text:{$from:'first',path:['text']}}}])
    assert.deepEqual(next.steps.map(step=>step.id),['first','next']);assert.equal(next.steps[0].actionId,receipt);assert.equal(next.steps[0].reviewId,first);assert.equal(next.steps[0].prepared,undefined);assert.equal(next.steps[1].prepared.data.text,'Earlier exact note');assert.equal(f.calls.execute,1)
    await f.handle({type:'confirm',reviewId:first});assert.equal(f.calls.execute,1);assert.equal(f.stored().steps[1].status,'review')
  })
  await check('stopped uncertain saves prohibit replacement until exact read-only recovery then discard cancelled leftovers', async () => {
    const f=harness();f.mode('throw-after-write')
    const review=(await f.plan([{id:'first',operation:'journal.create',values:{text:'Committed once'}},{id:'later',operation:'journal.create',values:{text:'Cancelled later'}}])).steps[0].reviewId
    const actionId=(await f.handle({type:'confirm',reviewId:review})).steps[0].actionId
    await f.handle({type:'stop'});const stopped=f.stored()
    await assert.rejects(()=>f.plan([{id:'new',operation:'journal.read',values:{}}]),error=>error.code==='existing_plan');assert.deepEqual(f.stored(),stopped);assert.equal(f.calls.read,0);assert.equal(f.calls.execute,1)
    f.recoverMode('none');await f.handle({type:'recover',actionId});await assert.rejects(()=>f.plan([{id:'new',operation:'journal.read',values:{}}]),error=>error.code==='existing_plan')
    f.recoverMode('other-owned');await f.handle({type:'recover',actionId});await assert.rejects(()=>f.plan([{id:'new',operation:'journal.read',values:{}}]),error=>error.code==='existing_plan')
    f.recoverMode('found');const recovered=await f.handle({type:'recover',actionId});assert.equal(recovered.status,'stopped');assert.equal(recovered.steps[0].status,'completed');assert.equal(recovered.steps[1].status,'cancelled')
    const next=await f.plan([{id:'new',operation:'journal.read',values:{}}]);assert.equal(next.status,'completed');assert.deepEqual(next.steps.map(step=>step.id),['first','new']);assert.equal(next.steps[0].actionId,actionId);assert.equal(next.steps[0].reviewId,review);assert.equal(f.calls.execute,1);assert.deepEqual(f.writes,['Committed once']);assert.equal(f.calls.recover,3);assert.equal(f.calls.read,1)
  })
  await check('stopped executing claims and awaiting-person results cannot be replaced by another plan', async () => {
    const executing=harness();executing.mode('throw-after-write');const old=(await executing.plan()).steps[0].reviewId
    await executing.handle({type:'confirm',reviewId:old})
    const durableClaim=executing.snapshots.find(session=>session.steps[0].status==='executing');assert(durableClaim?.steps[0].actionId)
    // Restore the exact claim generation that survives a process loss before
    // the response state persists, then run the real stop/new-plan handlers.
    executing.seed(durableClaim);await executing.handle({type:'stop'});assert.equal(executing.stored().steps[0].status,'executing')
    await assert.rejects(()=>executing.plan([{id:'new',operation:'journal.read',values:{}}]),error=>error.code==='existing_plan');assert.equal(executing.calls.execute,1)
    const f=harness(),review=(await f.plan([{id:'submitted',operation:'photo.choose',values:{text:'Exact selected action'}}])).steps[0].reviewId
    await f.handle({type:'confirm',reviewId:review});await f.handle({type:'stop'});const before=f.stored();assert.equal(before.steps[0].status,'awaiting_person')
    await assert.rejects(()=>f.plan([{id:'new',operation:'journal.read',values:{}}]),error=>error.code==='existing_plan');assert.deepEqual(f.stored(),before);assert.equal(f.calls.execute,1)
  })
  await check('picker opening stays awaiting a person until verified selected result exists', async () => {
    const f=harness(); const reviewId=(await f.plan([{id:'choose',operation:'photo.choose',values:{text:'Pick a photo'}}])).steps[0].reviewId
    const awaiting=await f.handle({type:'confirm',reviewId}), actionId=awaiting.steps[0].actionId
    assert.equal(awaiting.steps[0].status,'awaiting_person'); assert.equal((await f.handle({type:'recover',actionId})).steps[0].status,'awaiting_person')
    f.receipts.set(actionId,{actionId,owned:true,text:'Selected synthetic file hash'}); const recovered=await f.handle({type:'recover',actionId}); assert.equal(recovered.steps[0].status,'completed'); assert.equal(f.calls.execute,1)
  })
  await check('ownership and revoked execution consent refuse before normal mutation', async () => {
    let deny=false; const f=harness({authorize:async(_ctx,_op,phase)=>{if(deny && phase==='execute')throw Error('Denied')}}), reviewId=(await f.plan()).steps[0].reviewId
    await assert.rejects(()=>f.handle({type:'confirm',reviewId},{...context(),actorId:'foreign'}),error=>error.code==='unauthorized')
    deny=true; await assert.rejects(()=>f.handle({type:'confirm',reviewId})); assert.equal(f.calls.execute,0); assert.equal(f.stored().steps[0].status,'review')
  })
  await check('cancellation during asynchronous execution authorization prevents submission', async () => {
    const gate=deferred(), entered=deferred(), controller=new AbortController(), f=harness({authorize:async(_ctx,_op,phase)=>{if(phase==='execute'){entered.resolve();await gate.promise}}}), reviewId=(await f.plan()).steps[0].reviewId
    const submission=f.handle({type:'confirm',reviewId},{...context(),signal:controller.signal}); await entered.promise; controller.abort(); gate.resolve()
    await assert.rejects(()=>submission,error=>error.code==='stopped'); assert.equal(f.calls.execute,0); assert.equal(f.stored().steps[0].status,'review')
  })
  await check('cancellation during asynchronous read authorization prevents reading', async () => {
    const gate=deferred(), entered=deferred(), controller=new AbortController(), f=harness({authorize:async(_ctx,_op,phase)=>{if(phase==='read'){entered.resolve();await gate.promise}}})
    const request=f.handle({type:'plan',steps:[{id:'read',operation:'journal.read',values:{}}]},{...context(),signal:controller.signal}); await entered.promise; controller.abort(); gate.resolve()
    await assert.rejects(()=>request,error=>error.code==='stopped'); assert.equal(f.calls.read,0)
  })
  await check('cancellation during asynchronous prepare authorization prevents preparation', async () => {
    const gate=deferred(), entered=deferred(), controller=new AbortController(), f=harness({authorize:async(_ctx,_op,phase)=>{if(phase==='prepare'){entered.resolve();await gate.promise}}})
    const request=f.handle({type:'plan',steps:[{id:'save',operation:'journal.create',values:{text:'Original'}}]},{...context(),signal:controller.signal}); await entered.promise; controller.abort(); gate.resolve()
    await assert.rejects(()=>request,error=>error.code==='stopped'); assert.equal(f.calls.prepare,0)
  })
  await check('cancellation while the durable executing claim persists prevents a normal write', async () => {
    const gate=deferred(), entered=deferred(), controller=new AbortController(), f=harness({beforePersist:async value=>{if(value.steps[0]?.status==='executing'){entered.resolve();await gate.promise}}}), reviewId=(await f.plan()).steps[0].reviewId
    const request=f.handle({type:'confirm',reviewId},{...context(),signal:controller.signal}); await entered.promise; controller.abort(); gate.resolve()
    const result=await request; assert.equal(result.status,'stopped'); assert.equal(result.steps[0].status,'cancelled'); assert.equal(f.calls.execute,0)
    assert.equal(result.steps[0].actionId,undefined); assert.equal(result.steps[0].prepared,undefined)
  })
  await check('cancellation during asynchronous recovery authorization prevents receipt lookup', async () => {
    const gate=deferred(), entered=deferred(), controller=new AbortController(), f=harness({authorize:async(_ctx,_op,phase)=>{if(phase==='recover'){entered.resolve();await gate.promise}}})
    f.mode('throw-after-write'); const reviewId=(await f.plan()).steps[0].reviewId, actionId=(await f.handle({type:'confirm',reviewId})).steps[0].actionId
    const request=f.handle({type:'recover',actionId},{...context(),signal:controller.signal}); await entered.promise; controller.abort(); gate.resolve()
    await assert.rejects(()=>request,error=>error.code==='stopped'); assert.equal(f.calls.recover,0)
  })
  await check('huge boolean keys and many numeric fields refuse before persistence', async () => {
    const f=harness()
    await assert.rejects(()=>f.handle({type:'advance',['x'.repeat(100001)]:false}),error=>error.code==='invalid_input')
    const many=Array.from({length:30},()=>Array(1000).fill(1))
    await assert.rejects(()=>f.handle({type:'advance',many}),error=>error.code==='invalid_input')
    assert.equal(f.snapshots.length,0)
  })
  await check('result references use completed prior reads and preserve literal corrected content', async () => {
    const f=harness(), review=(await f.plan([{id:'read',operation:'journal.read',values:{}},{id:'save',operation:'journal.create',values:{text:{$from:'read',path:['text']}}}])).steps[1]
    assert.equal(review.prepared.data.text,'Verified actual-source-shaped value')
    const corrected=await f.handle({type:'correct',stepId:'save',values:{text:'Literal correction: no paraphrase.'}})
    await assert.rejects(()=>f.handle({type:'confirm',reviewId:review.reviewId}),error=>error.code==='stale_review')
    await f.handle({type:'confirm',reviewId:corrected.steps[1].reviewId}); assert.deepEqual(f.writes,['Literal correction: no paraphrase.'])
  })
  await check('a wrong recovery action identifier cannot inspect another receipt', async () => {
    const f=harness();f.mode('throw-after-write');const reviewId=(await f.plan()).steps[0].reviewId
    await f.handle({type:'confirm',reviewId});await assert.rejects(()=>f.handle({type:'recover',actionId:'foreign-action'}),error=>error.code==='no_submitted_action');assert.equal(f.calls.recover,0)
  })
  await check('replayed completed recovery preserves the next pending or reviewed step without more preparation or receipt reads', async () => {
    const f=harness();f.mode('throw-after-write')
    const first=(await f.plan([{id:'first',operation:'journal.create',values:{text:'First exact note'}},{id:'later',operation:'journal.create',values:{text:'Next exact review'}}])).steps[0].reviewId
    const actionId=(await f.handle({type:'confirm',reviewId:first})).steps[0].actionId
    await f.handle({type:'recover',actionId});const before=f.stored(),counts=clone(f.calls)
    assert.equal(before.steps[1].status,'pending');assert.deepEqual(await f.handle({type:'recover',actionId}),before);assert.deepEqual(f.calls,counts)
    await assert.rejects(()=>f.handle({type:'recover',actionId,extra:'forbidden'}),error=>error.code==='unknown_field');assert.deepEqual(f.stored(),before)
    const next=await f.handle({type:'advance'}),review=next.steps[1].reviewId,reviewCounts=clone(f.calls)
    assert.equal(next.steps[1].status,'review');const replay=await f.handle({type:'recover',actionId});assert.equal(replay.steps[1].reviewId,review);assert.deepEqual(f.calls,reviewCounts);assert.equal(f.calls.execute,1);assert.equal(f.calls.recover,1)
  })
  await check('a different valid owned receipt never proves current execution or recovery', async () => {
    const f=harness();f.mode('other-owned');const reviewId=(await f.plan()).steps[0].reviewId
    const result=await f.handle({type:'confirm',reviewId});assert.equal(result.steps[0].status,'uncertain')
    f.recoverMode('other-owned');assert.equal((await f.handle({type:'recover',actionId:result.steps[0].actionId})).steps[0].status,'uncertain')
    f.recoverMode('found');assert.equal((await f.handle({type:'recover',actionId:result.steps[0].actionId})).steps[0].status,'completed');assert.equal(f.calls.execute,1)
  })
  await check('nested array references use exact earlier saved result and reject forward references', async () => {
    const f=harness(), prepared=await f.plan([{id:'read',operation:'journal.read',values:{}},{id:'bundle',operation:'journal.bundle',values:{entries:[{label:{$from:'read',path:['text']}}]}}])
    assert.equal(prepared.steps[1].prepared.data.text,'Verified actual-source-shaped value')
    await f.handle({type:'confirm',reviewId:prepared.steps[1].reviewId});assert.deepEqual(f.writes,['Verified actual-source-shaped value'])
    const invalid=harness();await assert.rejects(()=>invalid.plan([{id:'bundle',operation:'journal.bundle',values:{entries:[{label:{$from:'future',path:['text']}}]}},{id:'future',operation:'journal.read',values:{}}]),error=>error.code==='invalid_reference');assert.equal(invalid.snapshots.length,0)
  })
  await check('reference-shaped saved data remains literal and never becomes another executable reference', async () => {
    const data={$from:'unavailable-action',path:['private-field']},f=harness({readResult:{owned:true,payload:data}})
    const result=await f.plan([{id:'read',operation:'journal.read',values:{}},{id:'save',operation:'journal.literal',values:{payload:{$from:'read',path:['payload']}}}])
    assert.equal(result.steps[1].prepared.data.text,JSON.stringify(data));assert.equal(f.calls.execute,0)
  })
  await check('expired review advances to a new review and never reuses earlier confirmation', async () => {
    let tick=Date.UTC(2026,9,17), f=harness({now:()=>tick}), original=(await f.plan()).steps[0]
    tick+=31*60*1000;await assert.rejects(()=>f.handle({type:'confirm',reviewId:original.reviewId}),error=>error.code==='stale_review')
    const fresh=(await f.handle({type:'advance'})).steps[0];assert.notEqual(fresh.reviewId,original.reviewId);assert.equal(fresh.status,'review');assert.equal(f.calls.prepare,2)
    await assert.rejects(()=>f.handle({type:'confirm',reviewId:original.reviewId}),error=>error.code==='stale_review');assert.equal(f.calls.execute,0)
  })
  await check('a correction arriving after completion cannot claim the correction succeeded', async () => {
    const f=harness(),reviewId=(await f.plan()).steps[0].reviewId;await f.handle({type:'confirm',reviewId})
    await assert.rejects(()=>f.handle({type:'correct',stepId:'save',values:{text:'Late correction that was not saved'}}),error=>error.code==='cannot_correct');assert.deepEqual(f.writes,['Original literal note'])
  })
  await check('revocation while conversation append awaits never sends private context to planner', async () => {
    let allowed=true,plannerCalls=0;const f=harness(),turns=[]
    const bridge=createAssistantToolBridge({runtime:f.runtime,plannerKind:'synthetic',authorizeCommand:async()=>{},authorizePlanning:async()=>{if(!allowed)throw Error('Synthetic revoked consent')},readSession:async()=>f.stored(),conversation:{read:async()=>clone(turns),append:async(actorId,sessionId,turn)=>{turns.push({actorId,sessionId,...turn});allowed=false}},planner:async()=>{plannerCalls++;return {question:'Synthetic question'}}})
    await assert.rejects(()=>bridge.turn(context(),'synthetic-session',{channel:'typed',text:'Use my private saved notes'}));assert.equal(plannerCalls,0)
  })
  await check('abort during conversation append prevents planner invocation and reply storage', async () => {
    const controller=new AbortController(),f=harness(),turns=[];let plannerCalls=0
    const bridge=createAssistantToolBridge({runtime:f.runtime,plannerKind:'synthetic',authorizeCommand:async()=>{},authorizePlanning:async()=>{},readSession:async()=>f.stored(),conversation:{read:async()=>clone(turns),append:async(actorId,sessionId,turn)=>{turns.push({actorId,sessionId,...turn});controller.abort()}},planner:async()=>{plannerCalls++;return {question:'Synthetic question'}}})
    await assert.rejects(()=>bridge.turn({...context(),signal:controller.signal},'synthetic-session',{channel:'typed',text:'Synthetic input'}));assert.equal(plannerCalls,0);assert.equal(turns.length,1)
  })
  await check('completed context rolls past twenty actions without replaying earlier normal effects', async () => {
    const f=harness()
    for(let i=0;i<45;i++) {
      const review=await f.plan([{id:'save_'+i,operation:'journal.create',values:{text:'Literal note '+i}}])
      const current=review.steps.at(-1);assert.equal(current.status,'review');assert(review.steps.length<=20)
      const completed=await f.handle({type:'confirm',reviewId:current.reviewId});assert.equal(completed.status,'completed');assert(completed.steps.length<=20)
    }
    assert.equal(f.calls.execute,45);assert.deepEqual(f.writes,Array.from({length:45},(_,i)=>'Literal note '+i))
    assert.equal(f.stored().steps.length,20);assert.equal(f.stored().steps[0].id,'save_25')
    assert(f.stored().steps.every(step=>step.prepared===undefined || step.id==='save_44'))
  })
  await check('rolling context retains explicitly referenced oldest exact result and rejects impossible retention atomically', async () => {
    const f=harness(),steps=Array.from({length:20},(_,i)=>({id:'read_'+i,operation:'journal.read',values:{}}))
    await f.plan(steps)
    const next=await f.plan([{id:'use_oldest',operation:'journal.create',values:{text:{$from:'read_0',path:['text']}}}])
    assert.equal(next.steps.length,20);assert.equal(next.steps[0].id,'read_0');assert(!next.steps.some(step=>step.id==='read_1'))
    assert.equal(next.steps.at(-1).prepared.data.text,'Verified actual-source-shaped value')
    await f.handle({type:'confirm',reviewId:next.steps.at(-1).reviewId})
    const before=f.stored(),allRefs=before.steps.map(step=>({$from:step.id,path:[]}))
    await assert.rejects(()=>f.plan([{id:'impossible',operation:'journal.bundle',values:{entries:allRefs}}]),error=>error.code==='invalid_plan')
    assert.deepEqual(f.stored(),before);assert.equal(f.calls.execute,1)
  })
  console.log(`VOICE 2 adversarial runtime: ${groups} groups passed. No providers, network, credentials or real storage.`)
}
run().catch(error=>{console.error(error);process.exitCode=1})
