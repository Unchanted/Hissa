import { useState } from "react";
import { Button, Chip, Console, CountUp, Hash, PageHead, Panel, SponsorTag, useLog } from "../components/ui";
import { ANALYSES, FILTERS, cohortBucket, cohortSize, type Analysis, type Filters } from "../demo-data";
import { ACCOUNTS, AGENT_DEFAULTS, PRICES, PRIVACY } from "../config";
import { evmHash, hbar, hederaTxId, hex, ogRequestId, short, sleep } from "../lib";
import { useStore } from "../store";

export function Agent() {
  const { state, update, addReceipt } = useStore();
  const [analysisId, setAnalysisId] = useState(ANALYSES[0]!.id);
  const [f, setF] = useState<Filters>({ age: "18–24", budget: "high", region: "IN" });
  const [limits, setLimits] = useState(AGENT_DEFAULTS);
  const [buyRecord, setBuyRecord] = useState(true);
  const [busy, setBusy] = useState(false);
  const log = useLog();

  const l = state.listing;
  const priyaCounts = !!l?.live && l.consentInsights;
  const n = cohortSize(f, priyaCounts);
  const ok = n >= PRIVACY.kMin;
  const analysis = ANALYSES.find((a) => a.id === analysisId)!;
  const left = limits.budget - state.spent;

  async function run() {
    if (busy) return;
    setBusy(true);
    log.clear();
    const p = log.push;
    const alive = () => log.alive.current;
    let spent = state.spent;
    let daySpent = state.spent;
    let seq = state.hcsSeq;
    const price = PRICES.insightReport;

    const policy = (amount: number) => {
      if (amount > limits.perPurchase) return `price ${amount} > per-purchase cap ${limits.perPurchase}`;
      if (spent + amount > limits.budget) return `budget: ${hbar(spent)} + ${amount} > ${limits.budget}`;
      if (daySpent + amount > limits.daily) return `daily cap: ${hbar(daySpent)} + ${amount} > ${limits.daily}`;
      return null;
    };

    p(`agent ${ACCOUNTS.agent} · brief “${analysis.short}” · no human approval from here`, "cmd");
    p(`limits · budget ${limits.budget} · per purchase ${limits.perPurchase} · daily ${limits.daily} HBAR · spent ${hbar(spent)}`, "dim");
    await sleep(600);
    p(`arkiv.query dm.listing · domain="beauty" ∧ consent_insights=true ∧ region ${f.region === "IN" ? '^= "IN"' : '= "IN-west"'}`, "arkiv");
    await sleep(900);
    const candidates = (f.region === "IN" ? 287 : 124) + (priyaCounts ? 1 : 0);
    p(`→ ${candidates} live listings · keyset paging · 3 pages`, "arkiv");
    await sleep(500);
    p(`POST /api/insights/${analysis.id} · age=${f.age} budget=${f.budget} region=${f.region}`, "cmd");
    await sleep(800);
    if (!alive()) return;

    if (!ok) {
      p(`← 422 cohort_too_small · ${n} distinct users < k_min ${PRIVACY.kMin}`, "err");
      p("no quote issued · nothing charged · 0 HBAR spent", "warn");
      setBusy(false);
      return;
    }
    p(`server: decrypt on demand · ${n} distinct users ≥ k_min ${PRIVACY.kMin} ✓ · consent re-checked`, "ok");
    await sleep(500);
    p(
      <>
        ← <b>402 Payment Required</b>
        <pre>{`{ "scheme": "exact", "network": "hedera-testnet", "asset": "HBAR",
  "maxAmountRequired": "${price * 1e8}", "payTo": "${ACCOUNTS.treasury}",
  "resource": "/api/insights/${analysis.id}" }`}</pre>
      </>,
      "pay",
    );
    await sleep(900);
    const why = policy(price);
    if (why) {
      p(`policy ✗ ${why} → not paying, stopping`, "err");
      setBusy(false);
      return;
    }
    p(`policy ✓ ${price} ≤ cap ${limits.perPurchase} · ${hbar(spent + price)} ≤ budget ${limits.budget} · ≤ daily ${limits.daily}`, "ok");
    await sleep(500);
    p(`x402 · sign Hedera transfer ${price} HBAR → ${ACCOUNTS.treasury}`, "pay");
    await sleep(800);
    p("facilitator /verify ✓ → /settle", "pay");
    await sleep(1200);
    const payTx = hederaTxId(ACCOUNTS.agent);
    p(
      <>
        settled on Hedera · <Hash value={payTx} head={18} tail={6} /> · consensus ✓
      </>,
      "pay",
    );
    spent += price;
    daySpent += price;
    update((s) => ({ ...s, spent: s.spent + price }));
    await sleep(500);
    p("retry with X-PAYMENT header → 200 OK", "ok");
    await sleep(500);

    const reqIds: string[] = [];
    for (let i = 1; i <= 3; i++) {
      const r = ogRequestId();
      reqIds.push(r);
      p(`0g.labelForAnalysis · batch ${i}/3 · ${short(r, 12, 4)}`, "og");
      await sleep(550);
    }
    const themesReq = ogRequestId();
    reqIds.push(themesReq);
    p(`0g.nameThemes → ${analysis.themes.length} themes · ${short(themesReq, 12, 4)}`, "og");
    await sleep(600);
    p(`privacy layer · 1 vote/user · Laplace ε=${PRIVACY.epsilon} · cells < ${PRIVACY.smallCell} merged → other`, "ok");
    await sleep(600);
    const reportReq = ogRequestId();
    reqIds.push(reportReq);
    p(`0g.writeReport · ${short(reportReq, 12, 4)}`, "og");
    await sleep(800);
    const receiptTx = evmHash();
    const root = `0x${hex(32)}`;
    p(
      <>
        arkiv.createEntity dm.insight_receipt · bucket {cohortBucket(n)} · root {short(root)} · tx <Hash value={receiptTx} />
      </>,
      "arkiv",
    );
    await sleep(600);
    seq += 1;
    p(`hcs.submit · topic ${ACCOUNTS.hcsTopic} · seq #${seq}`, "pay");
    if (!alive()) return;
    const share = priyaCounts ? (price * PRIVACY.sellerShare) / n : 0;
    update((s) => ({
      ...s,
      hcsSeq: seq,
      report: { analysisId: analysis.id, cohort: n, requestIds: reqIds, paymentTx: payTx, receiptTx, hcsSeq: seq, contributorsRoot: root, includesPriya: priyaCounts, at: Date.now() },
      earnings: { ...s.earnings, insights: s.earnings.insights + share },
    }));
    addReceipt({ kind: "insight", title: `${analysis.id} · cohort ${cohortBucket(n)} · ε ${PRIVACY.epsilon.toFixed(1)}`, chain: "arkiv", tx: receiptTx, amount: price, mine: priyaCounts });

    if (buyRecord) {
      await sleep(900);
      p("— brief part 2 · buy one matching record —", "dim");
      const recPrice = PRICES.record.silver;
      p('arkiv.query dm.listing · consent_sale=true ∧ domain="beauty" ∧ quality_tier="silver"', "arkiv");
      await sleep(800);
      const target = l ? l.entityKey : evmHash();
      const blocked = l && (!l.live || !l.consentSale);
      if (blocked) {
        p(`→ ${short(l.entityKey)} no longer returned (${!l.live ? "deleted" : "consent_sale=false"})`, "arkiv");
        await sleep(500);
        p(`agent retries cached key directly · GET /api/records/${short(target)}`, "cmd");
        await sleep(800);
        p(`← 403 consent_withdrawn · ${!l.live ? "listing not live on Arkiv" : "consent_sale=false on Arkiv"} · refused before payment`, "err");
        p("0 HBAR spent · agent moves on", "warn");
      } else {
        p(`→ ${short(target)} · silver · ${recPrice} HBAR`, "arkiv");
        p(`GET /api/records/${short(target)} → 402 · ${recPrice} HBAR`, "pay");
        await sleep(600);
        const why2 = policy(recPrice);
        if (why2) {
          p(`policy ✗ ${why2} → skip`, "err");
        } else {
          const tx2 = hederaTxId(ACCOUNTS.agent);
          p(
            <>
              settled · <Hash value={tx2} head={18} tail={6} />
            </>,
            "pay",
          );
          spent += recPrice;
          update((s) => ({ ...s, spent: s.spent + recPrice }));
          await sleep(700);
          p("server: live ✓ consent_sale ✓ payment not reused ✓", "ok");
          await sleep(500);
          p("unseal → watermark with buyer tokens → re-encrypt to buyer key", "ok");
          await sleep(700);
          const saleTx = evmHash();
          seq += 1;
          p(
            <>
              arkiv dm.sale · tx <Hash value={saleTx} /> · hcs seq #{seq}
            </>,
            "arkiv",
          );
          const psn = hex(8);
          update((s) => ({
            ...s,
            hcsSeq: seq,
            delivered: {
              listingId: l?.listingId ?? "lst_c04e",
              paymentTx: tx2,
              psn,
              at: Date.now(),
              excerpts: [
                "Been on the Minimalist 10% niacinamide serum for 2 weeks and honestly see zero difference.",
                "My friend [P-7QK2] says The Ordinary works better but it's ₹950 on Nykaa.",
                "Honestly I'm dropping serums. Going back to sunscreen + a basic moisturiser, under ₹400 total.",
              ],
            },
            earnings: { ...s.earnings, sales: s.earnings.sales + (l ? recPrice * PRIVACY.sellerShare : 0) },
          }));
          addReceipt({ kind: "sale", title: `dm.sale · ${l?.listingId ?? "lst_c04e"} · silver`, chain: "arkiv", tx: saleTx, amount: recPrice, mine: !!l });
        }
      }
    }
    await sleep(400);
    p(`done · spent ${hbar(spent - state.spent)} HBAR this run · ${hbar(limits.budget - spent)} HBAR left`, "ok");
    setBusy(false);
  }

  return (
    <div className="page">
      <PageHead
        eyebrow="// 02 · MERCHANT AGENT — D2C SKINCARE BRAND"
        title={
          <>
            Set a budget. <em>Walk away.</em>
          </>
        }
        sub="The agent discovers cohorts on Arkiv, pays over x402 on Hedera within its limits, logs every payment to HCS and returns a noised report. Nobody clicks “pay”."
        aside={
          l && (
            <div className={`watch${l.live && l.consentSale ? "" : " off"}`}>
              <small className="mono">PRIYA'S LISTING</small>
              <b>{!l.live ? "revoked" : l.consentSale ? "sale allowed" : "sale withdrawn"}</b>
              <small className="mono">insights {l.live && l.consentInsights ? "on" : "off"}</small>
            </div>
          )
        }
      />
      <div className="agent-grid">
        <div className="stack">
          <Panel label="ANALYSIS · PREMADE ONLY">
            <div className="analyses">
              {ANALYSES.map((a) => (
                <button key={a.id} className={`analysis${a.id === analysisId ? " on" : ""}`} onClick={() => setAnalysisId(a.id)} disabled={busy}>
                  <b>{a.short}</b>
                  <span>{a.question}</span>
                  <small className="mono">{PRICES.insightReport} HBAR</small>
                </button>
              ))}
              <div className="analysis soon">
                <b>Other — coming soon</b>
                <span>Ask in plain English. Interpreted into a checked analysis spec, never run as free-form instructions.</span>
              </div>
            </div>
          </Panel>
          <Panel label="COHORT · MAX 3 FILTERS" aside={<Chip tone={ok ? "ok" : "err"}>{ok ? `${n} users ≥ ${PRIVACY.kMin}` : `${n} < k_min ${PRIVACY.kMin}`}</Chip>}>
            <div className="filters">
              <Seg label="age_band" options={FILTERS.age} value={f.age} onChange={(v) => setF({ ...f, age: v })} disabled={busy} />
              <Seg label="budget" options={FILTERS.budget} value={f.budget} onChange={(v) => setF({ ...f, budget: v })} disabled={busy} />
              <Seg label="region" options={FILTERS.region} value={f.region} onChange={(v) => setF({ ...f, region: v })} disabled={busy} />
            </div>
            <div className="cohort-meter">
              <div className="cohort-bar">
                <i style={{ width: `${Math.min(100, (n / 130) * 100)}%` }} className={ok ? "" : "low"} />
                <span className="kmin" style={{ left: `${(PRIVACY.kMin / 130) * 100}%` }}>
                  k_min
                </span>
              </div>
              <small className="muted">{ok ? `Quote: ${PRICES.insightReport} HBAR · reveals only “cohort ≥ ${PRIVACY.kMin}”` : "Below the minimum — refused before any payment."}</small>
            </div>
          </Panel>
          <Panel label="SPENDING CONTROLS">
            <div className="limits">
              <Limit label="Budget" value={limits.budget} min={3} max={30} onChange={(v) => setLimits({ ...limits, budget: v })} />
              <Limit label="Per purchase" value={limits.perPurchase} min={1} max={10} onChange={(v) => setLimits({ ...limits, perPurchase: v })} />
              <Limit label="Daily cap" value={limits.daily} min={3} max={50} onChange={(v) => setLimits({ ...limits, daily: v })} />
            </div>
            <label className="check">
              <input type="checkbox" checked={buyRecord} onChange={(e) => setBuyRecord(e.target.checked)} disabled={busy} />
              <span>Also buy one matching record ({PRICES.record.silver} HBAR)</span>
            </label>
          </Panel>
        </div>
        <div className="stack sticky">
          <div className="budget">
            <div>
              <small className="mono">BUDGET LEFT</small>
              <b>
                <CountUp value={Math.max(0, left)} decimals={2} /> <span>/ {limits.budget} HBAR</span>
              </b>
            </div>
            <div className="budget-bar">
              <i style={{ width: `${Math.max(0, Math.min(100, (left / limits.budget) * 100))}%` }} />
            </div>
            <div className="row gap-s wrap">
              <SponsorTag who="HEDERA" />
              <small className="mono muted">HCS topic {ACCOUNTS.hcsTopic} · seq #{state.hcsSeq}</small>
            </div>
          </div>
          <Button size="lg" onClick={() => void run()} disabled={busy}>
            {busy ? "Agent running…" : state.report ? "Run agent again" : "Start agent"}
          </Button>
          <Console title={`merchant-agent · ${ACCOUNTS.agent}`} lines={log.lines} busy={busy} height={430} />
        </div>
      </div>
      {state.report && <ReportView key={state.report.at} analysis={ANALYSES.find((a) => a.id === state.report!.analysisId)!} />}
      {state.delivered && <DeliveredView />}
    </div>
  );
}

