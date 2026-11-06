import { useMemo, useRef, useState } from "react";
import { Button, Chip, Console, CountUp, Hash, PageHead, Panel, Scramble, SponsorTag, Toggle, useLog, useOnce } from "../components/ui";
import { FACETS, PUBLIC_TAGS, SAMPLE_EXPORT, maskedText, type Pii } from "../demo-data";
import { PRICES, SOURCES } from "../config";
import { evmHash, hex, isoWeek, ogRequestId, sleep } from "../lib";
import { pendingEarnings, useStore } from "../store";

const STEPS = [
  { t: "Ingest", d: "Parse the export locally" },
  { t: "Mask", d: "Keep your words, hide your identity" },
  { t: "Extract", d: "Facets from 0G Private Computer" },
  { t: "Review", d: "See exactly what is published" },
  { t: "Publish", d: "Encrypt, seal, write to Arkiv" },
];

const LEAVES = [
  "Nothing. The raw export never leaves this browser.",
  "Nothing yet. Masking runs on device.",
  "Masked text only → 0G TEE.",
  "Nothing new. You decide here.",
  "Ciphertext + coarse tags → Arkiv.",
  "Ciphertext + coarse tags, on Arkiv.",
];

type Cfg = { insights: boolean; sale: boolean; days: number; reqId: string };

