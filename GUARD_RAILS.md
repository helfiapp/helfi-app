# 🛡️ Helfi Guard Rails (Protected Flows)

## Food photo model scope (8 October 2026)

- Generic photo-library lookup must materialize the indexed foundation/SR-legacy subset before matching and sorting food names; a source WHERE filter alone can still walk the huge branded name index and outlast the hosting request. Keep typed words as bound SQL parameters, use all query words, retain compatible-source gates and nullable recorded nutrients. Ordinary search UI queries stay unchanged.
- Every meal-photo item sanitizer, including the final response pass after database enrichment, must preserve unavailable fibre/sugar as null and genuine zero as zero. Final meal totals remain unknown when a component is unreported. A compatible supplier with an unreported nutrient must not become a claimed zero merely through response cleanup; exercise the actual sanitizer and totals after calibration in `check:food-provenance`.
- Photo database matches must retain the main ingredient identity after preparation/category metadata; a word buried in another food is not a match. Prefer reordered exact food words over partial descriptions, keep legitimate USDA fish/nut category prefixes, and reject processed/composite categories not named in a plain ingredient. A close meal calorie total does not certify ingredient/source correctness.
- For plain photo ingredients, check curated CustomFoodItem records before the imported foundation/SR-legacy libraries. Restrict imported plain-food queries by indexed generic sources; never scan the large branded archive for a generic meal ingredient. Keep provider cache options consistent and never log credential-bearing URLs, raw provider errors or upstream error bodies.
- Meal photos must search the saved Helfi food library first, then use compatible USDA/FatSecret fallback records. Prefer sourced nutrients over model values, scale once to the estimated gram portion, retain unknown fibre/sugar, and reject babyfood/cereal records for plain ingredients. A whole-food count is not a whole-wheat/milk identity; preserve those meaningful qualifiers. The actual lookup and calibration fixtures must verify source order, wrong-match fallback and no external call on a saved hit. Result rendering must use the explicit-count helper without a second weight-to-piece fallback.
- Owner approved GPT-6.1 Sol for meal photo analysis after the repeated three-model comparison. Text food entry, packaged food/label scans, alternatives without images, and other AI features retain their existing model.
- Route all meal-photo image follow-ups through `prepareFoodPhotoCompletion`; the metered wrapper may retain 6.1 only for the `food:photo-analysis` feature. Use low reasoning and enough completion allowance for all ingredients and six nutrient cards. Preserve any primary wallet-capped allowance.
- Keep normal consent, wallet checks, and the existing 10-credit food-photo charge. Do not replace this narrow routing change with a global model override.
- Meal-photo database checks may run together at concurrency4; preserve all eligible lookups, original ingredient order, compatible-source/portion rules, unknown values and item limit. Serial and parallel outcomes must match in `check:food-provenance`. Other food modes retain serial checks.
- Keep the6.1primary meal prompt concise through `buildFoodPhotoPrompt`, retaining all visible foods, full discrete counts, preparation identity, estimated portions, unknown/zero nutrients, label precedence, user hints/feedback and matching Components/JSON/totals. Other prompts retain their existing behavior.
- Web photo result filters must match whole summary words; radish/radishes are foods, not a dish summary. Serving metadata may assign a piece count only when the label explicitly states one (including plurals); estimated75g/60g sliced vegetables must retain gram portions, never75/60pieces. Preserve every returned ingredient and summed six-card totals; exercise the actual web helpers with the recorded1093kcal bowl in `check:food-photo-model`.
- Required offline regression: `npm run check:food-photo-model`. The benchmark is a comparison of two weighed references and seven unweighed photos, not a guarantee of accuracy or a 20-second maximum.

This file is the **single source of truth** for sections of the app that are considered
stable and must **not be changed** without:

1. Explaining the proposed change to the user in simple, non‑technical language, and  
2. Getting explicit written approval from the user.

Any agent working on this project **must read this file first** before touching the
protected areas listed below.

---

## Full Page Lock (Mar 7, 2026)

The current live web app and current native app are now baseline-locked.

Locked now:
- all web route files in `app/**` that are `page`, `layout`, or `loading`
- all shared web UI files in `components/**`
- all native UI files in `native/src/**`

What happens now:
- web build/deploy fails if any locked file changed without explicit approval
- native start/build commands fail if any locked native UI file changed without explicit approval

Commands:
- web + native lock check: `npm run check:page-locks`
- native-only lock check: `npm --prefix native run check:page-locks`
- refresh lock snapshot after owner-approved changes: `npm run write:page-locks`

Approval rule:
- only unlock the exact file(s) the owner asked to change
- use `ALLOW_LOCKED_FILES=file1,file2`
- after the approved change is finished and verified, refresh the lock snapshot

---

## Web Profile Icon Lock (Jun 11, 2026)

- Every logged-in web app page must show the profile icon/menu in the top-right area.
- This includes custom full-page tools such as `app/chat/page.tsx` / `components/VoiceChat.tsx`.
- Do not remove, hide, replace, or redesign the profile icon/menu unless the owner explicitly approves that exact change in writing.
- If a page uses a custom header instead of `components/PageHeader.tsx`, that custom header must still include the same profile access.

---

## Native iOS App Parity Rule (Jun 9, 2026)

The iOS app must be built as a real native app experience.

Do not ship iOS features by simply showing web app links, web-only cards, or web-specific feature blocks inside the iOS app.

Rules:
- The iOS app may share the same data, account, recommendations, results, and backend behaviour as the web app.
- The iOS app UI itself must be built in the native app code, using native screens/components.
- When a feature exists on both web and iOS, the behaviour should stay in sync, but the iOS presentation must still be native.
- If a temporary web view is used during development, it must not be treated as the finished iOS implementation unless the owner explicitly approves that exception.
- Future agents must not describe a feature as complete on iOS unless it has been checked in the native app UI.

---

## Food Diary Lock List (Quick View)

Use this as the fast “no-touch without approval” checklist for Food Diary.

- `3.5.1` Favorites + Diary Rename Sync (Locked)
- `3.5.2` Water Entry Edit from Food Diary (Locked)
- `3.5.3` Favorites Recency Order (Locked)
- `3.6` Food Search Consistency (Locked)
- `3.7` Food Diary Manual Refresh Only (Locked)
- `3.7` Food Diary Deletes & Snapshot Sync (Locked)
- `3.7.2` Food Diary Restore & Favorites Recovery (Locked)
- `3.4.3` Desktop Energy/Macro Summary Continuity (Severe Lock)
- `3.10` Discrete Produce Counts & Weight Seeding (Locked)
- `3.13` Build a Meal Portion Scaling (Locked)
- `3.14` Food Diary Edit Calorie Consistency & Macro Validation (Locked)
- `3.15` Recipe Import + Build Meal Reopen UX (Strict Lock)
- `7` Food Diary Favorites “All” Ordering (Locked)
- `7.5` Favorites -> Diary Sync (Locked)
- `7.6.1` Delayed Drink -> Food Flip Lock (Strict Lock)
- `7.6.2` Favorites “Change Portion” One-Off Lock (Strict Lock)
- `7.6.3` Water Favorites Drink Sweetener Carry-Through (Strict Lock)
- `7.6.4` Water/Favorites Add Must Not Wipe Existing Meal Rows (Strict Lock)
- `7.7` Ask AI -> Build Meal End-to-End Lock (Strict Lock)

If any of the above is touched, agent must read that full section first.

---

## 0. Update Insights / Add More flow (Jan 2026 – Locked)
- Health Setup must let users make multiple edits across pages, then ask **once** to “Update Insights” when they try to leave Health Setup (including Dashboard or another page). Do NOT reintroduce “prompt on every Next/Back”.
- The navigation guard must still protect leaving Health Setup when changes exist. Do NOT remove or loosen this guard.
- Warm + durable caching keeps onboarding fields (including birthdate) loaded immediately; do not strip this cache.
- Leave the current per-step targeted update buttons as-is; do not change when the popup appears or how it blocks navigation.
- Auto-update on exit must **re-arm** after new edits. If a user makes more changes later in the same session, background update must still run when they leave.
- Background insights refresh must also trigger after a successful autosave (debounced) so users see the “Updating insights…” toast even if they stay on the page. Do not remove this fallback.
- Mar 21, 2026 safety rule: server-hydrated supplements/medications data must **not** be treated as a fresh edit. If hydration writes local step state, the next partial-save must be skipped or it can re-trigger paid Insights refreshes in a loop.
- Mar 21, 2026 safety rule: targeted Insights refresh must always keep a server-side cooldown plus AI spend stop. Do not remove those brakes unless the owner explicitly approves a replacement and it is tested with live logs first.
- Mar 21, 2026 safety rule: paid Insights refresh routes must refuse the same unchanged saved server state. If the user has not actually changed the saved data, do not let `/api/insights/regenerate-targeted` or `/api/insights/regenerate` run again or charge again.
- Mar 21, 2026 safety rule: keep the server-side Insights same-state guard separated by refresh intent. Quick cache warming, section auto-upgrades, forced section rebuilds, targeted paid refreshes, and full paid refreshes must not all share the exact same guard key, or one lightweight warm-up can block a real paid refresh by mistake.
- Pending request for the next agent (do not implement without explicit user approval): force per-step insights regeneration to always call the model and charge tokens (no cache reuse). Only the edited step’s change type should be regenerated; do NOT switch to full “regen all sections,” and keep the current guards/prompt behaviour intact.

Restore steps if background updates stop after the first exit:
1. In `app/onboarding/page.tsx`, make sure any new edit calls a helper that:
   - sets `hasGlobalUnsavedChanges` to true, and
   - resets `exitUpdateTriggeredRef.current = false`
2. Do NOT leave `exitUpdateTriggeredRef` latched after a prior exit, or future edits will never trigger background updates.

## 0.1 Practitioner Portal + Navigation Lock (Feb 2026 – Strict Lock)
- File lock (web): `app/practitioner/page.tsx` must keep:
  - `← Back` action
  - `Go to dashboard` action
  - back behavior: `window.history.back()` + fallback to `/list-your-practice/start`
- Delete-account panel must remain gated to existing listings only (`dashboard?.listing?.id` guard).
- File lock (web layout): `components/LayoutWrapper.tsx` must NOT force practitioner accounts back to `/practitioner` from normal app pages.
- Automated lock check: `npm run check:practitioner-web-lock` (also runs in `prebuild`).
- If this check fails, do not deploy until fixed.

Native parity lock for practitioner flow:
- `native/src/screens/ListYourPracticeStartScreen.tsx` must keep practitioner account routing:
  - signup path uses `accountType: 'practitioner'`
  - login path uses `accountType: 'practitioner'`
- `native/src/screens/MoreScreen.tsx` and `native/src/screens/DashboardScreen.tsx` must not reintroduce `Sleep Coach`.

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

- Health Setup changes must save immediately as the user edits each field (no exit‑only saves), and there is still no manual save button (including the “Health situations” step).
- If a user previously tapped “Skip for now,” typing into any Health situations field must **clear the skip** and keep auto‑save active.
- Insights generation must include Health situations notes (e.g., DHT sensitivity) and treat them as constraints when generating supplement guidance.

### 2.6 Goal intensity selection + daily allowance sync (Jan 2026 – Locked)

**Protected file:** `app/onboarding/page.tsx`

Problem this prevents:
- When a user taps **Mild / Standard / Aggressive**, the choice must stick on the first click, and daily allowance must update immediately.  
- The choice must not “bounce back” when the page reloads or when the app refreshes data from the server.

Guard rail:
- Keep the local **touched** refs that block server hydration from overwriting the user’s first click:
  - `goalChoiceTouchedRef`
  - `goalIntensityTouchedRef`
- `loadUserData` must preserve local `goalChoice` and `goalIntensity` when those refs are marked.
- `persistForm` must mark those refs when a local goal choice or intensity is saved.

Restore steps if broken:
1. Re‑add the two touched refs in `app/onboarding/page.tsx`.
2. When saving goal choice/intensity, set those refs to `true`.
3. In `loadUserData`, keep local `goalChoice`/`goalIntensity` if the refs are `true`.

Fix commits (do not remove): `36a4ae03`, `19c75dc6`, `4fa85060`, `9cfcc278`  
Last stable deployment: `9cfcc278` (2026-01-24)

---

### 2.6.2 Birthdate picker + save lock (Jan 2026 – Locked)

**Protected file:** `app/onboarding/page.tsx`

Problem this prevents:
- Birthdate changes must stick on the first click (no 2–3 click “bounce”).  
- The background refresh must not overwrite a user’s recent birthdate choice.  
- The birthdate dropdown must stay short and scrollable (not a full‑page list).

Guard rail:
- Keep the custom **Day / Month / Year** dropdowns (button + list), with a short scroll area:
  - `max-h-56` + `overflow-y-auto`
  - Do **not** revert to native `<select>` or `<input type="date">`.
- Keep `birthdateTouchedRef` and do **not** let server hydration overwrite when it’s `true`.
- Keep `saveBirthdateNow`, `buildValidBirthdate`, and the effect that syncs the parts → birthdate.
- When a value is picked, it must:
  - set `birthYear` / `birthMonth` / `birthDay`
  - build a valid date
  - call `saveBirthdateNow`
- Close the dropdown menus on outside click so they don’t get stuck open.

Restore steps if broken:
1. Re‑add the custom dropdowns (buttons + list) and remove native date inputs.  
2. Ensure each selection saves immediately using:
   - `buildValidBirthdate(...)`
   - `saveBirthdateNow(...)`
3. Keep `birthdateTouchedRef` and block server re‑hydration when it’s set.  
4. Keep the outside‑click handler that closes the menus.  

Last stable deployment: `348f9377` (2026-01-25)

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

## 3. Water Intake daily summary load race (Jan 2026 – Locked)

**Protected file:** `app/food/water/page.tsx`

Issue this prevents:
- On first open, the Daily Hydration Summary showed 0 ml because an older fetch finished last and overwrote the correct day.

Guard rail:
- Do **not** remove the requestId guard in `loadEntries` or the `entriesRequestIdRef` that tracks the latest request.
- Do **not** allow earlier fetches to call `setEntries`, `setLoadError`, or `setLoading` after a newer request started.

Restore steps if broken:
1. Re-add `entriesRequestIdRef = useRef(0)` near the top of the component.
2. In `loadEntries`, increment and capture `requestId` at the start.
3. Before any state updates in `loadEntries`, check `requestId === entriesRequestIdRef.current`.
4. Only clear `loading` when the requestId still matches.

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

---

## 4. Ingredient search – USDA data source (Jan 2026 – Locked)

**Scope:** All ingredient search surfaces (Build a Meal, Add Ingredient page, Food Diary add-ingredient modal).

- Single-food searches **must use the local USDA library in Neon Postgres** (`foodLibraryItem`) and **must not call the external USDA API** during normal use.
- The local query must include **all** USDA sources: `usda_foundation`, `usda_sr_legacy`, and `usda_branded`.
- SR Legacy is the “regular foods” list. If it is missing, normal foods (like artichoke) will not show up on short searches.
- Server code: `app/api/food-data/route.ts` uses `searchLocalFoods` for single foods and fallbacks (singular/raw/cooked) against the local library. Do not remove or bypass this.
- Import script: `scripts/import-usda-foods.ts` loads USDA zips from `data/food-import/` into `foodLibraryItem`. Keep this as the source of truth.
- Search safety rule: ignore 1‑letter tokens so “art” does not match “Bartlett” via the single letter “t”.
- Multi‑word searches must match by words (order does not matter). Do not require the full phrase to appear exactly, or full‑word searches will return nothing.
- Speed rule: return prefix matches fast; only use slow “contains” fallback when prefix returns nothing and the query is 4+ letters.
- Search speed booster: keep the `pg_trgm` indexes on `FoodLibraryItem.name` and `FoodLibraryItem.brand` (they make fast typing results possible).
- Packaged brand suggestions must only use brand‑like tokens; ignore generic food words (e.g., burger, cheese, nuggets). If there is no brand token in the query, do not show brand suggestions.
- Packaged searches: use OpenFoodFacts + FatSecret unless the local USDA branded library already has matches. Single foods remain USDA local only.
- Packaged searches: if local USDA branded matches are fewer than 5, add OpenFoodFacts + FatSecret results to fill the list. Also normalize "cheese burger" to "cheeseburger" when external sources return nothing.
- Packaged fast‑food/restaurant searches must skip USDA entirely and only use OpenFoodFacts + FatSecret.
- Country fallback guard (Feb 2026): packaged custom/fast‑food results must not go empty just because the user country has no exact row. If country-specific custom matches are empty for a query, fall back to all-country custom rows (still keep DB-first ordering).
- Never add an ingredient without calories, protein, carbs, and fat. If the user picks a specific result that is missing macros, do **not** swap it for a different food; block the add and show a clear message so they can choose another result.

**Restore steps if broken:**
1) Confirm the production database is the **populated USDA database** (the one with ~1.8M branded rows). If the DB is empty, searches will fail.  
2) Make sure all three USDA zip files exist in `data/food-import/`:  
   - `FoodData_Central_foundation_food_csv_*.zip`  
   - `FoodData_Central_sr_legacy_food_csv_*.zip`  
   - `FoodData_Central_branded_food_csv_*.zip`  
3) Re-run the import (low‑memory safe):  
   `TS_NODE_TRANSPILE_ONLY=1 TS_NODE_COMPILER_OPTIONS='{"module":"commonjs","moduleResolution":"node"}' npx ts-node scripts/import-usda-foods.ts --all`  
4) Verify counts: `usda_foundation` ~6k, `usda_sr_legacy` ~7k, `usda_branded` ~1.8M.  
5) Verify behavior by searching “art” and “artichoke”. You should see artichokes at the top, not pears.  
6) Do not remove the “ignore 1‑letter tokens” rule in search matching; it prevents false matches like “Bartlett”.

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

### 2.6 Health Setup data source (Jan 2026 – Locked)

- When reading Health Setup from `HealthGoal` records, always use the **latest** record per name.
- Always order `healthGoals` by `updatedAt` descending (or equivalent) before reading
  `__PRIMARY_GOAL__`, `__HEALTH_SETUP_META__`, and other hidden records.
- Do not rely on unsorted `healthGoals` arrays because duplicates can exist after
  concurrent saves, which causes cross‑device mismatches.

This reminder is meant to be a **gentle nudge**, not a gate. Agents must not convert
it into a hard block or significantly change the timing/behaviour without consulting
the user.

---

### 2.6.1 Health Setup Desktop Sidebar (Dec 2025 – Locked)

- Health Setup (`/onboarding`) must show the standard desktop left menu so users can move around the app like other pages.
- When auto‑update‑on‑exit is enabled, the left menu must still work immediately; the save/regeneration should run in the background as the user leaves.
- If auto‑update‑on‑exit is disabled, leaving via the left menu must trigger the “Update Insights / Add more” prompt when there are unsaved changes.
- Do NOT allow silent navigation away from Health Setup when auto‑update‑on‑exit is disabled.

---

### 2.7 Health Setup Live Sync (Jan 2026 – Locked)

This is the **current working fix** for cross‑device sync on Health Setup (page 2+).
If this breaks again, restore these rules exactly.

**Goal:** When one device changes Health Setup, the other device updates **without manual refresh**, but **only** while the Health Setup page is open (no app‑wide polling).

**Required behavior (do not change):**
- Only poll while `/onboarding` is open and visible.  
- Poll by reloading **full Health Setup data** (`/api/user-data?scope=health-setup`) every ~12 seconds.  
- Do **not** run any Health Setup polling outside the onboarding page (no global polling).  
- Do **not** overwrite a user’s fresh edit while they are actively editing.

**Source of truth (must stay exactly as-is):**
- `app/onboarding/page.tsx`
  - Uses `HEALTH_SETUP_SYNC_POLL_MS = 12 * 1000`.
  - Uses `HEALTH_SETUP_SYNC_EDIT_GRACE_MS = 20 * 1000` to avoid overwriting local edits.
  - `checkForHealthSetupUpdates()` **always calls** `loadUserDataRef.current({ preserveUnsaved: true })` on each poll.
  - The poll is attached to `setInterval`, `visibilitychange`, and `focus`, and it only runs when the page is visible.
  - `persistForm(...)` stamps `healthSetupUpdatedAt` and sets `lastLocalEditAtRef.current = Date.now()`.
  - **Do not** reintroduce the “meta‑only” poll or any comparison logic that blocks updates.
- `components/providers/UserDataProvider.tsx`
  - **Must NOT** poll health setup in the provider (no background checks elsewhere).
  - Only refresh on focus/visibility for general data.
- `app/api/user-data/route.ts`
  - Must keep single‑record storage for `__PRIMARY_GOAL__`, `__SELECTED_ISSUES__`, and `__HEALTH_SETUP_META__`.
  - Must order `healthGoals` by `updatedAt DESC` when reading.

**Required immediate save (prevents snap‑back):**
- `app/onboarding/page.tsx` → “How intense?” buttons **must** call `POST /api/user-data`
  with `goalChoice + goalIntensity` immediately on click (not just local state).
  This prevents the value snapping back to “standard.”

**Autosave guard (prevents stale spam writes):**
- `app/onboarding/page.tsx` → auto‑save only when `hasUnsavedChanges` is true.
- `lastAutoSaveSnapshotRef` prevents repeat saves of identical payloads.

**How to verify (two devices):**
1. Open Health Setup page 2 on desktop + phone.  
2. Change “Tone up → Mild” on device A.  
3. Keep device B on the same page and wait 12–15 seconds.  
4. **Expected:** device B updates without leaving the page, device A stays on Mild.

**If broken again, restore the above rules in these exact files:**
- `app/onboarding/page.tsx`
- `components/providers/UserDataProvider.tsx`
- `app/api/user-data/route.ts`

**Important (do NOT reset the whole repo):**
- The “last stable commit” is a **reference** only.
- Do **not** `git reset` or roll back the whole codebase to that commit.
- Instead, copy/reapply the specific logic described above, or cherry‑pick only the
  relevant changes from those commits. Leave all other newer work intact.

**Last stable deployment:**
- Commit: `5e2720b2` (poll full health setup while onboarding is open)
- Commit: `aa00b3e1` (prevent sync overwrite during edits)
- Date: 2026‑01‑13

### 2.7.1 Health Goals Write Guard (Feb 2026 – Locked)

**Purpose:** Prevent runaway database writes from Health Setup autosaves.

**Must keep (non‑negotiable):**
- Health goals must only be written when the list actually changes.
- Do **not** delete and recreate all goals on every autosave.
- Server must compare the incoming list with what is already saved and only add/remove what changed.
- Visible health goals must be unique per user (DB index: `healthgoal_user_visible_name_uq`).

**If this breaks again:**
1) Restore change‑only updates in `app/api/user-data/route.ts` (no delete‑all + recreate loop).  
2) Recreate the unique index that blocks duplicates:
   - `healthgoal_user_visible_name_uq` on `HealthGoal(userId, name)` where name does **not** start with `__`.  
3) Run the health‑goal dedupe script to clean existing duplicates.

### 2.7.2 Global Write Safety Switch (Feb 2026 – Locked)

**Purpose:** Stop repeated database writes when data hasn’t changed.

**Must keep (non‑negotiable):**
- The global write guard is attached in `lib/prisma.ts` and blocks repeat saves within a short window.  
- It must stay enabled for all standard Prisma writes.  
- If a save is repeated with the exact same data, it should be skipped.  

**If this breaks again:**
1) Restore `lib/prisma-write-guard.ts` and the `attachWriteGuard(prisma)` call in `lib/prisma.ts`.  
2) Restore `lib/write-guard.ts` (table + hashing + guard logic).  

### 2.7.3 Profile Target Stamp Lock + Audit Trail (Feb 2026 – Locked)

**Purpose:** Stop silent changes to daily calorie target inputs (weight/height/goal intensity/exercise profile).

**Protected file:** `app/api/user-data/route.ts`

**Must keep (non-negotiable):**
- Any save touching profile target fields must include a valid `healthSetupUpdatedAt` stamp.
- If profile target fields are sent **without** a stamp, the server must skip the write and return:
  - `skipped: true`
  - `reason: missing_health_setup_version`
- If a stamped payload is older than server `__HEALTH_SETUP_META__.updatedAt`, the server must skip the write and return:
  - `skipped: true`
  - `reason: stale_health_setup_payload`
- Every blocked or successful profile-target change must be recorded in hidden audit record:
  - `HealthGoal.name = "__PROFILE_TARGET_AUDIT__"`
  - Keep a rolling history (latest entries only).

**Why this is locked:**
- Prevents older tabs/cached forms from silently overwriting calorie-target inputs.
- Gives a timestamped trail of what changed and when, so regressions can be traced quickly.

**Restore checklist if broken:**
1) Re-add stamp checks in `POST /api/user-data` before profile writes.
2) Re-add stale-version guard comparing payload stamp vs `__HEALTH_SETUP_META__`.
3) Re-add `__PROFILE_TARGET_AUDIT__` append logic.
4) Verify: sending old or unstamped profile payload does **not** change user weight/height/goal.

Last stable deployment: `0c205475` (2026-02-15)

