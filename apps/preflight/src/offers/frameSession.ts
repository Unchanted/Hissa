// Frame session store. The INIT listener is installed at module load, before React
// renders, so an INIT sent on iframe `load` is never missed. One session per frame
// load: the first valid INIT locks publisher, slot and context.
//
// Personalization lives only in this frame's memory. It arrives from a Preflight-origin
// handoff window that this frame opened on a user click, and is never written to storage,
// URLs or messages to the publisher.
import {
  FrameRevokedMessage,
  PrefsMessage,
  RevokeMessage,
  validateInit,
  type ApprovedOfferTopics,
  type Consent,
  type InitMessage,
  type ReadyMessage,
} from '@preflight/shared/offers';
import { PUBLISHER_REGISTRY } from '../config.js';

export interface FrameSession {
  msg: InitMessage;
  origin: string;
}

export interface Personalization {
  approved: ApprovedOfferTopics;
  consent: Consent;
}

export interface FrameState {
  session: FrameSession | null;
  personalization: Personalization | null;
  /** Bumped on every opt-out; any result tied to an older value is ignored. */
  consentEpoch: number;
  handoff: 'none' | 'open' | 'blocked';
}

let state: FrameState = { session: null, personalization: null, consentEpoch: 0, handoff: 'none' };
const listeners = new Set<() => void>();
const MAX_REJECTED = 20;
let rejected = 0;

let handoffWindow: Window | null = null;
let handoffNonce: string | null = null;
let handoffEpoch = -1;

function set(next: Partial<FrameState>) {
  state = { ...state, ...next };
  for (const l of listeners) l();
}

function nonce(): string {
  const b = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function onParentMessage(event: MessageEvent) {
  if (state.session) return; // locked; re-initialisation is ignored
  if (rejected >= MAX_REJECTED) return;
  const result = validateInit(event.data, event.origin, PUBLISHER_REGISTRY);
  if (!result.ok) {
    rejected += 1;
    return;
  }
  set({ session: { msg: result.msg, origin: result.reg.origin } });
  const ready: ReadyMessage = { v: 1, type: 'READY', sessionNonce: result.msg.sessionNonce };
  window.parent.postMessage(ready, result.reg.origin);
}

function onHandoffMessage(event: MessageEvent) {
  // Only the exact window this frame opened, on the Preflight origin, with the current nonce.
  if (event.origin !== window.location.origin || !handoffWindow || event.source !== handoffWindow) return;
  const prefs = PrefsMessage.safeParse(event.data);
  if (prefs.success) {
    if (prefs.data.handoffNonce !== handoffNonce) return;
    if (handoffEpoch !== state.consentEpoch) return; // opened before an opt-out: stale
    const { approved, consent } = prefs.data;
    if (!state.session || consent.publisherOrigin !== state.session.origin) return; // never by implication for another origin
    set({ personalization: { approved, consent } });
    return;
  }
  const revoke = RevokeMessage.safeParse(event.data);
  if (revoke.success && revoke.data.handoffNonce === handoffNonce) disablePersonalization({ notifyHandoff: false });
}

window.addEventListener('message', (event) => {
  if (window.parent !== window && event.source === window.parent) onParentMessage(event);
  else onHandoffMessage(event);
});

/** User click in the frame. Opens a top-level Preflight window; no profile data in the URL. */
export function openHandoff() {
  if (!state.session) return;
  handoffNonce = nonce();
  handoffEpoch = state.consentEpoch;
  const url = new URL('/handoff.html', window.location.origin);
  url.searchParams.set('publisher', state.session.msg.publisherId);
  url.searchParams.set('n', handoffNonce);
  const w = window.open(url.toString(), 'preflight-handoff', 'popup,width=460,height=640');
  if (!w) {
    handoffWindow = null;
    set({ handoff: 'blocked' });
    return;
  }
  handoffWindow = w;
  set({ handoff: 'open' });
}

/** Synchronous opt-out: clears in-memory topics and consent and rerenders contextual. */
export function disablePersonalization(opts: { notifyHandoff: boolean } = { notifyHandoff: true }) {
  const epoch = state.consentEpoch + 1;
  if (opts.notifyHandoff && handoffWindow && handoffNonce && !handoffWindow.closed) {
    const msg = FrameRevokedMessage.parse({ v: 1, type: 'FRAME_REVOKED', handoffNonce });
    handoffWindow.postMessage(msg, window.location.origin);
  }
  // A handoff opened before this point can no longer personalize this frame.
  handoffNonce = null;
  set({ personalization: null, consentEpoch: epoch });
}

export function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function getState() {
  return state;
}
