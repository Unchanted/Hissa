import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { privateKeyToAccount } from "viem/accounts";
import {
  decodeEventLog, encodeAbiParameters, encodeEventTopics, keccak256, numberToHex, parseAbi, parseTransaction,
} from "viem";
import { createArkivPublisher, parseNewListing, PublicationError } from "../src/index.ts";

const privateKey = `0x${"1".repeat(64)}`;
const account = privateKeyToAccount(privateKey);
const entityKey = `0x${"b".repeat(64)}`;
const blockHash = `0x${"a".repeat(64)}`;
const genesisHash = `0x${"c".repeat(64)}`;
const eventAbi = parseAbi(["event EntityCreated(bytes32 indexed entityKey, address indexed owner, uint64 expiresAt, uint8 creationFlags)"]);
const input = Object.freeze({
  listing_id: "listing-1", domain: "support", region: "us", source: "chat", week: "2026",
  quality_tier: "high", consent_insights: true, consent_sale: false, price: "10",
  envelope_format: "application/vnd.arkiv.encrypted.v1", ciphertext: `0x${"11".repeat(28)}`,
  wrapped_key: "0x22", sealed_seller: "0x33", expires_in_seconds: 60,
});

const hex = (value) => numberToHex(BigInt(value));
const block = (number, hash) => ({
  number: hex(number), hash, parentHash: `0x${"00".repeat(32)}`, nonce: "0x0000000000000000",
  sha3Uncles: `0x${"00".repeat(32)}`, logsBloom: `0x${"00".repeat(256)}`,
  transactionsRoot: `0x${"00".repeat(32)}`, stateRoot: `0x${"00".repeat(32)}`,
  receiptsRoot: `0x${"00".repeat(32)}`, miner: `0x${"00".repeat(20)}`, difficulty: "0x0",
  totalDifficulty: "0x0", extraData: "0x", size: "0x0", gasLimit: "0x1c9c380", gasUsed: "0x0",
  timestamp: "0x69000000", transactions: [], uncles: [], baseFeePerGas: "0x1",
});

function rpcFixture({ failSend = false } = {}) {
  const state = { sends: 0, raw: undefined, txHash: undefined, expected: undefined };
  const eventTopics = encodeEventTopics({ abi: eventAbi, eventName: "EntityCreated", args: { entityKey, owner: account.address } });
  const expiresAt = 130n;
  const log = () => ({
    address: "0x4400000000000000000000000000000000000044",
    topics: eventTopics,
    data: encodeAbiParameters([{ type: "uint64" }, { type: "uint8" }], [expiresAt, 0]),
    blockHash, blockNumber: hex(101), transactionHash: state.txHash,
    transactionIndex: "0x0", logIndex: "0x0", removed: false,
  });
  const receipt = () => ({
    transactionHash: state.txHash, transactionIndex: "0x0", blockHash, blockNumber: hex(101),
    from: account.address, to: "0x4400000000000000000000000000000000000044", cumulativeGasUsed: "0x1000",
    effectiveGasPrice: "0x2", gasUsed: "0x1000", contractAddress: null, logs: [log()],
    logsBloom: `0x${"00".repeat(256)}`, status: "0x1", type: "0x0",
  });
  const listingEntity = () => ({
    key: entityKey, owner: account.address, creator: account.address, createdAt: hex(101), updatedAt: hex(101),
    expiresAt: hex(expiresAt), creationFlags: 0,
    attributes: [
      { name: "arkiv.schema", type: "str", value: "dm.listing" },
      { name: "listing_id", type: "str", value: input.listing_id },
      { name: "domain", type: "str", value: input.domain },
      { name: "region", type: "str", value: input.region },
      { name: "source", type: "str", value: input.source },
      { name: "week", type: "u64", value: hex(input.week) },
      { name: "quality_tier", type: "str", value: input.quality_tier },
      { name: "consent_insights", type: "bool", value: input.consent_insights },
      { name: "consent_sale", type: "bool", value: input.consent_sale },
      { name: "price", type: "u64", value: hex(input.price) },
      { name: "envelope_format", type: "str", value: input.envelope_format },
      { name: "ciphertext", type: "bytes", value: input.ciphertext },
      { name: "wrapped_key", type: "bytes", value: input.wrapped_key },
      { name: "sealed_seller", type: "bytes", value: input.sealed_seller },
    ],
  });
  const transaction = () => {
    const parsed = parseTransaction(state.raw);
    return {
      hash: state.txHash, nonce: hex(parsed.nonce), blockHash, blockNumber: hex(101), transactionIndex: "0x0",
      from: account.address, to: parsed.to, value: hex(parsed.value ?? 0n), gas: hex(parsed.gas),
      gasPrice: hex(parsed.gasPrice), input: parsed.data, type: "0x0", chainId: hex(7_794_095),
      v: hex(parsed.v ?? 0), r: parsed.r, s: parsed.s,
    };
  };
  const fetch = async (_url, request) => {
    const body = JSON.parse(request.body);
    const { method, params = [] } = body;
    let result;
    switch (method) {
      case "eth_chainId": result = "0x76edaf"; break;
      case "eth_blockNumber": result = "0x65"; break;
      case "eth_getBlockByNumber": {
        const tag = params[0];
        result = tag === "0x0" || tag === "earliest" ? block(0, genesisHash) : block(101, blockHash);
        break;
      }
      case "eth_getTransactionCount": result = "0x0"; break;
      case "eth_gasPrice": result = "0x2"; break;
      case "eth_getBalance": result = "0x100000000000000000000"; break;
      case "eth_estimateGas": state.expected = params[0]; result = "0x30d40"; break;
      case "eth_sendRawTransaction": {
        state.sends++;
        state.raw = params[0];
        state.txHash = keccak256(state.raw);
        if (failSend) throw new Error("https://rpc.invalid/operator-secret");
        result = state.txHash;
        break;
      }
      case "eth_getTransactionReceipt": result = state.txHash ? receipt() : null; break;
      case "eth_getTransactionByHash": result = transaction(); break;
      case "arkiv_getEntity": result = listingEntity(); break;
      default: throw new Error(`Unexpected fixture method: ${method}`);
    }
    return Response.json({ id: body.id, jsonrpc: "2.0", result });
  };
  return { state, fetch };
}

