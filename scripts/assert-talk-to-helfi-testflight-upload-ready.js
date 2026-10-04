#!/usr/bin/env node

const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: options.timeout || 30000,
  })
}

function fail(message) {
  console.error(`❌ ${message}`)
  process.exit(1)
}

function readAmplifyJob() {
  const args = ['--profile', 'helfi-agent', '--region', 'ap-southeast-2', 'amplify', 'list-jobs', '--app-id', 'd2n4u4zm85ooe', '--branch-name', 'master', '--max-results', '1', '--query', 'jobSummaries[0]', '--output', 'json']
  return JSON.parse(run('aws', args))
}

async function readJson(url) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)
  try {
    const res = await fetch(url, {
      headers: { accept: 'application/json' },
      signal: controller.signal,
    })
    const data = await res.json().catch(() => ({}))
    return { res, data }
  } finally {
    clearTimeout(timeout)
  }
}

async function main() {
  try {
    run('node', ['scripts/assert-talk-to-helfi-testflight-preflight.js'])
    run('node', ['scripts/check-ios-distribution-signing.js'])
  } catch (error) {
    process.stderr.write(error?.stderr || error?.stdout || '')
    fail('Talk to Helfi TestFlight upload is not ready.')
  }

  const commitSha = run('git', ['rev-parse', 'HEAD']).trim()
  const nativeAppJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'native/app.json'), 'utf8'))
  const buildNumber = String(nativeAppJson?.expo?.ios?.buildNumber || '')
  const appVersion = String(nativeAppJson?.expo?.version || '')
  const bundleIdentifier = String(nativeAppJson?.expo?.ios?.bundleIdentifier || '')
  const exportPath = path.join(process.cwd(), 'native/ios/build', `TestFlightExport-${buildNumber}-live-candidate`)
  const ipaPath = path.join(exportPath, 'Helfi.ipa')
  const manifestPath = path.join(exportPath, 'Helfi-testflight-manifest.json')

  if (!fs.existsSync(ipaPath) || !fs.existsSync(manifestPath)) {
    fail(`Live TestFlight IPA is missing for build ${buildNumber}. Run npm run build:talk-to-helfi-testflight:live before upload.`)
  }

  let manifest = null
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  } catch {
    fail('Live TestFlight IPA manifest could not be read. Rebuild the live TestFlight IPA before upload.')
  }

  if (manifest.mode !== 'live-candidate') fail('Live TestFlight IPA manifest is not a live-candidate build.')
  if (manifest.liveVoiceEnabled !== true) fail('Live TestFlight IPA was not built with live voice enabled.')
  if (manifest.apiBaseUrl !== 'https://helfi.ai') fail('Live TestFlight IPA must point to https://helfi.ai.')
  if (manifest.appVersion !== appVersion) fail(`Live TestFlight IPA version does not match native/app.json ${appVersion}.`)
  if (manifest.buildNumber !== buildNumber) fail(`Live TestFlight IPA build number does not match native/app.json ${buildNumber}.`)
  if (manifest.bundleIdentifier !== bundleIdentifier) fail(`Live TestFlight IPA bundle ID does not match native/app.json ${bundleIdentifier}.`)
  if (manifest.commitSha !== commitSha) fail(`Live TestFlight IPA was built from ${String(manifest.commitSha || '').slice(0, 8)}, not current commit ${commitSha.slice(0, 8)}. Rebuild it before upload.`)

  let deployment
  try { deployment = readAmplifyJob() } catch {
    fail('Could not check AWS Amplify production. Do not upload this TestFlight build yet.')
  }
  if (deployment?.commitId !== commitSha || deployment?.status !== 'SUCCEED') {
    fail(`Current commit ${commitSha.slice(0, 8)} is not the latest successful AWS Amplify production deployment.`)
  }
  const job = JSON.parse(run('aws', ['--profile', 'helfi-agent', '--region', 'ap-southeast-2', 'amplify', 'get-job', '--app-id', 'd2n4u4zm85ooe', '--branch-name', 'master', '--job-id', deployment.jobId, '--query', 'job.steps[].{step:stepName,status:status}', '--output', 'json']))
  if (!job.length || job.some(step => step.status !== 'SUCCEED')) fail('AWS build, deploy and verification must all succeed before upload.')
  const domain = JSON.parse(run('aws', ['--profile', 'helfi-agent', '--region', 'ap-southeast-2', 'amplify', 'get-domain-association', '--app-id', 'd2n4u4zm85ooe', '--domain-name', 'helfi.ai', '--query', 'domainAssociation.{status:domainStatus,subDomains:subDomains[].subDomainSetting}', '--output', 'json']))
  if (domain.status !== 'AVAILABLE' || !domain.subDomains.some(item => item.prefix === '' && item.branchName === 'master')) fail('helfi.ai must be assigned to the verified master deployment.')

  let readiness = null
  try {
    readiness = await readJson('https://helfi.ai/api/native/voice-assistant/realtime?readiness=1')
  } catch {
    fail('Could not check helfi.ai live voice readiness. Do not upload this TestFlight build yet.')
  }

  if (!readiness.res.ok || readiness.data?.ready !== true) {
    fail(`helfi.ai live voice is not ready. Code: ${readiness.data?.code || readiness.res.status}.`)
  }

  if (!['marin', 'cedar'].includes(String(readiness.data?.voice || '').toLowerCase())) {
    fail(`helfi.ai live voice is using ${readiness.data?.voice || 'an unknown voice'}, not Marin/Cedar.`)
  }

  console.log('✅ Talk to Helfi TestFlight upload readiness passed.')
}

main().catch((error) => fail(error?.message || 'Talk to Helfi TestFlight upload is not ready.'))
