import { createCipheriv, createDecipheriv, createECDH, createPublicKey, hkdfSync, randomBytes, verify } from "node:crypto";

const info = Buffer.from("hissa.sealed.v1");
const salt = Buffer.alloc(32);
const hex = (data: Uint8Array) => `0x${Buffer.from(data).toString("hex")}`;
function bytes(value: string): Buffer {
  if (!/^0x(?:[\da-f]{2})+$/i.test(value)) throw new Error("Invalid encrypted bytes");
  return Buffer.from(value.slice(2), "hex");
}
function cipher(key: Uint8Array, data: Uint8Array): Buffer {
  const iv = randomBytes(12);
  const aes = createCipheriv("aes-256-gcm", key, iv);
  return Buffer.concat([iv, aes.update(data), aes.final(), aes.getAuthTag()]);
}
function decipher(key: Uint8Array, data: Buffer): Buffer {
  if (data.length < 28) throw new Error("Invalid encrypted envelope");
  const aes = createDecipheriv("aes-256-gcm", key, data.subarray(0, 12));
  aes.setAuthTag(data.subarray(-16));
  return Buffer.concat([aes.update(data.subarray(12, -16)), aes.final()]);
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)]));
  return value;
}

export function createServiceCrypto(privateKey: string) {
  const service = createECDH("prime256v1");
  const key = bytes(privateKey);
  if (key.length !== 32) throw new Error("SERVICE_PRIVATE_KEY must be a 32-byte P-256 key");
  service.setPrivateKey(key);
  const publicKey = hex(service.getPublicKey());
  return {
    publicKey,
    seal(data: Uint8Array): string {
      const ephemeral = createECDH("prime256v1");
      ephemeral.generateKeys();
      const shared = ephemeral.computeSecret(service.getPublicKey());
      const encryptionKey = Buffer.from(hkdfSync("sha256", shared, salt, info, 32));
      return hex(Buffer.concat([ephemeral.getPublicKey(), cipher(encryptionKey, data)]));
    },
    open(envelope: string): Buffer {
      const packed = bytes(envelope);
      if (packed.length < 93 || packed[0] !== 4) throw new Error("Invalid sealed envelope");
      const shared = service.computeSecret(packed.subarray(0, 65));
      return decipher(Buffer.from(hkdfSync("sha256", shared, salt, info, 32)), packed.subarray(65));
    },
    decryptRecord(recordKey: Uint8Array, envelope: string): Buffer {
      if (recordKey.length !== 32) throw new Error("Invalid record key");
      return decipher(recordKey, bytes(envelope));
    },
    verify(controlKey: string, action: string, id: string, version: number, body: unknown, signature: string): boolean {
      try {
        const point = bytes(controlKey);
        const sig = bytes(signature);
        if (point.length !== 65 || point[0] !== 4 || sig.length !== 64) return false;
        const key = createPublicKey({ format: "jwk", key: {
          kty: "EC", crv: "P-256", x: point.subarray(1, 33).toString("base64url"), y: point.subarray(33).toString("base64url"),
        } });
        const message = JSON.stringify(["hissa.arkiv.v1", 7794095, publicKey.toLowerCase(), action, id, version, canonical(body)]);
        return verify("sha256", Buffer.from(message), { key, dsaEncoding: "ieee-p1363" }, sig);
      } catch { return false; }
    },
  };
}
