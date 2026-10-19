# Kanakku project instructions

Read [PLAN.md](PLAN.md), [CHECKLIST.md](CHECKLIST.md), and [README.md](README.md) before extending the app. Keep them current when behavior or acceptance status changes. User requests take precedence over this file. Do not require extra approval for ordinary reversible implementation work.

## Product and stack

Personal Android SMS spend journal. Expo 57 / React Native 0.86 / TypeScript, Expo Router, Reanimated, custom SVG/Canvas companion, Gorhom sheets and FlashList. Premium ivory/forest light theme and charcoal/soft-green dark theme. Voice is English through optionally downloaded Whisper base.en Q5_1 and Kanakku's JNI bridge to vendored whisper.cpp; whisper.rn is no longer used. Malayalam is deferred to future language packs. MiniLM suggests categories from editable context; Jeff and Gemini are not integrated. Rive is optional for a future designer-authored animation rig.

The browser uses labeled sample data. SMS, SQLCipher/Keystore, real voice, camera/OCR, overlays, provider credentials and OTA delivery require the Android build. Never fake native success in the preview. Expo may replay lifecycle callbacks while initializing bindings on the JS thread: marshal Window/overlay view work onto Android's main thread and guard stale activities. Native code lives in `modules/kanakku-native`; generated `android/` is ignored and may be recreated by prebuild. Maintain durable configuration in `app.json`, `app.config.js` and `plugins/withKanakku.js`.

## Correctness and privacy

- Money is integer paise. Deterministic ledger queries calculate all totals. Refunds subtract; income, transfers, cash, repayments and excluded items do not inflate spend. Category and transaction kind are separate.
- Preserve originals, references, classifier provenance and user corrections. Replay/import deduplicates by ingestion identity. Cross-alert linking additionally requires parser-proven KGB supplementary status, one unique non-excluded/unlinked referenced match and no competing supplementary row. Prefer bank-stated event times within one minute; use a five-minute SMS receipt window only when event time is missing. Re-import may fill a missing event timestamp while preserving all user edits and prior duplicate decisions. Do not generalise this rule to other issuers without paired-format evidence. Equal amounts/times alone, unknown legacy provenance and masked account suffixes cannot justify merging or reusable payee rules. Do not silently undo legacy linked/excluded rows or change already user-confirmed payments.
- Reject OTP/authentication/unrelated messages before persistence/inference. Never log raw SMS, full account identifiers, audio, bill images/text or API keys. Do not persist raw SMS/audio; provider keys use only their Keystore-encrypted store. Audio is held briefly in native memory and recording begins only after the user's action. Sole audio exception, at the user's request: the isolated `app.tinkerbox.kanakku.e2e` build has an opt-in Settings switch that keeps the last three raw clips and the app's text for each for recognition diagnosis; turning it off deletes them, and the personal app cannot enable it. Cancel on background/close and discard late voice answers.
- Real ledger/rules/recurring decisions use SQLCipher, gated keys and a sealed background inbox. Background capture seals minimal data before model inference. Never silently downgrade storage or replace an inaccessible key. Device security/backing is capability-dependent.
- Recurring patterns are local evidence-based suggestions, not proof of subscription enrolment or verified due dates. Confirm/ignore changes labels only. Decisions belong in encrypted `ledger_meta`; sample equivalents may use demo storage. Handle refunds, duplicate references, account separation and insufficient history conservatively.
- Merchant lookup is disabled by default. Brave BYOK is encrypted with Android Keystore; no common key in bundles/environment/AsyncStorage. Automatic queries accept an exact public-brand allowlist; unknown public businesses require query review. A separate VPA flow may send exactly one full UPI address only after per-address disclosure/consent; editing/reopening revokes it. Never automatically search VPAs or send SMS, amounts, accounts, banks, notes or other payment IDs. Related search results do not identify a merchant; an exact address mention is evidence, not proof of ownership. Never let web evidence mutate a ledger or learn rules automatically.
- Lookup is foreground, bounded, serial and cancellable. Recheck consent/quotas/current transaction before dispatch and display; use lookup generation/request identity to suppress stale results. Only in-flight requests are coalesced. Completed evidence is short-lived display state, never a reusable merchant cache or database. Review [merchant lookup notes](src/services/MERCHANT_LOOKUP.md) before changing provider behavior; recheck official pricing, privacy and storage/display terms.
- Cloud sync, payments/bank logins and public store distribution remain outside current scope. Subscription detection and optional web lookup have been moved into active implementation at the user's request.

## Experience requirements

