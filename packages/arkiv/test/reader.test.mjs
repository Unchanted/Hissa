import assert from "node:assert/strict";
import test from "node:test";
import { createPublicClient } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { custom, numberToHex } from "viem";
import {
  ArkivReader, createArkivReader, listingSchema, saleSchema,
  insightReceiptSchema, payoutSchema,
} from "../src/index.ts";

const writer = "0x1111111111111111111111111111111111111111";
const stranger = "0x2222222222222222222222222222222222222222";
const entityKey = (n) => numberToHex(BigInt(n), { size: 32 });
const page = (data) => ({ data, blockNumber: "0x64" });

function entity(schema, n = 1, overrides = {}) {
  const values = { str: "example", u64: "0x7", dec: "0.2", key: entityKey(99), bool: false, bytes: "0x0102" };
  return {
    key: entityKey(n), owner: writer, creator: writer,
    createdAt: "0x1", updatedAt: "0x1", expiresAt: "0xc8",
    creationFlags: schema === listingSchema ? 0 : 1,
    attributes: [
      { name: "arkiv.schema", type: "str", value: schema.name },
      ...Object.entries(schema.columns).map(([name, column]) => ({
        name, type: column.type, value: values[column.type],
      })),
    ],
    ...overrides,
  };
}

function readerFixture(handler) {
  const calls = [];
  const client = createPublicClient({
    chain: rabdi({ accessKey: "fixture-only" }), cacheTime: 0,
    transport: custom({ request: async (request) => {
      calls.push(request);
      if (request.method === "eth_blockNumber") return "0x64";
      return handler(request);
    } }, { retryCount: 0 }),
  });
  return { reader: new ArkivReader(client, writer), calls };
}

test("full listing reads decode bytes and exact integers; absence differs from failure", async () => {
  const { reader } = readerFixture(() => entity(listingSchema));
  const listing = await reader.getListing(entityKey(1));
  assert.equal(listing.entityKey, entityKey(1));
  assert.equal(listing.price, 7n);
  assert.equal(listing.ciphertext, "0x0102");
  assert.equal(listing.consent_sale, false);
  assert.equal(await readerFixture(() => null).reader.getListing(entityKey(1)), null);
  assert.equal(await readerFixture(() => entity(listingSchema, 1, { expiresAt: "0x64" })).reader.getListing(entityKey(1)), null);

  const failed = readerFixture(() => { throw new Error("https://rpc.invalid/operator-secret"); });
  await assert.rejects(failed.reader.getListing(entityKey(1)), (error) => {
    assert.equal(error.message, "Arkiv read failed");
    assert.equal(error.cause, undefined);
    return true;
  });
});

test("listing reads reject wrong provenance, flags and schema", async () => {
  for (const overrides of [{ creator: stranger }, { owner: stranger }, { creationFlags: 1 }, { creationFlags: 2 }]) {
    await assert.rejects(readerFixture(() => entity(listingSchema, 1, overrides)).reader.getListing(entityKey(1)));
  }
  const malformed = entity(listingSchema);
  malformed.attributes = malformed.attributes.filter(({ name }) => name !== "price");
  await assert.rejects(readerFixture(() => malformed).reader.getListing(entityKey(1)));
  await assert.rejects(readerFixture(() => entity(listingSchema, 2)).reader.getListing(entityKey(1)));
});

