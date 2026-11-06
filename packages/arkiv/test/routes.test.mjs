import assert from "node:assert/strict";
import test from "node:test";
import { Hono } from "hono";
import { createListingsRoutes } from "../../../apps/server/src/routes/listings.ts";
import { createReceiptsRoutes } from "../../../apps/server/src/routes/receipts.ts";
import { parseNewListing, PublicationError } from "../src/index.ts";

const key = `0x${"1".repeat(64)}`;
const tx = `0x${"2".repeat(64)}`;
const submitted = {
  listing_id: "listing-1", domain: "technology", region: "IN", source: "chatgpt",
  week: "202645", quality_tier: "gold", consent_insights: false, consent_sale: true,
  price: "200000000", envelope_format: "application/vnd.arkiv.encrypted.v1",
  ciphertext: `0x${"ab".repeat(40)}`, wrapped_key: "0xabcd", sealed_seller: "0xabcd",
  expires_in_seconds: 86400,
};
const preview = {
  ...submitted, price: 200000000n, week: 202645n, entityKey: key, expiresAt: 300000n,
};

function listingApp() {
  const calls = [];
  const reader = { async queryListings(filter, cursor) {
    calls.push({ filter, cursor });
    return { items: [preview], next: key };
  } };
  const publisher = { async publishListing(input) {
    const parsed = parseNewListing(input);
    calls.push({ published: parsed });
    return { entityKey: key, txHash: tx, expiresAt: 300000n };
  } };
  const authorizePublish = async (c, next) => {
    if (c.req.header("Authorization") !== "Bearer fixture-only") return c.json({ error: "unauthorized" }, 401);
    await next();
  };
  const app = new Hono();
  app.route("/api/listings", createListingsRoutes({ reader, publisher, authorizePublish }));
  return { app, calls, reader, publisher };
}

const post = (body, headers = {}) => ({
  method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer fixture-only", ...headers },
  body: typeof body === "string" ? body : JSON.stringify(body),
});

test("publication route requires authorization and returns confirmed identifiers", async () => {
  const { app, calls, reader, publisher } = listingApp();
  assert.throws(() => createListingsRoutes({ reader, publisher }));
  const denied = await app.request("/api/listings", post(submitted, { Authorization: "" }));
  assert.equal(denied.status, 401);
  assert.equal(calls.length, 0);
  const response = await app.request("/api/listings", post(submitted));
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { entityKey: key, txHash: tx, expiresAt: "300000" });
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(calls[0].published.price, 200000000n);
});

test("publication route rejects bad, oversized and unexpected payloads before submission", async () => {
  const { app, calls } = listingApp();
  const cases = [
    [post("{"), 400],
    [post(submitted, { "Content-Type": "text/plain" }), 415],
    [post({ ...submitted, price: 1.25 }), 400],
    [post({ ...submitted, payout_account: "public-identity" }), 400],
    [post({ ...submitted, ciphertext: "x".repeat(280000) }), 413],
  ];
  for (const [request, status] of cases) assert.equal((await app.request("/api/listings", request)).status, status);
  assert.equal(calls.length, 0);
});

test("browse route parses scalar filters, excludes blobs and preserves exact money", async () => {
  const { app, calls } = listingApp();
  const response = await app.request(`/api/listings?price=200000000&consent_insights=false&cursor=${key}`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.items[0].price, "200000000");
  assert.equal(body.items[0].consent_insights, false);
  assert.equal(body.next, key);
  for (const name of ["ciphertext", "wrapped_key", "sealed_seller", "expires_in_seconds"]) assert.equal(name in body.items[0], false);
  assert.deepEqual(calls[0], { filter: { price: 200000000n, consent_insights: false }, cursor: key });
  for (const query of ["price=-1", "week=18446744073709551616", "consent_sale=0", "domain=a&domain=b", "ciphertext=x", "cursor=x"]) {
    assert.equal((await app.request(`/api/listings?${query}`)).status, 400);
  }
  assert.equal(calls.length, 1);
});

test("receipt routes expose public fields only, with independent kind cursors", async () => {
  const calls = [];
  const common = { entityKey: key, expiresAt: 300000n, sealed_contributors: "private", sealed_lines: "private" };
  const page = (kind) => async (cursor) => {
    calls.push({ kind, cursor });
    return { items: [{ ...common, listing: key, buyer_ref: "buyer-hash", payment_tx: "payment-1", price: 2n,
      spec_hash: "spec", analysis_id: "analysis", domain: "tech", cohort_bucket: "50–99", epsilon: "0.2", k_min: 50n,
      contributors_root: "root", batch_id: "batch", scheduled_tx: "scheduled" }], next: key };
  };
  const app = new Hono();
  app.route("/api/receipts", createReceiptsRoutes({
    listSales: page("sale"), listInsightReceipts: page("insight"), listPayouts: page("payout"),
  }));
  for (const kind of ["sale", "insight", "payout"]) {
    const response = await app.request(`/api/receipts?kind=${kind}&cursor=${key}`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.items[0].kind, kind);
    assert.equal(body.items[0].expiresAt, "300000");
    assert.equal(body.next, key);
    for (const field of ["sealed_lines", "sealed_contributors"]) assert.equal(field in body.items[0], false);
  }
  assert.deepEqual(calls.map(({ kind }) => kind), ["sale", "insight", "payout"]);
  for (const query of ["kind=unknown", "kind=sale&kind=payout", "cursor=x", "anything=x"]) {
    assert.equal((await app.request(`/api/receipts?${query}`)).status, 400);
  }
  assert.equal(calls.length, 3);
});

test("upstream failures are sanitized and never become successful empty pages", async () => {
  const failing = async () => { throw new Error("https://rpc.invalid/operator-secret"); };
  const app = new Hono();
  app.route("/api/listings", createListingsRoutes({
    reader: { queryListings: failing }, publisher: { publishListing: failing },
    authorizePublish: async (_, next) => { await next(); },
  }));
  app.route("/api/receipts", createReceiptsRoutes({ listSales: failing, listInsightReceipts: failing, listPayouts: failing }));
  for (const url of ["/api/listings", "/api/receipts"]) {
    const response = await app.request(url);
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), { error: "arkiv_unavailable" });
  }
  assert.equal((await app.request("/api/listings", post(submitted))).status, 503);
});

test("publication conflicts and uncertain outcomes remain distinct without leaking diagnostics", async () => {
  for (const [kind, status, error] of [
    ["conflict", 409, "listing_conflict"],
    ["uncertain", 503, "publication_needs_reconciliation"],
  ]) {
    const app = createListingsRoutes({
      reader: { queryListings: async () => ({ items: [] }) },
      publisher: { publishListing: async () => { throw new PublicationError(kind, tx); } },
      authorizePublish: async (_, next) => { await next(); },
    });
    const response = await app.request("/", post(submitted));
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), { error });
  }
});
