import { ACCOUNTS, PRICES, SELLER_SHARE } from "../config";
import { hbar } from "../lib";
import { useStore } from "../store";

/** Priya's Telegram: what the relay bot delivers to the seller. */
export function Phone() {
  const { state, update } = useStore();
  const ct = state.contact;
  const reply = (r: "interested" | "ignored") => update((s) => (s.contact ? { ...s, contact: { ...s.contact, reply: r } } : s));

  return (
    <div className="phone">
      <div className="phone-bar">
        <span className="tg-avatar">H</span>
        <div>
          <b>Hissa Relay</b>
          <small>{ACCOUNTS.relayBot} · Telegram</small>
        </div>
      </div>
      <div className="phone-body">
        {!ct && <p className="phone-empty">No messages yet</p>}
        {ct && (
          <>
            <div className="tg-msg bot">
              <small>
                A buyer paid you <b>{hbar(PRICES.contact * SELLER_SHARE)} ℏ</b> to send this. They can't see your handle.
              </small>
              <p>{ct.message}</p>
            </div>
            {ct.reply === "pending" ? (
              <div className="tg-actions">
                <button onClick={() => reply("interested")}>Interested</button>
                <button onClick={() => reply("ignored")}>Not now</button>
              </div>
            ) : (
              <>
                <div className="tg-msg me">{ct.reply === "interested" ? "Interested" : "Not now"}</div>
                <div className="tg-msg bot">
                  <small>{ct.reply === "interested" ? "Sent. They can reply here — your handle stays hidden." : "Declined. They won't learn who you are."}</small>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
