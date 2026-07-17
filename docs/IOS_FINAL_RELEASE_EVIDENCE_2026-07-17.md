# FINALIZE HELFI - Final iOS Release Evidence

Linear owner ticket: HEL-470

Release source: `master` in `/Volumes/U34 Bolt/HELFI APP/helfi-app`

Final App Store build: not created yet (must be build 27 or higher)

## Status rules

- `PASS - FINAL BUILD`: passed on the exact uploaded build on the named physical device.
- `PASS - CURRENT SOURCE`: passed on the current source before the final archive; it must be repeated on the final uploaded build.
- `PRELIMINARY`: useful earlier evidence, but not final release proof.
- `UNTESTED`: no fresh proof yet.
- `BLOCKED`: cannot be completed until the stated external requirement is available.

No row may remain `PRELIMINARY`, `UNTESTED`, or `BLOCKED` when the build is declared ready to submit.

## Build, repository, and deployment

| Screen / flow | Exact control or action | Device / build | Result | Observable evidence | Defect / repair | Final retest |
| --- | --- | --- | --- | --- | --- | --- |
| Repository | Inspect all modified, deleted, and untracked files | Main checkout at `3d4f59cc` | PASS - CURRENT SOURCE | Only one Git worktree exists; saved Talk to Helfi work, Health Coach repair, audit evidence, and secret-backup cleanup committed; App Store artwork and temporary evidence preserved locally and accounted for | No files discarded | Repeat before final build commit |
| Web/API compile | Run full production build | Current source, Mac | PASS - CURRENT SOURCE | Production build completed; existing warnings only | None | Repeat after final changes |
| Native compile | Run native type check and simulator build | Current source, iPhone 17 Pro Max simulator | PASS - CURRENT SOURCE | Type check passed; Xcode simulator build succeeded with zero errors | None | Repeat for final archive |
| Page locks | Run web and native lock checks | Current source | PASS - CURRENT SOURCE | 268 total locks and 72 native locks passed | Health Coach and saved voice hashes refreshed only | Repeat before commit/upload |
| Talk to Helfi safety | Run voice behaviour, confirm guard, and TestFlight preflight | Current source | PASS - CURRENT SOURCE | All three checks passed | Saved voice work preserved and verified | Repeat before upload |
| Production web/API | Push one release task, wait for Vercel READY, verify both live domains | Commit `3d4f59cc` / Vercel `dpl_FJw71SB42URaScCd5Mk2LKyMFEen` | PASS - CURRENT SOURCE | Deployment READY; `helfi.ai` and `www.helfi.ai` both point to it; live voice readiness returns ready, Marin, `gpt-realtime-2.1` | Stale live aliases were reassigned to the new READY deployment | Repeat readiness before upload |
| Final archive | Archive exact committed source as build 27 or higher | Xcode / App Store upload | UNTESTED | Project is still build 26 | Pending build-number change | Required |
| TestFlight identity | Confirm processed build, source commit, version, tester assignment | App Store Connect | BLOCKED | App Store Connect is signed out; passkey verification did not complete | External Apple sign-in required | Required |

## Account, navigation, and layout

| Screen / flow | Exact control or action | Device / build | Result | Observable evidence | Defect / repair | Final retest |
| --- | --- | --- | --- | --- | --- | --- |
| Sign-in | Fresh open, remain signed in, force-close, reopen | Physical iPhone / final build | UNTESTED | Test account remains signed in on current simulator only | None known | Required |
| Sign-in | Same persistence and no old-account data | Physical iPad / final build | BLOCKED | No physical iPad connected | External physical iPad required | Required |
| Dashboard | Load, credits, every card, loading/error/success, safe area | Physical iPhone + iPad / final build | UNTESTED | Earlier simulator evidence only | None known | Required |
| Main navigation | Dashboard, Insights, Food, More, Settings; back/cancel routes | Physical iPhone + iPad / final build | UNTESTED | Current simulator tabs open | None known | Required |
| Small screen/layout | Text clipping, keyboard, rotation, safe areas, bottom controls | Small physical iPhone / final build | UNTESTED | Simulator is not physical proof | None known | Required |
| Background/foreground | Start work, background app, return, force-close/reopen | Physical iPhone + iPad / final build | UNTESTED | None | None known | Required |
| Poor/offline network | Disconnect/reconnect during load/save/retry | Physical iPhone + iPad / final build | UNTESTED | None | None known | Required |
| Performance | Open main screens repeatedly and check long stalls/crashes | Physical iPhone + iPad / final build | UNTESTED | None | None known | Required |

