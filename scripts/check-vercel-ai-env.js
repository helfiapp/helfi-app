#!/usr/bin/env node

const { execFileSync } = require('child_process')

function fail(message) {
  console.error(`❌ ${message}`)
  process.exit(1)
}

let output = ''
try {
  output = execFileSync('vercel', ['env', 'ls'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 30000,
  })
} catch (error) {
  fail('Could not check Vercel environment variables. Do not claim live AI features work.')
}

const rows = output
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean)

const hasProductionOpenAiKey = rows.some((line) => {
  if (!line.startsWith('OPENAI_API_KEY')) return false
  return /\bProduction\b/.test(line)
})

if (!hasProductionOpenAiKey) {
  fail('Vercel Production is missing OPENAI_API_KEY. Talk to Helfi/live AI cannot work until this is restored.')
}

console.log('✅ Vercel Production OPENAI_API_KEY exists.')
