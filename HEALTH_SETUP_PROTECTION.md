# 🛡️ Health Setup & Insights Protection

## 🚦 Handover (Dec 6, 2025 – Melbourne) – Read before touching anything
- ✅ **Pop-up guard rails (Update Insights / Add More):** The unsaved-change guard must fire **only** when the current onboarding form differs from the loaded baseline. Baseline is captured after initial load and reset after a successful Update Insights run. Do **not** reintroduce an always-dirty flag; navigation (including “Go to Dashboard”) must be allowed when no edits exist.
- ✅ **Durable + warm cache** for onboarding fields (birthdate included) stays enabled; autosave begins only after data load to avoid wiping birthdate.
- ✅ **Background auto-regens** are OFF (do not enable `ENABLE_INSIGHTS_BACKGROUND_REGEN` without explicit approval). “Update Insights” uses `/api/insights/regenerate-targeted` only.
- ✅ **Insights LLM** is enabled (`ENABLE_INSIGHTS_LLM=true`).
- 🚩 **Current live issue:** targeted regen intermittently returns `504 Gateway Timeout` (seen 6 Dec 2025 on Hair Loss). Do not claim success until sections show fresh data. When debugging, capture the `runId` and full response from `POST /api/insights/regenerate-targeted`.
- 🚩 **Imperative task:** Implement per-step regeneration to always call the model (no cache reuse) and charge tokens every time for that step’s change types—no extra approval needed, but keep all guard rails intact.
- ✅ **Section loading UX:** Section pages use indeterminate shimmer instead of misleading percentage bars.
- ✅ **Deployment protocol:** Follow `AGENT_START_HERE.md` for deployments. You have full Vercel access via token—use the Vercel dashboard/logs to resolve deployment errors and only report completion when the deployment is `READY` (rerun and redeploy if it shows `ERROR`).

**⚠️ CRITICAL:** Do NOT change the health setup / insights gating flow or the guarded navigation without explicit user approval.

This document defines the *approved* behaviour for:
- Health Setup onboarding
- The dashboard redirect logic
- Insights access rules
- The 5‑minute health setup reminder

Future agents **must** follow these rules and only modify this flow after:
1. Explaining proposed changes to the user in simple language, and  
2. Getting explicit confirmation to proceed.

---

## 1. Definition of “Onboarding Complete”

Across the app, **onboarding is considered complete** only when **both** are true:

1. **Basic profile is filled in**  
   - `gender`  
   - `weight`  
   - `height`

2. **At least one health goal exists**  
   - There is at least one `HealthGoal` whose `name` does **not** start with `__`  
   - These are the “real” user health issues, not special storage records.

This rule is enforced in:
- `lib/insights/issue-engine.ts` (for `onboardingComplete`)  
- `app/insights/page.tsx` (gating Insights)  
- `app/dashboard/page.tsx` (data status card)  
- `app/api/health-setup-status/route.ts` (status API)

**Do not change this definition** without updating all four places and this file, and only after user approval.

---

## 2. Onboarding Page Popup (“Complete your health setup”)

File: `app/onboarding/page.tsx`

Behaviour:
- When the user visits `/onboarding` and onboarding is **not complete**, show a modal with:
  - Primary button: **“Continue”** (or similar wording)  
  - Secondary button: **“I’ll do it later”**
- The modal should appear on every visit to the onboarding page until onboarding is complete.

**“I’ll do it later” (handleDeferFirstTime) MUST:**
1. Set a **session‑scoped** defer flag:  
   - `sessionStorage.setItem('onboardingDeferredThisSession', '1')`
2. Redirect to the dashboard:  
   - `window.location.replace('/dashboard?deferred=1')`

This flag is intentionally **per browser session only**:
- It prevents redirect loops for the current visit.  
- It does **not** unlock Insights or change the long‑term onboarding requirement.

---

## 3. Dashboard Redirect Logic

File: `app/dashboard/page.tsx`

The dashboard loads `/api/user-data` and then:

1. Computes:
   - `hasBasicProfile = gender && weight && height`
   - `hasHealthGoals = goals.length > 0`
   - `onboardingComplete = hasBasicProfile && hasHealthGoals`

