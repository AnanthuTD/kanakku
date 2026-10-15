# Merchant lookup implementation and provider choice

Verified against official provider documentation on 14 October 2026. Recheck prices and terms before changing providers or shipping a shared service.

The app first uses its on-device parser, user rules and semantic classifier. An optional Brave Search request may then display public-business evidence for an unclear transaction. It cannot reliably identify a private recipient, validate that a payment went to a result, or automatically alter the ledger. Publicly indexed VPA evidence may help the user name a merchant; many addresses have no public evidence. No LLM is required for displaying search evidence. A small offline LLM has no web index or search access on its own.

## Current functional integration

- Android personal-build BYOK: the user enters their Brave Search API key in Settings. It is encrypted using an AES-GCM key held by Android Keystore; JS cannot read a saved key. The typed value exists briefly in UI memory until save. No key is bundled, included in an environment variable, persisted to AsyncStorage, returned by status, or logged. For public distribution, use a metered backend proxy with server credentials rather than a common app key.
- Disabled by default. A separate switch allows automatic public-brand lookups. Automatic eligibility is deliberately an exact, small allowlist; it never treats arbitrary merchant names, VPAs, SMS fragments or person's names as a business.
- Unknown business names can be searched after the user reviews the query and confirms it is public. Input excludes numbers, identifiers, payment-language fragments and URLs. Only this name, India/search parameters and normal HTTP metadata reach Brave. No amount/account/bank/note/full SMS is sent.
- **Reviewed VPA lookup:** payment review has a separate “Look up a UPI ID” action. It prefills an original merchant label only when the whole label is one syntactically valid VPA, or accepts a single typed address. The screen shows the exact lowercase address to be searched and explicitly says the complete VPA reaches Brave and may identify a person. A per-address switch is required; editing the address, cancelling or reopening removes consent. Public-name approval and automatic-brand consent do not authorize a VPA query. The JS service and native boundary separately enforce this distinction and reject SMS fragments, multiple addresses, Unicode lookalikes, query operators and other payment fields. This is the user's requested exception to the earlier blanket payment-ID restriction; other payment identifiers remain excluded.
- VPA search is one quoted exact-address query (not a fallback search of guessed names), with at most five HTTPS sources and three bounded additional excerpts per source. [Brave's official Web Search guide](https://api-dashboard.search.brave.com/app/documentation/web-search/query) documents quoted phrase searches and `extra_snippets=true`. Exact-address evidence is computed only from visible sanitized title/snippet/excerpts with complete-token boundaries. Similar handles and addresses found only in a URL/query string are not treated as ownership evidence. Source cards distinguish “Exact UPI ID mentioned” from related results with no exact evidence; even an exact mention is not a verified owner or recipient. No exact mention produces an explicit unknown-merchant message, never a guessed merchant. The user opens sources and edits/saves the merchant themselves; category/remember/save choices remain independent.
- VPA consent is per request, with no automatic VPA searches, enrichment cache, saved results, or learned merchant mapping. Closing/changing/advancing a manually searched review clears transient evidence and cancels outstanding work; background/configuration/reset clears all work. Exact VPAs are not written to provider preferences or added to quotas/logs. Existing original transaction labels remain inside the encrypted ledger.
- Root integration keeps work serial and in foreground. Native independently checks foreground, consent, the allowlist, request bounds and quota. Background/reset/provider removal cancels requests. Errors keep review pending.
- Local caps are 20 attempted requests per day and 300 per month. Attempts reserve budget before networking; failed requests count. A 429 adds a cooldown. This is not a provider-side spending guarantee: users should configure dashboard limits too.
- Search sources are HTTPS-only, shown as possible matches with original titles, snippets and clickable sources. No webpage scraping, tool execution from result text, ledger mutation or automatic rule-learning occurs.
- Only in-flight requests are coalesced. Completed results exist in the active UI solely for display; there is no cross-request cache, in RAM or on disk. Background/configuration/reset clears and cancels work. Results are not written to the encrypted ledger, disk cache or merchant database. A user independently entering a correction remains their own decision.
- On 14 October 2026, a user-supplied credential was verified with one successful host-side public-business request for Netflix (HTTP 200, five HTTPS sources). No financial data was sent, and neither credential nor search results were saved to project files. The emulator now passes five credential Settings journeys and 30 native storage checks using deliberately invalid placeholders with lookup disabled and zero search attempts (artifacts/native-credential-results.json). Live Android activation/search responses, quotas and physical Keystore backing remain unverified. Unit tests exercise privacy boundaries, cancellation, deduplication, response sanitization, exact-VPA matching and no reusable result cache. Standalone Kotlin checks exercise the actual native query validator. Browser journeys exercise exact-address consent/revocation, validation and honest Android fallback without mocking product components. These are not live provider response proof.

## Brave

Official pricing currently lists **$5 per 1,000 Search requests and $5 monthly credits**. Older claims of 2,000 free requests are not a safe assumption for new accounts. Credits, account requirements and plan availability are provider-controlled.

The default terms allow transient storage required for app operation, but prohibit a persistent search-result database/cache. Storage rights require an explicit plan granting them. Do not turn active display results into a reusable merchant index without reviewing that agreement.

- Pricing: https://brave.com/search/api/
- API request/auth examples: https://api-dashboard.search.brave.com/app/documentation/web-search/codes
- Authentication: https://api-dashboard.search.brave.com/documentation/guides/authentication
- Terms, last updated 1 September 2026: https://api-dashboard.search.brave.com/documentation/resources/terms-of-service
- Privacy: https://api-dashboard.search.brave.com/documentation/resources/privacy-notice

## Gemini

Gemini can search via the `google_search` grounding tool; plain model completion does not search. The model/grounding allowance differs by model and billing tier. Current pricing lists Gemini 2.5 Flash free Search grounding up to 500 requests/day, shared with Flash-Lite limits, while newer models have different paid/free allowances. These are not a promise that a new account will have all those quotas or that searches cannot incur charges.

Gemini's unpaid services may use submitted inputs/outputs to improve products and may involve human review; their terms expressly say not to submit sensitive, confidential or personal information. Public-brand-only input is still necessary. Paid-project treatment differs.

**Gemini grounding is not enabled in the current merchant lookup.** Its official terms require displaying the associated Search Suggestions with the original Grounded Result, restrict caching/analysis/database use, and prevent treating grounded output as an automated merchant corpus. A future Gemini integration should be a separate user-initiated, faithful grounded-answer UI with Search Suggestions/citations, not a JSON extractor silently learning category rules. It also needs an appropriate native/web rendering implementation for the supplied suggestion HTML and current provider terms review.

- Pricing: https://ai.google.dev/gemini-api/docs/pricing
- Search grounding: https://ai.google.dev/gemini-api/docs/google-search
- Terms/data/grounding display and storage: https://ai.google.dev/gemini-api/terms
