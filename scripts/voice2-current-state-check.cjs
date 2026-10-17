#!/usr/bin/env node
'use strict'
// Actual shared normal diary/targets and current-state operation. No provider,
// account, environment-file, network, key, storage repair or paid action.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript'), assert = require('node:assert/strict'), crypto = require('node:crypto')
const root = path.resolve(__dirname, '..'), json = value => JSON.parse(JSON.stringify(value)), hash = value => crypto.createHash('sha256').update(value).digest('hex')
let now = '2026-10-17T03:00:00.000Z'
class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])) } static now() { return Date.parse(now) } }
class Req extends Request {}
let routeCalls = [], normalRoutes = {}, session = null, native = 'owner'
const modules = new Map(), allowed = new Set(['lib/native-assistant-current-state.ts','lib/daily-targets.ts','lib/food/nutrient-values.ts','native/src/lib/foodDiaryEntries.ts','native/src/lib/nutrientValues.ts','native/src/lib/mealPortions.ts'])
function load(relative) {
  if (modules.has(relative)) return modules.get(relative)
  assert(allowed.has(relative), 'Forbidden module '+relative)
  const module = { exports: {} }; modules.set(relative, module.exports)
  const source = fs.readFileSync(path.join(root, relative), 'utf8'), code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  vm.runInNewContext(code, { module, exports: module.exports, require: name => {
    if (name === 'crypto') return crypto
    if (name === 'next/server') return { NextRequest: Req }
    if (name === 'next-auth') return { getServerSession: async () => session }
    if (name === '@/lib/auth') return { authOptions: {} }
    if (name === '@/lib/native-auth') return { getUserIdFromNativeAuth: async () => native }
    if (normalRoutes[name]) return normalRoutes[name]
    if (name.startsWith('@/')) return load(name.slice(2)+'.ts')
    if (name.startsWith('.')) return load(path.posix.normalize(path.posix.join(path.posix.dirname(relative), name))+'.ts')
    throw Error('Forbidden dependency '+name)
  }, Date: Clock, Intl, Headers, Request, Response, URL, AbortSignal, console }, { filename: relative })
  modules.set(relative, module.exports); return module.exports
}
const api = load('lib/native-assistant-current-state.ts'), diary = load('native/src/lib/foodDiaryEntries.ts'), targets = load('lib/daily-targets.ts')
const context = () => ({ actorId: 'owner', localDate: '2026-10-17', capabilities: [] })
const baseProfile = () => ({ gender: 'male', weight: '80', height: '180', birthdate: '1990-06-15', exerciseFrequency: '3 days a week', goals: ['Energy'], goalChoice: 'lose weight', goalIntensity: 'standard', goalCalorieTarget: 2000, goalMacroSplit: { proteinPct: 30, carbPct: 40, fatPct: 30 }, goalFiberTarget: 35, goalSugarMax: 25, goalMacroMode: 'manual', dietTypes: ['Vegetarian'], allergies: ['Peanuts'], bodyType: '', healthSituations: { healthIssues: '', healthProblems: '', additionalInfo: '' }, diabetesType: '', healthSetupUpdatedAt: 100 })
const nutrient = (calories, extras = {}) => ({ calories, protein: 20, carbs: 40, fat: 10, fiber: null, sugar: 0, ...extras })
const food = (id, calories, extras = {}) => ({ id, userId: 'owner', name: id, description: id, localDate: '2026-10-17', createdAt: '2026-10-17T00:00:00.000Z', meal: 'lunch', nutrients: nutrient(calories), items: [], ...extras })
function harness(options = {}) {
  const state = { profile: baseProfile(), foods: [food('breakfast', 400), food('lunch', 650)], exercises: [{ id: 'run', userId: 'owner', localDate: '2026-10-17', calories: 250, source: 'MANUAL' }], zone: 'Australia/Melbourne', actor: 'owner', ...options }
  const calls = [], services = { now: () => new Clock(), authenticatedActor: async () => state.actor, trustedTimeZone: async () => state.zone,
    profile: async () => { calls.push('profile'); return json({ data: state.profile, readOnly: true }) },
    food: async (_ctx, day, offset) => { calls.push({ type: 'food', day, offset }); return json({ success: true, readOnly: true, logs: state.foods }) },
    exercise: async (_ctx, day) => { calls.push('exercise'); return json({ date: day.localDate, exerciseCalories: state.exercises.reduce((sum, row) => sum + row.calories, 0), entries: state.exercises }) },
  }
  Object.assign(services, state.services)
  const op = api.createNativeAssistantCurrentStateOperation(services)
  return { state, calls, services, op, read: (values = {}, ctx = context()) => op.read(ctx, values) }
}
const proof = {
 roundTo:'c58b221c95dd1a3145b5d1d0ff4bc97c8016ffc89cbcab780e3f69431c31318f',nullableNumber:'062bb97ee6696e3194e9b250b159293ee54e2f1b3afa90ff5b649f12dcb4b03f',sanitizeEntryTotals:'d9d7104895cf8d12c6ee1d1980fe62bb139ed604ce491410f302f2b48f19f250',hasNonZeroEntryTotals:'3a1a970f4c303cc71cb8ec5ce2e0a9aaba0c56286f11cee60669e943d71bd658',extractTotalsFromDescriptionText:'3d6a11c24f0eed1c8880c3cd368f14af59872cb3642d095ea87eeb9753ddefc3',recalculateTotalsFromItems:'68e42a890bb2848530ae89d05bfa5a5e54e2b31b762c9a79357b87f800b42be1',normalizeFoodApiEntry:'64531dd601667e16664e8044bac73091986e82e108f93a63b8a594d9e1c13d83'
}
const screenText = fs.readFileSync(path.join(root,'native/src/screens/TrackCaloriesScreen.tsx'),'utf8'), screenAst = ts.createSourceFile('screen.tsx',screenText,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX)
function jsxSourceHash(file) { const nodes=[]; function walk(node) { if(ts.isJsxElement(node)||ts.isJsxSelfClosingElement(node)||ts.isJsxFragment(node)){ nodes.push(node.getText(file)); return } ts.forEachChild(node,walk) }walk(file);return hash(JSON.stringify(nodes)) }
function actualUiTargets(profile) {
  const names = ['toOptionalPositive','normalizeMacroSplit','buildDailyTargetsFromUserData'], code = screenAst.statements.filter(node => ts.isFunctionDeclaration(node)&&names.includes(node.name?.text)).map(node=>node.getText(screenAst)).join('\n')
  const defaults = screenAst.statements.flatMap(node => ts.isVariableStatement(node) ? [...node.declarationList.declarations] : []).find(node=>node.name.getText(screenAst)==='DEFAULT_TARGETS').initializer.getText(screenAst)
  const box = { calculateDailyTargets: targets.calculateDailyTargets, Date: Clock, result: null }
  vm.runInNewContext(ts.transpileModule(`const DEFAULT_TARGETS=${defaults};${code};result=buildDailyTargetsFromUserData(${JSON.stringify(profile)})`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,box)
  return json(box.result)
}
let groups=0
async function check(label,fn){now='2026-10-17T03:00:00.000Z';await fn();groups++;console.log('PASS '+label)}
async function main(){
 await check('pure extraction retains all seven original function bodies and every JSX node unchanged',async()=>{
  const ast=ts.createSourceFile('pure.ts',fs.readFileSync(path.join(root,'native/src/lib/foodDiaryEntries.ts'),'utf8'),ts.ScriptTarget.Latest,true)
  for(const [name,expected]of Object.entries(proof)){const fn=ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text===name);assert(fn,name);assert.equal(hash(fn.getText(ast).replace(/^export /,'')),expected,name+' original body');assert.equal(screenAst.statements.some(node=>ts.isFunctionDeclaration(node)&&node.name?.text===name),false,name+' has one implementation')}
  assert.equal(jsxSourceHash(screenAst),'051777f36b4c3dbd5dea01d4a32544547a1b2533f47b072f182cef6217a8d5e5')
  assert.equal(fs.readFileSync(path.join(root,'lib/daily-targets.ts'),'utf8'),fs.readFileSync(path.join(root,'native/src/lib/dailyTargets.ts'),'utf8'),'normal server/native target math identical')
 })
 await check('whole dinner request reads actual manual targets + food + exercise + exact constraints without saving',async()=>{
  const h=harness(),result=await h.read();assert.equal(result.budget.status,'ready');assert.equal(result.budget.baseTargetCalories,2000);assert.equal(result.budget.exerciseCalories,250);assert.equal(result.budget.consumedCalories,1050);assert.equal(result.budget.remainingCalories,1200);assert.equal(result.targetBasis,'saved_manual_target');assert.deepEqual(json(result.constraints),{dietTypes:['Vegetarian'],allergies:['Peanuts'],diabetesType:''});assert.equal(result.totals.fiber,null);assert.equal(result.totals.sugar,0);assert.equal(result.safeToClaimSaved,false);assert.equal(h.op.execute,undefined);assert.equal(h.calls.filter(c=>c==='profile').length,2);assert.match(result.sourceVersion,/^[a-f0-9]{64}$/)
  const projection=h.op.plannerResult(result);assert.equal(projection.actorId,undefined);assert.equal(projection.budget.remainingCalories,1200);assert.equal(await h.op.verify(context(),result),true)
 })
 await check('normal UI target mapping and shared calculator match eligible manual/default/custom diet profiles',async()=>{
  const profiles=[baseProfile(),{...baseProfile(),goalChoice:'maintain weight',goalCalorieTarget:3500},{...baseProfile(),goalChoice:'gain weight',goalCalorieTarget:10000},{...baseProfile(),goalChoice:'lose weight',goalCalorieTarget:100},{...baseProfile(),dietTypes:['Keto'],goalMacroSplit:null},{...baseProfile(),gender:'female',bodyType:'endomorph',goalChoice:'maintain weight',goalMacroSplit:null}]
  for(const profile of profiles){const h=harness({profile}),result=await h.read(),ui=actualUiTargets(profile);assert.deepEqual(json(result.targets),ui)}
 })
 await check('personal target never becomes native fallback2200 when saved profile is incomplete',async()=>{
  for(const field of ['gender','weight','height','birthdate']){const profile=baseProfile();profile[field]='';const result=await harness({profile}).read();assert.equal(result.budget.status,'missing_personal_targets');assert.equal(result.targets,null);assert.equal(result.budget.remainingCalories,null);assert.equal(result.budget.baseTargetCalories,null);assert(result.missingPersonalFields.length)}
  const profile={...baseProfile(),birthdate:'2026-02-30'};assert.equal((await harness({profile}).read()).budget.status,'missing_personal_targets')
 })
 await check('missing food calorie evidence stays unknown while true zero and macro fallback match normal visible state',async()=>{
  const unknown=food('unknown',null,{nutrients:{calories:null,protein:10,carbs:null,fat:5,fiber:null,sugar:0}}),bad=await harness({foods:[unknown],exercises:[]}).read();assert.equal(bad.budget.status,'incomplete_food_nutrition');assert.equal(bad.budget.consumedCalories,null);assert.equal(bad.budget.remainingCalories,null);assert.equal(bad.totals.carbs,null)
  const zero=await harness({foods:[food('zero',0,{nutrients:nutrient(0,{protein:0,carbs:0,fat:0,fiber:0})})],exercises:[]}).read();assert.equal(zero.budget.consumedCalories,0);assert.equal(zero.budget.remainingCalories,2000);assert.equal(zero.totals.fiber,0)
  const macros=await harness({foods:[food('macros',null,{nutrients:{protein:10,carbs:20,fat:10,fiber:null,sugar:0}})],exercises:[]}).read();assert.equal(macros.budget.consumedCalories,210);assert.equal(macros.budget.remainingCalories,1790)
 })
 await check('native eaten portion applies exactly once including more than whole recipe; hydration not counted twice',async()=>{
  for(const scale of [.5,1,2]){const raw=food('meal',999,{items:[{name:'A',calories:100,protein_g:10,carbs_g:10,fat_g:2,fiber_g:null,sugar_g:0,servings:1},{name:'B',calories:200,protein_g:5,carbs_g:20,fat_g:4,fiber_g:0,sugar_g:0,servings:1}],nutrients:{__portionScale:scale,__waterLogId:'paired-water'}}),h=harness({foods:[raw],exercises:[]}),result=await h.read();assert.equal(result.budget.consumedCalories,300*scale);assert.equal(result.foodCount,1);assert.equal(result.totals.fiber,null);assert.equal(result.visibleDiaryTotals.calories,diary.normalizeFoodApiEntry(raw).nutrients.calories);assert.equal(h.calls.some(c=>typeof c==='object'&&c.type==='water'),false)}
 })
 await check('empty day and over-budget day return exact normal allowance/clamped remainder and overage',async()=>{
  let result=await harness({foods:[],exercises:[]}).read();assert.equal(result.budget.remainingCalories,2000);assert.equal(result.totals.calories,0)
  result=await harness({foods:[food('large',3000)],exercises:[]}).read();assert.equal(result.budget.remainingCalories,0);assert.equal(result.budget.overByCalories,1000)
 })
 await check('strict day/timezone/auth/account/cancellation gates refuse before app reads',async()=>{
  for(const [values,options,ctx]of [[{localDate:'2026-02-30'},{},context()],[{timeZone:'UTC'},{},context()],[{}, {zone:null},context()],[{}, {zone:'Mars/Base'},context()],[{}, {actor:'other'},context()],[{}, {},{...context(),localDate:'2026-10-16'}]]){const h=harness(options);await assert.rejects(()=>h.read(values,ctx));assert.equal(h.calls.length,0)}
  const controller=new AbortController();controller.abort();const h=harness();await assert.rejects(()=>h.read({}, {...context(),signal:controller.signal}));assert.equal(h.calls.length,0)
 })
 await check('IANA DST uses both offset reads and actual local date; legacy rows remain read-only and deduplicated',async()=>{
  assert.deepEqual(json(api.currentStateDay('2026-10-04','Australia/Melbourne').offsetsMinutes),[-660,-600]);assert.deepEqual(json(api.currentStateDay('2026-04-05','Australia/Melbourne').offsetsMinutes),[-660,-600]);assert.deepEqual(json(api.currentStateDay('2026-10-17','Pacific/Kiritimati').offsetsMinutes),[-840])
  now='2026-10-04T03:00:00.000Z';const rows=[food('before',100,{localDate:null,createdAt:'2026-10-03T14:30:00Z'}),food('after',200,{localDate:'',createdAt:'2026-10-04T12:30:00Z'}),food('outside',900,{localDate:null,createdAt:'2026-10-04T13:30:00Z'})],original=json(rows),h=harness({foods:rows,exercises:[]}),result=await h.read({}, {...context(),localDate:'2026-10-04'});assert.equal(result.foodCount,2);assert.equal(result.budget.consumedCalories,300);assert.equal(h.calls.filter(c=>typeof c==='object'&&c.type==='food').length,4);assert.deepEqual(rows,original)
 })
 await check('old diary handler without read-only proof, foreign account/day, duplicate snapshots and invalid exercise totals refuse',async()=>{
  const cases=[{services:{profile:async()=>({data:baseProfile()})}},{services:{food:async()=>({success:true,logs:[]})}},{foods:[food('foreign',100,{userId:'other'})]},{foods:[food('other-day',100,{localDate:'2026-10-16'})]},{exercises:[{id:'run',userId:'other',localDate:'2026-10-17',calories:200}]},{services:{exercise:async()=>({date:'2026-10-17',entries:[],exerciseCalories:250})}}]
  for(const options of cases)await assert.rejects(()=>harness(options).read())
 })
 await check('profile/food/exercise changes and account switch during reads reject mixed current-state; re-verification catches later edits',async()=>{
  const h=harness();let reads=0;h.services.profile=async()=>({readOnly:true,data:{...h.state.profile,goalCalorieTarget:++reads===1?2000:2100}});await assert.rejects(()=>h.read(),/changed/)
  const a=harness();let auths=0;a.services.authenticatedActor=async()=>++auths<4?'owner':'other';await assert.rejects(()=>a.read(),/same signed-in/)
  const f=harness(),result=await f.read();f.state.foods[0].nutrients.calories=900;assert.equal(await f.op.verify(context(),result),false)
 })
 await check('birthday across server and trusted local day never presents wrong personalized target as actual',async()=>{
  now='2026-10-16T13:30:00Z';const local=api.currentStateDay('2026-10-17','Australia/Melbourne'),systemDate=new Clock().getDate();if(systemDate===16){const result=await harness({profile:{...baseProfile(),birthdate:'1990-10-17'}}).read();assert.equal(result.budget.status,'missing_personal_targets');assert(result.missingPersonalFields.includes('time-zone-safe birthday target'))}else{assert.equal(local.timeZone,'Australia/Melbourne')}
 })
 await check('mid-read day/timezone changes reject stale dinner context; profile constraint changes invalidate version',async()=>{
  const h=harness();let zones=0;h.services.trustedTimeZone=async()=>++zones===1?'Australia/Melbourne':'UTC';await assert.rejects(()=>h.read(),/time zone changed/)
  const m=harness();let clocks=0;m.services.now=()=>new Clock(++clocks===1?'2026-10-17T12:59:59Z':'2026-10-17T13:00:01Z');await assert.rejects(()=>m.read(),/local day/)
  const f=harness(),result=await f.read();assert.equal(f.op.plannerResult(result).targetsAsOfLocalDate,'2026-10-17');f.state.profile.allergies.push('Sesame');assert.equal(await f.op.verify(context(),result),false)
 })
 await check('fixed normal handler bridge preserves auth/signal, requests read-only exact date offsets and removes country-write headers',async()=>{
  session={user:{id:'owner',email:'synthetic@example.invalid'}};native='owner';routeCalls=[]
  for(const name of ['user-data','food-log','exercise-entries'])normalRoutes['@/app/api/'+name+'/route']={GET:async req=>{routeCalls.push(req);return new Response(JSON.stringify(name==='user-data'?{data:baseProfile(),readOnly:true}:name==='food-log'?{success:true,readOnly:true,logs:[]}:{date:'2026-10-17',exerciseCalories:0,entries:[]}))}}
  const request=new Req('https://offline.invalid/api/native/assistant',{method:'POST',headers:{authorization:'Bearer synthetic-token','x-native-token':'synthetic-token','x-vercel-ip-country':'AU','cf-ipcountry':'AU'}}),services=api.createCurrentStateNormalServices(request,{trustedTimeZone:async()=> 'Australia/Melbourne',now:()=>new Clock()}),op=api.createNativeAssistantCurrentStateOperation(services),result=await op.read(context(),{})
  assert.equal(result.budget.remainingCalories,2000);assert.equal(routeCalls.length,6)
  for(const req of routeCalls){assert.equal(req.method,'GET');assert.equal(req.headers.get('authorization'),'Bearer synthetic-token');const url=new URL(req.url);if(url.pathname==='/api/user-data'){assert.equal(url.searchParams.get('scope'),'health-setup');assert.equal(url.searchParams.get('voiceReadOnly'),'1');assert.equal(req.headers.get('cf-ipcountry'),null);assert.equal(req.headers.get('x-vercel-ip-country'),null)}if(url.pathname==='/api/food-log'){assert.equal(url.searchParams.get('voiceReadOnly'),'1');assert.equal(url.searchParams.get('date'),'2026-10-17');assert.equal(url.searchParams.get('tz'),'-660')}}
  native='other';await assert.rejects(()=>op.read(context(),{}));native='owner';session=null
 })
 await check('actual guarded user-data GET supplies stored profile and constraints without country or food repair writes',async()=>{
  const sourceFixtures=require('./voice2-read-only-routes-check.cjs'),h=sourceFixtures.harness(),normal=h.load(sourceFixtures.routeFiles.profile)
  session=null;native='owner';normalRoutes['@/app/api/user-data/route']=normal
  normalRoutes['@/app/api/food-log/route']={GET:async()=>new Response(JSON.stringify({success:true,readOnly:true,logs:[]}))}
  normalRoutes['@/app/api/exercise-entries/route']={GET:async()=>new Response(JSON.stringify({date:'2026-10-17',exerciseCalories:0,entries:[]}))}
  const request=new Req('https://offline.invalid/api/native/assistant',{method:'POST',headers:{authorization:'Bearer synthetic','cf-ipcountry':'AU'}}),services=api.createCurrentStateNormalServices(request,{trustedTimeZone:async()=> 'Australia/Melbourne',now:()=>new Clock()}),op=api.createNativeAssistantCurrentStateOperation(services),result=await op.read(context(),{})
  assert.equal(result.safeToClaimSaved,false);assert.equal(result.foodCount,0);const profile=await services.profile(context());assert.equal(profile.readOnly,true);assert.equal(profile.data.gender,'male');assert.deepEqual(json(profile.data.goals),['Sleep']);assert.deepEqual(json(result.constraints.allergies),[]);assert.equal(h.writes.length,0);assert.equal(h.ensureCalls.length,0);assert(!h.reads.some(read=>read.key==='food'))
 })
 console.log(`Voice2 current state: ${groups} actual-source offline groups passed. No actual accounts, providers, database, credits or app calls.`)
}
main().catch(error=>{console.error(error);process.exitCode=1})
