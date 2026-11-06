import {
  ConfirmedPlan,
  DerivedFinding,
  EXPOSURE_RULE_VERSION,
  exposureForPlan,
  parseUnitsExact,
  type ChainFact,
  type PlanDraft,
} from '@preflight/shared/hygiene';
import { formatUnitsExact } from '@preflight/shared';
import { ALIASES, DEPLOYMENT, TOKEN_DECIMALS } from './chain.js';

const STORE_KEY = 'preflight.plan.v1';
export const FACT_MAX_AGE_MS = 5 * 60_000;

export function confirmDraft(draft: PlanDraft, previous: ConfirmedPlan | null, inputSource: 'manual' | '0g', receiptRef?: string): ConfirmedPlan {
  if (draft.sourceAlias === draft.destinationAlias) throw new Error('Source and destination must differ');
  return ConfirmedPlan.parse({
    schemaVersion: 1,
    id: previous?.id ?? `plan-${crypto.randomUUID()}`,
    revision: (previous?.revision ?? 0) + 1,
    chainId: DEPLOYMENT.chainId,
    token: DEPLOYMENT.token,
    sourceWallet: ALIASES[draft.sourceAlias],
    destinationWallet: ALIASES[draft.destinationAlias],
    incomingRaw: parseUnitsExact(draft.fundingAmount, TOKEN_DECIMALS).toString(),
    repaymentRaw: draft.repaymentAmount ? parseUnitsExact(draft.repaymentAmount, TOKEN_DECIMALS).toString() : '0',
    status: 'confirmed',
    confirmedAt: new Date().toISOString(),
    inputSource,
    ...(receiptRef ? { inferenceReceiptRef: receiptRef } : {}),
  });
}

export function loadPlan(): ConfirmedPlan | null {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const parsed = ConfirmedPlan.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function savePlan(plan: ConfirmedPlan | null) {
  try {
    if (plan) localStorage.setItem(STORE_KEY, JSON.stringify(plan));
    else localStorage.removeItem(STORE_KEY);
  } catch {
    /* storage unavailable: plan stays in memory only */
  }
}

export const fmt = (raw: bigint | string) => formatUnitsExact(BigInt(raw), TOKEN_DECIMALS);

export type FindingResult = { kind: 'finding'; finding: DerivedFinding } | { kind: 'unknown'; reason: string };

export function deriveFinding(plan: ConfirmedPlan, fact: ChainFact | null): FindingResult {
  const r = exposureForPlan(plan, fact, { now: new Date(), maxAgeMs: FACT_MAX_AGE_MS });
  if (r.kind === 'unknown' || !fact) return { kind: 'unknown', reason: r.kind === 'unknown' ? r.reason : 'no fact' };
  const { current, conditional } = r.value;
  const incoming = BigInt(plan.incomingRaw);
  const repayment = BigInt(plan.repaymentRaw);
  const needsAction = conditional > current;
  const afterRepay = (() => {
    const total = BigInt(fact.balanceRaw) + incoming;
    const left = total > repayment ? total - repayment : 0n;
    const allowance = BigInt(fact.allowanceRaw);
    return left < allowance ? left : allowance;
  })();

  const explanation = needsAction
    ? `${fmt(current)} fUSDC currently exposed; up to ${fmt(conditional)} fUSDC after this funding, if this spender can exercise its allowance.` +
      (repayment > 0n
        ? ` The ${fmt(repayment)} repayment is your stated intent; it does not cap what the spender can move before repayment. If repayment left first and nothing else changed, ${fmt(afterRepay)} would remain exposed.`
        : '')
    : `Funding does not increase exposure to this spender (${fmt(current)} → ${fmt(conditional)} fUSDC).`;

  return {
    kind: 'finding',
    finding: DerivedFinding.parse({
      schemaVersion: 1,
      id: `finding-${plan.id}-r${plan.revision}-${fact.id}`,
      ruleVersion: EXPOSURE_RULE_VERSION,
      planId: plan.id,
      planRevision: plan.revision,
      factIds: [fact.id],
      currentExposureRaw: current.toString(),
      conditionalExposureRaw: conditional.toString(),
      assumptions: [
        'Upper bound, not an expected loss. Not evidence that the spender is malicious.',
        'Assumes the spender can exercise its full allowance.',
        'Covers only this token/spender pair; other approvals, permits and Permit2 are not checked.',
      ],
      explanation,
      proposedAction: needsAction ? 'revoke-before-funding' : 'none',
      computedAt: new Date().toISOString(),
    }),
  };
}
