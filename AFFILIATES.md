# AFFILIATE PROGRAM (HELFI) — HANDOVER PLAN

Legend:
- ✅ = completed in codebase
- ⬜ = pending / requires setup or follow-up

---

## 1. ✅ Program Rules (Source of Truth)

1. ✅ Attribution model
   - Last-click attribution.
   - 30-day attribution window.
   - Affiliate link format: `/r/{affiliateCode}`.
   - Clicks without successful purchase earn nothing.

2. ✅ Commission rules
   - 50% of **net revenue** (after Stripe fees).
   - Subscription: **initial payment only** (first month only).
   - Top-ups: every top-up purchase earns a **one-time commission**.
   - No recurring commissions on subscription renewals.

3. ✅ Refund/dispute policy for commissions
   - Payouts are Net-30 (commissions become payable 30 days after transaction date).
   - If a transaction is refunded or disputed within the 30-day window, commission is voided (not payable).

4. ✅ Payout operations
   - Payout method: Stripe Connect.
   - Monthly payout runs.
   - Minimum payout threshold: **$50 USD** (5,000 cents).

5. ✅ Privacy
   - Affiliates see anonymized data only (counts + amounts, no customer PII).

---

## 2. ✅ Data Model (Prisma + Postgres)

1. ✅ Prisma schema updated: `prisma/schema.prisma`
2. ✅ Migrations added:
   - `prisma/migrations/20251220190000_add_affiliate_program/migration.sql`
   - `prisma/migrations/20251222130000_add_affiliate_application_channels/migration.sql`
   - `prisma/migrations/20251222133000_add_affiliate_application_other_channel/migration.sql`
   - `prisma/migrations/20251222143000_add_affiliate_application_terms/migration.sql`

Entities (high-level):
- `AffiliateApplication`: application + AI screening results + review status.
  - Fields include: `primaryChannel`, `primaryChannelOther`, `audienceSize`, `termsVersion`, `termsAcceptedAt`.
- `Affiliate`: the approved affiliate (ties to a `User`) and Stripe Connect status.
- `AffiliateClick`: each `/r/{code}` click (stores visitorId + userAgent/referrer).
- `AffiliateConversion`: a paid event attributed to an affiliate (subscription-initial or top-up).
- `AffiliateCommission`: 50% of net revenue, starts `PENDING`, becomes payable at `payableAt`, later `PAID` or `VOIDED`.
- `AffiliatePayoutRun`: a batch payout run record.
- `AffiliatePayout`: one Stripe transfer to one affiliate; links to commissions via `AffiliateCommission.payoutId`.

---

## 3. ✅ Referral Link + Click Tracking

1. ✅ Route: `app/r/[code]/route.ts`
   - Validates affiliate code.
   - Logs a click in `AffiliateClick`.
   - Sets first-party cookies (30-day TTL) for last-click attribution.

2. ✅ Cookie helpers: `lib/affiliate-cookies.ts`
   - Cookie keys:
     - `helfi_aff_code`
     - `helfi_aff_click`
     - `helfi_aff_vid`
     - `helfi_aff_ts`

---

## 4. ✅ Affiliate Application + AI Screening

1. ✅ Apply endpoint: `app/api/affiliate/apply/route.ts`
   - Requires signed-in user.
   - Creates `AffiliateApplication`.
   - Captures primary channel + audience range.
   - Requires affiliate terms acceptance + version.
   - Runs automated screening (webhook OR OpenAI).
   - Auto-approves only if risk is `LOW` + `AUTO_APPROVE`.
   - Otherwise leaves as `PENDING_REVIEW`.
   - Medium/High risk triggers admin email (if configured).

2. ✅ Status endpoint: `app/api/affiliate/application/route.ts`
   - Returns current affiliate + latest application (for portal UI).

3. ✅ Screening engine: `lib/affiliate-screening.ts`
   - If `AFFILIATE_SCREENING_WEBHOOK_URL` is set, posts application data to it and expects a structured response.
   - Otherwise uses OpenAI (if `OPENAI_API_KEY` is set); falls back to manual review if not.

4. ✅ Admin notification email: `lib/affiliate-admin-email.ts`
   - Sends email to `OWNER_EMAIL` via Resend for Medium/High risk.

---

## 5. ✅ Stripe Attribution Injection (Checkout)

