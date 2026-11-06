// Sponsored slot frame. Runs on the Preflight origin inside a publisher page.
// It imports nothing from hygiene and requests no wallet access.
import { useMemo, useSyncExternalStore } from 'react';
import { SAMPLE_CATALOG, select } from '@preflight/shared/offers';
import { getSession, subscribe } from './frameSession.js';

export function SlotFrame() {
  const session = useSyncExternalStore(subscribe, getSession);

  const selection = useMemo(
    () => (session ? select(SAMPLE_CATALOG, session.msg.context, [], false, new Date()) : null),
    [session],
  );

  if (!session || !selection) return <p className="slot-empty">Waiting for publisher…</p>;
  if (selection.mode === 'none') return <p className="slot-empty">No sponsored offer available.</p>;

  const c = selection.campaign;
  return (
    <aside aria-label="Sponsored" data-campaign={c.id}>
      <p>
        <small>
          {c.disclosure} · {selection.mode === 'personalized' ? 'Personalized by your Preflight settings' : 'Contextual'}
        </small>
      </p>
      <p>
        <a href={c.reviewedClickUrl} target="_blank" rel="noreferrer noopener" referrerPolicy="no-referrer">
          {c.title}
        </a>
      </p>
      <p>
        <small>{c.advertiserLabel}</small>
      </p>
    </aside>
  );
}
