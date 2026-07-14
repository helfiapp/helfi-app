# Helfi Web App Audit 1 — Evidence Matrix

Started: 14 July 2026 (Melbourne time)
Linear ticket: HEL-465
Test account: `info@sonicweb.com.au`
Environment: live web app, using the already-open signed-in Chrome browser

Status: **Repair and live retest in progress.** Broad signed-in web coverage is recorded below. The confirmed web defects owned by AUDIT 1 now have local repairs and a successful full production build. They are not yet live; each affected user flow must be retested after deployment before the audit can be called complete.

The Health Intake section-11 readback failure was investigated and reproduced again under paced testing. Section 11 loaded in 3.6 seconds and remained usable, but code inspection confirmed an automatic browser-location request plus unnecessary background loads that could make it appear frozen. Those triggers are repaired locally. Both Food Diary Add exercise buttons were also retested on the current live app and opened the exercise form correctly; that earlier result is now classified as a transient test failure rather than a current app defect.

Prior issue documents are historical test leads only. Every defect is confirmed again on the current live app before any repair is considered.

## Result labels

- **Pass** — observed behaviour matches the intended user experience.
- **Defect** — a problem was reproduced and supported by visible or saved evidence.
- **Blocked** — the test could not be completed safely or needs owner action.
- **Not run** — inventoried but not tested yet.

## Audit matrix

