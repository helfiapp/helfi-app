#!/usr/bin/env node

/**
 * Script to verify and update Stripe webhook events
 * Checks if all required events are enabled and updates if needed
 * 
 * Usage:
 *   STRIPE_SECRET_KEY=sk_live_... node scripts/verify-stripe-webhooks.js [webhook-url]
 */

const Stripe = require('stripe');

const REQUIRED_EVENTS = [
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.payment_succeeded',
  'invoice.payment_failed',
  'invoice.paid',
  'charge.refunded',
  'charge.dispute.created',
  'account.updated',
];

function unionEvents(existing, required) {
  const set = new Set(existing || []);
  for (const e of required) set.add(e);
  return Array.from(set).sort();
}

async function main() {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const webhookUrl = process.argv[2];

  if (!stripeSecretKey) {
    console.error('❌ STRIPE_SECRET_KEY environment variable is required');
    console.error('   Usage: STRIPE_SECRET_KEY=sk_live_... node scripts/verify-stripe-webhooks.js [webhook-url]');
    process.exit(1);
  }

  if (!stripeSecretKey.startsWith('sk_live_') && !stripeSecretKey.startsWith('sk_test_')) {
    console.error('❌ STRIPE_SECRET_KEY must start with sk_live_ or sk_test_');
    process.exit(1);
  }

  const mode = stripeSecretKey.startsWith('sk_live_') ? 'LIVE' : 'TEST';
  console.log(`\n🔍 Verifying Stripe Webhooks (${mode} mode)`);
  console.log(`   Required events: ${REQUIRED_EVENTS.length}`);

  const stripe = new Stripe(stripeSecretKey, { apiVersion: '2024-06-20' });

  try {
    // List all webhook endpoints
    const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
    
    if (endpoints.data.length === 0) {
      console.error('\n❌ No webhook endpoints found in Stripe');
      console.error('   Please create a webhook endpoint in Stripe Dashboard first');
      process.exit(1);
    }

    console.log(`\n📋 Found ${endpoints.data.length} webhook endpoint(s):\n`);

    let foundMatch = false;
    let needsUpdate = false;

    for (const endpoint of endpoints.data) {
      const isMatch = !webhookUrl || endpoint.url === webhookUrl;
      const enabledEvents = endpoint.enabled_events || [];
      const missingEvents = REQUIRED_EVENTS.filter(e => !enabledEvents.includes(e));
      const hasAllEvents = missingEvents.length === 0;

      console.log(`   Endpoint: ${endpoint.url}`);
      console.log(`   ID: ${endpoint.id}`);
      console.log(`   Status: ${endpoint.status}`);
      console.log(`   Enabled events: ${enabledEvents.length}`);
      
      if (isMatch) {
        foundMatch = true;
        console.log(`   ✅ This matches the target URL`);
        
        if (!hasAllEvents) {
          console.log(`   ⚠️  Missing events: ${missingEvents.join(', ')}`);
          needsUpdate = true;
        } else {
          console.log(`   ✅ All required events are enabled`);
        }
      } else {
        console.log(`   (Not the target endpoint)`);
      }
      console.log('');
    }

    if (webhookUrl && !foundMatch) {
      console.error(`\n❌ No webhook endpoint found matching: ${webhookUrl}`);
      console.error('   Available endpoints:');
      endpoints.data.forEach(e => console.error(`     - ${e.url}`));
      process.exit(1);
    }

    if (needsUpdate && foundMatch) {
      const targetEndpoint = endpoints.data.find(e => !webhookUrl || e.url === webhookUrl);
      if (targetEndpoint) {
        console.log(`\n🔄 Updating webhook endpoint: ${targetEndpoint.url}`);
        const updatedEvents = unionEvents(targetEndpoint.enabled_events, REQUIRED_EVENTS);
        
        const updated = await stripe.webhookEndpoints.update(targetEndpoint.id, {
          enabled_events: updatedEvents,
        });

        console.log(`   ✅ Updated! Now has ${updated.enabled_events?.length || 0} events enabled`);
        console.log(`   Enabled events: ${updated.enabled_events?.join(', ')}`);
      }
    } else if (!needsUpdate && foundMatch) {
      console.log(`\n✅ Webhook configuration is correct - all required events are enabled`);
    }

    // Summary
    console.log(`\n📊 Summary:`);
    console.log(`   Mode: ${mode}`);
    console.log(`   Required events: ${REQUIRED_EVENTS.length}`);
    console.log(`   Required events: ${REQUIRED_EVENTS.join(', ')}`);
    
    if (foundMatch) {
      const targetEndpoint = endpoints.data.find(e => !webhookUrl || e.url === webhookUrl);
      if (targetEndpoint) {
        const enabledEvents = targetEndpoint.enabled_events || [];
        const missingEvents = REQUIRED_EVENTS.filter(e => !enabledEvents.includes(e));
        console.log(`   Current enabled: ${enabledEvents.length}`);
        if (missingEvents.length > 0) {
          console.log(`   ⚠️  Missing: ${missingEvents.join(', ')}`);
        } else {
          console.log(`   ✅ All required events enabled`);
        }
      }
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.raw) {
      console.error('   Stripe API Error:', JSON.stringify(error.raw, null, 2));
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
