/**
 * 0G Private Computer client (Router, OpenAI-compatible), sealed mode only.
 * Every call sends `X-0G-Provider-Trust-Mode: private` (TeeML providers only: the model runs
 * inside an Intel TDX enclave) and `verify_tee: true`, and returns a receipt with the request
 * ID judges can check. If no sealed provider is available the Router answers 503 and we try the
 * next private model; we never fall back to a non-private tier.
 */
import "dotenv/config";

export const ROUTER_URL = (process.env["ZG_ROUTER_URL"] ?? "https://router-api.0g.ai/v1").replace(/\/$/, "");
/** Private (TeeML) chat models with JSON output, tried in order. glm-5.3 has 2 providers; 0gm has 1. */
export const DEFAULT_CHAT_MODELS = ["glm-5.3", "0gm-1.0-35b-a3b"] as const;
/**
 * ZG_CHAT_MODELS (comma-separated) overrides the order, e.g. "0gm-1.0-35b-a3b" for cheap
 * rehearsals. Every model is still called in private (TEE) mode.
 */
export const CHAT_MODELS: readonly string[] = (process.env["ZG_CHAT_MODELS"] ?? "")
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean).length
  ? (process.env["ZG_CHAT_MODELS"] ?? "").split(",").map((m) => m.trim()).filter(Boolean)
  : DEFAULT_CHAT_MODELS;

/** Evidence for one sealed 0G call. */
export type InferenceReceipt = {
  request_id: string; // x_0g_trace.request_id (also in 0G usage history)
  model: string;
  trust_mode: "private";
  tee_verified: boolean | null; // x_0g_trace.tee_verified; false = rejected
  provider: string | null; // x_0g_trace.provider, on-chain provider address
  zg_res_key: string | null; // ZG-Res-Key header, for independent signature checks
  cost_neuron: string | null; // x_0g_trace.billing.total_cost
  latency_ms: number;
};

export class ZeroGError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    /** From the Retry-After header on a 429, if the Router sent one. */
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "ZeroGError";
  }
}

/** Wait before retrying a 429: ZG_RETRY_WAIT_MS (tests/dev) wins, then Retry-After capped at 30s, then 5s. */
function retryWaitMs(err: ZeroGError): number {
  const env = Number(process.env["ZG_RETRY_WAIT_MS"]);
  if (process.env["ZG_RETRY_WAIT_MS"] !== undefined && Number.isFinite(env) && env >= 0) return env;
  if (err.retryAfterMs !== undefined) return Math.min(err.retryAfterMs, 30_000);
  return 5000;
}

function parseRetryAfter(v: string | null): number | undefined {
  if (!v) return undefined;
  const secs = Number(v);
  if (Number.isFinite(secs) && secs >= 0) return secs * 1000;
  const at = Date.parse(v);
  return Number.isNaN(at) ? undefined : Math.max(0, at - Date.now());
}

function apiKey(): string {
  const k = process.env["ZG_API_KEY"]?.trim();
  if (!k) throw new ZeroGError("ZG_API_KEY is not set. Add your 0G Private Computer key (sk-...) to .env.", 401, "missing_key");
  return k;
}

/** One sealed chat call that must return a JSON object. Tries each private model in order. */
export async function sealedJson(
  system: string,
  user: string,
  opts: { models?: readonly string[]; maxTokens?: number } = {},
): Promise<{ data: unknown; receipt: InferenceReceipt }> {
  const key = apiKey();
  const models = opts.models ?? CHAT_MODELS;
  if (models.length === 0) throw new ZeroGError("No private models to try", 400, "no_models");
  const attempts = 2;
  let last: unknown;
  for (const model of models) {
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        return await callOnce(key, model, system, user, opts.maxTokens ?? 4000);
      } catch (e) {
        last = e;
        const err = e as ZeroGError;
        if ([400, 401, 402, 403].includes(err.status)) throw e; // fix the request, don't retry
        if (err.code === "no_provider_for_trust_mode" || err.status === 503) break; // next model, same trust mode
        if (err.status === 429 && attempt < attempts - 1) await new Promise((r) => setTimeout(r, retryWaitMs(err)));
      }
    }
  }
  throw last;
}

async function callOnce(key: string, model: string, system: string, user: string, maxTokens: number) {
  const started = Date.now();
  let res: Response;
  try {
    res = await fetch(`${ROUTER_URL}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
        "X-0G-Provider-Trust-Mode": "private",
      },
      body: JSON.stringify({
        model,
        verify_tee: true,
        temperature: 0,
        max_tokens: maxTokens,
        response_format: { type: "json_object" },
        chat_template_kwargs: { enable_thinking: false },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
      signal: AbortSignal.timeout(120_000),
    });
  } catch (e) {
    throw new ZeroGError(`0G unreachable: ${(e as Error).message}`, 0, "network");
  }
  const body = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) {
    const code: string | undefined = body?.error?.code;
    const msg =
      code === "no_provider_for_trust_mode"
        ? `No sealed (TEE) provider available for ${model} right now`
        : res.status === 402
          ? "0G balance is empty"
          : res.status === 401
            ? "0G API key missing or invalid"
            : res.status === 429
              ? "0G rate limit reached"
              : `0G error ${res.status}: ${body?.error?.message ?? "unknown"}`;
    throw new ZeroGError(msg, res.status, code, res.status === 429 ? parseRetryAfter(res.headers.get("retry-after")) : undefined);
  }
  const trace = body?.x_0g_trace ?? {};
  const receipt: InferenceReceipt = {
    request_id: trace.request_id ?? body?.id ?? "unknown",
    model: body?.model ?? model,
    trust_mode: "private",
    tee_verified: trace.tee_verified ?? null,
    provider: trace.provider ?? null,
    zg_res_key: res.headers.get("zg-res-key"),
    cost_neuron: trace.billing?.total_cost != null ? String(trace.billing.total_cost) : null,
    latency_ms: Date.now() - started,
  };
  if (receipt.tee_verified === false) throw new ZeroGError("Response failed TEE verification; rejected", 502, "tee_verification_failed");
  const data = parseJsonObject(body?.choices?.[0]?.message?.content ?? "");
  if (data === null) throw new ZeroGError("Model did not return a JSON object", 502, "invalid_output");
  return { data, receipt };
}

function parseJsonObject(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}
