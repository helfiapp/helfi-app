import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

function load(file: string, context: any = {}) {
  const env: any = { exports: {}, Date, Map, Number, Error, Promise, setTimeout, clearTimeout, ...context }
  vm.createContext(env)
  vm.runInContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText, env)
  return env.exports
}
const helpers = load('native/src/health/appleHealthSources.ts')
const sync = load('native/src/health/appleHealthSync.ts', {require: (name: string) => { assert.equal(name,'./appleHealthSources'); return helpers }})
const tracker = {sourceId:'fixture.tracker',sourceName:'Test Tracker'}
const phone = {sourceId:'fixture.phone',sourceName:'Test Phone'}
const bucket = (quantity: number) => ({value:99999,metadata:[{...tracker,quantity},{...phone,quantity:8000}]})

async function main() {
  assert.equal(helpers.sumAppleHealthSourceQuantity([bucket(20),bucket(10)],tracker.sourceId),30)
  assert.equal(helpers.sumAppleHealthSourceQuantity([bucket(20)],'fixture.absent'),null)
  assert.equal(helpers.sumAppleHealthSourceQuantity([{value:10000,metadata:[]}],tracker.sourceId),null,'omitted zero is unknown, never aggregate fallback')
  assert.equal(helpers.sumAppleHealthSourceQuantity([{value:9000,metadata:[{...tracker,quantity:0}]}],tracker.sourceId),0,'explicit real zero stays zero')
  for (const quantity of [NaN,Infinity,-1,'20',null]) assert.equal(helpers.sumAppleHealthSourceQuantity([bucket(5),bucket(quantity as any)],tracker.sourceId),null,'invalid source bucket invalidates the total')
  assert.equal(helpers.sumAppleHealthSourceQuantity([{metadata:[{...tracker,quantity:10},{...tracker,quantity:10}]}],tracker.sourceId),null,'duplicate source metadata cannot be added twice')
  assert.deepEqual(JSON.parse(JSON.stringify(helpers.discoverAppleHealthSources([[bucket(10)],[],[bucket(20)]]))),[phone,tracker])
  for (const value of [{sourceId:'',sourceName:'bad'},{sourceId:' fixture.tracker',sourceName:'bad'},false,{}]) assert.throws(()=>helpers.validateAppleHealthSource(value))

  let identity: string | null = null, finish: (()=>void) | null = null
  const readIdentities: (string|null)[] = [], saved: any[] = []
  const run = sync.createAppleHealthSync({now:()=>0,read:async(date:string,source:any)=>{
    readIdentities.push(source?.sourceId ?? null)
    if (readIdentities.length===1) await new Promise<void>(resolve=>{finish=resolve})
    return {localDate:date,steps:100,distanceKm:0.1,activeEnergyKcal:10,selectedSource:source}
  },importSummary:async(summary:any)=>saved.push(summary)})
  const opts = {userId:'fixture',token:'fixture',localDate:'2026-10-12',allowed:()=>identity===null}
  const stale = run(opts)
  identity=tracker.sourceId
  const chosen = run({...opts,source:tracker,allowed:()=>identity===tracker.sourceId})
  assert.equal(readIdentities.length,1); (finish as unknown as ()=>void)()
  assert.equal(await stale,null); await chosen
  assert.deepEqual(readIdentities,[null,tracker.sourceId]); assert.equal(saved.length,1); assert.equal(saved[0].selectedSource.sourceId,tracker.sourceId)
  assert.equal(await run({...opts,source:tracker,allowed:()=>true}),null,'same source/day cooldown applies')
  await run({...opts,source:phone,allowed:()=>true}); assert.equal(saved.length,2,'new source is not held by previous source cooldown')
  const unavailable = sync.createAppleHealthSync({read:async(date:string,source:any)=>({localDate:date,steps:null,distanceKm:null,activeEnergyKcal:null,selectedSource:source}),importSummary:async()=>{throw new Error('Missing source cannot post')}})
  assert.equal((await unavailable({...opts,source:tracker,allowed:()=>true})).imported,false)
  const mismatched = sync.createAppleHealthSync({read:async(date:string)=>({localDate:date,steps:1,distanceKm:1,activeEnergyKcal:1,selectedSource:null}),importSummary:async()=>{throw new Error('Aggregate fallback cannot post')}})
  await assert.rejects(mismatched({...opts,source:tracker,allowed:()=>true}),/different source/)
  for (const revokeDiscovery of [false,true]) {
    let finishImport:(()=>void)|null=null, discoveryAllowed=true, discoverCount=0, postCount=0
    const serialized=sync.createAppleHealthSync({
      read:async(date:string,source:any)=>{await new Promise<void>(resolve=>{finishImport=resolve});return{localDate:date,steps:1,distanceKm:1,activeEnergyKcal:1,selectedSource:source}},
      importSummary:async()=>{postCount++},discover:async()=>{discoverCount++;return[tracker]},
    })
    const importing=serialized({...opts,source:tracker,allowed:()=>true})
    const discovering=serialized.readSources({...opts,allowed:()=>discoveryAllowed})
    assert.equal(discoverCount,0,'source discovery shares the import read lock')
    if(revokeDiscovery)discoveryAllowed=false
    ;(finishImport as unknown as ()=>void)();await importing
    const found=await discovering
    assert.equal(discoverCount,revokeDiscovery?0:1);assert.equal(found.length,revokeDiscovery?0:1)
    assert.equal(postCount,1,'source discovery never imports an extra row')
  }

  const provider = fs.readFileSync('native/src/health/AppleHealthSyncProvider.tsx','utf8')
  const ast=ts.createSourceFile('provider.tsx',provider,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX)
  const declarations: Record<string,string>={}
  let hydrateCode=''
  function visit(node:ts.Node){
    if(ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name)&&['setSource','readSources','refresh','setEnabled'].includes(node.name.text))declarations[node.name.text]=node.getText(ast)
    if(ts.isCallExpression(node)&&node.arguments[0]&&node.expression.getText(ast)==='useEffect'&&node.arguments[0].getText(ast).includes('appleHealthSourceKey(userId)'))hydrateCode=node.arguments[0].getText(ast)
    ts.forEachChild(node,visit)
  } visit(ast)
  const writes:{key:string;value:string;finish:()=>void}[]=[], displayed:any[]=[]
  let finishDiscovery:(()=>void)|null=null
  const context:any={exports:{},Date,Promise,setTimeout,clearTimeout,userId:'fixture',token:'fixture',current:{current:{userId:'fixture',token:'fixture',source:null,revision:0,enabled:true}},preferenceWrites:{current:Promise.resolve()},
    useCallback:(fn:any)=>fn,validateAppleHealthSource:helpers.validateAppleHealthSource,appleHealthSourceKey:sync.appleHealthSourceKey,
    updateEnabled:()=>{},updateSource:(value:any)=>displayed.push(value),setResult:()=>{},setReady:()=>{},setError:()=>{},isAppleHealthSupportedDevice:()=>true,
    AsyncStorage:{setItem:async(key:string,value:string)=>new Promise<void>(resolve=>writes.push({key,value,finish:resolve}))},
    runSync:{readSources:async(opts:any)=>{await new Promise<void>(resolve=>{finishDiscovery=resolve});return opts.allowed() ? [tracker] : []}},
  }
  vm.createContext(context);vm.runInContext(ts.transpileModule(`const ${declarations.setSource};const ${declarations.readSources};exports.select=setSource;exports.discover=readSources`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context)
  const first=context.exports.select(tracker),second=context.exports.select(null)
  assert.equal(context.current.current.source,null,'latest selection invalidates older reads immediately')
  await new Promise(resolve=>setImmediate(resolve));writes[0].finish();await first
  await new Promise(resolve=>setImmediate(resolve));writes[1].finish();await second
  assert.deepEqual(writes.map(write=>JSON.parse(write.value)),[tracker,null]);assert.ok(writes.every(write=>write.key===sync.appleHealthSourceKey('fixture')))
  assert.equal(context.current.current.source,null,'late preference cannot resurrect old source')
  const count=writes.length,rev=context.current.current.revision
  const discovery=context.exports.discover('2026-10-12');context.current.current.revision++;(finishDiscovery as unknown as ()=>void)()
  assert.deepEqual(JSON.parse(JSON.stringify(await discovery)),[],'late discovery after selection change is discarded')
  assert.equal(writes.length,count);assert.equal(context.current.current.revision,rev+1,'discovery neither changes preferences nor revision')
  assert.ok(!provider.includes('initHealthKit')&&!provider.includes('appleHealthConnectAndReadToday'))
  assert.notEqual(sync.appleHealthSourceKey('fixture'),sync.appleHealthSourceKey('other-account'))
  for (const scenario of ['success','failure','rapid-failure','off','switch']) {
    let reads=0, posts=0
    const storage:{finish:()=>void;fail:()=>void}[]=[]
    const operationContext:any={exports:{},Promise,source:phone,ready:true,userId:'fixture',token:'fixture',
      current:{current:{userId:'fixture',token:'fixture',enabled:true,source:phone,savedSource:phone,savedSourceHydrated:true,sourceHydrated:true,sourcePending:null,revision:0,sourceRevision:0,enabledRevision:0}},preferenceWrites:{current:Promise.resolve()},
      useCallback:(fn:any)=>fn,validateAppleHealthSource:helpers.validateAppleHealthSource,appleHealthSourceKey:sync.appleHealthSourceKey,appleHealthAutoKey:sync.appleHealthAutoKey,
      updateSource:()=>{},updateEnabled:()=>{},setResult:()=>{},setBusy:()=>{},setError:()=>{},setReady:(value:boolean)=>{operationContext.ready=value},isAppleHealthSupportedDevice:()=>true,DeviceEventEmitter:{emit:()=>{}},
      AsyncStorage:{setItem:async()=>new Promise<void>((resolve,reject)=>storage.push({finish:resolve,fail:()=>reject(new Error('Fixture storage failure'))}))},
      runSync:sync.createAppleHealthSync({read:async(date:string,source:any)=>{reads++;return{localDate:date,steps:1,distanceKm:1,activeEnergyKcal:1,selectedSource:source}},importSummary:async()=>{posts++}}),
    }
    vm.createContext(operationContext)
    vm.runInContext(ts.transpileModule(`const ${declarations.setSource};const ${declarations.refresh};const ${declarations.setEnabled};exports.select=setSource;exports.refresh=refresh;exports.enable=setEnabled`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,operationContext)
    const choosing=operationContext.exports.select(tracker)
    const checkedChoice=choosing.then(()=>true,()=>false)
    operationContext.ready=true // Simulate a caller retaining the previous ready callback.
    assert.equal(await operationContext.exports.refresh(true,'2026-10-12'),null)
    assert.equal(await operationContext.exports.refresh(false,'2026-10-12'),null)
    assert.equal(reads,0);assert.equal(posts,0,'no manual/automatic read or post before preference save')
    await new Promise(resolve=>setImmediate(resolve))
    if(scenario==='rapid-failure') {
      const next=operationContext.exports.select(null);const checkedNext=next.then(()=>true,()=>false)
      storage[0].fail();assert.equal(await checkedChoice,false)
      await new Promise(resolve=>setImmediate(resolve));assert.equal(await operationContext.exports.refresh(true,'2026-10-12'),null)
      storage[1].fail();assert.equal(await checkedNext,false)
      assert.equal(operationContext.current.current.source.sourceId,phone.sourceId,'multiple failed choices restore last persisted source, not earlier failed choice')
      assert.equal(reads,0);assert.equal(posts,0)
    } else if(scenario==='failure') {
      storage[0].fail();assert.equal(await checkedChoice,false)
      assert.equal(operationContext.current.current.source.sourceId,phone.sourceId)
      assert.equal(posts,0)
    } else if(scenario==='off') {
      const off=operationContext.exports.enable(false)
      storage[0].finish();await checkedChoice
      await new Promise(resolve=>setImmediate(resolve));storage[1].finish();await off
      assert.equal(await operationContext.exports.refresh(false,'2026-10-12'),null);assert.equal(posts,0,'turning off during save prevents later automatic publication')
    } else if(scenario==='switch') {
      operationContext.current.current={userId:'other',token:'other',source:phone,sourcePending:null,revision:99,enabled:true}
      storage[0].finish();await checkedChoice
      assert.equal(await operationContext.exports.refresh(true,'2026-10-12'),null);assert.equal(posts,0,'old account save completion cannot publish to new account')
    } else {
      storage[0].finish();assert.equal(await checkedChoice,true)
      assert.equal(operationContext.current.current.sourcePending,null)
      await operationContext.exports.refresh(true,'2026-10-12')
      assert.equal(reads,1);assert.equal(posts,1,'latest successful save permits exact-source publication')
    }
  }
  for (const scenario of ['normal','off','choice','corrupt']) {
    const current={current:{userId:'fixture',token:'fixture',enabled:false,source:null as any,savedSource:null,savedSourceHydrated:false,sourceHydrated:false,sourcePending:null,revision:0,enabledRevision:0,sourceRevision:0}}
    const pending:Record<string,(value:string)=>void>={}, choices:any[]=[], enabled:boolean[]=[], ready:boolean[]=[], errors:any[]=[]
    const hydration:any={exports:{},Promise,userId:'fixture',token:'fixture',current,validateAppleHealthSource:helpers.validateAppleHealthSource,appleHealthAutoKey:sync.appleHealthAutoKey,appleHealthSourceKey:sync.appleHealthSourceKey,
      setStateUserId:()=>{},updateSource:(value:any)=>choices.push(value),updateEnabled:(value:boolean)=>enabled.push(value),setReady:(value:boolean)=>ready.push(value),setResult:()=>{},setError:(value:any)=>errors.push(value),setBusy:()=>{},isAppleHealthSupportedDevice:()=>true,
      AsyncStorage:{getItem:async(key:string)=>new Promise<string>(resolve=>{pending[key]=resolve})},
    }
    vm.createContext(hydration);vm.runInContext(ts.transpileModule(`exports.hydrate=${hydrateCode}`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,hydration)
    hydration.exports.hydrate()
    assert.equal(current.current.enabled,false);assert.deepEqual(ready,[false],'automatic stays disabled until both stored choices hydrate')
    if(scenario==='off'){current.current.enabledRevision++;current.current.revision++}
    if(scenario==='choice'){current.current.source=phone;current.current.sourceRevision++;current.current.revision++}
    pending[sync.appleHealthAutoKey('fixture')]('1')
    await new Promise(resolve=>setImmediate(resolve));assert.equal(current.current.enabled,false,'auto flag alone cannot start aggregate reading')
    pending[sync.appleHealthSourceKey('fixture')](scenario==='corrupt' ? '{invalid' : JSON.stringify(tracker))
    await new Promise(resolve=>setImmediate(resolve))
    assert.equal(current.current.enabled,scenario!=='off'&&scenario!=='corrupt')
    if(scenario==='corrupt'){assert.ok(errors.some(Boolean),'invalid stored source stops automatic rather than becoming aggregate');assert.equal(ready[ready.length-1],false,'corrupt source cannot become a manual aggregate fallback')}
    else assert.equal(current.current.source?.sourceId,scenario==='choice'?phone.sourceId:tracker.sourceId,'delayed hydrate preserves new choice while independently restoring unchanged auto flag')
  }
  console.log('PASS: exact app-source metadata excludes phone/aggregate fallback, preserves missing versus zero, serializes source changes, saves account-specific choices and discards stale read-only discovery.')
}
main().catch(error=>{console.error(error);process.exitCode=1})
