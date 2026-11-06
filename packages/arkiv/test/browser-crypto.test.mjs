import assert from "node:assert/strict";
import test from "node:test";
import { sealTo, signListingAction } from "../../../apps/web/src/arkiv.ts";
import { createServiceCrypto } from "../src/service-crypto.ts";

test("the actual browser helper seals data and signs the exact service protocol", async (t) => {
  const previous = globalThis.sessionStorage;
  const saved = new Map();
  globalThis.sessionStorage = { getItem: (key) => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value) };
  t.after(() => { if (previous === undefined) delete globalThis.sessionStorage; else globalThis.sessionStorage = previous; });
  const service = createServiceCrypto(`0x${"1".repeat(64)}`);
  const sealed = await sealTo(service.publicKey, new TextEncoder().encode("private seller metadata"));
  assert.equal(service.open(sealed).toString(), "private seller metadata");
  const body = { consentSale: false, consentContact: true };
  const signature = await signListingAction("lst_test", service.publicKey, "patch", 4, body, true);
  const control = JSON.parse([...saved.values()][0]);
  const key = await crypto.subtle.importKey("jwk", control.publicKey, { name: "ECDSA", namedCurve: "P-256" }, true, ["verify"]);
  const point = `0x${Buffer.from(await crypto.subtle.exportKey("raw", key)).toString("hex")}`;
  assert.equal(service.verify(point, "patch", "lst_test", 4, body, signature), true);
  assert.equal(service.verify(point, "patch", "lst_test", 5, body, signature), false);
  assert.equal(service.verify(point, "revoke", "lst_test", 4, body, signature), false);
});
