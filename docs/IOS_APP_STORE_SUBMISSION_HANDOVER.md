# COPY/PASTE HANDOVER - Helfi iOS App Store Submission

This handover is for the next agent continuing the Helfi iOS App Store launch.

## Owner preference

- Keep replies short, simple, and plain English.
- The owner is not technical.
- Do not use long explanations unless absolutely needed.
- Do not submit the app to Apple until the owner clearly approves.
- Use the already-open browser if browser work is needed.
- Do not log Apple out.
- Do not try to relogin unless truly blocked.
- Do not print, copy, or expose passwords, keys, one-time codes, or secret values.

## Project folder

Work only here:

`/Volumes/U34 Bolt/HELFI APP/helfi-app`

Do not create side copies, side worktrees, or duplicate app folders.

## Must-read files before doing work

1. `config.toml`
2. `AGENTS.md`
3. `PROJECT_STATUS.md`
4. `GUARD_RAILS.md`
5. This file: `docs/IOS_APP_STORE_SUBMISSION_HANDOVER.md`

Do not use or recreate:

- `AGENT_START_HERE.md`
- `AGENT_HANDOVER_MESSAGE.md`

## Current main Linear ticket

Use this Linear ticket for the remaining launch work:

`HEL-408 - Final iOS real-user testing and App Store submission runway`

Related tickets:

- `HEL-388` - Full pre-TestFlight audit of web and iOS before build 9
- `HEL-351` - Native iOS Apple App Store sandbox payments
- `HEL-405` - Create App Store screenshots
- `HEL-406` - Choose and store App Store mockups
- `HEL-407` - Submission readiness assessment

Before working, comment on `HEL-408` with the area you will touch.

## Current App Store status

The app has been submitted to Apple.

Latest known status:

- iOS App Version 1.0 is `Waiting for Review`.
- Submitted item: iOS App 1.0 / build 10 / version 1.0.0.
- Apple showed `1 Item Submitted`.
- Apple said review can take up to 48 hours.
- Next daily checks should watch for Apple review feedback, approval, rejection, or requested changes.

Do not submit, resubmit, cancel, or change anything in App Store Connect unless the owner clearly approves.

## Submission completed - 2026-06-06 around 1:23 PM Melbourne time

Confirmed in Linear:

- `HEL-408` is now `Done`.
- The app was submitted to Apple.
- Final App Store Connect status was `Waiting for Review`.

Items finished before submission:

- Build 10 selected instead of build 9.
- All 7 Apple payment products selected for review with the app.
- Added and processed 10 iPad 13-inch screenshots.
- Set content rights information.
- Set primary category to Health & Fitness.
- Completed age-rating answers.
- Set app download price to free in all countries/regions.

Current next step:

1. Check Apple email/App Store Connect daily for review status.
2. If Apple approves, tell the owner and confirm release status.
3. If Apple rejects or asks for changes, summarize the feedback in plain English and update Linear/handover.
4. Do not make App Store changes without owner approval.

## Rejection investigation - 2026-06-15 around 7:00 PM Melbourne time

Apple rejected Helfi AI iOS 1.0 after reviewing build 11 on an iPad Air 11-inch (M3), iPadOS 26.5.

Apple listed these issues:

- Missing Terms of Use/EULA link in the App Store metadata.
- Microphone button showed an error.
- Health/medical safety wording needs stronger doctor-advice wording.
- Medical Image Analyzer and Symptom Analysis need easy-to-find citations/sources.
- Apple Health/HealthKit permission flow used a button labelled `Connect`; Apple wants wording like `Continue` or `Next`.
- HealthKit functionality was not clearly identified in the app UI.
- Subscription purchase showed an error; Apple also said to check product setup and the Paid Apps Agreement.

Local code changes started for this rejection:

- `native/src/screens/DashboardScreen.tsx`: Apple Health now says `Apple Health (HealthKit)`, explains what HealthKit data is read, and changes the pre-permission button from `Connect` to `Continue`.
- `native/src/screens/BillingScreen.tsx`: Subscription plans now show Terms of Use and Privacy Policy links in the app.
- `app/symptoms/page.tsx`: Symptom results now show stronger doctor-advice wording and visible general source links.
- `app/medical-images/page.tsx`: Medical image results now show stronger doctor-advice wording and visible general source links.