### 2.8 Supplement + Medication Photo Retention (Jan 2026 – Locked)

- Photos uploaded for supplements and medications are **temporary**.
- After interaction analysis completes, **delete the photos** from storage and clear image URLs from the database and backups.
- Users can re‑upload new photos later if they need to update the information.

**Last stable deployment:** `75ef4f02` (2026‑01‑27)

---

## 2.9 Supplements + Medications: Brand + Name Scan + Fast Uploads (Jan 2026 – Locked)

**What this protects:**
- The label scan must return **brand + product name** (not “Analyzing…” or “Unknown”).
- Uploads must stay **fast** (client‑side compression + parallel uploads).
- **Same flow** must be used for supplements **and** medications.
- Manual **predictive typing** must be available and must update Health Report the same way.

**Why locked:**
- This flow broke multiple times. If it regresses, users can’t finish Health Setup.

**Source of truth files:**
- `app/onboarding/page.tsx`
- `app/api/analyze-supplement-image/route.ts`
- `app/api/supplement-search/route.ts`
- `app/api/medication-search/route.ts`

### Required behavior (must keep)
1) **Scan name first, then upload**
   - Scan the front image **before** uploading.
   - If the front fails, try the back image.
   - If still missing, stop and show a clear error.
2) **Speed**
   - Compress **only large images** on device (small images stay original).
   - Upload front + back **in parallel**.
3) **Same logic for meds and supplements**
   - Both use the same label scan and compression helpers.
4) **Predictive typing**
   - Typing shows suggestions after 2+ letters.
   - Supplements use **DSLD** API.
   - Medications use **RxNorm**, with **openFDA** fallback.
5) **Manual entry stays usable**
   - Users can switch between **Use photos** and **Type name** at any time.
   - Manual mode must **not** require photo uploads.
   - Manual names are auto‑cleaned (extra spaces removed, proper capitalization).
   - Manual saves still flag for Health Report updates (same as photo flow).

### Restore checklist (copy‑paste)
1) Shared helpers at top of `app/onboarding/page.tsx`:
   - `getDisplayName(...)` filters “unknown/analyzing” placeholders.
   - `isPlaceholderName(...)` detects unreadable names.
   - `compressImageFile(...)` **skips** compression if `file.size <= 900_000`.
   - `analyzeLabelName(...)` calls `/api/analyze-supplement-image`.
2) Supplements add flow:
   - Scan front first, then back if needed.
   - If still placeholder, **block save** and show error.
   - Upload front + back with `Promise.all` when both exist.
3) Medications add flow:
   - Same steps as supplements, same helpers.
4) Scanner prompt in `app/api/analyze-supplement-image/route.ts`:
   - Must request **Brand + Product**.
   - Must return a best‑guess name (only “Unknown Supplement” if unreadable).
5) Credits:
   - Label scan must use free credits so free users can complete setup.
6) Predictive search routes:
   - `/api/supplement-search` must return `{ results: [{ name, source }] }`
   - `/api/medication-search` must return `{ results: [{ name, source }] }`
7) Manual typing UX:
   - Suggestions show as a clickable list under the input.
   - Picking a suggestion fills the input and clears the list.
   - Errors show “Search failed. Please try again.”

**Last stable deployment:** `959189e1` (2026‑01‑28)

**Copy‑Paste Restore Checklist (no guesswork):**
1) Open `app/onboarding/page.tsx`.
2) Confirm these constants exist:
   - `HEALTH_SETUP_SYNC_POLL_MS = 12 * 1000`
   - `HEALTH_SETUP_SYNC_EDIT_GRACE_MS = 20 * 1000`
3) Confirm these refs exist near the top of the onboarding component:
   - `lastLocalEditAtRef`
   - `lastServerHealthSetupUpdatedAtRef`
4) In `persistForm(...)` confirm:
   - `healthSetupUpdatedAt` is stamped for any health setup edit.
   - `lastLocalEditAtRef.current = Date.now()` is set when stamping.
5) In `checkForHealthSetupUpdates(...)` confirm:
   - it returns early when `Date.now() - lastLocalEditAtRef.current < HEALTH_SETUP_SYNC_EDIT_GRACE_MS`
   - it **always** calls `loadUserDataRef.current({ preserveUnsaved: true, timeoutMs: 8000 })`
   - it does **not** block on meta‑only timestamp comparisons
6) Confirm the polling useEffect:
   - uses `setInterval(..., HEALTH_SETUP_SYNC_POLL_MS)`
   - calls on `focus` and `visibilitychange`
   - only runs when `document.visibilityState === 'visible'`
7) In the “How intense?” buttons, confirm it:
   - updates local state **and**
   - immediately POSTs `/api/user-data` with `goalChoice + goalIntensity`
8) Open `components/providers/UserDataProvider.tsx`:
   - confirm there is **no** health setup polling there.
9) Open `app/api/user-data/route.ts`:
   - confirm single‑record storage for `__PRIMARY_GOAL__`, `__SELECTED_ISSUES__`, `__HEALTH_SETUP_META__`
   - confirm `healthGoals` are ordered by `updatedAt DESC` on reads
10) Test:
   - Change “Tone up → Mild” on device A
   - Keep device B on page 2
   - Wait 12–15 seconds
   - Device B updates without leaving the page
- **HARD LOCK (do not touch without explicit owner approval):** The desktop left menu must remain clickable *inside* Health Setup at all times. Any change that interferes with this is forbidden.

**Protected files (extra locked):**
- `components/LayoutWrapper.tsx`
- `app/onboarding/page.tsx`

**Why this is hard‑locked (do not ignore):**
- This area broke recently and blocked all left‑menu clicks on desktop while in Health Setup. It was extremely difficult to restore.

---

## 2.10 Health Goals ↔ Check-in Issues Sync (Feb 2026 – Locked)

**Goal:** Health goals must never be replaced by old check‑in issues.  
Check‑ins must always mirror the current health goals.

**What broke:**  
The Health Goals step was loading the check‑in issue list and auto‑saving it back as goals.  
This overwrote real goals (e.g., Libido/Erection Quality/Bowel Movements) with unrelated items.

**Required behavior (must not change):**
1) The Health Goals screen must never pull goal data from `/api/checkins/issues`.  
2) Saving goals must sync the Check‑in Issues table to match those goals.  
3) If goals change, check‑ins must reflect the new goals automatically.

**Restore steps if it breaks:**
1) In `app/onboarding/page.tsx`, remove any fetch that loads `/api/checkins/issues` into goals.  
2) In `app/api/user-data/route.ts`, ensure saving goals also updates `CheckinIssues`.  
3) Re‑deploy and confirm Health Setup goals stay correct after a refresh.

**Last stable deployment:** `edaf0abf` (2026-02-02)

## 3. Water Intake + Exercise Logging (Jan 2026 – Locked)

**Primary scope:**
- `app/food/water/page.tsx`
- `app/api/hydration-goal/route.ts`
- `lib/hydration-goal.ts`
- `app/api/water-log/route.ts`
- `app/api/water-log/[id]/route.ts`
- `app/food/page.tsx` (exercise panel)
- `app/api/exercise-entries/route.ts`
- `app/api/exercise-entries/[id]/route.ts`

**Last verified deployment (water intake):**
- Deployment ID: `dpl_5neJtCtWrmiEAmsUtfrXceDAsBK8`
- Commit: `2bbf3b88`

### 3.1 Hydration goal rules (must not change without approval)
- **Base goal uses profile only** (weight/height/gender/age/diet/primary goal).  
- **Health Setup exercise frequency is NOT used** in hydration targets.  
- Daily exercise only affects hydration via a **calorie‑based bonus** when exercise is logged.
- Exercise bonus: **1 ml per kcal**, capped at **1500 ml/day**, then rounded to nearest 50 ml.  
- Custom goal overrides recommended goal; show “Custom goal active” when applicable.
- `GET /api/hydration-goal?date=YYYY-MM-DD` returns:
  - `targetMl`, `recommendedMl`, `source`, `exerciseBonusMl`.

### 3.2 Exercise → hydration linkage (must not double‑count)
- **Only logged exercise entries** (manual diary or wearable sync) affect the daily bonus.  
- If **no exercise entries exist for the date**, **no bonus** is applied.  
- Do **not** add wearable bonus on top of manual logs (they share the same entries table).

### 3.3 Water logging UI behaviors
- Users can log unlimited entries per day.
- Custom Entry input must:
  - Clear on focus.
  - Use numeric keypad (`type=number`, `inputMode=decimal`).
  - Use `ml` (lowercase), `L`, `oz` for units.

### 3.4 Exercise log UI consistency (Food diary)
- Manual exercise entries are created via `POST /api/exercise-entries`.
- After **save** or **delete** of manual exercise, the list must **force reload** from the server
  to avoid stale session storage (`loadExerciseEntriesForDate(..., { force: true })`).
- Deleting must update the list even if the server responds with “Not found” for stale entries.

### 3.4.1 Exercise calories must increase remaining calories (Feb 2026 - Locked)
**Goal (non-negotiable):** Burned exercise calories must always add back to daily calorie room.

**Must keep (source of truth):**
- Remaining calories must use this formula:  
  `remaining = max(0, daily_target + exercise_burned - food_consumed)`
- The exercise calories used for the summary must come from the **exercise entries list** first,
  with API/snapshot calories only as fallback.
- If an exercise row is visible, its calories must be reflected in the summary numbers.
- The “Daily allowance” line in the energy summary must show the **base target** (for example 2284),
  and show exercise as a separate **+exercise added** note.
- Build-time lock is active in `scripts/protect-regions.js` for:
  - `PROTECTED: ENERGY_SUMMARY_CALC` in `app/food/page.tsx`
  - `PROTECTED: ENERGY_ALLOWANCE_TEXT` in `app/food/page.tsx`
  - `PROTECTED: HEALTH_SETUP_STAMP_GUARD` in `app/api/user-data/route.ts`
- If anyone changes these blocks, deploy fails unless they intentionally set:
  - `ALLOW_ENERGY_SUMMARY_CALC_EDIT=true`
  - `ALLOW_ENERGY_ALLOWANCE_TEXT_EDIT=true`
  - `ALLOW_HEALTH_SETUP_STAMP_GUARD_EDIT=true`

**Why this lock exists:**
- This regressed again and made Food Diary remaining calories look wrong after manual exercise logs.

**Restore steps if it breaks again:**
1. File: `app/food/page.tsx`.
2. Ensure `resolveExerciseCaloriesKcal(...)` is used for exercise summary values (not raw cached value alone).
3. Ensure energy summary remaining uses `daily target + exercise calories` before subtracting consumed food.
4. Ensure the “Daily allowance” text shows base target only, with exercise shown separately as `+exercise added`.
5. Ensure save/sync paths normalize exercise calories with entry fallback before writing session snapshot.
6. Verify by adding one manual exercise entry and confirming remaining calories increase immediately while base allowance text stays unchanged.

### 3.5 Favorite label must stay consistent in edit view (Food diary)
- When a user logs a **favorite** item (e.g., “Hot chocolate”), the **edit view must show the favorite label**,
  not a raw ingredient name (e.g., “Drinking Chocolate”).
- This regression happens when the edit UI renders **raw analyzed item names** or **AI description text** instead
  of the favorite/override label.

**Restore steps if it breaks again:**
1. File: `app/food/page.tsx`.
2. In the **Food Description** block, ensure the description text uses the favorite override when
   `editingEntry` has exactly **one** analyzed item:
   - Use `applyFoodNameOverride(editingEntry?.description || editingEntry?.label || '', editingEntry)`
   - Short‑circuit `foodDescriptionText` to this value before the AI description fallback.
3. In the **Detected Foods / ingredient card title** section, ensure the displayed name uses the same override
   for single‑item entries:
   - Create `entryLabelOverride` when `editingEntry && analyzedItems.length === 1`
   - Use `entryLabelOverride` in the title in place of `cleanBaseName`
4. Confirm the “Food Description” line and the ingredient title both show the favorite label.
5. If “Drinking Chocolate” reappears, search for `cleanBaseName` and `foodDescriptionText`
   and re‑apply the override logic described above.

### 3.5 Water Intake Enhancements (Jan 2026 – Locked)
- Quick Add drink row must hide the horizontal scrollbar/grey line while still allowing swipe.
- Non‑water drinks must open the Drink Details modal:
  - Choices: **Sugar‑free**, **Sugar**, or **Honey**.
  - Honey macros use USDA basis: 1 tbsp = **21g**, **64 kcal**, **17.3g carbs**, **17.2g sugar** (1 tsp = 7g).
  - Drink entries must store sweetener metadata (`__sweetenerType`, `__sweetenerAmount`, `__sweetenerUnit`) so it is editable later.
  - Food editor for drink entries must expose **Sweetener** (None/Sugar/Honey) and persist those fields on save.
  - Sugar amount supports `g`, `tsp`, `tbsp`, clears on focus, uses numeric keypad, and must not overflow on iPhone.
  - “Add with sugar” logs **both** a water entry (label includes sugar amount) and a Food Diary entry with calories/carbs/sugar derived from sugar grams.
  - Food Diary must show **one single drink entry** (product name + drink icon + amount). The linked water log **stays only in Water Intake** and is **hidden from Food Diary lists**.
  - “Search food / Scan barcode / Add by photo / Add from favorites” should log the drink and then open the corresponding Food Diary flow.
- Drink icons must show on the Food Diary entries using the matching icon from `public/mobile-assets/MOBILE ICONS/`.
- Icon lookup must normalize labels (remove sugar notes like “with sugar”, “sugar‑free”, and parenthetical sugar amounts) so sweetened drinks still show the correct drink icon.
- When a drink is added via Sugar‑free + search/barcode/photo/favorites, the Food Diary entry must **auto‑scale macros** to the drink amount (e.g., 100 ml) instead of the product’s default serving.
- Sugar‑free drinks logged directly from **Water Intake** must also create a **Food Diary drink entry** (0 kcal),
  linked by `__waterLogId` so the water log stays visible **only** in Water Intake.
- Pending drink context (`pendingDrinkOverrideRef`, `pendingDrinkTypeRef`, `pendingDrinkWaterLogIdRef`) must be cleared after each add flow uses/checks it (analysis save, barcode add, meal add, favorite add). Do not leave sticky drink context active for the next add.
- In Add from Favorites, entry-source preference for drink flow is allowed only when there is active drink context **and** the selected entry is truly a drink. Non-drink adds (for example chicken favorites) must keep their normal favorite source so labels/icons do not regress.
- Old corrupted rows must self-heal on load: if a non-drink entry contains leaked drink metadata (`__drinkType` etc.), strip drink metadata so food rows do not render drink icons.
- Do not strip drink metadata when `__waterLogId` is present. That ID is the explicit drink↔water link and is required to hide the linked water row from Food Diary.
- For linked favorites, if a diary row still has a long raw source title (for example USDA-style long chicken text), prefer the short saved favorite label in row display unless the entry was manually renamed.
- Icon guard: when an entry is linked to a **non-drink favorite label**, do not show a drink icon even if stale drink metadata is present.
- Add-from-favorites must use one shared tap guard (single action key) before routing to insert paths, so one tap cannot create a duplicate entry through mixed insert flows.
- Missing-linked-favorite recovery lock: if recent diary rows still contain `__favoriteId` but the favorites list is missing those IDs, rebuild those favorites from the linked diary rows (label/items/nutrition) and persist them so saved meals do not disappear.
- Favorites stale-write lock: when saving favorites, do not allow a partial/stale payload to drop favorite IDs that are still linked from recent diary rows.
- Rename stickiness lock: if a user renames a favorite/entry (example `Peach`), keep that title as the entry title unless the user explicitly types a different title. Do not silently fall back to the single-item database ingredient name on save.
- Favorite-label lock: if an entry is linked to a favorite and was not manually renamed, show the saved favorite label in diary rows whenever it differs from the raw source label (not only long USDA names).
- Water entries must appear under the **category they were logged in**, not default to Other.
- Editing/renaming a drink entry must **preserve** `__drinkType` and `__waterLogId` so the linked water log stays hidden in Food Diary.

Agents must not modify these rules without explicit user approval.

### 3.5.1 Favorites + Diary Rename Sync (Jan 2026 – Locked)
Goal: renaming a food/drink **anywhere** updates **everywhere**.
- Renaming inside a **Food Diary entry** must update:
  - The diary list label
  - Favorites list label
  - “All” list label
- Renaming inside **Favorites** must update:
  - Favorites list label
  - Diary entries linked to that favorite
  - “All” list label

Implementation notes (do not remove):
- Food Diary rename flow is handled in `app/food/page.tsx` → `updateFoodEntry`:
  - Detects a real name change (not just the same text)
  - Resolves linked favorite by `__favoriteId` / `sourceId` / label
  - Updates the favorite label and renames all linked diary entries
- Favorites rename flow is handled in `app/food/page.tsx` → `handleRenameFavorite`:
  - Updates the favorite label
  - Calls `renameEntriesWithFavoriteId(...)` to update diary entries
- Diary row label rendering must prefer the entry's own renamed title/override before favorite fallback labels, so stale favorite text cannot overwrite a freshly edited diary title.
- `updateFoodEntry` must update the edited diary row by robust identity matching (client id / db id / source id / barcode / fallback time+title), not id-only matching.
- Rename helpers must also update the Favorites “All” snapshot cache:
  - `renameEntriesWithFavoriteId(...)` updates `favoritesAllServerEntries` and calls `writeFavoritesAllSnapshot(...)`
  - `renameEntriesWithLabel(...)` does the same for label-based renames
- `renameEntriesWithFavoriteId(...)` must match linked entries not only by `__favoriteId`, but also by source id/barcode/item id/known aliases so older logs still rename globally.
- In `updateFoodEntry`, db-id resolution fallback must include source id/barcode matching before PUT so renamed entries persist after refresh.
- Build-a-meal diary edit (`app/food/build-meal/MealBuilderClient.tsx`) must treat `/api/food-log` PUT failures as real failures (no silent success/redirect).
- Build-a-meal must show a visible **Change time entry** field for diary-edit contexts (`sourceLogId`) and favorites one-off adjust add flow (`fromFavoriteAdjust=1`), and must send `createdAt` so the chosen time persists.
- Food edit time UI should use the app-style roller picker (`components/food/RollerTimePicker.tsx`) in both `app/food/page.tsx` and `app/food/build-meal/MealBuilderClient.tsx`; do not revert to dated browser-only time inputs.
- Food edit time picker must stay **compact**: show a normal time field first, then open a small popover roller only when tapped. Do not render a large always-open wheel block in the main form layout.
- Food edit time picker wheel must use true touch scroll + snap behavior (birthday-style rolling) for hour/minute on mobile; do not replace it with click-only fake wheel lists.
- On desktop, the wheel must also have clear non-touch controls (visible up/down buttons and mouse wheel/keyboard step support) so values can be changed without drag gestures.
- Build-a-meal return override (`foodDiary:entryOverride`) must carry the edited `description` and Food Diary must apply it (with short retries) so renamed titles show immediately after return.
- Helper functions that must stay wired:
  - `resolveFavoriteForEntry`, `updateFavoriteLabelById`, `renameEntriesWithFavoriteId`
  - `saveFoodNameOverride` (keeps aliases for older labels)

Owner policy for this area (non-negotiable):
- This rename area is now treated as stable and locked.
- Agents must not modify rename logic unless owner gives explicit written approval first.
- Do not run rename canary routinely on every deploy.
- Rename canary is optional troubleshooting only, used when owner asks to diagnose rename behavior:
  - `CANARY_AUTH_COOKIE=\"next-auth.session-token=...\" ./scripts/check-rename-guard.sh`
  - or: `CANARY_STORAGE_STATE=\"playwright/.auth/<file>.json\" ./scripts/check-rename-guard.sh`

### 3.5.2 Water entry edit from Food Diary (Jan 2026 – Locked)
- Water entries listed in **Food Diary** must expose **Edit Entry** in the kebab menu (desktop + mobile).
- Editing a water entry must open a lightweight modal (amount + unit) and **PATCH** `/api/water-log/:id`.
- Save must refresh the on‑screen list by updating `waterEntries` state (replace matching `id`, or prepend if missing).
- Native Food Diary Water rows must use the same compact three-dot action button as the other diary rows.
- Never place large visible Edit and Delete buttons directly inside a native Water row.
- The three-dot sheet may expose only the existing Edit Entry, Delete, and Cancel actions; do not change Water save, delete, loading, ordering, calorie, favourites, or rename behaviour while changing this presentation.

### Native list-row action menus (Jul 2026 – Locked)
- Native list entries must not show separate visible **Edit** and **Delete** buttons in the row.
- Put entry-level edit/delete actions behind one compact three-dot button, with a plain action sheet containing the existing actions and Cancel.
- This rule covers Food Diary food, Water and Exercise rows, Health Journal, Daily Check-in history, Water Intake history, Mood Journal history, Health Image Notes, Symptom Notes, Notifications and Support ticket history.
- This does not apply to a dedicated edit form's Delete control, Delete Account confirmation, or a bulk-selection action such as Delete selected.
- Changing the presentation must not change the underlying edit, delete, save, loading, ordering, calorie, favourites or rename behaviour.

**Restore steps if it breaks again:**
1. File: `app/food/page.tsx`.
2. In `renderEntryCard`, ensure `actions` for `isWaterEntry` includes `{ label: 'Edit Entry', onClick: openWaterEdit }`.
3. Confirm `openWaterEdit` resolves the water log id from `food.waterId` or `food.id` (strip `water:` prefix) and seeds amount/unit.
4. Modal must render when `waterEditEntry` is set; Save calls `PATCH /api/water-log/:id` with `amount`, `unit`, `label`, `localDate`, `category`.
5. If menu shows only Delete, search `isWaterEntry` action list and re‑add the Edit Entry flow + modal wiring.

If this breaks again, restore in this order:
1) In `updateFoodEntry`, ensure name changes call:
   - `resolveFavoriteForEntry` → `updateFavoriteLabelById` → `renameEntriesWithFavoriteId`
2) In `handleRenameFavorite`, ensure it calls:
   - `renameEntriesWithFavoriteId`
3) Confirm Favorites, All, and Food Diary labels match after rename.
4) If “All” still shows old names, ensure:
   - `renameEntriesWithFavoriteId` and `renameEntriesWithLabel` both update `favoritesAllServerEntries`
   - `writeFavoritesAllSnapshot(...)` is called after those updates

### 3.5.2 Favorites Modal Scroll Position (Jan 2026 – Locked)
Goal: the **Add from favorites** list must always open at the **top**, so the first items are visible without manual scrolling.

Must keep (source of truth in `app/food/page.tsx`):
- The modal uses a full-height flex layout.
- The list container is the **scrollable element** (`flex-1 overflow-y-auto`) and is wired to `favoritesListRef`.
- A `useEffect` scrolls the list to top when:
  - The modal opens
  - The tab or search changes
  - The Favorites “All” snapshot refreshes

If this breaks again, restore in this order:
1) Ensure the list container remains `flex-1 overflow-y-auto` and has `ref={favoritesListRef}`.
2) Restore the scroll-to-top effect:
   - `favoritesListRef.current?.scrollTo({ top: 0, behavior: 'auto' })`
   - Dependencies must include `showFavoritesPicker`, `favoritesActiveTab`, `favoritesSearch`, and `favoritesAllServerEntries`.
3) Confirm the first favorites appear immediately after opening the modal (no manual scroll).

### 3.5.3 Favorites Recency Order (Feb 2026 – Locked)
Goal: the last favorite/custom meal used in Food Diary must appear at the top of `All`, `Favorites`, and `Custom`.

Hard lock (owner instruction):
- Agents must not edit this ordering + naming block unless the owner explicitly asks for it in the current thread.
- If an agent believes this block must change for another feature, they must stop and ask for written approval first.

Must keep (source of truth in `app/food/page.tsx`):
- Using a favorite/custom meal must stamp that favorite with `lastUsedAt`.
- `insertFavoriteIntoDiary(...)` must call the recency updater before save flow completes.
- Recency must also backfill from historical diary usage (linked favorite id first, then source/barcode/alias fallback) so older entries still order correctly.
- Recency must be based on **usage time only** (`lastUsedAt` / history backfill). Do not use `updatedAt` for ordering.
- In `All`, if a history entry resolves to a saved favorite/custom meal, the row label must use the current saved favorite label (no long old USDA name fallback).
- In `All`, once a row resolves to a saved favorite/custom meal, do **not** run entry-based name override remapping on that favorite label.
- Picker sorting must use `lastUsedAt` first, then fallback to `createdAt`.
- Favorites without a `lastUsedAt` must fallback safely to `createdAt`.

If this breaks again, restore in this order:
1) Ensure `markFavoriteAsRecentlyUsed(...)` writes `lastUsedAt` and persists favorites.
2) Ensure `insertFavoriteIntoDiary(...)` calls `markFavoriteAsRecentlyUsed(...)` using the current timestamp.
3) Ensure favorites recency backfill map is built from history using linked favorite id + fallback matching.
4) Ensure `resolveFavoriteLastUsedAtMs(...)` does **not** use `updatedAt`.
5) Ensure picker `sortList(...)` compares `lastUsedAt` before `createdAt`.
6) Re-test by adding a favorite from each tab (`All`/`Favorites`/`Custom`) and confirm it appears at top on reopen.

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
- `app/insights/page.tsx`
- `app/insights/InsightLandingClient.tsx`
- `app/insights/weekly-report/WeeklyReportClient.tsx`

