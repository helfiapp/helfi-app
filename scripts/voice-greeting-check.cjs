#!/usr/bin/env node
'use strict'
// Reuse actual-source callback and protocol fixtures. These modules only read
// source and run synthetic offline adapters; they do not start the real app.
const { verifyVoiceGreetingLifecycle } = require('./voice-client-integrity-check.cjs')
const { checkRoute, checkNative } = require('./voice-live-protocol-check.cjs')

async function main() {
  await verifyVoiceGreetingLifecycle()
  await checkRoute()
  await checkNative()
  console.log('PASS: opening welcome uses the bundled recording under the existing RTC audio session, stays once per connected conversation, yields to user-first speech, survives failed startup, and cannot dispatch app actions or an extra charge. Offline events only; real audible greeting remains unverified.')
}
main().catch(error => { console.error(error.stack || error.message); process.exitCode = 1 })
