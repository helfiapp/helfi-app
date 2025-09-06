# TODO_LIST

Last updated: 2025-08-31

How to use
- Keep this as the single source of truth for what to do next
- Tasks are written in plain English with exactly where the change goes
- This list is ordered from the easiest at the top to the hardest at the bottom

## Ordered Roadmap — Easiest → Hardest


8) Health Tracking — Weekly Summary Panel
- Where: `app/health-tracking/page.tsx` top section
- What: A compact weekly summary (best day, trend arrows) pulled from the same data.
- Why: Adds motivation at a glance.
- Done when:
  - The top of the page shows a 1‑line weekly summary once any data exists

9) Insights — Simple Section Pages
- Where: `app/insights/[name]/page.tsx` (e.g., goals, nutrition, safety)
- What: Dedicated pages listing only that category.
- Why: Easier to focus on one theme.
- Done when:
  - Tapping a tile on Insights opens its category page with a filtered list

10) Admin — Usage & Error Basics
- Where: `app/admin-panel/page.tsx`; APIs already log server events
- What: Show counts (e.g., number of food analyses today, insights generated, report PDFs created) and latest error messages.
- Why: Quick health check for the system without digging into logs.
- Done when:
  - Admin panel shows at least 3 counters and a small error list from recent API calls

11) Insights Feed (Preview → Real)
- Where: `app/insights/page.tsx`; APIs: `app/api/insights/list/route.ts`, `app/api/insights/generate/route.ts`
- What: Keep preview working; add “Pin” and “Dismiss” actions per card and respect them via `InsightsUserState`. When ready, enable real generation by turning on the existing flag.
- Why: Turns static preview into a useful, personalized feed users can manage.
- Done when:
  - Cards render with Pin/Dismiss; state persists and reorders via `InsightsUserState`
  - Refresh updates list immediately and triggers background regenerate
  - Real generation can be enabled by setting `NEXT_PUBLIC_INSIGHTS_ENABLED` to true (no code change needed to flip on later)

12) Health Tracking — Daily Metrics
- Where: `app/health-tracking/page.tsx` → card “Daily Metrics”
- What: Let users log weight, sleep (hours), mood (0–6), and energy (0–6) for today. Save and load using the existing check-ins APIs.
- Why: Baseline daily logging powers trends, insights, and reports.
- Done when:
  - Today’s values show editable controls and Save button
  - Data saves via `POST /api/checkins/today` and loads via `GET /api/checkins/today`
  - A 7‑day mini chart renders for each metric on this page

13) Health Tracking — Vital Signs
- Where: `app/health-tracking/page.tsx` → card “Vital Signs”
- What: Add inputs for heart rate (bpm) and blood pressure (systolic/diastolic) with gentle out‑of‑range flags. Persist via check-ins.
- Why: Safety and trend visibility for key vitals.
- Done when:
  - HR and BP inputs save/load for today via check-ins endpoints
  - If systolic ≥ 140 or diastolic ≥ 90, show a small orange “high” tag; if ≤ 90/60, show a small blue “low” tag
  - 7‑day mini chart appears for HR and BP

14) Symptoms — 7‑step Tracker
- Where: `app/health-tracking/page.tsx` → card “Symptoms”
- What: Let users select a personal list of symptoms to track (e.g., headache, bloating), each rated 0–6 with optional note. Use existing check-ins tables.
- Why: Trends make patterns visible for Insights and Reports.
- Done when:
  - Manage tracked items via `GET/POST /api/checkins/issues`
  - Daily ratings saved via `POST /api/checkins/today` and shown in a 7‑day mini chart

15) Medications — List + Reminders
- Where: `app/health-tracking/page.tsx` → card “Medications”
- What: Show a list of medications with dose and timing; allow add/edit/remove; optionally send reminders using push APIs.
- Why: Adherence tracking and gentle reminders.
- Done when:
  - CRUD works against `POST /api/user-data` (persist in `medications` array)
  - Optional toggle enables reminders; scheduling saved via `POST /api/checkins/settings` and push can be sent via `app/api/push/*` endpoints

16) Weekly Reports — List, Detail, PDF
- Where: `app/reports/page.tsx`; APIs: `app/api/reports/weekly/list/route.ts`, `app/api/export/pdf/route.ts`
- What: From the list, open a simple detail view (new route `app/reports/[id]/page.tsx`) showing that week’s summary; add a “Download PDF” button that calls the PDF export API.
- Why: Gives users a tangible weekly artifact they can save/share.
- Done when:
  - Clicking a report tile opens a detail page with date range and summary
  - “Download PDF” returns a PDF; in-app viewer opens and a file downloads

Notes
- We’ll keep this list short and plain-English
- When we finish an item, we’ll mark it Done here and move on to the next
