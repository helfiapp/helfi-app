#!/usr/bin/env node
'use strict'
// Exercise actual normal lookup calls with synthetic replies; no app bootstrap.
const assert = require('node:assert/strict')
const { normal, source } = require('./voice2-food-normal-prepare-check.cjs')
async function main() {
  const ctx = normal.ctx, original = ctx.searchDiaryFoods, calls = []
  try {
    ctx.searchDiaryFoods = async request => {
      const url = new URL(request.url)
      calls.push({ q: url.searchParams.get('q'), localOnly: url.searchParams.get('localOnly') })
      return { ok: true, json: async () => ({ items: [] }) }
    }
    const ingredient = { name: 'sunny-side-up eggs', quantity: 2, unit: 'each', display: '2 each sunny-side-up eggs' }
    assert.equal(await ctx.findOrdinaryVoiceFood(ingredient, 'AU', ['sunny side up eggs', 'sunny side up egg', 'sunny-side-up eggs', 'SUNNY SIDE UP EGGS']), null)
    assert.deepEqual(calls, [
      { q: 'sunny side up eggs', localOnly: '1' }, { q: 'sunny side up egg', localOnly: '1' },
      { q: 'sunny side up eggs', localOnly: null }, { q: 'sunny side up egg', localOnly: null },
    ])
    calls.length = 0
    await ctx.findOrdinaryVoiceFood({ ...ingredient, name: 'corn meal' }, 'AU', ['corn meal', 'corn'])
    assert.equal(calls.length, 4, 'Meaningful food words must not be stripped to deduplicate searches')
    calls.length = 0
    ctx.searchDiaryFoods = async request => {
      const url = new URL(request.url); calls.push(url.searchParams.get('localOnly'))
      return { ok: true, json: async () => ({ items: [source('Rice cooked')] }) }
    }
    const found = await ctx.findOrdinaryVoiceFood({ name: 'Rice cooked', quantity: 100, unit: 'g', display: '100 g Rice cooked' }, 'AU', ['rice cooked', 'rice'])
    assert.equal(found.name, 'Rice cooked'); assert.deepEqual(calls, ['1'])
    console.log('PASS actual lookup deduplicates punctuation/case/spacing, retains distinct plural/local-first searches and makes no fallback after a usable local hit. Synthetic sources only.')
  } finally { ctx.searchDiaryFoods = original }
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1 })
module.exports = { main }
