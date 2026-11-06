import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { PublicationError } from "../../../../packages/arkiv/src/publisher.ts";
import type { makeArkivAppStore } from "../../../../packages/arkiv/src/app-store.ts";

type Store = ReturnType<typeof makeArkivAppStore>;
export function createAppListingRoutes(store: Pick<Store, "publish" | "mutate" | "browse" | "getListing">) {
  const app = new Hono();
  app.use("*", async (c, next) => { c.header("Cache-Control", "no-store"); await next(); });
  app.onError((error, c) => {
    if (error instanceof PublicationError) {
      if (error.kind === "invalid") return c.json({ error: "Invalid encrypted listing or signature" }, 400);
      if (error.kind === "conflict") return c.json({ error: "Listing changed, revoked, or request already consumed; refresh before retrying" }, 409);
      if (error.kind === "unavailable") console.warn(`[arkiv] ${c.req.method} ${c.req.path}: unavailable (RPC, gas estimate, or tx cost above ARKIV_MAX_TX_COST_WEI)`);
      if (error.kind === "uncertain") return c.json({ error: "Arkiv transaction needs reconciliation; do not create a replacement listing" }, 503);
    }
    console.warn(`[arkiv] ${c.req.method} ${c.req.path} failed: ${error instanceof PublicationError ? error.kind : (error as Error).message}`);
    return c.json({ error: "Arkiv unavailable" }, 503);
  });
  app.use("*", bodyLimit({ maxSize: 270000, onError: (c) => c.json({ error: "Listing too large" }, 413) }));
  app.get("/", async (c) => {
    const query = c.req.queries();
    if (Object.entries(query).some(([name, values]) => !["domain", "region", "cursor"].includes(name) || values.length !== 1 || !values[0] || Buffer.byteLength(values[0]) > 128)) {
      return c.json({ error: "Invalid listing filters" }, 400);
    }
    const cursor = query.cursor?.[0];
    if (cursor && !/^0x[\da-f]{64}$/i.test(cursor)) return c.json({ error: "Invalid cursor" }, 400);
    return c.json(await store.browse({ ...(query.domain?.[0] ? { domain: query.domain[0] } : {}), ...(query.region?.[0] ? { region: query.region[0] } : {}) }, cursor));
  });
  app.get("/:id", async (c) => {
    const found = await store.getListing(c.req.param("id"));
    if (!found) return c.json({ error: "Listing revoked, expired or not found" }, 404);
    return c.json({ listingId: found.id, entityKey: found.entityKey, consentSale: found.consentSale,
      consentContact: found.consentContact, version: found.version, expiresAt: found.row.expiresAt.toString() });
  });
  app.post("/", async (c) => {
    if (c.req.header("Content-Type")?.split(";")[0]?.trim() !== "application/json") return c.json({ error: "JSON required" }, 415);
    const body: unknown = await c.req.json().catch(() => null);
    return c.json(await store.publish(body), 201);
  });
  app.patch("/:id", async (c) => c.json(await store.mutate(c.req.param("id"), await c.req.json().catch(() => null), "patch")));
  app.delete("/:id", async (c) => c.json(await store.mutate(c.req.param("id"), await c.req.json().catch(() => null), "revoke")));
  return app;
}
