# Kanakku privacy policy

Last updated 20 October 2026. Applies to the Kanakku Android app (`app.tinkerbox.kanakku`), published by Tinkerbox (Ananthu T D).

## Your journal stays on your phone

Kanakku turns supported bank SMS alerts into a local spend journal. You do not create a Kanakku account. Your SMS, recorded speech and bill images are processed on the phone, and your saved journal is encrypted there. If you choose, you can manually upload a separate, end-to-end encrypted journal backup to your Google Drive and restore it later. Optional Gmail checks, merchant searches, app updates and model downloads use external services. The bill-recognition SDK also collects technical metrics, as explained below.

## What the app processes and keeps

- **Bank SMS alerts:** with permission, Kanakku reads messages to find supported payment alerts. Parsing happens on the phone. OTPs and unrelated messages are rejected; the full SMS text is not saved. Extracted payment fields, account hints, references and your corrections are retained in the local journal.
- **Voice notes:** recording begins after your microphone action. An optional downloaded model transcribes speech on the phone; audio is held briefly in native memory and is not saved by the personal app. A transcript becomes part of your journal only when you save it.
- **Bill photos:** your camera action creates a temporary photo in the app's cache. On-device text recognition produces editable bill details. Normal success, cancellation and error cleanup deletes that temporary photo. Raw OCR text and photos are not saved to the journal or sent for recognition. If you save, the normalized merchant, date, items, prices, tax and adjustment fields are retained with the transaction. A process interruption can leave a temporary cache file until cleanup or app-data deletion.
- **Your edits:** saved notes, categories, merchant names, receipt details, personal rules and recurring-payment decisions remain on the phone.

The journal uses SQLCipher. Android Keystore and your device authentication protect its keys. Alerts received while locked are sealed in an encrypted inbox until unlock. Hardware protection varies by device. Android backup of the app's data is disabled.

## Optional encrypted Google Drive backup

In Settings, you can manually back up or restore the saved journal. Kanakku asks for Google Drive access only when you start one of these actions, using the narrow `drive.file` permission to create and update its own visible backup file; it cannot browse your other Drive files. The app encrypts transactions, notes, structured bill details, merchant rules and recurring decisions on the phone using a password you choose before uploading. Google Drive receives the encrypted backup file and normal connection metadata, not the password or readable journal contents. Kanakku does not keep the backup password or operate a backup server.

