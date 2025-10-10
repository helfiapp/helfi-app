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
