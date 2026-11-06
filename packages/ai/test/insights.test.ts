/**
 * runInsight with a stubbed 0G Router (globalThis.fetch). Synthetic data only.
 *   node --import tsx --test packages/ai/test/insights.test.ts
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

process.env["ZG_API_KEY"] = "sk-test";
process.env["ZG_RETRY_WAIT_MS"] = "0";
const { runInsight } = await import("../src/insights.js");
const { ABANDONMENT_COHORT, smallAbandonmentCohort, ABANDONMENT_QUESTION } = await import("../src/synthetic-cohort.js");
type Item = { user_ref: string; excerpts: string[] };

const realFetch = globalThis.fetch;
let calls: { stage: string; user: string }[] = [];
/** Theme grouping the stub returns; tests can override. */
let groupThemes: (labels: string[]) => { name: string; labels: string[] }[];

function keywordLabel(text: string): string {
  if (/expensive|price|pricey|cost|afford|overpriced|too much|pocket money/.test(text)) return "too expensive";
  if (/cheaper|dupe|budget alternative|less|third of the cost/.test(text)) return "found cheaper alternative";
  if (/result|difference|change|nothing|improvement|didn't do|same|glow|fade/.test(text)) return "no visible results";
  if (/irritat|broke out|breakout|stung|bumps|burned|redness|itchy/.test(text)) return "irritation or breakouts";
  if (/sticky|smell|greasy/.test(text)) return "texture or smell";
  if (/pump|jar/.test(text)) return "packaging";
  if (/stock/.test(text)) return "availability";
  return "not relevant";
}

function defaultGroups(labels: string[]) {
  const price: string[] = labels.filter((l) => l === "too expensive" || l === "found cheaper alternative");
  const rest = labels.filter((l) => !price.includes(l));
  return [{ name: "price", labels: price }, ...rest.map((l) => ({ name: l, labels: [l] }))];
}

function reply(obj: unknown, n: number) {
  return new Response(
    JSON.stringify({
      model: "glm-5.3",
      choices: [{ message: { content: JSON.stringify(obj) } }],
      x_0g_trace: { request_id: `req-${n}`, tee_verified: true, provider: "0xabc" },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

beforeEach(() => {
  calls = [];
  groupThemes = defaultGroups;
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    const system: string = body.messages[0].content;
    const user: string = body.messages[1].content;
    const stage = /\[stage:(\w+)\]/.exec(system)?.[1] ?? "unknown";
    calls.push({ stage, user });
    const n = calls.length;
    const input = JSON.parse(user);
    if (stage === "label") {
      return reply({ labels: input.items.map((it: { ref: string; text: string }) => ({ ref: it.ref, label: keywordLabel(it.text) })) }, n);
    }
    if (stage === "group") return reply({ themes: groupThemes(input.labels) }, n);
    if (stage === "report") {
      const bullets = input.themes.map((t: { name: string; share_pct: number }) => `- ${t.name}: about ${t.share_pct}%`).join("\n");
      const md = `# Abandonment drivers\n\n${bullets}\n\nFigures are approximate: noise was added for privacy.\n\n**What to do:** test smaller sizes.`;
      return reply(input.hypothesis ? { markdown: md, verdict: "supported", verdict_reason: "Price is the largest theme at about 40%." } : { markdown: md }, n);
    }
    return new Response("{}", { status: 500 });
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

const zeroNoise = () => 0.5; // Laplace inverse CDF at u=0 -> noise 0
const base = { analysisId: "abandonment_drivers", question: ABANDONMENT_QUESTION };

test("refuses a too-small cohort before any 0G call, without the exact count", async () => {
  const items = smallAbandonmentCohort();
  const n = new Set(items.map((i) => i.user_ref)).size;
  assert.ok(n < 50);
  const out = await runInsight({ ...base, items });
  assert.equal(out.status, "refused");
  assert.equal(calls.length, 0);
  if (out.status !== "refused") return;
  assert.equal(out.distinct_users_bucket, "<50");
  assert.ok(!new RegExp(`\\b${n}\\b`).test(JSON.stringify(out)), "exact count must not appear");
});

test("full synthetic cohort: themes, buckets, receipts from every call", async () => {
  const out = await runInsight({ ...base, items: ABANDONMENT_COHORT }, { rng: zeroNoise });
  assert.equal(out.status, "ok");
  if (out.status !== "ok") return;
  assert.equal(out.cohort_bucket, "50–99");
  // 75 items -> 3 label batches + 1 group + 1 report.
  assert.deepEqual(
    calls.map((c) => c.stage),
    ["label", "label", "label", "group", "report"],
  );
  assert.equal(out.receipts.length, calls.length);
  assert.deepEqual(
    out.receipts.map((r) => r.request_id).sort(),
    calls.map((_, i) => `req-${i + 1}`).sort(),
  );
  for (const r of out.receipts) assert.equal(r.tee_verified, true);
  // 28 price users + 23 results users stay; the tail (7+3+2+2 = 14) merges into other.
  assert.deepEqual(
    out.themes.map((t) => t.name),
    ["price", "no visible results", "other"],
  );
  const total = out.themes.reduce((s, t) => s + t.share_pct, 0);
  assert.ok(Math.abs(total - 100) < 0.5);
  assert.deepEqual(out.privacy, { kMin: 50, epsilon: 1, smallCell: 20 });
});

test("no user_ref or excerpt reaches 0G or the output", async () => {
  const out = await runInsight({ ...base, items: ABANDONMENT_COHORT }, { rng: zeroNoise });
  const json = JSON.stringify(out);
  const sent = calls.map((c) => c.user).join("\n");
  for (const it of ABANDONMENT_COHORT) {
    assert.ok(!json.includes(it.user_ref), `user_ref ${it.user_ref} in output`);
    assert.ok(!sent.includes(it.user_ref), `user_ref ${it.user_ref} sent to 0G`);
    for (const e of it.excerpts) assert.ok(!json.includes(e), `excerpt in output: ${e}`);
  }
  // Excerpts only go to the label stage.
  for (const c of calls.filter((c) => c.stage !== "label")) {
    for (const it of ABANDONMENT_COHORT) for (const e of it.excerpts) assert.ok(!c.user.includes(e));
  }
});

function cohort(spec: [string, number][], extra: Item[] = []): Item[] {
  let k = 0;
  const items: Item[] = [];
  for (const [text, n] of spec) for (let i = 0; i < n; i++) items.push({ user_ref: `t_${String(++k).padStart(3, "0")}`, excerpts: [text] });
  return [...items, ...extra];
}

test("one vote per user: repeated items count once, ties go to the first item", async () => {
  // 30 price users + 25 results users. t_001 posts price 4 more times (still one vote);
  // t_031 (results) also mentions price once: tie, first item (results) wins.
  const items = cohort(
    [
      ["way too expensive", 30],
      ["no visible results", 25],
    ],
    [
      ...Array.from({ length: 4 }, () => ({ user_ref: "t_001", excerpts: ["too expensive again"] })),
      { user_ref: "t_031", excerpts: ["also too expensive"] },
    ],
  );
  groupThemes = (labels) => labels.map((l) => ({ name: l, labels: [l] }));
  const out = await runInsight({ ...base, items }, { rng: zeroNoise });
  assert.equal(out.status, "ok");
  if (out.status !== "ok") return;
  const share = Object.fromEntries(out.themes.map((t) => [t.name, t.share_pct]));
  assert.equal(share["too expensive"], Math.round((30 / 55) * 1000) / 10);
  assert.equal(share["no visible results"], Math.round((25 / 55) * 1000) / 10);
});

test("not relevant is dropped; small themes and model-dropped labels merge into other", async () => {
  const items = cohort([
    ["way too expensive", 30],
    ["no visible results", 22],
    ["the pump broke", 6], // small cell -> other
    ["always out of stock", 5], // model drops this label -> other
    ["exams next week", 10], // not relevant -> dropped
  ]);
  groupThemes = (labels) => labels.filter((l) => l !== "availability").map((l) => ({ name: l, labels: [l] }));
  const out = await runInsight({ ...base, items }, { rng: zeroNoise });
  assert.equal(out.status, "ok");
  if (out.status !== "ok") return;
  const share = Object.fromEntries(out.themes.map((t) => [t.name, t.share_pct]));
  assert.deepEqual(Object.keys(share), ["too expensive", "no visible results", "other"]);
  assert.equal(share["other"], Math.round((11 / 63) * 1000) / 10);
  assert.ok(!("packaging" in share) && !("availability" in share) && !("not relevant" in share));
});

test("noise comes from opts.rng, counts clamp at zero", async () => {
  const items = cohort([
    ["way too expensive", 30],
    ["no visible results", 25],
  ]);
  groupThemes = (labels) => labels.map((l) => ({ name: l, labels: [l] }));
  // rng near 1 -> large positive noise on every theme; equal noise keeps the ranking.
  const out = await runInsight({ ...base, items }, { rng: () => 0.999, epsilon: 1 });
  assert.equal(out.status, "ok");
  if (out.status !== "ok") return;
  const noise = Math.round(-Math.log(1 - 2 * 0.499));
  const share = Object.fromEntries(out.themes.map((t) => [t.name, t.share_pct]));
  assert.equal(share["too expensive"], Math.round(((30 + noise) / (55 + 2 * noise)) * 1000) / 10);

  // rng = 0 -> about -27 on every theme: 25 clamps to 0 (not negative), 30 -> 3 merges into other.
  const low = await runInsight({ ...base, items }, { rng: () => 0, epsilon: 1 });
  assert.equal(low.status, "ok");
  if (low.status !== "ok") return;
  assert.deepEqual(low.themes, [{ name: "other", share_pct: 100 }]);
});

test("a hypothesis gets a checked verdict; without one the verdict is unclear", async () => {
  const withIdea = await runInsight({ ...base, hypothesis: "Price is why young people drop serums", items: ABANDONMENT_COHORT }, { rng: zeroNoise });
  assert.equal(withIdea.status, "ok");
  if (withIdea.status !== "ok") return;
  assert.equal(withIdea.verdict, "supported");
  assert.match(withIdea.verdict_reason, /largest theme/);
  assert.match(calls.at(-1)!.user, /"hypothesis"/);
  const without = await runInsight({ ...base, items: ABANDONMENT_COHORT }, { rng: zeroNoise });
  assert.equal(without.status === "ok" && without.verdict, "unclear");
});
