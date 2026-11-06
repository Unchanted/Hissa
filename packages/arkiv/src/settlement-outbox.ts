import { createHash } from "node:crypto";
import { chmod, mkdir, open, readFile, readdir, unlink } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { StoredPayment } from "./app-store.ts";

async function sync(path: string) { const handle = await open(path, "r"); try { await handle.sync(); } finally { await handle.close(); } }
function validate(value: unknown): asserts value is StoredPayment {
  const p = value as Partial<StoredPayment> | null;
  if (!p || !["record_purchase", "contact_purchase"].includes(p.kind ?? "") || typeof p.txId !== "string" || !p.txId ||
    typeof p.listing !== "string" || !/^lst_[a-z0-9]{2,64}$/.test(p.listing) || typeof p.amountTinybars !== "string" ||
    !/^[1-9]\d{0,19}$/.test(p.amountTinybars) || typeof p.hashscan !== "string" || typeof p.at !== "string" || !Number.isFinite(Date.parse(p.at))) throw new Error("Invalid settlement outbox entry");
}

/** Retain acknowledged Hedera settlements until their Arkiv receipt is confirmed. */
export async function createSettlementOutbox(directory: string) {
  const first = await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  if (first) {
    const stop = dirname(resolve(first));
    for (let path = resolve(directory); ; path = dirname(path)) { await sync(path); if (path === stop) break; }
  }
  const pathFor = (txId: string) => join(directory, `${createHash("sha256").update(txId).digest("hex")}.json`);
  return {
    async remember(payment: StoredPayment): Promise<StoredPayment> {
      validate(payment);
      const path = pathFor(payment.txId);
      let handle;
      try { handle = await open(path, "wx", 0o600); }
      catch (error) {
        if (!(error && typeof error === "object" && "code" in error && error.code === "EEXIST")) throw new Error("Settlement journal unavailable");
        const existing: unknown = JSON.parse(await readFile(path, "utf8"));
        validate(existing);
        if (existing.txId !== payment.txId || existing.kind !== payment.kind || existing.listing !== payment.listing || existing.amountTinybars !== payment.amountTinybars) throw new Error("Settlement conflicts with saved payment");
        return existing;
      }
      try { await handle.writeFile(JSON.stringify(payment)); await handle.sync(); } finally { await handle.close(); }
      await sync(directory);
      return payment;
    },
    async pending(): Promise<StoredPayment[]> {
      const payments: StoredPayment[] = [];
      for (const name of await readdir(directory)) {
        if (!/^[\da-f]{64}\.json$/.test(name)) throw new Error("Unexpected settlement journal file");
        const payment: unknown = JSON.parse(await readFile(join(directory, name), "utf8"));
        validate(payment);
        if (pathFor(payment.txId) !== join(directory, name)) throw new Error("Settlement journal identity mismatch");
        payments.push(payment);
      }
      return payments;
    },
    async acknowledge(txId: string) {
      try { await unlink(pathFor(txId)); }
      catch (error) { if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw error; }
      await sync(directory);
    },
  };
}
