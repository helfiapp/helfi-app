const fs = require('fs');
const FormData = require('form-data');

const BASE_URL = 'https://helfi-671kandn3-louie-veleskis-projects.vercel.app';

async function testProfileUpload() {
  console.log('🔍 Testing Profile Image Upload Workflow...\n');
  
  // Test 1: Check if profile image page is accessible
  console.log('1. Testing profile image page access...');
  try {
    const response = await fetch(`${BASE_URL}/profile/image`);
    console.log(`   Status: ${response.status}`);
    console.log(`   Headers: ${JSON.stringify(Object.fromEntries(response.headers))}`);
    
    if (response.status === 200) {
      console.log('   ✅ Profile image page accessible');
    } else {
      console.log('   ❌ Profile image page not accessible');
    }
  } catch (error) {
    console.log('   ❌ Error accessing profile image page:', error.message);
  }
  
  console.log('\n2. Testing session endpoint...');
  try {
    const response = await fetch(`${BASE_URL}/api/auth/session`);
    const data = await response.json();
    console.log(`   Status: ${response.status}`);
    console.log(`   Response: ${JSON.stringify(data)}`);
    
    if (data.user) {
      console.log('   ✅ User session found');
    } else {
      console.log('   ⚠️  No user session (expected for unauthenticated request)');
    }
  } catch (error) {
    console.log('   ❌ Error checking session:', error.message);
  }
  
  console.log('\n3. Testing profile upload without authentication...');
  try {
    // Create a simple test image (1x1 pixel PNG)
    const testImageBuffer = Buffer.from([
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
      0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xDE, 0x00, 0x00, 0x00,
      0x0C, 0x49, 0x44, 0x41, 0x54, 0x08, 0x99, 0x01, 0x01, 0x00, 0x00, 0x00,
      0xFF, 0xFF, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01, 0xE2, 0x21, 0xBC, 0x33,
      0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
    ]);
    
    const form = new FormData();
    form.append('image', testImageBuffer, {
      filename: 'test.png',
      contentType: 'image/png'
    });
    
    const response = await fetch(`${BASE_URL}/api/upload-profile-image`, {
      method: 'POST',
      body: form
    });
    
    const data = await response.json();
    console.log(`   Status: ${response.status}`);
    console.log(`   Response: ${JSON.stringify(data)}`);
    
    if (response.status === 401) {
      console.log('   ✅ Correctly rejected unauthenticated request');
    } else {
      console.log('   ❌ Unexpected response for unauthenticated request');
    }
  } catch (error) {
    console.log('   ❌ Error testing upload:', error.message);
  }
  
  console.log('\n4. Testing with various user agents...');
  const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Mobile/15E148 Safari/604.1'
  ];
  
  for (const userAgent of userAgents) {
    try {
      const response = await fetch(`${BASE_URL}/api/upload-profile-image`, {
        method: 'POST',
        headers: {
          'User-Agent': userAgent
        }
      });
      
      const data = await response.json();
      console.log(`   ${userAgent.includes('iPhone') ? '📱' : '💻'} ${response.status}: ${data.error || 'Success'}`);
    } catch (error) {
      console.log(`   ❌ Error with ${userAgent.includes('iPhone') ? 'mobile' : 'desktop'} user agent:`, error.message);
    }
  }
  
  console.log('\n🔍 Test complete! Check the server logs for detailed debugging information.');
}

// Run the test
testProfileUpload().catch(console.error); 