**Guard rails:**
- Reports are generated **in the background** and should not run on every page visit or whenever the app is opened.
- Health Insights pages and the weekly report UI are **locked**. Do not change without written owner approval.
- The **ready alert is scheduled for 12:00 pm in the user’s time zone**. Do not change this timing without explicit user approval.
- Time zone is resolved in this order: Check‑in settings → Mood reminders → AI tips → fallback UTC. Do not reorder without approval.
- The popup should appear **at most once per day** until the report is viewed or dismissed.
- If the report is locked (no credits), the popup CTA must send users to **Billing**, not to the report page.
- Email + push are sent **only once per report** and are triggered by QStash; do not re‑introduce repeated sends.
- The **PDF export lives on the 7‑day report page** (button uses `/api/export/pdf` with the report date range). Do not re‑introduce the old JSON export on the Account page without user approval.

**Last stable deployment (owner‑approved):**
- Commit `16ed1f02` on 2026‑01‑09 (weekly report data summary + wins/gaps).
  - Baseline for Health Insights pages and weekly report. No changes without written approval.

### 2.7.1 Insights Weekly Report UI Consistency Lock (Feb 25, 2026)

This lock exists because repeated regressions created contradictory states on `/insights`.

**Do not allow contradictory card states:**
- If `Weekly reports are off by default...` is shown, do **not** show `View report` as the primary report action in the same card state.
- If `View report` or `Unlock report` is shown, the card must behave as report-enabled and keep messaging consistent.

**Owner account test path must remain available:**
- For owner test account `info@sonicweb.com.au`, `Create report now` must stay available in report-enabled/report-action states so report generation can be validated quickly.

**State-heal rule:**
- If weekly report state row is missing for a paid active user, the app must recreate report state (enabled + next due date) before rendering final Insights report card state.
- The state-heal rule must still require completed Health Setup using the shared rule: basic profile plus at least one real `HealthGoal` whose name does not start with `__`. Do not count `__SELECTED_ISSUES__`, old hidden/internal records, or `CheckinIssues` as enough to schedule reports.

**Regression reference:**
- Commit `d8155c57` introduced a split-state UI path (`reportsEnabled` warning + `canUseReportActions` action fallback), which can show mixed signals.
- Any future edits in the protected weekly report files must explicitly test and prevent this mismatch.

### 2.7.2 Insights Hard Lock (Feb 26, 2026)

These sections are now build-protected by `scripts/protect-regions.js`.
If any of these are edited, build fails unless an explicit override env var is used:

- `PROTECTED: INSIGHTS_REPORT_STATE_DERIVATION` in `app/insights/InsightLandingClient.tsx`
- `PROTECTED: INSIGHTS_COUNTDOWN_TIMER_LOGIC` in `app/insights/InsightLandingClient.tsx`
- `PROTECTED: INSIGHTS_REPORT_STATUS_AND_COUNTDOWN` in `app/insights/InsightLandingClient.tsx`
- `PROTECTED: INSIGHTS_REPORT_ACTION_ROW` in `app/insights/InsightLandingClient.tsx`
- `PROTECTED: INSIGHTS_WEEKLY_STATE_SELF_HEAL` in `app/insights/page.tsx`
- `PROTECTED: WEEKLY_STATUS_SELF_HEAL` in `app/api/reports/weekly/status/route.ts`
- `PROTECTED: WEEKLY_STATE_INSERT_CASTS` in `lib/weekly-health-report.ts`

Critical note:
- Root cause for missing countdown was fixed in commit `c6cbdcdc` (timestamp cast fix for weekly state insert query).
- Do not remove `::timestamptz` casts in weekly state insert.

### 2.7.3 Weekly Report Email Layout Lock (Mar 17, 2026)

**Protected file:**
- `app/api/reports/weekly/dispatch/route.ts`

**Hard lock:**
- The new weekly report email layout is now protected.
- Do not casually restyle, simplify, or collapse it back into one text block.
- Keep the summary split into clear items/cards so the email stays easy to scan.
- Keep the proper heading, date pill, button, and clean spacing.
- If the owner does not explicitly ask for a weekly report email redesign, do not change this block.

**Build protection:**
- `PROTECTED: WEEKLY_REPORT_EMAIL_LAYOUT` in `app/api/reports/weekly/dispatch/route.ts`
- If an edit is truly approved, use the matching override env var and then update the protected hash in `scripts/protect-regions.js`.

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
- The current normal Helfi web/PWA and native iOS icons come only from the owner-approved, non-transparent 1600x1600 PNG at `/Volumes/G-DRIVE 6T/HELFI/LOGOS/VECTORIZED/FAVICON/IOS NON TRANSPARENT.png` (SHA-256 `2ca273024a7a4ce178604960cde3725b5e86ecc0b5a412bb14d43b9a912a1894`). At the owner's 22 July 2026 correction, the active normal web outputs use the fresh `helfi-ios-nontransparent-v20260722g` filenames. Keep the supplied pixels, white background, leaf shape, and green colour unchanged. Do not use a black background, transparency, effects, an online generator, or the older inset/gradient leaf.

**Guard rails:**
- Resize each required size directly from the approved 1600x1600 PNG with no effects, padding, gradients, colour changes, or redesign, and ensure every final PNG is fully opaque.
- Native iOS packaging must keep `native/plugins/with-transparent-ios-app-icon.js`; despite its historical filename, it copies both the complete legacy PNG icon set and `native/assets/HelfiFlat.icon` after Expo processing so Expo cannot substitute either. The Apple Icon Composer package is the active iOS 26 icon, uses the exact opaque 1024px resize as one full-canvas layer, and must keep specular off, translucency off, shadow at 0%, and blur at 0%. The legacy set remains the fallback for older iOS and must include both 120px (`@2x`) and 180px (`@3x`) Home Screen icons.
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
   - Exception (user‑approved): if the last page was `/food` and the local calendar day has changed since the last visit, the Food Diary should open on **today** by default (no background refresh beyond the normal load).

### 3.4 Food Diary UX Safeguards (Jan 2026 – Locked)
- Energy summary rings must render full, un-clipped numbers after any date switch (especially Today → previous day).
  - The summary should remount on date change to avoid iOS rendering glitches.
  - Do not force extra remount cycles on the same date (for example, nonce-based remounts) because this causes visible flicker.
  - Past-day energy summaries should use the cached per‑date snapshot immediately while the server load runs.
- Opening the **last** category (Other / `uncategorized`) should auto‑scroll to the **last** entry in that category so it’s visible without manual scrolling.
- Do not remove or bypass these UI safeguards without explicit owner approval.

### 3.4.1 SEVERE LOCK - Energy Summary Flash + Same-Day Totals (Jan 2026)
This section was breaking for weeks. Do **not** touch it without explicit owner approval.

**Protected files:**
- `app/food/page.tsx`
- `app/api/food-log/route.ts`

**What broke before:**
- Energy summary flashed "full calories / zero used" when switching days.
- Multiple different days showed the same totals.
- Root cause: entries had wrong `localDate`, and the UI cleared to empty while history loaded.

**Non-negotiable rules (do not change):**
- On date switch, **never** clear the summary to empty if a saved snapshot exists for that day.
- While history is loading, **keep showing** the saved per-date snapshot.
- The server **must not** include entries whose `localDate` exists but does **not** match the requested day.
- Only use `createdAt` as a fallback **when `localDate` is missing**.
- Build guard `scripts/assert-food-log-date-guard.js` must stay in `prebuild` so
  deploy fails if localDate source-of-truth logic is removed.

**Restore steps (exact, no guessing):**
1) **Server date filter** (`app/api/food-log/route.ts`):
   - Keep the broad query (OR window) to detect mismatches.
   - In the filter step:
     - If `localDate` exists and **does not** match the requested day -> **exclude**.
     - If `localDate` is **missing**, then use `createdAt` to decide the day.
2) **Client snapshot usage** (`app/food/page.tsx`):
   - `sourceEntries` must keep `localSnapshotEntriesForSelectedDate` while history loads.
   - Do **not** return `[]` during date switches if a snapshot exists.
3) **Repair wrong dates** (when totals repeat across days):
   - Run: `POST /api/food-log/repair-local-date?tz=<offset>&mode=full`
   - This rewrites `localDate` from the best timestamp so future loads are correct.
4) **Verify:**
   - Compare Jan 10/11 and Jan 17/18/19.
   - Totals must differ across days and no "zero" flash should appear.

**Last stable fix (staging):**
- Commit: `6d7d940b`
- Date: 2026-01-22
- Note: This must be re-verified on live once approved.

### 3.4.2 SEVERE LOCK - Left Menu Clicks Blocked on Food Diary (Jan 2026)
This caused the left menu to stop working on desktop whenever Food Diary was open.

**Protected file:**
- `app/food/page.tsx`

**What broke before:**
- Left menu clicks did nothing on the Food Diary page.
- The click would only fire later (after tapping the date buttons).
- Cause: the page got stuck in a snapshot update loop.

**Non-negotiable rules (do not change):**
- Do not write the per-day snapshot in a way that depends on the snapshot itself.
- Do not keep re-writing the same snapshot while history is still loading.
- If the day is not fully loaded yet, do not overwrite the saved day with empty data.

**Restore steps (exact, no guessing):**
1) In `app/food/page.tsx`, the "Persist a durable snapshot" block must:
   - Only write after the day is loaded.
   - Never keep re-writing from the snapshot itself.
2) Test on desktop:
   - Open Food Diary.
   - Click any left menu item.
   - It must navigate immediately, every time.

**Last stable fix (live):**
- Commit: `22ef0673`
- Date: 2026-01-22

### 3.4.3 SEVERE LOCK - Desktop Energy/Macro Summary Continuity (Feb 2026)
This prevents the desktop Food Diary summary from flashing blank during date changes.

**Protected file:**
- `app/food/page.tsx`

**What broke before:**
- On desktop, energy/macros disappeared for 1–3 seconds during date switch or browser refresh.
- Removing visible loading text exposed a blank summary card (no rings/macros shown).
- Mobile PWA looked stable, but desktop looked broken/unreliable.

**Non-negotiable rules (do not change):**
- Keep the `today-local-snapshot` source branch active whenever same-day snapshot entries exist.
- Keep the summary continuity state path:
  - `lastStableSummaryEntries`
  - `summaryDisplayEntries`
  - `summaryDisplayReady`
- In the daily totals block, keep `const source = summaryDisplayEntries` (not `sourceEntries`).
- Render the summary panel from `summaryDisplayReady`, not only `summaryReady`.
- Do not reintroduce visible desktop “Loading...” text in summary/meal preview.
- Do not allow a blank summary card while a known prior summary exists.

**Restore steps (exact, no guessing):**
1) In `app/food/page.tsx`, source selection for today must keep:
   - `else if (localSnapshotEntriesForSelectedDate.length > 0) branch = 'today-local-snapshot'`
2) Re-add summary continuity state/effect:
   - `lastStableSummaryEntries`
   - effect that updates it only when `summaryReady` is true
   - `summaryDisplayEntries` fallback memo
   - `summaryDisplayReady = summaryReady || summaryDisplayEntries.length > 0`
3) In the daily summary render closure, set:
   - `const source = summaryDisplayEntries`
4) Render summary slides with:
   - `{summaryDisplayReady && (...)}` (not `summaryReady` only)
5) Validate on desktop with exact flow:
   - Browser refresh -> Next -> Next -> Previous -> Previous
   - Summary must never show blank state.

**Recovery commits (live):**
- `eee21a63` — keep last good today snapshot + retry empty today fetch
- `c6b6b0b6` — remove visible loading labels
- `ac546dd4` — keep last visible summary while next date refreshes

**Last stable deployment commit (live):**
- Commit: `ac546dd4`
- Date: 2026-02-21

### 3.6 Food Search Consistency (Jan 2026 – Locked)
- Single‑food searches must use USDA; packaged searches use FatSecret + OpenFoodFacts.
- Plural searches should automatically fall back to the singular form (e.g., “fried eggs” → “fried egg”) to prevent empty/irrelevant results.
- If the query begins with a brand (e.g., KFC, Starbucks, McDonalds), top results should preserve the brand‑first wording.
- For multi-word packaged search, once the user starts a new word, that current word must be matched immediately from its first letter (example: `McDonald's chee` must prioritize `cheeseburger` matches before unrelated words).
- Packaged result order must follow the alphabetical hierarchy ranking for the active typed word, not random order.
- Search UX must stay consistent across:
  - Add Ingredient
  - Build a Meal
  - Adjust Food Details (edit a card)
  - Add Ingredient after photo analysis
  - Drink Details “Search food” flow (prefills the query)
- The search input should keep the embedded search icon and avoid the separate wide button layout regression.

### 3.7 Weight Unit Defaults (Jan 2026 – Locked)
- Default weight unit must be **ml** only for liquids (milk, oils, drinks).
- Solid foods must default to **grams**; do not auto‑select ml for solids like chocolate, nuts, etc.

**Backend (`app/api/food-log/route.ts`):**

1. **Query broadly, filter precisely:**
   - Query MUST include entries created within the date window only for legacy rows where `localDate` is missing
   - Use OR conditions to catch entries with:
     - Correct `localDate` matching requested date
     - Null `localDate` but `createdAt` within date window
   - After querying, filter results to ensure only entries for requested date are returned
   - Remove duplicates before returning results

2. **Never filter by `localDate` alone:**
   - Use `createdAt` **only** when `localDate` is missing
   - If `localDate` exists but is wrong, **exclude** it (do not move it to requested day automatically)
   - Do **not** use `createdAt` to override a mismatched `localDate`

3. **Deduplication is required:**
   - Multiple OR conditions might return the same entry multiple times
   - Always deduplicate by entry `id` before returning results

### 3.3 What Agents Must NOT Do

**DO NOT:**
- Remove the database verification step in the frontend loading logic
- Make date filtering stricter or more restrictive
- Remove the fallback OR condition for missing `localDate` rows in the backend query
- Include entries whose `localDate` exists but does **not** match the requested day
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

### 3.4.3 Packaged Energy Units + kcal/kJ Toggle (Jan 2026 - Locked)

**Why this exists:** Packaged foods can report energy in kJ only. If treated as kcal,
numbers show wrong and different screens disagree (favorites vs edit screen).

**Protected files:**
- `lib/food-data.ts`
- `app/food/page.tsx`
- `app/food/build-meal/MealBuilderClient.tsx`

**Rules that must stay:**
- OpenFoodFacts energy must be normalized:
  - Use `energy-kcal_*` when present.
  - If only kJ is present, convert to kcal before saving.
- Official packaged adds must store `dbSource` + `dbId` and set `dbLocked = true`
  so auto-matching does not overwrite the item later.
- The kcal/kJ toggle must appear above the nutrient cards in:
  - Food Diary entry breakdown.
  - Adjust Food Details modal.
- The Build‑a‑Meal “Meal totals” cards must stay in the colored card style
  (matching the rest of the app).
- The `normalizeSuspiciousKjItems(...)` guard must remain in `app/food/page.tsx`
  so zero‑macro drinks with small energy don’t show kJ as kcal.

**Restore steps if broken:**
1) Re‑add the OpenFoodFacts kJ → kcal conversion in `lib/food-data.ts`.
2) Re‑add `dbSource`, `dbId`, and `dbLocked` for official add items in `app/food/page.tsx`.
3) Re‑add the kcal/kJ toggle blocks in the breakdown + edit modal.
4) Re‑apply the colored card layout in `app/food/build-meal/MealBuilderClient.tsx`.

**Last stable fix (staging):**
- Commit: `a02cc1de`
- Date: 2026-01-23

### 3.4.4 Zero‑calorie macro fixes (Jan 2026 - Locked)

**Why this exists:** Some USDA foods can carry macros but no calories. That causes
0 kcal totals in the diary and in favorites, even though macros are present.

**Protected file:**
- `app/food/page.tsx`

**Rule that must stay:**
- When recalculating totals from items, if calories are missing/0 but protein/carbs/fat exist,
  calories must be derived from macros (protein×4 + carbs×4 + fat×9) so entries never show 0 kcal
  when macros are present.

**Last stable fix (staging):**
- Commit: `599b3d0b`
- Date: 2026-01-23

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

#### 3.4.10 Ingredient Card Input UX (Jan 2026 - Locked)

**Protected file:**
- `app/food/page.tsx` (Detected Foods ingredient cards)

**Last stable deploy (for this section):**
- Commit: `efab11b21d2f92727640012d8b662533d5e1dd05`
- Date: 2026-01-11

Rules that must stay locked:
- Servings and weight inputs show **no** focus outline, ring, or blue/green border on tap.
- Weight input clears on focus so the field is blank.
- Weight changes only save when the user presses **Done/Enter**; tapping elsewhere must discard.
- The weight unit dropdown shows **no** expand/chevron icon; users tap the unit text (g/ml/oz) to change it.

#### 3.4.11 Add Ingredient Search UI (Jan 2026 - Locked)

**Protected files:**
- `app/food/page.tsx` (Add Ingredient modal search UI)
- `app/food/add-ingredient/AddIngredientClient.tsx` (standalone Add Ingredient search UI)

These regions are guarded in `scripts/protect-regions.js` using hashes.

**Do not change** without explicit approval. If an intentional change is needed:
1) Set the relevant override env var for the build:
   - `ALLOW_ADD_INGREDIENT_MODAL_SEARCH_EDIT=true` (modal)
   - `ALLOW_ADD_INGREDIENT_SEARCH_EDIT=true` (standalone)
2) Update the hash in `scripts/protect-regions.js` to match the new region.
3) Remove the override env var after the deployment.

#### 3.4.12 Food Search Core Logic Lock (Feb 2026 - Locked)

These search-core regions are now hash-protected in `scripts/protect-regions.js`:

- `app/food/add-ingredient/AddIngredientClient.tsx`
  - `PROTECTED: ADD_INGREDIENT_SEARCH_CORE`
- `app/food/page.tsx`
  - `PROTECTED: ADD_INGREDIENT_MODAL_SEARCH_CORE`
- `app/food/build-meal/MealBuilderClient.tsx`
  - `PROTECTED: BUILD_MEAL_SEARCH_CORE`
- `app/api/food-data/route.ts`
  - `PROTECTED: FOOD_DATA_PACKAGED_SORT`
  - `PROTECTED: FOOD_DATA_PACKAGED_FILTER`

Do **not** edit these sections unless the owner explicitly approves.

If an intentional change is approved:
1) Set only the matching override env var(s):
   - `ALLOW_ADD_INGREDIENT_SEARCH_CORE_EDIT=true`
   - `ALLOW_ADD_INGREDIENT_MODAL_SEARCH_CORE_EDIT=true`
   - `ALLOW_BUILD_MEAL_SEARCH_CORE_EDIT=true`
   - `ALLOW_FOOD_DATA_PACKAGED_SORT_EDIT=true`
   - `ALLOW_FOOD_DATA_PACKAGED_FILTER_EDIT=true`
2) Update the matching expected hash(es) in `scripts/protect-regions.js`.
3) Remove the override env var(s) after deployment.

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

### 3.7.2 Food Diary Restore & Favorites Recovery (Jan 2026 - Locked)

**Purpose:** If the diary shows zero data, favorites/custom meals vanish, or credits look wrong.

**Guard rails (do not remove):**
- Local device restore is **best-effort** and must stay **user-controlled**. Hide only after a successful restore or an explicit “hide” click.
- Do **not** clear local diary snapshots unless the user explicitly asks; they are the last-resort safety net.
- Support recovery routes must always require **identity verification** via a support ticket.
- Restore banner is currently disabled via `SHOW_LOCAL_RESTORE_PROMPT = false` in `app/food/page.tsx`. Flip to `true` only if the owner asks to re-enable.
- The "Fix favorites & credits" banner is also disabled via `SHOW_FAVORITES_RESCUE_PROMPT = false` in `app/food/page.tsx`. Flip to `true` only if the owner asks.

**If it breaks, restore in this order (do not improvise):**
1) Confirm the server still has food log data for the date.
2) Run `POST /api/support/account-repair` (repairs credits/subscription, fixes bad dates, restores favorites from backup if available).
3) If favorites/custom meals are still missing, run `POST /api/support/favorites-rebuild` (backs up then rebuilds from recent food logs).
4) If a single favorite is missing, run `POST /api/support/favorite-restore` with the label. If not found, use `POST /api/support/favorite-create` and re-add ingredients manually.
5) Use the local “Restore this day / Restore all days” banner in Food Diary to bring back device-only entries.

**Protected files:**
- `app/food/page.tsx` (local restore banner + hide flag)
- `app/api/support/account-repair/route.ts`
- `app/api/support/favorites-rebuild/route.ts`
- `app/api/support/favorite-restore/route.ts`
- `app/api/support/favorite-create/route.ts`

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
- **Unit default guard (Jan 2026):** Weight units must default to grams for non‑liquid foods even if a serving label uses `ml`; only clear liquids (milk, oil, juice, etc.) should default to `ml`.
- Any modification to discrete counts, serving labels, or weight seeding requires explicit user approval and must be retested with multi-piece produce (e.g., 6 carrots/zucchinis) to confirm pieces, labels, and weights all reflect the full set.

### 3.10.1 Custom/plain ingredient serving options (Jun 2026 - Locked)
- **Files:** `lib/food/custom-serving-options.ts`, `lib/food/custom-foods.ts`, `scripts/import-custom-foods.ts`, `scripts/check-custom-food-servings.ts`, `app/api/food-data/servings/route.ts`.
- Every custom/plain single ingredient must have serving options before it can be treated as ready for app use.
- Solid foods must have grams and ounces.
- Liquids must use ml-style options and must not get fruit-size labels.
- Naturally countable foods must have sensible small/medium/large/extra large choices where data exists, especially banana, apple, orange, avocado, and egg.
- A single ingredient stays a single food. More than one ingredient is a meal.
- Do not add branded/product rows to the custom/plain single ingredient list.
- Keep `npm run check:custom-food-servings` in `prebuild` so future bad rows fail before build.

### 3.11 Admin Credit Grants & Meter (Jan 2026 – Locked)
- **Files:** `app/api/admin/user-management/route.ts`, `app/api/credit/status/route.ts`, `lib/credit-system.ts`, `components/UsageMeter.tsx`.
- Admin “Add Credits” must post to `/api/admin/user-management` and increment `additionalCredits` directly (non-expiring). Do NOT revert to expiring top-ups for admin grants without explicit user approval.
- `/api/credit/status` must always include `additionalAvailableCents` and add it to `totalAvailableCents`; meter/UI must reflect the sum of subscription remaining + active top-ups + additional credits. Do NOT drop additional credits from the meter.
- Admin user list must surface `totalAvailableCredits` including additional credits (not just top-ups); do not change this aggregation without approval.
- Any billing/credit change requires explicit user approval and retesting on a Premium account with admin-added credits to confirm the meter and admin modal both show the added amount immediately.

### 3.12 AI Recommended Meals (Jan 2026 – Locked)
- **Files:** `app/food/recommended/RecommendedMealClient.tsx`, `app/food/page.tsx`, `app/api/ai-meal-recommendation/route.ts`.
- The Recommended Meal screen must always open on the **Generate** button (no auto-show of the last meal). The Food Diary “Recommended” action passes a `fresh=<timestamp>` query to force a reset. Do not remove this.
- The `Build this meal` action in `RecommendedMealClient` must keep using the same Recipe Import pipeline (`sessionStorage` draft key `food:recipeImportDraft` + `recipeImport=1` route to `/food/build-meal`) so ingredient-by-ingredient matching/progress remains consistent with Import Recipe.
- Saved AI meals must show **Recipe** and **Reason** tabs in the Food Diary:
  - On save, the meal stores metadata in `nutrition`: `__origin: 'ai-recommended'`, `__aiRecipe`, `__aiWhy`, and `__aiMealId`.
  - For older saves with no metadata, the diary fetches AI history from `/api/ai-meal-recommendation?date&category` (stored under `AI_MEAL_RECOMMENDATION_GOAL_NAME`) and matches by id/name/items.
- Do not strip or overwrite these fields or the fallback matching logic; the tabs depend on them.

### 3.13 Build a Meal portion scaling (Jan 2026 – Locked)

**Protected files:**
- `app/food/build-meal/MealBuilderClient.tsx`
- `app/food/page.tsx`

Problem this prevents:
- Changing **Portion size** must scale the meal totals correctly (including sizes **larger** than the full recipe).
- The Food Diary daily totals must use the same scaled values.

Guard rail:
- Do not clamp `portionScale` to 1.0 for saved meals. Portions can be **less than or greater than** 1.
- Keep `__portionScale` on saved meals so the diary can scale totals later.
- Daily totals must apply `applyPortionScaleToTotals(...)` when `__portionScale` exists.
- `getEntryPortionScale` in `app/food/page.tsx` must allow values **greater than 1**. Do not ignore or clamp them.

