<!-- a49c4e34-eb45-492f-95eb-c25850b4e02a 17da865a-2c44-4b32-b544-6c5810394ab1 -->

## IMPORTANT: Incident summary (plain English)

- What happened: The Supplements page took about 55 seconds to open on live. This made things worse than before.
- What you saw: A green banner saying “Initial guidance…” but the lists were empty at first.
- What changed: I added an extra AI “rewrite” step and more AI calls. This made the first load slower.
- What to do now: If you want to undo this, revert commit d04c946bf2486789ff0a4e9104fa8d3020c2af0a.
- Where to read details: Scroll down to “Incident Report — v3 Attempt (2025-10-11)” for the full notes.

---

### AI-only Insights: Domain-correct, Guaranteed Counts, Instant Loads

## Summary
- No static validation lists. Use a two-stage AI pipeline (generate → classify) to keep Nutrition/Exercise/Supplements/Medications strictly in-domain and still be fully AI-generated.
- Guarantee counts: Suggested ≥4 and Avoid ≥4 for each relevant section, even with empty logs; Working shows only logged items.
- Precompute immediately after intake and on Insights landing so sections open instantly from cache. Guardrails prevent caching malformed data.

## Post-deploy findings (2025-10-10)
- User reported 30s+ waits opening insight sections. Target is ≤4s warm / ≤7s cold.
- For issue “Bowel Movements”, Supplements tab family returned no content; banner showed “couldn’t generate guidance”. This violates “always produce guidance” (≥4 suggested, ≥4 avoid) based on health intake + AI.

## Field report (2025-10-12) – Laptop
- User reports ~60s load times when opening Supplements, Nutrition, and other sections; unacceptable.
- Quality: Suggested tab sometimes <4 items and Avoid <4; content is too generic.
- Action: Treat as P0. Update plan to enforce instant-first render and guaranteed counts.

## What v2 implemented (this commit series)
- lib/insights/llm.ts: two-stage pipeline (generate → classify → fill-missing), default Avoid min raised to 4, timing logs, helpers for classification/fill.
- lib/insights/issue-engine.ts: cache writes only when validated; `pipelineVersion: "v2"`; extras.validated; section builders now compute validated flag and tag results; min Avoid=4 everywhere; timing logs.
- app/api/.../prefetch/route.ts: implemented batch prefetch; returns 202; default concurrency=3.
- app/api/user-data/route.ts: post-intake precompute concurrency raised to 3.
- UI prefetcher passes concurrency=3; stays cache-first.

## Suspected causes of current gaps
1) Over-filtering after classification: items labeled canonicalType=other are dropped; fill-missing may produce ambiguous items → filtered to zero → validated=false → no cache → repeated cold waits.
2) Strict null handling: intermittent JSON formatting or model hiccups return null; builders then display “couldn’t generate” instead of a degraded-but-valid result.
3) Precompute not fully hiding cold latency: on first open, cache may still be cold (many sections × issues). Concurrency 3 may be insufficient under live load.
4) Cache only-on-validated: when validation fails, we cache nothing; user re-triggers the same slow cold path.

## Remediation plan (v3)
1) Rewrite-to-domain pass (AI-only, no static lists)
   - For any candidate classified as `other` or `out-of-domain`, run a targeted rewrite prompt to transform it into the required domain (e.g., Nutrition → foods only; Supplements → nutraceuticals only). Re-classify. Do up to 2 rewrite attempts before fill-missing.
2) Stronger fill-missing and diversity
   - Increase retries 2 → 3. Add diversity hints (macro groups for foods; modality families for exercise; compound classes for supplements/meds). Ensure unique names after case-insensitive dedupe.
3) Degraded-but-valid fallback (no nulls, ever)
   - If generation or classification fails, synthesize a minimal, domain-correct result (4/4) from intake context + best-practice ontology. Mark `extras.validated=false, pipelineVersion="v2"` and `extras.degraded=true` so background jobs can upgrade.
4) Precompute that truly hides cold latency
   - Trigger on Insights landing for any missing caches across all issues. Lift concurrency to 4 (measure p50/p95). Maintain short 202 responses; background write to cache.
5) Caching policy adjustments
   - Temporarily cache degraded results (TTL ~2 min) to avoid repeated cold retries in one session. A background worker re-runs rewrite/fill to upgrade to validated.
6) Observability & SLOs
   - Add per-phase timings to `extras` (generateMs, classifyMs, rewriteMs, fillMs, totalMs) and log cacheHit/cacheMiss. Expose a lightweight summary via `GET /api/analytics?action=insights` for production checks.

### Immediate hotfixes (ship before full v3)
1) UI: never block on LLM – render degraded/cached instantly; show subtle “updating…” while background refresh completes.
2) Backend: cache degraded-but-valid results for 2 minutes (TTL) to avoid repeat cold hits per session.
3) Concurrency: raise precompute concurrency to 4; parallelize section fetches.
4) Counts: harden fill-missing to force ≥4 Suggested and ≥4 Avoid even with empty logs; dedupe names case-insensitively.
5) Nutrition specificity: include 7‑day averages (protein, fiber, sugar, sodium, calories) and top foods in prompt; require quantified actions.
6) Guardrails: if classification returns `other`, run rewrite pass (1–2 attempts) before giving up.

## File-level guidance for next agent
- lib/insights/llm.ts
  - Add `rewriteCandidatesToDomain(...)` helper. Input: items classified `other`/out-of-domain + target mode. Output: rewritten items (names, reasons, optional protocol) strictly in-domain. Reuse classifier to confirm.
  - Extend `generateSectionInsightsFromLLM(...)` to insert rewrite stage before fill-missing; track timings in `extras`.
