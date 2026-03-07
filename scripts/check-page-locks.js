#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const SNAPSHOT_PATH = path.join(__dirname, 'page-locks.json');
const args = new Set(process.argv.slice(2));
const WRITE_MODE = args.has('--write');
const scopeArg = [...args].find((arg) => arg.startsWith('--scope='));
const scope = scopeArg ? scopeArg.split('=')[1] : 'all';

const GROUPS = [
  {
    name: 'web-routes',
    roots: ['app'],
    include: (rel) => /(^|\/)(page|layout|loading)\.(ts|tsx)$/.test(rel),
  },
  {
    name: 'web-components',
    roots: ['components'],
    include: (rel) => /\.(ts|tsx)$/.test(rel),
  },
  {
    name: 'native-ui',
    roots: ['native/src'],
    include: (rel) => /\.(ts|tsx)$/.test(rel),
  },
];

function selectedGroups() {
  return GROUPS.filter((group) => scope === 'all' || group.name === scope);
}

function normalize(p) {
  return p.split(path.sep).join('/');
}

function hashFile(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

function walk(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  const results = [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === '.expo') continue;
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      results.push(...walk(fullPath));
    } else if (entry.isFile()) {
      results.push(fullPath);
    }
  }
  return results;
}

function parseAllowList() {
  return String(process.env.ALLOW_LOCKED_FILES || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function isAllowed(relPath, allowList) {
  return allowList.some((item) => {
    if (item === '*') return true;
    if (item.endsWith('/**')) return relPath.startsWith(item.slice(0, -3));
    return item === relPath;
  });
}

function collectFiles() {
  const files = {};
  for (const group of selectedGroups()) {
    for (const root of group.roots) {
      const absRoot = path.join(ROOT, root);
      for (const filePath of walk(absRoot)) {
        const relPath = normalize(path.relative(ROOT, filePath));
        if (group.include(relPath)) {
          files[relPath] = hashFile(filePath);
        }
      }
    }
  }
  return Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b)));
}

function fileBelongsToSelectedScope(relPath) {
  return selectedGroups().some((group) =>
    group.roots.some((root) => relPath === root || relPath.startsWith(`${root}/`))
  );
}

function fail(messageLines) {
  console.error('\n❌ Page Lock failed\n');
  for (const line of messageLines) console.error(line);
  console.error('\nTo intentionally edit a locked file, set ALLOW_LOCKED_FILES to the exact file path(s), then refresh the snapshot after approval.\n');
  process.exit(1);
}

function main() {
  const current = collectFiles();

  if (WRITE_MODE) {
    const payload = {
      generatedAt: new Date().toISOString(),
      scope,
      files: current,
    };
    fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(payload, null, 2) + '\n');
    console.log(`Updated ${path.relative(ROOT, SNAPSHOT_PATH)} with ${Object.keys(current).length} locked files.`);
    return;
  }

  if (!fs.existsSync(SNAPSHOT_PATH)) {
    fail([`Missing snapshot file: ${normalize(path.relative(ROOT, SNAPSHOT_PATH))}`]);
  }

  const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8'));
  const expected = Object.fromEntries(
    Object.entries(snapshot.files || {}).filter(([relPath]) => fileBelongsToSelectedScope(relPath))
  );
  const allowList = parseAllowList();
  const problems = [];

  const allPaths = new Set([...Object.keys(expected), ...Object.keys(current)]);
  for (const relPath of [...allPaths].sort()) {
    const expectedHash = expected[relPath];
    const currentHash = current[relPath];
    if (expectedHash === currentHash) continue;
    if (isAllowed(relPath, allowList)) continue;

    if (!expectedHash && currentHash) {
      problems.push(`Added locked file: ${relPath}`);
    } else if (expectedHash && !currentHash) {
      problems.push(`Removed locked file: ${relPath}`);
    } else {
      problems.push(`Changed locked file: ${relPath}`);
    }
  }

  if (problems.length) {
    fail(problems.slice(0, 40));
  }

  console.log(`✅ Page Lock passed (${Object.keys(current).length} locked files checked).`);
}

main();
