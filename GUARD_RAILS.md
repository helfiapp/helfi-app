# 🛡️ Helfi Guard Rails (Protected Flows)

This file is the **single source of truth** for sections of the app that are considered
stable and must **not be changed** without:

1. Explaining the proposed change to the user in simple, non‑technical language, and  
2. Getting explicit written approval from the user.

Any agent working on this project **must read this file first** before touching the
protected areas listed below.

---

## 0. Update Insights / Add More flow (Jan 2026 – Locked)
- Health Setup must let users make multiple edits across pages, then ask **once** to “Update Insights” when they try to leave Health Setup (including Dashboard or another page). Do NOT reintroduce “prompt on every Next/Back”.
- The navigation guard must still protect leaving Health Setup when changes exist. Do NOT remove or loosen this guard.
- Warm + durable caching keeps onboarding fields (including birthdate) loaded immediately; do not strip this cache.
- Leave the current per-step targeted update buttons as-is; do not change when the popup appears or how it blocks navigation.
- Pending request for the next agent (do not implement without explicit user approval): force per-step insights regeneration to always call the model and charge tokens (no cache reuse). Only the edited step’s change type should be regenerated; do NOT switch to full “regen all sections,” and keep the current guards/prompt behaviour intact.

## 1. Email & Waitlist Protection (summary)

**Primary reference:** `WAITLIST_EMAIL_PROTECTION.md`

- Covers: email sending, waitlist flows, and related security/abuse safeguards.  
- Before changing any email‑related code (sign‑up, waitlist, marketing campaigns, etc.),
  agents must:
  - Read `WAITLIST_EMAIL_PROTECTION.md`  
  - Confirm with the user that changes are allowed  
  - Re‑test sign‑up and waitlist behaviour after modifications

For detailed rules and rationale, see the dedicated file above.

---

## 2. Health Setup / Onboarding / Dashboard / Insights

**Protected files:**
- `app/onboarding/page.tsx`
- `app/dashboard/page.tsx`
- `components/LayoutWrapper.tsx`
- `app/insights/page.tsx`
- `app/api/health-setup-status/route.ts`
- `lib/insights/issue-engine.ts`

These pieces together define the **Health Setup flow**:
- How users complete their intake
- When they are allowed to use Insights
- How and when they are reminded about incomplete setup

This flow is working correctly and is considered **locked**.

### 2.1 Definition of “Onboarding Complete”

Used everywhere as the single rule:

Onboarding is **complete** only when **both** are true:

1. **Basic profile is filled in**
   - `gender`
   - `weight`
   - `height`

2. **At least one health goal exists**
   - There is at least one `HealthGoal` where `name` does **not** start with `__`
   - These are the real user goals, not internal storage records

This rule is enforced in:
- `lib/insights/issue-engine.ts` (computes `onboardingComplete`)  
- `app/insights/page.tsx` (gates /insights)  
- `app/dashboard/page.tsx` (data status card)  
- `app/api/health-setup-status/route.ts` (status API used by the reminder)

**Agents must not loosen or change this rule** without updating all of the above and
getting user approval.

---

### 2.1.1 Health Setup autosave + AI context (Jan 2026 – Locked)

- Health Setup changes must save when leaving Health Setup (no per‑keystroke saves), and there is still no manual save button (including the “Health situations” step).
- If a user previously tapped “Skip for now,” typing into any Health situations field must **clear the skip** and keep auto‑save active.
- Insights generation must include Health situations notes (e.g., DHT sensitivity) and treat them as constraints when generating supplement guidance.

---

### 2.2 Onboarding Page Popup (“Complete your health setup”)

File: `app/onboarding/page.tsx`

Behaviour:
- On `/onboarding`, if onboarding is **not complete**, show a modal with:
  - Primary button: **“Continue”**  
  - Secondary button: **“I’ll do it later”**
- The modal appears on every visit to `/onboarding` until onboarding is complete.

**“I’ll do it later” must:**
1. Set a **session‑scoped** flag:
   - `sessionStorage.setItem('onboardingDeferredThisSession', '1')`
2. Redirect to the dashboard:
   - `window.location.replace('/dashboard?deferred=1')`

This flag:
- Prevents redirect loops in the current browser session.  
- Does **not** unlock Insights or permanently mark onboarding as complete.

Agents **must not remove or rename** this flag behaviour unless the user explicitly
asks for a change.

---

### 2.3 Dashboard Redirect & Status Card

File: `app/dashboard/page.tsx`

After calling `/api/user-data`, the dashboard:

1. Computes:
   - `hasBasicProfile = gender && weight && height`
   - `hasHealthGoals = goals.length > 0`
   - `onboardingComplete = hasBasicProfile && hasHealthGoals`

2. For **brand‑new users** (no meaningful data at all):
   - If `!onboardingComplete && !hasBasicProfile && !hasHealthGoals && no meds && no supplements`:
     - Check `sessionStorage.getItem('onboardingDeferredThisSession')`
     - If **not set** → redirect to `/onboarding`
     - If **set** → stay on dashboard (user chose “I’ll do it later” this session)

3. **Data Status Section** at bottom of dashboard:
   - If `onboardingData.onboardingComplete === true`:
     - Show green **“✅ Onboarding Complete”** card.
   - Else:
     - Show blue **“🚀 Complete your Health Setup”** card:
       - Text: “Finish your health profile to unlock personalized insights and tracking.”
       - Button text:
         - “Start Health Profile Setup” if there is essentially no data yet.
         - “Continue Health Setup” if some data exists.

Agents must **not**:
- Remove the `onboardingDeferredThisSession` check.  
- Force users back into onboarding when they have deferred it for the current session.  
- Mark onboarding as complete with weaker criteria than section 2.1.

---

### 2.4 Insights Gating

Files:
- `lib/insights/issue-engine.ts`
- `app/insights/page.tsx`
- `app/insights/InsightLandingClient.tsx`

Rules:

1. `/insights` must **never** show real insights unless `onboardingComplete === true`.  
2. When `onboardingComplete === false`, `/insights` must:
   - Show a gate screen explaining that Health Setup must be finished first.  
   - Provide:
     - **“Complete Health Setup”** → `/onboarding?step=1`  
     - **“Back to Dashboard”** → `/dashboard`
3. `InsightLandingClient` can show its own empty/“no issues” UI, but only **after**
   this top‑level gate has allowed access.

Agents must not bypass this check or provide “fake” personalised insights based on
partial or guessed health data.

---

### 2.5 5‑Minute Global Reminder (“Complete your Health Setup”)

Files:
- `components/LayoutWrapper.tsx`
- `app/api/health-setup-status/route.ts`

#### 2.5.1 Status API

`GET /api/health-setup-status`:
- Uses the same completion rule (section 2.1) to compute `complete`.  
- Sets `partial` for potential UI use.  
- Reads a hidden `HealthGoal` named `__HEALTH_SETUP_REMINDER_DISABLED__` to set
  `reminderDisabled`.

`POST /api/health-setup-status` with `{ disableReminder: true }`:
- Upserts the `__HEALTH_SETUP_REMINDER_DISABLED__` record to disable the reminder
  **for that account across all devices**.

#### 2.5.2 Reminder UI

Layout behaviour (`components/LayoutWrapper.tsx`):
- Only runs for **authenticated** users on **non‑public**, **non‑admin** routes.
- Waits **5 minutes** after page load, then calls `/api/health-setup-status`.
- If `complete === false` and `reminderDisabled === false`:
  - Shows a small bottom‑right card:
    - Message: Helfi needs Health Setup for accurate insights.
    - Buttons:
      - **“Complete Health Setup”** → `/onboarding?step=1`
      - **“Don’t ask me again”** → calls `POST /api/health-setup-status` with `{ disableReminder: true }`
  - Sets `sessionStorage.helfiHealthSetupReminderShownThisSession = '1'` so the banner
    appears only once per browser session.

