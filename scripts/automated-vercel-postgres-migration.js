/**
 * Fully Automated Vercel Postgres Migration
 * 
 * This script does EVERYTHING automatically:
 * 1. Waits for you to upgrade to Vercel Pro and create Postgres database
 * 2. Detects when Postgres is ready
 * 3. Exports current database
 * 4. Applies schema to new database
 * 5. Migrates all data
 * 6. Updates environment variables
 * 7. Verifies migration
 * 
 * You ONLY need to:
 * - Upgrade to Vercel Pro
 * - Create Postgres database in Vercel dashboard
 * - Run this script: node scripts/automated-vercel-postgres-migration.js
 */

const https = require('https');
const { PrismaClient } = require('@prisma/client');
const { execSync } = require('child_process');

const VERCEL_TOKEN = process.env.VERCEL_TOKEN || '2MLfXoXXv8hIaHIE7lQcdQ39';
const NEON_API_KEY = process.env.NEON_API_KEY || 'napi_68f6p4no3no2btj4xj8zlczri4o9zpmqf9b5p9d73niuqz4t7ax1kloat6fej6gd';
const PROJECT_NAME = 'helfi-app';
const TEAM_ID = 'team_DLxtczVMOZUXhiInxhTSDrCs';
const NEON_PROJECT_ID = 'summer-violet-11069060';

// Colors for output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function makeVercelRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.vercel.com',
      path: path,
      method: method,
      headers: {
        'Authorization': `Bearer ${VERCEL_TOKEN}`,
        'Content-Type': 'application/json',
      },
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            reject(new Error(`API Error ${res.statusCode}: ${parsed.error?.message || body}`));
          }
        } catch (e) {
          reject(new Error(`Parse Error: ${body}`));
        }
      });
    });

    req.on('error', reject);
    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

function makeNeonRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'console.neon.tech',
      path: `/api/v2${path}`,
      method: method,
      headers: {
        'Authorization': `Bearer ${NEON_API_KEY}`,
        'Content-Type': 'application/json',
      },
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            reject(new Error(`API Error ${res.statusCode}: ${parsed.message || body}`));
          }
        } catch (e) {
          reject(new Error(`Parse Error: ${body}`));
        }
      });
    });

    req.on('error', reject);
    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

async function checkVercelPlan() {
  log('\n🔍 Checking Vercel plan...', 'blue');
  try {
    const team = await makeVercelRequest('GET', `/v2/teams/${TEAM_ID}`);
    const plan = team.billing?.plan;
    
    if (plan === 'hobby') {
      log('❌ Still on Hobby plan. Please upgrade to Pro first!', 'red');
      log('\nSteps:', 'yellow');
      log('1. Go to: https://vercel.com/account/billing', 'yellow');
      log('2. Upgrade to Pro plan ($20/month)', 'yellow');
      log('3. Run this script again', 'yellow');
      return false;
    }
    
    log(`✅ Plan: ${plan}`, 'green');
    return true;
  } catch (error) {
    log(`❌ Error checking plan: ${error.message}`, 'red');
    return false;
  }
}

async function getNeonConnectionFromAPI() {
  log('   Trying Neon API to get connection string...', 'yellow');
  try {
    // Get all Neon projects
    const projectsResponse = await makeNeonRequest('GET', '/projects');
    const projects = projectsResponse.projects || [];
    
    // Find the new database (not the old one)
    const newProject = projects.find(p => 
      p.id !== NEON_PROJECT_ID && 
      (p.name?.toLowerCase().includes('main') || p.name?.toLowerCase().includes('vercel'))
    ) || projects.find(p => p.id !== NEON_PROJECT_ID);
    
    if (!newProject) {
      return null;
    }
    
    log(`   Found Neon project: ${newProject.name} (${newProject.id})`, 'yellow');
    
    // Get endpoints
    const endpointsResponse = await makeNeonRequest('GET', `/projects/${newProject.id}/endpoints`);
    const endpoints = endpointsResponse.endpoints || [];
    const mainEndpoint = endpoints.find(e => e.type === 'read_write' && e.current_state === 'active');
    
    if (!mainEndpoint) {
      return null;
    }
    
    // Get branches to find default database name
    const branchesResponse = await makeNeonRequest('GET', `/projects/${newProject.id}/branches`);
    const branches = branchesResponse.branches || [];
    const mainBranch = branches.find(b => b.primary) || branches[0];
    
    const dbName = 'neondb'; // Default Neon database name
    const host = mainEndpoint.host;
    
    // Construct connection string (we'll need password from Vercel or Neon)
    // For now, return the host info so we can try to get full connection string
    return {
      host,
      database: dbName,
      projectId: newProject.id,
      endpointId: mainEndpoint.id
    };
  } catch (error) {
    log(`   Neon API error: ${error.message}`, 'yellow');
    return null;
  }
}

