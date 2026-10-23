chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target !== 'offscreen') {
    return false;
  }

  if (message.type === 'copy-to-clipboard') {
    const html = message.html || null;
    // When copying HTML, derive the plain-text version so apps without rich paste still get line breaks
    const text = html ? htmlToPlainText(html) : message.data;
    const respond = (result) => sendResponse({ ...result, text: text });

    // Try modern Clipboard API first
    if (navigator.clipboard && navigator.clipboard.write && navigator.clipboard.writeText) {
      const write = html
        ? navigator.clipboard.write([new ClipboardItem({
            'text/html': new Blob([html], { type: 'text/html' }),
            'text/plain': new Blob([text], { type: 'text/plain' })
          })])
        : navigator.clipboard.writeText(text);
      write
        .then(() => {
          console.log('Text copied to clipboard successfully (Clipboard API)');
          respond({ success: true });
          // Note: Don't close document from here, let background script handle it
        })
        .catch((err) => {
          console.log('Clipboard API failed, trying fallback method:', err);
          // Fallback to execCommand method
          copyToClipboardFallback(text, html, respond);
        });
    } else {
      // Use fallback method
      copyToClipboardFallback(text, html, respond);
    }

    return true; // Keep the message channel open for async response
  }
});

function htmlToPlainText(html) {
  // innerText needs the element to be rendered to produce line breaks for blocks and <br>
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-999999px';
  container.style.top = '-999999px';
  container.style.whiteSpace = 'normal';
  container.innerHTML = html;
  document.body.appendChild(container);
  const text = container.innerText || container.textContent || '';
  document.body.removeChild(container);
  return text.trim();
}

function copyToClipboardFallback(text, html, sendResponse) {
  try {
    // Create a temporary textarea element
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-999999px';
    textarea.style.top = '-999999px';
    document.body.appendChild(textarea);

    // Set both formats explicitly so the HTML survives the copy
    const onCopy = (event) => {
      event.clipboardData.setData('text/plain', text);
      if (html) {
        event.clipboardData.setData('text/html', html);
      }
      event.preventDefault();
    };
    document.addEventListener('copy', onCopy);

    // Select and copy the text
    textarea.focus();
    textarea.select();

    const successful = document.execCommand('copy');
    document.removeEventListener('copy', onCopy);
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