Restore steps if broken:
1. In `MealBuilderClient`, restore `portionScale` calculation and make sure totals for save are multiplied by it.
2. Ensure saved meals keep `__portionScale` in their totals.
3. In `app/food/page.tsx`, apply `applyPortionScaleToTotals(...)` when calculating entry totals.
4. In `app/food/page.tsx`, ensure `getEntryPortionScale` accepts values above 1 (not just below 1).

Fix commit: `0347b9c7` (2026-01-23)  
Last stable deployment: `0347b9c7` (2026-01-23)

---

### 3.14 Food Diary Edit Page Calorie Consistency & Macro Validation (Jan 2026 – Locked)

**Protected files:**
- `app/food/build-meal/MealBuilderClient.tsx`
- `app/food/page.tsx`

**Problem this prevents:**
- Edit page showing different calories than the front page (e.g., 278 kcal vs 282 kcal)
- Negative macro values appearing in meal totals (e.g., "-0.965 g" carbs)

**Guard rails:**

1. **Calorie Consistency:**
   - When editing an existing entry (`sourceLogId` or `editFavoriteId` exists), the edit page MUST use the saved `__portionScale` from the entry's nutrition data
   - Do NOT recalculate portion scale from the portion input field when editing - use the saved scale directly
   - The `savedPortionScale` state must be fetched via `useEffect` when loading an entry for editing
   - The `portionScale` useMemo must prioritize `savedPortionScale` over `computedPortionScale` when editing
   - This ensures the edit page matches the front page, which also uses the saved `__portionScale`

2. **Macro Validation:**
   - The `macroOrZero` function MUST clamp all values to >= 0: `Math.max(0, num)`
   - The `applyPortionScaleToTotals` function MUST clamp all macros to >= 0 after scaling
   - Never allow negative macros to be displayed or saved, even if source data contains negative values

3. **Favorites Tab Filtering:**
   - The Favorites tab must show ALL favorites, regardless of whether they're custom meals
   - Do NOT filter out custom meals from the Favorites tab (`favoriteMeals.filter(...)`)
   - The Custom tab filters for custom meals separately using `isCustomMealFavorite`

4. **Single Ingredient Favorites:**
   - Single ingredient entries (1 item or 0 items) must NEVER be marked as custom meals
   - In `saveFavoriteFromEntry`, check `isSingleIngredient` and set `inferredCustomMeal = false` for single ingredients
   - In `isCustomMealFavorite`, check item count first - if single ingredient, return `false` immediately
   - Only multi-item meals created via "Build a Meal" should appear in the Custom tab

**Restore steps if broken:**

1. **Calorie discrepancy:**
   - In `MealBuilderClient.tsx`, ensure `savedPortionScale` state is set via `useEffect` when `sourceLogId` or `editFavoriteId` exists
   - Fetch saved scale from entry's `nutrients.__portionScale` or favorite's `nutrition.__portionScale`
   - In `portionScale` useMemo, return `savedPortionScale` when editing, not `computedPortionScale`
   - Verify `getEntryTotals` in `app/food/page.tsx` applies `__portionScale` correctly

2. **Negative macros:**
   - In `macroOrZero` function, add `Math.max(0, num)` to clamp values
   - In `applyPortionScaleToTotals`, add `Math.max(0, ...)` around all macro calculations
   - Ensure rounding doesn't introduce negative values

3. **Favorites tab:**
   - Remove any filter that excludes custom meals from `favoriteMeals` array
   - Ensure `favoriteMeals` includes all favorites without filtering

4. **Single ingredient in Custom tab:**
   - In `saveFavoriteFromEntry`, add check: `const isSingleIngredient = !clonedItems || clonedItems.length === 0 || clonedItems.length === 1`
   - Set `inferredCustomMeal = false` if `isSingleIngredient` is true
   - In `isCustomMealFavorite`, check item count first and return `false` for single ingredients

**Key code locations:**
- `app/food/build-meal/MealBuilderClient.tsx` line ~1086: `macroOrZero` function
- `app/food/build-meal/MealBuilderClient.tsx` line ~1185: `applyPortionScaleToTotals` function
- `app/food/build-meal/MealBuilderClient.tsx` line ~1616-1660: `savedPortionScale` state and `portionScale` useMemo
- `app/food/page.tsx` line ~12857: `isCustomMealFavorite` function
- `app/food/page.tsx` line ~14536: `saveFavoriteFromEntry` function

Fix commits: `9fc8e6f1`, `27f72314` (2026-01-30)  
Last stable deployment: `27f72314` (2026-01-30)

---

### 3.15 Recipe Import + Build Meal Reopen UX (Feb 2026 – STRICT LOCK)

**Protected files (strict):**
- `app/food/import-recipe/ImportRecipeClient.tsx`
- `app/api/recipe-import/route.ts`
- `app/food/build-meal/MealBuilderClient.tsx`

**Owner lock request (must remain exactly as shipped):**
- In **Import by photo**, selected/taken photos must show as preview thumbnails before import.
- After successful photo import, selected photos must be cleared automatically.
- Recipe import API must keep ingredient-line dedupe protections.
- Recipe import API must keep abbreviated/partial recipe rejection protections.
- When reopening a saved recipe in Build a meal edit mode, **Your ingredients** must be one top-level expander section.
- On reopen/edit, that top-level section must default to collapsed (retracted).
- This collapse behavior must apply only to reopen/edit mode, not first-time pre-save recipe building.
- Voice-created recipes must open the normal Build a meal recipe import screen, not a separate voice-only visual.
- Voice-created recipe ingredients must use plain single-food matching first, with the Helfi custom/plain list before any other source, and must not auto-pick branded/product foods.

**What agents must NOT change without explicit written owner approval:**
1. Remove photo previews in Import by photo mode.
2. Keep imported photos after successful import.
3. Remove or weaken import dedupe logic.
4. Remove or weaken abbreviated-recipe rejection logic.
5. Split the top-level ingredient expander into always-open list behavior when reopening saved recipes.
6. Change default reopened state from collapsed to expanded.

**Restore steps if broken:**
1. In `ImportRecipeClient`, restore `photoPreviews` rendering from selected files.
2. In `ImportRecipeClient`, restore `setFiles([])` after successful photo import.
3. In `route.ts`, restore `dedupeIngredientLines(...)` usage for imported ingredient arrays.
4. In `route.ts`, restore abbreviated recipe checks (`isAbbreviatedRecipeText` / `isRecipeAbbreviated`) in fallback guard logic.
5. In `MealBuilderClient`, restore `ingredientsListExpanded` state + top-level `Your ingredients` toggle.
6. In `MealBuilderClient`, restore reopen/edit auto-collapse logic tied to `sourceLogId` / `editFavoriteId` load completion.
7. In `MealBuilderClient`, keep voice recipe handoffs on the normal recipe import path and keep voice ingredient matching in plain single-food mode.

Fix commits: `87c947e2`, `86fb626f`, `fb57a433` (2026-02-14)  
Last stable deployment: `fb57a433` (2026-02-14)

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
- Retention is controlled by `FOOD_PHOTO_RETENTION_DAYS` (default 7). Do not change the default without approval.
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

### 5.1 Billing Page AI Feature Credit Costs (Jan 2026 - Locked)

- The "AI feature credit costs" box on the Billing page is display-only, but it must match real charges.
- Source of truth for this display list: `data/creditCosts.ts` (used by `app/billing/page.tsx`).
- Do not change labels or numbers without the owner's written approval.
- After any approved change, verify the Billing page shows the correct numbers and they match actual charges.
- Last stable deployment: `ad684039` (2026-01-24)
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
- **Health warning alternatives (Mar 2026 - locked):**
  - When a health warning is triggered, show 2–3 plain‑language alternative meal ideas with short recipes in the Food Analyzer UI.
  - Alternatives must avoid the ingredients/issues named in the warning and should use the low‑cost model to keep usage minimal.
- **Food photo model defaults + component-bound follow-up (Dec 25, 2025 – locked):**
  - Food photo analysis defaults to `gpt-4o` for speed and accuracy. Do not revert image analysis to `gpt-5.2` by default.
  - Packaged/label OCR keeps `gpt-5.2` for per‑serve accuracy; do not downgrade label scans.
  - The component‑bound vision follow‑up must remain: one ingredient card per listed component, no summary card, no uniform “100 g” defaults.
  - Any future GPT model test or comparison must preserve this flow: photo upload -> AI analysis -> structured `items` -> ingredient cards. Do not ship a model change unless repeated food photo tests prove `items` are returned every time.
  - Use `scripts/canary-food-analyzer.js` with `CANARY_IMAGE_PATH` when checking real food photos. The canary must fail if the API response cannot create ingredient cards.
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
  - **Barcode label save must persist and confirm (Jan 2026 – locked):**
    - Save to the barcode cache when possible; if that fails, fall back to saving by barcode in the local food library so future scans still work.
    - Show a clear “Barcode saved / Barcode not saved” message with the barcode number and error text. Do not silently fail.
    - **Live database tables must exist (Jan 2026 – locked):**
      - Required tables: `BarcodeProduct` and `FoodLibraryItem`. If either is missing, barcode saves will fail and users will see “Barcode not saved.”
      - **Restore steps (if broken):**
        1) Run standard migrations against the live database.
        2) If `BarcodeProduct` is still missing due to migration history drift, run:
           - `prisma/migrations/20251223120000_add_barcode_product/migration.sql`
        3) Verify both tables exist before declaring the fix complete.
    - **Never wipe barcode data (Jan 2026 – locked):**
      - Do not delete, truncate, or reset barcode tables in live.
      - If someone asks for a wipe, stop and get explicit written approval.
    - **Rollback (if this ever causes bad data):**
      - Revert the fallback save in `app/api/barcode/label/route.ts`.
      - Revert the save confirmation banner in `app/food/page.tsx`.
- **kJ-only label handling (Jan 2026 – locked):**
  - If a label provides **kJ but no calories**, convert kJ to kcal using `kJ / 4.184` and set calories.
  - If calories are still missing, derive calories from macros: `protein*4 + carbs*4 + fat*9`.
  - Do not allow **0 calories** when any of protein/carbs/fat is non-zero.
  - **Rollback (if this ever causes bad numbers):**
    - Revert the kJ/macros-to-calories fallback in `app/api/analyze-food/route.ts` (label-scan path).
    - Revert the same fallback in `app/api/chat/fridge/route.ts` and `app/api/barcode/label/route.ts`.
    - Re-run a label scan to confirm calories revert to the label-only values.
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

### 7.1 Food Chat "Build this meal" handoff (Feb 2026 - Locked)

**Goal:** In food chat (`/chat?context=food`), each `Option N:` recommendation must show a `Build this meal` button and open the same Build a Meal import flow.

**Protected files:**
- `components/VoiceChat.tsx` (option parsing + build button UI + builder handoff)
- `app/food/build-meal/MealBuilderClient.tsx` (recipe import draft handling)

**Must keep:**
- Buttons must appear per recommendation option (not only one generic button).
- Button click must write `food:recipeImportDraft` and open `/food/build-meal` with `recipeImport=1`.
- This path must stay compatible with saving the built meal to favorites from Build a Meal.
- Food chat responses must carry the structured meal payload wrapper:
  - `[[MEAL_OPTIONS_JSON]] ... [[/MEAL_OPTIONS_JSON]]`
  - payload must include each option title, ingredients, and steps.

**If it breaks:**
1. Confirm food chat assistant message contains `Option 1:` / `Option 2:` lines.
2. Confirm response includes `[[MEAL_OPTIONS_JSON]]` wrapper with valid JSON.
3. Confirm `parseFoodAssistantResponse(...)` returns structured options (fallback parsing only if JSON missing).
4. Confirm clicking button writes `sessionStorage['food:recipeImportDraft']`.
5. Confirm route push includes `/food/build-meal?...&recipeImport=1`.

### 7.7 Ask AI -> Build Meal End-to-End Lock (Feb 2026 - Strict Lock)

This full flow is now hard-locked with build-time checks.

Scope that is locked:
- Ask AI entry link in Food Diary
- Food chat recipe detection + JSON wrapper format
- Food chat fallback parsing for single-recipe replies
- Food chat `Build this meal` button rendering + click handoff
- Recipe import draft apply logic in Build a Meal (including serving inference)
- Imported recipe panel shown at the top of Build a Meal
- Share meal text + branded social/mobile share row in Build a Meal
- Favorite meal share helpers + chooser/preview share strips
- Recommended meals `Build this meal` handoff/button row

Protected files:
- `components/VoiceChat.tsx`
- `app/api/chat/voice/route.ts`
- `app/food/build-meal/MealBuilderClient.tsx`
- `app/food/page.tsx`
- `app/food/recommended/RecommendedMealClient.tsx`
- `scripts/protect-regions.js`

Hard rule:
- Any unapproved change in these protected regions will fail build/deploy.

If a change is truly required:
1. Get explicit written approval from the owner first.
2. Use the matching `ALLOW_*` override env var for that specific guard.
3. Update the expected hash in `scripts/protect-regions.js`.
4. Re-test full flow end-to-end before deploy.

Last stable deployment reference:
- Commit: `5a91ed30`
- Date: `2026-02-26`

---

## 9.2 Device Interest Tracking (Dashboard + Admin) — Locked

**Goal:** The “I’m interested” buttons must always record interest and show up in the admin panel counts. Do **not** break this flow.

**Protected files:**
- `app/dashboard/page.tsx` (Connect Your Devices buttons + labels)
- `app/api/user-data/route.ts` (persists `deviceInterest` into `__DEVICE_INTEREST__`)
- `app/api/admin/users/route.ts` (admin counts for device interest)
- `app/devices/page.tsx` and `app/health-tracking/page.tsx` (interest toggles)

**Rules (do not change without explicit user approval):**
- “I’m interested” buttons must call the interest toggle and persist to `deviceInterest` (not a no‑op UI).
- Admin counts must reflect the saved interest, including **Huawei Health**.
- **Apple Watch** and **Samsung Health** are intentionally removed from admin counts.
- Active “Interested ✓” should use the same green as “Connect” buttons (`bg-helfi-green`).
- Huawei icon is stored at `public/brands/huawei-health.png` and must stay wired in the dashboard devices grid.

If this ever breaks, restore by:
1) Verify `toggleInterest(...)` updates `deviceInterest` and POSTs to `/api/user-data`.
2) Ensure `/api/user-data/route.ts` persists `deviceInterest` to the `__DEVICE_INTEREST__` record.
3) Ensure `/api/admin/users/route.ts` counts `googleFit`, `oura`, `polar`, and `huawei` (and not `appleWatch`/`samsung`).

---

## 10. PWA Home Screen / Entry Path (Locked)
**Protected files:**
- `public/manifest.json` → `start_url` must stay `/auth/signin`, `scope` `/`, icons point to local leaf assets.
- `middleware.ts` → when a valid session exists and the path is `/auth/signin` **or `/`**, it must redirect server-side to `/pwa-entry` before rendering the login/marketing page.
- `app/pwa-entry/page.tsx` → sole server-side router that sends signed-in users to onboarding (if incomplete) or their last page/dashboard; no extra client-side redirects here.
- `app/layout.tsx` → the normal Helfi Web shortcut uses `/manifest-helfi-ios-nontransparent-v20260722g.json`, `/icons/helfi-ios-nontransparent-v20260722g-192.png`, `/icons/helfi-ios-nontransparent-v20260722g-512.png`, and the standard `/apple-touch-icon-helfi-ios-nontransparent-v20260722g-180.png` link. Do not use `apple-touch-icon-precomposed`. The active manifest keeps the `/pwa-entry` route and `/` scope; its fresh `?icon=helfi-ios-nontransparent-v20260722g` identity prevents iOS reusing an older installed bitmap and must not be removed without a physical iPhone retest. The installed web shortcut name is `Helfi Web`; the native iOS app name is `Helfi`.
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
4) Keep `app/layout.tsx` manifest/icons pointing to the local approved leaf-on-white assets; verify dimensions, opacity, white background, colour, and a physical iPhone Home Screen result before changing their identity again.

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
- Barcode results must be saved as a single **ingredient card** item (same shape as photo/AI `analyzedItems`) using `buildBarcodeIngredientItem`; keep barcode metadata (`barcode`, `barcodeSource`, `detectionMethod: 'barcode'`) and rely on ingredient cards for totals.
- Post-scan UX lock (HEL-220, Feb 19, 2026): for diary scans, show the action chooser first (`Add to diary`, `Preview`, `Change portion`, `Cancel`) and do not auto-add immediately after lookup success.
- Save path lock (HEL-220, Feb 19, 2026): barcode diary adds must use the same meal insert path as other diary adds (`insertMealIntoDiary`) so new rows appear immediately without a manual page refresh.
- UPC-E lock (HEL-220, Feb 19, 2026): do not reject valid UPC-E scans in client sanity checks, and keep UPC-E -> UPC-A candidate expansion in `app/api/barcode/lookup/route.ts` to avoid “scan twice” behavior.
- Name-order lock (HEL-223, Feb 19, 2026): if barcode source text looks reversed (example: `Blue smooth`), probe OpenFoodFacts for display-name order and prefer that title only when the word set matches. Do not apply broad generic rename fallback to barcode display names; barcode rename should be barcode-specific.
- Editing barcode entries must open the ingredient-card editor (triggered by `isBarcodeEntry` in `editFood`); do not strip the barcode markers or fall back to the manual text editor.
- If you must touch this area, first explain the exact change in plain language and get approval; then re-test live scanning on iOS PWA.

### 11.1 Hard lock (deploy blocker) - Feb 27, 2026

This scanner flow is now deploy-block protected. If these regions change, build/deploy fails unless an override env var is intentionally used.

- `app/food/page.tsx`
  - `PROTECTED: FOOD_BARCODE_LOOKUP_FLOW` (scan lookup + action routing)
  - `PROTECTED: FOOD_BARCODE_SCANNER_ENGINE` (camera + decoder startup flow)
- `scripts/protect-regions.js`
  - `ALLOW_FOOD_BARCODE_LOOKUP_FLOW_EDIT`
  - `ALLOW_FOOD_BARCODE_SCANNER_ENGINE_EDIT`

Last stable hard-lock update: `Feb 27, 2026` (barcode scanner flow)

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

## 12.1 Primary Goal Sync (Jan 2026 – Locked)

**Protected files:**
- `components/providers/UserDataProvider.tsx`
- `components/LayoutWrapper.tsx`
- `app/onboarding/page.tsx`
- `app/food/page.tsx`
- `app/settings/food-diary/page.tsx`

**Problem this prevents:** goal choice shows differently across devices (e.g., Maintain weight on mobile, Get shredded on desktop), causing wrong daily allowance.

**Rules (do not change without owner approval):**
- The server value for `goalChoice` and `goalIntensity` is the source of truth on load.
- Cached/local values must be replaced by the server value unless the user just edited the goal on that device.
- If a mismatch is detected, the app must re-sync immediately and show a brief “Goal updated” notice.

**Required checks before claiming success:**
1) Change goal on device A.
2) Open onboarding/food diary on device B.
3) Both devices must show the same goal and allowance.

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

**Last verified working deployment:** 2026‑02‑15 16:44 AEDT (fix commit `f42edabd`, deploy-note commit `8ef7d612`)

**Protected files:**
- `lib/notification-inbox.ts`
- `app/notifications/inbox/page.tsx`
- `app/api/notifications/inbox/route.ts`
- `app/api/notifications/pending-open/route.ts`
- `app/api/notifications/notification-open/route.ts`
- `app/pwa-entry/page.tsx`
- `components/LayoutWrapper.tsx`
- `public/sw.js`
- `app/check-in/page.tsx`
- `app/mood/page.tsx`
- `app/mood/quick/page.tsx`
- `app/api/checkins/today/route.ts`
- `app/api/mood/entries/route.ts`
- `app/api/push/dispatch/route.ts`
- `app/api/push/scheduler/route.ts`
- `app/api/mood/dispatch/route.ts`
- `app/api/mood/push-scheduler/route.ts`

**Required behavior (must not change):**
1) Tapping a reminder must open the reminder page (check‑in or mood) even if the app was last left on another page.  
2) Reminders must always appear in the Notification inbox.  
3) After a successful save, completed reminders must be removed from the Notification inbox.  
4) Normal app opens must still go to the last page the user visited.

### 14.0.1 Hard lock (Feb 2026 regression prevention)

If you touch this flow without owner approval, you are likely to break reminder taps again.

**Do not remove these protections:**
1) In `components/LayoutWrapper.tsx`, keep the `urlPrefix` filter when `notificationOpen=1` so mood taps cannot be redirected to check‑in (and vice versa).
2) In `lib/notification-inbox.ts`, keep `consumePendingNotificationOpen(...)` filtered to `status = 'unread'`.
3) In save endpoints, keep cleanup after successful save:
   - `app/api/checkins/today/route.ts` clears `checkin_reminder`.
   - `app/api/mood/entries/route.ts` clears `mood_reminder`.
4) Do not move reminder cleanup before save success.
5) Do not remove the notification-open marker flow (`public/sw.js` -> `/api/notifications/notification-open` -> `components/LayoutWrapper.tsx`).

**Quick pass/fail check (must pass before shipping):**
1) Tap a mood reminder from iPhone pop-up -> it must open mood page.
2) Tap a check-in reminder from iPhone pop-up -> it must open check-in page.
3) Save both -> both reminder cards must disappear from `/notifications/inbox`.

**If changes are requested:**
1) Explain the change in plain language first.  
2) Get explicit written approval.  
3) Re‑test reminder tap behavior and inbox logging on iPhone PWA before shipping.

### Restore steps (if this breaks again)
If reminder taps open the wrong page OR the inbox does not clear after a completed reminder, restore in this order:

0) Confirm you are testing on iPhone PWA, tapping the alert from the phone pop‑up
   (not from inside the inbox list).

1) Reminder tap routing must return a URL that includes a `notificationId`.
   - The pending‑open flow already returns `{ url, id }` and appends
     `?notificationId=<id>` when it redirects (see `app/pwa-entry/page.tsx`).
   - When the app is already on a reminder page after a tap (`notificationOpen=1`),
     pending‑open must filter by that page URL prefix (check-in vs mood) so it does
     not redirect to a different reminder type.
   - The tap must also set a “notification open” marker before navigation so the
     app knows a reminder was tapped (see `public/sw.js`).
   - The app must check that marker on resume and call the pending‑open API
     (see `components/LayoutWrapper.tsx`). If this step is missing, taps will
     fall back to the last page.

2) The reminder pages must capture that `notificationId` from the URL and save it
   so the save action can clear the inbox item.
   - Pages: `app/check-in/page.tsx`, `app/mood/page.tsx`, `app/mood/quick/page.tsx`
   - On load, read `window.location.search` and extract `notificationId`.
   - Save it to `sessionStorage` as `helfi:pending-notification-id`.
   - Do NOT use `useSearchParams()` here; it causes build failures. Use
     `new URLSearchParams(window.location.search)` inside the client component.

3) The save endpoints must clear reminder inbox items only after a successful save.
   - `/api/checkins/today` must clear `checkin_reminder` items.
   - `/api/mood/entries` must clear `mood_reminder` items.
   - Smart Health Coach alerts must clear by category after related saves:
     - mood save clears `mood`
     - water save clears `hydration`
     - food save clears `meal` + `macro`
   - Do not move this cleanup before save success.

4) Re‑test on iPhone PWA:
   - Tap a fresh reminder, complete it, then open inbox.
   - The alert must be gone. If not, step 3 is broken.

5) If the inbox shows the same time for every alert:
   - The list view is falling back to “now” because it cannot read the saved
     time from storage.
   - Fix by reading both `createdAt` and `createdat` (and the same for `readAt`)
     in `lib/notification-inbox.ts` so the real saved time is used.

### 14.1 Reminder limits (Free vs Paid) — Locked

**Protected files:**
- `app/notifications/reminders/page.tsx`
- `app/api/checkins/settings/route.ts`
- `app/api/mood/reminders/route.ts`
- `app/api/push/scheduler/route.ts`
- `app/api/mood/push-scheduler/route.ts`

**Required behavior (must not change):**
- Free members can set **1 reminder per day**.  
- Paid members (subscription **or** purchased credits) can set **up to 4 per day**.  
- “Free starter credits” do **not** unlock more reminders.
- The UI must show the limit and prompt users to subscribe/buy credits when they try to pick more than 1.

**Restore steps (if this breaks again):**
1) In the settings APIs, ensure `maxFrequency = isPaidUser ? 4 : 1` and clamp `frequency` to that limit.
2) In the UI, keep the warning prompt when a free user tries to pick more than 1.
3) Confirm both check‑in and mood reminders use the same limits.

Fix commit: `b93a187e` (2026-01-24)

### 14.2 Check-in Reminder Delivery Parity (Feb 2026 – Locked)

**Goal:** Check-in reminders must be delivered the same way as mood reminders.  
If mood reminders are working, check-in reminders must work too.

**Why this is locked:**
- Both reminder types look the same in Settings.
- Users should never have one working while the other silently fails.

