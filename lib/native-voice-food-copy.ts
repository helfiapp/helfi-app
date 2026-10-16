import crypto from 'crypto'

function stable(value:any):any{if(value instanceof Date)return value.toISOString();if(Array.isArray(value))return value.map(stable);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().filter(key=>value[key]!==undefined).map(key=>[key,stable(value[key])]));return value}
function stamp(value:any){if(value===null||value===undefined)return null;const date=new Date(value);if(!Number.isFinite(date.getTime()))throw new Error('A copied entry needs its saved time reviewed.');return date.toISOString()}
export function nativeVoiceFoodCopyVersion(row:any){
  if(!row||typeof row.id!=='string'||!row.id||typeof row.userId!=='string'||!row.userId)throw new Error('A copied food needs its account and saved ID checked.')
  return crypto.createHash('sha256').update(JSON.stringify(stable({id:row.id,userId:row.userId,name:row.name??null,description:row.description??null,imageUrl:row.imageUrl??null,nutrients:row.nutrients??null,items:row.items??null,localDate:row.localDate??null,meal:row.meal??null,category:row.category??null,createdAt:stamp(row.createdAt)}))).digest('hex')
}
export function nativeVoiceFoodCopyWaterVersion(row:any){
  if(!row||typeof row.id!=='string'||!row.id||typeof row.userId!=='string'||!row.userId||typeof row.amount!=='number'||!Number.isFinite(row.amount)||row.amount<=0||typeof row.amountMl!=='number'||!Number.isFinite(row.amountMl)||row.amountMl<=0||row.amountMl>10000||!['ml','l','oz'].includes(row.unit))throw new Error('A copied drink needs its saved hydration amount checked.')
  const expected=Math.round(row.amount*({ml:1,l:1000,oz:29.5735} as any)[row.unit]*10)/10
  if(Math.abs(expected-row.amountMl)>.11)throw new Error('The saved drink volume is inconsistent. Please review this drink before copying.')
  return crypto.createHash('sha256').update(JSON.stringify(stable({id:row.id,userId:row.userId,amount:row.amount,unit:row.unit,amountMl:row.amountMl,label:row.label??null,category:row.category??null,localDate:row.localDate??null,createdAt:stamp(row.createdAt)}))).digest('hex')
}
function walk(value:any,visit:(key:string,value:any)=>any):any{
  if(typeof value==='string'&&/^\s*[\[{]/.test(value)){let parsed:any;try{parsed=JSON.parse(value)}catch{return value}return JSON.stringify(walk(parsed,visit))}
  if(Array.isArray(value))return value.map(item=>walk(item,visit))
  if(!value||typeof value!=='object')return value
  return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,['__waterLogId','waterLogId'].includes(key)?visit(key,item):walk(item,visit)]))
}
export function nativeVoiceFoodCopyWaterId(row:any){
  const ids=new Set<string>()
  walk([row?.nutrients,row?.items],(_key,value)=>{if(value===null||value===undefined||value==='')return value;if(typeof value!=='string'||!value.trim())throw new Error('This drink has an invalid hydration link. Please review it before copying.');ids.add(value);return value})
  if(ids.size>1)throw new Error('This drink has more than one hydration link. Please review it before copying.')
  const hasDrinkMarker=(value:any):boolean=>{
    if(typeof value==='string'&&/^\s*[\[{]/.test(value)){try{return hasDrinkMarker(JSON.parse(value))}catch{return false}}
    if(Array.isArray(value))return value.some(hasDrinkMarker)
    return Boolean(value&&typeof value==='object'&&Object.entries(value).some(([key,item])=>(key==='__drinkType'||key==='__drinkAmountMl')&&item!==null&&item!==undefined||hasDrinkMarker(item)))
  }
  if(!ids.size&&hasDrinkMarker([row?.nutrients,row?.items]))throw new Error(`“${String(row?.name||'This drink').slice(0,120)}” is missing its hydration link. Please review it before copying.`)
  return [...ids][0]||null
}
export function relinkNativeVoiceCopiedDrink(value:any,oldId:string,newId:string){return walk(value,(_key,id)=>id===oldId?newId:id)}
export function nativeVoiceFoodCopyReview(rows:any[],waters:any[]){
  const details=rows.map(row=>{
    const nutrition=row.nutrients&&typeof row.nutrients==='object'?row.nutrients:{},calories=nutrition.calories_kcal??nutrition.calories
    const portion=nutrition.__portionControlEnabled===true?`${nutrition.__portionAmount??''} ${nutrition.__portionUnit||'serving'}`:''
    return `${String(row.name||'Food')}${portion?` (${portion})`:''}${typeof calories==='number'&&Number.isFinite(calories)?`, ${calories} kcal`:''}`
  }).join('; ')
  const drinks=waters.length?` This also copies hydration: ${waters.map(row=>`${row.amount} ${row.unit} ${row.label||'drink'}`).join('; ')}.`:''
  return `${details}.${drinks}`
}
