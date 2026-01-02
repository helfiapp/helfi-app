# Food Analysis + Diary Handover (Mar 2026)

## What is working (do not touch)
- Food diary copy to today, duplicate, delete, and manual refresh are stable.
- Guard rails are updated in `GUARD_RAILS.md`:
  - Ingredient cards must never collapse into one combined card.
  - Copy/duplicate/delete/refresh logic is locked.
  - Manual refresh only is locked.

## Current issue (still broken)
Image analysis sometimes shows a patently wrong count, e.g.:
- "6 Beef patty (6 oz)" from a single‑patty burger photo.
- This explodes macros (3110 kcal, etc.) and is very expensive for the user.

## Why this happens (likely root cause)
The UI treats leading numbers in the item name as **piece counts**.
Example:
- If the AI returns name: "6 Beef patty (6 oz)",
- `app/food/page.tsx` parses the "6" as pieces (because "patty" is a discrete unit),
- So it becomes 6 patties even though the photo clearly shows 1.

This is a general parsing problem, not a specific "burger" rule.

## What we already changed (deployed but not fixed)
In `app/api/analyze-food/route.ts`:
- Block weight numbers from becoming pieces (`extractExplicitPieceCount` ignores weight units).
- Strip bogus leading numbers in burger patty items in `ensureBurgerComponents` when count is not explicit.
- Force a component split when a combined summary card is detected.
- Added dedupe for component lists in component‑bound follow‑ups.

These changes are live but **the issue still reproduces**.

Recent commits:
- 6be01d7d: Force component split for multi‑ingredient analyses
- 71355fda: Block weight units from setting piece counts
- 3ad5dbc9: Strip bogus patty counts from names
- 3b83376c: Ignore weight‑based numbers for discrete counts

## What to check next (debug path)
1) **See what the server actually returned.**
   - Vercel logs already output `itemsPreview` in `/api/analyze-food`.
   - Run one analysis and inspect logs to see the exact item name and serving size.
   - If server logs already show "6 Beef patty", fix on the server.
   - If server logs show "Beef patty" but UI shows "6 Beef patty", fix on the client.

2) **Client parsing hotspots (likely source if server is clean):**
   - `getPiecesPerServing`, `parseServingUnitMetadata`, `normalizeDiscreteItem`, and
     `inferPiecesFromAnalysisForItem` in `app/food/page.tsx`.
   - The parser treats any leading number + discrete unit label as a piece count.
   - A general fix should ignore leading numbers when the serving_size contains a weight unit.

3) **Server parsing hotspots (if server is the source):**
   - `sanitizeStructuredItems` (strip leading numeric prefixes if serving size is weight‑based).
   - Any follow‑up model output could be inserting numbers into the item name.

## Performance issue (51s image analysis)
The analyze‑food route does multiple follow‑up AI calls:
- component‑bound follow‑up
- multi‑item follow‑up
- forced image follow‑up
- text‑only fallback
- component backfill

This can chain into long runtimes. A safe speed improvement path:
- Add **early exit** once `itemsQuality` is valid and item count is >= 2.
- Cap to **one** follow‑up call per image analysis.
- Prefer faster model for follow‑ups (while keeping accuracy).

## Guard rails to respect
- `GUARD_RAILS.md` Section 3.4.3 (Ingredient Card Integrity) and 3.6 (Copy/Duplicate/Delete/Refresh).
- Do not re‑enable auto refresh.
- Do not allow single combined ingredient cards.

