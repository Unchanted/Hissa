import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Chip, Console, CountUp, Hash, PageHead, Panel, Scramble, SponsorTag, Toggle, useLog, useOnce } from "../components/ui";
import { SAMPLE_EXPORT, type Pii } from "../demo-data";
import { ACCOUNTS, PRICES, SELLER_SHARE, SOURCES } from "../config";
import { hex, isoWeek, ogRequestId, sleep } from "../lib";
import { Phone } from "../components/Phone";
import { api, useLive } from "../live";
import { pendingEarnings, useStore } from "../store";
import type { SignedUpload } from "../arkiv";
import { parseChatExport, maskBasicText, type ChatData } from "../upload";

const STEPS = ["Upload", "Mask", "Publish"];
const FACET_CHIPS = ["beauty / skincare / serum", "18–24", "budget: high", "abandoned", "too expensive"];
type Review = { maskedText: string; facets: Record<string, unknown> };
type PendingDraft = { upload: SignedUpload; source: string; domain: string; region: string; week: string; expiryDays: number; consentSale: boolean; consentContact: boolean };
const PENDING_DRAFT_KEY = "hissa.arkiv.pending.v0";

function loadPendingDraft(): { draft: PendingDraft | null; error: string } {
  try {
    const raw = sessionStorage.getItem(PENDING_DRAFT_KEY);
    if (!raw) return { draft: null, error: "" };
    const draft = JSON.parse(raw) as PendingDraft;
    if (!draft.upload?.listing?.listing_id || !draft.upload.signature) throw new Error("Saved listing request is incomplete.");
    return { draft, error: "" };
  } catch (cause) {
    return { draft: null, error: `A saved Arkiv request could not be read: ${(cause as Error).message}` };
  }
}

function savePendingDraft(draft: PendingDraft) {
  try {
    sessionStorage.setItem(PENDING_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    throw new Error("Browser session storage is unavailable; the signed request was not submitted.");
  }
}

function clearPendingDraft() {
  sessionStorage.removeItem(PENDING_DRAFT_KEY);
}

const SAMPLE_FACETS: Record<string, unknown> = {
  domain_path: "beauty/skincare/serum",
  age_band: "18–24",
  budget_consciousness: "high",
  mentions: [{ subject: "serum", events: ["abandoned", "too expensive"], price_judgement: "too_expensive" }],
};

function sampleChat(): ChatData {
  return {
    source: SAMPLE_EXPORT.source,
    sample: true,
    lines: SAMPLE_EXPORT.messages.map((message) => ({
      role: message.role === "self" ? "self" : message.role,
      text: message.parts.map((part) => (typeof part === "string" ? part : part.orig)).join(""),
    })),
  };
}

function facetChips(facets: Record<string, unknown>): string[] {
  const mentions = Array.isArray(facets.mentions) ? facets.mentions : [];
  const first = mentions[0] && typeof mentions[0] === "object" ? mentions[0] as Record<string, unknown> : {};
  const events = Array.isArray(first.events) ? first.events.filter((item): item is string => typeof item === "string").slice(0, 2) : [];
  return [facets.domain_path, facets.age_band, typeof facets.budget_consciousness === "string" ? `budget: ${facets.budget_consciousness}` : "", ...events, typeof first.price_judgement === "string" ? first.price_judgement.replace("_", " ") : ""]
    .filter((item): item is string => typeof item === "string" && !!item)
    .slice(0, 5);
}

export function Seller() {
  const { state } = useStore();
  const [pendingState, setPendingState] = useState(loadPendingDraft);
  const [step, setStep] = useState(state.listing ? 3 : pendingState.draft ? 2 : 0);
  const [chat, setChat] = useState<ChatData | null>(null);
  const [review, setReview] = useState<Review | null>(null);

  useEffect(() => {
    if (state.listing && pendingState.draft?.upload.listing.listing_id === state.listing.listingId) {
      clearPendingDraft();
      setPendingState({ draft: null, error: "" });
    }
  }, [state.listing, pendingState.draft]);

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
        {step === 0 && (pendingState.error ? <p className="muted" role="alert">{pendingState.error}</p> : <Upload onDone={(data) => { setChat(data); setReview(null); setStep(1); }} />)}
        {step === 1 && chat && <Mask chat={chat} onDone={(data) => { setReview(data); setStep(2); }} />}
        {step === 2 && (pendingState.draft ? <Publish initialDraft={pendingState.draft} onDone={() => { setPendingState({ draft: null, error: "" }); setStep(3); }} /> : chat && review ? <Publish chat={chat} review={review} onDone={() => setStep(3)} /> : null)}
        {step === 3 && <Live onRestart={() => setStep(0)} />}
      </div>
    </div>
  );
}

