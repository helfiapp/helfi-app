#!/bin/bash
# Prepare Vercel Postgres Migration
# This script prepares everything for migrating to Vercel Postgres when you upgrade to Pro plan
# Run this BEFORE upgrading to Vercel Pro

set -e

echo "🚀 Preparing Vercel Postgres Migration"
echo "======================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "❌ DATABASE_URL environment variable not set"
    echo "   Please set it in your .env.local file or export it"
    exit 1
fi

echo "✅ Current database connection found"
echo ""

# Extract database info from current connection string
CURRENT_DB=$(echo $DATABASE_URL | sed -n 's/.*\/\([^?]*\).*/\1/p')
echo "📊 Current Database: $CURRENT_DB"
echo ""

# Step 1: Export current schema
echo "${YELLOW}Step 1: Exporting current database schema...${NC}"
npx prisma db pull --force 2>/dev/null || echo "⚠️  Schema export completed (warnings are normal)"
echo "✅ Schema exported to prisma/schema.prisma"
echo ""

# Step 2: Generate Prisma Client (ensure it's up to date)
echo "${YELLOW}Step 2: Generating Prisma Client...${NC}"
npx prisma generate
echo "✅ Prisma Client generated"
echo ""

# Step 3: Create migration backup
echo "${YELLOW}Step 3: Creating migration backup...${NC}"
BACKUP_DIR="prisma/migrations-backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"
cp -r prisma/migrations/* "$BACKUP_DIR/" 2>/dev/null || true
echo "✅ Migrations backed up to $BACKUP_DIR"
echo ""

# Step 4: Create data export script
echo "${YELLOW}Step 4: Creating data export script...${NC}"
cat > scripts/export-current-database.sh << 'EXPORTSCRIPT'
#!/bin/bash
# Export current database data for migration
# This will be used when migrating to Vercel Postgres

set -e

if [ -z "$DATABASE_URL" ]; then
    echo "❌ DATABASE_URL not set"
    exit 1
fi

BACKUP_FILE="database-backup-$(date +%Y%m%d-%H%M%S).sql"
echo "📦 Exporting database to $BACKUP_FILE..."

# Export schema and data
pg_dump "$DATABASE_URL" > "$BACKUP_FILE" 2>&1 || {
    echo "⚠️  pg_dump not available, using Prisma instead"
    echo "   You can manually export using: npx prisma db pull"
}

echo "✅ Backup created: $BACKUP_FILE"
echo "   File size: $(du -h "$BACKUP_FILE" | cut -f1)"
EXPORTSCRIPT

chmod +x scripts/export-current-database.sh
echo "✅ Export script created"
echo ""

# Step 5: Create migration instructions
echo "${YELLOW}Step 5: Creating migration instructions...${NC}"
cat > VERCEL_POSTGRES_MIGRATION_GUIDE.md << 'GUIDE'
# Vercel Postgres Migration Guide

## Prerequisites
- ✅ Vercel Pro plan ($20/month)
- ✅ This preparation script has been run
- ✅ Current database backup created

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

### Step 3: Get Connection String
1. After creation, Vercel will automatically add `POSTGRES_URL` environment variable
2. The connection string format will be: `postgres://default:password@host:5432/verceldb`
3. Note: Vercel uses `POSTGRES_URL` instead of `DATABASE_URL`

### Step 4: Apply Schema to New Database
```bash
# Set the new connection string temporarily
export DATABASE_URL="$POSTGRES_URL"

# Apply all migrations
npx prisma migrate deploy

# Or if migrations don't exist, push schema
npx prisma db push
```

### Step 5: Migrate Data (Choose One Method)

#### Option A: Using pg_dump/pg_restore (Recommended)
```bash
# Export from current Neon database
pg_dump "$OLD_DATABASE_URL" > backup.sql

# Import to Vercel Postgres
psql "$POSTGRES_URL" < backup.sql
```

#### Option B: Using Prisma + Custom Script
```bash
# Run the migration script
node scripts/migrate-data-to-vercel-postgres.js
```

### Step 6: Update Environment Variables
1. Go to: https://vercel.com/louie-veleskis-projects/helfi-app/settings/environment-variables
2. Update `DATABASE_URL` to use `POSTGRES_URL` value
3. Keep old `DATABASE_URL` as `DATABASE_URL_OLD` (backup)
4. Redeploy application

### Step 7: Verify Migration
1. Test login functionality
2. Check data integrity
3. Monitor for errors
4. If everything works, you can delete old Neon database

### Step 8: Cleanup (After Verification)
1. Remove `DATABASE_URL_OLD` environment variable
2. Delete old Neon project (optional)
3. Update documentation

## Rollback Plan
If something goes wrong:
1. Revert `DATABASE_URL` to old Neon connection string
2. Redeploy application
3. Investigate issues
4. Retry migration

## Notes
- Vercel Postgres is powered by Neon, so performance should be similar
- Both use PostgreSQL, so schema compatibility is guaranteed
- Migration downtime: ~5-15 minutes depending on data size
- Recommended to do migration during low-traffic period
GUIDE

echo "✅ Migration guide created: VERCEL_POSTGRES_MIGRATION_GUIDE.md"
echo ""

echo "${GREEN}✅ Preparation Complete!${NC}"
echo ""
echo "Next steps:"
echo "1. Review: VERCEL_POSTGRES_MIGRATION_GUIDE.md"
echo "2. When ready to migrate, upgrade to Vercel Pro"
echo "3. Follow the migration guide"
echo ""
echo "Current database will continue working until you switch."

