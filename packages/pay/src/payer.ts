/**
 * Buyer side: an x402 `fetch` for the merchant agent that pays in HBAR on its own,
 * with no human approval, inside three spending controls:
 *   - per-purchase cap (also enforced by the x402 client's own spend controls),
 *   - run budget,
 *   - daily cap, persisted across runs in an ignored local ledger.
 * A payment that would break any control is aborted before anything is signed.
 */
import fs from "node:fs";
import path from "node:path";
import { x402Client } from "@x402/core/client";
import { decodePaymentResponseHeader, wrapFetchWithPayment } from "@x402/fetch";
import { createClientHederaSigner } from "@x402/hedera";
import { ExactHederaScheme } from "@x402/hedera/exact/client";
import type { PrivateKey } from "@hiero-ledger/sdk";
import { HBAR_ASSET, X402_NETWORK, tinybarsToHbar } from "./hedera.js";

export type SpendLimits = { budget: bigint; perPurchase: bigint; daily: bigint };

export type PaidResult<T> = {
  body: T;
  txId: string;
  payer: string | undefined;
  payTo: string;
  amountTinybars: bigint;
};

const LEDGER = path.resolve("evidence/private/agent-spend-ledger.json");
const today = () => new Date().toISOString().slice(0, 10);

function readDailySpent(): bigint {
  try {
    const l = JSON.parse(fs.readFileSync(LEDGER, "utf8")) as Record<string, string>;
    return BigInt(l[today()] ?? "0");
  } catch {
    return 0n;
  }
}
function addDailySpent(amount: bigint) {
  let l: Record<string, string> = {};
  try {
    l = JSON.parse(fs.readFileSync(LEDGER, "utf8"));
  } catch {}
  l[today()] = (BigInt(l[today()] ?? "0") + amount).toString();
  fs.mkdirSync(path.dirname(LEDGER), { recursive: true });
  fs.writeFileSync(LEDGER, JSON.stringify(l, null, 2));
}

export class AgentPayer {
  private spent = 0n;
  private quoted: { amount: bigint; payTo: string } | null = null;
  private readonly paidFetch: typeof fetch;

  constructor(
    readonly accountId: string,
    key: PrivateKey,
    readonly limits: SpendLimits,
    private readonly log: (msg: string) => void = console.log,
  ) {
    const signer = createClientHederaSigner(accountId, key, { network: X402_NETWORK });
    const client = x402Client.fromConfig({
      schemes: [{ network: X402_NETWORK, client: new ExactHederaScheme(signer) }],
      spendControls: {
        maxAmountPerPayment: false,
        allowedAssets: [{ network: X402_NETWORK, asset: HBAR_ASSET, maxAmountPerPayment: limits.perPurchase.toString() }],
      },
    });

    client.onBeforePaymentCreation(async (ctx) => {
      const req = ctx.selectedRequirements;
      const amount = BigInt(req.amount);
      const left = this.remaining();
      const dailyLeft = limits.daily - readDailySpent();
      this.log(
        `  402 quote: ${tinybarsToHbar(amount)} HBAR → ${req.payTo}  (budget left ${tinybarsToHbar(left)}, daily left ${tinybarsToHbar(dailyLeft)})`,
      );
      if (req.asset !== HBAR_ASSET) return { abort: true, reason: `unexpected asset ${req.asset}` };
      if (amount > limits.perPurchase) return { abort: true, reason: "over per-purchase cap" };
      if (amount > left) return { abort: true, reason: "over run budget" };
      if (amount > dailyLeft) return { abort: true, reason: "over daily cap" };
      this.quoted = { amount, payTo: req.payTo };
      this.log("  policy OK → signing HBAR transfer, no human approval");
    });

    this.paidFetch = wrapFetchWithPayment(fetch, client);
  }

  remaining(): bigint {
    return this.limits.budget - this.spent;
  }

  /** Requests a paid resource; returns the body and the Hedera transaction that settled it. */
  async buy<T>(url: string, init?: RequestInit): Promise<PaidResult<T>> {
    this.quoted = null;
    const res = await this.paidFetch(url, init);
    const header = res.headers.get("PAYMENT-RESPONSE") ?? res.headers.get("X-PAYMENT-RESPONSE");
    if (!res.ok) throw new Error(`${init?.method ?? "GET"} ${url} → ${res.status}: ${await res.text()}`);
    if (!header || !this.quoted) throw new Error(`${url} returned ${res.status} without a settled x402 payment`);

    const settle = decodePaymentResponseHeader(header);
    if (!settle.success) throw new Error(`settlement failed: ${settle.errorReason ?? "unknown"}`);
    const { amount, payTo } = this.quoted;
    this.spent += amount;
    addDailySpent(amount);
    return { body: (await res.json()) as T, txId: settle.transaction, payer: settle.payer, payTo, amountTinybars: amount };
  }
}
