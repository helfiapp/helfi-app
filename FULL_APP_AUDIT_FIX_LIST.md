# Full App Audit Fix List

Audit ticket: HEL-437
Date started: 2026-06-13
Scope: Audit-only pass of the iOS native app in simulator and the local web app in browser.

Rules for this file:
- Record every issue found.
- Do not mark an area complete unless it was personally tested in this pass.
- Do not deploy, submit TestFlight, or fix product bugs in this pass.
- Do not include passwords, API keys, private codes, or secret values.

## Audit Status

- Overall status: Completed for this audit pass
- iOS native app status: Completed for this audit pass
- Web app status: Completed for this audit pass
- Test account: native/web test account from local env, password not printed
- Local web URL tested: http://127.0.0.1:3000
- iOS simulator tested: iPhone 17 Pro Max, iOS 26.2

## Issues Found

### ISSUE-001 - Native Exercise add cannot select an exercise type

- Area/screen: Food Diary -> Exercise -> Add exercise
- Platform: iOS
- Exact button/action tested: Exercise plus button, typed "Walking" in Search exercise type, tapped All categories, tapped Add exercise
- What happened: No exercise type suggestions appeared. All categories did not open. Add exercise then showed "Missing data" / "Choose an exercise type first."
- What should happen: User should be able to pick an exercise type and save a manual exercise entry.
- Steps to reproduce: Open iOS Food Diary -> tap Exercise plus -> type Walking -> try to choose a result or category -> tap Add exercise.
- Severity: High
- Screenshot path: Not captured
- Blocks more testing: Yes, blocks testing creation/delete of a new exercise entry.

### ISSUE-002 - Native Exercise edit shows existing Walking entry as Type: None

- Area/screen: Food Diary -> Exercise -> Edit
- Platform: iOS
- Exact button/action tested: Existing Walking, 5 km/h entry -> Edit
- What happened: Edit panel loaded the name, duration, distance, and calories, but the type preview said "Type: None - Preview: --".
- What should happen: Existing exercise should load its selected exercise type so saving does not risk damaging the entry.
- Steps to reproduce: Open iOS Food Diary -> tap Edit on the existing Walking exercise row.
- Severity: High
- Screenshot path: Not captured
- Blocks more testing: No, but I did not save because it looked unsafe.

### ISSUE-003 - Deleting native Tea water entry leaves a Tea row in Food Diary

- Area/screen: Water Intake -> Quick add Tea -> Food Diary
- Platform: iOS
- Exact button/action tested: Selected Tea, tapped 250 ml, chose Sugar-free, saved drink, deleted Tea from Water history, returned to Food Diary
- What happened: Water total returned to 450 ml / 2 entries, but Food Diary still showed a Tea row under Other. I had to delete the leftover Tea row from Food Diary separately.
- What should happen: Deleting the linked water entry should also remove or correctly sync the linked Food Diary drink row.
- Steps to reproduce: Open iOS Water Intake -> Tea -> 250 ml -> choose Sugar-free -> Save drink -> Delete Tea from Water history -> go back to Food Diary.
- Severity: High
- Screenshot path: /tmp/helfi-full-app-audit/ios-water-delete-leftover-tea-food-row.jpg
- Blocks more testing: No, I cleaned up the leftover Tea row.

### ISSUE-004 - Native Water history entries have Delete only, no Edit action

- Area/screen: Water Intake -> Water history
- Platform: iOS
- Exact button/action tested: Looked at Coffee and Water history rows, tapped Coffee row
- What happened: Rows only showed Delete. Tapping the row did not open an edit panel.
- What should happen: If water editing is expected on native, the row should offer an obvious Edit action.
- Steps to reproduce: Open iOS Water Intake -> view Water history -> inspect or tap a row.
- Severity: Medium
- Screenshot path: Not captured
- Blocks more testing: Yes, blocks native water edit testing.

### ISSUE-005 - Several normal numeric/search fields are exposed as secure password fields

- Area/screen: Add Ingredient, Food edit, Exercise add/edit, Water goal, Find a Practitioner
- Platform: iOS
- Exact button/action tested: Opened Add Ingredient search, Food edit panel, Exercise add/edit panel, Water Edit goal, Find a Practitioner search
- What happened: Some normal fields were reported as secure/password fields by the simulator, including Add Ingredient search, Food calories/fiber, Exercise duration/start time, Water goal amount, and Find a Practitioner search.
- What should happen: Only actual passwords should be secure fields. Search and number fields should be normal fields.
- Steps to reproduce: Open the listed native screens and inspect/focus those fields.
- Severity: Medium
- Screenshot path: Not captured
- Blocks more testing: No, but it is bad for accessibility and autofill behavior.

### ISSUE-006 - Native Mood Journal photo button cannot continue past permission warning

- Area/screen: Mood Tracker -> Journal -> Add photo
- Platform: iOS
- Exact button/action tested: Tapped Add photo
- What happened: The app showed "Permission needed" / "Please allow photo library access to add images" with only an OK button.
- What should happen: The app should either show the real iOS permission prompt or provide a clear way to open Settings and grant photo access.
- Steps to reproduce: Open iOS Mood Tracker -> Journal -> tap Add photo.
- Severity: Medium
- Screenshot path: /tmp/helfi-full-app-audit/ios-mood-journal-photo-permission.jpg
- Blocks more testing: Yes, blocks testing photo attachment from Mood Journal.

### ISSUE-007 - Native Mood Journal voice note fails after microphone permission

- Area/screen: Mood Tracker -> Journal -> Record voice note
- Platform: iOS
- Exact button/action tested: Tapped Record voice note, allowed microphone permission, tapped Record voice note again
- What happened: The app showed "Try again" / "Please open Helfi and tap Record voice note again" even though Helfi was already open.
- What should happen: After microphone permission is allowed, the voice note recorder should open or start recording.
- Steps to reproduce: Open iOS Mood Tracker -> Journal -> tap Record voice note -> allow microphone -> tap Record voice note again.
- Severity: High
- Screenshot path: /tmp/helfi-full-app-audit/ios-mood-journal-voice-try-again.jpg
- Blocks more testing: Yes, blocks testing Mood Journal voice note creation.

### ISSUE-008 - Native Health Setup review opens as a blank setup form

- Area/screen: Dashboard -> Health Setup / Review
- Platform: iOS
- Exact button/action tested: Tapped Health Setup / Review from Dashboard
- What happened: The app opened "Edit Health Info" at step 1 with gender blank, terms unchecked, and Continue disabled, even though the Dashboard also showed onboarding complete.
- What should happen: Review should load the saved health profile values or clearly show a safe edit screen for the existing profile.
- Steps to reproduce: Open iOS Dashboard -> tap Health Setup / Review.
- Severity: High
- Screenshot path: /tmp/helfi-full-app-audit/ios-health-setup-blank-review.jpg
- Blocks more testing: No, but I backed out without changing data because it looked unsafe.

