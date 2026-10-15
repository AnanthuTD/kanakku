# Kanakku over-the-air updates

Implemented 15 October 2026 with **Expo EAS Update**. The owner project was verified in the signed-in Expo dashboard and linked in `eas-project.json`: owner **ananthutds-team**, slug **kanakku**, project ID **b609ea53-b8e5-42ff-9550-2e46880bcda4**. This public identifier is not a credential. No update has been published and end-to-end delivery remains unverified until a release build downloads and runs a published update. Set `KANAKKU_EAS_PROJECT_ID` to an empty string to produce an intentionally offline build; Settings then explains that update delivery is disabled.

The owner approved browser sign-in for EAS CLI. Account/project access was verified, then the previously empty **e2e** and **personal-beta** channels were created and linked to separate branches of the same names. No remote build, new keystore or update publication was performed.

## Behavior

Settings → App updates has separate **Check for updates**, **Download update** and **Restart to update** actions. Restart requires confirmation, an active app and a fresh guard that no journal save, editing, voice or receipt action is in progress. A downloaded update also applies on the next full app start. There is no background polling, forced reload, startup network wait or automatic interruption. Failed checks/downloads leave the installed version usable offline; retries remain explicit. The browser reports native updates unavailable instead of simulating success.

The service uses `expo-updates`' real check, fetch and reload APIs. The controller's transport tests verify decision policy and error handling; they do not prove network delivery, Expo permissions, installed-update integrity, rollback or a real restart.

## Native compatibility and isolation

- Runtime version uses Expo's **fingerprint** policy, which hashes native inputs. The local Expo module's Android directory includes Kotlin/C++, model binaries and metadata, so a changed native engine/model belongs to a different runtime.
- `com.kanakku.app` uses the **personal-beta** channel. `KANAKKU_BUILD_PROFILE=e2e` uses **com.kanakku.app.e2e** and the **e2e** channel. Each package retains its own files and Android Keystore namespace. Never run destructive tests against the personal package.
- JavaScript/UI fixes and compatible JS assets can be delivered over the air. New native libraries, Android permissions, config plugins, native receipt OCR/camera changes, Whisper/MiniLM binaries, signing changes and SDK upgrades require a fresh APK.
- The build profile is persisted to `kanakku-profile.json` (ignored) by `app.config.js` whenever `KANAKKU_BUILD_PROFILE` is set, and read back when it is not. This matters because Gradle's expo-updates manifest/fingerprint step and other tooling can run without the shell's environment: before the file existed, the test APK was built with the personal runtime fingerprint and any `e2e` update would have been rejected. Always prebuild with the intended profile; the fingerprint then matches on both sides. `.fingerprintignore` keeps the local native module's `.cxx`/`build` output out of the runtime version.
- Keep the same profile, environment and native fingerprint inputs for a release build and its update. Never override the runtime or disable Expo's anti-bricking protection to force an incompatible update onto a device.
- Existing APKs built before `expo-updates` was added cannot acquire this capability through an update; install one new update-enabled APK first.
- Changing an update URL/project/channel is a native release configuration change. There is no user-editable arbitrary update server URL or runtime channel switch.

## Owner setup before the first delivery test

1. Use the owner's linked Expo account/project. `eas-project.json` is the checked-in public configuration; **KANAKKU_EAS_PROJECT_ID** can override its ID for another reviewed project or disable delivery when empty. The app rejects malformed IDs and never supplies a placeholder.
2. Both build profiles in `eas.json` use the EAS **preview** environment; their profile variable determines the separate package/channel. Do not put a shared `KANAKKU_BUILD_PROFILE` in the remote environment: it must remain an explicit personal/e2e choice for each operation. If overriding the project ID, use the same override for prebuild/build and update export. Do not set an empty project override in the remote environment unless deliberately disabling updates.
3. Install dependencies with `npm ci`, then inspect the evaluated config before building:

   ```sh
   KANAKKU_BUILD_PROFILE=e2e npx expo config --type public
   KANAKKU_BUILD_PROFILE=personal npx expo config --type public
   ```

   Confirm the expected package, `updates.enabled: true`, `https://u.expo.dev/<your UUID>`, correct `expo-channel-name`, `checkAutomatically: NEVER` and fingerprint runtime policy. Keep provider API keys out of Expo config/environment.

