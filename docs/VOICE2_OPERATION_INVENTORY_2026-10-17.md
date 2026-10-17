# VOICE 2 operation inventory — 17 October 2026

Source audit only. No app, provider, database, network or credit action was executed. This does not establish installed or spoken parity.

{
  "total": 321,
  "domain": 279,
  "navigation": 42,
  "bySection": {
    "food": 50,
    "water": 9,
    "exercise": 8,
    "mood": 13,
    "journal": 7,
    "symptoms": 4,
    "health_image": 6,
    "checkin": 8,
    "coach": 7,
    "insights": 13,
    "profile": 7,
    "settings": 10,
    "account": 4,
    "reminders": 6,
    "notifications": 9,
    "billing": 10,
    "devices": 11,
    "support": 10,
    "practitioners": 8,
    "affiliate": 6,
    "practitioner_management": 20,
    "health_setup": 28,
    "labs": 4,
    "chat": 9,
    "navigation": 42,
    "content": 6,
    "auth": 6
  },
  "byReadiness": {
    "partial": 76,
    "existing": 89,
    "missing": 156
  },
  "byKind": {
    "read": 75,
    "write": 132,
    "person": 96,
    "paid": 18
  }
}

Full rows, exact source lines, route registrations, definitions and SHA-256 source snapshots: `scripts/voice2-manual-operation-inventory.json`.

## Counting rules

An operation is one semantic normal action contract, rather than each button, field value, icon or alias. Distinct read/write/paid/person workflows have distinct rows. Individual input fields served by one validator are grouped (for example health profile fields); media extraction, upload, approval and save are separate actions. Navigation is a separate category and is never an executable substitute for logging, analysis, save, purchase or account change.

The graph starts at MainNavigator (38 registrations including Tabs), five MainTabs entries, and real More/Help/HealthSetup destinations. TrackCalories/FoodAnalysis/Food are aliases. SleepCoach is not registered and is excluded. Actual gateways include `/onboarding`, `/faq`, `/affiliate/apply` and conditional `/practitioner`; linked affiliate portal, lab-upload component and supported web chat/history control contracts are included. This is a bounded product-operation inventory, not an assertion that every transitive public marketing link or administrative page is in scope.

`existing` means source adapter identified, not end-to-end verified or compatible installed binary. `partial` explicitly carries gaps; `missing` means no corresponding adapter identified. Existing fixed adapters are useful reusable building blocks; they are not one authoritative general operation registry yet.

## Material gaps

- Food aliases expose richer copy, combine, source/portion edits, barcode labels, photos, missing-food, sharing and local view controls. New food helper is not a completed root/client integration.
- Current-day remaining calories need targets, actual food, exercise, diet/allergies and trusted local day together; food totals alone are insufficient. Recipe saving and eaten servings are separate outcomes.
- Symptom analysis/follow-up has a new partial helper. Health-image analysis/save/chat, journal media and full mood-journal metadata need real normal contracts. Do not turn medical questions into journal saves or claim a picture was saved when only analysis ran.
- Dashboard has a Huawei interest action at `native/src/screens/DashboardScreen.tsx:988`, absent from the current voice provider enum; Google Fit/Oura/Polar interest is not device connection.
- Intake gateway includes supplement/medication photo analysis, lab processing/deletion and interactions analysis/history. These were not covered by a native menu-name count.
- Practitioner management and affiliate application/payout workflows are reachable and need real operation or continuing person-step mappings. Routine profile/account/notification names are not sufficient coverage.
- Account name/email controls save device-local display data, not authenticated identity. Health summary PDF differs from a weekly report PDF. Account-security notification switches are static, so no write operation is invented.
- Dedicated Dashboard and Insights design locks remain intact. A new host hook in these exact protected files still needs the required exact owner approval.

## Honest effort checkpoint

The source supports an offline architecture proof in the approved 45–60 minute checkpoint, not completion of every operation in that hour. Remaining delivery includes registry adapters and composition, structured typed/realtime transport, actual-state reads, durable receipts/recovery, native host controls/person-step resumption, full operation coverage checks, and separately approved real app/credit testing. There is no source evidence supporting a promise that all this will finish within a further one-hour session. A calendar completion estimate would be speculative before the proof establishes adapter reuse and the owner chooses the exact full-scope boundary. Parent should present concrete covered/gap counts and next bounded batch instead of silently beginning another 7–8 hour run.

## Review evidence and limits

The inventory validates unique IDs, valid source paths and line bounds, and finite kind/readiness values. Source hashes cover 194 actual manual/navigation/adapter/normal-handler files. Review corrected notification deletes to the real POST action contract, practitioner updates to PUT, report uploads to POST and account cancellation to normal POST action=cancel. The barcode label-save endpoint persists extracted facts; its preceding image analysis is separately metered. The list also includes exact manual move behavior and sign-in/sign-up/Apple/password-reset/terms workflows.

Chat History has a concrete native entry from `native/src/screens/InsightsScreen.tsx:922`; it was not included solely because of the unused generic route catalog. Its server rename/delete differ from local web archive/unarchive.

Source hashes are a deliberate review tripwire, not an automatic understanding of arbitrary new components. A changed hashed source requires inventory reconciliation; new registered routes must also fail the route inventory comparison. Imported child components and new transitive gateways still require explicit source review. Parent must not present a green coverage check as manual runtime parity.

## Operation rows

