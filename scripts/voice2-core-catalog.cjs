#!/usr/bin/env node
'use strict'
// Metadata inspection ONLY. Actual registry factories/pure dependencies run in
// a strict VM. App/auth/provider/storage modules and every handler are denied.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),crypto=require('node:crypto')
const root=path.resolve(__dirname,'..')
const sources=[
 'lib/native-assistant-registry.ts','lib/native-assistant-catalog.ts','lib/native-assistant-domain-adapters.ts','lib/native-assistant-action-id.ts',
 'lib/native-assistant-core-actions.ts','lib/native-assistant-current-state.ts','lib/native-assistant-record-reads.ts','lib/native-assistant-clinical-actions.ts','lib/native-assistant-food-actions.ts',
 'lib/daily-targets.ts','native/src/lib/foodDiaryEntries.ts','native/src/lib/mealPortions.ts','native/src/lib/nutrientValues.ts','lib/food/nutrient-values.ts',
 'lib/native-voice-resolved-food.ts','lib/native-voice-recipe-metadata.ts',
]
const families={core:['createNativeAssistantCoreActions','lib/native-assistant-core-actions.ts'],currentDay:['createNativeAssistantCurrentStateOperation','lib/native-assistant-current-state.ts'],reads:['createNativeAssistantRecordReadOperations','lib/native-assistant-record-reads.ts'],clinical:['createAssistantClinicalOperations','lib/native-assistant-clinical-actions.ts'],food:['createNativeAssistantFoodOperations','lib/native-assistant-food-actions.ts']}
const clone=value=>JSON.parse(JSON.stringify(value))
function verifyAppAssembly(source){
 const ast=ts.createSourceFile('lib/native-assistant-app.ts',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS),imports=new Map(),declarations=new Map()
 for(const statement of ast.statements)if(ts.isImportDeclaration(statement)&&statement.importClause?.namedBindings&&ts.isNamedImports(statement.importClause.namedBindings))for(const item of statement.importClause.namedBindings.elements)imports.set(item.name.text,{name:(item.propertyName||item.name).text,source:statement.moduleSpecifier.text})
 const app=ast.statements.find(statement=>ts.isFunctionDeclaration(statement)&&statement.name?.text==='createNativeAssistantApp');assert(app?.body,'App factory disappeared')
 for(const statement of app.body.statements)if(ts.isVariableStatement(statement))for(const declaration of statement.declarationList.declarations)if(ts.isIdentifier(declaration.name))declarations.set(declaration.name.text,declaration.initializer)
 const call=(node,name)=>ts.isCallExpression(node)&&ts.isIdentifier(node.expression)&&node.expression.text===name
 for(const [variable,[factory,file]]of Object.entries(families)){
  assert.deepEqual(imports.get(factory),{name:factory,source:'./'+path.basename(file,'.ts')},'App factory import changed: '+factory)
  let initializer=declarations.get(variable);assert(initializer,'App factory variable changed: '+variable)
  if(variable==='core'){
   assert(ts.isCallExpression(initializer)&&ts.isPropertyAccessExpression(initializer.expression)&&initializer.expression.name.text==='map','Core wrapper must retain original operation metadata')
   // This app wrapper installs recovery only. Metadata changes must be audited
   // rather than silently ignored by this factory-only collector.
   const mapper=initializer.arguments[0];assert(mapper&&ts.isArrowFunction(mapper),'Unknown core wrapper')
   const objects=[];function visit(node){if(ts.isReturnStatement(node)&&node.expression&&ts.isObjectLiteralExpression(node.expression))objects.push(node.expression);ts.forEachChild(node,visit)}visit(mapper)
   const wrapped=objects.find(node=>node.properties.some(item=>ts.isSpreadAssignment(item)&&item.expression.getText(ast)==='operation'))
   assert(wrapped&&wrapped.properties.every(item=>ts.isSpreadAssignment(item)&&item.expression.getText(ast)==='operation'||ts.isPropertyAssignment(item)&&item.name.getText(ast)==='recover'),'Core metadata override requires a collector review')
   initializer=initializer.expression.expression
  }
  assert(call(initializer,factory),'App no longer uses actual '+factory)
 }
 const registry=declarations.get('registry');assert(call(registry,'createNativeAssistantCatalog'),'App registry factory changed')
 assert.deepEqual(imports.get('createNativeAssistantCatalog'),{name:'createNativeAssistantCatalog',source:'./native-assistant-catalog'})
 assert.equal(registry.arguments.length,2);const additions=registry.arguments[1];assert(ts.isArrayLiteralExpression(additions),'Dynamic catalog additions require coverage review')
 assert.deepEqual(additions.elements.map(item=>item.getText(ast).replace(/\s/g,'')),['...core','currentDay','...reads','...clinical','...food'],'App additions differ from the inspected factories')
 const readInitializer=declarations.get('reads'),settings=readInitializer.arguments[0];assert(call(settings,'createNativeAssistantRecordReadNormalServices'),'Record service source changed')
 assert(ts.isObjectLiteralExpression(settings.arguments[1]));const recordFlags=new Map(settings.arguments[1].properties.filter(ts.isPropertyAssignment).map(item=>[item.name.getText(ast),item.initializer.getText(ast)]))
 assert.equal(recordFlags.get('readOnlyOperations'),'RECORD_READ_IDS');assert.equal(recordFlags.get('moodJournalCreate'),'true','Mood creation factory must match the app')
 const host=declarations.get('host');assert(call(host,'createNativeAssistantHost'));const config=host.arguments[0];assert(ts.isObjectLiteralExpression(config))
 const spending=config.properties.find(item=>ts.isPropertyAssignment(item)&&item.name.getText(ast)==='actionSpendingAllowed');assert(spending&&spending.initializer.kind===ts.SyntaxKind.FalseKeyword,'Paid action availability changed; reconcile the unavailable-paid report')
 return {method:'actual-app-assembly-ast',source:'lib/native-assistant-app.ts',sha256:crypto.createHash('sha256').update(source).digest('hex'),factories:['createNativeAssistantCatalog',...Object.values(families).map(value=>value[0])]}
}
function collectCoreCatalog(){
 const appSource=fs.readFileSync(path.join(root,'lib/native-assistant-app.ts'),'utf8'),assembly=verifyAppAssembly(appSource),allowed=new Set(sources),cache=new Map(),loaded=[]
 let domainCalls=0
 const never=()=>{domainCalls++;throw Error('Metadata collector must not execute an app/domain/provider/auth handler')}
 const clinicalStub=Object.freeze({executeVoiceSymptomAction:never,prepareStructuredVoiceSymptomAction:never,readStructuredVoiceSymptomHistory:never})
 function load(relative){
  assert(allowed.has(relative),'Forbidden metadata dependency: '+relative)
  if(cache.has(relative))return cache.get(relative)
  const source=fs.readFileSync(path.join(root,relative),'utf8'),compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}})
  const module={exports:{}};cache.set(relative,module.exports);loaded.push(relative)
  const context=vm.createContext({module,exports:module.exports,require:id=>{
   if(id==='crypto'||id==='node:crypto')return crypto
   const resolved=id.startsWith('@/')?id.slice(2)+'.ts':id.startsWith('.')?path.posix.normalize(path.posix.join(path.posix.dirname(relative),id+'.ts')):null
   if(relative==='lib/native-assistant-clinical-actions.ts'&&resolved==='lib/native-voice-symptom-analysis.ts')return clinicalStub
   assert(resolved,'Forbidden metadata import: '+id);return load(resolved)
  }})
  new vm.Script(compiled.outputText,{filename:relative}).runInContext(context,{timeout:1000});cache.set(relative,module.exports);return module.exports
 }
 const normal={request:never,authenticate:never,preferences:{prepare:never,execute:never},notifications:{prepare:never,execute:never},records:{prepare:never,execute:never},appReads:{read:never},creations:{prepare:never,execute:never,verify:never}}
 const core=load(families.core[1]).createNativeAssistantCoreActions(normal)
 const currentDay=load(families.currentDay[1]).createNativeAssistantCurrentStateOperation({authenticatedActor:never,trustedTimeZone:never,now:never,profile:never,food:never,exercise:never})
 const records=load(families.reads[1]),reads=records.createNativeAssistantRecordReadOperations({authenticatedActor:never,operations:records.RECORD_READ_IDS,read:never,createMoodJournal:never,actionIdsSupported:true})
 const clinical=load(families.clinical[1]).createAssistantClinicalOperations({requestForContext:never,trustedTimeZone:never})
 const food=load(families.food[1]).createNativeAssistantFoodOperations({authenticate:never,prepare:never,execute:never,verify:never,recover:never,readDayContext:never})
 const registry=load('lib/native-assistant-catalog.ts').createNativeAssistantCatalog({authenticatedActor:never,foodRead:never,healthJournal:{create:never,read:never,actionIdsSupported:true}},[...core,currentDay,...reads,...clinical,...food])
 assert.equal(domainCalls,0,'A registry factory executed a domain handler')
 const ids=clone(registry.ids()),coverage=clone(registry.coverage()),schemas=Object.fromEntries(ids.map(id=>[id,clone(registry.get(id).input)]))
 assert.equal(new Set(ids).size,ids.length,'Duplicate registered action');assert.equal(ids.length,58,'Registry size changed; reconcile core metadata')
 const inventory=JSON.parse(fs.readFileSync(path.join(root,'scripts/voice2-manual-operation-inventory.json'),'utf8')),manual=new Set(inventory.operations.map(item=>item.id))
 const extraReasons={'mood.entries.update':'Additional exact owned mood-entry edit; inventory groups this under mood controls without a separate operation.','mood.entries.delete':'Additional exact owned mood-entry removal; inventory has no separate matching manual operation.'}
 for(const item of coverage){assert(item.coverage?.scope,'Missing scope: '+item.id);assert.equal(item.coverage.status,'offline-proof','Metadata must not claim production parity');if(!item.coverage.manualIds.length)assert(extraReasons[item.id],'Undocumented unmapped extra: '+item.id);for(const mapped of item.coverage.manualIds)assert(manual.has(mapped),'Invented manual-operation mapping: '+item.id+' → '+mapped)}
 return {ids,coverage,schemas,unavailablePaid:['symptoms.analyze','symptoms.follow_up'],unmappedExtras:extraReasons,manualOperations:inventory.operations.length,productionOperations:0,scope:'Offline registered core metadata only. The full manual inventory remains the release scope; registration is not installed or production parity.',assembly,sources:loaded.sort().map(relative=>({path:relative,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,relative))).digest('hex')})),domainHandlerCalls:domainCalls}
}
if(require.main===module){try{const result=collectCoreCatalog();console.log(JSON.stringify({registered:result.ids.length,unavailablePaid:result.unavailablePaid,manualOperations:result.manualOperations,productionOperations:result.productionOperations,domainHandlerCalls:result.domainHandlerCalls,assembly:result.assembly.method,scope:result.scope},null,2))}catch(error){console.error(error.message);process.exitCode=1}}
module.exports={collectCoreCatalog,verifyAppAssembly}
