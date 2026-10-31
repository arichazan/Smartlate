importScripts('lib/core.js');

const {
  PhravexaError, PROVIDERS, MAX_INPUT_CHARS, t, badResponseError, emptyResultError,
  buildPrompt, buildRequest, parseResponse, cleanResult,
  classifyHttpError, classifyNetworkError, validateSelection, normalizeLanguages, isRephrase
} = self.PhravexaCore;

const DEFAULT_LANGUAGES = ['German', 'Spanish', 'French', 'Chinese'];
const DEFAULT_TONE = 'Professional and polite, but maintain a friendly and approachable tone suitable for client communication. Keep all URLs unchanged.';
const REQUEST_TIMEOUT_MS = 60000;
// Keyboard shortcut declared under "commands" in manifest.json
const SHORTCUT_COMMAND = 'transform-selection';
// Used by the shortcut until a language has been picked from the menu
const DEFAULT_SHORTCUT_LANGUAGE = 'English';

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

function showUnexpectedError(tab) {
  return showErrorMessage(tab, t('errUnexpectedTitle', 'Unexpected Error'), t('errUnexpected', 'Something went wrong. Please try again.'));
}

async function runMenuItem(info, tab) {
  if (typeof info.menuItemId !== 'string' || !info.menuItemId.startsWith('lang-')) return;
  const language = info.menuItemId.substring('lang-'.length);
  try {
    await rememberLanguage(language);
    const selection = await getSelection(info, tab);
    await handleTextTransformation(selection, language, tab, info.frameId || 0);
  } catch (err) {
    console.error('Phravexa failed:', err);
    await showUnexpectedError(tab);
  }
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  runMenuItem(info, tab);
});

// ---------------------------------------------------------------------------
// Keyboard shortcut: transforms the selection with the last language picked
// from the menu. Users can change the key at chrome://extensions/shortcuts.
// ---------------------------------------------------------------------------

async function rememberLanguage(language) {
  try {
    const { lastLanguage } = await chrome.storage.sync.get(['lastLanguage']);
    // Only write on change: sync storage has a per-minute write quota
    if (lastLanguage !== language) {
      await chrome.storage.sync.set({ lastLanguage: language });
    }
  } catch (err) {
    console.warn('Could not remember the language:', err.message);
  }
}

async function getShortcutLanguage() {
  const { lastLanguage, languages } = await chrome.storage.sync.get(['lastLanguage', 'languages']);
  const available = ['English', ...normalizeLanguages(languages)];
  // A language removed from the list since it was last used is not reused
  return available.includes(lastLanguage) ? lastLanguage : DEFAULT_SHORTCUT_LANGUAGE;
}

async function handleCommand(command, tab) {
  if (command !== SHORTCUT_COMMAND) return;
  try {
    if (!tab) {
      [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    }
    const language = await getShortcutLanguage();
    const { selection, frameId } = await getSelectionFromFrames(tab);
    await handleTextTransformation(selection, language, tab, frameId);
  } catch (err) {
    console.error('Phravexa shortcut failed:', err);
    await showUnexpectedError(tab);
  }
}

chrome.commands.onCommand.addListener((command, tab) => {
  handleCommand(command, tab);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Sent by the options page after saving; storage.onChanged also covers it
  if (message && message.type === 'settings-updated') {
    rebuildContextMenu();
    return false;
  }
  // "Copy original" button in the in-page result popup
  if (message && message.type === 'copy-original' && sender.tab) {
    const text = typeof message.text === 'string' ? message.text : '';
    const html = typeof message.html === 'string' && message.html ? message.html : null;
    if (!text.trim() && !html) {
      sendResponse({ success: false });
      return false;
    }
    writeClipboard(text, html)
      .then(() => sendResponse({ success: true }))
      .catch(err => {
        console.error('Copy original failed:', err);
        sendResponse({ success: false });
      });
    return true;
  }
  return false;
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
        func: readSelectionInPage,
        args: [MAX_INPUT_CHARS]
      });
      const result = injection && injection.result;
      if (result && (result.blocked || (result.text && result.text.trim()))) {
        return result;
      }
    } catch (err) {
      console.log('Could not read formatted selection, using plain selection text:', err.message);
    }
  }
  return { text: info.selectionText || '', html: null };
}

// The keyboard shortcut has no frameId, so read every frame the extension may
// script and use the one that holds focus (or, failing that, any selection).
async function getSelectionFromFrames(tab) {
  const none = { selection: { text: '', html: null }, frameId: 0 };
  if (!canScript(tab)) return none;
  let results = [];
  try {
    results = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: readSelectionInPage,
      args: [MAX_INPUT_CHARS]
    });
  } catch (err) {
    console.log('Could not read the selection:', err.message);
    return none;
  }
  const candidates = (results || []).filter(r => r && r.result &&
    (r.result.blocked || (r.result.text && r.result.text.trim())));
  const pick = candidates.find(r => r.result.focused) || candidates[0];
  return pick ? { selection: pick.result, frameId: pick.frameId || 0 } : none;
}

