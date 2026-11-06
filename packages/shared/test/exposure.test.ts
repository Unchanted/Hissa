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
