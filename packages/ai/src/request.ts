/**
 * Buyer request to search filters, for both buyer products:
 *   - records:  "I need chats from 18–24 year olds in India who gave up on serums" → filters
 *   - insights: "Young Indians drop serums over price; would a ₹299 trial size sell?" → filters
 *               plus one measurable question for the anonymised analysis
 * One sealed 0G call. Every filter value is checked against a fixed list (taxonomy.ts), so the
 * model can never invent a filter.
 */
import { AGE_BANDS, DOMAIN_HINTS, DOMAINS, EVENTS, REGION_HINTS, REGIONS, pick, type Domain } from "./taxonomy.js";
import { sealedJson, ZeroGError, type InferenceReceipt } from "./zerog.js";

export type BuyerMode = "records" | "insights";
export type BuyerFilters = {
  domain: Domain;
  age?: (typeof AGE_BANDS)[number];
  region?: (typeof REGIONS)[number];
  event?: (typeof EVENTS)[number];
};
export type BuyerRequest = { filters: BuyerFilters; question?: string; receipt: InferenceReceipt };

const system = (mode: BuyerMode) => `You turn a data buyer's request into search filters for a marketplace of records taken from people's chats.
Return ONLY a JSON object with these keys:
"domain": one of ${DOMAINS.join(", ")}. ${DOMAIN_HINTS}
"age": one of ${AGE_BANDS.join(", ")}, only if the request implies an age. Students and college-goers are 18-24 unless another age is given.
"region": one of ${REGIONS.join(", ")}, only if the request names a place. ${REGION_HINTS}
"event": one of ${EVENTS.join(", ")}, only if the request names a behaviour. "gave up", "stopped" and "dropped" are abandoned.${
  mode === "insights"
    ? `
"question": the buyer's business idea rewritten as ONE neutral question that people's chats can answer, under 25 words, e.g. "Why do 18-24 year olds stop using skincare serums, and is price the main reason?"`
    : ""
}
Leave out any key you cannot fill. JSON only.`;

export async function parseBuyerRequest(text: string, mode: BuyerMode = "records"): Promise<BuyerRequest> {
  const request = text.trim();
  if (!request) throw new ZeroGError("Nothing to parse", 400, "empty_input");
  if (request.length > 500) throw new ZeroGError("Request too long (max 500 characters)", 413, "too_long");
  const { data, receipt } = await sealedJson(system(mode), request, { maxTokens: 300, accept: (d) => typeof (d as { domain?: unknown })?.domain === "string" });
  const out = (data ?? {}) as Record<string, unknown>;
  const age = pick(AGE_BANDS, typeof out["age"] === "string" ? out["age"].replace(/[–—]/g, "-") : undefined);
  const region = pick(REGIONS, out["region"]);
  const event = pick(EVENTS, out["event"]);
  const filters: BuyerFilters = {
    domain: pick(DOMAINS, out["domain"]) ?? "other",
    ...(age ? { age } : {}),
    ...(region ? { region } : {}),
    ...(event ? { event } : {}),
  };
  const q = typeof out["question"] === "string" ? out["question"].trim().slice(0, 240) : "";
  return { filters, ...(mode === "insights" ? { question: q || request } : {}), receipt };
}
