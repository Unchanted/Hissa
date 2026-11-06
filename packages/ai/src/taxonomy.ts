/**
 * One list of domains for everything 0G classifies: the seller's upload facets, the public
 * Arkiv `domain` tag and the buyer's filters. The web app keeps a copy (apps/web/src/zerog.tsx).
 */
export const DOMAINS = ["beauty", "electronics", "fashion", "food", "finance", "travel", "education", "health", "career", "entertainment", "other"] as const;
export type Domain = (typeof DOMAINS)[number];

export const DOMAIN_HINTS =
  "Skincare, cosmetics, haircare and make-up are beauty. Laptops, phones and gadgets are electronics. Clothes and shoes are fashion. Jobs and interviews are career. Fitness, diet and medicine are health.";

export const AGE_BANDS = ["18-24", "25-34", "35-44", "45-54", "55+"] as const;
export const REGIONS = ["IN", "IN-west", "IN-north", "IN-south", "IN-east"] as const;
export const EVENTS = ["considering", "compared", "bought", "used", "abandoned", "recommended", "complained"] as const;

export const REGION_HINTS =
  "Mumbai, Pune, Ahmedabad and Goa are IN-west; Delhi, Jaipur, Lucknow and Chandigarh are IN-north; Bengaluru, Chennai, Hyderabad and Kochi are IN-south; Kolkata, Bhubaneswar and Guwahati are IN-east; India in general is IN.";

/** The value if it is one of `allowed` (trimmed, case-insensitive), else undefined. */
export function pick<T extends string>(allowed: readonly T[], v: unknown): T | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim().toLowerCase();
  return allowed.find((a) => a.toLowerCase() === s);
}

/** First segment of a domain path like "beauty/skincare/serum", checked against DOMAINS. */
export function topDomain(path: unknown): Domain {
  return pick(DOMAINS, typeof path === "string" ? path.split(/[/>]/)[0] : undefined) ?? "other";
}
