'use strict';
// Checks the _locales files: same keys and placeholders in every language,
// store limits, and that the English fallbacks written in the code match
// _locales/en (the extension shows the messages.json text, tests and Node see
// the fallback, so the two must not drift apart).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const EXT = path.join(__dirname, '..', 'extension');
const LOCALES_DIR = path.join(EXT, '_locales');
const LOCALES = ['en', 'es', 'fr', 'de', 'he'];
const read = (locale) => JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, locale, 'messages.json'), 'utf8'));
const en = read('en');
const manifest = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));

// Minimal chrome.i18n.getMessage with Chrome's placeholder rules
function makeGetMessage(messages) {
  return (key, substitutions) => {
    const entry = messages[key];
    if (!entry) return '';
    const subs = substitutions == null ? [] : [].concat(substitutions);
    const withPlaceholders = entry.message.replace(/\$(\w+)\$/g, (_, name) => {
      const ph = entry.placeholders && entry.placeholders[name.toLowerCase()];
      return ph ? ph.content : '';
    });
    return withPlaceholders.replace(/\$(\d)|\$\$/g, (m, n) => (n ? (subs[n - 1] ?? '') : '$'));
  };
}

test('every locale exists and has exactly the English keys', () => {
  assert.equal(manifest.default_locale, 'en');
  const actual = fs.readdirSync(LOCALES_DIR).sort();
  assert.deepEqual(actual, [...LOCALES].sort());
  for (const locale of LOCALES) {
    const messages = read(locale);
    assert.deepEqual(Object.keys(messages).sort(), Object.keys(en).sort(), `${locale} keys`);
  }
});

test('placeholders are declared, used and consistent across locales', () => {
  for (const locale of LOCALES) {
    const messages = read(locale);
    for (const [key, entry] of Object.entries(messages)) {
      assert.equal(typeof entry.message, 'string', `${locale}.${key}`);
      assert.ok(entry.message.trim(), `${locale}.${key} is empty`);
      const used = [...entry.message.matchAll(/\$(\w+)\$/g)].map(m => m[1].toLowerCase()).sort();
      const declared = Object.keys(entry.placeholders || {}).sort();
      assert.deepEqual([...new Set(used)], declared, `${locale}.${key} placeholders`);
      assert.deepEqual(entry.placeholders || {}, en[key].placeholders || {}, `${locale}.${key} placeholder contents`);
    }
  }
});

test('store name stays fixed and descriptions fit the store limit', () => {
  // The name is not localised: the listing name is "AI Translate & Rephrase - Phravexa"
  assert.equal(manifest.name, 'AI Translate & Rephrase - Phravexa');
  const descKey = /^__MSG_(\w+)__$/.exec(manifest.description)[1];
  for (const locale of LOCALES) {
    const description = read(locale)[descKey].message;
    assert.ok(description.length <= 132, `${locale} description is ${description.length} characters`);
  }
  assert.equal(en[descKey].message,
    'Instantly translate and refine text in any text box. Add unlimited languages and customize prompts to match your tone and style.');
  const commandKey = /^__MSG_(\w+)__$/.exec(manifest.commands['transform-selection'].description)[1];
  assert.equal(en[commandKey].message, 'Translate/rephrase selection with last-used language');
});

test('English fallbacks in scripts and pages match _locales/en', () => {
  const sources = ['background.js', 'content.js', 'options.js', 'popup.js', 'lib/core.js'];
  let checked = 0;
  for (const file of sources) {
    const code = fs.readFileSync(path.join(EXT, file), 'utf8');
    for (const m of code.matchAll(/\b(?:t|msg)\('(\w+)',\s*('([^']*)'|"([^"]*)"|`([^`]*)`)/g)) {
      const key = m[1];
      assert.ok(en[key], `${file}: unknown message ${key}`);
      const expected = en[key].message;
      if (m[3] !== undefined || m[4] !== undefined) {
        const fallback = m[3] !== undefined ? m[3] : m[4];
        // popup.js splits one message around a marker
        if (!fallback.includes('{{key}}')) assert.equal(fallback, expected, `${file}: ${key}`);
      } else {
        // Template literal: compare the fixed text around the substitutions
        const skeleton = m[5].replace(/\$\{[^}]+\}/g, '\u0001');
        assert.equal(skeleton, expected.replace(/\$\w+\$/g, '\u0001'), `${file}: ${key}`);
      }
      checked++;
    }
  }
  for (const file of ['options.html', 'popup.html']) {
    const html = fs.readFileSync(path.join(EXT, file), 'utf8');
    for (const m of html.matchAll(/data-i18n="(\w+)"[^>]*>([^<]*)</g)) {
      assert.ok(en[m[1]], `${file}: unknown message ${m[1]}`);
      assert.equal(m[2].replace(/\s+/g, ' ').trim(), en[m[1]].message, `${file}: ${m[1]}`);
      checked++;
    }
    for (const m of html.matchAll(/placeholder="([^"]*)" data-i18n-placeholder="(\w+)"/g)) {
      assert.equal(m[1], en[m[2]].message, `${file}: ${m[2]}`);
      checked++;
    }
  }
  assert.ok(checked > 60, `only ${checked} strings checked`);
});

test('core error messages read from chrome.i18n equal the English fallbacks', () => {
  const core = require('../extension/lib/core.js');
  const errorCases = () => [
    ...[401, 402, 404, 429, 400, 500, 418].map(s => core.classifyHttpError(s, '{"error":{"message":"bad model not found"}}', 'OpenAI')),
    core.classifyHttpError(503, '', undefined),
    core.classifyNetworkError({ name: 'AbortError' }),
    core.classifyNetworkError(new TypeError('x')),
    core.badResponseError('DeepSeek'),
    core.badResponseError(),
    core.emptyResultError(),
    ...[{ text: '' }, { text: 'x'.repeat(core.MAX_INPUT_CHARS + 1) }, { text: '', blocked: 'password' }].map(sel => {
      try { core.validateSelection(sel); } catch (e) { return e; }
      return null;
    }),
    (() => { try { core.buildRequest({ provider: 'nope', apiKey: 'k', prompt: 'p' }); } catch (e) { return e; } })(),
    (() => { try { core.parseResponse('openai', { choices: [{ message: { content: '', refusal: 'no' } }] }); } catch (e) { return e; } })()
  ].map(e => ({ title: e.title, message: e.message, code: e.code }));

  const plain = errorCases();
  globalThis.chrome = { i18n: { getMessage: makeGetMessage(en), getUILanguage: () => 'en-US' } };
  try {
    const localised = errorCases();
    assert.deepEqual(localised, plain);
    // And another locale really changes the text
    globalThis.chrome.i18n.getMessage = makeGetMessage(read('es'));
    const es = core.classifyHttpError(401, '', 'OpenAI');
    assert.equal(es.message, 'OpenAI ha rechazado tu clave de API. Revísala en la configuración de Phravexa.');
  } finally {
    delete globalThis.chrome;
  }
  assert.equal(plain.length, 18);
  assert.ok(plain.every(p => p.title && p.message));
});
