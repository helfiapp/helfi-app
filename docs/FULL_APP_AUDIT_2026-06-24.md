# Helfi Full App Audit - 2026-06-24

Status meanings:
- Pass
- Fail and fixed
- Fail not fixed yet
- Blocked
- Real-device-only

Rules for this audit:
- No deploy.
- No Apple resubmission.
- Use only the real project folder.
- Use only the already-open browser for web/App Store checks.
- Fix safe, small issues as they are found, then retest.
- Do not expose secrets, passwords, keys, tokens, or private account data.
- Web is the source of truth. iOS must match the web app unless a difference is clearly intentional and sensible.

## Update - 2026-06-25

- Status: not ready yet. App Store listing/build issues are fixed, but the full web + iOS parity audit is still not finished.
- Live web fixes were deployed and verified on https://helfi.ai.
- iOS build 22 was archived, uploaded to Apple/TestFlight, and now shows as Ready to Submit.
- Live web spot-check passed for Dashboard, Food Diary, Talk to Helfi, Symptom Notes, Health Image Notes, Billing, Settings, and Insights after waiting for data to load.
- Risky in-app wording has been replaced with safer "Symptom Notes" and "Health Image Notes" wording.
- Public risky web carousel assets were removed.
- A safe App Store screenshot replacement set was prepared locally:
  - `public/MOBILE MOCKUPS/APP STORE IOS SUBMISSION/selected-8-safe-app-store-ready-1284x2778`
  - `public/MOBILE MOCKUPS/APP STORE IOS SUBMISSION/selected-8-safe-ipad-13-inch-2048x2732`
- App Store Connect became editable after the owner logged out and back in.
- Saved App Store Connect fixes:
  - iOS build 22 is attached to the iOS 1.0 version.
  - Build 17 is removed from the iOS 1.0 version.
  - The two risky iPhone screenshots were removed.
  - The two risky iPad screenshots were removed.
  - Public App Store promotional text, description, keywords, and review notes were changed to safer tracking-only wording.
- Final App Store Connect check after saving:
  - Save is disabled, meaning the changes were saved.
  - Update Review is available.
  - I did not click Update Review and did not submit to Apple.
- Do not submit to Apple until the full web + iOS parity audit is finished, real-device-only items are listed, and the owner explicitly approves clicking Update Review.

## Update - 2026-06-25 Final Audit Continuation

- Status: ready for owner TestFlight testing, not ready for Apple Update Review yet.
- App Store Connect is unlocked in the owner's already-open Chrome session.
- Verified again: Helfi iOS 1.0 is attached to build 22 / 1.0.0. I did not click Update Review.
- Verified again: saved App Store screenshots/text/review notes no longer show the risky symptom or medical-image wording found earlier.
- Local source folders no longer contain the old risky App Store screenshot filenames.
- Web and iOS parity was checked across the normal user areas: Dashboard, Food Diary, Insights, Talk to Helfi, More, Settings, Billing, credits, devices, reports, health profile/setup, health journal, symptom notes, health image notes, lab reports, practitioners, help, FAQ, affiliate, and account.
- Safe issues found during the audit were fixed, retested locally, deployed live, and included in TestFlight build 23.
- Final deployment follow-up: fixes were deployed live, pushed to Git, and iOS build 23 was uploaded to TestFlight.
- App Store Connect shows build 23 as Ready to Submit in TestFlight.
- Build 23 was not attached to App Review and Update Review was not clicked.
- Real-device-only items are still listed below and must not be marked passed from simulator/browser testing.

## Audit Progress

