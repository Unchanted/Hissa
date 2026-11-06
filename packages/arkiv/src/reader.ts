import { createPublicClient, NoEntityFoundError } from "@arkiv-network/sdk";
import type { Schema, TypeTag, ValueOf } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { asc, eq, gt, type Expression } from "@arkiv-network/sdk/query";
import { key, str, u64, type Schema as ArkivSchema, type StrValue } from "@arkiv-network/sdk/schema";
import { getAddress, http, isAddress, type Address, type Hex } from "viem";
import {
  insightReceiptSchema,
  listingSchema,
  payoutSchema,
  saleSchema,
} from "./schemas.ts";

type Client = ReturnType<typeof createPublicClient>;
type PlainValue<T extends TypeTag> = ValueOf<T>["value"];
type PlainEntity<S extends Schema> = {
  [K in keyof S["columns"]]: PlainValue<S["columns"][K]["type"]>;
} & { entityKey: Hex; expiresAt: bigint };
type TrustedRow = Record<string, unknown> & {
  $key: Hex;
  $owner: Hex;
  $creator: Hex;
  $expiresAt: bigint;
  $creationFlags: { readonly: boolean; permissionlessExtension: boolean };
};
type Page<T> = { items: T[]; next?: string };

export type Listing = PlainEntity<typeof listingSchema>;
export type ListingPreview = Omit<Listing, "ciphertext" | "wrapped_key" | "sealed_seller">;
export type SaleReceipt = PlainEntity<typeof saleSchema>;
export type InsightReceipt = PlainEntity<typeof insightReceiptSchema>;
export type PayoutRecord = PlainEntity<typeof payoutSchema>;
export type ListingFilter = Partial<Pick<
  Listing,
  | "listing_id"
  | "domain"
  | "region"
  | "source"
  | "week"
  | "quality_tier"
  | "consent_insights"
  | "consent_sale"
  | "price"
>>;

const PAGE_SIZE = 100;
const LISTING_FIELDS = {
  $key: true,
  $owner: true,
  $creator: true,
  $expiresAt: true,
  $creationFlags: true,
  listing_id: true,
  domain: true,
  region: true,
  source: true,
  week: true,
  quality_tier: true,
  consent_insights: true,
  consent_sale: true,
  price: true,
  envelope_format: true,
} as const;

class ReaderError extends Error {}
const fail = (message: string) => new ReaderError(message);
const safeFailure = (error: unknown) =>
  error instanceof ReaderError ? error : fail("Arkiv read failed");

function assertTrusted(row: unknown, writer: Address, readonly: boolean): asserts row is TrustedRow {
  if (typeof row !== "object" || row === null) throw fail("Untrusted Arkiv entity");
  const entity = row as Record<string, unknown>;
  const flags = entity.$creationFlags as Record<string, unknown> | undefined;
  if (
    typeof entity.$key !== "string" || !/^0x[\da-f]{64}$/i.test(entity.$key) ||
    typeof entity.$expiresAt !== "bigint" ||
    typeof entity.$creator !== "string" || entity.$creator.toLowerCase() !== writer.toLowerCase() ||
    typeof entity.$owner !== "string" || entity.$owner.toLowerCase() !== writer.toLowerCase() ||
    flags?.readonly !== readonly || flags.permissionlessExtension !== false
  ) throw fail("Untrusted Arkiv entity");
}

function plainEntity(row: TrustedRow, schema: ArkivSchema): Record<string, unknown> {
  const values = Object.fromEntries(
    Object.keys(schema.columns).map((name) => [name, (row[name] as { value: unknown }).value]),
  );
  return { entityKey: row.$key, expiresAt: row.$expiresAt, ...values };
}

function validateCursor(cursor?: string): Hex | undefined {
  if (cursor === undefined) return undefined;
  try {
    if (!/^0x[\da-f]{64}$/i.test(cursor)) throw fail("Invalid pagination cursor");
    return key(cursor as Hex).value;
  } catch {
    throw fail("Invalid pagination cursor");
  }
}

function filterExpressions(filter: ListingFilter): Expression[] {
  if (filter === null || typeof filter !== "object" || Array.isArray(filter)) {
    throw fail("Invalid listing filter");
  }
  const expressions: Expression[] = [];
  for (const [name, value] of Object.entries(filter)) {
    try {
      switch (name) {
        case "domain":
        case "listing_id":
        case "region":
        case "source":
        case "quality_tier":
          if (typeof value !== "string") throw fail("Invalid listing filter");
          expressions.push(eq(name, str(value)));
          break;
        case "week":
        case "price":
          if (typeof value !== "bigint") throw fail("Invalid listing filter");
          expressions.push(eq(name, u64(value)));
          break;
        case "consent_insights":
        case "consent_sale":
          if (typeof value !== "boolean") throw fail("Invalid listing filter");
          expressions.push(eq(name, value));
          break;
        default:
          throw fail("Unsupported listing filter");
      }
    } catch (error) {
      if (error instanceof ReaderError) throw error;
      throw fail("Invalid listing filter");
    }
  }
  return expressions;
}

function checkWriter(writer: string): Address {
  try {
    if (typeof writer !== "string" || !isAddress(writer)) throw fail("Invalid Arkiv reader configuration");
    return getAddress(writer);
  } catch {
    throw fail("Invalid Arkiv reader configuration");
  }
}

function pageKeys(rows: readonly unknown[], previous?: Hex): Hex[] {
  let last = previous?.toLowerCase();
  const keys = rows.map((value) => {
    const entityKey = (value as { $key?: unknown } | null)?.$key;
    if (typeof entityKey !== "string") throw fail("Invalid Arkiv page order");
    const current = entityKey.toLowerCase();
    if (!/^0x[\da-f]{64}$/.test(current) || (last && current <= last)) {
      throw fail("Invalid Arkiv page order");
    }
    last = current;
    return entityKey as Hex;
  });
  return keys;
}

