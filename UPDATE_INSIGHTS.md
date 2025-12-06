# UPDATE_INSIGHTS.md

## Handover (Dec 6, 2025) — Detailed timeline of attempts
- Current state: Profile/Health Goals edits still return `background: true` with `sectionsTriggered: []` and credits do not charge. Latest runIds from user tests (still no charge):
  - Profile: `cf8015f4-4971-4e13-9336-abce972a0cfc`, `d4782b80-75b5-4eef-8048-8d4106895767`
  - Health goals: `c76fec35-22d9-4f32-b5a5-f897682a55de`
- New (Dec 6, 2025 later): Even after multiple fixes, credits remain stuck at 1426 for the user; all regen calls still come back `background: true` and no AIUsage/charges recorded. LLM status now surfaces in responses (`llmStatus`), but still no cost changes observed.
- What was added:
  - Decoupled save from regen on frontend; quick inline path + fire-and-forget background for all steps.
  - Profile-only path: quick (preferQuick) inline regen + full background regen; charging was supposed to occur when the full run finished.
  - Added logging for charges: warns when `costCents` or `usageEvents` are zero; logs charge summary otherwise.
  - Added logging for goals detected in the API; removed hard block on missing goals (now logs goal count/names).
  - Added logging for manual regeneration start/complete, including issues, sections, inline/quick flags.
  - Added fallback in regeneration-service to pull issues from `CheckinIssues` if `healthGoals` is empty; still bails if zero issues.
  - Decreased API response timeout to 15s to avoid long blocking; still backgrounding.
  - Added background status toast in UI (non-blocking UX).
- Added synthetic slug fallback so regen doesn’t bail when no issues are found; still seeing background with no charges.
- Added `llmStatus` to regen API responses (enabled + apiKeyPresent + model) so we can confirm key/flag in DevTools; current user runs still show no credit movement.
- Observed failures:
  - Despite multiple real goals selected (e.g., Bowel Movements, Erection Quality, Hair Loss, Libido, Mood), responses show `sectionsTriggered: []`, `affectedSections` as expected (overview/nutrition/lifestyle), but no cost/usage and no credit change.
  - Runs always return `background: true`; the heavy LLM run appears to not register cost (likely zero usage recorded).
  - Even after fallback for issues, still seeing empty `sectionsTriggered`.
  - Credits remain stuck (example: 1426) across all attempts.
  - LLM flag/key now reported in responses, but user still sees no charges and same credit balance.
- Hypotheses to investigate next (for the next agent):
  1) The heavy regen path may not be executing or is short-circuiting before LLM calls. Trace in `precomputeIssueSectionsForUser` / `generateSectionInsightsFromLLM` for the runId to confirm LLM invocation and `AIUsageEvent` rows.
  2) Cost logging shows zero; verify `AIUsageEvent` writes for the runId. If none, the LLM calls are not happening.
  3) Check that `runChatCompletionWithLogging` is called for profile/goals sections and that `ENABLE_INSIGHTS_LLM=true` and `OPENAI_API_KEY` are present at runtime (env confirmed present in Vercel, but confirm server-side execution).
  4) Confirm issues list is non-empty during regen (log shows goal detection but still `sectionsTriggered: []`). Possible that issues are empty inside regen-service despite goals existing.
  5) Consider forcing a simple, minimal inline profile calculation (non-LLM) to set `sectionsTriggered` and then run heavy text in background with explicit `AIUsageEvent` logging.
  6) Check whether `precomputeQuickSectionsForUser` or `precomputeIssueSectionsForUser` returns empty because of empty issues array or cache/filters.

## Prior content (unchanged)

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

## Critical outstanding issues (as of Dec 6, 2025 evening)
- Credits never decrease (stuck at 1426) despite multiple profile/goal/exercise changes and manual regens. Responses show `background: true`, `sectionsTriggered` set (after recent fixes), but `usageEvents`/`costCents` stay zero. LLM key/flag now surfaces in `llmStatus` in the response; still no cost change observed in prod.
- Onboarding “Update Insights / Add more” prompt:
  - Intermittent: after multiple edits across steps, the prompt sometimes stops appearing when navigating forward/back until a full Update is run. Guard was re-locked (new edits clear prior allowance), but user still reports cases where the prompt fails to reappear after additional changes.
  - Expected behavior: after any new edit on a step, leaving that step should show the prompt every time (unless going straight to Dashboard, which must force Update).
- Primary goal buttons (Lose weight / Tone up / Get shredded / Gain weight) are not persisting. User reports these selections are not saved; needs investigation in onboarding payload/save logic (`/api/user-data` handling for primary goal fields).

## New instrumentation
- `llmStatus` in `/api/insights/regenerate-targeted` response: `{ enabled, apiKeyPresent, model }` to verify OPENAI key + flag in prod via DevTools. Still seeing no charges even when enabled/apiKeyPresent expected to be true.

## Next steps for the next agent
- Verify `llmStatus` from a live call while logged in as user; confirm `enabled` and `apiKeyPresent` are true, and check `AIUsageEvent` rows for the returned `runId`. If zero, trace why `runChatCompletionWithLogging` isn’t firing (or returns without usage).
- Investigate why primary goal selections are not saved (see screenshot). Check onboarding save payload and persistence for `goalChoice/primaryGoal` fields; ensure `/api/user-data` writes them and hydrates on load.
- Reproduce the prompt issue across multiple steps: make edits on step 2, click Add more, continue, edit on step 3/4, confirm the prompt appears on each step change; if not, inspect `useUnsavedNavigationAllowance` state reset. Ensure new edits always re-arm the guard per step.
- If credits still don’t move, add server-side logging around `generateSectionInsightsFromLLM` / `runChatCompletionWithLogging` for the runId to confirm actual OpenAI calls and token usage; capture errors if the key is invalid or the flag is off at runtime.

## Must-keep behaviors (do not break)
- Health Setup gating, reminders, and completion criteria (see HEALTH_SETUP_PROTECTION.md).
- Update Insights popup flow should remain, but it can be made non-blocking and per-change.
- Credits must only charge on successful regen.

## Summary for next agent
The core problem is regen timeouts for profile updates. Despite scoping to `overview` + `nutrition` and extending timeouts, Vercel returns background/timeout and credits don’t move. Fix by decoupling save from regen, making profile regen as lightweight as possible (maybe non-LLM for targets), and adding clear status/completion handling. Instrument with runIds to see what’s hanging. Avoid reintroducing full fan-out; keep per-change regen minimal and non-blocking.***
