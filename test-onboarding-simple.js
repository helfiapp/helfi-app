const { chromium } = require('playwright');

async function testOnboardingCompletion() {
  console.log('🚀 STARTING SIMPLIFIED ONBOARDING COMPLETION TEST');
  
  // Launch browser
  const browser = await chromium.launch({ 
    headless: false, // Show browser for debugging
    slowMo: 500 // Slow down for observation
  });
  
  const context = await browser.newContext();
  const page = await context.newPage();
  
  // Capture console logs
  const consoleLogs = [];
  page.on('console', msg => {
    const logEntry = {
      type: msg.type(),
      text: msg.text(),
      timestamp: new Date().toISOString()
    };
    consoleLogs.push(logEntry);
    console.log(`[${logEntry.timestamp}] ${msg.type().toUpperCase()}: ${msg.text()}`);
  });
  
  // Capture network requests
  const networkLogs = [];
  page.on('request', request => {
    if (request.url().includes('/api/')) {
      networkLogs.push({
        url: request.url(),
        method: request.method(),
        timestamp: new Date().toISOString(),
        type: 'request'
      });
    }
  });
  
  page.on('response', response => {
    if (response.url().includes('/api/')) {
      networkLogs.push({
        url: response.url(),
        status: response.status(),
        timestamp: new Date().toISOString(),
        type: 'response'
      });
    }
  });
  
  try {
    console.log('📱 Navigating directly to onboarding...');
    await page.goto('https://helfi.ai/onboarding');
    await page.waitForLoadState('networkidle');
    
    // Wait a bit to see what happens
    await page.waitForTimeout(3000);
    
    // Take screenshot of current state
    await page.screenshot({ path: 'onboarding-current-state.png' });
    
    // Check if we're on the onboarding page or redirected
    const currentUrl = page.url();
    console.log('Current URL:', currentUrl);
    
    if (currentUrl.includes('onboarding')) {
      console.log('✅ Successfully on onboarding page');
      
      // Look for any elements that might indicate the page state
      const pageText = await page.textContent('body');
      console.log('Page contains onboarding elements:', pageText.includes('gender') || pageText.includes('Continue') || pageText.includes('Male'));
      
      // Try to find and click the "Confirm & Begin" button if it exists
      const confirmButton = await page.locator('button:has-text("Confirm & Begin")');
      const isConfirmVisible = await confirmButton.isVisible().catch(() => false);
      
      if (isConfirmVisible) {
        console.log('⏳ FOUND CONFIRM & BEGIN BUTTON - MEASURING PERFORMANCE...');
        const startTime = Date.now();
        
        await confirmButton.click();
        
        // Wait for redirect to dashboard
        console.log('🔄 Waiting for redirect to dashboard...');
        await page.waitForURL('**/dashboard', { timeout: 30000 });
        
        const endTime = Date.now();
        const totalTime = endTime - startTime;
        
        console.log('⏱️ PERFORMANCE RESULTS:');
        console.log(`📊 Total time from click to dashboard: ${totalTime}ms`);
        
        // Wait for dashboard to fully load
        await page.waitForLoadState('networkidle');
        
        // Take screenshot of final state
        await page.screenshot({ path: 'onboarding-completion-result.png' });
        
      } else {
        console.log('ℹ️ Confirm & Begin button not visible - might need to complete onboarding first');
        
        // Try to navigate to the review step directly
        await page.goto('https://helfi.ai/onboarding?step=10');
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2000);
        
        const reviewButton = await page.locator('button:has-text("Confirm & Begin")');
        const isReviewVisible = await reviewButton.isVisible().catch(() => false);
        
        if (isReviewVisible) {
          console.log('⏳ FOUND CONFIRM & BEGIN BUTTON ON REVIEW STEP - MEASURING PERFORMANCE...');
          const startTime = Date.now();
          
          await reviewButton.click();
          
          // Wait for redirect to dashboard
          console.log('🔄 Waiting for redirect to dashboard...');
          await page.waitForURL('**/dashboard', { timeout: 30000 });
          
          const endTime = Date.now();
          const totalTime = endTime - startTime;
          
          console.log('⏱️ PERFORMANCE RESULTS:');
          console.log(`📊 Total time from click to dashboard: ${totalTime}ms`);
          
          // Wait for dashboard to fully load
          await page.waitForLoadState('networkidle');
          
          // Take screenshot of final state
          await page.screenshot({ path: 'onboarding-completion-result.png' });
        } else {
          console.log('❌ Could not find Confirm & Begin button');
          await page.screenshot({ path: 'onboarding-no-button.png' });
        }
      }
      
    } else {
      console.log('⚠️ Redirected to:', currentUrl);
      if (currentUrl.includes('signin')) {
        console.log('🔑 Redirected to login - user needs to be authenticated');
      }
    }
    
    console.log('✅ Test completed!');
    console.log('📋 CONSOLE LOGS CAPTURED:');
    
    // Filter and display performance-related logs
    const performanceLogs = consoleLogs.filter(log => 
      log.text.includes('⏱️') || 
      log.text.includes('🚀') || 
      log.text.includes('📊') || 
      log.text.includes('✅') ||
      log.text.includes('API') ||
      log.text.includes('ms') ||
      log.text.includes('PERFORMANCE')
    );
    
    console.log('\n📈 PERFORMANCE LOGS:');
    performanceLogs.forEach(log => {
      console.log(`[${log.timestamp}] ${log.text}`);
    });
    
    console.log('\n🌐 NETWORK REQUESTS:');
    networkLogs.forEach(log => {
      console.log(`[${log.timestamp}] ${log.type}: ${log.url} ${log.status || log.method}`);
    });
    
    // Save detailed logs to file
    const fs = require('fs');
    fs.writeFileSync('onboarding-simple-logs.json', JSON.stringify({
      consoleLogs: performanceLogs,
      networkLogs,
      timestamp: new Date().toISOString()
    }, null, 2));
    
    console.log('\n💾 Detailed logs saved to onboarding-simple-logs.json');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    await page.screenshot({ path: 'test-error.png' });
  } finally {
    await browser.close();
  }
}

// Run the test
testOnboardingCompletion().catch(console.error); 