This reminder is meant to be a **gentle nudge**, not a gate. Agents must not convert
it into a hard block or significantly change the timing/behaviour without consulting
the user.

---

### 2.6 Health Setup Desktop Sidebar (Dec 2025 – Locked)

- Health Setup (`/onboarding`) must show the standard desktop left menu so users can move around the app like other pages.
- When auto‑update‑on‑exit is enabled, the left menu must still work immediately; the save/regeneration should run in the background as the user leaves.
- If auto‑update‑on‑exit is disabled, leaving via the left menu must trigger the “Update Insights / Add more” prompt when there are unsaved changes.
- Do NOT allow silent navigation away from Health Setup when auto‑update‑on‑exit is disabled.
- **HARD LOCK (do not touch without explicit owner approval):** The desktop left menu must remain clickable *inside* Health Setup at all times. Any change that interferes with this is forbidden.

**Protected files (extra locked):**
- `components/LayoutWrapper.tsx`
- `app/onboarding/page.tsx`

**Why this is hard‑locked (do not ignore):**
- This area broke recently and blocked all left‑menu clicks on desktop while in Health Setup. It was extremely difficult to restore.

**Do NOT change or remove:**
- The sidebar click override in `app/onboarding/page.tsx` that directly listens to left‑menu clicks while on `/onboarding` and forces navigation.
- The `window.__helfiOnboardingSidebarOverride` flag that prevents `LayoutWrapper` from double‑handling sidebar clicks during Health Setup.
- The `data-helfi-sidebar="true"` attribute on the sidebar container used for the click override.
- The background save + insights update on exit (must run when leaving Health Setup, including sidebar navigation).

**If this ever breaks again, restore in this order (do not improvise):**
1) Ensure `app/onboarding/page.tsx` attaches click handlers to the left‑menu links and calls the background save/insights update before navigation.
2) Ensure `components/LayoutWrapper.tsx` does **not** intercept sidebar clicks when `window.__helfiOnboardingSidebarOverride` is set.
3) Ensure the left sidebar container keeps `data-helfi-sidebar="true"`.
4) Re‑test: left menu click from Health Setup → navigates immediately, and insights update runs in the background.

### 2.7 Weekly 7‑Day Health Report (Jan 2026 – Locked)

**Protected files:**
- `lib/weekly-health-report.ts`
- `lib/qstash.ts`
- `app/api/reports/weekly/run/route.ts`
- `app/api/reports/weekly/status/route.ts`
- `app/api/reports/weekly/dispatch/route.ts`
- `components/WeeklyReportReadyModal.tsx`

**Guard rails:**
- Reports are generated **in the background** and should not run on every page visit or whenever the app is opened.
- The **ready alert is scheduled for 12:00 pm in the user’s time zone**. Do not change this timing without explicit user approval.
- Time zone is resolved in this order: Check‑in settings → Mood reminders → AI tips → fallback UTC. Do not reorder without approval.
- The popup should appear **at most once per day** until the report is viewed or dismissed.
- If the report is locked (no credits), the popup CTA must send users to **Billing**, not to the report page.
- Email + push are sent **only once per report** and are triggered by QStash; do not re‑introduce repeated sends.
- The **PDF export lives on the 7‑day report page** (button uses `/api/export/pdf` with the report date range). Do not re‑introduce the old JSON export on the Account page without user approval.

### 2.8 Notification Inbox + Profile Badge (Jan 2026 – Locked)

**Protected files:**
- `lib/notification-inbox.ts`
- `app/api/notifications/inbox/route.ts`
- `app/api/notifications/unread-count/route.ts`
- `app/api/notifications/pending-open/route.ts`
- `app/notifications/inbox/page.tsx`
- `app/notifications/page.tsx`
- `components/PageHeader.tsx`
- `app/insights/InsightsTopNav.tsx`
- `components/LayoutWrapper.tsx`
- `app/pwa-entry/page.tsx`
- `public/sw.js`

**Guard rails:**
- All user notifications must be saved to the inbox when sent (push or email). Do not remove this logging.
- The inbox should show missed alerts and allow users to open or mark them as read.
- The profile avatar must show an unread badge when there are unseen notifications.
- Do not auto‑clear notifications without a user action (open / mark read / mark all).
- Notification tap routing (service worker + pending-open logic) is locked. Do not change without explicit owner approval.
- Completed alerts must be cleared only after a successful save (mood check-in or daily check-in). Do not remove this cleanup behavior.

---

## 3. Branding Assets (Logos & Icons)

**Source of truth:**
- Logos: `public/mobile-assets/LOGOS/helfi-01-01.*` (standard), `helfi-01-06.*` (white-on-dark).  
- Favicon/PWA base: `public/mobile-assets/FAVICONS/FAVICON-01.svg` (use this SVG for all generated icons).

**Protected outputs (must stay consistent):**
- `public/icons/app-192.png`, `public/icons/app-512.png`, `public/icons/app-1024.png`
- `public/icons/admin-192.png`, `public/icons/admin-512.png`
- `public/apple-touch-icon.png`
- `public/favicon.ico`
- `public/logo.svg`
- Icon references in `app/layout.tsx` (manifest + icons array)

**Guard rails:**
- Do **not** downscale from raster PNGs; regenerate from `FAVICON-01.svg` to avoid blur.  
- Dark backgrounds (e.g., sidebar) must use `helfi-01-06.*`; light backgrounds use `helfi-01-01.*`.  
- If branding changes are needed, update **all** outputs above in one sweep (PWA icons, apple-touch, favicon, logo.svg, manifests) and confirm with the user.  
- Service worker notifications should continue using the packaged icon (`/icons/app-192.png`) unless the user approves a different path.

---

## 3. Food Diary Entry Loading & Date Filtering

**Protected files:**
- `app/food/page.tsx` (lines ~1220-1420 - food entry loading logic)
- `app/api/food-log/route.ts` (lines ~8-95 - GET endpoint for retrieving entries)

### 3.1 Critical Issue: Missing Entries Due to Date Filtering

**Problem History:**
On January 19th, 2025, food diary entries disappeared because entries were being filtered out when `localDate` was missing or incorrect. The cached entries were filtered strictly by `localDate`, and entries without proper `localDate` values were lost from view.

**Root Cause:**
- Entries saved to the database might have missing or incorrect `localDate` values
- Frontend filtering was too strict - entries without matching `localDate` were filtered out
- Backend query only checked exact `localDate` matches, missing entries with incorrect dates
- No verification step to reconcile cached entries with database entries

### 3.2 Required Safeguards

**Frontend (`app/food/page.tsx`):**

1. **Always verify cached entries against database:**
   - When loading today's entries from cache, ALWAYS make a background API call to `/api/food-log` to verify
   - Compare cached entry IDs with database entry IDs
   - If database has entries missing from cache, merge them back in
   - This prevents entries from being lost due to filtering

2. **Never rely solely on cached data:**
   - Cached `todaysFoods` is for performance, not reliability
   - Always have a fallback to load from `/api/food-log` API
   - If cached entries are filtered out (empty array), immediately load from database

3. **Handle missing `localDate` gracefully:**
   - When `localDate` is missing, fall back to parsing timestamp from entry `id`
   - Don't filter out entries just because `localDate` is missing
   - Always merge database entries back into cache with proper `localDate` set

4. **Normalize every `/api/food-log` response before state updates:**
   - Route **all** fetch results through `mapLogsToEntries(...)` followed by `dedupeEntries(..., { fallbackDate })` before updating `todaysFoods` or `historyFoods` or persisting snapshots.
   - Do **not** hand-map logs or bypass `dedupeEntries`; ad-hoc mappers caused “all meals under Other on first render” by skipping meal/localDate normalization.
   - Apply this to every load path (warm-load verify, fallback loads, history loads, delete recovery) so category normalization stays consistent.