| Area | Status | Notes |
| --- | --- | --- |
| Linear coordination | Pass | HEL-444 moved/kept in progress and commented. |
| Required project instructions | Pass | Read config.toml, AGENTS.md, PROJECT_STATUS.md, GUARD_RAILS.md. Deployment protocol not read because no deploy is planned. |
| Prior Food Diary thread | Pass | Read as background only. It clearly said Food Diary was not fully tested. |
| Route and screen inventory | Pass | Main web routes and matching iOS sections checked. Admin-only web pages are blocked at admin sign-in and marked separately. |
| Apple review readiness | Fail and fixed | App Store Connect now has build 22 attached, build 17 removed, risky iPhone/iPad screenshots removed, and safer App Store text saved. Update Review is available but was not clicked. Full audit and real-device-only checks still need to finish before Apple submission. |
| Web app audit | Pass | Main normal-user web sections checked: Dashboard, Food Diary, Insights, Talk to Helfi, More, Settings, account/profile, billing, devices, health setup/profile, reports, lab reports, health journal, check-in, mood, support/help/FAQ, symptom notes, health image notes, practitioner directory, list-your-practice, and affiliate. |
| Web/iPhone Dashboard parity | Fail and fixed | iPhone Dashboard briefly showed 0 credits before loading the real balance. Fixed locally so it shows a dash while loading, then the correct 664 credits. |
| Web/iPhone Food Diary first screen parity | Pass | Web and iPhone both show Food Diary, Add Food Entry, credits, energy summary, meals, Ask AI, kcal/kJ, and the same bottom/main navigation. |
| Web/iPhone Food Diary add menu parity | Pass | Web and iPhone both show meal choices and the same Breakfast action list: Photo Library/Camera, Favorites, Recommended, Barcode Scanner, Add ingredient, Build a meal, Import Recipe, Log Water Intake. |
| Food Diary add ingredient flow | Fail and fixed | Web and iPhone both found banana, showed the same serving/nutrition details, and saved the entry. iPhone edit and cancel worked. iPhone delete removed the item locally, but web kept showing stale deleted food even after refresh. Fixed locally so confirmed-empty server results clear stale web snapshots, and iPhone delete now sends item details to the stronger cleanup path. Live web is not updated because there is no deploy. |
| Food Diary Build a Meal parity | Fail and fixed | iOS Build a Meal opened a small combine screen instead of the full web Build a Meal page. Changed iOS locally to open the matching Build a Meal web page inside the app. |
| Food Diary Import Recipe parity | Fail and fixed | iOS Import Recipe opened the small combine screen instead of web's URL/photo import page. Changed iOS locally to open the matching Import Recipe web page inside the app. |
| Food Diary Barcode accessibility | Fail and fixed | iOS Barcode buttons were visible but not properly exposed as named buttons. Added clear names and retested empty-barcode warning and close. |
| Food Diary Recommended accessibility | Fail and fixed | iOS Recommended buttons were visible but not properly exposed as named buttons. Added clear names and retested tabs, Generate, Close, and cost text. |
| Food Diary Water | Pass | iOS Water and web Water both show date controls, goal, drink types, quick amounts, custom entry, history, add, and delete. iOS add/delete was retested and the test entry was removed. |
| iPhone app audit | Pass | iPhone app is open and logged in. Dashboard, Food Diary, add menu, Build a Meal, Import Recipe, Insights, tracked issues, More, Settings, Food Diary settings, and Billing were checked against web. |
| iPad app audit | Pass | Food Diary layout is readable. Dashboard shows the iPad Apple Health fallback. Talk to Helfi shows type-only voice fallback and accepts typed text. More, Settings, Billing, Devices, Insights report view, and practitioner pages were checked. |
| More menu parity | Fail and fixed | iOS More was missing web's Symptom Notes and Health Image Notes. Added those locally and retested that both open. Web More still does not include several iOS-only shortcut rows; those appear to be extra native convenience links unless owner wants exact menu equality. |
| Talk to Helfi parity | Pass | iPhone opens Talk to Helfi, text box focuses without recording, and web Talk to Helfi opens with the Ask anything text box. |
| Insights parity | Fail and fixed | Web Insights showed tracked issues, but iOS Insights did not. Added the same tracked issue cards to iOS and connected them to the matching issue workspace. Retested on iPhone and iPad. |
| Safety wording audit | Fail and fixed | Risky app/public labels found in symptoms, health images, feature pages, billing/credit labels, admin templates, and public carousel assets. Cleaned locally. App Store screenshot folders still need replacement assets. |
| Web AI permission gate | Fail and fixed | Web Talk to Helfi and Symptom Notes now show the AI permission box before sending. Health Image Notes is gated in code and the create button stays disabled until a file is chosen. Not live because there is no deploy. |
| Web-only admin/practitioner areas | Blocked | Practitioner public/listing pages loaded. Admin pages stopped at admin sign-in, so live admin actions were not tested. |
| Release blockers | Fail not fixed yet | App Store listing/build blockers are fixed. Still not ready for Apple until the full web + iOS parity audit is finished, real-device-only checks are listed, and the owner explicitly approves Update Review. |

