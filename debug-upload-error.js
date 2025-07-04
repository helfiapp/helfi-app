#!/usr/bin/env node

const https = require('https');
const fs = require('fs');
const path = require('path');

// Test configuration
const CONFIG = {
  baseUrl: 'helfi.ai',
  testEmail: 'info@sonicweb.com.au',
  testPassword: 'Snoodlenoodle1@'
};

class UploadErrorDebugger {
  constructor() {
    this.sessionCookie = '';
  }

  // Make authenticated HTTPS request
  async makeRequest(path, method = 'GET', data = null, headers = {}) {
    return new Promise((resolve, reject) => {
      // Add session cookie if we have one
      if (this.sessionCookie) {
        headers['Cookie'] = this.sessionCookie;
      }
      
      const options = {
        hostname: CONFIG.baseUrl,
        port: 443,
        path: path,
        method: method,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; DebugBot/1.0)',
          ...headers
        }
      };

      if (data && typeof data === 'string') {
        options.headers['Content-Length'] = Buffer.byteLength(data);
      }

      console.log(`\n🔍 ${method} https://${CONFIG.baseUrl}${path}`);

      const req = https.request(options, (res) => {
        let body = '';
        
        // Capture session cookies
        const setCookies = res.headers['set-cookie'];
        if (setCookies) {
          setCookies.forEach(cookie => {
            if (cookie.startsWith('__Secure-next-auth.session-token') || 
                cookie.startsWith('next-auth.session-token')) {
              this.sessionCookie = cookie.split(';')[0];
              console.log('✅ Session cookie captured');
            }
          });
        }

        res.on('data', chunk => {
          body += chunk;
        });

        res.on('end', () => {
          console.log(`📊 Status: ${res.statusCode}`);
          
          let parsedBody;
          try {
            parsedBody = JSON.parse(body);
          } catch (e) {
            parsedBody = body;
          }

          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: parsedBody,
            rawBody: body
          });
        });
      });

      req.on('error', (error) => {
        console.error('❌ Request error:', error.message);
        reject(error);
      });

      if (data) {
        req.write(data);
      }

      req.end();
    });
  }

  // Step 1: Login to get authenticated session
  async login() {
    console.log('\n🔑 STEP 1: Authenticating...');
    
    const loginData = JSON.stringify({
      email: CONFIG.testEmail,
      password: CONFIG.testPassword
    });
    
    const headers = {
      'Content-Type': 'application/json'
    };
    
    const response = await this.makeRequest('/api/auth/signin-direct', 'POST', loginData, headers);
    
    if (response.body.success) {
      console.log('✅ Authentication successful');
      console.log('📋 User info:', response.body.user);
      return true;
    } else {
      console.log('❌ Authentication failed:', response.body.error);
      return false;
    }
  }

  // Step 2: Test upload with detailed error capture
  async testUpload() {
    console.log('\n📤 STEP 2: Testing file upload...');
    
    try {
      // Create a minimal test image (1x1 pixel PNG)
      const testImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
      const testImageBuffer = Buffer.from(testImageBase64, 'base64');
      
      // Create multipart form data
      const boundary = '----formdata-upload-' + Date.now();
      let formData = '';
      
      // Add image field
      formData += `--${boundary}\r\n`;
      formData += 'Content-Disposition: form-data; name="image"; filename="test.png"\r\n';
      formData += 'Content-Type: image/png\r\n\r\n';
      formData += testImageBuffer.toString('binary');
      formData += `\r\n--${boundary}--\r\n`;
      
      const headers = {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': Buffer.byteLength(formData, 'binary')
      };
      
      console.log('📋 Request details:');
      console.log('  Image size:', testImageBuffer.length, 'bytes');
      console.log('  Content-Type:', headers['Content-Type']);
      console.log('  Has session cookie:', !!this.sessionCookie);
      
             const response = await this.makeRequest('/api/upload-profile-image', 'POST', formData, headers);
      
      console.log('\n📊 UPLOAD RESPONSE:');
      console.log('Status:', response.status);
      console.log('Headers:', response.headers);
      console.log('Body:', response.body);
      
      if (response.status === 500) {
        console.log('\n🚨 500 ERROR ANALYSIS:');
        console.log('Raw response:', response.rawBody);
        
        // Try to extract more details
        if (response.body && typeof response.body === 'object') {
          console.log('Error details:');
          console.log('  Success:', response.body.success);
          console.log('  Error message:', response.body.error);
          
          // Check if it's the generic "Upload failed" message
          if (response.body.error === 'Upload failed') {
            console.log('\n💡 This is the generic error message from the catch block');
            console.log('   The actual error is being caught and logged server-side');
            console.log('   We need to check the server logs for the real error');
          }
        }
        
        return { success: false, error: response.body };
      } else if (response.status === 200) {
        console.log('\n✅ UPLOAD SUCCESSFUL!');
        return { success: true, data: response.body };
      } else {
        console.log(`\n⚠️  Unexpected status: ${response.status}`);
        return { success: false, error: response.body };
      }
      
    } catch (error) {
      console.error('❌ Upload test failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  // Step 3: Test Cloudinary configuration
  async testCloudinaryConfig() {
    console.log('\n🔍 STEP 3: Testing Cloudinary configuration...');
    
    try {
      // Make a test request to a Cloudinary endpoint to check if credentials work
      const testResponse = await this.makeRequest('/api/debug-cloudinary', 'GET');
      
      if (testResponse.status === 404) {
        console.log('⚠️  Debug endpoint not available (expected)');
        return { success: true, message: 'No debug endpoint available' };
      } else {
        console.log('📋 Cloudinary test response:', testResponse.body);
        return { success: true, data: testResponse.body };
      }
      
    } catch (error) {
      console.log('❌ Cloudinary test failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  // Run complete debug test
  async runDebugTest() {
    console.log('🧪 STARTING UPLOAD ERROR DEBUG TEST');
    console.log('=' .repeat(50));
    
    try {
      // Step 1: Login
      const loginSuccess = await this.login();
      if (!loginSuccess) {
        throw new Error('Authentication failed');
      }
      
      // Step 2: Test upload
      const uploadResult = await this.testUpload();
      
      // Step 3: Test Cloudinary config
      const cloudinaryResult = await this.testCloudinaryConfig();
      
      console.log('\n🎯 FINAL ANALYSIS:');
      console.log('=' .repeat(50));
      
      if (uploadResult.success) {
        console.log('✅ UPLOAD WORKING - Issue has been resolved!');
      } else {
        console.log('❌ UPLOAD STILL FAILING');
        console.log('Authentication: ✅ Working');
        console.log('Upload API: ❌ Returning 500 error');
        
        if (uploadResult.error && uploadResult.error.error === 'Upload failed') {
          console.log('\n🔍 ROOT CAUSE ANALYSIS:');
          console.log('The API is returning a generic "Upload failed" error message.');
          console.log('This means the actual error is being caught by the catch block.');
          console.log('The real error details are logged server-side.');
          console.log('\n💡 NEXT STEPS:');
          console.log('1. Check server logs for the actual error details');
          console.log('2. The error could be in:');
          console.log('   - Cloudinary upload process');
          console.log('   - Database operations (File.create or User.update)');
          console.log('   - Buffer processing');
          console.log('   - Environment variable access');
        }
      }
      
      return {
        authentication: loginSuccess,
        upload: uploadResult,
        cloudinary: cloudinaryResult
      };
      
    } catch (error) {
      console.error('🚨 DEBUG TEST FAILED:', error.message);
      return { success: false, error: error.message };
    }
  }
}

// Run the debug test
async function main() {
  const tester = new UploadErrorDebugger();
  const result = await tester.runDebugTest();
  
  console.log('\n🎯 DEBUG TEST COMPLETE');
  console.log('Full results:', JSON.stringify(result, null, 2));
  
  process.exit(result.authentication && result.upload.success ? 0 : 1);
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = UploadErrorDebugger; 