5. **Desktop entry menu overflow (do not break):**
   - Keep desktop food entry cards square-cornered **with** a thin outline (`border border-gray-200`); do not remove the border or reintroduce rounding.
   - The desktop entry action menu must fully overflow: parents/cards must allow `overflow-visible`, and raise z-index when the menu is open so all menu items are reachable. Do **not** reintroduce clipping or hide the menu behind containers. If you change the menu, you must ensure it still displays fully (use a portal if needed).

6. **Manual refresh only (mobile + desktop):**
   - Food diary must **not auto-refresh** on day changes, focus events, or navigation.
   - Refresh should only happen when the user manually pulls to refresh or taps the refresh control.
   - Do not re‑enable background refresh without explicit user approval.

**Backend (`app/api/food-log/route.ts`):**

1. **Query broadly, filter precisely:**
   - Query MUST include entries created within the date window, even if `localDate` doesn't match
   - Use OR conditions to catch entries with:
     - Correct `localDate` matching requested date
     - Null `localDate` but `createdAt` within date window
     - Incorrect `localDate` but `createdAt` within date window
   - After querying, filter results to ensure only entries for requested date are returned
   - Remove duplicates before returning results

2. **Never filter by `localDate` alone:**
   - Always check `createdAt` timestamp as fallback
   - Entries might have been saved with wrong `localDate` due to timezone issues or bugs
   - The `createdAt` timestamp is the source of truth for when entry was actually created

3. **Deduplication is required:**
   - Multiple OR conditions might return the same entry multiple times
   - Always deduplicate by entry `id` before returning results

### 3.3 What Agents Must NOT Do

**DO NOT:**
- Remove the database verification step in the frontend loading logic
- Make date filtering stricter or more restrictive
- Remove the fallback OR conditions in the backend query
- Filter entries out solely based on `localDate` mismatch
- Remove deduplication logic
- Assume cached data is always complete or correct
- Skip the database check "for performance" - reliability is more important

**DO:**
- Always verify cached entries against database
- Query broadly, filter precisely
- Handle missing `localDate` gracefully
- Merge missing entries back into cache
- Test with entries that have missing/incorrect `localDate` values

### 3.4 Detected Foods and Ingredient Edit UI (Apr 2026 - Locked)

**Protected file:**
- `app/food/page.tsx` (Detected Foods card + ingredient edit screen)

This section controls how detected ingredients are shown and edited. It has been agreed with the user and must not be changed without explicit written approval.

#### 3.4.1 Current Behaviour (Must Stay)

- The ingredient edit screen is full screen (not a pop-up) and must scroll.
- The rename box clears its text when the field is tapped. Cancel restores the original name.
- The label is **Weight** (not "Serving Size").
- Weight uses two controls: a number and a unit dropdown (g / oz / ml).
- Servings is a separate editable field.
- Changing Weight or Servings updates the macro totals and the front card.
- Editing the macro totals updates Weight and Servings (two-way sync).
- The front card and edit screen always show the same values for Weight, Servings, and macros.
- The macro section shows totals for the current number of servings.

#### 3.4.2 What Agents MUST NOT Do

- Do not revert the edit screen to a pop-up.
- Do not remove scrolling from the edit screen.
- Do not rename Weight back to "Serving Size".
- Do not break the two-way sync between Weight, Servings, and macros.
- Do not allow front card values to differ from the edit screen.

#### 3.4.3 Ingredient Card Integrity (Mar 2026 - Locked)

**Protected files:**
- `app/api/analyze-food/route.ts`
- `app/food/page.tsx`

Rules that must stay locked:
- **Never** allow a single combined ingredient card that lists multiple foods. If multi‑ingredient text appears, the server must re‑ask for separate items before returning.
- The client must **never** create a fallback single card from a combined sentence.
- **Weight numbers are not piece counts.** If a number is tied to weight (oz/g/ml/lb), it must **not** create pieces.
- A piece count is allowed only when the text explicitly says “2 patties / 3 slices / 4 wings” (or equivalent).

#### 3.4.4 Detected Foods List Layout (Apr 2026 - Locked)

- Ingredient cards are full width, edge to edge, with no gaps between cards.
- There is no background panel behind the ingredient cards.
- The whole card is clickable to expand and collapse.
- Add space between the Add ingredient button and the first card.
- Ingredient titles have extra left padding and must start with a capital letter.
- The "+ Add ingredient" button matches the "Add to Favorites" button style and width (rounded full, green, white text).
- The "Detected Foods: Rate this result" row is centered. The text is larger and the thumbs icons are larger. The text must not overflow.

#### 3.4.5 Food Analysis Header and Action Buttons (Apr 2026 - Locked)

- The "Food Analysis" title and the "Editing a saved entry" text are removed.
- The "Save changes" button is removed.
- The Cancel and Delete buttons sit in the top row, with Delete always red and white text.
- "Add to Favorites" sits under the image, uses green with white text, and is hidden when already added.

#### 3.4.6 Image Loading Behaviour (Apr 2026 - Locked)

- While a food image is loading, show a loading spinner inside the image box.
- Do not show a broken image icon while loading.
- If an edit-entry photo fails to load, auto-refresh the photo link.

#### 3.4.7 Favorites "All" Tab (Apr 2026 - Locked)

- The All tab must list each meal only once. No duplicates.

#### 3.4.8 Exercise Card Add Button (Apr 2026 - Locked)

- The exercise "+" button is aligned with "No exercise logged for this date" to reduce empty space.

#### 3.4.9 Energy Summary Swipe Bar (Apr 2026 - Locked)

- The grey swipe bar must not appear when scrolling left to right in the energy summary.

### 3.5 Testing Requirements

Before modifying food diary loading logic, agents must test:

1. **Entries with correct `localDate`:**
   - Should load from cache instantly
   - Should verify against database in background
   - Should appear correctly

2. **Entries with missing `localDate`:**
   - Should still appear (fallback to timestamp parsing)
   - Should be merged back into cache with `localDate` set
   - Should persist correctly

3. **Entries with incorrect `localDate`:**
   - Should still appear if `createdAt` matches date
   - Should be corrected in cache
   - Should not be lost

4. **Empty cache scenario:**
   - Should load directly from database
   - Should populate cache correctly
   - Should work reliably

5. **Cross-day boundary:**
   - Entries created late at night should appear on correct date

### 3.6 Food Diary Copy/Duplicate/Delete/Refresh (Mar 2026 - Locked)

**Protected file:**
- `app/food/page.tsx`

Do **not** change these without explicit written approval:
- Manual refresh only (pull‑to‑refresh / refresh button). Do **not** re‑enable auto refresh.
- Copy to today / duplicate / paste flows must stay instant and should add exactly one visible entry.
- Pending save queue and optimistic UI must remain (entries should not disappear while saving).
- Manual refresh duplicate cleanup must remain, and it must **not** remove entries marked as intentional duplicates.
- Deleting an entry must remove all matching duplicates and prevent “delete then re‑appear.”
- Keep the local‑to‑server ID linking so deletes always target the correct DB row.

---

## 4. Food Diary Action Menus (Desktop dropdown + Mobile swipe toggle)

**Protected file:** `app/food/page.tsx` (action menu rendering near lines ~7570-7820)

### 4.1 Desktop 3-dot menu (must stay usable near viewport edges)
- The entry action dropdown is rendered as a **fixed** element with computed `top`/`bottom`/`right` and a `maxHeight` + `overflow-y: auto`.
- Parents/cards must allow `overflow-visible` and raise z-index for the open menu. Do **not** revert to relative/absolute positioning that clips the menu.
- If changing the dropdown, preserve edge-aware positioning so items remain reachable when the entry is near the bottom of the viewport. Portal is acceptable if behaviour remains identical.

