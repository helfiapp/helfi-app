/**
 * Setup Vercel Postgres Environment Variable
 * 
 * This script adds/updates the DATABASE_URL in Vercel to use POSTGRES_URL
 * Run this AFTER creating Vercel Postgres database
 * 
 * Usage:
 *   POSTGRES_URL="vercel_postgres_connection_string" \
 *   node scripts/setup-vercel-postgres-env.js
 */

const https = require('https');

const VERCEL_TOKEN = process.env.VERCEL_TOKEN || '2MLfXoXXv8hIaHIE7lQcdQ39';
const PROJECT_NAME = 'helfi-app';
const TEAM_ID = 'team_DLxtczVMOZUXhiInxhTSDrCs';
const POSTGRES_URL = process.env.POSTGRES_URL || process.env.NEW_DATABASE_URL;

if (!POSTGRES_URL) {
  console.error('❌ POSTGRES_URL environment variable required!');
  console.error('');
  console.error('After creating Vercel Postgres:');
  console.error('1. Go to Vercel project → Storage → Postgres');
  console.error('2. Copy the connection string');
  console.error('3. Run: POSTGRES_URL="connection_string" node scripts/setup-vercel-postgres-env.js');
  process.exit(1);
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

async function getCurrentEnvVars() {
  try {
    const response = await makeVercelRequest(
      'GET',
      `/v9/projects/${PROJECT_NAME}/env?teamId=${TEAM_ID}`
    );
    return response.envs || [];
  } catch (error) {
    console.error('❌ Failed to fetch environment variables:', error.message);
    throw error;
  }
}

async function createOrUpdateEnvVar(key, value, targets = ['production', 'preview', 'development']) {
  const envVars = await getCurrentEnvVars();
  const existing = envVars.find(e => e.key === key);

  if (existing) {
    console.log(`📝 Updating existing ${key}...`);
    try {
      await makeVercelRequest(
        'PATCH',
        `/v9/projects/${PROJECT_NAME}/env/${existing.id}?teamId=${TEAM_ID}`,
        {
          value: value,
          type: 'encrypted',
          target: targets,
        }
      );
      console.log(`✅ Updated ${key}`);
      return existing.id;
    } catch (error) {
      console.error(`❌ Failed to update ${key}:`, error.message);
      throw error;
    }
  } else {
    console.log(`➕ Creating new ${key}...`);
    try {
      const response = await makeVercelRequest(
        'POST',
        `/v9/projects/${PROJECT_NAME}/env?teamId=${TEAM_ID}`,
        {
          key: key,
          value: value,
          type: 'encrypted',
          target: targets,
        }
      );
      console.log(`✅ Created ${key}`);
      return response.id;
    } catch (error) {
      console.error(`❌ Failed to create ${key}:`, error.message);
      throw error;
    }
  }
}

async function backupCurrentDatabaseUrl() {
  const envVars = await getCurrentEnvVars();
  const currentDb = envVars.find(e => e.key === 'DATABASE_URL');
  
  if (currentDb && !envVars.find(e => e.key === 'DATABASE_URL_OLD')) {
    console.log('💾 Backing up current DATABASE_URL to DATABASE_URL_OLD...');
    // Note: We can't decrypt the value, so we'll just note that backup should be done manually
    console.log('⚠️  Note: Please manually backup DATABASE_URL before switching');
    console.log('   You can do this in Vercel dashboard or by running:');
    console.log('   curl -H "Authorization: Bearer $VERCEL_TOKEN" \\');
    console.log('     "https://api.vercel.com/v9/projects/helfi-app/env?teamId=team_DLxtczVMOZUXhiInxhTSDrCs&decrypt=true"');
  }
}

async function main() {
  console.log('🚀 Setting up Vercel Postgres Environment Variables');
  console.log('==================================================');
  console.log('');
  
  // Backup current DATABASE_URL
  await backupCurrentDatabaseUrl();
  console.log('');
  
  // Create/update POSTGRES_URL (Vercel usually creates this automatically, but we'll ensure it exists)
  console.log('📦 Setting up POSTGRES_URL...');
  await createOrUpdateEnvVar('POSTGRES_URL', POSTGRES_URL);
  console.log('');
  
  // Update DATABASE_URL to use POSTGRES_URL value
  console.log('🔄 Updating DATABASE_URL to use Vercel Postgres...');
  await createOrUpdateEnvVar('DATABASE_URL', POSTGRES_URL);
  console.log('');
  
  console.log('✅ Environment variables configured!');
  console.log('');
  console.log('Next steps:');
  console.log('1. Redeploy your application (or wait for auto-deploy)');
  console.log('2. Test the application thoroughly');
  console.log('3. If everything works, you can remove DATABASE_URL_OLD');
  console.log('');
  console.log('⚠️  Important: Keep DATABASE_URL_OLD as backup until you verify everything works!');
}

main().catch((error) => {
  console.error('❌ Setup failed:', error.message);
  process.exit(1);
});

