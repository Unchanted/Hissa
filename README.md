# Hissa

> **Platforms profit from your chats. Hissa flips it: you own the data, you set consent, you get paid.**

*Hissa* (हिस्सा) means "share" in Hindi: your share of the value your data creates.

## Project description

Every conversation with an AI assistant or on a messaging app reveals what people want, compare, buy and give up on. That signal is valuable to brands and AI companies, but the people who produce it have no ownership, no real control over consent, and no share of the money. Buyers face the opposite problem: they need real human data, yet scraping is legally risky and comes with no proof of consent.

Hissa is a user-owned data marketplace that connects the two sides.

**For people who provide data.** You upload a chat export (ChatGPT, Claude, WhatsApp, Telegram and more). Your browser keeps only your own messages and masks names, phone numbers and places before anything leaves the device. 0G Private Computer extracts structured insights inside a TEE. The record is encrypted and listed on Arkiv with only coarse public tags, your consent choices and an expiry date. You can revoke consent at any time, and you earn rewards whenever your data is used.

**For AI companies that buy data.** A merchant AI agent discovers listings on Arkiv, then pays for data or insights over x402 on Hedera, on its own and within a spending budget, with no human approval. Every payment is settled on Hedera, and payments are logged to an HCS topic. The buyer receives the decrypted, masked data for AI training or an anonymised insight report. Payments flow back to the users who contributed.

**Built on**
- **0G Private Computer:** private inference on masked text, so raw data is never exposed.
- **Arkiv:** the only database. Encrypted listings, consent flags, expiry and a public audit trail.
- **Hedera:** autonomous x402 payments by AI agents, an HCS payment log, and batch payouts to users.

## Live demo

- **App (Vercel):** https://hissa.tech (also https://hissa-peach.vercel.app)
- **API (Fly.io, Singapore):** https://api.hissa.tech (also https://hissa-mumbai-api.fly.dev; health check at `/health`). The API (Hedera x402 + Arkiv + 0G) is a long-lived Node server: it keeps an Arkiv write journal on a volume, holds insight jobs in memory and pays its own x402 routes, so it runs as one always-on machine (`fly.toml`, `Dockerfile.api`, see [docs/deploy.md](docs/deploy.md)) rather than on Vercel. The frontend can point at another API with `?api=<url>` (remembered in the browser; `?api=reset` clears it). Without a reachable API the app shows "Marketplace API unavailable" instead of faking payments.
- **Demo video script:** [docs/demo-video-script.md](docs/demo-video-script.md)
- **Run locally:** `npm ci && npm --prefix apps/web ci`, `npm run arkiv:setup`, fill `.env` (see `.env.example`; `ALLOWED_ORIGINS` and `HOST` control which web origins may call the API and which interface it binds), then `npm run demo:api` (port 4021) and `npm run demo:web` (port 5173).

**Sponsor tracks**

