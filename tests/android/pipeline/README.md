# Native provider pipeline on the isolated emulator

This test uses the real Android SMS content provider, WorkManager, device credential prompt and SQLCipher repository. Every SMS is invented and labeled synthetic in `fixtures.json`. It does not prove real bank coverage, real radio delivery, hardware Keystore backing, Malayalam/English microphone accuracy or background battery behavior.

Build and install the current **E2E package** following `CLAUDE.md`. Start the dedicated AVD with `npm run emulator:start`. The harness refuses any device other than `emulator-5580` with AVD name `Kanakku_API_36`, refuses non-root provider access, and compares the installed APK hash to `artifacts/kanakku-e2e.apk`. It clears only `com.kanakku.app.e2e`; never run it on the personal package or a phone.

The Google APIs test image permits `adb root`. Set the synthetic test PIN once, only after verifying the AVD name:

```sh
ADB=/opt/homebrew/share/android-commandlinetools/platform-tools/adb
test "$($ADB -s emulator-5580 emu avd name | tr -d '\r' | head -1)" = Kanakku_API_36 || exit 1
$ADB -s emulator-5580 root
$ADB -s emulator-5580 shell locksettings set-pin 2580
# If that PIN is already set, verify it instead:
$ADB -s emulator-5580 shell locksettings verify --old 2580
node scripts/android-pipeline.mjs
```

Do not replace an existing unknown credential. The harness requires PIN `2580` and uses the actual Android credential screen; it does not bypass authentication.

Ten provider rows exercise a four-month window: nine in-window messages contain five distinct eligible transactions (purchase, older purchase, posted refund, repayment, income), one purchase replay, OTP, non-bank sender, and pending refund. One additional purchase is 160 days old and must be outside the window. The visible current-month spend must be exactly ₹300.25 (₹420.25 minus ₹120), with repayment/income excluded. Repeating the same selected import must preserve that exact total. The older ₹1,299 purchase affects all-history spend, not current-month spend.

The harness checks native counters, a non-plaintext ledger header, the sealed key envelope in `no_backup`, secure window flags and authenticated process restart. Replay also requires four current-month transactions, so duplicate income/repayment rows cannot hide behind an unchanged spend total. It never reads an unwrapped database key or logs raw app data. Fixture cleanup deletes only exact synthetic sender/body/date matches inserted by this run and checks that no matching row remains. Failed cleanup makes the report fail. The encrypted test ledger remains until the next test-package clear; phone SMS and personal-package data are never targeted.

The harness temporarily enables Android's reduced-motion setting (`transition_animation_scale=0`) before launching the app, because continuously animated decorative content prevents the standard Android hierarchy exporter reaching idle. It records the previous setting and restores it in `finally`; failed restoration makes the report fail. This validates the reduced-motion native path. The separate smoke suite and physical acceptance cover normal animation behavior. Current-month fixtures assume the emulator calendar is past the first day of the month; the fixed ₹300.25 assertion must remain strict for the documented fixture dates.

Results are saved to `artifacts/native-pipeline-results.json`; Maestro evidence is under `maestro-output/native-pipeline`. The three pipeline flows are intentionally separate from the sample UI smoke suite. Run only one emulator UI test at a time. Capture is enabled for this test package; later smoke tests clear that isolated package.

If the initial import phase passed but a later test-harness step was interrupted, `node scripts/android-pipeline.mjs --resume` can continue restart/replay only when the installed APK hash is unchanged, the report proves the original exact import, and the encrypted test ledger still exists. Resumed evidence names its original phase timestamp and reseeded provider time base. A different rebuilt APK always requires the normal fresh invocation. A resumed pass must be reported as linked phase evidence, rather than an uninterrupted full run.
