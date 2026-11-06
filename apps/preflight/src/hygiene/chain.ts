import { createPublicClient, defineChain, erc20Abi, getAddress, http, type Address } from 'viem';
import type { ChainFact } from '@preflight/shared/hygiene';
import deployment from '../../../../packages/chain/deployments/local-31337.json';

const env = import.meta.env as Record<string, string | undefined>;
export const RPC_URL = env.VITE_LOCAL_RPC_URL ?? 'http://127.0.0.1:8545';

export const localChain = defineChain({
  id: 31337,
  name: 'Preflight local EVM (fixture)',
  nativeCurrency: { name: 'Test Ether', symbol: 'tETH', decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
});

export const DEPLOYMENT = {
  chainId: deployment.chainId,
  token: getAddress(deployment.token),
  spender: getAddress(deployment.spender),
  walletA: getAddress(deployment.walletA),
  walletB: getAddress(deployment.walletB),
} as const;

export const TOKEN_LABEL = 'fUSDC: USDC fixture, no monetary value';
export const TOKEN_DECIMALS = 6;

export const ALIASES: Record<'A' | 'B', Address> = { A: DEPLOYMENT.walletA, B: DEPLOYMENT.walletB };

export const publicClient = createPublicClient({ chain: localChain, transport: http(RPC_URL, { retryCount: 0, timeout: 5_000 }) });

export type FactResult = { ok: true; fact: ChainFact } | { ok: false; reason: string };

/** Read balance and allowance for owner/spender at one pinned block. Any failure is "unknown". */
export async function readFact(owner: Address, spender: Address = DEPLOYMENT.spender): Promise<FactResult> {
  try {
    const chainId = await publicClient.getChainId();
    if (chainId !== DEPLOYMENT.chainId) return { ok: false, reason: `RPC chain ${chainId} is not ${DEPLOYMENT.chainId}` };
    const code = await publicClient.getCode({ address: DEPLOYMENT.token });
    if (!code || code === '0x') return { ok: false, reason: 'no token code at configured address (run seed?)' };
    const block = await publicClient.getBlock({ blockTag: 'latest' });
    const [balance, allowance, decimals] = await Promise.all([
      publicClient.readContract({ address: DEPLOYMENT.token, abi: erc20Abi, functionName: 'balanceOf', args: [owner], blockNumber: block.number }),
      publicClient.readContract({ address: DEPLOYMENT.token, abi: erc20Abi, functionName: 'allowance', args: [owner, spender], blockNumber: block.number }),
      publicClient.readContract({ address: DEPLOYMENT.token, abi: erc20Abi, functionName: 'decimals', blockNumber: block.number }),
    ]);
    if (decimals !== TOKEN_DECIMALS) return { ok: false, reason: `unexpected token decimals ${decimals}` };
    return {
      ok: true,
      fact: {
        schemaVersion: 1,
        id: `fact-${block.number}-${owner.slice(2, 8)}`,
        chainId,
        blockNumber: block.number.toString(),
        blockHash: block.hash,
        fetchedAt: new Date().toISOString(),
        source: 'local-evm',
        token: DEPLOYMENT.token,
        decimals,
        owner,
        spender,
        balanceRaw: balance.toString(),
        allowanceRaw: allowance.toString(),
        evidenceRef: `${RPC_URL} eth_call @ block ${block.number}`,
      },
    };
  } catch (e) {
    return { ok: false, reason: `chain read failed: ${((e as Error).message.split('\n')[0] ?? '').replace(/\.+$/, '')}` };
  }
}
