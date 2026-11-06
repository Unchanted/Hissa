/**
 * Tests for analyseUpload. fetch is stubbed with a canned model answer; synthetic text only.
 *   node --import tsx --test packages/ai/test/*.test.ts
 */
import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { analyseUpload } from "../src/upload.js";
import { ZeroGError } from "../src/zerog.js";
import { FAKE_KEY, ok, stubFetch, withEnv } from "./helpers.js";

const CHAT = `My friend Priya Raghavan said the Minimalist serum is too expensive. Priya also likes Plum.
I live near Koramangala 5th Block and work at Mehta & Sons Textiles. Dr. Kavita Rao said avoid acids.
Mail me at [EMAIL_1] or call [PHONE_1].`;

function modelSays(t: TestContext, answer: unknown) {
  withEnv(t, { ZG_API_KEY: FAKE_KEY });
  return stubFetch(t, [ok(answer)]);
}

test("keeps only identifiers that occur in the text, deduplicated, with valid types", async (t) => {
  modelSays(t, {
    extra_identifiers: [
      { text: "Priya Raghavan", type: "PERSON" },
      { text: "Priya Raghavan", type: "PERSON" }, // duplicate
      { text: " Koramangala 5th Block ", type: "PLACE" }, // trimmed
      { text: "Rahul Invented", type: "PERSON" }, // not in the text
      { text: "Mehta & Sons Textiles", type: "COMPANY" }, // unknown type -> OTHER
      { text: "X", type: "PERSON" }, // too short
      { text: 42, type: "PERSON" }, // not a string
      "garbage",
    ],
    facets: { domain_path: "beauty/skincare/serum", mentions: [] },
  });
  const out = await analyseUpload(CHAT);
  assert.deepEqual(out.extraIdentifiers, [
    { text: "Priya Raghavan", type: "PERSON" },
    { text: "Koramangala 5th Block", type: "PLACE" },
    { text: "Mehta & Sons Textiles", type: "OTHER" },
  ]);
  assert.equal(out.receipt.request_id, "req-123");
});

test("masks longest first with numbered placeholders per type", async (t) => {
  modelSays(t, {
    extra_identifiers: [
      { text: "Priya", type: "PERSON" },
      { text: "Priya Raghavan", type: "PERSON" },
      { text: "Dr. Kavita Rao", type: "PERSON" },
      { text: "Koramangala 5th Block", type: "PLACE" },
      { text: "Mehta & Sons Textiles", type: "ORG" },
    ],
    facets: {},
  });
  const out = await analyseUpload(CHAT);
  // Longest first: "Priya Raghavan" (14) and "Dr. Kavita Rao" (14) before "Priya" (5).
  assert.doesNotMatch(out.maskedText, /Priya|Raghavan|Kavita|Koramangala|Mehta/);
  assert.match(out.maskedText, /My friend \[PERSON_1\] said/);
  assert.match(out.maskedText, /\[PERSON_2\] said avoid acids/);
  assert.match(out.maskedText, /\[PERSON_3\] also likes Plum/);
  assert.match(out.maskedText, /near \[PLACE_1\] and work at \[ORG_1\]\./);
  assert.match(out.maskedText, /\[EMAIL_1\] or call \[PHONE_1\]/);
});

test("ignores placeholders and text that only occurs inside placeholders", async (t) => {
  modelSays(t, {
    extra_identifiers: [
      { text: "[EMAIL_1]", type: "OTHER" },
      { text: "[PHONE_1]", type: "OTHER" },
      { text: "EMAIL", type: "OTHER" }, // only inside [EMAIL_1]
      { text: "PHONE_1", type: "OTHER" },
      { text: "Priya", type: "PERSON" },
    ],
    facets: {},
  });
  const out = await analyseUpload(CHAT);
  assert.deepEqual(out.extraIdentifiers, [{ text: "Priya", type: "PERSON" }]);
  assert.match(out.maskedText, /\[EMAIL_1\] or call \[PHONE_1\]/);
});

test("a short identifier never corrupts existing or newly inserted placeholders", async (t) => {
  const text = "Ask OR about it, mail [EMAIL_1], Mehta & Sons can help. ORG chart soon.";
  modelSays(t, {
    extra_identifiers: [
      { text: "Mehta & Sons", type: "ORG" },
      { text: "OR", type: "OTHER" }, // matches inside "[ORG_1]" if masking were sequential
    ],
    facets: {},
  });
  const out = await analyseUpload(text);
  assert.equal(out.maskedText, "Ask [OTHER_1] about it, mail [EMAIL_1], [ORG_1] can help. [OTHER_1]G chart soon.");
  assert.doesNotMatch(out.maskedText, /\[[^\]]*\[/, "no nested brackets");
});

test("regex metacharacters in identifiers are matched literally", async (t) => {
  const text = "Saw Dr. K. (Rao) at A+B Clinic; Dr- KX Rao is someone else.";
  modelSays(t, {
    extra_identifiers: [
      { text: "Dr. K. (Rao)", type: "PERSON" },
      { text: "A+B Clinic", type: "ORG" },
    ],
    facets: {},
  });
  const out = await analyseUpload(text);
  assert.equal(out.maskedText, "Saw [PERSON_1] at [ORG_1]; Dr- KX Rao is someone else.");
});

test("scrubs identifiers copied into facets, longest first and case-insensitively", async (t) => {
  modelSays(t, {
    extra_identifiers: [
      { text: "Priya", type: "PERSON" }, // listed before the longer one on purpose
      { text: "Priya Raghavan", type: "PERSON" },
      { text: "Mehta & Sons Textiles", type: "ORG" },
    ],
    facets: {
      domain_path: "beauty/skincare/serum",
      mentions: [
        { subject: "Minimalist serum", events: ["considering"], sentiment: 0.2, reasons: ["Priya Raghavan said it works", "PRIYA likes it"], price_judgement: "too_expensive" },
        { subject: "Mehta & Sons Textiles", events: ["used"], sentiment: 0, reasons: [] },
        { subject: "fair", events: ["used"], sentiment: 0, reasons: ["price is fair"], price_judgement: "fair" },
      ],
    },
  });
  const out = await analyseUpload(CHAT);
  const json = JSON.stringify(out.facets);
  assert.doesNotMatch(json, /priya|raghavan|mehta/i);
  assert.deepEqual(out.facets.mentions[0]!.reasons, ["[REDACTED] said it works", "[REDACTED] likes it"]);
  assert.equal(out.facets.mentions[1]!.subject, "[REDACTED]");
  // Keys and enum values untouched.
  assert.equal(out.facets.domain_path, "beauty/skincare/serum");
  assert.equal(out.facets.mentions[0]!.price_judgement, "too_expensive");
  assert.equal(out.facets.mentions[2]!.price_judgement, "fair");
  assert.equal(out.facets.mentions[2]!.subject, "fair");
});

test("clamps sentiment, filters events, validates enums and limits sizes", async (t) => {
  modelSays(t, {
    extra_identifiers: [],
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
  assert.deepEqual(out.extraIdentifiers, []);
  assert.equal(out.maskedText, CHAT);
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
