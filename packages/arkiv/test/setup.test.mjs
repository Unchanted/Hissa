import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setupArkiv } from "../scripts/setup.mjs";

test("setup preserves other secrets and reuses its pinned service key", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "hissa-setup-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, ".env"), "EXISTING_SECRET=keep-me\n");
  await setupArkiv(root);
  const first = await readFile(join(root, ".env"), "utf8");
  assert.ok(first.includes("EXISTING_SECRET=keep-me"));
  assert.match(first, /SERVICE_PRIVATE_KEY=0x[\da-f]{64}/);
  await setupArkiv(root);
  assert.equal(await readFile(join(root, ".env"), "utf8"), first);
  await writeFile(join(root, "apps/web/.env.local"), "VITE_SERVICE_PUBLIC_KEY=0xbad\n");
  await assert.rejects(setupArkiv(root));
  assert.equal(await readFile(join(root, ".env"), "utf8"), first);
});
