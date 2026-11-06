// Publisher <-> Preflight frame message contract. Strict allowlist; unknown keys are rejected.
import { z } from 'zod';
import { OfferContext } from './schemas.js';

export const Nonce = z.string().regex(/^[A-Za-z0-9_-]{22,64}$/);

export const InitMessage = z.strictObject({
  v: z.literal(1),
  type: z.literal('INIT'),
  sessionNonce: Nonce,
  publisherId: z.string().regex(/^[a-z0-9-]{1,32}$/),
  slotId: z.string().regex(/^[a-z0-9-]{1,32}$/),
  context: OfferContext,
});
export type InitMessage = z.infer<typeof InitMessage>;

/** Fixed-size READY. Carries no selection, topic or profile. */
export const ReadyMessage = z.strictObject({
  v: z.literal(1),
  type: z.literal('READY'),
  sessionNonce: Nonce,
});
export type ReadyMessage = z.infer<typeof ReadyMessage>;

export interface PublisherRegistration {
  publisherId: string;
  origin: string;
  slots: string[];
  contexts: OfferContext[];
}

export function validateInit(
  data: unknown,
  eventOrigin: string,
  registry: readonly PublisherRegistration[],
): { ok: true; msg: InitMessage; reg: PublisherRegistration } | { ok: false; reason: string } {
  const parsed = InitMessage.safeParse(data);
  if (!parsed.success) return { ok: false, reason: 'schema' };
  const msg = parsed.data;
  const reg = registry.find((r) => r.publisherId === msg.publisherId);
  if (!reg) return { ok: false, reason: 'unknown publisher' };
  if (reg.origin !== eventOrigin) return { ok: false, reason: 'origin not bound to publisher' };
  if (!reg.slots.includes(msg.slotId)) return { ok: false, reason: 'unknown slot' };
  if (!reg.contexts.includes(msg.context)) return { ok: false, reason: 'context not registered' };
  return { ok: true, msg, reg };
}
