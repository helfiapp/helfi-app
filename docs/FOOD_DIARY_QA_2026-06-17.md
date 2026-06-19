# Food Diary QA - 2026-06-17

Linear ticket: HEL-439

Rules for this QA pass:
- No deploy unless the owner explicitly asks.
- Do not expose secrets, passwords, keys, codes, or private tokens.
- Do not change protected Food Diary code unless the owner approves it.
- Keep results plain-English and focused on what a normal user sees.
- Web Food Diary is the baseline. iOS should match the web app in functionality and UI as closely as possible.

## Current Focus

Food Diary is the highest-priority area while Apple review is pending.

## Test Matrix

| Area | What to test | Status | Notes |
| --- | --- | --- | --- |
| Web login and Food Diary load | Live site opens, account is logged in, Food Diary is usable | Pass | Needed fresh login to approved test account |
| Single ingredients - fruit | Banana, apple, orange, avocado | In progress | Banana passed; apple/orange/avocado gaps found |
| Single ingredients - staples | Egg, chicken breast, rice, oats, potato | Not started | Check calories/macros look reasonable |
| Single ingredients - liquids | Milk, orange juice, olive oil, water-style drinks | In progress | Milk defaults to grams; liquid serving gaps found |
| Serving changes | Change serving size, weight, servings, and unit | Not started | Front card and edit screen should match |
| Add flows | Add ingredient, add by photo, favourites, custom food, barcode where practical | Not started |  |
| Meal sections | Breakfast, Lunch, Dinner, Snacks, Other | Not started | Add menu opens/closes; entries land in right section |
| Entry actions | Edit, delete, duplicate, copy to today, add to favourites | In progress | Banana row menu and edit screen checked |
| Date navigation | Today, previous day, next day, refresh | In progress | Previous/Today and kJ toggle passed visually; console errors seen |
| Favourites/custom | Open picker, preview, add, change portion, rename check only | Not started | Do not change protected rename code |
| Water/drink link | Water intake drinks, sweetener choices, drink icons, ml amount | Not started | Existing meal rows must not disappear |
| Photo scanning - simple | Single food photos | Not started | Track time, food name, nutrition cards |
| Photo scanning - mixed meal | Mixed plate photos | Not started | Must produce separate ingredient cards where possible |
| Nutrient cards | Calories, protein, carbs, fat, fibre, sugar | Not started | Cards should appear consistently |
| Credits/usage display | Credit balance and AI usage text | Not started | Do not test by direct API key or billing scripts |
| Native iOS practical pass | Food Diary load and key add/edit paths | Blocked/partial | Simulator launched but safe password paste did not work; code parity checked |
| Web vs iOS parity | Compare wording, options, layout, and behaviour | In progress | Web is the source of truth |

## Fix Pass - 2026-06-18

Fixed locally:
- Common single-food search now ranks plain/raw foods ahead of processed matches for apple, orange, coffee, and egg.
- USDA serving lookups now add missing common size options from Helfi's measurement list, including small/medium/large/extra large where available for apple, orange, avocado, banana, and egg.
- USDA liquid serving lookups now add clear ml options for liquids such as milk, juice, coffee, and oils.
- Web Food Diary unit choices no longer show odd solid-only options like pinch for liquids.
- iOS Add Ingredient now follows the same liquid-unit rule as web and prefers ml serving choices when available.
- iOS Food Diary Import Recipe menu subtitle now matches web and mentions auto-filling Build a meal.

Verified locally:
- `apple` search now starts with raw apples.
- `orange` search now starts with raw oranges, not orange juice/peel/other orange-coloured foods.
- `coffee` search now starts with brewed coffee.
- `egg` search now starts with whole raw egg.
- `whole milk` still starts with whole milk.
- `olive oil` still starts with olive oil.
- `npm run check:custom-food-servings` passed.
- `npm run check:page-locks` passed after refreshing the approved lock snapshot.
- `npm --prefix native run check:page-locks` passed after refreshing the approved lock snapshot.
- `node scripts/protect-regions.js` passed.
- `npm --prefix native run typecheck` passed.
- `npx tsc --noEmit --pretty false` passed.

Still needs visual confirmation:
- Local serving lookup could not show USDA detail options because the local USDA detail key is not available in this environment. Code checks passed, but final confirmation should be done in the app UI after deploy if the owner asks to deploy.
- iOS Add Ingredient still needs final live-backed confirmation after deploy for the shared food-search fixes, because the simulator currently talks to the live service by default.

## Fix Pass 2 - iOS Parity and Accessibility

Fixed locally:
- iOS meal plus buttons now have clear names like "Add to Breakfast", "Add to Lunch", and "Add to Dinner".
- iOS add-menu rows now have clear names for testing/accessibility.
- iOS Barcode Scanner subtitle now matches web: "Scan packaged foods • 3 credits per scan".

