QStash migration and reminder delivery investigation (handover)
================================================================

Purpose
-------
Document, in one place, everything that has been tried to get scheduled push reminders working reliably and on time, what is currently deployed, how it works, what’s misconfigured, and the exact steps the next agent should follow to finish the job without repeating failed attempts.

TL;DR
-----
- Push delivery (service worker + VAPID) works. “Send test” and manual triggers deliver.
- The original problem was timing: Vercel Cron invocations arrive late or skip minutes; minute‑exact matching dropped notifications.
- We implemented a move to Upstash QStash to schedule exact‑time callbacks, but no schedules were created because the provided “token” wasn’t a QStash Auth Token (should start with `qst_`). Env vars were added; once a valid token is set, saving a reminder should create a schedule immediately and delivery should be on time.

Current production state (helfi.ai)
-----------------------------------
- Live code includes:
  - `app/api/push/scheduler/route.ts` (legacy cron path; still present)
  - `app/api/push/dispatch/route.ts` (NEW: QStash callback → sends push → logs → schedules next)
  - `lib/qstash.ts` (NEW: scheduling helpers; compute next run in user’s timezone; publish to QStash)
  - `app/api/checkins/settings/route.ts` (UPDATED: on save, schedule next run(s) via QStash; if user saved within 5 minutes after a reminder time, dispatch once immediately to avoid “wait until tomorrow”)
  - `app/api/push/test/route.ts`, `app/api/push/send-reminder-now/route.ts`, `app/api/push/status/route.ts`, `app/api/push/scheduler-debug/route.ts` (diagnostics/test endpoints)
  - `public/sw.js` (service worker shows notification payloads)
- Public probes that confirm the deployment:
  - `https://helfi.ai/api/push/dispatch` → returns HTTP 405 (expected for GET; the endpoint exists)
  - `https://helfi.ai/api/push/vapid` → returns JSON `{ "publicKey": "..." }`
- What’s still missing: verified QStash Auth Token (must start with `qst_`) and confirmation that schedules appear in QStash → Schedules after saving reminder times. **New:** every scheduling attempt now writes to `QstashScheduleLog`, and `/api/push/scheduler-debug` returns the last 20 rows so we can see immediately whether QStash accepted or rejected the request.

Key endpoints and code paths
----------------------------
- Schedule save (user action)
  - `app/api/checkins/settings/route.ts` (POST)
    - Normalizes times, upserts row in `CheckinSettings`
    - Calls `scheduleAllActiveReminders(userId, { time1, time2, time3, timezone, frequency })`
      - Implemented in `lib/qstash.ts` → uses QStash publish API to schedule callback(s) at the next occurrence per time/timezone
    - If user saved within 5 minutes after a reminder time (recently missed), POSTs to `/api/push/dispatch` once to deliver immediately; `dispatch` will schedule the next day’s occurrence again
- Exact‑time dispatch (scheduled by QStash)
  - `app/api/push/dispatch/route.ts` (POST only)
    - Validates payload: `{ userId, reminderTime, timezone }`
    - Looks up `PushSubscriptions` for `userId`
    - Sends push via `web-push`, logs in `ReminderDeliveryLog (userId, reminderTime, sentDate)`
    - Immediately schedules the next occurrence for that reminder time via QStash (chain scheduling)
- Diagnostics
  - `app/api/push/status` (GET): shows whether the current user has a subscription and saved settings (times/timezone/frequency)
  - `app/api/push/scheduler-debug` (GET): shows current local HH:MM for the user, their saved times, “matches” array, and (attempted) recent cron logs
    - **New:** includes `recentQstashScheduleLogs`. Each entry shows the reminder time, timezone, delta minutes, HTTP status, and any error reason returned by QStash so we can tell if the token or payload was invalid.
  - `app/api/push/send-reminder-now` (POST): manual “send now” via server using your saved subscription
  - `app/api/push/test` (POST): send a “test notification”
- Legacy cron (still present)
  - `app/api/push/scheduler/route.ts` was progressively adjusted (exact match, +1, +2, +5 minute windows; then simplified/expanded). This fixed some cases but did not eliminate drift. We left it in place as a fallback while migrating to QStash.