2. Handles **brand‑new users** (no meaningful data at all):
   - If `!onboardingComplete && !hasBasicProfile && !hasHealthGoals && no meds && no supplements`:
     - Check `sessionStorage.getItem('onboardingDeferredThisSession')`
     - If **not set** → redirect to `/onboarding`
     - If **set** → **stay on dashboard** (user chose “I’ll do it later” this session)

3. The **data status card** at the bottom:
   - If `onboardingData.onboardingComplete === true` → show green **“✅ Onboarding Complete”** card  
   - Else → show blue **“🚀 Complete your Health Setup”** card with:
     - Message about finishing profile to unlock insights  
     - Button text:
       - “Start Health Profile Setup” if truly new  
       - “Continue Health Setup” if partial data exists

**Do NOT**:
- Remove the `onboardingDeferredThisSession` check.  
- Loosen the redirect so it ignores the defer flag.  
- Claim onboarding is complete using looser conditions than section 1.

---

## 4. Insights Gating

Files:
- `lib/insights/issue-engine.ts`  
- `app/insights/page.tsx`  
- `app/insights/InsightLandingClient.tsx`

Rules:
1. `/insights` must **never** show real insights unless `onboardingComplete === true`.
2. When `onboardingComplete === false`, `/insights` must:
   - Show a full‑screen gate explaining that Health Setup must be finished first.  
   - Provide:
     - **“Complete Health Setup”** → `/onboarding?step=1`  
     - **“Back to Dashboard”** → `/dashboard`
3. `InsightLandingClient` may show its own empty states, but only **after** the top‑level gating has allowed access.

**Do NOT** bypass this gating or “fake” personalised insights for incomplete Health Setup.

---

## 5. 5‑Minute Global Health Setup Reminder

Files:
- `components/LayoutWrapper.tsx`  
- `app/api/health-setup-status/route.ts`

### 5.1 Status API

`GET /api/health-setup-status` must:
- Use the same completion rule (section 1) to compute `complete`.  
- Compute `partial` (used for future UI if needed).  
- Read a hidden `HealthGoal` named `__HEALTH_SETUP_REMINDER_DISABLED__` to set `reminderDisabled`.

`POST /api/health-setup-status` with `{ disableReminder: true }` must:
- Upsert the `__HEALTH_SETUP_REMINDER_DISABLED__` record, marking the reminder as disabled **for this account** across devices.

### 5.2 Reminder UI

`LayoutWrapper` shows a once‑per‑session reminder:
- Triggered after **5 minutes** of app use on authenticated, non‑public, non‑admin pages.  
- Uses `GET /api/health-setup-status` to check:
  - If `complete === false` and `reminderDisabled === false` → show reminder.
- Reminder content:
  - Message: Helfi needs Health Setup to give accurate insights.  
  - Buttons:
    - **“Complete Health Setup”** → navigates to `/onboarding?step=1`  
    - **“Don’t ask me again”** → calls `POST /api/health-setup-status` with `{ disableReminder: true }`
- Stores `sessionStorage.setItem('helfiHealthSetupReminderShownThisSession', '1')` so the banner shows only once per browser session.

**Do NOT** convert this reminder into a hard block; it must remain a gentle nudge.

---

## 6. Modification Rules for Future Agents

Before changing anything in:
- `app/onboarding/page.tsx`  
- `app/dashboard/page.tsx`  
- `components/LayoutWrapper.tsx`  
- `app/insights/page.tsx`  
- `app/api/health-setup-status/route.ts`  
- `lib/insights/issue-engine.ts`

You **must**:
1. Read this document fully.  
2. Explain to the user, in simple non‑technical language, what you want to change and why.  
3. Get explicit written approval from the user.  
4. After changes, re‑test:
   - New user flow (first sign‑in, no data).  
   - Partially completed setup (some steps done).  
   - Fully completed setup.  
   - “I’ll do it later” on onboarding.  
   - 5‑minute reminder with both buttons.  
   - Insights gating (locked vs unlocked).

If you are unsure, **do not change this flow.** Ask the user first.
