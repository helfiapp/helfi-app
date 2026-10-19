'use strict'
// Synthetic VM wiring for the actual cited source-portion helper. No app,
// environment, database or provider imports; the source JSON is public data.
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript')
const root=path.resolve(__dirname,'..'),moduleFixture={exports:{}}
const verifiedUsdaRecordedPortions=require('../data/food-overrides/usda-recorded-portions.json')
new Function('module','exports','require',ts.transpileModule(fs.readFileSync(path.join(root,'lib/food/usda-recorded-portions.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText)(moduleFixture,moduleFixture.exports,name=>{if(name==='@/data/food-overrides/usda-recorded-portions.json')return verifiedUsdaRecordedPortions;throw Error('Unexpected fixture dependency '+name)})
module.exports={verifiedUsdaRecordedPortions,verifiedUsdaRecordedPortionOptions:moduleFixture.exports.verifiedUsdaRecordedPortionOptions}
