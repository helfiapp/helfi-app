# CODEX NOTES

## Overview
- Goal: Generate issue insights (supplements, medications, exercise, nutrition, lifestyle, labs) directly from the OpenAI LLM without relying on a hand-curated knowledge base.
- Status: Code has been refactored to call the LLM for all sections, enforce minimum "working / suggested / avoid" counts, and surface LLM failure states. However, production responses are still coming back empty ("We couldn’t generate guidance right now") for several sections (e.g. Bowel Movements → Supplements), so the UX remains incomplete.

## Work Attempted
1. **LLM Helper (`lib/insights/llm.ts`)**
   - Added a shared helper that wraps the OpenAI client, enforces JSON response schema via zod, and retries with stronger instructions if the model omits required buckets.
   - Supports modes: supplements, medications, exercise, nutrition, lifestyle, labs.
   - Implements minimum counts (currently 1 working, 2 suggested, 2 avoid) and retries up to 2 times before returning `null`.

2. **Supplements & Medications**
   - Replaced the rule-based logic with calls to the new helper.
   - Removed all hard-coded fallbacks; if the model fails, the UI shows a "generation unavailable" message.
   - Front-end shells now display every item returned (no filtering of `alreadyCovered`).

3. **Exercise, Nutrition, Lifestyle, Labs**
   - Migrated each builder to the LLM helper with appropriate context data:
     - Exercise uses recent exercise logs and supplements.
     - Nutrition uses recent/today foods and supplements.
     - Lifestyle uses profile attributes (gender, weight, height, exercise frequency, etc.).
     - Labs uses stored blood markers.
   - Added failure states identical to supplements/medications.

4. **Knowledge Base Removal**
   - All sections now ignore `ISSUE_KNOWLEDGE_BASE` hints for classification—the LLM works solely from user data and general knowledge.

5. **Prompt Tightening**
   - Updated prompt instructions to insist on populated "suggested" and "avoid" buckets even when user data lacks examples.

## Current Observations
- Deployments complete successfully (latest commits: `5487117`, `26d8d24`).
- Production still returns empty results for several sections (e.g. Bowel Movements → Supplements). The UI shows the new error message or the legacy "everything covered" message, indicating the helper is either returning `null` (after retries) or an empty array.
- The response timestamp updates when "Daily report" is pressed, so the API endpoint is executing but likely hitting one of the following:
  1. OpenAI API error (rate limit, auth, missing env var) causing the helper to return `null`.
  2. Model returning JSON that fails schema validation (logged to server console).
  3. Run hitting the retry loop but still not meeting min counts (e.g. model keeps returning 0 items); helper eventually returns `null`.

## Next Steps / Recommendations for Incoming Agent
1. **Check Server Logs**
   - Inspect `app/api/insights/issues/[slug]/sections/[section]/route.ts` execution logs or `vercel logs` to see the exact error. The helper writes to `console.error('[insights.llm] ...')` when parsing fails. Grab the raw model response if possible.
2. **Test Locally with Real Data**
   - Run the API locally with `OPENAI_API_KEY` to inspect the JSON coming back for an issue such as `bowel-movements`. Consider lowering `minSuggested`/`minAvoid` temporarily to see if the model returns at least one item.
3. **Prompt Tuning**
   - If the model still outputs "everything covered" despite stronger instructions, we may need explicit examples in the prompt or to inject standard references (e.g. generic bowel health suggestions).
4. **Add Telemetry**
   - Consider persisting the LLM request/response (with PHI stripped) in a temporary table to debug production behavior.
5. **Complete Section Coverage**
   - Ensure each section's front-end routes (e.g. `nutrition/suggested/...`) render the new `extras` structure. They currently expect arrays of objects as provided by the helper.

---
If additional detail is required, check Git history around commits `03c415a`, `ceef23b`, `5487117`, and `26d8d24` for exact code changes.

## 2025-10-09 — Regression report after Insights overhaul (deploys 73c82c7, f9287a9, 3a3572c)

Summary
- After today’s changes, several Insights sections (notably Libido → Supplements) return “We couldn’t generate guidance right now.” The UI shows empty buckets where previously some content appeared. Load time improvements were not realized on first render.

What I changed (files and intent)
1) `lib/insights/llm.ts`
   - Increased cache TTL to 30m (in‑memory) initially, then reduced retries 2→1 and max_tokens 900→700 to speed up responses.
   - Added `profile` into the LLM input so prompts can consider gender/height/weight/exercise frequency.
   - Tightened prompts to explicitly audit every logged item (focusItems) and classify into working/avoid with mechanism‑based reasons; added libido‑specific rules (DHT/NO/SHBG; 5‑alpha‑reductase caution).
   - Kept strict zod schema and `response_format: json_object` parsing.

