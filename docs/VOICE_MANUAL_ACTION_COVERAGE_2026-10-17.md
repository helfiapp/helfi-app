# Voice versus manual actions — 17 October 2026

This records source coverage and limited actual app evidence; it is not proof that real speech or every listed action has worked. It separates a prepared voice proposal, an actual confirmed write, and opening a screen. The owner wants all applicable manual actions available conversationally. Opening the right screen alone does not satisfy that requirement.

## Current implementation and proof limits

The local repair now has fixed, authenticated adapters for the actions below. Changes require a signed review and explicit confirmation; selectors and state checks prevent changing a different account or a record that changed after review. The model cannot choose arbitrary endpoints, owners or nutrient values. This is source coverage, not a claim that every action has passed an actual app test.

| Implemented local area | Fixed action coverage and limits | Main source |
|---|---|---|
| Food and drinks | Source-resolved measured ingredients, branded counted servings, pending corrections, existing ingredient/portion edits and selected record deletion. Corrections retain trusted food sources. Unknown nutrients stay unknown. Linked hydration and calorie records are checked together. The existing-coffee voice edit and unchanged ordinary native re-save both passed with exact linked-record/nutrient/sweetener readback, as described below. | `lib/native-voice-record-actions.ts`; preparation/confirmation routes; normal food/water handlers |
| Food copy | Reviews the complete selected food rows and linked hydration snapshots; rejects missing/stale/ambiguous sources or more than 100 rows. Copies create new paired hydration IDs and verify all copied rows inside one transaction. No silent truncation or old hydration links. | `lib/native-voice-food-copy.ts` |
| Recipes and food library | Full source-resolved ingredients, yield, steps and eaten portions; diary versus favorite/custom-food destination; selected library edits/deletion. A complete dictated recipe preserves its stated title, quantities and steps. Negated consumption is excluded from diary intent; the banana/milk library save now has an actual app pass. URL import uses the normal authenticated importer, its existing 10-credit price and a reviewed import result followed by a separate recipe-save review. Importing does not itself mean saved or eaten. | `lib/native-voice-recipe-metadata.ts`; `lib/native-voice-recipe-url-import.ts`; `lib/public-recipe-url.ts` |
| Exercise | Create and selected manual-record update/delete, duration/distance/calorie override and trusted date/time. Device-imported activity remains protected. The normal editor clock fix has 41 offline cases and an actual reopen/save pass preserving the exact instant, duration and calorie override. | `lib/native-voice-record-actions.ts`; normal exercise handlers; `scripts/food-native-exercise-time-check.cjs` |
| Mood | New ratings with note/tags and explicit optional intensity, feelings and supported context ratings; context-only pending corrections retain other fields. Creation uses the normal mood handler and exact-ID readback, preserving normal passive context. Existing saved-record PATCH exposes only its supported rating/tags/note fields. | `lib/native-voice-mood-context.ts`; `lib/native-voice-record-actions.ts` |
| Journals and symptom notes | Health/mood journal create and selected update/delete with supported fields and media retained. Symptom-note history selection/deletion uses its fixed adapter; medical questions retain their safety response. No unsupported journal title, tags or clock is claimed. | `lib/native-voice-record-actions.ts`; journal/symptom handlers |
| Recorded supplements/medications | Existing add paths plus factual, selected recorded-list update/delete. Explicit administrative wording, exact field/dose evidence and unchanged clinical safeguards are required. Equivalent written dose units are accepted; strengths or conversions are not inferred. | `lib/native-voice-health-intake-record-actions.ts` |
| Profile, health setup, goals and preferences | Existing editable profile/setup fields, measured targets, semantic list additions/removals, supported explicit list clearing, hydration goal, coach preferences, weekly-report preferences, check-in rating set/update/delete and reminders/quiet hours. Omitted fields/notes/lists are retained. The selected-goal Energy add/remove and hydration-target change/restoration now have actual native/web sync checks; other fields retain their individual verification limits. | `lib/native-voice-preference-actions.ts` |
| Local preferences and inbox | Existing device-local appearance/haptics/analytics/visibility flags use actual native write/readback receipts. Selected inbox read/delete and reviewed visible bulk actions preserve later arrivals. Notification settings do not prove OS permission or delivery. | Native local-preference action helper; `lib/native-voice-notification-actions.ts` |
| Account reads and reports | Actual wallet, hydration and stored device status; report list/status and exact owned READY report summary/stored sections without AI rewriting. Locked/running/failed reports return status only. Weekly generation uses the normal owner, consent, setup and wallet gates; review binds existing report ID/status. The normal minimum balance is not a fixed final price: usage determines the charge. Generation receipts say requested/preparing with the real ID, not generated/unlocked/emailed without proof. | `lib/native-voice-app-reads.ts`; `lib/native-voice-report-actions.ts` |
| Support | Own ticket list/read/status and exact user-dictated create/reply/end-chat/feedback/delete through fixed normal handlers. Signed review, owned selection and literal text are required. Normal possible transcript email is disclosed; no email-delivery claim is made. Offline tests send no real support messages. | `lib/native-voice-support-actions.ts` |
| Apple Health | Reviewed import for an explicit date, automatic-update setting and an actually discovered source selection use the existing native provider. A live account/readiness snapshot and bounded account/token-digest journal prevent repeated or uncertain imports after recapture/reload. Only real supported activity is used. A source change may refresh activity when automatic updates are enabled. | Native device action helper; `AppleHealthSyncProvider` live snapshot; server `device_action` authorization |
| Navigation | Help, Support and Devices resolve to actual registered screens. Opening them is navigation only. | `inferNativeWebTarget` and navigation tests |
| Welcome and spoken replies | A bundled local welcome uses native playback events, cancellation/account guards and truthful unavailable notices. Complete speech and failed/empty stream charging have targeted offline boundaries; a transcript is not audible-playback proof. | Native local welcome controller/bridge/plugin; TTS and client boundaries |

