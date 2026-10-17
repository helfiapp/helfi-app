#!/usr/bin/env node
'use strict'
// Actual voice POST and its existing cost wrapper/paid gates. Only the provider
// factory, wallet and host transport are synthetic. No keys, accounts or calls.
const assert=require('node:assert/strict'),base=require('./voice-symptom-analysis-check.cjs').base
class Req extends Request{}
const json=(body,init={})=>new Response(JSON.stringify(body),{status:init.status||200})
function setup(options={}){
 const calls={provider:0,wallet:0,charges:[],host:0},turns=options.turns||[{channel:'typed',text:'Read my saved water.',history:[],actions:[],session:null}],costs=options.costs||turns.map(()=>1)
 const route=base.load('app/api/native/voice-assistant/route.ts',{NextRequest:Req,NextResponse:{json},Headers,URL,Intl,resolveHelfiTtsVoice:()=> 'synthetic',
  getServerSession:async()=>({user:{id:'owner'}}),getUserIdFromNativeAuth:async()=>null,authOptions:{},prisma:{user:{findUnique:async()=>({id:'owner',country:'AU'})}},aiConsentRequiredResponse:async()=>null,
  CreditManager:class{async getWalletStatus(){calls.wallet++;return{plan:options.noPlan?null:{id:'synthetic'},totalAvailableCents:options.balance??100,topUps:[]}}async chargeCents(amount){calls.charges.push(amount);return options.chargeFails!==true}},
  assertAiUsageAllowed:async()=>{},chatCompletionWithCost:async(client,params)=>{assert.equal(client.synthetic,true);assert.match(params.messages[0].content,/fixed action registry/);assert.match(params.messages[0].content,/done/);const i=calls.provider++;return{costCents:costs[i],completion:{choices:[{message:{content:'{"done":true}'}}]}}},
  // The synthetic host models an already verified saved question only through
  // its server turn; client body fields never grant that state.
  handleNativeAssistantRequest:async(request,planner,policy)=>{calls.host++;const body=await request.json();if(body.command||policy.decision&&turns[0]?.answeringQuestion!==true)return json({success:true,draft:{action:'assistant_plan',canConfirm:false},policy:policy.decision});try{for(const turn of turns)await planner(turn);return json({success:true,draft:{action:'assistant_plan',canConfirm:false}})}catch(error){return json({error:error.message},{status:400})}},
  beginVoiceActionTrace:()=>{throw Error('General request entered legacy intent route')},finishVoiceActionTrace:async value=>value,
 })
 // Replace exactly the normal provider-factory boundary in the isolated VM.
 // Its original environment-reading body is never called.
 route.getOpenAIClient=()=>({synthetic:true})
 const request=(text='Read my saved water.',extra={})=>new Req('https://helfi.example.invalid/api/native/voice-assistant',{method:'POST',headers:{'content-type':'application/json','x-helfi-voice-capabilities':'general-assistant-v1'},body:JSON.stringify({assistantSessionId:'synthetic_session',localDate:'2026-10-17',timeZone:'Australia/Melbourne',transcript:text,aiConsentGranted:true,...extra})})
 return{route,calls,request}
}
let groups=0;async function check(name,work){await work();groups++;console.log('PASS '+name)}
async function run(){
 await check('one request with several planner passes charges its combined normal cost once',async()=>{const f=setup({turns:[{session:null},{session:{status:'completed'},planningContinuation:true},{session:{status:'completed'},planningContinuation:true}],costs:[2,3,4]}),r=await f.route.POST(f.request()),d=await r.json();assert.equal(r.status,200);assert.equal(d.chargedCredits,9);assert.deepEqual(f.calls.charges,[9]);assert.equal(f.calls.provider,3)})
 await check('the existing minimum applies once even when synthetic reported vendor cost is zero',async()=>{const f=setup({costs:[0]}),d=await(await f.route.POST(f.request())).json();assert.equal(d.chargedCredits,3);assert.deepEqual(f.calls.charges,[3])})
 await check('correction of an owned active request never adds another user charge across passes',async()=>{const f=setup({turns:[{session:{status:'active'}},{session:{status:'completed'},planningContinuation:true}],costs:[4,5]}),d=await(await f.route.POST(f.request('Change the reviewed amount.'))).json();assert.equal(d.chargedCredits,0);assert.deepEqual(f.calls.charges,[]);assert.equal(f.calls.wallet,0);assert.equal(f.calls.provider,2)})
 await check('checking a submitted action does not create an extra preparation charge',async()=>{const f=setup({turns:[{session:{status:'completed'},recoveringPriorAction:true}],costs:[4]}),d=await(await f.route.POST(f.request('Check the previous result.'))).json();assert.equal(d.chargedCredits,0);assert.equal(f.calls.wallet,0)})
 await check('answering an owned question without a prior plan calls the planner without another wallet check or debit',async()=>{const f=setup({turns:[{session:null,answeringQuestion:true},{session:{status:'completed'},planningContinuation:true}],costs:[4,5]}),r=await f.route.POST(f.request('Yes')),d=await r.json();assert.equal(r.status,200);assert.equal(d.chargedCredits,0);assert.equal(f.calls.wallet,0);assert.deepEqual(f.calls.charges,[]);assert.equal(f.calls.provider,2)})
 await check('a client cannot supply the server-owned question-answer exemption',async()=>{const app=require('./voice2-app-host-check.cjs').setup();const refused=await app.app.handleNativeAssistantRequest(app.request(app.body({answeringQuestion:true})),app.planner);assert.equal(refused.status,400);assert.equal(app.counts().plannerCalls,0);assert.equal(app.counts().postCalls,0);const f=setup(),r=await f.route.POST(f.request('Read my saved water.',{answeringQuestion:true})),d=await r.json();assert.equal(r.status,200);assert.equal(d.chargedCredits,3);assert.deepEqual(f.calls.charges,[3]);assert.equal(f.calls.provider,1)})
 await check('structured controls and existing plain confirmation/discard controls call no planner or wallet',async()=>{for(const [text,extra] of [['Yes',{}],['Cancel',{}],['Check result',{assistantCommand:{type:'recover',actionId:'synthetic'}}]]){const f=setup(),r=await f.route.POST(f.request(text,extra));assert.equal(r.status,200);assert.equal(f.calls.provider,0);assert.equal(f.calls.wallet,0);assert.deepEqual(f.calls.charges,[])}})
 await check('normal paid-access and insufficient-credit gates deny before the synthetic provider',async()=>{for(const options of [{noPlan:true},{balance:1}]){const f=setup(options),r=await f.route.POST(f.request());assert.equal(r.status,402);assert.equal(f.calls.provider,0);assert.equal(f.calls.charges.length,0)}})
 await check('a failed final debit cannot be presented as a successful assistant response',async()=>{const f=setup({chargeFails:true}),r=await f.route.POST(f.request()),d=await r.json();assert.equal(r.status,402);assert.equal(d.success,undefined);assert.match(d.error,/Insufficient credits/)})
 console.log(`VOICE 2 planner cost: ${groups} actual-source synthetic groups passed. No real model, key, credit or billing call.`)
}
if(require.main===module)run().catch(error=>{console.error(error);process.exitCode=1})
module.exports={setup,run}
