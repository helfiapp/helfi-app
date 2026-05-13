#!/usr/bin/env node

if (String(process.env.OPENAI_API_KEY || '').trim()) {
  console.error('STOP: OPENAI_API_KEY is available to this terminal/agent process.')
  console.error('Agents must not use the live Helfi OpenAI key.')
  console.error('Keep the key inside .env.local for the actual Helfi app UI/server only.')
  console.error('Do not bypass this check. Do not run direct OpenAI scripts, one-off canaries, or billing checks with this key.')
  console.error('This protects the live Helfi OpenAI balance from local agent spend.')
  process.exit(1)
}

console.log('Agent/terminal OpenAI key check passed.')