| Area / screen | Control or flow tested | Result | Observable evidence | Defect / fix | Retest |
|---|---|---:|---|---|---|
| Dashboard `/dashboard` | Load as the approved signed-in user | Pass | Page loaded with “Welcome back, Louie Veleski”; profile menu showed `info@sonicweb.com.au` | None | Not needed |
| Dashboard `/dashboard` | Global profile button | Pass | Profile button was visible in the top-right and opened on the first click | None | Not needed |
| Dashboard `/dashboard` | Profile menu destinations | Pass | Profile, Account Settings, Profile Photo, Billing, Affiliate, Notifications, Privacy, Support and Logout were all visible | None | Not needed |
| Dashboard `/dashboard` | Desktop left navigation inventory | Pass | Dashboard, Insights, Talk to Helfi, Health Journal, Health Coach, Food Diary, Symptom Notes, Health Image Notes, Health Tracking, Devices, Health Intake, Check-in, Mood, Profile, Settings, Billing and Support were visible | None | Not needed |
| Dashboard `/dashboard` | Device-interest choice and save | Defect | Choice did not change immediately; all device buttons were disabled and the final saved state took about 7–8 seconds to appear | Protected Dashboard repair needs specific owner approval | Not run |
| Dashboard `/dashboard` | Fitbit Connect | Defect | Button changed to “Connecting…” and stayed disabled on Dashboard for more than 26 seconds with no message. The Fitbit sign-in tab eventually appeared several minutes later, after the user had moved to other settings | Protected Dashboard/device connection repair needs specific owner approval | Not run |
| Dashboard `/dashboard` | Reset All Data safety | Pass | A clear permanent-deletion warning listed affected data and required a separate “Yes, Reset Everything” action; Cancel closed it | None; destructive action was not completed | Not needed |
| Dashboard `/dashboard` | Edit Health Info | Pass | Opened `/onboarding`; saved gender loaded as Male | None | Not needed |
| Route inventory | All `app/**/page.tsx` routes | Pass | 117 page routes inventoried: 24 public, 81 signed-in user, 7 admin, 1 practitioner portal and 4 redirect/development utility pages | None | Route-by-route testing in progress |
| Profile `/profile` | Bio auto-save when leaving the page | Defect | Entered a temporary bio, left through both direct navigation and the visible Go back button, then returned; the bio was empty both times. Original empty value was preserved | Protected Profile repair needs specific owner approval | Not run |
| Profile Photo `/profile/image` | Choose Photo | Pass | The visible button opened the browser file chooser. It was cancelled without selecting or uploading a file | None | Not needed |
| Profile Photo `/profile/image` | Open Camera | Defect | Clicking Open Camera produced no video, dialog, error, or visible permission request | Protected Profile Photo repair needs specific owner approval | Not run |
| Account `/account` | Name auto-save | Pass | Changed the name, left, returned and confirmed it saved; restored `Louie Veleski` and confirmed the restoration | None | Passed after restoration |
| Account `/account` | Change Password modal | Pass | Modal opened with current, new and confirmation fields; Save remained disabled without valid entries; Cancel closed it | None; no password was submitted | Not needed |
| Account `/account` | Password visibility buttons | Defect | All three eye-icon buttons had no readable name for screen-reader users | Accessibility repair needs specific owner approval | Not run |
| Account `/account` | Delete Account safety | Pass | Clear irreversible warning, detailed data list, required typing `DELETE`, and disabled delete button; Cancel closed it | None; destructive action was not completed | Not needed |
| Settings `/settings` | App install help | Pass | Show steps opened the instructions and Hide steps closed them | None | Not needed |
| Settings `/settings` | Download health data as PDF | Defect | Copy says the PDF opens in a new tab, but it replaced the Settings page with an embedded viewer; Back returned to Settings | Copy/behaviour needs specific owner approval before repair | Not run |
| Settings `/settings` | Toggle accessibility | Defect | Dark Mode, haptic feedback, weekly report and analytics controls had no readable checkbox names for screen-reader users | Accessibility repair needs specific owner approval | Not run |
| Food Diary Settings `/settings/food-diary` | Saved targets and hydration | Pass | After loading, targets displayed 30 g carbs, 90 g protein and 60 g fat, matching the actual slider values | Historical fat mismatch was not reproduced | Not needed |
| Food Diary Settings `/settings/food-diary` | Control accessibility | Defect | The enable switch and all three target sliders had no readable names for screen-reader users | Accessibility repair needs specific owner approval | Not run |
| Billing `/billing` | Plans, top-ups, usage and period selector | Pass | Four plans and top-ups loaded; usage changed from 11 in Last 7 days to 18 in Last month, then was restored to Last 7 days | None; no purchase was started | Passed after restoration |
| Notifications Inbox `/notifications/inbox` | Empty state and bulk actions | Pass | “No notifications yet” displayed, unread count was zero, and bulk action buttons were safely disabled | None | Not needed |
| Notification Reminders `/notifications/reminders` | Push notifications on/off | Pass | Turned push on using the visible switch, confirmed it became enabled, then turned it off and confirmed the original state was restored | None | Passed after restoration |
| Notification Reminders `/notifications/reminders` | Switch accessibility | Defect | Push, check-in and mood switches were exposed only as unnamed checkboxes | Accessibility repair needs specific owner approval | Not run |
| Notification Delivery `/notifications/delivery` | Email and push delivery switches | Defect | Both switches were visibly on. Clicking each one separately completed with no error, but neither changed state after 1.8 seconds | Delivery controls need specific owner approval before repair | Not run |
| Notification Delivery `/notifications/delivery` | Switch accessibility | Defect | Email and Push were both exposed as unnamed checkboxes | Accessibility repair needs specific owner approval | Not run |
| Quiet Hours `/notifications/quiet-hours` | Page load and saved hours | Defect | The page still showed “Loading quiet hours…” after 6.5 seconds and did not finish until about 13.5 seconds. It then loaded the saved enabled window of 00:00–12:00 | Performance repair needs specific owner approval | Not run |
| Quiet Hours `/notifications/quiet-hours` | Enable control accessibility | Defect | The enable switch was exposed as an unnamed checkbox | Accessibility repair needs specific owner approval | Not run |
| Food Diary `/food` | Add a database ingredient to Breakfast and verify totals | Pass | Searched `apple`, selected the first USDA result, kept 100 g, and saved it to Breakfast. After the refresh completed, Breakfast showed the correct 63 kcal item and daily totals increased from 63 to 126 kcal | Temporary Breakfast item was deleted; original Snacks item was preserved | Passed after cleanup |
| Food Diary `/food` | Food entry delete and refresh | Pass | Delete removed only the temporary Breakfast apple immediately; the locked instant-delete behaviour did not show a blocking spinner and the existing Snacks item remained | None | Passed after cleanup |
| Food Diary `/food` | Manual exercise buttons | Pass on repeat test | Both visible Add exercise buttons were retested separately and each opened the full exercise form with search, quick choices, categories and device connection | No code change; earlier result was not reproducible | Passed on live repeat test |
| Build a meal `/food/build-meal` | Save with no ingredients | Defect | Save meal was enabled with an empty ingredient list. Clicking it gave no validation message, disabled state or other response | Protected Food Diary repair needs specific owner approval | Not run |
| Import recipe `/food/import-recipe` | Empty URL validation and URL/photo modes | Pass | Empty Import displayed a clear valid-link message; photo mode showed the 15-credit cost, Take photo, Choose from library and Import from photo | No import was submitted and no credits were spent | Not needed |
| Recommended meal `/food/recommended` | Load and About/Cancel | Pass | Page loaded its 10-credit explanation and previous meals; About explained the flow and Cancel safely returned to Food Diary | No recommendation was generated | Not needed |
| Water `/food/water` | Quick Add 250 ml, summary, edit dialog and delete | Pass | Save confirmed “Water entry saved,” summary became 250 ml and 1 entry; Edit Time opened and Cancel worked. Delete confirmed “Entry removed,” restored 0 ml and the empty state | Temporary entry fully removed | Passed after cleanup |
| Health Journal `/health-journal` | Page load and control inventory | Pass | New entry, History, written note, photo, voice recording, audio-device selectors and submit controls all loaded | None for inventory | Not needed |
| Health Journal `/health-journal` | Save temporary written note and verify History/Edit/Delete | Pass | Save confirmed that only summary text was kept; History showed the exact temporary note on 14 Jul at 17:22; Edit opened the correct text with Save and Cancel; Delete required confirmation | Temporary audit entry was removed and the empty history state was visibly restored | Passed after cleanup |
| Health Coach `/health-tips` | Current alerts empty state, settings and history navigation | Pass | Current Health Coach screen loaded with no active alerts; Settings, alert cost and History were visible | Detailed settings/save testing still in progress | Not run |
| Health Coach History `/health-tips/history` | Page load and empty history | Pass | History loaded without an error and provided a route back to current alerts | None for the tested empty state | Not needed |
| Health Tracking `/health-tracking` | Page identity and device choices | Defect fixed locally | Navigation and page content identify Health Tracking, but the top page heading read “Insights”; Fitbit and Garmin controls loaded underneath | Changed only that heading to “Health Tracking” in `app/health-tracking/page.tsx`; exact lock snapshot refreshed | Code checks passed; live user-flow retest awaits owner-approved deployment |
| Today's Check-in `/check-in` | Select all five ratings and save | Defect | Selected Average for all five tracked issues; all five visibly changed to the selected green state and Save was enabled. Save was tried twice, with waits of 2.5 and 4 seconds. There was no success/error message, the selections remained, and History still said “No ratings yet” | Protected check-in repair needs specific owner approval | Not run |
| Check-in History `/check-in/history` | Verify saved ratings after both Save attempts | Defect | After each Save attempt, History still showed “No ratings yet” | Same defect as Today's Check-in save failure | Not run |
| Mood `/mood` | Page load and control inventory | Pass | Mood, intensity, emotions, influencing factors, next-best-step and save controls loaded | Save/history/delete flow still in progress | Not run |
| Mood `/mood` | Page identity | Defect | The Mood Tracker route and sidebar item open a page whose top navigation heading reads “Daily Check‑In,” even though Today's Check-in is a separate feature and route | Copy/heading repair needs specific owner approval | Not run |
| Mood `/mood` | Save a temporary Okay mood and verify History | Pass | Selected Okay at 35% intensity; Save acknowledged with “Saving…” and eventually opened History with `saved=1`. History showed Today, one check-in, Okay and the correct time/intensity | Save took about 10 seconds | Passed |
| Mood History `/mood/history` | Delete the saved mood check-in | Defect | Expanding and inspecting the saved entry exposed its date, time, intensity and meals logged, but no Edit, Delete or menu control exists anywhere on the entry or History page | Temporary Okay mood at 17:21 remains because the ordinary user UI provides no deletion path | Not run |
| Mood Preferences `/mood/preferences` | Reminder toggle and restoration | Pass | The page finished loading by about 6 seconds; enabling reminders showed Saved and enabled the schedule controls, then disabling again showed Saved and restored the original off state | No reminder was sent | Passed after restoration |
| Mood legacy routes `/mood/activity`, `/mood/insights` | Redirect behaviour | Pass | Activity displayed a redirect notice back to Mood; Insights redirected to Mood History | None | Not needed |
| Symptom Notes `/symptoms` | Create AI note, consent, result and History | Pass | AI consent clearly named OpenAI and allowed Not now. After consent, one Headache / 1 hour note produced a plain-language result and appeared in History with the exact time and inputs | Temporary audit note was deleted through the confirmation; older user entry remained | Passed after cleanup |
| Symptom Notes `/symptoms` | Advertised 1-credit charge | Defect | Credits visibly dropped from 870 to 867 after exactly one new symptom note, while the page repeatedly says “Cost: 1 credit” and the feature counter says it was used 1 time this month. AUDIT 2 confirmed it had not run a credit action before this immediate drop | Protected billing/credit repair needs specific owner approval | Not run |
| Symptom History `/symptoms/history` | View, delete confirmation and cleanup | Pass | New entry appeared first; Delete required a separate browser confirmation; after accepting, the audit entry disappeared and the older 26 May entry remained | None | Passed after cleanup |
| Insights `/insights` | Main insights, tracked issues and latest report | Pass | Main screen eventually loaded five tracked issues, current cycle progress and a working View report link | Initial load remained on “Loading Insights…” for more than 3.5 seconds and completed by 8.5 seconds | Not needed |
| Insights detail lists | Goals, Nutrition, Safety, Sleep and Supplements | Pass | Each section loaded the correct tracked-issue or supplement links, or a clear empty state | Goals and Supplements took several seconds to finish loading | Not needed |
| Insights issue detail `/insights/issue/Bowel%20Movements` | Open linked tracked issue | Defect fixed locally | The live heading, recommendation and reason showed the URL text `Bowel%20Movements` instead of `Bowel Movements` | The issue name is now safely decoded before display and before its detail request | Code checks passed; live user-flow retest awaits owner-approved deployment |
| Weekly Report `/insights/weekly-report` | Open latest report | Defect | Full report loaded, but its Open chat log link goes to production-only `/chat-log`, which redirects away instead of opening the user’s chat history | Not edited because active Linear ticket HEL-29 owns weekly-report/chat-history behaviour | Not run |
| Devices `/devices` | Device connection and interest control inventory | Pass | Fitbit, Garmin and other device-interest controls loaded | Fitbit timing defect is recorded under Dashboard | Not needed |
| Lab Reports `/lab-reports` | Page load and upload entry point | Pass | Upload Laboratory Report and Choose File loaded | File analysis not submitted during this pass | Not run |
| Health Image Notes `/medical-images` | New-note and History route load | Pass | Safety explanation, sources, upload-dependent disabled Create control, History navigation, saved-image cards, View details, Delete, Clear all and Refresh loaded | Existing saved scans were not altered | Not needed |
| Help `/help` and FAQ `/faq` | Help destinations and public guides | Pass | Contact Support, FAQ, Affiliate Help, feature guides, Dashboard return and practitioner links loaded | None | Not needed |
| Support `/support` | Existing signed-in support chat and new-ticket controls | Blocked | Luca chat, + Ticket, message field, disabled empty Send and End chat loaded | A live support message/ticket would contact another person and was not sent without separate action-time permission | Not run |
| Affiliate `/affiliate` | Current enrolment state | Pass | Affiliate Portal showed Not enrolled and a working Apply Now destination | Application was not submitted | Not needed |
| Affiliate Application `/affiliate/apply` | Form and Terms route | Pass | Name, website, channel, audience, promotion plan, agreement, notes and Submit controls loaded; Affiliate Program Terms loaded from the linked page | Application was not submitted | Not needed |
| Privacy `/privacy` | Policy page | Pass | The full Privacy Policy loaded, including the AI/OpenAI permission section and user rights | None for the tested read-only page | Not needed |
| Practitioner search `/practitioners` | Search form, categories and empty state | Pass | Search, location, radius/category controls and “No results yet” empty state loaded | Location permission was not granted | Not needed |
| Practitioner portal `/practitioner` | Listing form load for applicable account | Pass | Empty listing form loaded with service type, category, contacts, address, uploads and Save listing | No listing was submitted | Not needed |
| More `/more` | All submenu destinations | Pass | Health & Analysis and Account & Settings groups loaded all expected links | None | Not needed |
| Health Intake `/onboarding` | Numbered section navigation and final Review | Defect fixed locally | Paced retest loaded section 1 in 1.6 seconds and section 11 in 3.6 seconds with saved data, Back and Confirm controls. Review automatically requested browser location and rapid steps launched unused background requests | Automatic Review location request removed; three unused loads removed; Health Intake data read reduced; unchanged 12-second sync no longer rebuilds the form | Full build passed; live post-deploy retest pending |
| Mobile layout | Dashboard, Food Diary, Check-in, Mood and Settings at 390 × 844 | Pass | Each page matched the 390-pixel viewport width, had no horizontal overflow, and kept the core mobile navigation available | None in the five tested layouts | Not needed |

