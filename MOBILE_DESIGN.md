# Mobile UI To-Do (Cronometer-inspired)

## Completed
- ✅ Food entry detail screen: Edit button opens the real edit flow (no blank screen).

## 1) Overall layout overhaul
- Rework Food Diary mobile layout to mirror Cronometer’s stacked sections and clear top summary (rings + date nav + triple-dot menu).
- Tighten spacing, rounded cards, and sticky bottom nav with a bold central “add” action.
- Ensure consistent typography and iconography that feels intentional and mobile-first.

## 2) Meal/category drop-downs
- Add collapsible sections for Uncategorised, Breakfast, Lunch, Dinner, Snacks (and future custom categories).
- Each section shows kcal/protein/carbs/fat summary on the header row; tapping expands items.
- Inside each section, show a “+” control that opens the same add flow (photo/manual) as the top Add Food Entry.
- Maintain multi-date support; headers should show accurate per-category totals per day.

## 3) Rich actions via triple-dot menu
- Add top-right overflow menu with: Copy Current Day, Copy Previous Day, Paste (when clipboard has meals), Multi-Select, Sort by Time, Clear Serving Sizes, Delete All.
- Ensure menu availability across dates and respects locked/completed days states.
- Confirm copy/paste works across days and preserves timestamps, macros, and items.

## 4) Multi-select mode
- Multi-select entry point from overflow menu; replaces triple-dot with “Done/Cancel” while active.
- Show selectable checkboxes for each meal/item; support Select All within a category.
- Actions while in multi-select: Copy selection, Create Meal from selection, Create Recipe from selection, Add timestamp to selection, Delete selection.
- Persist selection when switching sections; clear selection on exit.

## 5) Add flow parity and shortcuts
- Repurpose floating/central “+” to open a sheet with: Add Food (photo/manual), Add Exercise, Add Biometric, Add Note, Scan Barcode (future).
- Keep existing Add Food Entry behavior identical whether launched from top CTA or section “+”.
- Support quick-add from section header with pre-filled category.

## 6) Navigation & date handling
- Sticky date bar with Prev/Next arrows; avoid layout shifts when menus open.
- Keep calorie/macro rings visible while scrolling, or provide a minimized sticky summary.
- Ensure copy/paste references the currently viewed date and handles time zones.

## 7) Visual polish
- Use soft cards with subtle shadows, consistent divider spacing, and readable contrast.
- Color-code categories/entries subtly (no clutter). Keep icons consistent (plus, copy, dots, checkboxes).
- Smooth expand/collapse animations for sections and action sheets.

## 8) States & errors
- Empty states per category (“No breakfast logged yet – add food”).
- Loading/sync states while copy/paste or multi-select actions run; disable buttons during ops.
- Clear inline error if a copy/paste fails; offer retry.

## 9) Accessibility & responsiveness
- Large touch targets (44px+), keyboard-aware for manual entry, and VoiceOver-friendly labels.
- Works on small phones; graceful on tablet widths without breaking the stacked layout.

## 10) Technical checkpoints
- Reuse existing add/edit flows; no duplication of logic.
- Keep data parity across today/history; ensure category totals and macros recalc correctly.
- Add analytics hooks for: menu open, multi-select enter/exit, copy/paste success/fail, section expand/collapse.
- Guard rails: don’t regress FoodLog persistence; ensure copy/paste writes to history correctly.
