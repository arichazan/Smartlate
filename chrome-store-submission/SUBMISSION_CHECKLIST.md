# Phravexa: Chrome Web Store dashboard answers

Copy-paste text for the **Privacy practices** tab. The full release checklist is in
[`PRODUCTION_READINESS.md`](../PRODUCTION_READINESS.md), section 4.

## Single purpose

> Phravexa translates or rephrases text the user has selected, using an AI provider and API key the user configures, and copies the result to the clipboard.

## Permission justifications

| Permission | Justification to paste |
|---|---|
| `contextMenus` | Adds one menu item per configured language to the right-click menu for selected text. This menu is the extension's only entry point. |
| `activeTab` | When the user clicks a Phravexa menu item, grants temporary access to that tab so the extension can read the current selection with its formatting and show a short status popup. No access to other tabs or to pages the user does not act on. |
| `scripting` | Used together with activeTab to run the selection reader and inject the status popup into the tab the user clicked in. |
| `storage` | Saves the user's API key (local to the device) and preferences: provider, optional model, tone instructions and language list. |
| `offscreen` | Manifest V3 service workers cannot access the clipboard. An offscreen document (reason CLIPBOARD) is opened briefly to write the result and closed right after. |
| `clipboardWrite` | Writes the translated or rephrased result to the clipboard, as rich text (HTML) and plain text. |
| `notifications` | Fallback feedback on pages where the in-page popup cannot be shown (for example chrome:// pages, the Chrome Web Store and the PDF viewer): confirms the copy or explains an error. |
| Host `https://api.openai.com/*`, `https://api.anthropic.com/*`, `https://api.deepseek.com/*` | Sends the selected text to the AI provider the user configured, with the user's own API key. No other hosts are contacted. |

## Remote code

> No, I am not using remote code. All JavaScript is included in the package; the extension only exchanges JSON data with the AI provider APIs.

## Data usage disclosures

Tick these categories:
- **Authentication information**: the user's AI provider API key, stored locally and sent only to that provider.
- **Website content**: the text the user selects and explicitly sends for translation.

Leave all other categories unticked (no personally identifiable info, health, financial, personal communications collected by us, location, web history or user activity).

Certify all three statements:
- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

Privacy policy URL: https://github.com/arichazan/Smartlate/blob/main/PRIVACY.md
