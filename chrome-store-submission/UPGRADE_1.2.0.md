# Phravexa 1.2.0 — Chrome Web Store Update

## What's new in 1.2.0
- Text selected in a text box or rich-text editor (Gmail, LinkedIn, etc.) is replaced in place with the translation — no Cmd/Ctrl+V needed. Cmd/Ctrl+Z undoes it.
- The result is still copied to the clipboard, so text selected elsewhere on a page works as before.
- If the text was edited while the translation was running, it is not overwritten (clipboard only).

No new permissions or host permissions, so existing users get the update silently, with no re-approval prompt.

## Steps

1. **Push the privacy policy first.** `PRIVACY.md` now lists the `scripting` permission. Push it so
   https://arichazan.github.io/Phravexa/PRIVACY shows the new version before review.
2. Open https://chrome.google.com/webstore/devconsole and select **AI Translate & Rephrase - Phravexa**.
3. **Package** tab → **Upload new package** → `chrome-store-submission/phravexa-1.2.0.zip`.
   The version must read 1.2.0.
4. **Store listing** tab → replace the **Description** with the contents of `store-description.txt`.
   (The summary, category, and promo tiles are unchanged.)
   - Optional: add a screenshot of a text box after in-place replacement. The current
     `3. clipboard.png` still matches the clipboard behaviour.
5. **Privacy practices** tab → update the **scripting** justification:
   ```
   Used to read the text the user selected, show non-intrusive progress and confirmation messages on the page, and write the translated or rephrased result back into the text box or editor where the user selected the text. Scripts are only injected into the active tab after the user picks a language from the right-click menu.
   ```
   Data usage answers are unchanged: the only data sent anywhere is the selected text, which goes to the user's chosen AI provider.
6. **Submit for review.**

## Package check (done)
- `phravexa-1.2.0.zip`: 14 files, manifest version 1.2.0, `background.js` identical to source.
