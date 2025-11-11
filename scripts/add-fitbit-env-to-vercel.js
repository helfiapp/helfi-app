#!/usr/bin/env node

/**
 * Script to add/update Fitbit OAuth environment variables in Vercel via API
 * 
 * Usage:
 *   VERCEL_TOKEN=your_token FITBIT_CLIENT_SECRET=your_secret node scripts/add-fitbit-env-to-vercel.js
 * 
 * Or set VERCEL_TOKEN in your environment:
 *   export VERCEL_TOKEN=your_token
 *   export FITBIT_CLIENT_SECRET=your_secret
 *   node scripts/add-fitbit-env-to-vercel.js
 */

const https = require('https');

const PROJECT_NAME = 'helfi-app';
const FITBIT_CLIENT_ID = '23TPZH';
const FITBIT_REDIRECT_URI = 'https://helfi.ai/api/auth/fitbit/callback';

function makeRequest(options, data) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

async function addOrUpdateEnvVar(token, key, value) {
  const options = {
    hostname: 'api.vercel.com',
    path: `/v9/projects/${PROJECT_NAME}/env?upsert=true`,
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  };

  const payload = {
    key: key,
    value: value,
    type: 'encrypted', // Sensitive credentials should be encrypted
    target: ['production', 'preview', 'development'], // Apply to all environments
  };

  console.log(`\n📝 Adding/updating: ${key}`);
  if (key.includes('SECRET')) {
    console.log(`   Value: ${value.substring(0, 10)}...${value.substring(value.length - 4)} (hidden)`);
  } else {
    console.log(`   Value: ${value}`);
  }

  try {
    const response = await makeRequest(options, payload);
    
    if (response.status === 200 || response.status === 201) {
      console.log(`   ✅ Success!`);
      return true;
    } else {
      console.error(`   ❌ Failed: ${response.status}`);
      console.error(`   Response:`, JSON.stringify(response.data, null, 2));
      return false;
    }
  } catch (error) {
    console.error(`   ❌ Error:`, error.message);
    return false;
  }
}

async function main() {
  const token = process.env.VERCEL_TOKEN || '2MLfXoXXv8hIaHIE7lQcdQ39';
  const clientSecret = process.env.FITBIT_CLIENT_SECRET;
  
  if (!clientSecret) {
    console.error('❌ FITBIT_CLIENT_SECRET environment variable is required');
    console.error('\nUsage:');
    console.error('  export VERCEL_TOKEN=your_token (optional, defaults to known token)');
    console.error('  export FITBIT_CLIENT_SECRET=your_fitbit_client_secret');
    console.error('  node scripts/add-fitbit-env-to-vercel.js');
    console.error('\nTo get your Fitbit Client Secret:');
    console.error('1. Go to https://dev.fitbit.com/apps');
    console.error('2. Select your app (Client ID: 23TPZH)');
    console.error('3. Copy the Client Secret');
    process.exit(1);
  }

  console.log(`\n🚀 Adding Fitbit OAuth Environment Variables to Vercel`);
  console.log(`   Project: ${PROJECT_NAME}`);
  console.log(`   Client ID: ${FITBIT_CLIENT_ID}`);
  console.log(`   Redirect URI: ${FITBIT_REDIRECT_URI}`);

  const envVars = [
    { key: 'FITBIT_CLIENT_ID', value: FITBIT_CLIENT_ID },
    { key: 'FITBIT_CLIENT_SECRET', value: clientSecret },
    { key: 'FITBIT_REDIRECT_URI', value: FITBIT_REDIRECT_URI },
  ];

  let successCount = 0;
  let failCount = 0;

  for (const envVar of envVars) {
    const success = await addOrUpdateEnvVar(token, envVar.key, envVar.value);
    if (success) {
      successCount++;
    } else {
      failCount++;
    }
    
    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log(`\n📊 Summary:`);
  console.log(`   ✅ Success: ${successCount}`);
  console.log(`   ❌ Failed: ${failCount}`);
  
  if (failCount === 0) {
    console.log(`\n🎉 All Fitbit environment variables added successfully!`);
    console.log(`\n⚠️  Note: You may need to trigger a new deployment for changes to take effect.`);
    console.log(`   The variables are now available in Production, Preview, and Development environments.`);
  } else {
    console.log(`\n⚠️  Some variables failed to add. Check the errors above.`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});

