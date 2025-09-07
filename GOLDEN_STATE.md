# GOLDEN STATE

Latest known-good deployment snapshot.

- Commit: 57b19c4 (master)
- Date: 2025-09-01 11:51:22 +1000
- Title: Food history — Local-day fetch for reliable per‑date entries
- Reason: Daily history now queries by the user’s local day (tz‑aware) while keeping today’s fast bucket. Prevents “missing” entries when navigating to previous days. Production deployment verified.

How to use
- When a new version is verified “golden”, update this file with the new commit hash, date, and a brief reason.
- Keep only the latest golden entry here; older golden points can be retrieved from git history if needed.
