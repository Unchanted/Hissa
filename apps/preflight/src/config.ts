import type { PublisherRegistration } from '@preflight/shared/offers';

const env = import.meta.env as Record<string, string | undefined>;

export const PUBLISHER_ORIGIN = env.VITE_PUBLISHER_ORIGIN ?? 'http://localhost:5174';

/** Publishers allowed to embed the slot. Origin is bound to publisherId. */
export const PUBLISHER_REGISTRY: readonly PublisherRegistration[] = [
  { publisherId: 'demo', origin: PUBLISHER_ORIGIN, slots: ['sidebar'], contexts: ['defi-dashboard'] },
];
