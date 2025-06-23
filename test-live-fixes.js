// Test script to verify design fixes on live helfi.ai site
const puppeteer = require('puppeteer');

async function testLiveFixes() {
  console.log('🧪 Testing design fixes on live helfi.ai site...\n');
  
  const browser = await puppeteer.launch({ 
    headless: false,
    defaultViewport: { width: 375, height: 667 } // iPhone size
  });
  
  try {
    const page = await browser.newPage();
    await page.goto('https://www.helfi.ai', { waitUntil: 'networkidle2' });
    
    console.log('✅ Site loaded successfully');
    
    // Test if we can navigate to dashboard
    console.log('🔍 Testing navigation to dashboard...');
    
    // Look for dashboard link or button
    const dashboardLink = await page.$('a[href="/dashboard"]');
    if (dashboardLink) {
      console.log('✅ Found dashboard link');
    } else {
      console.log('❌ Dashboard link not found');
    }
    
    // Test mobile header elements
    console.log('🔍 Testing mobile header elements...');
    
    // Check for logo without "Helfi" text
    const logo = await page.$('img[alt="Helfi Logo"]');
    if (logo) {
      console.log('✅ Logo found');
    } else {
      console.log('❌ Logo not found');
    }
    
    await page.waitForTimeout(3000);
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    await browser.close();
  }
}

testLiveFixes(); 