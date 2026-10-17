#!/usr/bin/env node
'use strict'
// Actual durable adapter, entirely synthetic transactional token table.
// No Prisma bootstrap, database connection, environment, provider or network.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),crypto=require('node:crypto')
const code=ts.transpileModule(fs.readFileSync(path.resolve(__dirname,'../lib/native-assistant-session-store.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,exportsForStore={}
new Function('exports','require',code)(exportsForStore,id=>{if(id==='crypto')return crypto;throw Error('Forbidden bootstrap '+id)})
const {createPrismaAssistantSessionStore}=exportsForStore,copy=value=>structuredClone(value),deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r});return{promise,resolve}}
function database(){
 let rows=new Map(),tail=Promise.resolve(),failCreateMany=false,skipCreateMany=false
 const matches=(row,where)=>Object.entries(where||{}).every(([key,value])=>value&&typeof value==='object'&&!(value instanceof Date)?Object.entries(value).every(([op,expected])=>op==='startsWith'?String(row[key]).startsWith(expected):op==='gt'?new Date(row[key]).getTime()>new Date(expected).getTime():op==='lte'?new Date(row[key]).getTime()<=new Date(expected).getTime():false):row[key]===value)
 const table=state=>({
  findUnique:async({where})=>copy([...state().values()].find(row=>matches(row,where))||null),
  findMany:async({where})=>copy([...state().values()].filter(row=>matches(row,where))),
  deleteMany:async({where})=>{let count=0;for(const [token,row]of state())if(matches(row,where)){state().delete(token);count++}return{count}},
  create:async({data})=>{if(state().has(data.token)){const error=Error('Synthetic unique key');error.code='P2002';throw error}state().set(data.token,copy(data));return copy(data)},
  createMany:async({data})=>{if(failCreateMany)throw Error('Synthetic insert failure');const selected=skipCreateMany?data.slice(0,-1):data;for(const row of selected){if(state().has(row.token))throw Error('Synthetic duplicate');state().set(row.token,copy(row))}return{count:selected.length}},
  upsert:async({where,create,update})=>{const before=state().get(where.token),row=before?{...before,...copy(update)}:copy(create);state().set(row.token,row);return copy(row)},
  updateMany:async({where,data})=>{let count=0;for(const [token,row]of state())if(matches(row,where)){state().set(token,{...row,...copy(data)});count++}return{count}},
 })
 const db={verificationToken:table(()=>rows),async $transaction(work){const previous=tail,release=deferred();tail=release.promise;await previous;const original=rows;let draft=new Map([...rows].map(([key,value])=>[key,copy(value)]));try{const result=await work({verificationToken:table(()=>draft)});rows=draft;return result}catch(error){rows=original;throw error}finally{release.resolve()}}}
 return{db,rows:()=>rows,setRows:value=>{rows=value},failCreate:value=>{failCreateMany=value},shortCreate:value=>{skipCreateMany=value}}
}
function setup(customOptions={}){const f=database();let tick=Date.UTC(2026,9,17);const options={now:()=>tick,leaseMs:10000,renewEveryMs:1000,...customOptions},make=()=>createPrismaAssistantSessionStore(f.db,options);return{...f,make,adapter:make(),advance:ms=>{tick+=ms},now:()=>tick}}
const session=(id='owned-session',actorId='owner',revision=1,text='Literal saved data')=>({id,actorId,revision,status:'active',steps:[{id:'write',operation:'journal.create',values:{text},status:'review'}]})
const persist=(f,value=session())=>f.adapter.store.runExclusive(value.actorId,value.id,async(_stored,save)=>save(value))
let groups=0
async function check(name,run){await run();groups++;console.log('PASS '+name)}
async function run(){
 await check('restart reads exact owned Unicode payload from bounded ASCII chunks without leaking into indexed IDs',async()=>{
  const f=setup(),text='Exact synthetic health note 🧪\n'.repeat(1000),value=session('owned-session','owner',1,text);await persist(f,value)
  const restarted=f.make();assert.deepEqual(await restarted.readSession('owner','owned-session'),value);assert.equal(await restarted.readSession('other','owned-session'),null)
  for(const row of f.rows().values()){assert(!row.identifier.includes('Exact synthetic health'));assert(/^[\x20-\x7E]+$/.test(row.identifier));assert(row.identifier.length<1500)}
 })
 await check('same-account plan lease excludes concurrent holders while another account remains independent',async()=>{
  const f=setup(),entered=deferred(),release=deferred(),first=f.adapter.store.runExclusive('owner','owned-session',async()=>{entered.resolve();await release.promise})
  await entered.promise;await assert.rejects(()=>f.adapter.store.runExclusive('owner','owned-session',async()=>{}),error=>error.code==='assistant_busy')
  await f.adapter.store.runExclusive('other','owned-session',async(_value,save)=>save(session('owned-session','other')));release.resolve();await first
  assert.equal((await f.adapter.readSession('other','owned-session')).actorId,'other')
 })
 await check('revision compare refuses invalid and stale writes without replacing the current generation',async()=>{
  const f=setup();await persist(f);await assert.rejects(()=>f.adapter.store.runExclusive('owner','owned-session',async(_stored,save)=>save(session('owned-session','owner',3,'Invalid revision'))),error=>error.code==='assistant_storage_invalid')
  assert.equal((await f.adapter.readSession('owner','owned-session')).revision,1)
  await f.adapter.store.runExclusive('owner','owned-session',async(value,save)=>{value.revision=2;value.steps[0].values.text='Exact changed note';await save(value)})
  assert.equal((await f.adapter.readSession('owner','owned-session')).steps[0].values.text,'Exact changed note')
 })
 await check('missing or altered chunk refuses recovery instead of returning a partial conversation',async()=>{
  for(const mode of ['missing','changed']){const f=setup();await persist(f,session('owned-session','owner',1,'x'.repeat(3000)));const entry=[...f.rows()].find(([,row])=>row.identifier.startsWith('assistant-chunk:'));if(mode==='missing')f.rows().delete(entry[0]);else entry[1].identifier=entry[1].identifier.slice(0,-1)+(entry[1].identifier.endsWith('A')?'B':'A');await assert.rejects(()=>f.adapter.readSession('owner','owned-session'),error=>error.code==='assistant_storage_invalid')}
 })
 await check('chunk identity, manifest count and owner envelope corruption cannot produce valid stored state',async()=>{
  for(const mode of ['token','count','actor']){const f=setup();await persist(f);const manifest=[...f.rows()].find(([,row])=>row.identifier.startsWith('assistant-value:')),chunk=[...f.rows()].find(([,row])=>row.identifier.startsWith('assistant-chunk:'))
   if(mode==='token'){f.rows().delete(chunk[0]);chunk[1].token='wrong-token';f.rows().set('wrong-token',chunk[1])}
   if(mode==='count'){const start=manifest[1].identifier.indexOf('{'),marker=JSON.parse(manifest[1].identifier.slice(start));marker.count++;manifest[1].identifier=manifest[1].identifier.slice(0,start)+JSON.stringify(marker)}
   if(mode==='actor'){const start=manifest[1].identifier.indexOf('{'),marker=JSON.parse(manifest[1].identifier.slice(start)),payload=JSON.parse(Buffer.from(chunk[1].identifier.slice(chunk[1].identifier.lastIndexOf(':')+1),'base64').toString());payload.actorId='other';const text=JSON.stringify(payload),encoded=Buffer.from(text).toString('base64');marker.bytes=Buffer.byteLength(text);marker.sha256=crypto.createHash('sha256').update(text).digest('hex');chunk[1].identifier=chunk[1].identifier.slice(0,chunk[1].identifier.lastIndexOf(':')+1)+encoded;manifest[1].identifier=manifest[1].identifier.slice(0,start)+JSON.stringify(marker)}
   await assert.rejects(()=>f.adapter.readSession('owner','owned-session'),error=>error.code==='assistant_storage_invalid')
  }
 })
 await check('atomic chunk insert/readback failure rolls back to the exact earlier generation',async()=>{
  for(const mode of ['throw','partial']){const f=setup();await persist(f);const before=copy(f.rows());if(mode==='throw')f.failCreate(true);else f.shortCreate(true)
   await assert.rejects(()=>f.adapter.store.runExclusive('owner','owned-session',async(value,save)=>{value.revision++;value.steps[0].values.text='Replacement';await save(value)}));assert.deepEqual(f.rows(),before);assert.equal((await f.adapter.readSession('owner','owned-session')).revision,1)
  }
 })
 await check('oversized payload never replaces existing source or unrelated app tokens',async()=>{
  const f=setup();f.rows().set('normal-token',{token:'normal-token',identifier:'ordinary existing app token',expires:new Date(f.now()+100000)});await persist(f);const before=copy(f.rows())
  await assert.rejects(()=>f.adapter.store.runExclusive('owner','owned-session',async(value,save)=>{value.revision++;value.steps[0].values.text='x'.repeat(220000);await save(value)}),error=>error.code==='assistant_storage_invalid');assert.deepEqual(f.rows(),before)
 })
 await check('expired or stolen lease fences the older worker before another durable persist',async()=>{
  const f=setup(),entered=deferred(),release=deferred(),worker=f.adapter.store.runExclusive('owner','owned-session',async(_value,save)=>{entered.resolve();await release.promise;await save(session())})
  await entered.promise;f.advance(10001);await f.adapter.store.runExclusive('owner','owned-session',async(_value,save)=>save(session('owned-session','owner',1,'New holder only')));release.resolve();await assert.rejects(()=>worker,error=>error.code==='assistant_lease_lost')
  assert.equal((await f.adapter.readSession('owner','owned-session')).steps[0].values.text,'New holder only')
 })
 await check('owned history appends survive restart and preserve literal turns in order',async()=>{
  const f=setup();await f.adapter.conversation.append('owner','owned-session',{role:'user',text:'Literal user content'});await f.adapter.conversation.append('owner','owned-session',{role:'assistant',text:'Exact clarification'})
  assert.deepEqual(await f.make().conversation.read('owner','owned-session'),[{actorId:'owner',sessionId:'owned-session',role:'user',text:'Literal user content'},{actorId:'owner',sessionId:'owned-session',role:'assistant',text:'Exact clarification'}]);assert.deepEqual(await f.adapter.conversation.read('other','owned-session'),[])
  await assert.rejects(()=>f.adapter.conversation.append('owner','owned-session',{role:'assistant',text:'x'.repeat(24001)}),error=>error.code==='assistant_storage_invalid');assert.equal((await f.adapter.conversation.read('owner','owned-session')).length,2)
 })
 await check('expired owned payload cannot be replayed as a current plan',async()=>{const f=setup();await persist(f);f.advance(24*60*60*1000+1);assert.equal(await f.adapter.readSession('owner','owned-session'),null)})
 await check('lease renewal keeps a long request exclusive across its original expiry',async()=>{
  const f=setup({leaseMs:1000,renewEveryMs:20}),entered=deferred(),release=deferred(),worker=f.adapter.store.runExclusive('owner','owned-session',async(_value,save)=>{entered.resolve();await release.promise;await save(session())})
  await entered.promise;for(let i=0;i<4;i++){f.advance(400);await new Promise(resolve=>setTimeout(resolve,30))}
  await assert.rejects(()=>f.adapter.store.runExclusive('owner','owned-session',async()=>{}),error=>error.code==='assistant_busy');release.resolve();await worker;assert.equal((await f.adapter.readSession('owner','owned-session')).revision,1)
 })
 await check('expired turn guard refuses the older continuation before planner or app dispatch',async()=>{
  const bridgeExports={},bridgeCode=ts.transpileModule(fs.readFileSync(path.resolve(__dirname,'../lib/native-assistant-tool-bridge.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText
  new Function('exports','require',bridgeCode)(bridgeExports,id=>{throw Error('Forbidden bridge dependency '+id)})
  for(const phase of ['planner','authorization','direct']){
   const f=setup(),entered=deferred(),release=deferred();let effects=0,planners=0
   const runtime={discover:()=>[],plannerSnapshot:()=>null,handle:async()=>{effects++;return{status:'completed'}}}
   const bridge=bridgeExports.createAssistantToolBridge({runtime,plannerKind:'synthetic',runTurnExclusive:f.adapter.runTurnExclusive,readSession:async()=>null,conversation:f.adapter.conversation,authorizePlanning:async()=>{},authorizeCommand:async()=>{if(phase==='authorization'||phase==='direct'){entered.resolve();await release.promise}},planner:async()=>{planners++;if(phase==='planner'){entered.resolve();await release.promise}return{command:{type:'advance'}}}})
   const context={actorId:'owner',localDate:'2026-10-17',capabilities:[]},worker=phase==='direct'?bridge.dispatch(context,'owned-session',{type:'advance'},{channel:'control',controlId:'synthetic'}):bridge.turn(context,'owned-session',{channel:'typed',text:'Synthetic turn'})
   await entered.promise;f.advance(10001);await f.adapter.runTurnExclusive('owner','owned-session',async guard=>guard());release.resolve();await assert.rejects(()=>worker,error=>error.code==='assistant_lease_lost');assert.equal(effects,0);assert.equal(planners,phase==='direct'?0:1)
  }
 })
 console.log(`VOICE 2 durable store: ${groups} actual-source synthetic transactional groups passed. No real database or account writes.`)
}
if(require.main===module)run().catch(error=>{console.error(error);process.exitCode=1})
module.exports={database,setup,run}
