/** Pure completion validation/event descriptions. No native runtime or storage. */
export type GeneralAssistantCompletion = {
  completionId: string; actorId: string; operation: string; status: 'completed'; saved: true; verified: true
  kind: string; action: string; entity?: string; localDate?: string; values?: Record<string, any>
}
export type GeneralAssistantCompletionEvent = { name: string; payload: Record<string, any> }
type Rule = number | 'number' | 'boolean' | readonly string[] | { [key: string]: Rule }
const profile: Record<string,Rule> = {firstName:160,lastName:160,bio:2000,dateOfBirth:10,gender:['male','female','other','prefer-not-to-say']}
const reminder: Record<string,Rule> = {enabled:'boolean',time1:5,time2:5,time3:5,time4:5,frequency:'number',timezone:100}
const health: Record<string,Rule> = {gender:['male','female'],weight:'number',height:'number',birthdate:10,bodyType:['ectomorph','mesomorph','endomorph'],exerciseFrequency:160,diabetesType:['','type1','type2','prediabetes'],healthSituations:{healthIssues:4000,healthProblems:4000,additionalInfo:4000,skipped:'boolean'},healthCheckSettings:{enabled:'boolean',frequency:['always','high','never'],dailyCap:'number',thresholds:{sugar:'number',carbs:'number',fat:'number'}}}
const lists = ['exerciseTypes','goals','dietTypes','allergies']
const goals: Record<string,Rule> = {goalChoice:['lose weight','gain weight','maintain weight','tone up','get shredded'],goalIntensity:['mild','standard','aggressive'],goalTargetWeightKg:'number',goalTargetWeightUnit:['kg','lb'],goalPaceKgPerWeek:'number',goalCalorieTarget:'number',goalMacroMode:['auto','manual'],goalMacroSplit:{proteinPct:'number',carbPct:'number',fatPct:'number'},goalFiberTarget:'number',goalSugarMax:'number'}
const checkin: Record<string,Rule> = {date:10,issueId:120,value:'number',note:2000,isNa:'boolean'}
const preferenceActions: Record<string,string> = {'profile.update':'profile.update','health_setup.update':'health_setup.update','goals.update':'goals.update','water.goal.set':'hydration_goal.set','water.goal.reset':'hydration_goal.reset','reminders.checkin.update':'checkin_reminders.update','reminders.mood.update':'mood_reminders.update','notifications.quiet_hours.update':'quiet_hours.update','checkin.rating.set':'checkin.rating.set','checkin.rating.update':'checkin.rating.update','checkin.rating.delete':'checkin.rating.delete'}
const rules: Record<string,Record<string,Rule>> = {'profile.update':profile,'health_setup.update':health,'goals.update':goals,'hydration_goal.set':{targetMl:'number'},'hydration_goal.reset':{},'checkin_reminders.update':reminder,'mood_reminders.update':reminder,'quiet_hours.update':{enabled:'boolean',startTime:5,endTime:5,timezone:100},'checkin.rating.set':checkin,'checkin.rating.update':checkin,'checkin.rating.delete':{date:10,issueId:120}}
const object = (value: any): value is Record<string,any> => !!value && typeof value === 'object' && !Array.isArray(value)
const text = (value: any,max: number) => typeof value === 'string' && value.length <= max && !value.includes('\0')
const calendar = (value: any) => text(value,10) && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0,10) === value
const uuid = (value: any) => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value)
function field(value: any,rule: Rule): any {
  if (typeof rule === 'number') return text(value,rule) ? value : undefined
  if (rule === 'number') return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1000000 ? value : undefined
  if (rule === 'boolean') return typeof value === 'boolean' ? value : undefined
  if (Array.isArray(rule)) return rule.includes(value) ? value : undefined
  if (!object(value)) return undefined
  const result: Record<string,any> = {}
  for (const [key,next] of Object.entries(rule)) { const checked=field(value[key],next as Rule); if(checked!==undefined)result[key]=checked }
  return result
}
/** Only typed normal setting fields cross. No auth, media URLs or draft data. */
export function sanitizeCompletionPreferenceValues(action: string,raw: unknown): Record<string,any> | null {
  if (!object(raw) || !rules[action]) return null
  const result=field(raw,rules[action]) as Record<string,any>
  for(const key of ['dateOfBirth','birthdate','date'])if(result[key]!==undefined&&!calendar(result[key]))delete result[key]
  if(action==='health_setup.update')for(const name of lists)for(const suffix of ['','Add','Remove']){
    const key=name+suffix,value=raw[key]
    if(Array.isArray(value)&&value.length<=50&&value.every(item=>text(item,160)&&item.trim()))result[key]=[...value]
  }
  return result
}
export function generalAssistantCompletionShape(operation: string): {kind:string;action:string;entity?:string} | null {
  if(preferenceActions[operation])return{kind:'preference_action',action:preferenceActions[operation]}
  if(/^notifications\.(?:mark_read|delete|mark_all_visible_read|delete_all_visible)$/.test(operation))return{kind:'notification_action',action:operation,entity:'notification'}
  const record=operation.match(/^(water|exercise|mood\.entries|journal\.health|journal\.mood)\.(update|delete)$/)
  if(record){const entities:Record<string,string>={'water':'water','exercise':'exercise','mood.entries':'mood','journal.health':'journal','journal.mood':'mood_journal'},entity=entities[record[1]];return{kind:'record_action',action:`${entity}.${record[2]}`,entity}}
  if(['water.create','exercise.create','mood.create'].includes(operation)){const entity=operation.split('.')[0];return{kind:entity,action:operation,entity}}
  if(operation==='journal.health.create')return{kind:'journal',action:operation,entity:'journal'}
  if(operation==='journal.mood.create')return{kind:'mood_journal',action:operation,entity:'mood_journal'}
  if(operation==='food.diary.create'||operation==='food.recipe.log')return{kind:'food',action:'food_build_meal',entity:'food'}
  if(operation==='recipe.library.create')return{kind:'record_action',action:'favorite.create',entity:'favorite'}
  if(operation==='symptoms.analyze')return{kind:'clinical_action',action:operation,entity:'symptom_note'}
  return null
}
export function sanitizeGeneralAssistantCompletion(raw: unknown): GeneralAssistantCompletion | null {
  if(!object(raw)||!uuid(raw.completionId)||!text(raw.actorId,200)||!raw.actorId||!text(raw.operation,100)||raw.status!=='completed'||raw.saved!==true||raw.verified!==true)return null
  const expected=generalAssistantCompletionShape(raw.operation)
  if(!expected||raw.kind!==expected.kind||raw.action!==expected.action||raw.entity!==expected.entity||raw.localDate!==undefined&&!calendar(raw.localDate))return null
  const values=expected.kind==='preference_action'?sanitizeCompletionPreferenceValues(expected.action,raw.values):undefined
  if(expected.kind==='preference_action'&&values===null)return null
  return{completionId:raw.completionId,actorId:raw.actorId,operation:raw.operation,status:'completed',saved:true,verified:true,...expected,...(raw.localDate!==undefined?{localDate:raw.localDate}:{}),...(values?{values}:{})}
}
/** Caller keeps returned seenIDs per account/session and emits these only after
 * accepting the server response for that same current signed-in account. */
