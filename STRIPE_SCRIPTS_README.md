# Stripe Product Management Scripts

This directory contains scripts to help manage Stripe products for the Helfi application.

## Files

1. **`get-stripe-price-ids.js`** - Retrieves all Price IDs from your Stripe test mode account
2. **`create-stripe-products-live.js`** - Automatically creates all products in Stripe live mode
3. **`STRIPE_PRODUCTS_DOCUMENTATION.md`** - Complete documentation of all products

## Quick Start

### Step 1: Get Test Mode Price IDs

To retrieve all Price IDs from your test mode account:

```bash
# Make sure you have your test mode secret key set
export STRIPE_SECRET_KEY_TEST=sk_test_xxxxxxxxxxxxx

# Run the script
node get-stripe-price-ids.js
```

This will:
- List all products and their Price IDs
- Show which environment variables to use
- Save results to `stripe-test-price-ids.json`

### Step 2: Add Test Mode Price IDs to .env.local

Copy the Price IDs from the script output and add them to your `.env.local`:

```bash
STRIPE_PRICE_20_MONTHLY=price_xxxxxxxxxxxxx
STRIPE_PRICE_30_MONTHLY=price_xxxxxxxxxxxxx
STRIPE_PRICE_50_MONTHLY=price_xxxxxxxxxxxxx
STRIPE_PRICE_CREDITS_250=price_xxxxxxxxxxxxx
STRIPE_PRICE_CREDITS_500=price_xxxxxxxxxxxxx
STRIPE_PRICE_CREDITS_1000=price_xxxxxxxxxxxxx
```

### Step 3: When Going Live - Create Products in Live Mode

**⚠️ WARNING: This creates products that charge REAL money!**

```bash
# Set your LIVE mode secret key
export STRIPE_SECRET_KEY_LIVE=sk_live_xxxxxxxxxxxxx

# Run the creation script
node create-stripe-products-live.js
```

The script will:
- Create all 6 products in Stripe live mode
- Output the new Price IDs
- Save results to `stripe-live-products-created.json`

### Step 4: Update .env.local with Live Mode Price IDs

Replace the test mode Price IDs with the live mode Price IDs from the script output.

Also update your `STRIPE_SECRET_KEY` to use the live key:

```bash
STRIPE_SECRET_KEY=sk_live_xxxxxxxxxxxxx
```

## Products Created

### Monthly Subscriptions
- **$20/month** - 1,000 credits monthly
- **$30/month** - 1,700 credits monthly (Most Popular)
- **$50/month** - 3,000 credits monthly

### One-Time Credit Top-Ups
- **$5** - 250 credits (12 months validity)
- **$10** - 500 credits (12 months validity)
- **$20** - 1,000 credits (12 months validity)

## Troubleshooting

### Script says "Secret key must be a LIVE key"
- Make sure you're using `sk_live_...` for live mode
- Use `sk_test_...` for test mode

### Products already exist
- The script will create new products even if similar ones exist
- You may need to archive old products in Stripe dashboard

### Price IDs not working
- Verify the Price IDs are correct in your `.env.local`
- Make sure you're using test keys with test Price IDs, and live keys with live Price IDs
- Check that the environment variables match what's expected in `app/api/billing/create-checkout-session/route.ts`

## Manual Creation Alternative

If you prefer to create products manually:
1. See `STRIPE_PRODUCTS_DOCUMENTATION.md` for exact product details
2. Create products in Stripe dashboard (test or live mode)
3. Copy Price IDs and add to `.env.local`

## Security Notes

- **Never commit** `.env.local` or files containing secret keys to git
- Test mode keys are safe to use in development
- Live mode keys should be kept secure and only used in production
- The `.gitignore` file should exclude `.env.local` and `*.json` files with sensitive data

