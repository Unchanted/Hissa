// Read-only judge query: list live dm.listing entities written by the Hissa writer wallet on Arkiv Rabdi.
// Usage (Node >= 22.18, from the repo root):  npm --prefix packages/arkiv ci && node packages/arkiv/scripts/query-listings.mjs [domain]
// No key needed: reads go through the public RPC. Optional env: ARKIV_WRITER (override wallet).
import { createPublicClient } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { asc, eq } from "@arkiv-network/sdk/query";
import { bytes, defineSchema, str, u64 } from "@arkiv-network/sdk/schema";
import { http } from "viem";
import { listingSchema } from "../src/schemas.ts";

const WRITER = process.env.ARKIV_WRITER ?? "0x0F58223AAfF9C6e2534aaD09a996048175C04C96";
const domain = process.argv[2];
const client = createPublicClient({ chain: rabdi({ accessKey: "" }), transport: http() });

const base = client.select().from(listingSchema).createdBy(WRITER).ownedBy(WRITER);
if (domain) base.where(eq("domain", str(domain)));
const page = await base.orderBy(asc("$key")).limit(100).fetch();

console.log(`chain 7794095 (Rabdi), block ${page.blockNumber}, writer ${WRITER}${domain ? `, domain=${domain}` : ""}`);
for (const e of page.entities) {
  console.log(JSON.stringify({
    key: e.$key, listing_id: e.listing_id.value, domain: e.domain.value, region: e.region.value,
    consent_sale: e.consent_sale.value, consent_insights: e.consent_insights.value,
    price: e.price.value.toString(), expiresAtBlock: e.$expiresAt.toString(),
    ciphertextBytes: (e.ciphertext.value.length - 2) / 2, readonly: e.$creationFlags.readonly,
  }));
}
console.log(`${page.entities.length} listing(s)`);

// Receipts (same schema as src/app-store.ts): readonly, written by the same wallet. Count per kind.
const receiptSchema = defineSchema("dm.app_receipt.v1", {
  kind: str().indexed(), listing_id: str().indexed(), payment_tx: str().indexed(),
  amount: u64(), at: u64(), sealed_details: bytes(),
});
const receipts = await client.select({ $key: true, kind: true }).from(receiptSchema).createdBy(WRITER).ownedBy(WRITER).orderBy(asc("$key")).limit(100).fetch();
const counts = {};
for (const r of receipts.entities) counts[r.kind.value] = (counts[r.kind.value] ?? 0) + 1;
console.log(`dm.app_receipt.v1: ${receipts.entities.length} receipt(s)`, JSON.stringify(counts));
