#!/usr/bin/env node

/**
 * Upsert Garmin OAuth environment variables to the Vercel project via API.
 *
 * Usage:
 *   GARMIN_CONSUMER_KEY=xxxx GARMIN_CONSUMER_SECRET=yyyy node scripts/add-garmin-env-to-vercel.js
 *
 * Optional:
 *   export VERCEL_TOKEN=your_token   # defaults to known token in repo
 *   export GARMIN_REDIRECT_URI=https://helfi.ai/api/auth/garmin/callback
 *   export GARMIN_API_BASE_URL=https://healthapi.garmin.com/wellness-api/rest
 */

const https = require('https')

const PROJECT_NAME = 'helfi-app'
const DEFAULT_REDIRECT = 'https://helfi.ai/api/auth/garmin/callback'
const DEFAULT_BASE_URL = 'https://healthapi.garmin.com/wellness-api/rest'

function makeRequest(options, data) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let body = ''
      res.on('data', (chunk) => {
        body += chunk
      })
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body)
          resolve({ status: res.statusCode, data: parsed })
        } catch (e) {
          resolve({ status: res.statusCode, data: body })
        }
      })
    })

    req.on('error', (error) => reject(error))

    if (data) {
      req.write(JSON.stringify(data))
    }
    req.end()
  })
}

async function addOrUpdateEnvVar(token, key, value, type = 'encrypted') {
  const options = {
    hostname: 'api.vercel.com',
    path: `/v9/projects/${PROJECT_NAME}/env?upsert=true`,
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  }

  const payload = {
    key,
    value,
    type,
    target: ['production', 'preview', 'development'],
  }

  console.log(`\n📝 Adding/updating: ${key}`)
  if (key.toLowerCase().includes('secret') || key.toLowerCase().includes('key')) {
    console.log(`   Value: ${value.slice(0, 4)}...${value.slice(-4)} (hidden)`)
  } else {
    console.log(`   Value: ${value}`)
  }

  const response = await makeRequest(options, payload)
  if (response.status === 200 || response.status === 201) {
    console.log('   ✅ Success!')
    return true
  } else {
    console.error(`   ❌ Failed (${response.status})`, response.data)
    return false
  }
}

async function main() {
  const token = process.env.VERCEL_TOKEN || '2MLfXoXXv8hIaHIE7lQcdQ39'
  const consumerKey = process.env.GARMIN_CONSUMER_KEY
  const consumerSecret = process.env.GARMIN_CONSUMER_SECRET
  const redirectUri = process.env.GARMIN_REDIRECT_URI || DEFAULT_REDIRECT
  const apiBaseUrl = process.env.GARMIN_API_BASE_URL || DEFAULT_BASE_URL

  if (!consumerKey || !consumerSecret) {
    console.error('❌ GARMIN_CONSUMER_KEY and GARMIN_CONSUMER_SECRET are required.')
    console.error('\nExample:')
    console.error('  GARMIN_CONSUMER_KEY=xxxx GARMIN_CONSUMER_SECRET=yyyy node scripts/add-garmin-env-to-vercel.js')
    console.error('\nOptional overrides:')
    console.error(`  GARMIN_REDIRECT_URI=${DEFAULT_REDIRECT}`)
    console.error(`  GARMIN_API_BASE_URL=${DEFAULT_BASE_URL}`)
    process.exit(1)
  }

  console.log('\n🚀 Adding Garmin environment variables to Vercel')
  console.log(`   Project: ${PROJECT_NAME}`)
  console.log(`   Redirect: ${redirectUri}`)

  const envVars = [
    { key: 'GARMIN_CONSUMER_KEY', value: consumerKey, type: 'encrypted' },
    { key: 'GARMIN_CONSUMER_SECRET', value: consumerSecret, type: 'encrypted' },
    { key: 'GARMIN_REDIRECT_URI', value: redirectUri, type: 'plain' },
    { key: 'GARMIN_API_BASE_URL', value: apiBaseUrl, type: 'plain' },
  ]

  let success = 0
  for (const envVar of envVars) {
    const ok = await addOrUpdateEnvVar(token, envVar.key, envVar.value, envVar.type)
    success += ok ? 1 : 0
    await new Promise((resolve) => setTimeout(resolve, 400))
  }

  console.log(`\n📊 Summary: ${success}/${envVars.length} updated.`)
  if (success === envVars.length) {
    console.log('🎉 Garmin environment variables are set. Redeploy to apply if needed.')
  } else {
    console.log('⚠️ Some variables failed. See errors above.')
    process.exit(1)
  }
}

main().catch((error) => {
  console.error('❌ Fatal error:', error)
  process.exit(1)
})
