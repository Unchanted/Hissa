# Preflight — finalist execution plan

Planning snapshot: **6 November 2026, 12:12 IST (06:42 UTC)**. Deliverable for this pass: this plan only. Nothing below is an implemented capability unless marked verified.

## 1. Verdict and pitch

**Build one plan-aware hygiene companion with an optional sponsored slot; target ETHGlobal Finalist first, two partner integrations second.** The interesting moment is a wallet with no current token exposure becoming exposed because of a plan the user has confirmed. Show that consequence, a safer ordering, and the user's control. Then show that commercial personalization can be switched off without losing that help.

One-line pitch: **Preflight remembers what you intend to do, warns before funding makes an old approval dangerous, and lets you choose which sponsored topics can influence offers without handing publishers your wallet profile.**

The two surfaces strengthen each other only conditionally: hygiene gives people a reason to return; explicit topic controls let that trusted companion mediate optional offers; a small publisher integration could fund distribution. Sharing memory means a user-controlled memory with purpose-specific projections, not feeding security findings into an ad engine. Advertising also creates a conflict of interest: a security warning must never become a sales opportunity. The demo must make this separation observable.

### What we found

| Status | Evidence / implication |
| --- | --- |
| **EXISTS / inspected** | Local root contains only `.git`; `rg --files --hidden` excluding `.git` found no project files. No README, PLAN, notes, app, contracts, packages, fixtures, or graphify graph. No applicable ancestor AGENTS.md found. |
| **EXISTS / inspected** | Git has unborn `main`, no commits; configured remote is `git@github.com:Unchanted/ethglobalmumbai26.git`. Remote contents and any outside/private notes were not inspected. |
| **MUST BUILD** | Every product flow, SDK, simulation, test, integration, deployment, and submission artifact in this document. No existing behavior can be reused. |
| **SIMULATED by design** | Controlled ERC-20 scenario and sample campaigns; no real advertiser, publisher revenue, real debt, or malicious-spender claim. |
| **NEEDS VERIFICATION** | Team size/availability, registered track, event-start provenance, credentials/credits, wallet support, hosting, Arkiv access and inference execution. An empty local repo alone does not establish Classic eligibility. |

Do not spend this pass installing graph tooling or generating architecture artifacts for an empty repository. The user brief is the only available project note. Do not represent hypothetical implementation as repository evidence.

### Adoption and competitive judgment

