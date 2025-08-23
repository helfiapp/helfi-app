# Golden State

Latest known-good deployment snapshot.

- Commit: 3ad36b381befef1556dc93194d0fed2b149c2021
- Date: 2025-08-23 17:25:03 +1000
- Title: Food AI: enforce exact nutrition line in responses; server-side fallback to append missing Calories/Protein/Carbs/Fat line
- Reason: Restores Food Diary nutrition cards; adds guard and warnings to prevent regressions.

# GOLDEN STATE

This file marks the current known-good version of the app.

- Commit: 79f8b02c2ba371122818b4b61557651b507f7923
- Date: 2025-08-23T16:29:00+10:00
- Title: Onboarding modal + dashboard deferral (stable); back arrow links to dashboard; Google avatar domain retained
- Reason: First-time login flow confirmed working end-to-end without regressions. Modal appears for new users; “I’ll do it later” stays on dashboard; back button no longer bounces; left menu intact on app pages.

How to use
- When a new version is verified “golden”, update this file with the new commit hash, date, and a brief reason.
- Keep only the latest golden entry here; older golden points can be retrieved from git history if needed.