**Required behavior (must not change):**
1) Check-in reminders must have a reliable server timer that runs every 5 minutes.  
2) The timer must call `/api/push/scheduler` so check-in reminders are sent on time.  
3) This must stay in `vercel.json` so it cannot be lost by accident.
4) Check-in reminders must always have a delivery log table available (`ReminderDeliveryLog`).
   Missing this table breaks check-in reminders even when mood reminders work.

**Restore steps if it breaks:**
1) Open `vercel.json` and confirm this exact cron entry exists:
   - Path: `/api/push/scheduler`
   - Schedule: `*/5 * * * *`
2) Confirm the check-in tables are created on every reminder send:
   - Ensure `ensureCheckinTables()` exists in `app/api/checkins/_db.ts`.
   - Ensure both `/api/push/dispatch` and `/api/push/scheduler` call it.
3) Re-deploy and wait until the deployment status is **READY**.
4) Set two check-in reminders, wait for the next scheduled time, and confirm the alert shows.

**Last stable deployment:** `36b0d743` (2026-02-02)

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
- Favorites -> All must collapse duplicate items by normalized name so each item
  appears only once (keep the most recent entry and preserve favorite links).

**If this breaks again, fix checklist (only in `app/food/page.tsx`):**
1) Ensure every entry creation path sets `addedOrder = Date.now()` and passes it
   into `ensureEntryLoggedAt(...)`.
2) Confirm `mapLogsToEntries(...)` reads `nutrients.__addedOrder` (if present)
   and assigns `entry.__addedOrder`.
3) For older logs missing `__addedOrder`, keep fallback to parse timestamp from
   `FoodLog.id` (cuid) so midnight previous-day adds still sort correctly.
4) Confirm `resolveEntryCreatedAtMs(...)` uses `__addedOrder` first.
5) Confirm `ensureEntryLoggedAt(...)` writes `__addedOrder` onto the entry and
   into `nutrition`/`total`.
6) Ensure Favorites -> All collapses duplicates by normalized label:
   - Keep `dedupeAllMealsByLabel(...)` in `buildFavoritesDatasets`.
   - It must merge items with the same normalized label and keep the newest one.
   - It must preserve any favorite link (so edit/delete still works).
7) If duplicates reappear:
   - Restore the `dedupeAllMealsByLabel(...)` block (and helpers) near
     `buildFavoritesDatasets` in `app/food/page.tsx`.
   - Make sure `allMealsRaw` flows through that dedupe before `allMealsWithFavorites`.
   - Do not remove the `usedFavoriteIds` / `usedLabels` tracking that runs
     after the dedupe (keeps Favorites from re-adding duplicates).

## 7.1 Credits Bar Reload Jitter (Jan 2026 - Locked)

**Goal (non-negotiable):** The Credits Remaining bar must **not** reload and
shift food flows when you leave and return (Food Diary, Food Analysis, Build Meal,
Add Ingredient). It should appear instantly and update quietly in the background.

**Do not:**
- Clear the saved credits display on every return to the page.
- Render the meter only after a fresh network call.

**Must keep (source of truth):**
- The credits bar reads a stored value first (same session) and shows it
  immediately across food flows (even if the component remounts).
- The network call runs after, then updates the bar without a layout jump.

**If this breaks again, fix checklist:**
1) Restore the "show stored value first" behavior for the credits bar.
2) Keep the background refresh, but do **not** block initial render on it.
3) Ensure the cached value is reused on food sub-pages (analysis, build meal,
   add ingredient) rather than only the main diary view.

## 7.2 Exercise Modal Draft Persistence (Jan 2026 - Locked)

**Goal (non-negotiable):** The "Add exercise" modal must keep the user's
in-progress inputs when they close and reopen it (manual entry flow), instead of
resetting to defaults every time.

**Do not:**
- Reset the draft state on every modal open for new manual entries.
- Clear user-entered values unless the user explicitly changes them or saves.

**Must keep (source of truth):**
- Draft state persists for the manual exercise modal between open/close.
- Editing an existing exercise entry still loads the entry values (not the draft).

**If this breaks again, fix checklist:**
1) Restore draft persistence for manual exercise entries.
2) Keep edit-mode hydration (existing entry data overrides the draft).

## 7.3 Support Chat & Tickets (Jan 2026 - Locked)

This support system has been reworked and must not be changed without explicit
owner approval.

**Protected files:**
- `app/support/page.tsx`
- `components/support/SupportChatWidget.tsx`
- `app/api/support/tickets/route.ts`
- `app/api/support/inquiry/route.ts`
- `lib/support-automation.ts`
- `data/support-kb.json`
- `lib/support-code-search.ts`
- `data/support-code-index.json`
- `scripts/build-support-code-index.js`

**Must keep (source of truth):**
- Support page has two states for logged‑in users:
  - Ticket entry + Past tickets list.
  - Live chat view.
- Back button behavior:
  - If in chat view → returns to ticket entry.
  - If in ticket entry → returns to the page the user came from (not always dashboard).
- Submitting the support form does **not** auto‑open chat.
  - After submit, show a choice: “Start chat now” or “Just email me.”
- Past tickets list (logged‑in) with **View** and **Delete**.
  - Delete must permanently remove the ticket and its responses.
- Homepage support widget is **guest‑only** (not visible for logged‑in users).
  - Guest tickets stored in `localStorage` history with **View/Delete**.
- Chat UI:
  - Only the message list scrolls.
  - Input field stays visible.
  - Mobile chat view is full‑width with no horizontal overflow.
- Support AI:
  - Model locked to **gpt‑5.2**.
  - No fallback models.
  - Answers must be based on Support KB + product facts + code context only.
  - If not verified, the bot must escalate and tell the user they will receive an email.
- Support code index is rebuilt on deploy via `prebuild`.
  - Do not remove or bypass `scripts/build-support-code-index.js`.

**Backup reference (known good snapshot):**
- Commit: `7db259ab2918433abef8e010786e224b0c600594`
- If this area breaks, restore from that commit or compare:
  - `git show 7db259ab:app/support/page.tsx`
  - `git show 7db259ab:components/support/SupportChatWidget.tsx`
  - `git show 7db259ab:lib/support-automation.ts`

## 7.4 Admin Login + Authenticator (Locked)

**Goal:** Prevent admin lockouts caused by password or authenticator changes.

**Protected files:**
- `app/admin-panel/page.tsx`
- `app/admin-panel/qr-login/page.tsx`
- `app/api/admin/auth/route.ts`
- `app/api/admin/qr-login/start/route.ts`
- `app/api/admin/qr-login/status/route.ts`
- `app/api/admin/qr-login/approve/route.ts`
- `lib/admin-auth.ts`

**Rules (do not change without explicit owner approval):**
- Do not change the admin login flow, password checks, or authenticator logic.
- Do not reset admin passwords or authenticator secrets in the database.
- Do not change the admin email in the database.

**If login breaks:**
1. Get the owner’s written approval before any password or authenticator reset.
2. If a reset is approved, tell the owner they must scan a new QR code.
3. After any change, test both:
   - Email + authenticator login on desktop.
   - QR login approval on phone.

**Last stable deployment:** `dbe9205a` (2026-01-24)

## 7.5 Favorites → Diary Sync (Feb 2026 – Locked)

**Goal (non‑negotiable):** Editing a saved meal (favorite) must update the diary
entry for the **same day** only **if that diary entry was not manually edited**.

**Must keep:**
- Diary entries copied from a favorite include a `__favoriteId`.
- If the user manually edits that diary entry, set `__favoriteManualEdit = true`.
- When a favorite is edited, only update diary entries on the **same localDate**
  where `__favoriteId` matches **and** `__favoriteManualEdit` is not true.
- Never update entries from other days.

**If this breaks again, restore:**
1. Manual edits set `__favoriteManualEdit` on the diary entry’s totals.
2. Favorite edits call the diary sync endpoint and the client applies a same‑day update.
3. The sync logic always skips entries where `__favoriteManualEdit` is true.

## 7.6 Drink Icon + Global Rename Sync (Feb 2026 – Locked)

**Goal (non‑negotiable):**
- Drink entries (hot chocolate / tea / coffee / etc.) must always show drink icon + drink amount in Food Diary.
- Renaming a food from Diary or Favorites must apply everywhere (Diary + Favorites + future uses of the same saved item).
- Rename logic in this section is locked: no agent may change it without the owner’s explicit written approval.

**Must keep:**
- Drink metadata can live in either `nutrition` or `total`; read from both with fallback.
- Do not drop `__drinkType`, `__drinkAmount`, `__drinkUnit`, `__drinkAmountMl`, `__waterLogId` during edit/save/update flows.
- In Food Diary row rendering (`app/food/page.tsx` -> `renderEntryCard`), explicit drink metadata must always win over favorite-name heuristics.
- Drink entries linked to water logging must never be loosely remapped to favorites by label/alias/token matching.
- In favorites picker add flow, when drink context is active (`drinkAmount`/`drinkType` flow), prefer the selected row entry payload over a loosely linked favorite template.
- Drink scaling lock (all drink types): only scale by `drinkAmount` when the source entry has a reliable base serving volume. Never scale from tiny/invalid bases (like `1 ml`) or raw ml multiplication can explode calories.
- API lock: when saving/updating a **sugar-free hot chocolate** drink entry, force nutrition to sweetener-only values (no stale favorite kcal allowed).
- UI lock: when loading history/diary, apply the same sugar-free hot chocolate guard so old bad rows cannot reappear with high kcal.
- Water -> Food handoff lock: when opening Food add flows from Water drink modal, carry sweetener context in URL (`drinkSweetener` + `drinkSweetenerAmount` + `drinkSweetenerUnit` + `drinkSweetenerGrams`) so sweetener intent is never lost.
- Pending-context lock: in `app/food/page.tsx`, consume sweetener context and apply `applyPendingDrinkSweetenerGuard(...)` before creating entry payload so Water flow drinks never get kcal multiplied by ml.
- Favorite rename sync must match by `favoriteId`, and also by stable identifiers (`sourceId` / `barcode`) so older diary rows still update.
- Food name override save must support entries where `items` can be JSON strings (not only arrays).

**If this breaks again, restore:**
1. In `app/food/page.tsx`, keep `getDrinkMetaFromEntry(...)` reading metadata from both `nutrition` and `total`.
2. In edit flow meta merge, preserve existing drink metadata (do not rely on `nutrition` only).
3. Block loose favorite fallback matching for entries carrying drink metadata (`__drinkType` / `__waterLogId`).
4. In favorites add flow, use row `entry` source in drink context instead of linked favorite template source.
5. In rename sync, match linked entries by `favoriteId` + `sourceId` + `barcode`.
6. In override save, parse `items` from string/array so stable keys are stored.
7. In `app/api/food-log/route.ts`, keep the sugar-free hot chocolate save guard (sweetener-only totals).
8. In `app/food/page.tsx`, keep the sugar-free hot chocolate load guard so stale rows are corrected on display.
9. In `applyDrinkOverrideToItems(...)`, keep the reliable-base-volume checks and tiny-base block (`baseMl < 20`).
10. Keep `drinkSweetener` URL + pending ref handoff and the `applyPendingDrinkSweetenerGuard(...)` call in add flows.

### 7.6.1 Delayed Drink->Food Flip Lock (HEL-156, Feb 2026 - STRICT LOCK)

**Owner-reported symptom (LIVE):**
- On `/food` refresh, a row like `Coke Zero` first shows correctly as a drink (`Soft Drink` icon + `150 ml`), then about 5 seconds later flips to food style icon/text with no drink amount.

**Root cause pattern:**
- Initial render used real drink metadata correctly.
- Delayed refresh/remap path re-applied favorite-label heuristics and overrode drink rendering.

**Non-negotiable rule:**
- If `drinkMeta?.type` exists on a non-water entry, that row must stay a drink row.
- Favorite label logic is fallback only and must never override explicit drink metadata.

**Code lock (must preserve):**
- File: `app/food/page.tsx`
- In `renderEntryCard`, keep this precedence:
  1. `hasExplicitDrinkMeta = !isWaterEntry && Boolean(drinkMeta?.type)`
  2. `forceFoodIconForFavorite` can only apply when `!hasExplicitDrinkMeta`
  3. `isDrinkEntry` must be true when `hasExplicitDrinkMeta` is true

**If this breaks again, restore this first:**
1. Re-open `app/food/page.tsx` and restore the explicit-meta-first logic above.
2. Confirm favorite-name checks do not run as an override when explicit drink metadata exists.
3. Run Playwright on LIVE (`https://helfi.ai/food`):
   - Use a date containing a linked drink entry (example: `2026-02-14`, Breakfast -> `Coke Zero`).
   - Hard refresh 3 times.
   - Watch the row for at least 10 seconds after each refresh.
   - Expected: stays as drink icon + `150 ml`, no delayed flip to food icon.

**Last stable deployment for this lock:**
- Commit: `52e8d130`
- Date: `2026-02-14`

### 7.6.2 Favorites "Change portion" Must Be One-Off Entry Only (HEL-160, Feb 2026 - STRICT LOCK)

**Goal (non-negotiable):**
- If user goes through Food Diary -> Add from favorites -> `Change portion`, that edit must apply only to the one new diary entry being added.
- It must **not** change default portions/ingredients of saved favorites or custom meals.

**Only allowed default-edit path:**
- Favorites tab -> pencil icon (edit favorite/custom template)
- Custom tab -> pencil icon (edit custom template)

**Must keep in code:**
- In `app/food/page.tsx`, the first favorites action popup (`favoriteActionModal.mode === 'choose'`) must always show:
  - `Add to diary`
  - `Preview`
  - `Change portion`
  - `Cancel`
- In `app/food/build-meal/MealBuilderClient.tsx`, `fromFavoriteAdjust=1` (`isFavoriteAdjustBuild`) must force one-off mode:
  - do not auto-save/overwrite favorite defaults
  - do not attach `__favoriteId` link for that add flow
  - primary action should remain `Add` (not `Update`)
  - when this one-off add succeeds, update the source favorite `lastUsedAt` so Favorites/All recency order stays correct.

**If this breaks again, restore this first:**
1. In `createMeal`, keep one-off lock for `isFavoriteAdjustBuild` so favorite persistence is disabled.
2. Ensure payload nutrition does not include `__favoriteId` in this flow.
3. Ensure one-off add success path stamps the source favorite `lastUsedAt` (id/sourceId/label match) before returning to Food Diary.
4. In `app/food/page.tsx`, confirm the choose popup still renders `Change portion` button (not hidden/removed by merge).
5. Re-test on LIVE with Playwright:
   - Open Add from favorites -> select meal -> `Change portion`.
   - Change amount/ingredients and tap `Add`.
   - Reopen that same favorite in list and confirm its default serving/ingredients are unchanged.

### 7.6.3 Water Favorites Drink Sweetener Carry-Through (HEL-162, Feb 2026 - STRICT LOCK)

**Owner-reported symptom (LIVE):**
- Drink added from Water -> Add from favorites could show wrong drink kcal (including ml multiplication or stale favorite totals).

**Root cause pattern:**
- Sweetener intent from Water modal was not always carried into Food add flow.
- Flow could scale calories by ml or reuse stale favorite nutrition instead of sweetener-only nutrition.

**Non-negotiable rule:**
- If Water flow includes sweetener context:
  - `free` must keep the base drink nutrition only (for example 8 kcal), never multiplied by ml.
  - `sugar`/`honey` must save only sweetener-based calories/macros (never multiplied by drink ml).

**Hard lock (do not tamper):**
- Do not simplify this to “always zero for sugar-free”. Sugar-free drinks can have base calories.
- Do not remove save-time guard in API even if UI looks correct.
- Do not remove load-time legacy correction in Food Diary; old rows still depend on it.
- Do not let favorite totals override explicit sweetener context from Water flow.

**Code lock (must preserve):**
- `app/food/water/page.tsx` must pass `drinkSweetener`, `drinkSweetenerAmount`, `drinkSweetenerUnit`, and `drinkSweetenerGrams` in `navigateDrinkNutrition(...)`.
- `app/food/page.tsx` must:
  - parse/track pending sweetener context
  - skip ml scaling when sweetener context is active
  - apply `applyPendingDrinkSweetenerGuard(...)` before creating entry payload in add flows
  - when a drink entry is added from Food Diary/Favorites, always run water-log sync even if `__waterLogId` already exists, so stale/missing links are repaired and Water Intake label stays aligned with the diary title
- `app/api/food-log/route.ts` must enforce sweetener guard at save time for Water-flow drinks:
  - if sweetener choice is `free`, keep base drink nutrition (never multiplied by ml)
  - if sweetener choice is `sugar`/`honey`, save sweetener-only nutrition (never multiplied by drink ml)

**If this breaks again (fix checklist):**
1. In `app/food/water/page.tsx`, confirm URL params include all 4 values:
   - `drinkSweetener`, `drinkSweetenerAmount`, `drinkSweetenerUnit`, `drinkSweetenerGrams`
2. In `app/food/page.tsx`, confirm `applyPendingDrinkSweetenerGuard(...)`:
   - `free` path keeps base drink totals and only clears sweetener contribution
   - sugar/honey path uses `sweetenerToMacros(...)` only
   - drink add flows still call `syncDrinkWaterLog(...)` even when drink metadata already includes a `waterLogId` (so deleted/stale links are rebuilt)
3. In `app/food/page.tsx`, confirm `buildSugarFreeHotChocolateLockedTotals(...)`:
   - sugar-free legacy rows keep safe base calories (example 8), not 0, not 319
4. In `app/api/food-log/route.ts`, confirm `normalizeSugarFreeHotChocolatePayload(...)`:
   - `free` keeps base drink values
   - sugar/honey uses sweetener-only values
5. Re-test on LIVE:
   - old sugar-free hot chocolate row does not show inflated kcal
   - new sugar-free add keeps base kcal
   - new tea/honey add shows sweetener-based kcal only

**Last stable deployment for this lock:**
- Commit: `3f34d239`
- Date: `2026-02-15`

### 7.6.4 Favorites + Water Add Must Not Wipe Existing Meal Rows (HEL-169, Feb 2026 - STRICT LOCK)

**Owner-reported symptom (LIVE):**
- Add a meal from Favorites (example: breakfast), then add a drink from Water -> Favorites.
- The earlier meal row disappears and only the newest drink row remains.

**Root cause pattern:**
- Add flow merged using a potentially stale `todaysFoods` snapshot instead of the latest live diary cache.
- Under timing/race conditions, that stale base list dropped earlier same-date entries.

**Non-negotiable rule:**
- In add-to-diary flows, merge from the latest live diary list ref, not stale state snapshots.

**Code lock (must preserve):**
- File: `app/food/page.tsx`
- In both add paths:
  - `insertMealIntoDiary(...)`
  - `insertFavoriteIntoDiary(...)`
- Keep base list building as:
  - `filterEntriesForDate(latestTodaysFoodsRef.current, selectedDate)`
  - then `dedupeEntries([pendingEntry, ...baseForDate], ...)`
- Do not switch this back to `filterEntriesForDate(todaysFoods, selectedDate)` in these two flows.

**If this breaks again, restore this first:**
1. Re-open `app/food/page.tsx` and confirm both add paths use `latestTodaysFoodsRef.current` for `baseForDate`.
2. Confirm both paths still call `syncSnapshotOnly(updatedFoods, selectedDate)` after optimistic add.
3. Re-test on LIVE:
   - Add breakfast meal from Favorites.
   - Add tea/hot chocolate from Water -> Favorites into the same meal category.
   - Confirm earlier meal row stays visible (new drink adds without replacing prior row).

## 7.7 Smart Health Coach Anti-Spam Guard (Feb 2026 – Locked)

**Goal (non-negotiable):**
- Smart Health Coach must not send duplicate alerts in a short burst for the same reminder window.
- Users must not be charged multiple times because duplicate scheduler jobs fired at once.

**Must keep:**
- `app/api/push/health-tips/dispatch/route.ts` must claim a per-user dispatch window lock (`userId + localDate + reminderTime`) before evaluation/charging.
- If lock claim fails, dispatch must exit with `already_sent` and must not charge.
- Keep cooldown layers:
  - global cooldown
  - same-rule cooldown
  - same-category cooldown
  - same-message cooldown
- Tip history page must provide one-tap navigation back to Smart Coach and Main menu.

**If this breaks again, restore:**
1. Re-add dispatch window claim before any credit charge call.
2. Re-add category and message cooldown checks before charging.
3. Confirm duplicate scheduler hits on the same minute result in only one sent alert.
4. Keep direct links on history page for `Back to Smart Coach` and `Main menu`.

Last stable deployment: `c1c5f2aa` (2026-02-14)

## 7.8 Global Mobile Scroll Blocker (HEL-176, Feb 2026 - LOCKED)

**Goal:**
- On iPhone/Android PWA, scrolling should feel app-like (no rubber-band page bounce).
- Normal vertical page scrolling must still work.

**Must keep in `app/globals.css`:**
- `html, body` keep:
  - `height: 100%`
  - `overflow-x: hidden`
  - `overscroll-behavior: none`
  - `overscroll-behavior-y: none`
- `body` keep:
  - `min-height: 100dvh`
  - `-webkit-overflow-scrolling: touch`

**Do not do without owner approval:**
- Do not remove these rules.
- Do not replace this with JavaScript scroll blocking.
- Do not add global `overflow: hidden` on `body` (it breaks normal page scroll).

**If this breaks again, restore in this order:**
1. Re-add the exact `html, body` overscroll block rules in `app/globals.css`.
2. Re-add `min-height: 100dvh` and `-webkit-overflow-scrolling: touch` on `body`.
3. Re-test on iPhone PWA:
   - Scroll long pages up/down.
   - Confirm no page bounce feel.
   - Confirm lists/forms/buttons still work.

Last stable deployment: `a0544590` (2026-02-15)

## 7.9 Chat Formatting + Interface Style Lock (Feb 2026 – Locked)

**Goal (non-negotiable):** Keep the approved chat look and text formatting exactly as released across all web chat sections.

**Protected files:**
- `components/chat/ChatRichText.tsx`
- `components/VoiceChat.tsx`
- `app/insights/issues/[issueSlug]/SectionChat.tsx`
- `app/symptoms/SymptomChat.tsx`
- `app/medical-images/MedicalImageChat.tsx`

**Must keep (source of truth):**
- `ChatRichText.tsx` is the shared text renderer for chat replies and user messages.
- All protected chat screens above must use the shared renderer (not separate custom formatting logic per screen).
- Keep the approved readable text size/spacing style (ChatGPT-like clean headings, bullet points, numbered lists, and paragraph spacing).
- Keep the approved composer layout in web Talk to Helfi/Food Ask AI:
  - `+` button on the far left (opens photo/barcode actions)
  - text input in the center
  - mic + send on the right
- Keep chat context behavior separated by section:
  - Talk to Helfi = full health context
  - Food chat = food-specific context
  - Symptom chat = symptom-specific context
  - Medical image chat = image-analysis-specific context
  - Insights section chat = issue/section-specific context

**Do not:**
- Reintroduce per-screen custom markdown/line parsers in the protected chat files.
- Shrink text back to the old compact style or remove the current list/heading spacing.
- Remove or move the left `+` button back inside/right side of the input bar.
- Mix section contexts together (for example, making food chat behave like full-health chat).

**If this breaks again, restore checklist:**
1. Ensure each protected chat file imports and uses `ChatRichText`.
2. Remove any duplicate inline text parsing blocks from those files.
3. Keep medical image chat heading support passed through `headings={SECTION_HEADINGS}`.
4. Verify quickly on web:
   - `/chat` (Talk to Helfi)
   - `/food` (Ask AI)
   - `/symptoms`
   - `/medical-images`
   - `/insights/issues/*`
   and confirm formatting is consistent and section context remains specific.

Last stable deployment: `d1b55505` (2026-02-16)

## 7.10 Notification Inbox Timing Rule (HEL-92, Feb 2026 - LOCKED)

**Goal:**
- A push alert must **not** appear in Notification Inbox straight away.
- It should only appear after about **24 hours** if the user did not action it.
- If user finishes the reminder task (check-in/mood), it should clear and not stay in inbox.

**Must keep in `lib/notification-inbox.ts`:**
- Push-origin items (`source: 'push'`) are saved with a delayed inbox timestamp (`inboxVisibleAfterMs`).
- Inbox list and unread count must only include items where delayed time has passed.
- `consumePendingNotificationOpen(...)` must still work for fresh push taps so open-from-notification flow works.

**Do not do without owner approval:**
- Do not make push reminders appear in inbox immediately again.
- Do not remove the delayed visibility filter from list/unread count.

**If this breaks again, restore in this order:**
1. Re-add delayed metadata on push notifications at create time.
2. Re-add delayed visibility filter in `listInboxNotifications(...)`.
3. Re-add the same delayed visibility filter in `countUnreadNotifications(...)`.
4. Re-test with a fresh reminder:
   - push arrives now,
   - inbox does not show it immediately,
   - completing check-in/mood prevents it from showing later.

## 8. Local OpenAI Spend Lock (May 2026 - LOCKED)

**Goal:**
- Local agents and local test runs must not spend the live Helfi OpenAI balance.

