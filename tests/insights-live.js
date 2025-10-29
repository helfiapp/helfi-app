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

function assertMinCount(arr, min, label) {
  if (!Array.isArray(arr)) throw new Error(`${label} is not an array`)
  if (arr.length < min) {
    throw new Error(`${label} has ${arr.length}, expected ≥4`)
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

    // 2) Supplements
    {
      const json = await fetchSectionJson(page, issueSlug, 'supplements')
      const extras = (json.extras || {})
      assertMinCount(extras.suggestedAdditions || [], 4, 'Supplements.suggestedAdditions')
      assertMinCount(extras.avoidList || [], 4, 'Supplements.avoidList')
      checks.push('supplements')
      console.log('✅ Supplements 4/4 OK')
    }

    // 3) Medications
    {
      const json = await fetchSectionJson(page, issueSlug, 'medications')
      const extras = (json.extras || {})
      assertMinCount(extras.suggestedAdditions || [], 4, 'Medications.suggestedAdditions')
      assertMinCount(extras.avoidList || [], 4, 'Medications.avoidList')
      checks.push('medications')
      console.log('✅ Medications 4/4 OK')
    }

    // 4) Nutrition
    {
      const json = await fetchSectionJson(page, issueSlug, 'nutrition')
      const extras = (json.extras || {})
      assertMinCount(extras.suggestedFocus || [], 4, 'Nutrition.suggestedFocus')
      assertMinCount(extras.avoidFoods || [], 4, 'Nutrition.avoidFoods')
      checks.push('nutrition')
      console.log('✅ Nutrition 4/4 OK')
    }

    // 5) Exercise
    {
      const json = await fetchSectionJson(page, issueSlug, 'exercise')
      const extras = (json.extras || {})
      assertMinCount(extras.suggestedActivities || [], 4, 'Exercise.suggestedActivities')
      assertMinCount(extras.avoidActivities || [], 4, 'Exercise.avoidActivities')
      checks.push('exercise')
      console.log('✅ Exercise 4/4 OK')
    }

    // 6) Lifestyle
    {
      const json = await fetchSectionJson(page, issueSlug, 'lifestyle')
      const extras = (json.extras || {})
      assertMinCount(extras.suggestedHabits || [], 4, 'Lifestyle.suggestedHabits')
      assertMinCount(extras.avoidHabits || [], 4, 'Lifestyle.avoidHabits')
      checks.push('lifestyle')
      console.log('✅ Lifestyle 4/4 OK')
    }

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