## Evidence files

- `/tmp/helfi-web-audit-2026-07-14/dashboard-profile-menu.png` — signed-in dashboard, desktop navigation and open profile menu.
- `/tmp/helfi-web-audit-2026-07-14/dashboard-fitbit-stuck.png` — Fitbit button stuck on “Connecting…” with no user-facing result.
- `/tmp/helfi-web-audit-2026-07-14/profile-open-camera-no-response.png` — Open Camera produced no visible response.

## Confirmed defects

1. Dashboard device-interest choices provide no immediate feedback and freeze all device controls for about 7–8 seconds.
2. Dashboard Fitbit Connect gives no explanation while the Fitbit sign-in tab is delayed for several minutes.
3. Profile bio does not save when the user leaves the page, despite the page saying that it will.
4. Profile Photo Open Camera gives no visible response.
5. Settings says the PDF opens in a new tab, but it replaces the current Settings view.
6. Several account, settings, Food Diary settings and notification controls have no readable names for screen-reader users.
7. Health Tracking had the wrong main heading, “Insights”. A one-word local repair is implemented and builds successfully; it is not deployed, so live retest is still pending.
8. Today's Check-in looked frozen while saving and History reused an old empty result even though the ratings reached the server. Repaired locally with immediate Saving feedback, one safe grouped save, correct field names and history-cache clearing.
9. Both Food Diary Add exercise buttons passed a repeat live test; removed from the current defect list.
10. One Symptom Notes request advertised as 1 credit deducted 3 credits.
11. Mood Tracker is labelled “Daily Check‑In” at the top even though Today's Check-in is a separate feature.
12. A saved mood check-in has no Edit or Delete action, leaving users unable to remove it.
13. Quiet Hours takes about 13.5 seconds to load its saved state and provides only a loading message during the delay.
14. Notification Delivery’s Email and Push switches do not change when clicked.
15. Build a meal leaves Save enabled with no ingredients, but clicking it gives no validation or response.
16. Insights issue details display URL codes such as `%20` in user-facing issue names. A local repair is implemented and builds successfully; it is not deployed.
17. Weekly Report’s Open chat log link goes to a production-disabled page instead of the signed-in chat history. This overlaps active ticket HEL-29 and remains owned there, so AUDIT 1 did not create a conflicting edit.

Additional confirmed Health Intake defect: section 11 could automatically request location and rapid navigation launched unused heavy background loads. Repaired locally as described in the matrix.

## Suggestions (not defects)

None recorded yet.

## Local repair verification

- Health Tracking heading: targeted ESLint completed with no errors (one unrelated existing hook warning).
- Insights issue-name decoding: targeted ESLint completed with no errors.
- Full page-lock check passed after refreshing the exact approved file hash; the pre-existing native voice hashes were preserved.
- Targeted lint completed with no errors for every edited repair file.
- Food Diary protected-region checks, date guard, practitioner lock, OpenAI-key safety check, web page locks, native voice guard checks and custom-food serving checks all passed.
- Full production build completed successfully after the complete repair batch. Existing project-wide warnings and expected dynamic-route messages remain; there is no new build error.
- No deployment had been performed at the time of this update. Real live-browser retest is still required after deployment.

## AUDIT 2 parity handover

Parity findings were copied to Linear HEL-464. Native should preserve the successful Food, Water, Mood save, Journal, Symptom history, Insights report and reminder behaviours described above, and must not copy the confirmed web defects. The latest handover also specifies decoded issue names, working notification switches, meal-builder empty validation, and chat-history routing to the signed-in Talk to Helfi history.
