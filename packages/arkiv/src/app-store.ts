import { createHash } from "node:crypto";
import { ExpirationTime } from "@arkiv-network/sdk";
import { asc, eq, gt } from "@arkiv-network/sdk/query";
import { bytes, defineSchema, key, str, u64 } from "@arkiv-network/sdk/schema";
import type { Hex } from "viem";
import { createArkivPublisher, parseNewListing, PublicationError, type ArkivPublisherConfig } from "./publisher.ts";
import { listingSchema } from "./schemas.ts";
import { SerialQueue } from "./serial-queue.ts";
import { createServiceCrypto } from "./service-crypto.ts";

// The running app supports contact payments as well as sales; both share one audit/earnings source.
export const appReceiptSchema = defineSchema("dm.app_receipt.v1", {
  kind: str().indexed(), listing_id: str().indexed(), payment_tx: str().indexed(),
  amount: u64(), at: u64(), sealed_details: bytes(),
});
export const payoutIntentSchema = defineSchema("dm.payout_intent.v1", {
  create_tx: str().indexed(), sealed_lines: bytes(),
});
type Publisher = Awaited<ReturnType<typeof createArkivPublisher>>;
type Seller = { ctl_public_key: string; control_version: number; consent_contact: boolean; consent_deadline: number; payout_account: string };
type ReceiptDetails = { payoutAccount: string; shareTinybars: string; hashscan: string; payoutIntent?: string };
export type StoredPayment = {
  kind: "record_purchase" | "contact_purchase" | "payout"; listing?: string;
  txId: string; hashscan: string; amountTinybars: string; at: string;
};
const encode = (value: unknown) => Buffer.from(JSON.stringify(value));
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const invalid = () => new PublicationError("invalid");
function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
function sellerInfo(value: unknown): Seller {
  if (!object(value) || typeof value.ctl_public_key !== "string" || !/^0x04[\da-f]{128}$/i.test(value.ctl_public_key) ||
    !Number.isSafeInteger(value.control_version) || Number(value.control_version) < 0 || typeof value.consent_contact !== "boolean" ||
    typeof value.consent_deadline !== "number" || !Number.isSafeInteger(value.consent_deadline) || typeof value.payout_account !== "string") throw invalid();
  return value as Seller;
}

export async function createArkivAppStore(config: ArkivPublisherConfig & { serviceKey: string; sellerAccount: string }) {
  const publisher = await createArkivPublisher(config);
  try { return makeArkivAppStore(publisher, config.serviceKey, config.sellerAccount); }
  catch (error) { await publisher.close(); throw error; }
}

