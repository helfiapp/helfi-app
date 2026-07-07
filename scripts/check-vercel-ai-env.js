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

const productionNames = new Set(
  rows
    .filter((line) => /\bProduction\b/.test(line))
    .map((line) => line.split(/\s+/)[0])
    .filter(Boolean),
)

if (!productionNames.has('OPENAI_API_KEY')) {
  fail('Vercel Production is missing OPENAI_API_KEY. Talk to Helfi/live AI cannot work until this is restored.')
}

if (!productionNames.has('HELFI_VOICE_REALTIME_ENABLED')) {
  fail('Vercel Production is missing HELFI_VOICE_REALTIME_ENABLED. Talk to Helfi live voice cannot work until this is restored.')
}

console.log('✅ Vercel Production OpenAI and live voice environment variables exist.')
