### AI Insights & Reports - Information Architecture (Documentation Only)

Goal: Ship an enterprise-quality, hierarchical structure without touching working features. This plan documents page wiring and minimal new endpoints so implementation can be done safely in small PRs.

Scope of this doc
- No runtime code changes here
- Backward compatible: keeps existing food analysis, onboarding, admin, and notifications untouched

Top-level navigation (kept)
- Dashboard → links to: Health Setup, Food Diary, AI Insights, Reports
- Mobile bottom nav unchanged

Pages and hierarchy
1. Health Setup (existing: `/onboarding`) 
   - Purpose: edit intake info (personal, metrics, goals, meds, supplements)
   - Optional toggles (later): vitals, sleep, labs

2. Food Diary (existing: `/food`)
   - Purpose: analyze meals; save to `FoodLog`
   - No UI change required for this phase

3. AI Insights (existing page, to be wired)
   - Purpose: list generated insights
   - Sections: Pinned, New this week, All
   - Actions: Pin, Dismiss, Refresh
   - Data source (future): `/api/insights/list`, `/api/insights/generate`, `/api/insights/{id}/{pin|dismiss}`

4. Reports (existing page, to be wired)
   - Purpose: view weekly reports; download PDF
   - Data source (future): `/api/reports/weekly/list`, `/api/reports/weekly/{id}`, `/api/reports/weekly/generate`

Minimal data additions (future-safe; not implemented yet)
- Insight
  - id, userId, title, summary, why, tags[], confidence (0–1), createdAt, pinned, dismissed
- WeeklyReport
  - id, userId, weekStart, sections JSON, summary, pdfUrl?, createdAt

Generation inputs
- User intake: goals, meds, supplements (existing)
- Food logs (existing)
- Interaction analyses (existing)
- Optional later: check-ins, labs

Guardrails
- Keep model usage cheap for refresh; cap for free users
- No schema or API code will be merged until reviewed

Implementation phases (small, reversible)
1) Wire Dashboard tiles to existing pages (no schema)
2) Add read-only Insights list UI using mocked data provider (feature flag)
3) Add real `/api/insights/list` (read-only) that composes from existing data only
4) Add `/api/insights/generate` behind admin flag; then enable per user
5) Weekly report: list UI with mocked data → real list → generator + PDF

Revert strategy
- Each step is isolated; toggled via env/flag
- If anything degrades, disable flag and the site returns to current behavior