Important blocker:

- App Store Connect still shows `Apple Developer Program License Agreement Updated`.
- Apple says Louie must accept the latest agreement by June 24, 2026.
- App Store metadata appeared read-only during this check, so the Terms/EULA link could not be saved in the App Store description yet.
- Do not accept legal agreements on the owner’s behalf. The owner/account holder needs to review and accept them.

Suggested App Store description addition once editing is available:

`Terms of Use: https://helfi.ai/terms. Privacy Policy: https://helfi.ai/privacy. Helfi is for personal health tracking and organisation only. It is not a medical device and does not provide medical advice, diagnosis, or treatment. Always seek a doctor’s advice in addition to using this app and before making medical decisions.`

## Latest daily review check - 2026-06-10 around 1:00 PM Melbourne time

This was a read-only review status check.

Confirmed:

- Linear `HEL-408` has no newer Helfi Apple response after the 2026-06-09 daily check.
- Last confirmed Helfi Apple status remains `Waiting for Review`.
- The open `eversohealthy@gmail.com` Gmail account showed no Apple/App Store Connect messages from the last 7 days.
- The open `helfiweb@gmail.com` Gmail account showed Apple emails for another app and an Apple Developer update, but no Helfi Apple review approval, rejection, or requested-changes email.
- A Helfi-specific Gmail search found no matching Apple/App Store Connect message from the last 14 days.
- Apple Mail sender/subject search showed an Apple invoice email and internal Helfi alerts, but no Helfi App Review approval, rejection, or requested-changes email.
- App Store Connect is still on the login page in Chrome.
- No Apple login was attempted and no SMS code was triggered.
- No App Store changes were made.

Current next step:

1. Keep checking Apple email/App Store Connect daily.
2. Because the app has now been waiting several days, direct App Store Connect access is the most useful next check, but only with the owner available for Apple SMS two-factor authentication.
3. If Apple sends review feedback, summarize it in plain English before changing anything.
4. Do not submit, resubmit, cancel, release, or change anything without owner approval.

## Latest daily review check - 2026-06-09 around 1:00 PM Melbourne time

This was a read-only review status check.

Confirmed:

- Linear `HEL-408` has no newer Apple response after the 2026-06-08 daily check.
- Last confirmed Apple status remains `Waiting for Review`.
- The open Gmail account showed no recent Apple/App Store Connect review message from the last 5 days.
- Apple Mail sender/subject search showed an Apple invoice email, but no App Review approval, rejection, or requested-changes email.
- App Store Connect is still on the login page in Chrome.
- No Apple login was attempted and no SMS code was triggered.
- No App Store changes were made.

Current next step:

1. Keep checking Apple email/App Store Connect daily.
2. Because the app has now been waiting more than 48 hours, direct App Store Connect access may be useful soon, but only with the owner available for Apple SMS two-factor authentication.
3. If Apple sends review feedback, summarize it in plain English before changing anything.
4. Do not submit, resubmit, cancel, release, or change anything without owner approval.

## Latest daily review check - 2026-06-08 around 1:00 PM Melbourne time

This was a read-only review status check.

Confirmed:

- Linear access is working again.
- Linear `HEL-408` still shows the latest confirmed Apple status as `Waiting for Review`.
- The open Gmail account showed no recent App Store Connect email from the last 3 days.
- Apple Mail sender/subject search showed no Apple/App Store review result or rejection email.
- App Store Connect is still on the login page in Chrome.
- No Apple login was attempted and no SMS code was triggered.
- No App Store changes were made.

Current next step:

1. Keep checking Apple email/App Store Connect daily.
2. If App Store Connect access is needed, ask the owner first so they can help with Apple SMS two-factor authentication.
3. If Apple sends review feedback, summarize it in plain English before changing anything.
4. Do not submit, resubmit, cancel, release, or change anything without owner approval.

## Latest daily review check - 2026-06-08 early morning Melbourne time