## Profile, Health Intake, and goals

| Screen / flow | Exact control or action | Device / build | Result | Observable evidence | Defect / repair | Final retest |
| --- | --- | --- | --- | --- | --- | --- |
| Profile web state | Open live Profile and read saved fields | Existing logged-in Chrome, live web | PASS - CURRENT SOURCE | First name, last name, birth date, and gender are populated; bio is empty | None | Compare exact values to final native build |
| Profile native state | Compare all Profile values to web, edit one safe value, save, refresh both ways | Physical iPhone + iPad / final build | UNTESTED | Native comparison not completed | Earlier mismatch requires fresh proof | Required |
| Profile media | Camera, library, change/cancel/remove photo, persistence | Physical iPhone + iPad / final build | UNTESTED | None | Earlier web repair only | Required |
| Goals | View, change, save, cancel, refresh on second device | Physical iPhone + iPad + web / final build | UNTESTED | None | Cross-device rule applies | Required |
| Health Intake | Saved values load; every step, review, edit, save, back/cancel | Physical iPhone + iPad + web / final build | UNTESTED | Earlier Audit 2 found native/web parity gap | Repair only if it creates a real usability/App Review problem | Required |
| Medications | Add/edit/delete/cancel, image/library, dates, saved location | Physical iPhone + iPad / final build | UNTESTED | None | None known | Required |
| Supplements | Add/edit/delete/cancel, image/library, dates, saved location | Physical iPhone + iPad / final build | UNTESTED | None | None known | Required |

## Food, water, and exercise

| Screen / flow | Exact control or action | Device / build | Result | Observable evidence | Defect / repair | Final retest |
| --- | --- | --- | --- | --- | --- | --- |
| Food Diary | Today/previous/next allowed date, load/refresh, totals and credits | Physical iPhone + iPad / final build | UNTESTED | Earlier simulator and web passes only | Locked flow; no current defect | Required |
| Add menu | Every meal and every add option opens and cancels cleanly | Physical iPhone + iPad / final build | UNTESTED | Earlier Audit 2 screenshot | None known | Required |
| Manual ingredient | Search, filters, serving, grams/ounces, add/edit/delete/cancel | Physical iPhone + iPad / final build | UNTESTED | Earlier audit pass only | None known | Required |
| Favorites | Open, portion, add, rename display, edit/delete/cancel, refresh | Physical iPhone + iPad / final build | UNTESTED | Rename flow protected | No rename changes authorized | Required |
| Custom food | Create, validation, save, edit, delete, cancel, correct date | Physical iPhone + iPad / final build | UNTESTED | None | None known | Required |
| Build a meal | Add ingredients, name validation, save/edit/delete/cancel | Physical iPhone + iPad / final build | UNTESTED | Earlier audit only | None known | Required |
| Recommended meal | Generate, review, build, retry/error, correct single charge | Physical iPhone + iPad / final build | UNTESTED | None | Paid path | Required |
| Recipe URL | Valid/invalid URL, missing data, retry, save/cancel, single charge | Physical iPhone + iPad / final build | UNTESTED | None | Paid path | Required |
| Recipe photo | Camera/library, permission, retry, save/cancel, single charge | Physical iPhone + iPad / final build | UNTESTED | None | Physical media path | Required |
| Food photo | Camera/library, food/non-food, edit result, retry, save/discard, charge | Physical iPhone + iPad / final build | UNTESTED | None | Physical media and paid path | Required |
| Barcode | Camera scan, manual barcode, unknown item, add/edit/delete, charge warning | Physical iPhone + iPad / final build | UNTESTED | None | Physical camera path | Required |
| Water | Quick/custom amounts, type, date/time, add/edit/delete/cancel, persistence | Physical iPhone + iPad / final build | UNTESTED | Earlier simulator only | None known | Required |
| Exercise | Type search, exact duration/distance/steps/calories, add/edit/delete/cancel | Physical iPhone + iPad / final build | UNTESTED | None | Earlier historical issues need fresh proof | Required |
| Apple Health exercise | Permission, import, duplicate protection, refresh | Physical iPhone / final build | UNTESTED | None | Physical HealthKit path | Required |

