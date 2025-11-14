# Food Diary – Pending Improvements

This document captures the exact work required to finish the latest round of Food Analyzer updates. Please follow these instructions step‑by‑step so we can ship the changes safely and avoid burning extra AI credits for users.

---

## 1. Goals

1. **Single compact meal card**
   - Top of the analysis view must show one sentence summary of the meal (e.g. “Scrambled eggs…, bacon…, orange juice…”).
   - The coloured nutrient tiles must appear **once** and list **all six macros** (calories, protein, carbs, fat, fiber, sugar). Remove the duplicate strip underneath.

2. **Ingredient list parity**
   - Every detected ingredient row must show the same macros as the tiles (include fiber + sugar).
   - Keep serving +/- controls but tighten vertical spacing so the list is compact on mobile.

3. **Editable structured items without re‑analyzing**
   - Users must be able to fix AI mistakes (name, brand, serving size, macros, servings) directly.
   - Editing an ingredient must immediately update totals, nutrient tiles, and Today’s Totals **without calling `/api/analyze-food` again** or charging a credit.
   - Store the edited values with the entry so reopening it shows the corrected data.

4. **Edit mode UX**
   - When you tap **Edit Entry** on a saved meal, the screen must look exactly like the initial analysis (photo, nutrient tiles, ingredient list, description).
   - Buttons required while editing:
     - `Save to Food Diary` / `Update Entry`
     - `Edit Description`
     - `Delete Photo` (or `Cancel Photo`)
     - `Re-Analyze` (optional use, still available if user wants fresh AI output)
     - `Done`
     - `Cancel changes`

5. **Credits policy**
   - Only re-analysis should consume credits. Adjusting structured items manually must **not** trigger another API call or credit deduction.

---

## 2. Implementation Checklist

1. **Refactor state shape**
   - Keep `analyzedItems` as the single source of truth for the ingredient list.
   - Each item should store: `name`, `brand`, `serving_size`, `servings`, `calories`, `protein_g`, `carbs_g`, `fat_g`, `fiber_g`, `sugar_g`.
   - Add helper `updateItemField(index, field, value)` that:
     - clones `analyzedItems`
     - updates the field and clamps numbers where appropriate
     - calls `recalculateNutritionFromItems` and updates `analyzedNutrition`, `analyzedTotal`, and `todaysFoods` (when editing an existing entry)

2. **Ingredient editor**
   - Replace the current modal with inline editing controls or enhance the modal to include inputs for all macros + serving size + name + brand.
   - No network call when saving edits; rely on the helper above.

3. **Remove duplicate nutrient tiles**
   - Delete the secondary fiber/sugar row.
   - Ensure `NUTRIENT_DISPLAY_ORDER` drives the single tile grid.

4. **Compact layout**
   - Add meal summary block at the very top (above tiles).
   - Reduce padding/margins within each ingredient card (smaller font sizes, tighten gaps).
   - Test on an iPhone viewport to confirm scrolling is minimal.

5. **Edit mode parity**
   - When `editingEntry` is set, prefill:
     - `photoPreview`
     - `analyzedItems` (from stored `items`)
     - `analyzedNutrition` + `analyzedTotal`
     - `aiDescription` (use saved description)
     - `editedDescription`
   - Show the same buttons arranged exactly as the screenshot:
     1. `Save to Food Diary` / `Update Entry`
     2. `Edit Description`
     3. `Delete Photo`
     4. `Re-Analyze`
     5. `Done`
     6. `Cancel changes`
   - `Cancel changes` should revert the state to the persisted entry without touching credits.

6. **Persistence**
   - When saving or updating an entry, persist the fully edited `items` array and `total` so they load intact next time.

7. **Credits safeguard**
   - Double-check that the only code calling `/api/analyze-food` is: initial analysis, re-analyze buttons, manual entry analysis.
   - All other mutations must remain client-side.

---

## 3. Testing Plan

1. **Fresh analysis**
   - Upload a multi-item meal photo.
   - Confirm: summary sentence, one set of nutrient tiles, ingredient list with fiber/sugar, Save/Edit/Cancel buttons.

2. **Manual corrections**
   - Change “beef sausage” to “pork sausage” via the structured editor.
   - Adjust macros manually; totals and tiles must update instantly without hitting the API.

3. **Edit existing entry**
   - Save the meal, go back to Today’s Meals, tap Edit.
   - The full analysis view should reappear with all buttons.
   - Modify servings, use Cancel changes to verify rollback, then Update Entry and ensure Today’s Totals refresh.

4. **Credit verification**
   - Monitor network tab / log statements to confirm no `/api/analyze-food` call fires when editing structured items.

5. **Mobile layout**
   - Use responsive dev tools (iPhone 13 width) and ensure the ingredient list fits without excessive scrolling.

6. **Regression sweep**
   - Run `npm run build`.
   - Smoke-test manual food entry to ensure the refactor didn’t break the form or saved history.

---

## 4. Deployment

1. `npm run build`
2. Commit changes with a descriptive message.
3. `git push origin master`
4. Run `./scripts/check-deployment-status.sh` and wait for **READY**.
5. Only then notify the user that production is updated.

---

Feel free to iterate on the visual polish, but do **not** deviate from the flow described above without explicit user approval. The priority is restoring the original user experience (Save/Edit/Cancel) while adding the ability to correct structured items without spending extra credits.***

---

## Notes from latest agent (did not resolve issues)

- Added helper utilities in `app/food/page.tsx` (`parseServingUnitMetadata`, `extractStructuredItemsFromAnalysis`, `applyStructuredItems`) to support the new quick‑add serving controls and to try to rebuild the ingredient list from the `<ITEMS_JSON>` block the API is supposed to include. The idea was to keep the quarter‑serving buttons but also allow users to tap “+1 egg / +½ egg” when the model detects a specific serving size.  
  - **Result:** The quick‑add chips work when the AI response includes a recognizable `serving_size`, but there is still no ingredient list when OpenAI omits `items` *and* the `<ITEMS_JSON>` snippet. Many current photo analyses return only prose (see user screenshot), so we continue to fall back to the long text block.
  - **Follow‑up needed:** Either ensure the backend always sends `items`/`total` or adjust the client to gracefully handle prose‑only responses (e.g., hide the empty “Detected Foods” shell and avoid duplicating the text block).

- Added a `hasPaidAccess` flag that checks `/api/credit/status` so the “Free accounts can try this AI feature once…” warning only shows for free users. This part works, but it didn’t address the missing cards/text layout problem.

- Introduced `applyStructuredItems` usage in **all** analysis paths (photo, manual text, re‑analyze) so whenever `result.items` exists, the UI immediately populates `analyzedItems`. Unfortunately this still depends on the API returning structured data.

### Outstanding issues observed after these changes
1. **Ingredient list still AWOL:** When GPT doesn’t include `<ITEMS_JSON>`, `analyzedItems` remains empty and the UI prints the raw description. Need a server‑side guarantee or a robust client fallback that converts the prose into structured entries.
2. **Fiber/Sugar parity in Today’s Meals:** The “Today’s Meals” section now shows all six macros unconditionally, but the modal cards inside each entry still only show the four legacy macros. Verify how the totals should look when `food.nutrition` is missing fiber/sugar keys.
3. **Credit warning logic:** Although `hasPaidAccess` hides the banner for paid accounts, `UsageMeter` still assumes the user has plan/credits, so double‑check the API response fields before relying on it for gating.

Please pick up from here so we don’t duplicate the same attempts. If you change the backend contract (e.g., guarantee `items` is present), remember to update the parsing helper accordingly.
