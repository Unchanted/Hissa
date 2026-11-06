import { chmod, lstat, mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import type { Address, Hex } from "viem";

export type JournalPayload = {
  listing_id: string;
  domain: string;
  region: string;
  source: string;
  week: string;
  quality_tier: string;
  consent_insights: boolean;
  consent_sale: boolean;
  price: string;
  envelope_format: string;
  ciphertext: Hex;
  wrapped_key: Hex;
  sealed_seller: Hex;
  expires_in_seconds: number;
};

export type JournalEntry = {
  id: string;
  payload: JournalPayload;
  salt: string;
  status: "intent" | "submitting" | "receipt_confirmed" | "uncertain" | "verified";
  nonce?: number;
  gas?: string;
  gasPrice?: string;
  rawTransaction?: Hex;
  txHash?: Hex;
  entityKey?: Hex;
  expiresAt?: string;
  receiptBlockHash?: Hex;
  receiptBlockNumber?: string;
};

type JournalData = {
  version: 1;
  chainId: "7794095";
  writer: Address;
  genesisHash: Hex;
  operations: JournalEntry[];
};

export class JournalError extends Error {
  readonly kind: "conflict" | "unavailable";

  constructor(kind: "conflict" | "unavailable") {
    super(kind === "conflict" ? "Writer custody conflict" : "Publication journal unavailable");
    this.name = "JournalError";
    this.kind = kind;
  }
}

function validHex(value: unknown): value is Hex {
  return typeof value === "string" && /^0x(?:[\da-f]{2})+$/i.test(value);
}

function validHash(value: unknown): value is Hex {
  return typeof value === "string" && /^0x[\da-f]{64}$/i.test(value);
}

function validPayload(value: unknown): value is JournalPayload {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return typeof row.listing_id === "string" && typeof row.domain === "string" &&
    typeof row.region === "string" && typeof row.source === "string" &&
    typeof row.week === "string" && typeof row.quality_tier === "string" &&
    typeof row.consent_insights === "boolean" && typeof row.consent_sale === "boolean" &&
    typeof row.price === "string" && typeof row.envelope_format === "string" &&
    validHex(row.ciphertext) && validHex(row.wrapped_key) && validHex(row.sealed_seller) &&
    typeof row.expires_in_seconds === "number" && Number.isSafeInteger(row.expires_in_seconds);
}

function validEntry(value: unknown): value is JournalEntry {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || !validPayload(row.payload) ||
    typeof row.salt !== "string" || !/^\d+$/.test(row.salt) ||
    !["intent", "submitting", "receipt_confirmed", "uncertain", "verified"].includes(String(row.status))) return false;
  if (!Number.isSafeInteger(row.nonce) || (row.nonce as number) < 0) return false;
  if (typeof row.gas !== "string" || !/^\d+$/.test(row.gas)) return false;
  if (typeof row.gasPrice !== "string" || !/^\d+$/.test(row.gasPrice)) return false;
  if (row.rawTransaction !== undefined && !validHex(row.rawTransaction)) return false;
  if (row.txHash !== undefined && !validHash(row.txHash)) return false;
  if (row.entityKey !== undefined && !validHash(row.entityKey)) return false;
  if (row.expiresAt !== undefined && (typeof row.expiresAt !== "string" || !/^\d+$/.test(row.expiresAt))) return false;
  if (row.receiptBlockHash !== undefined && !validHash(row.receiptBlockHash)) return false;
  if (row.receiptBlockNumber !== undefined && (typeof row.receiptBlockNumber !== "string" || !/^\d+$/.test(row.receiptBlockNumber))) return false;
  if (row.status === "intent") return row.rawTransaction === undefined && row.txHash === undefined &&
    row.entityKey === undefined && row.expiresAt === undefined && row.receiptBlockHash === undefined && row.receiptBlockNumber === undefined;
  if (row.status === "submitting") return validHex(row.rawTransaction) && validHash(row.txHash) &&
    row.entityKey === undefined && row.expiresAt === undefined && row.receiptBlockHash === undefined && row.receiptBlockNumber === undefined;
  if (row.status === "receipt_confirmed") return validHex(row.rawTransaction) && validHash(row.txHash) &&
    validHash(row.entityKey) && row.expiresAt !== undefined && validHash(row.receiptBlockHash) && row.receiptBlockNumber !== undefined;
  if (row.status === "verified") return row.rawTransaction === undefined && validHash(row.txHash) &&
    validHash(row.entityKey) && row.expiresAt !== undefined && validHash(row.receiptBlockHash) && row.receiptBlockNumber !== undefined;
  return row.status === "uncertain" && ((row.txHash === undefined && row.rawTransaction === undefined) ||
    (validHash(row.txHash) && validHex(row.rawTransaction))) && row.entityKey === undefined &&
    row.expiresAt === undefined && row.receiptBlockHash === undefined && row.receiptBlockNumber === undefined;
}

function validDataShape(value: unknown): value is JournalData {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return row.version === 1 && row.chainId === "7794095" && typeof row.writer === "string" &&
    validHash(row.genesisHash) && Array.isArray(row.operations) && row.operations.every(validEntry) &&
    new Set(row.operations.map((entry) => (entry as JournalEntry).id)).size === row.operations.length &&
    new Set(row.operations.map((entry) => (entry as JournalEntry).payload.listing_id)).size === row.operations.length;
}

