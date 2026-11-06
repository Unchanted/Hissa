import { randomBytes, randomUUID } from "node:crypto";
import {
  createPublicClient,
  createWalletClient,
  ExpirationTime,
} from "@arkiv-network/sdk";
import type { Schema } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import type { CreationFlags, Expiry } from "@arkiv-network/sdk/entity";
import { NoEntityFoundError } from "@arkiv-network/sdk";
import {
  MAX_ENTITY_BYTES, MAX_STRING_BYTES, addr, bool, bytes, dec, i32, isArkivValue, isSchema,
  key, str, toValue, u256, u64,
} from "@arkiv-network/sdk/schema";
import { getGasPrice } from "viem/actions";
import { privateKeyToAccount } from "viem/accounts";
import { ENTITY_EVENTS_ABI } from "@arkiv-network/sdk/entity";
import {
  custom,
  decodeEventLog,
  getAddress,
  http,
  keccak256,
  parseTransaction,
  recoverTransactionAddress,
  type Address,
  type Hex,
  type LocalAccount,
  type TransactionSerialized,
} from "viem";
import { ArkivReader } from "./reader.ts";
import { listingSchema } from "./schemas.ts";
import { SerialQueue } from "./serial-queue.ts";
import { estimateWithRequest } from "./estimate.ts";
import {
  JournalError, PublicationJournal, type JournalEntry, type JournalPayload, type OperationJournalPayload,
} from "./journal.ts";

const CHAIN_ID = 7_794_095;
const MAX_EXPIRY_SECONDS = 182 * 24 * 60 * 60;
const MAX_U64 = (1n << 64n) - 1n;
const ENVELOPE_FORMAT = "application/vnd.arkiv.encrypted.v1";
const LISTING_FIELDS = [
  "listing_id", "domain", "region", "source", "week", "quality_tier", "consent_insights",
  "consent_sale", "price", "envelope_format", "ciphertext", "wrapped_key", "sealed_seller",
  "expires_in_seconds",
] as const;
const ARKIV_ADDRESS = "0x4400000000000000000000000000000000000044";

export type NewListing = Omit<import("./reader.ts").Listing, "entityKey" | "expiresAt"> & {
  expires_in_seconds: number;
};

export type PublicationResult = { entityKey: Hex; txHash: Hex; expiresAt: bigint };

export class PublicationError extends Error {
  readonly kind: "invalid" | "conflict" | "unavailable" | "uncertain";
  readonly txHash?: Hex;

  constructor(kind: PublicationError["kind"], txHash?: Hex) {
    super({
      invalid: "Invalid listing publication request",
      conflict: "Listing publication conflicts with existing state",
      unavailable: "Listing publication is unavailable",
      uncertain: "Listing publication needs reconciliation",
    }[kind]);
    this.name = "PublicationError";
    this.kind = kind;
    if (validHash(txHash)) this.txHash = txHash;
  }
}

export type ArkivPublisherConfig = {
  privateKey: Hex;
  accessKey: string;
  journalDirectory: string;
  maxCostWei: bigint;
};

function fail(kind: PublicationError["kind"], txHash?: Hex): never {
  throw new PublicationError(kind, txHash);
}

function validHash(value: unknown): value is Hex {
  return typeof value === "string" && /^0x[\da-f]{64}$/i.test(value);
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function decimalU64(value: unknown): bigint {
  if (typeof value !== "string" || !/^(0|[1-9]\d{0,19})$/.test(value)) fail("invalid");
  const parsed = BigInt(value);
  if (parsed > MAX_U64) fail("invalid");
  return parsed;
}

function listingString(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || Buffer.byteLength(value, "utf8") > MAX_STRING_BYTES) {
    fail("invalid");
  }
  try { str(value); } catch { fail("invalid"); }
  return value;
}

function listingBytes(value: unknown, minimum: number): Hex {
  if (typeof value !== "string" || !/^0x(?:[\da-f]{2})+$/i.test(value)) fail("invalid");
  const length = (value.length - 2) / 2;
  if (length < minimum) fail("invalid");
  try { return bytes(value as Hex).value; } catch { fail("invalid"); }
}

