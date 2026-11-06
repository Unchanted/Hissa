import { Hono, type MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import {
  PublicationError,
  type ArkivReader,
  type ListingFilter,
  type ListingPreview,
  type createArkivPublisher,
} from "../../../../packages/arkiv/src/index.ts";

type Dependencies = {
  reader: Pick<ArkivReader, "queryListings">;
  publisher: Pick<Awaited<ReturnType<typeof createArkivPublisher>>, "publishListing">;
  // The mounting server owns authentication, CSRF protection and attempt limits.
  authorizePublish: MiddlewareHandler;
};

function browseQuery(query: Record<string, string[]>) {
  const filter: { -readonly [K in keyof ListingFilter]: ListingFilter[K] } = {};
  let cursor: string | undefined;
  for (const [name, entries] of Object.entries(query)) {
    if (entries.length !== 1) throw new Error("Invalid query");
    const value = entries[0]!;
    switch (name) {
      case "cursor":
        if (!/^0x[\da-f]{64}$/i.test(value)) throw new Error("Invalid cursor");
        cursor = value;
        break;
      case "listing_id":
      case "domain":
      case "region":
      case "source":
      case "quality_tier":
        if (!value || new TextEncoder().encode(value).length > 128) throw new Error("Invalid tag");
        filter[name] = value;
        break;
      case "price":
      case "week":
        if (!/^(0|[1-9]\d{0,19})$/.test(value) || BigInt(value) > 2n ** 64n - 1n) throw new Error("Invalid integer");
        filter[name] = BigInt(value);
        break;
      case "consent_insights":
      case "consent_sale":
        if (value !== "true" && value !== "false") throw new Error("Invalid consent");
        filter[name] = value === "true";
        break;
      default:
        throw new Error("Unsupported filter");
    }
  }
  return { filter, cursor };
}

function preview(item: ListingPreview) {
  return {
    entityKey: item.entityKey, expiresAt: item.expiresAt.toString(),
    listing_id: item.listing_id, domain: item.domain, region: item.region,
    source: item.source, week: item.week.toString(), quality_tier: item.quality_tier,
    consent_insights: item.consent_insights, consent_sale: item.consent_sale,
    price: item.price.toString(), envelope_format: item.envelope_format,
  };
}

/** Mount at /api/listings; this module never starts a server or loads secrets. */
export function createListingsRoutes({ reader, publisher, authorizePublish }: Dependencies) {
  if (typeof authorizePublish !== "function") throw new Error("Publication authorization is required");
  const app = new Hono();
  app.onError((_, c) => c.json({ error: "request_failed" }, 500));
  app.use("*", async (c, next) => {
    c.header("Cache-Control", "no-store");
    await next();
  });
  app.get("/", async (c) => {
    let query;
    try { query = browseQuery(c.req.queries()); }
    catch { return c.json({ error: "invalid_listing_query" }, 400); }
    try {
      const result = await reader.queryListings(query.filter, query.cursor);
      return c.json({ items: result.items.map(preview), ...(result.next ? { next: result.next } : {}) });
    } catch {
      return c.json({ error: "arkiv_unavailable" }, 502);
    }
  });
  app.post("/", authorizePublish, bodyLimit({
    maxSize: 270_000,
    onError: (c) => c.json({ error: "listing_too_large" }, 413),
  }), async (c) => {
    if (c.req.header("Content-Type")?.split(";")[0]?.trim().toLowerCase() !== "application/json") {
      return c.json({ error: "json_required" }, 415);
    }
    let input: unknown;
    try { input = await c.req.json(); }
    catch { return c.json({ error: "invalid_json" }, 400); }
    try {
      const result = await publisher.publishListing(input);
      return c.json({ entityKey: result.entityKey, txHash: result.txHash, expiresAt: result.expiresAt.toString() }, 201);
    } catch (error) {
      if (error instanceof PublicationError) {
        if (error.kind === "invalid") return c.json({ error: "invalid_listing" }, 400);
        if (error.kind === "conflict") return c.json({ error: "listing_conflict" }, 409);
        if (error.kind === "uncertain") return c.json({ error: "publication_needs_reconciliation" }, 503);
      }
      return c.json({ error: "arkiv_unavailable" }, 503);
    }
  });
  return app;
}
