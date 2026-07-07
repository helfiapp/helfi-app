#!/usr/bin/env node

const { execFileSync } = require('child_process')

const REQUIRED = [
  'DATABASE_URL',
  'NEXTAUTH_SECRET',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'OPENAI_API_KEY',
  'HELFI_VOICE_REALTIME_ENABLED',
  'RESEND_API_KEY',
  'BLOB_READ_WRITE_TOKEN',
  'ENCRYPTION_MASTER_KEY',
  'NEXT_PUBLIC_VAPID_PUBLIC_KEY',
  'VAPID_PRIVATE_KEY',
]

const FEATURE_SPECIFIC = [
  'APPLE_CLIENT_ID',
  'APPLE_TEAM_ID',
  'APPLE_KEY_ID',
  'APPLE_PRIVATE_KEY',
  'APPLE_IAP_SHARED_SECRET',
  'APPLE_IAP_ISSUER_ID',
  'APPLE_IAP_KEY_ID',
  'APPLE_IAP_PRIVATE_KEY',
  'APPLE_IAP_BUNDLE_ID',
  'GOOGLE_PLAY_SERVICE_ACCOUNT_JSON',
  'GOOGLE_PLAY_PACKAGE_NAME',
  'GOOGLE_MAPS_API_KEY',
  'GOOGLE_MAPS_SERVER_KEY',
  'STRIPE_PRICE_CREDITS_100',
  'STRIPE_PRICE_PRACTITIONER_LISTING',
]

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
} catch {
  fail('Could not check Vercel environment variables. Do not claim live features work.')
}

const productionNames = new Set(
  output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => /\bProduction\b/.test(line))
    .map((line) => line.split(/\s+/)[0])
    .filter(Boolean),
)

const missingRequired = REQUIRED.filter((name) => !productionNames.has(name))
const missingFeatureSpecific = FEATURE_SPECIFIC.filter((name) => !productionNames.has(name))

if (missingFeatureSpecific.length) {
  console.warn('⚠️  Vercel Production is missing feature-specific environment variables:')
  missingFeatureSpecific.forEach((name) => console.warn(`   - ${name}`))
  console.warn('These may break Apple/Google purchase verification, Google Maps/Places, practitioner billing, or legacy credit packages if those paths are used.')
  console.warn('')
}

if (missingRequired.length) {
  console.error('❌ Vercel Production is missing required environment variables:')
  missingRequired.forEach((name) => console.error(`   - ${name}`))
  console.error('')
  console.error('Do not claim live app, billing, storage, email, push, or AI features are fully working until these are restored.')
  process.exit(1)
}

console.log('✅ Required Vercel Production environment variables exist.')
