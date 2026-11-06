# Arkiv foundation

Private ESM TypeScript package for the marketplace's Arkiv schemas, read-side `ArkivReader`, and single-process writer queue. It exports source TypeScript directly and uses Node 24's native TypeScript stripping in tests.

```sh
# From the repository root; Node 24 for the native TypeScript tests.
npm ci
npm --prefix packages/arkiv ci
npm --prefix packages/arkiv run typecheck
npm --prefix packages/arkiv test
```

`SerialQueue` only orders tasks inside one process and one shared queue instance. The publisher holds the queue through confirmation and readback; a file lock coordinates publisher instances using the same journal directory. The writer wallet must remain exclusive to this service, with one durable directory shared by all its instances. Separate machines or directories do not coordinate custody.

`createArkivReader({ accessKey, writer })` creates the Rabdi public client. The reader scopes reads to that configured creator and current owner, checks entity flags, returns at most 100 rows per keyset page, and omits listing blobs from browse previews. Its local exported types are provisional until `packages/shared` defines the shared contract.

## Publication and server handoff

`await createArkivPublisher({ privateKey, accessKey, journalDirectory, maxCostWei })` creates the publisher. Supply secrets from server-side configuration, a durable private directory such as `evidence/private/arkiv-writer`, and an explicit maximum transaction cost in tGLM base units. This cap is per operation; the mounting server must also enforce caller attempt limits and its overall spend policy. Call `await publisher.close()` on shutdown. Do not use ephemeral storage or delete a pending journal to retry.

The new route factories are in `apps/server/src/routes/listings.ts` and `receipts.ts`. They do not start a server, load environment variables, modify the web demo, or change the existing payment demo. From an entry point in `apps/server/src/`, the server owner mounts them as follows (supply the existing server's `authorizePublish` middleware):

```ts
import { createArkivPublisher } from '../../../packages/arkiv/src/index.ts';
import { createListingsRoutes } from './routes/listings.ts';
import { createReceiptsRoutes } from './routes/receipts.ts';

// Load .env on the server first. Validate these configuration values at startup.
const publisher = await createArkivPublisher({
  privateKey: process.env.ARKIV_WRITER_PRIVATE_KEY as `0x${string}`,
  accessKey: process.env.ARKIV_ACCESS_KEY!, // required nonempty for the publisher
  journalDirectory: 'evidence/private/arkiv-writer', // relative to the repository root
  maxCostWei: BigInt(process.env.ARKIV_MAX_TX_COST_WEI!), // explicit per-transaction cap
});
app.route('/api/listings', createListingsRoutes({ reader: publisher.reader, publisher, authorizePublish }));
app.route('/api/receipts', createReceiptsRoutes(publisher.reader));
// Drain active publication and release custody during the hosting server's shutdown:
// await publisher.close();
```

`authorizePublish` is required middleware from the hosting server: authenticate and authorize the uploader, enforce attempt limits, and check CSRF when using cookies. No browser-visible operator token or unauthenticated default is provided. Keep the publisher and its signing key out of browser bundles. The service also needs to bound public read traffic. A valid encrypted upload does not itself prove user authorization.

`POST /api/listings` accepts only `application/json` with the following shape:

```json
{
  "listing_id": "listing-unique-id",
  "domain": "technology",
  "region": "IN",
  "source": "chatgpt",
  "week": "202645",
  "quality_tier": "gold",
  "consent_insights": false,
  "consent_sale": true,
  "price": "200000000",
  "envelope_format": "application/vnd.arkiv.encrypted.v1",
  "ciphertext": "0x<encrypted record bytes>",
  "wrapped_key": "0x<record key sealed to service>",
  "sealed_seller": "0x<seller metadata sealed to service>",
  "expires_in_seconds": 86400
}
```

Replace the explanatory hex placeholders with actual hex bytes. Integers `week` and `price` use decimal strings; booleans stay booleans. Expiry uses a positive even number of seconds up to 182 days. The three blobs share Arkiv's 128 KiB budget. Unknown fields are rejected. A successful response is `{ entityKey, txHash, expiresAt }`, with `expiresAt` a decimal block-height string. Lane A creates and seals the payload and must enforce the private wall-clock consent deadline during release; this opaque storage endpoint cannot inspect that deadline.

`GET /api/listings` accepts public tag equality filters plus an optional key `cursor`. `GET /api/receipts?kind=sale|insight|payout&cursor=...` returns one receipt kind per page (default `sale`); retain independent cursors for each kind. Both return `{ items, next? }` with decimal strings for bigint values and `Cache-Control: no-store`. Public receipt responses omit sealed contributor/payout blobs. Internal reader methods retain those blobs for future earnings derivation.

Consent/revoke routes, receipt writes, paid release, sealing and the actual web API calls remain separate integration work. The demo's simulated publication must be replaced by lane A after this route is mounted with real authorization; importing this package alone does not connect the demo.

Integration checklist for the web owner:

1. Mount the routes above in the main server; replace the fixture handlers for those paths rather than registering both versions.
2. Replace Seller's simulated publication with real encryption/sealing and `POST /api/listings`. Keep the returned identifiers; only show success after HTTP 201. Reuse the same listing ID and identical payload when retrying; a changed payload with that ID returns 409. A 503 reconciliation response requires operator investigation, not a new listing ID to force a retry.
3. Use `GET /api/listings` for discovery and the three receipt kinds for the ledger. The response shape is a storage DTO, not the demo's synthetic receipt model; money and block heights are strings.
4. Keep controls for consent/revoke, paid delivery and payouts simulated/disabled until their backend implementations are wired. This publisher does not implement the full shared `ArkivStore` yet.

The existing root TypeScript config currently rejects the package's `.ts` import extensions (`TS5097`). The server owner should enable `allowImportingTsExtensions: true` with its existing `noEmit: true` when integrating; this PR leaves that shared config untouched. The package's focused typecheck includes both new route modules and passes with that setting.

Use one durable journal directory and one exclusive writer deployment. On a crash, confirm no writer process is still active before removing only a stale `publisher.lock`; retain `journal.json`. Any unresolved journal operation blocks reopening the publisher until the operator reconciles the original transaction. Never delete the journal or automatically resend to recover. Unattended reconciliation and multi-host custody are outside this slice.
