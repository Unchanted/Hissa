import { describe, expect, it } from 'vitest';
import { exportKeyB64, generateDataKey, importKeyB64, openPlan, sealPlan } from '../src/hygiene/envelope.js';
import type { ConfirmedPlan } from '../src/hygiene/schemas.js';

const plan: ConfirmedPlan = {
  schemaVersion: 1,
  id: 'plan-1',
  revision: 1,
  chainId: 31337,
  token: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
  sourceWallet: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
  destinationWallet: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
  incomingRaw: '800000000',
  repaymentRaw: '500000000',
  status: 'confirmed',
  confirmedAt: '2026-11-06T07:58:00Z',
  inputSource: 'manual',
};

describe('encrypted plan envelope (acceptance #11)', () => {
  it('round-trips with the right key, including after key export/import', async () => {
    const key = await generateDataKey();
    const env = await sealPlan(plan, key);
    expect(await openPlan(env, key)).toEqual(plan);
    const again = await importKeyB64(await exportKeyB64(key));
    expect(await openPlan(env, again)).toEqual(plan);
  });

  it('ciphertext does not contain plan fields in the clear', async () => {
    const env = await sealPlan(plan, await generateDataKey());
    const text = new TextDecoder('latin1').decode(env);
    expect(text).not.toContain('800000000');
    expect(text.toLowerCase()).not.toContain(plan.destinationWallet.toLowerCase().slice(2));
  });

  it('uses a fresh nonce each time', async () => {
    const key = await generateDataKey();
    const a = await sealPlan(plan, key);
    const b = await sealPlan(plan, key);
    expect(Buffer.from(a.slice(1, 13)).equals(Buffer.from(b.slice(1, 13)))).toBe(false);
  });

  it('wrong key fails closed', async () => {
    const env = await sealPlan(plan, await generateDataKey());
    await expect(openPlan(env, await generateDataKey())).rejects.toThrow(/decryption failed/);
  });

  it('tampered ciphertext or version fails closed', async () => {
    const key = await generateDataKey();
    const env = await sealPlan(plan, key);
    const flipped = env.slice();
    flipped[flipped.length - 1]! ^= 1;
    await expect(openPlan(flipped, key)).rejects.toThrow(/decryption failed/);
    const badVersion = env.slice();
    badVersion[0] = 2;
    await expect(openPlan(badVersion, key)).rejects.toThrow(/version/);
  });
});
