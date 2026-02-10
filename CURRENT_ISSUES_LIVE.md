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
