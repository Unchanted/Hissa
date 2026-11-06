/**
 * HTTP routes for 0G, ready to mount on the marketplace server:
 *   app.route("/api/ai", aiRoutes());
 *
 *   GET  /api/ai/models          sealed (TeeML) models currently offered by the 0G Router
 *   POST /api/ai/analyse-upload  { maskedText } -> missed identifiers, masked text, facets, 0G receipt
 *   POST /api/ai/insight-demo    { small? } -> anonymised insight report on the synthetic cohort
 *                                (small=true shows the k-anonymity refusal, no 0G call)
 */
import { Hono } from "hono";
import { runInsight } from "./insights.js";
import { ABANDONMENT_ANALYSIS_ID, ABANDONMENT_COHORT, ABANDONMENT_QUESTION, smallAbandonmentCohort } from "./synthetic-cohort.js";
import { analyseUpload } from "./upload.js";
import { ROUTER_URL, ZeroGError } from "./zerog.js";

export function aiRoutes() {
  const app = new Hono();

  app.get("/models", async (c) => {
    try {
      const res = await fetch(`${ROUTER_URL}/models`, { signal: AbortSignal.timeout(15_000) });
      const data = ((await res.json()) as { data?: any[] }).data ?? [];
      return c.json({
        items: data
          .filter((m) => m.verifiability === "TeeML")
          .map((m) => ({ id: m.id, type: m.type, providers: m.provider_count, tee: m.tee_type, verifier: m.tee_verifier })),
      });
    } catch (e) {
      return c.json({ error: `0G model list unavailable: ${(e as Error).message}` }, 502);
    }
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

  app.post("/insight-demo", async (c) => {
    const body = (await c.req.json().catch(() => null)) as { small?: unknown } | null;
    const items = body?.small === true ? smallAbandonmentCohort() : ABANDONMENT_COHORT;
    try {
      return c.json(await runInsight({ analysisId: ABANDONMENT_ANALYSIS_ID, question: ABANDONMENT_QUESTION, items }));
    } catch (e) {
      const err = e as ZeroGError;
      const status = err.status >= 400 && err.status < 600 ? err.status : 502;
      return c.json({ error: err.message, code: err.code ?? null }, status as 400);
    }
  });

  return app;
}
