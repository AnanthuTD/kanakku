# Kanakku UX rework plan

Updated 20 October 2026. Phase 1 Settings navigation is implemented and all 20 Settings browser journeys pass on phone and desktop. This plan targets people who want a simple spending journal and may not know Android permissions, model downloads, OAuth, or backup encryption.

## Product goal

Make the everyday path obvious: open Kanakku, understand what was spent, fix anything unclear, and leave. Setup should explain only the decision in front of the user. Technical choices should remain available without being required to use the journal.

## Audit findings

- The Settings page currently stacks Gmail, Drive backup, optional models, theme, SMS capture/history, review notifications, floating companion, subscriptions, merchant search, app updates, voice, and beta diagnostics in one long scroll.
- Some necessary concepts are explained in dense paragraphs before the user knows why they matter: SMS access, history range, Gmail's mailbox-wide permission, Drive encryption/password, Brave lookup, and floating-window access.
- There is already a better pattern in a few places: camera and voice offer a prompt when the user first tries them; missing model downloads have a point-of-use install prompt; SMS history import has progress and recovery controls. Reuse these patterns.
- The first-run path currently directs people to Settings to connect SMS. This makes the primary job feel like configuration rather than “see your spending.”
- Theme choices are visual and understandable; developer diagnostics and model management are not everyday settings and should not compete with the main controls.

## Recommended experience

### First run: guided setup, not a tour carousel

Use a short, interruptible checklist with a visible “Skip for now” and a progress state. The user can reach the journal after any step and resume later. Avoid a multi-page feature tour that blocks the product.

1. **Welcome:** “Your spending, brought together.” Show a real sample activity and the privacy promise in one sentence. Actions: “Set up my journal” and “Explore with sample data.”
2. **Connect bank alerts:** Explain immediately before Android asks: “Kanakku reads SMS on this phone to find bank transactions. Message text is checked on your phone; OTPs and unrelated messages are discarded.” Link “What Kanakku can read” for more detail. Then show the history choices (for example, 1 month, 3 months, 1 year) with a plain-language estimate of what happens next.
3. **Import progress:** Land on the journal as soon as the recent slice is ready. Show a dismissible, persistent progress card: “Adding older transactions · 34%” with “See progress” and “Pause.” Keep the notification in sync; never make the user wait on a blocking screen.
4. **Optional next steps, only when relevant:** Offer Gmail when bank-card alerts are missing, backup after the journal contains data, and camera/voice only on first use. Do not ask for Gmail, Drive, camera, microphone, overlay, or model downloads all at once.

The home screen should own the setup checklist when unfinished. Each row has one next action and a one-line benefit. Completing or dismissing a step updates the home screen; Settings is never a prerequisite to get started.

### Home and daily use

- Keep the monthly total, period, and “what needs your attention” as the first visual hierarchy.
- When setup is incomplete, replace the generic “Connect bank SMS in Settings” line with a direct “Connect bank alerts” action that starts the guided permission flow.
- Empty states should offer one next action, explain what will appear, and retain a sample-data option.
- Make review actions plain: “Choose a category,” “Name this person,” “This was a transfer,” and “Not a spend.” Keep AI confidence and parser/source diagnostics out of the primary surface.
- Treat the avatar as a helper, not the only way to review. Its prompts must have an equivalent list/action path and respect dismiss/snooze.
- Keep source, date, account hint, and correction controls available on a transaction detail screen; hide infrequent technical metadata under “Details.”

### Settings information architecture

Replace the long stack of cards with a compact Settings index of grouped rows and focused subpages. Show concise status summaries on each row (Connected, Off, Last backup today, or Needs attention).

**Everyday**
- Bank alerts & import — capture on/off, history import, import progress.
- Spending reminders — review reminders and quiet time.
- Appearance — System, Light, Dark, text/accessibility preferences.
- Companion — floating avatar, placement preview, sounds.

**Data & accounts**
- Email alerts — Gmail connection, history range, last sync, disconnect.
- Backup & restore — last successful backup, backup frequency, Google account, restore.

