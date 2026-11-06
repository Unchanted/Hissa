/**
 * Merchant-side insight report, produced with sealed 0G calls only.
 *
 *   1. Refuse before any 0G call if the cohort has fewer than kMin distinct users.
 *   2. Label each item (batches of <= 25, batch-local refs, user_refs never leave this process).
 *   3. Group the distinct labels into <= 7 themes (one call, no embeddings).
 *   4. One vote per user, drop "not relevant", Laplace noise (scale 1/epsilon), merge small
 *      cells into "other", share of the noised total.
 *   5. One call writes the report from the noised shares alone.
 *
 * Output never contains user_refs, excerpts, raw labels or exact counts.
 */
import { sealedJson, ZeroGError, type InferenceReceipt } from "./zerog.js";

export type InsightItem = { user_ref: string; excerpts: string[] };
export type InsightInput = { analysisId: string; question: string; items: readonly InsightItem[] };
export type InsightOptions = { kMin?: number; epsilon?: number; smallCell?: number; rng?: () => number };
export type InsightTheme = { name: string; share_pct: number };
export type InsightPrivacy = { kMin: number; epsilon: number; smallCell: number };
export type InsightRefusal = { status: "refused"; analysisId: string; reason: string; distinct_users_bucket: string; privacy: InsightPrivacy };
export type InsightReport = {
  status: "ok";
  analysisId: string;
  cohort_bucket: string;
  themes: InsightTheme[];
  report_markdown: string;
  receipts: InferenceReceipt[];
  privacy: InsightPrivacy;
};
export type InsightResult = InsightReport | InsightRefusal;

const BATCH = 25;
const MAX_THEMES = 7;
const NOT_RELEVANT = "not relevant";
const OTHER = "other";

const LABEL_SYSTEM = `[stage:label] You label short, already-masked customer excerpts for an aggregate market-research question.
For EVERY item, return one short lowercase label of 2-5 words naming the reason relevant to the question (for example "too expensive", "no visible results"). Name the reason, not the product or brand. If the item says nothing about the question, use "not relevant".
Never copy names, places, placeholders or long phrases from the excerpts into a label.
Return ONLY a JSON object: {"labels":[{"ref":"r1","label":"..."}, ...]} with exactly one entry per input ref.`;

const GROUP_SYSTEM = `[stage:group] You group short reason labels from a market-research analysis into themes.
Group the given labels into at most ${MAX_THEMES} themes. Merge closely related reasons into one broad theme (for example price complaints and switching to cheaper alternatives). Give each theme a short lowercase name of 2-4 words. Every label should appear in exactly one theme, copied exactly as given.
Return ONLY a JSON object: {"themes":[{"name":"...","labels":["...", "..."]}]}.`;

const REPORT_SYSTEM = `[stage:report] You write a short insight report for a merchant from aggregate, privacy-protected numbers.
Rules: use ONLY the numbers given, never invent other figures. Say clearly that the figures are approximate because statistical noise was added to protect privacy. Do not invent quotes, customers, individuals or anecdotes. 150-300 words of markdown: a "# " title, 3-5 bullet points (one per theme with its approximate share), then one paragraph starting with "**What to do:**".
Return ONLY a JSON object: {"markdown":"..."}.`;

