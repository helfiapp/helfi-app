# UPDATE_INSIGHTS.md

Status: Still timing out / falling back to background for profile updates (weight/goal/birthdate) and not charging credits. Inputs can revert when the save is tied to a failing regen.

## What we’re trying to achieve
- When a user changes **one thing** in Health Setup (e.g., weight, birthdate, a supplement), we:
  1) **Save the data immediately** so their inputs stick even if regen fails.
  2) **Regenerate only the relevant insight section(s)** for that change (e.g., supplements → Supplements; weight → nutrition targets).
  3) Finish regen inline where possible (<~30–60s). If it must continue in the background, show a status and update credits when done.
- The **only “big” regeneration** should be the first full setup (page 1 → confirm/finish). Later edits should be fast and scoped.

## Guard rails to respect (from HEALTH_SETUP_PROTECTION.md)
- Don’t change gating/flows for Health Setup completion, reminders, or insights access.
- The Update Insights popup/flow must remain, but its logic can be scoped per-change.
- No loosening of onboarding complete criteria or redirect logic.

## Current code behavior (as of commit `a8ad574e` on master)
- API: `app/api/insights/regenerate-targeted/route.ts`
  - Timeout set to 90s.
  - If `changeTypes` is missing, defaults to minimal profile regen.
  - Calls `triggerManualSectionRegeneration` inline; if not done by timeout, returns `background: true`.
- Section scoping: `lib/insights/regeneration-service.ts`
  - **Profile** (weight/height/goal/birthdate/body type): `overview`, `nutrition`
  - **Supplements**: `supplements`
  - **Medications**: `medications`, `interactions`
  - **Food**: `nutrition`
  - **Exercise**: `exercise`
  - **Health goals/situations**: `overview`, `nutrition`, `lifestyle`
  - **Labs**: `labs`
- UI (app/onboarding/page.tsx): still calls `/api/insights/regenerate-targeted` after saves; credits update when regen completes, but current timeouts mean credits don’t move and inputs can revert if save is coupled to regen success.

## What I tried (and where it failed)
1) **Extended inline timeout**: increased to 60s and later 90s. Result: still hitting Vercel function timeout (`FUNCTION_INVOCATION_TIMEOUT`) or returning `background: true`; credits do not drop.
2) **Scoped sections** multiple times:
   - First narrowed profile to core sections, then to only `overview` + `nutrition`.
   - Scoped supplements to supplements only; meds to meds + interactions; labs to labs only.
   - Still seeing background/timeout for profile updates.
3) **Default minimal changeTypes**: If the client omits changeTypes, we default to a minimal profile regen to avoid fan-out. Timeouts persist for profile.
4) **Raised timeout to 120s** then reduced to 90s to avoid hard platform limit: still timing out.
5) **Split fan-out mapping** to reduce work: did not eliminate background responses for profile edits.

## Observed behavior/issues
- Profile updates (weight/goal/birthdate) still return `background: true` or `FUNCTION_INVOCATION_TIMEOUT`; credits stay unchanged.
- When regen fails or goes background, the form sometimes reloads without the new DOB/goal/intensity (save tied to regen path).
- Users see long waits (1–2 minutes) and no immediate success; this is unacceptable for small edits.

## Credit system (intent)
- Credits should be charged only when regen completes successfully.
- Background runs should charge on completion; failures should not charge and should surface a retry.
- Currently, because runs time out, credits do not change.

## What needs to change (recommended next steps)
1) **Decouple save from regen**:
   - On every change, **save immediately** via `/api/user-data` (or a lightweight endpoint) and update local state so DOB/goal/weight stick even if regen fails.
   - Show regen as a separate step; if it fails, do not roll back the saved data.
2) **Even narrower profile regen**:
   - For profile edits, regenerate **only** nutrition targets/overview (already set), but ensure the underlying regen job is fast. If still slow, consider splitting into a smaller task or precomputing targets without LLM.
3) **Asynchronous completion with status**:
   - If regen can’t finish inline, return immediately with a `runId`, show a “finishing up” banner, and poll or push completion; update credits and sections on completion.
   - Surface failures clearly: “Insights update failed; retry” instead of silent background.
4) **Instrument and trace**:
   - Add logging around `runId` paths to see where profile regen spends time. Use the last runIds from user reports:
     - `syd1::brj6w-1764986201518-55800b2bc6dc` (timeout)
     - `fa747fcc-cbae-492d-a242-aca965bb9f96` (background for profile)
   - Verify actual sections triggered vs. expected mapping.
5) **Inline fallback**:
   - If the LLM path is too slow for profile, consider a lightweight calculation (for targets) and defer the heavier insight text until later; still charge appropriately when the heavy run actually completes.

## Must-keep behaviors (do not break)
- Health Setup gating, reminders, and completion criteria (see HEALTH_SETUP_PROTECTION.md).
- Update Insights popup flow should remain, but it can be made non-blocking and per-change.
- Credits must only charge on successful regen.

## Summary for next agent
The core problem is regen timeouts for profile updates. Despite scoping to `overview` + `nutrition` and extending timeouts, Vercel returns background/timeout and credits don’t move. Fix by decoupling save from regen, making profile regen as lightweight as possible (maybe non-LLM for targets), and adding clear status/completion handling. Instrument with runIds to see what’s hanging. Avoid reintroducing full fan-out; keep per-change regen minimal and non-blocking.***
