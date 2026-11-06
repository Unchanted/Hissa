// Top-level Preflight-origin window opened by a user click in the slot frame. It reads
// first-party Preflight storage, lets the user approve coarse topics and, separately,
// grant per-origin personalization consent for this session, then hands only those to
// the frame that opened it. Nothing here imports hygiene state.
import { useEffect, useMemo, useState } from 'react';
import {
  ApprovedOfferTopics,
  Consent,
  FrameRevokedMessage,
  Nonce,
  OfferTopic,
  type PrefsMessage,
  type RevokeMessage,
} from '@preflight/shared/offers';
import { PUBLISHER_REGISTRY } from '../config.js';

const TOPIC_STORE = 'preflight.topics.v1';
const NOTICE_VERSION = 'offers-notice-1';
const SESSION_MINUTES = 30;

const TOPIC_LABEL: Record<OfferTopic, string> = {
  education: 'Learning about crypto',
  'hardware-wallets': 'Hardware wallets',
  'developer-tools': 'Developer tools',
};

// Local keyword suggestions from text the user typed. Never from wallet, plan or risk data.
const SUGGEST: Array<[RegExp, OfferTopic]> = [
  [/hardware|ledger|trezor|cold (wallet|storage)/i, 'hardware-wallets'],
  [/learn|course|explain|understand|education|stablecoin/i, 'education'],
  [/develop|build|code|sdk|solidity|devtool/i, 'developer-tools'],
];

function loadApproved(): ApprovedOfferTopics | null {
  try {
    const raw = localStorage.getItem(TOPIC_STORE);
    if (!raw) return null;
    const p = ApprovedOfferTopics.safeParse(JSON.parse(raw));
    return p.success ? p.data : null;
  } catch {
    return null;
  }
}

function storeApproved(a: ApprovedOfferTopics | null) {
  try {
    if (a) localStorage.setItem(TOPIC_STORE, JSON.stringify(a));
    else localStorage.removeItem(TOPIC_STORE);
  } catch {
    /* first-party storage unavailable: approval lives only in this window */
  }
}

