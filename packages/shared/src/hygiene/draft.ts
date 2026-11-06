// Plan draft produced from natural language. Untrusted: it is shown for correction and
// only an explicit user Confirm turns it into a ConfirmedPlan. Aliases only, never addresses.
import { z } from 'zod';

export const WalletAlias = z.enum(['A', 'B']);
export type WalletAlias = z.infer<typeof WalletAlias>;

/** Human decimal amount with at most six fractional digits, e.g. "800" or "12.5". */
export const DecimalAmount = z.string().regex(/^(0|[1-9][0-9]{0,15})(\.[0-9]{1,6})?$/);

export const PlanDraft = z.strictObject({
  sourceAlias: WalletAlias,
  destinationAlias: WalletAlias,
  token: z.literal('USDC'),
  fundingAmount: DecimalAmount,
  repaymentAmount: DecimalAmount.nullable(),
});
export type PlanDraft = z.infer<typeof PlanDraft>;

/** Parse a decimal amount into base units without floats. */
export function parseUnitsExact(amount: string, decimals: number): bigint {
  const m = DecimalAmount.parse(amount).split('.');
  const whole = m[0] ?? '0';
  const frac = (m[1] ?? '').padEnd(decimals, '0');
  if (frac.length > decimals) throw new RangeError('too many decimals');
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(frac || '0');
}

const ADDRESS_LIKE = /0x[0-9a-fA-F]{6,}/;

/** Reject free text that carries literal addresses or keys before it leaves the browser. */
export function redactionProblem(text: string): string | null {
  if (text.length === 0) return 'empty';
  if (text.length > 500) return 'too long (max 500 characters)';
  if (ADDRESS_LIKE.test(text)) return 'contains a hex address or key; use wallet aliases A and B instead';
  return null;
}
