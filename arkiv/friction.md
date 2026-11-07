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

### Other friction (draft, awaiting team approval)

## When something broke, what did you expect, what happened, and how can we reproduce it?
Broken or surprising behaviour from the list below. Repros marked (code) come from reading the code and were not re-run:
- **Cost cap / gas estimate:** expected a listing publish to succeed; got a generic "Arkiv unavailable". Repro: publish tens of KiB with `ARKIV_MAX_TX_COST_WEI` low.
- **Stale lock:** expected a clean restart after a kill; the next start refused to open. Repro: `kill -9` the API, start it again.
- **Concurrent writers:** expected two processes on one wallet to coexist; got a nonce conflict. Repro (code): run two publishers on one key.
- **Missed rows mid-scan:** expected keyset paging to see every row; keys inserted below the cursor were missed. Repro (code): insert while paging.

Full list:

- **No read ACL.** All attributes and `bytes` are public; the schema tag is a namespace, not access control. We encrypt (AES-GCM) in the browser and keep only coarse tags public.
- **128 KiB per entity.** All `bytes` values share it. We gzip the full masked chat inside the ciphertext and cap ciphertext at 120 KiB ([`apps/web/src/arkiv.ts:158`](../apps/web/src/arkiv.ts)); a 129k-character export is about 68 KiB. Bigger exports must be split.
- **Gas estimate vs cost cap looked like "Arkiv unavailable".** Larger entities need over 1M gas; the estimate exceeded our `ARKIV_MAX_TX_COST_WEI` and the API reported a generic unavailable error. Repro: publish a listing of tens of KiB with a low cap. We raised the cap to 2e16 wei ([`.env.example`](../.env.example)). Ask: a typed error that includes estimated cost.
- **Stale `publisher.lock` after a kill.** `kill -9` on the API leaves the lock; the next start refuses to open until an operator removes it by hand ([`journal.ts`](../packages/arkiv/src/journal.ts)).
- **Single-writer nonce ordering.** Two writers on one wallet collide on nonces. We serialise through one process ([`serial-queue.ts`](../packages/arkiv/src/serial-queue.ts)) and journal every operation. Ask: nonce-safe multi-writer guidance or a built-in queue.
- **Expiry cap about 182 days.** `ExpirationTime.max()` is not permanent, so receipts and earnings history need a renewal plan ([`publisher.ts:40`](../packages/arkiv/src/publisher.ts)).
- **Pagination has no snapshot.** `$key` keyset paging avoids offset shifts, but keys inserted below the cursor are missed mid-scan.
- **Deleted or expired data is not erased.** Ciphertext stays in transaction history, so revoke cannot recall bytes already read.
- **Public RPC is heavily rate limited without an access key** (the SDK prints this warning). Fine for the judge query, tight for a live app.
- **Mutable provenance.** Creator/owner checks cannot detect transfer-away, edit, transfer-back. We rely on exclusive wallet custody.
- **No atomic check-then-write.** Payment-dedup lookup (`eq("payment_tx")`) and the receipt write are separate steps; we guard with the serial queue and a settlement outbox ([`settlement-outbox.ts`](../packages/arkiv/src/settlement-outbox.ts)).