| Established pattern | Preflight's proposed difference | What our demo can establish |
| --- | --- | --- |
| Approval tools such as [Revoke.cash](https://revoke.cash/learn/approvals/what-are-token-approvals) already explain allowances and let users revoke. An allowance can remain relevant when a wallet is funded later. | Join a confirmed future funding plan to current destination allowance state; prompt before that funding. | Correct reasoning and transaction preparation for one supported token/spender scenario. Not novel allowance mechanics, comprehensive threat detection, or guaranteed protection. |
| [Addressable-style targeting](https://www.addressable.io/platform/targeting) builds wallet-based audiences; [its wallet-list feature](https://www.addressable.io/product-updates/february-product-updates) accepts advertiser wallet lists. | Publishers do not get a wallet audience, profile lookup, or segment-query API. Matching runs inside Preflight using explicitly approved coarse topics. | That our documented interfaces and recorded traffic omit those fields. Not that publishers cannot independently analyze a wallet they already know. |
| [Brave](https://ads-help.brave.com/campaign-performance/targeting/) already performs matching on-device. Local matching and opt-in advertising are established. | Combine useful wallet hygiene and portable, explicit offer preferences, with a lightweight dApp slot rather than requiring a new browser. | A small cross-origin implementation and opt-out transition. Not Brave-scale privacy, measurement, adoption, or economics. |

**Who installs Preflight:** initially a DeFi user managing a funding wallet and a repayment wallet who wants a check before moving funds. For this MVP “install” means open the Preflight web app, connect a wallet, and save a plan/preferences; no extension installation. Return visits recheck confirmed plans on app open or explicit refresh. No background monitoring or push notifications claim.

**First publisher:** a small independent DeFi dashboard or educational dApp with an existing non-security sidebar slot, whose maintainer can try a tiny embed and contextual offers without requiring every visitor to adopt Preflight. Pitch integration effort and user control; revenue is a hypothesis. Our demo publisher is team-operated and proves integration mechanics only. Seek one maintainer's willingness to pilot after the event; do not invent a partner or revenue number.

**Cold start:** every visitor gets the same reviewed contextual catalog behavior without connecting a wallet or opening Preflight. An optional “Use my Preflight preferences” handoff enables personalization. If handoff/storage fails, contextual behavior continues.

**Advertiser demand is unproven:** sample campaigns establish neither willingness to pay nor conversion lift, inventory quality, fraud resistance, or publisher yield. Next commercial experiment: ask three benign Web3 education/hardware vendors to commit to a small pilot, with explicit success criteria; do not build an exchange first. If hygiene users distrust sponsorship or publishers require wallet targeting, the combined thesis fails even if both demos work.

## 2. Verified event constraints and remaining time

Official pages checked live on 6 November 2026:

| Source | Verified rule relevant to execution |
| --- | --- |
| [Event details](https://ethglobal.com/events/mumbai/info/details) | Submission closes **Saturday 7 November 2026, 09:00 IST = 03:30 UTC**; late entries rejected. Select Finalist judging and at most three partners. Live slot: four-minute demo plus three-minute Q&A. |
| Same details page | Classic work must start during the event; maintain incremental history, disclose reuse and AI assistance, include planning/spec artifacts, and show meaningful human contribution. Video upload requires 2–4 minutes, at least 720p, human narration. |
| [Prize index](https://ethglobal.com/events/mumbai/prizes/) | Finalist is the top-ten-team category. Prioritize a working, clear, memorable product over extra integrations. |

At the snapshot there are **20h48m to the hard deadline**, not a fresh 36–48-hour hackathon. Schedule below starts at 12:30 IST, leaving 20h30m. Target initial submission at 07:45 and final verification by 08:30. Team availability is unknown: budget **one primary builder**, about 11 hours of product/integration work, a protected three-hour sleep break, and time for verification, recording, and submission. More people may parallelize roles; this plan must not depend on them.

If implementation starts later, recalculate `09:00 IST Nov 7 − current time`; do not shift the deadline. Cut third partner, then optional live-chain work, then additional polish. Keep the two observable outcomes and wallet approval. If fewer than 10 working hours remain, use fixture reads plus local execution proof and target only partners already passing smoke tests. Recheck dashboard for assigned judging and any organizer updates before submitting; authenticated dashboard state is not verified here.

## 3. Cohesive product flows and invariants

### Hygiene: a plan changes the meaning of an allowance

1. Open Preflight with demo wallet A; select supported destination wallet B, controlled by the same demonstrator. Enter: “Move 800 USDC to my repayment wallet B to repay 500 USDC.” Resolve `B` locally; never send its literal address to the model. The 500 repayment is user-stated intent, not a discovered live debt.
2. A real 0G call extracts a typed draft using aliases and amounts only. Display the draft for correction, including chain, token, destination, funding amount, and repayment amount. **Only an explicit Confirm creates a confirmed plan.** Model text is untrusted and cannot authorize anything. Manual entry remains available when inference fails.
3. Read `balanceOf(B)` and `allowance(B, S)` for one known ERC-20/spender pair, at one pinned block. Display chain ID, token/spender addresses, decimals, block/hash, retrieval time, source label, and evidence links or fixture manifest. No all-wallet approval discovery claim; ERC-20 allowance mappings are not enumerable through that read.
4. Baseline: B holds 0; S has allowance at least 800 USDC. With amounts in integer base units:
   - `currentExposure = min(balance, allowance) = 0`.
   - `conditionalExposure = min(balance + confirmedIncoming, allowance) = 800 USDC`.
   - Label: **“0 USDC currently exposed; up to 800 USDC after this funding, if this spender can exercise its allowance.”** This is a conditional upper bound, not an expected loss or evidence that S is malicious. A debt of 500 does not cap what S can spend before repayment. If 500 is repaid first and nothing else changes, only 300 remains exposed afterward.
5. Show a proactive finding on confirmation or refresh: “Revoke this allowance from B before funding B.” Explain prerequisites: user controls B, B has native gas, correct chain/token/spender, and receipt must confirm revocation. If B is not controlled, offer an explanation and stop; A cannot revoke B's allowance. Never suggest that zero token balance means zero gas is needed.
6. User selects Prepare revoke. Build only `token.approve(S, 0)` with `from=B`, correct chain and zero native value. Display a human-readable preview. A separate user gesture asks the wallet to review/sign/send. Cancellation changes no plan or consent state. After receipt, reread allowance at the confirmed block; only then show that this allowance is revoked and offer the funding checklist.
7. Funding remains a separate wallet-approved action or manual step. No automatic batching, background signatures, or unapproved agent execution. “Agent mode” in the MVP means proposing the next step and preparing one transaction. No guarantee against compromised keys, other approvals, permits/Permit2, fresh approvals, reorgs, or transactions reordered before revocation confirms.

**Execution proof, budgeted rather than hand-waved:** use Anvil chain 31337, a minimal six-decimal `MockUSDC` explicitly labeled “USDC fixture, no monetary value,” source wallet A funded with 800, B with zero, and a deliberately callable test spender S with an allowance of 1,000 or maximum. Give B native test gas. Pin compiler/dependencies and retain deployment/seed script and run output. This is the default supported demo chain; public-chain USDC is optional.

From an identical snapshot, run both branches with real local EVM receipts:

| Branch | Sequence | Observable result |
| --- | --- | --- |
| Transfer first | A transfers 800 to B; test spender calls `transferFrom(B, sink, 800)` before a later revoke | B ends with 0; sink receives 800. Show successful receipts and allowance/balance diffs. Repayment intent cannot then be fulfilled from those tokens. |
| Revoke first | Reset; B confirms `approve(S,0)`; A transfers 800; spender attempts same transfer | Spend reverts; B retains 800 and allowance is zero. Show revert evidence and balances. No repayment contract required. |

The test spender intentionally permits the exercise; this does not prove an arbitrary production contract has the same attack path. Snapshot IDs, chain identity, call sequence, transaction hashes and final balances belong in evidence. If local EVM proof cannot be made reliable by 17:15, show clearly labeled arithmetic/receipt fixtures and say **“execution-order hypothesis not demonstrated”**. Do not fabricate successful simulation. This downgrade materially weakens the finalist story.

Optional public testnet read: use Sepolia only after verifying RPC, actual deployed token code/decimals, known spender, and B's initial state. Clearly identify test tokens, and never relabel a fixture as Circle-issued USDC. Public-mainnet reads can be read-only but are not necessary. Repay-on-behalf is stretch: verify exact protocol/chain/asset, ABI semantics, variable/fixed debt mode if applicable, beneficiary rules, required approvals and gas, then fork-test reduction in debt before claiming a route works. Do not put it in the core pitch.

### Sponsored slot: same person, separate purpose

Keep wallet, publisher context `defi-dashboard`, slot, and catalog version fixed throughout. Use three fictional, clearly labeled **sample sponsored campaigns**; no advertiser relationship implied:

| ID | Creative | Context | Approved-topic association |
| --- | --- | --- | --- |
| C01 | “Learn how stablecoins work” | `defi-dashboard` | `education` |
| C02 | “Explore a hardware wallet workshop” | `defi-dashboard` | `hardware-wallets` |
| C03 | “Read the Web3 builders newsletter” | `defi-dashboard` | `developer-tools` |

Deterministic rule: filter active campaigns by fixed context and validity; if a valid personalization consent exists, prefer campaigns intersecting the locally approved topics; break ties by campaign ID. Otherwise return the first contextual candidate (C01). No bid, wallet query, AI ranking, hidden commercial weight, or risk-based eligibility. Empty/expired catalog means “No sponsored offer available.”

1. Publisher page displays contextual C01 without any wallet connection or topic consent.
2. Open the Preflight handoff; same wallet A remains associated with Preflight's private workspace. User can express “I'm interested in hardware wallets”; suggestions may come from authorized activity or explicit preference, but MVP uses the latter. Never infer a topic from the allowance warning, debt or funding plan. Show suggested topics as unapproved.
3. User approves `hardware-wallets`; a **separate, unchecked** control grants personalization for this publisher origin and catalog purpose. Topic approval alone leaves C01. Consent alone with no approved topics leaves C01.
4. Matching within Preflight chooses C02. Show “Sponsored · Personalized by your Preflight settings” inside the Preflight frame. Neither mode nor topics need to be sent to publisher JavaScript.
5. Click “Disable personalization” inside the frame. Invalidate the consent revision, clear session topics/selection caches, cancel or ignore pending old-revision results, and synchronously rerender C01. Return to the hygiene screen: plan and finding still exist, and revoke preparation still works.
6. Inspect a **sanitized evidence panel and actual browser network/messages**, including absence of advertiser calls before click. Do not merely assert privacy from an architecture drawing. Keep the panel out of publisher-controlled UI; the judge can inspect Preflight locally.

Consent is per purpose and publisher origin. No personalizing a new origin by implication. Closing the widget clears its session; reopening defaults contextual until an explicit handoff. Opt-out does not retroactively erase previous impressions or clicks. Do not promise universal cross-device revocation.

## 4. Concrete architecture, schemas and data visibility

### Choice: Preflight-origin iframe plus explicit user handoff

Build a small TypeScript/React web app with Vite, a thin Node server for the secret 0G credential and static delivery, `viem` for chain calls/wallet preparation, Web Crypto for encryption, and `@arkiv-network/sdk`. There are no installed dependencies to reuse today. Avoid a database, SDK registry release, chat framework or extension. One tiny publisher bootstrap module and one demonstrator page are enough.

Serve Preflight and publisher from **different origins**: locally `http://localhost:5173` and `http://localhost:5174`; deployed use two HTTPS hosts. Ports create an origin boundary locally, but same-site localhost is not proof of real third-party browser behavior. Test deployed cross-site hosts too. Host Preflight app, handoff, and slot frame at the same Preflight origin so the handoff can read Preflight storage in a top-level window.

| Option | Why / decision |
| --- | --- |
| Normal SDK running in dApp origin | Good for contextual UI; **no privacy boundary from the publisher**. Publisher scripts can read its DOM, local storage, function arguments and in-origin state. Never load Preflight profiles into it. |
| Preflight-origin iframe | Chosen: same-origin policy separates DOM and state; Preflight owns matching and rendered creative. Publisher still controls placement, observes traffic metadata and may infer displayed content through side channels. This is a boundary, not anonymity. |
| Extension/content-script bridge | Potential persistent user-side state with strong isolation if implemented correctly, but installation, permissions, review, bridge security and browser support exceed this budget. Deferred. |

Minimal integration contract (strict allowlist, reject unknown keys):

```ts
mountPreflightSlot(element, { publisherId: 'demo', slotId: 'sidebar', context: 'defi-dashboard' });
// Publisher -> frame: { v:1, type:'INIT', sessionNonce, publisherId, slotId, context }
// Frame -> publisher: { v:1, type:'READY', sessionNonce } // fixed dimensions; no selection/profile response
```

Use exact `targetOrigin`, verify `event.origin` **and** `event.source` in both directions, validate bounded enums/lengths/version and per-instance random nonce; bind publisher ID to a configured origin. No `*`, arbitrary context strings, parent wallet messages, arbitrary URLs, topic-lookup endpoint, arbitrary segment queries or ad callbacks returning profile/selection. Nonces correlate this frame only and never enter reporting. Deny unsupported publishers and rate-limit reinitialization; lock a session's reviewed context and catalog.

**Storage and handoff:** do not depend on third-party cookies, unpartitioned localStorage or Storage Access API permission. Frame starts contextual. A user-initiated click opens a Preflight-origin handoff window with exact publisher origin and a fresh nonce; validate parameters against registration, not a caller-supplied redirect. Handoff loads first-party memory, displays topics and separate consent. Verify frame/window identity, origin and nonce before returning only approved topics and scoped consent **to the Preflight-origin frame**, never through the parent. Topics stay in frame memory, not iframe URLs. Close the handoff. Test opener behavior and COOP headers. If popup blocked, opener unavailable, state partitioned, or authentication fails, retain contextual and offer a top-level Preflight link; no URL token/profile workaround. Request no wallet permissions in the advertising frame.

Persist the opt-out synchronously in frame memory; while the handoff is open, propagate origin-validated revocation to that frame. A frame lost/reloaded across this transition defaults contextual and must reauthorize. Persistent multi-tab, remote-device consent synchronization is deferred; do not claim it. Keep hygiene available regardless of advertising/storage/handoff failures.

Restrict framing to registered publisher origins using CSP `frame-ancestors`; use a separate frame route with scripts and its own origin enabled, needed popup permissions, no top navigation, no wallet provider access and a restrictive `connect-src`. Do not weaken all app routes to be frameable. Render static text/local assets only, no advertiser JS, external fonts, pixels or creative HTML. Label same-origin fallback builds **“privacy boundary not demonstrated”** and remove corresponding privacy/partner claims.

### Internal schemas and invariants

All records have `schemaVersion:1`. Validate on network, storage and message boundaries. Amounts are unsigned decimal strings of base units; timestamps ISO UTC; addresses validated for chain use; never use JS floats for exposure. Local IDs below are not advertising identifiers.

| Schema | Required fields / rules | Storage and visibility |
| --- | --- | --- |
| `ChainFact` | `id, chainId, blockNumber, blockHash, fetchedAt, source(live/local-evm/fixture), token, decimals, owner, spender, balanceRaw, allowanceRaw, evidenceRef` | Preflight only plus RPC's necessary call inputs. Both reads must be at the same block; unknown/stale never equals zero. Fixture includes provenance. |
| `ConfirmedPlan` | `id, revision, chainId, token, sourceWallet, destinationWallet, incomingRaw, repaymentRaw, status(draft/confirmed/cancelled/completed), confirmedAt, inputSource(manual/0g), inferenceReceiptRef?` | Private Preflight memory; only confirmed status enters exposure calculations. Changes require reconfirmation. Encrypt one confirmed record on Arkiv. |
| `DerivedFinding` | `id, ruleVersion, planId, planRevision, factIds, currentExposureRaw, conditionalExposureRaw, assumptions[], explanation, proposedAction, computedAt` | Computed locally; no ad-service visibility. Reference exact facts/plan, deterministic math; never a model assertion of security. |
| `ApprovedOfferTopics` | `revision, topics: enum[education/hardware-wallets/developer-tools][], approvedAt, provenance(explicit-preference/authorized-activity), authorizationRef?` | Preflight first-party storage; approved subset only in authorized Preflight frame. No addresses, free text, history, balances, debts, risk or plan fields. Suggestions are a different draft state. |
| `Consent` | `revision, purpose:offer-personalization, publisherOrigin, state:off/on, topicRevision, noticeVersion, grantedAt?, revokedAt?, sessionExpiry` | Preflight only; default off, expires on widget session end; no public consent activity. Hygiene connection, plan confirmation and topic approval never imply this consent. |
| `Campaign` | `id, catalogVersion, advertiserLabel, contextEnum[], topicEnum[], title, staticAssetId?, reviewedClickUrl, startsAt, endsAt, disclosure, reviewStatus` | Public reviewed catalog. No arbitrary targeting rules, wallet lists, tracking URLs, dynamic third-party assets or security-warning placements. Full catalog identical for everyone. |
| `ReportingEvent` | `v, publisherId, slotId, catalogVersion, campaignId, kind:impression/click, dayUTC` | MVP local demonstration buffer only; no network transmission. Never append session nonce, user ID, wallet, topics, consent state, exact time or URLs. An event reveals selected campaign even without explicit topics. |
| `InferenceReceipt` | `requestId, model, provider?, requestedTier, servedTier?, verificationResult, timestamp, status` | Private evidence view; exported evidence excludes prompt/user identifiers and secrets. Request ID is not itself proof of privacy. |

**Boundary rule:** ad selector signature is `select(catalog, contextEnum, approvedTopics, activeConsent)`. It cannot import hygiene stores, wallet clients or findings. Reporting accepts only the listed event schema. Strip nothing silently: reject forbidden/extra fields, including wallet/address/plan/history/holdings/debt/risk fields. Do not hash a wallet into a supposedly anonymous ID. A hash remains linkable. The publisher may know the wallet through its own dApp; Preflight must not add a profile export to that knowledge.

### Data flow

```text
Wallet/RPC -> Preflight chain facts -----\
User -> confirmed plan ------------> deterministic hygiene -> preview -> user's wallet
User -> redacted draft -> Preflight relay -> 0G -> draft -> explicit confirmation
Confirmed plan -> local AES-GCM -> user-approved Arkiv write -> read/decrypt -> Preflight

User preference -> explicit topics approval + separate consent -> Preflight-origin frame
Publisher -> fixed context -----------------------------------> frame local selector
Reviewed full catalog ---------------------------------------> frame -> sponsored UI
Frame -> local event buffer (demo); no raw reporting sent to advertiser/publisher
```

### Who sees what (target MVP, to verify with captures)

| Party | Receives / can observe | Must not receive via advertising interfaces |
| --- | --- | --- |
| Preflight browser app | Wallets, chain facts, plans, findings, approved topics, consent, full catalog | This is the trusted user-side component; it can see the profile and a compromised Preflight frontend can leak it. |
| Preflight server/operator | Static requests, IP/UA, redacted inference payload and reply while relaying; service usage metadata | No raw wallet-history ingestion, no ad profile/selection endpoint. Disable body logs; a relay does not make inference end-to-end private from Preflight. |
| 0G router / inference provider | Aliased plan text and amounts at the model; service-account identity, request/model/timing/usage metadata. Plaintext visibility depends on actual route. | No literal user wallet, linked accounts, raw history or full memory. A non-private upstream can read submitted text. Private enclave still processes plaintext internally. See route gate below. |
| Publisher | Its own page/wallet knowledge; configured context; frame URL/READY, layout and handoff interaction; possible selected-campaign inference | Preflight topics, profile, consent record, chain facts, findings and plans; no lookup/query API. |
| Campaign service (static Preflight-hosted catalog endpoint) | Catalog version requests, IP/UA, request times; full catalog served identically | No wallet, topic or personal-selection request. Co-hosting does not stop Preflight infrastructure correlation; local matching removes the selection payload, not transport metadata. |
| Advertiser | Public campaign definition; **no per-user demo event report**. On deliberate external click: destination request, IP/UA/time and any independently known identity | No Preflight profile or user-level attribution. No raw events. |
| Arkiv / indexer / RPC | Public writer wallet, transaction times, entity IDs, ciphertext sizes, expiry and generic attributes; RPC learns lookup patterns | Plaintext plans, approved topics, consent activity or wallet profiles in attributes/payload. A writer address is visible protocol metadata, even when payloads are encrypted. |
| Hygiene RPC | Addresses, token/spender and read timing; wallet's broadcast provider sees submitted transaction | Separate trust boundary, not hidden by ad isolation. An RPC observer can correlate reads with public transactions. |

### Residual privacy risk and reporting limits

Local matching plus origin isolation proves a narrow property: raw memory is absent from the documented publisher/campaign/reporting payloads and publisher JS cannot directly read the frame DOM. It does not prove anonymity, noninterference, production browser coverage or absence of covert channels.

- **Creatives:** a distinctive campaign can imply a topic. Fixed benign topics/catalog, local assets, no scripts/pixels, no dynamically advertiser-chosen segments reduce this; screenshots, user behavior and browser extensions can still reveal it.
- **Probing:** repeated contexts/catalogs can fingerprint preferences. Register one context/slot for the demo, serve a versioned reviewed catalog, make matching deterministic and expose no selected-ID callback. Rate limits do not solve a publisher operating many origins; production needs enrollment/review and probing analysis.
- **Requests:** catalog fetches/frame loads expose IP and timing. Fetch the whole catalog, cache it, and make no selected-creative network request. IP logging/CDN correlation still exists. TLS and an iframe do not hide it.
- **Clicks:** use direct reviewed HTTPS destinations on explicit user gesture, `noreferrer`/`noopener`, no redirects, wallet parameters or per-user/campaign tracking IDs. The destination still sees the visitor and page requested; a wallet-connected landing page can correlate. MVP can use a static sample destination, labeled as such.
- **Reporting:** do not send live raw events during this demo. Show the minimal local buffer and a separately labeled synthetic daily-count report. Production aggregate release requires coarse daily campaign totals, suppression below a proposed threshold of 50 independent users, no arbitrary slices, anti-differencing and fraud controls; we have no privacy-preserving unique-user counter or secure aggregation. A threshold alone is not a privacy proof. Do not claim an advertiser dashboard or validated measurement system.
- **Opt-out:** stops future personalized selection immediately in the active frame; cannot retract historical observations, other parties' logs or screenshots. User-readable export and local reset are useful; neither establishes statutory deletion or erasure from a public chain.

Commercial ranking never imports security state. No sponsored module in warning cards, no paid “recommended fix,” no campaign-triggered signature or transaction. Only the hygiene component can prepare a transaction, and only a wallet can approve it.

## 5. Partners: two planned, third only after proof

### 0G — planned, conditional on real main-flow inference

[Official Mumbai track](https://ethglobal.com/events/mumbai/prizes/0g): target **Build with 0G Private Computer ($5,000 pool)**. Eligibility evidence: main-flow inference with request IDs, a usable returning-user app, and an explanation of what removal breaks. Submit public repo/setup, live link, video under three minutes, deployment addresses if any, team/contact details. Generic/removable AI is disfavored; iAI login/spending is optional and deferred.

**Meaningful use:** natural-language plan extraction is the entry flow, followed by explicit confirmation and deterministic checks. Removal breaks natural-language plan capture, not manual hygiene. Be candid that manual fallback survives; do not invent a need for an LLM to calculate `min()` or rank offers. The judge may still consider this insufficiently AI-centric; prize fit is weaker than core product fit.

**Route verification:** official [Router docs](https://docs.0g.ai/developer-hub/building-on-0g/compute-network/router/overview) identify `https://router-api.0g.ai/v1`; testnet is a different endpoint/account. [Privacy docs](https://docs.0g.ai/developer-hub/building-on-0g/compute-network/router/privacy) document `X-0G-Provider-Trust-Mode: private`, TeeML-only serving, `verify_tee:true`, attestation checks, and failure instead of lower-tier fallback. They distinguish verified TeeTLS from sealed inference. Never infer privacy from a model name or the “Private Computer” brand.

**Actually checked:** unauthenticated GET `/v1/models` returned HTTP 200 and 124 models at this snapshot; `0gm-1.0-35b-a3b` and `glm-5.3` were among TeeML entries. This verifies discovery only. **Not checked:** a paid/private completion, credentials, served route, signatures, attestation, retention enforcement or enclave implementation.

Use a capped service credential on Preflight server, never a management key in browser; send aliases and synthetic demo amounts only after disclosing relay/provider use. Record a real request ID, requested and served tier, model/provider, verified receipt/attestation result and sanitised output. Do not call a header alone “verified privacy.” Audit the exact hop boundaries: the Preflight relay sees text; provider enclave processes plaintext; operators' claimed inability to read it remains conditional on hardware, code and attestation. Standard/verified upstream providers may see text. Billing retains service-wallet identity, request IDs and usage metadata; no claim of metadata anonymity.

**Dependencies:** team credits/key, working text model on the chosen tier, output schema validation, receipt access, private route support. **Gate by 14:00:** one real extraction plus request ID; private claim requires route/verification evidence too. If Private fails, manual entry works; explicitly label non-private inference and obtain disclosure/consent before any such request, using synthetic text. Cut privacy claims immediately; cut prize pursuit if no real main-flow inference. Never manufacture IDs or silently downgrade a private request.

### Arkiv — planned, encrypted confirmed-plan recovery

[Official Mumbai track](https://ethglobal.com/events/mumbai/prizes/arkiv): **Build on Arkiv (from scratch), $4,000 pool**. Requires event-built app, a real write to current testnet using SDK/JSON-RPC and a user-visible read. Public licensed repo, README writer addresses and runnable query; `/arkiv/schema.md`, `/arkiv/friction.md`, `/arkiv/reach.md`, `/arkiv/why-arkiv.md`, `/arkiv/how-you-use-arkiv.md` cover schema and the four equally weighted judging criteria. Logging-only or install-only usage does not count. One track prize per team.

Choose **one encrypted confirmed plan**, not the public campaign catalog. Save the approved 800/500 plan, clear its local cache, then restore by entity ID through a fresh Preflight page and recompute the visible finding from new chain reads. Arkiv becomes the source of portable plan recovery across Preflight clients rather than a decorative receipt. Hosting a public catalog would be easier to query but interchangeable with static JSON and would not demonstrate user-owned memory. Do not claim that Postgres cannot store ciphertext; the advantage to prove is user-controlled ownership and independent public retrieval, with no Preflight account server granting access.

Use [Rabdi](https://docs.arkiv.network/), chain ID **7794095**, RPC `https://rpc.rabdi.db-chain.testnet.arkiv.network`; official [first-entity SDK guide](https://docs.arkiv.network/start-here/first-entity/) is the implementation reference. Network identity is documented; write/read latency, wallet integration, ownership enforcement and expiry behavior remain untested.

**Key/record design:** generate a random 256-bit AES-GCM key in browser using Web Crypto; unique random 96-bit nonce per encryption, authenticated version/record type, ciphertext envelope version + nonce + ciphertext. User's connected wallet owns/signs the Arkiv entity write; Preflight backend has neither wallet private key nor data key. Store only generic version/type attributes (`preflight.record`, schema version); no destination wallet, plan amount, topic, risk or consent attributes. Use seven-day expiry, explain cost/renewal and that expiry is availability policy, not cryptographic erasure from historical copies. Do not create a public consent log.

Key stays in Preflight-origin local storage for the demo, with explicit encrypted-memory backup/export of key + entity pointer to a user-controlled file. Local key storage is exposed to same-origin XSS or device access; use no third-party scripts and label demo strength. Do not derive the key from a public address or assume signing a message yields a secret. Restoration requires the exported key and entity ID; no key means no decryption and no recovery promise. Export contains sensitive key material; never upload or commit it. Wrong key/tampered ciphertext must fail closed. Wallet change never silently reuses another wallet's decrypted plan. Production key wrapping, hardware-backed storage and multi-device recovery are deferred.

Public metadata leaks writer identity, timing, ciphertext length, generic record existence and expiry. Payload encryption does not hide that. A storage-specific wallet could reduce linkage but is not in scope. Raw RPC lookup leaks are disclosed. **Gate by 14:45:** a real wallet-approved ciphertext write, entity ID/tx, and SDK read/decrypt shown in UI. If unavailable, keep local plan storage and remove Arkiv prize/portability claims; do not substitute a public plaintext plan or catalog merely to keep the badge.

### Slot three — CROPS vs CRE, default: no third partner

| Candidate | Official requirement | Visible evidence / fit / dependency / cut condition |
| --- | --- | --- |
| [EF Best CROPS App](https://ethglobal.com/events/mumbai/prizes/ethereum-foundation), $3,500 pool | Structural CROPS property working end to end; public FOSS repo/run instructions, README `CROPS` with C/O/P/S trade-offs, no client third-party trackers, key/personal-data handling explained; video at most three minutes shows the decisive moment. At most one EF prize awarded per project. | Prefer if we can stop Preflight backend, load a separately served public build, import user-held encrypted-plan backup/pointer, read Arkiv directly, choose another RPC and recompute hygiene, with contextual slot still working. Prove independent access, not “privacy toggle = CROPS.” No new inference while backend down. Dependencies: portable browser build, RPC/Arkiv CORS, exported key, recovery instructions. Disclose domain/RPC dependency, relay plaintext and storage metadata. Cut at 20:00 unless the full shutdown/recovery test is repeatable and the other CROPS trade-offs are credible. No EF tooling required for this track. |
| [Chainlink Best workflow with CRE](https://ethglobal.com/events/mumbai/prizes/chainlink), $1,500 | Meaningful CRE orchestration linking a blockchain with an external API/system/data/agent; successful CRE CLI simulation or live deployment. Simulation is explicitly sufficient. | If privacy/independence proof is thin, prefer a real CRE workflow reading allowance/balance and a minimal external confirmed-incoming input, returning a provenance-tagged result that visibly triggers Preflight's nudge. CLI output must reach the UI; no canned terminal run. Restrict external input to synthetic plan amounts and use no ad profile. Dependencies: CLI setup, credentials, supported chain read and result path. Differentiate CRE simulation from deployed automation. Cut unless a 90-minute spike yields end-to-end CLI-to-nudge evidence before 20:00. CCIP is a different track; no CCIP claim. |

**Decision:** recommend 0G + Arkiv only at baseline. Reassess at 18:00: choose CROPS if structural proof is nearly free from the existing restore flow; otherwise CRE only if a team member already knows it and can meet the visible-workflow requirement. Solo builder should keep two. Do not spend the core-demo budget making a third partner sound integral. If a planned partner fails, submit fewer; selecting a checkbox cannot replace evidence.

## 6. Scope, trade-offs and kill criteria

| MVP / must deliver | Stretch only after acceptance tests pass | Explicitly deferred |
| --- | --- | --- |
| One chain/token/spender, confirmed 800/500 plan, evidence-based warning, wallet-reviewed revoke | Verified public testnet/mainnet reads; second supported pair | Multichain indexing, comprehensive approval discovery, protocol risk scoring |
| Local EVM ordering proof with named fixture state | Verified protocol repayment or repay-on-behalf route | Autonomous fund movement, session-key agents, transaction batching |
| One publisher, three reviewed campaigns, contextual → explicit personalized → contextual | Third partner proof, broader browser checks | Bidding, cross-site attribution, payments, tokens, advertiser self-service |
| Separate-origin frame/handoff and strict message contract | User research / external pilot confirmation | Extension, production SDK package release, cross-device consent sync |
| Real 0G extraction and real encrypted Arkiv plan restore if gates pass | Independent access proof for CROPS | Production privacy/security certification, secure ad measurement |

Stop rules:

- Never sacrifice a working warning, opt-out or wallet approval to preserve a prize integration.
- No mainnet value transfers for demo setup; use disposable local/test wallets. No private keys or API credentials in Git, videos, browser bundles or exported evidence.
- A stale/unavailable chain read is “unknown,” not “safe.” Disable transaction preparation on wrong chain, wrong owner, unknown token code or mismatched plan/fact revision.
- Third-party storage failure means contextual, not a profile in URL or publisher local storage.
- If separate origins cannot be deployed/tested by 20:00, label same-origin limitation, remove privacy-boundary claims and third partner, and preserve mechanics.
- Freeze features at 21:30. From then on only correctness fixes, missing submission artifacts, rehearsal and evidence. No extra chain, sponsor or dashboard.
- If Arkiv cannot restore independently, do not claim user-owned portability; if inference cannot prove Private routing, do not claim sealed inference; if ordering is arithmetic-only, say so during demo.

## 7. Milestones by remaining time and owner

Owners are roles, not invented teammates: **B = primary builder**, **F = founder/presenter**. Assume the same person does both. A real second teammate can take F's evidence/submission work and partner troubleshooting. All times IST; remaining time measured to Nov 7 09:00.

| Window | Time remaining at end | Owner | Deliverable / gate |
| --- | --- | --- | --- |
| Nov 6 12:30–13:15 | 19h45m | B/F | Scaffold two origins, runnable local demo, fixed schemas and fixture manifest, wallet connect; initialize incremental commits. Confirm dashboard track, credentials, hosting; first 0G discovery/private request and Arkiv connection smoke attempts. |
| 13:15–14:45 | 18h15m | B | Time-box partner primitives: real plan extraction/request ID by 14:00; ciphertext write/read/decrypt by 14:45. Save sanitised evidence; apply cut rules immediately. |
| 14:45–17:15 | 15h45m | B | Core hygiene UI and deterministic finding, local Anvil seed and two-branch proof, revoke preview/wallet cancellation/receipt refresh. One narrow supported-pair test suite. |
| 17:15–19:15 | 13h45m | B | Publisher bootstrap, separate-origin frame, handoff, topic approval + separate consent, deterministic campaigns, immediate opt-out and continued hygiene; local visibility panel. 18:00 third-partner go/no-go; any spike comes out of this allocation, not extra hours. |
| 19:15–20:00 | 13h | B/F | Deploy both hosts, test cross-site handoff with third-party cookies blocked, record traffic; stop third-partner work at 20:00. |
| 20:00–21:30 | 11h30m | B/F | Full acceptance run; fix failures, check secrets; fresh-page Arkiv restore; prepare README/setup/license and partner evidence/docs. Feature freeze. |
| 21:30–00:30 | 8h30m | B/F | Protected sleep/rest. Do not assume a free overnight second shift. |
| Nov 7 00:30–03:00 | 6h | B/F | Fresh-start smoke test, artifact completeness, privacy/negative cases; correctness fixes only; four-minute rehearsal. |
| 03:00–04:30 | 4h30m | F | Record human-narrated **2m45s** submission video (fits general and stricter partner durations), capture stills, upload and verify playback. Keep separate live four-minute script. |
| 04:30–06:30 | 2h30m | F/B | Fill submission and partner explanations; check external links/public repo and setup in a clean environment; backup demo recording/local fixture; buffer for failures. |
| 06:30–07:45 | 1h15m | F | Submit Finalist + only evidenced partners. Verify submission confirmation and selected tracks. No late feature work. |
| 07:45–08:30 | 30m | F | Reopen submitted project, verify uploaded video, live link, repo commit and partner materials; inspect dashboard judging assignment. |
| 08:30–09:00 | 0 | F | Emergency correction buffer. Hard stop at 09:00. |

## 8. Dependencies and smallest useful smoke tests

These are future tests, not tests run in this planning pass. Keep evidence paths simple: `evidence/manifest.md`, sanitized captures, command outputs and named test results. Every item identifies fixture/live/simulated source, timestamp and implementation commit.

| Dependency | Smallest smoke test | Failure behavior |
| --- | --- | --- |
| Node runtime / build / hosting | Clean install from lockfile, typecheck/build, serve Preflight + publisher at distinct origins; fresh browser renders both | Fix setup before product work; do not add another framework. |
| Browser wallet + viem | Connect, switch to local chain, reject a revoke request, then approve from B; confirm receipt/readback | No silent signature or wrong-account fallback. Manual instructions if wallet unsupported. |
| Anvil/token/spender | Seed baseline, pin reads, reset same snapshot, run both ordering branches and assert balances/allowance | Explicit fixture-only downgrade; retain arithmetic test. |
| 0G key/credits/model | Synthetic aliased extraction, strict schema parse, actual request ID and served-tier evidence | Manual plan entry; cut unearned partner/privacy claims. |
| Arkiv faucet/access/wallet | Correct chain, wallet-approved AES-GCM ciphertext write, receipt + entity ID; visible SDK read/decrypt after local clear | Local-only memory with banner; never plaintext fallback. |
| Browser handoff | With third-party cookies disabled, top-level user gesture supplies approved topics to Preflight frame; blocked popup stays contextual | No new tracking identifier or storage bypass. |
| Catalog/clicks | Full versioned catalog fetched once; changing local topic makes no new selection/asset request; external link has no referrer or tracking parameters | Render no offer if invalid; no advertiser code execution. |
| Optional CRE / CROPS | CLI-to-UI nudge or backend-off independent restore, respectively | Cut third partner rather than replay canned output as live. |
| Submission access | Dashboard works, repo public without secrets, video and deployed URLs accessible in signed-out browser | Resolve before 07:45; retain local recording and fixture demo. |

## 9. Acceptance tests — judge-visible definition of done

1. **Honest evidence labels:** every screen shows local EVM/live/fixture source, block and timestamp; inference IDs and Arkiv receipts are real or capability is explicitly disabled. Debt is labeled user-stated. No sample advertiser is presented as a customer.
2. **Exposure math:** integer tests assert `(balance=0, allowance>=800, incoming=800) -> (0,800)` in six-decimal units; allowance 200 caps future exposure at 200; allowance zero yields zero; stale/missing reads yield unknown, not zero; drafts/cancelled/revised plans cannot silently reuse findings.
3. **Ordering proof:** repeatable same-snapshot EVM run shows transfer-first successful 800 drain and revoke-first reverted drain with B holding 800. Output includes seed, addresses, chain, receipts and balances. If omitted, explicitly fail this acceptance item and disclose the limitation.
4. **Approval and owner control:** A cannot prepare a revoke as though it owns B; account/chain mismatch blocks; wallet cancellation sends nothing; no signature prompt on connect, page load, topic approval or ad interaction; confirmed receipt and fresh allowance read precede “revoked.”
5. **Plan confirmation:** malformed or hallucinated 0G fields are rejected; addresses resolve only locally; edited plans require reconfirmation; no model output becomes a transaction or fact. 0G outage still allows manual hygiene.
6. **Sponsored sequence:** hold wallet/context/catalog constant. Default=C01; topic approval without consent=C01; valid consent + `hardware-wallets`=C02; revoke=C01 immediately. Slow pending old-consent work cannot restore C02. A new frame session defaults contextual.
7. **Purpose separation:** after opt-out, same confirmed plan, exposure finding and revoke preparation remain usable. Tests/import checks show ad selector cannot read hygiene state; paid campaigns cannot populate warnings or actions.
8. **Origin boundary:** publisher script cannot read frame DOM/storage; spoofed origin/source, stale nonce, extra wallet/topic fields and invalid context messages are rejected. Actual network capture has no raw memory in publisher/campaign/report requests. Same-origin build explicitly fails this property.
9. **Storage denial:** no third-party cookies, blocked popup and unavailable first-party memory each retain contextual C01 without erroring the dApp or hygiene. Verify at least Chromium with cookie blocking and Safari if available; untested browsers are listed.
10. **Privacy leakage audit:** before deliberate click, no advertiser endpoint/script/pixel request; catalog requests identical across modes; READY has no campaign/topic/profile; local reporting has only allowlisted fields. Explain IP/click/campaign inference limits. Synthetic aggregate report clearly marked simulated; no raw report transmission.
11. **Arkiv memory:** write confirmed plan ciphertext, clear local plan cache, read by entity ID, decrypt using user-held key, show restored plan and refreshed finding. Wrong key and changed ciphertext fail; public attributes contain no profile/consent; expired/missing entity gives a recoverable error, not a fabricated plan.
12. **0G route:** a fresh real extraction displays actual request ID. “Private verified” badge is allowed only with tested served tier and verification evidence; private-route failure does not silently lower privacy. Sanitized evidence contains no API key, wallet private key or recovery key.
13. **Basic usability:** keyboard-reachable controls, visible focus, labeled consent and transaction actions, readable contrast, screen-reader status for warning/opt-out; destructive or signature actions require an explicit labeled gesture. Do not rely on color alone.
14. **Submission:** another person or clean browser can follow setup, see both outcomes and open evidence; general video is 2m45s and at least 720p; prize-specific files and live links work signed out.

## 10. Four-minute live demo script

| Time | Action and spoken claim | Evidence on screen |
| --- | --- | --- |
| 0:00–0:20 | “A wallet with zero USDC can become exposed when you fund it. Preflight checks the plan before the money moves.” State one supported local fixture and optional sponsorship. | Preflight, source/chain badge; no long intro. |
| 0:20–0:55 | Enter 800 funding / 500 repayment using alias B; show real inference receipt, correct/confirm draft. Restore confirmed plan through Arkiv if integration passed. | Draft vs confirmed state; actual request ID; write/read/decrypt evidence. Preseeded records are labeled, not passed off as new writes. |
| 0:55–1:35 | Read balance/allowance; explain current zero and conditional 800, spender assumption, gas/owner prerequisites. | Pinned facts and formula; no invented debt read. |
| 1:35–2:10 | Show controlled transfer-first and revoke-first executions. Prepare revoke, show wallet review and cancellation or test confirmation. | Two branch receipts/balance diffs, transaction recipient/function/value. Say fixture spender is deliberately exercisable. |
| 2:10–2:55 | Same wallet/context/catalog: C01 default; approve hardware-wallet topic; separately opt in; C02; disable; C01. | Distinct controls, no ad in warning area; return to hygiene showing it still works. |
| 2:55–3:30 | Show publisher messages/network visibility and Preflight-local selection. “No wallet profile in these interfaces; selected ads, IPs and clicks can still leak.” | Separate origins, strict READY payload, identical catalog fetch, no advertiser requests, local-only report. |
| 3:30–3:50 | If earned, show independent-access shutdown proof for CROPS or real CRE-to-nudge result. Otherwise show Arkiv restore/wallet-denial path more clearly. | Real evidence, not a sponsor-logo slide. |
| 3:50–4:00 | “We proved one plan-aware safety check and optional user-controlled offers. Publisher adoption and advertiser demand are next to test.” | Working result and limitations. |

For the 2m45s uploaded video, compress typing and setup, preserve both outcomes, approval/opt-out, and real partner evidence; never speed up narration or use AI voiceover. Keep a local recording and runnable fixture for network failure. A replay is labeled a replay. Do not spend the live slot waiting for a long public-chain confirmation.

## 11. Likely judge objections and candid answers

| Objection | Answer / evidence needed |
| --- | --- |
| “Two unrelated startups?” | Hygiene is the adoption wedge; offers are an optional monetization/distribution hypothesis using approved coarse preferences. Disable the commercial surface and demonstrate continued utility. If this still feels incoherent in rehearsal, reduce its airtime, not the hygiene clarity. |
| “Isn't this Revoke plus Brave?” | Yes, both building blocks exist. Our scoped contribution is joining confirmed future plans to current exposure and demonstrating purpose separation in a dApp integration. Do not claim to invent local advertising or approvals. |
| “Your zero balance warning is fear marketing.” | It is a conditional, evidence-backed bound with spender capability assumption, not current theft or a maliciousness verdict. Show allowance cap and alternative outcomes. No paid fix in the warning. |
| “The SDK can read the wallet anyway.” | A dApp can know its own wallet. Preflight-origin isolation prevents direct access to Preflight memory; an in-origin SDK would not. Campaign choice and other side channels can still reveal interest. |
| “Opt-in doesn't mean private.” | Correct. Consent controls purpose; isolation, local matching, reviewed assets and payload checks limit disclosure. Transport/click/metadata and Preflight-server trust remain. No anonymity claim. |
| “Why should I install an ad product?” | Initial value is a concrete pre-funding check and remembered plans. We have not validated retention, an extension distribution channel, or tolerance of sponsorship. |
| “Why would a publisher or advertiser pay?” | Publisher embed and contextual cold start are demonstrated; payment/demand/lift are not. Three fictional campaigns are fixtures. Need an external pilot. |
| “Why use 0G or Arkiv?” | 0G performs real draft extraction with request evidence; arithmetic stays deterministic. Arkiv stores and restores a user-owned encrypted plan without a Preflight account database. Both remain prize risks if their removal barely changes what a user notices. |
| “Is your memory really private/user-owned?” | User holds the decryption key and wallet controls writes. Arkiv ownership/timing metadata is public; local key storage and Preflight code are trusted; relay sees redacted prompts. Expiry does not erase archived ciphertext. Show wrong-key failure and independent read, not a slogan. |
| “Does revoking guarantee safety or repay the debt?” | No. It removes one confirmed allowance if token semantics and receipt checks hold. Demo debt is intent; no protocol repayment claim. Key compromise, permits, other spenders and race conditions are outside this proof. |
| “What is actually live?” | Point to the source badges and evidence manifest: local EVM calls are real execution on simulated state; sample campaigns are fictional; inference/Arkiv are real only with captured IDs/receipts. Production guarantees are not established. |

## 12. Partner and finalist submission checklist

- [ ] Recheck official deadline/requirements and dashboard; confirm registered track, eligible work start and human contributions. Preserve this plan and relevant prompts; disclose AI assistance and reused libraries/assets.
- [ ] Maintain incremental commits during implementation; never invent/backdate provenance. Public repo, open-source license, README, exact setup commands/lockfile, chain and fixture labels, evidence manifest, live Preflight + publisher URLs.
- [ ] Select **Finalist** judging and only evidenced partners, at most three. Include clear product value, both observable outcomes, real limitations and reproducible proof; confirm submitted status and assigned session.
- [ ] Human-narrated 2m45s video, at least 720p, tested signed out. This fits event upload bounds and 0G's stricter under-three-minute requirement; a separate four-minute live script is above.
- [ ] **0G if passing:** actual main-flow request IDs, live tryable extraction, route/verification disclosure and what removal breaks; demo/live/repo/deployment links, team names and Telegram/X contacts, substantive integration feedback. No iAI bonus claim without actual sign-in and spending evidence.
- [ ] **Arkiv if passing:** current-testnet write transaction/entity IDs, user-visible read/decrypt restore, public writer address and runnable query in README; `/arkiv/schema.md`, `friction.md`, `reach.md`, `why-arkiv.md`, `how-you-use-arkiv.md`; explain ownership, queried generic fields, expiry, key custody and metadata. Never include user recovery keys in public reproduction instructions; provide a disposable test fixture instead.
- [ ] **EF only if earned:** license/run instructions, README `CROPS` with one or two honest lines per letter, no third-party trackers, personal-data exceptions disclosed, under-three-minute end-to-end property evidence. Explain remaining domain/RPC/storage dependencies.
- [ ] **CRE instead of EF only if earned:** workflow code, CLI version/config and successful simulation/deployment output, chain plus external-input integration, UI nudge tied to that output and meaningful orchestration explanation; no CCIP/state-change claim for a CRE-only submission.
- [ ] Check captures, bundles, commit history and uploaded material for credentials, signing keys, encryption keys and unintended profiles; give every partner real friction feedback. Do not submit a failed integration as working.

## 13. First three implementation tasks — exact done evidence

1. **Establish the runnable boundary and deterministic fixture.** Create the minimal app, publisher page/slot bootstrap, shared strict record schemas and local EVM seed. **Done evidence:** clean-install/build commands succeed; two distinct origins render; manifest names A/B/token/S and chain 31337; pinned reads return B balance `0` and allowance at least `800000000`; a unit assertion computes `(0, 800000000)` for confirmed incoming `800000000`. Commit the scaffold and source labels.
2. **Prove or cut the two partner primitives before integrating their UI.** Real 0G aliased-plan extraction; browser-key encryption and wallet-approved Arkiv save/read. **Done evidence:** sanitised real inference request ID plus requested/served-tier verification outcome; schema-valid draft not yet confirmed; Arkiv transaction/entity ID, public ciphertext inspection and successful read/decrypt after local plan clear, plus wrong-key rejection. Apply 14:00/14:45 gates; explicit failure status and manual/local fallback count as an honest cut, never partner completion.
3. **Complete the main hygiene outcome, then the sponsored state transition.** Wire confirmation to evidence-backed finding and wallet-approved revoke; execute both ordering branches; add approved topics, separately scoped consent and frame-local matching. **Done evidence:** same-snapshot receipts prove transfer-first drain versus revoke-first failure; wallet rejection sends nothing; a captured run holds wallet/context/catalog fixed while C01 → C02 → C01 follows approval/opt-in/opt-out; hygiene still prepares revoke afterward; publisher messages and campaign/report traffic contain none of the forbidden private fields. Only then polish or consider a third partner.
