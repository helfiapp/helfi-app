# Practitioner Listing Stripe Setup

This document outlines the setup for the Practitioner Listing Stripe product and price.

## Overview

- **Product Name**: Practitioner Listing
- **Description**: Monthly subscription to keep a practitioner listing active after the free review period. USD $4.95 per month per listing.
- **Price**: $4.95 USD per month (recurring)
- **Currency**: USD
- **Billing**: Monthly recurring
- **Trial**: None (the free 2-month period is handled inside the app after approval)

## Completed Tasks

✅ **Webhook Events Updated**
- Added `invoice.payment_succeeded` and `invoice.payment_failed` to the required webhook events list
- File: `app/api/admin/stripe/ensure-webhooks/route.ts`
- All required events are now:
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.payment_succeeded` ✅ NEW
  - `invoice.payment_failed` ✅ NEW
  - `invoice.paid`
  - `charge.refunded`
  - `charge.dispute.created`
  - `account.updated`

✅ **Stripe Product Created (LIVE MODE)**
- Product ID: `prod_Tmy87qFwsX1ViJ`
- Price ID: `price_1SpOCLFFFsf6Yn8zOTYwEyOx`
- Environment Variable: `STRIPE_PRICE_PRACTITIONER_LISTING` = `price_1SpOCLFFFsf6Yn8zOTYwEyOx`
- ✅ Added to Vercel environment variables

✅ **Scripts Created**
- `scripts/create-practitioner-listing-product.js` - Creates product and price, then adds to Vercel
- `scripts/get-stripe-key-from-vercel.js` - Helper to get Stripe key from Vercel (encrypted)
- `app/api/admin/stripe/create-practitioner-product/route.ts` - Admin API endpoint alternative

## Remaining Tasks

### Create Test Mode Product (Optional)
If you need to test in Stripe test mode, create the product there as well:
```bash
export STRIPE_SECRET_KEY="sk_test_..." # Get from Stripe Dashboard
export VERCEL_TOKEN="2MLfXoXXv8hIaHIE7lQcdQ39"
node scripts/create-practitioner-listing-product.js test
```

### Option 1: Run the Script (Recommended)

1. **Get your Stripe Secret Key**:
   - Go to [Stripe Dashboard](https://dashboard.stripe.com/test/apikeys) (Test mode)
   - Or [Stripe Dashboard](https://dashboard.stripe.com/apikeys) (Live mode)
   - Copy the **Secret key** (starts with `sk_test_` for test or `sk_live_` for live)

2. **Run the script**:
   ```bash
   export STRIPE_SECRET_KEY="sk_test_..." # or sk_live_... for live mode
   export VERCEL_TOKEN="2MLfXoXXv8hIaHIE7lQcdQ39"
   node scripts/create-practitioner-listing-product.js test  # or 'live' for production
   ```

3. **The script will**:
   - Create the product in Stripe
   - Create the recurring price ($4.95/month)
   - Add `STRIPE_PRICE_PRACTITIONER_LISTING` to Vercel environment variables

### Option 2: Use Admin API Endpoint

1. **Get an admin token**:
   - Log into the admin panel
   - Get your JWT token from the authentication response

2. **Call the API endpoint**:
   ```bash
   curl -X POST https://your-domain.com/api/admin/stripe/create-practitioner-product \
     -H "Authorization: Bearer YOUR_ADMIN_JWT_TOKEN" \
     -H "Content-Type: application/json"
   ```

3. **Manually add the price ID to Vercel**:
   - Use the response from the API to get the price ID
   - Add `STRIPE_PRICE_PRACTITIONER_LISTING` environment variable in Vercel dashboard
   - Or use: `node scripts/add-stripe-price-ids-to-vercel.js` (modified to include this price)

### Option 3: Manual Stripe Dashboard Creation

1. **Create Product in Stripe Dashboard**:
   - Go to [Stripe Products](https://dashboard.stripe.com/test/products) (Test) or [Live Products](https://dashboard.stripe.com/products) (Live)
   - Click "Add product"
   - Name: `Practitioner Listing`
   - Description: `Monthly subscription to keep a practitioner listing active after the free review period. USD $4.95 per month per listing.`
   - Tax code: `txcd_10103000` (Software as a service - personal use)

2. **Create Price**:
   - Price: `$4.95`
   - Billing: `Recurring`
   - Interval: `Monthly`
   - No trial period

3. **Add Price ID to Vercel**:
   - Copy the Price ID (starts with `price_`)
   - Add environment variable `STRIPE_PRICE_PRACTITIONER_LISTING` in Vercel
   - Value: The price ID you copied

## Verify Webhook Events

After creating the product, ensure your Stripe webhook includes all required events:

1. Go to [Stripe Webhooks](https://dashboard.stripe.com/test/webhooks) (Test) or [Live Webhooks](https://dashboard.stripe.com/webhooks) (Live)
2. Select your webhook endpoint (should point to `/api/billing/webhook`)
3. Verify these events are enabled:
   - ✅ `checkout.session.completed`
   - ✅ `customer.subscription.created`
   - ✅ `customer.subscription.updated`
   - ✅ `customer.subscription.deleted`
   - ✅ `invoice.payment_succeeded` (NEW)
   - ✅ `invoice.payment_failed` (NEW)
   - ✅ `invoice.paid`
   - ✅ `charge.refunded`
   - ✅ `charge.dispute.created`
   - ✅ `account.updated`

Or use the admin endpoint to ensure webhooks:
```bash
curl -X POST https://your-domain.com/api/admin/stripe/ensure-webhooks \
  -H "Authorization: Bearer YOUR_ADMIN_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"webhookUrl": "https://your-domain.com/api/billing/webhook"}'
```

## Testing

After setup, test the practitioner listing subscription flow:

1. Create a practitioner listing (or use existing approved listing)
2. Navigate to the practitioner subscription checkout
3. Complete the Stripe checkout flow
4. Verify the subscription is created in Stripe
5. Verify the subscription status is updated in the app database

## Notes

- **Boosts** ($5 / $10 / $15 / $20 for 7 days) do NOT need a Stripe product - they are created as one-time charges on the fly
- The free 2-month period is handled in the app logic, not in Stripe (no trial period configured)
- The price ID will be used in `app/api/practitioner/subscription/checkout/route.ts` which already expects `STRIPE_PRICE_PRACTITIONER_LISTING`
