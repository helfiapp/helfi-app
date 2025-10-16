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

## SESSION LOG — 2025-10-13 (live user report: 75s load)

User-confirmed facts (production):
1. Health intake save previously failed with popup. After fix today, save now succeeds, but Supplements still opens painfully slow (≈75s). 15s UI estimate is misleading.
2. “What’s Working” under Libido shows only 2 items despite multiple logged supplements that should match (e.g., Zinc, P5P). User requirement remains: at least 4 items for Suggested and 4 for Avoid; Working should reflect logged items accurately.
3. Reverting to the prior version will not help: the user already tested earlier builds and still saw ~60s+ loads. So a simple rollback will not meet the performance target.

Actions taken in this session (code committed to master; auto‑deploy enabled):
1. app/api/user-data/route.ts — Made post‑intake insights precompute fire‑and‑forget (no await) so save returns immediately; prevents save timeout popup from blocking onboarding. Commit bbf7c6f.
2. app/api/user-data/route.ts — Optimized persistence path: replaced row‑by‑row upserts of supplements/medications with bulk replace (deleteMany + createMany) to reduce save latency and DB thrash. Commit b5e31a9.
   - Net effect: onboarding save is now fast and reliable, but insights cold load remains slow.

What we inspected (but did not change yet):
1. lib/insights/issue-engine.ts — computeIssueSection still fully computes on cold miss and does not enforce a time‑cap before returning a degraded 4/4. Cache TTL logic accepts degraded, but the server path waits on LLM if cache is cold.
2. lib/insights/llm.ts — generateSectionInsightsFromLLM chains multiple calls (generate → classify → repair/fill). Degraded generator exists but only used on hard failure, not on slow paths. No time‑cap is enforced before returning.
3. app/insights/issues/[issueSlug]/SectionPrefetcher.tsx — Prefetch kicks off, but UI does not render degraded immediately on cache miss; the section page still opens cold and waits.

Why performance is still bad despite save fixes:
1. Core latency is on cold insights compute (sequential LLM phases) not on the intake save. Background precompute after save helps later, but if the user clicks into Supplements before precompute finishes, they still hit the cold path.
2. No 1‑second degraded‑first guard exists server‑side to force quick first content while the validated cache builds in background.
3. Minimum counts are requested in prompts, but classification/repair may still underfill and Working mapping misses obvious logged items.

Recommended plan for the next agent (do not deploy piecemeal; make a cohesive change):
1. Add a strict server‑side time cap in getIssueSection/computeIssueSection for Supplements (and later others): if no valid cache within ~1s, immediately return a degraded 4/4 result and enqueue the full compute in background; write cache when ready. This guarantees first paint within ~1s even on cold.
2. Ensure degraded generator enforces ≥4 suggested and ≥4 avoid (already designed to), and mark extras: { validated=false, degraded=true, pipelineVersion='v2', timings }.
3. Working accuracy: overlay an ontology‑backed matcher (see ISSUE_KNOWLEDGE_BASE.libido.helpfulSupplements) to map logged names like “Zinc”, “P5P”, “Cistanche”, “Muira Puama” into Working when AI misses obvious matches; keep AI‑only rationale text, but do not let classification drop clear matches.
4. Surface timings in extras (generateMs, classifyMs, fillMs, totalMs, cacheHit) and wire a lightweight emitter so GET /api/analytics?action=insights returns real values.
5. Later (optional): Client‑side degraded render on cache miss for belt‑and‑braces, but server‑side time‑cap should be primary.

Explicitly avoid:
1. Full rollback as primary fix — user confirms earlier versions also exhibited >60s loads.
2. Adding debug routes or logging users out.
3. Touching env vars (OPENAI_API_KEY etc.).

User’s hard requirements to honor:
1. Cold ≤7s with immediate “good‑enough” content; warm ≤1s.
2. At least 4 Suggested and 4 Avoid items, every time, for Supplements (and similarly for other sections). Working must reflect logged items like Zinc, P5P, etc.
3. Edits on master only; Vercel auto‑deploy; keep plain‑English notes here.

Session outcome: Save path stabilized and sped up; root cause of long waits persists on the cold insights path. Next step must be a server‑side 1‑second degraded‑first guard plus Working overlay to lift accuracy.

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
