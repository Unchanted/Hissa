// Minimal publisher bootstrap. The publisher learns only READY from the frame:
// no selection, topic or profile is ever sent back to this origin.
import { ReadyMessage } from '@preflight/shared/offers';

export interface SlotOptions {
  publisherId: string;
  slotId: string;
  context: 'defi-dashboard';
  preflightOrigin: string;
}

function randomNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function mountPreflightSlot(element: HTMLElement, opts: SlotOptions): { ready: Promise<void> } {
  const sessionNonce = randomNonce();
  const frame = document.createElement('iframe');
  frame.src = `${opts.preflightOrigin}/slot.html`;
  frame.title = 'Sponsored';
  frame.width = '300';
  frame.height = '160';
  frame.style.border = '0';
  frame.referrerPolicy = 'no-referrer';
  // Scripts + own origin for frame storage; popups for the user-initiated handoff. No top navigation.
  frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox');

  const ready = new Promise<void>((resolve) => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== opts.preflightOrigin || event.source !== frame.contentWindow) return;
      const parsed = ReadyMessage.safeParse(event.data);
      if (!parsed.success || parsed.data.sessionNonce !== sessionNonce) return;
      window.removeEventListener('message', onMessage);
      resolve();
    }
    window.addEventListener('message', onMessage);
  });

  frame.addEventListener('load', () => {
    frame.contentWindow?.postMessage(
      { v: 1, type: 'INIT', sessionNonce, publisherId: opts.publisherId, slotId: opts.slotId, context: opts.context },
      opts.preflightOrigin,
    );
  });

  element.replaceChildren(frame);
  return { ready };
}
