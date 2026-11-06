import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Chip, Console, CountUp, Hash, PageHead, Panel, Scramble, SponsorTag, Toggle, useLog, useOnce } from "../components/ui";
import { SAMPLE_EXPORT, type Pii } from "../demo-data";
import { ACCOUNTS, PRICES, SELLER_SHARE, SOURCES } from "../config";
import { evmHash, hederaTxId, hex, isoWeek, ogRequestId, sleep } from "../lib";
import { Phone } from "../components/Phone";
import { api, useLive } from "../live";
import { pendingEarnings, useStore } from "../store";

const STEPS = ["Upload", "Mask", "Publish"];
const FACET_CHIPS = ["beauty / skincare / serum", "18–24", "budget: high", "abandoned", "too expensive"];

export function Seller() {
  const { state } = useStore();
  const [step, setStep] = useState(state.listing ? 3 : 0);

  return (
    <div className="page">
      <PageHead
        eyebrow="// SELLER"
        title={
          <>
            Turn a chat into <em>income.</em>
          </>
        }
      />
      <ol className="steps-h">
        {STEPS.map((t, i) => (
          <li key={t} className={i < step ? "done" : i === step ? "active" : ""}>
            <span className="step-n">{i < step ? "✓" : i + 1}</span>
            {t}
          </li>
        ))}
      </ol>
      <div className="stage" key={step}>
        {step === 0 && <Upload onDone={() => setStep(1)} />}
        {step === 1 && <Mask onDone={() => setStep(2)} />}
        {step === 2 && <Publish onDone={() => setStep(3)} />}
        {step === 3 && <Live onRestart={() => setStep(0)} />}
      </div>
    </div>
  );
}

/* ------------------------------ 1 Upload ------------------------------ */

function Upload({ onDone }: { onDone: () => void }) {
  const [drag, setDrag] = useState(false);
  const [status, setStatus] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const busy = status !== "";

  async function start(name: string) {
    if (busy) return;
    setStatus(`Parsing ${name}…`);
    await sleep(900);
    setStatus("7 messages · 4 are yours");
    await sleep(900);
    onDone();
  }

  return (
    <div className="stack">
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
          if (f) void start(f.name);
        }}
        onClick={() => !busy && input.current?.click()}
      >
        <input
          ref={input}
          type="file"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void start(f.name);
          }}
        />
        <div className="drop-rings" aria-hidden>
          <i />
          <i />
          <i />
          <span>↓</span>
        </div>
        <b>{status || "Drop a chat export"}</b>
        <small>{SOURCES.map((s) => s.name).join(" · ")}</small>
      </div>
      <div className="row end">
        <Button onClick={() => void start(SAMPLE_EXPORT.file)} disabled={busy}>
          Use sample export
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------ 2 Mask + 0G ------------------------------ */