Security/account changes, store purchases/restores/paid activation, OAuth/device approvals, OS Health/notification permissions and camera/photo selection keep their normal supported screens, authentication and human approvals. A handoff does not count as a completed password change, account deletion, purchase, connection, permission grant or photo import. Report PDF opening now has a reviewed READY-report executor and native handoff; it does not claim a saved file. Paid unlock remains the normal store purchase boundary. Dormant Sleep Coach code is not a reachable manual feature: its screen is unregistered, its report endpoint is absent and server voice actions reject it. This repair does not add that feature.

## Actual app evidence for the local candidate

The durable evidence is [the runtime verification record](release-evidence/2026-10-17/voice-repair-runtime-verification.json). The newest recipe and check-in rows below also include the primary agent’s observed normal-app confirmations while the durable record is being updated. These are signed-in simulator **typed conversations through the real local Helfi app/server**, with the stated normal UI/read-only readbacks. They do not establish microphone recognition or audible conversation quality. The record identifies prior released baseline commit `e944997a7897ebd3916f211749350573899b6587`, AWS job 126 and iPhone build 49; that is not a deployment of this new candidate.

| Actual test | Verified result | Specific remaining check |
|---|---|---|
| AU McDonald's Double Quarter Pounder and six nuggets | Two official AU counted foods; six → three → six retains sources; 1,020 calories; natural confirmation creates exactly one disposable meal. Native Edit meal and existing Chrome diary agree. | Broader restaurant/food variants and physical microphone use. |
| Mood score and note | Five → two out of seven retains the explicit note; correction costs zero; natural confirmation creates one exact score/date/note. Native and existing Chrome history agree. | Optional context fields and broader edit/delete cases are offline-tested, not established by this runtime example. |
| New coffee with milk and sugar | Coffee 250 ml + milk corrected from 50 to 25 ml + sugar 8 g saves once as one water row and one linked food row. Native editor and refreshed existing Chrome agree on 49 calories and 250 ml hydration; unknown fibre is retained. | Whole-volume/date changes, cancellation and delete/readback; the separate existing milk edit is verified below. |
| Existing coffee milk edit and normal re-save | **Passed after repair:** the voice milk change, same two IDs, native editor reopen and unchanged ordinary Save preserve all three ingredients, six source-backed nutrients, unknown fibre, 250 ml hydration and 8 g added-sugar metadata. Final values include 64.3622 calories, 1.9895 g protein and 1.6980 g fat. Earlier rejected writes rolled back; the later ordinary-save fault affected only this test coffee and was restored through the actual app before the successful recheck. | Broader drink edits/deletion and physical speech; no general drink round-trip claim beyond this recorded case. |
| Plain water | Natural typed 300 ml water followed by yes returned a server save receipt. Native and refreshed existing live web diary both show the new 300 ml entry and 550 ml total hydration (250 ml coffee plus 300 ml water). | Cancellation/retry, deletion and physical speech are not established by this example. |
| Health journal | Explicit note and date confirmed once; native reopen, existing Chrome history and exact-ID read-only database checks agree. | Other journal types, selected edits/deletion and attached-media cases. |
| Yoga and calorie correction | Twenty → thirty minutes with explicit 150-calorie override saved exactly once. After the clock repair, the native editor reopened at 07:30 Melbourne and an unchanged normal Save preserved the exact stored instant, 30 minutes and 150-calorie override. The repair also has 41 offline timezone cases. | Broader existing exercise edits/deletion, other timezones in the actual app and physical speech. |
| Recipe saved to library without eating | **Passed:** “Voice repair test banana milk”, banana 100 g + whole milk 100 ml, yield one serving, the exact single blend-until-smooth step and 150.8 calories saved to the library as `0615c570-fab2-44cb-a21f-a52fe1566161`. The food-diary count stayed at two. | Broader recipe edits, URL/photo import, alternative destinations and physical speech need their own results. |
| Daily check-in display wording and score | **Passed:** “Stress levels” at four out of seven maps once to the normal stored zero-based value three, with exact note “Voice repair test check-in.” and local date 17 October. Saved ID: `4949c077-73e1-4bc4-b916-96471db8f3b5`. | Live129 normal Chrome reload verified the exact local-day rating and note. Broader check-in changes retain their individual limits. |
| Selected health-goal synchronization | **Passed:** adding Energy showed the same six selected names in native and existing web screens. Removing Energy restored the exact original five selected names, all original HealthGoal IDs and all original CheckinIssue IDs. Existing ratings were retained; the test concerned selection, not deletion of an older unselected underlying goal. | Other goal/target edits and cache/race cases retain their separate limits. |
| Hydration-target synchronization | **Passed:** custom target 2,450 → 2,460 ml, then back to 2,450 ml, confirmed through normal voice reviews and refreshed native/web settings. Existing 550 ml hydration was retained. | Other profile/target fields and automatic reset are not proved by this example. |
| Local welcome in the rebuilt app | Native playback started and completed in3.476s; microphone outbound packets increased before/during/after; Ready and End/microphone-off verified. | Human auditory and physical speech recognition remain unverified. |


