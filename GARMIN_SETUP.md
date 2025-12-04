# Garmin Integration Setup (Evaluation Environment)

This guide wires the Garmin Health/Connect evaluation API into Helfi so users can link their Garmin account, register for push data, and deliver webhooks into the app.

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
# Optional: override the evaluation base URL if Garmin changes it
GARMIN_API_BASE_URL=https://healthapi.garmin.com/wellness-api/rest
```

### Sync to Vercel
Use the helper script (defaults to the known Vercel token in the repo):
```bash
GARMIN_CONSUMER_KEY=xxxx \
GARMIN_CONSUMER_SECRET=xxxx \
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
