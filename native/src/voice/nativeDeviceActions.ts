import { validateAppleHealthSource, type AppleHealthSource } from '../health/appleHealthSources'
import { RawSha256 } from '@aws-crypto/sha256-js/build/main/RawSha256'

// Pure shared registry. Real storage/HealthKit/provider methods are injected by
// the signed-in host; importing this module never reads Health or device data.
export const NATIVE_DEVICE_ACTION_SCHEMAS = {
  'apple_health.import': { localDate: 'YYYY-MM-DD' },
  'apple_health.automatic.update': { enabled: 'boolean' },
  'apple_health.source.select': { sourceName: 'exact discovered source name, or null for Apple Health totals' },
  'sleep.settings.update': { enabled: 'optional boolean setting only; does not start listening', startTime: 'optional HH:MM', endTime: 'optional HH:MM' },
  'sleep.routine.update': { blueLight: 'optional boolean checklist state', roomTemp: 'optional boolean checklist state', hydrate: 'optional boolean checklist state' },
} as const
export type NativeDeviceAction = { action: keyof typeof NATIVE_DEVICE_ACTION_SCHEMAS; values: Record<string, any> }
export const SLEEP_DEVICE_SETTINGS_KEY = 'helfi_sleep_listening_settings_v1'
export const SLEEP_DEVICE_ROUTINE_KEY = 'helfi_sleep_routine_v1'
export type SleepDeviceSnapshot = { settings: {enabled:boolean;startTime:string;endTime:string;timezone:string}; routine:{blueLight:boolean;roomTemp:boolean;hydrate:boolean}; settingsRaw:string|null;routineRaw:string|null;revision:number }
type SleepDeviceEditor={accountId:string;isCurrent:()=>boolean;isDirty:()=>boolean;synchronize:(value:SleepDeviceSnapshot,origin:'voice'|'manual')=>void}
const sleepEditors=new Set<SleepDeviceEditor>()
let sleepRevision=0
export function registerSleepDeviceEditor(editor:SleepDeviceEditor){sleepEditors.add(editor);return()=>{sleepEditors.delete(editor)}}
export function getSleepDeviceEditorState(accountId:string){
  const editors=[...sleepEditors].filter(editor=>editor.isCurrent())
  return {mounted:editors.length>0,dirty:editors.some(editor=>editor.accountId!==accountId||editor.isDirty())}
}
export function synchronizeSleepDeviceEditors(accountId:string,value:SleepDeviceSnapshot,origin:'voice'|'manual'){
  const editors=[...sleepEditors].filter(editor=>editor.isCurrent())
  if(origin==='voice'&&editors.some(editor=>editor.accountId!==accountId||editor.isDirty()))throw new Error('Sleep Coach has a new manual edit. Please check its current settings before retrying.')
  for(const editor of editors)if(editor.accountId===accountId)editor.synchronize(value,origin)
}
export type NativeDeviceIo = {
  getItem:(key:string)=>Promise<string|null>;setItem:(key:string,value:string)=>Promise<void>;now:()=>number;timeZone:()=>string
  accountId:()=>string|null;isCurrent:()=>boolean
  sleepEditor:()=>{mounted:boolean;dirty:boolean}
  onSleepWrite?:(value:SleepDeviceSnapshot,origin:'voice'|'manual')=>Promise<void>|void
  // The host must expose live state, not the render closure captured at review.
  // Setters must resolve only after their normal persistent write succeeded.
  health:{supported:()=>boolean;snapshot:()=>{enabled:boolean;source:AppleHealthSource|null;busy:boolean;ready?:boolean;userId?:string|null};setEnabled:(value:boolean)=>Promise<void>;setSource:(value:AppleHealthSource|null)=>Promise<void>;readSources:(date?:string)=>Promise<AppleHealthSource[]>;refresh:(manual:boolean,date?:string)=>Promise<any>}
}
export type SleepDeviceIo=Omit<NativeDeviceIo,'health'>
export type NativeDeviceReview = {token:string;accountId:string;action:NativeDeviceAction;before:string;expiresAt:number;source?:AppleHealthSource|null;sleep?:SleepDeviceSnapshot}
export type NativeDeviceReceipt = {kind:'native_device_action';id:string;entity:'apple_health'|'device_settings';operation:'import'|'update';verified:boolean;status:'setting_saved'|'imported'|'no_data';message:string;localDate?:string;idempotentReplay?:boolean}
function exactObject(value:any,allowed:string[]){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!allowed.includes(key)))throw new Error('Please review one supported device action.')}
export function validateNativeDeviceAction(raw:any):NativeDeviceAction{
  exactObject(raw,['action','values'])
  if(!Object.prototype.hasOwnProperty.call(NATIVE_DEVICE_ACTION_SCHEMAS,raw.action))throw new Error('This device action is not supported.')
  exactObject(raw.values,Object.keys(NATIVE_DEVICE_ACTION_SCHEMAS[raw.action as NativeDeviceAction['action']]))
  const values:Record<string,any>=Object.fromEntries(Object.keys(NATIVE_DEVICE_ACTION_SCHEMAS[raw.action as NativeDeviceAction['action']]).filter(key=>Object.prototype.hasOwnProperty.call(raw.values,key)).map(key=>[key,raw.values[key]]))
  if(!Object.keys(values).length)throw new Error('Please state the device setting to change.')
  for(const [key,value]of Object.entries(values)){
    if(['enabled','blueLight','roomTemp','hydrate'].includes(key)&&typeof value!=='boolean')throw new Error('Please say whether to turn the setting on or off.')
    if(['startTime','endTime'].includes(key)&&(typeof value!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)))throw new Error('Please choose a valid time.')
    if(key==='localDate'&&(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(`${value}T12:00:00Z`))||new Date(`${value}T12:00:00Z`).toISOString().slice(0,10)!==value))throw new Error('Please choose a valid activity date.')
    if(key==='sourceName'&&value!==null&&(typeof value!=='string'||!value.trim()||value.length>128||value!==value.trim()))throw new Error('Please choose an exact source shown in Apple Health.')
  }
  return {action:raw.action,values}
}
function active(io:Pick<NativeDeviceIo,'accountId'|'isCurrent'>,accountId:string){if(!accountId||io.accountId()!==accountId||!io.isCurrent())throw new Error('The signed-in account or device request changed. Please review again.')}
function parseStored(raw:string|null){if(raw===null)return null;try{const value=JSON.parse(raw);if(value&&typeof value==='object'&&!Array.isArray(value))return value}catch{}throw new Error('The saved sleep settings need review in Sleep Coach.')}
export async function readSleepDeviceSnapshot(io:Pick<NativeDeviceIo,'getItem'|'timeZone'>):Promise<SleepDeviceSnapshot>{
  const revision=sleepRevision
  const [settingsRaw,routineRaw]=await Promise.all([io.getItem(SLEEP_DEVICE_SETTINGS_KEY),io.getItem(SLEEP_DEVICE_ROUTINE_KEY)])
  if(revision!==sleepRevision)throw new Error('Sleep settings changed while reading. Please review the current values.')
  const settings=parseStored(settingsRaw),routine=parseStored(routineRaw)
  return {settings:{enabled:settings?.enabled===true,startTime:typeof settings?.startTime==='string'?settings.startTime:'22:30',endTime:typeof settings?.endTime==='string'?settings.endTime:'07:00',timezone:typeof settings?.timezone==='string'&&settings.timezone?settings.timezone:io.timeZone()||'UTC'},routine:routine?{blueLight:routine.blueLight===true,roomTemp:routine.roomTemp===true,hydrate:routine.hydrate===true}:{blueLight:true,roomTemp:false,hydrate:false},settingsRaw,routineRaw,revision}
}
const storageQueues=new Map<string,Promise<unknown>>()
function assertSleepEditor(io:SleepDeviceIo,origin:'voice'|'manual',accountId:string){
  const editor=io.sleepEditor()
  if(origin==='voice'&&(editor.dirty||editor.mounted&&!io.onSleepWrite&&!getSleepDeviceEditorState(accountId).mounted))throw new Error('Sleep Coach has an active manual edit. Please review its current settings before applying this change.')
  if(origin==='voice'&&getSleepDeviceEditorState(accountId).dirty)throw new Error('Sleep Coach has an active manual edit. Please review its current settings before applying this change.')
}
/** Shared normal manual/voice writer for later SleepCoach integration. The
 * phone-global manual keys remain unchanged; no account-scoping migration. */
