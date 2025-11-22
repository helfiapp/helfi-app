#!/usr/bin/env node

/**
 * Update Stripe Product Titles/Descriptions with New Credit Amounts
 * 
 * Updates product names and descriptions in both LIVE and SANDBOX Stripe accounts
 * to reflect the new credit amounts:
 * - $10/month → 700 credits
 * - $20/month → 1,400 credits
 * - $30/month → 2,100 credits
 * - $50/month → 3,500 credits
 * 
 * Usage:
 *   node scripts/update-stripe-product-titles.js
 * 
 * Requires environment variables:
 *   STRIPE_LIVE_SECRET_KEY - Live Stripe secret key
 *   STRIPE_TEST_SECRET_KEY - Sandbox/test Stripe secret key
 * 
 * Usage:
 *   STRIPE_LIVE_SECRET_KEY=sk_live_... STRIPE_TEST_SECRET_KEY=sk_test_... node scripts/update-stripe-product-titles.js
 */

const Stripe = require('stripe')

// Credit mapping
const CREDIT_MAP = {
  1000: 700,   // $10/month → 700 credits
  2000: 1400,  // $20/month → 1,400 credits
  3000: 2100,  // $30/month → 2,100 credits
  5000: 3500,  // $50/month → 3,500 credits
}

async function updateProducts(stripe, environment) {
  console.log(`\n🔄 Updating products in ${environment} environment...`)
  
  try {
    // List all products
    const products = await stripe.products.list({ limit: 100, active: true })
    
    console.log(`Found ${products.data.length} products`)
    
    // List all product names for debugging
    console.log(`\nProduct names found:`)
    products.data.forEach(p => {
      console.log(`  - "${p.name}" (ID: ${p.id})`)
    })
    
    // Filter for monthly subscription products - check by price amount instead of name
    const monthlyProducts = []
    
    for (const product of products.data) {
      // Get prices for this product
      const prices = await stripe.prices.list({ product: product.id, limit: 100 })
      
      // Find monthly recurring price
      const monthlyPrice = prices.data.find(p => 
        p.recurring && p.recurring.interval === 'month'
      )
      
      if (monthlyPrice) {
        const amountCents = monthlyPrice.unit_amount
        // Check if this matches one of our subscription tiers
        if (CREDIT_MAP[amountCents]) {
          monthlyProducts.push({ product, monthlyPrice })
        }
      }
    }
    
    console.log(`\nFound ${monthlyProducts.length} monthly subscription products to update`)
    
    for (const { product, monthlyPrice } of monthlyProducts) {
      const amountCents = monthlyPrice.unit_amount
      const credits = CREDIT_MAP[amountCents]
      
      if (!credits) {
        console.log(`⚠️  Skipping ${product.name} - unknown price amount: ${amountCents}`)
        continue
      }
      
      const priceDollars = amountCents / 100
      const newName = `$${priceDollars}/month (${credits.toLocaleString()} credits)`
      const newDescription = `Monthly subscription with ${credits.toLocaleString()} credits per month`
      
      // Check if update is needed
      if (product.name === newName && product.description === newDescription) {
        console.log(`✓  ${product.name} - already up to date`)
        continue
      }
      
      // Update product
      try {
        await stripe.products.update(product.id, {
          name: newName,
          description: newDescription,
        })
        console.log(`✅ Updated: "${product.name}" → "${newName}"`)
      } catch (error) {
        console.error(`❌ Error updating ${product.name}:`, error.message)
      }
    }
    
    console.log(`\n✅ Completed updating ${environment} environment`)
    
  } catch (error) {
    console.error(`❌ Error in ${environment} environment:`, error.message)
    throw error
  }
}

async function main() {
  const liveKey = process.env.STRIPE_LIVE_SECRET_KEY?.trim()
  const testKey = process.env.STRIPE_TEST_SECRET_KEY?.trim()
  
  if (!liveKey || !liveKey.startsWith('sk_live_')) {
    console.error('❌ STRIPE_LIVE_SECRET_KEY is required and must start with sk_live_')
    process.exit(1)
  }
  
  if (!testKey || !testKey.startsWith('sk_test_')) {
    console.error('❌ STRIPE_TEST_SECRET_KEY is required and must start with sk_test_')
    process.exit(1)
  }
  
  console.log('🚀 Starting Stripe product title updates...')
  console.log('📋 New credit amounts:')
  console.log('   $10/month → 700 credits')
  console.log('   $20/month → 1,400 credits')
  console.log('   $30/month → 2,100 credits')
  console.log('   $50/month → 3,500 credits')
  
  const stripeLive = new Stripe(liveKey, { apiVersion: '2024-06-20' })
  const stripeTest = new Stripe(testKey, { apiVersion: '2024-06-20' })
  
  try {
    // Update live first
    await updateProducts(stripeLive, 'LIVE')
    
    // Then update sandbox
    await updateProducts(stripeTest, 'SANDBOX')
    
    console.log('\n🎉 All product titles updated successfully!')
    
  } catch (error) {
    console.error('\n❌ Failed to update products:', error)
    process.exit(1)
  }
}

main()