export function parseNewListing(input: unknown): NewListing {
  try {
    if (!record(input) || (Object.getPrototypeOf(input) !== Object.prototype && Object.getPrototypeOf(input) !== null)) {
      fail("invalid");
    }
    const keys = Reflect.ownKeys(input);
    if (keys.length !== LISTING_FIELDS.length || keys.some((key) => typeof key !== "string" || !LISTING_FIELDS.includes(key as typeof LISTING_FIELDS[number]))) {
      fail("invalid");
    }
    if (typeof input.consent_insights !== "boolean" || typeof input.consent_sale !== "boolean" ||
      input.envelope_format !== ENVELOPE_FORMAT || typeof input.expires_in_seconds !== "number" ||
      !Number.isSafeInteger(input.expires_in_seconds) || input.expires_in_seconds <= 0 ||
      input.expires_in_seconds % 2 !== 0 || input.expires_in_seconds > MAX_EXPIRY_SECONDS) fail("invalid");
    const ciphertext = listingBytes(input.ciphertext, 28);
    const wrapped_key = listingBytes(input.wrapped_key, 1);
    const sealed_seller = listingBytes(input.sealed_seller, 1);
    if ((ciphertext.length + wrapped_key.length + sealed_seller.length - 6) / 2 > MAX_ENTITY_BYTES) fail("invalid");
    return Object.freeze({
      listing_id: listingString(input.listing_id),
      domain: listingString(input.domain),
      region: listingString(input.region),
      source: listingString(input.source),
      week: decimalU64(input.week),
      quality_tier: listingString(input.quality_tier),
      consent_insights: input.consent_insights,
      consent_sale: input.consent_sale,
      price: decimalU64(input.price),
      envelope_format: ENVELOPE_FORMAT,
      ciphertext,
      wrapped_key,
      sealed_seller,
      expires_in_seconds: input.expires_in_seconds,
    });
  } catch (error) {
    if (error instanceof PublicationError) throw error;
    throw new PublicationError("invalid");
  }
}

function journalPayload(listing: NewListing): JournalPayload {
  return {
    listing_id: listing.listing_id,
    domain: listing.domain,
    region: listing.region,
    source: listing.source,
    week: listing.week.toString(),
    quality_tier: listing.quality_tier,
    consent_insights: listing.consent_insights,
    consent_sale: listing.consent_sale,
    price: listing.price.toString(),
    envelope_format: listing.envelope_format,
    ciphertext: listing.ciphertext,
    wrapped_key: listing.wrapped_key,
    sealed_seller: listing.sealed_seller,
    expires_in_seconds: listing.expires_in_seconds,
  };
}

function samePayload(left: JournalPayload, right: JournalPayload): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function valuesOf(listing: NewListing) {
  return Object.freeze({
    listing_id: listing.listing_id,
    domain: listing.domain,
    region: listing.region,
    source: listing.source,
    week: u64(listing.week),
    quality_tier: listing.quality_tier,
    consent_insights: listing.consent_insights,
    consent_sale: listing.consent_sale,
    price: u64(listing.price),
    envelope_format: listing.envelope_format,
    ciphertext: bytes(listing.ciphertext),
    wrapped_key: bytes(listing.wrapped_key),
    sealed_seller: bytes(listing.sealed_seller),
  });
}

type ArkivValue = ReturnType<typeof toValue>;

function constructValue(type: string, value: unknown): ArkivValue {
  switch (type) {
    case "addr": return addr(value as string);
    case "bool": return bool(value as boolean);
    case "bytes": return bytes(value as Hex | Uint8Array);
    case "dec": return dec(value as string | number | bigint);
    case "i32": return i32(value as number | bigint);
    case "key": return key(value as Hex | Uint8Array);
    case "str": return str(value as string);
    case "u256": return u256(value as string | number | bigint);
    case "u64": return u64(value as string | number | bigint);
    default: fail("invalid");
  }
}

function normalizeValues(schema: Schema, values: Record<string, unknown>): Readonly<Record<string, ArkivValue>> {
  if (!isSchema(schema) || !record(values) || Array.isArray(values)) fail("invalid");
  const result: Record<string, ArkivValue> = {};
  for (const name of Reflect.ownKeys(values)) {
    if (typeof name !== "string") fail("invalid");
    const value = values[name];
    if (value === undefined) continue;
    const column = schema.columns[name];
    if (!column) fail("invalid");
    const normalized = isArkivValue(value) ? toValue(value) : constructValue(column.type, value);
    if (normalized.type !== column.type) fail("invalid");
    result[name] = normalized;
  }
  return Object.freeze(result);
}

