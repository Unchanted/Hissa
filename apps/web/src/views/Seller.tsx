import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Chip, Console, CountUp, Hash, PageHead, Panel, Scramble, SponsorTag, Toggle, useLog, useOnce } from "../components/ui";
import { SAMPLE_EXPORT } from "../demo-data";
import { ACCOUNTS, PRICES, SELLER_SHARE, SOURCES } from "../config";
import { hex, isoWeek, sleep } from "../lib";
import { Phone } from "../components/Phone";
import { api, useLive } from "../live";
import { patchListingState, pendingEarnings, useStore, withListings, type Listing } from "../store";
import type { SignedUpload } from "../arkiv";
import { parseChatExport, type ChatData } from "../upload";
import { maskExtraNames, maskOnDevice, parseExtraWords, partsOf, preloadNer, useNerStatus, type MaskResult } from "../ner";
import { DOMAINS, ZG_NOTE, band, teeLabel } from "../zerog";
import "../ner.css";

const STEPS = ["Upload", "Mask", "Publish"];
type Review = { maskedText: string; facets: Record<string, unknown> };
type PendingDraft = { upload: SignedUpload; source: string; domain: string; region: string; week: string; expiryDays: number; consentSale: boolean; consentContact: boolean; consentInsights?: boolean };
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
  mentions: [{ subject: "serum", events: ["used", "abandoned"], price_judgement: "too_expensive" }],
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
  const age = typeof facets.age_band === "string" ? band(facets.age_band) : "";
  return [facets.domain_path, age, typeof facets.budget_consciousness === "string" ? `budget: ${facets.budget_consciousness}` : "", ...events, typeof first.price_judgement === "string" ? first.price_judgement.replace("_", " ") : ""]
    .filter((item): item is string => typeof item === "string" && !!item)
    .slice(0, 5);
}

/** Public domain tag: first segment of 0G's domain_path, from the shared list only. */
function domainOf(domainPath: unknown): string {
  const top = typeof domainPath === "string" ? domainPath.split(/[/>]/, 1)[0]?.trim().toLowerCase() ?? "" : "";
  return (DOMAINS as readonly string[]).includes(top) ? top : "other";
}

