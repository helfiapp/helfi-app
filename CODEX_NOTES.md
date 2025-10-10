# CODEX NOTES

## Current Status (2025-10-10)
- **Outcome:** Latest deployment failed to meet user requirements. Keep this as a known-bad state; do not reuse this strategy without major changes.
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
   - New API `POST /api/insights/issues/[slug]/sections/prefetch` and helper `precomputeIssueSectionsForUser` run sections in parallel (limit 2).
   - After onboarding save (`POST /api/user-data`), agent triggers `precomputeIssueSectionsForUser`.
   - **Failure:** Despite backend precompute, users still see 20s+ waits. Instrumentation is missing, so we do not know if the calls run, succeed, or are simply caching slow responses/nulls.

4. **Caching Adjustments**
   - Added guard to skip caching results flagged as `llm-error`/`needs-data`.
   - However, still writes malformed results (e.g., nutrition-with-supplements) to DB cache, so bad data persists.

## Guidance for Next Agent
1. **Do not reuse the current prompt + repair approach.** It does not enforce food/supplement boundaries or reliable avoid lists.
2. **Revisit domain-specific prompting per section.** Consider separate system instructions or post-processing filters that remove items outside the expected taxonomy.
3. **Re-think pre-generation.** Need instrumentation (server logs, per-section timing) before attempting more concurrency tweaks. Confirm precompute actually populates cache.
4. **Respect data separation:**
   - Nutrition: foods only; never alcohol or supplements.
   - Exercise: movement entries only.
   - Supplements/Medications: use logged items for “working”, but still generate ≥4 suggested and ≥4 avoid items even with empty logs.
5. **User non-negotiables (must remain true regardless of implementation path):**
   - Entirely AI-generated content—no hard-coded filler.
   - Minimum counts: Suggested ≥4, Avoid ≥4 (user increased requirement); Working reflects logged items only.
   - Provide detailed mechanisms + practical guidance (dose/timing or execution).
   - Performance: sections should render ≤4 s (warm) / ≤7 s (cold), with insights ready immediately after intake completion.

## Next Steps (Recommended)
1. Roll back to the last known stable commit or start from a clean branch; the current deployment is a regression.
2. Instrument timing + logging around: LLM calls (prompt/latency), cache hits, and precompute pipeline success/failure.
3. Rebuild prompts iteratively per domain with strict post-validation (e.g., regex filters, ontology checks) to guarantee correct item types before caching.
4. Only redeploy after verifying locally that:
   - Nutrition shows foods only.
   - Supplements/Exercise avoid lists contain ≥4 relevant items even with empty logs.
   - Average response time (using mock data) meets targets.
