# How we use Arkiv

SDK: `@arkiv-network/sdk` 1.0.1 on Rabdi testnet (chain 7794095). RPC `https://rpc.rabdi.db-chain.testnet.arkiv.network`, explorer https://rabdi.explorer.arkiv.network. Writer wallet: `0x0F58223AAfF9C6e2534aaD09a996048175C04C96`. Entities: [schema.md](schema.md).

## Run the query
```sh
npm --prefix packages/arkiv ci
node packages/arkiv/scripts/query-listings.mjs          # all listings; add a domain arg to filter, e.g. education
```
Output when we ran it on 7 Nov 2026 (no key needed):
```
chain 7794095 (Rabdi), block 315487, writer 0x0F58...4C96
{"listing_id":"lst_eebc6757","domain":"education","region":"IN","consent_sale":true,"consent_insights":true,"price":"100000000","expiresAtBlock":"1605484","ciphertextBytes":5082,...}
{"listing_id":"lst_42f7f21d","domain":"beauty","region":"IN-west","consent_sale":true,"consent_insights":true,"price":"100000000","expiresAtBlock":"1605840","ciphertextBytes":1790,...}
2 listing(s)
dm.app_receipt.v1: 5 receipt(s) {"insight_purchase":3,"listing":2}
```
(Expiry ~1.29M blocks away, about 30 days.) Live API equivalent: `GET https://api.hissa.tech/api/listings`.

## Do the things you filter on, who can edit each entity, and when it expires fit what your app does?
| Choice | Fit |
| --- | --- |
| **Filtered fields** `domain`, `region`, `consent_sale`, `consent_insights`, `listing_id`; receipts `kind`, `listing_id`, `payment_tx` | Exactly what buyers and the ledger ask: "beauty listings in IN-west that allow sale", "who consented to insights", "has this payment been recorded already". Content is never indexed. |
| **Who can edit** | Only the writer wallet. Listings are mutable (consent flip, delete) because consent must change; receipts and payout intents are readonly because history must not. Sellers authorise changes with signed requests (control version, replay-safe), not wallets. This is a custodial compromise, listed in [reach.md](reach.md) as the first thing to change. |
| **Expiry** | Seller-chosen 1 to 182 days on listings, so consent dies by itself ([`publisher.ts:601`](../packages/arkiv/src/publisher.ts)). Receipts use the max (~182 days), shorter than ideal for earnings history; renewal is future work. |

## Does each Arkiv feature you use change something your users see?
- **Create** (+ `ExpirationTime`): Seller sees "live" with a tx hash after confirmation ([`Seller.tsx:516`](../apps/web/src/views/Seller.tsx)).
- **Query by tag**: Buyer agent discovery, shown as `arkiv.query dm.listing ... -> N listings` ([`Agent.tsx:98-114`](../apps/web/src/views/Agent.tsx)). Paid insights quote the consenting cohort from `consent_insights=true` ([`Insights.tsx:75`](../apps/web/src/views/Insights.tsx), [`app-store.ts:217`](../packages/arkiv/src/app-store.ts)); under 50 people the report is refused before any charge.
- **Update**: Seller toggles consent; a revoked or off listing vanishes from buyer search and cannot be purchased ([`Seller.tsx:729`](../apps/web/src/views/Seller.tsx)).
- **Delete**: "Revoke" removes the listing ([`Seller.tsx:745`](../apps/web/src/views/Seller.tsx)).
- **Receipts**: Public Ledger and seller earnings/payout are built from Arkiv rows ([`Ledger.tsx:29`](../apps/web/src/views/Ledger.tsx)). No in-memory balance.
- **Read-back**: Paid record release decrypts the entity fetched from Arkiv after a fresh consent check ([`app-store.ts:242`](../packages/arkiv/src/app-store.ts)).

Not used: Arkiv as a write-only log. Reads gate payments and the UI.
