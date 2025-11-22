# Subscription Management Feature - Handover Document

## Problem Statement
The user requested to add functionality to cancel, upgrade, and downgrade subscriptions on the billing page (`/billing`). However, the subscription management section is not appearing on the page, and the API endpoint `/api/billing/subscription` is returning a **500 Internal Server Error**.

## Current Error State
- **Endpoint**: `GET /api/billing/subscription`
- **Error**: `500 Internal Server Error`
- **Browser Console**: Shows "Failed to load subscription: 500"
- **User Impact**: The "Current Subscription" section with cancel/upgrade/downgrade buttons does not appear on the billing page

## What Was Requested
1. Add ability to cancel subscriptions
2. Add ability to upgrade subscriptions
3. Add ability to downgrade subscriptions
4. Display current subscription status on the billing page

## What Has Been Implemented (Code Changes)

### 1. Database Schema Changes
- **File**: `prisma/schema.prisma`
- **Change**: Added `stripeSubscriptionId String? @unique` field to the `Subscription` model
- **Migration**: Created `prisma/migrations/20251122180501_add_stripe_subscription_id/migration.sql`
- **Status**: ✅ Migration SQL executed successfully on production database
- **Verification**: Confirmed column exists in production database

### 2. API Endpoint Created
- **File**: `app/api/billing/subscription/route.ts` (NEW FILE)
- **Endpoints**:
  - `GET /api/billing/subscription` - Get current subscription status
  - `POST /api/billing/subscription` - Cancel, upgrade, or downgrade subscription
- **Features Implemented**:
  - Fetches subscription from database
  - Checks if subscription is active
  - Attempts to fetch Stripe subscription details if `stripeSubscriptionId` exists
  - Falls back to searching Stripe by customer email if no ID stored
  - Handles cancel action (sets `cancel_at_period_end` for Stripe subscriptions)
  - Handles upgrade/downgrade actions (updates Stripe subscription price)
  - Returns subscription details including tier, credits, billing dates

### 3. Frontend UI Updates
- **File**: `app/billing/page.tsx`
- **Changes Made**:
  - Added state variables: `subscription`, `hasActiveSubscription`, `isManagingSubscription`
  - Added `useEffect` hook to load subscription status on page load
  - Added `handleCancelSubscription` function
  - Added `handleChangePlan` function for upgrade/downgrade
  - Added "Current Subscription" UI section with:
    - Current plan display
    - Cancel subscription button
    - Upgrade/Downgrade buttons for all plan tiers
    - Next billing date display
    - Cancellation warning if scheduled to cancel

### 4. Webhook Updates
- **File**: `app/api/billing/webhook/route.ts`
- **Changes**: Updated to store `stripeSubscriptionId` and `monthlyPriceCents` when subscriptions are created/updated

## Attempted Fixes for 500 Error

### Fix Attempt #1: Handle Missing Column Gracefully
- **Problem**: Prisma client might not have the new `stripeSubscriptionId` column in its schema
- **Solution**: Used `(subscription as any).stripeSubscriptionId` to access the field
- **Result**: ❌ Still returning 500 error
- **Commit**: `6356afb` - "Fix subscription API: handle missing stripeSubscriptionId column gracefully"

### Fix Attempt #2: Use Raw SQL Queries
- **Problem**: Prisma client schema might be out of sync
- **Solution**: Changed from `prisma.user.findUnique({ include: { subscription: true }})` to raw SQL queries using `prisma.$queryRaw`
- **Result**: ❌ Still returning 500 error
- **Commit**: `1a8c273` - "Fix subscription API: use raw SQL query to avoid Prisma client schema issues"

### Fix Attempt #3: Switch to queryRawUnsafe
- **Problem**: `$queryRaw` template literal syntax might not be working
- **Solution**: Changed to `prisma.$queryRawUnsafe` with parameterized queries (`$1`, `$2`, etc.) matching pattern used in other working routes
- **Result**: ❌ Still returning 500 error
- **Commit**: `8cba81d` - "Fix subscription API: use queryRawUnsafe instead of queryRaw for compatibility"

## Current Code State

### GET /api/billing/subscription Route
```typescript
// Current implementation uses:
const user = await prisma.user.findUnique({
  where: { email: session.user.email.toLowerCase() },
  select: { id: true, email: true, name: true }
})

const subscriptionResult: any[] = await prisma.$queryRawUnsafe(
  `SELECT id, "userId", plan, "monthlyPriceCents", "startDate", "endDate", "stripeSubscriptionId"
   FROM "Subscription"
   WHERE "userId" = $1
   LIMIT 1`,
  user.id
)
```

## What Has NOT Been Tried Yet

1. **Check Vercel Server Logs**: The actual error message from the server hasn't been retrieved. Need to check:
   - Vercel deployment logs
   - Function logs for the specific error
   - Stack trace of the 500 error

2. **Test the Endpoint Directly**: 
   - Use curl or Postman to test the endpoint with authentication
   - Check if it's an authentication issue
   - Check if it's a database connection issue

3. **Verify Prisma Client Generation**:
   - Ensure `npx prisma generate` runs during Vercel build
   - Check if Prisma client is properly generated with the new schema

4. **Check Environment Variables**:
   - Verify `STRIPE_SECRET_KEY` is set correctly in Vercel
   - Verify `DATABASE_URL` is correct
   - Check if Stripe API calls are failing silently

