# Mobile To-Do (food entries)

# Handover Notes – Next Feature: Favorites Picker Revamp
- Objective: Replace the current “Favorites” picker (opened from the bottom add menu: Photo Library/Camera → Favorites → Manual Entry) with a Cronometer-style selector.
- New screen layout (see provided Cronometer screenshot):
  - Top search bar with clear (X) and filter/order icon, plus a barcode scan icon on the right.
  - Tabs: “All”, “Favorites”, “Custom”. All shows every unique meal the user has ever entered (no duplicates). Favorites shows only meals the user favorited. Custom shows user-defined meals not yet added to history.
  - List shows recents/most recent; sorting toggle like the orange “Most Recent” in the screenshot.
  - Each row shows name, serving/amount, and a source tag (e.g., CRDB/NCCDB/Custom Food). Match the Cronometer visual hierarchy from the screenshot.
  - Tapping a meal inserts it into the currently active category in the food diary and confirms (toast/feedback). Keep category context from the add sheet.
- Data rules:
  - All meals tab: dedupe by canonical meal name/description; include everything the user has saved historically. No duplicate rows.
  - Favorites tab: only favorited meals (reuse existing favorites flag; fix earlier bug where tapping favorite didn’t add to category).
  - Custom tab: user-created meals not in history; allow selection to add to diary.
  - Search should filter within the active tab. Barcode icon should trigger existing scan flow (wire to current scanner entry point).
- UX notes:
  - Keep current bottom add menu entry point and flows intact for desktop; this change is mobile-only.
  - Do not break existing add flows (photo/manual). The Favorites button should open the new selector.
  - Follow Cronometer styling from screenshot: pill tabs, search bar with trailing icons, list spacing/typography similar to reference.

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
