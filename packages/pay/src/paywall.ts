/**
 * Seller side: x402 paywall for Hono, settling HBAR on Hedera testnet through the
 * Blocky402 facilitator. Implements the work plan's `PaymentGateway` idea:
 * a route config in, a Hono middleware out, and a callback per settled payment.
 */
import { HTTPFacilitatorClient } from "@x402/core/server";
import type { HTTPRequestContext, RoutesConfig } from "@x402/core/server";
import { ExactHederaScheme } from "@x402/hedera/exact/server";
import { paymentMiddleware, x402ResourceServer } from "@x402/hono";
import type { MiddlewareHandler } from "hono";
import { FACILITATOR_URL, HBAR_ASSET, X402_NETWORK } from "./hedera.js";

export type SettledPayment = {
  /** Hedera transaction ID, e.g. `0.0.123@1700000000.000000001`. */
  txId: string;
  payer: string | undefined;
  payTo: string;
  amountTinybars: string;
  resource: string;
  network: string;
};

export type PaidRoute = {
  description: string;
  /** Price in tinybars; a function lets the price depend on the request (e.g. listing tier). */
  priceTinybars: bigint | ((ctx: HTTPRequestContext) => bigint | Promise<bigint>);
};

export function createPaywall(opts: {
  payTo: string;
  routes: Record<string, PaidRoute>;
  onSettled?: (p: SettledPayment) => void | Promise<void>;
}): MiddlewareHandler {
  const facilitator = new HTTPFacilitatorClient({ url: FACILITATOR_URL });
  const server = new x402ResourceServer(facilitator).register(X402_NETWORK, new ExactHederaScheme());

  server.onAfterSettle(async (ctx) => {
    if (!ctx.result.success || !opts.onSettled) return;
    const req = ctx.requirements;
    await opts.onSettled({
      txId: ctx.result.transaction,
      payer: ctx.result.payer,
      payTo: req.payTo,
      amountTinybars: req.amount,
      resource: String(ctx.paymentPayload.resource?.url ?? ""),
      network: ctx.result.network,
    });
  });

  const routes: RoutesConfig = {};
  for (const [pattern, r] of Object.entries(opts.routes)) {
    routes[pattern] = {
      accepts: [
        {
          scheme: "exact",
          network: X402_NETWORK,
          payTo: opts.payTo,
          price: async (ctx: HTTPRequestContext) => ({
            asset: HBAR_ASSET,
            amount: String(typeof r.priceTinybars === "function" ? await r.priceTinybars(ctx) : r.priceTinybars),
          }),
        },
      ],
      description: r.description,
      mimeType: "application/json",
    };
  }
  return paymentMiddleware(routes, server);
}
