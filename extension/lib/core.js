// Phravexa core logic: prompt building, provider requests, response parsing,
// result cleanup and error classification. Pure functions with no Chrome API
// calls, so they can be unit-tested in Node and loaded in the service worker
// via importScripts().
(function (root) {
  'use strict';

  const DEFAULT_INSTRUCTIONS = 'Professional and polite, but maintain a friendly and approachable tone suitable for client communication.';

  // Endpoints and default models for each provider. Users can override the
  // model on the settings page if a provider retires the default.
  const PROVIDERS = {
    openai: {
      label: 'OpenAI',
      url: 'https://api.openai.com/v1/chat/completions',
      defaultModel: 'gpt-4.1-mini'
    },
    anthropic: {
      label: 'Anthropic',
      url: 'https://api.anthropic.com/v1/messages',
      defaultModel: 'claude-haiku-5-5'
    },
    deepseek: {
      label: 'DeepSeek',
      url: 'https://api.deepseek.com/chat/completions',
      defaultModel: 'deepseek-chat'
    }
  };

  const MAX_OUTPUT_TOKENS = 8192;
  // Selections larger than this are rejected before calling the provider
  const MAX_INPUT_CHARS = 30000;

  class PhravexaError extends Error {
    constructor(title, message, { isWarning = false, code = 'unknown' } = {}) {
      super(message);
      this.name = 'PhravexaError';
      this.title = title;
      this.isWarning = isWarning;
      this.code = code;
    }
  }

  function isRephrase(language) {
    return language === 'English';
  }

  function buildPrompt({ language, instructions, text, html }) {
    const tone = (instructions && instructions.trim()) || DEFAULT_INSTRUCTIONS;
    const isHtml = Boolean(html);
    const input = isHtml ? html : text;
    const kind = isHtml ? 'HTML' : 'text';
    const resultName = isRephrase(language) ? 'rephrased' : 'translated';

    const task = isRephrase(language)
      ? `Rephrase the following ${kind} with this tone/style: ${tone}.`
      : `Translate the following ${kind} to ${language}, keeping the translation as close to the original meaning as possible. Apply this tone/style to the translation: ${tone}.`;

    let prompt;
    if (isHtml) {
      prompt = `${task} Change ONLY the human-readable text. Preserve the HTML structure exactly: keep every tag, attribute, link URL, inline style, list, table, line break (<br>), heading and bold/italic/underline formatting in the same places as the original. Do not add, remove, merge or reorder elements, and do not wrap the result in <html>, <body> or code fences. Return ONLY the ${resultName} HTML without explanations or additional commentary:\n\n${input}`;
    } else {
      prompt = `${task} Preserve the original formatting exactly: keep every line break, blank line, paragraph break, indentation, list/bullet marker, markdown syntax and spacing in the same places as the original. Do not merge or split lines. Return ONLY the ${resultName} text without quotes, explanations, or additional commentary:\n\n${input}`;
    }
    return { prompt, isHtml, input, resultName };
  }

  function resolveModel(provider, modelOverride) {
    const override = modelOverride && modelOverride.trim();
    return override || PROVIDERS[provider].defaultModel;
  }

  function buildRequest({ provider, apiKey, prompt, model }) {
    const config = PROVIDERS[provider];
    if (!config) {
      throw new PhravexaError(
        'Unsupported Provider',
        `Provider '${provider}' is not supported. Please choose OpenAI, Anthropic or DeepSeek in settings.`,
        { code: 'unsupported_provider' }
      );
    }
    const resolvedModel = resolveModel(provider, model);
    let headers;
    let body;

    if (provider === 'anthropic') {
      headers = {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        // Required by the Anthropic API for requests that carry a browser Origin
        'anthropic-dangerous-direct-browser-access': 'true'
      };
      body = {
        model: resolvedModel,
        max_tokens: MAX_OUTPUT_TOKENS,
        messages: [{ role: 'user', content: prompt }]
      };
      if (resolvedModel === config.defaultModel) {
        // Translation needs little deliberation; keep latency and cost low
        body.output_config = { effort: 'low' };
      }
    } else {
      headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      };
      body = {
        model: resolvedModel,
        messages: [{ role: 'user', content: prompt }]
      };
      // OpenAI deprecated max_tokens in favour of max_completion_tokens
      body[provider === 'openai' ? 'max_completion_tokens' : 'max_tokens'] = MAX_OUTPUT_TOKENS;
    }

    return { url: config.url, init: { method: 'POST', headers, body: JSON.stringify(body) }, model: resolvedModel };
  }

  // Returns the generated text, or throws a PhravexaError when the provider
  // answered 200 but without usable text.
  function parseResponse(provider, json) {
    let content = '';
    let truncated = false;
    let refused = false;

    if (!json || typeof json !== 'object') {
      throw new PhravexaError('Unexpected Response', 'The AI provider returned an unreadable response. Please try again.', { code: 'bad_response' });
    }

    if (provider === 'anthropic') {
      const blocks = Array.isArray(json.content) ? json.content : [];
      // Responses can contain non-text blocks (e.g. thinking) before the answer
      content = blocks.filter(b => b && b.type === 'text' && typeof b.text === 'string').map(b => b.text).join('');
      truncated = json.stop_reason === 'max_tokens';
      refused = json.stop_reason === 'refusal';
    } else {
      const choice = Array.isArray(json.choices) ? json.choices[0] : null;
      const message = choice && choice.message;
      if (message && typeof message.content === 'string') {
        content = message.content;
      } else if (message && Array.isArray(message.content)) {
        content = message.content.map(p => (p && typeof p.text === 'string') ? p.text : '').join('');
      }
      truncated = Boolean(choice && choice.finish_reason === 'length');
      refused = Boolean(message && message.refusal) || Boolean(choice && choice.finish_reason === 'content_filter');
    }

    if (refused && !content.trim()) {
      throw new PhravexaError('Request Declined', 'The AI provider declined to process this text.', { isWarning: true, code: 'refused' });
    }
    if (!content.trim()) {
      throw new PhravexaError('Empty Result', 'The AI provider returned an empty result. Please try again.', { code: 'empty_result' });
    }
    return { content, truncated };
  }

  // Removes wrapping the model sometimes adds and restores the selection's
  // leading/trailing whitespace so line breaks around the text survive.
  function cleanResult(result, { input, isHtml }) {
    let cleaned = String(result).trim();
    if (isHtml) {
      return cleaned.replace(/^```(?:html)?\s*\n?/i, '').replace(/\n?```$/, '').trim();
    }
    // Strip a code fence wrapping the whole answer when the input had none
    if (!/^```/.test(input.trim())) {
      const fence = cleaned.match(/^```[a-zA-Z]*\n([\s\S]*?)\n?```$/);
      if (fence) cleaned = fence[1];
    }
    const inputTrimmed = input.trim();
    const wrappedIn = (s, open, close) => s.length >= 2 && s.startsWith(open) && s.endsWith(close);
    const quotePairs = [['"', '"'], ["'", "'"], ['“', '”'], ['«', '»']];
    for (const [open, close] of quotePairs) {
      // Only strip quotes the model added, not quotes that were in the original
      if (wrappedIn(cleaned, open, close) && !wrappedIn(inputTrimmed, open, close)) {
        cleaned = cleaned.slice(open.length, -close.length);
        break;
      }
    }
    const leading = input.match(/^\s*/)[0];
    const trailing = input.slice(leading.length).match(/\s*$/)[0];
    return leading + cleaned + trailing;
  }

  function extractProviderMessage(bodyText) {
    if (!bodyText) return '';
    try {
      const json = JSON.parse(bodyText);
      const err = json.error;
      if (typeof err === 'string') return err;
      if (err && typeof err.message === 'string') return err.message;
      if (typeof json.message === 'string') return json.message;
    } catch (e) {
      // Not JSON
    }
    return '';
  }

  // Maps an HTTP error from a provider to a user-facing error.
  function classifyHttpError(status, bodyText, providerLabel = 'The AI provider') {
    const detail = extractProviderMessage(bodyText);
    const lowered = detail.toLowerCase();
    const suffix = detail ? ` (${detail.slice(0, 160)})` : '';

    if (status === 401 || status === 403) {
      return new PhravexaError('Invalid API Key', `${providerLabel} rejected your API key. Please check it in Phravexa settings.`, { code: 'auth' });
    }
    if (status === 402 || lowered.includes('insufficient') || lowered.includes('quota') || lowered.includes('credit balance')) {
      return new PhravexaError('Out of Credit', `${providerLabel} reports that your account has no remaining credit or quota. Add billing credit with the provider and try again.`, { code: 'quota' });
    }
    if (status === 429) {
      return new PhravexaError('Rate Limit', `${providerLabel} is rate limiting requests. Please wait a moment and try again.`, { isWarning: true, code: 'rate_limit' });
    }
    if (status === 404 || (status === 400 && lowered.includes('model') &&
        /(not found|does not exist|invalid|unknown|not supported|not available)/.test(lowered))) {
      return new PhravexaError('Model Not Available', `The selected model is not available for your account${suffix}. Set a different model in Phravexa settings.`, { code: 'model' });
    }
    if (status === 400 || status === 413 || status === 422) {
      return new PhravexaError('Request Rejected', `${providerLabel} rejected the request${suffix}.`, { code: 'bad_request' });
    }
    if (status >= 500) {
      return new PhravexaError('Provider Unavailable', `${providerLabel} is temporarily unavailable (HTTP ${status}). Please try again shortly.`, { isWarning: true, code: 'server' });
    }
    return new PhravexaError('Translation Error', `Request failed with HTTP ${status}${suffix}.`, { code: 'http' });
  }

  function classifyNetworkError(err) {
    if (err && (err.name === 'AbortError' || err.name === 'TimeoutError')) {
      return new PhravexaError('Request Timed Out', 'The AI provider did not respond in time. Please try again.', { isWarning: true, code: 'timeout' });
    }
    return new PhravexaError('Network Error', 'Could not reach the AI provider. Please check your internet connection.', { isWarning: true, code: 'network' });
  }

  function validateSelection(selection) {
    const text = selection && typeof selection.text === 'string' ? selection.text : '';
    if (!text.trim()) {
      throw new PhravexaError('No Text Selected', 'Select some text first, then right-click and choose a language.', { isWarning: true, code: 'empty_selection' });
    }
    const input = selection.html || text;
    if (input.length > MAX_INPUT_CHARS) {
      throw new PhravexaError('Selection Too Long', `Please select less text (up to about ${MAX_INPUT_CHARS.toLocaleString('en-US')} characters).`, { isWarning: true, code: 'too_long' });
    }
  }

  // Normalises the user's language list: trimmed, unique, and without the
  // built-in English entry (which is always shown first).
  function normalizeLanguages(languages) {
    const seen = new Set(['english']);
    const result = [];
    (Array.isArray(languages) ? languages : []).forEach(lang => {
      const name = typeof lang === 'string' ? lang.trim() : '';
      if (!name || seen.has(name.toLowerCase())) return;
      seen.add(name.toLowerCase());
      result.push(name);
    });
    return result;
  }

  const api = {
    DEFAULT_INSTRUCTIONS,
    PROVIDERS,
    MAX_INPUT_CHARS,
    MAX_OUTPUT_TOKENS,
    PhravexaError,
    isRephrase,
    buildPrompt,
    resolveModel,
    buildRequest,
    parseResponse,
    cleanResult,
    classifyHttpError,
    classifyNetworkError,
    validateSelection,
    normalizeLanguages
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.PhravexaCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
