import { createWalletClient } from "@arkiv-network/sdk";
import type { rabdi } from "@arkiv-network/sdk/chains";
import { custom, MethodNotFoundRpcError, type LocalAccount } from "viem";

/** Obtain the exact SDK estimate without allowing signing or a mutating RPC. */
export async function estimateWithRequest(
  account: LocalAccount,
  chain: ReturnType<typeof rabdi>,
  rpc: Parameters<typeof custom>[0],
  prepare: (wallet: ReturnType<typeof createWalletClient>) => Promise<unknown>,
): Promise<bigint> {
  try {
    if (BigInt(await rpc.request({ method: "eth_chainId" }) as string) !== 7794095n) throw new Error();
    const allowed = new Set([
      "eth_chainId", "eth_blockNumber", "eth_getBlockByNumber", "eth_getTransactionCount",
      "eth_gasPrice", "eth_maxPriorityFeePerGas", "eth_estimateGas",
    ]);
    let estimate: bigint | undefined;
    const captured = new Error("Unsigned estimate captured");
    const transport = custom({ async request(args) {
      if (args.method === "eth_fillTransaction") throw new MethodNotFoundRpcError(new Error("Use estimate path"));
      if (!allowed.has(args.method)) throw new Error("Unexpected RPC blocked");
      const result = await rpc.request(args.method === "eth_estimateGas"
        ? { method: "eth_estimateGas", params: [args.params?.[0], "latest"] } : args);
      if (args.method === "eth_estimateGas") {
        if (typeof result !== "string" || !/^0x[\da-f]+$/i.test(result)) throw new Error();
        estimate = BigInt(result);
        if (estimate <= 0n) throw new Error();
        const block = await rpc.request({ method: "eth_getBlockByNumber", params: ["latest", false] }) as { gasLimit?: unknown } | null;
        if (!block || typeof block.gasLimit !== "string" || !/^0x[\da-f]+$/i.test(block.gasLimit)) throw new Error();
        const gas = 2n * estimate > 1_000_000n ? 2n * estimate : 1_000_000n;
        if (gas > BigInt(block.gasLimit) / 2n) throw new Error();
        throw captured;
      }
      return result;
    } }, { retryCount: 0 });
    const unsigned = { ...account, signTransaction: async () => { throw new Error("Signing blocked"); } };
    const wallet = createWalletClient({ account: unsigned, chain, cacheTime: 0, transport });
    try { await prepare(wallet); }
    catch (error) {
      let cause: unknown = error;
      for (let depth = 0; cause && depth < 24; depth++) {
        if (cause === captured && estimate !== undefined) return estimate;
        cause = typeof cause === "object" ? (cause as { cause?: unknown }).cause : undefined;
      }
    }
  } catch {
    // Provider diagnostics may contain the RPC credential; expose only this fixed verdict.
  }
  throw new Error("Unsigned preparation/estimate failed");
}
