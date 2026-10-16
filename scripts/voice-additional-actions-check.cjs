#!/usr/bin/env node
'use strict'
// Actual fixed helper + normal chat/image handlers and exact normal device-
// interest field blocks. Synthetic accounts/storage/SQL only; no app startup,
// provider, real database/file deletion, credentials or environment files.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),crypto=require('node:crypto')
const root=path.resolve(__dirname,'..'),owner='synthetic-user',copy=value=>JSON.parse(JSON.stringify(value)),now='2026-10-17T00:00:00.000Z'
const compile=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText
class NextRequest extends Request{}
const server={NextRequest,NextResponse:{json:(body,options)=>new Response(JSON.stringify(body),{status:options?.status||200,headers:{'content-type':'application/json'}})}}
let state,sessionId,nativeId,mode,mutations,calls,step
function load(relative,deps={},extra={}){const module={exports:{}};vm.runInNewContext(compile(fs.readFileSync(path.join(root,relative),'utf8')),{module,exports:module.exports,URL,Headers,Request,Response,Date,Buffer,crypto,console:{error(){},warn(){},log(){}},process:{env:{NODE_ENV:'test',AUTH_SECRET:'synthetic-additional-review-key'}},require:name=>{if(Object.hasOwn(deps,name))return deps[name];throw Error('Forbidden dependency '+name)},...extra},{filename:relative});return module.exports}
const session=async()=>sessionId?{user:{id:sessionId,email:`${sessionId}@example.invalid`}}:null
const native=async request=>request.headers.get('authorization')==='Bearer synthetic-normal-token'?nativeId:null
const actor=()=>sessionId||nativeId
const shared={'next/server':server,'next-auth':{getServerSession:session},'@/lib/auth':{authOptions:{}},'@/lib/native-auth':{getUserIdFromNativeAuth:native}}
const prisma={user:{findUnique:async({where})=>{const id=where.id||where.email?.split('@')[0];return id?{id}:null}},healthGoal:{
 findFirst:async({where})=>state.interests[where.userId]?{id:'interest-'+where.userId,userId:where.userId,category:JSON.stringify(state.interests[where.userId])}:null,
 update:async({where,data})=>{if(mode==='failure')throw Error('PRIVATE interest failure');const id=where.id.slice(9);mutations.push({domain:'devices',id});if(mode!=='ignored')state.interests[id]=JSON.parse(data.category);return{id:where.id}},
 create:async({data})=>{mutations.push({domain:'devices',id:data.userId});if(mode!=='ignored')state.interests[data.userId]=JSON.parse(data.category);return{id:'interest-'+data.userId}}},
 medicalImageAnalysis:{findMany:async({where})=>state.images.filter(row=>row.userId===where.userId).map(row=>({...copy(row),createdAt:new Date(row.createdAt)})),findFirst:async({where})=>copy(state.images.find(row=>row.userId===where.userId&&row.id===where.id)||null),delete:async({where})=>{if(mode==='failure')throw Error('PRIVATE health image content');mutations.push({domain:'health-images',id:where.id});if(mode!=='ignored')state.images=state.images.filter(row=>row.id!==where.id);return{id:where.id}}},file:{deleteMany:async()=>({count:0})},$transaction:async tasks=>Promise.all(tasks),
 $queryRawUnsafe:async(sql,...args)=>{let rows;if(sql.includes('WHERE "id" = $1')){const[id,userId,context]=args;rows=state.threads.filter(row=>row.id===id&&row.userId===userId&&(row.context||'general')===context)}else{const[userId,context]=args;rows=state.threads.filter(row=>row.userId===userId&&(row.context||'general')===context).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).slice(0,50)}return rows.map(row=>({...copy(row),createdAt:new Date(row.createdAt),updatedAt:new Date(row.updatedAt)}))},
 $executeRawUnsafe:async(sql,...args)=>{if(sql.startsWith('CREATE')||sql.startsWith('ALTER'))return 0;if(mode==='failure')throw Error('PRIVATE thread text');if(sql.startsWith('UPDATE')){const[title,id,userId]=args;mutations.push({domain:'chat-history',operation:'rename',id,userId});const row=state.threads.find(row=>row.id===id&&row.userId===userId);if(row&&mode!=='ignored'){row.title=title;row.updatedAt=new Date(Date.parse(now)+ ++step*1000).toISOString()}return row?1:0}if(sql.startsWith('DELETE')){const[id,userId]=args;mutations.push({domain:'chat-history',operation:'delete',id,userId});if(mode!=='ignored')state.threads=state.threads.filter(row=>!(row.id===id&&row.userId===userId));return 1}throw Error('Unexpected synthetic query')},
}
const threads=load('app/api/chat/threads/route.ts',{...shared,'@/lib/prisma':{prisma}})
const imageDeps={...shared,'@/lib/prisma':{prisma},'@/lib/object-storage':{isObjectStorageConfigured:()=>false,del:async()=>{throw Error('Storage access forbidden')},put:async()=>{throw Error('Upload forbidden')}},'@/lib/file-encryption':{encryptBuffer:()=>{throw Error('Encryption forbidden')}},'@/lib/signed-file':{createSignedFileToken:()=> 'synthetic-ephemeral-token'}}
const imageList=load('app/api/medical-images/history/route.ts',imageDeps),imageDelete=load('app/api/medical-images/history/[id]/route.ts',imageDeps)
// Execute only the existing normal interest storage/read blocks; other profile
// fields and their app bootstrap are deliberately outside this isolated fixture.
const userRaw=fs.readFileSync(path.join(root,'app/api/user-data/route.ts'),'utf8'),userAst=ts.createSourceFile('user-data.ts',userRaw,ts.ScriptTarget.Latest,true)
let interestWrite
function visit(n){if(ts.isIfStatement(n)&&n.expression.getText(userAst).includes('(data as any).deviceInterest'))interestWrite=n;ts.forEachChild(n,visit)}visit(userAst);assert(interestWrite)
const readStart=userRaw.indexOf('    let deviceInterestData: any = {}'),readEnd=userRaw.indexOf('\n    //',readStart+1);assert(readStart>0&&readEnd>readStart)
const interestBox=vm.createContext({prisma,actor,NextResponse:server.NextResponse,console:{error(){},log(){}}})
vm.runInContext(compile(`async function GET(request){const user={id:actor()};if(!user.id)return NextResponse.json({error:'Unauthorized'},{status:401});user.healthGoals=[{...await prisma.healthGoal.findFirst({where:{userId:user.id}}),name:'__DEVICE_INTEREST__'}];${userRaw.slice(readStart,readEnd)};return NextResponse.json({deviceInterest:deviceInterestData})} async function POST(request){const user={id:actor()};if(!user.id)return NextResponse.json({error:'Unauthorized'},{status:401});const data=await request.json();try{${interestWrite.getText(userAst)};return NextResponse.json({success:true})}catch{return NextResponse.json({error:'save_failed'},{status:500})}};globalThis.routes={GET,POST}`),interestBox)
const review=load('lib/native-voice-review-token.ts',{crypto})
const instrument=(route,method)=>(...args)=>{calls.push({method,url:args[0].url,headers:new Headers(args[0].headers)});return route[method](...args)}
const userRoutes={GET:instrument(interestBox.routes,'GET'),POST:instrument(interestBox.routes,'POST')}
const threadRoutes={GET:instrument(threads,'GET'),PATCH:instrument(threads,'PATCH'),DELETE:instrument(threads,'DELETE')}
const helper=load('lib/native-voice-additional-actions.ts',{...shared,crypto,'@/lib/native-voice-review-token':review,'@/app/api/user-data/route':userRoutes,'@/app/api/chat/threads/route':threadRoutes,'@/app/api/medical-images/history/route':{GET:instrument(imageList,'GET')},'@/app/api/medical-images/history/[id]/route':{DELETE:instrument(imageDelete,'DELETE')}})
const request=(cap=true)=>new NextRequest('https://helfi.invalid/api/native/voice-assistant',{headers:{authorization:'Bearer synthetic-normal-token','x-native-token':'synthetic-original-header','x-helfi-voice-action-id':'synthetic-correlation',...(cap?{'x-helfi-voice-capabilities':'report-pdf-v1,additional-actions-v1'}:{})}})
const prepare=(action,values,transcript,req=request())=>helper.prepareVoiceAdditionalAction(req,owner,{action,values},transcript,'2026-10-17')
const execute=(draft,req=request())=>helper.executeVoiceAdditionalAction(req,owner,draft,{receiptClaimed:true,actionId:'synthetic-action-id'})
function reset(){sessionId=null;nativeId=owner;mode='normal';mutations=[];calls=[];step=0;state={interests:{[owner]:{googleFit:false,oura:true,polar:false,huawei:true},other:{polar:true}},images:[{id:'image-owned',userId:owner,summary:'Synthetic saved image note',analysisText:'Synthetic complete note',analysisData:{test:true},createdAt:now,imageFileId:null,imageFile:null},{id:'image-other',userId:'other',summary:'Foreign note',createdAt:now}],threads:[{id:'thread-owned',userId:owner,title:'Synthetic saved chat',context:'general',chargedOnce:true,createdAt:now,updatedAt:now},{id:'thread-food',userId:owner,title:'Synthetic food chat',context:'food',createdAt:now,updatedAt:now},{id:'thread-other',userId:'other',title:'Foreign chat',context:'general',createdAt:now,updatedAt:now}]}}
let count=0
async function check(name,run){reset();await run();count++;console.log('PASS '+name)}
async function main(){
 await check('fixed schema and both old-client capability gates refuse before any normal-handler access',async()=>{
  assert.equal(Object.keys(helper.VOICE_ADDITIONAL_ACTION_SCHEMAS).length,4)
  await assert.rejects(()=>prepare('devices.interest.update',{provider:'googleFit',interested:true},'I am interested in Google Fit',request(false)),/updated Helfi/)
  const draft=await prepare('devices.interest.update',{provider:'googleFit',interested:true},'I am interested in Google Fit');const before=calls.length
  await assert.rejects(()=>execute(draft,request(false)),/updated Helfi/);assert.equal(calls.length,before);assert.equal(mutations.length,0)
  for(const input of [{action:'arbitrary',values:{}},{action:'devices.interest.update',values:{provider:'appleHealth',interested:true}},{action:'devices.interest.update',values:{provider:'googleFit',interested:true,endpoint:'/bad'}}])await assert.rejects(()=>helper.prepareVoiceAdditionalAction(request(),owner,input,'I am interested in Google Fit','2026-10-17'))
 })
 await check('normal interest block merges only requested provider and exact verified receipts cannot claim connection',async()=>{
  const draft=await prepare('devices.interest.update',{provider:'googleFit',interested:true},'I am interested in Google Fit');assert.equal(mutations.length,0);assert.equal(draft.canConfirm,true)
  const result=await execute(draft);assert.equal(result.action,'devices.interest.update');assert.equal(result.actionId,'synthetic-action-id');assert.equal(result.provider,'googleFit');assert.equal(result.interested,true);assert.equal(result.operation,'update');assert.equal(result.changed,true)
  assert.deepEqual(state.interests[owner],{googleFit:true,oura:true,polar:false,huawei:true});assert.match(result.message,/did not connect/)
  const writes=mutations.length;assert.equal((await execute(draft)).status,'already_set');assert.equal(mutations.length,writes)
  const remove=await prepare('devices.interest.update',{provider:'oura',interested:false},'I am no longer interested in Oura Ring');await execute(remove);assert.equal(state.interests[owner].oura,false)
 })
 await check('normal image DELETE selects one owned note, confirms absence and repeat cannot delete again',async()=>{
  const draft=await prepare('health_image_note.delete',{query:'Synthetic saved image note'},'Delete my saved health image note Synthetic saved image note');assert.equal(mutations.length,0)
  const result=await execute(draft);assert.equal(result.saved,true);assert.equal(result.targetId,'image-owned');assert.equal(result.id,'image-owned');assert.equal(result.operation,'delete');assert.equal(state.images.length,1);assert.equal(state.images[0].id,'image-other');assert.match(result.message,/Physical storage deletion is not separately verified/)
  const writes=mutations.length,again=await execute(draft);assert.equal(again.status,'already_absent');assert.equal(again.saved,false);assert.equal(again.changed,false);assert.equal(mutations.length,writes)
 })
 await check('normal saved-thread PATCH preserves literal title and DELETE remains separate from current conversation',async()=>{
  const draft=await prepare('chat_history.rename',{query:'Synthetic saved chat',context:'general',title:'Exact new title!'},'Rename my saved chat Synthetic saved chat to Exact new title!')
  const result=await execute(draft);assert.equal(result.title,'Exact new title!');assert.equal(result.context,'general');assert.equal(result.targetId,'thread-owned');assert.equal(state.threads[0].title,'Exact new title!');assert.equal((await execute(draft)).status,'already_set')
  const deletion=await prepare('chat_history.delete',{threadId:'thread-owned',context:'general'},'Delete my saved Chat History thread');await execute(deletion);assert(state.threads.some(row=>row.id==='thread-food'));assert(state.threads.some(row=>row.id==='thread-other'))
  assert.match(deletion.confirmationMessage,/does not clear the current voice conversation/)
 })
 await check('foreign, missing, ambiguous and partial titles never select a destructive target',async()=>{
  for(const[action,values,text]of [['health_image_note.delete',{id:'image-other'},'Delete my saved health image note'],['chat_history.delete',{threadId:'thread-other'},'Delete my saved chat history thread'],['chat_history.delete',{query:'Synthetic'},'Delete my saved chat history thread']]){const draft=await prepare(action,values,text);assert.equal(draft.canConfirm,false)}
  state.threads.push({...state.threads[0],id:'duplicate'});const draft=await prepare('chat_history.delete',{query:'Synthetic saved chat'},'Delete my saved chat history thread Synthetic saved chat');assert.equal(draft.canConfirm,false);assert.equal(draft.choices.length,2);assert.equal(mutations.length,0)
 })
 await check('negation, advice, missing literal title and current-conversation language never mutate',async()=>{
  for(const[action,values,text]of [['devices.interest.update',{provider:'googleFit',interested:true},"Don't mark me interested in Google Fit"],['devices.interest.update',{provider:'oura',interested:true},'I am not interested in Oura'],['health_image_note.delete',{id:'image-owned'},'What happens if I delete this saved health image note?'],['chat_history.delete',{threadId:'thread-owned'},'Delete our current voice conversation'],['chat_history.rename',{threadId:'thread-owned',title:'Invented'},'Rename my saved chat to Exact title']])await assert.rejects(()=>prepare(action,values,text));assert.equal(mutations.length,0)
 })
 await check('literal replacement title is preserved as data without treating it as a current-conversation command',async()=>{
  const title='Do not delete our current voice conversation'
  const draft=await prepare('chat_history.rename',{threadId:'thread-owned',title},`Rename my saved Chat History thread to ${title}`)
  assert.equal(draft.canConfirm,true);const result=await execute(draft);assert.equal(result.title,title);assert.equal(state.threads[0].title,title)
  sessionId='other';await assert.rejects(()=>prepare('chat_history.delete',{threadId:'thread-owned'},'Delete my saved Chat History thread'),/same account/)
 })
 await check('changed content/settings, wrong account and signature tampering require a new review',async()=>{
  const draft=await prepare('chat_history.delete',{threadId:'thread-owned'},'Delete my saved chat history thread');state.threads[0].updatedAt='2026-10-17T01:00:00Z';await assert.rejects(()=>execute(draft),/changed/)
  const pref=await prepare('devices.interest.update',{provider:'googleFit',interested:true},'I am interested in Google Fit');state.interests[owner].huawei=false;await assert.rejects(()=>execute(pref),/changed/)
  const image=await prepare('health_image_note.delete',{id:'image-owned'},'Delete my saved health image note');state.images[0].analysisText='Changed synthetic text';await assert.rejects(()=>execute(image),/changed/)
  await assert.rejects(()=>execute({...draft,summary:'Tampered'}),/review/);nativeId='other';await assert.rejects(()=>execute(draft),/same account/);assert.equal(mutations.length,0)
 })
 await check('normal handler failures or ignored writes never produce verified completion or raw private errors',async()=>{
  for(const failure of ['ignored','failure'])for(const[action,values,text]of [['devices.interest.update',{provider:'googleFit',interested:true},'I am interested in Google Fit'],['health_image_note.delete',{id:'image-owned'},'Delete my saved health image note'],['chat_history.rename',{threadId:'thread-owned',title:'New exact title'},'Rename my saved chat to New exact title']]){reset();const draft=await prepare(action,values,text);mode=failure;await assert.rejects(()=>execute(draft),error=>!error.message.includes('PRIVATE'))}
 })
 await check('original auth, capability and correlation headers are preserved through fixed normal requests',async()=>{
  const draft=await prepare('chat_history.rename',{threadId:'thread-owned',title:'Literal title'},'Rename my saved chat to Literal title');await execute(draft)
  for(const call of calls){assert.equal(call.headers.get('authorization'),'Bearer synthetic-normal-token');assert.equal(call.headers.get('x-native-token'),'synthetic-original-header');assert.equal(call.headers.get('x-helfi-voice-action-id'),'synthetic-correlation');assert(call.headers.get('x-helfi-voice-capabilities').includes('additional-actions-v1'));assert.equal(new URL(call.url).pathname,'/api/chat/threads')}
 })
 await check('normal chat native bearer auth preserves web-session priority and user/context isolation',async()=>{
  let data=await(await threads.GET(new NextRequest('https://helfi.invalid/api/chat/threads?context=general',{headers:{authorization:'Bearer synthetic-normal-token'}}))).json();assert.deepEqual(data.threads.map(row=>row.id),['thread-owned'])
  sessionId='other';data=await(await threads.GET(request())).json();assert.deepEqual(data.threads.map(row=>row.id),['thread-other']);assert.equal((await threads.PATCH(new NextRequest('https://helfi.invalid/api/chat/threads',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({threadId:'thread-owned',title:'No foreign rename'})}))).status,200);assert.equal(state.threads[0].title,'Synthetic saved chat')
  sessionId=null;nativeId=null;assert.equal((await threads.GET(request())).status,401);assert.equal((await threads.DELETE(new NextRequest('https://helfi.invalid/api/chat/threads',{method:'DELETE',headers:{'content-type':'application/json'},body:JSON.stringify({threadId:'thread-owned'})}))).status,401)
 })
 await check('exact normal chat GET proves older-than50 presence/absence without altering normal50 list',async()=>{
  state.threads.push(...Array.from({length:60},(_,index)=>({id:'new-'+index,userId:owner,title:'Recent '+index,context:'general',createdAt:now,updatedAt:'2026-10-18T00:00:00Z'})))
  const normal=await(await threads.GET(request())).json();assert.equal(normal.threads.length,50);assert(!normal.threads.some(row=>row.id==='thread-owned'))
  const exactUrl=id=>new NextRequest('https://helfi.invalid/api/chat/threads?context=general&threadId='+id,{headers:{authorization:'Bearer synthetic-normal-token'}})
  const exact=await(await threads.GET(exactUrl('thread-owned'))).json();assert.equal(exact.exactThreadId,'thread-owned');assert.equal(exact.threads[0].id,'thread-owned')
  const older=await prepare('chat_history.rename',{threadId:'thread-owned',context:'general',title:'Older exact title'},'Rename my saved chat to Older exact title');assert.equal(older.canConfirm,true);assert.equal((await execute(older)).targetId,'thread-owned')
  assert.equal((await(await threads.GET(exactUrl('thread-other'))).json()).threads.length,0);assert.equal((await(await threads.GET(exactUrl('thread-food'))).json()).threads.length,0)
  const draft=await prepare('chat_history.delete',{threadId:'new-0'},'Delete my saved Chat History thread');state.threads.push(...Array.from({length:55},(_,index)=>({id:'latest-'+index,userId:owner,title:'Arrival '+index,context:'general',createdAt:now,updatedAt:'2026-10-19T00:00:00Z'})));assert.equal((await execute(draft)).status,'completed');assert(!state.threads.some(row=>row.id==='new-0'))
 })
 // Main route integration executes the actual normalizer branch and durable
 // confirmation receipt machinery with the existing synthetic save harness.
 await check('actual preparation normalizer rejects old50 and signed confirmation receipt replay never repeats the mutation',async()=>{
  const raw=fs.readFileSync(path.join(root,'app/api/native/voice-assistant/route.ts'),'utf8'),ast=ts.createSourceFile('voice.ts',raw,ts.ScriptTarget.Latest,true);let branch
  function find(n){if(ts.isIfStatement(n)&&n.expression.getText(ast)==="parsedAction === 'additional_action'")branch=n;ts.forEachChild(n,find)}find(ast);assert(branch)
  const box=vm.createContext({prepareVoiceAdditionalAction:helper.prepareVoiceAdditionalAction,cleanText:value=>String(value||'')});vm.runInContext(compile(`async function normalize(parsed,transcript,actionRequest){const parsedAction='additional_action',userId='synthetic-user',localDate='2026-10-17';${branch.getText(ast)}};globalThis.normalize=normalize`),box)
  const parsed={additionalAction:{action:'chat_history.rename',values:{threadId:'thread-owned',context:'general',title:'Exact integration title'}}},text='Rename my saved Chat History thread to Exact integration title'
  assert.equal((await box.normalize(parsed,text,request(false))).draft.canConfirm,false)
  const draft=(await box.normalize(parsed,text,request())).draft;assert.equal(draft.canConfirm,true)
  const fixture=fs.readFileSync(path.join(__dirname,'voice-save-integrity-check.cjs'),'utf8').replace(/^#![^\n]*\n/,'');const end=fixture.indexOf('async function run()');assert(end>0)
  const tools=new Function('require','__dirname',fixture.slice(0,end)+'\nreturn {harness,AuditDate}') (require,__dirname);tools.AuditDate.setNow(Date.now())
  const h=tools.harness();h.route.verifyNativeVoiceDraft=review.verifyNativeVoiceDraft;h.route.executeVoiceAdditionalAction=helper.executeVoiceAdditionalAction
  const send=()=>h.route.POST({url:request().url,headers:request().headers,json:async()=>({draft})})
  const first=await send();assert.equal(first.status,200,JSON.stringify(first.body));assert.equal(first.body.result.action,'chat_history.rename');assert.equal(first.body.result.targetId,'thread-owned');assert.equal(state.threads[0].title,'Exact integration title')
  const before=mutations.length,again=await send();assert.equal(again.status,200);assert.deepEqual(copy(again.body.result),copy(first.body.result));assert.equal(mutations.length,before);assert.equal(Object.values(h.state().tokens).filter(row=>row.identifier.startsWith('native-voice-review-result:')).length,1)
 })
 await check('actual confirmation pending receipt prevents a second mutation after an uncertain submitted result',async()=>{
  const draft=await prepare('chat_history.rename',{threadId:'thread-owned',context:'general',title:'Uncertain exact title'},'Rename my saved chat to Uncertain exact title')
  const fixture=fs.readFileSync(path.join(__dirname,'voice-save-integrity-check.cjs'),'utf8').replace(/^#![^\n]*\n/,'');const end=fixture.indexOf('async function run()')
  const tools=new Function('require','__dirname',fixture.slice(0,end)+'\nreturn {harness,AuditDate}') (require,__dirname);tools.AuditDate.setNow(Date.now())
  const h=tools.harness();h.route.verifyNativeVoiceDraft=review.verifyNativeVoiceDraft;let attempts=0
  h.route.executeVoiceAdditionalAction=async(...args)=>{attempts++;await helper.executeVoiceAdditionalAction(...args);throw Error('Synthetic lost completion after submitted action')}
  const send=()=>h.route.POST({url:request().url,headers:request().headers,json:async()=>({draft})})
  assert.equal((await send()).status,500);assert.equal(state.threads[0].title,'Uncertain exact title')
  const writes=mutations.length,again=await send();assert.equal(again.status,409);assert.equal(again.body.code,'voice_save_result_unconfirmed');assert.equal(attempts,1);assert.equal(mutations.length,writes)
 })
 console.log(`Voice additional actions: ${count} actual-source offline groups passed; no real account, Health image deletion, device connection or chat mutation.`)
}
main().catch(error=>{console.error(error);process.exitCode=1})
