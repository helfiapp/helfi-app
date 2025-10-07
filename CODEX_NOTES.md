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
