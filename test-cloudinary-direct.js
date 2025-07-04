#!/usr/bin/env node

// Use the pulled environment variables
const fs = require('fs');
const path = require('path');

function loadEnvFile(filePath) {
  try {
    const envFile = fs.readFileSync(filePath, 'utf8');
    const envVars = {};
    
    envFile.split('\n').forEach(line => {
      line = line.trim();
      if (line && !line.startsWith('#')) {
        const [key, ...valueParts] = line.split('=');
        if (key && valueParts.length > 0) {
          // Remove quotes and trim whitespace/newlines
          let value = valueParts.join('=').replace(/^["']|["']$/g, '').trim();
          // Remove any remaining newline characters
          value = value.replace(/\\n/g, '').replace(/\r?\n/g, '');
          envVars[key] = value;
        }
      }
    });
    
    return envVars;
  } catch (error) {
    console.log(`❌ Failed to load ${filePath}:`, error.message);
    return {};
  }
}

async function testCloudinaryDirect() {
  console.log('🧪 TESTING CLOUDINARY DIRECT CONNECTION...');
  console.log('=' .repeat(50));
  
  try {
    // Load environment variables from .env.production (has Cloudinary vars)
    console.log('\n🔍 Loading environment variables from .env.production...');
    const envVars = loadEnvFile('.env.production');
    
    // Check if cloudinary module is available
    let cloudinary;
    try {
      cloudinary = require('cloudinary').v2;
      console.log('✅ Cloudinary module loaded');
    } catch (error) {
      console.log('❌ Cloudinary module not available:', error.message);
      console.log('Installing cloudinary...');
      const { execSync } = require('child_process');
      execSync('npm install cloudinary', { stdio: 'inherit' });
      cloudinary = require('cloudinary').v2;
      console.log('✅ Cloudinary module installed and loaded');
    }
    
    // Get Cloudinary configuration
    const cloudName = envVars.CLOUDINARY_CLOUD_NAME;
    const apiKey = envVars.CLOUDINARY_API_KEY;
    const apiSecret = envVars.CLOUDINARY_API_SECRET;
    
    console.log('Cloud Name:', cloudName ? '✅ Retrieved' : '❌ Missing');
    console.log('API Key:', apiKey ? '✅ Retrieved' : '❌ Missing');
    console.log('API Secret:', apiSecret ? '✅ Retrieved' : '❌ Missing');
    
    if (!cloudName || !apiKey || !apiSecret) {
      throw new Error('Missing Cloudinary environment variables from .env.production');
    }
    
    // Show actual values (first/last few characters for security)
    console.log('\n📋 Cloudinary Configuration:');
    console.log('Cloud Name:', cloudName);
    console.log('API Key:', apiKey ? `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}` : 'Missing');
    console.log('API Secret:', apiSecret ? `${apiSecret.slice(0, 4)}...${apiSecret.slice(-4)}` : 'Missing');
    
    // Configure Cloudinary (same as in the API)
    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
    });
    
    console.log('✅ Cloudinary configured');
    
    // Test basic connection with ping
    console.log('\n🔍 Testing Cloudinary API connection...');
    
    try {
      const pingResult = await cloudinary.api.ping();
      console.log('✅ Cloudinary API ping successful:', pingResult);
    } catch (pingError) {
      console.log('❌ Cloudinary API ping failed:', pingError.message);
      console.log('Error details:', pingError);
      throw pingError;
    }
    
    // Create test image buffer (same as in the API)
    console.log('\n🔍 Creating test image...');
    const testImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    const buffer = Buffer.from(testImageBase64, 'base64');
    console.log('✅ Test image created, size:', buffer.length, 'bytes');
    
    // Test upload (exact same configuration as in the API)
    console.log('\n🔍 Testing Cloudinary upload...');
    console.log('Using same configuration as API:');
    console.log('  - folder: helfi/profile-images');
    console.log('  - transformation: 400x400 crop fill gravity face');
    console.log('  - quality: auto, format: auto');
    
    const uploadResult = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        {
          resource_type: 'image',
          folder: 'helfi/profile-images',
          public_id: `test_user_${Date.now()}`,
          transformation: [
            { width: 400, height: 400, crop: 'fill', gravity: 'face' },
            { quality: 'auto', fetch_format: 'auto' }
          ],
          invalidate: true,
          overwrite: true
        },
        (error, result) => {
          if (error) {
            console.error('❌ Cloudinary upload error:', error);
            reject(error);
          } else {
            console.log('✅ Cloudinary upload successful');
            resolve(result);
          }
        }
      ).end(buffer);
    });
    
    console.log('\n📋 UPLOAD RESULT:');
    console.log('Public ID:', uploadResult.public_id);
    console.log('Secure URL:', uploadResult.secure_url);
    console.log('Bytes:', uploadResult.bytes);
    console.log('Width:', uploadResult.width);
    console.log('Height:', uploadResult.height);
    console.log('Format:', uploadResult.format);
    
    // Test cleanup (delete the test image)
    console.log('\n🔍 Cleaning up test image...');
    try {
      await cloudinary.uploader.destroy(uploadResult.public_id);
      console.log('✅ Test image cleaned up');
    } catch (cleanupError) {
      console.log('⚠️  Cleanup failed (not critical):', cleanupError.message);
    }
    
    return { success: true, uploadResult };
    
  } catch (error) {
    console.error('❌ Cloudinary test failed:', error.message);
    console.error('Full error:', error);
    
    // Log specific error types
    if (error.http_code) {
      console.error('HTTP Code:', error.http_code);
    }
    if (error.error && error.error.message) {
      console.error('Cloudinary Error:', error.error.message);
    }
    
    return { success: false, error: error.message };
  }
}

// Run the test
async function main() {
  const result = await testCloudinaryDirect();
  
  console.log('\n🎯 CLOUDINARY DIRECT TEST COMPLETE');
  console.log('Result:', result.success ? 'SUCCESS' : 'FAILED');
  
  if (result.success) {
    console.log('🎉 Cloudinary is working correctly!');
    console.log('The 500 error must be coming from something else in the API.');
  } else {
    console.log('🚨 Cloudinary connection failed!');
    console.log('This is likely the root cause of the 500 error.');
  }
  
  process.exit(result.success ? 0 : 1);
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = testCloudinaryDirect; 