This was a read-only review status check.

Confirmed:

- Last known Apple status is still `Waiting for Review` from the 2026-06-06 submission note.
- App Store Connect is currently on the login page in Chrome.
- No Apple login was attempted and no SMS code was triggered.
- The open Gmail account showed no recent App Store Connect message from the last 3 days.
- Apple Mail sender/subject search showed no recent Apple/App Store review email from the last 3 days.
- Linear access in Codex is still expired, so Linear could not be updated from this check.
- The daily automation timing was adjusted back toward the owner's requested 1 pm Melbourne check window.

Current next step:

1. Keep checking Apple email/App Store Connect daily.
2. If App Store Connect asks for Apple SMS two-factor authentication, pause and ask the owner.
3. If Apple sends review feedback, summarize it in plain English before changing anything.
4. Do not submit, resubmit, cancel, release, or change anything without owner approval.

## Latest daily check - 2026-06-06 around 1:00 PM Melbourne time

This was a read-only App Store/Linear check plus safe local asset preparation.

Confirmed in Linear:

- `HEL-408` is `In Progress`.
- No Helfi Dev ticket is currently in `Ready to deploy`.
- Earlier on 2026-06-06, the two known app blockers were fixed:
  - Talk to Helfi timeout.
  - Duplicate bottom navigation inside native embedded tools.
- The web/backend fix was deployed to live and verified.
- iOS version 1.0.0 build 10 was built and uploaded to Apple.
- Earlier blocker was App Store Connect login/API access, but the browser is now logged in again.

Confirmed in App Store Connect:

- App Store Connect opens in Chrome and is logged in.
- Helfi AI iOS version 1.0 still shows `Prepare for Submission`.
- Build 10 / 1.0.0 is selected on the version page.
- iPhone screenshots still show `10 of 10 Screenshots`.
- In-App Purchases and Subscriptions are visible on the version page, including the monthly plans and credit packs.
- `Add for Review` is visible but blocked.
- Apple shows `Unable to Add for Review`.
- Visible required items:
  - `You must upload a screenshot for 13-inch iPad displays.`
  - `You must respond to the required age ratings questions. Go to App Information`
- Nothing was submitted to Apple.

New local files created:

- iPad-sized screenshot candidates were created from the selected 10 mockups.
- Folder:
  `public/MOBILE MOCKUPS/APP STORE IOS SUBMISSION/ipad-13-app-store-ready-2048x2732`
- Files are PNGs at 2048 x 2732.
- A few were visually inspected and were not blank or broken.
- They have not been uploaded to Apple yet.

Previous blockers after this check, now cleared:

1. Upload 13-inch iPad screenshots in App Store Connect.
2. Answer the required age-rating questions in App Information.
3. Do one last quick final review of metadata/build/screenshots after the blockers clear.
4. Get explicit owner approval before clicking `Add for Review`.

## Latest continuation status - 2026-06-04

Do not restart from scratch. The following items were confirmed in the latest continuation:

- App Store Connect still shows iOS App Version 1.0 as `Prepare for Submission`.
- Build 9 is still selected on the App Store version.
- Chrome/Codex local file upload permission was fixed by enabling Chrome extension `Allow access to file URLs`.
- The original selected screenshot folder had exactly 10 PNG files at 1290 x 2796.
- App Store Connect rejected the 1290 x 2796 files because that exact size was not accepted for the iPhone 6.5-inch screenshot slot.
- Corrected copies were created at Apple's accepted size, 1284 x 2778.
- Corrected screenshot folder: `public/MOBILE MOCKUPS/APP STORE IOS SUBMISSION/selected-10-app-store-ready-1284x2778`
- All 10 corrected files were verified as 1284 x 2778.
- The corrected screenshots were uploaded to App Store Connect.
- App Store Connect now shows `10 of 10 Screenshots`.
- The normal `Save` button was disabled after upload, while `Add for Review` was available. This likely means Apple accepted/auto-saved the screenshots, but do not submit without owner approval.
- Do not click `Add for Review`.

Follow-up verification on 2026-06-04:

- App Store Connect was rechecked in the already-open Chrome tab.
- It still showed iOS App Version 1.0 as `Prepare for Submission`.
- It still showed Build 9.
- It still showed `10 of 10 Screenshots`.
- `Save` was still disabled and `Add for Review` was visible/enabled.
- The recent Gmail Apple search tab did not show a visible new Apple status message.
- Web page lock check passed: `npm run check:page-locks`.
- Native page lock check passed: `npm --prefix native run check:page-locks`.
- No app code was changed during these checks.

Additional native simulator checks on 2026-06-04:

- The currently booted simulator was iPhone 16e: `BDD79FD0-6ED1-474D-88A1-4FD8EFAD4A75`.
- The iOS tool defaults already pointed to the correct workspace, scheme, simulator, and bundle ID.
- Talk to Helfi still visibly showed `Something went wrong. Please try again.`
- Dashboard loaded and showed 1,710 credits remaining after refresh.
- Insights opened, initially showed `Loading your Insights...`, then loaded successfully.
- Insights showed `Your latest report is ready to view.`
- Insights showed `Next report due 08 Jun 2026`, which is a future date from the 2026-06-04 test date.
- Food Diary opened and showed today's summary.
- Settings opened. It briefly showed `Saving...` without any intentional setting change, then cleared to `Weekly reports are on.`
- No app code was changed during these simulator checks.

Further no-code simulator checks on 2026-06-04:

- Dashboard remained signed in and showed 1,710 credits remaining.
- Dashboard scrolled normally into the health/device connection area.
- Dashboard showed wearable connection options such as Apple Health, Fitbit, Garmin Connect, Google Fit, Oura Ring, Polar, and Huawei Health.
- Settings scrolled normally into Privacy Settings and Account Actions.
- Settings showed `Mode: Signed in`.
- Settings showed `Connected to: https://helfi.ai`.
- The More tab was visible, but the simulator automation only exposed the bottom tab buttons as tappable targets, not each More tool row. Do not force blind taps.
- No app code was changed during these checks.

Further App Store / coordination checks on 2026-06-04:

- Linear `Helfi Dev` had no ticket in `Ready to deploy`.
- Linear `HEL-408` was still `In Progress`.
- App Store Connect was rechecked again in the already-open Chrome tab.
- App Store Connect still showed iOS App Version 1.0 as `Prepare for Submission`.
- App Store Connect still showed Build 9 / 1.0.0.
- App Store Connect still showed `10 of 10 Screenshots`.
- No screenshot dimension error was visible.
- `Save` was still disabled.
- `Add for Review` was still visible/enabled, but it was not clicked.
- The existing Gmail Apple search tab still showed no visible new Apple status message.
- No app code was changed during these checks.

Read-only payment/subscription check attempt on 2026-06-04:

- The App Store Connect app page exposed links for `In-App Purchases` and `Subscriptions`.
- A read-only attempt was made to open the App Store Connect `Subscriptions` area.
- The direct Subscriptions page only exposed the App Store Connect header text to automation, not the subscription list/status.
- A reload attempt hung and the browser control tool reset.
- The App Store Connect tab was found again and left open as a handoff tab.
- Result: Apple subscription/payment status was not verified in this pass. Do not treat this as completed.
- No App Store changes were made and no app code was changed.

Read-only blocker code investigation on 2026-06-04:

- Talk to Helfi normal chat calls `app/api/chat/voice/route.ts`.
- The web/mobile chat UI hides raw database errors and shows `Something went wrong. Please try again.` when the backend mentions a Prisma/database transaction.
- The charge calls are at `app/api/chat/voice/route.ts` around lines 1446 and 1535.
- Those calls use `CreditManager.chargeCents(...)`.
- `CreditManager.chargeCents(...)` starts at `lib/credit-system.ts` line 272.
- `CreditManager.chargeSplitCredits(...)` starts at `lib/credit-system.ts` line 365.
- Both currently use Prisma's default interactive transaction timeout.
- Earlier live evidence showed the failing chat path hit Prisma's 5000 ms transaction timeout.
- Likely smallest Talk to Helfi fix, after owner approval: add a small shared transaction options object in `lib/credit-system.ts` and pass a longer timeout to `chargeCents` and `chargeSplitCredits`.
- Do not change credit prices.
- Do not bypass charging.
- Do not mark threads as charged unless credits/free use were actually handled.
- This touches protected credit/billing code and must not be edited without explicit owner approval.