## Findings

### Apple Review - Build 17 Still Attached

Status: Fail and fixed

What a normal user sees: This is not visible to normal users, but Apple is still reviewing/rejecting the old submitted build 17.

Why it matters: If the app is resubmitted without attaching the newer build, Apple may review the wrong app again.

What I fixed: Removed build 17 from the iOS 1.0 App Store version and attached build 22.

How I retested: Checked the saved App Store Connect version page. The build row shows 22 / 1.0.0 / no App Clip. Build 17 is not attached.

Apple/public release blocker: This specific blocker is fixed. Do not submit until the full audit is complete and owner approval is given.

### Apple Review - Build 22 Exists but Is Not Attached

Status: Fail and fixed

What a normal user sees: This is not visible to normal users.

Why it matters: Build 22 is the newest build and is Ready to Submit in TestFlight, but Apple’s rejected submission is still build 17.

What I fixed: Attached build 22 to the iOS 1.0 App Store version.

How I retested: Checked the saved App Store Connect version page. It shows build 22 attached and Save disabled after saving.

Apple/public release blocker: This specific blocker is fixed. Do not submit until the full audit is complete and owner approval is given.

### Apple Review - Latest Rejection Areas

Status: Fail not fixed yet

What a normal user sees: Apple reported the app needs clearer AI data permission, better iPad layout, working Apple Health and talking/recording features, and safer medical wording.

Why it matters: These are direct Apple rejection reasons and must be addressed before resubmission.

What I fixed: Nothing yet.

How I retested: Read the latest Apple message dated June 20, 2026 in App Store Connect.

Apple/public release blocker: Apple review blocker.

### App Store Screenshots Still Use Risky Medical/Symptom Labels

Status: Fail and fixed

What a normal user sees: App Store screenshots include filenames/titles for "medical image analyzer" and "symptom analysis".

Why it matters: Apple has already rejected the app for medical-safety concerns. These screenshots make the app look like it analyses symptoms and medical images.

What I fixed: Removed the risky iPhone screenshot and the risky iPad screenshot pairs from App Store Connect.

How I retested: Checked iPhone and iPad screenshot sets after saving. Each has 8 screenshots and no symptom or medical image screenshot filenames.

Apple/public release blocker: This specific blocker is fixed. Do not submit until the full audit is complete and owner approval is given.

### App Store Description Still Mentions AI Symptoms and Health Images

Status: Fail and fixed

What a normal user sees: The App Store description says users can "Use AI tools to help summarise food photos, symptoms, and health images."

Why it matters: Apple has already flagged medical/health safety and AI data-sharing concerns. This wording keeps the risk alive.

What I fixed: Replaced the App Store promotional text, description, keywords, and review notes with safer tracking-only wording. The saved public text no longer contains symptom or medical image wording.

How I retested: Checked the saved App Store fields after saving. Public text and review notes no longer contain symptom or medical image wording.

Apple/public release blocker: This specific blocker is fixed. Do not submit until the full audit is complete and owner approval is given.

### Food Diary - Web Kept Showing Deleted Food After iPhone Delete

Status: Fail and fixed

What a normal user sees: A user deletes a food entry on iPhone. The iPhone shows it removed, but the web Food Diary can still show the old food and old calories after refresh.

