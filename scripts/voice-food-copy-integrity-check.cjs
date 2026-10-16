#!/usr/bin/env node
'use strict'
// Actual builder/copy/hash/token source with synthetic transactions only. No
// app/provider imports, environment files, network or real database writes.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),crypto=require('node:crypto')
const root=path.resolve(__dirname,'..'),owner='synthetic-owner',sourceDate='2026-10-16',targetDate='2026-10-17',now=new Date('2026-10-17T01:00:00Z')
function moduleSource(file){const module={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText,{module,exports:module.exports,Date,Buffer,process:{env:{NEXTAUTH_SECRET:'synthetic-food-copy-token'}},require:name=>{assert.equal(name,'crypto');return crypto}},{filename:file});return module.exports}
const helpers=moduleSource('lib/native-voice-food-copy.ts'),tokens=moduleSource('lib/native-voice-review-token.ts')
function functions(file,names,extra={}){const source=fs.readFileSync(path.join(root,file),'utf8'),ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);const code=ast.statements.filter(node=>ts.isFunctionDeclaration(node)&&names.includes(node.name?.text)).map(node=>node.getText(ast)).join('\n');const context={...helpers,crypto,Date,Prisma:{JsonNull:null},...extra};vm.runInNewContext(ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.None}}).outputText,context,{filename:file});return context}
const food=(id,patch={})=>({id,userId:owner,name:`Food ${id}`,description:`Exact ${id}`,imageUrl:null,localDate:sourceDate,meal:'breakfast',category:'breakfast',createdAt:new Date('2026-10-16T01:30:00Z'),nutrients:{calories:150,protein_g:8,carbs_g:12,fat_g:8,fiber_g:null,sugar_g:12,__portionScale:.5,__portionAmount:1,__portionUnit:'serving',__portionControlEnabled:true,__importRecipe:{title:'Stored recipe',servings:2,steps:['Stored step'],ingredients:['100 g food']}},items:[{name:'Source item',serving_size:'100 g',calories:300,fiber_g:null,__voiceSourceFood:{id:'source-food',name:'Source item',calories:300}}],...patch})
const water=(id,patch={})=>({id,userId:owner,amount:250,unit:'ml',amountMl:250,label:'Coffee with milk',category:'breakfast',localDate:sourceDate,createdAt:new Date('2026-10-16T01:30:00Z'),...patch})
function harness(initialFoods=[food('source-1')],initialWaters=[]){
  let state={foods:structuredClone(initialFoods),waters:structuredClone(initialWaters)},writes=0,failAt=0,ignoreReadback=false,wrongReadback=false,missingWaterReadback=false
  const queries=[]
  const matches=(row,where={})=>(!where.userId||row.userId===where.userId)&&(!where.localDate||row.localDate===where.localDate)&&(!where.id||where.id.in.includes(row.id))&&(!where.OR||where.OR.some(value=>Object.entries(value).every(([key,rule])=>String(row[key]).toLowerCase()===rule.equals.toLowerCase())))
  function db(getState){return{
    foodLog:{
      findMany:async({where,orderBy,take})=>{queries.push('food.findMany');let rows=getState().foods.filter(row=>matches(row,where));if(orderBy)rows.sort((a,b)=>+new Date(a.createdAt)-+new Date(b.createdAt));if(take)rows=rows.slice(0,take);if(ignoreReadback)rows=rows.filter(row=>row.localDate!==targetDate);return structuredClone(rows).map(row=>wrongReadback&&row.localDate===targetDate?{...row,nutrients:{...row.nutrients,calories:9999}}:row)},
      createMany:async({data})=>{queries.push('food.createMany');for(const row of data){writes++;if(writes===failAt)throw Error('Synthetic copy failure');getState().foods.push(structuredClone(row))}return{count:data.length}},
    },
    waterLog:{
      findMany:async({where})=>{queries.push('water.findMany');return structuredClone(getState().waters.filter(row=>matches(row,where)&&!(missingWaterReadback&&row.localDate===targetDate)))},
      createMany:async({data})=>{queries.push('water.createMany');for(const row of data){writes++;if(writes===failAt)throw Error('Synthetic copy failure');getState().waters.push(structuredClone(row))}return{count:data.length}},
    },
  }}
  const api=functions('app/api/native/voice-assistant/route.ts',['buildFoodCopyDraft','shiftLocalDate','cleanText'],{prisma:db(()=>state)})
  const save=functions('app/api/native/voice-assistant/confirm/route.ts',['copyPreviousFood','localDate','reviewedTimestamp'])
  const prepare=async()=>{const built=await api.buildFoodCopyDraft(owner,targetDate,'breakfast');if(built.error)return built;const draft={action:'food_copy_previous',canConfirm:true,localDate:targetDate,localTime:'08:30',tzOffsetMin:-660,reviewIssuedAt:Date.now(),food:{sourceDate:built.sourceDate,sourceLogIds:built.rows.map(row=>row.id),sourceVersions:built.sourceVersions,sourceWaterVersions:built.sourceWaterVersions,entries:built.entries}};draft.reviewToken=tokens.signNativeVoiceDraft(owner,draft);return {built,draft}}
  const copy=async draft=>{assert.equal(tokens.verifyNativeVoiceDraft(owner,draft),true);const working=structuredClone(state);try{const result=await save.copyPreviousFood(owner,draft,db(()=>working));state=working;return result}catch(error){throw error}}
  return{prepare,copy,state:()=>state,writes:()=>writes,queries,edit:fn=>fn(state),fail:at=>failAt=at,hideReadback:()=>ignoreReadback=true,corruptReadback:()=>wrongReadback=true,hideWaterReadback:()=>missingWaterReadback=true}
}
const plain=value=>JSON.parse(JSON.stringify(value));let count=0
async function check(name,run){await run();count++;console.log(`PASS ${name}`)}
async function main(){
  await check('complete previous meal above old twenty-row limit is reviewed and bound; over one hundred refuses all',async()=>{
    const h=harness(Array.from({length:25},(_,i)=>food(`source-${i}`))),prepared=await h.prepare();assert.equal(prepared.built.rows.length,25);assert.equal(prepared.draft.food.sourceVersions.length,25);assert.match(prepared.built.review,/150 kcal/)
    const beforeQueries=h.queries.length;assert.equal((await h.copy(prepared.draft)).ids.length,25);assert.equal(h.queries.length-beforeQueries,3);assert.equal(h.queries.filter(value=>value==='food.createMany').length,1)
    const large=harness(Array.from({length:101},(_,i)=>food(`source-${i}`)));assert.match((await large.prepare()).error,/more than one hundred/);assert.equal(large.writes(),0)
  })
  await check('copied recipe keeps exact whole items, eaten portion, null nutrients, name, date and reviewed clock',async()=>{
    const source=food('source-1'),h=harness([source]),prepared=await h.prepare(),saved=await h.copy(prepared.draft),row=h.state().foods.find(row=>row.id===saved.ids[0])
    assert.deepEqual(plain(row.nutrients),plain(source.nutrients));assert.deepEqual(plain(row.items),plain(source.items));assert.equal(row.name,source.name);assert.equal(row.description,source.description);assert.equal(row.localDate,targetDate);assert.equal(row.createdAt.toISOString(),'2026-10-16T21:30:00.000Z')
  })
  await check('missing replaced foreign moved or nutritionally changed source rows refuse before any write',async()=>{
    for(const edit of [s=>s.foods.pop(),s=>s.foods[0].id='replacement',s=>s.foods[0].userId='other',s=>s.foods[0].localDate='2026-10-15',s=>s.foods[0].nutrients.calories=200,s=>s.foods[0].items[0].serving_size='50 g']){
      const h=harness([food('source-a'),food('source-b')]),prepared=await h.prepare();h.edit(edit);await assert.rejects(h.copy(prepared.draft),/source meal changed/);assert.equal(h.writes(),0)
    }
  })
  await check('absent duplicate partial proof and signed proof tampering cannot silently copy a subset',async()=>{
    for(const edit of [d=>delete d.food.sourceVersions,d=>d.food.sourceLogIds.push(d.food.sourceLogIds[0]),d=>d.food.sourceVersions.pop(),d=>d.food.sourceVersions[0].version='0'.repeat(64)]){
      const h=harness([food('source-a'),food('source-b')]),prepared=await h.prepare();edit(prepared.draft);prepared.draft.reviewToken=tokens.signNativeVoiceDraft(owner,prepared.draft);await assert.rejects(h.copy(prepared.draft));assert.equal(h.writes(),0)
    }
    const h=harness(),prepared=await h.prepare();prepared.draft.food.sourceVersions[0].version='0'.repeat(64);assert.equal(tokens.verifyNativeVoiceDraft(owner,prepared.draft),false)
  })
  await check('copied drink explicitly reviews hydration and receives independent new linked food/water IDs',async()=>{
    const source=food('coffee',{name:'Coffee with milk',nutrients:{calories:40,__waterLogId:'old-water',__drinkAmount:250,__drinkUnit:'ml',__drinkAmountMl:250},items:[{name:'Coffee',waterLogId:'old-water',calories:40}]}),h=harness([source],[water('old-water')]),prepared=await h.prepare()
    assert.match(prepared.built.review,/copies hydration: 250 ml Coffee with milk/);assert.equal(prepared.draft.food.sourceWaterVersions.length,1)
    const result=await h.copy(prepared.draft),copied=h.state().foods.find(row=>row.id===result.ids[0]),hydration=h.state().waters.find(row=>row.id===result.waterIds[0])
    assert.notEqual(hydration.id,'old-water');assert.equal(helpers.nativeVoiceFoodCopyWaterId(copied),hydration.id);assert.equal(copied.items[0].waterLogId,hydration.id);assert.equal(hydration.localDate,targetDate);assert.equal(copied.createdAt.toISOString(),hydration.createdAt.toISOString());assert.equal(copied.nutrients.calories,40)
    h.edit(s=>{s.waters=s.waters.filter(row=>row.id!=='old-water');s.foods=s.foods.filter(row=>helpers.nativeVoiceFoodCopyWaterId(row)!=='old-water')});assert(h.state().foods.some(row=>row.id===copied.id));assert(h.state().waters.some(row=>row.id===hydration.id))
  })
  await check('missing foreign stale or multiple source hydration links name the drink and refuse the whole copy',async()=>{
    const source=food('coffee',{name:'Specific coffee',nutrients:{calories:40,__waterLogId:'old-water'}})
    for(const waters of [[],[water('old-water',{userId:'other'})],[water('old-water',{localDate:targetDate})]]){const h=harness([source],waters),prepared=await h.prepare();assert.match(prepared.error,/Specific coffee/);assert.equal(h.writes(),0)}
    const ambiguous=harness([source,food('coffee-two',{nutrients:source.nutrients})],[water('old-water')]);assert.match((await ambiguous.prepare()).error,/multiple linked/)
    const h=harness([source],[water('old-water')]),prepared=await h.prepare();h.edit(s=>{s.waters[0].amount=300;s.waters[0].amountMl=300});await assert.rejects(h.copy(prepared.draft),/source drink changed/);assert.equal(h.writes(),0)
  })
  await check('a paired hydration or later food failure rolls every newly created row back',async()=>{
    for(const at of [1,2,3]){const h=harness([food('coffee',{nutrients:{calories:40,__waterLogId:'old-water'}}),food('food-two')],[water('old-water')]),prepared=await h.prepare();h.fail(at);await assert.rejects(h.copy(prepared.draft));assert.equal(h.state().foods.length,2);assert.equal(h.state().waters.length,1)}
  })
  await check('create success without exact food readback or with changed nutrition rolls all copied rows back',async()=>{
    for(const mode of ['missing','changed']){const h=harness(),prepared=await h.prepare();if(mode==='missing')h.hideReadback();else h.corruptReadback();await assert.rejects(h.copy(prepared.draft),/could not verify/);assert.equal(h.state().foods.length,1)}
  })
  await check('paired drink requires exact hydration readback and uses six bounded queries for any meal size',async()=>{
    const source=food('coffee',{nutrients:{calories:40,__waterLogId:'old-water'}})
    const missing=harness([source],[water('old-water')]),prepared=await missing.prepare();missing.hideWaterReadback();await assert.rejects(missing.copy(prepared.draft),/could not verify every copied hydration/);assert.equal(missing.state().foods.length,1);assert.equal(missing.state().waters.length,1)
    const h=harness([source,...Array.from({length:24},(_,i)=>food(`source-${i}`))],[water('old-water')]),ready=await h.prepare(),before=h.queries.length
    const result=await h.copy(ready.draft);assert.equal(result.ids.length,25);assert.equal(result.waterIds.length,1);assert.equal(h.queries.length-before,6)
  })
  await check('JSON-wrapped metadata and object key order preserve digest identity while every old hydration link changes',async()=>{
    const row=food('wrapped',{nutrients:JSON.stringify({calories:40,__waterLogId:'old'}),items:[{raw:{waterLogId:'old'}}]});assert.equal(helpers.nativeVoiceFoodCopyWaterId(row),'old')
    const linked=helpers.relinkNativeVoiceCopiedDrink(row.nutrients,'old','new');assert.equal(typeof linked,'string');assert.equal(JSON.parse(linked).__waterLogId,'new')
    assert.equal(helpers.nativeVoiceFoodCopyVersion(food('same',{nutrients:{a:1,b:2}})),helpers.nativeVoiceFoodCopyVersion(food('same',{nutrients:{b:2,a:1}})))
    assert.equal(helpers.nativeVoiceFoodCopyWaterId(food('ordinary',{nutrients:{calories:100,__waterLogId:null}})),null)
    assert.throws(()=>helpers.nativeVoiceFoodCopyWaterId({...row,nutrients:JSON.stringify({__drinkType:'Coffee',__drinkAmountMl:250,__waterLogId:null}),items:[]}))
  })
  console.log(`PASS ${count} food copy groups (actual source; synthetic transactions only)`)
}
main().catch(error=>{console.error(error);process.exitCode=1})
