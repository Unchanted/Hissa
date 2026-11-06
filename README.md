# User-owned data marketplace

Implementation planning and completed Arkiv validation for ETHGlobal Mumbai.

- [Current architecture and product scope](docs/architecture.md)
- [Plan: product, sponsor tracks and decisions](docs/plan-v2.md)
- [Work plan: who builds what](docs/work-plan.md)
- [Data sources and the third-party message rule](docs/data-sources.md)
- [Arkiv SDK and security research](docs/arkiv-research-2026-11-06.md)
- [Live test findings, transaction links and remaining checks](docs/arkiv-test-findings-2026-11-06.md)

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

The encrypted-storage and listing-lifecycle probes passed and their temporary
code/dependencies were removed. Public results remain in `evidence/`. The Hedera payment flow above is runnable; the rest of the application is not built yet.

The funded Rabdi writer key remains in the ignored local `.env`; the synthetic
record/key journal remains in ignored `evidence/private/`. Keep both private.
`.env.example` lists configuration names without secrets.

AI assistance was used for research, probe implementation and validation.