Read-only double bottom menu investigation on 2026-06-04:

- The native embedded web tool wrapper is `native/src/screens/NativeWebToolScreen.tsx`.
- The website bottom menu hide rule is injected at `native/src/screens/NativeWebToolScreen.tsx` around lines 96-103.
- The current script creates one style tag and appends it to `document.head` before the web page finishes loading.
- Likely cause: if the page head is not ready or later page navigation/content replaces the relevant DOM, the hide style may not reliably apply.
- Likely smallest double-menu fix, after owner approval: make the injected script idempotent and re-apply the native webview marker/style after the page is ready, for example on `DOMContentLoaded` and with a short retry/timer.
- Keep the native bottom nav in `native/src/navigation/MainNavigator.tsx`.
- Do not change web page layouts or shared web navigation.
- This touches locked native UI code and must not be edited without explicit owner approval.

Blocked status set on 2026-06-04:

- Linear `HEL-408` was moved to `Todo` and labelled `Blocked`.
- Reason: remaining work needs owner approval or manual Apple verification.
- Blocker 1: Talk to Helfi needs protected credit/billing code approval.
- Blocker 2: native double bottom menu needs locked native UI code approval.
- Blocker 3: Apple subscription/payment status could not be verified from App Store Connect automation.
- Blocker 4: Apple submission requires explicit owner approval.
- Exact approval phrase to unblock the two code fixes: `Approved to fix Talk to Helfi and double bottom menu`.
- No app code was changed while marking the ticket blocked.

Latest native/user testing findings:

- Native simulator stayed logged in to the standard test account after relaunch.
- Food Diary opened, previous day loaded, add food flow opened, and manual food search returned results.
- Talk to Helfi fails from the normal chat screen with `Something went wrong. Please try again.`
- A direct non-streaming live endpoint test returned a valid Talk to Helfi reply.
- A direct streaming live endpoint test failed with a database transaction timeout during the credit-charge path: `Transaction already closed... timeout ... 5000 ms`.
- Likely smallest Talk to Helfi fix: increase the credit-charge transaction timeout without changing credit prices or billing rules.
- This touches protected credit logic, so do not edit without owner approval.
- Duplicate bottom navigation was reconfirmed on embedded native web-tool screens such as Health Journal, Symptom Analysis, and Medical Image Analyzer.
- Likely smallest duplicate-menu fix: make `native/src/screens/NativeWebToolScreen.tsx` apply its website-bottom-menu hiding style reliably after the page is ready.
- `native/src/screens/NativeWebToolScreen.tsx` is locked, so do not edit without owner approval.

Exact owner approval phrase requested:

`Approved to fix Talk to Helfi and double bottom menu`

## App Store Connect status from last known work

App:

- Helfi AI

App Store Connect page:

`https://appstoreconnect.apple.com/apps/6758901806/distribution/ios/version/inflight`

Known status:

- iOS App Version 1.0 is still `Prepare for Submission`.
- Build 9 is uploaded, processed, selected, and saved.
- App Store description is saved.
- Keywords are saved.
- Support URL is saved.
- Marketing URL is saved.
- Copyright is saved.
- Review login is saved.
- Contact info is saved.
- Review notes are saved.
- App Privacy is completed and published.
- Screenshots now show `10 of 10 Screenshots`.

Do not click `Add for Review` until screenshots are uploaded and final checks pass.

## Screenshot/mockup locations

Chosen App Store mockups are stored in the main project here:

`/Volumes/U34 Bolt/HELFI APP/helfi-app/public/MOBILE MOCKUPS/APP STORE IOS SUBMISSION`

Apple-accepted upload folder:

`/Volumes/U34 Bolt/HELFI APP/helfi-app/public/MOBILE MOCKUPS/APP STORE IOS SUBMISSION/selected-10-app-store-ready-1284x2778`