test("listing pages use typed key continuation, trusted scope and narrow previews", async () => {
  let queries = 0;
  const { reader, calls } = readerFixture(({ method }) => {
    assert.equal(method, "arkiv_query");
    return page(++queries === 1
      ? Array.from({ length: 100 }, (_, n) => entity(listingSchema, n + 1))
      : [entity(listingSchema, 101)]);
  });
  const first = await reader.queryListings({ domain: "seller's domain", consent_sale: false, week: 7n });
  assert.equal(first.items.length, 100);
  assert.equal(first.next, entityKey(100));
  assert.equal(first.items[0].consent_sale, false);
  for (const field of ["ciphertext", "wrapped_key", "sealed_seller"]) {
    assert.equal(field in first.items[0], false);
    assert.equal(calls[0].params[1].select.attributes[field], undefined);
  }
  const second = await reader.queryListings({}, first.next);
  assert.equal(second.items[0].entityKey, entityKey(101));
  assert.equal(second.next, undefined);
  assert.match(calls[0].params[0], /seller''s domain/);
  assert.match(calls[0].params[0], /\$creator/);
  assert.match(calls[0].params[0], /\$owner/);
  assert.match(calls[0].params[0], /ORDER BY \$key:key ASC/i);
  assert.equal(calls[0].params[1].limit, "0x64");
  assert.match(calls[1].params[0], /\$key\s*>\s*key\(/);
  assert.ok(calls[1].params[0].includes(entityKey(100)));
});

test("invalid inputs are rejected before transport and broken pages fail closed", async () => {
  const { reader, calls } = readerFixture(() => page([]));
  for (const filter of [{ ciphertext: "x" }, { price: -1n }, { price: 4 }, { consent_sale: "false" }, { domain: "x".repeat(129) }, null]) {
    await assert.rejects(reader.queryListings(filter));
  }
  await assert.rejects(reader.queryListings({}, "not-a-key"));
  await assert.rejects(reader.listSales("not-a-key"));
  assert.equal(calls.length, 0);
  assert.throws(() => createArkivReader({ writer: "wrong", accessKey: "secret" }));

  for (const rows of [
    [entity(listingSchema, 2), entity(listingSchema, 1)],
    [entity(listingSchema, 1), entity(listingSchema, 1)],
    [entity(listingSchema, 2, { expiresAt: "0x64" })],
  ]) {
    await assert.rejects(readerFixture(() => page(rows)).reader.queryListings());
  }
  await assert.rejects(readerFixture(() => page([entity(listingSchema, 1)])).reader.queryListings({}, entityKey(1)));
  const missingPrice = entity(listingSchema);
  missingPrice.attributes = missingPrice.attributes.filter(({ name }) => name !== "price");
  await assert.rejects(readerFixture(() => page([missingPrice])).reader.queryListings());
});

test("receipt reads preserve sealed fields internally and validate immutable provenance", async () => {
  for (const [schema, method] of [[saleSchema, "listSales"], [insightReceiptSchema, "listInsightReceipts"], [payoutSchema, "listPayouts"]]) {
    const { reader } = readerFixture(() => page([entity(schema)]));
    const result = await reader[method]();
    assert.equal(result.items[0].entityKey, entityKey(1));
    assert.equal(result.items[0].expiresAt, 200n);
    if (schema === insightReceiptSchema) assert.equal(result.items[0].sealed_contributors, "0x0102");
    if (schema === payoutSchema) assert.equal(result.items[0].sealed_lines, "0x0102");
    await assert.rejects(readerFixture(() => page([entity(schema, 1, { creationFlags: 0 })])).reader[method]());
    await assert.rejects(readerFixture(() => page([entity(schema, 1, { owner: stranger })])).reader[method]());
  }
});

test("payment lookup checks both receipt kinds and rejects upstream errors", async () => {
  for (const match of [saleSchema, insightReceiptSchema, null]) {
    const { reader, calls } = readerFixture(({ params }) => {
      const schema = params[0].includes("dm.insight_receipt") ? insightReceiptSchema : saleSchema;
      const row = entity(schema);
      row.attributes.find(({ name }) => name === "payment_tx").value = "payment-1";
      return page(schema === match ? [row] : []);
    });
    assert.equal(await reader.paymentUsed("payment-1"), match !== null);
    assert.equal(calls.length, 2);
    for (const call of calls) {
      assert.match(call.params[0], /payment_tx/);
      assert.equal(call.params[1].select.creationFlags, true);
      assert.equal(call.params[1].select.expiresAt, true);
    }
  }
  await assert.rejects(readerFixture(() => { throw new Error("private RPC URL"); }).reader.paymentUsed("payment-1"));
});
