import { Button } from "../components/ui";
import { BRAND, SHOW_DEVANAGARI } from "../config";
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
  { n: "01", tag: "0G", title: "Upload", body: "Masked on your device. Structured in a TEE." },
  { n: "02", tag: "ARKIV", title: "List", body: "Encrypted. Your consent, your expiry." },
  { n: "03", tag: "HEDERA", title: "Get paid", body: "AI agents pay per record — and per message." },
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
          AI companies buy your chat data. Now you get the cut.
        </p>
        <div className="cta-row reveal" style={{ ["--i" as string]: 8 }}>
          <Button href="#/seller" size="lg">
            Start selling
          </Button>
        </div>
        <div className="sponsors reveal" style={{ ["--i" as string]: 10 }}>
          <div className="wm wm-0g">
            <b>0G</b>
            <small>Private Computer</small>
          </div>
          <div className="wm wm-arkiv">
            <b>ARKIV</b>
            <small>Encrypted listings</small>
          </div>
          <div className="wm wm-hedera">
            <b>HEDERA</b>
            <small>x402 payments</small>
          </div>
          <div className="wm wm-tg">
            <b>TELEGRAM</b>
            <small>Paid messages</small>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="track three">
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

      <section className="section final">
        <div className="brand-block">
          <div className="brand-art">
            <HissaMark size={260} dots={2600} />
          </div>
          <div>
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
              <strong>Hissa</strong> is Hindi for “share”. 80% of every sale is yours.
            </p>
            <div className="cta-row left">
              <Button href="#/seller" size="lg">
                Run the demo
              </Button>
            </div>
          </div>
        </div>
        <footer className="foot mono">HISSA · ETHGLOBAL MUMBAI 2026</footer>
      </section>
    </>
  );
}
