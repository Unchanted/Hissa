/** Shared fetch stub for the 0G client tests. Synthetic data only; no network. */
import type { TestContext } from "node:test";

export type Call = { url: string; headers: Headers; body: any };
export type Reply = { status?: number; body?: unknown; headers?: Record<string, string>; raw?: string };

export const FAKE_KEY = "sk-test-not-a-real-key";

/** A successful sealed chat completion whose message content is `content`. */
export function ok(content: unknown, trace: Record<string, unknown> = {}, headers: Record<string, string> = {}): Reply {
  return {
    status: 200,
    headers: { "ZG-Res-Key": "res-key-abc", ...headers },
    body: {
      id: "chatcmpl-1",
      model: "glm-5.3",
      choices: [{ message: { role: "assistant", content: typeof content === "string" ? content : JSON.stringify(content) } }],
      x_0g_trace: { request_id: "req-123", provider: "0xProvider", tee_verified: true, billing: { total_cost: 4200 }, ...trace },
    },
  };
}

export function fail(status: number, code?: string, headers: Record<string, string> = {}): Reply {
  return { status, headers, body: { error: { message: `synthetic ${status}`, ...(code ? { code } : {}) } } };
}

/** Replace globalThis.fetch for one test. Replies are used in order; the last one repeats. */
export function stubFetch(t: TestContext, replies: Reply[] | ((call: Call, n: number) => Reply)): Call[] {
  const calls: Call[] = [];
  const impl = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const call: Call = {
      url: String(input),
      headers: new Headers(init?.headers),
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    };
    calls.push(call);
    const r = typeof replies === "function" ? replies(call, calls.length - 1) : (replies[Math.min(calls.length - 1, replies.length - 1)] as Reply);
    return new Response(r.raw ?? JSON.stringify(r.body ?? {}), {
      status: r.status ?? 200,
      headers: { "content-type": "application/json", ...r.headers },
    });
  };
  t.mock.method(globalThis, "fetch", impl as typeof fetch);
  return calls;
}

/** Set env vars for one test and restore them afterwards. */
export function withEnv(t: TestContext, vars: Record<string, string | undefined>): void {
  const before: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vars)) {
    before[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  t.after(() => {
    for (const [k, v] of Object.entries(before)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });
}