Preserve Activity filters/scroll on return. Every insight total must open contributing rows and label its period/coverage. Review supports editable merchant/note/category, skip, save-next, explicit remember and undo. Historical uncertain imports feed a queue without per-alert interruption. New unclear events use in-app companion, optional unlocked overlay, or private locked notification. Never assume an unlocked display means the user is available.

Companion drag must not trigger voice; keep it within safe bounds, remember edge/fraction, provide accessible reset/dismiss, and respect silent/reduced-motion settings. Quiet hours and reminders remain optional. Voice/provider failures retain typing/category alternatives. Avoid spending judgments and rewards for purchases.

Voice records foreground-only mono 16 kHz into native memory, with a 15-second cap, adaptive silence completion and explicit Finish. The selected model's metadata in `src/native/voiceModel.json` drives language wording and APK verification; `npm run voice:model` changes the selected model metadata only after hash verification and requires rebuilding. The current runtime requires ARMv8.2 fp16/dot-product support and must retain typing on unsupported processors. Physical development observations were roughly 4.5 seconds for base.en clips with four threads; earlier small multilingual decoding took about 31 seconds for an 11.6-second clip. Those catalog notes and earlier failed whisper.rn acoustic runs are not formal acceptance of current microphone accuracy, Malayalam or current-build latency.

Bill capture uses a foreground Expo Camera modal and bundled native ML Kit Latin OCR. Camera/voice are separate avatar actions and require explicit taps after unlock. Keep recognition bounded and discard stale/background/cancelled results. OCR creates an editable receipt observation: merchant/date/items/quantities/prices/taxes/adjustments with reconciliation warnings. It must not overwrite the independent voice/text note or SMS amount/date. Use bill-and-note category context only after the explicit suggestion action; preserve manual choices against late inference. Save confirms normalized receipt JSON inside SQLCipher. Do not persist/upload raw OCR text or bill images; delete temporary cache photos through normal success/cancel/error cleanup. Do not claim process-kill cleanup, Malayalam-script/handwritten recognition or physical OCR quality without tests.

OTA uses the verified `@ananthutds-team/kanakku` Expo project in `eas-project.json`, with separate `e2e` and `personal-beta` channels. The Expo dashboard name is Kanakku and its project icon uses the leaf branding. Manual check/download/confirmed restart must never interrupt edits, journal writes, recording or receipt capture. Recheck the latest active-session guard at confirmation and reload. `runtimeVersion: fingerprint` protects native compatibility; native libraries, permissions, model/runtime changes and update setup itself require a new APK. Preserve the installed signing identity; `eas.json` uses local credentials and `credentials.json` is ignored. Do not publish updates/builds or create new signing credentials as a side effect of ordinary tests. See [OTA instructions](docs/OTA.md); channel setup is verified, actual published-update delivery remains unverified.

Initial SMS setup asks for a calendar history window (1/3/4/6 months, year, all, skip). Process recent seven days first, then older history in WorkManager. Keep frozen range/checkpoints, top/private-notification progress, partial totals, pause/resume and missed-SMS reconciliation inside the chosen floor. Do not promise receipt while Android force-stops the app.

## Regression and delivery

```sh
npm ci
npx playwright install chromium
npm run test:regression
```

Node 24 supports the SQLite host tests. JDK 17 and Kotlin 2.2.20+ on PATH support the standalone native checks, also included in `test:regression`. Playwright runs a fresh production Expo web export on an isolated local server, in phone/desktop browser sizes with independent sample fixtures and fixed calendar date. Tests assert visible results and saved state, use roles/stable IDs, and fail on runtime errors. Do not mask failures with sleeps, retries, weakened totals or component mocks. Record actual combined results and revisions in [verification summary](artifacts/verification-summary.md), [build manifest](artifacts/build-manifest.json) and CHECKLIST; do not carry stale counts or hashes into prose while a rebuild is pending. Review inputs use per-payment default-value seeds to avoid dropped typing through delayed portal commits; external voice updates reseed the note explicitly. Inference must respect dismissal, selection and Save generation boundaries. Add the user journey that would catch each behavior regression. Trace/screenshots/video are retained on failures.

See [E2E instructions](tests/e2e/README.md) and [Android cases](tests/android/ACCEPTANCE.md). Host SQLite tests do not prove Android encryption; browser emulation does not prove SMS, voice, WorkManager or overlays. Build success is not phone acceptance. Keep unverified items unchecked. SQLCipher keys belong to a connection: repository writes use BEGIN IMMEDIATE/COMMIT/ROLLBACK on the existing keyed connection under serial(). Expo withExclusiveTransactionAsync creates a fresh unkeyed connection and must not be used for this ledger.

