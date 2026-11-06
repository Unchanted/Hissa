/** Synthetic demo content. No real person or real chat export is used. */

export type Pii = { orig: string; ph: string; kind: string };
export type Part = string | Pii;
export type Message = { role: "self" | "assistant" | "other"; parts: Part[] };

const p = (orig: string, ph: string, kind: string): Pii => ({ orig, ph, kind });

export const SAMPLE_EXPORT = {
  file: "chatgpt-export-2026-11-06.zip",
  source: "chatgpt",
  conversation: "Is my serum even working?",
  messages: [
    {
      role: "self",
      parts: [
        "Hey, I'm ",
        p("Priya Sharma", "[PERSON_1]", "name"),
        ", ",
        p("22", "[AGE 18–24]", "age"),
        ", final-year student in ",
        p("Andheri West", "[REGION IN-west]", "location"),
        ". Been on the Minimalist 10% niacinamide serum for 2 weeks and honestly see zero difference.",
      ],
    },
    {
      role: "assistant",
      parts: [
        "Two weeks is usually too early to judge niacinamide — most studies measure results at 8–12 weeks. A few things worth checking first: how often you apply it, whether you layer it with vitamin C…",
      ],
    },
    {
      role: "self",
      parts: [
        "It was ₹599 and my friend ",
        p("Ananya", "[PERSON_2]", "name"),
        " says The Ordinary works better but it's ₹950 on Nykaa. That's way over what I want to spend on one bottle.",
      ],
    },
    {
      role: "assistant",
      parts: [
        "If budget is the main constraint, a simpler routine can work well: a gentle cleanser, a basic moisturiser and a daily SPF 50…",
      ],
    },
    {
      role: "self",
      parts: [
        "Can you draft a refund request? Order ",
        p("NYK-88231907", "[ORDER_ID_1]", "id"),
        ", reach me at ",
        p("priya.s2003@gmail.com", "[EMAIL_1]", "email"),
        " or ",
        p("+91 98201 44731", "[PHONE_1]", "phone"),
        ".",
      ],
    },
    {
      role: "assistant",
      parts: ["Sure — here's a short, polite refund request you can paste into the Nykaa support form…"],
    },
    {
      role: "self",
      parts: ["Honestly I'm dropping serums. Going back to sunscreen + a basic moisturiser, under ₹400 total."],
    },
  ] satisfies Message[],
};

export const maskedText = (m: Message) => m.parts.map((x) => (typeof x === "string" ? x : x.ph)).join("");

export const FACETS = {
  domain_path: "beauty / skincare / serum",
  person_signals: [
    { k: "age_band", v: "18–24", src: "declared", conf: 0.96 },
    { k: "life_stage", v: "student", src: "inferred", conf: 0.81 },
    { k: "budget_consciousness", v: "high", src: "inferred", conf: 0.88 },
  ],
  mentions: [
    {
      subject: "Minimalist niacinamide 10%",
      type: "product",
      events: ["bought", "used", "abandoned"],
      sentiment: -0.62,
      reason: "no visible change after 2 weeks",
      price: "₹500–1k · too_expensive",
    },
    {
      subject: "The Ordinary",
      type: "brand",
      events: ["considering", "compared"],
      sentiment: 0.18,
      reason: "recommended by a friend",
      price: "₹500–1k · too_expensive",
    },
    {
      subject: "serums",
      type: "topic",
      events: ["abandoned"],
      sentiment: -0.4,
      reason: "switched_to: sunscreen + moisturiser",
      price: "< ₹500 · fair",
    },
  ],
  excerpts: [
    "Been on the Minimalist 10% niacinamide serum for 2 weeks and honestly see zero difference.",
    "That's way over what I want to spend on one bottle.",
    "Honestly I'm dropping serums. Going back to sunscreen + a basic moisturiser, under ₹400 total.",
  ],
};