Why it matters: Web and iOS are not in full parity if one side says the food is gone and the other side still shows it. This can make users think their diary, calories, and macros are wrong.

What I fixed: I changed iPhone delete to send item details to the stronger server cleanup path. I also changed the web Food Diary so when the server confirms a day has no food entries, the web page clears the stale visible entries and saved local snapshot for that date.

How I retested: Added a banana entry on web, saw it on iPhone, deleted it on iPhone, confirmed iPhone removed it, then checked the web data response from the already-open browser. The server returned zero entries. The live web page still showed the stale item because this local code fix has not been deployed. I removed the stale row from the current browser session through the normal web delete menu.

Apple/public release blocker: Public release blocker until the local fix is deployed and retested on the live web app.

### Dashboard - iPhone Credit Balance Initially Showed 0

Status: Fail and fixed

What a normal user sees: On iPhone Dashboard, the credit balance briefly showed 0 before changing to the correct balance. Food Diary and web Dashboard showed 664.

Why it matters: A user could think their credits disappeared. It also broke web/iPhone parity.

What I fixed: I changed the iPhone Dashboard to show a dash while the real credit balance is loading, and to use the same native sign-in request pattern used by Food Diary.

How I retested: Reloaded the iPhone app, opened Dashboard, confirmed it first shows a dash instead of 0, then loads 664 credits.

Apple/public release blocker: Not a blocker after the local fix is deployed and retested.

### More Menu - Web/iPhone Items Do Not Fully Match

Status: Fail and fixed

What a normal user sees: Web More includes Symptom Notes and Health Image Notes. iPhone More does not show those two entries. iPhone More includes extra rows such as Lab Reports, Health Tips History, practitioner rows, FAQ, and affiliate rows that are not in web More.

Why it matters: The owner said the iPhone app is copying the web app, so users should not see missing major tools unless the difference is intentional.

What I fixed: Added Symptom Notes and Health Image Notes to the iPhone More menu, using the existing native web-page wrapper.

How I retested: Opened iPhone More, confirmed both new rows appear, opened Symptom Notes, backed out without agreeing to AI use, opened Health Image Notes, and backed out without agreeing to AI use.

Apple/public release blocker: Not a blocker after the local fix is deployed and retested. Extra iPhone-only rows remain a parity decision, not a functional blocker.

### Web AI Permission Missing Before AI Requests

Status: Fail and fixed

What a normal user sees: On web, Talk to Helfi, Symptom Notes, and Health Image Notes could reach the AI action without first seeing the clear "Allow AI help?" message that iPhone shows.

Why it matters: Apple specifically asked for clearer AI data permission, and users should know before chat text, symptom text, photos, or images are sent to AI.

What I fixed: Added the same plain AI permission modal to web Talk to Helfi, Symptom Notes, and Health Image Notes before user text or uploaded images can be sent.

How I retested: In the already-open browser on the local app, typed a harmless Talk to Helfi test message and clicked Send. The "Allow AI help?" message appeared before anything was sent. I clicked "Not now." In Symptom Notes, I added a harmless test symptom, clicked Create symptom notes, saw the same "Allow AI help?" message, and clicked "Not now." Health Image Notes keeps the create action disabled until an image is chosen, and the code gate is in place before upload/send.

Apple/public release blocker: Apple/public release blocker until deployed and retested.

### Safety Wording - Risky Analysis/Analyzer Labels

Status: Fail and fixed

What a normal user sees: Some app/public labels still said "Symptom analysis", "Medical image analysis", "Symptom Analyzer", or used clinician-like AI wording.

Why it matters: Apple already rejected for medical-safety wording. These phrases make the app look like it is diagnosing or acting as a clinician.

What I fixed: Changed user-visible wording to Symptom Notes and Health Image Notes, removed the risky public carousel slide, removed unused risky public assets, and softened internal AI role text away from clinician titles.

