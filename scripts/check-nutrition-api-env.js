#!/usr/bin/env node

/**
 * Script to check and add nutrition API environment variables in Vercel
 */

const https = require('https');

const PROJECT_NAME = 'helfi-app';
const VERCEL_TOKEN = process.env.VERCEL_TOKEN || '2MLfXoXXv8hIaHIE7lQcdQ39';

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

async function getEnvVars() {
  const options = {
    hostname: 'api.vercel.com',
    path: `/v9/projects/${PROJECT_NAME}/env`,
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${VERCEL_TOKEN}`,
    },
  };

  try {
    const response = await makeRequest(options);
    if (response.status === 200) {
      return response.data.envs || [];
    }
    return [];
  } catch (error) {
    console.error('Error fetching env vars:', error.message);
    return [];
  }
}

async function addOrUpdateEnvVar(key, value) {
  const options = {
    hostname: 'api.vercel.com',
    path: `/v9/projects/${PROJECT_NAME}/env?upsert=true`,
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${VERCEL_TOKEN}`,
      'Content-Type': 'application/json',
    },
  };

  const payload = {
    key: key,
    value: value,
    type: 'encrypted',
    target: ['production', 'preview', 'development'],
  };

  try {
    const response = await makeRequest(options, payload);
    return response.status === 200 || response.status === 201;
  } catch (error) {
    console.error(`Error adding ${key}:`, error.message);
    return false;
  }
}

async function main() {
  console.log('\n🔍 Checking Nutrition API Environment Variables...\n');

  const envVars = await getEnvVars();
  const envMap = {};
  envVars.forEach(env => {
    envMap[env.key] = env;
  });

  const requiredVars = [
    'FATSECRET_CLIENT_ID',
    'FATSECRET_CLIENT_SECRET',
    'USDA_API_KEY',
  ];

  console.log('📋 Current Status:');
  for (const key of requiredVars) {
    const exists = envMap[key];
    if (exists) {
      const value = exists.value || '***';
      const preview = key.includes('SECRET') || key.includes('KEY')
        ? `${value.substring(0, 10)}...${value.substring(value.length - 4)}`
        : value;
      console.log(`   ✅ ${key}: ${preview}`);
    } else {
      console.log(`   ❌ ${key}: MISSING`);
    }
  }

  console.log('\n📊 Summary:');
  const missing = requiredVars.filter(key => !envMap[key]);
  if (missing.length === 0) {
    console.log('   ✅ All required environment variables are configured!');
  } else {
    console.log(`   ⚠️  Missing: ${missing.join(', ')}`);
    console.log('\n💡 To add missing variables:');
    if (missing.includes('USDA_API_KEY')) {
      console.log('   1. Get USDA API key from: https://fdc.nal.usda.gov/api-guide.html');
      console.log('   2. Run: USDA_API_KEY=your_key node scripts/add-usda-env-to-vercel.js');
    }
  }

  console.log('\n');
}

main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});