function config(journalDirectory, maxCostWei = 10_000_000n) {
  return { privateKey, accessKey: "fixture-only", journalDirectory, maxCostWei };
}

test("normalizes exact HTTP fields and rejects extra, malformed, or oversized values", () => {
  const normalized = parseNewListing(input);
  assert.equal(normalized.week, 2026n);
  assert.equal(normalized.price, 10n);
  assert.equal(Object.isFrozen(normalized), true);
  assert.throws(() => parseNewListing({ ...input, extra: true }), PublicationError);
  assert.throws(() => parseNewListing({ ...input, expires_in_seconds: 61 }), PublicationError);
  assert.throws(() => parseNewListing({ ...input, envelope_format: "text/plain" }), PublicationError);
  assert.throws(() => parseNewListing({ ...input, ciphertext: "0x11" }), PublicationError);
  assert.throws(() => parseNewListing({ ...input, week: "18446744073709551616" }), PublicationError);
});

test("publishes through the SDK once, verifies receipt and readback, then reuses the journal record", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "arkiv-publisher-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const fixture = rpcFixture();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fixture.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  const publisher = await createArkivPublisher(config(directory));
  const first = await publisher.publishListing(input);
  assert.equal(first.entityKey, entityKey);
  assert.equal(first.txHash, fixture.state.txHash);
  assert.equal(first.expiresAt, 130n);
  await publisher.close();

  const restarted = await createArkivPublisher(config(directory));
  const reused = await restarted.publishListing(input);
  assert.deepEqual(reused, first);
  assert.equal(fixture.state.sends, 1);
  await restarted.close();
});

test("lost send response retains the signed hash and blocks restart without rebroadcast", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "arkiv-publisher-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const fixture = rpcFixture({ failSend: true });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fixture.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  const publisher = await createArkivPublisher(config(directory));
  await assert.rejects(publisher.publishListing(input), (error) => {
    assert.equal(error.kind, "uncertain");
    assert.equal(error.cause, undefined);
    assert.equal(error.message.includes("operator-secret"), false);
    assert.equal(error.txHash, fixture.state.txHash);
    return true;
  });
  await publisher.close();
  await assert.rejects(createArkivPublisher(config(directory)), (error) => error.kind === "uncertain");
  assert.equal(fixture.state.sends, 1);
});