// Runs in the page. Must be self-contained.
function readSelectionInPage(maxChars) {
  // Remember where an editable selection lives so the result can be written back
  // in place later (scripts injected into this frame share this window)
  window.__phravexaTarget = null;

  // Focus inside open shadow roots (web components) ends at the host element
  let el = document.activeElement;
  while (el && el.shadowRoot && el.shadowRoot.activeElement) {
    el = el.shadowRoot.activeElement;
  }
  // True only for the innermost focused frame (a parent of a focused iframe also
  // reports hasFocus)
  const focused = document.hasFocus() && !(el && (el.tagName === 'IFRAME' || el.tagName === 'FRAME'));

  // Never read or replace a password
  if (el && el.tagName === 'INPUT' && el.type === 'password' && el.selectionEnd > el.selectionStart) {
    return { text: '', html: null, focused, blocked: 'password' };
  }

  // Only these controls have a reliable selection API (email and number inputs
  // report null), so only they can be replaced in place
  const textInputTypes = ['text', 'search', 'url', 'tel'];
  const isTextControl = el && (el.tagName === 'TEXTAREA' ||
    (el.tagName === 'INPUT' && textInputTypes.includes(el.type)));
  try {
    if (isTextControl && typeof el.selectionStart === 'number' && el.selectionEnd > el.selectionStart) {
      const original = el.value.substring(el.selectionStart, el.selectionEnd);
      // Too long: the caller rejects it, so don't keep a target around
      if (original.length <= maxChars && !el.disabled && !el.readOnly) {
        window.__phravexaTarget = {
          kind: 'input', el, original,
          start: el.selectionStart, end: el.selectionEnd
        };
      }
      return { text: original, html: null, focused };
    }
  } catch (e) {
    // Fall through to the document selection
  }

  const selection = window.getSelection();
  const text = selection ? selection.toString() : '';
  if (!selection || selection.rangeCount === 0) {
    return { text, html: null, focused };
  }
  // Skip the HTML copy for selections the caller rejects anyway (e.g. select-all
  // on a very long page), which would otherwise clone the whole document
  if (text.length > maxChars) {
    return { text, html: null, focused };
  }

  // Selection inside a rich-text editor (contenteditable / designMode)
  let editableHost = null;
  if (selection.rangeCount === 1) {
    const range = selection.getRangeAt(0);
    let node = range.commonAncestorContainer;
    if (node.nodeType !== Node.ELEMENT_NODE) {
      node = node.parentElement;
    }
    if (node && node.isContentEditable) {
      editableHost = node;
      while (editableHost.parentElement && editableHost.parentElement.isContentEditable) {
        editableHost = editableHost.parentElement;
      }
      const savedRange = range.cloneRange();
      window.__phravexaTarget = {
        kind: 'editable', host: editableHost, range: savedRange,
        original: savedRange.toString()
      };
      // Plain-text-only editors would show inserted HTML as literal tags
      if (editableHost.getAttribute('contenteditable') === 'plaintext-only') {
        return { text, html: null, focused };
      }
    }
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
    // (skipped for editors: the result is inserted back inside those same
    // wrappers, so including them would nest e.g. a <li> inside the <li>)
    while (!editableHost && ancestor && wrapperTags.includes(ancestor.tagName)) {
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
  return { text, html, focused };
}

// Write the result back over the original selection when it came from a text box or
// rich-text editor. Returns true only if the page content actually changed; otherwise
// (static page text, unsupported editor, or the text was edited meanwhile) the caller
// falls back to the clipboard alone.
async function replaceSelectionInPage(tab, frameId, text, html) {
    if (!canScript(tab)) {
        return false;
    }
    if ((!text || !text.trim()) && (!html || !html.trim())) {
        return false;
    }
    try {
        const [injection] = await chrome.scripting.executeScript({
            target: { tabId: tab.id, frameIds: [frameId] },
            args: [text, html],
            func: async (text, html) => {
                const target = window.__phravexaTarget;
                window.__phravexaTarget = null;
                if (!target) {
                    return false;
                }
                // Let editors that apply edits asynchronously (e.g. via beforeinput) catch up
                const settle = () => new Promise(resolve => setTimeout(resolve, 50));

                if (target.kind === 'input') {
                    const el = target.el;
                    // (the type is checked again in case the page switched it, e.g. a
                    // "show password" toggle)
                    if (!el.isConnected || el.disabled || el.readOnly || text === null ||
                        el.type === 'password') {
                        return false;
                    }
                    // Don't overwrite if the user changed the text while we were waiting
                    if (el.value.substring(target.start, target.end) !== target.original) {
                        return false;
                    }
                    if (text === target.original) {
                        return true;
                    }
                    const before = el.value;
                    el.focus();
                    el.setSelectionRange(target.start, target.end);
                    // execCommand keeps native undo (Cmd/Ctrl+Z) and fires real input events,
                    // so frameworks like React pick up the change
                    document.execCommand('insertText', false, text);
                    await settle();
                    if (el.value !== before) {
                        return true;
                    }
                    el.setRangeText(text, target.start, target.end, 'end');
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                    return el.value !== before;
                }

                if (target.kind === 'editable') {
                    const host = target.host;
                    const range = target.range;
                    if (!host.isConnected || !host.isContentEditable) {
                        return false;
                    }
                    if (range.toString() !== target.original) {
                        return false;
                    }
                    const before = host.innerHTML;
                    host.focus();
                    const selection = window.getSelection();
                    selection.removeAllRanges();
                    selection.addRange(range);
                    if (html) {
                        document.execCommand('insertHTML', false, html);
                    } else {
                        document.execCommand('insertText', false, text);
                    }
                    await settle();
                    return host.innerHTML !== before;
                }
                return false;
            }
        });
        return Boolean(injection && injection.result === true);
    } catch (err) {
        console.log('Could not replace text in page, using clipboard only:', err);
        return false;
    }
}

// ---------------------------------------------------------------------------
// Translate / rephrase
// ---------------------------------------------------------------------------

async function handleTextTransformation(selection, language, tab, frameId = 0) {
  try {
    validateSelection(selection);

    const settings = await getSettings();
    if (!settings.apiKey) {
      throw new PhravexaError(t('errSetupTitle', 'Setup Required'), t('errSetup', 'Add your AI provider and API key in Phravexa settings (click the extension icon).'), { isWarning: true, code: 'no_key' });
    }

    showLoadingIndicator(tab, isRephrase(language)
      ? t('loadingRephrasing', 'Rephrasing')
      : t('loadingTranslating', `Translating to ${language}`, [language]));

    const { prompt, isHtml, input, resultName } = buildPrompt({
      language,
      instructions: settings.tone,
      text: selection.text,
      html: selection.html
    });

    const raw = await callProvider(settings, prompt);
    const cleaned = cleanResult(raw.content, { input, isHtml });

    const text = isHtml ? null : cleaned;
    const html = isHtml ? cleaned : null;
    // Write the result back over the selection in text boxes and editors. Skip it when
    // the provider cut the result short, so a partial answer never replaces the user's text.
    const replaced = raw.truncated ? false : await replaceSelectionInPage(tab, frameId, text, html);

    const rephrased = resultName === 'rephrased';
    let message;
    if (replaced) {
      message = rephrased
        ? t('notifyRephrasedReplaced', 'Text rephrased, replaced and copied to clipboard')
        : t('notifyTranslatedReplaced', 'Text translated, replaced and copied to clipboard');
    } else {
      message = rephrased
        ? t('notifyRephrased', 'Text rephrased and copied to clipboard')
        : t('notifyTranslated', 'Text translated and copied to clipboard');
    }
    await copyToClipboardAndNotify(tab, {
      text,
      html,
      message,
      title: replaced ? t('popupReplaced', 'Text replaced (also copied)') : t('popupCopied', 'Copied to clipboard'),
      truncated: raw.truncated,
      original: { text: selection.text, html: selection.html || null }
    });
  } catch (err) {
    if (err instanceof PhravexaError) {
      await showErrorMessage(tab, err.title, err.message, err.isWarning);
    } else {
      console.error('Phravexa failed:', err);
      await showUnexpectedError(tab);
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
    throw badResponseError(label);
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

async function copyToClipboardAndNotify(tab, { text, html, message, title, truncated, original }) {
  if ((!text || !text.trim()) && (!html || !html.trim())) {
    throw emptyResultError();
  }

  let response;
  try {
    response = await writeClipboard(text, html);
  } catch (err) {
    console.error('Clipboard write failed:', err);
    throw new PhravexaError(t('errClipboardTitle', 'Clipboard Error'), t('errClipboard', 'Could not copy the result to the clipboard. Please try again.'), { code: 'clipboard' });
  }

  const preview = (response && response.text) || text || '';
  const shown = await sendToPage(tab, {
    type: 'show-popup', text: preview, title, truncated: Boolean(truncated), original: original || null
  });
  if (!shown) {
    notify('Phravexa', `${message}.${truncated ? ' ' + t('notifyTruncated', 'The result may be cut short.') : ''}`);
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
      justification: 'Write the translated text (or the original selection) to the clipboard.'
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
