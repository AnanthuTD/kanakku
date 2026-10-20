# Encrypted Google Drive backup

Kanakku's Drive backup is manual and user initiated. It serializes the saved journal (transactions, notes, structured bill details, merchant rules and recurring decisions), encrypts it on Android, then creates or updates one visible file named `Kanakku encrypted backup.kbk` in the user's Drive. Each backup replaces the previous copy; restore always downloads that latest file. The app requests only `https://www.googleapis.com/auth/drive.file`, separately from Gmail, when the user selects Backup or Restore. It can access the app-created backup, not browse the user's other Drive files.

## Encryption and recovery

The backup archive uses PBKDF2-HMAC-SHA256 (600,000 iterations) to derive a 256-bit key from a user-chosen password, then AES-256-GCM with a random 16-byte salt and 12-byte nonce. The versioned envelope authenticates the archive format as GCM additional data. The password and Google access token are not saved by Kanakku; the password is never sent to Google. A forgotten password means the backup cannot be restored. The ciphertext is capped at 24 MiB of plaintext (about 32 MiB after encoding) for this implementation.

Restore downloads and decrypts the app-created file, validates its version and record shapes, shows its creation date/counts, and requires both typing `RESTORE` and Android device authentication. It atomically replaces the SQLCipher ledger snapshot. If the SQL transaction fails, the previous journal remains. SMS and Gmail grants, Gmail account credentials, local import checkpoints, the sealed pending-alert inbox, and temporary receipt images are device-specific and are not in this archive. SMS can be imported again; Gmail must be reconnected after moving to a new phone. Saved structured receipt details are included.

Do not add unattended/background upload or store the recovery password without a separate privacy/security review. Publish the policy update before a public release. Keep real journal data, encrypted archives, passwords, Google tokens, and credentials out of source control and logs.

## Google Cloud setup

Enable the Google Drive API in the existing Kanakku OAuth project and add `https://www.googleapis.com/auth/drive.file` to its configured OAuth scopes. `drive.file` is a non-sensitive, per-file scope. Users grant it in context on the first backup/restore. Keep existing Gmail scopes and OAuth clients intact. Test with a personal-signed APK because OAuth identity is bound to its package and signing certificate.

## Acceptance

- [x] Versioned AES-GCM envelope, password-derived key, size and format validation.
- [x] Android Drive REST adapter for one app-created file; separate in-context OAuth request.
- [x] Restore preview and explicit destructive confirmation plus device unlock.
- [x] Exact SQLCipher snapshot replacement is one transaction with rollback on failure.
- [x] TypeScript typecheck, 222 unit tests, Android Kotlin/debug instrumentation compilation, 2 emulator crypto instrumentation tests, and the focused phone Settings browser journey.
- [ ] Enable Drive API and add `drive.file` in Google Cloud; verify owner authorization on the personal APK.
- [ ] Live backup, wrong-password/tampered-file, cross-device restore, and reinstall recovery on a test journal before using a personal journal.
