## Database Reference (Use This, Ignore Others)

**Primary production database:** `helfi-main-database` (Neon, AWS ap-southeast-2).  
**Connection string (psql/Prisma):**
```
postgresql://neondb_owner:npg_6Pwm8JLiQUxb@ep-shiny-silence-a7jm0pec-pooler.ap-southeast-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require
```

**Notes for anyone touching data:**
- This is the only database to use for the live app. Do not point code or scripts at any older database.
- The Vercel `DATABASE_URL` is set to this connection string for all environments.
- Tables of interest include `FoodLog` (food diary entries) and `AIUsageLog` (AI cost tracking).
- To verify connectivity quickly, run (with the string above):
  - `SELECT COUNT(*) FROM "FoodLog";`
  - `SELECT * FROM "FoodLog" WHERE "localDate" = '2025-11-27';`
  - `SELECT feature, COUNT(*) FROM "AIUsageLog" GROUP BY feature;`

If you see any other connection string or database name, it’s the wrong one. Use the string above.
