/**
 * Standalone 0G Private Computer showcase for judges, independent of the web app.
 * Serves packages/ai/public/index.html at / and the AI routes at /api/ai.
 *
 *   npx tsx packages/ai/scripts/serve.ts        (port: ZG_DEMO_PORT, default 8790)
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { aiRoutes } from "../src/routes.js";
import { CHAT_MODELS, ROUTER_URL } from "../src/zerog.js";

const port = Number(process.env["ZG_DEMO_PORT"] ?? 8790);
const page = new URL("../public/index.html", import.meta.url);

const app = new Hono();

// Read on every request so the page can be tweaked without a restart.
app.get("/", (c) => c.html(readFileSync(page, "utf8")));

// Never return the key itself, only whether one is configured.
app.get("/api/ai/status", (c) =>
  c.json({ router: ROUTER_URL, keyConfigured: Boolean(process.env["ZG_API_KEY"]?.trim()), chatModels: CHAT_MODELS }),
);

app.route("/api/ai", aiRoutes());

serve({ fetch: app.fetch, port }, () => {
  console.log(`0G showcase on http://localhost:${port}  (router ${ROUTER_URL})`);
});
