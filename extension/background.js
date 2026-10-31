importScripts('lib/core.js');

const {
  PhravexaError, PROVIDERS, buildPrompt, buildRequest, parseResponse, cleanResult,
  classifyHttpError, classifyNetworkError, validateSelection, normalizeLanguages, isRephrase
} = self.PhravexaCore;

const DEFAULT_LANGUAGES = ['German', 'Spanish', 'French', 'Chinese'];
const DEFAULT_TONE = 'Professional and polite, but maintain a friendly and approachable tone suitable for client communication. Keep all URLs unchanged.';
const REQUEST_TIMEOUT_MS = 60000;

// ---------------------------------------------------------------------------
// Settings
// API keys live in chrome.storage.local (this device only). Preferences such as
// languages and tone live in chrome.storage.sync. Older versions kept keys in
// sync storage; migrateApiKeys() moves them.
// ---------------------------------------------------------------------------

async function migrateApiKeys() {
  const synced = await chrome.storage.sync.get(['apiKeys', 'apiKey']);
  if (!synced.apiKeys && !synced.apiKey) return;
  const local = await chrome.storage.local.get(['apiKeys']);
  const merged = { ...(synced.apiKeys || {}), ...(local.apiKeys || {}) };
  await chrome.storage.local.set({ apiKeys: merged });
  await chrome.storage.sync.remove(['apiKeys', 'apiKey']);
}

async function getSettings() {
  const [sync, local] = await Promise.all([
    chrome.storage.sync.get(['provider', 'tone', 'models']),
    chrome.storage.local.get(['apiKeys'])
  ]);
  const provider = sync.provider || 'openai';
  const apiKeys = local.apiKeys || {};
  const models = sync.models || {};
  return {
    provider,
    apiKey: (apiKeys[provider] || '').trim(),
    model: models[provider] || '',
    tone: sync.tone
  };
}

// ---------------------------------------------------------------------------
// Lifecycle and context menu
// ---------------------------------------------------------------------------

chrome.runtime.onInstalled.addListener(async (details) => {
  try {
    await migrateApiKeys();
    const data = await chrome.storage.sync.get(['languages', 'tone', 'hasSeenWelcome']);
    if (details.reason === 'install' || !Array.isArray(data.languages) || data.languages.length === 0) {
      await chrome.storage.sync.set({ languages: DEFAULT_LANGUAGES });
    }
    if (details.reason === 'install' || !data.tone) {
      await chrome.storage.sync.set({ tone: DEFAULT_TONE });
    }
    await rebuildContextMenu();
    if (details.reason === 'install' || !data.hasSeenWelcome) {
      await chrome.storage.sync.set({ hasSeenWelcome: true });
      chrome.runtime.openOptionsPage();
    }
  } catch (err) {
    console.error('Phravexa setup failed:', err);
  }
});

chrome.runtime.onStartup.addListener(() => {
  migrateApiKeys().catch(err => console.error('Key migration failed:', err));
  rebuildContextMenu();
});

// Rebuild the menu whenever the language list changes, from any device
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.languages) {
    rebuildContextMenu();
  }
});

let menuBuild = Promise.resolve();
function rebuildContextMenu() {
  // Serialise rebuilds so overlapping removeAll/create calls cannot produce
  // duplicate-id errors
  menuBuild = menuBuild.then(async () => {
    const { languages } = await chrome.storage.sync.get(['languages']);
    await chrome.contextMenus.removeAll();
    const items = ['English', ...normalizeLanguages(languages)];
    for (const lang of items) {
      await new Promise(resolve => {
        chrome.contextMenus.create({ id: `lang-${lang}`, title: lang, contexts: ['selection'] }, () => {
          if (chrome.runtime.lastError) {
            console.warn('Could not create menu item', lang, chrome.runtime.lastError.message);
          }
          resolve();
        });
      });
    }
  }).catch(err => console.error('Context menu rebuild failed:', err));
  return menuBuild;
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (typeof info.menuItemId !== 'string' || !info.menuItemId.startsWith('lang-')) return;
  const language = info.menuItemId.substring('lang-'.length);
  getSelection(info, tab)
    .then(selection => handleTextTransformation(selection, language, tab))
    .catch(err => {
      console.error('Phravexa failed:', err);
      showErrorMessage(tab, 'Unexpected Error', 'Something went wrong. Please try again.');
    });
});

chrome.runtime.onMessage.addListener((message) => {
  // Sent by the options page after saving; storage.onChanged also covers it
  if (message && message.type === 'settings-updated') {
    rebuildContextMenu();
  }
});