export const PUBLIC_TAGS = (week: string, price: number) => [
  ["domain", "beauty"],
  ["region", "IN-west"],
  ["source", "chatgpt"],
  ["week", week],
  ["quality_tier", "silver"],
  ["price", `${price} HBAR`],
];

/* ---------- Merchant side ---------- */

export type Analysis = {
  id: string;
  short: string;
  question: string;
  themes: { name: string; share: number }[];
  quote: string;
  actions: string[];
};

export const ANALYSES: Analysis[] = [
  {
    id: "abandonment-drivers",
    short: "Abandonment drivers",
    question: "Why do budget-conscious 18–24s abandon a product in this category?",
    themes: [
      { name: "Too expensive for the results", share: 37 },
      { name: "No visible change within 2–3 weeks", share: 26 },
      { name: "Irritation or breakouts", share: 15 },
      { name: "Routine felt too complicated", share: 12 },
      { name: "Other (merged, n < 20)", share: 10 },
    ],
    quote: "I paid six hundred and saw nothing in two weeks, so I'm going back to basics.",
    actions: [
      "Sell a 15 ml trial size under ₹300 to lower the cost of finding out.",
      "Set expectations on the pack: show the week-8 result, not week-2.",
      "Bundle with SPF — the routine abandoners return to.",
    ],
  },
  {
    id: "switching-triggers",
    short: "Switching triggers",
    question: "What makes buyers switch from one brand to another?",
    themes: [
      { name: "Found a cheaper equivalent", share: 34 },
      { name: "Friend or creator recommendation", share: 24 },
      { name: "Bad reaction to current product", share: 17 },
      { name: "Out of stock or slow delivery", share: 11 },
      { name: "Other (merged, n < 20)", share: 14 },
    ],
    quote: "My friend swears by the other one and it's basically the same ingredient.",
    actions: [
      "Publish ingredient-equivalence charts before competitors do it for you.",
      "Referral credit beats paid creators for this cohort.",
      "Keep hero SKUs in stock — stock-outs drive 1 in 9 switches.",
    ],
  },
  {
    id: "price-thresholds",
    short: "Price thresholds",
    question: "Where does a price start to feel too expensive, by age band?",
    themes: [
      { name: "Under ₹400 feels fair", share: 41 },
      { name: "₹400–700 acceptable if results show", share: 29 },
      { name: "Over ₹700 too expensive", share: 22 },
      { name: "Other (merged, n < 20)", share: 8 },
    ],
    quote: "Anything over seven hundred for one bottle is a no for me.",
    actions: [
      "Anchor the entry SKU under ₹400.",
      "Justify ₹400–700 with visible proof (before/after at 8 weeks).",
      "Reserve ₹700+ for bundles, not single bottles.",
    ],
  },
];

export const FILTERS = {
  age: ["18–24", "25–34", "any"] as const,
  budget: ["high", "any"] as const,
  region: ["IN", "IN-west"] as const,
};
export type Filters = { age: (typeof FILTERS.age)[number]; budget: (typeof FILTERS.budget)[number]; region: (typeof FILTERS.region)[number] };

/** Distinct users already listed on Arkiv (pre-seeded synthetic cohort) per filter combination. */
const BASE: Record<string, number> = {
  "18–24|high": 63,
  "18–24|any": 118,
  "25–34|high": 29,
  "25–34|any": 71,
  "any|high": 104,
  "any|any": 212,
};

export function cohortSize(f: Filters, priyaCounts: boolean): number {
  const base = BASE[`${f.age}|${f.budget}`] ?? 0;
  const regional = f.region === "IN-west" ? Math.round(base * 0.43) : base;
  const priyaMatches = f.age !== "25–34";
  return regional + (priyaCounts && priyaMatches ? 1 : 0);
}

export const cohortBucket = (n: number) => (n < 50 ? "<50" : n < 100 ? "50–99" : n < 250 ? "100–249" : "250+");
