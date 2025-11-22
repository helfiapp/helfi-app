#!/usr/bin/env node

/**
 * Script to check Stripe-related environment variables in Vercel
 * 
 * Usage:
 *   VERCEL_TOKEN=your_token node scripts/check-vercel-stripe-env.js
 */

const https = require('https');

const PROJECT_NAME = 'helfi-app';
const VERCEL_TOKEN = process.env.VERCEL_TOKEN || '2MLfXoXXv8hIaHIE7lQcdQ39';

function makeRequest(options) {
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

    req.end();
  });
}

async function checkEnvVars() {
  console.log('\n🔍 Checking Stripe environment variables in Vercel...\n');

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
    
    if (response.status !== 200) {
      console.error(`❌ Failed to fetch environment variables: ${response.status}`);
      console.error(JSON.stringify(response.data, null, 2));
      process.exit(1);
    }

    const envs = response.data.envs || [];
    const stripeEnvs = envs.filter(env => 
      env.key.includes('STRIPE') || 
      env.key.includes('stripe')
    );

    console.log(`📊 Found ${stripeEnvs.length} Stripe-related environment variables:\n`);

    const categories = {
      'Price IDs': [],
      'API Keys': [],
      'Webhooks': [],
      'Other': [],
    };

    for (const env of stripeEnvs) {
      const key = env.key;
      const value = env.value;
      const isEncrypted = value && value.length > 50; // Encrypted values are longer
      
      let displayValue = isEncrypted ? '[ENCRYPTED]' : value;
      
      // Try to detect what type it is
      if (key.includes('PRICE')) {
        categories['Price IDs'].push({ key, value: displayValue, environments: env.target });
      } else if (key.includes('SECRET_KEY') || key.includes('PUBLISHABLE_KEY')) {
        categories['API Keys'].push({ key, value: displayValue, environments: env.target });
      } else if (key.includes('WEBHOOK')) {
        categories['Webhooks'].push({ key, value: displayValue, environments: env.target });
      } else {
        categories['Other'].push({ key, value: displayValue, environments: env.target });
      }
    }

    // Display by category
    for (const [category, items] of Object.entries(categories)) {
      if (items.length > 0) {
        console.log(`\n${category}:`);
        for (const item of items) {
          const envs = Array.isArray(item.environments) ? item.environments.join(', ') : 'all';
          console.log(`  • ${item.key}`);
          console.log(`    Value: ${item.value}`);
          console.log(`    Environments: ${envs}`);
        }
      }
    }

    console.log('\n✅ Environment variable check completed!\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkEnvVars();

