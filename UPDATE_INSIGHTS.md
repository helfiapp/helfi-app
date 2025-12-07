# UPDATE_INSIGHTS.md

## Current state (Dec 8, 2025)
- Billing/logging: Targeted regen responses return `costCents`, `usageEvents`, `promptTokens`, `completionTokens`, model pricing, and markup. Per-call logging is enabled with `callDetail` in `AIUsageEvent`.
- Model/pricing: “gpt-4o-mini” is normalized to mini rates (input 0.015¢/1k, output 0.06¢/1k) with 2× markup; no fallback to expensive 4o.
- Token caps: Targeted calls cap `max_tokens` at 200 (single pass; no repair/fill for targeted).
- Goal scope: Health goals regen only the changed goal(s); unchanged goals are skipped (single-digit credits typical for one goal add/remove).
- DOB persistence: Load/save keeps DOB via fallback; no wipe on refresh.
- Background banner: Banner explicitly says it’s safe to navigate while regen finishes.
- Nutrition suggestions: Each regen now keeps history; suggestions/avoid lists are grouped by timestamp instead of overwriting.
- Insights sections: Overview, Exercise, and Supplements × Medications are removed from UI and generation. Lifestyle is removed from UI; Meds/Supps/Labs/Nutrition remain.
- Mobile cards: Deep-dive workspaces and “Unlock more insights” cards are removed from Insights landing.

## Completed work (latest)
- Removed sections: Overview, Exercise, Supplements × Medications, and Lifestyle from Insights UI; regeneration mapping no longer targets them. Meds/Supps/Labs/Nutrition remain.
- Cost controls: Targeted runs at 200 `max_tokens`, mini-rate pricing normalized, no repair/fill retries for targeted runs.
- Goal-diff: Only changed goals regen.
- DOB persistence fixed; background banner clarified.
- Per-call logging with cost/tokens/model/markup returned in API.
- Nutrition: History preserved (timestamped runs); suggestions/avoid no longer overwrite prior runs.
- Insights landing: “Unlock more insights” and “Deep-dive workspaces” cards removed (desktop and mobile).
- Health Setup: Review step dedupes supplements/medications and shows one per row; the “Update Insights” prompt is removed on review to avoid blocking when nothing changed. Supplements/meds lists wrap nicely (no single long block).

## Still pending / next actions
- Profile changes: Stop any remaining per-goal fan-out (currently profile may still map to nutrition per goal). Either run one lightweight global pass or further reduce tokens if any per-goal calls remain.
- Nutrition trigger scope: Ensure Nutrition only triggers from food diary changes (confirm no health-setup path triggers it).
- Supplements/Medications/Labs gating: Ensure these only run on actual add/change (supps/meds) or labs upload; skip otherwise.
- Optional: Server-side dedupe of supplements/medications on save to keep stored data clean (UI now dedupes display).
- Optional: If desired, keep or drop the “AI insights in 7 days?” choice; currently surfaces “AI Insights: No” when user chose “No”.

## Must-keep behaviors
- Health Setup gating, reminders, completion criteria (see `HEALTH_SETUP_PROTECTION.md`).
- Update Insights popup flow elsewhere remains non-blocking; credits only charge on successful regen.