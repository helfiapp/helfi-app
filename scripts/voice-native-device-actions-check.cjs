#!/usr/bin/env node
'use strict'
// Real shared validator/client adapter/server authorization and normal Health
// sync under synthetic storage/auth/Health IO only. No network, OS permission,
// account data, environment files, device reads, database or provider calls.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript')
const root=path.resolve(__dirname,'..')
function load(file,imports={}){
  const module={exports:{}}
  const context={module,exports:module.exports,Request,Response,Headers,URL,Intl,Date,Map,Set,WeakMap,WeakSet,Buffer,setTimeout,clearTimeout,process:{env:{NEXTAUTH_SECRET:'synthetic-device-review-secret'}},require:name=>{if(Object.hasOwn(imports,name))return imports[name];if(name==='crypto')return require('node:crypto');throw Error(`Unexpected dependency: ${name}`)}}
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText,context,{filename:file})
  return module.exports
}
const sources=load('native/src/health/appleHealthSources.ts')
const clientImports={'../health/appleHealthSources':sources,'@aws-crypto/sha256-js/build/main/RawSha256':require('@aws-crypto/sha256-js/build/main/RawSha256')}
const client=load('native/src/voice/nativeDeviceActions.ts',clientImports)
const healthSync=load('native/src/health/appleHealthSync.ts',{'./appleHealthSources':sources})
const tokens=load('lib/native-voice-review-token.ts')
let signedIn='owner'
const server=load('lib/native-voice-device-actions.ts',{'@/native/src/voice/nativeDeviceActions':client,'@/lib/native-voice-review-token':tokens,'@/lib/weekly-report-request-auth':{getWeeklyReportRequestUser:async()=>signedIn?{id:signedIn}:null}})
const plain=value=>JSON.parse(JSON.stringify(value)),day='2026-10-17',watch={sourceId:'com.sample.watch',sourceName:'Watch Export'}
const action=(name,values)=>({action:name,values})
const request=()=>new Request('https://helfi.invalid/api/native/voice-assistant',{headers:{authorization:'Bearer synthetic'}})
let tokenSequence=0
function fixture(){
  const f={owner:'owner',current:true,now:Date.parse(`${day}T03:00:00Z`),store:new Map(),writes:[],calls:[],editor:{mounted:false,dirty:false},state:{enabled:false,source:null,busy:false},available:[watch],supported:true,afterGet:null,beforeSet:null,afterSet:null,beforeDiscover:null,healthSet:null,readbackBad:false,syncEvents:[]}
  const sync=healthSync.createAppleHealthSync({read:async(date,source)=>{f.calls.push(['read',date,source]);return {localDate:date,selectedSource:source,activeEnergyKcal:123.5,steps:2000,distanceKm:1.2}},importSummary:async(summary,token)=>{assert.equal(token,'synthetic');f.calls.push(['import',summary])}})
  f.io={getItem:async key=>{const value=f.store.get(key)??null;f.afterGet?.(key);return f.readbackBad&&f.writes.length?'corrupt':value},setItem:async(key,value)=>{await f.beforeSet?.(key,value);f.writes.push([key,value]);f.store.set(key,value);await f.afterSet?.(key,value)},now:()=>f.now,timeZone:()=> 'Australia/Melbourne',accountId:()=>f.owner,isCurrent:()=>f.current,sleepEditor:()=>f.editor,
    health:{supported:()=>f.supported,snapshot:()=>f.state,setEnabled:async value=>{f.calls.push(['enabled',value]);if(f.healthSet)return f.healthSet('enabled',value);f.state.enabled=value},setSource:async value=>{f.calls.push(['source',value]);if(f.healthSet)return f.healthSet('source',value);f.state.source=value},readSources:async()=>{f.calls.push(['sources']);await f.beforeDiscover?.();return f.available},refresh:async(manual,date)=>{f.calls.push(['refresh',manual,date]);return sync({userId:f.owner,token:'synthetic',localDate:date,source:f.state.source,manual,allowed:()=>f.current&&f.owner==='owner'})}}}
  f.capture=(value,token=`review-${++tokenSequence}`)=>client.captureNativeDeviceReview(token,'owner',value,f.io)
  f.apply=(review,value=review.action,token=review.token)=>client.applyReviewedNativeDeviceAction(review,token,'owner',value,f.io)
  return f
}
let count=0
async function check(name,run){signedIn='owner';await run();count++;console.log(`PASS ${name}`)}
async function main(){
  await check('fixed schemas reject arbitrary actions, fields, OS grants, source IDs, timezone and malformed values',async()=>{
    assert.equal(Object.keys(client.NATIVE_DEVICE_ACTION_SCHEMAS).length,5)
    for(const value of [action('apple_health.connect',{}),action('apple_health.import',{}),action('apple_health.import',{localDate:'2026-02-30'}),action('apple_health.source.select',{sourceId:watch.sourceId}),action('apple_health.automatic.update',{enabled:'true'}),action('sleep.settings.update',{timezone:'UTC'}),action('sleep.settings.update',{startTime:'24:01'}),action('sleep.routine.update',{hydrate:1}),{...action('sleep.settings.update',{enabled:true}),url:'/delete'}])assert.throws(()=>client.validateNativeDeviceAction(value))
  })
  await check('sleep defaults and exact storage keys match current manual screen',async()=>{
    const source=fs.readFileSync(path.join(root,'native/src/screens/SleepCoachScreen.tsx'),'utf8')
    assert.equal(client.SLEEP_DEVICE_SETTINGS_KEY,'helfi_sleep_listening_settings_v1');assert.equal(client.SLEEP_DEVICE_ROUTINE_KEY,'helfi_sleep_routine_v1')
    for(const key of [client.SLEEP_DEVICE_SETTINGS_KEY,client.SLEEP_DEVICE_ROUTINE_KEY])assert(source.includes(`'${key}'`))
    assert.match(source,/blueLight:\s*true/);assert.match(source,/startTime:\s*'22:30'/);assert.match(source,/endTime:\s*'07:00'/)
    const state=await client.readSleepDeviceSnapshot(fixture().io)
    assert.deepEqual(plain(state.settings),{enabled:false,startTime:'22:30',endTime:'07:00',timezone:'Australia/Melbourne'})
    assert.deepEqual(plain(state.routine),{blueLight:true,roomTemp:false,hydrate:false})
  })
  await check('sleep partial write preserves schedule timezone and checklist; receipts do not claim microphone start',async()=>{
    const f=fixture(),initial={enabled:false,startTime:'21:45',endTime:'06:30',timezone:'Pacific/Auckland'}
    f.store.set(client.SLEEP_DEVICE_SETTINGS_KEY,JSON.stringify(initial))
    const input=action('sleep.settings.update',{enabled:true}),review=await f.capture(input)
    const result=await f.apply(review)
    assert.deepEqual(JSON.parse(f.store.get(client.SLEEP_DEVICE_SETTINGS_KEY)),{...initial,enabled:true});assert.equal(f.writes.length,1)
    assert.equal(result.verified,true);assert.match(result.message,/does not confirm.*listening started/)
    assert.equal((await f.apply(review)).idempotentReplay,true);assert.equal(f.writes.length,1)
    f.store.set(client.SLEEP_DEVICE_SETTINGS_KEY,JSON.stringify(initial));await assert.rejects(f.apply(review),/changed after confirmation/)
  })
  await check('routine merge preserves unrelated manual values and malformed existing data is never wiped',async()=>{
    const f=fixture();f.store.set(client.SLEEP_DEVICE_ROUTINE_KEY,JSON.stringify({blueLight:false,roomTemp:true,hydrate:false}))
    await f.apply(await f.capture(action('sleep.routine.update',{hydrate:true})))
    assert.deepEqual(JSON.parse(f.store.get(client.SLEEP_DEVICE_ROUTINE_KEY)),{blueLight:false,roomTemp:true,hydrate:true})
    const bad=fixture();bad.store.set(client.SLEEP_DEVICE_SETTINGS_KEY,'broken');await assert.rejects(bad.capture(action('sleep.settings.update',{enabled:true})));assert.equal(bad.writes.length,0)
  })
  await check('active manual edits, unsynchronized mounted editor and edits appearing during reads reject before writing',async()=>{
    for(const editor of [{mounted:true,dirty:true},{mounted:true,dirty:false}]){const f=fixture(),review=await f.capture(action('sleep.settings.update',{enabled:true}));f.editor=editor;await assert.rejects(f.apply(review),/manual edit/);assert.equal(f.writes.length,0)}
    const f=fixture(),review=await f.capture(action('sleep.settings.update',{enabled:true}));f.afterGet=()=>{f.editor={mounted:true,dirty:true}};await assert.rejects(f.apply(review),/manual edit/);assert.equal(f.writes.length,0)
    const mounted=fixture();mounted.editor={mounted:true,dirty:false};mounted.io.onSleepWrite=(state,origin)=>{mounted.syncEvents.push({state,origin})}
    await mounted.apply(await mounted.capture(action('sleep.routine.update',{hydrate:true})));assert.equal(mounted.syncEvents.length,1);assert.equal(mounted.syncEvents[0].origin,'voice')
  })
  await check('shared manual and voice writers serialize both keys and require a new snapshot after other edits',async()=>{
    const f=fixture(),before=await client.readSleepDeviceSnapshot(f.io)
    const a=client.writeSleepDeviceState(f.io,'owner',action('sleep.settings.update',{startTime:'23:00'}),before,'manual')
    const b=client.writeSleepDeviceState(f.io,'owner',action('sleep.routine.update',{hydrate:true}),before,'voice')
    const result=await Promise.allSettled([a,b]);assert.equal(result[0].status,'fulfilled');assert.equal(result[1].status,'rejected');assert.equal(f.writes.length,1)
    const next=await client.readSleepDeviceSnapshot(f.io);await client.writeSleepDeviceState(f.io,'owner',action('sleep.routine.update',{hydrate:true}),next,'voice');assert.equal(f.writes.length,2)
  })
  await check('phone/account/token/expiry/review tampering prevent writes and late cancellation cannot return success',async()=>{
    for(const alter of [f=>f.owner='other',f=>f.current=false,f=>f.now+=11*60*1000]){const f=fixture(),review=await f.capture(action('sleep.settings.update',{enabled:true}));alter(f);await assert.rejects(f.apply(review));assert.equal(f.writes.length,0)}
    const f=fixture(),review=await f.capture(action('sleep.settings.update',{enabled:true}));await assert.rejects(f.apply(review,review.action,'other'));review.action.values.enabled=false;await assert.rejects(f.apply(review));assert.equal(f.writes.length,0)
    const late=fixture(),lateReview=await late.capture(action('sleep.settings.update',{enabled:true}));late.afterSet=()=>{late.current=false};await assert.rejects(late.apply(lateReview));assert.equal(late.writes.length,1)
  })
  await check('failed write readback or editor synchronization never produces a successful receipt',async()=>{
    for(const mode of ['throw','readback','callback']){const f=fixture(),review=await f.capture(action('sleep.settings.update',{enabled:true}));if(mode==='throw')f.beforeSet=()=>{throw Error('synthetic write failure')};if(mode==='readback')f.readbackBad=true;if(mode==='callback')f.io.onSleepWrite=()=>{throw Error('synthetic editor failure')};await assert.rejects(f.apply(review))}
    const staleEditor=fixture(),review=await staleEditor.capture(action('sleep.settings.update',{enabled:true}));staleEditor.io.onSleepWrite=()=>{staleEditor.store.delete(client.SLEEP_DEVICE_SETTINGS_KEY)};await assert.rejects(staleEditor.apply(review),/while synchronizing/)
  })
  await check('actual normal Health sync imports only real positive active energy with exact date/source and deduplicates confirmations',async()=>{
    const f=fixture();f.state.source=watch
    const review=await f.capture(action('apple_health.import',{localDate:day}))
    const result=await Promise.all([f.apply(review),f.apply(review)])
    assert.equal(result[0].status,'imported');assert.equal(result[0].verified,true);assert.equal(result[0].localDate,day)
    assert.equal(f.calls.filter(call=>call[0]==='import').length,1);assert.equal(f.calls.find(call=>call[0]==='import')[1].activeEnergyKcal,123.5)
    assert.equal((await f.apply(review)).idempotentReplay,true);assert.equal(f.calls.filter(call=>call[0]==='refresh').length,1)
    f.state.source=null;await assert.rejects(f.apply(review),/changed after confirmation/)
  })
  await check('missing denied zero or mismatched data never becomes verified import or permission claim',async()=>{
    for(const value of [null,0,NaN,undefined]){const f=fixture();let imports=0;const sync=healthSync.createAppleHealthSync({read:async date=>({localDate:date,selectedSource:null,activeEnergyKcal:value,steps:3000}),importSummary:async()=>{imports++}});f.io.health.refresh=(manual,date)=>sync({userId:'owner',token:'synthetic',manual,localDate:date,allowed:()=>true});const result=await f.apply(await f.capture(action('apple_health.import',{localDate:day})));assert.equal(result.verified,false);assert.equal(result.status,'no_data');assert.equal(imports,0);assert.match(result.message,/no available.*permission/)}
    for(const patch of [{localDate:'2026-10-16'},{selectedSource:watch},{activeEnergyKcal:0}]){const f=fixture();f.io.health.refresh=async()=>({imported:true,summary:{localDate:day,selectedSource:null,activeEnergyKcal:100,...patch}});await assert.rejects(f.apply(await f.capture(action('apple_health.import',{localDate:day}))))}
    const future=fixture();await assert.rejects(future.capture(action('apple_health.import',{localDate:'2026-10-18'})));assert.equal(future.calls.length,0)
  })
  await check('source names require one real discovered source, retain exact ID and totals remains null',async()=>{
    const f=fixture(),input=action('apple_health.source.select',{sourceName:'watch export'}),review=await f.capture(input);assert.equal(review.source.sourceId,watch.sourceId)
    await f.apply(review);assert.deepEqual(plain(f.state.source),watch);assert.equal(f.calls.filter(call=>call[0]==='refresh').length,0)
    await f.apply(await f.capture(action('apple_health.source.select',{sourceName:null})));assert.equal(f.state.source,null)
    for(const available of [[],[watch,{sourceId:'com.other.watch',sourceName:watch.sourceName}]]){const x=fixture();x.available=available;await assert.rejects(x.capture(input));assert(!x.calls.some(call=>call[0]==='source'))}
    const missing=fixture(),r=await missing.capture(input);missing.available=[];await assert.rejects(missing.apply(r),/no longer available/)
  })
  await check('Health unsupported busy stale and discovery races cannot change settings; setter readback is required',async()=>{
    for(const setup of [f=>f.supported=false,f=>f.state.busy=true]){const f=fixture();setup(f);await assert.rejects(f.capture(action('apple_health.automatic.update',{enabled:true})));assert.equal(f.calls.length,0)}
    const stale=fixture(),review=await stale.capture(action('apple_health.automatic.update',{enabled:true}));stale.state.source=watch;await assert.rejects(stale.apply(review));assert.equal(stale.calls.length,0)
    const race=fixture(),r=await race.capture(action('apple_health.source.select',{sourceName:watch.sourceName}));race.beforeDiscover=()=>{race.state.enabled=true};await assert.rejects(race.apply(r),/changed/);assert(!race.calls.some(call=>call[0]==='source'))
    const failed=fixture();failed.healthSet=async()=>{};await assert.rejects(failed.apply(await failed.capture(action('apple_health.automatic.update',{enabled:true}))),/did not confirm/)
    const ok=fixture();assert.equal((await ok.apply(await ok.capture(action('apple_health.automatic.update',{enabled:true})))).verified,true);assert.equal(ok.state.enabled,true)
  })
  await check('different reviewed Health actions serialize so the second cannot overwrite a newly changed setting',async()=>{
    const f=fixture(),auto=await f.capture(action('apple_health.automatic.update',{enabled:true})),source=await f.capture(action('apple_health.source.select',{sourceName:watch.sourceName}))
    const result=await Promise.allSettled([f.apply(auto),f.apply(source)])
    assert.equal(result[0].status,'fulfilled');assert.equal(result[1].status,'rejected');assert.equal(f.state.enabled,true);assert.equal(f.state.source,null);assert(!f.calls.some(call=>call[0]==='source'))
  })
  await check('same signed token across new review objects deduplicates import and keeps account isolation',async()=>{
    const f=fixture(),input=action('apple_health.import',{localDate:day}),token=`shared-${++tokenSequence}`
    const a=await f.capture(input,token),b=await f.capture(input,token)
    await Promise.all([f.apply(a),f.apply(b)]);assert.equal(f.calls.filter(call=>call[0]==='refresh').length,1)
    const c=await f.capture(input,token);assert.equal((await f.apply(c)).idempotentReplay,true)
    f.state.enabled=true;const stale=await f.capture(input,token);await assert.rejects(f.apply(stale),/changed after confirmation/)
    const other=fixture();other.owner='other';other.io.health.refresh=async()=>({imported:false})
    const otherReview=await client.captureNativeDeviceReview(token,'other',input,other.io)
    assert.equal((await client.applyReviewedNativeDeviceAction(otherReview,token,'other',input,other.io)).verified,false)
  })
  await check('malformed import flags and uncertain responses remain refused across recapture and module reload',async()=>{
    for(const imported of ['yes',1,{},undefined]){
      const f=fixture(),input=action('apple_health.import',{localDate:day}),token=`bad-${++tokenSequence}`
      let calls=0;f.io.health.refresh=async()=>{calls++;return {imported,summary:{localDate:day,selectedSource:null,activeEnergyKcal:123}}}
      await assert.rejects(f.apply(await f.capture(input,token)),/invalid import result/)
      await assert.rejects(f.apply(await f.capture(input,token)),/previous device attempt/)
      const reloaded=load('native/src/voice/nativeDeviceActions.ts',clientImports),review=await reloaded.captureNativeDeviceReview(token,'owner',input,f.io)
      await assert.rejects(reloaded.applyReviewedNativeDeviceAction(review,token,'owner',input,f.io),/previous import attempt/);assert.equal(calls,1)
    }
    const f=fixture(),input=action('apple_health.import',{localDate:day}),token=`lost-${++tokenSequence}`;let posts=0
    f.io.health.refresh=async()=>{posts++;throw Error('Synthetic response lost after posting')}
    await assert.rejects(f.apply(await f.capture(input,token)),/response lost/)
    const reloaded=load('native/src/voice/nativeDeviceActions.ts',clientImports),review=await reloaded.captureNativeDeviceReview(token,'owner',input,f.io)
    await assert.rejects(reloaded.applyReviewedNativeDeviceAction(review,token,'owner',input,f.io));assert.equal(posts,1)
  })
  await check('durable journal stores only secure digests/status and rechecks current state on reload',async()=>{
    const f=fixture(),input=action('apple_health.import',{localDate:day}),token=`unicode-東京-é-${++tokenSequence}`
    f.state.source={sourceId:'sample.export',sourceName:'睡眠 💤 café'}
    await f.apply(await f.capture(input,token))
    const journalKey=[...f.store.keys()].find(key=>key.startsWith('helfi_voice_health_import_receipts_v1:')),raw=f.store.get(journalKey),entries=JSON.parse(raw)
    assert.equal(entries[0].digest,require('node:crypto').createHash('sha256').update(token,'utf8').digest('hex'))
    assert(!raw.includes(token));assert(!raw.includes(day));assert(!raw.includes('123.5'));assert(!raw.includes('睡眠'));assert(!raw.includes('synthetic'))
    assert.deepEqual(Object.keys(entries[0]).sort(),['action','after','before','digest','expiresAt','payloadDigest','status'])
    const reloaded=load('native/src/voice/nativeDeviceActions.ts',clientImports),review=await reloaded.captureNativeDeviceReview(token,'owner',input,f.io)
    assert.equal((await reloaded.applyReviewedNativeDeviceAction(review,token,'owner',input,f.io)).idempotentReplay,true);assert.equal(f.calls.filter(call=>call[0]==='import').length,1)
    f.state.enabled=true;const changed=await reloaded.captureNativeDeviceReview(token,'owner',input,f.io);await assert.rejects(reloaded.applyReviewedNativeDeviceAction(changed,token,'owner',input,f.io),/changed after confirmation/)
    const order=fixture(),value=action('sleep.settings.update',{endTime:'08:00',startTime:'23:00'}),r=await order.capture(value)
    assert.equal((await order.apply(r,action('sleep.settings.update',{startTime:'23:00',endTime:'08:00'}))).verified,true)
  })
  await check('shared mounted editor is synchronized and cannot overwrite a confirmed voice value with stale state',async()=>{
    const f=fixture();let dirty=false,received=null
    const stop=client.registerSleepDeviceEditor({accountId:'owner',isCurrent:()=>true,isDirty:()=>dirty,synchronize:(value,origin)=>{received={value,origin}}})
    try{
      const before=await client.readSleepDeviceSnapshot(f.io),review=await f.capture(action('sleep.settings.update',{enabled:true}))
      await f.apply(review);assert.equal(received.origin,'voice');assert.equal(received.value.settings.enabled,true)
      await assert.rejects(client.writeSleepDeviceState(f.io,'owner',action('sleep.settings.update',{enabled:false}),before,'manual'),/changed after review/)
      dirty=true;await assert.rejects(f.apply(await f.capture(action('sleep.routine.update',{hydrate:true}))),/manual edit/)
    }finally{stop()}
  })
  await check('actual provider live getter follows current token, persisted source hydration and overlapping busy lifecycle',async()=>{
    const source=fs.readFileSync(path.join(root,'native/src/health/AppleHealthSyncProvider.tsx'),'utf8'),ast=ts.createSourceFile('provider.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),code={}
    function visit(node){if(ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name)&&['getSnapshot','refresh','setEnabled','setSource'].includes(node.name.text))code[node.name.text]=`const ${node.getText(ast)};`;ts.forEachChild(node,visit)}visit(ast)
    const current={current:{userId:'owner',token:'synthetic',enabled:false,source:null,savedSource:null,savedSourceHydrated:true,sourceHydrated:true,sourcePending:null,revision:0,enabledRevision:0,sourceRevision:0,busyCount:0}},finishes=[],writes=[],busy=[]
    const context={current,userId:'owner',token:'synthetic',ready:true,source:null,useCallback:fn=>fn,validateAppleHealthSource:sources.validateAppleHealthSource,isAppleHealthSupportedDevice:()=>true,runSync:async()=>new Promise(resolve=>finishes.push(resolve)),setBusy:value=>busy.push(value),setResult:()=>{},setError:()=>{},setReady:()=>{},updateEnabled:()=>{},updateSource:()=>{},DeviceEventEmitter:{emit:()=>{}},preferenceWrites:{current:Promise.resolve()},AsyncStorage:{setItem:async(key,value)=>writes.push([key,value])},appleHealthAutoKey:healthSync.appleHealthAutoKey,appleHealthSourceKey:healthSync.appleHealthSourceKey,exports:{}}
    const snippet=Object.values(code).join('\n')+'\nexports.api={getSnapshot,refresh,setEnabled,setSource};'
    vm.runInNewContext(ts.transpileModule(snippet,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText,context)
    const api=context.exports.api
    assert.equal(api.getSnapshot().ready,true)
    for(const patch of [{sourceHydrated:false},{savedSourceHydrated:false},{sourcePending:1}]){const prior={...current.current};Object.assign(current.current,patch);assert.equal(api.getSnapshot().ready,false);current.current=prior}
    await api.setEnabled(true);assert.equal(api.getSnapshot().enabled,true);assert.equal(writes[0][1],'1')
    await api.setSource(watch);assert.deepEqual(plain(api.getSnapshot().source),watch)
    const clone=api.getSnapshot();clone.source.sourceName='changed caller copy';assert.equal(api.getSnapshot().source.sourceName,watch.sourceName)
    const first=api.refresh(true,day),second=api.refresh(true,day);assert.equal(api.getSnapshot().busy,true);assert.equal(current.current.busyCount,2)
    finishes[1](null);await second;assert.equal(api.getSnapshot().busy,true)
    finishes[0](null);await first;assert.equal(api.getSnapshot().busy,false);assert.equal(busy.at(-1),false)
    current.current.token='new-token';assert.equal(api.getSnapshot().userId,null);assert.equal(api.getSnapshot().ready,false);assert.equal(api.getSnapshot().enabled,false)
    current.current={...current.current,userId:'other',token:'other-token',busyCount:2};assert.equal(api.getSnapshot().busy,false);assert.equal(api.getSnapshot().source,null)
  })
  await check('server signs exact account-bound fixed payload and authorizes without claiming any device write or import',async()=>{
    assert.deepEqual(Object.keys(server.VOICE_DEVICE_ACTION_SCHEMAS).sort(),['apple_health.automatic.update','apple_health.import','apple_health.source.select'])
    for(const input of [action('apple_health.import',{localDate:day}),action('apple_health.automatic.update',{enabled:true}),action('apple_health.source.select',{sourceName:watch.sourceName})]){
      const draft=await server.prepareNativeVoiceDeviceAction(request(),'owner',input,day);assert.equal(tokens.verifyNativeVoiceDraft('owner',draft),true);assert.equal(draft.action,'device_action')
      if(input.action==='apple_health.source.select'){assert.match(draft.summary,/automatic updates.*may refresh activity/);assert(!draft.summary.includes('does not import'))}
      const result=await server.authorizeNativeVoiceDeviceAction(request(),'owner',draft);assert.deepEqual(plain(result.authorizedDeviceAction),input);assert.equal(result.safeToClaimSaved,false);assert.equal(result.status,'device_authorized');assert.equal(result.receipt,undefined)
      const changed=plain(draft);changed.deviceAction.values={enabled:false};await assert.rejects(server.authorizeNativeVoiceDeviceAction(request(),'owner',changed))
      await assert.rejects(server.authorizeNativeVoiceDeviceAction(request(),'other',draft))
    }
    for(const input of [action('sleep.settings.update',{enabled:true}),action('sleep.routine.update',{blueLight:false})]){
      await assert.rejects(server.prepareNativeVoiceDeviceAction(request(),'owner',input,day),/not available/)
      const hidden={action:'device_action',canConfirm:true,requiresDeviceReview:true,deviceAction:input,reviewIssuedAt:Date.now()};hidden.reviewToken=tokens.signNativeVoiceDraft('owner',hidden);await assert.rejects(server.authorizeNativeVoiceDeviceAction(request(),'owner',hidden),/not available/)
    }
    await assert.rejects(server.prepareNativeVoiceDeviceAction(request(),'owner',action('apple_health.import',{localDate:'2026-10-18'}),day))
    signedIn=null;await assert.rejects(server.prepareNativeVoiceDeviceAction(request(),'owner',action('apple_health.automatic.update',{enabled:true}),day))
    signedIn='owner';const draft=await server.prepareNativeVoiceDeviceAction(request(),'owner',action('apple_health.automatic.update',{enabled:true}),day);draft.reviewIssuedAt=Date.now()-31*60*1000;draft.reviewToken=tokens.signNativeVoiceDraft('owner',draft);await assert.rejects(server.authorizeNativeVoiceDeviceAction(request(),'owner',draft))
  })
  console.log(`PASS ${count} native device action groups (synthetic IO; no real Health reads or writes)`)
}
main().catch(error=>{console.error(error);process.exitCode=1})