| Track | What we use it for |
| --- | --- |
| 0G Private Computer | Seller classification, buyer request/idea to filters, anonymised insight reports (see [0G section](#0g-private-computer-classification-and-analytics-in-a-tee-working-mainnet-router)) |
| Arkiv | Encrypted listings, consent, revoke, receipts; the only database (see [Arkiv](#arkiv)) |
| Hedera | x402 agent payments, HCS log, scheduled payouts (see [Hedera](#hedera-x402-payments-by-an-autonomous-agent-working-testnet)) |

**Two buyer products:** Validate an idea (anonymised analytics, k >= 50, 2 ℏ, 80% to contributors) and Buy training data (pseudonymised records, 1 ℏ each).

**Team**
- Om Dwivedi (0G), contact: TODO
- Om Lanke (Arkiv), contact: TODO
- Allen Chu (Hedera/x402, web), contact: TODO

## Docs

- [Current architecture and product scope](docs/architecture.md)
- [Plan: product, sponsor tracks and decisions](docs/plan-v2.md)
- [Work plan: who builds what](docs/work-plan.md)
- [Data sources and the third-party message rule](docs/data-sources.md)
- [Arkiv SDK and security research](docs/arkiv-research-2026-11-06.md)
- [Live test findings, transaction links and remaining checks](docs/arkiv-test-findings-2026-11-06.md)

## 0G Private Computer: classification and analytics in a TEE (working, mainnet Router)

Masking happens only on the seller's device: Transformers.js runs `Xenova/bert-base-NER` in the browser, rules catch emails, phone numbers and IDs, and the seller can add names the model missed. 0G never masks anything. It does three jobs, every call in private mode (`X-0G-Provider-Trust-Mode: private`, TeeML providers only, no fallback to a non-TEE tier):

| Job | Where | Model order |
| --- | --- | --- |
| Classify the masked chat into facets (domain, age band, budget, products, events, reasons). The domain becomes the public Arkiv tag; everything else stays inside the ciphertext | Seller upload, `POST /api/ai/analyse-upload` | glm-5.3, then 0gm |
| Turn a buyer's request or idea into filters (and, for an idea, one measurable question) | Both buyer products, `POST /api/ai/parse-request` | glm-5.3, then 0gm |
| Anonymised insight report: label each consenting record → group into themes → one vote per seller → Laplace noise (ε = 1) → merge small themes → report and verdict. Refused below 50 people, before any payment | *Validate an idea*, `POST /api/insights/:id` (x402, 2 ℏ) | label and group: 0gm, then glm-5.3; report: glm-5.3, then 0gm |

Every answer is checked against a fixed shape and fixed value lists; a wrong shape is retried, then the next private model is tried. Each call returns a receipt (request ID, provider, model, `X-0G-E2EE: sealed`, cost in micro-USD), shown on the page and on the Public Ledger. Long chats are sampled for 0G (12,000 characters spread across the chat), so compute stays small while the full masked text is stored encrypted on Arkiv.

Evidence: `evidence/0g-compare-glm-5.3.json` and `evidence/0g-compare-0gm-1.0-35b-a3b.json` hold one live run of every job on each model (private mode, synthetic text). In that run glm-5.3 classified uploads better, and 0gm handled the bulk insight labelling reliably at about 15× lower cost. A live insight report took 24 s and about $0.0026.

```bash
npx tsx packages/ai/scripts/compare-models.ts   # needs ZG_API_KEY in .env
ZG_CHAT_MODELS=0gm-1.0-35b-a3b npm run demo:api # cheap rehearsals on one model
```

## Hedera: x402 payments by an autonomous agent (working, testnet)

**Tracks:** primary *AI Agents That Pay: x402 on Hedera* (an agent pays per request in HBAR over x402 with no human approval); secondary *No Solidity Allowed: Build with Hedera SDKs* (JS SDK, HCS, Schedule Service and mirror node; no Solidity contracts).

### Live flow (https://hissa.tech + https://api.hissa.tech)

1. **Discovery.** The agent queries listings on Arkiv (free). Unknown or non-consented listings and too-small insight cohorts are refused before any 402, so no money moves.
2. **402 quote.** The agent requests a paid route (`GET /api/records/:id` 1 ℏ, `POST /api/contact/:id` 0.5 ℏ, `POST /api/insights/:id` 2 ℏ). The server answers HTTP 402 with a `PAYMENT-REQUIRED` header.
3. **Policy check, then automatic payment.** The agent checks the per-purchase cap, the run budget and the daily cap. If all pass, it signs an HBAR transfer with its own key, with no human approval. If any fails, it aborts before signing.
4. **Retry.** The agent repeats the request with a `PAYMENT-SIGNATURE` header.
5. **Settlement.** The Blocky402 facilitator verifies the signed transfer and settles it on Hedera testnet.
6. **Release.** The handler's output is released only after settlement. If the 0G run fails, the handler fails, nothing settles and the buyer is not charged.
7. **Receipt.** The payment receipt is written to Arkiv.
8. **HCS log.** A message is submitted to the HCS topic. This is best effort: on failure the API logs a warning and does not retry from a durable queue.
9. **Contributor share.** 80% of the price is credited to the contributing sellers.
10. **Payout.** A seller's **Pay out** click creates a Hedera Schedule Service transaction that moves the owed HBAR from the treasury to the seller.

The agent routes `/agent/buy`, `/agent/contact` and `/agent/insight` run this flow on the server. The server derives each purchase's attribution from the route actually served, serializes agent purchases through one payer, and owns the budget cap.

### Hedera services used

| Service | How we use it |
| --- | --- |
| x402 `exact` scheme | HBAR (asset `0.0.0`), amounts in tinybars, network `hedera:testnet`; facilitator Blocky402 (`https://api.testnet.blocky402.com`), fee payer [`0.0.7162784`](https://hashscan.io/testnet/account/0.0.7162784) |
| Consensus Service (HCS) | Payment log on topic [`0.0.11342910`](https://hashscan.io/testnet/topic/0.0.11342910); only the agent can submit |
| Schedule Service | Seller payouts (`/api/payouts`): a scheduled transfer treasury → seller |
| Mirror node | Verifies each payment (status, debited and credited accounts) |
| JS SDK | `@hiero-ledger/sdk` for clients, topic messages and scheduled transfers |

| Account | ID |
| --- | --- |
| Merchant agent (payer) | [`0.0.11342909`](https://hashscan.io/testnet/account/0.0.11342909) |
| Platform treasury (`payTo`) | [`0.0.10453173`](https://hashscan.io/testnet/account/0.0.10453173) |
| Seller (payout recipient) | [`0.0.10502605`](https://hashscan.io/testnet/account/0.0.10502605) |
| Facilitator fee payer | [`0.0.7162784`](https://hashscan.io/testnet/account/0.0.7162784) |

The fee payer pays the network fee; the HBAR moves from the agent's account to the treasury in the same transfer.

### Evidence

Recent live-API payment: a 2 ℏ insight report, [`0.0.7162784@1794007006.481801021`](https://hashscan.io/testnet/transaction/0.0.7162784-1794007006-481801021).

Earlier CLI fixture run, older prices (agent → treasury; all three confirmed on the mirror node as `SUCCESS`; full run in [`evidence/hedera-agent-run.json`](evidence/hedera-agent-run.json)):

| What | HBAR | Hedera transaction ID | HCS # |
| --- | --- | --- | --- |
| Record `lst_7f3a` (gold) | 2 | [`0.0.7162784@1793985302.813252518`](https://hashscan.io/testnet/transaction/0.0.7162784-1793985302-813252518) | 1 |
| Record `lst_91c2` (silver) | 1 | [`0.0.7162784@1793985304.420859908`](https://hashscan.io/testnet/transaction/0.0.7162784-1793985304-420859908) | 2 |
| Insight report `abandonment-drivers` | 3 | [`0.0.7162784@1793985310.661395447`](https://hashscan.io/testnet/transaction/0.0.7162784-1793985310-661395447) | 3 |

Payout: [schedule `0.0.11344252`](https://hashscan.io/testnet/schedule/0.0.11344252) executed, sending 1.2 ℏ from treasury `0.0.10453173` to seller `0.0.10502605`.

Also on HashScan: [HCS topic `0.0.11342910`](https://hashscan.io/testnet/topic/0.0.11342910) and [agent account `0.0.11342909`](https://hashscan.io/testnet/account/0.0.11342909).

### Two ways to run

**(a) Live web app (preferred).** Open https://hissa.tech, go to **Buyer**, and run **Check against real data** or **Find data**. The page calls https://api.hissa.tech, which pays through x402 on Hedera testnet. Locally: `npm run demo:api` and `npm run demo:web` (see Live demo above).

**(b) CLI fixture demo.** Requires Node 20+ and one ECDSA Hedera testnet account ([portal.hedera.com](https://portal.hedera.com)). It uses the fixture listings in `apps/server/src/fixtures.ts` and the older prices, and does not run against the live API.

```bash
npm install
cp .env.example .env          # set HEDERA_TREASURY_ID and HEDERA_TREASURY_KEY (ECDSA)
npm run hedera:setup          # creates the agent account (30 HBAR) and the HCS topic; idempotent
npm run hedera:server         # fixture marketplace with the x402 paywall on :4021
npm run hedera:agent          # in a second terminal: the agent buys 2 records + 1 report
```

Try the budget cap: `AGENT_BUDGET_HBAR=0.5 npm run hedera:agent` (every payment is aborted before signing).

| File | Role |
| --- | --- |
| `apps/server/src/api.ts` | Integrated API: paywalled routes, `/agent/*` routes, `/api/payouts`, HCS logging |
| `packages/pay/src/paywall.ts` | Hono x402 middleware, `ExactHederaScheme`, settlement callback |
| `packages/pay/src/payer.ts` | Agent's x402 `fetch` with spending controls |
| `packages/pay/src/hedera.ts` | Clients, HashScan links, mirror-node verification |
| `apps/agent/src/index.ts` | CLI merchant agent (fixture run) |
| `apps/server/src/pay-demo.ts` | Old fixture server for the CLI demo |

### Known limits

- The `/agent/*` routes are a public demo agent with no user authentication. Spend is bounded by the server's per-purchase, run and daily caps, on testnet.
- HCS delivery is best effort (see step 8).
- Telegram delivery is simulated; the 0.5 ℏ payment is real.

## Arkiv

**Built from scratch at ETHGlobal Mumbai.** The repo was created at the event on 6 Nov 2026 (first commit `5cd6b6a`); the team pivoted to Hissa at `aaf1457`. All Arkiv work was done at the event.

The web app publishes real encrypted listings to Arkiv (Rabdi testnet, chain 7794095) with `@arkiv-network/sdk`, discovers them by domain/region, signs consent/revoke requests, and reads durable activity/payment receipts. Seller earnings, the Public Ledger, buyer discovery and insight cohorts all read Arkiv; there is no other database.

**Writer wallet (creator and owner of every entity):** [`0x0F58223AAfF9C6e2534aaD09a996048175C04C96`](https://rabdi.explorer.arkiv.network/address/0x0F58223AAfF9C6e2534aaD09a996048175C04C96). Example listing tx: [`0x735f8761...6146d`](https://rabdi.explorer.arkiv.network/tx/0x735f87614fbfff16006b9c04e546a647716322e2dca072cbfc0bf9932526146d).

**Run one query (read-only, no key):**

```sh
npm --prefix packages/arkiv ci
node packages/arkiv/scripts/query-listings.mjs [domain]
```

Output on 7 Nov 2026:

```
chain 7794095 (Rabdi), block 315487, writer 0x0F58223AAfF9C6e2534aaD09a996048175C04C96
{"listing_id":"lst_eebc6757","domain":"education","region":"IN","consent_sale":true,"consent_insights":true,...}
{"listing_id":"lst_42f7f21d","domain":"beauty","region":"IN-west","consent_sale":true,"consent_insights":true,...}
2 listing(s)
dm.app_receipt.v1: 5 receipt(s) {"insight_purchase":3,"listing":2}
```

**Arkiv docs (one file per judging criterion):** [schema](arkiv/schema.md) · [friction / feedback](arkiv/friction.md) · [reach](arkiv/reach.md) · [why Arkiv](arkiv/why-arkiv.md) · [how we use Arkiv](arkiv/how-you-use-arkiv.md)

**Run the app locally:**

```sh
npm ci
npm --prefix packages/arkiv ci
npm --prefix apps/web ci
npm run arkiv:setup      # preserves existing keys; creates service key and browser pin, sends no transactions
npm run demo:api        # terminal 1; review .env transaction cap and Hedera testnet configuration first
npm run demo:web        # terminal 2; restart Vite after key setup
```

Use **sample export** or a supported ChatGPT/Claude JSON file, review the masked text, and publish. Keep the browser session: it holds the listing control key and any pending signed request. Publication, consent changes and deletion show confirmed Arkiv transaction hashes. The agent and ledger use the server API and do not invent payment results after an API error.

The live API runs on Fly.io at https://api.hissa.tech (one always-on machine with a volume for the Arkiv journal; see [docs/deploy.md](docs/deploy.md)). Funded end-to-end runs were done on it: listings `lst_eebc6757` and `lst_42f7f21d` were published, and a paid insight report settled on Hedera with its receipts written to Arkiv. It is still a single-seller testnet demo, not an authenticated production service. The 0G insights flow mixes real consenting Arkiv listings with a synthetic seed cohort and labels it. Masking runs on the device: an in-browser NER model (`Xenova/bert-base-NER`) hides names and places, rules hide emails, phone numbers and IDs, and the seller can add names it missed; unsupported export formats are rejected. A full demo walkthrough with a synthetic export is in [docs/demo-scenario.md](docs/demo-scenario.md).

Earlier encrypted-storage and lifecycle probe evidence is in `evidence/`. See the [Arkiv package documentation](packages/arkiv/README.md) for protocol and recovery details. The funded Rabdi writer key stays in the ignored local `.env` / Fly secrets; the synthetic record/key journal stays in ignored `evidence/private/`. `.env.example` lists configuration names without secrets.

**How we used AI.** Claude Code (Anthropic) helped write code, refactors, tests and docs, including the Arkiv research and probes; the team reviewed and ran the results. At runtime the product uses 0G-hosted models (see the 0G section) for classification and insight reports.