Required environment variables
------------------------------
These must be present in the Vercel project for the QStash path:
- `QSTASH_TOKEN`: Upstash QStash Auth Token (MUST start with `qst_`). Without a valid `qst_` token, schedules will not be created; “Schedules” tab remains empty.
- `QSTASH_CURRENT_SIGNING_KEY`: Optional, improves security (signature verification is scaffolded; currently only header presence is checked).
- `QSTASH_NEXT_SIGNING_KEY`: Optional (for key rotation).
- `PUBLIC_BASE_URL`: e.g., `https://helfi.ai` (used by server when constructing absolute callback URL and when doing immediate dispatch on save in API routes).
Also required for push:
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` (already working; test route delivers).

What was tried (chronological highlights)
-----------------------------------------
1) Legacy cron approach
   - `vercel.json` cron set to every 5 minutes; later changed to every 1 minute.
   - Scheduler matched HH:MM exactly, then expanded to allow +1, +2, +5 minutes after, and even 1 minute early sends to combat drift; added duplicate prevention (`ReminderDeliveryLog`) to ensure single delivery per day per reminder time.
   - We added comprehensive debug logging, timezone conversion using `Intl.DateTimeFormat`, and created `SchedulerLogs`.
   - Observations: Vercel Cron frequently arrived late (e.g., logged current=18:04 with reminder=18:03 and matched=false; later runs matched +2 or +3 minutes and delivered but users got late notifications). Cron drift remained.

2) Push path verification
   - `/api/push/test` and `/api/push/send-reminder-now` consistently delivered notifications when the device had an active subscription and the app was backgrounded/locked. This proved the push path (service worker + VAPID + subscription persistence) is fine.

3) UX/content fixes
   - iOS instructions clarified; removed deep‑link to Settings; added clear steps and warnings about foreground suppression.
   - Settings UI supports 1–3 reminders with custom HH:MM and timezone selection; POST saves updated schema.

4) Move to exact‑time callbacks (QStash)
   - Implemented `lib/qstash.ts` with `scheduleReminderWithQStash` and `scheduleAllActiveReminders`:
     - Computes minutes until next occurrence for each HH:MM in the user’s IANA timezone.
     - Publishes a scheduled callback to `/api/push/dispatch` using QStash.
   - Implemented `/api/push/dispatch`:
     - Sends push, logs, and self‑schedules next occurrence.
   - Updated settings save route:
     - Schedules next occurrences via QStash on every save.
     - If save occurred within 5 minutes after a reminder time, does an immediate dispatch so the user doesn’t have to wait a day.
   - Added env var upsert scripts and set:
     - `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY`, `PUBLIC_BASE_URL`
   - Evidence of current blocker:
     - Upstash “Schedules” tab shows no items. When `QSTASH_TOKEN` is not a real Auth Token (must start with `qst_`), QStash rejects publish/schedule requests; no schedules are created, so nothing fires at the selected future minute.
     - We saw tokens that look like JSON payloads (`eyJVc2Vy...`) which are not valid QStash Auth Tokens. Those will not work for `https://qstash.upstash.io/v2/publish/...`.

Observations and evidence (representative)
------------------------------------------
- Cron evidence:
  - Debug output showed cases like:
    ```
    currentTime: "17:41", reminderTimes: ["17:31"], matched: false
    currentTime: "19:02", reminderTimes: ["18:03"], matched: false
    currentTime: "00:24", reminderTimes: ["00:21"], matched: true, reason: "LATE CRON CATCH: ... 3 minute(s)..."
    ```
  - Meaning: job woke up late; minute‑exact reminders were missed; increasing allowed window made some late deliveries happen, but not reliably “on time”.
- Push evidence:
  - Manual trigger delivered immediately and reliably (user screenshots confirm banners).
  - `/api/push/dispatch` returns HTTP 405 for GET (endpoint exists) and VAPID key endpoint returns a key → the live code is present on `helfi.ai`.
- QStash evidence:
  - Upstash QStash → Schedules shows **no schedules**. This is consistent with an invalid `QSTASH_TOKEN` (scheduling calls are executed but rejected by QStash → nothing appears in Schedules and nothing will fire).

