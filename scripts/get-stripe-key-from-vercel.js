#!/usr/bin/env node

/**
 * Helper script to get Stripe secret key from Vercel
 * Usage: VERCEL_TOKEN=your_token node scripts/get-stripe-key-from-vercel.js
 */

const https = require('https');

const PROJECT_NAME = 'helfi-app';

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

async function main() {
  const token = process.env.VERCEL_TOKEN;
  
  if (!token) {
    console.error('❌ VERCEL_TOKEN environment variable is required');
    process.exit(1);
  }

  const options = {
    hostname: 'api.vercel.com',
    path: `/v9/projects/${PROJECT_NAME}/env`,
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
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
    const stripeKey = envs.find(env => env.key === 'STRIPE_SECRET_KEY');
    
    if (!stripeKey) {
      console.error('❌ STRIPE_SECRET_KEY not found in Vercel environment variables');
      process.exit(1);
    }

    console.log(`\n✅ Found Stripe Secret Key:`);
    console.log(`   Key: ${stripeKey.key}`);
    console.log(`   Mode: ${stripeKey.value.startsWith('sk_live_') ? 'LIVE' : 'TEST'}`);
    console.log(`   Value: ${stripeKey.value.substring(0, 20)}...${stripeKey.value.substring(stripeKey.value.length - 10)}`);
    console.log(`\n💡 To use this key, run:`);
    console.log(`   export STRIPE_SECRET_KEY="${stripeKey.value}"`);
    console.log(`   node scripts/create-practitioner-listing-product.js ${stripeKey.value.startsWith('sk_live_') ? 'live' : 'test'}`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
