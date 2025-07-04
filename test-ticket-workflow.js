const { chromium } = require('playwright');

async function testTicketWorkflow() {
  console.log('🚀 Starting browser automation test...');
  
  const browser = await chromium.launch({ 
    headless: false, // Show browser so we can see what's happening
    slowMo: 1000 // Slow down actions to observe
  });
  
  const context = await browser.newContext({
    // Use incognito mode
    permissions: []
  });
  
  const page = await context.newPage();
  
  // Listen for console logs
  page.on('console', msg => {
    console.log(`🔍 Browser Console: ${msg.text()}`);
  });
  
  try {
    console.log('📍 Step 1: Navigate to admin panel');
    await page.goto('https://helfi.ai/admin-panel');
    await page.waitForLoadState('networkidle');
    
    console.log('📍 Step 2: Login with admin password');
    await page.fill('input[type="password"]', 'gX8#bQ3!Vr9zM2@kLf1T');
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');
    
    console.log('📍 Step 3: Navigate to tickets tab');
    await page.click('text=🎫 Support');
    await page.waitForLoadState('networkidle');
    
    // Check if tickets are visible
    const ticketsVisible = await page.isVisible('text=💬 View');
    console.log(`📊 Tickets visible after tab click: ${ticketsVisible}`);
    
    if (!ticketsVisible) {
      console.log('⚠️ No tickets visible - clicking refresh button');
      await page.click('text=🔄 Refresh');
      await page.waitForLoadState('networkidle');
    }
    
    console.log('📍 Step 4: Open a ticket');
    await page.click('text=💬 View');
    await page.waitForLoadState('networkidle');
    
    // Check current URL
    const ticketUrl = page.url();
    console.log(`📍 Current URL: ${ticketUrl}`);
    
    console.log('📍 Step 5: Check for expandable responses');
    const responses = await page.locator('[class*="border-blue-200"], [class*="border-gray-200"]').count();
    console.log(`📊 Found ${responses} response elements`);
    
    if (responses > 0) {
      console.log('📍 Step 6: Collapse a response');
      await page.locator('[class*="border-blue-200"], [class*="border-gray-200"]').first().click();
      await page.waitForTimeout(1000);
      
      // Check localStorage
      const localStorage = await page.evaluate(() => {
        const keys = Object.keys(window.localStorage);
        const ticketKeys = keys.filter(key => key.includes('ticket'));
        return ticketKeys.map(key => ({ key, value: window.localStorage.getItem(key) }));
      });
      console.log('📊 localStorage state:', localStorage);
    }
    
    console.log('📍 Step 7: Click back button');
    await page.click('text=Back to Support Tickets');
    await page.waitForLoadState('networkidle');
    
    // Check if we're back at tickets and if they're loaded
    const backUrl = page.url();
    console.log(`📍 Back URL: ${backUrl}`);
    
    const ticketsVisibleAfterBack = await page.isVisible('text=💬 View');
    console.log(`📊 Tickets visible after back button: ${ticketsVisibleAfterBack}`);
    
    if (ticketsVisibleAfterBack) {
      console.log('📍 Step 8: Re-open the same ticket');
      await page.click('text=💬 View');
      await page.waitForLoadState('networkidle');
      
      console.log('📍 Step 9: Check if response state persisted');
      const expandedResponses = await page.locator('[class*="border-t border-gray-200"]').count();
      console.log(`📊 Expanded responses after return: ${expandedResponses}`);
      
      // Check localStorage again
      const localStorageAfter = await page.evaluate(() => {
        const keys = Object.keys(window.localStorage);
        const ticketKeys = keys.filter(key => key.includes('ticket'));
        return ticketKeys.map(key => ({ key, value: window.localStorage.getItem(key) }));
      });
      console.log('📊 localStorage after return:', localStorageAfter);
    } else {
      console.log('❌ ISSUE CONFIRMED: Tickets not visible after back button - requires manual refresh');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
  
  console.log('⏸️ Pausing for 10 seconds for manual inspection...');
  await page.waitForTimeout(10000);
  
  await browser.close();
  console.log('✅ Test completed');
}

testTicketWorkflow().catch(console.error); 