import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { evmHash, hederaTxId } from "./lib";
import { ACCOUNTS } from "./config";
import type { MarketRecord } from "./demo-data";
import type { UploadTags } from "./zerog";

export type Listing = {
  listingId: string;
  entityKey: string;
  txHash: string;
  block: number;
  consentSale: boolean;
  consentContact: boolean;
  expiryDays: number;
  publishedAt: number;
  live: boolean;
};

export type ReceiptKind = "listing" | "consent" | "revoke" | "sale" | "contact" | "payout" | "inference";
export type Receipt = {
  id: string;
  kind: ReceiptKind;
  title: string;
  chain: "arkiv" | "hedera" | "0g";
  tx: string;
  amount?: number;
  at: number;
  /** HashScan link when the payment is real. */
  href?: string;
};

export type Contact = { listingId: string; paymentTx: string; href?: string; message: string; reply: "pending" | "interested" | "ignored"; at: number };

export type State = {
  listing: Listing | null;
  /** Tags from the seller's real 0G analysis; null when it was simulated. */
  upload: UploadTags | null;
  receipts: Receipt[];
  earnings: { sales: number; contacts: number; paid: number };
  spent: number;
  hcsSeq: number;
  bought: (MarketRecord & { paymentTx: string; href?: string })[];
  contact: Contact | null;
};

const HOUR = 3600_000;
function seedReceipts(): Receipt[] {
  const t = Date.now();
  return [
    { id: "s1", kind: "sale", title: "lst_7f3a · gold", chain: "arkiv", tx: evmHash(), amount: 2, at: t - 4.1 * HOUR },
    { id: "s2", kind: "payout", title: "Batch #41 · 37 sellers", chain: "hedera", tx: hederaTxId(ACCOUNTS.treasury), amount: 18.4, at: t - 3 * HOUR },
    { id: "s3", kind: "sale", title: "lst_91c2 · silver", chain: "arkiv", tx: evmHash(), amount: 1, at: t - 0.7 * HOUR },
  ];
}

const initial = (): State => ({
  listing: null,
  upload: null,
  receipts: seedReceipts(),
  earnings: { sales: 0, contacts: 0, paid: 0 },
  spent: 0,
  hcsSeq: 13,
  bought: [],
  contact: null,
});

const KEY = "hissa.demo.v3";
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

export const pendingEarnings = (s: State) => s.earnings.sales + s.earnings.contacts - s.earnings.paid;
