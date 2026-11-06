import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Connection to the demo API (apps/server/src/api.ts), which moves real HBAR on
 * Hedera testnet. If it is not running, the app falls back to simulated mode.
 */
const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
export const API_URL = env["VITE_API_URL"] ?? "http://localhost:4021";

export type Accounts = { treasury: string; agent: string; seller: string; topic: string };
export type Balances = { agent: number; seller: number; treasury: number; owedToSeller: number };
export type Paid = { txId: string; hashscan: string; amountHbar: string; policy?: string[] };
export type Payout = Paid & { scheduleId: string; seller: string };

/** 0G Private Computer evidence for one sealed call (packages/ai/src/zerog.ts). */
export type ZgReceipt = { request_id: string; model: string; tee_verified: boolean | null; provider: string | null; latency_ms: number };
export type UploadAnalysis = {
  extraIdentifiers: { text: string; type: string }[];
  maskedText: string;
  facets: {
    domain_path: string;
    age_band?: string;
    budget_consciousness?: string;
    mentions: { subject: string; events: string[]; price_judgement?: string }[];
  };
  receipt: ZgReceipt;
};
export type RequestFilters = { filters: { domain: string; age?: string; region?: string; event?: string }; receipt: ZgReceipt };
export type InsightResult =
  | { status: "ok"; cohort_bucket: string; themes: { name: string; share_pct: number }[]; receipts: ZgReceipt[]; privacy: { kMin: number; epsilon: number } }
  | { status: "refused"; reason: string };

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new ApiError(body.error ?? `HTTP ${res.status}`, res.status);
  return body;
}

export const api = {
  registerListing: (listingId: string, consentSale: boolean, consentContact: boolean) =>
    call<{ ok: true }>("/api/listings", { method: "POST", body: JSON.stringify({ listingId, consentSale, consentContact }) }),
  patchListing: (listingId: string, patch: { consentSale?: boolean; consentContact?: boolean }) =>
    call<{ ok: true }>(`/api/listings/${listingId}`, { method: "PATCH", body: JSON.stringify(patch) }),
  revokeListing: (listingId: string) => call<{ ok: true }>(`/api/listings/${listingId}`, { method: "DELETE" }),
  buy: (listingId: string, budgetLeftHbar: number) =>
    call<Paid>("/agent/buy", { method: "POST", body: JSON.stringify({ listingId, budgetLeftHbar }) }),
  contact: (listingId: string, message: string, budgetLeftHbar: number) =>
    call<Paid>("/agent/contact", { method: "POST", body: JSON.stringify({ listingId, message, budgetLeftHbar }) }),
  payout: () => call<Payout>("/api/payouts", { method: "POST" }),
  balances: () => call<Balances>("/api/balances"),
  analyseUpload: (maskedText: string) =>
    call<UploadAnalysis>("/api/ai/analyse-upload", { method: "POST", body: JSON.stringify({ maskedText }), signal: AbortSignal.timeout(45000) }),
  parseRequest: (request: string) =>
    call<RequestFilters>("/api/ai/parse-request", { method: "POST", body: JSON.stringify({ request }), signal: AbortSignal.timeout(20000) }),
  insight: () => call<InsightResult>("/api/ai/insight-demo", { method: "POST", body: "{}", signal: AbortSignal.timeout(60000) }),
};

type LiveCtx = {
  live: boolean;
  /** 0G Private Computer reachable with a key configured on the API. */
  zg: boolean;
  checked: boolean;
  accounts: Accounts | null;
  balances: Balances | null;
  /** Refresh balances now and again after the mirror node catches up. */
  refresh: () => void;
};
const Ctx = createContext<LiveCtx>({ live: false, zg: false, checked: false, accounts: null, balances: null, refresh: () => undefined });

export function LiveProvider({ children }: { children: ReactNode }) {
  const [accounts, setAccounts] = useState<Accounts | null>(null);
  const [checked, setChecked] = useState(false);
  const [balances, setBalances] = useState<Balances | null>(null);
  const [zg, setZg] = useState(false);
  const timers = useRef<number[]>([]);

  const load = useCallback(() => {
    api.balances().then(setBalances, () => undefined);
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2500);
    fetch(`${API_URL}/health`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((h: { accounts: Accounts }) => {
        setAccounts(h.accounts);
        load();
        call<{ keyConfigured: boolean }>("/api/ai/status").then((x) => setZg(!!x.keyConfigured), () => setZg(false));
      })
      .catch(() => setAccounts(null))
      .finally(() => {
        clearTimeout(t);
        setChecked(true);
      });
  }, [load]);

  useEffect(() => {
    if (!accounts) return;
    const i = setInterval(load, 10000);
    return () => clearInterval(i);
  }, [accounts, load]);

  const refresh = useCallback(() => {
    load();
    timers.current.forEach(clearTimeout);
    timers.current = [3000, 7000].map((ms) => window.setTimeout(load, ms));
  }, [load]);

  return <Ctx.Provider value={{ live: !!accounts, zg, checked, accounts, balances, refresh }}>{children}</Ctx.Provider>;
}

export const useLive = () => useContext(Ctx);
