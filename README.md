# Kanakku

An Android spend journal with an ivory/forest light theme, a matching dark theme, local SMS processing, an encrypted ledger and a lively companion for payments that need context.

## Run the preview

```sh
npm ci
npm run web
```

The browser uses labeled sample transactions. SMS, device authentication, SQLCipher, voice, bill-photo recognition, overlays and native updates require an Android release/development build; Expo Go cannot provide Kanakku's native module. The preview keeps typing, editable bill details and category selection available without pretending that native recognition succeeded.

## Build and install Android

Use Node 24, JDK 17 and Android SDK platform/build tools 36. Accept the SDK licenses, then build the personal package:

```sh
npx expo prebuild --platform android --no-install
(cd android && ./gradlew :app:assembleRelease -PreactNativeArchitectures=arm64-v8a --max-workers=4)
```

Set `JAVA_HOME` and `ANDROID_HOME` to your toolchain. Native code lives in `modules/kanakku-native`; generated `android/` is ignored. Durable build settings live in `app.json`, `app.config.js` and `plugins/withKanakku.js`.

Verify the package, existing signing certificate, ABI and model hashes before copying the release to `artifacts/kanakku-personal-beta.apk`. The beta targets arm64 Android 12+ and retains its development signing identity. A different signing key cannot update the existing installation. Current artifact versions, hashes and evidence are recorded in [build-manifest.json](artifacts/build-manifest.json); [CHECKLIST.md](CHECKLIST.md) distinguishes implemented source from verification of the latest APK. Camera/OCR/update-library or other native changes require rebuilding; an older APK does not gain them from a source edit.

Install the verified personal APK with `adb -s SERIAL install -r artifacts/kanakku-personal-beta.apk`, or copy it to the phone and open it in Files. It starts with an empty journal. Connect SMS in Settings. The isolated `com.kanakku.app.e2e` package contains test/sample data and must never replace the personal artifact.

Pair over Wi-Fi with `npm run adb:pair` and scan its QR code from Developer options → Wireless debugging → Pair device with QR code. [CLAUDE.md](CLAUDE.md) contains the full toolchain, phone, build, permission and Maestro instructions.

## First-time SMS import

Settings → Connect bank SMS asks for **1, 3, 4 or 6 months, 1 year, all history, or Skip for now** before import. The calendar window is frozen when scanning starts. Android WorkManager processes the recent seven days first, then older history. A top banner and private notification show progress; pause/resume retains the checkpoint. Totals remain explicitly partial until staged alerts load after unlock.

Historical uncertain payments enter the review queue without individual avatar interruptions. New-alert capture has a separate switch. Normal process interruption can resume through WorkManager; Android force-stop prevents background work until the app is permitted to run again. Missed-message reconciliation stays within the selected history floor and preserves corrections.

## Local data, review and insights

- SQLCipher protects the journal; Android Keystore and device authentication gate its keys. Locked background capture seals minimal events in an encrypted inbox until unlock. Hardware backing depends on the device. The app does not retain raw SMS.
- Amounts are integer paise. Purchases/refunds determine net spending; income, transfers, cash and card repayments remain separate. Unknown account-only payees need context rather than being guessed as purchases. Masked account suffixes cannot safely identify a reusable payee rule.
- Duplicate linking requires parser-proven supplementary alerts and one unambiguous referenced match with the same account, bank, direction and amount. Equal amounts/times alone are insufficient. Existing linked/excluded rows are not silently undone by the stricter policy; inspect and correct legacy rows explicitly.
- Review supports editable merchant/note/category, transaction kind, save-and-next, skip, undo and explicit remember. A selected category and user edits are protected from late suggestions. Remembered rules act on eligible unconfirmed named-payee rows; changing a rule does not rewrite already confirmed payments.
- Activity combines date/account/kind/category/review/search filters and preserves position. Insights shows contributing rows, merchant totals, equivalent completed-day comparisons and supported spending questions. Totals use ledger queries, not model arithmetic.
- Recurring-payment suggestions show charge evidence, ranges and estimated dates. Confirm/ignore/restore changes labels only; a brand name or a single charge does not prove an active subscription.

Parser fixtures cover selected HDFC, Axis, SBI, UPI, Kerala Gramin Bank and slice shapes. This is not validated coverage of every Indian bank or card. Large-history performance, real alert variants and device background behavior remain acceptance work.

## English voice and local categorization

The current bundle is **Whisper base.en Q5_1**, English only, through Kanakku's JNI bridge to vendored whisper.cpp. It replaces the earlier whisper.rn integration. Development comparisons on the physical `24053PY09I` phone observed better text from direct whisper.cpp on the same audio; base.en took roughly 4.5 seconds per tested clip with four threads. These observations are recorded in [the model catalog](scripts/voice-models.json); they are not a formal accuracy/latency acceptance result or a promise for other phones.

Malayalam remains preferred future work, but is **not supported by the current English model**. Earlier multilingual tiny produced filler, while small preserved more Malayalam meaning but took about 31 seconds for an 11.6-second clip on the tested phone. Optional language packs remain planned. `npm run voice:model -- --list` shows build-time candidates; changing the bundled model requires a new APK.

