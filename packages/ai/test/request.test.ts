/**
 * Tests for parseBuyerRequest. fetch is stubbed with a canned model answer; synthetic text only.
 *   node --import tsx --test packages/ai/test/*.test.ts
 */
import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { parseBuyerRequest } from "../src/request.js";
import { ZeroGError } from "../src/zerog.js";
import { FAKE_KEY, fail, ok, stubFetch, withEnv } from "./helpers.js";

const REQUEST = "18–24 year olds in India who gave up on skincare serums because of price";

function modelSays(t: TestContext, answer: unknown) {
  withEnv(t, { ZG_API_KEY: FAKE_KEY, ZG_RETRY_WAIT_MS: "0" });
  return stubFetch(t, [ok(answer)]);
}

test("returns validated filters and the 0G receipt", async (t) => {
  const calls = modelSays(t, { domain: "beauty", age: "18-24", region: "IN", event: "abandoned" });
  const out = await parseBuyerRequest(REQUEST);
  assert.deepEqual(out.filters, { domain: "beauty", age: "18-24", region: "IN", event: "abandoned" });
  assert.equal(out.receipt.request_id, "req-123");
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.headers.get("X-0G-Provider-Trust-Mode"), "private");
  assert.equal(calls[0]!.body.max_tokens, 300);
  assert.equal(calls[0]!.body.messages[1].content, REQUEST);
});

test("accepts an en dash in the age band", async (t) => {
  modelSays(t, { domain: "beauty", age: "18–24" });
  assert.deepEqual((await parseBuyerRequest(REQUEST)).filters, { domain: "beauty", age: "18-24" });
});

test("drops values outside the fixed lists; unknown domain becomes other", async (t) => {
  modelSays(t, { domain: "skincare", age: "teens", region: "Mumbai", event: "hated", extra: "x" });
  assert.deepEqual((await parseBuyerRequest(REQUEST)).filters, { domain: "other" });
});

test("rejects empty and over-long requests before calling 0G", async (t) => {
  const calls = modelSays(t, { domain: "beauty" });
  await assert.rejects(parseBuyerRequest("   "), (e: ZeroGError) => e.code === "empty_input" && e.status === 400);
  await assert.rejects(parseBuyerRequest("x".repeat(501)), (e: ZeroGError) => e.code === "too_long" && e.status === 413);
  assert.equal(calls.length, 0);
});

test("passes on a clean 0G error", async (t) => {
  withEnv(t, { ZG_API_KEY: FAKE_KEY });
  stubFetch(t, [fail(402)]);
  await assert.rejects(parseBuyerRequest(REQUEST), (e: ZeroGError) => e.status === 402 && /balance/.test(e.message));
});

test("insights mode also returns one measurable question", async (t) => {
  const calls = modelSays(t, { domain: "Beauty", age: "18-24", question: "Why do 18-24 year olds stop using serums, and is price the main reason?" });
  const out = await parseBuyerRequest("Young Indians drop serums over price; would a ₹299 trial size sell?", "insights");
  assert.equal(out.filters.domain, "beauty");
  assert.match(out.question!, /price the main reason/);
  assert.match(calls[0]!.body.messages[0].content, /"question"/);
});

test("insights mode falls back to the buyer's own words when no question comes back", async (t) => {
  modelSays(t, { domain: "beauty" });
  const out = await parseBuyerRequest("Do students quit serums because of price?", "insights");
  assert.equal(out.question, "Do students quit serums because of price?");
});

test("records mode returns no question", async (t) => {
  const calls = modelSays(t, { domain: "beauty", question: "x" });
  assert.equal((await parseBuyerRequest(REQUEST)).question, undefined);
  assert.doesNotMatch(calls[0]!.body.messages[0].content, /"question"/);
});