| ID | Kind | Readiness | Normal handler/control | Manual evidence |
|---|---|---|---|---|
| food.diary.list | read | partial | GET /api/food-log | native/src/screens/TrackCaloriesScreen.tsx:2874 |
| food.diary.detail | read | partial | host openMealEntryEditor + GET /api/food-log | native/src/screens/TrackCaloriesScreen.tsx:4124 |
| food.diary.totals | read | partial | host day aggregation from food/water/exercise/user-data | native/src/screens/TrackCaloriesScreen.tsx:2874 |
| food.diary.create | write | existing | POST /api/food-log | native/src/screens/TrackCaloriesScreen.tsx:3090 |
| food.diary.update | write | existing | PUT /api/food-log | native/src/screens/TrackCaloriesScreen.tsx:3390 |
| food.diary.delete | write | existing | POST /api/food-log/delete + POST /api/food-log/delete-atomic | native/src/screens/TrackCaloriesScreen.tsx:3155 |
| food.diary.duplicate | write | partial | host duplicateEntry -> POST /api/food-log | native/src/screens/TrackCaloriesScreen.tsx:3436 |
| food.diary.copy_seven_days | write | partial | host copyEntryFor7Days -> POST /api/food-log | native/src/screens/TrackCaloriesScreen.tsx:3459 |
| food.diary.copy_selected | write | partial | host pasteCopiedItems -> POST /api/food-log | native/src/screens/TrackCaloriesScreen.tsx:3507 |
| food.diary.copy_meal_today | write | partial | host copyCategoryToToday -> POST /api/food-log | native/src/screens/TrackCaloriesScreen.tsx:3541 |
| food.diary.combine | write | partial | host saveCombinedMeal -> food-log + favorite storage + delete originals | native/src/screens/TrackCaloriesScreen.tsx:5562 |
| food.view.date | write | missing | host setSelectedDate | native/src/screens/TrackCaloriesScreen.tsx:6292 |
| food.view.energy_unit | write | missing | host setEnergyUnit(kcal/kj) | native/src/screens/TrackCaloriesScreen.tsx:6458 |
| food.view.meal | write | missing | host runSectionAction / meal controls | native/src/screens/TrackCaloriesScreen.tsx:5939 |
| food.view.copy_selection | write | missing | host copySelected / selectedIds | native/src/screens/TrackCaloriesScreen.tsx:3529 |
| food.library.list | read | partial | GET /api/food-log/library + GET /api/user-data favorites | native/src/screens/TrackCaloriesScreen.tsx:2810 |
| food.library.detail | read | partial | host openFavoritePreview | native/src/screens/TrackCaloriesScreen.tsx:3776 |
| food.library.filter | write | missing | host openFavorites / search / category controls | native/src/screens/TrackCaloriesScreen.tsx:3566 |
| food.library.create | write | existing | POST /api/user-data favorites | native/src/screens/TrackCaloriesScreen.tsx:3576 |
| food.library.update | write | partial | host updateFavoriteFromEditor -> user-data + food-log | native/src/screens/TrackCaloriesScreen.tsx:4133 |
| food.library.rename | write | existing | host renameFavoriteItem -> user-data favorites | native/src/screens/TrackCaloriesScreen.tsx:3635 |
| food.library.delete | write | existing | POST /api/user-data favorites | native/src/screens/TrackCaloriesScreen.tsx:3657 |
| food.library.log | write | existing | host addFavoriteToDiary -> POST /api/food-log | native/src/screens/TrackCaloriesScreen.tsx:3679 |
| food.library.portion | write | existing | host openFavoriteAdjust + addFavoriteToDiary | native/src/screens/TrackCaloriesScreen.tsx:3781 |
| food.library.share | person | missing | Share.share exact buildFavoriteShareText | native/src/screens/TrackCaloriesScreen.tsx:4814 |
| food.search | read | existing | GET /api/food-data | native/src/screens/TrackCaloriesScreen.tsx:4489 |
| food.servings | read | existing | GET /api/food-data/servings | native/src/screens/TrackCaloriesScreen.tsx:4571 |
| food.barcode.lookup | paid | partial | GET /api/barcode/lookup | native/src/screens/TrackCaloriesScreen.tsx:5003 |
| food.barcode.capture | person | missing | CameraView barcode scan / native permission | native/src/screens/TrackCaloriesScreen.tsx:5033 |
| food.barcode.label | write | missing | POST /api/barcode/label | native/src/screens/TrackCaloriesScreen.tsx:5128 |
| food.barcode.log | write | partial | host addBarcodeFood -> POST /api/food-log | native/src/screens/TrackCaloriesScreen.tsx:5041 |
| food.photo.select | person | missing | ImagePicker camera/library permission and actual selected asset | native/src/screens/TrackCaloriesScreen.tsx:5146 |
| food.photo.analyze | paid | partial | POST /api/analyze-food | native/src/screens/TrackCaloriesScreen.tsx:5186 |
| food.missing.submit | write | partial | POST /api/food-missing | native/src/screens/TrackCaloriesScreen.tsx:4676 |
| recipe.import_url | paid | existing | POST /api/recipe-import | native/src/screens/TrackCaloriesScreen.tsx:3996 |
| recipe.import_photo | paid | missing | POST /api/recipe-import image payload | native/src/screens/TrackCaloriesScreen.tsx:4072 |
| recipe.photo.select | person | missing | ImagePicker camera/library | native/src/screens/TrackCaloriesScreen.tsx:4015 |
| recipe.builder.open | person | partial | host openNativeMealBuilder | native/src/screens/TrackCaloriesScreen.tsx:3891 |
| recipe.builder.ingredients | write | partial | host append/remove/replace source-resolved editor items | native/src/screens/TrackCaloriesScreen.tsx:4405 |
| recipe.builder.metadata | write | existing | host applyImportedRecipe + builder metadata | native/src/screens/TrackCaloriesScreen.tsx:3966 |
| recipe.builder.servings_eaten | write | existing | host updateRecipeServingsEaten | native/src/screens/TrackCaloriesScreen.tsx:4119 |
| recipe.recommendation.read | read | missing | GET /api/ai-meal-recommendation | native/src/screens/TrackCaloriesScreen.tsx:5249 |
| recipe.recommendation.generate | paid | partial | POST /api/ai-meal-recommendation | native/src/screens/TrackCaloriesScreen.tsx:5277 |
| recipe.recommendation.log | write | partial | host addRecommendedToDiary -> food-log | native/src/screens/TrackCaloriesScreen.tsx:5311 |
| recipe.recommendation.save_library | write | partial | host saveRecommendedToFavorites | native/src/screens/TrackCaloriesScreen.tsx:5381 |
| recipe.recommendation.dismiss | write | missing | DELETE /api/ai-meal-recommendation | native/src/screens/TrackCaloriesScreen.tsx:5363 |
| food.size_units | read | missing | GET /api/food-data/size-units | native/src/screens/AddIngredientScreen.tsx:1162 |
| food.ingredient.log | write | existing | POST /api/food-log | native/src/screens/AddIngredientScreen.tsx:1339 |
| food.manual_label.analyze | paid | missing | POST /api/analyze-food manual label facts | native/src/screens/AddIngredientScreen.tsx:1485 |
| water.list | read | existing | GET /api/water-log | native/src/screens/WaterIntakeScreen.tsx:297 |
| water.status | read | existing | GET /api/hydration-goal + water-log | native/src/screens/WaterIntakeScreen.tsx:317 |
| water.create | write | existing | POST /api/water-log | native/src/screens/WaterIntakeScreen.tsx:412 |
| water.drink.create | write | existing | POST /api/water-log + linked POST /api/food-log | native/src/screens/WaterIntakeScreen.tsx:497 |
| water.update | write | existing | PATCH /api/water-log/[id] | native/src/screens/WaterIntakeScreen.tsx:619 |
| water.delete | write | existing | DELETE /api/water-log/[id] | native/src/screens/WaterIntakeScreen.tsx:576 |
| water.goal.set | write | existing | POST /api/hydration-goal | native/src/screens/WaterIntakeScreen.tsx:674 |
| water.goal.reset | write | existing | DELETE /api/hydration-goal | native/src/screens/WaterIntakeScreen.tsx:695 |
| water.view.date | write | missing | host selectedDate | native/src/screens/WaterIntakeScreen.tsx:710 |
| exercise.list | read | missing | GET /api/exercise-entries | native/src/screens/TrackCaloriesScreen.tsx:2882 |
| exercise.types | read | missing | GET /api/exercise-types | native/src/screens/TrackCaloriesScreen.tsx:2849 |
| exercise.preview | read | missing | POST /api/exercise-preview | native/src/screens/TrackCaloriesScreen.tsx:5756 |
| exercise.create | write | existing | POST /api/exercise-entries | native/src/screens/TrackCaloriesScreen.tsx:5830 |
| exercise.update | write | existing | PATCH /api/exercise-entries/[id] | native/src/screens/TrackCaloriesScreen.tsx:5831 |
| exercise.delete | write | existing | DELETE /api/exercise-entries/[id] | native/src/screens/TrackCaloriesScreen.tsx:5869 |
| exercise.device.sync | write | missing | POST /api/exercise/sync | native/src/screens/TrackCaloriesScreen.tsx:5896 |
| exercise.apple_health.import | person | existing | host healthSync.importDate | native/src/screens/TrackCaloriesScreen.tsx:5914 |
| mood.entries.list | read | missing | GET /api/mood/entries date range | native/src/screens/MoodTrackerScreen.tsx:501 |
| mood.context.read | read | missing | GET /api/mood/context | native/src/screens/MoodTrackerScreen.tsx:548 |
| mood.create | write | existing | POST /api/mood/entries | native/src/screens/MoodTrackerScreen.tsx:629 |
| mood.view.range | write | missing | host history date range / chart controls | native/src/screens/MoodTrackerScreen.tsx:501 |
| journal.mood.list | read | missing | GET /api/mood/journal/entries q/limit | native/src/screens/MoodTrackerScreen.tsx:570 |
| journal.mood.create | write | partial | POST /api/mood/journal/entries | native/src/screens/MoodTrackerScreen.tsx:1268 |
| journal.mood.update | write | partial | PUT /api/mood/journal/entries/[id] | native/src/screens/MoodTrackerScreen.tsx:1267 |
| journal.mood.delete | write | existing | DELETE /api/mood/journal/entries/[id] | native/src/screens/MoodTrackerScreen.tsx:1343 |
| journal.mood.select_image | person | missing | native image selection / POST /api/mood/journal/upload | native/src/screens/MoodTrackerScreen.tsx:999 |
| journal.mood.upload_image | write | missing | POST /api/mood/journal/upload | native/src/screens/MoodTrackerScreen.tsx:1005 |
| journal.mood.record_audio | person | missing | native microphone permission/recording | native/src/screens/MoodTrackerScreen.tsx:1054 |
| journal.mood.upload_audio | write | missing | POST /api/mood/journal/upload-audio | native/src/screens/MoodTrackerScreen.tsx:1060 |
| journal.mood.tags | write | partial | host handleAddJournalTag / journal save | native/src/screens/MoodTrackerScreen.tsx:1231 |
| journal.health.list | read | missing | GET /api/health-journal date | native/src/screens/HealthJournalScreen.tsx:164 |
| journal.health.create | write | existing | POST /api/health-journal | native/src/screens/HealthJournalScreen.tsx:385 |
| journal.health.update | write | existing | PATCH /api/health-journal/[id] | native/src/screens/HealthJournalScreen.tsx:410 |
| journal.health.delete | write | existing | DELETE /api/health-journal/[id] | native/src/screens/HealthJournalScreen.tsx:434 |
| journal.health.media.select | person | missing | native picker/recording -> extract-media | native/src/screens/HealthJournalScreen.tsx:211 |
| journal.health.extract_media | paid | missing | POST /api/health-journal/extract-media | native/src/screens/HealthJournalScreen.tsx:211 |
| journal.health.view.date | write | missing | host selectedDate | native/src/screens/HealthJournalScreen.tsx:164 |
| symptoms.history.list | read | partial | GET /api/symptoms/history | native/src/screens/SymptomNotesScreen.tsx:179 |
| symptoms.analyze | paid | partial | POST /api/analyze-symptoms | native/src/screens/SymptomNotesScreen.tsx:254 |
| symptoms.follow_up | paid | partial | POST /api/analyze-symptoms/chat | native/src/screens/SymptomNotesScreen.tsx:283 |
| symptoms.history.delete | write | existing | DELETE /api/symptoms/history/[id] | native/src/screens/SymptomNotesScreen.tsx:321 |
| health_image.history.list | read | missing | GET /api/medical-images/history | native/src/screens/HealthImageNotesScreen.tsx:151 |
| health_image.select | person | missing | native camera/library -> actual image payload | native/src/screens/HealthImageNotesScreen.tsx:283 |
| health_image.analyze | paid | missing | POST /api/test-vision saveToHistory:false | native/src/screens/HealthImageNotesScreen.tsx:283 |
| health_image.follow_up | paid | missing | POST /api/medical-images/chat | native/src/screens/HealthImageNotesScreen.tsx:313 |
| health_image.save | write | missing | POST /api/medical-images/history multipart image+analysis | native/src/screens/HealthImageNotesScreen.tsx:346 |
| health_image.delete | write | existing | DELETE /api/medical-images/history/[id] | native/src/screens/HealthImageNotesScreen.tsx:380 |
| checkin.today | read | missing | GET /api/checkins/today localDate | native/src/screens/DailyCheckInScreen.tsx:164 |
| checkin.history | read | missing | GET /api/checkins/history | native/src/screens/DailyCheckInScreen.tsx:213 |
| checkin.rating.set | write | existing | POST /api/checkins/today | native/src/screens/DailyCheckInScreen.tsx:287 |
| checkin.rating.update | write | existing | PATCH /api/checkins/ratings | native/src/screens/DailyCheckInScreen.tsx:479 |
| checkin.rating.delete | write | existing | DELETE /api/checkins/ratings | native/src/screens/DailyCheckInScreen.tsx:455 |
| checkin.history.delete | write | existing | POST /api/checkins/ratings action=delete-by-issues; reviewed bounded IDs in voice adapter | native/src/screens/DailyCheckInScreen.tsx:517 |
| checkin.view.date | write | missing | host date range/selectedDate | native/src/screens/DailyCheckInScreen.tsx:455 |
| coach.today | read | partial | GET /api/health-tips/today | native/src/screens/SmartHealthCoachScreen.tsx:382 |
| coach.history | read | missing | GET /api/health-tips/history | native/src/screens/SmartHealthCoachScreen.tsx:399 |
| coach.preferences.read | read | missing | GET /api/health-tips/settings | native/src/screens/SmartHealthCoachScreen.tsx:435 |
| coach.preferences.update | write | existing | POST /api/health-tips/settings | native/src/screens/SmartHealthCoachScreen.tsx:521 |
| coach.enable | person | partial | normal enable pricing modal + settings POST | native/src/screens/SmartHealthCoachScreen.tsx:667 |
| coach.tip.dismiss | write | missing | host handleClearTip + local dismissed IDs | native/src/screens/SmartHealthCoachScreen.tsx:588 |
| coach.history.delete | write | existing | DELETE /api/health-tips/history | native/src/screens/SmartHealthCoachScreen.tsx:625 |
| reports.status | read | existing | GET /api/reports/weekly/status?voiceReadOnly=1 | native/src/screens/InsightsScreen.tsx:683 |
| reports.list | read | existing | GET /api/reports/weekly/list | native/src/screens/InsightsScreen.tsx:684 |
| reports.weekly.read | read | existing | GET /api/reports/weekly/list exact saved content | native/src/screens/InsightsScreen.tsx:878 |
| reports.weekly.request | paid | existing | POST /api/reports/weekly/run | native/src/screens/InsightsScreen.tsx:836 |
| reports.weekly.preferences | write | existing | POST /api/reports/weekly/preferences | native/src/screens/InsightsScreen.tsx:812 |
| reports.weekly.view | write | partial | POST /api/reports/weekly/notify | native/src/screens/InsightsScreen.tsx:878 |
| reports.weekly.pdf | person | existing | POST /api/reports/weekly/pdf + native viewer | native/src/screens/InsightsScreen.tsx:899 |
| reports.weekly.chat_activity | read | missing | GET /api/reports/weekly/chat-activity | native/src/screens/InsightsScreen.tsx:628 |
| insights.issues.list | read | missing | GET /api/insights/issues | native/src/screens/InsightsScreen.tsx:685 |
| insights.report.select | write | missing | host selectedReport + notify | native/src/screens/InsightsScreen.tsx:878 |
| insights.issue.overview | read | missing | host exact issue passed by Insights | native/src/screens/InsightIssueScreen.tsx:74 |
| insights.issue.section | paid | missing | GET /api/insights/issues/[slug]/sections/[section] | native/src/screens/InsightIssueScreen.tsx:88 |
| insights.issue.section.select | write | missing | host setSection(overview/supplements/medications/labs/nutrition) | native/src/screens/InsightIssueScreen.tsx:131 |
| profile.read | read | missing | GET /api/user-data?scope=health-setup | native/src/screens/ProfileScreen.tsx:132 |
| profile.update | write | existing | POST /api/user-data profileInfo | native/src/screens/ProfileScreen.tsx:177 |
| profile.photo.read | read | missing | GET /api/user-data?scope=health-setup | native/src/screens/ProfilePhotoScreen.tsx:28 |
| profile.photo.select | person | missing | ImagePicker library permission/selection | native/src/screens/ProfilePhotoScreen.tsx:97 |
| profile.photo.capture | person | missing | ImagePicker camera permission/capture | native/src/screens/ProfilePhotoScreen.tsx:119 |
| profile.photo.upload | write | missing | POST /api/upload-profile-image | native/src/screens/ProfilePhotoScreen.tsx:75 |
| profile.photo.remove | write | missing | DELETE /api/upload-profile-image | native/src/screens/ProfilePhotoScreen.tsx:150 |
| settings.local.read | read | existing | AsyncStorage existing local keys | native/src/screens/SettingsScreen.tsx:120 |
| settings.appearance.update | write | existing | AsyncStorage darkMode + Appearance | native/src/screens/SettingsScreen.tsx:153 |
| settings.haptics.update | write | existing | AsyncStorage hapticsEnabled | native/src/screens/SettingsScreen.tsx:158 |
| settings.visibility.update | write | existing | AsyncStorage profileVisibility | native/src/screens/SettingsScreen.tsx:163 |
| settings.analytics.update | write | existing | AsyncStorage dataAnalytics | native/src/screens/SettingsScreen.tsx:168 |
| settings.ai_consent | person | missing | normal AI help permission switch/consent flow | native/src/screens/SettingsScreen.tsx:404 |
| account.health_summary.export | person | missing | GET /api/export/pdf web-session-only | native/src/screens/SettingsScreen.tsx:464 |
| account.sign_out | person | missing | useAppMode.signOut normal confirm | native/src/screens/SettingsScreen.tsx:229 |
| food.settings.read | read | missing | GET /api/user-data healthCheckSettings | native/src/screens/FoodDiarySettingsScreen.tsx:167 |
| food.settings.update | write | partial | POST /api/user-data healthCheckSettings | native/src/screens/FoodDiarySettingsScreen.tsx:212 |
| account.local.read | read | missing | AsyncStorage helfi_native_account_settings_v1 | native/src/screens/AccountSettingsScreen.tsx:153 |
| account.local.update | write | missing | AsyncStorage helfi_native_account_settings_v1 | native/src/screens/AccountSettingsScreen.tsx:132 |
| account.password.change | person | missing | POST /api/account/change-password current+new password | native/src/screens/AccountSettingsScreen.tsx:219 |
| account.delete | person | missing | POST /api/account/delete exact DELETE confirmation | native/src/screens/AccountSettingsScreen.tsx:252 |
| reminders.checkin.read | read | missing | GET /api/checkins/settings | native/src/screens/RemindersScreen.tsx:369 |
| reminders.checkin.update | write | existing | POST /api/checkins/settings | native/src/screens/RemindersScreen.tsx:436 |
| reminders.mood.read | read | missing | GET /api/mood/reminders | native/src/screens/RemindersScreen.tsx:370 |
| reminders.mood.update | write | existing | POST /api/mood/reminders | native/src/screens/RemindersScreen.tsx:485 |
| reminders.push.permission | person | missing | OS notification request + normal native push registration | native/src/screens/RemindersScreen.tsx:589 |
| reminders.timezone.select | write | existing | normal timezone selection saved with reminder settings | native/src/screens/RemindersScreen.tsx:646 |
| notifications.quiet_hours.read | read | missing | GET /api/notifications/quiet-hours | native/src/screens/NotificationsQuietHoursScreen.tsx:120 |
| notifications.quiet_hours.update | write | existing | POST /api/notifications/quiet-hours | native/src/screens/NotificationsQuietHoursScreen.tsx:182 |
| notifications.list | read | missing | GET /api/notifications/inbox | native/src/screens/NotificationInboxScreen.tsx:123 |
| notifications.mark_read | write | existing | POST /api/notifications/inbox | native/src/screens/NotificationInboxScreen.tsx:162 |
| notifications.delete | write | existing | POST /api/notifications/inbox action=delete_selected | native/src/screens/NotificationInboxScreen.tsx:181 |
| notifications.mark_all_visible_read | write | existing | POST /api/notifications/inbox reviewed visible IDs | native/src/screens/NotificationInboxScreen.tsx:422 |
| notifications.delete_all_visible | write | existing | POST /api/notifications/inbox action=delete_all reviewed visible IDs | native/src/screens/NotificationInboxScreen.tsx:417 |
| notifications.open | person | missing | normal handleOpen target route / URL | native/src/screens/NotificationInboxScreen.tsx:515 |
| notifications.selection | write | missing | host selectedIds / handleSelectAll | native/src/screens/NotificationInboxScreen.tsx:405 |
| credit.balance | read | existing | GET /api/credit/status | native/src/screens/BillingScreen.tsx:274 |
| billing.subscription.read | read | missing | GET /api/billing/subscription | native/src/screens/BillingScreen.tsx:299 |
| billing.history | read | missing | GET /api/native-billing/history | native/src/screens/BillingScreen.tsx:320 |
| billing.catalog | read | missing | GET /api/native-billing/catalog + native store catalog | native/src/screens/BillingScreen.tsx:338 |
| billing.feature_usage | read | missing | GET /api/credit/feature-usage-stats | native/src/screens/BillingScreen.tsx:406 |
| billing.manage | person | missing | native subscription store UI or POST /api/billing/portal | native/src/screens/BillingScreen.tsx:462 |
| billing.plan.change | person | missing | store flow or POST /api/billing/subscription | native/src/screens/BillingScreen.tsx:507 |
| billing.subscription.cancel | person | missing | store flow or POST /api/billing/subscription action=cancel | native/src/screens/BillingScreen.tsx:582 |
| billing.restore | person | missing | normal restore native purchases + server verify | native/src/screens/BillingScreen.tsx:606 |
| billing.purchase | person | missing | normal native store purchase sheet | native/src/screens/BillingScreen.tsx:447 |
| devices.status | read | existing | GET /api/fitbit/status + /api/garmin/status?voiceReadOnly=1 | native/src/screens/DevicesScreen.tsx:186 |
| devices.fitbit.connect | person | missing | POST /api/native-device-oauth-ticket -> /api/auth/fitbit/authorize | native/src/screens/DevicesScreen.tsx:276 |
| devices.garmin.connect | person | missing | POST /api/native-device-oauth-ticket -> /api/auth/garmin/authorize | native/src/screens/DevicesScreen.tsx:276 |
| devices.fitbit.disconnect | write | missing | DELETE /api/fitbit/status | native/src/screens/DevicesScreen.tsx:306 |
| devices.garmin.disconnect | write | missing | DELETE /api/garmin/status | native/src/screens/DevicesScreen.tsx:306 |
| devices.interest.update | write | existing | POST /api/user-data deviceInterest googleFit/oura/polar | native/src/screens/DevicesScreen.tsx:332 |
| apple_health.import | person | existing | healthSync normal OS permission/disclosure + import | native/src/screens/DevicesScreen.tsx:386 |
| apple_health.source.select | person | existing | healthSync source picker + exact selection | native/src/screens/DevicesScreen.tsx:386 |
| apple_health.automatic.update | write | existing | healthSync.setEnabled | native/src/screens/DevicesScreen.tsx:386 |
| devices.huawei.interest.update | write | missing | POST /api/user-data deviceInterest.huawei | native/src/screens/DashboardScreen.tsx:988 |
| dashboard.summary.read | read | partial | credit/status, native-auth/me, health-setup-status, user-data | native/src/screens/DashboardScreen.tsx:121 |
| support.list | read | existing | GET /api/support/tickets?list=1&activeOnly=0 | native/src/screens/SupportScreen.tsx:289 |
| support.read | read | existing | GET /api/support/tickets ticketId | native/src/screens/SupportScreen.tsx:274 |
| support.create | write | existing | POST /api/support/tickets | native/src/screens/SupportScreen.tsx:485 |
| support.reply | write | existing | POST /api/support/tickets | native/src/screens/SupportScreen.tsx:506 |
| support.end_chat | write | existing | POST /api/support/tickets | native/src/screens/SupportScreen.tsx:524 |
| support.delete | write | existing | POST /api/support/tickets | native/src/screens/SupportScreen.tsx:576 |
| support.feedback | write | existing | POST /api/support/tickets | native/src/screens/SupportScreen.tsx:624 |
| support.attachment.select | person | missing | native attachment picker | native/src/screens/SupportScreen.tsx:433 |
| support.attachment.upload | write | missing | POST /api/support/uploads | native/src/screens/SupportScreen.tsx:433 |
| support.attachment.open | person | missing | Linking.openURL existing attachment URL | native/src/screens/SupportScreen.tsx:745 |
| practitioners.categories | read | missing | GET /api/practitioners/categories | native/src/screens/PractitionerDirectoryScreen.tsx:570 |
| practitioners.search | read | missing | GET /api/practitioners/search query/category/radius/telehealth/lat/lng | native/src/screens/PractitionerDirectoryScreen.tsx:633 |
| practitioners.geocode | read | missing | GET /api/practitioners/geocode | native/src/screens/PractitionerDirectoryScreen.tsx:661 |
| practitioners.location.current | person | missing | normal geolocation permission -> reverse-geocode | native/src/screens/PractitionerDirectoryScreen.tsx:685 |
| practitioners.search.filters | write | missing | host category/radius/telehealth/location/search controls | native/src/screens/PractitionerDirectoryScreen.tsx:633 |
| practitioners.categories.az | read | missing | GET /api/practitioners/a-z | native/src/screens/PractitionerAZScreen.tsx:29 |
| practitioners.detail | read | missing | GET /api/practitioners/[slug] | native/src/screens/PractitionerProfileScreen.tsx:94 |
| practitioners.contact | person | missing | normal contact-click + phone/email/website/map OS action | native/src/screens/PractitionerProfileScreen.tsx:59 |
| affiliate.application.read | read | missing | GET /api/affiliate/application | app/affiliate/apply/page.tsx:29 |
| affiliate.application.submit | person | missing | POST /api/affiliate/apply + actual application/terms confirmation | app/affiliate/apply/page.tsx:51 |
| affiliate.account.read | read | missing | GET /api/affiliate/me | app/affiliate/page.tsx:76 |
| affiliate.payout.onboard | person | missing | POST /api/affiliate/connect/onboard external onboarding | app/affiliate/page.tsx:92 |
| affiliate.referral.copy | write | missing | host referral URL copy control | app/affiliate/page.tsx:177 |
| affiliate.referral.open | person | missing | normal open fullReferralUrl | app/affiliate/page.tsx:180 |
| practice.dashboard | read | missing | GET /api/practitioner/dashboard | app/practitioner/page.tsx:159 |
| practice.listing.read | read | missing | GET /api/practitioner/listings/[id] | app/practitioner/page.tsx:164 |
| practice.stats | read | missing | GET /api/practitioner/stats | app/practitioner/page.tsx:316 |
| practice.notifications.read | read | missing | GET /api/practitioner/notifications | app/practitioner/page.tsx:331 |
| practice.account.create | write | missing | POST /api/practitioner/account | app/practitioner/page.tsx:356 |
| practice.notifications.update | write | missing | POST /api/practitioner/notifications | app/practitioner/page.tsx:422 |
| practice.contact_summary.test | write | missing | POST /api/practitioner/contact-summary-test | app/practitioner/page.tsx:443 |
| practice.address.search | read | missing | GET /api/practitioner/places/autocomplete | app/practitioner/page.tsx:292 |
| practice.address.detail | read | missing | GET /api/practitioner/places/details | app/practitioner/page.tsx:214 |
| practice.location.current | person | missing | normal browser geolocation permission | app/practitioner/page.tsx:679 |
| practice.listing.create | write | missing | POST /api/practitioner/listings | app/practitioner/page.tsx:496 |
| practice.listing.update | write | missing | PUT /api/practitioner/listings/[id] | app/practitioner/page.tsx:496 |
| practice.listing.submit | write | missing | POST /api/practitioner/listings/[id]/submit | app/practitioner/page.tsx:528 |
| practice.subscription.start | person | missing | POST /api/practitioner/subscription/checkout | app/practitioner/page.tsx:545 |
| practice.subscription.manage | person | missing | POST /api/practitioner/subscription/portal | app/practitioner/page.tsx:557 |
| practice.trial.claim | write | missing | POST /api/practitioner/subscription/winback | app/practitioner/page.tsx:571 |
| practice.boost.purchase | person | missing | POST /api/practitioner/boost/checkout | app/practitioner/page.tsx:586 |
| practice.logo.upload | person | missing | normal file input + POST /api/practitioner/uploads | app/practitioner/page.tsx:612 |
| practice.gallery.upload | person | missing | normal file input + POST /api/practitioner/uploads | app/practitioner/page.tsx:629 |
| practice.account.delete | person | missing | POST /api/practitioner/account/delete exact normal confirmation | app/practitioner/page.tsx:664 |
| health_setup.read | read | missing | GET /api/user-data?scope=health-setup | app/onboarding/page.tsx:9951 |
| health_setup.profile.update | write | existing | POST /api/user-data | app/onboarding/page.tsx:2256 |
| health_setup.goals.update | write | existing | POST /api/user-data goals/targets | app/onboarding/page.tsx:2390 |
| health_setup.body.update | write | existing | POST /api/user-data body/activity | app/onboarding/page.tsx:2554 |
| health_setup.allergies.update | write | existing | POST /api/user-data | app/onboarding/page.tsx:2636 |
| health_setup.diet.update | write | existing | POST /api/user-data | app/onboarding/page.tsx:3594 |
| health_setup.lifestyle.update | write | existing | POST /api/user-data | app/onboarding/page.tsx:3945 |
| health_setup.issues.update | write | partial | POST /api/user-data + POST /api/checkins/issues | app/onboarding/page.tsx:4492 |
| health_setup.situations.update | write | existing | POST /api/user-data | app/onboarding/page.tsx:4955 |
| health_setup.supplement.search | read | missing | GET /api/supplement-catalog-search; /supplement-search | app/onboarding/page.tsx:5242 |
| health_setup.supplement.add | write | existing | POST /api/user-data supplements | app/onboarding/page.tsx:5669 |
| health_setup.supplement.update | write | existing | POST /api/user-data supplements | app/onboarding/page.tsx:5781 |
| health_setup.supplement.delete | write | existing | POST /api/user-data supplements | app/onboarding/page.tsx:5781 |
| health_setup.supplement.photo | paid | missing | POST /api/upload-supplement-image + /api/analyze-supplement-image | app/onboarding/page.tsx:5563 |
| health_setup.medication.search | read | missing | GET /api/medication-catalog-search; /medication-search | app/onboarding/page.tsx:6690 |
| health_setup.medication.add | write | existing | POST /api/user-data medications | app/onboarding/page.tsx:7042 |
| health_setup.medication.update | write | existing | POST /api/user-data medications | app/onboarding/page.tsx:7153 |
| health_setup.medication.delete | write | existing | POST /api/user-data medications | app/onboarding/page.tsx:7153 |
| health_setup.medication.photo | paid | missing | POST /api/upload-medication-image | app/onboarding/page.tsx:6972 |
| health_setup.reports.list | read | existing | GET /api/reports/list | app/onboarding/page.tsx:7964 |
| health_setup.reports.select | write | missing | POST /api/user-data bloodResults reportIds | app/onboarding/page.tsx:8019 |
| health_setup.reports.delete | write | missing | DELETE /api/reports/[id] | app/onboarding/page.tsx:8110 |
| health_setup.interactions.analyze | paid | missing | POST /api/analyze-interactions | app/onboarding/page.tsx:8674 |
| health_setup.interactions.history | read | missing | GET /api/interaction-history | app/onboarding/page.tsx:8608 |
| health_setup.interactions.delete | write | missing | DELETE /api/interaction-history/[id] | app/onboarding/page.tsx:8813 |
| health_setup.insights.update | paid | missing | POST /api/insights/regenerate-targeted | app/onboarding/page.tsx:920 |
| health_setup.terms.accept | person | missing | normal terms checkbox / explicit confirmation | app/onboarding/page.tsx:1168 |
| health_setup.apple.link | person | missing | GET /api/auth/apple/link/authorize OAuth | app/onboarding/page.tsx:9534 |
| lab_report.file.select | person | missing | normal file input | components/reports/LabReportUpload.tsx:22 |
| lab_report.consent | person | missing | normal health-data processing consent | components/reports/LabReportUpload.tsx:60 |
| lab_report.upload | write | missing | POST /api/reports/presign + POST /api/reports/[id]/upload | components/reports/LabReportUpload.tsx:169 |
| lab_report.process | paid | missing | POST /api/reports/[id]/process | components/reports/LabReportUpload.tsx:210 |
| chat.history.list | read | missing | GET /api/chat/threads | components/VoiceChat.tsx:1173, native/src/screens/InsightsScreen.tsx:922 |
| chat.history.read | read | missing | GET /api/chat/voice?threadId | components/VoiceChat.tsx:1193, native/src/screens/InsightsScreen.tsx:922 |
| chat.history.create | write | missing | POST /api/chat/threads | components/VoiceChat.tsx:1431, native/src/screens/InsightsScreen.tsx:922 |
| chat.history.rename | write | existing | PATCH /api/chat/threads | components/VoiceChat.tsx:1491, native/src/screens/InsightsScreen.tsx:922 |
| chat.history.delete | write | existing | DELETE /api/chat/threads | components/VoiceChat.tsx:1459, native/src/screens/InsightsScreen.tsx:922 |
| chat.history.delete_selected | write | partial | DELETE /api/chat/threads per exact selected thread | components/VoiceChat.tsx:1104, native/src/screens/InsightsScreen.tsx:922 |
| chat.history.archive | write | missing | localStorage archivedKey | components/VoiceChat.tsx:1542, native/src/screens/InsightsScreen.tsx:922 |
| chat.history.archive_selected | write | missing | localStorage archivedKey | components/VoiceChat.tsx:1089, native/src/screens/InsightsScreen.tsx:922 |
| chat.history.unarchive | write | missing | localStorage archivedKey | components/VoiceChat.tsx:1542, native/src/screens/InsightsScreen.tsx:922 |
| navigation.open.Profile | person | partial | normal navigate(Profile) | native/src/navigation/MainNavigator.tsx:344 |
| navigation.open.AccountSettings | person | partial | normal navigate(AccountSettings) | native/src/navigation/MainNavigator.tsx:345 |
| navigation.open.ProfilePhoto | person | partial | normal navigate(ProfilePhoto) | native/src/navigation/MainNavigator.tsx:350 |
| navigation.open.Billing | person | partial | normal navigate(Billing) | native/src/navigation/MainNavigator.tsx:355 |
| navigation.open.Devices | person | partial | normal navigate(Devices) | native/src/navigation/MainNavigator.tsx:364 |
| navigation.open.Help | person | partial | normal navigate(Help) | native/src/navigation/MainNavigator.tsx:373 |
| navigation.open.HealthJournal | person | partial | normal navigate(HealthJournal) | native/src/navigation/MainNavigator.tsx:382 |
| navigation.open.SymptomNotes | person | partial | normal navigate(SymptomNotes) | native/src/navigation/MainNavigator.tsx:391 |
| navigation.open.HealthImageNotes | person | partial | normal navigate(HealthImageNotes) | native/src/navigation/MainNavigator.tsx:400 |
| navigation.open.Notifications | person | partial | normal navigate(Notifications) | native/src/navigation/MainNavigator.tsx:409 |
| navigation.open.NotificationsInbox | person | partial | normal navigate(NotificationsInbox) | native/src/navigation/MainNavigator.tsx:419 |
| navigation.open.NotificationsAIInsights | person | partial | normal navigate(NotificationsAIInsights) | native/src/navigation/MainNavigator.tsx:428 |
| navigation.open.SmartHealthCoach | person | partial | normal navigate(SmartHealthCoach) | native/src/navigation/MainNavigator.tsx:437 |
| navigation.open.NotificationsQuietHours | person | partial | normal navigate(NotificationsQuietHours) | native/src/navigation/MainNavigator.tsx:446 |
| navigation.open.NotificationsAccountSecurity | person | partial | normal navigate(NotificationsAccountSecurity) | native/src/navigation/MainNavigator.tsx:455 |
| navigation.open.PrivacySettings | person | partial | normal navigate(PrivacySettings) | native/src/navigation/MainNavigator.tsx:464 |
| navigation.open.Support | person | partial | normal navigate(Support) | native/src/navigation/MainNavigator.tsx:473 |
| navigation.open.HealthSetup | person | partial | normal navigate(HealthSetup) | native/src/navigation/MainNavigator.tsx:482 |
| navigation.open.Reminders | person | partial | normal navigate(Reminders) | native/src/navigation/MainNavigator.tsx:483 |
| navigation.open.DailyCheckIn | person | partial | normal navigate(DailyCheckIn) | native/src/navigation/MainNavigator.tsx:493 |
| navigation.open.MoodTracker | person | partial | normal navigate(MoodTracker) | native/src/navigation/MainNavigator.tsx:494 |
| navigation.open.TrackCalories | person | partial | normal navigate(TrackCalories) | native/src/navigation/MainNavigator.tsx:495 |
| navigation.open.AddIngredient | person | partial | normal navigate(AddIngredient) | native/src/navigation/MainNavigator.tsx:504 |
| navigation.open.FoodAnalysis | person | partial | normal navigate(FoodAnalysis) | native/src/navigation/MainNavigator.tsx:511 |
| navigation.open.WaterIntake | person | partial | normal navigate(WaterIntake) | native/src/navigation/MainNavigator.tsx:520 |
| navigation.open.FoodDiarySettings | person | partial | normal navigate(FoodDiarySettings) | native/src/navigation/MainNavigator.tsx:529 |
| navigation.open.Login | person | partial | normal navigate(Login) | native/src/navigation/MainNavigator.tsx:538 |
| navigation.open.Signup | person | partial | normal navigate(Signup) | native/src/navigation/MainNavigator.tsx:545 |
| navigation.open.Terms | person | partial | normal navigate(Terms) | native/src/navigation/MainNavigator.tsx:552 |
| navigation.open.Privacy | person | partial | normal navigate(Privacy) | native/src/navigation/MainNavigator.tsx:559 |
| navigation.open.Practitioners | person | partial | normal navigate(Practitioners) | native/src/navigation/MainNavigator.tsx:566 |
| navigation.open.PractitionerAZ | person | partial | normal navigate(PractitionerAZ) | native/src/navigation/MainNavigator.tsx:575 |
| navigation.open.PractitionerProfile | person | partial | normal navigate(PractitionerProfile) | native/src/navigation/MainNavigator.tsx:584 |
| navigation.open.ListYourPractice | person | partial | normal navigate(ListYourPractice) | native/src/navigation/MainNavigator.tsx:593 |
| navigation.open.ListYourPracticeStart | person | partial | normal navigate(ListYourPracticeStart) | native/src/navigation/MainNavigator.tsx:602 |
| navigation.open.InsightIssue | person | partial | normal navigate(InsightIssue) | native/src/navigation/MainNavigator.tsx:611 |
| navigation.open.NativeWebTool | person | partial | normal navigate(NativeWebTool) | native/src/navigation/MainNavigator.tsx:616 |
| navigation.open.Dashboard | person | partial | normal tab navigate(Dashboard) | native/src/navigation/MainTabs.tsx:119 |
| navigation.open.Insights | person | partial | normal tab navigate(Insights) | native/src/navigation/MainTabs.tsx:127 |
| navigation.open.Food | person | partial | normal tab navigate(Food) | native/src/navigation/MainTabs.tsx:134 |
| navigation.open.More | person | partial | normal tab navigate(More) | native/src/navigation/MainTabs.tsx:143 |
| navigation.open.Settings | person | partial | normal tab navigate(Settings) | native/src/navigation/MainTabs.tsx:150 |
| content.faq | read | missing | NativeWebTool /faq | native/src/screens/HelpScreen.tsx:101 |
| content.terms | read | missing | native static Terms | native/src/screens/TermsScreen.tsx:1 |
| content.privacy | read | missing | native static Privacy | native/src/screens/PrivacyScreen.tsx:1 |
| content.help | read | missing | native support/FAQ/affiliate gateway menu | native/src/screens/HelpScreen.tsx:94 |
| content.more | read | missing | native actual health/account menu | native/src/screens/MoreScreen.tsx:91 |
| content.notifications_security | read | missing | static always-on switches; no mutation available | native/src/screens/NotificationsAccountSecurityScreen.tsx:1 |
| food.diary.move | write | partial | host moveEntryToMeal -> POST /api/food-log then delete original | native/src/screens/TrackCaloriesScreen.tsx:3481 |
| checkin.history.delete_all | write | existing | POST /api/checkins/ratings action=delete-all; reviewed bounded IDs in voice adapter | native/src/screens/DailyCheckInScreen.tsx:540 |
| auth.sign_in | person | missing | POST /api/native-auth/login + normal session signIn | native/src/screens/LoginScreen.tsx:46 |
| auth.apple.sign_in | person | missing | normal runNativeAppleAuth(signin) | native/src/screens/LoginScreen.tsx:119 |
| auth.password.reset | person | missing | normal password-reset web flow | native/src/screens/LoginScreen.tsx:100 |
| auth.sign_up | person | missing | POST /api/auth/signup + normal login | native/src/screens/SignupScreen.tsx:50 |
| auth.apple.sign_up | person | missing | normal runNativeAppleAuth(signup) | native/src/screens/SignupScreen.tsx:102 |
| auth.terms.accept | person | missing | normal acceptTerms checkbox / actual owner acceptance | native/src/screens/SignupScreen.tsx:269 |