**Must keep:**
- The local app may keep `OPENAI_API_KEY` inside `.env.local` for owner-approved feature testing.
- `OPENAI_API_KEY` must not be exported into the agent/terminal environment.
- `npm run build` must run `scripts/assert-no-local-openai-key.js` before building.
- The live Vercel app may still use its production key.
- Live AI features, including Talk to Helfi, must not be claimed working if Vercel Production is missing `OPENAI_API_KEY`.
- `scripts/check-vercel-ai-env.js` and deployment verification must fail loudly when Vercel Production is missing `OPENAI_API_KEY`; the check must only verify presence and must never print the key value.
- `scripts/check-vercel-production-env.js` must stay in deployment verification so missing required Production environment variables are caught before anyone claims live is healthy.

**Do not do without owner approval:**
- Do not export the live OpenAI key into the shell.
- Do not remove the local OpenAI key blocker.
- Do not run direct command-line OpenAI scripts against the live key.
- Do not copy, print, log, paste, screenshot, or send the OpenAI key anywhere.
- Do not bypass `scripts/assert-no-local-openai-key.js`.

**If local AI testing is needed:**
- Test through the actual Helfi app UI, not direct scripts or agent-side calls.

## 8.1 Talk to Helfi Live Voice Safety and Brevity (July 2026 - LOCKED)

**Must keep:**
- Never show `Listening` from connection or packet counters. A ready connection may say `Ready — speak now`; only the server's real speech-start event may say `Hearing you`.
- iPhone realtime voice must have one audio-session owner. Configure it through WebRTC's shared audio controller; do not run Expo Audio, InCallManager, or direct AVAudioSession configuration against the same live call.
- Show truthful separate states for hearing, thinking, and speaking; surface connection, microphone, service, interruption, and silence failures instead of silently waiting.
- Normal iPhone voice audio must use the speaker, preserve a selected Bluetooth headset, report route changes, and stop safely on an audio interruption.
- Reconnecting the same voice conversation must atomically reuse its billing claim. Connection retries, confirmations, corrections, and repeated realtime events must not create an extra charge.
- Pressing Done or closing Talk to Helfi must immediately stop the microphone, assistant audio, connection, pending app actions, and pending voice requests.
- Late connection or audio work must not restart after the user has stopped live voice.
- Meal and recipe suggestions must be brief when spoken: say the meal name and one short reason, then ask whether the user wants ingredients and nutrients or cooking steps.
- Keep the full meal or recipe detail visible in the transcript; do not read every ingredient, nutrient, macro, or step aloud unless the user asks.
- Never say an item was saved, added, created, or logged unless the backend confirmed the save.
- Medication and supplement changes remain review-first and must never auto-save.

**Required checks after any Talk to Helfi voice change:**
- `npm --prefix native run check:voice-assistant`
- `npm run check:talk-to-helfi-testflight`
- Prove on an iPhone that Done stays stopped and no late audio or microphone activity returns.

## 9. Rules for Future Modifications

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


## Food audit repairs — 4 October 2026

- Packaged search and barcode lookup must share one displayed serving basis. Convert explicit kJ to canonical kcal once and preserve unknown nutrients as null; genuine zeros remain valid.
- Native diary and favorite reads materialize web `__portionScale` into eaten ingredient servings once, clear the scale on the materialized payload, and retain the original saved record. Half/full/double portions must agree after edit/save/reload.
- Preparation compatibility must precede automatic ranking. Do not substitute raw, breaded, skin-on, or a different specified cooking method for the requested food.
- Weight ounces and fluid ounces are distinct. Cross mass/volume conversion requires a known food density; unknown density must not silently become water.
- A USDA barcode result needs an exact product barcode, explicit nutrient units, and the correct 100g basis.
- AI/database enrichment needs a compatible identity and measured portion conversion, with provider record and field attribution. Photo portions remain estimates. Do not apply a second loose web match; native photo results must be reviewed before saving.
- Ordinary barcode label/diary corrections belong only to their submitting account in `BarcodeUserCorrection`; they cannot overwrite trusted shared products. The additive migration preserves original records and the last submitter's private copy. Account deletion cascades to private corrections.
- Regression checks: `scripts/food-*-check.ts`, including actual native diary/favorite/editor/save functions and actual barcode label/read/write route functions. These checks do not substitute for rendered web/iOS/Android release testing.

### Food follow-up safeguards — 4 October 2026
- Food liquid hints must match complete words, including ordinary plurals. Never classify `boiled`, `broiled`, `steak`, `watermelon` or a `teaspoon` measure as oil, tea or water. Whole hard-boiled eggs must retain their individual size choices and measured gram amounts; actual milk, oil, drinks and milkshakes retain liquid options. Check all six actual web/native/provider classifiers with `npm run check:food-liquid-identity`.
- Every successful native Add Ingredient save must refresh the diary before returning; revisit/tab focus must reload the selected day.
- Every food-photo entry path must open ingredient/amount review and show an estimate notice before saving.
- Declared zero energy must remain zero, including foods with small nonzero macros; calculate macro energy only when energy is missing.
- Unknown fibre/sugar values must remain missing in manual ingredient saves and display as unavailable.
- Regression evidence: scripts/food-native-save-flow-check.ts, scripts/food-native-integration-check.ts, scripts/food-web-totals-check.ts.


## 8.2 AI permission and Apple iPad fallback (4 October 2026)

- Before sending user data to OpenAI, require the authenticated account's current-version `AiDataSharingConsent` record. A local flag or a client-supplied consent header alone is not proof.
- Show the same disclosure on web/native, including OpenAI, the shared data categories, ordinary tracking without AI, and withdrawal in Settings. Do not send an AI request when the choice is declined, the permission save fails, or the account changes during approval.
- Withdrawal blocks future AI calls and weekly AI reports before provider/billing work. Keep reading saved records and ordinary food, water, mood and device tracking available.
- Native consent checks must use the signed-in account and fail closed with a bounded timeout. Never migrate an old global local flag into a server grant.
- iPhone keeps the live voice layout. iPad must show its usable typed-message controls and explain that microphone input is iPhone only. Never leave iPad waiting on an unsupported voice connection.
- Voice startup failures must close the connection and stop tracks/timers. Only complete audio/data readiness may produce the live state.
- Apple upload readiness checks must verify the current candidate commit against the latest successful AWS Amplify master deployment and the actual helfi.ai voice readiness endpoint. Vercel is retired.

- Apple Health release gate: preserve the `react-native-health` Expo plugin and `com.apple.developer.healthkit` entitlement. Activity reading is limited to user-selected steps, distance and active calories; do not add clinical records, background Health access or writes. Validate the signed provisioning profile and device permission flow before claiming release readiness.

- Food model comparison (4 October 2026): use the authenticated Helfi admin UI/server with public images from `/FOOD TEST IMAGES/` only. GPT-6.1 Sol requires supported reasoning (default low), completion-token budgets, no sampling controls and no Chat Completions tool calls. Compare complete ingredient JSON, matching totals and measured portion references; keep normal Helfi processing on the existing model until repeated actual photo tests justify changing it. Never use direct agent OpenAI calls or the local key. Benchmark vendor cost is an uncached estimate; it does not charge the test-account wallet.

- Android release signing (4 October 2026): Keep `native/plugins/with-android-release-signing.js` in Expo config. Store release must never inherit the public debug key; missing private upload configuration blocks bundle/assemble release. Keep the encrypted upload keystore outside the entire app repository. `scripts/build-android-release-bundle.sh` records the exact source commit, bundle hash and public signing-certificate fingerprint; local build is not a Google upload or release.

- Apple Health bridge and empty reads (4 October 2026): Preserve callable native host methods when the library Object.assign wrapper loses non-enumerable methods under the new architecture. Never treat a completed Health permission dialog as proof of granted read access: Apple deliberately makes denied reads indistinguishable from an empty store. Empty activity must show an honest no-data/permission message, reset the connection marker and never create an exercise import. Keep the three read permissions and no write/background/clinical permissions. Official reference: https://developer.apple.com/documentation/healthkit/authorizing-access-to-health-data

- Health-image follow-up delivery (5 October 2026): The completed server answer must arrive as complete JSON, preserving every word and paragraph, including a leading refusal such as "No". Never split unescaped multiline clinical text into synthetic SSE frames. A newly analysed image must start with an empty follow-up conversation; opening an older conversation requires an explicit choice. Do not log image filenames or health-note excerpts. Display image notes as starting from 2 credits rather than a fixed 2-credit price. Check actual route success, provider failures, denied permission, native formatting, and conversation selection with `scripts/health-image-chat-delivery-check.ts`; then test ordinary and worrying public fixtures through the real Helfi UI without claiming clinical diagnostic accuracy.

- Apple Health on iPad (5 October 2026): HealthKit supports iPadOS 17 and later. Do not block all iPads as iPhone-only. Before asking for the existing three read permissions, call the native HealthKit availability check and stop when unavailable. Older iPads and Android remain unsupported; denied/empty Health reads must not import or claim access. Keep the live-voice iPad fallback independent of Health support. Actual iPad Air M3 Release simulator permission/decline/empty flow and real module checks verified; successful signed physical-device reads remain a release gate. Official reference: https://developer.apple.com/documentation/healthkit/hkhealthstore/ishealthdataavailable()

- Native Apple sign-in identity (5 October 2026): Identify returning accounts by Apple's verified signed subject. First account lookup/linking must use only Apple's signed email claim with `email_verified` true (boolean or string); never use the client request's email to select another account. A linked returning identity can sign in without an email claim. Preserve issuer, audience, signature and expiry checks, and never log identity tokens or raw verification errors. Fixture check: `scripts/native-apple-signin-identity-check.ts`. Actual signed-device Apple sign-in remains a release gate. Official reference: https://developer.apple.com/documentation/signinwithapple/receiving-a-users-identity-token
### Food nutrient result cards — owner instruction, 5 October 2026

- Every detailed food nutrient result must show all six familiar colored cards: orange calories, blue protein, green carbs, purple fat, yellow fibre, pink sugar.
- Ingredient adjustment, expanded ingredient results, photo/recipe review, meal totals, favorite portions, barcode results, recommended meals, structured food chat/voice summaries and existing sweetener nutrient previews must retain these cards. Editable nutrient fields and progress bars do not replace the result cards.
- Missing nutrients keep their card with `—`; genuine zero remains `0`. Never hide a card because its value is missing or zero.
- Keep cards usable on iPhone and iPad; the shared native result grid measures its own available width and uses two or three columns.
- Source work is authorized by the owner's 5 October screenshot correction. Replacement screenshots and final signed store binaries must be captured/tested after this repair.

- Nutrient-card baseline verified: commit `bc8c5f178247b9d9add5855b890c396f0fb658e7`, 5 October 2026; AWS job 38 all steps succeeded, web/iPhone/iPad ingredient cards rendered and portion totals checked. Signed store builds still pending.

### USDA packaged nutrition basis — 5 October 2026

- Branded USDA nutrients use 100 g or 100 ml according to the provider unit. A label serving is an optional scaled portion, never the denominator for already standardized values. Preserve decimal portion weights and genuine zero values; missing values and unsupported units remain unknown.
- Never replace `None`, a household-only label, or an unsupported provider unit with a guessed 100 g food result. Search and local barcode lookup share the serving-basis gate. Preserve unresolved public rows; the dated unresolved-ID list prevents misleading adds.
- Food library corrections may update only exact public `usda_branded` provider identities matched to the original archive by FDC ID, name and barcode. Preserve every row/ID and all customer diary/favourite/custom/private-label records. Keep the public-data backup and check every original value before each atomic repair batch.
- USDA imports must upsert provider rows, never delete or clear food tables. Store the standardized 100 g/ml basis, recognize GRM/MLT codes and both total-sugar IDs, and finish reading the CSV before declaring completion.
- Official basis/missing-value reference: https://fdc.nal.usda.gov/GBFPD_Documentation/ . Checks: `scripts/food-usda-serving-options-check.ts`, `scripts/food-usda-barcode-check.ts`, read-only archive fixture and reviewed repair-plan dry run.
- Preserve original nutrient precision in every USDA serving option; round only displayed results. A 20 g serving derived from 636 kcal/100 g retains 127.2 internally, so changing back to 100 g shows 636. Keep the regression check for small-portion protein precision too.
- Public library basis repair verified: commit `7734ec210c255f434d513797409e5d3b1caac66c`, AWS job 39 all steps SUCCEED, 5 October 2026. Applied 1,867,037 exact archive-backed corrections; all 1,886,557 provider rows/identities and customer tables preserved. Original public-only backup remains in ignored `data/food-import/repair-backups/usda-branded-public-library-before-2026-10-05.ndjson` (SHA256 `57d6058f37a45e3a4de9b1f3dbd1118f37d3c9c897254418d252b65aac861f60`).

- Saved portion precision and manual refresh (5 October 2026): Native Add Ingredient must store original per-serving nutrient precision and round only final totals/display. On manual diary refresh, matching IDs alone are insufficient: updated nutrition, totals or ingredient portions from another device must replace stale values. Keep local pending saves, identity linking, deletion safeguards and manual-refresh-only behavior unchanged. Check the actual refresh guard and native saved-item expression with `scripts/food-diary-nutrient-sync-check.ts`.

### Database credential safety — 5 October 2026

- Database URLs and passwords belong only in protected environment settings. `lib/prisma.ts` must require a non-empty `DATABASE_URL`; never add a built-in connection fallback. Preserve the existing Prisma write guard, client reuse and disconnect behavior.
- Generated support source excerpts must redact every PostgreSQL URL before indexing, including credentials inside quotes and query strings. Never print original URLs while reviewing, staging or testing this repair.
- `npm run check:database-env-safety` runs during prebuild and checks the actual Prisma module with synthetic settings only. Check deployed live database-backed UI after changing connection setup. Previously exposed credentials require safe replacement in the protected account; source cleanup does not remove historical exposure.

- Database safety baseline: commit `4614a1ae648984bdacfe8babd05bf0d52b3acb7d`, AWS job42 all steps SUCCEED, 5 October2026. Fresh live diary/manual refresh retained376kcal/wallet642; current protected connection passed read-only SELECT1. Authoritative Neon role password differs from the removed historical fallback and matches the working protected setting; old connection failed, so that exposed historical credential was already invalid. No password or customer data changed.

- Whole-word food identity baseline: commit `d052df8936dd90327b7d9e3b71d4d54d02630950`, AWS job 43 all steps SUCCEED, 5 October 2026. Actual rebuilt iPhone restores large-egg choices; two large eggs = 100 g = 155 kcal. Saved/reopened web/iPhone/iPad totals agree at 531 kcal with wallet 642. Explicit raw/cooked rice and milk previews passed; signed store release checks remain pending.

- Missing optional food nutrients (5 October 2026): Fibre and sugar absent from a provider or food label must remain null through barcode/plain-food saves, diary/favourite reads, portion/serving changes, recipe prefills and meal-editor saves. A genuine zero must stay zero. If any consumed ingredient has unknown optional nutrition, the meal/day total is incomplete and must show a dash instead of a partial sum or target percentage. Never infer a missing value from a zero alias. Test the real save/read/editor expressions with `npm run check:food-missing-nutrients`. Only the two optional-nutrient prefill expressions changed inside the protected recipe-import region; serving inference and sharing handlers remain unchanged.

- Missing-nutrient baseline verified: commit `5eb4ad9d8379c9c5a7217b207c707cd81d79b9ec`, AWS job 44 all steps SUCCEED, 5 October 2026. Actual native save/restart and live web/iPhone half/full cross-device edits preserve unknown fibre, true zero fat and six cards (100 g = 88 kcal; 50 g = 44). Full restored daily total is 619 kcal and wallet 639. Historical records without original ingredient evidence are not automatically backfilled; final signed store checks remain pending.

- Native recipe nutrition (5 October 2026): Recipe text extraction is not nutrient analysis. Resolve measured ingredient amounts against compatible food-library identities before opening the builder. Never replace unmatched flour, eggs, milk or other ingredients with hard-coded zero macros or an invented 100 g serving. Keep unresolved amounts, alternatives and optional extras in editable review; do not save a partial recipe as a complete total. Retain provider IDs, original ingredient lines, source URL, steps and stated yield. Recipe servings eaten scale actual ingredient amounts once; missing optional nutrients and real zero values retain their meaning. Voice recipe drafts use the same review. `npm run check:food-native-recipe` exercises the actual handoff, quantity matching, yield, portion changes and save payload without network/AI.

- Native recipe baseline verified: commit `462e4457c01958f22e5b3dc5377cfefb8e490c33`, AWS job45 all steps SUCCEED, 5 October2026. Actual reviewed12-serving recipe uses compatible food-library matches (full812kcal; one68; two135). Native save/restart and iPhone/iPad/web edits agree, with original steps/source/yield and six cards retained. Final signed binaries and photo-model comparison remain pending. Native wallet refresh after recipe extraction is a separate open display issue; normal10-credit charge is unchanged.

- FatSecret search contract (5 October 2026): v1 foods.search returns summaries, sometimes as a singleton object, without serving nutrition. Resolve exact matching food.get.v2 details before returning a searchable nutrition result. Handle singleton/array servings, keep lookup concurrency bounded and within the HTTP budget, and preserve successful peers when one detail fails. Missing core energy/macros must not become a zero-calorie result; optional fibre/sugar remains null and genuine zero stays zero. Do not invent metric weights from summary prose. `npm run check:food-fatsecret-search` exercises actual provider functions with documented response shapes, no network or credentials. Existing DB-first source ordering, provider plan/region and credit charges remain unchanged.

- FatSecret response-contract source baseline: commit `1be32257f485879f9cdf9a62ef8a511a8f8efd7e`, AWS job46 all steps SUCCEED,5 October2026. Full build/typecheck and actual v1/v2 response fixtures pass; both domains return200. Live Popeyes lookup still showed only a custom sandwich; supplier latency/availability and current AU coverage remain unverified. Do not present this source contract repair as complete provider or Australian-label certification.

- Single-food liquid serving normalization (5 October2026): use the existing shared food density when converting a recorded100g basis to100ml. Unknown density keeps the original gram basis; never assume all drinks weigh1g/ml. Preserve full calculation precision, original source IDs and provider serving options. Missing fibre/sugar stays null, genuine0 stays0. `npm run check:food-liquid-serving` exercises the actual endpoint mapper, original-basis/idempotence checks and reversible milk/oil weight-volume conversions without network or credentials. Existing saved entries are not automatically rewritten. Earlier recipe runtime evidence checks portion/save mechanics; reimported milk-based recipes can have corrected totals after this mapper repair.

- Liquid mapper baseline verified: commit `b57d66c4c6dd7045e1859a64d23a0ff40b2b7c9b`, AWS47 all steps SUCCEED,5 October2026. Actual USDA milk100ml63 web/native; native100g61. Live web Add Ingredient gram conversion/household units and optional-value save remain open; generic preferred milk provenance also remains open. Do not report all food surfaces as verified based on the API fixture.

- Web Add Ingredient portions (5 October2026): use the existing native shared weight/volume converter and density for liquid adjustments. Generic liquid household choices use the account country: Australian teaspoon5ml/tablespoon20ml/cup250ml (cup fractions62.5/125/187.5); existing non-AU fallback remains5/15/240. New web household additions persist the measured ml so later edits/country changes retain the previewed quantity. Recorded provider portions and saved historical measurements retain their own original bases; never globally reinterpret old spoons/cups. Weight ounces remain distinct from fluid ounces. Unknown density keeps only measurements compatible with the recorded basis; never default grams to millilitres. Preserve precise serving ratios and null/true-zero optional nutrients through preview and saved payloads. Empty, zero, negative, invalid or unsupported quantities cannot silently save as one serving. `npm run check:food-web-adjustment` exercises actual calculation, initial unit selection and save functions with synthetic data, without React/server credentials/network. Protected search and rename code remain unchanged.

- Add Ingredient recorded bases: prefer the metric quantity in dual-unit serving labels and keep fluid ounces distinct from weight ounces. An unweighed provider portion retains its stated serving/count basis and cannot acquire invented100g,30g slice or generic household weights. The normal adjustment picker exposes only compatible units; the original serving label/source ID remains intact.

- Web portion baseline verified: `bd957f84f575449f02224d6aec4f5ea0fb85e244`, AWS48 all steps SUCCEED,5 October2026. Live website100g milk61 saves and reopens on iPhone with six cards; oil15ml122 and15g133. Additional optional-value runtime save, invalid-warning placement and preferred-source provenance remain open.

- Food density identity (5 October2026): an ingredient mention is not the density of the whole food. Mayonnaise containing oil, juice diluted with water, eggs containing milk, water chestnuts, concentrated/dry/condensed milk and plant milks retain the recorded source basis unless their own density is known. The shared helper identifies the food itself before applying existing liquid conversion factors; no ingredient-word fallback. Actual endpoint/web/native editor checks cover unchanged source identity, mass-only choices for unknown density and half-portion totals. This does not certify approximate conversion factors or rewrite historical saved entries. Only `native/src/lib/foodUnits.ts` is approved for the shared lock refresh in this repair.

- Saved web food measurements (5 October2026): quantity edits must use the recorded serving basis and compatible weight/volume conversion. Do not relabel an unknown-density gram portion as millilitres or invent generic cup/spoon/serving weights. Recorded provider household weights take priority; fluid and weight ounces remain distinct. Keep precise serving ratios and per-serving nutrient values through unit/serving changes, retain missing optional values and genuine zeros, and reject invalid quantities at both add/update boundaries before persistence. Preserve the existing discrete-food defaults, full-set piece multiplier, name, loading, search, deletion and credit logic. `npm run check:food-saved-measurement` executes the actual page calculation/update/save gates, including milk/oil, count-only provider portions, recorded cups, null nutrients and multi-piece patty/carrot amounts. The previous verified live baseline is `f068fb554e9cfaef7b61385a4af0b70a69186e68`, AWS job49, 5 October2026; runtime validation of this repair is pending deployment.

- Saved weight edit intent (5 October2026): A committed weight amount or compatible weight-unit change selects physical-amount calculation, including historical entries stored in serving mode. Empty/zero/negative/invalid committed amounts must fail both add/update gates before metadata or persistence; they must never silently keep the prior count. Main ingredient-card and weight-modal drafts commit on Done/Enter only; tapping elsewhere discards the draft, preserving the locked input rule. Keep actual input-handler and imported-mode regression coverage in `npm run check:food-saved-measurement`. Baseline `a390b19b5b60aab3b9bc7a696cba48235fed53a6` (AWS50,5 October2026) passed juice50g24 web/iPhone save/reopen, but runtime zero editing exposed this additional validation gap. Native provider-serving override and rounding display checks remain separate open work.

- USDA/native serving override chain (5 October2026): Synthetic volume choices may use only the shared food-identity density helper, never a water/milk/oil word mentioned inside another food. Unknown density retains actual provider gram portions. Native fresh and cached overrides keep full provider options and selected serving IDs through adjustment and save; retaining choices is required even if the selected numbers are unchanged. Preserve precise provider nutrients and optional null/true-zero values. `npm run check:food-native-serving-override` executes actual provider detail/options, native override/cache/open/save, compatible milk/oil conversions and fraction labels without network/credentials. Sized produce/egg count paths, search ordering, names and credits remain unchanged. Baseline `ac234e57d846fd7324bbffaedd3698399b4297bb` (AWS51,5 October2026) still exposed wrong100ml diluted juice in native Add Ingredient; this repair needs same-record live runtime proof. Only native/src/screens/AddIngredientScreen.tsx is approved for the native lock refresh here.

- Single-food source identity (5 October2026): Common milk/plant milk/juice/coffee/oil searches must return the actual matching library/provider record, original source ID, measured basis and serving options. Never manufacture `preferred:*` IDs labelled USDA, fixed liquid calories or optional-nutrient zeros when no source record exists. Requested chocolate plant milk remains eligible; candy and other unrequested variants remain excluded. Preserve existing database-first order, custom/supplier fallback behavior, core-nutrient gates, shared density normalization and precision. `npm run check:food-single-source` executes the complete real endpoint using synthetic provider records, including absent/incomplete records and source order, without network, credentials or server imports. Runtime and signed-release validation remain separate.

- Single milk identity and fallback rules (5 October2026): Milk/plant-milk drink searches cannot use cereal, porridge, bars, meals prepared with milk or a different plant family as the nutrient source. Apply the same whole-food/variant gate before local/custom/supplier result limits and in every USDA fallback/final result path. Matching aliases (soy milk/Soymilk, skim/nonfat, full cream/whole) change search text only; retain original returned names, IDs, precise nutrients, basis and options. Explicit fat percentages must match whole numeric percentages (1% is not0.1% or2%). Incomplete Foundation rows cannot mask a complete same-name Legacy record. Preserve searches explicitly requesting cereal/bar/milk-containing foods and existing packaged search/source ordering. Expanded `npm run check:food-single-source` covers actual full endpoint fallback paths, aliases, incomplete records and source precision with no network/credentials. Baseline320acc0233c4425ac97865a4b015f84f7d99b040 (AWS53) live oat milk returned babyfood cereal; this repair needs fresh live runtime proof.

