'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../extension/lib/core.js');

const { buildPrompt, buildRequest, parseResponse, cleanResult, classifyHttpError,
  classifyNetworkError, validateSelection, normalizeLanguages, resolveModel, PROVIDERS, PhravexaError } = core;

test('buildPrompt: rephrase in English uses tone and plain-text formatting rules', () => {
  const { prompt, isHtml, input, resultName } = buildPrompt({ language: 'English', instructions: 'Casual', text: 'Hi\n\n- a\n- b', html: null });
  assert.equal(isHtml, false);
  assert.equal(input, 'Hi\n\n- a\n- b');
  assert.equal(resultName, 'rephrased');
  assert.match(prompt, /^Rephrase the following text with this tone\/style: Casual\./);
  assert.match(prompt, /keep every line break, blank line/);
  assert.ok(prompt.endsWith(':\n\nHi\n\n- a\n- b'), 'input is appended verbatim');
});

test('buildPrompt: translation names the target language', () => {
  const { prompt, resultName } = buildPrompt({ language: 'Spanish', instructions: 'Formal', text: 'Hello', html: null });
  assert.equal(resultName, 'translated');
  assert.match(prompt, /^Translate the following text to Spanish/);
  assert.match(prompt, /Apply this tone\/style to the translation: Formal\./);
});

test('buildPrompt: HTML selection asks to preserve structure and uses the HTML as input', () => {
  const html = '<p>Hello <b>world</b></p><ul><li>One</li></ul>';
  const { prompt, isHtml, input } = buildPrompt({ language: 'French', instructions: '', text: 'Hello world\nOne', html });
  assert.equal(isHtml, true);
  assert.equal(input, html);
  assert.match(prompt, /Translate the following HTML to French/);
  assert.match(prompt, /Preserve the HTML structure exactly/);
  assert.ok(prompt.endsWith(html));
});

test('buildPrompt: falls back to default tone when instructions are blank', () => {
  const { prompt } = buildPrompt({ language: 'English', instructions: '   ', text: 'x' });
  assert.ok(prompt.includes(core.DEFAULT_INSTRUCTIONS));
});

test('buildRequest: OpenAI uses bearer auth, chat completions and max_completion_tokens', () => {
  const { url, init, model } = buildRequest({ provider: 'openai', apiKey: 'sk-test', prompt: 'P' });
  assert.equal(url, 'https://api.openai.com/v1/chat/completions');
  assert.equal(init.method, 'POST');
  assert.equal(init.headers.Authorization, 'Bearer sk-test');
  const body = JSON.parse(init.body);
  assert.equal(body.model, PROVIDERS.openai.defaultModel);
  assert.equal(model, PROVIDERS.openai.defaultModel);
  assert.deepEqual(body.messages, [{ role: 'user', content: 'P' }]);
  assert.ok(body.max_completion_tokens > 0);
  assert.equal(body.max_tokens, undefined);
  assert.equal(body.temperature, undefined);
});

test('buildRequest: Anthropic uses x-api-key, version and browser-access headers', () => {
  const { url, init } = buildRequest({ provider: 'anthropic', apiKey: 'ak', prompt: 'P' });
  assert.equal(url, 'https://api.anthropic.com/v1/messages');
  assert.equal(init.headers['x-api-key'], 'ak');
  assert.equal(init.headers['anthropic-version'], '2023-06-01');
  assert.equal(init.headers['anthropic-dangerous-direct-browser-access'], 'true');
  assert.equal(init.headers.Authorization, undefined);
  const body = JSON.parse(init.body);
  assert.equal(body.model, PROVIDERS.anthropic.defaultModel);
  assert.ok(body.max_tokens >= 4096);
  assert.deepEqual(body.output_config, { effort: 'low' });
});

test('buildRequest: Anthropic custom model omits effort setting', () => {
  const body = JSON.parse(buildRequest({ provider: 'anthropic', apiKey: 'ak', prompt: 'P', model: 'some-other-model' }).init.body);
  assert.equal(body.model, 'some-other-model');
  assert.equal(body.output_config, undefined);
});

test('buildRequest: DeepSeek endpoint and model override', () => {
  const { url, init } = buildRequest({ provider: 'deepseek', apiKey: 'dk', prompt: 'P', model: '  deepseek-reasoner ' });
  assert.equal(url, 'https://api.deepseek.com/chat/completions');
  const body = JSON.parse(init.body);
  assert.equal(body.model, 'deepseek-reasoner');
  assert.ok(body.max_tokens > 0);
});

test('buildRequest: unknown provider throws a user-facing error', () => {
  assert.throws(() => buildRequest({ provider: 'nope', apiKey: 'k', prompt: 'P' }), e => e instanceof PhravexaError && e.code === 'unsupported_provider');
});

test('resolveModel: blank override uses default', () => {
  assert.equal(resolveModel('deepseek', ''), 'deepseek-chat');
  assert.equal(resolveModel('deepseek', '  '), 'deepseek-chat');
});

test('parseResponse: OpenAI-style choices', () => {
  const r = parseResponse('openai', { choices: [{ message: { content: 'Hola' }, finish_reason: 'stop' }] });
  assert.deepEqual(r, { content: 'Hola', truncated: false });
  assert.equal(parseResponse('deepseek', { choices: [{ message: { content: 'x' }, finish_reason: 'length' }] }).truncated, true);
});