export function generalAssistantCompletionEvents(view: unknown,accountId: string,seenIDs: readonly string[] = []): {events:GeneralAssistantCompletionEvent[];seenIDs:string[]} {
  const seen=[...new Set(seenIDs.filter(uuid))].slice(-200),events:GeneralAssistantCompletionEvent[]=[],result=()=>({events,seenIDs:seen.slice(-200)})
  if(!accountId||!object(view)||view.actorId!==accountId||!Array.isArray(view.steps)||view.steps.length>20||!Array.isArray(view.currentStepIds)||view.currentStepIds.length>20||new Set(view.currentStepIds).size!==view.currentStepIds.length)return result()
  const ids=view.steps.map((step:any)=>step?.id)
  if(ids.some((id:any)=>typeof id!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(id))||new Set(ids).size!==ids.length||view.currentStepIds.some((id:any)=>typeof id!=='string'||!ids.includes(id)))return result()
  const completionIDs=view.completionStepIds??view.currentStepIds
  if(!Array.isArray(completionIDs)||completionIDs.length>20||new Set(completionIDs).size!==completionIDs.length||view.currentStepIds.some((id:any)=>!completionIDs.includes(id))||completionIDs.some((id:any)=>typeof id!=='string'||!ids.includes(id)||!view.currentStepIds.includes(id)&&!view.steps.some((step:any)=>step.id===id&&step.kind==='write'&&step.status==='completed')))return result()
  const current=new Set(completionIDs)
  for(const step of view.steps){
    if(!current.has(step.id)||step.kind!=='write'||step.status!=='completed'||step.actorId!==undefined&&step.actorId!==accountId)continue
    const completion=sanitizeGeneralAssistantCompletion(step.completion)
    if(!completion||completion.actorId!==accountId||completion.operation!==step.operation||completion.completionId!==step.completionId||seen.includes(completion.completionId))continue
    const {actorId,status,saved,verified,...details}=completion,payload={source:'voice-assistant',accountId,...details}
    events.push({name:'helfi:voice-action-saved',payload})
    const entity=completion.entity,event=completion.kind==='preference_action'?'helfi:settings-changed':completion.kind==='notification_action'?'helfi:notifications-inbox-changed':entity&&['food','water','exercise','favorite','custom_food'].includes(entity)?'helfi:food-log-changed':entity==='journal'?'helfi:health-journal-changed':entity==='mood_journal'?'helfi:mood-journal-changed':entity==='mood'?'helfi:mood-log-changed':entity==='symptom_note'?'helfi:symptom-notes-changed':null
    if(event)events.push({name:event,payload})
    events.push({name:'helfi:voice-action-completed',payload})
    seen.push(completion.completionId)
  }
  return result()
}
