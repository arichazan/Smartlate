const { PROVIDERS, normalizeLanguages } = globalThis.PhravexaCore;
const { msg } = globalThis.PhravexaI18n;

const providerSelect = document.getElementById('provider');
const apiKeyInput = document.getElementById('apiKey');
const modelInput = document.getElementById('model');
const defaultModelLabel = document.getElementById('default-model');
const toneInput = document.getElementById('tone');
const newLanguageInput = document.getElementById('new-language');
const addLanguageBtn = document.getElementById('add-language');
const languageList = document.getElementById('language-list');
const settingsForm = document.getElementById('settings-form');
const statusEl = document.getElementById('status');

let languages = [];
// API keys are kept in chrome.storage.local (this device only); everything
// else in chrome.storage.sync. Unsaved edits per provider are kept in memory.
let apiKeys = {};
let models = {};

async function load() {
  const [sync, local] = await Promise.all([
    chrome.storage.sync.get(['provider', 'tone', 'languages', 'models', 'apiKeys']),
    chrome.storage.local.get(['apiKeys'])
  ]);
  // Keys saved by older versions in sync storage are still honoured here until
  // the background migration moves them
  apiKeys = { ...(sync.apiKeys || {}), ...(local.apiKeys || {}) };
  models = sync.models || {};
  if (sync.provider && PROVIDERS[sync.provider]) {
    providerSelect.value = sync.provider;
  }
  if (sync.tone) {
    toneInput.value = sync.tone;
  }
  languages = normalizeLanguages(sync.languages);
  renderLanguages();
  showProvider();
}

function showProvider() {
  const provider = providerSelect.value;
  apiKeyInput.value = apiKeys[provider] || '';
  modelInput.value = models[provider] || '';
  defaultModelLabel.textContent = PROVIDERS[provider].defaultModel;
  document.getElementById('openai-instructions').style.display = provider === 'openai' ? 'list-item' : 'none';
  document.getElementById('anthropic-instructions').style.display = provider === 'anthropic' ? 'list-item' : 'none';
  document.getElementById('deepseek-instructions').style.display = provider === 'deepseek' ? 'list-item' : 'none';
}

let previousProvider = null;
providerSelect.addEventListener('focus', () => { previousProvider = providerSelect.value; });
providerSelect.addEventListener('change', () => {
  // Keep what was typed for the previous provider
  if (previousProvider) {
    apiKeys[previousProvider] = apiKeyInput.value.trim();
    models[previousProvider] = modelInput.value.trim();
  }
  previousProvider = providerSelect.value;
  showProvider();
});

function renderLanguages() {
  languageList.innerHTML = '';
  languages.forEach((lang, index) => {
    const li = document.createElement('li');
    li.textContent = lang;
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.textContent = '\u00D7';
    removeBtn.className = 'remove-lang';
    removeBtn.title = msg('optRemoveLanguage', `Remove ${lang}`, [lang]);
    removeBtn.setAttribute('aria-label', removeBtn.title);
    removeBtn.dataset.index = index;
    li.appendChild(removeBtn);
    languageList.appendChild(li);
  });
}

function addLanguage() {
  const next = normalizeLanguages([...languages, newLanguageInput.value]);
  if (next.length !== languages.length) {
    languages = next;
    renderLanguages();
  }
  newLanguageInput.value = '';
}

addLanguageBtn.addEventListener('click', addLanguage);
newLanguageInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    addLanguage();
  }
});

languageList.addEventListener('click', (e) => {
  if (e.target.classList.contains('remove-lang')) {
    languages.splice(Number(e.target.dataset.index), 1);
    renderLanguages();
  }
});

settingsForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const provider = providerSelect.value;
  apiKeys[provider] = apiKeyInput.value.trim();
  models[provider] = modelInput.value.trim();

  try {
    await chrome.storage.local.set({ apiKeys });
    await chrome.storage.sync.set({ provider, models, tone: toneInput.value.trim(), languages });
    await chrome.storage.sync.remove(['apiKeys', 'apiKey']);
    statusEl.style.color = '#2e7d32';
    statusEl.textContent = msg('optSaved', 'Settings saved.');
    chrome.runtime.sendMessage({ type: 'settings-updated' }).catch(() => {});
  } catch (err) {
    statusEl.style.color = '#c62828';
    statusEl.textContent = msg('optSaveFailed', `Could not save settings: ${err.message}`, [err.message]);
  }
});

document.addEventListener('DOMContentLoaded', load);