## Authorized CORE source reconciliation — 17 October 2026

The original321 operation IDs,279 domain operations,42 navigation entries, readiness classifications and kind counts remain unchanged. This records an authorized offline source review, not installed parity or production completion. Production general-assistant mappings remain0.

The parent confirmed the194 manual-source files frozen for this reconciliation. Exactly24 hashes changed and170 remained identical. The machine-readable `sourceReconciliations` ledger preserves every prior SHA-256, replacement SHA-256 and concrete reason; it does not erase the original evidence. Sixty-six source-line references were updated:62 map to the same byte-identical source lines in original audit-matching HEAD files, and4 explicitly reviewed Profile/Water fetch anchors now point at their guarded/serialized equivalents. No operation was added, removed or promoted.

| Reviewed file | Authorized source change |
|---|---|
| `app/api/checkins/history/route.ts` | Opt-in voiceReadOnly GET skips schema creation and returns its explicit read-only marker; ordinary history behavior remains. |
| `app/api/checkins/settings/route.ts` | Opt-in voiceReadOnly GET reads saved check-in settings without schema/default writes and marks the result; ordinary settings behavior remains. |
| `app/api/checkins/today/route.ts` | Opt-in voiceReadOnly GET skips DDL, duplicate cleanup and goal-to-issue synchronization; returns only actual saved issues/ratings with a marker. |
| `app/api/credit/status/route.ts` | Opt-in read-only credit request is explicitly refused before wallet reset or billing side effects; no read-only balance parity is claimed. |
| `app/api/exercise-types/route.ts` | Normal GET accepts existing native authentication, rejects mismatched web/native accounts and supports explicit read-only proof. |
| `app/api/food-log/route.ts` | Opt-in voiceReadOnly GET preserves legacy missing dates instead of writing date repairs and returns a read-only marker; normal default repair behavior is retained. |
| `app/api/health-journal/route.ts` | Opt-in GET skips schema creation; optional normal client action identity derives an owned deterministic entry ID, detects changed content and recovers duplicate inserts without repeating a saved action. |
| `app/api/mood/entries/route.ts` | Opt-in voiceReadOnly GET bypasses schema/legacy cleanup writes and marks actual owned saved mood data. |
| `app/api/mood/journal/entries/route.ts` | Opt-in GET skips schema creation. Optional text-only clientActionId POST adds owner-bound deterministic IDs, exact metadata replay/conflicts and concurrent unique-insert recovery; legacy/manual creation remains random-ID behavior. |
| `app/api/mood/reminders/route.ts` | Opt-in voiceReadOnly GET reads saved reminder settings without DDL/default writes and marks the result; normal reminder mutation behavior remains. |
| `app/api/notifications/inbox/route.ts` | Opt-in GET delegates to the audited read-only inbox service without ensure/repair writes and requires real saved list data. |
| `app/api/notifications/quiet-hours/route.ts` | Opt-in voiceReadOnly GET bypasses table/default creation and marks the actual saved quiet-hours result. |
| `app/api/reports/weekly/list/route.ts` | Opt-in GET uses read-only weekly service options, skips table creation and fails closed on storage errors; no report generation is invoked. |
| `app/api/reports/weekly/status/route.ts` | Opt-in GET uses read-only weekly service options, skips schema/default side effects and fails closed instead of inventing report status. |
| `app/api/user-data/route.ts` | Explicit read-only health-setup/food-library/intake scopes skip country/default/storage repairs and return markers; saved profile display gender is preserved separately from metabolic fields. |
| `app/api/water-log/route.ts` | Opt-in voiceReadOnly GET skips schema/legacy repair/duplicate cleanup writes and returns actual owned hydration rows with a marker. |
| `lib/native-voice-app-reads.ts` | Propagates server-owned read-only opt-in only to audited fixed GET routes and requires their markers; unsupported credit reads fail before wallet work. |
| `lib/native-voice-notification-actions.ts` | For server-owned read-only requests, preparation forwards the fixed opt-in GET and requires its audited marker; mutation contracts remain. |
| `lib/native-voice-preference-actions.ts` | For server-owned read-only requests, setting preparation forwards opt-in fixed GETs, uses audited service paths and requires proof instead of triggering schema/default writes. |
| `lib/native-voice-record-actions.ts` | For server-owned read-only requests, fixed owned record GET construction forwards voiceReadOnly and requires the marker before returning data; existing mutations are retained. |
| `lib/native-voice-symptom-analysis.ts` | Authorized structured registry bridge adds readStructuredVoiceSymptomHistory and prepareStructuredVoiceSymptomAction with trusted local date/time zone, real DST boundaries and no fake utterance. Legacy signatures remain; paid execution assembly stays disabled. |
| `native/src/screens/ProfileScreen.tsx` | Authorized functional refresh adds owner-bound cancellable reads, exact verified profile patch merging, serialized manual/voice saves and narrow stale-save repair. JSX and styling are unchanged. |
| `native/src/screens/TrackCaloriesScreen.tsx` | Moves seven existing pure food-normalization helpers byte-identically into foodDiaryEntries.ts and imports the same implementation for assistant/current-day reads. All JSX and normal helper semantics remain unchanged. |
| `native/src/screens/WaterIntakeScreen.tsx` | Authorized functional refresh adds owner/date-bound cancellable water/goal reads and deduplicated verified completion refresh, preserving actual goal values and manual controls. JSX and styling are unchanged. |

