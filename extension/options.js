const providerSelect = document.getElementById('provider');
const apiKeyInput = document.getElementById('apiKey');
const toneInput = document.getElementById('tone');
const newLanguageInput = document.getElementById('new-language');
const addLanguageBtn = document.getElementById('add-language');
const languageList = document.getElementById('language-list');
const settingsForm = document.getElementById('settings-form');

let languages = [];

// Load settings
document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.sync.get(['provider', 'apiKeys', 'tone', 'languages'], (data) => {
    if (data.provider) {
        providerSelect.value = data.provider;
    }
    if (data.apiKeys && data.apiKeys[providerSelect.value]) {
        apiKeyInput.value = data.apiKeys[providerSelect.value];
    }
    if (data.tone) {
        toneInput.value = data.tone;
    }
    if (data.languages) {
      languages = data.languages;
      renderLanguages();
    }
    // Initialize API key instructions display
    updateApiKeyInstructions();
  });
});

// Update API key instructions based on selected provider
function updateApiKeyInstructions() {
    const provider = providerSelect.value;
    document.getElementById('openai-instructions').style.display = provider === 'openai' ? 'list-item' : 'none';
    document.getElementById('anthropic-instructions').style.display = provider === 'anthropic' ? 'list-item' : 'none';
    document.getElementById('deepseek-instructions').style.display = provider === 'deepseek' ? 'list-item' : 'none';
}

providerSelect.addEventListener('change', () => {
    chrome.storage.sync.get(['apiKeys'], (data) => {
        const apiKeys = data.apiKeys || {};
        apiKeyInput.value = apiKeys[providerSelect.value] || '';
    });
    updateApiKeyInstructions();
});

// Render languages
function renderLanguages() {
  languageList.innerHTML = '';
  languages.forEach((lang, index) => {
    const li = document.createElement('li');
    li.textContent = lang;
    const removeBtn = document.createElement('span');
    removeBtn.textContent = 'X';
    removeBtn.className = 'remove-lang';
    removeBtn.dataset.index = index;
    li.appendChild(removeBtn);
    languageList.appendChild(li);
  });
}

// Add language
addLanguageBtn.addEventListener('click', () => {
  const newLang = newLanguageInput.value.trim();
  if (newLang && !languages.includes(newLang)) {
    languages.push(newLang);
    newLanguageInput.value = '';
    renderLanguages();
  }
});

// Remove language
languageList.addEventListener('click', (e) => {
  if (e.target.classList.contains('remove-lang')) {
    const index = e.target.dataset.index;
    languages.splice(index, 1);
    renderLanguages();
  }
});

// Save settings
settingsForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const provider = providerSelect.value;
  const apiKey = apiKeyInput.value;
  const tone = toneInput.value;

  chrome.storage.sync.get(['apiKeys'], (data) => {
    const apiKeys = data.apiKeys || {};
    apiKeys[provider] = apiKey;

    chrome.storage.sync.set({ provider, apiKeys, tone, languages }, () => {
        alert('Settings saved!');
        // Notify background script to update context menu
        chrome.runtime.sendMessage({ type: 'settings-updated', languages });
    });
  });
});