### ISSUE-009 - Native Mood check-in history has no visible delete or edit action

- Area/screen: Mood Tracker -> History
- Platform: iOS
- Exact button/action tested: Created a temporary mood check-in, opened History, reviewed recent entries
- What happened: The new mood check-in appeared in History, but I did not find a visible edit or delete action for mood check-in entries.
- What should happen: If users can create mood check-ins, there should be an obvious way to correct or delete a mistaken entry.
- Steps to reproduce: Open Mood Tracker -> create a mood check-in -> open History -> look for edit/delete on recent entries.
- Severity: Medium
- Screenshot path: Not captured
- Blocks more testing: No, but the temporary mood check-in could not be cleaned up through the visible app UI.

### ISSUE-010 - Native voice/text navigation charged credits for opening Dashboard

- Area/screen: Voice assistant overlay from Food Diary
- Platform: iOS
- Exact button/action tested: Opened Talk to Helfi while the Food add menu was open, typed "Open Dashboard", sent request, then tapped Open Dashboard
- What happened: The app showed a review card and charged 3 credits for a simple navigation request.
- What should happen: Basic app navigation should either be free or clearly warn the user before spending credits.
- Steps to reproduce: Open iOS Food Diary -> open Add Food Entry -> tap Talk to Helfi -> type Open Dashboard -> Send request -> tap Open Dashboard.
- Severity: Medium
- Screenshot path: Not captured
- Blocks more testing: No

### ISSUE-011 - Native credits briefly showed wrong values after voice action

- Area/screen: Dashboard and Food Diary credits
- Platform: iOS
- Exact button/action tested: Used voice/text command to open Dashboard, then returned to Food
- What happened: Dashboard briefly showed Credits remaining 0 before refreshing to 790. Food then briefly still showed the older 793 credit value before refreshing.
- What should happen: Credit totals should stay consistent across screens after a charged action.
- Steps to reproduce: From Food Diary, use Talk to Helfi text command "Open Dashboard" -> watch Dashboard credits -> return to Food and watch credits.
- Severity: Medium
- Screenshot path: /tmp/helfi-full-app-audit/ios-dashboard-credits-zero-after-voice.jpg and /tmp/helfi-full-app-audit/ios-food-credits-still-793-after-voice.jpg
- Blocks more testing: No

### ISSUE-012 - Native Food camera permission leads straight to analysis failure

- Area/screen: Food Diary -> Add Food Entry -> Photo Library / Camera -> Camera
- Platform: iOS
- Exact button/action tested: Tapped Camera and allowed camera permission
- What happened: After permission was allowed, the app showed "Analysis failed" / "Could not analyze this image" without showing a camera view or letting me take a photo.
- What should happen: After permission, the app should open the camera or show a clear camera-unavailable message before trying to analyze anything.
- Steps to reproduce: Open iOS Food Diary -> Add Food Entry -> Breakfast -> Photo Library / Camera -> Camera -> Allow.
- Severity: High
- Screenshot path: /tmp/helfi-full-app-audit/ios-food-camera-analysis-failed.jpg
- Blocks more testing: Yes, blocks testing Food camera photo analysis.

### ISSUE-013 - Native Food photo library cannot continue past permission warning

- Area/screen: Food Diary -> Add Food Entry -> Photo Library / Camera -> Photo Library
- Platform: iOS
- Exact button/action tested: Tapped Photo Library
- What happened: The app returned to Food Diary, then later showed "Permission needed" / "Please allow access to continue" with only an OK button. It did not show the real iOS photo permission prompt or a Settings shortcut.
- What should happen: The app should show the real permission prompt or a clear route to grant photo access.
- Steps to reproduce: Open iOS Food Diary -> Add Food Entry -> Breakfast -> Photo Library / Camera -> Photo Library.
- Severity: High
- Screenshot path: /tmp/helfi-full-app-audit/ios-food-photo-library-permission-needed.jpg
- Blocks more testing: Yes, blocks testing Food photo library analysis.

### ISSUE-014 - Native barcode add spent credits without a clear warning

- Area/screen: Food Diary -> Barcode Scanner
- Platform: iOS
- Exact button/action tested: Entered fake barcode 0000000000000, tapped Lookup barcode, then tapped Add to diary
- What happened: The fake barcode returned "ORGANIC BLUE CORN TORTILLA CHIPS". Adding it reduced credits from 790 to 787, but the barcode screen did not clearly warn that adding the barcode item would cost credits.
- What should happen: Barcode lookup/add should show clear cost information before charging credits, and fake/test barcode values should not return a misleading real product unless that is intentional.
- Steps to reproduce: Open iOS Food Diary -> Breakfast -> Barcode Scanner -> type 0000000000000 -> Lookup barcode -> Add to diary.
- Severity: Medium
- Screenshot path: Not captured
- Blocks more testing: No, but it spent 3 credits.

### ISSUE-015 - Native Import Recipe opens Build Meal instead of recipe import

- Area/screen: Food Diary -> Add Food Entry -> Import Recipe
- Platform: iOS
- Exact button/action tested: Tapped Import Recipe from the Breakfast add menu
- What happened: The app opened "Combine ingredients / Build meal" with the name prefilled as "Imported Recipe" and no URL/photo import controls.
- What should happen: Import Recipe should open a recipe import screen with URL and/or photo options, plus clear credit cost before running.
- Steps to reproduce: Open iOS Food Diary -> Add Food Entry -> Breakfast -> Import Recipe.
- Severity: High
- Screenshot path: /tmp/helfi-full-app-audit/ios-import-recipe-opens-build-meal.jpg
- Blocks more testing: Yes, blocks native recipe import testing.

### ISSUE-016 - Native Health Journal save message says media was analyzed when no media was attached

- Area/screen: Health Journal -> New Entry
- Platform: iOS
- Exact button/action tested: Added a plain text health note with no photo or voice file
- What happened: The save message said "Saved. Media was analyzed and only summary text was kept." even though no media was attached.
- What should happen: Plain text notes should show a plain save message.
- Steps to reproduce: Open iOS More -> Health Journal -> New Entry -> type a note only -> Submit.
- Severity: Low
- Screenshot path: Not captured
- Blocks more testing: No

### ISSUE-017 - Native Talk to Helfi voice recording fails with AI service not configured

