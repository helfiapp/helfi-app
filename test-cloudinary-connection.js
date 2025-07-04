#!/usr/bin/env node

const https = require('https');

// Test configuration
const TEST_EMAIL = 'info@sonicweb.com.au';
const TEST_PASSWORD = 'Snoodlenoodle1@';
const BASE_URL = 'https://helfi-kapwd2f6w-louie-veleskis-projects.vercel.app';

class CloudinaryTester {
  constructor() {
    this.cookies = new Map();
  }

  // Make HTTP request with cookie handling
  async makeRequest(method, path, data = null, headers = {}) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, BASE_URL);
      
      // Add cookies to request
      const cookieHeader = Array.from(this.cookies.entries())
        .map(([name, value]) => `${name}=${value}`)
        .join('; ');
      
      if (cookieHeader) {
        headers['Cookie'] = cookieHeader;
      }
      
      headers['User-Agent'] = 'Node.js Test Client';
      
      if (data && method !== 'GET') {
        if (data instanceof FormData) {
          // FormData will set Content-Type automatically
        } else if (typeof data === 'object') {
          data = JSON.stringify(data);
          headers['Content-Type'] = 'application/json';
        }
        if (typeof data === 'string') {
          headers['Content-Length'] = Buffer.byteLength(data);
        }
      }

      const options = {
        hostname: url.hostname,
        port: 443,
        path: url.pathname + url.search,
        method,
        headers
      };

      console.log(`\n🔍 ${method} ${url.pathname}`);

      const req = https.request(options, (res) => {
        let body = '';
        
        // Handle cookies
        const setCookies = res.headers['set-cookie'];
        if (setCookies) {
          setCookies.forEach(cookie => {
            const [cookiePair] = cookie.split(';');
            const [name, value] = cookiePair.split('=');
            if (name && value) {
              this.cookies.set(name.trim(), value.trim());
              console.log(`🍪 Set cookie: ${name.trim()}`);
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

      req.on('error', reject);
      
      if (data && method !== 'GET' && typeof data === 'string') {
        req.write(data);
      }
      
      req.end();
    });
  }

  // Login to get authenticated session
  async login() {
    console.log('\n🔑 AUTHENTICATING...');
    
    const loginData = {
      email: TEST_EMAIL,
      password: TEST_PASSWORD
    };
    
    const response = await this.makeRequest('POST', '/api/auth/signin-direct', loginData);
    
    if (response.body.success) {
      console.log('✅ Login successful');
      return true;
    } else {
      console.log('❌ Login failed:', response.body.error);
      return false;
    }
  }

  // Test upload with detailed error capture
  async testUpload() {
    console.log('\n🧪 TESTING PROFILE UPLOAD...');
    
    try {
      // Create a simple test image
      const testImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
      const testImageBuffer = Buffer.from(testImageBase64, 'base64');
      
      // Create boundary for multipart/form-data
      const boundary = '----formdata-test-' + Math.random().toString(16);
      
      let formData = '';
      formData += `--${boundary}\r\n`;
      formData += 'Content-Disposition: form-data; name="image"; filename="test.png"\r\n';
      formData += 'Content-Type: image/png\r\n\r\n';
      
      // Convert buffer to binary string
      const binaryImage = testImageBuffer.toString('binary');
      formData += binaryImage;
      formData += `\r\n--${boundary}--\r\n`;
      
      const headers = {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': Buffer.byteLength(formData, 'binary')
      };
      
      // Make upload request
      const response = await this.makeRequest('POST', '/api/upload-profile-image', formData, headers);
      
      console.log('\n📋 UPLOAD RESPONSE:');
      console.log('Status:', response.status);
      console.log('Response:', response.body);
      
      if (response.status === 500) {
        console.log('\n🚨 500 ERROR DETAILS:');
        console.log('Raw response:', response.rawBody);
        
        if (response.body && response.body.error) {
          console.log('Error message:', response.body.error);
        }
      }
      
      return response;
      
    } catch (error) {
      console.error('❌ Upload test failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  // Run complete test
  async runTest() {
    console.log('🧪 STARTING CLOUDINARY CONNECTION TEST');
    console.log('=' .repeat(50));
    
    try {
      // Login first
      if (!await this.login()) {
        throw new Error('Authentication failed');
      }
      
      // Test upload
      const uploadResult = await this.testUpload();
      
      console.log('\n🎯 FINAL RESULTS:');
      console.log('=' .repeat(50));
      
      if (uploadResult.status === 200) {
        console.log('✅ UPLOAD SUCCESSFUL - Issue resolved!');
      } else if (uploadResult.status === 500) {
        console.log('❌ UPLOAD FAILED WITH 500 ERROR');
        console.log('This confirms the issue is in the server-side upload API');
      } else {
        console.log(`⚠️  UPLOAD FAILED WITH ${uploadResult.status} ERROR`);
      }
      
      return uploadResult;
      
    } catch (error) {
      console.error('🚨 TEST FAILED:', error.message);
      return { success: false, error: error.message };
    }
  }
}

// Run the test
async function main() {
  const tester = new CloudinaryTester();
  const result = await tester.runTest();
  
  console.log('\n🎯 TEST COMPLETE');
  process.exit(result.success ? 0 : 1);
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = CloudinaryTester; 