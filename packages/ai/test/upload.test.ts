/**
 * Tests for analyseUpload (classification only; masking happens on the seller's device).
 * fetch is stubbed with a canned model answer; synthetic text only.
 *   node --import tsx --test packages/ai/test/*.test.ts
 */
import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { analyseUpload } from "../src/upload.js";
import { ZeroGError } from "../src/zerog.js";
import { FAKE_KEY, ok, stubFetch, withEnv } from "./helpers.js";

const CHAT = `I'm [PERSON_1], [AGE 18–24]. The Minimalist serum was too expensive for zero results, so I switched to a ₹349 sunscreen.
Mail me at [EMAIL_1].`;

function modelSays(t: TestContext, answer: unknown) {
  withEnv(t, { ZG_API_KEY: FAKE_KEY });
  return stubFetch(t, [ok(answer)]);
}

test("returns facets and the 0G receipt, nothing else", async (t) => {
  modelSays(t, { facets: { domain_path: "beauty/skincare/serum", age_band: "18–24", mentions: [{ subject: "Minimalist serum", events: ["abandoned"], sentiment: -0.6, reasons: ["too expensive"], price_judgement: "too_expensive" }] } });
  const out = await analyseUpload(CHAT);
  assert.deepEqual(Object.keys(out).sort(), ["facets", "receipt"]);
  assert.equal(out.facets.domain_path, "beauty/skincare/serum");
  assert.equal(out.facets.age_band, "18-24");
  assert.equal(out.facets.mentions[0]!.price_judgement, "too_expensive");
  assert.equal(out.receipt.request_id, "req-123");
});

test("domain top level is checked against the shared list", async (t) => {
  modelSays(t, { facets: { domain_path: "Skincare/serum", mentions: [] } });
  assert.equal((await analyseUpload(CHAT)).facets.domain_path, "other/serum");
});

test("placeholders the model copies into facets are removed", async (t) => {
  modelSays(t, { facets: { domain_path: "beauty", mentions: [{ subject: "[PERSON_1]'s serum", reasons: ["[PERSON_2] said it works", "[PLACE_1]"] }] } });
  const m = (await analyseUpload(CHAT)).facets.mentions[0]!;
  assert.equal(m.subject, "'s serum");
  assert.deepEqual(m.reasons, ["said it works"]);
});

test("the prompt tells 0G the text is already masked and asks for facets only", async (t) => {
  const calls = modelSays(t, { facets: {} });
  await analyseUpload(CHAT);
  const sys: string = calls[0]!.body.messages[0].content;
  assert.match(sys, /already masked on their device/);
  assert.doesNotMatch(sys, /extra_identifiers/);
  assert.equal(calls[0]!.body.max_tokens, 1500);
});

test("clamps sentiment, filters events, validates enums and limits sizes", async (t) => {
  modelSays(t, {
    facets: {
      domain_path: "beauty/skincare",
      age_band: "18-24",
      budget_consciousness: "high",
      mentions: [
        { subject: "A", events: ["bought", "bought", "teleported", 3], sentiment: 5, reasons: ["r1", "r2", "r3", "r4", "r5", "r6", 7], price_judgement: "free" },
        { subject: "B", sentiment: -9 },
        { subject: "C", sentiment: "very" },
        { subject: 12 },
        { subject: "  " },
        ...Array.from({ length: 12 }, (_, i) => ({ subject: `S${i}`, sentiment: 0 })),
      ],
    },
  });
  const out = await analyseUpload(CHAT);
  const [a, b, c] = out.facets.mentions;
  assert.equal(a!.sentiment, 1);
  assert.deepEqual(a!.events, ["bought"]);
  assert.deepEqual(a!.reasons, ["r1", "r2", "r3", "r4", "r5"]);
  assert.equal(a!.price_judgement, undefined);
  assert.equal(b!.sentiment, -1);
  assert.deepEqual(b!.events, []);
  assert.equal(c!.sentiment, 0);
  assert.equal(out.facets.age_band, "18-24");
  assert.equal(out.facets.budget_consciousness, "high");
  // slice(0, 10) runs before invalid entries are dropped: A, B, C, 5 x S
  assert.equal(out.facets.mentions.length, 8);
  for (const m of out.facets.mentions) assert.ok(m.sentiment >= -1 && m.sentiment <= 1);
});

test("drops invalid age_band and budget_consciousness, defaults domain_path", async (t) => {
  modelSays(t, { facets: { domain_path: 7, age_band: "teen", budget_consciousness: "extreme" } });
  const out = await analyseUpload(CHAT);
  assert.deepEqual(out.facets, { domain_path: "other", mentions: [] });
});

test("rejects empty and whitespace-only input without calling 0G", async (t) => {
  const calls = modelSays(t, {});
  for (const input of ["", "   \n\t "]) {
    await assert.rejects(analyseUpload(input), (e: unknown) => e instanceof ZeroGError && e.code === "empty_input" && e.status === 400);
  }
  assert.equal(calls.length, 0);
});

test("rejects input over 60,000 characters without calling 0G; exactly 60,000 is allowed", async (t) => {
  const calls = modelSays(t, { facets: {} });
  await assert.rejects(analyseUpload("a".repeat(60_001)), (e: unknown) => e instanceof ZeroGError && e.code === "too_long" && e.status === 413);
  assert.equal(calls.length, 0);
  await analyseUpload("a".repeat(60_000));
  assert.equal(calls.length, 1);
});

test("the upload call itself is sealed", async (t) => {
  const calls = modelSays(t, { facets: {} });
  await analyseUpload(CHAT);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.headers.get("x-0g-provider-trust-mode"), "private");
  assert.equal(calls[0]!.body.verify_tee, true);
  assert.equal(calls[0]!.body.messages[1].content, CHAT);
});

