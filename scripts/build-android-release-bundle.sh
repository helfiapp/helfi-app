#!/usr/bin/env bash
set -euo pipefail

TASK_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$TASK_ROOT"
node scripts/assert-no-local-openai-key.js

node <<'NODE'
const fs = require('fs')
const path = require('path')
const names = ['STORE_FILE', 'STORE_PASSWORD', 'KEY_ALIAS', 'KEY_PASSWORD']
if (names.some(name => !String(process.env['HELFI_ANDROID_UPLOAD_' + name] || '').trim())) {
  throw new Error('Private Helfi upload signing is required; a debug key cannot produce this release bundle.')
}
const keyFile = fs.realpathSync(process.env.HELFI_ANDROID_UPLOAD_STORE_FILE)
if (keyFile.startsWith(fs.realpathSync('.') + path.sep)) throw new Error('The upload keystore must be outside the app source folder.')
if (process.env.HELFI_ANDROID_UPLOAD_KEY_ALIAS === 'androiddebugkey') throw new Error('Debug key prohibited for Google Play.')
if (!fs.existsSync('native/android/app/build.gradle')) throw new Error('Generate the Android platform in the main native folder first.')
if (!fs.readFileSync('native/android/app/build.gradle', 'utf8').includes('// HELFI_GOOGLE_PLAY_SIGNING')) throw new Error('Regenerate Android with the Helfi release signing plugin before building.')
NODE

npm run check:page-locks
npm --prefix native run check:page-locks
npm --prefix native run check:voice-assistant
npm --prefix native run typecheck
git diff --check
git diff --quiet HEAD -- native app lib scripts prisma
if [[ -n "$(git ls-files --others --exclude-standard -- native app lib scripts prisma)" ]]; then
  echo 'Commit the release source before recording its build manifest.' >&2
  exit 1
fi

EXPO_PUBLIC_API_BASE_URL=https://helfi.ai \
EXPO_PUBLIC_HELFI_LIVE_VOICE_ENABLED=true \
native/android/gradlew -p native/android :app:bundleRelease

node <<'NODE'
const fs = require('fs')
const { execFileSync } = require('child_process')
const { createHash, X509Certificate } = require('crypto')
const app = require('./native/app.json').expo
const bundle = 'native/android/app/build/outputs/bundle/release/app-release.aab'
if (!fs.existsSync(bundle)) throw new Error('No completed release bundle was produced.')
const verified = execFileSync('jarsigner', ['-verify', bundle], { encoding: 'utf8' })
if (!verified.includes('jar verified.')) throw new Error('The Android bundle has no verified signature.')
const certOutput = execFileSync('keytool', ['-printcert', '-rfc', '-jarfile', bundle], { encoding: 'utf8' })
const pem = certOutput.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/)?.[0]
if (!pem) throw new Error('Could not verify the bundle signing certificate.')
const cert = new X509Certificate(pem)
if (/Android Debug/i.test(cert.subject)) throw new Error('A debug-signed bundle cannot be uploaded.')
const manifest = {
  packageName: app.android.package, versionCode: app.android.versionCode,
  versionName: app.version, apiBaseUrl: 'https://helfi.ai', liveVoiceEnabled: true,
  commitSha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  sha256: createHash('sha256').update(fs.readFileSync(bundle)).digest('hex'),
  signingCertificateSha256: cert.fingerprint256,
  bundle: 'app-release.aab', createdAt: new Date().toISOString(),
  uploaded: false,
}
fs.writeFileSync(bundle.replace('app-release.aab', 'Helfi-google-play-manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
console.log('Local Android release bundle created. Store upload and verification are still required.')
NODE
