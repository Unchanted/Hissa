import { useState } from "react";
import { Button, Chip, Console, CountUp, Hash, PageHead, Panel, SponsorTag, useLog } from "../components/ui";
import { CONTACT_MESSAGE, OTHER_RECORDS, PRIYA_RECORD, REQUEST_EXAMPLES, matches, parseRequest, type Filters, type MarketRecord } from "../demo-data";
import { ACCOUNTS, AGENT_DEFAULTS, PRICES, SELLER_SHARE } from "../config";
import { hbar, hederaTxId, isoWeek, sleep } from "../lib";
import { useStore, type State } from "../store";
import { api, useLive, type PublicListing } from "../live";
import { TxModal, type RunTx } from "../components/TxModal";
import { Insights } from "./Insights";
import { DOMAINS, ZG_NOTE, band, teeLabel } from "../zerog";

type Mode = "insights" | "records";
const MODES: { id: Mode; title: string; sub: string; points: string[] }[] = [
  {
    id: "insights",
    title: "Validate an idea",
    sub: "Anonymised analytics",
    points: ["Test a business idea against what real people say", "Patterns and shares, never a person or a quote", `${PRICES.insight} ℏ per report · 80% to the people counted`],
  },
  {
    id: "records",
    title: "Buy training data",
    sub: "Pseudonymised records",
    points: ["Masked chat records for training or evaluating agents", "Only sellers who consented to sale · revocable", `${PRICES.record} ℏ per record · 80% to the seller`],
  },
];

type CardState = "locked" | "buying" | "owned";
type Card = MarketRecord & { state: CardState; paymentTx?: string; href?: string };

function marketFor(s: State): MarketRecord[] {
  const week = isoWeek();
  const others = OTHER_RECORDS.map((r, i) => ({ ...r, key: `0x${(i + 7).toString(16).repeat(64)}`, week }));
  const mine = s.listings.filter((l) => l.live && l.consentSale);
  if (!mine.length) return others;
  return [...mine.map((l) => ({ ...PRIYA_RECORD, listingId: l.listingId, key: l.entityKey, week, contactOk: l.consentContact })), ...others];
}

const FILTER_LABEL: Record<keyof Filters, string> = { domain: "domain", age: "age", region: "region", event: "behaviour" };