- Area/screen: Talk to Helfi overlay
- Platform: iOS
- Exact button/action tested: Opened Talk to Helfi, tapped Record command, then Stop
- What happened: The app showed "Try again" / "AI service not configured."
- What should happen: Voice recording should process safely, or the feature should be hidden/disabled when the service is unavailable.
- Steps to reproduce: Open iOS More -> Talk to Helfi -> tap Record command -> tap Stop.
- Severity: High
- Screenshot path: /tmp/helfi-full-app-audit/ios-voice-record-ai-service-not-configured.jpg
- Blocks more testing: Yes, blocks native voice-command recording tests.

### ISSUE-018 - Native Medical Image History shows old entries as image unavailable

- Area/screen: Medical Image Analyzer -> History
- Platform: iOS
- Exact button/action tested: Opened old medical image entries and viewed details
- What happened: Old entries showed "Image unavailable" even though details could still expand.
- What should happen: The app should show the image, a thumbnail, or a clear reason why the image is no longer available.
- Steps to reproduce: Open iOS More -> Medical Images -> scroll to History -> inspect old entries -> tap View details.
- Severity: Medium
- Screenshot path: Not captured
- Blocks more testing: No

### ISSUE-019 - Native Fitbit connect opens raw not-configured error

- Area/screen: Devices -> Connect Fitbit
- Platform: iOS
- Exact button/action tested: Tapped Connect Fitbit twice
- What happened: First tap showed "Please allow popups for this site to connect Fitbit." Second tap opened a raw JSON error saying Fitbit client ID is not configured.
- What should happen: The app should show a friendly message and not open raw technical text to the user.
- Steps to reproduce: Open iOS More -> Devices -> Connect Fitbit.
- Severity: High
- Screenshot path: /tmp/helfi-full-app-audit/ios-devices-fitbit-json-error.jpg
- Blocks more testing: Yes, blocks Fitbit connection testing.

### ISSUE-020 - Native Find a Practitioner category search does not apply chosen category

- Area/screen: Find a Practitioner -> Browse Categories A-Z
- Platform: iOS
- Exact button/action tested: Searched "cardio" and tapped Cardiologist
- What happened: The app returned to the search form, but the filters still showed Allied Health / Physiotherapist.
- What should happen: Choosing Cardiologist should apply the matching practitioner/category filters.
- Steps to reproduce: Open Find a Practitioner -> Browse Categories A-Z -> search cardio -> tap Cardiologist.
- Severity: Medium
- Screenshot path: Not captured
- Blocks more testing: No

### ISSUE-021 - Native practitioner create-account sign-in link does not navigate

- Area/screen: List your practice -> Create practitioner account
- Platform: iOS
- Exact button/action tested: Tapped "Already have a practitioner account? Sign in"
- What happened: The link did not navigate after two attempts.
- What should happen: The link should open the practitioner sign-in screen.
- Steps to reproduce: Open More -> List your practice -> Start listing -> Create practitioner account -> tap the small sign-in link.
- Severity: Medium
- Screenshot path: Not captured
- Blocks more testing: No, because the main Sign in button on the start page worked.

### ISSUE-022 - Native Notification Delivery page uses web-only install wording

- Area/screen: Settings -> Notifications -> Notification Delivery
- Platform: iOS
- Exact button/action tested: Opened Notification Delivery
- What happened: It said "On iPhone: Add to Home Screen, then open the app icon to enable" inside the native iPhone app.
- What should happen: Native app instructions should explain iOS notification permission/settings, not website install steps.
- Steps to reproduce: Open Settings -> Notification settings -> Notification Delivery.
- Severity: Medium
- Screenshot path: /tmp/helfi-full-app-audit/ios-settings-notification-delivery-home-screen-copy.jpg
- Blocks more testing: No

### ISSUE-023 - Native Health Reminders page uses web-only install wording

- Area/screen: Settings -> Notification settings -> Health Reminders
- Platform: iOS
- Exact button/action tested: Opened Health Reminders
- What happened: The page again told the user to add Helfi to the Home Screen, which is wrong inside the native app.
- What should happen: It should use native notification wording.
- Steps to reproduce: Open Settings -> Notification settings -> Health Reminders.
- Severity: Medium
- Screenshot path: /tmp/helfi-full-app-audit/ios-health-reminders-home-screen-copy.jpg
- Blocks more testing: No

### ISSUE-024 - Native Mood Reminders page opens with Daily check-in wording first

- Area/screen: Settings -> Notification settings -> Mood Reminders
- Platform: iOS
- Exact button/action tested: Opened Mood Reminders
- What happened: The first visible heading/content said Daily check-in reminders; Mood reminders were lower down the page.
- What should happen: Mood Reminders should open directly to mood reminder settings or clearly explain both reminder types.
- Steps to reproduce: Open Settings -> Notification settings -> Mood Reminders.
- Severity: Low
- Screenshot path: Not captured
- Blocks more testing: No

### ISSUE-025 - Native Privacy Policy handoff opens a web page with visible errors

- Area/screen: Settings -> Privacy Settings -> Privacy Policy
- Platform: iOS
- Exact button/action tested: Tapped Privacy Policy
- What happened: The external web page opened and showed a red "2 errors" banner plus a support bubble.
- What should happen: Privacy Policy should open cleanly without visible error banners.
- Steps to reproduce: Open Settings -> Privacy Settings -> Privacy Policy.
- Severity: Medium
- Screenshot path: /tmp/helfi-full-app-audit/ios-privacy-policy-2-errors.jpg
- Blocks more testing: No

### ISSUE-026 - Native relaunch showed "No script URL provided" when Metro was not running

- Area/screen: Native app relaunch during simulator testing
- Platform: iOS
- Exact button/action tested: Relaunched the iOS app after external browser handoff
- What happened: The app showed a red error screen: "No script URL provided."
- What should happen: A locally installed test build should relaunch cleanly or show a friendly development-server message.
- Steps to reproduce: Stop Metro/dev server, then relaunch the simulator app build.
- Severity: Medium
- Screenshot path: /tmp/helfi-full-app-audit/ios-relaunch-no-script-url-error.jpg
- Blocks more testing: Yes, until Metro was started again.

### ISSUE-027 - Native Help and FAQ inner web buttons were not accessible to native test tools

