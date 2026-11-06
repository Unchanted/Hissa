// Offers module. Must never import from ../hygiene or any wallet/chain client.
import { z } from 'zod';
import { IsoUtc, SchemaVersion } from '../primitives.js';

export const OfferTopic = z.enum(['education', 'hardware-wallets', 'developer-tools']);
export type OfferTopic = z.infer<typeof OfferTopic>;

export const OfferContext = z.enum(['defi-dashboard']);
export type OfferContext = z.infer<typeof OfferContext>;

export const ApprovedOfferTopics = z.strictObject({
  schemaVersion: SchemaVersion,
  revision: z.number().int().nonnegative(),
  topics: z.array(OfferTopic).max(3),
  approvedAt: IsoUtc,
  provenance: z.enum(['explicit-preference', 'authorized-activity']),
  authorizationRef: z.string().max(128).optional(),
});
export type ApprovedOfferTopics = z.infer<typeof ApprovedOfferTopics>;

export const Consent = z.strictObject({
  schemaVersion: SchemaVersion,
  revision: z.number().int().nonnegative(),
  purpose: z.literal('offer-personalization'),
  publisherOrigin: z.string().url().max(256),
  state: z.enum(['off', 'on']),
  topicRevision: z.number().int().nonnegative(),
  noticeVersion: z.string().min(1).max(32),
  grantedAt: IsoUtc.optional(),
  revokedAt: IsoUtc.optional(),
  sessionExpiry: IsoUtc,
});
export type Consent = z.infer<typeof Consent>;

export const Campaign = z.strictObject({
  schemaVersion: SchemaVersion,
  id: z.string().regex(/^C[0-9]{2}$/),
  catalogVersion: z.string().min(1).max(32),
  advertiserLabel: z.string().min(1).max(120),
  contextEnum: z.array(OfferContext).min(1),
  topicEnum: z.array(OfferTopic),
  title: z.string().min(1).max(120),
  staticAssetId: z.string().max(64).optional(),
  reviewedClickUrl: z.string().url().startsWith('https://').max(256),
  startsAt: IsoUtc,
  endsAt: IsoUtc,
  disclosure: z.string().min(1).max(120),
  reviewStatus: z.enum(['approved', 'rejected', 'pending']),
});
export type Campaign = z.infer<typeof Campaign>;

export const Catalog = z.strictObject({
  schemaVersion: SchemaVersion,
  catalogVersion: z.string().min(1).max(32),
  campaigns: z.array(Campaign).max(50),
});
export type Catalog = z.infer<typeof Catalog>;

/** Only fields allowed in a reporting event. strictObject rejects anything else. */
export const ReportingEvent = z.strictObject({
  v: z.literal(1),
  publisherId: z.string().regex(/^[a-z0-9-]{1,32}$/),
  slotId: z.string().regex(/^[a-z0-9-]{1,32}$/),
  catalogVersion: z.string().min(1).max(32),
  campaignId: z.string().regex(/^C[0-9]{2}$/),
  kind: z.enum(['impression', 'click']),
  dayUTC: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type ReportingEvent = z.infer<typeof ReportingEvent>;
