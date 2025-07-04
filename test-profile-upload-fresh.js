#!/usr/bin/env node

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// Test configuration
const CONFIG = {
  baseUrl: 'https://helfi.ai',
  adminPassword: 'HealthBeta2024!',
  testEmail: 'info@sonicweb.com.au',
  testPassword: 'Snoodlenoodle1@',
  screenshotDir: './screenshots',
  headless: false, // Set to true for headless mode
  timeout: 30000
};

class ProfileUploadTester {
  constructor() {
    this.browser = null;
    this.page = null;
    this.testResults = [];
  }

  // Initialize browser with incognito mode
  async initBrowser() {
    console.log('🚀 Starting browser in incognito mode...');
    
    // Create screenshots directory
    if (!fs.existsSync(CONFIG.screenshotDir)) {
      fs.mkdirSync(CONFIG.screenshotDir);
    }
    
    // Launch browser in incognito mode
    this.browser = await chromium.launch({
      headless: CONFIG.headless,
      args: ['--incognito'] // Force incognito mode
    });
    
    // Create new incognito context
    const context = await this.browser.newContext({
      viewport: { width: 1280, height: 720 },
      ignoreHTTPSErrors: true
    });
    
    this.page = await context.newPage();
    
    // Enable console logging
    this.page.on('console', msg => {
      console.log(`📋 CONSOLE: ${msg.text()}`);
    });
    
    // Monitor network requests
    this.page.on('request', request => {
      if (request.url().includes('/api/')) {
        console.log(`🌐 API REQUEST: ${request.method()} ${request.url()}`);
      }
    });
    
    // Monitor network responses
    this.page.on('response', response => {
      if (response.url().includes('/api/')) {
        console.log(`📡 API RESPONSE: ${response.status()} ${response.url()}`);
      }
    });
    
    console.log('✅ Browser initialized in incognito mode');
  }

  // Step 1: Navigate to admin portal
  async navigateToAdminPortal() {
    console.log('\n🔍 STEP 1: Navigate to admin portal');
    
    try {
      await this.page.goto(`${CONFIG.baseUrl}/healthapp`, { 
        waitUntil: 'networkidle' 
      });
      
      await this.page.screenshot({ 
        path: `${CONFIG.screenshotDir}/01-admin-portal.png`,
        fullPage: true 
      });
      
      console.log('✅ Successfully navigated to /healthapp');
      return true;
      
    } catch (error) {
      console.error('❌ Failed to navigate to admin portal:', error.message);
      return false;
    }
  }

  // Step 2: Enter admin password
  async enterAdminPassword() {
    console.log('\n🔍 STEP 2: Enter admin password');
    
    try {
      // Look for password input field
      const passwordInput = await this.page.locator('input[type="password"]').first();
      
      if (await passwordInput.isVisible()) {
        await passwordInput.fill(CONFIG.adminPassword);
        console.log('✅ Admin password entered');
        
        // Look for submit button
        const submitButton = await this.page.locator('button[type="submit"]').first();
        if (await submitButton.isVisible()) {
          await submitButton.click();
          console.log('✅ Admin password submitted');
        } else {
          // Try pressing Enter
          await passwordInput.press('Enter');
          console.log('✅ Admin password submitted via Enter');
        }
        
        // Wait for navigation
        await this.page.waitForTimeout(2000);
        
        await this.page.screenshot({ 
          path: `${CONFIG.screenshotDir}/02-after-admin-password.png`,
          fullPage: true 
        });
        
        return true;
      } else {
        console.log('❌ Admin password field not found');
        return false;
      }
      
    } catch (error) {
      console.error('❌ Failed to enter admin password:', error.message);
      return false;
    }
  }

