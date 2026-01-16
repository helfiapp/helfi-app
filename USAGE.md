# Database Usage Improvements (Jan 16, 2026)

This document records the changes made to reduce unnecessary database calls while preserving cross-device sync.

## Snapshot (Rollback Safety)
- Snapshot path: `/Volumes/U34 Bolt/HELFI APP/helfi-app-backups/db-cost-reduction-20260116-023426`
- Files captured:
  - `components/providers/UserDataProvider.tsx`
  - `components/UsageMeter.tsx`
  - `components/FeatureUsageDisplay.tsx`
  - `app/food/page.tsx`
  - `app/api/credit/feature-usage/route.ts`
  - `app/api/credit/status/route.ts`
  - `app/api/user-data/route.ts`
  - `GUARD_RAILS.md`

## What Was Changed
### 1) User data refresh throttle
File: `components/providers/UserDataProvider.tsx`
- Added staleness checks so `/api/user-data` is not called on every quick tab switch.
- Refresh now happens on focus/visibility only when:
  - The app was hidden for at least 2 minutes, or
  - The last user-data fetch is older than 3 minutes.
- Cached data still loads instantly; background refresh only happens when stale.

### 2) Food Diary resume refresh throttle
File: `app/food/page.tsx`
- Added a minimum "away time" (2 minutes) before refresh-on-resume triggers.
- This reduces frequent refreshes of library, favorites, and device status when switching tabs quickly.

### 3) Credits status refresh throttle
File: `components/UsageMeter.tsx`
- `credits:refresh` events no longer force immediate repeated fetches.
- A minimum 5-second interval is enforced before a forced refresh runs.
- Normal cache TTL remains 60 seconds.

### 4) Feature usage refresh throttle
File: `components/FeatureUsageDisplay.tsx`
- Cache TTL increased from 2s to 30s.
- `credits:refresh` forced refresh is throttled to once per 5 seconds.

## Sync Behavior (What Still Works)
- Health Setup cross-device polling remains unchanged (12-second poll on `/onboarding`).
- General user data still refreshes on resume if stale (so devices sync on return).
- Food Diary still refreshes on manual action; resume refresh happens after a short away time.

## How To Test (Future Verification)
1) Quick tab switch:
   - Open any page, switch tabs and back within 1 minute.
   - Expect: no `/api/user-data` fetch (check Network tab).
2) Resume after time away:
   - Leave the tab for >2 minutes, then return.
   - Expect: `/api/user-data` fetch runs and data syncs.
3) Cross-device sync (general profile data):
   - Device A: change profile field.
   - Device B: wait >2 minutes, return to app or refresh.
   - Expect: data matches Device A.
4) Credits update after AI use:
   - Run any AI feature.
   - Expect: credits widget updates within 5 seconds.
5) Feature usage text:
   - Run one analysis.
   - Expect: "This AI feature has been used..." updates within 5-30 seconds.
6) Food Diary resume refresh:
   - Leave Food Diary for >2 minutes, return.
   - Expect: library/favorites refresh runs once.

## Rollback (If Needed)
- Copy the snapshot versions of the files above back into the repo.
- Re-run the app and verify the old behavior is restored.
