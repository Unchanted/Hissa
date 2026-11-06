import { useEffect, useState } from "react";
import { BRAND, SHOW_DEVANAGARI, SHOW_SIM_BADGE } from "../config";
import { HissaMark } from "./HissaMark";
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
  { id: "agent", label: "Merchant Agent" },
  { id: "ledger", label: "Ledger" },
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
            <span className="net">
              <i className="pulse" /> Rabdi · Hedera testnet · 0G
            </span>
            {SHOW_SIM_BADGE && <span className="sim">PREVIEW · SIMULATED</span>}
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
  let step: { n: number; text: string; href: Route };
  if (!l) step = { n: 1, text: "Publish Priya's chat as an encrypted listing", href: "seller" };
  else if (!state.report) step = { n: 2, text: "Run the merchant agent — it pays on its own", href: "agent" };
  else if (l.consentSale && l.live) step = { n: 3, text: "Revoke sale consent, then rerun the agent", href: "seller" };
  else if (state.earnings.paid === 0) step = { n: 4, text: "Open the ledger and run the payout batch", href: "ledger" };
  else step = { n: 5, text: "Demo complete — reset with ↺", href: route };

  return (
    <a className="guide" href={`#/${step.href}`}>
      <span className="guide-n">STEP {step.n}/5</span>
      <span>{step.text}</span>
      {step.href !== route && <span className="guide-go">→</span>}
    </a>
  );
}
