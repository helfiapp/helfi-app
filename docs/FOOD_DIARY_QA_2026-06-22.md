# Food Diary QA - 2026-06-22

Linear ticket: HEL-441

Rules for this pass:
- No deploy unless the owner explicitly asks.
- Use only `/Volumes/U34 Bolt/HELFI APP/helfi-app`.
- Do not open a separate browser, hidden browser, new browser profile, or headless browser for normal web testing.
- Do not expose secrets.
- Clean up all safe test entries before finishing.

Status legend:
- Not started
- Pass
- Fail
- Fixed
- Partial
- Real-device-only

## Master Checklist

| Area | Step | Expected result | Actual result | Status | Cleanup |
| --- | --- | --- | --- | --- | --- |
| Setup | Read project rules and Food Diary guard rails | Rules understood before testing | config.toml, AGENTS.md, PROJECT_STATUS.md, GUARD_RAILS.md, and previous Food Diary QA notes read | Pass | None |
| Setup | Check folder state | Know what was already changed before this pass | Existing uncommitted changes found; not mine; left untouched | Pass | None |
| Setup | Linear coordination | One ticket in Doing/In Progress before work starts | HEL-441 created and moved to In Progress | Pass | None |
| Web | Control already-open browser only | Existing browser can be used; no separate testing browser | Existing Chrome browser was controlled; no separate browser opened | Pass | None |
| Web | Food Diary page load | Page loads logged in and usable | Local `/food` loaded logged in, profile menu visible, empty meals visible | Pass | Removed test rows |
| Web | Empty/loading states | Empty meals and loading state behave normally | Empty state visible before and after cleanup | Pass | Removed test rows |
| Web | Date navigation | Previous, next, and Today work | June 22 -> June 21 -> June 22 worked | Pass | None |
| Web | kcal/kJ toggle | Totals switch clearly | kcal/kJ buttons worked visually | Pass | None |
| Web | Add Food Entry | Meal picker opens | Top button opened Breakfast/Lunch/Dinner/Snacks/Other picker | Pass | None |
| Web | Meal add menus | Breakfast/Lunch/Dinner/Snacks/Other all show correct wording/order | All five meal menus opened and showed expected option order | Pass | None |
| Web | Photo Library | Single food and mixed meal image can be selected and analyzed | Not started | Not started | Remove photo test rows |
| Web | Camera | Camera path opens where browser allows | Not started | Not started | Remove test rows |
| Web | Favorites | Picker opens, preview/add works, safe favorite add/remove checked | Not completed in this pass | Partial | None |
| Web | Recommended | Generate, regenerate, nutrients visible, add to diary | Generate and regenerate worked; nutrients visible; Quick save now returns to Food Diary with the 313 kcal meal visible immediately, without pressing Refresh | Fixed | Recommended row deleted |
| Web | Barcode | Scanner/manual fallback opens and behaves clearly | Not started | Not started | Remove barcode rows |
| Web | Add ingredient matrix | 16 ingredient searches have good first result, units, calories/macros, sizes | API matrix passed first-result quality; banana UI showed size options; coffee `limit=1` shortcut returned empty but normal app search worked | Pass | Banana test rows deleted |
| Web | Build a meal | Realistic fake meal can be built and saved | Not started | Not started | Remove built meal |
| Web | Import Recipe | Realistic fake/URL recipe imports into Build a meal | Not started | Not started | Remove imported recipe |
| Web | Log Water Intake | Water, tea, coffee, bottles, custom amount, units, edit/delete, selected meal | Water 250 ml and Coffee 100 ml sugar-free saved under Breakfast; Food Diary row titles/details matched; coffee details panel now closes after save | Fixed | Water/drink rows deleted |
| Web | Entry actions | Add/edit/delete/move/copy/duplicate/copy today/copy 7 days | Add, edit open/cancel, delete, move, duplicate, copy to today worked; copy for 7 days not completed before cleanup | Partial | Test rows deleted |
| Web | Exercise | Add realistic exercise, confirm totals/display, delete | Walking 2.5 km / 30 min saved, +129 kcal shown, then deleted | Pass | Exercise deleted |
| iPhone simulator | Local backend | Native app uses `EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:3000` | Metro used the required API address; Expo host had to be `localhost`; iPhone simulator build/run succeeded | Pass | None |
| iPhone simulator | Food Diary load/login | App opens logged in to test account | App opened logged in on Food Diary | Pass | None |
| iPhone simulator | Web parity | Same wording/order/layout as web where simulator allows | Food Diary loaded; date navigation, kcal/kJ switch, Add Food Entry, and Breakfast menu order matched web | Partial | None |
| iPhone simulator | Add ingredient matrix | Same 16 foods checked as far as simulator allows | Banana search showed correct first result, 100 g serving, calories, and macros; save failed because the local test server cache broke during the save request | Partial | No native food row was saved |
| iPhone simulator | Photo Library | Single and mixed meal image paths tested | Not started | Not started | Remove photo test rows |
| iPhone simulator | Camera | Simulator limitation recorded clearly | Not started | Not started | None |
| iPhone simulator | Favorites/Recommended/Barcode/Build/Import/Water | Key flows tapped and recorded | Menu items were visible in correct order; individual flows not completed after local test server cache failure | Partial | None |
| Final | Type/check commands | Relevant checks pass | Web type check without stale cache, native type check, custom food serving check, protected-region check, and approved Food Diary page-lock check passed | Pass | None |
| Final | Cleanup confirmation | No QA food/water/exercise rows remain | Web Food Diary returned to empty; Water Intake returned to 0 ml empty state | Pass | None |
| Final | Real iPhone list | Only real-device-only items listed for owner | Real camera food photo and real barcode scanner still require TestFlight iPhone | Real-device-only | None |

