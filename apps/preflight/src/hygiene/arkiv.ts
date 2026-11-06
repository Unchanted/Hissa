// Encrypted confirmed-plan memory on Arkiv (Rabdi testnet). The user's own browser wallet
// signs the write; Preflight has no wallet key and no data key. Only generic attributes
// are public: schema tag, record type and envelope version. The plan itself is ciphertext.
import { ExpirationTime, createPublicClient, createWalletClient } from '@arkiv-network/sdk';
import { rabdi } from '@arkiv-network/sdk/chains';
import { bytes, defineSchema, str } from '@arkiv-network/sdk/schema';
import { custom, hexToBytes, http, isHex, type Address, type Hex } from 'viem';
import {
  ENVELOPE_VERSION,
  RECORD_TYPE,
  exportKeyB64,
  generateDataKey,
  importKeyB64,
  openPlan,
  sealPlan,
  type ConfirmedPlan,
} from '@preflight/shared/hygiene';
import { injected } from './wallet.js';

const env = import.meta.env as Record<string, string | undefined>;
// Public endpoint unless an access key is configured. A key here is visible to anyone using
// the page; use a low-privilege key only.
const chain = rabdi({ accessKey: env.VITE_ARKIV_ACCESS_KEY ?? '' });
export const ARKIV_CHAIN_ID = chain.id;
export const ARKIV_EXPLORER = chain.blockExplorers.default.url;
export const EXPIRY_DAYS = 7;

export const PreflightRecord = defineSchema('preflight.record', {
  recordType: str().indexed(),
  envelopeVersion: str(),
  payload: bytes(),
});

const KEY_STORE = 'preflight.datakey.v1';
const POINTER_STORE = 'preflight.arkiv.pointer.v1';

export interface ArkivPointer {
  entityKey: Hex;
  txHash: Hex;
  writer: Address;
  expiresAtBlock: string;
  savedAt: string;
}

export interface BackupFile {
  kind: 'preflight-encrypted-memory-backup';
  v: 1;
  chainId: number;
  entityKey: Hex;
  writer: Address;
  dataKeyB64url: string;
  createdAt: string;
  warning: string;
}

const publicClient = createPublicClient({ chain, transport: http() });

function getStored(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function setStored(k: string, v: string | null) {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* storage unavailable */
  }
}

export function loadPointer(): ArkivPointer | null {
  const raw = getStored(POINTER_STORE);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ArkivPointer;
  } catch {
    return null;
  }
}

export function localKeyB64(): string | null {
  return getStored(KEY_STORE);
}

async function dataKey(): Promise<CryptoKey> {
  const existing = getStored(KEY_STORE);
  if (existing) return importKeyB64(existing);
  const key = await generateDataKey();
  setStored(KEY_STORE, await exportKeyB64(key));
  return key;
}

async function switchToArkiv() {
  const eth = injected();
  if (!eth) throw new Error('No browser wallet found. Arkiv saves need your wallet to sign.');
  const hex = `0x${chain.id.toString(16)}`;
  try {
    await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hex }] });
  } catch {
    await eth.request({
      method: 'wallet_addEthereumChain',
      params: [
        {
          chainId: hex,
          chainName: 'Arkiv Rabdi testnet',
          nativeCurrency: chain.nativeCurrency,
          rpcUrls: ['https://rpc.rabdi.db-chain.testnet.arkiv.network'],
          blockExplorerUrls: [chain.blockExplorers.default.url],
        },
      ],
    });
  }
}

