# Arkiv entity schemas

These four named schemas follow [work-plan §3.2](../docs/work-plan.md) and [architecture §2.1](../docs/architecture.md). The names are SDK schema tags: they separate app entity kinds in SDK queries, but do not authenticate writes or limit public reads.

| Schema | Column | SDK type | Indexed |
| --- | --- | --- | --- |
| `dm.listing` | `listing_id` | `str` | yes |
| | `domain` | `str` | yes |
| | `region` | `str` | yes |
| | `source` | `str` | yes |
| | `week` | `u64` | yes |
| | `quality_tier` | `str` | yes |
| | `consent_insights` | `bool` | yes |
| | `consent_sale` | `bool` | yes |
| | `price` | `u64` | yes |
| | `envelope_format` | `str` | no |
| | `ciphertext` | `bytes` | no |
| | `wrapped_key` | `bytes` | no |
| | `sealed_seller` | `bytes` | no |
| `dm.sale` | `listing` | `key` | yes |
| | `buyer_ref` | `str` | yes |
| | `payment_tx` | `str` | yes |
| | `price` | `u64` | yes |
| `dm.insight_receipt` | `spec_hash` | `str` | yes |
| | `analysis_id` | `str` | yes |
| | `domain` | `str` | yes |
| | `cohort_bucket` | `str` | yes |
| | `epsilon` | `dec` | yes |
| | `k_min` | `u64` | yes |
| | `payment_tx` | `str` | yes |
| | `contributors_root` | `str` | yes |
| | `sealed_contributors` | `bytes` | no |
| `dm.payout` | `batch_id` | `str` | yes |
| | `scheduled_tx` | `str` | yes |
| | `sealed_lines` | `bytes` | no |

### Type choices

- `week`, `price`, and `k_min` use `u64`; monetary `price` is in tinybars and must be handled as `bigint` when written.
- `epsilon` uses Arkiv `dec`, a fixed-point decimal with 18 places. Pass decimal text such as `"0.2"`; do not round through a JavaScript floating-point value.
- `listing` is a `key` because it references another entity. `spec_hash`, `buyer_ref`, `contributors_root`, and transaction/hash identifiers are indexed `str` values so callers can query them. Their hex representation fits Arkiv's 128-byte string limit. These values are public.
- The three listing `bytes` columns and the sealed receipt/payout columns are unindexed. Arkiv `bytes` values remain publicly readable; “sealed” describes application encryption, not Arkiv access control.
- The SDK adds the indexed `arkiv.schema` tag automatically. The application column sets above do not declare it themselves.

Schema definitions live in [`packages/arkiv/src/schemas.ts`](../packages/arkiv/src/schemas.ts). No expiry, create flags, validation of application payloads, reads or writes are implemented in this foundation slice.

Sources: [Arkiv schema guide](https://docs.arkiv.network/schemas/define/), [SDK 1.0.1 schema implementation](https://unpkg.com/@arkiv-network/sdk@1.0.1/src/schema/schema.ts), [SDK 1.0.1 type definitions](https://unpkg.com/@arkiv-network/sdk@1.0.1/src/schema/types.ts), [SDK 1.0.1 value constructors](https://unpkg.com/@arkiv-network/sdk@1.0.1/src/schema/values.ts).
