/**
 * Runs every 0G job the platform uses, once, on the model(s) in ZG_CHAT_MODELS (default: both,
 * one after the other in child processes), all in private (TEE) mode, and scores the output:
 *   1. seller upload classification   2. buyer request -> filters   3. idea -> filters + question
 *   4. too-small idea (laptops)       5. anonymised insight report with a verdict (5 calls)
 * Synthetic, already-masked text only. Writes evidence/0g-compare-<model>.json.
 *
 *   npx tsx packages/ai/scripts/compare-models.ts
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const MODELS = ["glm-5.3", "0gm-1.0-35b-a3b"];

if (!process.env["ZG_CHAT_MODELS"]) {
  for (const m of MODELS) {
    execFileSync(process.execPath, ["--import", "tsx", fileURLToPath(import.meta.url)], { stdio: "inherit", env: { ...process.env, ZG_CHAT_MODELS: m } });
  }
  process.exit(0);
}

const { analyseUpload } = await import("../src/upload.js");
const { parseBuyerRequest } = await import("../src/request.js");
const { runInsight } = await import("../src/insights.js");
const { ABANDONMENT_COHORT } = await import("../src/synthetic-cohort.js");
const { CHAT_MODELS } = await import("../src/zerog.js");
const model = CHAT_MODELS[0]!;

// The web app's sample chat after on-device masking (seller's own messages only).
const MASKED = `Hey, I'm [PERSON_1], 22, final-year student in [PLACE_1]. Been on the Minimalist 10% niacinamide serum for 2 weeks and honestly see zero difference.
It was ₹599 and my friend [PERSON_2] says The Ordinary works better but it's ₹950 on Nykaa. That's way over what I want to spend on one bottle.
Can you draft a refund request? Order [ID_1], reach me at [EMAIL_1] or [PHONE_1].
Honestly I'm dropping serums. Going back to sunscreen + a basic moisturiser, under ₹400 total.`;

type Row = { job: string; pass: boolean; checks: Record<string, boolean>; ms: number; requests: string[]; tee: boolean[]; output?: unknown; error?: string };
const rows: Row[] = [];

async function job(name: string, fn: () => Promise<{ checks: Record<string, boolean>; receipts: { request_id: string; tee_verified: boolean | null }[]; output: unknown }>) {
  const t = Date.now();
  try {
    const r = await fn();
    const pass = Object.values(r.checks).every(Boolean);
    rows.push({ job: name, pass, checks: r.checks, ms: Date.now() - t, requests: r.receipts.map((x) => x.request_id), tee: r.receipts.map((x) => x.tee_verified === true), output: r.output });
  } catch (e) {
    rows.push({ job: name, pass: false, checks: {}, ms: Date.now() - t, requests: [], tee: [], error: (e as Error).message });
  }
  const r = rows.at(-1)!;
  const failed = Object.entries(r.checks).filter(([, v]) => !v).map(([k]) => k);
  console.log(`  ${r.pass ? "PASS" : "FAIL"}  ${name.padEnd(22)} ${String(r.ms).padStart(6)} ms  ${r.error ?? (failed.length ? `failed: ${failed.join(", ")}` : "")}`);
}

console.log(`\n== ${model} (private / TEE) ==`);

await job("upload.classify", async () => {
  const out = await analyseUpload(MASKED);
  const f = out.facets;
  const events = f.mentions.flatMap((m) => m.events);
  const json = JSON.stringify(f);
  return {
    receipts: [out.receipt],
    output: f,
    checks: {
      domain_beauty: f.domain_path.startsWith("beauty"),
      has_mentions: f.mentions.length >= 2,
      abandoned_event: events.includes("abandoned"),
      price_too_expensive: f.mentions.some((m) => m.price_judgement === "too_expensive"),
      age_18_24: f.age_band === "18-24",
      no_placeholders_in_facets: !/\[[A-Z_]+_\d+\]/.test(json),
      brand_kept: /minimalist|ordinary|niacinamide/i.test(json),
    },
  };
});

await job("request.records", async () => {
  const out = await parseBuyerRequest("18–24 year olds in India who gave up on skincare serums because of price", "records");
  const f = out.filters;
  return { receipts: [out.receipt], output: out.filters, checks: { domain: f.domain === "beauty", age: f.age === "18-24", region: f.region === "IN", event: f.event === "abandoned", no_question: out.question === undefined } };
});

await job("request.idea", async () => {
  const out = await parseBuyerRequest("Young Indians are dropping skincare serums because they cost too much — a ₹299 trial size would sell.", "insights");
  return {
    receipts: [out.receipt],
    output: out,
    checks: { domain: out.filters.domain === "beauty", region: out.filters.region === "IN", question: !!out.question && out.question.length > 15 && /\?$/.test(out.question.trim()) },
  };
});

await job("request.idea_laptops", async () => {
  const out = await parseBuyerRequest("Students in Mumbai want a budget laptop under ₹40,000 for college.", "insights");
  return { receipts: [out.receipt], output: out, checks: { domain: out.filters.domain === "electronics", region: out.filters.region === "IN-west", age: out.filters.age === "18-24" } };
});

await job("insight.report", async () => {
  const out = await runInsight(
    {
      analysisId: "rpt_compare",
      question: "Why do 18-24 year olds in India stop using skincare serums, and is price the main reason?",
      hypothesis: "Young Indians are dropping skincare serums because they cost too much — a ₹299 trial size would sell.",
      items: ABANDONMENT_COHORT,
    },
    { rng: () => 0.5 },
  );
  if (out.status !== "ok") throw new Error(`refused: ${out.reason}`);
  const top = out.themes.filter((t) => t.name !== "other").sort((a, b) => b.share_pct - a.share_pct)[0];
  const words = out.report_markdown.split(/\s+/).length;
  return {
    receipts: out.receipts,
    output: { themes: out.themes, verdict: out.verdict, verdict_reason: out.verdict_reason, words, report: out.report_markdown },
    checks: {
      themes_2_to_7: out.themes.length >= 2 && out.themes.length <= 8,
      top_theme_is_price: !!top && /price|expens|cost|cheap|afford|dupe/i.test(top.name),
      verdict_given: out.verdict === "supported" || out.verdict === "partly",
      verdict_reason: out.verdict_reason.length > 20,
      report_length_ok: words >= 80 && words <= 450,
      says_approximate: /approx|noise/i.test(out.report_markdown),
      all_sealed: out.receipts.every((r) => r.tee_verified === true || r.e2ee === "sealed"),
    },
  };
});

const passed = rows.filter((r) => r.pass).length;
console.log(`  ${passed}/${rows.length} jobs passed · total ${rows.reduce((a, r) => a + r.ms, 0)} ms`);
mkdirSync("evidence", { recursive: true });
writeFileSync(`evidence/0g-compare-${model}.json`, JSON.stringify({ model, trust_mode: "private", at: new Date().toISOString(), passed, total: rows.length, rows }, null, 2));
