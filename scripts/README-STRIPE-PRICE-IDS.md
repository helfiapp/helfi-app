# Adding Stripe Price IDs to Vercel via API

This script automatically adds/updates all 6 Stripe Price ID environment variables in your Vercel project.

## Prerequisites

1. **Get a Vercel API Token:**
   - Go to https://vercel.com/account/tokens
   - Click "Create Token"
   - Give it a name (e.g., "Stripe Price IDs Update")
   - Copy the token (you won't see it again!)

## Usage

### Option 1: Set token as environment variable (recommended)

```bash
export VERCEL_TOKEN=your_token_here
node scripts/add-stripe-price-ids-to-vercel.js test
```

### Option 2: Inline token (less secure)

```bash
VERCEL_TOKEN=your_token_here node scripts/add-stripe-price-ids-to-vercel.js test
```

## Modes

- **`test`** (default): Uses test mode Price IDs from `STRIPE_TEST_PRICE_IDS.md`
- **`live`**: Uses live mode Price IDs from `stripe-live-products-created.json`

## What it does

The script will add/update these 6 environment variables in Vercel:

1. `STRIPE_PRICE_20_MONTHLY` - $20/month subscription
2. `STRIPE_PRICE_30_MONTHLY` - $30/month subscription  
3. `STRIPE_PRICE_50_MONTHLY` - $50/month subscription
4. `STRIPE_PRICE_CREDITS_250` - $5 credit top-up
5. `STRIPE_PRICE_CREDITS_500` - $10 credit top-up
6. `STRIPE_PRICE_CREDITS_1000` - $20 credit top-up

All variables are set for **production**, **preview**, and **development** environments.

## Example Output

```
🚀 Adding Stripe Price IDs to Vercel (TEST mode)
   Project ID: prj_0QdxIeqz4oIUEx7aAdLrsjGsqst7
   Org ID: team_pPRY3znvYPSvqemdfOEf3vAT

📝 Adding/updating: STRIPE_PRICE_20_MONTHLY
   Value: price_1SQfmeFFFsf6Yn8zF2KN3bSw
   Mode: test
   ✅ Success!

...

📊 Summary:
   ✅ Success: 6
   ❌ Failed: 0

🎉 All environment variables added successfully!

⚠️  Note: You may need to trigger a new deployment for changes to take effect.
```

## Troubleshooting

- **"VERCEL_TOKEN environment variable is required"**: Make sure you've exported the token or included it in the command
- **"Invalid mode"**: Use either `test` or `live` as the argument
- **401 Unauthorized**: Your token might be invalid or expired. Create a new one.
- **404 Not Found**: Check that the project ID in `.vercel/project.json` matches your Vercel project

## After Running

After successfully adding the variables:
1. Go to your Vercel dashboard to verify they appear
2. Trigger a new deployment (or wait for the next Git push)
3. The new Price IDs will be active in your next deployment

