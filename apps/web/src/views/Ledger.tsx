import { useEffect, useState } from "react";
import { Button, Chip, Console, CountUp, Hash, PageHead, Panel, SponsorTag, useLog } from "../components/ui";
import { ACCOUNTS, PRIVACY } from "../config";
import { ago, evmHash, hbar, hederaTxId, hex, short, sleep } from "../lib";
import { pendingEarnings, useStore, type ReceiptKind } from "../store";

const KIND_LABEL: Record<ReceiptKind, string> = {
  listing: "LISTING",
  consent: "CONSENT",
  revoke: "REVOKE",
  sale: "SALE",
  insight: "INSIGHT",
  payout: "PAYOUT",
};

export function Ledger() {
  const { state, update, addReceipt } = useStore();
  const payLog = useLog();
  const [paying, setPaying] = useState(false);
  const [proof, setProof] = useState<string[] | null>(null);
  const [, tick] = useState(0);
  const pending = pendingEarnings(state);

  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 15000);
    return () => clearInterval(t);
  }, []);

  async function payout() {
    setPaying(true);
    const p = payLog.push;
    p("derive balances · Σ dm.sale ×0.8 + Σ receipt shares − Σ dm.payout (read from Arkiv)", "arkiv");
    await sleep(900);
    const accounts = 37 + Math.floor(Math.random() * 12);
    p(`batch #42 · ${accounts} accounts ≥ minimum · mixed sales + insights (unlinkable to any report)`, "dim");
    await sleep(700);
    const sched = `0.0.${6011800 + Math.floor(Math.random() * 900)}`;
    p(`ScheduleCreateTransaction(TransferTransaction × ${accounts}) → schedule ${sched}`, "pay");
    await sleep(1000);
    p("treasury signature 1/1 ✓ → schedule executes", "pay");
    await sleep(1100);
    const tx = hederaTxId(ACCOUNTS.treasury);
    p(
      <>
        executed · <Hash value={tx} head={18} tail={6} />
      </>,
      "pay",
    );
    await sleep(600);
    const arkivTx = evmHash();
    p(
      <>
        arkiv dm.payout · sealed_lines · tx <Hash value={arkivTx} />
      </>,
      "arkiv",
    );
    if (!payLog.alive.current) return;
    const total = 14 + Math.random() * 8 + pending;
    update((s) => ({ ...s, earnings: { ...s.earnings, paid: s.earnings.sales + s.earnings.insights } }));
    addReceipt({ kind: "payout", title: `Batch #42 · ${accounts} accounts · schedule ${sched}`, chain: "hedera", tx, amount: Number(total.toFixed(2)), mine: pending > 0 });
    p(`your line: ${hbar(pending)} HBAR → 0.0.7123456`, "ok");
    setPaying(false);
  }

  async function verify() {
    setProof([]);
    const r = state.report!;
    for (let i = 0; i < 6; i++) {
      await sleep(320);
      setProof((ps) => [...(ps ?? []), i === 5 ? r.contributorsRoot : `0x${hex(32)}`]);
    }
  }

  const rows = [...state.receipts].sort((a, b) => b.at - a.at);
  const r = state.report;

  return (
    <div className="page">
      <PageHead
        eyebrow="// 03 · PUBLIC LEDGER"
        title={
          <>
            Every sale, every report — <em>auditable.</em>
          </>
        }
        sub="Receipts are read straight from Arkiv. Anyone can check that no report used a cohort below k_min — without learning who was in it."
      />
      <div className="ledger-grid">
        <div className="stack">
          <Panel label="PRIYA · EARNINGS" aside={<small className="mono muted">proved with listing control key</small>}>
            <div className="earn big">
              <b>
                <CountUp value={pending} decimals={4} /> <span>HBAR pending</span>
              </b>
            </div>
            <div className="breakdown">
              <div>
                <small>Record sales · 80%</small>
                <b className="mono">{hbar(state.earnings.sales)}</b>
              </div>
              <div>
                <small>Insight shares</small>
                <b className="mono">{hbar(state.earnings.insights)}</b>
              </div>
              <div>
                <small>Paid out</small>
                <b className="mono">{hbar(state.earnings.paid)}</b>
              </div>
            </div>
            <div className="row between wrap gap-s">
              <span className="row gap-s">
                <SponsorTag who="HEDERA" />
                <small className="muted">Scheduled Transactions · daily batch</small>
              </span>
              <Button onClick={() => void payout()} disabled={paying}>
                {paying ? "Scheduling…" : "Run payout batch"}
              </Button>
            </div>
            {payLog.lines.length > 0 && <Console title="payouts · treasury" lines={payLog.lines} busy={paying} height={200} />}
          </Panel>
          <Panel label="WAS I COUNTED?">
            {r?.includesPriya ? (
              <>
                <p className="muted">
                  Merkle proof against <span className="mono">contributors_root</span> on the {r.analysisId} receipt. Only you receive this proof.
                </p>
                {proof ? (
                  <div className="merkle">
                    {proof.map((h, i) => (
                      <div key={i} className={`merkle-row${i === 5 ? " root" : ""}`} style={{ ["--i" as string]: i }}>
                        <small className="mono">{i === 5 ? "root" : `level ${i}`}</small>
                        <span className="mono">{short(h, 14, 8)}</span>
                        {i === 5 && <Chip tone="ok">matches receipt ✓</Chip>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <Button variant="ghost" onClick={() => void verify()}>
                    Verify inclusion
                  </Button>
                )}
              </>
            ) : (
              <p className="muted">Run an analysis with Priya's insights consent on, then verify her inclusion here.</p>
            )}
          </Panel>
        </div>
        <Panel
          label="RECEIPTS · LIVE FROM ARKIV"
          aside={
            <span className="row gap-s">
              <i className="pulse" />
              <small className="mono muted">writer {short(ACCOUNTS.arkivWriter)}</small>
            </span>
          }
        >
          <div className="receipts">
            {rows.map((x) => (
              <div key={x.id} className={`receipt k-${x.kind}${x.mine ? " mine" : ""}`}>
                <span className="r-kind mono">{KIND_LABEL[x.kind]}</span>
                <span className="r-title">
                  {x.title}
                  {x.mine && <small> · Priya</small>}
                </span>
                <span className="r-chain mono">{x.chain}</span>
                <Hash value={x.tx} head={x.chain === "hedera" ? 12 : 8} tail={4} />
                <span className="r-amt mono">{x.amount ? `${hbar(x.amount)} ℏ` : "—"}</span>
                <span className="r-at mono">{ago(x.at)}</span>
              </div>
            ))}
          </div>
          <div className="query mono">
            <small>RUNNABLE QUERY</small>
            <code>{`select().from(dm.insight_receipt).createdBy(${short(ACCOUNTS.arkivWriter)}).where(gte("k_min", ${PRIVACY.kMin}))`}</code>
          </div>
        </Panel>
      </div>
    </div>
  );
}
