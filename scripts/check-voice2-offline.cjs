#!/usr/bin/env node
'use strict'
// One bounded, provider-free proof gate. Release coverage is checked separately
// and is expected to refuse while full operation/host mappings are absent.
const { spawnSync } = require('node:child_process'), path = require('node:path'), assert = require('node:assert/strict')
const root = path.resolve(__dirname, '..')
const checks = [
  ['voice2-domain-adapters-check.cjs'],
  ['voice2-general-assistant-check.cjs'],
  ['voice2-runtime-adversarial-check.cjs'],
  ['voice2-result-reference-check.cjs'],
  ['voice2-preflight-retry-check.cjs'],
  ['voice2-large-receipt-check.cjs'],
  ['voice2-safety-priority-check.cjs'],
  ['voice2-tool-bridge-check.cjs'],
  ['voice2-session-store-check.cjs'],
  ['voice2-core-actions-check.cjs'],
  ['voice2-current-state-check.cjs'],
  ['voice2-record-reads-check.cjs'],
  ['voice2-read-only-routes-check.cjs'],
  ['voice2-clinical-actions-check.cjs'],
  ['voice2-normal-actions-check.cjs'],
  ['voice2-host-check.cjs'],
  ['voice2-app-host-check.cjs'],
  ['voice2-planning-loop-check.cjs'],
  ['voice2-planner-cost-check.cjs'],
  ['voice2-food-actions-check.cjs'],
  ['voice2-food-normal-prepare-check.cjs'],
  ['voice2-food-normal-save-check.cjs'],
  ['voice2-food-clarification-check.cjs'],
  ['voice-recorded-counted-serving-check.cjs'],
  ['voice-food-lookup-dedup-check.cjs'],
  ['voice2-food-reads-check.cjs'],
  ['voice2-mood-journal-recovery-check.cjs'],
  ['voice2-native-general-check.cjs'],
  ['voice2-native-session-check.cjs'],
  ['voice2-realtime-catalog-check.cjs'],
  ['voice2-integration-audit-check.cjs'],
  ['voice2-readable-check.cjs'],
  ['voice2-completion-events-check.cjs'],
  ['voice2-mounted-core-refresh-check.cjs'],
  ['voice2-final-integration-audit-check.cjs'],
  ['voice2-core-journey-check.cjs'],
  ['voice2-core-catalog.cjs'],
  ['check-voice2-operation-coverage.cjs', '--allow-gaps'],
]
for (const [name, ...args] of checks) {
  const result = spawnSync(process.execPath, [path.join(__dirname, name), ...args], { cwd: root, encoding: 'utf8', timeout: 45000, maxBuffer: 1024 * 1024 })
  process.stdout.write(result.stdout || ''); process.stderr.write(result.stderr || '')
  if (result.error || result.status !== 0) { console.error('VOICE 2 offline gate failed: ' + name); process.exit(1) }
}
const release = spawnSync(process.execPath, [path.join(__dirname, 'check-voice2-operation-coverage.cjs')], { cwd: root, encoding: 'utf8', timeout: 45000, maxBuffer: 1024 * 1024 })
assert.equal(release.status, 1, 'Full release coverage must still refuse incomplete production integration')
assert.match(release.stderr, /Release coverage REFUSED/)
console.log('PASS full release coverage correctly refuses the current offline-only integration')
console.log('VOICE 2 offline proof gate passed. This is not a deployment or real-model/native acceptance result.')
