// AES-GCM envelope for the confirmed plan stored on Arkiv. The key is generated in the
// browser and never leaves the user's control (local storage + user-held backup file).
// Envelope bytes: [version=1][12-byte random nonce][ciphertext+tag].
// Additional authenticated data binds the version and record type.
import { ConfirmedPlan } from './schemas.js';

export const ENVELOPE_VERSION = 1;
export const RECORD_TYPE = 'confirmed-plan';
const AAD = new TextEncoder().encode(`preflight.record|v${ENVELOPE_VERSION}|${RECORD_TYPE}`);

export async function generateDataKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

export async function exportKeyB64(key: CryptoKey): Promise<string> {
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', key));
  return b64url(raw);
}

export async function importKeyB64(b64: string): Promise<CryptoKey> {
  const raw = fromB64url(b64);
  if (raw.length !== 32) throw new Error('data key must be 256 bits');
  return crypto.subtle.importKey('raw', new Uint8Array(raw), { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
}

export async function sealPlan(plan: ConfirmedPlan, key: CryptoKey): Promise<Uint8Array> {
  const body = new TextEncoder().encode(JSON.stringify(ConfirmedPlan.parse(plan)));
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, additionalData: AAD }, key, body));
  const out = new Uint8Array(1 + nonce.length + ct.length);
  out[0] = ENVELOPE_VERSION;
  out.set(nonce, 1);
  out.set(ct, 13);
  return out;
}

/** Fails closed on wrong key, tampering, unknown version or schema mismatch. */
export async function openPlan(envelope: Uint8Array, key: CryptoKey): Promise<ConfirmedPlan> {
  if (envelope.length < 1 + 12 + 16) throw new Error('envelope too short');
  if (envelope[0] !== ENVELOPE_VERSION) throw new Error(`unknown envelope version ${envelope[0]}`);
  const nonce = envelope.slice(1, 13);
  const ct = envelope.slice(13);
  let plain: ArrayBuffer;
  try {
    plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce, additionalData: AAD }, key, ct);
  } catch {
    throw new Error('decryption failed: wrong key or modified ciphertext');
  }
  return ConfirmedPlan.parse(JSON.parse(new TextDecoder().decode(plain)));
}

export function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64url(s: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new Error('invalid base64url');
  const pad = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
