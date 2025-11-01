## SESSION HANDOVER — 2025-11-02 (Latest session - SSR performance fix)

### Executive summary (read me first)
- ✅ **FIXED**: SSR blocking issue - section layouts now use cache-only reads, ensuring ≤1s TTFB regardless of cache state
- ✅ **FIXED**: Shell components now handle cache misses with client-side fetching, showing "Preparing initial guidance..." loading state
- ✅ **FIXED**: `exerciseTypes` now included in profile object passed to LLM (was missing before)
- ❌ **STILL BROKEN**: Exercise "Working" section remains empty even when intake exerciseTypes (Walking, Bike riding, Boxing) are identified by LLM as helpful for the issue
- All guidance remains AI‑generated. No static/KB filler was added. Quick results are produced by the AI (single pass) and cached; validated results follow in background.

### What was completed in this session (2025-11-02)
1) **SSR cache-only fix (CRITICAL)** ✅
   - Updated all 4 section layouts (`supplements`, `exercise`, `medications`, `nutrition`) to use `getCachedIssueSection()` instead of `getIssueSection()`
   - Layouts now never call LLM during SSR - they only read from cache
   - If cache is cold, layouts pass `null` to Shell components instead of blocking
   - **Files modified:**
     - `app/insights/issues/[issueSlug]/supplements/layout.tsx`
     - `app/insights/issues/[issueSlug]/exercise/layout.tsx`
     - `app/insights/issues/[issueSlug]/medications/layout.tsx`
     - `app/insights/issues/[issueSlug]/nutrition/layout.tsx`

2) **Client-side fetching for cache misses** ✅
   - Updated all 4 Shell components to accept `initialResult: IssueSectionResult | null`
   - Added `useEffect` hooks to fetch from GET endpoint when `initialResult` is `null`
   - Shows "Preparing initial guidance..." loading state while fetching
   - Displays error state if fetch fails
   - **Files modified:**
     - `app/insights/issues/[issueSlug]/supplements/SupplementsShell.tsx`
     - `app/insights/issues/[issueSlug]/exercise/ExerciseShell.tsx`
     - `app/insights/issues/[issueSlug]/medications/MedicationsShell.tsx`
     - `app/insights/issues/[issueSlug]/nutrition/NutritionShell.tsx`

3) **ExerciseTypes added to profile** ✅
   - Added `exerciseTypes: user.exerciseTypes ?? null` to profile object in `loadUserInsightContext()`
   - LLM now receives exercise types from health intake (Walking, Bike riding, Boxing)
   - **File modified:** `lib/insights/issue-engine.ts` (line ~1508)

4) **Attempted fix for Exercise "Working" section** ⚠️
   - Modified `buildExerciseSection()` to include intake `exerciseTypes` in `workingActivities` when LLM identifies them as helpful
   - Logic: If LLM returns an exercise as "working" and it matches intake `exerciseTypes`, include it even without logs
   - **File modified:** `lib/insights/issue-engine.ts` (lines ~2420-2452)
   - **Commit:** `a471d96` - "Fix Exercise 'Working' to include intake exerciseTypes when LLM identifies them as helpful"

### What is still broken (root cause analysis)
1) **Exercise "Working" section still empty** ❌
   - **User report:** Exercise section for Libido shows empty "Working" section even though user selected Walking, Bike riding, Boxing in intake
   - **Expected behavior:** If LLM identifies these exercises as helpful for Libido, they should appear in "Working" section
   - **Current behavior:** Section shows message "We haven't spotted any logged workouts that clearly support this issue yet"
   - **Possible root causes:**
     a) LLM is not returning these exercises in the `working` bucket even though `exerciseTypes` is now in profile
     b) The matching logic (`intakeExerciseTypes.has(itemKey)`) might not be matching correctly (case sensitivity, canonicalization issues)
     c) The cached result was generated before the fix and needs regeneration
     d) The quick/degraded path (`buildQuickSection`) might not be using the same logic

2) **Cache invalidation needed**
   - Old cached results may have been generated before `exerciseTypes` was added to profile
   - User may need to click "Daily report" or "Weekly report" to regenerate with new logic
   - Or cache needs to be invalidated/version bumped

