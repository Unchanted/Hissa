/**
 * HTTP routes for 0G, ready to mount on the marketplace server:
 *   app.route("/api/ai", aiRoutes());
 *
 *   GET  /api/ai/models          sealed (TeeML) models currently offered by the 0G Router
 *   POST /api/ai/analyse-upload  { maskedText } -> missed identifiers, masked text, facets, 0G receipt
 */
import { Hono } from "hono";
import { analyseUpload } from "./upload.js";
import { ROUTER_URL, ZeroGError } from "./zerog.js";

export function aiRoutes() {
  const app = new Hono();

  app.get("/models", async (c) => {
    const res = await fetch(`${ROUTER_URL}/models`);
    const data = ((await res.json()) as { data?: any[] }).data ?? [];
    return c.json({
      items: data
        .filter((m) => m.verifiability === "TeeML")
        .map((m) => ({ id: m.id, providers: m.provider_count, tee: m.tee_type, verifier: m.tee_verifier })),
    });
  });

  app.post("/analyse-upload", async (c) => {
    const body = (await c.req.json().catch(() => null)) as { maskedText?: unknown } | null;
    if (typeof body?.maskedText !== "string") return c.json({ error: "maskedText (string) required" }, 400);
    try {
      return c.json(await analyseUpload(body.maskedText));
    } catch (e) {
      const err = e as ZeroGError;
      const status = err.status >= 400 && err.status < 600 ? err.status : 502;
      return c.json({ error: err.message, code: err.code ?? null }, status as 400);
    }
  });

  return app;
}
