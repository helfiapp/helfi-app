#!/usr/bin/env node
'use strict'
// Actual server target resolver and declared native route registry. Read only;
// no UI automation, imports of app/server/provider code or network calls.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript')
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'app/api/native/voice-assistant/route.ts'),'utf8'),ast=ts.createSourceFile('route.ts',source,ts.ScriptTarget.Latest,true)
const functions=ast.statements.filter(n=>ts.isFunctionDeclaration(n)).map(n=>n.getText(ast).replace(/^export\s+/,''))
const ctx=vm.createContext({URL,console})
vm.runInContext(ts.transpileModule(functions.join('\n'),{compilerOptions:{module:ts.ModuleKind.None,target:ts.ScriptTarget.ES2020}}).outputText,ctx)
const nav=fs.readFileSync(path.join(root,'native/src/navigation/MainNavigator.tsx'),'utf8')
let count=0
function check(name,run){run();count++;console.log('PASS '+name)}
check('Help, Support and Devices use real registered native stack routes',()=>{
 for(const [request,route,pathName] of [['Open help','Help','/help'],['Open help and support','Help','/help'],['Open support','Support','/support'],['Show my support tickets','Support','/support'],['Open devices','Devices','/devices'],['Show Apple Health','Devices','/devices'],['Take me to Garmin Connect','Devices','/devices'],['Help me open Fitbit','Devices','/devices']]){
  const target=ctx.inferNativeWebTarget({},request)
  assert.equal(target.nativeTarget.type,'stack');assert.equal(target.nativeTarget.route,route);assert.equal(target.path,pathName)
  assert(nav.includes(`name="${route}"`));assert.equal(target.nativeTarget.action,undefined)
 }
})
check('opening a screen never claims a send, connect or device import action',()=>{
 for(const request of ['Open support','Show Apple Health','Use Garmin Connect']){
  const target=ctx.inferNativeWebTarget({},request);assert(!target.path.includes('?'));assert(!target.nativeTarget.action);assert(!/sent|connected|imported/i.test(target.title))
 }
})
check('ordinary help and device questions are not automatically target actions',()=>{
 for(const request of ['Why does Fitbit not sync?','I need help','Does support answer questions?']){
  const target=ctx.inferNativeWebTarget({},request);assert(!['Devices','Support','Help'].includes(target?.nativeTarget?.route))
 }
 assert.equal(ctx.inferNativeWebTarget({},'Help me open billing').nativeTarget.route,'Billing')
 assert.notEqual(ctx.inferNativeWebTarget({target:'Open devices'},'I need help')?.nativeTarget?.route,'Devices')
})
console.log(`Voice navigation parity: ${count} actual-source offline groups passed; navigation targets only.`)
