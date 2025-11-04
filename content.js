// Store reference to current popup
let currentPopup = null;

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'show-loading') {
        showLoadingPopup();
        sendResponse({ success: true });
    } else if (message.type === 'show-popup' && message.text) {
        showPopup(message.text);
        sendResponse({ success: true });
    }
    return true;
});

function showLoadingPopup() {
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
    header.innerHTML = '<span>Translating</span><span class="ai-text-tuner-spinner"></span>';

    // Assemble popup
    popup.appendChild(header);

    // Add to page
    document.body.appendChild(popup);
    currentPopup = popup;
}

function showPopup(text) {
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
    header.innerHTML = '<span class="ai-text-tuner-popup-icon">✓</span><span>Copied to clipboard</span>';

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

    // Auto-hide after 3 seconds
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
    }, 3000);
}
