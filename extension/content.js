// Prevent duplicate injection
if (!window.phravexaContentScriptLoaded) {
    window.phravexaContentScriptLoaded = true;

    // Store reference to current popup
    let currentPopup = null;

    // Localised string from _locales, with the English text as fallback
    const msg = (key, fallback, substitutions) => {
        try {
            return chrome.i18n.getMessage(key, substitutions) || fallback;
        } catch (e) {
            return fallback;
        }
    };

    // Listen for messages from the background script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'ping') {
            sendResponse({ success: true });
        } else if (message.type === 'show-loading') {
            showLoadingPopup(message.label);
            sendResponse({ success: true });
        } else if (message.type === 'show-popup' && message.text) {
            showPopup(message.text, message.truncated, message.title, message.original);
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
    popup.setAttribute('role', 'status');
    applyDirection(popup);

    // Create header with loading spinner
    const header = document.createElement('div');
    header.className = 'ai-text-tuner-popup-header';
    const labelEl = document.createElement('span');
    labelEl.textContent = label || msg('loadingDefault', 'Translating');
    const spinner = document.createElement('span');
    spinner.className = 'ai-text-tuner-spinner';
    header.append(labelEl, spinner);

    // Assemble popup
    popup.appendChild(header);

    // Add to page
    document.body.appendChild(popup);
    currentPopup = popup;
}

function showPopup(text, truncated = false, title, original = null) {
    title = title || msg('popupCopied', 'Copied to clipboard');
    // Remove any existing popup
    if (currentPopup && currentPopup.parentNode) {
        currentPopup.remove();
    }

    // Create popup element
    const popup = document.createElement('div');
    popup.className = 'ai-text-tuner-popup';
    popup.setAttribute('role', 'status');
    applyDirection(popup);

    // Create header
    const header = document.createElement('div');
    header.className = 'ai-text-tuner-popup-header';
    header.appendChild(makeIcon('\u2713'));
    const headerText = document.createElement('span');
    headerText.textContent = truncated ? `${title} ${msg('popupTruncatedSuffix', '(may be cut short)')}` : title;
    header.appendChild(headerText);

    // Create content
    const content = document.createElement('div');
    content.className = 'ai-text-tuner-popup-content';
    content.textContent = text;
    // The result can be in any language, independent of the UI language
    content.setAttribute('dir', 'auto');

    // Assemble popup
    popup.appendChild(header);
    popup.appendChild(content);

    // "Copy original": puts the text the user selected back on the clipboard,
    // e.g. after it was replaced in place
    const hasOriginal = original && ((typeof original.text === 'string' && original.text.trim()) ||
        (typeof original.html === 'string' && original.html));
    if (hasOriginal) {
        const actions = document.createElement('div');
        actions.className = 'ai-text-tuner-popup-actions';
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'ai-text-tuner-copy-original';
        const label = msg('popupCopyOriginal', 'Copy original');
        button.textContent = label;
        button.title = msg('popupCopyOriginalHint', 'Copy the text you selected before it was changed');
        let busy = false;
        button.addEventListener('click', async () => {
            // (not button.disabled: disabling the focused button would drop keyboard focus)
            if (busy) return;
            busy = true;
            button.setAttribute('aria-busy', 'true');
            let ok = false;
            try {
                const response = await chrome.runtime.sendMessage({
                    type: 'copy-original', text: original.text || '', html: original.html || null
                });
                ok = Boolean(response && response.success);
            } catch (e) {
                ok = false;
            }
            button.textContent = ok
                ? msg('popupOriginalCopied', 'Original copied')
                : msg('popupOriginalCopyFailed', 'Could not copy');
            busy = false;
            button.removeAttribute('aria-busy');
            setTimeout(() => { button.textContent = label; }, 2000);
        });
        actions.appendChild(button);
        popup.appendChild(actions);
    }

    // Add to page
    document.body.appendChild(popup);
    currentPopup = popup;

    // Auto-hide; stay longer when there is a button to reach
    scheduleHide(popup, hasOriginal ? 5000 : 1500);
}

function showErrorPopup(title, message, isWarning = false) {
    // Remove any existing popup
    if (currentPopup && currentPopup.parentNode) {
        currentPopup.remove();
    }

    // Create popup element
    const popup = document.createElement('div');
    popup.className = 'ai-text-tuner-popup ' + (isWarning ? 'warning' : 'error');
    popup.setAttribute('role', 'alert');
    applyDirection(popup);

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
    scheduleHide(popup, 4000);
}

// Hides the popup after `delay` ms. The timer pauses while the pointer is over
// the popup or keyboard focus is inside it, so its button stays usable.
function scheduleHide(popup, delay) {
    let timer = null;
    let hovered = false;
    let focusedWithin = false;
    const hide = () => {
        popup.classList.add('hiding');
        setTimeout(() => {
            if (popup.parentNode) {
                popup.remove();
            }
            if (currentPopup === popup) {
                currentPopup = null;
            }
        }, 300); // Wait for animation to complete
    };
    const start = (ms) => {
        clearTimeout(timer);
        timer = setTimeout(hide, ms);
    };
    const pause = () => clearTimeout(timer);
    const resume = () => {
        if (!hovered && !focusedWithin) start(1500);
    };
    popup.addEventListener('mouseenter', () => { hovered = true; pause(); });
    popup.addEventListener('mouseleave', () => { hovered = false; resume(); });
    popup.addEventListener('focusin', () => { focusedWithin = true; pause(); });
    popup.addEventListener('focusout', (e) => {
        if (!popup.contains(e.relatedTarget)) {
            focusedWithin = false;
            resume();
        }
    });
    popup.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') hide();
    });
    start(delay);
}

// Right-to-left layout for Hebrew and other RTL UI languages
function applyDirection(popup) {
    const dir = msg('@@bidi_dir', 'ltr');
    popup.setAttribute('dir', dir);
    if (dir === 'rtl') popup.classList.add('rtl');
}

function makeIcon(symbol) {
    const icon = document.createElement('span');
    icon.className = 'ai-text-tuner-popup-icon';
    icon.textContent = symbol;
    return icon;
}

} // End of guard block to prevent duplicate injection
