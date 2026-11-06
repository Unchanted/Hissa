# Arkiv research for the data marketplace

Researched **6 November 2026** against live documentation, npm metadata and published package source. This is research, not an approved replacement for [plan-v2.md](./plan-v2.md). No application code exists in the current tree. Historical code was inspected at `ebf6c06`.

## 1. What Arkiv provides

Arkiv is a public, wallet-owned database with native indexed queries and expiring entities. Writes are signed Ethereum transactions; reads use JSON-RPC without an on-chain payment transaction. An entity has typed attributes and system fields including `$key`, `$owner`, `$creator` and `$expiresAt`. Ownership controls mutation, **not who can read**. The creator never changes; the owner can change.

For this project, Arkiv can hold the public catalogue and encrypted masked records. It does not implement the marketplace's payment gate, consent authentication, key custody, buyer encryption, watermarking or payouts. Hedera payment settlement remains a separate system.

Sources: [Introduction](https://docs.arkiv.network/start-here/introduction/), [RPC reads](https://docs.arkiv.network/json-rpc/querying-data/).

## 2. Current network and packages

| Item | Verified current value |
| --- | --- |
| Public testnet | Rabdi |
| Chain ID | `7794095` |
| RPC | `https://rpc.rabdi.db-chain.testnet.arkiv.network` |
| WebSocket | `wss://rpc.rabdi.db-chain.testnet.arkiv.network` |
| Explorer | `https://rabdi.explorer.arkiv.network` |
| Gas token | Test GLM, `tGLM`; separate from the plan's HBAR payments |
| Nominal block time | 2 seconds |
| SDK npm `latest` | `@arkiv-network/sdk@1.0.1`, with `viem` 2.x as a required peer |
| Encryption npm `latest` | `arkiv-encryption@1.1.3` |

Use Node 22.10+ to follow the current quickstart. Obtain an access key and test tokens from Arkiv Hub. SDK construction is `rabdi({ accessKey })`. Published SDK 1.0.1 rejects a missing/non-string key but explicitly permits `""` with a heavily rate-limited public endpoint; the encryption guide recommends requiring a configured key instead. An RPC access key is not a decryption key or a data access policy. Keep a server key server-side; a browser key is visible and needs appropriate restrictions.

Older search results still describe Braga/Tiramisu, SDK 0.8.x, standalone payload/content-type fields, and different query APIs. Live docs and published declarations take precedence. Arkiv's official encryption skill currently references 1.1.1; npm is already at 1.1.3. Its README says 1.1.2–1.1.3 changed documentation and the exported version string, without changing crypto behavior.

Sources: [Rabdi](https://docs.arkiv.network/networks/rabdi/), [Quickstart](https://docs.arkiv.network/start-here/first-entity/), [Access keys](https://docs.arkiv.network/start-here/access-keys/), [SDK registry](https://registry.npmjs.org/@arkiv-network/sdk/latest), [Encryption registry](https://registry.npmjs.org/arkiv-encryption/latest), [Actual SDK chain implementation](https://unpkg.com/@arkiv-network/sdk@1.0.1/src/chains/rabdi.ts).

## 3. How storage and querying work now

Define a named schema with `defineSchema('datamarket.listing.v1', columns)`. The SDK automatically writes an indexed `arkiv.schema` tag and scopes queries to it. A separate hand-written `schema` attribute is unnecessary. This is a namespace, not authentication: anyone can copy the tag.

Use `.indexed()` only for public fields that queries filter on. An unindexed value is still public. Store the encrypted body in a `bytes()` column; bytes cannot be indexed. Current SDK storage has no special standalone payload/content-type fields: names such as `ciphertext` and `media_type` are application-defined columns.

Suggested mapping of the existing plan, pending product changes:

| Value | Storage |
| --- | --- |
| Category, region, source, freshness, quality tier | Indexed `str()` columns where used as filters |
| Price in tinybars | Indexed `u64()` if filtering by price; use bigint and SDK `u64(...)`, never floating point |
| Random listing ID | `str()`; index only if looking records up by this ID |
| Ciphertext | Non-indexed `bytes()` |
| Envelope/media type | Non-indexed `str()` |
| Expiration | Native `$expiresAt`, set through create options |
| Seller identity, payout account, wrapped key, consent state | Private service storage, not public listing attributes |

Create with `walletClient.createEntity(schema, values, { expiration, flags })`; the result includes `entityKey`, `txHash` and `expiresAt`. Read with `getEntity(entityKey, schema)`. Column values are typed objects: read `.value`; a returned bytes value is hex, convertible with viem's `hexToBytes`. System fields retain their `$` prefix.

Merchant browsing uses `select(...).from(schema).createdBy(platformWriter).ownedBy(platformWriter).where(and(...)).limit(...).fetch()`. Multiple attribute predicates are supported. Select preview fields only to save bandwidth, but understand that anybody can independently request the ciphertext. Configure the trusted writer address independently of fetched data. For fixed listings, prefer `readonly: true`, no ownership transfers, and validate creator, owner, creation flags and expected format again before purchase/release. Mutable records need authenticated version/provenance rules rather than assuming a current owner authenticates prior content.

Queries support equality, ranges and boolean composition over supported indexed fields. They cannot search encrypted excerpts, intent or budget. The sample merchant request in the plan asks for laptop, budget and timeframe details absent from its public schema; it can only produce coarse candidates unless an additional private matching stage or revised public vocabulary is deliberately chosen. Do not silently expose fine-grained fields to make the query work.

Current limits: 31 application columns in a named schema, 128 UTF-8 bytes per string, 128 KiB per bytes value and across all bytes values in a create/patch, and 100 rows per page. Current pagination docs describe limit/offset and key-based continuation. Concurrent creates/deletes/expiry can shift offset pages; use key-based continuation when scanning. Check the pinned SDK declarations before implementing pagination because indexed/search-cached docs show older APIs.

Sources: [Schemas](https://docs.arkiv.network/schemas/define/), [Create](https://docs.arkiv.network/writing/create/), [Filter](https://docs.arkiv.network/querying/filter/), [Select](https://docs.arkiv.network/querying/select/), [Pagination](https://docs.arkiv.network/querying/paginate/), [Limits](https://docs.arkiv.network/reference/limits/).

## 4. How Arkiv recommends encryption

Arkiv's official agent guidance points to **`arkiv-encryption`**, a separate package maintained in `SantiagoDevRel/arkiv-encrypted-entities`, rather than encryption built into the SDK or chain. It uses browser/Node Web Crypto. Using that package is a documented route; Arkiv stores arbitrary bytes and does not require its envelope format.

The published 1.1.3 API is:

| Export | Meaning |
| --- | --- |
| `generateKey()` | Random independent 256-bit secret as 64 hex characters without `0x` |
| `importKey(raw)` | Imports that secret or 32 bytes as a non-extractable AES-GCM key |
| `encryptBytes(key, plaintext)` | Encrypts a string or bytes with a fresh random IV |
| `decryptBytes(key, envelope)` | Returns authenticated bytes; wrong key/tampering fail |
| `CONTENT_TYPE` | `application/vnd.arkiv.encrypted.v1` |

Its binary format is **12-byte random IV + ciphertext + 16-byte authentication tag**, with no embedded version header, compression, padding or additional authenticated data (AAD). The plaintext limit is 100,000 bytes, a package policy distinct from chain limits. Ciphertext length exposes exact plaintext length plus 28 bytes.

Key rules: generate independently of wallet keys/signatures/passwords; prefer one key per record; encrypt before upload; never put a raw key, plaintext or sensitive labels in attributes, URLs, logs or analytics. A non-extractable handle does not erase the original secret string. The package provides no wrapping, recovery, sharing, rotation, revocation, payment enforcement or buyer-specific encryption.

**Successful decryption does not prove publisher identity or bind ciphertext to a listing.** Verify trusted creator and readonly publication, and validate decrypted JSON against the application schema. For our app, include listing ID, schema version and consent deadline inside the authenticated encrypted record and compare them with the authoritative listing. This is an application recommendation, not an extra package API. Do not invent an AAD option for this package.

Sources: [Official encryption guidance, live raw source](https://raw.githubusercontent.com/Arkiv-Network/skills/main/skills/arkiv-encryption/SKILL.md), [Package 1.1.3 README](https://unpkg.com/arkiv-encryption@1.1.3/README.md), [Published declarations](https://unpkg.com/arkiv-encryption@1.1.3/dist/index.d.ts), [Official privacy guidance](https://raw.githubusercontent.com/Arkiv-Network/skills/main/skills/arkiv-security-trust/references/privacy.md).

## 5. Fit with this marketplace and corrections to the plan

The existing browser-encryption/server-release design fits Arkiv's public-storage model:

1. Browser masks and obtains user review, creates a random listing ID and independent per-record data key, then encrypts the reviewed record.
2. Browser wraps that key to the release service. Wrapping is a separate Web Crypto/application protocol; `arkiv-encryption` does not implement it. The wrapping recipient's public key must come from a trusted application configuration.
3. Platform service validates the submission and consent, durably associates private seller/key state with the listing, and writes ciphertext plus coarse tags using its writer wallet. Keep incomplete writes unavailable for sale and reconcile uncertain transaction outcomes before retrying.
4. Merchant queries public catalogue fields. The service checks the authoritative listing, price, consent and settled payment, binds the purchase to the buyer's public key and prevents payment replay.
5. Release service unwraps/decrypts, validates listing context, watermarks, and separately encrypts the purchased copy to that buyer. It never returns the original record key.

These are application responsibilities inferred from the project's requirements, not capabilities verified in an Arkiv marketplace product.

Specific corrections before implementation:

- **Expiry is a block height, not an exact consent clock.** `fromDays(30)` is approximate. Enforce a private wall-clock consent deadline as well as chain expiry; deny release when either expires or state cannot be verified. Arkiv emits no expiry event. Never automatically extend consent. Leave `permissionlessExtension` false so strangers cannot prolong live availability.
- **Expiry/deletion does not securely erase copies.** Maximum lifetime is 7,884,000 blocks, about 182.5 days per create/extension. A 30-day listing is supported. Readonly records can still be deleted or extended by an eligible account.
- **Deleting a wrapped-key row is not unconditional cryptographic erasure.** If backups retain the wrapped key and the service retains its wrapping private key, the record remains decryptable. Stop future service releases immediately, coordinate revoke with in-flight releases, invalidate caches, and define key/backup retention. Do not claim nobody can ever decrypt it again. Already delivered plaintext cannot be recalled.
- **Platform ownership is custodial.** Users can authorize app actions, but the platform wallet owns and controls Arkiv entities. Avoid presenting this as direct user ownership enforced by Arkiv. A compromised service can read releasable records.
- **No wallet attribute does not guarantee anonymity.** Creator, transaction timing, ciphertext size and tag combinations remain public. A shared platform writer avoids directly publishing the seller's wallet, but does not eliminate correlation.
- **Freshness buckets become stale.** A readonly listing tagged `this_week` will keep that tag. Define whether freshness is measured at publication or derive it from a public coarse date; do not promise continuously updated freshness without an update/republication policy.

Source for expiration details: [Expiration](https://docs.arkiv.network/writing/expiration/). Privacy limitations are documented in the encryption and privacy sources above.

## 6. Reuse from Preflight history

`apps/preflight/src/hygiene/arkiv.ts` already uses Rabdi, named schemas, bytes columns and expiry helpers. Reuse that integration shape, but not its user-wallet signer, single localStorage data key, recovery-file flow or plan-specific schema. Current marketplace custody needs server writes and independent per-record keys. Prefer current typed reads over its permissive tagged/bare-value compatibility handling.

`packages/shared/src/hygiene/envelope.ts` already implements AES-256-GCM, random 12-byte nonces, a version header, AAD and schema validation. It is **not wire-compatible** with `arkiv-encryption`: the old envelope has an extra version byte and AAD, and neither format can open the other without explicit handling. Its AAD binds record type/version, not individual listing identity.

Decision for later implementation: use the documented package with explicit application context checks, or adapt the existing Web Crypto envelope to bind listing context through AAD. Do not add both formats without a real compatibility requirement; do not remove context binding merely to match an example. No existing marketplace data requires migration today.

## 7. Proof still needed when implementation starts

Before a live demo, verify crypto roundtrip, fresh IVs, wrong-key/tamper rejection, format/identity mismatch rejection and input bounds locally. Then use synthetic data for a Rabdi write and fresh-client byte readback, trusted-writer rejection, multi-field queries, expiry and revoke behavior. Test payment replay and a revoke racing release at the service boundary.

Measure write gas/cost, inclusion latency and read latency with representative ciphertext sizes. The package's sample recommends estimating the exact write at `latest`, explicit gas headroom and nonce management, receipt verification, and reconciling unknown outcomes instead of blindly resending. A shared platform writer needs serialized nonce allocation. These are operational concerns to verify, not measured performance claims.

Research performed: documentation/source inspection, registry version checks and historical-code review. No dependencies installed, keys generated, transactions submitted, RPC performance measured or Hedera/0G integrations verified. The old plan was left unchanged for the forthcoming product revisions.
