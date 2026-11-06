import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SAMPLE_CATALOG } from '../src/offers/catalog.js';
import { validateInit } from '../src/offers/messages.js';
import { ReportingEvent } from '../src/offers/schemas.js';
import { consentIsActive, select } from '../src/offers/select.js';
import type { Consent } from '../src/offers/schemas.js';

const now = new Date('2026-11-06T08:00:00Z');
const ORIGIN = 'http://localhost:5174';
const consentOn: Consent = {
  schemaVersion: 1,
  revision: 1,
  purpose: 'offer-personalization',
  publisherOrigin: ORIGIN,
  state: 'on',
  topicRevision: 1,
  noticeVersion: 'n1',
  grantedAt: '2026-11-06T07:59:00Z',
  sessionExpiry: '2026-11-06T09:00:00Z',
};

describe('sponsored sequence (acceptance #6)', () => {
  const pick = (topics: string[], consent: boolean) =>
    select(SAMPLE_CATALOG, 'defi-dashboard', topics as never, consent, now);

  it('default is contextual C01', () => {
    expect(pick([], false)).toMatchObject({ mode: 'contextual', campaign: { id: 'C01' } });
  });
  it('topic approval without consent stays C01', () => {
    expect(pick(['hardware-wallets'], false)).toMatchObject({ mode: 'contextual', campaign: { id: 'C01' } });
  });
  it('consent without topics stays C01', () => {
    expect(pick([], true)).toMatchObject({ mode: 'contextual', campaign: { id: 'C01' } });
  });
  it('consent + hardware-wallets selects C02', () => {
    expect(pick(['hardware-wallets'], true)).toMatchObject({ mode: 'personalized', campaign: { id: 'C02' } });
  });
  it('empty or expired catalog yields none', () => {
    expect(select({ ...SAMPLE_CATALOG, campaigns: [] }, 'defi-dashboard', [], false, now)).toEqual({ mode: 'none' });
    expect(select(SAMPLE_CATALOG, 'defi-dashboard', [], false, new Date('2027-06-01T00:00:00Z'))).toEqual({ mode: 'none' });
  });
});

describe('consentIsActive', () => {
  it('requires matching origin, topic revision, state and unexpired session', () => {
    expect(consentIsActive(consentOn, ORIGIN, 1, now)).toBe(true);
    expect(consentIsActive(null, ORIGIN, 1, now)).toBe(false);
    expect(consentIsActive({ ...consentOn, state: 'off' }, ORIGIN, 1, now)).toBe(false);
    expect(consentIsActive(consentOn, 'https://other.example', 1, now)).toBe(false);
    expect(consentIsActive(consentOn, ORIGIN, 2, now)).toBe(false);
    expect(consentIsActive(consentOn, ORIGIN, 1, new Date('2026-11-06T10:00:00Z'))).toBe(false);
  });
});

describe('message contract (acceptance #8)', () => {
  const registry = [{ publisherId: 'demo', origin: ORIGIN, slots: ['sidebar'], contexts: ['defi-dashboard' as const] }];
  const good = { v: 1, type: 'INIT', sessionNonce: 'abcdefghijklmnopqrstuvwx', publisherId: 'demo', slotId: 'sidebar', context: 'defi-dashboard' };

  it('accepts a registered INIT', () => {
    expect(validateInit(good, ORIGIN, registry).ok).toBe(true);
  });
  it('rejects spoofed origin, extra fields, bad context', () => {
    expect(validateInit(good, 'https://evil.example', registry).ok).toBe(false);
    expect(validateInit({ ...good, wallet: '0x00' }, ORIGIN, registry).ok).toBe(false);
    expect(validateInit({ ...good, topics: ['education'] }, ORIGIN, registry).ok).toBe(false);
    expect(validateInit({ ...good, context: 'anything' }, ORIGIN, registry).ok).toBe(false);
    expect(validateInit({ ...good, sessionNonce: 'short' }, ORIGIN, registry).ok).toBe(false);
  });
});

describe('reporting allowlist', () => {
  const ev = { v: 1, publisherId: 'demo', slotId: 'sidebar', catalogVersion: 'sample-2026-11-06', campaignId: 'C01', kind: 'impression', dayUTC: '2026-11-06' };
  it('accepts only allowlisted fields', () => {
    expect(ReportingEvent.safeParse(ev).success).toBe(true);
    for (const extra of ['wallet', 'address', 'topics', 'sessionNonce', 'consent', 'plan', 'risk', 'timestamp']) {
      expect(ReportingEvent.safeParse({ ...ev, [extra]: 'x' }).success).toBe(false);
    }
  });
});

describe('purpose separation (acceptance #7)', () => {
  it('offers module imports nothing from hygiene or chain clients', () => {
    const dir = join(import.meta.dirname, '../src/offers');
    for (const f of readdirSync(dir)) {
      const src = readFileSync(join(dir, f), 'utf8');
      expect(src, f).not.toMatch(/from\s+['"][^'"]*hygiene/);
      expect(src, f).not.toMatch(/from\s+['"](viem|@arkiv-network)/);
    }
  });
});