How I retested: Ran a text scan for the risky phrases across app, components, data, lib, native, and public files. The app/public scan is now clean except for App Store screenshot folders that need replacement assets.

Apple/public release blocker: App code wording is not a blocker after deploy and retest. App Store screenshots remain an Apple blocker.

### Talk to Helfi - Web and iPhone Basic Open/Fallback

Status: Pass

What a normal user sees: iPhone More opens Talk to Helfi. The text box can be focused without recording. Web Talk to Helfi opens and shows the Ask anything text box.

Why it matters: Apple flagged talking/recording fallback, and users must not be stuck if voice is unavailable.

What I fixed: Added the missing web AI permission gate before sending. No native change needed for the basic iPhone fallback.

How I retested: Opened iPhone Talk to Helfi from More, focused the text box, closed without sending data. Opened web Talk to Helfi from the already-open browser and confirmed the input and send controls are present.

Apple/public release blocker: Not a blocker after the web consent fix is deployed and retested.

### iPad - Food Diary Layout

Status: Pass

What a normal user sees: Food Diary on iPad is readable and not crowded. Add Food Entry, credits, energy summary, meals, Ask AI, bottom tabs, and meal rows are visible.

Why it matters: Apple called out iPad layout problems.

What I fixed: Nothing needed.

How I retested: Built and launched the iPad app on iPad Air 11-inch simulator, then captured and inspected the Food Diary screen.

Apple/public release blocker: Not a blocker.

### iPad - Apple Health Fallback

Status: Pass

What a normal user sees: Dashboard explains that Apple Health import is available on iPhone only, and that iPad can still use food, water, mood, check-ins, and reports.

Why it matters: Apple specifically rejected because Apple Health did not work clearly on iPad.

What I fixed: Nothing needed.

How I retested: Opened Dashboard on iPad and read the Apple Health / HealthKit section.

Apple/public release blocker: Not a blocker.

### iPad - Talk to Helfi Voice Fallback

Status: Pass

What a normal user sees: Talk to Helfi on iPad says "Type-only on iPad" and explains voice recording is iPhone-only. The text field accepts typed input and Send becomes available.

Why it matters: Apple specifically rejected because talking/recording behavior failed on iPad.

What I fixed: Nothing needed.

How I retested: Opened Talk to Helfi on iPad, typed a harmless phrase into the text box, confirmed Send became available, then cancelled without sending.

Apple/public release blocker: Not a blocker.

### Insights - iOS Missing Web's Tracked Issues

Status: Fail and fixed

What a normal user sees: Web Insights shows tracked health issues such as Bowel Movements, Digestion, Erection Quality, Libido, and Stress. iOS Insights only showed report cards and previous reports, so the main web Insights section was missing.

Why it matters: The owner said the iOS app must copy the web app. Insights was not in full parity.

What I fixed: Added the same tracked issue list to iOS Insights and made each issue card open the matching issue workspace inside the app. I also fixed the Insights issue-list login request so iOS can use the same signed-in request pattern as the rest of the app.

How I retested: Opened Insights on iPhone and iPad simulators. Confirmed report list, report view, tracked issue cards, and Bowel Movements issue workspace. Opening the tracked issue showed the "Allow AI help?" message before AI use; I clicked "Not now."

Apple/public release blocker: Public release blocker until deployed and live-retested.

### Food Diary - Web and iPhone Add Ingredient Flow

Status: Pass

What a normal user sees: Web and iPhone can search for banana, pick the first result, see 100 g and 89 kcal, and save it to Breakfast.

Why it matters: This is the basic manual food logging path.

What I fixed: Nothing for the add path.

How I retested: Added banana through web, restarted iPhone, and confirmed iPhone showed 89 kcal used and the Banana row in Breakfast.

Apple/public release blocker: Not a blocker.

### Food Diary - iPhone Edit, Cancel, and Delete

Status: Pass

What a normal user sees: Tapping a saved iPhone food row opens Edit food entry. Cancel returns to the meal list. Delete asks for confirmation and removes the row.