// ---------------------------------------------------------------------------
// Selection
// info.selectionText collapses line breaks and drops all markup, so read the
// selection directly from the page: plain text for inputs, HTML for content.
// ---------------------------------------------------------------------------

function canScript(tab) {
  return Boolean(tab && typeof tab.id === 'number' && tab.id >= 0);
}

async function getSelection(info, tab) {
  if (canScript(tab)) {
    try {
      const [injection] = await chrome.scripting.executeScript({
        target: { tabId: tab.id, frameIds: [info.frameId || 0] },
        func: readSelectionInPage
      });
      if (injection && injection.result && injection.result.text && injection.result.text.trim()) {
        return injection.result;
      }
    } catch (err) {
      console.log('Could not read formatted selection, using plain selection text:', err.message);
    }
  }
  return { text: info.selectionText || '', html: null };
}

// Runs in the page. Must be self-contained.
function readSelectionInPage() {
  const el = document.activeElement;
  try {
    if (el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') &&
        typeof el.selectionStart === 'number' && el.selectionEnd > el.selectionStart) {
      return { text: el.value.substring(el.selectionStart, el.selectionEnd), html: null };
    }
  } catch (e) {
    // Some input types don't support selection, fall through
  }

  const selection = window.getSelection();
  const text = selection ? selection.toString() : '';
  if (!selection || selection.rangeCount === 0) {
    return { text, html: null };
  }

  const container = document.createElement('div');
  const wrapperTags = ['B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'DEL', 'INS', 'MARK',
    'SUB', 'SUP', 'SMALL', 'A', 'CODE', 'PRE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
    'LI', 'UL', 'OL', 'BLOCKQUOTE', 'FONT', 'SPAN'];
  for (let i = 0; i < selection.rangeCount; i++) {
    const range = selection.getRangeAt(i);
    let fragment = range.cloneContents();

    // Keep formatting elements that wrap the whole selection (e.g. selecting
    // text inside a single <b>, <a> or <li>), like the browser's own copy does
    let ancestor = range.commonAncestorContainer;
    if (ancestor.nodeType !== Node.ELEMENT_NODE) {
      ancestor = ancestor.parentElement;
    }
    while (ancestor && wrapperTags.includes(ancestor.tagName)) {
      const wrapper = ancestor.cloneNode(false);
      wrapper.appendChild(fragment);
      fragment = wrapper;
      ancestor = ancestor.parentElement;
    }
    container.appendChild(fragment);
  }

  // Drop non-content elements and attributes that only bloat the prompt
  container.querySelectorAll('script, style, noscript, template, link, meta').forEach(n => n.remove());
  const keepAttributes = ['href', 'src', 'alt', 'title', 'style', 'colspan', 'rowspan', 'start', 'type', 'width', 'height'];
  container.querySelectorAll('*').forEach(node => {
    [...node.attributes].forEach(attr => {
      if (!keepAttributes.includes(attr.name)) {
        node.removeAttribute(attr.name);
      }
    });
    // Make links and images absolute so they still work when pasted elsewhere
    if (node.hasAttribute('href')) {
      try { node.setAttribute('href', new URL(node.getAttribute('href'), document.baseURI).href); } catch (e) {}
    }
    if (node.hasAttribute('src')) {
      try { node.setAttribute('src', new URL(node.getAttribute('src'), document.baseURI).href); } catch (e) {}
    }
  });

  // A selection without any markup is just plain text
  const html = container.querySelector('*') ? container.innerHTML : null;
  return { text, html };
}

// ---------------------------------------------------------------------------
// Translate / rephrase
// ---------------------------------------------------------------------------

async function handleTextTransformation(selection, language, tab) {
  try {
    validateSelection(selection);

    const settings = await getSettings();
    if (!settings.apiKey) {
      throw new PhravexaError('Setup Required', 'Add your AI provider and API key in Phravexa settings (click the extension icon).', { isWarning: true, code: 'no_key' });
    }

    showLoadingIndicator(tab, isRephrase(language) ? 'Rephrasing' : `Translating to ${language}`);

    const { prompt, isHtml, input, resultName } = buildPrompt({
      language,
      instructions: settings.tone,
      text: selection.text,
      html: selection.html
    });

    const raw = await callProvider(settings, prompt);
    const cleaned = cleanResult(raw.content, { input, isHtml });

    await copyToClipboardAndNotify(tab, {
      text: isHtml ? null : cleaned,
      html: isHtml ? cleaned : null,
      message: `Text ${resultName} and copied to clipboard`,
      truncated: raw.truncated
    });
  } catch (err) {
    if (err instanceof PhravexaError) {
      await showErrorMessage(tab, err.title, err.message, err.isWarning);
    } else {
      console.error('Phravexa failed:', err);
      await showErrorMessage(tab, 'Unexpected Error', 'Something went wrong. Please try again.');
    }
  }
}