- Milk identity live baseline: commit82bff8278b833a7c49fbb465fdd9965562219963, AWS54 all steps SUCCEED,5 October2026. Real oat milk replaces babyfood cereal on website/iPhone; USDA2257046 100g48/50g24 and100g save/reopen sixcards with original48.3298kcal precision pass, bothdaily1004/wallet619. New-add source/detail fat precision and real alias/fat-query live coverage remain separate; final signed-release matrix incomplete.

### USDA Foundation energy — 5 October2026

- Foundation calorie import recognizes the declared kcal nutrient IDs1008,2047 and2048. Alternative energy methods are selected deterministically in that order; never take the largest across methods or invent calories from macros. Keep original source precision, genuine zero and missing values. Metadata/aggregation tests execute the actual importer functions without settings/database/network, including an optional original local archive check: `npm run check:food-usda-import -- --archive data/food-import/FoodData_Central_foundation_food_csv_2025-12-18.zip`. Official source: https://fdc.nal.usda.gov/Foundation_Foods_Documentation/ .
- Public Foundation corrections restore only null calories for exact original archive FDC ID/name/100g-basis and matching other nutrients. Verify archive/plan/backup hashes and every original provider value before an atomic update; preserve all IDs, known calories, other nutrient fields and all customer records. No blanket reimport, deletes or zero-fill. The reviewed task55 plan applied230 rows and verified all6250 original Foundation identities/other values unchanged. Original backup remains ignored in data/food-import/repair-backups/usda-foundation-public-library-before-task55-2026-10-05.ndjson, SHA25630db8f0701d21d47a3df89709892a42137ca5c5046471b7f2d0e94d8681c2901. Source deployment/runtime validation is still pending.5874 records have no original usable energy;11 original-macro mismatches were preserved for separate review (10 negative original carbohydrate calculations,1 apple sugar precision). Do not claim all food-source data is now complete.

- Foundation calorie baseline verified: commit74f3ea0e22327fab5eab1d15a456fb6618b559ad, AWS55 all steps SUCCEED,5 October2026; both live domains200/CloudFront.230 exact public null-calorie repairs preserve all6250 provider identities/other fields/customer data. Actual soy unsweetened100g38/50g19 previews and100g38 web/iPhone save/reopen sixcards/source USDA1999630 38.485kcal precision pass, bothdaily1042/wallet619. Remaining5874 original energy-unavailable rows and11 macro mismatches are preserved; invalid core source values, oat-detail precision and final signed-device/store matrix remain open.

### Food source value validation — 5 October2026

- Before selecting a food or provider serving, all four core values (calories/protein/carbs/fat) must be finite, non-negative numeric values. Null, blank text, booleans, objects, arrays and invalid numbers are unknown, never zero. Validate before source deduplication/result limits so an invalid Foundation/custom/supplier/remote peer cannot mask a complete record.
- Public library mapping keeps original identities and measurements but exposes invalid nutrients as null without changing stored rows or customer history. USDA detail requires complete core nutrition and a known standardized basis before generating portion choices. The servings endpoint filters invalid stored/provider options; the actual custom builder validates before rounding so small negative or null nutrients cannot become usable zero portions. Preserve genuine zero and unknown optional fibre/sugar, original provider precision and portion IDs. Existing custom portion rounding/identity rules remain separately under review.
- `npm run check:food-source-values` executes actual library/detail/servings endpoint/custom builder functions with synthetic records; expanded `check:food-single-source` executes the complete real endpoint across all source fallback paths. Five pre-fix failures reproduced; no environment/database/network/AI calls. These are source checks, not signed-release or complete real-food certification.

- Source-value live baseline: commit4b93104e0deec21d71a1fa72be7f080a6e45a671, AWS56 all steps SUCCEED,5 October2026; both domains200/CloudFront/new matchingetagdwy8emuhij1z15. Fresh live water100ml preview retains allsixzero cards; existing diary1042kcal/wallet619 and saved logged-in iPhone soy38/allcards preserved. Invalid values were tested through actual synthetic source functions, not by writing misleading live customer records. Broader food/photo and signed-store matrix remains incomplete.

### Native consumed portion captions — 5 October2026

- New native Add Ingredient descriptions must show the amount actually eaten, not the nutrient denominator: half of a recorded100g portion says50g while the saved item retains its original100g basis,0.5 servings, precise source nutrients, identity and provider choices. Explicit grams/millilitres/weight ounces/fluid ounces remain distinct. Household quantities scale the recorded measured basis; unweighed labels keep a serving multiplier and never acquire a guessed mass. Keep small positive caption amounts positive. Do not rewrite customer history, names, labels, rename handlers, nutrient calculations or credits.
- Actual source/detail/override/open/save coverage in `check:food-native-serving-override` includes50g/200g, small amounts, ounces, milk teaspoons/tablespoons and half recorded239g cups; existing save/failure/consent and native diary/editor/reload checks must continue passing. Only native/src/screens/AddIngredientScreen.tsx is approved for this native UI lock refresh. Full build/typecheck/locks and rebuilt logged-in iPhone newhalf save/reopen with website sync pass: caption50g, original100g/0.5/source2257046 precision/options retained, sixcards24/P0.4/C2.6/F1.4/Fibre0/Sugar1.2, bothdaily1090/wallet619. Exact source deployment validation pending.

- Consumed-caption source baseline verified: commit0cd14c5b6ad1f90134815ab264cc3edebfff6465, AWS57 all steps SUCCEED,5 October2026; both domains200/CloudFront/new matchingetagx51ro2nz3s1z15. Rebuilt signed-in iPhone half50g24/native+web reopen allsixcards/sourceprecision/options pass; bothdaily1090/wallet619. iPadPro13M5 Release39 rebuilt from58 is visually signed in and same11:25 record reopens matching allsixcards, daily1090/wallet619; signed store binaries and broader food matrix remain incomplete.

### Native unweighed original servings — 5 October2026

- Native Add Ingredient must never manufacture100g or generic spoon/weight choices for an original unweighed serving. Keep the original count label and serving multiplier; explicit positive finite provider grams/ml are recorded measurements, including count-only labels. Labelled metric quantities take priority and fluid ounces remain distinct from weight ounces. Switching serving choices must clear a prior measurement when the new choice is unweighed. Missing source serving labels stop add rather than inventing a denominator. Invalid measurement values remain unknown. Unsupported conversions cannot silently become serving counts or reach the save handler.
- Preserve original source identities/choices/precision, measured milk/oil/cups and sized produce/egg paths, allsixcards, optional null/truezero, captions and customer history. `check:food-native-serving-override` executes actual open/selected-option/convert/save paths; existing save/failure/consent and diary/editor checks pass. Only native/src/screens/AddIngredientScreen.tsx is approved for this lock refresh. Full build/typecheck/locks and rebuilt logged-in iPhone actual AU original1serving557/half279 preview/save/reopen with website count/source proof pass; bothdaily1369/wallet619. Existing native >=10g card display rounding is recorded as separate next60; stored amount values are correct. Source deployment pending; no current manufacturer-label or signed-release certification.

- Unweighed-serving source baseline verified: commita41924ccca827b8ea7e08b48ddde94973a0495c9, AWS58 all steps SUCCEED,5 October2026; both domains200/CloudFront/new matchingetag108k58bboc11z15 and fresh live diary1369/wallet619. Logged-in rebuilt iPhone/iPad saved half original1serving279 retains source values/IDs/options, count-only basis and allsixingredientcards. Existing meal-total display rounding is separate next60; manufacturer-label accuracy and signed releases remain unverified.

### Native food result display precision — 5 October2026

- Detailed nutrient grams use the same final one-decimal display as the familiar ingredient cards, including values above10g. Never round stored source nutrients or serving calculations for display. Meal, recipe and favorite-portion totals must use the existing responsive six-card result grid; unknown keeps a dash and genuinezero stayszero. Calories/kJ retain existing energy conversion/display. Keep physical weight/serving/water quantity formatting, daily target calculations, original saved data, rename and billing unchanged.
- `check:food-native-integration` executes the actual screen formatters and actual meal-result JSX with the real shared nutrient card component, both energy units and missing/zero fixtures. Existing missing-nutrient and actual save/failure/consent checks must pass. Only native/src/screens/TrackCaloriesScreen.tsx is approved for this owner-requested food display lock refresh. Rebuilt logged-in runtime and exact source deployment remain required before completion claims.

- Nutrient display source baseline verified: commit51062e1be405b38f0b8e1363b50c0f6c6978e3ad, AWS59 allstepsSUCCEED,5 October2026; both domains200/CloudFront/new matchingetagw3ni0kj30p1z15. Actual rebuilt logged-in Release39 iPhone/iPad same saved half food allsixmeal cards/chips279/P12.3/C22.5/F14.7/FibreMissing/S4.4 match website; daily1369/wallet619. No customer data or quantity-calculation changes. Final signed stores and broader photo/food matrix remain incomplete.

### Native invalid quantity results — 5 October2026

- Native adjustment previews must not turn invalid, empty, zero, negative/nonfinite amounts or unsupported conversions into a fabricated1serving or zero-calorie food. Until a valid positive supported amount exists, show a clear inline correction message, keep allsix colored cards with unavailable values and disable Add. Keep the actual save guard too. A valid zero-calorie food must still display genuinezeros and remain addable; correcting the amount must restore the original precise source-scaled preview.
- `check:food-native-serving-override` executes actual adjustment expressions, the real shared six-card component and actual amount-label/Add-button JSX; invalid, unsupported, validhalf and truezero cases pass. Original provider bases/options/precision, liquid/sized/count paths and actual save/failure/consent checks must continue passing. Only native/src/screens/AddIngredientScreen.tsx is authorized for this owner-requested food adjustment UI lock refresh. Rebuilt logged-in runtime and exact source deployment remain required before completion claims.

- Invalid-quantity source baseline verified: commita4fbfb7ee4c9e14365066a675a153749c87c3a64, AWS60 allstepsSUCCEED,5 October2026; both domains200/CloudFront/new matchingetagkeoe1q180c1z15. Rebuilt logged-in iPhone/iPad actual0/empty warning/sixunavailablecards/disabledAdd and validhalf279 recovery pass; actual water100ml sixzeros enabled. Fresh website reload daily1369/wallet619; no task61 saved entries. This does not certify zero-food save/reopen, photos or final signed stores.

### Native meal-list clock ordering — 5 October 2026

- The main native food list must order each meal category by the time it displays on the entry's declared localDate, matching the website. Older stored UTC timestamps may fall on a different local calendar day; this must not move an earlier displayed meal above a later one. Compute a comparison timestamp only: never rewrite createdAt/localDate, source values, saved history or edited clock times to sort the list. Missing/invalid localDate falls back to the original valid timestamp; invalid timestamps cannot produce NaN comparisons.
- Preserve separate water-list behavior and Favorites added-order/usage ordering. Only native/src/screens/TrackCaloriesScreen.tsx is approved for this food-list lock refresh. check:food-native-integration executes the actual sortedSection expression, including time-zone/daylight-saving fixtures, preserved inputs and unchanged Favorites recency. Rebuilt runtime and exact source deployment must be verified separately.

- Main meal-order baseline verified: commit98a79c5db3f8759a9b52c8a83a230265f9d15d36, AWS61 allstepsSUCCEED,5 October2026; bothdomains200/CloudFront/newmatchingetagw4wxd3vpyu1z15. Rebuilt signed-in iPhone/iPad Water12:48->BigMac11:51->Oat11:25->Oat11:08->Soy10:32 matches freshwebsite; daily1369/915remaining/619 and originalhalfmeal6cards preserved. Readonly10original saved timestamps/localdates/metadata unchanged; no63savedentries. Final signedstores and broader food/photo matrix remain incomplete.

- Australian Add Ingredient measures (task64, 5 October2026): web/native generic liquid labels, preview, unit conversions and save must use the same shared country-aware volume map. Preserve metric bases, exact nutrient values/IDs/options, recorded cups/spoons, unknown nutrients and real zeros. `check:food-web-adjustment` exercises the actual dropdown handler and save; `check:food-native-serving-override` exercises actual source/open/save and both AU and non-AU choices. Scope is new normal Add Ingredient choices; recipe/build/recommended/saved household selection paths require their own evidence. Runtime rebuilt signed-in Release39 iPhone/iPad previews and saved tablespoon reopen pass. Stable source47b5ca0604155c36540ae8e17f43d1b3acb4aa42/AWS62 allstepsSUCCEED/bothdomains verified5October2026. Fresh live AU quarter-cup62.5ml508 oneSave/reopen website and restarted signed-in phone retains exact original source/basis/precision/weight and six cards; daily2040/244remaining/619. Saved-editor household selections and Build a Meal remain separate open work.

- Build a Meal liquid measurements (task65, 5 October2026): carry actual food identity into every liquid amount/unit/recipe-weight calculation. Generic spoons/cups are region-aware volume, not produce aliases; measured grams/ml require known food density or recorded paired provider quantities. Unknown density must not silently become1g/ml or allow a partial recipe weight to masquerade as full weight. Bare unmeasured liquid portions remain original count-only servings. Both save paths persist physical ml/g with original source/basis/precision/options; reopening conserves recorded eaten servings and never rewrites history automatically. `check:food-builder-measurement` executes actual handlers/import/save mappings/hydration and runs in prebuild. Stable source34c0db913ff4999c51e7e8f927401a3071bc197b/AWS63 allstepsSUCCEED/bothdomains verified5October2026. Actual measured mixed halfmeal60.7g/112kcal with unknown fibre oneSave/reopen website and restarted signed-in iPhone allsixcards/daily2152/wallet619 PASS. Original liquid source bases/options/precise nutrient values retained. Saved portion metadata precision and existing opening-time autosave behavior require separate investigation; this does not certify final photos/model/signed stores.

- Saved Build a Meal integrity (task66, 5 October2026): existing meal hydration is read-only, waits for its original time and loads saved scale together with the row. Automatic saves start from the loaded editable-state baseline; genuine edits, including nutrient edits to restored drafts, remain saveable. Restoring a draft by itself is read-only; explicit Save remains available. Preserve original exact timestamp unless the user changes its clock. Store precise full/portion weights and ratios; round only displayed values. Keep the historical saved scale until a user changes portion, then use measured full weight rather than rounded historical metadata. `check:food-builder-saved-state` executes actual effects and both save metadata mappings; Stable final source1b8cb1864eaaff10615b473a2901645cd3b11cab/AWS65 allstepsSUCCEED/bothdomains verified5October2026. Actual restored-draft opening leaves all20foodrows unchanged; full/double/half exact weights and original timestamp survive normal autosaves. Final website/restarted signed-in phone112/all6cards/daily2152/619 and unchanged reopening hashes pass. Root manual-refresh timestamp cache, photos/model and signed stores remain separate open work. Never migrate or rewrite historical records automatically.

- Saved diary timestamp refresh (task67, 5 October2026): the manual-refresh no-change check must compare createdAt, displayed time and localDate as well as original nutrient/item values and IDs. A saved clock edit must replace stale client metadata even when nutrition is identical; unchanged metadata must retain the no-update path. Compare only; never rewrite saved timestamps or historical dates automatically. Preserve the existing manual-only trigger, pending saves, deletion tombstones, identity linking, duplicate cleanup and same-date energy summary. `npm run check:food-diary-sync` executes the actual root comparator and is required in prebuild. Stable source0b496bf2387e0cb713f6abe292912e251a3ddf91/AWS66 allstepsSUCCEED,5October2026; bothdomains200CloudFront/newmatchingetag175tao6e1hw1z15. Normal live manualRefresh14:22->14:26 and reopened halfmeal112/all6cards pass; daily2152/132remaining/619 and all20savedFoodLog rows/hash unchanged. No Save/Update or migration. Fullsignedstore matrix remains open.

- Saved-editor regional household measurements (task68,5October2026): new generic liquid choices use shared liquidHouseholdMl country values, while explicitly recorded provider cup/spoon weights remain authoritative. Existing untagged selected household amounts retain their original interpretation and selected label until a user changes units. New choices carry temporary selection country for exact conversion; normal add/update saves canonical measured grams/ml and removes the temporary country, preserving original source IDs/options/nutrient bases/precision and eaten servings. Stored serving-count entries with no explicit physical input may convert using their recorded base and valid saved count; explicit invalid physical edits remain blocked. check:food-saved-measurement executes all actual root dropdown expressions, handlers and both storage mappings. Source/full-build/locks/protected checks pass; exact live save/reopen/phone verification pending. No historical migration or rename/credits changes.

- Saved-editor cup-fraction captions (task68 follow-up): express total cups unambiguously (one quarter-cup=0.25 cup; two=0.5 cup), never concatenate a count with 1/4 cup as though it were a mixed number. Apply this only to both actual total-amount captions; measurements and metric labels remain unchanged. Actual JSX fixtures reproduce the old misleading label and verify fraction counts; live follow-up verification pending.

- Task68 final stable source b353089270651a4c42dda4aa9b0f583a2f925957/AWS68 allstepsSUCCEED, both live domains verified5October2026. Actual AU quarter-cup0.25cup/62.5ml508 and original20ml tablespoon163 normal Save/web-restarted-iPhone reopen/all6cards PASS; original source/basis/precision/options and other19rows retained. Canonical saved20ml/.2 removes temporary country; reopening all20hash unchanged. Exact seconds preservation on root explicitSave is a separate open issue; do not claim it fixed here.

- Root saved-editor exact time (task69,5October2026): normal Update must preserve the original exact createdAt string, seconds and calendar date when the displayed HH:mm has not changed. Use the same local clock interpretation as editor initialization. Only an explicit different clock recalculates against original entry localDate (selectedDate fallback); keep existing missing/invalid timestamp behavior. Never rewrite history on opening. check:food-saved-time executes the actual updateFoodEntry timestamp calculation across Melbourne/LA/UTC/DST and runs in prebuild. Source/fullproductionbuild11813exit0/protected/root278native79 pass; runtime and deployment pending. Rename/serving/nutrients/credits/manual-refresh untouched.

- Task69 stable source684f16091936c5ee057e51d406c70cb77cf26856/AWS69 allstepsSUCCEED, both domains verified5October2026. Unchanged normalSave all20rows/hash unchanged. Genuine half31.25ml254 and restored62.5ml508 normalSaves preserve exact original02:54:56.548Z/source/basis/precision/options; website/restarted signed-in iPhone39 both amounts/all6cards/clock13:54 pass. Other19rows untouched; reopening all20hash unchanged. Restored physical input legitimately records portionMode=weight; original quantity/nutrients/time retained. Native/source/rename/credits/manual-refresh unchanged. Full photo/model and signed-store checks remain open.

- Recommended ingredient measurements (task70, 5 October2026): use the shared recorded serving basis, food-identity density and account-country household measures. Recorded provider cups/spoons take priority; explicit metric amounts in dual labels remain authoritative and fluid ounces stay distinct from weight ounces. An unweighed tsp/cup/piece/serving retains its original count and source label; never invent100g or a generic household weight. Compatible unit changes conserve the exact committed serving count, even after repeated changes or an unfinished amount draft; round only nutrient display. Preserve explicit measured sized-food options, optional null/true-zero sixcards and the existing intentional zero-ingredient removal behavior. `check:food-recommended-measurement` executes actual component/hooks/amount/dropdown handlers in prebuild without network/credentials. Generate-first/history/Recipe Import handoff, credits and save metadata remain unchanged. Previous verified source684f16091936c5ee057e51d406c70cb77cf26856/AWS69; source70/live runtime proof pending.

- Task70 stable sourcec199981d6e6224fe4e138ec583eacea1c3d57ced/AWS70 allstepsSUCCEED/bothdomains verified5October2026. Actual Generate-first/history-rendered oil originally1tsp retains original count-only basis; half/full/double20/40/80kcal, measured chicken120g198↔weightoz and60g99, allsixcards and restoredmeal429/credits619 PASS. All20saved rows and stored history hashes unchanged. Provider/density/regional cases are actual synthetic component fixtures, not newly generated/live model certification. Parent missing-value and one-decimal rounding discrepancies remain separate open work.

- Recommended meal nutrition integrity (task71, 5 October2026): sum original ingredient values at full precision using the shared optional-nutrient functions. Missing/invalid nutrients remain null through generation/normalization, meal sums, diary context, both save paths and committed history; genuine0 stays0. An intentionally removed0-serving ingredient contributes0, while an unknown eaten ingredient cannot produce a smaller apparently complete total. Empty recipes and incomplete energy/protein/carbs/fat fail both UI save boundaries and history commit before writes; Build this meal remains available to find real matching foods. Preserve recipe/reason/source item precision/amounts and original IDs/bases, Generate-first, history and Recipe Import/credit code. Allsix cards remain; use the same Math.round display rule for the parent summary/progress/card so7.35 displays7.4 consistently. `check:food-recommended-nutrition` runs actual parent/server calculations, normalization, both save handlers and history commit with synthetic HTTP/DB/account state only, no network or credentials. Only RecommendedIngredientCard needs a UI lock refresh; native unchanged. Stableb4ad81b527ea58c55617a103f2f704289a09c3f7/AWS71 verified5October2026 allstepsSUCCEED/bothdomains200CloudFront/newmatchingetag11odfi3i2lr1z15. Fullbuild60680exit0/protected/278+79locks and actual live330save/web-iPhone39 sixcards/reopen/daily2482/619 pass; original20rows unchanged and reopening21rows/history unchanged. Live missing-value recommendation remains unproved; synthetic actual-function tests cover that path.

- Packaged local query before limit (task72,5October2026): the prefix-mode query must match every typed product word before its row limit, including the fourth/later word and active partial word. Retain brand/name word matching in any order and the20-row bound; unrelated broad brand-prefix rows cannot crowd out the exact product. Existing single-food prefix-contains behavior, source order, endpoint protected sorting/filtering/UI, original nutrient bases/precision/options and customer history stay unchanged. `check:food-packaged-local-query` executes the actual local function and full endpoint with in-memory Prisma/provider fixtures only, no network/credentials. Read-only actual production query reproduces missing2317111/2317301 before repair and finds both after; fullproductionbuild16851exit0/protected/278+79locks PASS; live proof pending. This is source identity/search repair, not current manufacturer-label certification; do not rewrite historical food records based on different-barcode products.

- Task72 stable source1d1565a719bb921b033a3eca1b7d494ec474baf5/AWS72 allstepsSUCCEED/bothdomains200CloudFront/newmatchingetag87xz4031981z15 verified5October2026. Fresh normal packaged query finds originalUSDA2317111; website/restarted signed-in iPhone100g636/30g191/original20g127 previews allsixcards pass. One normal website30g Save17:38 reopens191/all6cards on both, daily2673/619; original21rows unchanged and opening22hash unchanged. Storedfat16.05/source20g/1.5count/30g retained, but recomputed display rounds16.049999999999999 to16; separate display follow-up required. Current manufacturer-label/barcode/source metadata/photo/model/signedstores remain open.

- Saved website ingredient decimal display (task73,5October2026): retain original multiplied nutrient precision through totalsByField and round only in formatMacroValue. Ties such as10.7x1.5 must show16.1 consistently with stored16.05/new-portion preview; tolerate only floating-point-unit noise, never broadly round nearby real values upwards. Keep allsix colored cards, missing versus0, kcal/kJ, original source/basis/amounts/save precision/time/history and protected controls. check:food-saved-display executes actual source calculations/card JSX; only app/food/page.tsx lock authorized. Fullbuild45827exit0/protected/root278native79 pass; exact deployment/live pending. Native equivalent remains open separately.

- Task73 stable source8a020a0b533ca51f7db6059c18883b838deee85d/AWS73 allstepsSUCCEED/bothdomains200CloudFront/newmatchingetagzcs3p7lh4k1z15 verified5October2026. Actual fresh saved30g191 webingredient6cards nowP8.1/C3/F16.1/Fibre1.8/S1.2, kcal/kJ798 switch and clock17:38/daily2673/619 pass. Opening-only all22rows/hash unchanged, storedfat16.05/original20g/1.5source retained. Native equivalent remains separate next74; no native source changes. Current labels/model/photos/signed stores remain open.

- Native nutrient display ties (task74,5October2026): round only presentation of original multiplied values with floating-point-unit tolerance, consistently in NutrientCards, formatNutrientGrams and the actual editable ingredient nutrient field. Preserve all six colored cards, unknown versus true0, original phone/tablet layout, kcal/kJ, original nutrient calculations/bases/options, timestamps, saved history and onChange/save behavior. Only native/src/components/NutrientCards.tsx and native/src/screens/TrackCaloriesScreen.tsx approved for lock refresh. check:food-native-display executes actual source meal sums, summary labels, field JSX and six-card component with synthetic widths/data only, no network/credentials/writes. Final productionbuild93861exit0/native typecheck86640/protected/root278native79 and rebuilt signed-in Release39 iPhone/iPad allsix meal/ingredient cards/fields agree191/P8.1/C3/F16.1/Fibre1.8/S1.2; original20g/30g/time17:38 and all22opening hashes unchanged. Exact source deployment pending; source baseline8a020a0b533ca51f7db6059c18883b838deee85d/AWS73. Signed stores and broader label/photo/model checks remain open.

