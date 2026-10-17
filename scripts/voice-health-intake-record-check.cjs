#!/usr/bin/env node
'use strict'
// Actual helper, normalizer branch and authenticated API branch source against
// synthetic owned rows only. No real app/provider imports or database access.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),crypto=require('node:crypto')
const root=path.resolve(__dirname,'..')
const relative='lib/native-voice-health-intake-record-actions.ts'
const source=fs.readFileSync(path.join(root,relative),'utf8')
const box={exports:{}}
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText,{module:box,exports:box.exports,URL,Headers,require:name=>{
 if(name==='crypto')return crypto
 if(name==='next/server')return {NextRequest:class {constructor(){throw Error('Real route imports forbidden')}}}
 throw Error('Forbidden runtime dependency '+name)
}})
const api=box.exports,copy=value=>JSON.parse(JSON.stringify(value)),user='synthetic-user'
let state,calls,writeMode
const row=(id,name,dosage,userId=user)=>({id,userId,name,dosage,timing:['Morning'],imageUrl:'synthetic-original-photo',createdAt:'2026-10-17T00:00:00Z',updatedAt:'2026-10-17T00:00:00Z'})
function client(get){
 const db={}
 for(const entity of ['supplement','medication']){
  const match=(r,w)=>Object.entries(w).every(([k,v])=>String(r[k])===String(v))
  db[entity]={findMany:async({where})=>copy(get()[entity].filter(r=>match(r,where))),findFirst:async({where})=>copy(get()[entity].find(r=>match(r,where))||null),
   updateMany:async({where,data})=>{const found=get()[entity].filter(r=>match(r,where));found.forEach(r=>Object.assign(r,data,{updatedAt:'2026-10-17T00:01:00Z'}));return{count:found.length}},
   deleteMany:async({where})=>{const before=get()[entity].length;get()[entity]=get()[entity].filter(r=>!match(r,where));return{count:before-get()[entity].length}}}
 }
 return db
}
const db=client(()=>state)
db.$transaction=async run=>{const working=copy(state);const result=await run(client(()=>working));state=working;return result}
const request={url:'https://helfi.invalid/api/native/voice-assistant',headers:new Headers({authorization:'synthetic-original-auth'})}
const io=async(req,method,body)=>{assert.equal(req,request);calls.push({method,body});if(method==='GET')return api.readNativeVoiceHealthIntakeRecords(db,user);if(writeMode==='ignore')return{success:true};return api.mutateNativeVoiceHealthIntakeRecord(db,user,body.voiceHealthIntakeMutation)}
const prepare=(entity,operation,query,changes={})=>api.prepareNativeVoiceHealthIntakeRecordAction(request,user,{entity,operation,query,changes,localDate:'2026-10-17'},io)
let count=0
async function check(name,fn){state={supplement:[row('supp','Vitamin D','1000 IU')],medication:[row('med','Metformin','500 mg'),row('foreign','Foreign drug','1 mg','other-user')]};calls=[];writeMode='save';await fn();count++;console.log('PASS '+name)}
async function run(){
await check('factual administrative wording is separate from medication advice',async()=>{
 for(const text of ['Remove Vitamin D from my recorded list','Correct the recorded dosage of Metformin to 500 mg','Change the name in my supplement list'])assert.equal(api.isFactualHealthIntakeRecordRequest(text),true,text)
 for(const text of ['Should I stop Metformin?','Should we remove Metformin from my recorded list?','Increase Metformin in my recorded list','Is it safe to change my recorded dosage?','Change my medication dose','Do not remove Vitamin D from my recorded list'])assert.equal(api.isFactualHealthIntakeRecordRequest(text),false,text)
 for(const [spoken,value] of [['500 milligrams','500 mg'],['500milligrams','500 mg'],['50 micrograms','50 mcg'],['2 grams','2 g']])assert.equal(api.hasExplicitHealthIntakeRecordChanges(`Correct the recorded dosage to ${spoken}`,{dosage:value}),true)
 for(const [spoken,value] of [['500 grams','500 mg'],['0.5 grams','500 mg'],['1500 milligrams','500 mg'],['0.5 milligrams','5 mg'],['-500 mg','500 mg'],['','500 mg']])assert.equal(api.hasExplicitHealthIntakeRecordChanges(`Correct the recorded dosage ${spoken}`,{dosage:value}),false)
})
await check('scoped read returns only owned stable identities and user-bound versions',async()=>{
 const result=await api.readNativeVoiceHealthIntakeRecords(db,user);assert.equal(result.records.length,2);assert(!result.records.some(r=>r.id==='foreign'));assert(result.records.every(r=>/^[a-f0-9]{64}$/.test(r.version)))
})
await check('prepare does not write and exact correction preserves omitted fields/catalogs',async()=>{
 const same=await prepare('medication','update','Metformin',{dosage:'500 mg'});assert.equal(same.canConfirm,false);calls=[]
 const p=await prepare('medication','update','Metformin',{dosage:'750 mg'});assert.equal(p.canConfirm,true);assert.match(p.confirmationMessage,/dosage to 750 mg/);assert.equal(calls.length,1);assert.equal(state.medication[0].dosage,'500 mg')
 const result=await api.executeNativeVoiceHealthIntakeRecordAction(request,user,p.recordAction,io)
 assert.equal(result.kind,'medication');assert.equal(state.medication[0].dosage,'750 mg');assert.deepEqual(state.medication[0].timing,['Morning']);assert.equal(state.medication[0].imageUrl,'synthetic-original-photo');assert.equal(state.medication[1].name,'Foreign drug')
})
await check('same-name strengths require choice and retain requested correction',async()=>{
 state.medication.push(row('second','Metformin','750 mg'));const p=await prepare('medication','delete','Metformin')
 assert.equal(p.canConfirm,false);assert.equal(p.recordAction.choices.length,2);assert.equal(calls.filter(c=>c.method==='POST').length,0)
 const exact=await prepare('medication','update','Metformin 750 mg',{timing:['Evening']});assert.equal(exact.canConfirm,true);assert.equal(exact.recordAction.id,'second')
})
await check('last recorded supplement can be removed without bulk list writes',async()=>{
 const p=await prepare('supplement','delete','Vitamin D');await api.executeNativeVoiceHealthIntakeRecordAction(request,user,p.recordAction,io)
 assert.equal(state.supplement.length,0);assert.equal(state.medication.length,2)
})
await check('stale reviews, foreign IDs and unsupported fields reject before mutation',async()=>{
 const p=await prepare('medication','update','Metformin',{timing:[]});state.medication[0].dosage='250 mg'
 await assert.rejects(()=>api.executeNativeVoiceHealthIntakeRecordAction(request,user,p.recordAction,io),/changed/)
 const foreign=await api.prepareNativeVoiceHealthIntakeRecordAction(request,user,{entity:'medication',operation:'delete',id:'foreign',changes:{}},io);assert.equal(foreign.canConfirm,false)
 for(const changes of [{userId:'other-user'},{imageUrl:'https://invalid'},{timing:'Evening'},{name:''}])assert.equal((await prepare('medication','update','Metformin',changes)).canConfirm,false)
})
await check('false-success handler cannot claim a recorded correction was saved',async()=>{
 const p=await prepare('medication','update','Metformin',{dosage:'750 mg'});writeMode='ignore'
 await assert.rejects(()=>api.executeNativeVoiceHealthIntakeRecordAction(request,user,p.recordAction,io),/not confirmed/)
})
await check('actual authenticated user-data branches isolate selected write and other account',async()=>{
 const raw=fs.readFileSync(path.join(root,'app/api/user-data/route.ts'),'utf8'),ast=ts.createSourceFile('user-data.ts',raw,ts.ScriptTarget.Latest,true)
 let getBranch,postBranch
 function visit(n){if(ts.isIfStatement(n)){const condition=n.expression.getText(ast);if(condition===`scope === 'voice-health-intake'`)getBranch=n;if(condition===`Object.prototype.hasOwnProperty.call(data || {}, 'voiceHealthIntakeMutation')`)postBranch=n}ts.forEachChild(n,visit)}visit(ast)
 assert(getBranch&&postBranch)
 let regens=0
 const context={...api,prisma:{...db,user:{findUnique:async({where})=>({id:where.email==='other@example.invalid'?'other-user':user})}},triggerBackgroundRegeneration:async()=>{regens++},NextResponse:{json:(data,options)=>({data,status:options?.status||200})}}
 vm.createContext(context)
 vm.runInContext(ts.transpileModule(`async function scopedGet(user){const scope='voice-health-intake';const readOnly=false;${getBranch.getText(ast)}}\nasync function scopedPost(data,userEmail){${postBranch.getText(ast)}}`,{compilerOptions:{module:ts.ModuleKind.None,target:ts.ScriptTarget.ES2020}}).outputText,context)
 const current=(await context.scopedGet({id:user})).data.records.find(r=>r.id==='supp')
 const mutation={entity:'supplement',operation:'delete',id:'supp',beforeHash:current.version,changes:{}}
 assert.equal((await context.scopedPost({voiceHealthIntakeMutation:mutation},'other@example.invalid')).status,409)
 assert.equal(state.supplement.length,1)
 assert.equal((await context.scopedPost({voiceHealthIntakeMutation:mutation,medications:[]},'test@example.invalid')).status,400)
 assert.equal((await context.scopedPost({voiceHealthIntakeMutation:mutation},'test@example.invalid')).status,200)
 assert.equal(state.supplement.length,0);assert.equal(regens,1)
})
await check('normalizer enforces independent factual gate and normal manual rename pair',async()=>{
 const route=fs.readFileSync(path.join(root,'app/api/native/voice-assistant/route.ts'),'utf8'),ast=ts.createSourceFile('route.ts',route,ts.ScriptTarget.Latest,true)
 const normalizer=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='normalizeDraft')
 const branch=normalizer.body.statements.find(n=>ts.isIfStatement(n)&&n.expression.getText(ast)===`parsedAction === 'record_action'`)
 const context={...api,normalizeVoiceTimeZone:()=> 'UTC',cleanText:v=>String(v||''),prepareNativeVoiceRecordAction:async(_req,_user,raw)=>({canConfirm:true,recordAction:raw})}
 vm.createContext(context)
 vm.runInContext(ts.transpileModule(`async function normalizeRecord(command,transcript){const parsedAction='record_action',parsed={recordAction:command},actionRequest={},userId='synthetic-user',localDate='2026-10-17',country='AU',actionTimeZone='UTC';${branch.getText(ast)}}`,{compilerOptions:{module:ts.ModuleKind.None,target:ts.ScriptTarget.ES2020}}).outputText,context)
 const command={entity:'medication',operation:'update',changes:{dosage:'750 mg'}}
 assert.equal((await context.normalizeRecord(command,'Should I change Metformin?')).draft.canConfirm,false)
 assert.equal((await context.normalizeRecord(command,'Correct the recorded dosage to 750 mg')).draft.canConfirm,true)
 assert.equal((await context.normalizeRecord(command,'Correct the recorded dosage')).draft.canConfirm,false)
 assert.equal((await context.normalizeRecord(command,'Correct the recorded dosage to 1750 mg')).draft.canConfirm,false)
 assert.equal((await context.normalizeRecord({entity:'medication',operation:'update',changes:{dosage:''}},'Clear the recorded dose')).draft.canConfirm,true)
 const rename=await context.normalizeRecord({entity:'food',operation:'update',changes:{name:'Test lunch'}},'Rename this meal')
 assert.equal(rename.draft.recordAction.changes.description,'Test lunch')
 const favorite=await context.normalizeRecord({entity:'favorite',operation:'update',changes:{label:'My lunch'}},'Rename favorite')
 assert.equal(favorite.draft.recordAction.changes.description,'My lunch')
})
console.log(`Voice Health Intake records: ${count} actual-source offline groups passed; no real account, provider or database access.`)
}
run().catch(error=>{console.error(error);process.exitCode=1})
