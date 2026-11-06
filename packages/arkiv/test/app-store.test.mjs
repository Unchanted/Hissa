import assert from "node:assert/strict";
import test from "node:test";
import { createPublicClient } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { custom, numberToHex } from "viem";
import { ArkivReader } from "../src/reader.ts";
import { parseNewListing } from "../src/publisher.ts";
import { listingSchema } from "../src/schemas.ts";
import { makeArkivAppStore } from "../src/app-store.ts";
import { createServiceCrypto } from "../src/service-crypto.ts";
import { Hono } from "hono";
import { createAppListingRoutes } from "../../../apps/server/src/routes/app-listings.ts";

const serviceKey = `0x${"1".repeat(64)}`;
const service = createServiceCrypto(serviceKey);
const writer = "0x1111111111111111111111111111111111111111";
const sellerAccount = "0.0.123";
const hex = (bytes) => `0x${Buffer.from(bytes).toString("hex")}`;
const keyHex = (n) => numberToHex(BigInt(n), { size: 32 });
const canonical = (value) => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object"
  ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)])) : value;

async function browserSeal(publicKey, plaintext) {
  const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const recipient = await crypto.subtle.importKey("raw", Buffer.from(publicKey.slice(2), "hex"), { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = await crypto.subtle.deriveBits({ name: "ECDH", public: recipient }, pair.privateKey, 256);
  const seed = await crypto.subtle.importKey("raw", shared, "HKDF", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32), info: new TextEncoder().encode("hissa.sealed.v1") }, seed, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  return hex(Buffer.concat([Buffer.from(await crypto.subtle.exportKey("raw", pair.publicKey)), iv, Buffer.from(encrypted)]));
}

async function upload(recordOverride) {
  const control = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const controlPublic = hex(new Uint8Array(await crypto.subtle.exportKey("raw", control.publicKey)));
  const deadline = Date.now() + 600000;
  const record = { v: 1, listing_id: "lst_test", consent_deadline: deadline, source: "chatgpt", week: "202645",
    facets: { age_band: "18–24", mentions: [{ events: ["abandoned"] }] }, excerpts: ["Reviewed masked words [EMAIL]."], ...recordOverride };
  const recordKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, recordKey, Buffer.from(JSON.stringify(record)));
  const listing = {
    listing_id: "lst_test", domain: "beauty", region: "IN-west", source: "chatgpt", week: "202645", quality_tier: "silver",
    consent_insights: true, consent_sale: true, price: "100000000", envelope_format: "application/vnd.arkiv.encrypted.v1",
    ciphertext: hex(Buffer.concat([iv, Buffer.from(encrypted)])),
    wrapped_key: await browserSeal(service.publicKey, new Uint8Array(await crypto.subtle.exportKey("raw", recordKey))),
    sealed_seller: await browserSeal(service.publicKey, Buffer.from(JSON.stringify({
      ctl_public_key: controlPublic, control_version: 0, consent_contact: true, consent_deadline: deadline, payout_account: sellerAccount,
    }))), expires_in_seconds: 3600,
  };
  const sign = async (action, version, body) => hex(new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, control.privateKey,
    Buffer.from(JSON.stringify(["hissa.arkiv.v1", 7794095, service.publicKey.toLowerCase(), action, "lst_test", version, canonical(body)])))));
  return { listing, record, sign, request: { listing, signature: await sign("publish", 0, listing) } };
}

