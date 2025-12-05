# Garmin Integration Setup (Evaluation Environment)

This guide wires the Garmin Health/Connect evaluation API into Helfi so users can link their Garmin account, register for push data, and deliver webhooks into the app.

---
## Handoff Summary (Dec 5, 2025) – Garmin OAuth still failing

**Update (Dec 6, 2025)**  
- Identified why `request_token` was failing: we were calling the Wellness API base (`https://healthapi.garmin.com/wellness-api/rest/request_token`), which expects a user access token and returns `401 {"errorMessage":"oauth_token (UserAccessToken) missing"}`.  
- Code now uses a dedicated OAuth base (default `https://connectapi.garmin.com/oauth-service/oauth`) for `request_token` and `access_token`, while keeping the Wellness base for registration/webhooks.  
- New env var: `GARMIN_OAUTH_BASE_URL` (set in Vercel + `.env.local`). Use `connectapi.garmin.com/...` for production/eval; switch to `connectapitest.garmin.com/...` if Garmin confirms this key is test-only.

**Current blocker**  
Popup shows `{"error":"Failed to start Garmin authorization"}`. This means the Garmin request_token step is failing (likely 401/403 from Garmin). I added logging to surface the exact Garmin response in server logs.

**What’s already verified**
- Garmin app settings (portal):
  - Client ID: `f8a0108f-8414-4d83-b5f2-c29a50fd629d`
  - Client Secret: `pV5ZlzN0Z5yhdxxdqhJTPDeR8v/OseWjf1iQkYIXVHU`
  - Redirect: `https://helfi.ai/api/auth/garmin/callback`
  - Product: Connect Developer - Evaluation
  - Status: Approved/Enabled
  - Logo: https://helfi.ai/mobile-assets/garmin-icon.png
  - APIs: Health API; endpoints set to https://helfi.ai/api/garmin/webhook (COMMON and all HEALTH toggled enabled, on-hold unchecked)
  - API Configuration: Daily Health Stats, Activity, Women’s Health (optional), Historical Data Export ON; Courses/Training outbound not needed.

- Vercel env (Production/Preview/Dev) checked with token:
  - `GARMIN_CONSUMER_KEY` set
  - `GARMIN_CONSUMER_SECRET` set
  - `GARMIN_REDIRECT_URI = https://helfi.ai/api/auth/garmin/callback`
  - `GARMIN_OAUTH_BASE_URL = https://connectapi.garmin.com/oauth-service/oauth` (override to `connectapitest...` if needed)
  - `GARMIN_API_BASE_URL = https://healthapi.garmin.com/wellness-api/rest`

- Deployments:
  - Added logging in authorize step and request/access token helpers.
  - Latest deploy: `helfi-7ljqqfouf-louie-veleskis-projects.vercel.app` (commit `01de920f...`).

**Code changes made for debugging**
- `lib/garmin-oauth.ts`: now logs status/body for request_token and access_token failures.
- `app/api/auth/garmin/authorize/route.ts`: logs error details when request_token fails.

**Next steps for the next agent**
1) Reproduce “Connect Garmin” on production; check server logs for the exact Garmin response from request_token. The logging should print status/body to the server console.
2) If Garmin returns 401/403:
   - Triple-check in the Garmin portal that the redirect URL is exactly `https://helfi.ai/api/auth/garmin/callback` (no trailing slash/typo).
   - Ensure we’re in Evaluation keys hitting the Evaluation base URL (already set). OAuth calls now target `GARMIN_OAUTH_BASE_URL`; change to `https://connectapitest.garmin.com/oauth-service/oauth` if Garmin confirms we must use the test host.
   - If request_token still shows auth errors, regenerate Client Secret in Garmin portal and update Vercel env + redeploy.
3) If request_token succeeds but access_token fails, check callback handling and token secret storage in `GarminRequestToken` table.
4) Add a small admin view/log viewer for `GarminWebhookLog` / recent errors if needed.

**Known unaffected items**
- Fitbit integration and other devices remain unchanged.
- PWA/icon issues are unrelated to Garmin changes.

