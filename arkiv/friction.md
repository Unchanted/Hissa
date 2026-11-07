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

#### 3. The safe-write recipe lives in a sample, not in the SDK
- **Wanted:** know a write's gas and cost before signing, and send it with limits that won't run out on a large entity.
- **Happened:** SDK 1.0.1 estimates gas inside `sendArkivTransaction` but exposes no estimate or prepare call. The working recipe (estimate at `latest`, gas = max(1M, 2 × estimate), stay under half the block gas limit, explicit nonce and gas price) is in the [`arkiv-encryption` README and sample wallet transport](https://github.com/SantiagoDevRel/arkiv-encrypted-entities), not in the SDK. We copied it into [`packages/arkiv/src/estimate.ts`](../packages/arkiv/src/estimate.ts) with a custom viem transport that captures `eth_estimateGas` and blocks signing.
- **Ask:** ship that recipe in the SDK: `estimateCreateEntity()` / `estimateUpdateEntity()` returning gas and cost, or a `prepare` step that returns an unsigned transaction.

#### 4. `arkiv-encryption` covers one key holder, not sharing
- **Wanted:** seller encrypts in the browser; only our release service can open it; it re-releases to a buyer after payment. Usual shape for any data marketplace.
- **Happened:** `arkiv-encryption` (AES-256-GCM, `application/vnd.arkiv.encrypted.v1`) encrypts with one symmetric key and has no way to wrap that key to a recipient's public key, and no associated data to bind a ciphertext to its listing. We kept its envelope format but wrote our own ECDH P-256 + HKDF key wrap (`sealTo` in [`apps/web/src/arkiv.ts`](../apps/web/src/arkiv.ts)) and put the listing id inside the encrypted record to bind it.
- **Ask:** `wrapKey(recipientPublicKey)` / `unwrapKey()` and optional AAD in `arkiv-encryption`.

## When something broke, what did you expect, what happened, and how can we reproduce it?

- **Large listing failed to publish.** Expected: a 68 KiB listing publishes like a 5 KiB one. Happened: the gas estimate was over 500k (our reserve of 2× estimate passed the 1M gas that our 0.001 GLM cap allows at 1 gwei), a cap we had picked from small test entities, so the publish was refused. The cap was ours, but we only found the real cost by failing (see item 3). Repro: publish an entity with ~60 KiB of `bytes`, compare its gas to a ~5 KiB entity (219,256 gas in our [test findings](../docs/arkiv-test-findings-2026-11-06.md)).
