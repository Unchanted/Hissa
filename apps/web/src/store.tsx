import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { evmHash, hederaTxId } from "./lib";
import { ACCOUNTS } from "./config";

export type Listing = {
  listingId: string;
  entityKey: string;
  txHash: string;
  block: number;
  consentInsights: boolean;
  consentSale: boolean;
  expiryDays: number;
  publishedAt: number;
  live: boolean;
};

export type ReceiptKind = "listing" | "consent" | "revoke" | "sale" | "insight" | "payout";
export type Receipt = {
  id: string;
  kind: ReceiptKind;
  title: string;
  chain: "arkiv" | "hedera";
  tx: string;
  amount?: number;
  at: number;
  mine?: boolean;
};

export type Report = {
  analysisId: string;
  cohort: number;
  requestIds: string[];
  paymentTx: string;
  receiptTx: string;
  hcsSeq: number;
  contributorsRoot: string;
  includesPriya: boolean;
  at: number;
};

export type Delivered = { listingId: string; paymentTx: string; psn: string; excerpts: string[]; at: number };

export type State = {
  listing: Listing | null;
  receipts: Receipt[];
  earnings: { sales: number; insights: number; paid: number };
  spent: number;
  hcsSeq: number;
  report: Report | null;
  delivered: Delivered | null;
};

const HOUR = 3600_000;
function seedReceipts(): Receipt[] {
  const t = Date.now();
  return [
    { id: "s1", kind: "insight", title: "price-thresholds · cohort 100–249 · ε 1.0", chain: "arkiv", tx: evmHash(), amount: 3, at: t - 5.2 * HOUR },
    { id: "s2", kind: "sale", title: "dm.sale · lst_7f3a · gold", chain: "arkiv", tx: evmHash(), amount: 2, at: t - 4.1 * HOUR },
    { id: "s3", kind: "payout", title: "Batch #41 · 37 accounts", chain: "hedera", tx: hederaTxId(ACCOUNTS.treasury), amount: 18.4, at: t - 3 * HOUR },
    { id: "s4", kind: "insight", title: "switching-triggers · cohort 50–99 · ε 1.0", chain: "arkiv", tx: evmHash(), amount: 3, at: t - 1.6 * HOUR },
    { id: "s5", kind: "sale", title: "dm.sale · lst_91c2 · silver", chain: "arkiv", tx: evmHash(), amount: 1, at: t - 0.7 * HOUR },
  ];
}

const initial = (): State => ({
  listing: null,
  receipts: seedReceipts(),
  earnings: { sales: 0, insights: 0, paid: 0 },
  spent: 0,
  hcsSeq: 13,
  report: null,
  delivered: null,
});

const KEY = "datamarket.demo.v1";
function load(): State {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw) return { ...initial(), ...(JSON.parse(raw) as State) };
  } catch {
    /* storage unavailable: start fresh */
  }
  return initial();
}

type Ctx = {
  state: State;
  update: (fn: (s: State) => State) => void;
  addReceipt: (r: Omit<Receipt, "id" | "at">) => void;
  reset: () => void;
};
const StoreCtx = createContext<Ctx | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(load);

  useEffect(() => {
    try {
      sessionStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }, [state]);

  const update = useCallback((fn: (s: State) => State) => setState(fn), []);
  const addReceipt = useCallback(
    (r: Omit<Receipt, "id" | "at">) =>
      setState((s) => ({ ...s, receipts: [...s.receipts, { ...r, id: Math.random().toString(36).slice(2), at: Date.now() }] })),
    [],
  );
  const reset = useCallback(() => {
    try {
      sessionStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    setState(initial());
  }, []);

  return <StoreCtx.Provider value={{ state, update, addReceipt, reset }}>{children}</StoreCtx.Provider>;
}

export function useStore(): Ctx {
  const c = useContext(StoreCtx);
  if (!c) throw new Error("useStore outside provider");
  return c;
}

export const pendingEarnings = (s: State) => s.earnings.sales + s.earnings.insights - s.earnings.paid;
