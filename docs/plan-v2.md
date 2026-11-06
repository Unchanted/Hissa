# Plan v2 — user-owned data marketplace

> **Pivot.** This plan replaces the previous idea, Preflight (plan-aware token allowance hygiene with an optional sponsored slot). Every commit up to and including `ebf6c06` belongs to Preflight. The repository was cleared at the pivot.

Status: **approved 2026-11-06**, updated the same day. This document holds the product, the sponsor tracks and the decisions. The detail lives elsewhere:

- [architecture.md](architecture.md): data flows, diagrams, Arkiv entity model, private state, encryption, analytics pipeline.
- [data-sources.md](data-sources.md): supported exports and the rule that only the uploader's own messages become data.
- [work-plan.md](work-plan.md): who builds what, in which order.
- [arkiv-test-findings-2026-11-06.md](arkiv-test-findings-2026-11-06.md): live Arkiv tests that passed.

Items tagged **verify:** are assumptions not yet tested.

## 1. Product

**Two products, two privacy treatments.**
- **Insights (main product), anonymised.** A merchant picks a premade analysis (for example "why do budget-conscious 18–24s abandon a product in this category?") and its cohort filters. They receive an aggregated, noised report about a cohort of at least ~50 distinct users, never any individual record. An **"Other — coming soon"** option describes future free-text questions; it is not built.
- **Record sale, pseudonymised.** A merchant buys one masked record, delivered encrypted to the buyer and watermarked so a leak traces back to them.

**Flow.** A user drops in a chat export (ChatGPT, Claude, Claude Code, Codex, WhatsApp or Telegram). The browser keeps only the user's own messages, masks personal information, and 0G extracts facets from the masked text. The user reviews exactly what will be published, sets two consent toggles ("use in aggregate insights", "allow sale of my record") and an expiry. The browser encrypts the record and the platform publishes it to Arkiv with only coarse tags public. Merchants browse listings for free by filtering on those tags. A merchant AI agent pays with x402 on Hedera, on its own, within a budget. Users are paid 80% of each record sale and an equal share of each insight report they were counted in, in scheduled batches.

## 2. Sponsor tracks — the core of the build

