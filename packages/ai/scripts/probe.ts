/**
 * Live probe of the 0G Private Computer Router. Keyless checks always run; checks that need
 * ZG_API_KEY are SKIPped without it. Prints PASS/FAIL/SKIP lines and writes
 * evidence/0g-probe.json (no secrets, synthetic text only). Exits 1 if anything FAILs.
 *
 *   npx tsx packages/ai/scripts/probe.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { analyseUpload } from "../src/upload.js";
import { CHAT_MODELS, ROUTER_URL, ZeroGError } from "../src/zerog.js";

type Status = "PASS" | "FAIL" | "SKIP";
type Check = { name: string; status: Status; detail: string; latency_ms?: number; data?: unknown };
const checks: Check[] = [];

function record(name: string, status: Status, detail: string, extra: { latency_ms?: number; data?: unknown } = {}): void {
  checks.push({ name, status, detail, ...extra });
  const lat = extra.latency_ms !== undefined ? ` (${extra.latency_ms} ms)` : "";
  console.log(`${status.padEnd(4)}  ${name}${lat}: ${detail}`);
}

async function timed<T>(fn: () => Promise<T>): Promise<{ value: T; ms: number }> {
  const t0 = Date.now();
  const value = await fn();
  return { value, ms: Date.now() - t0 };
}

const KEY = process.env["ZG_API_KEY"]?.trim() || null;
const PRIVATE_HEADERS = (key: string) => ({
  authorization: `Bearer ${key}`,
  "content-type": "application/json",
  "X-0G-Provider-Trust-Mode": "private",
});

/** One raw private call; returns status, body, interesting headers. Never records the key. */
async function rawPrivateCall(key: string, model: string, content: string, maxTokens: number) {
  const { value: res, ms } = await timed(() =>
    fetch(`${ROUTER_URL}/chat/completions`, {
      method: "POST",
      headers: PRIVATE_HEADERS(key),
      body: JSON.stringify({ model, verify_tee: true, temperature: 0, max_tokens: maxTokens, chat_template_kwargs: { enable_thinking: false }, messages: [{ role: "user", content }] }),
      signal: AbortSignal.timeout(120_000),
    }),
  );
  const body = (await res.json().catch(() => null)) as any;
  const headers: Record<string, string> = {};
  for (const [k, v] of res.headers) if (/^(x-ratelimit-|zg-res-key|x-0g-|retry-after|x-request-id)/i.test(k)) headers[k] = v;
  return { status: res.status, body, headers, ms };
}

// ── 1. Keyless: model list ──────────────────────────────────────────────────────────────────
let teeChat: { id: string; provider_count: number; response_format: boolean; chat_template_kwargs: boolean; tee_type: string | null; tee_verifier: string | null }[] = [];
let nonTeeModel: string | null = null;
try {
  const { value: res, ms } = await timed(() => fetch(`${ROUTER_URL}/models`, { signal: AbortSignal.timeout(30_000) }));
  const list = ((await res.json()) as { data?: any[] }).data ?? [];
  teeChat = list
    .filter((m) => m.verifiability === "TeeML" && m.type === "chatbot")
    .map((m) => ({
      id: m.id,
      provider_count: m.provider_count,
      response_format: (m.supported_parameters ?? []).includes("response_format"),
      chat_template_kwargs: (m.supported_parameters ?? []).includes("chat_template_kwargs"),
      tee_type: m.tee_type ?? null,
      tee_verifier: m.tee_verifier ?? null,
    }));
  const verifiability = (m: any) => m.verifiability ?? null;
  const nonTee = list.filter((m) => m.type === "chatbot" && !["TeeML", "TeeTLS"].includes(verifiability(m)));
  // Prefer a cheap-looking model for the refusal check; any non-TEE chatbot will do.
  nonTeeModel = (nonTee.find((m) => /nano|lite|mini|flash/.test(m.id)) ?? nonTee[0])?.id ?? null;
  record("models.list", res.ok ? "PASS" : "FAIL", `${list.length} models, ${teeChat.length} TeeML chat models`, {
    latency_ms: ms,
    data: { total: list.length, tee_chat_models: teeChat, non_tee_chat_models: nonTee.length },
  });
  for (const m of teeChat) console.log(`        ${m.id.padEnd(22)} providers=${m.provider_count} response_format=${m.response_format} chat_template_kwargs=${m.chat_template_kwargs} tee=${m.tee_type}/${m.tee_verifier}`);
  for (const id of CHAT_MODELS) {
    const m = teeChat.find((x) => x.id === id);
    if (!m) record(`models.${id}`, "FAIL", "not offered as a TeeML chat model");
    else if (!m.response_format || !m.chat_template_kwargs) record(`models.${id}`, "FAIL", `missing params: ${!m.response_format ? "response_format " : ""}${!m.chat_template_kwargs ? "chat_template_kwargs" : ""}`);
    else if (m.provider_count < 1) record(`models.${id}`, "FAIL", "no providers");
    else record(`models.${id}`, "PASS", `TeeML, ${m.provider_count} provider(s), response_format + chat_template_kwargs supported`);
  }
} catch (e) {
  record("models.list", "FAIL", `GET /models failed: ${(e as Error).message}`);
}

