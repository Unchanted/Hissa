// Deterministic local selector. Inputs are only the catalog, a fixed context enum,
// approved topics and the active consent. No wallet, plan, finding or risk input exists.
import type { Campaign, Catalog, Consent, OfferContext, OfferTopic } from './schemas.js';

export type Selection =
  | { mode: 'contextual'; campaign: Campaign }
  | { mode: 'personalized'; campaign: Campaign }
  | { mode: 'none' };

export function consentIsActive(consent: Consent | null, publisherOrigin: string, topicRevision: number, now: Date): boolean {
  if (!consent) return false;
  return (
    consent.state === 'on' &&
    consent.purpose === 'offer-personalization' &&
    consent.publisherOrigin === publisherOrigin &&
    consent.topicRevision === topicRevision &&
    Date.parse(consent.sessionExpiry) > now.getTime()
  );
}

const byId = (a: Campaign, b: Campaign) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export function select(
  catalog: Catalog,
  context: OfferContext,
  approvedTopics: readonly OfferTopic[],
  activeConsent: boolean,
  now: Date,
): Selection {
  const t = now.getTime();
  const eligible = catalog.campaigns
    .filter(
      (c) =>
        c.reviewStatus === 'approved' &&
        c.catalogVersion === catalog.catalogVersion &&
        c.contextEnum.includes(context) &&
        Date.parse(c.startsAt) <= t &&
        Date.parse(c.endsAt) > t,
    )
    .sort(byId);

  const first = eligible[0];
  if (!first) return { mode: 'none' };

  if (activeConsent && approvedTopics.length > 0) {
    const match = eligible.find((c) => c.topicEnum.some((topic) => approvedTopics.includes(topic)));
    if (match) return { mode: 'personalized', campaign: match };
  }
  return { mode: 'contextual', campaign: first };
}
