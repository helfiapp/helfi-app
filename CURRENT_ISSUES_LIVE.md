DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-27 01:13 PM AEDT
- What changed: Hard-locked the Food Diary barcode scanner flow with deploy-time guard rails. Added strict protected regions for barcode lookup/action routing and scanner camera/decoder engine, so future edits to those blocks will fail deployment unless an explicit override is used.
- Where to see it (page/link): https://helfi.ai/food
- What to quickly test: Open Food Diary, tap Scan barcode, scan a product, confirm flow works as before. Then note this area is now hard-locked against accidental future changes.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-27 12:27 PM AEDT
- What changed: Fixed all feature-page `View pricing` buttons so they now jump directly to the homepage Pricing section instead of only loading the homepage top.
- Where to see it (page/link): https://helfi.ai/features/nutrition-food (and all /features/* pages)
- What to quickly test: Open any feature page, click View pricing, and confirm it lands at the Pricing section on https://helfi.ai/#pricing.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-27 11:34 AM AEDT
- What changed: Chatbot support names now show first names only (no surnames), and chatbot profile photos were made slightly larger for clearer visibility in the chat launcher and chat header.
- Where to see it (page/link): https://helfi.ai and https://helfi.ai/support
- What to quickly test: Open chatbot on homepage and support page; confirm name format is first name only (for example “Chat with Amelia”, not “Amelia Brooks”) and confirm avatar appears slightly larger than before.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-27 10:22 AM AEDT
- What changed: Updated chatbot support team to 5 rotating agent profiles using your new uploaded photos. Replaced old 3-agent cycle with a full 24-hour roster: each agent now appears for 4 hours 48 minutes.
- Where to see it (page/link): https://helfi.ai (public chatbot) and https://helfi.ai/support (support portal chatbot)
- What to quickly test: Open homepage chat and support portal chat and confirm the same active agent name/photo is shown in both places; check again after a shift window and confirm it changes to the next agent.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-27 09:20 AM AEDT
- What changed: Removed the practitioner delete-account panel from the create-listing flow. It now appears only after a listing already exists, so new practitioner account creation is clean and not mixed with destructive actions.
- Where to see it (page/link): https://helfi.ai/practitioner
- What to quickly test: Open practitioner create flow before saving a listing and confirm delete-account section is not shown. Save a listing and confirm the delete-account section appears only after that.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-27 02:06 AM AEDT
- What changed: Fixed public header `Go to Dashboard` behavior for users who also have practitioner access. Dashboard path is now allowed by practitioner redirect guard, so clicking that button opens user dashboard correctly.
- Where to see it (page/link): https://helfi.ai/list-your-practice/start
- What to quickly test: While signed in, click `Go to Dashboard` in the public header and confirm it opens `https://helfi.ai/dashboard`.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-26 10:54 PM AEDT
- What changed: Fixed practitioner account entry flow so signed-in users are no longer forced to dashboard when opening practitioner sign-up/sign-in links. Practitioner auth intent now routes correctly to the practitioner portal. Also updated native login API so practitioner-mode native login can create/use practitioner account context.
- Where to see it (page/link): https://helfi.ai/list-your-practice/start, https://helfi.ai/auth/signin?context=practitioner&mode=signup&next=/practitioner, https://helfi.ai/practitioner
- What to quickly test: While signed in as a normal user, open List your practice and choose Create practitioner account; confirm you land in practitioner portal flow (not dashboard). In native practitioner mode, sign in and confirm practitioner path is used.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-26 10:15 PM AEDT
- What changed: Added strict hard-lock guard rails for the full Ask AI -> Build Meal flow so unapproved edits now fail build/deploy. Locked Food Diary Ask AI entry, food chat meal parsing and Build this meal handoff, backend structured meal JSON enforcement, Build a Meal recipe import apply + recipe panel, and Share meal strips in Build a Meal/favorites/recommended flows.
- Where to see it (page/link): /chat?context=food, /food/build-meal, Food Diary favorites share popups, /food/recommended
- What to quickly test: Ask AI for a recipe and confirm Build this meal still appears and opens builder; confirm recipe panel and Share meal row still show in Build a Meal; confirm favorites share popup still has branded share icons.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-26 09:14 PM AEDT
- What changed: Upgraded Share meal with official branded quick-share icons/colors (WhatsApp, X, Telegram, Facebook) and fixed shared meal text so recipe method appears reliably even when step data comes in different formats or is partially missing.
- Where to see it (page/link): /food/build-meal and Food Diary favorites meal share popups
- What to quickly test: Open a meal and tap Share meal, confirm branded icon strip appears; share to WhatsApp and confirm message includes meal title, servings, nutrition, ingredients, and a Method section.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-26 19:48 AEDT
- What changed: Share meal now opens an in-app quick-share row (WhatsApp, X, Telegram, Facebook, Email, SMS, Copy, More) and Share meal buttons are now solid global green with white text.
- Where to see it (page/link): /food/build-meal and Food Diary favorites meal share popups
- What to quickly test: Click Share meal and confirm quick-share row appears; test one social channel and Copy; confirm Share meal buttons are solid green with white text.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-26 18:08 AEDT
- What changed: Added Share meal button in Add from favorites popup, favorites preview screen, and Build a meal editor; share now includes ingredients, recipe steps (if available), calories, and macros.
- Where to see it (page/link): Food Diary → Add from favorites flow and /food/build-meal
- What to quickly test: Open a multi-ingredient meal from favorites and confirm Share meal appears in popup + preview; open Build a meal with multi-ingredient meal and confirm Share meal appears under meal name; single-food entries should not show Share meal.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-26 01:32 PM AEDT
- What changed: Practitioner search phrase mapping expanded and corrected. Restored chiropractor matching for sore back phrases and added broader leg/back phrase coverage so suggestions map to physiotherapist, chiropractor, osteopath, spinal/back pain clinic, and sports physiotherapy more reliably.
- Where to see it (page/link): https://helfi.ai/practitioners
- What to quickly test: Search sore back and confirm chiropractor appears in suggested categories; search sore leg and confirm physio-related suggestions appear (physiotherapist/sports physio/osteopath as relevant), then run Search now.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-26 05:12 AM AEDT
- What changed: Added hard-lock protection for Insights weekly report logic so accidental regressions now fail build. Locked countdown timer logic, report status/countdown UI block, report state derivation, insights self-heal logic, status API self-heal logic, and weekly state DB insert cast query via protected region hashes.
- Where to see it (page/link): https://helfi.ai/insights
- What to quickly test: Confirm Insights countdown still shows; then verify guard lock by confirming build would fail if those protected blocks are edited without explicit override env vars.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-26 04:49 AM AEDT
- What changed: Fixed root-cause bug in weekly report state saving. The schedule-state insert was using wrong timestamp typing and silently failing, which prevented countdown state from being stored. Added proper timestamp casting in state insert so weekly report schedule now saves correctly.
- Where to see it (page/link): https://helfi.ai/insights
- What to quickly test: Open Insights and confirm the 7-day countdown/progress section appears under the 7-day report card; confirm it remains after refresh and does not disappear again.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-26 04:37 AM AEDT
- What changed: Restored missing 7-day report countdown recovery on Insights. Added stronger schedule self-heal that checks active subscription directly and recreates weekly report schedule state when missing (including owner test account fallback), so next due date and countdown can appear again.
- Where to see it (page/link): https://helfi.ai/insights
- What to quickly test: Refresh Insights as owner premium account, confirm countdown/progress block is visible under the 7-day report card, confirm `Create report now` still appears, and confirm no mixed “reports off” message appears with `View report`.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-26 03:38 AM AEDT
- What changed: Fixed Insights 7-day health report state consistency. Premium users with missing report schedule state now self-heal to enabled weekly report state, and the report card now uses one consistent active/off state so it no longer shows mixed signals (for example “reports off” with “View report” at the same time). Restored owner test flow visibility for “Create report now” in active report states.
- Where to see it (page/link): https://helfi.ai/insights
- What to quickly test: Sign in as premium owner account, open Insights, confirm no “reports off” warning appears together with “View report”, confirm countdown/progress appears when due date exists, and confirm “Create report now” is visible in active report states.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-25 09:44 PM AEDT
- What changed: Fixed iPhone PWA naming and install guidance flow. Home Screen app name now shows Helfi (not STG). Google sign-in now returns through the sign-in page so Safari install instructions are shown before entering the app, and install prompts are no longer hidden forever after one skip (cooldown-based re-show).
- Where to see it (page/link): https://helfi.ai/auth/signin
- What to quickly test: On iPhone Safari, sign in with Google and confirm the "Add Helfi to your Home Screen" steps modal appears; tap Share -> Add to Home Screen and confirm the default app name is "Helfi" (not STG).

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-25 07:44 PM AEDT
- What changed: Build a Meal now keeps the expandable recipe panel for Ask AI meal imports and reopened saved custom meals. Added Share recipe in that panel (shares recipe title, ingredients, method, calories, and macros; with copy fallback if share is unavailable).
- Where to see it (page/link): https://helfi.ai/food/build-meal (open via Food Diary Ask AI -> Build this meal)
- What to quickly test: Ask AI for a recipe in Food Diary, tap Build this meal, confirm recipe details panel appears at top with ingredients + method; save as custom meal and reopen it to confirm panel still appears; tap Share recipe and confirm share sheet (or copied text fallback) includes calories and macros.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-25 02:44 PM AEDT
- What changed: Removed duplicate written calorie/macro summary text in Food Diary Ask AI chat when the nutrition progress card is shown. The progress card remains, recipe text remains, and Build this meal buttons still appear.
- Where to see it (page/link): https://helfi.ai/chat?context=food
- What to quickly test: Ask for a recipe in Food Diary Ask AI, confirm you see the progress-card nutrition panel, confirm the text blocks like “Current totals / After eating” are no longer duplicated above it, and confirm Build this meal buttons still open Build a Meal.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-25 12:20 PM AEDT
- What changed: Fixed Ask AI -> Build a Meal serving-size carry-through so imported recipes no longer default to “1 serving = full recipe.” Added realistic servings inference in backend, chat fallback parsing, and Build a Meal import fallback. Portion control now scales macros/calories proportionally using a realistic full-recipe serving count.
- Where to see it (page/link): https://helfi.ai/chat?context=food then Build this meal -> https://helfi.ai/food/build-meal
- What to quickly test: Ask AI for a recipe (for example chicken Alfredo), tap Build this meal, confirm portion control shows multiple recipe servings (not 1 for full recipe), and verify 1 serving calories/macros look proportionate instead of full-recipe totals.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-25 01:44 AM AEDT
- What changed: Final reliability hardening for Food Diary Ask AI recipe requests. Direct recipe prompts now return a full recipe on first reply (no forced clarifying question), still include current/target/after macro context, and still attach Build this meal import data. Added stronger macro parsing and a food-diary-style macro progress card so current/after values can display clearly when targets are present.
- Where to see it (page/link): https://helfi.ai/chat?context=food
- What to quickly test: Ask Food Diary AI for a specific recipe (for example “healthy gluten-free chicken Alfredo with penne”), confirm the first assistant reply includes the recipe and shows Build this meal button; tap Build this meal and confirm it opens Build a Meal prefilled; confirm macro progress cards appear under the assistant message when current/target/after values are included.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-25 12:32 AM AEDT
- What changed: Final hardening for Food Diary Ask AI meal builder flow. The Build this meal button now appears for both multi-option replies and single full-recipe replies. Added backend recipe parsing to generate meal import payload even when AI does not use Option 1/2 format, and added UI fallback parsing so recipe replies can still show the button if formatting varies.
- Where to see it (page/link): https://helfi.ai/chat?context=food
- What to quickly test: Ask Food Diary AI for one recipe (for example chicken Alfredo) and confirm Build this meal appears at the end; ask for multiple options and confirm button appears under each option; tap button and confirm it opens Build a Meal with imported recipe fields.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-24 09:58 PM AEDT
- What changed: Fixed Food Diary Ask AI regression where the Build this meal button disappeared again. Restored meal option parsing in chat, restored per-option Build this meal buttons, and added stronger fallback parsing so raw meal JSON markers are hidden and button rendering still works even if AI formatting is slightly messy.
- Where to see it (page/link): https://helfi.ai/chat?context=food
- What to quickly test: Ask Food Diary Ask AI to create a meal (for example gluten-free chicken Alfredo), confirm no raw `[[MEAL_OPTIONS_JSON]]` text appears, confirm meal options show Build this meal buttons, tap one button and confirm it opens Build a Meal with imported recipe details.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-24 09:13 PM AEDT
- What changed: Food Diary Ask AI reliability hotfix for first-send failures and missing chat log items. Added one safe automatic retry for food-chat send failures, added duplicate-protection key for user messages during retry, and forced chat-list refresh after send success/failure so threads appear in the chat sidebar immediately.
- Where to see it (page/link): https://helfi.ai/chat?context=food
- What to quickly test: Send a first message in Food Diary Ask AI (for example gluten-free chicken Alfredo), confirm response returns without red error on first try, open chat sidebar and confirm the chat thread appears immediately, then repeat with a second message and confirm the same thread keeps updating.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-24 07:56 PM AEDT
- What changed: Fixed Food Diary Ask AI meal recommendation rendering on mobile. Raw `[[MEAL_OPTIONS_JSON]]` payload text is now hidden from chat output again, per-option “Build this meal” buttons are restored, and long assistant text now wraps safely instead of overflowing the screen.
- Where to see it (page/link): https://helfi.ai/chat?context=food
- What to quickly test: In Food Diary Ask AI, ask for meal options using ingredients, confirm Option cards show with a Build this meal button under each option, tap Build this meal and confirm it opens Build a Meal with recipe import flow, and confirm no raw JSON block appears in chat.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-24 06:53 PM AEDT
- What changed: Fixed notification inbox timing logic so push notifications are saved but hidden for 24 hours first. They now only appear in Notification Inbox after the 24-hour missed window (instead of immediately). This applies to web and native because both use the same backend inbox rules.
- Where to see it (page/link): https://helfi.ai/notifications/inbox and native app -> Notifications -> Notification inbox
- What to quickly test: Send a new check-in/mood/smart coach push reminder, then open Notification Inbox immediately and confirm it is NOT there yet; complete a reminder task and confirm it does not appear in inbox from that reminder.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-24 04:50 PM AEDT
- What changed: SEO keyword targeting update for calorie and AI food tracking terms. Added direct targeting for: Food calorie tracking, Calorie tracker, AI calorie tracker, AI food tracker, AI food calorie tracker, AI health report, plus each term with “app” at the end. Also added a Search Console keyword tracker command to monitor these exact terms.
- Where to see it (page/link): https://helfi.ai/, https://helfi.ai/features, https://helfi.ai/features/nutrition-food, https://helfi.ai/features/ai-insights
- What to quickly test: Check page source on homepage/features pages for updated title/description/keyword text; run `npm run seo:keywords -- --days 28` with Google credentials to view current rank/impression baseline for all 12 terms.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-24 03:30 PM AEDT
- What changed: Fixed native app Notification Inbox auth check so signed-in native users are accepted correctly (session id, native token decode, and token fallback). This removes the false "Please log in again" error for valid logged-in users.
- Where to see it (page/link): Native app -> Notifications -> Notification inbox, API: https://helfi.ai/api/notifications/inbox
- What to quickly test: Open native app while logged in, go to Notifications -> Notification inbox, confirm inbox loads without the login error.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-24 02:07 PM AEDT
- What changed: Public SEO pass for homepage + practitioner directory. Added stronger keyword metadata, structured data on homepage/practitioner pages, metadata for practitioner profile and A-Z pages, and expanded sitemap coverage for practitioner URLs.
- Where to see it (page/link): https://helfi.ai/, https://helfi.ai/practitioners, https://helfi.ai/practitioners/a-z, https://helfi.ai/list-your-practice
- What to quickly test: View page source and confirm title/description/canonical exist; confirm `/sitemap.xml` includes `/practitioners/a-z` and practitioner profile URLs; run URL Inspection in Search Console for practitioners pages.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-24 11:15 AM AEDT
- What changed: Cleaned up practitioner dashboard code warning (no feature or UI change). This keeps quality checks clean and stable for future updates.
- Where to see it (page/link): https://helfi.ai/practitioner
- What to quickly test: Open practitioner dashboard and confirm page loads and actions still work normally.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-24 03:27 AM AEDT
- What changed: Practitioner free listing flow is now 3 months (not 2). Added a one-time “extra 3 months free” win-back if a practitioner cancels checkout instead of subscribing at trial end. Updated dashboard messaging and reminder email copy to match.
- Where to see it (page/link): https://helfi.ai/list-your-practice, practitioner dashboard at https://helfi.ai/practitioner, and practitioner trial emails
- What to quickly test: Approve a new practitioner listing and confirm trial end date is 3 months ahead; simulate trial-ended dashboard state and click “Claim extra 3 months free” once; confirm second attempt is blocked and success email sends on first use.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-23 01:08 PM AEDT
- What changed: Fixed Water Intake and Food Diary sync for drink favorites/renames (including tea with honey flow). Drink adds from favorites now always repair/check the linked water row, and Water Intake labels/icons stay aligned with renamed diary drink titles.
- Where to see it (page/link): https://helfi.ai/food and https://helfi.ai/food/water
- What to quickly test: Add Tea 500 ml with Honey from Water -> Add from favorites, confirm Food Diary shows the drink and Water Intake Recent Logs also shows it; rename favorite and repeat to confirm both screens stay in sync.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-23 04:16 PM AEDT
- What changed: Fixed OAuth session image handling so existing user profile photo is preserved after Apple/Google login. Native app now gets the saved profile image from account data instead of falling back to initial letter when image exists.
- Where to see it (page/link): Native app dashboard top-right profile avatar, and /api/native-auth/oauth/complete session payload
- What to quickly test: Log out and sign in again with Apple. Confirm top-right avatar shows your real profile photo (if your account already has one saved).

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-23 03:44 PM AEDT
- What changed: Fixed Apple sign-in root cause by changing OAuth verifier cookie settings for production cross-site callback. The required Apple callback cookie (`pkce code verifier`) now uses `SameSite=None; Secure`, so Apple callback can complete instead of failing with OAuth callback error.
- Where to see it (page/link): https://helfi.ai/api/auth/signin/apple (cookie behavior) and native app Apple sign-in flow
- What to quickly test: Log out in native app, tap Continue with Apple, complete Apple auth, then confirm it returns into Helfi logged in (not “Sign in failed”).

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-23 02:32 AM AEDT
- What changed: Added new server-side OAuth error page (`/auth/oauth-error`) for native flows. This now redirects native Apple/Google auth errors straight to native completion endpoint before any web sign-in page can show, preventing users getting stuck on the web login screen.
- Where to see it (page/link): https://helfi.ai/auth/oauth-error?error=OAuthCallback&callbackUrl=https%3A%2F%2Fhelfi.ai%2Fapi%2Fnative-auth%2Foauth%2Fcomplete%3Fnative%3D1
- What to quickly test: In native app, log out then tap Continue with Apple. If auth fails/cancels, confirm app handles return flow and does not remain on helfi.ai web sign-in screen.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-23 02:15 AM AEDT
- What changed: Added a hard native OAuth fallback for Apple/Google. If social auth bounces to web sign-in with an auth error, it now auto-routes back through native completion and returns to the app flow instead of leaving users stuck on the web login page.
- Where to see it (page/link): https://helfi.ai/api/native-auth/oauth/start?provider=apple&mode=signin and https://helfi.ai/auth/signin
- What to quickly test: Log out in native app, tap Continue with Apple, then complete/cancel Apple auth. Confirm it returns to Helfi app flow (success or clear in-app error), not the web sign-in screen.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-23 01:44 AM AEDT
- What changed: Fixed native Apple sign-in fallback. If Apple sign-in fails, it now routes back to the app (with a clear in-app error) instead of dropping the user onto the web login page. Also improved Apple account matching so repeat Apple logins can still resolve to the correct user even when Apple does not resend email.
- Where to see it (page/link): Native app login screen (Continue with Apple), plus https://helfi.ai/api/native-auth/oauth/complete
- What to quickly test: 1) Log out in native app. 2) Tap Continue with Apple and complete Apple sign-in. 3) Confirm it returns to the app dashboard. 4) If Apple auth is canceled/blocked, confirm app shows a clear login error instead of landing on web login page.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-26 03:18 AM AEDT
- What changed: Fixed feedback popup repeat bug. Popup is now permanently tracked at account level, so once it appears once for a user, it will never show again (even if they tap “Maybe later,” and even across devices/browsers).
- Where to see it (page/link): https://helfi.ai/food and other signed-in app pages using the shared layout popup
- What to quickly test: Sign in as a user who already saw the popup, tap “Maybe later,” refresh and navigate across pages, then sign in on another device/browser. Popup should not appear again.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-25 12:21 AM AEDT
- What changed: Increased mobile text size and readability for the feedback popup (title, body, bullet points, and action buttons). Added safe popup scrolling on small screens so larger text remains fully readable.
- Where to see it (page/link): https://helfi.ai/dashboard (feedback popup overlay)
- What to quickly test: Open the feedback popup on phone/mobile view and confirm text is clearly readable without strain and buttons remain easy to tap.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-23 12:03 AM AEDT
- What changed: Added new feedback messaging flow. New users now get a professional welcome email asking for feedback and explaining how to find Help & Support (profile icon top-right -> Help & Support). Existing verified members can be sent the same feedback request via admin send tool. Added web popup that appears once after 3 consecutive active days and links directly to Help & Support.
- Where to see it (page/link): https://helfi.ai/auth/verify (new-user welcome email), https://helfi.ai/admin-panel (send feedback request email button), https://helfi.ai/support (support destination)
- What to quickly test: 1) Trigger feedback email to a test account from Admin Panel and confirm inbox delivery. 2) Sign up a new account and verify welcome email wording includes profile icon -> Help & Support steps. 3) Use app for 3 active days in a row and confirm popup appears once with Open Help & Support button.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-22 01:55 AM AEDT
- What changed: Fixed native billing product ID cleanup so hidden escaped characters/newlines/tabs/quotes are removed before Apple SKU matching. This prevents false `SKU not found` / product mismatch errors during iOS top-up purchases.
- Where to see it (page/link): https://helfi.ai/api/native-billing/catalog and https://helfi.ai/api/native-billing/verify-purchase
- What to quickly test: In native app Subscription & Billing, tap Buy $5 Credits first, then $10/$20. Confirm checkout opens and no `SKU not found` popup appears.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-21 07:35 PM AEDT
- What changed: Native iOS in-app purchase verification now supports Apple transaction API lookup using App Store API credentials, with receipt fallback still supported. Added clearer iOS readiness check so billing shows a specific setup warning if Apple verification credentials are missing.
- Where to see it (page/link): https://helfi.ai/api/native-billing/catalog and native app Subscription & Billing screen
- What to quickly test: In native app on iPhone, open Subscription & Billing and confirm mobile payments setup shows ready; then run a sandbox purchase for $5/$10/$20 credits and confirm credits update + billing history entry appears.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-21 06:27 PM AEDT
- What changed: Restored missing native app email/password login API routes on live (`/api/native-auth/login` and `/api/native-auth/me`) so native login works again.
- Where to see it (page/link): Native app login screen and https://helfi.ai/api/native-auth/login
- What to quickly test: In native app, log in with a valid email/password account. For invalid credentials, endpoint now returns 401 JSON (not 404).

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-21 04:15 PM AEDT
- What changed: Fixed credit checkout failures in billing. Credit packs ($5/$10/$20) now create Stripe checkout sessions reliably, with a safe fallback if Stripe credit price settings are missing/mismatched. Also fixed one-time checkout mode setting that was blocking credit purchases.
- Where to see it (page/link): https://helfi.ai/billing and native app Billing screen
- What to quickly test: In billing, tap Buy $5 Credits / Buy $10 Credits / Buy $20 Credits and confirm checkout opens successfully.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-21 02:49 PM AEDT
- What changed: Added strict Food Diary guard rails and restore playbook for the desktop summary continuity fix, plus in-code severe-lock notes in the protected summary rendering area.
- Where to see it (page/link): /Volumes/U34 Bolt/HELFI APP/helfi-app-worktrees/hel-257-food-diary-root-cause/GUARD_RAILS.md and https://helfi.ai/food
- What to quickly test: Confirm Food Diary summary still stays visible on desktop during date switches; review new “Desktop Energy/Macro Summary Continuity (Severe Lock)” section in guard rails.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-21 02:33 PM AEDT
- What changed: Desktop Food Diary summary now keeps last visible energy/macro panel while date data refreshes in background, so the summary card no longer goes blank between date switches.
- Where to see it (page/link): https://helfi.ai/food
- What to quickly test: On desktop, tap Next/Previous across copied days and confirm the energy/macro panel stays visible the whole time (no blank gap, no loading text).

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-21 01:53 PM AEDT
- What changed: Removed visible desktop loading labels in Food Diary energy summary and meal row preview while keeping background data checks. Users no longer see “Loading this day’s summary...” or “Loading...” flashes.
- Where to see it (page/link): https://helfi.ai/food
- What to quickly test: On desktop, open Food Diary and switch dates with Previous/Next and browser refresh. Confirm no loading text appears in summary/meals while data updates.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-21 01:31 PM AEDT
- What changed: Food Diary today-state reliability hardening. Today now keeps last known local snapshot visible even after a temporary server-empty response, and today fetch now does a delayed recheck before accepting empty so copied breakfasts are less likely to flash/stick as zero/loading.
- Where to see it (page/link): https://helfi.ai/food?debug=1
- What to quickly test: Browser refresh on Food Diary, then tap Next/Next/Previous/Previous back to Today. Confirm summary and meals stay visible without getting stuck on “Loading this day’s summary...” and without needing the Refresh button.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-21 12:53 AEDT
- What changed: Fixed Food Diary root cause where failed today fetches could block automatic retry and hide saved summary/meal data. Today now keeps local snapshot visible unless a real successful empty response is confirmed, and failed auto-fetch now unlocks and retries automatically.
- Where to see it (page/link): https://helfi.ai/food
- What to quickly test: Open Food Diary with existing breakfast, refresh browser repeatedly, and confirm summary/meals stay visible (no stuck loading). If network hiccups occur, confirm entries recover automatically without pressing Food Diary Refresh.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-21 11:24 AEDT
- What changed: Follow-up hardening for Food Diary zero-state bug. Today view now falls back to saved same-day snapshot instantly, avoids writing empty snapshot during early load, and refresh now protects existing visible entries from transient empty server reads by retrying once and keeping current entries if still empty.
- Where to see it (page/link): https://helfi.ai/food
- What to quickly test: Open Food Diary where breakfast already exists, press Refresh, and confirm breakfast + energy summary stay visible (no fake zero/no meals). Also browser refresh and return from another page should keep summary stable instead of blank/zero flash.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-21 11:10 AEDT
- What changed: Fixed Food Diary first-load consistency for copied days and return-to-page loads. The page now uses the selected URL date immediately, keeps selected-day cached data ready during loading, avoids false empty/zero state while day data is still resolving, and retries once before accepting an empty non-today result.
- Where to see it (page/link): https://helfi.ai/food?date=2026-02-20&category=snacks
- What to quickly test: Open copied days one by one (including 2026-02-20), confirm meals + energy summary show on first load without pressing Refresh, then leave Food Diary and come back and confirm summary/entries stay stable without fake zero flashes.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-21 04:39 AEDT
- What changed: In barcode label scan flow, tapping the Food name field now clears prefilled text instantly so users can type from a clean blank field without backspacing one letter at a time.
- Where to see it (page/link): https://helfi.ai/food (barcode scan -> no match -> nutrition label flow)
- What to quickly test: Open nutrition label flow, tap once in Food name, confirm existing text disappears immediately, then type a custom name and save.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-21 02:23 AEDT
- What changed: Fixed Food Diary date-switch reliability issue that could show false zero energy summary before data loaded. Prevented non-today snapshots from being overwritten with empty data during day switches, added stronger same-day fallback from in-memory cache, and stopped rendering summary rings while a day is still loading.
- Where to see it (page/link): https://helfi.ai/food
- What to quickly test: Use copy-for-7-days, switch across those dates in Food Diary, and confirm existing entries/energy summary appear correctly without manual browser refresh and without temporary fake zero states.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-21 02:09 AEDT
- What changed: Fixed barcode label scan Food name editing so users can fully clear the field and type any custom name without “Food item” being forced back in while editing. Also blocked generic “Food item” auto-fill on new analysis previews.
- Where to see it (page/link): https://helfi.ai/food (barcode scan -> no match -> nutrition label flow)
- What to quickly test: Scan an item not found in barcode database, continue to nutrition label flow, tap Food name, backspace to empty, confirm it stays empty, then type a custom title and save.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-21 01:56 AEDT
- What changed: Fixed Food Diary/Water sync reliability. Water page now updates the shared water snapshot cache immediately after load/add/edit/delete, and Food Diary now always runs a background water refresh on date load (while still showing cached rows instantly) so new water entries are no longer hidden by stale cache.
- Where to see it (page/link): https://helfi.ai/food and https://helfi.ai/food/water
- What to quickly test: On Food Diary choose a date/category, open Water page, add 1 L water, go back to Food Diary, and confirm the water row appears without manual browser refresh. Then edit/delete a water row and confirm Food Diary reflects it immediately.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-21 01:42 AEDT
- What changed: Follow-up barcode scanner reliability fix for square product codes. Scanner now runs dedicated live Data Matrix and QR readers in parallel with the normal EAN/UPC reader, adds browser supported-format fallback handling, and improves scanner stop/reset cleanup to avoid missed scans.
- Where to see it (page/link): https://helfi.ai/food (Food Diary -> Scan barcode)
- What to quickly test: Scan the same square code from the sausage package again and confirm scanner now picks it up; then scan a normal supermarket barcode and confirm normal one-scan flow still works.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-21 01:32 AEDT
- What changed: Follow-up fix for Food Diary energy summary reload flicker. The page now treats cached history/today data as ready immediately on return/refresh so the summary does not re-run a visible cold reload when data already exists.
- Where to see it (page/link): https://helfi.ai/food
- What to quickly test: Open Food Diary on a non-today date with entries, switch to another page, return to Food Diary, then refresh and confirm the energy summary stays stable without the full reload behavior.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-21 01:30 AEDT
- What changed: Premium credit renewal now follows the exact subscription start timestamp each month (hour/minute/second) instead of day-only midnight math. Credits meter reset label now always shows AM/PM with seconds. Admin user page next renewal now shows full date/time with AM/PM.
- Where to see it (page/link): https://helfi.ai/food, https://helfi.ai/admin-panel/user/[userId]
- What to quickly test: Confirm sidebar shows reset like \"Mar 21, 2026, 1:09:xx AM\" (with AM/PM). Confirm admin Next Renewal shows full timestamp. Verify renewal time matches the exact time subscription was started.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-21 01:17 AEDT
- What changed: Food Diary energy summary now uses saved local snapshot data immediately on refresh/screen return, so it no longer repeatedly shows the loading state when cached data already exists.
- Where to see it (page/link): https://helfi.ai/food
- What to quickly test: Open Food Diary with existing entries, refresh the page (or switch away and back on mobile), and confirm the summary stays visible immediately instead of showing repeated loading.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-21 01:13 AEDT
- What changed: Food Diary entries inside each meal section now sort by entry time from earliest to latest, including after editing an entry time.
- Where to see it (page/link): https://helfi.ai/food
- What to quickly test: In one meal section, set one item to 11:30 AM and others to 1:30 PM, then confirm 11:30 AM appears above 1:30 PM entries.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-21 00:49 AEDT
- What changed: Food Diary barcode scanner now supports both normal supermarket barcodes and square codes (Data Matrix/QR). Added scan normalization so square-code content can extract a valid product barcode when present before lookup, while keeping existing normal barcode behavior and first-scan reliability flow.
- Where to see it (page/link): https://helfi.ai/food (Food Diary -> Scan barcode)
- What to quickly test: Scan a normal barcode and confirm it still works; then scan a square Data Matrix/QR code and confirm scanner detects it and attempts lookup. If a product match exists, action popup appears; if not, standard fallback prompt appears.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-20 21:02 AEDT
- What changed: Fixed Nutrition Insights refresh to target the exact issue page the user is on, fixed issue slug selection logic so real goals are not accidentally excluded, and improved failure messaging so users see a clear no-charge message instead of a generic failure.
- Where to see it (page/link): https://helfi.ai/insights/issues/[issue]/nutrition
- What to quickly test: Open an issue Nutrition tab (example Erection Quality), click Generate Nutrition Insights, confirm the "Generated" timestamp updates to current time for that issue, and confirm errors show a clear message (not generic) if refresh cannot start.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-20 20:54 AEDT
- What changed: Replaced iPhone/PWA app icon assets with the new designer file “OFFICIAL APP ICON” (leaf icon on white background) and regenerated all live icon sizes used by home screen install.
- Where to see it (page/link): https://helfi.ai (installed to iPhone home screen)
- What to quickly test: Remove current Helfi home-screen shortcut, add to Home Screen again from Safari, and confirm the new official icon appears.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-20 20:18 AEDT
- What changed: Fixed Insights nutrition generation reliability and quality. Nutrition generation now uses a true 7-day food window, richer food context (meal + calories/protein/carbs/fat), improved real generation depth, no-charge quality gate for weak output, hard charge cap per nutrition run, timeout no-charge fallback, and removed all user-facing internal AI cost text from nutrition and weekly report views.
- Where to see it (page/link): https://helfi.ai/insights/issues/[issue]/nutrition, https://helfi.ai/insights/weekly-report, https://helfi.ai/insights/weekly-report/print?id=[reportId]
- What to quickly test: Generate Nutrition Insights and confirm output reflects last 7 days of logged foods; confirm weak/insufficient data gives a clear no-charge message; confirm no AI cost text appears in nutrition or weekly report/print pages.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-20 16:25 AEDT
- What changed: Recipe URL import now charges 10 credits, recipe photo import now charges 15 credits, and AI recommended meal now charges 10 credits (was 6). Added clear cost labels in Food Diary menu, Import Recipe screen, and Billing page AI feature cost list.
- Where to see it (page/link): /food, /food/import-recipe, /food/recommended, /billing
- What to quickly test: Confirm Import Recipe shows URL 10/photo 15; confirm Recommended meal shows 10; confirm Billing AI feature costs includes AI recommended meal 10, recipe URL 10, recipe photo 15.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-20 14:55 AEDT
- What changed: Added a third-pass fast-scroll fix for the shared Food Diary time picker to stop “slingshot” rollback when scrolling quickly. Wheel handling now tracks the active index immediately and temporarily locks momentum drift so fast scroll cannot bounce back several numbers.
- Where to see it (page/link): https://helfi.ai/food and https://helfi.ai/food/water
- What to quickly test: Open any time picker, scroll quickly with mouse wheel to a target value (example 25/27), and confirm it stays on that selected number instead of snapping back.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-20 14:23 AEDT
- What changed: Added a second-pass stability fix to the shared Food Diary time picker wheel logic to filter tiny reverse momentum scroll signals that were causing one-step rollback (for example selecting 27 and snapping back to 26).
- Where to see it (page/link): https://helfi.ai/food and https://helfi.ai/food/water
- What to quickly test: Open any time picker in Food Diary or Water edit, use mouse wheel to move minute values, and confirm the value stays where selected without bouncing back by one.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-20 13:53 AEDT
- What changed: Fixed unstable mouse-wheel behavior in the shared Food Diary time picker so values no longer bounce back to the previous number while scrolling. Applied in all Food Diary picker usages that share this component (food edit, build-meal edit time, and water time edit).
- Where to see it (page/link): https://helfi.ai/food and https://helfi.ai/food/water
- What to quickly test: Open any time picker in Food Diary or Water edit modal, use mouse wheel to change hour/minute, and confirm the selected value stays on the chosen number without jumping back.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-20 11:29 AEDT
- What changed: Water entry time editing now uses the same roller time picker design as food entries, including desktop and mobile, in both Food Diary water edit and Water Intake edit-time modals.
- Where to see it (page/link): https://helfi.ai/food and https://helfi.ai/food/water
- What to quickly test: Open a water/drink entry edit modal in both pages, confirm the same roller picker appears as food, change time, save, and confirm updated time shows in the list.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-20 11:13 AEDT
- What changed: Unified the Health Setup completion rule into one shared web rule and wired Dashboard status, Insights lock/unlock checks, 5-minute reminder status API, and PWA entry gating to use the same logic.
- Where to see it (page/link): https://helfi.ai/dashboard, https://helfi.ai/insights, https://helfi.ai/onboarding?step=1
- What to quickly test: 1) With incomplete setup, Insights stays locked and the dashboard shows incomplete setup state. 2) Complete gender/weight/height + at least one real health goal and confirm Insights unlocks and dashboard marks setup complete. 3) Leave setup incomplete for 5 minutes and confirm reminder behavior still follows the same completion status.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-20 02:42 AEDT
- What changed: Added editable drink log time support so users can change timestamp after logging water/tea/hot chocolate. Also ensured meal entry menu supports Move entry and Copy for 7 days in the Food Diary flow.
- Where to see it (page/link): https://helfi.ai/food and https://helfi.ai/food/water
- What to quickly test: In Food Diary and Water Intake, edit a drink entry and change its time; save and confirm the new time shows. In Food Diary entry menu, confirm Move entry and Copy for 7 days are available and working.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-20 01:33 AEDT
- What changed: Added two new Food Diary entry menu actions. "Move entry" now lets users move an item to another meal section (shows only the other sections, not the current one). "Copy for 7 days" now copies that entry forward for the next 7 days so daily repeat meals can be logged faster.
- Where to see it (page/link): https://helfi.ai/food (Food Diary entry 3-dot menu)
- What to quickly test: Open any Food Diary entry menu and confirm "Move entry" + "Copy for 7 days" are shown; move a breakfast item to lunch and confirm it moves; use "Copy for 7 days" and check upcoming days for the copied entry.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-20 01:18 AEDT
- What changed: Completed a full web chat reliability pass and fixed silent no-reply behavior across AI chat sections. Symptom Chat, Medical Image Chat, Insights Section Chat, and Talk to Helfi now show clear errors when requests fail, recover the saved assistant reply if a stream drops, and avoid blank assistant outputs from the server.
- Where to see it (page/link): /chat, /chat?context=food, /symptoms, /medical-images, /insights/issues/[issue]
- What to quickly test: In each chat, send a first message and confirm you always get either a visible AI reply or a clear error message (no silent “nothing happened” state).

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-20 01:03 AEDT
- What changed: Unified AI chat bubble styling in web chat sections (Talk to Helfi including Food Diary Ask AI context, Symptom Chat, Medical Image Chat, Insights Section Chat). User messages now use Helfi green with white text; AI messages use light grey with dark text.
- Where to see it (page/link): /chat?context=food, /chat, /symptoms, /medical-images, /insights/issues/[issue]
- What to quickly test: Send 1 message in each chat and confirm user bubble is green/white and AI bubble is light grey/dark.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-20 00:36 AEDT
- What changed: Fixed Insights weekly report action row stability and manual report create behavior. Restored top action buttons to approved alignment (no forced tall buttons), enabled manual report run for approved manual user when weekly reports were off, improved manual error messages, and added guard-rail protection for this action row so it does not regress.
- Where to see it (page/link): https://helfi.ai/insights and https://helfi.ai/insights/weekly-report
- What to quickly test: Open Insights and confirm the top action row buttons look normal and aligned; click Create report now and confirm it starts instead of showing the generic failure message.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-20 00:15 AEDT
- What changed: Rolled back Helfi iPhone/PWA icon assets to the original transparent version as requested (temporary fallback until final designer icon is ready).
- Where to see it (page/link): https://helfi.ai (installed on iPhone home screen)
- What to quickly test: Delete current Helfi home-screen icon, add Helfi to Home Screen again from Safari, and confirm the icon matches the previous transparent style.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-19 21:32 AEDT
- What changed: Refined Helfi iPhone/PWA icon sizing so the leaf symbol appears larger and clearer against the white background. Rebuilt apple-touch icon and PWA icon sizes from a re-centered master icon.
- Where to see it (page/link): https://helfi.ai (installed on iPhone home screen)
- What to quickly test: Delete existing Helfi home screen icon, add Helfi to Home Screen again from Safari, and confirm the leaf appears larger/sharper with better visual balance.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-19 21:14 AEDT
- What changed: Replaced Helfi PWA/iPhone app icon image files with the new white-background icon so iOS home screen no longer renders a black background after update. Updated apple-touch-icon plus 192/512/1024 PWA icon assets.
- Where to see it (page/link): https://helfi.ai (installed on iPhone home screen)
- What to quickly test: Remove existing Helfi home screen shortcut, add Helfi to Home Screen again from Safari, and confirm icon now shows white background.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-19 20:29 AEDT
- What changed: Hardened barcode first-scan reliability in Food Diary. Removed the extra double-read gate, limited scanner detection to retail food barcode formats (EAN/UPC), added stronger automatic retry for temporary lookup failures, and tightened barcode sanity checks to reduce false first reads.
- Where to see it (page/link): https://helfi.ai/food (Food Diary -> Scan barcode)
- What to quickly test: Scan the same packaged item once several times in a row and confirm it opens the action popup on first scan without showing the red “Could not find a match” error unless there is a real lookup failure.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-19 18:48 AEDT
- What changed: Admin user page now correctly shows admin-granted premium access (instead of always showing Paid), and refund action is hidden when there is no Stripe-paid subscription. Manual admin grants now clear Stripe subscription linkage so status stays correct.
- Where to see it (page/link): https://helfi.ai/admin-panel (open a user details page in User Management)
- What to quickly test: Grant premium from admin tools, open that user’s detail page, confirm badge says Admin granted and refunds card shows no refund available; for a Stripe-paid premium user, confirm Paid badge and Refund latest payment button still appear.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-19 18:06 AEDT
- What changed: Health setup weight input on page 2 now allows decimal typing on mobile keyboards (for example 58.3 or 78.5) by enabling decimal keypad behavior.
- Where to see it (page/link): https://helfi.ai/onboarding
- What to quickly test: Open Health Setup page 2 on mobile, tap the weight field, confirm decimal point is available on keyboard, enter a value like 78.5, and continue without input issues.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-19 17:36 AEDT
- What changed: Removed the remaining dummy section images on AI Insights for now. Step 01 still shows the two supplied real photos, and the other sections no longer show placeholder images.
- Where to see it (page/link): https://helfi.ai/features/ai-insights
- What to quickly test: Open AI Insights and scroll through all steps. Confirm only Step 01 has images (gym + fireplace), and Steps 02–04 have no dummy images.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-19 17:17 AEDT
- What changed: Replaced the two duplicate dummy images in AI insights Step 01 with the supplied real photos (gym scene + woman in front of fireplace).
- Where to see it (page/link): https://helfi.ai/features/ai-insights
- What to quickly test: Open Step 01 on AI insights and confirm the two side-by-side images are now different: left is gym photo, right is fireplace photo.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-19 16:15 AEDT
- What changed: Fixed barcode product naming so preview no longer shows accidental reversed name order (for example “Blue smooth”). The scanner now keeps barcode rename matching barcode-specific only, and when a source looks reversed it cross-checks OpenFoodFacts name order and uses it only when it is the same words in the correct order.
- Where to see it (page/link): https://helfi.ai/food (Food Diary -> Scan barcode -> Preview)
- What to quickly test: Scan the same cheese barcode again and confirm the preview title shows the correct word order (“Smooth Blue”), then add to diary and confirm the name stays correct.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-19 13:18 AEDT
- What changed: Fixed barcode scan reliability and barcode add behavior in Food Diary. Barcode now accepts valid UPC-E scans, lookup also expands UPC-E to UPC-A candidates, successful scans open the action popup first (Add to diary / Preview / Change portion / Cancel), and barcode adds now use the same diary insert flow as other adds so new entries appear immediately without page refresh.
- Where to see it (page/link): https://helfi.ai/food (Food Diary -> Scan barcode from add menu, and other Food Diary barcode scan entry points)
- What to quickly test: Scan a UPC-E/UPC-A packaged item once and confirm it resolves on first scan; confirm action popup appears before adding; tap Add to diary and confirm entry appears immediately in the diary list without refreshing.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-20 01:46 AEDT
- What changed: Added proper desktop controls to the wheel time picker. Each column now has visible up/down buttons on desktop, supports mouse wheel stepping, and supports keyboard arrow stepping, while keeping the mobile rolling behavior.
- Where to see it (page/link): https://helfi.ai/food (Food Diary edit and Add from favorites -> Change portion)
- What to quickly test: On desktop open the picker, use up/down buttons on Hour/Minute/AM-PM, use mouse wheel over a column, and confirm the selected value updates and saves correctly.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-19 15:11 AEDT
- What changed: Fixed time picker selection styling so values are no longer hidden by pale green overlays. Selected hour/minute and selected AM/PM now use the main app button green with white text for clear visibility.
- Where to see it (page/link): https://helfi.ai/food (Food Diary edit and Add from favorites -> Change portion)
- What to quickly test: Open the time picker, scroll to pick values, and confirm the selected row is clearly readable in green with white text for hour, minute, and AM/PM.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-19 13:06 AEDT
- What changed: Replaced the food edit time picker with a true touch wheel roller (birthday-style scroll + snap). Hour and minute now roll naturally on mobile; AM/PM is clean and simple; picker remains compact and still saves the chosen time correctly.
- Where to see it (page/link): https://helfi.ai/food (Food Diary edit and Add from favorites -> Change portion)
- What to quickly test: Open time entry edit, swipe hour/minute wheels up/down on mobile, choose AM/PM, tap Done, save, and confirm the diary entry appears under the selected time.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-19 12:41 AEDT
- What changed: Fixed the compact time picker so it no longer gets stuck at the page bottom. It now opens upward when space is tight, keeps extra bottom space when opening downward, and AM/PM now shows only one AM and one PM (no duplicates).
- Where to see it (page/link): https://helfi.ai/food (Build a meal / Food Diary edit time entry, including Add from favorites -> Change portion)
- What to quickly test: Open time picker near the bottom of the page and confirm it stays fully visible; confirm AM/PM shows only one AM and one PM; save and verify the chosen time is applied.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-19 11:32 AEDT
- What changed: Replaced the large intrusive time picker block with a compact modern time field that opens a small popover roller only when tapped. This applies to both Food Diary edit and Add from favorites -> Change portion edit flow.
- Where to see it (page/link): https://helfi.ai/food (Food Diary edit + Add from favorites -> pick item -> Change portion)
- What to quickly test: Open either edit flow, confirm only a clean time field is shown at first, tap it to open a small popup picker, choose a time, save, and confirm the entry appears under that chosen time.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-19 11:13 AEDT
- What changed: Replaced the old dropdown/browser-style time input with a proper app-style roller time picker for food diary time editing. This now appears in both edit paths: Food Diary edit and Add from favorites -> Change portion.
- Where to see it (page/link): https://helfi.ai/food (Food Diary edit + Add from favorites -> pick item -> Change portion)
- What to quickly test: Open either edit flow, confirm the new roller time picker appears, change the time, tap Add/Update, and confirm the entry saves under that chosen time.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-19 02:55 AEDT
- What changed: Added “Change time entry” to the Add from favorites -> Change portion Build a meal flow (`fromFavoriteAdjust=1`) so you can set a custom time there too, and save now uses that selected time.
- Where to see it (page/link): https://helfi.ai/food (Food Diary -> Add from favorites -> pick item -> Change portion)
- What to quickly test: Open Change portion from favorites, confirm “Change time entry” appears, set a time, tap Add, and confirm the new diary entry appears with that chosen time.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-19 00:56 AEDT
- What changed: Added “Change time entry” to Build a meal when editing an existing diary meal entry, and wired save/autosave so the edited time is saved as the entry timestamp.
- Where to see it (page/link): https://helfi.ai/food (Food Diary -> Edit Entry on a Build-a-meal/combined meal that opens Build a meal editor)
- What to quickly test: Open a saved Build-a-meal entry from Food Diary, change “Change time entry,” tap Update, then confirm the meal shows under the updated time in the diary.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-19 00:51 AEDT
- What changed: Locked food search behavior across all food diary search modules (Add Ingredient page, Food Diary Add Ingredient modal, Build a Meal, and packaged search API ranking/filtering). Added strict deploy-time protection so these search-core blocks cannot be changed unless an explicit override is set.
- Where to see it (page/link): https://helfi.ai/food/add-ingredient, https://helfi.ai/food/build-meal, and Food Diary -> Add Ingredient modal
- What to quickly test: In all three search flows, type “McDonald’s chee” with Packaged/Fast-foods selected. Confirm cheeseburger-style matches appear immediately and stay prioritized. Then confirm deploy guard still passes (no search core edits allowed without override env vars).

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-19 00:26 AEDT
- What changed: Updated packaged predictive search to follow word-by-word intent. Once you start typing the next word, that current word is now treated as the main match immediately (not just the brand). Multi-word matching now requires the active word to match, and quick lookup keeps brand + current word together from the first typed letter.
- Where to see it (page/link): https://helfi.ai/food/add-ingredient and https://helfi.ai/food/build-meal
- What to quickly test: Type “McDonald’s che”, “McDonald’s chee”, and “McDonald’s cheese” with Packaged/Fast-foods selected. Confirm cheese-related items appear immediately and non-matching brand-only items are pushed out.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-18 23:31 AEDT
- What changed: Fixed packaged/fast-food ranking so typing a partial like “McDonald’s cheese” now returns cheeseburger items properly (instead of only random cheese items). Search now also safely tops up from global custom fast-food rows when country-specific rows are too narrow, and quick typing keeps both brand + food token intent for better matches.
- Where to see it (page/link): https://helfi.ai/food/add-ingredient and https://helfi.ai/food/build-meal
- What to quickly test: With Packaged/Fast-foods selected, type “McDonald’s chee” and “McDonald’s cheese”. Confirm cheeseburger options appear near the top and the list is fuller (not stuck on only a few cheese snack entries).

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-18 23:13 AEDT
- What changed: Made packaged/fast-food search feel faster while typing. The app now starts a fast local lookup immediately on each keystroke, shows matching results sooner, and still runs the full search in the background so complete results still load.
- Where to see it (page/link): https://helfi.ai/food/add-ingredient and https://helfi.ai/food/build-meal
- What to quickly test: Type partial text like “mc”, “mcd”, “mcdonald” with Packaged/Fast-foods selected. Confirm suggestions start appearing quickly as you type, then fuller results keep loading.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-18 21:51 AEDT
- What changed: Fixed packaged/fast-food ingredient search reliability. Search now keeps Helfi database results first, uses safer country fallback so valid fast-food items (like McDonald’s cheeseburger) are not hidden when country-specific rows are missing, then fills with OpenFoodFacts and FatSecret while keeping macro-required filtering.
- Where to see it (page/link): https://helfi.ai/food/add-ingredient
- What to quickly test: In Add ingredient with Packaged/Fast-foods selected, search “McDonald’s cheeseburger” and “McDonald’s cheese burger”; confirm burger items appear (not only brand suggestion). Also type partials like “mcdo” and confirm instant results appear while typing.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-18 12:27 AEDT
- What changed: Fixed Health Coach history delete for native token-based sessions and web sessions. Also updated Health Coach tip title display so old saved items that started with “Smart Health Coach:” now show as “Health Coach:” in the app UI.
- Where to see it (page/link): https://helfi.ai/health-tips, https://helfi.ai/health-tips/history
- What to quickly test: In Health Coach Tip History, select a few items and delete them; confirm no error popup. Confirm list rows show “Health Coach:” instead of “Smart Health Coach:” for older entries.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-18 11:33 AEDT
- What changed: Renamed Smart Health Coach to Health Coach across key user screens (sidebar/menu, Health Coach pages, notifications/settings text). Added Select + Delete for past Health Coach history on web. Improved Health Coach tip quality rules so alerts avoid repeated hydration nagging and prioritize food swaps tied to user goals.
- Where to see it (page/link): https://helfi.ai/health-tips, https://helfi.ai/health-tips/history, https://helfi.ai/notifications/ai-insights
- What to quickly test: Open Health Coach and confirm new title text. Go to Tip History, tap Select, choose multiple items, delete selected, and confirm they disappear. Trigger/generate new tips and confirm variety (fewer repeated hydration-only alerts, more food/goal-linked actions).

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-18 00:36 AEDT
- What changed: Health Journal page-only voice note fix is live. Added Audio settings on the page so users can choose microphone input and playback output, improved recording capture handling, and added a silent-recording warning to prevent saving unusable voice clips.
- Where to see it (page/link): https://helfi.ai/health-journal
- What to quickly test: In Health Journal, choose input/output in Audio settings, record a 3-5 second voice note, play it back and confirm sound is audible, then submit and confirm note/history still save normally.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-17 23:58 AEDT
- What changed: Web Health Journal now has Add photo and Record voice note in New entry. Each upload is analyzed immediately and the extracted notes are merged into the saved journal text. Raw media is not stored long-term on the server. If media analysis is temporarily unavailable, safe fallback summary text is still added so saving can continue.
- Where to see it (page/link): https://helfi.ai/health-journal
- What to quickly test: 1) Add photo and confirm it shows analyzed. 2) Record voice note and confirm it shows analyzed. 3) Submit and confirm saved note includes a “Media notes (auto-analyzed)” section. 4) Open History and verify save/edit/delete still works.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-17 21:24 AEDT
- What changed: Global media retention lock is now live. Mood image and voice uploads are processed for analysis, only extracted text is kept for reporting, and raw media files are not kept long-term on the server. Blood result upload consent now states that originals are deleted after extraction. Weekly report data collection now includes mood journal text entries.
- Where to see it (page/link): https://helfi.ai/mood/journal, https://helfi.ai/privacy, https://helfi.ai/terms
- What to quickly test: In Mood Journal, upload an image or voice note and confirm the entry saves with analyzed text. Confirm the page shows that media is stored on the user device and may disappear if browser/app storage is cleared. Check Privacy/Terms pages for the updated retention wording.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-17 18:54 AEDT
- What changed: Fixed notification inbox cleanup for completed check-in actions. Mood save now clears related Smart Health Coach mood alerts, water save clears Smart Health Coach hydration alerts, and food save clears Smart Health Coach meal/macro alerts. Existing daily check-in and mood reminder cleanup stays in place.
- Where to see it (page/link): https://helfi.ai/notifications/inbox (also related pages: /mood, /food/water, /food)
- What to quickly test: Open a Smart Health Coach alert from inbox, complete the related action (save mood, add water, or log food), then return to inbox and confirm that alert is no longer listed.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-17 17:09 AEDT
- What changed: Added automated deploy-time guard `scripts/assert-food-log-date-guard.js` and wired it into `prebuild` so deploy fails if Food Diary localDate source-of-truth date logic is removed.
- Where to see it (page/link): Build pipeline (`prebuild`) + guard docs in `GUARD_RAILS.md` section `3.4.1`
- What to quickly test: Run `npm run check:food-log-date-guard`; it should pass. Remove key localDate branch in `app/api/food-log/route.ts` and confirm the check fails.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-17 15:40 AEDT
- What changed: Hotfix for Food Diary date leak. GET /api/food-log now treats localDate as source of truth and only uses createdAt fallback when localDate is missing. Also repaired owner rows that were moved to 17 Feb so they are back on 16 Feb.
- Where to see it (page/link): https://helfi.ai/food
- What to quickly test: On 17 Feb view, yesterday’s late snacks should not appear unless they were actually logged to 17 Feb; on 16 Feb view, those snacks should be present.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-17 15:02 AEDT
- What changed: Updated web Talk to Helfi/Food Ask AI composer to match native style with a `+` button on the left, center input, and mic/send on the right. The + button now opens the existing photo/barcode actions. Added guard-rail lock note so this layout is protected.
- Where to see it (page/link): `/chat`, `/chat?context=food`, and `GUARD_RAILS.md` section `7.6`
- What to quickly test: Open Food Diary -> Ask AI, confirm left `+` button is visible and opens photo/barcode menu; send message and confirm mic/send stay on right.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-17 10:55 AEDT
- What changed: Added a locked guard-rail section to protect the approved chat formatting and chat interface style across web chat pages, so future agents cannot change it without owner approval.
- Where to see it (page/link): `GUARD_RAILS.md` section `7.9 Chat Formatting + Interface Style Lock`
- What to quickly test: Open `GUARD_RAILS.md` and confirm section `7.9` exists with protected files, no-change rules, restore checklist, and last stable deployment reference.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-17 02:45 AEDT
- What changed: Fixed Add from favorites ordering for midnight edge cases so older entries without __addedOrder use real add-time fallback from record ID; Taco-style entries now sort in correct recency position.
- Where to see it (page/link): https://helfi.ai/food (Add from favorites modal, All/Favorites tabs)
- What to quickly test: Open Add from favorites and confirm Taco Meal appears above older Monday items based on its newer timestamp.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-17 02:24 AEDT
- What changed: Updated Build a Meal barcode scanner so it now matches the main Food Diary scanner behavior (same camera flow, one-scan behavior, flash button, and manual barcode input toggle).
- Where to see it (page/link): /food/build-meal (tap “Scan barcode”)
- What to quickly test: Open main Food Diary scanner and Build a Meal scanner; confirm both look and behave the same, and one successful scan adds the item without reopening scanner.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-17 01:37 AEDT
- What changed: Added a backend repair for old favorites missing `lastUsedAt` so ordering is corrected from diary history. Also applied a one-time data repair for owner account favorites to restore missing last-used timestamps.
- Where to see it (page/link): /food -> Add from favorites (All/Favorites/Custom)
- What to quickly test: Open Add from favorites and confirm older meals with missing recency now move based on actual recent diary use.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-17 01:20 AEDT
- What changed: Fixed Favorites/All ordering so meals added through Favorites -> Change portion are treated as recently used and moved to the top. Also improved fallback matching so older entries (including Monday Taco entries) are recognized for recency ordering.
- Where to see it (page/link): /food -> Add from favorites (All/Favorites/Custom tabs) and /food/build-meal from Favorites change-portion flow
- What to quickly test: Open a favorite (for example Taco), use Change portion and Add. Reopen Add from favorites and confirm Taco appears at the top of Favorites and All.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-17 01:08 AEDT
- What changed: Improved food search prediction so typing short text like 'blu' can now return cheese matches such as 'Cheese, blue', and word-order searches like 'Blue cheese' now work correctly.
- Where to see it (page/link): /food -> Add Ingredient search (also Build a meal ingredient search)
- What to quickly test: Type 'blu' and confirm 'Cheese, blue' appears in the dropdown; then type 'Blue cheese' and confirm it appears as a result.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-17 00:46 AEDT
- What changed: Fixed meal ordering when adding from Favorites/Build a meal flows so newly added meals are stamped as newest and move to the top of Favorites and All lists. Also kept the updated-favorite "Add Meal" path aligned with this rule.
- Where to see it (page/link): /food -> Add from favorites / Build a meal
- What to quickly test: Open a favorite meal, change it, add it to diary, then open Favorites and All lists and confirm that meal appears at the top as the latest entry.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-17 00:29 AEDT
- What changed: Replaced the old browser popup with a modern in-app dialog after Favorite update. Dialog now uses two buttons: 'Not now' (white button, green text) and 'Add Meal' (green button, white text).
- Where to see it (page/link): /food -> Favorites/Custom -> Edit meal (Build a meal flow)
- What to quickly test: Update a favorite meal, confirm modern dialog appears with 'Not now' and 'Add Meal', and confirm 'Not now' returns to Food Diary while 'Add Meal' adds it to diary.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-17 00:12 AEDT
- What changed: When you edit/update a Favorite meal in Build a meal, the app now asks if you want to add the updated meal to your Food Diary right away. If yes, it creates a new diary entry immediately.
- Where to see it (page/link): /food -> Favorites/Custom -> Edit meal (Build a meal flow)
- What to quickly test: Edit a favorite meal, click Update, confirm prompt appears, choose Yes, and confirm the updated meal is added to diary.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-16 22:08 AEDT
- What changed: Added a new Portion control toggle in Build a meal. Toggle OFF is now the default and shows full-meal totals (100% of recipe). Toggle ON shows portion fields (serving/g/oz), keeps serving defaults for imported recipes, and saves/scales totals using the selected portion.
- Where to see it (page/link): /food/build-meal (including Recipe Import, Ask AI Build this meal, and edit flows that open Build a meal)
- What to quickly test: Open Build a meal and confirm toggle starts OFF with 100% message. Turn it ON and change serving/grams/oz; confirm totals and save use the selected portion.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-16 17:55 AEDT
- What changed: Fixed meal builder portion override bug so manual portion edits (including 0) now update ingredient and total calories immediately.
- Where to see it (page/link): /food/build-meal (and meal edit flow opened from Food Diary)
- What to quickly test: Open an existing meal entry with saved portion, change portion to 0 or another value, confirm calories/macros update instantly.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-16 17:48 AEDT
- What changed: In food chat (`/chat?context=food`), each AI `Option` now has its own `Build this meal` button. Clicking it opens the existing Build a Meal import flow with a prefilled draft so users can continue building and then save as favorite.
- Where to see it (page/link): `/chat?context=food` -> `/food/build-meal`
- What to quickly test: Ask for meal options in food chat, click `Build this meal` under Option 1 or Option 2, confirm Build a Meal opens with imported ingredients and can be saved to favorites.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-16 14:23 AEDT
- What changed: Applied the new ChatGPT-style chat formatting/interface across all web chat sections (Talk to Helfi, Food Ask AI, Symptom chat, Medical image chat, and Insights section chat) using one shared renderer. Section behavior stayed context-specific (full-health for Talk to Helfi, food-specific for Food chat, symptom-specific for Symptom chat).
- Where to see it (page/link): `/chat`, `/food`, `/symptoms`, `/medical-images`, `/insights/issues/*`
- What to quickly test: Open each chat section, send a message, and confirm consistent spacing/font/list formatting across all of them while each section still answers in its own topic context.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-16 01:14 AEDT
- What changed: Added hard build-time locks for calorie safety rules. Deploy now fails automatically if anyone changes (1) remaining calorie math, (2) daily allowance display format, or (3) stale/missing health-setup stamp blocker, unless they use explicit override flags.
- Where to see it (page/link): `/food`, `/api/user-data`, `scripts/protect-regions.js`, `GUARD_RAILS.md` section `3.4.1`
- What to quickly test: Try changing any protected block locally and run `node scripts/protect-regions.js`; it should fail unless the matching `ALLOW_*` override is set.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-15 21:16 AEDT
- What changed: Food Diary now shows your base daily allowance number (for example 2284) and shows exercise as a separate “+exercise added” note, while remaining calories still uses base + exercise - consumed.
- Where to see it (page/link): `/food`
- What to quickly test: With your existing +344 exercise and ~408 consumed, confirm Daily allowance shows base target and Remaining stays around 2220.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-15 21:00 AEDT
- What changed: Locked health-setup profile target saves so stale/unstamped payloads cannot silently overwrite daily calorie target inputs (weight/height/goal settings), and added a server-side profile target audit trail (`__PROFILE_TARGET_AUDIT__`) for traceable change history.
- Where to see it (page/link): `/onboarding?step=2`, `/food`, and guard rail notes in `GUARD_RAILS.md` section `2.7.3`
- What to quickly test: Open Health Setup on two devices/tabs, make a goal/intensity change on one side, then try to save older values from the other side; confirm stale save is ignored and Food Diary daily allowance stays on the latest saved profile values.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-15 20:05 AEDT
- What changed: Fixed Food Diary energy summary text so existing exercise calories are clearly included in “Daily allowance” (for example your existing +344 exercise entry now shows in that allowance line), and locked this rule in guard rails.
- Where to see it (page/link): `/food`
- What to quickly test: Open Food Diary with existing exercise logged, confirm “Daily allowance” includes exercise and shows the green “includes +exercise” text, and remaining/used numbers stay consistent.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-15 19:59 AEDT
- What changed: Refreshed Mood Journal editor button styling so `Add photo` and `Record voice note` look modern on mobile and desktop, with clear visual states while uploading/recording.
- Where to see it (page/link): `/mood/journal`
- What to quickly test: Open Mood Journal on phone and desktop, confirm both buttons look updated; tap Add photo (shows uploading state), tap Record voice note (shows active stop/timer state).

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-15 19:45 AEDT
- What changed: Added a safe global mobile scroll blocker so the PWA feels more like an app while keeping normal scrolling working. Also added a locked guard rail section with restore steps to stop future regressions.
- Where to see it (page/link): Global app behavior via `app/globals.css`; lock notes in `GUARD_RAILS.md` section `7.8`
- What to quickly test: Open Helfi on iPhone PWA, scroll long pages up/down, and confirm the page feels less bouncy while buttons/lists/forms still work normally.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-15 18:03 AEDT
- What changed: Reduced Food Diary reload flicker safely by removing extra same-date summary remounts, using cache-first loading for history/water/exercise, reducing repeat same-date verify fetches, removing search warmup, and loading food library from server only when Favorites opens.
- Where to see it (page/link): `/food`
- What to quickly test: Hard refresh `/food`; energy summary should feel steadier, existing rows should stay visible while data verifies, and water/exercise sections should show less loading flicker when cached.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-15 17:34 AEDT
- What changed: Hardened reminder guard rails with a strict lock section, expanded protected files list, explicit no-touch rules, and clearer restore steps for reminder page opening + inbox cleanup after save.
- Where to see it (page/link): `GUARD_RAILS.md` section `14` and `14.0.1`
- What to quickly test: Open `GUARD_RAILS.md` and confirm section `14.0.1 Hard lock (Feb 2026 regression prevention)` exists with the pass/fail checklist and restore steps.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-15 16:44 AEDT
- What changed: Fixed reminder tap routing so mood/check-in taps stay on the correct reminder page, and successful saves now clear leftover reminder inbox items for that reminder type (so completed reminders do not keep reappearing).
- Where to see it (page/link): `/mood/quick`, `/check-in`, `/notifications/inbox`
- What to quickly test: Trigger a mood reminder and a check-in reminder, tap each from the phone pop-up, confirm each opens the correct page, save, then open `/notifications/inbox` and confirm those reminder items are gone.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-15 16:05 AEDT
- What changed: Added the supplied `AI DOCTOR.jpg` into the AI insights feature page overview, in the right-side image position next to the first section text.
- Where to see it (page/link): `/features/ai-insights`
- What to quickly test: Open `/features/ai-insights` and confirm the right-side image next to the first paragraph block now shows the AI doctor photo.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-15 16:28 AEDT
- What changed: Added a new “Food Diary Lock List (Quick View)” near the top of guard rails so agents can instantly see the protected Food Diary sections before editing.
- Where to see it (page/link): `GUARD_RAILS.md` (top section)
- What to quickly test: Open `GUARD_RAILS.md` and confirm the new Food Diary quick list appears before section `0`.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-15 15:29 AEDT
- What changed: Fixed a race where adding a drink from Water -> Favorites could hide an earlier meal in the same category/date. Add flow now always merges from the latest live diary list before saving, so new drink adds no longer replace prior meals.
- Where to see it (page/link): `/food` (Favorites add flow + Water -> Favorites add flow), lock notes in `GUARD_RAILS.md` section `7.6.4`
- What to quickly test: Add a breakfast meal from Favorites, then add tea/hot chocolate from Water -> Favorites into Breakfast. Confirm both rows stay visible.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-15 15:05 AEDT
- What changed: Added a hard regression lock for the favorites popup so `Change portion` must remain visible in the first action popup (`Add to diary`, `Preview`, `Change portion`, `Cancel`). Added matching guard-rail recovery steps so future agents can quickly restore this if a merge removes it.
- Where to see it (page/link): `/food` favorites add popup, `app/food/page.tsx`, `GUARD_RAILS.md` section `7.6.2`
- What to quickly test: Open `/food` -> Add from favorites -> tap any favorite/custom item and confirm popup shows `Change portion` between `Preview` and `Cancel`.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-15 14:50 AEDT
- What changed: Locked down HEL-162 permanently. Added strict non-tamper guard rails plus inline code lock comments and recovery steps in both Food Diary and API drink-calorie guard functions, so future agents can’t accidentally break hot chocolate/tea drink calorie behavior.
- Where to see it (page/link): `GUARD_RAILS.md`, `/food` flow code in `app/food/page.tsx`, and save guard in `app/api/food-log/route.ts`
- What to quickly test: Open guard rails section `7.6.3` and confirm lock + recovery checklist exists. In code, confirm `DO NOT TOUCH - OWNER LOCK (HEL-162)` comments exist above drink guard functions.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-15 14:45 AEDT
- What changed: Follow-up visual fix for `/features/ai-insights` hero banner. Increased banner height and adjusted image framing so the couple’s heads and the phone mockups on the right are no longer cut off.
- Where to see it (page/link): `/features/ai-insights`
- What to quickly test: Open `/features/ai-insights` on desktop and mobile, confirm the top banner is taller and both heads + right-side phone mockups are fully visible.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-15 14:16 AEDT
- What changed: Relaxed sugar-free hot chocolate lock so base drink calories are preserved (for example 8 kcal per serve) while still blocking inflated legacy values (like 319 kcal from bad scaling).
- Where to see it (page/link): `/food` and Water -> favorites drink add flow
- What to quickly test: Refresh `/food` on affected date and confirm sugar-free hot chocolate shows base calories (not zero, not 319). Then add a new sugar-free hot chocolate and confirm it keeps base calories without ml multiplication.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-15 13:58 AEDT
- What changed: Rebuilt `/features/ai-insights` to match the same layout style as `/features/nutrition-food`. Added the new full-width beach-couple banner at the top, removed scrolling mobile mockups in that banner area, and set AI insights section images to placeholders for now.
- Where to see it (page/link): `/features/ai-insights`
- What to quickly test: Open `/features/ai-insights` and confirm top section matches nutrition-food layout style, banner is full-width, no scrolling phone strip appears in the banner, and section image blocks show placeholders.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-15 13:58 AEDT
- What changed: Strengthened legacy self-correction for old sugar-free hot chocolate entries. If no explicit sugar/honey sweetener amount is present, the entry now forces zero calories/macros instead of reusing stale stored values like 319 kcal.
- Where to see it (page/link): `/food`
- What to quickly test: Open `/food` on the affected date and confirm old `Hot chocolate sugar free` row no longer shows `319 kcal` after refresh.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-15 13:00 AEDT
- What changed: Added legacy self-correction for old sugar-free hot chocolate rows that were saved with bad calories and missing drink metadata. These old rows now auto-correct in Food Diary instead of keeping stale 319 kcal values.
- Where to see it (page/link): `/food`
- What to quickly test: Refresh `/food` on a date with an old sugar-free hot chocolate row that previously showed 319 kcal and confirm it now self-corrects instead of showing inflated calories.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-15 12:43 AEDT
- What changed: Public website layout rule completed. Added the full public top menu and public footer across the required pages: FAQ, Privacy, Terms, Features, Practitioners, List your practice, and List your practice start. Help page now uses public header/footer for signed-out visitors while keeping the signed-in layout unchanged.
- Where to see it (page/link): `/faq`, `/privacy`, `/terms`, `/help`, `/features`, `/practitioners`, `/list-your-practice`, `/list-your-practice/start`
- What to quickly test: Open each page while signed out and confirm full top menu + footer show. For `/help`, also sign in and confirm the existing signed-in help layout still appears.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-15 12:36 AEDT
- What changed: Mood History facelift. Removed Insights section and removed Export CSV. Made the page more compact and cleaner (tighter cards, collapsible extra trend views, shorter recent entries list with show more/less). Also fixed chart popup behavior so tapping the same emoji/data point again now closes the info.
- Where to see it (page/link): `/mood/history`
- What to quickly test: Open `/mood/history`; confirm no Insights section and no Export CSV button. Tap any chart emoji/data point to open info, tap the same point again to close it. Confirm Recent entries starts compact and expands with Show more.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-15 12:36 AEDT
- What changed: Second lock patch for Water -> Favorites drink calories. Added server-side save guard plus stronger client guard, so drink calories now always come from sweetener context (free/sugar/honey) and never from ml multiplication or stale favorite totals.
- Where to see it (page/link): `/food/water` and `/food` (Water drink -> favorites add flow)
- What to quickly test: Add hot chocolate/tea/coffee from Water flow via favorites, set sweetener, and confirm calories match sweetener only (no 319 kcal spike from 500 ml scaling).

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-15 12:26 AEDT
- What changed: Fixed Water -> Favorites drink calorie carry-through for sweetener drinks. Drinks now keep drink icon + ml amount, and calories use sweetener amount only (no ml multiplication).
- Where to see it (page/link): `/food/water` -> add drink from favorites flow into `/food`
- What to quickly test: Add hot chocolate/tea/coffee from Water flow using sugar or honey and confirm Food Diary calories match sweetener amount only while showing correct drink icon and ml.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-15 12:15 AEDT
- What changed: FAQ page modernized to accordion style. All answers are now collapsed by default and expand only when tapped, giving a cleaner and more modern help-center layout.
- Where to see it (page/link): `/faq`
- What to quickly test: Open `/faq`, confirm all answers start closed. Tap a question to open it, tap again to close it, and confirm only one answer is open at a time.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-15 11:20 AEDT
- What changed: Full Mood Tracker upgrade focused on retention and usability. Removed Mood Insights tab from mood navigation, added instant sync for mood reminder settings between Mood Preferences and Notification Reminders, expanded emotion selection with grouped feeling chips, added medication impact tracking in check-ins, upgraded mood pattern cards (sleep/nutrition/activity/supplements/medication), added post-check-in “next best step” guidance, added Share Summary and Export CSV tools, and added a 12-month “Year in Pixels” mood view with chart polish.
- Where to see it (page/link): `/mood`, `/mood/history`, `/mood/journal`, `/mood/preferences`, `/notifications/reminders`
- What to quickly test: In `/mood/preferences` toggle reminders and confirm `/notifications/reminders` updates immediately (and vice versa). In `/mood` complete a check-in and confirm “Next best step” appears after save. In `/mood/history` verify Share Summary, Export CSV, and Year in Pixels render correctly.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-15 04:20 AEDT
- What changed: Continued SEO improvements across public pages. Added structured data (Home, FAQ, Features, News articles), improved metadata/canonical links for FAQ/Features/News, and added stronger internal linking blocks between Home, Features, FAQ, and News.
- Where to see it (page/link): `/`, `/faq`, `/features`, `/features/nutrition-food`, `/features/ai-insights`, `/news`, `/news/mobile-apps-coming-soon`, `/news/complete-food-tracking-workflow`, `/news/weekly-health-insights-you-can-use`, `/news/meal-water-sleep-consistency`
- What to quickly test: Open Home and confirm the new `Latest health tracking guides and product updates` section appears and links to articles. Open `/faq` and confirm the popular links cards appear near the top. Open `/features` and confirm the `Also in news` links section appears. Share a `/news/...` article and check social preview metadata populates.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-15 02:02 AEDT
- What changed: Added strict lock so `Change portion` from Add-from-favorites is one-off only. Adjusting portion/ingredients in that flow now cannot update favorite/custom default meal templates. Default template changes are only allowed through Favorites/Custom pencil edit flow.
- Where to see it (page/link): `/food/build-meal?...&fromFavoriteAdjust=1`, plus guard rail lock in `GUARD_RAILS.md` section `7.6.2`.
- What to quickly test: Open Add from favorites -> choose meal -> `Change portion`, modify portion, tap `Add`, then reopen same meal in favorites and confirm original default serving/ingredients stay unchanged.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-15 01:49 AEDT
- What changed: Updated Favorites add flow to support full portion editing. The first popup now includes `Change portion` (goes straight to full editor). In Preview, `Change amount` is renamed to `Change portion` and also opens full editor. The full editor route now uses Add mode for this flow, so users can still add the meal/item to diary after editing portion and ingredients.
- Where to see it (page/link): `/food` -> `Add from favorites` (All/Favorites/Custom) -> select meal -> action popup/Preview -> `Change portion`
- What to quickly test: In the action popup confirm buttons are `Add to diary`, `Preview`, `Change portion`, `Cancel`. Click `Change portion` and confirm full editor opens with ingredient add/remove + portion controls, and bottom button says `Add`. Save and confirm entry is added to diary.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-15 01:02 AEDT
- What changed: Added strict lock-down guard rails and in-code warning for the Food Diary drink-row flip regression (HEL-156). Future agents now have explicit "do not override explicit drink metadata" rules plus a clear Playwright recovery checklist if the issue ever returns.
- Where to see it (page/link): `GUARD_RAILS.md` section `7.6.1 Delayed Drink->Food Flip Lock (HEL-156)` and `app/food/page.tsx` (`renderEntryCard` drink icon logic comment).
- What to quickly test: Open `/food`, use a date with `Coke Zero` drink entry (example `2026-02-14`), hard refresh 3 times, confirm row stays drink icon + `150 ml` for 10+ seconds.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-15 00:44 AEDT
- What changed: Replaced the old No/Yes save control (after Build a meal imports) with a clear toggle switch. Wording is now: "Would you like to save this as a custom meal?" Toggle is OFF by default and turns green when ON.
- Where to see it (page/link): /food/build-meal (after opening from AI Recommended -> Build this meal, or any recipe import flow)
- What to quickly test: Open Build a meal import, confirm the new custom meal toggle appears, default is off, click once and confirm it turns green and shows it will save to Custom meals.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-15 00:11 AEDT
- What changed: Improved Build-a-meal clarity and speed for AI recommended imports. Portion text now reads "This portion is X% of the full amount." and is shown directly under the portion field. Also sped up small imports by using AI-provided ingredient nutrition directly first (when available) and using faster lookup mode for short ingredient lists.
- Where to see it (page/link): /food/build-meal (after opening from /food/recommended with Build this meal)
- What to quickly test: Generate an AI meal, click Build this meal, confirm ingredients populate faster; confirm the portion helper appears under the portion field with the new wording.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-14 23:47 AEDT
- What changed: Added a visible date-range helper under Check-in History time period controls so users can immediately see the actual data window being shown (example: “Showing data from Feb 4 to Feb 13”). Added on web and native parity screen.
- Where to see it (page/link): `/check-in/history` and native Daily Check-In -> Rating History
- What to quickly test: On `/check-in/history`, switch time period (30 Days vs 12 Weeks) and confirm the “Showing data …” line updates and explains why chart may look the same when data range is small.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-14 23:30 AEDT
- What changed: Fixed AI Recommended Meal Generate 500 error by correcting the server logging payload and keeping model fallback/retry behavior active. Also applied safe binary-response typing compatibility in existing PDF/image API routes so production builds no longer fail before deploy.
- Where to see it (page/link): /food/recommended
- What to quickly test: Open AI Recommended Meals, tap Generate (6 credits), confirm a meal is returned (no red Generate failed 500 banner).

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-14 22:21 AEDT
- What changed: Added `Build this meal` to AI Recommended Meals and wired it into the same Build-a-meal import flow used by Recipe Import. Selecting it now passes an import draft and opens Build a meal with ingredient-by-ingredient matching/progress UI while ingredients are found and added.
- Where to see it (page/link): `/food/recommended` -> `Build this meal` -> `/food/build-meal?recipeImport=1`
- What to quickly test: Generate an AI meal, click `Build this meal`, confirm Build a meal shows live import progress and ingredients appear progressively as they are matched; then save as favorite/custom meal.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-14 20:00 AEDT
- What changed: Fixed Smart Health Coach duplicate alert spam and anti-nag behavior. Added a hard one-run lock so duplicate scheduler hits cannot send/charge multiple alerts, plus extra cooldowns to block repeated same-category/same-message alerts in short periods. Improved Tip History navigation with direct one-tap buttons back to Smart Coach and Main menu.
- Where to see it (page/link): `/notifications/ai-insights`, `/health-tips`, `/health-tips/history`
- What to quickly test: Trigger a hydration condition and confirm you do not receive repeated identical alerts in a burst. Open Tip History and confirm you can go back using `Back to Smart Coach` or `Main menu` in one tap.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-14 20:11 AEDT
- What changed: Fixed History-tab-only scroll lock on Check-in by removing the extra overscroll lock on the History page wrapper. Today’s Check-in and History tabs now use matching page scroll behavior.
- Where to see it (page/link): `https://helfi.ai/check-in/history`
- What to quickly test: Open `/check-in`, switch to `Rating History`, then scroll up/down with mouse wheel or trackpad. Confirm scrolling continues to work after tab switch.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-14 19:43 AEDT
- What changed: Fixed the check-in history page scroll lock on desktop by tightening sidebar wheel handling in the shared layout. Wheel handling now only runs when scrolling starts inside the left sidebar, so `/check-in/history` scrolls normally again.
- Where to see it (page/link): `https://helfi.ai/check-in/history`
- What to quickly test: Open `/check-in/history` on desktop and scroll up/down with mouse wheel or trackpad while cursor is over the main page area. Confirm page moves normally.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-14 19:38 AEDT
- What changed: Locked down the recipe section to prevent regressions. Added a strict recipe lock section to `GUARD_RAILS.md` and added in-code `RECIPE LOCK (owner request)` comments in recipe import and build meal files so agents must not change this area without explicit written owner approval.
- Where to see it (page/link): `GUARD_RAILS.md`, `/app/food/import-recipe/ImportRecipeClient.tsx`, `/app/api/recipe-import/route.ts`, `/app/food/build-meal/MealBuilderClient.tsx`
- What to quickly test: Open the listed files and confirm the new strict lock rules/comments are present.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-14 18:45 AEDT
- What changed: Added one single top-level expander for `Your ingredients` in Build a meal edit mode. When reopening a saved recipe, the whole ingredient list now starts retracted in one section (instead of showing all ingredient rows).
- Where to see it (page/link): `/food/build-meal?sourceLogId=<saved_entry_id>` and `/food/build-meal?editFavoriteId=<favorite_id>`
- What to quickly test: Reopen a saved recipe entry and confirm `Your ingredients` is collapsed as one section by default. Tap the header to open all ingredient rows.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-14 17:53 AEDT
- What changed: Reopened saved recipe edits now use a truly compact collapsed ingredient list. When reopening a saved meal, each ingredient stays title-only until tapped open, so you can reach Save/Update faster without long scrolling.
- Where to see it (page/link): `/food/build-meal?sourceLogId=<saved_entry_id>` and `/food/build-meal?editFavoriteId=<favorite_id>`
- What to quickly test: Open any previously saved recipe entry in Build a meal edit mode and confirm all ingredient rows are compact (name-only) by default. Tap one row to expand and edit.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-14 17:10 AEDT
- What changed: Recipe import photo flow now shows thumbnail previews of selected photos while importing, then clears those photos automatically after a successful import. Build-a-meal edit mode now starts with ingredient cards collapsed by default when reopening an already-saved meal (without changing first-time pre-save recipe import behavior).
- Where to see it (page/link): `/food/import-recipe` (Import by photo), `/food/build-meal?sourceLogId=<saved_entry_id>` or `/food/build-meal?editFavoriteId=<favorite_id>`
- What to quickly test: On mobile, choose/take recipe photos and confirm thumbnails are visible before import, then gone after success. Open a previously saved meal in edit mode and confirm all ingredient cards start collapsed.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-14 16:46 AEDT
- What changed: Fixed imported recipe rename not showing in Food Diary after pressing Update. Build-a-meal now treats diary save failures as real failures (no silent success), sends the updated name in return override data, and Food Diary now applies that name override with short retries while entries load.
- Where to see it (page/link): `/food` and `/food/build-meal`
- What to quickly test: Import a recipe, save it, open that entry with Edit Entry, change meal name, tap Update, and confirm the row name updates immediately and stays after refresh.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-14 16:21 AEDT
- What changed: Import Recipe photo flow now has clear mobile actions: `Take photo` (camera) and `Choose from library` (phone photos), with multi-photo support and a clear/reset option.
- Where to see it (page/link): `/food/import-recipe` (Import by photo tab)
- What to quickly test: On iPhone, tap `Import by photo`, then tap `Take photo` to open camera and `Choose from library` to select existing images. Confirm selected count updates and Import from photo works.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-14 20:16 AEDT
- What changed: News UX polish. Replaced confusing `8 min read` wording with clearer text like `Reading time: About 8 minutes`. Also added images to the recommended article cards at the bottom of each news article page.
- Where to see it (page/link): `/news` and any article page such as `/news/complete-food-tracking-workflow`
- What to quickly test: Open an article and confirm the top metadata line now shows `Reading time: About X minutes`; scroll to “More from Helfi News” and confirm each card shows an image thumbnail.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-14 16:03 AEDT
- What changed: SEO pass on News pages. Added article index schema (JSON-LD) on `/news`, added related internal links on each article page, and added clear published + updated metadata on every news article (also reflected in article schema/OpenGraph modified time).
- Where to see it (page/link): `/news`, `/news/mobile-apps-coming-soon`, `/news/complete-food-tracking-workflow`, `/news/weekly-health-insights-you-can-use`, `/news/meal-water-sleep-consistency`
- What to quickly test: Open `/news` and confirm cards still work normally; open each article and confirm the metadata line shows both Published and Updated dates; scroll to “Related Helfi links” and confirm each link opens correctly.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-14 15:19 AEDT
- What changed: Applied a deeper scroll fix in shared layout so main page scrolling uses native browser behavior (prevents wheel/trackpad lock on content pages like Check-in History).
- Where to see it (page/link): `/check-in/history`
- What to quickly test: Open Check-in History and scroll down using wheel/trackpad from anywhere in content area (including over the chart). It should move down normally.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-14 14:59 AEDT
- What changed: Fixed Check-in History scroll lock bug on web. The chart tooltip interaction no longer places a full-page-style click layer over the chart area, so page scrolling continues to work normally.
- Where to see it (page/link): `/check-in/history`
- What to quickly test: Open Check-in History, click any chart point, then scroll down past the chart and confirm the page scrolls normally.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-14 14:28 AEDT
- What changed: Expanded all 4 News articles to long-form human-style content (roughly 900-1,100 words each). Added new hero banners for `/news/weekly-health-insights-you-can-use` and `/news/meal-water-sleep-consistency` using supplied images from BLOG IMAGES.
- Where to see it (page/link): `/news/mobile-apps-coming-soon`, `/news/complete-food-tracking-workflow`, `/news/weekly-health-insights-you-can-use`, `/news/meal-water-sleep-consistency`
- What to quickly test: Open each article and confirm longer content loads, and confirm Weekly Insights + Meals/Water/Sleep pages now show the new hero banners instead of placeholders.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-14 14:08 AEDT
- What changed: Daily Check-In rating buttons now support tap-to-clear. If you tap a selected rating again, it unselects (clears) that rating instead of staying locked.
- Where to see it (page/link): `/check-in`
- What to quickly test: Open Today’s Check-In, tap any score once (select), then tap the same score again and confirm it clears.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-14 13:24 AEDT
- What changed: Updated the food tracking news article title from `A Better Food Tracking Workflow From Photo to Final Log` to `A Better Food Tracking Workflow for Everyday Life`. Added the supplied hero banner image `A BETTER FOOD TRACKING WORKFLOW.png` to `/news/complete-food-tracking-workflow`.
- Where to see it (page/link): `/news/complete-food-tracking-workflow`
- What to quickly test: Open the article page and confirm the new title is shown and the new banner appears in the hero image area.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-14 12:46 AEDT
- What changed: Fixed favorite-name stickiness regression (example `Peach`). Diary save now keeps the current visible title unless the user explicitly types a new one, favorites add now always uses the explicit favorite label, reverse override rules that expand a favorite label back to a raw single-item database name are ignored, and diary rows linked to favorites now prefer the saved favorite label when names differ.
- Where to see it (page/link): Food Diary (`/food`) add from favorites + diary entry edit + favorites rename flows
- What to quickly test: In Favorites, keep item as `Peach`, add it to diary, and confirm row shows `Peach` (not `Peaches, yellow, raw`). Edit/reopen/refresh and confirm it stays `Peach`.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-14 12:38 AEDT
- What changed: Added the new `IOS AND AND ANDROID BANNER.png` to the hero section of the article page `/news/mobile-apps-coming-soon`, replacing the generic placeholder block.
- Where to see it (page/link): `/news/mobile-apps-coming-soon`
- What to quickly test: Open the article page and confirm the new iOS/Android banner is visible in the hero area under the title.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-14 11:57 AEDT
- What changed: Added the supplied News images from your BLOG IMAGES folder. `BLOG BANNER.png` now appears under the header on `/news`, and `WHAT IS NEXT FOR HELFI.png` now replaces the featured-story green placeholder image panel.
- Where to see it (page/link): `/news`
- What to quickly test: Open `/news`, confirm the top banner is visible under the menu, and confirm the featured story right panel shows your image with text overlay.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-14 11:20 AEDT
- What changed: News pages now include the same top Medical Disclaimer banner and a full site footer, so layout matches homepage styling. Also confirmed the featured story image area ratio target for design is about 1.45:1 (closest preset 3:2).
- Where to see it (page/link): `/news` and `/news/mobile-apps-coming-soon`
- What to quickly test: Open `/news` and an article page, confirm top disclaimer bar is visible and expandable, menu/header is present, and footer appears at bottom.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-14 04:27 AEDT
- What changed: Fixed the News menu bug so `/news` and `/news/*` stay public (no forced sign-in redirect). Rebuilt News into a professional article hub and added 4 full SEO-focused articles, including the requested iOS + Android apps coming soon post with Apple Health, Google health data support, and Sleep Coach details. Added article pages with metadata + schema and added News URLs to sitemap.
- Where to see it (page/link): `/news` and `/news/mobile-apps-coming-soon`
- What to quickly test: Click `News` from the top menu while logged out, confirm it opens `/news` directly, open all 4 articles, and use browser back to return to News/home without URL manual edits.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-14 03:47 AEDT
- What changed: Fixed disappearing favorites stability. If diary rows still have favorite links but those favorites were dropped, the app now restores the missing linked favorites (including meals like `Mashed potato`) from recent diary data and saves them back. Also added a stale-write safety guard so partial old payloads cannot wipe linked favorites, and changed favorite-save flow to always use the newest in-memory list.
- Where to see it (page/link): Food Diary favorites picker (`/food` -> Add from Favorites)
- What to quickly test: Open Favorites and search `Mashed potato` (it should appear again). Add it once and refresh twice. Confirm it stays in Favorites and does not disappear.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-14 03:36 AEDT
- What changed: Header polish update. Added `News` to the desktop menu, widened header layout so logo sits further left and action buttons sit further right, reduced desktop `Log in` and `Create account` button height for a cleaner modern look, and added a live News page route (`/news`) with starter update cards.
- Where to see it (page/link): Global public header + News page (`/news`)
- What to quickly test: Open homepage and feature pages, confirm `News` appears in top menu, confirm header spacing is wider, confirm login/create buttons are shorter, and open `/news` to verify page loads.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-14 03:24 AEDT
- What changed: Permanent Food Diary follow-up for chicken favorite regression. Non-drink favorites now force food icon rendering (so leaked drink metadata cannot show water icon on chicken), and Add from Favorites now has a shared single-tap action guard to prevent duplicate entries from one tap.
- Where to see it (page/link): Food Diary (`/food`) favorites add flow + existing chicken rows in diary list
- What to quickly test: Add `Chicken Breast` once from Favorites and confirm only one row is created with food icon (not water). Refresh twice and confirm icon remains food.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-14 02:56 AEDT
- What changed: Follow-up permanent repair for old bad rows already saved in diary. Non-drink rows that had leaked drink metadata now self-heal on load (so they stop showing drink icons). Also, when a linked favorite has a short saved name and the row still has a long raw source title, the row now shows the short favorite name.
- Where to see it (page/link): Food Diary (`/food`) existing historical rows + Add from Favorites list rows
- What to quickly test: Refresh Food Diary and check old chicken rows no longer show water icon, and long USDA chicken titles show the saved short favorite name (`Chicken Breast`) when linked.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-14 02:23 AEDT
- What changed: Permanent fix for drink-context contamination in Food Diary add flows. Pending drink context is now always cleared after each add path checks/uses it (analysis save, barcode add, meal add, favorite add). Favorites add logic now only prefers entry-source in drink flow when the selected row is actually a drink, preventing non-drink favorites (like Chicken Breast) from inheriting drink behavior.
- Where to see it (page/link): Food Diary (`/food`) add-from-favorites and water-flow drink add paths
- What to quickly test: Add `Chicken Breast` from Favorites and confirm basket icon + short label stays after refresh. Then add a water-flow drink (example Coke 500 ml) and confirm calories scale correctly without raw-ml blow-up.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-14 02:04 AEDT
- What changed: Improved recipe import quality and missing-item matching. Import now rejects abbreviated instruction output, prefers higher-quality page text when extracting recipes, and retries with stronger matching for obvious single foods (like avocado) before showing manual-match warnings.
- Where to see it (page/link): Recipe import flow (`/food/import-recipe` -> `/food/build-meal?recipeImport=1`)
- What to quickly test: Import the same recipe again and confirm instructions are full (not `ABBREVIATED RECIPE`). Confirm `1 large avocado` auto-matches without showing manual-match warning.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-14 02:05 AEDT
- What changed: Added newly provided food mockups to the nutrition feature page. Updated section images for food menu (favorites/reuse), recipe import, and water logging (including 2 water screens) so those sections now show your latest phone visuals.
- Where to see it (page/link): Food feature page (`/features/nutrition-food`)
- What to quickly test: Open `/features/nutrition-food` and check the sections for Recipe Import, Favorites and Reusable Meals, and Water and Drinks Logging now show the new mockups.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-14 01:48 AEDT
- What changed: Fixed iPhone horizontal overflow in the Import Recipe module. The URL field + Import button now stack safely on small screens, and mobile-safe width guards were added across all import form inputs/review fields.
- Where to see it (page/link): Import Recipe screen (`/food/import-recipe`)
- What to quickly test: On iPhone, open Import Recipe, focus URL input, and confirm no horizontal overflow. Also test photo mode and review inputs to confirm nothing pushes off-screen.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-14 01:09 AEDT
- What changed: Homepage food cards now click directly to section anchors on the food feature page. Added missing detailed sections on `/features/nutrition-food` for import recipe, favorites/reusable meals, copy-duplicate-combine tools, and water/drinks logging. Also added SEO wording updates for this page.
- Where to see it (page/link): Homepage food section (`/`) and Food feature page (`/features/nutrition-food`)
- What to quickly test: On homepage, click each food card and confirm it jumps to the correct section anchor on `/features/nutrition-food`. Check new sections exist with detailed copy and mockup images.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-14 00:30 AEDT
- What changed: Refreshed the homepage food tracking section design. Updated heading to `Fully Featured Food Tracking` (no colon), added icons to each feature card, added modern card styling (top accent bars, soft shadows, hover lift), and polished spacing/background for a cleaner look.
- Where to see it (page/link): Homepage (`/`)
- What to quickly test: Open homepage, scroll to the food tracking section, confirm the new heading text, confirm each card shows an icon and hover effect, and confirm layout still looks clean on mobile.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-13 23:49 AEDT
- What changed: Homepage update. Added `Home` to the top menu, added a full Food Tracking capabilities section (photo/camera, barcode, ingredient search, build meal, recipe import, AI recommended meals, favorites, copy/duplicate/combine tools, meal totals, water/drinks), and added a "native iOS + Android coming soon" section with App Store and Google Play badges.
- Where to see it (page/link): Homepage (`/`)
- What to quickly test: Open homepage desktop and confirm `Home` appears in top menu. Scroll down and confirm both new sections appear and look correct on desktop/mobile.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-14 00:10 AEDT
- What changed: Added a global drink-scaling safety lock for all water-flow drinks. The app now only scales calories/macros when the source serving volume is reliable, and blocks invalid tiny-base scaling that caused calorie blow-ups (like per-serve values being multiplied by raw ml).
- Where to see it (page/link): Food Diary (`/food`) when adding drinks from Water Intake/Favorites drink flow
- What to quickly test: Add a 500 ml drink from favorites (for example Coke or hot chocolate) through water logging flow and confirm calories are scaled by the real serving volume, not multiplied by 500 raw ml.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-13 23:29 AEDT
- What changed: Added a hard lock for sugar-free hot chocolate so stale high calories cannot be saved or shown again. Save/update API now forces sweetener-only nutrition for this drink path, and diary load mapping applies the same guard to old rows so bad values like `319 kcal` no longer reappear.
- Where to see it (page/link): Food Diary (`/food`) and food-log save path (`/api/food-log`)
- What to quickly test: Refresh Food Diary and check any `Hot chocolate sugar free` row from water flow. It should no longer show inflated calories. Add a new sugar-free hot chocolate from water flow and confirm calories stay correct after refresh.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-13 23:05 AEDT
- What changed: Fixed hot-chocolate drink regression in Food Diary. Drink entries from water flow are now protected from loose favorite remapping (prevents wrong kcal like 319), drink-flow add now prefers the selected row entry payload, and drink icon rendering now trusts saved drink metadata so icons stay correct on mobile/desktop.
- Where to see it (page/link): Food Diary (`/food`) and Water Intake -> add drink flows (`/food/water`)
- What to quickly test: Add `Hot chocolate sugar free` from Water Intake favorites flow at 500 ml, then check Food Diary row shows drink icon + amount and correct drink kcal (not remapped to a different favorite’s calories).

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-13 19:26 AEDT
- What changed: Adjusted Web Dashboard mobile layout to match native app more closely. Daily Tools now renders in 2 columns on phone size, and My Health now uses the same 3 action rows as native (Weekly Health Report, Health Setup, Find a Practitioner) with matching action buttons.
- Where to see it (page/link): Dashboard (`/dashboard`)
- What to quickly test: On mobile width, confirm Daily Tools shows 2 cards per row. Confirm My Health shows 3 row cards with `View report`, `Continue`, and `Browse`, and each opens the correct page.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-13 19:21 AEDT
- What changed: Restored old barcode miss behavior. If a scanned product is not found, the app now immediately opens the “Take label photo” step so nutrition details can be captured and saved.
- Where to see it (page/link): Food Diary barcode scanner (`/food`)
- What to quickly test: Scan a barcode that is not found. Confirm the nutrition label photo prompt appears right away (no repeated scan loop first).

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-13 19:10 AEDT
- What changed: Full barcode scanner stability fix. Improved first-scan reliability, stopped random jump to Favorites/blank screen, kept scanner active on not-found camera reads, and restored the darker scanner background overlay.
- Where to see it (page/link): Food Diary barcode scanner (`/food`)
- What to quickly test: Scan Twinings Buttermint Tea once; it should add without jumping to Favorites. If a barcode is truly not found, scanner should stay open so you can scan again immediately.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-13 19:06 AEDT
- What changed: Shipped foundational SEO upgrades. Added live sitemap and robots routes, improved global page metadata/social preview tags, added canonical/social metadata on core public pages, and set auth/help/support pages to noindex.
- Where to see it (page/link): `/sitemap.xml`, `/robots.txt`, `/features`, `/faq`, `/privacy`, `/terms`
- What to quickly test: Open `/sitemap.xml` and `/robots.txt` and confirm they load. Share `https://helfi.ai/features` in a social preview tool and confirm title/description appears. In Search Console, verify sitemap status starts processing.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-13 18:59 AEDT
- What changed: Redesigned the Web App Dashboard to match the native dashboard style. Updated the welcome section plus Daily Tools and My Health card layout, and wired the card links to the correct existing pages.
- Where to see it (page/link): Dashboard (`/dashboard`)
- What to quickly test: Open Dashboard and click each card/button: Daily Check-In, Mood Tracker, Track Calories, Water Intake, Insights, Health Tracking, Symptom Analysis, Medical Image Analyzer, and both `See all` links.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-13 18:53 AEDT
- What changed: Added hard locks so agents do not change favorites ordering and All-tab name mapping by accident. Added explicit guard-rail rules plus `DO NOT TOUCH` code comments in the exact ordering and matched-favorite label sections.
- Where to see it (page/link): Internal docs/code only: `GUARD_RAILS.md`, `app/food/page.tsx`
- What to quickly test: Open those files and confirm lock wording is present around favorites recency sort and All-tab matched-favorite label logic.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-13 18:19 AEDT
- What changed: Imported recipe ingredients now default to count-based size units when available (for example eggs now use egg size units instead of defaulting to grams). This makes entries like `2 eggs` appear as count + egg size, while still letting users edit amount and unit.
- Where to see it (page/link): Food Diary -> Add meal -> Import Recipe -> Continue to Build a meal -> expand ingredient cards
- What to quickly test: Import a recipe with eggs. Confirm the egg line defaults to a count unit (such as large egg) rather than `g`, and confirm amount/unit can still be changed manually.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-13 17:09 AEDT
- What changed: Fixed the remaining `All` tab name mismatch for matched favorites (Chicken Breast case). When an `All` row is linked to a saved favorite/custom meal, the row now always shows the saved title and no longer gets remapped back to a long legacy name.
- Where to see it (page/link): Food Diary -> Add from favorites (`/food?open=favorites`)
- What to quickly test: Open `All` and `Favorites` tabs and compare the chicken row. Both should now show `Chicken Breast` (not the long old title).

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-13 15:52 AEDT
- What changed: In imported recipe ingredient cards, removed the confusing `Serving size options` row. Users still keep editable `Amount` + `Serving size` controls, and ingredient macros continue to show for the full recipe amount.
- Where to see it (page/link): Food Diary -> Add meal -> Import Recipe -> Continue to Build a meal -> expand an ingredient card
- What to quickly test: Import the chicken caesar pasta recipe, expand `short pasta`, and confirm there is no `Serving size options` row. Confirm `Amount` and `Serving size` are still editable and macros update when amount is changed.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-13 15:46 AEDT
- What changed: Fixed favorites ordering + naming consistency. Ordering now uses real usage time (not edit/update time), `All` now reuses the saved favorite/custom title when matched, and each row now shows `Last used ...` date/time so order is easy to verify.
- Where to see it (page/link): Food Diary -> Add from favorites (`/food?open=favorites`)
- What to quickly test: Add one older favorite and one newer favorite to diary, reopen the picker, and confirm newest is at top in `All`, `Favorites`, and `Custom`. Confirm chicken entry label in `All` matches saved `Chicken Breast` title.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-13 15:35 AEDT
- What changed: Rewrote the Smart Health Coach explanation line to be clearer in plain English. It now states we use food, water, activity, and mood logs, and gives clear examples of patterns that can trigger alerts (like low hydration or missed check-ins), including up to 5 alerts/day.
- Where to see it (page/link): Notifications -> Smart Health Coach (`/notifications/ai-insights`) and Health Tips settings (`/health-tips`)
- What to quickly test: Open either page and confirm the new explanation text appears under the Smart Health Coach toggle.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-13 15:13 AEDT
- What changed: Fixed Favorites ordering backfill so older diary usage now updates recency order too. If a meal was used earlier (for example this morning), it now gets pulled to the top in `All`, `Favorites`, and `Custom` instead of relying only on newly stamped usage.
- Where to see it (page/link): Food Diary -> Add from favorites (`/food?open=favorites`)
- What to quickly test: Add an older favorite/custom meal that was already used earlier today, reopen Add from favorites, and confirm it appears at/near the top in all three tabs. Refresh and confirm order stays.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-13 15:06 AEDT
- What changed: Smart Health Coach alert timing is now fully automatic. Removed `Number of checks per day` and `Time 1/2/3` controls from settings so users no longer choose alert count or times. Timezone is still shown and can still be changed manually.
- Where to see it (page/link): Notifications -> Smart Health Coach (`/notifications/ai-insights`) and Health Tips (`/health-tips`)
- What to quickly test: Open Smart Health Coach settings and confirm there is no checks dropdown and no time inputs. Confirm timezone is still visible and can be changed/saved.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-13 14:55 AEDT
- What changed: Fixed Favorites picker ordering so the most recently used saved meal now goes to the top. When you add a favorite/custom meal to Food Diary, it now stamps a `last used` time and `All`, `Favorites`, and `Custom` tabs sort by that first.
- Where to see it (page/link): Food Diary -> Add from favorites (`/food?open=favorites`)
- What to quickly test: In `Custom` (or `Favorites`) pick an item that is not first, add it to diary, reopen Add from favorites, and confirm that item is now first in `All`, `Favorites`, and `Custom`.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-13 14:45 AEDT
- What changed: Fixed Smart Health Coach timezone auto-detect so it now uses your current device/browser timezone in auto mode (for example Melbourne), instead of keeping old stale values like Africa/Abidjan. Manual timezone override still works and is saved when you choose it.
- Where to see it (page/link): Notifications -> Smart Health Coach (`/notifications/ai-insights`) and Health Tips (`/health-tips`)
- What to quickly test: Open Smart Health Coach settings and confirm timezone now shows Melbourne (if your device is set to Melbourne). Then change timezone manually, save, refresh, and confirm your manual choice stays.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-13 15:23 AEDT
- What changed: Restored ingredient amount editing for imported recipes. Imported cards still show clear full recipe amount + portion amount, and now users can again change Amount and Serving size/unit (g, oz, tsp, tbsp, cup, etc.) from the dropdown controls.
- Where to see it (page/link): Food Diary -> Add meal -> Import Recipe -> Continue to Build a meal -> expand an ingredient card
- What to quickly test: Expand `short pasta` and confirm Amount + Serving size controls are back. Change 250 g to 200 g (or switch to oz) and confirm ingredient macros/totals update.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-13 14:41 AEDT
- What changed: Simplified imported recipe ingredient cards to reduce confusion. Cards now show `Full recipe amount` and `Portion amount` clearly, hide serving-size dropdown/amount editing controls in import mode, and show ingredient macros for the full recipe amount.
- Where to see it (page/link): Food Diary -> Add meal -> Import Recipe -> Continue to Build a meal -> Your ingredients
- What to quickly test: Import the chicken caesar pasta recipe and expand `short pasta`. Confirm it shows `Full recipe amount: 250 g`, `Portion amount: 62.5 g`, and full-amount macros (about `928 kcal`) with no serving-size options dropdown.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-13 14:17 AEDT
- What changed: Smart Health Coach now auto-detects timezone by default from the user device/location request, while still allowing manual timezone change. Removed old focus-area tick boxes so Smart Health Coach now runs as one unified coach across all alert signals.
- Where to see it (page/link): Notifications -> Smart Health Coach and Health Tips settings
- What to quickly test: Open Smart Health Coach settings and confirm timezone is pre-filled automatically. Confirm there are no focus-area tick boxes. Change timezone manually and save to verify override still works.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-13 14:09 AEDT
- What changed: Updated agent guard rails so Food Diary/Favorites/Custom rename logic is explicitly locked. Agents must get your written approval before touching rename code. Routine rename canary checks were removed; rename canary is now optional troubleshooting only when you request it.
- Where to see it (page/link): Internal docs only: `GUARD_RAILS.md`, `AGENTS.md`, `DEPLOYMENT_PROTOCOL.md`
- What to quickly test: Open those files and confirm wording says rename area is locked and rename canary is optional (not mandatory every deploy).

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-13 13:35 AEDT
- What changed: Added a permanent Food Rename Guard safety system. New live canary now tests rename from Edit Entry and Favorites/Custom, checks instant + refresh behavior, confirms diary/favorite API sync, and auto-restores the original title after test. Added deploy gate so agents can run this automatically after deploy.
- Where to see it (page/link): Food Diary rename flows on https://helfi.ai/food and scripts `scripts/check-rename-guard.sh` + `scripts/check-deployment-status.sh` (with `RUN_RENAME_GUARD=1`)
- What to quickly test: Run `CANARY_STORAGE_STATE=\"playwright/.auth/<user>.json\" ./scripts/check-rename-guard.sh` and confirm it passes; then run `RUN_RENAME_GUARD=1 CANARY_STORAGE_STATE=\"playwright/.auth/<user>.json\" ./scripts/check-deployment-status.sh` after a push and confirm both deployment and rename guard pass.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-13 14:03 AEDT
- What changed: Fixed portion math display inside ingredient cards. Ingredient macro chips now scale to the selected portion (for example 1 serving of 4), so per-item calories/macros no longer show full-recipe values while portion amount shows scaled values.
- Where to see it (page/link): Food Diary -> Add meal -> Import Recipe -> Continue to Build a meal -> expand an ingredient card
- What to quickly test: Import the chicken caesar pasta recipe, keep portion at 1 serving, expand `short pasta`, and confirm it shows `Amount (full recipe): 250 g`, `Portion amount: 62.5 g`, and about `232 kcal` (not ~928 kcal). Re-import same link and confirm count stays at 15 items.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-13 13:12 AEDT
- What changed: Fixed recipe import quantity parsing so compact units like `250g`, `500g`, `2 tbs`, `180ml`, and `(20g)` are read correctly instead of falling back to default amounts. Added clear per-ingredient display showing both full recipe amount and portion amount so serving math is visible.
- Where to see it (page/link): Food Diary -> Add meal -> Import Recipe -> Continue to Build a meal
- What to quickly test: Import the chicken caesar pasta recipe, keep portion at 1 serving (recipe has 4 servings), and confirm first ingredient shows full recipe amount `250 g` and portion amount `62.5 g`. Re-import same link and confirm ingredient count stays at 15 (no duplicates).

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-13 12:19 AEDT
- What changed: Renamed AI insights to Smart Health Coach across menu/settings/notification pages, added mandatory pricing warning before enable, and launched paid Smart Coach alert rules with strict caps (10 credits per sent alert, max 50 credits/day) plus cooldown and logging safeguards.
- Where to see it (page/link): Notifications -> Smart Health Coach and Health Tips pages
- What to quickly test: Turn Smart Health Coach on and confirm the warning popup shows pricing/cap details before enabling. Send/trigger one coach alert and confirm credits only deduct when an alert is actually sent.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-13 12:06 AEDT
- What changed: Recipe import now force-clears old Build a meal draft state at import start and blocks draft re-apply after import starts. This prevents stale pre-fix draft cards from being merged in and causing duplicate ingredient cards on repeat import.
- Where to see it (page/link): Food Diary -> Add to Breakfast/Lunch/Dinner -> Import Recipe -> Continue to Build a meal
- What to quickly test: Import the same recipe URL twice in a row and confirm Your ingredients count stays the same (no duplicate rows added).

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-13 02:47 AEDT
- What changed: Fixed recipe import duplicate protection so repeated imports now use a stable hidden import key per ingredient line. This blocks re-adding the same ingredient cards when the same recipe URL is imported again. Also added server-side ingredient line dedupe in recipe import API as a safety layer.
- Where to see it (page/link): Food Diary -> + menu -> Import Recipe -> Continue to Build a meal
- What to quickly test: Import one recipe URL, continue to Build a meal, then import the same URL again and confirm no ingredient cards are duplicated.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-13 11:53 AEDT
- What changed: Follow-up fix for rename not sticking. Edit Entry rename now updates the correct diary row using stronger matching (not id-only), and server-save now finds the row by source/barcode fallback so renamed titles persist after refresh.
- Where to see it (page/link): Food Diary -> entry menu -> Edit Entry (also check Favorites/All/Custom sync)
- What to quickly test: Rename “Green’s gluten free chocolate cake mix” to a new name, tap Update Entry, confirm it changes immediately in diary list, then refresh page and confirm it stays renamed.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-13 02:35 AEDT
- What changed: Fixed rename sync so changing a food name from Diary/Favorites/Custom updates more reliably across Food Diary, Favorites, and All. Also fixed diary row label priority so a fresh rename is not overwritten by an old favorite title.
- Where to see it (page/link): Food Diary -> Edit Entry, and Food Diary -> Add from favorites (Favorites/Custom/All tabs)
- What to quickly test: Rename one item in Food Diary and confirm instant update in list + after refresh; rename same item in Favorites (or Custom) and confirm the name updates everywhere.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-13 02:08 AEDT
- What changed: Fixed recipe import duplicate ingredient issue. Re-importing the same recipe URL now skips repeated ingredient lines and also skips ingredients already present in the current Build a meal list, so items do not get doubled.
- Where to see it (page/link): Food Diary -> + menu -> Import Recipe -> Continue to Build a meal
- What to quickly test: Import one recipe URL, then import the same URL again and confirm ingredient cards are not duplicated.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-13 01:55 AEDT
- What changed: Fixed Food Diary hot chocolate icon regression and rename propagation fallback. Hot chocolate now always classifies as a drink in meal rows, and rename updates now sync using sourceId/barcode fallback when favoriteId is missing.
- Where to see it (page/link): Food Diary meal list and Food Diary item rename flow (Diary + Favorites)
- What to quickly test: Add hot chocolate from favorites/water flow and confirm drink icon + ml amount shows. Rename a diary item and confirm the new name appears across Diary/Favorites.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-13 01:07 AEDT
- What changed: Fixed Food Diary drink/favorite regressions. Drink entries now keep the correct drink icon + amount label even when drink metadata is split across fields, and renaming from Diary or Favorites now syncs more reliably across Diary/Favorites using favorite ID, source ID, and barcode matching.
- Where to see it (page/link): Food Diary meal list + Food Diary -> Add from favorites
- What to quickly test: Add Hot chocolate from Water -> Favorites and confirm it keeps the hot chocolate icon + 500 ml in Food Diary. Rename an entry from Diary and from Favorites and confirm the new name appears across both areas.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-13 00:13 AEDT
- What changed: Recipe import now auto-resolves missing ingredients using AI nutrition fallback and saves them as reusable custom foods for future matches. Build a meal portion-size box now shows live calories/macros directly in that section while servings/amount change.
- Where to see it (page/link): Food Diary -> + menu -> Import Recipe -> Continue to Build a meal
- What to quickly test: Import a recipe with a previously missing ingredient and confirm it auto-adds instead of manual-only; then change serving amount and confirm calories/protein/carbs/fat/fibre/sugar update live inside the portion-size card.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-12 23:59 AEDT
- What changed: Barcode scanner visual tweak only. Darkened the area outside the scan frame again so the barcode target window stands out clearly, while keeping the recent one-scan fix unchanged.
- Where to see it (page/link): Food Diary -> Add food -> Barcode Scanner
- What to quickly test: Open scanner and confirm outside area is darker again while barcode still scans and saves on first try.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-12 22:32 AEDT
- What changed: Fixed Food Diary barcode scanner so one successful scan is enough. The scanner now closes as soon as a product match is found, then saves the item in the background, and avoids unnecessary camera restarts during lookup retries.
- Where to see it (page/link): Food Diary -> Add food -> Barcode Scanner
- What to quickly test: Scan one packaged food barcode once and confirm it closes immediately and adds the item without forcing a second scan.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-12 22:01 AEDT
- What changed: Sped up recipe-import meal building. Ingredient matching now runs with faster candidate prioritization, fewer heavy lookups, parallel search attempts, and per-request timeouts to prevent long stalls. Also shows manual-match ingredient list live while building.
- Where to see it (page/link): Food Diary -> Import Recipe -> Continue to Build a meal
- What to quickly test: Import the same Delicious recipe and confirm the build counter moves quickly (not stuck on 0/1 for minutes) and ingredients/manual-match updates appear during the build.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-12 21:35 AEDT
- What changed: Fixed recipe URL import for anti-bot blocked sites by adding a browser-side fallback. If server fetch is blocked (403), the app now pulls readable page text in-browser and sends it to the importer, so recipe import can still complete.
- Where to see it (page/link): Food Diary -> + menu -> Import Recipe -> Import by URL
- What to quickly test: Import this URL and confirm the review form loads instead of red error: https://www.delicious.com.au/recipes/pork-mince-salad-larb-roti-recipe/i6n58sei?r=recipes/collections/1vo4q819

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-12 20:43 AEDT
- What changed: Fixed recipe URL import reliability for blocked/tracking-heavy links. Import now uses one strong page fetch path (with browser-style headers), retries a clean URL without tracking query text, and reuses the same loaded page for extraction so it no longer fails on a second weaker fetch.
- Where to see it (page/link): Food Diary -> + menu -> Import Recipe -> Import by URL
- What to quickly test: Paste this link and import: https://www.delicious.com.au/recipes/pork-mince-salad-larb-roti-recipe/i6n58sei?r=recipes/collections/1vo4q819

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-12 18:06 AEDT
- What changed: Cleaned recipe-import ingredient matching so imported ingredient card names stay aligned to recipe wording, and weak/unrelated auto-matches are now rejected (they go to manual match list instead of adding wrong foods).
- Where to see it (page/link): Food Diary -> Import Recipe -> Continue to Build a meal
- What to quickly test: Import a recipe URL, check ingredient cards keep understandable recipe names, and confirm obviously wrong foods are no longer auto-added.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-12 17:04 AEDT
- What changed: Fixed recipe-import portion default so Build a meal now reliably starts at 1 serving (not stale values like 4 g). Prevented old draft restore from overriding recipe-import defaults.
- Where to see it (page/link): Food Diary -> Import Recipe -> Continue to Build a meal
- What to quickly test: Import a recipe that has servings (for example 8 servings) and confirm Portion size defaults to serving unit with 1 serving, not grams.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-12 16:54 AEDT
- What changed: Simplified recipe-import flow. Import Recipe now has one button only (Continue to Build a meal). In Build a meal for imported recipes, users now get a clear Save to favorites (Custom meals) Yes/No toggle before pressing Save meal.
- Where to see it (page/link): Food Diary -> Import Recipe -> Continue to Build a meal -> Build a meal (portion card)
- What to quickly test: Import any recipe, confirm only one Continue button exists, then on Build a meal toggle Save to favorites to Yes and press Save meal; confirm the saved meal appears in Favorites -> Custom.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-12 16:47 AEDT
- What changed: Fixed produce size-unit matching in Food Diary Change amount so plural produce names (for example peaches/apples/oranges/tomatoes) now correctly show small/medium/large/extra large options where that food supports them.
- Where to see it (page/link): Food Diary -> Add from favorites -> Preview -> Change amount
- What to quickly test: Open a produce item like peaches or apples, open Weight/size dropdown, and confirm size options (small/medium/large/extra large) are available with grams.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-12 12:18 AEDT
- What changed: Fixed Food Diary “Import Recipe” menu placement. It now shows once only and appears directly under “Build a meal” (removed duplicate entries).
- Where to see it (page/link): Food Diary -> tap + on any meal section menu
- What to quickly test: Open the + menu and confirm “Import Recipe” is directly under “Build a meal” and appears only once.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-12 13:58 AEDT
- What changed: Favorites “Change amount” now starts with ingredients collapsed, each ingredient shows its own macro values, egg size dropdown labels now include grams, and non-drink meals no longer show drink icons/amount labels from stale drink metadata.
- Where to see it (page/link): Food Diary -> Add from favorites -> Preview -> Change amount, and Food Diary meal list cards
- What to quickly test: In Change amount, confirm ingredients are collapsed first, tap to expand controls, see per-ingredient macros, and check egg unit dropdown shows weights. In Meals list, confirm breakfast/custom meals show food icon (not hot chocolate icon) unless it is truly a drink.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-12 04:34 AEDT
- What changed: Fixed blank “Weight / size” values in Favorites -> Preview -> Change amount. The field now auto-fills from the current servings and selected unit when a saved weight is not already present.
- Where to see it (page/link): Food Diary -> Add from favorites -> Preview -> Change amount
- What to quickly test: Open Change amount on a favorite meal and confirm each ingredient now shows a corresponding weight value instead of an empty box.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-12 02:42 AEDT
- What changed: Follow-up fix for Favorites Preview -> Change amount. Replaced the limited servings-only controls with full item amount controls where available (serving dropdowns like small/medium/large, weight/size unit dropdowns, pieces + servings, and weight input), matching normal entry edit behavior.
- Where to see it (page/link): Food Diary -> Add from favorites -> Preview -> Change amount
- What to quickly test: Open Change amount for items that have serving options and confirm you can switch serving type (e.g., small/medium/large), adjust grams/pieces/units, and see totals update before Add.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-12 02:17 AEDT
- What changed: Favorites Preview now has instant Add + new full-page Change amount flow. Users can adjust ingredient/portion amounts before adding, and there is now a Cancel button that exits the whole process back to Food Diary.
- Where to see it (page/link): Food Diary -> Add from favorites -> select item -> Preview
- What to quickly test: In Preview, tap Change amount, adjust amounts, confirm macros/daily totals update live, then tap Add. Also verify Cancel exits directly back to Food Diary.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-12 00:03 AEDT
- What changed: Completed a desktop Food Diary UI sweep and fixed full-screen overlay layout issues so desktop content no longer sits under the left menu. Also reduced oversized desktop preview layout width in Favorites Preview.
- Where to see it (page/link): Food Diary desktop flows (especially Favorites Preview, Favorites picker, Multi-copy, Barcode scanner, Health-check page, and Build Meal overlays)
- What to quickly test: On desktop, open each Food Diary full-screen flow and confirm the left menu remains visible and content is fully readable (no left-side clipping/cutoff).

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-11 02:51 AEDT
- What changed: Fixed manual exercise saving in Food Diary → Add exercise (more robust save + clearer error message if something still fails).
- Where to see it (page/link): Food Diary → Exercise → Add exercise
- What to quickly test: Add a manual exercise and tap Save. If it fails, confirm the red error message now includes a short “DB error (…)” hint.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-11 02:27 AEDT
- What changed: Fixed Food Diary → Add exercise on desktop so it no longer hides the left-hand menu (the Add exercise screen now stays inside the main content area).
- Where to see it (page/link): Food Diary → Exercise → Add exercise
- What to quickly test: On desktop, open Add exercise and confirm the left menu stays visible. Close the Add exercise screen and confirm you return to the Food Diary as normal.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-11 02:14 AEDT
- What changed: Fixed the Food Diary “Add exercise” screen header so “Reset” and the close “X” are positioned correctly on desktop (the Add exercise screen now sits above the left menu instead of underneath it).
- Where to see it (page/link): Food Diary → Exercise → Add exercise
- What to quickly test: On desktop, open Add exercise and confirm the left menu doesn’t overlap the Add exercise screen, and the header buttons look aligned.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-11 01:15 AEDT
- What changed: Made Food Diary manual exercise saving more reliable (aimed to prevent “Failed to save exercise”).
- Where to see it (page/link): Food Diary → Exercise → Add exercise → Save
- What to quickly test: Add a manual exercise (distance + duration + calories) and confirm it saves; then add a second manual exercise and confirm that also saves.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-11 19:04 AEDT
- What changed: On mobile, “Adjust ingredient” now opens full-screen so the amount/unit (grams) fields are fully visible and not cut off.
- Where to see it (page/link): Food Diary → Add ingredient → tap Add on an ingredient (Adjust ingredient screen)
- What to quickly test: On mobile, open Adjust ingredient and confirm the amount input + unit dropdown fit fully on screen.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-11 14:01 AEDT
- What changed: Root-cause fix for desktop/mobile mismatch in Exercise. Food Diary now always refreshes exercise entries from server (not stale local cache), so manual exercise logged on desktop should appear on mobile too. Also fixed weird summary text showing “\\u2019”.
- Where to see it (page/link): Food Diary (desktop + mobile PWA), same date
- What to quickly test: Add manual exercise on desktop, refresh mobile PWA on same date, confirm exercise appears and burned calories/remaining match.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-11 12:52 AEDT
- What changed: Exercise list now always shows the delete (trash) button for every entry (including Apple Health entries), even when only 1 entry is left. Add (+) exercise button is always available.
- Where to see it (page/link): Food Diary → Exercise list
- What to quickly test: When only 1 exercise entry remains, confirm the trash icon is still visible and works.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-11 12:38 AEDT
- What changed: Exercise delete button now gives clear visual feedback (turns red and disables briefly) so it’s obvious the delete click worked.
- Where to see it (page/link): Food Diary → Exercise list → trash/delete icon on a Manual exercise entry
- What to quickly test: Click the trash icon on a Manual exercise entry and confirm the icon lights red while deleting, then the entry disappears.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-11 12:21 AEDT
- What changed: Fixed exercise logging crash caused by Apple Health imported entries. The app can now read exercise entries with source “APPLE_HEALTH”, so saving and loading exercise should work again.
- Where to see it (page/link): Food Diary → Exercise → Add exercise
- What to quickly test: Try saving a manual exercise again. Also open Exercise list for that day and confirm it loads (no red error).

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-11 03:35 AEDT
- What changed: Exercise Save errors now show a more detailed “ref” code so we can identify exactly where the server is failing (example: EX500/health_profile). This helps us fix the root cause quickly.
- Where to see it (page/link): Food Diary → Exercise → Add exercise
- What to quickly test: Try Save again and tell us the full red error message (including the new ref code).

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-11 03:15 AEDT
- What changed: Fixed manual exercise logging so Save no longer fails silently. If saving fails, you should now see a more helpful red error message (instead of just “Failed to save exercise”).
- Where to see it (page/link): Food Diary → Exercise → Add exercise
- What to quickly test: Pick an exercise, enter duration, press Save. If it fails, check the red error message now shows the reason (or “ref: EX500”).

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-11 00:51 AEDT
- What changed: In Food Diary → Add from favorites (All/Favorites/Custom), the Preview now opens a full-screen page that combines the meal macro cards + the daily progress bars (as-if you add it). The old “Preview overall macros” option was removed.
- Where to see it (page/link): Food Diary → + → Add from favorites → tap an item → Preview
- What to quickly test: From All/Favorites/Custom tabs, open Preview (check it is full-screen with Back + Add). Tap Back (returns to the small action pop-up). Tap Add (adds the meal and returns to Food Diary).

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-10 23:37 AEDT
- What changed: Fixed barcode scanning so it won’t randomly force a 2nd scan, and fixed the “500ml cup size gets stuck onto barcode foods” issue (drink amount no longer overwrites a barcode food’s serving size/macros when the food is measured in grams, like powders).
- Where to see it (page/link): Food Diary → Scan barcode (also when scanning from the water/liquids flow)
- What to quickly test: Scan a normal packaged food once (it should add after 1 scan). Then from the water/liquids flow set a cup size (e.g. 500ml) and scan a powder barcode (hot chocolate) and confirm the serving size stays in grams (not forced to 500) and the scanner doesn’t reopen by itself.

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-10 21:08 AEDT
- What changed: Added “Import Recipe” under “Build a meal” so you can import a recipe from a URL or a photo (recipe book page), auto-fill Build a meal with ingredient cards (calories/macros + totals), and optionally save the cooking steps.
- Where to see it (page/link): Food Diary → + → Build a meal → Import Recipe
- What to quickly test: Import by URL; import by photo; confirm ingredients have calories/macros and the totals look right; save to diary; open the entry and confirm the Recipe tab shows steps (only if you chose “Continue + Save recipe”).

DEPLOYED:
- LIVE or STAGING: LIVE
- Date/time: 2026-02-10 20:36 AEDT
- What changed: Renamed Favorites (like “Chicken breast”) should now stay as the short name in the Food Diary list and in Add from favorites (no more randomly showing the long USDA/database name again after refresh).
- Where to see it (page/link): Food Diary list + Food Diary -> Add from favorites -> Favorites tab
- What to quickly test: Rename a Favorite to a short name. Refresh. Confirm it stays short in the Favorites tab and in your Food Diary list after adding it.

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
DEPLOYED:
- LIVE:
- Date/time: 2026-02-10 22:07 AEDT
- What changed: Fixed renamed Favorites sometimes reverting back to long USDA names after refresh (we now always load the newest saved Favorites + name-override record).
- Where to see it (page/link): Food Diary (`/food`) and “Add from favorites” list.
- What to quickly test: Rename a Favorite to “Chicken breast”, refresh the page, confirm Favorites + Food Diary lists stay short (no long USDA title).