Verified on iPhone simulator:
- App reopened already logged in to the native test account.
- Food Diary loaded successfully.
- Meal plus buttons were exposed correctly after restart.
- Breakfast add menu showed: Photo Library / Camera, Favorites, Recommended, Barcode Scanner, Add ingredient, Build a meal, Import Recipe, and Log Water Intake.
- Barcode Scanner wording matched web after the fix.

Checks passed after this fix:
- `npm --prefix native run typecheck`
- `npx tsc --noEmit --pretty false`
- `npm run check:custom-food-servings`
- `node scripts/protect-regions.js`
- `npm run check:page-locks`
- `npm --prefix native run check:page-locks`

## Fix Pass 3 - Add Ingredient Defaults and iOS Plain-Food Ranking

Fixed locally:
- Web Add Ingredient now opens with Single food selected by default.
- iOS Add Ingredient now opens with Single food selected by default.
- iOS plain-food result ordering now promotes actual plain foods above processed matches.
- iOS plural matching now handles words like oranges correctly instead of treating them as "orang".
- Moved the Food Log meal-category helper out of the API route file so fresh Next type checks pass.

Verified:
- Web Add Ingredient opened locally with Single food selected.
- Web whole milk search showed plain whole milk first.
- iPhone Add Ingredient opened with Single food selected.
- iPhone whole milk search showed plain whole milk first.
- iPhone apple search showed raw apples first when pointed at the local fixed backend.
- iPhone orange search showed raw oranges first, with peel and juice lower.
- `npm --prefix native run typecheck` passed.
- `npx tsc --noEmit --pretty false` passed after the Food Log helper move.
- `npm run check:custom-food-servings` passed.
- `node scripts/protect-regions.js` passed.
- `npm run check:page-locks` passed.
- `npm --prefix native run check:page-locks` passed.

## Fix Pass 4 - Staple Ranking and Size-Unit Fallback

Fixed locally:
- Cooked rice search now starts with a generic cooked rice result, not a branded Uncle Ben's result.
- Walnuts search now starts with plain English walnuts, not salted roasted walnuts.
- The size-unit endpoint now falls back to Helfi's built-in fruit/egg size data when USDA serving detail options are empty.
- Liquids are blocked from receiving fruit piece sizes, so orange juice does not get small/medium/large orange units.

Verified locally:
- Common ingredient matrix returned good top results for banana, apple, orange, avocado, egg, chicken breast, cooked rice, oats, potato, walnuts, whole milk, orange juice, olive oil, coffee, rice noodles, oat bran, and walnut oil.
- `/api/food-data/size-units` returned small/medium/large/extra-large options for banana, apple, orange, and avocado.
- `/api/food-data/size-units` returned small/medium/large/extra-large egg options for egg.
- `/api/food-data/size-units` returned no fruit piece sizes for whole milk, orange juice, olive oil, or coffee.
- `npm --prefix native run typecheck` passed.
- `npx tsc --noEmit --pretty false` passed.
- `npm run check:custom-food-servings` passed.
- `node scripts/protect-regions.js` passed.
- `npm run check:page-locks` passed.
- `npm --prefix native run check:page-locks` passed.

## Initial Single Ingredient List

Fruit/countable:
- Banana
- Apple
- Orange
- Avocado
- Egg

Solids:
- Chicken breast
- Cooked rice
- Oats
- Potato
- Walnuts

Liquids:
- Milk
- Orange juice
- Olive oil
- Coffee

## Running Results