// ── 2. Keyless: POST without a key must be refused ─────────────────────────────────────────
try {
  const { value: res, ms } = await timed(() =>
    fetch(`${ROUTER_URL}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", "X-0G-Provider-Trust-Mode": "private" },
      body: JSON.stringify({ model: CHAT_MODELS[0], verify_tee: true, max_tokens: 1, messages: [{ role: "user", content: "ping" }] }),
      signal: AbortSignal.timeout(30_000),
    }),
  );
  const body = (await res.json().catch(() => null)) as any;
  const shape = { status: res.status, body, e2ee_header: res.headers.get("x-0g-e2ee") };
  const good = res.status === 401 && typeof body?.error?.message === "string";
  record("auth.no_key", good ? "PASS" : "FAIL", `status ${res.status}, error.message=${JSON.stringify(body?.error?.message)}, X-0g-E2ee=${shape.e2ee_header}`, { latency_ms: ms, data: shape });
} catch (e) {
  record("auth.no_key", "FAIL", `request failed: ${(e as Error).message}`);
}

// ── 3. Keyed checks ────────────────────────────────────────────────────────────────────────
const KEYED = ["private.<model>", "private.non_tee_refused", "upload.planted_names x3", "ratelimit.parallel5"];
if (!KEY) {
  for (const n of KEYED) record(n, "SKIP", "ZG_API_KEY not set");
} else {
  // 3a. One raw private call per chat model.
  for (const model of CHAT_MODELS) {
    try {
      const r = await rawPrivateCall(KEY, model, 'Reply with the JSON object {"ok":true} and nothing else.', 32);
      const trace = r.body?.x_0g_trace ?? {};
      const reqId = trace.request_id ?? null;
      const resKey = r.headers["zg-res-key"] ?? null;
      const problems = [
        r.status !== 200 && `status ${r.status} ${JSON.stringify(r.body?.error ?? null)}`,
        !reqId && "no x_0g_trace.request_id",
        trace.tee_verified !== true && `tee_verified=${trace.tee_verified}`,
        !resKey && "no ZG-Res-Key header",
      ].filter(Boolean);
      record(`private.${model}`, problems.length ? "FAIL" : "PASS", problems.length ? problems.join("; ") : `request_id=${reqId} provider=${trace.provider} cost=${trace.billing?.total_cost}`, {
        latency_ms: r.ms,
        data: { status: r.status, request_id: reqId, provider: trace.provider ?? null, tee_verified: trace.tee_verified ?? null, zg_res_key_present: !!resKey, cost: trace.billing?.total_cost ?? null, error: r.body?.error ?? null },
      });
    } catch (e) {
      record(`private.${model}`, "FAIL", (e as Error).message);
    }
  }

  // 3b. Private trust mode on a non-TEE model must be refused, never silently served.
  if (!nonTeeModel) record("private.non_tee_refused", "SKIP", "no non-TEE chat model listed");
  else {
    try {
      const r = await rawPrivateCall(KEY, nonTeeModel, "ping", 1);
      const refused = r.status === 503 || r.status === 400;
      record("private.non_tee_refused", refused ? "PASS" : "FAIL", `${nonTeeModel}: status ${r.status} code=${r.body?.error?.code ?? null} message=${JSON.stringify(r.body?.error?.message ?? null)}${r.status === 200 ? " (SERVED: trust-mode downgrade risk)" : ""}`, {
        latency_ms: r.ms,
        data: { model: nonTeeModel, status: r.status, error: r.body?.error ?? null, served: r.status === 200 },
      });
    } catch (e) {
      record("private.non_tee_refused", "FAIL", (e as Error).message);
    }
  }

  // 3c. analyseUpload on a synthetic chat with 5 planted names, 3 runs.
  const NAMES = ["Priya Raghavan", "Arjun Mehta", "Kavita Rao", "Rohan Iyer", "Sneha Kulkarni"];
  const BRANDS = ["Minimalist", "The Ordinary", "Plum", "Nykaa", "Dot & Key"];
  const CHAT = `My friend Priya Raghavan said the Minimalist niacinamide serum is good but too expensive for me.
I used The Ordinary for 3 weeks and saw no results. Arjun Mehta suggested a cheaper Plum one.
Kavita Rao, my dermatologist, told me to avoid strong acids. Rohan Iyer keeps buying everything on Nykaa.
Sneha Kulkarni and I are thinking of Dot & Key sunscreen if there's a sale. Mail me at [EMAIL_1].`;
  for (let i = 1; i <= 3; i++) {
    try {
      const { value: out, ms } = await timed(() => analyseUpload(CHAT));
      const found = new Set(out.extraIdentifiers.map((x) => x.text));
      const recalled = NAMES.filter((n) => [...found].some((f) => f.includes(n) || n.includes(f)) && !out.maskedText.includes(n));
      const brandsFlagged = BRANDS.filter((b) => found.has(b));
      const facetsJson = JSON.stringify(out.facets).toLowerCase();
      const namesInFacets = NAMES.flatMap((n) => n.toLowerCase().split(" ")).filter((part) => facetsJson.includes(part));
      const good = recalled.length === NAMES.length && brandsFlagged.length === 0 && namesInFacets.length === 0 && out.maskedText.includes("[EMAIL_1]");
      record(`upload.planted_names#${i}`, good ? "PASS" : "FAIL", `recall ${recalled.length}/${NAMES.length}, brands flagged [${brandsFlagged.join(", ")}], name parts in facets [${namesInFacets.join(", ")}], model=${out.receipt.model} tee_verified=${out.receipt.tee_verified}`, {
        latency_ms: ms,
        data: { recall: recalled.length, brands_flagged: brandsFlagged, names_in_facets: namesInFacets, identifiers: out.extraIdentifiers, masked_text: out.maskedText, facets: out.facets, receipt: out.receipt },
      });
    } catch (e) {
      const err = e as ZeroGError;
      record(`upload.planted_names#${i}`, "FAIL", `${err.message}${err.code ? ` [${err.code}]` : ""}`);
    }
  }

  // 3d. 5 parallel tiny calls: rate-limit headers and latency.
  try {
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) => rawPrivateCall(KEY, CHAT_MODELS[0], `Reply with {"n":${i}}`, 16).catch((e: Error) => ({ status: 0, body: { error: { message: e.message } }, headers: {} as Record<string, string>, ms: -1 }))),
    );
    const statuses = results.map((r) => r.status);
    const rl = results.map((r) => Object.fromEntries(Object.entries(r.headers).filter(([k]) => /^x-ratelimit-|^retry-after/i.test(k))));
    const anyRl = rl.some((h) => Object.keys(h).length > 0);
    const allOk = statuses.every((s) => s === 200 || s === 429);
    record("ratelimit.parallel5", allOk ? "PASS" : "FAIL", `statuses [${statuses.join(", ")}], latencies [${results.map((r) => r.ms).join(", ")}] ms, rate-limit headers ${anyRl ? JSON.stringify(rl[0]) : "none"}`, {
      data: results.map((r, i) => ({ status: r.status, latency_ms: r.ms, rate_limit: rl[i], request_id: r.body?.x_0g_trace?.request_id ?? null, error: r.body?.error ?? null })),
    });
  } catch (e) {
    record("ratelimit.parallel5", "FAIL", (e as Error).message);
  }
}

// ── Evidence ───────────────────────────────────────────────────────────────────────────────
const summary = { pass: checks.filter((c) => c.status === "PASS").length, fail: checks.filter((c) => c.status === "FAIL").length, skip: checks.filter((c) => c.status === "SKIP").length };
const evidenceDir = new URL("../../../evidence/", import.meta.url);
mkdirSync(evidenceDir, { recursive: true });
writeFileSync(
  new URL("0g-probe.json", evidenceDir),
  JSON.stringify({ at: new Date().toISOString(), router: ROUTER_URL, key_present: !!KEY, input: "synthetic", summary, checks }, null, 2) + "\n",
);
console.log(`\n${summary.pass} PASS, ${summary.fail} FAIL, ${summary.skip} SKIP. Wrote evidence/0g-probe.json`);
process.exit(summary.fail ? 1 : 0);
