// Offscreen document used only to write to the clipboard. Offscreen documents
// never have focus, so navigator.clipboard usually rejects here; the
// execCommand('copy') path is tried first and the async Clipboard API is kept
// as a fallback.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.target !== 'offscreen' || message.type !== 'copy-to-clipboard') {
    return false;
  }

  const html = message.html || null;
  // When copying HTML, derive the plain-text version so apps without rich paste still get line breaks
  const text = html ? htmlToPlainText(html) : String(message.data || '');

  copy(text, html)
    .then(() => sendResponse({ success: true, text }))
    .catch(err => sendResponse({ success: false, error: (err && err.message) || String(err), text }));

  return true; // Keep the message channel open for the async response
});

async function copy(text, html) {
  if (copyWithExecCommand(text, html)) {
    return;
  }
  if (navigator.clipboard && navigator.clipboard.write && typeof ClipboardItem !== 'undefined' && html) {
    await navigator.clipboard.write([new ClipboardItem({
      'text/html': new Blob([html], { type: 'text/html' }),
      'text/plain': new Blob([text], { type: 'text/plain' })
    })]);
    return;
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  throw new Error('No clipboard method available');
}

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

function copyWithExecCommand(text, html) {
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
  try {
    textarea.focus();
    textarea.select();
    return document.execCommand('copy');
  } catch (err) {
    return false;
  } finally {
    document.removeEventListener('copy', onCopy);
    textarea.remove();
  }
}