export function Handoff() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const publisherId = params.get('publisher') ?? '';
  const nonceParsed = Nonce.safeParse(params.get('n'));
  const reg = PUBLISHER_REGISTRY.find((r) => r.publisherId === publisherId) ?? null;
  const opener = (window.opener as Window | null) ?? null;
  const linked = !!reg && nonceParsed.success && !!opener;

  const [approved, setApproved] = useState<ApprovedOfferTopics | null>(() => loadApproved());
  const [interest, setInterest] = useState('');
  const [picked, setPicked] = useState<Set<OfferTopic>>(() => new Set(loadApproved()?.topics ?? []));
  const [consentChecked, setConsentChecked] = useState(false);
  const [sent, setSent] = useState<'none' | 'personalized' | 'revoked'>('none');

  const suggestions = useMemo(() => {
    const out = new Set<OfferTopic>();
    for (const [re, t] of SUGGEST) if (re.test(interest)) out.add(t);
    return [...out];
  }, [interest]);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.origin !== window.location.origin || e.source !== opener) return;
      const m = FrameRevokedMessage.safeParse(e.data);
      if (m.success && nonceParsed.success && m.data.handoffNonce === nonceParsed.data) {
        setSent('revoked');
        setConsentChecked(false);
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [opener, nonceParsed]);

  function approveTopics() {
    const next = ApprovedOfferTopics.parse({
      schemaVersion: 1,
      revision: (approved?.revision ?? 0) + 1,
      topics: [...picked].sort(),
      approvedAt: new Date().toISOString(),
      provenance: 'explicit-preference',
    });
    setApproved(next);
    storeApproved(next);
  }

  function clearTopics() {
    setApproved(null);
    storeApproved(null);
    setPicked(new Set());
  }

  function personalize() {
    if (!linked || !reg || !approved || !consentChecked || !nonceParsed.success) return;
    const now = new Date();
    const consent = Consent.parse({
      schemaVersion: 1,
      revision: 1,
      purpose: 'offer-personalization',
      publisherOrigin: reg.origin,
      state: 'on',
      topicRevision: approved.revision,
      noticeVersion: NOTICE_VERSION,
      grantedAt: now.toISOString(),
      sessionExpiry: new Date(now.getTime() + SESSION_MINUTES * 60_000).toISOString(),
    });
    const msg: PrefsMessage = { v: 1, type: 'PREFS', handoffNonce: nonceParsed.data, approved, consent };
    opener!.postMessage(msg, window.location.origin);
    setSent('personalized');
  }

  function revoke() {
    if (!linked || !nonceParsed.success) return;
    const msg: RevokeMessage = { v: 1, type: 'REVOKE', handoffNonce: nonceParsed.data };
    opener!.postMessage(msg, window.location.origin);
    setConsentChecked(false);
    setSent('revoked');
  }

  const approvedSet = new Set(approved?.topics ?? []);
  const pickedChanged = [...picked].sort().join() !== [...approvedSet].sort().join();

  return (
    <main className="handoff">
      <h1>Sponsored offer preferences</h1>
      <p className="lede">
        Sponsored offers in Preflight slots are the same for everyone unless you choose otherwise here. Your wallet, plans and security findings
        are never used.
      </p>

      {!reg && <p className="notice">This window was not opened from a registered Preflight slot. You can still manage your topics.</p>}
      {reg && !opener && (
        <p className="notice">This window is not connected to the slot that opened it, so it cannot change that slot. Topics you approve are still saved here.</p>
      )}

      <section aria-labelledby="topics-h">
        <h2 id="topics-h">Topics you allow</h2>
        <label htmlFor="interest">What are you interested in? (optional, stays in this browser)</label>
        <input id="interest" value={interest} placeholder="e.g. I'm interested in hardware wallets" onChange={(e) => setInterest(e.target.value)} />
        {suggestions.length > 0 && (
          <p className="meta">Suggested, not approved: {suggestions.map((t) => TOPIC_LABEL[t]).join(', ')}. Tick a topic below to choose it.</p>
        )}
        <fieldset>
          <legend>Choose topics</legend>
          {OfferTopic.options.map((t) => (
            <label key={t} className="check">
              <input
                type="checkbox"
                checked={picked.has(t)}
                onChange={(e) => {
                  const next = new Set(picked);
                  if (e.target.checked) next.add(t);
                  else next.delete(t);
                  setPicked(next);
                }}
              />
              {TOPIC_LABEL[t]}
              {suggestions.includes(t) && !approvedSet.has(t) && <span className="tag"> suggested</span>}
              {approvedSet.has(t) && <span className="tag ok"> approved</span>}
            </label>
          ))}
        </fieldset>
        <div className="actions">
          <button type="button" onClick={approveTopics} disabled={!pickedChanged || picked.size === 0}>
            Approve these topics
          </button>
          {approved && (
            <button type="button" className="quiet" onClick={clearTopics}>
              Clear approved topics
            </button>
          )}
        </div>
      </section>

      {reg && (
        <section aria-labelledby="consent-h">
          <h2 id="consent-h">Personalize this slot</h2>
          <label className="check">
            <input type="checkbox" checked={consentChecked} onChange={(e) => setConsentChecked(e.target.checked)} disabled={!approved} />
            Use my approved topics to choose sponsored offers on <strong>{reg.origin}</strong> for the next {SESSION_MINUTES} minutes.
          </label>
          <p className="meta">
            Matching happens inside the Preflight frame. {reg.origin} does not receive your topics or this choice, though it may infer interest from which
            offer appears.
          </p>
          <div className="actions">
            <button type="button" onClick={personalize} disabled={!linked || !approved || !consentChecked}>
              Personalize this slot
            </button>
            <button type="button" className="quiet" onClick={revoke} disabled={!linked || sent !== 'personalized'}>
              Disable personalization
            </button>
          </div>
          <p role="status" className="meta">
            {sent === 'personalized' && 'Personalization is on for this slot. You can close this window.'}
            {sent === 'revoked' && 'Personalization is off. The slot shows the contextual offer again.'}
          </p>
        </section>
      )}
    </main>
  );
}
