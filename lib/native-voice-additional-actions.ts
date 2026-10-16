import crypto from 'crypto'
import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getUserIdFromNativeAuth } from '@/lib/native-auth'
import { signNativeVoiceDraft, verifyNativeVoiceDraft } from '@/lib/native-voice-review-token'

export const VOICE_ADDITIONAL_ACTION_SCHEMAS = {
  'devices.interest.update': { provider: ['googleFit', 'oura', 'polar'], interested: 'explicit boolean interest only; never connection or permission' },
  'health_image_note.delete': { id: 'existing owned saved image-note ID OR query', query: 'exact saved image-note summary' },
  'chat_history.rename': { threadId: 'existing owned saved thread ID OR query', query: 'exact saved thread title', context: ['general', 'food'], title: 'exact literal new title stated by the user' },
  'chat_history.delete': { threadId: 'existing owned saved thread ID OR query', query: 'exact saved thread title', context: ['general', 'food'] },
} as const
export type VoiceAdditionalActionName = keyof typeof VOICE_ADDITIONAL_ACTION_SCHEMAS
export type VoiceAdditionalActionInput = { action: VoiceAdditionalActionName; values: Record<string, any> }
type Call = { domain:'devices'|'health-images'|'chat-history'; method:'GET'|'POST'|'PATCH'|'DELETE'; targetId?:string; context?:'general'|'food'; body?:Record<string,any> }
export type VoiceAdditionalIo = { userId:(request:NextRequest)=>Promise<string|null>; call:(request:NextRequest,call:Call)=>Promise<any> }
const defaultIo:VoiceAdditionalIo = {
  userId:async request=>{
    const session=await getServerSession(authOptions),native=await getUserIdFromNativeAuth(request)
    if(session?.user?.email&&!session.user.id)throw new Error('Please sign in to the same account again.')
    if(session?.user?.id&&native&&session.user.id!==native)throw new Error('Please use the same account for this action.')
    return session?.user?.id||native||null
  },
  call:async(original,call)=>{
    const pathname=call.domain==='devices'?'/api/user-data':call.domain==='chat-history'?'/api/chat/threads':call.method==='DELETE'?`/api/medical-images/history/${encodeURIComponent(call.targetId!)}`:'/api/medical-images/history'
    const url=new URL(pathname,original.url),headers=new Headers(original.headers)
    headers.delete('content-length');headers.delete('host');headers.set('cache-control','no-store')
    if(call.domain==='devices'&&call.method==='GET')url.searchParams.set('scope','health-setup')
    if(call.domain==='chat-history'){url.searchParams.set('context',call.context||'general');if(call.method==='GET'&&call.targetId)url.searchParams.set('threadId',call.targetId)}
    if(call.body)headers.set('content-type','application/json')
    const request=new NextRequest(url,{method:call.method,headers,...(call.body?{body:JSON.stringify(call.body)}:{})})
    let response:Response
    if(call.domain==='devices'){const route=await import('@/app/api/user-data/route');response=call.method==='GET'?await route.GET(request):await route.POST(request)}
    else if(call.domain==='chat-history'){const route=await import('@/app/api/chat/threads/route');response=call.method==='GET'?await route.GET(request):call.method==='PATCH'?await route.PATCH(request):await route.DELETE(request)}
    else if(call.method==='GET')response=await(await import('@/app/api/medical-images/history/route')).GET(request)
    else response=await(await import('@/app/api/medical-images/history/[id]/route')).DELETE(request,{params:{id:call.targetId!}})
    const data=await response.json().catch(()=>null)
    if(!response.ok||!data||data.error||data.skipped)throw new Error('The normal app handler could not verify this action. No completion is being claimed; please check the saved item before retrying.')
    return data
  },
}
const text=(value:any,max=200)=>{if(typeof value!=='string'||!value.trim()||value.length>max||value.includes('\0'))throw new Error('Please state the exact saved item or new title.');return value.trim()}
const stable=(value:any):any=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).filter(key=>!['imageUrl','signedUrl','downloadUrl'].includes(key)).sort().map(key=>[key,stable(value[key])])):value
const version=(userId:string,value:any)=>crypto.createHash('sha256').update(JSON.stringify(stable({userId,value}))).digest('hex')
function capability(request:NextRequest){if(!request.headers.get('x-helfi-voice-capabilities')?.split(',').map(item=>item.trim()).includes('additional-actions-v1'))throw new Error('This action needs the updated Helfi app. Nothing has been changed.')}
async function authorize(request:NextRequest,userId:string,io:VoiceAdditionalIo){capability(request);if(!userId||await io.userId(request)!==userId)throw new Error('Please sign in to the same account before changing a saved item.')}
function clean(input:any):VoiceAdditionalActionInput{
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!['action','values'].includes(key))||!Object.hasOwn(VOICE_ADDITIONAL_ACTION_SCHEMAS,input.action))throw new Error('Please choose a supported saved-item action.')
  const schema=VOICE_ADDITIONAL_ACTION_SCHEMAS[input.action as VoiceAdditionalActionName],raw=input.values
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(key=>!Object.hasOwn(schema,key)))throw new Error('That field cannot be changed through this action.')
  const values:Record<string,any>={}
  for(const[key,value]of Object.entries(raw))values[key]=key==='interested'?typeof value==='boolean'?value:(()=>{throw new Error('Please say whether to record or remove your interest.')})():text(value)
  if(input.action==='devices.interest.update'){
    if(!['googleFit','oura','polar'].includes(values.provider)||typeof values.interested!=='boolean')throw new Error('Please choose Google Fit, Oura or Polar and whether you are interested.')
  }else{
    const key=input.action==='health_image_note.delete'?'id':'threadId'
    if(values[key]&&values.query)throw new Error('Please select one exact saved item.')
    if(input.action.startsWith('chat_history.')){values.context=values.context||'general';if(!['general','food'].includes(values.context))throw new Error('Please choose general or food chat history.');if(input.action==='chat_history.rename'&&!values.title)throw new Error('Please state the exact new saved-chat title.')}
  }
  return{action:input.action,values}
}
function intent(action:VoiceAdditionalActionName,values:Record<string,any>,transcript:string){
  const originalTranscript=transcript
  // Literal saved labels/new titles are data, not a second command. Inspect
  // intent outside those exact spans while preserving the original text.
  for(const literal of [values.title,values.query])if(typeof literal==='string'&&literal){const at=transcript.lastIndexOf(literal);if(at>=0)transcript=transcript.slice(0,at)+' '+transcript.slice(at+literal.length)}
  if(/\b(?:do not|don't|don’t|never)\s+(?:delete|remove|rename|retitle|change|save|set|mark|register|record|turn)\b|\b(?:what happens|how do i|should i|if i|if you)\b/i.test(transcript))throw new Error('Please explicitly request this change to a saved item. Nothing has changed.')
  if(action==='devices.interest.update'){
    const names={googleFit:/\bgoogle\s*fit\b/i,oura:/\boura(?:\s+ring)?\b/i,polar:/\bpolar\b/i}
    if(!names[values.provider as keyof typeof names].test(transcript)||!/\binterest(?:ed)?\b/i.test(transcript))throw new Error('Please explicitly say whether to record interest in that device service.')
    const off=/\b(?:not|no longer)\s+interested\b|\b(?:remove|clear|turn off|disable)\b.*\binterest\b/i.test(transcript)
    if(values.interested===off)throw new Error('Please clarify whether you want to record or remove interest. This does not connect a device.')
  }else if(action==='health_image_note.delete'){
    if(!/\b(?:delete|remove)\b/i.test(transcript)||!/\b(?:saved|history)\b/i.test(transcript)||!/\b(?:health|medical)\s+image|\bimage\s+notes?\b/i.test(transcript))throw new Error('Please explicitly ask to delete a selected saved health image note.')
  }else{
    if(!/\b(?:saved|history|previous|older)\b/i.test(transcript)||!/\b(?:chat|thread|conversation)\b/i.test(transcript)||/\b(?:current|our)\s+(?:voice\s+)?(?:chat|conversation|session)\b|\bthis\s+voice\s+conversation\b/i.test(transcript))throw new Error('Please identify a saved Chat History thread. This action does not clear the current voice conversation.')
    if(action==='chat_history.rename'?!/\b(?:rename|retitle)\b|\bchange\b.*\btitle\b/i.test(transcript):!/\b(?:delete|remove)\b/i.test(transcript))throw new Error('Please explicitly request the saved-chat rename or deletion.')
    if(action==='chat_history.rename'&&!originalTranscript.includes(values.title))throw new Error('Please dictate the exact new saved-chat title. It will not be rewritten.')
  }
}
const domain=(action:VoiceAdditionalActionName):Call['domain']=>action==='devices.interest.update'?'devices':action==='health_image_note.delete'?'health-images':'chat-history'
function interests(data:any){const envelope=data?.data,result=envelope?.deviceInterest;if(!envelope||typeof envelope!=='object'||Array.isArray(envelope)||!result||typeof result!=='object'||Array.isArray(result)||Object.values(result).some(value=>typeof value!=='boolean'))throw new Error('Please reopen Devices to review the saved interest settings.');return{...result}}
async function records(request:NextRequest,userId:string,action:VoiceAdditionalActionName,values:Record<string,any>,io:VoiceAdditionalIo,targetId?:string){
  const data=await io.call(request,{domain:domain(action),method:'GET',context:values.context,targetId})
  if(action==='devices.interest.update')return{interest:interests(data)}
  if(action.startsWith('chat_history.')&&targetId&&data.exactThreadId!==targetId)throw new Error('The exact saved-chat identity could not be checked. Please reopen Chat History.')
  const list=action==='health_image_note.delete'?data.history:data.threads
  if(!Array.isArray(list)||list.some(row=>!row||typeof row.id!=='string'||row.userId&&row.userId!==userId)||new Set(list.map(row=>row.id)).size!==list.length)throw new Error('The app returned an invalid saved-item list. Please reopen it before changing anything.')
  if(action.startsWith('chat_history.')&&list.some(row=>row.context!==values.context||targetId&&row.id!==targetId))throw new Error('The saved-chat context changed. Please review it again.')
  return{list}
}
export async function prepareVoiceAdditionalAction(request:NextRequest,userId:string,input:VoiceAdditionalActionInput,transcript:string,localDate:string,io:VoiceAdditionalIo=defaultIo){
  await authorize(request,userId,io);const{action,values}=clean(input);intent(action,values,transcript)
  const current=await records(request,userId,action,values,io,action.startsWith('chat_history.')?values.threadId:undefined)
  let selected:any,preparedValues:Record<string,any>,summary:string,beforeHash:string
  const operation=action==='devices.interest.update'?'update':action==='chat_history.rename'?'rename':'delete'
  if(action==='devices.interest.update'){
    preparedValues=values;beforeHash=version(userId,current.interest)
    const provider={googleFit:'Google Fit',oura:'Oura Ring',polar:'Polar'}[values.provider as 'googleFit'|'oura'|'polar']
    summary=`${values.interested?'Record':'Remove'} interest in ${provider}. This only changes your interest preference; it does not connect a device or grant Health permissions`
  }else{
    const key=action==='health_image_note.delete'?'id':'threadId',label=(row:any)=>String(action==='health_image_note.delete'?row.summary||'Saved health image note':row.title||'Untitled saved chat')
    const matches=values[key]?current.list!.filter(row=>row.id===values[key]):values.query?current.list!.filter(row=>label(row).toLowerCase()===values.query.toLowerCase()):[]
    if(matches.length!==1){const candidates=values[key]||values.query?matches:current.list!;return{action:'additional_action',transcript,localDate,canConfirm:false,autoSave:false,summary:'Choose a saved item',confirmationMessage:matches.length?'More than one saved item has that exact title. Please choose its date or ID.':'Please choose the exact saved item before anything is changed.',choices:candidates.map(row=>({id:row.id,label:label(row),createdAt:row.createdAt,context:row.context})),additionalAction:{action,userId,values,choices:candidates.map(row=>({id:row.id,label:label(row),createdAt:row.createdAt,context:row.context}))}}}
    selected=matches[0];preparedValues={targetId:selected.id,...(values.context?{context:values.context}:{}),...(values.title?{title:values.title}:{})};beforeHash=version(userId,selected)
    summary=action==='chat_history.rename'?`Rename the saved ${values.context} Chat History thread “${label(selected)}” to exactly “${values.title}”`:action==='chat_history.delete'?`Delete the saved ${values.context} Chat History thread “${label(selected)}” and its stored messages. This does not clear the current voice conversation`:`Delete the selected saved health image note “${label(selected)}” and its saved file reference. This does not give medical advice`
  }
  const draft:any={action:'additional_action',transcript,localDate,summary,confirmationMessage:`${summary}. Nothing has changed yet. Would you like me to confirm this exact action?`,canConfirm:true,autoSave:false,reviewNonce:crypto.randomUUID(),reviewIssuedAt:Date.now(),additionalAction:{action,userId,operation,values:preparedValues,beforeHash,preparedAt:Date.now()}}
  draft.reviewToken=signNativeVoiceDraft(userId,draft);return draft
}
/** Root must hold its existing durable receipt claim. Replays return that stored
 * result; an uncertain submitted mutation is never automatically re-executed. */
export async function executeVoiceAdditionalAction(request:NextRequest,userId:string,draft:any,receipt:{receiptClaimed:true;actionId:string},io:VoiceAdditionalIo=defaultIo){
  await authorize(request,userId,io)
  const prepared=draft?.additionalAction
  if(!receipt?.receiptClaimed||typeof receipt.actionId!=='string'||!receipt.actionId||receipt.actionId.length>200||draft?.action!=='additional_action'||!draft.canConfirm||!verifyNativeVoiceDraft(userId,draft)||prepared?.userId!==userId||!Object.hasOwn(VOICE_ADDITIONAL_ACTION_SCHEMAS,prepared?.action))throw new Error('Please review this exact saved-item action again.')
  const action=prepared.action as VoiceAdditionalActionName,values=prepared.values,operation=action==='devices.interest.update'?'update':action==='chat_history.rename'?'rename':'delete'
  const current=await records(request,userId,action,values,io,values.targetId)
  const kind=action==='devices.interest.update'?'device_interest':action==='health_image_note.delete'?'health_image_note':'chat_thread'
  const result=(status:'completed'|'already_set'|'already_absent',changed:boolean,message:string)=>({status,saved:status!=='already_absent',changed,kind,operation,action,actionId:receipt.actionId,values:{...values},...values,...(values.targetId?{id:values.targetId}:{}),changedAreas:[domain(action)],message})
  if(action==='devices.interest.update'){
    if(current.interest![values.provider]===values.interested)return result('already_set',false,'That device interest preference is already set. No connection or Health permission was changed.')
    if(version(userId,current.interest)!==prepared.beforeHash)throw new Error('Your device interest preferences changed after review. Please review them again.')
    await io.call(request,{domain:'devices',method:'POST',body:{deviceInterest:{...current.interest,[values.provider]:values.interested}}})
    const after=await records(request,userId,action,values,io)
    if(version(userId,after.interest)!==version(userId,{...current.interest,[values.provider]:values.interested}))throw new Error('The interest preference was not verified. Please check Devices before retrying.')
    return result('completed',true,'The reviewed device interest preference is saved. This did not connect a device or grant Health permissions.')
  }
  const target=current.list!.find(row=>row.id===values.targetId)
  if(!target){if(operation==='delete')return result('already_absent',false,'The selected saved item is already absent. No deletion was performed by this action.');throw new Error('The saved chat is no longer available. Please review it again.')}
  if(operation==='rename'&&target.title===values.title)return result('already_set',false,'That saved Chat History title already matches. The current voice conversation was not changed.')
  if(version(userId,target)!==prepared.beforeHash)throw new Error('The selected saved item changed after review. Please review it again.')
  const response=await io.call(request,{domain:domain(action),method:operation==='rename'?'PATCH':'DELETE',targetId:values.targetId,context:values.context,body:action.startsWith('chat_history.')?{threadId:values.targetId,...(operation==='rename'?{title:values.title}:{})}:undefined})
  if(response.success!==true)throw new Error('The app did not confirm this change. Please inspect the saved item before retrying.')
  const after=await records(request,userId,action,values,io,values.targetId),remaining=after.list!.find(row=>row.id===values.targetId)
  if(operation==='delete'?Boolean(remaining):!remaining||remaining.title!==values.title)throw new Error('The saved-item result was not verified. Please inspect its history before retrying.')
  return result('completed',true,action==='health_image_note.delete'?'The selected saved health image note and file reference were removed. Physical storage deletion is not separately verified.':operation==='rename'?'The selected saved Chat History thread has the exact reviewed title. The current voice conversation was not changed.':'The selected saved Chat History thread was removed. The current voice conversation was not changed.')
}
