chrome.runtime.onInstalled.addListener((details) => {
  console.log('Smartlate installed. Reason:', details.reason);

  chrome.storage.sync.get(['languages', 'tone', 'provider', 'apiKey', 'hasSeenWelcome'], (data) => {
    // Set default languages on first install
    let languages = data.languages;
    if (details.reason === 'install' || !languages || languages.length === 0) {
      languages = ['German', 'Spanish', 'French', 'Chinese'];
      chrome.storage.sync.set({ languages: languages }, () => {
        console.log('Default languages set:', languages);
      });
    }

    // Set default special instructions on first install
    if (details.reason === 'install' || !data.tone) {
      const defaultInstructions = 'Professional and polite, but maintain a friendly and approachable tone suitable for client communication. Keep all URLs unchanged.';
      chrome.storage.sync.set({ tone: defaultInstructions }, () => {
        console.log('Default instructions set');
      });
    }

    updateContextMenu(languages || []);

    // Open options page on first install or if never seen before
    if (details.reason === 'install' || !data.hasSeenWelcome) {
      console.log('Opening options page for setup...');
      chrome.runtime.openOptionsPage();

      // Mark that we've shown the welcome message
      chrome.storage.sync.set({ hasSeenWelcome: true });
    }
  });
});

function updateContextMenu(languages) {
  chrome.contextMenus.removeAll(() => {
    // Add "English" as the first option
    chrome.contextMenus.create({
      id: 'lang-English',
      title: 'English',
      contexts: ['selection']
    });

    // Add all configured languages
    if (languages.length > 0) {
        languages.forEach(lang => {
            chrome.contextMenus.create({
                id: `lang-${lang}`,
                title: lang,
                contexts: ['selection']
            });
        });
    }
  });
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId.startsWith('lang-')) {
    const language = info.menuItemId.substring('lang-'.length);
    handleTextTransformation(info.selectionText, language, tab);
  }
});

async function checkApiKeyConfigured() {
    return new Promise((resolve) => {
        chrome.storage.sync.get(['provider', 'apiKeys'], (data) => {
            const provider = data.provider;
            const apiKey = data.apiKeys ? data.apiKeys[provider] : null;
            resolve(provider && apiKey && apiKey.trim().length > 0);
        });
    });
}

async function handleTextTransformation(text, language, tab) {
    // Check if API key is configured first
    const hasApiKey = await checkApiKeyConfigured();
    if (!hasApiKey) {
        await showErrorMessage(
            tab,
            'Setup Required',
            'Please configure your AI provider and API key in the extension settings.',
            true  // isWarning
        );
        return;
    }

    // Show loading popup immediately
    showLoadingIndicator(tab);

    chrome.storage.sync.get(['tone'], async (data) => {
        const instructions = data.tone || 'Professional and polite, but maintain a friendly and approachable tone suitable for client communication.';

        let prompt;
        let actionMessage;

        if (language === 'English') {
            // Just rephrase with the special instructions
            console.log(`Rephrasing "${text}" with instructions: ${instructions}`);
            prompt = `Rephrase the following text with this tone/style: ${instructions}. Return ONLY the rephrased text without quotes, explanations, or additional commentary:\n\n${text}`;
            actionMessage = 'Text rephrased and copied to clipboard!';
        } else {
            // Translate and apply special instructions
            console.log(`Translating "${text}" to ${language} with instructions: ${instructions}`);
            prompt = `Translate the following text to ${language}, keeping the translation as close to the original meaning as possible. Apply this tone/style to the translation: ${instructions}. Return ONLY the translated text without quotes, explanations, or additional commentary:\n\n${text}`;
            actionMessage = 'Text translated and copied to clipboard!';
        }

        const result = await performApiCall(prompt, tab);
        if (result) {
            // Clean up the result - remove quotes if present
            let cleanedResult = result.trim();
            // Remove surrounding quotes if they exist
            if ((cleanedResult.startsWith('"') && cleanedResult.endsWith('"')) ||
                (cleanedResult.startsWith("'") && cleanedResult.endsWith("'"))) {
                cleanedResult = cleanedResult.slice(1, -1);
            }
            await copyToClipboardAndNotify(cleanedResult, actionMessage, tab);
        }
    });
}

async function showLoadingIndicator(tab) {
    try {
        // Ensure content script is loaded
        await ensureContentScript(tab.id);

        // Show loading popup
        await chrome.tabs.sendMessage(tab.id, {
            type: 'show-loading'
        });
    } catch (err) {
        console.log('Could not show loading indicator:', err);
    }
}

async function showErrorMessage(tab, title, message, isWarning = false) {
    try {
        // Ensure content script is loaded
        await ensureContentScript(tab.id);

        // Show error popup
        await chrome.tabs.sendMessage(tab.id, {
            type: 'show-error',
            title: title,
            message: message,
            isWarning: isWarning
        });
    } catch (err) {
        console.log('Could not show error popup:', err);
        // Fallback to Chrome notification if popup fails
        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon48.png',
            title: title,
            message: message
        });
    }
}

async function ensureContentScript(tabId) {
    try {
        // Try to ping the content script
        await chrome.tabs.sendMessage(tabId, { type: 'ping' });
    } catch (err) {
        // Content script not loaded, inject it
        console.log('Injecting content script...');
        await chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: ['content.js']
        });
        // Inject CSS as well
        await chrome.scripting.insertCSS({
            target: { tabId: tabId },
            files: ['content.css']
        });
        // Wait a bit for the script to initialize
        await new Promise(resolve => setTimeout(resolve, 100));
    }
}