function Seg<T extends string>({ label, options, value, onChange, disabled }: { label: string; options: readonly T[]; value: T; onChange: (v: T) => void; disabled?: boolean }) {
  return (
    <div className="seg">
      <small className="mono">{label}</small>
      <div className="seg-opts">
        {options.map((o) => (
          <button key={o} className={o === value ? "on" : ""} onClick={() => onChange(o)} disabled={disabled}>
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

function Limit({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="limit">
      <div className="row between">
        <small>{label}</small>
        <b className="mono">{value} HBAR</b>
      </div>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}

function ReportView({ analysis }: { analysis: Analysis }) {
  const { state } = useStore();
  const r = state.report!;
  return (
    <Panel
      label="INSIGHT REPORT · DELIVERED ENCRYPTED TO MERCHANT"
      className="report appear"
      aside={
        <span className="row gap-s">
          <SponsorTag who="0G" />
          <SponsorTag who="HEDERA" />
          <SponsorTag who="ARKIV" />
        </span>
      }
    >
      <h2 className="report-q">{analysis.question}</h2>
      <div className="row gap-s wrap">
        <Chip tone="gold">cohort {cohortBucket(r.cohort)}</Chip>
        <Chip>k_min {PRIVACY.kMin}</Chip>
        <Chip>ε {PRIVACY.epsilon.toFixed(1)}</Chip>
        <Chip>one vote per user</Chip>
        <Chip>no verbatim quotes</Chip>
      </div>
      <div className="report-grid">
        <div className="themes">
          {analysis.themes.map((t, i) => (
            <div className="theme" key={t.name} style={{ ["--i" as string]: i }}>
              <div className="row between">
                <span>{t.name}</span>
                <b className="mono">
                  {t.share}% <small>±3</small>
                </b>
              </div>
              <div className="theme-bar">
                <i style={{ ["--w" as string]: `${t.share * 2.2}%` }} />
              </div>
            </div>
          ))}
          <blockquote>
            “{analysis.quote}”<small>SYNTHETIC — generated from the theme label, not said by any user</small>
          </blockquote>
        </div>
        <div className="report-side">
          <span className="eyebrow">RECOMMENDED</span>
          <ol className="actions">
            {analysis.actions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ol>
          <span className="eyebrow">PROOF</span>
          <div className="proofs">
            {r.requestIds.map((id, i) => (
              <div key={id}>
                <small className="mono">0G {i < 3 ? `label ${i + 1}` : i === 3 ? "themes" : "report"}</small>
                <Hash value={id} head={14} tail={4} />
              </div>
            ))}
            <div>
              <small className="mono">x402 payment</small>
              <Hash value={r.paymentTx} head={14} tail={6} />
            </div>
            <div>
              <small className="mono">arkiv receipt</small>
              <Hash value={r.receiptTx} />
            </div>
            <div>
              <small className="mono">hcs log</small>
              <span className="mono small">
                {ACCOUNTS.hcsTopic} #{r.hcsSeq}
              </span>
            </div>
          </div>
        </div>
      </div>
    </Panel>
  );
}

function DeliveredView() {
  const { state } = useStore();
  const d = state.delivered!;
  return (
    <Panel label="RECORD · SEALED TO BUYER KEY · WATERMARKED" className="appear">
      <div className="delivered">
        <div className="sealed-list">
          <div>
            <small className="mono">listing</small>
            <span>{d.listingId}</span>
          </div>
          <div>
            <small className="mono">pseudonym (buyer-scoped)</small>
            <span className="mono">psn_{d.psn}</span>
          </div>
          <div>
            <small className="mono">payment</small>
            <Hash value={d.paymentTx} head={14} tail={6} />
          </div>
        </div>
        <div className="excerpts">
          {d.excerpts.map((e) => (
            <p key={e}>“{e}”</p>
          ))}
          <small className="muted">Placeholders rewritten with this buyer's tokens — a leaked copy traces back here.</small>
        </div>
      </div>
    </Panel>
  );
}
