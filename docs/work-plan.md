# Work plan: who builds what

Three lanes that can run at the same time. Each lane owns its own folders, so nobody edits the same files. The shared contract (types, interfaces, routes) is written below, so every lane can start now, against mocks, without waiting for anyone.

Product and decisions: [plan-v2.md](plan-v2.md). Flows and storage: [architecture.md](architecture.md). Sources: [data-sources.md](data-sources.md).

## 1. Lanes

| Lane | Owner | Owns (folders) | Builds |
| --- | --- | --- | --- |
| **A — Product core** | You | `apps/web/`, `packages/shared/`, `packages/ingest/`, `packages/insights/`, `apps/server/src/index.ts`, `apps/server/src/routes/{records,insights,earnings}.ts` | All screens; parsers, own-message filter, masking; encryption and sealing; record release; insights privacy layer; earnings derivation; synthetic test users |
| **B — Arkiv** | Om | `packages/arkiv/`, `apps/server/src/routes/{listings,receipts}.ts`, `arkiv/*.md` | The real `ArkivStore`; publish, consent, revoke and browse routes; receipts route; the five Arkiv track files |
| **C — AI + payments** | AI/x402 friend | `packages/ai/`, `packages/pay/`, `apps/agent/`, `apps/server/src/routes/facets.ts` | The real `InferenceClient` (0G); x402 paywall on Hedera; the autonomous merchant agent; HCS payment log; scheduled payouts |

**One rule:** `packages/shared` has one owner (lane A). Others ask for a change; nobody else edits it.

If lane C has no one yet, lanes A and B still run end to end on the mocks.

## 2. Repo layout

```
apps/web          React + Vite: User tab, Merchant tab, Receipts page        (A)
apps/server       Node + Hono: index.ts mounts every route file             (A writes index.ts once)
apps/agent        Autonomous merchant agent                                  (C)
packages/shared   Types, zod schemas, interfaces, sealTo, mocks              (A)
packages/ingest   Parsers, own-message filter, masking, secret scan          (A)
packages/insights Premade analyses, cohort, privacy layer, aggregation       (A)
packages/arkiv    ArkivStore implementation                                  (B)
packages/ai       InferenceClient implementation (0G)                         (C)
packages/pay      x402 paywall, payer, HCS log, scheduled payouts             (C)
arkiv/            schema.md, friction.md, reach.md, why-arkiv.md, how-you-use-arkiv.md  (B)
```

Server secrets in `.env` only: `SERVICE_PRIVATE_KEY`, `ARKIV_WRITER_PRIVATE_KEY`, `ARKIV_ACCESS_KEY`, `HEDERA_TREASURY_ID`, `HEDERA_TREASURY_KEY`, `ZG_API_KEY`. The matching `SERVICE_PUBLIC_KEY` is pinned in web config.

## 3. Shared contract

These go into `packages/shared` in step 0, exactly as below. Lanes B and C can code against them today.

### 3.1 Interfaces

```ts
// Lane B implements. Mock: in-memory map.
export interface ArkivStore {
  publishListing(l: NewListing): Promise<{ entityKey: Hex; txHash: Hex; expiresAt: bigint }>;
  getListing(entityKey: Hex): Promise<Listing | null>; // null when deleted or expired
  queryListings(f: ListingFilter, cursor?: string): Promise<{ items: ListingPreview[]; next?: string }>;
  patchConsent(entityKey: Hex, c: { insights?: boolean; sale?: boolean }): Promise<{ txHash: Hex }>;
  deleteListing(entityKey: Hex): Promise<{ txHash: Hex }>;
  writeSale(r: SaleReceipt): Promise<{ txHash: Hex }>;
  writeInsightReceipt(r: InsightReceipt): Promise<{ txHash: Hex }>;
  writePayout(r: PayoutRecord): Promise<{ txHash: Hex }>;
  paymentUsed(paymentTx: string): Promise<boolean>; // replay check across sales and insight receipts
  listSales(cursor?: string): Promise<{ items: SaleReceipt[]; next?: string }>;
  listInsightReceipts(cursor?: string): Promise<{ items: InsightReceipt[]; next?: string }>;
  listPayouts(cursor?: string): Promise<{ items: PayoutRecord[]; next?: string }>;
}

// Lane C implements. Mock: canned facets, labels and report text with fake request IDs.
export interface InferenceClient {
  extractFacets(maskedText: string): Promise<{ facets: FacetEnvelope; requestId: string }>;
  labelForAnalysis(analysisId: string, items: { ref: string; excerpts: string[] }[]):
    Promise<{ labels: { ref: string; label: string }[]; requestIds: string[] }>;
  nameThemes(labels: string[]): Promise<{ themes: { name: string; members: string[] }[]; requestIds: string[] }>;
  writeReport(analysisId: string, tables: NoisedTables): Promise<{ markdown: string; requestIds: string[] }>;
}

// Lane C implements. Mock: accepts a header "x-mock-payment: <id>" as paid.
export interface PaymentGateway {
  paywall(opts: { priceTinybars: bigint; description: string }): MiddlewareHandler; // sets c.get('payment') = { txId, payer }
}
export interface Payouts {
  schedule(lines: { account: string; tinybars: bigint }[]): Promise<{ scheduledTxId: string }>;
}
```

### 3.2 Arkiv entities