**Advanced**
- Merchant lookup — Brave key, automatic brand lookup, VPA consent explanation.
- Voice & smart categories — optional model sizes/download/remove and language.
- App updates.
- Privacy & security — lock, diagnostics, reset/export controls. Destructive reset stays isolated, explained, and confirmed.

Keep the Settings home short enough to scan without scrolling on a typical phone. Advanced can expand inline or open a separate page; avoid hiding a core task such as choosing Dark theme or changing import history.

### Explanation and consent pattern

- **Before OS/Google/provider consent:** explain what data is accessed or sent, where it goes, what Kanakku does with it, and the practical alternative. This applies to SMS, Gmail, Drive, Brave/UPI, microphone, camera, and display-over-other-apps.
- **For reversible preferences:** label the control in plain language and put mechanics under a disclosure such as “How this works.” Do not put paragraphs beside every switch.
- **For irreversible or replacing actions:** explain the consequence before the final action and require a clear confirmation. Restore/reset must say whether data is replaced, merged, or retained.
- **Errors:** show the issue beside the failed action and a direct recovery button (for example, “Open Android permission settings”), retaining the user’s current selections.
- Avoid jargon such as OAuth, WorkManager, model, VPA, SQLCipher, token, and foreground service in user-facing copy. Use a “Technical details” disclosure for the few people who want them.

## Additional improvements to evaluate

- An optional “What is this?” help link and a searchable help page for privacy, source coverage, missing bank alerts, transfers, backup recovery, and the meaning of estimates.
- A “data coverage” explanation beside totals, so users can distinguish captured SMS/email activity from uncaptured card/bank activity without assuming the journal sees every purchase.
- Better recovery for denied permissions: detect the denial, explain its effect, link to the exact Android settings page, and keep manual entry available.
- First-use coachmarks only after a user reaches the relevant screen; each must be dismissible, never auto-advance, and not repeat after dismissal.
- Respect larger font sizes, screen readers, reduced motion, dark mode, and one-handed reach. Tap areas should meet Android touch-target guidance; no interaction should depend on color or dragging alone.
- Use concise, warm copy and consistent verbs. State success (“Older transactions are still being added”) and next action instead of implementation state (“queued”, “backfill”, “worker”).

## Delivery phases

1. **Structure and copy — in progress:** grouped Settings index and focused pages are implemented; each menu item opens its own section and returns to the index. Continue moving/debugging advanced controls, direct setup links, and plain-language explanations.
2. **Guided first run:** checklist on home, inline explanations and opt-in permission requests, quick access to sample mode, resumable progress.
3. **Trust and recovery:** data coverage, source-specific help, clearer error/reconnect/restore flows, and personal-data confirmations.
4. **Polish and validation:** dark/light contrast, larger text, talkback order/labels, reduced motion, small-screen/landscape checks, and end-to-end tests for setup, skip/resume, denial/retry, and settings deep links.

## Acceptance criteria

- A new user can start seeing useful activity without reading a long introduction or enabling optional services.
- No sensitive permission prompt appears without an immediately preceding plain-language explanation and an available defer path where the feature is optional.
- A user can find and change SMS import, theme, reminder, and backup controls from clearly named Settings groups.
- A user who denies or skips a step can recover from the home screen without hunting through Settings.
- Core screens work with Android large text, TalkBack, both themes, and reduced motion; all primary controls have accessible names and at least 48dp touch targets.
- Existing journal, review, import progress, Gmail/Drive consent, model, and reminder behavior remains intact through UI refactors.

## References

- Skill applied: `ui-ux-pro-max` mobile UI/UX guidance for progressive forms, accessible control labels and states, 48dp touch targets, theme contrast, safe areas, reduced motion, and clear error recovery. Its generated SaaS glassmorphism palette/typography was rejected as a poor fit for Kanakku.
- Android permission UX: https://developer.android.com/training/permissions/requesting
- React Native accessibility: https://reactnative.dev/docs/accessibility
