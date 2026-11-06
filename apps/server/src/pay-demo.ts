/**
 * Marketplace API with real x402 payments on Hedera testnet; listings, records and
 * reports are fixtures until the Arkiv and 0G lanes are wired in.
 *
 *   GET  /api/listings              free   browse public tags
 *   GET  /api/analyses              free   premade analysis catalog
 *   GET  /api/records/:key          x402   one masked record, priced by quality tier
 *   POST /api/insights/:analysisId  x402   aggregated report; small cohorts refused before payment
 *   GET  /api/receipts              free   settled payments (will become dm.sale / dm.insight_receipt on Arkiv)
 */
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { hashscan, requireEnv, tinybarsToHbar } from "../../../packages/pay/src/hedera.js";
import { createPaywall, type SettledPayment } from "../../../packages/pay/src/paywall.js";
import { INSIGHT_PRICE_TINYBARS, K_MIN, analyses, listings, records, reportFor } from "./fixtures.js";

const payTo = requireEnv("HEDERA_TREASURY_ID");
const port = Number(process.env["PORT"] ?? 4021);
const receipts: (SettledPayment & { hashscan: string; at: string })[] = [];

const app = new Hono();
app.use("*", cors({ origin: "*", exposeHeaders: ["PAYMENT-REQUIRED", "PAYMENT-RESPONSE"] }));

app.get("/health", (c) => c.json({ ok: true, payTo, network: "hedera:testnet" }));

app.get("/api/listings", (c) => {
  const q = c.req.query();
  const items = listings.filter(
    (l) => (!q["domain"] || l.domain === q["domain"]) && (!q["region"] || l.region === q["region"]),
  );
  return c.json({ items });
});

app.get("/api/analyses", (c) => c.json({ items: analyses.map(({ cohort, ...a }) => a) }));
app.get("/api/receipts", (c) => c.json({ items: receipts }));

// Refuse before asking for money: unknown or non-consented listing, too-small cohort.
app.use("/api/records/:key", async (c, next) => {
  const l = listings.find((x) => x.listing_id === c.req.param("key"));
  if (!l) return c.json({ error: "listing not found or expired" }, 404);
  if (!l.consent_sale) return c.json({ error: "seller has not allowed record sale" }, 403);
  await next();
});
app.use("/api/insights/:analysisId", async (c, next) => {
  const a = analyses.find((x) => x.id === c.req.param("analysisId"));
  if (!a) return c.json({ error: "unknown analysis" }, 404);
  if (a.cohort.distinct_users < K_MIN)
    return c.json({ error: `cohort below minimum of ${K_MIN} distinct users; no charge` }, 422);
  await next();
});

app.use(
  createPaywall({
    payTo,
    routes: {
      "GET /api/records/:key": {
        description: "One masked, watermarked data record",
        priceTinybars: (ctx) => {
          const key = ctx.path.split("/").pop();
          const l = listings.find((x) => x.listing_id === key);
          if (!l) throw new Error("unknown listing");
          return BigInt(l.price);
        },
      },
      "POST /api/insights/:analysisId": {
        description: "Aggregated, noised insight report",
        priceTinybars: INSIGHT_PRICE_TINYBARS,
      },
    },
    onSettled: (p) => {
      receipts.push({ ...p, hashscan: hashscan.tx(p.txId), at: new Date().toISOString() });
      console.log(`[x402] settled ${tinybarsToHbar(p.amountTinybars)} HBAR from ${p.payer} → ${p.payTo}  ${hashscan.tx(p.txId)}`);
    },
  }),
);

app.get("/api/records/:key", (c) => c.json({ record: records[c.req.param("key")] }));
app.post("/api/insights/:analysisId", (c) => c.json({ report: reportFor(c.req.param("analysisId")) }));

serve({ fetch: app.fetch, port }, () => {
  console.log(`Marketplace API on http://localhost:${port}  (x402 payTo ${payTo}, hedera:testnet via Blocky402)`);
});
