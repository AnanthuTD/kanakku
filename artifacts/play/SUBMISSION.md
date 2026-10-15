# Play Console submission — Kanakku 0.2.0-beta.1

Console: https://play.google.com/console/u/0/developers/8723087516146084287/app/4974795166769397388/app-dashboard
Package: `app.tinkerbox.kanakku` · versionCode 2 · versionName 0.2.0-beta.1

## 1. Upload (Release › Testing › Internal testing › Create new release)

- Bundle: `artifacts/play/kanakku-0.2.0-beta.1.aab` (143.6 MB; users see ~112 MB)
- First upload prompts to **enrol in Play App Signing** → accept. Our release key becomes the upload key.
- Release name: `0.2.0-beta.1`
- Release notes (en-IN):
  > First beta. Imports bank transaction SMS into a private, encrypted spend journal on your phone. Nothing leaves the device.

## 2. App content (sidebar › Policy › App content) — all required before review

- **Privacy policy:** https://github.com/AnanthuTD/kanakku/blob/main/docs/PRIVACY.md
- **Ads:** No, the app does not contain ads.
- **App access:** All functionality is available without special access (no login).
- **Content rating:** complete the questionnaire; Finance, no user-generated content, no violence → Everyone.
- **Target audience:** 18 and over. Not designed for children.
- **News app:** No. **COVID-19 app:** No. **Government app:** No.
- **Financial features:** declare "Personal finance / budgeting" if asked; the app does not handle payments, loans or crypto.
- **Data safety:**
  - Collects: Financial info → *Purchase history / Other financial info* (transactions parsed from SMS).
  - Collected: Yes. Shared with third parties: No. Processed ephemerally: No (stored on device).
  - Required for the app to function: Yes.
  - Purpose: App functionality.
  - Encrypted in transit: Not applicable — data is never transmitted.
  - Users can request deletion: Yes (reset the journal in Settings, or uninstall).
  - Also declare *Messages → SMS or MMS*: collected, not shared, app functionality, required.
  - Optional network use to disclose if asked: a public business name sent to the Brave Search API only when the user explicitly taps search (off by default).
- **Permissions declaration (SMS and Call Log):**
  - Permissions: READ_SMS, RECEIVE_SMS.
  - Core use case: **SMS-based money management / budget tracking** (an allowed use case).
  - Description: "Kanakku reads bank transaction SMS on the device to build a private, encrypted spend journal. Without SMS access the app has no data and its core feature does not exist. Raw SMS is parsed and discarded; only extracted payment fields are stored, encrypted, on the phone."
  - Video (uploaded 15 Oct, Unlisted, YouTube Short): https://youtube.com/shorts/cnpwUJkU08Q — paste the full watch form if the form rejects the shorts URL: https://www.youtube.com/watch?v=cnpwUJkU08Q
  - Instructions for the reviewer: "Open Settings → Connect bank SMS → choose a history window → grant SMS and notification permissions → authenticate with the device lock. The app imports bank alerts and shows the month's spending on the overview."

## 3. Store listing (sidebar › Grow › Store presence › Main store listing)

- App name: `Kanakku`
- Short description (≤80): `Your bank SMS, turned into a private spend journal.`
- Full description: see README "What it does" (paste the bullet list, then "No account, no server, no ads, no analytics. Everything stays encrypted on your phone.")
- App icon: `artifacts/play/listing/icon-512.png`
- Feature graphic: `artifacts/play/listing/feature-graphic-1024x500.png`
- Phone screenshots: `docs/screenshots/overview.png`, `activity.png`, `insights.png`, `settings.png`
- Category: Finance. Tags: Personal finance.
- Contact email: ananthu.td.dev@gmail.com. Website: https://github.com/AnanthuTD/kanakku

## 4. After submitting

**Done 15 Oct 18:07 IST:** release 0.2.0-beta.1 published to internal testing; tester list "Kanakku beta testers" (ananthu.td.dev@gmail.com) saved; track Active.

Tester join link (open on the phone while signed in as the tester, accept, then install from Play):
https://play.google.com/apps/internaltest/4701724244675720178


- Internal testing: add your Google account as a tester, accept the opt-in link, install from Play to replace the dev-signed build.
- The SMS declaration review is the long pole (days). The listing waits on it.
- Next build (planned): on-demand ML model delivery via Play Asset Delivery, ~15 MB first install.
