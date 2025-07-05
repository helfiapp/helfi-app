const { chromium } = require('playwright');

async function testOnboardingPerformance() {
  console.log('🚀 STARTING ONBOARDING PERFORMANCE TEST');
  
  // Launch browser
  const browser = await chromium.launch({ 
    headless: false, // Show browser for debugging
    slowMo: 1000 // Slow down for observation
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
    console.log('📱 Navigating to login page...');
    await page.goto('https://helfi.ai/auth/signin');
    await page.waitForLoadState('networkidle');
    
    console.log('🔑 Logging in...');
    await page.fill('input[name="email"]', 'info@sonicweb.com.au');
    await page.fill('input[name="password"]', 'Snoodlenoodle1@');
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');
    
    console.log('📝 Navigating to onboarding...');
    await page.goto('https://helfi.ai/onboarding');
    await page.waitForLoadState('networkidle');
    
    console.log('⏭️ Filling out onboarding form...');
    
    // Step 1: Gender
    await page.waitForSelector('button:has-text("Male")', { timeout: 10000 });
    await page.click('button:has-text("Male")');
    await page.check('input[type="checkbox"]'); // Agree to terms
    await page.click('button:has-text("Continue")');
    await page.waitForLoadState('networkidle');
    
    // Step 2: Physical
    await page.waitForSelector('input[placeholder*="weight"]', { timeout: 10000 });
    await page.fill('input[placeholder*="weight"]', '75');
    await page.fill('input[placeholder*="height"]', '180');
    await page.click('button:has-text("Mesomorph")');
    await page.click('button:has-text("Next")');
    await page.waitForLoadState('networkidle');
    
    // Step 3: Exercise
    await page.waitForSelector('button:has-text("2-3 times per week")', { timeout: 10000 });
    await page.click('button:has-text("2-3 times per week")');
    await page.click('button:has-text("Continue")');
    await page.waitForLoadState('networkidle');
    
    // Step 4: Health Goals
    await page.waitForSelector('input[placeholder*="Search health goals"]', { timeout: 10000 });
    await page.fill('input[placeholder*="Search health goals"]', 'Weight Loss');
    await page.click('button:has-text("Weight Loss")');
    await page.click('button:has-text("Continue")');
    await page.waitForLoadState('networkidle');
    
    // Step 5: Health Situations
    await page.waitForSelector('button:has-text("Continue")', { timeout: 10000 });
    await page.click('button:has-text("Continue")');
    await page.waitForLoadState('networkidle');
    
    // Step 6: Supplements
    await page.waitForSelector('button:has-text("Continue")', { timeout: 10000 });
    await page.click('button:has-text("Continue")');
    await page.waitForLoadState('networkidle');
    
    // Step 7: Medications
    await page.waitForSelector('button:has-text("Continue")', { timeout: 10000 });
    await page.click('button:has-text("Continue")');
    await page.waitForLoadState('networkidle');
    
    // Step 8: Blood Results
    await page.waitForSelector('button:has-text("Continue")', { timeout: 10000 });
    await page.click('button:has-text("Continue")');
    await page.waitForLoadState('networkidle');
    
    // Step 9: AI Insights
    await page.waitForSelector('button:has-text("Yes")', { timeout: 10000 });
    await page.click('button:has-text("Yes")');
    await page.click('button:has-text("Next")');
    await page.waitForLoadState('networkidle');
    
    // Step 10: Review - THE CRITICAL STEP
    console.log('⏳ CLICKING CONFIRM & BEGIN - MEASURING PERFORMANCE...');
    const startTime = Date.now();
    
    await page.waitForSelector('button:has-text("Confirm & Begin")', { timeout: 10000 });
    await page.click('button:has-text("Confirm & Begin")');
    
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
    
    console.log('✅ Test completed successfully!');
    console.log('📋 CONSOLE LOGS CAPTURED:');
    
    // Filter and display performance-related logs
    const performanceLogs = consoleLogs.filter(log => 
      log.text.includes('⏱️') || 
      log.text.includes('🚀') || 
      log.text.includes('📊') || 
      log.text.includes('✅') ||
      log.text.includes('API') ||
      log.text.includes('ms')
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
    fs.writeFileSync('onboarding-performance-logs.json', JSON.stringify({
      totalTime,
      consoleLogs: performanceLogs,
      networkLogs,
      timestamp: new Date().toISOString()
    }, null, 2));
    
    console.log('\n💾 Detailed logs saved to onboarding-performance-logs.json');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    await page.screenshot({ path: 'test-error.png' });
  } finally {
    await browser.close();
  }
}

// Run the test
testOnboardingPerformance().catch(console.error); 