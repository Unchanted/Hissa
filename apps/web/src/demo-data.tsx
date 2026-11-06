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

/* ---------- Merchant side ---------- */

/** A listing as the merchant sees it. Public tags are free; the rest unlocks after x402 payment. */
export type MarketRecord = {
  key: string;
  listingId: string;
  source: string;
  region: string;
  week: string;
  priya?: boolean;
  contactOk: boolean;
  // unlocked after purchase
  signals: string[];
  events: string[];
  excerpt: string;
};

/** Other sellers already listed on Arkiv (synthetic). */
export const OTHER_RECORDS: Omit<MarketRecord, "key" | "week">[] = [
  {
    listingId: "lst_c04e",
    source: "claude",
    region: "IN-south",
    contactOk: false,
    signals: ["18–24", "student", "budget: high"],
    events: ["compared", "bought"],
    excerpt: "Switched to a ₹349 sunscreen-moisturiser combo. Does the same job as my old serum.",
  },
  {
    listingId: "lst_a19f",
    source: "whatsapp",
    region: "IN-north",
    contactOk: false,
    signals: ["18–24", "first job", "budget: high"],
    events: ["considering", "abandoned"],
    excerpt: "Vitamin C serum broke me out in a week. Not paying ₹800 to find that out again.",
  },
  {
    listingId: "lst_5d72",
    source: "telegram",
    region: "IN-west",
    contactOk: false,
    signals: ["18–24", "student", "budget: high"],
    events: ["used", "complained"],
    excerpt: "Every serum promises glass skin in 2 weeks. None of them deliver at this price.",
  },
];

export const PRIYA_RECORD: Omit<MarketRecord, "key" | "week" | "contactOk"> = {
  listingId: "",
  source: "chatgpt",
  region: "IN-west",
  priya: true,
  signals: ["18–24", "student", "budget: high"],
  events: ["bought", "abandoned"],
  excerpt: "Honestly I'm dropping serums. Going back to sunscreen + a basic moisturiser, under ₹400 total.",
};

export const CONTACT_MESSAGE =
  "Hi! We're a skincare brand making a ₹299 trial-size serum for people who found full bottles too pricey. Want a free sample?";

export const REQUEST_EXAMPLES = [
  "18–24 year olds in India who gave up on skincare serums because of price",
  "Students in Mumbai comparing budget laptops",
];

export type Filters = { domain: string; age?: string; region?: string; event?: string };

/**
 * Stand-in for the 0G step that turns a buyer's request into Arkiv filters.
 * Keyword rules only; the real build asks 0G and validates the result.
 */
export function parseRequest(text: string): Filters {
  const t = text.toLowerCase();
  const domain = /skin|serum|beauty|moistur|sunscreen|cosmetic/.test(t)
    ? "beauty"
    : /laptop|phone|electronic|gadget/.test(t)
      ? "electronics"
      : /travel|flight|hotel/.test(t)
        ? "travel"
        : "beauty";
  const age = /18\s*[–-]\s*24|gen ?z|student|college/.test(t) ? "18–24" : /25\s*[–-]\s*34/.test(t) ? "25–34" : undefined;
  const region = /mumbai|pune/.test(t) ? "IN-west" : /india|\bin\b/.test(t) ? "IN" : undefined;
  const event = /gave up|abandon|stopp|quit|drop/.test(t) ? "abandoned" : /compar/.test(t) ? "compared" : undefined;
  return { domain, age, region, event };
}

/** Which listed records match. Only beauty listings exist in this demo. */
export function matches(r: { region: string; events: string[] }, f: Filters, domainOf = "beauty"): boolean {
  if (f.domain !== domainOf) return false;
  if (f.region === "IN-west" && r.region !== "IN-west") return false;
  return true;
}
