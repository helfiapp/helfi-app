#!/usr/bin/env node
'use strict'
// Actual four screen callbacks/effects plus the actual read guard. Synthetic
// events/auth/fetch only; no account, provider, UI, network or mutation.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript')
const root=path.resolve(__dirname,'..'),moduleBox={exports:{}}
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,'native/src/voice/voiceActionReadRefresh.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{module:moduleBox,exports:moduleBox.exports,AbortController,Map})
const {createVoiceActionReadGuard,matchesVoiceActionReadRefresh}=moduleBox.exports
const cases=[
 {file:'DevicesScreen.tsx',callback:'loadDeviceStatus',area:'devices',action:'devices.interest.update',kind:'device_interest',endpoint:'/api/user-data',state:'interest',body:{data:{deviceInterest:{googleFit:false,oura:true,polar:false}}},expected:{googleFit:false,oura:true,polar:false}},
 {file:'HealthImageNotesScreen.tsx',callback:'loadHistory',area:'health-images',action:'health_image_note.delete',kind:'health_image_note',endpoint:'/api/medical-images/history',state:'historyItems',body:{history:[{id:'remaining-image'}]},expected:[{id:'remaining-image'}]},
 {file:'SmartHealthCoachScreen.tsx',callback:'loadHistoryTips',area:'coach-history',action:'coach_history.delete',kind:'history_action',endpoint:'/api/health-tips/history',state:'tipsHistory',body:{tips:[{id:'remaining-tip'}]},expected:[{id:'remaining-tip'}]},
 {file:'DailyCheckInScreen.tsx',callback:'loadHistory',area:'checkin-history',action:'checkin_history.delete',kind:'history_action',endpoint:'/api/checkins/history',state:'historyRows',body:{history:[{id:'remaining-checkin'}]},expected:[{id:'remaining-checkin'}]},
]
const tick=async()=>{for(let i=0;i<40;i++)await Promise.resolve()}
const compile=code=>ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText
function fixture(spec){
 const source=fs.readFileSync(path.join(root,'native/src/screens',spec.file),'utf8'),tree=ts.createSourceFile(spec.file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX)
 let callback,subscription,mount,cache,focus
 function visit(node){
  if(ts.isVariableDeclaration(node)&&node.name.getText(tree)===spec.callback)callback=node.initializer.arguments[0].getText(tree)
  if(ts.isCallExpression(node)&&node.arguments[0]){const type=node.expression.getText(tree),body=node.arguments[0].getText(tree)
   if(type==='useEffect'&&body.includes("'helfi:voice-action-completed'"))subscription=body
   if(type==='useEffect'&&body.includes('guard.mount()'))mount=body
   if(type==='useEffect'&&node.arguments[1]?.getText(tree)==='[voiceReadAccount]')cache=body
   if(type==='useFocusEffect'&&body.includes(spec.callback)&&!body.includes('loadSettings'))focus=node.arguments[0].arguments[0].getText(tree)
  }ts.forEachChild(node,visit)
 }visit(tree)
 assert(callback&&subscription&&mount&&cache&&focus,spec.file+' must expose actual read/lifetime/event/focus functions')
 const account=JSON.stringify(['synthetic-owner','synthetic-token']),guard=createVoiceActionReadGuard(),requests=[],alerts=[],state={},updates=[];let listener,removed=0
 guard.setAccount(account)
 const box={Promise,JSON,Object,Boolean,Array,Error,AbortController,API_BASE_URL:'https://offline.invalid',mode:'signedIn',session:{user:{id:'synthetic-owner'},token:'synthetic-token'},authHeaders:{Authorization:'Bearer synthetic-token'},voiceReadAccount:account,voiceReadGuardRef:{current:guard},voiceHistoryNeedsRefreshRef:{current:false},activeTab:'history',historyLoaded:true,matchesVoiceActionReadRefresh,
  loadToday:()=>{throw Error('Voice history refresh must not reload/reset Today')},Alert:{alert:(...value)=>alerts.push(value)},DeviceEventEmitter:{addListener:(name,callback)=>{assert.equal(name,'helfi:voice-action-completed');listener=callback;return{remove:()=>{removed++;listener=null}}}},
  fetch:(url,options)=>new Promise((resolve,reject)=>requests.push({url,options,resolve,reject})),
 }
 for(const name of ['setFitbitConnected','setGarminConnected','setInterest','setLoading','setHistoryItems','setHistoryLoading','setHistoryError','setTipsHistory','setLoadingHistory','setHistoryRows','setHistoryLoaded'])box[name]=value=>{const key=name.slice(3,4).toLowerCase()+name.slice(4);state[key]=value;updates.push([key,value])}
 vm.createContext(box);vm.runInContext(compile(`globalThis.load=${callback};globalThis.listen=${subscription};globalThis.mount=${mount};globalThis.resetCache=${cache};globalThis.focus=${focus}`),box)
 box[spec.callback]=box.load
 const unmount=box.mount(),unsubscribe=box.listen()
 const event={source:'voice-assistant',accountId:'synthetic-owner',kind:spec.kind,action:spec.action,changedAreas:[spec.area]}
 const respond=(index,body=spec.body,ok=true)=>requests[index].resolve({ok,json:async()=>body})
 return{box,guard,requests,alerts,state,updates,event,respond,emit:payload=>listener?.(payload||event),capture:()=>listener,unmount,unsubscribe,removed:()=>removed}
}
let count=0
async function check(name,run){await run();count++;console.log('PASS '+name)}
async function main(){
 for(const spec of cases){
  await check(spec.file+': matching completion reloads the actual current list/status without navigation or mutation',async()=>{const f=fixture(spec);f.emit();assert.equal(f.requests.length,1);assert.equal(f.requests[0].url,'https://offline.invalid'+spec.endpoint);assert(!f.requests[0].options.method||f.requests[0].options.method==='GET');assert.equal(f.requests[0].options.body,undefined);f.respond(0);await tick();assert.deepEqual(JSON.parse(JSON.stringify(f.state[spec.state])),spec.expected);assert.equal(f.alerts.length,0);if(spec.area==='devices'){assert.equal(f.updates.filter(([key])=>key==='loading').length,0);assert.equal(f.updates.filter(([key])=>key.includes('Connected')).length,0)}f.unsubscribe();f.unmount()})
  await check(spec.file+': unrelated malformed unauthenticated and foreign-account events never fetch',async()=>{const f=fixture(spec);for(const patch of [{accountId:'foreign'},{accountId:undefined},{source:'other'},{action:'unrelated.action'},{kind:'food'},{changedAreas:['unrelated']},{changedAreas:[spec.area,'unrelated']}])f.emit({...f.event,...patch});f.box.authHeaders=null;f.emit();assert.equal(f.requests.length,0);assert.equal(f.updates.length,0);f.unsubscribe();f.unmount()})
  await check(spec.file+': latest read wins even if old cancelled fetch returns last',async()=>{const f=fixture(spec);f.emit();f.emit();assert.equal(f.requests.length,2);assert.equal(f.requests[0].options.signal.aborted,true);f.respond(1);await tick();const expected=JSON.stringify(f.state);f.respond(0,spec.area==='devices'?{data:{deviceInterest:{oura:false}}}:{history:[],tips:[]});await tick();assert.equal(JSON.stringify(f.state),expected);assert.equal(f.alerts.length,0);f.unsubscribe();f.unmount()})
  await check(spec.file+': account switch and unmount drop pending bodies/errors/finalizers and old closures',async()=>{for(const reason of ['account','unmount']){const f=fixture(spec);f.emit();const handler=f.capture(),before=JSON.stringify(f.state);if(reason==='account')f.guard.setAccount(JSON.stringify(['foreign','different-token']));else f.unmount();assert.equal(f.requests[0].options.signal.aborted,true);f.respond(0);await tick();assert.equal(JSON.stringify(f.state),before);assert.equal(f.alerts.length,0);handler(f.event);assert.equal(f.requests.length,1);f.unsubscribe();assert.equal(f.removed(),1)}})
  await check(spec.file+': failures release current loading and stale failures cannot affect a new read',async()=>{const f=fixture(spec);f.emit();f.respond(0,{error:'Synthetic read failure'},false);await tick();assert.equal(f.alerts.length,spec.area==='health-images'?0:1);assert(!Object.entries(f.state).some(([key,value])=>/loading/i.test(key)&&value===true));f.emit();f.emit();f.respond(2);await tick();const before=JSON.stringify(f.state),alerts=f.alerts.length;f.requests[1].reject(Error('Late failure'));await tick();assert.equal(JSON.stringify(f.state),before);assert.equal(f.alerts.length,alerts);f.unsubscribe();f.unmount()})
  await check(spec.file+': account cache reset clears only read results and keeps unrelated form selection untouched',async()=>{const f=fixture(spec);f.box.resetCache();const allowed=spec.area==='devices'?['fitbitConnected','garminConnected','interest','loading']:spec.area==='health-images'?['historyItems','historyLoading','historyError']:spec.area==='coach-history'?['tipsHistory','loadingHistory']:['historyRows','historyLoaded','historyLoading'];assert(f.updates.length);assert(f.updates.every(([key])=>allowed.includes(key)));f.unsubscribe();f.unmount()})
 }
 await check('inactive history refresh preserves Today/settings input and refreshes on next history activation',async()=>{for(const spec of cases.filter(value=>value.area!=='devices')){const f=fixture(spec);f.box.activeTab='today';f.emit();assert.equal(f.requests.length,0);assert.equal(f.updates.length,0);if(spec.area==='checkin-history')assert.equal(f.box.voiceHistoryNeedsRefreshRef.current,true);f.box.activeTab='history';f.box.focus();assert.equal(f.requests.length,1);f.respond(0);await tick();if(spec.area==='checkin-history')assert.equal(f.box.voiceHistoryNeedsRefreshRef.current,false);f.unsubscribe();f.unmount()}})
 await check('silent interest refresh cannot leave a simultaneous foreground status read spinning',async()=>{const f=fixture(cases[0]);const foreground=f.box.load();assert.equal(f.requests.length,3);f.emit();assert.equal(f.requests.length,4);f.respond(3);await tick();f.requests[0].resolve({ok:true,json:async()=>({connected:true})});f.requests[1].resolve({ok:true,json:async()=>({connected:false})});f.respond(2,{data:{deviceInterest:{oura:false}}});await foreground;assert.equal(f.state.loading,false);assert.equal(f.state.fitbitConnected,true);assert.equal(f.state.garminConnected,false);assert.equal(f.state.interest.oura,true);f.unsubscribe();f.unmount()})
 await check('malformed interest read never overwrites the current preference or claims a connection',async()=>{for(const body of [{data:{deviceInterest:[]}}, {data:{deviceInterest:{oura:'true'}}}, {deviceInterest:{oura:true}}, {}]){const f=fixture(cases[0]);f.state.interest={oura:false};f.emit();f.respond(0,body);await tick();assert.deepEqual(f.state.interest,{oura:false});assert.equal(f.alerts.length,1);assert.equal(f.updates.filter(([key])=>key.includes('Connected')).length,0);f.unsubscribe();f.unmount()}})
 console.log(`PASS ${count} actual-source voice screen read-refresh groups. No real app data or mutations.`)
}
main().catch(error=>{console.error(error.stack||error.message);process.exitCode=1})
