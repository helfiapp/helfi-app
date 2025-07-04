#!/usr/bin/env node

const https = require('https');

// Test with authentication session
async function testUploadWithAuth() {
  console.log('🔍 TESTING UPLOAD API WITH AUTHENTICATION...');
  console.log('=' .repeat(50));
  
  // Step 1: Login to get session cookie
  console.log('\n🔑 Step 1: Getting authentication cookie...');
  
  const loginData = JSON.stringify({
    email: 'info@sonicweb.com.au',
    password: 'Snoodlenoodle1@'
  });
  
  let sessionCookie = '';
  
  const loginResponse = await new Promise((resolve, reject) => {
    const options = {
      hostname: 'helfi.ai',
      port: 443,
      path: '/api/auth/signin-direct',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(loginData)
      }
    };
    
    const req = https.request(options, (res) => {
      let body = '';
      
      // Capture session cookie
      const setCookies = res.headers['set-cookie'];
      if (setCookies) {
        setCookies.forEach(cookie => {
          if (cookie.startsWith('__Secure-next-auth.session-token')) {
            sessionCookie = cookie.split(';')[0]; // Get just the cookie value
            console.log('✅ Session cookie captured');
          }
        });
      }
      
      res.on('data', chunk => {
        body += chunk;
      });
      
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          body: JSON.parse(body),
          cookie: sessionCookie
        });
      });
    });
    
    req.on('error', reject);
    req.write(loginData);
    req.end();
  });
  
  if (!loginResponse.body.success || !sessionCookie) {
    console.log('❌ Login failed or no session cookie');
    return;
  }
  
  console.log('✅ Login successful, session cookie obtained');
  
  // Step 2: Test upload with session cookie
  console.log('\n📤 Step 2: Testing upload with authentication...');
  
  // Create test image
  const testImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const testImageBuffer = Buffer.from(testImageBase64, 'base64');
  
  // Create multipart form data
  const boundary = '----formdata-' + Math.random().toString(16);
  let formData = '';
  formData += `--${boundary}\r\n`;
  formData += 'Content-Disposition: form-data; name="image"; filename="test.png"\r\n';
  formData += 'Content-Type: image/png\r\n\r\n';
  formData += testImageBuffer.toString('binary');
  formData += `\r\n--${boundary}--\r\n`;
  
  const uploadResponse = await new Promise((resolve, reject) => {
    const options = {
      hostname: 'helfi.ai',
      port: 443,
      path: '/api/upload-profile-image',
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': Buffer.byteLength(formData, 'binary'),
        'Cookie': sessionCookie,
        'User-Agent': 'Mozilla/5.0 (compatible; DebugBot/1.0)'
      }
    };
    
    const req = https.request(options, (res) => {
      let body = '';
      
      res.on('data', chunk => {
        body += chunk;
      });
      
      res.on('end', () => {
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
    
    req.on('error', reject);
    req.write(formData, 'binary');
    req.end();
  });
  
  // Step 3: Analyze the response
  console.log('\n📊 UPLOAD RESPONSE ANALYSIS:');
  console.log('Status Code:', uploadResponse.status);
  console.log('Response Body:', uploadResponse.body);
  
  if (uploadResponse.status === 500) {
    console.log('\n🚨 500 ERROR DETECTED:');
    console.log('Raw Response:', uploadResponse.rawBody);
    
    if (uploadResponse.body && typeof uploadResponse.body === 'object') {
      console.log('Error Message:', uploadResponse.body.error);
      console.log('Success Flag:', uploadResponse.body.success);
    }
    
    console.log('\n🔍 This is the actual server error causing the profile upload failure');
  } else if (uploadResponse.status === 200) {
    console.log('\n✅ UPLOAD SUCCESSFUL!');
    console.log('The profile upload issue has been resolved!');
  }
  
  return uploadResponse;
}

// Run the test
async function main() {
  try {
    const result = await testUploadWithAuth();
    console.log('\n🎯 TEST COMPLETE');
    
    if (result && result.status === 200) {
      console.log('🎉 PROFILE UPLOAD IS NOW WORKING!');
      process.exit(0);
    } else {
      console.log('❌ Profile upload still failing');
      process.exit(1);
    }
  } catch (error) {
    console.error('💥 Test failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = testUploadWithAuth; 