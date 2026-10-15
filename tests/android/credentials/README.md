# Android provider credential lifecycle

Run separately from the SMS pipeline and sample Maestro smoke suite:

```sh
npm run test:android:credentials
```

Prerequisites: the root-capable dedicated `Kanakku_API_36` AVD is running at `emulator-5580`, and the current verified `artifacts/kanakku-e2e.apk` is installed. Set `ANDROID_HOME`, `JAVA_HOME` and optionally `MAESTRO_BIN`. The script checks AVD identity, root access, isolated package/profile, APK signature/models and the installed APK hash before allowing state changes. It never targets the personal package or a physical phone. Do not run competing device tests concurrently.

The first flow clears only `com.kanakku.app.e2e`. Every launch denies SMS, microphone and notification permissions; continuation stages retain those denials. Run these files through the harness in order: replacement and removal deliberately continue in Settings between native inspections. Two deliberately invalid synthetic placeholders exercise normal Settings save, process restart, replacement and removal. Lookup and automatic lookup remain disabled throughout; no search is requested. Native preferences must show zero attempts and no provider request timestamps/cooldown. The UI must show the saved-key/remove controls and zero usage, without a search action.

The harness reads the isolated app's native preferences without printing their contents. It checks AES-GCM ciphertext and IV structure, the complete placeholder byte length plus the 16-byte authentication tag, unchanged bytes after restart, new ciphertext and IV after replacement, absence of plaintext placeholders in on-disk app files, and absence of ciphertext/IV after removal and another restart. Each stage also verifies that native SMS, microphone and notification runtime permissions remain denied. The production settings path calls Android Keystore; this test does not export keys or bypass that path. On failure it clears the isolated app to remove synthetic credentials. A successful run leaves the key removed.

These storage journeys use Android's reduced-motion condition (`transition_animation_scale=0`), without changing animator/window scales. The harness records the original value and verifies restoration even after failure. They do not validate the avatar's motion behavior.

Results: `artifacts/native-credential-results.json`; Maestro screenshots/hierarchies/logs: `maestro-output/native-credentials/`. Only synthetic placeholders appear in the source and CLI logs. Never replace them with a real provider token. This proves local credential lifecycle on the emulator, not real provider responses, rate limits, hardware key backing, or correctness of a paid plan.
