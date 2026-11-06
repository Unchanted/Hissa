# Arkiv friction and limits

This is the foundation slice; the notes below are known design constraints and evidence limits, not results from a live integration.

- **Public data:** Arkiv has no read access control. Indexed values, unindexed strings and `bytes` are public. The schema tag is a namespace, not authorization. Sealed blobs depend on the application's encryption and key custody.
- **Write ordering:** [`SerialQueue`](../packages/arkiv/src/serial-queue.ts) serializes tasks in one process and one queue instance. The service must share one queue for its writer wallet and await the transaction receipt inside each task. It does not coordinate multiple processes, persist pending work, allocate nonces across replicas, or reconcile a process crash/unknown transaction result.
- **Payload capacity:** the SDK allows a `bytes` value up to 128 KiB, and all bytes values on an entity share that budget. Listing ciphertext, wrapped key and sealed seller data must fit together. See [SDK limits](https://docs.arkiv.network/reference/limits/) and the [SDK 1.0.1 bytes constructor](https://unpkg.com/@arkiv-network/sdk@1.0.1/src/schema/values.ts).
- **Hash columns:** indexed hex hashes are stored as `str` for queryability; string values are limited to 128 UTF-8 bytes. This representation does not make hashes confidential or prove their contents.
- **Expiry and deletion:** schema definitions do not set entity lifetime. Arkiv expiry/deletion is not secure erasure; ciphertext may survive in transaction history. Enforce release eligibility in the service as described in [architecture §2.2–2.3](../docs/architecture.md).

The package pins SDK `1.0.1`, `viem` `2.57.16` and TypeScript `5.9.3`. This slice inspects the installed SDK schema API and tests schema metadata plus queue behavior locally. No live RPC reads, writes, receipt waits, gas or expiry behavior, encryption round-trips, or current-network compatibility were tested here.
