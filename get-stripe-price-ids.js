#!/usr/bin/env node
/**
 * Get Stripe Price IDs from Test Mode
 * 
 * This script retrieves all product Price IDs from your Stripe test mode account.
 * Useful for documenting test mode Price IDs before going live.
 * 
 * Usage:
 *   1. Set STRIPE_SECRET_KEY_TEST environment variable (starts with sk_test_)
 *   2. Run: node get-stripe-price-ids.js
 */

const Stripe = require('stripe');

const stripeSecretKey = process.env.STRIPE_SECRET_KEY_TEST || process.env.STRIPE_SECRET_KEY;

if (!stripeSecretKey) {
  console.error('❌ Error: STRIPE_SECRET_KEY_TEST or STRIPE_SECRET_KEY environment variable is required');
  process.exit(1);
}

const stripe = new Stripe(stripeSecretKey, {
  apiVersion: '2024-06-20',
});

async function getPriceIds() {
  console.log('🔍 Retrieving Stripe products and prices...\n');

  try {
    // Get all products
    const products = await stripe.products.list({ limit: 100 });
    
    const results = [];

    for (const product of products.data) {
      // Get prices for this product
      const prices = await stripe.prices.list({
        product: product.id,
        limit: 100,
      });

      for (const price of prices.data) {
        const isRecurring = price.type === 'recurring';
        const amount = (price.unit_amount / 100).toFixed(2);
        const currency = price.currency.toUpperCase();
        
        let envVar = '';
        let planId = '';
        
        // Map to environment variable based on product name
        if (product.name.includes('1,000 Credits') && isRecurring) {
          envVar = 'STRIPE_PRICE_20_MONTHLY';
          planId = 'plan_20_monthly';
        } else if (product.name.includes('1,700 Credits')) {
          envVar = 'STRIPE_PRICE_30_MONTHLY';
          planId = 'plan_30_monthly';
        } else if (product.name.includes('3,000 Credits')) {
          envVar = 'STRIPE_PRICE_50_MONTHLY';
          planId = 'plan_50_monthly';
        } else if (product.name.includes('250 Credits')) {
          envVar = 'STRIPE_PRICE_CREDITS_250';
          planId = 'credits_250';
        } else if (product.name.includes('500 Credits')) {
          envVar = 'STRIPE_PRICE_CREDITS_500';
          planId = 'credits_500';
        } else if (product.name.includes('1,000 Credits') && !isRecurring) {
          envVar = 'STRIPE_PRICE_CREDITS_1000';
          planId = 'credits_1000';
        }

        results.push({
          productName: product.name,
          productId: product.id,
          priceId: price.id,
          amount: `$${amount} ${currency}`,
          type: isRecurring ? 'Recurring' : 'One-time',
          interval: isRecurring ? price.recurring.interval : 'N/A',
          envVar,
          planId,
        });
      }
    }

    // Sort: subscriptions first, then credits
    results.sort((a, b) => {
      if (a.type === 'Recurring' && b.type !== 'Recurring') return -1;
      if (a.type !== 'Recurring' && b.type === 'Recurring') return 1;
      return a.productName.localeCompare(b.productName);
    });

    // Display results
    console.log('📋 Found Products and Prices:\n');
    console.log('='.repeat(80));
    
    results.forEach((r, index) => {
      console.log(`\n${index + 1}. ${r.productName}`);
      console.log(`   Product ID: ${r.productId}`);
      console.log(`   Price ID:   ${r.priceId}`);
      console.log(`   Amount:     ${r.amount}`);
      console.log(`   Type:       ${r.type}${r.interval !== 'N/A' ? ` (${r.interval})` : ''}`);
      if (r.envVar) {
        console.log(`   Env Var:    ${r.envVar}`);
        console.log(`   Plan ID:    ${r.planId}`);
      }
    });

    console.log('\n' + '='.repeat(80));
    console.log('\n📝 Environment Variables for .env.local:\n');
    results.forEach(r => {
      if (r.envVar) {
        console.log(`${r.envVar}=${r.priceId}`);
      }
    });

    // Save to file
    const fs = require('fs');
    const outputFile = 'stripe-test-price-ids.json';
    fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));
    console.log(`\n💾 Results saved to: ${outputFile}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

getPriceIds()
  .then(() => {
    console.log('\n✅ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  });




