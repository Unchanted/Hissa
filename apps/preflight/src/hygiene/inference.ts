import { PlanDraft } from '@preflight/shared/hygiene';

export interface RelayReceipt {
  requestId: string | null;
  model: string;
  requestedTier: string;
  httpStatus: number;
  timestamp: string;
  status: string;
  routerMeta: unknown;
}

export type InferenceOutcome = { ok: true; draft: PlanDraft; receipt: RelayReceipt } | { ok: false; error: string; receipt?: RelayReceipt };

/** Calls the Preflight relay. The relay holds the 0G credential; the browser never does. */
export async function extractPlan(text: string): Promise<InferenceOutcome> {
  try {
    const res = await fetch('/api/extract-plan', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    const body = (await res.json()) as { ok: boolean; draft?: unknown; receipt?: RelayReceipt; error?: string };
    if (!body.ok) return { ok: false, error: body.error ?? `relay HTTP ${res.status}`, ...(body.receipt ? { receipt: body.receipt } : {}) };
    const draft = PlanDraft.safeParse(body.draft);
    if (!draft.success || !body.receipt) return { ok: false, error: 'relay returned an invalid draft' };
    return { ok: true, draft: draft.data, receipt: body.receipt };
  } catch {
    return { ok: false, error: 'Preflight relay unreachable' };
  }
}
