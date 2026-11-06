import { createPublicClient, createWalletClient, http, type Address, type Hex } from 'viem';
import { mnemonicToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';
import MockUSDCArtifact from './artifacts/MockUSDC.json' with { type: 'json' };
import TestSpenderArtifact from './artifacts/TestSpender.json' with { type: 'json' };

export const mockUsdc = { abi: MockUSDCArtifact.abi, bytecode: MockUSDCArtifact.bytecode as Hex } as const;
export const testSpender = { abi: TestSpenderArtifact.abi, bytecode: TestSpenderArtifact.bytecode as Hex } as const;

export const LOCAL_CHAIN_ID = 31337;
export const LOCAL_RPC_URL = process.env.LOCAL_RPC_URL ?? 'http://127.0.0.1:8545';

/**
 * Publicly known Anvil/Hardhat development mnemonic. These keys hold no value and
 * must never be used on any public network.
 */
export const DEV_MNEMONIC = 'test test test test test test test test test test test junk';

export const roles = {
  deployer: mnemonicToAccount(DEV_MNEMONIC, { addressIndex: 0 }),
  walletA: mnemonicToAccount(DEV_MNEMONIC, { addressIndex: 1 }),
  walletB: mnemonicToAccount(DEV_MNEMONIC, { addressIndex: 2 }),
  sink: mnemonicToAccount(DEV_MNEMONIC, { addressIndex: 3 }),
} as const;

export const USDC_UNIT = 1_000_000n;
export const FUNDING_RAW = 800n * USDC_UNIT;
export const REPAYMENT_RAW = 500n * USDC_UNIT;
export const SEED_ALLOWANCE_RAW = 1000n * USDC_UNIT;

export const publicClient = createPublicClient({ chain: foundry, transport: http(LOCAL_RPC_URL) });

export function walletFor(account: (typeof roles)[keyof typeof roles]) {
  return createWalletClient({ account, chain: foundry, transport: http(LOCAL_RPC_URL) });
}

export interface LocalDeployment {
  chainId: number;
  node: string;
  token: Address;
  spender: Address;
  walletA: Address;
  walletB: Address;
  sink: Address;
  deployedAtBlock: string;
}