Maestro smoke flows target the isolated `app.tinkerbox.kanakku.e2e` package and clear only that test app. Never point clear-state flows at the personal package. `KANAKKU_BUILD_PROFILE=e2e` selects test metadata; ordinary prebuild restores personal metadata before building/distributing its APK. Do not overwrite the personal APK with a test-package build.

Use JDK 17 / Android SDK 36 for builds. Public releases are built and release-signed by `.github/workflows/release.yml` on a `v*` tag (see RELEASE.md); local builds keep the development key unless the `KANAKKU_RELEASE_*` variables are set. Never commit a keystore or password. Artifacts target arm64 Android 12+. Verify signature, package, ABI, exclusion of model weights and the pinned download catalog after rebuilding. Maintain installed model provenance/licenses. Do not claim every Indian bank/card format is supported without real fixture evidence.

## Collaboration

When the user requests parallel agents, assign independent file ownership and integrate/test their combined results. Agents share the filesystem. Coordinate shared Context/native bindings and avoid simultaneous full exports/Gradle builds. Never discard another agent's or user's edits. Document final behavior, not abandoned approaches.

## Manual operations

Everything below can be run by hand from the project root in a terminal. Replace `SERIAL` with the phone's ADB serial from `adb devices` (for example `192.168.1.5:35819`). When the same phone is listed twice, pick one and always pass `-s SERIAL` / `--device SERIAL`.

### One-time computer setup (macOS)

```sh
brew install node@24 openjdk@17 android-commandlinetools ffmpeg
sdkmanager "platform-tools" "platforms;android-36" "build-tools;36.0.0"
sdkmanager --licenses
curl -Ls "https://get.maestro.mobile.dev" | bash   # Maestro CLI in ~/.maestro/bin
npm ci
npx playwright install chromium
```

Each new terminal that builds Android or runs Maestro needs:

```sh
export JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home
export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
export PATH="$JAVA_HOME/bin:$HOME/.maestro/bin:$PATH"
export MAESTRO_CLI_NO_ANALYTICS=1
```

### Reusable emulator

The dedicated Android 16/API 36 Google APIs ARM64 AVD is `Kanakku_API_36`, serial `emulator-5580` (2 GB RAM, two CPUs). It contains synthetic test data only. On this Apple Silicon host:

```sh
npm run emulator:setup
npm run emulator:start -- --show
# Build/copy the current isolated E2E APK using the instructions below first.
npm run test:android:emulator
# Saved-state journeys under the Android reduced-motion condition:
npm run test:android:emulator -- --reduced-motion
# Recheck only a changed flow; the runner keeps package/AVD guards:
npm run test:android:emulator -- --reduced-motion --flow mixed-note-review
npm run emulator:stop
```

The emulator script refuses a different AVD on its reserved serial, verifies the isolated APK before installation and saves timestamped Maestro reports. Without `--show`, it runs without a window; restart to change that. Android Studio's visual device manager is optional. The dedicated AVD uses ordinary keyboard input with stylus handwriting disabled to keep Gboard onboarding from intercepting tests. Do not run competing emulator UI/state tests concurrently. Rebuild after source changes; running the test command alone does not refresh the APK. Keep physical device acceptance separate from synthetic emulator results.

Controlled SMS pipeline and provider-credential storage checks run separately on this same dedicated AVD:

```sh
npm run test:android:pipeline
npm run test:android:credentials
```

Read `tests/android/pipeline/README.md` and `tests/android/credentials/README.md` first. These root-capable synthetic harnesses verify the installed APK hash and isolated package. Credential tests use invalid placeholders, keep lookup disabled and make no searches. Never substitute a real key or run competing device tests concurrently. Sample UI assertions verify actual filtered input, durable state and process restart; do not rely on brief Saved notices. The optional reduced-motion test flag records and restores transition settings; do not claim its saved-state result proves normal-motion avatar behavior.

### One-time phone setup

1. Settings › About phone › tap the OS version (on Xiaomi/HyperOS, "OS version"; on Pixel, "Build number") seven times until "You are now a developer".
2. Settings › Additional settings › Developer options (Pixel: Settings › System › Developer options), turn on:
   - **USB debugging** — required for any ADB connection.
   - **Wireless debugging** — required for Wi-Fi ADB. Accept "Allow on this network".
   - **Install via USB** (Xiaomi) — lets `adb install` add the APK. Approve each install prompt on the phone.
   - **USB debugging (Security settings)** (Xiaomi) — lets ADB grant/deny permissions and clear app data. Without it Maestro fails with `CLEAR_APP_USER_DATA` denied. Xiaomi requires a SIM card and a signed-in Xiaomi account to enable it.
   - Optional: **Stay awake** while charging, so test runs are not interrupted by the lock screen.