- Task74 stable source5d71534d784b815d6abe56ff8fccb5cdde151e8d/AWS74 verified5October2026, allstepsSUCCEED/bothdomains200CloudFront/newmatchingetagyhauq0j4az1z15. Rebuilt signed-in Release39 iPhone/iPad all6meal/ingredient cards, summary and actual editable fields agree on original20g/30g191/P8.1/C3/F16.1/Fibre1.8/S1.2; fresh website agrees/time17:38/daily2673/619. No Save/Update and all22saved-row/source hashes unchanged. Native energy/missing/truezero variants are actual-source fixtures only for74; broader runtime/signedstore/model proof remains separate.

- Original supplier serving choices (task76,5October2026): standalone Add Ingredient must carry normalized full servingOptions and selectedServingId through a fresh provider override, cache hit, opening and the existing save. Do not discard original metadata merely because selected nutrient numbers are unchanged; honor supplied selected id before fallback. Preserve complete core nutrients, unknown optional versus true zero, original source/precise basis and serving count. check:food-web-adjustment executes actual fetch/cache/open/Serving-size handler/save with synthetic provider state only, no network/credentials/writes. Old source FAIL/new source and full production build57105exit0 PASS; root278/native79/protected pass and no lock hashes changed. Original22 rows unchanged before release; exact live Save/reopen pending. Recorded household unit precedence is a separate follow-up, not certified by this repair.

- Task76 stable source1da712c85be4e9e7b7e49f1fd68e8ef7c2b3a9fa/AWS75 allstepsSUCCEED/bothdomains200CloudFront/newmatchingetaglzztsllqj31z15 verified5October2026. Fresh recorded158g cup205/half103,100g half65 and one normal halfcup Save/reopen web and restarted signed-in iPhone39 allsixcards/fields/time19:09/daily2776/619 pass. Four returned serving options/selected original id retained; original22 unchanged and23opening hash unchanged. Conflicting syntheticcommon180g cup/90g halfcup still require source-generation repair; saved Weight caption.5g requires separate hydration/display review. No silent migration or historical rewrite. Model75 and signedstore matrix remain open.

- Recorded household serving precedence (task77,5October2026): USDA appendCommonFoodServingOptions and appendLiquidServingOptions must not add generic cups or tablespoons beside a measured original choice for that household unit. A fractional recorded cup defines the same family. Preserve every genuine provider option, including differently prepared cups, exact original nutrient/source/metric quantities and missing/zero. Preserve metric and no-recorded-measure fallback behavior. No historical saved options or library records are rewritten. check:food-source-values executes actual provider generation; native provider/open/save extractor includes the helper. Old actual provider FAIL3cups versus1/new source/fullbuild29625exit0 and protected/root278native79 PASS, no UI/native application edits or lock hashes. Exact new live lookup still pending; saved Weight hydration remains separate.

- Task77 stable source746ef5aa3bcb61549af4538d833e5ee457e07aff/AWS76 allstepsSUCCEED/bothdomains200CloudFront/newmatchingetag16qjel2uqms1z15 verified5October2026. Fresh web/signed-in Release39 iPhone originalrice168878 chooser only100g/cup158g/full205/half103/all6cards; no generic180g/90g. Preview-only/no Save; all23history/source/library unchanged. Original milk/spoon precedence covered by actual provider fixtures only. Stored historical choices preserved; saved selectedserving unit rendering requires separate78. Native offscreen6thresult ref hit Settings; no setting changed, exact query with first visible result used for final proof. No signedstore/model certification.

### Saved serving unit display — 5 October 2026

- A saved amount expressed in `serving` must retain that selected option in every Weight selector, including ingredients with a measured recorded serving. Never let a browser fall back to `g` while the number still counts servings. Label the serving with its recorded gram/ml basis when known; count-only portions remain count-only.
- Opening the selector must preserve amounts, precise nutrients, original supplier serving IDs/options and historical records. Switching the measured half-cup rice serving to grams remains 79 g and 103 kcal. The actual three JSX selectors and update handler are covered in `scripts/food-saved-measurement-check.ts`; root food-page scope is owner authorized.
- Stable verified source: `57faa2e9249368f6db0ffd02ead7c8fafd482dda`, AWS job 77, BUILD/DEPLOY/VERIFY SUCCEED, 5 October 2026. Fresh normal saved editor shows 0.5 serving — 158 g, all six cards and 103 kcal; switching to g gives79g with identical totals, cancelled without Save. Original23 records/hash, time, daily totals and credits unchanged. Final signed-store checks remain pending.

- Food-card color consistency repair (5 October 2026): root `ITEM_NUTRIENT_META` must match shared/native nutrient meanings: green carbs, purple fat, yellow fibre. All six cards, labels, quantities and nutrition remain unchanged. Stable verified source `14656ae8dd07b3968d60c5cfeb359cc431f0fe2b`, AWS78 BUILD/DEPLOY/VERIFY SUCCEED,5October2026. Fresh normal saved rice editor shows six expected colors and unchanged103/P2.1/C22.3/F0.2/Fibre0.3/S0, with0.5serving—158g retained; cancelled/no Save,original23/history hash/time/daily2776/619 retained. Final signed store checks remain open.

### Provider-declared nutrition errors (2026-10-05, task80)

- OpenFoodFacts records with `data_quality_errors_tags` beginning `en:nutrition-` must not become usable packaged search or barcode results. Do not repair ambiguous source columns or substitute guessed nutrients.
- Preserve ordinary warnings, non-nutrition errors, source precision, genuine zero and unknown optional values. Reliable shared/private records and exact-barcode alternate providers remain available. If none remains, the existing422 label-photo prompt retains product identity and the rejected result is not charged. No stored barcode or diary records are rewritten.
- Regression: `npm run check:food-provider-quality` executes the actual source mapper and barcode endpoint using the recorded public Weet-Bix response, which reports a nutrition error and conflicts with the current manufacturer/Coles label. Full production build runs this check.
- Stable source8d054eb05e4861739234b17b752b34da033085fb/AWS79 allstepsSUCCEED, bothdomains200CloudFront/newmatchingETag9qtlyj2wyl1z15 verified2026-10-05T09:36:04UTC. Actual regression/fullproductionbuild78219exit0/protected/root278/native79 PASS. Fresh normal web/iPhone39 lookup rejects recorded faulty Weet-Bix data and requests label details; cancelled/no Save, original23/hash unchanged and daily2776/616credits retained. Current label reference was not substituted; no universal provider/photo calorie accuracy claim.

### Required barcode nutrients (2026-10-05, task81)

- Final canonical barcode results require usable calories, protein, carbs and fat through `hasCoreFoodNutrition`. `Number(null)` or `Number(blank)` must never mark missing data complete. Reject with the existing422 label prompt before accepting/charging a product.
- Preserve genuine zero, original source precision and large valid kcal values; missing optional fibre/sugar stay unknown. Do not rewrite stored source records or alter wallet/credit-manager behavior.
- `npm run check:food-provider-quality` executes the actual final normalization/GET with192invalid/missing-core cases across4source tags and valid zero/unknownoptional/precision/largeenergy/alternate-source cases. Source fixtures and strictcheck/fullproductionbuild13679exit0/requiredchecks/protected/root278/native79 PASS. Exact deployment/runtime pending. Previous stable8d054eb05e4861739234b17b752b34da033085fb/AWS79 on2026-10-05.

- Task81 stable source da5568bd5e47f3d849f2e5d65a16c51d52dd5863/AWS80, BUILD/DEPLOY/VERIFY SUCCEED,2026-10-05T09:55:14UTC; bothdomains200CloudFront/newmatchingETag hk49ddsb4w1z15. Fullbuild13679exit0/protected/root278native79 PASS. Native valid barcode displays truezero and unknownfibre correctly; web mapper falsezero remains separate82. Cancel/noSave original23/source unchanged; positive lookups charged3each, nativewalletrefresh not verified. No manufacturer/signedstore/model accuracy claim.

### Web barcode canonical mapping (2026-10-05, task82)

- buildBarcodeIngredientItem must preserve missing/invalid nutrients through optionalNutrient; genuine0 remains0 and original precision is retained. Allsix colored cards remain. Preserve brand/barcode identity/detection metadata, original records and barcode rename callback.
- Keep the exact original serving label and declared gram/ml basis. A liquid name cannot relabel100g as100ml with unchanged nutrients. An explicit volume label takes precedence over quantity_g compatibility data; a quantity without a volume label stays grams. Do not change the scanner engine, lookup chooser/routing, protected rename code or wallet.
- check:food-barcode-mapping executes actual source mapping/totals with105offline cases and runs in fullproductionprebuild. Actual baseline46cases fail; new105PASS plus existingmissingnutrients/protected/root278/native79 PASS, onlyfoodpagehash refreshed. Fullbuild/exactlive/normalruntime pending; last stableda5568bd5e47f3d849f2e5d65a16c51d52dd5863/AWS80.

- Task82 finalproductionbuild87375exit0/allrequiredchecks/strictregressiontypecheck/protected/root278/native79 PASS. Onlyapprovedfoodpagehash refreshed; actual105casesPASS. Exact source deployment and normal browser verification pending.

- Task82 stable source906e68ac649051cd0ba90d7bcdc924f3aed94030/AWS81 allstepsSUCCEED, bothdomains200CloudFront/newmatchingETag b0xppesrh61z15 verified2026-10-05T10:20:16UTC. Freshnormalwebprivate100gbarcode all6cards/unknownfibre—/truezero correct, original23/source/hash unchanged, cancelled/noSave/daily2776. Positive3credit lookup/freshwallet607; immediatewalletrefresh remains guardedfollowup. Dailypreview optionalcompleteness next83; native unchanged/unitsfixturesonly/no currentmanufacturer orsignedstore/model accuracyclaim.

### Preview daily nutrition completeness (2026-10-05, task83)

- computeOverallMacrosAfterAddingFavorite must retain optional fibre/sugar unknown through every existing day entry and proposedmeal sum. A partial knownsum is not a complete day total. Genuine0 remains0; an empty day contributes known0. Preserve original precision, source/history, core totals, actual daily targets and exercise adjustments.
- DailyMacroSummary must retain missing optional rows and show—/Incomplete data; no numericprogresspercentage or remainingamount when unknown. Keep all six ingredientcards and existing colors/controls/targets. Onlyfoodpage and DailyMacroSummary UIlock refresh authorized; no HealthSetup/goal/caching/credit/native changes.
- check:food-daily-preview executes the real parent and ReactsummaryJSX offline; HEAD30of33fail/new33PASS including zero, knownprecision/source and exercise. Fullbuild/exactdeployment/runtime pending; laststable906e68ac649051cd0ba90d7bcdc924f3aed94030/AWS81.

- Task83 fullproductionbuild91930exit0/allrequiredchecks/strict/protected/root278native79 PASS;33actualparent/componentcasesPASS and105barcodemappingcasesPASS. Onlyfoodpage+DailyMacroSummary lockhashes refreshed. Exactdeployment/normalruntime pending.

- Task83 stable source3638e308ef1db0c7959a0c2fb67feba2eb38945e/AWS82 allstepsSUCCEED, bothdomains200CloudFront/newmatchingETag13u9azx1oo91z15 verified2026-10-05T10:35:36UTC. Fresh normalprivatebarcode preview all6cards/unknownfibre/truezerofat anddayfibre/sugarIncomplete data/—percent/emptybarsPASS; coretotals2864unchanged. Cancel/noSave original23/source/hash/daily2776preserved; positivecheck3credits/fullreload604, immediatewalletstale607guardedfollowup. Emptydayoptionalzero/exercisevariantsfixturesonly; nativeunchanged/no signedstore/currentmanufacturer/modelaccuracycertification.

### Food model comparison references (2026-10-05, task84)

- Both5.6Sol/6.1Sol must receive identical unmodifiedphoto bytes/prompt and repeated permodel timing. The2Nutrition5k photos have matchedsource IDs, originalingredientdensity and total checks, sourceSHA/CRC, visualreview, officialtestsplit andCC-BY4.0 attribution. Benchmarkmodel input is only the anonymouspublicphoto URL; never include referenceweights/calories as answers in theprompt or filename.
- Score those2cases against recordedweights/USDAannotations; do not call them calorimeter measurements, guaranteedunseenbyOpenAI models or generalaccuracy certification. Hidden oil is not a missed visible ingredient. Fibre/sugar truth is absent; do notinvent it. Preserve the4unweighedchallengingphotos/visibilitychecks separately.
- Plan6photosx3repeatsx2models=36actualadminUI/servercalls;0run until existingadmin sign-in completes. No directOpenAI/key scripts and no productionmodelswitch beforeactualresults. Staticasset exactdeployment pending; application/native/source/history/credits unchanged.

- 5October2026 task84 reference assets verified LIVE at e295b3b38f62372b065e2b6c7eac1d1cb11330d4/AWS83 (10:56:43UTC): all6comparisonphotos+CC-BY4.0 attribution200/exactSHA. Two recordedweight/USDAreferenceplates only; never describe them as laboratorycalories/unseenmodels or invent fibre/sugartruth. Comparison36actualUI/servercalls remainsNOTRUN/adminrequired; no source/model/native/credit/DB changes.

### Counted food portion integrity (2026-10-05, task87)

- Item nutrition is for the complete serving label. An already complete "3 eggs" portion must not be multiplied by three again. Align a differing explicit egg count using requested count / existing structured count; a weight-only portion is insufficient evidence for per-egg scaling. Keep missing nutrients missing and known zero unchanged. Refresh response totals after a changed count and scale the associated recorded portion weight once.
- Discrete macro checks use pieces per serving, never total pieces across multiple servings. Values already representing a smaller complete portion must not be multiplied as if per piece. Preserve the legitimate explicit single-egg undercount repair and existing photo freshness/AI-only ingredient flow.
- `check:food-egg-count` runs the actual route helpers offline, without keys/AI/server calls, and is required in prebuild. Oldsource reproduces250->750; repairedfixtures preserve250/809wholemeal, support210single-to-three exactlyonce, doubledservings500, unknown/zero and immutable inputs. Fullproductionbuild85829+80559exit0/finalprebuild60480exit0; exactlive pending; lastverifiedlivee295b3b38f62372b065e2b6c7eac1d1cb11330d4/AWS83. No native/credit/model/rename change.

- Task87 same scaling loop must use foodNumberOrNull for each nutrient: multiplying an absent fibre/sugar value must never create zero. The actual undercount fixture reproducesnull->0 before this refinement and passes afterwards. Fullfinalproductionbuild94192exit0; exactfinaldeployment/normalUIretest pending.

- Task87 complete-chain rule: upstream normalizeDiscreteItems can seed a prose count without changing a singular serving label or already complete nutrition. For example140kcal/P12/F10 with "1 egg" and analysis "two eggs" must remain140, not280. Count-enforcement scaling requires smaller-portion nutrition evidence as well as a differing explicit label. Check the real upstream-normalization/harmonization/enforcement chain; knownwhole3egg250 andreal single70->three210 must remain idempotent. Fullproductionbuild14268exit0; exactfinaldeploy/runtime pending.

- Task87 stable counted-food source2c5a023ee6fd519c00d06c4e633808eb6e8ef257/AWS86 allstepsSUCCEED/bothdomains200CloudFront/new matchingETagcob4f0rjyn1z15 at2026-10-05T11:50:39UTC. Actual normal UI hardbreakfast freshrequest200/13.917s/UI15s preserves3egg216/150g, allsix ingredientcards, prose/items/API/UI totals781. Normal10credits584->574, no review/save/original23hash unchanged. Model output is a new estimate (reference555.304), so no generalaccuracy or exactbefore/after calorie improvement claim. Overall photo-summary sixcards still require88.

### Overall food-result nutrient cards (2026-10-05, task88)

- The common food-result summary must render all six existing colourful nutrient cards whenever nutrition totals or analyzed ingredients exist. Do not restrict them to an expanded ingredient, a photo, an editing mode or a viewport. Unknown totals still show all six cards with—; known zero remains0. Keep the existing energy toggle/chart/controls and source numbers.
- Use the existing shared NutrientCards with raw analyzedNutrition (or an empty object for genuinely absent totals), not invented defaults or derived model nutrition. The new render must not modify items, stored amounts or analysis/credit/history flows.
- check:food-result-cards executes the actual common JSX and existing card component for32renders plus empty pre-analysis state. Oldsource lacks the block/newsource passes. Fullproductionbuild7874exit0/protected/root278native79 PASS; only app/food/page.tsx lockhash refreshed. Exactdeployment/runtime pending; stablecalculation source2c5a023ee6fd519c00d06c4e633808eb6e8ef257/AWS86.

- Task88 stable843f104506122675e47862a9642fbffcdd913d51/AWS87 allstepsSUCCEED/newmatchingETaguudgurwxc11z15 verified2026-10-05T12:08:25UTC. Actualphoto common6cards962kcal/4025kJ, saved88/Fibre—/Fat0 desktop+phone390x844 and water6zeros passed, all23/hash/daily2776 unchanged/noSave/wallet564. Existing phonechart false0 for unknown fibre and finalphoto prose885 versus962 are separate queued issues; not certified by card display repair.

### Final Food Analyzer summary (2026-10-05, scope89)
- After every existing portion/label/final-item correction, synchronize the standalone meal nutrition summary with the final structured total. Keep photo observations and ingredient/label amounts, missing versus knownzero, source precision and all six result cards. Format only presentation; do not alter nutrition, model, credits, providers, history or add an AI request. The existing single-line Calories/Protein/Carbs/Fat format stays intact; append fibre/sugar with unknown where absent.
- check:food-analysis-summary runs the actual pure formatter and checks its final-route placement, including the actual prior885 prose versus962 structured result, unknown/zero, decimal ties, markdown and immutable/idempotent values; it never loads server/OpenAI credentials. SourcePASS/fullbuildrunning, exactnewlive pending.

- Scope89 stableccbfeca42d57523e1b1312c58d68037abf434fef/AWS88 allstepsSUCCEED/newmatchingETagj67tcuxv9b1z15 at2026-10-05T12:37:53UTC; normalfreshphoto200/11.768s/UI12s allwritten/structured/cards1053 agree, whole3egg250 retained, desktop+390pxphone6cards. NoSave/original23hash/daily2776 unchanged/wallet554. This is summary consistency only: known fresh fruit wrongly enriched from dried/canned records is a separate priority90 repair.

### Photo ingredient food-form identity (2026-10-05, scope90)
- Database calibration/fill may use only a compatible preservation/processing form as well as original food identity, preparation, brand and measured basis. Plain pineapple must not use dried2709210; plain strawberries must not use canned2709284. Reject unrequested dried/dehydrated, canned/tinned, juice, puree, powder, concentrate, candied/sweetened/syrup, preserves or pickled forms. Explicit matching forms remain supported. If no compatible record exists, preserve the AI estimate and estimated-portion provenance instead of borrowing different food.
- check:food-provenance executes the actual shared gate and actual route calibration offline, including live recorded wrong supplier identities, original null/zero, raw/cooked/brand/unit compatibility, immutable input and matching-form controls. No network, server keys or database writes. SourcePASS/fullbuild88070running/exactlivepending; native/shared preparation/UI/model/credit logic untouched.

- Scope90 stabled41e5e1761875806ea881d9bf6eeaec4b1b38b97/AWS89 allstepsSUCCEED/bothdomains200CloudFront/newmatchingETagdr14xs0otj1z15 at2026-10-05T12:52:58UTC. Normalhardmeal200/12.644s/UI14s pineapple41/strawberries27 retain AI-estimate provenance; no dried/canned substitution, whole3eggs250 and all6cards/summary819 preserved. Cancel/noSave/all23hash/daily2776 unchanged/wallet544. Controlledwrong-source regression passes; modelportions still differfromrecorded555.304, so no generalphotoaccuracy/new-model claim.

### Result-chart missing nutrients (2026-10-05, scope91)
- Chart labels and centre energy must use original nullable result totals, independently of drawing-only zero fallback segments. Unknown fibre/sugar/energy stays—; genuinezero stays0. Apply to both desktop editing-photo and common photo/phone layouts. Preserve existing ring drawing/colors/controls and all six cards; never change stored nutrition or amounts to repair presentation.
- check:food-result-chart executes both actual IIFE JSX branches56cases, known/missing/zero/invalid, kcal/kJ, editing flags and immutable source; no network, statefulapp, writes or AI. Baseline actual saved-sauce screenshot and regression fail with unknownFibre0; source56PASS. Fullbuild25047running; onlyapprovedfoodpage lock changed/other277 unchanged/native79PASS. Exactlive pending.

- Scope91 stable78e482180eb79e518a92e502f2448527bf1c7994/AWS90 allstepsSUCCEED/bothdomains200CloudFront/newmatchingETag9gnn8inudz1z15 verified2026-10-05T13:05:30UTC. Actualsaved5October sauce390pxphone88kcal/368kJ showsfibre— inbothcard+chart, genuinefat0 preserved; savedwater all6card/5chart/energy0. Cancel/noSave/noAIcost/all23hash/daily2776/wallet544 unchanged; viewportrestored. Fullbuild25047/56renders/protected/root278native79PASS. Otherbranch/unknownenergy remain actual-sourcefixture evidence, not fabricated saved data; fullsignedstore/model goal unfinished.

- 6 October 2026 AU / scope93: restaurant manufacturer reformulations must update the exact public catalogue serving and its durable CSV source together. Preserve saved meal history, private corrections, serving identity, unreported fibre/mass, and all other foods/countries; do not run broad sync as a one-row repair. Stable source837244c49e0fc60cffe51de12e519be47ef5062b/AWS91 verified13:26:29UTC. ActualAU BigMac currentofficial621/P28.7/C46.5/F34.4/S8.0; whole/half/double621/311/1242sixcards and fibre— passed. Other8259customrows/original23FoodLogs/hash/day5daily2776/wallet544 retained.

### Food search category request efficiency (6 October 2026 AU, scope95)
- The standalone Add Ingredient query effect owns a search when the category changes. Do not also start the identical full request from that category button: the normal AU YoPRO Vanilla check reproduced two calls 98 ms apart, with the first aborted after supplier work had started. Tapping the current category must still refresh. Preserve the existing 90 ms search effect, quick local results, source selection/ranking, all nutrient cards, supplier budgets, saved history and credits. Only the standalone search UI region hash was refreshed; all core and other UI hashes remain intact. Source/protected/root278/native79 checks passed; exact live proof follows.

- Scope95 stable e05cb39438f70338f2d3a6caab50e527270e3347/AWS92 verified13:54:37UTC 5October2026 (6OctoberAU): allstepsSUCCEED/bothdomains200CloudFront/newmatchingETag11tojtnw7fq1z15. Actual normal AU YoPRO Vanilla four category-change/current-refresh cases each one full+one local request/HTTP200/no failure. The two packaged timings3.221s/2.729s versus prior4.388s are individual observations, not a general latency claim or paired model benchmark. BigMac621/all6colours/Fibre— intact, Cancel/noSave/noAIcost/all23hash/daily2776/wallet544 retained.

### Remembered admin browser session (owner request, 6 October2026 / scope102)

- The owner explicitly asked that the Helfi admin panel not log out merely because time passed. Keep signed, seven-day access tokens; normal API verification must still enforce expiry. Only the refresh route may renew an expired access token after signature/algorithm/claim checks and a current active AdminUser lookup. New remembered sessions have no idle cutoff and bind to a keyed credential/role/email version; changing password/role/email or disabling the account rejects renewal. Legacy tokens migrate only within the previous30-day window. Never remove password/authenticator login, grant roles, seed sessions, or log secret/token values.
- Prefer the current local remembered session over an older per-tab session. Refresh on page load, active-page hourly renewal, return/focus/online; synchronize other-tab login and explicit Logout. Network, timeout and5xx failures retain the current session. Only actual401/403 or explicit Logout clears it. Delayed responses cannot overwrite/clear a newer sign-in or resurrect a signed-out session.
- `npm run check:admin-session` uses synthetic offline credentials only and verifies long idle renewal, seven-day API expiry, credential/account revocation, stale tabs, outages and delayed responses. Required in prebuild. Only app/admin-panel/page.tsx is approved for page-lock refresh; all other web/native hashes remain unchanged. Previous stable productione05cb394/AWS92; exact new deployment/runtime proof pending.

### Ordinary photo foods must match their saved food identity (10 October 2026)

- Plain scrambled eggs must not inherit frozen egg-mixture nutrition. Match singular/plural egg names in both directions so the existing whole cooked scrambled egg record remains eligible. Reject unrequested frozen/mixture forms.
- Conventional broccoli must not inherit broccoli raab/rabe/rapini or Chinese broccoli nutrition; explicitly requested subtypes keep their matching records.
- Keep curated Helfi foods first, imported generic records next and compatible APIs only when needed. Scale the original source once to the original estimated portion; preserve source attribution, estimated-portion markers, unknown nutrients, genuine zeros and all six colourful cards. Do not change saved history or the database for this repair.
- Required check: npm run check:food-provenance now includes original-record reproduction of these identity failures and compatible-source fallback. Previous live baseline: 6dcb7bf66e6db11be50c6462c99c29d309a36e90 / AWS102, verified 8 October 2026. New deployment and live verification are recorded separately.
