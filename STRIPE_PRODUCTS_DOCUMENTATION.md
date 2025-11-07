# Stripe Products Documentation

This document contains all product details for easy reference when recreating products in live mode or troubleshooting.

## Product Overview

All products are configured in **USD** currency and use the tax code: **Software as a service (SaaS) - personal use** (`txcd_10103000`).

---

## Monthly Subscription Plans

### 1. Helfi Premium - 1,000 Credits
- **Product Name**: `Helfi Premium - 1,000 Credits`
- **Description**: `Monthly wallet: 1,000 credits. Credits refresh monthly. No rollover.`
- **Price**: $20.00 USD
- **Billing**: Monthly (recurring)
- **Type**: Subscription
- **Plan ID** (for API): `plan_20_monthly`
- **Environment Variable**: `STRIPE_PRICE_20_MONTHLY`
- **Test Mode Price ID**: `price_1SQfmeFFFsf6Yn8zF2KN3bSw` (from product `prod_TNQdzLWlGqKLXL`)
- **Test Mode Product ID**: `prod_TNQdzLWlGqKLXL`

### 2. Helfi Premium Plus - 1,700 Credits (Most Popular)
- **Product Name**: `Helfi Premium Plus - 1,700 Credits`
- **Description**: `Monthly wallet: 1,700 credits. Credits refresh monthly. No rollover.`
- **Price**: $30.00 USD
- **Billing**: Monthly (recurring)
- **Type**: Subscription
- **Plan ID** (for API): `plan_30_monthly`
- **Environment Variable**: `STRIPE_PRICE_30_MONTHLY`
- **Test Mode Product ID**: `prod_TNQf51fNzsflxB`
- **Test Mode Price ID**: `price_1SQfo6FFFsf6Yn8zdzu0ryTJ`

### 3. Helfi Premium Max - 3,000 Credits
- **Product Name**: `Helfi Premium Max - 3,000 Credits`
- **Description**: `Monthly wallet: 3,000 credits. Credits refresh monthly. No rollover.`
- **Price**: $50.00 USD
- **Billing**: Monthly (recurring)
- **Type**: Subscription
- **Plan ID** (for API): `plan_50_monthly`
- **Environment Variable**: `STRIPE_PRICE_50_MONTHLY`
- **Test Mode Product ID**: `prod_TNQgCgSMkyZyqo`
- **Test Mode Price ID**: `price_1SQfoxFFFsf6Yn8zC9KMyROy`

---

## One-Time Credit Top-Ups (12 Months Validity)

### 4. Helfi Credit Top-Up - 250 Credits
- **Product Name**: `Helfi Credit Top-Up - 250 Credits`
- **Description**: `One-time top-up. Credits valid for 12 months.`
- **Price**: $5.00 USD
- **Billing**: One-time payment
- **Type**: One-time purchase
- **Plan ID** (for API): `credits_250`
- **Environment Variable**: `STRIPE_PRICE_CREDITS_250`
- **Test Mode Product ID**: `prod_TNQhSiTxefLoer`
- **Test Mode Price ID**: `price_1SQfqBFFFsf6Yn8zy1iK0tf9`

### 5. Helfi Credit Top-Up - 500 Credits
- **Product Name**: `Helfi Credit Top-Up - 500 Credits`
- **Description**: `One-time top-up. Credits valid for 12 months.`
- **Price**: $10.00 USD
- **Billing**: One-time payment
- **Type**: One-time purchase
- **Plan ID** (for API): `credits_500`
- **Environment Variable**: `STRIPE_PRICE_CREDITS_500`
- **Test Mode Product ID**: `prod_TNQio5oVSzwiPB`
- **Test Mode Price ID**: `price_1SQfqxFFFsf6Yn8z3WoELRQs`

### 6. Helfi Credit Top-Up - 1,000 Credits
- **Product Name**: `Helfi Credit Top-Up - 1,000 Credits`
- **Description**: `One-time top-up. Credits valid for 12 months.`
- **Price**: $20.00 USD
- **Billing**: One-time payment
- **Type**: One-time purchase
- **Plan ID** (for API): `credits_1000`
- **Environment Variable**: `STRIPE_PRICE_CREDITS_1000`
- **Test Mode Product ID**: `prod_TNQjKhqEq4Ct9D`
- **Test Mode Price ID**: `price_1SQfraFFFsf6Yn8z8uipLLdg`

---

## Environment Variables Template

After creating products in live mode, add these to your `.env.local`:

```bash
# Monthly Subscription Plans
STRIPE_PRICE_20_MONTHLY=price_xxxxxxxxxxxxx
STRIPE_PRICE_30_MONTHLY=price_xxxxxxxxxxxxx
STRIPE_PRICE_50_MONTHLY=price_xxxxxxxxxxxxx

# One-Time Credit Top-Ups
STRIPE_PRICE_CREDITS_250=price_xxxxxxxxxxxxx
STRIPE_PRICE_CREDITS_500=price_xxxxxxxxxxxxx
STRIPE_PRICE_CREDITS_1000=price_xxxxxxxxxxxxx

# Stripe Secret Key (LIVE mode)
STRIPE_SECRET_KEY=sk_live_xxxxxxxxxxxxx
```

---

## Going Live Checklist

When you're ready to go live:

1. ✅ **Test all products in test mode** (Already done!)
2. ⬜ **Run the automation script** (`node create-stripe-products-live.js`)
   - Set `STRIPE_SECRET_KEY_LIVE` environment variable first
   - Script will create all products and output Price IDs
3. ⬜ **Update `.env.local`** with live mode Price IDs
4. ⬜ **Update `STRIPE_SECRET_KEY`** to use live key (starts with `sk_live_`)
5. ⬜ **Test checkout flow** with a real test card in live mode
6. ⬜ **Update webhook endpoint** to handle live mode events
7. ⬜ **Deploy to production**

---

## Manual Creation Instructions

If you prefer to create products manually in the Stripe dashboard:

1. Switch to **Live mode** in Stripe dashboard
2. Go to **Products** → **Product catalog**
3. Click **"Add product"**
4. Fill in the fields exactly as listed above for each product
5. Copy the Price ID after creation
6. Add Price IDs to `.env.local`

---

## API Integration

Your application uses these plan IDs when calling the checkout API:

- `plan_20_monthly` → Creates checkout for $20/month subscription
- `plan_30_monthly` → Creates checkout for $30/month subscription
- `plan_50_monthly` → Creates checkout for $50/month subscription
- `credits_250` → Creates checkout for $5 one-time payment
- `credits_500` → Creates checkout for $10 one-time payment
- `credits_1000` → Creates checkout for $20 one-time payment

These plan IDs map to the Price IDs via environment variables in `app/api/billing/create-checkout-session/route.ts`.

---

## Notes

- All prices are in **USD** (United States Dollars)
- Tax code: `txcd_10103000` (Software as a service - personal use)
- Subscription plans are **monthly recurring**
- Credit top-ups are **one-time payments**
- Credit top-ups are valid for **12 months** (handled in application logic, not Stripe)

