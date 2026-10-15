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

## 3b. App content progress (15 Oct night)

Done and saved: privacy policy URL, sign-in details, ads (none), target audience (18+), content rating (IARC, all No → Everyone/L), data safety (**No data collected or shared** — Google defines "collected" as sent off-device; Kanakku is on-device only, matching docs/PRIVACY.md), government apps (No), financial features (none), health (none), advertising ID (No).

Remaining, in order:
1. **Foreground service permissions** (App content › Foreground service permissions). Manifest declares FOREGROUND_SERVICE_MICROPHONE and FOREGROUND_SERVICE_SPECIAL_USE (AvatarService). Tick **Other** under both. Both require a video link; Save stays disabled without it. Record with `node scripts/record-companion-verification.mjs` (emulator `Kanakku_API_36` booted, E2E APK installed, JDK 17 + Maestro on PATH; output `artifacts/play-verification/kanakku-companion-verification.mp4`), review it, upload to YouTube Unlisted on the same channel as the SMS video, paste the link into both Video link fields, then these descriptions:
   - Microphone: "Kanakku's optional floating companion (an overlay the user enables in Settings) lets the user tap its microphone to dictate a short note for a payment while another app is in front. AvatarService must be a foreground service with the microphone type because recording starts only from that explicit tap while the user is outside the app; it records at most 15 seconds, holds audio only in memory, stops as soon as the user finishes or cancels, and is transcribed on-device. Pausing or restarting would cut the user's sentence, so the task cannot be deferred."
   - Special use: "The special-use foreground service hosts Kanakku's optional floating companion: a small draggable avatar overlay (SYSTEM_ALERT_WINDOW, enabled by the user in Settings) that shows a private prompt when a new bank transaction SMS arrives and lets the user categorise it or dictate a note without opening the app. It must run as a foreground service so the overlay window stays alive and visible while the user is in other apps; it has no dedicated type because it is an interactive overlay, not media, location, or data sync. The user can dismiss it or turn it off at any time, which stops the service."
   - Recording script status: first run failed because the live alert ("ANANDS CAFE") was classified confidently (review=false) so no prompt appeared; payee changed to "SR ENTERPRISES". If the companion still never appears, check `adb shell cat /sdcard/Android/data/app.tinkerbox.kanakku.e2e/files/diagnostics/kanakku-diagnostics.jsonl` for the `classified` line (`review` must be true) and the `prompt decision` line (overlayAllowed/overlayOn must be true, appOpen false).
2. **SMS and Call log permissions declaration** (App content › Start) — already available; use section 2 values (video https://www.youtube.com/watch?v=cnpwUJkU08Q).
3. Store listing (section 3), app category Finance + contact details (Store presence › Store settings).
4. Publishing overview › **Send for review**.

## 4. After submitting

**Done 15 Oct 18:07 IST:** release 0.2.0-beta.1 published to internal testing; tester list "Kanakku beta testers" (ananthu.td.dev@gmail.com) saved; track Active.

Tester join link (open on the phone while signed in as the tester, accept, then install from Play):
https://play.google.com/apps/internaltest/4701724244675720178


- Internal testing: add your Google account as a tester, accept the opt-in link, install from Play to replace the dev-signed build.
- The SMS declaration review is the long pole (days). The listing waits on it.
- Next build (planned): on-demand ML model delivery via Play Asset Delivery, ~15 MB first install.
