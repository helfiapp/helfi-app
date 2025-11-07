# Stripe Test Mode Price IDs - Complete List

All Price IDs have been extracted from your Stripe test mode account.

## Monthly Subscription Plans

### 1. Helfi Premium - 1,000 Credits ($20/month)
- **Product ID**: `prod_TNQdzLWlGqKLXL`
- **Price ID**: `price_1SQfmeFFFsf6Yn8zF2KN3bSw`
- **Environment Variable**: `STRIPE_PRICE_20_MONTHLY`
- **Plan ID** (for API): `plan_20_monthly`

### 2. Helfi Premium Plus - 1,700 Credits ($30/month)
- **Product ID**: `prod_TNQf51fNzsflxB`
- **Price ID**: `price_1SQfo6FFFsf6Yn8zdzu0ryTJ`
- **Environment Variable**: `STRIPE_PRICE_30_MONTHLY`
- **Plan ID** (for API): `plan_30_monthly`

### 3. Helfi Premium Max - 3,000 Credits ($50/month)
- **Product ID**: `prod_TNQgCgSMkyZyqo`
- **Price ID**: `price_1SQfoxFFFsf6Yn8zC9KMyROy`
- **Environment Variable**: `STRIPE_PRICE_50_MONTHLY`
- **Plan ID** (for API): `plan_50_monthly`

## One-Time Credit Top-Ups

### 4. Helfi Credit Top-Up - 250 Credits ($5)
- **Product ID**: `prod_TNQhSiTxefLoer`
- **Price ID**: `price_1SQfqBFFFsf6Yn8zy1iK0tf9`
- **Environment Variable**: `STRIPE_PRICE_CREDITS_250`
- **Plan ID** (for API): `credits_250`

### 5. Helfi Credit Top-Up - 500 Credits ($10)
- **Product ID**: `prod_TNQio5oVSzwiPB`
- **Price ID**: `price_1SQfqxFFFsf6Yn8z3WoELRQs`
- **Environment Variable**: `STRIPE_PRICE_CREDITS_500`
- **Plan ID** (for API): `credits_500`

### 6. Helfi Credit Top-Up - 1,000 Credits ($20)
- **Product ID**: `prod_TNQjKhqEq4Ct9D`
- **Price ID**: `price_1SQfraFFFsf6Yn8z8uipLLdg`
- **Environment Variable**: `STRIPE_PRICE_CREDITS_1000`
- **Plan ID** (for API): `credits_1000`

---

## Environment Variables for .env.local

Add these to your `.env.local` file:

```bash
# Monthly Subscription Plans
STRIPE_PRICE_20_MONTHLY=price_1SQfmeFFFsf6Yn8zF2KN3bSw
STRIPE_PRICE_30_MONTHLY=price_1SQfo6FFFsf6Yn8zdzu0ryTJ
STRIPE_PRICE_50_MONTHLY=price_1SQfoxFFFsf6Yn8zC9KMyROy

# One-Time Credit Top-Ups
STRIPE_PRICE_CREDITS_250=price_1SQfqBFFFsf6Yn8zy1iK0tf9
STRIPE_PRICE_CREDITS_500=price_1SQfqxFFFsf6Yn8z3WoELRQs
STRIPE_PRICE_CREDITS_1000=price_1SQfraFFFsf6Yn8z8uipLLdg
```

---

## Quick Reference

| Product | Price | Price ID | Env Var |
|---------|-------|----------|---------|
| Premium (1,000 credits) | $20/month | `price_1SQfmeFFFsf6Yn8zF2KN3bSw` | `STRIPE_PRICE_20_MONTHLY` |
| Premium Plus (1,700 credits) | $30/month | `price_1SQfo6FFFsf6Yn8zdzu0ryTJ` | `STRIPE_PRICE_30_MONTHLY` |
| Premium Max (3,000 credits) | $50/month | `price_1SQfoxFFFsf6Yn8zC9KMyROy` | `STRIPE_PRICE_50_MONTHLY` |
| 250 Credits | $5 one-time | `price_1SQfqBFFFsf6Yn8zy1iK0tf9` | `STRIPE_PRICE_CREDITS_250` |
| 500 Credits | $10 one-time | `price_1SQfqxFFFsf6Yn8z3WoELRQs` | `STRIPE_PRICE_CREDITS_500` |
| 1,000 Credits | $20 one-time | `price_1SQfraFFFsf6Yn8z8uipLLdg` | `STRIPE_PRICE_CREDITS_1000` |

---

**Note**: These are TEST MODE Price IDs. When you go live, you'll need to create new products in live mode and get new Price IDs.

