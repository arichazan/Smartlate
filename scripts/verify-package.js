#!/usr/bin/env node
// Verifies a Smartlate store ZIP: exact file list, valid manifest, version in
// file name matches the manifest, and every file the manifest references exists.
// Usage: node scripts/verify-package.js <zip> <expected files...>
'use strict';
const { execFileSync } = require('child_process');
const path = require('path');

const [zipPath, ...expected] = process.argv.slice(2);
if (!zipPath || expected.length === 0) {
  console.error('Usage: verify-package.js <zip> <expected files...>');
  process.exit(2);
}

const errors = [];
const entries = execFileSync('unzip', ['-Z1', zipPath], { encoding: 'utf8' })
  .split('\n').map(s => s.trim()).filter(s => s && !s.endsWith('/'));
const entrySet = new Set(entries);

for (const file of expected) {
  if (!entrySet.has(file)) errors.push(`missing from ZIP: ${file}`);
}
for (const entry of entries) {
  if (!expected.includes(entry)) errors.push(`unexpected file in ZIP: ${entry}`);
  if (/(^|\/)(\.|__MACOSX|node_modules|tests?\/)|\.(md|sh|pem|crx|zip|log|af)$/i.test(entry)) {
    errors.push(`development or secret file in ZIP: ${entry}`);
  }
}

let manifest;
try {
  manifest = JSON.parse(execFileSync('unzip', ['-p', zipPath, 'manifest.json'], { encoding: 'utf8' }));
} catch (e) {
  errors.push(`manifest.json is not valid JSON: ${e.message}`);
}

if (manifest) {
  if (manifest.manifest_version !== 3) errors.push('manifest_version must be 3');
  if (!manifest.name || manifest.name.length > 75) errors.push('name missing or longer than 75 characters');
  if (!manifest.description || manifest.description.length > 132) errors.push('description missing or longer than 132 characters');
  if (!/^\d+(\.\d+){0,3}$/.test(manifest.version || '')) errors.push(`invalid version: ${manifest.version}`);
  const expectedName = `smartlate-${manifest.version}.zip`;
  if (path.basename(zipPath) !== expectedName) errors.push(`ZIP should be named ${expectedName}`);

  const referenced = [
    manifest.background && manifest.background.service_worker,
    manifest.options_page,
    manifest.action && manifest.action.default_popup,
    ...Object.values(manifest.icons || {}),
    ...Object.values((manifest.action && manifest.action.default_icon) || {})
  ].filter(Boolean);
  for (const ref of referenced) {
    if (!entrySet.has(ref)) errors.push(`manifest references missing file: ${ref}`);
  }

  // Files loaded at runtime by scripts/pages
  const runtime = ['lib/core.js', 'content.js', 'content.css', 'offscreen.html', 'offscreen.js'];
  for (const ref of runtime) {
    if (!entrySet.has(ref)) errors.push(`runtime file missing: ${ref}`);
  }
}

if (errors.length) {
  console.error('Package verification FAILED:');
  errors.forEach(e => console.error('  - ' + e));
  process.exit(1);
}
console.log(`Package verified: ${entries.length} files, version ${manifest.version}`);