function normalizeCreateOptions(options: { expiration: Expiry; flags: CreationFlags }) {
  if (!record(options) || Object.keys(options).some((key) => key !== "expiration" && key !== "flags") ||
    !record(options.expiration) || !record(options.flags)) fail("invalid");
  const { minLifetime, expiresAt } = options.expiration as Record<string, unknown>;
  if (typeof minLifetime !== "bigint" || !(typeof expiresAt === "bigint" || expiresAt instanceof Date)) fail("invalid");
  const flags = options.flags as Record<string, unknown>;
  if (Object.keys(flags).some((key) => key !== "readonly" && key !== "permissionlessExtension") ||
    (flags.readonly !== undefined && typeof flags.readonly !== "boolean") ||
    (flags.permissionlessExtension !== undefined && typeof flags.permissionlessExtension !== "boolean")) fail("invalid");
  const expiration = Object.freeze({ minLifetime, expiresAt: expiresAt instanceof Date ? new Date(expiresAt) : expiresAt }) as Expiry;
  const frozenFlags = Object.freeze({
    readonly: flags.readonly === true,
    permissionlessExtension: flags.permissionlessExtension === true,
  });
  return Object.freeze({ expiration, flags: frozenFlags });
}

function normalizePatch(schema: Schema, changes: Record<string, unknown>) {
  const set = normalizeValues(schema, changes);
  if (Object.keys(set).length === 0) fail("invalid");
  return Object.freeze({ set, unset: Object.freeze([] as string[]) });
}

function canonicalValue(value: unknown, seen = new Set<object>()): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return { $bigint: value.toString() };
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail("invalid");
    return value;
  }
  if (typeof value === "function" || typeof value === "symbol" || value === undefined) fail("invalid");
  if (value instanceof Uint8Array) return { $bytes: `0x${Buffer.from(value).toString("hex")}` };
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) fail("invalid");
    return { $date: value.toISOString() };
  }
  if (typeof value !== "object" || seen.has(value)) fail("invalid");
  seen.add(value);
  try {
    if (Array.isArray(value)) return value.map((item) => canonicalValue(item, seen));
    if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) fail("invalid");
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    if (keys.some((key) => typeof key !== "string" || !("value" in descriptors[key as string]!))) fail("invalid");
    return Object.fromEntries((keys as string[]).sort().map((key) => [key, canonicalValue(descriptors[key]!.value, seen)]));
  } finally {
    seen.delete(value);
  }
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

function schemaArguments(schema: Schema) {
  if (!isSchema(schema)) fail("invalid");
  return {
    name: schema.name ?? null,
    columns: Object.fromEntries(Object.entries(schema.columns).sort(([a], [b]) => a.localeCompare(b)).map(([name, column]) => [name, {
      type: column.type,
      indexed: column.isIndexed,
      optional: column.isOptional,
      ...(column.defaultValue === undefined ? {} : { defaultValue: column.defaultValue }),
    }])),
  };
}

function operationPayload(operationId: string, operation: OperationJournalPayload["operation"], args: unknown): OperationJournalPayload {
  if (typeof operationId !== "string" || operationId.length === 0 || Buffer.byteLength(operationId, "utf8") > MAX_STRING_BYTES) fail("invalid");
  try { str(operationId); } catch { fail("invalid"); }
  return { operation_id: operationId, operation, arguments: canonicalJson(args) };
}

function sameOperation(left: OperationJournalPayload, right: OperationJournalPayload): boolean {
  return left.operation === right.operation && left.arguments === right.arguments;
}

type ExpectedCall = { from: Address; to: Address; data: Hex; value: bigint };
type SendIntent = {
  entry: JournalEntry;
  expected: ExpectedCall;
  nonce: number;
  gas: bigint;
  gasPrice: bigint;
  attempted: boolean;
};

type OperationKind = "createEntity" | "patchEntity" | "deleteEntity";
type PreparedOperation = {
  payload: JournalPayload;
  operation: OperationKind;
  salt?: bigint;
  flags?: CreationFlags;
  prepare: (client: ReturnType<typeof createWalletClient>) => Promise<unknown>;
  submit: (client: ReturnType<typeof createWalletClient>, txParams: { nonce: number; gas: bigint; gasPrice: bigint }) => Promise<PublicationResult>;
  verify: (result: PublicationResult) => Promise<void>;
};

