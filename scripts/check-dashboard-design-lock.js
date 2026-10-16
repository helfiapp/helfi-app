#!/usr/bin/env node
// Owner-approved 17 October 2026. Generic page-lock overrides cannot bypass this lock.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function assertDashboardDesignLock(readFile = fs.readFileSync) {
  const root = path.join(__dirname, '..');
  const approved = JSON.parse(readFile(path.join(__dirname, 'dashboard-design-lock.json'), 'utf8'));
  const required = [
    'native/src/screens/DashboardScreen.tsx',
    'native/src/ui/theme.ts',
    'native/src/ui/Screen.tsx',
    'native/src/navigation/NativeBottomNav.tsx',
    'native/assets/helfi-logo.png',
  ];
  for (const file of required) {
    let hash;
    try {
      hash = crypto.createHash('sha256').update(readFile(path.join(root, file))).digest('hex');
    } catch {
      throw new Error(`Approved Dashboard design file is missing: ${file}`);
    }
    if (!approved.files || approved.files[file] !== hash) {
      throw new Error(
        `Owner-approved Dashboard design changed: ${file}. ` +
        'The compact Dashboard is locked by the owner (17 October 2026). ' +
        'Do not restore older styling, use a generic override, or refresh the baseline. ' +
        'A new explicit owner approval for this exact change is required.'
      );
    }
  }
  return required.length;
}

module.exports = { assertDashboardDesignLock };

if (require.main === module) {
  try {
    console.log(`Approved Dashboard design lock passed (${assertDashboardDesignLock()} files).`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
