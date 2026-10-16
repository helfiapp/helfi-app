import type { NextRequest } from 'next/server'

export type NativeVoiceMoodContext={intensityPercent?:number;feelings?:string[];energyLevel?:number;sleepQuality?:number;nutrition?:number;supplements?:number;medicationEffect?:number;physicalActivity?:number;localHour?:number}
const RATINGS={energyLevel:'energy(?:\\s+level)?',sleepQuality:'sleep(?:\\s+quality)?',nutrition:'nutrition(?:\\s+quality)?',supplements:'supplements?(?:\\s+(?:effect|rating))?',medicationEffect:'medications?(?:\\s+effect)?',physicalActivity:'(?:physical\\s+)?activity'} as const
const SMALL=['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen']
const TENS=['twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety']
const NUMBER='(?:\\d+(?:\\.\\d+)?|one\\s+hundred|hundred|(?:twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[ -](?:one|two|three|four|five|six|seven|eight|nine))?|'+SMALL.join('|')+')'
function spokenNumber(raw:string){const text=raw.toLowerCase().replace(/-/g,' ').trim();if(/^\d/.test(text))return Number(text);if(text==='hundred'||text==='one hundred')return 100;const small=SMALL.indexOf(text);if(small>=0)return small;const parts=text.split(/\s+/),tens=TENS.indexOf(parts[0]);return tens>=0?(tens+2)*10+(parts[1]?SMALL.indexOf(parts[1]):0):NaN}
export function validateNativeVoiceMoodContext(raw:unknown):NativeVoiceMoodContext{
  if(raw===undefined)return {}
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(key=>!['intensityPercent','feelings','localHour',...Object.keys(RATINGS)].includes(key)))throw new Error('Please review the supported mood details.')
  const context:NativeVoiceMoodContext={}
  for(const [key,value]of Object.entries(raw)){
    if(key==='feelings'){
      if(!Array.isArray(value)||value.length>12||value.some(item=>typeof item!=='string'||!item.trim()||item.length>24))throw new Error('Please give up to twelve short feeling labels.')
      context.feelings=[...new Set(value.map(item=>item.trim()))];continue
    }
    const [min,max]=key==='intensityPercent'?[0,100]:key==='localHour'?[0,23]:[1,5]
    if(typeof value!=='number'||!Number.isInteger(value)||value<min||value>max)throw new Error(key==='intensityPercent'?'Please state mood intensity from zero to one hundred percent.':'Please state each mood detail from one to five.')
    ;(context as any)[key]=value
  }
  return context
}
/** Fixed speech evidence, independently checked instead of trusting model
 * context JSON. Context ratings never become the seven-point mood score. */
