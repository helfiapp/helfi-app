## Database Reference (Use This, Ignore Others)

**Primary production database:** `helfi-database` (Neon, AWS ap-southeast-2).  
**Connection setting:** use `DATABASE_URL` from the live Helfi environment.

**Notes for anyone touching data:**
- This is the only database to use for the live app. Do not point code or scripts at any older database.
- The live app uses `DATABASE_URL`.
- Tables of interest include `FoodLog` (food diary entries) and `AIUsageLog` (AI cost tracking).
- To verify connectivity quickly, run (with `DATABASE_URL`):
  - `SELECT COUNT(*) FROM "FoodLog";`
  - `SELECT * FROM "FoodLog" WHERE "localDate" = '2025-11-27';`
  - `SELECT feature, COUNT(*) FROM "AIUsageLog" GROUP BY feature;`

If you see `helfi-main-database` or old `POSTGRES_*` values, they are outdated and should not be used.
