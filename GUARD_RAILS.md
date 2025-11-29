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

### 3.4 Detected Foods Portion Controls (Servings UI)

**Protected file:**
- `app/food/page.tsx` (Detected Foods card in the Food Analysis edit view)

This section controls **how portion sizes are edited for each detected ingredient** (e.g. Carman's Toasted Muesli).
The current design has been carefully agreed with the user and must **not** be changed without explicit written
approval.

#### 3.4.1 Current Behaviour (Must Stay)

- Each ingredient shows a **single editable field: `Servings`**.
- The serving size label (from the database) is displayed as:
  - `1 serving = 1/2 cup (45 g)` (example)
- There is **no separate editable "Units" field**. Portions are always edited in terms of servings only.
- When grams are known, the UI also shows a **read‑only total line**, e.g.:
  - `Total amount ≈ 180 g` (calculated as `servings × gramsPerServing`).
- Changing `Servings` updates:
  - The per‑serving and total nutrition cards.
  - The in‑memory `editingEntry` so Today's Totals remain accurate while editing.

#### 3.4.2 What Agents MUST NOT Do

- Do **NOT** re‑introduce an editable "Units" control (e.g. cups / ml / ounces) as a second number.
- Do **NOT** make the servings step jump in large increments (e.g. 1 → 10) or anything other than:
  - Whole numbers for discrete items (pieces, slices, etc.).
  - Reasonable fractional steps (e.g. 0.25) for continuous units.
- Do **NOT** remove or hide the "1 serving = …" label or the total grams line.
- Do **NOT** change the underlying meaning of one serving without also updating the database entry and
  clearly explaining this to the user.

If you believe the portion‑control UI must change, you **must**:
1. Explain the proposed change to the user in simple, non‑technical language.
2. Get explicit written approval.
3. Re‑test that:
   - Servings behave intuitively (1, 2, 3, …).
   - The total grams line remains correct.
   - Nutrition totals match the expected math.

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
   - Timezone handling must be correct
   - Date filtering must account for user's timezone

### 3.6 Mobile Category “+” Toggles (Locked)

The green “+” buttons for each Food Diary category (Breakfast, Lunch, Dinner, Snacks, Other) are a **strict toggle**:
- Tap the “+” to open the add panel for that category.
- Tap the **same “+” again** to close it.
- Do **not** change this to “tap outside to close” or any other behaviour.
- The “Other/+” panel must remain scrollable so all options are reachable on mobile.

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
- Empty state message when no meals added

**What Agents MUST NOT Do:**
- Change the responsive layout behavior (grid on desktop, stacked on mobile)
- Remove the energy unit toggle (kcal/kJ)
- Modify the section header text or styling
- Change the order of elements (ring vs progress bars)
- Remove the empty state message

### 4.5 Testing Requirements

Before modifying macros progress bars or remaining calories ring, agents must test:
1. **Normal consumption:** Values below target show correct percentages and green bars
2. **Over target:** Values exceeding target show red bars and correct "over 100%" display
3. **Zero consumption:** Empty diary shows 0% bars and full green ring
4. **Unit switching:** kcal/kJ toggle updates both ring value and daily allowance text
5. **Responsive design:** Layout switches correctly between mobile and desktop views
6. **Multiple macros:** All five macros (Protein, Carbs, Fat, Fibre, Sugar) display correctly

---

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
- `app/api/credit/usage-breakdown/route.ts` (admin/diagnostic usage breakdown)
- **Do not remove the photo-analysis cache or curated USDA enforcement (Nov 2025):**
  - `app/api/analyze-food/route.ts` hashes the image and returns cached items/macros for repeat analyses of the same photo. This stabilizes totals and avoids run-to-run drift. Do not remove or bypass this cache without explicit approval.
  - `app/food/page.tsx` enriches common items (bun, patty, cheese, ketchup, etc.) with curated USDA-backed macros, enforces realistic floors, and normalizes names (e.g., “Burger bun” instead of random variants). Do not weaken or remove this enrichment/normalization.
- “Never wipe ingredient cards” guard: `applyStructuredItems` must not replace existing cards with an empty list if a new analysis yields nothing. Preserve existing items and totals in that case. **Do not change this behaviour or clear `analyzedItems` / `analyzedTotal` in new flows without explicit written approval from the user. If ingredient cards ever disappear after a photo or text re‑analysis, treat that as a critical bug and restore this guard – do NOT redefine the UX.**
  - Intent: keep macros realistic (~6 oz patty ~450 kcal) and totals consistent across repeated analyses of the same image; preserve cards at all times.
- **Do not undo the discrete-portion fix (Nov 22, 2025):**
  - `app/food/page.tsx` now *scales macros instead of servings* for discrete items when the label states multiple pieces (e.g., “3 large eggs”, “4 slices bacon”). Servings stays at `1` to avoid “3 servings of 3 eggs”, while calories/macros are multiplied by the labeled count. **Leave this logic intact** unless the user explicitly requests a different design.
- **Keep bagel starter data intact:** `data/foods-starter.ts` includes `Sesame Bagel` with standard macros so photo analyses have a reliable fallback. Do not remove or rename this entry without approval.
- **Packaged per-serving OCR (Nov 24, 2025 – locked):**
  - Packaged (“Product nutrition image”) uses **gpt-4o** for per-serving extraction; do not downgrade the model without user approval.
  - Use the per-serving column exactly; ignore per-100g and do not sum saturated/trans into total fat. If macros overshoot label calories, only clamp fat (and carbs if clearly under-read) to fit label kcal; otherwise keep the per-serving numbers from the label.
  - Barcode mode is **removed**; do not reintroduce barcode lookups or hallucinated products. If nothing is found, stick to label OCR.
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