export async function writeSleepDeviceState(io:SleepDeviceIo,accountId:string,action:NativeDeviceAction,before:SleepDeviceSnapshot,origin:'voice'|'manual'){
  const input=validateNativeDeviceAction(action)
  if(!input.action.startsWith('sleep.'))throw new Error('Please select a sleep setting.')
  const key=input.action==='sleep.settings.update'?SLEEP_DEVICE_SETTINGS_KEY:SLEEP_DEVICE_ROUTINE_KEY
  const queueKey='sleep-device-state'
  const queued=storageQueues.get(queueKey)||Promise.resolve()
  const run=queued.catch(()=>{}).then(async()=>{
    active(io,accountId)
    assertSleepEditor(io,origin,accountId)
    const latest=await readSleepDeviceSnapshot(io);active(io,accountId)
    if(latest.revision!==before.revision||latest.settingsRaw!==before.settingsRaw||latest.routineRaw!==before.routineRaw)throw new Error('Sleep settings changed after review. Please review the latest values.')
    const next=input.action==='sleep.settings.update'?{...latest.settings,...input.values}:{...latest.routine,...input.values}
    const raw=JSON.stringify(next)
    assertSleepEditor(io,origin,accountId)
    await io.setItem(key,raw)
    active(io,accountId)
    if(await io.getItem(key)!==raw)throw new Error('The phone did not confirm the saved sleep setting. Please check Sleep Coach.')
    active(io,accountId)
    sleepRevision+=1
    const confirmed=await readSleepDeviceSnapshot(io);active(io,accountId)
    synchronizeSleepDeviceEditors(accountId,confirmed,origin)
    if(io.onSleepWrite)await io.onSleepWrite(confirmed,origin)
    active(io,accountId)
    const synchronized=await readSleepDeviceSnapshot(io);active(io,accountId)
    if(synchronized.settingsRaw!==confirmed.settingsRaw||synchronized.routineRaw!==confirmed.routineRaw)throw new Error('Sleep Coach changed its saved state while synchronizing. Please check the current settings before retrying.')
    return synchronized
  })
  storageQueues.set(queueKey,run)
  try{return await run}finally{if(storageQueues.get(queueKey)===run)storageQueues.delete(queueKey)}
}
function snapshot(io:NativeDeviceIo){const state=io.health.snapshot();return JSON.stringify({enabled:state.enabled,source:validateAppleHealthSource(state.source)})}
const captured=new WeakMap<NativeDeviceReview,string>()
function retain(review:NativeDeviceReview){captured.set(review,JSON.stringify(review));return review}
export async function captureNativeDeviceReview(token:string,accountId:string,raw:unknown,io:NativeDeviceIo):Promise<NativeDeviceReview>{
  active(io,accountId);if(!token||token.length>4096)throw new Error('Please review the device action first.')
  const action=validateNativeDeviceAction(raw)
  const review:NativeDeviceReview={token,accountId,action,before:'',expiresAt:io.now()+10*60*1000}
  if(action.action.startsWith('sleep.')){review.sleep=await readSleepDeviceSnapshot(io);active(io,accountId);review.before=sleepSnapshotKey(review.sleep);return retain(review)}
  if(!io.health.supported())throw new Error('Apple Health is unavailable on this device. Please use Devices.')
  if(io.health.snapshot().busy)throw new Error('Apple Health is already updating. Please wait and review again.')
  if(io.health.snapshot().userId!==undefined&&io.health.snapshot().userId!==accountId)throw new Error('Apple Health is still loading the current account. Please review again.')
  review.before=snapshot(io)
  if(action.action==='apple_health.import'){
    if(io.health.snapshot().ready===false)throw new Error('Apple Health settings are still loading. Please check Devices before importing.')
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone:io.timeZone()||'UTC',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(io.now()))
    const part=(type:string)=>parts.find(item=>item.type===type)?.value
    if(action.values.localDate>`${part('year')}-${part('month')}-${part('day')}`)throw new Error('Please choose today or an earlier activity date.')
  }
  if(action.action==='apple_health.source.select'){
    if(action.values.sourceName===null)review.source=null
    else{const sources=await io.health.readSources();active(io,accountId);const matches=sources.map(validateAppleHealthSource).filter((source):source is AppleHealthSource=>Boolean(source&&source.sourceName.toLowerCase()===action.values.sourceName.toLowerCase()));if(matches.length!==1)throw new Error('That Apple Health source is missing or ambiguous. Please choose an exact discovered source.');review.source=matches[0]}
  }
  active(io,accountId);if(snapshot(io)!==review.before)throw new Error('Apple Health settings changed during review. Please review again.');return retain(review)
}
function sleepSnapshotKey(value:SleepDeviceSnapshot){return JSON.stringify([value.settingsRaw,value.routineRaw,value.revision])}
type DeviceAttempt={action:string;before:string;expiresAt:number;promise?:Promise<NativeDeviceReceipt>;receipt?:NativeDeviceReceipt;after?:string;uncertain:boolean}
function digest(value:string){
  const encoded=encodeURIComponent(value),bytes:number[]=[]
  for(let i=0;i<encoded.length;i++){if(encoded[i]==='%'){bytes.push(parseInt(encoded.slice(i+1,i+3),16));i+=2}else bytes.push(encoded.charCodeAt(i))}
  const hash=new RawSha256();hash.update(new Uint8Array(bytes))
  return Array.from(hash.digest(),byte=>byte.toString(16).padStart(2,'0')).join('')
}
type ImportJournalEntry={digest:string;action:'apple_health.import';payloadDigest:string;before:string;after?:string;status:'pending'|'imported'|'no_data';expiresAt:number}
const journalKey=(accountId:string)=>`helfi_voice_health_import_receipts_v1:${encodeURIComponent(accountId)}`
async function readImportJournal(io:NativeDeviceIo,accountId:string){
  const raw=await io.getItem(journalKey(accountId));active(io,accountId)
  if(raw===null)return [] as ImportJournalEntry[]
  if(raw.length>100000)throw new Error('The device import history needs review before importing again.')
  let values:any;try{values=JSON.parse(raw)}catch{throw new Error('The device import history could not be checked. Please check Devices before importing again.')}
  if(!Array.isArray(values)||values.length>128)throw new Error('The device import history needs review before importing again.')
  const hex=(value:any)=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value)
  if(values.some((value:any)=>!value||typeof value!=='object'||Object.keys(value).some(key=>!['digest','action','payloadDigest','before','after','status','expiresAt'].includes(key))||!hex(value.digest)||value.action!=='apple_health.import'||!hex(value.payloadDigest)||!hex(value.before)||!['pending','imported','no_data'].includes(value.status)||value.status!=='pending'&&!hex(value.after)||!Number.isFinite(value.expiresAt)))throw new Error('The device import history could not be verified. Please check Devices before importing again.')
  if(new Set(values.map((value:ImportJournalEntry)=>value.digest)).size!==values.length)throw new Error('The device import history is ambiguous. Please check Devices.')
  return (values as ImportJournalEntry[]).filter(value=>value.expiresAt>=io.now())
}
async function storeImportJournal(io:NativeDeviceIo,accountId:string,entry:ImportJournalEntry){
  const values=(await readImportJournal(io,accountId)).filter(value=>value.digest!==entry.digest)
  if(values.length>=128)throw new Error('Too many recent device imports are awaiting verification. Please wait before importing again.')
  const raw=JSON.stringify([...values,entry]);active(io,accountId)
  await io.setItem(journalKey(accountId),raw);active(io,accountId)
  if(await io.getItem(journalKey(accountId))!==raw)throw new Error('The phone did not confirm the import-attempt record. Please check Devices before retrying.')
  active(io,accountId)
}
// Key by the signed authorization, not a component's temporary review object.
// Keep uncertain attempts for the full server-token lifetime; a lost response
// must not silently repeat an import after the screen captures a new object.
const attempts=new Map<string,DeviceAttempt>()
let healthQueue:Promise<unknown>=Promise.resolve()
export async function applyReviewedNativeDeviceAction(review:NativeDeviceReview,token:string,accountId:string,authorized:unknown,io:NativeDeviceIo):Promise<NativeDeviceReceipt>{
  const action=validateNativeDeviceAction(authorized)
  const check=()=>{active(io,accountId);if(captured.get(review)!==JSON.stringify(review)||review.accountId!==accountId||review.token!==token||io.now()>review.expiresAt||JSON.stringify(action)!==JSON.stringify(review.action))throw new Error('This device action changed or expired. Please review it again.')}
  check()
  for(const [key,value]of attempts)if(value.expiresAt<io.now()&&!value.promise)attempts.delete(key)
  const tokenDigest=digest(token),key=JSON.stringify([accountId,tokenDigest]),fingerprint=JSON.stringify(action)
  let attempt=attempts.get(key)
  if(attempt){
    if(attempt.action!==fingerprint)throw new Error('The authorized device action changed. Please request a new review.')
    if(attempt.promise)return attempt.promise
    if(attempt.uncertain)throw new Error('The previous device attempt could not be verified. Please check the device or activity log and request a new review before retrying.')
    if(!attempt.receipt&&attempt.before!==review.before)throw new Error('The device state changed after the first review. Please request a new review.')
  }else{
    if(attempts.size>=128)throw new Error('Too many device actions are awaiting verification. Please wait before requesting another review.')
    attempt={action:fingerprint,before:review.before,expiresAt:io.now()+30*60*1000,uncertain:false};attempts.set(key,attempt)
  }
  const record=attempt
  const complete=(receipt:NativeDeviceReceipt,after:string)=>{record.uncertain=false;record.receipt=receipt;record.after=digest(after);return receipt}
  const receipt=(status:NativeDeviceReceipt['status'],message:string,verified:boolean):NativeDeviceReceipt=>({kind:'native_device_action',id:action.action,entity:action.action.startsWith('apple_health.')?'apple_health':'device_settings',operation:action.action==='apple_health.import'?'import':'update',status,message,verified,...(action.action==='apple_health.import'?{localDate:action.values.localDate}:{})})
  const emptyMessage='Apple Health did not confirm an import. There may be no available active-energy data or read permission; please check Devices.'
  const importedMessage=`Apple Health confirmed the activity import for ${action.values.localDate}.`
  const journalEntry=(status:ImportJournalEntry['status'],after?:string):ImportJournalEntry=>({digest:tokenDigest,action:'apple_health.import',payloadDigest:digest(fingerprint),before:digest(record.before),...(after?{after:digest(after)}:{}),status,expiresAt:record.expiresAt})
  const completeImport=async(status:'imported'|'no_data')=>{
    const after=snapshot(io)
    await storeImportJournal(io,accountId,journalEntry(status,after));check()
    return complete(receipt(status,status==='imported'?importedMessage:emptyMessage,status==='imported'),after)
  }
  const execute=async():Promise<NativeDeviceReceipt>=>{
    check()
    if(action.action.startsWith('apple_health.')&&(!io.health.supported()||io.health.snapshot().userId!==undefined&&io.health.snapshot().userId!==accountId))throw new Error('Apple Health is unavailable or still loading this account. Please check Devices.')
    if(action.action==='apple_health.import'&&io.health.snapshot().ready===false)throw new Error('Apple Health settings are still loading. Please check Devices before importing.')
    if(action.action==='apple_health.import'&&!record.receipt){
      const saved=(await readImportJournal(io,accountId)).find(value=>value.digest===tokenDigest);check()
      if(saved){
        if(saved.payloadDigest!==digest(fingerprint)||saved.status==='pending'){record.uncertain=true;throw new Error('The previous import attempt needs checking. Please check the activity log and request a new review before importing again.')}
        record.receipt=receipt(saved.status,saved.status==='imported'?importedMessage:emptyMessage,saved.status==='imported');record.after=saved.after
      }
    }
    if(record.receipt){
      const current=action.action.startsWith('sleep.')?await readSleepDeviceSnapshot(io):null
      check()
      if(digest(current?sleepSnapshotKey(current):snapshot(io))!==record.after)throw new Error('This device setting changed after confirmation. Please review its current value.')
      return{...record.receipt,idempotentReplay:true}
    }
    if(action.action.startsWith('sleep.')){if(!review.sleep)throw new Error('Please review the current sleep settings.');const writerIo={...io,setItem:async(key:string,value:string)=>{record.uncertain=true;return io.setItem(key,value)}};const saved=await writeSleepDeviceState(writerIo,accountId,action,review.sleep,'voice');check();return complete(receipt('setting_saved','The sleep setting was saved and checked on this phone. This does not confirm that phone listening started.',true),sleepSnapshotKey(saved))}
    if(!io.health.supported()||io.health.snapshot().busy||snapshot(io)!==review.before)throw new Error('Apple Health state changed or is busy. Please review again.')
    if(action.action==='apple_health.import'){
      if(io.health.snapshot().ready===false)throw new Error('Apple Health settings are still loading. Please check Devices before importing.')
      const source=io.health.snapshot().source
      record.uncertain=true
      await storeImportJournal(io,accountId,journalEntry('pending'));check()
      const result=await io.health.refresh(true,action.values.localDate);check()
      if(snapshot(io)!==review.before)throw new Error('Apple Health settings changed while importing. Please check the activity log before retrying.')
      if(result===null||result?.imported===false)return completeImport('no_data')
      if(result?.imported!==true)throw new Error('Apple Health returned an invalid import result. Please check the activity log before retrying.')
      if(result.summary?.localDate!==action.values.localDate||(result.summary.selectedSource?.sourceId??null)!==(source?.sourceId??null)||typeof result.summary.activeEnergyKcal!=='number'||!Number.isFinite(result.summary.activeEnergyKcal)||result.summary.activeEnergyKcal<=0)throw new Error('Apple Health did not confirm the exact date and source reviewed. Please check the activity log.')
      return completeImport('imported')
    }
    if(action.action==='apple_health.automatic.update'){const source=io.health.snapshot().source;record.uncertain=true;await io.health.setEnabled(action.values.enabled);check();if(io.health.snapshot().enabled!==action.values.enabled||JSON.stringify(validateAppleHealthSource(io.health.snapshot().source))!==JSON.stringify(validateAppleHealthSource(source)))throw new Error('Apple Health did not confirm the automatic-update setting and source.')}
    else{
      const source=review.source??null
      if(source){const sources=await io.health.readSources();check();if(snapshot(io)!==review.before||io.health.snapshot().busy)throw new Error('Apple Health settings changed while checking the source. Please review again.');if(!sources.some(item=>item.sourceId===source.sourceId&&item.sourceName===source.sourceName))throw new Error('That Apple Health source is no longer available.')}
      const enabled=io.health.snapshot().enabled
      record.uncertain=true
      await io.health.setSource(source);check();if(io.health.snapshot().enabled!==enabled||JSON.stringify(validateAppleHealthSource(io.health.snapshot().source))!==JSON.stringify(source))throw new Error('Apple Health did not confirm the selected source and automatic-update setting.')
    }
    return complete(receipt('setting_saved','The Apple Health setting was saved and checked on this phone. Health permissions were not changed.',true),snapshot(io))
  }
  const run=action.action.startsWith('sleep.')?execute():healthQueue.catch(()=>{}).then(execute)
  if(action.action.startsWith('apple_health.'))healthQueue=run
  record.promise=run;try{return await run}finally{if(record.promise===run)delete record.promise}
}
