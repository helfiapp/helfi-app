/**
 * Data Migration Script: Neon → Vercel Postgres
 * 
 * This script migrates data from your current Neon database to Vercel Postgres
 * Run this AFTER creating Vercel Postgres database and updating environment variables
 * 
 * Usage:
 *   OLD_DATABASE_URL="neon_connection_string" \
 *   NEW_DATABASE_URL="vercel_postgres_connection_string" \
 *   node scripts/migrate-data-to-vercel-postgres.js
 */

const { PrismaClient } = require('@prisma/client');

// Get connection strings from environment
const OLD_DB_URL = process.env.OLD_DATABASE_URL || process.env.DATABASE_URL_OLD;
const NEW_DB_URL = process.env.NEW_DATABASE_URL || process.env.POSTGRES_URL || process.env.DATABASE_URL;

if (!OLD_DB_URL || !NEW_DB_URL) {
  console.error('❌ Missing connection strings!');
  console.error('');
  console.error('Required environment variables:');
  console.error('  OLD_DATABASE_URL - Current Neon database');
  console.error('  NEW_DATABASE_URL or POSTGRES_URL - New Vercel Postgres database');
  console.error('');
  console.error('Example:');
  console.error('  OLD_DATABASE_URL="postgresql://..." NEW_DATABASE_URL="postgresql://..." node scripts/migrate-data-to-vercel-postgres.js');
  process.exit(1);
}

const oldPrisma = new PrismaClient({
  datasources: {
    db: {
      url: OLD_DB_URL,
    },
  },
});

const newPrisma = new PrismaClient({
  datasources: {
    db: {
      url: NEW_DB_URL,
    },
  },
});

async function migrateTable(tableName, orderBy = 'createdAt') {
  console.log(`📦 Migrating ${tableName}...`);
  
  try {
    // Get all records from old database
    const records = await oldPrisma.$queryRawUnsafe(
      `SELECT * FROM "${tableName}" ORDER BY "${orderBy}" ASC`
    );
    
    if (records.length === 0) {
      console.log(`   ⏭️  No records to migrate`);
      return 0;
    }
    
    console.log(`   Found ${records.length} records`);
    
    // Insert into new database in batches
    const batchSize = 100;
    let migrated = 0;
    
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      
      // Use raw SQL to insert (more reliable for migration)
      for (const record of batch) {
        try {
          const columns = Object.keys(record).map(col => `"${col}"`).join(', ');
          const values = Object.values(record).map(val => {
            if (val === null) return 'NULL';
            if (typeof val === 'string') return `'${val.replace(/'/g, "''")}'`;
            if (val instanceof Date) return `'${val.toISOString()}'`;
            if (typeof val === 'object') return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
            return val;
          }).join(', ');
          
          await newPrisma.$executeRawUnsafe(
            `INSERT INTO "${tableName}" (${columns}) VALUES (${values}) ON CONFLICT DO NOTHING`
          );
          migrated++;
        } catch (error) {
          // Skip duplicates or errors, continue migration
          if (!error.message.includes('duplicate') && !error.message.includes('unique')) {
            console.warn(`   ⚠️  Error migrating record: ${error.message}`);
          }
        }
      }
      
      process.stdout.write(`   Progress: ${Math.min(migrated, records.length)}/${records.length}\r`);
    }
    
    console.log(`   ✅ Migrated ${migrated} records`);
    return migrated;
  } catch (error) {
    console.error(`   ❌ Error migrating ${tableName}: ${error.message}`);
    return 0;
  }
}

async function main() {
  console.log('🚀 Starting Database Migration');
  console.log('==============================');
  console.log('');
  console.log('Old Database:', OLD_DB_URL.replace(/:[^:@]+@/, ':****@'));
  console.log('New Database:', NEW_DB_URL.replace(/:[^:@]+@/, ':****@'));
  console.log('');
  
  // Verify connections
  console.log('🔍 Verifying database connections...');
  try {
    await oldPrisma.$connect();
    console.log('✅ Old database connected');
  } catch (error) {
    console.error('❌ Failed to connect to old database:', error.message);
    process.exit(1);
  }
  
  try {
    await newPrisma.$connect();
    console.log('✅ New database connected');
  } catch (error) {
    console.error('❌ Failed to connect to new database:', error.message);
    console.error('');
    console.error('Make sure:');
    console.error('1. Vercel Postgres database is created');
    console.error('2. POSTGRES_URL environment variable is set');
    console.error('3. Schema has been applied (run: npx prisma migrate deploy)');
    process.exit(1);
  }
  
  console.log('');
  
  // Migration order matters (respect foreign keys)
  const tables = [
    { name: 'User', orderBy: 'createdAt' },
    { name: 'Account', orderBy: 'createdAt' },
    { name: 'Session', orderBy: 'expires' },
    { name: 'VerificationToken', orderBy: 'expires' },
    { name: 'HealthGoal', orderBy: 'createdAt' },
    { name: 'Supplement', orderBy: 'createdAt' },
    { name: 'Medication', orderBy: 'createdAt' },
    { name: 'HealthLog', orderBy: 'createdAt' },
    { name: 'FoodLog', orderBy: 'createdAt' },
    { name: 'ExerciseLog', orderBy: 'createdAt' },
    { name: 'Subscription', orderBy: 'startDate' },
    { name: 'CreditTopUp', orderBy: 'purchasedAt' },
    { name: 'FitbitData', orderBy: 'createdAt' },
    { name: 'File', orderBy: 'createdAt' },
    { name: 'InteractionAnalysis', orderBy: 'createdAt' },
    { name: 'Waitlist', orderBy: 'createdAt' },
    { name: 'AdminUser', orderBy: 'createdAt' },
    { name: 'EmailTemplate', orderBy: 'createdAt' },
    { name: 'SupportTicket', orderBy: 'createdAt' },
    { name: 'TicketResponse', orderBy: 'createdAt' },
    { name: 'Report', orderBy: 'createdAt' },
    { name: 'LabResult', orderBy: 'createdAt' },
    { name: 'ConsentRecord', orderBy: 'consentedAt' },
    { name: 'AuditEvent', orderBy: 'createdAt' },
  ];
  
  let totalMigrated = 0;
  
  for (const table of tables) {
    const count = await migrateTable(table.name, table.orderBy);
    totalMigrated += count;
  }
  
  console.log('');
  console.log('==============================');
  console.log(`✅ Migration Complete!`);
  console.log(`   Total records migrated: ${totalMigrated}`);
  console.log('');
  console.log('Next steps:');
  console.log('1. Verify data in new database');
  console.log('2. Update DATABASE_URL in Vercel to use POSTGRES_URL');
  console.log('3. Redeploy application');
  console.log('4. Test thoroughly');
  console.log('5. If everything works, remove old database');
  
  await oldPrisma.$disconnect();
  await newPrisma.$disconnect();
}

main().catch((error) => {
  console.error('❌ Migration failed:', error);
  process.exit(1);
});

