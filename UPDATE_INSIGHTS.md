# UPDATE_INSIGHTS.md

## Summary of current state (Dec 7, 2025)
- Billing/logging: All targeted regen responses now return `costCents`, `usageEvents`, `promptTokens`, `completionTokens`, and model pricing + markup. Per-call logging is enabled with `callDetail` so you can see tokens/cost per call in `AIUsageEvent`.
- Model/pricing: Model normalization forces any “gpt-4o-mini” variant to the mini rate (input 0.015¢/1k, output 0.06¢/1k) with 2× markup. No fallback to the expensive 4o rates.
- Token caps: Targeted runs cap max_tokens at 200 per call (single pass, no repair/fill for targeted).
- Goal scope: Health goals now only regenerate the changed goal(s); unchanged goals are skipped. A single goal add/remove now bills in single-digit credits (recent run: ~9 credits, raw cost ~1.5¢).
- DOB persistence: API now preserves DOB on load/save with an explicit fallback; avoids birthdate being wiped on refresh.
- Background banner: Banner text now says it’s safe to navigate while regen finishes.
- Known cost for profile tweak (current mapping): Profile change triggers overview + nutrition per goal. With several goals, it still fans out; recent run showed ~18k tokens and ~35 credits for a profile tweak (DOB). The root cause is the per-goal fan-out for profile sections.

## User-requested scope changes (new plan for next agent)
- Remove these sections from insights entirely: **Overview**, **Exercise**, **Supplements × Medications**. Do not generate or display them.
- Exercise note: In Health Setup exercise step, add a note that exercise data is only relevant if a health device is connected; do not include an Exercise insight section if no device data.
- Supplements: Only run the Supplements section when the user adds/changes supplements. If none are added, do not run a pass; it may still recommend generically without an LLM call.
- Medications: Only run the Medications section when the user adds/changes meds. If none are added, skip.
- Labs: Only run Labs if labs are uploaded; otherwise skip.
- Nutrition: Do not trigger nutrition from Health Setup changes; keep Nutrition regen only via the food diary flow.
- Profile changes: Stop fanning out profile → overview/nutrition per goal. Either:
  - Run a single lightweight pass (e.g., nutrition/targets) once globally, or
  - If you must keep per-goal, drop tokens further (e.g., lower max_tokens for profile calls) and avoid any removed sections.
- Keep goal-diff behavior: only changed goals regenerate (already in place).

## Updated execution plan for the next agent
1) Apply section scope changes above (remove Overview/Exercise/Supp×Meds; gate Supplements/Medications/Labs; Nutrition only via food flow; profile no per-goal fan-out).
2) Reduce profile token use: ensure profile changes do not fan out per goal and/or lower the profile max_tokens further (e.g., below 200) if any per-goal calls remain.
3) Keep billing/logging: maintain per-call logging with `callDetail`, and keep returning `promptTokens`/`completionTokens`/`costCents`/pricing in the API response.
4) Preserve guard rails: do not change gating/onboarding rules, redirects, or billing flags; do not touch Food Analyzer or other locked areas.

## What’s done vs. pending
- Done:
  - Model normalization to mini rates; 2× markup intact.
  - Token cap 200 per targeted call; no repair/fill for targeted.
  - Goal-diff regen (only changed goals).
  - DOB persistence fix.
  - Background banner clarified.
  - Per-call logging (tokens/cost/pricing) returned in responses.
- Pending (needs implementation):
  - Remove Overview/Exercise/Supp×Meds sections from insights.
  - Gate Supplements/Medications/Labs/Nutrition as described above.
  - Stop profile per-goal fan-out and/or lower profile token budget further.

## Must-keep behaviors (unchanged)
- Health Setup gating, reminders, and completion criteria (see HEALTH_SETUP_PROTECTION.md).
- Update Insights popup flow remains; non-blocking and per-change is OK.
- Credits must charge only on successful regen.