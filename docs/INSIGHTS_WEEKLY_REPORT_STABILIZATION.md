FILE NOTE:
- Purpose: Lock down a single checklist and gap report for Insights weekly health report behavior to stop regressions.
- Keep after task: Yes.
- Deploy needed: No.
- Remove by: Keep as a permanent team reference until Insights is fully stable.
- Related task: Weekly report creation progress flow and gating behavior.

# Insights Weekly Report Stabilization (Web)

Last updated: Feb 25, 2026

## Why this file exists

Insights weekly report behavior has had repeated regressions.
This file is the single plain-English checklist for what must be true before any Insights report change is accepted.

## Owner-critical expected behavior (source of truth)

For the owner account (`info@sonicweb.com.au`):

1. If report access is active:
- Do NOT show: "Weekly reports are off by default..."
- Show countdown/progress toward next report when due date exists.
- Show report action button (`View report` or `Unlock report`).
- Show `Create report now` test button.

2. If report access is actually off:
- Show "Weekly reports are off by default..." warning.
- Show `Turn on weekly reports` + `Upgrade for reports`.
- Do NOT show `View report` as the primary action in this state.

3. Ready popup/modal:
- Should appear when a new report is ready/locked and not already viewed/dismissed.
- If locked, CTA must go to Billing.

## Audit findings (Feb 25, 2026)

1. Contradictory UI path exists in current `origin/master`:
- Warning can show ("reports off") while `View report` still shows.
- This is caused by split conditions:
  - Warning uses `reportsEnabled`.
  - Action button row uses `canUseReportActions` (`reportsEnabled OR reportReady OR reportLocked`).

2. Regression commit that introduced this mismatch:
- Commit: `d8155c57`
- Changed page-level `reportsEnabled` to strict `Boolean(weeklyState?.reportsEnabled)`.
- Added action-row fallback so report actions can still show when `reportsEnabled` is false.

3. Read-only data check for owner account found missing scheduler state:
- `WeeklyHealthReportState` row was empty for owner account at audit time.
- Latest report records exist and are `READY`, but state row missing means no active next-cycle schedule metadata.

4. Effect of missing state:
- Countdown/progress area disappears (depends on `nextReportDueAt`).
- Test button can disappear (depends on `reportsEnabled`).
- Users can see inconsistent signals in the same card.

## Risk map (where regressions keep happening)

- `app/insights/page.tsx`
- `app/insights/InsightLandingClient.tsx`
- `app/insights/weekly-report/WeeklyReportClient.tsx`
- `app/api/reports/weekly/status/route.ts`
- `app/api/reports/weekly/preferences/route.ts`
- `app/api/reports/weekly/run/route.ts`
- `lib/weekly-health-report.ts`

## Pass/Fail test checklist (must pass before deploy)

Use owner account and run this in order:

1. Open `/insights`:
- Pass: card state is internally consistent (no "off" warning with `View report`).

2. Check countdown:
- Pass: if report system is active, `next report due` and timer/progress are visible.

3. Check owner test button:
- Pass: `Create report now` is visible for owner account when report actions are available.

4. Trigger report creation:
- Pass: clear running/progress message shown.
- Pass: final status is `READY` or `LOCKED` with matching UI.

5. Popup/modal behavior:
- Pass: ready/locked popup appears correctly when eligible.
- Pass: locked popup sends to Billing.

6. Weekly report page (`/insights/weekly-report`):
- Pass: page state matches landing card state (no conflicting on/off messaging).

## Safe next-fix plan (small steps only)

1. Make one single truth for report card state in landing UI:
- warning state and action-button state must use the same condition family.

2. Add state self-heal:
- if scheduler state is missing for a paid active user, recreate state row and next due date.

3. Keep owner test button available in owner test path:
- test button should not disappear because of a stale/missing state row.

4. Add one small automated safety check:
- simple test for the contradiction case: no "off warning" while `View report` is visible.
