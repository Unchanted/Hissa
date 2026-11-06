/**
 * Upload classification, the seller's main 0G step. Masking already happened on the seller's
 * device (regex + an in-browser NER model); 0G only reads the masked text, inside a TEE, and
 * returns structured facets about what the person talks about. It never masks or unmasks.
 */
import { AGE_BANDS, DOMAIN_HINTS, DOMAINS, EVENTS, pick, topDomain } from "./taxonomy.js";
import { sealedJson, ZeroGError, type InferenceReceipt } from "./zerog.js";

export type Mention = {
  subject: string;
  events: string[];
  sentiment: number;
  reasons: string[];
  price_judgement?: "too_expensive" | "fair" | "cheap";
};
export type Facets = { domain_path: string; age_band?: string; budget_consciousness?: "low" | "medium" | "high"; mentions: Mention[] };
export type UploadAnalysis = { facets: Facets; receipt: InferenceReceipt };

const SYSTEM = `You classify one person's chat messages for a consented data marketplace. Personal identifiers were already masked on their device as placeholders like [PERSON_1] or [EMAIL_1]; never guess what they hide and never copy them.
Return ONLY a JSON object {"facets": {...}} where facets is:
{"domain_path":"<top>/<sub>/<detail>" with top one of ${DOMAINS.join(", ")} (${DOMAIN_HINTS}),
 "age_band"?: one of ${AGE_BANDS.join(", ")}, only if evident,
 "budget_consciousness"?: "low"|"medium"|"high", only if evident,
 "mentions": up to 10 of {"subject":"<brand, product, service or topic>","events": subset of [${EVENTS.join(", ")}],"sentiment": -1..1,"reasons":["<short reason, 2-8 words>"],"price_judgement"?: "too_expensive"|"fair"|"cheap"}}.
JSON only.`;

/** Placeholders from on-device masking, e.g. [PERSON_1]; dropped from facet text just in case. */
const PLACEHOLDER = /\[[A-Z][A-Z_]*(?:_\d+| [^[\]\n]{1,30})\]/g;
const clean = (v: string) => v.replace(PLACEHOLDER, "").replace(/\s{2,}/g, " ").trim();

export async function analyseUpload(maskedText: string): Promise<UploadAnalysis> {
  if (!maskedText.trim()) throw new ZeroGError("Nothing to analyse", 400, "empty_input");
  if (maskedText.length > 60_000) throw new ZeroGError("Text too long for one call (max 60,000 characters)", 413, "too_long");
  const { data, receipt } = await sealedJson(SYSTEM, maskedText, { maxTokens: 1500, accept: (d) => !!(d as { facets?: unknown })?.facets && typeof (d as { facets: unknown }).facets === "object" });
  const f = (((data ?? {}) as { facets?: unknown }).facets ?? {}) as Record<string, unknown>;

  const rawPath = typeof f["domain_path"] === "string" ? clean(f["domain_path"]).toLowerCase() : "";
  const top = topDomain(rawPath);
  const rest = rawPath.split(/[/>]/).slice(1).map((s) => s.trim()).filter(Boolean).slice(0, 2);
  const age = pick(AGE_BANDS, typeof f["age_band"] === "string" ? f["age_band"].replace(/[–—]/g, "-") : undefined);
  const facets: Facets = {
    domain_path: [top, ...rest].join("/"),
    ...(age ? { age_band: age } : {}),
    ...(["low", "medium", "high"].includes(f["budget_consciousness"] as string) ? { budget_consciousness: f["budget_consciousness"] as Facets["budget_consciousness"] } : {}),
    mentions: (Array.isArray(f["mentions"]) ? f["mentions"] : []).slice(0, 10).flatMap((m: any): Mention[] => {
      const subject = typeof m?.subject === "string" ? clean(m.subject) : "";
      if (!subject) return [];
      return [
        {
          subject,
          events: Array.isArray(m.events) ? [...new Set<string>(m.events.filter((e: unknown) => typeof e === "string" && (EVENTS as readonly string[]).includes(e)))] : [],
          sentiment: typeof m.sentiment === "number" && Number.isFinite(m.sentiment) ? Math.max(-1, Math.min(1, m.sentiment)) : 0,
          reasons: Array.isArray(m.reasons) ? m.reasons.filter((r: unknown): r is string => typeof r === "string").map(clean).filter(Boolean).slice(0, 5) : [],
          ...(["too_expensive", "fair", "cheap"].includes(m.price_judgement) ? { price_judgement: m.price_judgement } : {}),
        },
      ];
    }),
  };
  return { facets, receipt };
}