2) `lib/insights/issue-engine.ts`
   - Removed brittle blocker text for Libido that falsely said “No libido‑supportive supplements logged”.
   - Passed `profile` to all LLM section calls.
   - Added a targeted saw‑palmetto caution append for male Libido when avoid list is sparse.
   - Added a new persistent DB cache `InsightsSectionCache` (15m TTL) that saves per user/issue/section/mode. Reads on GET; writes on both forced POST and computed builds.

3) UI
   - Added `SectionPrefetcher` (`app/insights/issues/[issueSlug]/SectionPrefetcher.tsx`) to POST‑generate all sections in the background when entering an issue landing page.
   - Fixed a build error by importing `ISSUE_SECTION_ORDER` as a value (commit `3a3572c`).

What broke (observed)
- Libido → Supplements now often shows the generation‑unavailable state (null LLM result), where previously there was at least some output (albeit generic).
- “Supplements to Avoid” frequently empty.
- First load remains slow; background prefetch didn’t help in production.

Likely root causes
1) Strict JSON contract with low retry budget: Reducing retries to 1 + strict zod schema + `response_format` increases the chance of a null parse result in production (model returns slightly off‑schema or minimal lists).
2) Caching of failure states: The new DB cache writes whatever the builder returns, including error/empty results. Combined with background prefetch, a single early failure can be cached for 15 minutes and repeatedly served.
3) Concurrency spike: `SectionPrefetcher` fires POST to all sections concurrently, which may increase transient failures/rate limits and then cache those failures.
4) Model/config mismatch: If `OPENAI_INSIGHTS_MODEL` on prod differs or lacks stable JSON behavior, the schema gate will fail more often than in dev.

How to revert quickly (safe rollback)
- Revert these commits in order (newest first):
  - `3a3572c` (build import fix) — harmless but included for completeness
  - `f9287a9` (DB cache + prompt audit + retry/token changes)
  - `73c82c7` (prompt/libido rules, blocker removal, prefetcher)
- Or reset to pre‑overhaul state at `26d8d24` (previous deploy referenced in earlier notes), which still produced content albeit generic.

Concrete fixes for next agent (open items only)
1) Logging:
   - Add server logs around `[insights.llm]` to capture content on parse failure in production (ideally redact PHI). This was recommended previously but still needed to diagnose live behavior.

User‑reported impact
- “Now I’m getting no results at all.” Libido supplements show generation‑unavailable; Cistanche is not surfaced; Avoid often empty; perceived performance unchanged.

Action for the next agent
- Please implement “don’t cache failures” first, roll back retries/tokens, and re‑test on live. If necessary, temporarily disable the background prefetcher to reduce error caching while iterating. Then tighten prompts once stable.


## 2025-10-10 — Live user complaints and accuracy/UX defects (must-fix brief)

Context
- User is evaluating Insights on production only (no staging/local). New deploys were initially “staged” due to rollback pin; once unpinned, latest deploys became Current.
- User’s supplement log includes items specifically for Libido (e.g., Cistanche, Zinc Picolinate, Tongkat Ali/Muira Puama, Vitamin D3). Food logs were not recently updated during testing.

Top problems (as reported on live)
1) Supplements → What’s Working: Missing logged items
   - Cistanche (a libido‑specific botanical) does not appear under “What’s Working” even though it’s logged and clinically relevant to libido.
   - The section sometimes shows fewer items than before the overhaul (e.g., fewer than 3; sometimes 0), which feels like a regression.

2) Supplements → Avoid: Irrelevant items previously included; now often empty
   - Prior versions incorrectly showed Alcohol as a “supplement to avoid” (not a supplement). This was filtered out, but now Avoid is often empty when there should be plausible avoid/caution items (e.g., 5‑alpha‑reductase inhibitors in male libido contexts).
   - User requirement: “AI‑only” recommendations. Do not hard‑code content to paper over model gaps. One exception currently in code: a saw‑palmetto caution may be appended when sparse; user prefers avoiding such hard‑coded adds if AI can be improved.

3) Nutrition section logic is contradictory when no recent logs
   - Header correctly says “No recent food entries — log today’s meals…”, but:
   - “Suggested Foods” sometimes shows a generic message implying the user already covers the core nutrition moves (wrong when there are no recent logs).
   - “Foods to Avoid” sometimes shows nothing at all despite the issue context (should still propose general avoid patterns tailored to the issue if logged data is missing).
   - User expectation: provide at least 4 specific suggested foods for the issue with clear, mechanism‑based “why,” and a non‑empty avoid list when appropriate. If no recent logs, explicitly state that in Working, but Suggested/Avoid should still populate with clinician‑sensible guidance.

