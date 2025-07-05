const { chromium } = require('playwright');

async function testOnboardingPerformanceWorking() {
  console.log('🚀 STARTING WORKING ONBOARDING PERFORMANCE TEST');
  
  const browser = await chromium.launch({ 
    headless: false,
    slowMo: 500,
    args: ['--disable-blink-features=AutomationControlled']
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  
  const page = await context.newPage();
  
  // Capture console logs for performance measurements
  const performanceLogs = [];
  page.on('console', msg => {
    const logEntry = {
      type: msg.type(),
      text: msg.text(),
      timestamp: new Date().toISOString()
    };
    
    // Capture all performance-related logs
    if (msg.text().includes('⏱️') || 
        msg.text().includes('🚀') || 
        msg.text().includes('📊') || 
        msg.text().includes('✅') ||
        msg.text().includes('PERFORMANCE') ||
        msg.text().includes('ms') ||
        msg.text().includes('API') ||
        msg.text().includes('Processing') ||
        msg.text().includes('completed')) {
      performanceLogs.push(logEntry);
      console.log(`[${logEntry.timestamp}] ${logEntry.type}: ${logEntry.text}`);
    }
  });
  
  // Capture network timing for API calls
  const networkLogs = [];
  const apiTiming = {};
  
  page.on('request', request => {
    if (request.url().includes('/api/user-data')) {
      apiTiming[request.url()] = { 
        requestStart: Date.now(),
        method: request.method()
      };
      networkLogs.push({
        type: 'request',
        url: request.url(),
        method: request.method(),
        timestamp: new Date().toISOString()
      });
    }
  });
  
  page.on('response', response => {
    if (response.url().includes('/api/user-data')) {
      const timing = apiTiming[response.url()];
      if (timing) {
        timing.responseEnd = Date.now();
        timing.duration = timing.responseEnd - timing.requestStart;
        timing.status = response.status();
      }
      networkLogs.push({
        type: 'response',
        url: response.url(),
        status: response.status(),
        duration: timing?.duration,
        timestamp: new Date().toISOString()
      });
    }
  });
  
  try {
    console.log('🔑 Step 1: Login (which auto-redirects to onboarding)');
    await page.goto('https://helfi.ai/auth/signin');
    await page.waitForLoadState('networkidle');
    
    await page.fill('input[name="email"]', 'info@sonicweb.com.au');
    await page.fill('input[name="password"]', 'Snoodlenoodle1@');
    await page.click('button[type="submit"]');
    
    // Wait for auto-redirect to onboarding
    console.log('⏳ Waiting for auto-redirect to onboarding...');
    await page.waitForURL('**/onboarding', { timeout: 10000 });
    await page.waitForLoadState('networkidle');
    
    console.log('✅ Successfully logged in and redirected to onboarding');
    
    // Navigate through onboarding quickly to get to review step
    console.log('🏃 Fast-forward through onboarding steps...');
    
    // Step 1: Gender
    try {
      await page.waitForSelector('button:has-text("Male")', { timeout: 5000 });
      await page.click('button:has-text("Male")');
      await page.check('input[type="checkbox"]');
      await page.click('button:has-text("Continue")');
      await page.waitForLoadState('networkidle');
    } catch (e) {
      console.log('Step 1 already completed or different state');
    }
    
    // Navigate to review step directly
    console.log('🎯 Navigating directly to review step...');
    await page.goto('https://helfi.ai/onboarding?step=10');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000); // Allow any data loading
    
    // Look for the Confirm & Begin button
    const confirmButton = page.locator('button:has-text("Confirm & Begin")');
    const isVisible = await confirmButton.isVisible();
    
    if (isVisible) {
      console.log('⏳ FOUND CONFIRM & BEGIN - STARTING PERFORMANCE MEASUREMENT...');
      
      // Clear previous logs to focus on the critical operation
      performanceLogs.length = 0;
      
      const overallStartTime = Date.now();
      
      console.log('🚀 CLICKING CONFIRM & BEGIN BUTTON...');
      await confirmButton.click();
      
      // Wait for redirect to dashboard
      console.log('🔄 Waiting for redirect to dashboard...');
      await page.waitForURL('**/dashboard', { timeout: 30000 });
      
      const overallEndTime = Date.now();
      const totalTime = overallEndTime - overallStartTime;
      
      // Wait for dashboard to fully load
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000); // Allow dashboard data loading
      
      console.log('🏁 PERFORMANCE TEST COMPLETED!');
      console.log(`📊 TOTAL TIME: ${totalTime}ms (${(totalTime/1000).toFixed(1)}s)`);
      
      // Take screenshot of final state
      await page.screenshot({ path: 'performance-test-success.png' });
      
    } else {
      console.log('❌ Confirm & Begin button not visible');
      await page.screenshot({ path: 'performance-test-no-button.png' });
      
      // Check page content
      const pageContent = await page.textContent('body');
      console.log('Page contains review content:', pageContent.includes('review') || pageContent.includes('confirm'));
    }
    
    console.log('\n📈 PERFORMANCE LOGS CAPTURED:');
    console.log('================================');
    performanceLogs.forEach((log, index) => {
      console.log(`${index + 1}. [${log.timestamp}] ${log.text}`);
    });
    
    console.log('\n🌐 API TIMING ANALYSIS:');
    console.log('======================');
    Object.entries(apiTiming).forEach(([url, timing]) => {
      if (timing.duration) {
        console.log(`📊 ${timing.method} ${url}: ${timing.duration}ms (${timing.status})`);
      }
    });
    
    // Save detailed results
    const fs = require('fs');
    const results = {
      totalTime: totalTime || 'not measured',
      performanceLogs,
      networkLogs,
      apiTiming,
      timestamp: new Date().toISOString()
    };
    
    fs.writeFileSync('onboarding-performance-results.json', JSON.stringify(results, null, 2));
    console.log('\n💾 Detailed results saved to onboarding-performance-results.json');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    await page.screenshot({ path: 'performance-test-error.png' });
  } finally {
    await browser.close();
  }
}

// Run the test
testOnboardingPerformanceWorking().catch(console.error); 