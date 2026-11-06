import { useEffect, useState } from "react";
import { Hash, PageHead, Panel, SponsorTag } from "../components/ui";
import { ZG_NOTE } from "../zerog";
import { ACCOUNTS } from "../config";
import { ago, hbar, short } from "../lib";
import { useStore, type ReceiptKind } from "../store";

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
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 15000);
    return () => clearInterval(t);
  }, []);
  const rows = [...state.receipts].sort((a, b) => b.at - a.at);

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
            <small className="mono muted">writer {short(ACCOUNTS.arkivWriter)}</small>
          </span>
        }
      >
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
