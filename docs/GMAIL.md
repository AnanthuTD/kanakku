# Optional Gmail bank alerts

Implemented source, pending live Google authorization and account acceptance (19 October 2026). This requires a new native APK; an OTA update cannot add the Google Identity dependency.

## Connection and coverage

Settings → Gmail transaction alerts → Connect Gmail explains Google's **mailbox-wide read-only** permission. The app cannot restrict Google's permission to bank messages. The user explicitly agrees, selects 1/3/6/12 months, unlocks the journal and chooses a Google account. SMS permission is independent.

Kanakku checks supported SBI debit-card table alerts and SBI Card purchase sentences. Sender domain, the first Google's Authentication-Results header (DMARC pass for the exact From domain), subject and successful transaction template must all pass. A Gmail search result, sender display name or logo alone is insufficient. Real sender/authentication-header acceptance still needs a live account test. Other issuers, statements, orders, pending/failed payments and attachments are not supported.

WorkManager schedules periodic checks at a 15-minute minimum interval, subject to Android/network/Google restrictions. Initial history uses bounded pages and saved checkpoints; subsequent checks overlap the last completed scan by 48 hours, within the selected floor. This is best-effort polling, not instant notification delivery. Settings shows queued/checking/reconnect/error status, counts and last completed scan, with manual refresh and disconnect.

## Privacy and reconciliation

Tokens remain transient in native code; Google manages its own authorization cache. The selected account identity is AES-GCM encrypted with Android Keystore, never passed to JS except a masked status label. Requests use fixed Google HTTPS endpoints, bounded responses and no redirect following. Metadata is validated before fetching bodies; bounded MIME decoding skips attachments. Raw emails and tokens are never saved/logged or sent to Brave/AI/a Kanakku backend. Only structured payment observations and hashed ingestion identities enter local encrypted storage.

Replay is idempotent. Unique exact references with matching issuer/card/value/currency/kind can link unchanged source observations. Same-day/amount similarity does not silently merge transactions. Possible matches wait for explicit same/separate review and are excluded from spend until resolved. User corrections and explicit separate decisions survive replay. Date-only emails retain day precision. Original USD amounts remain USD; a final user-confirmed INR settlement is needed for INR totals, without guessed exchange rates. Unresolved foreign/matching rows do not enter recurring suggestions.

Disconnect cancels work/in-flight requests, removes the local account connection and attempts Google revocation; it preserves imported payments. If revocation fails, Settings asks the user to remove access in Google Account connections. Journal reset detaches locally. Neither action deletes mailbox messages.

## Owner configuration

1. Create/select the dedicated Kanakku Google Cloud project. Current project: `double-backup-512116-g5` (created in the owner's personal profile). Gmail API enabled, OAuth branding created, owner and one additional user are on the test audience, local-certificate Android client created, Gmail read-only scope saved, and Google API Services User Data Policy accepted. Live consent and mailbox acceptance remain untested.
2. Enable Gmail API. Configure Google Auth Platform branding/support/privacy policy, External audience in Testing, and developer contact. Add only owner-selected test users. Configure `https://www.googleapis.com/auth/gmail.readonly` as the requested restricted scope.
3. Create an **Android** OAuth client for package `app.tinkerbox.kanakku` with the SHA-1 of the actual installed signing certificate. A Play-installed app uses Google's Play app-signing certificate; the upload/local key may differ. Register each required signing identity separately. An isolated `.e2e` package needs its own client if live authorization is intentionally tested there. Never use a web client secret inside the APK.
4. Android Google Identity matches package/certificate; the source does not embed a client secret or require a backend. Changing package/certificate requires corresponding Cloud registration. No Gmail Pub/Sub backend has been implemented.
5. Restricted-scope verification and Google's applicable user-data requirements must be addressed before broad distribution. Do not claim that local parsing exempts the app from Google review. Keep Google consent, privacy policy, Play Data safety and store disclosures aligned with the final implementation before releasing this feature publicly.

## Acceptance gates

- Automated: synthetic SBI parser/authentication checks; bounded Android MIME/HTML/Keystore tests; source reconciliation and FX unit tests; browser review/persistence journeys. These do not prove live OAuth or Gmail delivery.
- Live: correct Android package/certificate account chooser and consent; cancel/denial; initial history; genuine authenticated debit/card alerts; SMS/email matching without double count; unsupported sender rejection; restart/background sync; revoked access/reconnect; disconnect/revocation; no sensitive diagnostic data.
- Install a verified release-signed personal APK by replacement (`adb install -r`), preserving the journal. Do not reset/uninstall it to bypass an OAuth or signing error.

Never commit real email bodies, sender/account identity, payment references, tokens or credentials as fixtures. Use synthetic examples for regressions.
