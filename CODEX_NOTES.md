# CODEX NOTES

## Current Status (2025-10-10)
- **Outcome:** Latest deployment still fails key requirements. Keep this as a known-bad-but-instrumented baseline; do not repeat the same approach without implementing remediation below.
- **User feedback highlights:**
  1. Nutrition “Suggested Foods” and “Foods to Avoid” now surface supplements/alcohol (e.g. Tongkat Ali, Saw Palmetto) instead of food-only guidance.
  2. Supplements → “To Avoid” routinely returns zero AI-generated items.
  3. Insights still take ~20s+ to load after tapping a section despite new prefetch logic.
  4. Exercise guidance incorrectly recommends supplements.
  5. Pre-generation promised after health intake completion is not delivering; users still wait on first visit.

## What This Agent Attempted (and Why It Failed)
1. **LLM Wrapper Rewrite (`lib/insights/llm.ts`)**
   - Enforced stricter JSON schema, variable minimum counts, and an automatic “repair” pass that re-prompts the model.
   - Reduced `max_tokens` to 650, `temperature` 0.05, and forced every section to output ≥4 suggested / ≥2 avoid items.
   - **Failure:** The prompt changes still allow non-food items into nutrition arrays, the repair pass does not guarantee domain-correct buckets, and avoid/suggested lists can still come back empty. The stricter schema does **not** fix quality.

2. **Section Builders Overhaul (`lib/insights/issue-engine.ts`)**
   - Removed previous gating states (e.g., “log meals first”), always called the LLM, dynamically set `minWorking = 0` when no logs, and added client-facing highlights about missing data.
   - Added new metadata to `extras` (e.g., `hasLogged`, `hasRecentUpdates`) to inform UI copy.
   - **Failure:** Logic intended to keep buckets domain-specific is insufficient; nutrition/exercise prompts still leak supplements, and avoid lists are empty because the model ignores instructions. UX regressions remain.

3. **Prefetch + Precompute**
   - New API `POST /api/insights/issues/[slug]/sections/prefetch` and helper `precomputeIssueSectionsForUser` now run with concurrency 3 (was 2). UI `SectionPrefetcher` triggers batch prefetch on mount.
   - After onboarding save (`POST /api/user-data`), precompute is triggered server-side.
   - **Failure (live):** Users still observe 30s+ waits on first open. Cache is not always warm; strict cache policy may skip writes on validation failure, causing repeated cold paths.

4. **Caching Adjustments**
   - v2 only caches validated results with `pipelineVersion: "v2"` and `validated=true`.
   - **Live gap:** When validation fails, nothing is cached → repeated cold runs → user-visible delays. We need a short-TTL degraded cache path and background upgrader.

## Guidance for Next Agent
1. **Do not rely solely on prompt + repair.** Enforce boundaries with a classifier and a rewrite-to-domain step.
2. **Revisit domain-specific prompting per section.** Keep AI-only, but add rewrite-to-domain before final filtering.
3. **Make precompute actually hide cold latency.** Trigger on intake save and Insights landing; increase concurrency after measuring; serve degraded cache immediately when validated cache is missing.
4. **Respect data separation:**
   - Nutrition: foods only; never alcohol or supplements.
   - Exercise: movement entries only.
   - Supplements/Medications: use logged items for “working”, but still generate ≥4 suggested and ≥4 avoid items even with empty logs.
5. **User non-negotiables (must remain true regardless of implementation path):**
   - Entirely AI-generated content—no hard-coded filler.
   - Minimum counts: Suggested ≥4, Avoid ≥4 (user increased requirement); Working reflects logged items only.
   - Provide detailed mechanisms + practical guidance (dose/timing or execution).
   - Performance: sections must render ≤4 s (warm) / ≤7 s (cold), with insights ready instantly after intake completion or a degraded result shown immediately and upgraded in background.

## Next Steps (Recommended)
1. Add rewrite-to-domain pass and degraded-but-valid fallback (never return null; always 4/4). Keep AI-only content.
2. Instrument timings in `extras`: generateMs, classifyMs, rewriteMs, fillMs, totalMs; log cacheHit/cacheMiss.
3. Adjust caching: short-TTL (≈2min) for `validated=false` results; background upgrader to re-run rewrite/fill to validated.
4. Trigger precompute on Insights landing (not only intake save) with concurrency 4 after measuring.
5. Only redeploy after verifying locally and on a preview that:
   - Nutrition shows foods only.
   - Supplements/Exercise avoid lists contain ≥4 relevant items even with empty logs.
   - Cold path renders immediately (degraded or cached), and background upgrade occurs within 7s.
   - Average response time meets targets.


---

## INCIDENT LOG — v3 Attempt (2025-10-11) commit d04c946

This section documents exactly what the last agent changed and why it regressed live performance/UX, so the next agent does not repeat these steps.

### Exact Code Changes
- `lib/insights/llm.ts`
  - Added rewrite-to-domain helper and integrated it before fill-missing.
  - Increased fill-missing attempts (2→3) with diversity prompts.
  - Implemented `generateDegradedSection` (synthesized 4/4); timings stored in a private `_timings` field.

- `lib/insights/issue-engine.ts`
  - Calls degraded generator only if the main LLM returns null (not on slow or low-count responses).
  - Sets `extras.degraded = !validated` and allows caching degraded with short TTL (~2 min).
  - Precompute default concurrency raised to 4; cache read logic honors degraded TTL vs validated TTL.

- `app/api/insights/issues/[slug]/sections/prefetch/route.ts`
  - `concurrency` default 4; added `forceAllIssues` support (unused by UI).

