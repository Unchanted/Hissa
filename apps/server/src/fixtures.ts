/**
 * Stand-in data until lanes A and B land: the public listing tags follow the
 * `dm.listing` schema (architecture.md §2.1); record bodies are already masked.
 * Prices are in tinybars, fixed per quality tier (plan-v2 decision 12).
 */
export const TIER_PRICE_TINYBARS = { bronze: 50_000_000n, silver: 100_000_000n, gold: 200_000_000n } as const;
export const INSIGHT_PRICE_TINYBARS = 300_000_000n; // 3 HBAR per report
export const K_MIN = 50;

export type Tier = keyof typeof TIER_PRICE_TINYBARS;
export type ListingPreview = {
  listing_id: string;
  domain: string;
  region: string;
  source: string;
  week: number;
  quality_tier: Tier;
  consent_insights: boolean;
  consent_sale: boolean;
  price: string;
};

const L = (id: string, domain: string, region: string, source: string, tier: Tier, sale = true): ListingPreview => ({
  listing_id: id,
  domain,
  region,
  source,
  week: 202645,
  quality_tier: tier,
  consent_insights: true,
  consent_sale: sale,
  price: TIER_PRICE_TINYBARS[tier].toString(),
});

export const listings: ListingPreview[] = [
  L("lst_7f3a", "consumer_electronics", "IN-west", "chatgpt", "gold"),
  L("lst_91c2", "consumer_electronics", "IN-south", "whatsapp", "silver"),
  L("lst_c04e", "skincare", "IN-west", "claude", "silver"),
  L("lst_5b18", "consumer_electronics", "IN-north", "telegram", "bronze", false),
  L("lst_e6d9", "travel", "IN-west", "chatgpt", "bronze"),
];

export const records: Record<string, unknown> = {
  lst_7f3a: {
    listing_id: "lst_7f3a",
    facets: { intent: "buy_laptop", budget_band: "INR 60k-80k", stage: "comparing", age_band: "18-24" },
    excerpts: [
      "I need something light for college, [BRAND_1] or [BRAND_2], battery matters more than GPU",
      "the [BRAND_1] one is 8k over my budget, waiting for a festival sale",
    ],
  },
  lst_91c2: {
    listing_id: "lst_91c2",
    facets: { intent: "buy_phone", budget_band: "INR 20k-30k", stage: "abandoned", age_band: "25-34" },
    excerpts: ["returned it, camera was worse than the reviews said"],
  },
  lst_c04e: {
    listing_id: "lst_c04e",
    facets: { intent: "buy_serum", budget_band: "INR 500-1k", stage: "researching", age_band: "18-24" },
    excerpts: ["does niacinamide break you out too or is it just me"],
  },
  lst_e6d9: {
    listing_id: "lst_e6d9",
    facets: { intent: "book_flight", budget_band: "INR 5k-10k", stage: "comparing", age_band: "25-34" },
    excerpts: ["[CITY_1] to [CITY_2] in December, why is everything 3x"],
  },
};

export const analyses = [
  {
    id: "abandonment-drivers",
    title: "Why do budget-conscious 18–24s abandon a purchase in this category?",
    filters: ["domain", "region", "age_band"],
    cohort: { domain: "consumer_electronics", distinct_users: 63 },
  },
  {
    id: "brand-switching",
    title: "Which brands do people leave, and for what?",
    filters: ["domain", "region"],
    cohort: { domain: "skincare", distinct_users: 18 }, // below K_MIN: refused before payment
  },
];

export const reportFor = (analysisId: string) => ({
  analysis_id: analysisId,
  cohort_bucket: "50-99",
  k_min: K_MIN,
  epsilon: 1.0,
  themes: [
    { name: "Price lands just above stated budget", share: 0.41 },
    { name: "Waiting for a sale event", share: 0.27 },
    { name: "Doubts about battery life claims", share: 0.18 },
    { name: "other", share: 0.14 },
  ],
  note: "Shares are noised; themes under 20 users are merged into 'other'. No verbatim quotes.",
  zg_request_ids: ["mock-0g-req-1", "mock-0g-req-2"],
});
