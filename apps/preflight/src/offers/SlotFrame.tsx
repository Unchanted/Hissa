// Sponsored slot frame. Runs on the Preflight origin inside a publisher page.
// It imports nothing from hygiene and requests no wallet access.
import { useSyncExternalStore } from 'react';
import { SAMPLE_CATALOG, consentIsActive, select } from '@preflight/shared/offers';
import { disablePersonalization, getState, openHandoff, subscribe } from './frameSession.js';

export function SlotFrame() {
  const { session, personalization, handoff } = useSyncExternalStore(subscribe, getState);

  if (!session) return <p className="slot-empty">Waiting for publisher…</p>;

  const now = new Date();
  const active =
    !!personalization && consentIsActive(personalization.consent, session.origin, personalization.approved.revision, now);
  const selection = select(SAMPLE_CATALOG, session.msg.context, active ? personalization!.approved.topics : [], active, now);

  if (selection.mode === 'none') return <p className="slot-empty">No sponsored offer available.</p>;
  const c = selection.campaign;

  return (
    <aside className="slot" aria-label="Sponsored" data-campaign={c.id} data-mode={selection.mode}>
      <p className="slot-disclosure">
        {selection.mode === 'personalized' ? 'Sponsored, personalized by your Preflight settings' : 'Sponsored'}
      </p>
      <a className="slot-title" href={c.reviewedClickUrl} target="_blank" rel="noreferrer noopener" referrerPolicy="no-referrer">
        {c.title}
      </a>
      <p className="slot-advertiser">{c.advertiserLabel}. {c.disclosure}.</p>
      <div className="slot-controls">
        {active ? (
          <button type="button" onClick={() => disablePersonalization()}>
            Disable personalization
          </button>
        ) : (
          <button type="button" onClick={openHandoff}>
            Use my Preflight preferences
          </button>
        )}
      </div>
      <p className="slot-status" role="status">
        {handoff === 'blocked' && !active && (
          <>
            Popup blocked. This slot stays contextual.{' '}
            <a href="/handoff.html" target="_blank" rel="noopener">
              Open Preflight preferences
            </a>
          </>
        )}
      </p>
    </aside>
  );
}
