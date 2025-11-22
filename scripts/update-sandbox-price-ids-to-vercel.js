#!/usr/bin/env node

/**
 * Script to update Vercel environment variables with new sandbox Stripe Price IDs
 * This should be run AFTER syncing products from live to sandbox
 * 
 * Usage:
 *   VERCEL_TOKEN=token STRIPE_TEST_SECRET_KEY=sk_test_... node scripts/update-sandbox-price-ids-to-vercel.js
 */

const https = require('https');
const Stripe = require('stripe');

const PROJECT_NAME = 'helfi-app';
const VERCEL_TOKEN = process.env.VERCEL_TOKEN || '2MLfXoXXv8hIaHIE7lQcdQ39';

// Map product names and price amounts to environment variable names
// This function will match products based on name and price amount
function getEnvVarForProduct(productName, amount, currency, isRecurring) {
  // Monthly subscriptions
  if (isRecurring) {
    if (productName.includes('Premium - 1,000 Credits') && amount === 20 && currency === 'usd') {
      return 'STRIPE_PRICE_20_MONTHLY';
    }
    if (productName.includes('Premium Plus - 1,700 Credits') && amount === 30 && currency === 'usd') {
      return 'STRIPE_PRICE_30_MONTHLY';
    }
    if (productName.includes('Premium Max - 3,000 Credits') && amount === 50 && currency === 'usd') {
      return 'STRIPE_PRICE_50_MONTHLY';
    }
    if (productName.includes('Premium - 500 Credits') && (amount === 10 || amount === 10.00)) {
      return 'STRIPE_PRICE_10_MONTHLY';
    }
  } else {
    // Credit top-ups (one-time)
    if (productName.includes('Credit Top-Up - 250 Credits') && amount === 5 && currency === 'usd') {
      return 'STRIPE_PRICE_CREDITS_250';
    }
    if (productName.includes('Credit Top-Up - 500 Credits') && amount === 10 && currency === 'usd') {
      return 'STRIPE_PRICE_CREDITS_500';
    }
    if (productName.includes('Credit Top-Up - 1,000 Credits') && amount === 20 && currency === 'usd') {
      return 'STRIPE_PRICE_CREDITS_1000';
    }
  }
  return null;
}

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

async function getEnvVarId(key) {
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
    if (response.status === 200 && response.data.envs) {
      const envVar = response.data.envs.find(e => e.key === key);
      return envVar ? envVar.id : null;
    }
    return null;
  } catch (error) {
    return null;
  }
}

async function updateEnvVar(key, value) {
  // First, try to get existing env var ID
  const envId = await getEnvVarId(key);
  
  let options, payload;
  
  if (envId) {
    // Update existing variable
    options = {
      hostname: 'api.vercel.com',
      path: `/v9/projects/${PROJECT_NAME}/env/${envId}`,
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${VERCEL_TOKEN}`,
        'Content-Type': 'application/json',
      },
    };
    payload = {
      value: value,
      target: ['production', 'preview', 'development'],
    };
  } else {
    // Create new variable
    options = {
      hostname: 'api.vercel.com',
      path: `/v9/projects/${PROJECT_NAME}/env`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${VERCEL_TOKEN}`,
        'Content-Type': 'application/json',
      },
    };
    payload = {
      key: key,
      value: value,
      type: 'encrypted',
      target: ['production', 'preview', 'development'],
    };
  }

  try {
    const response = await makeRequest(options, payload);
    
    if (response.status === 200 || response.status === 201) {
      console.log(`   ✅ ${envId ? 'Updated' : 'Created'}: ${key}`);
      return true;
    } else {
      console.error(`   ❌ Failed to ${envId ? 'update' : 'create'} ${key}: ${response.status}`);
      console.error(JSON.stringify(response.data, null, 2));
      return false;
    }
  } catch (error) {
    console.error(`   ❌ Error ${envId ? 'updating' : 'creating'} ${key}:`, error.message);
    return false;
  }
}

async function main() {
  const testSecretKey = process.env.STRIPE_TEST_SECRET_KEY;

  if (!testSecretKey || !testSecretKey.startsWith('sk_test_')) {
    console.error('❌ STRIPE_TEST_SECRET_KEY is required and must start with sk_test_');
    process.exit(1);
  }

  const testStripe = new Stripe(testSecretKey, { apiVersion: '2024-06-20' });

  console.log('\n🔄 Fetching products and prices from SANDBOX account...\n');

  // Fetch all products
  const products = [];
  let hasMore = true;
  let startingAfter = null;

  while (hasMore) {
    const params = { limit: 100, active: true };
    if (startingAfter) params.starting_after = startingAfter;

    const response = await testStripe.products.list(params);
    products.push(...response.data);
    hasMore = response.has_more;
    if (hasMore && response.data.length > 0) {
      startingAfter = response.data[response.data.length - 1].id;
    }
  }

  console.log(`✅ Found ${products.length} products in SANDBOX account\n`);

  // Fetch prices for each product and map to environment variables
  const updates = [];

  for (const product of products) {
    const prices = await testStripe.prices.list({ product: product.id, active: true });
    
    for (const price of prices.data) {
      const amount = price.unit_amount / 100;
      const currency = price.currency;
      const isRecurring = !!price.recurring;
      
      // Try to match product name and price to environment variable
      const envVarName = getEnvVarForProduct(product.name, amount, currency, isRecurring);
      
      if (envVarName) {
        updates.push({
          envVar: envVarName,
          productName: product.name,
          priceId: price.id,
          amount: amount,
          currency: currency,
          recurring: price.recurring,
        });
        console.log(`📋 Matched: "${product.name}" → ${envVarName}`);
        console.log(`   Price ID: ${price.id}`);
        console.log(`   Amount: ${currency.toUpperCase()} ${amount}${isRecurring ? `/${price.recurring.interval}` : ''}\n`);
        break; // Only use first matching price per product
      }
    }
    
    // If no match found, log it
    if (!updates.some(u => u.productName === product.name)) {
      console.log(`⚠️  No match found for: "${product.name}"`);
      console.log(`   Prices: ${prices.data.map(p => `${p.currency.toUpperCase()} ${p.unit_amount / 100}${p.recurring ? `/${p.recurring.interval}` : ''}`).join(', ')}\n`);
    }
  }

  if (updates.length === 0) {
    console.log('❌ No products matched. Please check PRODUCT_TO_ENV_VAR mapping.');
    process.exit(1);
  }

  console.log(`\n🚀 Updating ${updates.length} environment variables in Vercel...\n`);

  let successCount = 0;
  let failCount = 0;

  for (const update of updates) {
    const success = await updateEnvVar(update.envVar, update.priceId);
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
    console.log(`\n🎉 All environment variables updated successfully!`);
    console.log(`\n⚠️  Note: You may need to trigger a new deployment for changes to take effect.`);
  } else {
    console.log(`\n⚠️  Some variables failed to update. Check the errors above.`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});