### 4.2 Mobile green swipe-toggle (must open AND close)
- The green toggle button must remain **clickable above the action sheet** (z-index bump when the sheet is open) so a second tap closes the sheet.
- Tapping the toggle must always set `swipeMenuEntry` to `null` (closing) when the same entry is already open, and should reset swipe offsets for previously open entries.
- Do not remove stopPropagation/preventDefault that keeps the tap from falling through. Do not drop the z-index class; it is required to make the close tap land.

### 4.2.1 Edit entry while add menu is open (must stay guarded)
- When the green “+” add menu is open, do **not** fire edit actions until the add menu is closed. Current behaviour closes add menus (`closeAddMenus`), then runs `editFood` on the next frame (requestAnimationFrame or setTimeout). Keep this guard intact.
- Applies to both mobile row taps and the desktop row action menu “Edit Entry”. If add menu is open, ignore the tap until the menu is closed or explicitly close it first.
- Do not reintroduce broad pointer blocking/overlays; rely on the explicit guard so the green “+” can still toggle closed.

### 4.3 What agents must not break
- Do **not** reintroduce clipping/hidden overflow on the desktop menu.
- Do **not** lower the green toggle behind the sheet (no z-index removal), or the close tap will be blocked.
- Do **not** change the toggle logic to only open; it must be a true toggle (open/close).

Any change to these behaviours requires explicit user approval and must be re-tested on both desktop and mobile.

### 4.4 Category expansion defaults for empty sections
- Empty meal categories must default to **closed** whenever the Food Diary screen loads (including returning to the page or relaunching).
- If a category has no entries, do not persist it as open in warm or durable snapshots; auto-collapse it on hydrate so accidental opens don’t stick.
- Categories with entries should preserve the user’s last choice; do not auto-close them unless the user explicitly closes them.
   - Timezone handling must be correct
   - Date filtering must account for user's timezone

### 3.6 Mobile Category “+” Toggles (Locked)

The green “+” buttons for each Food Diary category (Breakfast, Lunch, Dinner, Snacks, Other) are a **strict toggle**:
- Tap the “+” to open the add panel for that category.
- Tap the **same “+” again** to close it.
- Do **not** change this to “tap outside to close” or any other behaviour.
- The “Other/+” panel must remain scrollable so all options are reachable on mobile.

### 3.7 Food Diary Manual Refresh Only (Jan 2026 – Locked)

**Protected file:**
- `app/food/page.tsx`

**Guard rails:**
- Do **not** auto‑refresh when:
  - The user changes the diary date.
  - The tab regains focus.
  - The page becomes visible again.
- Refreshing should happen **only** when the user manually pulls down (pull‑to‑refresh) or taps the refresh button.
- Do not re‑enable background refresh without explicit user approval.
- **Auto-scroll is required on mobile:** when a category “+” is opened, scroll that category row into view (without covering or moving the “+”) so the entire add panel is visible. Do not remove or alter this scroll behavior.

### 3.7 Food Diary Deletes & Snapshot Sync (Dec 2025 – Locked)
- Deletion must also clear/sync the “today’s foods” snapshot so stale cards cannot reappear:
  - Keep `/api/user-data/clear-todays-foods` intact; do not remove or bypass it.
  - In `app/food/page.tsx`, after deleting an entry, continue posting the updated (or empty) `todaysFoods` to `/api/user-data` (or call the clear endpoint when empty). Do **not** remove this server-sync step.
  - Do not reintroduce local-only deletes that skip the server snapshot; fixes were for entries resurrecting after refresh.
- **Backfill safeguard (Jan 2026):** If the client has local entries for a day but `/api/food-log` returns zero rows, the UI now backfills those entries into `FoodLog` so deletes have real IDs and don’t 404. Do **not** remove this backfill step; it is required to keep saves/deletes reliable when the server is temporarily empty.
- **Favorites and write guards (Dec 2025):** `/api/user-data` must not overwrite favorites with an empty array; it logs `AGENT_DEBUG favorites write` and skips empty wipes. Do not remove this guard or the logging.
- **Server-side dedupe (Dec 2025):** `/api/food-log` dedupes on write (blocks near-identical duplicates within a short window) and the All tab filters out stale/corrupt entries (only recent valid rows). Do not remove these protections without approval.

#### 3.7.1 Persistent/Sticky Entry Playbook (Dec 2025 incident)
- Root cause observed: entries saved with mismatched `localDate` vs `createdAt` leak across adjacent days; client warm cache can keep showing the card even after server delete.
- Protections in place (do not remove):
  - Saves anchor both `createdAt` and `localDate` to the selected date.
  - GET `/api/food-log` auto-heals: if `createdAt` matches the requested day but `localDate` differs, it rewrites `localDate` to the correct day.
  - Delete sweep: tries ID first, then description+category across multiple dates (entry date, localDate, selected date, today, ±1, ±2) with a deduped list.
- If a “stuck” entry appears:
  1) Run a server-signed delete using the browser console (logged-in session):
     - Fetch matching rows and delete by id, then run description delete across the affected dates. Example:
       ```js
       (async () => {
         const desc = 'A burger with a sesame seed bun, two beef patties, cheese, bacon, lettuce, tomato, and mayonnaise.';
         const category = 'dinner';
         const dates = ['2025-12-06','2025-12-07','2025-12-08']; // adjust as needed
         const tz = new Date().getTimezoneOffset();
         const all = [];
         for (const date of dates) {
           const res = await fetch(`/api/food-log?date=${date}&tz=${tz}`);
           const json = await res.json();
           (json.logs || []).forEach(l => all.push({date, id: l.id, localDate: l.localDate, createdAt: l.createdAt, meal: l.meal || l.category, desc: l.description?.slice(0,120)}));
         }
         const matches = all.filter(l => (l.desc || '').toLowerCase().includes('burger with a sesame seed bun') && (l.meal || '').toLowerCase() === category);
         console.log('Matches found:', matches);
         for (const m of matches) {
           const r = await fetch('/api/food-log/delete', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ id: m.id }) });
           console.log('delete by id', m.id, m.date, r.status, await r.text());
         }
         const sweep = await fetch('/api/food-log/delete-by-description', {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({ description: desc, category, dates }),
         });
         console.log('delete-by-description', sweep.status, await sweep.text());
         for (const date of dates) {
           const res = await fetch(`/api/food-log?date=${date}&tz=${tz}`);
           const json = await res.json();
           console.log('After delete check', date, (json.logs || []).length, json.logs || []);
         }
       })();
       ```
  2) Clear client warm/durable cache and reload to drop stale cards:
     ```js
     localStorage.removeItem('foodDiary:warmState');
     sessionStorage.removeItem('foodDiary:warmState');
     location.reload();
     ```
  3) Re-check the affected dates (same script as above) and confirm zero rows.
- Do not weaken any of the protections above (anchored saves, auto-heal, multi-date delete sweep, cache clear + reload).

### 3.8 Ingredient Card Summary Filtering (Dec 2025 – Locked)
- In `app/food/page.tsx`, keep the guard that strips generic “plate/meal” summary items when multiple ingredients exist (e.g., “The image shows…”, long “burger with …” phrases). Do not remove or relax this filter without approval.
- Ingredient cards for multi-item meals must remain one per distinct ingredient; do not reintroduce plate-level summary cards into the list.

### 3.9 Portion Sync & Burger Defaults (Dec 2025 – Locked)
- **Files:** `app/food/page.tsx`, `app/api/analyze-food/route.ts`.
- Do NOT change servings/pieces/weight sync logic. Servings and pieces must stay in lockstep, and weight must derive from per-serving weight (including `piecesPerServing` defaults). If you switch portion modes, weight must seed from the current servings; changing weight must back-calculate servings/pieces.
- Do NOT weaken per-piece defaults for patties/cheese/bacon/eggs (115g ~250 kcal patty; realistic slice weights). Do NOT drop `piecesPerServing` seeding or numeric normalization of counts.
- Do NOT change the discrete steps (servings step = 1 / piecesPerServing) or make pieces non-integer.
- Do NOT loosen the “be daring” guessing rule in the analyze-food prompt: it must keep scanning edges/corners and include plausible side items (e.g., breads/rolls/bagels) as `isGuess: true` when uncertain. This applies to all meals, not just burgers.
- Do NOT enlarge the analyzed photo on desktop; keep the compact square preview sizing. Category “+” menu must remain visible/not covered.
- Any change requires explicit written approval from the user and must be tested live with the burger photo flow: pieces default to the detected count, servings step 1/N, weight sync both directions, realistic kcal/grams.