/** Simple synonym squashing so near-identical labels count together before grouping. */
const SYNONYMS: [RegExp, string][] = [
  [/^(irrelevant|n\/?a|none|unrelated|off[- ]topic|no reason|not applicable)$/, NOT_RELEVANT],
  [/^(too (pricey|costly)|over ?priced|expensive|high price|price too high|too expensive price)$/, "too expensive"],
  [/^(no (visible )?(results?|effect|difference|improvement)|did ?n[o']t work|not effective|ineffective)$/, "no visible results"],
  [/^(cheaper (alternative|option|dupe)s?|found (a )?cheaper (alternative|option|dupe)|switched to cheaper)$/, "found cheaper alternative"],
  [/^(skin )?(irritation|irritated skin|breakouts?|broke out|redness)$/, "irritation or breakouts"],
];

export function normaliseLabel(raw: string): string {
  let s = raw.toLowerCase().replace(/[^\p{L}\p{N}\s'/-]/gu, " ").replace(/\s+/g, " ").trim();
  if (!s) return NOT_RELEVANT;
  s = s.split(" ").slice(0, 5).join(" ").slice(0, 40).trim();
  for (const [re, to] of SYNONYMS) if (re.test(s)) return to;
  if (/^(not relevant|not related|unrelated|irrelevant|off[- ]topic)\b/.test(s)) return NOT_RELEVANT;
  return s;
}

export function cohortBucket(n: number): string {
  if (n < 50) return "<50";
  if (n < 100) return "50–99";
  if (n < 250) return "100–249";
  return "250+";
}

/** Laplace(0, scale) via inverse CDF. */
export function laplace(scale: number, rng: () => number): number {
  let u = rng() - 0.5;
  const lim = 0.5 - 1e-12;
  u = Math.max(-lim, Math.min(lim, u));
  return -scale * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
}

export async function runInsight(input: InsightInput, opts: InsightOptions = {}): Promise<InsightResult> {
  const privacy: InsightPrivacy = { kMin: opts.kMin ?? 50, epsilon: opts.epsilon ?? 1.0, smallCell: opts.smallCell ?? 20 };
  const rng = opts.rng ?? Math.random;
  const { analysisId, question } = input;

  // 1. k-anonymity floor, before anything leaves this process.
  const users = new Set(input.items.map((i) => i.user_ref));
  if (users.size < privacy.kMin) {
    return {
      status: "refused",
      analysisId,
      reason: `Cohort too small: fewer than ${privacy.kMin} distinct users, so results could identify individuals. No data was sent to 0G.`,
      distinct_users_bucket: `<${privacy.kMin}`,
      privacy,
    };
  }
  if (!(privacy.epsilon > 0)) throw new ZeroGError("epsilon must be > 0", 400, "bad_privacy_params");

  const receipts: InferenceReceipt[] = [];

  // 2. Label items in batches with batch-local refs.
  const itemLabels: string[] = new Array(input.items.length).fill(NOT_RELEVANT);
  const batches: number[][] = [];
  for (let i = 0; i < input.items.length; i += BATCH) batches.push(Array.from({ length: Math.min(BATCH, input.items.length - i) }, (_, k) => i + k));
  const labelled = await Promise.all(
    batches.map(async (idx) => {
      const payload = {
        question,
        items: idx.map((itemIdx, k) => ({ ref: `r${k + 1}`, text: (input.items[itemIdx]?.excerpts ?? []).join(" / ").slice(0, 1200) })),
      };
      const { data, receipt } = await sealedJson(LABEL_SYSTEM, JSON.stringify(payload), { maxTokens: 2000 });
      return { idx, data, receipt };
    }),
  );
  for (const { idx, data, receipt } of labelled) {
    receipts.push(receipt);
    const rows = (data as { labels?: unknown })?.labels;
    const seen = new Set<string>();
    for (const row of Array.isArray(rows) ? rows : []) {
      const ref = typeof row?.ref === "string" ? row.ref.trim() : "";
      const m = /^r(\d+)$/.exec(ref);
      if (!m || seen.has(ref) || typeof row?.label !== "string") continue;
      const itemIdx = idx[Number(m[1]) - 1];
      if (itemIdx === undefined) continue; // ref the model invented
      seen.add(ref);
      itemLabels[itemIdx] = normaliseLabel(row.label);
    }
  }

  // 3. Group distinct relevant labels into themes (one call).
  const distinct = [...new Set(itemLabels.filter((l) => l !== NOT_RELEVANT))].sort();
  const labelTheme = new Map<string, string>();
  if (distinct.length) {
    const { data, receipt } = await sealedJson(GROUP_SYSTEM, JSON.stringify({ question, labels: distinct }), { maxTokens: 2000 });
    receipts.push(receipt);
    const known = new Set(distinct);
    const themes = (data as { themes?: unknown })?.themes;
    const names = new Set<string>();
    for (const t of Array.isArray(themes) ? themes : []) {
      let name = typeof t?.name === "string" ? normaliseLabel(t.name) : "";
      if (!name || name === NOT_RELEVANT) name = OTHER;
      if (name !== OTHER && !names.has(name)) {
        if (names.size >= MAX_THEMES) name = OTHER; // over the cap: fold into "other"
        else names.add(name);
      }
      for (const raw of Array.isArray(t?.labels) ? t.labels : []) {
        if (typeof raw !== "string") continue;
        const l = known.has(raw) ? raw : normaliseLabel(raw);
        if (known.has(l) && !labelTheme.has(l)) labelTheme.set(l, name);
      }
    }
  }
  const themeOf = (label: string) => (label === NOT_RELEVANT ? NOT_RELEVANT : (labelTheme.get(label) ?? OTHER));

  // 4. One vote per user: the user's majority theme among relevant items, ties -> first item.
  const perUser = new Map<string, string[]>();
  input.items.forEach((it, i) => {
    const list = perUser.get(it.user_ref) ?? [];
    list.push(themeOf(itemLabels[i] ?? NOT_RELEVANT));
    perUser.set(it.user_ref, list);
  });
  const exact = new Map<string, number>();
  for (const themes of perUser.values()) {
    const vote = majority(themes.filter((t) => t !== NOT_RELEVANT));
    if (vote) exact.set(vote, (exact.get(vote) ?? 0) + 1);
  }

  // Noise once per theme, in sorted order so a seeded rng is reproducible.
  const noised = new Map<string, number>();
  for (const name of [...exact.keys()].sort()) {
    noised.set(name, Math.max(0, Math.round((exact.get(name) ?? 0) + laplace(1 / privacy.epsilon, rng))));
  }
  let other = 0;
  const big: { name: string; count: number }[] = [];
  for (const [name, count] of noised) {
    if (name === OTHER || count < privacy.smallCell) other += count;
    else big.push({ name, count });
  }
  big.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  if (other > 0) big.push({ name: OTHER, count: other });
  const total = big.reduce((s, t) => s + t.count, 0);
  if (total === 0) {
    return {
      status: "refused",
      analysisId,
      reason: "Not enough relevant signal in this cohort to report any theme.",
      distinct_users_bucket: cohortBucket(users.size),
      privacy,
    };
  }
  const themes: InsightTheme[] = big.map((t) => ({ name: t.name, share_pct: Math.round((t.count / total) * 1000) / 10 }));
  const cohort_bucket = cohortBucket(users.size);

  // 5. Report from the noised shares only.
  const { data, receipt } = await sealedJson(REPORT_SYSTEM, JSON.stringify({ analysisId, question, cohort_bucket, themes }), { maxTokens: 1500 });
  receipts.push(receipt);
  const md = (data as { markdown?: unknown })?.markdown;
  if (typeof md !== "string" || !md.trim()) throw new ZeroGError("Model did not return a report", 502, "invalid_output");

  return { status: "ok", analysisId, cohort_bucket, themes, report_markdown: scrub(md, input.items), receipts, privacy };
}

function majority(themes: string[]): string | undefined {
  const counts = new Map<string, number>();
  for (const t of themes) counts.set(t, (counts.get(t) ?? 0) + 1);
  let best: string | undefined;
  let bestN = 0;
  for (const t of themes) {
    const n = counts.get(t) ?? 0;
    if (n > bestN) {
      best = t;
      bestN = n;
    }
  }
  return best;
}

/** Belt and braces: the report model never sees excerpts, but strip any that slipped through. */
function scrub(md: string, items: readonly InsightItem[]): string {
  let out = md;
  for (const it of items) {
    out = out.split(it.user_ref).join("[removed]");
    for (const e of it.excerpts) if (e.length >= 16) out = out.split(e).join("[removed]");
  }
  return out;
}