Prepared 13-inch iPad candidate folder:

`/Volumes/U34 Bolt/HELFI APP/helfi-app/public/MOBILE MOCKUPS/APP STORE IOS SUBMISSION/ipad-13-app-store-ready-2048x2732`

Do not upload the old `selected-10-app-store-ready-1290x2796` folder. Apple rejected that size.

Recommended order:

1. Dashboard main
2. Food Diary overview
3. Food Diary meals
4. Food add options
5. Food AI macro coach
6. Insights main
7. Weekly health report
8. Talk to Helfi
9. Symptom analysis
10. Medical image analyzer

Apple currently allows 1 to 10 screenshots per device size.

Use the selected 10 unless the owner asks otherwise.

## Browser upload note

Previous blocker, now fixed:

- Codex Chrome file upload was blocked when trying to upload screenshots.
- Chrome extension `Allow access to file URLs` was enabled and upload then worked.
- The first upload after that failed only because the old screenshots were the wrong size.
- The corrected 1284 x 2778 screenshots uploaded successfully.

If needed, enable this in Chrome:

1. Open `chrome://extensions`
2. Open Codex extension details
3. Enable `Allow access to file URLs`
4. Then upload screenshots through App Store Connect

Do not log Apple out.

## Native app details

iOS workspace:

`/Volumes/U34 Bolt/HELFI APP/helfi-app/native/ios/Helfi.xcworkspace`

Scheme:

`Helfi`

Bundle ID:

`ai.helfi.app`

Previously used simulator:

- iPhone 17 Pro
- Simulator ID: `F63759DD-2EB0-4AFE-9E31-F8F6229A4902`

Test account:

- Email is stored in `.env.local` as `NATIVE_TEST_EMAIL`
- Password is stored in `.env.local` as `NATIVE_TEST_PASSWORD`
- Standard test email is `info@sonicweb.com.au`

Never print the password.

Keep the native app logged in to the test account unless testing logout/login/account-switching.

## Daily automation

A daily Codex automation has been created:

`daily-helfi-ios-app-store-progress`

Schedule:

- Runs daily around 1:00 pm Melbourne time.
- The owner chose this time because they are more likely to be nearby if Apple sends an SMS code.

Purpose:

- Continue moving the iOS App Store submission forward every day.
- Check Linear status.
- Check Apple/App Store Connect/email status where access allows.
- Report what changed, what is blocking, and the next step.

Important:

- The automation must not submit to Apple without owner approval.
- It must not print secrets or codes.
- It must not delete/send/archive emails.

## Apple / email access notes

The owner has shown that:

- App Store Connect can be opened in the already-open Chrome browser.
- The Apple login is saved in Chrome Password Manager.
- App Store Connect may log out over time.
- If Apple asks for SMS two-factor authentication, the code goes to the owner. The daily automation runs around 1:00 pm Melbourne time so the owner is more likely to be nearby.
- Gmail is already logged in and normally stays logged in.
- Apple Mail is available and can be searched/read for project-related emails.

If Apple asks for SMS two-factor authentication:

1. Pause and tell the owner that Apple is asking for the SMS code.
2. Do not guess or retry repeatedly.
3. Do not print or store the code.
4. Use the code only in the Apple login field if the owner provides it or is actively present.

Keep open if possible:

- Chrome with App Store Connect available.
- Gmail for the Helfi/Apple account.
- Apple Mail.
- TestFlight on the real iPhone if the owner is doing real-device checks.

Agents may read project-related Apple/App Store/TestFlight emails, but must not delete, archive, move, send, reply, or forward emails unless the owner explicitly asks.

## Final real-user test pass required

Do this like a normal user, not like a developer.

Use the exact build being submitted if possible.

Preferred order:

1. Install/open build 9 through TestFlight on a real iPhone if available.
2. If real iPhone access is not available, use the iPhone simulator, but clearly say that real-device testing is still not fully complete.
3. Keep notes in Linear `HEL-408`.

### Required user-style checks

Login/session:

- Open app fresh.
- Confirm it is logged in as the test account.
- Force close and reopen.
- Confirm it stays logged in.
- Log out and log back in only if testing account switching.
- Confirm no old account data leaks after login.

Dashboard:

- Dashboard loads cleanly.
- Credits show correctly.
- Main cards open.
- No broken loading states.
- No confusing old setup state.

Food Diary:

- Food Diary opens.
- Current day loads.
- Previous day loads.
- Add Food Entry opens.
- Meal options open.
- Manual food search works.
- Add a safe test food if needed, then remove it if possible.
- Food totals make sense.
- Credits display consistently.
- No bad entries are created from failed actions.

Food photo analysis:

- Test photo-library analysis if safe.
- Confirm a real food photo creates sensible items.
- Confirm credit cost is correct.
- Confirm non-food or failed analysis does not charge incorrectly.
- Do not waste credits unnecessarily.

Talk to Helfi:

- Open Talk to Helfi.
- Send a harmless test message.
- Confirm Helfi replies.
- Confirm it does not get stuck.
- Confirm chat history is sane if checked.

Insights / Weekly Report:

- Open Insights.
- Open latest weekly report.
- Confirm dates are not in the past incorrectly.
- Confirm the screen looks clean and usable.
- Check Summary/Charts/Insights/Details if available.

More tools:

- Symptom Analysis opens and is usable.
- Medical Image Analyzer opens and is usable.
- Health Journal opens.
- Mood Tracker opens.
- Today's Check-In opens.
- No duplicate bottom navigation or confusing stale titles.

Billing:

- Open Subscription & Billing.
- Confirm current plan and credits display.
- Confirm Restore purchases is visible even for free plan.
- Tap Restore purchases only if safe and needed.
- Confirm it gives a clear result and does not crash.
- Check Apple subscription/top-up status if App Store/TestFlight access allows.
- Do not make real purchases unless owner explicitly approves.

Settings:

- Settings opens.
- Dark mode toggle works visually.
- Notification settings opens.
- Help/support opens.

Poor internet/offline:

- If safe, briefly test app behavior with poor or offline connection.
- Confirm it shows understandable errors and does not crash.

## Known historical blockers to watch closely

These were previously found and many were later fixed, but the final pass should make sure they did not come back:

- Talk to Helfi getting stuck.
- Food Diary charging credits when camera permission is denied.
- Food Diary calorie totals not matching visible meal entries.
- Duplicate bottom navigation inside embedded tools.
- Chat History opening the normal Talk to Helfi start screen instead of history.
- Health Intake showing old or mismatched account/setup data.
- Insights showing next report due in the past.
- Billing credit/usage mismatches.
- Dark mode unreadable controls.
- Account switching leaking old account data.

## Apple submission sequence

Only after final user-style testing passes:

1. Confirm App Store Connect still shows `10 of 10 Screenshots`.
2. Re-check all required metadata is saved.
3. Re-check App Privacy is published.
4. Re-check build 9 is selected.
5. Re-check review login and notes are correct.
6. Ask owner for explicit approval to submit.
7. Only after approval, click `Add for Review`.

## What to tell the owner

Keep it short and plain.

Use this structure:

```
Current status:
- ...

What passed:
- ...

Still blocking:
- ...

Next step:
- ...
```

## Do not do these things

- Do not submit to Apple without owner approval.
- Do not log Apple out.
- Do not expose passwords, codes, keys, or reset links.
- Do not delete, archive, move, reply to, or send emails unless the owner explicitly asks.
- Do not wipe databases.
- Do not deploy unrelated work.
- Do not change locked app files unless the owner specifically approved the exact area.
- Do not claim the app is ready unless the final user-style pass actually passed.

## Immediate next step for the next agent

Start by checking Apple review status.

Recommended next action:

1. Read this file and Linear `HEL-408`.
2. Check project-related Apple emails if available.
3. Check App Store Connect only if the browser session allows it.
4. Confirm whether Apple still shows `Waiting for Review`, has moved to `In Review`, has approved it, or has sent feedback.
5. Update Linear and this handover with the result.
6. Do not change, resubmit, cancel, or release anything unless the owner clearly approves.