Only the recorded disposable test entries and explicitly reviewed reversible settings/goal selections were changed; original selected-goal/check-in IDs and the original water target were restored. Android and physical iPhone microphone input/audible replies remain unverified for this candidate. Local Debug/rebuilt simulator checks do not prove a store/live release or installation on the physical iPhone. Build 50 fields and a rebuilt welcome test are not release or audible-success receipts. No claim of complete manual-action runtime parity is made. The primary agent owns final exact-source checks, the ongoing welcome result and web local-date deployment verification.

## Required offline regression coverage

`scripts/assert-native-voice-confirm-guard.js` currently registers **52 required suites**. Their synthetic authenticated handlers, storage/transaction fixtures, actual source functions and native callback fixtures test the boundaries without real provider calls, account writes, Health reads or purchases. They supplement actual app testing. Recorded offline counts and current targeted fixture counts are listed separately from runtime evidence; source inspection or registration alone is not a fresh full-run result.

| Required suite (`scripts/`) | Recorded offline count / scope |
|---|---|
| `voice-save-integrity-check.cjs` | 25 groups |
| `voice-draft-integrity-check.cjs` | 24 groups |
| `voice-sign-save-integration-check.cjs` | Composed signed prepare/confirm scenario |
| `voice-client-integrity-check.cjs` | Native callback integrity suite |
| `voice-live-protocol-check.cjs` | Route/native/metering protocol surfaces |
| `voice-restaurant-food-integrity-check.cjs` | 24 groups |
| `voice-action-matrix-check.cjs` | 78 cases |
| `voice-action-outcome-check.cjs` | Actual outcome/receipt boundary suite |
| `voice-record-actions-check.cjs` | 41 groups |
| `voice-library-save-boundary-check.cjs` | 8 targeted normal library-handler groups, including bounded transactions, exact readback, rollback and sanitized failures |
| `voice-preference-actions-check.cjs` | 48 current fixture groups, including Stress display aliases/seven-choice mapping, exact notes and singular semantic list changes |
| `voice-recipe-metadata-check.cjs` | 5 groups |
| `voice-recipe-integration-check.cjs` | 11 groups |
| `voice-recipe-continuation-check.cjs` | 11 groups, including the exact dictated banana/milk request, library-only confirmation and complete model shapes |
| `food-native-loading-race-check.cjs` | 12 groups |
| `food-native-exercise-time-check.cjs` | 41 open/save cases across Melbourne, UTC+14 and UTC; actual Melbourne editor round trip passed |
| `native-checkin-local-date-check.cjs` | 21 offline cases; native local-date save, stale account/day/load and ownership boundaries |
| `web-checkin-local-date-check.cjs` | 21 targeted web/normal-handler cases across Melbourne, UTC+14 and UTC; actual live deployment still needs verification |
| `voice-food-record-edit-check.cjs` | 11 groups |
| `voice-notification-actions-check.cjs` | 17 groups |
| `voice-health-intake-record-check.cjs` | 9 groups |
| `voice-symptom-record-check.cjs` | 11 groups |
| `voice-ordinary-food-lookup-check.cjs` | 21 groups |
| `voice-greeting-check.cjs` | Greeting/callback boundary suite; no audible proof |
| `voice-local-welcome-check.cjs` | 11 local welcome/controller/bridge/plugin groups; actual native completion/media proof recorded; no human auditory claim |
| `voice-navigation-parity-check.cjs` | 3 groups |
| `voice-app-reads-check.cjs` | 19 groups |
| `voice-recipe-url-import-check.cjs` | 9 groups |
| `voice-recipe-import-confirm-check.cjs` | 7 groups |
| `voice-support-actions-check.cjs` | 8 groups |
| `voice-spoken-quantities-check.cjs` | 14 groups |
| `voice-report-actions-check.cjs` | 9 groups |
| `voice-native-device-actions-check.cjs` | 19 synthetic-IO groups; dormant Sleep fixtures do not expose a feature |
| `voice-result-receipt-storage-check.cjs` | 5 groups |
| `voice-food-copy-integrity-check.cjs` | 10 groups, including complete 100-row copies and atomic new hydration pairs |
| `voice-journal-symptom-truthfulness-check.cjs` | 7 groups |
| `voice-exercise-override-roundtrip-check.cjs` | 3 groups |
| `voice-source-drink-normal-save-check.cjs` | 7 targeted source/normal-handler groups, including actual native Save serialization and single-milk precision |
| `voice-drink-metadata-check.cjs` | 8 groups |
| `voice-drink-readback-shape-check.cjs` | 10 targeted groups: serialization/one-bit numeric drift versus material, identity and unknown-value changes; rejected writes roll back |
| `voice-mood-context-check.cjs` | 9 groups |
| `voice-tts-boundary-check.cjs` | 11 current targeted groups, including complete inline replies and zero debit on token/stream/empty-audio failures |