4. Create/rebuild the isolated release APK with those variables and install it on the dedicated emulator. Use the existing local prebuild/Gradle procedure or the `e2e` EAS build profile. If retaining the installed journal, keep the APK signing identity stable; an unrelated signing key cannot update the installed package.

   Both EAS profiles deliberately set `credentialsSource: local`: they cannot silently choose/generate a new remote signing key. Before a future EAS build, supply an ignored `credentials.json` referencing the existing original keystore and its credentials. Do not commit, print or share that file or keystore passwords. Current local Gradle builds keep their existing signing setup, and OTA delivery does not require generating another Android keystore.

5. The **e2e** and **personal-beta** channels/branches already exist in the owner's project. After checking the isolated release APK, publish a harmless, identifiable JS-only change to **e2e** using the same native inputs/environment:

   ```sh
   EAS_NO_VCS=1 KANAKKU_BUILD_PROFILE=e2e npx eas-cli@latest update --channel e2e --environment preview --message "Verify Kanakku test-app update delivery"
   ```

   This command publishes code externally. It is documentation, not a command run by this implementation. Before publication, verify the resolved package/profile and account/project. Do not use the personal channel for the first experiment.

   `EAS_NO_VCS=1` is explicit because this workspace currently has no Git repository. Once the project uses Git, use normal EAS version-control checks instead. Never include keystores, `credentials.json`, private clips or diagnostic artifacts in an update upload.

6. Prove the acceptance cases below. Only then rebuild/activate **personal-beta**, using `KANAKKU_BUILD_PROFILE=personal`, its own channel and a reviewed update. A native change in this work (camera/OCR/update library) requires a fresh APK before any subsequent compatible OTA delivery.

EAS Update hosting uses the owner's account and current limits; no particular free quota is assumed. A self-hosted Expo Updates Protocol server would need its own operational, integrity and rollback work and is not implemented. Consider Expo update code signing for distribution beyond the current personal beta; keep its signing private key off devices and out of the repository. This implementation does not fabricate a certificate or claim that release hardening is complete.

## Acceptance checklist

- [x] Controller tests: explicit check/fetch/restart, offline retry, no false pending state, concurrent-action serialization, safe restart and observers.
- [x] Configuration tests: disabled without a real ID, UUID validation, isolated Android package/channel and native fingerprint policy.
- [x] Owner project ID/owner/slug verified in the Expo dashboard and persisted as public project configuration.
- [x] Browser-authorized CLI access verified; e2e/personal-beta server channels linked to separate empty branches, with no updates published.
- [ ] Inspect generated update-enabled Android release manifest and fingerprint with the owner's real project configuration.
- [ ] Real EAS **e2e** release APK: no update available; publish a compatible JS change; check → download → Later; keep the current session intact.
- [ ] Confirm restart and verify the identifying change actually runs, then force-stop/reopen and verify it persists.
- [ ] Check/download offline and recover; close/background during download; failed-download state must not be shown as success.
- [ ] Start recording/camera/journal work before confirming restart; guard must prevent interruption. Backgrounding dismisses the restart dialog.
- [ ] Prove a changed native runtime does not install over an older APK; inspect the actual computed fingerprint, including local native module/model inputs.
- [ ] Check channel isolation: e2e update must not be offered to personal-beta.
- [ ] Exercise rollback/fallback on the isolated test app and verify journal schema compatibility. Keep migrations backward compatible with any cached executable update; update rollback cannot reverse destructive database migrations.

## Official references

- [Expo Updates API and release-build testing](https://docs.expo.dev/versions/latest/sdk/updates/)
- [Configure EAS Update and publish with an environment](https://docs.expo.dev/eas-update/getting-started/)
- [Runtime compatibility](https://docs.expo.dev/eas-update/runtime-versions/)
- [Expo fingerprint reference](https://docs.expo.dev/versions/latest/sdk/fingerprint/)
- [Update code signing](https://docs.expo.dev/eas-update/code-signing/)

Checked against the current Expo documentation and installed Expo 57 API on 15 October 2026.
