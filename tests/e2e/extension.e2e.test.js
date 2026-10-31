'use strict';
// End-to-end tests: loads the unpacked extension in Chromium with Playwright,
// stubs the provider API inside the service worker, and checks the full
// selection -> prompt -> response -> clipboard -> in-page popup flow.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

const EXT_SRC = path.join(__dirname, '..', '..', 'extension');

const PAGE_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>Fixture</title></head><body>
<div id="rich"><h2>Greeting</h2><p>Hello <b>bold</b> and <a href="/docs">link</a>.</p><ul><li>One</li><li>Two</li></ul></div>
<textarea id="plain">Line one

Line two</textarea>
<input id="field" value="Good morning team">
<div id="editor" contenteditable="true"><p>Hello <b>world</b></p></div>
</body></html>`;

let context, worker, server, baseUrl, userDataDir, extDir;

// The store build relies on activeTab, which is only granted by a real user
// gesture. The test copy adds a host permission for the local fixture server
// so scripts can be injected without one.
function prepareTestExtension() {
  extDir = fs.mkdtempSync(path.join(os.tmpdir(), 'phravexa-ext-'));
  fs.cpSync(EXT_SRC, extDir, { recursive: true });
  const manifestPath = path.join(extDir, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.host_permissions.push('http://127.0.0.1/*');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}

test.before(async () => {
  prepareTestExtension();
  server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(PAGE_HTML);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  baseUrl = `http://127.0.0.1:${server.address().port}/`;

  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'phravexa-profile-'));
  context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless: true,
    args: [`--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`]
  });
  worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: baseUrl.replace(/\/$/, '') });
});

test.after(async () => {
  if (context) await context.close();
  if (server) server.close();
  for (const dir of [userDataDir, extDir]) {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  }
});

// Replaces fetch in the service worker with a stub that records requests
async function stubProvider(response) {
  await worker.evaluate((response) => {
    self.__requests = [];
    self.fetch = async (url, init) => {
      self.__requests.push({ url, init: { headers: init.headers, body: init.body } });
      if (response.networkError) throw new TypeError('Failed to fetch');
      return new Response(JSON.stringify(response.body), { status: response.status || 200, headers: { 'Content-Type': 'application/json' } });
    };
  }, response);
}

async function configure(settings) {
  await worker.evaluate(async (s) => {
    await chrome.storage.local.clear();
    await chrome.storage.local.set({ apiKeys: s.apiKeys || {} });
    await chrome.storage.sync.set({ provider: s.provider, tone: 'Friendly' });
  }, settings);
}

async function openFixture() {
  const page = await context.newPage();
  await page.goto(baseUrl);
  return page;
}

async function runMenuAction(page, language, selectionText = 'ignored') {
  await page.bringToFront();
  await worker.evaluate(async ({ url, language, selectionText }) => {
    const [tab] = await chrome.tabs.query({ url });
    const info = { frameId: 0, selectionText, menuItemId: `lang-${language}` };
    const selection = await getSelection(info, tab);
    await handleTextTransformation(selection, language, tab, 0);
  }, { url: baseUrl, language, selectionText });
}

async function popupText(page) {
  const popup = page.locator('.ai-text-tuner-popup');
  await popup.first().waitFor({ state: 'attached', timeout: 5000 });
  return popup.first().innerText();
}

test('service worker boots with the core module and defaults', async () => {
  // onInstalled runs asynchronously right after the worker starts
  for (let i = 0; i < 50; i++) {
    const { tone } = await worker.evaluate(() => chrome.storage.sync.get(['tone']));
    if (tone) break;
    await new Promise(r => setTimeout(r, 100));
  }
  const state = await worker.evaluate(async () => ({
    hasCore: typeof self.PhravexaCore === 'object',
    sync: await chrome.storage.sync.get(['languages', 'tone']),
    manifest: chrome.runtime.getManifest()
  }));
  assert.equal(state.hasCore, true);
  assert.deepEqual(state.sync.languages, ['German', 'Spanish', 'French', 'Chinese']);
  assert.ok(state.sync.tone.length > 0);
  assert.equal(state.manifest.name, 'AI Translate & Rephrase - Phravexa');
});

