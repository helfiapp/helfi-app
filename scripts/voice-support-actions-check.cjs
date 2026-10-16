#!/usr/bin/env node
'use strict'
// Real support action helper and existing authenticated support handlers, using
// synthetic records/transport/email stubs only. No real messages or providers.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),crypto=require('node:crypto')
const root=path.resolve(__dirname,'..'),copy=value=>JSON.parse(JSON.stringify(value)),user='synthetic-user'
function load(relative,deps){const module={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,relative),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText,{module,exports:module.exports,URL,Headers,Date,Buffer,process:{env:{NODE_ENV:'test',AUTH_SECRET:'synthetic-support-review-secret'}},require:name=>{if(Object.hasOwn(deps,name))return deps[name];throw Error('Forbidden dependency '+name)}},{filename:relative});return module.exports}
let tickets,sessionId,sequence,sends,posts
const matches=(row,where)=>Object.entries(where).every(([key,value])=>key==='OR'?value.some(branch=>matches(row,branch)):key==='status'&&value?.notIn?!value.notIn.includes(row.status):row[key]===value)
const decorate=row=>row?copy({...row,responses:row.responses||[]}):null
const prisma={user:{findUnique:async({where})=>({id:where.id||sessionId,email:`${sessionId}@example.invalid`,name:'Synthetic user'})},supportTicket:{
 findFirst:async({where})=>decorate(tickets.find(row=>matches(row,where))),findUnique:async({where})=>decorate(tickets.find(row=>row.id===where.id)),findMany:async({where})=>tickets.filter(row=>matches(row,where)).map(row=>({id:row.id,subject:row.subject,status:row.status,createdAt:row.createdAt,updatedAt:row.updatedAt})),
 create:async({data})=>{const row={id:`new-${++sequence}`,createdAt:'2026-10-17T00:00:00Z',updatedAt:'2026-10-17T00:00:00Z',responses:[],...data};tickets.push(row);return decorate(row)},
 update:async({where,data})=>{const row=tickets.find(row=>row.id===where.id);Object.assign(row,data);return decorate(row)},delete:async({where})=>{tickets=tickets.filter(row=>row.id!==where.id);return{id:where.id}}},
 ticketResponse:{create:async({data})=>{const response={id:`response-${++sequence}`,createdAt:`2026-10-17T00:00:${sequence}Z`,...data};tickets.find(row=>row.id===data.ticketId).responses.push(response);return copy(response)}}}
