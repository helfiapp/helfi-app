DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-13 01:07 AEDT
- What changed: Fixed Food Diary drink/favorite regressions. Drink entries now keep the correct drink icon + amount label even when drink metadata is split across fields, and renaming from Diary or Favorites now syncs more reliably across Diary/Favorites using favorite ID, source ID, and barcode matching.
- Where to see it (page/link): Food Diary meal list + Food Diary -> Add from favorites
- What to quickly test: Add Hot chocolate from Water -> Favorites and confirm it keeps the hot chocolate icon + 500 ml in Food Diary. Rename an entry from Diary and from Favorites and confirm the new name appears across both areas.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-13 00:13 AEDT
- What changed: Recipe import now auto-resolves missing ingredients using AI nutrition fallback and saves them as reusable custom foods for future matches. Build a meal portion-size box now shows live calories/macros directly in that section while servings/amount change.
- Where to see it (page/link): Food Diary -> + menu -> Import Recipe -> Continue to Build a meal
- What to quickly test: Import a recipe with a previously missing ingredient and confirm it auto-adds instead of manual-only; then change serving amount and confirm calories/protein/carbs/fat/fibre/sugar update live inside the portion-size card.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-12 23:59 AEDT
- What changed: Barcode scanner visual tweak only. Darkened the area outside the scan frame again so the barcode target window stands out clearly, while keeping the recent one-scan fix unchanged.
- Where to see it (page/link): Food Diary -> Add food -> Barcode Scanner
- What to quickly test: Open scanner and confirm outside area is darker again while barcode still scans and saves on first try.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-12 22:32 AEDT
- What changed: Fixed Food Diary barcode scanner so one successful scan is enough. The scanner now closes as soon as a product match is found, then saves the item in the background, and avoids unnecessary camera restarts during lookup retries.
- Where to see it (page/link): Food Diary -> Add food -> Barcode Scanner
- What to quickly test: Scan one packaged food barcode once and confirm it closes immediately and adds the item without forcing a second scan.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-12 22:01 AEDT
- What changed: Sped up recipe-import meal building. Ingredient matching now runs with faster candidate prioritization, fewer heavy lookups, parallel search attempts, and per-request timeouts to prevent long stalls. Also shows manual-match ingredient list live while building.
- Where to see it (page/link): Food Diary -> Import Recipe -> Continue to Build a meal
- What to quickly test: Import the same Delicious recipe and confirm the build counter moves quickly (not stuck on 0/1 for minutes) and ingredients/manual-match updates appear during the build.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-12 21:35 AEDT
- What changed: Fixed recipe URL import for anti-bot blocked sites by adding a browser-side fallback. If server fetch is blocked (403), the app now pulls readable page text in-browser and sends it to the importer, so recipe import can still complete.
- Where to see it (page/link): Food Diary -> + menu -> Import Recipe -> Import by URL
- What to quickly test: Import this URL and confirm the review form loads instead of red error: https://www.delicious.com.au/recipes/pork-mince-salad-larb-roti-recipe/i6n58sei?r=recipes/collections/1vo4q819

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-12 20:43 AEDT
- What changed: Fixed recipe URL import reliability for blocked/tracking-heavy links. Import now uses one strong page fetch path (with browser-style headers), retries a clean URL without tracking query text, and reuses the same loaded page for extraction so it no longer fails on a second weaker fetch.
- Where to see it (page/link): Food Diary -> + menu -> Import Recipe -> Import by URL
- What to quickly test: Paste this link and import: https://www.delicious.com.au/recipes/pork-mince-salad-larb-roti-recipe/i6n58sei?r=recipes/collections/1vo4q819

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-12 18:06 AEDT
- What changed: Cleaned recipe-import ingredient matching so imported ingredient card names stay aligned to recipe wording, and weak/unrelated auto-matches are now rejected (they go to manual match list instead of adding wrong foods).
- Where to see it (page/link): Food Diary -> Import Recipe -> Continue to Build a meal
- What to quickly test: Import a recipe URL, check ingredient cards keep understandable recipe names, and confirm obviously wrong foods are no longer auto-added.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-12 17:04 AEDT
- What changed: Fixed recipe-import portion default so Build a meal now reliably starts at 1 serving (not stale values like 4 g). Prevented old draft restore from overriding recipe-import defaults.
- Where to see it (page/link): Food Diary -> Import Recipe -> Continue to Build a meal
- What to quickly test: Import a recipe that has servings (for example 8 servings) and confirm Portion size defaults to serving unit with 1 serving, not grams.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-12 16:54 AEDT
- What changed: Simplified recipe-import flow. Import Recipe now has one button only (Continue to Build a meal). In Build a meal for imported recipes, users now get a clear Save to favorites (Custom meals) Yes/No toggle before pressing Save meal.
- Where to see it (page/link): Food Diary -> Import Recipe -> Continue to Build a meal -> Build a meal (portion card)
- What to quickly test: Import any recipe, confirm only one Continue button exists, then on Build a meal toggle Save to favorites to Yes and press Save meal; confirm the saved meal appears in Favorites -> Custom.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-12 16:47 AEDT
- What changed: Fixed produce size-unit matching in Food Diary Change amount so plural produce names (for example peaches/apples/oranges/tomatoes) now correctly show small/medium/large/extra large options where that food supports them.
- Where to see it (page/link): Food Diary -> Add from favorites -> Preview -> Change amount
- What to quickly test: Open a produce item like peaches or apples, open Weight/size dropdown, and confirm size options (small/medium/large/extra large) are available with grams.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-12 12:18 AEDT
- What changed: Fixed Food Diary “Import Recipe” menu placement. It now shows once only and appears directly under “Build a meal” (removed duplicate entries).
- Where to see it (page/link): Food Diary -> tap + on any meal section menu
- What to quickly test: Open the + menu and confirm “Import Recipe” is directly under “Build a meal” and appears only once.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-12 13:58 AEDT
- What changed: Favorites “Change amount” now starts with ingredients collapsed, each ingredient shows its own macro values, egg size dropdown labels now include grams, and non-drink meals no longer show drink icons/amount labels from stale drink metadata.
- Where to see it (page/link): Food Diary -> Add from favorites -> Preview -> Change amount, and Food Diary meal list cards
- What to quickly test: In Change amount, confirm ingredients are collapsed first, tap to expand controls, see per-ingredient macros, and check egg unit dropdown shows weights. In Meals list, confirm breakfast/custom meals show food icon (not hot chocolate icon) unless it is truly a drink.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-12 04:34 AEDT
- What changed: Fixed blank “Weight / size” values in Favorites -> Preview -> Change amount. The field now auto-fills from the current servings and selected unit when a saved weight is not already present.
- Where to see it (page/link): Food Diary -> Add from favorites -> Preview -> Change amount
- What to quickly test: Open Change amount on a favorite meal and confirm each ingredient now shows a corresponding weight value instead of an empty box.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-12 02:42 AEDT
- What changed: Follow-up fix for Favorites Preview -> Change amount. Replaced the limited servings-only controls with full item amount controls where available (serving dropdowns like small/medium/large, weight/size unit dropdowns, pieces + servings, and weight input), matching normal entry edit behavior.
- Where to see it (page/link): Food Diary -> Add from favorites -> Preview -> Change amount
- What to quickly test: Open Change amount for items that have serving options and confirm you can switch serving type (e.g., small/medium/large), adjust grams/pieces/units, and see totals update before Add.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-12 02:17 AEDT
- What changed: Favorites Preview now has instant Add + new full-page Change amount flow. Users can adjust ingredient/portion amounts before adding, and there is now a Cancel button that exits the whole process back to Food Diary.
- Where to see it (page/link): Food Diary -> Add from favorites -> select item -> Preview
- What to quickly test: In Preview, tap Change amount, adjust amounts, confirm macros/daily totals update live, then tap Add. Also verify Cancel exits directly back to Food Diary.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-12 00:03 AEDT
- What changed: Completed a desktop Food Diary UI sweep and fixed full-screen overlay layout issues so desktop content no longer sits under the left menu. Also reduced oversized desktop preview layout width in Favorites Preview.
- Where to see it (page/link): Food Diary desktop flows (especially Favorites Preview, Favorites picker, Multi-copy, Barcode scanner, Health-check page, and Build Meal overlays)
- What to quickly test: On desktop, open each Food Diary full-screen flow and confirm the left menu remains visible and content is fully readable (no left-side clipping/cutoff).

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-11 02:51 AEDT
- What changed: Fixed manual exercise saving in Food Diary → Add exercise (more robust save + clearer error message if something still fails).
- Where to see it (page/link): Food Diary → Exercise → Add exercise
- What to quickly test: Add a manual exercise and tap Save. If it fails, confirm the red error message now includes a short “DB error (…)” hint.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-11 02:27 AEDT
- What changed: Fixed Food Diary → Add exercise on desktop so it no longer hides the left-hand menu (the Add exercise screen now stays inside the main content area).
- Where to see it (page/link): Food Diary → Exercise → Add exercise
- What to quickly test: On desktop, open Add exercise and confirm the left menu stays visible. Close the Add exercise screen and confirm you return to the Food Diary as normal.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-11 02:14 AEDT
- What changed: Fixed the Food Diary “Add exercise” screen header so “Reset” and the close “X” are positioned correctly on desktop (the Add exercise screen now sits above the left menu instead of underneath it).
- Where to see it (page/link): Food Diary → Exercise → Add exercise
- What to quickly test: On desktop, open Add exercise and confirm the left menu doesn’t overlap the Add exercise screen, and the header buttons look aligned.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-11 01:15 AEDT
- What changed: Made Food Diary manual exercise saving more reliable (aimed to prevent “Failed to save exercise”).
- Where to see it (page/link): Food Diary → Exercise → Add exercise → Save
- What to quickly test: Add a manual exercise (distance + duration + calories) and confirm it saves; then add a second manual exercise and confirm that also saves.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-11 19:04 AEDT
- What changed: On mobile, “Adjust ingredient” now opens full-screen so the amount/unit (grams) fields are fully visible and not cut off.
- Where to see it (page/link): Food Diary → Add ingredient → tap Add on an ingredient (Adjust ingredient screen)
- What to quickly test: On mobile, open Adjust ingredient and confirm the amount input + unit dropdown fit fully on screen.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-11 14:01 AEDT
- What changed: Root-cause fix for desktop/mobile mismatch in Exercise. Food Diary now always refreshes exercise entries from server (not stale local cache), so manual exercise logged on desktop should appear on mobile too. Also fixed weird summary text showing “\\u2019”.
- Where to see it (page/link): Food Diary (desktop + mobile PWA), same date
- What to quickly test: Add manual exercise on desktop, refresh mobile PWA on same date, confirm exercise appears and burned calories/remaining match.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-11 12:52 AEDT
- What changed: Exercise list now always shows the delete (trash) button for every entry (including Apple Health entries), even when only 1 entry is left. Add (+) exercise button is always available.
- Where to see it (page/link): Food Diary → Exercise list
- What to quickly test: When only 1 exercise entry remains, confirm the trash icon is still visible and works.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-11 12:38 AEDT
- What changed: Exercise delete button now gives clear visual feedback (turns red and disables briefly) so it’s obvious the delete click worked.
- Where to see it (page/link): Food Diary → Exercise list → trash/delete icon on a Manual exercise entry
- What to quickly test: Click the trash icon on a Manual exercise entry and confirm the icon lights red while deleting, then the entry disappears.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-11 12:21 AEDT
- What changed: Fixed exercise logging crash caused by Apple Health imported entries. The app can now read exercise entries with source “APPLE_HEALTH”, so saving and loading exercise should work again.
- Where to see it (page/link): Food Diary → Exercise → Add exercise
- What to quickly test: Try saving a manual exercise again. Also open Exercise list for that day and confirm it loads (no red error).

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-11 03:35 AEDT
- What changed: Exercise Save errors now show a more detailed “ref” code so we can identify exactly where the server is failing (example: EX500/health_profile). This helps us fix the root cause quickly.
- Where to see it (page/link): Food Diary → Exercise → Add exercise
- What to quickly test: Try Save again and tell us the full red error message (including the new ref code).

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-11 03:15 AEDT
- What changed: Fixed manual exercise logging so Save no longer fails silently. If saving fails, you should now see a more helpful red error message (instead of just “Failed to save exercise”).
- Where to see it (page/link): Food Diary → Exercise → Add exercise
- What to quickly test: Pick an exercise, enter duration, press Save. If it fails, check the red error message now shows the reason (or “ref: EX500”).

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-11 00:51 AEDT
- What changed: In Food Diary → Add from favorites (All/Favorites/Custom), the Preview now opens a full-screen page that combines the meal macro cards + the daily progress bars (as-if you add it). The old “Preview overall macros” option was removed.
- Where to see it (page/link): Food Diary → + → Add from favorites → tap an item → Preview
- What to quickly test: From All/Favorites/Custom tabs, open Preview (check it is full-screen with Back + Add). Tap Back (returns to the small action pop-up). Tap Add (adds the meal and returns to Food Diary).

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-10 23:37 AEDT
- What changed: Fixed barcode scanning so it won’t randomly force a 2nd scan, and fixed the “500ml cup size gets stuck onto barcode foods” issue (drink amount no longer overwrites a barcode food’s serving size/macros when the food is measured in grams, like powders).
- Where to see it (page/link): Food Diary → Scan barcode (also when scanning from the water/liquids flow)
- What to quickly test: Scan a normal packaged food once (it should add after 1 scan). Then from the water/liquids flow set a cup size (e.g. 500ml) and scan a powder barcode (hot chocolate) and confirm the serving size stays in grams (not forced to 500) and the scanner doesn’t reopen by itself.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-10 21:08 AEDT
- What changed: Added “Import Recipe” under “Build a meal” so you can import a recipe from a URL or a photo (recipe book page), auto-fill Build a meal with ingredient cards (calories/macros + totals), and optionally save the cooking steps.
- Where to see it (page/link): Food Diary → + → Build a meal → Import Recipe
- What to quickly test: Import by URL; import by photo; confirm ingredients have calories/macros and the totals look right; save to diary; open the entry and confirm the Recipe tab shows steps (only if you chose “Continue + Save recipe”).

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-10 20:36 AEDT
- What changed: Renamed Favorites (like “Chicken breast”) should now stay as the short name in the Food Diary list and in Add from favorites (no more randomly showing the long USDA/database name again after refresh).
- Where to see it (page/link): Food Diary list + Food Diary -> Add from favorites -> Favorites tab
- What to quickly test: Rename a Favorite to a short name. Refresh. Confirm it stays short in the Favorites tab and in your Food Diary list after adding it.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-10 19:23 AEDT
- What changed: In Food Diary -> Add from favorites (All/Favorites/Custom), the pop-up now has a new option “Preview overall macros”. It shows what your full-day macro bars would look like if you added that meal (before you actually add it).
- Where to see it (page/link): Food Diary -> Add from favorites -> tap any item -> “Preview overall macros”
- What to quickly test: Pick a meal, tap “Preview overall macros”, confirm the bars change compared to your current day. Then tap Back and Add to diary, and confirm your Food Diary macro bars match what the preview showed.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-10 18:13 AEDT
- What changed: Add from favorites now keeps your short renamed title even when older entries still have the long USDA/database ingredient name.
- Where to see it (page/link): Food Diary -> Add from favorites
- What to quickly test: Find the chicken example again in Add from favorites (All tab). It should now show your short name (e.g. “Chicken breast”), not the long USDA name.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-10 17:57 AEDT
- What changed: Renaming a Favourite meal now stays consistent in the Add from favorites list (it won’t keep showing the old long USDA/database name after you renamed it).
- Where to see it (page/link): Food Diary -> Add from favorites
- What to quickly test: Rename a Favourite to a short name (e.g. “Chicken breast”), reopen Add from favorites, and confirm it shows the short name (not the long old name).

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-10 15:01 AEDT
- What changed: Fixed the egg "Weight" row on mobile so it no longer stretches off the right side. Egg unit labels are now shorter (example: "extra large egg" instead of "extra large egg — 56g").
- Where to see it (page/link): Food Diary -> open an entry -> expand an egg ingredient card
- What to quickly test: Open an entry with eggs on mobile and check the Weight row fits fully on screen.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-10 14:31 AEDT
- What changed: Adding a Favourite meal into the Food Diary now keeps egg amounts consistent (example: 2 eggs won't turn into confusing numbers like 1.12). This only affects the diary copy; it does not change the original Favourite.
- Where to see it (page/link): Food Diary -> Add from favorites -> pick a Favourite meal that includes eggs
- What to quickly test: Add a Favourite with 2 eggs. Open the diary entry and expand the egg ingredient: it should show 2 (not 1 / 1.12). Then change today's entry to 1 egg and confirm the Favourite still shows 2 eggs next time you view Favorites.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-10 13:39 AEDT
- What changed: “Add by photo” now hides extra USDA disclaimer text in ingredient names (keeps them short), and for piece-based foods it clarifies the difference between the database serving size and what you selected (example: “Serving size: 3 pieces (you have 2)”).
- Where to see it (page/link): Food -> Add by photo results screen
- What to quickly test: Analyze a meal photo that returns a long USDA name, confirm it’s shortened. Analyze “2 fried shrimp” and confirm the serving size line clarifies “(you have 2)”.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-10 12:16 AEDT
- What changed: “Add by photo” now shows “Missing” (not fake 0s) when calories/macros are missing, tries harder to match missing items to the food database automatically, and adds a “Fix missing items (X)” button that walks you through fixing only the broken ingredients.
- Where to see it (page/link): Food -> Add by photo results screen
- What to quickly test: Analyze a meal photo that previously gave 0s. Confirm the ingredient card shows “Missing”, confirm “Fix missing items” opens the right ingredient with search pre-filled, pick matches until all are fixed, then confirm Save works.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-10 03:30 AEDT
- What changed: Photo analysis now defaults ingredient weights to grams (not ounces), and the Food name/title stays short (no serving-size macros/calories dumped into the title).
- Where to see it (page/link): Food -> Add by photo results screen
- What to quickly test: Analyze a meal photo that previously showed oz, confirm Weight shows g by default. Confirm Food name is short like “Grilled salmon, white rice + 3 more”.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-10 02:58 AEDT
- What changed: “Add by photo” now uses the food database to fill calories + macros for ingredient cards (for better accuracy), and it will not let you save if any ingredient card is missing Calories/Protein/Carbs/Fat. If a photo can’t be read, it shows a clear “no ingredients found” message instead of a messy paragraph.
- Where to see it (page/link): Food -> Add by photo (Food Analysis / photo results screen)
- What to quickly test: Add by photo a normal meal (watch the “improving accuracy” message), confirm ingredient cards show calories + macros, and confirm Save is blocked if an ingredient has missing macros. Also test barcode -> missing -> nutrition label photo still saves normally.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-09 23:52:00 AEDT
- What changed: Build-a-meal totals now clearly show when you’re looking at “Your portion totals” (so it doesn’t look like macros are wrong). It also shows a one-line “Whole recipe totals” summary for quick comparison.
- Where to see it (page/link): Food -> Build a meal (especially when editing an existing meal)
- What to quickly test: Open a meal where Portion size is set (e.g. “Saving about 20% of the recipe”), confirm totals box says “Your portion totals” and the Whole recipe summary is shown.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-09 23:22:08 AEDT
- What changed: On Build-a-meal (mobile), tapping into “Search ingredients” or an ingredient “Amount” box now clears the current text so you can type immediately (no backspacing). If you tap in and then tap out without typing, the old value comes back.
- Where to see it (page/link): Food -> Build a meal
- What to quickly test: On mobile, open Build a meal, tap the Search box (it should clear), type a new search, and add an ingredient. Then tap an ingredient Amount (it should clear), type a new amount, and confirm the totals update.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-09 21:13:24 AEDT
- What changed: Build-a-meal now auto-saves your progress while you add ingredients (draft + background updates when editing a diary entry). You won’t lose ingredients if you leave the page. The Update button still takes you back to the Food Diary.
- Where to see it (page/link): Food -> Build a meal
- What to quickly test: Edit a diary meal via Build-a-meal, add/remove an ingredient, wait 1-2 seconds, then go back and confirm the diary entry is updated.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-09 20:47:09 AEDT
- What changed: Food diary now shows clean food names (not long AI paragraphs). You can edit the food name + optional notes, and the updated name saves properly and updates everywhere.
- Where to see it (page/link): Food Diary (Food tab)
- What to quickly test: Scan a barcode -> if missing, add by nutrition photo -> open the entry -> rename it -> save -> go back and confirm the diary list shows the new name.

DEPLOYED:
- LIVE:
- Date/time: Mon Feb 9 17:33 AEDT 2026
- What changed: Food search now always shows Helfi database results first, and uses FatSecret only as a fallback. OpenFoodFacts is no longer used. Results without calories + macros are hidden.
- Where to see it (page/link): https://helfi.ai/food (Add Ingredient + search), and barcode scan in Food Diary.
- What to quickly test: Search Packaged/Fast-foods for “KFC” or “McDonald’s” and confirm fast-food items show first; search a random branded item and confirm you still get results; confirm every result shows calories + protein + carbs + fat.

DEPLOYED:
- LIVE:
- Date/time: Mon Feb 9 19:59 AEDT 2026
- What changed: Packaged/Fast-foods search now has OpenFoodFacts as a LAST fallback (after Helfi database, then FatSecret) to find more packaged foods. Results without calories + macros are still hidden.
- Where to see it (page/link): https://helfi.ai/food/build-meal (Packaged/Fast-foods search) and https://helfi.ai/food/add-ingredient
- What to quickly test: Search “Wokka rice noodles” (or another AU packaged product) and confirm results appear; confirm each result shows calories + protein + carbs + fat.

DEPLOYED:
- LIVE:
- Date/time: Mon Feb 9 20:27 AEDT 2026
- What changed: Barcode scanning now has OpenFoodFacts as a fallback (after Helfi cache + FatSecret). Barcode results must include calories + protein + carbs + fat (otherwise it asks to scan the nutrition label).
- Where to see it (page/link): Food Diary -> Scan barcode
- What to quickly test: Scan barcodes 9310560022376 and 9319133337039 and confirm they now return results with calories + macros.

DEPLOYED:
- LIVE:
- Date/time: Sun Feb 8 18:27 AEDT 2026
- What changed: Reduced the database spike checker frequency from every 5 minutes to every 1 hour to lower overhead.
- Where to see it (page/link): (No UI change. Background safety check schedule only.)
- What to quickly test: Nothing needed. You’ll still receive the spike email if unusual database activity happens, just checked hourly instead of every 5 minutes.

DEPLOYED:
- LIVE:
- Date/time: Sun Feb 8 17:56 AEDT 2026
- What changed: Made the Runaway Protection button a simple toggle: when Health Setup saving is not paused it shows “Pause”, and after you pause it changes to “Unpause”; after unpausing it goes back to “Pause”.
- Where to see it (page/link): https://helfi.ai/admin-panel?tab=templates (Test Email System)
- What to quickly test: Click “Pause (2 min test)”, confirm it changes to “Unpause Now”. Click “Unpause Now”, confirm it changes back to “Pause (2 min test)”.

DEPLOYED:
- LIVE:
- Date/time: Sun Feb 8 17:44 AEDT 2026
- What changed: Fixed the “Check Status” button for Runaway Protection so it no longer shows a fake error and instead always returns a clear status (Paused / Not paused).
- Where to see it (page/link): https://helfi.ai/admin-panel?tab=templates (Test Email System)
- What to quickly test: Click “Check Status” and confirm you see a clear Paused/Not paused message (no red error).

DEPLOYED:
- LIVE:
- Date/time: Sun Feb 8 17:36 AEDT 2026
- What changed: The admin “Runaway Protection” box now clearly shows if Health Setup saving is currently Paused or Not paused, and adds a “Check Status” button so you can confirm the current state after clicking Unpause.
- Where to see it (page/link): https://helfi.ai/admin-panel?tab=templates (Test Email System)
- What to quickly test: Click “Check Status” and confirm it says “NOT paused”. Click “Test Spike Alarm + Pause” and confirm it says “PAUSED” with a time. Click “Unpause Now” then “Check Status” again and confirm it says “NOT paused”.

DEPLOYED:
- LIVE:
- Date/time: Sun Feb 8 17:17 AEDT 2026
- What changed: Fixed the Admin Panel “Refresh Token” so it works even if your admin login expired, and the admin panel now auto-refreshes the token on page load so you don’t get logged out and lose the Users list.
- Where to see it (page/link): https://helfi.ai/main-admin?tab=management
- What to quickly test: Open the page and confirm users load (not 0). If you ever see “Authentication expired” again, click “Refresh Token” and it should recover.

DEPLOYED:
- LIVE:
- Date/time: Sun Feb 8 17:07 AEDT 2026
- What changed: Added an “Unpause Now” button in the admin panel so you can instantly turn off the temporary Health Setup save pause if needed.
- Where to see it (page/link): https://helfi.ai/main-admin (Templates tab -> “Test Email System”)
- What to quickly test: Click “Unpause Now” (it should succeed even if nothing is paused). Then click “Test Spike Alarm + Pause”, confirm you get the email, and confirm “Unpause Now” removes the pause immediately.

DEPLOYED:
- LIVE:
- Date/time: Sun Feb 8 17:05 AEDT 2026
- What changed: Added a “runaway protection” alarm + temporary auto-pause for Health Setup saves to help prevent another Neon spike if a bug causes repeated database writes. Also improved the existing write-spike email alert so it checks for spikes even when Neon cost data is unavailable.
- Where to see it (page/link): https://helfi.ai/main-admin (Templates tab -> “Test Email System” -> “Test Spike Alarm + Pause”)
- What to quickly test: Click “Test Spike Alarm + Pause” and confirm you receive the email. Then try saving Health Setup right after (it should say it’s temporarily paused). Wait ~2 minutes and it should save normally again.

DEPLOYED:
- LIVE:
- Date/time: Sun Feb 8 04:02 AEDT 2026
- What changed: Weekly Health Report: fixed Supplements trust (no medications in Supplements, no duplicate supplement suggestions), added modern charts + mobile-friendly report view, and prevented "sleep consistency" claims unless real wearable sleep data exists.
- Where to see it (page/link): https://helfi.ai/insights/weekly-report
- What to quickly test: Log in as info@sonicweb.com.au, generate + view a weekly report, then confirm Supplements has no medications (ex: Tadalafil) and Suggestions/Things to avoid do not repeat supplements already taken.

DEPLOYED:
- LIVE:
- Date/time: Sun Feb 8 00:36 AEDT 2026
- What changed: Added Guzman y Gomez (Australia) fast-food menu items (official nutrition) so they show in search with calories + macros, with size dropdown where available.
- Where to see it (page/link): https://helfi.ai (Food Diary -> Add ingredient search)
- What to quickly test: Search "Guzman"; pick an item; confirm calories/protein/carbs/fat show. Search "Fries - Chipotle Seasoning" and confirm Medium/Large/Family dropdown.

# 🚨 CURRENT LIVE ISSUES - HELFI.AI

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-07 20:48 AEDT
- What changed: Added the starter phone app code (React Native/Expo) into the repo under `native/` so we can now build the iPhone + Android app.
- Where to see it (page/link): (No visible change on the website. Code-only change in the repo.)
- What to quickly test: Log in and use the website normally for 30 seconds to confirm nothing looks broken.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-07 19:05 AEDT
- What changed: Deployed HEL-7 so the “Link your Apple login” pop-up shows reliably on onboarding (and doesn’t silently fail right after login).
- Where to see it (page/link): https://helfi.ai/onboarding
- What to quickly test: Log in, go to onboarding: confirm the pop-up appears. Click “Link Apple login” and confirm it starts the Apple link flow. Click “Skip/Not now” and confirm it closes.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-07 18:36 AEDT
- What changed: Deployed the fix for HEL-5 so Health Setup does NOT run “Updating insights…” in the background unless the user actually changed something (QA PASS).
- Where to see it (page/link): https://helfi.ai/onboarding
- What to quickly test: Log out, log back in, do not click anything: the “Updating insights…” message should NOT appear. Then change one field and confirm it DOES appear.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-07 16:12 AEDT
- What changed: Added “no more authorize drama” rules: project link, do NOT log Linear out, and what to do if the wrong Linear workspace shows up.
- Where to see it (page/link): Repo docs: `AGENTS.md` + `PROJECT_STATUS.md`
- What to quickly test: New agents should NOT run any Linear logout/reconnect. They should open the “Helfi Dev” project link and see the same tickets (HEL-5, HEL-6, etc).

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-07 16:01 AEDT
- What changed: Linear coordination now supports the default Linear columns (Todo / In Progress / Done) using labels for Blocked + Ready to deploy, so agents stop getting stuck on “wrong column names”.
- Where to see it (page/link): Repo docs: `AGENTS.md` + `PROJECT_STATUS.md`. Linear labels: `Blocked`, `Ready to deploy`.
- What to quickly test: In Linear “Helfi Dev”, set an issue to `In Progress` for active work. When ready for QA, move it to `Todo` and add label `Ready to deploy`.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-07 14:30 AEDT
- What changed: Added a Playwright “save logged-in session” script so the testing agent can stay logged in and stop asking for logins repeatedly. Improved it to confirm a real logged-in session (not just “page loaded”).
- Where to see it (page/link): Repo file: `scripts/save-playwright-auth.mjs`
- What to quickly test: Run `node scripts/save-playwright-auth.mjs --mode credentials` (or `--mode google`) and confirm it creates a file under `playwright/.auth/` (this folder is ignored by git).

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-07
- What changed: Added REQUIRED agent coordination rules (use Linear project "Helfi Dev" to avoid conflicts; only one "Ready to deploy" at a time). Clarified that on this setup all agents share the same Mac/login so they should not ask for emails/invites.
- Where to see it (page/link): Repo docs: `AGENTS.md` + `PROJECT_STATUS.md`
- What to quickly test: Open `AGENTS.md` and confirm the new "Agent Coordination (REQUIRED)" section is present. New agents should follow it before starting work or deploying.

**Last Updated**: January 10th, 2025 by Agent #46
**Production URL**: https://helfi-b7kw09kuy-louie-veleskis-projects.vercel.app

---

## DEPLOYED (LIVE) - 2026-02-07

**What changed (simple)**:
- Health Setup will no longer run “Updating insights…” in the background unless you actually changed something.
- The Gender + Terms step will no longer auto-save on page load. It only saves when you click Male/Female or tick the checkbox.

**Where to see it**:
- https://helfi.ai/onboarding

**What to quickly test**:
- Log out, log back in, do not change anything: you should NOT see “Updating insights…” appear.
- On step 1 (Gender): clicking Male/Female should still work as normal.
- Ticking Terms should still work as normal.

## **🔥 CRITICAL ISSUES**

### **1. 📱 ACCORDION DROPDOWN MISALIGNMENT - MOBILE ONLY**
**Status**: ❌ **CRITICAL** - Costing user money, multiple agents failed
**Severity**: HIGH - Affects core functionality

**BREAKTHROUGH DISCOVERY by Agent #46**:
- **Works perfectly on DESKTOP** ✅
- **Fails completely on MOBILE (iPhone)** ❌
- **This is a MOBILE-SPECIFIC issue** - NOT data structure related

**Problem Description**:
- User adds supplement → triggers fresh analysis → Page 8 accordion dropdowns malfunction
- Clicking first accordion opens second accordion instead
- Clicking second accordion opens recommendations section
- "Show History" button may navigate to page 9 incorrectly

**Critical Insight**:
ALL previous agents (Agent #37-#46) focused on wrong root causes:
- ❌ Data structure mismatches
- ❌ Component re-rendering
- ❌ State synchronization
- ❌ Backend API differences

**Real Issue**: Mobile Safari touch event handling or CSS behavior

**What Agent #46 Tried (FAILED)**:
- Mobile touch optimizations (`onTouchStart`, `touch-manipulation`)
- Event prevention for touch events
- WebKit tap highlight removal

**For Next Agent**:
- Focus on iOS Safari specific behaviors
- Test on actual iPhone device (not desktop dev tools)
- Investigate CSS touch-action properties
- Consider alternative accordion implementation for mobile

---

### **2. 💾 SUPPLEMENT SAVING RACE CONDITION**
**Status**: ❌ **CRITICAL** - Data loss issue
**Severity**: HIGH - User loses entered data

**Problem Description**:
- User adds supplement → clicks "Next" → supplement not saved to database
- Caused by React state update race condition
- `onNext({ supplements })` called before `setSupplements()` completes
- Backend "delete all + recreate" strategy causes data loss

**Root Cause**:
```typescript
// In addSupplement function:
setSupplements((prev) => [...prev, supplementData]); // Async
// User clicks "Next" button immediately:
onNext({ supplements }); // Uses old state, missing new supplement
```

**Backend Issue**:
```typescript
// API deletes ALL supplements then recreates from incomplete list
await prisma.supplement.deleteMany({ where: { userId: user.id } });
await prisma.supplement.createMany({ data: data.supplements }); // Missing new supplement
```

**Solution Options**:
1. Fix race condition with `flushSync`
2. Change backend to additive approach (safer)
3. Ensure `onNext` uses most current data

---

## **✅ WORKING FEATURES**

### **1. Page 8 Accordion - Desktop**
- Direct navigation to page 8 works perfectly
- All accordion dropdowns function correctly on desktop browsers
- History section works properly

### **2. Supplement Adding UI**
- Form validation works
- UI updates correctly when supplements added
- Visual feedback is appropriate

---

## **🔍 INVESTIGATION STATUS**

### **Agent #46 Findings**:
- **MOBILE-SPECIFIC NATURE** of accordion issue confirmed
- **SUPPLEMENT SAVING RACE CONDITION** identified
- **FAILED APPROACHES** documented to avoid repetition

### **Next Agent Priority**:
1. **MOBILE ACCORDION FIX** - Test on actual iPhone
2. **SUPPLEMENT SAVING FIX** - Critical data loss prevention
3. **AVOID FAILED APPROACHES** - Don't repeat Agent #46's methods

---

## **⚠️ DEPLOYMENT WARNINGS**

- **Current state**: All Agent #46 changes reverted
- **No new deployments** until issues resolved
- **Test on mobile device** before any deployment
- **Verify supplement saving** before claiming fix

---

## **📊 USER IMPACT**

- **Financial**: User spending money on credits for broken functionality
- **Frustration**: Multiple failed agent attempts
- **Data Loss**: Potential supplement data not being saved
- **Mobile Users**: Cannot use Page 8 accordion functionality

**URGENT**: Next agent must succeed where 10+ previous agents failed.
DEPLOYED:
- LIVE:
- Date/time: 2026-02-10 22:07 AEDT
- What changed: Fixed renamed Favorites sometimes reverting back to long USDA names after refresh (we now always load the newest saved Favorites + name-override record).
- Where to see it (page/link): Food Diary (`/food`) and “Add from favorites” list.
- What to quickly test: Rename a Favorite to “Chicken breast”, refresh the page, confirm Favorites + Food Diary lists stay short (no long USDA title).