/** User gesture only. The wallet shows the Arkiv transaction for approval. */
export async function savePlanToArkiv(plan: ConfirmedPlan): Promise<ArkivPointer> {
  if (plan.status !== 'confirmed') throw new Error('Only a confirmed plan can be saved');
  const eth = injected();
  if (!eth) throw new Error('No browser wallet found. Arkiv saves need your wallet to sign.');
  const [account] = (await eth.request({ method: 'eth_requestAccounts' })) as Address[];
  if (!account) throw new Error('Wallet returned no account');
  await switchToArkiv();
  const envelope = await sealPlan(plan, await dataKey());
  const wallet = createWalletClient({ chain, transport: custom(eth), account });
  const res = await wallet.createEntity(
    PreflightRecord,
    { recordType: RECORD_TYPE, envelopeVersion: String(ENVELOPE_VERSION), payload: envelope },
    { expiration: ExpirationTime.fromDays(EXPIRY_DAYS) },
  );
  const pointer: ArkivPointer = {
    entityKey: res.entityKey,
    txHash: res.txHash,
    writer: account,
    expiresAtBlock: res.expiresAt.toString(),
    savedAt: new Date().toISOString(),
  };
  setStored(POINTER_STORE, JSON.stringify(pointer));
  return pointer;
}

export type RestoreResult =
  | { ok: true; plan: ConfirmedPlan; owner: string | null; publicAttributes: Record<string, string> }
  | { ok: false; reason: string };

/** Read by entity key with a fresh client, then decrypt with the user-held key. */
export async function restorePlanFromArkiv(entityKey: Hex, keyB64: string): Promise<RestoreResult> {
  let key: CryptoKey;
  try {
    key = await importKeyB64(keyB64);
  } catch {
    return { ok: false, reason: 'The recovery key is not a valid 256-bit key' };
  }
  let row: Awaited<ReturnType<typeof publicClient.getEntity<typeof PreflightRecord>>>;
  try {
    row = await publicClient.getEntity(entityKey, PreflightRecord);
  } catch (e) {
    const msg = (e as Error).message.split('\n')[0] ?? '';
    return { ok: false, reason: /no entity|not found|expired/i.test(msg) ? 'No such record on Arkiv (missing or expired)' : `Arkiv read failed: ${msg}` };
  }
  try {
    const plan = await openPlan(toBytes(row.payload), key);
    const r = row as unknown as Record<string, unknown>;
    return {
      ok: true,
      plan,
      owner: typeof r.$owner === 'string' ? r.$owner : null,
      publicAttributes: { recordType: bare(row.recordType), envelopeVersion: bare(row.envelopeVersion) },
    };
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }
}

/** Row values may arrive bare or as tagged { type, value } objects. */
function unwrap(v: unknown): unknown {
  return v && typeof v === 'object' && !(v instanceof Uint8Array) && 'value' in v ? (v as { value: unknown }).value : v;
}
function bare(v: unknown): string {
  return String(unwrap(v));
}
function toBytes(v: unknown): Uint8Array {
  const u = unwrap(v);
  if (u instanceof Uint8Array) return u;
  if (typeof u === 'string' && isHex(u)) return hexToBytes(u);
  throw new Error('Arkiv record payload is not bytes');
}

export function buildBackup(pointer: ArkivPointer, keyB64: string): BackupFile {
  return {
    kind: 'preflight-encrypted-memory-backup',
    v: 1,
    chainId: chain.id,
    entityKey: pointer.entityKey,
    writer: pointer.writer,
    dataKeyB64url: keyB64,
    createdAt: new Date().toISOString(),
    warning: 'Contains your decryption key. Keep it private. Never upload or commit it.',
  };
}

export function parseBackup(text: string): BackupFile | null {
  try {
    const b = JSON.parse(text) as BackupFile;
    if (b.kind !== 'preflight-encrypted-memory-backup' || b.v !== 1) return null;
    if (!/^0x[0-9a-fA-F]{64}$/.test(b.entityKey) || typeof b.dataKeyB64url !== 'string') return null;
    return b;
  } catch {
    return null;
  }
}

/** Clear the local plan cache pointer (not the key) to demonstrate restore. */
export function forgetPointer() {
  setStored(POINTER_STORE, null);
}

export function forgetKey() {
  setStored(KEY_STORE, null);
}
