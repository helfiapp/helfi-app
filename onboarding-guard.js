// Lightweight guard: scans onboarding file for risky patterns and exits non-zero with a clear message
const fs = require('fs');
const path = require('path');

const target = path.join(__dirname, 'app/onboarding/page.tsx');
const src = fs.readFileSync(target, 'utf8');
const lines = src.split(/\r?\n/);

const failures = [];

// 1) Full-screen fixed wrapper (bad) — only for the container with id="onboarding-container"
const containerLine = lines.find(l => l.includes('id="onboarding-container"')) || '';
if (/className\s*=\s*\"[^\"]*\bfixed\b[^\"]*\binset-0\b/.test(containerLine)) {
  failures.push('Detected fixed inset-0 on #onboarding-container. Use normal scrolling container, not fixed.');
}

// 2) Pointer-events suppression on header or bottom nav (bad) — check on the same line as sticky header or fixed bottom nav
const headerLine = lines.find(l => l.includes('sticky top-0')) || '';
const bottomLine = lines.find(l => l.includes('fixed bottom-0')) || '';
if (/pointer-events-none/.test(headerLine) || /pointer-events-none/.test(bottomLine)) {
  failures.push('Detected pointer-events-none on header or bottom nav. Remove it to avoid iOS tap misrouting.');
}

// 3) Numeric expand state usage (bad)
if (/useState<Set<number>>/i.test(src) || /new Set<number>\(/i.test(src)) {
  failures.push('Detected numeric Set for accordion expansion. Use stable string keys instead.');
}

// 4) Buttons without explicit type (risky) — scoped to InteractionAnalysisStep only
const stepStart = src.indexOf('function InteractionAnalysisStep');
const stepEnd = src.indexOf('export default function Onboarding');
const stepSrc = stepStart !== -1 && stepEnd !== -1 ? src.slice(stepStart, stepEnd) : '';
const buttonWithoutType = stepSrc.match(/<button(?![^>]*type=)[^>]*onClick=/g);
if (buttonWithoutType && buttonWithoutType.length > 0) {
  failures.push('Found button(s) with onClick but no type="button". Add type to prevent accidental form submits.');
}

if (failures.length) {
  console.error('\n❌ Onboarding Guard failed with the following issues:');
  for (const f of failures) console.error(' - ' + f);
  console.error('\nFix the above before committing changes to app/onboarding/page.tsx.');
  process.exit(1);
}

console.log('✅ Onboarding Guard passed.');