Tap the microphone, speak briefly, then Finish or allow silence completion. Audio stays in native memory, with a 15-second cap, cancellation on background/close and an editable transcript before Save. A short merchant spelling hint stays on device. The current ARMv8.2 fp16/dot-product runtime checks processor support; unsupported devices retain typing/category alternatives. The isolated test build alone has an explicit opt-in diagnostic switch retaining the last three clips and app transcripts; turning it off deletes them. The personal build cannot enable that exception.

The bundled quantized **all-MiniLM-L6-v2** ONNX model suggests categories after personal rules and known merchant matches. Jeff and Gemini are not integrated. Similarity is not a calibrated probability; ambiguous or mixed-purpose context stays for review. Held-out merchant accuracy, representative microphone recordings and broad device performance remain unverified.

## Bill photos and the companion

The in-app companion and optional floating Android avatar offer separate **voice** and **bill photo** actions. The overlay opens Kanakku and unlocks the journal before recording or camera capture; it never records automatically. Dragging stays separate from tapping, position is bounded/remembered, and motion/haptics respect user settings.

Bill capture uses a foreground Expo Camera screen and bundled, on-device **ML Kit Latin text recognition**. A bounded parser extracts an editable merchant/date, item rows, quantities, prices, totals, taxes and adjustments when readable. Latin-script printed bills are the current scope; Malayalam-script and handwritten bills are not validated. Poor images or unsupported layouts retain typing alternatives and reconciliation warnings.

Review the extracted fields, optionally add an independent English voice/text note, then explicitly choose **Suggest category from bill and note**. Bill content never overwrites the note, SMS transaction amount or transaction date. Merchant replacement is explicit. Save confirms the normalized bill details alongside that transaction in encrypted JSON; raw OCR text and the photo are not saved to the ledger or uploaded. The temporary app-cache photo is deleted through normal success/cancel/error cleanup. Process-kill leftovers and physical camera/OCR quality still need acceptance checks.

## Optional Brave merchant/VPA search

Settings accepts the user's own Brave Search API key, encrypted by Android Keystore. Lookup is off by default. Automatic lookup is limited to exact public brands; an unknown business requires approval of its public-name query.

A separate **Look up a UPI ID** flow shows one complete address and requires per-address consent before sending it to Brave. This is an explicit exception to keeping payment identifiers local; SMS, amounts, accounts, notes and other identifiers remain excluded. Editing/reopening clears consent. There are no automatic VPA searches or saved search-result databases. Sources distinguish an exact address mention from related results, and neither proves recipient ownership. The user decides whether to edit/save the merchant.

A live Android test reached the results UI for a publicly listed business VPA but found **no public match**; it did not identify a merchant or save a correction. See [the live result](artifacts/native-vpa-live-results.json) and [provider/privacy notes](src/services/MERCHANT_LOOKUP.md). Encrypted credential lifecycle and synthetic privacy/consent tests have separate evidence; they do not prove broad search coverage, quotas or hardware key backing.

## App updates

The verified Expo project is **@ananthutds-team/kanakku**. Its leaf project icon is updated, and the project name is Kanakku. [eas-project.json](eas-project.json) records its public project ID. Separate **e2e** and **personal-beta** channels point to separate branches; no update has been published by this setup.

Settings provides manual check, download and confirmed restart. Restart checks active-session/save/voice/camera guards and never interrupts work automatically. Fingerprint runtime compatibility keeps native changes on a new APK. Existing APKs without the update library need an in-place update signed with the same certificate first. Both EAS build profiles require local credentials to preserve signing. Real published-update delivery, restart and rollback remain unchecked; follow [OTA setup and acceptance](docs/OTA.md).

## Verification and emulator

```sh
npm run test:regression
npm run emulator:start -- --show
# Rebuild and verify artifacts/kanakku-e2e.apk first; tests do not compile it.
npm run test:android:emulator -- --reduced-motion
npm run test:android:pipeline
npm run test:android:credentials
npm run emulator:stop
```

Install Playwright Chromium before browser tests. The host regression runs TypeScript, domain/storage/voice tests, actual dependency-consumer checks, standalone Kotlin and phone/desktop Playwright against a fresh production web export. Latest results, counts and exact revisions belong in [verification-summary.md](artifacts/verification-summary.md), [build-manifest.json](artifacts/build-manifest.json) and the checklist.

The dedicated synthetic Android 16/API 36 Google APIs ARM64 AVD is **Kanakku_API_36**, serial **emulator-5580**. Android Studio is optional. Guarded harnesses install/clear only `com.kanakku.app.e2e`. Run device suites sequentially. Reduced-motion tests record/restore settings and do not prove normal-motion avatar behavior. Earlier synthetic evidence covers import/checkpoint/replay, native SQLCipher persistence, PIN-gated restart, sample UI persistence and provider-key lifecycle; evidence applies to its recorded APK hash.

Real SMS delivery, credential/biometric changes, reboot recovery, physical camera/voice quality, overlay behavior, large histories, battery policy, TalkBack and large-font acceptance remain separate. See [PLAN.md](PLAN.md), [CHECKLIST.md](CHECKLIST.md), [browser E2E instructions](tests/e2e/README.md) and [Android acceptance](tests/android/ACCEPTANCE.md). CI is saved locally; there is no repository/remote here yet.

The leaf geometry in `src/brand/mark.ts` drives launcher/adaptive/themed icons, favicon, splash and notification branding. Regenerate with `npm run brand:render`, then prebuild/rebuild.