async function callProvider(settings, prompt) {
  const { url, init } = buildRequest({
    provider: settings.provider,
    apiKey: settings.apiKey,
    prompt,
    model: settings.model
  });
  const label = PROVIDERS[settings.provider].label;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    throw classifyNetworkError(err);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    let bodyText = '';
    try { bodyText = await response.text(); } catch (e) {}
    throw classifyHttpError(response.status, bodyText, label);
  }

  let json;
  try {
    json = await response.json();
  } catch (err) {
    throw new PhravexaError('Unexpected Response', `${label} returned an unreadable response. Please try again.`, { code: 'bad_response' });
  }
  return parseResponse(settings.provider, json);
}

// ---------------------------------------------------------------------------
// Page feedback (in-page popup, with a system notification as fallback on
// pages where scripts cannot run, such as chrome:// pages or the PDF viewer)
// ---------------------------------------------------------------------------

async function sendToPage(tab, message) {
  if (!canScript(tab)) return false;
  try {
    await ensureContentScript(tab.id);
    await chrome.tabs.sendMessage(tab.id, message);
    return true;
  } catch (err) {
    return false;
  }
}

function notify(title, message) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title,
    message
  }, () => void chrome.runtime.lastError);
}

async function showLoadingIndicator(tab, label) {
  await sendToPage(tab, { type: 'show-loading', label });
}

async function showErrorMessage(tab, title, message, isWarning = false) {
  const shown = await sendToPage(tab, { type: 'show-error', title, message, isWarning });
  if (!shown) notify(title, message);
}

async function ensureContentScript(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'ping' });
  } catch (err) {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    await chrome.scripting.insertCSS({ target: { tabId }, files: ['content.css'] });
  }
}

// ---------------------------------------------------------------------------
// Clipboard via the offscreen document. Operations are queued so a second
// translation cannot close the document while the first is still copying.
// ---------------------------------------------------------------------------

let clipboardQueue = Promise.resolve();

function writeClipboard(text, html) {
  const job = clipboardQueue.then(async () => {
    await createOffscreenDocument();
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'copy-to-clipboard', target: 'offscreen', data: text, html
      });
      if (!response || response.success !== true) {
        throw new Error((response && response.error) || 'The clipboard did not accept the text');
      }
      return response;
    } finally {
      await closeOffscreenDocument();
    }
  });
  clipboardQueue = job.catch(() => {});
  return job;
}

async function copyToClipboardAndNotify(tab, { text, html, message, truncated }) {
  if ((!text || !text.trim()) && (!html || !html.trim())) {
    throw new PhravexaError('Empty Result', 'The AI provider returned an empty result. Please try again.', { code: 'empty_result' });
  }

  let response;
  try {
    response = await writeClipboard(text, html);
  } catch (err) {
    console.error('Clipboard write failed:', err);
    throw new PhravexaError('Clipboard Error', 'Could not copy the result to the clipboard. Please try again.', { code: 'clipboard' });
  }

  const preview = (response && response.text) || text || '';
  const shown = await sendToPage(tab, { type: 'show-popup', text: preview, truncated: Boolean(truncated) });
  if (!shown) {
    notify('Phravexa', `${message}.${truncated ? ' The result may be cut short.' : ''}`);
  }
}

async function hasOffscreenDocument() {
  const offscreenUrl = chrome.runtime.getURL('offscreen.html');
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [offscreenUrl]
  });
  return contexts.length > 0;
}

let creatingOffscreen = null;
async function createOffscreenDocument() {
  if (await hasOffscreenDocument()) return;
  if (!creatingOffscreen) {
    creatingOffscreen = chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['CLIPBOARD'],
      justification: 'Write the translated text to the clipboard.'
    }).finally(() => { creatingOffscreen = null; });
  }
  await creatingOffscreen;
}

async function closeOffscreenDocument() {
  try {
    if (await hasOffscreenDocument()) {
      await chrome.offscreen.closeDocument();
    }
  } catch (err) {
    console.warn('Could not close offscreen document:', err.message);
  }
}
