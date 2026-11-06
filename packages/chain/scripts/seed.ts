// Seed the local demo chain: MockUSDC fixture, deliberately exercisable spender,
// A funded with 800, B with zero tokens but native gas, B -> S allowance of 1000.
import {
  FUNDING_RAW,
  LOCAL_CHAIN_ID,
  SEED_ALLOWANCE_RAW,
  mockUsdc,
  publicClient,
  roles,
  testSpender,
  walletFor,
  type LocalDeployment,
} from '../src/index.js';
import { nodeIdentity, pinnedFact, waitOk, writeJson } from './lib.js';

const node = await nodeIdentity();
if (node.chainId !== LOCAL_CHAIN_ID) throw new Error(`refusing to seed: chainId ${node.chainId} is not ${LOCAL_CHAIN_ID}`);

const deployer = walletFor(roles.deployer);
const b = walletFor(roles.walletB);

const tokenTx = await deployer.deployContract({ abi: mockUsdc.abi, bytecode: mockUsdc.bytecode });
const tokenReceipt = await publicClient.waitForTransactionReceipt({ hash: tokenTx });
const token = tokenReceipt.contractAddress!;

const spenderTx = await deployer.deployContract({ abi: testSpender.abi, bytecode: testSpender.bytecode });
const spenderReceipt = await publicClient.waitForTransactionReceipt({ hash: spenderTx });
const spender = spenderReceipt.contractAddress!;

const mint = await waitOk(
  await deployer.writeContract({ address: token, abi: mockUsdc.abi, functionName: 'mint', args: [roles.walletA.address, FUNDING_RAW] }),
);
const approve = await waitOk(
  await b.writeContract({ address: token, abi: mockUsdc.abi, functionName: 'approve', args: [spender, SEED_ALLOWANCE_RAW] }),
);

const factB = await pinnedFact(token, roles.walletB.address, spender);
const bGas = await publicClient.getBalance({ address: roles.walletB.address, blockNumber: BigInt(factB.blockNumber) });

if (factB.balanceRaw !== '0') throw new Error(`baseline violated: B balance ${factB.balanceRaw}`);
if (BigInt(factB.allowanceRaw) < FUNDING_RAW) throw new Error(`baseline violated: allowance ${factB.allowanceRaw}`);
if (bGas === 0n) throw new Error('baseline violated: B has no native gas');

const deployment: LocalDeployment = {
  chainId: node.chainId,
  node: node.clientVersion,
  token,
  spender,
  walletA: roles.walletA.address,
  walletB: roles.walletB.address,
  sink: roles.sink.address,
  deployedAtBlock: tokenReceipt.blockNumber.toString(),
};

writeJson('packages/chain/deployments/local-31337.json', deployment);
const evidence = writeJson('evidence/local-evm/seed.json', {
  label: 'Local EVM seed. USDC fixture, no monetary value. Test spender is deliberately exercisable.',
  generatedAt: new Date().toISOString(),
  node,
  deployment,
  txs: {
    deployToken: { hash: tokenTx, blockNumber: tokenReceipt.blockNumber.toString() },
    deploySpender: { hash: spenderTx, blockNumber: spenderReceipt.blockNumber.toString() },
    mintToA: mint,
    approveBtoS: approve,
  },
  pinnedFactB: { ...factB, owner: roles.walletB.address, spender, token, decimals: 6, nativeGasWei: bGas.toString() },
});

console.log(`seeded on ${node.clientVersion} chain ${node.chainId}`);
console.log(`token ${token} spender ${spender}`);
console.log(`B balance ${factB.balanceRaw} allowance(B,S) ${factB.allowanceRaw} at block ${factB.blockNumber}`);
console.log(`evidence: ${evidence}`);