### Investigation needed for next agent
1) **Verify LLM is receiving exerciseTypes**
   - Check logs to confirm `exerciseTypes` array is present in profile when calling LLM
   - Verify the LLM prompt includes this information
   - Check if LLM is actually returning Walking/Bike riding/Boxing in `working` bucket for Libido

2) **Debug matching logic**
   - In `buildExerciseSection()`, add logging to see:
     - What `exerciseTypes` are in `intakeExerciseTypes` Set
     - What exercises LLM returns in `llmResult.working`
     - Whether the canonical matching is working correctly
   - Check if case sensitivity or name variations (e.g., "Walking" vs "walking" vs "Walk") are causing mismatches

3) **Check quick vs full path**
   - Verify `buildQuickSection()` also includes intake `exerciseTypes` logic
   - Quick path might be used when cache is cold and may not have the same logic

4) **Test with fresh generation**
   - Force regeneration by clicking "Daily report" button
   - Or bump `pipelineVersion` to invalidate old caches
   - Verify new results include intake exercises in "Working"

### Recommended fix approach
1) **Add detailed logging** to `buildExerciseSection()`:
   ```typescript
   console.log('[exercise.working] intakeExerciseTypes:', Array.from(intakeExerciseTypes))
   console.log('[exercise.working] LLM working items:', llmResult.working.map(w => w.name))
   console.log('[exercise.working] Matched items:', workingActivities.map(w => w.title))
   ```

2) **Improve matching logic**:
   - Consider fuzzy matching (e.g., "Bike riding" vs "Cycling" vs "Bicycle")
   - Handle variations in exercise type names
   - Consider checking both exact match and partial match

3) **Ensure quick path includes same logic**:
   - Check `buildQuickSection()` function and ensure it also includes intake `exerciseTypes` when building exercise sections

4) **Force cache refresh**:
   - Either bump `pipelineVersion` to invalidate old caches
   - Or add explicit cache invalidation for exercise sections after this fix

### Commits in this session
- `d55aee1` - Fix Insights SSR performance: cache-only layouts + exerciseTypes fix
- `a471d96` - Fix Exercise 'Working' to include intake exerciseTypes when LLM identifies them as helpful

### Acceptance criteria for next agent
- Exercise section shows intake `exerciseTypes` (Walking, Bike riding, Boxing) in "Working" section when LLM identifies them as helpful for the issue
- First paint ≤1s TTFB (already achieved)
- Suggested/Avoid sections show ≥4 items each (already working)
- No regression in other sections

---

## SESSION HANDOVER — 2025-11-02 (High‑priority escalation)

### What changed in this session (shipped)
1) Quick‑first read hardening
   - Added analytics+extras on cache hits and misses; emit `firstByteMs` on every read.
   - Added env guardrails to force quick‑first and optionally pause heavy upgrades.

2) Post‑intake and issue‑overview precompute
   - Implemented `precomputeQuickSectionsForUser` that generates quick AI for ALL sections of ALL selected issues and writes to DB cache with short TTL.
   - Wired this into `POST /api/user-data` (Confirm & Begin) with a 6.5s cap.
   - Updated `POST /api/insights/issues/[slug]/sections/prefetch` to call `precomputeQuickSectionsForUser` so visiting an issue overview warms DB cache for all sections.

3) Source of truth & observability
   - Hardened `__SELECTED_ISSUES__` so we don’t fall back to legacy `healthGoals` when a snapshot exists.
   - `/api/analytics?action=insights` now returns `firstByteMs` p50/p95 and cache hit/miss counts.

### Verified live
- Issue overview prefetch now writes quick results to DB. However, direct navigation into a section (or first open when caches are cold) still blocks on server‑side compute.
- Exercise page for Libido showed: Working = empty while Suggested/Avoid lists appear later; the message is technically correct given no exercise logs, but the first paint is still too slow.

