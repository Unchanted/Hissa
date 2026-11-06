import { Button } from "../components/ui";
import { BRAND, PRICES, PRIVACY, SHOW_DEVANAGARI } from "../config";
import { HissaMark } from "../components/HissaMark";

const HEADLINE: [string, boolean][][] = [
  [
    ["Sell", true],
    ["the", false],
    ["Signal,", true],
  ],
  [
    ["Keep", false],
    ["the", true],
    ["Self.", false],
  ],
];

const STEPS = [
  {
    n: "01",
    tag: "BROWSER",
    title: "Mask on device",
    body: "Only your own words survive. Names, numbers and places become placeholders before anything leaves the browser.",
  },
  {
    n: "02",
    tag: "0G",
    title: "Extract in a TEE",
    body: "0G Private Computer turns masked text into structured facets. Every inference carries a request ID.",
  },
  {
    n: "03",
    tag: "ARKIV",
    title: "Seal to Arkiv",
    body: "Encrypted record, coarse public tags, your consent flags and an expiry. Arkiv is the only database.",
  },
  {
    n: "04",
    tag: "HEDERA",
    title: "Agents pay per answer",
    body: "Merchant agents find a cohort, pay over x402 on Hedera within a budget, and get a noised report — never a person.",
  },
];

export function Landing() {
  return (
    <>
      <section className="hero">
        <div className="badge reveal" style={{ ["--i" as string]: 0 }}>
          <span>User-owned data marketplace</span>
        </div>
        <h1 className="headline">
          {HEADLINE.map((line, li) => (
            <span className="line" key={li}>
              {line.map(([w, gold], wi) => (
                <span key={wi} className={`word ${gold ? "gold" : "cream"}`} style={{ ["--i" as string]: li * 3 + wi + 1 }}>
                  {w}
                </span>
              ))}
            </span>
          ))}
        </h1>
        <p className="lede reveal" style={{ ["--i" as string]: 7 }}>
          Your AI chats are the most honest market research on Earth. Publish them masked and encrypted, on your terms —
          merchant agents pay per insight over x402, and never learn who you are.
        </p>
        <div className="cta-row reveal" style={{ ["--i" as string]: 8 }}>
          <Button href="#/seller" size="lg">
            Enter the Marketplace
          </Button>
          <a className="link-ghost" href="#protocol">
            How it works <span>↓</span>
          </a>
        </div>
        <div className="sponsors reveal" style={{ ["--i" as string]: 10 }}>
          <div className="wm wm-0g">
            <b>0G</b>
            <small>Private Computer</small>
          </div>
          <div className="wm wm-arkiv">
            <b>ARKIV</b>
            <small>DB-chain · Rabdi</small>
          </div>
          <div className="wm wm-hedera">
            <b>HEDERA</b>
            <small>x402 · HCS · Schedules</small>
          </div>
          <div className="wm wm-x402">
            <b>x402</b>
            <small>HTTP 402 payments</small>
          </div>
        </div>
      </section>

      <section id="protocol" className="section">
        <div className="section-head">
          <span className="eyebrow">// PROTOCOL</span>
          <h2>
            Four hops from <em>chat</em> to <em>cheque.</em>
          </h2>
        </div>
        <div className="track">
          <div className="track-line">
            <i className="track-pulse" />
          </div>
          {STEPS.map((s) => (
            <article className="track-step" key={s.n}>
              <span className="track-node" />
              <div className="track-meta">
                <span className="mono">{s.n}</span>
                <span className="track-tag">{s.tag}</span>
              </div>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <span className="eyebrow">// TWO PRODUCTS · TWO PRIVACY TREATMENTS</span>
          <h2>
            What the merchant <em>never</em> sees.
          </h2>
        </div>
        <div className="spec-grid">
          <div className="spec">
            <div className="spec-top">
              <span className="mono">A</span>
              <h3>Insights</h3>
              <span className="spec-kind">ANONYMISED · MAIN PRODUCT</span>
            </div>
            <dl>
              <dt>Minimum cohort</dt>
              <dd>{PRIVACY.kMin} distinct users</dd>
              <dt>Contribution</dt>
              <dd>one vote per user per metric</dd>
              <dt>Noise</dt>
              <dd>Laplace, ε = {PRIVACY.epsilon.toFixed(1)}</dd>
              <dt>Small cells</dt>
              <dd>under {PRIVACY.smallCell} users → “other”</dd>
              <dt>Quotes</dt>
              <dd>none verbatim — synthetic only</dd>
              <dt>Price</dt>
              <dd>{PRICES.insightReport} HBAR / report</dd>
            </dl>
          </div>
          <div className="spec">
            <div className="spec-top">
              <span className="mono">B</span>
              <h3>Record sale</h3>
              <span className="spec-kind">PSEUDONYMISED · OPT-IN</span>
            </div>
            <dl>
              <dt>Consent</dt>
              <dd>separate toggle, off by default</dd>
              <dt>Identity</dt>
              <dd>buyer-scoped pseudonym</dd>
              <dt>Leak tracing</dt>
              <dd>per-buyer watermark</dd>
              <dt>Delivery</dt>
              <dd>sealed to the buyer's key</dd>
              <dt>Revoke</dt>
              <dd>refused at the next request</dd>
              <dt>Seller share</dt>
              <dd>{PRIVACY.sellerShare * 100}% of each sale</dd>
            </dl>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="brand-block">
          <div className="brand-art">
            <HissaMark size={260} dots={2600} />
          </div>
          <div>
            <span className="eyebrow">// THE NAME</span>
            <div className="brand-lockup">
              <b>{BRAND.name}</b>
              {SHOW_DEVANAGARI && (
                <span className="logo-deva" lang="hi">
                  {BRAND.devanagari}
                </span>
              )}
            </div>
            <p className="brand-tag">{BRAND.tagline}</p>
            <p className="brand-copy">
              <strong>Hissa</strong> is {BRAND.meaning} — a portion, a stake. Every time your data earns, you get yours:{" "}
              {PRIVACY.sellerShare * 100}% of each record sale, and an equal cut of every insight report you were counted in. The
              mark is the pie with your slice already pulled out.
            </p>
          </div>
        </div>
      </section>

      <section className="section final">
        <h2 className="final-title">
          Your data. Your consent. <em>Your hissa.</em>
        </h2>
        <Button href="#/seller" size="lg">
          Run the demo
        </Button>
        <footer className="foot mono">HISSA · ETHGLOBAL MUMBAI 2026 · PREVIEW BUILD · CHAIN CALLS SIMULATED IN THE BROWSER</footer>
      </section>
    </>
  );
}