- `app/insights/issues/[issueSlug]/SectionPrefetcher.tsx`
  - Sends `concurrency=4`; does not render degraded immediately on cache miss.

- `app/api/analytics/route.ts`
  - `GET?action=insights` returns recent timing entries, but no emitters were added so the endpoint is effectively empty.

### Live Regression (User Report)
- Supplements section took ~55 seconds to open on production (goal: ≤7s); UI showed “Initial guidance generated…” but lists were empty instead of guaranteed 4/4.

### Likely Root Causes
1) Too many sequential LLM calls: generate → classify → rewrite per bucket → re-classify → fill (up to 3) → re-classify.
2) Degraded fallback not time-based: only triggers on hard LLM failure, not on slow responses or low counts.
3) Client does not render degraded instantly on cache miss; still blocks user while server computes.
4) Timings not exposed in `extras`, reducing observability.

### Do Not Repeat — Alternative Approach
1) Enforce a strict time cap: if no validated cache by ~1s, immediately render a prebuilt degraded 4/4 and start a background upgrade.
2) Collapse rewrite/classify steps or apply rewrite selectively to only the deltas that fail domain checks.
3) Put timings inside `extras` and emit analytics so `GET?action=insights` has real data.
4) Keep degraded data session-local unless necessary to persist; if persisted, TTL ≤ 2 min and ensure background upgrade job is fired.

### Rollback Guidance
- Revert commit `d04c946bf2486789ff0a4e9104fa8d3020c2af0a` to return to the instrumented v2 baseline.
  - `git revert d04c946bf2486789ff0a4e9104fa8d3020c2af0a` and push to master (this repo auto-deploys to Vercel).

### Commit Reference
- v3 attempt: `d04c946bf2486789ff0a4e9104fa8d3020c2af0a`
  - Key side-effects: slower cold path, no immediate degraded render, timing data not visible in `extras`.

---

## SESSION LOG — 2025-10-16 (Agent attempt REVERTED)

Outcome
- The deployment made in commit `0268398` ("Insights: fast-path + degraded fallback; guaranteed >=4 Suggested/Avoid; chat UX with history; fix Nutrition/Supplements cold load") was rolled back by `git revert`.
- Reason: User observed sections stalling (skeleton loading) and no improvement in perceived cold time (still ~20–25s). Requested immediate revert to the previous working deployment.

What this agent changed (now reverted)
1) New fast-path generator in `lib/insights/llm.ts` (`generateSectionInsightsFast`), using one-shot candidate generation with `candidateType` hints plus single top-ups. Attached `_timings`.
2) Switched section builders (supplements, medications, exercise, nutrition) in `lib/insights/issue-engine.ts` to call the fast path; copied timings into `extras` for UI.
3) Added quick/degraded paths: `buildSupplementsSectionDegraded()` and later `buildNutritionSectionDegraded()`; `computeIssueSection` raced full vs quick.
4) “Working” lists built from logs via `ISSUE_KNOWLEDGE_BASE` so obvious helpers appear without LLM.
5) Chat changed from one-shot to simple threaded: `app/insights/.../SectionChat.tsx` and `app/api/insights/ask/route.ts` now accept message history and section context; local storage keeps per-issue history.

Observed problems
- Cold loads still ~20–25s for some users; one report showed Nutrition stuck on skeletons.
- Supplements “Working” sometimes empty in the quick result despite logged items.
- Quality still inconsistent across sections (≥4 Suggested/Avoid not always visible at first paint).

Suspected causes (do NOT repeat without addressing)
1) Heavy DB/context load (`loadUserInsightContext`) still runs before quick path; that alone can push first-byte over the target.
2) The quick path wasn’t used everywhere at first; for some routes the full path still blocked first paint.
3) Added complexity increased risk of extras shape mismatch between quick/full results.

Rollback
- Reverted commit: `0268398` with `git revert 0268398` and pushed to `master` (auto-deployed by Vercel).
- Baseline now matches commit `b5e31a9` (pre-attempt state).

Guidance for next agent (avoid repeating)
1) Do not add more LLM passes. Focus on time-capping and cache-first.
2) First-byte must not depend on the heavy context loader. Consider a minimal-context endpoint (just user ID + issue slug) to serve a tiny, prebuilt “starter” insight from KV, then upgrade.
3) Surface server timings in `extras`: { dbMs, computeMs, cacheHit, cold }. Add logging you can read in Logs tab.
4) Enforce ≥4/4 at the data layer with deterministic fallbacks rather than retrying the model.

### User-observed issues AFTER rollback (b5e31a9 baseline)
These reflect the current live experience even before any new changes. Please treat them as the starting point to fix.

1) Cold load remains ~25 seconds across sections
   - Affects: Supplements, Nutrition, Medications, Exercise (and likely others).
   - Repro: Open any issue → tap any section on a fresh session; wait time ≈20–25s before content appears.
   - Implication: Cold latency is not only due to LLM prompt behavior; the data loading and/or compute pipeline before first byte needs aggressive time-capping and cache-first serving.

2) Supplements → “What’s Working” shows nothing despite many logged supplements
   - User has a populated supplement list in Health Intake.
   - Section shows “You’re currently not taking any supplements that could help…”
   - Implication: Current mapping from logged supplements → Working is unreliable (likely name matching vs. model output). The app must anchor Working to logged items with deterministic matching before relying on the LLM.

Please document any structural changes you make and verify both problems above are measurably improved before deploying.
