# Stripe Test Mode Setup Guide

This guide provides step-by-step instructions for setting up all subscription plans and credit top-ups in **Stripe Test Mode** to match your billing page.

## Important: Use Test Mode

**Before starting, ensure you're in Test Mode:**
- Look for the "Test mode" toggle in the top right of your Stripe dashboard
- The URL should contain `/test/` (e.g., `https://dashboard.stripe.com/test/products`)
- Test mode uses test API keys (starting with `pk_test_` and `sk_test_`)

---

## Products to Create

### Part 1: Monthly Subscription Plans

#### Product 1: $20/month Plan
1. **Navigate to**: Products → Product catalog → "Add product"
2. **Product Name**: `Helfi Premium - 1,000 Credits`
3. **Description**: `Monthly wallet: 1,000 credits. Credits refresh monthly. No rollover.`
4. **Pricing**:
   - Click "Add price"
   - **Price**: `20.00`
   - **Currency**: `USD`
   - **Billing period**: `Monthly` (recurring)
   - Click "Save price"
5. **Save the Price ID** (starts with `price_`) → Copy this for `STRIPE_PRICE_20_MONTHLY`

#### Product 2: $30/month Plan (Most Popular)
1. **Navigate to**: Products → Product catalog → "Add product"
2. **Product Name**: `Helfi Premium Plus - 1,700 Credits`
3. **Description**: `Monthly wallet: 1,700 credits. Credits refresh monthly. No rollover.`
4. **Pricing**:
   - Click "Add price"
   - **Price**: `30.00`
   - **Currency**: `USD`
   - **Billing period**: `Monthly` (recurring)
   - Click "Save price"
5. **Save the Price ID** (starts with `price_`) → Copy this for `STRIPE_PRICE_30_MONTHLY`

#### Product 3: $50/month Plan
1. **Navigate to**: Products → Product catalog → "Add product"
2. **Product Name**: `Helfi Premium Max - 3,000 Credits`
3. **Description**: `Monthly wallet: 3,000 credits. Credits refresh monthly. No rollover.`
4. **Pricing**:
   - Click "Add price"
   - **Price**: `50.00`
   - **Currency**: `USD`
   - **Billing period**: `Monthly` (recurring)
   - Click "Save price"
5. **Save the Price ID** (starts with `price_`) → Copy this for `STRIPE_PRICE_50_MONTHLY`

---

### Part 2: One-Time Credit Top-Ups (12 Months Validity)

#### Product 4: $5 Credit Top-Up (250 credits)
1. **Navigate to**: Products → Product catalog → "Add product"
2. **Product Name**: `Helfi Credit Top-Up - 250 Credits`
3. **Description**: `One-time top-up. Credits valid for 12 months.`
4. **Pricing**:
   - Click "Add price"
   - **Price**: `5.00`
   - **Currency**: `USD`
   - **Billing period**: `One time` (NOT recurring)
   - Click "Save price"
5. **Save the Price ID** (starts with `price_`) → Copy this for `STRIPE_PRICE_CREDITS_250`

#### Product 5: $10 Credit Top-Up (500 credits)
1. **Navigate to**: Products → Product catalog → "Add product"
2. **Product Name**: `Helfi Credit Top-Up - 500 Credits`
3. **Description**: `One-time top-up. Credits valid for 12 months.`
4. **Pricing**:
   - Click "Add price"
   - **Price**: `10.00`
   - **Currency**: `USD`
   - **Billing period**: `One time` (NOT recurring)
   - Click "Save price"
5. **Save the Price ID** (starts with `price_`) → Copy this for `STRIPE_PRICE_CREDITS_500`

#### Product 6: $20 Credit Top-Up (1,000 credits)
1. **Navigate to**: Products → Product catalog → "Add product"
2. **Product Name**: `Helfi Credit Top-Up - 1,000 Credits`
3. **Description**: `One-time top-up. Credits valid for 12 months.`
4. **Pricing**:
   - Click "Add price"
   - **Price**: `20.00`
   - **Currency**: `USD`
   - **Billing period**: `One time` (NOT recurring)
   - Click "Save price"
5. **Save the Price ID** (starts with `price_`) → Copy this for `STRIPE_PRICE_CREDITS_1000`

---

## How to Find Price IDs

After creating each product:
1. Click on the product name in your Products list
2. Scroll down to the "Pricing" section
3. You'll see the Price ID listed (format: `price_xxxxxxxxxxxxx`)
4. Click the copy icon next to the Price ID to copy it

---

## Environment Variables

After creating all products, add these to your `.env.local` file:

```bash
# Monthly Subscription Plans
STRIPE_PRICE_20_MONTHLY=price_xxxxxxxxxxxxx
STRIPE_PRICE_30_MONTHLY=price_xxxxxxxxxxxxx
STRIPE_PRICE_50_MONTHLY=price_xxxxxxxxxxxxx

# One-Time Credit Top-Ups
STRIPE_PRICE_CREDITS_250=price_xxxxxxxxxxxxx
STRIPE_PRICE_CREDITS_500=price_xxxxxxxxxxxxx
STRIPE_PRICE_CREDITS_1000=price_xxxxxxxxxxxxx

# Stripe Secret Key (Test Mode)
STRIPE_SECRET_KEY=sk_test_xxxxxxxxxxxxx
```

**Important**: Make sure you're using the **test mode** secret key (starts with `sk_test_`), not the live key (starts with `sk_live_`).

---

## Verification Checklist

After setup, verify:
- [ ] All 6 products created in Test Mode
- [ ] 3 subscription products set to "Monthly" recurring
- [ ] 3 credit top-up products set to "One time"
- [ ] All Price IDs copied and saved
- [ ] Environment variables added to `.env.local`
- [ ] Using test mode API keys (`sk_test_` and `pk_test_`)

---

## Testing

To test in your application:
1. Use Stripe test card numbers (e.g., `4242 4242 4242 4242`)
2. Use any future expiry date (e.g., `12/34`)
3. Use any 3-digit CVC (e.g., `123`)
4. Use any ZIP code (e.g., `12345`)

Test cards: https://stripe.com/docs/testing#cards

---

## Quick Reference: Plan Mapping

| Billing Page | Stripe Product | Price ID Env Var | Plan ID (API) |
|-------------|----------------|------------------|---------------|
| $20/month (1,000 credits) | Helfi Premium - 1,000 Credits | `STRIPE_PRICE_20_MONTHLY` | `plan_20_monthly` |
| $30/month (1,700 credits) | Helfi Premium Plus - 1,700 Credits | `STRIPE_PRICE_30_MONTHLY` | `plan_30_monthly` |
| $50/month (3,000 credits) | Helfi Premium Max - 3,000 Credits | `STRIPE_PRICE_50_MONTHLY` | `plan_50_monthly` |
| $5 (250 credits) | Helfi Credit Top-Up - 250 Credits | `STRIPE_PRICE_CREDITS_250` | `credits_250` |
| $10 (500 credits) | Helfi Credit Top-Up - 500 Credits | `STRIPE_PRICE_CREDITS_500` | `credits_500` |
| $20 (1,000 credits) | Helfi Credit Top-Up - 1,000 Credits | `STRIPE_PRICE_CREDITS_1000` | `credits_1000` |