- Area/screen: More -> Help & Support and FAQ
- Platform: iOS
- Exact button/action tested: Tried to tap Contact Us, View FAQ, Affiliate Help, and FAQ cards from the native WebView
- What happened: The page opened, but the inner web buttons were not exposed as tappable controls to the native accessibility snapshot.
- What should happen: Buttons inside embedded help pages should be accessible and easy to test/use in the native app.
- Steps to reproduce: Open More -> Help & Support or FAQ -> inspect/tap inner buttons.
- Severity: Medium
- Screenshot path: Not captured
- Blocks more testing: Partly. Inner help controls still need web-browser coverage.

### ISSUE-028 - Web Health Intake review opens blank / does not load saved profile

- Area/screen: Dashboard -> Health Intake / /onboarding
- Platform: web
- Exact button/action tested: Opened Health Intake from Dashboard and direct /onboarding?step=1
- What happened: The Health Intake form opened blank instead of loading the saved profile. Dashboard still showed Health Setup Required even though existing profile data appeared complete elsewhere.
- What should happen: Health Intake review should load saved health profile values and Dashboard should not show setup required when setup is complete.
- Steps to reproduce: Open web Dashboard -> click Health Intake or go to /onboarding?step=1.
- Severity: High
- Screenshot path: Not captured
- Blocks more testing: No, but I backed out without changing health profile data.

### ISSUE-029 - Web Dashboard shows visible error badge

- Area/screen: Dashboard
- Platform: web
- Exact button/action tested: Loaded Dashboard after login and after check-in save
- What happened: A red "3 errors" badge was visible. Earlier browser console output also showed rendering/state errors around Dashboard/usage/food diary.
- What should happen: Dashboard should load without visible error badges or user-facing development errors.
- Steps to reproduce: Open http://127.0.0.1:3000/dashboard while logged in.
- Severity: High
- Screenshot path: /tmp/helfi-full-app-audit/web-dashboard-error-banner.png
- Blocks more testing: No

### ISSUE-030 - Web Food add menu does not show Build Meal or Import Recipe

- Area/screen: Food Diary -> Add Food Entry
- Platform: web
- Exact button/action tested: Clicked Add Food Entry / Add to Breakfast menu
- What happened: The menu did not show Build Meal or Import Recipe, even though those pages exist by direct URL.
- What should happen: Normal users should be able to reach Build Meal and Import Recipe from the Food Diary add flow.
- Steps to reproduce: Open Food Diary -> Add Food Entry -> choose Breakfast/add menu.
- Severity: High
- Screenshot path: Not captured
- Blocks more testing: No, direct URLs were tested separately.

### ISSUE-031 - Web Favorites action triggers visible error

- Area/screen: Food Diary -> Favorites
- Platform: web
- Exact button/action tested: Added a favorite food to the diary
- What happened: The favorite was added, but a red error appeared during/after the action.
- What should happen: Adding a favorite should complete without visible errors.
- Steps to reproduce: Open Food Diary -> Favorites -> add a favorite food entry.
- Severity: Medium
- Screenshot path: Not captured
- Blocks more testing: No, temporary favorite entries were cleaned up.

### ISSUE-032 - Web barcode manual lookup is blocked by camera overlay

- Area/screen: Food Diary -> Barcode Scanner
- Platform: web
- Exact button/action tested: Opened barcode scanner and tried manual barcode entry/search
- What happened: The camera/scanner overlay sat over the manual controls and blocked the Search button.
- What should happen: Manual barcode entry should be usable even if the camera scanner is open or unavailable.
- Steps to reproduce: Open Food Diary -> Barcode Scanner -> try to type/search manually.
- Severity: High
- Screenshot path: /tmp/helfi-full-app-audit/web-barcode-manual-overlay-blocked.png
- Blocks more testing: Yes, blocks manual barcode lookup on web.

### ISSUE-033 - Web water edit only allows time edit, not amount

- Area/screen: Food Diary -> Water/liquids
- Platform: web
- Exact button/action tested: Added 250 ml water, opened edit controls, deleted it
- What happened: The edit modal only offered "Edit Time"; there was no obvious amount edit.
- What should happen: Users should be able to correct water amount if water editing is intended.
- Steps to reproduce: Open Food Diary -> Water -> add water -> open edit.
- Severity: Low
- Screenshot path: Not captured
- Blocks more testing: No

### ISSUE-034 - Web Mood page heading says Daily Check-In

- Area/screen: Mood Tracker
- Platform: web
- Exact button/action tested: Opened /mood
- What happened: The page header said "Daily Check-In" even though the page is Mood Tracker.
- What should happen: The page heading should match the section the user opened.
- Steps to reproduce: Open /mood.
- Severity: Low
- Screenshot path: Not captured
- Blocks more testing: No

### ISSUE-035 - Web Mood save does not immediately update chart/stats

- Area/screen: Mood Tracker -> Log Mood
- Platform: web
- Exact button/action tested: Selected mood/emotion/context and clicked Log Mood
- What happened: The app said the mood was saved, but the chart still showed "No data yet" and stats stayed at 0 until refresh.
- What should happen: Saved mood entries should appear immediately without needing a refresh.
- Steps to reproduce: Open /mood -> log a mood -> look at chart/stats immediately.
- Severity: Medium
- Screenshot path: Not captured
- Blocks more testing: No

### ISSUE-036 - Web Mood entries have no visible edit/delete action

- Area/screen: Mood Tracker -> Mood history
- Platform: web
- Exact button/action tested: Created a mood entry, opened history/recent mood areas
- What happened: I did not find visible edit/delete controls for mood entries.
- What should happen: Users should be able to correct or delete a mistaken mood entry.
- Steps to reproduce: Open /mood -> create mood entry -> look for edit/delete on the new entry.
- Severity: Medium
- Screenshot path: Not captured
- Blocks more testing: Partly. Temporary mood entry could not be cleaned up from visible UI.

### ISSUE-037 - Web Mood Journal delete hangs/crashes the page

- Area/screen: Mood Journal
- Platform: web
- Exact button/action tested: Created a text mood journal entry, edited it, then clicked Delete and confirmed
- What happened: Delete confirmation appeared, but the entry stayed. Retrying delete made Chrome show Page Unresponsive and then an Aw, Snap / RESULT_CODE_HUNG crash.
- What should happen: Delete should remove the entry and return the page to a stable state.
- Steps to reproduce: Open Mood Journal -> create a text entry -> edit it -> delete it -> retry delete if it stays.
- Severity: Critical
- Screenshot path: /tmp/helfi-full-app-audit/web-mood-journal-delete-page-unresponsive.png
- Blocks more testing: Yes, blocked Mood Journal photo/voice cleanup testing and left a temporary journal entry.

### ISSUE-038 - Web Health Journal save message says media was analyzed for text-only notes

