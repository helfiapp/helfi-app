#!/usr/bin/env node
'use strict'
// Actual reviewed report helper, normal PDF POST and confirm/receipt source.
// Synthetic identities/clock/storage/HMAC only; no app import, provider, network,
// credential, PDF generation, account write or actual database access.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto')
const fixtureSource=fs.readFileSync(path.join(__dirname,'voice-save-integrity-check.cjs'),'utf8').replace(/^#!.*\n/,'')
const boundary=fixtureSource.indexOf('async function run() {');assert(boundary>0)
const fixture=new Function('require','__dirname',`${fixtureSource.slice(0,boundary)}\nreturn {harness,tokens,AuditDate,load}`)(require,__dirname)
class NextRequest extends Request {}
const owner='synthetic-user',now=Date.parse('2026-10-15T01:00:00Z'),plain=v=>JSON.parse(JSON.stringify(v))
const response=(body,options)=>new Response(JSON.stringify(body),{status:options?.status||200,headers:{'content-type':'application/json'}})
function setup({requestOrigin='https://helfi.ai',siteUrl='https://helfi.ai',siteEnvironment,extraHeaders={}}={}){
  fixture.AuditDate.setNow(now)
  let account={id:owner},posts=0,authSeen,mode='ok',postOriginSeen;const diagnostics=[]
  const reports=[{id:'older-ready',userId:owner,status:'READY',periodStart:'2026-10-01',periodEnd:'2026-10-07',report:{summary:'Older synthetic facts'}},
    {id:'latest-ready',userId:owner,status:'READY',periodStart:'2026-10-08',periodEnd:'2026-10-14',report:{summary:'Exact saved synthetic facts'},dataSummary:{count:4}},
    {id:'latest-locked',userId:owner,status:'LOCKED',periodStart:'2026-10-09',periodEnd:'2026-10-15'},
    {id:'foreign',userId:'another-owner',status:'READY',periodStart:'2026-10-09',periodEnd:'2026-10-15'}]
  const byId=async(user,id)=>reports.find(row=>row.userId===user&&row.id===id)||null
  const authenticate=async()=>account
  const actualSiteUrl=siteEnvironment?fixture.load('lib/site-url.ts',{URL,process:{env:{...siteEnvironment}}}).getSiteUrl:null
  const pdf=fixture.load('app/api/reports/weekly/pdf/route.ts',{Headers,URL,createHmac:crypto.createHmac,timingSafeEqual:crypto.timingSafeEqual,getWeeklyReportRequestUser:authenticate,getWeeklyReportById:byId,NextResponse:{json:response},process:{env:{AUTH_SECRET:'synthetic-pdf-link-secret'}}})
  const helper=fixture.load('lib/native-voice-report-actions.ts',{Headers,URL,NextRequest,
    getSiteUrl:actualSiteUrl||(()=>siteUrl),console:{log(){},warn(){},error(){},info:(...args)=>diagnostics.push(plain(args))},
    getWeeklyReportRequestUser:authenticate,getWeeklyReportById:byId,getWeeklyReportByPeriod:async(user,start,end)=>reports.find(row=>row.userId===user&&row.periodStart===start&&row.periodEnd===end)||null,listWeeklyReports:async(user,limit,status)=>{assert.equal(limit,50);assert.equal(status,'READY');return reports.filter(row=>row.userId===user&&row.status===status)},
    signNativeVoiceDraft:fixture.tokens.signNativeVoiceDraft,verifyNativeVoiceDraft:fixture.tokens.verifyNativeVoiceDraft,
    require:name=>{assert.equal(name,'@/app/api/reports/weekly/pdf/route');return{POST:async request=>{posts++;postOriginSeen=new URL(request.url).origin;authSeen=request.headers.get('authorization');assert.deepEqual(await request.json(),{reportId:'latest-ready'});if(mode==='error')return response({error:'PRIVATE synthetic underlying failure'},{status:500});return pdf.POST(new NextRequest(request.url,{method:'POST',headers:request.headers,body:JSON.stringify({reportId:'latest-ready'})}))}}},
  })
  const headers={authorization:'Bearer synthetic-original','content-type':'application/json','x-helfi-voice-capabilities':'report-pdf-v1,additional-actions-v1',...extraHeaders}
  const request=(caps=true,signal)=>new NextRequest(requestOrigin+'/api/native/voice-assistant',{method:'POST',headers:{...headers,...(!caps?{'x-helfi-voice-capabilities':''}:{})},body:'{}',...(signal?{signal}:{})})
  const prepare=(values={},transcript='Open my latest weekly report as PDF',caps=true)=>helper.prepareVoiceReportPdfAction(request(caps),owner,{action:'reports.weekly.export_pdf',values},transcript,'2026-10-15')
  const execute=draft=>helper.executeVoiceReportPdfAction(request(),owner,draft,{receiptClaimed:true,actionId:'synthetic-pdf-action-id'})
  const h=fixture.harness()
  Object.assign(h.route,{Headers,URL,NextRequest,executeVoiceReportPdfAction:helper.executeVoiceReportPdfAction,refreshVoiceReportPdfAccess:helper.refreshVoiceReportPdfAccess})
  const confirm=(draft,caps=true)=>h.route.POST(new NextRequest(requestOrigin+'/api/native/voice-assistant/confirm',{method:'POST',headers:{...headers,...(!caps?{'x-helfi-voice-capabilities':''}:{})},body:JSON.stringify({draft})}))
  return{helper,pdf,h,reports,request,prepare,execute,confirm,diagnostics,posts:()=>posts,auth:()=>authSeen,postOrigin:()=>postOriginSeen,setAccount:value=>{account=value},setMode:value=>{mode=value}}
}
let count=0
async function check(name,run){await run();count++;console.log('PASS '+name)}
async function run(){
  await check('actual report SQL filters owned READY rows before limit while default lists retain all statuses',async()=>{
    const rows=Array.from({length:170},(_,index)=>({id:`locked-${index}`,userId:owner,status:index%2?'RUNNING':'LOCKED',periodStart:new Date(now-index*7*86400000).toISOString().slice(0,10),periodEnd:new Date(now-index*7*86400000+6*86400000).toISOString().slice(0,10),createdAt:new Date(now+index*1000).toISOString(),updatedAt:new Date(now).toISOString()}))
    rows.push({id:'owned-ready-beyond-limit',userId:owner,status:'READY',periodStart:'2026-10-01',periodEnd:'2026-10-07',createdAt:new Date(now-1000).toISOString(),updatedAt:new Date(now).toISOString()})
    rows.push({...rows.at(-1),id:'foreign-ready',userId:'another-owner',createdAt:new Date(now+999999).toISOString()})
    const calls=[],weekly=fixture.load('lib/weekly-health-report.ts',{prisma:{$queryRawUnsafe:async(sql,...params)=>{
      calls.push({sql,params});assert.match(sql,/WHERE userId = \$1/);assert.equal(params[0],owner)
      const beforeLimit=rows.filter(row=>row.userId===params[0]&&(!sql.includes('AND status = $3')||row.status===params[2]))
      return beforeLimit.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,params[1])
    }}})
    weekly.ensureWeeklyReportTables=async()=>{} // schema/bootstrap is outside this read-only query test
    const ready=await weekly.listWeeklyReports(owner,50,'READY')
    assert.equal(ready.length,1);assert.equal(ready[0].id,'owned-ready-beyond-limit');assert.equal(ready[0].userId,owner)
    assert.match(calls[0].sql,/AND status = \$3[\s\S]*LIMIT \$2/);assert.deepEqual(calls[0].params,[owner,150,'READY'])
    const normal=await weekly.listWeeklyReports(owner,50)
    assert.equal(normal.length,50);assert(normal.every(row=>row.status!=='READY'&&row.userId===owner));assert(!calls[1].sql.includes('AND status'));assert.deepEqual(calls[1].params,[owner,150])
  })
  await check('actual POST routes natural PDF requests through reviewed report adapter before navigation and old clients fail closed',async()=>{
    const f=setup(),matrixSource=fs.readFileSync(path.join(__dirname,'voice-action-matrix-check.cjs'),'utf8').replace(/^#!.*\n/,'')
    const at=matrixSource.indexOf('async function run() {');assert(at>0)
    const ctx=new Function('require','__dirname',`${matrixSource.slice(0,at)}\nreturn ctx`)(require,__dirname)
    let understanding=0
    ctx.getOpenAIClient=()=>({syntheticBoundary:true})
    ctx.runJsonCommandModel=async()=>{understanding++;return{parsed:{action:'report_action',reportAction:{action:'reports.weekly.export_pdf',values:{}}},wrapped:{costCents:0,promptTokens:0,completionTokens:0},usedModel:'synthetic-no-provider-boundary'}}
    ctx.prepareVoiceReportAction=f.helper.prepareVoiceReportAction
    for(const text of ['Open a PDF of my latest report','Export my latest report as PDF','Download my weekly report PDF','Save my latest report as PDF']){
      assert.equal(ctx.needsReviewedAppControl(text,null),true)
      const request=new NextRequest('https://helfi.invalid/api/native/voice-assistant',{method:'POST',headers:{'content-type':'application/json','x-helfi-voice-capabilities':'report-pdf-v1'},body:JSON.stringify({transcript:text,localDate:'2026-10-15',tzOffsetMin:0,aiConsentGranted:true,voiceReply:false})})
      const result=await ctx.POST(request);assert.equal(result.status,200);assert.equal(result.body.draft.action,'report_action');assert.equal(result.body.draft.canConfirm,true,JSON.stringify(result.body));assert.equal(result.body.draft.reportAction.action,'reports.weekly.export_pdf');assert.equal(result.body.draft.appTarget,undefined)
    }
    assert.equal(understanding,4);assert.equal(f.posts(),0)
    const old=await ctx.POST(new NextRequest('https://helfi.invalid/api/native/voice-assistant',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({transcript:'Open my weekly report PDF',localDate:'2026-10-15',aiConsentGranted:true,voiceReply:false})}))
    assert.equal(old.body.draft.action,'report_action');assert.equal(old.body.draft.canConfirm,false);assert.match(old.body.draft.confirmationMessage,/update.*app/);assert.equal(f.posts(),0)
  })
  await check('old50/no capability and wrong accounts cannot prepare or execute PDF',async()=>{const f=setup();await assert.rejects(()=>f.prepare({},undefined,false),/update.*app/);f.setAccount(null);await assert.rejects(()=>f.prepare(),/same account/);f.setAccount({id:'another-owner'});await assert.rejects(()=>f.prepare(),/same account/);assert.equal(f.posts(),0)})
  await check('latest READY selection is deterministic, owned and reviewed without generating a link',async()=>{const f=setup(),draft=await f.prepare();assert.equal(draft.reportAction.reportId,'latest-ready');assert.equal(draft.reportAction.reportStatus,'READY');assert.equal(draft.reportAction.periodStart,'2026-10-08');assert.equal(draft.canConfirm,true);assert.equal(draft.autoSave,false);assert(fixture.tokens.verifyNativeVoiceDraft(owner,draft));assert.equal(draft.confirmationMessage,'Open the PDF for your ready weekly report from 2026-10-08 to 2026-10-14?');assert.equal(f.posts(),0)})
  await check('exact periods/IDs reject foreign, locked, running, missing, conflicting or arbitrary inputs',async()=>{const f=setup();for(const values of [{reportId:'foreign'},{reportId:'latest-locked'},{reportId:'missing'},{periodStart:'2026-02-30',periodEnd:'2026-03-01'},{periodStart:'2026-10-08'},{reportId:'latest-ready',periodStart:'2026-10-01',periodEnd:'2026-10-07'},{url:'https://evil.invalid'},{userId:'another-owner'}])await assert.rejects(()=>f.prepare(values));assert.equal((await f.prepare({periodStart:'2026-10-08',periodEnd:'2026-10-14'})).reportAction.reportId,'latest-ready');f.reports[1].status='RUNNING';await assert.rejects(()=>f.prepare({reportId:'latest-ready'}));assert.equal(f.posts(),0)})
  await check('negated/questions and altered review/source content cannot create a PDF link',async()=>{const f=setup();for(const text of ['How do I download my report PDF?','Do not export my report PDF','Show my report'])await assert.rejects(()=>f.prepare({},text));const draft=await f.prepare();await assert.rejects(()=>f.execute({...draft,summary:'tampered'}),/review/);f.reports[1].report.summary='Changed after review';await assert.rejects(()=>f.execute(draft),/changed/);assert.equal(f.posts(),0)})
  await check('actual normal authenticated PDF POST creates bounded temporary link outside durable result',async()=>{const f=setup(),draft=await f.prepare(),exported=await f.execute(draft);assert.equal(f.posts(),1);assert.equal(f.auth(),'Bearer synthetic-original');assert.equal(exported.result.status,'pdf_ready');assert.equal(exported.result.generated,false);assert.equal(exported.result.opened,false);assert.equal(exported.result.downloaded,false);assert(!JSON.stringify(exported.result).includes('https://'));assert(!JSON.stringify(exported.result).includes('accessToken'));const access=exported.reportPdfAccess,url=new URL(access.url);assert.equal(url.origin,'https://helfi.ai');assert.equal(url.pathname,'/api/reports/weekly/pdf');assert.equal(url.searchParams.get('reportId'),'latest-ready');assert.equal(access.reportId,draft.reportAction.reportId);assert.equal(access.actionId,exported.result.actionId);assert.equal(access.expiresAt,fixture.AuditDate.now()+60000)})
  await check('actual normal PDF runtime-host link reproduces native refusal; trusted public construction passes the unchanged native boundary',async()=>{
    const f=setup({requestOrigin:'https://synthetic-runtime.amplifyapp.com'}),draft=await f.prepare(),actionId=crypto.createHash('sha256').update(draft.reviewToken).digest('base64url')
    const legacy=await(await f.pdf.POST(new NextRequest('https://synthetic-runtime.amplifyapp.com/api/reports/weekly/pdf',{method:'POST',headers:f.request().headers,body:JSON.stringify({reportId:'latest-ready'})}))).json()
    assert.equal(new URL(legacy.url).origin,'https://synthetic-runtime.amplifyapp.com')
    const exported=await f.helper.executeVoiceReportPdfAction(f.request(),owner,draft,{receiptClaimed:true,actionId})
    assert.equal(f.postOrigin(),'https://helfi.ai');assert.equal(new URL(exported.reportPdfAccess.url).origin,'https://helfi.ai');assert.equal(f.auth(),'Bearer synthetic-original')
    const native=fixture.load('native/src/voice/reportPdfActions.ts',{URL,nativeVoiceReviewTokenDigest:token=>crypto.createHash('sha256').update(token).digest('base64url')})
    let opened=0;const io={apiBaseUrl:'https://helfi.ai',accountId:owner,isCurrent:()=>true,now:()=>fixture.AuditDate.now(),openUrl:async()=>{opened++}}
    await assert.rejects(()=>native.openReviewedNativeReportPdf({success:true,...exported,reportPdfAccess:{...exported.reportPdfAccess,url:legacy.url}},draft,io),/The report PDF link was not verified/);assert.equal(opened,0)
    const result=await native.openReviewedNativeReportPdf({success:true,...exported},draft,io);assert.equal(result.result.status,'pdf_open_requested');assert.equal(opened,1)
    assert.deepEqual(f.diagnostics,[['[native voice PDF]',{event:'report_pdf_link_validated',requestOriginClass:'aws_runtime',linkOriginClass:'canonical_public',trustedPublicOriginMatch:true,sameRequestOrigin:false,requestProtocol:'https',linkProtocol:'https',pathMatch:true,queryKeysValid:true,queryCount:2}]])
    const logged=JSON.stringify(f.diagnostics);for(const forbidden of [owner,draft.reportAction.reportId,legacy.url,exported.reportPdfAccess.url,'accessToken','sourceVersion','reportId','userId'])assert(!logged.includes(forbidden))
  })
  await check('only configured stable HTTPS public origins select link destination; Host/forwarded headers cannot redirect it',async()=>{
    for(const [siteUrl,expected]of [['https://helfi.ai','https://helfi.ai'],['https://www.helfi.ai','https://helfi.ai'],['https://stg.helfi.ai','https://stg.helfi.ai']]){
      const f=setup({requestOrigin:'http://synthetic-internal.invalid:3000',siteUrl,extraHeaders:{host:'attacker.invalid','x-forwarded-host':'attacker.invalid','x-forwarded-proto':'http'}}),draft=await f.prepare(),result=await f.execute(draft)
      assert.equal(f.postOrigin(),expected);assert.equal(new URL(result.reportPdfAccess.url).origin,expected);assert.equal(f.diagnostics[0][1].requestProtocol,'http');assert.equal(f.diagnostics[0][1].sameRequestOrigin,false);assert.equal(f.auth(),'Bearer synthetic-original')
    }
    for(const siteUrl of ['http://helfi.ai','https://attacker.invalid','https://helfi.ai.attacker.invalid','https://helfi.ai:8443','https://user:password@helfi.ai','https://helfi.ai/other','https://helfi.ai?redirect=bad','https://helfi.ai#bad','not a URL','https://master.other.amplifyapp.com','https://other.d2n4u4zm85ooe.amplifyapp.com','http://master.d2n4u4zm85ooe.amplifyapp.com','https://master.d2n4u4zm85ooe.amplifyapp.com:8443','https://user:password@master.d2n4u4zm85ooe.amplifyapp.com','https://master.d2n4u4zm85ooe.amplifyapp.com.attacker.invalid']){
      const f=setup({siteUrl}),draft=await f.prepare();await assert.rejects(()=>f.execute(draft),error=>/secure public PDF address/.test(error.message)&&!error.message.includes(siteUrl));assert.equal(f.posts(),0);assert.equal(f.diagnostics.length,0)
    }
  })
  await check('actual public-site helper maps only the exact configured production AWS default to canonical native PDF access',async()=>{
    const production='https://master.d2n4u4zm85ooe.amplifyapp.com',keys=['NEXT_PUBLIC_APP_URL','NEXT_PUBLIC_SITE_URL','NEXTAUTH_URL']
    const environments=[Object.fromEntries(keys.map(key=>[key,production])),...keys.map(key=>({[key]:production}))]
    for(const siteEnvironment of environments){
      const f=setup({requestOrigin:production,siteEnvironment}),draft=await f.prepare(),actionId=crypto.createHash('sha256').update(draft.reviewToken).digest('base64url')
      const exported=await f.helper.executeVoiceReportPdfAction(f.request(),owner,draft,{receiptClaimed:true,actionId});assert.equal(f.postOrigin(),'https://helfi.ai');assert.equal(new URL(exported.reportPdfAccess.url).origin,'https://helfi.ai');assert.equal(f.auth(),'Bearer synthetic-original')
      const native=fixture.load('native/src/voice/reportPdfActions.ts',{URL,nativeVoiceReviewTokenDigest:token=>crypto.createHash('sha256').update(token).digest('base64url')});let opened=0
      const result=await native.openReviewedNativeReportPdf({success:true,...exported},draft,{apiBaseUrl:'https://helfi.ai',accountId:owner,isCurrent:()=>true,now:()=>fixture.AuditDate.now(),openUrl:async()=>{opened++}});assert.equal(result.result.status,'pdf_open_requested');assert.equal(opened,1);assert.equal(f.diagnostics[0][1].linkOriginClass,'canonical_public');assert.equal(f.diagnostics[0][1].requestOriginClass,'aws_runtime')
    }
    for(const value of ['https://master.other.amplifyapp.com','https://other.d2n4u4zm85ooe.amplifyapp.com','http://master.d2n4u4zm85ooe.amplifyapp.com','https://master.d2n4u4zm85ooe.amplifyapp.com:8443','https://user:password@master.d2n4u4zm85ooe.amplifyapp.com']){
      const f=setup({siteEnvironment:Object.fromEntries(keys.map(key=>[key,value]))}),draft=await f.prepare();await assert.rejects(()=>f.execute(draft),/secure public PDF address/);assert.equal(f.posts(),0)
    }
  })
  await check('untrusted returned runtime URL is rejected rather than rebased even when same as incoming runtime request',async()=>{
    const f=setup({requestOrigin:'https://synthetic-runtime.amplifyapp.com'}),draft=await f.prepare(),link=await(await f.pdf.POST(new NextRequest('https://synthetic-runtime.amplifyapp.com/api/reports/weekly/pdf',{method:'POST',headers:f.request().headers,body:JSON.stringify({reportId:'latest-ready'})}))).json()
    const io={authenticate:async()=>({id:owner}),byId:async()=>f.reports[1],byPeriod:async()=>null,list:async()=>[],link:async()=>link}
    await assert.rejects(()=>f.helper.executeVoiceReportPdfAction(f.request(),owner,draft,{receiptClaimed:true,actionId:'synthetic'},io),/verify.*link/);assert.equal(f.diagnostics.length,0)
  })
  await check('actual signed confirmation stores URL-free receipt and replay freshly regenerates after review expiry',async()=>{const f=setup(),draft=await f.prepare(),first=await f.confirm(draft);assert.equal(first.status,200);assert(first.body.reportPdfAccess.url);const receipt=await f.h.route.completedReviewResult(owner,draft);assert.equal(receipt.action,'reports.weekly.export_pdf');assert(!JSON.stringify(receipt).includes('url'));assert(!JSON.stringify(receipt).includes('accessToken'));fixture.AuditDate.setNow(now+31*60*1000);const replay=await f.confirm({...draft,reportAction:{reportId:'foreign'},summary:'tampered ignored on completed receipt'});assert.equal(replay.status,200);assert.equal(replay.body.idempotentReplay,true);assert.deepEqual(plain(replay.body.result),plain(first.body.result));assert.notEqual(replay.body.reportPdfAccess.url,first.body.reportPdfAccess.url);assert.equal(replay.body.reportPdfAccess.reportId,'latest-ready');assert.equal(f.posts(),2)})
  await check('replay rechecks READY/source/current account and capability instead of returning an expired URL',async()=>{const f=setup(),draft=await f.prepare();assert.equal((await f.confirm(draft)).status,200);assert.equal((await f.confirm(draft,false)).status,500);f.reports[1].status='LOCKED';assert.equal((await f.confirm(draft)).status,500);f.reports[1].status='READY';f.setAccount({id:'another-owner'});assert.equal((await f.confirm(draft)).status,500);assert.equal(f.posts(),1)})
  await check('failed link preparation never completes a receipt or retries an uncertain pending claim',async()=>{const f=setup(),draft=await f.prepare();f.setMode('error');const first=await f.confirm(draft);assert.equal(first.status,500);assert(!JSON.stringify(first.body).includes('PRIVATE'));assert.equal(await f.h.route.completedReviewResult(owner,draft),null);const replay=await f.confirm(draft);assert.equal(replay.status,409);assert.equal(f.posts(),1)})
  await check('cross-origin, stale, future, wrong-owner/path/report and duplicate-query links are refused without leaking URLs',async()=>{
    const f=setup(),draft=await f.prepare(),valid=await f.execute(draft),base=new URL(valid.reportPdfAccess.url)
    const mutations=[url=>{url.hostname='evil.invalid'},url=>{url.protocol='http:'},url=>{url.pathname='/api/other'},url=>{url.searchParams.set('reportId','foreign')},url=>{url.searchParams.append('reportId','latest-ready')},url=>{url.searchParams.set('extra','PRIVATE')}]
    for(const expiresAt of [now-1,now+62000])mutations.push(url=>{url.searchParams.set('accessToken',Buffer.from(JSON.stringify({userId:owner,reportId:'latest-ready',expiresAt})).toString('base64url')+'.'+'A'.repeat(43))})
    mutations.push(url=>{url.searchParams.set('accessToken',Buffer.from(JSON.stringify({userId:'foreign',reportId:'latest-ready',expiresAt:now+60000})).toString('base64url')+'.'+'A'.repeat(43))})
    for(const change of mutations){const url=new URL(base);change(url);const io={authenticate:async()=>({id:owner}),byId:async()=>f.reports[1],byPeriod:async()=>null,list:async()=>[],link:async()=>({url:url.toString()})};await assert.rejects(()=>f.helper.executeVoiceReportPdfAction(f.request(),owner,draft,{receiptClaimed:true,actionId:'synthetic'},io),error=>!error.message.includes('PRIVATE')&&!error.message.includes('https://')&&/verify.*link/.test(error.message))}
  })
  await check('cancelled requests never create a link',async()=>{const f=setup(),controller=new AbortController();controller.abort();await assert.rejects(()=>f.helper.prepareVoiceReportPdfAction(f.request(true,controller.signal),owner,{action:'reports.weekly.export_pdf',values:{}},'Open PDF report','2026-10-15'),/stopped/);assert.equal(f.posts(),0)})
  await check('source changes or cancellation during link creation cannot return a stale ready receipt',async()=>{
    const f=setup(),draft=await f.prepare(),valid=await f.execute(draft),controller=new AbortController()
    const io={authenticate:async()=>({id:owner}),byId:async()=>f.reports[1],byPeriod:async()=>null,list:async()=>[],link:async()=>{f.reports[1].report.summary='changed during creation';return{url:valid.reportPdfAccess.url}}}
    await assert.rejects(()=>f.helper.executeVoiceReportPdfAction(f.request(),owner,draft,{receiptClaimed:true,actionId:'synthetic-race'},io),/changed while/)
    f.reports[1].report.summary='Exact saved synthetic facts';io.link=async()=>{controller.abort();return{url:valid.reportPdfAccess.url}}
    await assert.rejects(()=>f.helper.executeVoiceReportPdfAction(f.request(true,controller.signal),owner,draft,{receiptClaimed:true,actionId:'synthetic-cancel'},io),/stopped/)
  })
  console.log(`Voice report PDF: ${count} actual-source offline groups passed. Normal PDF POST only; no file opened/saved or real account/provider/database access.`)
}
run().catch(error=>{console.error(error);process.exitCode=1})
