chrome.runtime.onInstalled.addListener(() => {
  console.log('Smartlate installed.');

  chrome.storage.sync.get(['languages', 'tone', 'provider', 'apiKey'], (data) => {
    updateContextMenu(data.languages || []);
  });
});

function updateContextMenu(languages) {
  chrome.contextMenus.removeAll(() => {
    // Add "English (Original)" as the first option
    chrome.contextMenus.create({
      id: 'lang-English (Original)',
      title: 'English (Original)',
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

async function handleTextTransformation(text, language, tab) {
    // Show loading popup immediately
    showLoadingIndicator(tab);

    chrome.storage.sync.get(['tone'], async (data) => {
        const tone = data.tone || 'neutral';

        let prompt;
        let actionMessage;

        if (language === 'English (Original)') {
            // Just rephrase in the specified tone
            console.log(`Rephrasing "${text}" with tone: ${tone}`);
            prompt = `Rephrase the following text in a ${tone} tone. Return ONLY the rephrased text without quotes, explanations, or additional commentary:\n\n${text}`;
            actionMessage = 'Text rephrased and copied to clipboard!';
        } else {
            // Translate and rephrase
            console.log(`Translating "${text}" to ${language} with tone: ${tone}`);
            prompt = `Translate the following text to ${language}. Keep the translation as close to the original meaning as possible, maintaining the same structure and style. Apply a ${tone} tone only if it enhances clarity without changing the core message. Return ONLY the translated text without quotes, explanations, or additional commentary:\n\n${text}`;
            actionMessage = 'Text translated, rephrased, and copied to clipboard!';
        }

        const result = await performApiCall(prompt);
        if (result) {
            // Clean up the result - remove quotes if present
            let cleanedResult = result.trim();
            // Remove surrounding quotes if they exist
            if ((cleanedResult.startsWith('"') && cleanedResult.endsWith('"')) ||
                (cleanedResult.startsWith("'") && cleanedResult.endsWith("'"))) {
                cleanedResult = cleanedResult.slice(1, -1);
            }
            copyToClipboardAndNotify(cleanedResult, actionMessage, tab);
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

async function performApiCall(prompt) {
    return new Promise((resolve) => {
        chrome.storage.sync.get(['provider', 'apiKeys'], async (data) => {
            const provider = data.provider;
            const apiKey = data.apiKeys ? data.apiKeys[provider] : null;

            if (!provider || !apiKey) {
                chrome.notifications.create({
                    type: 'basic',
                    iconUrl: 'icons/icon48.png',
                    title: 'Smartlate',
                    message: 'Please configure your AI provider and API key in the settings.'
                });
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
                chrome.notifications.create({
                    type: 'basic',
                    iconUrl: 'icons/icon48.png',
                    title: 'Smartlate',
                    message: `Provider '${provider}' is not supported.`
                });
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
                let errorMessage = `An error occurred: ${error.message}`;
                if (error.message.includes('401')) {
                    errorMessage = 'API key is invalid or missing. Please check your settings.';
                }
                chrome.notifications.create({
                    type: 'basic',
                    iconUrl: 'icons/icon48.png',
                    title: 'Smartlate',
                    message: errorMessage
                });
                resolve(null);
            }
        });
    });
}

async function copyToClipboardAndNotify(text, message, tab) {
    if (!text || text.trim() === '') {
        console.error('Attempted to copy empty or whitespace text to clipboard.');
        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon48.png',
            title: 'AI Text Tuner',
            message: 'The translation result was empty.'
        });
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
            // Fallback to notification if popup fails
            chrome.notifications.create({
                type: 'basic',
                iconUrl: 'icons/icon48.png',
                title: 'Smartlate',
                message: message
            });
        }

        // Close the offscreen document (can happen after showing popup)
        await closeOffscreenDocument();
    } catch (err) {
        console.error('Failed to copy text: ', err);
        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon48.png',
            title: 'AI Text Tuner',
            message: 'Failed to copy to clipboard: ' + err.message
        });
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