/* ------------------------------ 1 Upload ------------------------------ */

function Upload({ onDone }: { onDone: (chat: ChatData) => void }) {
  const [drag, setDrag] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function start(file: File) {
    if (busy) return;
    setBusy(true);
    setError("");
    setStatus(`Reading ${file.name}…`);
    try {
      if (file.size > 5_000_000) throw new Error("Choose a JSON export under 5 MB or split it into conversations first.");
      const parsed = parseChatExport(await file.text());
      setStatus(`${parsed.lines.length} messages · ${parsed.lines.filter((line) => line.role === "self").length} are yours`);
      await sleep(350);
      onDone(parsed);
    } catch (cause) {
      setError((cause as Error).message);
      setStatus("");
      setBusy(false);
    }
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
          if (f) void start(f);
        }}
        onClick={() => !busy && input.current?.click()}
      >
        <input
          ref={input}
          type="file"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void start(f);
          }}
        />
        <div className="drop-rings" aria-hidden>
          <i />
          <i />
          <i />
          <span>↓</span>
        </div>
        <b>{status || "Drop a chat export"}</b>
        <small>ChatGPT or Claude JSON · messages with explicit user roles</small>
      </div>
      {error && <p className="muted" role="alert">{error}</p>}
      <div className="row end">
        <Button onClick={() => onDone(sampleChat())} disabled={busy}>
          Use sample export
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------ 2 Mask + 0G ------------------------------ */