### 3.10 Discrete Produce Counts & Weight Seeding (Jan 2026 – Locked)
- **Files:** `app/food/page.tsx` — especially `parseCountFromFreeText`, `piecesMultiplierForServing`, `estimateGramsPerServing`, `getBaseWeightPerServing`, `applyStructuredItems` (weight seeding block), UI serving/weight display around lines ~6700-7050.
- Do NOT remove or weaken the rule that when `piecesPerServing > 1`, serving weight and display label must scale to *all* pieces (e.g., “6 medium (200g each)” and weight ≈ 6× per-piece grams). No reversion to per-piece weights or labels.
- Do NOT bypass `piecesMultiplierForServing` or the weight reseed in `applyStructuredItems`; both must remain to override per-piece seeds from `serving_size` text like “1 medium (200g)”.
- Do NOT change the serving/weight UI text that shows combined serving size and total amount for discrete items; pieces stay integer, servings stay 1 base.
- Any modification to discrete counts, serving labels, or weight seeding requires explicit user approval and must be retested with multi-piece produce (e.g., 6 carrots/zucchinis) to confirm pieces, labels, and weights all reflect the full set.

### 3.11 Admin Credit Grants & Meter (Jan 2026 – Locked)
- **Files:** `app/api/admin/user-management/route.ts`, `app/api/credit/status/route.ts`, `lib/credit-system.ts`, `components/UsageMeter.tsx`.
- Admin “Add Credits” must post to `/api/admin/user-management` and increment `additionalCredits` directly (non-expiring). Do NOT revert to expiring top-ups for admin grants without explicit user approval.
- `/api/credit/status` must always include `additionalAvailableCents` and add it to `totalAvailableCents`; meter/UI must reflect the sum of subscription remaining + active top-ups + additional credits. Do NOT drop additional credits from the meter.
- Admin user list must surface `totalAvailableCredits` including additional credits (not just top-ups); do not change this aggregation without approval.
- Any billing/credit change requires explicit user approval and retesting on a Premium account with admin-added credits to confirm the meter and admin modal both show the added amount immediately.

---

## 4. Macros Progress Bars & Remaining Calories Ring (Locked)

The macros progress bars and remaining calories ring in the Food Diary are now working perfectly and must **not be changed** unless the user explicitly requests modifications.

### 4.1 Protected Components

**Protected files:**
- `app/food/page.tsx` (lines ~265-353 – `TargetRing` component for remaining calories)
- `app/food/page.tsx` (lines ~4867-4901 – macros progress bars rendering)
- `components/SolidMacroRing.tsx` (solid macro ring component, if used elsewhere)

### 4.2 Macros Progress Bars

**Location:** `app/food/page.tsx` lines ~4867-4901, within the "Energy summary" section

**Current Behaviour (Must Stay):**

Each macro (Protein, Carbs, Fat, Fibre, Sugar) displays:
1. **Label and values:**
   - Macro name (e.g., "Protein")
   - Consumed / Target format (e.g., "50 / 100 g")
   - Remaining amount in colored text (e.g., "50 g left")
   - Percentage display (e.g., "50%")
2. **Progress bar:**
   - Horizontal bar showing consumed percentage
   - Bar color matches macro color (Protein: red, Carbs: green, Fat: purple, Fibre: cyan, Sugar: orange)
   - Bar turns red (`#ef4444`) when over target (100%+)
   - Bar width is clamped to maximum 100% visually
3. **Calculation logic:**
   - `pctRaw = consumed / target` (can exceed 1.0 when over target)
   - `pct = Math.max(0, pctRaw)` (ensures non-negative)
   - `percentDisplay = Math.round(pctRaw * 100)` (for percentage text)
   - `remaining = Math.max(0, target - consumed)` (never negative)
   - Bar width uses `Math.min(100, pct * 100)` to cap visual display at 100%

**What Agents MUST NOT Do:**
- Change the progress bar color scheme or remove the "over target" red color
- Modify the calculation logic for percentage or remaining amounts
- Remove or change the format of the "consumed / target" display
- Change the order of macros (Protein, Carbs, Fat, Fibre, Sugar)
- Remove the "left" text showing remaining amounts
- Change the bar height (`h-2`) or styling
- Remove the percentage display or change its format

### 4.3 Remaining Calories Ring

**Location:** `app/food/page.tsx` lines ~265-353 (`TargetRing` component), rendered at lines ~4904-4937

**Current Behaviour (Must Stay):**

The remaining calories ring displays:
1. **Two-tone ring visualization:**
   - Green circle (`#22c55e`) representing remaining allowance (full circle)
   - Red overlay (`#ef4444`) representing consumed amount (overlays from top, grows clockwise)
   - Ring rotates -90 degrees so it starts from top
   - Stroke width: 8px
   - Responsive sizing: 144px on mobile, 132px on desktop
2. **Center display:**
   - Main value: remaining calories/kJ (e.g., "1,200 kcal" or "5,000 kJ")
   - Unit displayed below value
   - Label "Remaining" below the ring
