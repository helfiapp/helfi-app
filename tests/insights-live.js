const { chromium } = require('playwright')

async function login(page, { email, password }) {
  // Use direct sign-in API to obtain a NextAuth session cookie on production
  const response = await page.request.post('https://helfi.ai/api/auth/signin-direct', {
    data: { email, password },
  })
  if (!response.ok()) {
    throw new Error(`signin-direct failed: ${response.status()} ${response.statusText()}`)
  }
}

async function fetchSectionJson(page, issueSlug, section) {
  const url = `https://helfi.ai/api/insights/issues/${issueSlug}/sections/${section}`
  const response = await page.request.get(url)
  if (!response.ok()) {
    throw new Error(`Failed to GET ${url}: ${response.status()} ${response.statusText()}`)
  }
  return await response.json()
}

async function generateSection(page, issueSlug, section, mode = 'daily') {
  const url = `https://helfi.ai/api/insights/issues/${issueSlug}/sections/${section}`
  const response = await page.request.post(url, {
    data: { mode },
    headers: { 'Content-Type': 'application/json' },
  })
  if (!response.ok()) {
    throw new Error(`Failed to POST ${url}: ${response.status()} ${response.statusText()}`)
  }
  const json = await response.json()
  return json.result || json
}

function assertMinCount(arr, min, label) {
  if (!Array.isArray(arr)) throw new Error(`${label} is not an array`)
  if (arr.length < min) {
    throw new Error(`${label} has ${arr.length}, expected ≥4`)
  }
}

async function waitForCounts(checkFn, { timeoutMs = 600000, intervalMs = 15000, label = 'section' } = {}) {
  const start = Date.now()
  let lastErr = null
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await checkFn()
      return
    } catch (e) {
      lastErr = e
      const elapsed = Date.now() - start
      if (elapsed >= timeoutMs) {
        throw new Error(`Timeout waiting for ${label}: ${lastErr.message || lastErr}`)
      }
      console.log(`⏳ Waiting for ${label} cache refresh... (${Math.round((timeoutMs - elapsed)/1000)}s left)`) 
      await new Promise(r => setTimeout(r, intervalMs))
    }
  }
}

async function run() {
  console.log('🚀 Insights live validation start')
  const browser = await chromium.launch({ headless: false, args: ['--disable-blink-features=AutomationControlled'] })
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
  })
  const page = await context.newPage()

  try {
    // 1) Login
    await login(page, { email: 'info@sonicweb.com.au', password: 'Snoodlenoodle1@' })
    console.log('✅ Logged in')

    const issueSlug = 'bowel-movements'
    const checks = []

    // 2) Supplements (retry until cache bust + deploy ready)
    await waitForCounts(async () => {
      // Force fresh compute, then verify
      await generateSection(page, issueSlug, 'supplements', 'daily')
      const json = await fetchSectionJson(page, issueSlug, 'supplements')
      const extras = (json.extras || {})
      assertMinCount(extras.suggestedAdditions || [], 4, 'Supplements.suggestedAdditions')
      assertMinCount(extras.avoidList || [], 4, 'Supplements.avoidList')
    }, { label: 'supplements' })
    checks.push('supplements')
    console.log('✅ Supplements 4/4 OK')

    // 3) Medications
    await waitForCounts(async () => {
      await generateSection(page, issueSlug, 'medications', 'daily')
      const json = await fetchSectionJson(page, issueSlug, 'medications')
      const extras = (json.extras || {})
      assertMinCount(extras.suggestedAdditions || [], 4, 'Medications.suggestedAdditions')
      assertMinCount(extras.avoidList || [], 4, 'Medications.avoidList')
    }, { label: 'medications' })
    checks.push('medications')
    console.log('✅ Medications 4/4 OK')

    // 4) Nutrition
    await waitForCounts(async () => {
      await generateSection(page, issueSlug, 'nutrition', 'daily')
      const json = await fetchSectionJson(page, issueSlug, 'nutrition')
      const extras = (json.extras || {})
      assertMinCount(extras.suggestedFocus || [], 4, 'Nutrition.suggestedFocus')
      assertMinCount(extras.avoidFoods || [], 4, 'Nutrition.avoidFoods')
    }, { label: 'nutrition' })
    checks.push('nutrition')
    console.log('✅ Nutrition 4/4 OK')

    // 5) Exercise
    await waitForCounts(async () => {
      await generateSection(page, issueSlug, 'exercise', 'daily')
      const json = await fetchSectionJson(page, issueSlug, 'exercise')
      const extras = (json.extras || {})
      assertMinCount(extras.suggestedActivities || [], 4, 'Exercise.suggestedActivities')
      assertMinCount(extras.avoidActivities || [], 4, 'Exercise.avoidActivities')
    }, { label: 'exercise' })
    checks.push('exercise')
    console.log('✅ Exercise 4/4 OK')

    // 6) Lifestyle
    await waitForCounts(async () => {
      await generateSection(page, issueSlug, 'lifestyle', 'daily')
      const json = await fetchSectionJson(page, issueSlug, 'lifestyle')
      const extras = (json.extras || {})
      assertMinCount(extras.suggestedHabits || [], 4, 'Lifestyle.suggestedHabits')
      assertMinCount(extras.avoidHabits || [], 4, 'Lifestyle.avoidHabits')
    }, { label: 'lifestyle' })
    checks.push('lifestyle')
    console.log('✅ Lifestyle 4/4 OK')

    console.log('\n🎉 All checks passed:', checks.join(', '))
    process.exitCode = 0
  } catch (err) {
    console.error('❌ Validation failed:', err.message || err)
    process.exitCode = 1
  } finally {
    await browser.close()
  }
}

run().catch(err => {
  console.error(err)
  process.exit(1)
})