/** One instance per writer; the operation queue protects signed versions and earnings scans. */
export function makeArkivAppStore(publisher: Publisher, serviceKey: string, sellerAccount: string) {
  const service = createServiceCrypto(serviceKey);
  const queue = new SerialQueue();
  const sealed = (value: unknown) => bytes(service.seal(encode(value)) as Hex);
  const open = (value: string): unknown => JSON.parse(service.open(value).toString("utf8"));

  async function listing(id: string) {
    if (!/^lst_[a-z0-9]{2,64}$/.test(id)) throw invalid();
    const page = await publisher.reader.queryListings({ listing_id: id });
    if (page.items.length > 1 || page.next) throw new PublicationError("conflict");
    if (!page.items[0]) return null;
    const row = await publisher.reader.getListing(page.items[0].entityKey);
    if (!row) return null;
    const seller = sellerInfo(open(row.sealed_seller));
    if (seller.consent_deadline <= Date.now()) return null;
    return { id, entityKey: row.entityKey, consentSale: row.consent_sale, consentContact: seller.consent_contact,
      live: true, payoutAccount: seller.payout_account, version: seller.control_version, row, seller };
  }

  async function receipts() {
    const rows = [];
    let cursor: Hex | undefined;
    for (let n = 0; n < 20; n++) {
      const base = publisher.client.select();
      if (cursor) base.where(gt("$key", key(cursor)));
      const page = await base.from(appReceiptSchema, { onMismatch: "throw" }).createdBy(publisher.writer).ownedBy(publisher.writer)
        .orderBy(asc("$key")).limit(100).fetch();
      for (const row of page.entities) {
        if (!row.$creationFlags.readonly || row.$creationFlags.permissionlessExtension || row.$expiresAt <= page.blockNumber) throw new PublicationError("unavailable");
        const details = open(row.sealed_details.value);
        if (!object(details) || typeof details.payoutAccount !== "string" || typeof details.shareTinybars !== "string" ||
          !/^\d+$/.test(details.shareTinybars) || typeof details.hashscan !== "string") throw new PublicationError("unavailable");
        rows.push({ key: row.$key, kind: row.kind.value, listing: row.listing_id.value, txId: row.payment_tx.value,
          amount: row.amount.value, at: Number(row.at.value), details: details as ReceiptDetails });
      }
      if (page.entities.length < 100) return rows;
      const next = page.entities.at(-1)!.$key;
      if (cursor && next.toLowerCase() <= cursor.toLowerCase()) throw new PublicationError("unavailable");
      cursor = next;
    }
    throw new PublicationError("unavailable");
  }

  async function earnings(account: string) {
    const rows = await receipts();
    let owed = 0n;
    for (const row of rows) if (row.details.payoutAccount === account) {
      owed += row.kind === "payout" ? -row.amount : BigInt(row.details.shareTinybars);
    }
    if (owed < 0n) throw new PublicationError("conflict");
    return { owed, rows };
  }

  async function recordAction(kind: "listing" | "consent" | "revoke", id: string, txHash: Hex) {
    const found = await publisher.client.select({ $key: true }).where(eq("payment_tx", str(txHash)))
      .from(appReceiptSchema, { onMismatch: "throw" }).createdBy(publisher.writer).ownedBy(publisher.writer).limit(1).fetch();
    if (found.entities.length) return;
    await publisher.createEntity(`activity:${txHash}`, appReceiptSchema, {
      kind, listing_id: id, payment_tx: txHash, amount: u64(0n), at: u64(BigInt(Date.now())),
      sealed_details: sealed({ payoutAccount: sellerAccount, shareTinybars: "0", hashscan: `https://rabdi.explorer.arkiv.network/tx/${txHash}` }),
    }, { expiration: ExpirationTime.max(), flags: { readonly: true, permissionlessExtension: false } });
  }

  async function recordPayment(payment: StoredPayment, payoutIntent?: string) {
    if (!["record_purchase", "contact_purchase", "payout"].includes(payment.kind) ||
      typeof payment.txId !== "string" || !payment.txId || Buffer.byteLength(payment.txId) > 128 ||
      !/^(0|[1-9]\d{0,19})$/.test(payment.amountTinybars) || !Number.isSafeInteger(Date.parse(payment.at))) throw invalid();
    const amount = BigInt(payment.amountTinybars);
    if (amount <= 0n || amount > 2n ** 64n - 1n || (payment.kind === "payout" && !payoutIntent)) throw invalid();
    const prior = await publisher.client.select({ $key: true, kind: true, amount: true, listing_id: true, $creationFlags: true }).where(eq("payment_tx", str(payment.txId)))
      .from(appReceiptSchema, { onMismatch: "throw" }).createdBy(publisher.writer).ownedBy(publisher.writer).limit(2).fetch();
    if (prior.entities.length) {
      if (prior.entities.length !== 1 || !prior.entities[0]!.$creationFlags.readonly || prior.entities[0]!.$creationFlags.permissionlessExtension ||
        prior.entities[0]!.kind.value !== payment.kind || prior.entities[0]!.amount.value !== amount || prior.entities[0]!.listing_id.value !== (payment.listing ?? "")) throw new PublicationError("conflict");
      return { entityKey: prior.entities[0]!.$key };
    }
    const details: ReceiptDetails = { payoutAccount: sellerAccount, shareTinybars: (payment.kind === "payout" ? 0n : amount * 80n / 100n).toString(),
      hashscan: payment.hashscan, ...(payoutIntent ? { payoutIntent } : {}) };
    return publisher.createEntity(`payment:${hash(payment.txId)}`, appReceiptSchema, {
      kind: payment.kind, listing_id: payment.listing ?? "", payment_tx: payment.txId, amount: u64(amount),
      at: u64(BigInt(Date.parse(payment.at))), sealed_details: sealed(details),
    }, { expiration: ExpirationTime.max(), flags: { readonly: true, permissionlessExtension: false } });
  }

  return {
    publicKey: service.publicKey, writer: publisher.writer,
    close: () => queue.run(() => publisher.close()),
    getListing: (id: string) => queue.run(() => listing(id)),
    balance: (account: string) => queue.run(async () => (await earnings(account)).owed),
    recordPayment: (payment: StoredPayment) => queue.run(() => recordPayment(payment)),
    async publish(request: unknown) {
      if (!object(request) || !object(request.listing) || typeof request.signature !== "string") throw invalid();
      const input = request.listing;
      const parsed = parseNewListing(input);
      const seller = sellerInfo(open(parsed.sealed_seller));
      if (seller.control_version !== 0 || seller.payout_account !== sellerAccount || seller.consent_deadline <= Date.now() ||
        seller.consent_deadline > Date.now() + parsed.expires_in_seconds * 1000 + 10000 ||
        !service.verify(seller.ctl_public_key, "publish", parsed.listing_id, 0, input, request.signature)) throw invalid();
      if (service.open(parsed.wrapped_key).length !== 32) throw invalid();
      return queue.run(async () => {
        const existing = await listing(parsed.listing_id);
        if (existing && (existing.seller.ctl_public_key !== seller.ctl_public_key || existing.version !== 0)) throw new PublicationError("conflict");
        const result = await publisher.publishListing(input);
        if (!await publisher.reader.getListing(result.entityKey)) throw new PublicationError("conflict");
        await recordAction("listing", parsed.listing_id, result.txHash);
        return { ok: true as const, listingId: parsed.listing_id, ...result, expiresAt: result.expiresAt.toString(), version: 0 };
      });
    },
    async mutate(id: string, request: unknown, action: "patch" | "revoke") {
      if (!object(request) || typeof request.signature !== "string" || !Number.isSafeInteger(request.version)) throw invalid();
      const body = action === "patch" ? request.patch : {};
      if (!object(body) || Object.keys(body).some((k) => !["consentSale", "consentContact"].includes(k)) ||
        Object.values(body).some((v) => typeof v !== "boolean") || (action === "patch" && !Object.keys(body).length)) throw invalid();
      return queue.run(async () => {
        const found = await listing(id);
        if (!found) throw new PublicationError("conflict");
        if (request.version !== found.version || !service.verify(found.seller.ctl_public_key, action, id, found.version, body, request.signature as string)) throw new PublicationError("conflict");
        const operationId = `${action}:${id}:${found.version}`;
        if (action === "revoke") {
          const result = await publisher.deleteEntity(operationId, found.entityKey);
          await recordAction("revoke", id, result.txHash);
          return { ok: true as const, ...result };
        }
        const seller = { ...found.seller, control_version: found.version + 1,
          ...(typeof body.consentContact === "boolean" ? { consent_contact: body.consentContact } : {}) };
        const changes = { sealed_seller: sealed(seller), ...(typeof body.consentSale === "boolean" ? { consent_sale: body.consentSale } : {}) };
        const result = await publisher.patchEntity(operationId, listingSchema, found.entityKey, changes);
        await recordAction("consent", id, result.txHash);
        return { ok: true as const, ...result, version: seller.control_version };
      });
    },
    async browse(filter: { domain?: string; region?: string }, cursor?: string) {
      return queue.run(async () => {
        const country = filter.region && /^[A-Z]{2}$/.test(filter.region) ? filter.region : undefined;
        const page = await publisher.reader.queryListings({ consent_sale: true, ...(filter.domain ? { domain: filter.domain } : {}),
          ...(!country && filter.region ? { region: filter.region } : {}) }, cursor);
        const items = [];
        for (const preview of page.items) {
          if (country && preview.region !== country && !preview.region.startsWith(`${country}-`)) continue;
          const found = await listing(preview.listing_id);
          if (!found || !found.consentSale) continue;
          items.push({ key: preview.entityKey, listingId: preview.listing_id, domain: preview.domain, source: preview.source, region: preview.region,
            week: preview.week.toString(), contactOk: found.consentContact, signals: [], events: [], excerpt: "", priya: found.payoutAccount === sellerAccount });
        }
        return { items, ...(page.next ? { next: page.next } : {}) };
      });
    },
    readRecord: (id: string) => queue.run(async () => {
      const found = await listing(id);
      if (!found || !found.consentSale) throw new PublicationError("conflict");
      const value: unknown = JSON.parse(service.decryptRecord(service.open(found.row.wrapped_key), found.row.ciphertext).toString("utf8"));
      if (!object(value) || value.v !== 1 || value.listing_id !== id || value.consent_deadline !== found.seller.consent_deadline ||
        value.source !== found.row.source || String(value.week) !== found.row.week.toString() ||
        !Array.isArray(value.excerpts) || value.excerpts.length > 3 || value.excerpts.some((s) => typeof s !== "string" || s.length > 16000)) throw invalid();
      const facets = object(value.facets) ? value.facets : {};
      const mentions = Array.isArray(facets.mentions) ? facets.mentions.filter(object) : [];
      return { listing_id: id, signals: [facets.age_band, facets.budget_consciousness].filter((v): v is string => typeof v === "string"),
        events: mentions.flatMap((m) => Array.isArray(m.events) ? m.events.filter((v): v is string => typeof v === "string") : []),
        excerpt: value.excerpts.join("\n"), source: found.row.source, region: found.row.region, week: found.row.week.toString() };
    }),
    publicReceipts: () => queue.run(async () => ({ items: (await receipts()).map((row) => ({
      id: row.key, arkivEntityKey: row.key, kind: row.kind === "record_purchase" ? "sale" : row.kind === "contact_purchase" ? "contact" : row.kind,
      title: row.kind === "payout" ? "Scheduled payout" : `${row.listing} · ${row.kind === "contact_purchase" ? "message" : row.kind === "record_purchase" ? "record" : row.kind}`,
      chain: ["listing", "consent", "revoke"].includes(row.kind) ? "arkiv" as const : "hedera" as const,
      tx: row.txId, amount: Number(row.amount) / 1e8, at: row.at, href: row.details.hashscan,
    })) })),
    reservePayout: (createTxId: string, expectedAmount: bigint) => queue.run(async () => {
      const { owed, rows } = await earnings(sellerAccount);
      if (owed <= 0n || owed !== expectedAmount) throw new PublicationError("conflict");
      const completed = new Set(rows.map((r) => r.details.payoutIntent).filter(Boolean));
      // Pending reservations survive restart and prevent a second external transfer after uncertainty.
      const pending = await publisher.client.select().from(payoutIntentSchema, { onMismatch: "throw" }).createdBy(publisher.writer).ownedBy(publisher.writer).limit(100).fetch();
      if (pending.entities.length === 100 || pending.entities.some((r) => !completed.has(r.$key))) throw new PublicationError("conflict");
      const result = await publisher.createEntity(`payout-intent:${hash(createTxId)}`, payoutIntentSchema, {
        create_tx: createTxId, sealed_lines: sealed({ account: sellerAccount, amount: owed.toString() }),
      }, { expiration: ExpirationTime.max(), flags: { readonly: true, permissionlessExtension: false } });
      return { amount: owed, intentKey: result.entityKey };
    }),
    completePayout: (payment: StoredPayment, intentKey: string) => queue.run(async () => {
      const intent = await publisher.client.getEntity(intentKey as Hex, payoutIntentSchema);
      const lines = open(intent.sealed_lines.value);
      if (intent.$creator.toLowerCase() !== publisher.writer.toLowerCase() || intent.$owner.toLowerCase() !== publisher.writer.toLowerCase() ||
        !intent.$creationFlags.readonly || !object(lines) || lines.account !== sellerAccount || lines.amount !== payment.amountTinybars) throw new PublicationError("conflict");
      return recordPayment(payment, intentKey);
    }),
  };
}
