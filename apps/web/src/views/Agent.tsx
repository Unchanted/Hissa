import { useState } from "react";
import { Button, Chip, Console, CountUp, Hash, PageHead, Panel, SponsorTag, useLog } from "../components/ui";
import { CONTACT_MESSAGE, SIM_THEMES, OTHER_RECORDS, PRIYA_RECORD, REQUEST_EXAMPLES, matches, parseRequest, type Filters, type MarketRecord } from "../demo-data";
import { ACCOUNTS, AGENT_DEFAULTS, PRICES, SELLER_SHARE } from "../config";
import { evmHash, hbar, hederaTxId, isoWeek, ogRequestId, sleep } from "../lib";
import { useStore, type State } from "../store";
import { ApiError, api, useLive } from "../live";
import { TxModal, type RunTx } from "../components/TxModal";
import { ZG_NOTE, teeLabel, toFilters } from "../zerog";

type CardState = "locked" | "buying" | "owned";
type Analysis = { themes: { name: string; share_pct: number }[]; bucket: string; reqIds: string[]; tee: boolean; simulated: boolean };
type Card = MarketRecord & { state: CardState; paymentTx?: string; href?: string };

function marketFor(s: State): MarketRecord[] {
  const week = isoWeek();
  const others = OTHER_RECORDS.map((r, i) => ({ ...r, key: `0x${(i + 7).toString(16).repeat(64)}`, week }));
  const l = s.listing;
  if (!l || !l.live || !l.consentSale) return others;
  // Public tags come from the seller's real 0G analysis when there was one.
  const tags = s.upload && { signals: s.upload.signals.length ? s.upload.signals : PRIYA_RECORD.signals, events: s.upload.events.length ? s.upload.events : PRIYA_RECORD.events };
  return [{ ...PRIYA_RECORD, ...tags, listingId: l.listingId, key: l.entityKey, week, contactOk: l.consentContact }, ...others];
}

const FILTER_LABEL: Record<keyof Filters, string> = { domain: "domain", age: "age", region: "region", event: "behaviour" };

