import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Address, Hash } from 'viem';
import { mockUsdc, publicClient } from '../src/index.js';

export const repoRoot = join(import.meta.dirname, '..', '..', '..');

export function writeJson(relPath: string, data: unknown) {
  const p = join(repoRoot, relPath);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, `${JSON.stringify(data, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2)}\n`);
  return relPath;
}

export async function nodeIdentity() {
  const [chainId, clientVersion] = await Promise.all([
    publicClient.getChainId(),
    publicClient.request({ method: 'web3_clientVersion' as never }) as Promise<string>,
  ]);
  return { chainId, clientVersion };
}

export async function waitOk(hash: Hash) {
  const r = await publicClient.waitForTransactionReceipt({ hash });
  return { hash, status: r.status, blockNumber: r.blockNumber.toString(), gasUsed: r.gasUsed.toString() };
}

/** Read balance and allowance at one pinned block. */
export async function pinnedFact(token: Address, owner: Address, spender: Address, blockNumber?: bigint) {
  const block = await publicClient.getBlock(blockNumber === undefined ? { blockTag: 'latest' } : { blockNumber });
  const [balanceRaw, allowanceRaw] = await Promise.all([
    publicClient.readContract({ address: token, abi: mockUsdc.abi, functionName: 'balanceOf', args: [owner], blockNumber: block.number }),
    publicClient.readContract({ address: token, abi: mockUsdc.abi, functionName: 'allowance', args: [owner, spender], blockNumber: block.number }),
  ]);
  return {
    blockNumber: block.number.toString(),
    blockHash: block.hash,
    balanceRaw: (balanceRaw as bigint).toString(),
    allowanceRaw: (allowanceRaw as bigint).toString(),
  };
}

export async function balanceOf(token: Address, who: Address) {
  return (await publicClient.readContract({ address: token, abi: mockUsdc.abi, functionName: 'balanceOf', args: [who] })) as bigint;
}
