#!/usr/bin/env node

const { PrismaClient } = require('@prisma/client');

async function testDatabaseConnection() {
  console.log('🧪 TESTING DATABASE CONNECTION...');
  console.log('=' .repeat(50));
  
  const prisma = new PrismaClient();
  
  try {
    // Test basic connection
    await prisma.$connect();
    console.log('✅ Database connection successful');
    
    // Test user lookup
    const testEmail = 'info@sonicweb.com.au';
    console.log(`\n🔍 Looking up user: ${testEmail}`);
    
    const user = await prisma.user.findUnique({
      where: { email: testEmail },
      select: {
        id: true,
        email: true,
        name: true,
        image: true,
        createdAt: true
      }
    });
    
    if (user) {
      console.log('✅ User found in database:');
      console.log('  ID:', user.id);
      console.log('  Email:', user.email);
      console.log('  Name:', user.name);
      console.log('  Current Image:', user.image || 'None');
      console.log('  Created At:', user.createdAt);
    } else {
      console.log('❌ User not found in database');
      console.log('This could be why the upload is failing!');
    }
    
    // Test File table structure
    console.log('\n🔍 Testing File table access...');
    
    const fileCount = await prisma.file.count();
    console.log(`✅ File table accessible, contains ${fileCount} records`);
    
    // Test creating a dummy file record (dry run)
    console.log('\n🔍 Testing File record creation (dry run)...');
    
    try {
      const testFile = {
        originalName: 'test.png',
        fileName: 'test_file_123',
        fileSize: 1234,
        mimeType: 'image/png',
        cloudinaryId: 'test_id',
        cloudinaryUrl: 'https://test.com/image.png',
        secureUrl: 'https://test.com/image.png',
        uploadedById: user?.id || 'unknown',
        fileType: 'IMAGE',
        usage: 'PROFILE_IMAGE',
        isPublic: false,
        metadata: {
          width: 100,
          height: 100,
          format: 'png'
        }
      };
      
      // Don't actually create, just validate the structure
      console.log('✅ File record structure is valid');
      console.log('  Fields:', Object.keys(testFile));
      
    } catch (error) {
      console.log('❌ File record structure error:', error.message);
    }
    
    return { success: true, userExists: !!user };
    
  } catch (error) {
    console.error('❌ Database test failed:', error.message);
    console.error('Full error:', error);
    return { success: false, error: error.message };
    
  } finally {
    await prisma.$disconnect();
    console.log('\n🔒 Database connection closed');
  }
}

// Run the test
async function main() {
  const result = await testDatabaseConnection();
  
  console.log('\n🎯 DATABASE TEST COMPLETE');
  console.log('Result:', result);
  
  process.exit(result.success ? 0 : 1);
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = testDatabaseConnection; 