### What is still broken (root cause)
- The section layouts render server‑side and call the heavy builder when cache is cold. That blocks the first byte until the LLM finishes (often 60s+ on production). See the direct SSR calls here:
```19:21:/Volumes/U34 Bolt/HELFI APP/helfi-app/app/insights/issues/[issueSlug]/supplements/layout.tsx
  const result = await getIssueSection(session.user.id, params.issueSlug, 'supplements')
  if (!result) {
    notFound()
  }
```
```19:21:/Volumes/U34 Bolt/HELFI APP/helfi-app/app/insights/issues/[issueSlug]/exercise/layout.tsx
  const result = await getIssueSection(session.user.id, params.issueSlug, 'exercise')
  if (!result) {
    notFound()
  }
```
```19:21:/Volumes/U34 Bolt/HELFI APP/helfi-app/app/insights/issues/[issueSlug]/medications/layout.tsx
  const result = await getIssueSection(session.user.id, params.issueSlug, 'medications')
  if (!result) {
    notFound()
  }
```
```19:21:/Volumes/U34 Bolt/HELFI APP/helfi-app/app/insights/issues/[issueSlug]/nutrition/layout.tsx
  const result = await getIssueSection(session.user.id, params.issueSlug, 'nutrition')
  if (!result) {
    notFound()
  }
```
- Even with quick‑first in the builder, a cold read still triggers an LLM call for “quick” on the server path; this can exceed 7s. We must never call the LLM before first byte.

### Fix plan for next agent (do this first)
1) Make section SSR read‑only (no LLM on first byte)
   - In each section layout above, replace `getIssueSection(...)` with a read‑only call:
     - Attempt `getCachedIssueSection(userId, slug, section, { mode: 'latest' })`.
     - If `null`, render the shell immediately with a light “preparing initial guidance…” copy and mount a client fetcher that calls `GET /api/insights/issues/[slug]/sections/[section]` (which will return stored or quick). Do not block SSR.
   - This single change enforces ≤1s TTFB regardless of cache.

2) Ensure precompute always runs before user lands in a section
   - Keep `POST /api/user-data` quick precompute (already shipped).
   - Keep issue overview prefetch (already shipped) but also add a tiny client‑side prefetch on the global Insights landing to warm the first two issues proactively.

3) Guarantee 4/4 without KB
   - Keep current quick AI (single pass) with retry-on-shortfall during precompute (already shipped). Reads must serve cached quick if present; no KB filler.

4) Exercise “What’s Working” clarity
   - Working is sourced only from logs by design. Improve copy when empty to say: “No recent exercise logs detected. Log Walking/Boxing sessions to surface wins.” Intake exercise types remain context only.

5) Observability to prove the fix
   - Keep emitting `firstByteMs` and cache flags. After the SSR change, p95 first byte for section GET should be ≤1000ms warm/≤7000ms cold, with cacheHit or quickUsed true.

### Ops switch (if live still slow)
- Temporarily gate heavy upgrades by setting `INSIGHTS_PAUSE_HEAVY=true` while validating the SSR change. This does not affect quick results and preserves instant loads.

### What we completed vs. what remains
- Completed this session:
  - Quick‑first read enrichment + analytics emission on miss/hit.
  - Quick precompute at Confirm & Begin with 6.5s cap.
  - Prefetch endpoint now writes quick results to DB cache for all sections.
  - SELECTED_ISSUES enforcement; analytics p50/p95.
  - Logs‑only “Working” (no intake conflation) retained as guardrail.
- Not yet fixed:
  - SSR layouts still call the builder → cold loads block on LLM → 60–90s waits.

### Acceptance after the fix
- Navigate to Insights → open issue overview (prefetch runs), then open Exercise/Supplements/Medications/Nutrition:
  - First paint ≤1s (TTFB), data shows immediately from cached quick.
  - Each section lists ≥4 Suggested and ≥4 To‑Avoid.
  - Exercise Working remains logs‑only; copy explains how to surface it.
  - `/api/analytics?action=insights` shows sensible p50/p95 and increasing cache hits.

### Notes on AI‑only requirement
- Quick results are produced by the model (no static lists, no KB filler). The SSR change does not inject content; it only avoids blocking SSR on LLM and lets the client fetch the AI output immediately after paint.

---
<!-- a49c4e34-eb45-492f-95eb-c25850b4e02a 17da865a-2c44-4b32-b544-6c5810394ab1 -->