export function Seller() {
  const { state } = useStore();
  const [step, setStep] = useState(state.listing ? 5 : 0);
  const [reqId, setReqId] = useState("");
  const [cfg, setCfg] = useState<Cfg | null>(null);

  return (
    <div className="page">
      <PageHead
        eyebrow="// 01 · SELLER — PRIYA, MUMBAI"
        title={
          <>
            Turn a chat into a <em>listing.</em>
          </>
        }
        sub="Drop an export. Only your own messages are kept, masked on device, structured inside a TEE and published encrypted with your consent and an expiry."
      />
      <div className="seller-grid">
        <aside className="rail">
          <ol className="stepper">
            {STEPS.map((s, i) => (
              <li key={s.t} className={i < step ? "done" : i === step ? "active" : ""}>
                <span className="step-n">{i < step ? "✓" : `0${i + 1}`}</span>
                <span>
                  <b>{s.t}</b>
                  <small>{s.d}</small>
                </span>
              </li>
            ))}
          </ol>
          <div className="leaves">
            <span className="eyebrow">LEAVES YOUR DEVICE</span>
            <p key={step}>{LEAVES[step]}</p>
          </div>
        </aside>
        <div className="stage" key={step}>
          {step === 0 && <Ingest onDone={() => setStep(1)} />}
          {step === 1 && <Mask onDone={() => setStep(2)} />}
          {step === 2 && (
            <Extract
              onDone={(id) => {
                setReqId(id);
                setStep(3);
              }}
            />
          )}
          {step === 3 && (
            <Review
              reqId={reqId}
              onPublish={(c) => {
                setCfg(c);
                setStep(4);
              }}
            />
          )}
          {step === 4 && cfg && <Publish cfg={cfg} onDone={() => setStep(5)} />}
          {step === 5 && <Live onRestart={() => setStep(0)} />}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ 01 Ingest ------------------------------ */

function Ingest({ onDone }: { onDone: () => void }) {
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const log = useLog();
  const input = useRef<HTMLInputElement>(null);

  async function start(name: string, own: boolean) {
    if (busy) return;
    setBusy(true);
    const p = log.push;
    p(
      <>
        unzip <b>{name}</b>
      </>,
      "cmd",
    );
    await sleep(500);
    p("found conversations.json · 14 conversations", "dim");
    if (own) p("preview build: your file stays local and unread — the sample conversation is used below", "warn");
    await sleep(450);
    p("walk mapping tree along the current branch · skip system & tool nodes", "dim");
    await sleep(500);
    p(`conversation “${SAMPLE_EXPORT.conversation}” · 7 messages`, "ok");
    await sleep(350);
    p("roles: 4 self · 3 assistant · 0 tool → only self becomes data", "ok");
    await sleep(700);
    if (log.alive.current) onDone();
  }

  return (
    <div className="stack">
      <div className="sources">
        {SOURCES.map((s) => (
          <div key={s.id} className={`source${s.id === "chatgpt" ? " hot" : ""}`}>
            <b>{s.name}</b>
            <small>{s.hint}</small>
          </div>
        ))}
      </div>
      <div
        className={`drop${drag ? " drag" : ""}${busy ? " busy" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const f = e.dataTransfer.files[0];
          if (f) void start(f.name, true);
        }}
        onClick={() => !busy && input.current?.click()}
      >
        <input
          ref={input}
          type="file"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void start(f.name, true);
          }}
        />
        <div className="drop-rings" aria-hidden>
          <i />
          <i />
          <i />
          <span>↓</span>
        </div>
        <b>Drop a chat export</b>
        <small>Parsed in this browser · raw text never uploaded</small>
      </div>
      <div className="row between">
        <span className="muted mono small">SYNTHETIC SAMPLE · NO REAL PERSON</span>
        <Button onClick={() => void start(SAMPLE_EXPORT.file, false)} disabled={busy}>
          Load Priya's ChatGPT export
        </Button>
      </div>
      {log.lines.length > 0 && <Console title="ingest · local" lines={log.lines} busy={busy} height={170} />}
    </div>
  );
}

/* ------------------------------ 02 Mask ------------------------------ */

function Mask({ onDone }: { onDone: () => void }) {
  const msgs = SAMPLE_EXPORT.messages;
  const [phase, setPhase] = useState(0);
  const order = useMemo(() => {
    const m = new Map<Pii, number>();
    let k = 0;
    for (const msg of msgs) for (const part of msg.parts) if (typeof part !== "string") m.set(part, k++);
    return m;
  }, [msgs]);
  const piiCount = order.size;

  useOnce(() => {
    setTimeout(() => setPhase(1), 900);
    setTimeout(() => setPhase(2), 2000);
    setTimeout(() => setPhase(3), 2000 + piiCount * 300 + 900);
  });

  return (
    <div className="stack">
      <Panel label={`${SAMPLE_EXPORT.source.toUpperCase()} · “${SAMPLE_EXPORT.conversation}”`} aside={<Chip>{msgs.length} messages</Chip>}>
        <div className="chat">
          {msgs.map((m, i) => {
            const dropped = phase >= 1 && m.role !== "self";
            return (
              <div key={i} className={`msg msg-${m.role}${dropped ? " dropped" : ""}`}>
                <div className="msg-head">
                  <span>{m.role === "self" ? "YOU" : "ASSISTANT"}</span>
                  {dropped && <span className="drop-tag">CONTEXT ONLY · NEVER STORED</span>}
                </div>
                <p>
                  {m.parts.map((part, j) =>
                    typeof part === "string" ? (
                      <span key={j}>{part}</span>
                    ) : (
                      <Scramble key={j} from={part.orig} to={part.ph} go={phase >= 2} delay={(order.get(part) ?? 0) * 300} />
                    ),
                  )}
                </p>
              </div>
            );
          })}
        </div>
      </Panel>
      <div className={`summary${phase >= 3 ? " in" : ""}`}>
        <div>
          <b>{piiCount}</b>
          <small>identifiers masked</small>
        </div>
        <div>
          <b>3</b>
          <small>assistant replies dropped</small>
        </div>
        <div>
          <b>0 B</b>
          <small>sent anywhere so far</small>
        </div>
        <div>
          <b>brands kept</b>
          <small>allowlist: Minimalist, The Ordinary, Nykaa</small>
        </div>
      </div>
      <div className="row end">
        <Button onClick={onDone} disabled={phase < 3}>
          Send masked text to 0G TEE →
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------ 03 Extract ------------------------------ */

function Extract({ onDone }: { onDone: (reqId: string) => void }) {
  const log = useLog();
  const [reqId] = useState(ogRequestId);
  const [done, setDone] = useState(false);
  const selfText = SAMPLE_EXPORT.messages.filter((m) => m.role === "self").map(maskedText);

  useOnce(() => {
    void (async () => {
      const p = log.push;
      p("POST /api/facets · masked self-messages only · 412 B", "cmd");
      await sleep(600);
      p("route → 0G Private Computer (TEE)", "og");
      await sleep(700);
      p("attestation quote received · enclave measurement matches · ✓ verified", "ok");
      await sleep(650);
      p("inference: facet-extractor · private route", "dim");
      await sleep(1300);
      p(
        <>
          request_id <b>{reqId}</b>
        </>,
        "og",
      );
      await sleep(350);
      p("facets: 1 domain path · 3 person signals · 3 mentions · 3 excerpts", "ok");
      setDone(true);
    })();
  });

  return (
    <div className="stack">
      <div className="two">
        <Panel label="MASKED INPUT → TEE" className={`scan${done ? " scanned" : ""}`}>
          <div className="masked-input">
            {selfText.map((t, i) => (
              <p key={i}>{t}</p>
            ))}
          </div>
          <i className="scanline" aria-hidden />
        </Panel>
        <Console title="0g · private computer" lines={log.lines} busy={!done} height={250} />
      </div>
      {done && <FacetCard reqId={reqId} />}
      <div className="row end">
        <Button onClick={() => onDone(reqId)} disabled={!done}>
          Review what gets published →
        </Button>
      </div>
    </div>
  );
}

function FacetCard({ reqId }: { reqId: string }) {
  return (
    <Panel
      label="FACET ENVELOPE"
      className="facets appear"
      aside={
        <span className="row gap-s">
          <SponsorTag who="0G" />
          <Hash value={reqId} label="req" />
        </span>
      }
    >
      <div className="facet-domain mono">{FACETS.domain_path}</div>
      <div className="signals">
        {FACETS.person_signals.map((s) => (
          <div key={s.k} className="signal">
            <small>{s.k}</small>
            <b>{s.v}</b>
            <span className="conf">
              <i style={{ width: `${s.conf * 100}%` }} />
            </span>
            <small className="mono">
              {s.src} · {s.conf.toFixed(2)}
            </small>
          </div>
        ))}
      </div>
      <div className="mentions">
        {FACETS.mentions.map((m) => (
          <div key={m.subject} className="mention">
            <div>
              <b>{m.subject}</b>
              <small className="mono">{m.type}</small>
            </div>
            <div className="events">
              {m.events.map((e) => (
                <Chip key={e} tone={e === "abandoned" ? "warn" : "default"}>
                  {e}
                </Chip>
              ))}
            </div>
            <div className="senti" title={`sentiment ${m.sentiment}`}>
              <i style={{ left: `${(m.sentiment + 1) * 50}%` }} />
            </div>
            <small>{m.reason}</small>
            <small className="mono gold-t">{m.price}</small>
          </div>
        ))}
      </div>
    </Panel>
  );
}

/* ------------------------------ 04 Review ------------------------------ */

function Review({ reqId, onPublish }: { reqId: string; onPublish: (c: Cfg) => void }) {
  const [insights, setInsights] = useState(true);
  const [sale, setSale] = useState(true);
  const [days, setDays] = useState(30);
  const until = new Date(Date.now() + days * 86400_000).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="stack">
      <div className="two">
        <Panel label="PUBLIC · ANYONE CAN READ ON ARKIV">
          <table className="kv">
            <tbody>
              {PUBLIC_TAGS(isoWeek(), PRICES.record.silver).map(([k, v]) => (
                <tr key={k}>
                  <td className="mono">{k}</td>
                  <td>{v}</td>
                </tr>
              ))}
              <tr>
                <td className="mono">consent_insights</td>
                <td>{String(insights)}</td>
              </tr>
              <tr>
                <td className="mono">consent_sale</td>
                <td>{String(sale)}</td>
              </tr>
            </tbody>
          </table>
          <p className="note">No wallet, no user ID, nothing repeated across your listings.</p>
        </Panel>
        <Panel label="ENCRYPTED · RELEASED ONLY AFTER PAYMENT + CONSENT">
          <div className="sealed-list">
            <div>
              <small className="mono">facets</small>
              <span>{FACETS.domain_path} · 3 signals · 3 mentions</span>
            </div>
            {FACETS.excerpts.map((e, i) => (
              <div key={i}>
                <small className="mono">excerpt {i + 1}</small>
                <span>“{e}”</span>
              </div>
            ))}
            <div>
              <small className="mono">0g request</small>
              <Hash value={reqId} />
            </div>
          </div>
        </Panel>
      </div>
      <Panel label="YOUR CONSENT">
        <div className="consent">
          <Toggle on={insights} onChange={setInsights} label="Use in aggregate insights" hint="Anonymised · cohorts of 50+ · equal share of each report" />
          <Toggle on={sale} onChange={setSale} label="Allow sale of my record" hint="Pseudonymised · watermarked per buyer · you get 80%" />
          <div className="expiry">
            <div className="row between">
              <span>Consent window</span>
              <b className="mono">
                {days} days · until {until}
              </b>
            </div>
            <input type="range" min={7} max={182} value={days} onChange={(e) => setDays(Number(e.target.value))} />
            <small className="muted mono">Arkiv lifetime {(days * 43200).toLocaleString()} blocks · auto-expires, never auto-renews</small>
          </div>
        </div>
      </Panel>
      <div className="row end">
        <Button onClick={() => onPublish({ insights, sale, days, reqId })} disabled={!insights && !sale}>
          Encrypt &amp; publish to Arkiv
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------ 05 Publish ------------------------------ */

function Publish({ cfg, onDone }: { cfg: Cfg; onDone: () => void }) {
  const { update, addReceipt } = useStore();
  const log = useLog();
  const [cipher, setCipher] = useState("");
  const [busy, setBusy] = useState(true);

  useOnce(() => {
    let stop = false;
    const rain = setInterval(() => !stop && setCipher((c) => (c + hex(24)).slice(-1400)), 60);
    void (async () => {
      const p = log.push;
      p("generateKey() → per-record AES-256 key (never leaves sealed form)", "cmd");
      await sleep(550);
      p("encryptBytes · AES-256-GCM · 2,184 B → 2,212 B (iv ‖ ct ‖ tag)", "ok");
      await sleep(600);
      p("sealTo(service P-256) → wrapped_key · ECDH + HKDF-SHA-256 + AES-GCM", "ok");
      await sleep(500);
      p("sealTo(service) → sealed_seller {payout_account, user_ref, ctl_pub, deadline}", "ok");
      await sleep(450);
      p("listing control key generated · stays in this browser", "dim");
      await sleep(500);
      p("POST /api/listings → platform writer queue (serialised nonce)", "cmd");
      await sleep(700);
      const blocks = cfg.days * 43200;
      p(`arkiv.createEntity dm.listing · expiresIn ${blocks.toLocaleString()} blocks`, "arkiv");
      await sleep(1400);
      const tx = evmHash();
      const key = evmHash();
      const block = 298273 + Math.floor(Math.random() * 90000);
      p(
        <>
          tx <Hash value={tx} /> · block #{block.toLocaleString()}
        </>,
        "arkiv",
      );
      await sleep(500);
      p(
        <>
          entity <Hash value={key} /> live ✓
        </>,
        "ok",
      );
      stop = true;
      clearInterval(rain);
      if (!log.alive.current) return;
      setBusy(false);
      update((s) => ({
        ...s,
        listing: {
          listingId: `lst_${hex(2)}`,
          entityKey: key,
          txHash: tx,
          block,
          consentInsights: cfg.insights,
          consentSale: cfg.sale,
          expiryDays: cfg.days,
          publishedAt: Date.now(),
          live: true,
        },
      }));
      addReceipt({ kind: "listing", title: "dm.listing · beauty · IN-west · silver", chain: "arkiv", tx, mine: true });
      await sleep(900);
      onDone();
    })();
  });

  return (
    <div className="two">
      <Panel label="CIPHERTEXT" className="cipher-panel">
        <div className={`cipher${busy ? "" : " sealed"}`}>{cipher}</div>
        {!busy && <div className="sealed-stamp">SEALED</div>}
      </Panel>
      <Console title="seal & publish" lines={log.lines} busy={busy} height={300} />
    </div>
  );
}

/* ------------------------------ Live listing ------------------------------ */

function Live({ onRestart }: { onRestart: () => void }) {
  const { state, update, addReceipt } = useStore();
  const l = state.listing;
  const [pending, setPending] = useState<string | null>(null);
  const log = useLog();
  if (!l) return null;

  async function patch(field: "consentInsights" | "consentSale", v: boolean) {
    const name = field === "consentInsights" ? "consent_insights" : "consent_sale";
    setPending(field);
    log.push(`sign {${name}: ${v}} with listing control key → POST /api/listings/:key/consent`, "cmd");
    await sleep(700);
    log.push(`server: control signature ✓ → arkiv.patchEntity ${name}=${v}`, "arkiv");
    await sleep(1100);
    const tx = evmHash();
    log.push(
      <>
        patched · tx <Hash value={tx} />
      </>,
      "ok",
    );
    update((s) => (s.listing ? { ...s, listing: { ...s.listing, [field]: v } } : s));
    addReceipt({ kind: "consent", title: `patch ${name} → ${v}`, chain: "arkiv", tx, mine: true });
    setPending(null);
  }

  async function revoke() {
    setPending("revoke");
    log.push("sign {revoke} with listing control key → DELETE /api/listings/:key", "cmd");
    await sleep(700);
    log.push("arkiv.deleteEntity · server will refuse every further release", "arkiv");
    await sleep(1200);
    const tx = evmHash();
    log.push(
      <>
        deleted · tx <Hash value={tx} />
      </>,
      "warn",
    );
    update((s) => (s.listing ? { ...s, listing: { ...s.listing, live: false } } : s));
    addReceipt({ kind: "revoke", title: "dm.listing deleted by owner request", chain: "arkiv", tx, mine: true });
    setPending(null);
  }

  return (
    <div className="stack">
      <Panel
        label={l.live ? "LIVE ON ARKIV" : "REVOKED"}
        className={`listing-card${l.live ? " live" : " dead"}`}
        aside={
          <span className="row gap-s">
            <SponsorTag who="ARKIV" />
            {l.live && <i className="pulse" />}
          </span>
        }
      >
        <div className="listing-top">
          <div>
            <small className="mono muted">{l.listingId}</small>
            <h3>beauty · IN-west · silver · {PRICES.record.silver} HBAR</h3>
          </div>
          <div className="row gap-s wrap">
            <Hash value={l.entityKey} label="entity" />
            <Hash value={l.txHash} label="tx" />
          </div>
        </div>
        <div className="consent">
          <Toggle
            on={l.consentInsights}
            disabled={!l.live || !!pending}
            onChange={(v) => void patch("consentInsights", v)}
            label="Use in aggregate insights"
            hint={pending === "consentInsights" ? "patching on Arkiv…" : "checked at the start of every analysis"}
          />
          <Toggle
            on={l.consentSale}
            disabled={!l.live || !!pending}
            onChange={(v) => void patch("consentSale", v)}
            label="Allow sale of my record"
            hint={pending === "consentSale" ? "patching on Arkiv…" : "checked before every release"}
          />
        </div>
        <div className="listing-foot">
          <div className="earn">
            <small>PENDING EARNINGS</small>
            <b>
              <CountUp value={pendingEarnings(state)} decimals={4} /> <span>HBAR</span>
            </b>
          </div>
          <div className="row gap-s wrap">
            {l.live ? (
              <Button variant="danger" onClick={() => void revoke()} disabled={!!pending}>
                Revoke listing
              </Button>
            ) : (
              <Button
                variant="ghost"
                onClick={() => {
                  update((s) => ({ ...s, listing: null }));
                  onRestart();
                }}
              >
                Upload another
              </Button>
            )}
            <Button href="#/agent">Merchant agent →</Button>
          </div>
        </div>
      </Panel>
      {log.lines.length > 0 && <Console title="consent · control key" lines={log.lines} busy={!!pending} height={150} />}
    </div>
  );
}
