import assert from 'node:assert/strict'
import fs from 'node:fs'
import { foodAnalysisPollUrl, requestFoodAnalysis } from '../native/src/lib/foodAnalysisRequest'

const oldFetch = globalThis.fetch
const oldTimeout = globalThis.setTimeout
const jobId = '2d458ba1-e668-4025-9f5b-4a9d9f08e101'
const pending = () => new Response(JSON.stringify({status:'pending',jobId,pollUrl:'https://untrusted.invalid/steal',retryAfterMs:1500}),{status:202})
const fixture = {success:true,items:[{name:'Egg',calories:224,fiber_g:0,sugar_g:null}],total:{calories:224,fiber_g:0,sugar_g:null}}
let calls: {url:string,init:RequestInit}[] = []
let replies: (Response | Error)[] = []
// Test the real helper with controlled responses and no network/credentials.
globalThis.setTimeout = ((fn: (...args:any[])=>void) => oldTimeout(fn,0)) as any
globalThis.fetch = (async (url:any,init:RequestInit={}) => { calls.push({url:String(url),init}); const reply=replies.shift(); if(reply instanceof Error) throw reply; assert.ok(reply); return reply! }) as typeof fetch
async function run() {
  assert.equal(foodAnalysisPollUrl('/api/analyze-food',jobId),`/api/analyze-food/jobs/${jobId}`)
  assert.equal(foodAnalysisPollUrl('https://helfi.ai/api/analyze-food',jobId),`https://helfi.ai/api/analyze-food/jobs/${jobId}`)
  for(const bad of ['https://attacker.invalid/path','../../credit/status','short',null]) assert.throws(()=>foodAnalysisPollUrl('/api/analyze-food',bad))
  const form=new FormData();form.append('image',new Blob(['test image']), 'photo.png')
  replies=[pending(),pending(),new Response(JSON.stringify(fixture),{status:200})]
  const result=await requestFoodAnalysis('https://helfi.ai/api/analyze-food',{method:'POST',body:form,credentials:'include',headers:{'x-native-token':'test-only-dummy'}})
  assert.deepEqual(await result.json(),fixture,'final cards/unknown/zero/result parser receives original data')
  assert.deepEqual(calls.map(c=>c.init.method),['POST','GET','GET'])
  assert.ok(calls.slice(1).every(c=>c.url===`https://helfi.ai/api/analyze-food/jobs/${jobId}` && !c.init.body && new Headers(c.init.headers).get('x-native-token')==='test-only-dummy' && c.init.credentials==='include'))
  assert.equal(form.getAll('analysisRequestId').length,1)
  const requestId=form.get('analysisRequestId')
  calls=[];replies=[new Error('network lost initial response'),pending(),new Response(JSON.stringify(fixture))]
  await requestFoodAnalysis('https://helfi.ai/api/analyze-food',{method:'POST',body:form})
  assert.deepEqual(calls.map(c=>c.init.method),['POST','POST','GET'])
  assert.equal(calls[0].init.body,calls[1].init.body)
  assert.equal(form.get('analysisRequestId'),requestId)
  assert.equal(form.getAll('analysisRequestId').length,1,'retry must not create a second analysis identity')
  const unavailable = () => new Response(JSON.stringify({error:'Temporary check failure',code:'food_job_check_unavailable',jobId}),{status:503})
  calls=[];replies=[pending(),unavailable(),unavailable(),new Response(JSON.stringify(fixture))]
  assert.deepEqual(await (await requestFoodAnalysis('/api/analyze-food',{method:'POST',body:form})).json(),fixture)
  assert.deepEqual(calls.map(c=>c.init.method),['POST','GET','GET','GET'],'temporary check failures keep polling the same job')
  assert.ok(calls.slice(1).every(c=>c.url===`/api/analyze-food/jobs/${jobId}`))
  calls=[];replies=[unavailable(),pending(),new Response(JSON.stringify(fixture))]
  await requestFoodAnalysis('/api/analyze-food',{method:'POST',body:form})
  assert.deepEqual(calls.map(c=>c.init.method),['POST','POST','GET'])
  assert.equal(form.get('analysisRequestId'),requestId,'initial temporary check recovery preserves request identity')
  calls=[];replies=[pending(),new Response(JSON.stringify({error:'Unrelated service failure',code:'other'}),{status:503})]
  const unrelated=await requestFoodAnalysis('/api/analyze-food',{method:'POST',body:form})
  assert.equal(unrelated.status,503);assert.equal((await unrelated.json()).code,'other','other errors remain visible rather than becoming endless retries')
  const nativeBody={entries:[] as [string,string][],append(name:string,value:string){this.entries.push([name,value])}}
  calls=[];replies=[new Response(JSON.stringify({error:'Insufficient credits'}),{status:402})]
  const denied=await requestFoodAnalysis('https://helfi.ai/api/analyze-food',{method:'POST',body:nativeBody as any})
  assert.equal(denied.status,402)
  assert.equal(nativeBody.entries.filter(x=>x[0]==='analysisRequestId').length,1,'native FormData does not need get/set methods')
  calls=[];replies=[new Error('legacy text failure')]
  await assert.rejects(requestFoodAnalysis('/api/analyze-food',{method:'POST',body:JSON.stringify({textDescription:'apple'})}))
  assert.equal(calls.length,1,'text analysis does not gain automatic provider retries')
  calls=[];replies=[new Response(JSON.stringify({status:'pending',jobId:'../../secret'}),{status:202})]
  await assert.rejects(requestFoodAnalysis('/api/analyze-food',{method:'POST',body:new FormData()}))
  assert.equal(calls.length,1,'invalid job cannot forward authentication')
  const abort=new AbortController();abort.abort();calls=[]
  await assert.rejects(requestFoodAnalysis('/api/analyze-food',{method:'POST',body:new FormData(),signal:abort.signal}),{name:'AbortError'})
  assert.equal(calls.length,0)
  for(const [file,expected] of [['app/food/page.tsx',5],['native/src/screens/TrackCaloriesScreen.tsx',2],['native/src/screens/AddIngredientScreen.tsx',1]] as const){
    const source=fs.readFileSync(file,'utf8')
    assert.equal((source.match(/await requestFoodAnalysis\([^\n]*\/api\/analyze-food/g)||[]).length,expected,file)
    assert.equal((source.match(/await fetch\([^\n]*\/api\/analyze-food/g)||[]).length,0,file)
  }
  console.log('PASS: actual shared analysis transport waits for pending jobs, preserves final nutrients/auth/account path, retains retry identity, rejects unsafe jobs, preserves legacy errors and supports native FormData; all8 callers integrated. No network or credentials.')
}
run().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>{globalThis.fetch=oldFetch;globalThis.setTimeout=oldTimeout})
