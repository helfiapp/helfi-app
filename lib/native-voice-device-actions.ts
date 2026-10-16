import type { NextRequest } from 'next/server'
import { getWeeklyReportRequestUser } from '@/lib/weekly-report-request-auth'
import { signNativeVoiceDraft, verifyNativeVoiceDraft } from '@/lib/native-voice-review-token'
import { NATIVE_DEVICE_ACTION_SCHEMAS, validateNativeDeviceAction, type NativeDeviceAction } from '@/native/src/voice/nativeDeviceActions'

// Pure registry shared with the phone. No server-side Health reads, device
// writes, permission requests or completed-action receipts are made here.
export const VOICE_DEVICE_ACTION_SCHEMAS = {
  'apple_health.import': NATIVE_DEVICE_ACTION_SCHEMAS['apple_health.import'],
  'apple_health.automatic.update': NATIVE_DEVICE_ACTION_SCHEMAS['apple_health.automatic.update'],
  'apple_health.source.select': NATIVE_DEVICE_ACTION_SCHEMAS['apple_health.source.select'],
} as const
function available(input: NativeDeviceAction) {
  if (!Object.prototype.hasOwnProperty.call(VOICE_DEVICE_ACTION_SCHEMAS, input.action)) throw new Error('That device control is not available in this version of Helfi.')
  return input
}
export type VoiceDeviceActionIo = { userId:(request:NextRequest)=>Promise<string|null> }
const normalIo:VoiceDeviceActionIo = { userId:async request=>(await getWeeklyReportRequestUser(request))?.id||null }
async function authorize(request:NextRequest,userId:string,io:VoiceDeviceActionIo){
  if(request.signal.aborted||!userId||await io.userId(request)!==userId||request.signal.aborted)throw new Error('Please sign in to the same account and review this device action again.')
}
function message(input:NativeDeviceAction){
  const {action,values}=input
  if(action==='apple_health.import')return `Import available Apple Health activity for ${values.localDate} using the source currently selected on this phone. Empty or unavailable active-energy data will not create activity.`
  if(action==='apple_health.automatic.update')return `Turn automatic Apple Health foreground updates ${values.enabled?'on':'off'} for this account on this phone. This does not grant Health permissions.`
  if(action==='apple_health.source.select')return `Use ${values.sourceName===null?'Apple Health totals':`the exact discovered Apple Health source “${values.sourceName}”`} for this account on this phone. If automatic updates are already enabled, they may refresh activity using this source. The source name does not prove watch-only data.`
  if(action==='sleep.settings.update')return `Update Sleep Coach on this phone: ${Object.entries(values).map(([key,value])=>key==='enabled'?`listening setting ${value?'on':'off'}`:`${key==='startTime'?'start':'end'} time ${value}`).join(', ')}. This only saves the existing setting; it does not confirm microphone access or that listening started.`
  return `Update the Sleep Coach checklist on this phone: ${Object.entries(values).map(([key,value])=>`${key==='blueLight'?'blue light':key==='roomTemp'?'room temperature':'hydration'} ${value?'checked':'unchecked'}`).join(', ')}.`
}
export async function prepareNativeVoiceDeviceAction(request:NextRequest,userId:string,input:unknown,localDate:string,io:VoiceDeviceActionIo=normalIo){
  await authorize(request,userId,io)
  const deviceAction=available(validateNativeDeviceAction(input))
  // The selected local date is supplied by the trusted request normalizer, not
  // inferred by a model or silently substituted for the requested activity day.
  validateNativeDeviceAction({action:'apple_health.import',values:{localDate}})
  if(deviceAction.action==='apple_health.import'&&deviceAction.values.localDate>localDate)throw new Error('Please choose today or an earlier activity date.')
  const description=message(deviceAction)
  const draft:any={action:'device_action',localDate,summary:description,confirmationMessage:`${description} Would you like to apply this?`,canConfirm:true,autoSave:false,deviceAction,requiresDeviceReview:true,reviewIssuedAt:Date.now()}
  draft.reviewToken=signNativeVoiceDraft(userId,draft)
  return draft
}
export async function authorizeNativeVoiceDeviceAction(request:NextRequest,userId:string,draft:any,io:VoiceDeviceActionIo=normalIo){
  await authorize(request,userId,io)
  if(draft?.action!=='device_action'||draft?.canConfirm!==true||draft?.requiresDeviceReview!==true||!verifyNativeVoiceDraft(userId,draft))throw new Error('Please review this device action again before applying it.')
  const authorizedDeviceAction=available(validateNativeDeviceAction(draft.deviceAction))
  return {success:true,deviceActionAuthorized:true,authorizedDeviceAction,status:'device_authorized',safeToClaimSaved:false,message:'The reviewed action is authorized. The phone must execute and verify it before reporting a save or import.'}
}
