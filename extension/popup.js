const { normalizeLanguages } = globalThis.PhravexaCore;
const { msg } = globalThis.PhravexaI18n;
const SHORTCUT_COMMAND = 'transform-selection';

// Show a warning when no API key is configured for the active provider
async function showKeyState() {
  const [{ provider }, { apiKeys }] = await Promise.all([
    chrome.storage.sync.get(['provider']),
    chrome.storage.local.get(['apiKeys'])
  ]);
  const key = (apiKeys || {})[provider || 'openai'];
  const hasApiKey = Boolean(key && key.trim());
  document.getElementById('warning-message').style.display = hasApiKey ? 'none' : 'block';
  document.getElementById('normal-message').style.display = hasApiKey ? 'block' : 'none';
}

// The keyboard shortcut and the language it will use (same rule as background.js)
async function showShortcut() {
  const keyEl = document.getElementById('shortcut-key');
  const languageEl = document.getElementById('shortcut-language');
  const commands = await chrome.commands.getAll();
  const command = commands.find(c => c.name === SHORTCUT_COMMAND);
  const shortcut = command && command.shortcut;
  keyEl.textContent = '';
  if (shortcut) {
    const [before, after] = msg('popupShortcut', 'Shortcut: {{key}}', ['{{key}}']).split('{{key}}');
    const kbd = document.createElement('kbd');
    kbd.textContent = shortcut;
    keyEl.append(before || '', kbd, after || '');
  } else {
    keyEl.textContent = msg('popupShortcutNone', 'No keyboard shortcut is set.');
  }

  const { lastLanguage, languages } = await chrome.storage.sync.get(['lastLanguage', 'languages']);
  const available = ['English', ...normalizeLanguages(languages)];
  const language = available.includes(lastLanguage) ? lastLanguage : 'English';
  const label = language === 'English' ? msg('popupRephraseLanguage', 'English (rephrase)') : language;
  languageEl.textContent = msg('popupShortcutLanguage', `Uses the last language you picked: ${label}`, [label]);
}

document.addEventListener('DOMContentLoaded', () => {
  showKeyState();
  showShortcut().catch(err => console.warn('Could not read the shortcut:', err));
});

document.getElementById('go-to-options').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

document.getElementById('change-shortcut').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
});
