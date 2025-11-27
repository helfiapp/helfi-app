#!/usr/bin/env node

/**
 * Script to update Stripe keys (secret, publishable, webhook) in Vercel via API
 * 
 * Usage:
 *   VERCEL_TOKEN=token node scripts/update-stripe-keys-to-vercel.js
 * 
 * Environment variables required:
 *   - STRIPE_SECRET_KEY_LIVE (live secret key)
 *   - STRIPE_PUBLISHABLE_KEY_LIVE (live publishable key)
 *   - STRIPE_WEBHOOK_SECRET_LIVE (live webhook secret)
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

async function updateEnvVar(token, key, value) {
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

  console.log(`\n📝 Updating: ${key}`);
  console.log(`   Value: ${value.substring(0, 20)}...`);

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
  const token = process.env.VERCEL_TOKEN;
  
  if (!token) {
    console.error('❌ VERCEL_TOKEN environment variable is required');
    process.exit(1);
  }

  const secretKey = process.env.STRIPE_SECRET_KEY_LIVE;
  const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY_LIVE;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET_LIVE;

  if (!secretKey || !publishableKey || !webhookSecret) {
    console.error('❌ Missing required environment variables:');
    if (!secretKey) console.error('   - STRIPE_SECRET_KEY_LIVE');
    if (!publishableKey) console.error('   - STRIPE_PUBLISHABLE_KEY_LIVE');
    if (!webhookSecret) console.error('   - STRIPE_WEBHOOK_SECRET_LIVE');
    console.error('\nUsage:');
    console.error('  export VERCEL_TOKEN=your_token');
    console.error('  export STRIPE_SECRET_KEY_LIVE=sk_live_...');
    console.error('  export STRIPE_PUBLISHABLE_KEY_LIVE=pk_live_...');
    console.error('  export STRIPE_WEBHOOK_SECRET_LIVE=whsec_...');
    console.error('  node scripts/update-stripe-keys-to-vercel.js');
    process.exit(1);
  }

  // Validate keys start with correct prefixes
  if (!secretKey.startsWith('sk_live_')) {
    console.error('❌ STRIPE_SECRET_KEY_LIVE must start with "sk_live_"');
    process.exit(1);
  }
  if (!publishableKey.startsWith('pk_live_')) {
    console.error('❌ STRIPE_PUBLISHABLE_KEY_LIVE must start with "pk_live_"');
    process.exit(1);
  }
  if (!webhookSecret.startsWith('whsec_')) {
    console.error('❌ STRIPE_WEBHOOK_SECRET_LIVE must start with "whsec_"');
    process.exit(1);
  }

  console.log(`\n🚀 Updating Stripe Keys in Vercel (LIVE mode)`);
  console.log(`   Project: ${PROJECT_NAME}`);

  const updates = [
    { key: 'STRIPE_SECRET_KEY', value: secretKey },
    { key: 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY', value: publishableKey },
    { key: 'STRIPE_WEBHOOK_SECRET', value: webhookSecret },
  ];

  let successCount = 0;
  let failCount = 0;

  for (const update of updates) {
    const success = await updateEnvVar(token, update.key, update.value);
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
    console.log(`\n🎉 All Stripe keys updated successfully!`);
    console.log(`\n⚠️  Note: You may need to trigger a new deployment for changes to take effect.`);
  } else {
    console.log(`\n⚠️  Some keys failed to update. Check the errors above.`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});

