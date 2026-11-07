# Hissa

> **Platforms profit from your chats. Hissa flips it: you own the data, you set consent, you get paid.**

*Hissa* (हिस्सा) means "share" in Hindi: your share of the value your data creates.

## Project description

Every conversation with an AI assistant or on a messaging app reveals what people want, compare, buy and give up on. That signal is valuable to brands and AI companies, but the people who produce it have no ownership, no real control over consent, and no share of the money. Buyers face the opposite problem: they need real human data, yet scraping is legally risky and comes with no proof of consent.

Hissa is a user-owned data marketplace that connects the two sides.

**For people who provide data.** You upload a chat export (ChatGPT, Claude, WhatsApp, Telegram and more). Your browser keeps only your own messages and masks names, phone numbers and places before anything leaves the device. 0G Private Computer extracts structured insights inside a TEE. The record is encrypted and listed on Arkiv with only coarse public tags, your consent choices and an expiry date. You can revoke consent at any time, and you earn rewards whenever your data is used.

**For AI companies that buy data.** A merchant AI agent discovers listings on Arkiv, then pays for data or insights over x402 on Hedera, on its own and within a spending budget, with no human approval. Every payment is settled on Hedera and logged to an HCS topic. The buyer receives the decrypted, masked data for AI training or an anonymised insight report. Payments flow back to the users who contributed.

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

A merchant AI agent discovers listings, then buys records and insight reports over
**x402**, paying **HBAR on Hedera testnet** through the **Blocky402** facilitator,
with no human approval. Each payment is checked on the mirror node and appended to
an **HCS topic** that only the agent can write to.

| | |
| --- | --- |
| Network | Hedera testnet (`hedera:testnet`), facilitator `https://api.testnet.blocky402.com` |
| Platform treasury (`payTo`) | [`0.0.10453173`](https://hashscan.io/testnet/account/0.0.10453173) |
| Merchant agent | [`0.0.11342909`](https://hashscan.io/testnet/account/0.0.11342909) |
| Agent payment log (HCS) | [`0.0.11342910`](https://hashscan.io/testnet/topic/0.0.11342910) |

**Settled x402 payments** (agent → treasury; full run in [`evidence/hedera-agent-run.json`](evidence/hedera-agent-run.json)):

| What | HBAR | Hedera transaction ID | HCS # |
| --- | --- | --- | --- |
| Record `lst_7f3a` (gold) | 2 | [`0.0.7162784@1793985302.813252518`](https://hashscan.io/testnet/transaction/0.0.7162784-1793985302-813252518) | 1 |
| Record `lst_91c2` (silver) | 1 | [`0.0.7162784@1793985304.420859908`](https://hashscan.io/testnet/transaction/0.0.7162784-1793985304-420859908) | 2 |
| Insight report `abandonment-drivers` | 3 | [`0.0.7162784@1793985310.661395447`](https://hashscan.io/testnet/transaction/0.0.7162784-1793985310-661395447) | 3 |

`0.0.7162784` is the Blocky402 fee payer: it pays the network fee, while the HBAR
moves from the agent's account to the treasury in the same transfer.

### Payment flow

```
agent ── GET /api/listings (free) ───────────────────────────► server
agent ── GET /api/records/:key ──────────────────────────────► 402 + PAYMENT-REQUIRED (price by tier)
agent    spending controls: per-purchase cap, run budget, daily cap → abort or sign
agent ── retry with PAYMENT-SIGNATURE (signed HBAR transfer) ─► server ─► Blocky402 verify + settle on Hedera
agent ◄─ 200 + record + PAYMENT-RESPONSE (Hedera tx ID) ───────
agent    mirror node check → HCS topic message (payment log)
```

Unknown or non-consented listings and too-small insight cohorts are refused
**before** any 402, so no money moves.

### Run it

Requires Node 20+ and one ECDSA Hedera testnet account ([portal.hedera.com](https://portal.hedera.com)).

```bash
npm install
cp .env.example .env          # set HEDERA_TREASURY_ID and HEDERA_TREASURY_KEY (ECDSA)
npm run hedera:setup          # creates the agent account (30 HBAR) and the HCS topic; idempotent
npm run hedera:server         # marketplace API with the x402 paywall on :4021
npm run hedera:agent          # in a second terminal: the agent buys 2 records + 1 report
```

Try the budget cap: `AGENT_BUDGET_HBAR=0.5 npm run hedera:agent` (every payment is aborted before signing).

| File | Role |
| --- | --- |
| `packages/pay/src/paywall.ts` | Hono x402 middleware, `ExactHederaScheme`, settlement callback |
| `packages/pay/src/payer.ts` | Agent's x402 `fetch` with spending controls |
| `packages/pay/src/hcs.ts` | HCS payment log |
| `packages/pay/src/hedera.ts` | Clients, HashScan links, mirror-node verification |
| `packages/pay/scripts/setup.ts` | Creates the agent account and the HCS topic |
| `apps/server/src/pay-demo.ts` | Paid routes `GET /api/records/:key`, `POST /api/insights/:analysisId` |
| `apps/agent/src/index.ts` | The autonomous merchant agent |

Listings, records and reports are still fixtures (`apps/server/src/fixtures.ts`)
until the Arkiv and 0G lanes are wired in.

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
