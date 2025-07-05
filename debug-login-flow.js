const { chromium } = require('playwright');

async function debugLoginFlow() {
  console.log('🔍 DEBUGGING LOGIN FLOW');
  
  // Launch browser with more detailed settings
  const browser = await chromium.launch({ 
    headless: false,
    slowMo: 1000,
    args: ['--disable-blink-features=AutomationControlled'] // Try to avoid automation detection
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 720 }
  });
  
  const page = await context.newPage();
  
  // Monitor all network requests
  page.on('request', request => {
    if (request.url().includes('auth') || request.url().includes('api')) {
      console.log(`📤 REQUEST: ${request.method()} ${request.url()}`);
      const headers = request.headers();
      if (headers.cookie) {
        console.log(`🍪 COOKIES: ${headers.cookie.substring(0, 100)}...`);
      }
    }
  });
  
  page.on('response', response => {
    if (response.url().includes('auth') || response.url().includes('api')) {
      console.log(`📥 RESPONSE: ${response.status()} ${response.url()}`);
      const headers = response.headers();
      if (headers['set-cookie']) {
        console.log(`🍪 SET-COOKIE: ${headers['set-cookie']}`);
      }
    }
  });
  
  // Monitor console logs
  page.on('console', msg => {
    if (msg.text().includes('Session') || msg.text().includes('Auth') || msg.text().includes('invalidated')) {
      console.log(`🖥️ CONSOLE: ${msg.text()}`);
    }
  });
  
  try {
    console.log('🚀 Step 1: Navigate to homepage');
    await page.goto('https://helfi.ai/');
    await page.waitForLoadState('networkidle');
    
    // Check initial session
    console.log('🔍 Step 2: Check initial session state');
    await page.goto('https://helfi.ai/api/auth/session');
    const sessionResponse = await page.textContent('pre');
    console.log('📊 Initial session:', sessionResponse);
    
    console.log('🔍 Step 3: Navigate to login page');
    await page.goto('https://helfi.ai/auth/signin');
    await page.waitForLoadState('networkidle');
    
    // Take screenshot of login page
    await page.screenshot({ path: 'debug-login-page.png' });
    
    console.log('🔍 Step 4: Check cookies before login');
    const cookies = await context.cookies();
    console.log('🍪 Cookies before login:', cookies.map(c => `${c.name}=${c.value.substring(0, 20)}...`));
    
    console.log('🔍 Step 5: Fill login form');
    await page.fill('input[name="email"]', 'info@sonicweb.com.au');
    await page.fill('input[name="password"]', 'Snoodlenoodle1@');
    
    console.log('🔍 Step 6: Submit login form');
    await page.click('button[type="submit"]');
    
    // Wait for response
    await page.waitForTimeout(5000);
    
    console.log('🔍 Step 7: Check URL after login');
    const currentUrl = page.url();
    console.log('📍 Current URL:', currentUrl);
    
    console.log('🔍 Step 8: Check cookies after login');
    const cookiesAfter = await context.cookies();
    console.log('🍪 Cookies after login:', cookiesAfter.map(c => `${c.name}=${c.value.substring(0, 20)}...`));
    
    console.log('🔍 Step 9: Check session after login');
    await page.goto('https://helfi.ai/api/auth/session');
    const sessionAfter = await page.textContent('pre');
    console.log('📊 Session after login:', sessionAfter);
    
    console.log('🔍 Step 10: Try to access protected page');
    await page.goto('https://helfi.ai/dashboard');
    await page.waitForLoadState('networkidle');
    
    const dashboardUrl = page.url();
    console.log('📍 Dashboard URL:', dashboardUrl);
    
    if (dashboardUrl.includes('dashboard')) {
      console.log('✅ Successfully accessed dashboard');
    } else if (dashboardUrl.includes('signin')) {
      console.log('❌ Redirected back to login');
    } else {
      console.log('❓ Unexpected redirect to:', dashboardUrl);
    }
    
    // Take final screenshot
    await page.screenshot({ path: 'debug-final-state.png' });
    
    console.log('🔍 Step 11: Try onboarding access');
    await page.goto('https://helfi.ai/onboarding');
    await page.waitForLoadState('networkidle');
    
    const onboardingUrl = page.url();
    console.log('📍 Onboarding URL:', onboardingUrl);
    
    if (onboardingUrl.includes('onboarding')) {
      console.log('✅ Successfully accessed onboarding');
      
      // Check for performance logs
      console.log('🔍 Checking for performance measurement logs...');
      await page.waitForTimeout(3000);
      
    } else {
      console.log('❌ Could not access onboarding, redirected to:', onboardingUrl);
    }
    
    console.log('✅ Debug session completed');
    
  } catch (error) {
    console.error('❌ Debug failed:', error);
    await page.screenshot({ path: 'debug-error.png' });
  } finally {
    await browser.close();
  }
}

// Run the debug
debugLoginFlow().catch(console.error); 