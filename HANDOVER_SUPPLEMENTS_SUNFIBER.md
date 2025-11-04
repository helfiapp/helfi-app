# 🚨 HANDOVER: Sunfiber Not Appearing in "What's Working" (Bowel Movements → Supplements)

## Quick Start
1. **Read `insights.plan.md`** - Start at the top URGENT ADDENDUM dated 2025-11-04
2. **The problem**: "Sunfiber" logged in Health Setup does not appear under "What's Working" for Bowel Movements → Supplements
3. **Current state**: Only "Magnesium Glycinate" shows; Sunfiber is missing despite being logged
4. **User report**: Banner shows "Initial guidance..." suggesting quick/degraded path rendered first

## What Was Shipped (Now Live)
The following fixes were deployed to address AI grounding issues:

1. **Strengthened prompts** (`lib/insights/llm.ts`)
   - Section-mode guidance now explicitly requires analyzing items by mechanisms but ALWAYS outputting exact logged names (no brand-specific hints)

2. **Added evaluator pass** (`lib/insights/llm.ts` → `evaluateFocusItemsForIssue(...)`)
   - Evaluates logged items and returns supportive ones by 0-based index
   - Guarantees exact-name mapping back to logged supplements
   - For "Bowel Movements": includes fiber recognition rules (PHGG, psyllium, inulin, etc.) and permissive matcher for any logged name containing "fiber"

3. **Builder fallback and augmentation** (`lib/insights/issue-engine.ts`)
   - Supplements builder: if LLM working doesn't cover logged items, calls evaluator
   - Second pass evaluates any remaining missing logged supplements and appends supportive ones using exact logged names
   - `minWorking` raised to 3 when user has logs
   - Same evaluator pattern applied to Medications & Nutrition for parity

4. **Chat prompt grounding** (`lib/insights/chat-store.ts`)
   - Chat prompt now explicitly audits `profile.supplements`
   - References exact stored names (dose/timing if present)

5. **Pipeline version bumped** to `v8` to invalidate caches

**Commits**: `86e3fd8`, `a6e027b`, `57337c5`, `354de24`, `539468e`, `2b72c8c`, `d8671eb`, `4350374`

## Current Status (Live)
- ❌ Sunfiber still not listed under "What's Working" for Bowel Movements → Supplements
- ✅ Only "Magnesium Glycinate" appears
- ⚠️ Banner shows "Initial guidance..." suggesting quick/degraded path

## Likely Root Causes (Ranked by Probability)

### 1. Evaluator path not applied to quick/degraded results
- The quick path (`buildQuickSection`) currently doesn't include evaluator results
- UI banner "Initial guidance..." indicates quick path is being served
- Evaluator runs in validated builder only, but quick path wins the race

### 2. Data mismatch
- "Sunfiber" may not actually be present in `user.supplements` for this production account
- **Action needed**: Call `GET /api/user-data` and verify `supplements` array contains entry with name containing "Sunfiber"

### 3. Name normalization mismatch
- Logged name may differ (extra whitespace, punctuation, emoji)
- Evaluator output (by index) may be fine, but card builder filters out the item

### 4. Cache/versioning not fully invalidated
- Despite `pipelineVersion: v8`, SSR/quick readers may still return older cached row

### 5. Quick path parity gap
- Initial quick/degraded result doesn't include evaluator-backed working items
- UI may remain on quick for too long, missing Sunfiber even though validated result would contain it

## Concrete Next Steps (Do This First)

### Step 1: Instrumentation (guarded by `INSIGHTS_DEBUG=1`)
Add to `app/api/insights/issues/[slug]/sections/[section]/route.ts`:
- Response headers when debug is on:
  - `X-Debug-Supplements`: CSV of first N `context.supplements` names
  - `X-Debug-WorkingCount`: integer count of `extras.supportiveDetails.length`
- Log whether response is quick vs validated and the `pipelineVersion`

### Step 2: Verify live data
- Call `GET /api/user-data` and confirm supplements array includes entry whose `name` contains "Sunfiber"
- If absent, fix Health Setup saving or indexing

### Step 3: Ensure evaluator results reach client on first paint
- **Option A (preferred)**: After quick is served, trigger client fetch for validated result and swap in once available; confirm evaluator-backed `supportiveDetails` arrive
- **Option B (temporary)**: Include evaluator over logged items in quick path for Supplements only (small focused pass) so Sunfiber appears immediately

### Step 4: Force recompute for this account/issue
- POST `/api/insights/issues/bowel-movements/sections/supplements` with `{ mode: 'daily' }`
- Verify headers + payload in Network tab
- Confirm `supportiveDetails` includes Sunfiber

## Acceptance Criteria
- ✅ Given "Sunfiber" in Health Setup, Bowel Movements → Supplements → What's Working lists "Sunfiber" (exact logged name) with mechanism-based reason and logged dose/timing
- ✅ Same evaluator pattern ensures medications/foods work similarly for their sections

## Key Files to Review
- `lib/insights/llm.ts` - `evaluateFocusItemsForIssue()` function (lines ~655-754)
- `lib/insights/issue-engine.ts` - `buildSupplementsSection()` function (lines ~3100-3284)
- `lib/insights/issue-engine.ts` - `buildQuickSection()` function (lines ~2157-2479)
- `app/api/insights/issues/[slug]/sections/[section]/route.ts` - API endpoint that serves sections

## Test Account
- Site: https://helfi.ai
- Email: `info@sonicweb.com.au`
- Password: `Snoodlenoodle1@`
- Expected: "Sunfiber" should appear in Bowel Movements → Supplements → What's Working

## Notes
- Changes were intentionally AI-only (no static brand maps)
- Evaluator uses ingredient/mechanism reasoning and index-based mapping to preserve exact logged names
- Presence of quick banner suggests client may be seeing quick/degraded payload
- Evaluator currently runs in validated builder only

## Full Details
See `insights.plan.md` top section (URGENT ADDENDUM dated 2025-11-04) for complete handover details and step-by-step plan.

