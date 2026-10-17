/** Plain text for already projected, owned assistant results. This formatter
 * neither verifies a result nor changes its state. Unknown fields are omitted;
 * exact user notes, recipe instructions and stored clinical text stay intact. */
type Row = Record<string, any>
export type AssistantReadableStep = {
  id?: string; operation: string; kind?: string; status: string; result?: unknown; unverifiedResult?: unknown
  review?: { summary?: string } | null; missing?: readonly string[]
  clarification?: { message?: string } | null
}
export type AssistantReadableView = { status?: string; steps: readonly AssistantReadableStep[]; currentStepIds?: readonly string[] }
const record = (value: unknown): Row => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Row : {}
const text = (value: unknown): string => typeof value === 'string' && value.trim() ? value : ''
const numeric = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const present = (value: unknown) => value !== null && value !== undefined && value !== ''
const join = (values: Array<string | undefined | false>) => values.filter(Boolean).join('\n')
const inline = (values: Array<string | undefined | false>) => values.filter(Boolean).join(' · ')
const quantity = (value: unknown, unit: string) => numeric(value) ? `${value} ${unit}` : ''
const scalar = (value: unknown): string => value == null ? 'Not recorded' : typeof value === 'boolean' ? value ? 'Yes' : 'No' : typeof value === 'string' ? value : numeric(value) ? String(value) : ''
const label = (key: string) => key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').replace(/^./, letter => letter.toUpperCase())
const when = (row: Row) => {
  const selected=text(row.localDate)||text(row.date)
  if(selected) return selected
  const timestamp=text(row.createdAt)||text(row.timestamp)
  const match=timestamp.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?Z$/)
  return match?`${match[1]} at ${match[2]} UTC`:timestamp
}
const fields = (row: Row, labels: Record<string, string>) => Object.entries(labels).filter(([key]) => Object.hasOwn(row, key)).map(([key, title]) => `${title}: ${Array.isArray(row[key]) ? row[key].map(scalar).filter(Boolean).join(', ') || 'None recorded' : scalar(row[key])}`).join('\n')
const labels: Record<string, string> = {
  firstName: 'First name', lastName: 'Last name', bio: 'About you', dateOfBirth: 'Date of birth', birthdate: 'Date of birth', gender: 'Gender', weight: 'Weight', height: 'Height', bodyType: 'Body type', exerciseFrequency: 'Exercise frequency', exerciseTypes: 'Exercise types', goals: 'Goals', goalChoice: 'Goal', goalIntensity: 'Goal pace', goalMacroMode: 'Nutrition target mode', diabetesType: 'Diabetes type', dietTypes: 'Diet preferences', allergies: 'Allergies', goalCalorieTarget: 'Daily calorie target', goalTargetWeightKg: 'Target weight (kg)', goalPaceKgPerWeek: 'Weight change per week (kg)', goalFiberTarget: 'Daily fibre target (g)', goalSugarMax: 'Daily sugar limit (g)', healthIssues: 'Health issues', healthProblems: 'Health concerns', additionalInfo: 'Additional information', proteinPct: 'Protein share', carbPct: 'Carbohydrate share', fatPct: 'Fat share', amount: 'Amount', unit: 'Unit', localDate: 'Date', localTime: 'Time', content: 'Note', score: 'Mood score', mood: 'Mood score', note: 'Note', tags: 'Tags', durationMinutes: 'Duration (minutes)', distanceKm: 'Distance (km)', caloriesKcal: 'Calories', targetMl: 'Water goal (mL)', issueId: 'Check-in item', analysisId: 'Symptom note', exerciseTypeId: 'Exercise type', symptoms: 'Symptoms', duration: 'Duration', notes: 'Notes', question: 'Question', name: 'Name', title: 'Title', recipe: 'Recipe', ingredients: 'Ingredients', meal: 'Meal', servingsEaten: 'Servings eaten', query: 'Search', start: 'Start date', end: 'End date', date: 'Date', value: 'Rating', enabled: 'Enabled', startTime: 'Start time', endTime: 'End time', timezone: 'Time zone', timeZone: 'Time zone', country: 'Country', limit: 'Number of results', offset: 'Next results', status: 'Status', provider: 'Device', reportId: 'Report', periodStart: 'Report start date', periodEnd: 'Report end date', section: 'Report section', changes: 'Requested changes', destination: 'Destination', latest: 'Most recent note', threadId: 'Symptom conversation', context: 'Mood details', intensityPercent: 'Mood intensity', feelings: 'Feelings', energyLevel: 'Energy level', sleepQuality: 'Sleep quality', nutrition: 'Nutrition', supplements: 'Supplements', medicationEffect: 'Medication effect', physicalActivity: 'Physical activity', speedKph: 'Speed (km/h)', steps: 'Steps', caloriesOverride: 'Calories', label: 'Label', category: 'Category', search: 'Search', intensity: 'Intensity', prompt: 'Prompt', template: 'Template', isNa: 'Not applicable', localDateStart: 'Start date', localDateEnd: 'End date',
}
const subset = (keys: string[]) => Object.fromEntries(keys.map(key=>[key,labels[key]]))
Object.assign(labels, { id: 'Saved item', budgetSourceVersion: 'Current food information', sourceVersion: 'Current saved information' })
const profileLabels=subset(['firstName','lastName','bio','dateOfBirth','gender'])
const healthLabels=subset(['gender','weight','height','birthdate','bodyType','exerciseFrequency','exerciseTypes','goals','goalChoice','goalIntensity','goalMacroMode','diabetesType','dietTypes','allergies','goalCalorieTarget','goalTargetWeightKg','goalPaceKgPerWeek','goalFiberTarget','goalSugarMax'])
function incomplete(data: Row, count?: number): string {
  const total = numeric(data.totalCount) ? data.totalCount : numeric(data.totalMatched) ? data.totalMatched : undefined
  if (data.truncated === true || data.sourceMayHaveMore === true || data.complete === false || total !== undefined && count !== undefined && total > count) return total !== undefined && count !== undefined ? `Showing ${count} of ${total} records. This is not the complete list.` : 'This is a partial list. More records may be available.'
  return ''
}
function nutrition(value: unknown): string {
  const row = record(value), mappings: Array<[string[], string, string]> = [[['calories','calories_kcal'], 'Calories', ''], [['protein_g','protein'], 'Protein', 'g'], [['carbs_g','carbs'], 'Carbohydrates', 'g'], [['fat_g','fat'], 'Fat', 'g'], [['fiber_g','fiber'], 'Fibre', 'g'], [['sugar_g','sugar'], 'Sugar', 'g']]
  return mappings.filter(([keys]) => keys.some(key => Object.hasOwn(row,key))).map(([keys, title, unit]) => { const key = keys.find(key => Object.hasOwn(row,key))!; return `${title}: ${numeric(row[key]) ? `${row[key]}${unit ? ` ${unit}` : ''}` : 'Not recorded'}` }).join(' · ')
}
function recipe(value: unknown): string {
  const row=record(value)
  return join([text(row.title), numeric(row.servings ?? row.yieldServings) && `Recipe makes ${row.servings ?? row.yieldServings} servings.`, Array.isArray(row.ingredients) && row.ingredients.length ? `Ingredients:\n${row.ingredients.map((item: unknown) => { if(typeof item==='string') return `• ${item}`; const ingredient=record(item); return `• ${inline([quantity(ingredient.quantity,text(ingredient.unit)),text(ingredient.name)])}` }).join('\n')}` : '', Array.isArray(row.steps) && row.steps.length ? `Steps:\n${row.steps.filter((step:unknown)=>typeof step==='string').map((step:string,index:number)=>`${index+1}. ${step}`).join('\n')}` : '', quantity(row.prepMinutes,'minutes preparation'), quantity(row.cookMinutes,'minutes cooking')])
}
function journal(row: Row, saved: boolean): string {
  return join([inline([saved ? 'Saved journal entry' : 'Journal entry', text(row.title), when(row)]), text(row.content), Array.isArray(row.tags) && row.tags.length ? `Tags: ${row.tags.filter((v:unknown)=>typeof v==='string').join(', ')}` : '', text(row.prompt) && `Prompt: ${row.prompt}`, text(row.template) && `Template: ${row.template}`, numeric(row.imageCount) && row.imageCount>0 && `${row.imageCount} attached images`, numeric(row.audioCount) && row.audioCount>0 && `${row.audioCount} audio attachments`])
}
// These are content fields in the stored symptom analysis. Arbitrary extra
// metadata accepted by older analysis shapes is never printed as a fallback.
const clinicalLabels: Record<string,string> = { summary:'Summary', analysisText:'Full analysis', possibleCauses:'Possible causes', name:'Name', whyLikely:'Reason given', description:'Description', explanation:'Explanation', reason:'Reason', likelihood:'Likelihood', severity:'Severity', urgency:'Urgency', redFlags:'Warning signs', nextSteps:'Next steps', disclaimer:'Disclaimer', recommendations:'Recommendations', title:'Title', text:'Details', details:'Details', evidence:'Evidence', advice:'Advice', action:'Suggested action', whatToDo:'What to do', symptoms:'Symptoms', duration:'Duration', notes:'Notes', question:'Question', answer:'Answer', response:'Response', assistant:'Response' }
function clinical(value: unknown, depth=0): string {
  if (typeof value==='string') return value
  if (value===null) return 'Not recorded'
  if (numeric(value) || typeof value==='boolean') return scalar(value)
  if(depth>12) return 'Further stored detail is available in Symptom Notes.'
  if(Array.isArray(value)) return value.map(item=>clinical(item,depth+1)).filter(Boolean).map(item=>`• ${item}`).join('\n')
  return Object.entries(record(value)).filter(([key])=>Object.hasOwn(clinicalLabels,key)).map(([key,item])=>{ const content=clinical(item,depth+1); return content ? `${clinicalLabels[key]}:${typeof item==='object' && item!==null ? '\n' : ' '}${content}` : '' }).filter(Boolean).join('\n')
}
function symptoms(result: Row): string {
  if(Array.isArray(result.analyses)) return join([result.analyses.length ? `${result.analyses.length} symptom ${result.analyses.length===1?'note':'notes'}:` : 'No symptom notes were found for this selection.', ...result.analyses.map((raw:unknown)=>{const row=record(raw);return join([when(row),Array.isArray(row.symptoms)?`Symptoms: ${row.symptoms.filter((v:unknown)=>typeof v==='string').join(', ')}`:'',text(row.duration)&&`Duration: ${row.duration}`,text(row.notes)&&`Notes: ${row.notes}`,clinical(row.analysis)])}),incomplete(result,result.analyses.length)])
  return join([text(result.message),clinical(result.analysis),text(result.assistant)])
}
function list(operation: string, data: Row): string {
  const rows = Array.isArray(data.entries) ? data.entries : Array.isArray(data.items) ? data.items : []
  const names:Record<string,string>={'water.list':'Water entries','exercise.list':'Exercise entries','exercise.types':'Exercise types','mood.entries.list':'Mood entries','journal.health.list':'Health Journal entries','journal.mood.list':'Mood Journal entries','notifications.inbox.list':'Notifications','food.diary.list':'Food diary entries'}
  const header=`${names[operation] || 'Records'}${text(data.localDate)?` for ${data.localDate}`:text(data.start)&&text(data.end)?` from ${data.start} to ${data.end}`:''}: ${rows.length}${numeric(data.totalCount)&&data.totalCount!==rows.length?` shown of ${data.totalCount}`:''}.`
  return join([header, ...rows.map((raw:unknown)=>{
    const row=record(raw)
    if(operation.startsWith('journal.')) return journal(row,false)
    if(operation==='water.list') return `• ${inline([numeric(row.amount)&&text(row.unit)?`${row.amount} ${row.unit}`:quantity(row.amountMl,'mL'),text(row.label),when(row)])}`
    if(operation==='exercise.list') return `• ${inline([text(row.name)||text(row.label)||'Exercise',quantity(row.durationMinutes,'minutes'),quantity(row.distanceKm,'km'),quantity(row.calories,'calories'),when(row)])}`
    if(operation==='exercise.types') return `• ${inline([text(row.name),text(row.category),text(row.intensity)])}`
    if(operation==='mood.entries.list') return join([`• ${inline([numeric(row.mood??row.score)?`Mood score: ${row.mood??row.score} of 7`:'Mood score not recorded',when(row)])}`,text(row.note),Array.isArray(row.tags)&&row.tags.length?`Tags: ${row.tags.filter((v:unknown)=>typeof v==='string').join(', ')}`:''])
    if(operation==='notifications.inbox.list') return join([`• ${inline([text(row.title),when(row),row.status==='unread'?'Unread':row.status==='read'?'Read':''])}`,text(row.body)])
    return join([`• ${inline([text(row.label)||text(row.name),text(row.meal),when(row)])}`,nutrition(row.nutrition),text(row.content)])
  }),incomplete(data,rows.length)])
}
function checkins(data: Row): string {
  const issues=Array.isArray(data.issues)?data.issues:[],ratings=Array.isArray(data.ratings)?data.ratings:[]
  return join([`Check-in items${text(data.localDate)?` for ${data.localDate}`:''}: ${issues.length}.`,...issues.map((raw:unknown)=>{const issue=record(raw), rating=ratings.map(record).find(row=>row.issueId===issue.id);return join([`• ${text(issue.name)||'Check-in item'}${rating?rating.isNa===true?': Not applicable':numeric(rating.value)?`: ${rating.value} of 6`:'':Array.isArray(data.ratings)?': No rating recorded':''}`,text(rating?.note)])}),incomplete(data,issues.length)])
}
function resultText(step: AssistantReadableStep): string {
  const result=record(step.result),data=record(result.data),message=text(result.message)
  if(step.operation.startsWith('symptoms.')) return symptoms(result)
  if(step.operation.startsWith('journal.') && Object.keys(record(result.entry)).length) return journal(record(result.entry),step.kind==='write'&&step.status==='completed')
  if(message) return join([message,Object.keys(record(result.recipe)).length?recipe(result.recipe):'',incomplete(data,Array.isArray(data.entries)?data.entries.length:undefined)])
  if(['profile.read','health_setup.saved.read'].includes(step.operation)) return join([fields(record(data.profile),profileLabels),fields(record(data.saved),healthLabels),fields(record(record(data.saved).healthSituations),subset(['healthIssues','healthProblems','additionalInfo'])),Object.keys(record(record(data.saved).goalMacroSplit)).length?`Nutrition target shares:\n${fields(record(record(data.saved).goalMacroSplit),subset(['proteinPct','carbPct','fatPct']))}`:'']) || 'No profile details were recorded.'
  if(step.operation==='checkin.issues.read'||step.operation==='checkin.today') return checkins(data)
  if(Array.isArray(data.entries)||Array.isArray(data.items)) return list(step.operation,data)
  if(step.operation==='food.diary.detail') {const entry=record(data.entry);return join([inline([text(entry.label),text(entry.meal),when(entry)]),nutrition(entry.nutrition),text(entry.content),recipe(record(entry.nutrition).__importRecipe)])}
  if(step.operation==='food.diary.totals') return join([`Food totals${text(data.localDate)?` for ${data.localDate}`:''}${numeric(data.entryCount)?` (${data.entryCount} entries)`:''}:`,nutrition(data.totals)])
  if(text(step.result)) return text(step.result)
  // A read never receives the write-success fallback, even if an old result
  // happens to carry saved:true. State and kind come from the host registry.
  return step.kind==='write'?'The requested change is confirmed.':'The information was checked, but has no readable details here. Please open its normal Helfi screen.'
}
export function formatNativeAssistantView(view: AssistantReadableView | null, question?: string): string {
  if(text(question)) return question!
  if(!view) return 'Please give your request.'
  const active=view.steps.find(step=>!['completed','cancelled'].includes(step.status))
  if(text(active?.review?.summary)) return active!.review!.summary!
  if(text(active?.clarification?.message)) return active!.clarification!.message!
  if(active?.status==='needs_details') return `Please provide: ${active.missing?.map(field=>field.replace(/^values\./,'').split('.').map(part=>labels[part]||label(part)).join(' — ')).join(', ') || 'the missing information'}.`
  if(active?.status==='uncertain'||active?.status==='executing') {
    const generated=record(active.unverifiedResult)
    return join(['The saved result has not been confirmed. I will check the existing result before another save is considered.',active.operation.startsWith('symptoms.')&&generated.generated===true&&generated.saved===false?clinical(generated.analysis):''])
  }
  if(active?.status==='awaiting_person') return 'Please complete the requested step on your device, then check its result.'
  const current=view.currentStepIds===undefined?null:new Set(view.currentStepIds)
  const results=view.steps.filter(step=>step.status==='completed'&&(!current||step.id!==undefined&&current.has(step.id))).map(resultText).filter(Boolean)
  return results.join('\n\n') || (view.status==='stopped'?'This request has stopped.':'Please continue with your request.')
}
