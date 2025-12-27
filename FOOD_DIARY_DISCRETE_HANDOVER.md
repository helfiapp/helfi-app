## Handover: Discrete item counts STILL not reflected (e.g., 6 zucchinis → 1 piece)

### Current state (as of commit 0d0d95f8)
- Live UI **still** shows single serving/piece for multi-count discrete produce.
- Example: analysis description says "Six zucchinis. Each zucchini is approximately 1 medium size, which is about 200g..."
  - Title: "Zucchini" (singular)
  - Servings: 1
  - Pieces: 1
  - Serving size label: "1 medium (200g)"
- The same issue affects carrots, bananas, apples, and other whole produce.

---

### What has been tried (and failed)

#### Attempt 1 (previous agent, commit a94459fd)
- Added `getExplicitPieces()` to honor backend-provided counts (`piecesPerServing`, `pieces`, etc.)
- Modified `getPiecesPerServing()` to return explicit counts before keyword parsing
- Modified `normalizeDiscreteItem()` to treat items as discrete when explicit count exists
- **Why it failed:** The backend doesn't send `piecesPerServing` for produce. The `serving_size` field contains "1 medium" so keyword parsing finds "1", not "6".

#### Attempt 2 (Claude Opus agent, commit 0d0d95f8)
- Extended the egg-only `parseCountFromFreeText(analysisText)` fallback in `applyStructuredItems` to apply to ALL discrete items (not just eggs)
- **Why it failed:** The fallback only fires when `piecesPerServing` is missing or <= 0. But `getPiecesPerServing()` parses "1 medium (200g)" from the serving_size and returns **1**, so `piecesPerServing = 1` is already set. The fallback condition `(!next.piecesPerServing || next.piecesPerServing <= 0)` is **false**, so it never applies the analysis-text count.

---

### Root cause analysis

The problem is a **conflict between two count sources**:
1. **Analysis text** (correct): "Six zucchinis" → `parseCountFromFreeText()` returns 6
2. **serving_size field** (wrong for multi-count): "1 medium (200g)" → `getPiecesPerServing()` returns 1

Current flow:
```
normalizeDiscreteItem(item)
  → getPiecesPerServing(item)  // parses serving_size "1 medium (200g)" → returns 1
  → sets piecesPerServing = 1

applyStructuredItems fallback:
  → if (!piecesPerServing || piecesPerServing <= 0) → FALSE (it's 1)
  → fallback never fires
```

---

### Correct fix direction (for next agent)

**Option A: Change the fallback condition**
In `applyStructuredItems`, change the condition from:
```typescript
if (isDiscrete && (!next.piecesPerServing || next.piecesPerServing <= 0) && inferredCount > 1)
```
To:
```typescript
if (isDiscrete && inferredCount && inferredCount > 1 && inferredCount > (next.piecesPerServing || 1))
```
This would **override** the serving_size-parsed count when the analysis text suggests a larger count.

**Option B: Backend fix**
In `app/api/analyze-food/route.ts`, extend `enforceEggCountFromAnalysis()` (or create a new function) to apply `parseCountFromText(analysis)` for produce items and set `piecesPerServing` in the API response. This ensures the backend sends the correct count.

**Option C: Priority in getPiecesPerServing**
Pass `analysisText` to `getPiecesPerServing()` or `normalizeDiscreteItem()` and prioritize the analysis-text count over the serving_size-parsed count when both exist and the analysis count is larger.

---

### Files involved

- `app/food/page.tsx`:
  - `getPiecesPerServing()` (~line 667-691) — parses count from serving_size/name
  - `normalizeDiscreteItem()` (~line 774-821) — sets piecesPerServing
  - `applyStructuredItems()` (~line 1933-1951) — has the fallback that currently doesn't fire
  - `isDiscreteUnitLabel()` (~line 631-649) — already includes zucchini, carrot, banana, etc.

- `app/api/analyze-food/route.ts`:
  - `parseCountFromText()` (~line 262-269) — parses count from text
  - `enforceEggCountFromAnalysis()` (~line 124-157) — eggs-only; could be extended
  - `DISCRETE_DEFAULTS` (~line 457-497) — only covers patty/bacon/cheese/egg, not produce

- `lib/food-normalization.ts`:
  - `parseCountFromText()` — same logic
  - `normalizeDiscreteItemCounts()` — has similar fallback issue

---

### Reproduction steps
1. Upload an image of multiple whole vegetables (6 zucchinis, 6 carrots, etc.)
2. Check the analysis description — it will correctly say "Six zucchinis..."
3. Check the detected item card:
   - Title will be singular ("Zucchini")
   - Pieces will be 1
   - Serving size will be "1 medium (200g)"
4. Inspect Network tab → analyze-food response:
   - `serving_size`: "1 medium (200g)" (contains "1", not "6")
   - `piecesPerServing`: likely undefined or 1

---

### Guard rails (do not break)
- Do not reintroduce image caching
- Do not change servings/pieces/weight sync (servings must stay at 1 for discrete items; pieces capture the count)
- Do not re-normalize servings to multiply pieces
- Follow GUARD_RAILS.md §3.9

---

### Key insight for next agent
The fix is **NOT** about adding more fallback code — the fallback exists but doesn't fire because `piecesPerServing` is already set to 1 from parsing `serving_size`. The fix needs to either:
1. Change the condition to allow overriding when analysis-text count is larger, OR
2. Prevent `getPiecesPerServing()` from parsing a per-unit count (like "1 medium") when the analysis description clearly states multiple items

---

### Deployment note
- Current deployment: READY at commit `0d0d95f8`
- Script `./scripts/check-deployment-status.sh` fails with `forbidden` (token scope issue)
- Use `vercel ls helfi-app` via CLI to check status
