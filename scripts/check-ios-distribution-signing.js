#!/usr/bin/env node

const { spawnSync } = require('child_process')

function fail(message) {
  console.error(`❌ ${message}`)
  process.exit(1)
}

const result = spawnSync('security', ['find-identity', '-v', '-p', 'codesigning'], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
  timeout: 30000,
})

if (result.error) {
  fail(`Could not check local Apple signing certificates: ${result.error.message}`)
}

const output = `${result.stdout || ''}\n${result.stderr || ''}`
if (result.status !== 0) {
  fail('Could not check local Apple signing certificates.')
}

const hasDistributionCertificate = output
  .split(/\r?\n/)
  .some((line) => /"Apple Distribution:/.test(line) || /"iOS Distribution:/.test(line))

if (!hasDistributionCertificate) {
  fail('This Mac does not have an Apple/iOS Distribution signing certificate. Xcode cannot create a TestFlight IPA until Apple signing is fixed.')
}

console.log('iOS Distribution signing certificate is available.')
