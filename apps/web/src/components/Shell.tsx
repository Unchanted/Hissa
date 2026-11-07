import { useEffect, useState } from "react";
import { ACCOUNTS, BRAND, SHOW_DEVANAGARI, SHOW_SIM_BADGE, START_BALANCE, hashscanAccount } from "../config";
import { HissaMark } from "./HissaMark";
import { useLive } from "../live";
import { useStore } from "../store";

export type Route = "" | "seller" | "agent" | "ledger";
const ROUTES: Route[] = ["", "seller", "agent", "ledger"];

export function useRoute(): Route {
  const read = (): Route => {
    const r = location.hash.replace(/^#\/?/, "") as Route;
    return ROUTES.includes(r) ? r : "";
  };
  const [route, setRoute] = useState<Route>(read);
  useEffect(() => {
    const on = () => {
      setRoute(read());
      scrollTo({ top: 0 });
    };
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);
  return route;
}


const LINKS: { id: Route; label: string }[] = [
  { id: "seller", label: "Seller" },
  { id: "agent", label: "Buyer" },
  { id: "ledger", label: "Public Ledger" },
];

export function Nav({ route }: { route: Route }) {
  const { reset } = useStore();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(scrollY > 24);
    on();
    addEventListener("scroll", on, { passive: true });
    return () => removeEventListener("scroll", on);
  }, []);

  return (
    <header className={`nav${scrolled || route ? " solid" : ""}`}>
      <a href="#/" className="logo" aria-label={`${BRAND.name} home`}>
        <HissaMark size={38} dots={260} />
        <span className="logo-word">
          <span className="logo-name">
            <b>{BRAND.name}</b>
            {SHOW_DEVANAGARI && <span className="logo-deva" lang="hi">{BRAND.devanagari}</span>}
          </span>
          <small>{BRAND.tagline}</small>
        </span>
      </a>
      <nav className="nav-links">
        {LINKS.map((l, i) => (
          <a key={l.id} href={`#/${l.id}`} className={route === l.id ? "active" : ""}>
            <span className="idx">0{i + 1}</span>
            {l.label}
          </a>
        ))}
      </nav>
      <div className="nav-right">
        {route === "" ? (
          <a className="btn btn-dark" href="#/seller">
            <span>Launch App</span>
          </a>
        ) : (
          <>
            <AccountPill route={route} />
            <ModeBadge />
            <button className="btn-icon" title="Reset demo" onClick={reset}>
              ↺
            </button>
          </>
        )}
      </div>
    </header>
  );
}

/** Presenter aid: always shows the next step of the demo path. Toggle with the ` key. */
export function DemoGuide({ route }: { route: Route }) {
  const { state } = useStore();
  const [open, setOpen] = useState(true);
  useEffect(() => {
    const on = (e: KeyboardEvent) => e.key === "`" && setOpen((o) => !o);
    addEventListener("keydown", on);
    return () => removeEventListener("keydown", on);
  }, []);
  if (!open) return null;

  const l = state.listing;
  const ct = state.contact;
  let step: { n: number; text: string; href: Route };
  if (!l) step = { n: 1, text: "Seller: publish Priya's chat", href: "seller" };
  else if (!state.bought.length) step = { n: 2, text: "Buyer: describe what you need, find data", href: "agent" };
  else if (!ct && l.live && l.consentContact) step = { n: 3, text: "Buyer: message sellers on Telegram", href: "agent" };
  else if (ct?.reply === "pending") step = { n: 4, text: "Seller: answer on Priya's Telegram", href: "seller" };
  else if (l.live) step = { n: 5, text: "Seller: revoke, then buyer sends a follow-up", href: "seller" };
  else step = { n: 5, text: "Public Ledger: every payment, no names", href: "ledger" };

  return (
    <a className="guide" href={`#/${step.href}`}>
      <span className="guide-n">STEP {step.n}/5</span>
      <span>{step.text}</span>
      {step.href !== route && <span className="guide-go">→</span>}
    </a>
  );
}

/** The Hedera account signed in for the current role. The public ledger needs none. */
function AccountPill({ route }: { route: Route }) {
  const { state } = useStore();
  const { live, accounts, balances } = useLive();
  if (route === "ledger")
    return (
      <span className="acct readonly">
        <span className="acct-who">
          <b>Public</b>
          <small>read-only · no login</small>
        </span>
      </span>
    );
  const seller = route === "seller";
  const id = (seller ? accounts?.seller : accounts?.agent) ?? (seller ? ACCOUNTS.seller : ACCOUNTS.agent);
  const real = live && balances ? (seller ? balances.seller : balances.agent) : null;
  const balance = real ?? (seller ? START_BALANCE.seller + state.earnings.paid : START_BALANCE.buyer - state.spent);
  return (
    <a className="acct" href={hashscanAccount(id)} target="_blank" rel="noreferrer" title="Open on HashScan">
      <span className={`acct-avatar ${seller ? "s" : "b"}`}>{seller ? "P" : "AI"}</span>
      <span className="acct-who">
        <b>{seller ? "Priya · Seller" : "Buyer agent"}</b>
        <small className="mono">{id}</small>
      </span>
      <span className="acct-bal mono">
        {balance.toFixed(2)} <span>ℏ</span>
      </span>
      <i className="pulse" title="Hedera testnet" />
    </a>
  );
}

/** LIVE when the demo API is reachable (real Hedera testnet payments), otherwise API OFFLINE. */
function ModeBadge() {
  const { live, checked } = useLive();
  if (!checked) return null;
  if (live) return <span className="sim live" title="Payments settle on Hedera testnet">LIVE · HEDERA TESTNET</span>;
  return SHOW_SIM_BADGE ? <span className="sim" title="Marketplace API unreachable: paid actions are disabled">API OFFLINE</span> : null;
}
