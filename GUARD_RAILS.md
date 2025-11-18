# 🛡️ Helfi Guard Rails (Protected Flows)

This file is the **single source of truth** for sections of the app that are considered
stable and must **not be changed** without:

1. Explaining the proposed change to the user in simple, non‑technical language, and  
2. Getting explicit written approval from the user.

Any agent working on this project **must read this file first** before touching the
protected areas listed below.

---

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

### 3.4 Testing Requirements

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
   - Timezone handling must be correct
   - Date filtering must account for user's timezone

---

## 4. Rules for Future Modifications

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


