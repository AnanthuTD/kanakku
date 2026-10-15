# Kanakku implementation checklist

Updated: 15 October 2026. Plan: [PLAN.md](PLAN.md).

Checked boxes mean the named implementation or check is complete. Device acceptance is tracked separately; a successful APK build is not a device test.

## Current work — review, updates and receipt photos (15 October)

- [x] Review other agent’s native voice, payee, duplicate, overlay and documentation changes
- [x] Fix review findings around duplicate provenance, masked account rules, avatar confirmation, voice session ownership and diagnostics; targeted host checks pass (combined device regression pending)
- [x] Expo EAS Update integration: manual check/download/restart with activity guards; Settings card verified on the phone
- [x] OTA runtime version made deterministic: the build profile is persisted to `kanakku-profile.json` (Gradle's fingerprint step ran without the env var and built the test APK with the personal runtime), and the in-tree compiled expo-updates Gradle plugin is ignored (its lock/history files changed the hash on every run). Shell and Gradle now agree (`d9e9788a…`); project initialised in git, which the fingerprint tool also needs to honour `.gitignore`
- [x] Live delivery proven on the phone (15 Oct, 14:18): published update group 1c5bc73e to `e2e` (runtime `d9e9788a…`, equal to the installed APK), test app found it, downloaded it, restarted on confirmation and now reports "Downloaded update" instead of "APK version"; personal app untouched
- [x] Implement on-device OCR/parser and temporary-photo cancellation/cleanup; 30 focused host checks pass
- [ ] **In progress:** integrate editable structured bill receipt with an existing payment and voice context
- [x] Bill-photo actions in the in-app and native floating companion; native camera opens only inside the foreground app
- [ ] **In progress:** preserve an unsaved native-avatar voice answer when opening Edit or Photo
- [x] Install official Expo plugins for Codex and Claude Code; verified enabled/installed locally
- [x] Replace default Expo project icon with the existing Kanakku leaf mark; verified saved in Chrome
- [x] 187 unit checks, 6 dependency checks and 134 standalone Kotlin checks pass
- [ ] **In progress:** Android release build and real OCR instrumentation on the isolated emulator
- [ ] **In progress:** browser regression fixes after first run (147/150 pass); receipt journeys all pass; companion width caused control overlap
- [x] Link verified EAS project, authenticate owner access and create isolated personal-beta/e2e channels and branches
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
- [x] Personal APK rebuilt and verified (com.kanakku.app, 197.4 MiB, SHA-256 fcdc6106…acc6) with the companion redesign, empty journal, diagnostics, bank-header fixes, duplicate-alert linking, held account payments, microphone prompts and FlashList 2.3.3; installed on the 24053PY09I phone and the start entry confirmed in the log
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