## Tracking, reports, and health tools

| Screen / flow | Exact control or action | Device / build | Result | Observable evidence | Defect / repair | Final retest |
| --- | --- | --- | --- | --- | --- | --- |
| Insights | Landing, tracked issues, all cards, empty/loading/error/success | Physical iPhone + iPad / final build | UNTESTED | Earlier source pass only | None known | Required |
| Weekly reports | Current/previous report, Summary/Charts/Insights/Details | Physical iPhone + iPad / final build | UNTESTED | Current-source simulator opens report | Interactive report commit is newer than build 26 | Required |
| Weekly report tiles | Open every Food, Water, Mood, Check-ins, Symptoms, Exercise, Journal, Images, Labs, Chats, Hydration tile and back | Physical iPhone + iPad / final build | PRELIMINARY | Audit 2/current simulator exposes all 11 clickable tiles | Must repeat exact final build | Required |
| Weekly PDF | Open, complete multi-page content, back/cancel/share | Physical iPhone + iPad / final build | UNTESTED | Live web repair previously passed | Build 26 predates later work | Required |
| Today's Check-in | Every rating, details, N/A, save, history, edit/delete/cancel, date | Physical iPhone + iPad / final build | UNTESTED | Earlier web repair | None known | Required |
| Mood Tracker | Mood value required, tags, note, save, history, edit/delete/cancel, date | Physical iPhone + iPad / final build | UNTESTED | None | Talk to Helfi now refuses invented mood values | Required |
| Mood Journal | Text/photo/voice, save/edit/delete/cancel, date and persistence | Physical iPhone + iPad / final build | UNTESTED | None | Physical media path | Required |
| Health Journal | Text/photo/file/voice, save/edit/delete/cancel, date | Physical iPhone + iPad / final build | UNTESTED | Earlier simulator pass only | None known | Required |
| Symptom Notes | Create/review/save/edit/delete/cancel, cost, history three-dot | Physical iPhone + iPad / final build | PRELIMINARY | Current-source simulator three-dot screenshot passes | Must repeat final build and paid save | Required |
| Health Image Notes | Camera/library/file, review/save/edit/delete/cancel, cost, history three-dot | Physical iPhone + iPad / final build | PRELIMINARY | Current-source simulator three-dot screenshot passes | Physical media and paid path | Required |
| Lab Reports | Camera/library/file, upload, process, view, delete/cancel, error states | Physical iPhone + iPad / final build | UNTESTED | None | Physical media and paid path | Required |
| Health Coach loading | Open while balance request is pending, then wait for balance | Current source, iPhone 17 Pro Max simulator | PASS - CURRENT SOURCE | Shows `Loading...`, then 826 credits; no false zero | Changed nullable loading state in `SmartHealthCoachScreen.tsx` | Repeat final iPhone+iPad build |
| Health Coach | Enable warning, cancel/accept, settings, timezone, tips/history, delete/cancel | Physical iPhone + iPad / final build | UNTESTED | Loading repair only | Paid alert path | Required |
| Support | Open existing thread, compact three-dot menu, attachment, cancel/back/error states | Physical iPhone + iPad / final build | PRELIMINARY | Audit 2 screenshot exists; compact menu still needs final visual proof | No new repair yet | Required |
| Devices | Apple Health, Fitbit, Garmin and every shown connection/error/cancel path | Physical iPhone + iPad / final build | UNTESTED | Earlier simulator open-only | Physical/account paths | Required |
| Notifications | Permission, settings, delivery test, tap route, quiet hours, reminders | Physical iPhone + iPad / final build | UNTESTED | None | Physical push path | Required |
| Haptics | Main actions, success/error feedback | Physical iPhone + iPad / final build | UNTESTED | None | Physical-only | Required |
| App links | Open supported links into correct native screen, back route | Physical iPhone + iPad / final build | UNTESTED | None | Physical-only | Required |