Why it matters: Users must be able to correct or remove food entries without getting stuck.

What I fixed: Strengthened the server cleanup after delete as noted above.

How I retested: Opened the iPhone Banana row, tapped Cancel, reopened it, tapped Delete, confirmed Delete, and saw Breakfast return to "No entries yet."

Apple/public release blocker: Not a blocker after the local cleanup fix is deployed and retested.

### Food Diary - Build a Meal iOS Did Not Match Web

Status: Fail and fixed

What a normal user sees: On web, Build a Meal opens the full builder with search, packaged/fast-food, single food, photo, barcode, favorites, portion control, ingredients, totals, and save controls. On iOS, Build a Meal opened a smaller "Combine ingredients / Build meal" screen that only combined existing entries.

Why it matters: The owner said iOS must copy the web app. This was not parity.

What I fixed: Changed iOS Build a Meal to open the matching web Build a Meal page inside the app. The smaller combine screen remains available only for the separate combine-existing-items action.

How I retested: Opened iOS Food Diary, tapped Add to Breakfast, tapped Build a meal, and confirmed the full Build a Meal page loaded with the same web-style controls.

Apple/public release blocker: Not a blocker after local fix is deployed and retested.

### Food Diary - Import Recipe iOS Did Not Match Web

Status: Fail and fixed

What a normal user sees: On web, Import Recipe has URL import and photo import. On iOS, Import Recipe opened the smaller combine meal screen.

Why it matters: Users would not get the same recipe import feature on iOS as web.

What I fixed: Changed iOS Import Recipe to open the matching web Import Recipe page inside the app.

How I retested: Opened iOS Food Diary, tapped Add to Breakfast, tapped Import Recipe, and confirmed the URL/photo Import Recipe page loaded.

Apple/public release blocker: Not a blocker after local fix is deployed and retested.

### Food Diary - iOS Recommended Buttons Were Not Properly Named

Status: Fail and fixed

What a normal user sees: The Recommended meal buttons were visible, but iOS accessibility/testing could not identify Generate, tabs, Add to diary, or Close as proper buttons.

Why it matters: Apple review can care about iPad/iOS usability, and users using assistive tools need named buttons.

What I fixed: Added clear names to Recommended tabs, Generate, Add to diary, and Close.

How I retested: Reopened Recommended on iOS. The buttons are now reachable by name, the cost updates to 10 credits, and Close works.

Apple/public release blocker: Not a blocker after local fix is deployed and retested.

### Food Diary - iOS Barcode Buttons Were Not Properly Named

Status: Fail and fixed

What a normal user sees: Barcode opened with a manual barcode box, camera scan, flash, lookup, missing label, and close controls, but iOS accessibility/testing could not identify most controls as proper buttons.

Why it matters: A user should not have hidden or unnamed controls, and Apple may flag weak iOS usability.

What I fixed: Added clear names to Camera scan, Flash, Lookup barcode, Missing label, Add barcode food, and Close.

How I retested: Opened Barcode on iOS, confirmed every control is reachable by name, tapped Lookup with an empty barcode, saw "Type a barcode first", dismissed it, then closed Barcode.

Apple/public release blocker: Not a blocker after local fix is deployed and retested.

### Food Diary - Web Build a Meal Scanner Close

Status: Fail and fixed

What a normal user sees: On web Build a Meal, opening Barcode Scanner could leave the close control hard to reach when browser camera permission UI appeared.

Why it matters: Users could feel trapped in the scanner.

What I fixed: Added a second Close scanner button below the scanner area.

How I retested: Opened Build a Meal in the already-open browser, opened Barcode Scanner, used the new bottom Close scanner button, and confirmed the scanner disappeared.

Apple/public release blocker: Not a blocker after local fix is deployed and retested.

### Food Diary - Web Import Recipe Stale Error

Status: Fail and fixed

What a normal user sees: If a user tried an empty URL import, then switched to photo import, the old URL error stayed visible.

