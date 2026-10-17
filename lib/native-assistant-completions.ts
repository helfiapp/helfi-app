import type { AssistantContext, AssistantPrepared } from './native-assistant-registry'
import { generalAssistantCompletionShape,sanitizeGeneralAssistantCompletion,sanitizeCompletionPreferenceValues,type GeneralAssistantCompletion } from '../native/src/voice/generalAssistantEffects'
type CompletedStep = {operation:string;status:string;actionId?:string;kind?:string;prepared?:AssistantPrepared;result?:unknown}
const object=(value:any):value is Record<string,any>=>!!value&&typeof value==='object'&&!Array.isArray(value)
/** Called only for the persisted server runtime state after normal verification.
 * Never project raw results, provider credentials, review tokens or draft URLs. */
export function completionForStep(context:AssistantContext,step:CompletedStep):GeneralAssistantCompletion|null{
  const result=step.result as any,data=step.prepared?.data as any,shape=generalAssistantCompletionShape(step.operation)
  if(!shape||step.kind&&step.kind!=='write'||step.status!=='completed'||!step.actionId||!object(result)||!object(data)||result.actorId!==context.actorId||result.actionId!==step.actionId||result.status!=='completed'||result.saved!==true||result.verified!==true&&!(shape.kind==='clinical_action'&&result.generated===true&&result.historySaved===true)||result.safeToClaimSaved===false||data.actorId!==context.actorId)return null
  let localDate:any,values:Record<string,any>|null|undefined
  if(data.family==='preferences'){
    if(shape.kind!=='preference_action'||data.action!==shape.action||data.normal?.action!==shape.action||data.normal?.userId!==context.actorId||result.action!==step.operation)return null
    values=sanitizeCompletionPreferenceValues(shape.action,data.normal.values);if(values===null)return null
    localDate=data.normal.values?.date
  }else if(data.family==='notifications'){
    if(shape.kind!=='notification_action'||data.action!==shape.action||data.normal?.action!==shape.action||data.normal?.userId!==context.actorId||result.action!==step.operation)return null
  }else if(data.family==='records'){
    const normal=data.normal
    if(shape.kind!=='record_action'||normal?.entity!==shape.entity||data.action!==shape.action||`${normal.entity}.${normal.operation}`!==shape.action||result.action!==step.operation||result.normal?.id!==normal.id)return null
    localDate=normal.changes?.localDate??normal.localDate
  }else if(data.operationId===step.operation){
    if(!['water','mood','exercise'].includes(shape.kind)||data.normal?.draft?.action!==shape.kind||result.kind!==shape.kind)return null
    localDate=data.normal.draft.localDate
  }else if(data.operation===step.operation&&['food.diary.create','food.recipe.log','recipe.library.create'].includes(step.operation)){
    if(result.operation!==step.operation||result.destination!==data.values?.destination||data.normal?.actorId!==context.actorId)return null
    if(step.operation==='recipe.library.create'?(result.destination!=='library'||data.normal.normalDraft?.recordAction?.entity!=='favorite'):result.destination!=='diary')return null
    localDate=data.values.localDate
  }else if(data.operation===step.operation&&['journal.health.create','journal.mood.create'].includes(step.operation)){
    localDate=data.values?.localDate??data.localDate
    if(result.entry?.localDate!==localDate||typeof result.entry?.id!=='string')return null
  }else if(data.operation===step.operation&&shape.kind==='clinical_action'){
    if(result.kind!=='clinical_action'||result.action!==step.operation||typeof result.analysisId!=='string')return null
    localDate=data.clock?.localDate
  }else return null
  if(localDate===undefined)localDate=result.entry?.localDate??result.localDate
  if(shape.entity&&['food','water','exercise','mood','journal','mood_journal'].includes(shape.entity)&&localDate===undefined)return null
  // Preferences and undated notification/library state have no invented day.
  return sanitizeGeneralAssistantCompletion({completionId:step.actionId,actorId:context.actorId,operation:step.operation,status:'completed',saved:true,verified:true,...shape,...(localDate!==undefined?{localDate}:{}),...(values!==undefined?{values}:{})})
}
