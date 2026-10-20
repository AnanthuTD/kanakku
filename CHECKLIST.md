# Kanakku implementation checklist

Updated: 20 October 2026. Plan: [PLAN.md](PLAN.md).

Checked boxes mean the named implementation or check is complete. Device acceptance is tracked separately; a successful APK build is not a device test.

## Prioritised remaining tasks — 20 October 2026

**Gmail release disclosure update (20 Oct):** privacy policy now describes the live optional Gmail flow without stale “consent pending” wording. The owner’s local-signed build completed Google consent, synced the mailbox and imported the previously missing SBI debit alert. Gmail content is parsed and stored locally; under Play’s definition, this alone does not make Emails “collected” because the app does not transmit email content off-device. Keep the privacy policy/in-app disclosure explicit about mailbox-wide read-only access. Remaining Gmail gates: Google restricted-scope OAuth verification, a Play app-signing OAuth client, and live Play-signed/background/revocation checks. Recheck the full Data safety form for other outbound data; Gmail by itself does not require an “Emails collected” checkbox on this data flow. The live Play Console Publishing overview currently has one unsubmitted change: Closed testing – Alpha, versionCode 7 / beta.6, “Start full rollout.”

**Task 1 complete:** beta.2 / versionCode 3 was published to internal testing and installed on the personal phone via Play. The closed-test beta.1 submission remains separate.

Release evidence: source `c554b44` is pushed and its GitHub regression passed. Production verifier passed on `android/app/build/outputs/apk/release/app-release.apk` (SHA-256 `aa470b49643a4cec1bf33f09d8826100f5acb3529508a8a60a93674ce30ee641`). AAB `android/app/build/outputs/bundle/release/app-release.aab` has SHA-256 `95f8d26f7ced442efaed7b71a16bb0a62000cd87cb8dffec7b2f7cb5c222936c`. Play Console shows beta.2 available to internal testers; phone reports versionCode 3, `0.2.0-beta.2`, last updated 16 Oct 2026 21:26.

This is the current execution order. Historical sections below retain detailed evidence and may contain older checkpoints; they do not replace this consolidated queue.

**Latest device / Play update (20 Oct 2026):** the Xiaomi currently has the Play-signed app, not the locally signed beta.5 APK. A direct `adb install -r` was rejected because the signing certificates differ; do not uninstall if preserving the local journal matters. The selected-SMS-history permission fix is committed (`7964c0e`) and published to the `personal-beta` OTA channel; typecheck and 217 unit tests pass. The phone still needs to check/download/restart the OTA from Settings → App updates. Beta.6 / versionCode 7 AAB is at `android/app/build/outputs/bundle/release/app-release.aab` (20 Oct, 12:19 IST), includes the permission fix, and is now signed with SHA-1 `D6:29:13:AE:BC:6C:5F:B1:65:03:F0:9F:36:AE:23:39:B8:13:DA:97`, matching Play's expected upload certificate. The first AAB was rejected because it used the debug key; re-upload this rebuilt artifact. Bundletool estimates ~42 MiB download for a Xiaomi-class arm64 device; selected APK splits total ~104 MiB installed. The 220 MiB AAB includes all ABIs plus debug-symbol/mapping metadata. Model weights are not bundled; ONNX Runtime (32.6 MiB native arm64 library) and ML Kit OCR (10.6 MiB) remain in the base build. Upload it to the existing closed-testing track; the unpublished internal v6 draft is a separate track and was not released. Play app-signing SHA-1 remains separate. User corrected the SBI email transaction amount to ₹17,837.

