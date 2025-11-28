# Mobile To-Do (food entries)

# Handover Notes (read before working)
- Favorites add bug (critical): The Favorites option now shows in the add flow and opens a full-screen list, but tapping a favorite flashes “Saved/Meal added”, closes the sheet, and **does not insert** the meal into the chosen category. Fix: tap should create a diary entry in the active/selected category, show clear “Meal added to {category}” feedback, and return to the diary with the new row visible. Delete swipe is correct—do not change it.
- Duplicate Meal UX gap: Category picker works and duplicates into the chosen category, but there is minimal feedback (just a green flash). Add clearer confirmation (e.g., “Duplicated to {category}”) so users know it’s happening.
- Other open items remain: edge-to-edge mobile row width, 3-dot menu copy, edit-entry scroll-to-top, and mobile spacing per screenshots. Keep desktop behavior intact.
- Relevant screenshots live in `public/mobile-design-screenshots/` (only three remain): DELETE BUTTON ICON.jpg, SPACE ON LEFT AND RIGHT REMOVAL.jpg, FAVORITES MENU.jpg.

## Reference images
- `public/mobile-design-screenshots/` is currently empty; prior reference images were removed after tasks were completed. No active visual references in the folder right now.

## Status
- ✅ Edit button on the food detail screen opens the real edit flow.

## To do
- ✅ Swipe right on a food row to reveal the menu button on a green background (#4DAF50).
- ✅ Swipe left on a food row to delete.
- ☐ When you tap the 3 dots, show the pop-up menu with “Show Nutrition Summary” (replaces “Edit Entry”).
- ✅ Tapping a food row opens the edit screen (food analysis/edit view), with edit/delete visible and “kcal” under the big calorie number.
- ☐ Fix mobile row width: entry cards and swipe backgrounds (green/red) must be truly full width with zero left/right gaps. Current attempts adjusted transforms/borders but gaps remain (see user screenshot 3:31). Avoid repeating partial fixes that only tweak padding/translate; ensure container stretches edge-to-edge on mobile.
- ✅ Fix swipe-to-menu behavior: right swipe should only reveal the green button; menu must toggle open/close on tap of that button (not auto-open on swipe). Previous attempts set swipe offsets and `swipeMenuEntry` on threshold, which still auto-opens. Do not auto-open on swipe threshold.
- ⚠️ Add Favorites entry point in add flow: option appears and list opens, but tapping a favorite flashes “Saved/Meal added”, closes the sheet, and does **not** add to the chosen category. Must actually insert into the active category and confirm.
- ⚠️ Duplicate Meal: category picker works and duplicates into the chosen category, but users get minimal visual feedback (only a green flash). Needs clearer “Duplicated to {category}” feedback while saving.
- ☐ Edit Entry scroll: opening “Edit Entry” should land at the top of the edit page (not mid-page). Current behavior still lands mid-page.
- ✅ Delete button visual: when swiping left, show an icon-only delete button like the Cronometer example (see `DELETE BUTTON ICON.jpg`), not the word “Delete”.
- ☐ Display the food icon from `public/mobile-assets/MOBILE ICONS/FOOD ICON.svg` (or PNG) on the left side of each food panel in the mobile view, matching the placement shown in `public/mobile-design-screenshots/FOOD ICON PLACEMENT IMAGE.jpg` (Cronometer-based mockup with the Helfi icon overlaid); make sure the icon aligns with the panel text and spacing so it looks like the reference.

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
