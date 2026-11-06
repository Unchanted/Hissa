import { createECDH, randomUUID } from "node:crypto";
import { chmod, mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parse } from "dotenv";

async function read(path) {
  try { return await readFile(path, "utf8"); }
  catch (error) { if (error.code === "ENOENT") return ""; throw error; }
}
function setValue(text, name, value) {
  const line = `${name}=${value}`;
  return new RegExp(`^${name}=.*$`, "m").test(text)
    ? text.replace(new RegExp(`^${name}=.*$`, "m"), line)
    : `${text}${text.endsWith("\n") || !text ? "" : "\n"}${line}\n`;
}
async function writeConfig(path, text) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    const file = await open(temporary, "wx", 0o600);
    try { await file.writeFile(text); await file.sync(); } finally { await file.close(); }
    await rename(temporary, path);
    const directory = await open(dirname(path), "r");
    try { await directory.sync(); } finally { await directory.close(); }
  } finally { await unlink(temporary).catch(() => undefined); }
}

/** Generate only local encryption configuration; never send a transaction or rotate an existing key. */
export async function setupArkiv(root) {
  const path = resolve(root, ".env");
  const webPath = resolve(root, "apps/web/.env.local");
  let text = await read(path);
  let web = await read(webPath);
  const env = parse(text);
  const ecdh = createECDH("prime256v1");
  if (env.SERVICE_PRIVATE_KEY?.trim()) {
    if (!/^0x[\da-f]{64}$/i.test(env.SERVICE_PRIVATE_KEY)) throw new Error("Existing SERVICE_PRIVATE_KEY has an unsupported format; preserve it and resolve configuration manually");
    ecdh.setPrivateKey(Buffer.from(env.SERVICE_PRIVATE_KEY.slice(2), "hex"));
  } else {
    ecdh.generateKeys();
    text = setValue(text, "SERVICE_PRIVATE_KEY", `0x${ecdh.getPrivateKey().toString("hex").padStart(64, "0")}`);
  }
  const publicKey = `0x${ecdh.getPublicKey().toString("hex")}`;
  const pinned = parse(web).VITE_SERVICE_PUBLIC_KEY;
  if (pinned && pinned.toLowerCase() !== publicKey.toLowerCase()) throw new Error("Existing web service-key pin does not match; no configuration was changed");
  if (!env.ARKIV_MAX_TX_COST_WEI?.trim()) text = setValue(text, "ARKIV_MAX_TX_COST_WEI", "1000000000000000");
  web = setValue(web, "VITE_SERVICE_PUBLIC_KEY", publicKey);
  await mkdir(resolve(root, "apps/web"), { recursive: true });
  await writeConfig(path, text);
  await chmod(path, 0o600);
  await writeConfig(webPath, web);
  await chmod(webPath, 0o600);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await setupArkiv(process.cwd());
  console.log("Arkiv service key and browser pin are configured. No transactions sent. Review ARKIV_MAX_TX_COST_WEI in .env before starting the API; restart Vite to load its pin.");
}
