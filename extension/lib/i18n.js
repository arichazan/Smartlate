// Localises extension pages (popup, settings) from _locales via chrome.i18n.
// Elements carry the English text in the HTML; data-i18n* attributes name the
// message that replaces it, so a missing message keeps the English text.
//   data-i18n="key"              -> textContent
//   data-i18n-placeholder="key"  -> placeholder
//   data-i18n-title="key"        -> title
(function (root) {
  'use strict';

  function msg(key, fallback, substitutions) {
    try {
      const subs = substitutions && substitutions.map(String);
      return chrome.i18n.getMessage(key, subs) || fallback;
    } catch (e) {
      return fallback;
    }
  }

  function localize(doc) {
    doc.querySelectorAll('[data-i18n]').forEach(el => {
      el.textContent = msg(el.dataset.i18n, el.textContent);
    });
    doc.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      el.placeholder = msg(el.dataset.i18nPlaceholder, el.placeholder);
    });
    doc.querySelectorAll('[data-i18n-title]').forEach(el => {
      el.title = msg(el.dataset.i18nTitle, el.title);
    });
    const html = doc.documentElement;
    try {
      html.lang = chrome.i18n.getUILanguage();
    } catch (e) {
      // Keep the default
    }
    html.dir = msg('@@bidi_dir', 'ltr');
  }

  root.PhravexaI18n = { msg, localize };
  // Scripts are loaded at the end of <body>, so the DOM is ready
  localize(document);
})(globalThis);