export function Seller() {
  const { state } = useStore();
  const [pendingState, setPendingState] = useState(loadPendingDraft);
  const [step, setStep] = useState(state.listings.length ? 3 : pendingState.draft ? 2 : 0);
  const [chat, setChat] = useState<ChatData | null>(null);
  const [review, setReview] = useState<Review | null>(null);

  useEffect(() => {
    if (pendingState.draft && state.listings.some((l) => l.listingId === pendingState.draft!.upload.listing.listing_id)) {
      clearPendingDraft();
      setPendingState({ draft: null, error: "" });
    }
  }, [state.listings, pendingState.draft]);

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
        {step === 3 && <Live onRestart={() => { setChat(null); setReview(null); setStep(pendingState.draft ? 2 : 0); }} />}
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
  const ner = useNerStatus();
  // Start downloading the on-device privacy model now, so it is ready by the Mask step.
  useEffect(() => preloadNer(), []);

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
      <p className="muted ner-status">
        {ner.state === "ready"
          ? `On-device privacy model ready${ner.ms ? ` · loaded in ${(ner.ms / 1000).toFixed(1)} s` : ""} · cached in this browser`
          : ner.state === "loading"
            ? `Loading on-device privacy model · ${ner.pct}%${ner.totalMb ? ` of ${Math.round(ner.totalMb)} MB` : ""} (first time only)`
            : ner.state === "failed"
              ? `On-device privacy model unavailable${ner.error ? ` (${ner.error})` : ""} · basic masking only`
              : "Masking runs in your browser. Nothing leaves this device unmasked."}
      </p>
      {error && <p className="muted" role="alert">{error}</p>}
      <div className="row end">
        <Button onClick={() => onDone(sampleChat())} disabled={busy}>
          Use sample export
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------ 2 Mask on device + 0G classify ------------------------------ */

/** 0G classifies a sample of the masked text; the full masked text is stored encrypted on Arkiv. */
const ZG_SAMPLE_CHARS = 12_000;
/** Chat lines drawn on screen; masking always covers every message. */
const DISPLAY_LINES = 300;

/** Lines spread evenly across the whole chat, up to `max` characters, in their original order. */
function spreadSample(text: string, max: number): string {
  if (text.length <= max) return text;
  const lines = text.split("\n").filter((l) => l.trim());
  const avg = text.length / Math.max(lines.length, 1);
  const step = Math.max(1, Math.ceil((lines.length * avg) / max));
  const out: string[] = [];
  let n = 0;
  for (let i = 0; i < lines.length && n < max; i += step) {
    out.push(lines[i]!);
    n += lines[i]!.length + 1;
  }
  return out.join("\n");
}

function Mask({ chat, onDone }: { chat: ChatData; onDone: (review: Review) => void }) {
  const { addReceipt } = useStore();
  const { zg } = useLive();
  const ner = useNerStatus();
  const selfLines = useMemo(() => chat.lines.filter((l) => l.role === "self").map((l) => l.text), [chat]);
  const [maskPct, setMaskPct] = useState(0);
  const [sampled, setSampled] = useState(false);
  const [phase, setPhase] = useState(0); // 1 drop others · 2 masked · 3 0G · 4 done
  const [mask, setMask] = useState<MaskResult | null>(null);
  const [maskedText, setMaskedText] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [facets, setFacets] = useState<Record<string, unknown>>({});
  const [zgDone, setZgDone] = useState<{ reqId: string; note: string } | null>(null);
  const [zgNote, setZgNote] = useState("");
  const [simulated, setSimulated] = useState(false);
  const [extra, setExtra] = useState("");
  const [extraNote, setExtraNote] = useState("");
  const ran = useRef(false);

  // 1 · drop other people's messages; 2 · mask on this device (rules + NER model in a worker).
  useOnce(() => {
    const t0 = Date.now();
    setTimeout(() => setPhase(1), 700);
    void maskOnDevice(selfLines.join("\n"), { timeoutMs: 120_000, onProgress: (d, t) => setMaskPct(Math.round((d / t) * 100)) }).then(async (r) => {
      const wait = 1600 - (Date.now() - t0);
      if (wait > 0) await sleep(wait);
      setMask(r);
      setMaskedText(r.masked);
      setPhase(2);
      // Let the scramble play, then hand the masked text to 0G.
      setTimeout(() => setPhase(3), 900 + Math.min(r.spans.length, 12) * 220);
    });
  });

  // 3 · 0G Private Computer classifies the masked text (it never sees the originals).
  useEffect(() => {
    if (phase !== 3 || ran.current) return;
    ran.current = true;
    if (!zg) {
      if (chat.sample) {
        setFacets(SAMPLE_FACETS);
        setSimulated(true);
        setZgNote("0G not connected · sample facets, simulated");
      } else setZgNote("0G not connected · no facets; the listing will be tagged \"other\"");
      setPhase(4);
      return;
    }
    const sample = spreadSample(maskedText, ZG_SAMPLE_CHARS);
    setSampled(sample.length < maskedText.length);
    api
      .analyseUpload(sample)
      .then((result) => {
        setFacets(result.facets);
        setZgDone({ reqId: result.receipt.request_id, note: teeLabel(result.receipt) });
        setZgNote(`${result.receipt.tee_verified ? "TEE verified" : "sealed"} · ${result.receipt.model} · ${(result.receipt.latency_ms / 1000).toFixed(1)} s`);
        addReceipt({ kind: "inference", title: `upload classified · ${teeLabel(result.receipt)}`, chain: "0g", tx: result.receipt.request_id });
      })
      .catch((error: Error) => {
        if (chat.sample) {
          setFacets(SAMPLE_FACETS);
          setSimulated(true);
        }
        setZgNote(`0G unavailable · ${error.message}${chat.sample ? " · sample facets, simulated" : ""}`);
      })
      .finally(() => setPhase(4));
  }, [phase, zg, chat.sample, maskedText, addReceipt]);

  /** Re-masks extra words the model missed, on this device, before (or again for) classification. */
  function applyExtra() {
    const words = parseExtraWords(extra);
    if (!mask || !words.length) return;
    const r = maskExtraNames(maskedText, words);
    if (!r.spans.length) return setExtraNote("None of those words appear in the masked text.");
    setMask({ ...mask, spans: [...mask.spans, ...r.spans] });
    setMaskedText(r.masked);
    setReviewed(false);
    setExtra("");
    setExtraNote(`Hid ${new Set(r.spans.map((x) => x.ph)).size} more name(s).`);
    if (phase >= 4) {
      // Classification already ran on the old text: run it again on the new masked text.
      ran.current = false;
      setFacets({});
      setZgDone(null);
      setZgNote("");
      setSimulated(false);
      setPhase(3);
    }
  }

  const spans = mask?.spans ?? [];
  const order = new Map(spans.map((s, i) => [s.ph, i]));
  const chips = facetChips(facets);
  const needsReview = mask?.mode === "rules";
  let selfIndex = 0;

  return (
    <div className="stack">
      <Panel
        label="ON YOUR DEVICE"
        aside={
          <span className="row gap-s">
            <NerBadge />
            {phase >= 2 && <Chip tone="gold">{new Set(spans.map((x) => x.ph)).size} identifiers hidden</Chip>}
          </span>
        }
      >
        <div className="chat">
          {chat.lines.slice(0, DISPLAY_LINES).map((line, i) => {
            const dropped = phase >= 1 && line.role !== "self";
            const mine = line.role === "self" ? selfIndex++ : -1;
            const parts = mine >= 0 && mask ? partsOf(selfLines[mine]!, spans) : [line.text];
            return (
              <div key={i} className={`msg msg-${line.role}${dropped ? " dropped" : ""}`}>
                {dropped && <span className="drop-tag">NOT YOURS · DROPPED</span>}
                <p>
                  {parts.map((part, j) =>
                    typeof part === "string" ? (
                      <span key={j}>{part}</span>
                    ) : (
                      <Scramble key={j} from={part.orig} to={part.ph} go={phase >= 2} delay={(order.get(part.ph) ?? 0) * 220} />
                    ),
                  )}
                </p>
              </div>
            );
          })}
        </div>
        {chat.lines.length > DISPLAY_LINES && (
          <p className="muted ner-note">
            Showing the first {DISPLAY_LINES} of {chat.lines.length} messages · all {selfLines.length} of yours are masked
          </p>
        )}
        {phase < 2 && (
          <p className="muted ner-note">
            Masking on this device{ner.state === "loading" ? ` · loading model ${ner.pct}%` : maskPct ? ` · ${maskPct}%` : "…"}
          </p>
        )}
        {sampled && phase >= 3 && (
          <p className="muted ner-note">
            0G read a {ZG_SAMPLE_CHARS.toLocaleString("en-IN")}-character sample spread across your {maskedText.length.toLocaleString("en-IN")} masked characters; all of it is stored encrypted.
          </p>
        )}
        {mask?.warning && (
          <p className="ner-warn" role="alert">
            {mask.warning}
          </p>
        )}
        {phase >= 2 && (!chat.sample || needsReview) && (
          <label className="muted ner-review">
            Review masked text (this is all that leaves your device)
            <textarea value={maskedText} onChange={(event) => setMaskedText(event.target.value)} rows={5} disabled={phase === 3} />
          </label>
        )}
        {phase >= 2 && (
          <div className="row gap-s wrap ner-extra">
            <label className="muted">
              Other names or words to hide (comma-separated)
              <input
                type="text"
                value={extra}
                placeholder="e.g. swapnil, anand"
                disabled={phase === 3}
                onChange={(e) => setExtra(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && applyExtra()}
              />
            </label>
            <Button onClick={applyExtra} disabled={phase === 3 || !parseExtraWords(extra).length}>
              Apply
            </Button>
            {extraNote && <small className="muted">{extraNote}</small>}
          </div>
        )}
        <p className="muted ner-note" role="note">
          Names and places are masked by a model running in your browser; emails, phones and IDs by rules. Brands are kept. Review before publishing.
        </p>
        {needsReview && phase >= 4 && (
          <label className="ner-check">
            <input type="checkbox" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} /> I reviewed the masked text
          </label>
        )}
      </Panel>
      <div className={`og-strip${phase >= 3 ? " on" : ""}${phase >= 4 ? " done" : ""}`}>
        <SponsorTag who="0G" />
        <span className="og-label">
          {phase >= 4 ? (zgDone ? "Classified in TEE" : simulated ? "Sample facets" : "Masked text ready") : phase >= 3 ? "Classifying in TEE…" : "0G Private Computer · classify"}
          {zgNote && <small className="og-note">{zgNote}</small>}
        </span>
        <div className="og-chips">
          {phase >= 4 &&
            chips.map((c, i) => (
              <span key={c} className="facet-chip" style={{ ["--i" as string]: i }}>
                {c}
              </span>
            ))}
          {phase >= 4 && simulated && <Chip>simulated</Chip>}
        </div>
        {phase >= 4 && zgDone && <Hash value={zgDone.reqId} label="req" note={ZG_NOTE} />}
        <Button onClick={() => onDone({ maskedText, facets })} disabled={phase < 4 || (needsReview && !reviewed)}>
          Continue →
        </Button>
      </div>
    </div>
  );
}

/** Status of the on-device privacy model. */
function NerBadge() {
  const s = useNerStatus();
  if (s.state === "ready") return <Chip tone="ok">on-device model ready</Chip>;
  if (s.state === "failed") return <Chip tone="warn">on-device model unavailable</Chip>;
  if (s.state === "loading") return <Chip>loading privacy model · {s.pct}%</Chip>;
  return null;
}

/* ------------------------------ 3 Consent + publish ------------------------------ */

type TgState = "off" | "linking" | "linked";

/** Coarse, self-declared region tag; masking hides place names, so 0G cannot infer it. */
const REGION_CHOICES = [
  ["IN", "India"],
  ["IN-west", "West"],
  ["IN-north", "North"],
  ["IN-south", "South"],
  ["IN-east", "East"],
] as const;

function Publish({ chat, review, initialDraft, onDone }: { chat?: ChatData; review?: Review; initialDraft?: PendingDraft; onDone: () => void }) {
  const { update, addReceipt } = useStore();
  const [sale, setSale] = useState(initialDraft?.consentSale ?? true);
  const [insights, setInsights] = useState(initialDraft?.consentInsights ?? true);
  const [tg, setTg] = useState<TgState>(initialDraft?.consentContact ? "linked" : "off");
  const [days, setDays] = useState(initialDraft?.expiryDays ?? 30);
  const [region, setRegion] = useState(initialDraft?.region ?? (chat?.sample ? "IN-west" : "IN"));
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
        const domain = domainOf(review.facets.domain_path);
        const metadata = {
          source: chat.source,
          domain,
          region,
          week: isoWeek(),
          expiryDays: days,
          consentSale: sale,
          consentContact: tg === "linked",
          consentInsights: insights,
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
      update((s) => withListings(s, [
        ...s.listings.filter((x) => x.listingId !== result.listingId),
        {
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
          domain: currentDraft.domain,
          region: currentDraft.region,
        },
      ]));
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

  const tags = [
    ["domain", review ? domainOf(review.facets.domain_path) : draft?.domain ?? "other"],
    ["region", draft?.region ?? region],
    ["week", draft?.week ?? isoWeek()],
    ["price", `${PRICES.record} ℏ`],
    ["consent_sale", String(draft?.consentSale ?? sale)],
    ["consent_contact", String(draft?.consentContact ?? (tg === "linked"))],
    ["consent_insights", String(draft?.consentInsights ?? insights)],
  ];

  return (
    <div className="two">
      <Panel label="YOU DECIDE">
        <div className="stack">
          <Toggle on={sale} disabled={!!prepared || publishing} onChange={setSale} label="Sell my record" hint={`${PRICES.record} ℏ · you keep ${SELLER_SHARE * 100}%`} />
          <Toggle
            on={insights}
            disabled={!!prepared || publishing}
            onChange={setInsights}
            label="Include me in anonymised analytics"
            hint="Counted in reports of 50+ people, never quoted · paid per report"
          />
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
            <small className="muted">Region</small>
            {REGION_CHOICES.map(([id, label]) => (
              <button key={id} className={id === region ? "on" : ""} onClick={() => setRegion(id)} disabled={!!prepared || publishing} title={id}>
                {label}
              </button>
            ))}
          </div>
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
          <Button onClick={() => void publish()} disabled={publishing || (!sale && !insights && tg !== "linked") || tg === "linking"}>
            {prepared ? "Retry signed upload" : "Encrypt & publish"}
          </Button>
        </div>
      </Panel>
    </div>
  );
}

/* ------------------------------ Live listing ------------------------------ */


function Live({ onRestart }: { onRestart: () => void }) {
  const { state, update, addReceipt } = useStore();
  const [pending, setPending] = useState<string | null>(null);
  const [paid, setPaid] = useState<{ txId: string; href?: string; error?: string } | null>(null);
  const { live, balances, refresh } = useLive();
  if (!state.listings.length) return null;

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
  // Newest first.
  const listings = [...state.listings].reverse();

  return (
    <div className="live-grid">
      <div className="stack">
        <div className="row end">
          <Button onClick={onRestart}>Upload more data</Button>
        </div>
        {listings.map((l) => (
          <ListingCard key={l.listingId} l={l} busy={pending === "payout"} />
        ))}
        <Panel label="YOUR HISSA">
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
        </Panel>
      </div>
      <Phone />
    </div>
  );
}

/** One listing: its own version, control key (server side), consent toggles and revoke. */
function ListingCard({ l, busy }: { l: Listing; busy: boolean }) {
  const { update, addReceipt } = useStore();
  const [pending, setPending] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const { live, refresh } = useLive();
  const listingId = l.listingId;

  async function recoverListing(message: string) {
    try {
      const current = await api.listing(listingId);
      update((s) => patchListingState(s, listingId, { entityKey: current.entityKey, consentSale: current.consentSale, consentContact: current.consentContact, version: current.version, expiresAt: current.expiresAt }));
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
      update((s) => patchListingState(s, listingId, { [field]: v, version: result.version, txHash: result.txHash }));
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
      update((s) => patchListingState(s, listingId, { live: false, txHash: result.txHash }));
      addReceipt({ kind: "revoke", title: "listing revoked", chain: "arkiv", tx: result.txHash, arkivEntityKey: l.entityKey });
      refresh();
    } catch (cause) {
      setActionError(await recoverListing((cause as Error).message));
    } finally {
      setPending(null);
    }
  }

  const off = !!pending || busy;
  return (
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
      <div className="tags">
        <span className="tag"><small>id</small>{l.listingId}</span>
        {l.domain && <span className="tag"><small>domain</small>{l.domain}</span>}
        {l.region && <span className="tag"><small>region</small>{l.region}</span>}
        <span className="tag"><small>version</small>{l.version}</span>
      </div>
      <div className="consent">
        <Toggle
          on={l.consentSale}
          disabled={!l.live || off}
          onChange={(v) => void patch("consentSale", v)}
          label="Sell my record"
          hint={pending === "consentSale" ? "Updating on Arkiv…" : "Checked before every sale"}
        />
        <Toggle
          on={l.consentContact}
          disabled={!l.live || off}
          onChange={(v) => void patch("consentContact", v)}
          label="Let buyers message me"
          hint={pending === "consentContact" ? "Updating on Arkiv…" : "Telegram · handle stays hidden"}
        />
      </div>
      {actionError && <p className="muted" role="alert">{actionError}</p>}
      {l.live && (
        <div className="listing-foot">
          <div className="row gap-s wrap">
            <Button variant="danger" onClick={() => void revoke()} disabled={off}>
              {pending === "revoke" ? "Revoking…" : "Revoke"}
            </Button>
          </div>
        </div>
      )}
    </Panel>
  );
}