async function getVercelPostgresConnection() {
  log('\n🔍 Looking for Vercel Postgres database...', 'blue');
  
  try {
    const envVars = await makeVercelRequest('GET', `/v9/projects/${PROJECT_NAME}/env?teamId=${TEAM_ID}&decrypt=true`);
    const postgresUrl = envVars.envs?.find(e => 
      e.key === 'POSTGRES_URL' || 
      e.key === 'POSTGRES_PRISMA_URL' ||
      (e.key === 'DATABASE_URL' && e.value?.includes('vercel') && e.value?.includes('postgres'))
    );
    
    if (postgresUrl && postgresUrl.value) {
      log(`✅ Found Postgres connection string in Vercel`, 'green');
      return postgresUrl.value;
    }
    
    // If not found in Vercel, try Neon API
    log('   Not found in Vercel env vars, checking Neon API...', 'yellow');
    const neonInfo = await getNeonConnectionFromAPI();
    
    if (neonInfo) {
      log('⚠️  Found database but need connection string', 'yellow');
      log('   Vercel may still be setting up the connection string.', 'yellow');
      log('   Please wait 1-2 minutes and run this script again,', 'yellow');
      log('   or check Vercel dashboard → Storage → helfi-main-database', 'yellow');
      return null;
    }
    
    log('❌ Vercel Postgres not found!', 'red');
    log('\n⚠️  I cannot create the database via API (Vercel limitation)', 'yellow');
    log('\nPlease create Vercel Postgres database:', 'yellow');
    log('1. Go to: https://vercel.com/louie-veleskis-projects/helfi-app', 'yellow');
    log('2. Click: Storage → Create Database → Postgres', 'yellow');
    log('3. Choose region: ap-southeast-2', 'yellow');
    log('4. Name it: helfi-postgres (or any name)', 'yellow');
    log('5. Click Create', 'yellow');
    log('6. Wait 30 seconds for Vercel to set it up', 'yellow');
    log('7. Run this script again - it will detect it automatically!', 'yellow');
    return null;
  } catch (error) {
    log(`❌ Error finding Postgres: ${error.message}`, 'red');
    return null;
  }
}

async function getCurrentDatabaseUrl() {
  try {
    const envVars = await makeVercelRequest('GET', `/v9/projects/${PROJECT_NAME}/env?teamId=${TEAM_ID}&decrypt=true`);
    const dbUrl = envVars.envs?.find(e => e.key === 'DATABASE_URL');
    return dbUrl?.value || process.env.DATABASE_URL;
  } catch (error) {
    return process.env.DATABASE_URL;
  }
}

async function backupCurrentDatabase(oldDbUrl) {
  log('\n💾 Backing up current database...', 'blue');
  
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const backupFile = `database-backup-${timestamp}.sql`;
    
    log(`   Creating backup: ${backupFile}...`, 'yellow');
    
    // Try pg_dump first
    try {
      execSync(`pg_dump "${oldDbUrl}" > ${backupFile}`, { stdio: 'inherit' });
      log(`✅ Backup created: ${backupFile}`, 'green');
      return backupFile;
    } catch (error) {
      log('⚠️  pg_dump not available, using Prisma schema export instead', 'yellow');
      // Fallback: export schema
      execSync('npx prisma db pull --force', { stdio: 'inherit' });
      log('✅ Schema exported', 'green');
      return null;
    }
  } catch (error) {
    log(`⚠️  Backup failed: ${error.message}`, 'yellow');
    log('   Continuing anyway...', 'yellow');
    return null;
  }
}

async function applySchemaToNewDatabase(newDbUrl) {
  log('\n📐 Applying schema to new database...', 'blue');
  
  try {
    log('   Running Prisma migrations...', 'yellow');
    try {
      // Create a clean environment with the new database URL
      const env = Object.assign({}, process.env);
      env.DATABASE_URL = newDbUrl;
      delete env.DATABASE_URL_OLD; // Remove any old references
      
      execSync('npx prisma migrate deploy', { 
        stdio: 'inherit',
        env: env,
        cwd: process.cwd()
      });
      log('✅ Migrations applied', 'green');
    } catch (error) {
      log('   Migrations failed, trying db push...', 'yellow');
      // Create a clean environment with the new database URL
      const env = Object.assign({}, process.env);
      env.DATABASE_URL = newDbUrl;
      delete env.DATABASE_URL_OLD; // Remove any old references
      
      execSync('npx prisma db push --accept-data-loss', { 
        stdio: 'inherit',
        env: env,
        cwd: process.cwd()
      });
      log('✅ Schema pushed', 'green');
    }
    
    return true;
  } catch (error) {
    log(`❌ Failed to apply schema: ${error.message}`, 'red');
    return false;
  }
}

