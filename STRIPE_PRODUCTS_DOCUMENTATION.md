# Stripe Products Documentation

This document contains all product details, environment configuration, and automated instructions for switching between test and live modes.

## Current Status

**✅ Currently Active: TEST MODE (Sandbox)**
- Test Stripe Price IDs are configured in Vercel
- Stripe keys are in test mode (`sk_test_`, `pk_test_`)
- All 6 Price ID environment variables are set in Vercel

---

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
- **Test Mode Product ID**: `prod_TNQdzLWlGqKLXL`
- **Test Mode Price ID**: `price_1SQfmeFFFsf6Yn8zF2KN3bSw`
- **Live Mode Product ID**: `prod_TNUsJSTXq6oWo9`
- **Live Mode Price ID**: `price_1SQjscFFFsf6Yn8zZivYYd8P`

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
- **Live Mode Product ID**: `prod_TNUsDJ8hmSNpGI`
- **Live Mode Price ID**: `price_1SQjsdFFFsf6Yn8zM9H2lWS2`

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
- **Live Mode Product ID**: `prod_TNUsj5AdNPmP17`
- **Live Mode Price ID**: `price_1SQjsdFFFsf6Yn8z9yhDZn9O`

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
- **Live Mode Product ID**: `prod_TNUswpRoTXGu0p`
- **Live Mode Price ID**: `price_1SQjseFFFsf6Yn8zwQQTNAkA`

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
- **Live Mode Product ID**: `prod_TNUsgRw1HrAoZq`
- **Live Mode Price ID**: `price_1SQjsfFFFsf6Yn8zJ4acdev9`

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
- **Live Mode Product ID**: `prod_TNUszhkUKrrZpt`
- **Live Mode Price ID**: `price_1SQjsgFFFsf6Yn8zjS5ouTq6`

---

## Vercel Configuration

### Project Information
- **Project Name**: `helfi-app`
- **Project ID**: `prj_0QdxIeqz4oIUEx7aAdLrsjGsqst7`
- **Organization ID**: `team_pPRY3znvYPSvqemdfOEf3vAT`
- **Vercel API Token**: `2MLfXoXXv8hIaHIE7lQcdQ39` (Full Account scope, never expires)

### Current Environment Variables in Vercel

**Test Mode (Currently Active):**
- `STRIPE_PRICE_20_MONTHLY` = `price_1SQfmeFFFsf6Yn8zF2KN3bSw`
- `STRIPE_PRICE_30_MONTHLY` = `price_1SQfo6FFFsf6Yn8zdzu0ryTJ`
- `STRIPE_PRICE_50_MONTHLY` = `price_1SQfoxFFFsf6Yn8zC9KMyROy`
- `STRIPE_PRICE_CREDITS_250` = `price_1SQfqBFFFsf6Yn8zy1iK0tf9`
- `STRIPE_PRICE_CREDITS_500` = `price_1SQfqxFFFsf6Yn8z3WoELRQs`
- `STRIPE_PRICE_CREDITS_1000` = `price_1SQfraFFFsf6Yn8z8uipLLdg`

**Live Mode (Ready to Deploy):**
- `STRIPE_PRICE_20_MONTHLY` = `price_1SQjscFFFsf6Yn8zZivYYd8P`
- `STRIPE_PRICE_30_MONTHLY` = `price_1SQjsdFFFsf6Yn8zM9H2lWS2`
- `STRIPE_PRICE_50_MONTHLY` = `price_1SQjsdFFFsf6Yn8z9yhDZn9O`
- `STRIPE_PRICE_CREDITS_250` = `price_1SQjseFFFsf6Yn8zwQQTNAkA`
- `STRIPE_PRICE_CREDITS_500` = `price_1SQjsfFFFsf6Yn8zJ4acdev9`
- `STRIPE_PRICE_CREDITS_1000` = `price_1SQjsgFFFsf6Yn8zjS5ouTq6`

---

## Stripe Keys

### Test Mode (Currently Active)
- **Secret Key**: `sk_test_51ReqtAFSnqvQfdbEaxSG...` (starts with `sk_test_`)
- **Publishable Key**: `pk_test_51ReqtAFSnqvQfdbEPWvg...` (starts with `pk_test_`)
- **Webhook Secret**: `whsec_ELv054vW8dH5uzeb8cIzcQ5...` (starts with `whsec_`)

### Live Mode (Ready to Deploy)
- **Secret Key**: `sk_live_...` (See Vercel environment variables or contact admin)
- **Publishable Key**: `pk_live_...` (See Vercel environment variables or contact admin)
- **Webhook Secret**: `whsec_...` (See Vercel environment variables or contact admin)

**⚠️ IMPORTANT**: All live Stripe keys are now documented. An agent can automatically update all Vercel environment variables to switch from test mode to live mode.

---

## Automated Scripts

### Available Scripts

1. **`scripts/add-stripe-price-ids-to-vercel.js`**
   - Adds/updates Stripe Price ID environment variables in Vercel
   - Usage: `VERCEL_TOKEN=token node scripts/add-stripe-price-ids-to-vercel.js [test|live]`
   - Supports both test and live modes

2. **`scripts/remove-legacy-stripe-price-ids.js`**
   - Removes old/legacy Stripe Price ID variables
   - Usage: `VERCEL_TOKEN=token node scripts/remove-legacy-stripe-price-ids.js`
   - Already executed - legacy variables removed

---

## 🚀 AUTOMATED GOING LIVE INSTRUCTIONS

**For AI Agents**: Follow these steps exactly to switch from test mode to live mode.

