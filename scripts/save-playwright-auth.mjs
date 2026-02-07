import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const getArg = (name) => {
  const i = process.argv.indexOf(name)
  if (i === -1) return null
  return process.argv[i + 1] || null
}

const boolArg = (name, defaultValue) => {
  const v = getArg(name)
  if (v === null) return defaultValue
  return v === 'true'
}

const baseUrl = (getArg('--base-url') || process.env.HELFI_BASE_URL || 'https://helfi.ai').replace(/\/+$/, '')
const mode = getArg('--mode') || 'credentials' // credentials | google
const email = getArg('--email') || process.env.HELFI_TEST_EMAIL || ''
const password = getArg('--password') || process.env.HELFI_TEST_PASSWORD || ''
const keepSignedIn = boolArg('--keep-signed-in', true)
const outPath =
  getArg('--out') ||
  (mode === 'credentials'
    ? `playwright/.auth/${email.replace(/[^a-zA-Z0-9_.@-]/g, '_')}.json`
    : 'playwright/.auth/google.json')

const ensureDir = (p) => {
  fs.mkdirSync(path.dirname(p), { recursive: true })
}

const main = async () => {
  if (mode !== 'credentials' && mode !== 'google') {
    throw new Error(`Unknown --mode "${mode}". Use "credentials" or "google".`)
  }

  if (mode === 'credentials' && (!email || !password)) {
    throw new Error('Missing email/password. Provide --email/--password or HELFI_TEST_EMAIL/HELFI_TEST_PASSWORD.')
  }

  // Headful so you can complete any Google security prompts one time.
  const browser = await chromium.launch({ headless: false })
  const context = await browser.newContext()
  const page = await context.newPage()

  await page.goto(`${baseUrl}/auth/signin`, { waitUntil: 'domcontentloaded' })

  if (mode === 'credentials') {
    // Use stable ids + real typing (more reliable with React controlled inputs).
    const emailInput = page.locator('#email')
    const passwordInput = page.locator('#password')
    await emailInput.click()
    await emailInput.fill('')
    await emailInput.type(email, { delay: 25 })
    await passwordInput.click()
    await passwordInput.fill('')
    await passwordInput.type(password, { delay: 25 })
    if (keepSignedIn) {
      // "Keep me signed in" only shows on sign-in (not sign-up).
      const keepMe = page.getByLabel('Keep me signed in')
      if (await keepMe.count().catch(() => 0)) {
        const checked = await keepMe.isChecked().catch(() => false)
        if (!checked) await keepMe.check()
      }
    }
    const submit = page.getByRole('button', { name: 'Sign In' })
    await submit.waitFor()
    // Wait briefly for the button to enable after React state updates.
    await page.waitForTimeout(300)
    if (!(await submit.isEnabled().catch(() => false))) {
      const emailVal = await emailInput.inputValue().catch(() => '')
      const passLen = (await passwordInput.inputValue().catch(() => '')).length
      throw new Error(
        `Sign In button is still disabled. (Email field has ${emailVal ? 'a value' : 'no value'}, password length ${passLen}.)`
      )
    }
    await submit.click()
  } else {
    await page.getByRole('button', { name: 'Continue with Google' }).click()
    // At this point you may need to complete Google login in the opened browser window.
  }

  // Confirm we are logged in by waiting for the app header profile menu.
  await page.goto(`${baseUrl}/food`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Open profile menu' }).waitFor({ timeout: 10 * 60 * 1000 })

  ensureDir(outPath)
  await context.storageState({ path: outPath })

  await browser.close()
}

main().catch((err) => {
  // Keep the error simple so it’s readable for non-technical users.
  console.error('Could not save a logged-in test session.')
  console.error(String(err?.message || err))
  process.exit(1)
})