## Talk to Helfi

| Screen / flow | Exact control or action | Device / build | Result | Observable evidence | Defect / repair | Final retest |
| --- | --- | --- | --- | --- | --- | --- |
| Automated safety | Dates, no invented values, clarification, correction, save/discard, duplicate-save retry | Current source | PASS - CURRENT SOURCE | Native voice confirm guard and command behaviour checks pass | Saved unfinished owner work integrated | Repeat final source |
| Connection | Open, Connecting, Listening, understandable error, retry | Physical iPhone + iPad / final build | UNTESTED | Current simulator reached Connecting/Listening earlier | Production API must be deployed first | Required |
| Review controls | Continue talking, correct, Save this, Discard, Done | Physical iPhone + iPad / final build | UNTESTED | Code and automated checks only | New correction flow | Required |
| Correct dates | Today/yesterday/two days ago and copied-yesterday meal source | Physical iPhone + iPad / final build | UNTESTED | Automated checks pass | New exact-date handling | Required |
| Exercise | Missing duration follow-up; exact duration/distance/steps/calories; correction/save/discard | Physical iPhone + iPad / final build | UNTESTED | Automated checks pass | Guessed exercise values removed | Required |
| Mood/journal/water | Missing-value follow-up, exact review, correction/save/discard | Physical iPhone + iPad / final build | UNTESTED | Automated checks pass | Guessed mood/water/journal values removed | Required |
| Medication/supplement | Camera/library or speech, review/correct/save/discard, no auto-save | Physical iPhone + iPad / final build | UNTESTED | Earlier code checks only | Review-first path preserved | Required |
| Duplicate protection | Interrupt/fail a save, retry once, confirm one record and one charge | Physical iPhone + iPad / final build | UNTESTED | Token release and one-use guard pass in code tests | Failed saves can retry without duplicate write | Required |
| Audio output | Speaker, receiver, Bluetooth, volume buttons, mute/unmute | Physical iPhone + iPad / final build | UNTESTED | None | Physical-only | Required |
| Interruption | Speak over Helfi, phone/audio interruption, background/foreground, silence | Physical iPhone + iPad / final build | UNTESTED | None | Physical-only | Required |
| Done shutdown | Tap Done while connecting/listening/speaking; confirm mic/audio stay stopped | Physical iPhone + iPad / final build | UNTESTED | Automated guard only | Critical voice lock | Required |

## Billing and Apple sandbox purchases

