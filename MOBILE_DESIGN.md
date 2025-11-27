# Mobile To-Do (food entries)

# Handover Notes (read before working)
- Remaining gaps: mobile rows/swipe backgrounds still show left/right space; need truly edge-to-edge cards and swipe backgrounds (green/red) on mobile. Prior tweaks to transforms/padding/borders didn’t eliminate the gaps.
- Swipe-right menu: currently auto-opens when swiping past threshold. Requirement: swipe should only reveal the green button; tapping the green button toggles the menu open/closed. Do not auto-open on swipe.
- Delete styling: swipe-left delete must be icon-only (see DELETE BUTTON ICON.jpg), not the word “Delete”.
- Favorites: “Add to Favorites” is only stubbed; no UI entry point. Add “Favorites” option in the add flow (after category selection, alongside Photo/Camera and Manual Entry) to insert saved favorites.
- Duplicate Meal: action is stubbed; needs a category picker with helper text (“Which category would you like to place your duplicated meal?”) listing all categories and duplicating into the chosen category.
- Edit Entry scroll: opening “Edit Entry” should land at the top of the edit page; it currently lands mid-page.
- Desktop: 3-dots menu must open the same menu items as mobile (Favorites, Duplicate Meal, Copy to Today, Edit Entry, Delete); desktop row click should not auto-open edit.
- Relevant screenshots live in `public/mobile-design-screenshots/` (only three remain): DELETE BUTTON ICON.jpg, SPACE ON LEFT AND RIGHT REMOVAL.jpg, FAVORITES MENU.jpg.

## Reference images (always check these)
- Swipe/delete styling reference (delete icon): `public/mobile-design-screenshots/DELETE BUTTON ICON.jpg`
- Current spacing/gap issue reference: `public/mobile-design-screenshots/SPACE ON LEFT AND RIGHT REMOVAL.jpg`
- Favorites option location reference: `public/mobile-design-screenshots/FAVORITES MENU.jpg`

Only the three images above remain relevant in `public/mobile-design-screenshots/`; older images were removed.

## Status
- ✅ Edit button on the food detail screen opens the real edit flow.

## To do
- ☐ Swipe right on a food row to reveal the menu button on a green background (#4DAF50).
- ☐ Swipe left on a food row to delete.
- ☐ When you tap the 3 dots, show the pop-up menu with “Show Nutrition Summary” (replaces “Edit Entry”).
- ☐ Tapping a food row opens the edit screen (food analysis/edit view), with edit/delete visible and “kcal” under the big calorie number.
- ☐ Fix mobile row width: entry cards and swipe backgrounds (green/red) must be truly full width with zero left/right gaps. Current attempts adjusted transforms/borders but gaps remain (see user screenshot 3:31). Avoid repeating partial fixes that only tweak padding/translate; ensure container stretches edge-to-edge on mobile.
- ☐ Fix swipe-to-menu behavior: right swipe should only reveal the green button; menu must toggle open/close on tap of that button (not auto-open on swipe). Previous attempts set swipe offsets and `swipeMenuEntry` on threshold, which still auto-opens. Do not auto-open on swipe threshold.
- ☐ Add Favorites entry point in add flow: when tapping the global “Add Food Entry” button or the meal “+”, after category selection, the option sheet should include “Favorites” (alongside Photo Library/Camera and Manual Entry) to insert a saved favorite. Currently Favorites are only stubbed in-memory; no UI entry point.
- ☐ Duplicate Meal: pressing “Duplicate Meal” should open a category picker with helper text (“Which category would you like to place your duplicated meal?”) listing all categories; on selection, duplicate the meal into that category. Current handler is stubbed; no effect.
- ☐ Edit Entry scroll: opening “Edit Entry” should land at the top of the edit page (not mid-page). Current behavior still lands mid-page.
- ☐ Delete button visual: when swiping left, show an icon-only delete button like the Cronometer example (see `DELETE BUTTON ICON.jpg`), not the word “Delete”.

## Guidance for the next agent
- Only do the to-do items above. Everything else stays as-is.
- Match the Cronometer mobile look shown in the screenshots. Use them as the visual source of truth.
- Keep desktop behaviour untouched (3-dot menus, buttons, overflow, etc.). Do not break desktop.
- Respect guard rails in `GUARD_RAILS.md`. Do not change nutrition logic or data logic.
- Mobile only: swipe right shows the green menu button; swipe left deletes.
- The 3-dot tap opens the pop-up with “Show Nutrition Summary” (not “Edit Entry”).
- Tapping a food row opens the edit screen (food analysis/edit view) with edit/delete and “kcal” under the big calorie number.
- Do not hide or break any existing buttons or menus. Test taps and menus after changes.

## Expected behavior (quick summary)
- Swipe right → show green menu button on the left (see swipe screenshot).
- Swipe left → delete action.
- Tap 3 dots → pop-up menu shows “Show Nutrition Summary” (replaces “Edit Entry”).
- Tap a food row → open the edit screen (see edit screenshot), with edit/delete buttons and “kcal” under the big calorie number.
- Desktop 3-dots menu must open the same actions as the mobile green menu (Favorites, Duplicate Meal with category picker, Copy to Today, Edit Entry, Delete); desktop row should not auto-open edit.

## Process
- Work in `preview-staging`; do not touch `master` until approved.
- Use the linked screenshots as the visual source of truth; keep desktop menus and buttons working.
