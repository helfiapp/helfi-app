#!/usr/bin/env node
'use strict'
// Actual preference adapter with synthetic authenticated manual-handler replies.
// No app imports, network, env files, provider calls or real account/database.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const root = path.resolve(__dirname, '..')
const code = ts.transpileModule(fs.readFileSync(path.join(root,'lib/native-voice-preference-actions.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText
let state, writes, readCount, mode
const copy=value=>JSON.parse(JSON.stringify(value))
function reset(){
  state={user:{gender:'male',weight:'80',height:'180',healthSetupUpdatedAt:1234,profileInfo:{firstName:'Old',lastName:'Name',bio:'Keep',dateOfBirth:'1990-01-01',email:'synthetic@example.invalid'},goals:['Sleep'],dietTypes:['Mediterranean'],allergies:['Peanut'],healthSituations:{healthIssues:'Keep',healthProblems:'Keep too',additionalInfo:'Other',skipped:false},healthCheckSettings:{enabled:true,frequency:'high',dailyCap:4,thresholds:{sugar:20,carbs:50,fat:10}}},hydration:{targetMl:2000,source:'custom',updatedAt:'synthetic'},checkin:{enabled:true,time1:'12:30',time2:'18:30',time3:'21:30',time4:'09:00',timezone:'Australia/Melbourne',frequency:2,maxFrequency:4},mood:{enabled:false,time1:'20:00',time2:'12:00',time3:'18:00',time4:'09:00',timezone:'Australia/Melbourne',frequency:1,maxFrequency:1},quiet:{enabled:false,startTime:'22:00',endTime:'07:00',timezone:'Australia/Melbourne'},weekly:{reportsEnabled:false},coach:{enabled:false,timezone:'Australia/Melbourne',timezoneManual:false},history:[{issueId:'own-sleep',name:'Sleep',date:'2026-10-15',value:2,note:'Keep this note',isNa:false}]}
  writes=[];readCount=0;mode='ok'
}
const response=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}})
class NextRequest extends Request {get nextUrl(){return new URL(this.url)}}
function authorized(req){return req.headers.get('authorization')==='Bearer synthetic-owner'}
const pathToKey={'/api/user-data':'user','/api/hydration-goal':'hydration','/api/checkins/settings':'checkin','/api/mood/reminders':'mood','/api/notifications/quiet-hours':'quiet','/api/reports/weekly/preferences':'weekly','/api/health-tips/settings':'coach','/api/checkins/history':'history'}
const handler=base=>({
  GET:async req=>{
    readCount++;if(!authorized(req)||mode==='unauthorized')return response({error:'Unauthorized'},401)
    const key=pathToKey[base];let value=copy(state[key])
    if(key==='user')value={data:value};if(key==='history')value={history:value}
    return response(value)
  },
  POST:async req=>{
    if(!authorized(req))return response({error:'Unauthorized'},401)
    const body=await req.json();writes.push({base,method:'POST',body,authorization:req.headers.get('authorization'),cookie:req.headers.get('cookie')})
    if(mode==='failed')return response({error:'save failed'},500)
    if(mode==='skipped')return response({success:true,skipped:true,reason:'stale_health_setup_payload'})
    if(mode==='ignored')return response({success:true})
    const key=pathToKey[base]
    if(key==='weekly')state.weekly.reportsEnabled=body.enabled
    else if(key==='hydration')state.hydration={targetMl:body.targetMl,source:'custom',updatedAt:'after'}
    else if(key==='user'){
      if(body.profileInfo)state.user.profileInfo=body.profileInfo
      for(const [field,value]of Object.entries(body))if(field!=='profileInfo')state.user[field]=value
    }else state[key]={...state[key],...body}
    return response({success:true,scheduleResults:mode==='schedule_failed'?[{scheduled:false}]:[{scheduled:true}]})
  },
  DELETE:async req=>{if(!authorized(req))return response({error:'Unauthorized'},401);writes.push({base,method:'DELETE'});state.hydration={targetMl:2400,source:'auto',updatedAt:null};return response({ok:true})},
})
const mocks={}
for(const base of Object.keys(pathToKey))mocks[`@/app${base}/route`]=handler(base)
mocks['@/app/api/checkins/ratings/route']={PATCH:async req=>{
  if(!authorized(req))return response({error:'Unauthorized'},401)
  const body=await req.json();writes.push({base:'/api/checkins/ratings',method:'PATCH',body});const row=state.history.find(row=>row.issueId===body.issueId&&row.date===body.date);Object.assign(row,body);return response({success:true})
},DELETE:async req=>{
  if(!authorized(req))return response({error:'Unauthorized'},401)
  const params=new URL(req.url).searchParams;const issueId=params.get('issueId');const date=params.get('date')
  writes.push({base:'/api/checkins/ratings',method:'DELETE',issueId,date})
  if(mode==='failed')return response({error:'delete failed'},500)
  if(mode!=='ignored')state.history=state.history.filter(row=>row.issueId!==issueId||row.date!==date)
  return response({success:true})
}}
mocks['@/app/api/checkins/today/route']={
  GET:async req=>{
    readCount++;if(!authorized(req)||mode==='unauthorized')return response({error:'Unauthorized'},401)
    const date=new URL(req.url).searchParams.get('localDate')
    return response({issues:state.issues||[{id:'own-sleep',name:'Sleep'},{id:'own-energy',name:'Energy'}],ratings:state.history.filter(row=>row.date===date)})
  },POST:async req=>{
    if(!authorized(req))return response({error:'Unauthorized'},401)
    const body=await req.json();writes.push({base:'/api/checkins/today',method:'POST',body,authorization:req.headers.get('authorization'),cookie:req.headers.get('cookie')})
    if(mode==='failed')return response({error:'save failed'},500)
    if(mode==='ignored')return response({success:true})
    for(const rating of body.ratings){state.history=state.history.filter(row=>row.issueId!==rating.issueId||row.date!==body.localDate);state.history.push({...rating,date:body.localDate,timestamp:'synthetic-new-rating'})}
    return response({success:true})
  },
}
const moduleBox={exports:{}}
const preferenceContext={module:moduleBox,exports:moduleBox.exports,Request,Response,Headers,URL,Date,console,require:request=>request==='next/server'?{NextRequest}:request==='crypto'?require('node:crypto'):mocks[request]||(()=>{throw Error('Unexpected dependency '+request)})()}
vm.runInNewContext(code,preferenceContext,{filename:'native-voice-preference-actions.vm.js'})
const api=moduleBox.exports
// Execute the exact changed manual-handler blocks too, so empty-list parity is
// not established solely by the adapter's synthetic handler implementation.
const userDataSource=fs.readFileSync(path.join(root,'app/api/user-data/route.ts'),'utf8')
const userDataAst=ts.createSourceFile('user-data.ts',userDataSource,ts.ScriptTarget.Latest,true)
let goalsBlock,exerciseBlock,profileBlock,metabolicGenderBlock
function findBlocks(node){
  if(ts.isBlock(node)&&node.statements.some(item=>ts.isVariableStatement(item)&&item.declarationList.declarations.some(value=>value.name.getText(userDataAst)==='profileUpdateData')))profileBlock=node.getText(userDataAst)
  if(ts.isIfStatement(node)&&node.expression.getText(userDataAst)==='data.gender'&&node.thenStatement.getText(userDataAst).includes('updateData.gender'))metabolicGenderBlock=node.getText(userDataAst)
  if(ts.isTryStatement(node)&&node.tryBlock.getText(userDataAst).includes('const hasGoalsPayload')&&!node.tryBlock.getText(userDataAst).includes('POST /api/user-data DEBUG'))goalsBlock=node.getText(userDataAst)
  if(ts.isIfStatement(node)&&node.expression.getText(userDataAst)==='Array.isArray(data.exerciseTypes)')exerciseBlock=node.getText(userDataAst)
  ts.forEachChild(node,findBlocks)
}
findBlocks(userDataAst)
assert(goalsBlock&&exerciseBlock&&profileBlock&&metabolicGenderBlock,'Actual changed manual-handler blocks must be present')
async function actualProfileBlock(profileInfoPayload,metabolic='MALE',data={}){
  const writes=[],context=vm.createContext({profileInfoPayload,data,user:{id:'synthetic-owner'},prisma:{user:{update:async query=>{writes.push(copy(query.data));return query.data}},healthGoal:{deleteMany:async()=>{},create:async()=>({})}},console:{log(){},error(){}},updateData:{}})
  // Exact normal profile basic-field statements, ending before unrelated special-row storage.
  const blockAst=ts.createSourceFile('profile-block.ts',profileBlock,ts.ScriptTarget.Latest,true)
  const block=blockAst.statements[0]
  const boundary=block.statements.findIndex(node=>node.getText(blockAst).includes('prisma.healthGoal.deleteMany'))
  const start=block.statements.findIndex(node=>ts.isVariableStatement(node)&&node.declarationList.declarations.some(value=>value.name.getText(blockAst)==='profileUpdateData'))
  assert(start>=0&&boundary>start)
  const source=block.statements.slice(start,boundary).map(node=>node.getText(blockAst)).join('\n')
  await vm.runInContext(ts.transpileModule(`(async()=>{${metabolicGenderBlock};${source}})()`,{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText,context)
  for(const write of writes)if('gender'in write)metabolic=write.gender
  if('gender'in context.updateData)metabolic=context.updateData.gender
  return {metabolic,writes,display:profileInfoPayload.gender}
}
async function actualListBlocks(data,stamp,initialNames=['Sleep','Energy']){
  const fixture={goals:[...initialNames.map(name=>({id:`own-${name.toLowerCase()}`,userId:'synthetic-owner',name})),{id:'hidden',userId:'synthetic-owner',name:'__FOOD_FAVORITES__'},{id:'foreign',userId:'other',name:'Sleep'}],selected:{id:'selected',category:JSON.stringify(initialNames)},commands:[],issues:[...initialNames]}
  const prisma={healthGoal:{
    findMany:async query=>fixture.goals.filter(g=>g.userId===query.where.userId&&!g.name.startsWith('__')),
    deleteMany:async query=>{fixture.commands.push(query);if(query.where.name?.in)fixture.goals=fixture.goals.filter(g=>g.userId!==query.where.userId||!query.where.name.in.includes(g.name));return {count:1}},
    createMany:async()=>{},findFirst:async()=>fixture.selected,
    update:async query=>{fixture.selected={id:'selected',...query.data};return fixture.selected},
    create:async query=>{fixture.selected={id:'selected',...query.data};return fixture.selected},
  },$executeRawUnsafe:async(query,...args)=>{if(/^DELETE FROM CheckinIssues WHERE userId = \$1$/.test(query.trim()))fixture.issues=[];if(/^DELETE FROM CheckinIssues WHERE userId = \$1 AND name NOT IN /.test(query.trim()))fixture.issues=fixture.issues.filter(name=>args.slice(1).includes(name));fixture.commands.push({query,args})},$queryRawUnsafe:async(query,...args)=>{if(/^INSERT INTO CheckinIssues /.test(query.trim())&&!fixture.issues.includes(args[2]))fixture.issues.push(args[2]);return []}}
  const context={prisma,data,user:{id:'synthetic-owner'},hasIncomingHealthSetupStamp:stamp,updateData:{},crypto:require('node:crypto'),console:{log(){},error(){}}}
  vm.createContext(context)
  const executable=`globalThis.result=(async()=>{${exerciseBlock};${goalsBlock};return updateData})()`
  vm.runInContext(ts.transpileModule(executable,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.None}}).outputText,context)
  const updateData=await context.result
  return {fixture,updateData}
}
const request=()=>new NextRequest('https://helfi.ai/api/native/voice-assistant',{method:'POST',headers:{authorization:'Bearer synthetic-owner',cookie:'unrelated=preserved','content-type':'application/json'},body:'{}'})
const prepare=(action,values,transcript)=>api.prepareVoicePreferenceAction(request(),'synthetic-owner',{action,values},transcript?{transcript}:undefined)
const execute=prepared=>api.executeVoicePreferenceAction(request(),'synthetic-owner',prepared)
const mainAst=ts.createSourceFile('voice-route.ts',fs.readFileSync(path.join(root,'app/api/native/voice-assistant/route.ts'),'utf8'),ts.ScriptTarget.Latest,true)
const mainBindings=mainAst.statements.filter(node=>ts.isFunctionDeclaration(node)&&['cleanText','hasSelfHarmRisk','normalizeDraft'].includes(node.name?.text)||ts.isVariableStatement(node)&&node.declarationList.declarations.some(item=>item.name.getText(mainAst)==='SELF_HARM_RISK_PATTERN')).map(node=>node.getText(mainAst)).join('\n')
const mainContext=vm.createContext({...api,console:{log(){},warn(){},error(){}},Intl,Date})
vm.runInContext(ts.transpileModule(mainBindings,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText,mainContext)
const nativeCheckinAst=ts.createSourceFile('DailyCheckInScreen.tsx',fs.readFileSync(path.join(root,'native/src/screens/DailyCheckInScreen.tsx'),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX)
let nativeQuestion
function findQuestion(node){if(ts.isVariableDeclaration(node)&&node.name.getText(nativeCheckinAst)==='getQuestion')nativeQuestion=node.initializer.getText(nativeCheckinAst);ts.forEachChild(node,findQuestion)}
findQuestion(nativeCheckinAst);assert(nativeQuestion,'Actual native issue question must be present')
const questionContext=vm.createContext({})
vm.runInContext(ts.transpileModule(`globalThis.question=${nativeQuestion}`,{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText,questionContext)
function actualCheckinHandlers(initial){
  let data=copy(initial)
  const readQuery=(query,...args)=>{
    if(query.includes('FROM CheckinIssues'))return data.issues.filter(row=>row.userId===args[0]&&(args.length===1||args.slice(1).includes(row.id))).map(row=>({id:row.id,name:row.name,polarity:row.polarity||'positive'}))
    if(query.includes('FROM CheckinRatings'))return data.ratings.filter(row=>row.userId===args[0]&&row.date===args[1]).slice().reverse()
    throw Error('Unexpected synthetic checkin read '+query)
  }
  const client=get=>({
    $executeRaw:async query=>{
      const sql=query.parts.join('?')
      if(sql.includes('DELETE FROM CheckinRatings')){const [userId,date,ids]=query.values;get().ratings=get().ratings.filter(row=>!(row.userId===userId&&row.date===date&&ids.join.includes(row.issueId)));return 1}
      if(sql.includes('INSERT INTO CheckinRatings')){for(const row of query.values[0].join){const [id,userId,issueId,date,value,note,isNa]=row.values;get().ratings.push({id,userId,issueId,date,value,note,isNa,timestamp:'2026-10-17T01:00:00.000Z'})}return 1}
      throw Error('Unexpected synthetic checkin write '+sql)
    },
  })
  const prisma={...client(()=>data),$queryRawUnsafe:async(...args)=>readQuery(...args),$executeRawUnsafe:async(query,...args)=>{
    assert(query.startsWith('DELETE FROM CheckinRatings WHERE userId = $1 AND date = $2 AND issueId = $3'))
    const before=data.ratings.length;data.ratings=data.ratings.filter(row=>!(row.userId===args[0]&&row.date===args[1]&&row.issueId===args[2]));return before-data.ratings.length
  },$transaction:async fn=>{const working=copy(data);const result=await fn(client(()=>working));data=working;return result}}
  const load=relative=>{
    const source=ts.createSourceFile(relative,fs.readFileSync(path.join(root,relative),'utf8'),ts.ScriptTarget.Latest,true)
    const printer=ts.createPrinter();const stripped=source.statements.filter(node=>!ts.isImportDeclaration(node)).map(node=>printer.printNode(ts.EmitHint.Unspecified,node,source)).join('\n').replace(/^export\s+/gm,'')
    const context=vm.createContext({URL,Date,crypto:require('node:crypto'),prisma,Prisma:{sql:(parts,...values)=>({parts:Array.from(parts),values}),join:join=>({join})},getCheckinUser:async req=>authorized(req)?{id:'synthetic-owner'}:null,
      NextResponse:{json:(body,options)=>response(body,options?.status||200)},deleteNotificationsByType:async()=>{},console:{log(){},error(){},warn(){}}})
    vm.runInContext(ts.transpileModule(stripped,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText,context)
    if(relative.includes('/today/'))vm.runInContext('checkinTablesEnsured=true',context) // Existing DDL is outside this offline behavior test.
    return context
  }
  return {today:load('app/api/checkins/today/route.ts'),ratings:load('app/api/checkins/ratings/route.ts'),state:()=>data}
}
let checks=0
function actualCoachSettings(initial={}){
  let stored={enabled:false,time1:'08:00',time2:'11:00',time3:'14:00',timezone:'Australia/Melbourne',timezoneManual:false,frequency:5,focusFood:true,focusSupplements:true,focusLifestyle:true,pricingAcceptedAt:null,...initial},account='synthetic-owner',scheduleFails=false
  const posted=[],scheduled=[],authSeen=[]
  const smartSource=ts.createSourceFile('smart-health-coach.ts',fs.readFileSync(path.join(root,'lib/smart-health-coach.ts'),'utf8'),ts.ScriptTarget.Latest,true)
  let timesDeclaration;function findTimes(node){if(ts.isVariableDeclaration(node)&&node.name.getText(smartSource)==='SMART_COACH_AUTO_CHECK_TIMES')timesDeclaration=node.getText(smartSource);ts.forEachChild(node,findTimes)}findTimes(smartSource);assert(timesDeclaration)
  const timesBox={};vm.runInNewContext(ts.transpileModule(`const ${timesDeclaration};globalThis.times=SMART_COACH_AUTO_CHECK_TIMES`,{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText,timesBox)
  const prisma={user:{findUnique:async({where})=>account&&(where.id===account||where.email===account+'@example.invalid')?{id:account,email:account+'@example.invalid'}:null},$executeRawUnsafe:async sql=>{assert(/^(?:CREATE TABLE|ALTER TABLE)/.test(sql.trim()));return 0},$queryRawUnsafe:async(sql,...args)=>{
    assert.equal(args[0],account);const normalized=sql.replace(/\s+/g,' ').trim()
    if(normalized.startsWith('SELECT enabled FROM HealthTipSettings'))return[{enabled:stored.enabled}]
    if(normalized.startsWith('SELECT')&&normalized.includes('FROM HealthTipSettings'))return[copy(stored)]
    assert(normalized.startsWith('INSERT INTO HealthTipSettings'))
    const [,enabled,time1,time2,time3,timezone,timezoneManual,frequency,focusFood,focusSupplements,focusLifestyle]=args
    Object.assign(stored,{enabled,time1,time2,time3,timezone,timezoneManual,frequency,focusFood,focusSupplements,focusLifestyle});return[]
  }}
  const box={module:{exports:{}},exports:null,Request,Response,Headers,URL,Date,Intl,console:{error(){},warn(){},log(){}},require:name=>{
    const dependencies={'next/server':{NextRequest,NextResponse:{json:(body,options)=>response(body,options?.status||200)}},'next-auth':{getServerSession:async()=>account?{user:{email:account+'@example.invalid'}}:null},'@/lib/auth':{authOptions:{}},'@/lib/native-auth':{getUserIdFromNativeAuth:async req=>{authSeen.push({authorization:req.headers.get('authorization'),cookie:req.headers.get('cookie')});return authorized(req)?account:null}},'@/lib/prisma':{prisma},'@/lib/qstash':{scheduleHealthTipWithQStash:async(userId,time,timezone)=>{scheduled.push({userId,time,timezone});return{scheduled:!scheduleFails}}},'@/lib/smart-health-coach':{SMART_COACH_AUTO_CHECK_TIMES:timesBox.times}}
    if(Object.hasOwn(dependencies,name))return dependencies[name];throw Error('Forbidden normal coach dependency '+name)
  }};box.exports=box.module.exports
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,'app/api/health-tips/settings/route.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText,box)
  const normal=box.module.exports,coach={GET:req=>normal.GET(req),POST:async req=>{posted.push(await req.clone().json());return normal.POST(req)}}
  const adapterBox={module:{exports:{}},exports:null,Request,Response,Headers,URL,Date,Intl,console,require:name=>name==='next/server'?{NextRequest}:name==='crypto'?require('node:crypto'):name==='@/app/api/health-tips/settings/route'?coach:mocks[name]||(()=>{throw Error('Forbidden coach adapter dependency '+name)})()};adapterBox.exports=adapterBox.module.exports;vm.runInNewContext(code,adapterBox)
  // Execute the real web GET normalization/sync block. It replaces a stored
  // non-manual zone with the browser's zone; this is the actual regression path.
  const web=ts.createSourceFile('health-tips-page.tsx',fs.readFileSync(path.join(root,'app/health-tips/page.tsx'),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX)
  let policy;function findPolicy(node){if(ts.isIfStatement(node)&&node.expression.getText(web)==='res.ok'&&node.thenStatement.getText(web).includes('const manual = !!data.timezoneManual'))policy=node.getText(web);ts.forEachChild(node,findPolicy)}findPolicy(web);assert(policy)
  async function browserRead(browserTimezone='Australia/Melbourne'){
    const pending=[],seen={},context={res:await normal.GET(request()),browserTimezone,fetch:(url,options)=>{assert.equal(url,'/api/health-tips/settings');pending.push(normal.POST(new NextRequest(new URL(url,request().url),{...options,headers:{...options.headers,authorization:'Bearer synthetic-owner'}})));return pending.at(-1)}}
    for(const name of ['Enabled','Time1','Time2','Time3','Timezone','TimezoneManual','TimezoneQuery','Frequency'])context['set'+name]=value=>{seen[name]=value}
    vm.createContext(context);await vm.runInContext(ts.transpileModule(`(async()=>{${policy}})()`,{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText,context);await Promise.all(pending);return{seen,syncs:pending.length}
  }
  return{api:adapterBox.module.exports,normal,posted,scheduled,authSeen,browserRead,state:()=>stored,setAccount:value=>{account=value},failSchedules:()=>{scheduleFails=true},prepare:values=>adapterBox.module.exports.prepareVoicePreferenceAction(request(),'synthetic-owner',{action:'coach_preferences.update',values}),execute:d=>adapterBox.module.exports.executeVoicePreferenceAction(request(),'synthetic-owner',d)}
}
async function check(name,fn){reset();await fn();checks++;console.log('PASS '+name)}
async function run(){
  await check('fixed schema covers server-supported manual settings',()=>{assert.equal(Object.keys(api.VOICE_PREFERENCE_ACTION_SCHEMAS).length,13);assert(!('endpoint' in api.VOICE_PREFERENCE_ACTION_SCHEMAS['profile.update']))})
  await check('prepare only reads and retains exact unchanged profile fields',async()=>{const d=await prepare('profile.update',{firstName:'New'});assert.equal(writes.length,0);assert.match(d.beforeHash,/^[a-f0-9]{64}$/);assert.equal(d.values.firstName,'New');assert.match(d.summary,/first name: New/)})
  await check('profile execution uses original auth and merges profile without wiping',async()=>{const d=await prepare('profile.update',{firstName:'New'});const r=await execute(d);assert.equal(r.saved,true);assert.equal(state.user.profileInfo.lastName,'Name');assert.equal(state.user.profileInfo.bio,'Keep');assert.equal(writes[0].authorization,'Bearer synthetic-owner');assert.equal(writes[0].cookie,'unrelated=preserved');assert.deepEqual(Object.keys(writes[0].body),['profileInfo'])})
  await check('profile gender is independent while DOB retains its normal version guard',async()=>{const d=await prepare('profile.update',{gender:'female',dateOfBirth:'1991-02-03'});const r=await execute(d);assert.equal(r.saved,true);assert(!('gender'in writes[0].body));assert.equal(state.user.gender,'male');assert.equal(writes[0].body.birthdate,'1991-02-03');assert.equal(writes[0].body.healthSetupUpdatedAt,1234)})
  await check('all four actual Profile choices retain independent metabolic gender',async()=>{for(const gender of ['male','female','other','prefer-not-to-say']){reset();state.user.profileInfo.gender=gender==='other'?'male':'other';const d=await prepare('profile.update',{gender});assert.equal((await execute(d)).saved,true);assert.equal(state.user.profileInfo.gender,gender);assert.equal(state.user.gender,'male');assert.deepEqual(Object.keys(writes[0].body),['profileInfo']);const normal=await actualProfileBlock(writes[0].body.profileInfo);assert.equal(normal.display,gender);assert.equal(normal.metabolic,'MALE');assert(normal.writes.every(row=>!('gender'in row)))}})
  await check('unrelated bio and DOB edits retain Other and do not infer a missing Profile gender',async()=>{for(const gender of ['other','prefer-not-to-say',undefined]){reset();if(gender)state.user.profileInfo.gender=gender;const d=await prepare('profile.update',{bio:'Exact bio',dateOfBirth:'1991-02-03'});await execute(d);assert.equal(state.user.profileInfo.gender,gender);assert.equal(state.user.gender,'male');assert.equal((await actualProfileBlock(writes[0].body.profileInfo)).metabolic,'MALE')}})
  await check('only explicit Health Setup gender changes the actual normal metabolic field',async()=>{for(const gender of ['male','female'])assert.equal((await actualProfileBlock({gender:'other'},'MALE',{gender})).metabolic,gender.toUpperCase());for(const gender of ['other','prefer-not-to-say'])await assert.rejects(()=>prepare('health_setup.update',{gender}));const d=await prepare('health_setup.update',{gender:'female'});await execute(d);assert.equal(writes[0].body.gender,'female')})
  await check('health setting patch merges nested preferences and preserves all lists',async()=>{const d=await prepare('health_setup.update',{weight:82,healthCheckSettings:{enabled:false,thresholds:{sugar:25}},healthSituations:{additionalInfo:'Changed'}});assert.equal((await execute(d)).saved,true);assert.deepEqual(state.user.goals,['Sleep']);assert.deepEqual(state.user.allergies,['Peanut']);assert.deepEqual(state.user.dietTypes,['Mediterranean']);assert.equal(state.user.healthCheckSettings.frequency,'high');assert.equal(state.user.healthCheckSettings.thresholds.carbs,50);assert.equal(state.user.healthSituations.healthIssues,'Keep');assert.equal(writes[0].body.healthSetupUpdatedAt,1234)})
  await check('semantic list adds retain unrelated items without full-list model input',async()=>{const d=await prepare('health_setup.update',{allergiesAdd:['Shellfish'],dietTypesAdd:['Vegetarian'],exerciseTypesAdd:['Walking'],goalsAdd:['Energy']});assert(!('allergies' in d.values));assert.match(d.summary,/add to allergies: Shellfish/);assert.equal((await execute(d)).saved,true);assert.deepEqual(state.user.allergies,['Peanut','Shellfish']);assert.deepEqual(state.user.dietTypes,['Mediterranean','Vegetarian']);assert.deepEqual(state.user.exerciseTypes,['Walking']);assert.deepEqual(state.user.goals,['Sleep','Energy']);assert(!('allergiesAdd' in writes[0].body))})
  await check('semantic removals preserve other entries and can clear final item explicitly',async()=>{state.user.exerciseTypes=['Walking','Swimming'];state.user.goals=['Sleep','Energy'];const d=await prepare('health_setup.update',{allergiesRemove:['peanut'],exerciseTypesRemove:['walking'],goalsRemove:['Sleep']});assert.equal((await execute(d)).saved,true);assert.deepEqual(state.user.allergies,[]);assert.deepEqual(state.user.exerciseTypes,['Swimming']);assert.deepEqual(state.user.goals,['Energy']);const last=await prepare('health_setup.update',{goalsRemove:['Energy'],exerciseTypesRemove:['Swimming']});assert.equal((await execute(last)).saved,true);assert.deepEqual(state.user.goals,[]);assert.deepEqual(state.user.exerciseTypes,[]);assert.equal(writes[1].body.healthSetupUpdatedAt,1234)})
  await check('the exact Energy removal request accepts singular or array model shape and keeps all five original issues',async()=>{
    const originals=['Sleep','Stress','Digestion','Joint comfort','Mood'],all=[...originals,'Energy']
    for(const goalsRemove of ['Energy',['Energy']]){
      state.user.goals=[...all];writes=[]
      const parsed={action:'preference_action',preferenceAction:{action:'health_setup.update',values:{goalsRemove}}}
      const result=await mainContext.normalizeDraft(parsed,'Remove only Energy from my tracked health issues. Keep all five original issues.','2026-10-17','synthetic-owner',null,-660,[],undefined,[],'AU',request(),'Australia/Melbourne')
      assert.equal(result.draft.canConfirm,true,JSON.stringify(result.draft));assert.equal(result.draft.autoSave,false);assert.equal(writes.length,0)
      assert.deepEqual(Array.from(result.draft.preferenceAction.values.goalsRemove),['Energy']);assert.match(result.draft.confirmationMessage,/remove from selected health issues: Energy/)
      assert.equal((await execute(result.draft.preferenceAction)).saved,true);assert.deepEqual(state.user.goals,originals);assert.deepEqual(writes[0].body.goals,originals)
      const normal=await actualListBlocks(writes[0].body,true,all)
      assert.deepEqual(normal.fixture.goals.filter(row=>row.userId==='synthetic-owner'&&!row.name.startsWith('__')).map(row=>row.name),originals)
      assert.deepEqual(normal.fixture.goals.filter(row=>row.userId==='synthetic-owner'&&!row.name.startsWith('__')).map(row=>row.id),originals.map(name=>`own-${name.toLowerCase()}`))
      assert.deepEqual(normal.fixture.issues,originals);assert.deepEqual(JSON.parse(normal.fixture.selected.category),originals)
      assert(normal.fixture.goals.some(row=>row.id==='hidden'));assert(normal.fixture.goals.some(row=>row.id==='foreign'))
    }
  })
  await check('literal singleton normalization is restricted to declared semantic list fields without splitting names',async()=>{
    const values={allergiesAdd:'Shellfish',dietTypesAdd:'Vegetarian',exerciseTypesAdd:'Walking',goalsAdd:'Energy'}
    const d=await prepare('health_setup.update',values);for(const key of Object.keys(values))assert.deepEqual(Array.from(d.values[key]),[values[key]])
    assert.equal((await execute(d)).saved,true);assert.deepEqual(state.user.goals,['Sleep','Energy'])
    const remove=await prepare('health_setup.update',{allergiesRemove:'Shellfish',dietTypesRemove:'Vegetarian',exerciseTypesRemove:'Walking',goalsRemove:'Energy'})
    assert.equal((await execute(remove)).saved,true);assert.deepEqual(state.user.goals,['Sleep']);assert.deepEqual(state.user.allergies,['Peanut'])
    for(const values of [{goals:'Energy'},{goalsRemove:'all'},{goalsRemove:'Sleep, Energy'},{goalsRemove:'Sleep and Energy'},{goalsRemove:''},{goalsRemove:'__HIDDEN__'},{goalsRemove:3},{goalsRemove:{}},{goalsRemove:null}])await assert.rejects(()=>prepare('health_setup.update',values))
    assert.equal(writes.length,2)
  })
  await check('semantic list ambiguity and conflicting replacement reject without a write',async()=>{for(const values of [{allergies:['Peanut'],allergiesAdd:['Shellfish']},{goalsRemove:['Not selected']},{dietTypesAdd:['Vegan'],dietTypesRemove:['vegan']}])await assert.rejects(()=>prepare('health_setup.update',values));assert.equal(writes.length,0)})
  await check('semantic list changes retain the same stale-state review protection',async()=>{const d=await prepare('health_setup.update',{allergiesAdd:['Shellfish']});state.user.allergies.push('Egg');const result=await execute(d);assert.equal(result.status,'review_again');assert.equal(writes.length,0)})
  await check('actual manual source accepts stamped empty lists without touching hidden/foreign goals',async()=>{const {fixture,updateData}=await actualListBlocks({exerciseTypes:[],goals:[]},true);assert.deepEqual(Array.from(updateData.exerciseTypes),[]);assert.deepEqual(fixture.goals.map(goal=>goal.id),['hidden','foreign']);assert.deepEqual(JSON.parse(fixture.selected.category),[]);assert.deepEqual(fixture.issues,[])})
  await check('actual manual source preserves missing lists and legacy unstamped empty goals',async()=>{for(const data of [{},{goals:[]}]){const {fixture,updateData}=await actualListBlocks(data,false);assert(!('exerciseTypes'in updateData));assert.deepEqual(fixture.goals.map(goal=>goal.id),['own-sleep','own-energy','hidden','foreign']);assert.deepEqual(JSON.parse(fixture.selected.category),['Sleep','Energy'])}})
  await check('explicit goal values use manual endpoint with no regeneration/provider',async()=>{const d=await prepare('goals.update',{goalChoice:'maintain weight',goalCalorieTarget:2200,goalMacroSplit:{proteinPct:.3,carbPct:.4,fatPct:.3}});assert.equal((await execute(d)).saved,true);assert.equal(writes.length,1);assert.equal(writes[0].base,'/api/user-data');assert(!('manualSync' in writes[0].body));assert(!('syncOverride' in writes[0].body))})
  await check('hydration set and automatic reset use only their exact handlers',async()=>{const d=await prepare('hydration_goal.set',{targetMl:2500});assert.equal((await execute(d)).saved,true);const resetDraft=await prepare('hydration_goal.reset',{});assert.equal((await execute(resetDraft)).saved,true);assert.equal(state.hydration.source,'auto');assert.equal(writes[1].method,'DELETE')})
  await check('partial reminder edit preserves other times and existing frequency',async()=>{const d=await prepare('checkin_reminders.update',{time1:'13:00'});const r=await execute(d);assert.equal(r.saved,true);assert.equal(r.schedulingVerified,true);assert.equal(writes[0].body.time2,'18:30');assert.equal(writes[0].body.frequency,2);assert.equal(writes[0].body.timezone,'Australia/Melbourne')})
  await check('paid reminder frequency cap cannot be silently clamped',async()=>{await assert.rejects(()=>prepare('mood_reminders.update',{frequency:4}),/not available/);assert.equal(writes.length,0)})
  await check('quiet hours preserve timezone and omitted endpoint values',async()=>{const d=await prepare('quiet_hours.update',{enabled:true,startTime:'23:00'});assert.equal((await execute(d)).saved,true);assert.equal(state.quiet.endTime,'07:00');assert.equal(state.quiet.timezone,'Australia/Melbourne')})
  await check('weekly preference still invokes normal paid/consent-protected handler',async()=>{const d=await prepare('weekly_reports.update',{enabled:true});assert.equal((await execute(d)).saved,true);assert.equal(writes[0].base,'/api/reports/weekly/preferences');assert.deepEqual(writes[0].body,{enabled:true})})
  await check('new coach pricing acceptance and OS/billing actions cannot be fabricated',async()=>{await assert.rejects(()=>prepare('coach_preferences.update',{enabled:true}),/pricing/);for(const action of ['billing.purchase','health.authorize','notifications.permission','ai_consent.update'])await assert.rejects(()=>prepare(action,{enabled:true}));assert.equal(writes.length,0)})
  await check('existing coach timezone edit preserves enable state without accepting terms',async()=>{state.coach.enabled=true;const d=await prepare('coach_preferences.update',{timezone:'UTC',timezoneManual:true});assert.equal((await execute(d)).saved,true);assert.equal(writes[0].body.enabled,true);assert(!('acceptPricingTerms' in writes[0].body))})
  await check('timezone-only coach choice includes reviewed manual mode and old incomplete reviews require review again',async()=>{
    const d=await prepare('coach_preferences.update',{timezone:'Europe/Paris'});assert.equal(d.values.timezoneManual,true);assert.match(d.summary,/manual time zone: on/);assert.equal((await execute(d)).saved,true);assert.equal(writes[0].body.timezoneManual,true);assert.equal(state.coach.timezone,'Europe/Paris')
    reset();const old=await prepare('coach_preferences.update',{timezone:'Europe/Paris'});delete old.values.timezoneManual;assert.equal((await execute(old)).status,'review_again');assert.equal(writes.length,0)
  })
  await check('automatic coach mode is explicit and conflicting zone plus automatic refuses before writing',async()=>{
    state.coach.timezoneManual=true;const auto=await prepare('coach_preferences.update',{timezoneManual:false});assert.match(auto.summary,/automatic time zone/);assert.equal(auto.values.timezoneManual,false);assert(!('timezone'in auto.values));assert.equal((await execute(auto)).saved,true)
    const count=writes.length;await assert.rejects(()=>prepare('coach_preferences.update',{timezone:'Europe/Paris',timezoneManual:false}),/either an automatic time zone or a fixed/);assert.equal(writes.length,count)
  })
  await check('actual normal settings GET/POST and actual web automatic policy retain explicit voice zone after refresh',async()=>{
    const before=actualCoachSettings({timezone:'Europe/Paris',timezoneManual:false});const old=await before.browserRead();assert.equal(old.syncs,1);assert.equal(before.state().timezone,'Australia/Melbourne')
    const f=actualCoachSettings(),d=await f.prepare({timezone:'Europe/Paris'});assert.equal(d.values.timezoneManual,true);assert.equal(f.posted.length,0);assert.equal((await f.execute(d)).saved,true);assert.equal(f.state().enabled,false);assert.equal(f.posted[0].timezoneManual,true);assert(!('acceptPricingTerms'in f.posted[0]))
    const refresh=await f.browserRead();assert.equal(refresh.syncs,0);assert.equal(refresh.seen.Timezone,'Europe/Paris');assert.equal(f.state().timezone,'Europe/Paris');assert.equal(f.state().timezoneManual,true);assert.equal(f.scheduled.length,0)
    for(const auth of f.authSeen){assert.equal(auth.authorization,'Bearer synthetic-owner');assert.equal(auth.cookie,'unrelated=preserved')}
  })
  await check('actual automatic-mode refresh follows normal policy without promising a fixed zone',async()=>{
    const f=actualCoachSettings({timezone:'Europe/Paris',timezoneManual:true}),d=await f.prepare({timezoneManual:false});assert.match(d.summary,/automatic time zone/);assert(!d.summary.includes('Europe/Paris'));assert.equal((await f.execute(d)).saved,true);const refreshed=await f.browserRead();assert.equal(refreshed.syncs,1);assert.equal(f.state().timezone,'Australia/Melbourne');assert.equal(f.state().timezoneManual,false)
    const count=f.posted.length;await assert.rejects(()=>f.prepare({timezone:'UTC',timezoneManual:false}),/either an automatic/);assert.equal(f.posted.length,count)
  })
  await check('actual coach pricing, authentication, stale checks and schedule result policy remain authoritative',async()=>{
    const disabled=actualCoachSettings();await assert.rejects(()=>disabled.prepare({enabled:true,timezone:'UTC'}),/pricing/);assert.equal(disabled.posted.length,0)
    const direct=await disabled.normal.POST(new NextRequest('https://helfi.ai/api/health-tips/settings',{method:'POST',headers:request().headers,body:JSON.stringify({enabled:true,timezone:'UTC',timezoneManual:true})}));assert.equal(direct.status,400);assert.equal(disabled.state().enabled,false)
    const f=actualCoachSettings({enabled:true}),d=await f.prepare({timezone:'Europe/Paris'});assert.equal((await f.execute(d)).saved,true);assert(f.scheduled.length>0);assert(f.scheduled.every(item=>item.timezone==='Europe/Paris'));assert(!('acceptPricingTerms'in f.posted[0]))
    const stale=await f.prepare({timezone:'UTC'});f.state().timezone='Europe/London';assert.equal((await f.execute(stale)).status,'review_again');assert.equal(f.posted.length,1)
    const notDelivered=await f.prepare({timezone:'Pacific/Auckland'});f.failSchedules();const result=await f.execute(notDelivered);assert.equal(result.saved,true);assert.equal(result.schedulingVerified,false);assert.match(result.message,/delivery was not verified/)
    f.setAccount(null);await assert.rejects(()=>f.prepare({timezone:'UTC'}));assert.equal(f.posted.length,2)
  })
  await check('checkin rating resolves exact own issue/date and preserves note',async()=>{const d=await prepare('checkin.rating.update',{date:'2026-10-15',issueName:'Sleep',value:4});assert.equal(d.values.issueId,'own-sleep');assert(!('issueName' in d.values));assert.equal((await execute(d)).saved,true);assert.equal(writes[0].method,'PATCH');assert.equal(writes[0].body.note,'Keep this note')})
  await check('checkin ambiguity and foreign record IDs require clarification',async()=>{state.history.push({...state.history[0],issueId:'second-sleep'});await assert.rejects(()=>prepare('checkin.rating.update',{date:'2026-10-15',issueName:'Sleep',value:4}),/exact existing/);await assert.rejects(()=>prepare('checkin.rating.update',{date:'2026-10-15',issueId:'foreign-id',value:4}),/exact existing/);assert.equal(writes.length,0)})
  await check('the actual Today Stress levels question resolves its stored negative Stress issue before any save',async()=>{
    const issue={id:'owned-stress',name:'Stress',polarity:'negative'};state.issues=[issue]
    assert.equal(questionContext.question(issue),'How were your Stress levels today?')
    const d=await prepare('checkin.rating.set',{date:'2026-10-17',issueName:'Stress levels',value:4,note:'Voice repair test check-in.'})
    assert.equal(d.values.issueId,issue.id);assert.equal(d.values.value,4);assert.equal(d.values.note,'Voice repair test check-in.');assert.equal(writes.length,0)
    assert.match(d.summary,/Stress.*2026-10-17.*Above average.*Voice repair test check-in\./)
  })
  await check('the exact observed request survives synthetic decorated model selectors through the real draft normalizer',async()=>{
    state.issues=[{id:'owned-stress',name:'Stress',polarity:'negative'}]
    const transcript='For my daily check-in today, rate Stress levels four out of seven and add the note Voice repair test check-in.'
    // The real UI failure has no retained model payload. These distorted model
    // selectors are explicit synthetic cases, not a claim about that payload.
    for(const selector of [{issueName:'daily check-in today Stress levels'},{issueName:'Stress levels four out of seven'},{issueId:'Stress levels'},{}]){
      const parsed={action:'preference_action',preferenceAction:{action:'checkin.rating.set',values:{date:'2026-10-17',...selector,value:4,note:'Voice repair test check-in...'}}}
      const result=await mainContext.normalizeDraft(parsed,transcript,'2026-10-17','synthetic-owner',null,-660,[],undefined,[],'AU',request(),'Australia/Melbourne')
      assert.equal(result.draft.canConfirm,true,JSON.stringify(result.draft));assert.equal(result.draft.autoSave,false)
      assert.equal(result.draft.preferenceAction.values.issueId,'owned-stress');assert.equal(result.draft.preferenceAction.values.note,'Voice repair test check-in.')
      assert.equal(result.draft.preferenceAction.values.value,3);assert.match(result.draft.confirmationMessage,/to Average\. Note: “Voice repair test check-in\.”/);assert(!result.draft.confirmationMessage.includes('out of six'))
      assert.match(result.draft.confirmationMessage,/Would you like me to apply that change/);assert.equal(writes.length,0)
    }
  })
  await check('exact names outrank display aliases and no broad medical synonym is invented',async()=>{
    state.issues=[{id:'owned-stress',name:'Stress',polarity:'negative'},{id:'owned-literal',name:'Stress levels',polarity:'positive'}]
    const d=await prepare('checkin.rating.set',{date:'2026-10-17',issueName:'Stress levels',value:4});assert.equal(d.values.issueId,'owned-literal')
    await assert.rejects(()=>prepare('checkin.rating.set',{date:'2026-10-17',issueName:'Anxiety',value:4}),/exact health issue/)
    state.issues=[{id:'positive',name:'Energy',polarity:'positive'}]
    await assert.rejects(()=>prepare('checkin.rating.set',{date:'2026-10-17',issueName:'Energy levels',value:4}),/exact health issue/);assert.equal(writes.length,0)
  })
  await check('foreign IDs, conflicting targets, duplicate aliases and names only inside notes cannot select an issue',async()=>{
    state.issues=[{id:'owned-stress',name:'Stress',polarity:'negative'},{id:'owned-energy',name:'Energy',polarity:'positive'}]
    const transcript='Rate Stress levels four out of seven and add the note Voice repair test check-in.'
    for(const selector of [{issueId:'foreign-id',issueName:'Stress levels'},{issueId:'owned-energy',issueName:'Stress levels'},{issueName:'Energy'}])await assert.rejects(()=>prepare('checkin.rating.set',{date:'2026-10-17',...selector,value:4},transcript),/exact health issue/)
    await assert.rejects(()=>prepare('checkin.rating.set',{date:'2026-10-17',issueName:'unknown',value:4},'Add the note: rate Stress levels four out of seven'),/exact health issue/)
    await assert.rejects(()=>prepare('checkin.rating.set',{date:'2026-10-17',issueName:'unknown',value:4},'Rate Stress levels four out of seven and rate Energy five out of seven'),/exact health issue/)
    state.issues.push({id:'duplicate-stress',name:'Stress',polarity:'negative'})
    await assert.rejects(()=>prepare('checkin.rating.set',{date:'2026-10-17',issueName:'Stress levels',value:4},transcript),/exact health issue/);assert.equal(writes.length,0)
  })
  await check('display-name first rating uses the actual owned Today handler and preserves exact note on readback',async()=>{
    const initial={issues:[{id:'owned-stress',userId:'synthetic-owner',name:'Stress',polarity:'negative'},{id:'foreign-stress',userId:'another-user',name:'Stress',polarity:'negative'}],ratings:[]}
    const actual=actualCheckinHandlers(initial),today=mocks['@/app/api/checkins/today/route'],old={GET:today.GET,POST:today.POST};today.GET=actual.today.GET;today.POST=actual.today.POST
    try{
      const d=await prepare('checkin.rating.set',{date:'2026-10-17',issueName:'Stress levels',value:4,note:'Voice repair test check-in...'},'For my daily check-in today, rate Stress levels four out of seven and add the note Voice repair test check-in.')
      assert.equal(actual.state().ratings.length,0);assert.equal((await execute(d)).saved,true)
      assert.equal(actual.state().ratings.length,1);const saved=actual.state().ratings[0];assert.equal(saved.issueId,'owned-stress');assert.equal(saved.userId,'synthetic-owner');assert.equal(saved.date,'2026-10-17');assert.equal(saved.value,3);assert.equal(saved.note,'Voice repair test check-in.')
    }finally{today.GET=old.GET;today.POST=old.POST}
  })
  await check('explicit seven-choice spoken ratings map once to the actual native labels, including endpoints and ordinals',async()=>{
    state.issues=[{id:'owned-stress',name:'Stress',polarity:'negative'}]
    const labelsNode=nativeCheckinAst.statements.find(node=>ts.isVariableStatement(node)&&node.declarationList.declarations.some(item=>item.name.getText(nativeCheckinAst)==='LABELS'))
    assert(labelsNode);vm.runInContext(labelsNode.getText(nativeCheckinAst)+';globalThis.labels=LABELS',questionContext)
    const words=['one','two','three','four','five','six','seven']
    for(let i=0;i<7;i++)for(const spoken of [`${words[i]} out of seven`,`${i+1}/7`]){
      const d=await prepare('checkin.rating.set',{date:'2026-10-17',issueName:'Stress levels',value:Math.min(6,i+1)},`Rate Stress levels ${spoken}`)
      assert.equal(d.values.value,i,spoken);assert.match(d.summary,new RegExp(`to ${questionContext.labels[i]}\\.`));assert(!/out of six|out of 6/.test(d.summary))
      assert.equal((await execute(d)).saved,true);assert.equal(state.history.find(row=>row.issueId==='owned-stress').value,i)
    }
    const fourth=await prepare('checkin.rating.set',{date:'2026-10-17',issueName:'Stress levels',value:4},'Rate Stress levels fourth of seven');assert.equal(fourth.values.value,3);assert.match(fourth.summary,/Average/)
  })
  await check('legacy internal values stay unchanged without explicit ordinal speech and notes cannot replace the rating',async()=>{
    state.issues=[{id:'owned-stress',name:'Stress',polarity:'negative'}]
    for(let value=0;value<=6;value++){
      const d=await prepare('checkin.rating.set',{date:'2026-10-17',issueName:'Stress levels',value},'Set my Stress check-in and add the note rate Stress levels seven out of seven')
      assert.equal(d.values.value,value);assert.equal(d.values.note,'rate Stress levels seven out of seven')
    }
    for(const rating of ['zero out of seven','8/7','-1 out of seven','4.5 out of seven'])await assert.rejects(()=>prepare('checkin.rating.set',{date:'2026-10-17',issueName:'Stress levels',value:4},`Rate Stress levels ${rating}`),/seven check-in ratings/)
    assert.equal(writes.length,0)
  })
  await check('explicit note punctuation is retained exactly and review formatting adds none inside its quotation marks',async()=>{
    state.issues=[{id:'owned-stress',name:'Stress',polarity:'negative'}]
    for(const [spoken,expected]of [['Voice repair test check-in.','Voice repair test check-in.'],['Voice repair test check-in','Voice repair test check-in'],['“Keep this exactly!”','Keep this exactly!']]){
      const d=await prepare('checkin.rating.set',{date:'2026-10-17',issueName:'Stress levels',value:4,note:'Invented punctuation...'},`Rate Stress levels four out of seven and add the note ${spoken}`)
      assert.equal(d.values.value,3);assert.equal(d.values.note,expected);assert.equal(d.summary,`Set your Stress check-in on 2026-10-17 to Average. Note: “${expected}”`)
    }
  })
  await check('first checkin rating resolves an owned issue without historical ratings and verifies local date',async()=>{
    const d=await prepare('checkin.rating.set',{date:'2026-10-17',issueName:'Energy',value:0,note:'First check-in'})
    assert.equal(writes.length,0);assert.equal(d.values.issueId,'own-energy');assert.match(d.summary,/Energy.*2026-10-17.*Really bad/)
    assert.equal((await execute(d)).saved,true);assert.equal(writes[0].base,'/api/checkins/today');assert.equal(writes[0].body.localDate,'2026-10-17')
    assert.equal(writes[0].authorization,'Bearer synthetic-owner');assert.equal(writes[0].cookie,'unrelated=preserved');assert.equal(state.history.find(row=>row.issueId==='own-energy').value,0)
    assert.equal(state.history.find(row=>row.issueId==='own-sleep').note,'Keep this note')
  })
  await check('checkin set preserves note and supports explicit not applicable without inventing a score',async()=>{
    const d=await prepare('checkin.rating.set',{date:'2026-10-15',issueName:'Sleep',isNa:true})
    assert.equal(d.values.value,null);assert.equal(d.values.note,'Keep this note');assert.match(d.summary,/not applicable/)
    assert.equal((await execute(d)).saved,true);assert.equal(state.history[0].value,null);assert.equal(state.history[0].isNa,true)
    const note=await prepare('checkin.rating.set',{date:'2026-10-15',issueName:'Sleep',note:'Updated note'})
    assert.equal((await execute(note)).saved,true);assert.equal(state.history[0].isNa,true);assert.equal(state.history[0].value,null)
    await assert.rejects(()=>prepare('checkin.rating.set',{date:'2026-10-15',issueName:'Sleep',isNa:false}),/rating from zero/)
  })
  await check('a missing numeric rating never counts as an already-saved zero',async()=>{
    state.history.push({issueId:'own-energy',name:'Energy',date:'2026-10-17',value:null,note:'No score yet',isNa:false})
    const d=await prepare('checkin.rating.set',{date:'2026-10-17',issueName:'Energy',value:0})
    const r=await execute(d);assert.equal(r.saved,true);assert.equal(r.status,'saved');assert.equal(writes.length,1)
    assert.equal(state.history.find(row=>row.issueId==='own-energy').value,0)
  })
  await check('checkin deletion removes only the reviewed issue/date and confirms it is absent',async()=>{
    state.history.push({...state.history[0],date:'2026-10-14'}, {issueId:'own-energy',name:'Energy',date:'2026-10-15',value:5,note:'Other issue',isNa:false})
    const d=await prepare('checkin.rating.delete',{date:'2026-10-15',issueName:'Sleep'})
    assert.equal(writes.length,0);assert.equal((await execute(d)).saved,true)
    assert.equal(writes[0].method,'DELETE');assert.equal(writes[0].issueId,'own-sleep');assert.equal(writes[0].date,'2026-10-15')
    assert.equal(state.history.length,2);assert(state.history.some(row=>row.date==='2026-10-14'));assert(state.history.some(row=>row.issueId==='own-energy'))
  })
  await check('new checkin actions reject missing/ambiguous/foreign issues, invalid ratings and stale first-save races',async()=>{
    for(const values of [{date:'2026-02-30',issueName:'Sleep',value:3},{date:'2026-10-15',issueId:'foreign-id',value:3},{date:'2026-10-15',issueName:'Sleep',value:7},{date:'2026-10-15',issueName:'Sleep',value:3,isNa:true},{date:'2026-10-17',issueName:'Energy',note:'No rating'}])await assert.rejects(()=>prepare('checkin.rating.set',values))
    await assert.rejects(()=>prepare('checkin.rating.delete',{date:'2026-10-17',issueName:'Energy'}),/no saved check-in/)
    state.issues=[{id:'one',name:'Sleep'},{id:'two',name:'Sleep'}];await assert.rejects(()=>prepare('checkin.rating.set',{date:'2026-10-17',issueName:'Sleep',value:3}),/exact health issue/);delete state.issues
    const d=await prepare('checkin.rating.set',{date:'2026-10-17',issueName:'Energy',value:3});state.history.push({issueId:'own-energy',name:'Energy',date:'2026-10-17',value:5,note:'Saved elsewhere',isNa:false})
    const r=await execute(d);assert.equal(r.saved,false);assert.equal(r.status,'review_again');assert.equal(writes.length,0)
  })
  await check('checkin ignored/failed set or delete never claims a verified change',async()=>{
    for(const action of ['checkin.rating.set','checkin.rating.delete'])for(const failure of ['ignored','failed']){
      const d=await prepare(action,{date:'2026-10-15',issueName:'Sleep',...(action.endsWith('.set')?{value:6}:{})});mode=failure;assert.equal((await execute(d)).saved,false);mode='ok'
    }
  })
  await check('actual today and exact-delete handlers support first local-date set/readback/delete with account isolation',async()=>{
    const initial={issues:[{id:'own-sleep',userId:'synthetic-owner',name:'Sleep'},{id:'foreign-sleep',userId:'another-user',name:'Sleep'}],ratings:[{id:'other-date',userId:'synthetic-owner',issueId:'own-sleep',date:'2026-10-14',value:2,note:'Keep',isNa:false},{id:'foreign',userId:'another-user',issueId:'foreign-sleep',date:'2026-10-17',value:5,note:'Foreign',isNa:false}]}
    const actual=actualCheckinHandlers(initial);const today=mocks['@/app/api/checkins/today/route'];const ratings=mocks['@/app/api/checkins/ratings/route'];const old={GET:today.GET,POST:today.POST,DELETE:ratings.DELETE}
    today.GET=actual.today.GET;today.POST=actual.today.POST;ratings.DELETE=actual.ratings.DELETE
    try{
      const wrongIssue=await actual.today.POST(new NextRequest('https://helfi.invalid/api/checkins/today',{method:'POST',headers:{authorization:'Bearer synthetic-owner','content-type':'application/json'},body:JSON.stringify({localDate:'2026-10-17',ratings:[{issueId:'foreign-sleep',value:6}]})}));assert.equal(wrongIssue.status,404)
      assert.equal(JSON.stringify(actual.state().ratings),JSON.stringify(initial.ratings))
      await assert.rejects(()=>prepare('checkin.rating.set',{date:'2026-10-17',issueId:'foreign-sleep',value:3}),/exact health issue/)
      const d=await prepare('checkin.rating.set',{date:'2026-10-17',issueName:'Sleep',value:3,note:'First local rating'})
      assert.equal((await execute(d)).saved,true)
      const saved=actual.state().ratings.find(row=>row.userId==='synthetic-owner'&&row.date==='2026-10-17')
      assert.equal(saved.value,3);assert.equal(saved.note,'First local rating')
      const deletion=await prepare('checkin.rating.delete',{date:'2026-10-17',issueName:'Sleep'});assert.equal((await execute(deletion)).saved,true)
      assert.equal(JSON.stringify(actual.state().ratings),JSON.stringify(initial.ratings))
    }finally{today.GET=old.GET;today.POST=old.POST;ratings.DELETE=old.DELETE}
  })
  await check('actual today optional dates are strict and omitted dates retain normal UTC default',async()=>{
    const actual=actualCheckinHandlers({issues:[{id:'own-sleep',userId:'synthetic-owner',name:'Sleep'}],ratings:[]})
    for(const localDate of ['2026-02-30','2026-13-01','bad-date','',null]){
      const post=await actual.today.POST(new NextRequest('https://helfi.invalid/api/checkins/today',{method:'POST',headers:{authorization:'Bearer synthetic-owner','content-type':'application/json'},body:JSON.stringify({localDate,ratings:[{issueId:'own-sleep',value:4}]})}))
      assert.equal(post.status,400)
      const get=await actual.today.GET(new NextRequest('https://helfi.invalid/api/checkins/today?localDate='+encodeURIComponent(String(localDate)),{headers:{authorization:'Bearer synthetic-owner'}}));assert.equal(get.status,400)
    }
    assert.equal(actual.state().ratings.length,0)
    const post=await actual.today.POST(new NextRequest('https://helfi.invalid/api/checkins/today',{method:'POST',headers:{authorization:'Bearer synthetic-owner','content-type':'application/json'},body:JSON.stringify({ratings:[{issueId:'own-sleep',value:4}]})}))
    assert.equal(post.status,200);assert.equal(actual.state().ratings[0].date,new Date().toISOString().slice(0,10))
    const get=await actual.today.GET(new NextRequest('https://helfi.invalid/api/checkins/today',{headers:{authorization:'Bearer synthetic-owner'}}));assert.equal((await get.json()).ratings[0].value,4)
    const noauth=await actual.today.POST(new NextRequest('https://helfi.invalid/api/checkins/today',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({localDate:'2026-10-17',ratings:[{issueId:'own-sleep',value:6}]})}));assert.equal(noauth.status,401)
  })
  await check('local check-in day is accepted ahead of UTC across Australian DST and UTC plus fourteen',async()=>{
    try{
      for(const [now,zone]of [['2026-10-16T13:30:00.000Z','Australia/Melbourne'],['2026-10-16T10:30:00.000Z','Pacific/Kiritimati']]){
        const fixed=Date.parse(now)
        preferenceContext.Date=class extends Date{constructor(...args){super(...(args.length?args:[fixed]))}static now(){return fixed}}
        assert.equal(new preferenceContext.Date().toISOString().slice(0,10),'2026-10-16')
        const parts=new Intl.DateTimeFormat('en',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(fixed));const field=name=>parts.find(part=>part.type===name).value
        assert.equal(`${field('year')}-${field('month')}-${field('day')}`,'2026-10-17')
        const d=await prepare('checkin.rating.set',{date:'2026-10-17',issueName:'Energy',value:3})
        assert.equal(d.values.date,'2026-10-17');assert.equal((await execute(d)).saved,true)
        state.history=state.history.filter(row=>row.issueId!=='own-energy')
      }
    }finally{preferenceContext.Date=Date}
  })
  await check('beforeHash rejects concurrent settings changes without overwriting',async()=>{const d=await prepare('profile.update',{bio:'New bio'});state.user.weight='81';const r=await execute(d);assert.equal(r.saved,false);assert.equal(r.status,'review_again');assert.equal(writes.length,0)})
  await check('wrong account, expired review and future review perform no reads or writes',async()=>{const d=await prepare('profile.update',{bio:'New'});const count=readCount;for(const patch of [{userId:'other'},{preparedAt:Date.now()-1800001},{preparedAt:Date.now()+10000}]){assert.equal((await execute({...d,...patch})).saved,false)}assert.equal(readCount,count);assert.equal(writes.length,0)})
  await check('unrecognized field and arbitrary endpoint rejected before account read',async()=>{for(const values of [{endpoint:'/api/admin/users'},{userId:'other'},{termsAccepted:true},{manualSync:true},{syncOverride:true},{aiConsent:true}])await assert.rejects(()=>prepare('health_setup.update',values));assert.equal(readCount,0);assert.equal(writes.length,0)})
  await check('invalid ranges, dates, times, timezone and macro splits cannot write',async()=>{for(const [action,values]of [['health_setup.update',{weight:0}],['profile.update',{dateOfBirth:'2026-02-30'}],['quiet_hours.update',{startTime:'25:00'}],['mood_reminders.update',{timezone:'Not/AZone'}],['hydration_goal.set',{targetMl:20001}],['goals.update',{goalMacroSplit:{proteinPct:.3,carbPct:.3,fatPct:.3}}],['health_setup.update',{goals:['__HIDDEN__']}],['checkin.rating.update',{date:'2026-10-15',issueName:'Sleep',value:7}]])await assert.rejects(()=>prepare(action,values));assert.equal(writes.length,0)})
  await check('manual handler errors and skipped/ignored writes never claim success',async()=>{for(const failure of ['failed','skipped','ignored']){const d=await prepare('profile.update',{bio:'New'});mode=failure;const r=await execute(d);assert.equal(r.saved,false,failure);mode='ok'}})
  await check('scheduled delivery failure is distinguished from stored preference',async()=>{const d=await prepare('checkin_reminders.update',{time1:'13:00'});mode='schedule_failed';const r=await execute(d);assert.equal(r.saved,true);assert.equal(r.schedulingVerified,false);assert.match(r.message,/delivery was not verified/)})
  await check('unchanged preference verifies readback without another write',async()=>{const d=await prepare('profile.update',{firstName:'Old'});const r=await execute(d);assert.equal(r.saved,true);assert.equal(r.status,'already_set');assert.equal(writes.length,0)})
  await check('unauthorized normal handlers remain authoritative',async()=>{mode='unauthorized';await assert.rejects(()=>prepare('profile.update',{firstName:'New'}));assert.equal(writes.length,0)})
  console.log(`Voice preference actions: ${checks} actual-adapter synthetic groups passed. No live account, provider or saved-data claim.`)
}
run().catch(error=>{console.error(error);process.exitCode=1})