function matchesIdentity(value: JournalData, identity: Omit<JournalData, "operations">): boolean {
  return value.chainId === identity.chainId && value.writer.toLowerCase() === identity.writer.toLowerCase() &&
    value.genesisHash.toLowerCase() === identity.genesisHash.toLowerCase();
}

async function syncDirectory(path: string): Promise<void> {
  const directory = await open(path, "r");
  try { await directory.sync(); } finally { await directory.close(); }
}

async function syncCreatedParents(directory: string, firstCreatedPath: string): Promise<void> {
  let current = resolve(directory);
  const stop = dirname(resolve(firstCreatedPath));
  while (true) {
    await syncDirectory(current);
    if (current === stop) return;
    const parent = dirname(current);
    if (parent === current) throw new JournalError("unavailable");
    current = parent;
  }
}

async function acquireLock(path: string): Promise<{ token: string; close(): Promise<void> }> {
  // shortcut: crashes leave a lock for operator removal after confirming no writer is active; use OS advisory locks for automatic recovery.
  const token = randomUUID();
  let handle;
  try {
    handle = await open(path, "wx", 0o600);
  } catch (error) {
    throw new JournalError(typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST"
      ? "conflict" : "unavailable");
  }
  try {
    await handle.chmod(0o600);
    await handle.writeFile(JSON.stringify({ token }));
    await handle.sync();
  } catch {
    await handle.close().catch(() => undefined);
    await unlink(path).catch(() => undefined);
    throw new JournalError("unavailable");
  }
  return {
    token,
    close: async () => {
      try {
        const current = JSON.parse(await readFile(path, "utf8")) as { token?: unknown };
        if (current.token === token) {
          await unlink(path);
          await syncDirectory(dirname(path));
        }
      } catch (error) {
        if (!(typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT")) {
          throw new JournalError("unavailable");
        }
      } finally {
        await handle.close();
      }
    },
  };
}

export class PublicationJournal {
  private readonly directory: string;
  private readonly path: string;
  private readonly lock: { token: string; close(): Promise<void> };
  private data: JournalData;
  private failed = false;
  private closed = false;

  private constructor(directory: string, lock: { token: string; close(): Promise<void> }, data: JournalData) {
    this.directory = directory;
    this.path = join(directory, "journal.json");
    this.lock = lock;
    this.data = data;
  }

  static async open(directory: string, identity: Omit<JournalData, "operations">): Promise<PublicationJournal> {
    let lock: { token: string; close(): Promise<void> } | undefined;
    try {
      const firstCreatedPath = await mkdir(directory, { recursive: true, mode: 0o700 });
      const dirInfo = await lstat(directory);
      if (!dirInfo.isDirectory() || dirInfo.isSymbolicLink()) throw new JournalError("conflict");
      await chmod(directory, 0o700);
      if (firstCreatedPath) await syncCreatedParents(directory, firstCreatedPath);
      lock = await acquireLock(join(directory, "publisher.lock"));
      const path = join(directory, "journal.json");
      let data: JournalData;
      try {
        const info = await lstat(path);
        if (!info.isFile() || info.isSymbolicLink()) throw new JournalError("unavailable");
        await chmod(path, 0o600);
        const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
        if (!validDataShape(parsed)) throw new JournalError("unavailable");
        if (!matchesIdentity(parsed, identity)) throw new JournalError("conflict");
        data = parsed;
      } catch (error) {
        if (error instanceof JournalError) throw error;
        if (!(typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT")) {
          throw new JournalError("unavailable");
        }
        data = { ...identity, operations: [] };
      }
      const journal = new PublicationJournal(directory, lock, data);
      if (data.operations.length === 0 && !(await PublicationJournal.exists(path))) await journal.persist();
      await syncDirectory(directory);
      return journal;
    } catch (error) {
      if (lock) await lock.close().catch(() => undefined);
      throw error instanceof JournalError ? error : new JournalError("unavailable");
    }
  }

  private static async exists(path: string): Promise<boolean> {
    try { await lstat(path); return true; }
    catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return false;
      throw new JournalError("unavailable");
    }
  }

  entries(): readonly JournalEntry[] {
    return this.data.operations;
  }

  async append(entry: JournalEntry): Promise<void> {
    this.assertUsable();
    this.data.operations.push(entry);
    await this.persist();
  }

  async update(id: string, update: (entry: JournalEntry) => void): Promise<JournalEntry> {
    this.assertUsable();
    const entry = this.data.operations.find((operation) => operation.id === id);
    if (!entry) throw new JournalError("unavailable");
    update(entry);
    await this.persist();
    return entry;
  }

  private assertUsable(): void {
    if (this.failed || this.closed) throw new JournalError("unavailable");
  }

  private async persist(): Promise<void> {
    this.assertUsable();
    const temporary = join(this.directory, `.journal-${randomUUID()}.tmp`);
    try {
      const handle = await open(temporary, "wx", 0o600);
      try {
        await handle.chmod(0o600);
        await handle.writeFile(JSON.stringify(this.data));
        await handle.sync();
      } finally {
        await handle.close();
      }
      await rename(temporary, this.path);
      await chmod(this.path, 0o600);
      await syncDirectory(this.directory);
    } catch {
      this.failed = true;
      await unlink(temporary).catch(() => undefined);
      throw new JournalError("unavailable");
    }
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await this.lock.close();
  }
}
