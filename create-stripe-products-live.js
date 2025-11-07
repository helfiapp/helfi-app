#!/usr/bin/env node
/**
 * Stripe Product Creation Script for Live Mode
 * 
 * This script creates all Helfi products and prices in Stripe LIVE mode.
 * Run this script when you're ready to go live.
 * 
 * Usage:
 *   1. Set STRIPE_SECRET_KEY_LIVE environment variable (starts with sk_live_)
 *   2. Run: node create-stripe-products-live.js
 * 
 * IMPORTANT: This script creates products in LIVE mode and will charge real money!
 * Only run this when you're ready to accept real payments.
 */

const Stripe = require('stripe');

// Get live secret key from environment variable
const stripeSecretKey = process.env.STRIPE_SECRET_KEY_LIVE;

if (!stripeSecretKey) {
  console.error('❌ Error: STRIPE_SECRET_KEY_LIVE environment variable is required');
  console.error('   Set it to your LIVE mode secret key (starts with sk_live_)');
  console.error('   Example: export STRIPE_SECRET_KEY_LIVE=sk_live_...');
  process.exit(1);
}

if (!stripeSecretKey.startsWith('sk_live_')) {
  console.error('❌ Error: Secret key must be a LIVE key (starts with sk_live_)');
  console.error('   You provided a key starting with:', stripeSecretKey.substring(0, 10));
  process.exit(1);
}

const stripe = new Stripe(stripeSecretKey, {
  apiVersion: '2024-06-20',
});

// Product definitions matching your test products
const products = [
  // Monthly Subscription Plans
  {
    name: 'Helfi Premium - 1,000 Credits',
    description: 'Monthly wallet: 1,000 credits. Credits refresh monthly. No rollover.',
    type: 'recurring',
    amount: 2000, // $20.00 in cents
    currency: 'usd',
    interval: 'month',
    planId: 'plan_20_monthly',
    envVar: 'STRIPE_PRICE_20_MONTHLY'
  },
  {
    name: 'Helfi Premium Plus - 1,700 Credits',
    description: 'Monthly wallet: 1,700 credits. Credits refresh monthly. No rollover.',
    type: 'recurring',
    amount: 3000, // $30.00 in cents
    currency: 'usd',
    interval: 'month',
    planId: 'plan_30_monthly',
    envVar: 'STRIPE_PRICE_30_MONTHLY'
  },
  {
    name: 'Helfi Premium Max - 3,000 Credits',
    description: 'Monthly wallet: 3,000 credits. Credits refresh monthly. No rollover.',
    type: 'recurring',
    amount: 5000, // $50.00 in cents
    currency: 'usd',
    interval: 'month',
    planId: 'plan_50_monthly',
    envVar: 'STRIPE_PRICE_50_MONTHLY'
  },
  // One-time Credit Top-Ups
  {
    name: 'Helfi Credit Top-Up - 250 Credits',
    description: 'One-time top-up. Credits valid for 12 months.',
    type: 'one_time',
    amount: 500, // $5.00 in cents
    currency: 'usd',
    planId: 'credits_250',
    envVar: 'STRIPE_PRICE_CREDITS_250'
  },
  {
    name: 'Helfi Credit Top-Up - 500 Credits',
    description: 'One-time top-up. Credits valid for 12 months.',
    type: 'one_time',
    amount: 1000, // $10.00 in cents
    currency: 'usd',
    planId: 'credits_500',
    envVar: 'STRIPE_PRICE_CREDITS_500'
  },
  {
    name: 'Helfi Credit Top-Up - 1,000 Credits',
    description: 'One-time top-up. Credits valid for 12 months.',
    type: 'one_time',
    amount: 2000, // $20.00 in cents
    currency: 'usd',
    planId: 'credits_1000',
    envVar: 'STRIPE_PRICE_CREDITS_1000'
  }
];

async function createProducts() {
  console.log('🚀 Creating Stripe products in LIVE mode...\n');
  console.log('⚠️  WARNING: This will create products that charge REAL money!\n');

  const results = {
    products: [],
    errors: []
  };

  for (const productDef of products) {
    try {
      console.log(`Creating: ${productDef.name}...`);

      // Create product
      const product = await stripe.products.create({
        name: productDef.name,
        description: productDef.description,
        tax_code: 'txcd_10103000', // Software as a service (SaaS) - personal use
      });

      // Create price
      const priceParams = {
        product: product.id,
        currency: productDef.currency,
        unit_amount: productDef.amount,
      };

      if (productDef.type === 'recurring') {
        priceParams.recurring = {
          interval: productDef.interval,
        };
      }

      const price = await stripe.prices.create(priceParams);

      results.products.push({
        name: productDef.name,
        productId: product.id,
        priceId: price.id,
        planId: productDef.planId,
        envVar: productDef.envVar,
        amount: `$${(productDef.amount / 100).toFixed(2)}`,
        type: productDef.type,
      });

      console.log(`  ✅ Created: Product ${product.id}, Price ${price.id}`);
      console.log(`     Add to .env: ${productDef.envVar}=${price.id}\n`);

    } catch (error) {
      console.error(`  ❌ Error creating ${productDef.name}:`, error.message);
      results.errors.push({
        product: productDef.name,
        error: error.message,
      });
    }
  }

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('📋 SUMMARY');
  console.log('='.repeat(60));
  console.log(`✅ Successfully created: ${results.products.length} products`);
  console.log(`❌ Errors: ${results.errors.length}\n`);

  if (results.products.length > 0) {
    console.log('📝 Add these to your .env.local file:\n');
    results.products.forEach(p => {
      console.log(`${p.envVar}=${p.priceId}`);
    });
    console.log('');
  }

  if (results.errors.length > 0) {
    console.log('❌ Errors:\n');
    results.errors.forEach(e => {
      console.log(`  ${e.product}: ${e.error}`);
    });
  }

  // Save results to file
  const fs = require('fs');
  const outputFile = 'stripe-live-products-created.json';
  fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));
  console.log(`\n💾 Results saved to: ${outputFile}`);

  return results;
}

// Run the script
createProducts()
  .then(() => {
    console.log('\n✅ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  });