export class ArkivReader {
  private readonly client: Client;
  private readonly writer: Address;

  constructor(client: Client, writer: Address) {
    this.client = client;
    this.writer = checkWriter(writer);
  }

  async getListing(entityKey: Hex): Promise<Listing | null> {
    try {
      const row = await this.client.getEntity(entityKey, listingSchema);
      assertTrusted(row, this.writer, false);
      if (row.$key.toLowerCase() !== entityKey.toLowerCase()) throw fail("Untrusted Arkiv entity");
      if ((await this.client.getBlockNumber({ cacheTime: 0 })) >= row.$expiresAt) return null;
      return plainEntity(row, listingSchema) as unknown as Listing;
    } catch (error) {
      if (error instanceof NoEntityFoundError) return null;
      throw safeFailure(error);
    }
  }

  async queryListings(
    filter: ListingFilter = {},
    cursor?: string,
  ): Promise<Page<ListingPreview>> {
    const expressions = filterExpressions(filter);
    const last = validateCursor(cursor);
    try {
      const base = this.client.select(LISTING_FIELDS);
      if (last) base.where(gt("$key", key(last)));
      if (expressions.length) base.where(...expressions);
      const page = await base
        .from(listingSchema, { onMismatch: "throw" })
        .createdBy(this.writer)
        .ownedBy(this.writer)
        .orderBy(asc("$key"))
        .limit(PAGE_SIZE)
        .fetch();
      pageKeys(page.entities, last);
      const items = page.entities.map((row) => {
        assertTrusted(row, this.writer, false);
        if (row.$expiresAt <= page.blockNumber) throw fail("Untrusted Arkiv entity");
        return {
          entityKey: row.$key,
          expiresAt: row.$expiresAt,
          listing_id: row.listing_id.value,
          domain: row.domain.value,
          region: row.region.value,
          source: row.source.value,
          week: row.week.value,
          quality_tier: row.quality_tier.value,
          consent_insights: row.consent_insights.value,
          consent_sale: row.consent_sale.value,
          price: row.price.value,
          envelope_format: row.envelope_format.value,
        };
      });
      const next = items.length === PAGE_SIZE ? items.at(-1)!.entityKey : undefined;
      return next ? { items, next } : { items };
    } catch (error) {
      throw safeFailure(error);
    }
  }

  listSales(cursor?: string): Promise<Page<SaleReceipt>> {
    return this.list(saleSchema, cursor) as Promise<Page<SaleReceipt>>;
  }

  listInsightReceipts(cursor?: string): Promise<Page<InsightReceipt>> {
    return this.list(insightReceiptSchema, cursor) as Promise<Page<InsightReceipt>>;
  }

  listPayouts(cursor?: string): Promise<Page<PayoutRecord>> {
    return this.list(payoutSchema, cursor) as Promise<Page<PayoutRecord>>;
  }

  async paymentUsed(paymentTx: string): Promise<boolean> {
    let tx: StrValue;
    try {
      tx = str(paymentTx);
    } catch {
      throw fail("Invalid payment identifier");
    }
    try {
      const used = await Promise.all([
        this.hasPayment(saleSchema, tx),
        this.hasPayment(insightReceiptSchema, tx),
      ]);
      return used.some(Boolean);
    } catch (error) {
      throw safeFailure(error);
    }
  }

  private async hasPayment(schema: ArkivSchema, paymentTx: StrValue): Promise<boolean> {
    const page = await this.client
      .select({
        $key: true,
        $owner: true,
        $creator: true,
        $expiresAt: true,
        $creationFlags: true,
        payment_tx: true,
      })
      .where(eq("payment_tx", paymentTx))
      .from(schema, { onMismatch: "throw" })
      .createdBy(this.writer)
      .ownedBy(this.writer)
      .limit(1)
      .fetch();
    for (const row of page.entities) {
      assertTrusted(row, this.writer, true);
      if (row.$expiresAt <= page.blockNumber) throw fail("Untrusted Arkiv entity");
    }
    return page.entities.length !== 0;
  }

  private async list(schema: ArkivSchema, cursor?: string): Promise<Page<Record<string, unknown>>> {
    const last = validateCursor(cursor);
    try {
      const base = this.client.select();
      if (last) base.where(gt("$key", key(last)));
      const page = await base
        .from(schema, { onMismatch: "throw" })
        .createdBy(this.writer)
        .ownedBy(this.writer)
        .orderBy(asc("$key"))
        .limit(PAGE_SIZE)
        .fetch();
      const keys = pageKeys(page.entities, last);
      const items = page.entities.map((row) => {
        assertTrusted(row, this.writer, true);
        if (row.$expiresAt <= page.blockNumber) throw fail("Untrusted Arkiv entity");
        return plainEntity(row, schema);
      });
      const next = keys.length === PAGE_SIZE ? keys.at(-1) : undefined;
      return next ? { items, next } : { items };
    } catch (error) {
      throw safeFailure(error);
    }
  }
}

export function createArkivReader({ accessKey, writer }: { accessKey: string; writer: Address }) {
  const trustedWriter = checkWriter(writer);
  if (typeof accessKey !== "string") throw fail("Invalid Arkiv reader configuration");
  try {
    const client = createPublicClient({
      chain: rabdi({ accessKey }),
      cacheTime: 0,
      transport: http(undefined, {
        timeout: 8000,
        retryCount: 0,
        fetchOptions: { cache: "no-store", redirect: "error" },
      }),
    });
    return new ArkivReader(client, trustedWriter);
  } catch {
    throw fail("Invalid Arkiv reader configuration");
  }
}
