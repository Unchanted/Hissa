# Arkiv implementation test findings — 6 November 2026

## Decision

**Proceed with Arkiv for the encrypted catalogue and listing lifecycle.** Live
Rabdi tests passed for publication, byte readback, coarse indexed queries, consent
patching, non-owner rejection, deletion and natural expiry. These are the core
storage/lifecycle behaviors required by our architecture.

This is not a claim that Arkiv or our marketplace is fully tested. Arkiv stores
public data and enforces entity ownership and block expiry. Our application must
encrypt records, authenticate user control, enforce consent at use time, hold and
revoke keys, gate purchases on payment and protect insight outputs.

## Environment and evidence

- Network: Rabdi testnet, chain ID `7794095`.
- Node: `24.22.2`; npm: `11.19.1`.
- Packages: `@arkiv-network/sdk@1.0.1`, `viem@2.57.16`.
- Public RPC: `https://rpc.rabdi.db-chain.testnet.arkiv.network`; no access key.
- Platform test writer: `0x0F58223AAfF9C6e2534aaD09a996048175C04C96`.
- Test namespace: `datamarket.listing.spike.v1`, separate from production.
- Data: synthetic laptop-shopping text only; no real chat exports.
- [Original storage evidence](../evidence/arkiv-roundtrip.json).
- [Additional lifecycle evidence](../evidence/arkiv-lifecycle.json).

## What passed live

| Check | Observation and limit |
| --- | --- |
| Network and funding | Correct chain ID; writer initially received 5 tGLM. |
| Publication | Signed platform-wallet creation settled successfully. |
| Encrypted bytes | All 211 envelope bytes read back exactly through a fresh SDK client in the same Node process. |
| Decryption | Application AES-GCM decrypted the stored envelope into the expected validated synthetic record. Encryption was our code, not an Arkiv feature. |
| Provenance | Reads checked creator, current owner, creation flags, expected listing ID and envelope format. A deliberately wrong trusted writer was rejected by application code. |
| Coarse search | A query combining listing ID, domain and region, restricted to platform creator and owner, returned the listing. This does not search encrypted content. |
| Consent update | Platform owner patched `consent_insights` from true to false. A fresh client saw false and unchanged ciphertext. Application use was rejected, and a consent=true query excluded the listing. |
| Non-owner update | A different address's patch was rejected during live gas estimation with an explicit ownership error. No unauthorized transaction was broadcast; this was not an independently mined attack transaction. |
| Deletion | Owner deleted the original listing. Both `getEntity` and the indexed listing query stopped returning it. Historical ciphertext and local keys were not erased. |
| Natural expiry | Created a second listing with a 20-second block lifetime. It was readable before expiry. At block `298273`, both `getEntity` and the indexed query stopped returning it, without an explicit delete. |

The original evidence's `expiry` check only meant the listing was live and its
reported expiry matched the create receipt. The later lifecycle test is the actual
proof of natural expiry. The original listing has now been deliberately deleted;
its unavailable current state does not invalidate its historical write/read result.

### Transactions

