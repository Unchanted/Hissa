import type { ChainFact, ConfirmedPlan } from './schemas.js';

export const EXPOSURE_RULE_VERSION = 'exposure-v1';

/** A read that is missing, stale or mismatched is unknown — never zero. */
export type Known<T> = { kind: 'known'; value: T } | { kind: 'unknown'; reason: string };

export interface ExposureInput {
  balance: bigint | null;
  allowance: bigint | null;
  confirmedIncoming: bigint;
}

export interface ExposureResult {
  current: bigint;
  conditional: bigint;
}

const min = (a: bigint, b: bigint) => (a < b ? a : b);

/**
 * current     = min(balance, allowance)
 * conditional = min(balance + confirmedIncoming, allowance)
 * Both are upper bounds on what this spender could move, assuming it can exercise its allowance.
 */
export function computeExposure(input: ExposureInput): Known<ExposureResult> {
  const { balance, allowance, confirmedIncoming } = input;
  if (balance === null) return { kind: 'unknown', reason: 'balance read missing' };
  if (allowance === null) return { kind: 'unknown', reason: 'allowance read missing' };
  if (balance < 0n || allowance < 0n || confirmedIncoming < 0n) {
    return { kind: 'unknown', reason: 'negative amount' };
  }
  return {
    kind: 'known',
    value: {
      current: min(balance, allowance),
      conditional: min(balance + confirmedIncoming, allowance),
    },
  };
}

export interface FactCheckOptions {
  now: Date;
  maxAgeMs: number;
}

/**
 * Join a confirmed plan to a chain fact. Only a confirmed plan whose chain, token
 * and destination match the fact, with a fresh fact, yields a known exposure.
 */
export function exposureForPlan(
  plan: ConfirmedPlan,
  fact: ChainFact | null,
  opts: FactCheckOptions,
): Known<ExposureResult> {
  if (plan.status !== 'confirmed') return { kind: 'unknown', reason: `plan is ${plan.status}, not confirmed` };
  if (!fact) return { kind: 'unknown', reason: 'no chain fact' };
  if (fact.chainId !== plan.chainId) return { kind: 'unknown', reason: 'chain mismatch' };
  if (fact.token.toLowerCase() !== plan.token.toLowerCase()) return { kind: 'unknown', reason: 'token mismatch' };
  if (fact.owner.toLowerCase() !== plan.destinationWallet.toLowerCase()) {
    return { kind: 'unknown', reason: 'fact owner is not plan destination' };
  }
  const age = opts.now.getTime() - Date.parse(fact.fetchedAt);
  if (!(age >= 0 && age <= opts.maxAgeMs)) return { kind: 'unknown', reason: 'chain fact is stale' };
  return computeExposure({
    balance: BigInt(fact.balanceRaw),
    allowance: BigInt(fact.allowanceRaw),
    confirmedIncoming: BigInt(plan.incomingRaw),
  });
}

/** Exposure that would remain if repayment leaves the wallet first and nothing else changes. */
export function residualAfterRepayment(input: ExposureInput & { repayment: bigint }): Known<bigint> {
  const r = computeExposure(input);
  if (r.kind === 'unknown') return r;
  const afterIn = (input.balance as bigint) + input.confirmedIncoming;
  const left = afterIn > input.repayment ? afterIn - input.repayment : 0n;
  return { kind: 'known', value: min(left, input.allowance as bigint) };
}
