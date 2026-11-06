import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ACCOUNTS } from "../config";

export type RunTx = { label: string; txId: string; href?: string; amount: number };

type MirrorTx = {
  result: string;
  consensus_timestamp: string;
  charged_tx_fee: number;
  name: string;
  transfers: { account: string; amount: number }[];
};

const MIRROR = "https://testnet.mirrornode.hedera.com";
const dashed = (txId: string) => txId.replace(/\?.*$/, "").replace("@", "-").replace(/\.(\d+)$/, "-$1");
const hbar = (tinybars: number) => (tinybars / 1e8).toFixed(tinybars % 1e8 === 0 ? 0 : 4).replace(/\.?0+$/, "");

/** Reads one transaction from the mirror node, retrying while it catches up with consensus. */
function useMirrorTx(txId: string, enabled: boolean) {
  const [tx, setTx] = useState<MirrorTx | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "missing">("loading");
  useEffect(() => {
    if (!enabled) return;
    let stop = false;
    let tries = 0;
    const load = async () => {
      try {
        const res = await fetch(`${MIRROR}/api/v1/transactions/${dashed(txId)}`);
        if (res.ok) {
          const body = (await res.json()) as { transactions?: MirrorTx[] };
          const t = body.transactions?.[0];
          if (t && !stop) {
            setTx(t);
            setState("ok");
            return;
          }
        }
      } catch {
        /* retry */
      }
      if (stop) return;
      if (++tries < 8) setTimeout(load, 2500);
      else setState("missing");
    };
    void load();
    return () => {
      stop = true;
    };
  }, [txId, enabled]);
  return { tx, state };
}

function TxRow({ t }: { t: RunTx }) {
  const real = !!t.href;
  const { tx, state } = useMirrorTx(t.txId, real);
  const moves = tx?.transfers.filter((x) => x.account === ACCOUNTS.agent || x.account === ACCOUNTS.treasury) ?? [];
  const when = tx ? new Date(Number(tx.consensus_timestamp.split(".")[0]) * 1000).toLocaleTimeString("en-GB") : "";

  return (
    <div className="txrow">
      <div className="txrow-head">
        <div>
          <b>{t.label}</b>
          <small className="mono">{t.txId}</small>
        </div>
        <span className="txrow-amt mono">{t.amount} ℏ</span>
      </div>
      {real ? (
        <div className="txrow-body">
          {state === "loading" && <span className="muted small">Reading from the Hedera mirror node…</span>}
          {state === "missing" && <span className="muted small">Not on the mirror node yet — open HashScan in a few seconds.</span>}
          {tx && (
            <dl>
              <dt>Status</dt>
              <dd className={tx.result === "SUCCESS" ? "ok" : "err"}>{tx.result}</dd>
              <dt>Consensus</dt>
              <dd className="mono">
                {when} · {tx.consensus_timestamp}
              </dd>
              {moves.map((m) => (
                <div key={m.account} className="dl-row">
                  <dt>{m.account === ACCOUNTS.agent ? "Buyer agent" : "Treasury"}</dt>
                  <dd className={`mono ${m.amount < 0 ? "err" : "ok"}`}>
                    {m.account} {m.amount > 0 ? "+" : ""}
                    {hbar(m.amount)} ℏ
                  </dd>
                </div>
              ))}
              <dt>Fee paid by</dt>
              <dd className="mono">x402 facilitator · {hbar(tx.charged_tx_fee)} ℏ</dd>
            </dl>
          )}
          <a className="btn btn-primary btn-sm" href={t.href} target="_blank" rel="noreferrer">
            <span>Open on HashScan ↗</span>
          </a>
        </div>
      ) : (
        <div className="txrow-body">
          <span className="muted small">Simulated payment — start the demo API for a real Hedera transaction.</span>
        </div>
      )}
    </div>
  );
}

export function TxModal({ txs, onClose }: { txs: RunTx[]; onClose: () => void }) {
  useEffect(() => {
    const on = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", on);
    return () => removeEventListener("keydown", on);
  }, [onClose]);
  const total = txs.reduce((s, t) => s + t.amount, 0);

  return createPortal(
    <div className="modal-back" onClick={onClose}>
      <div className="modal" role="dialog" aria-label="x402 transactions" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <div>
            <span className="eyebrow">x402 · HEDERA TESTNET</span>
            <h3>
              {txs.length} payment{txs.length === 1 ? "" : "s"} · {total} ℏ · no human approval
            </h3>
          </div>
          <button className="btn-icon" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>
        <div className="modal-body">
          {txs.map((t) => (
            <TxRow key={t.txId} t={t} />
          ))}
        </div>
        <footer className="modal-foot">
          <a className="link-btn" href={`https://hashscan.io/testnet/account/${ACCOUNTS.agent}`} target="_blank" rel="noreferrer">
            Buyer agent account ↗
          </a>
          <a className="link-btn" href={`https://hashscan.io/testnet/topic/${ACCOUNTS.hcsTopic}`} target="_blank" rel="noreferrer">
            HCS payment log ↗
          </a>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
