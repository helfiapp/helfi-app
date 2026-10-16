#!/usr/bin/env node
'use strict'
// Real history helper, HMAC review tokens, normal authentication and normal
// route handlers. SQL/storage/clock/account responses are synthetic. No real
// credentials, provider, database, account mutations or application startup.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),crypto=require('node:crypto')
const root=path.resolve(__dirname,'..'),owner='synthetic-user',other='synthetic-other',now='2026-10-17T01:00:00.000Z',copy=value=>JSON.parse(JSON.stringify(value))
const compile=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText
class NextRequest extends Request{}
const server={NextRequest,NextResponse:{json:(body,options)=>new Response(JSON.stringify(body),{status:options?.status||200,headers:{'content-type':'application/json'}})}}
const deps={},calls=[],queries=[],writes=[];let state,actor,mode,transactions
function load(relative,extra={}){const module={exports:{}};vm.runInNewContext(compile(fs.readFileSync(path.join(root,relative),'utf8')),{module,exports:module.exports,URL,URLSearchParams,Headers,Request,Response,Date,Buffer,crypto,console:{error(){},warn(){},log(){}},process:{env:{NODE_ENV:'test',AUTH_SECRET:'synthetic-history-review-key'}},require:name=>{if(Object.hasOwn(extra,name))return extra[name];if(Object.hasOwn(deps,name))return deps[name];throw Error('Forbidden dependency '+name)}},{filename:relative});return module.exports}
const table=sql=>sql.includes('CheckinRatings')?'ratings':sql.includes('HealthTips')?'tips':'issues'
async function raw(sql,...args){
 queries.push({sql,args:copy(args)});sql=sql.replace(/\s+/g,' ').trim();const name=table(sql),userId=args[0]
 if(sql.startsWith('SELECT id FROM CheckinIssues'))return state.issues.filter(row=>row.userId===userId&&args[1].includes(row.id)).map(row=>({id:row.id}))
 if(sql.startsWith('SELECT')&&sql.includes(' r ')){
  let rows=state[name].filter(row=>row.userId===userId),at=1
  if(sql.includes('r.id = ANY')){const selected=args[at++];rows=rows.filter(row=>selected.includes(row.id))}
  rows=rows.map(row=>name==='ratings'?{...copy(row),...(()=>{const issue=state.issues.find(item=>item.userId===userId&&item.id===row.issueId);return{name:issue?.name??null,polarity:issue?.polarity??null}})()}:copy(row))
  if(sql.includes('lower(')){const query=args[at++].toLowerCase();rows=rows.filter(row=>(name==='ratings'?row.name:row.title)?.toLowerCase()===query)}
  if(sql.includes(' BETWEEN ')){const start=args[at++],end=args[at++];rows=rows.filter(row=>{const date=name==='ratings'?row.date:row.tipDate;return date>=start&&date<=end})}
  rows.sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0)
  if(mode==='private-read-error')throw Error('PRIVATE database diagnostic and raw content')
  return rows.slice(0,1001).map(row=>({...row,...(name==='ratings'?{timestamp:new Date(row.timestamp)}:{tipDate:new Date(row.tipDate+'T00:00:00Z'),sentAt:new Date(row.sentAt)})}))
 }
 if(sql.startsWith('DELETE FROM')){
  assert(sql.includes('WHERE userId = $1 AND id = ANY($2::text[]) RETURNING id'))
  writes.push({name,userId,ids:copy(args[1])});const removed=state[name].filter(row=>row.userId===userId&&args[1].includes(row.id))
  if(mode!=='ignored-delete')state[name]=state[name].filter(row=>!removed.includes(row))
  if(mode==='throw-after-delete')throw Error('PRIVATE transaction engine detail')
  return (mode==='partial-return'?removed.slice(0,1):mode==='wrong-return'?[{id:'not-reviewed'}]:removed).map(row=>({id:row.id}))
 }
 throw Error('Unrecognized synthetic SQL '+sql)
}
const prisma={user:{findUnique:async({where})=>{const id=where.id||where.email?.split('@')[0];return id?{id,email:id+'@example.invalid'}:null}},$queryRawUnsafe:raw,$executeRawUnsafe:async(sql,...args)=>{queries.push({sql,args:copy(args),manual:true});if(sql.trimStart().startsWith('CREATE TABLE'))return 0;if(sql.startsWith('DELETE FROM CheckinRatings WHERE userId = $1')){const prior=state.ratings.length;state.ratings=state.ratings.filter(row=>row.userId!==args[0]||(sql.includes('issueId IN')&&!args.slice(1).includes(row.issueId)));return prior-state.ratings.length}throw Error('Unexpected manual SQL')},$transaction:async(run,options)=>{transactions.push(copy(options));const before=copy(state);try{return await run({$queryRawUnsafe:raw})}catch(error){state=before;throw error}}}
Object.assign(deps,{'next/server':server,crypto,'@/lib/prisma':{prisma},'next-auth':{getServerSession:async()=>actor?{user:{id:actor,email:actor+'@example.invalid'}}:null},'next-auth/jwt':{getToken:async()=>null},'@/lib/auth':{authOptions:{}},'@/lib/native-auth':{getUserIdFromNativeAuth:async req=>req.headers.get('authorization')==='Bearer synthetic-token'?actor:null}})
deps['@/app/api/checkins/_auth']=load('app/api/checkins/_auth.ts')
const review=deps['@/lib/native-voice-review-token']=load('lib/native-voice-review-token.ts')
const helper=deps['@/lib/native-voice-history-actions']=load('lib/native-voice-history-actions.ts')
const ratings=load('app/api/checkins/ratings/route.ts'),tips=load('app/api/health-tips/history/route.ts')
for(const [endpoint,route]of [['@/app/api/checkins/ratings/route',ratings],['@/app/api/health-tips/history/route',tips]])deps[endpoint]=Object.fromEntries(Object.keys(route).map(method=>[method,(req,...args)=>{calls.push({method,url:req.url,headers:new Headers(req.headers)});return route[method](req,...args)}]))
const req=(cap=true,url='https://helfi.invalid/api/native/voice-assistant',body,method='GET')=>new NextRequest(url,{method,headers:{authorization:'Bearer synthetic-token','x-native-token':'original-synthetic-header','x-helfi-voice-action-id':'synthetic-correlation',...(cap?{'x-helfi-voice-capabilities':'additional-actions-v1,report-pdf-v1'}:{}),...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})})
const prepare=(kind,values,transcript=`Delete the selected ${kind==='coach'?'Health Coach':'daily check-in'} history entries`,request=req())=>helper.prepareVoiceHistoryAction(request,owner,{action:kind==='coach'?'coach_history.delete':'checkin_history.delete',values},transcript,'2026-10-17')
const execute=(draft,request=req())=>helper.executeVoiceHistoryAction(request,owner,draft,{receiptClaimed:true,actionId:'synthetic-action-id'})
const rating=(id,userId=owner,issueId='issue-stress',date='2026-10-17')=>({id,userId,issueId,date,timestamp:now,value:3,note:'Exact synthetic note.',isNa:false})
const tip=(id,userId=owner,date='2026-10-17')=>({id,userId,tipDate:date,sentAt:now,title:'Synthetic coach title',body:'Private synthetic body.',category:'lifestyle',metadata:{suggestedQuestions:['Synthetic question'],safetyNote:null},costCents:1,chargeCents:null})
function reset(){actor=owner;mode='normal';calls.length=queries.length=writes.length=0;transactions=[];state={issues:[{id:'issue-stress',userId:owner,name:'Stress',polarity:'negative'},{id:'issue-energy',userId:owner,name:'Energy',polarity:'positive'}],ratings:[rating('rating-a'),rating('rating-b',owner,'issue-energy','2026-10-16'),rating('rating-foreign',other)],tips:[tip('tip-a'),tip('tip-b',owner,'2026-10-16'),tip('tip-foreign',other)]}}
let count=0
async function check(name,run){reset();await run();count++;console.log('PASS '+name)}
async function main(){
 await check('schemas, old app, account, missing selection and negation fail before mutation',async()=>{
  assert.deepEqual(Object.keys(helper.VOICE_HISTORY_ACTION_SCHEMAS),['coach_history.delete','checkin_history.delete'])
  await assert.rejects(()=>prepare('coach',{ids:['tip-a']},undefined,req(false)),/updated Helfi/);assert.equal(calls.length,0)
  for(const values of [{},{ids:[]},{ids:['tip-a','tip-a']},{ids:['tip-a'],all:true},{query:'Synthetic coach title',endpoint:'/bad'},{all:false},{periodStart:'2026-02-30',periodEnd:'2026-10-17'}])await assert.rejects(()=>prepare('coach',values))
  for(const text of ["Don't delete all Health Coach history",'How do I delete all Health Coach history?','Delete all daily check-in history'])await assert.rejects(()=>prepare('coach',{all:true},text))
  await assert.rejects(()=>prepare('coach',{all:true},'Delete my Health Coach history'),/explicitly/)
  await assert.rejects(()=>prepare('coach',{all:true},'Delete the Health Coach history entry titled All history'),/explicitly/)
  actor=other;await assert.rejects(()=>prepare('coach',{ids:['tip-a']}),/same account/);assert.equal(writes.length,0)
 })
 await check('exact own selected IDs produce signed count and readable dates without private bodies',async()=>{
  const draft=await prepare('coach',{ids:['tip-a']});assert.equal(draft.canConfirm,true);assert.equal(draft.additionalAction.count,1);assert.deepEqual(copy(draft.additionalAction.values.ids),['tip-a']);assert.equal(review.verifyNativeVoiceDraft(owner,draft),true)
  assert.match(draft.confirmationMessage,/exactly 1/);assert.match(draft.confirmationMessage,/2026-10-17/);assert(!draft.confirmationMessage.includes('Private synthetic body'));assert.equal(writes.length,0)
  for(const values of [{ids:['tip-foreign']},{ids:['missing']},{ids:['tip-a','missing']}])await assert.rejects(()=>prepare('coach',values))
 })
 await check('complete all-history review captures exactly owned rows and preserves later arrivals/other account',async()=>{
  const draft=await prepare('checkin',{all:true},'Delete all my daily check-in history');assert.equal(draft.additionalAction.count,2)
  state.ratings.push(rating('later-arrival'))
  const result=await execute(draft);assert.equal(result.status,'completed');assert.deepEqual(copy(result.ids),['rating-a','rating-b']);assert.deepEqual(copy(result.deletedIds),copy(result.ids));assert.equal(result.count,2);assert.equal(result.saved,true);assert.equal(result.changed,true)
  assert.deepEqual(state.ratings.map(row=>row.id),['rating-foreign','later-arrival']);assert(!JSON.stringify(result).includes('Exact synthetic note'))
  assert.deepEqual(transactions,[{maxWait:5000,timeout:15000}]);assert(queries.some(row=>/FOR UPDATE OF r$/.test(row.sql)));assert(queries.some(row=>/FOR SHARE$/.test(row.sql)))
 })
 await check('Health Coach exact deletion returns verified IDs and all-absent replay cannot claim a second delete',async()=>{
  const draft=await prepare('coach',{ids:['tip-b','tip-a']}),result=await execute(draft);assert.equal(result.kind,'history_action');assert.equal(result.actionId,'synthetic-action-id');assert.equal(result.count,2);assert.deepEqual(copy(result.deletedIds),['tip-a','tip-b']);assert.deepEqual(state.tips.map(row=>row.id),['tip-foreign'])
  const before=writes.length,again=await execute(draft);assert.equal(again.status,'already_absent');assert.equal(again.count,0);assert.equal(again.saved,false);assert.equal(again.changed,false);assert.deepEqual(copy(again.deletedIds),[]);assert.deepEqual(copy(again.ids),['tip-a','tip-b']);assert.equal(writes.length,before)
 })
 await check('exact issue name and historical date-range scope retain unrelated ratings and orphan rows remain selectable',async()=>{
  state.ratings.push(rating('orphan',owner,'old-deleted-issue'))
  const exact=await prepare('checkin',{query:'Stress'});assert.deepEqual(copy(exact.additionalAction.values.ids),['rating-a']);await execute(exact);assert(state.ratings.some(row=>row.id==='rating-b'))
  const orphan=await prepare('checkin',{ids:['orphan']});assert.equal(orphan.additionalAction.expectedRows[0].name,null);await execute(orphan)
  const range=await prepare('checkin',{periodStart:'2026-10-16',periodEnd:'2026-10-16'});assert.deepEqual(copy(range.additionalAction.values.ids),['rating-b'])
  assert(queries.some(row=>row.sql.includes('r.date BETWEEN $2 AND $3')));assert(!queries.some(row=>row.sql.includes('r.date BETWEEN $2::date')))
 })
 await check('duplicate coach titles clarify instead of selecting multiple; selected period resolves the exact entry',async()=>{
  const draft=await prepare('coach',{query:'Synthetic coach title'});assert.equal(draft.canConfirm,false);assert.equal(draft.choices.length,2)
  const exact=await prepare('coach',{query:'Synthetic coach title',periodStart:'2026-10-17',periodEnd:'2026-10-17'});assert.equal(exact.canConfirm,true);assert.deepEqual(copy(exact.additionalAction.values.ids),['tip-a'])
  await execute(exact);assert(state.tips.some(row=>row.id==='tip-b'))
 })
 await check('case-variant issue names clarify across issue IDs but multiple dates of one issue stay valid',async()=>{
  state.ratings.push(rating('rating-old-stress',owner,'issue-stress','2026-10-15'))
  const dates=await prepare('checkin',{query:'Stress'});assert.equal(dates.canConfirm,true);assert.equal(dates.additionalAction.count,2)
  state.issues.push({id:'case-variant',userId:owner,name:'stress',polarity:'negative'});state.ratings.push(rating('rating-case-variant',owner,'case-variant'))
  const ambiguous=await prepare('checkin',{query:'Stress'});assert.equal(ambiguous.canConfirm,false);assert.equal(ambiguous.choices.length,3);assert.equal(writes.length,0)
 })
 await check('row value/note/date/timestamp/issue-context changes each reject the whole rating set before deletion',async()=>{
  for(const [field,value]of [['value',4],['note','Changed note'],['isNa',true],['timestamp','2026-10-17T01:00:01.000Z'],['date','2026-10-16'],['issueId','issue-energy']]){reset();const draft=await prepare('checkin',{all:true},'Delete all daily check-in history');state.ratings[0][field]=value;await assert.rejects(()=>execute(draft));assert.equal(writes.length,0);assert.equal(state.ratings.length,3)}
  for(const field of ['name','polarity']){reset();const draft=await prepare('checkin',{ids:['rating-a']});state.issues[0][field]='Changed';await assert.rejects(()=>execute(draft));assert.equal(writes.length,0)}
 })
 await check('coach text/category/date/metadata/billing-context changes each reject before deleting',async()=>{
  for(const [field,value]of [['title','Changed'],['body','Changed'],['category','food'],['tipDate','2026-10-15'],['sentAt','2026-10-17T02:00:00.000Z'],['metadata',{suggestedQuestions:['Changed']}],['costCents',2],['chargeCents',0]]){reset();const draft=await prepare('coach',{ids:['tip-a']});state.tips[0][field]=value;await assert.rejects(()=>execute(draft));assert.equal(writes.length,0)}
 })
 await check('partial missing targets, tampered signed fields, absent claim and expired review refuse',async()=>{
  const draft=await prepare('checkin',{all:true},'Delete all daily check-in history');state.ratings=state.ratings.filter(row=>row.id!=='rating-a');await assert.rejects(()=>execute(draft));assert.equal(writes.length,0)
  await assert.rejects(()=>execute({...draft,summary:'Tampered'}));await assert.rejects(()=>helper.executeVoiceHistoryAction(req(),owner,draft,{receiptClaimed:false,actionId:'bad'}))
  const expired={...draft,reviewIssuedAt:Date.now()-31*60*1000};expired.reviewToken=review.signNativeVoiceDraft(owner,expired);await assert.rejects(()=>execute(expired));actor=other;await assert.rejects(()=>execute(draft),/same account/);assert.equal(writes.length,0)
 })
 await check('ignored writes, wrong/partial IDs and thrown private failures rollback every selected row',async()=>{
  for(const failure of ['ignored-delete','partial-return','wrong-return','throw-after-delete']){reset();const draft=await prepare('coach',{ids:['tip-a','tip-b']}),before=copy(state);mode=failure;await assert.rejects(()=>execute(draft),error=>!error.message.includes('PRIVATE'));assert.deepEqual(state,before);assert.equal(transactions.length,1)}
 })
 await check('1001 matching entries refuse incomplete review while a bounded exact-ID selection remains valid',async()=>{
  state.tips=Array.from({length:1001},(_,index)=>tip('many-'+String(index).padStart(4,'0')))
  await assert.rejects(()=>prepare('coach',{all:true},'Delete all Health Coach history'),/full selected history/);assert.equal(writes.length,0)
  const exact=await prepare('coach',{ids:['many-1000']});assert.equal(exact.canConfirm,true);await execute(exact);assert.equal(state.tips.length,1000)
 })
 await check('oversized notes/body refuse the whole snapshot rather than signing a truncated comparison',async()=>{
  state.tips[0].body='Synthetic body '.repeat(80000);await assert.rejects(()=>prepare('coach',{ids:['tip-a']}));assert.equal(writes.length,0)
  state.ratings[0].note='Synthetic note '.repeat(80000);await assert.rejects(()=>prepare('checkin',{ids:['rating-a']}));assert.equal(writes.length,0)
 })
 await check('original auth/capability/correlation pass only to fixed normal endpoints and no DDL runs',async()=>{
  for(const kind of ['coach','checkin']){const draft=await prepare(kind,{ids:[kind==='coach'?'tip-a':'rating-a']});await execute(draft)}
  for(const call of calls){assert(['https://helfi.invalid/api/checkins/ratings','https://helfi.invalid/api/health-tips/history'].includes(call.url.split('?')[0]));assert.equal(call.headers.get('authorization'),'Bearer synthetic-token');assert.equal(call.headers.get('x-native-token'),'original-synthetic-header');assert.equal(call.headers.get('x-helfi-voice-action-id'),'synthetic-correlation');assert(call.headers.get('x-helfi-voice-capabilities').includes('additional-actions-v1'))}
  assert(!queries.some(row=>row.manual));for(const write of writes){assert.equal(write.userId,owner);assert.equal(write.ids.length,1)}
 })
 await check('normal new endpoints authenticate, reject malformed scope/foreign expected rows and sanitize failures',async()=>{
  actor=null;assert.equal((await ratings.GET(req(true,'https://helfi.invalid/api/checkins/ratings?voiceSnapshot=1'))).status,401);assert.equal((await tips.DELETE(req(true,'https://helfi.invalid/api/health-tips/history',{action:'delete-reviewed',expectedRows:[]},'DELETE'))).status,401)
  actor=owner;for(const suffix of ['', '?voiceSnapshot=1&query=x&query=y','?voiceSnapshot=1&all=true','?voiceSnapshot=1&start=2026-10-17'])assert.equal((await ratings.GET(req(true,'https://helfi.invalid/api/checkins/ratings'+suffix))).status,400)
  const bad=await ratings.POST(req(true,'https://helfi.invalid/api/checkins/ratings',{action:'delete-reviewed',expectedRows:[{...rating('foreign',other),name:'Stress',polarity:'negative'}]},'POST'));assert.equal(bad.status,400)
  mode='private-read-error';const failed=await tips.GET(req(true,'https://helfi.invalid/api/health-tips/history?voiceSnapshot=1'));assert.equal(failed.status,500);assert(!JSON.stringify(await failed.json()).includes('PRIVATE'));assert.equal(writes.length,0)
 })
 await check('existing manual bulk rating actions and selected coach DELETE retain their contracts',async()=>{
  assert.equal((await ratings.POST(req(true,'https://helfi.invalid/api/checkins/ratings',{action:'delete-by-issues',issueIds:['issue-stress']},'POST'))).status,200);assert.deepEqual(state.ratings.map(row=>row.id),['rating-b','rating-foreign'])
  assert.equal((await ratings.POST(req(true,'https://helfi.invalid/api/checkins/ratings',{action:'delete-all'},'POST'))).status,200);assert.deepEqual(state.ratings.map(row=>row.id),['rating-foreign'])
  const normal=await tips.DELETE(req(true,'https://helfi.invalid/api/health-tips/history',{ids:['tip-a']},'DELETE'));assert.equal(normal.status,200);const data=await normal.json();assert.deepEqual(data.deletedIds,['tip-a']);assert.equal(data.deletedCount,1);assert(state.tips.some(row=>row.id==='tip-foreign'))
 })
 await check('actual preparation POST routes natural history requests to signed review; actual confirm stores URL/notes-free receipt and replays once',async()=>{
  const matrix=fs.readFileSync(path.join(__dirname,'voice-action-matrix-check.cjs'),'utf8').replace(/^#!.*\n/,'');const end=matrix.indexOf('async function run() {');assert(end>0)
  const ctx=new Function('require','__dirname',matrix.slice(0,end)+'\nreturn ctx')(require,__dirname)
  const base=fs.readFileSync(path.join(__dirname,'voice-save-integrity-check.cjs'),'utf8').replace(/^#!.*\n/,'');const boundary=base.indexOf('async function run() {');assert(boundary>0)
  const fixture=new Function('require','__dirname',base.slice(0,boundary)+'\nreturn {harness,AuditDate}')(require,__dirname);fixture.AuditDate.setNow(Date.now())
  ctx.getOpenAIClient=()=>({syntheticOnly:true});ctx.prepareVoiceHistoryAction=helper.prepareVoiceHistoryAction;ctx.signNativeVoiceDraft=review.signNativeVoiceDraft;ctx.verifyNativeVoiceDraft=review.verifyNativeVoiceDraft
  const h=fixture.harness();Object.assign(h.route,{executeVoiceHistoryAction:helper.executeVoiceHistoryAction,verifyNativeVoiceDraft:review.verifyNativeVoiceDraft})
  for(const kind of ['coach','checkin']){
   const action=kind==='coach'?'coach_history.delete':'checkin_history.delete',text=kind==='coach'?'Delete all my Health Coach history':'Delete all my daily check-in history';let understandings=0
   ctx.runJsonCommandModel=async()=>{understandings++;return{parsed:{action:'additional_action',additionalAction:{action,values:{all:true}}},wrapped:{costCents:0,promptTokens:0,completionTokens:0},usedModel:'synthetic-no-provider-boundary'}}
   assert.equal(ctx.needsReviewedAppControl(text,null),true)
   const request=(cap=true)=>req(cap,'https://helfi.invalid/api/native/voice-assistant',{transcript:text,localDate:'2026-10-17',tzOffsetMin:0,aiConsentGranted:true,voiceReply:false},'POST')
   const old=await ctx.POST(request(false));assert.equal(old.status,200);assert.equal(old.body.draft.canConfirm,false);assert.match(old.body.draft.confirmationMessage,/updated Helfi/)
   const prepared=await ctx.POST(request());assert.equal(prepared.status,200);const draft=prepared.body.draft;assert.equal(draft.action,'additional_action');assert.equal(draft.additionalAction.action,action);assert.equal(draft.canConfirm,true,JSON.stringify(prepared.body));assert.equal(draft.additionalAction.count,2);assert(review.verifyNativeVoiceDraft(owner,draft));assert.equal(understandings,2)
   const before=writes.length,confirm=()=>h.route.POST(req(true,'https://helfi.invalid/api/native/voice-assistant/confirm',{draft},'POST'))
   const saved=await confirm();assert.equal(saved.status,200,JSON.stringify(saved.body));assert.equal(saved.body.result.kind,'history_action');assert.equal(saved.body.result.action,action);assert.equal(saved.body.result.count,2);assert.equal(writes.length,before+1)
   const receipt=JSON.stringify(saved.body.result);for(const privateField of ['expectedRows','body','note','metadata','http'])assert(!receipt.includes(privateField))
   fixture.AuditDate.setNow(Date.now()+31*60*1000);const replay=await confirm();assert.equal(replay.status,200,JSON.stringify(replay.body));assert.equal(replay.body.idempotentReplay,true);assert.deepEqual(copy(replay.body.result),copy(saved.body.result));assert.equal(writes.length,before+1);fixture.AuditDate.setNow(Date.now())
  }
 })
 await check('actual confirmation retains pending receipt after lost completion and cannot repeat deletion',async()=>{
  const base=fs.readFileSync(path.join(__dirname,'voice-save-integrity-check.cjs'),'utf8').replace(/^#!.*\n/,'');const boundary=base.indexOf('async function run() {')
  const fixture=new Function('require','__dirname',base.slice(0,boundary)+'\nreturn {harness,AuditDate}')(require,__dirname);fixture.AuditDate.setNow(Date.now())
  const h=fixture.harness(),draft=await prepare('coach',{ids:['tip-a']});let executions=0
  h.route.verifyNativeVoiceDraft=review.verifyNativeVoiceDraft;h.route.executeVoiceHistoryAction=async(...args)=>{executions++;await helper.executeVoiceHistoryAction(...args);throw Error('Synthetic lost completion after submitted delete')}
  const confirm=()=>h.route.POST(req(true,'https://helfi.invalid/api/native/voice-assistant/confirm',{draft},'POST'))
  assert.equal((await confirm()).status,500);assert(!state.tips.some(row=>row.id==='tip-a'));const before=writes.length,retry=await confirm();assert.equal(retry.status,409);assert.equal(retry.body.code,'voice_save_result_unconfirmed');assert.equal(executions,1);assert.equal(writes.length,before);assert(state.tips.some(row=>row.id==='tip-b'))
 })
 console.log(`Voice history actions: ${count} actual-source offline groups passed; no real history deletion, provider, credentials or database calls.`)
}
main().catch(error=>{console.error(error);process.exitCode=1})