3. **Supporting information:**
   - "Daily allowance: X kcal/kJ" text below ring
   - Legend showing:
     - Red dot + "Used" (what's been consumed)
     - Green dot + "Remaining" (what's left)
4. **Calculation logic:**
   - `percent` parameter is the *used* fraction (0–1), where 1.0 = 100% consumed
   - `usedFraction = Math.max(0, Math.min(percent, 1))` (clamped to 0–1)
   - `usedLength = usedFraction * circumference` (for red overlay)
   - Remaining value: `Math.max(0, target - consumed)` in selected unit (kcal/kJ)
   - Unit toggle (kcal/kJ) switches between energy units

**What Agents MUST NOT Do:**
- Change the two-tone ring design (green base + red overlay)
- Modify the ring colors (`#22c55e` green, `#ef4444` red)
- Change the ring rotation or starting position
- Remove or modify the center value display format
- Change the stroke width (8px) or ring dimensions
- Remove the "Daily allowance" text or legend
- Modify the calculation logic for remaining calories
- Remove the kcal/kJ unit toggle functionality
- Change the responsive sizing behavior

### 4.4 Energy Summary Section Layout

**Location:** `app/food/page.tsx` lines ~4830-4940

**Current Layout (Must Stay):**
- Desktop: Grid layout with macros progress bars on left, remaining calories ring on right
- Mobile: Stacked layout with remaining calories ring on top, macros progress bars below
- Header shows "Today's energy summary" or "Energy summary" with kcal/kJ toggle
- Energy summary stays visible even when no meals are added (targets show with 0 used)

**What Agents MUST NOT Do:**
- Change the responsive layout behavior (grid on desktop, stacked on mobile)
- Remove the energy unit toggle (kcal/kJ)
- Modify the section header text or styling
- Change the order of elements (ring vs progress bars)
- Hide the Energy summary until a meal is added

### 4.5 Testing Requirements

Before modifying macros progress bars or remaining calories ring, agents must test:
1. **Normal consumption:** Values below target show correct percentages and green bars
2. **Over target:** Values exceeding target show red bars and correct "over 100%" display
3. **Zero consumption:** Empty diary shows 0% bars and full green ring
4. **Unit switching:** kcal/kJ toggle updates both ring value and daily allowance text
5. **Responsive design:** Layout switches correctly between mobile and desktop views
6. **Multiple macros:** All five macros (Protein, Carbs, Fat, Fibre, Sugar) display correctly

---

## 3.8 Food Diary Photo Storage (Dec 2025 – locked)

Food diary photos now live in **Vercel Blob** and must not be stored in Neon.

**Protected files:**
- `app/api/food-log/route.ts`
- `app/api/food-log/delete/route.ts`
- `app/api/food-log/delete-atomic/route.ts`
- `app/api/food-log/delete-by-description/route.ts`
- `app/api/cron/food-photo-cleanup/route.ts`
- `lib/food-photo-storage.ts`
- `vercel.json` (daily cleanup cron)

**Rules that must stay:**
- `imageUrl` stored in `FoodLog` is always a **remote Blob URL** (no base64 stored long-term).
- When a diary entry is deleted, its photo is deleted **immediately** if no other entry still uses it.
- A daily cleanup job removes photos older than the retention window and clears `imageUrl`.
- Retention is controlled by `FOOD_PHOTO_RETENTION_DAYS` (default 90). Do not change the default without approval.
- If Blob storage is not configured, the system must fail softly (do not break saving entries).

**Why locked:**
- Prevents database bloat in Neon.
- Keeps storage costs predictable while preserving nutrition data.

## 5. AI Food Analyzer & Credit/Billing System (Critical Lock)

These flows have been broken repeatedly by past agents. The current behaviour
is working and must be treated as **locked** unless the user explicitly asks
for a change.

### 4.1 Protected Files (AI Food Analyzer & Credits)

- `app/food/page.tsx` (entire file – Food Analyzer UI + diary + AI flow)
- `app/api/analyze-food/route.ts` (Food Analyzer backend / OpenAI calls)
- `lib/credit-system.ts` (`CreditManager` and credit charging logic)
- `app/api/credit/status/route.ts` (credits remaining bar – wallet status)
- `app/api/credit/feature-usage/route.ts` (“This AI feature has been used X times…”)
- `app/api/credit/feature-usage-stats/route.ts` (Billing page “Your usage” time-range stats)
- `app/api/credit/usage-breakdown/route.ts` (admin/diagnostic usage breakdown)
- **Food image freshness + curated USDA enforcement (Dec 2025):**
  - `app/api/analyze-food/route.ts` still hashes images, but **food photo analysis and barcode label scans must pass `forceFresh`** so each analysis is new. Do not re-enable cached reuse for these scans without explicit user approval.
  - `app/food/page.tsx` enriches common items (bun, patty, cheese, ketchup, etc.) with curated USDA-backed macros, enforces realistic floors, and normalizes names (e.g., “Burger bun” instead of random variants). Do not weaken or remove this enrichment/normalization.
- “Never wipe ingredient cards” guard: `applyStructuredItems` must not replace existing cards with an empty list if a new analysis yields nothing. Preserve existing items and totals in that case. **Do not change this behaviour or clear `analyzedItems` / `analyzedTotal` in new flows without explicit written approval from the user. If ingredient cards ever disappear after a photo or text re‑analysis, treat that as a critical bug and restore this guard – do NOT redefine the UX.**
  - Intent: keep macros realistic (~6 oz patty ~450 kcal) and totals consistent across repeated analyses of the same image; preserve cards at all times.
- **Strict AI-only ingredient cards (Dec 2025 – locked):**
  - Ingredient cards must come from AI‑generated structured items only. Do **not** create placeholder cards or extract cards from prose descriptions on the client.
  - If ingredients are missing, the backend must re‑ask the AI to output the missing items (AI‑only follow‑up). Do not backfill cards locally.
- **Analysis speed and cost control (Apr 2026 - locked):**
  - Stop after one good follow-up. If valid items exist, do not chain extra AI calls.
  - Avoid multi-step follow-ups that increase time or credits unless the user explicitly asks.
- **Food photo model defaults + component-bound follow-up (Dec 25, 2025 – locked):**
  - Food photo analysis defaults to `gpt-4o` for speed and accuracy. Do not revert image analysis to `gpt-5.2` by default.
  - Packaged/label OCR keeps `gpt-5.2` for per‑serve accuracy; do not downgrade label scans.
  - The component‑bound vision follow‑up must remain: one ingredient card per listed component, no summary card, no uniform “100 g” defaults.
- **Do not undo the discrete-portion fix (Nov 22, 2025):**
  - `app/food/page.tsx` now *scales macros instead of servings* for discrete items when the label states multiple pieces (e.g., “3 large eggs”, “4 slices bacon”). Servings stays at `1` to avoid “3 servings of 3 eggs”, while calories/macros are multiplied by the labeled count. **Leave this logic intact** unless the user explicitly requests a different design.
- **Pieces only when explicitly counted (Dec 2025 – locked):**
  - In `app/api/analyze-food/route.ts`, only set `pieces` / `piecesPerServing` when the item name or serving size explicitly shows a count (e.g., “1 egg”, “3 strips bacon”, “4 sausages”).  
  - If a clear count is not visible, default to grams/serving size and **do not** show pieces in the ingredient card.
  - This applies to meal photo analysis and text-based analysis alike; do not reintroduce inferred piece counts without user approval.
- **Keep bagel starter data intact:** `data/foods-starter.ts` includes `Sesame Bagel` with standard macros so photo analyses have a reliable fallback. Do not remove or rename this entry without approval.
- **Packaged per-serving OCR (Nov 24, 2025 – locked):**
  - Packaged (“Product nutrition image”) must use **only the per-serving column** from the label; ignore per-100g.
  - Do not sum saturated/trans into total fat. If macros overshoot label calories, only clamp fat (and carbs if clearly under-read) to fit label kcal; otherwise keep the per-serving numbers from the label.
  - Barcode mode is **removed**; do not reintroduce barcode lookups or hallucinated products. If nothing is found, stick to label OCR.
- **Barcode label scan accuracy (Dec 2025 – locked):**
  - Barcode label scans must read **ONLY the first per-serve column** on the label. Never use the per-100g column.
  - If the per-serve values are unclear or do not fit the serving size, block saving and show the red warning. Do not allow silent saves.
  - The warning must include the **Edit label numbers** action so users can correct values.
  - For label scans, do not use FatSecret/USDA fallbacks. Use label values or user edits only.
- **Product nutrition images use the same strict block (Dec 2025 – locked):**
  - When the user selects “Product nutrition image,” apply the same label checks and block saving if numbers do not fit the serving size.
- **Serving step snapping (Nov 24, 2025 – locked):**
  - If the serving label includes a discrete count in parentheses (e.g., “10g (6 crackers)”, “1 serving (3 eggs)”), the serving step is exactly `1 / count`, and values snap to that fraction so whole numbers stay exact (no 2.002 drift).
  - For non-discrete or unspecified counts, keep the 0.25 step. Do not loosen this snapping logic without user approval.

### 4.2 Absolute Rules for Agents

Agents **must NOT**:

- Disable billing by flipping booleans such as `BILLING_ENFORCED` to `false`
  without explicit written approval from the user.
- Change how remaining credits are calculated or displayed (wallet vs. legacy
  credits) without:
  - First asking the user for permission, and
  - Gathering live JSON from:
    - `https://helfi.ai/api/credit/status`
    - `https://helfi.ai/api/credit/feature-usage`
    - `https://helfi.ai/api/credit/usage-breakdown`
- Edit the main Food Analyzer logic in `app/food/page.tsx` (analysis flow,
  ingredient cards, serving controls, nutrition totals, or diary history)
  unless the user has clearly requested a change to that specific behaviour.
- Modify `CreditManager` in `lib/credit-system.ts` to “work around” bugs
  elsewhere. Fix the real bug instead.

If credits or usage counters ever look wrong, agents must:

1. **Do not touch the Food Analyzer or credit code first.**
2. Ask the user (in simple language) to open the three credit APIs in their
   browser while logged in and paste the JSON (status, feature-usage,
   usage-breakdown).
3. Use those responses to diagnose the issue before proposing any code changes.

Only after following the above and explaining the exact plan in plain English
may an agent change any of the protected files in this section.

### 4.3 Usage Stats (Billing) – Counting Rules (Dec 2025)

Billing shows a “Your usage” section with time ranges (7 days, 1/2/6 months, all time, custom).
These counts are meant to reflect **user-visible actions**, not internal helper calls.

**Counting rules (must stay stable):**
- Food photo analysis: count **one** use per `scanId` for `food:image-analysis`, `food:text-analysis`, `food:analyze-packaged` (exclude re-analysis and ignore events without `scanId` to avoid double-logging).
- Symptom analysis: count `symptoms:analysis` events.
- Medical image analysis: count `medical-image:analysis` events.
- Light chat: count `symptoms:chat` + `medical-image:chat` events.
- Insights generation: count **one** use per `runId` for `insights:*` (excluding `insights:ask` / `insights:unknown`), plus count `insights:landing-generate` when `runId` is missing.

If you change logging or feature names, you must update these rules and re-check that displayed counts do not jump unexpectedly.

---

## 9. Mobile Food Diary “Instant Actions” (delete / duplicate / copy to today)

These mobile interactions are considered tuned and must stay instant and single-action:

- **Files:** `app/food/page.tsx` (action handlers, swipe menu, duplicate/copy logic)
- **Behaviour that must not regress:**
  - Delete (swipe + menu) removes the row immediately and only syncs in the background; no spinner or blocking wait.
  - Duplicate and “Copy to Today” add exactly **one** entry, instantly visible, with no double renders even when localDate is missing; dedupe must normalize date from timestamp.
  - Add to Favorites stays instant and non-blocking.
- **Do not:**
  - Introduce delays/spinners before the UI updates.
  - Change dedupe keys in a way that allows duplicate copies (same description/time/date) to appear.
  - Move persistence to the foreground or block the UI on API latency.
- If you need to change this flow, explain to the user why, confirm approval, and re-test: delete via swipe/menu, duplicate, and copy-to-today across different dates to ensure only one entry appears and the UI updates instantly.

---

## 6. Medical Image Analyzer & Chat (Locked)

The Medical Image Analyzer has now been stabilised and tuned end‑to‑end:

- Image upload, credit handling and analysis call  
- Structured “Analysis Results” cards (Summary, Likely conditions, Red‑flags, What to do next, Disclaimer)  
- Safety‑first handling when the AI provider refuses to analyse a high‑risk image  
- The “Chat about your medical image” follow‑up assistant with headings and bullet formatting

These flows are **considered complete** and must **not be changed** unless the user explicitly asks for a change to this area.

### 5.1 Protected Files (Medical Image Analyzer)

- `app/medical-images/page.tsx` (entire page – upload, Analyze button behaviour, Analysis Results layout, and how chat is wired in)
- `app/medical-images/MedicalImageChat.tsx` (chat UI, formatting and reset behaviour)
- `app/api/test-vision/route.ts` (medical image analysis backend, prompts, safety fallback when the provider refuses to analyse an image)
- `app/api/medical-images/chat/route.ts` (chat backend using the analysis as context)

### 5.2 Absolute Rules for Agents

Agents **must NOT**:

- Change the layout or structure of the Analysis Results cards (Summary, Likely conditions, Red‑flags, What to do next, Disclaimer) without explicit written approval from the user.  
- Change how confidence levels are displayed or ordered for conditions (high → medium → low) unless the user has specifically requested a change to that behaviour.  
- Modify the prompts or safety logic in `app/api/test-vision/route.ts` in a way that weakens the “see a real doctor” guidance when the provider refuses to analyse a potentially serious image.  
- Alter the chat formatting rules (section headings, bullets, spacing) or how the chat uses the existing analysis as context, except when the user explicitly asks for a change to the medical image chat experience.  
- Bypass or remove the guard rails that stop the model from diagnosing cancer or other life‑threatening conditions.

Agents **may**:

- Fix clear typos in user‑visible text (copy) if the meaning does not change.  
- Add strictly internal comments (for other agents) that do not alter runtime behaviour.  
- Update TypeScript types only if required by a framework upgrade, and only after confirming with the user.

Any functional change to the Medical Image Analyzer or its chat must be:

1. Explained to the user in simple, non‑technical language.  
2. Explicitly approved in writing by the user.  
3. Tested with:  
   - A “normal” image (rash/HSV/benign‑looking lesion)  
   - A clearly worrying image (suspicious mole or similar) to confirm that the safety fallback still guides the user to a real doctor.

---

## 7. Chat Formatting Across AI Conversations (Locked)

The chat UI across the app has been standardised to render ChatGPT‑style, well‑spaced messages with headings, bullets, and numbered lists even when the model streams content as one long paragraph. Do **not** loosen or remove these formatting helpers.

**Protected files:**
- `lib/chatFormatting.ts` (shared formatter that inserts line breaks around headings, bullets, and numbered lists)
- `app/symptoms/SymptomChat.tsx` (symptom analysis chat UI)
- `components/VoiceChat.tsx` (general AI chat UI)
- `app/medical-images/MedicalImageChat.tsx` (medical image follow‑up chat UI)
- `app/insights/issues/[issueSlug]/SectionChat.tsx` (insights section chats for issues like libido/medications)

Agents must not:
- Remove or bypass `formatChatContent` or equivalent line‑break/spacing logic that prevents single‑block outputs.  
- Change heading/list detection or spacing without explicit written approval from the user.  
- Make per‑feature formatting inconsistent (all chat surfaces must stay aligned on the same formatting rules).

If changes are requested, explain them to the user first, get explicit approval, and ensure all chat experiences remain consistent and readable.

---

## 10. PWA Home Screen / Entry Path (Locked)

**Protected files:**
- `public/manifest.json` → `start_url` must stay `/auth/signin`, `scope` `/`, icons point to local leaf assets.
- `middleware.ts` → when a valid session exists and the path is `/auth/signin` **or `/`**, it must redirect server-side to `/pwa-entry` before rendering the login/marketing page.
- `app/pwa-entry/page.tsx` → sole server-side router that sends signed-in users to onboarding (if incomplete) or their last page/dashboard; no extra client-side redirects here.
- `app/layout.tsx` → manifest link + icons pointing at `/icons/app-192.png`, `/icons/app-512.png`, and `/apple-touch-icon.png`.
- `public/icons/app-192.png`, `public/icons/app-512.png`, `public/apple-touch-icon.png` → green leaf icons; do not swap to remote/CDN.

**Do not change any of the above without explicit user approval.** This combo is the only proven fix after multiple failed attempts.

### Required behaviour
1) When adding to Home Screen, Safari must keep `/auth/signin` (not force `/`).  
2) Opening from the icon while signed in must **skip** the login/marketing page and land in the app (onboarding if needed; otherwise last page/dashboard) via `/pwa-entry`.  
3) Home Screen icon must show the green leaf from the local assets above.

