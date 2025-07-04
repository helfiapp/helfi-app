const { chromium } = require('playwright');

async function testExpandCollapsePersistence() {
  console.log('🚀 Starting expand/collapse persistence test...');
  
  const browser = await chromium.launch({ 
    headless: false, 
    slowMo: 2000 // Slower for observation
  });
  
  const context = await browser.newContext({
    permissions: []
  });
  
  const page = await context.newPage();
  
  // Listen for console logs
  page.on('console', msg => {
    console.log(`🔍 Browser Console: ${msg.text()}`);
  });
  
  try {
    console.log('📍 Step 1: Navigate to admin panel and login');
    await page.goto('https://helfi.ai/admin-panel');
    await page.waitForLoadState('networkidle');
    
    await page.fill('input[type="password"]', 'gX8#bQ3!Vr9zM2@kLf1T');
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');
    
    console.log('📍 Step 2: Navigate to tickets and open a ticket');
    await page.click('text=🎫 Support');
    await page.waitForLoadState('networkidle');
    
    // Wait for tickets to load and click view
    await page.waitForSelector('text=💬 View', { timeout: 10000 });
    await page.click('text=💬 View');
    await page.waitForLoadState('networkidle');
    
    console.log('📍 Step 3: Check initial state of responses');
    const initialResponses = await page.locator('.border-blue-200, .border-gray-200').count();
    console.log(`📊 Found ${initialResponses} response elements initially`);
    
    // Check localStorage before any interactions
    const initialLocalStorage = await page.evaluate(() => {
      const keys = Object.keys(window.localStorage);
      const ticketKeys = keys.filter(key => key.includes('ticket'));
      return ticketKeys.map(key => ({ key, value: window.localStorage.getItem(key) }));
    });
    console.log('📊 Initial localStorage:', initialLocalStorage);
    
    console.log('📍 Step 4: Click to collapse/expand some responses');
    
    // Try different selectors to find clickable response elements
    const responseSelectors = [
      '.border-blue-200',
      '.border-gray-200', 
      '[class*="border-blue"]',
      '[class*="border-gray"]',
      '.p-4.rounded-lg',
      '.bg-emerald-50',
      '.bg-blue-50'
    ];
    
    let clickableFound = false;
    for (const selector of responseSelectors) {
      const elements = await page.locator(selector).count();
      if (elements > 0) {
        console.log(`📊 Found ${elements} elements with selector: ${selector}`);
        
        // Try to click the first one
        try {
          await page.locator(selector).first().click();
          console.log(`✅ Successfully clicked element with selector: ${selector}`);
          clickableFound = true;
          await page.waitForTimeout(2000);
          break;
        } catch (error) {
          console.log(`❌ Could not click element with selector: ${selector}`);
        }
      }
    }
    
    if (!clickableFound) {
      console.log('❌ Could not find clickable response elements');
      
      // Let's inspect the actual DOM structure
      const responseStructure = await page.evaluate(() => {
        const responses = document.querySelectorAll('[class*="response"], [class*="border"], .p-4, .rounded-lg');
        return Array.from(responses).slice(0, 5).map(el => ({
          tagName: el.tagName,
          className: el.className,
          textContent: el.textContent?.substring(0, 50) + '...',
          clickable: window.getComputedStyle(el).cursor === 'pointer'
        }));
      });
      console.log('📊 Response DOM structure:', responseStructure);
    }
    
    // Check localStorage after clicking
    const afterClickLocalStorage = await page.evaluate(() => {
      const keys = Object.keys(window.localStorage);
      const ticketKeys = keys.filter(key => key.includes('ticket'));
      return ticketKeys.map(key => ({ key, value: window.localStorage.getItem(key) }));
    });
    console.log('📊 localStorage after clicking:', afterClickLocalStorage);
    
    console.log('📍 Step 5: Navigate back to tickets');
    await page.click('text=Back to Support Tickets');
    await page.waitForLoadState('networkidle');
    
    console.log('📍 Step 6: Return to the same ticket');
    await page.waitForSelector('text=💬 View', { timeout: 10000 });
    await page.click('text=💬 View');
    await page.waitForLoadState('networkidle');
    
    console.log('📍 Step 7: Check if expand/collapse state persisted');
    
    // Check localStorage after returning
    const finalLocalStorage = await page.evaluate(() => {
      const keys = Object.keys(window.localStorage);
      const ticketKeys = keys.filter(key => key.includes('ticket'));
      return ticketKeys.map(key => ({ key, value: window.localStorage.getItem(key) }));
    });
    console.log('📊 Final localStorage:', finalLocalStorage);
    
    const finalResponses = await page.locator('.border-blue-200, .border-gray-200').count();
    console.log(`📊 Found ${finalResponses} response elements after return`);
    
    // Check if any responses are visually collapsed
    const collapsedElements = await page.evaluate(() => {
      const elements = document.querySelectorAll('[style*="display: none"], [class*="collapsed"], [class*="hidden"]');
      return elements.length;
    });
    console.log(`📊 Found ${collapsedElements} visually hidden/collapsed elements`);
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
  
  console.log('⏸️ Pausing for 15 seconds for manual inspection...');
  await page.waitForTimeout(15000);
  
  await browser.close();
  console.log('✅ Test completed');
}

testExpandCollapsePersistence().catch(console.error); 