From [architecture.md §2.1–2.3](architecture.md), using the schema already tested live:

- `dm.listing`: indexed `listing_id`, `domain`, `region`, `source`, `week`, `quality_tier`, `consent_insights`, `consent_sale`, `price`; unindexed `envelope_format`; bytes `ciphertext`, `wrapped_key`, `sealed_seller`.
- `dm.sale`: `listing` (key), `buyer_ref`, `payment_tx`, `price`.
- `dm.insight_receipt`: `spec_hash`, `analysis_id`, `domain`, `cohort_bucket`, `epsilon`, `k_min`, `payment_tx`, `contributors_root`; bytes `sealed_contributors`.
- `dm.payout`: `batch_id`, `scheduled_tx`; bytes `sealed_lines`.

All written by the platform writer wallet. Writes go through one serialised queue, because one wallet means one nonce sequence.

### 3.3 Encrypted payload and sealed blobs

```ts
ListingPayload = {      // encrypted with arkiv-encryption, key = per-listing record key
  v: 1, listing_id, consent_deadline, source, week,
  facets: FacetEnvelope, excerpts: string[]   // max 3, masked, uploader's own words only
}
SealedSeller = { payout_account, user_ref, ctl_public_key, consent_deadline }  // sealTo(service key)
```

`sealTo(publicKey, bytes)` / `openSealed(privateKey, bytes)`: ECDH P-256 + HKDF-SHA-256 + AES-256-GCM, in `packages/shared/seal.ts` (lane A).

### 3.4 Routes

| Route | Owner | What it does |
| --- | --- | --- |
| `POST /api/facets` | C | Masked text → facets + 0G request ID |
| `POST /api/listings` | B | Public tags, `ciphertext`, `wrapped_key`, `sealed_seller` → publish on Arkiv |
| `POST /api/listings/:key/consent` | B | Toggle consent; body signed with the listing's control key |
| `DELETE /api/listings/:key` | B | Revoke; signed with the control key |
| `GET /api/listings` | B | Browse by public tags (free) |
| `GET /api/receipts` | B | Sales, insight receipts and payouts for the public page |
| `GET /api/records/:key` | A (paywall from C) | x402 → check live + consent + replay → unseal, watermark, re-encrypt to buyer → `dm.sale` |
| `GET /api/analyses` | A | Premade analysis catalog with allowed filters |
| `POST /api/insights/:analysisId` | A (paywall from C) | Cohort check first (refuse free), then x402 → labels, themes, privacy layer, report → `dm.insight_receipt` |
| `GET /api/earnings` | A | Earnings for listings the caller proves it controls |

## 4. Steps

### Step 0 — skeleton (lane A, first, keep it short)

Folders, `packages/shared` with the contract above, mocks for all three interfaces, `apps/server/src/index.ts` mounting every route file (empty stubs for lanes B and C), a blank web app. Push. From here, every lane works only in its own folders.

### Step 1 — each lane builds its core against mocks

| Lane | Work | Done when |
| --- | --- | --- |
| A | Parsers for the six sources; own-message filter; masking and secret scan; User tab: upload → masked preview → review with two toggles → encrypt and seal → POST | A real export of each source becomes a reviewed, encrypted listing on the mock store |
| B | Real `ArkivStore` (all four entities, serialised writer, paging); listing and receipts routes; first drafts of `schema.md` and `friction.md` | Listings published from the User tab appear on Rabdi and in `GET /api/listings` |
| C | Real `InferenceClient` on the 0G private route with request IDs; `POST /api/facets`; x402 `paywall` settling on Hedera testnet | Review screen shows real 0G facets and request ID; a paywalled test route settles and shows on HashScan |

### Step 2 — the two paid flows

| Lane | Work | Done when |
| --- | --- | --- |
| A | Record release with watermark; Merchant tab (browse, buy, decrypt, analyses, report view); insights pipeline and privacy layer; synthetic test users (at least 60) so cohorts clear the minimum; earnings | Buying a record and running an analysis both work on mocks, and a report never shows a cohort under the minimum |
| B | Consent and revoke wired to Arkiv; receipts queries for the public page and earnings; `reach.md`, `why-arkiv.md`, `how-you-use-arkiv.md` | Revoked or expired listings are refused for sale and excluded from analyses on the real chain |
| C | Autonomous merchant agent: discovers listings, buys records and runs an analysis within its budget with no human approval; HCS payment log; scheduled payouts | Agent completes paid requests end to end; each payment is on HashScan and in the HCS topic; a payout batch is scheduled |

### Step 3 — swap mocks for real everywhere

Run the whole flow with real Arkiv, real 0G and real Hedera: upload → publish → agent buys a record → agent runs an analysis → receipts page → payout. Fix what breaks at the seams.

## 5. Decisions taken for this plan

- **Upload flow split at the HTTP boundary:** lane A builds everything in the browser up to `POST /api/listings`; lane B builds the route and everything after it. This resolves the overlap with Om's stated next step.
- **No private database:** private state is sealed onto Arkiv (architecture.md §2.3). This replaces the Arkiv research note that puts seller, key and consent state in private service storage.
- **Consent flags stay public** on the listing, as in the live test.
- **Encryption:** `arkiv-encryption` for record bodies plus a `sealTo` helper (architecture.md §2.4). The probe's AAD envelope is not carried forward.
