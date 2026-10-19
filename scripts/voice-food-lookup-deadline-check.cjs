#!/usr/bin/env node
'use strict'
// Actual ordinary lookup and structured POST; virtual clock, catalog reads and
// Request objects only. No waits, network, credentials or real data access.
const assert=require('node:assert/strict'),prep=require('./voice2-food-normal-prepare-check.cjs')
const tick=()=>new Promise(setImmediate),ctx=prep.ctx
async function until(predicate){for(let n=0;n<30&&!predicate();n++)await tick();assert(predicate(),'Synthetic async phase did not begin')}
async function clocked(work){
 const names=['Date','setTimeout','clearTimeout','NextRequest','searchLocalFoods','searchCustomFoodMacros','searchDiaryFoods','searchDiaryFoodServings'],original=Object.fromEntries(names.map(name=>[name,ctx[name]]))
 let at=1000000,sequence=0;const timers=new Map(),requests=[]
 class Clock extends Date{constructor(...args){super(...(args.length?args:[at]))}static now(){return at}}
 Object.assign(ctx,{Date:Clock,setTimeout:(callback,ms)=>{const id=++sequence;timers.set(id,{callback,at:at+ms});return id},clearTimeout:id=>timers.delete(id),NextRequest:class extends Request{constructor(url,options){super(url,options);requests.push(this)}},searchCustomFoodMacros:async()=>[]})
 const advance=async ms=>{at+=ms;for(const[id,timer]of[...timers].sort((a,b)=>a[1].at-b[1].at))if(timer.at<=at){timers.delete(id);timer.callback()}await tick()}
 try{await work({now:()=>at,advance,requests});assert.equal(timers.size,0,'Every completed lookup clears its timer')}finally{Object.assign(ctx,original)}
}
const ingredient=(name='Quinoa cooked',unit='g')=>({name,quantity:100,unit,display:`100 ${unit} ${name}`,requireRecordedPortion:true})
let groups=0
async function check(name,work){prep.normal.reset();await clocked(work);groups++;console.log('PASS '+name)}
async function main(){
 await check('a slow first local read returns unresolved at the aggregate limit and a late exact row cannot restart lookup',async c=>{
  let finishLocal,local=0,external=0
  ctx.searchLocalFoods=()=>{local++;return new Promise(resolve=>{finishLocal=resolve})};ctx.searchDiaryFoods=async()=>{external++;throw Error('No external query may start after expiration')}
  const pending=ctx.findFoodIngredient('quinoa',undefined,ingredient('quinoa'));await tick();assert.equal(local,1)
  await c.advance(6000);assert.equal(await pending,null);assert.equal(external,0)
  finishLocal([prep.source('Quinoa cooked')]);await tick();assert.equal(local,1);assert.equal(external,0)
 })
 await check('local and external phases share one deadline, propagate AbortSignal and never start a next variant after expiration',async c=>{
  let externalFinish;const phases=[],start=c.now()
  ctx.searchLocalFoods=async()=>{await c.advance(1000);return[]}
  ctx.searchDiaryFoods=request=>{const url=new URL(request.url);phases.push({localOnly:url.searchParams.get('localOnly'),signal:request.signal});return url.searchParams.get('localOnly')?Promise.resolve({ok:true,json:async()=>({items:[]})}):new Promise(resolve=>{externalFinish=resolve})}
  const pending=ctx.findFoodIngredient('quinoa',undefined,ingredient('quinoa'));await until(()=>typeof externalFinish==='function');assert.deepEqual(phases.map(row=>row.localOnly),['1',null])
  await c.advance(6000-(c.now()-start));assert.equal(await pending,null);assert(phases.every(row=>row.signal.aborted))
  externalFinish({ok:true,json:async()=>({items:[prep.source('quinoa')]})});await tick();assert.equal(phases.length,2)
 })
 await check('a slow serving-detail read cannot select late portions or start further catalog requests',async c=>{
  const item={...prep.source('Egg, whole, cooked, fried'),id:'recorded-egg'},requested={...ingredient('fried eggs','each'),quantity:2};let finishServing,searches=0,details=0
  ctx.searchDiaryFoods=async()=>{searches++;return{ok:true,json:async()=>({items:[item]})}}
  ctx.searchDiaryFoodServings=()=>{details++;return new Promise(resolve=>{finishServing=resolve})}
  const pending=ctx.findOrdinaryVoiceFood(requested,'AU',['fried eggs','fried egg']);await tick();assert.equal(details,1)
  await c.advance(6000);assert.equal(await pending,null);assert.equal(searches,1);assert(c.requests.every(request=>request.signal.aborted))
  finishServing({ok:true,json:async()=>({options:[{...item,id:'large',foodId:item.id,foodName:item.name,serving_size:'1 large egg (50 g)'}]})});await tick();assert.equal(searches,1);assert.equal(details,1)
 })
 await check('an exact supplier result within budget is retained even if local alternatives might exist',async c=>{
  const item={...prep.source('Quinoa cooked'),id:'exact-supplier',source:'fatsecret'};const phases=[]
  ctx.searchDiaryFoods=async request=>{const local=new URL(request.url).searchParams.get('localOnly');phases.push(local);await c.advance(500);return{ok:true,json:async()=>({items:local?[]:[item]})}}
  const found=await ctx.findOrdinaryVoiceFood(ingredient(),'AU',['Quinoa cooked']);assert.equal(found.id,item.id);assert.equal(found.source,'fatsecret');assert.deepEqual(phases,['1',null])
 })
 await check('a usable local source wins without any supplier request and retains its exact nutrient basis',async()=>{
  const item=prep.source('Quinoa cooked');item.fiber_g=null;item.sugar_g=0;let calls=0
  ctx.searchDiaryFoods=async request=>{calls++;assert.equal(new URL(request.url).searchParams.get('localOnly'),'1');return{ok:true,json:async()=>({items:[item]})}}
  const found=await ctx.findOrdinaryVoiceFood(ingredient(),'AU',['Quinoa cooked','quinoa']);assert.equal(found.id,item.id);assert.equal(found.fiber_g,null);assert.equal(found.sugar_g,0);assert.equal(calls,1)
 })
 await check('all local source alternatives share one two-second allowance and ignore late rows',async c=>{
  let reads=0,finish
  ctx.searchLocalFoods=()=>{reads++;return new Promise(resolve=>{finish=resolve})}
  const values={ingredients:[ingredient('woodland mushrooms'),ingredient('sunny-side-up eggs')]},pending=ctx.structuredFoodSourceChoices(values,[0,1]);await tick();assert.equal(reads,1)
  await c.advance(2000);assert.deepEqual(Array.from(await pending),[]);finish([prep.source('Mushrooms cooked')]);await tick();assert.equal(reads,1)
 })
 await check('actual structured POST reaches retained clarification within six plus two seconds without a late source review',async c=>{
  let reads=0;const finishes=[]
  ctx.searchLocalFoods=()=>{reads++;return new Promise(resolve=>finishes.push(resolve))}
  const {requireRecordedPortion,...requested}=ingredient('quinoa')
  const values={name:'Keep this meal',meal:'breakfast',localDate:'2026-10-17',destination:'diary',ingredients:[requested]}
  const pending=prep.post('food.diary.create',values);await until(()=>reads===1);await c.advance(6000);await until(()=>reads===2)
  await c.advance(2000);const response=await pending,body=await response.json();assert.equal(response.status,422);assert.equal(body.code,'missing_fields');assert.equal(body.preparation,undefined);assert.match(body.error,/Nothing has been saved/)
  for(const resolve of finishes)resolve([prep.source('quinoa')]);await tick();assert.equal(reads,2)
 })
 console.log(`Voice food lookup deadline: ${groups} actual-function offline groups passed. Virtual timing proves awaited limits, not upstream cancellation or live latency.`)
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1})
