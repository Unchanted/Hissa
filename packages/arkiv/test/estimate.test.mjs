import assert from "node:assert/strict";
import test from "node:test";
import { ExpirationTime } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { bytes, defineSchema } from "@arkiv-network/sdk/schema";
import { privateKeyToAccount } from "viem/accounts";
import { estimateWithRequest } from "../src/estimate.ts";

const schema = defineSchema("estimate.fixture", { body: bytes() });
const chain = rabdi({ accessKey: "fixture-only" });
const fixtureKey = `0x${"1".repeat(64)}`;
const prepare = (wallet) => wallet.createEntity(schema, { body: new Uint8Array([1]) }, {
  expiration: ExpirationTime.fromSeconds(60), salt: 1n,
}, { nonce: 0, gasPrice: 1n });

function rpcFixture(estimate = "0x30d40") {
  const calls = [];
  return { calls, async request(args) {
    calls.push(args);
    switch (args.method) {
      case "eth_chainId": return "0x76edaf";
      case "eth_blockNumber": return "0x64";
      case "eth_getBlockByNumber": return { gasLimit: "0x1c9c380" };
      case "eth_estimateGas": return estimate;
      default: throw new Error(`Unexpected method ${args.method}`);
    }
  } };
}

test("guarded estimator runs actual SDK encoding at latest and never signs", async () => {
  let signed = false;
  const account = { ...privateKeyToAccount(fixtureKey), signTransaction: async () => { signed = true; throw new Error(); } };
  const rpc = rpcFixture();
  assert.equal(await estimateWithRequest(account, chain, rpc, prepare), 200000n);
  assert.equal(signed, false);
  const request = rpc.calls.find(({ method }) => method === "eth_estimateGas");
  assert.equal(request.params[1], "latest");
  assert.equal(request.params[0].to.toLowerCase(), "0x4400000000000000000000000000000000000044");
  assert.equal(rpc.calls.some(({ method }) => method.startsWith("eth_send")), false);
});

test("guarded estimator blocks mutations, invalid caps and swallowed estimates", async () => {
  const account = privateKeyToAccount(fixtureKey);
  for (const prepareOperation of [
    () => Promise.resolve(),
    (wallet) => wallet.request({ method: "eth_sendRawTransaction", params: ["0x01"] }),
  ]) {
    const rpc = rpcFixture();
    await assert.rejects(estimateWithRequest(account, chain, rpc, prepareOperation), { message: "Unsigned preparation/estimate failed" });
    assert.equal(rpc.calls.some(({ method }) => method.startsWith("eth_send")), false);
  }
  await assert.rejects(estimateWithRequest(account, chain, rpcFixture("0x989680"), prepare), { message: "Unsigned preparation/estimate failed" });
  await assert.rejects(estimateWithRequest(account, chain, {
    async request() { throw new Error("https://rpc.invalid/operator-secret"); },
  }, prepare), (error) => error.message === "Unsigned preparation/estimate failed" && error.cause === undefined);
});
