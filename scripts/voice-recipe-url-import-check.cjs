#!/usr/bin/env node
'use strict'
// Actual URL guard, pinned transport and signed import adapter. All DNS, HTTP,
// normal importer and account consent are synthetic; no provider/key access.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),{EventEmitter}=require('node:events')
const root=path.resolve(__dirname,'..')
function load(relative,dependencies){const module={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,relative),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText,{module,exports:module.exports,URL,Headers,Buffer,Date,setTimeout,clearTimeout,process:{env:{NODE_ENV:'test',AUTH_SECRET:'synthetic-review-secret'}},require:name=>{if(Object.hasOwn(dependencies,name))return dependencies[name];throw Error('Forbidden dependency '+name)}},{filename:relative});return module.exports}
let dnsCalls=[],transportCalls=[]
const transport={request:(url,options,callback)=>{
 const req=new EventEmitter();req.destroy=error=>{req.emit('error',error);req.emit('close')};req.end=()=>{
  options.lookup(url.hostname,{},(error,address,family)=>{assert.equal(error,null);transportCalls.push({url:String(url),address,family,options});const res=new EventEmitter();res.statusCode=200;res.headers={};res.destroy=()=>{};callback(res);res.emit('data',Buffer.from('recipe body'));res.emit('end');req.emit('close')})
 };return req
}}
const guard=load('lib/public-recipe-url.ts',{'node:dns/promises':{lookup:async host=>{dnsCalls.push(host);return[{address:'93.184.216.34',family:4}]}},'node:net':require('node:net'),'node:http':transport,'node:https':transport})
const review=load('lib/native-voice-review-token.ts',{crypto:require('node:crypto')})
const pricing=load('lib/recipe-import-pricing.ts',{})
let consent=true,identity='synthetic-user',imports=0,importPayload,importHeaders
class Request{constructor(url,options){this.url=String(url);this.headers=options.headers;this.body=options.body;this.method=options.method}}
const recipe={title:'Source recipe',servings:4,ingredients:['200 g chicken'],steps:['Cook chicken thoroughly.'],sourceUrl:'https://recipes.example/meal'}
const adapter=load('lib/native-voice-recipe-url-import.ts',{'next/server':{NextRequest:Request},'@/lib/ai-consent':{hasAiSharingConsent:async()=>consent,getAiConsentRequestUserId:async()=>identity},'@/lib/public-recipe-url':guard,'@/lib/recipe-import-pricing':pricing,'@/lib/native-voice-review-token':review,'@/app/api/recipe-import/route':{POST:async request=>{imports++;importPayload=JSON.parse(request.body);importHeaders=request.headers;return{ok:true,json:async()=>({recipe,costCredits:10})}}}})
const request={url:'https://helfi.invalid/api/native/voice-assistant',headers:new Headers({authorization:'Bearer synthetic-original-auth'})}
let count=0
async function check(name,fn){dnsCalls=[];transportCalls=[];imports=0;consent=true;identity='synthetic-user';await fn();count++;console.log('PASS '+name)}
async function run(){
await check('private, encoded, local, special-use and credential-bearing URLs are refused',async()=>{
 for(const url of ['http://127.0.0.1/','http://2130706433/','http://0x7f000001/','http://169.254.169.254/','http://10.0.0.1/','http://localhost/','https://host.local/','http://[::1]/','http://[::ffff:127.0.0.1]/','https://user:pass@example.com/','file:///etc/passwd','https://example.com:3000/'])assert.throws(()=>guard.parsePublicRecipeUrl(url),undefined,url)
 for(const address of ['0.0.0.0','100.64.0.1','192.0.2.1','198.18.0.1','203.0.113.1','224.0.0.1','fc00::1','fe80::1','2001:db8::1','2002:7f00:1::1','3fff::1'])assert.equal(guard.isPublicRecipeAddress(address),false,address)
 assert.equal(guard.isPublicRecipeAddress('8.8.8.8'),true);assert.equal(guard.isPublicRecipeAddress('2001:4860:4860::8888'),true)
})
await check('all DNS answers must be public, and transport is pinned to verified address',async()=>{
 await assert.rejects(()=>guard.validatePublicRecipeUrl('https://example.com',{lookup:async()=>[{address:'8.8.8.8',family:4},{address:'127.0.0.1',family:4}]}),/safe public/)
 const response=await guard.fetchPublicRecipeUrl('https://example.com/recipe',{headers:{authorization:'secret-must-not-forward','user-agent':'synthetic-test'}})
 assert.equal(await response.text(),'recipe body');assert.equal(dnsCalls.length,1);assert.equal(transportCalls[0].address,'93.184.216.34');assert.equal(transportCalls[0].options.autoSelectFamily,false);assert.equal(transportCalls[0].options.headers.authorization,undefined);assert.equal(transportCalls[0].options.headers['accept-encoding'],'identity')
})
await check('each redirect is validated and private DNS after redirect is rejected',async()=>{
 const seen=[];const io={lookup:async host=>[{address:host==='private.example'?'10.0.0.1':'8.8.8.8',family:4}],request:async url=>{seen.push(url.hostname);return{status:302,location:'https://private.example/metadata',body:''}}}
 await assert.rejects(()=>guard.fetchPublicRecipeUrl('https://public.example/recipe',{},io),/safe public/);assert.deepEqual(seen,['public.example'])
 await assert.rejects(()=>guard.fetchPublicRecipeUrl('https://public.example',{}, {...io,request:async()=>({status:302,location:'/again',body:''})}),/too many/)
})
await check('body size and overall request wait are bounded',async()=>{
 const io={lookup:async()=>[{address:'8.8.8.8',family:4}],request:async()=>({status:200,body:'123456'})}
 await assert.rejects(()=>guard.fetchPublicRecipeUrl('https://public.example',{maxBytes:5},io),/too large/)
 await assert.rejects(()=>guard.fetchPublicRecipeUrl('https://public.example',{timeoutMs:5},{...io,request:()=>new Promise(()=>{})}),/too long/)
})
await check('prepare signs only one explicit URL, authenticates consent and announces exact10credits',async()=>{
 const d=await adapter.prepareVoiceRecipeUrlImport(request,identity,'Import https://recipes.example/meal',{localDate:'2026-10-17'})
 assert.equal(imports,0);assert.equal(d.canConfirm,true);assert.equal(d.recipeImport.costCredits,10);assert.match(d.confirmationMessage,/10 credits/);assert.equal(review.verifyNativeVoiceDraft(identity,d),true)
 await assert.rejects(()=>adapter.prepareVoiceRecipeUrlImport(request,identity,'Import a recipe',{localDate:'2026-10-17'}),/exactly one/)
 await assert.rejects(()=>adapter.prepareVoiceRecipeUrlImport(request,identity,'Import https://one.example https://two.example',{localDate:'2026-10-17'}),/exactly one/)
 await assert.rejects(()=>adapter.prepareVoiceRecipeUrlImport(request,identity,'Import https://recipes.example/meal',{localDate:'2026-10-17',url:'https://model-invented.example/'}),/options/)
 await assert.rejects(()=>adapter.prepareVoiceRecipeUrlImport(request,identity,'Import https://recipes.example/meal',{localDate:'2026-02-30'}),/valid recipe date/)
})
await check('execute uses normal importer with original auth and URL only, then reports imported-not-saved',async()=>{
 const d=await adapter.prepareVoiceRecipeUrlImport(request,identity,'Import https://recipes.example/meal',{localDate:'2026-10-17',destination:'library'})
 const r=await adapter.executeVoiceRecipeUrlImport(request,identity,d,{receiptClaimed:true,actionId:'synthetic-receipt'})
 assert.equal(imports,1);assert.deepEqual(importPayload,{url:'https://recipes.example/meal'});assert.equal(importHeaders.get('authorization'),'Bearer synthetic-original-auth')
 assert.equal(r.saved,false);assert.equal(r.status,'imported_not_saved');assert.equal(r.nextRecipeDraft.canConfirm,false);assert.equal(r.nextRecipeDraft.recipe.importDraft.servings,4);assert.equal(r.costCredits,10)
})
await check('tampered/stale/account-changed/unconsented import cannot invoke paid handler',async()=>{
 const d=await adapter.prepareVoiceRecipeUrlImport(request,identity,'Import https://recipes.example/meal',{localDate:'2026-10-17'})
 await assert.rejects(()=>adapter.executeVoiceRecipeUrlImport(request,identity,{...d,recipeImport:{...d.recipeImport,url:'https://other.example'}},{receiptClaimed:true,actionId:'test'}),/review/)
 await assert.rejects(()=>adapter.executeVoiceRecipeUrlImport(request,identity,d,{receiptClaimed:false,actionId:'test'}),/review/)
 const stale={...d,reviewIssuedAt:Date.now()-31*60*1000};stale.reviewToken=review.signNativeVoiceDraft(identity,stale)
 await assert.rejects(()=>adapter.executeVoiceRecipeUrlImport(request,identity,stale,{receiptClaimed:true,actionId:'test'}),/review/)
 identity='other-user';await assert.rejects(()=>adapter.executeVoiceRecipeUrlImport(request,'synthetic-user',d,{receiptClaimed:true,actionId:'test'}),/permission/);identity='synthetic-user'
 consent=false;await assert.rejects(()=>adapter.executeVoiceRecipeUrlImport(request,identity,d,{receiptClaimed:true,actionId:'test'}),/permission/);assert.equal(imports,0)
})
await check('missing imported yield or steps remain missing and never become a food save',async()=>{
 const d=await adapter.prepareVoiceRecipeUrlImport(request,identity,'Import https://recipes.example/meal',{localDate:'2026-10-17'})
 const original={servings:recipe.servings,steps:recipe.steps};recipe.servings=null;recipe.steps=[]
 const result=await adapter.executeVoiceRecipeUrlImport(request,identity,d,{receiptClaimed:true,actionId:'synthetic-partial'})
 assert.equal(result.saved,false);assert.equal(result.nextRecipeDraft.recipe.importDraft.servings,null);assert.equal(result.nextRecipeDraft.recipe.importDraft.steps.length,0);assert.equal(result.nextRecipeDraft.canConfirm,false)
 Object.assign(recipe,original)
})
await check('normal importer uses shared guarded direct/mirror fetch and normal consent gate',async()=>{
 const s=fs.readFileSync(path.join(root,'app/api/recipe-import/route.ts'),'utf8'),ast=ts.createSourceFile('recipe-import.ts',s,ts.ScriptTarget.Latest,true)
 let forbidden=0;function visit(n){if(ts.isCallExpression(n)&&n.expression.getText(ast)==='fetch')forbidden++;ts.forEachChild(n,visit)}visit(ast)
 assert.equal(forbidden,0);assert.match(s,/const consentResponse = await aiConsentRequiredResponse\(request\)/);assert.match(s,/fetchPublicRecipeUrl\(attemptUrl/);assert.match(s,/fetchPublicRecipeUrl\(mirrorUrl/)
})
console.log(`Voice recipe URL import: ${count} actual-source offline groups passed; synthetic DNS/HTTP/importer only. Receipt replay storage remains root integration.`)
}
run().catch(error=>{console.error(error);process.exitCode=1})
