# Kanakku privacy policy

Last updated 15 October 2026. Applies to the Kanakku Android app (`app.tinkerbox.kanakku`), published by Tinkerbox (Ananthu T D).

## The short version

Kanakku reads your bank's SMS alerts on your phone, turns them into a spend journal, and keeps that journal encrypted on your phone. It has no account, no server and no analytics. Nothing is uploaded unless you explicitly ask for one of the two optional network features described below.

## What the app reads

- **Bank SMS alerts.** With your permission, Kanakku reads SMS messages to find payment alerts from supported banks. Each message is parsed on the phone for the payment fields (amount, merchant or account hint, date, reference, kind) and then discarded. The full text of a message is never stored. One-time passwords and messages that are not payment alerts are rejected before anything is kept.
- **Your voice**, only when you tap the microphone. Speech is transcribed on the phone by a bundled model. Audio is held briefly in memory and is not written to storage.
- **Bill photos**, only when you tap the camera. The photo is read on the phone by a bundled text-recognition model into editable line items. The photo and the recognised text are not stored.
- **Your edits**: the notes, categories, merchant names and rules you enter.

## Where it is kept

Everything above lives in an encrypted database on your phone (SQLCipher). The encryption key is held in the Android Keystore and unlocked by your device lock. Alerts that arrive while the phone is locked are sealed into an encrypted inbox until you unlock. Backups to Google are disabled for the app's data. Uninstalling the app deletes it.

## What leaves the phone

Two things, both optional and both triggered only by you:

1. **Merchant lookup** (off by default). If you turn it on and tap search on a payment, the app sends the public business name — and nothing else — to the Brave Search API using an API key you supply. No amount, bank, account, note or payment ID is sent. Results are shown briefly and not kept.
2. **Check for updates** in Settings asks Expo's update service for a newer version of the app's JavaScript. That request carries the app's version and runtime identifier, not your data.

The app does not send crash reports or usage statistics anywhere. A small diagnostics log (stages, counts and timings — never message text, amounts, names or images) is written to the phone to help fix bugs; it stays on the device, can be turned off or cleared in Settings, and is only shared if you choose to attach it to a bug report.

## Permissions and why

- **SMS (read, receive):** to import and capture bank alerts. Required for the core feature.
- **Notifications:** import progress and private review prompts.
- **Microphone:** voice notes, only after you tap. Optional.
- **Camera:** bill photos, only after you tap. Optional.
- **Display over other apps:** the optional floating companion. Optional.

## Children

Kanakku is not directed at children and does not knowingly process data from anyone under 18.

## Your control

Everything is on your phone. Settings lets you reset the journal, clear diagnostics, and turn each feature off. Deleting the app deletes all its data.

## Changes and contact

This policy changes only when the app's data handling changes, and the version in the repository is the authoritative one: https://github.com/AnanthuTD/kanakku/blob/main/docs/PRIVACY.md. Questions and reports: ananthu.td.dev@gmail.com.