function fixture() {
  let sequence = 0;
  const entities = new Map();
  const calls = [];
  const raw = (schema, values, readonly, key) => ({ key, creator: writer, owner: writer, createdAt: "0x1", updatedAt: "0x1", expiresAt: "0xfffff", creationFlags: readonly ? 1 : 0,
    attributes: [{ name: "arkiv.schema", type: "str", value: schema.name }, ...Object.entries(schema.columns).map(([name, column]) => {
      const value = values[name]?.value ?? values[name];
      return { name, type: column.type, value: column.type === "u64" ? numberToHex(BigInt(value)) : value };
    })] });
  const client = createPublicClient({ chain: rabdi({ accessKey: "fixture" }), cacheTime: 0, transport: custom({ async request({ method, params = [] }) {
    if (method === "eth_blockNumber") return "0x64";
    if (method === "arkiv_getEntity") return entities.get(params[0]) ?? null;
    if (method === "arkiv_query") {
      const query = params[0];
      const schema = /arkiv.schema = str\('([^']+)'\)/.exec(query)?.[1];
      const cursor = /\$key > key\((0x[\da-f]+)\)/i.exec(query)?.[1];
      const predicates = [...query.matchAll(/(listing_id|payment_tx) = str\('([^']*)'\)/g)];
      const rows = [...entities.values()].filter((row) => row.attributes.some((a) => a.name === "arkiv.schema" && a.value === schema))
        .filter((row) => predicates.every(([, name, value]) => row.attributes.some((a) => a.name === name && a.value === value)))
        .filter((row) => !cursor || row.key > cursor).sort((a, b) => a.key.localeCompare(b.key));
      return { data: rows.slice(0, Number(BigInt(params[1].limit ?? "0x64"))), blockNumber: "0x64" };
    }
    throw new Error(`Unexpected fixture RPC: ${method}`);
  } }, { retryCount: 0 }) });
  const publisher = {
    client, writer, reader: new ArkivReader(client, writer), close: async () => {},
    async publishListing(input) {
      const parsed = parseNewListing(input);
      const key = keyHex(++sequence);
      entities.set(key, raw(listingSchema, parsed, false, key));
      calls.push("publish");
      return { entityKey: key, txHash: keyHex(sequence + 1000), expiresAt: 1048575n };
    },
    async createEntity(id, schema, values, options) {
      const key = keyHex(++sequence);
      entities.set(key, raw(schema, values, options.flags.readonly, key));
      calls.push(id);
      return { entityKey: key, txHash: keyHex(sequence + 1000), expiresAt: 1048575n };
    },
    async patchEntity(id, _schema, key, changes) {
      const row = entities.get(key);
      for (const [name, input] of Object.entries(changes)) row.attributes.find((a) => a.name === name).value = input?.value ?? input;
      calls.push(id);
      return { txHash: keyHex(++sequence + 1000) };
    },
    async deleteEntity(id, key) { entities.delete(key); calls.push(id); return { txHash: keyHex(++sequence + 1000) }; },
  };
  return { publisher, calls, entities, store: makeArkivAppStore(publisher, serviceKey, sellerAccount) };
}

test("browser-compatible encrypted upload, signed consent versions and revoke use actual storage state", async () => {
  const { store, calls, entities } = fixture();
  const input = await upload();
  await assert.rejects(store.publish({ ...input.request, listing: { ...input.listing, consent_sale: false } }));
  assert.equal(calls.length, 0);
  const published = await store.publish(input.request);
  assert.equal(published.entityKey, keyHex(1));
  assert.equal((await store.getListing("lst_test")).consentContact, true);
  assert.equal((await store.readRecord("lst_test")).excerpt, input.record.excerpts[0]);
  assert.equal(JSON.stringify([...entities.values()]).includes(input.record.excerpts[0]), false);
  const patch = { consentSale: false };
  const request = { patch, version: 0, signature: await input.sign("patch", 0, patch) };
  assert.equal((await store.mutate("lst_test", request, "patch")).version, 1);
  await assert.rejects(store.mutate("lst_test", request, "patch"));
  await assert.rejects(store.readRecord("lst_test"));
  const signature = await input.sign("revoke", 1, {});
  await store.mutate("lst_test", { version: 1, signature }, "revoke");
  assert.equal(await store.getListing("lst_test"), null);
});