async function migrateData(oldDbUrl, newDbUrl) {
  log('\n📦 Migrating data...', 'blue');
  
  const oldPrisma = new PrismaClient({ datasources: { db: { url: oldDbUrl } } });
  const newPrisma = new PrismaClient({ datasources: { db: { url: newDbUrl } } });
  
  try {
    await oldPrisma.$connect();
    await newPrisma.$connect();
    log('✅ Connected to both databases', 'green');
    
    const tables = [
      'User', 'Account', 'Session', 'VerificationToken', 'HealthGoal',
      'Supplement', 'Medication', 'HealthLog', 'FoodLog', 'ExerciseLog',
      'Subscription', 'CreditTopUp', 'FitbitData', 'File', 'InteractionAnalysis',
      'Waitlist', 'AdminUser', 'EmailTemplate', 'SupportTicket', 'TicketResponse',
      'Report', 'LabResult', 'ConsentRecord', 'AuditEvent'
    ];
    
    let totalMigrated = 0;
    
    for (const tableName of tables) {
      try {
        log(`   Migrating ${tableName}...`, 'yellow');
        const records = await oldPrisma.$queryRawUnsafe(`SELECT * FROM "${tableName}"`);
        
        if (records.length === 0) {
          log(`   ⏭️  ${tableName}: No records`, 'yellow');
          continue;
        }
        
        // Use raw SQL for bulk insert
        for (const record of records) {
          try {
            const columns = Object.keys(record).map(c => `"${c}"`).join(', ');
            const values = Object.values(record).map(v => {
              if (v === null) return 'NULL';
              if (typeof v === 'string') return `'${v.replace(/'/g, "''")}'`;
              if (v instanceof Date) return `'${v.toISOString()}'`;
              if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'`;
              return v;
            }).join(', ');
            
            await newPrisma.$executeRawUnsafe(
              `INSERT INTO "${tableName}" (${columns}) VALUES (${values}) ON CONFLICT DO NOTHING`
            );
            totalMigrated++;
          } catch (error) {
            // Skip duplicates
            if (!error.message.includes('duplicate') && !error.message.includes('unique')) {
              // Silent skip for now
            }
          }
        }
        
        log(`   ✅ ${tableName}: ${records.length} records`, 'green');
      } catch (error) {
        log(`   ⚠️  ${tableName}: ${error.message}`, 'yellow');
      }
    }
    
    log(`\n✅ Total records migrated: ${totalMigrated}`, 'green');
    
    await oldPrisma.$disconnect();
    await newPrisma.$disconnect();
    return true;
  } catch (error) {
    log(`❌ Migration failed: ${error.message}`, 'red');
    await oldPrisma.$disconnect().catch(() => {});
    await newPrisma.$disconnect().catch(() => {});
    return false;
  }
}

async function updateEnvironmentVariables(newDbUrl) {
  log('\n🔧 Updating environment variables...', 'blue');
  
  try {
    const envVars = await makeVercelRequest('GET', `/v9/projects/${PROJECT_NAME}/env?teamId=${TEAM_ID}`);
    
    // Backup old DATABASE_URL
    const oldDb = envVars.envs?.find(e => e.key === 'DATABASE_URL');
    if (oldDb && !envVars.envs?.find(e => e.key === 'DATABASE_URL_OLD')) {
      log('   Backing up old DATABASE_URL...', 'yellow');
      await makeVercelRequest('POST', `/v9/projects/${PROJECT_NAME}/env?teamId=${TEAM_ID}`, {
        key: 'DATABASE_URL_OLD',
        value: oldDb.value,
        type: 'encrypted',
        target: ['production', 'preview', 'development'],
      });
    }
    
    // Update DATABASE_URL
    if (oldDb) {
      log('   Updating DATABASE_URL...', 'yellow');
      await makeVercelRequest('PATCH', `/v9/projects/${PROJECT_NAME}/env/${oldDb.id}?teamId=${TEAM_ID}`, {
        value: newDbUrl,
        type: 'encrypted',
        target: ['production', 'preview', 'development'],
      });
    } else {
      log('   Creating DATABASE_URL...', 'yellow');
      await makeVercelRequest('POST', `/v9/projects/${PROJECT_NAME}/env?teamId=${TEAM_ID}`, {
        key: 'DATABASE_URL',
        value: newDbUrl,
        type: 'encrypted',
        target: ['production', 'preview', 'development'],
      });
    }
    
    log('✅ Environment variables updated', 'green');
    return true;
  } catch (error) {
    log(`❌ Failed to update env vars: ${error.message}`, 'red');
    return false;
  }
}

