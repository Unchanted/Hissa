// Frame session store. The INIT listener is installed at module load, before React
// renders, so an INIT sent on iframe `load` is never missed. One session per frame
// load: the first valid INIT locks publisher, slot and context.
import { validateInit, type InitMessage, type ReadyMessage } from '@preflight/shared/offers';
import { PUBLISHER_REGISTRY } from '../config.js';

export interface FrameSession {
  msg: InitMessage;
  origin: string;
}

let session: FrameSession | null = null;
const listeners = new Set<() => void>();
const MAX_REJECTED = 20;
let rejected = 0;

function onMessage(event: MessageEvent) {
  if (window.parent === window || event.source !== window.parent) return;
  if (session) return; // locked; re-initialisation is ignored
  if (rejected >= MAX_REJECTED) return;
  const result = validateInit(event.data, event.origin, PUBLISHER_REGISTRY);
  if (!result.ok) {
    rejected += 1;
    return;
  }
  session = { msg: result.msg, origin: result.reg.origin };
  const ready: ReadyMessage = { v: 1, type: 'READY', sessionNonce: result.msg.sessionNonce };
  window.parent.postMessage(ready, result.reg.origin);
  for (const l of listeners) l();
}

window.addEventListener('message', onMessage);

export function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function getSession() {
  return session;
}