function transactionCall(value: unknown): ExpectedCall | undefined {
  if (!record(value) || typeof value.from !== "string" || typeof value.to !== "string" ||
    typeof (value.data ?? value.input) !== "string") return undefined;
  try {
    return {
      from: getAddress(value.from),
      to: getAddress(value.to),
      data: (value.data ?? value.input) as Hex,
      value: value.value === undefined ? 0n : BigInt(value.value as string | number | bigint),
    };
  } catch {
    return undefined;
  }
}

function assertConfig(config: ArkivPublisherConfig): void {
  if (!record(config) || typeof config.privateKey !== "string" || !/^0x[\da-f]{64}$/i.test(config.privateKey) ||
    typeof config.accessKey !== "string" ||
    typeof config.journalDirectory !== "string" || config.journalDirectory.length === 0 ||
    typeof config.maxCostWei !== "bigint" || config.maxCostWei <= 0n) fail("invalid");
}

function safeJournalError(error: unknown): PublicationError {
  return error instanceof JournalError
    ? new PublicationError(error.kind)
    : new PublicationError("unavailable");
}

async function checkNetwork(reader: ReturnType<typeof createPublicClient>, genesisHash?: Hex): Promise<Hex> {
  try {
    if (await reader.getChainId() !== CHAIN_ID) fail("conflict");
    const genesis = await reader.getBlock({ blockNumber: 0n });
    if (!genesis?.hash || (genesisHash && genesis.hash.toLowerCase() !== genesisHash.toLowerCase())) fail("conflict");
    return genesis.hash;
  } catch (error) {
    if (error instanceof PublicationError) throw error;
    throw new PublicationError("unavailable");
  }
}

async function txParamsFor(reader: ReturnType<typeof createPublicClient>, address: Address,
  maxCostWei: bigint, estimate: bigint) {
  try {
    if (estimate <= 0n) fail("unavailable");
    const gas = estimate * 2n > 1_000_000n ? estimate * 2n : 1_000_000n;
    const block = await reader.getBlock({ blockTag: "latest" });
    if (typeof block.gasLimit !== "bigint" || block.gasLimit <= 0n || gas > block.gasLimit / 2n) fail("unavailable");
    const nonce = await reader.getTransactionCount({ address, blockTag: "latest" });
    if (await reader.getTransactionCount({ address, blockTag: "pending" }) !== nonce) fail("conflict");
    const gasPrice = await getGasPrice(reader);
    const cost = gas * gasPrice;
    if (cost > maxCostWei || cost > await reader.getBalance({ address })) fail("unavailable");
    return { nonce, gas, gasPrice };
  } catch (error) {
    if (error instanceof PublicationError) throw error;
    throw new PublicationError("unavailable");
  }
}

function validateSigned(raw: Hex, send: SendIntent, account: LocalAccount): Promise<Hex> {
  return (async () => {
    try {
      const tx = parseTransaction(raw as TransactionSerialized);
      const sender = await recoverTransactionAddress({ serializedTransaction: raw as TransactionSerialized });
      if (sender.toLowerCase() !== account.address.toLowerCase() || tx.chainId !== CHAIN_ID ||
        tx.nonce !== send.nonce || tx.gas !== send.gas || tx.gasPrice !== send.gasPrice ||
        tx.to?.toLowerCase() !== ARKIV_ADDRESS.toLowerCase() || tx.data?.toLowerCase() !== send.expected.data.toLowerCase() ||
        (tx.value ?? 0n) !== send.expected.value || send.expected.from.toLowerCase() !== account.address.toLowerCase() ||
        send.expected.to.toLowerCase() !== ARKIV_ADDRESS.toLowerCase()) fail("uncertain");
      return keccak256(raw);
    } catch (error) {
      if (error instanceof PublicationError) throw error;
      throw new PublicationError("uncertain");
    }
  })();
}

