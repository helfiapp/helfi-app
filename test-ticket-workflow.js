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
  
  // Listen for network requests and responses
  page.on('request', request => {
    if (request.url().includes('/api/admin/tickets') || request.url().includes('/api/admin/users')) {
      console.log(`📡 REQUEST: ${request.method()} ${request.url()}`);
      const headers = request.headers();
      if (headers['authorization']) {
        console.log(`🔑 Auth Header: ${headers['authorization']}`);
      }
    }
  });
  
  page.on('response', response => {
    if (response.url().includes('/api/admin/tickets') || response.url().includes('/api/admin/users')) {
      console.log(`📡 RESPONSE: ${response.status()} ${response.url()}`);
      if (response.status() === 401) {
        console.log(`❌ 401 UNAUTHORIZED ERROR on ${response.url()}`);
      }
    }
  });
  
  try {
    console.log('📍 Step 1: Navigate to admin panel');
    await page.goto('https://helfi.ai/admin-panel');
    await page.waitForLoadState('networkidle');
    
    console.log('📍 Step 2: Login with admin password');
    await page.fill('input[type="password"]', 'gX8#bQ3!Vr9zM2@kLf1T');
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');
    
    // Check sessionStorage after login
    const sessionStorageAfterLogin = await page.evaluate(() => {
      return {
        adminToken: sessionStorage.getItem('adminToken'),
        adminUser: sessionStorage.getItem('adminUser')
      };
    });
    console.log('📊 SessionStorage after login:', sessionStorageAfterLogin);
    
    console.log('📍 Step 3: Navigate to tickets tab');
    await page.click('text=🎫 Support');
    await page.waitForLoadState('networkidle');
    
    // Check if tickets tab is active
    const ticketsTabActive = await page.evaluate(() => {
      const ticketsTab = document.querySelector('[data-tab="tickets"]');
      return ticketsTab ? ticketsTab.classList.contains('active') : false;
    });
    console.log(`📊 Tickets tab active after click: ${ticketsTabActive}`);
    
    // Check if tickets are visible
    const ticketsVisible = await page.isVisible('text=💬 View');
    console.log(`📊 Tickets visible after tab click: ${ticketsVisible}`);
    
    if (!ticketsVisible) {
      console.log('⚠️ No tickets visible - clicking refresh button');
      await page.click('text=🔄 Refresh');
      await page.waitForLoadState('networkidle');
      
      // Check again after refresh
      const ticketsVisibleAfterRefresh = await page.isVisible('text=💬 View');
      console.log(`📊 Tickets visible after refresh: ${ticketsVisibleAfterRefresh}`);
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
    
    // Check sessionStorage after back navigation
    const sessionStorageAfterBack = await page.evaluate(() => {
      return {
        adminToken: sessionStorage.getItem('adminToken'),
        adminUser: sessionStorage.getItem('adminUser')
      };
    });
    console.log('📊 SessionStorage after back navigation:', sessionStorageAfterBack);
    
    // Check if tickets tab is active after back navigation
    const ticketsTabActiveAfterBack = await page.evaluate(() => {
      const ticketsTab = document.querySelector('[data-tab="tickets"]');
      return ticketsTab ? ticketsTab.classList.contains('active') : false;
    });
    console.log(`📊 Tickets tab active after back: ${ticketsTabActiveAfterBack}`);
    
    // Check if tickets section is visible
    const ticketsSection = await page.isVisible('[data-tab-content="tickets"]');
    console.log(`📊 Tickets section visible: ${ticketsSection}`);
    
    const ticketsVisibleAfterBack = await page.isVisible('text=💬 View');
    console.log(`📊 Tickets visible after back button: ${ticketsVisibleAfterBack}`);
    
    if (!ticketsVisibleAfterBack) {
      console.log('❌ ISSUE CONFIRMED: Tickets not visible after back button - investigating tab state');
      
      // Check what tab is currently active
      const currentActiveTab = await page.evaluate(() => {
        const tabs = document.querySelectorAll('[data-tab]');
        for (let tab of tabs) {
          if (tab.classList.contains('active') || tab.classList.contains('bg-emerald-100')) {
            return tab.getAttribute('data-tab') || tab.textContent;
          }
        }
        return 'none';
      });
      console.log(`📊 Current active tab: ${currentActiveTab}`);
      
      // Try manual refresh to see if it fixes it
      console.log('📍 Step 8: Manual refresh test');
      await page.click('text=🔄 Refresh');
      await page.waitForLoadState('networkidle');
      
      const ticketsVisibleAfterManualRefresh = await page.isVisible('text=💬 View');
      console.log(`📊 Tickets visible after manual refresh: ${ticketsVisibleAfterManualRefresh}`);
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