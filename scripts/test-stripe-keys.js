#!/usr/bin/env node

/**
 * Quick test script to verify Stripe API keys work
 */

const Stripe = require('stripe');

async function testKeys() {
  const liveSecretKey = process.env.STRIPE_LIVE_SECRET_KEY?.trim();
  const testSecretKey = process.env.STRIPE_TEST_SECRET_KEY?.trim();

  console.log('\n🔑 Testing Stripe API Keys...\n');

  if (!liveSecretKey) {
    console.error('❌ STRIPE_LIVE_SECRET_KEY is missing');
    process.exit(1);
  }

  if (!testSecretKey) {
    console.error('❌ STRIPE_TEST_SECRET_KEY is missing');
    process.exit(1);
  }

  console.log(`Live key: ${liveSecretKey.substring(0, 20)}...${liveSecretKey.substring(liveSecretKey.length - 10)}`);
  console.log(`Test key: ${testSecretKey.substring(0, 20)}...${testSecretKey.substring(testSecretKey.length - 10)}`);
  console.log(`Live key length: ${liveSecretKey.length}`);
  console.log(`Test key length: ${testSecretKey.length}\n`);

  // Test live key
  console.log('🧪 Testing LIVE key...');
  try {
    const liveStripe = new Stripe(liveSecretKey, { apiVersion: '2024-06-20' });
    const liveAccount = await liveStripe.accounts.retrieve();
    console.log(`   ✅ LIVE key works! Account: ${liveAccount.id}`);
  } catch (error) {
    console.error(`   ❌ LIVE key failed: ${error.message}`);
  }

  // Test test key
  console.log('\n🧪 Testing TEST/SANDBOX key...');
  try {
    const testStripe = new Stripe(testSecretKey, { apiVersion: '2024-06-20' });
    const testAccount = await testStripe.accounts.retrieve();
    console.log(`   ✅ TEST key works! Account: ${testAccount.id}`);
  } catch (error) {
    console.error(`   ❌ TEST key failed: ${error.message}`);
    console.error(`   Error details:`, error.raw || error);
  }

  console.log('\n');
}

testKeys().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});