export function Agent() {
  const { state, update, addReceipt } = useStore();
  const [q, setQ] = useState(REQUEST_EXAMPLES[0]!);
  const [budget, setBudget] = useState(AGENT_DEFAULTS.budget);
  const [filters, setFilters] = useState<{ f: Filters; req: string; real: boolean } | null>(null);
  const [msg, setMsg] = useState(CONTACT_MESSAGE);
  const [busy, setBusy] = useState(false);
  const [cards, setCards] = useState<Card[]>(() => state.bought.map((b) => ({ ...b, state: "owned" as const })));
  const log = useLog();
  const { live, zg, refresh } = useLive();
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [showTx, setShowTx] = useState(false);
  const txs: RunTx[] = [
    ...state.bought.map((b) => ({ label: `Record ${b.listingId}`, txId: b.paymentTx, href: b.href, amount: PRICES.record })),
    ...(state.contact ? [{ label: `Telegram message → ${state.contact.listingId}`, txId: state.contact.paymentTx, href: state.contact.href, amount: PRICES.contact }] : []),
  ];
  const left = budget - state.spent;

  const owned = cards.filter((c) => c.state === "owned");
  const reachable = owned.filter((c) => c.contactOk);

  async function find() {
    if (busy) return;
    setBusy(true);
    log.clear();
    const p = log.push;
    let spent = state.spent;
    let seq = state.hcsSeq;
    const have = new Set(state.bought.map((b) => b.listingId));

    p("0g · turn request into filters · sealed in TEE", "og");
    let parsed: { f: Filters; req: string; real: boolean } | null = null;
    if (zg) {
      try {
        const r = await api.parseRequest(q);
        parsed = { f: toFilters(q, r.filters), req: r.receipt.request_id, real: true };
        p(`filters ready · ${teeLabel(r.receipt)} · ${r.receipt.latency_ms} ms`, "og");
        addReceipt({ kind: "inference", title: `request → filters · ${teeLabel(r.receipt)}`, chain: "0g", tx: r.receipt.request_id });
      } catch (e) {
        p(`0G unavailable · ${(e as Error).message} · keyword filters`, "warn");
      }
    }
    if (!parsed) {
      await sleep(1100);
      parsed = { f: parseRequest(q), req: ogRequestId(), real: false };
    }
    const f = parsed.f;
    setFilters(parsed);
    const market = marketFor(state).filter((r) => matches(r, f));
    p(`arkiv.query dm.listing · consent_sale=true ∧ domain="${f.domain}" → ${market.length} listings`, "arkiv");
    await sleep(800);
    if (!market.length) {
      p("no sellers match yet · nothing spent", "warn");
      setCards([]);
      setBusy(false);
      return;
    }
    const keep = state.bought.filter((b) => !market.some((m) => m.listingId === b.listingId));
    setCards([
      ...market.map((r) => {
        const had = state.bought.find((b) => b.listingId === r.listingId);
        return { ...r, state: (had ? "owned" : "locked") as CardState, paymentTx: had?.paymentTx, href: had?.href };
      }),
      ...keep.map((b) => ({ ...b, state: "owned" as const })),
    ]);
    await sleep(600);

    const toBuy = market.filter((r) => !have.has(r.listingId)).slice(0, AGENT_DEFAULTS.maxRecords);
    if (!toBuy.length) p("already own every match", "dim");
    for (const r of toBuy) {
      if (!log.alive.current) return;
      if (PRICES.record > AGENT_DEFAULTS.perPurchase || spent + PRICES.record > budget) {
        p(`budget limit · skip ${r.listingId}`, "warn");
        continue;
      }
      setCards((cs) => cs.map((c) => (c.listingId === r.listingId ? { ...c, state: "buying" } : c)));
      p(`GET /records/${r.listingId} ← 402 · pay ${PRICES.record} ℏ`, "pay");
      let tx: string;
      let href: string | undefined;
      if (live) {
        try {
          const paid = await api.buy(r.listingId, budget - spent);
          tx = paid.txId;
          href = paid.hashscan;
        } catch (e) {
          if (e instanceof ApiError) {
            p(`← ${e.status} · ${e.message} · not charged`, "err");
            setCards((cs) => cs.map((c) => (c.listingId === r.listingId ? { ...c, state: "locked" } : c)));
            continue;
          }
          p("API unreachable · simulated", "warn");
          tx = hederaTxId(ACCOUNTS.agent);
        }
      } else {
        await sleep(950);
        tx = hederaTxId(ACCOUNTS.agent);
      }
      spent += PRICES.record;
      seq += 1;
      p(
        <>
          settled on Hedera <Hash value={tx} head={14} tail={4} href={href} /> · unlocked
        </>,
        "ok",
      );
      setCards((cs) => cs.map((c) => (c.listingId === r.listingId ? { ...c, state: "owned", paymentTx: tx, href } : c)));
      update((s) => ({
        ...s,
        spent: s.spent + PRICES.record,
        hcsSeq: seq,
        bought: [...s.bought, { ...r, paymentTx: tx, href }],
        earnings: r.priya ? { ...s.earnings, sales: s.earnings.sales + PRICES.record * SELLER_SHARE } : s.earnings,
      }));
      addReceipt({ kind: "sale", title: `${r.listingId} · silver`, chain: "hedera", tx, amount: PRICES.record, href });
      await sleep(300);
    }
    if (live) refresh();

    // 04 · private analysis inside a 0G TEE (anonymised: k ≥ 50, noised, no quotes)
    if (state.bought.length + toBuy.length > 0 && log.alive.current) {
      p("0g · private analysis in TEE · consented cohort, k ≥ 50, noised", "og");
      let a: Analysis | null = null;
      if (zg) {
        try {
          const r = await api.insight();
          if (r.status === "ok") {
            a = { themes: r.themes, bucket: r.cohort_bucket, reqIds: r.receipts.map((x) => x.request_id), tee: r.receipts.every((x) => x.tee_verified === true), simulated: false };
            addReceipt({ kind: "inference", title: `cohort report · ${r.receipts.length} sealed calls${a.tee ? " · TEE ✓" : ""}`, chain: "0g", tx: r.receipts[0]?.request_id ?? "" });
          } else p(`refused · ${r.reason}`, "warn");
        } catch (e) {
          p(`0G unavailable · ${(e as Error).message} · simulated`, "warn");
        }
      }
      if (!a) {
        await sleep(1600);
        a = { themes: SIM_THEMES, bucket: "50–99", reqIds: [ogRequestId(), ogRequestId(), ogRequestId()], tee: false, simulated: true };
      }
      setAnalysis(a);
      p(`report ready · ${a.reqIds.length} sealed 0G calls`, "og");
    }
    p(`done · spent ${hbar(spent - state.spent)} ℏ · logged to HCS ${ACCOUNTS.hcsTopic}`, "ok");
    setBusy(false);
  }

  function download() {
    const lines = state.bought.map((b) =>
      JSON.stringify({ listing_id: b.listingId, source: b.source, region: b.region, week: b.week, signals: b.signals, events: b.events, text: b.excerpt, payment_tx: b.paymentTx }),
    );
    const url = URL.createObjectURL(new Blob([lines.join("\n") + "\n"], { type: "application/jsonl" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `hissa-records-${isoWeek()}.jsonl`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function send() {
    if (busy) return;
    setBusy(true);
    const p = log.push;
    let seq = state.hcsSeq;
    for (const c of reachable) {
      p(`POST /contact/${c.listingId} · via ${ACCOUNTS.relayBot}`, "cmd");
      await sleep(800);
      if (state.spent + PRICES.contact > budget) {
        p("budget limit · not sent", "warn");
        continue;
      }
      let tx: string;
      let href: string | undefined;
      if (live) {
        try {
          const paid = await api.contact(c.listingId, msg, budget - state.spent);
          p(`← 402 · paid ${PRICES.contact} ℏ`, "pay");
          tx = paid.txId;
          href = paid.hashscan;
        } catch (e) {
          if (e instanceof ApiError) {
            p(`← ${e.status} · ${e.message} · not charged`, "err");
            continue;
          }
          p("API unreachable · simulated", "warn");
          tx = hederaTxId(ACCOUNTS.agent);
        }
      } else {
        const l = state.listing;
        if (!l || l.listingId !== c.listingId || !l.live || !l.consentContact) {
          p(`← 403 · ${l && !l.live ? "listing revoked" : "consent_contact=false"} · not charged`, "err");
          continue;
        }
        p(`← 402 · pay ${PRICES.contact} ℏ`, "pay");
        await sleep(900);
        tx = hederaTxId(ACCOUNTS.agent);
      }
      seq += 1;
      p(
        <>
          delivered on Telegram ✓ <Hash value={tx} head={14} tail={4} href={href} />
        </>,
        "ok",
      );
      update((s) => ({
        ...s,
        spent: s.spent + PRICES.contact,
        hcsSeq: seq,
        contact: { listingId: c.listingId, paymentTx: tx, href, message: msg, reply: "pending", at: Date.now() },
        earnings: { ...s.earnings, contacts: s.earnings.contacts + PRICES.contact * SELLER_SHARE },
      }));
      addReceipt({ kind: "contact", title: `message → ${c.listingId}`, chain: "hedera", tx, amount: PRICES.contact, href });
    }
    if (live) refresh();
    setBusy(false);
  }

  const ct = state.contact;

  return (
    <div className="page">
      {showTx && <TxModal txs={txs} onClose={() => setShowTx(false)} />}
      <PageHead
        eyebrow="// BUYER — AI COMPANY"
        title={
          <>
            Find the data <em>you need.</em>
          </>
        }
      />

      <Panel label="WHAT ARE YOU LOOKING FOR?" className="request">
        <div className="request-row">
          <input className="request-input" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void find()} disabled={busy} />
          <Button size="lg" onClick={() => void find()} disabled={busy || !q.trim()}>
            {busy ? "Working…" : "Find data"}
          </Button>
        </div>
        <div className="request-meta">
          {REQUEST_EXAMPLES.map((x) => (
            <button key={x} className="example" onClick={() => setQ(x)} disabled={busy}>
              {x}
            </button>
          ))}
          <span className="budget-inline">
            <small className="mono muted">BUDGET</small>
            {[5, 10, 20].map((b) => (
              <button key={b} className={b === budget ? "on" : ""} onClick={() => setBudget(b)} disabled={busy}>
                {b} ℏ
              </button>
            ))}
            <b className="mono">
              <CountUp value={Math.max(0, left)} decimals={2} /> ℏ left
            </b>
          </span>
        </div>
        {filters && (
          <div className="parsed appear">
            <SponsorTag who="0G" />
            {(Object.keys(filters.f) as (keyof Filters)[])
              .filter((k) => filters.f[k])
              .map((k) => (
                <span key={k} className="facet-chip">
                  {FILTER_LABEL[k]}: {filters.f[k]}
                </span>
              ))}
            <Hash value={filters.req} label="req" note={filters.real ? ZG_NOTE : undefined} />
            {!filters.real && <Chip>simulated</Chip>}
          </div>
        )}
      </Panel>

      <div className="buyer-grid">
        <div className="stack">
          <Console title={`agent · ${ACCOUNTS.agent} · pays with x402`} lines={log.lines} busy={busy} height={230} />
          {txs.length > 0 && !busy && (
            <button className="tx-cta appear" onClick={() => setShowTx(true)}>
              <span className="tx-cta-icon">ℏ</span>
              <span>
                <b>View x402 transactions on HashScan</b>
                <small>
                  {txs.length} payment{txs.length === 1 ? "" : "s"} · {txs.reduce((a, t) => a + t.amount, 0)} ℏ · settled on Hedera testnet
                </small>
              </span>
              <span className="tx-cta-go">↗</span>
            </button>
          )}
        </div>
        <Panel label="REACH SELLERS · TELEGRAM" aside={<SponsorTag who="HEDERA" />}>
          {!owned.length ? (
            <p className="muted">Buy records first. Sellers who opted in can be messaged — you never see who they are.</p>
          ) : (
            <div className="outreach">
              <small className="muted">
                {reachable.length} of {owned.length} sellers accept messages · {PRICES.contact} ℏ each
              </small>
              <textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={3} disabled={busy} />
              <Button onClick={() => void send()} disabled={busy || !reachable.length || !msg.trim()}>
                {ct ? "Send follow-up" : `Send to ${reachable.length} seller${reachable.length === 1 ? "" : "s"}`}
              </Button>
              {ct && (
                <div className="thread appear">
                  <span className="mono">seller · {ct.listingId}</span>
                  <Chip tone={ct.reply === "interested" ? "ok" : ct.reply === "ignored" ? "err" : "default"}>
                    {ct.reply === "interested" ? "interested — reply in relay" : ct.reply === "ignored" ? "declined" : "delivered · waiting"}
                  </Chip>
                </div>
              )}
            </div>
          )}
        </Panel>
      </div>

      <div className="records">
        {cards.map((c) => (
          <RecordCard key={c.listingId} c={c} />
        ))}
        {!cards.length && <p className="muted empty">Matching listings from Arkiv appear here.</p>}
      </div>

      {(analysis || state.bought.length > 0) && (
        <div className="delivered-grid appear">
          <Panel label="PRIVATE ANALYSIS" aside={<SponsorTag who="0G" />}>
            {analysis ? (
              <>
                <div className="row gap-s wrap">
                  <Chip tone="gold">cohort {analysis.bucket}</Chip>
                  <Chip>k ≥ 50 · noised</Chip>
                  {analysis.tee && <Chip tone="ok">TEE</Chip>}
                  {analysis.simulated && <Chip>simulated</Chip>}
                </div>
                <div className="themes-mini">
                  {analysis.themes.slice(0, 4).map((t, i) => (
                    <div key={t.name} style={{ ["--i" as string]: i }}>
                      <span>{t.name}</span>
                      <b className="mono">{Math.round(t.share_pct)}%</b>
                      <i style={{ ["--w" as string]: `${Math.min(100, t.share_pct * 2)}%` }} />
                    </div>
                  ))}
                </div>
                <div className="row gap-s wrap">
                  {analysis.reqIds.slice(0, 2).map((id) => (
                    <Hash key={id} value={id} head={10} tail={4} label="req" note={analysis.simulated ? undefined : ZG_NOTE} />
                  ))}
                  {analysis.reqIds.length > 2 && <small className="muted mono">+{analysis.reqIds.length - 2} more</small>}
                </div>
              </>
            ) : (
              <p className="muted">Runs after the agent buys.</p>
            )}
          </Panel>
          <Panel label="DELIVERED">
            <div className="delivered-box">
              <b>{state.bought.length}</b>
              <span>decrypted records for AI training</span>
              <small className="muted">Masked · watermarked to you · paid on Hedera</small>
              <Button onClick={download} disabled={!state.bought.length}>
                Download .jsonl
              </Button>
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}

function RecordCard({ c }: { c: Card }) {
  const open = c.state === "owned";
  return (
    <article className={`record ${c.state}${c.contactOk && open ? " reach" : ""}`}>
      <header>
        <span className="mono">{c.listingId}</span>
        <span className="muted mono small">
          {c.source} · {c.region}
        </span>
      </header>
      <div className="record-body">
        <div className="row gap-s wrap">
          {[...c.signals, ...c.events].map((s) => (
            <Chip key={s} tone={s === "abandoned" ? "warn" : "default"}>
              {s}
            </Chip>
          ))}
        </div>
        <p>“{c.excerpt}”</p>
      </div>
      {!open && (
        <div className="lock">
          <span>{c.state === "buying" ? "Paying…" : `Locked · ${PRICES.record} ℏ`}</span>
        </div>
      )}
      <footer>
        {open && c.paymentTx ? <Hash value={c.paymentTx} head={12} tail={4} label="paid" href={c.href} /> : <span className="muted small">Free preview: tags only</span>}
        {open && c.contactOk && <Chip tone="gold">accepts messages</Chip>}
      </footer>
    </article>
  );
}
