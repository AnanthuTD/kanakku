# Security policy

Kanakku reads your bank SMS and keeps a financial journal on your phone. Security and privacy problems are treated as the highest-priority bugs.

## Reporting a vulnerability

Please **do not open a public issue** for anything that could expose a user's financial data.

Email **ananthu.td.dev@gmail.com** with "Kanakku security" in the subject, or use GitHub's private vulnerability reporting on this repository. Include steps to reproduce and the app version (Settings → footer). You will get an acknowledgement within 72 hours and a fix or a clear status within 14 days for confirmed issues. Credit is given in the release notes unless you prefer otherwise.

## What is in scope

- Any way raw SMS text, account numbers, notes, voice audio, bill photos or OCR text could leave the device or be written to disk unencrypted.
- Weaknesses in the ledger encryption (SQLCipher), key handling (Android Keystore, device authentication) or the sealed background inbox.
- The optional merchant lookup sending more than the documented public business name.
- The over-the-air update path accepting an update it should refuse.
- Anything that lets another app on the phone read Kanakku's data or trigger its actions.

## What the app promises

- No account, no server, no analytics. The only network calls are the opt-in merchant lookup (a public business name only, with your explicit per-search consent) and the manual "check for updates" in Settings.
- Raw SMS is parsed and discarded; only the extracted payment fields are stored, encrypted.
- Voice is transcribed on-device by a bundled Whisper model. Audio is held briefly in memory and never written to storage in the personal app.
- Bill photos are read on-device by a bundled ML Kit model. OCR text and photos are not persisted in the personal app.
- The isolated test build (`app.tinkerbox.kanakku.e2e`) has an opt-in diagnostics switch that keeps recent voice clips and OCR text; the personal build cannot enable it.

## Verifying a release

Every GitHub Release is built by the public workflow in `.github/workflows/release.yml` from the tagged commit, signed with the project's release key, and published with a `SHA256SUMS` file and the signing certificate's SHA-256 fingerprint. Compare the fingerprint with `apksigner verify --print-certs` before installing, and the checksum with `shasum -a 256`.

## Known limitations

Hardware-backed key storage depends on the device. The app cannot protect data from a compromised or rooted phone, and a different signing key cannot update an existing installation.
