#!/usr/bin/env node
'use strict'
// Actual pure Live tool coordinator. No app bootstrap, account, provider or key.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript')
const moduleBox={exports:{}}
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.resolve(__dirname,'../native/src/voice/liveVoiceToolTurn.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:moduleBox,exports:moduleBox.exports})
const {createLiveVoiceToolTurn}=moduleBox.exports
const tick=async()=>{for(let n=0;n<12;n++)await Promise.resolve()}
const envelope=(event,delegation='delegation-one')=>({type:'response.event',delegation_id:delegation,event})
const created=(id='response-one',delegation)=>envelope({type:'response.created',response:{id}},delegation)
const done=(callId='call-one',delegation)=>envelope({type:'response.output_item.done',item:{type:'function_call',name:'request_helfi_action',call_id:callId,arguments:'{}'}},delegation)
const completed=(id='response-one',delegation)=>envelope({type:'response.completed',response:{id,output:[],tools:[],instructions:null}},delegation)
function fixture(execute=()=>({ok:true,saved:false,message:'Verified normal read'}),sendOverride){
  let current=true
  const sent=[],calls=[],errors=[]
  const api=createLiveVoiceToolTurn({isCurrent:()=>current,executeToolCall:item=>{calls.push(item);return execute(item)},send:event=>{sent.push(event);return sendOverride?.(event)},onError:message=>errors.push(message)})
  return {api,sent,calls,errors,current:value=>{current=value},outputs:()=>sent.filter(e=>e.type==='response.item.create'),continues:()=>sent.filter(e=>e.type==='response.create')}
}
let groups=0
async function check(name,run){await run();groups++;console.log('PASS '+name)}
async function main(){
  await check('single actual call waits terminal response and uses exact supported wire fields',async()=>{
    const f=fixture();f.api.handleEvent(created());f.api.handleEvent(done());await tick();assert.equal(f.calls.length,1);assert.equal(f.sent.length,0)
    f.api.handleEvent(completed());await tick();assert.equal(f.outputs().length,1);assert.equal(f.continues().length,1)
    const output=f.outputs()[0];assert.deepEqual(Object.keys(output).sort(),['event_id','item','type']);assert.equal(output.item.call_id,'call-one');assert.equal(output.item.type,'function_call_output');assert.equal(JSON.parse(output.item.output).saved,false)
    assert.deepEqual(Object.keys(f.continues()[0]).sort(),['event_id','type']);assert.notEqual(output.event_id,f.continues()[0].event_id);assert.equal(f.errors.length,0)
  })
  await check('multiple asynchronous calls settle out of order before every output and one continuation',async()=>{
    const resolves=new Map(),f=fixture(item=>new Promise(resolve=>resolves.set(item.call_id,resolve)))
    f.api.handleEvent(created());f.api.handleEvent(done('first'));f.api.handleEvent(done('second'));f.api.handleEvent(completed());await tick()
    resolves.get('second')({ok:true,saved:false,message:'Second actual read'});await tick();assert.equal(f.sent.length,0)
    resolves.get('first')({ok:true,saved:false,message:'First actual read'});await tick()
    assert.deepEqual(f.sent.map(e=>e.type),['response.item.create','response.item.create','response.create']);assert.deepEqual(f.outputs().map(e=>e.item.call_id),['first','second']);assert.equal(f.calls.length,2)
  })
  await check('response completed output array is empty and cannot erase granular pending calls',async()=>{
    let finish;const f=fixture(()=>new Promise(resolve=>{finish=resolve}));f.api.handleEvent(created());f.api.handleEvent(done());f.api.handleEvent(completed());await tick();assert.equal(f.sent.length,0)
    finish({ok:true,saved:true,message:'Verified receipt'});await tick();assert.equal(f.outputs().length,1);assert.equal(f.continues().length,1)
  })
  await check('duplicate item and lifecycle delivery never repeats app effects, output or continuation',async()=>{
    const f=fixture();f.api.handleEvent(created());f.api.handleEvent(done());f.api.handleEvent(done());await tick();f.api.handleEvent(completed());f.api.handleEvent(completed());f.api.handleEvent(done());await tick()
    assert.equal(f.calls.length,1);assert.equal(f.outputs().length,1);assert.equal(f.continues().length,1);assert.equal(f.errors.length,0)
  })
  await check('uncorrelated call waits for its real response lifecycle before app execution',async()=>{
    const f=fixture();f.api.handleEvent(done());await tick();assert.equal(f.calls.length,0);assert.equal(f.sent.length,0)
    f.api.handleEvent(created());await tick();assert.equal(f.calls.length,1);f.api.handleEvent(completed());await tick();assert.equal(f.continues().length,1)
  })
  await check('delegation metadata supplies response identity before nested created and interleaved calls',async()=>{
    let second;const f=fixture(item=>item.call_id==='second'?new Promise(resolve=>{second=resolve}):{ok:true,saved:false})
    f.api.handleEvent({type:'session.delegation.created',delegation:{target:'responses',id:'delegation-one',response_id:'response-one'}})
    f.api.handleEvent(done('first'));f.api.handleEvent(created('response-two','delegation-two'));f.api.handleEvent(done('second','delegation-two'))
    f.api.handleEvent(completed());f.api.handleEvent(completed('response-two','delegation-two'));await tick();assert.equal(f.sent.length,0)
    second({ok:true,saved:false});await tick();assert.equal(f.outputs().length,2);assert.equal(f.continues().length,1,'Selector-free continuation follows all known pending results')
  })
  await check('future response uses a new continuation while old completed lifecycle remains inert',async()=>{
    const f=fixture();for(const [id,callId]of[['response-one','first'],['response-two','second']]){f.api.handleEvent(created(id));f.api.handleEvent(done(callId));f.api.handleEvent(completed(id));await tick()}
    f.api.handleEvent(done('first'));f.api.handleEvent(completed());await tick();assert.equal(f.calls.length,2);assert.equal(f.outputs().length,2);assert.equal(f.continues().length,2);assert.equal(f.errors.length,0)
  })
  await check('app errors and unsupported undefined results return truthful failed output once',async()=>{
    for(const execute of [()=>{throw Error('Synthetic private failure')},()=>undefined,()=>Promise.reject(Error('Synthetic rejection'))]){
      const f=fixture(execute);f.api.handleEvent(created());f.api.handleEvent(done());f.api.handleEvent(completed());await tick()
      const output=JSON.parse(f.outputs()[0].item.output);assert.equal(output.saved,false);assert.equal(output.safeToClaimSaved,false);assert(!output.message.includes('Synthetic'));assert.equal(f.continues().length,1)
    }
  })
  await check('End account abort and late callbacks cannot send outputs or restart the backend',async()=>{
    for(const stop of [f=>f.api.stop(),f=>f.current(false)]){let finish;const f=fixture(()=>new Promise(resolve=>{finish=resolve}));f.api.handleEvent(created());f.api.handleEvent(done());f.api.handleEvent(completed());await tick();stop(f);finish({saved:true});await tick();f.api.handleEvent(done('late'));assert.equal(f.sent.length,0);assert.equal(f.calls.length,1)}
  })
  await check('failed transport never continues or automatically retries an app action',async()=>{
    for(const send of [()=>false,()=>{throw Error('Synthetic channel full')}]){const f=fixture(undefined,send);f.api.handleEvent(created());f.api.handleEvent(done());f.api.handleEvent(completed());await tick();assert.equal(f.calls.length,1);assert.equal(f.continues().length,0);assert.equal(f.errors.length,1);f.api.handleEvent(completed());await tick();assert.equal(f.calls.length,1)}
  })
  await check('failed backend prevents pending app invocation and continuation without false save claims',async()=>{
    const f=fixture();f.api.handleEvent(created());f.api.handleEvent(done());f.api.handleEvent(envelope({type:'response.failed',response:{id:'response-one'}}));await tick();assert.equal(f.calls.length,0);assert.equal(f.sent.length,0)
  })
  await check('reused call identity across responses refuses without a second app effect',async()=>{
    const f=fixture();f.api.handleEvent(created());f.api.handleEvent(done());f.api.handleEvent(completed());await tick();f.api.handleEvent(created('response-two'));const changed=done();changed.event.item.arguments='{"different":true}';f.api.handleEvent(changed);await tick();assert.equal(f.calls.length,1);assert.equal(f.errors.length,1);assert.equal(f.continues().length,1)
  })
  console.log(`Live tool turns: ${groups} actual-source offline groups passed. No provider, app action or credits.`)
}
if(require.main===module)main().catch(error=>{console.error(error.stack||error.message);process.exitCode=1})
module.exports={main}