3. Keep the phone unlocked, on the same Wi-Fi as the computer (not a guest network with client isolation), and do not use it while a Maestro run or screen recording is in progress. Before taking a screenshot or recording, check `adb -s SERIAL shell dumpsys window | grep mCurrentFocus` shows a Kanakku package, so another app's private screen is never captured.

### Wireless ADB pairing with a QR code

```sh
npm run adb:pair
```

The script prints a QR code in the terminal (enlarge the window if the code is cut off) and waits two minutes. On the phone open Developer options › Wireless debugging › **Pair device with QR code**; the camera scanner opens, so point it at the terminal QR. The script finds the phone over mDNS, runs `adb pair`, then `adb connect`, and prints `adb devices -l`. If nothing is found, run `adb mdns check` and confirm both devices share the network.

Pairing-code alternative: Wireless debugging › **Pair device with pairing code** shows an IP:port and a six-digit code.

```sh
adb pair PHONE_IP:PAIRING_PORT        # enter the six-digit code when asked
adb connect PHONE_IP:CONNECT_PORT     # the IP:port shown at the top of Wireless debugging
```

Pairing is remembered, but the connect port changes after Wi-Fi changes, reboot or toggling Wireless debugging. Reconnect with `adb mdns services` (look for `_adb-tls-connect._tcp`) and `adb connect IP:PORT`. A USB cable plus `adb devices` also works.

### Install and use Kanakku on the phone

```sh
adb -s SERIAL install -r artifacts/kanakku-personal-beta.apk
```

Or copy the APK to the phone and open it from Files, allowing installs from that app. In Kanakku, Settings › Connect bank SMS asks for the history window and then Android permissions. For the personal app turn on:

- **SMS** (read and receive): required for import and new-alert capture.
- **Notifications**: import progress and private review prompts.
- **Microphone** ("While using the app"): only for voice notes; typing works without it.
- **Camera** ("While using the app"): only for taking a bill photo; voice/text and manual receipt entry remain available without it.
- **Display over other apps**: only for the optional floating companion.
- Xiaomi: App info › **Autostart** on and **Battery saver › No restrictions**, so WorkManager import and SMS capture keep running. Lock-screen notifications should be set to hide sensitive content.

Device authentication (screen lock) must be set for the encrypted ledger key. Never grant these permissions to, or run Maestro against, the personal package for tests.

### Build APKs manually

Isolated test build (package `app.tinkerbox.kanakku.e2e`):

```sh
KANAKKU_BUILD_PROFILE=e2e npx expo prebuild --platform android --no-install --clean
(cd android && ./gradlew :app:assembleRelease -PreactNativeArchitectures=arm64-v8a --max-workers=4)
cp android/app/build/outputs/apk/release/app-release.apk artifacts/kanakku-e2e.apk
```

The config plugin forces Gradle's expo-updates fingerprint task to rerun on every build; it declares no source inputs, so without that rule a native edit would leave a stale runtime version in the APK and a later OTA update would be refused. After any native change, confirm `unzip -p <apk> assets/fingerprint` equals the shell's `npx @expo/fingerprint fingerprint:generate --platform android` hash.

Personal build: always run an ordinary prebuild first so the personal package/name return.

```sh
npx expo prebuild --platform android --no-install
(cd android && ./gradlew :app:assembleRelease -PreactNativeArchitectures=arm64-v8a --max-workers=4)
```

Verify before copying it to `artifacts/kanakku-personal-beta.apk`:

```sh
BT=$(ls -d $ANDROID_HOME/build-tools/* | tail -1)
$BT/aapt2 dump badging android/app/build/outputs/apk/release/app-release.apk | grep -E "^package|native-code"
$BT/apksigner verify --print-certs android/app/build/outputs/apk/release/app-release.apk
shasum -a 256 android/app/build/outputs/apk/release/app-release.apk
```

Expect `app.tinkerbox.kanakku`, `arm64-v8a` and the existing development certificate recorded in `artifacts/apk-verification.txt`. Run the read-only gate against the generated APK before copying it:

```sh
npm run verify:apk -- android/app/build/outputs/apk/release/app-release.apk
# For the isolated build, add --e2e instead.
```

