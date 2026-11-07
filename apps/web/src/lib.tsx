/** Small helpers: ids, hex and formatting used across the views. */

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function hex(bytes: number): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}

export const evmHash = () => `0x${hex(32)}`;

export function short(h: string, head = 6, tail = 4): string {
  return h.length > head + tail + 1 ? `${h.slice(0, head)}…${h.slice(-tail)}` : h;
}

/** Hedera transaction ID: payer@seconds.nanos */
export function hederaTxId(payer: string): string {
  const now = Date.now();
  const nanos = String(Math.floor(Math.random() * 1e9)).padStart(9, "0");
  return `${payer}@${Math.floor(now / 1000)}.${nanos}`;
}

export const ogRequestId = () => `0g-${hex(4)}-${hex(2)}-${hex(2)}-${hex(6)}`;

export function hbar(n: number): string {
  if (n === 0) return "0";
  if (n < 0.1) return n.toFixed(4);
  return n.toFixed(n % 1 === 0 ? 0 : 2);
}

export function ago(at: number): string {
  const s = Math.max(1, Math.floor((Date.now() - at) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

/** ISO week label, e.g. 2026-W45 */
export function isoWeek(d = new Date()): string {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const w = Math.ceil(((t.getTime() - y0.getTime()) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(w).padStart(2, "0")}`;
}

export const uid = () => hex(6);
