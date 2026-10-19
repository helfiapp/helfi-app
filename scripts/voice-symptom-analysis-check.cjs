#!/usr/bin/env node
'use strict'
// Actual normal symptom creation/chat/history, consent and review source.
// Synthetic accounts, storage, credits and provider boundary only. No app
// startup, network, real credentials, real medical data or account writes.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),ts=require('typescript'),vm=require('node:vm')
const root=path.resolve(__dirname,'..'),owner='synthetic-user',copy=value=>JSON.parse(JSON.stringify(value))
const raw=fs.readFileSync(path.join(__dirname,'voice-save-integrity-check.cjs'),'utf8').replace(/^#!.*\n/,'');const end=raw.indexOf('async function run() {');assert(end>0)
const base=new Function('require','__dirname',raw.slice(0,end)+'\nreturn {load,tokens,harness,AuditDate}')(require,__dirname)
const creditAst=ts.createSourceFile('credits.ts',fs.readFileSync(path.join(root,'lib/credit-system.ts'),'utf8'),ts.ScriptTarget.Latest,true);let costs
function findCosts(node){if(ts.isVariableDeclaration(node)&&node.name.getText(creditAst)==='CREDIT_COSTS')costs=node.initializer.getText(creditAst);ts.forEachChild(node,findCosts)}findCosts(creditAst);assert(costs)
const CREDIT_COSTS=new Function(ts.transpileModule('return '+costs,{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText)()
class NextRequest extends Request{}
function normalLoad(relative,fixtures){
 const ast=ts.createSourceFile(relative,fs.readFileSync(path.join(root,relative),'utf8'),ts.ScriptTarget.Latest,true),printer=ts.createPrinter();let replaced=0
 const code=ast.statements.filter(item=>!ts.isImportDeclaration(item)).map(item=>{
  if(ts.isVariableStatement(item)&&item.declarationList.declarations.some(decl=>decl.name.getText(ast)==='getOpenAIClient')||ts.isFunctionDeclaration(item)&&item.name?.text==='getOpenAIClient'){replaced++;return 'const getOpenAIClient = syntheticProviderFactory;'}
  return printer.printNode(ts.EmitHint.Unspecified,item,ast)
 }).join('\n').replace(/^export\s+/gm,'');assert.equal(replaced,1,'Only the normal provider factory boundary is replaced')
 const ctx={process:{env:Object.freeze({NODE_ENV:'test'})},Date:base.AuditDate,crypto,Buffer,AbortController,setTimeout,clearTimeout,fetch(){throw Error('Network forbidden')},...fixtures,syntheticProviderFactory:()=>({synthetic:true})};vm.createContext(ctx);vm.runInContext(ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText,ctx,{filename:relative});return ctx
}
const json=(body,options)=>new Response(JSON.stringify(body),{status:options?.status||200,headers:{'content-type':'application/json'}})
const generated={summary:'Synthetic logged symptom overview',possibleCauses:[{name:'Symptoms to discuss',whyLikely:'Bring the recorded pattern to a clinician.',confidence:'low'}],redFlags:['Seek urgent help for severe or rapidly worsening symptoms.'],nextSteps:['Write down when symptoms occur.'],disclaimer:'General information only; this is not a diagnosis. Consult a qualified professional.'}
function setup(){
 base.AuditDate.setNow(Date.now());let nativeId=owner,sessionId=null,consent=true,premium=true,free=false,balance=100,mode='ok',next=0
 let rows=[],threads=[],messages=[];const providers=[],charges=[],consumed=[],calls=[],logs=[],effects=[]
 const user=id=>({id,email:id+'@example.invalid',subscription:{active:premium},creditTopUps:[]})
 const getNative=async request=>request.headers.get('authorization')==='Bearer synthetic-token'?nativeId:null
 const session=async()=>sessionId?{user:{id:sessionId,email:sessionId+'@example.invalid'}}:null
 const consentText=base.load('lib/ai-consent-text.ts')
 const consentVersion=vm.runInContext('AI_SHARING_CONSENT_VERSION',consentText)
 const prisma={user:{findUnique:async({where})=>user(where.id||where.email.split('@')[0]),update:async()=>{effects.push('usage-counter');return user(owner)}},aiDataSharingConsent:{findUnique:async()=>({granted:consent,version:consentVersion})},symptomAnalysis:{create:async({data})=>{if(mode==='save-failure')throw Error('PRIVATE synthetic symptom storage detail');const row={id:'analysis-'+(++next),...copy(data),createdAt:new Date(base.AuditDate.now()).toISOString()};rows.push(row);effects.push('analysis-saved');return copy(row)},findMany:async({where,select})=>rows.filter(row=>row.userId===where.userId).slice().reverse().map(row=>Object.fromEntries(Object.keys(select).map(key=>[key,copy(row[key])]))),deleteMany:async()=>({count:0})},$queryRawUnsafe:async(sql,...args)=>{assert(sql.includes('FROM "SymptomChatMessage"'));assert(sql.includes('"threadId" = $1 AND "id" = ANY($2::text[])'));return messages.filter(row=>row.threadId===args[0]&&args[1].includes(row.id)).map(copy)}}
 const consentApi=base.load('lib/ai-consent.ts',{NextRequest,NextResponse:{json},getServerSession:session,authOptions:{},getUserIdFromNativeAuth:getNative,prisma,AI_SHARING_CONSENT_VERSION:consentVersion})
 class CreditManager{async checkCredits(){return{hasCredits:balance>0}}async getWalletStatus(){return{totalAvailableCents:balance}}async chargeCents(value){charges.push(value);if(value>balance)return false;balance-=value;return true}}
 const common={Headers,URL,NextRequest,NextResponse:{json},getServerSession:session,authOptions:{},getToken:async()=>null,getUserIdFromNativeAuth:getNative,prisma,CreditManager,CREDIT_COSTS,aiConsentRequiredResponse:consentApi.aiConsentRequiredResponse,hasFreeCredits:async()=>free,consumeFreeCredit:async(userId,feature)=>{consumed.push({userId,feature});return true},isSubscriptionActive:()=>premium,capMaxTokensToBudget:(_model,_text,max,available)=>available>0?max:0,logServerCall:async()=>{},logAIUsage:async()=>{},console:{log(){},warn:(...args)=>logs.push(args.map(String)),error:(...args)=>logs.push(args.map(String))},chatCompletionWithCost:async(client,input)=>{
  assert.equal(client.synthetic,true);assert.equal(input.model,'gpt-5.6-sol');const prompt=input.messages.map(row=>row.content).join('\n');assert.match(prompt,/not a doctor/);assert.match(prompt,/diagnos/i);assert.match(prompt,/treatment/i);providers.push({input:copy(input)})
  if(mode==='provider-failure')throw Error('PRIVATE provider failure')
  if(mode==='empty-response')return{completion:{choices:[{message:{content:''}}]},costCents:3,promptTokens:20,completionTokens:0}
  if(mode==='structured-only')return{completion:{choices:[{message:{content:'<STRUCTURED_JSON>'+JSON.stringify(generated)+'</STRUCTURED_JSON>'}}]},costCents:3,promptTokens:20,completionTokens:30}
  return{completion:{choices:[{message:{content:input.messages[0].role==='user'?'Synthetic general notes. <STRUCTURED_JSON>'+JSON.stringify(generated)+'</STRUCTURED_JSON>':'Synthetic follow-up: ask a qualified professional about the recorded pattern.'}}]},costCents:3,promptTokens:20,completionTokens:30}
 }}
 const analysis=normalLoad('app/api/analyze-symptoms/route.ts',common)
 const store={getThread:async(userId,threadId)=>copy(threads.find(row=>row.userId===userId&&row.id===threadId)||null),createThread:async(userId,context,title)=>{const row={id:'thread-'+(++next),userId,context:copy(context||null),title};threads.push(row);effects.push('thread-created');return{id:row.id}},listMessages:async(threadId,limit)=>messages.filter(row=>row.threadId===threadId).slice(0,limit).map(copy),appendMessage:async(threadId,role,content)=>{const id='message-'+(++next);if(!(mode==='ignore-assistant'&&role==='assistant'))messages.push({id,threadId,role,content,createdAt:new Date(base.AuditDate.now()).toISOString()});effects.push('message-'+role);return id},updateThreadTitle:async(userId,threadId,title)=>{threads.find(row=>row.id===threadId&&row.userId===userId).title=title},updateThreadContext:async(userId,threadId,context)=>{threads.find(row=>row.id===threadId&&row.userId===userId).context=copy(context)},updateThreadCost:async()=>{}}
 const chat=normalLoad('app/api/analyze-symptoms/chat/route.ts',{...common,...store})
 const history=base.load('app/api/symptoms/history/route.ts',common)
 const routes={'@/app/api/analyze-symptoms/route':analysis,'@/app/api/analyze-symptoms/chat/route':chat,'@/app/api/symptoms/history/route':history}
 const helper=base.load('lib/native-voice-symptom-analysis.ts',{Headers,URL,NextRequest,getServerSession:session,authOptions:{},getUserIdFromNativeAuth:getNative,CREDIT_COSTS,signNativeVoiceDraft:base.tokens.signNativeVoiceDraft,verifyNativeVoiceDraft:base.tokens.verifyNativeVoiceDraft,require:name=>{assert(Object.hasOwn(routes,name),'Forbidden route '+name);return Object.fromEntries(['GET','POST'].filter(method=>typeof routes[name][method]==='function').map(method=>[method,request=>{calls.push({method,url:request.url,headers:new Headers(request.headers)});return routes[name][method](request)}]))}})
 const request=(cap=true)=>new NextRequest('https://helfi.invalid/api/native/voice-assistant',{method:'POST',headers:{authorization:'Bearer synthetic-token','x-helfi-voice-action-id':'synthetic-correlation',cookie:'synthetic-cookie=preserved',...(cap?{'x-helfi-voice-capabilities':'symptom-analysis-v1'}:{})},body:'{}'})
 const prepare=(values={symptoms:['headache'],duration:'two hours',notes:'Exact synthetic notes.'},transcript='Create general symptom notes for headache',req=request())=>helper.prepareVoiceSymptomAction(req,owner,{action:'symptoms.analyze',values},transcript,'2026-10-17')
 const follow=(analysisId,extra={})=>helper.prepareVoiceSymptomAction(request(),owner,{action:'symptoms.follow_up',values:{analysisId,question:'What should I track?',...extra}},'Ask a follow-up: What should I track?','2026-10-17')
 const execute=(draft,req=request())=>helper.executeVoiceSymptomAction(req,owner,draft,{receiptClaimed:true,actionId:crypto.createHash('sha256').update(draft.reviewToken).digest('base64url')})
 return{helper,analysis,chat,request,prepare,follow,execute,providers,charges,consumed,calls,logs,effects,rows:()=>rows,threads:()=>threads,messages:()=>messages,setMode:value=>{mode=value},setConsent:value=>{consent=value},setNative:value=>{nativeId=value},setSession:value=>{sessionId=value},setPremium:value=>{premium=value},setFree:value=>{free=value},setBalance:value=>{balance=value}}
}
let count=0
async function check(name,run){await run();count++;console.log('PASS '+name)}
async function run(){
 await check('preparation is free, signed, explicit about fixed real normal price and automatic history save',async()=>{
  const f=setup(),draft=await f.prepare();assert.equal(draft.canConfirm,true);assert.equal(draft.clinicalAction.normalCreditCost,CREDIT_COSTS.SYMPTOM_ANALYSIS);assert.match(draft.confirmationMessage,/save them to Symptom Notes history/);assert.match(draft.confirmationMessage,/not a diagnosis/);assert(base.tokens.verifyNativeVoiceDraft(owner,draft));assert.equal(f.providers.length,0);assert.equal(f.charges.length,0);assert.equal(f.effects.length,0)
  for(const text of ['Do not analyze my symptoms','How do I create symptom notes?','Analyze my symptoms without saving'])await assert.rejects(()=>f.prepare(undefined,text));await assert.rejects(()=>f.prepare(undefined,undefined,f.request(false)),/update/);assert.equal(f.effects.length,0)
 })
 await check('actual normal create charges exactly once and verifies exact source-backed full analysis and history ID',async()=>{
  const f=setup(),draft=await f.prepare(),result=await f.execute(draft);assert.equal(result.status,'completed');assert.equal(result.saved,true);assert.equal(result.historySaved,true);assert.equal(result.analysisId,f.rows()[0].id);assert.equal(result.analysis.summary,generated.summary);assert.equal(result.analysis.disclaimer,generated.disclaimer);assert.deepEqual(copy(result.analysis.redFlags),generated.redFlags);assert.equal(result.chargedCredits,CREDIT_COSTS.SYMPTOM_ANALYSIS);assert.deepEqual(f.charges,[CREDIT_COSTS.SYMPTOM_ANALYSIS]);assert.equal(f.providers.length,1);assert.match(result.spokenMessage,/not a diagnosis/)
  for(const call of f.calls){assert.equal(call.headers.get('authorization'),'Bearer synthetic-token');assert.equal(call.headers.get('cookie'),'synthetic-cookie=preserved');assert.equal(call.headers.get('x-helfi-voice-action-id'),'synthetic-correlation');assert(['/api/analyze-symptoms','/api/symptoms/history'].includes(new URL(call.url).pathname))}
 })
 await check('real persisted AI consent, normal paid/free access, budget and capability cannot be bypassed',async()=>{
  for(const gate of ['consent','payment','balance','capability','account']){const f=setup(),draft=await f.prepare();if(gate==='consent')f.setConsent(false);if(gate==='payment'){f.setPremium(false);f.setFree(false)}if(gate==='balance')f.setBalance(0);if(gate==='account')f.setNative('foreign');await assert.rejects(()=>f.execute(draft,gate==='capability'?f.request(false):f.request()));assert.equal(f.providers.length,0);assert.equal(f.rows().length,0)}
  const free=setup();free.setPremium(false);free.setFree(true);const result=await free.execute(await free.prepare());assert.equal(result.saved,true);assert.equal(result.chargedCredits,0);assert.equal(result.coveredByFreeUse,true);assert.equal(free.charges.length,0);assert.deepEqual(free.consumed,[{userId:owner,feature:'SYMPTOM_ANALYSIS'}])
 })
 await check('failed history save returns generated_not_saved with full analysis and no fabricated ID or raw log',async()=>{
  const f=setup(),draft=await f.prepare();f.setMode('save-failure');const result=await f.execute(draft);assert.equal(result.generated,true);assert.equal(result.saved,false);assert.equal(result.historySaved,false);assert.equal(result.analysisId,null);assert.equal(result.status,'generated_not_saved');assert.equal(result.analysis.summary,generated.summary);assert.equal(f.rows().length,0);assert.equal(f.providers.length,1);assert.deepEqual(f.charges,[CREDIT_COSTS.SYMPTOM_ANALYSIS]);assert(!JSON.stringify(f.logs).includes('PRIVATE'))
 })
 await check('owned history read/detail and exact/ambiguous selectors require source selection and never generate',async()=>{
  const f=setup(),first=await f.execute(await f.prepare()),second=await f.execute(await f.prepare());const before=f.providers.length
  const read=await f.helper.readVoiceSymptomHistory(f.request(),owner,{analysisId:first.analysisId});assert.equal(read.verified,true);assert.equal(read.safeToClaimSaved,false);assert.equal(read.analyses.length,1);assert.equal(read.analyses[0].id,first.analysisId)
  const ambiguous=await f.helper.prepareVoiceSymptomAction(f.request(),owner,{action:'symptoms.follow_up',values:{query:'headache',question:'What should I track?'}},'What should I track?','2026-10-17');assert.equal(ambiguous.canConfirm,false);assert.equal(ambiguous.choices.length,2)
  const exact=await f.follow(second.analysisId);assert.equal(exact.canConfirm,true);await assert.rejects(()=>f.follow('foreign'));assert.equal(f.providers.length,before)
 })
 await check('actual normal follow-up binds saved context, returns exact message IDs and verifies both stored messages',async()=>{
  const f=setup(),saved=await f.execute(await f.prepare()),draft=await f.follow(saved.analysisId),before=f.effects.length;assert.equal(f.effects.length,before);assert.equal(draft.clinicalAction.normalCreditCost,null)
  const result=await f.execute(draft);assert.equal(result.status,'completed');assert.equal(result.saved,true);assert.equal(result.analysisId,saved.analysisId);assert.equal(result.threadId,f.threads()[0].id);assert.equal(result.assistant,f.messages().find(row=>row.id===result.messageIds.assistant).content);assert.equal(result.costCents,3);assert.deepEqual(f.charges,[CREDIT_COSTS.SYMPTOM_ANALYSIS,3]);assert.equal(f.providers.length,2);assert(f.calls.some(call=>new URL(call.url).searchParams.getAll('messageId').length===2))
  const next=await f.follow(saved.analysisId,{threadId:result.threadId});assert.equal((await f.execute(next)).threadId,result.threadId);assert.equal(f.threads().length,1)
 })
 await check('changed source/context, foreign/missing threads, altered review or account refuse before another paid request',async()=>{
  const f=setup(),saved=await f.execute(await f.prepare()),draft=await f.follow(saved.analysisId);f.rows()[0].notes='Changed after review';await assert.rejects(()=>f.execute(draft),/changed/);assert.equal(f.providers.length,1)
  f.rows()[0].notes='Exact synthetic notes.';const result=await f.execute(await f.follow(saved.analysisId));const next=await f.follow(saved.analysisId,{threadId:result.threadId});f.threads()[0].context.notes='Changed';await assert.rejects(()=>f.execute(next));assert.equal(f.providers.length,2)
  await assert.rejects(()=>f.follow(saved.analysisId,{threadId:'foreign'}));await assert.rejects(()=>f.execute({...draft,summary:'Tampered'}));f.setSession('foreign');await assert.rejects(()=>f.execute(draft));assert.equal(f.providers.length,2)
 })
 await check('exact message readback works past normal first60 list and rejects ignored assistant storage',async()=>{
  const f=setup(),saved=await f.execute(await f.prepare()),first=await f.execute(await f.follow(saved.analysisId));for(let i=0;i<70;i++)f.messages().push({id:'older-'+i,threadId:first.threadId,role:'user',content:'Synthetic older message',createdAt:new Date().toISOString()})
  const next=await f.follow(saved.analysisId,{threadId:first.threadId});assert.equal((await f.execute(next)).saved,true)
  const pending=await f.follow(saved.analysisId,{threadId:first.threadId});f.setMode('ignore-assistant');await assert.rejects(()=>f.execute(pending));assert.equal(f.providers.length,4)
 })
 await check('normal stale thread request no longer silently creates a different conversation; anonymous exact read cannot expose messages',async()=>{
  const f=setup(),count=f.effects.length;const stale=await f.chat.POST(new NextRequest('https://helfi.invalid/api/analyze-symptoms/chat',{method:'POST',headers:{...Object.fromEntries(f.request().headers),'content-type':'application/json'},body:JSON.stringify({threadId:'missing',message:'What should I track?'})}));assert.equal(stale.status,404);assert.equal(f.effects.length,count);assert.equal(f.providers.length,0)
  f.setNative(null);const read=await f.chat.GET(new NextRequest('https://helfi.invalid/api/analyze-symptoms/chat?threadId=foreign&messageId=secret',{headers:f.request().headers}));assert.equal(read.status,401)
 })
 await check('unsupported fields, missing symptoms, fabricated analysis, expired and flipped review never reach provider',async()=>{
  const f=setup();for(const values of [{symptoms:[]},{symptoms:['x'],endpoint:'/bad'},{symptoms:['x'],analysisData:generated},{symptoms:['x'],notes:'x'.repeat(1201)}])await assert.rejects(()=>f.prepare(values));const draft=await f.prepare();await assert.rejects(()=>f.execute({...draft,canConfirm:false}));const old={...draft,reviewIssuedAt:Date.now()-31*60*1000};old.reviewToken=base.tokens.signNativeVoiceDraft(owner,old);await assert.rejects(()=>f.execute(old));assert.equal(f.providers.length,0)
 })
 await check('structured-only normal results retain null text truthfully; empty chat fallback cannot prove generated reply',async()=>{
  const f=setup();f.setMode('structured-only');const saved=await f.execute(await f.prepare());assert.equal(saved.saved,true);assert.equal(saved.analysis.analysisText,null);assert.match(saved.spokenMessage,/Synthetic logged symptom overview/);assert(saved.spokenMessage.length<2000)
  f.setMode('empty-response');const pending=await f.follow(saved.analysisId);await assert.rejects(()=>f.execute(pending));assert.equal(f.providers.length,2);assert.equal(f.messages().filter(row=>row.role==='assistant').length,1);assert(!JSON.stringify(f.logs).includes('PRIVATE'))
 })
 console.log(`Voice symptom analysis: ${count} actual-source offline groups passed. Real normal handler/consent source, synthetic provider/credits/storage only; no real analysis or medical/account writes.`)
}
if(require.main===module)run().catch(error=>{console.error(error);process.exitCode=1})
module.exports={setup,base,owner,NextRequest,generated,run}
