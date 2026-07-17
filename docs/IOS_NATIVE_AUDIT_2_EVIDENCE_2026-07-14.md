# Helfi iOS / Native Audit 2 — Evidence Matrix

Started: 14 July 2026 (Melbourne time)

Linear ticket: HEL-464

Test account: `info@sonicweb.com.au`

Environment: iPhone 17 Pro Max simulator, iOS 26.2, signed in

This audit remains **In Progress**. Simulator evidence cannot prove microphone and speaker behaviour, camera capture, Apple Health, push delivery, Apple purchases, TestFlight behaviour, or physical-device haptics.

## Result labels

- **Pass** — observed behaviour matched the current intended behaviour for the tested state.
- **Defect** — a problem was reproduced and supported by visible or source evidence.
- **Blocked** — the flow needs a physical iPhone, an active feature, owner approval, or non-overlapping work to finish.
- **Not run** — inventoried but not yet exercised.

## Audit matrix

| Screen / area | Control or flow tested | Web / intended behaviour | iOS result | Evidence | Defect / fix | Retest |
|---|---|---|---|---|---|---|
| App session | Restarted/current signed-in state | Approved native test account remains signed in | Pass | Dashboard, Food Diary and Profile loaded account data | None | Not needed |
| Dashboard | Main screen and loading state | Daily Tools, My Health, devices and completed Health Setup | Pass after data settled | `02-dashboard.jpeg`; credits and Health Setup initially showed placeholders, then corrected | Short loading-state flicker is a suggestion only | Not needed |
| Dashboard | Daily Tools and My Health inventory | Check-in, Mood, Food, Water, report, Health Setup and practitioner links | Pass for visible inventory | Accessibility tree listed all expected cards | Individual linked flows tested separately below | In progress |
| Insights | Load and report inventory | Current report, tracked issues and previous reports | Pass | `03-insights.jpeg`; report loaded after about 5 seconds | None for tested state | Not needed |
| Insights | Open latest report | Opens native report with Summary, Charts, Insights and Details | Pass | All four tabs opened; Summary showed 7/7 active days and 91 entries | PDF export not run | In progress |
| More | Main menu inventory | Same two main groups and core destinations as verified web | Pass | `04-more.jpeg` | None for visible list | Not needed |
| Health Journal | New entry screen | Written note, photo, voice note, audio setting and Submit | Pass for control inventory | Native screen opened; no embedded web navigation | Media/save/edit/delete need controlled or physical tests | Blocked |
| Daily Check-in | Today form | Five tracked issues, 0–6 ratings, details and Save | Pass for control inventory | All five issue groups and Save were present | Save was not repeated while AUDIT 1 was changing the shared test account | In progress |
| Daily Check-in | History | Trends and previous entries load | Pass | History populated after loading with dated entries | No edit/delete action completed | In progress |
| Mood | Check-in form | Mood, intensity, emotions, factors, note and save | Pass for control inventory | Native controls and disabled-until-mood Save were present | Save not run | In progress |
| Mood | History and Journal tabs | History/trends and dated journal entry form | Pass for opening | History empty state loaded; Journal defaulted to 2026-07-14 | Save/edit/delete not run | In progress |
| Symptom Notes | New note | Symptoms, duration, notes, safety copy, sources and cost | Pass for control inventory | Native form loaded with 1-credit cost | AI request not run | Blocked |
| Symptom Notes | History row actions | Editable/deletable native rows use a compact three-dot menu | Pass on current build | `11-current-build-symptom-three-dot.jpeg`; menu contained Delete entry and Cancel | Older installed build showed stale visible Delete UI; current source/build corrected it | Passed |
| Health Image Notes | New image note | Image selection, safety copy, sources, cost and disabled create state | Pass for control inventory | Native screen showed 2-credit cost and disabled Create before selection | Camera/library/AI require controlled or physical test | Blocked |
| Health Image Notes | History row actions | Editable/deletable native rows use a compact three-dot menu | Pass on current build | `12-current-build-health-image-three-dot.jpeg`; every row used the compact menu | Older installed build showed stale visible Delete UI; current source/build corrected it | Passed |
| Health Intake | Open from More | Existing web Health Intake is the current expected behaviour, although full native parity is preferred | Blocked parity gap | Embedded web page opened at Gender, step 1 of 11 | Existing known embedded-web gap; no change made | Not run |
| Practitioner Directory | Main search | Category, specialty, name, location, radius, telehealth and search | Pass for control inventory | Native directory loaded with all controls | Search/location/contact actions not run | In progress |
| Practitioner Directory | Browse Categories A-Z | A–Z index, search and category list | Pass | Category list loaded after its loading state | No category search result/profile opened yet | In progress |
| Devices | Main device list | Fitbit, Garmin and interest-only devices | Pass for visible inventory | Fitbit, Garmin, Google Fit, Oura and Polar loaded; Huawei exists below the visible area in source | External connection, interest save and disconnect require controlled tests | Blocked |
| Profile | Form and saved state | Auto-save profile fields and separate photo screen | Pass for controls; **parity defect** for state | Native showed `Web audit temporary note 2026-07-14` and “All changes saved” while AUDIT 1 reported the web value restored empty | Cross-platform visible state is inconsistent; handed to HEL-465 | Not run |
| Profile Photo | Open screen | Choose photo, take photo and remove photo | Pass for control inventory | All three native actions loaded | Photo/camera/remove not run | Blocked |
| Billing | Current plan, credits, plans, top-ups, history, usage and costs | Matches web billing account | Pass for inventory | Free plan, 870 credits, four plans, top-ups, purchase history and feature costs loaded | No purchase/restore action run | Blocked |
| Help | Help menu | Support, FAQ and Affiliate destinations | Pass for inventory | All three cards opened on native Help screen | FAQ/Affiliate embedded web not exercised | In progress |
| Support | Form | Name, email, inquiry, subject, message, attachment and Send | Pass for control inventory | Saved account details prefilled | No message sent | In progress |
| Support | Past ticket row actions | Editable/deletable native rows use a compact three-dot menu | Pending current-build visual retest | Current source contains a compact action menu; `07-support-visible-delete.jpeg` is from the older installed build | No source change made | In progress |
| Settings | Main screen | Appearance, weekly reports, Food Diary, notifications, privacy, PDF, account, billing, support and logout | Pass for inventory | All expected groups loaded | Current values briefly show defaults while loading, then settle | In progress |
| Food Diary settings | Prompt enablement, frequency, cap and trigger levels | Sugar, carbs and fat threshold controls | Pass for labels and values | Native showed Sugar 30 g, Carbs 90 g and Fat 60 g, matching source semantics | AUDIT 1 evidence wording says carbs/protein/fat and should be rechecked | In progress |
| Notifications | Section menu | Inbox, Reminders, Health Coach, Quiet Hours, Account & Security | Pass | All five destinations opened | None for navigation | Not needed |
| Notification Inbox | Empty state and bulk actions | Empty state; destructive bulk actions disabled | Pass | Unread 0; Select/Delete/Mark all disabled | Delivery/tap routing needs a real notification | Blocked |
| Reminders | Push, check-in and mood settings | Clear push prerequisite, schedule, count and timezone | Pass for current state | Push off warning; check-in reminder on; mood reminder off | Push delivery and permission need physical iPhone | Blocked |
| Quiet Hours | Load saved settings | Enable, start/end and Save | Pass for control inventory | Enabled, 00:00–12:00 loaded | Save not changed | In progress |
| Account & Security alerts | Alert status and account link | Login, password and account-update alerts | Pass | All three displayed On | Email delivery not tested | Blocked |
| Health Coach settings | Enable, costs, timezone and Save | Paid proactive alerts with clear credit cost | Pass for control inventory | Off; 10 credits per alert and 50/day cap displayed | Enable/save/alert delivery not run | Blocked |
| Health Coach | Credits while loading | Never show a false zero balance while account data is loading | **Defect** | `10-health-coach-false-zero-loading.jpeg` showed 0, then corrected to 867; source initializes the balance to 0 | Protected screen; no fix without approval | Not run |
| Account Settings | Account info | Name auto-save and fixed email | Pass for control inventory | Name/email loaded | Name not changed during concurrent web audit | In progress |
| Account Settings | Change Password safety | Three fields, visibility controls, disabled Save and Cancel | Pass | Modal opened and cancelled; no password submitted | None for tested state | Not needed |
| Account Settings | Delete Account safety | Clear irreversible warning, type DELETE, disabled action and Cancel | Pass | Confirmation modal opened and was cancelled without typing | Account was not deleted | Not needed |
| Food Diary | Main load, totals and meal sections | Date, credits, energy totals, exercise and five meal sections | Pass after loading | `09-food-diary-row-menu.jpeg`; current entry was Apple in Snacks | Shared account data changed during AUDIT 1, so exact row parity is pending its handover | In progress |
| Food Diary | Entry three-dot menu | Duplicate, Copy to Today, Copy 7 days, Move, Edit, Delete | Pass | Apple row used compact three-dot menu; all six actions appeared | Destructive/copy actions not completed | In progress |
| Food Diary | Edit form | Name, meal, calories, protein, carbs, fat, fibre and sugar; Save/Cancel/Delete | Pass for open/cancel | Existing Apple values loaded and Cancel returned without change | Save/delete not run | In progress |
| Food Diary | Add menu | Photo, Favorites, Recommended, Barcode, ingredient, meal builder, recipe and water | Pass | `01-food-diary-add-menu.jpeg`; all expected actions present | Photo/camera require physical test | In progress |
| Favorites | Default tab, search and barcode | Opens on Favorites tab with search and barcode | Pass for current empty state | Favorites tab was selected and empty-state copy appeared | Exact rows/order blocked by current empty server state | Blocked |
| Recommended meal | Open without generation | Cost shown before generation; history shown | Pass | 10-credit cost, Generate and empty History displayed | AI generation not run | Blocked |
| Barcode | Scanner and manual entry | Camera scanner, flash, manual barcode and search | Pass for opening | Scanner and manual-entry form opened and closed | Real scan/product/save needs physical iPhone; 3-credit account change was not attributed because AUDIT 1 was active | Blocked |
| Add Ingredient | Search source controls and photo path | Packaged/single food, missing item and AI photo | Pass for control inventory | Native search screen loaded with 870 credits | Search/add/photo/save not run | In progress |
| Build a Meal | Builder inventory | Meal name, search, source buttons, portion control, totals and Save | Pass for control inventory | Empty builder showed all expected controls | Ingredient add/serving/save not run | In progress |
| Import Recipe | URL and photo tabs | 10-credit URL, 15-credit photo, multi-photo support | Pass for control inventory | Both tabs opened with correct costs | Import not run | Blocked |
| Water Intake | Goal, drink types, quick amounts, custom entry and history | Same drink choices and saved goal | Pass for current empty day | 0 ml / 2.45 L, drink choices and empty history loaded | Add/edit/delete not run | In progress |
| Exercise | Add form | Type, duration, distance, units, time, calorie override and Save/Cancel | Pass for control inventory | Empty native form opened | Save/edit/delete not run | In progress |
| Talk to Helfi | Panel open and connection | Immediate native live voice with Connecting/Listening and clear controls | Pass in current simulator build | `13-current-build-talk-connecting.jpeg` then `14-current-build-talk-listening.jpeg` | Older installed build was stale and showed live voice unavailable; current dirty voice work was preserved | Physical proof required |
| Talk to Helfi | End / close | Immediately ends the session and returns to the prior screen | Pass in current simulator build | End returned to More in the first post-tap state | Simulator cannot prove audio route, volume or delayed physical audio | Physical proof required |