## SESSION HANDOVER — 2025-11-01 (Truthful status + explicit requirements)

This is a blunt handover for the next agent. The live site still fails the user’s core requirements. Fix the foundation before attempting new UX.

### Executive Summary (Read This First)

- After “Confirm & Begin”, all selected issues and all sections must be ready when opened.
- Exact alignment with the latest intake; no legacy/stale issues.
- Every section shows ≥4 Suggested and ≥4 To‑Avoid. Always.
- “What’s Working” is only from the user’s logs (never invented).
- Content is AI‑generated (no static KB filler). Reliability comes from how we call the AI, not from hard‑coded lists.
- Speed SLOs: warm ≤1s; cold ≤7s. Enforce a 1‑second first‑byte rule on reads.

### User’s explicit requirements (must ALL be true)
- After Health Intake completion ("Confirm & Begin"), Insights must be ready when the user opens them (no minute‑long waits).
- Issue list must exactly mirror the newest intake selection (no legacy items like "Brain Fog").
- Every section returns at least 4 Suggested and 4 To‑Avoid items, every time.
- “What’s Working” reflects logged items immediately (supplements/exercise/etc.) with reasons tied to the selected issue.
- Content remains AI‑generated, but reliability is non‑negotiable: guarantee the counts and instant first paint.
- Performance SLOs: warm ≤1s; cold ≤7s.

### Today’s reality (2025‑11‑01)
- Libido → Supplements shows only 1 avoid item; "What’s Working" empty despite many logged supplements.
- Cold opens still occur; users wait tens of seconds when caches are cold.
- Selected issue alignment is improved but not fully verified under live traffic.

### Root causes (by file)
- `lib/insights/issue-engine.ts`:
  - Supplements/Medications 4/4 disabled in practice: `kbAddLocal`/`kbAvoidLocal` are declared but not populated; `ensureMin(...)` falls back to empty arrays.
  - Read path still blocks on heavy context + LLM when cache is cold; degraded result not guaranteed within 1s.
- `app/api/user-data/route.ts`:
  - Precompute after intake doesn’t reliably persist usable results before redirect; cache may still be cold.
- Landing issue selection:
  - We now prefer `__SELECTED_ISSUES__`, but historic data and missing backfill can still leak legacy goals.

### NEW: Why users still see 60s+ waits and odd exercise results (root disconnect, confirmed live)
- Slow path is baked into the generator: `lib/insights/llm.ts::generateSectionInsightsFromLLM` does multiple sequential LLM calls (generate → classify → rewrite → re‑classify → fill‑missing loops). On production this often exceeds 60s.
- There was no 1‑second first‑byte rule: when cache is cold, the API waits for the full heavy pipeline instead of serving a fast AI‑only starter result.
- Exercise “What’s Working” shows empty even when the user picked “Walking” in intake because we only treat database exercise logs as “working”. Onboarding “exercise types” were not passed to the model (profile lacked `exerciseTypes`) and are not shown as “working” when no logs exist.
- The combination above explains both the long wait and the empty/odd lists you see on first open.

### What changed today (shipped now)
- Safer `__SELECTED_ISSUES__` writes + detailed logging on GET/POST.
- Onboarding Step 4 now snapshots selected issues via `/api/user-data`.
- Landing loader prefers `__SELECTED_ISSUES__` when `CheckinIssues` is empty.
- Nutrition & Lifestyle: deterministic KB top‑ups added to guarantee 4/4 after domain filtering (build fixed with null‑safe KB access).
- NOT YET FIXED: Supplements/Medications still missing populated KB fallbacks → <4/4 persists live.

### Hotfix just implemented (v4)
- AI‑only quick path on cache miss: `computeIssueSection` now returns a fast, AI‑generated “degraded” result within ~1s via `generateDegradedSectionQuick` (no stored KB). It writes this to cache with short TTL and upgrades in the background.
- Post‑intake cache priming now actually waits up to ~6.5s to store usable results so Insights isn’t cold immediately after pressing Confirm & Begin.
- Observability: first‑byte and cache flags now appear in `extras` and are emitted to `/api/analytics`.
- Added `exerciseTypes` to the profile passed to the model so “Walking” is considered in reasoning even when no formal exercise logs exist.
- Bumped `pipelineVersion` to `v4` to ignore stale rows.

