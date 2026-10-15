# Bill library: kept photos, gallery, links and cleanup

15 October 2026. Extends the bill-photo capture already implemented (Expo Camera plus bundled ML Kit Latin OCR plus the conservative INR receipt parser). Today the photo is deleted after reading; this design keeps it.

## Intent

The owner wants each bill photo kept and attached to the payment it explains, viewable later at full size beside the extracted data, with a direct way back to the payment. Deleting one bill, clearing old ones and automatic cleanup must all be in the user's control. The experience must stay light: very few taps, nothing hidden.

Decisions already taken with the owner:

- Photos are encrypted and app-private (same device-gated key family as the ledger). Nothing is written to the phone's Gallery unless the user explicitly taps **Share** or **Save to Gallery**.
- Default automatic cleanup removes photos older than 90 days. The extracted receipt data always stays with the payment.
- Entry points: a **Bills** card on Overview plus a receipt badge and a **With bills** filter chip in Activity. No new tab.
- A photo taken without a matching payment is kept as **Not linked**, and can be linked later or turned into a cash entry.

## Storage

Receipt data today lives inside each transaction's JSON row in the SQLCipher ledger (`Transaction.receipt`). The photo becomes a separate encrypted file plus an index row, so the ledger row stays small and deleting a photo never touches ledger history.

- **Files**: `noBackupFilesDir/bills/<billId>.enc` written by the native module. Content is the camera JPEG, re-encoded to at most 1600 px on the long side, quality 80, EXIF stripped (no GPS, no device model). Sealed with AES-GCM under a per-file key wrapped by the existing Keystore RSA key, the same scheme `Vault.seal` uses for the inbox. A 240 px thumbnail is sealed the same way as `<billId>.thumb.enc`. Typical cost: 150–300 KB per bill.
- **Index**: new SQLCipher table `bills (id TEXT PRIMARY KEY, value TEXT)` through the existing `migrations.ts` path (format bump, backward compatible: older builds ignore the table). The JSON value holds `{ id, takenAt, transactionId?, bytes, width, height, receipt: ReceiptDraft, merchant, totalPaise?, date?, sha256 }`. The receipt JSON is stored here as the canonical copy; `Transaction.receipt` keeps a copy for the review sheet and gets `billId`.
- **Decryption**: a native `openBill(id)` returns a short-lived `content://` or temp file for display and is deleted when the viewer closes, on background, and on unlock loss. Decrypted bytes never persist. Raw OCR text is still never stored.
- **Reset**: "Remove this device's journal" also deletes the `bills` folder.

Sample/browser builds keep bills in demo storage as data URLs so the gallery can be tested in Playwright.

## Capture flow changes

Unchanged: Photo action on the review sheet and on the floating avatar (which opens the app first). After OCR succeeds the editor shows the receipt card as now, with the photo thumbnail at its top. Save now writes the sealed photo plus the index row in the same ledger transaction as the payment update; a failed photo write fails the save with a clear message and the cache image is still removed.

New: **Bills card → Add bill** opens the camera with no payment. After OCR the editor opens in standalone mode. Save stores the bill with `transactionId` empty. Underneath, up to three suggested payments are listed (same amount within 1%, date within 3 days, no bill yet); one tap links. **Create cash entry** makes a `cash`-kind transaction from the bill's merchant, date and total and links it.

## Gallery and viewer

**Bills card (Overview)**: title, count this month, storage used, three latest thumbnails, one line about the cleanup rule ("Photos kept 90 days"). Tap anywhere opens the gallery.

**Gallery screen** (`app/bills.tsx`): grid of thumbnails, newest first, grouped by month with sticky month headers. Each tile shows merchant, amount and a small link badge (linked / not linked). Filter chips: All, Not linked, This month. Long-press enters multi-select for delete or share. An empty state explains how to add the first bill.

**Bill viewer** (full screen, from a tile or from a payment): the photo at full size, pinch-to-zoom and double-tap, 100% width by default. A bottom sheet beneath it, draggable from a peek state, shows the extracted data: merchant, date, items with quantity and amount, subtotal, taxes, discount, rounding, total and reconciliation status. Header actions: **Open payment** (jumps to the Activity row and opens its review sheet; shows "Link to a payment" when not linked), **Share** (Android share sheet with a temporary decrypted JPEG, deleted after the share completes or is cancelled), **Save to Gallery** (writes a plain JPEG to Pictures/Kanakku through MediaStore after a one-line confirmation that it will be visible to other apps), **Delete** (confirmation; removes the photo and thumbnail, keeps the extracted data, clears `billId` and marks the payment's receipt as "photo removed").

**From a payment**: the review sheet's receipt card shows the thumbnail; tapping opens the viewer. Activity rows with a bill show a small receipt glyph; the **With bills** chip filters to them.

## Cleanup

Settings → Bill photos:

- **Keep photos for**: 4 weeks / 3 months (default) / 6 months / 1 year / Forever.
- **Clear older than…**: the same choices as a one-off action, with a count and size preview before confirming.
- **Delete all photos**: typed confirmation, like journal reset.
- Storage used, and the date of the last automatic cleanup.

Automatic cleanup runs on app unlock, at most once a day, on the JS side against the index (so it uses the unlocked ledger): it deletes files past the retention, writes the index change and records `lastBillCleanup` in `ledger_meta`. It never deletes a photo younger than the rule, never touches extracted data, and skips a bill currently open in the viewer. A native `deleteBills(ids)` removes the files; orphan files with no index row are removed on the next cleanup.

## Privacy

Photos and thumbnails exist only encrypted on disk and decrypted in memory or in a short-lived temp file while shown or shared. Diagnostics log counts, sizes and outcomes only. No bill text, merchant, amount or image ever appears in logs. Share and Save to Gallery are explicit per-bill actions with a visible warning, never defaults.

## Testing

- Unit: bill index normalization, retention calculation, cleanup selection (age, open bill skipped, orphan handling), link suggestion ranking, cash-entry creation from a bill.
- Native checks (`tests/ParserChecks.kt` style): seal/unseal round trip and EXIF stripping on a synthetic JPEG, thumbnail dimensions, deletion idempotence.
- Playwright (sample data): gallery grid and filters, viewer sheet showing extracted data, Open payment navigation, delete keeps data, retention setting persisted, clear-older-than preview counts, linking an unlinked bill, cash entry creation.
- Emulator (isolated package): capture → save → force-stop → reopen shows the photo; Save to Gallery produces a file visible to the system; cleanup after advancing the clock.

## Out of scope

Cloud backup of photos, OCR of Malayalam or handwriting, PDF bills, automatic linking without user confirmation.