Keep the password somewhere safe outside Kanakku. It cannot be recovered if forgotten. Restoring requires decrypting and previewing the backup, typing RESTORE, and authenticating with the device; it replaces the current saved journal rather than merging it. SMS/Gmail permissions and account connections, import checkpoints, unprocessed alerts, and temporary bill photos are not included. You can delete the backup file from Drive; removing local data does not remove the Drive copy. The Drive API is an external service; see [Google's privacy policy](https://policies.google.com/privacy).

Android screenshots and screen recordings are allowed while Kanakku is open, including when the journal is unlocked. Captured images may show balances, merchants, amounts and account hints; protect or delete any captures you make.

## Optional Gmail bank-email capture

Connecting Gmail is optional and separate from SMS permission. When you connect, Google grants read-only access to your mailbox, including email contents; that permission cannot be limited to bank messages. Kanakku uses it to find supported authenticated SBI debit-card and SBI Card purchase alerts within your selected history window. It fetches bounded message metadata and supported message bodies from Google, parses them on this phone, and does not fetch attachments. Unsupported messages are ignored. Gmail access is used only after your explicit in-app choice and Google authorization.

Kanakku does not save raw email bodies or OAuth access tokens. Google manages authorization/token caching; Kanakku keeps the chosen account identity encrypted with Android Keystore so it can request access for subsequent checks. Only structured transaction details and hashed import identities are retained locally. Email content is not sent to Kanakku servers, Brave, or AI providers, sold, or used for advertising or model training. Use of Google user data is limited to providing this user-facing journal feature, including the Google API Services User Data Policy's Limited Use requirements.

After consent, background checks contact Google when Android permits; they are not instant and can stop after revocation, force-stop or network loss. Google receives authentication, mailbox requests and normal connection metadata under its [privacy policy](https://policies.google.com/privacy). Disconnect in Settings stops local checks, removes the saved account connection and attempts to revoke Google access. If revocation fails, remove Kanakku from your Google Account's third-party connections. Imported payments remain until you delete/reset the journal. Reset detaches Gmail locally; it does not delete emails from your mailbox.

## Optional Brave merchant searches

Merchant lookup is off by default and uses your own Brave Search API key. The saved key is encrypted with Android Keystore; an enabled search sends it to Brave for authentication.

If you approve a public-business query, the business name is sent to Brave. A separate optional setting can automatically search recognized public-brand labels while Kanakku is open. Unknown business names still require review. These searches do not send the SMS text, transaction amount, bank/account information or your note.

**UPI-address lookup is a separate choice.** The review screen shows the complete UPI ID (VPA) to be searched and requires your consent for that address. A VPA can identify a person or payment account; approving this action sends that complete address to Brave. Editing the address or reopening the flow clears consent. VPAs are never searched automatically. Other payment identifiers are not submitted by the merchant-search feature.

Brave also receives the request's normal connection/authentication metadata, including the source IP address and API token. Kanakku displays results temporarily and does not keep a reusable search-result database. This local behavior does not determine Brave's retention: [Brave's API privacy notice](https://api-dashboard.search.brave.com/documentation/resources/privacy-notice) states that ordinary query logs may be retained for up to 90 days for billing/troubleshooting, subject to legal obligations. We do not assume your plan provides enterprise zero retention.

Network requests to Brave, Expo, Hugging Face and Google expose the connection's source IP address, which may reveal an approximate network location. Kanakku does not request device location or GPS, and its offline journal features make no network requests.

## App updates through Expo

Settings → Check for updates contacts Expo's update service; downloading a compatible update also requests its assets. Requests contain technical update information such as the project, platform/runtime, update/channel information and a randomly generated installation identifier, along with normal network metadata. Expo's update SDK can include update/startup error information when recovering from a failed launch. Saved journal entries, SMS, notes, bill photos and speech are not added to these requests by Kanakku.

See [Expo's privacy explanation](https://expo.dev/privacy-explained) and [privacy policy](https://expo.dev/privacy) for its handling of service data. Expo is an external update host; the optional encrypted Drive backup is a separate user-initiated feature.

## Optional model downloads

Settings → Optional models lets you download English voice and smart category suggestions separately. The app requests only the fixed model files from version-pinned Hugging Face URLs and its HTTPS delivery hosts. These hosts receive normal connection information, including the source IP address; Kanakku does not attach SMS, journal fields, notes, bill content, audio, your Brave key or an end-user account identifier to model downloads. See [Hugging Face's privacy policy](https://huggingface.co/privacy) for its handling of service logs.

The app checks the pinned file size and SHA-256 before use. Models are saved in private app storage excluded from Android backup, reused across compatible app updates, and removable in Settings. Removing a model does not delete your journal or saved notes. Downloads run only after your explicit action; Android may continue or resume requested work in the background. Cancellation discards the partial file, subject to normal in-flight cleanup. Interrupted downloads may retain a partial file for retry. Uninstalling or clearing app data removes model files too. Speech and categorization run on the device after download; inputs are not submitted to a remote inference service.

## On-device bill recognition and Google SDK metrics

The app uses Google's bundled ML Kit text-recognition SDK. Google states that recognition inputs and results stay on the device. The SDK separately collects technical data such as device/OS and app information, a per-installation identifier, feature events, errors, API configuration/input-output sizes and performance metrics for diagnostics and usage analytics. Google documents HTTPS transport for those metrics. These SDK metrics are separate from the recognized bill content and from Kanakku's local diagnostic switch.

Details: [ML Kit privacy terms](https://developers.google.com/ml-kit/terms) and [ML Kit Android data disclosure](https://developers.google.com/ml-kit/android-data-disclosure). Kanakku does not claim that bundled, offline image recognition disables the SDK's technical collection.

## Local diagnostics

Kanakku's beta diagnostics log records operational stages, counts, timings and scrubbed error information on the phone. It does not deliberately include SMS text, transcripts, account details, bill content or API keys. Settings lets you clear or turn off this local log. It is shared with the developer only if you choose to provide it, for example in a bug report. This setting does not control Google's SDK metrics or Expo/Brave service logs.

Kanakku contains no advertisements and does not sell your journal. It does not use the journal for advertising profiles.

## Permissions

- **SMS (read/receive):** import and capture supported bank alerts for the core journal.
- **Notifications:** import progress and private review prompts.
- **Microphone:** optional voice notes after your action.
- **Camera:** optional bill photos after your action.
- **Display over other apps:** the optional floating companion.

You can deny optional permissions and continue with typing and manual categorization. Revoking SMS access stops new SMS capture/import.

## Your control and deletion

Settings lets you reset the local journal, clear diagnostics, disable merchant lookup, remove its saved API key, remove optional models, and manage the encrypted Drive backup. Uninstalling or clearing app data deletes the app's local data; a Drive backup remains until you delete it from Drive. A reset or reinstall does not automatically restore a backup.

Removing local data does not delete logs already held by Brave, Expo, Hugging Face or Google. Their policies govern service retention and deletion rights; contact the relevant provider or us for help identifying the applicable request. No Kanakku account exists to delete.

## Children

Kanakku is intended for adults and is not directed at children under 18.

## Changes and contact

We update this policy when the app's handling changes. The published version is maintained at https://github.com/AnanthuTD/kanakku/blob/main/docs/PRIVACY.md. Questions: ananthu.td.dev@gmail.com.