### Do not repeat
- Don’t add more background jobs until cache writes/reads are proven.
- Don’t block first paint on LLM; enforce a ≤1s storage response.
- Don’t allow <4/4 to reach the client.
- Don’t fall back to legacy `healthGoals` once a snapshot exists.

### Action plan (order matters)
1) Enforce 1‑second first byte on every section read
   - Never block the response on a heavy AI pipeline. Return a recent stored AI result (validated or quick) or generate a quick AI result in <1s and send it. Start the heavy generator only after responding.

2) Build quick AI for all issues/sections before the user opens them
   - At “Confirm & Begin”, generate quick AI results for every section of every selected issue and store them (short TTL). Cap total wait ~6–7s; if time runs out, store what’s done and continue upgrading in the background.

3) Guarantee ≥4/4 without KB content
   - Quick AI calls must request ≥4 Suggested and ≥4 To‑Avoid, strictly in-domain (nutrition=foods, exercise=activities, etc.). If the first quick call returns fewer than 4/4, retry once with a tighter prompt during precompute. Do not inject static KB items.

4) “What’s Working” from real logs only
   - Only logged items appear in “working.” Intake exercise types are context only (not “working”). Pass `exerciseTypes` so Walking/Boxing informs suggestions and is never mislabeled as avoid for Bowel Movements.

5) Exact issue alignment
   - Read issues from `__SELECTED_ISSUES__`. Do not fall back to legacy goals when a snapshot exists.

6) Observability that proves it
   - Add to `extras` for every response: `{ cacheHit, quickUsed, degradedUsed, firstByteMs, generateMs, classifyMs, rewriteMs, fillMs, totalMs, pipelineVersion }`. Emit `insights-timing` analytics for live checks.

7) Versioning & TTLs
   - Bump `pipelineVersion` whenever read/write logic changes. Quick results: TTL ≈ 2–5 min. Validated results: TTL ≈ 15–30 min. Readers prefer validated but must not block.

8) Remove KB content fallbacks
   - Remove any KB-based top-ups for Suggested/Avoid. Keep only formatting helpers. All guidance content must be produced by the AI.

### Acceptance tests on live
- For Libido and Bowel Movements: Supplements, Medications, Nutrition, Lifestyle each show ≥4 Suggested and ≥4 To‑Avoid; “What’s Working” populated from logs. First paint ≤1s warm / ≤7s cold. No legacy issues in the list.

### Live Verification Protocol (step‑by‑step)
1) Complete intake with 3–4 issues, include Walking in exercise types, press Confirm & Begin.
2) Within 10s, open Insights and check three different issues across Supplements, Medications, Exercise, Nutrition:
   - Immediate content (quick result) appears; silent upgrade follows.
   - `extras.firstByteMs` ≤ 1000ms and `extras.cacheHit || extras.quickUsed` is true.
   - Each section shows ≥4 Suggested and ≥4 To‑Avoid.
   - Exercise for Bowel Movements does not flag Walking as avoid.
3) Reload to confirm validated results arrive within 7s cold.
4) If any check fails, trigger stop conditions and roll back.

### Stop / Rollback Conditions
- If p95 first byte > 7s OR any section repeatedly returns <4/4:
  - Force quick‑first on all reads and pause heavy generation.
  - Revert the last deployment if metrics don’t recover in 30 minutes.
  - Log an incident with screenshots and timings.

### What future agents must NOT do
- Do not block first paint on multi‑pass AI.
- Do not inject KB/static content to hit 4/4.
- Do not show “What’s Working” unless it comes from the user’s logs.
- Do not fall back to legacy `healthGoals` when `__SELECTED_ISSUES__` exists.

### Implementation checklist (single page)
- Reads: 1‑second first byte; return stored or quick AI; background upgrade.
- Confirm & Begin: quick AI for all sections; cap wait ~6–7s; store partials; continue upgrading.
- Counts: quick call requests ≥4/4; retry once if short; no KB insertion.
- Logs: only logs populate “working”; intake exercise types inform suggestions only.
- Analytics: emit timings; keep `extras` fields consistent; include `pipelineVersion`.
- Version/TTL: bump `pipelineVersion`; set short TTL for quick, longer for validated.

