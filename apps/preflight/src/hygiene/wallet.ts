// Injected wallet access for the hygiene app only. The slot frame never imports this.
import { createWalletClient, custom, encodeFunctionData, erc20Abi, type Address, type Hash } from 'viem';
import { DEPLOYMENT, localChain, publicClient } from './chain.js';

type Eip1193 = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?: (e: string, f: (...a: unknown[]) => void) => void;
  removeListener?: (e: string, f: (...a: unknown[]) => void) => void;
};

export function injected(): Eip1193 | null {
  return ((window as unknown as { ethereum?: Eip1193 }).ethereum ?? null);
}

/** Only on explicit user click. Requests accounts; never signs. */
export async function connect(): Promise<{ account: Address; chainId: number }> {
  const eth = injected();
  if (!eth) throw new Error('No browser wallet found. Install MetaMask or Rabby, or follow the manual steps.');
  const [account] = (await eth.request({ method: 'eth_requestAccounts' })) as Address[];
  if (!account) throw new Error('Wallet returned no account');
  const chainId = Number(await eth.request({ method: 'eth_chainId' }));
  return { account, chainId };
}

export async function switchToLocal(): Promise<void> {
  const eth = injected();
  if (!eth) return;
  const hex = `0x${localChain.id.toString(16)}`;
  try {
    await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hex }] });
  } catch {
    await eth.request({
      method: 'wallet_addEthereumChain',
      params: [{ chainId: hex, chainName: localChain.name, nativeCurrency: localChain.nativeCurrency, rpcUrls: localChain.rpcUrls.default.http }],
    });
  }
}

export interface RevokePreview {
  from: Address;
  to: Address;
  chainId: number;
  value: '0';
  functionName: 'approve';
  args: { spender: Address; amount: '0' };
  data: `0x${string}`;
}

export function buildRevoke(owner: Address): RevokePreview {
  return {
    from: owner,
    to: DEPLOYMENT.token,
    chainId: DEPLOYMENT.chainId,
    value: '0',
    functionName: 'approve',
    args: { spender: DEPLOYMENT.spender, amount: '0' },
    data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [DEPLOYMENT.spender, 0n] }),
  };
}

/** Separate user gesture: asks the wallet to review, sign and send. */
export async function sendRevoke(preview: RevokePreview): Promise<Hash> {
  const eth = injected();
  if (!eth) throw new Error('No browser wallet');
  const client = createWalletClient({ chain: localChain, transport: custom(eth) });
  const [current] = await client.getAddresses();
  if (current?.toLowerCase() !== preview.from.toLowerCase()) throw new Error('Connected account is not the allowance owner (B).');
  const chainId = await client.getChainId();
  if (chainId !== preview.chainId) throw new Error(`Wallet is on chain ${chainId}, expected ${preview.chainId}.`);
  return client.sendTransaction({ account: preview.from, to: preview.to, data: preview.data, value: 0n, chain: localChain });
}

export async function waitReceipt(hash: Hash) {
  return publicClient.waitForTransactionReceipt({ hash });
}