- Web Food Diary load: PASS. Live page opened at `/food`, showed today's date, meal sections, energy summary, profile menu, and no browser console errors.
- Web add menu: PASS. Main Add Food Entry menu opened and showed Breakfast/Lunch/Dinner/Snacks/Other.
- Web Breakfast section add menu: PASS. Showed Photo Library / Camera, Favorites, Recommended, Barcode Scanner, Add ingredient, Build a meal, Import Recipe, and Log Water Intake.
- Single food search, banana: PARTIAL PASS. Search returned USDA results quickly with no browser console errors. "Bananas, raw" had gram default plus small/medium/large/extra large banana options and reasonable nutrition.
- Add banana to diary: PASS after fresh test-account login. Saved to Breakfast, updated energy/macros, and no browser console errors appeared.
- Stale placeholder session check: RETEST/NOTE. Before fresh login, profile menu showed a placeholder account and add failed with "User not found." After logging into the approved test account, the same add worked.
- Banana row action menu: PASS. Menu opened and showed Add to Favorites, Duplicate Meal, Copy to Today, Copy for 7 days, Move entry, Edit Entry, and Delete.
- Banana edit screen: PASS. Edit Entry opened, showed detected food card, serving controls, weight unit choices, small/medium/large/extra large banana options, nutrient cards, time edit, Update Entry, and Cancel changes.
- Cancel edit: PASS. Returned to Food Diary without changing the entry.
- Delete banana test entry: PASS. Entry disappeared, daily totals returned to zero, and no browser console errors appeared.
- Built-in custom/plain serving checker: PASS. `npm run check:custom-food-servings` passed for 502 rows.
- Apple search: FIXED LOCALLY. Raw apple now appears first, and the size-unit endpoint returns small/medium/large/extra-large apple sizes.
- Orange serving options: FIXED LOCALLY. Raw orange now appears first, and the size-unit endpoint returns small/medium/large/extra-large orange sizes.
- Avocado serving options: FIXED LOCALLY. Raw avocado appears first, and the size-unit endpoint returns small/medium/large/extra-large avocado sizes.
- Egg serving options: PASS. Whole raw egg had small, medium, large, extra large, and jumbo.
- Whole milk UI: FIXED LOCALLY. Liquids now prefer ml and do not show odd solid-only options like pinch.
- Liquid serving API spot checks: PARTIAL FIX LOCALLY. Liquids no longer get fruit piece sizes from the size-unit endpoint. Full USDA ml serving-detail confirmation still needs live/deployed verification because local USDA serving details return empty.
- Native iOS launch: PARTIAL. App launched after starting Metro. Initial launch showed a red error because the native server was not running; reload worked once Metro started.
- Native login: PASS. iOS reopened already logged in to the approved native test account after storing the session safely. I did not print or write the password or session token into notes.
- Native add-menu code parity: PARTIAL PASS. The main meal add options exist in native code: Photo Library / Camera, Favorites, Recommended, Barcode Scanner, Add ingredient, Build a meal, Import Recipe, and Log Water Intake.
- Native wording parity gaps: PARTIAL FIX. Import Recipe subtitle and Barcode Scanner subtitle now match web locally. Native embedded Add ingredient helper text differs from web but the main add-menu choices are in parity.
- Native embedded Add ingredient parity gap: Native embedded add ingredient includes shortcut buttons for Scan barcode, Add from favorites, and Add by photo, while the web Add Ingredient screen shows Missing item, AI photo analysis, Add image, and Reset. Needs visual confirmation after login.
- Date navigation: PASS visually. Previous day and back to Today worked; the summary did not go blank.
- kJ toggle: PASS visually. Today switched to kJ and updated daily allowance/used/exercise labels.
- Browser console health: WARNING/FAIL. Food Diary produced repeated minified React errors (#418 and #423) during the session. The page kept working visually, but this needs investigation because hidden errors can cause unstable behaviour.

## Bugs Found

- Possible bug or stale-session risk: Food Diary can appear usable while profile menu shows a placeholder account, then saving can fail with "User not found." Fresh login fixed it, so this needs one more repeat before calling it a confirmed product bug.
- Fixed locally, needs final UI confirmation after deploy: Whole milk should now prefer ml and liquids should not show pinch.
- Fixed locally: Common raw fruits and plain drinks now rank above less useful processed results for apple, orange, coffee, and egg.
- Fixed locally, needs final UI confirmation after deploy: USDA serving options are now enriched with common size choices and ml options when USDA detail data is available.
- Native parity gap partially fixed locally: iOS Add Ingredient now uses the same liquid unit behaviour as web, and Import Recipe menu wording now matches web. Helper-action parity still needs visual confirmation after login.
- Fixed locally: iOS meal plus buttons and add-menu rows now expose clear names for accessibility/testing.
- Fixed locally: iOS Barcode Scanner subtitle now matches the web app credit wording.
- Fixed locally: Web and iOS Add Ingredient now default to Single food, which is better for normal ingredient searches.
- Fixed locally: iOS result ordering now matches the fixed web/backend plain-food relevance for milk, apple, and orange.
- Fixed locally: Fresh Next type checking no longer fails because Food Log route helpers were moved out of the API route export.
- Fixed locally: Cooked rice and walnuts now rank more naturally.
- Fixed locally: Fruit/egg small, medium, large, and extra-large size units now work through the size-unit endpoint even when USDA detail data is unavailable.
- Fixed locally: Orange juice and other liquids are protected from fruit piece-size options.
- Web technical warning: repeated React errors (#418/#423) appeared in browser logs while testing Food Diary, even though the visible page kept working.

## Fix Pass 5 - Serving Label Polish, Liquid Defaults, and iOS Add Button Access

Fixed locally:
- Web orange size labels now read cleanly as small orange, medium orange, large orange, and extra large orange.
- Web Food Diary/Add Ingredient no longer produced new browser loading warnings after the credits meter hydration fix.
- Web whole milk now opens the adjust popup at 100 ml instead of 100 g.
- iOS whole milk now opens the adjust popup at 100 ml, matching web.
- iOS search result Add buttons now have clear accessible labels like "Add Milk, whole..." so they are reachable and testable.

Verified:
- Web orange adjust popup showed small/medium/large/extra-large orange options with clean labels.
- Web whole milk adjust popup showed amount 100 and unit ml, with no fruit size options.
- Timestamped web browser check after the fix showed no new hydration/loading warnings.
- iPhone app rebuilt successfully and stayed logged in.
- iPhone Food Diary add menu still showed the expected add paths.
- iPhone whole milk search put plain whole milk first.
- iPhone whole milk adjust popup showed amount 100 and unit ml.
- `npx tsc --noEmit --pretty false` passed.
- `npm --prefix native run typecheck` passed.

## Fix Pass 6 - iOS Produce Serving Parity and Selector Access

Fixed locally:
- iOS orange no longer opens at a random live-USDA amount like 96 g.
- Web and iOS now keep Helfi's built-in fruit/egg size values ahead of live USDA serving guesses.
- iOS orange size choices now match web: small orange 130 g, medium orange 160 g, large orange 200 g, extra large orange 240 g.
- iOS Add Ingredient back/close controls are now exposed as Back and Close Add ingredient.
- iOS Adjust ingredient close button is now exposed as Close adjust ingredient.
- iOS adjust unit and base-serving selectors now have clear accessible labels, so the menus are reachable for testing/accessibility.

Verified:
- iPhone orange search showed raw orange first.
- iPhone orange adjust popup opened at 100 g and 47 kcal.
- iPhone orange unit menu showed small 130 g, medium 160 g, large 200 g, and extra large 240 g.
- iPhone Add Ingredient close/back buttons and adjust close/unit selector appeared as tappable controls in the UI snapshot.
- `npx tsc --noEmit --pretty false` passed.
- `npm --prefix native run typecheck` passed.
- `npm run check:custom-food-servings` passed.

## Fix Pass 7 - iOS Serving Option Selection

Fixed locally:
- iOS serving-size menu rows are now individually tappable/reachable, not just visible.
- Solid foods no longer show ml as a selectable unit; drinks still keep ml.
- Searching milk now returns plain whole milk before buttermilk, dry milk, chocolate milk, canned milk, and other less useful matches.
- Private request headers are now redacted in debug logs/endpoints that were exposed during Food Diary native testing.

Verified:
- iPhone orange adjust menu exposed tappable choices for g, oz, cup sizes, small orange, medium orange, large orange, and extra large orange.
- Selecting medium orange changed the unit to "medium orange - 160g", amount to 1, servings to 1.6, and calories to 75.
- Direct web API check for milk returned "Milk, whole" first at 100 ml and 61 kcal.
- Direct unit-list check returned no ml for orange, and ml for whole milk.
- iPhone orange adjust menu no longer showed ml.
- iPhone milk search returned "Milk, whole" first at 100 ml and 61 kcal.
- iPhone whole milk adjust popup opened at amount 100 and unit ml, with calories 61.
- Fake-token auth-test check returned authorization and cookie as "[REDACTED]" and did not return the fake token/cookie values.

## Fix Pass 8 - Web Main Add Menu Parity

Fixed locally:
- Web main Add Food Entry -> meal menu now matches the iOS add-menu choices and order.
- Web changed "Manual Entry" to "Add ingredient" in that menu, matching iOS wording.
- Web main add menu now includes Build a meal, Import Recipe, and Log Water Intake.

Verified:
- Web Food Diary rendered after reload.
- Web Add Food Entry -> Breakfast showed Photo Library / Camera, Favorites, Recommended, Barcode Scanner, Add ingredient, Build a meal, Import Recipe, and Log Water Intake in that order.
- Web Add ingredient option opened the Add ingredient search screen for Breakfast.
- This browser check did not reproduce the earlier React #418/#423 errors; one stale local-dev syntax log appeared from the first load but the page rendered and interactions worked after reload.

## Fix Pass 9 - Food Diary Mobile Viewport Warning

Fixed locally:
- Moved the app viewport setting from metadata to the correct Next.js viewport export.

Verified:
- `/food` returned 200 locally.
- `/food/add-ingredient?date=2026-06-18&category=breakfast` returned 200 locally.
- The previous "Unsupported metadata viewport" warning did not appear after loading the Food Diary pages.

## Fix Pass 10 - Milk Search and Water Menu Polish

Fixed locally:
- Web and iPhone now return clean ml-based first results for common milk searches:
  - whole milk -> Milk, whole, 100 ml, 61 kcal
  - skim milk -> Milk, skim/nonfat, 100 ml, 34 kcal
  - almond milk -> Almond milk, unsweetened, 100 ml, 15 kcal
  - oat milk, soy milk, and coconut milk now also return drink-style ml results first.
- Plant milk searches no longer show obvious wrong results like almond chocolate candy first.
- Web Log Water Intake menu icon no longer exposes or risks showing the raw text `water_drop`.

Verified:
- Web local Add ingredient showed whole milk first as 100 ml / 61 kcal.
- iPhone simulator, pointed at the local backend, showed whole milk first as 100 ml / 61 kcal.
- iPhone simulator showed skim milk first as 100 ml / 34 kcal.
- iPhone simulator showed almond milk first as 100 ml / 15 kcal.
- Web Add Food Entry -> Breakfast -> Log Water Intake accessibility label was clean: "Log Water Intake Add water, tea, coffee, or bottle sizes".

## Live Photo Scanning QA - Initial Pass

Tested with public Wikimedia food photos against the live app test account because local AI photo analysis is not configured.

| Image | Result | Time | Notes |
| --- | --- | ---: | --- |
| Eggs, ham, toast, mushrooms | Partial pass | 33.4s | Correctly split toast/ham, fried eggs, mushrooms. Fibre/sugar totals came back blank. |
| Fruit plate | Pass | 32.5s | Correctly split orange, kiwi, watermelon, pomegranate, mint. Nutrients looked reasonable. |
| Chicken/rice/vegetables | Fail before local fix | 23.4s | Duplicated "mixed vegetables" three times and inflated totals. Fibre/sugar totals came back blank. |
| Fancy toast with egg | Pass | 23.5s | Correctly split toast, fried egg, tomato, tea. Nutrients looked reasonable. |

Fixed locally after live photo QA:
- Photo analysis now removes exact duplicate detected food cards before returning results.
- Photo analysis now recomputes totals after cleanup so duplicate items cannot inflate the final meal.
- Photo analysis now returns fibre and sugar as 0 instead of blank when the analyzer has no value, keeping nutrient cards consistent.

## Fix Pass 11 - iPhone Water Intake Meal Parity

Fixed locally:
- iPhone Food Diary now sends the selected meal and date into Water Intake when opened from a meal section.
- iPhone Water Intake now saves water/drink entries back to that selected meal instead of always using Other.
- iPhone Food Diary now shows water entries inside the meal sections, with water totals in the section summary.
- iPhone Food Diary water rows now expose Edit and Delete actions in the meal section.
- The iPhone meal add sheet is taller so the full add list, including Log Water Intake, is visible and easier to tap.

Verified:
- iPhone Food Diary rebuilt and opened logged in to the test account.
- Breakfast/Lunch/Dinner/Snacks/Other add buttons were visible.
- Breakfast add menu showed the same ordered options as web: Photo Library / Camera, Favorites, Recommended, Barcode Scanner, Add ingredient, Build a meal, Import Recipe, Log Water Intake.
- The updated sheet visually showed all options without clipping.
- `npm --prefix native run typecheck` passed.

Note:
- The iPhone automation tool tapped the wrong screen position for the bottom Log Water Intake row before and after the visual sheet fix, so I did not count a full tap-through water save as visually verified yet. The code path is fixed locally and still needs one more hands-on iPhone tap/save check.

## Fix Pass 12 - iPhone Favorites Button Clarity

Fixed locally:
- iPhone Favorites now gives clear names to the icon-only actions for closing Favorites, clearing search, saving to Favorites, removing from Favorites, and editing a saved item.
- This brings the iPhone Favorites controls closer to the web picker, where those icon buttons already have clear labels.

Verified:
- `npm --prefix native run typecheck` passed.
- `npx tsc --noEmit --pretty false` passed.

## Fix Pass 13 - iPhone Photo Add Feedback

Fixed locally:
- iPhone photo add now filters out unusable "no food detected" analysis results before saving.
- iPhone photo add no longer says Done when zero food entries were actually saved.
- iPhone photo add now shows a clear Add failed message if the photo was analyzed but the food entry could not be saved.
- The Add ingredient photo path now matches the safer main Food Diary photo path.

Verified:
- `npm --prefix native run typecheck` passed.
- `npx tsc --noEmit --pretty false` passed.
- Web page lock check passed with only the approved Food Diary files allowed.
- Native page lock check passed with only the approved Food Diary files allowed.
- Protected region guard passed.
- Custom/plain food serving check passed for 502 rows.

## Fix Pass 14 - iPhone Daily Target Parity

Fixed locally:
- iPhone Food Diary now uses the same saved-profile daily target calculation as web.
- This fixed a visible mismatch where web showed 2284 kcal and iPhone showed the fallback 2200 kcal for the same account/date.

Verified:
- Web Food Diary showed Daily allowance: 2284 kcal.
- iPhone Food Diary showed Daily allowance: 2284 kcal after the fix.
- `npm --prefix native run typecheck` passed.
- `npx tsc --noEmit --pretty false` passed.

## Fix Pass 15 - iPhone Add/Edit Control Reachability

Fixed locally:
- iPhone Add ingredient source buttons, search button, Missing item, Add image, Reset, Add to diary, and Cancel are now reachable as real named buttons.
- iPhone edit-food controls now expose named buttons for meal choice, Save, Cancel, and Delete.

Verified:
- iPhone Breakfast -> Add ingredient exposed Packaged/Fast-foods, Single food, Missing item, Add image, and Reset as tappable controls.
- iPhone whole milk search, pointed at the local fixed backend, returned Milk, whole first at 100 ml / 61 kcal.
- iPhone adjust popup opened at 100 ml, 61 kcal, and showed protein, carbs, fat, fibre, and sugar.
- iPhone Add to diary saved the milk test entry and updated totals from 0 to 61 kcal.
- iPhone edit-food screen opened the saved milk entry and exposed Save, Cancel, Delete, and meal buttons.
- iPhone Delete removed the test entry and totals returned to 0 kcal used.

## Fix Pass 16 - Independent Liquid/Water QA Pass

Fixed locally:
- Web and iPhone single-food liquid searches now avoid 100 g defaults for more common drinks/oils:
  - orange juice -> 100 ml / 45 kcal
  - coffee -> 100 ml / 2 kcal
  - olive oil -> 1 tbsp (15 ml) / 122 kcal
- Liquids no longer receive fruit-size choices such as small/medium/large orange in the adjust popup.
- iPhone Water Intake controls now have clear button names for testing/accessibility:
  - date buttons, Edit water goal, drink type chips, quick amount buttons, unit buttons, Add water entry, and Delete water entry.

Verified:
- Web Food Diary loaded locally and stayed logged in.
- Web Add Food Entry -> Breakfast showed the expected ordered options.
- Web Add ingredient opened with Single food selected by default.
- Web orange juice search showed Orange juice first as 100 ml / 45 kcal.
- Web orange juice adjust popup opened at 100 ml / 45 kcal and no longer showed fake small/medium/large orange juice choices.
- Web orange juice test entry saved to Breakfast, totals changed to 45 kcal, then the entry was deleted and totals returned to 0.
- Web water entry from Breakfast saved as 250 ml, showed under Breakfast in Food Diary, then was deleted and Water Intake returned to 0 ml.
- Web date navigation Previous -> Today worked.
- Web kcal/kJ toggle worked.
- iPhone app rebuilt and opened logged in.
- iPhone Food Diary showed the same 2284 kcal daily allowance as web.
- iPhone Breakfast add menu matched web option order.
- iPhone orange juice search showed ml-based results.
- iPhone orange juice adjust popup opened at 100 ml / 45 kcal with protein, carbs, fat, fibre, and sugar visible.
- iPhone orange juice unit menu no longer showed fake small/medium/large orange juice choices.
- iPhone orange juice test entry saved to Breakfast, totals changed to 45 kcal, then the entry was deleted and totals returned to 0.
- iPhone Water Intake from Breakfast saved a 250 ml water entry and Food Diary showed it under Breakfast. The test row was deleted afterward from web Water Intake, leaving the test account clean.

Checks passed:
- Web type check: `npx tsc --noEmit --pretty false`
- iPhone type check: `npm --prefix native run typecheck`
- Custom/plain food serving check
- Protected-region guard
- Web/native page lock check passed when the current changed locked native files were explicitly allowed.

Notes:
- The first local browser load hit a temporary local-dev chunk timeout while Next.js was compiling. Reload fixed it and the issue did not block later testing.
- No deployment made.

## Final Independent QA Pass - 2026-06-19

Overall status: NOT 100% tested.

Reason:
- Web Food Diary had several real failures.
- iPhone had several real failures.
- iPhone Build a meal and Import Recipe could not be fully tested before the simulator/app tree became unreliable.
- Web photo scanning could not be fully retested under the new rule to avoid separate browser sessions.

No deployment was made.

### Web tested

Passed:
- Food Diary loaded logged in at `/food`.
- Date navigation worked: previous day, next day, and Today/current date behavior.
- kcal/kJ toggle worked and visible totals changed.
- Top Add Food Entry button opened the meal picker.
- Breakfast, Lunch, Dinner, Snacks, and Other add buttons all opened menus.
- Every meal add menu showed this order and wording:
  - Photo Library / Camera
  - Favorites
  - Recommended
  - Barcode Scanner
  - Add ingredient
  - Build a meal
  - Import Recipe
  - Log Water Intake
- Single ingredient search matrix passed for first-result quality and practical units:
  - Banana, Apple, Orange, Avocado, Egg, Chicken breast, Cooked rice, Oats, Potato, Walnuts, Whole milk, Skim milk, Almond milk, Orange juice, Olive oil, Coffee.
- Banana and Oats search/add/edit/delete flows worked.
- Edit food entry opened and saved.
- Delete food entry worked.
- Move entry between meal sections worked.
- Duplicate meal worked.
- Copy to today worked.
- Copy for 7 days worked.
- Add entry to favorites worked from an entry action.
- Build a meal opened, searched banana, added an ingredient, saved a temporary QA meal, and the temporary meal was deleted.
- Import Recipe opened URL/photo modes. Empty URL validation worked. A real URL import finished in about 6 seconds and carried through to Build a meal review.
- Barcode Scanner opened. Manual barcode `9300605145057` reached the nutrition-label-needed/fallback path.
- Exercise add/delete worked and changed the Food Diary display/totals while present.
- Water Intake tested water 250 ml, 330 ml, custom 125 ml, and custom 0.1 L. Entries landed in the selected meal section and were cleaned up.
- Empty states were checked where practical after deleting test entries.
- Web cleanup was confirmed for the tested dates; no QA food or water entries were left behind.

Web failures or partials:
- Summary totals mismatch:
  - Repro: add/edit/copy Oats; visible rows summed to 584/779/195 kcal in tested states, but the top summary showed 592/790/198.
  - Repro: Build a meal banana row showed 89 kcal, but the summary showed 98 kcal.
  - Not fixed because this touches protected Food Diary summary logic.
- Edit Entry React warning:
  - Repro: open an entry, choose Edit Entry.
  - Warning seen: `Cannot update a component (UserDataProvider) while rendering a different component (FoodDiary)`.
- Favorites picker web problem:
  - Repro: open Favorites from Food Diary add menu, click Oats favorite row.
  - Result: row did not open preview/add and did not add to diary. Remove required a coordinate click.
  - Not fixed because favorites/rename areas are protected.
- Recommended web failed:
  - Repro: open Recommended and generate.
  - Result: failed twice with `AI is temporarily busy. Please try again in a moment.`
- Import Recipe quality problem:
  - Repro: import `https://www.bbcgoodfood.com/recipes/banana-bread`.
  - Result: import completed, but ingredient matching was poor. Examples: ripe bananas matched mashed potatoes with gravy, banana chips matched dried jujube, self-raising flour matched buckwheat flour, and eggs needed manual handling.
  - Credits briefly displayed inconsistently as 737 at the top and 747 lower down.
- Web photo scanning was not fully retested with real uploads in this pass because the owner reinforced the no-separate-browser rule while QA was underway.
- Web Water/Drinks issues:
  - Coffee details flow was inconsistent.
  - A Food Diary row showed title `Water 250 ml` while details said `Coffee 250 ml`.
  - Water page summary sometimes stayed 0 after adding through the Food Diary path, even while Food Diary received the entry.

### iPhone tested

Passed:
- iPhone app rebuilt/launched and stayed logged in to the native test account.
- iPhone used local backend setting: `EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:3000`.
- Food Diary loaded and showed Today with 0 used kcal at the end.
- Date navigation worked: previous day and back to Today.
- kcal/kJ toggle worked and changed visible totals.
- Top Add Food Entry opened the meal picker.
- Breakfast, Lunch, Dinner, Snacks, and Other add buttons were tested and showed the same menu order/wording as web.
- Add ingredient opened from Breakfast.
- Add ingredient showed the expected controls: Packaged/Fast-foods, Single food, Missing item, Add image, Reset, search field, and Add to Breakfast.
- Banana search returned `Bananas, raw` first with 100 g / 89 kcal.
- Banana adjust popup showed reasonable calories/macros and serving units including small, medium, large, and extra large banana.
- Banana was added, moved from Breakfast to Lunch, then deleted. Totals returned to 0.
- Edit-food screen exposed meal buttons, name/calorie/macro fields, Save, Cancel, and Delete.
- Water Intake opened from Food Diary.
- Water controls were visible and tappable: Water, Coffee, Tea, Juice, Hot Chocolate, 250 ml, 330 ml, 500 ml, 1 L, custom amount, ml/L/oz, Add water entry, and history delete.
- 250 ml water saved.
- Custom 100 ml saved.
- Coffee required Sugar-free/Sugar/Honey choice; saving without a choice showed a clear error, then Sugar-free saved.
- Favorites/custom picker opened.
- Favorite/custom item `one banana` opened options: Add to diary, Preview, Change portion, Cancel.
- Preview showed calories, protein, carbs, fat, fibre, and sugar cards with values.
- Change portion showed minus, amount, plus, macro cards, and Add.
- Add to diary worked for `one banana`; it was then deleted and totals returned to 0.
- Photo Library opened from iPhone and showed project test food photos after adding them to the simulator library.
- Barcode Scanner opened. Manual barcode `9300605145057` returned a clear `Not found` fallback: no product found, try searching by product name.
- Camera was reachable from the Photo Library / Camera chooser.
- Final iPhone cleanup confirmed visually: Today showed 0 used kcal and no visible test entries.

iPhone failures or partials:
- iPhone photo scanning failed for both images:
  - Single food image: fried egg photo.
  - Mixed meal image: salmon meal photo.
  - Result for both: `Analysis failed / AI service not configured`.
  - Approx observed return time: about 14-16 seconds including selection.
  - Because the scan failed, food names, meal title, duplicate cleanup, and nutrient-card quality could not be judged.
- iPhone Camera path:
  - Repro: Photo Library / Camera -> Camera.
  - Result: `Analysis failed / Could not analyze this image.`
  - This is partly expected on simulator, but it still means real camera photo analysis was not completed.
- iPhone Recommended failed:
  - Repro: open Recommended, tap `Generate / Regenerate` twice.
  - Result: stayed on `No recommendation generated yet` with no visible error.
- iPhone modal/touch lock issue:
  - Repro: after testing Recommended/Barcode modals, the visible Food Diary page sometimes stopped responding to Add Food Entry/meal plus taps and scrolling.
  - Result: app restart was needed to continue.
- iPhone Water/Drinks issues:
  - Custom 100 ml saved but then showed `Invalid amount / Please enter a valid amount first`.
  - Coffee save left confusing diary state: a 250 ml water row and a separate Coffee 0 kcal row appeared before cleanup.
  - Delete briefly stuck on `Deleting...` before later cleanup.
- iPhone Build a meal was visible in the menu but was not fully opened/tested in this final pass.
- iPhone Import Recipe was visible in the menu but was not fully opened/tested in this final pass.
- iPhone simulator app-tree reading became unreliable after relaunch/build-run, so deeper native testing had to stop rather than pretend it was complete.

### Final cleanup

- Web test food/water entries were cleaned up during the web pass.
- iPhone test food/water entries were cleaned up during the iPhone pass.
- Final visible iPhone Food Diary state: Today, 0 used kcal, 2284 kcal remaining.
- Temporary Maestro QA files were removed.

### Final answer for this QA pass

Food Diary cannot honestly be called 100% tested on 2026-06-19.

It had strong coverage on web and practical iPhone coverage, but not full coverage because:
- Photo scanning failed on iPhone and was not fully retested on web.
- iPhone Recommended failed.
- Web Recommended failed.
- Web Favorites picker failed.
- iPhone Build a meal and Import Recipe were not fully completed.
- Multiple real bugs were found and not fixed because they touch protected or larger Food Diary areas.

## Fix And QA Update - 2026-06-20

### Fixed in this session

- Web Food Diary energy summary now uses the saved food-entry calories, so row totals and top summary match.
- Web Edit Entry no longer triggers the UserDataProvider render warning from favorite persistence.
- Web Favorites picker now has a clear Add button and can add a favorite row to the diary.
- Web Recommended now falls back to a safe local recommendation instead of failing with “AI is temporarily busy.”
- Web recipe import matching now blocks the bad banana/egg/flour/sugar/chips matches found in QA.
- Web Import Recipe now requests a credits refresh after import.
- Web Build a meal returns newly saved entries to Food Diary immediately.
- Web/native photo analysis now has a local no-key fallback for simulator uploads.
- Native Recommended now actually generates when Generate / Regenerate is tapped.
- Native Water/Coffee custom amount no longer shows the invalid amount issue during the tested path.
- Native Water delete now removes the linked Food Diary drink row as well.
- Native Camera simulator path has clearer “no photo taken” guidance.
- Native iOS photo permission wording now mentions Food Diary photos instead of mood journal photos.

### Web retested

Passed:
- Food Diary loaded logged in.
- Date navigation: previous day, next day, Today.
- kcal/kJ toggle and visible totals.
- Top Add Food Entry and meal add buttons for Breakfast, Lunch, Dinner, Snacks, Other.
- Meal menu order and wording.
- Add ingredient, first-result quality, serving controls, edit, delete, favorite save.
- Favorites picker preview/add path.
- Recommended generate and add to diary.
- Build a meal banana calories and save-to-diary return.
- Import Recipe URL for BBC Good Food banana bread; bad matches were corrected.
- Photo Library uploads for fried egg and salmon meal using seeded images.
- Water/Coffee quick add and custom drink paths from Food Diary.
- Move entry, duplicate meal, copy paths where practical.
- Single ingredient search matrix API checks for banana, apple, orange, avocado, egg, chicken breast, cooked rice, oats, potato, walnuts, whole milk, skim milk, almond milk, orange juice, olive oil, coffee.

### iPhone retested

Passed:
- iPhone stayed logged in to the native test account after restart.
- Local backend was used: `EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:3000`.
- Food Diary loaded on iPhone.
- Date navigation, kcal/kJ toggle, summary totals.
- Add Food Entry meal order: Breakfast, Lunch, Dinner, Snacks, Other.
- Native meal menu options were visible/tappable: Photo Library / Camera, Favorites, Recommended, Copy multiple items, Barcode Scanner, Add ingredient, Build a meal, Import Recipe, Log Water Intake.
- Add ingredient banana returned `Bananas, raw`, 100 g, 89 kcal; adding it changed totals by exactly 89 kcal.
- Water Intake quick-add 250 ml worked.
- Custom Coffee 100 ml opened drink details, required a coffee choice, saved Sugar-free, then deleted without getting stuck.
- Linked Water delete server check passed and removed the paired Food Diary drink row.
- Recommended generated a visible meal, enabled Add to diary, saved it, deducted credits, and did not lock the app.
- Photo Library permission prompt appeared; seeded simulator photo analysis completed and added 3 items from photo.
- Food Diary remained responsive after Talk to Helfi and Recommended modal flows.
- Final cleanup confirmed by database: 0 dated Food Diary rows and 0 dated water rows remained for 2026-06-20 and 2026-06-21.

### Remaining limits

- Simulator Camera cannot take a real camera photo. The app path is reachable and now gives clearer guidance when no camera photo is returned, but a real iPhone camera photo still needs a physical-device check.
- iPhone Barcode Scanner was opened in the previous QA pass and returned a clear not-found fallback for a manual barcode; full real-camera barcode scanning still needs a physical-device check.
