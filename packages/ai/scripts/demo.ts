/**
 * 0G showcase: a synthetic chat whose names and places were already masked on the device (the
 * web app does this with an in-browser NER model), plus regex masking of emails and phones, then
 * one sealed 0G call classifies it into facets. Prints the 0G receipt and writes
 * evidence/0g-demo-run.json. Synthetic text only.
 *
 *   npx tsx packages/ai/scripts/demo.ts
 */
import { writeFileSync } from "node:fs";
import { analyseUpload } from "../src/upload.js";
import { ROUTER_URL, ZeroGError } from "../src/zerog.js";

const CHAT = `I'm 22 and in my final year, money is tight. My friend [PERSON_1] said the Minimalist niacinamide serum is good but at ₹599 it's too expensive for me.
I used The Ordinary for 3 weeks and saw no visible results, so I stopped. [PERSON_2] suggested a cheaper Plum one.
I live near [PLACE_1] and work part-time at Mehta & Sons Textiles. Dr. [PERSON_3] told me to avoid strong acids because my skin got irritated.
Mail me at priya.student@example.com or call +91 98765 43210. Thinking of Dot & Key sunscreen if there's a sale on Nykaa.`;

// Step 1 (on device in the real app): regex masking of obvious identifiers.
function regexMask(t: string): string {
  let n = 0;
  let p = 0;
  return t
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, () => `[EMAIL_${++n}]`)
    .replace(/(?:\+91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}\b/g, () => `[PHONE_${++p}]`);
}

const step1 = regexMask(CHAT);
console.log("── 1. Regex masking (on device) ─────────────────────────\n" + step1 + "\n");

const tee = await fetch(`${ROUTER_URL}/models`).then((r) => r.json() as Promise<{ data?: any[] }>);
const sealed = (tee.data ?? []).filter((m) => m.verifiability === "TeeML" && m.type === "chatbot").map((m) => `${m.id} (${m.provider_count} provider${m.provider_count === 1 ? "" : "s"})`);
console.log("── 2. Sealed (TEE) chat models on 0G right now ──────────\n" + sealed.join(", ") + "\n");

try {
  const out = await analyseUpload(step1);
  console.log("── 3. Facets from 0G (what the masked text is about) ───────────────────\n" + JSON.stringify(out.facets, null, 2) + "\n");
  console.log("── 4. 0G receipt ────────────────────────────────────────");
  console.log(`  request_id    ${out.receipt.request_id}`);
  console.log(`  model         ${out.receipt.model}  (trust mode: ${out.receipt.trust_mode})`);
  console.log(`  tee_verified  ${out.receipt.tee_verified}`);
  console.log(`  provider      ${out.receipt.provider}`);
  console.log(`  ZG-Res-Key    ${out.receipt.zg_res_key}`);
  console.log(`  latency       ${out.receipt.latency_ms} ms   cost ${out.receipt.cost_neuron} neuron`);
  writeFileSync(new URL("../../../evidence/0g-demo-run.json", import.meta.url), JSON.stringify({ at: new Date().toISOString(), router: ROUTER_URL, input: "synthetic", ...out }, null, 2));
  console.log("\nwrote evidence/0g-demo-run.json");
} catch (e) {
  const err = e as ZeroGError;
  console.error(`0G call failed: ${err.message}${err.code ? ` [${err.code}]` : ""}`);
  process.exit(1);
}
