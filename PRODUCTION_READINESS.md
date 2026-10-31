# Phravexa: Production Readiness

Branch: `production-ready` · Extension version: **1.3.0** · Chrome Web Store ID: `kdcfdhofgpgajndceenbjoocapfmojke`

## 1. Readiness score

**Before: 4/10 → After: 8/10**

Before, the Anthropic provider could not work because its default model had been retired, the privacy text said API keys stay on the device when they were synced through Google, there were no tests, and the product had two names. All of that is fixed and covered by automated tests in CI. Two points are left for the owner: a smoke test with real API keys and the store upload/review.

## 2. What was done

### Name and version
- Unified the name to **Phravexa** (the owner's chosen brand; the repo and landing slug were previously "Smartlate") in the manifest (store name `AI Translate & Rephrase - Phravexa`, `short_name: Phravexa`), settings page, popup, content script, README, store texts, privacy policy and promo tiles.
- Version bumped from 1.1.0 to **1.2.0**. The build now writes `dist/phravexa-1.2.0.zip`.
- Re-rendered the three promo images (`440x280.png`, `920x680.png`, `1400x560.png`) from the renamed HTML tiles.

### Code review findings and fixes (`extension/*.js`)

| Area | Finding | Fix |
|---|---|---|
| Models / endpoints | The Anthropic default model had been retired by the provider, so every Anthropic request failed. The OpenAI default was a legacy model. Anthropic responses were read as `content[0].text`, which breaks when the first block is not text. | Updated each provider's default to its current fast model (constants in `extension/lib/core.js`). Added an optional per-provider **model override** in settings, so a future retirement can be fixed without a release. The response parser now joins only the `text` blocks. Added the `anthropic-dangerous-direct-browser-access` header that Anthropic requires for requests that carry a browser Origin. OpenAI requests use `max_completion_tokens`. All three endpoints were checked: `api.openai.com/v1/chat/completions`, `api.anthropic.com/v1/messages`, `api.deepseek.com/chat/completions`. |
| Error handling | Errors were classified by searching the text of `Error.message` for "401" or "429". There was no handling for out-of-credit, unknown model, server errors, timeouts or malformed JSON (`choices[0]` threw a TypeError that surfaced as a generic error). Empty selections were sent to the provider. | Errors are now classified from the HTTP status plus the provider's error body: invalid key (401/403), out of credit (402, `insufficient_quota`), rate limit (429), model not available (404, or 400 that names the model), request rejected, provider unavailable (5xx/529), timeout (60 s AbortController), offline. Empty and oversized (>30k chars) selections are rejected locally. Truncated (`max_tokens`/`length`) and refused output are detected. |
| User-visible errors | When the page could not be scripted (chrome:// pages, Web Store, PDF viewer), the user got no success feedback at all, and errors only appeared through a fallback that sometimes failed. | One `sendToPage()` path, with a system notification as fallback for both success and errors. The loading popup now says "Rephrasing" or "Translating to X". Popups are built with `textContent` instead of `innerHTML`. |
| MV3 service-worker lifecycle | The context menu was only built in `onInstalled`. Concurrent `removeAll`/`create` calls, and a user language named "English" or entered twice, caused duplicate-id errors that broke the menu. `settings-updated` relied on the settings page messaging an awake worker. Async work ran inside `storage.get` callbacks with no top-level error handling. | Menu rebuilds are serialised and run on install, on browser startup and on `storage.onChanged`, so they also follow Chrome Sync changes from other devices. The language list is normalised (trimmed, de-duplicated, without English). The flow is promise-based and has top-level `try/catch`. |
| Offscreen clipboard | Each copy closed the offscreen document, so two fast translations could close it while the first was still copying. The background listener had a dead "forward to offscreen" branch. `navigator.clipboard` always rejects in an unfocused offscreen document, so every copy took the slow path through a logged failure. | Clipboard writes are queued, so one document is created, used and closed per job. Offscreen code tries `execCommand('copy')` first (HTML and plain text through the `copy` event), then the async Clipboard API. A missing or failed response is reported as "Clipboard Error". |
| Privacy | API keys were stored in `chrome.storage.sync`, which Google syncs across devices, while every document said they were local. The selected text was written to the service-worker console. | Keys moved to `chrome.storage.local`, with an automatic one-time migration from sync (covered by a test). Preferences stay in sync storage. Content logging was removed. |
| Permissions | No permission was unused. | Kept the existing set unchanged. The update adds **no new permission or host**, so existing users are not asked to re-approve and the extension is not disabled on update. Each permission is justified below. |

#### Permission justifications (minimal set)

| Permission | Why it is needed | Could it be removed? |
|---|---|---|
| `contextMenus` | The right-click language menu is the product. | No. |
| `activeTab` | Gives temporary access to the clicked tab only, so the selection can be read with its HTML and the popup shown. It avoids broad host permissions. | No. The alternative (`<all_urls>`) is far broader. |
| `scripting` | `executeScript` / `insertCSS` for the selection reader and the popup, under activeTab. | No. |
| `storage` | Key (local) and preferences (sync). | No. |
| `offscreen` | MV3 workers have no DOM or clipboard access. The document is opened only for the duration of a copy. | No. |
| `clipboardWrite` | Lets the offscreen document write rich and plain text to the clipboard. | No (copying is the core output). |
| `notifications` | Feedback where the in-page popup cannot run. | It could be dropped, but users on chrome:// pages or PDFs would then get no feedback. Kept. |
| Hosts: the 3 provider APIs | The direct API calls. | No. Each host is needed for its provider. |

### Tests and CI
- `tests/core.test.js`: 23 Node unit tests. They cover prompt building (rephrase/translate, text vs HTML, default tone), request building per provider (URL, auth headers, body, model override), response parsing (non-text blocks, truncation, refusals, empty and malformed responses), formatting preservation (leading/trailing newlines, blank lines, indentation, markdown, added quotes and code fences removed while original ones are kept, HTML fences), HTTP and network error mapping, selection validation and language normalisation.
- `tests/e2e/extension.e2e.test.js`: 10 Playwright tests that load the **unpacked extension** in Chromium. They stub `fetch` in the service worker and run the real menu handler against a local fixture page. They check: the worker boots with defaults; a formatted selection is sent as HTML with absolute links and comes back on the **clipboard as text/html and text/plain** without code fences; a textarea keeps its blank lines; the error popups for invalid key, rate limit, network failure and empty result; the setup-required and empty-selection warnings, which make no API call; the settings page writes the key to local storage only; sync-to-local key migration.
- `.github/workflows/ci.yml` runs on push/PR: syntax check, manifest/package version consistency, unit tests, e2e tests in Chromium, then builds, verifies and uploads the store ZIP as an artifact.
- Local result: `npm test`, 33/33 passing (e2e run twice, stable).
- CI: https://github.com/arichazan/Smartlate/actions/runs/41211297024 (code commits) and https://github.com/arichazan/Smartlate/actions/runs/41211556186 (with docs) both passed.

### Build
- `extension/build.sh` can run from any directory. It copies an explicit allow-list of 14 runtime files to a temp dir, normalises timestamps (reproducible ZIP), zips to `dist/phravexa-<version>.zip` and runs `scripts/verify-package.js`. The verifier fails the build if a file is missing or unexpected, if dev or secret files (`.md`, `.sh`, `.pem`, tests, dotfiles) are included, if the manifest is invalid or has a name over 75 or a description over 132 characters, if the ZIP name does not match the version, or if any manifest-referenced or runtime-loaded file is absent.
- `dist/` and `*.zip` are git-ignored.

### Documentation
- `PRIVACY.md` was rewritten to match the code: what is stored where (local vs sync), when text is sent, the providers' policies, the Limited Use statement, operator TR1.eu (Ari Chazan), Barcelona, and contact support@itbcn.com. `chrome-store-submission/PRIVACY_POLICY.md` now points to it, so there is only one source.
- `chrome-store-submission/STORE_LISTING.md` and `store-description.txt` were rewritten around the real features. `SUBMISSION_CHECKLIST.md` now holds paste-ready Privacy-practices answers. The outdated `FINAL_SUBMISSION_CHECKLIST.md` was removed; this document replaces it.

## 3. Remaining blockers

### Owner must do (Ari)

1. **Merge the branch.** PR #1 (1.2.0) is already merged. The polish-round-2 commits (1.3.0) are on `production-ready` only. On GitHub, go to arichazan/Smartlate, open **Pull requests**, click **New pull request**, set base `main` and compare `production-ready`, then **Create pull request**. Check that CI is green, then **Merge**. The updated privacy policy (keyboard shortcut, Copy original) is live only after the merge.
2. **Smoke-test with real keys (about 10 minutes).** Run `./extension/build.sh` (or download the `phravexa-store-zip` artifact from the CI run) and unzip it. In `chrome://extensions`, turn on Developer mode, click **Load unpacked** and pick the unzipped folder. Remove or disable the store version first. For **each** provider you have a key for (OpenAI, Anthropic, DeepSeek): open settings, choose the provider, paste the key and save. Then on any page, select a paragraph with bold text and a link, right-click, choose **Spanish** and paste into Gmail or Docs. Expected: a "Copied to clipboard" popup, with formatting kept. Also try **English** inside a textarea with blank lines. Then enter a wrong key and check that "Invalid API Key" appears. If a provider reports "Model Not Available", type a model your account has into **Model (optional)** and tell engineering which one, so the default can be updated.
3. **Upload the update.** Go to https://chrome.google.com/webstore/devconsole and open **Phravexa**. Under **Package**, click **Upload new package** and choose `dist/phravexa-1.3.0.zip`. Step-by-step notes for this update, including which privacy justifications changed: `chrome-store-submission/UPGRADE_1.3.0.md`. While smoke-testing (step 2), also press `Alt+Shift+T` on a selection after using the menu once, and click **Copy original** after a replacement in Gmail.
4. **Store listing tab.** Paste the description from `chrome-store-submission/store-description.txt`. Replace the small promo tile with `440x280.png` and the marquee with `1400x560.png`. Check that the screenshots in `chrome-store-submission/screenshots/` do not show the old name; if any do, take new ones at 1280x800. Set Homepage URL to `https://arichazan.github.io/apps/phravexa.html`.
5. **Privacy practices tab.** Paste the single purpose, the permission justifications and the data disclosures from `chrome-store-submission/SUBMISSION_CHECKLIST.md`. Set Privacy policy URL to `https://github.com/arichazan/Smartlate/blob/main/PRIVACY.md`. Tick the three certifications.
6. **Submit for review.** Click **Submit for review** and keep "Publish automatically after review" if you want it live right away.
7. **Landing page.** In the landing page source (`apps/phravexa.html` on arichazan.github.io), add a footer link "Privacy policy" pointing to the URL above.

### Engineering left
- No real-provider call could be made from this container (no API keys). The request shapes are unit-tested and the full flow is e2e-tested against stubs, but the first live check is owner step 2.
- Default model IDs should be reviewed every few months. The model override field covers users in the meantime.
- Translations (es, fr, de, he) were written without a native-speaker review. A quick read by a native speaker before promoting the localised listings is advisable.
- Cross-origin iframes are only reachable when the extension has access to them; under `activeTab` the shortcut and menu work in same-origin frames, and otherwise fall back to the clipboard.

## Polish round 2 (version 1.3.0)

Score unchanged at **8/10**: these are quality improvements; the two remaining points are still owner actions (real-key smoke test, store upload/review). The 1.2.0 work was merged to `main` by the owner (PR #1); this round continues on `production-ready`.

| Item | What changed | Verified by |
|---|---|---|
| Keyboard shortcut | `commands.transform-selection`, suggested `Alt+Shift+T` (user-changeable at `chrome://extensions/shortcuts`). Uses the language last picked from the menu (stored as `lastLanguage` in sync storage, written only on change); English/rephrase until one is picked or if it was removed from the list. Reads all frames and uses the focused one, then reuses the same transform → in-place → clipboard path. The toolbar popup shows the shortcut, the language it will use and a "Change shortcut" link. | e2e: last language reused and replaced in place; default/removed language → rephrase; selection in an iframe wins over a highlighted top-document selection and is replaced in the iframe; popup page. Handler is invoked directly (`handleCommand`). |
| Copy original | A real `<button>` in the result popup copies the original selection (with its HTML for page selections) through the offscreen clipboard. Auto-hide (5 s with the button) pauses on hover and keyboard focus; Escape closes; popups use `role=status` / `role=alert`. | e2e: focus the button, press Enter → clipboard holds the original; popup stays while focused; Escape closes it. |
| Localisation | `_locales` en (default), es, fr, de, he: description, shortcut name, toolbar popup, settings page, in-page messages, notifications and all error messages. The store name is not localised and stays "AI Translate & Rephrase - Phravexa". Pages set `lang`/`dir` (RTL for Hebrew, popup mirrored). `lib/core.js` uses `chrome.i18n` when present and an English fallback otherwise. | Unit: same keys/placeholders in all locales, description ≤ 132 per locale, every English fallback in code/HTML equals `_locales/en`, errors from `chrome.i18n` equal the fallbacks. e2e runs with `--lang=en-US`. Manual run with `--lang=he` and `--lang=de` showed translated, RTL settings and popup. |
| In-place edge cases | Password fields: never read, sent or replaced ("Password Field" warning; also re-checked before writing). Only `text/search/url/tel` inputs and textareas are replaced (email/number have no selection API → clipboard only). Read-only/disabled fields are not targeted. Very large selections skip the HTML copy and keep no target. `contenteditable="plaintext-only"` gets plain text. Focus inside open shadow roots is followed. Context-menu `frameId` is used for read and write. | e2e: password (menu and shortcut, no request made), email and read-only (copied, unchanged), oversized textarea and select-all (rejected, no HTML built, no request), context menu in an iframe replaces in that frame. |
| Build | Ships `_locales/*` and `lib/i18n.js`; `verify-package.js` resolves `__MSG_` names, checks each locale and the fixed store name. Version 1.3.0. No new permissions. | `./extension/build.sh` → 20 files verified. |

Tests: `npm test` → 28 unit + 22 e2e passing locally. CI: see below.

## 4. Chrome Web Store submission checklist

- [x] Manifest V3, name ≤ 75 chars (fixed: "AI Translate & Rephrase - Phravexa"), description ≤ 132 chars in all 5 locales, version 1.3.0 (higher than the live 1.1.0 and the prepared 1.2.0)
- [x] No new permissions or hosts compared with the live version (no re-approval prompt for existing users)
- [x] No remote code; all JS packaged; no `eval`
- [x] Store ZIP built and verified (`dist/phravexa-1.3.0.zip`, 20 files incl. `_locales`)
- [x] Icons 16/48/128 present
- [x] Promo tiles 440x280, 920x680, 1400x560 rendered with the new name
- [x] Description matches actual features (`store-description.txt`)
- [x] Privacy policy accurate and in the repo (`PRIVACY.md`)
- [x] Single purpose, permission justifications and data disclosures written (`SUBMISSION_CHECKLIST.md`)
- [x] Automated tests and CI green
- [ ] Owner: smoke test with real keys (step 2)
- [ ] Owner: privacy policy URL live after merge (step 1)
- [ ] Owner: screenshots checked for the old name (step 4)
- [ ] Owner: upload, update listing and privacy tabs, submit (steps 3 to 6)

## 5. Design: paid "no API key needed" plan (Phravexa Plus)

Design only. None of this is implemented.

### 5.1 Goal and offer
- Users who don't want to manage an API key subscribe to **Phravexa Plus** and use Phravexa right away.
- **Price: €4/month** (VAT included), or **€36/year** (25% off). Optional 7-day free trial. €4 sits in the requested €3–5 range and leaves margin after payment fees (about 5% + €0.50 per transaction for a merchant of record) and model costs.
- **Fair-use quota:** 300,000 characters of input per month (roughly 150 average emails), plus 30,000 characters per request and 20 requests per minute. When the quota is reached, the extension shows when it resets and suggests the bring-your-own-key mode, which stays free and unchanged.
- **Unit cost:** 300k characters is about 100k input tokens plus about 100k output tokens. With a low-cost fast model at roughly $0.10–$1 per million input tokens and $0.50–$5 per million output tokens, a heavy user costs between $0.06 and $0.60 a month. The margin stays positive even at the quota cap.

### 5.2 Architecture

```
Extension (service worker)
   │  POST /v1/transform  {language, instructions, text|html}
   │  Authorization: Bearer <session token>
   ▼
Phravexa proxy  (Cloudflare Workers, EU jurisdiction; KV + Durable Object for counters)
   ├─ verifies session token (HMAC-signed, 24 h)
   ├─ checks quota / rate limit (Durable Object per license)
   ├─ builds the prompt server-side (same buildPrompt as extension/lib/core.js, shared as an npm workspace package)
   ├─ calls the upstream AI provider with the operator's key (secret in Worker env)
   └─ returns {content, truncated, quota: {used, limit, resetsAt}}

Licensing provider (Lemon Squeezy)
   ├─ hosted checkout → emails a license key
   ├─ License API: /v1/licenses/activate | validate | deactivate
   └─ webhooks → proxy /webhooks/lemonsqueezy (subscription_updated / cancelled / expired / payment_failed)
```

- The proxy accepts **only** `{language, instructions, text|html}` and builds the prompt itself. It is not a general-purpose model proxy, so a leaked token cannot be used for arbitrary prompts. Instructions are capped at 500 characters.
- **No content logging.** The proxy logs only the license id hash, character counts, status code and latency. Requests are processed in memory. Use an upstream provider account with zero or minimal data retention, and a DPA signed where available.
- Hosting: Cloudflare Workers (free tier covers early traffic, Workers Paid at $5/month after that). Alternatives: Deno Deploy or a small Fly.io app in an EU region.

### 5.3 Licensing choice: Lemon Squeezy (recommended) vs ExtensionPay

| | Lemon Squeezy | ExtensionPay |
|---|---|---|
| Merchant of record (collects and remits EU VAT/OSS for a Spain-based seller) | **Yes** | No: payments go through the seller's own Stripe account, so VAT registration and filing stay with TR1.eu (Stripe Tax can help) |
| Server-side verification for the proxy | License API (activate/validate) plus webhooks | Designed around client-side `extpay.getUser()`. Proxy verification would need extra work |
| Extension integration | Paste license key in settings | `ExtPay` library, login by email on extensionpay.com |
| Fees | About 5% + $0.50 | Stripe fees + ExtensionPay's 5% |

**Recommendation: Lemon Squeezy.** VAT handling and a server-verifiable license are the deciding factors for a hosted proxy. Before building, check that Lemon Squeezy's current terms and its license-key features still cover subscriptions. If not, use Paddle, also a merchant of record, with the same design.

**License flow**
1. The settings page shows **"Get Phravexa Plus"**, which opens the Lemon Squeezy checkout (a hosted page, so no payment data touches the extension).
2. The buyer receives a license key by email and pastes it into settings.
3. The extension calls `POST /v1/license/activate {licenseKey, instanceName: "Chrome on <OS>"}`. The proxy calls Lemon Squeezy `activate`, stores `{licenseIdHash, instanceId, status, plan}` in KV, and returns a session token signed with HMAC (`sub` = license hash, `exp` = 24 h).
4. The extension stores the license key and token in `chrome.storage.local`. On a 401 `token_expired` it calls `/v1/license/refresh`, and the proxy re-validates with Lemon Squeezy (result cached for 6 h).
5. Webhooks update the KV status right away on cancellation, expiry or failed payment. The next request then returns 402 `subscription_inactive`.
6. Activation limit: 3 devices per license. **Deactivate this device** in settings calls `/v1/license/deactivate`.

### 5.4 Changes needed in the extension
- **Manifest:** add `"optional_host_permissions": ["https://api.phravexa.<domain>/*"]` and request it with `chrome.permissions.request` on the settings page when the user activates Plus. Existing users are **not** prompted and the extension is not disabled on update. Do **not** add it to `host_permissions`.
- **`lib/core.js`:** add a `phravexa` provider. `buildRequest` sends `{language, instructions, text, html}` (no client-side prompt) with `Authorization: Bearer <token>`. `parseResponse` reads `{content, truncated, quota}`. `classifyHttpError` gains `402 subscription_inactive` ("Your Phravexa Plus subscription is not active – manage it here"), `429 quota_exceeded` (shows `resetsAt`) and `401 token_expired` (handled silently by a refresh).
- **`background.js`:** a `getPlusToken()` helper with refresh-on-401 and a single retry. `getSettings()` returns `provider: 'phravexa'` with no API key required. The "Setup Required" check accepts an active license instead of a key.
- **Settings page:** a first provider option **"Phravexa Plus (no API key needed)"** with license key field, Activate/Deactivate buttons, status (plan, renewal date, characters used this month) and links to buy and to manage the subscription (Lemon Squeezy customer portal). The bring-your-own-key options stay as they are.
- **Popup:** shows the remaining quota for Plus users.
- **Tests:** unit tests for the new provider's request and response handling and error mapping; an e2e test with a stubbed proxy (activate, then translate, then quota exceeded); proxy unit tests with Miniflare/Vitest (token verification, quota counter, webhook signature check).
- **Docs and store:** update `PRIVACY.md`. For Plus, text passes through the TR1.eu proxy, so add a processing section, the upstream sub-processor, EU hosting, no content logs and retention of usage counters for 13 months. Add Terms of Service and a refund policy (Lemon Squeezy requires both). Update the store description ("Free with your own key, or Phravexa Plus €4/month") and the data disclosures (Plus adds "Payment" only for the license key, as payments happen on Lemon Squeezy's page).

### 5.5 Rollout and effort
1. Proxy plus Lemon Squeezy test mode: about 3–4 days. 2. Extension changes and tests: about 2–3 days. 3. Legal texts, listing update and store review: about 1 week of calendar time.
Owner prerequisites: a Lemon Squeezy store (KYC, payout account, product "Phravexa Plus" with monthly and yearly variants and license keys enabled), a Cloudflare account and domain, an upstream AI provider billing account with a spending limit, and the Terms of Service and refund policy texts.