async function performApiCall(prompt, tab) {
    return new Promise((resolve) => {
        chrome.storage.sync.get(['provider', 'apiKeys'], async (data) => {
            const provider = data.provider;
            const apiKey = data.apiKeys ? data.apiKeys[provider] : null;

            if (!provider || !apiKey) {
                await showErrorMessage(
                    tab,
                    'API Key Required',
                    'Please configure your AI provider and API key in the extension settings.',
                    true
                );
                resolve(null);
                return;
            }

            let apiUrl, apiHeaders, apiBody;

            if (provider === 'openai') {
                apiUrl = 'https://api.openai.com/v1/chat/completions';
                apiHeaders = {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                };
                apiBody = {
                    model: 'gpt-3.5-turbo',
                    messages: [{ role: 'user', content: prompt }],
                    temperature: 0.7
                };
            } else if (provider === 'anthropic') {
                apiUrl = 'https://api.anthropic.com/v1/messages';
                apiHeaders = {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01'
                };
                apiBody = {
                    model: 'claude-3-sonnet-20240229',
                    max_tokens: 1024,
                    messages: [{ role: 'user', content: prompt }]
                };
            } else if (provider === 'deepseek') {
                apiUrl = 'https://api.deepseek.com/chat/completions';
                apiHeaders = {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                };
                apiBody = {
                    model: 'deepseek-chat',
                    messages: [{ role: 'user', content: prompt }]
                };
            } else {
                await showErrorMessage(
                    tab,
                    'Unsupported Provider',
                    `Provider '${provider}' is not supported. Please choose OpenAI, Anthropic, or DeepSeek.`
                );
                resolve(null);
                return;
            }

            try {
                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: apiHeaders,
                    body: JSON.stringify(apiBody)
                });

                if (!response.ok) {
                    throw new Error(`API request failed with status ${response.status}`);
                }

                const result = await response.json();
                let content = '';
                if (provider === 'openai' || provider === 'deepseek') {
                    content = result.choices[0].message.content.trim();
                } else if (provider === 'anthropic') {
                    content = result.content[0].text.trim();
                }
                resolve(content);

            } catch (error) {
                console.error('API call failed:', error);
                let errorTitle = 'Translation Error';
                let errorMessage = 'Translation failed. Please check your settings.';
                let isWarning = false;

                if (error.message.includes('401') || error.message.includes('403')) {
                    errorTitle = 'Invalid API Key';
                    errorMessage = 'Your API key appears to be invalid. Please update it in settings.';
                } else if (error.message.includes('429')) {
                    errorTitle = 'Rate Limit';
                    errorMessage = 'Rate limit exceeded. Please try again in a few moments.';
                    isWarning = true;
                } else if (error.message.includes('Failed to fetch') || error.message.includes('Network')) {
                    errorTitle = 'Network Error';
                    errorMessage = 'Could not connect. Please check your internet connection.';
                    isWarning = true;
                }

                await showErrorMessage(tab, errorTitle, errorMessage, isWarning);
                resolve(null);
            }
        });
    });
}

async function copyToClipboardAndNotify(text, message, tab) {
    if (!text || text.trim() === '') {
        console.error('Attempted to copy empty or whitespace text to clipboard.');
        await showErrorMessage(
            tab,
            'Empty Result',
            'The translation result was empty.'
        );
        return;
    }

    try {
        // Use the offscreen document to write to the clipboard
        await createOffscreenDocument();

        // Send message and wait for response
        const response = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(
                { type: 'copy-to-clipboard', target: 'offscreen', data: text },
                (response) => {
                    if (chrome.runtime.lastError) {
                        reject(chrome.runtime.lastError);
                    } else {
                        resolve(response);
                    }
                }
            );
        });

        // Show visual popup on the page immediately after copy
        try {
            // Ensure content script is loaded
            await ensureContentScript(tab.id);

            await chrome.tabs.sendMessage(tab.id, {
                type: 'show-popup',
                text: text
            });
        } catch (popupErr) {
            console.log('Could not show popup:', popupErr);
        }

        // Close the offscreen document (can happen after showing popup)
        await closeOffscreenDocument();
    } catch (err) {
        console.error('Failed to copy text: ', err);
        await showErrorMessage(
            tab,
            'Clipboard Error',
            'Failed to copy to clipboard: ' + err.message
        );
    }
}

async function closeOffscreenDocument() {
    try {
        const offscreenUrl = chrome.runtime.getURL('offscreen.html');
        const existingContexts = await chrome.runtime.getContexts({
            contextTypes: ['OFFSCREEN_DOCUMENT'],
            documentUrls: [offscreenUrl]
        });

        if (existingContexts.length > 0) {
            await chrome.offscreen.closeDocument();
            console.log('Offscreen document closed');
        }
    } catch (err) {
        console.error('Error closing offscreen document:', err);
    }
}

let creating;
async function createOffscreenDocument() {
    const offscreenUrl = chrome.runtime.getURL('offscreen.html');
    const existingContexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
        documentUrls: [offscreenUrl]
    });

    if (existingContexts.length > 0) {
        return;
    }

    if (creating) {
        await creating;
    } else {
        creating = chrome.offscreen.createDocument({
            url: 'offscreen.html',
            reasons: ['CLIPBOARD'],
            justification: 'Need to write to the clipboard.',
        });
        await creating;
        creating = null;
    }
}

// Listen for messages from the offscreen document
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'settings-updated') {
        updateContextMenu(message.languages);
    } else if (message.target === 'offscreen' && message.type === 'copy-to-clipboard') {
        // Forward to offscreen document
        createOffscreenDocument().then(() => {
            chrome.runtime.sendMessage(message);
        });
    } else if (message.type === 'copy-success') {
        console.log('Text copied to clipboard successfully.');
    }
});
