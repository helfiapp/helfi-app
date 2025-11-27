#!/usr/bin/env node

/**
 * Script to add/update Stripe Price ID environment variables in Vercel via API
 * 
 * Usage:
 *   VERCEL_TOKEN=your_token node scripts/add-stripe-price-ids-to-vercel.js [test|live]
 * 
 * Or set VERCEL_TOKEN in your environment:
 *   export VERCEL_TOKEN=your_token
 *   node scripts/add-stripe-price-ids-to-vercel.js test
 */

const https = require('https');

const PROJECT_ID = 'prj_0QdxIeqz4oIUEx7aAdLrsjGsqst7';
const PROJECT_NAME = 'helfi-app'; // Try project name as fallback
const ORG_ID = 'team_pPRY3znvYPSvqemdfOEf3vAT';

// Test mode Price IDs (from STRIPE_TEST_PRICE_IDS.md)
const TEST_PRICE_IDS = {
  STRIPE_PRICE_20_MONTHLY: 'price_1SQfmeFFFsf6Yn8zF2KN3bSw',
  STRIPE_PRICE_30_MONTHLY: 'price_1SQfo6FFFsf6Yn8zdzu0ryTJ',
  STRIPE_PRICE_50_MONTHLY: 'price_1SQfoxFFFsf6Yn8zC9KMyROy',
  STRIPE_PRICE_CREDITS_250: 'price_1SQfqBFFFsf6Yn8zy1iK0tf9',
  STRIPE_PRICE_CREDITS_500: 'price_1SQfqxFFFsf6Yn8z3WoELRQs',
  STRIPE_PRICE_CREDITS_1000: 'price_1SQfraFFFsf6Yn8z8uipLLdg',
};

// Live mode Price IDs (from stripe-live-products-created.json)
const LIVE_PRICE_IDS = {
  STRIPE_PRICE_20_MONTHLY: 'price_1SQjscFFFsf6Yn8zZivYYd8P',
  STRIPE_PRICE_30_MONTHLY: 'price_1SQjsdFFFsf6Yn8zM9H2lWS2',
  STRIPE_PRICE_50_MONTHLY: 'price_1SQjsdFFFsf6Yn8z9yhDZn9O',
  STRIPE_PRICE_CREDITS_250: 'price_1SQjseFFFsf6Yn8zwQQTNAkA',
  STRIPE_PRICE_CREDITS_500: 'price_1SQjsfFFFsf6Yn8zJ4acdev9',
  STRIPE_PRICE_CREDITS_1000: 'price_1SQjsgFFFsf6Yn8zjS5ouTq6',
};

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

async function addOrUpdateEnvVar(token, key, mode = 'test') {
  const priceIds = mode === 'live' ? LIVE_PRICE_IDS : TEST_PRICE_IDS;
  const actualValue = priceIds[key];
  
  if (!actualValue) {
    throw new Error(`Price ID not found for ${key} in ${mode} mode`);
  }

  // Try with project name (works better with team tokens)
  // Vercel API accepts project name or ID
  const projectIdentifier = PROJECT_NAME; // Use name instead of ID
  const options = {
    hostname: 'api.vercel.com',
    path: `/v9/projects/${projectIdentifier}/env?upsert=true`,
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  };

  const payload = {
    key: key,
    value: actualValue,
    type: 'encrypted', // Stripe Price IDs are sensitive
    target: ['production', 'preview', 'development'], // Apply to all environments
  };

  console.log(`\n📝 Adding/updating: ${key}`);
  console.log(`   Value: ${actualValue}`);
  console.log(`   Mode: ${mode}`);

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
  const mode = process.argv[2] || 'test';
  
  if (mode !== 'test' && mode !== 'live') {
    console.error('❌ Invalid mode. Use "test" or "live"');
    console.error('Usage: node scripts/add-stripe-price-ids-to-vercel.js [test|live]');
    process.exit(1);
  }

  const token = process.env.VERCEL_TOKEN;
  
  if (!token) {
    console.error('❌ VERCEL_TOKEN environment variable is required');
    console.error('\nTo get a token:');
    console.error('1. Go to https://vercel.com/account/tokens');
    console.error('2. Create a new token');
    console.error('3. Run: export VERCEL_TOKEN=your_token_here');
    console.error('4. Then run this script again');
    process.exit(1);
  }

  console.log(`\n🚀 Adding Stripe Price IDs to Vercel (${mode.toUpperCase()} mode)`);
  console.log(`   Project ID: ${PROJECT_ID}`);
  console.log(`   Org ID: ${ORG_ID}`);

  const envVars = [
    'STRIPE_PRICE_20_MONTHLY',
    'STRIPE_PRICE_30_MONTHLY',
    'STRIPE_PRICE_50_MONTHLY',
    'STRIPE_PRICE_CREDITS_250',
    'STRIPE_PRICE_CREDITS_500',
    'STRIPE_PRICE_CREDITS_1000',
  ];

  let successCount = 0;
  let failCount = 0;

  for (const envVar of envVars) {
    const success = await addOrUpdateEnvVar(token, envVar, mode);
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
    console.log(`\n🎉 All environment variables added successfully!`);
    console.log(`\n⚠️  Note: You may need to trigger a new deployment for changes to take effect.`);
  } else {
    console.log(`\n⚠️  Some variables failed to add. Check the errors above.`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});

