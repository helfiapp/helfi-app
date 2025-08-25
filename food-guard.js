// Lightweight guard for Food feature: ensures critical patterns remain intact
const fs = require('fs');
const path = require('path');

const foodPage = path.join(__dirname, 'app/food/page.tsx');
const foodApi = path.join(__dirname, 'app/api/analyze-food/route.ts');

const failures = [];

// 1) Ensure UI regex targets exist (Calories, Protein, Carbs, Fat)
try {
  const ui = fs.readFileSync(foodPage, 'utf8');
  if (!/calories?[:\s]*\(\?<(?:=|!)?/.test('')) {
    // no-op to keep linter happy
  }
  if (!/calories?[:\s]*\(\d+\)/.test('')) {
    // placeholder
  }
  if (!/calories?[:\s]*\(\d+\)/.test('')) {}
  if (!/Calories/i.test(ui) || !/Protein/i.test(ui) || !/Carbs?/i.test(ui) || !/Fat/i.test(ui)) {
    failures.push('Food UI no longer references Calories/Protein/Carbs/Fat labels. Do not remove these.');
  }
  if (!/const extractNutritionData/.test(ui)) {
    failures.push('extractNutritionData function missing from Food UI. Cards will not render.');
  }
} catch (e) {
  failures.push('Unable to read Food UI at app/food/page.tsx');
}

// 2) Ensure API prompt requires exact nutrition line and fallback exists
try {
  const api = fs.readFileSync(foodApi, 'utf8');
  if (!/ALWAYS include a single nutrition line/i.test(api)) {
    failures.push('API prompt no longer requires the single nutrition line. Restore requirement.');
  }
  if (!/Server-side safeguard: ensure nutrition line is present/i.test(api)) {
    failures.push('API fallback to append nutrition line is missing. Restore fallback.');
  }
} catch (e) {
  failures.push('Unable to read Food API at app/api/analyze-food/route.ts');
}

if (failures.length) {
  console.error('\n❌ Food Guard failed with the following issues:');
  for (const f of failures) console.error(' - ' + f);
  console.error('\nFix these to avoid breaking the Food feature (nutrition cards).');
  process.exit(1);
}

console.log('✅ Food Guard passed.');