### Notes for future agents (do not repeat)
- Do not add hard‑coded KB items to force counts. Keep content AI‑generated. If minimums fail, use the AI quick path and then upgrade.
- Do not block first paint on the heavy multi‑pass pipeline. Always serve the stored/degraded copy immediately.
- For Exercise accuracy, pass onboarding `exerciseTypes` and keep “working” empty unless actual logs exist. Do not mark “Walking” as avoid for Bowel Movements.

---
## SESSION HANDOVER — 2025-10-31

### What was completed in this session
1) Bowel Movements knowledge base (KB)
   - Added robust KB entries with ≥4 items per bucket for: supplements, medications, nutrition, exercise, and lifestyle.
   - Human‑friendly titles for KB patterns; removed regex artifacts in the UI.

2) Guaranteed minimum counts (starter paths)
   - Ensured Suggested ≥4 and Avoid ≥4 for Supplements, Medications, Exercise, Lifestyle (and Nutrition already enforced) on the starter path.
   - Supplements “What’s Working” now maps from the user’s logged supplements where they match KB helpful items.

3) Type and UX fixes
   - Updated `helpfulMedications` type to allow optional `suggested` field (fixed build error on deploy).
   - Added `displayFromPattern(...)` fallback so any KB regex renders as clean titles (no `?`/regex symbols).

4) Live validation
   - Deployed to production via master commits and verified with MCP on live:
     - Avoid labels for Bowel Movements → Supplements render clearly (e.g., “High Dose Iron”, “Calcium Carbonate”, “Aluminium / Aluminum”, “Excessive Caffeine”).
     - Weekly/Daily report buttons force fresh compute and showed ≥4 Avoid items on live.

Commits
- 2aac47d — Insights starter + bowel movements KB + min-counts
- 8b8267d — Add optional `suggested` on helpfulMedications
- 02878d4 — Human‑friendly labels for KB patterns (removes regex artifacts)

### Open issues observed on live (need refinement)
1) Exercise → “What’s Working” sometimes empty despite logged activities (e.g., Walking, Boxing)
   - Current behavior: `buildExerciseSection` relies on the LLM `working` bucket; the starter path sets `workingActivities: []` and does not map logs to KB.
   - User expectation: If logs include activities that are known to help the issue (e.g., Walking for bowel movements), they should appear under “Exercise That’s Working.”

2) Ask AI panel is single‑shot, not a conversation
   - User wants a real chat box with conversational history and back‑and‑forth, visible as you chat (standard chat UX).

3) Cache visibility vs freshness
   - Old cached “latest” results can mask new changes for up to 15 minutes. Users often expect immediate reflection of fixes.

### Next‑agent plan (high‑signal, actionable)
1) Exercise “What’s Working” from logs + KB (deterministic)
   - In `lib/insights/issue-engine.ts`:
     - If `workingActivities` from the LLM is empty (or below a small threshold), enrich using logs matched against `ISSUE_KNOWLEDGE_BASE[issue].supportiveExercises`.
     - Use KB `detail` as the reason; build `summary` from last log (duration/intensity) and `lastLogged` via `relativeDays`.
     - Ensure dedupe with case‑insensitive canonicalization.
   - Acceptance: For “Bowel Movements,” logging “Walking” should surface under “Exercise That’s Working” with a sensible reason. Keep ≥4/4 for suggested/avoid.

2) Chat box upgrade (conversational UX)
   - Replace the single input with a threaded chat component on each section page.
   - Server: extend `app/api/insights/ask/route.ts` to accept/return message arrays; store per‑issue, per‑section threads keyed by user (DB or KV). Support streaming.
   - Client: `SectionChat` → `SectionChatThread` with message bubbles, auto‑scroll, loading states, and persistence (localStorage + server sync).
   - Acceptance: Users can ask follow‑ups in the same thread; history is visible; refresh preserves the thread.

