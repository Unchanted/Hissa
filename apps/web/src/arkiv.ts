const CHAIN_ID = 7794095;
const ENVELOPE_FORMAT = "application/vnd.arkiv.encrypted.v1";
const encoder = new TextEncoder();
const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};

export type ArkivConfig = { publicKey: string; writer: string; chainId: number };
export type ListingWire = {
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
  ciphertext: string;
  wrapped_key: string;
  sealed_seller: string;
  expires_in_seconds: number;
};
export type SignedUpload = { listing: ListingWire; signature: string };
export type ListingInput = {
  listingId: string;
  source: string;
  week: string;
  domain: string;
  region: string;
  facets: Record<string, unknown>;
  maskedText: string;
  consentSale: boolean;
  consentContact: boolean;
  expiresInDays: number;
  payoutAccount: string;
};

type ControlJwks = { version: 0; publicKey: JsonWebKey; privateKey: JsonWebKey };

export function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  }
  if (value === undefined) throw new Error("Unsupported value in listing signature");
  return value;
}

function hex(bytes: Uint8Array): string {
  return `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function unhex(value: string): Uint8Array {
  if (!/^0x(?:[0-9a-f]{2})+$/i.test(value)) throw new Error("Invalid P-256 public key encoding");
  return Uint8Array.from(value.slice(2).match(/.{2}/g) ?? [], (byte) => Number.parseInt(byte, 16));
}

export function validateServicePublicKey(value: string): string {
  const key = unhex(value.trim());
  if (key.length !== 65 || key[0] !== 4) throw new Error("Arkiv service key must be an uncompressed P-256 public key (65 bytes)");
  return hex(key).toLowerCase();
}

export function validateArkivConfig(config: ArkivConfig): ArkivConfig {
  const pinned = env["VITE_SERVICE_PUBLIC_KEY"]?.trim();
  if (!pinned) throw new Error("VITE_SERVICE_PUBLIC_KEY is missing; generate it with the project setup script and restart the web app.");
  const configuredKey = validateServicePublicKey(config.publicKey);
  if (configuredKey !== validateServicePublicKey(pinned)) throw new Error("Arkiv service public key does not match VITE_SERVICE_PUBLIC_KEY.");
  if (config.chainId !== CHAIN_ID) throw new Error(`Arkiv service chain mismatch: expected ${CHAIN_ID}, received ${config.chainId}.`);
  if (typeof config.writer !== "string" || !config.writer) throw new Error("Arkiv service returned no writer address.");
  return { ...config, publicKey: configuredKey };
}

function controlStorageKey(listingId: string) {
  return `hissa.arkiv.control.v0.${listingId}`;
}

async function controlKey(listingId: string, create: boolean): Promise<ControlJwks> {
  const storageKey = controlStorageKey(listingId);
  try {
    const saved = sessionStorage.getItem(storageKey);
    if (saved) {
      const parsed = JSON.parse(saved) as ControlJwks;
      if (parsed.version !== 0 || !parsed.publicKey || !parsed.privateKey) throw new Error("Invalid saved listing signing key.");
      return parsed;
    }
  } catch (error) {
    if (error instanceof Error && error.message === "Invalid saved listing signing key.") throw error;
    if (!create) throw new Error("The listing signing key is unavailable in this browser session.");
    throw new Error("Browser session storage is unavailable; the listing signing key cannot be saved safely.");
  }
  if (!create) throw new Error("The listing signing key is unavailable in this browser session.");

  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const saved: ControlJwks = {
    version: 0,
    publicKey: await crypto.subtle.exportKey("jwk", pair.publicKey),
    privateKey: await crypto.subtle.exportKey("jwk", pair.privateKey),
  };
  try {
    sessionStorage.setItem(storageKey, JSON.stringify(saved));
  } catch {
    throw new Error("Browser session storage is unavailable; the listing signing key cannot be saved safely.");
  }
  return saved;
}

export async function signListingAction(
  listingId: string,
  servicePublicKey: string,
  action: "publish" | "patch" | "revoke",
  version: number,
  body: unknown,
  createKey = false,
): Promise<string> {
  const saved = await controlKey(listingId, createKey);
  const key = await crypto.subtle.importKey("jwk", saved.privateKey, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const message = JSON.stringify(["hissa.arkiv.v1", CHAIN_ID, validateServicePublicKey(servicePublicKey), action, listingId, version, canonical(body)]);
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, encoder.encode(message));
  return hex(new Uint8Array(signature));
}

export async function sealTo(servicePublicKey: string, plaintext: Uint8Array): Promise<string> {
  const recipient = await crypto.subtle.importKey("raw", new Uint8Array(unhex(validateServicePublicKey(servicePublicKey))), { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ephemeral = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const shared = await crypto.subtle.deriveBits({ name: "ECDH", public: recipient }, ephemeral.privateKey, 256);
  const hkdfKey = await crypto.subtle.importKey("raw", shared, "HKDF", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32), info: encoder.encode("hissa.sealed.v1") },
    hkdfKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new Uint8Array(plaintext)));
  const publicKey = new Uint8Array(await crypto.subtle.exportKey("raw", ephemeral.publicKey));
  const packed = new Uint8Array(publicKey.length + iv.length + ciphertext.length);
  packed.set(publicKey);
  packed.set(iv, publicKey.length);
  packed.set(ciphertext, publicKey.length + iv.length);
  return hex(packed);
}

export async function buildListingUpload(input: ListingInput, config: ArkivConfig): Promise<SignedUpload> {
  const servicePublicKey = validateArkivConfig(config).publicKey;
  if (!Number.isInteger(input.expiresInDays) || input.expiresInDays < 1 || input.expiresInDays > 182) throw new Error("Listing expiry must be between 1 and 182 days.");
  const expiresInSeconds = input.expiresInDays * 86400;
  const week = input.week.replace("-W", "");
  const consentDeadline = Date.now() + expiresInSeconds * 1000;
  const recordKey = crypto.getRandomValues(new Uint8Array(32));
  const aes = await crypto.subtle.importKey("raw", recordKey, { name: "AES-GCM" }, false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const record = {
    v: 1,
    listing_id: input.listingId,
    consent_deadline: consentDeadline,
    source: input.source,
    week,
    facets: input.facets,
    excerpts: input.maskedText.split(/\n+/).map((line) => line.trim()).filter(Boolean).slice(0, 3),
  };
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aes, encoder.encode(JSON.stringify(record))));
  const ciphertext = new Uint8Array(iv.length + encrypted.length);
  ciphertext.set(iv);
  ciphertext.set(encrypted, iv.length);
  const control = await controlKey(input.listingId, true);
  const rawControlKey = new Uint8Array(await crypto.subtle.exportKey("raw", await crypto.subtle.importKey("jwk", control.publicKey, { name: "ECDSA", namedCurve: "P-256" }, true, ["verify"])));
  const sealedSeller = {
    ctl_public_key: hex(rawControlKey),
    control_version: 0,
    consent_contact: input.consentContact,
    consent_deadline: consentDeadline,
    payout_account: input.payoutAccount,
  };
  const wrappedKey = await sealTo(servicePublicKey, recordKey);
  recordKey.fill(0);
  const listing: ListingWire = {
    listing_id: input.listingId,
    domain: input.domain,
    region: input.region,
    source: input.source,
    week,
    quality_tier: "silver",
    consent_insights: false,
    consent_sale: input.consentSale,
    price: "100000000",
    envelope_format: ENVELOPE_FORMAT,
    ciphertext: hex(ciphertext),
    wrapped_key: wrappedKey,
    sealed_seller: await sealTo(servicePublicKey, encoder.encode(JSON.stringify(sealedSeller))),
    expires_in_seconds: expiresInSeconds,
  };
  const signature = await signListingAction(input.listingId, servicePublicKey, "publish", 0, listing);
  return { listing, signature };
}