### Prerequisites Checklist
- ✅ Vercel API token available (never expires): `2MLfXoXXv8hIaHIE7lQcdQ39`
- ✅ Live Stripe Price IDs documented above
- ⬜ Live Stripe Secret Key (to be provided by user)
- ⬜ Live Stripe Publishable Key (to be provided by user)
- ⬜ Live Stripe Webhook Secret (to be provided by user)

### Step-by-Step Automation Process

#### Step 1: Update Stripe Price IDs in Vercel
```bash
export VERCEL_TOKEN="2MLfXoXXv8hIaHIE7lQcdQ39"
node scripts/add-stripe-price-ids-to-vercel.js live
```
**Expected Result**: All 6 Price ID environment variables updated to live mode values.

#### Step 2: Update Stripe Secret Key in Vercel
**Action**: Use Vercel API to update `STRIPE_SECRET_KEY` environment variable
- **Current Value**: `sk_test_...` (test mode key)
- **New Value**: Get live secret key from Stripe Dashboard → Developers → API keys → Secret key
- **Method**: Use Vercel API `POST /v9/projects/helfi-app/env?upsert=true` OR use `scripts/update-stripe-keys-to-vercel.js`
- **Note**: Use the `scripts/update-stripe-keys-to-vercel.js` script for automated updates

#### Step 3: Update Stripe Publishable Key in Vercel
**Action**: Use Vercel API to update `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` environment variable
- **Current Value**: `pk_test_...` (test mode key)
- **New Value**: Get live publishable key from Stripe Dashboard → Developers → API keys → Publishable key
- **Method**: Use Vercel API `POST /v9/projects/helfi-app/env?upsert=true` OR use `scripts/update-stripe-keys-to-vercel.js`
- **Note**: Use the `scripts/update-stripe-keys-to-vercel.js` script for automated updates

#### Step 4: Update Stripe Webhook Secret in Vercel
**Action**: Use Vercel API to update `STRIPE_WEBHOOK_SECRET` environment variable
- **Current Value**: `whsec_...` (test mode webhook secret)
- **New Value**: Get live webhook secret from Stripe Dashboard → Developers → Webhooks → Select webhook → Signing secret
- **Method**: Use Vercel API `POST /v9/projects/helfi-app/env?upsert=true` OR use `scripts/update-stripe-keys-to-vercel.js`
- **Note**: Use the `scripts/update-stripe-keys-to-vercel.js` script for automated updates

#### Step 5: Verify All Changes
**Action**: List all environment variables to confirm updates
- **Method**: Use Vercel API `GET /v9/projects/helfi-app/env`
- **Check**: Verify all Stripe-related variables are updated to live mode values

#### Step 6: Trigger Deployment
**Action**: Either:
- Push a commit to trigger automatic deployment, OR
- Manually trigger redeploy from Vercel dashboard

### Verification Checklist After Going Live
- [ ] All 6 Price ID variables updated to live mode values
- [ ] `STRIPE_SECRET_KEY` updated to live key (starts with `sk_live_`)
- [ ] `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` updated to live key (starts with `pk_live_`)
- [ ] `STRIPE_WEBHOOK_SECRET` updated to live secret (starts with `whsec_`)
- [ ] New deployment triggered
- [ ] Test checkout flow in production with real test card

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
- Vercel API token has Full Account scope and never expires - can be used for automated deployments
- All Stripe products already exist in both test and live modes
- Live mode Price IDs are already documented and ready to use

---

## Quick Reference Tables

### Test Mode Price IDs
| Product | Price | Price ID | Env Var |
|---------|-------|----------|---------|
| Premium (1,000 credits) | $20/month | `price_1SQfmeFFFsf6Yn8zF2KN3bSw` | `STRIPE_PRICE_20_MONTHLY` |
| Premium Plus (1,700 credits) | $30/month | `price_1SQfo6FFFsf6Yn8zdzu0ryTJ` | `STRIPE_PRICE_30_MONTHLY` |
| Premium Max (3,000 credits) | $50/month | `price_1SQfoxFFFsf6Yn8zC9KMyROy` | `STRIPE_PRICE_50_MONTHLY` |
| 250 Credits | $5 one-time | `price_1SQfqBFFFsf6Yn8zy1iK0tf9` | `STRIPE_PRICE_CREDITS_250` |
| 500 Credits | $10 one-time | `price_1SQfqxFFFsf6Yn8z3WoELRQs` | `STRIPE_PRICE_CREDITS_500` |
| 1,000 Credits | $20 one-time | `price_1SQfraFFFsf6Yn8z8uipLLdg` | `STRIPE_PRICE_CREDITS_1000` |

### Live Mode Price IDs
| Product | Price | Price ID | Env Var |
|---------|-------|----------|---------|
| Premium (1,000 credits) | $20/month | `price_1SQjscFFFsf6Yn8zZivYYd8P` | `STRIPE_PRICE_20_MONTHLY` |
| Premium Plus (1,700 credits) | $30/month | `price_1SQjsdFFFsf6Yn8zM9H2lWS2` | `STRIPE_PRICE_30_MONTHLY` |
| Premium Max (3,000 credits) | $50/month | `price_1SQjsdFFFsf6Yn8z9yhDZn9O` | `STRIPE_PRICE_50_MONTHLY` |
| 250 Credits | $5 one-time | `price_1SQjseFFFsf6Yn8zwQQTNAkA` | `STRIPE_PRICE_CREDITS_250` |
| 500 Credits | $10 one-time | `price_1SQjsfFFFsf6Yn8zJ4acdev9` | `STRIPE_PRICE_CREDITS_500` |
| 1,000 Credits | $20 one-time | `price_1SQjsgFFFsf6Yn8zjS5ouTq6` | `STRIPE_PRICE_CREDITS_1000` |
