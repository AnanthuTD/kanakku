# Kanakku — product, experience, and build plan

Status: implementation in progress; bill capture and OTA source added. Combined-build and physical-device acceptance are tracked in the checklist.
Updated: 19 October 2026. Live implementation status is maintained in [CHECKLIST.md](CHECKLIST.md); exact artifact/revision evidence belongs in [the build manifest](artifacts/build-manifest.json).
Source: [Spend Aggregator — Project Spec](https://docs.google.com/document/d/14-naGduZZfzcmomNR4rfdh-PeIU-UJ-f/edit).

## Current execution and delivery order

Follow the prioritised queue in CHECKLIST.md, beginning with duplicate-SMS correctness and real spending totals. On 16 October, the user moved on-demand model delivery and a separate diagnostic test build ahead of the remaining bill/companion acceptance. Download models only on explicit request, show progress/recovery, verify integrity, retain compatible downloads across updates and keep basic SMS/manual review usable without them. Screenshots and recordings are allowed while the journal is open; biometric unlock and encrypted storage remain enabled. Complete tasks one at a time: implement, run relevant regressions, update the checklist, commit/push, then verify and install the matching personal APK on the connected phone. Preserve the personal signing identity, journal and settings; never clear/uninstall the personal app to work around an update failure. Native changes require a rebuilt APK. Record the exact source revision, package, signing certificate, APK hash and verified installation status for each delivered task.

Duplicate-alert matching reads all supported sender variants and prefers bank/account/reference/amount/direction identity. Only proven KGB supplementary balance templates may use unique event-time proximity (±1 minute), with receipt-time fallback for missing event metadata. Different references, multiple candidates, excluded targets and user decisions prevent automatic linking. Re-import may add missing parser event-time metadata without replacing corrections. No LLM decides financial duplicate exclusion.

## Product promise

Open Kanakku and understand your spending in seconds. Bank transaction alerts become an organized local ledger; unclear purchases take a few taps or a short spoken phrase to resolve.

First release: personal-use Android application, delivered as an installable APK. The journal needs no end-user account or finance backend. Optional app-update hosting uses the owner's Expo project. Capture covers supported transaction SMS; it cannot guarantee every payment when a bank sends no SMS. Show this coverage honestly.

## Experience direction

Selected direction: warm editorial design, with ivory backgrounds, ink text, deep forest green, muted category colors, generous spacing, and expressive headings. Design an equally considered dark theme. Use crisp sans-serif text and tabular numerals for amounts; reserve expressive type for sparse headlines.

- The primary visual anchor is the amount spent in the selected period.
- Charts explain a question and open the underlying transactions when tapped.
- Transactions use recognizable merchant initials/icons, merchant name, category, account suffix, date, and aligned amounts.
- Review prompts use neutral language: "What was this for?" No guilt, alarming red totals, or gamified spending judgments.
- Primary actions remain within comfortable thumb reach; bottom sheets handle brief tasks.
- Motion explains changes: short sheet transitions, restrained chart transitions, subtle confirmation haptics. Respect reduced-motion settings.
- Make information readable with large system text, TalkBack, adequate contrast, and at least 48 dp touch targets. Color never carries meaning alone.
- Use Indian number grouping and INR formatting throughout. Store money as integer paise.

## Brand and launch

The mark is a single leaf in a rounded forest tile. Its carved midrib reads as a pen stroke, joining growth and the written ledger (kanakku means accounts). One geometry source, `src/brand/mark.ts`, drives the in-app mark, launcher/adaptive/themed icons, favicon, native splash and notification glyph. `node scripts/render-brand.mjs` regenerates the PNG assets.

The verified Expo project is `@ananthutds-team/kanakku`. Its name is Kanakku and its dashboard project icon has been updated to the leaf branding.

A premium launch for Kanakku must meet all of these:

1. **Instant and branded.** The Android 12+ system splash shows the Kanakku tile on the first frame. No white flash, template art, spinner or progress bar.
2. **Theme-true.** Ivory/forest in light mode and charcoal/soft green in dark mode, for both the system splash and the window background behind it.
3. **Seamless hand-off.** The in-app splash starts on a frame identical to the native one (same tile, size and centre). The native splash hides only once that frame is drawn.
4. **One brand moment.** The leaf nods once and the Fraunces wordmark rises beneath it, then the frame dissolves into the app. No other decorative motion.
5. **Brief and never blocking.** The moment plays only after the journal has loaded and lasts under a second. If loading or unlocking takes more than 2.5 seconds, the app's own loading or lock state takes over.
6. **Private.** The splash shows no amounts, merchants or counts, and appears before any authentication.
7. **Accessible.** Reduced motion replaces the moment with a short fade. Screen readers skip the decorative splash, and touches are not trapped while it leaves.
8. **Crisp everywhere.** Assets are rendered from vector geometry at every density. The tile stays inside Android's circular splash-icon mask, and the adaptive leaf stays inside the 66/108 safe zone.

## Navigation and core screens

Three bottom tabs: Overview, Activity, Insights. Review is a prominent queue accessible from Overview and Activity. Accounts and Settings are secondary destinations.

The tab bar is a floating capsule above the gesture area. A solid forest pill slides to the selected tab and carries its label. Other tabs show only their icon, and screen readers still hear every tab name and its selected state. Changing tabs gives a selection haptic, and reduced motion moves the pill without a spring.

### Overview

1. Month/period selector and discreet privacy control.
2. Large spending total with an explicitly labeled same-period comparison when enough history exists.
3. Compact daily-spending chart with a tappable breakdown.
4. "3 payments need a category" review entry when needed.
5. Top categories and recent transactions.
6. Source coverage / last processed status accessible without dominating the screen.

Show "Spending captured from SMS" where necessary to prevent the total implying complete bank coverage. Never label SMS-derived account activity as a verified live balance.

### Activity

A chronological, date-grouped ledger with merchant search and combinable filters for date, category, account, transaction kind, and review status. Preserve filters and scroll position on return.

Transaction details show amount, merchant, time, payment method/account hint, classification basis, category, and personal note. Actions: recategorize, mark transfer/refund, exclude/include in spending, and undo. A correction changes only that transaction unless the user chooses a reusable merchant rule.

### Review

A focused one-transaction sheet shows merchant, amount, time, and account. Offer suggested category chips plus a prominent microphone and a text alternative.

Current flow: tap microphone → record a short English phrase → show editable note and proposed category → confirm → next item. Malayalam is deferred after model/runtime experiments; it remains a preferred future language pack. A one-tap category selection bypasses recording. Always allow skip and undo; retain skipped items in the queue.

For personal rules, ask in place: "Use Transport for this merchant next time?" Do not infer that all payments to a person have the same purpose. Rules are visible, editable, and removable. A masked destination account ending cannot identify a reusable payee rule. Protect confirmed payments and manual selections from later rule application or stale inference. Fast typing uses per-payment input seeds; voice deliberately reseeds only the independent note.

An optional grouped notification says that payments need review. A tap opens the sheet after unlock. Microphone access begins only after the user's action. Notification content hides financial details on the lock screen by default. Provide quiet hours and reminder controls; a queue remains useful even with notifications denied.

### Companion interaction

Accepted additions: a lively, draggable avatar asks for context immediately when a new purchase cannot be understood confidently. Inside Kanakku, show the companion and review sheet. When another app is open and the phone is unlocked, use an optional native floating avatar after “Display over other apps” permission. When locked, use a private notification. Without overlay permission, keep the notification and in-app queue available. An unlocked screen does not establish availability; allow dismiss/snooze, quiet hours and separate notification controls.

A tap on the avatar's voice or bill-photo action opens Kanakku and unlocks the journal if necessary before the chosen foreground action. Never auto-open the microphone/camera just because an SMS arrives. Show preparing, listening, understanding or reading-bill states. Stop/cancel delivery on background/close and discard stale answers. Extracted context remains editable and requires Save.

Animate blinking, curious tilts, listening and small confirmation reactions. Support dragging within the screen, edge snapping, remembered position, soft clicks and light haptics. Respect silent and reduced-motion settings. Celebrate organizing a payment; avoid rewards or judgments about how much the user spends. Historical imports feed the review queue without repeatedly interrupting the user.

### Bill photos

The in-app and floating companions offer a photo action alongside voice. A foreground Expo Camera screen captures an ephemeral cache photo after explicit permission/action; bundled on-device ML Kit Latin OCR reads it. A bounded deterministic parser proposes merchant/date, items, quantities, prices, totals, taxes and adjustments. The user can correct/add/remove rows, inspect mismatches and explicitly use the bill merchant.

Bill details and voice/text notes remain independent. Only the explicit “Suggest category from bill and note” action combines their context; a suggestion does not save itself. Never change the SMS amount or transaction date from OCR. Explicit Save stores the normalized receipt observation as encrypted JSON on that transaction. Raw OCR text and bill images are not uploaded or saved to the journal; normal success/cancel/error cleanup deletes the temporary photo. Cancelled/background/stale results cannot update another payment.

Current OCR scope is printed Latin-script bills. Malayalam-script, handwriting, poor images, varied layouts, process-kill leftovers and physical camera accuracy remain acceptance work. Keep manual entry available when permission, capture, OCR or parsing fails.

### Insights

Start with useful, traceable answers: category totals, merchant totals, period trends, account breakdowns, and comparisons across equivalent periods. Each number opens its contributing transactions.

Provide question shortcuts such as "Food over the last two months" backed by deterministic queries. Introduce free-text questions only for supported intents, with explicit period/category interpretation and clarification for ambiguity. Models never calculate financial totals.

### Onboarding and supporting states

Explain local processing before requesting SMS access. Offer a clearly labeled sample-data preview. Ask for the historical SMS period before the first import: 1 month, 3 months, 4 months, 6 months, 1 year, or all available history, with Skip for now. Show the exact date range and never scan beyond the selected window. Ask separately for notifications, microphone and camera at the point of use. New SMS capture is an independent setting.

Load the most recent 7 days of the selected range first, then backfill the rest from newest to oldest in durable Android background work. For a 4-month selection, recent transactions become usable before older history finishes. Persist checkpoints and resume safely after process death; repeated imports preserve corrections and deduplicate events. Historical uncertain payments accumulate in review rather than triggering individual avatar interruptions.

Show a compact progress banner at the top of the app and a private Android progress notification, inspired by WhatsApp backup restore. Include the selected range, phase, percentage once the total is known, messages checked, and eligible alerts found. Mark financial totals as partial until processing finishes. Offer pause/resume, a new range after pausing, permission recovery, waiting state when Android defers work, and a clear completion state. Import must work when notification permission is denied. With a locked vault, keep encrypted events staged and clearly distinguish scan completion from ledger loading after unlock.

Show a useful result summary: transactions found, sources recognized, items needing review. Make repeat imports safe. Support partial permission denial, empty history, unsupported messages, interrupted import, unavailable model, failed transcription, key invalidation, and offline use. Never leave users on an indefinite spinner.

## Subscription and recurring-payment detection

This scope was explicitly added by the user. Detect monthly/weekly/yearly patterns locally from reviewed purchases with sufficient repeated evidence, stable account attribution and comparable amounts. Handle duplicate references, refunds, exclusions and insufficient history conservatively. Brand names alone do not establish a subscription; distinguish subscription patterns, recurring bills and general recurring spending.

Show the recorded charges, amount range, confidence/evidence and estimated next date, clearly separated from a verified due date or active-service claim. Users confirm, ignore or restore a pattern. These decisions are stored in the encrypted ledger metadata and never change money, transaction categories or payment execution. Current grouping uses exact normalized merchant + bank + account; broader alias and real price-change coverage remain beta acceptance work.

## Correctness rules

- Separate purchases, income, refunds, internal transfers, cash withdrawals, and credit-card repayments. Category and transaction kind are different fields.
- Card purchases count toward spend; paying the card bill must not count again.
- Preserve original events and provenance so deduplication and user corrections are explainable.
- Use ingestion/reference identifiers when available. Cross-alert linking requires parser-proven supplementary provenance and exactly one eligible referenced counterpart with the same bank/account/direction/amount in the bounded window, without competing supplementary alerts. Equal amounts/timestamps or unknown legacy provenance are insufficient.
- Record ambiguous matches for review. Never merge distinct payments silently on weak evidence.
- Refunds affect clearly labeled net spending; partial refunds and reversals need fixtures and tests.
- Keep uncertain purchases visible in an Uncategorized/review bucket. Account-only payees are explicitly held outside spending until context is confirmed; show this held coverage rather than guessing a purpose. Tapping that amount opens only its contributing unresolved account-payee purchases. Starting review from filtered Activity visits only the matching review payments. Exclude confirmed internal transfers.
- Mask account identifiers and retain only necessary suffixes. Account/source attribution belongs in the first data model.
- Retain classifier version, confidence, and reason (personal rule, merchant match, model, or user correction).

The stricter duplicate policy does not silently undo existing linked/excluded rows. Legacy exclusions require explicit inspection/correction; a policy update is not permission to rewrite historical user decisions.

## Architecture

Expo 57 / React Native 0.86 / TypeScript with a native build. Expo Router, Reanimated, Gorhom sheets and FlashList share reusable typography, spacing, color and motion components. `package-lock.json` fixes the installed dependencies.

Native Kotlin Expo module owns SMS permission handling, multipart-message assembly, sender/body filtering, parsing, durable capture, and scheduling. Capture must work without a mounted React Native screen. Use WorkManager for deferrable processing where suitable; test device-specific background behavior.

Pipeline:

SMS → filter and reject OTP/non-transaction content → parse minimal transaction event → durable encrypted inbox → normalize/dedupe → classify → encrypted ledger → UI and deterministic insight queries.

Sender IDs are a useful filter, not an authentication boundary. Banks can use the same sender for OTPs and transactions. Explicitly reject OTP/authentication content and never persist or log raw SMS, including crash reports and debug output.

Core entities: ingestion events, transactions, accounts, categories, merchant aliases, personal rules, review decisions, and import checkpoints. Maintain schema migrations and idempotent ingestion keys.

### Storage and lock behavior

Implement encryption before ingesting real messages. Use SQLCipher for the main ledger, with a random database key wrapped using Android Keystore. Hardware backing is capability-dependent and must be detected rather than promised.

Preserve the biometric/device-credential gate for ledger access. The sealed inbox encrypts minimal background events with a public key and per-event authenticated encryption; the private key needed to unwrap events is authentication-gated. Import those events into the ledger on unlock, without leaving it open for capture. Selected synthetic PIN/restart/storage paths have evidence; physical provider support, reboot, biometric changes and key invalidation still require acceptance.

If the chosen device cannot support the proposed key flow reliably, explicitly revisit the tradeoff between background-accessible encryption keys plus a UI app lock and authentication-gated storage. Do not silently weaken the latter. Pending events may remain unclassified until unlock; notifications should reflect that state.

Exclude sensitive local data from unprotected Android backups. Define recovery and deletion behavior before real use. A compromised application with SMS permission is not guaranteed to be unable to observe OTPs; filtering minimizes retained data, not the permission's power.

### Categorization and voice

Use personal overrides → known merchant mappings → optional downloaded quantized all-MiniLM-L6-v2 ONNX category suggestion → review queue. Jeff and Gemini are not integrated. Similarity is not a calibrated probability; deterministic mixed-purpose guards abstain, and real merchant precision/review burden still need held-out evaluation.

The current language is **English only**, using **Whisper base.en Q5_1** through Kanakku's custom JNI bridge to vendored whisper.cpp. Audio stays in native memory and only text reaches JavaScript. Development observations on the physical `24053PY09I` phone found better output from direct whisper.cpp than the earlier whisper.rn path on the same audio. The model catalog records roughly 4.5 seconds per tested base.en clip with four CPU threads. These are development observations, not a formal acceptance benchmark for the current app/runtime or other devices.

Malayalam remains preferred but is not supported by the current English model. Earlier multilingual tiny generated stock filler, base retained partial meaning and small preserved more meaning but took about 31 seconds for an 11.6-second phone clip. tiny.en was faster but missed Indian-English names; it is not the selected bundle. Those comparisons motivate the current base.en choice and future Malayalam work, not a claim of production accuracy.

Record foreground-only mono 16 kHz audio, capped at 15 seconds, with adaptive silence completion and an explicit Finish action. Apply a short local merchant vocabulary hint, bounded quiet-signal amplification and trailing-noise trimming. Reject stock silence/noise captions; provide an editable transcript and category before Save. Cancel on background/close, discard late answers and release inference resources. No cloud speech fallback or personal-build audio files. The isolated test build has a separate opt-in, removable three-clip diagnosis exception.

The runtime checks ARMv8.2 fp16/dot-product support and retains typing on unsupported processors. Keep microphone quality, silence/noise behavior, Indian-English names, cancellation and latency acceptance open until measured on representative current builds. Earlier failed whisper.rn acoustic reports are retained evidence of failures, not proof that the replacement JNI path passes.

`scripts/voice-models.json` pins model revisions, sizes and SHA-256. `npm run voice:model -- <id>` verifies and replaces the asset, updates `src/native/voiceModel.json` and regenerates provenance; rebuild afterward. Models remain uncompressed in the APK and are hash-verified before loading from private no-backup storage. `npm run voice:model -- --list` shows candidates and evaluation notes. Do not copy an old model filename/hash into build instructions.

### Future: installable language packs (not current scope)

Malayalam is the first candidate pack: small-model development observations preserved more meaning, but latency and representative accuracy need improvement and validation. Users who need Malayalam, Hindi or another Indian language should eventually be able to add it after installing Kanakku, instead of every user carrying every model:

- Keep an English-capable baseline, and offer optional language packs in Settings › Voice languages, each with its size, licence and a clear download/remove control.
- Download only after an explicit tap, over HTTPS, from a pinned source; verify size and SHA-256 before use; store under app-private storage; never block typing or categories while a pack is missing or downloading.
- A pack is a speech model (a larger multilingual Whisper or a language-tuned Whisper/IndicConformer model) plus metadata: languages, translation ability and minimum RAM. The app routes speech to the pack the user selected or, if unknown, to automatic detection among installed packs.
- Each pack ships only after the same frozen-fixture evaluation used here, on a phone, with its accuracy and latency documented. No audio leaves the device; the only network step is the user-initiated model download.
- Until then, model changes happen at build time with `npm run voice:model`.

### Optional web merchant/VPA evidence

Offline rules/classification remain first. Brave BYOK is Keystore-encrypted and off by default. Automatic lookup accepts only exact public brands; unknown businesses require a reviewed public-name query. A separate one-address VPA flow explicitly discloses that the complete UPI ID reaches Brave and requires fresh per-address consent. Editing/reopening clears consent. There are no automatic VPA lookups or transmissions of SMS, amounts, bank/account, notes or other payment IDs.

Work is serial, foreground-only, bounded and cancellable. Sources distinguish exact address mentions from merely related results; neither proves a payment recipient's identity. Results are transient display evidence, not a reusable merchant cache or automatic ledger/rule update. The live Android public-business VPA experiment reached results but found no public match, so merchant identification remains unverified; see [its recorded outcome](artifacts/native-vpa-live-results.json). Provider/privacy details and unimplemented Gemini grounding requirements are in [MERCHANT_LOOKUP.md](src/services/MERCHANT_LOOKUP.md).

### Over-the-air updates

Expo EAS Update is linked to the verified `@ananthutds-team/kanakku` project in `eas-project.json`. Owner-approved browser CLI authorization and separate **e2e**/**personal-beta** channels/branches are set up. No update was published by this setup.

The app checks for compatible updates at launch and downloads them automatically in the background. It never reloads on its own: Settings shows readiness and the user confirms when to restart. Recheck active-session/save/voice/receipt guards immediately before reload. Offline/error states keep the installed version usable; a downloaded update can apply on the next full app start.

Fingerprint runtime compatibility separates native changes from compatible JavaScript improvements. Camera/OCR/update libraries, native code, permissions, bundled model/runtime or signing/config changes require a new APK. Old APKs without the update library need an in-place update signed with the existing certificate first. EAS build profiles use local credentials; no new Android keystore is generated for OTA setup. Real published download/apply/restart, runtime/channel isolation and rollback are acceptance tasks in [OTA.md](docs/OTA.md).

## Delivery sequence and acceptance

### 1. Experience prototype and native feasibility

Produce the design tokens, representative Overview/Activity/Review screens, onboarding, and empty/error states with realistic labeled sample data. In parallel within the work sequence, prove SMS reception/persistence, the locked-device key flow, and candidate inference on the target phone. This is a feasibility milestone, not a production release.

Exit: the main user journey is reviewable on a phone; the native risks have measured results and an agreed technical route. Set actual latency/memory budgets from this baseline.

### 2. Trustworthy ledger

Implement supported bank parsers, historical import, native receipt, encryption, account attribution, deduplication, transaction-kind handling, migrations, and deterministic totals. Connect the Activity and Overview screens to persisted data.

Exit: supported fixture messages and replay/import scenarios produce correct totals; ignored messages leave no persisted content; repeated imports and duplicate delivery do not inflate spend. Clearly report unsupported coverage.

### 3. Categorization and review

Integrate the validated on-device classifier, merchant mappings, confidence routing, editable personal rules, and complete review/correction/undo flow. Ensure the interface remains responsive during inference.

Exit: measured classification precision/coverage on held-out examples, durable corrections after restart, and one-tap category correction. Ambiguous events remain visible.

### 4. Voice and insights

Integrate offline transcription, editable transcript, context-aware tagging, grouped notifications, period/category/account insights, and supported query shortcuts.

Exit: representative phrases work on the target phone; transcription failures have a text fallback; every displayed total can be traced to ledger rows.

### 5. Polish and personal beta

Complete dark theme, accessibility, haptics, reduced motion, large datasets, interrupted operations, offline/model-unavailable states, and permission recovery. Test foreground/background/process death/reboot/force-stop behavior on a physical device. Backfill missed eligible SMS when access permits; do not promise receipt during Android force-stop.

Deliver a signed personal-test APK with installation instructions and a short coverage/limitations note. Use a real-world personal beta to evaluate battery, parser coverage, false positives, review burden, and trust in totals.

## Validation strategy

- Unit tests for money arithmetic, parsers, OTP rejection, dedupe, refunds, card payments, transfers, confidence routing, and supported insight queries.
- Integration tests for encrypted persistence, migration, interrupted/repeated imports, replay, correction, and key/lock lifecycle.
- Native device tests for reception with the UI closed, unlock/reboot recovery, permissions denied/revoked, microphone denial, and model failures.
- Visual review of every core screen in light/dark modes, compact/tall screens, large fonts, empty/loading/error states, and TalkBack navigation.
- Performance measurements for cold launch, scrolling through thousands of transactions, voice latency, inference memory, and background battery use. Treat any proposed targets as goals until measured.

## Deferred scope

Cloud sync, bank credential linking, payments, budgets/coaching, shared households, and general-purpose chat. Public Play Store distribution follows the personal beta and requires the SMS permission declaration/review process.

## Inputs still useful

- Visual direction selected: warm ivory/forest green with a charcoal/soft green dark theme.
- Android phone/model/OS and primary banks/cards.
- Current voice language: English. Malayalam remains preferred future work; representative English notes and future Malayalam examples remain useful.
- Redacted example alerts when parser work begins, covering purchases, transfers, refunds, card repayments, and confusing non-transaction messages.

## Current implementation and evidence — 15 October 2026

The journal/import/review/insight/subscription/companion flows are implemented, with current work adding bill capture and guarded OTA support. Root verification is rebuilding the combined Android source. Use [CHECKLIST.md](CHECKLIST.md), [build-manifest.json](artifacts/build-manifest.json) and [verification-summary.md](artifacts/verification-summary.md) for exact statuses, artifact hashes, counts and tested revisions. Source implementation does not establish that an older APK contains the change.

Earlier controlled emulator evidence covers recent-first import/replay, keyed SQLCipher persistence, PIN-gated restart, secure-window lifecycle, sample UI saved state and encrypted provider-key lifecycle. It caught unkeyed SQLCipher transaction connections and UI work running off Android's main thread; both were corrected. Dedicated `Kanakku_API_36` tests use only the isolated E2E package and synthetic data. Reduced-motion UI results do not establish normal-motion avatar behavior.

Host regressions cover deterministic money/parser/refund handling, conservative duplicate linking and safe payee rules, recurring-pattern edge cases, SQLite persistence/migrations, category abstention, keyboard/focus/typing and supported insights. Model observations, host mocks and synthetic fixtures remain distinct from real speech, physical security and real-bank coverage. Professional Expo project branding/configuration is verified; OTA delivery and bill-camera recognition need their own installed-build checks.

Remaining acceptance includes real card/bank variants, legacy duplicate review, biometric/key changes, locked capture/reboot/permissions, overlay/camera/voice behavior, large-history performance, battery policy, TalkBack/large fonts, held-out category accuracy and real OTA delivery/rollback. The full plan is not yet accepted as complete.

## Technical references

- [Expo custom native code](https://docs.expo.dev/workflow/customizing/) and [SQLCipher configuration](https://docs.expo.dev/versions/latest/sdk/sqlite/).
- [Expo Camera](https://docs.expo.dev/versions/latest/sdk/camera/) and [ML Kit on-device text recognition](https://developers.google.com/ml-kit/vision/text-recognition/v2/android).
- [Expo Updates](https://docs.expo.dev/versions/latest/sdk/updates/) and [native runtime compatibility](https://docs.expo.dev/eas-update/runtime-versions/).
- [Android activity security](https://developer.android.com/guide/components/activities/secure-bal) and [Android Keystore](https://developer.android.com/privacy-and-security/keystore).
- [whisper.cpp](https://github.com/ggml-org/whisper.cpp) and [Whisper model/license information](https://github.com/openai/whisper); installed provenance remains beside the bundled assets.
- [Google Play SMS policy](https://support.google.com/googleplay/android-developer/answer/10208820?hl=en); public store distribution remains outside current beta acceptance.

## Optional models (16 October implementation)

The base APK contains runtime libraries, deterministic SMS rules, vocabulary/prototypes, model metadata and licenses. Settings exposes separate optional downloads for Whisper English voice and MiniLM category suggestions. These are pinned model files, not executable libraries. Explicit WorkManager HTTPS delivery uses immutable Hugging Face revisions so both Play and direct APK installs work without an app backend. Size/SHA-256 checks precede atomic private installation; cancelled/stale work cannot publish a model. Requested work can continue in background; interrupted files can resume where the host supports ranges, or restart safely otherwise. Compatible APK/OTA updates reuse files. Removal affects model files only.

Missing voice gives download guidance before recording, and missing MiniLM falls back to deterministic rules/review. Neither path silently downloads. Settings shows sizes, progress, checking integrity, waiting/error states, cancellation/retry and confirmed removal. Download-host metadata is disclosed in the privacy policy. Play Asset Delivery remains a store-specific follow-up; it is not required for this HTTPS implementation. The production app keeps screen/authentication protections.

## Optional Gmail transaction capture

At the user's request, add on-device Gmail read-only authorization for supported authenticated SBI debit-card table alerts and SBI Card purchase sentences. Ask explicitly for mailbox-wide read permission and a 1/3/6/12-month history window, independently of SMS access. Use bounded, resumable WorkManager checks (15-minute minimum scheduling interval, best effort), manual refresh, visible progress, reconnect and disconnect. No backend or instant-delivery claim. Keep OAuth tokens native and transient; encrypt the selected account and seal only structured payment fields. Do not fetch attachments or save raw email bodies. Validate Google's authentication header and sender/subject/template before importing.

Preserve source observations. Only unique reference/account/issuer/value/currency matches automatically link unchanged observations; weaker cross-source matches require explicit same/separate review. Date-only card emails remain day precision. Keep original foreign currency; require a user-confirmed final INR settlement before including it in INR totals. A new Google Cloud project and Android signing-specific OAuth clients are required; live consent, provider verification and actual account acceptance remain separate completion gates. See docs/GMAIL.md.