What not to repeat
------------------
- Don’t keep tweaking time windows in the cron scheduler; it does not guarantee on‑time delivery. The cron can drift; drift is the problem.
- Don’t ask users to re‑enable notifications; the push path works (test/manual routes).
- Don’t assume the Upstash “token” that looks like `eyJVc2Vy...` is valid; QStash Auth Tokens **must** start with `qst_`.

Exact steps to finish (do this)
-------------------------------
1) Get a valid QStash Auth Token
   - Upstash → QStash → Overview (bottom) → “Reset Token” → copy the new **Auth Token** that starts with `qst_`.
   - Also click “Roll Signing Key” → copy `Current Signing Key` and `Next Signing Key` (both start with `sig_`).

2) Set env vars in Vercel (already scripted)
   - Use `scripts/update-qstash-envs.js` (or dashboard) to set:
     - `QSTASH_TOKEN = qst_...`
     - `QSTASH_CURRENT_SIGNING_KEY = sig_... (current)`
     - `QSTASH_NEXT_SIGNING_KEY = sig_... (next)`
     - `PUBLIC_BASE_URL = https://helfi.ai`
   - Redeploy (READY).

3) Verify scheduling works
   - In the app: Settings → Reminder Times → set Reminder 1 to 2–3 minutes ahead → Save.
   - Immediately check Upstash → QStash → Schedules. You should see a new schedule targeting `POST https://helfi.ai/api/push/dispatch` at the exact minute.
   - Alternatively (or additionally), visit `/api/push/scheduler-debug` while signed in. The `recentQstashScheduleLogs` array should show a row for your save with `scheduled: true`. If it shows `scheduled: false`, the `reason` column will explain why (e.g. `missing_qstash_token`, `qstash_http_401`, `fetch_error:...`).
   - Lock/background the phone; at that minute the banner should appear.
   - Upstash → Logs should show the call; Vercel logs for `/api/push/dispatch` should show a send and a follow‑up schedule for the next day’s occurrence.

4) Optional hardening (after it works)
   - Implement full signature verification for `Upstash-Signature` on `/api/push/dispatch` using @upstash/qstash SDK (currently only presence is optionally checked).
   - Remove or de‑emphasize the legacy cron scheduler once QStash path is proven.
   - Consider showing “Next reminder at HH:MM (local tz)” in Settings using the same `minutesUntilNext` logic to improve user feedback.

Tables touched/created automatically
-----------------------------------
- `CheckinSettings (userId, time1, time2, time3, timezone, frequency)`
- `PushSubscriptions (userId, subscription)`
- `ReminderDeliveryLog (userId, reminderTime, sentDate, sentAt)` (de‑dup per day/time)
- `SchedulerLogs` (legacy cron tracking; optional going forward)

Endpoints quick reference (for the next agent)
----------------------------------------------
- `POST /api/push/dispatch`
  - Body: `{ "userId": string, "reminderTime": "HH:MM", "timezone": string }`
  - Action: sends push; logs; schedules next occurrence
- `POST /api/push/send-reminder-now` → manual server‑side send using saved subscription
- `POST /api/push/test` → “Helfi test notification”
- `GET /api/push/status` → shows `{ ok, userId, hasSubscription, hasSettings, settings }`
- `GET /api/push/scheduler-debug` → current local HH:MM, user settings, matches, recent scheduler logs (legacy)

Known pitfalls
--------------
- iOS suppresses banners if the PWA is foregrounded; tests should background/lock before the minute.
- QStash free tier easily covers 1,000 messages/day and is fine for this use case.
- If `PUBLIC_BASE_URL` is empty, server‑side immediate dispatch on save will no‑op (code falls back to `VERCEL_URL` but best to set the base explicitly).

Rollback plan
-------------
- If QStash setup is blocked, legacy cron can still send (with drift); ensure `vercel.json` cron is set to `* * * * *`. Delivery will be “best effort” and might be a few minutes late.
- Once QStash is working, remove the cron completely to avoid duplicate sends.

Closing note
------------
The push pipeline is solid; the remaining blocker is the **correct** QStash Auth Token (`qst_...`) so that schedules are actually created when times are saved. Once the token is fixed and envs are redeployed, saving a reminder will put a scheduled callback in Upstash immediately and delivery will be on time, without cron drift. 


