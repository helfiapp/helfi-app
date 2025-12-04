#!/usr/bin/env node
/**
 * Canary: checks that /api/analyze-food returns multiple ingredient cards.
 * Usage:
 *   CANARY_AUTH_COOKIE="next-auth.session-token=..." node scripts/canary-food-analyzer.js
 *
 * Optional:
 *   CANARY_BASE_URL=https://helfi.afb1h18x4-louie-veleskis-projects.vercel.app \
 *   CANARY_TEXT="Plate with scrambled eggs, bacon, toast with butter, and orange juice." \
 *   node scripts/canary-food-analyzer.js
 *
 * Exits 0 on success, non-zero on failure.
 */

const BASE_URL = process.env.CANARY_BASE_URL?.trim() || 'https://helfi.ai';
const AUTH_COOKIE = process.env.CANARY_AUTH_COOKIE?.trim();
const TEXT =
  process.env.CANARY_TEXT?.trim() ||
  'A plate with scrambled eggs (2 eggs), crispy bacon (3 slices), a sesame bagel with cream cheese, and a glass of orange juice.';

if (!AUTH_COOKIE) {
  console.error('❌ CANARY_AUTH_COOKIE is required (provide a valid session cookie for helfi.ai).');
  process.exit(2);
}

const target = `${BASE_URL.replace(/\/$/, '')}/api/analyze-food`;

async function main() {
  console.log(`🔎 Canary: POST ${target}`);
  console.log(`   Text: ${TEXT}`);

  const res = await fetch(target, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie: AUTH_COOKIE,
    },
    body: JSON.stringify({
      textDescription: TEXT,
      foodType: 'meal',
      analysisMode: 'auto',
      returnItems: true,
      multi: true,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`❌ API returned ${res.status} ${res.statusText}`);
    console.error(text);
    process.exit(1);
  }

  const data = await res.json();
  const items = Array.isArray(data.items) ? data.items : [];
  const itemNames = items.map((i) => i?.name).filter(Boolean);

  console.log(`   Items returned: ${items.length} (${itemNames.join(', ') || 'no names'})`);

  if (items.length < 2) {
    console.error('❌ Canary failed: expected at least 2 items (separate components).');
    process.exit(1);
  }

  console.log('✅ Canary passed: analyzer returned multiple components.');
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Canary error:', err);
  process.exit(1);
});