1. [x] **Duplicate-SMS handling — implementation delivered.** Read all recognised sender variants and deduplicate per transaction, never discard a sender family. Prefer matching bank/account/instrument, reference, amount and direction; retain different references. For proven KGB supplementary balance alerts, require those matching fields and a unique counterpart within ±1 minute of bank-stated event time; use the five-minute receipt-time fallback only when event time is unavailable. Preserve both records and user decisions. Keep ambiguous matches separate for review. Do not generalise the KGB rule to SBI/Slice/cards without verified paired formats. Timestamp extraction, candidate/target safeguards and safe re-import enrichment are implemented; 205 unit tests, 158 native checks, 24 browser journeys, TypeScript, production APK verifier and GitHub regression passed. Actual parser and matcher run against 551 local KGB alerts in memory linked 82 unique supplementary pairs, the same 82 as the receipt fallback; it saved no SMS or ledger change. Remaining: upload/install the Play-signed build, native persistence and personal-journal acceptance. Review `YESBAK`/`GKIWIP` with synthetic fixtures before extending recognised senders. Do not commit raw SMS or private account details.
2. [ ] **In progress: Real spending totals and transfers.** Re-import with the updated parser, reconcile monthly totals with the user and confirm duplicate exclusions and held bank-account payments. Masked destination digits alone cannot prove own-account ownership, so ambiguous payments stay held until the user selects Transfer or Purchase + category. The review screen explains that choice. Beta.3 (versionCode 4) is available to internal testers and was installed on the connected phone via an arm64 device-targeted APK set. **Current reconciliation pass:** fresh beta.3 diagnostics confirmed the selected 12-month import completed with 793 ledger records and 82 linked duplicate pairs; user-confirmed October totals matched the read-only hierarchy. The user later confirmed the corrected ₹17,837 SBI debit alert appears in Activity after Gmail import. Remaining transfer-purpose decisions and post-update ledger acceptance are still open. The old sideload erased/replaced app history at that time; use the current device state for further reconciliation.
3. [ ] **In progress: On-demand model delivery and diagnostic testing.** Move Whisper (~57 MiB) and MiniLM (~22 MiB) out of the base APK; measured model assets total ~79 MiB of the current ~184 MiB APK. Target ~105 MiB before delivery integration overhead; verify actual artifacts. Keep SMS import, deterministic categorization and manual review usable without downloads. Provide explicit download/progress/cancel/retry, integrity checks, local reuse and removable model packs; inference stays on-device. Evaluate Play on-demand delivery for store installations and a verified HTTPS source for direct ADB installations; do not assume native libraries can be asset packs. Screenshots and recordings are now allowed while the journal is open; biometric unlock and encrypted storage remain enabled. Xiaomi input-injection/USB-install restrictions are separate. User requested this ahead of remaining bill/companion acceptance on 16 Oct. Implementing an explicit WorkManager-backed HTTPS downloader for both Play/ADB builds; Play Asset Delivery remains a store-specific follow-up. Weight exclusion, pinned catalog, hash verification, download controls and missing-model fallbacks are implemented. TypeScript, 216 unit tests, 208 native checks and all 162 browser journeys pass; native library compilation passes. Android instrumentation now passes after unlocking the dedicated AVD: real pinned downloads/hash validation, MiniLM and Whisper inference, replacement-install/process-restart reuse, partial-range recovery, cancellation, corruption rejection and removal. Production APK excludes optional weights, pinned catalog verified; 106 MiB beta.4 APK built and installed on personal phone with replacement install.
4. [ ] **Bill-photo and voice hand-off.** Finish/verify editable structured receipts attached to existing payments; preserve unsaved avatar voice context across Edit/Photo, cancellation and return. Complete native OCR checks on a minified build.
5. [ ] **Companion acceptance and automated flows.** Update the redesigned avatar Maestro preview flow; verify real-payment and sample prompts, tap-to-listen, Save/Edit/Photo, drag-to-dismiss, position memory, lifecycle and locked-screen privacy.
6. [ ] **SMS, import and security acceptance.** Test foreground/closed/locked delivery, encrypted persistence, reboot/authentication/biometric-key changes, permission denial/revocation, pause/resume, process death and notification actions. Expand redacted/synthetic real-bank format coverage.
7. [ ] **Gmail issuer coverage and October reconciliation.** Current importer supports authenticated SBI debit/card email templates only. The provided SBI debit email says ₹17,437.00 (not the earlier ₹17,338 figure), dated 10 Oct 2026, and its format passes the synthetic parser regression. On-device Gmail status confirms 9 matching emails checked, 4 supported alerts processed and 5 ignored; the October dashboard still shows ₹392, so the expected SBI debit-email transaction is not yet reconciled into spend. SMS is intentionally not connected; Gmail transactions should count independently. Inspect the transaction/review list to determine whether the email was excluded, delayed or not among the four parsed alerts. Inspect redacted Axis, HDFC, Slice and other issuer examples before adding strict templates.
8. [x] **Hide routine/completed import banners.** Quiet SMS catch-up scans no longer show as a persistent restore banner; completed history imports hide once pending encrypted alerts reach zero. The banner remains for active user-requested restores, paused/error states, and completed imports with alerts still loading.
7. [ ] **Brave lookup acceptance.** Verify visible exact-VPA source evidence and merchant identification, credential persistence/replacement/removal, timeout/quota/error/cancellation paths on Android. Evaluate held-out Indian merchants and calibration; completed HTTP requests alone do not prove merchant identification.
8. [ ] **Subscription validation.** Check real recurring charges, merchant aliases, refunds, cancellations and price changes during personal beta.
9. [ ] **English voice and model evaluation.** Broaden phone tests for names, Indian English, quiet/noisy speech and category acceptance; retain only explicitly approved diagnostic material. Close the historical multilingual evaluation with the current English-only release scope; Malayalam remains deferred to future packs.
10. [ ] **Accessibility, splash and notification acceptance.** Complete TalkBack, large text, touch targets, empty/error/loading states, normal/reduced-motion avatar behavior, light-mode splash hand-off, silent settings and notification glyph/privacy checks.
11. [ ] **Performance.** Benchmark large imports/histories, list scrolling, cold/warm inference, memory and battery on the target phone; tune only against measured results.
12. [ ] **Final regressions and release evidence.** Resolve remaining browser regressions, rerun affected native/Maestro/browser checks on the final APK, and refresh hashes/reports. Current passing host checks do not replace device acceptance.
13. [ ] **Personal release OTA acceptance.** Compatible OTA updates now check and download automatically on app launch; Kanakku never reloads automatically, and the user confirms when to restart. Verify this behavior, failure handling and runtime/channel isolation on the personal Play-signed build; isolated E2E delivery has already been demonstrated.
14. [ ] **Dependencies and remaining policy decisions.** Resolve/reassess upstream braces/node-forge advisories and finish VPA/API-token/Data safety classification decisions. Signing infrastructure and initial declarations are already set up; further policy edits must reflect verified behavior.
15. [ ] **Closed-test approval and production eligibility.** The user’s 19 October Play Console screenshot confirms closed testing is active and its release is published; two testers were opted in. After availability, recruit at least 12 real testers, collect feedback, maintain continuous 14-day opt-ins, fix findings and apply for production access. Closed-test publication is complete; production access/publication remains pending.

Deferred scope: Malayalam language packs, Gemini grounding, Jeff evaluation and cloud sync. These are not current-release completion claims.

## Play release continuation — 15 October evening

- [x] Read committed Play Console handoff and recording scripts; preserve existing internal-test release
- [x] Replace overlay UI Automator lookup with a verified native-window locator; confirmed on Android 16 emulator and connected Xiaomi 24053PY09I
- [x] Record and visually review the foreground-service demo on the connected Xiaomi 24053PY09I (Android 16): isolated E2E build, synthetic Settings preview, overlay over launcher, microphone foreground service active on avatar tap (`0x40000080`), and on-device English speech recognized (7 words); preview saved no payment. Temporary E2E app uninstalled afterward; personal app remains installed. Final 22-second H.264 video: `artifacts/play-verification/kanakku-companion-verification.mp4`; evidence: `artifacts/play-verification/companion-verification-phone.json`.
- [x] Upload the reviewed demo as YouTube Unlisted (`https://youtube.com/shorts/cGICfJt_myE`; verified in YouTube Studio as “kanakku companion verification”).
- [x] Save both foreground-service declarations in Play Console with the Unlisted demo URL and permission-use descriptions; user confirmed clicking Save, and Publishing overview lists the declaration.
- [x] Complete Approximate location handling in Play Console and review the generated Data safety preview (15 Oct): the exported Console CSV confirms approximate location is selected and marked collected + shared, optional, non-ephemeral, with App functionality purposes. Preview now lists Approximate location under both Data collected and Data shared. Purchase history was added and saved on 16 Oct as collected + shared, optional, non-ephemeral, for App functionality. SMS and receipt photos remain unselected because their contents stay on-device.
- [x] **Add Purchase history in Play Console (16 Oct):** saved the category answers and the full declaration; Console confirmed “Change saved. Send for review in Publishing overview.” Preview confirms collected + shared, optional, App functionality; non-ephemeral selected.
- [x] **Closed testing submitted (16 Oct):** Alpha configured for India with the existing “Kanakku beta testers” email list (3 users) and feedback email. Reused versionCode 2 / 0.2.0-beta.1 from Play library, added release notes, saved and confirmed “Send changes for review.” Console confirms “14 changes sent for review” and “Changes in review”; automated quick checks are still running and changes proceed to review after successful checks. Approval and tester opt-ins remain pending.
- [ ] **Remaining Data safety classification review (initial declaration already submitted):** source review found remaining classification questions. Brave receives only an allowlisted merchant label for automatic lookups, but that label is derived from a real transaction; Google defines Purchase history broadly, so add/review Purchase history as collected and shared (optional, App functionality) unless the automatic lookup flow is changed. The exact VPA is sent only after a per-address consent switch; the current User payment info “Shared” answer appears over-inclusive under Google's user-initiated transfer exception. Review whether the VPA maps to User payment info and the BYOK token sent in `X-Subscription-Token` maps to User IDs. The earlier CSV predates the saved Purchase history addition; User payment info remains collected + shared. Approximate location handling is complete. See `docs/play-policy-review.md` before editing the live form.
- [x] Publish corrected privacy policy disclosures to public GitHub `main` (commit `4ff113e`; verified raw `main` URL includes VPA, SDK metrics and IP-based approximate-location text).
- [x] Review and upload the foreground-service demo video; both declaration links and descriptions were saved in Play Console.
- [x] SMS money-management declaration saved by the user with corrected 454-character reviewer instructions; Console confirms "Your changes have been saved" (Play review status not yet verified)
- [x] Verify SMS declaration is saved/actioned in App content; Play's policy review/approval is still pending
- [x] Complete category/contact details; Finance, Personal finance, contact email and website verified after reload
- [x] Initial closed-test submission confirmed on 16 October; final production readiness review remains in the prioritised queue.
- [x] Play Store settings tag **Personal finance** selected and visible after reload
- [x] Default listing text, 512×512 icon, and AI asset declaration reviewed and saved in Play Console (user confirmed save, 15 Oct)
- [x] Attach Play listing feature graphic (cropped copy, 1024×500) and four phone screenshots (449×1000 each); screenshots satisfy listing upload dimensions but not the optional 1080px-per-side promotion target
- [x] Default listing review saved in Play Console (user confirmed save, 15 Oct)
- [x] Store contact email/website saved and confirmed visible after reload (15 Oct)
- [x] App category **Finance** saved and confirmed visible after reload (15 Oct)

