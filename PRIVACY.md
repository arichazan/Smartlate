# Phravexa Privacy Policy

**Last updated:** 31 October 2026
**Applies to:** the Phravexa Chrome extension (Chrome Web Store ID `kdcfdhofgpgajndceenbjoocapfmojke`), version 1.2.0 and later
**Operator:** TR1.eu (Ari Chazan), Barcelona, Spain
**Contact:** support@itbcn.com

## Summary

- Phravexa has no servers, no accounts, no analytics and no tracking. We (the operator) never receive your text, your API key or your settings.
- When you choose a language from the right-click menu, or press the Phravexa keyboard shortcut, the text you selected is sent directly from your browser to the AI provider you configured (OpenAI, Anthropic or DeepSeek), using your own API key.
- Your API key stays on your device. Your other preferences may be synced between your own Chrome browsers by Google Chrome Sync.

## What the extension handles

| Data | When | Where it goes | Kept for |
|---|---|---|---|
| **Selected text** (plain text, or the HTML markup of a selection on a web page so formatting can be kept) | Only when you pick a language from the Phravexa right-click menu or press the Phravexa keyboard shortcut | Sent over HTTPS to your chosen AI provider, together with the translation/rephrasing instructions | Not stored by Phravexa. It exists in memory only while the request runs. |
| **Translated / rephrased result** | After the provider replies | Written back into the text box or editor you selected it in (if any), copied to your clipboard and shown briefly in a small popup on the page | Not stored by Phravexa. It stays on your clipboard until you copy something else. |
| **API key** for OpenAI, Anthropic or DeepSeek | When you save it on the settings page | Stored in `chrome.storage.local` on this device only. Sent only to the matching provider, as the request's authentication header. | Until you delete it in settings or remove the extension. |
| **Preferences**: chosen provider, optional model name, tone/special instructions, language list, and the language you used last (for the keyboard shortcut) | When you save settings | Stored in `chrome.storage.sync`. If you use Chrome Sync, Google syncs them between browsers signed in to your Google account. | Until you change them or remove the extension. |

Phravexa does not read pages you do not act on. It reads the current selection only at the moment you click a Phravexa menu item or press the Phravexa keyboard shortcut, using Chrome's `activeTab` permission. It never reads or replaces text in password fields.

The **Copy original** button in the confirmation popup copies the text you had selected back to your clipboard. That text is passed only within your browser and is not sent anywhere.

Phravexa does not collect browsing history, location, contacts, identifiers or usage statistics, and does not sell or transfer any data to third parties other than the AI provider you choose for the purpose described above.

## AI providers

Text you send is processed by the provider under your own account with them and under their terms and privacy policy:

- OpenAI: https://openai.com/policies/privacy-policy
- Anthropic: https://www.anthropic.com/legal/privacy
- DeepSeek: https://www.deepseek.com/privacy (DeepSeek states that it stores data on servers in the People's Republic of China)

Do not translate text that you are not allowed to share with your chosen provider.

## Chrome Web Store User Data Policy

Phravexa's use of information complies with the [Chrome Web Store User Data Policy](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq), including the Limited Use requirements. Data is used only to provide the translation and rephrasing feature you request, is not used for advertising, and is not read by humans at TR1.eu.

## Your choices and rights

- Delete your API key at any time by clearing the field on the settings page and saving, or by removing the extension (which deletes all of its stored data).
- Because we do not hold any of your data, we cannot access, export or delete it for you; it is under your control in your browser and with your AI provider. If you are in the EU/EEA you have rights under the GDPR, including the right to complain to a supervisory authority (in Spain, the AEPD, https://www.aepd.es). Questions: support@itbcn.com.

## Children

Phravexa is not directed at children under 13 (or under 14 in Spain).

## Changes

If this policy changes, the new version will be published at the same address with a new "Last updated" date. Material changes (for example a hosted, no-API-key plan) will be described in the extension's release notes before they take effect.
