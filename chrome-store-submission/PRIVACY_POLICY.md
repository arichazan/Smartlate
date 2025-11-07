# Privacy Policy for Smartlate

**Last Updated:** November 5, 2024

## Overview

Smartlate ("the Extension") is committed to protecting your privacy. This privacy policy explains how we handle your data.

## Data Collection

**We do NOT collect, store, or transmit any personal data to our servers.** The Extension does not have any backend servers or analytics services.

### What Data is Stored Locally

The following data is stored locally on your device using Chrome's secure storage API:

1. **API Keys**: Your OpenAI, Anthropic, or DeepSeek API key (depending on which provider you choose)
2. **User Preferences**:
   - Selected AI provider
   - Configured target languages
   - Preferred rephrasing tone
3. **Selected Text**: Text you select on webpages is temporarily processed for translation/rephrasing

All of this data remains on your local device and is never transmitted to us.

## Data Transmission

The Extension transmits data only to the AI service provider you configure:

- **OpenAI (api.openai.com)** - if you select OpenAI as your provider
- **Anthropic (api.anthropic.com)** - if you select Anthropic as your provider
- **DeepSeek (api.deepseek.com)** - if you select DeepSeek as your provider

**What is sent to your chosen AI provider:**
- The text you select and choose to translate/rephrase
- Your API key (for authentication)
- Translation/rephrasing instructions

The Extension only sends data to the AI provider when you actively use the translation/rephrasing feature on selected text.

## Third-Party Services

When you use the Extension, you are subject to the privacy policies of your chosen AI provider:

- **OpenAI Privacy Policy**: https://openai.com/policies/privacy-policy
- **Anthropic Privacy Policy**: https://www.anthropic.com/privacy
- **DeepSeek Privacy Policy**: https://www.deepseek.com/privacy-policy

We recommend reviewing their policies to understand how they handle your data.

## Permissions Explained

The Extension requests the following permissions:

- **contextMenus**: To add translation options to your right-click menu
- **storage**: To securely save your API key and preferences locally on your device
- **notifications**: To confirm when translated text is copied to your clipboard
- **activeTab**: To access the text you select on the current webpage
- **offscreen**: To use Chrome's clipboard API for copying translated text
- **clipboardWrite**: To copy translated text to your clipboard
- **host_permissions** (api.openai.com, api.anthropic.com, api.deepseek.com): To communicate with your chosen AI provider

## Data Security

- API keys and preferences are stored using Chrome's built-in secure storage mechanism
- No data is transmitted over unencrypted connections (all API calls use HTTPS)
- We never have access to your API keys or usage data

## Children's Privacy

The Extension is not directed at children under the age of 13, and we do not knowingly collect information from children.

## Changes to This Policy

We may update this privacy policy from time to time. Any changes will be reflected in the "Last Updated" date above.

## Your Rights

Since all data is stored locally on your device:
- You can delete all Extension data by removing the Extension from Chrome
- You can clear your API key and preferences at any time through the Extension's options page
- You have complete control over what text you select and choose to translate

## Contact

If you have questions about this privacy policy, please contact:
support@itbcn.com

## Consent

By using the Smartlate Extension, you consent to this privacy policy.
