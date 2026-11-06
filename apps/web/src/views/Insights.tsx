/**
 * Buyer product 1 — validate a business idea against real, consented data.
 *
 *   idea ──0G──▶ filters + one measurable question
 *        ──Arkiv──▶ count people who consented to analytics (k ≥ 50, else refuse, nothing charged)
 *        ──Hedera x402──▶ agent pays for one report
 *        ──0G (sealed)──▶ labels → themes → noised shares → report + verdict
 *        ──Hedera──▶ 80% credited to the people counted, paid out in batches
 *
 * The buyer never sees a record, a quote or a person; only noised aggregates.
 */
import { useState, type ReactNode } from "react";
import { Button, Chip, Hash, Panel, SponsorTag } from "../components/ui";
import { PRICES } from "../config";
import { api, useLive, type CohortQuote, type InsightReport, type ParsedRequest } from "../live";
import { useStore } from "../store";
import { band, sealLabel, teeLabel, ZG_NOTE } from "../zerog";

const IDEAS = [
  "Young Indians are dropping skincare serums because they cost too much — a ₹299 trial size would sell.",
  "Students in Mumbai want a budget laptop under ₹40,000 for college.",
];

type StepId = "parse" | "cohort" | "pay" | "analyse" | "share";
type StepState = "idle" | "run" | "ok" | "fail" | "skip";
const STEPS: { id: StepId; who: "0G" | "ARKIV" | "HEDERA"; title: string; idle: string }[] = [
  { id: "parse", who: "0G", title: "Understand the idea", idle: "Sealed call turns your idea into filters and one question chats can answer" },
  { id: "cohort", who: "ARKIV", title: "Count consenting people", idle: "Only sellers who opted in to analytics · at least 50 or nothing runs" },
  { id: "pay", who: "HEDERA", title: "Agent pays for the report", idle: `${PRICES.insight} ℏ over x402 · settled only if the report is delivered` },
  { id: "analyse", who: "0G", title: "Private analysis in the TEE", idle: "Label each record → group into themes → add noise → write the report" },
  { id: "share", who: "HEDERA", title: "Contributors get their share", idle: "80% split across the people counted · paid out in batches, never per report" },
];

const VERDICT: Record<InsightReport["verdict"], { label: string; tone: "ok" | "warn" | "err" | "default" }> = {
  supported: { label: "Supported by the data", tone: "ok" },
  partly: { label: "Partly supported", tone: "warn" },
  not_supported: { label: "Not supported", tone: "err" },
  unclear: { label: "Unclear", tone: "default" },
};