Proof includes actual normal handlers with synthetic auth/storage, read-only guard checks, daily-target/diary compatibility, deterministic journal recovery, normal food preparation/save/readback and mounted Profile/Water refresh fixtures. No real provider, account, key, credit or database was used. Dedicated Dashboard and Insights design files remain unchanged. Newly added registry/runtime/effects/helper files are separately checked by the CORE suites; this194-file manual-source snapshot does not pretend to include them.

`check-voice2-operation-coverage.cjs --allow-gaps` validates offline inventory integrity only. The ordinary strict release command must continue to refuse321 production coverage gaps; neither a hash update nor a passing offline fixture upgrades readiness.

Final integration evidence outside the original194-file manual snapshot: `native/src/voice/VoiceAssistant.tsx`, SHA-256 `75acecfe0fe9c267471594167fd76a528f372f2d88801ba87eceeeb818ee9605`. The original audit did not hash this voice host, so the ledger explicitly records no prior inventory hash. Its final authorized changes use the actual current day plus explicit selected date, validated completion descriptors and a structured-command gate around legacy local conversation deletion. The final9-group actual-source audit passes, including four literal deletion-like journal notes dispatched without clearing conversation history. The parent separately owns the native page-lock snapshot; this evidence does not add a195th manual-source snapshot or promote readiness.