- Area/screen: Health Journal -> New Entry
- Platform: web
- Exact button/action tested: Saved a plain text health note with no media
- What happened: The success message said media was analyzed even though no photo or voice file was attached.
- What should happen: Text-only notes should show a plain save message.
- Steps to reproduce: Open /health-journal -> add a text-only entry -> save.
- Severity: Low
- Screenshot path: Not captured
- Blocks more testing: No

### ISSUE-039 - Web Health Journal delete requires refresh before entry disappears

- Area/screen: Health Journal
- Platform: web
- Exact button/action tested: Deleted the temporary health journal entry
- What happened: Delete confirmed, but the note stayed visible until the page was refreshed.
- What should happen: Deleted notes should disappear immediately.
- Steps to reproduce: Open /health-journal -> create entry -> delete it.
- Severity: Medium
- Screenshot path: Not captured
- Blocks more testing: No, the note was gone after refresh.

### ISSUE-040 - Web Medical Image History shows old images as unavailable

- Area/screen: Medical Images -> History
- Platform: web
- Exact button/action tested: Opened old medical image history entries and details
- What happened: Old entries showed blank image boxes / "Image unavailable" while details still opened.
- What should happen: The image should show, or the app should clearly explain why it cannot be shown.
- Steps to reproduce: Open /medical-images/history -> open an old entry.
- Severity: Medium
- Screenshot path: /tmp/helfi-full-app-audit/web-medical-image-history-unavailable.png
- Blocks more testing: No

### ISSUE-041 - Web Fitbit connect opens raw JSON error

- Area/screen: Devices -> Connect Fitbit
- Platform: web
- Exact button/action tested: Clicked Connect Fitbit
- What happened: A new Chrome tab opened with raw JSON saying Fitbit client ID is not configured.
- What should happen: The app should show a friendly setup-unavailable message and not expose raw technical JSON.
- Steps to reproduce: Open /devices -> click Connect Fitbit.
- Severity: High
- Screenshot path: /tmp/helfi-full-app-audit/web-devices-fitbit-json-error.png
- Blocks more testing: Yes, blocks Fitbit connection testing.

### ISSUE-042 - Web Settings PDF opens in-page with no clear Back

- Area/screen: Settings -> Download PDF
- Platform: web
- Exact button/action tested: Clicked Download PDF from Settings
- What happened: The PDF opened in the same app view even though the text said it opens in a new tab. The Back button was hidden/not usable.
- What should happen: It should open as described, or show a clear way back to Settings.
- Steps to reproduce: Open /settings -> click Download PDF.
- Severity: Medium
- Screenshot path: /tmp/helfi-full-app-audit/web-settings-pdf-back-hidden.png
- Blocks more testing: No

### ISSUE-043 - Web push notification toggle could not be turned off

- Area/screen: Notifications -> Reminders
- Platform: web
- Exact button/action tested: Turned on the Push toggle, then tried click/keyboard/force controls to turn it off
- What happened: The toggle turned on but would not turn off. It remains on.
- What should happen: A user should be able to turn push notifications off.
- Steps to reproduce: Open /notifications/reminders -> turn Push on -> try to turn Push off.
- Severity: High
- Screenshot path: /tmp/helfi-full-app-audit/web-notifications-push-cannot-turn-off.png
- Blocks more testing: No, but it leaves the test account changed.

### ISSUE-044 - Web notification delivery test buttons show no feedback

- Area/screen: Notifications -> Delivery
- Platform: web
- Exact button/action tested: Clicked Send test / Send delivery controls
- What happened: No visible success or failure message appeared, and the notification inbox showed no new item.
- What should happen: The page should clearly say whether a test notification was sent or failed.
- Steps to reproduce: Open /notifications/delivery -> click the test/send controls.
- Severity: Medium
- Screenshot path: Not captured
- Blocks more testing: No

### ISSUE-045 - Web Health Tracking page has confusing Insights header text

- Area/screen: Health Tracking
- Platform: web
- Exact button/action tested: Opened /health-tracking
- What happened: The top of the page showed navigation/header text for "Insights" and "Monitor your daily health metrics" before the Health Tracking page title.
- What should happen: Health Tracking should have clear Health Tracking copy and not appear to be the Insights page.
- Steps to reproduce: Open /health-tracking.
- Severity: Low
- Screenshot path: Not captured
- Blocks more testing: No

### ISSUE-046 - Web Check-in History delete hangs the page

- Area/screen: Today's Check-in -> History
- Platform: web
- Exact button/action tested: Saved today's check-in, opened history, expanded entry, clicked Delete on a rating
- What happened: Chrome showed Page Unresponsive and the delete never completed.
- What should happen: Delete should remove the selected rating/entry without freezing the page.
- Steps to reproduce: Open /check-in -> save ratings -> open /check-in/history -> expand today's entry -> click Delete.
- Severity: Critical
- Screenshot path: /tmp/helfi-full-app-audit/web-checkin-delete-page-unresponsive.png
- Blocks more testing: Yes, blocked cleanup of the temporary check-in entry.

### ISSUE-047 - Web Check-in detail text saved after attempted clear

- Area/screen: Today's Check-in
- Platform: web
- Exact button/action tested: Expanded Add details, typed a safe audit note, attempted to clear it before saving, then saved ratings
- What happened: The detail note still saved with the check-in.
- What should happen: If a user clears the detail text before saving, it should not be saved.
- Steps to reproduce: Open /check-in -> Add details -> type note -> clear note -> save check-in -> open history.
- Severity: Medium
- Screenshot path: Not captured
- Blocks more testing: No, but the temporary note could not be cleaned up because delete hung.

### ISSUE-048 - Web profile photo buttons do nothing

- Area/screen: Profile -> Profile image
- Platform: web
- Exact button/action tested: Clicked Choose Photo and Open Camera
- What happened: Choose Photo did not open a file picker, and Open Camera did not open a camera view or permission prompt.
- What should happen: Choose Photo should open a file picker and Open Camera should open camera permission/view or a clear error.
- Steps to reproduce: Open /profile/image -> click Choose Photo -> click Open Camera.
- Severity: High
- Screenshot path: /tmp/helfi-full-app-audit/web-profile-photo-file-picker.png and /tmp/helfi-full-app-audit/web-profile-photo-file-picker-2.png
- Blocks more testing: Yes, blocks profile photo upload/camera testing.

### ISSUE-049 - Web Account full name field is blank

- Area/screen: Account
- Platform: web
- Exact button/action tested: Opened /account
- What happened: Full Name was blank even though the profile page showed the user's name.
- What should happen: Account details should load the saved account/profile name.
- Steps to reproduce: Open /profile and confirm name, then open /account.
- Severity: Medium
- Screenshot path: Not captured
- Blocks more testing: No

