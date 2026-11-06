// Thin Preflight relay for 0G inference. Holds the capped service credential so it never
// reaches the browser. Request and response bodies are never logged or stored.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { PlanDraft, redactionProblem } from '@preflight/shared/hygiene';

const PORT = Number(process.env.PREFLIGHT_SERVER_PORT ?? 8787);
const ROUTER = process.env.ZG_ROUTER_URL ?? 'https://router-api.0g.ai/v1';
const MODEL = process.env.ZG_MODEL ?? '0gm-1.0-35b-a3b';
const TRUST_MODE = (process.env.ZG_TRUST_MODE ?? 'private') as 'private' | 'verified' | 'standard';
const KEY = process.env.ZG_API_KEY ?? '';
const ALLOWED_ORIGINS = (process.env.PREFLIGHT_APP_ORIGINS ?? 'http://localhost:5173').split(',');

const SYSTEM_PROMPT = `You extract a token funding plan from one sentence.
Wallets are referred to only by alias: "A" (the user's source wallet) or "B" (the user's repayment wallet).
Return ONLY a JSON object with exactly these keys:
{"sourceAlias":"A"|"B","destinationAlias":"A"|"B","token":"USDC","fundingAmount":"<decimal string>","repaymentAmount":"<decimal string>"|null}
If the source is not stated, use "A". If no repayment is stated, use null. Do not add any other keys or text.`;

function send(res: ServerResponse, status: number, body: unknown, origin?: string) {
  const headers: Record<string, string> = { 'content-type': 'application/json', 'cache-control': 'no-store' };
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers['access-control-allow-origin'] = origin;
    headers.vary = 'origin';
  }
  res.writeHead(status, headers);
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage, limit = 4096): Promise<string> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) throw new Error('body too large');
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('no JSON object in model output');
  return JSON.parse(text.slice(start, end + 1));
}

/** Keep only routing/verification metadata from the router response. No content. */
function receiptMeta(headers: Headers, json: Record<string, unknown>) {
  const zgHeaders: Record<string, string> = {};
  headers.forEach((v, k) => {
    if (k.startsWith('x-0g') || k === 'x-request-id') zgHeaders[k] = v;
  });
  const extra: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(json)) {
    if (['id', 'model', 'created', 'object', 'usage', 'choices'].includes(k)) continue;
    extra[k] = v; // e.g. provider / verification fields the router may add
  }
  return { zgHeaders, extra };
}

async function extractPlan(text: string) {
  const res = await fetch(`${ROUTER}/chat/completions`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${KEY}`,
      'content-type': 'application/json',
      'X-0G-Provider-Trust-Mode': TRUST_MODE,
    },
    body: JSON.stringify({
      model: MODEL,
      verify_tee: true,
      temperature: 0,
      max_tokens: 2000,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: text },
      ],
    }),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const meta = receiptMeta(res.headers, json);
  const requestId = (json.id as string | undefined) ?? meta.zgHeaders['x-request-id'] ?? null;
  const receipt = {
    schemaVersion: 1 as const,
    requestId,
    model: (json.model as string | undefined) ?? MODEL,
    requestedTier: TRUST_MODE,
    httpStatus: res.status,
    timestamp: new Date().toISOString(),
    status: res.ok ? 'ok' : 'error',
    routerMeta: meta,
  };
  if (!res.ok) {
    const err = (json.error ?? {}) as { code?: string; message?: string };
    return { ok: false as const, receipt, error: err.code ?? `router HTTP ${res.status}` };
  }
  const choices = json.choices as Array<{ message?: { content?: string } }> | undefined;
  const content = choices?.[0]?.message?.content ?? '';
  try {
    const parsed = PlanDraft.safeParse(extractJson(content));
    if (!parsed.success) return { ok: false as const, receipt, error: 'model output failed schema validation' };
    return { ok: true as const, receipt, draft: parsed.data };
  } catch {
    return { ok: false as const, receipt, error: 'model output was not JSON' };
  }
}

const server = createServer(async (req, res) => {
  const origin = req.headers.origin;
  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'access-control-allow-origin': origin && ALLOWED_ORIGINS.includes(origin) ? origin : 'null',
        'access-control-allow-methods': 'POST',
        'access-control-allow-headers': 'content-type',
      });
      return res.end();
    }
    if (req.method === 'GET' && req.url === '/api/health') {
      return send(res, 200, { ok: true, inferenceConfigured: KEY.length > 0, model: MODEL, requestedTier: TRUST_MODE }, origin);
    }
    if (req.method === 'POST' && req.url === '/api/extract-plan') {
      if (!KEY) return send(res, 503, { ok: false, error: 'inference not configured on this server' }, origin);
      const body = JSON.parse(await readBody(req)) as { text?: unknown };
      if (typeof body.text !== 'string') return send(res, 400, { ok: false, error: 'text required' }, origin);
      const problem = redactionProblem(body.text);
      if (problem) return send(res, 400, { ok: false, error: problem }, origin);
      const result = await extractPlan(body.text);
      return send(res, result.ok ? 200 : 502, result, origin);
    }
    send(res, 404, { ok: false, error: 'not found' }, origin);
  } catch (e) {
    send(res, 400, { ok: false, error: (e as Error).message.slice(0, 120) }, origin);
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`preflight relay on http://127.0.0.1:${PORT} (inference ${KEY ? 'configured' : 'NOT configured'}, tier ${TRUST_MODE}, model ${MODEL})`);
});
