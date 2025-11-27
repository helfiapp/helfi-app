#!/usr/bin/env node

/**
 * Script to sync Stripe products from live account to sandbox account
 * 
 * Usage:
 *   STRIPE_LIVE_SECRET_KEY=sk_live_... STRIPE_TEST_SECRET_KEY=sk_test_... node scripts/sync-stripe-products-live-to-sandbox.js
 */

const Stripe = require('stripe');

async function syncProducts() {
  const liveSecretKey = process.env.STRIPE_LIVE_SECRET_KEY;
  const testSecretKey = process.env.STRIPE_TEST_SECRET_KEY;

  if (!liveSecretKey || !liveSecretKey.startsWith('sk_live_')) {
    console.error('❌ STRIPE_LIVE_SECRET_KEY is required and must start with sk_live_');
    process.exit(1);
  }

  if (!testSecretKey || !testSecretKey.startsWith('sk_test_')) {
    console.error('❌ STRIPE_TEST_SECRET_KEY is required and must start with sk_test_');
    process.exit(1);
  }

  const liveStripe = new Stripe(liveSecretKey, { apiVersion: '2024-06-20' });
  const testStripe = new Stripe(testSecretKey, { apiVersion: '2024-06-20' });

  console.log('\n🔄 Starting product sync from LIVE to SANDBOX...\n');

  // Step 1: Fetch all products from live account
  console.log('📥 Step 1: Fetching products from LIVE account...');
  const liveProducts = [];
  let hasMore = true;
  let startingAfter = null;

  while (hasMore) {
    const params = { limit: 100, active: true };
    if (startingAfter) params.starting_after = startingAfter;

    const response = await liveStripe.products.list(params);
    liveProducts.push(...response.data);
    hasMore = response.has_more;
    if (hasMore && response.data.length > 0) {
      startingAfter = response.data[response.data.length - 1].id;
    }
  }

  console.log(`   ✅ Found ${liveProducts.length} products in LIVE account`);

  // Step 2: Fetch prices for each product
  console.log('\n📥 Step 2: Fetching prices for LIVE products...');
  const liveProductsWithPrices = [];

  for (const product of liveProducts) {
    const prices = await liveStripe.prices.list({ product: product.id, active: true });
    liveProductsWithPrices.push({
      product,
      prices: prices.data,
    });
    console.log(`   ✅ Product "${product.name}": ${prices.data.length} price(s)`);
  }

  // Step 3: Delete all existing products in sandbox
  console.log('\n🗑️  Step 3: Deleting existing products in SANDBOX account...');
  const testProducts = [];
  hasMore = true;
  startingAfter = null;

  while (hasMore) {
    const params = { limit: 100 };
    if (startingAfter) params.starting_after = startingAfter;

    const response = await testStripe.products.list(params);
    testProducts.push(...response.data);
    hasMore = response.has_more;
    if (hasMore && response.data.length > 0) {
      startingAfter = response.data[response.data.length - 1].id;
    }
  }

  console.log(`   Found ${testProducts.length} products in SANDBOX account`);

  for (const product of testProducts) {
    try {
      await testStripe.products.del(product.id);
      console.log(`   ✅ Deleted: "${product.name}" (${product.id})`);
    } catch (error) {
      console.error(`   ❌ Failed to delete "${product.name}": ${error.message}`);
    }
  }

  // Step 4: Create products in sandbox matching live products
  console.log('\n✨ Step 4: Creating products in SANDBOX account...');
  const createdProducts = [];

  for (const { product, prices } of liveProductsWithPrices) {
    try {
      // Create product
      const newProduct = await testStripe.products.create({
        name: product.name,
        description: product.description || undefined,
        images: product.images || undefined,
        metadata: product.metadata || {},
        tax_code: product.tax_code || 'txcd_10103000', // Default to SaaS
      });

      console.log(`   ✅ Created product: "${newProduct.name}" (${newProduct.id})`);

      // Create prices for this product
      const createdPrices = [];
      for (const price of prices) {
        try {
          const newPrice = await testStripe.prices.create({
            product: newProduct.id,
            unit_amount: price.unit_amount,
            currency: price.currency,
            recurring: price.recurring || undefined,
            metadata: price.metadata || {},
            tax_behavior: price.tax_behavior || undefined,
          });

          createdPrices.push(newPrice);
          console.log(`      ✅ Created price: ${price.currency.toUpperCase()} ${(price.unit_amount / 100).toFixed(2)} ${price.recurring ? `(${price.recurring.interval})` : '(one-time)'} (${newPrice.id})`);
        } catch (error) {
          console.error(`      ❌ Failed to create price: ${error.message}`);
        }
      }

      createdProducts.push({
        product: newProduct,
        prices: createdPrices,
        originalProduct: product,
      });
    } catch (error) {
      console.error(`   ❌ Failed to create product "${product.name}": ${error.message}`);
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`   ✅ Created ${createdProducts.length} products in SANDBOX`);
  console.log(`   ✅ Total prices created: ${createdProducts.reduce((sum, p) => sum + p.prices.length, 0)}`);

  // Step 5: Display mapping for environment variables
  console.log('\n📋 Price ID Mapping (for Vercel environment variables):');
  console.log('\n   You may need to update these environment variables in Vercel:');
  
  const priceMappings = [];
  for (const { product, prices, originalProduct } of createdProducts) {
    for (const price of prices) {
      // Try to match with original price
      const originalPrice = prices.find(p => 
        p.unit_amount === price.unit_amount && 
        p.currency === price.currency &&
        (p.recurring?.interval === price.recurring?.interval || (!p.recurring && !price.recurring))
      );
      
      priceMappings.push({
        productName: product.name,
        newPriceId: price.id,
        amount: price.unit_amount / 100,
        currency: price.currency,
        recurring: price.recurring,
      });
    }
  }

  // Group by product name and display
  const grouped = {};
  for (const mapping of priceMappings) {
    if (!grouped[mapping.productName]) {
      grouped[mapping.productName] = [];
    }
    grouped[mapping.productName].push(mapping);
  }

  for (const [productName, mappings] of Object.entries(grouped)) {
    console.log(`\n   ${productName}:`);
    for (const mapping of mappings) {
      const interval = mapping.recurring ? `/${mapping.recurring.interval}` : '';
      console.log(`     - ${mapping.currency.toUpperCase()} ${mapping.amount}${interval}: ${mapping.newPriceId}`);
    }
  }

  console.log('\n✅ Product sync completed!\n');
}

syncProducts().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});