async function verifyCanonicalWrite(reader: ReturnType<typeof createPublicClient>, entry: JournalEntry,
  account: LocalAccount, expected: ExpectedCall, result: PublicationResult, operation: OperationKind,
  expectedFlags: number): Promise<{ blockHash: Hex; blockNumber: bigint }> {
  try {
    if (!entry.txHash || entry.nonce === undefined || entry.gas === undefined || entry.gasPrice === undefined ||
      result.txHash.toLowerCase() !== entry.txHash.toLowerCase() || !validHash(result.entityKey)) fail("uncertain", entry.txHash);
    const receipt = await reader.getTransactionReceipt({ hash: entry.txHash });
    if (receipt.status !== "success" || receipt.transactionHash.toLowerCase() !== entry.txHash.toLowerCase() ||
      !receipt.blockHash) fail("uncertain", entry.txHash);
    const [block, tx] = await Promise.all([
      reader.getBlock({ blockNumber: receipt.blockNumber }),
      reader.getTransaction({ hash: entry.txHash }),
    ]);
    const events = receipt.logs.flatMap((log) => {
      if (log.address.toLowerCase() !== ARKIV_ADDRESS.toLowerCase()) return [];
      try {
        const event = decodeEventLog({ abi: ENTITY_EVENTS_ABI, topics: log.topics, data: log.data });
        return [{ log, ...event }];
      } catch { return []; }
    });
    const eventName = operation === "createEntity" ? "EntityCreated" : operation === "patchEntity" ? "EntityPatched" : "EntityDeleted";
    const matching = events.filter((event) => event.eventName === eventName);
    const event = matching[0];
    const args = event?.args as { entityKey?: Hex; owner?: Address; expiresAt?: bigint; creationFlags?: number } | undefined;
    if (!block || block.hash.toLowerCase() !== receipt.blockHash.toLowerCase() ||
      events.length !== 1 || matching.length !== 1 || !args?.entityKey || args.entityKey.toLowerCase() !== result.entityKey.toLowerCase() ||
      args.owner?.toLowerCase() !== account.address.toLowerCase() ||
      (operation === "createEntity" && (args.expiresAt !== result.expiresAt || args.creationFlags !== expectedFlags)) ||
      event!.log.blockHash?.toLowerCase() !== receipt.blockHash.toLowerCase() ||
      event!.log.blockNumber !== receipt.blockNumber ||
      event!.log.transactionHash?.toLowerCase() !== entry.txHash.toLowerCase() ||
      tx.hash.toLowerCase() !== entry.txHash.toLowerCase() || tx.from.toLowerCase() !== account.address.toLowerCase() ||
      tx.nonce !== entry.nonce || tx.to?.toLowerCase() !== ARKIV_ADDRESS.toLowerCase() ||
      tx.input.toLowerCase() !== expected.data.toLowerCase() || tx.value !== 0n ||
      (tx.chainId !== undefined && tx.chainId !== CHAIN_ID) || tx.gas !== BigInt(entry.gas) ||
      tx.gasPrice !== BigInt(entry.gasPrice)) fail("uncertain", entry.txHash);
    return { blockHash: receipt.blockHash, blockNumber: receipt.blockNumber };
  } catch (error) {
    if (error instanceof PublicationError) throw error;
    throw new PublicationError("uncertain", entry.txHash);
  }
}

