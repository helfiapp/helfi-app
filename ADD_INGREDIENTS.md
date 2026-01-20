# Add Ingredients Handover (Updated)

## Quick intro for next agent
- The user is not a developer. Use plain, simple English with no technical language.
- The user does not work locally. All changes must be deployed to the live site so they can test.
- Do not look for AGENTS.md — it does not exist.

This document is for the next agent. It lists what the user wants, what is broken, and everything that was tried (including failures) so the same mistakes are not repeated.

## What the user wants (plain English)
- Search should work like Google Maps.
- After 2 letters, results should start showing.
- When you keep typing, results should get better, not disappear.
- If the search box is empty, there must be no results on screen.
- This behavior must be the same in:
  - Build a meal
  - Add ingredient page
  - Add ingredient pop-up inside Food Diary
- Single foods should be from USDA and should show normal foods like walnuts.
- Packaged foods should show big brands quickly (KFC, McDonald’s, Dunkin Donuts, etc).
- Macros must be correct when you add by grams/ounces.

## What is broken now (live site after latest deploy)
- Typing the full word “Walnuts” shows no results (screenshot provided by user).
- Typing a short prefix like “Wa” shows “Walnuts, raw,” but the full word removes the list.
- This is still happening on the Add Ingredient page (single food, best match).

## Where the search code lives
- app/food/build-meal/MealBuilderClient.tsx
- app/food/add-ingredient/AddIngredientClient.tsx
- app/food/page.tsx (Add ingredient pop-up)

Important: Add-ingredient search blocks are protected by Guard Rails. If you change those blocks you may need to update the hash in scripts/protect-regions.js.

## Changes the previous agent had already made (before me)
- Added COMMON_SINGLE_FOOD_SUGGESTIONS list and merged those suggestions into results.
- Added brand suggestions for packaged foods.
- Changed matching to startsWith only.
- Cleared results when input is empty.
- Added “Walnuts, raw” to suggestions.

## Changes I made (chronological, with what happened)

### 1) Fix macros for suggestion items (deployed)
Goal: stop 0 kcal / 0 macros when a suggestion is added.

Changes (applied in all three files):
- Added resolveSuggestionItem / resolveOfficialSuggestionItem to look up the real USDA item before adding.
- If suggestion is clicked, fetch /api/food-data?source=usda&kind=single&q=<name> and use that item for macros.

Files:
- app/food/add-ingredient/AddIngredientClient.tsx
- app/food/build-meal/MealBuilderClient.tsx
- app/food/page.tsx

Status: Deployed. This should fix zero macros, but it was not confirmed by the user.

### 2) Broaden matching so full words don’t disappear (deployed)
Goal: avoid full-word searches returning nothing.

Changes:
- Added singularizeToken and updated nameMatchesSearchQuery to allow:
  - startsWith
  - singularized startsWith
  - contains for tokens length >= 4

Files:
- app/food/add-ingredient/AddIngredientClient.tsx
- app/food/build-meal/MealBuilderClient.tsx
- app/food/page.tsx

Status: Deployed. Did not fix the issue by itself.

### 3) Guard against stale results (deployed)
Goal: prevent old searches from overwriting new input.

Changes:
- Added seq checks before setting errors/results in add-ingredient and food modal searches.

Status: Deployed. Did not fix the full-word issue.

### 4) Disabled client filtering for single foods (deployed, then reverted)
Goal: stop client filter from deleting all results for full words.

Change (temporarily):
- Only filtered results when kind/mode was packaged.

Result:
- This caused full-word searches (e.g., “Walnuts”) to return unrelated items (chard, cress, bulgur, etc.).
- User reported this as worse, so I reverted it.

### 5) Re-enabled client filtering for single foods (deployed)
Goal: remove unrelated results and keep relevance.

Change:
- Re-applied itemMatchesSearchQuery for all kinds (single + packaged).

Result:
- Unrelated items disappeared, but “Walnuts” full word still showed no results.

### 6) Reordered suggestion merge (deployed)
Goal: keep real API results first and suggestions after.

Change:
- mergeSearchSuggestions now adds API items first, then suggestions.

Result:
- Did not fix the “Walnuts” full-word issue.

### 7) Strengthen suggestion matching for full words (deployed)
Goal: ensure suggestions still show on full word.

Change:
- buildSingleFoodSuggestions now also matches when normalizedQuery length >= 4 and item name includes it.

Result:
- Still seeing “Walnuts” show no results on the live site.

## Commits / deploys (all pushed to master and deployed)
- 1c9cbcf0 — Fix ingredient search suggestions and matching
- cb33e4f1 — Fix build error in ingredient search
- 8d445e45 — Keep single-food results for full words (removed filtering for single; later reversed)
- 56f6740f — Filter single-food results and keep real matches (re-applied filtering)
- 2f615f80 — Strengthen single-food suggestion matching

All deployments succeeded. Latest live commit is 2f615f80 and the issue is still present.

## Current behavior (confirmed by user screenshots)
- “Wa” shows “Walnuts, raw” (suggestion appears after 2 letters).
- “Walnuts” shows no results (back to square one).

## Why the problem might still be happening
- The client still filters API results. If the API returns items that do not match the strict client filter, everything disappears.
- Suggestions are still being overwritten by the later API response when it returns empty (even though mergeSearchSuggestions should add them back).
- The API might be returning 0 items for “Walnuts” (upstream issue), but this was not confirmed because no network inspection was done.

## What the next agent should do (recommended)
1) Confirm what the API returns for a full word:
   - Open /api/food-data?source=usda&kind=single&q=walnuts&limit=20 in the browser or Network tab.
   - If items exist, the client is filtering them out.
   - If items are empty, this is a server/API issue, not a client issue.

2) If API returns items but client hides them:
   - Consider removing or greatly loosening client filtering for single foods.
   - Or only apply filtering to API results when the API returned 10+ items, and otherwise show them unfiltered.

3) If API returns no items:
   - Check app/api/food-data/route.ts to see the exact USDA query.
   - Try the singular fallback on the server side (walnut) before returning empty.

4) Keep suggestions visible even if API returns empty:
   - If query length >= 2 and suggestions exist, do not allow the API result to clear them.

## Important notes about the user
- The user is not a developer and needs replies in plain, simple English with no technical language.
- Do not look for AGENTS.md — it does not exist.
- The user does not work locally. All changes must be deployed to the live site so they can test.
