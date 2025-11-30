# Mobile To-Do (food entries)

# Handover Notes – Barcode Scanner (unresolved)
- The barcode scanner is still not working on iOS Safari even with camera permission set to “Allow”. The preview stays gray/empty; no scans are produced.
- The current scanner modal has multiple footer buttons (Restart camera, Switch camera, Open camera settings, Reload page). They feel crowded and the last button may be hard to reach because the modal content doesn’t scroll far enough on small screens.
- “Switch camera (2/7)” refers to enumerated camera devices; it is confusing and non-standard for a barcode scanner. Consider simplifying to back/front toggle or removing if not reliable.
- User confirmed Safari camera permissions are enabled and reloaded after allowing; still no preview.
- Manual fallback (typing the barcode) works, but the live camera feed is not available.
- Please reassess the html5-qrcode integration on iOS Safari and UX for the footer buttons (stacked, scrollable, or reduced to essential actions).

## Status
- ✅ Edit button on the food detail screen opens the real edit flow.

## To do
- ✅ Swipe right on a food row to reveal the menu button on a green background (#4DAF50).
- ✅ Swipe left on a food row to delete.
- ☐ When you tap the 3 dots, show the pop-up menu with “Show Nutrition Summary” (replaces “Edit Entry”).
- ✅ Tapping a food row opens the edit screen (food analysis/edit view), with edit/delete visible and “kcal” under the big calorie number.
- ✅ Fix mobile row width: entry cards and swipe backgrounds (green/red) must be truly full width with zero left/right gaps. Current attempts adjusted transforms/borders but gaps remain (see user screenshot 3:31). Avoid repeating partial fixes that only tweak padding/translate; ensure container stretches edge-to-edge on mobile.
- ✅ Fix swipe-to-menu behavior: right swipe should only reveal the green button; menu must toggle open/close on tap of that button (not auto-open on swipe). Previous attempts set swipe offsets and `swipeMenuEntry` on threshold, which still auto-opens. Do not auto-open on swipe threshold.
- ✅ Add Favorites entry point in add flow: option appears and list opens, but tapping a favorite flashes “Saved/Meal added”, closes the sheet, and does **not** add to the chosen category. Must actually insert into the active category and confirm.
- ✅ Duplicate Meal: category picker works and duplicates into the chosen category, but users get minimal visual feedback (only a green flash). Needs clearer “Duplicated to {category}” feedback while saving.
- ☐ Edit Entry scroll: opening “Edit Entry” should land at the top of the edit page (not mid-page). Current behavior still lands mid-page.
- ✅ Delete button visual: when swiping left, show an icon-only delete button like the Cronometer example (see `DELETE BUTTON ICON.jpg`), not the word “Delete”.
- ✅ Display the food icon from `public/mobile-assets/MOBILE ICONS/FOOD ICON.svg` (or PNG) on the left side of each food panel in the mobile view, matching the placement shown in `public/mobile-design-screenshots/FOOD ICON PLACEMENT IMAGE.jpg` (Cronometer-based mockup with the Helfi icon overlaid); make sure the icon aligns with the panel text and spacing so it looks like the reference.
- ✅ (critical) Fix bottom “Other/+” add menu scroll on mobile: the dropdown cannot scroll, so Photo Library/Camera, Favorites, and Manual Entry are inaccessible when opened from the bottom category; see `public/mobile-design-screenshots/SCROLLING ISSUE.jpg`.

## Guidance for the next agent
- Only do the to-do items above. Everything else stays as-is.
- Match the Cronometer mobile look shown in the screenshots. Use them as the visual source of truth.
- Keep desktop behaviour untouched (3-dot menus, buttons, overflow, etc.). Do not break desktop.
- Respect guard rails in `GUARD_RAILS.md`. Do not change nutrition logic or data logic.
- Mobile only: swipe right shows the green menu button; swipe left deletes.
- The 3-dot tap opens the pop-up with “Show Nutrition Summary” (not “Edit Entry”).
- Tapping a food row opens the edit screen (food analysis/edit view) with edit/delete and “kcal” under the big calorie number.
- Do not hide or break any existing buttons or menus. Test taps and menus after changes.

## Process
- Work in `preview-staging`; do not touch `master` until approved.
- Use the linked screenshots as the visual source of truth; keep desktop menus and buttons working.