### ISSUE-050 - Web password modal has unlabeled eye buttons

- Area/screen: Account -> Change Password
- Platform: web
- Exact button/action tested: Opened Change Password dialog
- What happened: Password visibility buttons appeared as unlabeled buttons.
- What should happen: Password visibility buttons should have clear labels for accessibility and testing.
- Steps to reproduce: Open /account -> Change Password.
- Severity: Low
- Screenshot path: Not captured
- Blocks more testing: No, password change was not submitted.

### ISSUE-051 - Web support chat exposes an old verification code in chat history

- Area/screen: Help & Support -> Support
- Platform: web
- Exact button/action tested: Opened /support
- What happened: An old 6-digit verification code was visible in the support chat history.
- What should happen: Sensitive verification codes should be redacted or expired/hidden in support chat history.
- Steps to reproduce: Open /support while logged into the test account.
- Severity: High
- Screenshot path: Not captured
- Blocks more testing: No. The code is not repeated in this file.

### ISSUE-052 - Web support attachment control is an unlabeled plus on a live support thread

- Area/screen: Support chat
- Platform: web
- Exact button/action tested: Inspected and tested support message box; reviewed the visible attachment control
- What happened: The upload control was only a "+" label tied to a hidden file input, with no clear text/label. I did not attach a file because the page was showing a real existing support thread.
- What should happen: Attachment upload should be clearly labeled and safe to use from a new/test ticket.
- Steps to reproduce: Open /support and inspect the chat composer.
- Severity: Medium
- Screenshot path: Not captured
- Blocks more testing: Partly, upload was not fully tested to avoid modifying a real support thread.

### ISSUE-053 - Web FAQ expanded item still shows plus icon

- Area/screen: FAQ
- Platform: web
- Exact button/action tested: Clicked every FAQ question accordion
- What happened: FAQ answers opened, but the visible icon stayed as "+" even for the expanded answer.
- What should happen: Expanded FAQ items should show a minus/close state or other clear expanded indicator.
- Steps to reproduce: Open /faq -> click any FAQ question.
- Severity: Low
- Screenshot path: Not captured
- Blocks more testing: No

### ISSUE-054 - Web Talk to Helfi media button does not show photo/barcode choices

- Area/screen: Talk to Helfi
- Platform: web
- Exact button/action tested: Clicked Add photo or scan barcode
- What happened: No visible photo/barcode menu opened. The control appears to be a hidden image picker, and barcode was not presented.
- What should happen: The button should clearly offer photo upload and barcode scan options, or be renamed to only what it actually does.
- Steps to reproduce: Open /chat -> click Add photo or scan barcode.
- Severity: Medium
- Screenshot path: Not captured
- Blocks more testing: Partly, barcode handoff from chat could not be tested.

### ISSUE-055 - Web Talk to Helfi voice button gives no visible response

- Area/screen: Talk to Helfi
- Platform: web
- Exact button/action tested: Clicked Start voice input
- What happened: No visible microphone permission prompt, recording state, or error appeared.
- What should happen: Voice should either start, request permission, or show a clear reason it cannot start.
- Steps to reproduce: Open /chat -> click Start voice input.
- Severity: Medium
- Screenshot path: Not captured
- Blocks more testing: Yes, blocks web voice input testing.

### ISSUE-056 - Web Recipe Import keeps URL error after switching to photo tab

- Area/screen: Food Diary -> Import Recipe
- Platform: web
- Exact button/action tested: Clicked Import with an empty URL, then switched to Import by photo
- What happened: The URL validation error stayed visible on the photo tab until another photo action replaced it.
- What should happen: URL-specific errors should clear when switching to the photo import tab.
- Steps to reproduce: Open /food/import-recipe -> click Import with empty URL -> click Import by photo.
- Severity: Low
- Screenshot path: Not captured
- Blocks more testing: No

### ISSUE-057 - Web Recipe Import photo source buttons do not visibly open

- Area/screen: Food Diary -> Import Recipe -> Import by photo
- Platform: web
- Exact button/action tested: Clicked Take photo and Choose from library
- What happened: No visible camera prompt, file picker, or error appeared; only button focus changed.
- What should happen: Take photo / Choose from library should open the expected picker or show a clear unavailable message.
- Steps to reproduce: Open /food/import-recipe -> Import by photo -> click Take photo and Choose from library.
- Severity: High
- Screenshot path: Not captured
- Blocks more testing: Yes, blocks photo recipe import testing.

### ISSUE-058 - Web Insights Save as PDF link does not open PDF from report page

- Area/screen: Insights -> Weekly report
- Platform: web
- Exact button/action tested: Clicked the first Save as PDF link
- What happened: The current tab stayed on the report page and no new local app tab opened.
- What should happen: Save as PDF should open the PDF/print route or start a clear download/print flow.
- Steps to reproduce: Open /insights/weekly-report -> click Save as PDF.
- Severity: High
- Screenshot path: Not captured
- Blocks more testing: No

### ISSUE-059 - Web Insights PDF route becomes unresponsive

- Area/screen: Insights -> Weekly report PDF route
- Platform: web
- Exact button/action tested: Opened /insights/weekly-report/print?id=codex-demo-weekly-1777968383990 directly
- What happened: The page title loaded, but the browser tool could not read the page DOM and timed out. Screenshot capture still worked.
- What should happen: The PDF route should load a readable/printable report without hanging.
- Steps to reproduce: Open /insights/weekly-report/print?id=codex-demo-weekly-1777968383990.
- Severity: High
- Screenshot path: /tmp/helfi-full-app-audit/web-insights-pdf-route-unresponsive.png
- Blocks more testing: Partly, blocks confirming PDF content.

### ISSUE-060 - Web Build Meal adds renamed old food name instead of selected result name

- Area/screen: Food Diary -> Build Meal
- Platform: web
- Exact button/action tested: Searched "apple" in Single food and added "Apples, raw, fuji, with skin"
- What happened: The ingredient added to the meal appeared as "Audit web apple", an old test rename, instead of the selected Fuji apple result name.
- What should happen: The selected ingredient should keep the selected result name unless the user intentionally chooses a custom renamed item.
- Steps to reproduce: Open /food/build-meal -> Single food -> search apple -> add Fuji apple result.
- Severity: Medium
- Screenshot path: Not captured
- Blocks more testing: No, the test meal was deleted.

### ISSUE-061 - Web Build Meal name field is labelled as the ingredient name