const server={NextResponse:{json:(data,options)=>({ok:(options?.status||200)<400,status:options?.status||200,json:async()=>data})}}
const routes=load('app/api/support/tickets/route.ts',{'next/server':server,'next-auth':{getServerSession:async()=>sessionId?{user:{id:sessionId,email:`${sessionId}@example.invalid`,name:'Synthetic user'}}:null},'@/lib/auth':{authOptions:{}},'@/lib/native-auth':{getUserIdFromNativeAuth:async()=>null},'@/lib/prisma':{prisma},'@prisma/client':{},'@/lib/support-automation':{buildSupportFeedbackPrompt:()=> 'Please rate your support experience',processSupportTicketAutoReply:async()=>{sends.push('normal-support-auto-reply')},sendSupportFeedbackEmail:async()=>{sends.push('normal-feedback-email')},sendSupportTranscriptEmail:async()=>{sends.push('normal-transcript-email')}},'@/lib/support-agents':{getSupportAgentForTimestamp:()=>({})},'@/lib/support-attachments':{rehydrateSupportTicket:ticket=>ticket}})
const review=load('lib/native-voice-review-token.ts',{crypto})
class Request{constructor(url,options={}){this.url=String(url);this.headers=options.headers;this.body=options.body}async json(){return JSON.parse(this.body||'{}')}}
const helper=load('lib/native-voice-support-actions.ts',{crypto,'next/server':{NextRequest:Request},'next-auth':{getServerSession:async()=>sessionId?{user:{id:sessionId,email:sessionId+'@example.invalid'}}:null},'@/lib/auth':{authOptions:{}},'@/lib/native-auth':{getUserIdFromNativeAuth:async()=>sessionId},'@/lib/native-voice-review-token':review,'@/app/api/support/tickets/route':{GET:routes.GET,POST:async request=>{posts++;return routes.POST(request)}}})
const request=new Request('https://helfi.invalid/api/native/voice-assistant',{headers:new Headers({authorization:'Bearer synthetic-original-auth'})})
const input=(action,values={})=>({action,values}),prepare=(action,values,transcript)=>helper.prepareVoiceSupportAction(request,user,input(action,values),transcript,'2026-10-17')
const execute=draft=>helper.executeVoiceSupportAction(request,user,draft,{receiptClaimed:true,actionId:'synthetic-support-receipt'})
let count=0
async function check(name,fn){sequence=0;sends=[];posts=0;sessionId=user;tickets=[{id:'owned',userId:user,userEmail:`${user}@example.invalid`,subject:'Food logging issue',message:'Original user message',status:'OPEN',createdAt:'2026-10-17T00:00:00Z',updatedAt:'2026-10-17T00:00:00Z',responses:[]},{id:'foreign',userId:'other-user',userEmail:'other-user@example.invalid',subject:'Private ticket',status:'OPEN',createdAt:'2026-10-17T00:00:00Z',updatedAt:'2026-10-17T00:00:00Z',responses:[]}];await fn();count++;console.log('PASS '+name)}
async function run(){
await check('read/list/status use existing authenticated ownership checks without sending',async()=>{
 const all=await helper.readVoiceSupportFacts(request,user,input('support.list'));assert.equal(all.tickets.length,1)
 const read=await helper.readVoiceSupportFacts(request,user,input('support.read',{query:'Food logging issue'}));assert.equal(read.ticket.id,'owned');assert.equal(read.ticket.message,'Original user message');assert.equal(posts,0)
 const foreign=await helper.readVoiceSupportFacts(request,user,input('support.read',{ticketId:'foreign'}));assert.equal(foreign.status,'needs_selection')
})
await check('create sends only exact reviewed words through normal handler, no external recipient override',async()=>{
 const draft=await prepare('support.create',{subject:'Voice problem',message:'My meal would not save.'},'Send support subject Voice problem: My meal would not save.')
 assert.equal(posts,0);assert.equal(draft.canConfirm,true);assert.match(draft.confirmationMessage,/My meal would not save\./)
 const result=await execute(draft);assert.equal(result.status,'completed');assert.equal(posts,1);assert.equal(tickets.find(t=>t.id===result.id).message,'My meal would not save.');assert.equal(sends[0],'normal-support-auto-reply')
 await assert.rejects(()=>prepare('support.create',{message:'Invented complaint'},'Send support: My meal would not save.'),/exact text/)
 await assert.rejects(()=>prepare('support.create',{message:'Hello',email:'attacker@example.invalid'},'Send support Hello'),/field/)
})
await check('reply selects an owned ticket and verifies exact persisted user response',async()=>{
 const draft=await prepare('support.reply',{query:'Food logging issue',message:'It still fails.'},'Reply to support ticket Food logging issue: It still fails.')
 const result=await execute(draft);assert.equal(result.id,'owned');assert(tickets[0].responses.some(r=>r.message==='It still fails.'&&!r.isAdminResponse));assert.equal(tickets[1].responses.length,0)
})
await check('end chat includes normal transcript side effect and never claims email delivered',async()=>{
 const draft=await prepare('support.end_chat',{ticketId:'owned'},'Close this support ticket')
 assert.match(draft.summary,/transcript email/);const result=await execute(draft)
 assert.equal(tickets[0].status,'RESOLVED');assert(sends.includes('normal-transcript-email'));assert.match(result.message,/Email delivery is not verified/)
 const again=await prepare('support.end_chat',{ticketId:'owned'},'Close this support ticket');assert.equal(again.canConfirm,false);assert.equal(posts,1)
})
await check('feedback exact rating/comment and selected ticket delete match normal manual actions',async()=>{
 const draft=await prepare('support.feedback',{ticketId:'owned',rating:4,comment:'Thanks for helping.'},'Send support feedback four stars: Thanks for helping.')
 await execute(draft);assert.equal(tickets[0].status,'CLOSED');assert(sends.includes('normal-feedback-email'))
 const deletion=await prepare('support.delete',{ticketId:'owned'},'Delete this support ticket');assert.match(deletion.summary,/Permanently delete/);await execute(deletion)
 assert.equal(tickets.length,1);assert.equal(tickets[0].id,'foreign')
})
await check('duplicate subjects require choice and keep precise requested message',async()=>{
 tickets.push({...copy(tickets[0]),id:'second'})
 const draft=await prepare('support.reply',{query:'Food logging issue',message:'More details.'},'Reply to support ticket: More details.')
 assert.equal(draft.canConfirm,false);assert.equal(draft.supportAction.choices.length,2);assert.equal(draft.supportAction.values.message,'More details.');assert.equal(posts,0)
})
await check('stale signed reviews, changed account and negated send never invoke normal POST',async()=>{
 const draft=await prepare('support.reply',{ticketId:'owned',message:'Please help.'},'Send this support ticket reply: Please help.')
 tickets[0].responses.push({message:'New support response',isAdminResponse:true})
 await assert.rejects(()=>execute(draft),/changed/);sessionId='other-user';await assert.rejects(()=>execute(draft),/same account/);sessionId=user
 await assert.rejects(()=>prepare('support.create',{message:'Please help.'},"Don't send support Please help."),/Nothing has been sent/)
 await assert.rejects(()=>execute({...draft,summary:'Tampered'}),/review/);assert.equal(posts,0)
})
await check('unknown send result or fake success cannot claim completion',async()=>{
 const draft=await prepare('support.reply',{ticketId:'owned',message:'Please help.'},'Send support reply: Please help.')
 const io={userId:async()=>user,call:async(_req,method,values)=>method==='POST'?{ticket:{id:'owned'}}:{ticket:copy(tickets[0])}}
 await assert.rejects(()=>helper.executeVoiceSupportAction(request,user,draft,{receiptClaimed:true,actionId:'synthetic-uncertain'},io),/not confirmed/)
})
console.log(`Voice support actions: ${count} actual-source offline groups passed; synthetic normal handlers only. Receipt replay integration belongs to root.`)
}
run().catch(error=>{console.error(error);process.exitCode=1})
