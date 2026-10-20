# Encrypted Google Drive backup

Kanakku supports manual and optional scheduled Drive backup. It serializes the saved journal (transactions, notes, structured bill details, built-in and custom category labels, merchant rules, recurring decisions, and money-lent records including repayments and return dates), encrypts it on Android, then creates or updates one visible file named `Kanakku encrypted backup.kbk` in the user's Drive. Each backup replaces the previous copy; restore always downloads that latest file. It requests `https://www.googleapis.com/auth/drive.file`, separately from Gmail, when the user selects Backup, Restore or turns on automatic backup. Automatic backup also requests the basic Google `email` identity scope so it can remember which selected account to use for later scheduled uploads; the account address is stored only in the same app-private, Android-Keystore-encrypted schedule state. It can access the app-created backup, not browse the user's other Drive files.

## Encryption and recovery

The backup archive uses PBKDF2-HMAC-SHA256 (600,000 iterations) to derive a 256-bit key from a user-chosen password, then AES-256-GCM with a random 16-byte salt and 12-byte nonce. The versioned envelope authenticates the archive format as GCM additional data. For manual-only use, Kanakku does not save the password. If the user explicitly enables automatic backup, Kanakku stores the password and latest journal snapshot in an app-private file encrypted by a non-exportable Android Keystore key; it does not store the password in Drive or on a Kanakku server. The snapshot is refreshed after successful journal saves while the app is unlocked, so the worker never opens the biometric-protected journal database. The user's original password is still required to restore on another device. A forgotten password means the backup cannot be restored. The ciphertext is capped at 24 MiB of plaintext (about 32 MiB after encoding) for this implementation.

Restore downloads and decrypts the app-created file, validates its version and record shapes, shows its creation date/counts, and requires both typing `RESTORE` and Android device authentication. It atomically replaces the SQLCipher ledger snapshot. If the SQL transaction fails, the previous journal remains. SMS and Gmail grants, Gmail account credentials, local import checkpoints, the sealed pending-alert inbox, and temporary receipt images are device-specific and are not in this archive. SMS can be imported again; Gmail must be reconnected after moving to a new phone. Saved structured receipt details are included.

The user may choose daily, weekly or monthly automatic uploads, change the period or turn the schedule off. WorkManager runs only when Android permits, with network available and battery not low; Android may delay it, and expired or revoked Google permission requires reopening Kanakku and reconnecting. After setup, later uploads use the previously granted Drive permission. A scheduled snapshot represents the latest successfully saved/unlocked journal state; SMS alerts not yet imported into the journal are not included. The schedule is device-specific and is removed on journal reset or uninstall. Turning it off keeps the existing Drive backup. Publish the policy update before a public release. Keep real journal data, encrypted archives, passwords, Google tokens, and credentials out of source control and logs.

## Google Cloud setup

Enable the Google Drive API in the existing Kanakku OAuth project and add `https://www.googleapis.com/auth/drive.file` to its configured OAuth scopes. `drive.file` is a non-sensitive, per-file scope. Users grant it in context on the first backup/restore. Keep existing Gmail scopes and OAuth clients intact. Test with a personal-signed APK because OAuth identity is bound to its package and signing certificate.

## Acceptance

- [x] Versioned AES-GCM envelope, password-derived key, size and format validation.
- [x] Android Drive REST adapter for one app-created file; separate in-context OAuth request.
- [x] Restore preview and explicit destructive confirmation plus device unlock.
- [x] Exact SQLCipher snapshot replacement is one transaction with rollback on failure.
- [x] Daily/weekly/monthly encrypted automatic-backup implementation, opt-in Keystore-protected recovery password and encrypted latest snapshot; “Back up now” reuses that setup.
- [ ] Verify WorkManager retry, reconnect, schedule timing, latest-snapshot behavior and reset/disable behavior on Android.
- [x] TypeScript typecheck, 227 unit tests, Android Kotlin compilation, 2 emulator crypto instrumentation tests, and the focused phone Settings browser journey.
- [x] Drive API and `drive.file` scope enabled in Google Cloud; manual backup and owner authorization confirmed on the personal APK.
- [ ] Live backup, wrong-password/tampered-file, cross-device restore, and reinstall recovery on a test journal before using a personal journal.
