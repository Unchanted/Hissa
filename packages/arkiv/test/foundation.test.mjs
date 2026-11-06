import assert from "node:assert/strict";
import test from "node:test";
import {
  insightReceiptSchema,
  listingSchema,
  payoutSchema,
  saleSchema,
  SerialQueue,
} from "../src/index.ts";

const metadata = (schema) => ({
  name: schema.name,
  columns: Object.fromEntries(
    Object.entries(schema.columns).map(([name, column]) => [name, [column.type, column.isIndexed]]),
  ),
});

test("exports the four named schemas with the planned column metadata", () => {
  assert.deepEqual(metadata(listingSchema), {
    name: "dm.listing",
    columns: {
      listing_id: ["str", true],
      domain: ["str", true],
      region: ["str", true],
      source: ["str", true],
      week: ["u64", true],
      quality_tier: ["str", true],
      consent_insights: ["bool", true],
      consent_sale: ["bool", true],
      price: ["u64", true],
      envelope_format: ["str", false],
      ciphertext: ["bytes", false],
      wrapped_key: ["bytes", false],
      sealed_seller: ["bytes", false],
    },
  });
  assert.deepEqual(metadata(saleSchema), {
    name: "dm.sale",
    columns: {
      listing: ["key", true],
      buyer_ref: ["str", true],
      payment_tx: ["str", true],
      price: ["u64", true],
    },
  });
  assert.deepEqual(metadata(insightReceiptSchema), {
    name: "dm.insight_receipt",
    columns: {
      spec_hash: ["str", true],
      analysis_id: ["str", true],
      domain: ["str", true],
      cohort_bucket: ["str", true],
      epsilon: ["dec", true],
      k_min: ["u64", true],
      payment_tx: ["str", true],
      contributors_root: ["str", true],
      sealed_contributors: ["bytes", false],
    },
  });
  assert.deepEqual(metadata(payoutSchema), {
    name: "dm.payout",
    columns: {
      batch_id: ["str", true],
      scheduled_tx: ["str", true],
      sealed_lines: ["bytes", false],
    },
  });
});

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => (resolve = done));
  return { promise, resolve };
};

test("serializes tasks and continues after a task rejects", async () => {
  const queue = new SerialQueue();
  const firstStarted = deferred();
  const releaseFirst = deferred();
  const order = [];

  const first = queue.run(async () => {
    order.push("first:start");
    firstStarted.resolve();
    await releaseFirst.promise;
    order.push("first:end");
    return "first-result";
  });
  await firstStarted.promise;

  const failure = new Error("transaction failed");
  const rejected = queue.run(async () => {
    order.push("second");
    throw failure;
  });
  const final = queue.run(async () => {
    order.push("third");
    return "third-result";
  });

  await Promise.resolve();
  assert.deepEqual(order, ["first:start"]);
  releaseFirst.resolve();

  assert.equal(await first, "first-result");
  await assert.rejects(rejected, (error) => error === failure);
  assert.equal(await final, "third-result");
  assert.deepEqual(order, ["first:start", "first:end", "second", "third"]);
});
