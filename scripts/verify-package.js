#!/usr/bin/env node
// Verifies a Phravexa store ZIP: exact file list, valid manifest, version in
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

// Resolves __MSG_key__ references against one locale of the ZIP
const localeCache = {};
function readLocale(locale) {
  if (!(locale in localeCache)) {
    try {
      localeCache[locale] = JSON.parse(execFileSync('unzip', ['-p', zipPath, `_locales/${locale}/messages.json`], { encoding: 'utf8' }));
    } catch (e) {
      errors.push(`_locales/${locale}/messages.json is missing or not valid JSON`);
      localeCache[locale] = {};
    }
  }
  return localeCache[locale];
}
function resolve(value, locale) {
  const match = /^__MSG_(\w+)__$/.exec(value || '');
  if (!match) return value;
  const entry = readLocale(locale)[match[1]];
  if (!entry || typeof entry.message !== 'string') {
    errors.push(`${locale}: message ${match[1]} is missing`);
    return '';
  }
  return entry.message;
}

if (manifest) {
  if (manifest.manifest_version !== 3) errors.push('manifest_version must be 3');
  const locales = entries.map(e => /^_locales\/([^/]+)\/messages\.json$/.exec(e)).filter(Boolean).map(m => m[1]);
  const usesMessages = JSON.stringify(manifest).includes('__MSG_');
  if (usesMessages && !manifest.default_locale) errors.push('manifest uses __MSG_ but has no default_locale');
  if (manifest.default_locale && !locales.includes(manifest.default_locale)) errors.push(`default_locale ${manifest.default_locale} has no messages.json`);
  for (const locale of (locales.length ? locales : [null])) {
    const name = locale ? resolve(manifest.name, locale) : manifest.name;
    const description = locale ? resolve(manifest.description, locale) : manifest.description;
    const label = locale ? `${locale}: ` : '';
    if (!name || name.length > 75) errors.push(`${label}name missing or longer than 75 characters`);
    if (!description || description.length > 132) errors.push(`${label}description missing or longer than 132 characters`);
  }
  // The store listing name is fixed
  const enName = manifest.default_locale ? resolve(manifest.name, manifest.default_locale) : manifest.name;
  if (enName !== 'AI Translate & Rephrase - Phravexa') errors.push(`unexpected name: ${enName}`);
  if (!/^\d+(\.\d+){0,3}$/.test(manifest.version || '')) errors.push(`invalid version: ${manifest.version}`);
  const expectedName = `phravexa-${manifest.version}.zip`;
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
  const runtime = ['lib/core.js', 'lib/i18n.js', 'content.js', 'content.css', 'offscreen.html', 'offscreen.js'];
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
