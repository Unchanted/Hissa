/**
 * Deterministic SYNTHETIC cohort for the premade analysis "abandonment_drivers": why do
 * budget-conscious 18–24s abandon skincare products? Every excerpt is invented and already
 * masked (placeholders like [PERSON_1]); no real person is represented.
 *
 * Shape is skewed on purpose so the demo survives the small-cell rule (themes under 20 users
 * merge into "other"): price is the biggest driver, "no visible results" second, a long tail
 * of smaller reasons, plus a few irrelevant excerpts. Six users have two items, to exercise
 * one-vote-per-user.
 */
import type { InsightItem } from "./insights.js";

export const ABANDONMENT_ANALYSIS_ID = "abandonment_drivers";
export const ABANDONMENT_QUESTION = "Why do budget-conscious 18–24 year olds abandon skincare products?";

type Reason = "expensive" | "cheaper" | "results" | "irritation" | "texture" | "packaging" | "availability" | "irrelevant";

const EXCERPTS: Record<Reason, string[]> = {
  expensive: [
    "the serum is ₹599 for 30ml, way too expensive on a student budget",
    "loved it but cannot justify that price every month",
    "stopped buying once the discount ended, full price is too much",
    "it costs more than my weekly food budget, had to drop it",
    "the refill is almost as pricey as the full bottle, not worth it",
    "honestly just too costly for what it is",
    "price went up again so I quit the sunscreen",
    "my pocket money can't cover a ₹700 moisturiser",
    "too expensive to keep using daily",
    "the combo pack was overpriced so I gave up on the routine",
    "could only afford it once, never repurchased",
  ],
  cheaper: [
    "switched to a cheaper Plum version that works the same",
    "[PERSON_1] showed me a drugstore dupe for half the price",
    "found a local brand with the same niacinamide % for less",
    "moved to a budget alternative I saw on [PLACE_1] market reels",
    "the store brand does the same job at a third of the cost",
    "got a cheaper dupe on Nykaa sale and never went back",
  ],
  results: [
    "used it for 3 weeks and saw no visible results",
    "two bottles in and my dark spots look exactly the same",
    "didn't notice any difference so I stopped",
    "promised glow never showed up, gave up after a month",
    "no change in my acne marks at all",
    "my pores look the same, felt like water",
    "waited 6 weeks for results, nothing happened",
    "zero improvement in texture, not continuing",
    "it just didn't do anything for my skin",
    "results were invisible even after daily use",
    "my tan didn't fade at all, dropped it",
  ],
  irritation: [
    "my skin got irritated and red after the second use",
    "broke out badly around my chin, had to stop",
    "it stung and made my cheeks itchy",
    "gave me tiny bumps all over my forehead",
    "the acid burned a bit, [PERSON_2] told me to quit it",
    "caused breakouts within a week",
    "my sensitive skin reacted with redness",
  ],
  texture: [
    "too sticky, felt heavy under makeup",
    "the smell was really strong and chemical",
    "greasy texture that pilled on my face",
  ],
  packaging: [
    "the pump broke and half the product got stuck",
    "jar packaging felt unhygienic so I stopped",
  ],
  availability: [
    "always out of stock in my city",
    "the shop near [PLACE_2] stopped stocking it",
  ],
  irrelevant: [
    "anyone know a good phone cover brand?",
    "exams next week, wish me luck",
    "watched a great movie last night",
    "my laptop charger stopped working again",
    "looking for a cheap gym near college",
  ],
};

/** Users per reason. Sum = 69 distinct users. "too expensive" alone clears smallCell even if the model keeps "cheaper alternative" as its own theme. */
const PLAN: [Reason, number][] = [
  ["expensive", 22],
  ["cheaper", 6],
  ["results", 23],
  ["irritation", 7],
  ["texture", 3],
  ["packaging", 2],
  ["availability", 2],
  ["irrelevant", 4],
];

/** Users with a second item: [user index, reason of the second item]. */
const SECOND: [number, Reason][] = [
  [0, "expensive"], // price user, price again: still one vote
  [3, "expensive"],
  [30, "results"], // results user, results again
  [20, "results"], // price user who also says no results: tie
  [40, "irritation"], // results user who also mentions irritation: tie
  [52, "expensive"], // irritation user who also mentions price: tie
  // Ties go to the user's first item in the final (interleaved) order, whichever reason that is.
];

function pick(reason: Reason, i: number): string {
  const list = EXCERPTS[reason];
  return list[i % list.length] as string;
}

function build(): InsightItem[] {
  const firstReason: Reason[] = PLAN.flatMap(([r, n]) => Array.from({ length: n }, () => r));
  const items: InsightItem[] = firstReason.map((r, i) => ({
    user_ref: `u_${String(i + 1).padStart(3, "0")}`,
    excerpts: [pick(r, i)],
  }));
  for (const [idx, r] of SECOND) {
    const user = items[idx];
    if (user) items.push({ user_ref: user.user_ref, excerpts: [pick(r, idx + 5)] });
  }
  // Deterministic interleave so a user's two items land in different label batches.
  return items.map((it, i) => ({ it, k: (i * 37) % items.length })).sort((a, b) => a.k - b.k).map((x) => x.it);
}

/** 75 items from 69 distinct synthetic users. */
export const ABANDONMENT_COHORT: readonly InsightItem[] = build();

/**
 * A segment that is too small to analyse: users who bought in the last 7 days (synthetically,
 * every third user, about 22 people). runInsight refuses it before any 0G call.
 */
export function smallAbandonmentCohort(): InsightItem[] {
  return ABANDONMENT_COHORT.filter((it) => Number(it.user_ref.slice(2)) % 3 === 0);
}
