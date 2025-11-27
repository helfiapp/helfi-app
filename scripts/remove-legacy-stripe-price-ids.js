#!/usr/bin/env node

/**
 * Script to remove legacy Stripe Price ID environment variables from Vercel via API
 * 
 * Usage:
 *   VERCEL_TOKEN=your_token node scripts/remove-legacy-stripe-price-ids.js
 */

const https = require('https');

const PROJECT_NAME = 'helfi-app';

// Legacy Price IDs to remove (no longer used)
const LEGACY_VARS = [
  'STRIPE_PRICE_PREMIUM_MONTHLY',
  'STRIPE_PRICE_PREMIUM_YEARLY',
  'STRIPE_PRICE_PREMIUM_PLUS_MONTHLY',
  'STRIPE_PRICE_PREMIUM_PLUS_YEARLY',
  'STRIPE_PRICE_CREDITS_100',
];

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

async function deleteEnvVar(token, key) {
  // First, get all env vars to find the ID for this key
  const listOptions = {
    hostname: 'api.vercel.com',
    path: `/v9/projects/${PROJECT_NAME}/env`,
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  };

  try {
    const listResponse = await makeRequest(listOptions);
    
    if (listResponse.status !== 200) {
      console.error(`   ❌ Failed to list env vars: ${listResponse.status}`);
      console.error(`   Response:`, JSON.stringify(listResponse.data, null, 2));
      return false;
    }

    // Find the env var(s) with this key
    const envVars = listResponse.data.envs || [];
    const matchingVars = envVars.filter((env) => env.key === key);

    if (matchingVars.length === 0) {
      console.log(`   ⚠️  Variable "${key}" not found (may already be deleted)`);
      return true; // Not an error - just doesn't exist
    }

    // Delete each matching env var (could be multiple if different environments)
    let deletedCount = 0;
    for (const envVar of matchingVars) {
      const deleteOptions = {
        hostname: 'api.vercel.com',
        path: `/v9/projects/${PROJECT_NAME}/env/${envVar.id}`,
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      };

      const deleteResponse = await makeRequest(deleteOptions);
      
      if (deleteResponse.status === 200 || deleteResponse.status === 204) {
        deletedCount++;
      } else {
        console.error(`   ❌ Failed to delete ${key} (ID: ${envVar.id}): ${deleteResponse.status}`);
        console.error(`   Response:`, JSON.stringify(deleteResponse.data, null, 2));
      }
    }

    if (deletedCount > 0) {
      console.log(`   ✅ Deleted ${deletedCount} instance(s) of "${key}"`);
      return true;
    }

    return false;
  } catch (error) {
    console.error(`   ❌ Error:`, error.message);
    return false;
  }
}

async function main() {
  const token = process.env.VERCEL_TOKEN;
  
  if (!token) {
    console.error('❌ VERCEL_TOKEN environment variable is required');
    console.error('\nTo get a token:');
    console.error('1. Go to https://vercel.com/account/tokens');
    console.error('2. Create a new token with Full Account scope');
    console.error('3. Run: export VERCEL_TOKEN=your_token_here');
    console.error('4. Then run this script again');
    process.exit(1);
  }

  console.log(`\n🗑️  Removing legacy Stripe Price IDs from Vercel`);
  console.log(`   Project: ${PROJECT_NAME}`);
  console.log(`   Variables to remove: ${LEGACY_VARS.length}`);

  let successCount = 0;
  let failCount = 0;
  let notFoundCount = 0;

  for (const envVar of LEGACY_VARS) {
    console.log(`\n📝 Removing: ${envVar}`);
    
    const result = await deleteEnvVar(token, envVar);
    
    if (result) {
      // Check if it was actually deleted or just not found
      const listOptions = {
        hostname: 'api.vercel.com',
        path: `/v9/projects/${PROJECT_NAME}/env`,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      };
      
      const checkResponse = await makeRequest(listOptions);
      if (checkResponse.status === 200) {
        const envVars = checkResponse.data.envs || [];
        const stillExists = envVars.some((env) => env.key === envVar);
        if (!stillExists) {
          successCount++;
        } else {
          notFoundCount++;
        }
      } else {
        successCount++; // Assume success if we can't verify
      }
    } else {
      failCount++;
    }
    
    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log(`\n📊 Summary:`);
  console.log(`   ✅ Successfully deleted: ${successCount}`);
  console.log(`   ⚠️  Not found (already removed): ${notFoundCount}`);
  console.log(`   ❌ Failed: ${failCount}`);
  
  if (failCount === 0) {
    console.log(`\n🎉 Legacy Stripe Price IDs removed successfully!`);
    console.log(`\n⚠️  Note: You may need to trigger a new deployment for changes to take effect.`);
  } else {
    console.log(`\n⚠️  Some variables failed to remove. Check the errors above.`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});