function Mask({ onDone }: { onDone: () => void }) {
  const msgs = SAMPLE_EXPORT.messages;
  const [phase, setPhase] = useState(0); // 1 drop context · 2 mask · 3 0G · 4 done
  const [reqId, setReqId] = useState(ogRequestId);
  const [chips, setChips] = useState<string[]>(FACET_CHIPS);
  const [zgNote, setZgNote] = useState("");
  const { zg } = useLive();
  const ran = useRef(false);
  const order = useMemo(() => {
    const m = new Map<Pii, number>();
    let k = 0;
    for (const msg of msgs) for (const part of msg.parts) if (typeof part !== "string") m.set(part, k++);
    return m;
  }, [msgs]);

  useOnce(() => {
    const maskEnd = 1900 + order.size * 280 + 700;
    setTimeout(() => setPhase(1), 700);
    setTimeout(() => setPhase(2), 1600);
    setTimeout(() => setPhase(3), maskEnd);
  });

  // 0G Private Computer: real sealed inference when the API has a key, otherwise simulated.
  useEffect(() => {
    if (phase !== 3 || ran.current) return;
    ran.current = true;
    const selfText = msgs
      .filter((m) => m.role === "self")
      .map((m) => m.parts.map((x) => (typeof x === "string" ? x : x.ph)).join(""))
      .join("\n");
    if (!zg) {
      setTimeout(() => setPhase(4), 1800);
      return;
    }
    api
      .analyseUpload(selfText)
      .then((r) => {
        const f = r.facets;
        const m = f.mentions[0];
        setChips(
          [f.domain_path, f.age_band, f.budget_consciousness && `budget: ${f.budget_consciousness}`, ...(m?.events ?? []).slice(0, 2), m?.price_judgement?.replace("_", " ")].filter(
            (x): x is string => !!x,
          ),
        );
        setReqId(r.receipt.request_id);
        setZgNote(`${r.receipt.tee_verified ? "TEE verified" : "sealed"} · ${r.receipt.model}${r.extraIdentifiers.length ? ` · +${r.extraIdentifiers.length} identifiers caught` : ""}`);
      })
      .catch(() => setZgNote("0G unavailable · simulated"))
      .finally(() => setPhase(4));
  }, [phase, zg, msgs]);

  return (
    <div className="stack">
      <Panel label="ON YOUR DEVICE" aside={phase >= 2 && <Chip tone="gold">{order.size} identifiers hidden</Chip>}>
        <div className="chat">
          {msgs.map((m, i) => {
            const dropped = phase >= 1 && m.role !== "self";
            return (
              <div key={i} className={`msg msg-${m.role}${dropped ? " dropped" : ""}`}>
                {dropped && <span className="drop-tag">NOT YOURS · DROPPED</span>}
                <p>
                  {m.parts.map((part, j) =>
                    typeof part === "string" ? (
                      <span key={j}>{part}</span>
                    ) : (
                      <Scramble key={j} from={part.orig} to={part.ph} go={phase >= 2} delay={(order.get(part) ?? 0) * 280} />
                    ),
                  )}
                </p>
              </div>
            );
          })}
        </div>
      </Panel>
      <div className={`og-strip${phase >= 3 ? " on" : ""}${phase >= 4 ? " done" : ""}`}>
        <SponsorTag who="0G" />
        <span className="og-label">
          {phase >= 4 ? "Facets extracted in TEE" : phase >= 3 ? "Extracting in TEE…" : "0G Private Computer"}
          {zgNote && <small className="og-note">{zgNote}</small>}
        </span>
        <div className="og-chips">
          {phase >= 4 &&
            chips.map((c, i) => (
              <span key={c} className="facet-chip" style={{ ["--i" as string]: i }}>
                {c}
              </span>
            ))}
        </div>
        {phase >= 4 && <Hash value={reqId} label="req" />}
        <Button onClick={onDone} disabled={phase < 4}>
          Continue →
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------ 3 Consent + publish ------------------------------ */

type TgState = "off" | "linking" | "linked";

function Publish({ onDone }: { onDone: () => void }) {
  const { update, addReceipt } = useStore();
  const [sale, setSale] = useState(true);
  const [tg, setTg] = useState<TgState>("off");
  const [days, setDays] = useState(30);
  const [sealing, setSealing] = useState(false);
  const [cipher, setCipher] = useState("");
  const log = useLog();
  const { live } = useLive();

  async function toggleContact(on: boolean) {
    if (!on) return setTg("off");
    setTg("linking");
    await sleep(1300);
    setTg("linked");
  }

  async function publish() {
    setSealing(true);
    const rain = setInterval(() => setCipher((c) => (c + hex(24)).slice(-900)), 60);
    const p = log.push;
    p("encrypt record · AES-256-GCM", "ok");
    await sleep(600);
    p(tg === "linked" ? "seal key + payout + Telegram id → service key" : "seal key + payout → service key", "ok");
    await sleep(700);
    p("arkiv.createEntity dm.listing", "arkiv");
    const listingId = `lst_${hex(2)}`;
    if (live) {
      await api
        .registerListing(listingId, sale, tg === "linked")
        .catch((e: Error) => p(`marketplace API: ${e.message}`, "warn"));
    }
    await sleep(live ? 700 : 1300);
    const tx = evmHash();
    const key = evmHash();
    p(
      <>
        live ✓ <Hash value={tx} />
      </>,
      "arkiv",
    );
    clearInterval(rain);
    if (!log.alive.current) return;
    update((s) => ({
      ...s,
      listing: {
        listingId,
        entityKey: key,
        txHash: tx,
        block: 298273 + Math.floor(Math.random() * 90000),
        consentSale: sale,
        consentContact: tg === "linked",
        expiryDays: days,
        publishedAt: Date.now(),
        live: true,
      },
    }));
    addReceipt({ kind: "listing", title: "beauty · IN-west · silver", chain: "arkiv", tx });
    await sleep(1100);
    onDone();
  }

  if (sealing)
    return (
      <div className="two">
        <Panel label="ENCRYPTING" className="cipher-panel">
          <div className={`cipher${log.lines.length >= 4 ? " sealed" : ""}`}>{cipher}</div>
          {log.lines.length >= 4 && <div className="sealed-stamp">SEALED</div>}
        </Panel>
        <Console title="publish" lines={log.lines} busy={log.lines.length < 4} height={250} />
      </div>
    );

  const tags = [
    ["domain", "beauty"],
    ["region", "IN-west"],
    ["week", isoWeek()],
    ["price", `${PRICES.record} ℏ`],
    ["consent_sale", String(sale)],
    ["consent_contact", String(tg === "linked")],
  ];

  return (
    <div className="two">
      <Panel label="YOU DECIDE">
        <div className="stack">
          <Toggle on={sale} onChange={setSale} label="Sell my record" hint={`${PRICES.record} ℏ · you keep ${SELLER_SHARE * 100}%`} />
          <Toggle
            on={tg !== "off"}
            onChange={(v) => void toggleContact(v)}
            label="Let buyers message me"
            hint={
              tg === "linking"
                ? `Connecting ${ACCOUNTS.relayBot}…`
                : tg === "linked"
                  ? `Telegram linked · handle stays hidden · ${PRICES.contact} ℏ per message`
                  : `Via Telegram · ${PRICES.contact} ℏ per message`
            }
          />
          <div className="days">
            <small className="muted">Expires in</small>
            {[7, 30, 90, 180].map((d) => (
              <button key={d} className={d === days ? "on" : ""} onClick={() => setDays(d)}>
                {d}d
              </button>
            ))}
          </div>
        </div>
      </Panel>
      <Panel label="PUBLIC ON ARKIV" aside={<SponsorTag who="ARKIV" />}>
        <div className="tags">
          {tags.map(([k, v]) => (
            <span key={k} className="tag">
              <small>{k}</small>
              {v}
            </span>
          ))}
        </div>
        <p className="note">Everything else is encrypted. No name, no wallet, no Telegram handle.</p>
        <div className="row end">
          <Button onClick={() => void publish()} disabled={(!sale && tg !== "linked") || tg === "linking"}>
            Encrypt &amp; publish
          </Button>
        </div>
      </Panel>
    </div>
  );
}

/* ------------------------------ Live listing ------------------------------ */

function Live({ onRestart }: { onRestart: () => void }) {
  const { state, update, addReceipt } = useStore();
  const l = state.listing;
  const [pending, setPending] = useState<string | null>(null);
  const [paid, setPaid] = useState<{ txId: string; href?: string; error?: string } | null>(null);
  const { live, refresh } = useLive();
  if (!l) return null;
  const listingId = l.listingId;

  async function patch(field: "consentSale" | "consentContact", v: boolean) {
    setPending(field);
    if (live) await api.patchListing(listingId, { [field]: v }).catch(() => undefined);
    await sleep(live ? 900 : 1400);
    const tx = evmHash();
    update((s) => (s.listing ? { ...s, listing: { ...s.listing, [field]: v } } : s));
    addReceipt({ kind: "consent", title: `${field === "consentSale" ? "consent_sale" : "consent_contact"} → ${v}`, chain: "arkiv", tx });
    setPending(null);
  }

  async function revoke() {
    setPending("revoke");
    if (live) await api.revokeListing(listingId).catch(() => undefined);
    await sleep(live ? 900 : 1400);
    update((s) => (s.listing ? { ...s, listing: { ...s.listing, live: false } } : s));
    addReceipt({ kind: "revoke", title: "listing deleted", chain: "arkiv", tx: evmHash() });
    setPending(null);
  }

  async function payout() {
    setPending("payout");
    if (live) {
      try {
        const r = await api.payout();
        update((s) => ({ ...s, earnings: { ...s.earnings, paid: s.earnings.sales + s.earnings.contacts } }));
        addReceipt({ kind: "payout", title: `Scheduled transfer · schedule ${r.scheduleId}`, chain: "hedera", tx: r.txId, amount: Number(r.amountHbar), href: r.hashscan });
        setPaid({ txId: r.txId, href: r.hashscan });
        refresh();
      } catch (e) {
        setPaid({ txId: "", error: (e as Error).message });
      }
      setPending(null);
      return;
    }
    await sleep(1500);
    const tx = hederaTxId(ACCOUNTS.treasury);
    update((s) => ({ ...s, earnings: { ...s.earnings, paid: s.earnings.sales + s.earnings.contacts } }));
    addReceipt({ kind: "payout", title: "Scheduled transfer", chain: "hedera", tx, amount: Number(pendingEarnings(state).toFixed(2)) });
    setPaid({ txId: tx });
    setPending(null);
  }

  const due = pendingEarnings(state);

  return (
    <div className="live-grid">
    <Panel
      label={l.live ? "LIVE ON ARKIV" : "REVOKED"}
      className={`listing-card${l.live ? " live" : " dead"}`}
      aside={
        <span className="row gap-s">
          <Hash value={l.entityKey} label="entity" />
          {l.live && <i className="pulse" />}
        </span>
      }
    >
      <div className="consent">
        <Toggle
          on={l.consentSale}
          disabled={!l.live || !!pending}
          onChange={(v) => void patch("consentSale", v)}
          label="Sell my record"
          hint={pending === "consentSale" ? "Updating on Arkiv…" : "Checked before every sale"}
        />
        <Toggle
          on={l.consentContact}
          disabled={!l.live || !!pending}
          onChange={(v) => void patch("consentContact", v)}
          label="Let buyers message me"
          hint={pending === "consentContact" ? "Updating on Arkiv…" : "Telegram · handle stays hidden"}
        />
      </div>
      <div className="listing-foot">
        <div className="earn">
          <small>YOUR HISSA</small>
          <b>
            <CountUp value={state.earnings.sales + state.earnings.contacts} decimals={2} /> <span>ℏ earned</span>
          </b>
          <span className="earn-sub">
            {due > 0 ? (
              <button className="link-btn" onClick={() => void payout()} disabled={!!pending}>
                {pending === "payout" ? "Paying out on Hedera…" : `Pay out ${due.toFixed(2)} ℏ`}
              </button>
            ) : paid?.error ? (
              <span className="muted">{paid.error}</span>
            ) : paid ? (
              <span className="muted">
                Paid out ✓ <Hash value={paid.txId} head={12} tail={4} href={paid.href} />
              </span>
            ) : state.earnings.paid > 0 ? (
              <span className="muted">Paid out ✓</span>
            ) : (
              <span className="muted">80% of every sale · paid messages</span>
            )}
          </span>
        </div>
        <div className="row gap-s wrap">
          {l.live ? (
            <Button variant="danger" onClick={() => void revoke()} disabled={!!pending}>
              Revoke
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
        </div>
      </div>
    </Panel>
    <Phone />
    </div>
  );
}
