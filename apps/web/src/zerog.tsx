/**
 * 0G Private Computer glue for the web app (lane C). Turns sealed-call results from the demo
 * API (packages/ai) into what the pages show, and keeps everything public coarse: listing tags
 * come only from fixed-value facet fields, never from free text the model wrote.
 */
import { parseRequest, type Filters } from "./demo-data";
import type { UploadAnalysis, ZgReceipt } from "./live";

/** 0G answers "18-24"; the app writes age bands with an en dash. */
export const band = (s: string) => s.replace(/-/g, "–");

/** What the seller's 0G analysis contributes to the listing. No names, no free text. */
export type UploadTags = {
  domain: string;
  signals: string[];
  events: string[];
  /** How many identifiers 0G caught that on-device masking missed (the names are never stored). */
  caught: number;
  reqId: string;
  model: string;
  tee: boolean;
};

const TOP_DOMAINS = new Set(["tech", "career", "shopping", "beauty", "finance", "travel", "education", "food", "entertainment", "other"]);

export function uploadTags(r: UploadAnalysis): UploadTags {
  const f = r.facets;
  const top = f.domain_path.split("/")[0]?.trim().toLowerCase() ?? "";
  const events = [...new Set(f.mentions.flatMap((m) => m.events))].slice(0, 3);
  return {
    domain: TOP_DOMAINS.has(top) ? top : "other",
    signals: [f.age_band && band(f.age_band), f.budget_consciousness && `budget: ${f.budget_consciousness}`].filter((x): x is string => !!x),
    events,
    caught: r.extraIdentifiers.length,
    reqId: r.receipt.request_id,
    model: r.receipt.model,
    tee: r.receipt.tee_verified === true,
  };
}

/** Domains the demo market knows. Anything else from 0G falls back to the keyword rules. */
const MARKET_DOMAINS = new Set(["beauty", "electronics", "travel"]);

/** 0G filters, with the domain checked against the market so a surprise answer can't empty it. */
export function toFilters(text: string, zgFilters: { domain: string; age?: string; region?: string; event?: string }): Filters {
  const domain = MARKET_DOMAINS.has(zgFilters.domain) ? zgFilters.domain : parseRequest(text).domain;
  return { domain, age: zgFilters.age && band(zgFilters.age), region: zgFilters.region, event: zgFilters.event };
}

/** Tooltip for a real 0G request ID (there is no public explorer page for request IDs). */
export const ZG_NOTE = "0G request ID · sealed (TEE) call · listed in the 0G usage history · click to copy";

export const teeLabel = (r: Pick<ZgReceipt, "tee_verified" | "model">) => `${r.model}${r.tee_verified ? " · TEE ✓" : ""}`;