1. ✅ Checkout session creation updated: `app/api/billing/create-checkout-session/route.ts`
   - Reads last-click affiliate cookies.
   - If within 30-day window, injects metadata into Stripe Checkout:
     - Session `metadata`
     - `payment_intent_data.metadata` for top-ups
     - `subscription_data.metadata` for subscriptions

Metadata keys:
- `helfi_aff_code`
- `helfi_aff_click`
- `helfi_aff_ts`

---

## 6. ✅ Commission Creation + Voids (Stripe Webhooks)

1. ✅ Webhook handler updated: `app/api/billing/webhook/route.ts`

2. ✅ Conversion creation
   - Subscription initial payment: `invoice.paid` where `billing_reason === 'subscription_create'`
   - Top-ups: `checkout.session.completed` (mode `payment`, status `paid`)
   - Net revenue comes from `balance_transaction.net` (Stripe fees deducted).

3. ✅ Commission creation
   - `commissionCents = floor(netRevenueCents / 2)`
   - `payableAt = occurredAt + 30 days`
   - Stored as `AffiliateCommission` with status `PENDING`

4. ✅ Refund/dispute voiding
   - Events: `charge.refunded` and `charge.dispute.created`
   - If a pending commission exists for that charge: status becomes `VOIDED`

---

## 7. ✅ Affiliate Portal (User-Facing)

1. ✅ Pages
   - Dashboard: `app/affiliate/page.tsx`
   - Application: `app/affiliate/apply/page.tsx`
   - Terms: `app/affiliate/terms/page.tsx`

2. ✅ APIs
   - Portal data: `app/api/affiliate/me/route.ts`
   - Stripe Connect onboarding: `app/api/affiliate/connect/onboard/route.ts`

Data shown is anonymized (no referred user PII).

---

## 8. ✅ Stripe Connect Setup + Payout Runs (Admin)

1. ✅ Admin review endpoint (approve/reject)
   - `app/api/admin/affiliates/applications/route.ts`

2. ✅ Payout run endpoint (Stripe transfers)
   - `app/api/admin/affiliates/payout-run/route.ts`
   - Pays only commissions:
     - `status === PENDING`
     - `payableAt <= now`
     - `currency === usd` (default)
     - `payoutId IS NULL`
   - Enforces threshold: `>= 5000` cents (default).
   - Creates Stripe Transfer to the affiliate’s Connect account.
   - Marks related commissions as `PAID` and links them to `AffiliatePayout`.

3. ✅ Stripe Connect status sync
   - Webhook event `account.updated` updates:
     - `stripeConnectDetailsSubmitted`
     - `stripeConnectChargesEnabled`
     - `stripeConnectPayoutsEnabled`

4. ✅ Stripe webhook events helper (admin-only)
   - Endpoint: `app/api/admin/stripe/ensure-webhooks/route.ts`
   - Call: `POST /api/admin/stripe/ensure-webhooks` (admin auth header required)
   - Ensures required events are enabled on the existing Stripe webhook endpoint for `/api/billing/webhook`.

---

## 9. ✅ Required Environment Variables / Config

1. ✅ Database migration + baseline
   - Affiliate tables/enums created in Postgres.
   - Prisma migration history baselined so `prisma migrate status` is up-to-date.

2. ✅ Stripe webhook config (must include these events)
   - `checkout.session.completed`
   - `invoice.paid`
   - `charge.refunded`
   - `charge.dispute.created`
   - `account.updated`
   - (Existing subscription events already used by app)

3. ✅ Stripe Connect settings (live)
   - Platform Connect enabled.
   - Transfers capability active (verified via Stripe API).

4. ✅ Resend admin alerts
   - `RESEND_API_KEY` set in production.
   - `OWNER_EMAIL` set in production.

5. ✅ Screening integration (choose one)
   - Option A: `AFFILIATE_SCREENING_WEBHOOK_URL` (external AI service)
   - Option B: `OPENAI_API_KEY` (+ optional `AFFILIATE_SCREENING_MODEL`)

---

## 10. ✅ Operational TODOs (Recommended Next Steps)

1. ✅ Add Admin Panel UI for:
   - Reviewing affiliate applications (approve/reject).
   - Running payout batches (dry-run + execute).

2. ✅ Schedule payout runs monthly
   - Vercel Cron: `vercel.json` → `/api/cron/affiliate-payout-run`.

3. ✅ Add basic anti-fraud hardening
   - Rate limit `/r/{code}` in `app/r/[code]/route.ts`.

4. ✅ Add program Terms page + affiliate agreement acceptance
   - Stores acceptance timestamp + version.
