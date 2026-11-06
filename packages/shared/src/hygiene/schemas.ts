import { z } from 'zod';
import { Address, ChainId, Hash32, IsoUtc, RawAmount, SchemaVersion } from '../primitives.js';

export const FactSource = z.enum(['live', 'local-evm', 'fixture']);

/** One balance + allowance pair read at a single pinned block. */
export const ChainFact = z.strictObject({
  schemaVersion: SchemaVersion,
  id: z.string().min(1).max(128),
  chainId: ChainId,
  blockNumber: z.string().regex(/^[0-9]+$/),
  blockHash: Hash32,
  fetchedAt: IsoUtc,
  source: FactSource,
  token: Address,
  decimals: z.number().int().min(0).max(36),
  owner: Address,
  spender: Address,
  balanceRaw: RawAmount,
  allowanceRaw: RawAmount,
  evidenceRef: z.string().min(1).max(512),
});
export type ChainFact = z.infer<typeof ChainFact>;

export const PlanStatus = z.enum(['draft', 'confirmed', 'cancelled', 'completed']);

export const ConfirmedPlan = z.strictObject({
  schemaVersion: SchemaVersion,
  id: z.string().min(1).max(128),
  revision: z.number().int().nonnegative(),
  chainId: ChainId,
  token: Address,
  sourceWallet: Address,
  destinationWallet: Address,
  incomingRaw: RawAmount,
  repaymentRaw: RawAmount,
  status: PlanStatus,
  confirmedAt: IsoUtc.optional(),
  inputSource: z.enum(['manual', '0g']),
  inferenceReceiptRef: z.string().max(256).optional(),
});
export type ConfirmedPlan = z.infer<typeof ConfirmedPlan>;

export const DerivedFinding = z.strictObject({
  schemaVersion: SchemaVersion,
  id: z.string().min(1).max(128),
  ruleVersion: z.string().min(1).max(32),
  planId: z.string().min(1).max(128),
  planRevision: z.number().int().nonnegative(),
  factIds: z.array(z.string()).min(1),
  currentExposureRaw: RawAmount,
  conditionalExposureRaw: RawAmount,
  assumptions: z.array(z.string().max(400)),
  explanation: z.string().max(2000),
  proposedAction: z.enum(['revoke-before-funding', 'none', 'explain-only']),
  computedAt: IsoUtc,
});
export type DerivedFinding = z.infer<typeof DerivedFinding>;

export const InferenceReceipt = z.strictObject({
  schemaVersion: SchemaVersion,
  requestId: z.string().min(1).max(256),
  model: z.string().min(1).max(128),
  provider: z.string().max(256).optional(),
  requestedTier: z.enum(['private', 'verified', 'standard']),
  servedTier: z.string().max(64).optional(),
  verificationResult: z.enum(['verified', 'unverified', 'failed', 'not-checked']),
  timestamp: IsoUtc,
  status: z.enum(['ok', 'error']),
});
export type InferenceReceipt = z.infer<typeof InferenceReceipt>;