The primary agent owns the final full guard run, compilation, normal UI rechecks and any release. Offline counts must not be added together and presented as actual spoken journeys or successful live writes.

## Historical starting inventory

The following inventory was captured before the expanded adapters above. The original confirmation route mainly created exercise, mood, journal, water, symptom, intake and meal entries. Pending draft corrections did not themselves edit saved records. General app-update wording in the model prompt did not supply a record-editing handler. This table preserves the manual contracts and original gaps that prompted the repair; its “at inventory time” column is historical.

| Area | Manual capability / source evidence | Voice source at inventory time | Required parity |
|---|---|---|---|
| Food diary | Create `TrackCaloriesScreen.tsx:3054`; edit name/time/nutrition `:3378`; delete `:3135`; API food-log POST `:655`, PUT `:973`, DELETE `:1122` | Create measured ingredients, copy previous meal, log an existing favorite; correct the pending draft | Select an existing entry unambiguously; edit ingredients, portions, category/date/time/name; delete only the reviewed selected entry; reopen and verify |
| Water/drinks | Add `WaterIntakeScreen.tsx:412`; edit time `:608`; delete `:570`; goal `:664`; water-log/[id] PATCH `:143`, DELETE `:82` | New hydration + linked food nutrition; pending volume/milk/sugar corrections | Edit/delete existing hydration with matching linked calorie record; change hydration goal; preserve ingredient nutrients and linkage |
| Exercise | Food screen create/update `TrackCaloriesScreen.tsx:5782`, delete `:5850`, sync `:5884`; exercise-entries/[id] PATCH `:43`, DELETE `:15` | New manual exercise, pending corrections | Select/update/delete an existing manual exercise; never rewrite a device-imported total as manual; use existing provider/sync controls |
| Mood rating | `MoodTrackerScreen.tsx:620` saves rating; mood/entries API POST `:210`, PATCH `:255`, DELETE `:284` | New rating, pending correction | Exact numeric scale; negation/self-correction; edit/delete existing rating where supported. API availability is distinct from an observed native edit control |
| Health journal | Screen save `HealthJournalScreen.tsx:385`, edit `:401`, delete `:425`; API health-journal/[id] PATCH `:18`, DELETE `:52` | New text note; journal/photo screen handoff | Edit/delete selected existing note; preserve other notes and attached media |
| Mood journal | Screen save/edit `MoodTrackerScreen.tsx:1250`, delete `:1338`; API mood/journal/entries/[id] PUT `:150`, DELETE `:219` | New note; pending text correction; journal screen handoff | Select correct journal type; edit text/title/tags while retaining media; delete only selected note |
| Symptom/image notes | Symptom notes history/delete `SymptomNotesScreen.tsx:171,286`; health-image capture screen exists | Safe notes/handoff; medical questions receive safety response | Notes/history only, no diagnosis; selecting/deleting a note needs its own explicit operation. Camera selection/permission remains real user/device input |
| Meal/recipe builder | Import URL/photo `TrackCaloriesScreen.tsx:3996,4072`; servings eaten `:4119`; edit saved meal `:4133`; save combined/custom meal `:5562` | Recipe suggestions and normal Build a meal handoff; some measured food proposals | Conversational recipe name/yield/steps/ingredients/add/remove/replace/portion; actual saved recipe/custom-meal result, not just a populated builder |
| Favorites/custom foods | Shared favorites storage `TrackCaloriesScreen.tsx:2700`; add `:3576`, rename `:3635`, delete `:3657`, edit `:4133`, save recommended `:5381`; user-data POST accepts favorites | Log an existing favorite; open favorites; no general library mutation action | Create/edit/remove selected favorite/custom item without replacing unrelated list entries or changing food history; preserve source and original nutrient basis |
| Profile/health setup | Profile auto-save `ProfileScreen.tsx:172`; HealthSetupScreen hosts onboarding form; `app/onboarding/page.tsx:24` lists gender, weight, height, goal/diet/allergy/intake fields; user-data POST `:1165` | Settings/intake screen handoff; medication/supplement review proposals only | Profile fields, measured units, diet/allergies, goals and targets with confirmation; existing medical/intake safeguards retained |
| Daily check-in | `DailyCheckInScreen.tsx:184` save, `:379` edit, `:354` delete; checkins/today POST `:190`, ratings PATCH `:31` | No dedicated check-in write action | Select issue/date/rating; save/update/delete exact rating, preserve other issues/history |
| Preferences | Food settings user-data save `FoodDiarySettingsScreen.tsx:212`; account-local save `AccountSettingsScreen.tsx:128` | Open Settings only | Apply exact requested preference and read it back; distinguish local-only settings from account-wide settings |
| Reminders | Save check-in reminders `RemindersScreen.tsx:429`, mood reminders `:478`; checkins/settings and mood/reminders POST | Open Reminders only | Time/timezone/days/enable switch, quiet hours, exact read-back; no promise of delivery without actual notification evidence |
| Notifications | Quiet-hours save `NotificationsQuietHoursScreen.tsx:171`; insight settings `NotificationsAiInsightsScreen.tsx:274`; inbox mark/read/delete `NotificationInboxScreen.tsx:144,184,212` | Reminders screen handoff | Exact preference/inbox selection; distinguish settings change from permission approval or message delivery |
| Devices/Health | Devices OAuth ticket/connect `DevicesScreen.tsx:224,240`, disconnect `:261`; Dashboard Health import `:536` and automatic switch `:948` | No dedicated device mutation tool | Voice can prepare/open exact control, but OAuth, OS permissions and new device approvals require actual supported UI. Never claim connection/import from a handoff |
| Billing/credits | Billing buy/store flow, restore `BillingScreen.tsx:606`, manage `:462`, plan change `:507`, cancel `:582` | Open Billing only | Explain/display current actual state; take user to exact authorized purchase/manage control. Store purchase/authentication remains real store UI; no invented purchase or credit grant |
| Account/security | Change password `AccountSettingsScreen.tsx:219`, account deletion `:243`; OS/account sessions | No action executor | Sensitive actions need exact normal verification/confirmation; opening account settings is not a completed password/account change |