function Mask({ chat, onDone }: { chat: ChatData; onDone: (review: Review) => void }) {
  const msgs = SAMPLE_EXPORT.messages;
  const [phase, setPhase] = useState(0);
  const [reqId, setReqId] = useState(ogRequestId);
  const [facets, setFacets] = useState<Record<string, unknown>>(chat.sample ? SAMPLE_FACETS : {});
  const [maskedText, setMaskedText] = useState(chat.sample
    ? msgs.filter((message) => message.role === "self").map((message) => message.parts.map((part) => typeof part === "string" ? part : part.ph).join("")).join("\n")
    : maskBasicText(chat.lines.filter((line) => line.role === "self").map((line) => line.text).join("\n")));
  const [zgNote, setZgNote] = useState("");
  const chips = chat.sample ? FACET_CHIPS : facetChips(facets);
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

  useEffect(() => {
    if (phase !== 3 || ran.current) return;
    ran.current = true;
    if (!zg) {
      setZgNote(chat.sample ? "sample preview · no live 0G result" : "0G unavailable · local mask only");
      setPhase(4);
      return;
    }
    api.analyseUpload(maskedText)
      .then((result) => {
        setMaskedText(result.maskedText);
        setFacets(result.facets);
        setReqId(result.receipt.request_id);
        setZgNote(`${result.receipt.tee_verified ? "TEE verified" : "sealed"} · ${result.receipt.model}${result.extraIdentifiers.length ? ` · +${result.extraIdentifiers.length} identifiers caught` : ""}`);
      })
      .catch((error: Error) => setZgNote(`0G unavailable · ${error.message}`))
      .finally(() => setPhase(4));
  }, [phase, zg, chat.sample, maskedText]);

  return (
    <div className="stack">
      <Panel label="ON YOUR DEVICE" aside={phase >= 2 && <Chip tone="gold">{chat.sample ? order.size : (maskedText.match(/\[(?:EMAIL|PHONE)_\d+\]/g) ?? []).length} identifiers hidden</Chip>}>
        {chat.sample ? (
          <div className="chat">
            {msgs.map((message, i) => {
              const dropped = phase >= 1 && message.role !== "self";
              return <div key={i} className={`msg msg-${message.role}${dropped ? " dropped" : ""}`}>{dropped && <span className="drop-tag">NOT YOURS · DROPPED</span>}<p>{message.parts.map((part, j) => typeof part === "string" ? <span key={j}>{part}</span> : <Scramble key={j} from={part.orig} to={part.ph} go={phase >= 2} delay={(order.get(part) ?? 0) * 280} />)}</p></div>;
            })}
          </div>
        ) : (
          <div className="chat">
            {chat.lines.map((line, i) => {
              const dropped = phase >= 1 && line.role !== "self";
              return <div key={i} className={`msg msg-${line.role}${dropped ? " dropped" : ""}`}>{dropped && <span className="drop-tag">NOT YOURS · DROPPED</span>}<p>{line.text}</p></div>;
            })}
          </div>
        )}
        {!chat.sample && <label className="muted">Review masked text<textarea value={maskedText} onChange={(event) => setMaskedText(event.target.value)} rows={5} disabled={phase === 3} /></label>}
        <p className="muted" role="note">Basic email and phone masking only. Review carefully; this does not remove every personal detail.</p>
      </Panel>
      <div className={`og-strip${phase >= 3 ? " on" : ""}${phase >= 4 ? " done" : ""}`}>
        <SponsorTag who="0G" />
        <span className="og-label">
          {phase >= 4 ? (zgNote.includes("TEE") || zgNote.includes("sealed") ? "Facets extracted in TEE" : "Masked text ready") : phase >= 3 ? "Extracting in TEE…" : "0G Private Computer"}
          {zgNote && <small className="og-note">{zgNote}</small>}
        </span>
        <div className="og-chips">
          {phase >= 4 && chips.map((c, i) => <span key={c} className="facet-chip" style={{ ["--i" as string]: i }}>{c}</span>)}
        </div>
        {phase >= 4 && zg && <Hash value={reqId} label="req" />}
        <Button onClick={() => onDone({ maskedText, facets })} disabled={phase < 4}>Continue →</Button>
      </div>
    </div>
  );
}

/* ------------------------------ 3 Consent + publish ------------------------------ */

type TgState = "off" | "linking" | "linked";

