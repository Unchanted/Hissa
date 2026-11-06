/**
 * On-device masking logic (apps/web/src/ner.ts) with canned model tokens; no model download.
 *   node --import tsx --test apps/web/test/ner.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyMask, chunkText, entitiesIn, maskExtraNames, parseExtraWords, partsOf, ruleMatches, type NerToken } from "../src/ner.js";

const tok = (index: number, word: string, entity: string, score = 0.99): NerToken => ({ index, word, entity, score });

test("groups word pieces into whole names without offsets", () => {
  const chunk = "My dermatologist Dr. Kavya Iyer said wait. Ananya disagrees.";
  const tokens = [
    tok(5, "Ka", "B-PER"), tok(6, "##vya", "B-PER"), tok(7, "I", "I-PER"), tok(8, "##yer", "I-PER"),
    tok(12, "An", "B-PER"), tok(13, "##any", "I-PER"), tok(14, "##a", "I-PER"),
  ];
  assert.deepEqual(entitiesIn(chunk, tokens), [
    { orig: "Kavya Iyer", kind: "PERSON" },
    { orig: "Ananya", kind: "PERSON" },
  ]);
});

test("uses offsets when present, keeps ORG and MISC, drops low scores", () => {
  const chunk = "Priya from Andheri West bought The Ordinary on Nykaa.";
  const tokens: NerToken[] = [
    { ...tok(1, "Priya", "B-PER"), start: 0, end: 5 },
    { ...tok(3, "And", "B-LOC"), start: 11, end: 14 },
    { ...tok(4, "##heri", "B-LOC"), start: 14, end: 18 },
    { ...tok(5, "West", "I-LOC"), start: 19, end: 23 },
    tok(7, "The", "B-ORG"), tok(8, "Ordinary", "I-ORG"), tok(10, "N", "B-ORG"),
    tok(12, "Maybe", "B-PER", 0.3),
  ];
  assert.deepEqual(entitiesIn(chunk, tokens), [
    { orig: "Priya", kind: "PERSON" },
    { orig: "Andheri West", kind: "PLACE" },
  ]);
});

test("a B- tag starts a new entity even when adjacent", () => {
  assert.deepEqual(entitiesIn("Priya Ananya", [tok(1, "Priya", "B-PER"), tok(2, "Ananya", "B-PER")]).map((e) => e.orig), ["Priya", "Ananya"]);
});

test("masks longest first, numbers after existing placeholders, never inside words", () => {
  const text = "I'm Priya Sharma ([EMAIL_1]). Priya likes Priyanka's serum. Ask [PERSON_1].";
  const out = applyMask(text, [
    { orig: "Priya", kind: "PERSON" },
    { orig: "Priya Sharma", kind: "PERSON" },
  ]);
  assert.equal(out.masked, "I'm [PERSON_2] ([EMAIL_1]). [PERSON_3] likes Priyanka's serum. Ask [PERSON_1].");
  assert.deepEqual(out.spans.map((s) => [s.orig, s.ph]), [["Priya Sharma", "[PERSON_2]"], ["Priya", "[PERSON_3]"]]);
});

test("rules catch email, phone and order IDs but not prices", () => {
  const found = ruleMatches("Order NYK-88231907, mail priya.s2003@gmail.com or +91 98201 44731. It was ₹599.");
  assert.deepEqual(found.map((f) => f.kind).sort(), ["EMAIL", "ID", "PHONE"]);
  assert.ok(found.some((f) => f.orig === "+91 98201 44731"));
});

test("chunks long lines under the limit at sentence boundaries", () => {
  const line = Array.from({ length: 20 }, (_, i) => `Sentence number ${i} is here.`).join(" ");
  const chunks = chunkText(`${line}\n\nshort`, 100);
  assert.ok(chunks.every((c) => c.length <= 100));
  assert.equal(chunks.at(-1), "short");
  assert.equal(chunks.join(" ").replace(/ short$/, ""), line);
});

test("splits a line into text and spans for the animation", () => {
  const spans = applyMask("Hi Priya", [{ orig: "Priya", kind: "PERSON" }]).spans;
  assert.deepEqual(partsOf("Hi Priya, Priyanka!", spans), ["Hi ", spans[0], ", Priyanka!"]);
});

test("extra names: whole-word, case-insensitive, numbered after existing PERSON", () => {
  const r = maskExtraNames("[PERSON_1] met swapnil and Swapnil. anand said hi to Anandita [EMAIL_1]", ["swapnil", "Anand"]);
  assert.equal(r.masked, "[PERSON_1] met [PERSON_2] and [PERSON_2]. [PERSON_3] said hi to Anandita [EMAIL_1]");
  assert.deepEqual(r.spans.map((s) => [s.orig, s.ph]), [["swapnil", "[PERSON_2]"], ["Swapnil", "[PERSON_2]"], ["anand", "[PERSON_3]"]]);
});

test("extra names: never touches placeholders, ignores empty input", () => {
  assert.equal(maskExtraNames("call [PERSON_1] [ID_2]", ["person", "id"]).masked, "call [PERSON_1] [ID_2]");
  assert.deepEqual(maskExtraNames("hello", [" , "]), { masked: "hello", spans: [] });
  assert.deepEqual(parseExtraWords("a, Anand ,anand,, swapnil"), ["Anand", "swapnil"]);
});