## Single Ingredient Matrix

| Food | First result | Units/serving | Calories/macros | Size options | Web | iPhone |
| --- | --- | --- | --- | --- | --- | --- |
| Banana | Bananas, raw | 100 g | 89 kcal, macros present | Small/medium/large/extra large available | Pass | Partial - search passed, save failed |
| Apple | Raw apple | 100 g | 63 kcal, macros present | Small/medium/large/extra large available | Pass | Blocked |
| Orange | Raw orange | 100 g | 47 kcal, macros present | Small/medium/large/extra large available | Pass | Blocked |
| Avocado | Raw avocado | 100 g | 160 kcal, macros present | Small/medium/large/extra large available | Pass | Blocked |
| Egg | Whole raw egg | 100 g | 143 kcal, macros present | Egg sizes available | Pass | Blocked |
| Chicken breast | Raw skinless boneless chicken breast | 100 g | 120 kcal, macros present | No special size options expected | Pass | Blocked |
| Cooked rice | Cooked brown rice | 100 g | 123 kcal, macros present | No special size options expected | Pass | Blocked |
| Oats | Oats | 100 g | 389 kcal, macros present | No special size options expected | Pass | Blocked |
| Potato | Raw potato | 100 g | 77 kcal, macros present | Small/medium/large/extra large available | Pass | Blocked |
| Walnuts | English walnuts | 100 g | 654 kcal, macros present | No special size options expected | Pass | Blocked |
| Whole milk | Milk, whole | 100 ml | 61 kcal, macros present | ml default | Pass | Blocked |
| Skim milk | Milk, skim/nonfat | 100 ml | 34 kcal, macros present | ml default | Pass | Blocked |
| Almond milk | Almond milk, unsweetened | 100 ml | 15 kcal, macros present | ml default | Pass | Blocked |
| Orange juice | Orange juice | 100 ml | 45 kcal, macros present | ml default | Pass | Blocked |
| Olive oil | Olive oil | 1 tbsp (15 ml) | 122 kcal, macros present | tbsp/ml default | Pass | Blocked |
| Coffee | Brewed coffee | 100 ml | 2 kcal, macros present | ml default in normal app search | Pass | Blocked |

## Real iPhone Only

- Real TestFlight iPhone camera food photo.
- Real TestFlight iPhone barcode scanner.

## Bugs / Issues Found

- Fixed: Recommended Quick save did save, but the new meal did not appear on Food Diary until manual Refresh was pressed.
- Recommended Generate another charged credits and returned the same meal again in this run.
- Fixed: Coffee drink save worked, but the drink details panel stayed visible with disabled buttons after saving.
- Native iPhone simulator Add ingredient save failed because the local test server cache broke during Food Diary API requests. No native banana row was saved.

## Checks Run

- `npx tsc --noEmit --pretty false --incremental false` - Pass
- `npm --prefix native run typecheck` - Pass
- `npm run check:custom-food-servings` - Pass
- `node scripts/protect-regions.js` - Pass
- `ALLOW_LOCKED_FILES=app/food/page.tsx,app/food/water/page.tsx npm run check:page-locks` - Pass
- `npm --prefix native run check:page-locks` - Pass
- iPhone simulator build/run - Pass