| Screen / flow | Exact control or action | Device / build | Result | Observable evidence | Defect / repair | Final retest |
| --- | --- | --- | --- | --- | --- | --- |
| Billing screen | Plan, balance, costs, history, legal links, loading/error/retry | Physical iPhone + iPad / final build | UNTESTED | None | None known | Required |
| $10 subscription | Buy in sandbox, confirm plan/700 credits, restart persistence | Physical iPhone / final build | UNTESTED | None | Financial confirmation required at purchase step | Required |
| $20 subscription | Buy in sandbox, confirm plan/1,400 credits, restart persistence | Physical iPhone / final build | UNTESTED | None | Financial confirmation required at purchase step | Required |
| $30 subscription | Buy in sandbox, confirm plan/2,100 credits, restart persistence | Physical iPhone / final build | UNTESTED | None | Financial confirmation required at purchase step | Required |
| $50 subscription | Buy in sandbox, confirm plan/3,500 credits, restart persistence | Physical iPhone / final build | UNTESTED | None | Financial confirmation required at purchase step | Required |
| $5 top-up | Buy 250 credits, restart, restore, confirm no duplicate credits | Physical iPhone / final build | UNTESTED | None | Financial confirmation required at purchase step | Required |
| $10 top-up | Buy 500 credits, restart, restore, confirm no duplicate credits | Physical iPhone / final build | UNTESTED | None | Financial confirmation required at purchase step | Required |
| $20 top-up | Buy 1,000 credits, restart, restore, confirm no duplicate credits | Physical iPhone / final build | UNTESTED | None | Financial confirmation required at purchase step | Required |
| Restore | Fresh/reinstalled state, restore twice, correct plan and credits, no double credit | Physical iPhone + iPad / final build | UNTESTED | None | None known | Required |
| Cancel/fail | Cancel purchase, failed purchase, retry, clear message, no charge/credit | Physical iPhone + iPad / final build | UNTESTED | None | Financial confirmation required at purchase step | Required |

## App Store Connect readiness

| Screen / flow | Exact control or action | Device / build | Result | Observable evidence | Defect / repair | Final retest |
| --- | --- | --- | --- | --- | --- | --- |
| Rejection state | Read current Apple rejection and resolution state | App Store Connect | BLOCKED | Existing Chrome is signed out; passkey verification is stuck | Owner Apple authentication may be required | Required |
| Build selection | Select exact final processed build 27 or higher | App Store Connect | UNTESTED | Build not uploaded | Pending | Required |
| Version/screenshots | Verify version and all iPhone/iPad screenshot slots | App Store Connect | UNTESTED | Old handover is not fresh evidence | Pending | Required |
| Metadata | Description, keywords, category, support/marketing/terms/privacy links | App Store Connect | UNTESTED | Old handover is not fresh evidence | Pending | Required |
| Privacy/age/content rights | Verify every saved answer and published privacy state | App Store Connect | UNTESTED | Old handover is not fresh evidence | Pending | Required |
| Review notes/login | Verify reviewer explanation, contact, working review account | App Store Connect | UNTESTED | Old handover is not fresh evidence | Pending | Required |
| IAP products | Verify all four subscriptions and all three top-ups selected and approved/ready | App Store Connect | UNTESTED | Old handover is not fresh evidence | Pending | Required |
| Export/compliance | Answer every required export/compliance question truthfully | App Store Connect | UNTESTED | None | Pending | Required |
| Final submission | Confirm only `Submit for Review` remains | App Store Connect | UNTESTED | Must not click without explicit owner instruction | Intentionally withheld | Required, no click |

## Current blockers

1. A physical iPad is not connected to this Mac. Simulator results cannot satisfy the owner's physical-iPad acceptance requirement.
2. App Store Connect is signed out in the existing Chrome session. Passkey sign-in began but did not complete, so fresh Apple state cannot yet be read or prepared.
3. Apple sandbox purchases need action-time confirmation immediately before each purchase flow.

## Preserved local working files

- `public/MOBILE MOCKUPS/APP STORE IOS SUBMISSION/` is a 67 MB set of existing App Store screenshot working assets. It is deliberately preserved but not included in the app code commit until the final screenshot set is confirmed in App Store Connect.
- `tmp/` contains existing generated weekly-report and test evidence files. It is deliberately preserved locally and excluded from the app code commit.
- The deleted `.env*` backup files are the existing owner-approved secret cleanup. They are preserved as deletions and no secret value was opened, printed, copied, or restored.