test("earnings and pending payout reservations survive a store restart without duplicate debit", async () => {
  const { store, publisher } = fixture();
  const payment = { kind: "record_purchase", listing: "lst_test", txId: "0.0.1@123.000000001", hashscan: "https://hashscan.io/testnet/transaction/example", amountTinybars: "100000000", at: new Date().toISOString() };
  await store.recordPayment(payment);
  await store.recordPayment(payment);
  await assert.rejects(store.recordPayment({ ...payment, listing: "lst_other" }));
  const restarted = makeArkivAppStore(publisher, serviceKey, sellerAccount);
  assert.equal(await restarted.balance(sellerAccount), 80000000n);
  const held = await restarted.reservePayout("0.0.1@124.000000001", 80000000n);
  await assert.rejects(makeArkivAppStore(publisher, serviceKey, sellerAccount).reservePayout("new-attempt", 80000000n));
  const payout = { ...payment, kind: "payout", listing: undefined, txId: "0.0.1@125.000000001", amountTinybars: "80000000" };
  await restarted.completePayout(payout, held.intentKey);
  await restarted.completePayout(payout, held.intentKey);
  assert.equal(await restarted.balance(sellerAccount), 0n);
  const publicRows = (await restarted.publicReceipts()).items;
  assert.equal(publicRows.length, 2);
  assert.equal(JSON.stringify(publicRows).includes(sellerAccount), false);
  assert.equal(JSON.stringify(publicRows).includes("sealed_details"), false);
});

test("sealed envelopes reject wrong keys and modified bytes", async () => {
  const packed = await browserSeal(service.publicKey, Buffer.from("sealed words"));
  assert.equal(service.open(packed).toString(), "sealed words");
  assert.throws(() => createServiceCrypto(`0x${"2".repeat(64)}`).open(packed));
  assert.throws(() => service.open(`${packed.slice(0, -2)}${packed.endsWith("00") ? "01" : "00"}`));
});

test("the mounted app API publishes, browses and revokes with signed requests", async () => {
  const { store } = fixture();
  const input = await upload();
  const app = new Hono();
  app.route("/api/listings", createAppListingRoutes(store));
  const request = (method, body) => ({ method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const published = await app.request("/api/listings", request("POST", input.request));
  assert.equal(published.status, 201);
  assert.equal((await published.json()).entityKey, keyHex(1));
  const listed = await app.request("/api/listings?domain=beauty");
  const preview = (await listed.json()).items[0];
  assert.deepEqual(preview.signals, []);
  assert.equal(preview.excerpt, "");
  assert.equal("payoutAccount" in preview, false);
  assert.equal((await app.request("/api/listings?ciphertext=x")).status, 400);
  assert.equal((await app.request("/api/listings/lst_test", request("PATCH", { version: 0, patch: { consentSale: false }, signature: "0x00" }))).status, 409);
  const deleted = await app.request("/api/listings/lst_test", request("DELETE", { version: 0, signature: await input.sign("revoke", 0, {}) }));
  assert.equal(deleted.status, 200);
  assert.equal((await app.request("/api/listings/lst_test")).status, 404);
});

test("v2 records carry the whole masked chat gzipped; buyers and insights read all of it", async () => {
  const { gzipSync } = await import("node:zlib");
  const full = Array.from({ length: 400 }, (_, i) => `line ${i} masked [PERSON_1] talks about serums`).join("\n");
  const { store } = fixture();
  const input = await upload({ v: 2, excerpts: ["line 0 preview"], text_gzip: gzipSync(full).toString("base64") });
  await store.publish(input.request);
  assert.equal((await store.readRecord("lst_test")).excerpt, full);
  const cohort = await store.insightCohort({ domain: "beauty" });
  assert.equal(cohort.length, 1);
  assert.ok(cohort[0].excerpts[0].length <= 1300, "analysis input stays small");
  assert.match(cohort[0].excerpts[0], /line 0 masked/);
  assert.match(cohort[0].excerpts[0], /line 3\d\d masked/, "sample is spread across the whole chat");
});