  // Step 3: Login with email
  async loginWithEmail() {
    console.log('\n🔍 STEP 3: Login with email');
    
    try {
      // Wait for email login form
      await this.page.waitForTimeout(2000);
      
      // Look for email input
      const emailInput = await this.page.locator('input[type="email"]').first();
      
      if (await emailInput.isVisible()) {
        await emailInput.fill(CONFIG.testEmail);
        console.log('✅ Email entered');
        
        // Look for password input
        const passwordInput = await this.page.locator('input[type="password"]').first();
        
        if (await passwordInput.isVisible()) {
          await passwordInput.fill(CONFIG.testPassword);
          console.log('✅ Password entered');
          
          // Submit login
          const loginButton = await this.page.locator('button[type="submit"]').first();
          if (await loginButton.isVisible()) {
            await loginButton.click();
            console.log('✅ Login submitted');
          } else {
            await passwordInput.press('Enter');
            console.log('✅ Login submitted via Enter');
          }
          
          // Wait for authentication
          await this.page.waitForTimeout(3000);
          
          await this.page.screenshot({ 
            path: `${CONFIG.screenshotDir}/03-after-email-login.png`,
            fullPage: true 
          });
          
          return true;
        } else {
          console.log('❌ Password field not found');
          return false;
        }
      } else {
        console.log('❌ Email field not found');
        return false;
      }
      
    } catch (error) {
      console.error('❌ Failed to login with email:', error.message);
      return false;
    }
  }

  // Step 4: Navigate to profile upload
  async navigateToProfileUpload() {
    console.log('\n🔍 STEP 4: Navigate to profile upload');
    
    try {
      // Navigate to profile image upload page
      await this.page.goto(`${CONFIG.baseUrl}/profile/image`, { 
        waitUntil: 'networkidle' 
      });
      
      await this.page.screenshot({ 
        path: `${CONFIG.screenshotDir}/04-profile-upload-page.png`,
        fullPage: true 
      });
      
      console.log('✅ Successfully navigated to profile upload page');
      return true;
      
    } catch (error) {
      console.error('❌ Failed to navigate to profile upload:', error.message);
      return false;
    }
  }

