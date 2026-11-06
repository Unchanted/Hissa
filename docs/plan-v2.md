# Plan v2 — user-owned data marketplace

> **Pivot.** This plan replaces the previous idea, Preflight (plan-aware token allowance hygiene with an optional sponsored slot). Every commit up to and including `ebf6c06` belongs to Preflight. The repository was cleared at the pivot, and this plan is now the only thing in it.

Status: **approved 2026-11-06** with the default decisions and Hedera as the x402 chain (section 9). Nothing here is built yet. Items tagged **verify:** are assumptions that must be tested before we rely on them.

This plan merges our original idea (diagram: local masking → encrypted store on Arkiv → merchants buy via x402) with the parts of the friend's pitch kit that fill gaps. Our plan is the spine. The friend's plan contributes a public search index, expiry as consent, and the merchant query agent. A few new fixes close holes neither version handled.

## 0. Sponsor tracks — the core of the build

0G, Arkiv and Hedera are our three ETHGlobal partner picks (Arkiv counts as one pick). Each one carries a part of the product that breaks without it. Track requirements below were read from the ETHGlobal Mumbai prize pages on 2026-11-06 ([0G](https://ethglobal.com/events/mumbai/prizes/0g), [Arkiv](https://ethglobal.com/events/mumbai/prizes/arkiv), [Hedera](https://ethglobal.com/events/mumbai/prizes/hedera)).

| Sponsor | Target track | Role in the product | What breaks if removed |
| --- | --- | --- | --- |
| **Hedera** | AI Agents That Pay: x402 on Hedera ($6,500) | Every purchase (record or insight report) is an x402 payment settled on Hedera; user payouts are Hedera transfers | Merchants cannot pay per record or per report, and users cannot be paid |
| **0G** | Build with 0G Private Computer ($5,000) | Private inference on masked text: facet extraction at upload; for insights, question → analysis spec, query-time labelling, theme naming and report writing | No insights product at all, and no structured facets for record sales |
| **Arkiv** | Build on Arkiv, from scratch ($4,000) | The marketplace itself: encrypted listings with public tags, consent toggles, expiry as the consent window, sale and insight receipts | No shared listing index for merchants to browse, no enforceable consent window, no public audit of sales and privacy parameters |

### 0.1 Hedera — "AI Agents That Pay: x402 on Hedera"

Must show, and how we meet it:
- **An x402-protected endpoint settling on Hedera through a listed facilitator** (official x402, Ax402, Blocky402, or our own): `GET /records/:key` and `POST /insights` on our server.
- **An agent that finds the endpoint and completes a paid request end to end with no human approving:** the merchant agent discovers endpoints from Arkiv listings, then pays and retries on its own within a merchant-set budget. The demo must not have a "click to pay" step.
- **README** with setup, architecture, payment flow and the Hedera transaction ID of at least one settled payment.
- **Demo video ≤ 5 minutes** showing a payment settling, linked on HashScan.

Extra points we target:
- **Spending controls:** per-merchant budget, per-purchase cap and daily cap enforced by the agent.
- **HCS topic as a tamper-evident audit log** of the merchant agent's spending (one message per payment).
- **Scheduled Transactions** for the fixed-schedule batched user payouts.
- **Hedera Agent Kit** for the merchant agent's Hedera actions, with 0G as its model. **verify:** Agent Kit works with an OpenAI-compatible endpoint such as the 0G router.
- Optional: settle in an HTS token (USDC) instead of HBAR; agent identity via ERC-8004 or HCS-14.

### 0.2 0G — "Build with 0G Private Computer"

Must show, and how we meet it:
- **Inference on 0G Private Computer in the main user flow, with request IDs:** the insights pipeline cannot run without 0G, and every report lists the 0G request IDs used. Upload-time facet extraction also shows its request ID on the review screen.
- **A working app a judge can try, with a reason to come back tomorrow:** users come back to see earnings grow; merchants come back to ask new questions as new data arrives.
- **One sentence on what breaks if 0G is removed:** "Without 0G there are no insights: nothing can turn a merchant's question into a cohort analysis or turn masked chats into labelled themes, privately."
- **Not wanted by judges:** generic chat wrappers and removable AI. Our AI is the analysis engine, not a chat box.

Bonus to consider: merchants sign in with their 0G account (iAI) and the insights analysis spends their own credits. **verify:** iAI sign-in flow and effort.

Use the private (TEE) route, record request IDs and verification results, and never claim privacy from a header alone.

### 0.3 Arkiv — "Build on Arkiv (from scratch)"

Must show, and how we meet it:
- **Writes to Arkiv's current testnet (Rabdi) with `@arkiv-network/sdk`:** every listing, consent change, sale receipt and insight receipt.
- **At least one user-visible feature reads its data from Arkiv:** merchant browsing and agent discovery query `dm.listing`; the user's "my listings" page reads entity state and expiry; a public audit page reads `dm.sale` and `dm.insight_receipt`. Arkiv is never just a log nothing reads.
- **README:** writer wallet address(es) and one runnable query.
- **Required files:** `/arkiv/schema.md`, `/arkiv/friction.md`, plus one per judging criterion: `/arkiv/reach.md`, `/arkiv/why-arkiv.md`, `/arkiv/how-you-use-arkiv.md`. The four criteria (feedback, reach, why Arkiv, how you use Arkiv) are weighted 25% each, so these files are first-class deliverables.
- **Public repo with an open-source license** and a statement of how AI was used.

Optional: **Arkiv + Swarm bonus ($500).** Store encrypted payloads larger than Arkiv's 128 KiB `bytes` budget on Swarm, with the Swarm reference on the Arkiv listing. The payload is already encrypted by us, so the reference must point to an unencrypted Swarm upload of our ciphertext; an encrypted Swarm reference contains its key and must never go into a public entity.

### 0.4 Submission artifacts shared across tracks

- One demo video under 3 minutes (fits 0G's limit and Hedera's 5-minute limit), showing: masking on the device, a listing appearing on Arkiv, the merchant agent paying autonomously with a HashScan link, an insights report with 0G request IDs, and the public receipt read back from Arkiv.
- Public GitHub repo, open-source license, README with setup, architecture, payment flow, Hedera tx IDs, Arkiv writer addresses and query, 0G request IDs, and how AI was used.
- Live demo link a judge can try.

## 1. What came from where

| Area | Kept from our plan | Taken from friend's plan | New fix |
| --- | --- | --- | --- |
| Input | AI chat, social chat (image/audio later) | — | Text-only MVP, images/audio on roadmap |
| Privacy step | Masking runs on the user's device | Fixed tag vocabulary | User review screen before anything leaves the device |
| What is sold | The masked data record itself | — | Aggregated, anonymised **insight reports** as the main product; contact info is **not** sold (it turns the product into a phishing list) |
| Storage | Encrypted record on Arkiv | Coarse public tags on Arkiv for free browsing | No user wallet in public attributes; writes from a platform writer wallet |
| Consent | User chooses what to sell | Arkiv expiry (BTL) as the consent window | Two toggles per upload: "use in aggregate insights" and "allow sale of my record". Revoke deletes the release key, so expiry and revoke really stop use |
| Merchant side | Merchant states requirement to an AI agent | 0G inference turns one sentence into a structured query | 0G also runs the insights analysis and writes the report |
| Payment | x402 purchase of a specific record | x402 per record on Hedera, agent pays per unlock | — |
| Key release | Buyer gets access to that record after payment | — | Buyer never gets the stored key; the record is re-encrypted to the buyer with a per-buyer watermark |
| Payout | App pays users from x402 revenue | — | Dispute window; insight fees split equally among counted users; all payouts batched on a fixed schedule |
| Fake data | — | Admitted as unsolved | Duplicate detection, per-human cap, buyer disputes; personhood and zkTLS as next steps |

## 2. Product in one paragraph

> Architecture, data flows, diagrams and the analytics pipeline are in [architecture.md](architecture.md). Where the two documents differ, architecture.md is newer.

**Two products.** *Insights* (main): a merchant asks a question about a cohort, e.g. "why do budget-conscious 18–24s abandon our serum?", and receives an **anonymised**, aggregated report, never any individual record. *Record sale*: a merchant buys one **pseudonymised** masked record. Each upload carries two consent toggles, one per product.

A user drops in an AI chat export or a social chat export. The browser parses it, masks personal information, and extracts a structured record: categories, intent, stage, budget band, timeframe, and short masked excerpts. The user reviews exactly what will leave the device, sets the two consent toggles and an expiry. The browser encrypts the record and publishes it to Arkiv, with only coarse tags left public. A merchant types one sentence describing who they want. A merchant AI agent turns it into a structured query, browses matching listings for free, and buys specific records with x402. After payment, the buyer receives that record encrypted to the buyer's own key, watermarked so a leak traces back to them. The user is paid their share of each sale.

## 3. Flows

### 3.1 User upload (all on device until step 6)

1. **Parse** — ChatGPT `conversations.json`, WhatsApp `.txt` export. **verify:** current export formats.
2. **Mask** — regex pass for phone numbers, emails, Aadhaar, PAN, UPI IDs, card numbers, crypto addresses and URLs, then an in-browser NER model (transformers.js / ONNX) for names, places and organisations. Each hit becomes a typed placeholder such as `[PERSON]` or `[CITY]`. **verify:** model size and speed in the browser; regex-only fallback if the model is too slow.
3. **Extract** — map masked text to the fixed schema (section 4). Rules first, then a small in-browser model behind the same interface.
4. **Exclude sensitive categories** — health, sex life, religion, caste, political views, biometric data and anything about children are never offered for sale in the MVP. The user also attests they are 18+.
5. **Review** — the user sees the exact payload that will be uploaded, can edit or delete any field, chooses sellable categories, price floor and expiry.
6. **Seal and publish** — the browser generates a per-record AES-GCM key and encrypts the record. It wraps that key to the key-release service's public key and sends the wrapped key to the service. The platform writer wallet publishes the Arkiv entity: public coarse tags plus the ciphertext. The user's wallet is not written into the entity.

### 3.2 Merchant purchase

1. Merchant types a sentence, e.g. "people in India comparing laptops under ₹1L who plan to buy this month".
2. The merchant agent calls 0G inference to turn it into JSON. The JSON is validated against the public tag schema; invalid output is rejected, and a rule-based parser is the fallback.
3. Arkiv query on public attributes (free). The preview shows listing id, coarse tags, quality tier, freshness and price, never content.
4. The agent (autonomous, within a merchant-set budget and per-purchase cap; see section 0.1) requests `GET /api/records/:id` with an ephemeral buyer public key. The server answers HTTP 402 with x402 payment requirements: price in HBAR, `payTo` = platform treasury account on Hedera.
5. The agent pays on Hedera. The facilitator verifies and settles. **verify:** `@x402/hedera` package and the Hedera testnet facilitator; Blocky402 testnet facilitator as the fallback.
6. The key-release service unwraps the record key, decrypts, applies the per-buyer watermark, re-encrypts to the buyer's public key and returns it. The stored record key never leaves the service.
7. An unlock receipt is recorded: listing id, hashed buyer id and Hedera payment tx. A payout ledger entry is created for the user.

### 3.3 Payout, revoke and expiry

- **Payout:** all x402 payments go to the platform treasury on Hedera. After a dispute window, the app pays the user 80% of each sale to the user's Hedera payout account. The demo uses a short window. Payout txs are public on HashScan, so users can check they were paid.
- **Revoke:** the user can revoke a listing at any time. The service deletes the wrapped key, so the record can never be sold again even though the ciphertext still exists.
- **Expiry:** the Arkiv entity expires after the chosen period (default 30 days), and the service refuses to release keys for expired listings. Wording for the pitch: "the listing stops being served". Records already sold cannot be recalled, and old ciphertext may survive in chain history or indexer copies. Without the release key it is unreadable.

## 4. Data model

### Public Arkiv attributes (queryable, fixed vocabulary, coarse)

```
schema:        datamarket.listing
category:      tech.jobs | tech.learning | shopping.electronics | shopping.fashion | travel | finance.personal | education
region:        india | sea | eu | us | other
source:        ai_chat | social_chat
freshness:     this_week | this_month | older
quality_tier:  a | b | c
price:         integer in tinybars, fixed per quality tier
listing_id:    random id (not derived from the user)
expiry:        Arkiv BTL
```

The public tags are kept coarse on purpose. Fine-grained fields live only in the encrypted payload. **verify:** Arkiv SDK supports querying by multiple indexed attributes, and the cost and latency of writes.

Two more public attributes, `consent_insights` and `consent_sale` (bool), carry the consent toggles. The full Arkiv entity model (`dm.listing`, `dm.sale`, `dm.insight_receipt`) is in [architecture.md §2.1](architecture.md).

### Encrypted payload

The payload is a **domain-agnostic facet envelope extracted from the data itself**, not a fixed list of fields: subjects mentioned (brands, products, services, topics), what happened (considered, bought, abandoned, complained), sentiment, aspects with reasons, price signals, alternatives, plus a few person-level signals such as age band. See [architecture.md §5](architecture.md).

## 5. Key custody and leak tracing

The user's browser is offline when a merchant buys, so something else must hold record keys and release them. Whoever holds them can read records. The pitch must say this plainly.

- **Why not hand the buyer the record key?** The ciphertext is public on Arkiv. The first buyer could post the key, and every later sale of that record would be worthless.
- **What happens instead:** the service decrypts, rewrites the masked placeholders with buyer-specific random tokens (for example `[PERSON_7f3a]`), embeds a signed buyer fingerprint, and re-encrypts to the buyer's key. A leaked copy identifies the buyer. This deters leaks; it does not prevent them.
- **Who runs the service:** the app server (decision 3). The operator can read records at release time, and the pitch says so.

## 6. Who sees what

| Party | Sees | Does not see |
| --- | --- | --- |
| User's browser | Raw export, masked record, record key at creation | — |
| Key-release service | Wrapped keys; plaintext masked record at release time | Raw export, unmasked text |
| Arkiv / indexers / RPC | Coarse public tags, ciphertext size, platform writer address, timing | Payload, user wallet |
| Merchant (browsing) | Coarse tags, tier, price, freshness | Payload, user identity |
| Merchant (after purchase) | That one masked, watermarked record | Raw export, user's Hedera account |
| 0G provider | Merchant query sentences; masked text only if the user opts in to 0G scoring | Raw export |
| Public observers (HashScan) | x402 payment txs to the treasury and payout txs to users | Which record a payout belongs to, if payouts are batched |

Coarse tags with few matching listings can narrow a query down to a small group. Keeping the public tags coarse is the main mitigation.

Residual risks to state in Q&A: masking can miss things, and masked text can still be re-identifying when combined with other data. Watermarking traces leaks but cannot stop a buyer from copying plaintext.

## 7. Fake and low-quality data

| Defence | MVP | Roadmap |
| --- | --- | --- |
| Duplicate and near-duplicate detection (SimHash of masked text, computed in the browser, kept server-side only) | yes | embedding similarity |
| Per-human upload cap | wallet-based cap | personhood proof: Anon Aadhaar or World ID (**verify:** integration effort) |
| Buyer dispute window; disputed records are not paid out and lower the user's reputation | yes | stake and slashing |
| Quality tier from on-device checks (length, diversity, junk detection) | yes | 0G-scored quality (decision 6) |
| Provenance of the export | hash only | zkTLS proof that the export came from chatgpt.com or WhatsApp (Reclaim, zkPass, Opacity; **verify:**) |

Known limit: masking runs on the client, so a modified client can lie. zkTLS proves the original was real but not that the masked version came from it. Disputes are the backstop.

## 8. Reuse from the previous idea's history

The repository was cleared at the pivot, so the new build starts from an empty tree. The previous idea (Preflight) is still in git history, and a few of its files are worth copying back. Retrieve them with `git show ebf6c06:<path>`.

| File at `ebf6c06` | Reuse |
| --- | --- |
| `packages/shared/src/hygiene/envelope.ts` | AES-GCM envelope (versioned, AAD-bound, fails closed). Generalise from `ConfirmedPlan` to the listing payload |
| `apps/preflight/src/hygiene/arkiv.ts` | Arkiv SDK client, schema definition, write and read. Switch the writer to the platform wallet; add indexed public tags |
| `apps/server/src/index.ts` | 0G router relay with `X-0G-Provider-Trust-Mode` and receipt capture. Reuse for the merchant query agent |

To build new: User tab (upload → review → publish → earnings), Merchant tab (query → preview → buy → decrypt), server with x402 middleware on Hedera, key-release endpoint, payout ledger and payout job, export parsers, masking pipeline, extractor, key wrapping (ECDH or RSA-OAEP via Web Crypto), watermarking, duplicate detection.

## 9. Approved decisions

1. **Payout model:** `payTo` = platform treasury account on Hedera. The app pays the user's share after a dispute window, and each payout is an on-chain tx. This enables refunds and fraud holds, and it keeps the user's account out of the buyer's view.
2. **x402 chain:** Hedera testnet, payments in HBAR, settlement visible on HashScan. **verify:** `@x402/hedera` package, testnet facilitator, Blocky402 testnet facilitator (`https://api.testnet.blocky402.com`) as the fallback.
3. **Key custody:** the app server holds wrapped keys and runs release. The operator can read records at release time, and we say so. Release inside a 0G TEE stays on the roadmap, pending verification that 0G private compute can run our code and hold keys.
4. **MVP inputs:** text exports only (ChatGPT, WhatsApp). Images and audio are on the roadmap, because masking them on the device is much harder.
5. **Fake-data MVP:** duplicate detection, wallet-based upload cap, dispute window. Personhood proof and zkTLS are on the roadmap.
6. **0G's role:** merchant sentence → structured query; facet extraction from **masked** text at upload (private TeeML route, opt-in, regex fallback on device); for insights, query-time labelling, theme naming and report writing from noised tables.
7. **Pricing:** fixed price per quality tier in HBAR, 80% of each sale to the user, 20% to the platform.

8. **Insights product:** cohort questions answered with anonymised aggregates. Minimum of about 50 distinct users per cohort (this applies only to insights; the browse-time minimum was removed), one vote per user per metric, noise, small themes merged into "other", no verbatim quotes. The merchant pays one x402 fee per report; the user share is split equally among the users counted. 0G runs the query-time labelling and writes the report.
9. **Consent:** two toggles per upload, "use in aggregate insights" and "allow sale of my record", both stored on the Arkiv listing and re-checked at use.

## 10. Demo outline

1. User tab: drop in a ChatGPT export, show masking live, show the review screen, publish. The Network tab shows only ciphertext and coarse tags leaving the device.
2. Arkiv explorer: the new entity with public tags and ciphertext.
3. Merchant tab: one sentence → 0G JSON → matching listings.
4. The merchant agent buys 3 records via x402 on Hedera **on its own, within its budget, with no click to pay**. Each payment is logged to the agent's HCS topic. The buyer decrypts them and sees the masked, watermarked records.
5. HashScan: payment txs to the treasury, then the payout txs to users.
6. Merchant asks an insight question, pays, and receives an anonymised report; the public `dm.insight_receipt` shows cohort size bucket and privacy parameters, with no contributor list.
7. Revoke a listing and show that a new purchase attempt is refused.
