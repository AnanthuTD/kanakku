# Play Console submission — Kanakku 0.2.0-beta.1

Console: https://play.google.com/console/u/0/developers/8723087516146084287/app/4974795166769397388/app-dashboard
Package: `app.tinkerbox.kanakku` · versionCode 2 · versionName 0.2.0-beta.1

**16 Oct closed-test submission:** Alpha is configured for India, existing “Kanakku beta testers” email list (3 users), feedback ananthu.td.dev@gmail.com. Reused bundle versionCode 2 from library and saved the factual beta release notes. Confirmed submission of 14 changes; Console displays “Changes in review” and “14 changes sent for review.” Automated quick checks are running; Console says changes proceed to review after successful checks. This is submission, not approval or production publication.

**Policy correction (15 Oct):** historical Console progress below is preserved, but the saved **No data collected/shared** and **no financial features** answers need review. Local SMS processing does not exempt optional Brave queries, Expo installation/update metadata or Google's ML Kit technical metrics. The corrected policy was published to GitHub `main` as commit `4ff113e` and verified at the public raw URL. See [the source/vendor review](../../docs/play-policy-review.md).

**Live continuation status (15 Oct):** user saved both foreground-service declarations; Console Publishing overview lists the declaration and App content shows the declarations as actioned. SMS/Call log declaration is also saved/actioned. The Data safety export now confirms Approximate location is selected as collected + shared, optional, non-ephemeral, and used for App functionality; the Preview lists it in both sections. Purchase history was added and saved on 16 Oct: collected + shared, optional, non-ephemeral, App functionality. Console confirmed the full declaration was saved to Publishing overview; it has not been sent for review. However, Publishing overview still lists “Complete Data safety questionnaire” under changes not yet submitted for review, and the Preview's Save button is disabled, so confirm final draft/submission state in the dashboard. Before submitting, verify that the declaration of User payment info as collected + shared and In-app search history as shared accurately reflects the Brave request payload and provider handling. The corrected policy is published at the linked `main` URL.

## 1. Upload (Release › Testing › Internal testing › Create new release)

- Bundle: `artifacts/play/kanakku-0.2.0-beta.1.aab` (143.6 MB; users see ~112 MB)
- First upload prompts to **enrol in Play App Signing** → accept. Our release key becomes the upload key.
- Release name: `0.2.0-beta.1`
- Release notes (en-IN):
  > First beta. Turns supported bank SMS into an encrypted journal on your phone, with editable notes, bill details and recurring-charge insights. Optional merchant searches and app updates use external services; see the privacy policy for SDK metrics and data handling.

## 2. App content (sidebar › Policy › App content) — all required before review

