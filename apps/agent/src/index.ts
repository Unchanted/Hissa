/**
 * Autonomous merchant agent. No human approves any step:
 *   1. discovers listings (free) and picks records matching its brief,
 *   2. buys them over x402, paying HBAR on Hedera within its spending controls,
 *   3. runs a premade insight analysis (also paid over x402),
 *   4. checks each settlement independently on the mirror node,
 *   5. appends each payment to its HCS topic (tamper-evident log),
 *   6. writes public evidence (IDs and HashScan links, no keys) to evidence/.
 */
import fs from "node:fs";
import {
  clientFor,
  hashscan,
  hbarBalance,
  hbarToTinybars,
  parseEcdsaKey,
  requireEnv,
  tinybarsToHbar,
  verifyHbarPayment,
} from "../../../packages/pay/src/hedera.js";
import { logPaymentToHcs, type AgentPaymentLog } from "../../../packages/pay/src/hcs.js";
import { AgentPayer, type PaidResult } from "../../../packages/pay/src/payer.js";

const API = process.env["API_URL"] ?? "http://localhost:4021";
const BRIEF = { domain: "consumer_electronics", maxRecords: 2, analysis: "abandonment-drivers" };

const agentId = requireEnv("AGENT_HEDERA_ACCOUNT_ID");
const agentKey = parseEcdsaKey(requireEnv("AGENT_HEDERA_PRIVATE_KEY"));
const topicId = requireEnv("HEDERA_PAYMENT_TOPIC_ID");
const limits = {
  budget: hbarToTinybars(Number(process.env["AGENT_BUDGET_HBAR"] ?? 10)),
  perPurchase: hbarToTinybars(Number(process.env["AGENT_MAX_PER_PURCHASE_HBAR"] ?? 5)),
  daily: hbarToTinybars(Number(process.env["AGENT_DAILY_CAP_HBAR"] ?? 25)),
};

type Listing = { listing_id: string; consent_sale: boolean; price: string; quality_tier: string; region: string };
type Evidence = {
  kind: AgentPaymentLog["kind"];
  resource: string;
  amount_hbar: string;
  payment_tx: string;
  payment_hashscan: string;
  mirror_check: Awaited<ReturnType<typeof verifyHbarPayment>>;
  hcs: { topic: string; sequence: string; tx: string; hashscan: string };
};

async function main() {
  const payer = new AgentPayer(agentId, agentKey, limits);
  const hcsClient = clientFor(agentId, agentKey);
  const evidence: Evidence[] = [];

  console.log(`Merchant agent ${agentId} — balance ${await hbarBalance(agentId)} HBAR`);
  console.log(
    `Limits: budget ${tinybarsToHbar(limits.budget)} · per purchase ${tinybarsToHbar(limits.perPurchase)} · daily ${tinybarsToHbar(limits.daily)} HBAR`,
  );
  console.log(`Payment log: HCS topic ${topicId}  ${hashscan.topic(topicId)}\n`);

  async function settle<T>(kind: AgentPaymentLog["kind"], resource: string, r: PaidResult<T>, extra: Partial<AgentPaymentLog>) {
    console.log(`  settled on Hedera: ${r.txId}`);
    const check = await verifyHbarPayment(r.txId, r.payTo, r.amountTinybars);
    console.log(`  mirror node: ${check.result}, ${tinybarsToHbar(check.receivedTinybars)} HBAR received by ${r.payTo}`);
    if (!check.ok) throw new Error(`mirror node does not confirm payment ${r.txId}`);
    const entry: AgentPaymentLog = {
      v: 1,
      kind,
      resource,
      amount_tinybars: r.amountTinybars.toString(),
      payer: r.payer ?? agentId,
      pay_to: r.payTo,
      payment_tx: r.txId,
      budget_left_tinybars: payer.remaining().toString(),
      at: new Date().toISOString(),
      ...extra,
    };
    const hcs = await logPaymentToHcs(hcsClient, topicId, entry);
    console.log(`  logged to HCS ${topicId} #${hcs.sequenceNumber}`);
    console.log(`  ${hashscan.tx(r.txId)}\n`);
    evidence.push({
      kind,
      resource,
      amount_hbar: tinybarsToHbar(r.amountTinybars),
      payment_tx: r.txId,
      payment_hashscan: hashscan.tx(r.txId),
      mirror_check: check,
      hcs: { topic: topicId, sequence: hcs.sequenceNumber, tx: hcs.txId, hashscan: hashscan.tx(hcs.txId) },
    });
  }

  // 1 · discover (free)
  const { items } = (await (await fetch(`${API}/api/listings?domain=${BRIEF.domain}`)).json()) as { items: Listing[] };
  const picks = items
    .filter((l) => l.consent_sale && BigInt(l.price) <= limits.perPurchase)
    .sort((a, b) => Number(BigInt(b.price) - BigInt(a.price)))
    .slice(0, BRIEF.maxRecords);
  console.log(`Discovered ${items.length} ${BRIEF.domain} listings; ${picks.length} for sale within caps\n`);

  // 2 · buy records
  for (const l of picks) {
    const resource = `${API}/api/records/${l.listing_id}`;
    console.log(`→ buy record ${l.listing_id} (${l.quality_tier}, ${l.region})`);
    try {
      const r = await payer.buy<{ record: unknown }>(resource);
      await settle("record_purchase", resource, r, { listing: l.listing_id });
    } catch (e) {
      console.log(`  skipped: ${(e as Error).message}\n`);
    }
  }

  // 3 · run an analysis
  const resource = `${API}/api/insights/${BRIEF.analysis}`;
  console.log(`→ run analysis ${BRIEF.analysis}`);
  try {
    const r = await payer.buy<{ report: { themes: { name: string; share: number }[] } }>(resource, { method: "POST" });
    for (const t of r.body.report.themes) console.log(`    ${(t.share * 100).toFixed(0).padStart(3)}%  ${t.name}`);
    await settle("insight_purchase", resource, r, { analysis_id: BRIEF.analysis });
  } catch (e) {
    console.log(`  skipped: ${(e as Error).message}\n`);
  }

  // 4 · a refused-before-payment case, to show no money moves for a too-small cohort
  const small = await fetch(`${API}/api/insights/brand-switching`, { method: "POST" });
  console.log(`→ brand-switching analysis: ${small.status} ${JSON.stringify(await small.json())}\n`);

  const spent = limits.budget - payer.remaining();
  console.log(`Done: ${evidence.length} paid requests, ${tinybarsToHbar(spent)} HBAR spent, ${tinybarsToHbar(payer.remaining())} left`);
  console.log(`Agent account: ${hashscan.account(agentId)}`);

  hcsClient.close();
  if (evidence.length === 0) return; // nothing settled, nothing to record
  fs.mkdirSync("evidence", { recursive: true });
  const out = "evidence/hedera-agent-run.json";
  const runs = fs.existsSync(out) ? (JSON.parse(fs.readFileSync(out, "utf8")) as unknown[]) : [];
  runs.push({
    at: new Date().toISOString(),
    network: "hedera:testnet",
    facilitator: "Blocky402",
    agent: agentId,
    topic: topicId,
    limits_hbar: Object.fromEntries(Object.entries(limits).map(([k, v]) => [k, tinybarsToHbar(v)])),
    spent_hbar: tinybarsToHbar(spent),
    payments: evidence,
  });
  fs.writeFileSync(out, JSON.stringify(runs, null, 2) + "\n");
  console.log(`Evidence written to ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
