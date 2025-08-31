# TODO_LIST

Last updated: 2025-08-31

How to use
- Keep this as the single source of truth for what to do next
- Tasks are written in plain English with exactly where the change goes
- We’ll work from the hardest items first, down to simpler polish

## Priority 1 — AI Health Insights MVP (most difficult first)

1) Health Tracking — Daily Metrics
- Where: `app/health-tracking/page.tsx` → card “Daily Metrics”
- What: Let users log weight, sleep (hours), mood (0–6), and energy (0–6) for today. Save and load using the existing check-ins APIs.
- Why: Baseline daily logging powers trends, insights, and reports.
- Done when:
  - Today’s values show editable controls and Save button
  - Data saves via `POST /api/checkins/today` and loads via `GET /api/checkins/today`
  - A 7‑day mini chart renders for each metric on this page

2) Health Tracking — Vital Signs
- Where: `app/health-tracking/page.tsx` → card “Vital Signs”
- What: Add inputs for heart rate (bpm) and blood pressure (systolic/diastolic) with gentle out‑of‑range flags. Persist via check-ins.
- Why: Safety and trend visibility for key vitals.
- Done when:
  - HR and BP inputs save/load for today via check-ins endpoints
  - If systolic ≥ 140 or diastolic ≥ 90, show a small orange “high” tag; if ≤ 90/60, show a small blue “low” tag
  - 7‑day mini chart appears for HR and BP

3) Insights Feed (Preview → Real)
- Where: `app/insights/page.tsx`; APIs: `app/api/insights/list/route.ts`, `app/api/insights/generate/route.ts`
- What: Keep preview working; add “Pin” and “Dismiss” actions per card and respect them via `InsightsUserState`. When ready, enable real generation by turning on the existing flag.
- Why: Turns static preview into a useful, personalized feed users can manage.
- Done when:
  - Cards render with Pin/Dismiss; state persists and reorders via `InsightsUserState`
  - Refresh updates list immediately and triggers background regenerate
  - Real generation can be enabled by setting `NEXT_PUBLIC_INSIGHTS_ENABLED` to true (no code change needed to flip on later)

4) Weekly Reports — List, Detail, PDF
- Where: `app/reports/page.tsx`; APIs: `app/api/reports/weekly/list/route.ts`, `app/api/export/pdf/route.ts`
- What: From the list, open a simple detail view (new route `app/reports/[id]/page.tsx`) showing that week’s summary; add a “Download PDF” button that calls the PDF export API.
- Why: Gives users a tangible weekly artifact they can save/share.
- Done when:
  - Clicking a report tile opens a detail page with date range and summary
  - “Download PDF” returns a PDF; in-app viewer opens and a file downloads

5) Food Diary → Nutrition Totals
- Where: `app/food/page.tsx` (Food Diary) and `app/health-tracking/page.tsx` → card “Nutrition”
- What: Sum today’s Calories/Protein/Carbs/Fat from saved entries and show daily totals + simple targets (e.g., Protein 120g target). Use existing `todaysFoods` stored via `POST /api/user-data`.
- Why: Connects AI analysis to clear daily numbers.
- Done when:
  - Food Diary saves each entry’s nutrition as it already does
  - Health Tracking “Nutrition” shows totals (Cals/Prot/Carb/Fat) for today and simple targets

6) Medications — List + Reminders
- Where: `app/health-tracking/page.tsx` → card “Medications”
- What: Show a list of medications with dose and timing; allow add/edit/remove; optionally send reminders using push APIs.
- Why: Adherence tracking and gentle reminders.
- Done when:
  - CRUD works against `POST /api/user-data` (persist in `medications` array)
  - Optional toggle enables reminders; scheduling saved via `POST /api/checkins/settings` and push can be sent via `app/api/push/*` endpoints

7) Symptoms — 7‑step Tracker
- Where: `app/health-tracking/page.tsx` → card “Symptoms”
- What: Let users select a personal list of symptoms to track (e.g., headache, bloating), each rated 0–6 with optional note. Use existing check-ins tables.
- Why: Trends make patterns visible for Insights and Reports.
- Done when:
  - Manage tracked items via `GET/POST /api/checkins/issues`
  - Daily ratings saved via `POST /api/checkins/today` and shown in a 7‑day mini chart

8) Activity — Steps & Workouts
- Where: `app/health-tracking/page.tsx` → card “Activity”
- What: Manual logging for steps (number) and workouts (text + minutes). Show daily/weekly totals.
- Why: Baseline activity tracking prior to device integrations.
- Done when:
  - Inputs save/load via `POST /api/user-data` under a simple `activity` object
  - Weekly total displays on the card

9) Device Connections (Placeholder with Interest)
- Where: `app/dashboard/page.tsx` → “Connect Your Devices” section
- What: Keep Apple/ FitBit/ Garmin/ Other cards but let users tap “I’m interested”, storing their interest.
- Why: Capture demand; invite testers later.
- Done when:
  - Tapping a card toggles interest and saves via `POST /api/user-data` (e.g., `deviceInterest: { appleWatch: true }`)
  - UI shows selected state on reload

10) Navigation & Empty States
- Where: `app/dashboard/page.tsx`, `app/health-tracking/page.tsx`, `app/insights/page.tsx`, `app/reports/page.tsx`
- What: Add short “how this works” blurbs where a card says “Coming Soon” or when a list is empty.
- Why: Guides new users and reduces confusion.
- Done when:
  - Each major card/page shows a one‑sentence blurb when empty

11) Admin — Usage & Error Basics
- Where: `app/admin-panel/page.tsx`; APIs already log server events
- What: Show counts (e.g., number of food analyses today, insights generated, report PDFs created) and latest error messages.
- Why: Quick health check for the system without digging into logs.
- Done when:
  - Admin panel shows at least 3 counters and a small error list from recent API calls

## Priority 2 — Polish and UX

12) Profile — Instant Avatar Consistency
- Where: `app/profile/page.tsx`, `app/profile/image/page.tsx`, `components/providers/UserDataProvider.tsx`
- What: Ensure avatar updates everywhere instantly by updating the provider when a new image URL is returned.
- Why: Removes flicker/mismatch after upload.
- Done when:
  - After uploading on `profile/image`, the avatar updates immediately on Profile/Dashboard without refresh

13) Mobile Nav — Active States Consistency
- Where: Mobile bottom nav across `dashboard`, `insights`, `food`, `onboarding`, `settings`
- What: Make active label/icon state consistent and easily visible.
- Why: Clear orientation while navigating.
- Done when:
  - The correct tab is highlighted on each page and haptic/vibration calls are guarded by feature detection

14) Food Diary — Edit Flow Tightening
- Where: `app/food/page.tsx`
- What: Keep the current re‑analyze/edit flow but add a small “Saved” toast when entries update.
- Why: Confirms to users that changes stuck.
- Done when:
  - Updating an entry shows a brief confirmation and persists

## Priority 3 — Nice to have

15) Insights — Simple Section Pages
- Where: `app/insights/[name]/page.tsx` (e.g., goals, nutrition, safety)
- What: Dedicated pages listing only that category.
- Why: Easier to focus on one theme.
- Done when:
  - Tapping a tile on Insights opens its category page with a filtered list

16) Health Tracking — Weekly Summary Panel
- Where: `app/health-tracking/page.tsx` top section
- What: A compact weekly summary (best day, trend arrows) pulled from the same data.
- Why: Adds motivation at a glance.
- Done when:
  - The top of the page shows a 1‑line weekly summary once any data exists

Notes
- We’ll keep this list short and plain-English
- When we finish an item, we’ll mark it Done here and move on to the next
