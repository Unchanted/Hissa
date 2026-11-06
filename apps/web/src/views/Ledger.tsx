import { useEffect, useState } from "react";
import { Hash, PageHead, Panel, SponsorTag } from "../components/ui";
import { ZG_NOTE } from "../zerog";
import { ACCOUNTS } from "../config";
import { ago, hbar, short } from "../lib";
import { api, useLive } from "../live";
import { useStore, type Receipt, type ReceiptKind } from "../store";

const KIND_LABEL: Record<ReceiptKind, string> = {
  listing: "LISTING",
  consent: "CONSENT",
  revoke: "REVOKE",
  sale: "SALE",
  contact: "MESSAGE",
  payout: "PAYOUT",
  inference: "0G TEE",
};

/** Public audit page: anyone can read it. No names, no handles — listing IDs and transactions only. */
export function Ledger() {
  const { state } = useStore();
  const { live, arkivConfig } = useLive();
  const [liveRows, setLiveRows] = useState<Receipt[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!live) return;
    let active = true;
    const load = () => api.receipts().then(({ items }) => {
      if (!active) return;
      setLiveRows(items.map((item) => ({ ...item, at: typeof item.at === "number" ? item.at : new Date(item.at).getTime() })));
      setError("");
    }, (cause: Error) => {
      if (!active) return;
      setLiveRows([]);
      setError(cause.message);
    });
    void load();
    const timer = setInterval(() => void load(), 15000);
    return () => { active = false; clearInterval(timer); };
  }, [live]);
  const rows = [...(live ? liveRows : state.receipts)].sort((a, b) => b.at - a.at);

  return (
    <div className="page">
      <PageHead
        eyebrow="// PUBLIC LEDGER — ANYONE CAN AUDIT"
        title={
          <>
            Every payment, <em>on chain.</em> No names.
          </>
        }
      />
      <Panel
        label="RECEIPTS"
        aside={
          <span className="row gap-s">
            <SponsorTag who="ARKIV" />
            <SponsorTag who="HEDERA" />
            <SponsorTag who="0G" />
            <i className="pulse" />
            <small className="mono muted">writer {short(arkivConfig?.writer ?? ACCOUNTS.arkivWriter)}</small>
          </span>
        }
      >
        {error && <p className="muted" role="alert">Could not load chain receipts: {error}</p>}
        <div className="receipts">
          {rows.map((x) => (
            <div key={x.id} className={`receipt k-${x.kind}`}>
              <span className="r-kind mono">{KIND_LABEL[x.kind]}</span>
              <span className="r-title">{x.title}</span>
              <Hash value={x.tx} head={x.chain === "hedera" ? 12 : 8} tail={4} href={x.href} note={x.chain === "0g" ? ZG_NOTE : undefined} />
              <span className="r-amt mono">{x.amount ? `${hbar(x.amount)} ℏ` : "—"}</span>
              <span className="r-at mono">{ago(x.at)}</span>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
