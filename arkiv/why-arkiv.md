# Why Arkiv

## If you swapped Arkiv for Postgres or any other database, what would your users lose?
- **Verifiable consent.** The consent flags and expiry sit on a public chain entity, changed only via transactions. A buyer or auditor can check `consent_sale` and the expiry themselves; with a private DB they must trust us. Example: [`lst_eebc6757`](https://rabdi.explorer.arkiv.network/tx/0x735f87614fbfff16006b9c04e546a647716322e2dca072cbfc0bf9932526146d).
- **Real expiry and revoke.** A listing disappears from queries at its block expiry or on delete ([lifecycle proof](../docs/arkiv-test-findings-2026-11-06.md): a 20 s entity stopped returning at block 298273). In a database, "deleted" is a promise.
- **A public earnings and audit trail.** Receipts (listing, consent, revoke, purchases, payouts) are readonly entities anyone can list. Seller earnings are derived from them ([`app-store.ts:107`](../packages/arkiv/src/app-store.ts)); we cannot quietly edit history.
- **No platform database to leak or lose.** There is no Postgres. If our API restarts or moves, state is rebuilt from the chain (the local journal only tracks in-flight writes).
- **Searchable without exposing content.** Buyers filter by public tags (`domain`, `region`, consent flags) while the chat stays encrypted.

## What did you keep off Arkiv, and why?
- **Plaintext chat.** Everything public on Arkiv is readable by anyone, so the chat is AES-GCM encrypted in the browser; only masked text is ever encrypted and stored.
- **Keys.** The record key is sealed to the service P-256 key inside the entity; the seller's control key stays in the browser; the writer private key stays in server env.
- **Payout account, contact consent, deadlines.** Sealed inside `sealed_seller`, not indexed.
- **Hedera payments.** Money moves on Hedera; Arkiv stores only the transaction id and HashScan link.
- **0G inference.** Done off-chain on masked text; only the coarse domain tag reaches Arkiv.
- **In-flight state.** Journal and settlement outbox live on the API's volume ([`journal.ts`](../packages/arkiv/src/journal.ts), [`settlement-outbox.ts`](../packages/arkiv/src/settlement-outbox.ts)) until the write is confirmed, then Arkiv is the source of truth.
- **Oversized exports.** Over the 128 KiB entity budget (120 KiB ciphertext cap) are rejected rather than moved elsewhere.

## Trade-off we accept
Public data cannot be unread: delete or expiry removes the entity from queries but not from chain history ([friction.md](friction.md)).