test('formatted selection is translated, copied as HTML and confirmed in the page', async () => {
  await configure({ provider: 'anthropic', apiKeys: { anthropic: 'test-key' } });
  await stubProvider({ body: {
    content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: '```html\n<h2>Saludo</h2><p>Hola <b>negrita</b> y <a href="http://x/docs">enlace</a>.</p><ul><li>Uno</li><li>Dos</li></ul>\n```' }],
    stop_reason: 'end_turn'
  } });
  const page = await openFixture();
  await page.evaluate(() => {
    const range = document.createRange();
    range.selectNodeContents(document.getElementById('rich'));
    getSelection().removeAllRanges();
    getSelection().addRange(range);
  });
  await runMenuAction(page, 'Spanish');

  const requests = await worker.evaluate(() => self.__requests);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://api.anthropic.com/v1/messages');
  assert.equal(requests[0].init.headers['x-api-key'], 'test-key');
  const prompt = JSON.parse(requests[0].init.body).messages[0].content;
  assert.match(prompt, /Translate the following HTML to Spanish/);
  assert.match(prompt, /<b>bold<\/b>/);
  assert.match(prompt, new RegExp(`href="${baseUrl}docs"`), 'relative links are made absolute');

  const text = await popupText(page);
  assert.match(text, /Copied to clipboard/);
  assert.match(text, /Hola negrita/);

  const clip = await page.evaluate(async () => {
    const items = await navigator.clipboard.read();
    const html = await (await items[0].getType('text/html')).text();
    const plain = await (await items[0].getType('text/plain')).text();
    return { html, plain };
  });
  assert.match(clip.html, /<h2>Saludo<\/h2>/);
  assert.match(clip.html, /<b>negrita<\/b>/);
  assert.doesNotMatch(clip.html, /```/);
  assert.match(clip.plain, /Saludo\s*\n/);
  await page.close();
});

test('plain textarea selection keeps line breaks', async () => {
  await configure({ provider: 'openai', apiKeys: { openai: 'sk-test' } });
  await stubProvider({ body: { choices: [{ message: { content: '"Línea uno\n\nLínea dos"' }, finish_reason: 'stop' }] } });
  const page = await openFixture();
  await page.evaluate(() => {
    const t = document.getElementById('plain');
    t.focus();
    t.setSelectionRange(0, t.value.length);
  });
  await runMenuAction(page, 'Spanish');
  const req = (await worker.evaluate(() => self.__requests))[0];
  assert.equal(req.url, 'https://api.openai.com/v1/chat/completions');
  assert.ok(JSON.parse(req.init.body).messages[0].content.endsWith('Line one\n\nLine two'));
  await popupText(page);
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  assert.equal(clip, 'Línea uno\n\nLínea dos');
  await page.close();
});

for (const [name, response, expected] of [
  ['invalid key', { status: 401, body: { error: { message: 'Incorrect API key' } } }, /Invalid API Key/],
  ['rate limit', { status: 429, body: { error: { message: 'Rate limit reached' } } }, /Rate Limit/],
  ['network failure', { networkError: true }, /Network Error/],
  ['empty result', { body: { choices: [{ message: { content: '' } }] } }, /Empty Result/]
]) {
  test(`shows an error popup for ${name}`, async () => {
    await configure({ provider: 'deepseek', apiKeys: { deepseek: 'dk' } });
    await stubProvider(response);
    const page = await openFixture();
    await page.evaluate(() => {
      const t = document.getElementById('plain');
      t.focus();
      t.setSelectionRange(0, 8);
    });
    await runMenuAction(page, 'German');
    assert.match(await popupText(page), expected);
    await page.close();
  });
}

test('selection in an input is replaced in place and also copied', async () => {
  await configure({ provider: 'openai', apiKeys: { openai: 'sk-test' } });
  await stubProvider({ body: { choices: [{ message: { content: 'Buenos días' }, finish_reason: 'stop' }] } });
  const page = await openFixture();
  await page.evaluate(() => {
    const f = document.getElementById('field');
    f.focus();
    f.setSelectionRange(0, 12);
  });
  await runMenuAction(page, 'Spanish');
  assert.match(await popupText(page), /Text replaced/);
  assert.equal(await page.inputValue('#field'), 'Buenos días team');
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), 'Buenos días');
  await page.close();
});

test('selection in a rich-text editor is replaced in place', async () => {
  await configure({ provider: 'openai', apiKeys: { openai: 'sk-test' } });
  await stubProvider({ body: { choices: [{ message: { content: 'mundo' }, finish_reason: 'stop' }] } });
  const page = await openFixture();
  await page.evaluate(() => {
    const b = document.querySelector('#editor b');
    document.getElementById('editor').focus();
    const r = document.createRange();
    r.selectNodeContents(b);
    const s = getSelection();
    s.removeAllRanges();
    s.addRange(r);
  });
  await runMenuAction(page, 'Spanish');
  assert.match(await popupText(page), /Text replaced/);
  assert.match(await page.locator('#editor').innerText(), /Hello\s+mundo/);
  await page.close();
});

test('a truncated result is copied but never replaces the selection', async () => {
  await configure({ provider: 'openai', apiKeys: { openai: 'sk-test' } });
  await stubProvider({ body: { choices: [{ message: { content: 'Buenos' }, finish_reason: 'length' }] } });
  const page = await openFixture();
  await page.evaluate(() => {
    const f = document.getElementById('field');
    f.focus();
    f.setSelectionRange(0, 12);
  });
  await runMenuAction(page, 'Spanish');
  assert.match(await popupText(page), /Copied to clipboard/);
  assert.equal(await page.inputValue('#field'), 'Good morning team');
  await page.close();
});

test('missing API key and empty selection show warnings without calling the provider', async () => {
  await configure({ provider: 'openai', apiKeys: {} });
  await stubProvider({ body: {} });
  const page = await openFixture();
  await page.evaluate(() => {
    const t = document.getElementById('plain');
    t.focus();
    t.setSelectionRange(0, 8);
  });
  await runMenuAction(page, 'English');
  assert.match(await popupText(page), /Setup Required/);

  await configure({ provider: 'openai', apiKeys: { openai: 'sk' } });
  await page.evaluate(() => { document.activeElement.blur(); getSelection().removeAllRanges(); });
  await runMenuAction(page, 'English', '');
  assert.match(await page.locator('.ai-text-tuner-popup').last().innerText(), /No Text Selected/);
  assert.equal((await worker.evaluate(() => self.__requests)).length, 0);
  await page.close();
});

test('options page stores the API key locally, not in sync storage', async () => {
  const extensionId = new URL(worker.url()).host;
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.selectOption('#provider', 'deepseek');
  await page.fill('#apiKey', '  dk-saved  ');
  await page.fill('#new-language', 'Hebrew');
  await page.click('#add-language');
  await page.click('button[type=submit]');
  await page.locator('#status', { hasText: 'Settings saved' }).waitFor();
  const stored = await worker.evaluate(async () => ({
    local: await chrome.storage.local.get(null),
    sync: await chrome.storage.sync.get(null)
  }));
  assert.equal(stored.local.apiKeys.deepseek, 'dk-saved');
  assert.equal(stored.sync.apiKeys, undefined);
  assert.equal(stored.sync.provider, 'deepseek');
  assert.ok(stored.sync.languages.includes('Hebrew'));
  await page.close();
});

test('keys stored in sync by older versions are migrated to local storage', async () => {
  const result = await worker.evaluate(async () => {
    await chrome.storage.local.clear();
    await chrome.storage.sync.set({ apiKeys: { openai: 'old-key' } });
    await migrateApiKeys();
    return { local: await chrome.storage.local.get(['apiKeys']), sync: await chrome.storage.sync.get(['apiKeys']) };
  });
  assert.equal(result.local.apiKeys.openai, 'old-key');
  assert.equal(result.sync.apiKeys, undefined);
});
