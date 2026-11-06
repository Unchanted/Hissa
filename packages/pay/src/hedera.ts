/**
 * Hedera basics shared by the paywall, the merchant agent and the setup script:
 * env loading, SDK clients, HBAR units, HashScan links and mirror-node checks.
 */
import "dotenv/config";
import { AccountId, Client, PrivateKey } from "@hiero-ledger/sdk";

export const NETWORK = "testnet" as const;
export const X402_NETWORK = "hedera:testnet" as const;
export const HBAR_ASSET = "0.0.0";
export const MIRROR = "https://testnet.mirrornode.hedera.com";
export const FACILITATOR_URL = process.env["X402_FACILITATOR_URL"] ?? "https://api.testnet.blocky402.com";

export function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`${name} is not set. Run \`npm run hedera:setup\` or see .env.example.`);
  return v;
}

/** ECDSA only: x402 on Hedera rejects ED25519 keys. Accepts hex with or without 0x, or DER. */
export function parseEcdsaKey(raw: string): PrivateKey {
  const s = raw.trim();
  if (s.startsWith("3030") || s.startsWith("302e")) return PrivateKey.fromStringDer(s);
  return PrivateKey.fromStringECDSA(s.startsWith("0x") ? s.slice(2) : s);
}

export function clientFor(accountId: string, key: PrivateKey): Client {
  return Client.forTestnet().setOperator(AccountId.fromString(accountId), key);
}

export const TINYBARS_PER_HBAR = 100_000_000n;
export function hbarToTinybars(hbar: number): bigint {
  return BigInt(Math.round(hbar * 1e8));
}
export function tinybarsToHbar(t: bigint | string): string {
  return (Number(BigInt(t)) / 1e8).toFixed(8).replace(/\.?0+$/, "");
}

/** `0.0.123@1700000000.000000001` → `0.0.123-1700000000-000000001` (mirror node and HashScan form). */
export function txIdDashed(txId: string): string {
  const m = /^(\d+\.\d+\.\d+)[@-](\d+)[.-](\d+)$/.exec(txId.trim());
  if (!m) throw new Error(`Not a Hedera transaction ID: ${txId}`);
  return `${m[1]}-${m[2]}-${m[3]}`;
}

export const hashscan = {
  tx: (txId: string) => `https://hashscan.io/${NETWORK}/transaction/${txIdDashed(txId)}`,
  account: (id: string) => `https://hashscan.io/${NETWORK}/account/${id}`,
  topic: (id: string) => `https://hashscan.io/${NETWORK}/topic/${id}`,
};

export type MirrorTransfer = { account: string; amount: number };
export type MirrorTx = {
  transaction_id: string;
  consensus_timestamp: string;
  result: string;
  name: string;
  memo_base64?: string;
  transfers: MirrorTransfer[];
};

/** Polls the mirror node until the transaction appears (it lags consensus by a few seconds). */
export async function fetchMirrorTx(txId: string, timeoutMs = 30_000): Promise<MirrorTx> {
  const url = `${MIRROR}/api/v1/transactions/${txIdDashed(txId)}`;
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const res = await fetch(url);
    if (res.ok) {
      const body = (await res.json()) as { transactions: MirrorTx[] };
      const tx = body.transactions?.[0];
      if (tx) return tx;
    }
    if (Date.now() > deadline) throw new Error(`Mirror node has no record of ${txId} after ${timeoutMs} ms`);
    await new Promise((r) => setTimeout(r, 2_000));
  }
}

/** Independent check that a settled x402 payment really moved `amount` tinybars to `payTo`. */
export async function verifyHbarPayment(txId: string, payTo: string, amount: bigint) {
  const tx = await fetchMirrorTx(txId);
  const received = tx.transfers.filter((t) => t.account === payTo).reduce((s, t) => s + BigInt(t.amount), 0n);
  return {
    ok: tx.result === "SUCCESS" && received >= amount,
    result: tx.result,
    consensusTimestamp: tx.consensus_timestamp,
    receivedTinybars: received.toString(),
  };
}

export async function hbarBalance(accountId: string): Promise<string> {
  const res = await fetch(`${MIRROR}/api/v1/balances?account.id=${accountId}`);
  const body = (await res.json()) as { balances: { balance: number }[] };
  return tinybarsToHbar(BigInt(body.balances?.[0]?.balance ?? 0));
}
