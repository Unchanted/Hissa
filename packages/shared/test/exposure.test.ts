import { describe, expect, it } from 'vitest';
import { computeExposure, exposureForPlan, residualAfterRepayment } from '../src/hygiene/exposure.js';
import type { ChainFact, ConfirmedPlan } from '../src/hygiene/schemas.js';

const USDC = 1_000_000n; // six decimals
const B = '0x00000000000000000000000000000000000000b0';
const TOKEN = '0x00000000000000000000000000000000000000c0';
const S = '0x00000000000000000000000000000000000000d0';

describe('computeExposure (acceptance #2)', () => {
  it('zero balance, allowance >= 800, incoming 800 -> (0, 800)', () => {
    const r = computeExposure({ balance: 0n, allowance: 1000n * USDC, confirmedIncoming: 800n * USDC });
    expect(r).toEqual({ kind: 'known', value: { current: 0n, conditional: 800_000_000n } });
  });

  it('allowance 200 caps future exposure at 200', () => {
    const r = computeExposure({ balance: 0n, allowance: 200n * USDC, confirmedIncoming: 800n * USDC });
    expect(r).toEqual({ kind: 'known', value: { current: 0n, conditional: 200n * USDC } });
  });

  it('allowance zero yields zero', () => {
    const r = computeExposure({ balance: 50n * USDC, allowance: 0n, confirmedIncoming: 800n * USDC });
    expect(r).toEqual({ kind: 'known', value: { current: 0n, conditional: 0n } });
  });

  it('missing reads are unknown, not zero', () => {
    expect(computeExposure({ balance: null, allowance: 1n, confirmedIncoming: 1n }).kind).toBe('unknown');
    expect(computeExposure({ balance: 0n, allowance: null, confirmedIncoming: 1n }).kind).toBe('unknown');
  });

  it('repaying 500 first leaves 300 exposed', () => {
    const r = residualAfterRepayment({ balance: 0n, allowance: 1000n * USDC, confirmedIncoming: 800n * USDC, repayment: 500n * USDC });
    expect(r).toEqual({ kind: 'known', value: 300n * USDC });
  });
});

describe('exposureForPlan', () => {
  const now = new Date('2026-11-06T08:00:00Z');
  const opts = { now, maxAgeMs: 5 * 60_000 };
  const fact: ChainFact = {
    schemaVersion: 1,
    id: 'fact-1',
    chainId: 31337,
    blockNumber: '12',
    blockHash: `0x${'ab'.repeat(32)}`,
    fetchedAt: '2026-11-06T07:59:00Z',
    source: 'local-evm',
    token: TOKEN,
    decimals: 6,
    owner: B,
    spender: S,
    balanceRaw: '0',
    allowanceRaw: '1000000000',
    evidenceRef: 'evidence/seed.json',
  };
  const plan: ConfirmedPlan = {
    schemaVersion: 1,
    id: 'plan-1',
    revision: 1,
    chainId: 31337,
    token: TOKEN,
    sourceWallet: '0x00000000000000000000000000000000000000a0',
    destinationWallet: B,
    incomingRaw: '800000000',
    repaymentRaw: '500000000',
    status: 'confirmed',
    confirmedAt: '2026-11-06T07:58:00Z',
    inputSource: 'manual',
  };

  it('confirmed plan + fresh matching fact -> (0, 800)', () => {
    expect(exposureForPlan(plan, fact, opts)).toEqual({ kind: 'known', value: { current: 0n, conditional: 800_000_000n } });
  });

  it.each(['draft', 'cancelled', 'completed'] as const)('%s plan is unknown', (status) => {
    expect(exposureForPlan({ ...plan, status }, fact, opts).kind).toBe('unknown');
  });

  it('stale fact is unknown', () => {
    expect(exposureForPlan(plan, { ...fact, fetchedAt: '2026-11-06T07:00:00Z' }, opts).kind).toBe('unknown');
  });

  it('chain, token or owner mismatch is unknown', () => {
    expect(exposureForPlan(plan, { ...fact, chainId: 1 }, opts).kind).toBe('unknown');
    expect(exposureForPlan(plan, { ...fact, token: S }, opts).kind).toBe('unknown');
    expect(exposureForPlan(plan, { ...fact, owner: S }, opts).kind).toBe('unknown');
    expect(exposureForPlan(plan, null, opts).kind).toBe('unknown');
  });
});

import { PlanDraft, parseUnitsExact, redactionProblem } from '../src/hygiene/draft.js';

describe('plan draft (acceptance #5)', () => {
  it('parses decimal amounts without floats', () => {
    expect(parseUnitsExact('800', 6)).toBe(800_000_000n);
    expect(parseUnitsExact('0.000001', 6)).toBe(1n);
    expect(parseUnitsExact('12.5', 6)).toBe(12_500_000n);
    expect(() => parseUnitsExact('1.0000001', 6)).toThrow();
    expect(() => parseUnitsExact('-1', 6)).toThrow();
  });
  it('rejects hallucinated or extra fields', () => {
    const ok = { sourceAlias: 'A', destinationAlias: 'B', token: 'USDC', fundingAmount: '800', repaymentAmount: '500' };
    expect(PlanDraft.safeParse(ok).success).toBe(true);
    expect(PlanDraft.safeParse({ ...ok, destinationAlias: '0xabc' }).success).toBe(false);
    expect(PlanDraft.safeParse({ ...ok, to: '0x1234' }).success).toBe(false);
    expect(PlanDraft.safeParse({ ...ok, token: 'DAI' }).success).toBe(false);
    expect(PlanDraft.safeParse({ ...ok, fundingAmount: 800 }).success).toBe(false);
  });
  it('blocks literal addresses from leaving the browser', () => {
    expect(redactionProblem('Move 800 USDC to my repayment wallet B to repay 500 USDC')).toBeNull();
    expect(redactionProblem('send 800 to 0x70997970C51812dc3A010C7d01b50e0d17dc79C8')).not.toBeNull();
  });
});