Paths without a prefix in screen references are under `native/src/screens/`; API references are under `app/api/`. Line numbers are a source-reading snapshot and will move as the active repair is integrated.

## Historical findings and source safeguards

`scripts/voice-action-matrix-check.cjs` runs the actual preparation POST and functions with synthetic account, wallet and food replies. It has no provider client, real database, credentials or network. Initial run found seven meaningful failures: negated happy mood became positive, self-corrected sad mood stayed happy, natural meal category text polluted the last ingredient, natural drank-water was unrecognized, yoga was unrecognized, numeric reviewed mood changed to neutral, and a free confirmation required extra available credits. New tests also reject physiological sensations/questions becoming mood logs. Passing these checks proves only the tested source paths.

The first inventory recorded 55 matrix cases, 35 record groups, five recipe groups, 16 ordinary-lookup groups and 23 draft groups. Those numbers are historical; current required coverage is listed above. The tests exercise actual bridge/normal-handler code with synthetic boundaries, including ambiguity, stale reviews, failed/skipped writes, exact owned selection, library compare-and-swap and recovery tombstones. Actual signature integrity is checked separately from the matrix's explicitly synthetic token verifier.

Source-resolved ingredient changes preserve untouched ingredients and portions. Raw model nutrition cannot replace lookup evidence. Multiple legacy food records linked to one drink require an explicit complete review. Gram/ounce portions need a known weighted full basis; missing weights are never assumed to be 100 g. Unknown nutrients cannot become zero. Source identity, account ownership and pre-write review versions remain exact; narrowly classified last-bit serialization drift after a write is distinct from a material nutrient or identity change.