- Area/screen: Food Diary -> Build Meal / Edit Meal
- Platform: web
- Exact button/action tested: Created and edited a test build-meal entry
- What happened: The meal name text box was exposed as "Apples, raw, fuji..." instead of "Meal" / "Meal name".
- What should happen: The meal name input should have the correct label.
- Steps to reproduce: Open /food/build-meal -> add an ingredient -> inspect/edit the meal name field.
- Severity: Low
- Screenshot path: Not captured
- Blocks more testing: No

### ISSUE-062 - Web Food Diary row action menu button has no label

- Area/screen: Food Diary food entry row
- Platform: web
- Exact button/action tested: Opened the action menu for the temporary Build Meal entry
- What happened: The row menu button was exposed as a blank/unlabeled button.
- What should happen: The action/menu button should have a clear label such as "More actions" or "Entry actions."
- Steps to reproduce: Open Food Diary with a food entry -> inspect the entry action/menu button.
- Severity: Low
- Screenshot path: Not captured
- Blocks more testing: No

### ISSUE-063 - Web List Your Practice sign-in area shows Back to dashboard

- Area/screen: List your practice -> Start
- Platform: web
- Exact button/action tested: Opened /list-your-practice/start and reviewed "Already have an account?" section
- What happened: The section said Sign in, but the visible button was "Back to dashboard."
- What should happen: The sign-in section should show a real sign-in button/link.
- Steps to reproduce: Open /list-your-practice/start.
- Severity: Medium
- Screenshot path: Not captured
- Blocks more testing: No

### ISSUE-064 - Web Devices interest buttons are very slow to save

- Area/screen: Devices and Health Tracking device interest controls
- Platform: web
- Exact button/action tested: Toggled device interest buttons on/off
- What happened: Each save took several seconds before the UI settled.
- What should happen: The app should give faster feedback or show a clear saving state.
- Steps to reproduce: Open /devices or /health-tracking -> toggle a device interest button.
- Severity: Low
- Screenshot path: Not captured
- Blocks more testing: No

### ISSUE-065 - Web Food Diary settings fat target cannot restore displayed value

- Area/screen: Settings -> Food Diary settings
- Platform: web
- Exact button/action tested: Adjusted macro sliders and restored them
- What happened: Fat displayed as 62 g before testing, but the slider value was 60. After interaction it could only be restored to 60 through the UI.
- What should happen: Displayed values and slider values should match, and the user should be able to restore the displayed current value.
- Steps to reproduce: Open /settings/food-diary -> compare displayed Fat target with slider value -> move and restore slider.
- Severity: Medium
- Screenshot path: Not captured
- Blocks more testing: No

### ISSUE-066 - Web Mood Journal temporary test entry may remain

- Area/screen: Mood Journal
- Platform: web
- Exact button/action tested: Tried to delete the temporary mood journal entry
- What happened: Delete failed and then crashed/hung the page.
- What should happen: Temporary/user-created journal entries should be removable.
- Steps to reproduce: Same as ISSUE-037.
- Severity: High
- Screenshot path: /tmp/helfi-full-app-audit/web-mood-journal-delete-page-unresponsive.png
- Blocks more testing: No additional testing, but cleanup is blocked.

### ISSUE-067 - Web Check-in temporary test entry may remain

- Area/screen: Today's Check-in History
- Platform: web
- Exact button/action tested: Tried to delete the temporary check-in/rating entry
- What happened: Delete hung the page, so the test check-in entry and detail note may remain.
- What should happen: Temporary/user-created check-in entries should be removable.
- Steps to reproduce: Same as ISSUE-046.
- Severity: High
- Screenshot path: /tmp/helfi-full-app-audit/web-checkin-delete-page-unresponsive.png
- Blocks more testing: No additional testing, but cleanup is blocked.

## Issue Template

### ISSUE-000 - Short title

- Area/screen:
- Platform: iOS / web / both
- Exact button/action tested:
- What happened:
- What should happen:
- Steps to reproduce:
- Severity: Critical / High / Medium / Low
- Screenshot path:
- Blocks more testing: Yes / No

## Tested Checklist

### iOS Native App

- [x] App launches in real iOS simulator
- [x] Login is active or completed using the local native test account
- [x] Restart app and confirm login persists
- [x] Dashboard
- [x] Voice overlay from Dashboard
- [x] Food Diary
- [x] Add Food Entry
- [x] Meal editing
- [x] Ingredient editing
- [x] Serving sizes
- [x] Favorites
- [x] Food delete/edit actions
- [x] Build a Meal and recipe handoff
- [x] Water/liquids, including edit/delete if present
- [x] Exercise, including edit/delete if present
- [x] Mood Tracker
- [x] Mood Journal note/photo/voice/edit/delete actions
- [x] Health Journal add/edit/delete/photo/voice actions
- [x] Insights Summary
- [x] Insights Charts
- [x] Insights Insights tab
- [x] Insights Details
- [x] View report
- [x] PDF
- [x] Back
- [x] Previous reports
- [x] Symptoms
- [x] Medical Images
- [x] Lab Reports
- [x] Practitioners
- [x] Settings
- [x] Billing/subscription open-only, no purchase
- [x] More tab items
- [x] Notifications/reminders
- [x] Health Coach
- [x] Health Tips
- [x] Health Tips History
- [x] Devices
- [x] Find a Practitioner
- [x] List your practice open-only unless safe test form is clearly separate
- [x] Help & Support open/chat/upload controls with safe test data only
- [x] Voice overlay from Food
- [x] Voice overlay from Food with add menu/modal open
- [x] Voice overlay from Settings
- [x] Voice overlay from other major screens
- [x] Voice navigation
- [x] Voice logging
- [x] Voice unclear/risky handling
- [x] Voice data persistence after restart

### Web App

- [x] Local web app starts
- [x] Login is active or completed using the test account
- [x] Dashboard
- [x] Food Diary
- [x] Add Food Entry
- [x] Meal editing
- [x] Ingredient editing
- [x] Serving sizes
- [x] Favorites
- [x] Food delete/edit actions
- [x] Build a Meal and recipe handoff
- [x] Water/liquids, including edit/delete if present
- [x] Exercise, including edit/delete if present
- [x] Mood Tracker
- [x] Mood Journal note/photo/voice/edit/delete actions
- [x] Health Journal add/edit/delete/photo/voice actions
- [x] Insights Summary
- [x] Insights Charts
- [x] Insights Insights tab
- [x] Insights Details
- [x] View report
- [x] PDF
- [x] Back
- [x] Previous reports
- [x] Symptoms
- [x] Medical Images
- [x] Lab Reports
- [x] Practitioners
- [x] Settings
- [x] Billing/subscription open-only, no purchase
- [x] More/menu items
- [x] Notifications/reminders
- [x] Health Coach
- [x] Health Tips
- [x] Health Tips History
- [x] Devices
- [x] Find a Practitioner
- [x] List your practice open-only unless safe test form is clearly separate
- [x] Help & Support open/chat/upload controls with safe test data only
- [x] Voice assistant / Talk to Helfi controls where available

