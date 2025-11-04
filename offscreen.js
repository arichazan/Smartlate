chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target !== 'offscreen') {
    return false;
  }

  if (message.type === 'copy-to-clipboard') {
    const text = message.data;

    // Try modern Clipboard API first
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text)
        .then(() => {
          console.log('Text copied to clipboard successfully (Clipboard API)');
          sendResponse({ success: true });
          // Note: Don't close document from here, let background script handle it
        })
        .catch((err) => {
          console.log('Clipboard API failed, trying fallback method:', err);
          // Fallback to textarea method
          copyToClipboardFallback(text, sendResponse);
        });
    } else {
      // Use fallback method
      copyToClipboardFallback(text, sendResponse);
    }

    return true; // Keep the message channel open for async response
  }
});

function copyToClipboardFallback(text, sendResponse) {
  try {
    // Create a temporary textarea element
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-999999px';
    textarea.style.top = '-999999px';
    document.body.appendChild(textarea);

    // Select and copy the text
    textarea.focus();
    textarea.select();

    const successful = document.execCommand('copy');
    document.body.removeChild(textarea);

    if (successful) {
      console.log('Text copied to clipboard successfully (fallback method)');
      sendResponse({ success: true });
      // Note: Don't close document from here, let background script handle it
    } else {
      throw new Error('execCommand copy failed');
    }
  } catch (err) {
    console.error('Failed to copy text to clipboard (fallback):', err);
    sendResponse({ success: false, error: err.message });
  }
}
