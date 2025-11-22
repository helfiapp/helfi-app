#!/usr/bin/env node

/**
 * Activate the newly created products in sandbox
 */

const Stripe = require('stripe');

async function activateProducts() {
  const testSecretKey = process.env.STRIPE_TEST_SECRET_KEY;
  const testStripe = new Stripe(testSecretKey, { apiVersion: '2024-06-20' });

  console.log('\n✨ Activating products in SANDBOX...\n');

  const productsToActivate = [
    'Helfi Premium - 500 Credits',
    'Helfi Credit Top-Up - 1,000 Credits',
    'Helfi Credit Top-Up - 500 Credits',
    'Helfi Credit Top-Up - 250 Credits',
    'Helfi Premium Max - 3,000 Credits',
    'Helfi Premium Plus - 1,700 Credits',
    'Helfi Premium - 1,000 Credits',
  ];

  const allProducts = await testStripe.products.list({ limit: 100 });
  
  for (const productName of productsToActivate) {
    const product = allProducts.data.find(p => p.name === productName);
    if (product && !product.active) {
      try {
        await testStripe.products.update(product.id, { active: true });
        console.log(`   ✅ Activated: "${product.name}"`);
      } catch (error) {
        console.error(`   ❌ Failed to activate "${product.name}": ${error.message}`);
      }
    } else if (product && product.active) {
      console.log(`   ℹ️  Already active: "${product.name}"`);
    } else {
      console.log(`   ⚠️  Not found: "${productName}"`);
    }
  }

  console.log('\n✅ Activation completed!\n');
}

activateProducts().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});

