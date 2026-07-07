#!/usr/bin/env node

const { execFileSync, spawnSync } = require('child_process')
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

function vercelOutput(args) {
  const result = spawnSync('vercel', args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 30000,
  })
  const output = `${result.stdout || ''}${result.stderr || ''}`
  if (result.error) throw result.error
  if (result.status !== 0) {
    const error = new Error(output || `vercel ${args.join(' ')} failed`)
    error.output = output
    throw error
  }
  return output
}

function firstDeploymentUrl(output) {
  const match = output.match(/https:\/\/helfi-[a-z0-9-]+-louie-veleskis-projects\.vercel\.app/i)
  return match ? match[0] : ''
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
    run('node', ['scripts/check-vercel-ai-env.js'])
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

  let deploymentList = ''
  try {
    deploymentList = vercelOutput([
      'list',
      '--environment',
      'production',
      '--yes',
      '--no-color',
      '-m',
      `githubCommitSha=${commitSha}`,
    ])
  } catch (error) {
    process.stderr.write(error?.output || error?.stderr || error?.stdout || '')
    fail('Could not check Vercel production deployments. Do not upload this TestFlight build yet.')
  }

  if (/No deployments found/i.test(deploymentList)) {
    fail(`Current commit ${commitSha.slice(0, 8)} is not deployed to Vercel Production. Deploy and verify the backend before uploading TestFlight.`)
  }

  if (!/Ready/i.test(deploymentList)) {
    fail(`Current commit ${commitSha.slice(0, 8)} does not have a READY Vercel Production deployment.`)
  }

  const deploymentUrl = firstDeploymentUrl(deploymentList)
  if (!deploymentUrl) {
    fail('Could not read the Vercel Production deployment URL for the current commit.')
  }

  let liveDomainInspect = ''
  try {
    liveDomainInspect = vercelOutput(['inspect', 'helfi.ai', '--no-color'])
  } catch (error) {
    process.stderr.write(error?.output || error?.stderr || error?.stdout || '')
    fail('Could not verify helfi.ai points to the current deployment.')
  }

  if (!liveDomainInspect.includes(deploymentUrl.replace(/^https:\/\//, ''))) {
    fail(`helfi.ai is not pointing to the current commit deployment. Expected ${deploymentUrl}.`)
  }

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
