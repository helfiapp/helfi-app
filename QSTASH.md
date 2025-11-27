QStash Reminder System – Final Implementation Notes
===================================================

Overview
--------
Reminders now run entirely through Upstash QStash. The system is stable in production as of **14 Nov 2025** and was verified by a live notification (04:16 AEST) and matching entries in `/api/push/scheduler-debug` showing successful `httpStatus: 201` publishes.

### What broke
1. Production `QSTASH_TOKEN` was a base64 JSON blob (`ey…`) instead of a real QStash Auth Token (`qst_…`), so every schedule was rejected with 401/400.
2. Our publish call wrapped the callback URL in `encodeURIComponent`, producing URLs like `https%3A//helfi.ai/...`. Upstash interpreted that as an invalid scheme and returned `400 invalid destination url`.

### What fixed it
- Rotated credentials via `scripts/update-qstash-envs.js` with a valid `qst_…` token and signing keys.
- Updated `lib/qstash.ts` to call `https://qstash.upstash.io/v2/publish/https://helfi.ai/api/push/dispatch` **without** extra encoding.
- Added `QstashScheduleLog` persistence and surfaced results in `/api/push/scheduler-debug`, so scheduling failures are visible immediately.
- Confirmed Upstash now returns `201` and delivers reminders exactly at the scheduled minute.

Guard Rails (do not bypass)
---------------------------
1. **Env management**
   - Always run `node scripts/update-qstash-envs.js` when rotating tokens. The script enforces the `qst_` prefix and updates all deployments. Manual edits in the Vercel UI are error-prone.
   - `PUBLIC_BASE_URL` must stay `https://helfi.ai` (no trailing slash). If you change it, rerun the full test checklist below.

2. **Publish contract**
   ```ts
   const callbackUrl = `${base}/api/push/dispatch`
   const url = `https://qstash.upstash.io/v2/publish/${callbackUrl}`
   ```
   - Do **not** wrap `callbackUrl` in `encodeURIComponent` or add custom query params without validating against Upstash.
   - Required headers: `Authorization`, `Content-Type: application/json`, `Upstash-Not-Before`.

3. **Deployment checklist (mandatory)**
   1. `git push origin master`
   2. `./scripts/check-deployment-status.sh` → wait for READY
   3. Visit `https://helfi.ai/api/push/scheduler-debug`
      - New row must show `scheduled: true`, `httpStatus: 201`, and a non-empty `messageId`.
   4. Only after those checks may you tell the user it is live.

4. **Manual reminder smoke test (mandatory)**
   1. Save a reminder 2–3 minutes ahead.
   2. Confirm the debug endpoint logs a new `201` row.
   3. Lock/background your phone; confirm the notification arrives at the scheduled minute.
   4. Check Upstash → Schedules: ensure the callback for the next day is queued.
   5. If anything fails, stop and investigate—do not proceed with other work.

5. **Monitoring**
   - `/api/push/scheduler-debug` now returns `recentQstashScheduleLogs`. Investigate immediately if any row shows `scheduled: false`.
   - The `QstashScheduleLog` table keeps the audit trail (message IDs, status, callback URL). Query it before making changes.

Change timeline (2025‑11‑14)
---------------------------
| Time (AEST) | Action | Result |
|-------------|--------|--------|
| 03:32 | Added QStash schedule logging + debug exposure | Surfaced root-cause errors |
| 03:39 | Fixed BigInt serialization | Debug endpoint usable |
| 03:44 | Normalized base URL handling | Prepared for env rotation |
| 03:49 | Logged callback URLs | Confirmed malformed URL |
| 04:03 | Rotated credentials with real `qst_…` token | Auth succeeded |
| 04:09 | Removed double encoding | Upstash returned `201` |
| 04:15 | Live reminder fired | Verified on device |

If reminders break again
------------------------
1. Check `/api/push/scheduler-debug`; review the latest `recentQstashScheduleLogs` entry.
2. If `httpStatus` is not 201, rotate the token and signing keys via the script, then redeploy and retest.
3. Confirm `lib/qstash.ts` still uses the raw callback URL.
4. Run the manual reminder smoke test before reporting success.

Future improvements
-------------------
- Enforce Upstash signature verification in `/api/push/dispatch` once the keys are rotated safely.
- Remove the legacy cron job after at least 24 hours of verified QStash delivery.
- Add alerting (e.g., Slack webhook) when `QstashScheduleLog` records a failed attempt.

Keep this document up to date. Every change to the reminder system must maintain these guard rails so Helfi’s reminders stay reliable. 


