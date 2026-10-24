# Kanakku 1.0 roadmap

Owner decisions taken 24 Oct 2026 for the move from closed testing to public production. CHECKLIST.md stays the acceptance record; this file holds product direction and order.

## Positioning

**The private spend journal for India.** It reads your bank SMS on the phone, with no login, no server and no ads. It asks about unclear payments in plain words.

Who it is for: salaried and student users in India who pay by UPI and card across one to three banks and want to know where the month went, without handing their bank data to a fintech.

Why us over Axio, Fold, CRED Money and ET Money: no account, no cloud copy of your transactions, on-device AI, and an honest total.

Business model: free, with no ads and no data sales. A future optional one-time supporter purchase may be added. No subscriptions in 1.0.

## Scope decisions

- **Core 1.0:** SMS import and capture, review with the companion, Activity, Insights, recurring payments, bill photos, voice notes (optional models), Drive backup, lending.
- **Labs** (off by default, behind Settings › Labs): MCP agent access, Gemini AppFunctions, Brave merchant lookup.
- **Gmail stays in the core app** (owner decision, 24 Oct): some banks, SBI in particular, send certain alerts only by email. Play approved the build for closed testing. Before production, the Google OAuth consent screen must leave "Testing" mode through restricted-scope verification. Kanakku parses mail on the device and has no server, so it should not need the CASA security assessment, but Google decides that during review. Until verification passes, only listed test users can connect Gmail, and testing-mode grants expire after seven days.
- **Floating overlay:** opt-in only, offered once after the user has reviewed a few payments in the app.

## Milestones

### M1: Trust the total (production blockers)
Progress 24 Oct: about 60 bank sender headers mapped; synthetic templates for SBI UPI, ICICI, HDFC, Kotak, IndusInd, PNB, BoB, Canara, Federal, AU, RBL, Axis, YES and KGB; promotional (-P) traffic rejected; unknown bank-like senders go to review; foreign-currency card charges keep their currency (older builds recorded the INR available limit as the spend, and re-import corrects those rows); unreadable bank alerts are counted with masked, user-shareable shapes; unlock explains retired keys. A masked, in-memory measurement against the owner's real inbox confirmed Axis payees and found the foreign-charge bug.

1. Generic fallback parser. Bank-looking alerts that the specific templates do not match go to Review with low confidence instead of being dropped. OTP and promotional rejection still runs first.
2. "Messages we couldn't read" counter in Settings, with a redacted, user-initiated "Share this format" action. Digits, names and VPAs are masked before the share sheet opens, and nothing is sent automatically.
3. Key invalidation recovery screen ("Journal locked → Restore from Drive backup / Start fresh") with a test.
4. Reboot, process-death and locked-capture verification on the emulator; fix whatever fails.
5. Play policy pass: Data safety re-review, foreground-service declaration video, lending and Brave disclosures.
6. Dependency advisories and the release-signing item closed.

### M2: Focus and first impression
1. Labs section, plus a Gmail build flag for the Play profile.
2. First-run recap after import: total found, payment count, top three categories, "N to review".
3. Real-app screenshots (synthetic data) and a listing rewrite that leads with privacy.
4. TalkBack, large-text and touch-target pass on the main journeys.

### M3: Useful every week
1. Credit card dues: parse statement and due SMS and send a gentle on-device reminder.
2. Account balances from "Avl bal" in alerts.
3. Home-screen widget showing month spend and the to-review count, with a quick cash entry shortcut.
4. CSV and PDF export (explicit, local, through the share sheet).
5. Monthly category plans, worded neutrally (no scolding).
6. Month-end recap notification that opens the rows behind it.

### M4: Reach
1. Hindi and Malayalam UI strings, and a Hindi Play listing.
2. Splits with friends, building on lending.
3. Tags and trips.
4. An in-app "Report a problem" button that drafts an email with the diagnostics log attached; the user must tap Send.

## Launch gates

- 12+ closed testers for 14 continuous days (Play requirement). The owner recruits them once the app feels production-ready, so the test period reflects real daily use.
- No crash or ANR clusters in Android vitals during the test period.
- At least five tester banks producing correct month totals, confirmed by the testers.
- M1 complete and M2 items 1–3 complete.

## Needs the owner

Recruiting testers, Play Console submissions (Claude prepares them and the owner approves each one), CASA verification cost and timing if Gmail is wanted on Play, physical-phone sessions, and redacted real SMS samples from testers.