## Confirmed defects

1. Native Profile shows the web audit's temporary bio as saved while the web audit reports that value restored empty; visible cross-platform state is inconsistent.
2. Health Coach shows a false zero credit balance during loading before correcting to the real balance.

## Suggestions / unconfirmed observations

1. Several screens briefly display default or incomplete values before real account data settles. This was most visible on Dashboard, Food Diary and weekly-report Settings.
2. Many custom pressable controls are exposed as generic accessibility elements rather than clearly named buttons. A full VoiceOver pass is still required.
3. Health Intake remains an embedded web screen rather than a fully native experience.

## Physical iPhone acceptance still required

- Talk to Helfi: real microphone, speaker/earpiece/Bluetooth route, volume, interruption, Connecting → Listening, Done staying silent, correction, Continue talking, exact dates/values, Save/Discard and diary/profile result.
- Camera/library: food photos, barcode, recipe photos, journal and health images, profile photo, medication and supplement review.
- Apple Health permission/import and entitlement behaviour.
- Push permission, delivery, tap routing and reminder completion.
- Apple subscription/top-up/restore purchases.
- Haptics, smaller-screen layout, keyboard overlap, safe areas, background/foreground and universal links.

## Evidence files

- `docs/audit-evidence/native-audit-2-2026-07-14/01-food-diary-add-menu.jpeg`
- `docs/audit-evidence/native-audit-2-2026-07-14/02-dashboard.jpeg`
- `docs/audit-evidence/native-audit-2-2026-07-14/03-insights.jpeg`
- `docs/audit-evidence/native-audit-2-2026-07-14/04-more.jpeg`
- `docs/audit-evidence/native-audit-2-2026-07-14/05-symptom-history-visible-delete.jpeg`
- `docs/audit-evidence/native-audit-2-2026-07-14/06-health-image-history-visible-delete.jpeg`
- `docs/audit-evidence/native-audit-2-2026-07-14/07-support-visible-delete.jpeg`
- `docs/audit-evidence/native-audit-2-2026-07-14/08-talk-to-helfi-live-voice-unavailable.jpeg`
- `docs/audit-evidence/native-audit-2-2026-07-14/09-food-diary-row-menu.jpeg`
- `docs/audit-evidence/native-audit-2-2026-07-14/10-health-coach-false-zero-loading.jpeg`
- `docs/audit-evidence/native-audit-2-2026-07-14/11-current-build-symptom-three-dot.jpeg`
- `docs/audit-evidence/native-audit-2-2026-07-14/12-current-build-health-image-three-dot.jpeg`
- `docs/audit-evidence/native-audit-2-2026-07-14/13-current-build-talk-connecting.jpeg`
- `docs/audit-evidence/native-audit-2-2026-07-14/14-current-build-talk-listening.jpeg`

## Automated-proof limits

No real iOS user-flow suite exists. The Xcode scheme references `HelfiTests`, but the project has no test target or XCTest/XCUITest files. Existing checks protect TypeScript and selected source rules only; they do not tap screens, save account data, use a microphone/camera, or prove physical-device behaviour.

Current static checks all passed on 14 July 2026:

- Native TypeScript check
- Native practitioner guard
- Native Talk to Helfi confirmation and command guards
- Native page locks (71 files)
- Full web/shared page locks (267 files)
- Talk to Helfi TestFlight preflight guard

The current simulator build was rebuilt from the saved main project after the first pass. That corrected stale-runtime findings for Talk to Helfi, Symptom history and Health Image history. Physical-device Talk to Helfi proof is still required.
