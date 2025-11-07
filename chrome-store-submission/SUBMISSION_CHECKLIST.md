# Chrome Web Store Submission Checklist

## Pre-Submission Requirements

### 1. Developer Account Setup
- [ ] Create Google account (if you don't have one)
- [ ] Go to [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
- [ ] Pay $5 one-time registration fee
- [ ] Verify your email address

---

### 2. Privacy Policy (REQUIRED)
- [x] Privacy policy created (see `PRIVACY_POLICY.md`)
- [ ] **ACTION REQUIRED**: Add your contact email to privacy policy
- [ ] **ACTION REQUIRED**: Host privacy policy online (GitHub Pages, your website, or Google Docs with public access)
- [ ] Copy the public URL - you'll need this during submission

**Quick Options for Hosting:**
- **GitHub**: Create a repo, enable GitHub Pages, commit PRIVACY_POLICY.md
- **Google Docs**: Upload, set sharing to "Anyone with the link can view"
- **Your website**: Host at yoursite.com/smartlate-privacy

---

### 3. Extension Package
- [x] Version updated to 1.0.0 in manifest.json
- [x] Production ZIP created: `chrome-store-submission/smartlate-1.0.0.zip`
- [ ] Test the ZIP by loading it in Chrome:
  - Go to `chrome://extensions/`
  - Enable Developer Mode
  - Click "Load unpacked"
  - Extract the ZIP and load the folder
  - Test all features work

---

### 4. Store Listing Content
- [x] Store descriptions written (see `STORE_LISTING.md`)
- [ ] Review and customize if needed
- [ ] Verify short description is under 132 characters

---

### 5. Visual Assets

**REQUIRED:**
- [ ] Create at least 1 screenshot (1280x800 or 640x400)
- [ ] Create small promotional tile (440x280 pixels)

**RECOMMENDED:**
- [ ] Create 3-5 screenshots showing different features
- [ ] Create large promotional tile (920x680 pixels)

See `PROMOTIONAL_IMAGES_GUIDE.md` for detailed instructions.

---

### 6. Permissions Justification

You'll need to explain why your extension needs each permission. Here are suggested justifications:

**contextMenus:**
> Required to add translation and rephrasing options to the right-click context menu when users select text.

**storage:**
> Used to securely store user preferences (API keys, language settings, and tone preferences) locally on the user's device.

**notifications:**
> Used to confirm when translated text has been successfully copied to the clipboard.

**activeTab:**
> Required to access the text that users select on the current webpage for translation.

**offscreen:**
> Needed to use Chrome's clipboard API for copying translated text to the clipboard.

**clipboardWrite:**
> Allows the extension to copy translated and rephrased text to the user's clipboard for easy pasting.

**Host Permissions (api.openai.com, api.anthropic.com, api.deepseek.com):**
> Required to communicate with AI service providers (OpenAI, Anthropic Claude, or DeepSeek) to perform translation and rephrasing. Users choose their preferred provider and provide their own API key.

---

### 7. Single Purpose Justification

Chrome requires extensions to have a clear single purpose. Here's your justification:

> **Single Purpose:** Smartlate provides AI-powered translation and text rephrasing functionality. Users can select text on any webpage and translate it to their configured target languages while applying a preferred writing tone (professional, casual, concise, etc.). All features serve this single purpose of helping users translate and refine text using AI.

---

## Submission Steps

### Step 1: Upload Extension
1. Go to [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
2. Click "New Item"
3. Upload `chrome-store-submission/smartlate-1.0.0.zip`
4. Wait for the upload to complete

### Step 2: Store Listing Tab
Fill in the following information:

**Product Details:**
- [ ] Add store description (copy from `STORE_LISTING.md`)
- [ ] Category: Productivity
- [ ] Language: English

**Graphic Assets:**
- [ ] Upload screenshots (at least 1)
- [ ] Upload small promotional tile (440x280)
- [ ] Upload large promotional tile (920x680) - optional
- [ ] Upload marquee promotional tile (1400x560) - optional

**Additional Fields:**
- [ ] Official URL (optional): Your website or GitHub repo
- [ ] Homepage URL (optional): https://github.com/yourusername/smartlate

### Step 3: Privacy Practices Tab

**Data Usage:**
- [ ] Does your extension handle personal information? **YES**
  - API keys are stored locally
  - Selected text is processed

**Privacy Policy:**
- [ ] Privacy policy URL: [Enter your hosted privacy policy URL]

**Data Handling Disclosures:**
- [ ] What data is collected:
  - "Authentication information" (API keys)
  - "User preferences" (language settings, tone)
  - "Text content" (only selected text)

- [ ] How is data used:
  - "App functionality"

- [ ] Is data shared with third parties? **YES**
  - Shared with: User's chosen AI provider (OpenAI, Anthropic, or DeepSeek)
  - Purpose: To perform translation and rephrasing

- [ ] Where is data stored:
  - "Locally on user's device"

### Step 4: Distribution Tab

**Visibility:**
- [ ] Public (recommended)
- [ ] Unlisted (only people with link can see)

**Regions:**
- [ ] Select regions (recommend: All regions)

**Pricing:**
- [ ] Free

### Step 5: Submit for Review

- [ ] Review all information
- [ ] Click "Submit for Review"
- [ ] Wait for Chrome Web Store review (typically 1-3 business days, can be up to 7 days)

---

## After Submission

### During Review:
- Check your email for any requests from Chrome Web Store review team
- They may ask for clarifications about permissions or functionality
- Be ready to respond within 7 days

### If Approved:
- Your extension will be published!
- Share the link: `https://chrome.google.com/webstore/detail/[your-extension-id]`

### If Rejected:
- Read the rejection reason carefully
- Make necessary changes
- Re-submit (no additional fee)

---

## Common Rejection Reasons & How to Avoid

1. **Missing or invalid privacy policy**
   - ✅ Make sure privacy policy URL is publicly accessible
   - ✅ Policy must cover all data handling practices

2. **Unclear permission justifications**
   - ✅ Use the justifications provided in this checklist
   - ✅ Be specific about WHY each permission is needed

3. **Single purpose violation**
   - ✅ Your extension is focused on translation/rephrasing - this is clear
   - ✅ All features serve this one purpose

4. **Misleading description or screenshots**
   - ✅ Make sure screenshots show actual functionality
   - ✅ Don't promise features you don't have

5. **Trademark issues**
   - ✅ Don't use "Chrome", "Google", or other company names inappropriately
   - ✅ Mentioning "OpenAI", "Anthropic", "DeepSeek" as integration partners is OK

---

## Quick Reference: What You Need RIGHT NOW

### Absolutely Required to Submit:
1. ✅ Developer account ($5)
2. ✅ Extension ZIP file (created)
3. ✅ Privacy policy hosted online (ACTION: host the file)
4. ⚠️  At least 1 screenshot (ACTION: create)
5. ⚠️  Small promo tile 440x280 (ACTION: create)
6. ✅ Store descriptions (created)

### You Can Add Later (After Initial Submission):
- Additional screenshots
- Large promotional tiles
- Marketing materials
- Updated descriptions

---

## Support Resources

- **Developer Documentation**: https://developer.chrome.com/docs/webstore/
- **Program Policies**: https://developer.chrome.com/docs/webstore/program-policies/
- **Support**: https://support.google.com/chrome_webstore/contact/dev_account_transfer

---

## Timeline Estimate

- **Account setup**: 5-10 minutes
- **Create screenshots**: 30-60 minutes
- **Create promo images**: 30-60 minutes (or hire someone)
- **Fill out submission form**: 20-30 minutes
- **Review time**: 1-7 business days

**Total before review**: ~2-3 hours of work

---

## Next Steps

1. **Host your privacy policy online** and get the URL
2. **Create screenshots** (see PROMOTIONAL_IMAGES_GUIDE.md)
3. **Create small promo tile** (440x280)
4. **Create developer account** at Chrome Web Store
5. **Submit!**

Good luck with your submission! 🚀
