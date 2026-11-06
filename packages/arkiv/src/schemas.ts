import { bool, bytes, dec, defineSchema, key, str, u64 } from "@arkiv-network/sdk/schema";

export const listingSchema = defineSchema("dm.listing", {
  listing_id: str().indexed(),
  domain: str().indexed(),
  region: str().indexed(),
  source: str().indexed(),
  week: u64().indexed(),
  quality_tier: str().indexed(),
  consent_insights: bool().indexed(),
  consent_sale: bool().indexed(),
  price: u64().indexed(),
  envelope_format: str(),
  ciphertext: bytes(),
  wrapped_key: bytes(),
  sealed_seller: bytes(),
});

export const saleSchema = defineSchema("dm.sale", {
  listing: key().indexed(),
  buyer_ref: str().indexed(),
  payment_tx: str().indexed(),
  price: u64().indexed(),
});

export const insightReceiptSchema = defineSchema("dm.insight_receipt", {
  spec_hash: str().indexed(),
  analysis_id: str().indexed(),
  domain: str().indexed(),
  cohort_bucket: str().indexed(),
  epsilon: dec().indexed(),
  k_min: u64().indexed(),
  payment_tx: str().indexed(),
  contributors_root: str().indexed(),
  sealed_contributors: bytes(),
});

export const payoutSchema = defineSchema("dm.payout", {
  batch_id: str().indexed(),
  scheduled_tx: str().indexed(),
  sealed_lines: bytes(),
});
