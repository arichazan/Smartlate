# Phravexa 1.3.0 — Chrome Web Store Update

If 1.2.0 was never uploaded, upload 1.3.0 instead: it contains everything from 1.2.0.

## What's new in 1.3.0
- **Keyboard shortcut** (default `Alt+Shift+T`, changeable at `chrome://extensions/shortcuts`): translates or rephrases the selection with the language picked last from the menu (English/rephrase until one is picked).
- **Copy original** button in the result popup: puts the original selected text back on the clipboard, e.g. after in-place replacement.
- **Localised UI** in English, Spanish, French, German and Hebrew (settings, toolbar popup, in-page messages, errors, store description). The store name stays "AI Translate & Rephrase - Phravexa" in every language.
- **Safer in-place replacement**: password fields are never read or replaced; email/number inputs and read-only/disabled fields get the result on the clipboard only; selections inside iframes are replaced in the right frame; oversized selections are rejected early.

From 1.2.0 (if not yet live): text selected in a text box or rich-text editor is replaced in place (Cmd/Ctrl+Z undoes it), and is still copied to the clipboard.

No new permissions or host permissions (`commands` and `_locales` are not permissions), so existing users get the update silently.

## Steps

0. Merge `production-ready` into `main` first, so the privacy policy at https://github.com/arichazan/Smartlate/blob/main/PRIVACY.md mentions the shortcut and "Copy original" before review.
1. Open https://chrome.google.com/webstore/devconsole and select **AI Translate & Rephrase - Phravexa**.
2. **Package** tab → **Upload new package** → `dist/phravexa-1.3.0.zip` (build it with `./extension/build.sh`, or download the `phravexa-store-zip` artifact from the CI run). The version must read 1.3.0.
3. **Store listing** tab → replace the **Description** (English) with the contents of `store-description.txt`.
   - Optional: the dashboard now offers listings per language because the package has `_locales`. You can leave the other languages empty (the English listing is used) or add translated descriptions.
   - Optional: add a screenshot of the result popup with the **Copy original** button.
4. **Privacy practices** tab → replace the **activeTab**, **scripting** and **clipboardWrite** justifications with the texts in `SUBMISSION_CHECKLIST.md` (they now mention the keyboard shortcut and "Copy original"). Data usage answers are unchanged.
5. **Submit for review.**

## Package check
- `./extension/build.sh` builds `dist/phravexa-1.3.0.zip` (20 files) from a fixed list and verifies it, including every locale's description length (≤ 132) and the fixed store name.
