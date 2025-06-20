#!/usr/bin/env node

const https = require('https');
const querystring = require('querystring');

// Configuration
const BASE_URL = 'https://www.helfi.ai';
const TEST_EMAIL = 'info@sonicweb.com.au';
const TEST_PASSWORD = 'Snoodlenoodle1@';

// Test data to save
const ONBOARDING_DATA = {
  gender: 'male',
  weight: '78',
  height: '178',
  bodyType: 'mesomorph',
  exerciseFrequency: 'Every Day',
  exerciseTypes: ['Walking', 'Bike riding', 'Boxing'],
  goals: ['Erection Quality', 'Libido', 'Energy'],
  supplements: [
    { name: 'Vitamin D', dosage: '1000 IU', timing: ['morning'] }
  ],
  medications: [
    { name: 'Tadalafil', dosage: '5mg', timing: ['evening'] }
  ]
};

class AuthTester {
  constructor() {
    this.cookies = new Map();
    this.sessionToken = null;
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
      headers['Accept'] = 'application/json, text/plain, */*';
      
      if (data && method !== 'GET') {
        if (typeof data === 'object') {
          data = JSON.stringify(data);
          headers['Content-Type'] = 'application/json';
        }
        headers['Content-Length'] = Buffer.byteLength(data);
      }

      const options = {
        hostname: url.hostname,
        port: 443,
        path: url.pathname + url.search,
        method,
        headers
      };

      console.log(`\n🔍 ${method} ${url.pathname}`);
      console.log(`Headers:`, Object.keys(headers).join(', '));

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
      
      if (data && method !== 'GET') {
        req.write(data);
      }
      
      req.end();
    });
  }

  // Test 1: Check debug session endpoint
  async testSessionDebug() {
    console.log('\n🧪 TEST 1: Debug Session Status');
    
    const response = await this.makeRequest('GET', '/api/debug-session');
    
    console.log('Session Debug Result:', {
      authenticated: response.body.authenticated,
      sessionExists: !!response.body.debug?.session,
      cookiesFound: response.body.debug?.cookies !== 'No cookies',
      environment: response.body.debug?.environment
    });
    
    return response.body.authenticated;
  }

  // Test 2: Try to create a custom session directly
  async testCreateCustomSession() {
    console.log('\n🧪 TEST 2: Create Custom Session');
    
    // First, let's try to create a session manually for testing
    const sessionData = {
      email: TEST_EMAIL,
      name: 'Test User'
    };
    
    const response = await this.makeRequest('POST', '/api/auth/session', sessionData);
    
    console.log('Session Creation Result:', {
      success: response.body.success,
      error: response.body.error,
      hasSessionToken: !!response.body.sessionToken
    });
    
    if (response.body.sessionToken) {
      this.sessionToken = response.body.sessionToken;
      this.cookies.set('helfi-session', this.sessionToken);
      console.log(`✅ Custom session created: ${this.sessionToken.substring(0, 8)}...`);
      return true;
    }
    
    return false;
  }

  // Test 3: Try to save onboarding data
  async testSaveOnboardingData() {
    console.log('\n🧪 TEST 3: Save Onboarding Data');
    
    const response = await this.makeRequest('POST', '/api/user-data', ONBOARDING_DATA);
    
    console.log('Data Save Result:', {
      status: response.status,
      success: response.body.success,
      error: response.body.error,
      message: response.body.message
    });
    
    if (response.status === 401) {
      console.log('❌ AUTHENTICATION FAILED - This is the exact issue!');
      console.log('🔍 Debug info:', response.body);
      return false;
    }
    
    if (response.body.success) {
      console.log('✅ Data saved successfully!');
      return true;
    } else {
      console.log('❌ Data save failed:', response.body.error);
      return false;
    }
  }

  // Test 4: Try to retrieve saved data
  async testRetrieveData() {
    console.log('\n🧪 TEST 4: Retrieve Saved Data');
    
    const response = await this.makeRequest('GET', '/api/user-data');
    
    console.log('Data Retrieval Result:', {
      status: response.status,
      hasData: !!response.body.data,
      error: response.body.error
    });
    
    if (response.body.data) {
      console.log('✅ Data retrieved:', {
        gender: response.body.data.gender,
        weight: response.body.data.weight,
        height: response.body.data.height,
        goalsCount: response.body.data.goals?.length || 0,
        supplementsCount: response.body.data.supplements?.length || 0
      });
      return true;
    } else {
      console.log('❌ No data found or retrieval failed');
      return false;
    }
  }

  // Test 5: Test custom session authentication specifically
  async testCustomSessionAuth() {
    console.log('\n🧪 TEST 5: Custom Session Authentication');
    
    // Add Authorization header with session token
    const headers = {};
    if (this.sessionToken) {
      headers['Authorization'] = `Bearer ${this.sessionToken}`;
    }
    
    const response = await this.makeRequest('GET', '/api/debug-session', null, headers);
    
    console.log('Custom Session Auth Result:', {
      authenticated: response.body.authenticated,
      sessionFound: !!response.body.debug?.session,
      cookiesReceived: response.body.debug?.cookies !== 'No cookies'
    });
    
    return response.body.authenticated;
  }

  // Run all tests
  async runAllTests() {
    console.log('🚀 STARTING LIVE AUTHENTICATION TESTS');
    console.log('=====================================');
    
    try {
      // Test initial state
      const initialAuth = await this.testSessionDebug();
      
      if (!initialAuth) {
        console.log('❌ No initial authentication - this is expected');
        
        // Try to create custom session (simulating successful NextAuth)
        const sessionCreated = await this.testCreateCustomSession();
        
        if (!sessionCreated) {
          console.log('⚠️  Could not create custom session, trying manual session token...');
          
          // For testing, let's try with a manual session approach
          await this.testManualSessionCreation();
        }
        
        // Test if session works now
        await this.testCustomSessionAuth();
      }
      
      // Test data operations
      const dataSaved = await this.testSaveOnboardingData();
      
      if (dataSaved) {
        await this.testRetrieveData();
      }
      
      console.log('\n📊 TEST SUMMARY');
      console.log('================');
      
      if (dataSaved) {
        console.log('✅ SUCCESS: Cross-device sync issue appears to be FIXED!');
        console.log('✅ Custom session system is working correctly');
      } else {
        console.log('❌ FAILURE: Still getting authentication errors');
        console.log('❌ The issue persists - more investigation needed');
      }
      
    } catch (error) {
      console.error('💥 Test failed with error:', error.message);
    }
  }

  // Manual session creation for testing
  async testManualSessionCreation() {
    console.log('\n🔧 Creating manual test session...');
    
    // This simulates what would happen after successful NextAuth authentication
    // We'll create a session token manually for testing
    const crypto = require('crypto');
    const testSessionToken = crypto.randomBytes(32).toString('hex');
    
    this.sessionToken = testSessionToken;
    this.cookies.set('helfi-session', testSessionToken);
    
    console.log(`🧪 Test session token: ${testSessionToken.substring(0, 8)}...`);
  }
}

// Run the tests
const tester = new AuthTester();
tester.runAllTests().catch(console.error); 