function Publish({ chat, review, initialDraft, onDone }: { chat?: ChatData; review?: Review; initialDraft?: PendingDraft; onDone: () => void }) {
  const { update, addReceipt } = useStore();
  const [sale, setSale] = useState(initialDraft?.consentSale ?? true);
  const [tg, setTg] = useState<TgState>(initialDraft?.consentContact ? "linked" : "off");
  const [days, setDays] = useState(initialDraft?.expiryDays ?? 30);
  const [sealing, setSealing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<PendingDraft | null>(initialDraft ?? null);
  const [prepared, setPrepared] = useState<SignedUpload | null>(initialDraft?.upload ?? null);
  const [cipher, setCipher] = useState("");
  const log = useLog();
  const { live, accounts } = useLive();

  async function toggleContact(on: boolean) {
    if (!on) return setTg("off");
    setTg("linking");
    await sleep(1300);
    setTg("linked");
  }

  async function publish() {
    if (publishing) return;
    if (!live || !accounts?.seller) return setError("Arkiv API is unavailable. Start the API and try again; no listing was created.");
    setError("");
    setPublishing(true);
    setSealing(true);
    try {
      let currentDraft = draft;
      let upload = prepared;
      if (!upload) {
        if (!chat || !review) throw new Error("The reviewed listing data is unavailable. Return to upload and prepare it again.");
        const listingId = `lst_${hex(4)}`;
        const domainPath = typeof review.facets.domain_path === "string" ? review.facets.domain_path : "other";
        const domain = domainPath.split(/[/>]/, 1)[0]?.toLowerCase().replace(/[^a-z0-9_-]/g, "") || "other";
        const metadata = {
          source: chat.source,
          domain,
          region: chat.sample ? "IN-west" : "IN",
          week: isoWeek(),
          expiryDays: days,
          consentSale: sale,
          consentContact: tg === "linked",
        };
        upload = await api.prepareListing({
          listingId,
          ...metadata,
          facets: review.facets,
          maskedText: review.maskedText,
          expiresInDays: days,
          payoutAccount: accounts.seller,
        });
        currentDraft = { upload, ...metadata };
        savePendingDraft(currentDraft);
        setDraft(currentDraft);
      }
      if (!currentDraft) throw new Error("The signed listing request is missing its saved metadata.");
      setPrepared(upload);
      setCipher(upload.listing.ciphertext.slice(-900));
      log.push("encrypt masked record · AES-256-GCM", "ok");
      log.push("seal record key and seller controls to service key", "ok");
      log.push("POST /api/listings · signed version 0", "arkiv");
      const result = await api.registerListing(upload);
      log.push(<>live ✓ <Hash value={result.txHash} /></>, "arkiv");
      clearPendingDraft();
      update((s) => ({
        ...s,
        listing: {
          listingId: result.listingId,
          entityKey: result.entityKey,
          txHash: result.txHash,
          expiresAt: result.expiresAt,
          version: result.version,
          consentSale: currentDraft.consentSale,
          consentContact: currentDraft.consentContact,
          expiryDays: currentDraft.expiryDays,
          publishedAt: Date.now(),
          live: true,
        },
      }));
      addReceipt({ kind: "listing", title: `${currentDraft.domain} · ${currentDraft.region} · silver`, chain: "arkiv", tx: result.txHash, arkivEntityKey: result.entityKey });
      await sleep(350);
      onDone();
    } catch (cause) {
      setError((cause as Error).message);
      setSealing(false);
    } finally {
      setPublishing(false);
    }
  }

  if (sealing)
    return (
      <div className="two">
        <Panel label="ENCRYPTING" className="cipher-panel">
          <div className={`cipher${log.lines.length >= 4 ? " sealed" : ""}`}>{cipher}</div>
          {log.lines.length >= 4 && <div className="sealed-stamp">SEALED</div>}
        </Panel>
        <Console title="publish" lines={log.lines} busy={publishing} height={250} />
      </div>
    );

  const domainPath = typeof review?.facets.domain_path === "string" ? review.facets.domain_path : draft?.domain ?? "other";
  const tags = [
    ["domain", domainPath],
    ["region", draft?.region ?? (chat?.sample ? "IN-west" : "IN")],
    ["week", draft?.week ?? isoWeek()],
    ["price", `${PRICES.record} ℏ`],
    ["consent_sale", String(draft?.consentSale ?? sale)],
    ["consent_contact", String(draft?.consentContact ?? (tg === "linked"))],
    ["consent_insights", "false"],
  ];

  return (
    <div className="two">
      <Panel label="YOU DECIDE">
        <div className="stack">
          <Toggle on={sale} disabled={!!prepared || publishing} onChange={setSale} label="Sell my record" hint={`${PRICES.record} ℏ · you keep ${SELLER_SHARE * 100}%`} />
          <Toggle
            on={tg !== "off"}
            disabled={!!prepared || publishing}
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
              <button key={d} className={d === days ? "on" : ""} onClick={() => setDays(d)} disabled={!!prepared || publishing}>
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
        <p className="note">Chat excerpts and facets are encrypted. No name, wallet, or Telegram handle is public.</p>
        {error && <p className="muted" role="alert">{error}</p>}
        <div className="row end">
          <Button onClick={() => void publish()} disabled={publishing || (!sale && tg !== "linked") || tg === "linking"}>
            {prepared ? "Retry signed upload" : "Encrypt &amp; publish"}
          </Button>
        </div>
      </Panel>
    </div>
  );
}

/* ------------------------------ Live listing ------------------------------ */

function Live({ onRestart }: { onRestart: () => void }) {
  const { state, update, addReceipt } = useStore();
  const storedListing = state.listing;
  const [pending, setPending] = useState<string | null>(null);
  const [paid, setPaid] = useState<{ txId: string; href?: string; error?: string } | null>(null);
  const [actionError, setActionError] = useState("");
  const { live, balances, refresh } = useLive();
  if (!storedListing) return null;
  const l = storedListing;
  const listingId = l.listingId;

  async function recoverListing(message: string) {
    try {
      const current = await api.listing(listingId);
      update((s) => s.listing ? { ...s, listing: { ...s.listing, entityKey: current.entityKey, consentSale: current.consentSale, consentContact: current.consentContact, version: current.version, expiresAt: current.expiresAt } } : s);
      return `${message} Current listing state was refreshed; retry the action if needed.`;
    } catch {
      return message;
    }
  }

  async function patch(field: "consentSale" | "consentContact", v: boolean) {
    setPending(field);
    setActionError("");
    try {
      if (!live) throw new Error("Arkiv API is unavailable; consent was not changed.");
      const result = await api.patchListing(listingId, { [field]: v }, l.version);
      update((s) => (s.listing ? { ...s, listing: { ...s.listing, [field]: v, version: result.version, txHash: result.txHash } } : s));
      addReceipt({ kind: "consent", title: `${field === "consentSale" ? "consent_sale" : "consent_contact"} → ${v}`, chain: "arkiv", tx: result.txHash, arkivEntityKey: l.entityKey });
      refresh();
    } catch (cause) {
      setActionError(await recoverListing((cause as Error).message));
    } finally {
      setPending(null);
    }
  }

  async function revoke() {
    setPending("revoke");
    setActionError("");
    try {
      if (!live) throw new Error("Arkiv API is unavailable; the listing was not revoked.");
      const result = await api.revokeListing(listingId, l.version);
      update((s) => (s.listing ? { ...s, listing: { ...s.listing, live: false, txHash: result.txHash } } : s));
      addReceipt({ kind: "revoke", title: "listing revoked", chain: "arkiv", tx: result.txHash, arkivEntityKey: l.entityKey });
      refresh();
    } catch (cause) {
      setActionError(await recoverListing((cause as Error).message));
    } finally {
      setPending(null);
    }
  }

  async function payout() {
    setPending("payout");
    setPaid(null);
    try {
      if (!live) throw new Error("Hedera API is unavailable; payout was not submitted.");
      const r = await api.payout();
      update((s) => ({ ...s, earnings: { ...s.earnings, paid: s.earnings.sales + s.earnings.contacts } }));
      addReceipt({ kind: "payout", title: `Scheduled transfer · schedule ${r.scheduleId}`, chain: "hedera", tx: r.txId, amount: Number(r.amountHbar), href: r.hashscan });
      setPaid({ txId: r.txId, href: r.hashscan });
      refresh();
    } catch (cause) {
      setPaid({ txId: "", error: (cause as Error).message });
    } finally {
      setPending(null);
    }
  }

  const due = live ? balances?.owedToSeller ?? 0 : 0;

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
      {actionError && <p className="muted" role="alert">{actionError}</p>}
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
            ) : live && !balances ? (
              <span className="muted">Checking authoritative seller balance…</span>
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
