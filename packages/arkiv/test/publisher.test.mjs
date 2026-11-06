import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ExpirationTime } from "@arkiv-network/sdk";
import { bytes, defineSchema, str, u64 } from "@arkiv-network/sdk/schema";
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
const eventAbi = parseAbi([
  "event EntityCreated(bytes32 indexed entityKey, address indexed owner, uint64 expiresAt, uint8 creationFlags)",
  "event EntityPatched(bytes32 indexed entityKey, address indexed owner)",
  "event EntityDeleted(bytes32 indexed entityKey, address indexed owner)",
]);
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
  const state = { sends: 0, raw: undefined, txHash: undefined, expected: undefined, records: new Map(), entities: new Map(), nextMutation: undefined };
  const expiresAt = 130n;
  const mutationFor = (rec) => rec.mutation ?? { eventName: "EntityCreated", key: entityKey, flags: 0, expiresAt };
  const log = (rec) => {
    const mutation = mutationFor(rec);
    const topics = encodeEventTopics({ abi: eventAbi, eventName: mutation.eventName, args: { entityKey: mutation.key, owner: account.address } });
    return {
      address: "0x4400000000000000000000000000000000000044", topics,
      data: mutation.eventName === "EntityCreated" ? encodeAbiParameters([{ type: "uint64" }, { type: "uint8" }], [mutation.expiresAt, mutation.flags]) : "0x",
      blockHash, blockNumber: hex(101), transactionHash: rec.txHash,
      transactionIndex: "0x0", logIndex: "0x0", removed: false,
    };
  };
  const receipt = (rec) => ({
    transactionHash: rec.txHash, transactionIndex: "0x0", blockHash, blockNumber: hex(101),
    from: account.address, to: "0x4400000000000000000000000000000000000044", cumulativeGasUsed: "0x1000",
    effectiveGasPrice: "0x2", gasUsed: "0x1000", contractAddress: null, logs: [log(rec)],
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
  const transaction = (rec) => {
    const parsed = parseTransaction(rec.raw);
    return {
      hash: rec.txHash, nonce: hex(parsed.nonce), blockHash, blockNumber: hex(101), transactionIndex: "0x0",
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
      case "eth_getTransactionCount": result = hex(state.sends); break;
      case "eth_gasPrice": result = "0x2"; break;
      case "eth_getBalance": result = "0x100000000000000000000"; break;
      case "eth_estimateGas": state.expected = params[0]; result = "0x30d40"; break;
      case "eth_sendRawTransaction": {
        state.sends++;
        state.raw = params[0];
        state.txHash = keccak256(state.raw);
        const mutation = state.nextMutation;
        const rec = { raw: state.raw, txHash: state.txHash, mutation };
        state.records.set(state.txHash.toLowerCase(), rec);
        if (mutation?.entity !== undefined) {
          if (mutation.entity === null) state.entities.delete(mutation.key.toLowerCase());
          else state.entities.set(mutation.key.toLowerCase(), mutation.entity);
        }
        if (failSend) throw new Error("https://rpc.invalid/operator-secret");
        result = state.txHash;
        break;
      }
      case "eth_getTransactionReceipt": result = state.records.get(String(params[0]).toLowerCase()) ? receipt(state.records.get(String(params[0]).toLowerCase())) : null; break;
      case "eth_getTransactionByHash": result = transaction(state.records.get(String(params[0]).toLowerCase())); break;
      case "arkiv_getEntity": result = state.entities.get(String(params[0]).toLowerCase()) ?? (String(params[0]).toLowerCase() === entityKey.toLowerCase() ? listingEntity() : null); break;
      default: throw new Error(`Unexpected fixture method: ${method}`);
    }
    return Response.json({ id: body.id, jsonrpc: "2.0", result });
  };
  return { state, fetch };
}

function config(journalDirectory, maxCostWei = 10_000_000n) {
  return { privateKey, accessKey: "fixture-only", journalDirectory, maxCostWei };
}

const genericSchema = defineSchema("dm.generic.fixture", { label: str(), count: u64(), blob: bytes() });
function genericEntity(key, values, flags = 0, expiresAt = 130n) {
  const rpcValue = (value) => typeof value === "bigint" ? hex(value) : value;
  return {
    key, owner: account.address, creator: account.address, createdAt: hex(101), updatedAt: hex(101),
    expiresAt: hex(expiresAt), creationFlags: flags,
    attributes: [
      { name: "arkiv.schema", type: "str", value: genericSchema.name },
      ...Object.entries(values).map(([name, value]) => ({ name, type: value.type, value: rpcValue(value.value) })),
    ],
  };
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

test("generic create, patch, and delete share the journal and verify SDK events plus readback", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "arkiv-publisher-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const fixture = rpcFixture();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fixture.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const publisher = await createArkivPublisher(config(directory));
  assert.equal(publisher.writer, account.address);
  assert.equal(publisher.client !== undefined, true);

  const values = { label: str("contact"), count: u64(7n), blob: bytes("0xaabb") };
  const key = `0x${"d".repeat(64)}`;
  fixture.state.nextMutation = {
    eventName: "EntityCreated", key, flags: 0, expiresAt: 130n,
    entity: genericEntity(key, values),
  };
  const created = await publisher.createEntity("receipt:create:1", genericSchema, values, {
    expiration: ExpirationTime.fromSeconds(60), flags: { readonly: false, permissionlessExtension: false },
  });
  assert.equal(created.entityKey, key);
  assert.equal(created.expiresAt, 130n);
  assert.deepEqual(await publisher.createEntity("receipt:create:1", genericSchema, values, {
    expiration: ExpirationTime.fromSeconds(60), flags: { readonly: false, permissionlessExtension: false },
  }), created);
  await assert.rejects(publisher.createEntity("receipt:create:1", genericSchema, { ...values, label: str("different") }, {
    expiration: ExpirationTime.fromSeconds(60), flags: { readonly: false, permissionlessExtension: false },
  }), (error) => error.kind === "conflict");

  const changes = { label: str("updated"), count: u64(8n) };
  fixture.state.nextMutation = {
    eventName: "EntityPatched", key, entity: genericEntity(key, { ...values, ...changes }),
  };
  const patched = await publisher.patchEntity("receipt:patch:1", genericSchema, key, changes);
  assert.equal(typeof patched.txHash, "string");

  fixture.state.nextMutation = { eventName: "EntityDeleted", key, entity: null };
  const deleted = await publisher.deleteEntity("receipt:delete:1", key);
  assert.equal(typeof deleted.txHash, "string");
  assert.equal(fixture.state.sends, 3);
  await publisher.close();
  const restarted = await createArkivPublisher(config(directory));
  assert.deepEqual(await restarted.patchEntity("receipt:patch:1", genericSchema, key, changes), patched);
  assert.equal(fixture.state.sends, 3);
  await restarted.close();
});

test("generic create verifies readonly creation flags and an empty Arkiv access key", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "arkiv-publisher-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const fixture = rpcFixture();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fixture.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const publisher = await createArkivPublisher({ ...config(directory), accessKey: "" });
  const key = `0x${"e".repeat(64)}`;
  const values = { label: str("receipt"), count: u64(3n), blob: bytes("0x01") };
  fixture.state.nextMutation = {
    eventName: "EntityCreated", key, flags: 1, expiresAt: 130n,
    entity: genericEntity(key, values, 1),
  };
  const result = await publisher.createEntity("receipt:readonly", genericSchema, values, {
    expiration: ExpirationTime.fromSeconds(60), flags: { readonly: true, permissionlessExtension: false },
  });
  assert.equal(result.entityKey, key);
  assert.equal(fixture.state.sends, 1);
  await publisher.close();
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
