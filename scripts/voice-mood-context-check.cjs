#!/usr/bin/env node
'use strict'
// Executes the actual mood parser, pending correction, save adapter and normal
// authenticated POST/GET with synthetic accounts/passive data/storage only.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),crypto=require('node:crypto')
const root=path.resolve(__dirname,'..'),date='2026-10-17',owner='synthetic-owner'
class NextRequest extends Request{}
const NextResponse={json:(value,options)=>new Response(JSON.stringify(value),{...options,headers:{'content-type':'application/json'}})}
let authId,rows,calls,passive,afterPost,afterGet,missingReadback
function reset(){authId=owner;rows=[];calls=[];afterPost=null;afterGet=null;missingReadback=false;passive={meals:2,supplements:3,medications:1,steps:4500,sleep:420,exercise:30}}
const prisma={user:{findUnique:async()=>authId?{id:authId,email:'synthetic@example.invalid'}:null},foodLog:{count:async()=>passive.meals,findFirst:async()=>({id:'synthetic-food',name:'Synthetic lunch',meal:'lunch',createdAt:'2026-10-17T01:00:00Z'})},supplement:{count:async()=>passive.supplements},medication:{count:async()=>passive.medications},exerciseEntry:{aggregate:async()=>({_sum:{durationMinutes:passive.exercise,calories:100}})},fitbitData:{findUnique:async()=>({value:passive.steps}),findFirst:async()=>({date:'2026-10-16',value:{minutes:passive.sleep}})},$queryRawUnsafe:async(sql,...args)=>{
  if(/INSERT INTO MoodEntries/.test(sql)){const[id,userId,localDate,mood,tags,note,context]=args;rows.push({id,userId,localDate,mood,tags:JSON.parse(tags),note,context:JSON.parse(context)});return []}
  assert.match(sql,/SELECT id, localDate/);assert.equal(args[0],authId);return missingReadback?[]:rows.filter(row=>row.userId===args[0]&&row.localDate>=args[1]&&row.localDate<=args[2]).map(row=>({...row}))
}}
const imports={'next/server':{NextRequest,NextResponse},'next-auth':{getServerSession:async()=>authId?{user:{id:authId,email:'synthetic@example.invalid'}}:null},'@/lib/auth':{authOptions:{}},'@/lib/native-auth':{getUserIdFromNativeAuth:async()=>authId},'@/lib/prisma':{prisma},'crypto':crypto,'@/app/api/mood/_db':{ensureMoodTables:async()=>{}},'@/lib/notification-inbox':{deleteNotificationsByType:async()=>calls.push('clear mood reminder'),deleteSmartCoachNotificationsByCategories:async()=>calls.push('clear smart coach')}}
function load(file,extra={}){const module={exports:{}},context={module,exports:module.exports,URL,Headers,Request,Response,Date,Intl,console,require:name=>{if(Object.hasOwn(extra,name))return extra[name];if(Object.hasOwn(imports,name))return imports[name];throw Error(`Unexpected dependency ${name}`)}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText,context,{filename:file});return module.exports}
const normal=load('app/api/mood/entries/route.ts')
imports['@/app/api/mood/entries/route']={POST:async request=>{calls.push({method:'POST',body:await request.clone().json(),authorization:request.headers.get('authorization')});const result=await normal.POST(request);afterPost?.();return result},GET:async request=>{calls.push({method:'GET',url:request.url});const result=await normal.GET(request);afterGet?.();return result}}
const helper=load('lib/native-voice-mood-context.ts')
const routeSource=fs.readFileSync(path.join(root,'app/api/native/voice-assistant/route.ts'),'utf8'),ast=ts.createSourceFile('route.ts',routeSource,ts.ScriptTarget.Latest,true)
const names=new Set(['tryParseMoodRequest','moodSpeechEvidence','explicitVoiceMoodNote','isRatingOnlyMoodRequest','buildReviewedMoodCorrection','normalizeMood','explicitMoodFromTranscript','extractReviewedNoteCorrectionText','hasReviewedCorrectionWords','numberFromWords','cleanText','clampNumber'])
const snippets=ast.statements.filter(node=>ts.isFunctionDeclaration(node)&&names.has(node.name?.text)).map(node=>node.getText(ast)).join('\n')
const route={...helper,console,Date};vm.runInNewContext(ts.transpileModule(snippets,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.None}}).outputText,route)
const request=()=>new NextRequest('https://helfi.invalid/api/native/voice-assistant/confirm',{headers:{authorization:'Bearer synthetic','x-native-token':'synthetic'}})
const draft=(context={})=>({action:'mood',canConfirm:true,localDate:date,mood:{mood:5,tags:['calm'],note:'Exact reviewed note',context}})
const plain=value=>JSON.parse(JSON.stringify(value));let count=0
async function check(name,run){reset();await run();count++;console.log(`PASS ${name}`)}
async function main(){
  await check('physical bare Note request keeps exact note and no-save control out of the proposed data',async()=>{
    const text="Log my mood as five out of seven for today. Note: Voice review check only. Don't save it yet."
    const parsed=route.tryParseMoodRequest(text,{section:'mood'})
    assert.equal(parsed.mood.mood,5);assert.equal(parsed.mood.note,'Voice review check only.');assert.deepEqual(plain(parsed.mood.context),{})
    const normalized=route.explicitMoodFromTranscript(text,{section:'mood'})
    assert.equal(normalized.mood,5);assert.equal(normalized.note,'Voice review check only.')
    assert.equal(rows.length,0);assert.equal(calls.length,0,'Preparing a mood does not call a save handler')
    const original={...draft(),localDate:'2026-10-16',mood:normalized}
    const changed=route.buildReviewedMoodCorrection(original,'Actually make it two out of seven','2026-10-16')
    assert.equal(changed.mood.mood,2);assert.equal(changed.mood.note,'Voice review check only.');assert.equal(changed.localDate,'2026-10-16');assert.equal(changed.autoSave,false)
    assert.equal(rows.length,0)
    const result=await helper.saveNativeVoiceMood(request(),owner,original)
    assert.equal(result.id,rows[0].id);assert.equal(rows.length,1);assert.equal(rows[0].userId,owner);assert.equal(rows[0].localDate,'2026-10-16');assert.equal(rows[0].mood,5);assert.equal(rows[0].note,'Voice review check only.')
    const post=calls.find(call=>call.method==='POST');assert.equal(post.body.note,'Voice review check only.');assert.equal(post.body.localDate,'2026-10-16');assert.doesNotMatch(post.body.note,/log my mood|save it yet/i)
  })
  await check('explicit bare colon, note saying and existing quoted forms retain literal content and bounded controls',async()=>{
    for(const[text,expected]of [
      ["Log mood 5/7. Note: First sentence. Second sentence. Don't save it yet.",'First sentence. Second sentence.'],
      ["Log mood 5/7. Note saying Voice review check only. Do not save this yet.",'Voice review check only.'],
      ["Log mood 5/7. Add the note Voice review check only. Don't save it yet.",'Voice review check only.'],
      ['Log mood 5/7. Add note "Voice review check only.". Don’t save it yet.','Voice review check only.'],
      ['Log mood 5/7. Note: "Do not save it yet."','Do not save it yet.'],
      ['Log mood 5/7. Note: "save it"','save it'],
      ['Log mood 5/7. Add note “I felt calm. Don’t save it yet.”','I felt calm. Don’t save it yet.'],
      ["Log mood 5/7. Note: I'm calm and hopeful. Don't save it yet.","I'm calm and hopeful."],
      ['Log mood 5/7. Add the note Voice repair test mood.','Voice repair test mood'],
    ]){assert.equal(route.explicitVoiceMoodNote(text),expected,text);assert.equal(route.tryParseMoodRequest(text,{section:'mood'}).mood.note,expected,text)}
    const emotional=route.tryParseMoodRequest("I feel calm today. Note: Voice review check only. Don't save it yet.",{section:'mood'});assert.equal(emotional.mood.mood,5);assert.equal(emotional.mood.note,'Voice review check only.')
    const corrected=route.buildReviewedMoodCorrection(draft({energyLevel:2}),'Note: Exact replacement. Don’t save it yet.',date)
    assert.equal(corrected.mood.mood,5);assert.equal(corrected.mood.note,'Exact replacement.');assert.equal(corrected.mood.context.energyLevel,2);assert.equal(corrected.autoSave,false)
    assert.equal(route.explicitVoiceMoodNote('I feel calm today'),null);assert.equal(rows.length,0);assert.equal(calls.length,0)
  })
  await check('actual preparation POST returns exact bare note date and review without executing a mood save',async()=>{
    const fixtureSource=fs.readFileSync(path.join(root,'scripts/voice-action-matrix-check.cjs'),'utf8').replace(/^#!.*\n/,'')
    const boundary=fixtureSource.indexOf('async function run() {');assert(boundary>0,'Use only the existing offline route fixture declarations')
    const prepare=new Function('require','__dirname',fixtureSource.slice(0,boundary)+'\nreturn {send}')(require,__dirname)
    for(const[text,note]of [["Log my mood as five out of seven for today. Note: Voice review check only. Don't save it yet.",'Voice review check only.'],['Log my mood as five out of seven for today. Note: "save it". Don’t save it yet.','save it'],["Log my mood as five out of seven for today. Don't save it yet.",'']]){
      const response=await prepare.send(text,{launchContext:{section:'mood',title:'Mood Tracker'}})
      assert.equal(response.status,200);assert.equal(response.body.draft.action,'mood');assert.equal(response.body.draft.mood.mood,5);assert.equal(response.body.draft.mood.note,note);assert.equal(response.body.draft.localDate,date);assert.equal(response.body.draft.autoSave,false);assert.equal(response.body.confirmNow,undefined);assert.equal(response.body.draft.canConfirm,true)
    }
    assert.equal(rows.length,0);assert.equal(calls.length,0)
  })
  await check('clear rating-only commands keep an empty note while meaningful narrative and quoted literal notes stay intact',async()=>{
    for(const text of ['Log my mood as five out of seven for today',"Log my mood as five out of seven for today. Don't save it yet.",'Log my mood today as five out of seven. Save it.','Record mood 2/7 on 2026-10-16. Do not save it yet.','Set the mood rating to 3 out of seven for October 16 2026.','five out of seven']){
      const parsed=route.tryParseMoodRequest(text,{section:'mood'});assert(parsed?.mood,text);assert.equal(parsed.mood.note,'',text)
      const changed=route.buildReviewedMoodCorrection({...draft(),mood:{...draft().mood,note:''}},'Change the rating to two out of seven',date);assert.equal(changed.mood.mood,2);assert.equal(changed.mood.note,'')
    }
    for(const text of ['I feel 5/7 because my walk helped','Log my mood as five out of seven because I felt calmer after my walk','I feel calm after work'])assert.equal(route.tryParseMoodRequest(text,{section:'mood'}).mood.note,text)
    assert.equal(route.tryParseMoodRequest('Log mood 5/7. Note: "save it"',{section:'mood'}).mood.note,'save it')
    const proposed=route.explicitMoodFromTranscript("Log my mood as five out of seven for today. Don't save it yet.",{section:'mood'})
    assert.equal(rows.length,0);assert.equal(calls.length,0)
    const input={...draft(),mood:proposed};await helper.saveNativeVoiceMood(request(),owner,input);assert.equal(rows[0].note,'');assert.equal(rows[0].mood,5);assert.equal(rows[0].userId,owner);assert.equal(rows[0].localDate,date)
  })
  await check('explicit five-point detail ratings, natural percentages and feelings are independent of seven-point mood',async()=>{
    const text='Log my mood as five out of seven. Energy two out of five, sleep quality 3/5, nutrition four, supplements one, medication effect 5/5, physical activity 2/5. Intensity seventy percent. Feelings are calm and hopeful.'
    const parsed=route.tryParseMoodRequest(text,{section:'mood'});assert.equal(parsed.mood.mood,5)
    assert.deepEqual(plain(parsed.mood.context),{energyLevel:2,sleepQuality:3,nutrition:4,supplements:1,medicationEffect:5,physicalActivity:2,intensityPercent:70,feelings:['calm','hopeful']})
    assert.equal(route.explicitMoodFromTranscript('Energy 2/5 and sleep quality 3/5',{section:'mood'}),null)
    assert.equal(route.tryParseMoodRequest('I feel hot today',{section:'mood'}).mood,null)
    assert.deepEqual(plain(helper.parseNativeVoiceMoodContext('I slept 6 hours and had low energy').context),{})
  })
  await check('invalid explicit ratings and unmentioned guessed model context cannot become accepted mood details',async()=>{
    for(const text of ['Log mood 5/7, energy 6/5','Log mood 5/7, energy 2/7','Log mood 5/7, energy 2 or 3 out of five','Log mood 5/7, intensity 101 percent','Log mood 5/7, intensity 2.5 percent','Log mood 5/7. Do not set energy to 2/5'])assert.equal(route.tryParseMoodRequest(text,{section:'mood'}).mood,null)
    for(const value of [{energyLevel:0},{energyLevel:6},{energyLevel:'2'},{intensityPercent:101},{stepsToday:1234},{feelings:['x'.repeat(25)]}])assert.throws(()=>helper.validateNativeVoiceMoodContext(value))
    const actual=route.explicitMoodFromTranscript('Log mood as five out of seven',{section:'mood'});assert.deepEqual(plain(actual.context),{})
  })
  await check('context-only corrections preserve score tags note and every unchanged context field',async()=>{
    const original=draft({energyLevel:4,sleepQuality:3,intensityPercent:50,feelings:['hopeful']})
    const corrected=route.buildReviewedMoodCorrection(original,'Change energy to two out of five',date)
    assert.equal(corrected.canConfirm,true);assert.equal(corrected.mood.mood,5);assert.deepEqual(plain(corrected.mood.tags),['calm']);assert.equal(corrected.mood.note,original.mood.note)
    assert.deepEqual(plain(corrected.mood.context),{energyLevel:2,sleepQuality:3,intensityPercent:50,feelings:['hopeful']})
    const feelings=route.buildReviewedMoodCorrection(corrected,'Set feelings to calm and hopeful',date);assert.equal(feelings.mood.mood,5);assert.deepEqual(plain(feelings.mood.context.feelings),['calm','hopeful'])
    assert.match(feelings.confirmationMessage,/feelings: calm, hopeful/)
    const cleared=route.buildReviewedMoodCorrection(feelings,'Clear my feelings',date);assert.deepEqual(plain(cleared.mood.context.feelings),[])
    const invalid=route.buildReviewedMoodCorrection(original,'Change energy to six out of five',date);assert.equal(invalid.canConfirm,false);assert.equal(invalid.mood.mood,5)
    const fixed=route.buildReviewedMoodCorrection(invalid,'Change energy to three out of five',date);assert.equal(fixed.canConfirm,true);assert.equal(fixed.mood.mood,5);assert.equal(fixed.mood.context.energyLevel,3)
  })
  await check('rating and note corrections retain context and note content never silently becomes a context rating',async()=>{
    const original=draft({energyLevel:2,intensityPercent:70})
    const score=route.buildReviewedMoodCorrection(original,'Actually make it two out of seven',date);assert.equal(score.mood.mood,2);assert.deepEqual(plain(score.mood.context),plain(original.mood.context));assert.equal(score.mood.note,original.mood.note)
    const note=route.buildReviewedMoodCorrection(original,'Change the note to my energy was 4/5 last year',date);assert.equal(note.mood.mood,5);assert.equal(note.mood.context.energyLevel,2);assert.equal(note.mood.note,'my energy was 4/5 last year')
  })
  await check('actual normal authenticated POST preserves passive context and every explicit reviewed value then verifies exact saved ID',async()=>{
    const input=draft({energyLevel:2,sleepQuality:3,nutrition:4,supplements:1,medicationEffect:5,physicalActivity:2,intensityPercent:70,feelings:['calm','hopeful']})
    const result=await helper.saveNativeVoiceMood(request(),owner,input);assert.equal(result.kind,'mood');assert.equal(rows.length,1);assert.equal(result.id,rows[0].id)
    for(const[key,value]of Object.entries(input.mood.context))assert.deepEqual(plain(rows[0].context[key]),value)
    assert.equal(rows[0].context.mealsTodayCount,2);assert.equal(rows[0].context.stepsToday,4500);assert.equal(rows[0].context.sleepMinutes,420);assert.equal(rows[0].context.medicationsCount,1)
    assert.equal(calls.find(call=>call.method==='POST').authorization,'Bearer synthetic');assert(calls.some(call=>call.method==='GET'));assert(calls.includes('clear mood reminder'))
  })
  await check('blank note and empty feelings remain blank, and clock context comes only from reviewed valid time',async()=>{
    const input=draft({feelings:[],localHour:23});input.mood.note='';await helper.saveNativeVoiceMood(request(),owner,input)
    assert.equal(rows[0].note,'');assert.equal(rows[0].context.localHour,undefined);assert.equal(rows[0].context.feelings,undefined)
    const timed=draft({localHour:23});timed.localTime='07:30';await helper.saveNativeVoiceMood(request(),owner,timed);assert.equal(rows[1].context.localHour,7)
  })
  await check('missing auth wrong account and invalid date or context cannot write any mood row',async()=>{
    authId=null;await assert.rejects(helper.saveNativeVoiceMood(request(),owner,draft()));authId='other';await assert.rejects(helper.saveNativeVoiceMood(request(),owner,draft()));authId=owner
    for(const input of [{...draft(),localDate:'2026-02-30'},draft({nutrition:8}),{...draft(),mood:{...draft().mood,mood:8}}])await assert.rejects(helper.saveNativeVoiceMood(request(),owner,input))
    assert.equal(rows.length,0)
  })
  await check('normal handler success without exact readback or mismatched context never yields a success receipt',async()=>{
    missingReadback=true;await assert.rejects(helper.saveNativeVoiceMood(request(),owner,draft({energyLevel:2})),/could not be checked/)
    reset();afterPost=()=>{rows[0].context.energyLevel=4};await assert.rejects(helper.saveNativeVoiceMood(request(),owner,draft({energyLevel:2})),/do not match/)
    reset();afterPost=()=>{rows.push({...rows[0]})};await assert.rejects(helper.saveNativeVoiceMood(request(),owner,draft()),/could not be checked/)
  })
  await check('account switches and cancellation after POST cannot return a misleading saved receipt',async()=>{
    afterPost=()=>{authId='other'};await assert.rejects(helper.saveNativeVoiceMood(request(),owner,draft()),/account changed/);assert.equal(rows.length,1)
    reset();const controller=new AbortController(),req=new NextRequest(request(),{signal:controller.signal});afterPost=()=>controller.abort();await assert.rejects(helper.saveNativeVoiceMood(req,owner,draft()),/account changed/);assert.equal(rows.length,1)
  })
  console.log(`PASS ${count} mood context groups (actual normal handlers; synthetic IO only)`)
}
main().catch(error=>{console.error(error);process.exitCode=1})
