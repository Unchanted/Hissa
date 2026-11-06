import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { PublicationJournal } from "../src/journal.ts";

const identity = {
  version: 1, chainId: "7794095",
  writer: "0x1111111111111111111111111111111111111111",
  genesisHash: `0x${"a".repeat(64)}`,
};
const payload = {
  listing_id: "one", domain: "technology", region: "IN", source: "chatgpt",
  week: "202645", quality_tier: "gold", consent_insights: false, consent_sale: true,
  price: "1", envelope_format: "application/vnd.arkiv.encrypted.v1",
  ciphertext: `0x${"ab".repeat(40)}`, wrapped_key: "0xab", sealed_seller: "0xab",
  expires_in_seconds: 86400,
};
const entry = { id: "one", payload, salt: "1", status: "intent", nonce: 0, gas: "1000000", gasPrice: "1" };

test("journal persists private intent and prevents simultaneous writer custody", async () => {
  const directory = await mkdtemp(join(tmpdir(), "arkiv-journal-"));
  let journal;
  try {
    journal = await PublicationJournal.open(directory, identity);
    await assert.rejects(PublicationJournal.open(directory, identity));
    await journal.append(structuredClone(entry));
    assert.equal((await stat(directory)).mode & 0o777, 0o700);
    for (const name of ["journal.json", "publisher.lock"]) {
      assert.equal((await stat(join(directory, name))).mode & 0o777, 0o600);
    }
    const saved = JSON.parse(await readFile(join(directory, "journal.json"), "utf8"));
    assert.deepEqual(saved.operations[0], entry);
    await journal.close();
    await assert.rejects(journal.append({ ...structuredClone(entry), id: "after-close" }));
    journal = await PublicationJournal.open(directory, identity);
    assert.deepEqual(journal.entries()[0], entry);
    await journal.close();
    journal = undefined;
    await assert.rejects(PublicationJournal.open(directory, {
      ...identity, genesisHash: `0x${"b".repeat(64)}`,
    }));
  } finally {
    await journal?.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("existing stale lock is preserved for manual recovery", async () => {
  const directory = await mkdtemp(join(tmpdir(), "arkiv-stale-lock-"));
  try {
    const lock = JSON.stringify({ pid: 2147483647, token: "old-writer" });
    await writeFile(join(directory, "publisher.lock"), lock, { mode: 0o600 });
    await assert.rejects(PublicationJournal.open(directory, identity));
    assert.equal(await readFile(join(directory, "publisher.lock"), "utf8"), lock);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("journal rejects malformed verified state and duplicate operation IDs", async () => {
  const directory = await mkdtemp(join(tmpdir(), "arkiv-corrupt-journal-"));
  try {
    for (const operations of [
      [{ ...entry, status: "verified" }],
      [entry, entry],
    ]) {
      await writeFile(join(directory, "journal.json"), JSON.stringify({ ...identity, operations }), { mode: 0o600 });
      await assert.rejects(PublicationJournal.open(directory, identity));
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
