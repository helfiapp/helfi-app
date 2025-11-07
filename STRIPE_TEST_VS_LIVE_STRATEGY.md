# Stripe Test vs Live Mode Strategy

## Answer: Yes, you can create live products now and use test products while testing!

Your application uses environment variables to determine which Stripe mode to use. This means you can:

1. ✅ **Create live products in Stripe now** (using the script or manually)
2. ✅ **Keep using test Price IDs in your code** (via `.env.local`)
3. ✅ **Switch to live Price IDs when ready** (update Vercel environment variables)

---

## How It Works

Your application reads from `process.env.STRIPE_SECRET_KEY` and `process.env.STRIPE_PRICE_*` variables:

- **Development** (`.env.local`): Uses test mode keys and Price IDs
- **Production** (Vercel): Uses whatever environment variables you set (test or live)

The Stripe secret key determines which mode you're in:
- `sk_test_...` = Test mode (no real charges)
- `sk_live_...` = Live mode (real charges)

---

## Recommended Setup

### Step 1: Create Live Products Now

Run the script to create all products in live mode:

```bash
export STRIPE_SECRET_KEY_LIVE=sk_live_xxxxxxxxxxxxx
node create-stripe-products-live.js
```

This will output live mode Price IDs. **Save these for later** - you'll add them to Vercel when ready.

### Step 2: Keep Using Test Mode for Development

Your `.env.local` should have test mode keys and Price IDs:

```bash
# Development - Test Mode
STRIPE_SECRET_KEY=sk_test_xxxxxxxxxxxxx
STRIPE_PRICE_20_MONTHLY=price_1SQfmeFFFsf6Yn8zF2KN3bSw  # Test mode
STRIPE_PRICE_30_MONTHLY=price_1SQfo6FFFsf6Yn8zdzu0ryTJ  # Test mode
# ... etc
```

### Step 3: When Ready to Go Live

Update Vercel environment variables with live mode values:

1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
2. Update `STRIPE_SECRET_KEY` to your live key (`sk_live_...`)
3. Update all `STRIPE_PRICE_*` variables to live mode Price IDs
4. Redeploy

---

## Benefits of This Approach

✅ **No rush** - Live products are ready when you are  
✅ **Safe testing** - Continue using test mode until you're confident  
✅ **Easy switch** - Just update environment variables  
✅ **No code changes** - Same code works for both test and live  

---

## Important Notes

⚠️ **Test and Live are completely separate:**
- Test mode products ≠ Live mode products
- Test mode Price IDs ≠ Live mode Price IDs
- Test mode customers ≠ Live mode customers

⚠️ **Environment Variables Control Everything:**
- The `STRIPE_SECRET_KEY` determines test vs live mode
- The `STRIPE_PRICE_*` variables determine which products are used
- Make sure test keys match test Price IDs, and live keys match live Price IDs

---

## Quick Reference

| Environment | Secret Key | Price IDs | Charges Real Money? |
|------------|------------|-----------|-------------------|
| Development (.env.local) | `sk_test_...` | Test Price IDs | ❌ No |
| Production (Vercel) - Testing | `sk_test_...` | Test Price IDs | ❌ No |
| Production (Vercel) - Live | `sk_live_...` | Live Price IDs | ✅ Yes |

---

## Creating Live Products via API

The `create-stripe-products-live.js` script uses Stripe's API to create products programmatically. This is the recommended approach because:

1. ✅ **Consistent** - Creates all products with exact same settings
2. ✅ **Fast** - Creates all 6 products in seconds
3. ✅ **Accurate** - No manual copy/paste errors
4. ✅ **Documented** - Script shows exactly what was created

You can also create products manually in Stripe dashboard, but the script is faster and more reliable.



