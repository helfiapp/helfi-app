import crypto from 'crypto'
import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getUserIdFromNativeAuth } from '@/lib/native-auth'
import { signNativeVoiceDraft, verifyNativeVoiceDraft } from '@/lib/native-voice-review-token'

export const VOICE_SUPPORT_ACTION_SCHEMAS = {
  'support.list': {},
  'support.read': { ticketId: 'existing owned ID OR query exact subject', query: 'exact existing subject' },
  'support.create': { message: 'exact user-requested message text', subject: 'optional exact user-stated subject', category: ['GENERAL','TECHNICAL','BILLING','ACCOUNT','FEATURE_REQUEST','BUG_REPORT','EMAIL'], priority: ['LOW','MEDIUM','HIGH','URGENT'] },
  'support.reply': { ticketId: 'existing owned ID OR query exact subject', query: 'exact existing subject', message: 'exact user-requested reply text' },
  'support.end_chat': { ticketId: 'existing owned ID OR query exact subject', query: 'exact existing subject' },
  'support.feedback': { ticketId: 'existing owned ID OR query exact subject', query: 'exact existing subject', rating: 'integer 1..5 explicitly stated', comment: 'optional exact user-stated feedback text' },
  'support.delete': { ticketId: 'existing owned ID OR query exact subject', query: 'exact existing subject' },
} as const
export type VoiceSupportActionName = keyof typeof VOICE_SUPPORT_ACTION_SCHEMAS
export type VoiceSupportActionInput = { action: VoiceSupportActionName; values: Record<string, any> }
export type VoiceSupportIo = { userId: (request: NextRequest)=>Promise<string|null>; call: (request: NextRequest, method:'GET'|'POST', values:Record<string,any>)=>Promise<any> }
const defaultIo: VoiceSupportIo = {
  userId:async request=>{
    // Match the existing support handler's session-first account selection.
    const session=await getServerSession(authOptions)
    if(session?.user?.email)return session.user.id||null
    return getUserIdFromNativeAuth(request)
  },
  call:async(original,method,values)=>{
    const url = new URL('/api/support/tickets',original.url)
    const headers = new Headers(original.headers);headers.set('content-type','application/json')
    if(method==='GET')for(const [key,value] of Object.entries(values))url.searchParams.set(key,String(value))
    const request = new NextRequest(url,{method,headers,...(method==='POST'?{body:JSON.stringify(values)}:{})})
    const route=await import('@/app/api/support/tickets/route')
    const response=method==='GET'?await route.GET(request):await route.POST(request)
    const data=await response.json()
    if(!response.ok)throw new Error(data?.error||'The support action could not be completed.')
    return data
  },
}
function text(value:any,max=10000){if(typeof value!=='string'||!value.trim()||value.length>max)throw new Error('Please give the exact support text.');return value.trim()}
function stable(value:any):any{return Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).filter(key=>!['imageUrl','signedUrl','url','downloadUrl'].includes(key)).sort().map(key=>[key,stable(value[key])])):value}
function version(userId:string,ticket:any){return crypto.createHash('sha256').update(JSON.stringify(stable({userId,ticket}))).digest('hex')}
function validate(input:any){
  if(!input||typeof input!=='object'||Object.keys(input).some(key=>!['action','values'].includes(key))||!Object.hasOwn(VOICE_SUPPORT_ACTION_SCHEMAS,input.action))throw new Error('Please choose a registered support action.')
  const schema=VOICE_SUPPORT_ACTION_SCHEMAS[input.action as VoiceSupportActionName]
  const values=input.values
  if(!values||typeof values!=='object'||Array.isArray(values)||Object.keys(values).some(key=>!Object.hasOwn(schema,key)))throw new Error('That support field cannot be changed by voice.')
  const clean:Record<string,any>={}
  for(const [key,value] of Object.entries(values)){
    if(key==='rating'){if(!Number.isInteger(value)||Number(value)<1||Number(value)>5)throw new Error('Please choose a support rating from one to five.');clean[key]=value}
    else if(key==='category'||key==='priority'){if(!(schema as any)[key].includes(value))throw new Error('Please use a supported category or priority.');clean[key]=value}
    else clean[key]=text(value,key==='message'||key==='comment'?10000:200)
  }
  if(['support.create','support.reply'].includes(input.action)&&!clean.message)throw new Error('Please dictate the exact support message to send.')
  if(input.action==='support.feedback'&&clean.rating===undefined)throw new Error('Please state the support rating.')
  if(!['support.create','support.list'].includes(input.action)&&Boolean(clean.ticketId)===Boolean(clean.query))throw new Error('Please identify exactly one support ticket.')
  return {action:input.action as VoiceSupportActionName,values:clean}
}
async function authorize(request:NextRequest,userId:string,io:VoiceSupportIo){if(!userId||await io.userId(request)!==userId)throw new Error('Please sign in to the same account before using support.')}
async function select(request:NextRequest,values:Record<string,any>,io:VoiceSupportIo){
  const list=await io.call(request,'GET',{list:1,activeOnly:0})
  const tickets=Array.isArray(list.tickets)?list.tickets:[]
  const query=String(values.query||'').toLowerCase()
  const exact=tickets.filter((ticket:any)=>String(ticket.subject).toLowerCase()===query)
  const matches=values.ticketId?tickets.filter((ticket:any)=>ticket.id===values.ticketId):exact.length?exact:tickets.filter((ticket:any)=>String(ticket.subject).toLowerCase().includes(query))
  if(matches.length!==1)return {choices:matches.map((ticket:any)=>({id:ticket.id,label:ticket.subject,status:ticket.status}))}
  const data=await io.call(request,'GET',{ticketId:matches[0].id,activeOnly:0})
  if(!data.ticket||data.ticket.id!==matches[0].id)throw new Error('That support ticket is no longer available.')
  return {ticket:data.ticket}
}
function exactEvidence(transcript:string,value:string){return transcript.includes(value)}
function explicitSupportIntent(action:VoiceSupportActionName,transcript:string,values:Record<string,any>){
  if(/\b(?:do not|don't|dont|never)\s+(?:send|submit|reply|end|close|delete|remove|contact|create)\b/i.test(transcript))throw new Error('Nothing has been sent or changed.')
  const support=/\b(?:support|ticket|help desk|customer service)\b/i.test(transcript)
  const pattern=action==='support.delete'?/\b(?:delete|remove)\b/i:action==='support.end_chat'?/\b(?:end|close|finish)\b/i:action==='support.feedback'?/\b(?:rate|rating|feedback|stars?)\b/i:/\b(?:send|submit|reply|respond|message|tell|ask|contact|create|report)\b/i
  if(!support||!pattern.test(transcript))throw new Error('Please explicitly request this support action before I prepare it.')
  for(const key of ['message','comment','subject'])if(values[key]&&!exactEvidence(transcript,values[key]))throw new Error('Please dictate the exact text to send. I will not invent or rewrite your support message.')
  for(const key of ['category','priority'])if(values[key]&&!new RegExp(`\\b${values[key].toLowerCase().replace(/_/g,'[ -]')}\\b`,'i').test(transcript))throw new Error('Please state the requested support category or priority.')
  if(action==='support.feedback'){
    const words=['zero','one','two','three','four','five']
    if(!new RegExp(`\\b(?:${values.rating}|${words[values.rating]})\\s*(?:stars?|out of five|out of 5|/\\s*5)\\b|\\b(?:rate|rating)\\s+(?:it\\s+)?(?:${values.rating}|${words[values.rating]})\\b`,'i').test(transcript))throw new Error('Please state the exact support rating.')
  }
}
export async function readVoiceSupportFacts(request:NextRequest,userId:string,input:VoiceSupportActionInput,io:VoiceSupportIo=defaultIo){
  await authorize(request,userId,io);const {action,values}=validate(input)
  if(action==='support.list'){const data=await io.call(request,'GET',{list:1,activeOnly:0});return {status:'facts',tickets:(data.tickets||[]).map((ticket:any)=>({id:ticket.id,subject:ticket.subject,status:ticket.status,createdAt:ticket.createdAt,updatedAt:ticket.updatedAt}))}}
  if(action!=='support.read')throw new Error('That support action requires a review before sending.')
  const selected=await select(request,values,io)
  return selected.ticket?{status:'facts',ticket:selected.ticket}:{status:'needs_selection',choices:selected.choices}
}
export async function prepareVoiceSupportAction(request:NextRequest,userId:string,input:VoiceSupportActionInput,transcript:string,localDate:string,io:VoiceSupportIo=defaultIo){
  await authorize(request,userId,io);const {action,values}=validate(input)
  if(['support.list','support.read'].includes(action))throw new Error('Use the read-only support action for that request.')
  explicitSupportIntent(action,transcript,values)
  const selected: { ticket?: any; choices?: any[] }=action==='support.create'?{}:await select(request,values,io)
  if('choices' in selected)return {canConfirm:false,summary:'Choose a support ticket',confirmationMessage:selected.choices?.length?'More than one support ticket matches. Please choose its exact subject.':'I could not find that support ticket.',supportAction:{action,values,choices:selected.choices}}
  const ticket='ticket' in selected?selected.ticket:undefined
  if(ticket&&['RESOLVED','CLOSED'].includes(ticket.status)&&['support.end_chat','support.reply'].includes(action))return {canConfirm:false,summary:'Support chat is closed',confirmationMessage:action==='support.reply'?'This support chat is closed. Please create a new support ticket to send a new message.':'That support chat is already closed. No transcript has been requested again.'}
  const payload:Record<string,any>={...values};delete payload.query;delete payload.ticketId
  payload.action=action.replace('support.','')==='reply'?'add_response':action==='support.feedback'?'submit_feedback':action==='support.delete'?'delete_ticket':action.replace('support.','')
  if(ticket)payload.ticketId=ticket.id
  const target=ticket?`“${ticket.subject}”`:'a new support ticket'
  const summary=action==='support.create'?`Send a new support ticket${values.subject?`: ${values.subject}`:''}`:action==='support.reply'?`Send a reply to ${target}`:action==='support.end_chat'?`Close ${target} and request its transcript email`:action==='support.feedback'?`Send ${values.rating}/5 feedback for ${target} and close this ticket`:`Permanently delete ${target}`
  const detail=values.message||values.comment||''
  const draft:any={action:'support_action',transcript,localDate,summary,confirmationMessage:`${summary}${detail?` with this exact text: “${detail}”`:''}. Would you like me to confirm this action?`,canConfirm:true,autoSave:false,reviewIssuedAt:Date.now(),supportAction:{action,userId,payload,...(ticket?{ticketId:ticket.id,beforeHash:version(userId,ticket)}:{})}}
  draft.reviewToken=signNativeVoiceDraft(userId,draft);return draft
}
/** Execute under the existing voice receipt lock. Keep a pending receipt on
 * interruptions so an uncertain external send is never retried automatically. */
export async function executeVoiceSupportAction(request:NextRequest,userId:string,draft:any,receipt:{receiptClaimed:true;actionId:string},io:VoiceSupportIo=defaultIo){
  await authorize(request,userId,io)
  const prepared=draft?.supportAction
  if(!receipt?.receiptClaimed||!receipt.actionId||draft?.action!=='support_action'||!verifyNativeVoiceDraft(userId,draft)||prepared?.userId!==userId)throw new Error('Please review this exact support action again.')
  if(prepared.ticketId){const data=await io.call(request,'GET',{ticketId:prepared.ticketId,activeOnly:0});if(!data.ticket||version(userId,data.ticket)!==prepared.beforeHash)throw new Error('This support ticket changed after review. Please review it again.')}
  const response=await io.call(request,'POST',prepared.payload)
  const id=prepared.ticketId||response.ticket?.id
  if(!id)throw new Error('Support did not confirm a ticket identity. Please check before trying again.')
  const after=await io.call(request,'GET',{ticketId:id,activeOnly:0})
  let confirmed=false
  if(prepared.action==='support.delete')confirmed=!after.ticket
  else if(after.ticket?.id===id){
    if(prepared.action==='support.create')confirmed=after.ticket.message===prepared.payload.message&&(prepared.payload.subject===undefined||after.ticket.subject===prepared.payload.subject)
    if(prepared.action==='support.reply')confirmed=after.ticket.responses?.some((reply:any)=>reply.isAdminResponse===false&&reply.message===prepared.payload.message)===true
    if(prepared.action==='support.end_chat')confirmed=after.ticket.status==='RESOLVED'
    if(prepared.action==='support.feedback'){const message=`[FEEDBACK] Rating: ${prepared.payload.rating}/5\nComment: ${prepared.payload.comment||'(none)'}`;confirmed=after.ticket.status==='CLOSED'&&after.ticket.responses?.some((reply:any)=>reply.isAdminResponse===false&&reply.message===message)===true}
  }
  if(!confirmed)throw new Error('Support has not confirmed this action. Please check it before retrying.')
  return {kind:'support_action',action:prepared.action,id,status:'completed',actionId:receipt.actionId,message:prepared.action==='support.delete'?'The selected support ticket was deleted.':prepared.action==='support.end_chat'?'The selected support chat was closed. Email delivery is not verified.':'The reviewed support action was saved. Email delivery is not verified.'}
}