### If it breaks, restore by:
1) Set `start_url` back to `/auth/signin` in `public/manifest.json` (keep `scope: "/"`).  
2) Ensure `middleware.ts` redirects signed-in hits on `/auth/signin` or `/` to `/pwa-entry`.  
3) Keep `/pwa-entry` server-only routing; don’t add client-side effects.  
4) Keep `app/layout.tsx` manifest/icons pointing to local leaf assets; ensure the three icon files are present and correct.

### Why locked
- Changing start_url/scope or removing the middleware redirect reintroduces login flashes, wrong landing pages, or the grey URL bar.  
- Remote/CDN icons or path changes break the PWA install prompt/icon.  
- This flow was stabilised after many failed attempts; do not “experiment” here without user consent and a rollback plan.

---

## 11. Barcode Scanner (Locked)

**Protected file:** `app/food/page.tsx` (barcode scanner UI + ZXing decoder)

- The barcode scanner is now stable on iOS PWA using **ZXing** with `decodeFromConstraints`, rear camera, continuous autofocus hint, “try harder” hint, and no photo/fallback flows.
- The overlay is intentionally minimal (clear view + frame + flash + small status chip).
- Do **not** swap the decoder (no html5-qrcode, no native `BarcodeDetector`), change constraints, add photo upload, or alter the overlay without explicit written approval from the user.
- Barcode results must be saved as a single **ingredient card** item (same shape as photo/AI `analyzedItems`) using `buildBarcodeIngredientItem` → `insertBarcodeFoodIntoDiary`; keep barcode metadata (`barcode`, `barcodeSource`, `detectionMethod: 'barcode'`) and rely on ingredient cards for totals.
- Editing barcode entries must open the ingredient-card editor (triggered by `isBarcodeEntry` in `editFood`); do not strip the barcode markers or fall back to the manual text editor.
- If you must touch this area, first explain the exact change in plain language and get approval; then re-test live scanning on iOS PWA.

