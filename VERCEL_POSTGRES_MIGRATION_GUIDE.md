# Vercel Postgres Migration Guide

## ✅ Pre-Migration Preparation (COMPLETE)

All preparation scripts and documentation are ready. Your current Neon database will continue working until you switch.

## Prerequisites
- ✅ Vercel Pro plan ($20/month) - **UPGRADE REQUIRED**
- ✅ This preparation script has been run
- ✅ Current database backup created (run when ready)

## Migration Steps

### Step 1: Upgrade to Vercel Pro
1. Go to: https://vercel.com/account/billing
2. Upgrade to Pro plan ($20/month)
3. Wait for activation (usually instant)

### Step 2: Create Vercel Postgres Database
1. Go to your Vercel project: https://vercel.com/louie-veleskis-projects/helfi-app
2. Navigate to: **Storage** → **Create Database** → **Postgres**
3. Choose region: **ap-southeast-2** (to match current Neon region)
4. Name it: `helfi-postgres` (or your preferred name)
5. Click **Create**
6. **Note**: Vercel will automatically add `POSTGRES_URL` environment variable

### Step 3: Backup Current Database
```bash
# Run the export script
./scripts/export-current-database.sh

# Or manually export
pg_dump "$DATABASE_URL" > database-backup-$(date +%Y%m%d).sql
```

### Step 4: Apply Schema to New Database
```bash
# Temporarily use POSTGRES_URL for migrations
export DATABASE_URL="$POSTGRES_URL"

# Apply all migrations
npx prisma migrate deploy

# Or if migrations don't exist, push schema
npx prisma db push
```

### Step 5: Migrate Data

#### Option A: Using pg_dump/pg_restore (Recommended - Fastest)
```bash
# Export from current Neon database
pg_dump "$DATABASE_URL" > backup.sql

# Import to Vercel Postgres (use POSTGRES_URL from Vercel)
psql "$POSTGRES_URL" < backup.sql
```

#### Option B: Using Prisma Migration Script (More Control)
```bash
# Set both connection strings
export OLD_DATABASE_URL="your_current_neon_connection_string"
export NEW_DATABASE_URL="$POSTGRES_URL"

# Run migration script
node scripts/migrate-data-to-vercel-postgres.js
```

### Step 6: Update Environment Variables
```bash
# Automated way (recommended)
POSTGRES_URL="your_vercel_postgres_connection_string" \
  node scripts/setup-vercel-postgres-env.js
```

**Or manually:**
1. Go to: https://vercel.com/louie-veleskis-projects/helfi-app/settings/environment-variables
2. Copy `POSTGRES_URL` value
3. Update `DATABASE_URL` to use the same value
4. Keep old `DATABASE_URL` as `DATABASE_URL_OLD` (backup)
5. Redeploy application

### Step 7: Verify Migration
1. Test login functionality
2. Check data integrity
3. Monitor for errors in Vercel logs
4. Verify all features work correctly
5. If everything works, you can delete old Neon database

### Step 8: Cleanup (After Verification)
1. Remove `DATABASE_URL_OLD` environment variable
2. Delete old Neon project (optional - keep as backup for 30 days)
3. Update documentation

## Rollback Plan
If something goes wrong:
1. Revert `DATABASE_URL` to old Neon connection string in Vercel
2. Redeploy application
3. Investigate issues
4. Retry migration

## Quick Reference

### Current Setup
- **Database**: Neon (ap-southeast-2)
- **Project**: helfi-database
- **Connection**: Stored in `DATABASE_URL`

### New Setup (After Migration)
- **Database**: Vercel Postgres (powered by Neon)
- **Region**: ap-southeast-2
- **Connection**: `POSTGRES_URL` (auto-created by Vercel)

## Notes
- ✅ Vercel Postgres is powered by Neon, so performance should be similar
- ✅ Both use PostgreSQL, so schema compatibility is guaranteed
- ⏱️ Migration downtime: ~5-15 minutes depending on data size
- 📅 Recommended to do migration during low-traffic period
- 💾 Always backup before migration
- 🔄 Can rollback easily by switching `DATABASE_URL` back

## Scripts Created

1. **`scripts/prepare-vercel-postgres-migration.sh`** - Preparation script (already run)
2. **`scripts/export-current-database.sh`** - Export current database
3. **`scripts/migrate-data-to-vercel-postgres.js`** - Data migration script
4. **`scripts/setup-vercel-postgres-env.js`** - Environment variable setup

## Support

If you encounter issues:
1. Check Vercel deployment logs
2. Verify environment variables are set correctly
3. Test database connection manually
4. Rollback if needed and investigate

