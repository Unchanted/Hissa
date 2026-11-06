/**
 * Buyer request to search filters: one sealed 0G call turns a data buyer's sentence
 * ("18–24 year olds in India who gave up on skincare serums because of price") into the
 * coarse filters the marketplace can query on Arkiv. Every value is checked against a fixed
 * list; anything else is dropped, so the model can never invent a filter.
 */
import { sealedJson, ZeroGError, type InferenceReceipt } from "./zerog.js";

export const REQUEST_DOMAINS = ["beauty", "electronics", "travel", "fashion", "food", "finance", "education", "health", "other"] as const;
export const REQUEST_AGES = ["18-24", "25-34", "35-44", "45-54", "55+"] as const;
export const REQUEST_REGIONS = ["IN", "IN-west", "IN-north", "IN-south", "IN-east"] as const;
export const REQUEST_EVENTS = ["considering", "compared", "bought", "used", "abandoned", "recommended", "complained"] as const;

export type BuyerFilters = {
  domain: (typeof REQUEST_DOMAINS)[number];
  age?: (typeof REQUEST_AGES)[number];
  region?: (typeof REQUEST_REGIONS)[number];
  event?: (typeof REQUEST_EVENTS)[number];
};
export type BuyerRequest = { filters: BuyerFilters; receipt: InferenceReceipt };

const SYSTEM = `You turn a data buyer's request into search filters for a marketplace of records taken from people's chats.
Return ONLY a JSON object with these keys:
"domain": one of ${REQUEST_DOMAINS.join(", ")}. Skincare, cosmetics, haircare and make-up are beauty. Laptops, phones and gadgets are electronics.
"age": one of ${REQUEST_AGES.join(", ")}, only if the request implies an age. Students and college-goers are 18-24 unless another age is given.
"region": one of ${REQUEST_REGIONS.join(", ")}, only if the request names a place. Mumbai, Pune, Ahmedabad and Goa are IN-west; Delhi, Jaipur, Lucknow and Chandigarh are IN-north; Bengaluru, Chennai, Hyderabad and Kochi are IN-south; Kolkata, Bhubaneswar and Guwahati are IN-east; India in general is IN.
"event": one of ${REQUEST_EVENTS.join(", ")}, only if the request names a behaviour. "gave up", "stopped" and "dropped" are abandoned.
Leave out any key you cannot fill. JSON only.`;

const pick = <T extends string>(allowed: readonly T[], v: unknown): T | undefined =>
  typeof v === "string" && (allowed as readonly string[]).includes(v.trim()) ? (v.trim() as T) : undefined;

export async function parseBuyerRequest(text: string): Promise<BuyerRequest> {
  const request = text.trim();
  if (!request) throw new ZeroGError("Nothing to parse", 400, "empty_input");
  if (request.length > 500) throw new ZeroGError("Request too long (max 500 characters)", 413, "too_long");
  const { data, receipt } = await sealedJson(SYSTEM, request, { maxTokens: 300 });
  const out = (data ?? {}) as Record<string, unknown>;
  // Accept "18–24" with an en dash as well as "18-24".
  const age = pick(REQUEST_AGES, typeof out["age"] === "string" ? out["age"].replace(/[–—]/g, "-") : undefined);
  const region = pick(REQUEST_REGIONS, out["region"]);
  const event = pick(REQUEST_EVENTS, out["event"]);
  const filters: BuyerFilters = {
    domain: pick(REQUEST_DOMAINS, out["domain"]) ?? "other",
    ...(age ? { age } : {}),
    ...(region ? { region } : {}),
    ...(event ? { event } : {}),
  };
  return { filters, receipt };
}
