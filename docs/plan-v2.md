# Plan v2 — user-owned data marketplace

> **Pivot.** This plan replaces the previous idea, Preflight (plan-aware token allowance hygiene with an optional sponsored slot). Every commit up to and including `ebf6c06` belongs to Preflight. The repository was cleared at the pivot, and this plan is now the only thing in it.

Status: **approved 2026-11-06** with the default decisions and Hedera as the x402 chain (section 9). Nothing here is built yet. Items tagged **verify:** are assumptions that must be tested before we rely on them.

This plan merges our original idea (diagram: local masking → encrypted store on Arkiv → merchants buy via x402) with the parts of the friend's pitch kit that fill gaps. Our plan is the spine. The friend's plan contributes a public search index, expiry as consent, and the merchant query agent. A few new fixes close holes neither version handled.

## 1. What came from where

| Area | Kept from our plan | Taken from friend's plan | New fix |
| --- | --- | --- | --- |
| Input | AI chat, social chat (image/audio later) | — | Text-only MVP, images/audio on roadmap |
| Privacy step | Masking runs on the user's device | Fixed tag vocabulary | User review screen before anything leaves the device |
| What is sold | The masked data record itself | — | Contact info is **not** sold (it turns the product into a phishing list) |
| Storage | Encrypted record on Arkiv | Coarse public tags on Arkiv for free browsing | No user wallet in public attributes; writes from a platform writer wallet |
| Consent | User chooses what to sell | Arkiv expiry (BTL) as the consent window | Revoke deletes the release key, so expiry and revoke really stop sales |
| Merchant side | Merchant states requirement to an AI agent | 0G inference turns one sentence into a structured query | — |
| Payment | x402 purchase of a specific record | x402 per record on Hedera, agent pays per unlock | — |
| Key release | Buyer gets access to that record after payment | — | Buyer never gets the stored key; the record is re-encrypted to the buyer with a per-buyer watermark |
| Payout | App pays users from x402 revenue | — | Dispute window before payout; payout recorded on-chain |
| Fake data | — | Admitted as unsolved | Duplicate detection, per-human cap, buyer disputes; personhood and zkTLS as next steps |

## 2. Product in one paragraph

A user drops in an AI chat export or a social chat export. The browser parses it, masks personal information, and extracts a structured record: categories, intent, stage, budget band, timeframe, and short masked excerpts. The user reviews exactly what will leave the device, picks which categories may be sold, and sets an expiry. The browser encrypts the record and publishes it to Arkiv, with only coarse tags left public. A merchant types one sentence describing who they want. A merchant AI agent turns it into a structured query, browses matching listings for free, and buys specific records with x402. After payment, the buyer receives that record encrypted to the buyer's own key, watermarked so a leak traces back to them. The user is paid their share of each sale.

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
4. The agent requests `GET /api/records/:id` with an ephemeral buyer public key. The server answers HTTP 402 with x402 payment requirements: price in HBAR, `payTo` = platform treasury account on Hedera.
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

### Encrypted payload (what the buyer pays for)

```
categories:      fine-grained category list
intent:          buying | job_seeking | hiring | learning | researching | ...
stage:           exploring | comparing | ready_to_buy
budget_band:     e.g. "50k-1L INR"
timeframe:       this_week | this_month | this_quarter
key_phrases:     masked phrases
excerpts:        up to 3 short masked excerpts
source_window:   date range of the conversations
provenance_hash: hash of the original export (for future zkTLS proofs)
```

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
6. **0G's role:** merchant sentence → structured query (MVP). Optional user opt-in categorisation and quality scoring of **masked** text on the private TeeML route.
7. **Pricing:** fixed price per quality tier in HBAR, 80% of each sale to the user, 20% to the platform.

## 10. Demo outline

1. User tab: drop in a ChatGPT export, show masking live, show the review screen, publish. The Network tab shows only ciphertext and coarse tags leaving the device.
2. Arkiv explorer: the new entity with public tags and ciphertext.
3. Merchant tab: one sentence → 0G JSON → matching listings.
4. Agent buys 3 records via x402 on Hedera. The buyer decrypts them and sees the masked, watermarked records.
5. HashScan: payment txs to the treasury, then the payout txs to users.
6. Revoke a listing and show that a new purchase attempt is refused.
