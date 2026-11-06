// Run both orderings from one identical snapshot with real local EVM receipts:
//   transfer-first: A -> B 800, spender drains B -> sink 800 (succeeds)
//   revoke-first:   B approve(S, 0), A -> B 800, spender drain attempt (reverts)
// The chain is reverted to the seeded baseline afterwards.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BaseError, ContractFunctionRevertedError, type Hex } from 'viem';
import { FUNDING_RAW, mockUsdc, publicClient, roles, testSpender, walletFor, type LocalDeployment } from '../src/index.js';
import { balanceOf, nodeIdentity, pinnedFact, repoRoot, waitOk, writeJson } from './lib.js';

const dep: LocalDeployment = JSON.parse(readFileSync(join(repoRoot, 'packages/chain/deployments/local-31337.json'), 'utf8'));
const node = await nodeIdentity();
if (node.chainId !== dep.chainId) throw new Error('chain mismatch with deployment');

const a = walletFor(roles.walletA);
const b = walletFor(roles.walletB);
const attacker = walletFor(roles.sink);

const snapshot = async () => (await publicClient.request({ method: 'evm_snapshot' as never })) as Hex;
const revert = async (id: Hex) => {
  const ok = await publicClient.request({ method: 'evm_revert' as never, params: [id] as never });
  if (!ok) throw new Error(`evm_revert ${id} failed`);
};

const balances = async () => ({
  A: (await balanceOf(dep.token, dep.walletA)).toString(),
  B: (await balanceOf(dep.token, dep.walletB)).toString(),
  sink: (await balanceOf(dep.token, dep.sink)).toString(),
});

const baselineSnap = await snapshot();
const baseline = await pinnedFact(dep.token, dep.walletB, dep.spender);
if (baseline.balanceRaw !== '0' || BigInt(baseline.allowanceRaw) < FUNDING_RAW) {
  throw new Error('baseline not as seeded; restart the local node and run seed first');
}

// Branch 1: transfer first
const transfer1 = await waitOk(await a.writeContract({ address: dep.token, abi: mockUsdc.abi, functionName: 'transfer', args: [dep.walletB, FUNDING_RAW] }));
const drain1 = await waitOk(
  await attacker.writeContract({ address: dep.spender, abi: testSpender.abi, functionName: 'drain', args: [dep.token, dep.walletB, dep.sink, FUNDING_RAW] }),
);
const transferFirst = {
  sequence: ['A.transfer(B, 800)', 'S.drain(B -> sink, 800)'],
  receipts: { transfer: transfer1, drain: drain1 },
  finalBalances: await balances(),
  finalAllowanceBS: (await pinnedFact(dep.token, dep.walletB, dep.spender)).allowanceRaw,
};
await revert(baselineSnap);

// Branch 2: revoke first, from the identical baseline
const baselineSnap2 = await snapshot();
const again = await pinnedFact(dep.token, dep.walletB, dep.spender);
if (again.balanceRaw !== baseline.balanceRaw || again.allowanceRaw !== baseline.allowanceRaw) throw new Error('snapshot did not restore baseline');

const revoke = await waitOk(await b.writeContract({ address: dep.token, abi: mockUsdc.abi, functionName: 'approve', args: [dep.spender, 0n] }));
const transfer2 = await waitOk(await a.writeContract({ address: dep.token, abi: mockUsdc.abi, functionName: 'transfer', args: [dep.walletB, FUNDING_RAW] }));

let drainAttempt: { reverted: boolean; reason?: string; simulated: true };
try {
  await publicClient.simulateContract({
    account: roles.sink,
    address: dep.spender,
    abi: testSpender.abi,
    functionName: 'drain',
    args: [dep.token, dep.walletB, dep.sink, FUNDING_RAW],
  });
  drainAttempt = { reverted: false, simulated: true };
} catch (err) {
  const revertErr = err instanceof BaseError ? err.walk((e) => e instanceof ContractFunctionRevertedError) : null;
  const reason = revertErr instanceof ContractFunctionRevertedError ? (revertErr.reason ?? revertErr.shortMessage) : String((err as Error).message).split('\n')[0];
  drainAttempt = { reverted: true, reason, simulated: true };
}

const revokeFirst = {
  sequence: ['B.approve(S, 0)', 'A.transfer(B, 800)', 'S.drain(B -> sink, 800) attempt'],
  receipts: { revoke, transfer: transfer2 },
  drainAttempt,
  finalBalances: await balances(),
  finalAllowanceBS: (await pinnedFact(dep.token, dep.walletB, dep.spender)).allowanceRaw,
};
await revert(baselineSnap2);

const ok =
  drain1.status === 'success' &&
  transferFirst.finalBalances.B === '0' &&
  transferFirst.finalBalances.sink === FUNDING_RAW.toString() &&
  drainAttempt.reverted &&
  revokeFirst.finalBalances.B === FUNDING_RAW.toString() &&
  revokeFirst.finalAllowanceBS === '0';

const out = writeJson('evidence/local-evm/ordering-proof.json', {
  label: 'Real local EVM execution on simulated fixture state. Test spender deliberately permits the exercise.',
  generatedAt: new Date().toISOString(),
  node,
  deployment: dep,
  baseline: { ...baseline, owner: dep.walletB, spender: dep.spender },
  transferFirst,
  revokeFirst,
  result: ok ? 'PASS: transfer-first drained 800; revoke-first drain reverted and B kept 800' : 'FAIL',
  note: 'Drain attempt in revoke-first is an eth_call against the post-transfer state; a revert there means a sent transaction would also revert at that state.',
});

console.log(JSON.stringify({ transferFirst: transferFirst.finalBalances, revokeFirst: revokeFirst.finalBalances, drainAttempt }, null, 2));
console.log(ok ? 'PASS' : 'FAIL', '->', out);
if (!ok) process.exit(1);