Native and web local-date check-in fixes each have 21 targeted offline cases. The actual Stress check-in save and selected-goal native/web results are recorded above; they do not establish the web Today date repair’s live deployment. Preference checks cover exact owned issue/date ratings and explicit not-applicable values, retaining omitted notes. Dated writes validate ownership and supported local dates, including Australian daylight saving and UTC+14. A missing rating is not a saved zero. Native loading-race checks prevent older requests replacing newer data and retain Health import revision guards.

Ordinary lookup requires compatible identity/form and a usable requested measurement. It prefers compatible country/local sources and uses the normal food search/serving handlers for fallback. A recorded fluid portion can supply its stated volume; a gram-only record does not acquire invented density. Original provider, food and serving IDs remain attached. These checks do not guarantee provider availability or a successful actual UI retry.

The coffee portion was independently verified in the [official USDA SR Legacy CSV archive](https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip), linked by its [official download page](https://fdc.nal.usda.gov/download-datasets/). Exact FDC 171890 matches the brewed tap-water coffee description. `food_portion.csv` row 89520 records one cup (8 fl oz), 237 g; rows 89518 and 89519 record one/six fluid ounces at 29.6/178 g. Archive SHA256 is `b80817294b8850530aaedf2e515c02593b1824f763a0ff356e5c2081643e6fd0`. A narrow cited portion repair exposes those records through the normal servings handler for that exact ID, name, source and 100 g basis. Nutrients are calculated from the existing matching local row; no calories, coffee density or other food's portions are substituted. Offline tests execute the actual normal servings handler and the voice lookup consuming it.

## Broader actual app test plan

1. Use the currently signed-in disposable account and the existing browser/installed phone. Record installed build, deployed source, date/time and starting diary count/credits. Do not use iPhone Mirroring as evidence of microphone input.
2. Speak a natural mood report, then “actually, make it 2 out of 7”, then yes. Verify exactly one entry, exact score/date/note, reopen on the phone and existing browser. Repeat “I am not happy” and mixed feelings; require clarification rather than a positive fabricated result.
3. Speak a measured multi-food lunch, including brand and amounts where relevant. Correct one ingredient and portion; choose date/time/category, confirm once, repeat yes and reconnect. Verify one accurate entry and six nutrients, preserving unknown values.
4. Test black coffee, coffee with measured milk/sugar, juice and water with honey. Confirm drink and food records agree; edit/delete the selected disposable drink and verify linked calorie nutrition also changes exactly once.
5. Test exercise with duration/distance/steps; yoga and swimming; existing manual exercise edits/deletion. Device imports stay protected and are verified separately against actual device totals.
6. Test health and mood journals separately, including edit/delete of one disposable note and preservation of photos/audio. Test safe symptom note creation separately from medical-advice questions.
7. Build and save a recipe with explicit yield, steps, ingredient changes and servings eaten; reopen the saved recipe and modify it by voice. Save/rename/remove an explicit test favorite/custom food without touching unrelated favorites/history.
8. Test check-in ratings, one reversible profile/goal/preference change, reminders/quiet hours and inbox actions. Read back actual saved values and restore approved test values. A screen opening is counted only as navigation.
9. Exercise no/discard, silence, unclear speech, interruption before confirmation, Done, backgrounding, network failure and retry. Never claim a save/cancel until its actual outcome is known. Record exact user request, visible proposal, spoken response, server result and reopened record.
10. Keep purchases, OS access and account deletion out of routine destructive tests. Use supported dedicated verification/explicit owner authorization when those exact actions are tested; never weaken authentication or permission controls.

The actual local saves verified so far are limited to the examples in the runtime evidence table. Remaining checklist items require their own recorded result. No physical-microphone, Android or new-candidate release pass is claimed.

Actual welcome follow-up: rebuilt iPhone16e Debug app completed the bundled Marin clip in3.476s (asset3.456s), retained increasing microphone outbound packets through/after playback, returned Ready, and End visibly turned microphone off. Physical hearing and speech recognition remain unverified. Normal native Favorites/Edit meal also reopened the exact banana-milk recipe with two foods and all six nutrient states.

| `voice-favorite-recipe-portion-check.cjs` | 9 actual-source portion/review/account/signature/save groups; explicit servings scale from full recipe basis, numeric recipe names excluded, unknown nutrients preserved |

Actual follow-up: the two-serving banana milk recipe saved only to the library with2servings/150.8calories and no diary change. “Log one serving ... for snacks today” plus natural yes saved exactly one row at75.4calories/scale0.5. The normal native editor reopened1of2servings, and unchanged Save preserved the same record/portion/unknown fibre with its normal displayed nutrient rounding.

Server portability: the complete49-suite voice guard and command checks pass under UTC with every native/node_modules resolution deliberately refused. The welcome plugin fixture uses a declared synthetic Expo/project boundary plus exact actual pbxproj membership/canonical source checks; real Debug and signed iOS builds are separate proof.

No-pending controls: `voice-no-pending-cancel-check.cjs` executes actual preparation handlers with synthetic gates. Whole-utterance discard/cancel and explicit save without an editable review return truthful read-only replies, zero extra charge and no provider call. Active reviews still use existing rejection/confirmation. Substantive negative requests and safety messages stay outside this classifier. Physical50 lost-review recovery exposed this edge case; final production retest is recorded separately.

## Final manual-action additions and release separation

Native50/e7c74f72 was actually installed and signed in; server129 and recovery130/c7a2608d were verified on both domains. Physical50 typed restaurant review showed both foods/1020kcal without saving. Repeating No, discard it after the review closed gave the exact no-draft explanation; today food count3 remained unchanged. This is typed-path evidence, not physical speech recognition/hearing.

The native51 candidate adds PDF opening, GoogleFit/Oura/Polar interest preferences, selected saved health-image-note deletion, saved Chat History rename/delete and captured coach/check-in history deletion. Required new suites: PDF server13 groups; PDF client12; additional server14; additional/history client13; history server18. The complete49-suite guard passed under UTC with native/node_modules resolution denied, alongside root/native types and design/region checks. Actual native opening/preferences are verified separately after release; no real history deletion was used to test these features.

A report PDF review binds exact owner/READY report/period/content and the first native receipt binds SHA256(reviewToken). Only transient access links leave the confirmation response; none enter durable receipts or transcripts. The microphone is stopped before the normal OS opening. Saved-history wording cannot clear the current voice chat, even under a mislabeled model action. Bounded history snapshots and transactional exact-row comparison preserve later arrivals and reject stale/partial selections. Already-absent means no deletion was performed. These are finite coverage/tests, not a promise that every possible spoken request or every platform has been exercised.


### Native52 response and screen-refresh correction

The device-interest adapter now consumes the real normal GET envelope; its actual-wrapper suite has15 groups. Four mounted views (Devices, Health Image Notes, Health Coach history and Daily Check-in history) consume exact same-account completion events and perform guarded read-only refreshes. The additional27-group actual-source suite covers late/unmounted/wrong-account reads, superseded responses, inactive history and preservation of unsaved forms. Runtime display checks remain separate.

Known protected-screen limitation: Insights refreshes on normal focus, but generating a report while Insights is already focused can leave the list/status stale until the page is reopened. The approved Insights/MainTabs hard locks have not been changed. PDF opening does not modify stored report data. This is not evidence that all manual app features are universally voice-complete.

Final52 pre-release checks: complete50-suite guard PASS under UTC with native-only dependencies refused; root and native type checks PASS;292 full/93 native locks PASS; protected-region checks PASS. Signed52, deployment and device checks are recorded separately once actually performed.

### Native53 completion and dirty-form protection

Support/Settings27 actual-source groups consume the actual current completion emitter and normal GET envelopes, retain selected ticket and unsent forms, deduplicate repeat completions and ignore delayed/account-switched reads. Coach8 actual-source scenario groups use real normal GET/POST code with synthetic storage/scheduling: confirmed fields survive old blur/in-flight full saves, canonical server settings are read back before clean state, unrelated/newer edits survive and repair failures stay dirty. Named Coach timezones now include the reviewed manual flag; explicit automatic mode remains automatic and conflicting fixed+automatic requests clarify. Preference suite now53 groups. No real Support message/deletion, paid Coach activation or report generation was used for these checks.

Native52 was signed and Apple-validated but deliberately never uploaded/distributed;53 includes these final functional corrections. Protected Insights same-focused report-request refresh remains a separately prepared, unapplied proposal for exact owner approval; no visual or protected-baseline change was made.

Final53 source verification: complete52-suite guard PASS under UTC/root-only dependency boundary; root/native type checks PASS;292 full/93 native locks and protected regions PASS. Actual-source regression fixture repair seeded new lifetime refs without weakening assertions. Final source is frozen for exact production and signed53 builds.

### Physical53 follow-up and server repair candidate

Native53/eacb13c is actually installed, opened and signed in on the physical iPhone. Its actual Oura preference off/restore test passed with exact original row/other preferences preserved and mounted Devices immediately refreshed. Typed natural Yes was used. The latest READY PDF review selected29April–5May correctly, but native URL verification refused the result. The longer meal/date/colon request above also failed because `for :` entered the product name. Neither failure saved a meal or claimed to open a PDF.

Server repairs now cover the exact failing natural request through actual POST composition (restaurant23 groups), plus trusted public PDF origin through actual normal PDF handler and unchanged native boundary (PDF16 groups). Internal runtime URL reproduces the exact native alert offline; malicious forwarded headers/returned links are rejected. These are offline results until the exact server release and installed53 retests are separately verified. No native source/design/baseline or normal PDF route changes are needed for these two repairs.

### Retained-state and configured production-origin regressions

AWS134/4faec663 was deployed and both domains verified. Actual installed53 retest exposed two further cases: a failed prior meal was misread as an ingredient-addition context because the complete new request contained “with Cheese”, leading to provider fallback and a28second failed response; and production's three public-site settings select the exact master Amplify default origin, so the new PDF origin helper refused it. Neither actual retest is recorded as successful.

The next server repair recognizes complete new meal commands before pending additions and preserves true add/change corrections. Restaurant24 groups now exercise exact smart-apostrophe requests with the retained failed draft, actual public stored food rows through the actual mapper, exact1020/source IDs/no fallback/no save. The full8261public-row mapper was independently read-only checked; no malformed-row cause found. PDF17 groups exercise the actual site-url helper with synthetic copies of the known production public settings, mapping only that exact configured production alias to helfi.ai; other AWS/HTTP/credential-bearing destinations remain refused. Native53 source and all approved designs remain unchanged. Deployment and actual phone retests remain separate evidence.
