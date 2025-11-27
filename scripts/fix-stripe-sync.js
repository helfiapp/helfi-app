#!/usr/bin/env node

/**
 * Fix script to handle products that couldn't be deleted and prices that failed to create
 */

const Stripe = require('stripe');

async function fixSync() {
  const liveSecretKey = process.env.STRIPE_LIVE_SECRET_KEY;
  const testSecretKey = process.env.STRIPE_TEST_SECRET_KEY;

  const liveStripe = new Stripe(liveSecretKey, { apiVersion: '2024-06-20' });
  const testStripe = new Stripe(testSecretKey, { apiVersion: '2024-06-20' });

  console.log('\n🔧 Fixing product sync issues...\n');

  // Step 1: Archive old products instead of deleting
  console.log('📦 Step 1: Archiving old products in SANDBOX...');
  const testProducts = await testStripe.products.list({ limit: 100 });
  
  for (const product of testProducts.data) {
    if (product.active) {
      try {
        await testStripe.products.update(product.id, { active: false });
        console.log(`   ✅ Archived: "${product.name}" (${product.id})`);
      } catch (error) {
        console.error(`   ❌ Failed to archive "${product.name}": ${error.message}`);
      }
    }
  }

  // Step 2: Fetch live products and create missing prices
  console.log('\n📥 Step 2: Fetching LIVE products to fix missing prices...');
  const liveProducts = await liveStripe.products.list({ limit: 100, active: true });
  
  const productsToFix = [
    'Helfi Premium - 500 Credits',
    'Helfi Premium Max - 3,000 Credits',
    'Helfi Premium Plus - 1,700 Credits',
    'Helfi Premium - 1,000 Credits',
  ];

  for (const liveProduct of liveProducts.data) {
    if (productsToFix.includes(liveProduct.name)) {
      console.log(`\n   Fixing: "${liveProduct.name}"`);
      
      // Find the product in sandbox
      const testProductsList = await testStripe.products.list({ limit: 100 });
      const testProduct = testProductsList.data.find(p => p.name === liveProduct.name);
      
      if (!testProduct) {
        console.log(`   ⚠️  Product not found in sandbox, skipping...`);
        continue;
      }

      // Get prices from live product
      const livePrices = await liveStripe.prices.list({ product: liveProduct.id, active: true });
      
      // Check existing prices in sandbox
      const testPrices = await testStripe.prices.list({ product: testProduct.id, active: true });
      
      for (const livePrice of livePrices.data) {
        // Check if price already exists
        const exists = testPrices.data.some(tp => 
          tp.unit_amount === livePrice.unit_amount &&
          tp.currency === livePrice.currency &&
          JSON.stringify(tp.recurring) === JSON.stringify(livePrice.recurring)
        );

        if (!exists && livePrice.unit_amount !== null && livePrice.unit_amount !== undefined) {
          try {
            const priceData = {
              product: testProduct.id,
              unit_amount: livePrice.unit_amount,
              currency: livePrice.currency,
            };
            
            if (livePrice.recurring) {
              priceData.recurring = {
                interval: livePrice.recurring.interval,
              };
            }
            
            if (livePrice.metadata && Object.keys(livePrice.metadata).length > 0) {
              priceData.metadata = livePrice.metadata;
            }
            
            if (livePrice.tax_behavior) {
              priceData.tax_behavior = livePrice.tax_behavior;
            }
            
            const newPrice = await testStripe.prices.create(priceData);
            console.log(`      ✅ Created price: ${livePrice.currency.toUpperCase()} ${(livePrice.unit_amount / 100).toFixed(2)} ${livePrice.recurring ? `(${livePrice.recurring.interval})` : '(one-time)'} (${newPrice.id})`);
          } catch (error) {
            console.error(`      ❌ Failed to create price: ${error.message}`);
            console.error(`      Live price details:`, {
              unit_amount: livePrice.unit_amount,
              currency: livePrice.currency,
              recurring: livePrice.recurring,
            });
          }
        }
      }
    }
  }

  console.log('\n✅ Fix completed!\n');
}

fixSync().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});

