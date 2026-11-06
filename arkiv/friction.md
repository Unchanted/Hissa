# Arkiv friction and limits

Note: statements below about incomplete integration and "no new writes" predate the integrated app run described in the last section.

These notes distinguish storage constraints from application guarantees. The read-side implementation uses SDK `1.0.1`; it is not a complete marketplace integration.

- **Public data:** Arkiv has no read access control. Indexed values, unindexed strings and `bytes` are public. The schema tag is a namespace, not authorization. Sealed blobs depend on the application's encryption and key custody.
- **Write ordering:** [`SerialQueue`](../packages/arkiv/src/serial-queue.ts) serializes tasks in one process and one queue instance. The service must share one queue for its writer wallet and await the transaction receipt inside each task. It does not coordinate multiple processes, persist pending work, allocate nonces across replicas, or reconcile a process crash/unknown transaction result.
- **Payload capacity:** the SDK allows a `bytes` value up to 128 KiB, and all bytes values on an entity share that budget. Listing ciphertext, wrapped key and sealed seller data must fit together. See [SDK limits](https://docs.arkiv.network/reference/limits/) and the [SDK 1.0.1 bytes constructor](https://unpkg.com/@arkiv-network/sdk@1.0.1/src/schema/values.ts).
- **Hash columns:** indexed hex hashes are stored as `str` for queryability; string values are limited to 128 UTF-8 bytes. This representation does not make hashes confidential or prove their contents.
- **Expiry and deletion:** schema definitions do not set entity lifetime. Arkiv expiry/deletion is not secure erasure; ciphertext may survive in transaction history. Enforce release eligibility in the service as described in [architecture §2.2–2.3](../docs/architecture.md).
- **Receipt retention:** receipts also expire. `ExpirationTime.max()` is roughly 182 days from inclusion, not permanent storage. Earnings history and replay detection need an agreed retention/renewal policy and a bounded payment validity window.
- **Pagination:** `$key` ordering and continuation avoid offset shifts but do not create a snapshot. New keys below the continuation boundary can be missed; callers must bound scans and treat each page as a current-state observation. Strict schema mismatch handling prevents silently skipped rows from hiding continuation keys.
- **Mutable provenance:** listing consent needs mutable entities. Creator/owner checks depend on exclusive platform custody and a no-transfer policy; they cannot detect transfer-away/edit/transfer-back history. Receipts should be readonly at creation. Both entity kinds disable permissionless extension.
- **Payment lookup:** `paymentUsed` checks the two receipt kinds. It neither reserves a payment nor makes the release/write sequence atomic. Concurrency and restart protection belong to the coordinated paid flow, which is not implemented here.

The package pins SDK `1.0.1`, `viem` `2.57.16` and TypeScript `5.9.3`. Deterministic SDK fixtures exercise read behavior separately from funded integration evidence. On 6 November 2026, the public RPC chain-ID check returned Rabdi `7794095`; SDK queries for all four schemas scoped to the probe writer succeeded at blocks 300455–300456 and returned zero rows. These empty results establish query compatibility, not populated data decoding. No new writes, receipt waits, gas measurements, encryption round-trips or paid flows have been tested in this PR. Historical funded probe results remain in [the test findings](../docs/arkiv-test-findings-2026-11-06.md).

The final `createArkivReader` smoke check also passed against the public RPC: the historical deleted probe listing returned `null`, all four listing/receipt page methods returned empty pages, and an unused synthetic payment identifier returned `false`. Populated data, pagination, rejection paths and decoding were checked with SDK transport fixtures (`npm test`, eight tests total including the foundation tests); `npm run typecheck` passed. No signing key or access key was loaded for the live reads.

Sources: [SDK 1.0.1 expiration helpers](https://unpkg.com/@arkiv-network/sdk@1.0.1/src/utils/expirationTime.ts), [query builder](https://unpkg.com/@arkiv-network/sdk@1.0.1/src/query/queryBuilder.ts), and [the implementation gates](../docs/work-plan.md#6-arkiv-implementation-gates-skills-review-6-november-2026).

## Integrated app run (7 November 2026)

- The demo API published encrypted listings to Rabdi through the confirmed publisher. Example listing id `lst_eebc6757`, listing receipt tx `0x735f87614fbfff16006b9c04e546a647716322e2dca072cbfc0bf9932526146d` ([explorer](https://rabdi.explorer.arkiv.network/tx/0x735f87614fbfff16006b9c04e546a647716322e2dca072cbfc0bf9932526146d)).
- Listing records are v2: the full masked chat is gzipped inside the AES-GCM ciphertext. About 68 KiB for a 129k-character export, under the 128 KiB entity cap.
- The default `ARKIV_MAX_TX_COST_WEI` was raised to 0.02 GLM because larger entities need more than 1M gas.
- If the API is killed, a stale `publisher.lock` is left behind. An operator must remove it after confirming no writer is running.