---

## Credentials You Need
- Garmin Developer Portal (evaluation): https://developerportal.garmin.com
- Login/user: `louie@helfi.ai` (create the first password from the email you received)
- Gather these values from your Garmin app record:
  - **Consumer Key**
  - **Consumer Secret**
  - **Callback URL**: set to `https://helfi.ai/api/auth/garmin/callback`
  - **Webhook URL**: set base to `https://helfi.ai/api/garmin/webhook` (Garmin will append topic paths such as `/dailies`, `/epochs`, etc.)

## Environment Variables
Add to `.env.local` and Vercel (Production + Preview):
```bash
GARMIN_CONSUMER_KEY=xxxx
GARMIN_CONSUMER_SECRET=xxxx
GARMIN_REDIRECT_URI=https://helfi.ai/api/auth/garmin/callback
# OAuth base (use connectapitest.garmin.com if Garmin tells us to stay on test)
GARMIN_OAUTH_BASE_URL=https://connectapi.garmin.com/oauth-service/oauth
# Optional: override the evaluation base URL if Garmin changes it
GARMIN_API_BASE_URL=https://healthapi.garmin.com/wellness-api/rest
```

### Sync to Vercel
Use the helper script (defaults to the known Vercel token in the repo):
```bash
GARMIN_CONSUMER_KEY=xxxx \
GARMIN_CONSUMER_SECRET=xxxx \
GARMIN_OAUTH_BASE_URL=https://connectapi.garmin.com/oauth-service/oauth \
node scripts/add-garmin-env-to-vercel.js
```
This upserts the four variables across Production/Preview/Development on the `helfi-app` project.

## OAuth + Registration Flow (already coded)
- Start URL: `/api/auth/garmin/authorize` (opened from `/devices`)
- Callback: `/api/auth/garmin/callback`
- Storage:
  - Request token + secret stored short-term in `GarminRequestToken`
  - Access token/secret saved in `Account` with `provider = 'garmin'` (`access_token` = oauth token, `refresh_token` = token secret, `providerAccountId` = Garmin user id when provided)
  - Request tokens are cleaned up after the callback
- User registration: after exchanging tokens we call `POST /user/registration` with `uploadStartTimestamp` set to 30 days back so Garmin begins pushing historical data.

## Webhook Ingress
- Endpoint: `https://helfi.ai/api/garmin/webhook` (catch-all; also accepts topic suffixes like `/dailies`, `/epochs`, `/sleeps`, etc.)
- Auth: expects Garmin’s OAuth1 Authorization header. We verify the consumer key and map `oauth_token` to the stored Garmin account. Signature verification can be expanded later if needed.
- Logging: every webhook payload is stored in `GarminWebhookLog` (includes `dataType`, `oauthToken`, optional `userId`, and raw JSON payload) for auditing and downstream processing.

## Database Changes
- New models: `GarminRequestToken`, `GarminWebhookLog` (+ relations on `User`)
- Migration added: `prisma/migrations/20251203_add_garmin_integration/migration.sql`
- Apply locally (if you need the tables right away):
  ```bash
  npx prisma migrate dev --name add_garmin_integration
  ```
  Deploy uses `prisma migrate deploy`, so ensure migrations run in production after the next release.

## How to Test
1. Set env vars locally or on Vercel (see above).
2. Visit `/devices` and click **Connect Garmin**. Approve in the popup.
3. Confirm the UI shows “Connected”.
4. In the database, you should see:
   - An `Account` row with `provider = garmin`
   - A `GarminRequestToken` row removed after callback
5. Trigger a test webhook from Garmin (or wait for live data) and verify rows appear in `GarminWebhookLog`.

## Operational Notes
- The integration currently logs raw Garmin payloads; mapping to Fitbit-style visualizations can be layered on once the data contract is finalized.
- If Garmin ever rotates endpoints, update `GARMIN_API_BASE_URL` and the webhook URL in the portal.
- If you disconnect Garmin from `/devices`, we attempt to deregister the user with Garmin and remove stored tokens/logs.
