/**
 * 0G Private Computer glue for the web app. 0G never masks: masking runs on the device
 * (see ner.ts). 0G classifies masked text into facets and turns many consenting sellers'
 * records into anonymised analytics. These helpers keep labels and receipts consistent.
 */
import type { ZgReceipt } from "./live";

/** 0G answers "18-24"; the app writes age bands with an en dash. */
export const band = (s: string) => s.replace(/-/g, "–");

/** Tooltip for a real 0G request ID (there is no public explorer page for request IDs). */
export const ZG_NOTE = "0G request ID · sealed (TEE) call · listed in the 0G usage history · click to copy";

export const teeLabel = (r: Pick<ZgReceipt, "tee_verified" | "model">) => `${r.model}${r.tee_verified ? " · TEE ✓" : ""}`;

/** Domains shared by upload facets and buyer filters (same list as packages/ai/src/taxonomy.ts). */
export const DOMAINS = ["beauty", "electronics", "fashion", "food", "finance", "travel", "education", "health", "career", "entertainment", "other"] as const;
