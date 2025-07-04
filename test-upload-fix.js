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
  screenshotDir: './test-screenshots',
  headless: false,
  timeout: 30000
};

class UploadFixTester {
  constructor() {
    this.browser = null;
    this.page = null;
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
      args: ['--incognito']
    });
    
    // Create new incognito context
    const context = await this.browser.newContext({
      viewport: { width: 1280, height: 720 },
      ignoreHTTPSErrors: true
    });
    
    this.page = await context.newPage();
    
    // Enable console and network monitoring
    this.page.on('console', msg => {
      console.log(`📋 CONSOLE: ${msg.text()}`);
    });
    
    this.page.on('response', response => {
      if (response.url().includes('/api/upload-profile-image')) {
        console.log(`📡 UPLOAD API RESPONSE: ${response.status()} ${response.url()}`);
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
      const passwordInput = await this.page.locator('input[type="password"]').first();
      
      if (await passwordInput.isVisible()) {
        await passwordInput.fill(CONFIG.adminPassword);
        console.log('✅ Admin password entered');
        
        const submitButton = await this.page.locator('button[type="submit"]').first();
        if (await submitButton.isVisible()) {
          await submitButton.click();
        } else {
          await passwordInput.press('Enter');
        }
        
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
      await this.page.waitForTimeout(2000);
      
      const emailInput = await this.page.locator('input[type="email"]').first();
      
      if (await emailInput.isVisible()) {
        await emailInput.fill(CONFIG.testEmail);
        console.log('✅ Email entered');
        
        const passwordInput = await this.page.locator('input[type="password"]').first();
        
        if (await passwordInput.isVisible()) {
          await passwordInput.fill(CONFIG.testPassword);
          console.log('✅ Password entered');
          
          const loginButton = await this.page.locator('button[type="submit"]').first();
          if (await loginButton.isVisible()) {
            await loginButton.click();
          } else {
            await passwordInput.press('Enter');
          }
          
          await this.page.waitForTimeout(3000);
          
          await this.page.screenshot({ 
            path: `${CONFIG.screenshotDir}/03-after-email-login.png`,
            fullPage: true 
          });
          
          return true;
        }
      }
      
      console.log('❌ Email/password fields not found');
      return false;
      
    } catch (error) {
      console.error('❌ Failed to login with email:', error.message);
      return false;
    }
  }

  // Step 4: Navigate to profile upload
  async navigateToProfileUpload() {
    console.log('\n🔍 STEP 4: Navigate to profile upload');
    
    try {
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
      const testImagePath = path.join(__dirname, 'test-upload-image.jpg');
      const testImageBuffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
      fs.writeFileSync(testImagePath, testImageBuffer);
      
      // Find the hidden file input
      const fileInput = await this.page.locator('input#file-upload[type="file"]').first();
      
      if (await fileInput.count() > 0) {
        console.log('✅ File input found');
        
        // Upload the test image
        await fileInput.setInputFiles(testImagePath);
        console.log('✅ Test image selected');
        
        // Wait for upload to process
        await this.page.waitForTimeout(5000);
        
        await this.page.screenshot({ 
          path: `${CONFIG.screenshotDir}/05-after-upload-attempt.png`,
          fullPage: true 
        });
        
        // Check for success or error messages
        const successMessages = await this.page.locator('text=/uploaded successfully|upload complete|profile updated/i').all();
        const errorMessages = await this.page.locator('text=/failed|error|try again/i').all();
        
        let result = { success: false, messages: [] };
        
        if (successMessages.length > 0) {
          console.log('✅ Success messages found on page');
          result.success = true;
          for (const msg of successMessages) {
            const text = await msg.textContent();
            if (text) result.messages.push(`SUCCESS: ${text}`);
          }
        }
        
        if (errorMessages.length > 0) {
          console.log('❌ Error messages found on page');
          result.success = false;
          for (const msg of errorMessages) {
            const text = await msg.textContent();
            if (text) result.messages.push(`ERROR: ${text}`);
          }
        }
        
        // Clean up test file
        if (fs.existsSync(testImagePath)) {
          fs.unlinkSync(testImagePath);
        }
        
        return result;
        
      } else {
        console.log('❌ File input not found');
        return { success: false, error: 'File input not found' };
      }
      
    } catch (error) {
      console.error('❌ File upload test failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  // Run complete test
  async runCompleteTest() {
    console.log('🧪 TESTING UPLOAD FIX AS REAL USER');
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
      
      console.log('\n🎯 FINAL TEST RESULTS:');
      console.log('=' .repeat(50));
      
      if (uploadResult.success) {
        console.log('🎉 UPLOAD FIX SUCCESSFUL!');
        console.log('✅ Profile image upload is now working');
        console.log('Messages:', uploadResult.messages);
      } else {
        console.log('❌ UPLOAD FIX FAILED');
        console.log('❌ Profile image upload is still broken');
        if (uploadResult.error) {
          console.log('Error:', uploadResult.error);
        }
        if (uploadResult.messages) {
          console.log('Messages:', uploadResult.messages);
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
  const tester = new UploadFixTester();
  const result = await tester.runCompleteTest();
  
  console.log('\n🎯 UPLOAD FIX TEST COMPLETE');
  
  if (result.success) {
    console.log('🎉 SUCCESS: The trim() fix worked! Upload is now functional.');
    process.exit(0);
  } else {
    console.log('❌ FAILURE: The trim() fix did not resolve the issue.');
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = UploadFixTester; 