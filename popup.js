// Check if API key is configured
document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.sync.get(['provider', 'apiKeys'], (data) => {
    const provider = data.provider || 'openai';
    const apiKeys = data.apiKeys || {};
    const hasApiKey = apiKeys[provider] && apiKeys[provider].trim() !== '';

    const warningMessage = document.getElementById('warning-message');
    const normalMessage = document.getElementById('normal-message');

    if (!hasApiKey) {
      warningMessage.style.display = 'block';
      normalMessage.style.display = 'none';
    } else {
      warningMessage.style.display = 'none';
      normalMessage.style.display = 'block';
    }
  });
});

document.getElementById('go-to-options').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});