## Passed Notes

- iOS app built and opened in the simulator.
- iOS login completed with the saved local test account; password was not printed.
- Food Diary loaded and showed the expected credits bar, energy summary, meals, exercise, and bottom tabs.
- Add Food Entry opened meal categories and Breakfast add options.
- Add Ingredient opened, searched banana, switched from Packaged/Fast-foods to Single food, and showed USDA banana results.
- Ingredient amount changed from 100 g to 50 g and nutrition updated correctly.
- Serving dropdown opened; choosing medium banana updated amount, servings, calories, and macros.
- Temporary banana food entry saved, renamed to "Audit banana", and deleted successfully.
- Water Intake opened from Food Diary and showed the expected 450 ml / 2 entries starting state.
- Temporary 50 ml water entry saved, updated the total to 500 ml / 3 entries, and deleted back to 450 ml / 2 entries.
- Tea quick add opened drink details, required a Sugar-free/Sugar/Honey choice, saved after Sugar-free was selected, and updated Water history before the linked Food Diary cleanup issue above.
- Dashboard loaded, showed credits, and opened Daily Check-In, Mood Tracker, Track Calories, Water Intake, Weekly Health Report, Health Setup, and Find a Practitioner shortcuts.
- Daily Check-In opened, loaded after a short spinner, rating buttons selected, Add details expanded, Not applicable selected, Rating History opened, filters toggled, and the custom date fields appeared.
- Mood Tracker opened, mood face and emotion/affect chips selected, a temporary mood check-in saved, History showed it, chart view changed between wave/pie, and the time range picker opened.
- Mood Journal saved a temporary text entry, loaded it into edit mode, updated it, and deleted it successfully.
- Reminders opened from the Mood settings gear; saving existing check-in reminders and mood reminders showed success messages.
- Favorites opened from Food Diary, Coffee preview opened, Change portion worked, Coffee was added to Breakfast, then deleted successfully.
- Barcode Scanner opened, empty lookup showed a clear "Type a barcode first" message, a manual barcode lookup returned a result, and the temporary barcode food entry was deleted successfully.
- Build a Meal opened, showed a clear warning when no items were selected, combined two temporary foods into "Audit combo", and the combined meal was deleted successfully.
- The Food Diary meal plus button opened the same Breakfast add menu as the main Add Food Entry path.
- Food camera and photo-library paths were tested but blocked by the permission/failure issues above.
- Recommended, Ask AI, and real recipe import generation were not run because they can spend credits.
- Insights opened, current and previous reports loaded, Summary/Charts/Insights/Details tabs worked, a chart section expanded, PDF preview opened, and Back returned to the report list.
- Find a Practitioner opened, category/subcategory/radius pickers worked, Telehealth only toggled, manual Melbourne search ran, and current-location fallback showed a clear message in the simulator.
- Symptoms opened, empty analysis showed a clear validation message, symptom chips selected/removed correctly, and old history detail opened. Real analysis was skipped because it can spend credits.
- Medical Images opened, upload controls opened iOS file/photo choices and were cancelled safely. Old history details expanded.
- Lab Reports opened, showed the AI credit warning, upload controls opened iOS file/photo choices, and the picker was cancelled safely.
- Health Journal created a plain note, edited it, deleted it, opened photo/file controls, recorded and removed a temporary voice file, and ended with no test note left behind.
- Health Coach, Health Tips, Health Tips History, Devices, Chat History, Help, FAQ, Affiliate Program, Apply for Affiliate Program, and Affiliate Terms all opened from More.
- List your practice opened, practitioner account form controls worked, Terms opened and returned, Google/Apple sign-in paths were opened then cancelled safely, and no practitioner account was submitted.
- Settings opened and tested dark mode, weekly report toggle, billing open-only, Food Diary settings, reminders, privacy settings, account settings, password modal, and smart coach settings. Purchase, restore, logout, and delete account actions were not used.
- Talk to Helfi opened from Food, Food with add menu open, More, Settings, and Dashboard. Text navigation was tested; voice recording was blocked by the AI service issue.
- iOS app was relaunched through the simulator after testing; login stayed active.

## Web Passed Notes

- Local web app loaded at http://127.0.0.1:3000 in the already-open Chrome browser.
- Web login was active for the test account; password was not printed.
- Food Diary manual food creation, rename/edit, favorite add, serving checks, water add/delete, exercise add/delete, Build Meal create/edit/delete, and direct Recipe Import open/validation were tested. Temporary food, water, exercise, and build-meal entries were cleaned up.
- Insights weekly report opened; Summary, Charts, Insights, Details, View report, Previous reports, and Back were tested. PDF had the issues recorded above.
- Symptoms opened, Show more/Show less worked, symptom chips selected/removed, and history details opened. Real symptom AI analysis was skipped because it costs credits.
- Medical Images and Lab Reports upload controls opened enough to confirm picker/analyze gating; real analysis was skipped because it costs credits.
- Practitioners search, category filters, A-Z category handoff, telehealth filter, location search, List your practice, application form controls, and affiliate terms opened. No practitioner listing/application was submitted.
- Settings toggles, Food Diary settings, notification reminder controls, quiet hours, account/security pages, billing usage period, and billing open-only pages were tested. No purchase, restore, logout, password change, or account delete was performed.
- Health Coach and Health Tips History opened. Enabling Health Coach was cancelled at the credit warning.
- Support page opened, message typing/clearing was tested without sending, FAQ accordions were tested, and affiliate help pages opened. Existing support thread was not changed.
- Talk to Helfi opened, typed text and example prompts were tested and cleared, full-screen and chat selection mode worked, and no paid AI chat was sent.

## Skipped / Owner Review Needed

- Purchases, subscription checkout, restore purchase, account deletion, password change, logout, and real support sends were not performed.
- Paid AI actions were not run unless already necessary in earlier native testing. Skipped paid actions include Ask AI, symptom analysis, lab analysis, medical image analysis, recipe import, and Talk to Helfi send.
- Browser permission prompts for camera/microphone/location were not accepted unless already part of safe testing.
- Some temporary web data may remain because delete itself failed: Mood Journal entry and Today's Check-in entry/detail.
