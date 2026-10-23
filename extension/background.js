chrome.runtime.onInstalled.addListener((details) => {
  console.log('Phravexa installed. Reason:', details.reason);

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
    getSelection(info, tab).then(selection => handleTextTransformation(selection, language, tab));
  }
});

// info.selectionText collapses line breaks and drops all markup, so read the
// selection directly from the page: plain text for inputs, HTML for page content.
async function getSelection(info, tab) {
    try {
        const [injection] = await chrome.scripting.executeScript({
            target: { tabId: tab.id, frameIds: [info.frameId || 0] },
            func: () => {
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
                const text = selection.toString();
                if (selection.rangeCount === 0) {
                    return { text, html: null };
                }

                const container = document.createElement('div');
                for (let i = 0; i < selection.rangeCount; i++) {
                    const range = selection.getRangeAt(i);
                    let fragment = range.cloneContents();

                    // Keep formatting elements that wrap the whole selection (e.g. selecting
                    // text inside a single <b>, <a> or <li>), like the browser's own copy does
                    const wrapperTags = ['B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'DEL', 'INS', 'MARK',
                        'SUB', 'SUP', 'SMALL', 'A', 'CODE', 'PRE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
                        'LI', 'UL', 'OL', 'BLOCKQUOTE', 'FONT', 'SPAN'];
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
        });
        if (injection && injection.result && injection.result.text && injection.result.text.trim()) {
            return injection.result;
        }
    } catch (err) {
        console.log('Could not read formatted selection, using plain selection text:', err);
    }
    return { text: info.selectionText, html: null };
}

async function checkApiKeyConfigured() {
    return new Promise((resolve) => {
        chrome.storage.sync.get(['provider', 'apiKeys'], (data) => {
            const provider = data.provider;
            const apiKey = data.apiKeys ? data.apiKeys[provider] : null;
            resolve(provider && apiKey && apiKey.trim().length > 0);
        });
    });
}

async function handleTextTransformation(selection, language, tab) {
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
        const isHtml = Boolean(selection.html);
        const input = isHtml ? selection.html : selection.text;

        const task = language === 'English'
            ? `Rephrase the following ${isHtml ? 'HTML' : 'text'} with this tone/style: ${instructions}.`
            : `Translate the following ${isHtml ? 'HTML' : 'text'} to ${language}, keeping the translation as close to the original meaning as possible. Apply this tone/style to the translation: ${instructions}.`;
        const resultName = language === 'English' ? 'rephrased' : 'translated';

        let prompt;
        if (isHtml) {
            prompt = `${task} Change ONLY the human-readable text. Preserve the HTML structure exactly: keep every tag, attribute, link URL, inline style, list, table, line break (<br>), heading and bold/italic/underline formatting in the same places as the original. Do not add, remove, merge or reorder elements, and do not wrap the result in <html>, <body> or code fences. Return ONLY the ${resultName} HTML without explanations or additional commentary:\n\n${input}`;
        } else {
            prompt = `${task} Preserve the original formatting exactly: keep every line break, blank line, paragraph break, indentation, list/bullet marker, markdown syntax and spacing in the same places as the original. Do not merge or split lines. Return ONLY the ${resultName} text without quotes, explanations, or additional commentary:\n\n${input}`;
        }
        const actionMessage = `Text ${resultName} and copied to clipboard!`;
        console.log(`${language === 'English' ? 'Rephrasing' : `Translating to ${language}`} "${input}" with instructions: ${instructions}`);

        const result = await performApiCall(prompt, tab);
        if (result) {
            let cleanedResult = result.trim();
            if (isHtml) {
                // Remove a markdown code fence if the model added one
                cleanedResult = cleanedResult.replace(/^```(?:html)?\s*\n?/i, '').replace(/\n?```$/, '').trim();
                await copyToClipboardAndNotify(null, actionMessage, tab, cleanedResult);
                return;
            }
            // Remove surrounding quotes if they exist
            if ((cleanedResult.startsWith('"') && cleanedResult.endsWith('"')) ||
                (cleanedResult.startsWith("'") && cleanedResult.endsWith("'"))) {
                cleanedResult = cleanedResult.slice(1, -1);
            }
            // Restore leading/trailing whitespace (e.g. trailing newlines) from the original
            const leading = input.match(/^\s*/)[0];
            const trailing = input.match(/\s*$/)[0];
            cleanedResult = leading + cleanedResult + trailing;
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

async function copyToClipboardAndNotify(text, message, tab, html = null) {
    if ((!text || text.trim() === '') && (!html || html.trim() === '')) {
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
                { type: 'copy-to-clipboard', target: 'offscreen', data: text, html: html },
                (response) => {
                    if (chrome.runtime.lastError) {
                        reject(chrome.runtime.lastError);
                    } else {
                        resolve(response);
                    }
                }
            );
        });

        if (response && response.success === false) {
            throw new Error(response.error || 'Unknown clipboard error');
        }

        // Show visual popup on the page immediately after copy
        try {
            // Ensure content script is loaded
            await ensureContentScript(tab.id);

            await chrome.tabs.sendMessage(tab.id, {
                type: 'show-popup',
                // The offscreen document returns the plain-text version of copied HTML
                text: (response && response.text) || text
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
