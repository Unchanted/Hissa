/**
 * Upload analysis, the seller's main flow: one sealed 0G call on text that on-device regex
 * masking has already processed. Returns the identifiers the regex missed (names, places,
 * organisations) and structured facets about what the person talks about.
 */
import { sealedJson, ZeroGError, type InferenceReceipt } from "./zerog.js";

export type ExtraIdentifier = { text: string; type: "PERSON" | "PLACE" | "ORG" | "OTHER" };
export type Mention = {
  subject: string;
  events: string[];
  sentiment: number;
  reasons: string[];
  price_judgement?: "too_expensive" | "fair" | "cheap";
};
export type Facets = { domain_path: string; age_band?: string; budget_consciousness?: "low" | "medium" | "high"; mentions: Mention[] };
export type UploadAnalysis = { extraIdentifiers: ExtraIdentifier[]; maskedText: string; facets: Facets; receipt: InferenceReceipt };

const SYSTEM = `You process one person's chat messages. Some identifiers are already masked as placeholders like [EMAIL_1]; leave those alone.
Return ONLY a JSON object with two keys:
"extra_identifiers": every remaining piece of text that could identify a real person, copied EXACTLY as written: people's names (PERSON), specific addresses, streets, neighbourhoods or small towns (PLACE), employers, schools or small organisations tied to the person (ORG), other unique identifiers (OTHER). Do NOT include brands or products, big cities, countries, or placeholders. Format: [{"text":"...","type":"PERSON"}].
"facets": {"domain_path":"<top>/<sub>/<detail>" with top one of tech, career, shopping, beauty, finance, travel, education, food, entertainment, other; "age_band"?: "18-24"|"25-34"|"35-44"|"45-54"|"55+" only if evident; "budget_consciousness"?: "low"|"medium"|"high" only if evident; "mentions": up to 10 of {"subject":"<brand, product, service or topic>","events": subset of ["considering","compared","bought","used","abandoned","recommended","complained"],"sentiment": -1..1,"reasons":["<short reason, no identifiers>"],"price_judgement"?: "too_expensive"|"fair"|"cheap"}}.
Never put people's names or other identifiers inside "facets". JSON only.`;

const TYPES = new Set(["PERSON", "PLACE", "ORG", "OTHER"]);
const EVENTS = new Set(["considering", "compared", "bought", "used", "abandoned", "recommended", "complained"]);
const AGE_BANDS = new Set(["18-24", "25-34", "35-44", "45-54", "55+"]);
/** A placeholder left by earlier masking, e.g. [EMAIL_1] or [PERSON_2]. */
const PLACEHOLDER = /\[[A-Z_]+_\d+\]/g;
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** One regex: existing placeholders first (kept as they are), then identifiers longest first. */
function identifierPattern(ids: readonly string[], flags: string): RegExp {
  const alts = [...ids].sort((a, b) => b.length - a.length).map(escapeRe);
  return new RegExp(`${PLACEHOLDER.source}|${alts.join("|")}`, flags);
}

export async function analyseUpload(regexMaskedText: string): Promise<UploadAnalysis> {
  if (!regexMaskedText.trim()) throw new ZeroGError("Nothing to analyse", 400, "empty_input");
  if (regexMaskedText.length > 60_000) throw new ZeroGError("Text too long for one call (max 60,000 characters)", 413, "too_long");
  const { data, receipt } = await sealedJson(SYSTEM, regexMaskedText);
  const out = (data ?? {}) as { extra_identifiers?: unknown; facets?: unknown };

  // Keep only identifiers that literally occur in the input outside existing placeholders:
  // the model must not invent any, and "EMAIL" inside "[EMAIL_1]" is not an identifier.
  const searchable = regexMaskedText.replace(PLACEHOLDER, "\u0000");
  const extraIdentifiers: ExtraIdentifier[] = [];
  const seen = new Set<string>();
  for (const x of Array.isArray(out.extra_identifiers) ? (out.extra_identifiers as any[]) : []) {
    const text = typeof x?.text === "string" ? x.text.trim() : "";
    const type = TYPES.has(x?.type) ? (x.type as ExtraIdentifier["type"]) : "OTHER";
    if (text.length < 2 || seen.has(text) || !searchable.includes(text)) continue;
    seen.add(text);
    extraIdentifiers.push({ text, type });
  }

  // Mask them with numbered placeholders in one pass, longest first so "Priya Raghavan" beats
  // "Priya". One pass means a short identifier can never match inside a placeholder we inserted.
  let maskedText = regexMaskedText;
  if (extraIdentifiers.length) {
    const counters: Record<string, number> = {};
    const placeholderFor = new Map<string, string>();
    for (const id of [...extraIdentifiers].sort((a, b) => b.text.length - a.text.length)) {
      counters[id.type] = (counters[id.type] ?? 0) + 1;
      placeholderFor.set(id.text, `[${id.type}_${counters[id.type]}]`);
    }
    const re = identifierPattern([...placeholderFor.keys()], "g");
    maskedText = regexMaskedText.replace(re, (m) => placeholderFor.get(m) ?? m);
  }

  // Facets: accept the expected shape only, and scrub any identifier the model copied into the
  // free-text fields (case-insensitive, longest first). Keys and enum values are never touched.
  const scrubRe = extraIdentifiers.length ? identifierPattern(extraIdentifiers.map((x) => x.text), "gi") : null;
  const scrub = (v: string) => (scrubRe ? v.replace(scrubRe, (m) => (/^\[[A-Z_]+_\d+\]$/.test(m) ? m : "[REDACTED]")) : v);
  const f = (out.facets ?? {}) as Record<string, unknown>;
  const facets: Facets = {
    domain_path: typeof f["domain_path"] === "string" && f["domain_path"].trim() ? scrub(f["domain_path"]) : "other",
    ...(AGE_BANDS.has(f["age_band"] as string) ? { age_band: f["age_band"] as string } : {}),
    ...(["low", "medium", "high"].includes(f["budget_consciousness"] as string) ? { budget_consciousness: f["budget_consciousness"] as Facets["budget_consciousness"] } : {}),
    mentions: (Array.isArray(f["mentions"]) ? f["mentions"] : []).slice(0, 10).flatMap((m: any): Mention[] =>
      typeof m?.subject === "string" && m.subject.trim()
        ? [
            {
              subject: scrub(m.subject),
              events: Array.isArray(m.events) ? [...new Set<string>(m.events.filter((e: unknown) => typeof e === "string" && EVENTS.has(e)))] : [],
              sentiment: typeof m.sentiment === "number" && Number.isFinite(m.sentiment) ? Math.max(-1, Math.min(1, m.sentiment)) : 0,
              reasons: Array.isArray(m.reasons) ? m.reasons.filter((r: unknown) => typeof r === "string").slice(0, 5).map(scrub) : [],
              ...(["too_expensive", "fair", "cheap"].includes(m.price_judgement) ? { price_judgement: m.price_judgement } : {}),
            },
          ]
        : [],
    ),
  };

  return { extraIdentifiers, maskedText, facets, receipt };
}
