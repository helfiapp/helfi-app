# Food Diary – Current Handover (Dec 25, 2025)

## Read this first (focus only on this issue)
The only issue to work on now: food photo analysis lists multiple ingredients in the description, but the ingredient cards are missing (sometimes it returns a single summary card instead of separate ingredient cards). Do not change anything else.

## ✅ Completed changes in this session
- ✅ Pieces only appear when the AI gives an explicit count; inferred piece counts are blocked and items default to weight-only.
- ✅ Desktop date picker shows the word “Today” for the current date again.
- ✅ New entries now seed the weight using the serving size unit correctly (fixes oz/ml mismatch on fresh entries).
- ✅ Strict AI-only ingredient cards is enabled (no UI or server fallback cards are added).

## ❌ Remaining issue (not fixed)
- ❌ Food photo analysis still returns missing ingredient cards (sometimes a single summary card with the full description).

## What I tried for the missing cards (did NOT fix it — do not repeat this exact approach)
1) Server AI follow-up: extracted a component list from the description and sent it to a second AI call that is forced to return JSON items. It still returned one item in some cases.
2) Summary-card detection: if a single long card looked like a summary, it triggered the same AI follow-up. This still did not split the card.
3) Removed client-side backfill: disabled text parsing into items on the client so only AI-returned items show. This did not fix the missing cards because the AI still returned one item.

## Exact changes already in code (for reference only)
- `STRICT_AI_ONLY_ITEMS = true` in `app/api/analyze-food/route.ts` (disables fallback item creation).
- `extractComponentsFromAnalysis`, `normalizeComponentName`, and `looksLikeMultiIngredientSummary` added in `app/api/analyze-food/route.ts`.
- AI follow-up uses `gpt-4o-mini` with JSON output to try splitting items (still collapses sometimes).
- `applyStructuredItems` now requires `allowTextFallback`; photo/manual calls pass `allowTextFallback: false` in `app/food/page.tsx`.

## Where this work lives (reference only)
- `app/api/analyze-food/route.ts` (component extraction, AI follow-up, AI-only items)
- `app/food/page.tsx` (disabled text fallback into items)
- `GUARD_RAILS.md` (pieces-only rule recorded)

## Suggested next steps (for the next agent)
- Confirm whether the AI response contains a real multi-item list for the image. If it does, the UI may be collapsing items.
- If the AI still collapses to one item, try a stricter schema that requires an array of items with one item per ingredient, or do a separate vision pass that outputs only the ingredient list and then request structured items from that list.
- Add logging for the exact AI output sent back to the client so you can see where it collapses.

---

Previous handover details were removed to avoid confusion. See git history if older notes are needed.
