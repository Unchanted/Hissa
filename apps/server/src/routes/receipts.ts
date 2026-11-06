import { Hono } from "hono";
import type { ArkivReader } from "../../../../packages/arkiv/src/index.ts";

type Reader = Pick<ArkivReader, "listSales" | "listInsightReceipts" | "listPayouts">;
const fields = {
  sale: ["listing", "buyer_ref", "payment_tx", "price"],
  insight: ["spec_hash", "analysis_id", "domain", "cohort_bucket", "epsilon", "k_min", "payment_tx", "contributors_root"],
  payout: ["batch_id", "scheduled_tx"],
} as const;

/** Mount at /api/receipts. Each kind has its own independent key cursor. */
export function createReceiptsRoutes(reader: Reader) {
  const app = new Hono();
  app.onError((_, c) => c.json({ error: "request_failed" }, 500));
  app.get("/", async (c) => {
    c.header("Cache-Control", "no-store");
    const query = c.req.queries();
    if (Object.entries(query).some(([name, values]) => !["kind", "cursor"].includes(name) || values.length !== 1)) {
      return c.json({ error: "invalid_receipt_query" }, 400);
    }
    const kind = query.kind?.[0] ?? "sale";
    const cursor = query.cursor?.[0];
    if ((kind !== "sale" && kind !== "insight" && kind !== "payout") || (cursor !== undefined && !/^0x[\da-f]{64}$/i.test(cursor))) {
      return c.json({ error: "invalid_receipt_query" }, 400);
    }
    try {
      const result = await (kind === "sale" ? reader.listSales(cursor)
        : kind === "insight" ? reader.listInsightReceipts(cursor) : reader.listPayouts(cursor));
      const items = result.items.map((item) => {
        const record = item as unknown as Record<string, unknown>;
        return {
          kind, entityKey: item.entityKey, expiresAt: item.expiresAt.toString(),
          ...Object.fromEntries(fields[kind].map((name) => {
            const value = record[name];
            return [name, typeof value === "bigint" ? value.toString() : value];
          })),
        };
      });
      return c.json({ items, ...(result.next ? { next: result.next } : {}) });
    } catch {
      return c.json({ error: "arkiv_unavailable" }, 502);
    }
  });
  return app;
}