Why it matters: It made the screen feel broken and confusing.

What I fixed: Cleared the old error when switching between URL and photo modes.

How I retested: Opened Import Recipe in the already-open browser, triggered the empty URL warning, switched to photo mode, confirmed the URL warning cleared, then triggered the correct empty-photo warning.

Apple/public release blocker: Not a blocker after local fix is deployed and retested.

### Food Diary - Web Water Quick Add Warning

Status: Fail and fixed

What a normal user sees: If a user tapped empty Add Entry and then quickly tapped 250 ml plus Add Entry, the page could save the water but still show "Enter a valid amount first."

Why it matters: Users would think the save failed even though it worked.

What I fixed: Stopped the stale empty-entry warning from showing during quick-add saves.

How I retested: Opened Water in the already-open browser, tested empty Add Entry, quick 250 ml, and quick Add Entry. It saved cleanly with no false warning. Deleted the test entry afterward.

Apple/public release blocker: Not a blocker after local fix is deployed and retested.

### Food Diary - iOS Water Add and Delete

Status: Pass

What a normal user sees: Water shows today, daily goal, drink types, quick amounts, custom amount, units, Add water entry, and history.

Why it matters: Web and iOS water logging should match.

What I fixed: Nothing needed in iOS Water.

How I retested: Opened Water from iOS Food Diary, tapped 250 ml, waited for it to appear, then deleted the test entry and confirmed the screen returned to 0 ml and no entries.

Apple/public release blocker: Not a blocker.

### iPhone Dashboard Parity

Status: Pass

What a normal user sees: iPhone Dashboard shows the same main Dashboard structure as web: credits, Daily Tools, My Health, reports, and the main tabs.

Why it matters: The owner said iOS copies the web app, so the first iPhone screen must feel like the same product.

What I fixed: The iPhone credit loading issue was already fixed locally so it shows a dash while loading instead of a false 0.

How I retested: Opened Dashboard on iPhone simulator. It first showed a dash, then loaded the correct 664 credits. Daily Tools and My Health sections were visible.

Apple/public release blocker: Not a blocker after local fix is deployed and retested.

### iPhone Insights Parity

Status: Fail and fixed

What a normal user sees: iPhone Insights now shows the 7-day report, previous reports, and tracked issues such as Bowel Movements and Digestion. Opening Bowel Movements shows the AI permission message before AI help.

Why it matters: Web Insights already had tracked issues. iOS was missing them, which broke parity.

What I fixed: Added the tracked issue cards to iOS and connected them to the matching issue workspace.

How I retested: Opened Insights on iPhone simulator, waited for loading to finish, opened a report, returned, scrolled to tracked issues, opened Bowel Movements, and clicked "Not now" on the AI permission message.

Apple/public release blocker: Not a blocker after local fix is deployed and retested.

### iPhone More Menu Parity

Status: Fail and fixed

What a normal user sees: iPhone More now includes the web's main items, including Talk to Helfi, Health Journal, Health Coach, Symptom Notes, Health Image Notes, Health Intake/Profile areas, Devices, Settings, Billing, and Help-style areas. It also has extra iOS shortcut rows such as Lab Reports and practitioner links.

Why it matters: Missing major tools made iOS feel incomplete compared with web.

What I fixed: Added Symptom Notes and Health Image Notes to iOS More.

How I retested: Opened More on iPhone simulator. Opened Health Image Notes and confirmed the AI permission message appeared before use. I clicked "Not now."

Apple/public release blocker: Not a blocker after local fix is deployed and retested. Extra iOS-only shortcut rows should be confirmed by the owner as intentional.

### iPhone Settings and Billing Parity

Status: Pass

What a normal user sees: iPhone Settings shows dark mode, home-screen note, weekly health report toggle, Food Diary settings, Notifications, Privacy, and account/billing paths. Billing shows current plan, credits, usage, restore purchases, and plan choices.

Why it matters: Settings and Billing are key trust/account areas and should not feel different from web unless the platform requires it.

