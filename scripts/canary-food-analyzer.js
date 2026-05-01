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
 *   CANARY_IMAGE_PATH="/path/to/food.jpg" \
 *   CANARY_AUTH_COOKIE="next-auth.session-token=..." \
 *   node scripts/canary-food-analyzer.js
 *
 *   CANARY_AUTH_TOKEN can be used instead of CANARY_AUTH_COOKIE for native-app tokens.
 *
 * Exits 0 on success, non-zero on failure.
 */

const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.CANARY_BASE_URL?.trim() || 'https://helfi.ai';
const AUTH_COOKIE = process.env.CANARY_AUTH_COOKIE?.trim();
const AUTH_TOKEN = process.env.CANARY_AUTH_TOKEN?.trim();
const IMAGE_PATH = process.env.CANARY_IMAGE_PATH?.trim();
const TEXT =
  process.env.CANARY_TEXT?.trim() ||
  'A plate with scrambled eggs (2 eggs), crispy bacon (3 slices), a sesame bagel with cream cheese, and a glass of orange juice.';

if (!AUTH_COOKIE && !AUTH_TOKEN) {
  console.error('❌ CANARY_AUTH_COOKIE or CANARY_AUTH_TOKEN is required (provide a valid session for helfi.ai).');
  process.exit(2);
}

const target = `${BASE_URL.replace(/\/$/, '')}/api/analyze-food`;

function hasCardNutrition(item) {
  if (!item || typeof item !== 'object') return false;
  const name = String(item.name || '').trim();
  const serving = String(item.serving_size || item.servingSize || '').trim();
  const hasMacros = ['calories', 'protein_g', 'carbs_g', 'fat_g'].every((key) => {
    const value = Number(item[key] ?? item[key.replace('_g', '')]);
    return Number.isFinite(value);
  });
  return Boolean(name && serving && hasMacros);
}

function imageMime(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  return 'image/jpeg';
}

async function main() {
  console.log(`🔎 Canary: POST ${target}`);
  if (IMAGE_PATH) {
    console.log(`   Image: ${IMAGE_PATH}`);
  } else {
    console.log(`   Text: ${TEXT}`);
  }

  let body;
  const headers = {};
  if (AUTH_COOKIE) headers.cookie = AUTH_COOKIE;
  if (AUTH_TOKEN) {
    headers.authorization = `Bearer ${AUTH_TOKEN}`;
    headers['x-native-token'] = AUTH_TOKEN;
    headers.cookie = [
      `next-auth.session-token=${AUTH_TOKEN}`,
      `authjs.session-token=${AUTH_TOKEN}`,
      `__Secure-next-auth.session-token=${AUTH_TOKEN}`,
      `__Secure-authjs.session-token=${AUTH_TOKEN}`,
    ].join('; ');
  }
  if (IMAGE_PATH) {
    const buffer = fs.readFileSync(IMAGE_PATH);
    body = new FormData();
    body.append('image', new Blob([buffer], { type: imageMime(IMAGE_PATH) }), path.basename(IMAGE_PATH));
    body.append('foodType', 'meal');
    body.append('analysisMode', 'auto');
    body.append('returnItems', 'true');
    body.append('multi', 'true');
    body.append('forceFresh', '1');
  } else {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify({
      textDescription: TEXT,
      foodType: 'meal',
      analysisMode: 'auto',
      returnItems: true,
      multi: true,
    });
  }

  const res = await fetch(target, {
    method: 'POST',
    headers,
    body,
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
  const cardReadyItems = items.filter(hasCardNutrition);

  console.log(`   Items returned: ${items.length} (${itemNames.join(', ') || 'no names'})`);
  console.log(`   Card-ready items: ${cardReadyItems.length}`);

  if (items.length < 2) {
    console.error('❌ Canary failed: expected at least 2 items (separate components).');
    process.exit(1);
  }

  if (cardReadyItems.length !== items.length) {
    console.error('❌ Canary failed: every returned item must have name, serving size, calories, protein, carbs, and fat for ingredient cards.');
    process.exit(1);
  }

  console.log('✅ Canary passed: analyzer returned multiple card-ready components.');
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Canary error:', err);
  process.exit(1);
});