0G, Arkiv and Hedera are our three ETHGlobal partner picks (Arkiv counts as one pick). Each carries a part of the product that breaks without it. Requirements were read from the ETHGlobal Mumbai prize pages on 2026-11-06 ([0G](https://ethglobal.com/events/mumbai/prizes/0g), [Arkiv](https://ethglobal.com/events/mumbai/prizes/arkiv), [Hedera](https://ethglobal.com/events/mumbai/prizes/hedera)).

| Sponsor | Target track | Role in the product | What breaks if removed |
| --- | --- | --- | --- |
| **Hedera** | AI Agents That Pay: x402 on Hedera ($6,500) | Every purchase (record or insight report) is an x402 payment settled on Hedera; user payouts are Hedera transfers | Merchants cannot pay per record or per report, and users cannot be paid |
| **0G** | Build with 0G Private Computer ($5,000) | Private inference on masked text: facet extraction at upload; for insights, query-time labelling, theme naming and report writing | No insights product, and no structured facets for listings |
| **Arkiv** | Build on Arkiv, from scratch ($4,000) | The marketplace and its only database: encrypted listings with public tags, consent toggles, expiry, sealed private state, sale and insight receipts | No listing index to browse, no consent window, no audit trail, and nowhere to keep state |

### 2.1 Hedera — "AI Agents That Pay: x402 on Hedera"

Must show:
- **An x402-protected endpoint settling on Hedera through a listed facilitator** (official x402, Ax402, Blocky402, or our own): `GET /records/:id` and `POST /insights/:analysisId`.
- **An agent that finds the endpoint and completes a paid request end to end with no human approving:** the merchant agent discovers listings on Arkiv, then pays and retries on its own within a merchant-set budget. No "click to pay" step.
- **README** with setup, architecture, payment flow and the Hedera transaction ID of at least one settled payment.
- **Demo video ≤ 5 minutes** showing a payment settling, linked on HashScan.

Extra points we target: spending controls (budget, per-purchase cap, daily cap); an **HCS topic** as a tamper-evident log of each agent payment; **Scheduled Transactions** for batched user payouts; **Hedera Agent Kit** for the agent, with 0G as its model (**verify:** Agent Kit works with the 0G router's OpenAI-compatible endpoint). Optional: settle in USDC via HTS; agent identity via ERC-8004 or HCS-14.

### 2.2 0G — "Build with 0G Private Computer"

Must show:
- **Inference on 0G Private Computer in the main user flow, with request IDs.** Upload-time facet extraction is **on by default** (users can opt out, falling back to on-device rules), and its request ID shows on the review screen. Every insights report lists the 0G request IDs used.
- **A working app a judge can try, with a reason to come back tomorrow:** users watch earnings grow; merchants rerun analyses as new data arrives.
- **What breaks if 0G is removed:** "Without 0G, masked chats cannot be turned into structured facets or labelled themes, so there are no insights to sell."
- **Not wanted by judges:** chat wrappers and removable AI. Our AI is the analysis engine.

Use the private (TEE) route and record request IDs and verification results. Bonus to consider: merchants sign in with their 0G account (iAI) and analyses spend their own credits (**verify:** effort).

### 2.3 Arkiv — "Build on Arkiv (from scratch)"

Must show:
- **Writes to Rabdi with `@arkiv-network/sdk`:** listings, consent changes, sealed private state, sale, insight and payout receipts. Already proven live: see the Arkiv test findings.
- **User-visible features that read from Arkiv:** merchant browsing, the user's "my listings and earnings" page, and a public receipts page.
- **README:** writer wallet address(es) and one runnable query.
- **Required files, 25% of the score each:** `/arkiv/schema.md`, `/arkiv/friction.md`, `/arkiv/reach.md`, `/arkiv/why-arkiv.md`, `/arkiv/how-you-use-arkiv.md`.
- **Public repo with an open-source license** and a statement of how AI was used.

Optional: Arkiv + Swarm bonus ($500), storing payloads over 128 KiB on Swarm with the reference on the listing.

## 3. Decisions

1. **Payments:** x402 on Hedera testnet, in HBAR, `payTo` = platform treasury. **verify:** facilitator choice and whether it rejects a reused payment.
2. **Payouts:** 80% of each record sale to the seller; each insight fee (minus 20% platform share) split equally among counted users; paid in scheduled batches using Hedera Scheduled Transactions.
3. **Merchant agent:** autonomous, budget-capped, logs every payment to an HCS topic.
4. **Insights:** premade analyses only, plus "Other — coming soon". Minimum ~50 distinct users per cohort, one vote per user per metric, noise, small themes merged into "other", no verbatim quotes. Consent is checked when an analysis starts.
5. **Record sales:** buyer receives a watermarked copy encrypted to their own key, never the stored record key.
6. **Consent:** two toggles per upload, public flags on the Arkiv listing, patched on change and re-checked at use. Expiry is the Arkiv lifetime (≤ ~182 days). Revoke deletes the entity and the server refuses further releases.
7. **Key custody:** the app server holds the service private key and can unseal anything. We say so.
8. **No private database:** private state is sealed to the service key and stored on Arkiv (architecture.md §2.3).
9. **Encryption:** `arkiv-encryption` for record bodies, with listing context inside the encrypted JSON; one `sealTo` helper (ECDH P-256 + HKDF + AES-GCM) for keys and private state (architecture.md §2.4).
10. **Sources:** ChatGPT, Claude, Claude Code, Codex, WhatsApp, Telegram first; only the uploader's own messages become data (data-sources.md).
11. **Fake data:** duplicate detection, per-wallet upload cap, buyer dispute window. Personhood proof and zkTLS later.
12. **Pricing:** fixed price per quality tier in HBAR.