export function Insights({ budgetLeft, onSpent }: { budgetLeft: number; onSpent: (hbar: number) => void }) {
  const { live, zg, refresh } = useLive();
  const { addReceipt } = useStore();
  const [idea, setIdea] = useState(IDEAS[0]!);
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<Record<StepId, { state: StepState; detail?: ReactNode }>>(() => idleSteps());
  const [parsed, setParsed] = useState<ParsedRequest | null>(null);
  const [quote, setQuote] = useState<CohortQuote | null>(null);
  const [report, setReport] = useState<InsightReport | null>(null);
  const [error, setError] = useState("");

  const set = (id: StepId, state: StepState, detail?: ReactNode) => setSteps((s) => ({ ...s, [id]: { state, detail } }));

  async function run() {
    if (busy || !idea.trim()) return;
    setSteps(idleSteps());
    setParsed(null);
    setQuote(null);
    setReport(null);
    setError("");
    if (!live) return setError("Marketplace API unavailable; nothing was analysed or paid.");
    if (!zg) return setError("0G Private Computer is not configured on the API (ZG_API_KEY); nothing was analysed or paid.");
    setBusy(true);
    try {
      // 1 · 0G understands the idea
      set("parse", "run");
      const p = await api.parseRequest(idea, "insights");
      setParsed(p);
      addReceipt({ kind: "inference", title: `idea → question · ${teeLabel(p.receipt)}`, chain: "0g", tx: p.receipt.request_id });
      set("parse", "ok", <Hash value={p.receipt.request_id} label="req" note={ZG_NOTE} />);

      // 2 · Arkiv: who consented to analytics?
      set("cohort", "run");
      const filters = { domain: p.filters.domain, ...(p.filters.region ? { region: p.filters.region } : {}) };
      const q = await api.insightQuote(filters);
      setQuote(q);
      const counted = `${q.real} real seller${q.real === 1 ? "" : "s"}${q.seed ? ` + ${q.seed} seed panel` : ""}`;
      if (!q.ok) {
        set("cohort", "fail", <span>{counted} · fewer than {q.kMin}: a report could identify someone</span>);
        for (const id of ["pay", "analyse", "share"] as const) set(id, "skip");
        return setError(`Not enough consenting people for this question yet (needs ${q.kMin}). Nothing was charged.`);
      }
      set("cohort", "ok", <span>{counted} · ≥ {q.kMin} ✓</span>);
      if (q.priceHbar > budgetLeft) {
        for (const id of ["pay", "analyse", "share"] as const) set(id, "skip");
        return setError(`Report costs ${q.priceHbar} ℏ but the agent has ${budgetLeft.toFixed(2)} ℏ left. Nothing was charged.`);
      }

      // 3 + 4 · the agent pays over x402; the paid route runs the sealed analysis
      set("pay", "run");
      set("analyse", "run");
      const r = await api.insight(p.question ?? idea, filters, budgetLeft, idea);
      if (r.status === "refused") {
        for (const id of ["pay", "analyse", "share"] as const) set(id, "skip");
        return setError(r.reason);
      }
      onSpent(Number(r.payment.amountHbar));
      set("pay", "ok", <Hash value={r.payment.txId} head={14} tail={4} label="paid" href={r.payment.hashscan} />);
      const cost = r.receipts.reduce((a, x) => a + Number(x.cost_usd_micro ?? 0), 0);
      set("analyse", "ok", <span>{r.receipts.length} sealed calls{r.receipts.every((x) => sealLabel(x)) ? ` · ${sealLabel(r.receipts[0]!)}` : ""}{cost ? ` · $${(cost / 1e6).toFixed(4)}` : ""}</span>);
      addReceipt({ kind: "inference", title: `insight report · ${r.receipts.length} sealed calls · ${r.receipts[0]?.model ?? "0G"}`, chain: "0g", tx: r.receipts.at(-1)?.request_id ?? "" });
      const share = Number(r.payment.contributorShareHbar);
      set("share", "ok", <span>{share} ℏ across {r.cohort.real + r.cohort.seed} people · real sellers credited on Arkiv</span>);
      setReport(r);
      refresh();
    } catch (e) {
      setSteps((s) => {
        const next = { ...s };
        for (const id of Object.keys(next) as StepId[]) if (next[id].state === "run") next[id] = { state: "fail" };
        return next;
      });
      setError(`${(e as Error).message}. If a payment was attempted, x402 settles only after a report is delivered.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="insights">
      <Panel label="YOUR IDEA" className="request">
        <textarea className="idea-input" value={idea} onChange={(e) => setIdea(e.target.value)} rows={2} disabled={busy} placeholder="Describe a business idea or a belief about your customers" />
        <div className="request-meta">
          {IDEAS.map((x) => (
            <button key={x} className="example" onClick={() => setIdea(x)} disabled={busy}>
              {x.length > 64 ? `${x.slice(0, 62)}…` : x}
            </button>
          ))}
          <span className="spacer" />
          <Button size="lg" onClick={() => void run()} disabled={busy || !idea.trim()}>
            {busy ? "Checking…" : `Check against real data · ${PRICES.insight} ℏ`}
          </Button>
        </div>
        {parsed && (
          <div className="parsed appear">
            <SponsorTag who="0G" />
            <span className="facet-chip">domain: {parsed.filters.domain}</span>
            {parsed.filters.region && <span className="facet-chip">region: {parsed.filters.region}</span>}
            {parsed.filters.age && <span className="facet-chip">age: {band(parsed.filters.age)}</span>}
            {parsed.filters.event && <span className="facet-chip">behaviour: {parsed.filters.event}</span>}
            {parsed.question && <span className="question">“{parsed.question}”</span>}
          </div>
        )}
      </Panel>

      <div className="insights-grid">
        <Panel label="HOW YOUR ANSWER IS MADE">
          <ol className="flow">
            {STEPS.map((s, i) => {
              const st = steps[s.id];
              return (
                <li key={s.id} className={`flow-step is-${st.state}`}>
                  <span className="flow-n">{st.state === "ok" ? "✓" : st.state === "fail" ? "!" : st.state === "skip" ? "–" : i + 1}</span>
                  <div>
                    <div className="flow-head">
                      <b>{s.title}</b>
                      <SponsorTag who={s.who} />
                    </div>
                    <small>{st.detail ?? s.idle}</small>
                  </div>
                </li>
              );
            })}
          </ol>
          {error && (
            <p className="flow-error" role="alert">
              {error}
            </p>
          )}
        </Panel>

        <Panel label="ANSWER" aside={<SponsorTag who="0G" />}>
          {report ? (
            <Answer r={report} quote={quote} />
          ) : (
            <div className="answer-empty">
              <p>
                You get <b>patterns, not people</b>: the main reasons in your segment, each with an approximate share, and a verdict on your idea.
              </p>
              <ul>
                <li>At least 50 consenting people, or it doesn't run</li>
                <li>Noise added to every number (ε = 1)</li>
                <li>No quotes, no records, no names ever leave the TEE</li>
                <li>80% of the price goes to the people counted</li>
              </ul>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

function Answer({ r, quote }: { r: InsightReport; quote: CohortQuote | null }) {
  const v = VERDICT[r.verdict];
  const max = Math.max(...r.themes.map((t) => t.share_pct), 1);
  return (
    <div className="answer appear">
      <div className={`verdict verdict-${r.verdict}`}>
        <Chip tone={v.tone}>{v.label}</Chip>
        {r.verdict_reason && <p>{r.verdict_reason}</p>}
      </div>
      <small className="muted">Question: “{r.question}”</small>
      <div className="themes-bars">
        {r.themes.map((t, i) => (
          <div key={t.name} style={{ ["--i" as string]: i }}>
            <span>{t.name}</span>
            <i style={{ ["--w" as string]: `${(t.share_pct / max) * 100}%` }} />
            <b className="mono">≈{Math.round(t.share_pct)}%</b>
          </div>
        ))}
      </div>
      <Markdown text={r.report_markdown} />
      <div className="row gap-s wrap">
        <Chip tone="gold">cohort {r.cohort_bucket}</Chip>
        <Chip>k ≥ {r.privacy.kMin} · noised ε={r.privacy.epsilon}</Chip>
        <Chip>{r.cohort.real} real · Arkiv consent_insights</Chip>
        {r.cohort.seed > 0 && <Chip tone="warn">+{r.cohort.seed} synthetic seed panel</Chip>}
        {quote && <Chip>{quote.priceHbar} ℏ</Chip>}
      </div>
      <div className="row gap-s wrap">
        {r.receipts.slice(0, 3).map((x) => (
          <Hash key={x.request_id} value={x.request_id} head={10} tail={4} label="req" note={ZG_NOTE} />
        ))}
        {r.receipts.length > 3 && <small className="muted mono">+{r.receipts.length - 3} more 0G calls</small>}
      </div>
    </div>
  );
}

/** Tiny renderer for the report: headings, bullets, bold. The text comes from 0G, so no HTML. */
function Markdown({ text }: { text: string }) {
  const inline = (s: string) => s.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith("**") && part.endsWith("**") ? <b key={i}>{part.slice(2, -2)}</b> : part));
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) blocks.push(<ul key={`u${blocks.length}`}>{list.map((x, i) => <li key={i}>{inline(x)}</li>)}</ul>);
    list = [];
  };
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (/^[-*] /.test(line)) list.push(line.slice(2));
    else {
      flush();
      if (/^#{1,3} /.test(line)) blocks.push(<h4 key={`h${blocks.length}`}>{inline(line.replace(/^#+ /, ""))}</h4>);
      else if (line) blocks.push(<p key={`p${blocks.length}`}>{inline(line)}</p>);
    }
  }
  flush();
  return <div className="report-md">{blocks}</div>;
}

function idleSteps(): Record<StepId, { state: StepState }> {
  return { parse: { state: "idle" }, cohort: { state: "idle" }, pay: { state: "idle" }, analyse: { state: "idle" }, share: { state: "idle" } };
}
