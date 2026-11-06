import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSettlementOutbox } from "../src/settlement-outbox.ts";

test("settled payments survive restart until acknowledged and conflicts cannot replace them", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "hissa-settlements-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const first = await createSettlementOutbox(directory);
  const payment = { kind: "record_purchase", listing: "lst_test", txId: "0.0.1@1.000000001", amountTinybars: "100000000", at: new Date().toISOString(), hashscan: "https://hashscan.io/testnet/transaction/example" };
  await first.remember(payment);
  const restarted = await createSettlementOutbox(directory);
  assert.deepEqual(await restarted.pending(), [payment]);
  await assert.rejects(restarted.remember({ ...payment, amountTinybars: "2" }));
  assert.deepEqual(await restarted.remember({ ...payment, at: new Date().toISOString() }), payment);
  await restarted.acknowledge(payment.txId);
  assert.deepEqual(await restarted.pending(), []);
});