export async function createArkivPublisher(config: ArkivPublisherConfig) {
  assertConfig(config);
  let account: LocalAccount;
  try { account = privateKeyToAccount(config.privateKey); }
  catch { fail("invalid"); }
  const address = getAddress(account.address);
  const chain = rabdi({ accessKey: config.accessKey });
  if (chain.id !== CHAIN_ID) fail("conflict");
  const rpc = http(undefined, {
    retryCount: 0,
    timeout: 10_000,
    fetchOptions: { cache: "no-store", redirect: "error" },
  })({ chain });
  const readerClient = createPublicClient({ chain, transport: custom(rpc, { retryCount: 0 }), cacheTime: 0 });
  const reader = new ArkivReader(readerClient, address);
  const genesisHash = await checkNetwork(readerClient);
  let journal: PublicationJournal;
  try {
    journal = await PublicationJournal.open(config.journalDirectory, {
      version: 1,
      chainId: String(CHAIN_ID) as "7794095",
      writer: address,
      genesisHash,
    });
  } catch (error) {
    throw safeJournalError(error);
  }
  const unresolved = journal.entries().find((entry) => entry.status !== "verified");
  if (unresolved) {
    await journal.close().catch(() => undefined);
    fail("uncertain", unresolved.txHash);
  }

  let active: SendIntent | undefined;
  const writeTransport = custom({
    request: async (args) => {
      if (args.method === "eth_sendRawTransaction") {
        const send = active;
        const raw = (args.params as readonly unknown[] | undefined)?.[0];
        if (!send || send.attempted || typeof raw !== "string" || !/^0x(?:[\da-f]{2})+$/i.test(raw)) fail("uncertain");
        send.attempted = true;
        const rawTransaction = raw as Hex;
        const txHash = await validateSigned(rawTransaction, send, account);
        await journal.update(send.entry.id, (entry) => Object.assign(entry, {
          status: "submitting", rawTransaction, txHash,
        }));
        send.entry.rawTransaction = rawTransaction;
        send.entry.txHash = txHash;
        send.entry.status = "submitting";
        const response = await rpc.request(args as never);
        if (!validHash(response) || response.toLowerCase() !== txHash.toLowerCase()) fail("uncertain", txHash);
        return response;
      }
      if (args.method === "eth_sendTransaction" || args.method === "wallet_sendCalls") fail("uncertain", active?.entry.txHash);
      return rpc.request(args as never);
    },
  }, { retryCount: 0 });
  const wallet = createWalletClient({ account, chain, transport: writeTransport, cacheTime: 0 });
  const queue = new SerialQueue();
  let closing = false;
  let closePromise: Promise<void> | undefined;

  function assertReady(): void {
    const unresolvedEntry = journal.entries().find((entry) => entry.status !== "verified");
    if (unresolvedEntry) fail("uncertain", unresolvedEntry.txHash);
  }

  function previousOperation(payload: OperationJournalPayload): JournalEntry | undefined {
    const previous = journal.entries().find((entry) => "operation_id" in entry.payload && entry.payload.operation_id === payload.operation_id);
    if (!previous) return undefined;
    if (!sameOperation(previous.payload as OperationJournalPayload, payload)) fail("conflict");
    if (previous.status !== "verified") fail("uncertain", previous.txHash);
    return previous;
  }

  async function executePrepared(operation: PreparedOperation): Promise<PublicationResult> {
    await checkNetwork(readerClient, genesisHash);
    let estimatedCall: ExpectedCall | undefined;
    const capturedRpc = {
      request: async (args: { method: string; params?: readonly unknown[] }) => {
        if (args.method === "eth_estimateGas") estimatedCall = transactionCall(args.params?.[0]);
        return rpc.request(args as never);
      },
    } as Parameters<typeof custom>[0];
    let estimate: bigint;
    try { estimate = await estimateWithRequest(account, chain, capturedRpc, operation.prepare); }
    catch { fail("unavailable"); }
    if (!estimatedCall || estimatedCall.from.toLowerCase() !== address.toLowerCase() ||
      estimatedCall.to.toLowerCase() !== ARKIV_ADDRESS.toLowerCase() || estimatedCall.value !== 0n) fail("unavailable");
    const txParams = await txParamsFor(readerClient, address, config.maxCostWei, estimate);
    await checkNetwork(readerClient, genesisHash);
    const entry: JournalEntry = {
      id: randomUUID(),
      payload: operation.payload,
      ...(operation.salt === undefined ? {} : { salt: operation.salt.toString() }),
      status: "intent",
      nonce: txParams.nonce,
      gas: txParams.gas.toString(),
      gasPrice: txParams.gasPrice.toString(),
    };
    try { await journal.append(entry); }
    catch (error) { throw safeJournalError(error); }

    active = { entry, expected: estimatedCall, nonce: txParams.nonce, gas: txParams.gas,
      gasPrice: txParams.gasPrice, attempted: false };
    const expectedFlags = (operation.flags?.readonly ? 1 : 0) | (operation.flags?.permissionlessExtension ? 2 : 0);
    try {
      const result = await operation.submit(wallet, txParams);
      if (!validHash(result.txHash) || !validHash(result.entityKey) || typeof result.expiresAt !== "bigint") fail("uncertain", entry.txHash);
      const canonical = await verifyCanonicalWrite(readerClient, entry, account, estimatedCall, result, operation.operation, expectedFlags);
      await journal.update(entry.id, (saved) => Object.assign(saved, {
        status: "receipt_confirmed", entityKey: result.entityKey, expiresAt: result.expiresAt.toString(),
        receiptBlockHash: canonical.blockHash, receiptBlockNumber: canonical.blockNumber.toString(),
      }));
      Object.assign(entry, { status: "receipt_confirmed", entityKey: result.entityKey, expiresAt: result.expiresAt.toString(),
        receiptBlockHash: canonical.blockHash, receiptBlockNumber: canonical.blockNumber.toString() });
      await checkNetwork(readerClient, genesisHash);
      await operation.verify(result);
      await journal.update(entry.id, (saved) => { saved.status = "verified"; delete saved.rawTransaction; });
      entry.status = "verified";
      delete entry.rawTransaction;
      return result;
    } catch {
      if (entry.status !== "receipt_confirmed" && entry.status !== "verified") {
        try { await journal.update(entry.id, (saved) => { saved.status = "uncertain"; }); } catch { /* journal remains fail-closed */ }
        entry.status = "uncertain";
      }
      throw new PublicationError("uncertain", entry.txHash);
    } finally {
      active = undefined;
    }
  }

  return {
    reader,
    client: readerClient,
    writer: address,
    publishListing(input: unknown): Promise<PublicationResult> {
      const listing = parseNewListing(input);
      if (closing) return Promise.reject(new PublicationError("unavailable"));
      return queue.run(async () => {
        if (closing) fail("unavailable");
        const payload = journalPayload(listing);
        assertReady();
        const previous = journal.entries().find((entry) => "listing_id" in entry.payload && entry.payload.listing_id === listing.listing_id);
        if (previous) {
          if (!samePayload(previous.payload, payload)) fail("conflict");
          return {
            entityKey: previous.entityKey!,
            txHash: previous.txHash!,
            expiresAt: BigInt(previous.expiresAt!),
          };
        }
        const salt = BigInt(`0x${randomBytes(16).toString("hex")}`);
        const values = valuesOf(listing);
        const options = Object.freeze({
          expiration: ExpirationTime.fromSeconds(listing.expires_in_seconds),
          flags: Object.freeze({ readonly: false, permissionlessExtension: false }),
          salt,
        });
        return executePrepared({
          payload,
          operation: "createEntity",
          salt,
          flags: options.flags,
          prepare: (unsigned) => unsigned.createEntity(listingSchema, values, options),
          submit: (signer, txParams) => signer.createEntity(listingSchema, values, options, txParams),
          verify: async (result) => {
            const observed = await reader.getListing(result.entityKey);
            if (!observed || observed.expiresAt !== result.expiresAt || observed.listing_id !== listing.listing_id ||
              observed.domain !== listing.domain || observed.region !== listing.region || observed.source !== listing.source ||
              observed.week !== listing.week || observed.quality_tier !== listing.quality_tier ||
              observed.consent_insights !== listing.consent_insights || observed.consent_sale !== listing.consent_sale ||
              observed.price !== listing.price || observed.envelope_format !== listing.envelope_format ||
              observed.ciphertext.toLowerCase() !== listing.ciphertext.toLowerCase() ||
              observed.wrapped_key.toLowerCase() !== listing.wrapped_key.toLowerCase() ||
              observed.sealed_seller.toLowerCase() !== listing.sealed_seller.toLowerCase()) fail("uncertain", result.txHash);
          },
        });
      });
    },
    createEntity(operationId: string, schema: Schema, inputValues: Record<string, unknown>, inputOptions: { expiration: Expiry; flags: CreationFlags }): Promise<PublicationResult> {
      const values = normalizeValues(schema, inputValues);
      const options = normalizeCreateOptions(inputOptions);
      const payload = operationPayload(operationId, "createEntity", {
        schema: schemaArguments(schema), values, expiration: options.expiration, flags: options.flags,
      });
      if (closing) return Promise.reject(new PublicationError("unavailable"));
      return queue.run(async () => {
        if (closing) fail("unavailable");
        assertReady();
        const previous = previousOperation(payload);
        if (previous) return { entityKey: previous.entityKey!, txHash: previous.txHash!, expiresAt: BigInt(previous.expiresAt!) };
        const salt = BigInt(`0x${randomBytes(16).toString("hex")}`);
        const optionsWithSalt = Object.freeze({ ...options, salt });
        const flags = options.flags;
        return executePrepared({
          payload, operation: "createEntity", salt, flags,
          prepare: (unsigned) => unsigned.createEntity(schema, values as never, optionsWithSalt),
          submit: (signer, txParams) => signer.createEntity(schema, values as never, optionsWithSalt, txParams),
          verify: async (result) => {
            const row = await readerClient.getEntity(result.entityKey, schema);
            const metadata = row as unknown as Record<string, unknown>;
            const creationFlags = metadata.$creationFlags as { readonly?: unknown; permissionlessExtension?: unknown };
            if (String(metadata.$key).toLowerCase() !== result.entityKey.toLowerCase() ||
              String(metadata.$creator).toLowerCase() !== address.toLowerCase() ||
              String(metadata.$owner).toLowerCase() !== address.toLowerCase() ||
              metadata.$expiresAt !== result.expiresAt || creationFlags?.readonly !== flags.readonly ||
              creationFlags?.permissionlessExtension !== flags.permissionlessExtension) fail("uncertain", result.txHash);
            for (const [name, column] of Object.entries(schema.columns)) {
              const expected = Object.hasOwn(values, name) ? values[name] : column.defaultValue;
              if (expected === undefined ? metadata[name] !== undefined : canonicalJson(metadata[name]) !== canonicalJson(expected)) {
                fail("uncertain", result.txHash);
              }
            }
          },
        });
      });
    },
    patchEntity(operationId: string, schema: Schema, entityKey: Hex, inputChanges: Record<string, unknown>): Promise<{ txHash: Hex }> {
      if (!validHash(entityKey)) fail("invalid");
      const changes = normalizePatch(schema, inputChanges);
      const payload = operationPayload(operationId, "patchEntity", { schema: schemaArguments(schema), entityKey, changes });
      if (closing) return Promise.reject(new PublicationError("unavailable"));
      return queue.run(async () => {
        if (closing) fail("unavailable");
        assertReady();
        const previous = previousOperation(payload);
        if (previous) return { txHash: previous.txHash! };
        return executePrepared({
          payload, operation: "patchEntity",
          prepare: (unsigned) => unsigned.patchEntity(schema, entityKey, changes as never),
          submit: async (signer, txParams) => {
            const result = await signer.patchEntity(schema, entityKey, changes as never, txParams);
            return { entityKey, txHash: result.txHash, expiresAt: 0n };
          },
          verify: async () => {
            const row = await readerClient.getEntity(entityKey, schema);
            const metadata = row as unknown as Record<string, unknown>;
            if (String(metadata.$creator).toLowerCase() !== address.toLowerCase() || String(metadata.$owner).toLowerCase() !== address.toLowerCase()) fail("uncertain");
            for (const [name, value] of Object.entries(changes.set)) {
              if (canonicalJson(metadata[name]) !== canonicalJson(value)) fail("uncertain");
            }
            for (const name of changes.unset) if (metadata[name] !== undefined) fail("uncertain");
          },
        }).then(({ txHash }) => ({ txHash }));
      });
    },
    deleteEntity(operationId: string, entityKey: Hex): Promise<{ txHash: Hex }> {
      if (!validHash(entityKey)) fail("invalid");
      const payload = operationPayload(operationId, "deleteEntity", { entityKey });
      if (closing) return Promise.reject(new PublicationError("unavailable"));
      return queue.run(async () => {
        if (closing) fail("unavailable");
        assertReady();
        const previous = previousOperation(payload);
        if (previous) return { txHash: previous.txHash! };
        return executePrepared({
          payload, operation: "deleteEntity",
          prepare: (unsigned) => unsigned.deleteEntity({ entityKey }),
          submit: async (signer, txParams) => {
            const result = await signer.deleteEntity({ entityKey }, txParams);
            return { entityKey, txHash: result.txHash, expiresAt: 0n };
          },
          verify: async () => {
            try { await readerClient.getEntity(entityKey); fail("uncertain"); }
            catch (error) { if (!(error instanceof NoEntityFoundError)) throw error; }
          },
        }).then(({ txHash }) => ({ txHash }));
      });
    },
    close(): Promise<void> {
      if (!closePromise) {
        closing = true;
        closePromise = queue.run(() => journal.close());
      }
      return closePromise;
    },
  };
}
