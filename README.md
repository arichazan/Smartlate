# Phravexa

[![CI](https://github.com/arichazan/Smartlate/actions/workflows/ci.yml/badge.svg)](https://github.com/arichazan/Smartlate/actions/workflows/ci.yml)

A Chrome extension (Manifest V3) that translates or rephrases selected text with your own OpenAI, Anthropic or DeepSeek API key and copies the result to your clipboard, formatting included.

- Chrome Web Store: https://chromewebstore.google.com/detail/kdcfdhofgpgajndceenbjoocapfmojke
- Website: https://arichazan.github.io/apps/phravexa.html
- Privacy policy: [PRIVACY.md](PRIVACY.md)

## Features

- **Multi-language Translation**: Translate selected text to any configured language
- **AI-Powered Rephrasing**: Rephrase text with customizable tone (professional, casual, concise, etc.)
- **Multiple AI Providers**: Supports OpenAI, Anthropic, and DeepSeek
- **One-Click Operation**: Right-click on selected text and choose your target language
- **Keeps Formatting**: Page selections keep headings, bold, links, lists and tables (copied as rich text); text-box selections keep line breaks and indentation
- **In-Place Replacement**: Text selected in a text box or editor is replaced with the result directly (Cmd/Ctrl+Z undoes it). Truncated results are never written back
- **Clipboard Integration**: The result is also copied to the clipboard and previewed in a small popup on the page
- **Simple Menu**: Flat menu structure with all languages at the top level
- **Clear Errors**: Invalid key, no credit, rate limits, unknown model and network problems are explained on the page

## Installation

Install from the Chrome Web Store, or for development:

1. Clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the `extension/` directory
5. The extension icon will appear in your toolbar

## Setup

1. Click the extension icon in the toolbar
2. Click "Go to Settings" to configure:
   - **AI Provider**: Choose between OpenAI, Anthropic, or DeepSeek
   - **API Key**: Enter your API key for the selected provider
   - **Model** (optional): Leave empty for the built-in default, or enter another model name
   - **Languages**: Add languages you want to translate to (e.g., Spanish, French, German)
   - **Tone**: Set the default rephrasing tone (professional, casual, concise, etc.)

### Getting API Keys

- **OpenAI**: https://platform.openai.com/api-keys
- **Anthropic**: https://console.anthropic.com/settings/keys
- **DeepSeek**: https://platform.deepseek.com/api_keys

## Usage

1. Select any text on a webpage
2. Right-click to open the context menu
3. Choose a language from the menu:
   - **English**: Rephrase in English with your chosen tone
   - **Other Languages**: Translate to that language AND rephrase with your tone
4. In a text box or editor the selection is replaced with the result; it is also copied to your clipboard
5. Paste anywhere with `Cmd+V` (Mac) or `Ctrl+V` (Windows)

## How It Works

- **English**: Only rephrases the text using the configured tone
- **Other Languages**: Translates to the target language AND applies the tone
- All operations use your selected AI provider
- Results are copied directly to clipboard for easy pasting

## Privacy & Security

- API keys are stored in `chrome.storage.local` on this device only; preferences (provider, languages, tone) use `chrome.storage.sync`
- Selected text is sent only when you click a menu item, and only to the AI provider you configured
- No Phravexa servers, no analytics. See [PRIVACY.md](PRIVACY.md)

## Permissions

- `contextMenus`: The right-click menu with your languages
- `activeTab` + `scripting`: Read the selection (with formatting) and show the status popup in the tab you clicked
- `storage`: Save your API key (local) and preferences (synced)
- `offscreen` + `clipboardWrite`: Write the result to the clipboard from an offscreen document
- `notifications`: Feedback on pages where the in-page popup cannot be shown (chrome:// pages, PDF viewer)
- Host access to the three provider APIs only

## Development

Built with Chrome Extension Manifest V3. Pure logic (prompt building, provider requests, response parsing, error mapping) lives in `extension/lib/core.js` so it can be unit-tested in Node.

### Tests

```bash
npm install                      # installs Playwright
npx playwright install chromium  # once
npm test                         # unit tests + end-to-end tests
```

- `npm run test:unit`: Node tests for prompts, requests, response parsing and formatting preservation
- `npm run test:e2e`: loads the unpacked extension in Chromium with Playwright, stubs the provider API and checks selection, clipboard (HTML and plain text), in-page popups, error messages, settings storage and key migration

CI runs both on every push (`.github/workflows/ci.yml`).

### Building for Production

```bash
./extension/build.sh
```

Creates `dist/phravexa-<version>.zip` with only the extension's runtime files and verifies the contents (file list, manifest, referenced files).

### File Structure

```
extension/
├── manifest.json          # Extension configuration
├── background.js          # Service worker: menu, selection, API calls, clipboard
├── lib/core.js            # Pure logic shared by the worker and settings page
├── content.js             # Content script for page interaction
├── content.css            # Styles for content script
├── offscreen.js           # Offscreen document for clipboard access
├── offscreen.html         # Offscreen document HTML
├── options.html           # Settings page
├── options.js             # Settings page logic
├── popup.html             # Extension popup
├── popup.js               # Extension popup logic
├── build.sh               # Build script for packaging
└── icons/                 # Extension icons
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## Technologies

- Chrome Extension APIs (Manifest V3)
- OpenAI API
- Anthropic API
- DeepSeek API
- Chrome Offscreen Documents API

## License

MIT License - Feel free to use and modify as needed.

## Contact

TR1.eu (Ari Chazan), Barcelona, Spain - support@itbcn.com
