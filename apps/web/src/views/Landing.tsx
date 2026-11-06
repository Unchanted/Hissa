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

type Tag = "BROWSER" | "0G" | "ARKIV" | "HEDERA" | "AI AGENT" | "DELIVERED";
const LANES: { who: string; title: string; sub: string; tone: string; steps: [Tag, string][] }[] = [
  {
    who: "DATA PROVIDERS",
    title: "Users",
    sub: "Own your data. Get paid.",
    tone: "users",
    steps: [
      ["BROWSER", "Upload chat"],
      ["BROWSER", "Mask PII on device"],
      ["0G", "Extract insights in TEE"],
      ["ARKIV", "Encrypted listing"],
      ["HEDERA", "Earn rewards"],
    ],
  },
  {
    who: "DATA BUYERS",
    title: "AI companies",
    sub: "Buy data and insights. Pay per use.",
    tone: "buyers",
    steps: [
      ["AI AGENT", "Request data or insights"],
      ["ARKIV", "Discover listings"],
      ["HEDERA", "Agent pays via x402"],
      ["0G", "Private analysis"],
      ["DELIVERED", "Decrypted data for AI training & insights"],
    ],
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

      <section className="section" id="pipeline">
        <div className="section-head center">
          <h2>
            <em>Hissa</em> flips it.
          </h2>
          <div className="pillars">
            <span>You own the data</span>
            <span>You set consent</span>
            <span>You get paid</span>
          </div>
        </div>
        {LANES.map((lane, li) => (
          <div key={lane.who} className={`lane ${lane.tone}`}>
            <div className="lane-head">
              <span className="eyebrow">{lane.who}</span>
              <h3>{lane.title}</h3>
              <p>{lane.sub}</p>
            </div>
            <div className="lane-steps">
              {lane.steps.map(([tag, text], i) => (
                <div key={text} className={`lane-step t-${tag.split(" ")[0]!.toLowerCase()}`} style={{ ["--i" as string]: li * 5 + i }}>
                  <div className="row between">
                    <span className="lane-tag">{tag}</span>
                    <span className="mono muted small">0{i + 1}</span>
                  </div>
                  <b>{text}</b>
                </div>
              ))}
            </div>
            {li === 0 && (
              <div className="lane-links">
                <span className="link-arkiv">↓ Listings shared on Arkiv</span>
                <span className="link-hbar">↑ HBAR flows back to users</span>
              </div>
            )}
          </div>
        ))}
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
