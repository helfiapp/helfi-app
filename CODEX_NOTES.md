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

---

## SESSION LOG — 2025-10-17 (Degraded-first quick path attempt)

Outcome
- Deployed a degraded-first path intended to show guidance immediately and upgrade in the background. Result: user still observed 30–40s waits after tapping sections/tabs; no improvement in perceived first-paint time.

Exact Code Changes
- `lib/insights/llm.ts`
  - Added `generateDegradedSectionQuick(input, options)`: single LLM call via `generateSectionCandidates`, domain-filtered, returns ≥4/4 suggested/avoid without repair loops.

- `lib/insights/issue-engine.ts`
  - Commit `10ee692`: Introduced Nutrition-only quick path with 1s race; returned degraded on slow full build; background upgrade writes cache.
  - Commit `0cd1336`: Fixed missing `mode`/`range` on quick result to satisfy `IssueSectionResult` type.
  - Commit `0d468e4`: Expanded quick path to all sections (except `overview`/`interactions`), removed the 1s timeout, always returned degraded-first, mapped degraded output into section-specific `extras`, wrote degraded to cache (short TTL), and kicked off full compute in background.

- `app/api/insights/issues/[slug]/sections/prefetch/route.ts`
  - Switched from heavy `precomputeIssueSectionsForUser` to a “quick warm” that calls `generateDegradedSectionQuick` for each section; added simple concurrency. Commit `7e8d681` fixed TypeScript generics and removed unused imports.

Observed Problems (Live)
- Users still saw 30–40s before any content appeared on section/tab open.
- Prefetch did not noticeably reduce cold waits.

Root Causes (Do not repeat)
1) Quick path still blocked on an LLM call.
   - `generateDegradedSectionQuick` invokes OpenAI once per section. When that call is slow in production, first paint still blocks. Degraded-first must not call the LLM before responding.

2) Prefetch didn’t persist usable results for the read path.
   - The quick prefetch intentionally avoided DB writes; the subsequent read still triggered the same LLM call, so prefetch often doubled load instead of warming reads.

3) Concurrency amplification.
   - Landing prefetch fanned out multiple quick calls at once, increasing tail latency and contention.

4) No instant, stored fallback.
   - There was no static or cached degraded payload returned in <1s; everything depended on live LLM latency.

What to try next
1) Serve from storage first: no LLM on first byte.
   - Return stored degraded (KV/DB) immediately. If none exists, return a pre-generated generic degraded result per issue/section (AI-generated ahead of time). Mark `degraded=true`; start background upgrade.

2) Write-through caching.
   - Persist both degraded and validated outputs with TTLs. Prefetch must upsert degraded so GET can read from cache only.

3) Strict time cap and controlled fan-out.
   - Cap first response to ~1s; limit prefetch concurrency (e.g., ≤2) and defer the rest.

4) Observability.
   - Add `extras`: { cacheHit, degradedUsed, firstByteMs, computeMs, backgroundUpgradeMs } and emit lightweight analytics entries to confirm SLAs in production.

Rollback Guidance
- To return to the prior baseline, revert: `0d468e4 10ee692 0cd1336 7e8d681`.

Commit References
- `10ee692` — Nutrition quick path (1s race) + background upgrade.
- `0cd1336` — Quick result type fix (`mode`, `range`).
- `0d468e4` — Degraded-first for all sections, no timeout, extras mapping, prefetch warm.
- `7e8d681` — Prefetch TypeScript fix and cleanup.

Note
- The attempted fix failed because first paint still waited for a live LLM call. To truly reduce cold latency, serve cached or pre-generated degraded data immediately, then upgrade asynchronously.