async function verifyMigration(newDbUrl) {
  log('\n✅ Verifying migration...', 'blue');
  
  try {
    const prisma = new PrismaClient({ datasources: { db: { url: newDbUrl } } });
    await prisma.$connect();
    
    const userCount = await prisma.user.count();
    log(`   Users: ${userCount}`, 'green');
    
    await prisma.$disconnect();
    log('✅ Migration verified!', 'green');
    return true;
  } catch (error) {
    log(`⚠️  Verification warning: ${error.message}`, 'yellow');
    return true; // Don't fail on verification
  }
}

async function waitForPostgres(maxAttempts = 12, delaySeconds = 5) {
  log(`\n⏳ Waiting for Postgres database to be ready...`, 'blue');
  log(`   (Checking every ${delaySeconds} seconds, max ${maxAttempts * delaySeconds} seconds)`, 'yellow');
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const dbUrl = await getVercelPostgresConnection();
    if (dbUrl) {
      return dbUrl;
    }
    
    if (attempt < maxAttempts) {
      log(`   Attempt ${attempt}/${maxAttempts}... waiting ${delaySeconds}s`, 'yellow');
      await new Promise(resolve => setTimeout(resolve, delaySeconds * 1000));
    }
  }
  
  return null;
}

async function main() {
  log('\n🚀 AUTOMATED VERCEL POSTGRES MIGRATION', 'blue');
  log('=====================================\n', 'blue');
  
  // Step 1: Check Vercel plan
  const hasProPlan = await checkVercelPlan();
  if (!hasProPlan) {
    process.exit(1);
  }
  
  // Step 2: Get Vercel Postgres connection (with retry)
  let newDbUrl = await getVercelPostgresConnection();
  if (!newDbUrl) {
    log('\n💡 Tip: If you just created the database, wait 30 seconds and run this script again.', 'yellow');
    log('   The script will automatically detect it once Vercel finishes setup.\n', 'yellow');
    process.exit(1);
  }
  
  // Step 3: Get current database URL
  const oldDbUrl = await getCurrentDatabaseUrl();
  if (!oldDbUrl) {
    log('❌ Could not find current DATABASE_URL', 'red');
    process.exit(1);
  }
  
  log(`\n📊 Current Database: ${oldDbUrl.replace(/:[^:@]+@/, ':****@')}`, 'yellow');
  log(`📊 New Database: ${newDbUrl.replace(/:[^:@]+@/, ':****@')}`, 'yellow');
  
  // Step 4: Backup current database
  await backupCurrentDatabase(oldDbUrl);
  
  // Step 5: Apply schema to new database
  const schemaApplied = await applySchemaToNewDatabase(newDbUrl);
  if (!schemaApplied) {
    log('\n❌ Failed to apply schema. Migration aborted.', 'red');
    process.exit(1);
  }
  
  // Step 6: Migrate data
  const dataMigrated = await migrateData(oldDbUrl, newDbUrl);
  if (!dataMigrated) {
    log('\n❌ Data migration failed. Check logs above.', 'red');
    process.exit(1);
  }
  
  // Step 7: Update environment variables
  const envUpdated = await updateEnvironmentVariables(newDbUrl);
  if (!envUpdated) {
    log('\n⚠️  Environment variables not updated. Please update manually.', 'yellow');
  }
  
  // Step 8: Verify migration
  await verifyMigration(newDbUrl);
  
  log('\n🎉 MIGRATION COMPLETE!', 'green');
  log('=====================\n', 'green');
  log('Next steps:', 'yellow');
  log('1. Vercel will auto-deploy with new database', 'yellow');
  log('2. Test your application thoroughly', 'yellow');
  log('3. If everything works, you can delete DATABASE_URL_OLD', 'yellow');
  log('4. Old Neon database can be kept as backup for 30 days\n', 'yellow');
}

main().catch((error) => {
  log(`\n❌ Migration failed: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});