5. **Add More Detailed Error Logging**:
   - The current error handler logs to console but doesn't return detailed error messages
   - Could add more try-catch blocks to isolate the exact failing line

6. **Check if Subscription Table Exists**:
   - Verify the Subscription table exists in production database
   - Check if the user actually has a subscription record

7. **Test with Simpler Query First**:
   - Try returning a simple response first to verify the route works
   - Gradually add complexity to isolate the issue

## Potential Root Causes

1. **Prisma Client Not Regenerated**: The Prisma client on Vercel might not have been regenerated after schema changes
2. **Database Connection Issue**: The raw SQL query might be failing due to connection issues
3. **Stripe API Error**: The Stripe API calls might be throwing unhandled errors
4. **Type Conversion Issue**: Date fields from raw SQL might not be converting properly
5. **Missing Error Handling**: An error in the Stripe lookup code might not be caught properly

## Files Modified
- ✅ `prisma/schema.prisma` - Added `stripeSubscriptionId` field
- ✅ `prisma/migrations/20251122180501_add_stripe_subscription_id/migration.sql` - Migration file
- ✅ `app/api/billing/subscription/route.ts` - NEW FILE (GET and POST endpoints)
- ✅ `app/billing/page.tsx` - Added subscription management UI
- ✅ `app/api/billing/webhook/route.ts` - Updated to store Stripe subscription ID

## Deployment Status
- **Latest Deployment**: `8cba81d` - "Fix subscription API: use queryRawUnsafe instead of queryRaw for compatibility"
- **Deployment State**: ✅ READY
- **Deployment URL**: `helfi-8uwyqyk8v-louie-veleskis-projects.vercel.app`
- **Production URL**: `helfi.ai`

## Next Steps for Next Agent

1. **Get Actual Error Details**:
   ```bash
   # Check Vercel logs
   vercel logs helfi-app --follow
   # Or check in Vercel dashboard
   ```

2. **Test Endpoint Locally**:
   ```bash
   # Run locally and test with curl
   npm run dev
   curl -X GET http://localhost:3000/api/billing/subscription \
     -H "Cookie: next-auth.session-token=YOUR_SESSION_TOKEN"
   ```

3. **Add Better Error Logging**:
   - Add try-catch around each major operation
   - Return error details in development mode
   - Log the exact error message and stack trace

4. **Verify Database State**:
   ```sql
   -- Check if subscription exists for the user
   SELECT * FROM "Subscription" WHERE "userId" = 'USER_ID';
   
   -- Check if column exists
   SELECT column_name FROM information_schema.columns 
   WHERE table_name = 'Subscription' AND column_name = 'stripeSubscriptionId';
   ```

5. **Simplify the Endpoint**:
   - Start with a minimal version that just returns subscription from database
   - Gradually add Stripe integration
   - This will help isolate where the error occurs

## User Context
- User has an active $30/month subscription (granted via admin panel)
- User email: `info@sonicweb.com.au` (based on previous context)
- Subscription should have `monthlyPriceCents = 3000`
- The subscription section should appear but doesn't due to the 500 error

## Environment
- **Database**: PostgreSQL (via Prisma)
- **Deployment**: Vercel
- **Stripe**: Sandbox mode enabled
- **Framework**: Next.js 14

## Important Notes
- The migration has been successfully applied to production database
- The Prisma client was regenerated locally (`npx prisma generate`)
- All code changes have been committed and pushed to `master` branch
- Multiple deployment attempts have been made, all showing READY status
- The error persists across browser refreshes and incognito mode (not a cache issue)

---

**Last Updated**: November 22, 2024 (Updated after agent attempted fixes)
**Status**: ❌ Still Blocked - 500 error persists despite fixes
**Priority**: High - Feature requested by user, blocking subscription management functionality

## Latest Updates (After Agent Fix Attempt)

### What the Previous Agent Did
- Changed from raw SQL queries back to normal Prisma queries
- Fixed credit amounts (30 → 1,500 credits, 50 → 2,500 credits)
- Added `/api/billing/portal` endpoint for Stripe customer portal
- Added "Manage subscription" button on billing page
- **Result**: Still getting 500 error

### What I Just Added
1. **Enhanced Error Logging** (`faf56ca`):
   - Added Stripe configuration check
   - Added try-catch around each database operation
   - Returns detailed error messages in development mode
   - Better error logging for Stripe API calls

2. **Debug Endpoint** (`e27d6d4`):
   - Created `/api/billing/subscription/debug` endpoint
   - Tests each step individually (session, Stripe config, user lookup, subscription lookup)
   - Returns detailed diagnostic information
   - **Use this to identify exactly where the error occurs**

### How to Use the Debug Endpoint
1. Visit: `https://helfi.ai/api/billing/subscription/debug` (while logged in)
2. Check the response - it will show which step is failing
3. Look for any "ERROR" status in the `checks` array
4. The error message will tell you exactly what's wrong

### Verified Configuration
- ✅ `STRIPE_SECRET_KEY` is set in Vercel (production, preview, development)
- ✅ All Stripe price IDs are set in Vercel
- ✅ Database migration completed successfully
- ✅ Latest deployment: `e27d6d4` - READY status

### Next Steps
1. **Use the debug endpoint** to identify the exact failing step
2. **Check Vercel function logs** for the actual error message:
   ```bash
   vercel logs helfi-app --follow
   ```
3. **Test locally** if possible to see full error stack traces
4. **Check if Prisma client needs regeneration** on Vercel build

