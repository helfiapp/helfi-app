#!/usr/bin/env node

/**
 * Script to create Practitioner Listing product and price in Stripe
 * Then add the price ID to Vercel environment variables
 * 
 * Usage:
 *   STRIPE_SECRET_KEY=sk_test_... VERCEL_TOKEN=your_token node scripts/create-practitioner-listing-product.js [test|live]
 */

const Stripe = require('stripe');
const https = require('https');

const PROJECT_NAME = 'helfi-app';
const PRODUCT_NAME = 'Practitioner Listing';
const PRODUCT_DESCRIPTION = 'Monthly subscription to keep a practitioner listing active after the free review period. USD $4.95 per month per listing.';
const PRICE_AMOUNT = 495; // $4.95 in cents
const CURRENCY = 'usd';
const BILLING_INTERVAL = 'month';
const TAX_CODE = 'txcd_10103000'; // Software as a service (SaaS) - personal use
const ENV_VAR_NAME = 'STRIPE_PRICE_PRACTITIONER_LISTING';

function makeVercelRequest(options, data) {
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

async function addPriceIdToVercel(token, priceId) {
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
    key: ENV_VAR_NAME,
    value: priceId,
    type: 'encrypted',
    target: ['production', 'preview', 'development'],
  };

  console.log(`\n📝 Adding price ID to Vercel: ${ENV_VAR_NAME}`);
  console.log(`   Value: ${priceId}`);

  try {
    const response = await makeVercelRequest(options, payload);
    
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
    console.error('Usage: STRIPE_SECRET_KEY=sk_... VERCEL_TOKEN=... node scripts/create-practitioner-listing-product.js [test|live]');
    process.exit(1);
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const vercelToken = process.env.VERCEL_TOKEN;

  if (!stripeSecretKey) {
    console.error('❌ STRIPE_SECRET_KEY environment variable is required');
    console.error(`   Expected: ${mode === 'live' ? 'sk_live_...' : 'sk_test_...'}`);
    process.exit(1);
  }

  if (!vercelToken) {
    console.error('❌ VERCEL_TOKEN environment variable is required');
    process.exit(1);
  }

  // Try to detect if key is encrypted (Vercel encrypted keys are very long base64 strings)
  // Real Stripe keys are ~100-120 chars and start with sk_test_ or sk_live_
  const isEncrypted = stripeSecretKey.length > 200 && !stripeSecretKey.startsWith('sk_');
  
  if (isEncrypted) {
    console.error('❌ The Stripe secret key appears to be encrypted (from Vercel).');
    console.error('   Please provide the actual Stripe secret key:');
    console.error('   - Get it from Stripe Dashboard → Developers → API keys');
    console.error('   - Or from your local .env.local file');
    console.error(`   - For ${mode} mode, it should start with ${mode === 'live' ? 'sk_live_' : 'sk_test_'}`);
    process.exit(1);
  }

  // Validate key prefix matches mode
  if (mode === 'live' && !stripeSecretKey.startsWith('sk_live_')) {
    console.error('❌ For live mode, STRIPE_SECRET_KEY must start with "sk_live_"');
    process.exit(1);
  }

  if (mode === 'test' && !stripeSecretKey.startsWith('sk_test_')) {
    console.error('❌ For test mode, STRIPE_SECRET_KEY must start with "sk_test_"');
    console.error(`   Current key starts with: ${stripeSecretKey.substring(0, 20)}...`);
    process.exit(1);
  }

  console.log(`\n🚀 Creating Practitioner Listing product in Stripe (${mode.toUpperCase()} mode)`);
  console.log(`   Product Name: ${PRODUCT_NAME}`);
  console.log(`   Description: ${PRODUCT_DESCRIPTION}`);
  console.log(`   Price: $${(PRICE_AMOUNT / 100).toFixed(2)} ${CURRENCY.toUpperCase()}`);
  console.log(`   Billing: ${BILLING_INTERVAL}ly recurring`);

  const stripe = new Stripe(stripeSecretKey, { apiVersion: '2024-06-20' });

  try {
    // Step 1: Create the product
    console.log('\n📦 Step 1: Creating product...');
    const product = await stripe.products.create({
      name: PRODUCT_NAME,
      description: PRODUCT_DESCRIPTION,
      tax_code: TAX_CODE,
    });
    console.log(`   ✅ Product created: ${product.id}`);
    console.log(`   Name: ${product.name}`);

    // Step 2: Create the recurring price
    console.log('\n💰 Step 2: Creating recurring price...');
    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: PRICE_AMOUNT,
      currency: CURRENCY,
      recurring: {
        interval: BILLING_INTERVAL,
      },
    });
    console.log(`   ✅ Price created: ${price.id}`);
    console.log(`   Amount: $${(price.unit_amount / 100).toFixed(2)} ${price.currency.toUpperCase()}`);
    console.log(`   Billing: ${price.recurring?.interval}ly`);

    // Step 3: Add price ID to Vercel
    console.log('\n☁️  Step 3: Adding price ID to Vercel...');
    const vercelSuccess = await addPriceIdToVercel(vercelToken, price.id);

    if (!vercelSuccess) {
      console.error('\n⚠️  Product and price created in Stripe, but failed to add to Vercel.');
      console.error(`   Please manually add ${ENV_VAR_NAME}=${price.id} to Vercel environment variables.`);
      process.exit(1);
    }

    console.log('\n🎉 Success! Summary:');
    console.log(`   ✅ Product ID: ${product.id}`);
    console.log(`   ✅ Price ID: ${price.id}`);
    console.log(`   ✅ Environment Variable: ${ENV_VAR_NAME}=${price.id}`);
    console.log(`   ✅ Added to Vercel: ${PROJECT_NAME}`);
    console.log('\n⚠️  Note: You may need to trigger a new deployment for the environment variable to take effect.');

  } catch (error) {
    console.error('\n❌ Error creating Stripe product/price:');
    console.error(`   ${error.message}`);
    if (error.raw) {
      console.error(`   Stripe API Error:`, JSON.stringify(error.raw, null, 2));
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