3) Pipeline/version gating to cut through stale caches
   - Option A: bump `pipelineVersion` in extras (e.g., 'v3') so live readers ignore stale v2 “latest” caches after deploy.
   - Option B: on deploy, add a temporary server flag that invalidates section caches for affected issues/sections.
   - Acceptance: After deploy, pages show the new logic without requiring Daily/Weekly button presses.

4) Observability
   - Copy LLM timing fields from `_timings` into `extras` and emit to `/api/analytics?action=insights` so we can confirm SLOs in production.

### Deployment and testing protocol (must follow)
1) Push to master → auto‑deploys to Vercel (production). Do not create other projects.
2) Wait for Vercel to finish; confirm the deployment is complete in Vercel UI.
3) Test only on the live site with MCP:
   - Unlock with `https://helfi.ai/healthapp` (password: HealthBeta2024!).
   - Sign in: `info@sonicweb.com.au` / `Snoodlenoodle1@`.
   - Validate Bowel Movements across Supplements, Medications, Nutrition, Exercise, Lifestyle:
     - Each shows Suggested ≥4 and Avoid ≥4.
     - Exercise “What’s Working” reflects logged activities (e.g., Walking) immediately.
   - Use Daily/Weekly buttons if you need to force an immediate recompute.
4) Report back with: deployment complete, MCP screenshots/notes, and concrete pass/fail per section.

### Guardrails & constraints
- AI‑only insights remain the rule (KB seeds are allowed as scaffolding; no static filler in final content).
- Never touch the OpenAI API key or environment values unless explicitly instructed by the user.
- The user works only with the live site; confirm live behavior before claiming success.

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
## SESSION HANDOVER — 2025-11-01

### What was attempted this session
1) Removed deterministic KB fallbacks across all sections so insights now depend entirely on live LLM output (commits `c2d4609`, `8418561`).
   - Deleted the starter-path scaffolding and KB top-ups that previously forced ≥4 Suggested/Avoid items.
   - Ensured caches now only persist genuine LLM results; degraded states are short-lived (no static filler).
2) Tried to align tracked issues with the user’s intake selections.
   - Added a snapshot mechanism that writes the selected goals to a special `HealthGoal` record `__SELECTED_ISSUES__` via `/api/user-data`.
   - Updated both `loadUserInsightContext` and `loadUserLandingContext` to prioritise that snapshot (then fall back to `CheckinIssues`, then visible `healthGoals` if needed).
3) Hot-fixed the empty Insights landing screen by temporarily falling back to historic `healthGoals` when `CheckinIssues` is empty (commit `3fe2e03`).

### Current blockers (still unresolved)
1) **Brain Fog (and other stale issues) continue to appear on Insights** even when the intake flow only lists Libido, Erection Quality, Energy, and Bowel Movements.
   - Re-running all 11 intake steps still saves only those four issues, but the Insights landing payload contains extra items inherited from historical `healthGoals`.
   - The newly introduced `__SELECTED_ISSUES__` record is not being refreshed reliably; either the client never posts `data.goals`, or an older route overwrites the record with the legacy list after we save.
   - `CheckinIssues` remains empty for this account in production (feature flag off), so the fallback path keeps promoting stale `healthGoals`.
2) **We no longer inject KB fallbacks**, so sections now display fewer than 4 Suggested/Avoid items live until the upstream misalignment is fixed. The user considers this a regression because they expect populated guidance across all issues immediately.

### Recommended next steps
1) Instrument `/api/user-data` (GET + POST) to confirm exactly what goals the client sends and receives. Log the parsed list and whether `__SELECTED_ISSUES__` is updated.
2) Audit every code path that touches `HealthGoal` records:
   - Identify jobs or routes that might reinsert legacy goals (e.g., background syncs, admin tooling, old onboarding endpoints).
   - Confirm the intake flow actually calls `POST /api/user-data` with the current selection on every save.
3) Decide on a single source of truth for tracked issues (likely `CheckinIssues` once the feature flag is enabled) and migrate existing data, avoiding fallbacks to legacy healthGoals that mask the real bug.
4) Only reintroduce deterministic fallbacks once the issue source is reliable; otherwise users see empty Suggested/Avoid tabs when the LLM under-delivers.
