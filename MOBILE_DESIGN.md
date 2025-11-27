# Mobile To-Do (food entries)

## Reference images (always check these)
- Swipe right UI example: `public/mobile-design-screenshots/IMG_3281ECC90E09-1-11-27-2025_06_49_PM.jpg`
- 3-dot menu showing “Show Nutrition Summary”: `public/mobile-design-screenshots/IMG_F7C3BC1E4504-1-11-27-2025_06_47_PM.jpg`
- Current layout baseline: `public/mobile-design-screenshots/IMG_1565713203E0-1-11-27-2025_06_48_PM.jpg`
- Food row tap → full detail screen: `public/mobile-design-screenshots/Screenshot-2025-11-27-at-4-30-01-pm-11-27-2025_06_49_PM.jpg`
- Detail screen with Edit/Delete and kcal note: `public/mobile-design-screenshots/IMG_E6DA5BDDF750-1-11-27-2025_06_48_PM.jpg`

## Status
- ✅ Edit button on the food detail screen opens the real edit flow.

## To do
- ☐ Swipe right on a food row to reveal the menu button on a green background (#4DAF50).
- ☐ Swipe left on a food row to delete.
- ☐ When you tap the 3 dots, show the pop-up menu with “Show Nutrition Summary” (replaces “Edit Entry”).
- ☐ Tapping a food row opens the edit screen (food analysis/edit view), with edit/delete visible and “kcal” under the big calorie number.

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

## Process
- Work in `preview-staging`; do not touch `master` until approved.
- Use the linked screenshots as the visual source of truth; keep desktop menus and buttons working.