The verifier reads the selected Whisper filename/hash from `src/native/voiceModel.json`, checks it is uncompressed, verifies MiniLM and requires `libkanakku_whisper.so`. The current selected asset is `whisper-base.en-q5_1.bin`; do not use old tiny/whisper.rn filenames or copied hashes. Refresh `artifacts/build-manifest.json` and CHECKLIST from the verified artifact after each rebuild. Do not claim an older APK contains new source changes.

### Run the Maestro UI tests manually

```sh
adb -s SERIAL install -r artifacts/kanakku-e2e.apk
maestro --device SERIAL test --no-reinstall-driver --format junit --output maestro-output/run/results.xml --test-output-dir maestro-output/run tests/android/maestro
maestro --device SERIAL test --no-reinstall-driver tests/android/maestro/theme-persistence.yaml   # one flow
maestro studio   # browser UI to inspect elements and record steps by hand
```

A run takes about four minutes; per-flow screenshots, hierarchy and logs land in the output folder. Troubleshooting:

- `CLEAR_APP_USER_DATA` denied: enable USB debugging (Security settings).
- Maestro reinstalls its two helper apps on every run unless `--no-reinstall-driver` is passed, and Xiaomi asks for approval on each install. The project harnesses pass that flag; omit it only when Maestro is upgraded.
- Every flow fails instantly with `DeviceServerDiedException`: the Maestro helper apps were removed. Reinstall them, approving the prompts on the phone:
  ```sh
  unzip -o ~/.maestro/lib/maestro-client.jar maestro-app.apk maestro-server.apk -d /tmp/maestro-driver
  adb -s SERIAL install -r -t /tmp/maestro-driver/maestro-app.apk
  adb -s SERIAL install -r -t /tmp/maestro-driver/maestro-server.apk
  ```
- Timeouts while scrolling: the animated companion slows Maestro's settle detection; give that step a longer `timeout` rather than adding sleeps.

### Beta diagnostics

Both builds keep a local JSON-lines log of errors and pipeline steps (app start, SMS ignored/captured/classified, import worker failures, prompt decisions, companion/voice stages and timings, errors shown to the user, uncaught native/JS errors). It is on by default during the beta; Settings › Beta diagnostics turns it off (deleting it) or clears it. It must never contain SMS text, notes, transcripts, payee names, account numbers, audio or keys; `Diagnostics.scrub` masks digit runs and addresses as a safeguard. Pull it with:

```sh
adb -s SERIAL shell cat /sdcard/Android/data/app.tinkerbox.kanakku/files/diagnostics/kanakku-diagnostics.jsonl
```

Use `app.tinkerbox.kanakku.e2e` for the test build. The log rotates to `kanakku-diagnostics.1.jsonl` after 1 MB.

### Other manual checks

- Browser preview: `npm run web`. Full regression: `npm run test:regression` (or `npm run typecheck`, `npm test`, `npm run test:native`, `npm run test:e2e`; `npm run test:e2e:report` opens the last report).
- Brand assets: edit `src/brand/mark.ts`, run `npm run brand:render`, then prebuild and rebuild.
- Record a cold launch to check the splash hand-off:
  ```sh
  adb -s SERIAL shell am force-stop app.tinkerbox.kanakku.e2e
  adb -s SERIAL shell screenrecord --time-limit 6 /sdcard/launch.mp4 &
  adb -s SERIAL shell monkey -p app.tinkerbox.kanakku.e2e -c android.intent.category.LAUNCHER 1
  wait
  adb -s SERIAL pull /sdcard/launch.mp4 && adb -s SERIAL shell rm /sdcard/launch.mp4
  ```

## Optional model delivery

ModelDownloads uses explicit WorkManager HTTPS downloads from pinned Hugging Face revisions, with size/SHA-256 verification and atomic file installation in noBackupFilesDir/optional-models. ModelFiles is the host-tested bounded-copy/range/hash primitive. No model weights belong in the base APK: the module stages only small assets; verify-apk rejects leaked .onnx/.bin weights and checks the catalog. Keep native runtime libraries in the APK. Source catalog generation is npm run models:catalog; changing voice selection must regenerate both catalog copies. models:fetch remains a local evaluation helper and its weights are excluded from APKs. No inference path starts a download. Missing models leave deterministic SMS parsing, personal rules and manual review working; voice guides the user to Optional models before recording. Downloads persist across compatible updates; removing a model never resets the journal. Disclose the model host/network metadata in the privacy policy. HTTPS delivery works with ADB and Play installs; Play Asset Delivery is a separate follow-up, not an implemented claim.
