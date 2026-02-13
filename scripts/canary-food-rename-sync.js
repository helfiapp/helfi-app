#!/usr/bin/env node
/**
 * Canary: verifies Food Diary rename stays synced across Edit Entry + Favorites/Custom.
 *
 * Required auth (pick one):
 * - CANARY_AUTH_COOKIE="next-auth.session-token=..."
 * - CANARY_STORAGE_STATE="playwright/.auth/your-user.json"
 *
 * Optional:
 * - CANARY_BASE_URL=https://helfi.ai
 * - CANARY_TARGET_DATE=YYYY-MM-DD
 * - CANARY_TARGET_LOG_ID=<foodLog db id>
 * - CANARY_TARGET_FAVORITE_ID=<favorite id>
 * - CANARY_LOOKBACK_DAYS=45
 * - CANARY_SKIP_RESTORE=1
 *
 * Exit codes:
 * - 0 success
 * - 1 canary failed
 * - 2 bad configuration/auth
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const BASE_URL = (process.env.CANARY_BASE_URL || 'https://helfi.ai').replace(/\/$/, '');
const AUTH_COOKIE = (process.env.CANARY_AUTH_COOKIE || '').trim();
const STORAGE_STATE = (process.env.CANARY_STORAGE_STATE || '').trim();
const TARGET_DATE = (process.env.CANARY_TARGET_DATE || '').trim();
const TARGET_LOG_ID = (process.env.CANARY_TARGET_LOG_ID || '').trim();
const TARGET_FAVORITE_ID = (process.env.CANARY_TARGET_FAVORITE_ID || '').trim();
const LOOKBACK_DAYS = Number(process.env.CANARY_LOOKBACK_DAYS || 45);
const SKIP_RESTORE = process.env.CANARY_SKIP_RESTORE === '1';

const PASS = (msg) => console.log(`✅ ${msg}`);
const INFO = (msg) => console.log(`ℹ️  ${msg}`);
const FAIL = (msg) => console.error(`❌ ${msg}`);

const normalizeTitle = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const categoryLabel = (value) => {
  const v = String(value || '').toLowerCase();
  if (v.includes('breakfast')) return 'Breakfast';
  if (v.includes('lunch')) return 'Lunch';
  if (v.includes('dinner')) return 'Dinner';
  if (v.includes('snack')) return 'Snacks';
  return 'Other';
};

const parseCookieHeader = (cookieHeader) => {
  const pairs = cookieHeader
    .split(';')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const i = p.indexOf('=');
      if (i <= 0) return null;
      return { name: p.slice(0, i).trim(), value: p.slice(i + 1).trim() };
    })
    .filter(Boolean);
  return pairs;
};

const withDateOffset = (daysAgo) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
};

async function buildContext(browser) {
  const context = await browser.newContext({
    viewport: { width: 1500, height: 1100 },
    ...(STORAGE_STATE ? { storageState: STORAGE_STATE } : {}),
  });

  if (!STORAGE_STATE && AUTH_COOKIE) {
    const url = new URL(BASE_URL);
    const secure = url.protocol === 'https:';
    const cookies = parseCookieHeader(AUTH_COOKIE).map((c) => ({
      name: c.name,
      value: c.value,
      domain: url.hostname,
      path: '/',
      httpOnly: true,
      secure,
      sameSite: 'Lax',
    }));
    if (cookies.length > 0) {
      await context.addCookies(cookies);
    }
  }

  return context;
}

async function fetchFoodLogs(request, dateIso) {
  const tz = new Date().getTimezoneOffset();
  const res = await request.get(`${BASE_URL}/api/food-log?date=${encodeURIComponent(dateIso)}&tz=${tz}&t=${Date.now()}`, {
    timeout: 20000,
  });
  if (!res.ok()) {
    throw new Error(`food-log ${dateIso} failed (${res.status()})`);
  }
  const data = await res.json().catch(() => ({}));
  return Array.isArray(data.logs) ? data.logs : [];
}

async function fetchUserData(request) {
  const res = await request.get(`${BASE_URL}/api/user-data`, { timeout: 20000 });
  if (!res.ok()) throw new Error(`/api/user-data failed (${res.status()})`);
  const raw = await res.json().catch(() => ({}));
  return raw?.data || raw || {};
}

function getFavoriteLabel(userData, favoriteId) {
  const favorites = Array.isArray(userData?.favorites) ? userData.favorites : [];
  const fav = favorites.find((f) => String(f?.id || '') === String(favoriteId));
  return String(fav?.label || fav?.description || '').trim();
}

function readSingleItem(log) {
  const items = Array.isArray(log?.items)
    ? log.items
    : Array.isArray(log?.nutrients?.items)
    ? log.nutrients.items
    : [];
  if (!Array.isArray(items) || items.length !== 1) return null;
  return items[0] || null;
}

function scoreCandidate(log) {
  let score = 0;
  const item = readSingleItem(log);
  const itemId = String(item?.id || '').trim().toLowerCase();
  const barcode = String(item?.barcode || item?.gtinUpc || '').trim();
  const method = String(log?.nutrients?.__origin || log?.method || '').toLowerCase();
  const meal = String(log?.meal || log?.category || '').toLowerCase();
  const desc = String(log?.description || log?.name || '').toLowerCase();

  if (item && barcode) score += 20;
  if (item && itemId.startsWith('barcode:')) score += 12;
  if (item && itemId.includes('openfoodfacts')) score += 8;
  if (String(log?.nutrients?.__favoriteManualEdit || '') === 'true') score += 6;
  if (meal.includes('snack')) score += 4;
  if (method === 'meal-builder' || method === 'combined') score -= 8;
  if (desc.includes('water')) score -= 20;

  return score;
}

function findCandidateFromLogs(logs, expectedFavoriteId = '') {
  const favId = String(expectedFavoriteId || '').trim();
  const candidates = [];
  for (const log of logs) {
    if (!log || !log.id) continue;
    const logFavId = String(log?.nutrients?.__favoriteId || '').trim();
    if (!logFavId) continue;
    if (favId && logFavId !== favId) continue;
    const description = String(log.description || log.name || '').trim();
    const meal = String(log.meal || log.category || 'snacks').trim();
    if (!description) continue;
    candidates.push({
      logId: String(log.id),
      favoriteId: logFavId,
      description,
      meal,
      score: scoreCandidate(log),
    });
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.score - a.score);
  const picked = candidates[0];
  return {
    logId: picked.logId,
    favoriteId: picked.favoriteId,
    description: picked.description,
    meal: picked.meal,
  };
}

async function pickCandidate(request) {
  if (TARGET_DATE) {
    const logs = await fetchFoodLogs(request, TARGET_DATE);
    const byId = TARGET_LOG_ID ? logs.find((l) => String(l?.id || '') === TARGET_LOG_ID) : null;
    if (byId) {
      const favoriteId = String(byId?.nutrients?.__favoriteId || TARGET_FAVORITE_ID || '').trim();
      if (!favoriteId) throw new Error('Target log has no linked favorite id');
      return {
        date: TARGET_DATE,
        logId: String(byId.id),
        favoriteId,
        meal: String(byId.meal || byId.category || 'snacks'),
        description: String(byId.description || byId.name || '').trim(),
      };
    }

    const candidate = findCandidateFromLogs(logs, TARGET_FAVORITE_ID);
    if (!candidate) throw new Error(`No linked favorite diary entry found on ${TARGET_DATE}`);
    return { date: TARGET_DATE, ...candidate };
  }

  for (let i = 0; i < LOOKBACK_DAYS; i += 1) {
    const date = withDateOffset(i);
    const logs = await fetchFoodLogs(request, date);
    const byId = TARGET_LOG_ID ? logs.find((l) => String(l?.id || '') === TARGET_LOG_ID) : null;
    if (byId) {
      const favoriteId = String(byId?.nutrients?.__favoriteId || TARGET_FAVORITE_ID || '').trim();
      if (!favoriteId) continue;
      return {
        date,
        logId: String(byId.id),
        favoriteId,
        meal: String(byId.meal || byId.category || 'snacks'),
        description: String(byId.description || byId.name || '').trim(),
      };
    }

    const candidate = findCandidateFromLogs(logs, TARGET_FAVORITE_ID);
    if (candidate) return { date, ...candidate };
  }

  throw new Error('No linked favorite + diary candidate found in lookback window');
}

async function openDiaryDate(page, dateIso) {
  await page.goto(`${BASE_URL}/food`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle');
  const dateInput = page.locator('input[type="date"]').first();
  if (!(await dateInput.count())) throw new Error('Date input not found on /food');
  await dateInput.fill(dateIso);
  await dateInput.dispatchEvent('change');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1200);
}

async function expandAllMeals(page) {
  const labels = ['Breakfast', 'Lunch', 'Dinner', 'Snacks', 'Other'];
  for (const label of labels) {
    const btn = page.getByRole('button', { name: new RegExp(`^${label}`, 'i') }).first();
    if (!(await btn.count())) continue;
    const expanded = await btn.getAttribute('aria-expanded');
    if (expanded !== 'true') {
      await btn.click();
      await page.waitForTimeout(250);
    }
  }
}

async function readDiaryRowTitle(page, logId) {
  const row = page.locator(`[data-food-entry-db-id="${logId}"]`).first();
  if (!(await row.count())) return '';
  const text = await row.innerText();
  return String(text || '').split('\n')[0].trim();
}

async function verifyDiaryTitle(page, dateIso, logId, expectedTitle, tag) {
  await openDiaryDate(page, dateIso);
  await expandAllMeals(page);
  const title = await readDiaryRowTitle(page, logId);
  if (!title) throw new Error(`${tag}: diary row not found for log ${logId}`);
  if (normalizeTitle(title) !== normalizeTitle(expectedTitle)) {
    throw new Error(`${tag}: expected "${expectedTitle}" but saw "${title}"`);
  }
  PASS(`${tag}: diary row title is "${title}"`);
}

async function renameViaEditEntry(page, dateIso, logId, nextName) {
  await openDiaryDate(page, dateIso);
  await expandAllMeals(page);
  const row = page.locator(`[data-food-entry-db-id="${logId}"]`).first();
  if (!(await row.count())) throw new Error(`Edit Entry: row not found for log ${logId}`);

  const menuButton = row.locator('button').last();
  await menuButton.click();
  await page.getByRole('button', { name: /Edit Entry/i }).first().click();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(800);

  const nameInput = page.locator('input[placeholder="e.g., Granola cookies"]').first();
  if (!(await nameInput.count())) throw new Error('Edit Entry: food name input not found');

  await nameInput.click();
  await nameInput.fill('');
  await nameInput.type(nextName, { delay: 8 });
  await page.getByRole('button', { name: /Update Entry/i }).first().click();
  await page.waitForURL((url) => url.pathname === '/food', { timeout: 20000 });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);
}

async function renameViaFavoriteBuilder(page, dateIso, meal, favoriteId, nextName) {
  const mealValue = String(meal || 'snacks').toLowerCase();
  const url = `${BASE_URL}/food/build-meal?date=${encodeURIComponent(dateIso)}&category=${encodeURIComponent(mealValue)}&editFavoriteId=${encodeURIComponent(favoriteId)}`;
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);

  const input = page.locator('div:has-text("Meal name (optional)") + input').first();
  if (!(await input.count())) throw new Error('Favorite rename: meal name input not found');

  await input.click();
  await input.fill('');
  await input.type(nextName, { delay: 8 });
  await page.getByRole('button', { name: /^Update$/i }).first().click();
  await page.waitForURL((url) => url.pathname === '/food', { timeout: 20000 });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
}

async function verifyApiLogTitle(request, dateIso, logId, expectedTitle) {
  let lastLogTitle = '';
  for (let attempt = 1; attempt <= 25; attempt += 1) {
    const logs = await fetchFoodLogs(request, dateIso);
    const row = logs.find((l) => String(l?.id || '') === String(logId));
    if (!row) throw new Error(`API: log ${logId} missing on ${dateIso}`);
    lastLogTitle = String(row.description || row.name || '').trim();
    const logOk = normalizeTitle(lastLogTitle) === normalizeTitle(expectedTitle);
    if (logOk) {
      PASS(`API: log description matches "${expectedTitle}"`);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(`API: expected log "${expectedTitle}" but got "${lastLogTitle}"`);
}

async function verifyApiFavoriteLabel(request, favoriteId, expectedTitle) {
  let lastFavLabel = '';
  for (let attempt = 1; attempt <= 25; attempt += 1) {
    const userData = await fetchUserData(request);
    const favorites = Array.isArray(userData.favorites) ? userData.favorites : [];
    const fav = favorites.find((f) => String(f?.id || '') === String(favoriteId));
    if (!fav) throw new Error(`API: favorite ${favoriteId} missing`);
    lastFavLabel = String(fav?.label || fav?.description || '').trim();
    const favOk = normalizeTitle(lastFavLabel) === normalizeTitle(expectedTitle);
    if (favOk) {
      PASS(`API: favorite label matches "${expectedTitle}"`);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(`API: expected favorite label "${expectedTitle}" but got "${lastFavLabel}"`);
}

async function run() {
  if (!STORAGE_STATE && !AUTH_COOKIE) {
    FAIL('Set CANARY_AUTH_COOKIE or CANARY_STORAGE_STATE first.');
    process.exit(2);
  }
  if (STORAGE_STATE && !fs.existsSync(path.resolve(STORAGE_STATE))) {
    FAIL(`Storage state file not found: ${STORAGE_STATE}`);
    process.exit(2);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await buildContext(browser);
  const page = await context.newPage();
  const request = context.request;

  let candidate = null;
  let canonicalTitle = '';

  try {
    INFO(`Base URL: ${BASE_URL}`);
    candidate = await pickCandidate(request);
    const userData = await fetchUserData(request);
    canonicalTitle = getFavoriteLabel(userData, candidate.favoriteId) || candidate.description;
    INFO(`Candidate: date=${candidate.date} logId=${candidate.logId} favoriteId=${candidate.favoriteId} meal=${candidate.meal}`);
    INFO(`Starting title (favorite source): ${canonicalTitle}`);

    const stamp = Date.now().toString().slice(-4);
    const editTitle = `Rename Guard Edit ${stamp}`;
    const favTitle = `Rename Guard Fav ${stamp}`;

    INFO('Step 1/6: Rename from Edit Entry');
    await renameViaEditEntry(page, candidate.date, candidate.logId, editTitle);
    await verifyDiaryTitle(page, candidate.date, candidate.logId, editTitle, 'Edit rename immediate');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');
    await verifyDiaryTitle(page, candidate.date, candidate.logId, editTitle, 'Edit rename after refresh');
    await verifyApiLogTitle(request, candidate.date, candidate.logId, editTitle);

    INFO('Step 2/6: Restore baseline before Favorites check');
    await renameViaFavoriteBuilder(page, candidate.date, candidate.meal, candidate.favoriteId, canonicalTitle);
    await verifyDiaryTitle(page, candidate.date, candidate.logId, canonicalTitle, 'Baseline restore immediate');
    await verifyApiLogTitle(request, candidate.date, candidate.logId, canonicalTitle);
    await verifyApiFavoriteLabel(request, candidate.favoriteId, canonicalTitle);

    INFO('Step 3/6: Rename from Favorites/Custom editor');
    await renameViaFavoriteBuilder(page, candidate.date, candidate.meal, candidate.favoriteId, favTitle);
    await verifyDiaryTitle(page, candidate.date, candidate.logId, favTitle, 'Favorite rename immediate');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');
    await verifyDiaryTitle(page, candidate.date, candidate.logId, favTitle, 'Favorite rename after refresh');
    await verifyApiLogTitle(request, candidate.date, candidate.logId, favTitle);
    await verifyApiFavoriteLabel(request, candidate.favoriteId, favTitle);

    PASS('Rename sync canary checks passed.');

    if (!SKIP_RESTORE && canonicalTitle && normalizeTitle(canonicalTitle) !== normalizeTitle(favTitle)) {
      INFO('Step 4/6: Restoring original title');
      try {
        await renameViaFavoriteBuilder(page, candidate.date, candidate.meal, candidate.favoriteId, canonicalTitle);
        await verifyApiLogTitle(request, candidate.date, candidate.logId, canonicalTitle);
        await verifyApiFavoriteLabel(request, candidate.favoriteId, canonicalTitle);
        PASS('Original title restored.');
      } catch (restoreError) {
        FAIL(`Restore failed: ${restoreError.message}`);
      }
    }

    await browser.close();
    process.exit(0);
  } catch (error) {
    FAIL(`Rename canary failed: ${error.message || error}`);
    try {
      await page.screenshot({ path: '/tmp/rename-canary-failure.png', fullPage: true });
      INFO('Failure screenshot: /tmp/rename-canary-failure.png');
    } catch {}

    if (!SKIP_RESTORE && candidate && canonicalTitle) {
      try {
        INFO('Attempting best-effort restore after failure...');
        await renameViaFavoriteBuilder(page, candidate.date, candidate.meal, candidate.favoriteId, canonicalTitle);
        await verifyApiLogTitle(request, candidate.date, candidate.logId, canonicalTitle);
        await verifyApiFavoriteLabel(request, candidate.favoriteId, canonicalTitle);
        PASS('Best-effort restore succeeded.');
      } catch (restoreErr) {
        FAIL(`Best-effort restore failed: ${restoreErr.message || restoreErr}`);
      }
    }

    await browser.close();
    process.exit(1);
  }
}

run();
