# Kanakku regression suite

Run all checks before considering a change ready:

```sh
npm ci
npx playwright install chromium
npm run test:regression
```

Node 24 is required for the real SQLite unit tests. Install JDK 17 and Kotlin 2.2.20+ (`kotlinc` on PATH) for the standalone native parser/import checks. On Linux, install browser system dependencies with `npx playwright install --with-deps chromium`.

`test:regression` runs TypeScript, the domain/storage/voice tests, six dependency compatibility checks, the Kotlin parser/tokenizer/import/review-policy checks, then Playwright against a fresh **production Expo web export**, served only on `127.0.0.1:8095`. It never reuses the developer's Metro server or tests an old export. Phone-sized Chromium (412×915 with touch) and desktop Chromium (1440×1000) run the same journeys in separate browser contexts. “Phone” is browser emulation, not Android device verification.

Each test seeds its own sample journal. The date is fixed at 14 October 2026 in Asia/Kolkata, while animation/event timers run normally. Reloads retain edits within that one test. Tests use accessible roles/labels and stable IDs, assert visible results and persisted journal state, and fail on uncaught JavaScript exceptions or console errors. They do not mock app components, import production financial calculators as the expected result, or share state with the user's preview. Controlled-switch updates are awaited with assertions, not fixed sleeps. There are no automatic retries that can turn a flaky failure into a green run.

```sh
npm run test:e2e                  # both browser sizes
npm run test:e2e:phone            # phone browser only
npm run test:e2e -- --grep review # focused investigation
npm run test:e2e:report           # HTML results
```

On failure, `test-results/` contains screenshot, video, DOM context and trace. Open a trace with `npx playwright show-trace <path-to-trace.zip>`. Reports/results are ignored by Git. The local GitHub Actions workflow runs the regression command for every push/PR and retains failure evidence; it becomes active when this folder is in a GitHub repository. Branch protection must require its check before merges to enforce a merge gate.

## Cases and expected outcomes

| Area | Regression contract |
| --- | --- |
| Ledger | Refunds subtract; repayment/income/transfer/excluded rows never inflate the ₹1,650 fixture total. Month navigation restores the correct period. |
| Privacy | Hidden amounts disappear from rendered values, transaction labels and chart labels; reveal restores them. |
| Search/filters | Search/account match, empty/clear search, combined dates/account/type/category/review, inclusive boundaries, invalid dates/reversed range refusal, draft cancellation and reset. Filters survive tab/settings navigation. |
| Scroll | A 200-row Activity journal restores its offset after a tab round-trip. |
| Insights | Category and merchant totals open contributing rows. Rolling questions show explicit periods; refunds affect answers. Ambiguous/unsupported questions clarify; editing clears stale results. Equivalent-period comparison excludes today and drills into both ranges. |
| Review | Category/note/merchant corrections persist after reload. Unrelated rows/totals remain intact. Undo restores prior fields durably. Queue skip preserves the skipped item, save-next advances, and undo restores review status. |
| Recurring | Repeated-charge evidence, confirm/ignore/restore persistence, unchanged ledger/totals, insufficient history and separate accounts. |
| Merchant lookup | Opt-in provider explanation, Android-only key collection, exact reviewed query/cancel, truthful web fallback and unchanged ledger. No real provider/network success is mocked. |
| Companion | Drag does not open voice, remembered snap/reset survives reload/resizing, corrupted placement recovers and dismiss preserves ledger. |
| Rules | Remember is explicit; mixed notes abstain. Rule alias/category edits affect future rules and retain past categories. Removal persists. |
| Transaction meaning | Transfer/repayment and exclude/include change totals correctly; undo and notes survive. Unsaved edits are discarded; blank merchants cannot overwrite existing records. |
| Voice/offline | Avatar voice entry exposes a clear Android-only fallback on web and a typed answer remains saveable. A loaded journal can be edited without a network. Real speech has separate device cases. |
| Settings | Light/dark/system and quiet/reminder preferences persist. Invalid quiet times refuse save. Direct `/settings` navigation/reload can return to Overview. |
| SMS setup | Calendar history selection, recent-first explanation, skip and cancel. Web cannot pretend to connect SMS/enable overlays/reset a native journal. |
| Recovery | Empty ledger and malformed preview storage produce usable, labeled states without hanging. |

Native UI flows and 16 pipeline/device scenarios are in [../android/ACCEPTANCE.md](../android/ACCEPTANCE.md). Browser tests do not verify SMS delivery, SQLCipher/Keystore, background WorkManager, real overlays, notifications or Malayalam/English accuracy. Those remain device release gates. Pixel-perfect visual baselines and broader real-bank fixtures are also separate acceptance work.

When adding a feature or fixing a bug, add the smallest user journey that would fail if that behavior regressed. Fix the cause of a failure; do not add sleeps/retries, weaken expectations, or update expected totals merely to match a broken implementation.

## Device-independent regression additions

Financial fixtures cover strict currency grouping and safe integer bounds, pending refunds, repayments, balances, correction-preserving replay and distinct event identities. A 10,000-row synthetic ledger checks exact totals and drill-downs; it is a correctness check, not a device performance benchmark. Recurring checks include leap/calendar boundaries, stale patterns, separate accounts and cumulative linked refunds. Mixed-purpose notes must abstain until a user chooses a category.

Keyboard journeys cover tab navigation and named dialogs, focus containment, Escape, focus return, fast typing and review-queue progression. Sparse avatar drag checks retain the complete pointer delta and prohibit accidental voice entry. Dependency checks exercise the actual installed query decoder and xcode UUID consumer.
