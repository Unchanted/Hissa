/**
 * Tests for the sealed 0G client. fetch is stubbed; nothing leaves the machine.
 *   node --import tsx --test packages/ai/test/*.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { CHAT_MODELS, ROUTER_URL, sealedJson, ZeroGError } from "../src/zerog.js";
import { FAKE_KEY, fail, ok, stubFetch, withEnv, type Call } from "./helpers.js";

function assertSealed(calls: Call[]): void {
  assert.ok(calls.length > 0, "expected at least one call");
  for (const c of calls) {
    assert.equal(c.url, `${ROUTER_URL}/chat/completions`);
    assert.equal(c.headers.get("x-0g-provider-trust-mode"), "private");
    assert.equal(c.headers.get("authorization"), `Bearer ${FAKE_KEY}`);
    assert.equal(c.body.verify_tee, true);
  }
}

const models = (calls: Call[]) => calls.map((c) => c.body.model as string);

test("sends the private trust header and verify_tee:true, and maps the receipt", async (t) => {
  withEnv(t, { ZG_API_KEY: FAKE_KEY });
  const calls = stubFetch(t, [ok({ hello: "world" })]);
  const { data, receipt } = await sealedJson("sys", "user text");
  assert.deepEqual(data, { hello: "world" });
  assertSealed(calls);
  assert.equal(calls[0]!.body.model, CHAT_MODELS[0]);
  assert.deepEqual(calls[0]!.body.response_format, { type: "json_object" });
  assert.deepEqual(calls[0]!.body.messages, [
    { role: "system", content: "sys" },
    { role: "user", content: "user text" },
  ]);
  assert.equal(receipt.request_id, "req-123");
  assert.equal(receipt.provider, "0xProvider");
  assert.equal(receipt.tee_verified, true);
  assert.equal(receipt.zg_res_key, "res-key-abc");
  assert.equal(receipt.cost_neuron, "4200");
  assert.equal(receipt.trust_mode, "private");
  assert.equal(receipt.model, "glm-5.3");
  assert.equal(typeof receipt.latency_ms, "number");
});

test("missing receipt fields become null, request_id falls back to the completion id", async (t) => {
  withEnv(t, { ZG_API_KEY: FAKE_KEY });
  stubFetch(t, [{ status: 200, body: { id: "chatcmpl-9", choices: [{ message: { content: "{}" } }] } }]);
  const { receipt } = await sealedJson("s", "u");
  assert.equal(receipt.request_id, "chatcmpl-9");
  assert.equal(receipt.provider, null);
  assert.equal(receipt.tee_verified, null);
  assert.equal(receipt.zg_res_key, null);
  assert.equal(receipt.cost_neuron, null);
});

test("extracts a JSON object wrapped in prose or a code fence", async (t) => {
  withEnv(t, { ZG_API_KEY: FAKE_KEY });
  stubFetch(t, [ok('Sure!\n```json\n{"a":1}\n```')]);
  const { data } = await sealedJson("s", "u");
  assert.deepEqual(data, { a: 1 });
});

test("503 no_provider_for_trust_mode on glm-5.3 moves to 0gm-1.0-35b-a3b, still private", async (t) => {
  withEnv(t, { ZG_API_KEY: FAKE_KEY });
  const calls = stubFetch(t, (c) => (c.body.model === "glm-5.3" ? fail(503, "no_provider_for_trust_mode") : ok({ ok: true }, {}, {})));
  const { data, receipt } = await sealedJson("s", "u");
  assert.deepEqual(data, { ok: true });
  assert.deepEqual(models(calls), ["glm-5.3", "0gm-1.0-35b-a3b"]);
  assertSealed(calls);
  assert.equal(receipt.trust_mode, "private");
});

test("503 on every private model throws no_provider_for_trust_mode, never downgrades", async (t) => {
  withEnv(t, { ZG_API_KEY: FAKE_KEY });
  const calls = stubFetch(t, [fail(503, "no_provider_for_trust_mode")]);
  await assert.rejects(sealedJson("s", "u"), (e: unknown) => {
    assert.ok(e instanceof ZeroGError);
    assert.equal(e.status, 503);
    assert.equal(e.code, "no_provider_for_trust_mode");
    return true;
  });
  assert.deepEqual(models(calls), [...CHAT_MODELS]);
  assertSealed(calls);
});

for (const [status, code] of [
  [400, undefined],
  [401, undefined],
  [402, undefined],
  [403, undefined],
] as const) {
  test(`${status} throws immediately without retry or model fallback`, async (t) => {
    withEnv(t, { ZG_API_KEY: FAKE_KEY, ZG_RETRY_WAIT_MS: "0" });
    const calls = stubFetch(t, [fail(status, code)]);
    await assert.rejects(sealedJson("s", "u"), (e: unknown) => e instanceof ZeroGError && e.status === status);
    assert.equal(calls.length, 1);
  });
}

test("401 and 402 have clear messages", async (t) => {
  withEnv(t, { ZG_API_KEY: FAKE_KEY });
  stubFetch(t, [fail(401)]);
  await assert.rejects(sealedJson("s", "u"), /API key missing or invalid/);
  t.mock.restoreAll();
  stubFetch(t, [fail(402)]);
  await assert.rejects(sealedJson("s", "u"), /balance is empty/);
});

test("429 waits and retries the same model, then succeeds", async (t) => {
  withEnv(t, { ZG_API_KEY: FAKE_KEY, ZG_RETRY_WAIT_MS: "0" });
  const calls = stubFetch(t, [fail(429, undefined, { "Retry-After": "7" }), ok({ ok: 1 })]);
  const { data } = await sealedJson("s", "u");
  assert.deepEqual(data, { ok: 1 });
  assert.deepEqual(models(calls), ["glm-5.3", "glm-5.3"]);
  assertSealed(calls);
});

test("429 carries Retry-After on the error", async (t) => {
  withEnv(t, { ZG_API_KEY: FAKE_KEY, ZG_RETRY_WAIT_MS: "0" });
  stubFetch(t, [fail(429, undefined, { "Retry-After": "3" })]);
  await assert.rejects(sealedJson("s", "u", { models: ["glm-5.3"] }), (e: unknown) => {
    assert.ok(e instanceof ZeroGError);
    assert.equal(e.status, 429);
    assert.equal(e.retryAfterMs, 3000);
    return true;
  });
});

test("429 forever: two attempts per model, then rejects with 429", async (t) => {
  withEnv(t, { ZG_API_KEY: FAKE_KEY, ZG_RETRY_WAIT_MS: "0" });
  const calls = stubFetch(t, [fail(429)]);
  await assert.rejects(sealedJson("s", "u"), (e: unknown) => e instanceof ZeroGError && e.status === 429);
  assert.deepEqual(models(calls), ["glm-5.3", "glm-5.3", "0gm-1.0-35b-a3b", "0gm-1.0-35b-a3b"]);
});

test("429 wait honours ZG_RETRY_WAIT_MS", async (t) => {
  withEnv(t, { ZG_API_KEY: FAKE_KEY, ZG_RETRY_WAIT_MS: "40" });
  stubFetch(t, [fail(429), ok({})]);
  const started = Date.now();
  await sealedJson("s", "u");
  assert.ok(Date.now() - started >= 35, "expected the configured wait");
});

test("502 provider error retries once, then moves to the next model", async (t) => {
  withEnv(t, { ZG_API_KEY: FAKE_KEY });
  const calls = stubFetch(t, (c) => (c.body.model === "glm-5.3" ? fail(502) : ok({ fine: true })));
  const { data } = await sealedJson("s", "u");
  assert.deepEqual(data, { fine: true });
  assert.deepEqual(models(calls), ["glm-5.3", "glm-5.3", "0gm-1.0-35b-a3b"]);
});

test("tee_verified:false is rejected", async (t) => {
  withEnv(t, { ZG_API_KEY: FAKE_KEY });
  const calls = stubFetch(t, [ok({ a: 1 }, { tee_verified: false })]);
  await assert.rejects(sealedJson("s", "u"), (e: unknown) => e instanceof ZeroGError && e.code === "tee_verification_failed");
  assert.equal(calls.length, 4);
  assertSealed(calls);
});

test("tee_verified:false on one response, true on the retry, returns the verified one", async (t) => {
  withEnv(t, { ZG_API_KEY: FAKE_KEY });
  stubFetch(t, [ok({ bad: 1 }, { tee_verified: false }), ok({ good: 1 })]);
  const { data, receipt } = await sealedJson("s", "u");
  assert.deepEqual(data, { good: 1 });
  assert.equal(receipt.tee_verified, true);
});

test("non-JSON model output retries, then fails with invalid_output", async (t) => {
  withEnv(t, { ZG_API_KEY: FAKE_KEY });
  const calls = stubFetch(t, [ok("I cannot answer in JSON, sorry.")]);
  await assert.rejects(sealedJson("s", "u"), (e: unknown) => e instanceof ZeroGError && e.code === "invalid_output");
  assert.equal(calls.length, 4);
});

test("non-JSON then JSON succeeds on the retry", async (t) => {
  withEnv(t, { ZG_API_KEY: FAKE_KEY });
  const calls = stubFetch(t, [ok("{not json"), ok({ x: 2 })]);
  const { data } = await sealedJson("s", "u");
  assert.deepEqual(data, { x: 2 });
  assert.equal(calls.length, 2);
});

test("non-JSON error body still yields a ZeroGError with the status", async (t) => {
  withEnv(t, { ZG_API_KEY: FAKE_KEY });
  stubFetch(t, [{ status: 401, raw: "<html>nope</html>" }]);
  await assert.rejects(sealedJson("s", "u"), (e: unknown) => e instanceof ZeroGError && e.status === 401);
});

test("network failure is wrapped as a ZeroGError", async (t) => {
  withEnv(t, { ZG_API_KEY: FAKE_KEY });
  t.mock.method(globalThis, "fetch", (async () => {
    throw new TypeError("fetch failed");
  }) as typeof fetch);
  await assert.rejects(sealedJson("s", "u"), (e: unknown) => e instanceof ZeroGError && e.code === "network");
});

test("missing ZG_API_KEY throws a clear error and makes no request", async (t) => {
  withEnv(t, { ZG_API_KEY: undefined });
  const calls = stubFetch(t, [ok({})]);
  await assert.rejects(sealedJson("s", "u"), (e: unknown) => {
    assert.ok(e instanceof ZeroGError);
    assert.equal(e.code, "missing_key");
    assert.equal(e.status, 401);
    assert.match(e.message, /ZG_API_KEY is not set/);
    return true;
  });
  assert.equal(calls.length, 0);
});

test("blank ZG_API_KEY counts as missing", async (t) => {
  withEnv(t, { ZG_API_KEY: "   " });
  const calls = stubFetch(t, [ok({})]);
  await assert.rejects(sealedJson("s", "u"), (e: unknown) => e instanceof ZeroGError && e.code === "missing_key");
  assert.equal(calls.length, 0);
});

test("an empty model list is rejected without a request", async (t) => {
  withEnv(t, { ZG_API_KEY: FAKE_KEY });
  const calls = stubFetch(t, [ok({})]);
  await assert.rejects(sealedJson("s", "u", { models: [] }), (e: unknown) => e instanceof ZeroGError && e.code === "no_models");
  assert.equal(calls.length, 0);
});