| Operation | Explorer |
| --- | --- |
| Original encrypted create | [0x7b47e50e…](https://rabdi.explorer.arkiv.network/tx/0x7b47e50e5ce94848e22489a4d4ce1b2626147463df384376cbac226e4155cf8c) |
| Consent off | [0xffd3191a…](https://rabdi.explorer.arkiv.network/tx/0xffd3191aecef0b4be672bed19818834375287ec97c7a1d94c5001b2fbd1cd35d) |
| Delete original listing | [0xfbca478f…](https://rabdi.explorer.arkiv.network/tx/0xfbca478f3cae5b84f019fec93ae7f518755a25860d23f7edc77ddbfdf7ef1157) |
| Short-lived create | [0xd53312d6…](https://rabdi.explorer.arkiv.network/tx/0xd53312d6eb5f1eed490a31c217e38742ccb2389d723bcf5e1d631afe4beeddd6) |

Original entity: `0x2751c34d1747cc0edd520ab947bd43028cd14f7af85c9ca2ad3f5d8dbf6b9ec8`.
Expired entity: `0xa5aaf95ae280474c0ad9d2410f4af07332d82429dfcef8535520f74bddf6ca05`.

## Offline application checks

Three test groups passed before cleanup:

1. AES-256-GCM round trip, fresh random IVs, wrong-key rejection, ciphertext
   tamper rejection, listing-ID binding and consent-deadline binding.
2. Rejection of short/oversized/unknown-version envelopes and malformed records,
   including unknown fields, invalid identifiers, invalid deadlines and excerpt bounds.
3. Application rejection for wrong creator/owner, unexpected creation flags,
   missing/reached block expiry, reached wall-clock deadline, consent off, and
   mismatched identity/format, using synthetic SDK-shaped rows.

These validate the small probe, not production privacy or browser masking. The
offline tests did not constitute a comprehensive audit of all malformed-input cases.
Dependency audit at installation/check time reported zero known vulnerabilities.

## Schema and cryptography exercised

Indexed fields: `listing_id`, `domain`, `region`, `source`, `week`, `quality_tier`,
`consent_insights`, `consent_sale`, `price`. Unindexed fields: `envelope_format`,
`ciphertext`. Unindexed means public but not searchable, not private.

The envelope used an independent AES-256 key, a random 12-byte IV, a version byte,
and authenticated ciphertext/tag. Additional authenticated data was the UTF-8 JSON
array `["datamarket.probe.aes-gcm.v1", listing_id, consent_deadline]`. Decrypted JSON
also had to match that context. The synthetic plaintext contained only `version`,
`listing_id`, `consent_deadline` and bounded `excerpts`.

This was adapted from the historical Web Crypto implementation, not
`arkiv-encryption`, and is not wire-compatible with that package. It does not
select the final production facet schema or key-wrapping protocol.

Listings were mutable (`readonly: false`) to support the current architecture's
consent patches, with `permissionlessExtension: false`. Production still needs
authenticated control and a private authoritative deadline/key store. Public
schema tags alone do not authenticate a publisher; match the trusted writer.

## Cost and timing

The original create took 6.259 seconds; its combined receipt/read/decrypt/query
verification took 2.401 seconds. It used 219,256 gas, costing 0.000219256 tGLM.
These are single-run observations for 211 bytes on the public RPC, not performance
or capacity guarantees.

After all four successful writes, the recorded wallet balance was
**4.999357863 tGLM** (`4999357863000000000` base units), versus 5 tGLM before the
tests. The observed total spend was 0.000642137 tGLM. Balance is a dated observation.

## What remains unverified

- Pagination across multiple pages, concurrent creates/deletes/expiry, and index
  visibility under load. The installed SDK page API uses limit/offset; a reliable
  continuation strategy still needs integration proof.
- Representative payloads near the 128 KiB bytes budget, write/read latency at
  useful sizes, RPC throttling and recovery from uncertain write outcomes.
- Parallel writers, nonce coordination, retry/reconciliation and outage behavior.
- Extensions, renewal authorization, transfers and production receipt schemas.
- Browser execution, export parsing, masking accuracy and the full facet envelope.
- Authenticated user control, release-key wrapping/custody, key deletion/backup
  retention, and consent/revocation races. A changed public flag alone cannot
  stop someone decrypting ciphertext if they already hold its key.
- Hedera/x402 payment verification and replay prevention, buyer-specific delivery,
  payouts, 0G inference/attestation and insight privacy protections.

None of these missing checks were represented as passes. Test the relevant ones
as their production integration is built; no claim of complete marketplace
correctness follows from this storage probe.

## Cleanup and next implementation step

Removed the throwaway probe scripts, unit tests, probe-only npm manifest/lockfile
and installed dependencies after recording results. The JSON evidence remains;
there is no runnable test command after cleanup.

Preserved `.env` containing `ARKIV_WRITER_PRIVATE_KEY`, its permissions, the ignored
private record/key journal at `evidence/private/arkiv-probe.json`, and `.gitignore`
protections. Neither private file belongs in version control. No private key is
included in this report. The second short-lived record's temporary data key was
held only in memory. No test entities remain live after these lifecycle tests.

Next: implement the browser upload → local masking → review → encrypted publication
flow and its server-owned Arkiv writer/private key-state boundary. Use
[architecture.md](architecture.md) for current product behavior and
[the Arkiv research](arkiv-research-2026-11-06.md) for SDK/API details. Resolve their
remaining ownership/consent and schema differences explicitly during integration;
the probe is evidence, not a replacement production specification.
