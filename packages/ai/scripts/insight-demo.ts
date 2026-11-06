/**
 * 0G merchant-side showcase: an anonymised insight report on a SYNTHETIC cohort.
 *   1. A too-small segment is refused before any 0G call (k-anonymity floor).
 *   2. The full cohort is labelled, grouped and reported with sealed 0G calls; counts get
 *      Laplace noise and small themes merge into "other".
 * Prints themes as bars, the report and every 0G receipt; writes evidence/0g-insight-run.json
 * on success only.
 *
 *   npx tsx packages/ai/scripts/insight-demo.ts
 */
import { writeFileSync } from "node:fs";
import { runInsight } from "../src/insights.js";
import { ABANDONMENT_ANALYSIS_ID, ABANDONMENT_COHORT, ABANDONMENT_QUESTION, smallAbandonmentCohort } from "../src/synthetic-cohort.js";
import { ROUTER_URL, ZeroGError } from "../src/zerog.js";

const base = { analysisId: ABANDONMENT_ANALYSIS_ID, question: ABANDONMENT_QUESTION };
console.log(`Analysis: ${ABANDONMENT_ANALYSIS_ID}\nQuestion: ${ABANDONMENT_QUESTION}\n`);

// 1. Too-small segment: refused locally, nothing is sent anywhere.
let fetches = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = ((...args: Parameters<typeof fetch>) => (fetches++, realFetch(...args))) as typeof fetch;

const small = smallAbandonmentCohort();
const refusal = await runInsight({ ...base, items: small });
console.log("── 1. Too-small segment (users who bought in the last 7 days) ──");
console.log(`  status   ${refusal.status}`);
if (refusal.status === "refused") {
  console.log(`  bucket   ${refusal.distinct_users_bucket} distinct users (exact count never returned)`);
  console.log(`  reason   ${refusal.reason}`);
}
const refusalCalls = fetches;
console.log(`  0G calls ${refusalCalls}\n`);

// 2. Full synthetic cohort.
console.log(`── 2. Full cohort (${ABANDONMENT_COHORT.length} synthetic items) ──`);
try {
  const out = await runInsight({ ...base, items: ABANDONMENT_COHORT });
  if (out.status !== "ok") {
    console.log(`  refused: ${out.reason}`);
    process.exit(1);
  }
  console.log(`  cohort   ${out.cohort_bucket} users   privacy kMin=${out.privacy.kMin} epsilon=${out.privacy.epsilon} smallCell=${out.privacy.smallCell}\n`);
  const width = Math.max(...out.themes.map((t) => t.name.length));
  for (const t of out.themes) console.log(`  ${t.name.padEnd(width)}  ${"█".repeat(Math.round(t.share_pct / 2)).padEnd(50)} ~${t.share_pct}%`);
  console.log("\n── 3. Report ───────────────────────────────────────────\n" + out.report_markdown + "\n");
  console.log(`── 4. 0G receipts (${out.receipts.length} sealed calls) ─────────────────`);
  for (const r of out.receipts) console.log(`  ${r.request_id.padEnd(40)} ${r.model.padEnd(18)} tee_verified=${r.tee_verified}  ${r.latency_ms} ms`);
  writeFileSync(
    new URL("../../../evidence/0g-insight-run.json", import.meta.url),
    JSON.stringify({ at: new Date().toISOString(), router: ROUTER_URL, input: "synthetic", refusal_case: refusal, refusal_case_0g_calls: refusalCalls, result: out }, null, 2),
  );
  console.log("\nwrote evidence/0g-insight-run.json");
} catch (e) {
  const err = e as ZeroGError;
  console.error(`  0G call failed: ${err.message}${err.code ? ` [${err.code}]` : ""}`);
  process.exit(1);
}
