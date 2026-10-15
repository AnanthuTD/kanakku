# Contributing to Kanakku

Thank you for looking. Kanakku is a personal, privacy-first Android spend journal; contributions that keep it that way are very welcome.

## Ground rules

These are not style preferences; they protect users' bank data.

- **Nothing leaves the phone.** No new network calls, SDKs, analytics or crash reporters. The two existing network paths (opt-in merchant lookup, manual update check) are deliberately narrow.
- **Never log or persist raw SMS, account numbers, notes, audio, bill photos or OCR text.** Diagnostics record counts, stages and timings only.
- **Money is integer paise.** Totals are computed by deterministic ledger queries, never cached.
- **Preserve what the user said.** Originals, references, classifier provenance and user corrections are kept; a user's explicit choice is never overwritten by inference.
- **Don't fake native success.** The browser preview uses sample data; SMS, voice, OCR and overlays exist only in the Android build and must say so.

## Setup

```sh
npm ci
npx playwright install chromium
npm run models:fetch        # downloads the two bundled ML models and verifies their hashes
npm run web                 # browser preview with sample data
```

Android builds need Node 24, JDK 17, Android SDK 36 and Kotlin 2.2.20+. See the "Build it yourself" section of the README and the manual-operations section of `CLAUDE.md` for phone setup, wireless ADB and the isolated test build.

## Tests

```sh
npm run test:regression
```

That runs TypeScript, the unit suite (vitest), dependency checks, the standalone Kotlin parser checks and the Playwright browser journeys. Every behaviour change should come with the test that would have caught it. Bill parser changes should add the receipt shape to `tests/receipts/` (transcribed, with no real personal details) and an assertion in `src/domain/receipt.test.ts`. SMS parser changes add a synthetic alert to `tests/ParserChecks.kt` — never a real message.

## Pull requests

- One change per PR, with a short description of the user-visible effect.
- Keep `CHECKLIST.md` honest: tick only what you verified, and say what you could not verify (a green build is not a phone test).
- Native changes (Kotlin, C++, models, permissions, config plugins) change the OTA runtime version and need a new APK; say so in the PR.
- CI must pass. Trace, screenshots and video for failed browser journeys are attached to the workflow run.

## Good first contributions

- A bank SMS format the parser doesn't recognise (add a synthetic fixture).
- A receipt layout that mis-parses (add it to `tests/receipts/`).
- Accessibility and TalkBack checks on a real device.
- Translations of the UI copy.
