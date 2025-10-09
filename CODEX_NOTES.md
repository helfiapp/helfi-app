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

## Removed Files
- `AGENT_26_EXIT_VERIFICATION.md`
- `AGENT_30_EXIT_VERIFICATION.md`
- `AGENT_35_EXIT_VERIFICATION.md`
- `AGENT_41_EXIT_VERIFICATION.md`
- `AGENT_44_EXIT_VERIFICATION.md`
- `AGENT_46_EXIT_VERIFICATION.md`
- `AGENT_PROTOCOL_PROMPT.md`
- `AGENT_TRACKING_SYSTEM.md`

(Per request, these legacy agent documents were deleted.)

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

Concrete fixes for next agent (do before re‑enabling strict prompts)
1) Do not cache failures:
   - In `getIssueSection` and `computeIssueSection`, write to `InsightsSectionCache` only when the section is built from a successful LLM result (i.e., not the “generation unavailable” branches). Add a simple flag like `extras.source !== 'llm-error'` before persisting.
2) Restore resiliency temporarily:
   - Increase `maxRetries` back to 2 (or 3) and `max_tokens` back to ~900.
   - Keep `response_format: json_object`, but if `safeParse` fails, attempt a second pass: strip markdown fences, extract the first `{ ... }` JSON block, then parse.
3) Tame prefetch burst:
   - Either remove `SectionPrefetcher` or serialize the POSTs (Promise.allSettled with a small delay) to avoid thundering herd + failure caching.
4) Logging:
   - Add server logs around `[insights.llm]` to capture content on parse failure in production (ideally redact PHI). This was recommended previously but still needed to diagnose live behavior.
5) Validation thresholds:
   - Keep min counts, but if the model returns fewer than required, return the partial result instead of null and let the UI show it (avoid all‑or‑nothing failures).

User‑reported impact
- “Now I’m getting no results at all.” Libido supplements show generation‑unavailable; Cistanche is not surfaced; Avoid often empty; perceived performance unchanged.

Action for the next agent
- Please implement “don’t cache failures” first, roll back retries/tokens, and re‑test on live. If necessary, temporarily disable the background prefetcher to reduce error caching while iterating. Then tighten prompts once stable.