---

## 12. Diet Preferences, Warnings, and Macro Targets (Dec 2025 – Locked)

**Protected files:**
- `app/onboarding/page.tsx`
- `app/api/user-data/route.ts`
- `app/api/analyze-food/route.ts`
- `app/food/page.tsx`
- `lib/diets.ts`
- `lib/daily-targets.ts`

**Guard rails:**
- Diet selection is optional inside Health Setup and must not add extra numbered steps.
- Users can select multiple diets; preferences are stored via the special `__DIET_PREFERENCE__` record.
- Diet warnings must not trigger extra AI calls by default and must not cost extra credits by default.
- Diet warnings must show for meals added by analysis, favorites, and copy/duplicate.
- Diet-based macro targets must remain consistent with selected diets; when multiple diets are selected, apply the strictest carb cap and the highest protein floor.

---

## 13. Pre-Launch Audit Fixes (Locked)

**Primary reference:** `AUDIT.md`

Anything marked ✅ in the audit is **locked**. Do not change, loosen, or bypass these protections unless the user explicitly approves it in writing.

### Critical fixes that must stay locked
- Direct email-only sign-in is disabled. Do not reintroduce login paths that do not require verified credentials.
- Admin access requires server-side checks. Do not reintroduce browser-only passwords or shared admin keys.
- Health files are private. Do not reintroduce public file links or direct public access.
- Debug routes must never expose AI keys or secrets. Keep these locked down or removed.
- All AI features must charge credits before returning results (or use the approved free-use counters). Do not return results before charging.

### High priority fixes that must stay locked
- Paid access is granted only when payment is confirmed. Do not keep premium access active after failed or overdue payments.
- Refunds/chargebacks must revoke credits and access. Do not leave paid credits active after a refund.
- Credit charges must be atomic. Do not allow concurrent requests to overspend credits.
- Scheduler/cron routes must require authentication (secret or signature). Do not allow public access.
- Credit receipts must be tied to the buyer. Do not allow a receipt link to be reused by another account.
- Analytics data must require authentication. Do not allow public read/write access.

---

## 14. Notifications Inbox + Reminder Opens (Locked)

**This area is fragile and business‑critical. Do not change it without the owner’s written approval.**

**Protected files:**
- `lib/notification-inbox.ts`
- `app/notifications/inbox/page.tsx`
- `app/api/notifications/inbox/route.ts`
- `app/api/notifications/pending-open/route.ts`
- `app/pwa-entry/page.tsx`
- `app/api/push/dispatch/route.ts`
- `app/api/push/scheduler/route.ts`
- `app/api/mood/dispatch/route.ts`
- `app/api/mood/push-scheduler/route.ts`

**Required behavior (must not change):**
1) Tapping a reminder must open the reminder page (check‑in or mood) even if the app was last left on another page.  
2) Reminders must always appear in the Notification inbox.  
3) Normal app opens must still go to the last page the user visited.

**If changes are requested:**
1) Explain the change in plain language first.  
2) Get explicit written approval.  
3) Re‑test reminder tap behavior and inbox logging on iPhone PWA before shipping.

### Medium and low priority fixes that must stay locked
- Session lifetime must not be multi-year, and admin logout/revoke must remain available.
- No fallback default secrets in production. Missing secrets must be flagged, not silently replaced.
- Rate limits must be durable (not in-memory only). Do not remove the shared limiter.
- Paid actions must not be blocked by overly strict credit estimates; keep the safe cap in place.
- Critical error alerts must continue to fire (not just console logs).
- Analytics storage must be durable (not in-memory only).
- Free-credit rules must remain consistent across all AI features.

### Profitability-related fixes that must stay locked
- AI features must never run for free unless explicitly allowed by the free-credit counters.
- Streaming responses must not complete unless charging succeeded.
- Full insights regeneration pricing must not be lowered without user approval.

If you touch any area related to these fixes, you must:
1) Explain the change in plain English to the user,  
2) Get explicit approval, and  
3) Re-test the affected flows before deployment.

## 7. Food Diary Favorites "All" Ordering (Jan 2026 - Locked)

**Goal (non-negotiable):** The most recently added entry must appear at the top
of Favorites -> All, regardless of meal date or time (including adding to past
days after midnight).

**Do not:**
- Sort by `localDate`, `time`, or meal category time.
- Rebuild the Favorites -> All list from cached/snapshot data that can override
  the latest ordering.
- Remove or ignore the "added order" stamp.

**Must keep (source of truth):**
- `app/food/page.tsx` uses an added order stamp (`__addedOrder`) for each entry.
- The list sort always prefers `__addedOrder` over any date/time fields.
- `__addedOrder` is saved on the entry and copied into `nutrition`/`total` so it
  survives merges and rehydration.

**If this breaks again, fix checklist (only in `app/food/page.tsx`):**
1) Ensure every entry creation path sets `addedOrder = Date.now()` and passes it
   into `ensureEntryLoggedAt(...)`.
2) Confirm `mapLogsToEntries(...)` reads `nutrients.__addedOrder` (if present)
   and assigns `entry.__addedOrder`.
3) Confirm `resolveEntryCreatedAtMs(...)` uses `__addedOrder` first.
4) Confirm `ensureEntryLoggedAt(...)` writes `__addedOrder` onto the entry and
   into `nutrition`/`total`.

## 7.1 Credits Bar Reload Jitter (Jan 2026 - Locked)

**Goal (non-negotiable):** The Credits Remaining bar must **not** reload and
shift the Food Diary screen when you leave and return. It should appear
instantly and update quietly in the background.

**Do not:**
- Clear the saved credits display on every return to the page.
- Render the meter only after a fresh network call.

**Must keep (source of truth):**
- The credits bar reads a stored value first (from the same session) and shows
  it immediately.
- The network call runs after, then updates the bar without a layout jump.

**If this breaks again, fix checklist:**
1) Restore the "show stored value first" behavior for the credits bar.
2) Keep the background refresh, but do **not** block initial render on it.

## 8. Rules for Future Modifications

Before changing anything in the protected areas above, an agent **must**:

1. Read this `GUARD_RAILS.md` file in full.  
2. Summarise to the user (in simple, non‑technical language) exactly what they intend to change.  
3. Ask for and receive explicit written approval from the user.  
4. After making changes, re‑test:
   - New user (first sign‑up, no data)  
   - Partially completed Health Setup  
   - Fully completed Health Setup  
   - “I’ll do it later” behaviour  
   - 5‑minute reminder (“Complete Health Setup” and “Don’t ask me again”)  
   - Insights gating (locked vs unlocked)

If there is *any* doubt, the agent should **not** touch these flows and must ask the user
for guidance first.