## Current work — review, updates and receipt photos (15 October)

- [x] Review other agent’s native voice, payee, duplicate, overlay and documentation changes
- [x] Fix review findings around duplicate provenance, masked account rules, avatar confirmation, voice session ownership and diagnostics; targeted host checks pass (combined device regression pending)
- [x] Expo EAS Update integration: manual check/download/restart with activity guards; Settings card verified on the phone
- [x] OTA runtime version made deterministic: the build profile is persisted to `kanakku-profile.json` (Gradle's fingerprint step ran without the env var and built the test APK with the personal runtime), and the in-tree compiled expo-updates Gradle plugin is ignored (its lock/history files changed the hash on every run). Shell and Gradle now agree (`d9e9788a…`); project initialised in git, which the fingerprint tool also needs to honour `.gitignore`
- [x] Live delivery proven on the phone (15 Oct, 14:18): published update group 1c5bc73e to `e2e` (runtime `d9e9788a…`, equal to the installed APK), test app found it, downloaded it, restarted on confirmation and now reports "Downloaded update" instead of "APK version"; personal app untouched
- [x] Implement on-device OCR/parser and temporary-photo cancellation/cleanup; 30 focused host checks pass
- [x] Bill parser hardened against nine real receipts (Indonesian sushi, two Bengaluru/Hyderabad restaurants, two grocery bills, a crumpled hypermarket bill, a US-dollar receipt, a TGSPDCL electricity bill, two weighed-produce bills): counters/IDs/phone numbers/HSN codes never become amounts, wrapped names join, named-month and two-digit-year dates, service charge, excl-GST/gross/net/bill-amount totals, MRP/rate/amount and rate-kg-value columns, loyalty rows, unlabelled subtotals, ±1 paisa on weighed rows, non-rupee hint; fixtures in `tests/receipts/`, 33 receipt checks
- [x] Receipt path now records stage diagnostics (counts only) and, in the test build with the clip switch on, keeps the newest OCR text for recognition diagnosis
- [ ] **In progress:** integrate editable structured bill receipt with an existing payment and voice context
- [x] Bill-photo actions in the in-app and native floating companion; native camera opens only inside the foreground app
- [ ] **In progress:** preserve an unsaved native-avatar voice answer when opening Edit or Photo
- [x] Install official Expo plugins for Codex and Claude Code; verified enabled/installed locally
- [x] Replace default Expo project icon with the existing Kanakku leaf mark; verified saved in Chrome
- [x] 187 unit checks, 6 dependency checks and 134 standalone Kotlin checks pass
- [ ] **In progress:** Android release build and real OCR instrumentation on the isolated emulator
- [ ] **In progress:** browser regression fixes after first run (147/150 pass); receipt journeys all pass; companion width caused control overlap
- [x] Link verified EAS project, authenticate owner access and create isolated personal-beta/e2e channels and branches
- [x] Repository made public-ready: MIT licence, SECURITY.md (private reporting, no-upload promise), CONTRIBUTING.md, code of conduct, issue/PR templates, visitor README with fresh screenshots, repo description and topics
- [x] Signed release pipeline: `release.yml` builds on a `v*` tag, fetches models by hash (`npm run models:fetch`), signs with the new RSA-4096 release key (secrets set on the repo), runs the production verifier and publishes APK + SHA256SUMS + certificate fingerprint + OTA runtime version; signing wired through the config plugin from environment only
- [x] Play Store size: R8 minification + resource shrinking (dex 61.8 → 20.9 MiB) and the unused ML Kit barcode scanner excluded at the app level (Expo's prebuilt camera artifact bakes it in; expo-camera's switch alone cannot remove it): APK 228.2 → 184.2 MiB, under Play's 200 MB base limit; verifier passes; launch and voice path load clean under R8
- [x] Plain-language privacy policy at docs/PRIVACY.md for the Play listing and README
- [x] Camera/OCR path exercised on the minified build on the phone: CameraX initialises, no stripped-class errors (ONNX Runtime logs a benign telemetry-stub warning; no native telemetry is compiled in)
- [x] Package renamed to `app.tinkerbox.kanakku` / `.e2e` (publisher Tinkerbox, domain tinkerbox.fun; `com.kanakku.app` was already taken on Play and `fun.` is a Kotlin keyword): 36 files, native privileged-diagnostics gate kept exact, prebuild + Kotlin compile pass, 198 unit / 145 Kotlin checks, fingerprint stable
- [x] First signed public release published and independently verified: downloaded `v0.2.0-beta.1` APK matches `SHA256SUMS`, is signed by the release certificate `48:E9:E4:A4…`, package `app.tinkerbox.kanakku` 0.2.0-beta.1 (the ENOSPC failure was fixed by reclaiming ~25 GB on the runner)
- [x] Play AAB built and verified: `artifacts/play/kanakku-0.2.0-beta.1.aab`, release-signed, 143.6 MiB; bundletool reports a 112 MB download for the test phone's device spec (arm64, en-IN, 480 dpi), under Play's 200 MB limit
- [x] Play SMS-permission verification recording script (`scripts/record-sms-verification.mjs`): root-only synthetic fixture injection (a non-root provider insert is silently dropped on API 36), wake/unlock, chained screenrecord, ffmpeg stitch, exact cleanup
- [x] Play SMS-permission verification video recorded (2 min 44 s, 1080×2400, `artifacts/play-verification/kanakku-sms-verification.mp4`; ends on the overview showing ₹300.25 from 9 synthetic alerts). At recording time, the unlocked journal blocked captures; this is intentionally disabled in the current implementation while biometric unlock and encryption remain enabled.
- [x] Play-delivered build installed from the internal-testing track on the owner's 24053PY09I phone and confirmed working (15 Oct evening)
- [x] **Google Play submission (15 Oct, 18:07 IST):** `kanakku-0.2.0-beta.1.aab` uploaded to the internal-testing track of `app.tinkerbox.kanakku`, Play App Signing enrolled on upload (release key = upload key), release 0.2.0-beta.1 published "Available to internal testers · Not reviewed". Remaining before the listing goes live: testers, Data safety, SMS permissions declaration (video as an unlisted YouTube link), store listing; all values in `artifacts/play/SUBMISSION.md`
- [ ] **Next, after the Play submission (owner decision 15 Oct):** deliver the ML models on demand via Play Asset Delivery — Whisper (57 MB) and MiniLM + ONNX Runtime (~55 MB) become on-demand packs fetched only when the user first taps voice or asks for a suggestion, never silently; first install drops from ~112 MB to ~15 MB; each language becomes its own pack (the planned Malayalam route). Needs a new AAB
- [ ] Verify a real compatible published update on a release build

## Implemented baseline

- [x] Overview, Activity, Insights, Settings and transaction detail/review screens
- [x] Warm ivory/forest green light theme and charcoal/soft green dark theme
- [x] Integer-paise totals; separate purchases, refunds, transfers, repayments, income and cash
- [x] Search, category/review filters, category/account drill-downs and date-grouped rows
- [x] Recategorize, add notes, exclude/include, remember merchant and undo correction
- [x] Native SMS parsing and multipart receipt, OTP/unrelated-message rejection
- [x] SQLCipher ledger, authentication-gated keys and sealed background inbox
- [x] Personal rules, known merchants and bundled offline semantic suggestions
- [x] Bundled English Whisper base.en Q5_1 voice flow with editable English note and typed/category fallback (Malayalam voice packs deferred)
- [x] In-app draggable companion and private notification/native overlay
- [x] Chosen history period, recent-first background import and persistent checkpoint
- [x] Top import banner, private progress notification and pause/resume
- [x] Signed arm64 personal-test APK built (development signing key); rebuilt 14 October 2026 with Kanakku branding, SHA-256 80c739a0…202a, same certificate and model hashes

## Features implemented in this continuation

- [x] Combinable date range, account and transaction-kind filter controls
- [x] Preserve Activity filters/scroll while moving between screens
- [x] Merchant totals and drill-downs
- [x] Equivalent-period comparison with honest history coverage
- [x] Supported spending questions with explicit period/category interpretation and ambiguity handling
- [x] Review queue save-and-next, skip and undo controls
- [x] Edit existing merchant rules without changing past transactions
- [x] Quiet hours, review notification controls and optional reminders
- [x] In-app avatar blinking, richer reactions, position persistence and bounds handling
- [x] One-tap voice entry from the floating prompt after unlock
- [x] Missed-message backfill confined to the user's chosen history window
- [x] Storage/key capability status and clear reset/recovery flow
- [x] Ledger schema migrations and persisted classifier provenance
- [x] Added parser, import boundary, query, SQLite migration/persistence and voice cancellation regression coverage
- [x] Incremental ledger writes, repository serialization/cache and linear merchant grouping
- [ ] Benchmark large histories and tune import/model performance on the target phone
- [x] Update plan/README, visual proof and rebuild APK after changes

## Earlier verification checkpoint (before this continuation)

- [x] TypeScript check
- [x] 108 automated tests: domain/query/import, SQLite persistence/migration/metadata/rollback, voice lifecycle, avatar placement, subscription evidence and lookup cancellation/privacy
- [x] 89 standalone Kotlin parser/tokenizer/import/review-policy checks, included in the regression command
- [x] Expo Doctor 21/21, web export and Android release assembly
- [x] APK signature and bundled model SHA-256 verification
- [x] Four-month and Skip setup flows; light/dark visual checks
- [x] Combined filters, spending-question drill-down and review skip/save/undo in browser
- [x] Merchant-rule edits preserve past categories; quiet/reminder preferences survive reload
- [x] Avatar voice entry exposes Android-only fallback in browser; updated light/dark visual proof
- [x] 122 Playwright E2E checks across phone/desktop browser sizes; no retries, fresh production export (includes brand, splash and navigation journeys)
- [x] Regression command and GitHub Actions workflow; four isolated-package Maestro smoke flows, separate SMS/credential harnesses and 16 native acceptance cases written
- [x] Expanded 84-input desktop synthetic semantic evaluation; per-route precision/review rates documented in artifacts/semantic-evaluation.md

## Added scope — merchant lookup, subscriptions and avatar polish

- [x] Conservative local monthly/weekly/yearly recurring-payment detection with explicit evidence and estimated dates
- [x] Subscription/bill/recurring-spending distinctions; insufficient-history/refund/duplicate/account safeguards
- [x] Confirm/ignore/restore persisted in encrypted ledger metadata; decisions do not change transaction totals
- [x] Insights/Settings navigation and light/dark recurring-payment review screen
- [x] Optional Brave BYOK setup with Android Keystore-encrypted credentials and explicit consent
- [x] Serial automatic lookup only for exact public brands, reviewed unknown-business query and evidence display
- [x] No financial fields/private identifiers sent; no automatic ledger/rule updates; no reusable search-result cache
- [x] Provider budgets, cooldown, cancellation barrier, foreground/current-transaction checks and stale-request suppression
- [x] Avatar drag/tap separation, measured safe bounds, remembered edge/fraction, resize/corrupt-position recovery and accessible reset
- [x] Native overlay inset/rotation/screen-off/foreground cleanup, settings/silent/reduced-motion feedback
- [x] CLAUDE.md project instructions and provider evaluation notes
- [x] User-supplied Brave credential verified with a host-side public-business search (HTTP 200); no key stored in project files
- [ ] Brave configuration/provider responses, quotas/timeout and credential reset verified on Android
- [x] Wireless ADB QR pairing verified with an arm64 Android 16/API 36 phone (24053PY09I)
- [x] Maestro 2.11.0 installed; three native flow files pass its syntax check; separate E2E APK built and transferred
- [x] Kanakku E2E and both Maestro helpers installed on the connected phone
- [x] Maestro UI flows pass on the isolated Android test package — 3/3 (history setup, review persistence, theme persistence) on 24053PY09I Android 16, 14 October 2026: first on APK 3c085def…5c11, then again (4m 9s) on the rebranded APK 501b8927…29ee with splash and floating tab bar; reports in `maestro-output/device-20261014-claude/` and `maestro-output/device-20261014-brand/`
- [ ] Native avatar/overlay/TalkBack/lifecycle behavior verified on phone
- [ ] Real recurring charges/aliases/price changes validated during personal beta

## Emulator and device-independent hardening — 14 October 2026

- [x] Install Android emulator 37.2.12 and Android 16/API 36 Google APIs ARM64 image
- [x] Create and boot reusable `Kanakku_API_36` test device (2 GB RAM, two CPUs), serial `emulator-5580`
- [x] Add guarded setup/start/stop/test commands; verify AVD identity and isolated APK before installation
- [x] Expand native synthetic parsing and import/policy checks to 89, including malformed grouping, precise paise, pending refunds, card purchases and leading balances
- [x] Expand subscription calendar/price/staleness/account/refund edge cases to 30 host tests
- [x] Add 10,000-row synthetic ledger correctness checks; exact totals, merchant grouping and replayed corrections
- [x] Evaluate 84 separate synthetic semantic inputs; document precision and review rates without claiming real-world validation
- [x] Add mixed-purpose guard before native semantic note fallback; user chooses the category explicitly
- [x] Fix avatar activation/release position loss and add sparse-movement drag regression
- [x] Fix tab keyboard navigation, named dialogs, review focus containment/Escape/return and fast-typing loss
- [x] Integrate compatible decoder and UUID dependency fixes; clean `npm ci` and six real-consumer compatibility checks pass
- [x] Review remaining dependency findings: 18 high advisory paths rooted in braces/node-forge; upstream patches remain unresolved
- [x] Add read-only APK verification and production-signing rejection gate; document release preparation in RELEASE.md
- [x] Fix SQLCipher writes to use the existing keyed connection; host rollback/concurrent-write/reopen checks and strict native import, ₹300.25 total, encrypted-header, restart/authentication and replay checks pass
- [x] Final combined regression after scroll and SQLCipher corrections: TypeScript, 108 unit tests, six dependency checks, 89 Kotlin checks and 122 browser checks pass
- [x] Fix native foreground lifecycle Window/overlay work to run on the main thread; Android assembly and actual persisted-journal restart/authentication pass
- [x] All four updated functional Maestro flows pass on current emulator APK under reduced motion: three combined-run passes plus the corrected mixed-note focused recheck; original transition scale restored. Evidence: artifacts/emulator-ui-results.json
- [ ] Complete normal-motion avatar and native accessibility acceptance; reduced-motion saved-state tests do not establish those behaviors
- [x] Controlled synthetic native SMS provider import/authentication/persistence/replay: full fresh run passes all 10 checks on APK 07767333…afe2a; 9 scanned/5 eligible, ₹300.25, four current-month rows; cleanup/settings restoration pass (selected N02/N06/N07/N08/N10 portions)
- [x] Synthetic native provider-key lifecycle: five Maestro journeys and 30 checks pass on the same APK; complete encrypted save/restart/replacement/removal, no plaintext key on disk, zero searches and denied runtime permissions; motion settings restored

## Brand, launch and navigation polish

- [x] Premium launch criteria defined in PLAN.md (Brand and launch)
- [x] Kanakku leaf mark from one geometry source; launcher, adaptive, themed (monochrome) icons, favicon and splash assets regenerated by `scripts/render-brand.mjs`
- [x] Expo template icon/splash art replaced; app.json sets adaptive icon, primary/background colours, versionCode, description and web favicon/theme colour
- [x] Native splash (light/dark) via expo-splash-screen; dark window background no longer defaults to ivory
- [x] In-app splash hand-off: identical first frame, one leaf/wordmark moment after load, 2.5-second hold limit, reduced-motion fade, hidden from screen readers
- [x] Floating capsule tab bar with sliding labelled pill, selection haptic, `aria-selected` state and reduced-motion handling
- [x] Notification glyph (`ic_stat_kanakku`) and brand colour replace Android system info/sync icons; Pause action has an icon; import channel has a description
- [x] Native overlay card and companion colours match the app palette and in-app Mascot
- [x] Branded not-found screen for stale links; custom web shell with theme colours; date filter hints no longer show stale fixed dates
- [x] Browser journeys for splash hand-off (both motion settings), tab selection and unknown links; full Playwright suite 122/122 passed
- [x] Splash hand-off verified on the phone in dark system mode: screen recording shows the native tile (428 px ≈ 143 dp at 3.0 density) and the in-app tile at the same size and centre, then the wordmark and fade into the app; launcher shows the new adaptive icon
- [x] Manual operations guide in CLAUDE.md: toolchain, phone developer settings, QR/pairing-code wireless ADB, app permissions, APK build/verify/install, Maestro and troubleshooting
- [x] `npm run adb:pair` prints a wireless-debugging QR code, pairs over mDNS and connects ADB
- [x] `npm run adb:pair` verified end to end: phone 24053PY09I scanned the QR, paired and auto-connected (14 October 2026)
- [x] Maestro harnesses pass `--no-reinstall-driver` so Xiaomi does not ask to approve helper reinstalls on every run
- [ ] Splash hand-off checked in light system mode and with Android reduced animations on the phone
- [ ] Notification glyph verified in status bar and on lock screen

## Web search credentials and deployment

- [x] Personal-use approach: enter the Brave API key after opening the app, in Settings → Optional web merchant lookup; no backend required
- [x] Settings supports saving/replacing/removing the key, encrypted using Android Keystore; no shared key in source files, bundled config or APK
- [x] Provider access is optional; users separately enable lookup and automatic public-brand searches
- [x] Emulator credential storage verified using deliberately invalid placeholders; real API response/quota and physical Keystore backing remain separate acceptance work
- [ ] Save the key on a physical Android phone and verify an in-app search, persistence after restart, replacement and removal
- Wider distribution can retain user-provided keys without a backend. If Kanakku provides search using a shared service credential, add a backend with server-held credentials, authentication, per-user quotas and spending limits before offering that service. This backend is deferred and has not been implemented.

## Duplicate alerts and real-total validation — 16 October

- [x] Compare other issuer alert formats locally before generalizing KGB dedupe: Axis commonly includes seconds; SBI/Slice include date-only formats; HDFC/SBI Card/Kiwi lack enough matched paired-alert evidence to approve a time-only rule. No raw SMS retained or committed. Keep automatic supplementary-alert matching scoped to proven bank templates.
- [ ] Review alternate public sender headers `YESBAK` and `GKIWIP` and add synthetic supported transaction fixtures before changing issuer mappings. Sender recognition alone must not admit OTP/promotional messages.

- [x] **Source implementation (16 Oct):** preserve KGB bank-stated transaction times separately from SMS arrival; match unique supplementary/reference pairs within ±1 minute of event time, retaining the five-minute receipt-time fallback for older rows. Conflicting references, amounts, accounts, directions and ambiguous matches stay separate. Host validation: 203 unit tests, 158 synthetic native checks and TypeScript pass. Native APK deployment and real-inbox validation remain pending.
- [ ] Validate re-imported real month totals with the user after deploying the updated native parser; re-import enriches missing event timestamps without replacing user edits; existing duplicate decisions remain preserved.

## Remaining implementation and evaluation

- [x] Expanded synthetic bank, posted/pending reversal and partial-refund regression fixtures
- [ ] Broader real-bank fixtures and ambiguous cross-source duplicate review
- [ ] Held-out Indian merchant/VPA evaluation and precision/review-rate calibration
- [ ] Phone-based model/voice benchmark; choose larger voice model or explicit language control if tiny fails
- [x] Browser keyboard/dialog/focus/typing, simulated large-text and selected error-state audit; identified issues corrected
- [ ] Complete Android large-text/TalkBack/overlay and remaining state acceptance
- [x] Review dependency audit/signing, integrate compatible patched decoder/UUID and enforce read-only delivery checks
- [ ] Resolve upstream braces/node-forge advisories and owner-controlled production signing before wider release

## Device acceptance still required

- [x] Personal app package installed on the physical phone (15 October 2026); launch, SMS connection and live capture still to be checked by the user
- [ ] Redacted real alerts from Axis Flipkart, SBI Cashback, Kiwi, Slice and HDFC Swiggy; expand supported fixtures
- [ ] Foreground/closed/locked SMS receipt and encrypted persistence
- [ ] Authentication, reboot, biometric changes and invalidated-key behavior
- [ ] Import pause/resume, process death, restart and notification actions
- [ ] Permission denial/revocation and provider-specific SMS behavior
- [ ] Overlay drag/tap/dismiss, locked notification privacy and silent/reduced-motion settings
- [ ] Broader English voice accuracy, names, noise and category acceptance; Malayalam remains deferred, not supported by the current voice build
- [ ] Inference cold/warm latency, memory, battery, large histories and scroll performance
- [ ] TalkBack, large text, touch targets and all empty/error/loading states

## Intentional implementation decisions / deferred work

- Brave is implemented for optional public-business evidence. Gemini grounding is documented but not enabled; it needs a separate compliant answer/suggestion UI.
- MiniLM is the current on-device model; Jeff remains an evaluation candidate.
- English-only Whisper base.en Q5_1 is bundled (user decision); Malayalam is deferred because tiny failed it and small took about 31 s per clip on the phone. Installable per-language voice packs are planned future work (PLAN.md › Future: installable language packs). The prior Android speech-service bridge remains unused by the primary voice flow.
- Custom SVG/Canvas avatar is implemented; Rive is not required for this first version.
- Cloud sync, payments, bank logins and public Play Store release remain deferred. Web lookup and subscription detection were explicitly moved into scope by the user.

## Active work — Whisper audio and VPA lookup

Updated after each completed step (14 October 2026).

- [x] Implement explicit reviewed VPA search through Brave; exact-address consent resets after edits, no automatic VPA searches or ledger changes
- [x] Validate query/privacy/cancellation/source evidence: 114 unit tests, six dependency checks, 102 Kotlin checks and 130 browser journeys pass
- [x] Rebuild and verify updated E2E and personal APKs; E2E SHA-256 33529885…5496, personal ac0da5d6…5c1c (development signing)
- [x] Native Android Brave request for a publicly listed organizational VPA completes and increments usage once; stored key retained, no source-content cache/artifact saved
- [ ] **In progress:** verify visible exact-VPA source evidence and merchant identification in the native app (request completion alone does not verify the merchant)
- [x] Prepare pinned, licensed actual speech: three English and three Malayalam FLEURS recordings plus silence/noise; eight audio format/hash checks and four scorer checks pass
- [x] Authenticate emulator microphone injection with host microphone disabled; fast AudioFlinger readiness removes the earlier late-injection timeout
- [x] Complete actual English audio injection through the emulator (102,720 frames); original motion/microphone settings restored
- [x] Diagnose the recording/transcription error: the recorder handed Whisper float32 audio while whisper.rn 0.7 reads signed 16-bit PCM; fixed, with stage-only failure logging and test-package recorder timing diagnostics
- [x] Harness: inject only after the guest opens the microphone (the emulator segfaults in `audio_forwarder_enable` otherwise), bound injection to the clip, force the host-microphone gate closed after cut-off streams, and keep reading the app's real result
- [x] Emulator injection proved unreliable (crashes and audio that never arrives), so voice checks moved to the physical phone: `android-voice.py --physical SERIAL` plays the frozen clips through the Mac speaker into the phone microphone
- [x] First real-phone transcript (English bus clip); phone noise/silence controls produced no note
- [x] Tiny model fails Malayalam (filler text on phone and host, even with Malayalam forced); host comparison of base/small/medium on all fixtures; small selected and made swappable via `npm run voice:model`; filler captions rejected
- [ ] Run all English/Malayalam recordings through actual Android Whisper, retain outputs and score meaning/word errors
- [x] Decide Malayalam support from measured results: keep Malayalam, with Whisper small instead of tiny
- [x] On-phone whisper.cpp benchmark (4 threads, 24053PY09I): small accurate in both languages but ~31 s per 11.6 s clip; tiny.en ~2 s and base.en ~4.5 s with good English
- [x] Switch to English-only tiny.en (user decision); prompts/settings derive language wording from the selected model; Malayalam moved to future language packs
- [x] Store model assets uncompressed (whisper.rn does not retry short asset reads); `verify-apk` rejects compressed models
- [x] Cancel releases the review sheet immediately; a new tap waits for the cancelled session's cleanup instead of showing "session is finishing"
- [x] User test with tiny.en: names like "Bombay Cafe… Sharjah shakes" came out wrong; phone logs showed very quiet capture (peak RMS ~420–810)
- [x] Switch to base.en (user decision); add merchant-name hint and quiet-voice gain; synthetic Indian-English voices show base.en far better than tiny.en on names
- [x] Test build only: opt-in "keep last 3 voice clips" switch for diagnosis (deleted when switched off)
- [x] Settings › Float over other apps › "Try the floating prompt": real overlay with a sample prompt once the user leaves Kanakku; answering a preview records nothing
- [x] Reviewed the user's 2 opt-in clips on the Mac (then deleted from Mac and phone): clean audio; all models transcribed correctly; the room noise floor (~210–260) kept recording to the 15 s cap
- [x] Adaptive end-of-speech (2.5× noise floor, 1.6 s quiet) and trailing-noise trim; simulated on the clips: 14.3→4.5 s and 15→11.5 s with every word kept; notes get a capital and final stop
- [x] Adaptive recorder confirmed ending early on the phone (notes 2–5 s); but app text stayed garbled ("One fruit An Videoengy…") while whisper.cpp on the Mac produced "One full chicken biryani and a glass of lime." from the same saved clip, with or without the merchant hint
- [x] Load the model as a verified private file: copied once from the APK to no-backup storage with SHA-256 check, then opened by whisper.cpp's normal file reader instead of whisper.rn's bundled-asset stream (which ignores short reads)
- [x] After the verified-file load the user reports "comparatively better": "Electricity bill water bill and house friend" vs whisper.cpp's "electricity bill, water bill and house rent" on the same clip (merchant hint and the app's trim/gain do not change the Mac result)
- [x] Test build stores the app's transcript (or failure stage) beside each opt-in clip for direct app-vs-reference comparison
- [x] Saved app transcripts confirm the gap on the same audio (e.g. app "Going than everything it is for the effect of automatic Rinate…" vs whisper.cpp "It is understanding things sometimes and not in other times…")
- [x] Upgrade to whisper.rn 0.8.0-rc.2 (vendors whisper.cpp 4afec37, 6 October 2026; prebuilt Android libraries hash-pinned by the package): typecheck, 119 unit and 6 dependency checks pass; E2E APK verified and installed
- [x] whisper.rn 0.8.0-rc.2 still worse on the user's clips ("One cage or fish…" vs "1 kg of fish…"); plain whisper.cpp run on the phone CPU with identical audio, settings and hint matched the reference, so the binding was at fault
- [x] Replace whisper.rn with vendored whisper.cpp 0c7be69 behind Kanakku's own JNI bridge: clip stays in native memory, only text reaches JS; ARMv8.2 fp16/dot-product build with CPU check and typing fallback; abort supported; whisper.rn removed
- [x] Native whisper.cpp build on the phone matches the reference on the user's clips (e.g. identical "1 kg of rice, 2 kg of salmon, … 1 kg of butter."); remaining errors are model limits on unusual names
- [x] Floating companion redesigned: avatar alone over other apps with a story-style speech bubble ("₹amount to payee — what was it for?"); asking pose holds the mic to itself, tapping the avatar turns the mic to the user and listens on-device; answer shown in place with Save/Edit; drag onto the X snoozes 30 minutes; Settings preview never stores
- [x] Companion answers are sealed into the encrypted inbox (`answers` table) and applied on unlock as user-confirmed note/category; unknown categories keep the payment in review; answers older than 30 days are dropped
- [ ] Phone acceptance of the new companion (preview and a real payment): tap-to-listen, poses, Save/Edit, drag-to-X, position memory
- [ ] Update `tests/android/overlay/preview.yaml` for the new companion (no "Later"/box text)
- [x] Personal build starts with an empty journal: no sample transactions and old demo storage ignored; Home shows "Not connected yet" until SMS is connected. Sample data stays in the browser preview and isolated test build
- [x] Beta diagnostics: local scrubbed JSON-lines log (app start, SMS ignored/captured/classified, import worker failures, prompt decisions, companion and voice stages/timings, errors shown, uncaught native and JS errors); on by default, Settings switch (off deletes) and Clear log; never stores SMS text, notes, transcripts, payee names, account numbers, audio or keys; digit runs and addresses are masked
- [x] Regression after companion, empty journal and diagnostics: TypeScript, 123 unit tests, 111 Kotlin checks and 132 browser checks pass
- [x] Personal APK rebuilt and verified (app.tinkerbox.kanakku, 197.4 MiB, SHA-256 fcdc6106…acc6) with the companion redesign, empty journal, diagnostics, bank-header fixes, duplicate-alert linking, held account payments, microphone prompts and FlashList 2.3.3; installed on the 24053PY09I phone and the start entry confirmed in the log
- [x] Real-inbox bug: September showed only ₹393 because Kerala Gramin Bank (`KGBANK`), slice (`SLCBNK`, `SLCEIT`) and SBI (`ATMSBI`, `CBSSBI`, `SBIPSG`, `SBIBNK`) headers were unknown; every month was affected. Parser now maps them, reads "credited by … and debited from" as money in (first direction verb wins), parses slice's older "card transaction … is successful" and "IMPS payment … is successful" alerts, posted "Txn reversal … was successful" refunds, and names bank-to-bank UPI payees "A/c ••1234". Checked with an in-memory aggregate probe over the phone inbox (no message text saved); synthetic fixtures added (124 native checks)
- [x] Activity list blank band at the top after scrolling (phone): FlashList 2.0.2 projected its render window ahead of the real viewport on Android flings (upstream PR #2510); upgraded to 2.3.3 (pure JS, excluded from Expo's version check) and confirmed on the phone with slow and fast swipes
- [x] Double counting: Kerala Gramin Bank sends a reference-less balance alert ("Bal after txn") beside the UPI alert for many payments (75/78 paired within 128 s on the real inbox). Any bank's reference-less SMS row is now linked to exactly one referenced alert with the same bank, account, direction and amount within five minutes; it stays in the data as excluded with `duplicateOf`, is hidden from Activity, and ambiguous cases stay separate. Linking also runs over rows already in the ledger on each load. Real inbox: 73 debits and 9 credits linked; September falls from ₹1,72,281 to ₹97,869
- [x] Floating avatar asks for the microphone inside Kanakku (turning the avatar on, previewing it, opening the app with the avatar on, or after a preview tap fell back to the app); diagnostics showed `micPermission:false` behind "tapping opens the app"
- [x] Payments that name only a bank account ("A/c ••1234") are held out of spending until confirmed and shown as "₹X to bank accounts not counted yet" (opens the rows) and "+ ₹X awaiting context" in Activity. "Remember this payee" now also stores a type (e.g. Transfer) and settles that account's other unconfirmed payments; user-edited rows are never changed (browser journey `payees.spec.ts`)
- [ ] User confirms real month totals after re-import and labelling account payees (expected near their ~₹40k/month)
- [x] Phone check: after granting the microphone, tapping the preview avatar listened, recorded 2.7 s and transcribed in 2.4 s on the personal app (diagnostics 02:46)
- [x] Diagnostics also record import completion (scanned/captured, recognised alerts per bank and kind) and ledger flush summaries (incoming, duplicates linked, awaiting context, review counts)
- [ ] User re-imports history on the personal app and confirms month totals; large person-to-person transfers stay in review for marking as Transfer
- [ ] Auto-detect transfers between the user's own accounts (destination digits match another own account) instead of relying on review
- [ ] Floating prompt preview: run `tests/android/overlay/preview.yaml` on the phone and check drag, tap, Later and position memory by hand
- [ ] Repeat affected native regressions on final APK and update final artifact hashes/reports

## Gmail transaction capture — implementation and live local test (20 October)

- [x] Implement optional on-device Gmail authorization and automatic bounded sync, explicitly separate from SMS permissions.
- [x] Parse supported authenticated SBI debit-table and credit-card email alerts; reject OTP/failure/pending/order-only messages and advertising amounts. Test fixtures use synthetic values, never the user's real card/reference/email body.
- [ ] Expand beyond SBI only after verifying each issuer's authenticated sender and successful-transaction template against real, redacted alerts. Axis Flipkart, SBI Cashback, Kiwi, Slice, and HDFC Swiggy remain unsupported for Gmail until then; adding generic amount scraping would risk counting OTPs, statements, declined charges, or offer amounts.
- [x] Add a synthetic regression using the provided SBI debit alert's visible structure and ₹17,437.00 amount; at the time this confirmed parser behavior only. The same alert was later imported live after the sender trust fix.
- [x] Include `alerts.sbi.co.in` in the Gmail sender search and add approved relaxed DMARC alignment for that SBI subdomain, with unrelated-domain rejection coverage; live import then confirmed.
- [x] Add Activity filters for SMS versus email and a regression for mixed-source results (unit and browser test).
- [ ] Add explicit, optional Gmail context lookup for all payments or one selected payment. Do not read order/receipt emails until the user enables it; extract only reviewable fields and never persist raw email bodies.
- [x] Keep foreign currency distinct from INR; hold unresolved cross-source matches and preserve originals/user corrections.
- [x] Settings consent/history/progress/sync/disconnect controls and token/account security.
- [x] Create Kanakku Google Cloud project (`double-backup-512116-g5`) in personal account and enable Gmail API; document setup/privacy/reconciliation in `docs/GMAIL.md`.
- [x] OAuth consent project configured; Google API Services User Data Policy accepted; local-signing Android client and two test users configured; live consent and mailbox sync verified on the personal local-signed build.
- [x] 216 unit and 208 standalone native checks pass; 3 Android Gmail MIME/authentication/encrypted-account instrumentation checks pass.
- [x] Full browser regression: 162 Playwright journeys pass across phone/desktop sizes; TypeScript passes.
- [x] Rebuilt and replacement-installed personal diagnostic APK; versionName `0.2.0-beta.4`, versionCode 5.
- [x] Host/browser/native regressions: 216 unit, 208 parser, 162 browser, 3 Gmail Android and 3 model-download Android tests pass; production APK verifier passes.
- [x] New Google Cloud project `double-backup-512116-g5`; Gmail API enabled; OAuth branding created; owner and one additional account added as test users; Android OAuth client created for local release signing certificate; `gmail.readonly` configured. Google API Services User Data Policy accepted.
- [x] Build and replace-install personal beta.4 (versionCode 5); phone reports version 0.2.0-beta.4, install time 19 October 2026 22:44 local.
- [x] Live Gmail OAuth consent and one completed mailbox sync verified on the personal phone after the SHA-1 update; connection is active.
- [x] Add in-app privacy-safe diagnostic and synthetic regression for the provided ₹17,437 SBI debit alert; the known visible email format parses successfully. The report is ephemeral and excludes raw email content, IDs, addresses and references.
- [x] Rebuild and replacement-install the diagnostic APK on the personal phone; the Settings screen shows the new inspection control.
- [x] User ran the one-shot diagnostic; Gmail sync completed at 00:14 with 9 checked / 4 processed / 5 ignored.
- [x] Read the in-app diagnostic: the 10 Oct SBI debit alert (`alerts.sbi.co.in`) was found but rejected at the sender/DMARC trust check before parsing. The known ₹17,437 body format parses in the synthetic fixture. This narrows the likely defect to DMARC relaxed alignment for the SBI alert subdomain; confirm with the actual Gmail auth header after the fix.
- [x] Fix diagnostic report scrolling inside Settings by enabling nested scrolling and increasing the panel height.
- [x] Add DMARC relaxed-alignment handling for approved SBI subdomains with unrelated-domain rejection coverage.
- [x] Manual Gmail checks now replay the selected history window, allowing an alert skipped by an older parser to be recovered; saved alert identities remain idempotent. Routine background sync keeps its short overlap.
- [x] Gmail native instrumentation passes on Android 16 emulator (7 tests, including relaxed alignment and historical replay); TypeScript and 217 JS tests pass.
- [x] Build and verify beta.5 (versionCode 6); after the user approved uninstalling beta.4, install the local release APK directly and verify versionCode 6 / versionName beta.5. This reset the app’s on-device journal and Gmail authorization.
- [x] Update the Android OAuth client fingerprint to the installed local release certificate SHA-1 `D6:29:13:AE:BC:6C:5F:B1:65:03:F0:9F:36:AE:23:39:B8:13:DA:97`; allow for Google propagation delay.
- [x] Reconnect Gmail, run a manual mailbox check, and confirm the corrected ₹17,837 SBI debit is imported and reconciled into activity on the personal build.
- [x] Update public-facing policy text in the repository to remove stale “Gmail setup/consent pending” wording and document the implemented mailbox-wide read-only permission and local parsing.
- [ ] Publish the corrected privacy policy repository change; confirm the Play Console privacy-policy URL resolves to the updated text.
- [ ] Review Data safety answers against every actual outbound flow. Gmail message bodies are processed locally and are not an additional “Emails collected” item under Play's off-device collection definition; existing Brave/SDK/update disclosures remain separately in scope.
- [x] Build and verify closed-test beta.6 AAB (versionCode 7), including SMS permission-before-history import fix.
- [ ] Upload beta.6 to the existing closed-test track and roll it out after Play review. The internal-test v6 draft is separate and remains unpublished; configure the separate Play app-signing SHA-1 so Play-installed builds can use OAuth.
- [ ] Validate background/revocation behavior and configure the Android OAuth client with the Play app-signing SHA-1; complete Google restricted-scope verification before broad distribution.