- lib/insights/issue-engine.ts
  - Include new timing fields in `extras`. When `validated=false`, set a short cache TTL path via DB (or tag in extras for the upgrader).
  - Precompute: consider `concurrency=4` and trigger on Insights landing payload when cache miss is detected.
- app/api/insights/issues/[slug]/sections/prefetch/route.ts
  - Accept `forceAllIssues=true` to precompute multiple issues from any page that needs it.
- app/insights/issues/[issueSlug]/SectionPrefetcher.tsx
  - If cache miss, render degraded result immediately and refresh background; never block UI on LLM.

## Acceptance Criteria (updated)
1) Every section returns Suggested ≥4 and Avoid ≥4 even with empty logs, built from intake context + AI. Strictly domain-correct.
2) No user-visible “couldn’t generate” states; degraded results render while background upgrades cache.
3) Warm ≤1s; cold ≤7s. First open after intake uses precomputed cache or degraded path immediately.
4) No malformed data cached; degraded results expire quickly and get upgraded automatically.

## Live verification protocol
1) After deploy, test 3 issues (include “Bowel Movements”). Confirm each section has ≥4 suggested and ≥4 avoid, domain-correct.
2) Measure TTFB; confirm warm <1s. Cold open should render instantly (degraded or cached) and upgrade silently.
3) Check logs for timings (generateMs/classifyMs/rewriteMs/fillMs/totalMs) and cache hits/misses.



---

## Incident Report — v3 Attempt (2025-10-11) commit d04c946

Purpose: Record exactly what changed in this attempt, how it regressed the live experience (55s open on Supplements), and how to safely undo or take a different path.

### What Changed (by file)
1) lib/insights/llm.ts
   - Added rewrite-to-domain stage: `rewriteCandidatesToDomain(...)` with re-classification.
   - Increased fill-missing attempts 2 → 3; added diversity hints per section.
   - Introduced `generateDegradedSection(...)` to synthesize 4/4 when the main LLM call fails.
   - Added timing capture into an internal field `result._timings` (note: not propagated into `extras`).

2) lib/insights/issue-engine.ts
   - Integrated degraded fallback only when the primary LLM call returns null (not on slow success or low counts).
   - Marked `extras.degraded = !validated` on section results; left `extras.source = 'llm'` even for degraded.
   - Allowed caching of degraded results with short TTL (2 minutes) and adjusted cache reads to honor this TTL.
   - Increased default precompute concurrency to 4.

3) app/api/insights/issues/[slug]/sections/prefetch/route.ts
   - Default `concurrency=4`; optional `forceAllIssues` flag (no caller uses it yet).

4) app/insights/issues/[issueSlug]/SectionPrefetcher.tsx
   - Sends `concurrency=4` to prefetch API. No UI change to render degraded immediately on cache miss.

5) app/api/analytics/route.ts
   - `GET?action=insights` now returns recent timing events from in-memory analytics, but no emitters were added, so it returns empty in practice.

### Observed Regressions (live)
- Supplements section (e.g., Libido → Supplements) took ~55 seconds to open (user report). Target was ≤7s cold/≤1s warm.
- Panels displayed “Initial guidance generated while we prepare a deeper report.” but still showed empty lists instead of guaranteed 4/4.

### Why This Likely Happened
1) Extra LLM hops on the cold path:
   - New pipeline does: generate → classify → rewrite (per bucket) → re-classify → fill-missing (up to 3) → re-classify.
   - Worst case adds multiple sequential OpenAI calls, increasing latency per section.

2) Degraded fallback is gated on a hard failure only:
   - It triggers only when the main LLM response is null. If the LLM responds slowly or returns low/empty counts, the code still waits the full slow path instead of returning a degraded 4/4 immediately.

3) UI still blocks on section generation when cache is cold:
   - The client `SectionPrefetcher` sends concurrency=4, but it does not render a degraded result immediately on cache miss. Users still wait.

4) Timings not surfaced where expected:
   - Timings are stored on `result._timings` and never copied into `extras`, so observability goals in this attempt are unmet.

### Guidance for Next Agent (Do NOT repeat these choices)
1) Do not gate degraded rendering on LLM null. Use a time cap:
   - If no validated cache within ~1s of opening (or after a background precompute window), render a pre-built degraded 4/4 immediately while the validated job runs in background.

2) Cut down LLM round-trips:
   - Consider merging rewrite+classify into a single structured step, or skip rewrite on the first attempt and only rewrite the specific deficits.

3) Put timings in `extras` and emit analytics events:
   - `extras`: { generateMs, classifyMs, rewriteMs, fillMs, totalMs, cacheHit }
   - Emit to `/api/analytics` so `GET?action=insights` returns real data.

4) UI behavior on cache miss:
   - Show degraded results instantly when validated cache is missing, and auto-refresh in the background.

5) Cache policy:
   - It’s acceptable to store degraded with a very short TTL, but prefer serving degraded from an in-memory/session cache while a background task upgrades to validated.

### Rollback Instructions (safe, single-commit)
Do not deploy from this branch without approval. To restore the prior v2 baseline quickly:
- `git revert d04c946bf2486789ff0a4e9104fa8d3020c2af0a` (preferred) and push to master to trigger Vercel.
- If a hard reset is preferred locally: `git reset --hard 50ef11e` then push with `--force-with-lease` (use with caution).

### Commit Reference
- v3 attempt commit: d04c946bf2486789ff0a4e9104fa8d3020c2af0a
  - Scope: llm.ts, issue-engine.ts, prefetch route, client prefetcher, analytics route
  - Effect: slower cold path, no immediate degraded render, timings not visible in `extras`.

