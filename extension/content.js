// Prevent duplicate injection
if (!window.phravexaContentScriptLoaded) {
    window.phravexaContentScriptLoaded = true;

    // Store reference to current popup
    let currentPopup = null;

    // Listen for messages from the background script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'ping') {
            sendResponse({ success: true });
        } else if (message.type === 'show-loading') {
            showLoadingPopup(message.label);
            sendResponse({ success: true });
        } else if (message.type === 'show-popup' && message.text) {
            showPopup(message.text, message.truncated);
            sendResponse({ success: true });
        } else if (message.type === 'show-error') {
            showErrorPopup(message.title, message.message, message.isWarning);
            sendResponse({ success: true });
        }
        return false;
    });

function showLoadingPopup(label) {
    // Remove any existing popup
    if (currentPopup && currentPopup.parentNode) {
        currentPopup.remove();
    }

    // Create popup element
    const popup = document.createElement('div');
    popup.className = 'ai-text-tuner-popup loading';

    // Create header with loading spinner
    const header = document.createElement('div');
    header.className = 'ai-text-tuner-popup-header';
    const labelEl = document.createElement('span');
    labelEl.textContent = label || 'Translating';
    const spinner = document.createElement('span');
    spinner.className = 'ai-text-tuner-spinner';
    header.append(labelEl, spinner);

    // Assemble popup
    popup.appendChild(header);

    // Add to page
    document.body.appendChild(popup);
    currentPopup = popup;
}

function showPopup(text, truncated = false) {
    // Remove any existing popup
    if (currentPopup && currentPopup.parentNode) {
        currentPopup.remove();
    }

    // Create popup element
    const popup = document.createElement('div');
    popup.className = 'ai-text-tuner-popup';

    // Create header
    const header = document.createElement('div');
    header.className = 'ai-text-tuner-popup-header';
    header.appendChild(makeIcon('\u2713'));
    const headerText = document.createElement('span');
    headerText.textContent = truncated ? 'Copied to clipboard (may be cut short)' : 'Copied to clipboard';
    header.appendChild(headerText);

    // Create content
    const content = document.createElement('div');
    content.className = 'ai-text-tuner-popup-content';
    content.textContent = text;

    // Assemble popup
    popup.appendChild(header);
    popup.appendChild(content);

    // Add to page
    document.body.appendChild(popup);
    currentPopup = popup;

    // Auto-hide after 1.5 seconds
    setTimeout(() => {
        popup.classList.add('hiding');
        setTimeout(() => {
            if (popup.parentNode) {
                popup.remove();
            }
            if (currentPopup === popup) {
                currentPopup = null;
            }
        }, 300); // Wait for animation to complete
    }, 1500);
}

function showErrorPopup(title, message, isWarning = false) {
    // Remove any existing popup
    if (currentPopup && currentPopup.parentNode) {
        currentPopup.remove();
    }

    // Create popup element
    const popup = document.createElement('div');
    popup.className = 'ai-text-tuner-popup ' + (isWarning ? 'warning' : 'error');

    // Create header
    const header = document.createElement('div');
    header.className = 'ai-text-tuner-popup-header';
    header.appendChild(makeIcon(isWarning ? '\u26A0\uFE0F' : '\u274C'));
    const titleEl = document.createElement('span');
    titleEl.textContent = title;
    header.appendChild(titleEl);

    // Create content
    const content = document.createElement('div');
    content.className = 'ai-text-tuner-popup-content';
    content.textContent = message;

    // Assemble popup
    popup.appendChild(header);
    popup.appendChild(content);

    // Add to page
    document.body.appendChild(popup);
    currentPopup = popup;

    // Auto-hide after 4 seconds (longer for errors)
    setTimeout(() => {
        popup.classList.add('hiding');
        setTimeout(() => {
            if (popup.parentNode) {
                popup.remove();
            }
            if (currentPopup === popup) {
                currentPopup = null;
            }
        }, 300); // Wait for animation to complete
    }, 4000);
}

function makeIcon(symbol) {
    const icon = document.createElement('span');
    icon.className = 'ai-text-tuner-popup-icon';
    icon.textContent = symbol;
    return icon;
}

} // End of guard block to prevent duplicate injection
