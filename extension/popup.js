// Show a warning when no API key is configured for the active provider
document.addEventListener('DOMContentLoaded', async () => {
  const [{ provider }, { apiKeys }] = await Promise.all([
    chrome.storage.sync.get(['provider']),
    chrome.storage.local.get(['apiKeys'])
  ]);
  const key = (apiKeys || {})[provider || 'openai'];
  const hasApiKey = Boolean(key && key.trim());
  document.getElementById('warning-message').style.display = hasApiKey ? 'none' : 'block';
  document.getElementById('normal-message').style.display = hasApiKey ? 'block' : 'none';
});

document.getElementById('go-to-options').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});