export function parseNativeVoiceMoodContext(transcript:string){
  transcript=transcript.split(/\b(?:add|include|with|set|change|update)\s+(?:(?:a|the|my)\s+)?note\b|\bnote\s*:/i)[0]
  const context:NativeVoiceMoodContext={};let matched=false,error:string|undefined
  for(const [key,label]of Object.entries(RATINGS)){
    const pattern=new RegExp(`\\b${label}\\s*(?:(?:rating|score|level)\\s*)?(?:(?:is|was|at|to|as|of)\\s*|[:=]\\s*)?(${NUMBER})(?:\\s*(?:\\/|out\\s+of|over|of)\\s*(five|seven|\\d+))?(?![a-z0-9])`,'gi')
    const hits=[...transcript.matchAll(pattern)]
    if(hits.length){const hit=hits[hits.length-1],tail=transcript.slice((hit.index||0)+hit[0].length);if(/^\s*(?:hours?|minutes?|grams?|millilitres?|ml)\b/i.test(tail))continue;matched=true;const value=spokenNumber(hit[1]);if(!Number.isInteger(value)||value<1||value>5||hit[2]&&spokenNumber(hit[2])!==5||new RegExp(`^\\s*(?:or|through|to)\\s+${NUMBER}\\b`,'i').test(tail))error='Please state one exact mood detail rating from one to five.';else (context as any)[key]=value}
  }
  const intensity=[...transcript.matchAll(new RegExp(`\\b(?:mood\\s+)?intensity(?:\\s+percent)?\\s*(?:(?:is|was|at|to|as|of)\\s*|[:=]\\s*)?(${NUMBER})\\s*(?:%|percent\\b)`, 'gi'))]
  if(intensity.length){matched=true;const value=spokenNumber(intensity[intensity.length-1][1]);if(!Number.isInteger(value)||value<0||value>100)error='Please state mood intensity from zero to one hundred percent.';else context.intensityPercent=value}
  const feelings=[...transcript.matchAll(/\b(?:my\s+)?feelings?\s*(?:are|is|include|to|:|=)\s+([^.;!?]+)/gi)]
  if(/\b(?:clear|remove)\s+(?:(?:all|the|my)\s+)*feelings?\b/i.test(transcript)){matched=true;context.feelings=[]}
  if(feelings.length){
    matched=true
    const tail=feelings[feelings.length-1][1].split(/\b(?:energy|sleep quality|nutrition|supplements?|medication effect|physical activity|intensity|(?:add|change|set) (?:the )?note)\b/i)[0].replace(/[,\s]+$/,'')
    const labels=tail.split(/\s*(?:,|\band\b)\s*/i).map(item=>item.trim()).filter(Boolean)
    try{context.feelings=validateNativeVoiceMoodContext({feelings:labels}).feelings}catch(e:any){error=e.message}
  }
  if(matched&&/\b(?:do not|don't|dont|never|not)\s+(?:set|add|change|record|log|make|use)\b/i.test(transcript))error='Please state only the mood details you want to record.'
  return {context,matched,...(error?{error}:{})}
}
export function nativeVoiceMoodContextSummary(context:NativeVoiceMoodContext|undefined){
  if(!context)return ''
  const labels:Record<string,string>={energyLevel:'energy',sleepQuality:'sleep quality',nutrition:'nutrition',supplements:'supplements',medicationEffect:'medication effect',physicalActivity:'physical activity'}
  return Object.entries(context).filter(([key])=>key!=='localHour').map(([key,value])=>key==='feelings'?`feelings: ${(value as string[]).join(', ')||'none'}`:key==='intensityPercent'?`intensity ${value}%`:`${labels[key]} ${value}/5`).join('; ')
}
type MoodIo={userId:(request:NextRequest)=>Promise<string|null>;call:(request:NextRequest,method:'POST'|'GET',body:any,localDate:string)=>Promise<any>}
const normalIo:MoodIo={
  userId:async request=>{
    const [{getServerSession},{authOptions},{getUserIdFromNativeAuth},{prisma}]=await Promise.all([import('next-auth'),import('@/lib/auth'),import('@/lib/native-auth'),import('@/lib/prisma')])
    const session=await getServerSession(authOptions)
    const user=session?.user?.email?await prisma.user.findUnique({where:{email:session.user.email},select:{id:true}}):await (async()=>{const id=await getUserIdFromNativeAuth(request);return id?prisma.user.findUnique({where:{id},select:{id:true}}):null})()
    return user?.id||null
  },
  call:async(original,method,body,localDate)=>{
    const [{NextRequest},route]=await Promise.all([import('next/server'),import('@/app/api/mood/entries/route')])
    const url=new URL('/api/mood/entries',original.url),headers=new Headers(original.headers);headers.delete('content-length')
    if(method==='GET'){url.searchParams.set('start',localDate);url.searchParams.set('end',localDate)}else headers.set('content-type','application/json')
    const request=new NextRequest(url,{method,headers,signal:original.signal,...(method==='POST'?{body:JSON.stringify(body)}:{})})
    const response=method==='POST'?await route.POST(request):await route.GET(request),data=await response.json()
    if(!response.ok)throw new Error(data?.error||'The mood entry could not be saved or checked.')
    return data
  },
}
export async function saveNativeVoiceMood(request:NextRequest,userId:string,draft:any,io:MoodIo=normalIo){
  if(request.signal.aborted||!userId||await io.userId(request)!==userId)throw new Error('Please sign in to the same account before saving this mood entry.')
  const mood=draft?.mood
  if(!mood||!Number.isInteger(mood.mood)||mood.mood<1||mood.mood>7||!Array.isArray(mood.tags)||mood.tags.length>12||mood.tags.some((tag:any)=>typeof tag!=='string'||!tag.trim()||tag.length>24)||typeof mood.note!=='string'||mood.note.length>600)throw new Error('Please review the mood, tags and note before saving.')
  const localDate=draft?.localDate
  if(typeof localDate!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(localDate)||!Number.isFinite(Date.parse(`${localDate}T12:00:00Z`))||new Date(`${localDate}T12:00:00Z`).toISOString().slice(0,10)!==localDate)throw new Error('Please review the mood date before saving.')
  const context=validateNativeVoiceMoodContext(mood.context)
  // A model cannot supply clock context. Derive it only from a reviewed time.
  delete context.localHour
  if(typeof draft.localTime==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(draft.localTime))context.localHour=Number(draft.localTime.slice(0,2))
  const body={mood:mood.mood,tags:[...new Set(mood.tags as string[])],note:mood.note.trim(),localDate,context}
  if(request.signal.aborted)throw new Error('This mood request stopped before saving.')
  const saved=await io.call(request,'POST',body,localDate)
  if(saved?.success!==true||typeof saved.id!=='string'||!saved.id)throw new Error('The app did not confirm a saved mood entry. Please check your mood history before retrying.')
  if(request.signal.aborted||await io.userId(request)!==userId)throw new Error('The account changed after the mood save began. Please check your history before retrying.')
  const result=await io.call(request,'GET',null,localDate),matches=Array.isArray(result?.entries)?result.entries.filter((entry:any)=>entry.id===saved.id):[]
  if(matches.length!==1)throw new Error('The saved mood entry could not be checked. Please check your history before retrying.')
  const row=matches[0],same=(a:any,b:any)=>JSON.stringify(a)===JSON.stringify(b)
  if(row.userId&&row.userId!==userId||row.localDate!==localDate||row.mood!==body.mood||row.note!==body.note||!same(row.tags,body.tags)||Object.entries(context).some(([key,value])=>!(key==='feelings'&&Array.isArray(value)&&value.length===0&&row.context?.feelings===undefined)&&!same(row.context?.[key],value)))throw new Error('The saved mood details do not match the reviewed entry. Please check your history before retrying.')
  if(request.signal.aborted||await io.userId(request)!==userId)throw new Error('The account changed while checking the mood save. Please check your history.')
  return {kind:'mood',id:saved.id,message:'Mood saved and checked.'}
}