- **Privacy policy:** https://github.com/AnanthuTD/kanakku/blob/main/docs/PRIVACY.md
- **Ads:** No, the app does not contain ads.
- **App access:** All functionality is available without special access (no login).
- **Content rating:** complete the questionnaire; Finance, no user-generated content, no violence → Everyone.
- **Target audience:** 18 and over. Not designed for children.
- **News app:** No. **COVID-19 app:** No. **Government app:** No.
- **Financial features — DRAFT CORRECTED, FINAL REVIEW PENDING:** the historical saved answer was "none". Root reports that the live form exposes a separate Other category/description and that a factual SMS-expense-tracking Other explanation is now saved as a draft. This is not a final approval or certified classification. Do not select banking, payments, loans, crypto or financial advice that Kanakku does not provide. See the [official taxonomy](https://support.google.com/googleplay/android-developer/answer/13849271?hl=en-GB) and policy review.
- **Data safety:**
  - **NEEDS REVIEW:** neither the earlier local-SMS-as-collected draft nor the later blanket "No data collected" answer correctly describes all current behavior. Local-only SMS/financial/audio/photo processing is not off-device collection merely because permissions are used.
  - Current collection review must include Expo/ML Kit installation identifiers and technical metrics, optional Brave search queries, the consented complete-VPA path and provider authentication metadata. See [the per-type recommendations and unresolved decisions](../../docs/play-policy-review.md).
  - Brave lookup defaults off; an additional optional switch performs automatic recognized-brand queries. VPA requests require separate per-address consent. Do not claim every request follows a search tap or only a public business name can leave the device.
  - Ordinary Brave query logs may be retained up to 90 days under its current notice; a transient local result view does not establish ephemeral provider processing.
  - Review sharing exceptions, SDK initialization/optional status, HTTPS and provider deletion separately. Local Reset/uninstall does not delete provider-side logs. Do not save unsupported blanket answers.
  - Internal-only testing has a Data safety form/display exemption in Google's guidance; that does not validate incorrect declarations for later closed/open/production distribution. [Official Data safety guidance](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en).
- **Permissions declaration (SMS and Call Log):**
  - Permissions: READ_SMS, RECEIVE_SMS.
  - Core use case: **SMS-based money management / budget tracking** (an allowed use case).
  - Description: "Kanakku reads bank transaction SMS on the device to build a private, encrypted spend journal. Without SMS access the app has no data and its core feature does not exist. Raw SMS is parsed and discarded; only extracted payment fields are stored, encrypted, on the phone."
  - Video (uploaded 15 Oct, Unlisted, YouTube Short): https://youtube.com/shorts/cnpwUJkU08Q — paste the full watch form if the form rejects the shorts URL: https://www.youtube.com/watch?v=cnpwUJkU08Q
  - Reviewer instructions saved in the Console form (454/500 characters): "Kanakku reads supported bank SMS locally for its encrypted spending journal. In Settings, tap Connect bank SMS, choose a history period, grant SMS permission and unlock with your device lock. Notifications are optional. Overview shows totals; Activity shows payments. Optional merchant lookup sends merchant names to Brave; a VPA is sent only with separate consent. SMS text, amounts, bank/account details and notes are not sent. No bank login is needed."
  - User confirmed saving this declaration. Verify its Play review status in Publishing overview; a saved form is not evidence of approval.

## 3. Store listing (sidebar › Grow › Store presence › Main store listing)

- App name: `Kanakku`
- Short description (≤80): `Your bank SMS, turned into a private spend journal.`
- Full-description draft: "Kanakku organizes supported bank SMS alerts into a local encrypted spending journal. Review unclear payments by typing, English voice or an editable bill photo, explore recorded spending and inspect recurring-charge evidence. No Kanakku account or ads. Optional Brave searches and Expo updates use external services; Google's on-device OCR SDK also collects technical metrics. See the privacy policy for what stays on the phone, optional query consent and provider data handling." Confirm the installed beta's features before publishing this description.
- App icon: `artifacts/play/listing/icon-512.png`
- Feature graphic: `artifacts/play/listing/feature-graphic-1024x500.png`
- Phone screenshots: `docs/screenshots/overview.png`, `activity.png`, `insights.png`, `settings.png`
- Category: Finance. Tags: Personal finance.
- Contact email: ananthu.td.dev@gmail.com. Website: https://github.com/AnanthuTD/kanakku

## 3b. App content progress (15 Oct night)

Historical handoff reports these saved: privacy policy URL, sign-in details, ads (none), target audience (18+), content rating (IARC, all No → Everyone/L), data safety (**No data collected or shared**), government apps (No), financial features (none), health (none), advertising ID (No).

**Current review status:** Data safety and financial-feature answers above are **NEEDS REVIEW**, not approved recommendations. The prior "on-device only" rationale omitted Brave VPA/automatic queries, Expo installation IDs and ML Kit metrics. `docs/PRIVACY.md` is corrected locally; ensure the published policy URL serves that corrected version before claiming it matches the app. External declarations have not been amended by this review.

Historical completion order (some of this is now saved):
1. **Foreground service permissions — SAVED by user.** Manifest declares FOREGROUND_SERVICE_MICROPHONE and FOREGROUND_SERVICE_SPECIAL_USE (AvatarService). The 22-second demo is captured and visually reviewed at `artifacts/play-verification/kanakku-companion-verification.mp4`; it uses the isolated E2E build and synthetic Settings preview, shows the overlay over the launcher, verifies microphone type `0x80` together with special-use `0x40000000`, and shows on-device English transcription. No payment was saved. Evidence is in `artifacts/play-verification/companion-verification-phone.json`. The demo is uploaded to the same channel as the SMS video as Unlisted: `https://youtube.com/shorts/cGICfJt_myE`. The user saved the declaration.
   - Microphone: "Kanakku's optional floating companion (an overlay the user enables in Settings) lets the user tap its microphone to dictate a short note for a payment while another app is in front. AvatarService must be a foreground service with the microphone type because recording starts only from that explicit tap while the user is outside the app; it records at most 15 seconds, holds audio only in memory, stops as soon as the user finishes or cancels, and is transcribed on-device. Pausing or restarting would cut the user's sentence, so the task cannot be deferred."
   - Special use: "The special-use foreground service hosts Kanakku's optional floating companion: a small draggable avatar overlay (SYSTEM_ALERT_WINDOW, enabled by the user in Settings) that shows a private prompt when a new bank transaction SMS arrives and lets the user categorise it or dictate a note without opening the app. It must run as a foreground service so the overlay window stays alive and visible while the user is in other apps; it has no dedicated type because it is an interactive overlay, not media, location, or data sync. The user can dismiss it or turn it off at any time, which stops the service."
   - Recording status: `scripts/companion-overlay.mjs` locates the overlay from its exact owning Android window. The emulator's QEMU audio injection crashed, so the verified video was captured on the connected phone using the harmless in-app sample preview (no SMS fixtures or personal ledger). The phone recognized the user's seven-word English response locally; the preview does not save it.
2. **SMS and Call log permissions declaration — SAVED/ACTIONED.** The user's approved video and corrected 454-character reviewer instructions are entered in the Console.
3. **Store listing, category and contact — SAVED.** User confirmed the listing; Finance category, Personal finance tag, contact email and website were verified after reload.
4. **Data safety — answers entered; submission status needs confirmation.** Approximate location handling is complete in the exported response and preview. Purchase history was added and saved on 16 Oct: collected + shared, optional, non-ephemeral, App functionality. Console confirmed the full declaration was saved to Publishing overview; it has not been sent for review. Check User payment info collected/shared and In-app search history shared against implementation/provider requests, then resolve the Console's “Complete Data safety questionnaire” pending change. Corrected policy is published.
5. Publishing overview › **Send for review** when all required changes and the public policy are ready. Public production still requires the closed-testing eligibility process described below.

## 4. After submitting

**Done 15 Oct 18:07 IST:** release 0.2.0-beta.1 published to internal testing; tester list "Kanakku beta testers" (ananthu.td.dev@gmail.com) saved; track Active.

Tester join link (open on the phone while signed in as the tester, accept, then install from Play):
https://play.google.com/apps/internaltest/4701724244675720178


- Internal testing: add your Google account as a tester, accept the opt-in link, install from Play to replace the dev-signed build.
- The SMS declaration review is the long pole (days). The listing waits on it.
- Next build (planned): on-demand ML model delivery via Play Asset Delivery, ~15 MB first install.