export function Agent() {
  const { state, update, addReceipt } = useStore();
  const [q, setQ] = useState(REQUEST_EXAMPLES[0]!);
  const [budget, setBudget] = useState(AGENT_DEFAULTS.budget);
  const [filters, setFilters] = useState<{ f: Filters; req?: string; tee?: boolean } | null>(null);
  const [mode, setMode] = useState<Mode>("insights");
  const [msg, setMsg] = useState(CONTACT_MESSAGE);
  const [busy, setBusy] = useState(false);
  const [cards, setCards] = useState<Card[]>(() => state.bought.map((b) => ({ ...b, state: "owned" as const })));
  const log = useLog();
  const { live, zg, refresh } = useLive();
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
    if (!live) { log.clear(); log.push("Marketplace API unavailable; no discovery or payment was attempted.", "err"); return; }
    setBusy(true);
    log.clear();
    const p = log.push;
    let spent = state.spent;
    let seq = state.hcsSeq;
    const have = new Set(state.bought.map((b) => b.listingId));

    let f: Filters;
    if (zg) {
      p("0g · turn request into filters · sealed in TEE", "og");
      try {
        const r = await api.parseRequest(q, "records");
        f = { domain: r.filters.domain, age: r.filters.age && band(r.filters.age), region: r.filters.region, event: r.filters.event };
        setFilters({ f, req: r.receipt.request_id, tee: r.receipt.tee_verified === true || r.receipt.e2ee === "sealed" });
        addReceipt({ kind: "inference", title: `request → filters · ${teeLabel(r.receipt)}`, chain: "0g", tx: r.receipt.request_id });
        p(`filters ready · ${teeLabel(r.receipt)} · ${r.receipt.latency_ms} ms`, "og");
      } catch (cause) {
        f = parseRequest(q);
        setFilters({ f });
        p(`0G unavailable · ${(cause as Error).message} · keyword filters`, "warn");
      }
    } else {
      f = parseRequest(q);
      setFilters({ f });
      p("0G not configured · keyword filters", "warn");
    }
    if (!(DOMAINS as readonly string[]).includes(f.domain)) f = { ...f, domain: "other" };
    let market: MarketRecord[];
    if (live) {
      try {
        const rows: PublicListing[] = [];
        let cursor: string | undefined;
        for (let page = 0; page < 20; page += 1) {
          const result = await api.listings({ domain: f.domain, region: f.region, cursor });
          rows.push(...result.items);
          cursor = result.next;
          if (!cursor) break;
        }
        market = rows.map((r) => ({ key: r.key, listingId: r.listingId, source: r.source, region: r.region, week: r.week, contactOk: r.contactOk, signals: r.signals, events: r.events, excerpt: r.excerpt, priya: r.priya }));
        if (cursor) throw new Error("Arkiv discovery exceeds 20 pages; narrow the request.");
      } catch (cause) {
        p(`Arkiv discovery failed · ${(cause as Error).message}`, "err");
        setCards([]);
        setBusy(false);
        return;
      }
    } else {
      market = marketFor(state).filter((r) => matches(r, f));
    }
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
        return { ...r, ...(had ?? {}), state: (had ? "owned" : "locked") as CardState, paymentTx: had?.paymentTx, href: had?.href };
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
      let delivered = r;
      if (live) {
        try {
          const paid = await api.buy(r.listingId, budget - spent);
          // The agent's own spending-policy check (per-purchase, run and daily caps), run on the server before it signs.
          for (const line of paid.policy ?? []) p(line, "dim");
          tx = paid.txId;
          href = paid.hashscan;
          delivered = paid.record ? { ...r, ...paid.record } : { ...r, signals: [], events: [], excerpt: "" };
        } catch (cause) {
          p(`Purchase failed · ${(cause as Error).message} · check the ledger before retrying`, "err");
          setCards((cs) => cs.map((c) => (c.listingId === r.listingId ? { ...c, state: "locked" } : c)));
          continue;
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
      setCards((cs) => cs.map((c) => (c.listingId === r.listingId ? { ...delivered, state: "owned", paymentTx: tx, href } : c)));
      update((s) => ({
        ...s,
        spent: s.spent + PRICES.record,
        hcsSeq: seq,
        bought: [...s.bought, { ...delivered, paymentTx: tx, href }],
        earnings: delivered.priya ? { ...s.earnings, sales: s.earnings.sales + PRICES.record * SELLER_SHARE } : s.earnings,
      }));
      addReceipt({ kind: "sale", title: `${r.listingId} · silver`, chain: "hedera", tx, amount: PRICES.record, href });
      await sleep(300);
    }
    if (live) refresh();

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
    if (!live) { log.push("Marketplace API unavailable; no message payment was attempted.", "err"); return; }
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
          p(`Message payment failed · ${(e as Error).message} · check the ledger before retrying`, "err");
          continue;
        }
      } else {
        const l = state.listings.find((x) => x.listingId === c.listingId);
        if (!l || !l.live || !l.consentContact) {
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
            Ask real people's data <em>a question.</em>
          </>
        }
        sub="Two ways to buy. Your agent pays on Hedera with x402, within its budget, and the people behind the data get 80%."
        aside={
          <span className="budget-inline">
            <small className="mono muted">AGENT BUDGET</small>
            {[5, 10, 20].map((b) => (
              <button key={b} className={b === budget ? "on" : ""} onClick={() => setBudget(b)} disabled={busy}>
                {b} ℏ
              </button>
            ))}
            <b className="mono">
              <CountUp value={Math.max(0, left)} decimals={2} /> ℏ left
            </b>
          </span>
        }
      />

      <div className="mode-switch" role="tablist">
        {MODES.map((m) => (
          <button key={m.id} role="tab" aria-selected={mode === m.id} className={`mode-card${mode === m.id ? " on" : ""}`} onClick={() => setMode(m.id)} disabled={busy}>
            <span className="mode-sub mono">{m.sub}</span>
            <b>{m.title}</b>
            <ul>
              {m.points.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </button>
        ))}
      </div>

      {mode === "insights" ? (
        <Insights budgetLeft={left} onSpent={(h) => update((s) => ({ ...s, spent: s.spent + h }))} />
      ) : (
      <>

      <Panel label="WHAT DATA DO YOU NEED?" className="request">
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
            {filters.req ? <Hash value={filters.req} label="req" note={ZG_NOTE} /> : <Chip>keyword fallback · not 0G</Chip>}
            {filters.tee && <Chip tone="ok">sealed in TEE ✓</Chip>}
            <small className="muted">Arkiv filters on domain{filters.f.region ? " and region" : ""}</small>
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

      {state.bought.length > 0 && (
        <div className="delivered-grid appear">
          <Panel label="NEED THE PATTERN, NOT THE PEOPLE?" aside={<SponsorTag who="0G" />}>
            <p className="muted">
              Records show individual voices. To test an idea across 50+ people without seeing any of them, ask for an anonymised report: 0G analyses it inside a TEE and only noised shares come out.
            </p>
            <Button variant="ghost" onClick={() => setMode("insights")}>
              Validate an idea →
            </Button>
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
      </>
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
        <p>“{c.excerpt.length > 420 ? `${c.excerpt.slice(0, 400)}…` : c.excerpt}”</p>
        {c.excerpt.length > 420 && <small className="muted mono">+{(c.excerpt.length - 400).toLocaleString("en-IN")} more characters in the .jsonl download</small>}
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
