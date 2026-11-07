# Arkiv feedback: friction and asks

## What should we improve today to make Arkiv better: something that got in your way, or something we don't have yet that would make building easier?

SDK `@arkiv-network/sdk` 1.0.1, Rabdi testnet (chain 7794095). Longer earlier notes are in git history.

### Confirmed by the team

#### 1. No index or vector embedding for semantic search
- **Wanted:** a buyer types an idea ("people who gave up on a skincare routine") and gets similar listings back.
- **Missing:** Arkiv has no vector type and no similarity query. Attributes are exact-match or range only (`eq`, `gt`, ...).
- **Workaround:** coarse public tags (`domain`, `region`, `source`, `week`) on the entity, plus off-chain classification by 0G models that turns the idea into those tags ([`Agent.tsx:76`](../apps/web/src/views/Agent.tsx), [`reader.ts:114`](../packages/arkiv/src/reader.ts)). Finer matching happens after download, client side.
- **Ask:** a native vector attribute or ANN index, or at least a documented pattern for pairing Arkiv entities with an external index.

#### 2. No joins: receipts, listings and payouts need several round trips
- **Wanted:** "what did seller X earn?" as one query across receipts, listings and payout records.
- **Missing:** queries touch one schema and cannot follow a reference. A listing's seller data is inside its sealed blob, so even the lookup needs a second fetch.
- **Workaround:** client-side joins in [`app-store.ts`](../packages/arkiv/src/app-store.ts):
  - `receipts()` (line 83) pages every `dm.app_receipt.v1` row, up to 20 pages of 100.
  - `earnings()` (line 107) folds shares and payouts per payout account in memory.
  - `browse()` (line 197) runs one `dm.listing` query, then calls `listing()` (line 70) once per hit for an extra `queryListings` + `getListing`.
  - `reservePayout()` (line 261) adds a `dm.payout_intent.v1` query and compares it against receipts.
- **Ask:** follow a `key` reference inside a query, or batch-get by many keys in one call.

### Also hit while building

#### 3. 128 KiB per entity made us choose between the full chat and one entity
- **Wanted:** one listing = one seller's full masked chat, encrypted.
- **Happened:** all `bytes` on an entity share 128 KiB. A 129k-character WhatsApp export only fit after gzip inside the ciphertext (about 68 KiB); anything larger is refused in the browser before publishing ([`apps/web/src/arkiv.ts:158`](../apps/web/src/arkiv.ts)).
- **Ask:** a documented pattern for payloads over the limit (chunked entities that reference a parent, or a pointer to blob storage such as Swarm), so every app doesn't invent its own.

#### 4. No way to get the cost of a write before sending it
- **Wanted:** check "will this listing cost more than our cap?" before signing, because larger entities cost several times more gas than small ones.
- **Happened:** SDK 1.0.1 estimates gas inside `sendArkivTransaction` (with headroom) but exposes no estimate or dry-run call for entity writes. We wrote a custom viem transport that lets the SDK build the transaction, captures `eth_estimateGas`, and blocks signing ([`packages/arkiv/src/estimate.ts`](../packages/arkiv/src/estimate.ts)).
- **Ask:** `estimateCreateEntity()` / `estimateUpdateEntity()` (gas and cost), or a `prepare` step that returns an unsigned transaction.

#### 5. Encryption is left entirely to each app
- **Wanted:** private payloads with public tags (the normal case for user data).
- **Happened:** Arkiv has no read access control, which is fine, but there is no SDK helper either, so we wrote our own envelope encryption (AES-GCM payload, wrapped key, sealed seller field).
- **Ask:** a small, audited helper for "encrypted `bytes` + public attributes" in the SDK, with a recommended envelope format.

## When something broke, what did you expect, what happened, and how can we reproduce it?

- **Large listing failed to publish.** Expected: a 68 KiB listing publishes like a 5 KiB one. Happened: the write needed well over 1M gas, more than the cost cap we had picked from small test entities, so the publish was refused. The cap was ours, but we only found the real cost by failing (see item 4). Repro: publish an entity with ~60 KiB of `bytes`, compare its gas to a ~5 KiB entity (219,256 gas in our [test findings](../docs/arkiv-test-findings-2026-11-06.md)).