4) Output quality: too short, too generic
   - Suggested and Avoid items need richer rationale: mechanism + relevance to the specific issue, and concrete dose/timing where applicable (for supplements). The user does not want generic, filler statements.

5) Performance: unacceptable load time (up to ~20s)
   - The user experiences 15–20 second waits for sections to render.
   - Likely contributors:
     - Cold starts + serialized OpenAI calls with larger tokens
     - Prefetch concurrency earlier causing rate limits and cached failures
     - Returning “null” on schema miss then recomputing again
     - DB/cache reads per section without effective warm cache policy

6) Consistency across sections
   - Every section (Supplements, Medications, Exercise, Nutrition, Lifestyle, Labs) should:
     - Respect “Working = logged items only” but still provide Suggested/Avoid when logs are missing.
     - Hit minimum counts (Working ≥1 when plausible; Suggested ≥4; Avoid ≥2) unless clearly impossible (e.g., no data and no general guidance)—in that case, say why and how to add data.



Observed screens (user screenshots)
- Libido → Supplements → Working: shows some botanicals (e.g., Muira Puama, Zinc) but Cistanche missing despite being logged.
- Libido → Supplements → Avoid: previously listed “Alcohol”; now filtered out but often empty.
- Libido → Nutrition → Working/Suggested/Avoid: shows “No recent food entries,” but Suggested sometimes claims “Your logged meals already cover the core moves,” and Avoid sometimes shows nothing.

Acceptance criteria (what “good” looks like)
1) Supplements
   - Working: Includes logged libido‑supportive items (e.g., Cistanche) when clinically plausible. If excluded, provide a brief rationale in summary.
   - Suggested: ≥4 novel items (not in the user’s log), each with mechanism‑based why and, when appropriate, dosing/timing.
   - Avoid: ≥2 true supplements or med‑adjacent cautions (no foods/alcohol). If none are clinically sensible, say so explicitly.

2) Nutrition
   - If no recent logs: Working should be empty with a clear “log meals” gate. Suggested should still provide ≥4 issue‑relevant foods with detailed reasons; Avoid should list ≥2 patterns/foods to limit (e.g., high‑sugar UPFs) with rationale.
   - If there are logs: Working includes foods actually logged; Suggested and Avoid still target ≥4 and ≥2, respectively.

3) Detail and tone
   - For every item, include concise mechanism + relevance to the issue; include dose/timing where applicable. Avoid generic filler.

4) Performance
   - P95 time‑to-first‑render for a section ≤4s after warmup (≤7s cold start). Daily/Weekly regeneration ≤6s P95 after first run.

5) AI‑only policy
   - No hard‑coded items in outputs. If a guardrail is temporarily needed (e.g., saw palmetto caution), document it and remove once prompting/validation stabilizes.

Engineering causes (suspected) and fixes to implement
1) Prompt/validation gaps
   - Require the model to prioritize logged items in Working, and still populate Suggested/Avoid with minimum counts when logs are absent.
   - Add stronger, explicit issue‑specific rules so libido botanicals like Cistanche are evaluated and surfaced when appropriate.
   - Keep strict JSON but allow salvage parsing again if response_format deviates.

2) Performance tactics
   - Cap tokens to ~650–750 where safe; reduce temperature; reuse short, issue‑specific prompts.
   - Parallelize independent sections on the server but limit concurrency to 2–3 to avoid rate limiting.
   - Add server‑side timing logs per section (DB fetch, LLM call, parse, render).

3) Telemetry
   - Log parse failures with redacted content and the invalid schema issues. Capture counts of empty buckets per section.

Repro steps for current defects
1) Ensure supplements include libido botanicals (e.g., Cistanche) in the user profile.
2) Visit Libido → Supplements; tap Daily report. Observe Working excludes Cistanche; Avoid may be empty.
3) Visit Libido → Nutrition with no recent food logs. Observe “No recent food entries” but Suggested says “logged meals cover core moves,” and Avoid may be empty.
4) Measure load times; user observes up to ~20s.

User non‑negotiables
1) AI must generate all items. No manual/hidden hard‑coding.
2) Clear, non‑generic explanations with mechanisms and practical cadence/dose/timing.
3) At least 4 suggestions in Suggested and ≥2 in Avoid for every section, unless impossible; then say why and how to provide data.
4) Fast render (<~4–7s per section after warm) and consistent behavior across sections.