test('parseResponse: Anthropic skips non-text blocks and joins text blocks', () => {
  const r = parseResponse('anthropic', {
    content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: 'Bon' }, { type: 'text', text: 'jour' }],
    stop_reason: 'end_turn'
  });
  assert.deepEqual(r, { content: 'Bonjour', truncated: false });
  assert.equal(parseResponse('anthropic', { content: [{ type: 'text', text: 'a' }], stop_reason: 'max_tokens' }).truncated, true);
});

test('parseResponse: empty, refused and malformed responses throw', () => {
  assert.throws(() => parseResponse('openai', { choices: [] }), e => e.code === 'empty_result');
  assert.throws(() => parseResponse('openai', { choices: [{ message: { content: '   ' } }] }), e => e.code === 'empty_result');
  assert.throws(() => parseResponse('openai', { choices: [{ message: { content: null, refusal: 'no' } }] }), e => e.code === 'refused');
  assert.throws(() => parseResponse('anthropic', { content: [], stop_reason: 'refusal' }), e => e.code === 'refused');
  assert.throws(() => parseResponse('anthropic', null), e => e.code === 'bad_response');
});

test('cleanResult: restores leading/trailing whitespace and line breaks', () => {
  const input = '\nLine one\n\nLine two\n';
  assert.equal(cleanResult('Línea uno\n\nLínea dos', { input, isHtml: false }), '\nLínea uno\n\nLínea dos\n');
});

test('cleanResult: strips quotes the model added but keeps quotes from the original', () => {
  assert.equal(cleanResult('"Hola"', { input: 'Hello', isHtml: false }), 'Hola');
  assert.equal(cleanResult('“Hola”', { input: 'Hello', isHtml: false }), 'Hola');
  assert.equal(cleanResult('"Hola"', { input: '"Hello"', isHtml: false }), '"Hola"');
});

test('cleanResult: strips a wrapping code fence unless the input was fenced', () => {
  assert.equal(cleanResult('```\n- uno\n- dos\n```', { input: '- one\n- two', isHtml: false }), '- uno\n- dos');
  const fenced = '```js\nconst a = 1;\n```';
  assert.equal(cleanResult(fenced, { input: fenced, isHtml: false }), fenced);
});

test('cleanResult: HTML keeps markup and strips html code fences', () => {
  const out = cleanResult('```html\n<p>Hola <b>mundo</b></p>\n```', { input: '<p>Hello <b>world</b></p>', isHtml: true });
  assert.equal(out, '<p>Hola <b>mundo</b></p>');
});

test('cleanResult: preserves indentation and markdown inside the text', () => {
  const input = '# Title\n\n  * item **bold**\n    * nested';
  const output = '# Título\n\n  * elemento **negrita**\n    * anidado';
  assert.equal(cleanResult(output, { input, isHtml: false }), output);
});

test('classifyHttpError: maps common statuses', () => {
  assert.equal(classifyHttpError(401, '').code, 'auth');
  assert.equal(classifyHttpError(403, '').code, 'auth');
  assert.equal(classifyHttpError(429, '{"error":{"message":"Rate limit reached"}}').code, 'rate_limit');
  assert.equal(classifyHttpError(429, '{"error":{"message":"You exceeded your current quota","type":"insufficient_quota"}}').code, 'quota');
  assert.equal(classifyHttpError(402, '{"error":{"message":"Insufficient Balance"}}').code, 'quota');
  assert.equal(classifyHttpError(404, '{"error":{"type":"not_found_error","message":"model: foo"}}').code, 'model');
  assert.equal(classifyHttpError(400, '{"error":{"message":"The model `x` does not exist"}}').code, 'model');
  assert.equal(classifyHttpError(400, '{"error":{"message":"max_tokens: too large for model"}}').code, 'bad_request');
  assert.equal(classifyHttpError(529, '{"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}').code, 'server');
  assert.equal(classifyHttpError(503, 'not json').code, 'server');
  assert.equal(classifyHttpError(418, '').code, 'http');
});

test('classifyHttpError: warnings for transient errors only', () => {
  assert.equal(classifyHttpError(429, '').isWarning, true);
  assert.equal(classifyHttpError(500, '').isWarning, true);
  assert.equal(classifyHttpError(401, '').isWarning, false);
});

test('classifyNetworkError: timeout vs offline', () => {
  const abort = new Error('aborted'); abort.name = 'AbortError';
  assert.equal(classifyNetworkError(abort).code, 'timeout');
  assert.equal(classifyNetworkError(new TypeError('Failed to fetch')).code, 'network');
});

test('validateSelection: rejects empty and oversized selections', () => {
  assert.throws(() => validateSelection({ text: '' }), e => e.code === 'empty_selection');
  assert.throws(() => validateSelection({ text: '  \n ' }), e => e.code === 'empty_selection');
  assert.throws(() => validateSelection(null), e => e.code === 'empty_selection');
  assert.throws(() => validateSelection({ text: 'x'.repeat(core.MAX_INPUT_CHARS + 1) }), e => e.code === 'too_long');
  assert.doesNotThrow(() => validateSelection({ text: 'ok', html: '<b>ok</b>' }));
});

test('normalizeLanguages: trims, de-duplicates and drops English', () => {
  assert.deepEqual(normalizeLanguages([' Spanish ', 'spanish', 'English', '', 'French', 42]), ['Spanish', 'French']);
  assert.deepEqual(normalizeLanguages(undefined), []);
});
