# Mobile To-Do (food entries)

# Handover Notes (critical issue: mobile logouts)
- On iOS (Safari/installed web app), users are forced to log in again whenever the app is backgrounded and reopened. Desktop stays signed in; mobile does not.
- Attempts made (unsuccessful so far):
  - Extended NextAuth session/JWT maxAge to ~5 years (`authOptions.session.maxAge`, `jwt.maxAge`).
  - Added explicit long-lived, first-party cookies with `sameSite: 'lax'`, secure flags, `__Secure`/`__Host` names, and maxAge ~5 years in `lib/auth.ts` to stop Safari from dropping tokens between app switches.
  - Sign-in flow already calls `/api/auth/signin-direct` with `rememberMe` to issue a long-lived JWT/cookie, plus a follow-up extend after credentials sign-in when “Keep me signed in” is checked.
  - Verified that desktop persists; iOS still loses the session when switching apps.
- What to try next (do not remove existing protections):
  - Confirm cookies are actually set on iOS: both `__Secure-next-auth.session-token` (or fallback) and `next-auth.session-token` should exist with multi-year maxAge. Check if a PWA/standalone mode strips cookies—may need to force localStorage-based token mirror as a fallback for iOS WebView/PWA.
  - Consider `sameSite: 'none'` + `secure: true` if WebView treats the app as cross-site, but only if tests show `lax` is being dropped.
  - Add a heartbeat/refresh on app resume that reissues the session token via `/api/auth/signin-direct` when “keep me signed in” was selected, using a locally stored flag (e.g., localStorage `helfi:rememberMe=true`) while respecting CSRF.
  - If using a PWA, test in Safari vs. standalone; standalone can evict cookies aggressively. A persistent localStorage-backed token with manual header auth may be required for that mode.

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
