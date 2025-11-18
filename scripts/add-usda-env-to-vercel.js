#!/usr/bin/env node

/**
 * Script to add/update USDA API key environment variable in Vercel via API
 * 
 * Usage:
 *   VERCEL_TOKEN=your_token USDA_API_KEY=your_key node scripts/add-usda-env-to-vercel.js
 */

const https = require('https');

const PROJECT_NAME = 'helfi-app';

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
    type: 'encrypted',
    target: ['production', 'preview', 'development'],
  };

  console.log(`\n📝 Adding/updating: ${key}`);
  console.log(`   Value: ${value.substring(0, 10)}...${value.substring(value.length - 4)} (hidden)`);

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
  const apiKey = process.env.USDA_API_KEY;
  
  if (!apiKey) {
    console.error('❌ USDA_API_KEY environment variable is required');
    console.error('\nUsage:');
    console.error('  export VERCEL_TOKEN=your_token (optional, defaults to known token)');
    console.error('  export USDA_API_KEY=your_usda_api_key');
    console.error('  node scripts/add-usda-env-to-vercel.js');
    console.error('\nTo get your USDA API key:');
    console.error('1. Go to https://fdc.nal.usda.gov/api-guide.html');
    console.error('2. Click "Get an API Key"');
    console.error('3. Sign up/login with data.gov account');
    console.error('4. Copy your API key');
    process.exit(1);
  }

  console.log(`\n🚀 Adding USDA API Key to Vercel`);
  console.log(`   Project: ${PROJECT_NAME}`);

  const success = await addOrUpdateEnvVar(token, 'USDA_API_KEY', apiKey);

  if (success) {
    console.log(`\n🎉 USDA API key added successfully!`);
    console.log(`\n⚠️  Note: Trigger a new deployment for changes to take effect.`);
    console.log(`   The variable is now available in Production, Preview, and Development environments.`);
  } else {
    console.log(`\n⚠️  Failed to add USDA API key. Check the errors above.`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});