  // Step 5: Test file upload
  async testFileUpload() {
    console.log('\n🔍 STEP 5: Test file upload');
    
    try {
      // Create a test image file
      const testImagePath = path.join(__dirname, 'test-image.jpg');
      
      // Generate a simple test image (1x1 pixel)
      const testImageBuffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
      fs.writeFileSync(testImagePath, testImageBuffer);
      
      // Look for the "Choose Photo" label (the file input is hidden)
      const choosePhotoLabel = await this.page.locator('label').filter({ hasText: 'Choose Photo' }).first();
      
      if (await choosePhotoLabel.isVisible()) {
        console.log('✅ "Choose Photo" label found');
        
        // Get the hidden file input element
        const fileInput = await this.page.locator('input#file-upload[type="file"]').first();
        
        if (fileInput) {
          console.log('✅ Hidden file input found');
          
          // Upload the test image to the hidden input
          await fileInput.setInputFiles(testImagePath);
          console.log('✅ Test image uploaded to hidden input');
          
          // Wait a moment for any preview to load and auto-upload to trigger
          await this.page.waitForTimeout(3000);
          
          await this.page.screenshot({ 
            path: `${CONFIG.screenshotDir}/05-after-file-selection.png`,
            fullPage: true 
          });
          
          // Wait for the upload to complete (since it's auto-upload)
          console.log('🔄 Waiting for auto-upload to complete...');
          
          // Monitor for upload completion - look for success indicators
          try {
            // Wait for the upload request
            const responsePromise = this.page.waitForResponse(response => 
              response.url().includes('/api/upload-profile-image'), 
              { timeout: 10000 }
            );
            
            const response = await responsePromise;
            console.log(`📡 Upload response: ${response.status()}`);
            
            // Get response body
            const responseBody = await response.json().catch(() => response.text());
            console.log('📋 Response body:', responseBody);
            
            // Wait for any UI updates after upload
            await this.page.waitForTimeout(3000);
            
            await this.page.screenshot({ 
              path: `${CONFIG.screenshotDir}/06-after-upload-attempt.png`,
              fullPage: true 
            });
            
            return {
              success: response.status() === 200,
              status: response.status(),
              response: responseBody
            };
            
          } catch (error) {
            console.error('❌ Upload request failed or timed out:', error.message);
            
            await this.page.screenshot({ 
              path: `${CONFIG.screenshotDir}/06-upload-error.png`,
              fullPage: true 
            });
            
            // Check if there are any error messages on the page
            const errorElements = await this.page.locator('text=/failed|error|try again/i').all();
            const errorMessages = [];
            for (const element of errorElements) {
              const text = await element.textContent();
              if (text) errorMessages.push(text);
            }
            
            return {
              success: false,
              error: error.message,
              pageErrors: errorMessages
            };
          }
          
        } else {
          console.log('❌ Hidden file input not found');
          return { success: false, error: 'Hidden file input not found' };
        }
        
      } else {
        console.log('❌ "Choose Photo" label not found');
        
        // Let's see what's actually on the page
        await this.page.screenshot({ 
          path: `${CONFIG.screenshotDir}/05-no-choose-photo-button.png`,
          fullPage: true 
        });
        
        // Look for any upload-related elements
        const uploadElements = await this.page.locator('text=/upload|photo|image|choose/i').all();
        const foundElements = [];
        for (const element of uploadElements) {
          const text = await element.textContent();
          if (text) foundElements.push(text);
        }
        
        return { 
          success: false, 
          error: 'Choose Photo label not found',
          foundElements: foundElements
        };
      }
      
    } catch (error) {
      console.error('❌ File upload test failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  // Run complete test
  async runCompleteTest() {
    console.log('🧪 STARTING COMPLETE PROFILE UPLOAD TEST');
    console.log('=' .repeat(50));
    
    try {
      // Initialize browser
      await this.initBrowser();
      
      // Step 1: Navigate to admin portal
      if (!await this.navigateToAdminPortal()) {
        throw new Error('Failed to navigate to admin portal');
      }
      
      // Step 2: Enter admin password
      if (!await this.enterAdminPassword()) {
        throw new Error('Failed to enter admin password');
      }
      
      // Step 3: Login with email
      if (!await this.loginWithEmail()) {
        throw new Error('Failed to login with email');
      }
      
      // Step 4: Navigate to profile upload
      if (!await this.navigateToProfileUpload()) {
        throw new Error('Failed to navigate to profile upload');
      }
      
      // Step 5: Test file upload
      const uploadResult = await this.testFileUpload();
      
      console.log('\n📊 FINAL RESULTS:');
      console.log('=' .repeat(50));
      
      if (uploadResult.success) {
        console.log('✅ PROFILE UPLOAD SUCCESSFUL');
        console.log(`Status: ${uploadResult.status}`);
        console.log(`Response:`, uploadResult.response);
      } else {
        console.log('❌ PROFILE UPLOAD FAILED');
        console.log(`Error: ${uploadResult.error}`);
        if (uploadResult.status) {
          console.log(`Status: ${uploadResult.status}`);
        }
        if (uploadResult.response) {
          console.log(`Response:`, uploadResult.response);
        }
      }
      
      console.log(`\n📸 Screenshots saved to: ${CONFIG.screenshotDir}`);
      
      return uploadResult;
      
    } catch (error) {
      console.error('🚨 TEST FAILED:', error.message);
      
      await this.page.screenshot({ 
        path: `${CONFIG.screenshotDir}/error-final.png`,
        fullPage: true 
      });
      
      return { success: false, error: error.message };
      
    } finally {
      if (this.browser) {
        await this.browser.close();
        console.log('🔒 Browser closed');
      }
    }
  }
}

// Run the test
async function main() {
  const tester = new ProfileUploadTester();
  const result = await tester.runCompleteTest();
  
  console.log('\n🎯 TEST COMPLETE');
  console.log('Result:', result);
  
  process.exit(result.success ? 0 : 1);
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = ProfileUploadTester; 