What I fixed: Nothing new during this pass.

How I retested: Opened Settings on iPhone simulator, waited for the weekly report state to finish loading, opened Food Diary settings, returned, opened Subscription & Billing, waited for plan/credit data, and did not start any purchase.

Apple/public release blocker: Real payments remain real-device/payment-account-only. The visible screens are not blockers.

### iOS Login and Signup Apple Review Check

Status: Pass

What a normal user sees: iOS login and signup offer Continue with Apple and email login/signup. There is no visible Continue with Google button in the iOS login/signup screens.

Why it matters: Apple review should not be pushed into Google or a web sign-in prompt on iOS.

What I fixed: Nothing needed in this pass.

How I retested: Checked the iOS login and signup screens in code, and searched native login/signup files for Google/web sign-in prompts. The visible iOS screens use Apple plus email.

Apple/public release blocker: Not a blocker.

### Web Main User Areas

Status: Pass

What a normal user sees: The main web pages load and show usable controls: Dashboard, Food Diary, Insights, Talk to Helfi, More, Settings, Account, Profile, Billing, Devices, Health Tracking, Health Intake, Health Journal, Check-in, Mood, Lab Reports, Health Tips, Notifications, Support, Help, FAQ, Symptom Notes, Health Image Notes, Practitioner Directory, List Your Practice, and Affiliate.

Why it matters: The public web app was the first version, and iOS should copy it where it makes sense.

What I fixed: Fixed issues found in Food Diary, AI permission, wording, Insights parity links, and settings/navigation parity.

How I retested: Used the already-open browser only. Opened the major routes, checked visible controls, tested safe cancel/empty paths, and did not send AI data, submit admin actions, upload private files, or start payments.

Apple/public release blocker: Not a blocker after local fixes are deployed and retested on live.

### Web Admin Area

Status: Blocked

What a normal user sees: Admin pages stop at an admin sign-in screen.

Why it matters: Admin actions can change live account, billing, support, notification, and marketing data, so they should not be clicked without proper admin access and a narrow owner-approved task.

What I fixed: Nothing.

How I retested: Opened the admin pages in the already-open browser. They did not expose the full admin dashboard in the normal signed-in user session.

Apple/public release blocker: Not an Apple blocker. Public launch admin testing remains blocked/read-only.

### App Store Screenshot Source Folders

Status: Fail and fixed

What a normal user sees: This is not visible inside the app, but the App Store screenshot source folders previously included risky "symptom analysis" and "medical image analyzer" filenames.

Why it matters: Apple has already rejected the app for medical-safety concerns, and those labels make the app look like it analyses symptoms or medical images.

What I fixed: Removed the risky local App Store screenshot source filenames and verified the saved App Store Connect screenshot sets no longer show those risky screenshots.

How I retested: Checked the local App Store screenshot folders and the already-open App Store Connect page.

Apple/public release blocker: This specific blocker is fixed. Do not submit until the latest local fixes are deployed, a new iOS build is made and tested, and the owner approves Update Review.

## Verification Checks

- Pass: iOS type check passed.
- Pass: iOS type check passed again after the final local fixes.
- Pass: Web lint passed with existing warnings.
- Pass: Web compile check passed after fixing the Health Image Notes selected-image issue.
- Pass: Web type check passed again after the final local fixes.
- Pass: Full web production build passed again after the final local fixes. It still shows old warnings, but it compiled successfully.
- Pass: Page lock checks passed when the exact audit-touched locked files were allowed for checking.
- Not run: No deploy, no Apple resubmission, no live payment, no real camera/microphone/Apple Health device test.

## Real-Device-Only Items

- Camera food photo analysis on real iPhone/iPad.
- Barcode scanning with a real camera.
- Recipe import by choosing/taking a real photo.
- Microphone voice recording on a real iPhone.
- Apple Health import on a real iPhone.
- Push notification delivery on a real device.
- App Store, Stripe, Fitbit, Garmin, and other real-account/payment flows.
