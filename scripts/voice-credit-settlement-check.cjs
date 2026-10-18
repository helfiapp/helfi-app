#!/usr/bin/env node
'use strict'
// Actual source, synthetic clocks/hooks/events/network only. No account access,
// environment loading, action jobs, provider requests, credits or audio.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),ts=require('typescript')
const root=path.resolve(__dirname,'..'),read=relative=>fs.readFileSync(path.join(root,relative),'utf8')
const flush=async()=>{for(let i=0;i<8;i++)await new Promise(r=>setImmediate(r))}
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r});return{promise,resolve}}
const transpile=source=>ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText
function pure(relative){const exports={};new Function('exports','require',transpile(read(relative)))(exports,id=>{throw Error('Unexpected import '+id)});return exports}
const helpers=pure('native/src/voice/voiceCreditSettlement.ts'),guards=pure('native/src/voice/voiceActionReadRefresh.ts')
const {watchVoiceCreditSettlement,matchesVoiceCreditChange,walletCreditBalance,VOICE_CREDITS_CHANGED}=helpers
function clock(){let now=0,id=0;const timers=new Map();return{now:()=>now,setTimer:(fn,ms)=>{timers.set(++id,{at:now+ms,fn});return id},clearTimer:id=>timers.delete(id),async next(){const first=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];if(!first)return false;timers.delete(first[0]);now=first[1].at;first[1].fn();await flush();return true},async drain(){for(let i=0;i<100&&await this.next();i++);assert.equal(timers.size,0,'Observer must finish with bounded timers')},timers}}
const event=(phase='settled',extra={})=>({source:'voice-assistant',accountId:'owner',sessionId:'billing-1',phase,...extra})
const response=(data,ok=true)=>({ok,json:async()=>data})
function sourceAst(relative){const source=read(relative),ast=ts.createSourceFile(relative,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);return{source,ast}}
const food=sourceAst('native/src/screens/TrackCaloriesScreen.tsx'),voice=sourceAst('native/src/voice/VoiceAssistant.tsx')
const foodComponent=food.ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='TrackCaloriesScreen')
function callback(file,name){let result;function walk(n){if(ts.isVariableDeclaration(n)&&n.name.getText(file.ast)===name&&ts.isCallExpression(n.initializer))result=n.initializer.arguments[0]?.getText(file.ast);ts.forEachChild(n,walk)}walk(file.ast);assert(result,'Actual callback '+name);return result}
function presentationHash(file){const parts=[];function walk(n){if(ts.isJsxElement(n)||ts.isJsxSelfClosingElement(n)||ts.isJsxFragment(n)){parts.push(n.getText(file.ast));return}ts.forEachChild(n,walk)}walk(file.ast);for(const n of file.ast.statements)if(ts.isVariableStatement(n))parts.push(n.getText(file.ast));return crypto.createHash('sha256').update(JSON.stringify(parts)).digest('hex')}
function hooksHarness(code,initialBox={}){
 const hooks=[],events=new Map(),requests=[];let cursor=0,pending=[],rendered,network=async()=>{throw Error('Synthetic fetch not configured')}
 let app={mode:'signedIn',session:{token:'token-owner',user:{id:'owner'}}}
 const equal=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>v===b[i])
 const box={...helpers,...guards,AbortController,Map,Array,Promise,Date,JSON,encodeURIComponent,API_BASE_URL:'https://synthetic.invalid',console,buildNativeAuthHeaders:token=>({authorization:'Bearer '+token}),getApp:()=>app,
  useState(initial){const i=cursor++;if(!hooks[i])hooks[i]={kind:'state',value:initial};return[hooks[i].value,value=>{hooks[i].value=value}]},
  useRef(initial){const i=cursor++;if(!hooks[i])hooks[i]={kind:'ref',value:{current:initial}};return hooks[i].value},
  useCallback(fn,deps){const i=cursor++;if(!hooks[i]||!equal(hooks[i].deps,deps))hooks[i]={kind:'callback',value:fn,deps};return hooks[i].value},
  useEffect(fn,deps){const i=cursor++;if(!hooks[i]||!equal(hooks[i].deps,deps)){const cleanup=hooks[i]?.cleanup;hooks[i]={kind:'effect',deps};pending.push(()=>{cleanup?.();hooks[i].cleanup=fn()})}},
  DeviceEventEmitter:{addListener:(name,fn)=>{if(!events.has(name))events.set(name,new Set());events.get(name).add(fn);return{remove:()=>events.get(name).delete(fn)}},emit:(name,payload)=>{for(const fn of events.get(name)||[])fn(payload)}},
  fetch:async(url,options={})=>{requests.push({url,options});return network(url,options)},...initialBox}
 vm.createContext(box);vm.runInContext(transpile(code),box)
 const render=()=>{cursor=0;pending=[];rendered=box.render();for(const fn of pending)fn();return rendered}
 return{box,requests,render,current:()=>rendered,network:fn=>{network=fn},emit:(name,payload)=>box.DeviceEventEmitter.emit(name,payload),swap(next){app=next;return render()},unmount(){for(const hook of hooks)hook.cleanup?.()},state:index=>hooks.filter(h=>h.kind==='state')[index].value}
}
function foodHarness(){
 const statements=foodComponent.body.statements,start=statements.findIndex(n=>n.getText(food.ast).includes('const [creditsRemaining,')),end=statements.findIndex(n=>n.getText(food.ast).includes('const [foodAnalysisUsageCount,'))
 assert(start>=0&&end>start);const block=statements.slice(start,end).map(n=>n.getText(food.ast)).join('\n')
 const data={selectedDate:'2026-10-18',loadRequestIdRef:{current:0},healthExerciseRevisionRef:{current:0},DEFAULT_TARGETS:{},normalizeFoodApiEntry:v=>v,numberOrZero:v=>Number(v)||0,buildDailyTargetsFromUserData:v=>v,normalizeFavoriteList:v=>v,Alert:{alert:()=>{throw Error('Unexpected Food alert')}},setLoading:()=>{},setEntries:()=>{},setWaterEntries:()=>{},setExerciseEntries:()=>{},setExerciseCalories:()=>{},setFoodAnalysisUsageCount:()=>{},setFoodAnalysisCostPerUse:()=>{},setFoodAnalysisUsageLabel:()=>{},setDailyTargets:()=>{},setFavorites:()=>{}}
 return hooksHarness(`function render(){const {mode,session}=getApp();const authHeaders=session?.token?buildNativeAuthHeaders(session.token):null;${block}\nconst loadAll=(${callback(food,'loadAll')});return{refreshCreditBalance,loadAll,creditReadGuardRef}}`,data)
}
function voiceHarness(c){
 const component=voice.ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='VoiceAssistantProvider'),statements=component.body.statements
 const start=statements.findIndex(n=>n.getText(voice.ast).startsWith('const voiceCreditObserversRef')),end=statements.findIndex((n,i)=>i>start&&n.getText(voice.ast).includes('openRef.current = open'))
 assert(start>=0&&end>start);const block=statements.slice(start,end).map(n=>n.getText(voice.ast)).join('\n')
 const data={voiceProviderMountedRef:{current:true},voiceAccountUserIdRef:{current:'owner'},voiceAccountTokenRef:{current:'token-owner'},realtimeVoiceRunRef:{current:1},voiceSessionActiveRef:{current:true},watchVoiceCreditSettlement:io=>watchVoiceCreditSettlement({...io,...c})}
 return hooksHarness(`function render(){const {mode,session}=getApp();const voiceMemoryUserId=session?.user?.id||'';voiceAccountUserIdRef.current=voiceMemoryUserId;voiceAccountTokenRef.current=session?.token||'';${block}\nreturn{observeVoiceCredits,finishVoiceCreditObservers,voiceCreditObserversRef}}`,data)
}
let groups=0
async function check(name,fn){await fn();groups++;console.log('PASS '+name)}
async function run(){
 await check('unchanged native presentation; normal Food loading uses the same guarded credit reader',async()=>{
  assert.equal(presentationHash(food),'b54f1e086256443b2a8fe29a3ec28385015feb90bd9546a4d40c435e8c04e234');assert.equal(presentationHash(voice),'fca539f03e48bae7365f63ce8c590ee3803bb4b94d5efd70c6f697eaac71a27a')
  assert.match(callback(food,'loadAll'),/const creditPromise = refreshCreditBalance\(\)/);assert(!callback(food,'loadAll').includes('setCreditsRemaining'))
  for(const name of ['stopRealtimeVoiceSession','startVoiceSession'])assert(callback(voice,name).includes('finishVoiceCreditObservers'))
  assert.match(callback(voice,'startVoiceSession'),/onMeteredSession: sessionId => observeVoiceCredits\(sessionId, voiceMemoryUserId, startupAccountToken, realtimeRunId\)/)
 })
 await check('reservation is announced immediately; no session GET until stop; settlement waits for the server',async()=>{
  const c=clock(),changes=[],states=['ready','closing','complete'];let reads=0
  const observer=watchVoiceCreditSettlement({...c,accountId:'owner',sessionId:'billing-1',isCurrent:()=>true,request:async()=>({sessionId:'billing-1',state:states[reads++],jobs:[{id:'must-never-execute'}]}),onChange:e=>changes.push(e)})
  assert.equal(reads,0);assert.deepEqual(changes.map(e=>e.phase),['reserved']);observer.afterStop();observer.afterStop();await c.drain();assert.equal(reads,3);assert.deepEqual(changes.map(e=>e.phase),['reserved','settled']);assert.deepEqual(changes[1],event('settled'));observer.afterStop();assert.equal(c.timers.size,0)
 })
 await check('failed, malformed, foreign-session and timed-out reads cannot claim settlement; polling is bounded',async()=>{
  for(const kind of ['error','foreign','hung']){const c=clock(),changes=[],signals=[];let reads=0
   const observer=watchVoiceCreditSettlement({...c,accountId:'owner',sessionId:'billing-1',isCurrent:()=>true,request:async signal=>{signals.push(signal);reads++;if(kind==='hung')return new Promise(()=>{});if(kind==='error')throw Error('Synthetic read failure');return{sessionId:'foreign',state:'complete'}},onChange:e=>changes.push(e)})
   observer.afterStop();await c.drain();assert(reads>1&&reads<=12);assert(c.now()<=95000);assert.deepEqual(changes.map(e=>e.phase),['reserved','uncertain']);if(kind==='hung')assert(signals.every(s=>s.aborted))
  }
 })
 await check('uncertain server status stops without pretending a refund or triggering any action',async()=>{
  const c=clock(),changes=[];let reads=0;const o=watchVoiceCreditSettlement({...c,accountId:'owner',sessionId:'billing-1',isCurrent:()=>true,request:async()=>{reads++;return{sessionId:'billing-1',state:'uncertain',jobs:[{args:{command:'confirm'}}]}},onChange:e=>changes.push(e)});o.afterStop();await c.drain();assert.equal(reads,1);assert.deepEqual(changes.map(e=>e.phase),['reserved','uncertain'])
 })
 await check('account change and unmount suppress late settlement even when transport ignores cancellation',async()=>{
  for(const cancel of [false,true]){const c=clock(),gate=deferred(),changes=[];let current=true,signal;const o=watchVoiceCreditSettlement({...c,accountId:'owner',sessionId:'billing-1',isCurrent:()=>current,request:async s=>{signal=s;return gate.promise},onChange:e=>changes.push(e)});o.afterStop();await c.next();if(cancel)o.cancel();else current=false;gate.resolve({sessionId:'billing-1',state:'complete'});await flush();await c.drain();assert.deepEqual(changes.map(e=>e.phase),['reserved']);if(cancel)assert(signal.aborted)}
 })
 await check('wallet responses preserve unknowns and accept measured zero; foreign credit events are rejected',async()=>{
  for(const total of [undefined,null,'0',NaN,Infinity,-1])assert.equal(walletCreditBalance({credits:{total}}),null)
  assert.deepEqual(walletCreditBalance({credits:{total:0},percentUsed:120}),{remaining:0,percentUsed:100});assert.equal(walletCreditBalance({credits:{total:867}}).remaining,867)
  assert(matchesVoiceCreditChange(event(),'owner'));assert(!matchesVoiceCreditChange(event(),'other'));assert(!matchesVoiceCreditChange(event('settled',{source:'other'}),'owner'));assert(!matchesVoiceCreditChange(event('guessed'),'owner'))
 })
 await check('mounted Food refreshes only wallet on reservation/settlement without diary or action requests',async()=>{
  const h=foodHarness();let credits=877;h.network(async()=>response({credits:{total:credits},percentUsed:20}));h.render();await h.current().refreshCreditBalance();assert.equal(h.state(0),877);const before=h.requests.length
  h.emit(VOICE_CREDITS_CHANGED,event('reserved'));await flush();credits=867;h.emit(VOICE_CREDITS_CHANGED,event());await flush();assert.equal(h.state(0),867);assert.equal(h.requests.length,before+2);assert(h.requests.every(r=>r.url.endsWith('/api/credit/status')&&!r.options.method&&r.options.headers.authorization==='Bearer token-owner'));h.unmount()
 })
 await check('old loadAll wallet response cannot overwrite newer settled balance; no extra diary reads',async()=>{
  const h=foodHarness(),gate=deferred();let first=true;h.network(async url=>{if(url.endsWith('/api/credit/status')){if(first){first=false;return gate.promise}return response({credits:{total:867}})}return response({logs:[],entries:[],exerciseCalories:0,data:{},featureUsage:{foodAnalysis:{count:2,costPerUse:10}}})});h.render();const old=h.current().loadAll();await flush();const diaryCount=h.requests.filter(r=>!r.url.endsWith('/api/credit/status')).length;h.emit(VOICE_CREDITS_CHANGED,event());await flush();assert.equal(h.state(0),867);gate.resolve(response({credits:{total:877}}));await old;assert.equal(h.state(0),867);assert.equal(h.requests.filter(r=>!r.url.endsWith('/api/credit/status')).length,diaryCount);h.unmount()
 })
 await check('Food keeps verified balance on failures and ignores cross-account events/in-flight results',async()=>{
  const h=foodHarness();h.network(async()=>response({credits:{total:867},percentUsed:37}));h.render();await h.current().refreshCreditBalance();assert.equal(h.state(1),37);const count=h.requests.length;h.emit(VOICE_CREDITS_CHANGED,event('settled',{accountId:'foreign'}));await flush();assert.equal(h.requests.length,count)
  for(const reply of [()=>response({},false),()=>response({credits:{total:null}}),()=>{throw Error('Synthetic network failure')}]){h.network(async()=>reply());await h.current().refreshCreditBalance();assert.equal(h.state(0),867)}
  const gate=deferred();h.network(async()=>gate.promise);const pending=h.current().refreshCreditBalance();h.swap({mode:'signedIn',session:{token:'token-new',user:{id:'new-owner'}}});gate.resolve(response({credits:{total:999}}));await pending;assert.equal(h.state(0),null);assert.equal(h.state(1),0);h.network(async()=>response({credits:{total:123}}));await h.current().refreshCreditBalance();assert.equal(h.state(0),123)
  const late=deferred();h.network(async()=>late.promise);const final=h.current().refreshCreditBalance();h.unmount();late.resolve(response({credits:{total:1}}));await final;assert.equal(h.state(0),123)
 })
 await check('actual VoiceAssistant observer survives Done/run change, uses GET only and deduplicates session callbacks',async()=>{
  const c=clock(),h=voiceHarness(c),changes=[];h.network(async()=>response({sessionId:'billing-1',state:'complete',jobs:[{command:'confirm'}]}));h.render();h.box.DeviceEventEmitter.addListener(VOICE_CREDITS_CHANGED,e=>changes.push(e));h.current().observeVoiceCredits('billing-1','owner','token-owner',1);h.current().observeVoiceCredits('billing-1','owner','token-owner',1);assert.equal(h.requests.length,0);assert.equal(changes.length,1)
  h.current().finishVoiceCreditObservers();h.box.realtimeVoiceRunRef.current++;h.box.voiceSessionActiveRef.current=false;await c.drain();assert.deepEqual(changes.map(e=>e.phase),['reserved','settled']);assert.equal(h.requests.length,1);assert(h.requests[0].url.includes('/session?sessionId=billing-1'));assert(!h.requests[0].options.method);assert.equal(h.current().voiceCreditObserversRef.current.size,0);h.unmount()
 })
 await check('late allocated session after Done is still observed, but old-account callbacks never read or publish',async()=>{
  const c=clock(),h=voiceHarness(c),changes=[];h.render();h.box.DeviceEventEmitter.addListener(VOICE_CREDITS_CHANGED,e=>changes.push(e));h.box.realtimeVoiceRunRef.current=2;h.box.voiceSessionActiveRef.current=false;h.network(async()=>response({sessionId:'billing-1',state:'closed'}));h.current().observeVoiceCredits('billing-1','owner','token-owner',1);await c.drain();assert.deepEqual(changes.map(e=>e.phase),['reserved','settled']);const count=h.requests.length;const old=h.current().observeVoiceCredits;h.swap({mode:'signedIn',session:{token:'token-new',user:{id:'new-owner'}}});old('billing-2','owner','token-owner',1);await c.drain();assert.equal(h.requests.length,count);h.unmount()
 })
 await check('VoiceAssistant account cleanup cancels outstanding reads; event listener exceptions cannot break setup',async()=>{
  const c=clock(),h=voiceHarness(c),gate=deferred(),changes=[];h.render();h.box.DeviceEventEmitter.addListener(VOICE_CREDITS_CHANGED,e=>changes.push(e));h.network(async()=>gate.promise);h.current().observeVoiceCredits('billing-1','owner','token-owner',1);h.current().finishVoiceCreditObservers();await c.next();h.swap({mode:'signedIn',session:{token:'token-new',user:{id:'new-owner'}}});gate.resolve(response({sessionId:'billing-1',state:'complete'}));await flush();await c.drain();assert.deepEqual(changes.map(e=>e.phase),['reserved']);assert(h.requests[0].options.signal.aborted);h.unmount()
  const c2=clock(),o=watchVoiceCreditSettlement({...c2,accountId:'owner',sessionId:'billing-1',isCurrent:()=>true,request:async()=>({sessionId:'billing-1',state:'complete'}),onChange:()=>{throw Error('Display listener failed')}});o.afterStop();await c2.drain()
 })
 console.log(`Voice credit settlement: ${groups} actual-source groups passed; offline only.`)
}
if(require.main===module)run().catch(error=>{console.error(error);process.exitCode=1})
module.exports={run}
