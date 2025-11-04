# Smartlate

A Chrome extension for smart translation and rephrasing using AI providers (OpenAI, Anthropic, or DeepSeek).

## Features

- **Multi-language Translation**: Translate selected text to any configured language
- **AI-Powered Rephrasing**: Rephrase text with customizable tone (professional, casual, concise, etc.)
- **Multiple AI Providers**: Supports OpenAI, Anthropic (Claude), and DeepSeek
- **One-Click Operation**: Right-click on selected text and choose your target language
- **Clipboard Integration**: Translated text is automatically copied to clipboard
- **Simple Menu**: Flat menu structure with all languages at the top level

## Installation

1. Clone this repository or download the ZIP file
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the extension directory
5. The extension icon will appear in your toolbar

## Setup

1. Click the extension icon in the toolbar
2. Click "Go to Options" to configure:
   - **AI Provider**: Choose between OpenAI, Anthropic, or DeepSeek
   - **API Key**: Enter your API key for the selected provider
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
   - **English (Original)**: Rephrase in English with your chosen tone
   - **Other Languages**: Translate to that language AND rephrase with your tone
4. The result is automatically copied to your clipboard
5. Paste anywhere with `Cmd+V` (Mac) or `Ctrl+V` (Windows)

## How It Works

- **English (Original)**: Only rephrases the text using the configured tone
- **Other Languages**: Translates to the target language AND applies the tone
- All operations use your selected AI provider
- Results are copied directly to clipboard for easy pasting

## Privacy & Security

- Your API keys are stored locally in Chrome's secure storage
- No data is sent to any server except the AI provider you configure
- The extension only has access to text you explicitly select

## Permissions

- `contextMenus`: To add the translation options to the right-click menu
- `storage`: To save your settings (API keys, languages, tone)
- `notifications`: To confirm when text is copied
- `activeTab`: To work on the current page
- `offscreen`: To access the clipboard API
- `clipboardWrite`: To copy translated text to clipboard

## Development

Built with Chrome Extension Manifest V3

### File Structure

```
├── manifest.json          # Extension configuration
├── background.js          # Service worker handling translation logic
├── content.js             # Content script (not currently used)
├── offscreen.js           # Offscreen document for clipboard access
├── offscreen.html         # Offscreen document HTML
├── options.html           # Settings page
├── options.js             # Settings page logic
├── popup.html             # Extension popup
├── popup.js               # Extension popup logic
└── icons/                 # Extension icons
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## Technologies

- Chrome Extension APIs (Manifest V3)
- OpenAI API
- Anthropic Claude API
- DeepSeek API
- Chrome Offscreen Documents API

## License

MIT License - Feel free to use and modify as needed.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
