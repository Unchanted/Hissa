# Arkiv entity schemas

Chain: Rabdi testnet, id 7794095. SDK `@arkiv-network/sdk` 1.0.1. Definitions: [`schemas.ts`](../packages/arkiv/src/schemas.ts) (`dm.listing`), [`app-store.ts:13-19`](../packages/arkiv/src/app-store.ts) (receipts, payout intent).

**Owner for every entity:** the service writer wallet `0x0F58223AAfF9C6e2534aaD09a996048175C04C96` (creator and owner). Sellers do not hold wallets; they sign requests with a browser-held P-256 key and the service applies the change. Readers filter by `createdBy` + `ownedBy` = writer, so entities from other wallets are ignored.

| Schema | Editable? | Expiry | Indexed (queried by) | Not indexed |
| --- | --- | --- | --- | --- |
| `dm.listing` | Mutable, owner only. Consent change = `update`; revoke = `delete`. Permissionless extension off. | Seller picks 1 to 182 days (`ExpirationTime.fromSeconds`, [`publisher.ts:601`](../packages/arkiv/src/publisher.ts)) | `domain`, `region` (buyer discovery, [`Agent.tsx:98`](../apps/web/src/views/Agent.tsx)); `consent_sale=true` (buyer discovery); `consent_insights=true` + `domain` (insight cohort, [`app-store.ts:217`](../packages/arkiv/src/app-store.ts)); `listing_id` (lookup). Also indexed, shown only: `source`, `week`, `quality_tier`, `price` | `envelope_format`, `ciphertext`, `wrapped_key`, `sealed_seller` |
| `dm.app_receipt.v1` | Readonly at creation, permissionless extension off | `ExpirationTime.max()` (about 182 days) | `kind` (listing, consent, revoke, sale as `record_purchase`, `contact_purchase`, `payout`, `insight_purchase`), `listing_id`, `payment_tx` (dedup). Ledger and earnings read all rows ([`app-store.ts:83`](../packages/arkiv/src/app-store.ts)) | `amount`, `at` (u64), `sealed_details` |
| `dm.payout_intent.v1` | Readonly, extension off | `ExpirationTime.max()` | `create_tx` | `sealed_lines` |

## Payload notes
- `ciphertext`: AES-256-GCM over JSON `v2`, which carries the full masked chat gzipped (`text_gzip`) plus facets. Browser caps it at 120 KiB ([`apps/web/src/arkiv.ts:158`](../apps/web/src/arkiv.ts)); Arkiv's per-entity `bytes` budget is 128 KiB and `wrapped_key` and `sealed_seller` share it.
- `wrapped_key` (record key) and `sealed_seller` (payout account, contact consent, consent deadline, control key, version) are sealed to the service's P-256 key.
- `sealed_details` holds payout account, seller share in tinybars and the HashScan link, sealed with the service key.
- `price` is tinybars (`u64`); `week` is `YYYYWW`; `consent_*` are `bool`.
- Receipt `kind` in `listing`, `consent` and `revoke` rows is an audit trail of Arkiv transactions; the other kinds mirror Hedera payments.
- Everything on Arkiv is publicly readable. "Sealed" means application encryption, not Arkiv access control.

## Legacy, unused by the app
`dm.sale`, `dm.insight_receipt` and `dm.payout` remain in `schemas.ts` from the original plan. The running app writes none of them; `dm.app_receipt.v1` replaced them.
