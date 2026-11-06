import { z } from 'zod';

/** Unsigned integer amount in token base units, as a decimal string. Never a JS float. */
export const RawAmount = z.string().regex(/^(0|[1-9][0-9]{0,77})$/, 'unsigned base-unit decimal string');
export type RawAmount = z.infer<typeof RawAmount>;

export const Address = z.string().regex(/^0x[0-9a-fA-F]{40}$/, '20-byte hex address');
export type Address = z.infer<typeof Address>;

export const Hash32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/, '32-byte hex hash');

/** ISO-8601 UTC timestamp ending in Z. */
export const IsoUtc = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/, 'ISO UTC timestamp');

export const ChainId = z.number().int().positive();

export const SCHEMA_VERSION = 1 as const;
export const SchemaVersion = z.literal(SCHEMA_VERSION);

export const toRaw = (n: bigint): RawAmount => {
  if (n < 0n) throw new RangeError('negative amount');
  return n.toString();
};
export const fromRaw = (s: RawAmount): bigint => BigInt(RawAmount.parse(s));

/** Format base units with fixed decimals, no float rounding. */
export function formatUnitsExact(raw: bigint, decimals: number): string {
  const neg = raw < 0n;
  const abs = neg ? -raw : raw;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const frac = (abs % base).toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${neg ? '-' : ''}${whole}${frac ? `.${frac}` : ''}`;
}
